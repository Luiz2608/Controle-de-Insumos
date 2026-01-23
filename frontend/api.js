class ApiService {

    constructor() {
        if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || window.SUPABASE_CONFIG.url.includes('SUA_URL')) {
            console.warn('⚠️ Supabase não configurado. Verifique o arquivo config.js');
            // Tenta pegar do localStorage se houver (fallback)
            const storedUrl = localStorage.getItem('supabaseUrl');
            const storedKey = localStorage.getItem('supabaseKey');
            if (storedUrl && storedKey) {
                this.supabase = window.supabase.createClient(storedUrl, storedKey);
            } else {
                this.supabase = null;
            }
        } else {
            this.supabase = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.key);
        }

        // URL base da API (backend)
        this.baseUrl = (window.API_CONFIG && window.API_CONFIG.baseUrl) || '';

        this.cache = new Map();
        this.user = null;
        
        // Recuperar sessão
        this.recoverSession();
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };
        
        if (options.body instanceof FormData) {
            delete headers['Content-Type'];
        }

        const config = {
            ...options,
            headers
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('API Request Error:', error);
            return { success: false, message: error.message };
        }
    }

    async recoverSession() {
        if (!this.supabase) return;
        const { data: { session } } = await this.supabase.auth.getSession();
        if (session) {
            this.user = session.user;
            localStorage.setItem('authUser', JSON.stringify(this.user));
            localStorage.setItem('authToken', session.access_token);
        }
    }

    // Helper para verificar configuração
    checkConfig() {
        if (!this.supabase) {
            throw new Error('Supabase não configurado. Por favor, configure o arquivo frontend/config.js com sua URL e Chave do Supabase.');
        }
    }

    // === AUTH ===

    async login(email, password) {
        this.checkConfig();
        // O app original usa username, mas Supabase Auth usa email.
        // Vamos assumir que o "username" é um email ou criar um email fake se for apenas nome
        let emailToUse = email;
        if (!email.includes('@')) {
            emailToUse = `${email}@exemplo.com`; // Adaptação técnica se necessário
        }

        const { data, error } = await this.supabase.auth.signInWithPassword({
            email: emailToUse,
            password: password
        });

        if (error) {
            console.error('Erro no login:', error);
            return { success: false, message: error.message };
        }

        this.user = data.user;
        localStorage.setItem('authUser', JSON.stringify(this.user));
        localStorage.setItem('authToken', data.session.access_token);

        return { success: true, token: data.session.access_token, user: this.user };
    }

    async logout() {
        if (this.supabase) {
            await this.supabase.auth.signOut();
        }
        this.user = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        return { success: true };
    }

    async register(email, password, metadata = {}) {
        this.checkConfig();
        let emailToUse = email;
        if (!email.includes('@')) {
            emailToUse = `${email}@exemplo.com`;
        }

        const { data, error } = await this.supabase.auth.signUp({
            email: emailToUse,
            password: password,
            options: {
                data: metadata
            }
        });

        if (error) {
            return { success: false, message: error.message };
        }

        if (data.session) {
            this.user = data.user;
            localStorage.setItem('authUser', JSON.stringify(this.user));
            localStorage.setItem('authToken', data.session.access_token);
        }

        return { success: true, user: data.user, session: data.session };
    }

    async updateProfile(metadata) {
        this.checkConfig();
        const { data, error } = await this.supabase.auth.updateUser({
            data: metadata
        });

        if (error) {
            return { success: false, message: error.message };
        }

        this.user = data.user;
        localStorage.setItem('authUser', JSON.stringify(this.user));
        return { success: true, user: this.user };
    }

    async me() {
        if (!this.supabase) return { success: false };
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) {
            return { success: true, user };
        }
        return { success: false };
    }

    // === DADOS ===

    async getOxifertil(filters = {}) {
        this.checkConfig();
        
        // 1. Buscar dados da tabela plantio_diario
        const { data: plantioData, error: plantioError } = await this.supabase
            .from('plantio_diario')
            .select('*');
            
        if (plantioError) throw plantioError;

        let oxifertilList = [];
        const processedKeys = new Set();

        plantioData.forEach(record => {
            const frentes = record.frentes || [];
            const frenteInfo = frentes[0] || {};
            const fazendaNome = frenteInfo.fazenda || 'Desconhecida';
            const areaDia = parseFloat(frenteInfo.plantioDiario || frenteInfo.plantada || 0);
            const talhao = frenteInfo.frente || '';
            const dataPlantio = record.data;

            // Verificar se tem Oxifertil na qualidade
            const qualidade = record.qualidade || {};
            const doseOx = parseFloat(qualidade.oxifertilDose || 0);

            if (doseOx > 0) {
                // Filtros em memória
                if (filters.fazenda && filters.fazenda !== 'all' && fazendaNome !== filters.fazenda) return;
                // Filtro de produto para Oxifertil é meio redundante pois só tem um, mas...
                if (filters.produto && filters.produto !== 'all' && filters.produto !== 'CALCARIO OXIFERTIL') return;

                const qtd = doseOx * areaDia;

                const key = `${fazendaNome}|CALCARIO OXIFERTIL|${dataPlantio}|${talhao}`.toUpperCase();
                processedKeys.add(key);

                oxifertilList.push({
                    id: `pd_ox_${record.id}`,
                    fazenda: fazendaNome,
                    produto: 'CALCARIO OXIFERTIL',
                    inicio: dataPlantio, // Data do plantio
                    quantidadeAplicada: qtd,
                    doseAplicada: doseOx,
                    areaTalhao: areaDia,
                    areaTotalAplicada: areaDia,
                    talhao: talhao,
                    
                    // Campos de compatibilidade
                    area_talhao: areaDia,
                    area_total_aplicada: areaDia,
                    doseRecomendada: 0.15, // Valor padrão ou null se não tivermos a info
                    dose_recomendada: 0.15,
                    dose_aplicada: doseOx,
                    insumDoseAplicada: doseOx,
                    insum_dose_aplicada: doseOx,
                    quantidade_aplicada: qtd,
                    
                    origem: 'plantio_diario',
                    plantioId: record.id
                });
            }
        });

        // 2. Buscar dados legados de insumos_fazendas
        const { data: legacyData, error: legacyError } = await this.supabase
            .from('insumos_fazendas')
            .select('*')
            .eq('produto', 'CALCARIO OXIFERTIL');

        if (!legacyError && legacyData) {
            legacyData.forEach(d => {
                if (filters.fazenda && filters.fazenda !== 'all' && d.fazenda !== filters.fazenda) return;
                
                const key = `${d.fazenda}|${d.produto}|${d.inicio}|${d.talhao}`.toUpperCase();
                if (processedKeys.has(key)) return;

                oxifertilList.push({
                    ...d,
                    id: d.id,
                    areaTalhao: d.area_talhao || d.area_total_aplicada,
                    areaTotalAplicada: d.area_total_aplicada,
                    doseRecomendada: d.dose_recomendada,
                    quantidadeAplicada: d.quantidade_aplicada,
                    doseAplicada: d.dose_aplicada,
                    insumDoseAplicada: d.insum_dose_aplicada || d.dose_aplicada,
                    origem: 'insumos_fazendas'
                });
            });
        }

        return { success: true, data: oxifertilList };
    }

    async getInsumosFazendas(filters = {}) {
        this.checkConfig();
        
        // 1. Buscar dados da tabela plantio_diario (Nova fonte de verdade)
        const { data: plantioData, error: plantioError } = await this.supabase
            .from('plantio_diario')
            .select('*');
            
        if (plantioError) throw plantioError;

        let insumosList = [];
        // Set para controle de duplicatas (chave: fazenda|produto|data|talhao)
        const processedKeys = new Set();

        // Processar dados do plantio_diario
        plantioData.forEach(record => {
            const frentes = record.frentes || [];
            // Assumindo que há apenas uma frente por registro de plantio diário, conforme lógica atual
            const frenteInfo = frentes[0] || {};
            const fazendaNome = frenteInfo.fazenda || 'Desconhecida';
            // A área aplicada no dia é o plantioDiario ou plantada
            const areaDia = parseFloat(frenteInfo.plantioDiario || frenteInfo.plantada || 0);
            const talhao = frenteInfo.frente || ''; 
            const dataPlantio = record.data;

            const insumos = Array.isArray(record.insumos) ? record.insumos : [];
            
            insumos.forEach((ins, idx) => {
                // Filtros em memória
                if (filters.fazenda && filters.fazenda !== 'all' && fazendaNome !== filters.fazenda) return;
                if (filters.produto && filters.produto !== 'all' && ins.produto !== filters.produto) return;

                const dose = parseFloat(ins.doseRealizada || 0);
                const qtd = dose * areaDia;

                // Gerar chave única para deduplicação
                const key = `${fazendaNome}|${ins.produto}|${dataPlantio}|${talhao}`.toUpperCase();
                processedKeys.add(key);

                insumosList.push({
                    id: `pd_${record.id}_${idx}`, // ID único gerado
                    fazenda: fazendaNome,
                    produto: ins.produto,
                    inicio: dataPlantio,
                    quantidadeAplicada: qtd,
                    doseAplicada: dose,
                    areaTotalAplicada: areaDia,
                    talhao: talhao,
                    
                    // Campos de compatibilidade para interface
                    areaTalhao: areaDia, 
                    area_total_aplicada: areaDia,
                    doseRecomendada: parseFloat(ins.dosePrevista || 0),
                    dose_recomendada: parseFloat(ins.dosePrevista || 0),
                    quantidade_aplicada: qtd,
                    dose_aplicada: dose,
                    insumDoseAplicada: dose,
                    insum_dose_aplicada: dose,
                    
                    // Metadados extras
                    origem: 'plantio_diario',
                    plantioId: record.id
                });
            });
        });

        // 2. Buscar dados legados/importados da tabela insumos_fazendas
        // Mantém compatibilidade com dados antigos que não estão no plantio_diario
        const { data: legacyData, error: legacyError } = await this.supabase.from('insumos_fazendas').select('*');
        if (!legacyError && legacyData) {
             legacyData.forEach(d => {
                // Verificar filtros
                if (filters.fazenda && filters.fazenda !== 'all' && d.fazenda !== filters.fazenda) return;
                if (filters.produto && filters.produto !== 'all' && d.produto !== filters.produto) return;

                // Verificar duplicidade
                const key = `${d.fazenda}|${d.produto}|${d.inicio}|${d.talhao}`.toUpperCase();
                if (processedKeys.has(key)) {
                    return; // Já processado via plantio_diario
                }

                insumosList.push({
                    ...d,
                    id: d.id, // ID original
                    areaTalhao: d.area_talhao || d.area_total_aplicada,
                    areaTotalAplicada: d.area_total_aplicada,
                    doseRecomendada: d.dose_recomendada,
                    quantidadeAplicada: d.quantidade_aplicada,
                    doseAplicada: d.dose_aplicada,
                    insumDoseAplicada: d.insum_dose_aplicada || d.dose_aplicada,
                    origem: 'insumos_fazendas'
                });
            });
        }

        return { success: true, data: insumosList };
    }

    async getSantaIrene() {
        this.checkConfig();
        // Reutiliza getInsumosFazendas para buscar do plantio_diario
        const result = await this.getInsumosFazendas();
        if (!result.success) throw new Error('Erro ao buscar insumos');
        
        // Filtra por Santa Irene (case insensitive)
        const filteredData = result.data.filter(d => d.fazenda && d.fazenda.toUpperCase().includes('SANTA IRENE'));
        
        return { success: true, data: filteredData };
    }

    async getDaniela() {
        this.checkConfig();
        // Reutiliza getInsumosFazendas para buscar do plantio_diario
        const result = await this.getInsumosFazendas();
        if (!result.success) throw new Error('Erro ao buscar insumos');
        
        // Filtra por Daniela (case insensitive)
        const filteredData = result.data.filter(d => d.fazenda && d.fazenda.toUpperCase().includes('DANIELA'));
        
        return { success: true, data: filteredData };
    }

    async deleteInsumoFazenda(id) {
        this.checkConfig();
        const { error } = await this.supabase.from('insumos_fazendas').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    }

    async addInsumoFazenda(payload) {
        this.checkConfig();
        const item = {
            fazenda: payload.fazenda,
            produto: payload.produto,
            inicio: payload.inicio, // Data do plantio
            quantidade_aplicada: payload.quantidadeAplicada, // Total aplicado (dose * area)
            dose_aplicada: payload.doseAplicada, // Dose realizada
            area_total_aplicada: payload.areaTotalAplicada, // Área do dia
            talhao: payload.talhao,
            // Outros campos se necessários
            created_at: new Date()
        };

        const { data, error } = await this.supabase.from('insumos_fazendas').insert([item]).select();
        if (error) throw error;
        return { success: true, data: data[0] };
    }

    async getFazendas() {
        this.checkConfig();
        const { data, error } = await this.supabase.from('fazendas').select('*');
        if (error) throw error;
        return { success: true, data };
    }

    async getProdutos() {
        // Retornando estático como no backend original, ou poderia buscar do banco
        return { success: true, data: ["CALCARIO OXIFERTIL", "LANEX 800 WG (REGENTE)", "BIOZYME", "04-30-10"] };
    }

    async createFazenda(payload) {
        this.checkConfig();
        // Mapeamento camelCase -> snake_case se necessário
        const item = {
            codigo: payload.codigo,
            nome: payload.nome,
            regiao: payload.regiao,
            area_total: payload.areaTotal || payload.area_total,
            plantio_acumulado: payload.plantioAcumulado || payload.plantio_acumulado,
            muda_acumulada: payload.mudaAcumulada || payload.muda_acumulada,
            cobricao_acumulada: payload.cobricaoAcumulada || payload.cobricao_acumulada,
            observacoes: payload.observacoes
        };

        // Usar upsert para evitar erro 409 (Conflict) se o código já existir
        // onConflict: 'codigo' assume que a coluna 'codigo' é UNIQUE no Supabase
        const { data, error } = await this.supabase
            .from('fazendas')
            .upsert(item, { onConflict: 'codigo' })
            .select();
            
        if (error) throw error;
        return { success: true, data: data[0] };
    }

    async updateFazenda(codigo, payload) {
        this.checkConfig();
        const updates = {};
        if (payload.nome) updates.nome = payload.nome;
        if (payload.regiao) updates.regiao = payload.regiao;
        if (payload.areaTotal !== undefined) updates.area_total = payload.areaTotal;
        if (payload.plantioAcumulado !== undefined) updates.plantio_acumulado = payload.plantioAcumulado;
        if (payload.mudaAcumulada !== undefined) updates.muda_acumulada = payload.mudaAcumulada;
        if (payload.cobricaoAcumulada !== undefined) updates.cobricao_acumulada = payload.cobricaoAcumulada;
        if (payload.observacoes) updates.observacoes = payload.observacoes;

        const { data, error } = await this.supabase.from('fazendas').update(updates).eq('codigo', codigo).select();
        if (error) throw error;
        return { success: true, data: data[0] };
    }

    async deleteFazenda(codigo) {
        this.checkConfig();
        const { error } = await this.supabase.from('fazendas').delete().eq('codigo', codigo);
        if (error) throw error;
        return { success: true };
    }

    // === VIAGENS ADUBO ===

    async getViagensAdubo() {
        this.checkConfig();
        const { data, error } = await this.supabase.from('viagens_adubo').select('*');
        if (error) throw error;

        const mappedData = data.map(d => ({
            ...d,
            transportType: d.transport_type || 'adubo',
            quantidadeTotal: d.quantidade_total,
            documentoMotorista: d.documento_motorista,
            bags: d.bags || []
        }));

        return { success: true, data: mappedData };
    }

    async addViagemAdubo(payload) {
        this.checkConfig();
        const id = Date.now();
        const item = {
            id,
            transport_type: payload.transportType || 'adubo',
            data: payload.data,
            frente: payload.frente,
            fazenda: payload.fazenda,
            origem: payload.origem,
            destino: payload.destino,
            produto: payload.produto,
            quantidade_total: payload.quantidadeTotal,
            unidade: payload.unidade,
            caminhao: payload.caminhao,
            carreta1: payload.carreta1,
            carreta2: payload.carreta2,
            motorista: payload.motorista,
            documento_motorista: payload.documentoMotorista,
            transportadora: payload.transportadora,
            observacoes: payload.observacoes,
            bags: payload.bags || [],
            // Novos campos para Transporte de Composto
            numero_os: payload.numeroOS,
            data_abertura_os: payload.dataAberturaOS,
            data_fechamento_os: payload.dataFechamentoOS,
            total_previsto: payload.totalPrevisto,
            total_realizado: payload.totalRealizado
        };

        const { data, error } = await this.supabase.from('viagens_adubo').insert([item]).select();
        if (error) throw error;
        
        const saved = data[0];
        const mapped = {
            ...saved,
            transportType: saved.transport_type || 'adubo',
            quantidadeTotal: saved.quantidade_total,
            documentoMotorista: saved.documento_motorista,
            bags: saved.bags,
            numeroOS: saved.numero_os,
            dataAberturaOS: saved.data_abertura_os,
            dataFechamentoOS: saved.data_fechamento_os,
            totalPrevisto: saved.total_previsto,
            totalRealizado: saved.total_realizado
        };
        return { success: true, data: mapped };
    }

    async updateViagemAdubo(id, payload) {
        this.checkConfig();
        const updates = {
            transport_type: payload.transportType,
            data: payload.data,
            frente: payload.frente,
            fazenda: payload.fazenda,
            origem: payload.origem,
            destino: payload.destino,
            produto: payload.produto,
            quantidade_total: payload.quantidadeTotal,
            unidade: payload.unidade,
            caminhao: payload.caminhao,
            carreta1: payload.carreta1,
            carreta2: payload.carreta2,
            motorista: payload.motorista,
            documento_motorista: payload.documentoMotorista,
            transportadora: payload.transportadora,
            observacoes: payload.observacoes,
            bags: payload.bags,
            // Novos campos
            numero_os: payload.numeroOS,
            data_abertura_os: payload.dataAberturaOS,
            data_fechamento_os: payload.dataFechamentoOS,
            total_previsto: payload.totalPrevisto,
            total_realizado: payload.totalRealizado
        };

        // Remover undefined
        Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);

        const { data, error } = await this.supabase.from('viagens_adubo').update(updates).eq('id', id).select();
        if (error) throw error;

        const saved = data[0];
        const mapped = {
            ...saved,
            transportType: saved.transport_type || 'adubo',
            quantidadeTotal: saved.quantidade_total,
            documentoMotorista: saved.documento_motorista,
            bags: saved.bags,
            numeroOS: saved.numero_os,
            dataAberturaOS: saved.data_abertura_os,
            dataFechamentoOS: saved.data_fechamento_os,
            totalPrevisto: saved.total_previsto,
            totalRealizado: saved.total_realizado
        };
        return { success: true, data: mapped };
    }

    async deleteViagemAdubo(id) {
        this.checkConfig();
        const { error } = await this.supabase.from('viagens_adubo').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    }

    // === ESTOQUE ===

    async getEstoque() {
        this.checkConfig();
        const { data, error } = await this.supabase.from('estoque').select('*');
        if (error) throw error;
        return { success: true, data };
    }

    async setEstoque(frente, produto, quantidade, os_numero = null, data_cadastro = null) {
        this.checkConfig();
        // Upsert no Supabase
        const payload = { frente, produto, quantidade };
        if (os_numero) payload.os_numero = os_numero;
        if (data_cadastro) payload.data_cadastro = data_cadastro;

        const { data, error } = await this.supabase.from('estoque')
            .upsert(payload, { onConflict: 'frente, produto' })
            .select();
            
        if (error) throw error;
        return { success: true, data: data[0] };
    }

    async deleteEstoque(frente, produto) {
        this.checkConfig();
        const { error } = await this.supabase.from('estoque').delete().eq('frente', frente).eq('produto', produto);
        if (error) throw error;
        return { success: true };
    }

    // === PLANTIO DIA ===

    async getPlantioDia() {
        this.checkConfig();
        const { data, error } = await this.supabase.from('plantio_diario').select('*');
        if (error) throw error;
        return { success: true, data };
    }

    async addPlantioDia(payload) {
        this.checkConfig();
        const item = {
            ...payload,
            id: payload.id || Date.now()
        };
        const { data, error } = await this.supabase.from('plantio_diario').insert([item]).select();
        if (error) throw error;
        return { success: true, data: data[0] };
    }

    async updatePlantioDia(id, payload) {
        this.checkConfig();
        // Remove id do payload se existir para evitar conflito, mas mantemos o id na query
        const { id: _, ...updateData } = payload;
        
        const { data, error } = await this.supabase
            .from('plantio_diario')
            .update(updateData)
            .eq('id', id)
            .select();
            
        if (error) throw error;
        return { success: true, data: data[0] };
    }

    async deletePlantioDia(id) {
        this.checkConfig();
        const { error } = await this.supabase.from('plantio_diario').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    }

    async clearImportData() {
        this.checkConfig();
        // Limpa dados importados (Insumos)
        const { error: e1 } = await this.supabase.from('insumos_oxifertil').delete().neq('id', 0);
        const { error: e2 } = await this.supabase.from('insumos_fazendas').delete().neq('id', 0);
        
        if (e1) throw e1;
        if (e2) throw e2;
        
        return { success: true };
    }

    async clearAll() {
        this.checkConfig();
        try {
            // Limpa tudo
            await this.supabase.from('insumos_oxifertil').delete().neq('id', 0);
            await this.supabase.from('insumos_fazendas').delete().neq('id', 0);
            await this.supabase.from('viagens_adubo').delete().neq('id', 0);
            await this.supabase.from('plantio_diario').delete().neq('id', 0);
            
            // Estoque (chave composta, deleta tudo que tem frente diferente de vazio)
            await this.supabase.from('estoque').delete().neq('frente', '');
            
            // Fazendas (novo requisito)
            await this.supabase.from('fazendas').delete().neq('codigo', '');
            
            return { success: true };
        } catch (error) {
            console.error('Erro ao limpar tudo:', error);
            return { success: false, message: error.message };
        }
    }

    async healthCheck() {
        if (!this.supabase) return { success: false, message: 'Supabase não configurado' };
        // Teste simples
        const { error } = await this.supabase.from('fazendas').select('count', { count: 'exact', head: true });
        if (error) return { success: false, message: error.message };
        return { success: true, message: 'Supabase conectado' };
    }

    // === METAS DE PLANTIO ===

    async getMetas() {
        this.checkConfig();
        const { data, error } = await this.supabase.from('metas_plantio').select('*');
        if (error) {
            console.warn('Erro ao buscar metas (tabela pode não existir):', error);
            return { success: false, error };
        }
        return { success: true, data };
    }

    async saveMeta(payload) {
        this.checkConfig();
        // payload: { frente, meta_diaria }
        const item = {
            frente: payload.frente,
            meta_diaria: payload.meta_diaria,
            updated_at: new Date()
        };

        const { data, error } = await this.supabase
            .from('metas')
            .upsert(item, { onConflict: 'frente' })
            .select();

        if (error) throw error;
        return { success: true, data: data[0] };
    }

    // === ORDEM DE SERVIÇO (OS) ===

    async getOSList() {
        this.checkConfig();
        const { data, error } = await this.supabase
            .from('os_agricola')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Erro ao buscar lista de OS:', error);
            // Se a tabela não existir, retorna array vazio para não quebrar a UI
            if (error.code === '42P01') return { success: true, data: [] }; 
            throw error;
        }

        // Mapear snake_case para camelCase se necessário, ou usar direto
        // O app usa mapeamento manual no fillOSForm, então vamos padronizar aqui se possível
        // Mas por enquanto vou retornar raw e tratar no frontend ou mapear básico
        const mapped = data.map(d => ({
            ...d,
            abertura: d.data_abertura,
            inicioPrev: d.data_inicio_prev,
            finalPrev: d.data_final_prev,
            respAplicacao: d.responsavel_aplicacao,
            areaTotal: d.area_total
        }));

        return { success: true, data: mapped };
    }

    async getOSByFrente(frente) {
        this.checkConfig();
        if (!frente) return { success: false, message: 'Frente não informada' };

        // Normalizar frente para string e remover espaços extras se houver
        const frenteStr = String(frente).trim();

        // Buscar OS ativa para a frente
        // Ordenar por data de abertura decrescente para pegar a mais recente
        const { data, error } = await this.supabase
            .from('os_agricola')
            .select('*')
            .eq('frente', frenteStr)
            //.eq('status', 'Aberta') // Removido filtro de status para garantir retorno
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Erro ao buscar OS por frente:', error);
            return { success: false, error };
        }

        if (!data || data.length === 0) {
            return { success: false, message: 'Nenhuma OS encontrada para esta frente' };
        }

        const os = data[0];
        
        // Mapeamento básico e produtos
        const mappedOS = {
            ...os,
            abertura: os.data_abertura,
            inicioPrev: os.data_inicio_prev,
            finalPrev: os.data_final_prev,
            respAplicacao: os.responsavel_aplicacao,
            areaTotal: os.area_total,
            produtos: os.produtos || [] // Array de produtos { produto, doseRecomendada, unidade }
        };

        return { success: true, data: mappedOS };
    }

    async saveOS(payload) {
        this.checkConfig();
        
        // Mapeamento para o banco (snake_case)
        const item = {
            numero: payload.numero,
            status: payload.status,
            data_abertura: payload.abertura || null,
            data_inicio_prev: payload.inicioPrev || null,
            data_final_prev: payload.finalPrev || null,
            responsavel_aplicacao: payload.respAplicacao,
            empresa: payload.empresa,
            frente: payload.frente,
            processo: payload.processo,
            subprocesso: payload.subprocesso,
            fazenda: payload.fazenda,
            setor: payload.setor,
            area_total: payload.areaTotal,
            talhoes: payload.talhoes || [],
            produtos: payload.produtos || []
        };

        // Upsert no Supabase (usando numero como chave única)
        const { data, error } = await this.supabase
            .from('os_agricola')
            .upsert(item, { onConflict: 'numero' })
            .select();

        if (error) throw error;
        return { success: true, data: data[0] };
    }

    async deleteOS(numero) {
        this.checkConfig();
        const { error } = await this.supabase
            .from('os_agricola')
            .delete()
            .eq('numero', numero);
        
        if (error) throw error;
        return { success: true };
    }

    async saveLiberacao(payload) {
        this.checkConfig();
        const item = {
            numero_liberacao: payload.numero_liberacao,
            data: payload.data,
            frente: payload.frente,
            fazenda: payload.fazenda,
            fazenda_codigo: payload.fazenda_codigo,
            talhoes: payload.talhoes || [], // JSONB
            area_total: payload.area_total,
            status: payload.status,
            observacoes: payload.observacoes
        };

        const { data, error } = await this.supabase
            .from('liberacao_colheita')
            .upsert(item, { onConflict: 'numero_liberacao' }) // Assumindo que número é único
            .select();

        if (error) throw error;
        return { success: true, data: data[0] };
    }
}

// Instância global do serviço API
window.apiService = new ApiService();
