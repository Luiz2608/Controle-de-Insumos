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
        let query = this.supabase.from('insumos_oxifertil').select('*');
        
        // Aplicar filtros
        if (filters.fazenda && filters.fazenda !== 'all') {
            query = query.eq('fazenda', filters.fazenda);
        }
        if (filters.produto && filters.produto !== 'all') {
            query = query.eq('produto', filters.produto);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Mapeamento snake_case -> camelCase
        const mappedData = data.map(d => ({
            ...d,
            areaTalhao: d.area_talhao,
            areaTotalAplicada: d.area_total_aplicada,
            doseRecomendada: d.dose_recomendada,
            insumDoseAplicada: d.insum_dose_aplicada,
            quantidadeAplicada: d.quantidade_aplicada
        }));

        return { success: true, data: mappedData };
    }

    async getInsumosFazendas(filters = {}) {
        this.checkConfig();
        let query = this.supabase.from('insumos_fazendas').select('*');

        if (filters.fazenda && filters.fazenda !== 'all') {
            query = query.eq('fazenda', filters.fazenda);
        }
        if (filters.produto && filters.produto !== 'all') {
            query = query.eq('produto', filters.produto);
        }

        const { data, error } = await query;
        if (error) throw error;

        const mappedData = data.map(d => ({
            ...d,
            areaTalhao: d.area_talhao,
            areaTotalAplicada: d.area_total_aplicada,
            doseRecomendada: d.dose_recomendada,
            quantidadeAplicada: d.quantidade_aplicada,
            insumDoseAplicada: d.insum_dose_aplicada
        }));

        return { success: true, data: mappedData };
    }

    async deleteInsumoFazenda(id) {
        this.checkConfig();
        const { error } = await this.supabase.from('insumos_fazendas').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
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
            bags: payload.bags || []
        };

        const { data, error } = await this.supabase.from('viagens_adubo').insert([item]).select();
        if (error) throw error;
        
        const saved = data[0];
        const mapped = {
            ...saved,
            quantidadeTotal: saved.quantidade_total,
            documentoMotorista: saved.documento_motorista,
            bags: saved.bags
        };
        return { success: true, data: mapped };
    }

    async updateViagemAdubo(id, payload) {
        this.checkConfig();
        const updates = {
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
            bags: payload.bags
        };

        // Remover undefined
        Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);

        const { data, error } = await this.supabase.from('viagens_adubo').update(updates).eq('id', id).select();
        if (error) throw error;

        const saved = data[0];
        const mapped = {
            ...saved,
            quantidadeTotal: saved.quantidade_total,
            documentoMotorista: saved.documento_motorista,
            bags: saved.bags
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
}

// Instância global do serviço API
window.apiService = new ApiService();