// Helper para gerar chave única de produto por OS
function getKey(nome, os) {
    if (os && String(os).trim() !== '') {
        return `${nome.trim()}__OS__${String(os).trim()}`;
    }
    return nome.trim();
}

class InsumosApp {
    constructor() {
        this.api = window.apiService || (typeof ApiService !== 'undefined' ? new ApiService() : null);
        if (!window.apiService && this.api) window.apiService = this.api;
        this.ui = window.uiManager;
        this.currentFilters = {
            insumos: {}
        };
        this.insumosFazendasData = [];
        this.currentEdit = null;
        this.estoqueFilters = { frente: 'all', produto: '' };
        this.chartOrder = 'az';
        this.plantioDia = [];
        this.plantioFrentesDraft = [];
        this.plantioInsumosDraft = [];
        this.fazendaIndex = { byName: {}, byCod: {} };
        this.cadastroFazendas = [];
        this.cadastroEditCodigo = null;
        this.plantioExpanded = new Set();
        this.viagensAdubo = [];
        this.viagensAduboBagsDraft = [];
        this.viagemAduboTransportType = 'adubo';
        this.viagensAduboFilters = {
            data: '',
            fazenda: '',
            frente: '',
            motorista: '',
            caminhao: '',
            lacre: ''
        };
        this.liberacaoTalhoesDraft = [];
        this.transporteCompostoData = [];
        this.liberacaoColheitaData = [];
        this.compostoDiarioDraft = []; // Novo draft para itens diários de composto

        // Controle de Load do Dashboard (Circuit Breaker)
        this.dashboardLoadCount = 0;
        this.dashboardLoadResetTime = Date.now();
        this.dashboardDisabled = false;
        this.isDashboardLoading = false;
        this._lastDashboardLoad = 0;

        // Inicializar PDF.js worker
        this.dashboardFilters = { fazenda: 'all', produto: 'all', frente: 'all' };
        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        
        this.initPlantioModalIA();
        this.initTheme();
        this.initApiKeyConfig();

        // EXPOSE APP GLOBALLY (FIX "app is not defined")
        window.app = this;
        window.insumosApp = this;
    }

    initApiKeyConfig() {
        console.log('Inicializando configuração de API Key...');
        const modal = document.getElementById('api-key-modal');
        const input = document.getElementById('gemini-api-key-input');
        const saveBtn = document.getElementById('save-api-key-btn');
        const cancelBtn = document.getElementById('cancel-api-key-btn');
        const configBtn = document.getElementById('config-api-key-btn');

        // Carregar chave salva
        const savedKey = localStorage.getItem('GEMINI_API_KEY');
        if (savedKey) {
            console.log('Chave API encontrada no LocalStorage.');
            window.API_CONFIG.geminiKey = savedKey;
        } else {
            console.log('Nenhuma chave API encontrada. Usuário precisará configurar.');
        }

        // Abrir modal se clicar no botão de configuração
        if (configBtn) {
            configBtn.addEventListener('click', () => {
                console.log('Botão de configurar API Key clicado.');
                if (modal) modal.style.display = 'flex';
                if (input) input.value = window.API_CONFIG.geminiKey || '';
            });
        } else {
            console.warn('Botão #config-api-key-btn não encontrado no DOM.');
        }

        // Salvar chave
        if (saveBtn && input) {
            saveBtn.addEventListener('click', () => {
                const key = input.value.trim();
                if (key) {
                    localStorage.setItem('GEMINI_API_KEY', key);
                    window.API_CONFIG.geminiKey = key;
                    console.log('Nova chave API salva.');
                    if (this.ui) this.ui.showNotification('Chave API salva com sucesso!', 'success');
                    if (modal) modal.style.display = 'none';
                } else {
                    if (this.ui) this.ui.showNotification('Por favor, insira uma chave válida.', 'error');
                }
            });
        }

        // Cancelar
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (modal) modal.style.display = 'none';
            });
        }
        
        // Fechar se clicar fora
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }
    }

    initPlantioModalIA() {
        // Inicializa listeners para upload e análise de imagem com IA
        const imageInput = document.getElementById('ai-image-input');
        const analyzeBtn = document.getElementById('btn-analyze-image');
        const preview = document.getElementById('ai-image-preview');
        const placeholder = document.getElementById('ai-preview-placeholder');
        const loading = document.getElementById('ai-loading');
        const progress = document.getElementById('ai-progress');

        if (imageInput) {
            imageInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    console.log('Arquivo selecionado no input:', file.name, file.type);
                    
                    // Se for imagem, mostrar preview
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (evt) => {
                            if (preview) {
                                preview.src = evt.target.result;
                                preview.style.display = 'block';
                            }
                            if (placeholder) placeholder.style.display = 'none';
                        };
                        reader.readAsDataURL(file);
                    } else if (file.type === 'application/pdf') {
                         // Se for PDF, mostrar ícone ou aviso
                         if (preview) preview.style.display = 'none';
                         if (placeholder) {
                             placeholder.style.display = 'block';
                             placeholder.innerHTML = '📄 PDF Selecionado:<br>' + file.name;
                         }
                    }

                    // Habilitar botão de análise
                    if (analyzeBtn) {
                        analyzeBtn.disabled = false;
                        // Opcional: Auto-click para agilizar (se desejar)
                        // analyzeBtn.click(); 
                    }
                }
            });
        }

        // Adicionar Listener Manual para o botão de análise de O.S. (Upload de OS)
        // Este é um botão separado do modal de análise de plantio
        const osUploadBtn = document.getElementById('btn-upload-os');
        const osFileInput = document.getElementById('os-file-input');

        if (osUploadBtn && osFileInput) {
            osUploadBtn.addEventListener('click', () => {
                osFileInput.click();
            });

            osFileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    console.log('Arquivo de O.S. selecionado:', file.name);
                    this.handleOSFile(file);
                }
            });
        }

        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', async () => {
                if (!imageInput || !imageInput.files[0]) return;
                
                const file = imageInput.files[0];
                
                // UI Loading State
                if (loading) loading.style.display = 'block';
                if (progress) progress.textContent = '0%';
                analyzeBtn.disabled = true;
                analyzeBtn.textContent = '⏳ Analisando...';

                try {
                    if (progress) progress.textContent = '50%';
                    
                    // Call API
                    const res = await this.api.analyzeImage(file);
                    
                    if (progress) progress.textContent = '100%';

                    if (res.success) {
                        // Populate form fields
                        const toletesInput = document.getElementById('qual-toletes-amostra');
                        const gemasInput = document.getElementById('qual-gemas-amostra');
                        
                        if (toletesInput) toletesInput.value = res.data.toletes || 0;
                        if (gemasInput) gemasInput.value = res.data.gemas || 0;
                        
                        this.ui.showNotification('✅ Análise concluída com sucesso!', 'success');
                    } else {
                        this.ui.showNotification('❌ ' + res.message, 'error');
                    }
                } catch (e) {
                    console.error('Erro na análise:', e);
                    this.ui.showNotification('Erro ao processar imagem', 'error');
                } finally {
                    // Reset UI
                    if (loading) loading.style.display = 'none';
                    analyzeBtn.disabled = false;
                    analyzeBtn.innerHTML = '✨ Analisar com IA';
                }
            });
        }
    }

    initTheme() {
        const savedTheme = localStorage.getItem('theme');
        const themeToggleBtn = document.getElementById('theme-toggle');
        
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }

        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        }
    }

    toggleTheme() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        
        // Re-render charts to apply new theme colors
        this.renderInsumosGlobalChart();
        this.renderInsumosTimelineChart();
        this.renderEstoqueGeralChart();
        this.renderProductDetailsCharts();
        this.renderLogisticsCharts();
        this.renderColheitaCharts();
        this.renderQualidadeCharts();
    }

    populateDashboardFilters() {
        const fazendaSelect = document.getElementById('dashboard-fazenda');
        const produtoSelect = document.getElementById('dashboard-produto');
        const frenteSelect = document.getElementById('dashboard-frente');
        if (fazendaSelect) {
            const set = new Set();
            (this.cadastroFazendas || []).forEach(f => f && f.nome && set.add(String(f.nome)));
            (this.insumosFazendasData || []).forEach(i => i && i.fazenda && set.add(String(i.fazenda)));
            const prev = fazendaSelect.value || 'all';
            fazendaSelect.innerHTML = '';
            const optAll = document.createElement('option'); optAll.value = 'all'; optAll.textContent = 'Todas as Fazendas'; fazendaSelect.appendChild(optAll);
            Array.from(set).sort().forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; fazendaSelect.appendChild(o); });
            fazendaSelect.value = prev;
        }
        if (produtoSelect) {
            const set = new Set();
            (this.insumosFazendasData || []).forEach(i => i && i.produto && set.add(String(i.produto)));
            const prev = produtoSelect.value || 'all';
            produtoSelect.innerHTML = '';
            const optAll = document.createElement('option'); optAll.value = 'all'; optAll.textContent = 'Todos os Produtos'; produtoSelect.appendChild(optAll);
            Array.from(set).sort().forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; produtoSelect.appendChild(o); });
            produtoSelect.value = prev;
        }
        if (frenteSelect) {
            const set = new Set();
            (this.plantioDiarioData || []).forEach(p => {
                const fr = Array.isArray(p.frentes) ? p.frentes : [];
                fr.forEach(f => f && f.frente && set.add(String(f.frente)));
            });
            (this.estoqueList || []).forEach(e => e && e.frente && set.add(String(e.frente)));
            (this.viagensAdubo || []).forEach(v => v && v.frente && set.add(String(v.frente)));
            const prev = frenteSelect.value || 'all';
            frenteSelect.innerHTML = '';
            const optAll = document.createElement('option'); optAll.value = 'all'; optAll.textContent = 'Todas as Frentes'; frenteSelect.appendChild(optAll);
            Array.from(set).sort().forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; frenteSelect.appendChild(o); });
            frenteSelect.value = prev;
        }
    }
    async autofetchFazendaByCodigoApi(codInputId) {
        const el = document.getElementById(codInputId);
        const codigo = el && el.value ? el.value.trim() : '';
        if (!codigo) return;

    try {
            const res = await this.api.getFazendaByCodigo(codigo);
            if (res && res.success && res.data) {
                const f = res.data;
                this.tempFazendaStats = {
                    plantioAcumulado: f.plantio_acumulado || 0,
                    mudaAcumulada: f.muda_acumulada || 0,
                    cobricaoAcumulada: f.cobricao_acumulada || 0
                };
                const set = (id, val) => { const t = document.getElementById(id); if (t) t.value = val; };
                set('single-fazenda', f.nome || '');
                set('single-regiao', f.regiao || '');
                set('single-area-total', String(f.area_total || 0));
                set('single-area-acumulada', String(f.plantio_acumulado || 0));
                
                const mEl = document.getElementById('muda-consumo-acumulado');
                if (mEl) mEl.value = String(f.muda_acumulada || 0);
                
                const cEl = document.getElementById('cobricao-acumulada');
                if (cEl) cEl.value = String(f.cobricao_acumulada || 0);

                this.updateAccumulatedStats();
            } else {
                this.ui.showNotification('Fazenda não encontrada', 'warning', 2000);
            }
        } catch(e) {}
    }

    updateAccumulatedStats() {
        if (!this.tempFazendaStats) {
            // Tenta recuperar do cache global se tempFazendaStats estiver vazio
            // Isso pode acontecer se a página for recarregada ou em certas navegações
            const cod = document.getElementById('single-cod')?.value;
            if (cod && this.cadastroFazendas) {
                const fazenda = this.cadastroFazendas.find(f => String(f.codigo) === String(cod));
                if (fazenda) {
                    this.tempFazendaStats = {
                        plantioAcumulado: fazenda.plantio_acumulado || 0,
                        mudaAcumulada: fazenda.muda_acumulada || 0,
                        cobricaoAcumulada: fazenda.cobricao_acumulada || 0
                    };
                }
            }
            if (!this.tempFazendaStats) return;
        }
        
        const plantioDiaInput = document.getElementById('single-plantio-dia');
        const mudaDiaInput = document.getElementById('muda-consumo-dia');
        const cobricaoDiaInput = document.getElementById('cobricao-dia');
        
        // Helper para tratar inputs numéricos
        const getVal = (el) => {
            if (!el || !el.value) return 0;
            const val = parseFloat(el.value.replace(',', '.'));
            return isNaN(val) ? 0 : val;
        };
        
        const plantioDia = getVal(plantioDiaInput);
        const mudaDia = getVal(mudaDiaInput);
        const cobricaoDia = getVal(cobricaoDiaInput);
        
        // Ajuste para Edição: Subtrair valor original do acumulado base
        let basePlantio = parseFloat(this.tempFazendaStats.plantioAcumulado || 0);
        if (isNaN(basePlantio)) basePlantio = 0;

        let baseMuda = parseFloat(this.tempFazendaStats.mudaAcumulada || 0);
        if (isNaN(baseMuda)) baseMuda = 0;

        let baseCobricao = parseFloat(this.tempFazendaStats.cobricaoAcumulada || 0);
        if (isNaN(baseCobricao)) baseCobricao = 0;
        
        if (this.currentPlantioId) {
             let originalArea = 0;
             let originalMuda = 0;
             let originalCobricao = 0;
             
             // Prioritize value stored during edit initialization
             if (this.originalPlantioValue != null) originalArea = this.originalPlantioValue;
             if (this.originalMudaValue != null) originalMuda = this.originalMudaValue;
             if (this.originalCobricaoValue != null) originalCobricao = this.originalCobricaoValue;
             
             // Fallback to searching in data list if not stored
             if (this.originalPlantioValue == null && this.plantioDiarioData) {
                 const original = this.plantioDiarioData.find(p => String(p.id) === String(this.currentPlantioId));
                 if (original) {
                     originalArea = parseFloat(original.area_plantada || 0);
                     if (originalArea === 0 && original.frentes && Array.isArray(original.frentes) && original.frentes.length > 0) {
                         const f = original.frentes[0];
                         originalArea = parseFloat(f.plantioDiario || f.plantada || 0);
                     }
                     
                     // Extrair valores originais de muda e cobricao
                     const q = original.qualidade || {};
                     if (this.originalMudaValue == null) originalMuda = parseFloat(q.mudaConsumoDia || 0);
                     if (this.originalCobricaoValue == null) originalCobricao = parseFloat(q.cobricaoDia || original.cobricaoDia || 0);
                 }
             }
             
             // Subtrai valor original para não duplicar na soma visual
             basePlantio = Math.max(0, basePlantio - originalArea);
             baseMuda = Math.max(0, baseMuda - originalMuda);
             baseCobricao = Math.max(0, baseCobricao - originalCobricao);
        }

        const newPlantioAcum = basePlantio + plantioDia;
        const newMudaAcum = baseMuda + mudaDia;
        const newCobricaoAcum = baseCobricao + cobricaoDia;
        
        const plantioAcumEl = document.getElementById('single-area-acumulada');
        const mudaAcumEl = document.getElementById('muda-consumo-acumulado');
        const cobricaoAcumEl = document.getElementById('cobricao-acumulada');
        
        if (plantioAcumEl) plantioAcumEl.value = newPlantioAcum.toFixed(2);
        if (mudaAcumEl) mudaAcumEl.value = newMudaAcum.toFixed(2);
        if (cobricaoAcumEl) cobricaoAcumEl.value = newCobricaoAcum.toFixed(2);

        // Atualizar totais do rascunho de insumos (pois depende da área do dia)
        this.renderInsumosDraft();
    }

    

    
    async ensureApiReady() {
        if (!this.api) {
            if (window.apiService) {
                this.api = window.apiService;
            } else if (typeof ApiService !== 'undefined') {
                this.api = new ApiService();
                window.apiService = this.api;
            }
        }
        return !!this.api;
    }

    

    renderCadastroFazendas(list) {
        this.cadastroFazendas = Array.isArray(list) ? list : [];
        const tbody = document.getElementById('cadastro-fazendas-body');
        if (!tbody) return;
        if (!this.cadastroFazendas.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="loading">📭 Nenhuma fazenda cadastrada</td>
                </tr>
            `;
            return;
        }
        tbody.innerHTML = '';
        this.cadastroFazendas.forEach(f => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${f.codigo ?? ''}</td>
                <td>${f.nome ?? ''}</td>
                <td>${f.regiao ?? ''}</td>
                <td>${f.area_total != null ? this.ui.formatNumber(f.area_total, 2) : ''}</td>
                <td>${f.plantio_acumulado != null ? this.ui.formatNumber(f.plantio_acumulado, 2) : ''}</td>
                <td>${f.muda_acumulada != null ? this.ui.formatNumber(f.muda_acumulada, 2) : ''}</td>
                <td>${f.cobricao_acumulada != null ? this.ui.formatNumber(f.cobricao_acumulada, 2) : ''}</td>
                <td>
                    <button class="btn btn-secondary btn-edit-fazenda" data-codigo="${f.codigo}">Editar</button>
                    <button class="btn btn-secondary btn-use-fazenda-plantio" data-codigo="${f.codigo}">Usar no Plantio</button>
                    <button class="btn btn-delete-fazenda" data-codigo="${f.codigo}">Excluir</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    clearCadastroFazendaForm() {
        const ids = [
            'cadastro-fazenda-codigo',
            'cadastro-fazenda-nome',
            'cadastro-fazenda-regiao',
            'cadastro-fazenda-area-total',
            'cadastro-fazenda-plantio-acumulado',
            'cadastro-fazenda-muda-acumulada',
            'cadastro-fazenda-cobricao-acumulada',
            'cadastro-fazenda-observacoes'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const saveBtn = document.getElementById('cadastro-fazenda-save');
        if (saveBtn) saveBtn.textContent = '💾 Salvar Fazenda';
    }

    async askGeminiKey() {
        const message = 'Informe sua chave da API Gemini. Ela será salva apenas neste navegador.';
        const key = window.prompt(message, '');
        if (key && key.trim().length > 0) {
            const trimmed = key.trim();
            localStorage.setItem('geminiApiKey', trimmed);
            return trimmed;
        }
        return '';
    }

    async saveCadastroFazenda() {
        await this.ensureApiReady();
        const codigoEl = document.getElementById('cadastro-fazenda-codigo');
        const nomeEl = document.getElementById('cadastro-fazenda-nome');
        const regiaoEl = document.getElementById('cadastro-fazenda-regiao');
        const areaTotalEl = document.getElementById('cadastro-fazenda-area-total');
        const plantioAcumEl = document.getElementById('cadastro-fazenda-plantio-acumulado');
        const mudaAcumEl = document.getElementById('cadastro-fazenda-muda-acumulada');
        const cobricaoAcumEl = document.getElementById('cadastro-fazenda-cobricao-acumulada');
        const obsEl = document.getElementById('cadastro-fazenda-observacoes');

        const codigo = codigoEl && codigoEl.value ? codigoEl.value.trim() : '';
        const nome = nomeEl && nomeEl.value ? nomeEl.value.trim() : '';
        const regiao = regiaoEl && regiaoEl.value ? regiaoEl.value.trim() : '';
        const areaTotal = areaTotalEl && areaTotalEl.value ? parseFloat(areaTotalEl.value.replace(',', '.')) : 0;
        const plantioAcumulado = plantioAcumEl && plantioAcumEl.value ? parseFloat(plantioAcumEl.value.replace(',', '.')) : 0;
        const mudaAcumulada = mudaAcumEl && mudaAcumEl.value ? parseFloat(mudaAcumEl.value.replace(',', '.')) : 0;
        const cobricaoAcumulada = cobricaoAcumEl && cobricaoAcumEl.value ? parseFloat(cobricaoAcumEl.value.replace(',', '.')) : 0;
        const observacoes = obsEl && obsEl.value ? obsEl.value.trim() : '';

        // DEBUG: Log values before save
        console.log('Salvando Fazenda:', { codigo, nome, regiao, areaTotal, plantioAcumulado, mudaAcumulada, cobricaoAcumulada, observacoes });

        if (!codigo || !nome) {
            this.ui.showNotification('Informe código e nome da fazenda', 'warning');
            return;
        }

        const payload = {
            codigo,
            nome,
            regiao,
            areaTotal,
            plantioAcumulado,
            mudaAcumulada,
            cobricaoAcumulada,
            observacoes
        };

        try {
            let res;
            if (this.cadastroEditCodigo) {
                res = await this.api.updateFazenda(this.cadastroEditCodigo, payload);
            } else {
                res = await this.api.createFazenda(payload);
            }
            if (res && res.success) {
                this.ui.showNotification('Fazenda salva com sucesso', 'success', 2000);
                this.cadastroEditCodigo = null;
                this.clearCadastroFazendaForm();
                const cadResp = await this.api.getFazendas();
                if (cadResp && cadResp.success && Array.isArray(cadResp.data)) {
                    const list = cadResp.data.map(f => ({
                        cod: f.codigo,
                        nome: f.nome,
                        areaTotal: f.area_total,
                        plantioAcumulado: f.plantio_acumulado,
                        mudaAcumulada: f.muda_acumulada,
                        cobricaoAcumulada: f.cobricao_acumulada,
                        regiao: f.regiao
                    }));
                    this.buildCadastroIndex(list);
                    this.renderCadastroFazendas(cadResp.data);
                }
            } else {
                this.ui.showNotification('Erro ao salvar fazenda', 'error');
            }
        } catch (e) {
            this.ui.showNotification('Erro ao salvar fazenda', 'error');
        }
    }

    async editCadastroFazenda(codigo) {
        if (!codigo || !this.cadastroFazendas || !this.cadastroFazendas.length) return;
        const item = this.cadastroFazendas.find(f => String(f.codigo) === String(codigo));
        if (!item) return;
        const codigoEl = document.getElementById('cadastro-fazenda-codigo');
        const nomeEl = document.getElementById('cadastro-fazenda-nome');
        const regiaoEl = document.getElementById('cadastro-fazenda-regiao');
        const areaTotalEl = document.getElementById('cadastro-fazenda-area-total');
        const plantioAcumEl = document.getElementById('cadastro-fazenda-plantio-acumulado');
        const mudaAcumEl = document.getElementById('cadastro-fazenda-muda-acumulada');
        const cobricaoAcumEl = document.getElementById('cadastro-fazenda-cobricao-acumulada');
        const obsEl = document.getElementById('cadastro-fazenda-observacoes');
        console.log('Dados carregados para edição:', item);

        // Open dedicated edit modal
        const editModal = document.getElementById('fazenda-edit-modal');
        if (editModal) {
            editModal.style.display = 'flex';
            
            // Populate fields in the new modal
            const setVal = (id, val) => { 
                const el = document.getElementById(id); 
                if(el) el.value = val; 
            };
            
            setVal('edit-fazenda-codigo', item.codigo ?? '');
            setVal('edit-fazenda-nome', item.nome ?? '');
            setVal('edit-fazenda-regiao', item.regiao ?? '');
            setVal('edit-fazenda-area-total', item.area_total != null ? String(item.area_total) : '');
            setVal('edit-fazenda-plantio-acumulado', item.plantio_acumulado != null ? String(item.plantio_acumulado) : '');
            setVal('edit-fazenda-muda-acumulada', item.muda_acumulada != null ? String(item.muda_acumulada) : '');
            setVal('edit-fazenda-cobricao-acumulada', item.cobricao_acumulada != null ? String(item.cobricao_acumulada) : '');
            setVal('edit-fazenda-observacoes', item.observacoes ?? '');

            this.cadastroEditCodigo = item.codigo;
            
            // Setup Save Button
            const saveBtn = document.getElementById('fazenda-edit-save');
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            
            newSaveBtn.addEventListener('click', async () => {
                await this.saveFazendaFromEditModal();
            });

            // Setup Close/Cancel Buttons
            const closeBtn = document.getElementById('fazenda-edit-close');
            const cancelBtn = document.getElementById('fazenda-edit-cancel');
            
            const closeHandler = () => { editModal.style.display = 'none'; };
            
            if(closeBtn) closeBtn.onclick = closeHandler;
            if(cancelBtn) cancelBtn.onclick = closeHandler;
        }
    }

    async saveFazendaFromEditModal() {
        await this.ensureApiReady();
        const codigo = this.cadastroEditCodigo;
        if (!codigo) return;

        const getVal = (id) => document.getElementById(id)?.value || '';
        const getNum = (id) => {
            const el = document.getElementById(id);
            if (!el) return 0;
            let val = el.value;
            if (!val) return 0;
            if (typeof val === 'string') val = val.replace(',', '.');
            const num = parseFloat(val);
            return isNaN(num) ? 0 : num;
        };

        const payload = {
            codigo: codigo, // Keep original code
            nome: getVal('edit-fazenda-nome'),
            regiao: getVal('edit-fazenda-regiao'),
            areaTotal: getNum('edit-fazenda-area-total'),
            plantioAcumulado: getNum('edit-fazenda-plantio-acumulado'),
            mudaAcumulada: getNum('edit-fazenda-muda-acumulada'),
            cobricaoAcumulada: getNum('edit-fazenda-cobricao-acumulada'),
            observacoes: getVal('edit-fazenda-observacoes')
        };

        if (!payload.nome) {
            this.ui.showNotification('Nome da fazenda é obrigatório', 'warning');
            return;
        }

        try {
            const res = await this.api.updateFazenda(codigo, payload);
            if (res && res.success) {
                this.ui.showNotification('Fazenda atualizada com sucesso', 'success', 2000);
                document.getElementById('fazenda-edit-modal').style.display = 'none';
                
                // Refresh list
                const cadResp = await this.api.getFazendas();
                if (cadResp && cadResp.success && Array.isArray(cadResp.data)) {
                    this.renderCadastroFazendas(cadResp.data);
                }
            } else {
                this.ui.showNotification('Erro ao atualizar fazenda', 'error');
            }
        } catch (e) {
            console.error(e);
            this.ui.showNotification('Erro ao atualizar fazenda', 'error');
        }
    }

    async deleteCadastroFazenda(codigo) {
        if (!codigo) return;
        const ok = window.confirm('Excluir cadastro da fazenda?');
        if (!ok) return;
        await this.ensureApiReady();
        try {
            const res = await this.api.deleteFazenda(codigo);
            if (res && res.success) {
                this.ui.showNotification('Fazenda excluída', 'success', 2000);
                const cadResp = await this.api.getFazendas();
                if (cadResp && cadResp.success && Array.isArray(cadResp.data)) {
                    const list = cadResp.data.map(f => ({
                        cod: f.codigo,
                        nome: f.nome,
                        areaTotal: f.area_total,
                        plantioAcumulado: f.plantio_acumulado,
                        mudaAcumulada: f.muda_acumulada,
                        regiao: f.regiao
                    }));
                    this.buildCadastroIndex(list);
                    this.renderCadastroFazendas(cadResp.data);
                }
            } else {
                this.ui.showNotification('Erro ao excluir fazenda', 'error');
            }
        } catch (e) {
            this.ui.showNotification('Erro ao excluir fazenda', 'error');
        }
    }

    showProgress(title, percent, text) {
        const modal = document.getElementById('progress-modal');
        const titleEl = document.getElementById('progress-title');
        const bar = document.getElementById('progress-bar');
        const textEl = document.getElementById('progress-text');
        
        if (modal) modal.style.display = 'flex';
        if (titleEl) titleEl.textContent = title;
        if (bar) bar.style.width = `${percent}%`;
        if (textEl) textEl.textContent = text || `${Math.floor(percent)}%`;
    }

    hideProgress() {
        const modal = document.getElementById('progress-modal');
        if (modal) {
            modal.style.display = 'none';
            // Reset bar and text
            const bar = document.getElementById('progress-bar');
            if (bar) bar.style.width = '0%';
            const textEl = document.getElementById('progress-text');
            if (textEl) textEl.textContent = '0%';
        }
    }

    async handleFazendaPdfFile(file) {
        if (!file) return;
        if (!window.pdfjsLib) {
            this.ui.showNotification('Leitor de PDF não carregado', 'error');
            return;
        }
        try {
            this.showProgress('Lendo PDF...', 0, 'Iniciando leitura...');
            const buffer = await file.arrayBuffer();
            const loadingTask = window.pdfjsLib.getDocument({ data: buffer });
            const pdf = await loadingTask.promise;
            let fullText = '';
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const percent = (pageNum / pdf.numPages) * 50; // 50% para leitura
                this.showProgress('Lendo PDF...', percent, `Lendo página ${pageNum} de ${pdf.numPages}`);
                
                const page = await pdf.getPage(pageNum);
                const content = await page.getTextContent();
                const strings = content.items.map(item => item.str);
                fullText += '\n' + strings.join(' ');
            }
            
            this.showProgress('Processando...', 60, 'Interpretando dados com IA...');
            
            let fazendas = [];
            let geminiKey = (window.API_CONFIG && window.API_CONFIG.geminiKey) || localStorage.getItem('geminiApiKey') || '';
            if (!geminiKey || geminiKey.trim().length < 20) {
                this.hideProgress(); // O prompt vai aparecer
                geminiKey = await this.askGeminiKey();
                this.showProgress('Processando...', 60, 'Interpretando dados com IA...');
            }
            const useGemini = geminiKey && geminiKey.length >= 20;
            if (!useGemini) {
                this.hideProgress();
                this.ui.showNotification('Chave da API Gemini não informada ou inválida. Importação cancelada.', 'error', 4000);
                return;
            }
            
            if (fullText.trim().length > 0) {
                try {
                    this.ui.showNotification('Enviando texto para análise (Gemini)...', 'info', 3000);
                    
                    const prompt = [
                        'Você recebe o texto bruto extraído de um PDF de Caderno de Mapas com fazendas e áreas em hectares.',
                        'Extraia todas as fazendas encontradas e devolva somente um JSON válido, sem nenhum texto adicional.',
                        'O formato do JSON deve ser exatamente:',
                        '{',
                        '  "fazendas": [',
                        '    { "codigo": "96", "nome": "FAZENDA EXEMPLO", "regiao": "OPCIONAL", "areaTotal": 123.45, "talhoes": [{"numero": "1", "area": 10.5}, {"numero": "2", "area": 20.0}] }',
                        '  ],',
                        '  "resumoGeral": {',
                        '    "1": { "totalFazendas": 10, "areaTotal": 1234.56 }',
                        '  }',
                        '}',
                        'Regras:',
                        '- "codigo" deve seguir o padrão Número (ex: "96").',
                        '- "codigo da fazenda" deve seguir o padrão e Número (ex: "1").',
                        '- "nome" é o nome da fazenda.',
                        '- "regiao" pode ser vazio se não estiver claro.',
                        '- "areaTotal" deve ser número em hectares com ponto como separador decimal.',
                        '- "talhoes" deve ser uma lista de objetos com "numero" (string) e "area" (number). Se houver informações detalhadas de talhões, inclua-as.',
                        '- Se a mesma fazenda aparecer em mais de uma página some as áreas em uma única entrada e combine a lista de talhões.',
                        '- No "resumoGeral", a chave é o número do bloco como string.',
                        '- Não inclua comentários, texto explicativo nem campos extras, apenas o JSON.'
                    ].join('\n');

                    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + geminiKey;
                    
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            contents: [
                                {
                                    parts: [
                                        { text: prompt },
                                        { text: fullText }
                                    ]
                                }
                            ],
                            generationConfig: {
                                response_mime_type: 'application/json'
                            }
                        })
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        const candidates = data && Array.isArray(data.candidates) ? data.candidates : [];
                        if (candidates.length && candidates[0].content && Array.isArray(candidates[0].content.parts)) {
                            const rawText = candidates[0].content.parts.map(p => p.text || '').join('');
                            console.log('Gemini raw text:', rawText);
                            const parseGeminiJson = (text) => {
                                if (!text) return null;
                                let cleaned = String(text).trim();
                                if (!cleaned) return null;
                                if (cleaned.startsWith('```')) {
                                    cleaned = cleaned.replace(/^```json/i, '').replace(/^```/, '');
                                    if (cleaned.endsWith('```')) {
                                        cleaned = cleaned.slice(0, -3);
                                    }
                                    cleaned = cleaned.trim();
                                }
                                const tryParse = (value) => {
                                    try {
                                        return JSON.parse(value);
                                    } catch (_) {
                                        return null;
                                    }
                                };
                                let parsed = tryParse(cleaned);
                                if (parsed) return parsed;
                                const firstBrace = cleaned.indexOf('{');
                                const lastBrace = cleaned.lastIndexOf('}');
                                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                                    let inner = cleaned.slice(firstBrace, lastBrace + 1);
                                    inner = inner.replace(/,\s*(?=[}\]])/g, '');
                                    parsed = tryParse(inner);
                                    if (parsed) return parsed;
                                }
                                return null;
                            };
                            const parsed = parseGeminiJson(rawText);
                            if (parsed && Array.isArray(parsed.fazendas)) {
                                const geminiFazendas = parsed.fazendas.map(f => ({
                                    codigo: f && f.codigo != null ? String(f.codigo).trim() : '',
                                    nome: f && f.nome != null ? String(f.nome).trim() : '',
                                    regiao: f && f.regiao != null ? String(f.regiao).trim() : '',
                                    areaTotal: Number(f.areaTotal) || 0,
                                    talhoes: Array.isArray(f.talhoes) ? f.talhoes : [],
                                    plantioAcumulado: 0,
                                    mudaAcumulada: 0,
                                    observacoes: 'Importado via Gemini (Client-side)'
                                })).filter(f => f.codigo && f.nome);
                                fazendas = geminiFazendas;
                            }
                        }
                    } else {
                        let errText = '';
                        try {
                            errText = await response.text();
                        } catch (_) {}
                        console.error('Erro na requisição ao Gemini:', response.status, response.statusText || '', errText);
                    }
                } catch (e) {
                    console.error('Exceção ao chamar Gemini:', e);
                }
            }
            
            const fallback = this.parseFazendasFromText(fullText);
            
            // Lógica de prioridade: Se o Gemini retornou dados, confiamos nele e ignoramos o fallback.
            // Se o Gemini falhou ou não retornou nada, usamos o fallback.
            if (fazendas.length > 0) {
                this.ui.showNotification(`IA identificou ${fazendas.length} fazendas.`, 'success', 3000);
            } else if (Array.isArray(fallback) && fallback.length) {
                fazendas = fallback;
                this.ui.showNotification('Uso de leitura padrão do PDF (IA não retornou dados).', 'warning', 4000);
            }

            if (!fazendas.length) {
                this.ui.showNotification('Nenhuma fazenda encontrada no PDF. Verifique o formato.', 'warning', 4000);
                return;
            }
            
            this.hideProgress(); // Force hide before preview
            this.openFazendaImportPreview(fazendas);
        } catch (e) {
            this.ui.showNotification('Erro ao ler PDF de fazendas', 'error', 4000);
            console.error('Erro na leitura de PDF de fazendas:', e);
        } finally {
            this.hideProgress();
            this.ui.hideLoading(); // Garantia extra
        }
    }

    parseFazendasFromText(text) {
        if (!text) return [];
        const cleaned = text.replace(/\r/g, '');
        const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l);
        const result = [];
        for (const line of lines) {
            const normalized = line.replace(/\s+/g, ' ');
            if (!normalized) continue;
            let parts;
            if (normalized.includes(';')) {
                parts = normalized.split(';').map(p => p.trim()).filter(p => p);
            } else {
                parts = normalized.split(/\s{2,}/).map(p => p.trim()).filter(p => p);
            }
            if (!parts.length) continue;
            const numeros = (parts[0].match(/\d+/g) || []).map(n => n.trim()).filter(n => n);
            if (!numeros.length) continue;
            
            let codigo = '';
            let regiaoFromFirst = '';
            
            if (numeros.length >= 2) {
                // Formato Região/Fazenda (ex: 1/96 -> 1=Região, 96=Fazenda)
                regiaoFromFirst = numeros[0];
                codigo = numeros[1];
            } else {
                codigo = numeros[0];
            }

            const nome = parts[1] ? parts[1].trim() : '';
            const regiaoCandidate = parts[2] ? parts[2].trim() : '';
            const isAreaLike = regiaoCandidate && /,/.test(regiaoCandidate);
            let regiao = regiaoCandidate;
            if ((!regiao || isAreaLike) && regiaoFromFirst) regiao = regiaoFromFirst;
            let areaTotal = 0;
            if (parts[3]) {
                const n = parseFloat(parts[3].replace('.', '').replace(',', '.'));
                if (!isNaN(n)) areaTotal = n;
            }
            if (!nome) continue;
            result.push({
                codigo,
                nome,
                regiao,
                areaTotal,
                plantioAcumulado: 0,
                mudaAcumulada: 0,
                observacoes: 'Importado do PDF'
            });
        }
        if (result.length) return result;
        const headerIndex = lines.findIndex(l => /caderno de mapas/i.test(l));
        let regiao = '';
        if (headerIndex > 0) regiao = lines[headerIndex - 1];
        const blocoMatch = cleaned.match(/(\d+)\s*·\s*([A-Z0-9ÇÃÕÁÉÍÓÚÂÊÔ\s]+)/);
        let codigo = '';
        let nome = '';
        if (blocoMatch) {
            codigo = blocoMatch[1];
            nome = blocoMatch[2].trim();
        }
        const totalLine = lines.find(l => /total\/m[eé]dia/i.test(l)) || '';
        const areaPattern = /(\d{1,3}(?:\.\d{3})*,\d{2})/g;
        let areaMatch = null;
        if (totalLine) {
            const m = totalLine.match(areaPattern);
            if (m && m.length) areaMatch = m[m.length - 1];
        }
        if (!areaMatch) {
            const m = cleaned.match(areaPattern);
            if (m && m.length) areaMatch = m[m.length - 1];
        }
        let areaTotal = 0;
        if (areaMatch) {
            const n = parseFloat(areaMatch.replace('.', '').replace(',', '.'));
            if (!isNaN(n)) areaTotal = n;
        }
        if (codigo && nome) {
            return [{
                codigo,
                nome,
                regiao,
                areaTotal,
                plantioAcumulado: 0,
                mudaAcumulada: 0,
                observacoes: 'Importado do PDF (Caderno de Mapas)'
            }];
        }
        return [];
    }

    openFazendaImportPreview(fazendas) {
        this.fazendaImportPreview = Array.isArray(fazendas) ? fazendas : [];
        const modal = document.getElementById('fazenda-import-modal');
        const container = document.getElementById('fazenda-import-preview');
        if (!modal || !container) return;
        if (!this.fazendaImportPreview.length) {
            container.innerHTML = '<p>Nenhum dado de fazenda encontrado.</p>';
        } else {
            const rows = this.fazendaImportPreview.slice(0, 100).map(f => `
                <tr>
                    <td>${f.codigo}</td>
                    <td>${f.nome}</td>
                    <td>${f.regiao || ''}</td>
                    <td>${(f.areaTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>${Array.isArray(f.talhoes) ? f.talhoes.length : 0}</td>
                </tr>
            `).join('');
            container.innerHTML = `
                <p>Pré-visualização das fazendas detectadas no PDF (${this.fazendaImportPreview.length} registro(s)):</p>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Nome</th>
                                <th>Região</th>
                                <th>Área total (ha)</th>
                                <th>Talhões</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            `;
        }
        modal.style.display = 'flex';
    }

    async runFazendaImportFromPreview() {
        const data = Array.isArray(this.fazendaImportPreview) ? this.fazendaImportPreview : [];
        if (!data.length) {
            this.ui.showNotification('Nenhuma fazenda para importar', 'warning', 3000);
            return;
        }
        await this.ensureApiReady();
        if (!this.api) {
            this.ui.showNotification('API não disponível', 'error', 3000);
            return;
        }

        this.showProgress('Importando...', 0, `0 de ${data.length}`);
        let created = 0;
        
        for (let i = 0; i < data.length; i++) {
            const f = data[i];
            try {
                const res = await this.api.createFazenda(f);
                if (res && res.success) created++;
            } catch(e) {}
            
            const percent = ((i + 1) / data.length) * 100;
            this.showProgress('Importando...', percent, `${i + 1} de ${data.length} (${Math.floor(percent)}%)`);
        }
        
        this.hideProgress();

        if (!created) {
            this.ui.showNotification('Não foi possível criar cadastros a partir do PDF.', 'warning', 4000);
            return;
        }
        const cadResp = await this.api.getFazendas();
        if (cadResp && cadResp.success && Array.isArray(cadResp.data)) {
            const list = cadResp.data.map(f => ({
                cod: f.codigo,
                nome: f.nome,
                areaTotal: f.area_total,
                plantioAcumulado: f.plantio_acumulado,
                mudaAcumulada: f.muda_acumulada,
                regiao: f.regiao,
                talhoes: f.talhoes || []
            }));
            this.buildCadastroIndex(list);
            this.renderCadastroFazendas(cadResp.data);
        }
        const modal = document.getElementById('fazenda-import-modal');
        if (modal) modal.style.display = 'none';
        this.ui.showNotification(`Importação de fazendas concluída: ${created} cadastro(s).`, 'success', 4000);
    }

    useFazendaInPlantio(codigo) {
        if (!codigo || !this.cadastroFazendas || !this.cadastroFazendas.length) return;
        const item = this.cadastroFazendas.find(f => String(f.codigo) === String(codigo));
        if (!item) return;
        this.ui.switchTab('plantio-dia');

        this.applyCadastroFazendaToPlantio(item);

        this.ui.showNotification('Fazenda aplicada no formulário de plantio', 'success', 1500);
    }

    findFazendaByName(name) {
        if (!name) return null;
        
        // Se this.cadastroFazendas não estiver definido, tenta usar o índice
        if (!this.cadastroFazendas || !this.cadastroFazendas.length) {
            if (this.fazendaIndex && this.fazendaIndex.byName) {
                const info = this.fazendaIndex.byName[name];
                if (info) return { ...info, codigo: info.cod, nome: name };
            }
            // Tenta recarregar se vazio? Não, síncrono.
            return null;
        }

        const normalize = (s) => (s || '').trim().toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
            .replace(/[^a-z0-9\s]/g, " ") // Remove chars especiais
            .replace(/\s+/g, " ") // Remove espaços duplos
            .replace(/^(fazenda|faz|sitio|st|sto|nsa|chacara|unidade|propriedade)\s+/i, "") // Remove prefixos
            .replace(/\b(sra)\b/g, "senhora") // Expandir abreviações comuns
            .replace(/\b(sto)\b/g, "santo")
            .replace(/\b(sta)\b/g, "santa")
            .replace(/\b(nsa)\b/g, "nossa")
            .trim();

        const targetNorm = normalize(name);
        const targetRaw = (name || '').trim().toLowerCase();

        // Estratégia 1: Match exato ou case insensitive
        let found = this.cadastroFazendas.find(f => {
            const fNorm = normalize(f.nome);
            const fRaw = (f.nome || '').trim().toLowerCase();
            return fRaw === targetRaw || fNorm === targetNorm;
        });
        if (found) return found;

        // Estratégia 2: Extração de código do nome alvo (ex: "123 - Fazenda")
        // Aceita hífens, espaços ou outros separadores
        const matchCod = targetRaw.match(/^(\d+)[\s\W]+(.+)$/);
        if (matchCod) {
            const nomeSemCod = normalize(matchCod[2]);
            const codExt = parseInt(matchCod[1]);

            // Tenta achar pelo código
            found = this.cadastroFazendas.find(f => parseInt(f.codigo) === codExt);
            if (found) return found;

            // Tenta achar pelo nome limpo
            found = this.cadastroFazendas.find(f => normalize(f.nome) === nomeSemCod);
            if (found) return found;
        }

        // Estratégia 3: Busca no cadastro por código ou nome embutido
        found = this.cadastroFazendas.find(f => {
            const fNome = (f.nome || '').trim().toLowerCase();
            const fNorm = normalize(f.nome);
            
            // Check regex no cadastro (se o nome no banco for "123 - Fazenda")
            const match = fNome.match(/^(\d+)[\s\W]+(.+)$/);
            if (match && normalize(match[2]) === targetNorm) return true;

            return false;
        });
        
        if (found) return found;

        // Estratégia 4: Busca parcial (contém)
        found = this.cadastroFazendas.find(f => {
            const fNorm = normalize(f.nome);
            // Verifica se um contém o outro (apenas se tiverem tamanho razoável)
            if (targetNorm.length > 1 && fNorm.length > 1) {
                return fNorm.includes(targetNorm) || targetNorm.includes(fNorm);
            }
            return false;
        });

        if (found) return found;

        // Estratégia 5: Token Overlap (Palavras coincidentes)
        // Útil para "Nossa Sra Gui" vs "Nossa Senhora da Guia"
        if (targetNorm.length > 3) {
             const tokensTarget = targetNorm.split(' ').filter(t => t.length > 1);
             if (tokensTarget.length > 0) {
                 found = this.cadastroFazendas.find(f => {
                     const fNorm = normalize(f.nome);
                     const tokensF = fNorm.split(' ');
                     
                     // Conta quantos tokens do target estão presentes no fazenda (match exato ou prefixo)
                     let matches = 0;
                     tokensTarget.forEach(t => {
                         if (tokensF.some(tf => tf === t || tf.startsWith(t) || t.startsWith(tf))) {
                             matches++;
                         }
                     });
                     
                     // Se a maioria dos tokens baterem
                     return matches >= Math.ceil(tokensTarget.length * 0.7);
                 });
             }
        }

        return found;
    }

    applyCadastroFazendaToPlantio(item) {
        if (!item) return;
        this.tempFazendaStats = {
            plantioAcumulado: item.plantio_acumulado || 0,
            mudaAcumulada: item.muda_acumulada || 0,
            cobricaoAcumulada: item.cobricao_acumulada || 0
        };

        const fazendaSingle = document.getElementById('single-fazenda');
        const codSingle = document.getElementById('single-cod');
        const regiaoSingle = document.getElementById('single-regiao');
        const areaTotalSingle = document.getElementById('single-area-total');
        const plantioAcumSingle = document.getElementById('single-area-acumulada');
        const cobricaoAcumSingle = document.getElementById('cobricao-acumulada');
        
        // Lógica de correção: Se o nome vier no formato "1387 - Nome", separar.
        let nomeFinal = item.nome || '';
        let codigoFinal = item.codigo;

        const matchCod = nomeFinal.match(/^(\d+)\s*[-–]\s*(.+)$/);
        if (matchCod) {
            // Prioriza o código extraído do nome, pois o código do banco pode ser gerado aleatório (5 dígitos)
            codigoFinal = matchCod[1];
            // Opcional: Se quiser limpar visualmente o nome no select, teria que alterar as options, 
            // mas como é um select pré-populado, mantemos o valor para casar a seleção.
        }

        if (fazendaSingle) fazendaSingle.value = nomeFinal;
        if (codSingle) codSingle.value = codigoFinal || '';
        if (regiaoSingle) regiaoSingle.value = item.regiao || '';
        if (areaTotalSingle) areaTotalSingle.value = item.area_total != null ? String(item.area_total) : '';
        if (plantioAcumSingle) plantioAcumSingle.value = item.plantio_acumulado != null ? String(item.plantio_acumulado) : '';
        if (cobricaoAcumSingle) cobricaoAcumSingle.value = item.cobricao_acumulada != null ? String(item.cobricao_acumulada) : '';

        this.updateAccumulatedStats();
    }

    async handleCadastroActions() {
        const saveBtn = document.getElementById('cadastro-fazenda-save');
        const novoBtn = document.getElementById('cadastro-fazenda-novo');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                await this.saveCadastroFazenda();
            });
        }
        if (novoBtn) {
            novoBtn.addEventListener('click', () => {
                this.cadastroEditCodigo = null;
                this.clearCadastroFazendaForm();
            });
        }
        const tabela = document.getElementById('cadastro-fazendas-table');
        if (tabela) {
            // Remove listener anterior se existir para evitar duplicação (boa prática, embora cloneNode já limpe)
            // Mas aqui estamos usando cloneNode no tbody ou listener na tabela?
            // O código original usava tabela.addEventListener.
            // Vamos mudar para tbody para ficar consistente com o resto do app e garantir que funcione para elementos dinâmicos.
            
            const tbody = document.getElementById('cadastro-fazendas-body');
            if (tbody) {
                // Clonar para limpar listeners antigos
                const newTbody = tbody.cloneNode(true);
                tbody.parentNode.replaceChild(newTbody, tbody);
                
                newTbody.addEventListener('click', (e) => {
                    const target = e.target;
                    // Check for buttons or their icons/children
                    const editBtn = target.closest('.btn-edit-fazenda');
                    const deleteBtn = target.closest('.btn-delete-fazenda');
                    const usePlantioBtn = target.closest('.btn-use-fazenda-plantio');

                    if (editBtn) {
                        const codigo = editBtn.getAttribute('data-codigo');
                        console.log('Edit Fazenda Clicked, codigo:', codigo);
                        this.editCadastroFazenda(codigo);
                    } else if (deleteBtn) {
                        const codigo = deleteBtn.getAttribute('data-codigo');
                        this.deleteCadastroFazenda(codigo);
                    } else if (usePlantioBtn) {
                        const codigo = usePlantioBtn.getAttribute('data-codigo');
                        this.useFazendaInPlantio(codigo);
                    }
                });
            }
        }

        // 8. Table Delegated Events (View/Edit/Delete)
        const tbody = document.getElementById('transporte-composto-body');
        if (tbody) {
            // Replace with clone to ensure clean slate and no duplicates
            const newTbody = tbody.cloneNode(true);
            tbody.parentNode.replaceChild(newTbody, tbody);

            newTbody.addEventListener('click', (e) => {
                const target = e.target;
                console.log('Composto Tbody click target:', target);
                
                if (target.classList.contains('btn-view-composto') || target.closest('.btn-view-composto')) {
                    const btn = target.classList.contains('btn-view-composto') ? target : target.closest('.btn-view-composto');
                    const id = btn.getAttribute('data-id');
                    console.log('Composto View button clicked, id:', id);
                    this.editComposto(id);
                } else if (target.classList.contains('btn-edit-composto') || target.closest('.btn-edit-composto')) {
                    const btn = target.classList.contains('btn-edit-composto') ? target : target.closest('.btn-edit-composto');
                    const id = btn.getAttribute('data-id');
                    console.log('Composto Edit button clicked, id:', id);
                    this.editComposto(id);
                } else if (target.classList.contains('btn-delete-composto') || target.closest('.btn-delete-composto')) {
                    const btn = target.classList.contains('btn-delete-composto') ? target : target.closest('.btn-delete-composto');
                    const id = btn.getAttribute('data-id');
                    console.log('Composto Delete button clicked, id:', id);
                    this.deleteComposto(id);
                }
            });
        }
    }
    async init() {
        try {
            this.ui.showLoading();
            
            this.initTheme();
            await this.setupEventListeners();
            this.setupAIAnalysis();
            this.setupAdminPanel();
            this.setupVersionCheck();
            await this.ensureApiReady();
            await this.loadStaticData();
            
            // Garantir que os dados do usuário (role/permissions) estejam atualizados
            if (this.api) await this.api.me();
            
            // Verificar autenticação
            if (this.api && this.api.user) {
                this.hideLoginScreen();
                
                // Verificar metadados
                const meta = this.api.user.user_metadata || {};
                if (!meta.nome || !meta.matricula) {
                    const updateScreen = document.getElementById('update-profile-screen');
                    if (updateScreen) updateScreen.style.display = 'flex';
                }
            } else {
                this.showLoginScreen();
            }

            this.updateCurrentUserUI();
            await this.loadInitialData();
            
            this.ui.hideLoading();
            this.ui.showNotification('Sistema carregado com sucesso!', 'success', 2000);
            
        } catch (error) {
            this.ui.hideLoading();
            this.ui.showNotification('Erro ao inicializar o sistema', 'error');
            console.error('Initialization error:', error);
        }
    }

    initTheme() {
        const saved = localStorage.getItem('theme') || 'light';
        const isDark = saved === 'dark';
        document.body.classList.toggle('theme-dark', isDark);
    }

    // Adicione esta função à classe InsumosApp
forceReloadAllData() {
    console.log('🔄 Forçando recarregamento de todos os dados...');
    this.api.clearCache();
    
    // Recarregar dados estáticos
    this.loadStaticData().then(() => {
        // Recarregar dados da tab atual
        const currentTab = this.getCurrentTab();
        this.loadTabData(currentTab);
        
        this.ui.showNotification('Dados recarregados com sucesso!', 'success');
    });
}

    setupPlantioTabs() {
        const tabs = document.querySelectorAll('.plantio-tab-btn');
        if (!tabs.length) return;

        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Remove active class from all
                tabs.forEach(t => t.classList.remove('active'));
                
                // Add active class to clicked
                const target = e.currentTarget;
                target.classList.add('active');
                
                // Update state and render
                this.plantioTab = target.dataset.tab;
                this.renderPlantioDia();
            });
        });
    }

    setupPlantioSummaryListeners() {
        const updateSummary = () => this.updatePlantioSummary();

        const ids = [
            'plantio-data', 
            'single-frente', 
            'single-plantio-dia', 
            'insumos-total-gasto' // This might need a mutation observer if it's not an input
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', updateSummary);
                el.addEventListener('input', updateSummary);
            }
        });

        // For calculated fields like total cost, we might want to observe changes or just rely on the fact that
        // functions updating them should also call updatePlantioSummary or trigger an event.
        // Since updatePlantioSummary reads from the DOM, we should call it whenever we update those fields in JS too.
    }

    async setupEventListeners() {
        this.setupPlantioTabs();
        this.setupPlantioSummaryListeners();
        this.initPlantioModalSteps();
        this.initGenericModalSteps(); // Initialize generic steps for Adubo/Composto
        this.setupViagemAduboListeners();
        this.setupCompostoListeners(); // Ensure Composto listeners are set on startup
        this._compostoListenersSet = true;
        // Modal de Gerenciar Fazendas
        const btnOpenFazendas = document.getElementById('btn-open-fazendas-modal');
        const fazendasModal = document.getElementById('fazendas-modal');
        const closeFazendasButtons = document.querySelectorAll('.close-fazendas-modal');

        if (btnOpenFazendas && fazendasModal) {
            btnOpenFazendas.addEventListener('click', async () => {
                fazendasModal.style.display = 'flex';
                
                // Re-renderizar ou carregar se necessário
                if (!this.cadastroFazendas || this.cadastroFazendas.length === 0) {
                    const tbody = document.getElementById('cadastro-fazendas-body');
                    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="loading">🔄 Recarregando dados...</td></tr>';
                    
                    try {
                        const res = await this.api.getFazendas();
                        if (res && res.success && Array.isArray(res.data)) {
                            this.renderCadastroFazendas(res.data);
                        } else {
                            if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="loading">⚠️ Não foi possível carregar as fazendas.</td></tr>';
                        }
                    } catch (e) {
                        console.error('Erro ao carregar fazendas no modal:', e);
                        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="loading">❌ Erro ao carregar dados.</td></tr>';
                    }
                } else {
                    this.renderCadastroFazendas(this.cadastroFazendas);
                }
            });
        }

        closeFazendasButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (fazendasModal) fazendasModal.style.display = 'none';
            });
        });

        if (fazendasModal) {
            window.addEventListener('click', (e) => {
                if (e.target === fazendasModal) {
                    fazendasModal.style.display = 'none';
                }
            });
        }

        // Modal Novo Lançamento Plantio
        const btnNovoLancamento = document.getElementById('btn-novo-lancamento');
        const novoLancamentoModal = document.getElementById('novo-lancamento-modal');
        const closeNovoLancamentoButtons = document.querySelectorAll('.close-novo-lancamento-modal');

        if (btnNovoLancamento && novoLancamentoModal) {
            btnNovoLancamento.addEventListener('click', async () => {
                this.resetPlantioForm();
                // Forçar tipo plantio caso tenha sido alterado antes
                const tipoOp = document.getElementById('tipo-operacao');
                if (tipoOp) {
                    tipoOp.value = 'plantio';
                    this.toggleOperacaoSections();
                }
                novoLancamentoModal.style.display = 'flex';


                // Garantir que a lista de OS e Frentes esteja carregada
                await this.loadOSList();
                
                // Carregar lista de produtos para o datalist
                this.loadProdutosDatalist();
            });

            // Novo botão para Qualidade de Muda
            const btnNovaQualidadeMuda = document.getElementById('btn-nova-qualidade-muda');
            if (btnNovaQualidadeMuda) {
                btnNovaQualidadeMuda.addEventListener('click', async () => {
                    this.resetPlantioForm('qualidade');
                    // Não adicionar opção ao select - manter isolado
                    // O toggleOperacaoSections vai esconder o select e mostrar apenas os campos de qualidade
                    
                    const modalTitle = document.getElementById('modal-novo-plantio-title');
                    if (modalTitle) {
                        modalTitle.textContent = 'Novo Lançamento de Qualidade';
                    }

                    novoLancamentoModal.style.display = 'flex';
                    await this.loadOSList();
                    this.loadProdutosDatalist();
                    await this.loadLiberacoesForSelect();
                    // Populate single-frente based on default quality type (plantio)
                    this.populateSingleFrente('plantio');
                this.initQualidadePlantioCanaListeners();
                });
            }

            // Listener para Select de Tipo de Qualidade
            const qualTipoSelect = document.getElementById('qualidade-tipo-select');
            if (qualTipoSelect) {
                qualTipoSelect.addEventListener('change', () => {
                    this.toggleOperacaoSections();
                    this.populateSingleFrente(qualTipoSelect.value);
                if (this.isQualidadeMode && qualTipoSelect.value === 'plantio_cana') {
                    this.initQualidadePlantioCanaListeners();
                }
                });
            }

            // Remove listener for deleted button
            /*
            // Novo botão para Colheita de Muda (Restaurado)
            const btnNovaColheitaMuda = document.getElementById('btn-nova-colheita-muda');
            if (btnNovaColheitaMuda) {
                btnNovaColheitaMuda.addEventListener('click', async () => {
                    ...
                });
            }
            */

            const tipoOperacaoSelect = document.getElementById('tipo-operacao');
            if (tipoOperacaoSelect) {
                tipoOperacaoSelect.addEventListener('change', () => {
                    this.toggleOperacaoSections();
                });
            }
        }

        closeNovoLancamentoButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (novoLancamentoModal) novoLancamentoModal.style.display = 'none';
                this.resetPlantioForm();
            });
        });

        if (novoLancamentoModal) {
            window.addEventListener('click', (e) => {
                if (e.target === novoLancamentoModal) {
                    novoLancamentoModal.style.display = 'none';
                    this.resetPlantioForm();
                }
            });
        }

        // Modal Liberação de Colheita
        const btnLiberacao = document.getElementById('btn-liberacao-colheita');
        const liberacaoModal = document.getElementById('liberacao-modal');
        const closeLiberacaoButtons = document.querySelectorAll('.close-liberacao-modal');
        const btnSaveLiberacao = document.getElementById('btn-save-liberacao');

        const btnNovaLiberacao = document.getElementById('btn-nova-liberacao');
        const btnVoltarLiberacaoList = document.getElementById('btn-voltar-liberacao-list');

        
        if (btnLiberacao && liberacaoModal) {
            btnLiberacao.addEventListener('click', async () => {
                liberacaoModal.style.display = 'flex';
                this.toggleLiberacaoView('list');
                await this.renderLiberacoesList();
            });
        }

        if (btnNovaLiberacao) {
            btnNovaLiberacao.addEventListener('click', async () => {
                this.toggleLiberacaoView('form');
                // Reset form
                this.liberacaoTalhoesDraft = [];
                this.renderLiberacaoTalhoes();
                document.getElementById('liberacao-form').reset();
                
                const dateInput = document.getElementById('liberacao-data');
                if (dateInput) dateInput.valueAsDate = new Date();

                await this.populateLiberacaoOptions();
            });
        }

        if (btnVoltarLiberacaoList) {
            btnVoltarLiberacaoList.addEventListener('click', () => {
                this.toggleLiberacaoView('list');
                this.renderLiberacoesList();
            });
        }

        if (closeLiberacaoButtons) {
            closeLiberacaoButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    if (liberacaoModal) liberacaoModal.style.display = 'none';
                });
            });
        }

        // Liberacao - Listeners for new fields
        const libFazendaSelect = document.getElementById('liberacao-fazenda');
        const libAddTalhaoBtn = document.getElementById('btn-add-liberacao-talhao');
        const libTalhoesBody = document.getElementById('liberacao-talhoes-body');
        const libTalhaoSelect = document.getElementById('liberacao-talhao-add');

        if (libFazendaSelect) {
            libFazendaSelect.addEventListener('change', async () => {
                const codInput = document.getElementById('liberacao-cod-fazenda');
                const selectedCod = libFazendaSelect.value;
                if (codInput) codInput.value = selectedCod || '';
                
                // Populate Talhoes based on selected Fazenda
                if (libTalhaoSelect) {
                    libTalhaoSelect.innerHTML = '<option value="">Carregando...</option>';
                    document.getElementById('liberacao-area-add').value = '';
                    
                    if (selectedCod) {
                        try {
                            // Find fazenda name
                            const f = this.cadastroFazendas.find(x => String(x.codigo) === String(selectedCod));
                            if (f) {
                                let talhoesSource = [];
                                
                                // Priority 1: Talhoes from Farm Import (PDF/Gemini)
                                if (f.talhoes && Array.isArray(f.talhoes) && f.talhoes.length > 0) {
                                     talhoesSource = f.talhoes.map(t => ({ cod: t.numero, areaTalhao: t.area }));
                                } 
                                
                                // Priority 2: Legacy (Insumos) if empty
                                if (talhoesSource.length === 0) {
                                     // Fetch insumos_fazendas to get talhoes
                                     const res = await this.api.getInsumosFazendas({ fazenda: f.nome });
                                     if (res && res.success && res.data) {
                                         talhoesSource = res.data;
                                     }
                                }

                                libTalhaoSelect.innerHTML = '<option value="">Selecione...</option>';
                                
                                if (talhoesSource.length > 0) {
                                    // Extract unique talhoes (cod) and their areas
                                    const talhoesMap = new Map();
                                    talhoesSource.forEach(item => {
                                        const cod = item.cod || item.numero;
                                        const area = item.areaTalhao || item.area;
                                        if (cod) talhoesMap.set(String(cod), area);
                                    });

                                    if (talhoesMap.size > 0) {
                                        const sortedTalhoes = Array.from(talhoesMap.keys()).sort((a, b) => {
                                             const na = parseFloat(a);
                                             const nb = parseFloat(b);
                                             if (!isNaN(na) && !isNaN(nb)) return na - nb;
                                             return a.localeCompare(b);
                                        });
                                        sortedTalhoes.forEach(t => {
                                            const opt = document.createElement('option');
                                            opt.value = t;
                                            opt.dataset.area = talhoesMap.get(t);
                                            opt.textContent = t;
                                            libTalhaoSelect.appendChild(opt);
                                        });
                                    } else {
                                        libTalhaoSelect.innerHTML = '<option value="">Nenhum talhão encontrado</option>';
                                    }
                                } else {
                                    libTalhaoSelect.innerHTML = '<option value="">Nenhum talhão encontrado</option>';
                                }
                            }
                        } catch (e) {
                            console.error('Error fetching talhoes', e);
                            libTalhaoSelect.innerHTML = '<option value="">Erro</option>';
                        }
                    } else {
                        libTalhaoSelect.innerHTML = '<option value="">Selecione...</option>';
                    }
                }
            });
        }

        if (libTalhaoSelect) {
            libTalhaoSelect.addEventListener('change', () => {
                const areaInput = document.getElementById('liberacao-area-add');
                const selectedOpt = libTalhaoSelect.selectedOptions[0];
                if (selectedOpt && selectedOpt.dataset.area && areaInput) {
                    areaInput.value = selectedOpt.dataset.area;
                } else if (areaInput) {
                    areaInput.value = '';
                }
            });
        }

        if (libAddTalhaoBtn) {
            libAddTalhaoBtn.onclick = (e) => {
                if(e) e.preventDefault();
                const tInput = document.getElementById('liberacao-talhao-add');
                const vInput = document.getElementById('liberacao-variedade-add');
                const aInput = document.getElementById('liberacao-area-add');
                
                const tVal = tInput ? tInput.value : '';
                const vVal = vInput ? vInput.value.trim() : '';
                
                let aValRaw = aInput ? aInput.value : '';
                if (aValRaw && typeof aValRaw === 'string') aValRaw = aValRaw.replace(',', '.');
                const aVal = parseFloat(aValRaw);

                if (!tVal || String(tVal).trim() === '' || isNaN(aVal) || aVal <= 0) {
                    this.ui.showNotification('Selecione um talhão e informe uma área válida', 'warning');
                    return;
                }

                this.liberacaoTalhoesDraft.push({ talhao: tVal, variedade: vVal, area: aVal });
                this.renderLiberacaoTalhoes();
                
                if (tInput) tInput.value = '';
                if (vInput) vInput.value = '';
                if (aInput) aInput.value = '';
                if (tInput) tInput.focus();
            };
        }

        if (libTalhoesBody) {
            libTalhoesBody.addEventListener('click', (e) => {
                if (e.target.closest('.btn-delete-lib-talhao')) {
                    const idx = parseInt(e.target.closest('.btn-delete-lib-talhao').dataset.idx);
                    if (!isNaN(idx)) {
                        this.liberacaoTalhoesDraft.splice(idx, 1);
                        this.renderLiberacaoTalhoes();
                    }
                }
            });
        }

        if (btnSaveLiberacao) {
            btnSaveLiberacao.addEventListener('click', async () => {
                console.log('Iniciando salvamento de liberação...');
                const numeroInput = document.getElementById('liberacao-numero');
                const dataInput = document.getElementById('liberacao-data');
                const frenteInput = document.getElementById('liberacao-frente');
                const fazendaInput = document.getElementById('liberacao-fazenda'); // Value is codigo
                const statusInput = document.getElementById('liberacao-status');
                const obsInput = document.getElementById('liberacao-obs');

                const numero = numeroInput ? numeroInput.value.trim() : '';
                const data = dataInput ? dataInput.value : '';
                const frente = frenteInput ? frenteInput.value : '';
                const fazendaCod = fazendaInput ? fazendaInput.value : '';
                const status = statusInput ? statusInput.value : 'Aberto';
                const obs = obsInput ? obsInput.value : '';

                // Get Fazenda Nome for consistency if needed, but saving Cod is better. 
                // Legacy api might expect Name. Let's find name.
                let fazendaNome = '';
                if (fazendaCod) {
                    const f = this.cadastroFazendas.find(x => String(x.codigo) === String(fazendaCod));
                    if (f) fazendaNome = f.nome;
                }

                if (!numero || !data || !fazendaCod) {
                    this.ui.showNotification('Preencha os campos obrigatórios (Número, Data, Fazenda)', 'error');
                    return;
                }

                if (this.liberacaoTalhoesDraft.length === 0) {
                    this.ui.showNotification('Adicione pelo menos um talhão', 'warning');
                    return;
                }

                const totalHa = this.liberacaoTalhoesDraft.reduce((acc, cur) => acc + cur.area, 0);

                try {
                    this.ui.showLoading();
                    console.log('Chamando api.saveLiberacaoColheita', { numero, data, fazendaCod, totalHa });
                    await this.api.saveLiberacaoColheita({
                        numero_liberacao: numero,
                        data, 
                        frente, 
                        fazenda_codigo: fazendaCod,
                        fazenda: fazendaNome || fazendaCod, // Send name if API expects name, or both
                        talhoes: this.liberacaoTalhoesDraft, // Array of objects
                        area_total: totalHa,
                        status, 
                        observacoes: obs
                    });
                    this.ui.showNotification('Registro de liberação salvo com sucesso!', 'success');
                    this.toggleLiberacaoView('list');
                    this.renderLiberacoesList();
                } catch (error) {
                    console.error('Erro no saveLiberacaoColheita:', error);
                    const msg = error.message || JSON.stringify(error);
                    this.ui.showNotification('Erro ao salvar liberação: ' + msg, 'error');
                } finally {
                    this.ui.hideLoading();
                }
            });
        }

        // Modal de OS
        const btnOS = document.getElementById('btn-os');
        const osModal = document.getElementById('os-modal');
        const closeOSButtons = document.querySelectorAll('.close-os-modal');
        const btnNovaOS = document.getElementById('btn-nova-os');
        const btnVoltarOSList = document.getElementById('btn-voltar-os-list');

        if (btnOS && osModal) {
            btnOS.addEventListener('click', () => {
                osModal.style.display = 'flex';
                this.loadOSList();
                this.showOSList();
            });
        }

        if (closeOSButtons) {
            closeOSButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    if (osModal) osModal.style.display = 'none';
                });
            });
        }

        if (btnNovaOS) {
            btnNovaOS.addEventListener('click', () => {
                this.resetOSForm();
                this.showOSForm();
            });
        }

        if (btnVoltarOSList) {
            btnVoltarOSList.addEventListener('click', () => {
                this.showOSList();
            });
        }

        const osListBody = document.getElementById('os-list-body');
        if (osListBody) {
            osListBody.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-edit-os')) {
                    const numero = e.target.getAttribute('data-numero');
                    this.handleEditOS(numero);
                }
                if (e.target.classList.contains('btn-delete-os')) {
                    const numero = e.target.getAttribute('data-numero');
                    this.handleDeleteOS(numero);
                }
            });
        }

        // Navegação por tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.getAttribute('data-tab');
                this.ui.switchTab(tabName);
                this.loadTabData(tabName);
                
                // Removido trigger automático duplicado para evitar loops
                // O carregamento agora é feito dentro de loadTabData
            });
        });

        // Filtros INSUMOS
        const applyInsumosBtn = document.getElementById('apply-insumos-filters');
        const resetInsumosBtn = document.getElementById('reset-insumos-filters');
        
        if (applyInsumosBtn) {
            applyInsumosBtn.addEventListener('click', () => {
                this.applyInsumosFilters();
            });
        }
        
        if (resetInsumosBtn) {
            resetInsumosBtn.addEventListener('click', () => {
                this.resetInsumosFilters();
            });
        }

        // Botão Imprimir Relatório
        const btnPrintReport = document.getElementById('btn-print-report');
        if (btnPrintReport) {
            btnPrintReport.addEventListener('click', () => {
                this.handlePrintReport();
            });
        }

        // Botões gerais
        const addBtn = document.getElementById('add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.openInsumoModal('add');
            });
        }

        const importBtn = document.getElementById('import-btn');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                if (window.importManager) {
                    window.importManager.openImportModal();
                } else {
                    this.ui.showNotification('Sistema de importação não inicializado', 'error');
                }
            });
        }

        const exportCsvBtn = document.getElementById('export-csv-btn');
        if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => this.exportCSV());
        const exportExcelBtn = document.getElementById('export-excel-btn');
        if (exportExcelBtn) exportExcelBtn.addEventListener('click', () => this.exportExcel());
        const exportPdfBtn = document.getElementById('export-pdf-btn');
        if (exportPdfBtn) exportPdfBtn.addEventListener('click', () => this.exportPDF());

        const moreActionsBtn = document.getElementById('more-actions-btn');
        const moreActionsMenu = document.getElementById('more-actions-menu');
        if (moreActionsBtn && moreActionsMenu) {
            moreActionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                moreActionsMenu.classList.toggle('show');
            });
            document.addEventListener('click', () => {
                moreActionsMenu.classList.remove('show');
            });
        }

        const clearImportBtn = document.getElementById('clear-import-btn');
        if (clearImportBtn) {
            clearImportBtn.addEventListener('click', async () => {
                const ok = window.confirm('Deseja realmente limpar o histórico de importação?');
                if (!ok) return;
                try {
                    const res = await this.api.clearImportData();
                    if (res && res.success !== false) {
                        this.ui.showNotification('Histórico limpo com sucesso!', 'success', 2000);
                        await this.refreshData();
                    } else {
                        this.ui.showNotification('Erro ao limpar histórico', 'error');
                    }
                } catch(e) { this.ui.showNotification('Erro ao limpar histórico', 'error'); }
            });
        }

        const clearAllBtn = document.getElementById('clear-all-btn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', async () => {
                const ok = window.confirm('ATENÇÃO: Esta ação excluirá todos os dados e estoque. Confirmar?');
                if (!ok) return;
                try {
                    const res = await this.api.clearAll();
                    if (res && res.success) {
                        this.ui.showNotification('Todos os dados foram excluídos!', 'success', 2000);
                        await this.refreshData();
                    } else {
                        this.ui.showNotification('Erro ao excluir todos os dados', 'error');
                    }
                } catch(e) { this.ui.showNotification('Erro ao excluir todos os dados', 'error'); }
            });
        }

        const importFazendaPdfBtn = document.getElementById('cadastro-fazenda-import-pdf');
        const importFazendaPdfInput = document.getElementById('cadastro-fazenda-pdf-input');
        if (importFazendaPdfBtn && importFazendaPdfInput) {
            importFazendaPdfBtn.addEventListener('click', () => {
                importFazendaPdfInput.value = '';
                importFazendaPdfInput.click();
            });
            importFazendaPdfInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) this.handleFazendaPdfFile(file);
            });
        }

        const fazendaImportClose = document.getElementById('fazenda-import-close');
        const fazendaImportCancel = document.getElementById('fazenda-import-cancel');
        const fazendaImportConfirm = document.getElementById('fazenda-import-confirm');
        const fazendaImportModal = document.getElementById('fazenda-import-modal');
        if (fazendaImportClose && fazendaImportModal) {
            fazendaImportClose.addEventListener('click', () => {
                fazendaImportModal.style.display = 'none';
            });
        }
        if (fazendaImportCancel && fazendaImportModal) {
            fazendaImportCancel.addEventListener('click', () => {
                fazendaImportModal.style.display = 'none';
            });
        }
        if (fazendaImportConfirm) {
            fazendaImportConfirm.addEventListener('click', async () => {
                await this.runFazendaImportFromPreview();
            });
        }

        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const isDark = document.body.classList.toggle('dark-mode');
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
            });
            
            // Restore theme on load
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-mode');
            }
        }
        const estoqueSaveBtn = document.getElementById('estoque-save-btn');
        if (estoqueSaveBtn) {
            estoqueSaveBtn.addEventListener('click', async () => {
                const frente = document.getElementById('estoque-frente')?.value;
                const produto = document.getElementById('estoque-produto')?.value;
                const quantidadeStr = document.getElementById('estoque-quantidade')?.value;
                const quantidade = quantidadeStr ? parseFloat(quantidadeStr) : 0;
                const osManual = document.getElementById('estoque-os-manual')?.value;

                if (!frente || !produto || !quantidade || isNaN(quantidade)) {
                    this.ui.showNotification('Preencha frente, produto e quantidade', 'warning');
                    return;
                }
                try {
                    // Passando OS manual se selecionada
                    const res = await this.api.setEstoque(frente, produto, quantidade, osManual);
                    if (res && res.success) {
                        this.ui.showNotification('Estoque salvo!', 'success', 2000);
                        await this.loadEstoqueAndRender();
                    } else {
                        this.ui.showNotification('Erro ao salvar estoque', 'error');
                    }
                } catch(e) {
                    this.ui.showNotification('Erro ao salvar estoque', 'error');
                }
            });
        }

        const btnSyncEstoque = document.getElementById('btn-sync-estoque');
        if (btnSyncEstoque) {
            btnSyncEstoque.addEventListener('click', async () => {
                await this.syncAllEstoqueFromOS();
            });
        }

        const chartsOrderSelect = document.getElementById('charts-order-select');
        if (chartsOrderSelect) {
            chartsOrderSelect.addEventListener('change', () => {
                this.chartOrder = chartsOrderSelect.value || 'az';
                if (this.insumosFazendasData && this.insumosFazendasData.length) {
                    this.updateCharts(this.insumosFazendasData);
                    this.renderPlantioChart(); // Atualiza o novo gráfico também
                }
            });
        }
        
        try {
            this.setupMetaListeners();
        } catch (e) {
            console.error('Error setting up meta listeners:', e);
        }

        try {
            await this.setupLegacyListeners();
        } catch (e) {
            console.error('Error setting up legacy listeners:', e);
        }

        try {
            await this.loadMetasUI(true);
        } catch (e) {
            console.error('Error loading metas UI:', e);
        }
        
        this.setupDashboardListeners();
        this.setupOSListeners();
        this.legacyListenersAttached = true;
        console.log('setupEventListeners completed');
    }

    async populateLiberacaoOptions() {
        // Populate Frentes from OS
        const frenteSelect = document.getElementById('liberacao-frente');
        if (frenteSelect) {
            frenteSelect.innerHTML = '<option value="">Selecione...</option>';
            try {
                // Ensure OS list is loaded or fetch it
                const res = await this.api.getOSList();
                if (res && res.success && res.data) {
                    const frentes = [...new Set(res.data.map(os => os.frente).filter(f => f))].sort();
                    frentes.forEach(f => {
                        const opt = document.createElement('option');
                        opt.value = f;
                        opt.textContent = f;
                        frenteSelect.appendChild(opt);
                    });
                }
            } catch (e) { console.error('Error fetching OS for frentes', e); }
        }

        // Populate Fazendas
        const fazendaSelect = document.getElementById('liberacao-fazenda');
        if (fazendaSelect) {
            fazendaSelect.innerHTML = '<option value="">Selecione a Fazenda...</option>';
            if (this.cadastroFazendas && this.cadastroFazendas.length) {
                // Sort by name
                const sorted = [...this.cadastroFazendas].sort((a,b) => (a.nome||'').localeCompare(b.nome||''));
                sorted.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f.codigo; // Use Code as value
                    opt.textContent = `${f.nome} (Cód: ${f.codigo})`;
                    fazendaSelect.appendChild(opt);
                });
            }
        }
    }

    toggleLiberacaoView(mode) {
        const viewList = document.getElementById('liberacao-view-list');
        const viewForm = document.getElementById('liberacao-view-form');
        if (!viewList || !viewForm) return;

        if (mode === 'list') {
            viewList.style.display = 'block';
            viewForm.style.display = 'none';
        } else {
            viewList.style.display = 'none';
            viewForm.style.display = 'block';
        }
    }

    async renderLiberacoesList() {
        const tbody = document.getElementById('liberacao-list-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="6" class="loading">Carregando...</td></tr>';

        try {
            const res = await this.api.getLiberacaoColheita();
            if (res.success && res.data) {
                this.liberacaoColheitaData = res.data; // Cache it
                
                if (res.data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhuma liberação encontrada.</td></tr>';
                    return;
                }

                tbody.innerHTML = res.data.map(item => {
                    return `
                        <tr>
                            <td>${item.numero_liberacao}</td>
                            <td>${this.ui.formatDateBR(item.data)}</td>
                            <td>${item.frente || '-'}</td>
                            <td>${item.fazenda || '-'}</td>
                            <td><span class="status-badge status-${(item.status||'').toLowerCase()}">${item.status}</span></td>
                            <td>
                                <button class="btn btn-sm btn-secondary" onclick="window.insumosApp.editLiberacao('${item.numero_liberacao}')">✏️</button>
                                <button class="btn btn-sm btn-danger" style="background-color:#e74c3c; color:white;" onclick="window.insumosApp.deleteLiberacao('${item.numero_liberacao}')">🗑️</button>
                            </td>
                        </tr>
                    `;
                }).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="6" class="loading">Erro ao carregar dados.</td></tr>';
            }
        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="6" class="loading">Erro ao carregar dados.</td></tr>';
        }
    }

    async editLiberacao(numero) {
        const item = (this.liberacaoColheitaData || []).find(x => String(x.numero_liberacao) === String(numero));
        if (!item) return;

        this.toggleLiberacaoView('form');
        await this.populateLiberacaoOptions();

        // Fill form
        const numInput = document.getElementById('liberacao-numero');
        if(numInput) numInput.value = item.numero_liberacao;
        
        const dateInput = document.getElementById('liberacao-data');
        if(dateInput) dateInput.value = item.data;
        
        const frenteInput = document.getElementById('liberacao-frente');
        if(frenteInput) frenteInput.value = item.frente;
        
        const fazendaInput = document.getElementById('liberacao-fazenda');
        if(fazendaInput) {
            // Try matching by code or name if code not available
            fazendaInput.value = item.fazenda_codigo || '';
            // If code didn't work (maybe stored by name?), try finding by name
            if (!fazendaInput.value && item.fazenda) {
                 const f = this.cadastroFazendas.find(x => x.nome === item.fazenda);
                 if(f) fazendaInput.value = f.codigo;
            }
            // Trigger change to populate talhoes options for this farm
            fazendaInput.dispatchEvent(new Event('change'));
        }
        
        const codInput = document.getElementById('liberacao-cod-fazenda');
        if(codInput) codInput.value = item.fazenda_codigo || '';
        
        const statusInput = document.getElementById('liberacao-status');
        if(statusInput) statusInput.value = item.status || 'Aberto';
        
        const obsInput = document.getElementById('liberacao-obs');
        if(obsInput) obsInput.value = item.observacoes || '';

        this.liberacaoTalhoesDraft = item.talhoes || [];
        this.renderLiberacaoTalhoes();
    }
    
    async deleteLiberacao(numero) {
        if (!confirm(`Deseja excluir a liberação ${numero}?`)) return;
        
        try {
             const { error } = await this.api.supabase.from('liberacao_colheita').delete().eq('numero_liberacao', numero);
             if (error) throw error;
             
             await this.api.logAction('DELETE_LIBERACAO', { numero });
             this.renderLiberacoesList();
        } catch(e) {
            alert('Erro ao excluir: ' + e.message);
        }
    }

    renderLiberacaoTalhoes() {
        const tbody = document.getElementById('liberacao-talhoes-body');
        const totalEl = document.getElementById('liberacao-total-ha');
        if (!tbody) return;

        tbody.innerHTML = '';
        let total = 0;

        this.liberacaoTalhoesDraft.forEach((item, idx) => {
            total += item.area;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.talhao}</td>
                <td>${item.variedade || '-'}</td>
                <td>${this.ui.formatNumber(item.area, 2)}</td>
                <td><button type="button" class="btn btn-delete btn-delete-lib-talhao" data-idx="${idx}" style="padding: 2px 6px;">🗑️</button></td>
            `;
            tbody.appendChild(tr);
        });

        if (totalEl) totalEl.textContent = `${this.ui.formatNumber(total, 2)} ha`;
    }

    setupDashboardListeners() {
        const btnRefresh = document.getElementById('btn-refresh-dashboard');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => this.loadDashboard());
        }

        const periodoSelect = document.getElementById('dashboard-periodo');
        if (periodoSelect) {
            periodoSelect.addEventListener('change', () => this.loadDashboard());
        }
        
        // Config metas button
        const btnConfigMetas = document.getElementById('btn-config-metas');
        if (btnConfigMetas) {
            btnConfigMetas.addEventListener('click', () => {
                 this.openMetasModal();
            });
        }

        const fazendaSelect = document.getElementById('dashboard-fazenda');
        if (fazendaSelect) {
            fazendaSelect.addEventListener('change', () => {
                this.dashboardFilters.fazenda = fazendaSelect.value || 'all';
                this.loadDashboard();
            });
        }

        const produtoSelect = document.getElementById('dashboard-produto');
        if (produtoSelect) {
            produtoSelect.addEventListener('change', () => {
                this.dashboardFilters.produto = produtoSelect.value || 'all';
                this.loadDashboard();
            });
        }

        const frenteSelect = document.getElementById('dashboard-frente');
        if (frenteSelect) {
            frenteSelect.addEventListener('change', () => {
                this.dashboardFilters.frente = frenteSelect.value || 'all';
                this.loadDashboard();
            });
        }
    }

    handlePrintReport() {
        this.ui.showLoading();
        try {
            const container = document.getElementById('report-print-container');
            if (!container) return;

            // Coletar dados atuais dos KPIs
            const kpiArea = document.getElementById('kpi-area-plantada')?.textContent || '-';
            const kpiOs = document.getElementById('kpi-os-ativas')?.textContent || '-';
            const kpiEficiencia = document.getElementById('kpi-eficiencia')?.textContent || '-';
            const kpiViagens = document.getElementById('kpi-viagens-total')?.textContent || '-';
            const kpiEstoque = document.getElementById('kpi-estoque-items')?.textContent || '-';
            const kpiVolume = document.getElementById('kpi-volume-total')?.textContent || '-';
            const kpiInsumos = document.getElementById('kpi-insumos-total')?.textContent || '-';
            const kpiOsConcluidas = document.getElementById('kpi-os-concluidas')?.textContent || '-';

            // Coletar imagens dos gráficos (se existirem)
            const getChartImg = (key) => {
                try {
                    if (this._charts && this._charts[key]) {
                        return this._charts[key].toBase64Image();
                    }
                } catch(e) { console.warn('Erro ao exportar gráfico ' + key, e); }
                return null;
            };

            const imgPlantio = getChartImg('plantio');
            const imgOsStatus = getChartImg('osStatus');
            const imgEstoque = getChartImg('estoqueGeral');
            const imgInsumosGlobal = getChartImg('insumosGlobal');
            const imgInsumosTimeline = getChartImg('insumosTimeline');

            const now = new Date();
            const dateStr = now.toLocaleString('pt-BR');
            const currentTab = this.plantioTab || (this.getCurrentTab ? this.getCurrentTab() : 'plantio');
            const isQualityTab = currentTab === 'qualidade_muda';

            // Construir HTML do Relatório
            let html = `
                <div class="report-header">
                    <h1>🧪 Relatório Gerencial de Operações Agrícolas</h1>
                    <p>Emitido em: ${dateStr} | Usuário: Sistema</p>
                </div>

                <div class="report-section">
                    <h2>1. Resumo Executivo (KPIs)</h2>
                    <div class="report-kpi-grid">
                        <div class="report-kpi-card">
                            <span class="report-kpi-value">${kpiArea}</span>
                            <span class="report-kpi-label">Área Plantada</span>
                        </div>
                        <div class="report-kpi-card">
                            <span class="report-kpi-value">${kpiEficiencia}</span>
                            <span class="report-kpi-label">Eficiência</span>
                        </div>
                        ${!isQualityTab ? `<div class="report-kpi-card"><span class="report-kpi-value">${kpiInsumos}</span><span class="report-kpi-label">Insumos Aplicados</span></div>` : ''}
                        <div class="report-kpi-card">
                            <span class="report-kpi-value">${kpiVolume}</span>
                            <span class="report-kpi-label">Volume Transportado</span>
                        </div>
                        <div class="report-kpi-card">
                            <span class="report-kpi-value">${kpiOs}</span>
                            <span class="report-kpi-label">OS Ativas</span>
                        </div>
                        <div class="report-kpi-card">
                            <span class="report-kpi-value">${kpiOsConcluidas}</span>
                            <span class="report-kpi-label">OS Concluídas</span>
                        </div>
                        <div class="report-kpi-card">
                            <span class="report-kpi-value">${kpiViagens}</span>
                            <span class="report-kpi-label">Viagens Adubo</span>
                        </div>
                        <div class="report-kpi-card">
                            <span class="report-kpi-value">${kpiEstoque}</span>
                            <span class="report-kpi-label">Itens em Estoque</span>
                        </div>
                    </div>
                </div>

                <div class="report-section">
                    <h2>2. Gráficos de Desempenho</h2>
                    <div class="report-charts-grid">
                        ${imgPlantio ? `<div><h3>Plantio Diário</h3><img src="${imgPlantio}" class="report-chart-img"></div>` : ''}
                        ${!isQualityTab && imgInsumosTimeline ? `<div><h3>Evolução de Insumos</h3><img src="${imgInsumosTimeline}" class="report-chart-img"></div>` : ''}
                        ${imgOsStatus ? `<div><h3>Status OS</h3><img src="${imgOsStatus}" class="report-chart-img"></div>` : ''}
                        ${!isQualityTab && imgInsumosGlobal ? `<div><h3>Comparativo Insumos</h3><img src="${imgInsumosGlobal}" class="report-chart-img"></div>` : ''}
                    </div>
                </div>
                
                <div class="page-break"></div>
            `;

            if (!isQualityTab) {
                html += `
                <div class="report-section">
                    <h2>3. Detalhamento de Insumos por Produto</h2>
                    <table class="report-table">
                        <thead>
                            <tr>
                                <th>Produto</th>
                                <th>Planejado (Total)</th>
                                <th>Realizado (Total)</th>
                                <th>Diferença</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                if (this.insumosFazendasData) {
                    const products = {};
                    this.insumosFazendasData.forEach(item => {
                        const p = item.produto || 'Outros';
                        if (!products[p]) products[p] = { planned: 0, real: 0 };
                        products[p].planned += parseFloat(item.doseRecomendada || 0) * parseFloat(item.areaTalhao || 0);
                        products[p].real += parseFloat(item.quantidadeAplicada || 0);
                    });

                    const sortedProducts = Object.entries(products).sort((a, b) => b[1].real - a[1].real);
                    
                    sortedProducts.forEach(([name, data]) => {
                        const diff = data.real - data.planned;
                        const diffPerc = data.planned > 0 ? (diff / data.planned) * 100 : 0;
                        const statusColor = diff > 0 ? '#d32f2f' : '#388e3c'; // Vermelho se gastou mais
                        
                        html += `
                            <tr>
                                <td>${name}</td>
                                <td>${data.planned.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                <td>${data.real.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                <td style="color:${statusColor}; font-weight:bold;">${diff.toLocaleString('pt-BR', {minimumFractionDigits: 2})} (${diffPerc.toFixed(1)}%)</td>
                                <td>${diff > 0 ? 'Excedente' : 'Dentro da Meta'}</td>
                            </tr>
                        `;
                    });
                }

                html += `
                        </tbody>
                    </table>
                </div>
                `;
            }

            html += '<div class="report-section">'
                    + '<h2>' + (!isQualityTab ? '4. ' : '') + 'Ordens de Serviço (Recentes)</h2>'
                    + '<table class="report-table"><thead><tr>'
                    + '<th>Número</th><th>Data</th><th>Tipo/Descrição</th><th>Status</th><th>Responsável</th>'
                    + '</tr></thead><tbody>';

            // Tabela OS
            if (this.osListCache) {
                // Pegar as últimas 20 OS
                const recentOS = [...this.osListCache].sort((a, b) => new Date(b.data_abertura) - new Date(a.data_abertura)).slice(0, 20);
                
                recentOS.forEach(os => {
                    html += `
                        <tr>
                            <td>${os.numero_os}</td>
                            <td>${new Date(os.data_abertura).toLocaleDateString('pt-BR')}</td>
                            <td>${os.descricao_servico || '-'}</td>
                            <td>${os.status}</td>
                            <td>${os.responsavel || '-'}</td>
                        </tr>
                    `;
                });
            }

            html += `
                        </tbody>
                    </table>
                </div>

                <div class="report-footer">
                    <p>Relatório gerado automaticamente pelo Sistema de Gestão de Insumos e Plantio.</p>
                </div>
            `;

            container.innerHTML = html;

            // Aguardar renderização das imagens antes de imprimir
            setTimeout(() => {
                this.ui.hideLoading();
                window.print();
            }, 800);

        } catch (e) {
            console.error('Erro ao gerar relatório avançado:', e);
            this.ui.hideLoading();
            this.ui.showNotification('Erro ao gerar relatório.', 'error');
        }
    }

    isDateInPeriod(dateStr) {
        // Default to 'all' to ensure data visibility unless user explicitly filters
        const periodoEl = document.getElementById('dashboard-periodo');
        let periodo = periodoEl ? periodoEl.value : 'all';
        
        // Force 'all' if empty or invalid to prevent hiding data by mistake
        if (!periodo || periodo === '') periodo = 'all';

        if (periodo === 'all') return true;
        
        // If date is missing, decide whether to show or hide. 
        // Showing is safer to avoid "empty chart" complaints.
        if (!dateStr) return true; 
        
        // Handle ISO strings, YYYY-MM-DD, DD-MM-YYYY etc.
        let d;
        try {
            if (dateStr instanceof Date) {
                d = dateStr;
            } else if (typeof dateStr === 'string') {
                 if (dateStr.includes('T')) {
                    const parts = dateStr.split('T')[0].split('-');
                    if (parts.length < 3) return true; // Invalid format, pass through
                    d = new Date(parts[0], parts[1]-1, parts[2]);
                } else if (dateStr.includes('-')) {
                     const parts = dateStr.split('-');
                     if (parts.length === 3) {
                         // YYYY-MM-DD
                         if (parts[0].length === 4) {
                             d = new Date(parts[0], parts[1]-1, parts[2]);
                         } 
                         // DD-MM-YYYY
                         else if (parts[2].length === 4) {
                             d = new Date(parts[2], parts[1]-1, parts[0]);
                         }
                         else {
                             d = new Date(dateStr);
                         }
                     } else {
                         d = new Date(dateStr);
                     }
                } else {
                    d = new Date(dateStr);
                }
            } else {
                return true; // Unknown type, pass through
            }
            
            if (isNaN(d.getTime())) return true; // Invalid date, pass through

            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            // Calculate difference in days
            const diffTime = today - d; // Positive if past
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            // console.log(`DEBUG isDateInPeriod: Date=${dateStr}, Period=${periodo}, DiffDays=${diffDays}`);
            return diffDays <= parseInt(periodo);
        } catch(e) {
            console.warn('Error in isDateInPeriod:', e);
            return true; // Default to true on error
        }
    }

    async loadDashboard() {
        if (this.dashboardDisabled) {
            console.error('⛔ Dashboard desativado devido a excesso de recargas.');
            this.ui.showNotification('Dashboard desativado por segurança. Recarregue a página.', 'error');
            return;
        }

        console.time('loadDashboard'); // Início do timer de performance

        const now = Date.now();
        
        // Circuit Breaker: Resetar contagem a cada 10 segundos
        if (now - this.dashboardLoadResetTime > 10000) {
            this.dashboardLoadCount = 0;
            this.dashboardLoadResetTime = now;
        }

        this.dashboardLoadCount++;
        
        // Se houver mais de 5 tentativas em 10 segundos, travar
        if (this.dashboardLoadCount > 5) {
            this.dashboardDisabled = true;
            this.ui.showNotification('Erro: Dashboard tentando recarregar em loop. Parando.', 'error');
            console.error('⛔ Loop detectado no Dashboard! Desativando recargas automáticas.');
            return;
        }

        // Prevent rapid-fire reloads (Throttle: 1.5s) and concurrent loads
        if ((this._lastDashboardLoad && (now - this._lastDashboardLoad < 1500)) || this.isDashboardLoading) {
            console.warn('⚠️ Dashboard reload throttled or already in progress.');
            return;
        }
        this._lastDashboardLoad = now;
        this.isDashboardLoading = true;

        console.log('🔄 Iniciando loadDashboard...', new Date().toISOString());
        this.ui.showLoading();
        try {
            // console.log('🔄 Loading Dashboard...');
            
            // Carregar dados em paralelo com tratamento individual de erros
            const [plantioRes, osRes, insumosRes, estoqueRes, viagensRes, fazendasRes, compostoRes, liberacaoRes] = await Promise.all([
                this.api.getPlantioDia().catch(e => ({ success: false, error: e })),
                this.api.getOSList().catch(e => ({ success: false, error: e })),
                this.api.getInsumosFazendas().catch(e => ({ success: false, error: e })),
                this.api.getEstoque().catch(e => ({ success: false, error: e })),
                this.api.getViagensAdubo().catch(e => ({ success: false, error: e })),
                this.api.getFazendas().catch(e => ({ success: false, error: e })),
                this.api.getTransporteComposto().catch(e => ({ success: false, error: e })),
                this.api.getLiberacaoColheita().catch(e => ({ success: false, error: e }))
            ]);

            console.log('--- DEBUG LOADDASHBOARD RESPONSES ---');
            console.log('Plantio:', plantioRes.success, plantioRes.data?.length);
            console.log('OS:', osRes.success, osRes.data?.length);
            console.log('Insumos:', insumosRes.success, insumosRes.data?.length);
            console.log('Estoque:', estoqueRes.success, estoqueRes.data?.length);
            console.log('Viagens:', viagensRes?.success, viagensRes?.data?.length);
            console.log('Fazendas:', fazendasRes?.success, fazendasRes?.data?.length);
            console.log('---------------------------------------');

            if (plantioRes.success) {
                // Normalizar dados (parsear JSON se necessário)
                this.plantioDiarioData = plantioRes.data.map(p => {
                    if (typeof p.frentes === 'string') {
                        try { p.frentes = JSON.parse(p.frentes); } catch(e) { console.error('Erro ao parsear frentes:', e); }
                    }
                    return p;
                });
            }
            if (osRes.success) this.osListCache = osRes.data;
            if (insumosRes.success) this.insumosFazendasData = insumosRes.data;
            if (estoqueRes.success) this.estoqueList = estoqueRes.data;
            if (viagensRes && viagensRes.success) this.viagensAdubo = viagensRes.data;
            if (fazendasRes && fazendasRes.success) this.cadastroFazendas = fazendasRes.data;
            if (compostoRes && compostoRes.success) this.transporteCompostoData = compostoRes.data;
            if (liberacaoRes && liberacaoRes.success) this.liberacaoColheitaData = liberacaoRes.data;

            this.populateDashboardFilters();
            this.calculateKPIs();
            
            // Renderização protegida para evitar travamento da UI
            console.time('renderDashboardCharts');
            // await new Promise(resolve => setTimeout(resolve, 50)); // (Opcional)
            this.renderDashboardCharts();
            console.timeEnd('renderDashboardCharts');
            
            this.ui.showNotification('Dashboard atualizado!', 'success');
        } catch (e) {
            console.error('Error loading dashboard:', e);
            this.ui.showNotification('Erro ao carregar dashboard', 'error');
        } finally {
            this.ui.hideLoading();
            this.isDashboardLoading = false;
            console.timeEnd('loadDashboard');
        }
    }

    calculateKPIs() {
        try {
            const periodo = document.getElementById('dashboard-periodo')?.value || '30';
            const now = new Date();
            
            // Defesa: se plantioDiarioData não for array, inicializar
            if (!Array.isArray(this.plantioDiarioData)) {
                console.warn('plantioDiarioData não é array, inicializando vazio.');
                this.plantioDiarioData = [];
            }

            const filterDate = (dateStr) => {
                if (periodo === 'all') return true;
                if (!dateStr) return false;
                // Assegurar compatibilidade de datas (UTC vs Local)
                // Usando split para garantir ano/mes/dia corretos
                const parts = dateStr.split('T')[0].split('-');
                if (parts.length < 3) return false;
                const d = new Date(parts[0], parts[1]-1, parts[2]); // Data local meia-noite
                
                // Normalizar "now" para meia-noite local para comparação justa de dias
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                
                const diffTime = Math.abs(today - d);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays <= parseInt(periodo);
            };

            // 1. Área Plantada Total (Plantio Diário)
            const plantioFiltered = this.plantioDiarioData.filter(p => filterDate(p.data));
            
            // Correção: Somar área das frentes se existir array de frentes, ou usar area_plantada direta
            const totalArea = plantioFiltered.reduce((acc, curr) => {
                // Ignorar registros que sejam de colheita_muda para a soma de área plantada
                // Assumindo que 'plantio' é o padrão ou nulo
                const isColheita = curr.tipo_operacao === 'colheita_muda' || (curr.qualidade && curr.qualidade.tipoOperacao === 'colheita_muda');
                if (isColheita) return acc;

                let areaDia = 0;
                
                // Normalização defensiva: tentar parsear frentes se for string (caso escape da normalização anterior)
                let frentes = curr.frentes;
                if (typeof frentes === 'string') {
                    try { frentes = JSON.parse(frentes); } catch(e) {}
                }

                if (frentes && Array.isArray(frentes)) {
                    areaDia = frentes.reduce((sum, f) => {
                         // Tenta pegar plantioDiario, fallback para plantada
                         let val = f.plantioDiario;
                         if (val === undefined || val === null || val === '') val = f.plantada;
                         
                         // Se ainda undefined, talvez nomes diferentes de campos?
                         // Mas o form salva nesses nomes.
                         return sum + (parseFloat(val) || 0);
                     }, 0);
                } else {
                    areaDia = parseFloat(curr.area_plantada) || 0;
                }
                return acc + areaDia;
            }, 0);

            // 1.1 Área Colhida (Novo KPI)
            const colheitaFiltered = this.plantioDiarioData.filter(p => {
                const isColheita = p.tipo_operacao === 'colheita_muda' || (p.qualidade && p.qualidade.tipoOperacao === 'colheita_muda');
                return isColheita && filterDate(p.data);
            });

            const totalColheita = colheitaFiltered.reduce((acc, curr) => {
                let val = parseFloat(curr.colheita_hectares) || 0;
                // Fallback para qualidade.colheitaHectares caso o root esteja vazio
                if (val === 0 && curr.qualidade && curr.qualidade.colheitaHectares) {
                    val = parseFloat(curr.qualidade.colheitaHectares) || 0;
                }
                return acc + val;
            }, 0);

            // 1.2 Razão Colheita / Plantio
            let razaoColheitaPlantio = 0;
            if (totalColheita > 0) {
                razaoColheitaPlantio = totalArea / totalColheita;
            }
            
            // 2. OS Ativas
            const osActive = (this.osListCache || []).filter(os => {
                const status = (os.status || '').toLowerCase();
                return status !== 'concluido' && status !== 'cancelada';
            }).length;

            // 3. Eficiência
            let efficiency = 0;
            const fazendasIds = new Set();
            plantioFiltered.forEach(p => {
                let frentes = p.frentes;
                if (typeof frentes === 'string') { try { frentes = JSON.parse(frentes); } catch(e){} }

                if (frentes && Array.isArray(frentes)) {
                    frentes.forEach(f => {
                        if (f.fazenda) fazendasIds.add(String(f.fazenda).trim().toLowerCase());
                        const match = f.fazenda && f.fazenda.match(/^(\d+)/);
                        if (match) fazendasIds.add(match[1]);
                    });
                } else if (p.fazenda) {
                    fazendasIds.add(String(p.fazenda).trim().toLowerCase());
                }
            });
            
            if (this.cadastroFazendas && this.cadastroFazendas.length > 0 && fazendasIds.size > 0) {
                const fazendasEnvolvidas = this.cadastroFazendas.filter(f => {
                    const nomeNorm = (f.nome || '').trim().toLowerCase();
                    const codString = String(f.codigo);
                    return fazendasIds.has(nomeNorm) || fazendasIds.has(codString);
                });
                
                const totalAreaFazendas = fazendasEnvolvidas.reduce((acc, f) => acc + (parseFloat(f.area_total) || 0), 0);
                if (totalAreaFazendas > 0) {
                    efficiency = (totalArea / totalAreaFazendas) * 100;
                }
            }

            // 4. Produtos em Estoque
            const produtosComSaldo = (this.estoqueList || []).filter(e => parseFloat(e.quantidade) > 0).length;

            // 5. Viagens
            const viagensFiltered = (this.viagensAdubo || []).filter(v => filterDate(v.data));
            const totalViagens = viagensFiltered.length;
            const totalVolume = viagensFiltered.reduce((acc, curr) => acc + (parseFloat(curr.quantidadeTotal) || 0), 0);

            // 6. Insumos e OS Concluídas
            const insumosFiltered = (this.insumosFazendasData || []).filter(i => filterDate(i.inicio));
            const totalInsumos = insumosFiltered.reduce((acc, curr) => acc + (parseFloat(curr.quantidadeAplicada) || 0), 0);
            const osConcluidas = (this.osListCache || []).filter(os => (os.status || '').toLowerCase() === 'concluido').length;

            // Update DOM
            const setTxt = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
            
            setTxt('kpi-area-plantada', `${totalArea.toLocaleString('pt-BR', {maximumFractionDigits: 1})} ha`);
            setTxt('kpi-area-colhida', `${totalColheita.toLocaleString('pt-BR', {maximumFractionDigits: 1})} ha`);
            setTxt('kpi-colheita-plantio', razaoColheitaPlantio.toLocaleString('pt-BR', {maximumFractionDigits: 2}));
            setTxt('kpi-os-ativas', osActive);
            setTxt('kpi-eficiencia', `${efficiency > 0 ? efficiency.toFixed(1) : 0}%`);
            setTxt('kpi-estoque-items', produtosComSaldo);
            setTxt('kpi-viagens-total', totalViagens);
            setTxt('kpi-volume-total', `${totalVolume.toLocaleString('pt-BR', {maximumFractionDigits: 1})} t`);
            setTxt('kpi-insumos-total', `${totalInsumos.toLocaleString('pt-BR', {maximumFractionDigits: 1})} L/kg`);
            setTxt('kpi-os-concluidas', osConcluidas);

            // Novos KPIs
            // Transporte Composto
            let totalComposto = 0;
            if (this.transporteCompostoData && Array.isArray(this.transporteCompostoData)) {
                totalComposto = this.transporteCompostoData.reduce((acc, curr) => {
                     // Filter by date if needed, but for now just total or filtered
                     // Use existing filterDate
                     const d = curr.data_abertura || curr.created_at;
                     if (filterDate(d)) {
                         return acc + (parseFloat(curr.quantidade) || 0);
                     }
                     return acc;
                }, 0);
            }
            setTxt('kpi-volume-composto', `${totalComposto.toLocaleString('pt-BR', {maximumFractionDigits: 1})} t`);

            // Liberacao Colheita
            let areaLiberada = 0;
            if (this.liberacaoColheitaData && Array.isArray(this.liberacaoColheitaData)) {
                areaLiberada = this.liberacaoColheitaData.reduce((acc, curr) => {
                    const d = curr.data;
                    if (filterDate(d) && (curr.status === 'LIBERADO' || curr.status === 'CONCLUIDO')) {
                        return acc + (parseFloat(curr.area_total) || 0);
                    }
                    return acc;
                }, 0);
            }
            setTxt('kpi-area-liberada', `${areaLiberada.toLocaleString('pt-BR', {maximumFractionDigits: 1})} ha`);

        } catch(e) {
            console.error('Erro crítico em calculateKPIs:', e);
        }
    }

    renderDashboardCharts() {
        // Wrapper para processar gráficos sequencialmente para não travar a thread principal
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => this._renderDashboardChartsInternal());
        } else {
            setTimeout(() => this._renderDashboardChartsInternal(), 0);
        }
    }

    _renderDashboardChartsInternal() {
        if (typeof Chart === 'undefined') {
            console.error('❌ Chart.js não está carregado!');
            return;
        }
        
        console.log('📊 Renderizando gráficos...');
        console.log('--- DEBUG DATA COUNTS ---');
        console.log('InsumosFazendas:', this.insumosFazendasData ? this.insumosFazendasData.length : 0);
        console.log('PlantioDiario:', this.plantioDiarioData ? this.plantioDiarioData.length : 0);
        console.log('ViagensAdubo:', this.viagensAdubo ? this.viagensAdubo.length : 0);
        console.log('EstoqueList:', this.estoqueList ? this.estoqueList.length : 0);
        console.log('TransporteComposto:', this.transporteCompostoData ? this.transporteCompostoData.length : 0);
        console.log('LiberacaoColheita:', this.liberacaoColheitaData ? this.liberacaoColheitaData.length : 0);
        console.log('OSList:', this.osListCache ? this.osListCache.length : 0);
        console.log('-------------------------');

        // Sequência de renderização
        try { this.renderPlantioChart(); } catch(e) { console.error('Erro Chart Plantio:', e); }
        try { this.renderOSStatusChart(); } catch(e) { console.error('Erro Chart OS:', e); }
        // renderEstoqueGeralChart, etc.
        try { this.renderEstoqueGeralChart(); } catch(e) { console.error('Erro Chart Estoque:', e); }
        try { this.renderProductDetailsCharts(); } catch(e) { console.error('Erro Chart Produtos:', e); }
        try { this.renderLogisticsCharts(); } catch(e) { console.error('Erro Chart Logistica:', e); }
        try { this.renderTransporteCompostoChart(); } catch(e) { console.error('Erro Chart Composto:', e); }
        try { this.renderLiberacaoStatusChart(); } catch(e) { console.error('Erro Chart Liberacao:', e); }
        try { this.renderFarmProgressChart(); } catch(e) { console.error('Erro Chart Fazendas:', e); }
        try { this.renderInsumosGlobalChart(); } catch(e) { console.error('Erro Chart Insumos Global:', e); }
        try { this.renderInsumosTimelineChart(); } catch(e) { console.error('Erro Chart Insumos Timeline:', e); }
        try { this.renderRankingOperadoresChart(); } catch(e) { console.error('Erro Chart Ranking:', e); }
    }

    // Função original renomeada/substituída
    /*
    renderDashboardCharts() {
        // console.log('📊 Renderizando gráficos do dashboard...');
        if (typeof Chart === 'undefined') {
            // console.error('❌ Chart.js não está carregado!');
            return;
        }
        
        try {
            this.renderPlantioChart();
        } catch(e) { } // console.error('Erro renderPlantioChart:', e);

        try {
            this.renderOSStatusChart();
        } catch(e) { } // console.error('Erro renderOSStatusChart:', e);

        // Chart Global removido daqui pois já é renderizado em renderProductDetailsCharts -> updateCharts
        // try {
        //    this.renderInsumosGlobalChart();
        // } catch(e) { }

        try {
            this.renderEstoqueGeralChart();
        } catch(e) { } // console.error('Erro renderEstoqueGeralChart:', e);

        try {
            this.renderProductDetailsCharts();
        } catch(e) { } // console.error('Erro renderProductDetailsCharts:', e);

        try {
            this.renderLogisticsCharts();
        } catch(e) { } // console.error('Erro renderLogisticsCharts:', e);

        try {
            this.renderFarmProgressChart();
        } catch(e) { } // console.error('Erro renderFarmProgressChart:', e);
    }
    */

    renderTransporteCompostoChart() {
        const ctx = document.getElementById('chart-transporte-composto');
        if (!ctx) return;
        
        const existing = Chart.getChart(ctx);
        if (existing) existing.destroy();

        const data = this.transporteCompostoData || [];

        // Group by Date
        const daily = {};
        data.forEach(item => {
            const d = item.data_abertura || item.created_at;
            if (!d) return;
            const dateStr = d.split('T')[0];
            if (!this.isDateInPeriod(dateStr)) return;
            
            if (!daily[dateStr]) daily[dateStr] = 0;
            daily[dateStr] += parseFloat(item.quantidade || 0);
        });

        const sortedDates = Object.keys(daily).sort();
        const values = sortedDates.map(d => daily[d]);
        const labels = sortedDates.map(d => {
            const parts = d.split('-');
            return `${parts[2]}/${parts[1]}`;
        });

        if (this._charts.transporteComposto) this._charts.transporteComposto.destroy();

        const gradient = this.createGradient(ctx, '#8d6e63', '#5d4037'); // Brown 400-700

        this._charts.transporteComposto = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Volume (t)',
                    data: values,
                    backgroundColor: gradient,
                    borderRadius: 8,
                    borderSkipped: false,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }]
            },
            options: this.getCommonChartOptions({
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Volume: ${context.raw.toLocaleString('pt-BR')} t`
                        }
                    }
                }
            })
        });
    }

    renderLiberacaoStatusChart() {
        const ctx = document.getElementById('chart-liberacao-status');
        if (!ctx) return;
        
        const existing = Chart.getChart(ctx);
        if (existing) existing.destroy();

        const data = (this.liberacaoColheitaData || []).filter(item => {
            const d = item.data || item.created_at;
            return this.isDateInPeriod(d);
        });

        const statusCounts = {};
        data.forEach(item => {
            const s = (item.status || 'PENDENTE').toUpperCase();
            statusCounts[s] = (statusCounts[s] || 0) + 1;
        });

        const labels = Object.keys(statusCounts);
        const values = Object.values(statusCounts);
        
        const colors = labels.map(s => {
            if (s === 'LIBERADO') return this.createGradient(ctx, '#4ade80', '#16a34a'); // Green 400-600
            if (s === 'PENDENTE') return this.createGradient(ctx, '#fbbf24', '#d97706'); // Amber 400-600
            if (s === 'REJEITADO') return this.createGradient(ctx, '#f87171', '#dc2626'); // Red 400-600
            return '#e2e8f0';
        });

        if (this._charts.liberacaoStatus) this._charts.liberacaoStatus.destroy();

        this._charts.liberacaoStatus = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 0,
                    hoverOffset: 15,
                    borderRadius: 8,
                    spacing: 4
                }]
            },
            options: this.getCommonChartOptions({
                scales: { x: { display: false }, y: { display: false } },
                plugins: { 
                    legend: { 
                        position: 'bottom',
                        labels: { usePointStyle: true, padding: 20 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => ` ${context.label}: ${context.raw}`
                        }
                    }
                },
                cutout: '75%'
            })
        });
    }

    renderOSStatusChart() {
        const ctx = document.getElementById('chart-os-status');
        if (!ctx) return;

        const existingChart = Chart.getChart(ctx);
        if (existingChart) {
            existingChart.destroy();
        }

        const rawData = this.osListCache || [];
        const data = rawData.filter(item => {
            const d = item.data_abertura || item.data || item.created_at;
            return this.isDateInPeriod(d);
        });
        
        const statusCounts = {};
        
        data.forEach(os => {
            const s = (os.status || 'Indefinido').toUpperCase();
            statusCounts[s] = (statusCounts[s] || 0) + 1;
        });

        const labels = Object.keys(statusCounts);
        const values = Object.values(statusCounts);
        const colors = labels.map(s => {
            if(s.includes('CONCLU')) return this.createGradient(ctx, '#4ade80', '#16a34a');
            if(s.includes('ANDAMENTO') || s.includes('ABERTA')) return this.createGradient(ctx, '#60a5fa', '#2563eb');
            if(s.includes('CANCEL')) return this.createGradient(ctx, '#f87171', '#dc2626');
            return this.createGradient(ctx, '#fbbf24', '#d97706');
        });

        if (this._charts.osStatus) {
            this._charts.osStatus.destroy();
        }

        this._charts.osStatus = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 0,
                    hoverOffset: 15,
                    borderRadius: 8,
                    spacing: 4
                }]
            },
            options: this.getCommonChartOptions({
                scales: { x: { display: false }, y: { display: false } },
                plugins: {
                    legend: { 
                        position: 'bottom',
                        labels: { usePointStyle: true, padding: 20 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.raw !== null) {
                                    label += context.raw.toLocaleString('pt-BR');
                                }
                                return label;
                            }
                        }
                    }
                },
                cutout: '75%'
            })
        });
    }

    renderRankingOperadoresChart() {
        const ctx = document.getElementById('chart-ranking-operadores');
        if (!ctx) return;

        const existing = Chart.getChart(ctx);
        if (existing) existing.destroy();

        // Filtrar plantio data pelo período
        const data = (this.plantioDiarioData || []).filter(item => {
            const d = item.data || item.created_at;
            return this.isDateInPeriod(d);
        });

        // Agrupar por operador e calcular média
        const operators = {};
        data.forEach(item => {
            if (!item.qualidade) return;
            // Tenta pegar o novo campo qualOperador, ou fallback se existir outro
            const op = item.qualidade.qualOperador || item.qualidade.operador;
            if (!op) return; 

            // Prioriza mudasBoasPct (como solicitado "qualidade da muda")
            // Fallback para gemasBoasPct se mudas não existir
            let pct = parseFloat(item.qualidade.mudasBoasPct);
            if (isNaN(pct)) pct = parseFloat(item.qualidade.gemasBoasPct);
            if (isNaN(pct)) pct = 0;
            
            if (!operators[op]) operators[op] = { total: 0, count: 0 };
            operators[op].total += pct;
            operators[op].count++;
        });

        const ranking = Object.keys(operators).map(op => ({
            operador: op,
            media: operators[op].total / operators[op].count
        }));

        // Sort by media descending (Melhores primeiro)
        ranking.sort((a, b) => b.media - a.media);

        // Top 10
        const topRanking = ranking.slice(0, 10);

        const labels = topRanking.map(r => r.operador);
        const values = topRanking.map(r => r.media);
        
        // Colors based on score
        const colors = values.map(v => {
            if (v >= 90) return '#4ade80'; // Green
            if (v >= 80) return '#fbbf24'; // Yellow
            return '#f87171'; // Red
        });

        if (this._charts.rankingOperadores) this._charts.rankingOperadores.destroy();

        this._charts.rankingOperadores = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '% Mudas Boas',
                    data: values,
                    backgroundColor: colors,
                    borderRadius: 6,
                }]
            },
            options: this.getCommonChartOptions({
                indexAxis: 'y', // Horizontal bar
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Qualidade: ${context.raw.toFixed(1)}%`
                        }
                    }
                },
                scales: {
                    x: { max: 100, beginAtZero: true }
                }
            })
        });
    }

    // --- Modern Chart Helpers ---
    createGradient(ctx, colorStart, colorEnd) {
        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, colorStart);
        gradient.addColorStop(1, colorEnd);
        return gradient;
    }

    getCommonChartOptions(overrides = {}) {
        const isDark = document.body.classList.contains('dark-mode');
        const textColor = isDark ? '#e0e0e0' : '#666';
        const gridColor = isDark ? '#333' : '#f1f5f9';
        const tooltipBg = isDark ? 'rgba(30, 30, 30, 0.98)' : 'rgba(255, 255, 255, 0.98)';
        const tooltipTitle = isDark ? '#ffffff' : '#1e293b';
        const tooltipBody = isDark ? '#cccccc' : '#475569';

        const defaults = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { 
                        usePointStyle: true, 
                        pointStyle: 'circle',
                        font: { family: "'Inter', sans-serif", size: 12 },
                        padding: 20,
                        color: textColor
                    }
                },
                tooltip: {
                    backgroundColor: tooltipBg,
                    titleColor: tooltipTitle,
                    bodyColor: tooltipBody,
                    borderColor: isDark ? '#444' : 'rgba(0,0,0,0.05)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    titleFont: { family: "'Inter', sans-serif", size: 13, weight: '600' },
                    bodyFont: { family: "'Inter', sans-serif", size: 12 },
                    displayColors: true,
                    boxPadding: 4,
                    callbacks: {}
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { 
                        color: gridColor, 
                        borderDash: [4, 4],
                        drawBorder: false
                    },
                    ticks: { 
                        font: { family: "'Inter', sans-serif", size: 11 }, 
                        color: isDark ? '#888' : '#94a3b8',
                        padding: 8
                    },
                    border: { display: false }
                },
                x: {
                    grid: { display: false },
                    ticks: { 
                        font: { family: "'Inter', sans-serif", size: 11 }, 
                        color: isDark ? '#888' : '#94a3b8',
                        autoSkip: true,
                        maxRotation: 0
                    },
                    border: { display: false }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            }
        };

        if (overrides.plugins) {
            Object.assign(defaults.plugins, overrides.plugins);
            if (overrides.plugins.tooltip && overrides.plugins.tooltip.callbacks) {
                defaults.plugins.tooltip.callbacks = overrides.plugins.tooltip.callbacks;
            }
        }
        if (overrides.scales) Object.assign(defaults.scales, overrides.scales);
        if (overrides.indexAxis) defaults.indexAxis = overrides.indexAxis;

        return defaults;
    }

    renderInsumosGlobalChart() {
        const ctx = document.getElementById('chart-dose-global');
        if (!ctx) return;

        const existingChart = Chart.getChart(ctx);
        if (existingChart) existingChart.destroy();
        
        const rawData = this.insumosFazendasData || [];
        const data = rawData.filter(item => {
            const d = item.inicio || item.data || item.created_at;
            return this.isDateInPeriod(d);
        });

        const products = {};

        data.forEach(item => {
            const p = item.produto || 'Outros';
            if (!products[p]) products[p] = { planned: 0, real: 0 };
            
            // Planejado: Area * Dose
            products[p].planned += parseFloat(item.doseRecomendada || 0) * parseFloat(item.areaTalhao || 0);
            // Realizado
            products[p].real += parseFloat(item.quantidadeAplicada || 0);
        });

        const labels = Object.keys(products).slice(0, 5); // Top 5
        const plannedData = labels.map(l => products[l].planned);
        const realData = labels.map(l => products[l].real);

        if (this._charts.insumosGlobal) this._charts.insumosGlobal.destroy();

        const gradientPlanned = this.createGradient(ctx, '#60a5fa', '#2563eb');
        const gradientReal = this.createGradient(ctx, '#34d399', '#059669');

        const options = this.getCommonChartOptions({
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
                            }
                            return label;
                        }
                    }
                }
            }
        });

        this._charts.insumosGlobal = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Planejado (L/kg)',
                        data: plannedData,
                        backgroundColor: gradientPlanned,
                        borderRadius: 8,
                        barPercentage: 0.7,
                        categoryPercentage: 0.8
                    },
                    {
                        label: 'Realizado (L/kg)',
                        data: realData,
                        backgroundColor: gradientReal,
                        borderRadius: 8,
                        barPercentage: 0.7,
                        categoryPercentage: 0.8
                    }
                ]
            },
            options: options
        });
    }

    renderInsumosTimelineChart() {
        const ctx = document.getElementById('chart-insumos-evolucao');
        if (!ctx) return;

        const existingChart = Chart.getChart(ctx);
        if (existingChart) existingChart.destroy();

        const data = this.insumosFazendasData || [];
        
        const daily = {};
        let skippedCount = 0;
        let processedCount = 0;

        data.forEach(item => {
            const date = item.inicio ? item.inicio.split('T')[0] : null;
            if (!date) {
                skippedCount++;
                return;
            }
            if (!this.isDateInPeriod(date)) {
                skippedCount++;
                return;
            }
            
            processedCount++;
            if (!daily[date]) daily[date] = 0;
            daily[date] += parseFloat(item.quantidadeAplicada || 0);
        });

        const sortedDates = Object.keys(daily).sort();
        const values = sortedDates.map(d => daily[d]);
        const labels = sortedDates.map(d => {
             const parts = d.split('-');
             return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
        });

        if (this._charts.insumosTimeline) this._charts.insumosTimeline.destroy();

        const gradient = this.createGradient(ctx, 'rgba(14, 165, 233, 0.2)', 'rgba(14, 165, 233, 0.0)'); // Sky Blue

        const options = this.getCommonChartOptions({
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
                            }
                            return label;
                        }
                    }
                }
            }
        });

        this._charts.insumosTimeline = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Aplicação Diária (L/kg)',
                    data: values,
                    borderColor: '#0ea5e9', // Sky 500
                    borderWidth: 3,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#0ea5e9',
                    pointBorderWidth: 2
                }]
            },
            options: options
        });
    }

    renderEstoqueGeralChart() {
         console.log('📊 Renderizando Estoque Geral...');
         const ctxId = 'chart-estoque-geral';
         const ctx = document.getElementById(ctxId);
         if (!ctx) {
             console.warn('⚠️ Canvas chart-estoque-geral não encontrado.');
             return;
         }

         this.destroyChart(ctxId, 'estoqueGeral');
         
         const data = this.estoqueList || [];
         
         // Agrupar por Frente
         const porFrente = {};
         data.forEach(item => {
             const f = item.frente || 'Geral';
             if (!porFrente[f]) porFrente[f] = 0;
             porFrente[f] += parseFloat(item.quantidade || 0);
         });
         
         // Ordenar e limitar
         let labels = Object.keys(porFrente).sort((a,b) => porFrente[b] - porFrente[a]);
         let values = labels.map(l => porFrente[l]);

         // Limit to top 15
         if (labels.length > 15) {
             const top15Labels = labels.slice(0, 15);
             const top15Values = values.slice(0, 15);
             const othersVal = values.slice(15).reduce((acc, v) => acc + v, 0);
             
             top15Labels.push('Outras...');
             top15Values.push(othersVal);
             
             labels = top15Labels;
             values = top15Values;
         }

        const gradient = this.createGradient(ctx, '#d946ef', '#a21caf'); // Fuchsia 500-700

        const options = this.getCommonChartOptions({
             plugins: {
                 legend: { display: false },
                 tooltip: {
                     callbacks: {
                         label: function(context) {
                             let label = context.dataset.label || '';
                             if (label) label += ': ';
                             if (context.parsed.y !== null) {
                                 label += context.parsed.y.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
                             }
                             return label;
                         }
                     }
                 }
             }
         });

         this._charts.estoqueGeral = new Chart(ctx, {
             type: 'bar',
             data: {
                 labels: labels,
                 datasets: [{
                     label: 'Quantidade em Estoque',
                     data: values,
                     backgroundColor: gradient,
                    borderRadius: 8,
                    barPercentage: 0.7
                }]
             },
             options: options
         });
    }

    updateCharts(data) {
        console.log('DEBUG: updateCharts called with data length:', data ? data.length : 'null');
        if (!data) return;

        // --- Chart: Diferença por Produto (%) ---
        const diffCtx = document.getElementById('chart-diff-produtos');
        if (diffCtx) {
            console.log('DEBUG: chart-diff-produtos found');
            if (this._charts.diffProdutos) this._charts.diffProdutos.destroy();
            
            const productStats = {};
            data.forEach(item => {
                const p = item.produto;
                if (!p) return;
                if (!productStats[p]) productStats[p] = { diffSum: 0, count: 0 };
                
                let diff = parseFloat(item.diferenca);
                if (isNaN(diff)) {
                    // Tentar calcular se não vier pronto
                    const rec = parseFloat(item.dose_recomendada || 0);
                    const app = parseFloat(item.dose_aplicada || 0);
                    if (rec > 0) {
                         diff = ((app - rec) / rec) * 100;
                    } else {
                         diff = 0;
                    }
                }
                
                productStats[p].diffSum += diff;
                productStats[p].count++;
            });
            console.log('DEBUG: productStats keys:', Object.keys(productStats));
            
            const labels = Object.keys(productStats);
            const values = labels.map(p => productStats[p].count ? (productStats[p].diffSum / productStats[p].count) : 0);
            
            const gradientRed = this.createGradient(diffCtx, '#ef4444', '#b91c1c'); // Red 500-700
            const gradientGreen = this.createGradient(diffCtx, '#22c55e', '#15803d'); // Green 500-700

            this._charts.diffProdutos = new Chart(diffCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Diferença Média (%)',
                        data: values,
                        backgroundColor: values.map(v => Math.abs(v) > 5 ? gradientRed : gradientGreen),
                        borderRadius: 8,
                        barPercentage: 0.7
                    }]
                },
                options: this.getCommonChartOptions({
                    indexAxis: 'y',
                    plugins: { 
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => `Diferença: ${ctx.raw.toFixed(2)}%`
                            }
                        }
                    },
                    scales: {
                        x: { 
                            ticks: { callback: v => v + '%' } 
                        }
                    }
                })
            });
        }

        // --- Chart: Comparação por Produto (Dose) ---
        const doseCtx = document.getElementById('chart-dose-produtos');
        if (doseCtx) {
            if (this._charts.doseProdutos) this._charts.doseProdutos.destroy();
            
            const doseStats = {};
            data.forEach(item => {
                const p = item.produto;
                if (!p) return;
                if (!doseStats[p]) doseStats[p] = { recSum: 0, appSum: 0, count: 0 };
                
                doseStats[p].recSum += parseFloat(item.dose_recomendada || 0);
                doseStats[p].appSum += parseFloat(item.dose_aplicada || 0);
                doseStats[p].count++;
            });
            
            const labels = Object.keys(doseStats);
            const recValues = labels.map(p => doseStats[p].count ? (doseStats[p].recSum / doseStats[p].count) : 0);
            const appValues = labels.map(p => doseStats[p].count ? (doseStats[p].appSum / doseStats[p].count) : 0);
            
            const gradientBlue = this.createGradient(doseCtx, '#3b82f6', '#1d4ed8'); // Blue 500-700
            const gradientAmber = this.createGradient(doseCtx, '#f59e0b', '#b45309'); // Amber 500-700

            this._charts.doseProdutos = new Chart(doseCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Dose Rec.',
                            data: recValues,
                            backgroundColor: gradientBlue,
                            borderRadius: 8,
                            barPercentage: 0.7,
                            categoryPercentage: 0.8
                        },
                        {
                            label: 'Dose Apl.',
                            data: appValues,
                            backgroundColor: gradientAmber,
                            borderRadius: 8,
                            barPercentage: 0.7,
                            categoryPercentage: 0.8
                        }
                    ]
                },
                options: this.getCommonChartOptions({
                    scales: {
                        y: { beginAtZero: true }
                    }
                })
            });
        }
    }

    renderProductDetailsCharts() {
         // Wrapper para chamar a antiga updateCharts com os dados atuais
         if (this.insumosFazendasData) {
             const filteredData = this.insumosFazendasData.filter(item => {
                 const d = item.inicio || item.data || item.created_at;
                 return this.isDateInPeriod(d);
             });
             this.updateCharts(filteredData);
         }
    }

    renderLogisticsCharts() {
        const ctxId = 'chart-viagens-diarias';
        const ctx = document.getElementById(ctxId);
        if (!ctx) return;

        this.destroyChart(ctxId, 'logistics');

        const rawData = this.viagensAdubo || [];
        const data = rawData.filter(v => this.isDateInPeriod(v.data));
        
        // Group by Date
        const dailyCounts = {};
        data.forEach(v => {
            const date = v.data ? v.data.split('T')[0] : 'N/A';
            if (!dailyCounts[date]) dailyCounts[date] = 0;
            dailyCounts[date]++;
        });

        // Sort dates
        const sortedDates = Object.keys(dailyCounts).sort();
        const values = sortedDates.map(d => dailyCounts[d]);
        // Format dates for label
        const labels = sortedDates.map(d => {
             const parts = d.split('-');
             return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
        });

        const gradientLogistics = this.createGradient(ctx, '#fbbf24', '#d97706'); // Amber 400-600

        this._charts.logistics = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Viagens por Dia',
                    data: values,
                    borderColor: '#d97706',
                    backgroundColor: gradientLogistics,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#FFF',
                    pointBorderColor: '#b45309',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBorderWidth: 2
                }]
            },
            options: this.getCommonChartOptions({
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) label += context.parsed.y.toLocaleString('pt-BR');
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        ticks: { stepSize: 1 }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            })
        });
    }

    renderFarmProgressChart() {
        const ctxId = 'chart-fazenda-progresso';
        const ctx = document.getElementById(ctxId);
        if (!ctx) return;

        this.destroyChart(ctxId, 'farmProgress');

        const normalize = (s) => (s || '').trim().toLowerCase();
        
        // 1. Identify farms present in OS List (registered OS)
        const osFarms = new Set();
        if (this.osListCache && Array.isArray(this.osListCache)) {
            this.osListCache.forEach(os => {
                if (os.fazenda) {
                    const fName = normalize(os.fazenda);
                    osFarms.add(fName);
                    // Extract code if present (e.g. "96 - Fazenda")
                    const match = fName.match(/^(\d+)/);
                    if (match) {
                        osFarms.add(match[1]);
                    }
                }
            });
        }

        // Use cadastroFazendas for total area and current progress
        // Filter out farms with 0 area
        let farms = (this.cadastroFazendas || []).filter(f => {
            const area = parseFloat(f.area_total);
            return area > 0;
        });
        
        // Sort by area total descending and take top 15 to avoid clutter
        farms.sort((a, b) => parseFloat(b.area_total) - parseFloat(a.area_total));
        farms = farms.slice(0, 15);

        const labels = farms.map(f => f.nome || f.codigo || 'N/A');
        const progressData = farms.map(f => {
            const total = parseFloat(f.area_total);
            let done = 0;

            // Calcular realizado varrendo plantioDiarioData para garantir dados atualizados
            (this.plantioDiarioData || []).forEach(p => {
                // Apply date filter
                if (!this.isDateInPeriod(p.data)) return;

                const processItem = (fazendaStr, area) => {
                    if (!fazendaStr || !area) return;
                    const fStr = normalize(fazendaStr);
                    const myNome = normalize(f.nome);
                    const myCod = normalize(f.codigo);
                    
                    if (fStr === myNome || fStr === myCod || (myCod && fStr.startsWith(myCod + ' '))) {
                        done += area;
                    } else {
                        // Tentar extrair código do início da string da fazenda no registro de plantio
                        // Ex: "96 - Fazenda X" -> "96"
                        const matchCode = fStr.match(/^(\d+)/);
                        if (matchCode && myCod && matchCode[1] === myCod) {
                             done += area;
                        }
                    }
                };

                if (p.frentes && Array.isArray(p.frentes)) {
                    p.frentes.forEach(fr => {
                         let val = fr.plantioDiario;
                         if (val === undefined || val === null) val = fr.plantada;
                         processItem(fr.fazenda, parseFloat(val)||0);
                    });
                } else {
                    processItem(p.fazenda, parseFloat(p.area_plantada)||0);
                }
            });

            return total > 0 ? (done / total) * 100 : 0;
        });

        // Gradient for progress bars
        const gradientComplete = this.createGradient(ctx, '#4ade80', '#16a34a'); // Green 400-600
        const gradientProgress = this.createGradient(ctx, '#60a5fa', '#2563eb'); // Blue 400-600

        this._charts.farmProgress = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Progresso (%)',
                    data: progressData,
                    backgroundColor: context => {
                        const value = context.dataset.data[context.dataIndex];
                        return value >= 100 ? gradientComplete : gradientProgress;
                    },
                    borderRadius: 8,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }]
            },
            options: this.getCommonChartOptions({
                indexAxis: 'y', // Horizontal bar
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Progresso: ${context.raw.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
                        }
                    }
                },
                scales: {
                    x: { 
                        max: 100, 
                        beginAtZero: true,
                        ticks: { 
                            callback: v => v + '%'
                        }
                    }
                }
            })
        });
    }


    // === MÉTODOS DE OS ===
    setupOSListeners() {
        const btnOS = document.getElementById('btn-os');
        const modal = document.getElementById('os-modal');
        const closeBtns = document.querySelectorAll('.close-os-modal');
        const fileInput = document.getElementById('os-file-input');

        // Listener para adicionar transporte diário
        const btnAddOSTransporte = document.getElementById('btn-add-os-transporte');
        if (btnAddOSTransporte) {
            btnAddOSTransporte.addEventListener('click', () => {
                this.addOSTransporteDiario();
            });
        }

        // Inputs de Fazenda na OS para lógica de split e verificação
        const osCodFazendaInput = document.getElementById('os-cod-fazenda');
        const osFazendaInput = document.getElementById('os-fazenda');

        if (osCodFazendaInput && osFazendaInput) {
            // [ALTERADO] Lógica simplificada para Select
            osFazendaInput.addEventListener('change', () => {
                const idx = osFazendaInput.selectedIndex;
                if (idx >= 0) {
                    const opt = osFazendaInput.options[idx];
                    if (opt && opt.dataset.codigo) {
                        osCodFazendaInput.value = opt.dataset.codigo;
                    } else {
                        osCodFazendaInput.value = '';
                    }
                }
            });

            // Sincronização reversa (Código -> Select)
            const checkFazendaExists = () => {
                const codigo = osCodFazendaInput.value;
                if (!codigo) return;
                
                // Encontrar opção pelo código
                for (let i = 0; i < osFazendaInput.options.length; i++) {
                    const opt = osFazendaInput.options[i];
                    if (opt.dataset.codigo === codigo) {
                        osFazendaInput.selectedIndex = i;
                        return;
                    }
                }
                // Se não encontrar, pode limpar ou avisar. 
                // Manter comportamento antigo de aviso se desejado, mas agora é select.
                this.ui.showNotification('Código de fazenda não encontrado na lista.', 'warning');
                osFazendaInput.value = ""; // Limpar seleção se código inválido
            };
            
            osCodFazendaInput.addEventListener('blur', checkFazendaExists);
        }

        // Navegação
        const btnNovaOS = document.getElementById('btn-nova-os');
        const btnVoltarList = document.getElementById('btn-voltar-os-list');

        if (btnOS && modal) {
            btnOS.addEventListener('click', () => {
                modal.style.display = 'flex';
                this.showOSList(); // Mostrar lista por padrão
                this.loadOSList(); // Carregar dados
            });
        }
        
        if (btnNovaOS) {
            btnNovaOS.addEventListener('click', () => {
                this.showOSForm(); // Novo
            });
        }
        
        if (btnVoltarList) {
            btnVoltarList.addEventListener('click', () => {
                this.showOSList();
            });
        }

        closeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (modal) modal.style.display = 'none';
            });
        });

        if (modal) {
            window.addEventListener('click', (e) => {
                if (e.target === modal) modal.style.display = 'none';
            });
        }

        // Listener para editar itens da lista
        const listBody = document.getElementById('os-list-body');
        if (listBody) {
             listBody.addEventListener('click', (e) => {
                 const btnEdit = e.target.closest('.btn-edit-os');
                 const btnDelete = e.target.closest('.btn-delete-os');
                 
                 if (btnEdit) {
                     const numero = btnEdit.getAttribute('data-numero');
                     this.handleEditOS(numero);
                 } else if (btnDelete) {
                     const numero = btnDelete.getAttribute('data-numero');
                     this.handleDeleteOS(numero);
                 }
             });
        }

        const btnSave = document.getElementById('os-save');
        if (btnSave) {
            btnSave.addEventListener('click', async () => {
                await this.saveOSForm();
            });
        }

        if (fileInput) {
            // Remover listeners antigos para evitar duplicação se chamado múltiplas vezes
            const newFileInput = fileInput.cloneNode(true);
            fileInput.parentNode.replaceChild(newFileInput, fileInput);
            
            newFileInput.addEventListener('change', (e) => {
                console.log('Arquivo selecionado:', e.target.files[0]);
                const file = e.target.files && e.target.files[0];
                if (file) {
                    this.handleOSFile(file);
                    newFileInput.value = ''; // Reset para permitir selecionar o mesmo arquivo
                }
            });
        } else {
            console.error('Elemento #os-file-input não encontrado no DOM');
        }
    }

    async handleOSFile(file) {
        console.log('Iniciando processamento do arquivo (NOVO FLUXO):', file.name, file.type);
        if (!file) return;

        // 1. UI Feedback IMEDIATO (Loading Overlay Simples e Infalível)
        // Remove anterior se existir
        const existingOverlay = document.getElementById('simple-loading-overlay');
        if (existingOverlay) existingOverlay.remove();

        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'simple-loading-overlay';
        loadingOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);color:white;display:flex;flex-direction:column;justify-content:center;align-items:center;z-index:99999;font-family:sans-serif;text-align:center;';
        loadingOverlay.innerHTML = `
            <div style="font-size:40px;margin-bottom:20px;">🤖</div>
            <div style="font-size:24px;font-weight:bold;margin-bottom:10px;">Processando com IA...</div>
            <div style="font-size:16px;opacity:0.8;">Isso pode levar alguns segundos.</div>
        `;
        document.body.appendChild(loadingOverlay);

        try {
            // 2. Leitura do Arquivo (FileReader - API Nativa)
            const base64Data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result;
                    // Remove prefixo data:*/*;base64,
                    const base64 = result.split(',')[1]; 
                    resolve(base64);
                };
                reader.onerror = (err) => reject(new Error('Falha ao ler arquivo: ' + err.message));
                reader.readAsDataURL(file);
            });

            console.log('Arquivo lido. Tamanho Base64:', base64Data.length);

            // 3. Determinar MimeType
            let mimeType = file.type;
            if (!mimeType) {
                if (file.name.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
                else if (file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) mimeType = 'image/jpeg';
                else if (file.name.toLowerCase().endsWith('.png')) mimeType = 'image/png';
                else mimeType = 'application/pdf'; // Default fallback
            }
            console.log('MimeType definido:', mimeType);

            // 4. Obter API Key
            let geminiKey = window.API_CONFIG ? window.API_CONFIG.geminiKey : null;
            if (!geminiKey) geminiKey = localStorage.getItem('GEMINI_API_KEY');

            if (!geminiKey || geminiKey.length < 20) {
                alert('Chave API Gemini não encontrada! Configure no menu de configurações.');
                throw new Error('Chave API ausente.');
            }

            // 5. Payload Gemini
            const payload = {
                contents: [{
                    parts: [
                        { text: `
                            EXTRAÇÃO DE DADOS DE OS AGRÍCOLA
                            Analise o documento (PDF/Imagem) e retorne APENAS um JSON válido.
                            
                            Campos obrigatórios:
                            - numero (string)
                            - status (string)
                            - abertura (YYYY-MM-DD)
                            - inicioPrev (YYYY-MM-DD)
                            - finalPrev (YYYY-MM-DD)
                            - respAplicacao (string)
                            - empresa (string)
                            - frente (string)
                            - processo (string)
                            - subprocesso (string)
                            - fazenda (string - formato 'CÓDIGO - NOME' se possível)
                            - setor (string)
                            - areaTotal (number)
                            - talhoes (array de objetos: talhao, area, proprietario, fundo)
                            - produtos (array de objetos: produto, doseRec, unidade, qtdTotal)
                            
                            Retorne NULL para campos não encontrados.
                            NÃO USE MARKDOWN. RETORNE APENAS O JSON PURO.
                        `},
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data
                            }
                        }
                    ]
                }]
            };

            // 6. Chamada Fetch (Com Fallback e Retry)
            console.log('Enviando para Gemini...');
            
            // Função auxiliar para tentar uma chamada
            const tryGemini = async (model, retryCount = 0) => {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
                console.log(`Tentando modelo: ${model} (Tentativa ${retryCount + 1})`);
                
                try {
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (res.status === 429) {
                        console.warn(`Erro 429 (Cota excedida) no modelo ${model}.`);
                        return { ok: false, status: 429, error: await res.text() };
                    }
                    
                    if (!res.ok) {
                        const txt = await res.text();
                        return { ok: false, status: res.status, error: txt };
                    }

                    return { ok: true, data: await res.json() };
                } catch (e) {
                    return { ok: false, status: 0, error: e.message };
                }
            };

            // Estratégia de Fallback (v53 - Atualizado para Gemini 2.5)
            // Prioriza a série 2.5 (atual) e mantém 2.0 como fallback legado.
            const modelChain = [
                'gemini-2.5-flash',       // 1. Novo padrão (rápido e capaz)
                'gemini-2.5-pro',         // 2. Mais inteligente (se flash falhar)
                'gemini-2.5-flash-lite',  // 3. Otimizado para custo/velocidade
                'gemini-2.0-flash',       // 4. Fallback legado (funcional até jun/26)
                'gemini-2.0-pro-exp',     // 5. Experimental antigo
            ];

            let lastError = null;
            let successResult = null;

            for (const model of modelChain) {
                // Feedback visual se não for a primeira tentativa
                if (model !== modelChain[0]) {
                    loadingOverlay.innerHTML = `
                        <div style="font-size:40px;">🔄</div>
                        <div style="font-size:24px;font-weight:bold;margin-bottom:10px;">Tentando outro servidor...</div>
                        <div style="font-size:16px;opacity:0.8;">Modelo: ${model}</div>
                    `;
                    await new Promise(r => setTimeout(r, 1500)); // Pequena pausa para UI
                }

                const result = await tryGemini(model);
                
                if (result.ok) {
                    successResult = result;
                    break; // Sucesso!
                }
                
                // Se falhou, loga e continua
                console.warn(`Falha no modelo ${model}: ${result.status} - ${result.error}`);
                lastError = result;
                
                // Se o erro não for 429 nem 404 (ex: 400 Bad Request), talvez não adiante tentar outros
                // Mas vamos tentar todos por segurança, a menos que seja erro de chave (403)
                if (result.status === 403 || (result.error && result.error.includes('API_KEY'))) {
                    throw new Error('Chave de API inválida ou sem permissão.');
                }
            }

            if (!successResult) {
                // Se chegou aqui, todos falharam
                if (lastError && lastError.status === 429) {
                     throw new Error('Todos os servidores de IA estão ocupados (Cota Excedida). Aguarde 1 minuto.');
                }
                throw new Error(`Falha em todos os modelos de IA. Último erro: ${lastError ? lastError.error : 'Desconhecido'}`);
            }

            const data = successResult.data;
            console.log('Resposta Gemini recebida:', data);

            // 7. Extração JSON
            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                let text = data.candidates[0].content.parts[0].text;
                // Limpeza agressiva
                text = text.replace(/```json/g, '').replace(/```/g, '').trim();
                
                const firstBrace = text.indexOf('{');
                const lastBrace = text.lastIndexOf('}');
                
                if (firstBrace >= 0 && lastBrace >= 0) {
                    const jsonStr = text.substring(firstBrace, lastBrace + 1);
                    const json = JSON.parse(jsonStr);
                    this.fillOSForm(json);
                    
                    // Sucesso visual
                    loadingOverlay.innerHTML = '<div style="font-size:40px;">✅</div><div style="font-size:24px;">Sucesso!</div>';
                    setTimeout(() => loadingOverlay.remove(), 1500);
                } else {
                    throw new Error('JSON não encontrado na resposta da IA.');
                }
            } else {
                throw new Error('Resposta da IA vazia.');
            }

        } catch (error) {
            console.error('ERRO FATAL:', error);
            // Mensagem amigável se for erro de cota
            let userMsg = error.message || 'Erro desconhecido';
            
            if (userMsg.includes('Limite de uso') || userMsg.includes('429')) {
                 userMsg = 'Limite de uso da IA atingido. Aguarde 1 minuto e tente novamente.';
            }

            alert('Atenção: ' + userMsg);
            
            if (loadingOverlay) {
                loadingOverlay.innerHTML = `
                    <div style="font-size:40px;">⚠️</div>
                    <div style="font-size:24px;font-weight:bold;margin-bottom:10px;">Atenção</div>
                    <div style="font-size:16px;padding:0 20px;">${userMsg}</div>
                `;
                setTimeout(() => loadingOverlay.remove(), 5000);
            }
        }
    }

    async handleOSFileOld(file) {
        console.log('Iniciando processamento do arquivo:', file.name, file.type);
        if (!file) return;

        this.ui.showNotification('Lendo arquivo PDF...', 'info', 3000);

        try {
            let content = '';
            let inlineData = null; 

            console.log('Tipo do arquivo:', file.type);

            if (file.type === 'application/pdf') {
                try {
                    console.log('Arquivo PDF detectado. Preparando envio direto...');
                    
                    // Converter PDF diretamente para Base64 sem renderizar
                    const base64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result.split(',')[1]); // Remove o prefixo data:application/pdf;base64,
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });

                    console.log('PDF convertido para Base64. Tamanho:', base64.length);
                    
                    // Configurar inlineData como application/pdf
                    // Gemini 1.5 e 2.0 suportam application/pdf nativamente
                    inlineData = { mime_type: 'application/pdf', data: base64 };
                    content = ''; // Garantir que não envie texto duplicado
                    
                    this.ui.showNotification('PDF pronto para envio.', 'info', 2000);
                    
                    // FORÇAR SAÍDA DO BLOCO TRY-CATCH DO PDF PARA CONTINUAR O FLUXO
                    // Se não houver erro, o código deve continuar naturalmente após o if/else if/else

                } catch (pdfErr) {
                    console.error('Erro no processamento do PDF:', pdfErr);
                    this.ui.showNotification('Erro ao ler arquivo PDF.', 'error');
                    return;
                }

            } else if (file.type.startsWith('image/')) {
                // Converter imagem para Base64
                content = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result.split(',')[1]); // Remove o prefixo data:image/...;base64,
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                inlineData = { mime_type: file.type, data: content };
                content = ''; // Limpar content texto pois usaremos inlineData
            } else {
                this.ui.showNotification('Formato não suportado. Use PDF.', 'error');
                console.error('Formato não suportado:', file.type);
                return;
            }

            // Chamar Gemini
            let geminiKey = window.API_CONFIG.geminiKey || localStorage.getItem('GEMINI_API_KEY');
            
            if (!geminiKey || geminiKey.trim().length < 20) {
                // Tentar abrir o modal se a chave não existir
                const modal = document.getElementById('api-key-modal');
                if (modal) {
                    modal.style.display = 'flex';
                    this.ui.showNotification('Configure sua Chave API para continuar.', 'warning');
                } else {
                    this.ui.showNotification('Chave API não configurada.', 'error');
                }
                return;
            }

            this.ui.showNotification('Enviando para análise inteligente...', 'info', 3000);

            const prompt = `
                Você é um assistente especializado em extração de dados de Ordens de Serviço (OS) Agrícolas.
                Analise o documento fornecido e extraia os dados para preencher o formulário.
                
                ATENÇÃO: Retorne APENAS um JSON válido. Não use Markdown (\`\`\`json).
                
                Estrutura do JSON:
                {
                    "numero": "string (número da OS)",
                    "status": "string (ex: Planejada, Executada)",
                    "abertura": "YYYY-MM-DD",
                    "inicioPrev": "YYYY-MM-DD",
                    "finalPrev": "YYYY-MM-DD",
                    "respAplicacao": "string (Responsável Aplicação)",
                    "empresa": "string",
                    "frente": "string",
                    "processo": "string",
                    "subprocesso": "string",
                    "fazenda": "string (IMPORTANTE: Se possível, use formato 'CÓDIGO - NOME'. Ex: '1387 - FAZENDA X'. Se não houver código, use apenas o nome)",
                    "setor": "string",
                    "areaTotal": number,
                    "talhoes": [
                        { "talhao": "string", "area": number, "proprietario": "string", "fundo": "string" }
                    ],
                    "produtos": [
                        { "produto": "string", "doseRec": number, "unidade": "string", "qtdTotal": number }
                    ]
                }
                Se algum campo não for encontrado, use null.
            `;

            // Usar gemini-2.0-flash (MANDATÓRIO: Versão mais recente e capaz)
            const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey;
            
            // Montar payload com verificação rigorosa
            const parts = [];
            
            // 1. Adicionar o prompt de texto como a primeira parte
            parts.push({ text: prompt });
            
            // 2. Adicionar o conteúdo (texto extraído ou imagem) como segunda parte
            console.log('Preparando payload Gemini...');
            console.log('Content (Texto):', content ? content.length : 'Vazio');
            console.log('InlineData (Imagem/PDF):', inlineData ? (inlineData.mime_type + ' - Tamanho: ' + (inlineData.data ? inlineData.data.length : 0)) : 'Ausente');

            if (content && content.length > 0) {
                // Modo Texto (Preferencial para PDF extraído)
                parts.push({ text: content });
                console.log('Enviando payload como TEXTO. Tamanho:', content.length);
            } else if (inlineData && inlineData.data) {
                // Modo Imagem/PDF (Base64)
                let cleanBase64 = inlineData.data.replace(/[\r\n\s]+/g, '');
                
                // Verificar se é válido (básico)
                if (cleanBase64.length % 4 !== 0) {
                    console.warn('Base64 pode estar inválido (padding incorreto). Tentando corrigir...');
                    while (cleanBase64.length % 4 !== 0) {
                        cleanBase64 += '=';
                    }
                }

                parts.push({ 
                    inline_data: {
                        mime_type: inlineData.mime_type,
                        data: cleanBase64
                    } 
                });
                console.log('Enviando payload como IMAGEM/PDF. Tipo:', inlineData.mime_type, 'Tamanho:', cleanBase64.length);
            } else {
                console.error('ERRO CRÍTICO: Nenhum conteúdo extraído para enviar.');
                this.ui.showNotification('Erro: Nenhum conteúdo legível encontrado.', 'error');
                throw new Error('Nenhum conteúdo (texto ou imagem) extraído para envio.');
            }
            
            console.log('Iniciando chamada fetch para Gemini API...');
            
            const requestBody = {
                contents: [{ 
                    parts: parts 
                }]
            };
            
            console.log('URL da Requisição:', url);
            // ATENÇÃO: Não logar o body inteiro se for muito grande, mas a estrutura sim
            console.log('Gemini Request Body (Simplified):', JSON.stringify({
                contents: [{ 
                    parts: parts.map(p => p.text ? { text: p.text.substring(0, 50) + '...' } : { inline_data: 'BASE64_DATA (' + (p.inline_data.data ? p.inline_data.data.length : 0) + ' chars)' }) 
                }]
            }));

            let response;
            const maxRetries = 3;
            for (let i = 0; i < maxRetries; i++) {
                try {
                    console.log(`Tentativa ${i+1}/${maxRetries}...`);
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    });
                    
                    console.log(`Resposta da Tentativa ${i+1}: Status ${response.status} ${response.statusText}`);

                    if (response.ok) break; // Sucesso, sai do loop
                    
                    if (response.status === 503) {
                        const waitTime = (i + 1) * 2000; // 2s, 4s, 6s
                        console.warn(`Gemini 503 (Serviço Indisponível). Tentativa ${i+1}/${maxRetries}. Aguardando ${waitTime}ms...`);
                        this.ui.showNotification(`Serviço de IA ocupado. Tentando novamente (${i+1}/${maxRetries})...`, 'info', waitTime);
                        await new Promise(r => setTimeout(r, waitTime));
                        continue;
                    }
                    
                    break; // Outro erro HTTP (400, 401, 500, etc), não tenta novamente
                } catch (fetchErr) {
                    console.error(`Erro de rede na tentativa ${i+1}:`, fetchErr);
                    if (i === maxRetries - 1) throw fetchErr; // Se for a última, lança o erro
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            if (response && response.ok) {
                const data = await response.json();
                console.log('Gemini Full Response:', data);

                if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                    const text = data.candidates[0].content.parts[0].text;
                    console.log('Gemini Raw Text:', text);
                    
                    let json = null;
                    try {
                        // Limpeza e extração robusta de JSON
                        let cleanText = text.trim();
                        // Tentar extrair apenas o bloco JSON usando regex
                        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            cleanText = jsonMatch[0];
                        }
                        
                        console.log('Cleaned JSON Text:', cleanText);
                        json = JSON.parse(cleanText);
                    } catch(e) {
                        console.error('Erro ao parsear JSON do Gemini:', e);
                        this.ui.showNotification('Erro ao interpretar resposta da IA.', 'error');
                    }

                    if (json) {
                        console.log('JSON Parseado com sucesso:', json);
                        this.fillOSForm(json);
                        this.ui.showNotification('Dados extraídos com sucesso!', 'success');
                    } else {
                        this.ui.showNotification('Não foi possível estruturar os dados.', 'warning');
                    }
                } else {
                    console.error('Resposta do Gemini sem candidatos válidos');
                    this.ui.showNotification('IA não retornou dados válidos.', 'error');
                }
            } else {
                if (response) {
                    console.error('Erro HTTP Gemini:', response.status, response.statusText);
                    if (response.status === 503) {
                        this.ui.showNotification('Serviço de IA indisponível (sobrecarga). Tente novamente em 1 minuto.', 'error', 6000);
                    } else {
                        // Tentar ler o corpo do erro para dar mais detalhes
                        try {
                            const errorBody = await response.json();
                            console.error('Detalhes do Erro Gemini:', JSON.stringify(errorBody, null, 2));
                            if (errorBody.error && errorBody.error.message) {
                                this.ui.showNotification(`Erro na IA: ${errorBody.error.message}`, 'error', 5000);
                            } else {
                                this.ui.showNotification(`Erro na IA (${response.status}). Verifique console.`, 'error');
                            }
                        } catch (e) {
                            console.error('Erro ao ler corpo da resposta de erro:', e);
                            this.ui.showNotification(`Erro na IA (${response.status}).`, 'error');
                        }
                    }
                } else {
                    this.ui.showNotification('Falha de conexão com a IA.', 'error');
                }
            }

        } catch (e) {
            console.error('Exceção no processamento:', e);
            this.ui.showNotification('Erro ao processar arquivo.', 'error');
        }
    }

    fillOSForm(data) {
        console.log('Preenchendo formulário com:', data);
        this.currentOSData = data; // Armazena dados atuais para salvar posteriormente
        const set = (id, val) => { 
            const el = document.getElementById(id); 
            if (el) {
                el.value = val || ''; 
            } else {
                console.warn('Campo não encontrado:', id);
            }
        };
        
        set('os-numero', data.numero);
        set('os-status', data.status);
        set('os-data-abertura', data.abertura);
        set('os-data-inicio', data.inicioPrev);
        set('os-data-final', data.finalPrev);
        set('os-resp', data.respAplicacao);
        set('os-empresa', data.empresa);
        set('os-frente', data.frente);
        set('os-processo', data.processo);
        set('os-subprocesso', data.subprocesso);

        // Preencher Select de Fazendas
        const fazendaEl = document.getElementById('os-fazenda');
        if (fazendaEl) {
            fazendaEl.innerHTML = '<option value="">Selecione...</option>';
            if (this.cadastroFazendas && Array.isArray(this.cadastroFazendas)) {
                // Ordenar alfabeticamente
                const sorted = [...this.cadastroFazendas].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
                sorted.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f.nome; // Mantém nome como valor para compatibilidade
                    opt.textContent = `${f.codigo} - ${f.nome}`;
                    opt.dataset.codigo = f.codigo;
                    fazendaEl.appendChild(opt);
                });
            }
        }
        
        set('os-fazenda', data.fazenda);
        
        // Atualizar código se houver fazenda selecionada
        if (fazendaEl && data.fazenda) {
             const selected = Array.from(fazendaEl.options).find(o => o.value === data.fazenda);
             if (selected && selected.dataset.codigo) {
                 const codEl = document.getElementById('os-cod-fazenda');
                 if (codEl && !codEl.value) codEl.value = selected.dataset.codigo;
             }
        }

        set('os-setor', data.setor);
        set('os-area-total', data.areaTotal);

        const talhoesBody = document.getElementById('os-talhoes-body');
        if (talhoesBody) {
            if (data.talhoes && Array.isArray(data.talhoes)) {
                talhoesBody.innerHTML = data.talhoes.map(t => `
                    <tr>
                        <td>${t.talhao || ''}</td>
                        <td>${t.area || ''}</td>
                        <td>${t.proprietario || ''}</td>
                        <td>${t.fundo || ''}</td>
                    </tr>
                `).join('');
            } else {
                console.warn('Dados de talhões inválidos ou vazios');
            }
        } else {
            console.error('Tabela de talhões não encontrada (os-talhoes-body)');
        }

        const produtosBody = document.getElementById('os-produtos-body');
        if (produtosBody) {
            if (data.produtos && Array.isArray(data.produtos)) {
                produtosBody.innerHTML = data.produtos.map(p => `
                    <tr>
                        <td>${p.produto || ''}</td>
                        <td>${p.doseRec || ''}</td>
                        <td>${p.unidade || ''}</td>
                        <td>${p.qtdTotal || ''}</td>
                    </tr>
                `).join('');
            } else {
                console.warn('Dados de produtos inválidos ou vazios');
            }
        } else {
            console.error('Tabela de produtos não encontrada (os-produtos-body)');
        }
    }

    resetOSForm() {
        this.fillOSForm({
            numero: '', status: 'Pendente', abertura: '', inicioPrev: '', finalPrev: '',
            respAplicacao: '', empresa: '', frente: '', processo: '', subprocesso: '',
            fazenda: '', setor: '', areaTotal: '',
            talhoes: [], produtos: []
        });
        this.currentOSData = null; // Clear cache
    }

    async updateEstoqueFromOS(frente) {
        if (!frente) return 0;
        try {
            console.log(`🔄 Recalculando estoque para frente ${frente}...`);
            const totais = {}; // produto -> qtd
            const productOSMap = {}; // Mapeamento Produto -> [OSs] para inferência
            const consumptionMap = {}; // [FIX] Rastrear consumo para manter saldo correto ao sobrescrever entradas
            let lastOS = null;

            // 1. Buscar dados das OSs (Adicionar produtos da OS como entrada de estoque)
            const res = await this.api.getOSList();
            let countOS = 0;
            if (res.success && res.data) {
                const osList = res.data.filter(o => String(o.frente).trim().toLowerCase() === String(frente).trim().toLowerCase());
                osList.forEach(os => {
                    if (!lastOS && os.numero) lastOS = os.numero;
                    
                    // Somar produtos da OS no estoque
                    if (os.produtos && Array.isArray(os.produtos)) {
                        os.produtos.forEach(p => {
                            const nome = p.produto;
                            const qtd = parseFloat(p.qtdTotal) || 0;
                            if (nome && qtd > 0) {
                                // Mapear produto para OS para ajudar na baixa
                                if (!productOSMap[nome]) productOSMap[nome] = [];
                                if (!productOSMap[nome].includes(os.numero)) productOSMap[nome].push(os.numero);

                                // [ALTERADO] NÃO adicionar o planejado ao estoque.
                                // O estoque deve refletir APENAS o que foi transportado (Real).
                                // O loop abaixo (Transporte) irá popular o estoque positivo.
                                // O loop de consumo irá subtrair.
                                /*
                                const key = getKey(nome, os.numero);
                                if (!totais[key]) totais[key] = 0;
                                totais[key] += qtd;
                                countOS++;
                                */
                            }
                        });
                    }
                });
            }

            // 2. Buscar Consumo (Plantio Diário + Legacy Insumos Fazendas) - SAÍDAS
            let countImport = 0;
            try {
                const result = await this.api.getInsumosFazendas(); // Busca unificada
                if (result.success && result.data) {
                    result.data.forEach(i => {
                        // Normaliza frentes para comparação
                        const iFrente = String(i.frente || '').trim().toLowerCase();
                        const targetFrente = String(frente).trim().toLowerCase();
                        
                        if (iFrente === targetFrente) {
                            const nome = i.produto;
                            const qtd = parseFloat(i.quantidadeAplicada) || 0;
                            // Tenta pegar OS se disponível (Plantio)
                            // Se o campo 'os' estiver vazio, tentamos 'numero_os' ou 'ordem_servico' caso existam no legacy
                            let os = i.os || i.numero_os || i.ordem_servico || ''; 

                            // [FIX] Tentar inferir a OS se não estiver explícita
                            if (!os && nome && productOSMap[nome] && productOSMap[nome].length === 1) {
                                os = productOSMap[nome][0];
                            }

                            if (nome && qtd > 0) {
                                const key = getKey(nome, os);
                                if (!totais[key]) totais[key] = 0;
                                totais[key] -= qtd; // SUBTRAI consumo

                                // [FIX] Rastrear consumo separado
                                if (!consumptionMap[key]) consumptionMap[key] = 0;
                                consumptionMap[key] += qtd;

                                countImport++;
                            }
                        }
                    });
                }
            } catch (errConsumo) {
                console.error('Erro ao buscar consumo (plantio/insumos):', errConsumo);
            }

            // 3. Buscar Consumo (Insumos Oxifertil) - SAÍDAS
            try {
                const oxiRes = await this.api.getOxifertil();
                if (oxiRes.success && oxiRes.data) {
                    const targetFrente = String(frente).trim().toLowerCase();
                    
                    oxiRes.data.forEach(i => {
                        const iFrente = String(i.frente || '').trim().toLowerCase();
                        
                        // Simular o comportamento do ILIKE do banco
                        if (iFrente.includes(targetFrente) || targetFrente.includes(iFrente)) {
                            const nome = i.produto;
                            const qtd = parseFloat(i.quantidadeAplicada) || 0;
                            if (nome && qtd > 0) {
                                const key = nome.trim();
                                if (!totais[key]) totais[key] = 0;
                                totais[key] -= qtd; // SUBTRAI consumo

                                // [FIX] Rastrear consumo separado
                                if (!consumptionMap[key]) consumptionMap[key] = 0;
                                consumptionMap[key] += qtd;
                                
                                countImport++;
                            }
                        }
                    });
                }
            } catch (errOxi) {
                console.error('Erro ao buscar insumos_oxifertil:', errOxi);
            }

            // [FIX] Rastrear chaves atualizadas por transporte para sobrescrever o planejado (Estoque Real)
            const transportKeys = new Set();

            // 4. Buscar Transporte de Composto (Entradas REALIZADAS - Diários)
            try {
                // 1. Buscar headers para obter IDs e números de OS da frente
                const { data: headers } = await this.api.supabase
                    .from('transporte_composto')
                    .select('id, numero_os')
                    .ilike('frente', frente);

                if (headers && headers.length > 0) {
                    const ids = headers.map(h => h.id);
                    
                    // 2. Buscar itens diários (quantidade real transportada)
                    const { data: diarios } = await this.api.supabase
                        .from('os_transporte_diario')
                        .select('os_id, quantidade')
                        .in('os_id', ids);

                    if (diarios && diarios.length > 0) {
                        diarios.forEach(d => {
                            const qtd = parseFloat(d.quantidade) || 0;
                            if (qtd > 0) {
                                // Encontrar header para pegar numero_os
                                const header = headers.find(h => h.id === d.os_id);
                                const osNum = header ? header.numero_os : '';
                                
                                // Usar chave composta para separar por OS se necessário, 
                                // ou somar tudo em COMPOSTO se preferir agrupar. 
                                // O padrão getKey separa por OS.
                                const key = getKey('COMPOSTO', osNum);
                                
                                // Sobrescrever valor planejado na primeira vez que encontramos transporte
                                if (!transportKeys.has(key)) {
                                    // [FIX] Resetar para (0 - Consumo) para preservar o consumo já processado
                                    totais[key] = -(consumptionMap[key] || 0);
                                    transportKeys.add(key);
                                }

                                if (!totais[key]) totais[key] = 0;
                                totais[key] += qtd;
                                
                                if (!lastOS && osNum) lastOS = osNum;
                                countImport++; 
                            }
                        });
                    }
                }
            } catch (errTrans) {
                console.error('Erro ao buscar transporte_composto:', errTrans);
            }

            // 5. Buscar Viagens de Adubo/Insumos
            try {
                const { data: viagens } = await this.api.supabase
                    .from('viagens_adubo')
                    .select('produto, quantidade_total, numero_os')
                    .ilike('frente', frente);

                if (viagens && viagens.length > 0) {
                    viagens.forEach(v => {
                        const nome = v.produto;
                        const qtd = parseFloat(v.quantidade_total) || 0;
                        // Prioriza numero_os da viagem
                        const os = v.numero_os || '';

                        if (nome && qtd > 0) {
                            const key = getKey(nome, os);

                            // Sobrescrever valor planejado na primeira vez que encontramos transporte
                            if (!transportKeys.has(key)) {
                                // [FIX] Resetar para (0 - Consumo) para preservar o consumo já processado
                                totais[key] = -(consumptionMap[key] || 0);
                                transportKeys.add(key);
                            }

                            if (!totais[key]) totais[key] = 0;
                            totais[key] += qtd;
                            if (!lastOS && v.numero_os) lastOS = v.numero_os;
                            countImport++;
                        }
                    });
                }
            } catch (errViagem) {
                console.error('Erro ao buscar viagens_adubo:', errViagem);
            }

            // 4. Limpeza de registros obsoletos (Produtos que não existem mais nas OSs/Imports)
            try {
                // Busca apenas estoque desta frente para verificar o que deve ser removido
                const estoqueAtual = await this.api.getEstoqueByFrente(frente);
                if (estoqueAtual.success && estoqueAtual.data) {
                    // Identifica produtos que estão no banco mas não estão no novo cálculo (totais)
                    const itemsToDelete = estoqueAtual.data.filter(item => 
                        !totais.hasOwnProperty(item.produto)
                    );

                    if (itemsToDelete.length > 0) {
                        console.log(`🗑️ Removendo ${itemsToDelete.length} itens obsoletos do estoque da frente ${frente}...`);
                        const deletePromises = itemsToDelete.map(item => 
                            this.api.deleteEstoque(item.frente, item.produto)
                        );
                        await Promise.all(deletePromises);
                    }
                }
            } catch (errCleanup) {
                console.error('Erro na limpeza de estoque:', errCleanup);
            }

            // Salvar no Estoque
            const promises = Object.entries(totais).map(([key, qtd]) => {
                let prodToSave = key;
                let osNum = lastOS || '';

                // Recuperar OS para o campo os_numero, mas MANTER a chave completa no produto
                // para garantir unicidade no banco (frente, produto)
                if (key.includes('__OS__')) {
                    const parts = key.split('__OS__');
                    // prodName = parts[0]; // Não usamos apenas o nome, senão sobrescreve
                    osNum = parts[1];
                    prodToSave = key; // Salva "COMPOSTO__OS__123"
                }

                return this.api.setEstoque(
                    frente, 
                    prodToSave, 
                    qtd, 
                    String(osNum), 
                    new Date().toISOString()
                );
            });
            
            if (promises.length > 0) {
                await Promise.all(promises);
                console.log(`✅ Estoque atualizado para ${frente}: ${promises.length} produtos únicos. (OS: ${countOS}, Import: ${countImport})`);
                return { 
                    uniqueProducts: promises.length, 
                    sources: { os: countOS, import: countImport } 
                };
            } else {
                console.log(`⚠️ Nenhum produto encontrado para frente ${frente}.`);
                return { uniqueProducts: 0, sources: { os: 0, import: 0 } };
            }
            
        } catch (e) {
            console.error('Erro ao atualizar estoque from OS:', e);
            this.ui.showNotification(`Erro ao atualizar estoque da frente ${frente}: ${e.message}`, 'error');
            return { uniqueProducts: 0, sources: { os: 0, import: 0 } };
        }
    }

    async syncAllEstoqueFromOS() {
        if (!confirm('Isso irá recalcular o estoque de TODAS as frentes baseado nas OSs e Importações. Deseja continuar?')) return;
        
        this.ui.showLoading();
        try {
            console.log('🔄 Sincronizando todo o estoque...');
            const res = await this.api.getOSList();
            
            // Buscar também frentes das tabelas de insumos para garantir cobertura total
            // (Opcional, mas recomendado se existirem frentes apenas no import)
            let frentes = new Set();
            if (res.success && res.data) {
                res.data.forEach(os => {
                    if (os.frente) frentes.add(os.frente);
                });
            }
            
            // Adicionar frentes dos insumos importados (pode demorar um pouco, mas garante consistência)
            const { data: fazFrentes } = await this.api.supabase.from('insumos_fazendas').select('frente');
            if (fazFrentes) fazFrentes.forEach(f => { if(f.frente) frentes.add(f.frente); });

            // Adicionar frentes do Oxifertil (via função API, não tabela direta)
            const oxiRes = await this.api.getOxifertil();
            if (oxiRes.success && oxiRes.data) {
                oxiRes.data.forEach(i => { if(i.frente) frentes.add(i.frente); });
            }

            // Adicionar frentes de Transporte e Viagens
            const { data: transFrentes } = await this.api.supabase.from('transporte_composto').select('frente');
            if (transFrentes) transFrentes.forEach(f => { if(f.frente) frentes.add(f.frente); });

            const { data: viagFrentes } = await this.api.supabase.from('viagens_adubo').select('frente');
            if (viagFrentes) viagFrentes.forEach(f => { if(f.frente) frentes.add(f.frente); });

            const frentesArray = [...frentes];
            
            let stats = [];
            let totalUpdated = 0;

            for (const frente of frentesArray) {
                const result = await this.updateEstoqueFromOS(frente);
                // result agora é um objeto
                const count = result.uniqueProducts || 0;
                const src = result.sources || { os: 0, import: 0 };
                
                stats.push(`${frente}: ${count} produtos (OS: ${src.os}, Imp: ${src.import})`);
                if (count > 0) totalUpdated += count;
            }
            
            let msg = `Sincronização concluída!\nTotal de produtos atualizados: ${totalUpdated}\n\nDetalhes:\n${stats.join('\n')}`;
            alert(msg);

            await this.loadEstoqueAndRender();
        } catch (e) {
            console.error('Erro ao sincronizar estoque:', e);
            this.ui.showNotification('Erro fatal ao sincronizar estoque.', 'error');
        } finally {
            this.ui.hideLoading();
        }
    }

    async saveOSForm() {
        this.ui.showLoading();
        try {
            // Coletar dados do formulário
            const getVal = (id) => {
                const el = document.getElementById(id);
                return el ? el.value : '';
            };

            const payload = {
                numero: getVal('os-numero'),
                status: getVal('os-status'),
                abertura: getVal('os-data-abertura'),
                inicioPrev: getVal('os-data-inicio'),
                finalPrev: getVal('os-data-final'),
                respAplicacao: getVal('os-resp'),
                empresa: getVal('os-empresa'),
                frente: getVal('os-frente'),
                processo: getVal('os-processo'),
                subprocesso: getVal('os-subprocesso'),
                fazenda: getVal('os-fazenda'),
                setor: getVal('os-setor'),
                areaTotal: parseFloat(getVal('os-area-total')) || 0,
                // Manter arrays originais se existirem
                talhoes: this.currentOSData ? this.currentOSData.talhoes : [],
                produtos: this.currentOSData ? this.currentOSData.produtos : []
            };

            if (!payload.numero) {
                this.ui.showNotification('Número da OS é obrigatório.', 'warning');
                this.ui.hideLoading();
                return;
            }

            // Validação de Fazenda ANTES de salvar
            const fazendaNome = payload.fazenda.trim();
            const fazendaCodInput = document.getElementById('os-cod-fazenda');
            const fazendaCod = fazendaCodInput ? parseInt(fazendaCodInput.value) : null;

            if (fazendaNome) {
                const normalize = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
                const nomeNorm = normalize(fazendaNome);

                const exists = this.cadastroFazendas && this.cadastroFazendas.find(f => {
                    const fNomeNorm = normalize(f.nome);
                    const matchName = nomeNorm && fNomeNorm === nomeNorm;
                    const matchCode = fazendaCod && String(f.codigo) === String(fazendaCod);
                    return matchName || matchCode;
                });

                if (!exists) {
                    const confirmCadastro = window.confirm(`A fazenda "${fazendaNome}" não possui cadastro. Deseja cadastrar agora?`);
                    if (confirmCadastro) {
                        this.ui.hideLoading();
                        // Abrir modal de cadastro de fazenda
                        const fazendasModal = document.getElementById('fazendas-modal');
                        if (fazendasModal) {
                            fazendasModal.style.display = 'flex';
                            
                            // Preencher dados
                            const cNome = document.getElementById('cadastro-fazenda-nome');
                            const cCod = document.getElementById('cadastro-fazenda-codigo');
                            const cRegiao = document.getElementById('cadastro-fazenda-regiao');
                            const cArea = document.getElementById('cadastro-fazenda-area-total');

                            if (cNome) cNome.value = fazendaNome;
                            if (cCod && fazendaCod) cCod.value = fazendaCod;
                            if (cRegiao) cRegiao.value = payload.setor || '';
                            if (cArea) cArea.value = payload.areaTotal || '';
                            
                            this.ui.showNotification('Preencha os dados da fazenda e salve.', 'info', 4000);
                        }
                        return; // Interrompe o salvamento da OS
                    }
                    // Se usuário cancelar, assume que quer salvar a OS sem cadastrar a fazenda
                } else {
                    // Se existe, garantir que o código está correto no payload se não estiver
                    if (exists.codigo && !fazendaCod) {
                        // Opcional: atualizar payload se tiver campo de código no backend da OS
                        // payload.codFazenda = exists.codigo;
                    }
                }
            }

            const res = await this.api.saveOS(payload);
            
            if (res && res.success) {
                this.ui.showNotification('OS salva com sucesso!', 'success');
                
                // Atualizar estoque
                if (payload.frente) {
                    await this.updateEstoqueFromOS(payload.frente);
                    // Forçar atualização visual do estoque se possível
                    await this.loadEstoqueAndRender(); 
                }

                // Voltar para a lista e recarregar
                this.showOSList();
                this.loadOSList();
            } else {
                this.ui.showNotification('Erro ao salvar OS.', 'error');
            }

        } catch (e) {
            console.error('Erro ao salvar OS:', e);
            this.ui.showNotification('Erro ao salvar OS: ' + e.message, 'error');
        } finally {
            this.ui.hideLoading();
        }
    }

    showOSList() {
        const viewList = document.getElementById('os-view-list');
        const viewForm = document.getElementById('os-view-form');
        if (viewList) viewList.style.display = 'block';
        if (viewForm) viewForm.style.display = 'none';
        this.currentOSData = null; // Limpar dados em edição
    }

    showOSForm() {
        const viewList = document.getElementById('os-view-list');
        const viewForm = document.getElementById('os-view-form');
        if (viewList) viewList.style.display = 'none';
        if (viewForm) viewForm.style.display = 'block';
        
        // Controle de visibilidade do transporte diário
        const transporteContainer = document.getElementById('os-transporte-container');
        const transporteWarning = document.getElementById('os-transporte-warning');
        
        if (this.currentOSData && this.currentOSData.id) {
            if (transporteContainer) transporteContainer.style.display = 'block';
            if (transporteWarning) transporteWarning.style.display = 'none';
            // Carregar dados
            this.loadOSTransporteDiario(this.currentOSData.id);
        } else {
            if (transporteContainer) transporteContainer.style.display = 'none';
            if (transporteWarning) transporteWarning.style.display = 'block';
        }
        
        // Limpar formulário para nova inserção se não estiver editando
        if (!this.currentOSData) {
            this.clearOSForm();
        }
    }

    clearOSForm() {
        const ids = [
            'os-numero', 'os-status', 'os-data-abertura', 'os-data-inicio', 
            'os-data-final', 'os-resp', 'os-empresa', 'os-frente', 
            'os-processo', 'os-subprocesso', 'os-fazenda', 'os-setor', 'os-area-total'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('os-talhoes-body').innerHTML = '';
        document.getElementById('os-produtos-body').innerHTML = '';
        this.currentOSData = null;
    }

    async loadOSList() {
        const tbody = document.getElementById('os-list-body');
        
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="loading">Carregando...</td></tr>';

        try {
            const res = await this.api.getOSList();
            if (res.success && res.data) {
                this.osListCache = res.data; // Cache para edição
                
                // Populate Frente dropdown (usado em algumas telas legadas)
                const adminRecalcBtn = document.getElementById('admin-recalc-stats-btn');
        if (adminRecalcBtn) {
            adminRecalcBtn.addEventListener('click', () => {
                if (confirm('Tem certeza? Isso irá recalcular os totais acumulados de TODAS as fazendas com base no histórico de lançamentos. Isso pode levar alguns segundos.')) {
                    this.recalculateAllFarmStats();
                }
            });
        }

        const singleFrente = document.getElementById('single-frente');
                if (singleFrente) {
                    singleFrente.innerHTML = '<option value="">Selecione</option>';
                    const frentes = [...new Set(res.data.map(os => os.frente).filter(Boolean))].sort();
                    frentes.forEach(frente => {
                        const option = document.createElement('option');
                        option.value = frente;
                        option.textContent = frente;
                        singleFrente.appendChild(option);
                    });
                }

                // Populate select de O.S do modal de Plantio/Qualidade
                const singleOs = document.getElementById('single-os');
                if (singleOs) {
                    singleOs.innerHTML = '<option value="">Selecione a O.S</option>' +
                        res.data
                            .map(os => `<option value="${os.numero}">${os.numero} - ${os.fazenda || 'Sem Fazenda'}${os.frente ? ' (' + os.frente + ')' : ''}</option>`)
                            .join('');
                }

                if (tbody) {
                    if (res.data.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" class="loading">Nenhuma OS encontrada.</td></tr>';
                        return;
                    }

                    tbody.innerHTML = res.data.map(os => `
                        <tr>
                            <td>${os.numero || '-'}</td>
                            <td><span class="status-badge ${this.getStatusClass(os.status)}">${os.status || 'Pendente'}</span></td>
                            <td>${os.fazenda || '-'}</td>
                            <td>${this.ui.formatDateBR(os.abertura)}</td>
                            <td>${os.respAplicacao || '-'}</td>
                            <td>
                                <button class="btn btn-sm btn-secondary btn-edit-os" data-numero="${os.numero}">✏️ Editar</button>
                                <button class="btn btn-sm btn-delete-os" data-numero="${os.numero}" style="background-color: #e74c3c; color: white; margin-left: 5px;">🗑️ Excluir</button>
                            </td>
                        </tr>
                    `).join('');
                }
            } else {
                if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="error">Erro ao carregar dados.</td></tr>';
            }
        } catch (e) {
            console.error('Erro ao carregar lista de OS:', e);
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="error">Erro de conexão.</td></tr>';
        }
    }

    async recalculateAllFarmStats() {
        const progressEl = document.getElementById('recalc-progress');
        if (progressEl) {
            progressEl.style.display = 'block';
            progressEl.textContent = 'Iniciando recálculo...';
        }

        try {
            console.log('🔄 Iniciando recálculo total de estatísticas das fazendas...');
            
            // 1. Carregar TODOS os dados necessários
            const [fazendasRes, plantioRes] = await Promise.all([
                this.api.getFazendas(),
                this.api.getPlantioDia()
            ]);

            if (!fazendasRes.success || !plantioRes.success) {
                throw new Error('Falha ao carregar dados iniciais.');
            }

            const fazendas = fazendasRes.data || [];
            const plantios = plantioRes.data || [];

            console.log(`Encontradas ${fazendas.length} fazendas e ${plantios.length} registros de plantio.`);

            let processedCount = 0;
            const totalFazendas = fazendas.length;

            // 2. Iterar sobre cada fazenda
            for (const fazenda of fazendas) {
                const codFazenda = String(fazenda.codigo).trim();
                const nomeFazenda = (fazenda.fazenda || '').trim().toLowerCase();

                // 3. Filtrar registros de plantio desta fazenda
                const registrosFazenda = plantios.filter(p => {
                    // Verificar Frentes (Array ou Objeto Único legado)
                    let frentes = [];
                    if (Array.isArray(p.frentes)) {
                        frentes = p.frentes;
                    } else if (typeof p.frentes === 'string') {
                         try { frentes = JSON.parse(p.frentes); } catch(e) {}
                    }
                    
                    if (!Array.isArray(frentes)) return false;

                    return frentes.some(f => {
                        const fCod = String(f.cod || '').trim();
                        const fNome = (f.fazenda || '').trim().toLowerCase();
                        
                        // Match por Código (mais seguro) ou Nome
                        if (codFazenda && fCod === codFazenda) return true;
                        if (nomeFazenda && fNome === nomeFazenda) return true;
                        
                        return false;
                    });
                });

                // 4. Calcular Totais
                let totalPlantio = 0;
                let totalMuda = 0;
                let totalCobricao = 0;

                registrosFazenda.forEach(p => {
                    let frentes = Array.isArray(p.frentes) ? p.frentes : [];
                    if (typeof p.frentes === 'string') {
                         try { frentes = JSON.parse(p.frentes); } catch(e) {}
                    }

                    // Somar área das frentes que pertencem a esta fazenda
                    frentes.forEach(f => {
                        const fCod = String(f.cod || '').trim();
                        const fNome = (f.fazenda || '').trim().toLowerCase();
                        const isMatch = (codFazenda && fCod === codFazenda) || (nomeFazenda && fNome === nomeFazenda);
                        
                        if (isMatch) {
                            // Área Plantada
                            const area = parseFloat(f.plantioDiario || f.plantada || 0);
                            totalPlantio += area;
                        }
                    });

                    // Somar Qualidade (Muda/Cobrição) se houver
                    // A qualidade geralmente é por registro (dia), assumindo que o registro é para a fazenda
                    // Se o registro tiver múltiplas frentes de fazendas diferentes, isso pode ser impreciso,
                    // mas o sistema atual parece ser 1 registro = 1 frente principal.
                    if (p.qualidade) {
                         // Verificar se o registro pertence majoritariamente a esta fazenda (pela primeira frente)
                         const mainFrente = frentes[0];
                         if (mainFrente) {
                             const fCod = String(mainFrente.cod || '').trim();
                             const fNome = (mainFrente.fazenda || '').trim().toLowerCase();
                             const isMatch = (codFazenda && fCod === codFazenda) || (nomeFazenda && fNome === nomeFazenda);
                             
                             if (isMatch) {
                                 totalMuda += parseFloat(p.qualidade.mudaConsumoDia || 0);
                                 totalCobricao += parseFloat(p.qualidade.cobricaoDia || p.qualidade.cobricao_dia || 0);
                             }
                         }
                    }
                });

                // 5. Atualizar Fazenda
                // Arredondar para evitar dízimas
                totalPlantio = Math.round(totalPlantio * 100) / 100;
                totalMuda = Math.round(totalMuda * 100) / 100;
                totalCobricao = Math.round(totalCobricao * 100) / 100;

                // Verificar se precisa atualizar (evitar chamadas desnecessárias)
                const currentPlantio = parseFloat(fazenda.plantio_acumulado || 0);
                const currentMuda = parseFloat(fazenda.muda_acumulada || 0);
                const currentCobricao = parseFloat(fazenda.cobricao_acumulada || 0);

                if (Math.abs(totalPlantio - currentPlantio) > 0.01 || 
                    Math.abs(totalMuda - currentMuda) > 0.01 || 
                    Math.abs(totalCobricao - currentCobricao) > 0.01) {
                    
                    console.log(`Atualizando Fazenda ${fazenda.fazenda} (${codFazenda}): Plantio ${currentPlantio}->${totalPlantio}, Muda ${currentMuda}->${totalMuda}`);
                    
                    await this.api.updateFazenda(fazenda.codigo, {
                        plantioAcumulado: totalPlantio,
                        mudaAcumulada: totalMuda,
                        cobricaoAcumulada: totalCobricao
                    });
                }

                processedCount++;
                if (progressEl) progressEl.textContent = `Processando... ${processedCount}/${totalFazendas}`;
            }

            if (progressEl) {
                progressEl.textContent = 'Concluído!';
                setTimeout(() => progressEl.style.display = 'none', 3000);
            }
            
            this.ui.showNotification('Recálculo de estatísticas concluído com sucesso!', 'success');
            
            // Recarregar caches
            const newFazendas = await this.api.getFazendas();
            if (newFazendas.success) this.cadastroFazendas = newFazendas.data;

        } catch (e) {
            console.error('Erro no recálculo:', e);
            this.ui.showNotification('Erro ao recalcular estatísticas: ' + e.message, 'error');
            if (progressEl) progressEl.textContent = 'Erro!';
        }
    }

    getStatusClass(status) {
        if (!status) return '';
        const s = status.toLowerCase();
        if (s.includes('executad') || s.includes('concluid')) return 'status-success'; // Verde
        if (s.includes('planejad') || s.includes('abert')) return 'status-warning'; // Amarelo
        if (s.includes('cancel')) return 'status-danger'; // Vermelho
        return '';
    }

    handleEditOS(numero) {
        if (!this.osListCache) return;
        const os = this.osListCache.find(i => String(i.numero) === String(numero));
        if (os) {
            this.fillOSForm(os);
            this.showOSForm();
            // Precisamos garantir que currentOSData tenha os arrays mesmo que venham do banco
            // O getOSList deve retornar tudo. Se o banco retorna JSONB, deve estar ok.
        }
    }

    async handleDeleteOS(numero) {
        if (!numero) return;
        const ok = window.confirm(`Tem certeza que deseja excluir a OS ${numero}?`);
        if (!ok) return;

        try {
            this.ui.showLoading();
            const res = await this.api.deleteOS(numero);
            if (res.success) {
                this.ui.showNotification('OS excluída com sucesso', 'success');
                await this.loadOSList();
            } else {
                this.ui.showNotification('Erro ao excluir OS', 'error');
            }
        } catch (e) {
            console.error('Erro ao excluir OS:', e);
            this.ui.showNotification('Erro ao excluir OS', 'error');
        } finally {
            this.ui.hideLoading();
        }
    }

    // === MÉTODOS DE METAS E GRÁFICO DE PLANTIO ===

    setupMetaListeners() {
        const btnConfigMetas = document.getElementById('btn-config-metas');
        const metasModal = document.getElementById('metas-modal');
        const closeMetasButtons = document.querySelectorAll('.close-metas-modal');
        const btnSaveMeta = document.getElementById('btn-save-meta');

        if (btnConfigMetas && metasModal) {
            btnConfigMetas.addEventListener('click', () => {
                metasModal.style.display = 'flex';
                this.loadMetasUI();
            });
        }

        closeMetasButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (metasModal) metasModal.style.display = 'none';
            });
        });

        if (metasModal) {
            window.addEventListener('click', (e) => {
                if (e.target === metasModal) metasModal.style.display = 'none';
            });
        }

        if (btnSaveMeta) {
            btnSaveMeta.addEventListener('click', async () => {
                await this.saveMetaUI();
            });
        }

        const plantioFrenteFilter = document.getElementById('plantio-chart-frente');
        if (plantioFrenteFilter) {
            plantioFrenteFilter.addEventListener('change', () => {
                this.renderPlantioChart();
            });
        }
    }

    async loadMetasUI(silent = false) {
        if (!silent) this.ui.showLoading();
        
        // Ensure plantio data is loaded for frentes
        let sourceData = this.plantioDiarioData;
        if (!sourceData || sourceData.length === 0) {
            try {
                const res = await this.api.getPlantioDiario();
                if (res.success) {
                    this.plantioDiarioData = res.data.map(p => {
                        if (typeof p.frentes === 'string') {
                            try { p.frentes = JSON.parse(p.frentes); } catch(e) { console.error('Erro parse frentes loadMeta:', e); }
                        }
                        if (typeof p.insumos === 'string') {
                            try { p.insumos = JSON.parse(p.insumos); } catch(e) { console.error('Erro parse insumos loadMeta:', e); }
                        }
                        if (typeof p.qualidade === 'string') {
                            try { p.qualidade = JSON.parse(p.qualidade); } catch(e) { console.error('Erro parse qualidade loadMeta:', e); }
                        }
                        return p;
                    });
                    sourceData = this.plantioDiarioData;
                }
            } catch (e) {
                console.error('Erro ao buscar dados de plantio para metas:', e);
            }
        }
        
        // Extract unique frentes and map to fazendas
        const frentesMap = new Map(); // frente -> fazenda
        
        if (sourceData && Array.isArray(sourceData)) {
            sourceData.forEach(item => {
                // plantio_diario stores frentes in 'frentes' array column (JSON)
                if (Array.isArray(item.frentes)) {
                    item.frentes.forEach(f => {
                        if (f.frente) {
                            // If not mapped or if we want to overwrite, store fazenda
                            // Prefer keeping first found or specific logic
                            if (!frentesMap.has(f.frente)) {
                                frentesMap.set(f.frente, f.fazenda || '');
                            }
                        }
                    });
                }
            });
        }
        
        const frentes = Array.from(frentesMap.keys()).sort();
        
        const select = document.getElementById('meta-frente');
        if (select) {
            select.innerHTML = '<option value="">Selecione a Frente...</option>';
            frentes.forEach(f => {
                const fazenda = frentesMap.get(f) || '';
                const opt = document.createElement('option');
                opt.value = f;
                opt.textContent = fazenda ? `${f} - ${fazenda}` : f;
                select.appendChild(opt);
            });
        }

        const filterSelect = document.getElementById('plantio-chart-frente');
        if (filterSelect && filterSelect.options.length <= 1) { // Só 'all' existe
             frentes.forEach(f => {
                 const fazenda = frentesMap.get(f) || '';
                 const opt = document.createElement('option');
                 opt.value = f;
                 opt.textContent = fazenda ? `${f} - ${fazenda}` : f;
                 filterSelect.appendChild(opt);
             });
        }

        // Carregar metas salvas
        try {
            const res = await this.api.getMetas();
            if (res.success && res.data) {
                this.metasData = res.data; // Cache
                
                const tbody = document.getElementById('metas-table-body');
                if (tbody && !silent) {
                    tbody.innerHTML = '';
                    res.data.forEach(m => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>${m.frente}</td>
                            <td>${parseFloat(m.meta_diaria).toFixed(2)}</td>
                        `;
                        tbody.appendChild(tr);
                    });
                }
                
                // Se carregou silenciosamente, aproveita para renderizar o gráfico se houver dados
                if (silent && this.insumosFazendasData) {
                    this.renderPlantioChart();
                }
            }
        } catch (e) {
            console.warn('Erro ao carregar metas:', e);
        } finally {
            if (!silent) this.ui.hideLoading();
        }
    }

    async saveMetaUI() {
        const frenteInput = document.getElementById('meta-frente');
        const valorInput = document.getElementById('meta-valor');
        const frente = frenteInput.value.trim();
        const valor = parseFloat(valorInput.value);

        if (!frente || isNaN(valor)) {
            alert('Preencha frente e valor corretamente.');
            return;
        }

        this.ui.showLoading();
        try {
            const res = await this.api.saveMeta({ frente, meta_diaria: valor });
            if (res.success) {
                this.ui.showNotification('Meta salva com sucesso!', 'success');
                frenteInput.value = '';
                valorInput.value = '';
                await this.loadMetasUI(); // Recarrega tabela e cache
                this.renderPlantioChart(); // Atualiza gráfico
            }
        } catch (e) {
            console.error(e);
            this.ui.showNotification('Erro ao salvar meta.', 'error');
        } finally {
            this.ui.hideLoading();
        }
    }

    renderPlantioChart() {
        // console.log('📈 renderPlantioChart iniciado');
        const canvas = document.getElementById('chart-plantio-diario');
        if (!canvas) return;

        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        // Dados base
        const data = this.plantioDiarioData || [];
        const metas = this.metasData || [];

        // Filtro de frente
        const filterFrente = document.getElementById('plantio-chart-frente')?.value || 'all';
        
        // Processamento: Agrupar por data e frente
        const diario = {}; 
        const frentesSet = new Set();
        const datesSet = new Set();
        
        const normalize = (s) => (s || '').trim();

        data.forEach(item => {
            const dataKey = item.data ? item.data.split('T')[0] : null;
            if (!dataKey) return;

            const addEntry = (frenteRaw, area) => {
                const f = normalize(frenteRaw) || 'Geral';
                if (filterFrente !== 'all' && f !== filterFrente) return;
                
                if (!diario[dataKey]) diario[dataKey] = {};
                if (!diario[dataKey][f]) diario[dataKey][f] = 0;
                
                diario[dataKey][f] += parseFloat(area || 0);
                frentesSet.add(f);
                datesSet.add(dataKey);
            };

            if (item.frentes && Array.isArray(item.frentes)) {
                item.frentes.forEach(f => {
                    let val = f.plantioDiario;
                    if (val === undefined || val === null) val = f.plantada;
                    addEntry(f.frente, val);
                });
            } else {
                addEntry(item.frente, item.area_plantada);
            }
        });

        const dates = Array.from(datesSet).sort();
        
        if (dates.length === 0) {
            if (this.plantioChartInstance) {
                this.plantioChartInstance.destroy();
                this.plantioChartInstance = null;
            }
            return;
        }

        const frentes = Array.from(frentesSet).sort();

        // Datasets
        const datasets = [];
        
        // Paleta de gradients moderna
        const palettes = [
            ['#3b82f6', '#1d4ed8'], // Blue 500-700
            ['#22c55e', '#15803d'], // Green 500-700
            ['#f59e0b', '#b45309'], // Amber 500-700
            ['#a855f7', '#7e22ce'], // Purple 500-700
            ['#ef4444', '#b91c1c'], // Red 500-700
            ['#06b6d4', '#0e7490'], // Cyan 500-700
            ['#8b5cf6', '#6d28d9'], // Violet 500-700
            ['#64748b', '#334155']  // Slate 500-700
        ];

        frentes.forEach((frente, index) => {
            const palette = palettes[index % palettes.length];
            const gradient = this.createGradient(canvas, palette[0], palette[1]);
            
            // Dados de Realizado (Barras)
            const dataPoints = dates.map(d => diario[d] && diario[d][frente] ? diario[d][frente] : 0);
            
            datasets.push({
                label: `Realizado - ${frente}`,
                data: dataPoints,
                backgroundColor: gradient,
                borderRadius: 8,
                borderSkipped: false,
                barPercentage: 0.7,
                categoryPercentage: 0.8,
                type: 'bar',
                order: 2
            });

            // Dados de Meta (Linha)
            const meta = metas.find(m => m.frente === frente);
            if (meta) {
                const metaVal = parseFloat(meta.meta_diaria);
                datasets.push({
                    label: `Meta - ${frente}`,
                    data: dates.map(() => metaVal),
                    borderColor: palette[1],
                    borderWidth: 2,
                    borderDash: [5, 5],
                    type: 'line',
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0,
                    order: 1
                });
            }
        });

        this.plantioChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: dates.map(d => {
                    const parts = d.split('-');
                    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
                }),
                datasets: datasets
            },
            options: this.getCommonChartOptions({
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ha';
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: false,
                        grid: { display: false }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Hectares (ha)',
                            font: { family: "'Inter', sans-serif", size: 12 },
                            color: '#64748b'
                        }
                    }
                }
            })
        });
    }
    async setupLegacyListeners() {
        if (this.legacyListenersAttached) return;
        console.log('setupLegacyListeners started');

        // Shift Selectors Logic
        const shiftBtns = document.querySelectorAll('.shift-btn');
        shiftBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent form submission if inside form
                const parent = btn.closest('.shift-selector');
                if (!parent) return;
                
                // Toggle classes
                parent.querySelectorAll('.shift-btn').forEach(b => {
                    b.classList.remove('active', 'btn-primary');
                    b.classList.add('btn-secondary');
                    // Remove active style manually if needed, but classes should handle it
                });
                
                btn.classList.add('active', 'btn-primary');
                btn.classList.remove('btn-secondary');
                
                // Update hidden input
                const input = parent.querySelector('input[type="hidden"]');
                const val = btn.getAttribute('data-shift');
                if (input) {
                    input.value = val;
                    // Trigger change event if needed
                    input.dispatchEvent(new Event('change'));
                }
            });
        });

        const estoqueFrenteFilter = document.getElementById('estoque-frente-filter');
        const estoqueProdutoFilter = document.getElementById('estoque-produto-filter');
        if (estoqueFrenteFilter) {
            estoqueFrenteFilter.addEventListener('change', async () => {
                if (this.isLoadingEstoque) return; // Prevent recursive calls
                this.estoqueFilters.frente = estoqueFrenteFilter.value || 'all';
                await this.loadEstoqueAndRender();
            });
        }
        if (estoqueProdutoFilter) {
            estoqueProdutoFilter.addEventListener('input', async () => {
                if (this.isLoadingEstoque) return; // Prevent recursive calls
                this.estoqueFilters.produto = (estoqueProdutoFilter.value || '').trim();
                await this.loadEstoqueAndRender();
            });
        }

        // Enter nos filtros
        ['produto-filter', 'fazenda-insumos-filter'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', () => {
                    this.applyInsumosFilters();
                });
            }
        });

        const closeModalBtn = document.querySelector('.close-insumo-modal');
        const cancelBtn = document.getElementById('cancel-insumo');
        const saveBtn = document.getElementById('save-insumo');
        if (closeModalBtn) closeModalBtn.addEventListener('click', () => this.closeInsumoModal());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeInsumoModal());
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveInsumo());
        const insumoForm = document.getElementById('insumo-form');
        if (insumoForm) {
            insumoForm.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const focusables = Array.from(insumoForm.querySelectorAll('input, select, button')).filter(el => !el.disabled && el.tabIndex !== -1);
                    const idx = focusables.indexOf(document.activeElement);
                    const next = focusables[idx + 1];
                    if (next) next.focus(); else { const sb = document.getElementById('save-insumo'); if (sb) sb.click(); }
                }
            });
        }

        const plantioContainer = document.getElementById('plantio-dia');
        if (plantioContainer) {
            plantioContainer.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const focusables = Array.from(plantioContainer.querySelectorAll('input, select, button')).filter(el => !el.disabled && el.tabIndex !== -1);
                const idx = focusables.indexOf(document.activeElement);
                const next = focusables[idx + 1];
                if (next) next.focus();
                else {
                    const addInsumoBtn = document.getElementById('insumo-add-btn');
                    if (addInsumoBtn) addInsumoBtn.click();
                    const saveBtn = document.getElementById('plantio-save-btn');
                    if (saveBtn) saveBtn.click();
                }
            });
        }

        const viagensApplyBtn = document.getElementById('apply-viagens-filters');
        const viagensResetBtn = document.getElementById('reset-viagens-filters');
        
        const toggleViagensFiltersBtn = document.getElementById('btn-toggle-viagens-filters');
        if (toggleViagensFiltersBtn) {
            toggleViagensFiltersBtn.addEventListener('click', () => {
                const container = document.getElementById('viagens-filters-container');
                if (container) {
                    const isHidden = container.style.display === 'none';
                    container.style.display = isHidden ? 'flex' : 'none';
                }
            });
        }

        const viagemSaveBtn = document.getElementById('viagem-save-btn');
        const bagAddBtn = document.getElementById('bag-add-btn');



        if (viagensApplyBtn) viagensApplyBtn.addEventListener('click', () => this.applyViagensFilters());
        if (viagensResetBtn) viagensResetBtn.addEventListener('click', () => this.resetViagensFilters());
        if (viagemSaveBtn) viagemSaveBtn.addEventListener('click', async () => { await this.saveViagemAdubo(); });
        if (bagAddBtn) bagAddBtn.addEventListener('click', () => this.addBagRow());

        const viagemDetailClose = document.getElementById('viagem-detail-close');
        const viagemDetailCancel = document.getElementById('viagem-detail-cancel');
        const viagemDetailPrint = document.getElementById('viagem-detail-print');
        if (viagemDetailClose) viagemDetailClose.addEventListener('click', () => this.closeViagemDetail());
        if (viagemDetailCancel) viagemDetailCancel.addEventListener('click', () => this.closeViagemDetail());
        if (viagemDetailPrint) viagemDetailPrint.addEventListener('click', () => this.printViagemDetail());

        const fazendaInput = document.getElementById('fazenda');
        const codInput = document.getElementById('cod');
        if (fazendaInput) fazendaInput.addEventListener('change', () => this.autofillByFazenda());
        if (codInput) codInput.addEventListener('change', async () => { this.autofillByCod(); await this.autofetchFazendaByCodigoApi('cod'); });

        const viagemCodEl = document.getElementById('viagem-codigo-fazenda');
        const viagemFazEl = document.getElementById('viagem-fazenda');
        
        // Auto-fill logic for Viagem Adubo
        if (viagemFazEl) {
            // Populate select on load or when cadastroFazendas changes
            const populateViagemFazendas = () => {
                viagemFazEl.innerHTML = '<option value="">Selecione a Fazenda</option>';
                if (this.cadastroFazendas && Array.isArray(this.cadastroFazendas)) {
                    const sorted = [...this.cadastroFazendas].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
                    sorted.forEach(f => {
                        const opt = document.createElement('option');
                        opt.value = f.nome;
                        opt.textContent = `${f.codigo} - ${f.nome}`;
                        opt.dataset.codigo = f.codigo;
                        viagemFazEl.appendChild(opt);
                    });
                }
            };
            
            // Initial population attempt
            populateViagemFazendas();
            
            // Re-populate when switching to Adubo tab if needed
            const btnAdubo = document.getElementById('btn-adubo');
            if (btnAdubo) {
                btnAdubo.addEventListener('click', populateViagemFazendas);
            }

            // Sync Code on Change
            viagemFazEl.addEventListener('change', () => {
                const selected = viagemFazEl.options[viagemFazEl.selectedIndex];
                if (selected && selected.dataset.codigo) {
                    // Update code field if exists (assuming simple input for now or select)
                    // If viagem-codigo-fazenda is input:
                    const codInput = document.getElementById('viagem-codigo-fazenda');
                    if (codInput) codInput.value = selected.dataset.codigo;
                }
            });
        }
        
        if (viagemCodEl) viagemCodEl.addEventListener('change', () => this.autofillRowByCod('viagem-fazenda', 'viagem-codigo-fazenda'));

        document.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.btn-edit');
            const deleteBtn = e.target.closest('.btn-delete');
            const delEstoqueBtn = e.target.closest('.btn-delete-estoque');
            const delPlantioBtn = e.target.closest('.btn-delete-plantio');
            const editPlantioBtn = e.target.closest('.btn-edit-plantio');
            const togglePlantioBtn = e.target.closest('.btn-toggle-plantio-details');
            const delBagRowBtn = e.target.closest('.btn-delete-bag-row');
            // const viewViagemBtn = e.target.closest('.btn-view-viagem-adubo'); // Removed to avoid double open
            const delViagemBtn = e.target.closest('.btn-delete-viagem-adubo');
            
            const btnTypeAdubo = e.target.closest('#btn-type-adubo');
            const btnTypeComposto = e.target.closest('#btn-type-composto');

            if (btnTypeAdubo) {
                console.log('Delegated Click: Adubo');
                this.viagemAduboTransportType = 'adubo';
                btnTypeAdubo.classList.add('active', 'btn-primary');
                btnTypeAdubo.classList.remove('btn-secondary');
                const other = document.getElementById('btn-type-composto');
                if (other) {
                    other.classList.remove('active', 'btn-primary');
                    other.classList.add('btn-secondary');
                }
                
                // Switch Views
                const viewAdubo = document.getElementById('view-adubo-mode');
                const viewComposto = document.getElementById('view-composto-mode');
                if (viewAdubo) viewAdubo.style.display = 'block';
                if (viewComposto) viewComposto.style.display = 'none';
                
                this.renderViagensAdubo();
                return;
            }

            if (btnTypeComposto) {
                console.log('Delegated Click: Composto');
                this.viagemAduboTransportType = 'composto';
                btnTypeComposto.classList.add('active', 'btn-primary');
                btnTypeComposto.classList.remove('btn-secondary');
                const other = document.getElementById('btn-type-adubo');
                if (other) {
                    other.classList.remove('active', 'btn-primary');
                    other.classList.add('btn-secondary');
                }
                
                // Switch Views
                const viewAdubo = document.getElementById('view-adubo-mode');
                const viewComposto = document.getElementById('view-composto-mode');
                if (viewAdubo) viewAdubo.style.display = 'none';
                if (viewComposto) viewComposto.style.display = 'block';

                this.loadTransporteComposto();
                return;
            }

            const editOSBtn = e.target.closest('.btn-edit-os');
            const deleteOSBtn = e.target.closest('.btn-delete-os');

            if (editBtn) {
                const id = editBtn.getAttribute('data-id');
                this.startEdit(parseInt(id));
            } else if (deleteBtn) {
                const id = deleteBtn.getAttribute('data-id');
                this.deleteInsumo(parseInt(id));
            } else if (editOSBtn) {
                const numero = editOSBtn.getAttribute('data-numero');
                this.handleEditOS(numero);
            } else if (deleteOSBtn) {
                const numero = deleteOSBtn.getAttribute('data-numero');
                this.handleDeleteOS(numero);
            } else if (delEstoqueBtn) {
                const frente = delEstoqueBtn.getAttribute('data-frente');
                const produto = delEstoqueBtn.getAttribute('data-produto');
                const ok = window.confirm(`Excluir lançamento de estoque de "${produto}" em ${frente}?`);
                if (!ok) return;
                this.api.deleteEstoque(frente, produto).then(async (res) => {
                    if (res && res.success) {
                        this.ui.showNotification('Estoque excluído', 'success', 1500);
                        await this.loadEstoqueAndRender();
                    } else {
                        this.ui.showNotification('Erro ao excluir estoque', 'error');
                    }
                }).catch(()=>this.ui.showNotification('Erro ao excluir estoque', 'error'));
            } else if (delPlantioBtn) {
                const id = delPlantioBtn.getAttribute('data-plantio-id');
                const ok = window.confirm('Excluir registro de plantio diário?');
                if (!ok) return;
                this.api.deletePlantioDia(id).then(async (res) => {
                    if (res && res.success) {
                        this.ui.showNotification('Registro excluído', 'success', 1500);
                        await this.loadPlantioDia();
                    } else {
                        this.ui.showNotification('Erro ao excluir', 'error');
                    }
                }).catch(()=>this.ui.showNotification('Erro ao excluir', 'error'));
            } else if (editPlantioBtn) {
                const id = editPlantioBtn.getAttribute('data-plantio-id');
                this.handleEditPlantio(id);
            } else if (togglePlantioBtn) {
                const id = togglePlantioBtn.getAttribute('data-plantio-id');
                if (this.plantioExpanded.has(id)) this.plantioExpanded.delete(id); else this.plantioExpanded.add(id);
                this.renderPlantioDia();
            } else if (delBagRowBtn) {
                const idx = parseInt(delBagRowBtn.getAttribute('data-idx'));
                if (!isNaN(idx)) {
                    this.viagensAduboBagsDraft.splice(idx, 1);
                    this.renderBagsDraft();
                }
            /* } else if (viewViagemBtn) {
                const id = viewViagemBtn.getAttribute('data-viagem-id');
                this.openViagemDetail(id); */
            } else if (delViagemBtn) {
                const id = delViagemBtn.getAttribute('data-viagem-id');
                const ok = window.confirm('Excluir viagem de adubo?');
                if (!ok) return;
                this.api.deleteViagemAdubo(id).then(async (res) => {
                    if (res && res.success) {
                        this.ui.showNotification('Viagem excluída', 'success', 1500);
                        await this.loadViagensAdubo();
                        await this.loadTransporteComposto();
                    } else {
                        this.ui.showNotification('Erro ao excluir viagem', 'error');
                    }
                }).catch(()=>this.ui.showNotification('Erro ao excluir viagem', 'error'));
            }
        });

        const insumosHead = document.querySelector('#insumos-table thead');
        if (insumosHead) {
            insumosHead.addEventListener('click', (ev) => {
                const th = ev.target.closest('th');
                if (!th) return;
                const ths = Array.from(insumosHead.querySelectorAll('th'));
                const idx = ths.indexOf(th);
                const sortMap = ['os','cod','fazenda','areaTalhao','areaTotalAplicada','produto','doseRecomendada','__doseAplicada','quantidadeAplicada','__difPercent','frente','dataInicio', null];
                const key = sortMap[idx];
                if (!key) return;
                const dir = (this.insumosSort && this.insumosSort.key === key && this.insumosSort.dir === 'asc') ? 'desc' : 'asc';
                this.insumosSort = { key, dir };
                this.sortInsumos();
            });
        }

        const insumoAddBtn = document.getElementById('btn-add-insumo-row');
        if (insumoAddBtn) insumoAddBtn.addEventListener('click', (e) => { 
            e.preventDefault();
            this.addInsumoRow(); 
        });

        // Listener delegado para botão de excluir insumo
        const tbodyInsumos = document.getElementById('insumos-plantio-tbody');
        if (tbodyInsumos) {
            tbodyInsumos.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-delete-insumo-row')) {
                    e.preventDefault();
                    const idx = parseInt(e.target.dataset.idx);
                    this.removeInsumoRow(idx);
                }
            });
        }

        const insumoProdutoSel = document.getElementById('insumo-produto');
        if (insumoProdutoSel) insumoProdutoSel.addEventListener('change', async () => {
            const prod = insumoProdutoSel.value;
            const unidInput = document.getElementById('insumo-unid');
            const map = this.getInsumoUnits();
            if (unidInput) unidInput.value = map[prod] || '';

            // Auto-fill dose prevista from OS
            if (prod) {
                const frenteKey = document.getElementById('single-frente')?.value || '';
                const osKey = document.getElementById('single-os')?.value || '';
                const dosePrevInput = document.getElementById('insumo-dose-prevista');
                
                if (dosePrevInput) {
                    try {
                        dosePrevInput.value = '';
                        let osData = null;

                        // 1. Tentar pegar da OS selecionada
                        if (osKey && this.osListCache) {
                             const os = this.osListCache.find(o => String(o.numero).trim() === String(osKey).trim());
                             if (os) osData = os;
                        }

                        // 2. Se não achou, buscar via API pela Frente
                        if (!osData && frenteKey) {
                            const osRes = await this.api.getOSByFrente(frenteKey);
                            if (osRes && osRes.success && osRes.data) {
                                osData = osRes.data;
                            }
                        }

                        if (osData && Array.isArray(osData.produtos)) {
                            console.log('Buscando dose para:', prod, 'na OS:', osData.numero, 'Produtos:', osData.produtos);
                            // Normalizar produto da OS e do Select para garantir match
                            const osProduto = osData.produtos.find(p => p.produto.trim().toUpperCase() === prod.trim().toUpperCase());
                            if (osProduto) {
                                console.log('Produto encontrado:', osProduto);
                                // Tenta doseRecomendada, doseRec, dose, ou quantidade (para compatibilidade)
                                dosePrevInput.value = osProduto.doseRecomendada || osProduto.doseRec || osProduto.dose || osProduto.quantidade || '';
                            } else {
                                console.warn('Produto não encontrado na OS:', prod);
                            }
                        }
                    } catch (e) {
                        console.error('Erro ao buscar dados da OS para auto-preenchimento:', e);
                    }
                }
            }
        });
        const plantioSaveBtn = document.getElementById('plantio-save-btn');
        if (plantioSaveBtn) plantioSaveBtn.addEventListener('click', async () => { await this.savePlantioDia(false); });

        const singlePlantioDia = document.getElementById('single-plantio-dia');
        const mudaConsumoDia = document.getElementById('muda-consumo-dia');
        const cobricaoDia = document.getElementById('cobricao-dia');
        
        // TCH Calculation
        const colheitaHectares = document.getElementById('colheita-hectares');
        const colheitaTchReal = document.getElementById('colheita-tch-real');
        const colheitaTonTotais = document.getElementById('colheita-toneladas-totais');

        const updateTchTotal = () => {
            if (colheitaHectares && colheitaTchReal && colheitaTonTotais) {
                const ha = parseFloat(colheitaHectares.value) || 0;
                const tch = parseFloat(colheitaTchReal.value) || 0;
                const total = ha * tch;
                colheitaTonTotais.value = total.toFixed(2);
            }
        };

        if (colheitaHectares) colheitaHectares.addEventListener('input', updateTchTotal);
        if (colheitaTchReal) colheitaTchReal.addEventListener('input', updateTchTotal);
        if (singlePlantioDia) singlePlantioDia.addEventListener('input', () => {
            this.updateAccumulatedStats();
            this.renderInsumosDraft();
        });
        if (mudaConsumoDia) mudaConsumoDia.addEventListener('input', () => {
            this.updateAccumulatedStats();
        });
        if (cobricaoDia) cobricaoDia.addEventListener('input', () => {
            this.updateAccumulatedStats();
        });

        const toletesTotal = document.getElementById('qual-toletes-total');
        const toletesBons = document.getElementById('qual-toletes-bons');
        const toletesRuins = document.getElementById('qual-toletes-ruins');
        const toletesAmostra = document.getElementById('qual-toletes-amostra');
        const bindToletes = () => this.updateToletesPercent();
        if (toletesTotal) toletesTotal.addEventListener('input', bindToletes);
        if (toletesBons) toletesBons.addEventListener('input', bindToletes);
        if (toletesRuins) toletesRuins.addEventListener('input', bindToletes);
        if (toletesAmostra) toletesAmostra.addEventListener('input', bindToletes);

        const gemasTotal = document.getElementById('qual-gemas-total');
        const gemasBoas = document.getElementById('qual-gemas-boas');
        const gemasRuins = document.getElementById('qual-gemas-ruins');
        const gemasAmostra = document.getElementById('qual-gemas-amostra');
        const bindGemas = (e) => this.updateGemasPercent(e?.target);
        if (gemasTotal) gemasTotal.addEventListener('input', bindGemas);
        if (gemasBoas) gemasBoas.addEventListener('input', bindGemas);
        if (gemasRuins) gemasRuins.addEventListener('input', bindGemas);
        if (gemasAmostra) gemasAmostra.addEventListener('input', bindGemas);

        const mudasTotal = document.getElementById('qual-mudas-total');
        const mudasBoas = document.getElementById('qual-mudas-boas');
        const mudasRuins = document.getElementById('qual-mudas-ruins');
        const mudasAmostra = document.getElementById('qual-mudas-amostra');
        
        // Reboulos Listeners
        const mudasReboulosTotal = document.getElementById('qual-mudas-reboulos');
        const mudasReboulosBons = document.getElementById('qual-mudas-reboulos-bons');
        const mudasReboulosRuins = document.getElementById('qual-mudas-reboulos-ruins');

        const bindMudas = (e) => this.updateMudasPercent(e?.target);
        if (mudasTotal) mudasTotal.addEventListener('input', bindMudas);
        if (mudasBoas) mudasBoas.addEventListener('input', bindMudas);
        if (mudasRuins) mudasRuins.addEventListener('input', bindMudas);
        if (mudasAmostra) mudasAmostra.addEventListener('input', bindMudas);
        
        if (mudasReboulosTotal) mudasReboulosTotal.addEventListener('input', bindMudas);
        if (mudasReboulosBons) mudasReboulosBons.addEventListener('input', bindMudas);
        if (mudasReboulosRuins) mudasReboulosRuins.addEventListener('input', bindMudas);

        const singleFrente = document.getElementById('single-frente');
        const singleOs = document.getElementById('single-os');

        // Plantio Tabs Listeners
        const plantioTabs = document.querySelectorAll('.plantio-tab-btn');
        plantioTabs.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update UI
                plantioTabs.forEach(b => {
                    b.classList.remove('active');
                    b.style.color = '#666';
                    b.style.borderBottomColor = 'transparent';
                });
                btn.classList.add('active');
                btn.style.color = 'var(--text-color)';
                btn.style.borderBottomColor = 'var(--primary)'; // Or specific color
                
                // Update State and Render
                this.plantioTab = btn.getAttribute('data-tab');
                this.renderPlantioDia();
            });
        });
        
        // Initialize default tab style
        const activeTab = document.querySelector('.plantio-tab-btn.active');
        if (activeTab) {
            activeTab.style.color = 'var(--text-color)';
            activeTab.style.borderBottomColor = 'var(--primary)';
        }

        // Validation listeners para feedback visual (O.S agora é obrigatória)
        const requiredIds = ['single-os', 'plantio-data', 'single-plantio-dia'];
        requiredIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const validate = () => {
                    const msgEl = document.getElementById('msg-' + id);
                    if (!el.value) {
                        el.classList.add('input-error');
                        if (msgEl) msgEl.style.display = 'block';
                    } else {
                        el.classList.remove('input-error');
                        if (msgEl) msgEl.style.display = 'none';
                    }
                };
                el.addEventListener('blur', validate);
                el.addEventListener('input', validate);
            }
        });

        // Preencher lista de O.S diretamente do cache e usar O.S como campo principal
        if (singleOs && this.osListCache && Array.isArray(this.osListCache)) {
            singleOs.innerHTML = '<option value=\"\">Selecione a O.S</option>';
            this.osListCache.forEach(os => {
                const opt = document.createElement('option');
                opt.value = os.numero;
                opt.textContent = `${os.numero} - ${os.fazenda || 'Sem Fazenda'} (${os.frente || ''})`;
                singleOs.appendChild(opt);
            });
        }

        if (singleOs) {
            singleOs.addEventListener('change', async () => {
                const val = singleOs.value;
                if (!val || !this.osListCache) return;
                
                // Busca robusta
                const os = this.osListCache.find(o => String(o.numero).trim() === String(val).trim());
                if (os) {
                    console.log('OS Selecionada:', os);

                    // Preencher Responsável
                    const respEl = document.getElementById('plantio-responsavel');
                    if (respEl && os.respAplicacao) respEl.value = os.respAplicacao;
                    
                    // Preencher Área Total da OS
                    const areaEl = document.getElementById('single-area-total'); // Corrigido para area-total ou single-area?
                    // No form temos 'single-area' (área do talhão/frente) e 'single-area-total' (área total da fazenda/os).
                    // Vamos preencher 'single-area' como sugestão inicial da área da OS, mas o usuário pode mudar.
                    // E 'single-area-total' geralmente vem do cadastro da fazenda.
                    
                    if (os.areaTotal) {
                         const areaEl = document.getElementById('single-area');
                         if (areaEl) areaEl.value = os.areaTotal;
                    }

                    // Referências aos campos
                    const fazendaEl = document.getElementById('single-fazenda');
                    const codInput = document.getElementById('single-cod');
                    const regiaoEl = document.getElementById('single-regiao');

                    // 1. Tentar preencher Região (Setor da OS) - Prioridade inicial
                    if (regiaoEl && os.setor) {
                        regiaoEl.value = os.setor;
                    }

                    // 2. Tentar preencher Fazenda e Código
                    if (os.fazenda) {
                        const targetFazenda = os.fazenda.trim();
                        
                        // Tentar encontrar no cadastro (por nome ou código extraído)
                        let fazendaObj = this.findFazendaByName(targetFazenda);
                        
                        if (!fazendaObj) {
                             // Se não achou pelo nome, tenta extrair código e buscar pelo código
                             const matchCod = targetFazenda.match(/^(\d+)[\s\W]+(.+)$/);
                             if (matchCod) {
                                 const codExt = parseInt(matchCod[1]);
                                 fazendaObj = this.cadastroFazendas.find(f => parseInt(f.codigo) === codExt);
                             }
                        }

                        if (fazendaObj) {
                            // Se achou no cadastro, aplica os dados completos (incluindo acumulados)
                            this.applyCadastroFazendaToPlantio(fazendaObj);
                            
                            // IMPORTANTE: Restaurar a Região/Setor da OS se ela existir
                            if (regiaoEl && os.setor) {
                                regiaoEl.value = os.setor;
                            }
                        } else {
                            // Fallback: Cadastro não encontrado, preencher manualmente o possível
                            console.warn('Fazenda da OS não encontrada no cadastro:', targetFazenda);
                            
                            // Tentar extrair código do nome da fazenda na OS
                            const matchCod = targetFazenda.match(/^(\d+)[\s\W]+(.+)$/);
                            if (matchCod && codInput) {
                                codInput.value = matchCod[1];
                            }

                            // Tentar selecionar no dropdown de fazendas
                            if (fazendaEl) {
                                let foundInSelect = false;
                                const targetLower = targetFazenda.toLowerCase();
                                
                                for (let i = 0; i < fazendaEl.options.length; i++) {
                                    const optText = fazendaEl.options[i].text.trim().toLowerCase();
                                    const optVal = fazendaEl.options[i].value.trim().toLowerCase();
                                    
                                    // Match exato
                                    if (optText === targetLower || optVal === targetLower) {
                                        fazendaEl.selectedIndex = i;
                                        foundInSelect = true;
                                        break;
                                    }
                                    
                                    // Match parcial se tiver código na OS
                                    if (matchCod) {
                                        const nomeSemCod = matchCod[2].trim().toLowerCase();
                                        if (optText.includes(nomeSemCod) || optVal.includes(nomeSemCod)) {
                                            fazendaEl.selectedIndex = i;
                                            foundInSelect = true;
                                            break;
                                        }
                                    }
                                }
                                
                                if (foundInSelect) fazendaEl.dispatchEvent(new Event('change'));
                            }
                        }
                    }
                    
                    // Preencher Frente automaticamente a partir da OS
                    const frenteEl = document.getElementById('single-frente');
                    if (frenteEl && os.frente) {
                        frenteEl.innerHTML = '';
                        const opt = document.createElement('option');
                        opt.value = os.frente;
                        opt.textContent = os.frente;
                        frenteEl.appendChild(opt);
                        frenteEl.value = os.frente;
                    }

                    this.ui.showNotification('Dados da OS preenchidos.', 'info', 1500);
                    
                    // Atualizar lista de produtos com base na OS selecionada e Fazenda preenchida
                    await this.loadProdutosDatalist();
                } else {
                    console.error('OS selecionada não encontrada no cache:', val);
                }
            });
        }

        const singleCod = document.getElementById('single-cod');
        const singleFazenda = document.getElementById('single-fazenda');
        if (singleFazenda) singleFazenda.addEventListener('change', () => {
            if (this.cadastroFazendas && this.cadastroFazendas.length) {
                const nome = singleFazenda.value;
                const item = this.findFazendaByName(nome);
                if (item) {
                    this.applyCadastroFazendaToPlantio(item);
                    
                    // Forçar recarregamento das estatísticas atuais da API para evitar cache antigo
                    if (item.codigo) {
                        this.api.getFazendaByCodigo(item.codigo).then(res => {
                             if (res && res.success && res.data) {
                                 this.tempFazendaStats = {
                                     plantioAcumulado: res.data.plantio_acumulado || 0,
                                     mudaAcumulada: res.data.muda_acumulada || 0,
                                     cobricaoAcumulada: res.data.cobricao_acumulada || 0
                                 };
                                 this.updateAccumulatedStats();
                             }
                        });
                    }
                    return;
                }
            }
            this.autofillRowByFazenda('single-fazenda', 'single-cod');
        });
        if (singleCod) singleCod.addEventListener('change', async () => { 
            if (this.cadastroFazendas && this.cadastroFazendas.length) {
                const codigo = singleCod.value;
                const item = this.cadastroFazendas.find(f => String(f.codigo) === String(codigo));
                if (item) {
                    this.applyCadastroFazendaToPlantio(item);
                }
            } else {
                this.autofillRowByCod('single-fazenda', 'single-cod'); 
            }
            
            // Forçar recarregamento das estatísticas atuais da API para evitar cache antigo
            if (singleCod.value) {
                this.api.getFazendaByCodigo(singleCod.value).then(res => {
                     if (res && res.success && res.data) {
                         this.tempFazendaStats = {
                             plantioAcumulado: res.data.plantio_acumulado || 0,
                             mudaAcumulada: res.data.muda_acumulada || 0,
                             cobricaoAcumulada: res.data.cobricao_acumulada || 0
                         };
                         this.updateAccumulatedStats();
                     }
                });
            }
        });
        
        const loginBtn = document.getElementById('login-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const regToggle = document.getElementById('login-register-toggle');
        const regBtn = document.getElementById('register-btn');
        if (loginBtn) loginBtn.addEventListener('click', () => this.handleLogin());
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.handleLogout());
        if (regToggle) {
            regToggle.addEventListener('click', () => {
                const registerArea = document.getElementById('register-area');
                const loginGrid = document.querySelector('#login-screen .form-grid.boletim-grid');
                const loginButton = document.getElementById('login-btn');
                const isRegisterVisible = registerArea && registerArea.style.display === 'block';
                if (!isRegisterVisible) {
                    if (registerArea) registerArea.style.display = 'block';
                    if (loginGrid) loginGrid.style.display = 'none';
                    if (loginButton) loginButton.style.display = 'none';
                    regToggle.textContent = 'Já tenho conta';
                } else {
                    if (registerArea) registerArea.style.display = 'none';
                    if (loginGrid) loginGrid.style.display = 'grid';
                    if (loginButton) loginButton.style.display = 'inline-block';
                    regToggle.textContent = 'Cadastrar';
                }
            });
        }
        if (regBtn) regBtn.addEventListener('click', () => this.handleRegister());
        await this.handleCadastroActions();
        const updateProfileBtn = document.getElementById('update-profile-btn');
        if (updateProfileBtn) updateProfileBtn.addEventListener('click', () => this.handleUpdateProfile());
        const plantioFazenda = document.getElementById('plantio-fazenda');
        const plantioCod = document.getElementById('plantio-cod');
        if (plantioFazenda) plantioFazenda.addEventListener('change', () => this.autofillPlantioByFazenda());
        if (plantioCod) plantioCod.addEventListener('change', async () => { this.autofillPlantioByCod(); await this.autofetchFazendaByCodigoApi('plantio-cod'); });
        // GPS removido dos detalhes/relatório a pedido do usuário
        
    }

    autofillCadastroFieldsByCod(codInputId) {
        const codEl = document.getElementById(codInputId);
        const cod = codEl && codEl.value ? parseInt(codEl.value) : null;
        this.autofillCadastroFields(cod);
    }

    sortInsumos() {
        if (!this.insumosSort) { this.renderInsumos(); return; }
        const { key, dir } = this.insumosSort;
        const data = [...this.insumosFazendasData];
        const val = (i, k) => {
            if (k === '__doseAplicada') {
                const a = i.areaTotalAplicada || 0;
                const q = i.quantidadeAplicada || 0;
                return (i.doseAplicada != null && i.doseAplicada > 0) ? i.doseAplicada : (a > 0 && q != null ? (q / a) : 0);
            }
            if (k === '__difPercent') {
                const dr = i.doseRecomendada || 0;
                const da = (i.doseAplicada != null && i.doseAplicada > 0) ? i.doseAplicada : ((i.areaTotalAplicada>0 && i.quantidadeAplicada!=null) ? (i.quantidadeAplicada/i.areaTotalAplicada) : 0);
                return (dr > 0 && da > 0) ? ((da / dr - 1) * 100) : 0;
            }
            return i[k];
        };
        data.sort((a,b) => {
            const va = val(a, key);
            const vb = val(b, key);
            const na = (typeof va === 'string') ? parseFloat(String(va).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) : va;
            const nb = (typeof vb === 'string') ? parseFloat(String(vb).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) : vb;
            if (!isNaN(na) && !isNaN(nb)) return dir === 'asc' ? na - nb : nb - na;
            const sa = String(va ?? '').toLowerCase();
            const sb = String(vb ?? '').toLowerCase();
            return dir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
        });
        this.insumosFazendasData = data;
        this.renderInsumos();
    }

    autofillByFazenda() {
        const fazendaEl = document.getElementById('fazenda');
        const osEl = document.getElementById('os');
        const codEl = document.getElementById('cod');
        const fazenda = fazendaEl ? fazendaEl.value : '';
        let info = this.fazendaIndex.byName[fazenda];
        if (!info && this.fazendaIndex && this.fazendaIndex.cadastroByCod) {
            const match = Object.entries(this.fazendaIndex.cadastroByCod).find(([,v]) => (v.nome||'').toLowerCase() === fazenda.toLowerCase());
            if (match) info = { cod: parseInt(match[0]) };
        }
        if (info) {
            if (osEl && info.os != null) osEl.value = info.os;
            if (codEl && info.cod != null) codEl.value = info.cod;
            this.ui.showNotification('Dados da fazenda preenchidos automaticamente.', 'info', 1500);
        }
    }

    autofillByCod() {
        const codEl = document.getElementById('cod');
        const fazendaEl = document.getElementById('fazenda');
        const code = codEl && codEl.value ? parseInt(codEl.value) : null;
        const info = code != null ? (this.fazendaIndex.byCod[code] || (this.fazendaIndex.cadastroByCod||{})[code]) : null;
        if (info && fazendaEl) {
            fazendaEl.value = info.fazenda ?? info.nome ?? '';
            this.ui.showNotification('Dados preenchidos a partir do cadastro.', 'info', 1500);
        }
    }

    autofillPlantioByFazenda() {
        const fazendaEl = document.getElementById('plantio-fazenda');
        const codEl = document.getElementById('plantio-cod');
        const info = fazendaEl ? this.fazendaIndex.byName[fazendaEl.value] : null;
        if (info && codEl) codEl.value = info.cod ?? '';
    }

    autofillPlantioByCod() {
        const codEl = document.getElementById('plantio-cod');
        const fazendaEl = document.getElementById('plantio-fazenda');
        const code = codEl && codEl.value ? parseInt(codEl.value) : null;
        const info = code != null ? (this.fazendaIndex.byCod[code] || (this.fazendaIndex.cadastroByCod||{})[code]) : null;
        if (info && fazendaEl) fazendaEl.value = info.fazenda ?? info.nome ?? '';
    }

    async loadStaticData() {
        try {
            await this.ensureApiReady();
            if (!this.api) throw new Error('API não inicializada');

            // Carregar lista de OS (para dropdowns e modal)
            await this.loadOSList();

            let fazendasList = [];
            try {
                const fazendasResponse = await this.api.getFazendas();
                if (fazendasResponse.success) {
                    fazendasList = Array.isArray(fazendasResponse.data) ? fazendasResponse.data : [];
                    
                    // Popula dropdowns
                    const nomes = fazendasList.map(f => (typeof f === 'string') ? f : (f.nome || f.codigo)).filter(Boolean);
                    this.ui.populateSelect(
                        document.getElementById('fazenda-insumos-filter'),
                        nomes,
                        'Todas as Fazendas'
                    );
                    const viagemFazSelect = document.getElementById('viagem-fazenda');
                    if (viagemFazSelect) {
                        viagemFazSelect.innerHTML = '<option value="">Selecione a Fazenda</option>';
                        nomes.forEach(n => {
                            const opt = document.createElement('option');
                            opt.value = n;
                            opt.textContent = n;
                            viagemFazSelect.appendChild(opt);
                        });
                    }
                    const viagensFazendaFilter = document.getElementById('viagens-fazenda-filter');
                    if (viagensFazendaFilter) {
                        viagensFazendaFilter.innerHTML = '<option value="">Todas as Fazendas</option>';
                        nomes.forEach(n => {
                            const opt = document.createElement('option');
                            opt.value = n;
                            opt.textContent = n;
                            viagensFazendaFilter.appendChild(opt);
                        });
                    }
                    const singleFazendaSelect = document.getElementById('single-fazenda');
                    if (singleFazendaSelect) {
                        singleFazendaSelect.innerHTML = '<option value="">Selecione a Fazenda</option>';
                        nomes.forEach(n => {
                            const opt = document.createElement('option');
                            opt.value = n;
                            opt.textContent = n;
                            singleFazendaSelect.appendChild(opt);
                        });
                    }
                    
                    // Popula cadastro interno e índice
                    const listForIndex = fazendasList.map(f => ({
                        cod: f.codigo,
                        nome: f.nome,
                        areaTotal: f.area_total,
                        plantioAcumulado: f.plantio_acumulado,
                        mudaAcumulada: f.muda_acumulada,
                        regiao: f.regiao
                    }));
                    this.buildCadastroIndex(listForIndex);
                    this.renderCadastroFazendas(fazendasList);
                }
            } catch(e) {
                console.error('Erro ao carregar fazendas:', e);
            }

            try {
                const produtosResponse = await this.api.getProdutos();
                if (produtosResponse.success) {
                    this.ui.populateSelect(
                        document.getElementById('produto-filter'),
                        produtosResponse.data,
                        'Todos os Produtos'
                    );
                }
            } catch(e) {}

        } catch (error) {
            console.error('Error loading static data:', error);
        }
    }

    async loadInitialData() {
        await this.loadInsumosData();
        // Carregar lista de OS para popular dropdowns de Frente/OS no Plantio
        await this.loadOSList();
    }

    async loadTabData(tabName) {
        // Verificar permissões antes de carregar
        const userPerms = (this.api && this.api.user && this.api.user.permissions) ? this.api.user.permissions : {};
        const role = (this.api && this.api.user && this.api.user.role) ? this.api.user.role : 'user';
        const canSeeAll = role === 'admin' || userPerms.all === true;
        
        // Se não for admin e não tiver permissão específica, não carrega
        if (!canSeeAll && !userPerms[tabName]) {
            console.warn(`Acesso negado à aba: ${tabName}`);
            this.ui.showNotification('Acesso não autorizado', 'error');
            return;
        }

        if (tabName === 'insumos-fazendas') {
            await this.loadInsumosData();
        } else if (tabName === 'graficos') {
            // Carregamento automático com circuit breaker (implementado em loadDashboard)
            await this.loadDashboard();
        } else if (tabName === 'estoque') {
            await this.loadEstoqueAndRender(true);
        } else if (tabName === 'plantio-dia') {
            await this.loadPlantioDia();
        } else if (tabName === 'viagens-adubo') {
            await this.loadViagensAdubo();
        }
    }

    async loadPlantioDia() {
        try {
            const res = await this.api.getPlantioDia();
            if (res && res.success) {
                this.plantioDia = res.data || [];
                
                // Sincronizar dados para o dashboard e KPIs imediatamente
                this.plantioDiarioData = this.plantioDia.map(p => {
                    if (typeof p.frentes === 'string') {
                        try { p.frentes = JSON.parse(p.frentes); } catch(e) { console.error('Erro ao parsear frentes:', e); }
                    }
                    if (typeof p.insumos === 'string') {
                        try { p.insumos = JSON.parse(p.insumos); } catch(e) { console.error('Erro ao parsear insumos:', e); }
                    }
                    if (typeof p.qualidade === 'string') {
                        try { p.qualidade = JSON.parse(p.qualidade); } catch(e) { console.error('Erro ao parsear qualidade:', e); }
                    }
                    return p;
                });
                
                this.renderPlantioDia();
                // Forçar recálculo dos KPIs para atualização imediata dos cards
                this.calculateKPIs();
            }
        } catch(e) { console.error('Erro ao carregar plantio:', e); }
    }

    renderPlantioDia() {
        const tbody = document.getElementById('plantio-table-body');
        const thead = document.getElementById('plantio-table-head');
        if (!tbody) return;
        
        // Determine active tab filter
        const currentTab = this.plantioTab || 'plantio';
        
        // Update Headers based on tab
        if (thead) {
            if (currentTab === 'qualidade_muda') {
                thead.innerHTML = `
                    <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Fazenda / Frente</th>
                        <th>Frota / Hora</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                `;
            } else if (currentTab === 'colheita_muda') {
                thead.innerHTML = `
                    <tr>
                        <th>Data</th>
                        <th>Frentes</th>
                        <th>Hectares Colhidos</th>
                        <th>TCH</th>
                        <th>Toneladas Totais</th>
                        <th>Ações</th>
                    </tr>
                `;
            } else {
                thead.innerHTML = `
                    <tr>
                        <th>Data</th>
                        <th>Frentes</th>
                        <th>Área Total (ha)</th>
                        <th>Plantio Dia (ha)</th>
                        <th>Cobrição (ha)</th>
                        <th>Ações</th>
                    </tr>
                `;
            }
        }
        
        const allRows = (this.plantioDia || []).slice().sort((a,b)=> String(b.data||'').localeCompare(String(a.data||''))); // Descending date
        
        // Filter rows based on tab
        const rows = allRows.filter(r => {
            const q = r.qualidade || {};
            const tipo = r.tipo_operacao || q.tipoOperacao || 'plantio';
            
            if (currentTab === 'plantio') {
                return tipo === 'plantio';
            } else if (currentTab === 'colheita_muda') {
                return tipo === 'colheita_muda';
            } else if (currentTab === 'qualidade_muda') {
                // Show ONLY records explicitly marked as quality
                return tipo === 'qualidade_muda';
            }
            return false;
        });
        
        if (rows.length === 0) {
            let label = 'Plantio';
            if (currentTab === 'colheita_muda') label = 'Colheita de Muda';
            if (currentTab === 'qualidade_muda') label = 'Qualidade de Muda';
            
            const colSpan = currentTab === 'qualidade_muda' ? 6 : 4;

            tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align: center; padding: 20px; color: var(--text-light);">Nenhum registro de ${label} encontrado.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(r => {
            if (currentTab === 'qualidade_muda') {
                // Quality Render Logic
                const frentes = (r.frentes||[]);
                const fazendaFrente = frentes.length > 0 ? `${frentes[0].fazenda || ''} / ${frentes[0].frente || ''}` : '—';
                
                const q = r.qualidade || {};

                // Frota / Turno
                const trator = q.qualEquipamentoTrator || '';
                const plantadora = q.qualEquipamentoPlantadora || '';
                const frota = (trator || plantadora) ? `${trator}${plantadora ? ' / ' + plantadora : ''}` : '—';
                
                // Tenta pegar o turno ou a hora (fallback)
                let turnoOuHora = '—';
                if (r.turno) {
                    turnoOuHora = `Turno ${r.turno}`;
                } else if (q.horaRegistro) {
                    turnoOuHora = q.horaRegistro;
                } else if (r.created_at) {
                    try {
                        const dateObj = new Date(r.created_at);
                        turnoOuHora = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    } catch (e) {}
                }
                const frotaHora = `<div>${frota}</div><div style="font-size: 0.8em; color: #888;">${turnoOuHora}</div>`;

                // Status
                // Prefer gemasBoasPct or calculate it
                let pct = null;
                if (q.tipoOperacao === 'plantio_cana' && typeof q.totalToletesBons === 'number') {
                    pct = q.totalToletesBons;
                } else {
                    pct = (q.gemasBoasPct != null) ? parseFloat(q.gemasBoasPct) : 
                           (q.gemasViaveisPerc != null) ? parseFloat(q.gemasViaveisPerc) :
                           (typeof q.totalToletesBons === 'number' && q.gemasTotal > 0) ? (q.totalToletesBons / q.gemasTotal * 100) : null;
                }
                
                let statusBadge = '<span class="badge badge-secondary">—</span>';
                if (pct !== null) {
                    let colorClass = 'badge-danger'; // Ruim
                    let label = 'Ruim';
                    if (pct >= 90) { colorClass = 'badge-success'; label = 'Ótimo'; }
                    else if (pct >= 80) { colorClass = 'badge-info'; label = 'Bom'; }
                    else if (pct >= 70) { colorClass = 'badge-warning'; label = 'Regular'; }
                    
                    statusBadge = `<span class="badge ${colorClass}" title="${this.ui.formatNumber(pct, 1)}% Viáveis">${label}</span>`;
                }

                // Determine Type Label
                const tipoRaw = r.tipo_operacao || q.tipoOperacao || 'plantio';
                let tipoLabel = 'Plantio';
                let badgeClass = 'badge-info'; // Blue
                
                if (tipoRaw === 'colheita_muda' || (tipoRaw === 'qualidade_muda' && q.tipoOperacao === 'colheita_muda')) {
                    tipoLabel = 'Colheita';
                    badgeClass = 'badge-warning'; // Yellow/Orange
                }

                return `
                <tr>
                    <td>${this.ui.formatDateBR(r.data)}</td>
                    <td><span class="badge ${badgeClass}">${tipoLabel}</span></td>
                    <td>${fazendaFrente}</td>
                    <td>${frotaHora}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div style="display: flex; gap: 5px;">
                            <button class="btn btn-sm btn-secondary" onclick="window.insumosApp.showPlantioDetails('${r.id}')">
                                📋 Detalhes
                            </button>
                            <button class="btn btn-sm btn-secondary btn-edit-plantio" data-plantio-id="${r.id}" title="Editar Registro">
                                ✏️
                            </button>
                            <button class="btn btn-sm btn-delete-plantio" data-plantio-id="${r.id}" style="background-color: #e74c3c; color: white;" title="Excluir Registro">
                                🗑️
                            </button>
                        </div>
                    </td>
                </tr>`;
            } else if (currentTab === 'colheita_muda') {
                const resumoFrentes = (r.frentes||[]).map(f => `${f.frente}: ${f.fazenda||'—'}${f.regiao?(' / '+f.regiao):''}`).join(' | ');
                const q = r.qualidade || {};
                const qtdColhida = this.ui.formatNumber(r.colheita_hectares || q.colheitaHectares || 0, 2);
                const tch = this.ui.formatNumber(r.colheita_tch_real || 0, 2);
                const tonTotais = this.ui.formatNumber(r.colheita_toneladas_totais || 0, 2);
                
                return `
                <tr>
                    <td>${this.ui.formatDateBR(r.data)}</td>
                    <td>${resumoFrentes}</td>
                    <td>${qtdColhida} ha</td>
                    <td>${tch}</td>
                    <td>${tonTotais} t</td>
                    <td>
                        <div style="display: flex; gap: 5px;">
                            <button class="btn btn-sm btn-secondary" onclick="window.insumosApp.showPlantioDetails('${r.id}')">
                                📋 Detalhes
                            </button>
                            <button class="btn btn-sm btn-secondary btn-edit-plantio" data-plantio-id="${r.id}" title="Editar Registro">
                                ✏️
                            </button>
                            <button class="btn btn-sm btn-delete-plantio" data-plantio-id="${r.id}" style="background-color: #e74c3c; color: white;" title="Excluir Registro">
                                🗑️
                            </button>
                        </div>
                    </td>
                </tr>`;
            } else {
                const sumArea = (r.frentes||[]).reduce((s,x)=> s + (Number(x.area)||0), 0);
                const sumPlantioDia = (r.frentes||[]).reduce((s,x)=> s + (Number(x.plantioDiario || x.plantada)||0), 0);
                // Cobrição is usually in 'qualidade' object or root 'cobricao_dia'/'cobricao_acumulada'
                const q = r.qualidade || {};
                const cobricao = this.ui.formatNumber(q.cobricaoDia || r.cobricaoDia || 0, 2);
                
                const resumoFrentes = (r.frentes||[]).map(f => `${f.frente}: ${f.fazenda||'—'}${f.regiao?(' / '+f.regiao):''}`).join(' | ');
                
                return `
                <tr>
                    <td>${this.ui.formatDateBR(r.data)}</td>
                    <td>${resumoFrentes || '—'}</td>
                    <td>${this.ui.formatNumber(sumArea)}</td>
                    <td>${this.ui.formatNumber(sumPlantioDia)}</td>
                    <td>${cobricao}</td>
                    
                    <td>
                        <div style="display: flex; gap: 5px;">
                            <button class="btn btn-sm btn-secondary" onclick="window.insumosApp.showPlantioDetails('${r.id}')">
                                📋 Detalhes
                            </button>
                            <button class="btn btn-sm btn-secondary btn-edit-plantio" data-plantio-id="${r.id}" title="Editar Registro">
                                ✏️
                            </button>
                            <button class="btn btn-sm btn-delete-plantio" data-plantio-id="${r.id}" style="background-color: #e74c3c; color: white;" title="Excluir Registro">
                                🗑️
                            </button>
                        </div>
                    </td>
                </tr>`;
            }
        }).join('');
    }

    async renderQualidadeList() {
        console.log('Rendering Qualidade List...');
        const tbody = document.getElementById('qualidade-list-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="5" class="loading">Carregando...</td></tr>';

        // Fetch all quality records (or recent ones)
        const res = await this.api.getQualidadeRecords(null, null);
        let allRows = [];
        
        if (res.success && res.data) {
            allRows = res.data;
        } else {
            // Fallback to local if API fails or returns nothing (though API should return)
            allRows = (this.plantioDia || []);
        }

        const rows = allRows.slice().sort((a,b)=> String(b.data||'').localeCompare(String(a.data||''))); // Descending date
        
        // Filter for Quality records (getQualidadeRecords already filters by type, but double check if using local fallback)
        const filteredRows = rows.filter(r => {
            const q = r.qualidade || {};
            const tipo = r.tipo_operacao || q.tipoOperacao || 'plantio';
            const hasQualityData = (q.gemasTotal > 0 || q.mudasTotal > 0 || q.mudaTonHa > 0 || q.mudasReboulos > 0);
            if (tipo === 'plantio_cana') return true;
            return tipo === 'qualidade_muda' || (hasQualityData && tipo !== 'colheita_muda');
        });

        console.log(`Found ${filteredRows.length} quality records.`);

        if (filteredRows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-light);">Nenhum registro de Qualidade encontrado.</td></tr>`;
            return;
        }

        tbody.innerHTML = filteredRows.map(r => {
            const frentes = (r.frentes||[]);
            const fazendaFrente = frentes.length > 0 ? `${frentes[0].fazenda || ''} / ${frentes[0].frente || ''}` : '—';
            
            // Try to find variety
            const variedade = (r.qualidade && r.qualidade.mudaVariedade) 
                ? r.qualidade.mudaVariedade 
                : (frentes.length > 0 && frentes[0].variedade ? frentes[0].variedade : '—');
            
            const q = r.qualidade || {};
            const tipo = r.tipo_operacao || q.tipoOperacao || 'plantio';
            let indicador;
            if (tipo === 'plantio_cana') {
                indicador = (q.mediaKgHa != null)
                    ? `${this.ui.formatNumber(q.mediaKgHa, 2)} kg/ha`
                    : '—';
            } else {
                const gemasViaveis = (q.gemasBoasPct != null) ? `${this.ui.formatNumber(q.gemasBoasPct, 1)}%` : 
                                   (q.gemasViaveisPerc ? `${this.ui.formatNumber(q.gemasViaveisPerc, 1)}%` : '—');
                indicador = gemasViaveis;
            }

            return `
            <tr>
                <td>${this.ui.formatDateBR(r.data)}</td>
                <td>${fazendaFrente}</td>
                <td>${variedade}</td>
                <td>${indicador}</td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn btn-sm btn-secondary" onclick="window.insumosApp.showPlantioDetails('${r.id}')">
                            📋
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="window.insumosApp.editPlantio('${r.id}')" title="Editar">
                            ✏️
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="window.insumosApp.deletePlantio('${r.id}')" style="background-color: #e74c3c; color: white;" title="Excluir">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    showPlantioDetails(id) {
        const r = (this.plantioDia || []).find(p => String(p.id) === String(id));
        if (!r) return;

        const html = this.getPlantioDetailsHTML(r);
        const modalBody = document.getElementById('plantio-detail-body');
        const modal = document.getElementById('plantio-detail-modal');
        
        if (modalBody && modal) {
            modalBody.innerHTML = html;
            modal.style.display = 'block';
            
            const btnPrint = document.getElementById('plantio-detail-print-btn');
            if (btnPrint) {
                btnPrint.onclick = () => this.printPlantioDetails(id);
            }
        }
    }

    printPlantioDetails(id) {
        const r = (this.plantioDia || []).find(p => String(p.id) === String(id));
        if (!r) return;

        const content = this.getPlantioDetailsHTML(r);
        
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            this.ui.showNotification('Bloqueador de pop-ups impediu a impressão.', 'error');
            return;
        }

        printWindow.document.write(`
            <html>
            <head>
                <title>Relatório de Plantio/Colheita</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
                    h2 { color: #2c3e50; }
                    h5 { border-bottom: 2px solid #3498db; padding-bottom: 8px; margin-top: 25px; color: #2c3e50; font-size: 1.1em; }
                    h6 { color: #7f8c8d; margin-top: 15px; border-bottom: 1px solid #eee; }
                    .details-card { margin-bottom: 20px; page-break-inside: avoid; }
                    .details-card:last-child { margin-bottom: 0; }
                    .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 15px; }
                    .info-item { font-size: 0.95em; }
                    .info-item strong { color: #555; }
                    
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9em; }
                    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
                    th { background-color: #f8f9fa; color: #2c3e50; font-weight: 600; }
                    tr:nth-child(even) { background-color: #fcfcfc; }
                    
                    .quality-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 15px; margin-top: 10px; }
                    .quality-item { background: #f8f9fa; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #e9ecef; }
                    .quality-item .label { font-size: 0.85em; color: #7f8c8d; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
                    .quality-item .value { font-weight: 700; font-size: 1.1em; color: #2c3e50; }
                    .sub-value { font-size: 0.8em; color: #95a5a6; display: block; margin-top: 2px; }
                    
                    .full-span { grid-column: 1 / -1; }
                    
                    /* Hide non-printable elements from the HTML string if any */
                    .no-print { display: none; }
                    
                    @media print {
                        body { padding: 0; background: white; }
                        .details-card { border: none; padding: 0; margin-bottom: 20px; }
                        .details-card:last-child { margin-bottom: 0; page-break-after: auto; }
                        button { display: none; }
                        @page { margin: 1.5cm; }
                    }
                </style>
            </head>
            <body>
                <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px;">
                    <h2 style="margin: 0;">Relatório de Operação Agrícola</h2>
                    <p style="color: var(--text-light); margin: 5px 0 0 0;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
                </div>
                ${content}
                <script>
                    setTimeout(() => {
                        window.print();
                        // Optional: window.close(); 
                    }, 500);
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    copyQualidadeResumoWhatsApp(id) {
        const r = (this.plantioDia || []).find(p => String(p.id) === String(id));
        if (!r || !r.qualidade) return;

        const q = r.qualidade;
        if (q.tipoOperacao !== 'plantio_cana') return;

        const fmtDate = (d) => {
            if (!d) return '—';
            const parts = String(d).split('-');
            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
        };

        const dataStr = fmtDate(r.data);
        const primeiraFrente = Array.isArray(r.frentes) && r.frentes.length > 0 ? r.frentes[0] : null;
        const frente = (primeiraFrente && primeiraFrente.frente) || '—';

        const pesoBaldeEsq = q.esqPesoBalde || q.pesoBaldeKg || 0.460;
        const pesoBaldeDir = q.dirPesoBalde || q.pesoBaldeKg || 0.460;
        const pesoBrutoTotal = (q.esqPesoBruto || 0) + (q.dirPesoBruto || 0);
        const pesoLiquidoTotal = (q.esqPesoLiquido || 0) + (q.dirPesoLiquido || 0);
        const qtdBonsTotal = (q.esqQtdBons || 0) + (q.dirQtdBons || 0);
        const qtdRuinsTotal = (q.esqQtdRuins || 0) + (q.dirQtdRuins || 0);
        const pctBonsTotal = typeof q.totalToletesBons === 'number' ? q.totalToletesBons : 0;
        const pctRuinsTotal = typeof q.totalToletesRuins === 'number' ? q.totalToletesRuins : 0;

        let classificacao = 'RUIM';
        if (pctBonsTotal > 80) classificacao = 'BOM';
        else if (pctBonsTotal >= 50) classificacao = 'MÉDIO';

        const text =
`🌱 RELATÓRIO DE QUALIDADE DE MUDA
📍 Frente: ${frente}
📅 Data: ${dataStr}

⚖ Peso do Balde: ${this.ui.formatNumber(pesoBaldeEsq,3)}kg / ${this.ui.formatNumber(pesoBaldeDir,3)}kg
⚖ Peso Bruto: ${this.ui.formatNumber(pesoBrutoTotal||0,2)} kg
⚖ Peso Líquido: ${this.ui.formatNumber(pesoLiquidoTotal||0,2)} kg

📊 Tonelada por hectare: ${this.ui.formatNumber(q.mediaKgHa||0,2)} kg

🟢 Tolete bom: ${this.ui.formatNumber(qtdBonsTotal||0,0)} (~${this.ui.formatNumber(pctBonsTotal||0,2)}%)
🔴 Tolete ruim: ${this.ui.formatNumber(qtdRuinsTotal||0,0)} (~${this.ui.formatNumber(pctRuinsTotal||0,2)}%)

🌿 Média de gemas por tolete: ${this.ui.formatNumber(q.mediaGemasPorTolete||0,2)}

📌 Classificação: ${classificacao}

Acima de 80% → BOM
Entre 50% e 80% → MÉDIO
Abaixo de 50% → RUIM`;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                this.ui.showNotification('Resumo copiado para a área de transferência.', 'success');
            }).catch(() => {
                window.alert('Não foi possível copiar automaticamente. Selecione e copie o texto manualmente.');
            });
        } else {
            window.prompt('Copie o texto abaixo:', text);
        }
    }

    copyQualidadeResumoOperacionalWhatsApp(id, button) {
        const r = (this.plantioDia || []).find(p => String(p.id) === String(id));
        if (!r || !r.qualidade) return;

        const q = r.qualidade;
        if (q.tipoOperacao !== 'plantio_cana') return;

        const fmtDate = (d) => {
            if (!d) return '—';
            const parts = String(d).split('-');
            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
        };

        const dataStr = fmtDate(r.data);
        const primeiraFrente = Array.isArray(r.frentes) && r.frentes.length > 0 ? r.frentes[0] : null;
        const fazenda = (primeiraFrente && primeiraFrente.fazenda) || q.mudaFazendaOrigem || '—';
        const frente = (primeiraFrente && primeiraFrente.frente) || q.mudaTalhaoOrigem || '—';

        const plantadora = q.qualEquipamentoPlantadora || '—';
        const equipamento = q.qualEquipamentoTrator || '—';
        let distribuidora = '—';
        if (plantadora !== '—' || equipamento !== '—') {
            distribuidora = `${plantadora}/${equipamento}`;
        }

        const distanciaVal = q.distancia || q.mudaDistancia || null;
        const distanciaStr = distanciaVal ? `${this.ui.formatNumber(Number(distanciaVal) || 0, 0)} m` : '—';

        // Tenta pegar o turno ou a hora (fallback)
        let turnoOuHora = '—';
        if (r.turno) {
            turnoOuHora = `Turno ${r.turno}`;
        } else if (q.horaRegistro) {
            // Verifica se horaRegistro já é um turno
            if (q.horaRegistro.toLowerCase().includes('turno')) {
                turnoOuHora = q.horaRegistro;
            } else {
                turnoOuHora = q.horaRegistro;
            }
        } else if (r.created_at) {
            try {
                const dateObj = new Date(r.created_at);
                turnoOuHora = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } catch (e) {}
        }

        const horaInicio = q.horaInicio || turnoOuHora || '—';
        const horaFim = q.horaFim || '';
        const horaStr = horaFim ? `${horaInicio}/${horaFim}` : horaInicio;

        const pesoLiquidoTotal = (q.esqPesoLiquido || 0) + (q.dirPesoLiquido || 0);
        const pesoBonsTotal = (q.esqPesoBons || 0) + (q.dirPesoBons || 0);
        const pesoRuinsTotal = (q.esqPesoRuins || 0) + (q.dirPesoRuins || 0);
        const qtdBonsTotal = (q.esqQtdBons || 0) + (q.dirQtdBons || 0);
        const qtdRuinsTotal = (q.esqQtdRuins || 0) + (q.dirQtdRuins || 0);
        const pctBonsTotal = typeof q.totalToletesBons === 'number' ? q.totalToletesBons : 0;
        const pctRuinsTotal = typeof q.totalToletesRuins === 'number' ? q.totalToletesRuins : 0;

        let tHaTotal = 0;
        let tHaViavel = 0;
        let tHaDescarte = 0;
        const kgHaTotal = typeof q.mediaKgHa === 'number' ? q.mediaKgHa : 0;

        if (kgHaTotal > 0 && pesoLiquidoTotal > 0) {
            tHaTotal = kgHaTotal / 1000;
            const pb = Math.max(pesoBonsTotal, 0);
            const pr = Math.max(pesoRuinsTotal, 0);
            let propBons = pesoLiquidoTotal > 0 ? pb / pesoLiquidoTotal : 0;
            let propRuins = pesoLiquidoTotal > 0 ? pr / pesoLiquidoTotal : 0;
            if (propBons < 0) propBons = 0;
            if (propRuins < 0) propRuins = 0;
            const somaProps = propBons + propRuins;
            if (somaProps > 0) {
                propBons = propBons / somaProps;
                propRuins = propRuins / somaProps;
            }
            tHaViavel = tHaTotal * propBons;
            tHaDescarte = tHaTotal - tHaViavel;
            if (tHaViavel < 0) tHaViavel = 0;
            if (tHaDescarte < 0) tHaDescarte = 0;
        }

        let statusLabel = 'RUIM';
        if (pctBonsTotal > 80) statusLabel = 'BOM';
        else if (pctBonsTotal >= 50) statusLabel = 'MÉDIO';

        const text =
`🌱 *QUALIDADE DE MUDA – PLANTIO*

📍 Fazenda: ${fazenda}
📍 Frente: ${frente}

🚜 Distribuidora: ${distribuidora}
📏 Distância: ${distanciaStr}
⏰ Hora: ${horaStr}

⚖ Peso total: ${this.ui.formatNumber(pesoLiquidoTotal||0,2)} kg
📊 Tonelada por hectare: ${this.ui.formatNumber(tHaTotal||0,2)} T/ha

🟢 Tolete bom: ${this.ui.formatNumber(qtdBonsTotal||0,0)} ~ ${this.ui.formatNumber(pctBonsTotal||0,2)}%
🔴 Tolete ruim: ${this.ui.formatNumber(qtdRuinsTotal||0,0)} ~ ${this.ui.formatNumber(pctRuinsTotal||0,2)}%

🌿 Gema viável:
Peso: ${this.ui.formatNumber(pesoBonsTotal||0,2)} kg
${this.ui.formatNumber(tHaViavel||0,2)} T/ha

🗑 Gema descarte:
Peso: ${this.ui.formatNumber(pesoRuinsTotal||0,2)} kg
${this.ui.formatNumber(tHaDescarte||0,2)} T/ha

📌 Status geral: ${statusLabel}`;

        const originalText = button ? button.innerText : null;
        if (button) {
            button.disabled = true;
            button.innerText = '✅ Copiado!';
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                this.ui.showNotification('✔ Resumo copiado para a área de transferência!', 'success');
                if (button) {
                    setTimeout(() => {
                        button.disabled = false;
                        button.innerText = originalText;
                    }, 2500);
                }
            }).catch(() => {
                this.ui.showNotification('Erro ao copiar. Tente novamente.', 'error');
                window.prompt('Copie o texto abaixo:', text);
                if (button) {
                    button.disabled = false;
                    button.innerText = originalText;
                }
            });
        } else {
            window.prompt('Copie o texto abaixo:', text);
            if (button) {
                button.disabled = false;
                button.innerText = originalText;
            }
        }
    }

    getPlantioDetailsHTML(r) {
        const fmtDate = (d) => {
            if (!d) return '—';
            const parts = d.split('-');
            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
        };
        const dataStr = fmtDate(r.data);
        const resp = r.responsavel || '—';
        const obs = r.observacoes || '—';
        
        const q = r.qualidade||{};
        
        // Quality Source Info
        const qualitySourceInfo = q.qualitySourceLabel 
            ? `<div class="info-item full-span" style="grid-column: 1 / -1; margin-top: 5px; color: var(--primary);"><strong>🔗 Qualidade Vinculada:</strong> ${q.qualitySourceLabel}</div>`
            : '';

        // Tenta pegar o turno ou a hora (fallback)
        let turnoOuHora = '—';
        if (r.turno) {
            turnoOuHora = `Turno ${r.turno}`;
        } else if (q.horaRegistro) {
            // Verifica se horaRegistro já é um turno
            if (q.horaRegistro.toLowerCase().includes('turno')) {
                turnoOuHora = q.horaRegistro;
            } else {
                turnoOuHora = q.horaRegistro;
            }
        } else if (r.created_at) {
            try {
                const dateObj = new Date(r.created_at);
                turnoOuHora = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } catch (e) {}
        }

        const frentesRows = (r.frentes||[]).map(f => {
            const frenteLabel = f.frente || '—';
            let fazendaVal = f.fazenda || '';
            let codVal = (f.cod != null ? f.cod : null);

            if (!fazendaVal && f.frente) {
                const m = String(f.frente).match(/^(\d+)\s+(.+)$/);
                if (m) {
                    if (codVal == null) {
                        const parsed = parseInt(m[1], 10);
                        if (!isNaN(parsed)) codVal = parsed;
                    }
                    fazendaVal = m[2].trim();
                }
            }

            return `
            <tr>
                <td>${frenteLabel}</td>
                <td>${fazendaVal || '—'}</td>
                <td>${codVal!=null?codVal:'—'}</td>
                <td>${f.regiao||'—'}</td>
                <td>${this.ui.formatNumber(f.areaTotal||0)}</td>
                <td>${this.ui.formatNumber(f.area||0)}</td>
                <td>${this.ui.formatNumber(f.areaAcumulada||0)}</td>
                <td>${this.ui.formatNumber(f.plantioDiario||0)}</td>
            </tr>
        `;
        }).join('');
        
        const insumosRows = (r.insumos||[]).map(i => {
            // Tenta pegar a dose realizada, senão prevista, senão genérica
            const dose = i.doseRealizada || i.dosePrevista || i.dose || 0;
            const unid = i.unid || 'L/ha'; // Unidade padrão caso não tenha
            
            return `
            <tr>
                <td>${i.produto}</td>
                <td>${this.ui.formatNumber(dose, 6)}</td>
                <td>${unid}</td>
            </tr>
        `}).join('');
        
        // Helper para item de qualidade
        const qualItem = (label, val, sub = '') => `
            <div class="quality-item">
                <div class="label" title="${label}">${label}</div>
                <div class="value">${val}${sub ? `<span class="sub-value">${sub}</span>` : ''}</div>
            </div>
        `;
        
        // Define Tipo de Operação label
        const tipoOpMap = {
            'plantio': 'Plantio de Cana',
            'colheita_muda': 'Colheita de Muda',
            'qualidade_muda': 'Qualidade de Muda'
        };
        const rawTipo = r.tipo_operacao || (q.tipoOperacao) || 'plantio';
        const tipoOpLabel = tipoOpMap[rawTipo] || rawTipo;
        const isPlantioCanaComplex = (q.tipoOperacao === 'plantio_cana');
        const isQualidadeMudaGeneric = (rawTipo === 'colheita_muda' || rawTipo === 'qualidade_muda') && !isPlantioCanaComplex;
        const isNovoPlantioCanaGlobal = isPlantioCanaComplex;
        const hideInsumosSection = isQualidadeMudaGeneric || isNovoPlantioCanaGlobal;

        const primeiraFrente = Array.isArray(r.frentes) && r.frentes.length > 0 ? r.frentes[0] : null;
        let derivedHeaderFazenda = null;
        if (primeiraFrente) {
            if (primeiraFrente.fazenda) {
                derivedHeaderFazenda = primeiraFrente.fazenda;
            } else if (primeiraFrente.frente) {
                const m = String(primeiraFrente.frente).match(/^(\d+)\s+(.+)$/);
                if (m && m[2]) {
                    derivedHeaderFazenda = m[2].trim();
                }
            }
        }
        const headerFazenda = derivedHeaderFazenda || q.mudaFazendaOrigem || '—';
        const headerFrente = (primeiraFrente && primeiraFrente.frente) || q.mudaTalhaoOrigem || '—';

        let statusPlantioCana = null;
        if (isPlantioCanaComplex) {
            const pctBons = typeof q.totalToletesBons === 'number' ? q.totalToletesBons : 0;
            if (pctBons > 80) {
                statusPlantioCana = { label: 'BOM', emoji: '🟢', color: '#2e7d32' };
            } else if (pctBons >= 50) {
                statusPlantioCana = { label: 'MÉDIO', emoji: '🟡', color: '#f9a825' };
            } else {
                statusPlantioCana = { label: 'RUIM', emoji: '🔴', color: '#e53935' };
            }
        }

        let qualitySections = '';
        if (isQualidadeMudaGeneric) {
             qualitySections += `
                <!-- Subseção Colheita/Qualidade -->
                <h6 style="margin: 0 0 5px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">🌾 Dados da Qualidade/Colheita</h6>
                <div class="quality-grid">
                    ${qualItem('Colheita Hectares', this.ui.formatNumber(q.colheitaHectares||0,2))}
                    ${qualItem('TCH Estimado', this.ui.formatNumber(q.colheitaTchEstimado||0,2))}
                    ${qualItem('TCH Real', this.ui.formatNumber(q.colheitaTchReal||0,2))}
                </div>
                <!-- Subseção Gemas -->
                <h6 style="margin: 15px 0 5px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">🧬 Gemas (Qualidade)</h6>
                <div class="quality-grid">
                    ${qualItem('Amostra', this.ui.formatNumber(q.gemasAmostra||0, 1))}
                    ${qualItem('Total', this.ui.formatNumber(q.gemasTotal||0))}
                    ${qualItem('Média/m', this.ui.formatNumber(q.gemasMedia||0, 2))}
                    ${qualItem('Viáveis', this.ui.formatNumber(q.gemasBoas||0), `(${this.ui.formatNumber(q.gemasBoasPct||0,1)}%)`)}
                    ${qualItem('Inviáveis', this.ui.formatNumber(q.gemasRuins||0), `(${this.ui.formatNumber(q.gemasRuinsPct||0,1)}%)`)}
                </div>
                <!-- Subseção Toletes -->
                <h6 style="margin: 15px 0 5px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">🪵 Toletes (Qualidade)</h6>
                <div class="quality-grid">
                    ${qualItem('Amostra', this.ui.formatNumber(q.toletesAmostra||0, 1))}
                    ${qualItem('Total', this.ui.formatNumber(q.toletesTotal||0))}
                    ${qualItem('Média/m', this.ui.formatNumber(q.toletesMedia||0, 2))}
                    ${qualItem('Bons', this.ui.formatNumber(q.toletesBons||0), `(${this.ui.formatNumber(q.toletesBonsPct||0,1)}%)`)}
                    ${qualItem('Ruins', this.ui.formatNumber(q.toletesRuins||0), `(${this.ui.formatNumber(q.toletesRuinsPct||0,1)}%)`)}
                </div>
            `;
            
            // Outros Indicadores para Colheita (Apenas Chuva por enquanto)
            qualitySections += `
                <h6 style="margin: 15px 0 5px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">📏 Outros Indicadores</h6>
                <div class="quality-grid">
                    ${qualItem('Chuva', this.ui.formatNumber(q.chuvaMm||0,1), 'mm')}
                </div>
            `;

        } else {
            const isNovoPlantioCana = isPlantioCanaComplex;
            if (isNovoPlantioCana) {
                const pctBonsTotal = typeof q.totalToletesBons === 'number' ? q.totalToletesBons : 0;
                const pctRuinsTotal = typeof q.totalToletesRuins === 'number' ? q.totalToletesRuins : 0;
                const pesoBonsTotal = (q.esqPesoBons || 0) + (q.dirPesoBons || 0);
                const pesoRuinsTotal = (q.esqPesoRuins || 0) + (q.dirPesoRuins || 0);
                const pesoLiquidoTotal = (q.esqPesoLiquido || 0) + (q.dirPesoLiquido || 0);
                const ruinsHighlight = pctRuinsTotal > 50 ? 'border-color:#e53935; background:rgba(229,57,53,0.08);' : '';
                const statusColor = statusPlantioCana ? statusPlantioCana.color : '#888';
                const statusLabel = statusPlantioCana ? statusPlantioCana.label : 'N/A';
                const statusEmoji = statusPlantioCana ? statusPlantioCana.emoji : 'ℹ️';

                const kgHaTotal = typeof q.mediaKgHa === 'number' ? q.mediaKgHa : 0;
                let tHaTotal = 0;
                let tHaViavel = 0;
                let tHaDescarte = 0;
                let proporcaoRuins = 0;

                if (kgHaTotal > 0 && pesoLiquidoTotal > 0) {
                    tHaTotal = kgHaTotal / 1000;
                    const pb = Math.max(pesoBonsTotal, 0);
                    const pr = Math.max(pesoRuinsTotal, 0);
                    let propBons = pesoLiquidoTotal > 0 ? pb / pesoLiquidoTotal : 0;
                    let propRuins = pesoLiquidoTotal > 0 ? pr / pesoLiquidoTotal : 0;

                    if (propBons < 0) propBons = 0;
                    if (propRuins < 0) propRuins = 0;

                    const somaProps = propBons + propRuins;
                    if (somaProps > 0) {
                        propBons = propBons / somaProps;
                        propRuins = propRuins / somaProps;
                    }

                    tHaViavel = tHaTotal * propBons;
                    tHaDescarte = tHaTotal - tHaViavel;
                    if (tHaViavel < 0) tHaViavel = 0;
                    if (tHaDescarte < 0) tHaDescarte = 0;

                    proporcaoRuins = propRuins;
                }

                let conversaoBg = 'rgba(0,0,0,0.02)';
                let conversaoBorder = '#ccc';
                let conversaoAlert = '';
                if (proporcaoRuins > 0.5) {
                    conversaoBg = 'rgba(229,57,53,0.08)';
                    conversaoBorder = '#e53935';
                    conversaoAlert = '🚨 Alerta crítico: descarte superior a 50% impactando diretamente a produtividade estimada.';
                } else if (proporcaoRuins > 0.4) {
                    conversaoBg = 'rgba(249,168,37,0.12)';
                    conversaoBorder = '#f9a825';
                    conversaoAlert = '⚠ Atenção: índice de descarte elevado.';
                }

                qualitySections += `
                    <div class="details-card" style="padding: 10px;">
                        <div class="info-grid" style="grid-template-columns: repeat(4, 1fr);">
                            <div class="info-item"><strong>Fazenda:</strong> ${headerFazenda}</div>
                            <div class="info-item"><strong>Frente:</strong> ${headerFrente}</div>
                            <div class="info-item"><strong>Região:</strong> ${(primeiraFrente && primeiraFrente.regiao) || '—'}</div>
                            <div class="info-item"><strong>Data/Hora:</strong> ${dataStr}${turnoOuHora ? ' (' + turnoOuHora + ')' : ''}</div>
                            <div class="info-item"><strong>Trator:</strong> ${q.qualEquipamentoTrator || '—'}</div>
                            <div class="info-item"><strong>Plantadora:</strong> ${q.qualEquipamentoPlantadora || '—'}</div>
                            <div class="info-item"><strong>Operador:</strong> ${q.qualOperador || '—'}</div>
                            <div class="info-item"><strong>Matrícula:</strong> ${q.qualMatricula || '—'}</div>
                        </div>
                    </div>
                    <div class="quality-grid" style="margin: 8px 0 12px 0;">
                        <div class="quality-item" style="grid-column: 1 / -1; border-width: 2px; border-color: ${statusColor}; background: rgba(0,0,0,0.02);">
                            <div class="label" style="font-weight: 600;">STATUS DA QUALIDADE DA MUDA</div>
                            <div class="value" style="font-size: 1.4em; margin-top: 4px;">${statusEmoji} ${statusLabel}</div>
                            <div class="sub-value" style="margin-top: 4px;">
                                Toletes bons: ${this.ui.formatNumber(pctBonsTotal||0,2)}% · T/ha total: ${this.ui.formatNumber(tHaTotal||0,2)}
                            </div>
                        </div>
                    </div>
                    <h6 style="margin: 10px 0 5px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">📋 Comparativo das Linhas da Plantadora</h6>
                    <div style="overflow-x:auto;">
                        <table class="details-inner-table">
                            <thead>
                                <tr>
                                    <th>Indicador</th>
                                    <th>Linha Esquerda</th>
                                    <th>Linha Direita</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td>Peso do balde (kg)</td><td>${this.ui.formatNumber(q.esqPesoBalde || q.pesoBaldeKg || 0.460, 3)}</td><td>${this.ui.formatNumber(q.dirPesoBalde || q.pesoBaldeKg || 0.460, 3)}</td></tr>
                                <tr><td>Peso bruto (kg)</td><td>${this.ui.formatNumber(q.esqPesoBruto||0,2)}</td><td>${this.ui.formatNumber(q.dirPesoBruto||0,2)}</td></tr>
                                <tr><td>Peso líquido (kg)</td><td>${this.ui.formatNumber(q.esqPesoLiquido||0,2)}</td><td>${this.ui.formatNumber(q.dirPesoLiquido||0,2)}</td></tr>
                                <tr><td>KG por hectare (kg/ha)</td><td>${this.ui.formatNumber(q.esqKgHa||0,2)}</td><td>${this.ui.formatNumber(q.dirKgHa||0,2)}</td></tr>
                                <tr><td>Qtd. toletes bons</td><td>${this.ui.formatNumber(q.esqQtdBons||0,0)}</td><td>${this.ui.formatNumber(q.dirQtdBons||0,0)}</td></tr>
                                <tr><td>Qtd. toletes ruins</td><td>${this.ui.formatNumber(q.esqQtdRuins||0,0)}</td><td>${this.ui.formatNumber(q.dirQtdRuins||0,0)}</td></tr>
                                <tr><td>Peso bons (kg)</td><td>${this.ui.formatNumber(q.esqPesoBons||0,2)}</td><td>${this.ui.formatNumber(q.dirPesoBons||0,2)}</td></tr>
                                <tr><td>Peso ruins (kg)</td><td>${this.ui.formatNumber(q.esqPesoRuins||0,2)}</td><td>${this.ui.formatNumber(q.dirPesoRuins||0,2)}</td></tr>
                                <tr><td>Gemas por tolete</td><td>${this.ui.formatNumber(q.esqGemasBoasPorTolete||0,2)}</td><td>${this.ui.formatNumber(q.dirGemasBoasPorTolete||0,2)}</td></tr>
                                <tr><td>Gemas por 5m</td><td>${this.ui.formatNumber(q.esqGemasBoasPor5||0,2)}</td><td>${this.ui.formatNumber(q.dirGemasBoasPor5||0,2)}</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <h6 style="margin: 12px 0 6px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">🌱 Conversão Produtiva das Gemas (T/ha)</h6>
                    <div class="info-item" style="border-radius: 6px; padding: 8px 10px; background: ${conversaoBg}; border: 1px solid ${conversaoBorder};">
                        <div><strong>🌿 Gema Viável</strong></div>
                        <div>Peso: ${this.ui.formatNumber(pesoBonsTotal||0,2)} kg</div>
                        <div>Produtividade estimada: ${this.ui.formatNumber(tHaViavel||0,2)} T/ha</div>
                        <div style="margin-top: 6px;"><strong>🗑 Gema Descarte</strong></div>
                        <div>Peso: ${this.ui.formatNumber(pesoRuinsTotal||0,2)} kg</div>
                        <div>Impacto estimado: ${this.ui.formatNumber(tHaDescarte||0,2)} T/ha</div>
                        <div style="margin-top: 6px;"><strong>📊 Total</strong></div>
                        <div>Produtividade total: ${this.ui.formatNumber(tHaTotal||0,2)} T/ha</div>
                        ${conversaoAlert ? `<div style="margin-top: 8px; font-weight: 600;">${conversaoAlert}</div>` : ''}
                    </div>
                    <h6 style="margin: 12px 0 6px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">📈 Qualidade Consolidada</h6>
                    <div class="info-grid" style="grid-template-columns: repeat(3, 1fr);">
                        <div class="info-item"><strong>Média de gemas por tolete:</strong> ${this.ui.formatNumber(q.mediaGemasPorTolete||0,2)}</div>
                        <div class="info-item"><strong>Média Gemas por 5m:</strong> ${this.ui.formatNumber(q.mediaGemasPor5||0,2)}</div>
                        <div class="info-item"><strong>Média KG por hectare:</strong> ${this.ui.formatNumber(q.mediaKgHa||0,2)} kg/ha</div>
                        <div class="info-item"><strong>Total Toletes Bons (%):</strong> ${this.ui.formatNumber(pctBonsTotal||0,2)}%</div>
                        <div class="info-item"><strong>Total Toletes Ruins (%):</strong> ${this.ui.formatNumber(pctRuinsTotal||0,2)}%</div>
                    </div>
                `;
            } else {
                qualitySections += `
                    <!-- Subseção Gemas -->
                    <h6 style="margin: 0 0 5px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">🧬 Gemas</h6>
                    <div class="quality-grid">
                        ${qualItem('Amostra', this.ui.formatNumber(q.gemasAmostra||0, 1))}
                        ${qualItem('Total', this.ui.formatNumber(q.gemasTotal||0))}
                        ${qualItem('Média/m', this.ui.formatNumber(q.gemasMedia||0, 2))}
                        ${qualItem('Viáveis', this.ui.formatNumber(q.gemasBoas||0), `(${this.ui.formatNumber(q.gemasBoasPct||0,1)}%)`)}
                        ${qualItem('Inviáveis', this.ui.formatNumber(q.gemasRuins||0), `(${this.ui.formatNumber(q.gemasRuinsPct||0,1)}%)`)}
                    </div>
                    <!-- Subseção Toletes -->
                    <h6 style="margin: 15px 0 5px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">🪵 Toletes</h6>
                    <div class="quality-grid">
                        ${qualItem('Amostra', this.ui.formatNumber(q.toletesAmostra||0, 1))}
                        ${qualItem('Total', this.ui.formatNumber(q.toletesTotal||0))}
                        ${qualItem('Média/m', this.ui.formatNumber(q.toletesMedia||0, 2))}
                        ${qualItem('Bons', this.ui.formatNumber(q.toletesBons||0), `(${this.ui.formatNumber(q.toletesBonsPct||0,1)}%)`)}
                        ${qualItem('Ruins', this.ui.formatNumber(q.toletesRuins||0), `(${this.ui.formatNumber(q.toletesRuinsPct||0,1)}%)`)}
                    </div>
                    <!-- Subseção Mudas (Plantio) -->
                    <h6 style="margin: 15px 0 5px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">🌱 Mudas (Plantio)</h6>
                    <div class="quality-grid">
                        ${qualItem('Amostra', this.ui.formatNumber(q.mudasAmostra||0, 1))}
                        ${qualItem('Total', this.ui.formatNumber(q.mudasTotal||0))}
                        ${qualItem('Média/m', this.ui.formatNumber(q.mudasMedia||0, 2))}
                        ${qualItem('Boas', this.ui.formatNumber(q.mudasBoas||0), `(${this.ui.formatNumber(q.mudasBoasPct||0,1)}%)`)}
                        ${qualItem('Ruins', this.ui.formatNumber(q.mudasRuins||0), `(${this.ui.formatNumber(q.mudasRuinsPct||0,1)}%)`)}
                    </div>
                    <!-- Subseção Reboulos -->
                    <h6 style="margin: 15px 0 5px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">🍂 Reboulos</h6>
                    <div class="quality-grid">
                        ${qualItem('Total', this.ui.formatNumber(q.mudasReboulos||0))}
                        ${qualItem('Bons', this.ui.formatNumber(q.mudasReboulosBons||0), `(${this.ui.formatNumber(q.mudasReboulosBonsPct||0,1)}%)`)}
                        ${qualItem('Ruins', this.ui.formatNumber(q.mudasReboulosRuins||0), `(${this.ui.formatNumber(q.mudasReboulosRuinsPct||0,1)}%)`)}
                    </div>
                    <!-- Subseção Consumo de Muda -->
                    <h6 style="margin: 15px 0 5px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">🚜 Consumo de Muda</h6>
                    <div class="quality-grid">
                        ${qualItem('Consumo Total', this.ui.formatNumber(q.mudaConsumoTotal||0,2), 'ton')}
                        ${qualItem('Consumo Acum.', this.ui.formatNumber(q.mudaConsumoAcumulado||0,2), 'ton')}
                        ${qualItem('Consumo Dia', this.ui.formatNumber(q.mudaConsumoDia||0,2), 'ton')}
                        ${qualItem('Previsto', this.ui.formatNumber(q.mudaPrevisto||0,2), 'ton')}
                        ${qualItem('Liberação', q.mudaLiberacaoFazenda||'—')}
                        ${qualItem('Info Colheita', q.mudaColheitaInfo||'—')}
                        ${qualItem('Variedade', q.mudaVariedade||'—')}
                        ${qualItem('Fazenda Origem', q.mudaFazendaOrigem||'—')}
                        ${qualItem('Talhão Origem', q.mudaTalhaoOrigem||'—')}
                    </div>
                    
                    <!-- Subseção Outros (Plantio) -->
                    <h6 style="margin: 15px 0 5px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">📏 Outros Indicadores</h6>
                    <div class="quality-grid">
                        ${qualItem('Muda (ton/ha)', this.ui.formatNumber(q.mudaTonHa||0))}
                        ${qualItem('Profundidade', this.ui.formatNumber(q.profundidadeCm||0), 'cm')}
                        ${qualItem('Cobertura', q.cobertura||'—')}
                        ${qualItem('Espaçamento', q.alinhamento||'—')}
                        ${qualItem('Chuva', this.ui.formatNumber(q.chuvaMm||0,1), 'mm')}
                        ${qualItem('Cobrição Dia', this.ui.formatNumber(q.cobricaoDia||0,2))}
                        ${qualItem('Cobrição Acum.', this.ui.formatNumber(q.cobricaoAcumulada||0,2))}
                        ${qualItem('Oxifertil', this.ui.formatNumber(q.oxifertilDose||0,2), 'L/ha')}
                    </div>
                `;
            }
        }

        return `
            <div class="plantio-details-container">
                <!-- Seção 1: Informações Gerais -->
                <div class="details-card full-width">
                    <h5>📋 Informações Gerais</h5>
                    <div class="info-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px;">
                        <div class="info-item"><strong>Operação:</strong> ${tipoOpLabel}</div>
                        <div class="info-item"><strong>Data/Hora:</strong> ${dataStr}${turnoOuHora ? ' (' + turnoOuHora + ')' : ''}</div>
                        <div class="info-item"><strong>Responsável:</strong> ${resp}</div>
                        <div class="info-item"><strong>Matrícula:</strong> ${q.qualMatricula || '—'}</div>
                        <div class="info-item full-span" style="grid-column: 1 / -1;"><strong>Observações:</strong> ${obs}</div>
                        ${qualitySourceInfo}
                    </div>
                </div>

                ${!isNovoPlantioCanaGlobal && rawTipo !== 'plantio' ? `
                <!-- Seção 1.5: Equipe e Equipamentos (Oculto para Plantio de Cana) -->
                <div class="details-card full-width">
                    <h5>👷 Equipe e Equipamentos</h5>
                    <div class="info-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        <div class="info-item"><strong>Trator:</strong> ${q.qualEquipamentoTrator || '—'}</div>
                        <div class="info-item"><strong>Plantadora:</strong> ${q.qualEquipamentoPlantadora || '—'}</div>
                        <div class="info-item"><strong>Operador:</strong> ${q.qualOperador || '—'}</div>
                        <div class="info-item"><strong>Matrícula:</strong> ${q.qualMatricula || '—'}</div>
                    </div>
                </div>
                ` : ''}

                <!-- Seção 2: Local e Área -->
                <div class="details-card full-width">
                    <h5>🚜 Local e Área</h5>
                    <div style="overflow-x: auto;">
                        <table class="details-inner-table">
                            <thead>
                                <tr>
                                    <th>Frente</th>
                                    <th>Fazenda</th>
                                    <th>Cód</th>
                                    <th>Região</th>
                                    <th>Área Total (Fazenda)</th>
                                    <th>Área OS</th>
                                    <th>Área Acum. (OS)</th>
                                    <th>Plantio Dia</th>
                                </tr>
                            </thead>
                            <tbody>${frentesRows || '<tr><td colspan="8" style="text-align:center;">—</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>

                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    <!-- Seção 3: Insumos (Ocultar se for Qualidade de Muda) -->
                    ${!hideInsumosSection ? `
                    <div class="details-card flex-1" style="min-width: 300px;">
                        <h5>🧪 Insumos Aplicados</h5>
                        <div style="overflow-x: auto;">
                            <table class="details-inner-table">
                                <thead><tr><th>Produto</th><th>Dose</th><th>Unid</th></tr></thead>
                                <tbody>${insumosRows || '<tr><td colspan="3" style="text-align:center;">Nenhum insumo registrado</td></tr>'}</tbody>
                            </table>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Seção 4: Qualidade & Indicadores (Dinâmica) -->
                    <div class="details-card flex-1" style="min-width: 300px;">
                        <h5>📊 Indicadores & Qualidade</h5>
                        ${qualitySections}
                    </div>
                </div>
                </div>
                <div style="margin-top: 15px; text-align: right;">
                    ${(q && q.tipoOperacao === 'plantio_cana') ? `
                    <button class="btn btn-secondary" onclick="window.insumosApp.copyQualidadeResumoOperacionalWhatsApp('${r.id}', this)">
                        📋 Copiar Resumo para WhatsApp
                    </button>
                    ` : ''}
                </div>
            </div>`;
    }

    async loadOxifertilData(filters = {}) {
        try {
            const tbody = document.querySelector('#oxifertil-table tbody');
            tbody.innerHTML = '<tr><td colspan="11" class="loading">📡 Carregando dados...</td></tr>';
            
            const response = await this.api.getOxifertil(filters);
            
            if (response.success) {
                this.oxifertilData = response.data;
                this.ui.renderTable(tbody, response.data, this.getOxifertilRowHTML.bind(this));
                this.ui.updateOxifertilTotals(response.data);
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            const tbody = document.querySelector('#oxifertil-table tbody');
            tbody.innerHTML = `
                <tr>
                    <td colspan="11" class="loading" style="color: var(--error-color);">
                        ❌ Erro ao carregar dados: ${error.message}
                    </td>
                </tr>
            `;
            this.ui.resetOxifertilTotals();
        }
    }

    getOxifertilRowHTML(item) {
        let doseAplicada = 0;
        if (item.doseAplicada != null && item.doseAplicada > 0) {
            doseAplicada = item.doseAplicada;
        } else if (item.insumDoseAplicada != null && item.insumDoseAplicada > 0) {
            doseAplicada = item.insumDoseAplicada;
        }

        const difPercent = (item.dif * 100) || 0;
        const difClass = this.ui.getDifferenceClass(difPercent);
        
        return `
            <td>${item.processo || '—'}</td>
            <td>${item.subprocesso || '—'}</td>
            <td>${item.produto || '—'}</td>
            <td>${item.fazenda || '—'}</td>
            <td>${this.ui.formatNumber(item.areaTalhao || 0)}</td>
            <td>${this.ui.formatNumber(item.areaTotalAplicada || 0)}</td>
            <td>${this.ui.formatNumber(item.doseRecomendada || 0, 3)}</td>
            <td>${this.ui.formatNumber(doseAplicada || 0, 7)}</td>
            <td>${this.ui.formatNumber(item.quantidadeAplicada || 0, 6)}</td>
            <td class="${difClass}">${this.ui.formatPercentage(difPercent)}</td>
            <td>${item.frente ?? 0}</td>
            <td>
                <button class="btn btn-edit" data-id="${item.id}">✏️ Editar</button>
                <button class="btn btn-delete" data-id="${item.id}">🗑️ Excluir</button>
            </td>
        `;
    }

    applyOxifertilFilters() {
        const fazenda = document.getElementById('fazenda-filter').value;
        const frente = document.getElementById('frente-filter').value;
        
        const filters = {};
        if (fazenda !== 'all') filters.fazenda = fazenda;
        if (frente !== 'all') filters.frente = frente;
        
        this.currentFilters.oxifertil = filters;
        this.loadOxifertilData(filters);
    }

    resetOxifertilFilters() {
        document.getElementById('fazenda-filter').value = 'all';
        document.getElementById('frente-filter').value = 'all';
        this.currentFilters.oxifertil = {};
        this.loadOxifertilData();
    }

    async loadInsumosData(filters = {}) {
        try {
            if (!this.api || !this.api.getInsumosFazendas) {
                this.api = window.apiService || (typeof ApiService !== 'undefined' ? new ApiService() : null);
                if (!this.api || !this.api.getInsumosFazendas) throw new Error('API indisponível (getInsumosFazendas)');
            }
            const tbody = document.querySelector('#insumos-table tbody');
            tbody.innerHTML = '<tr><td colspan="13" class="loading">📡 Carregando dados...</td></tr>';
            
            const response = await this.api.getInsumosFazendas(filters);
            
            if (response.success) {
                this.insumosFazendasData = response.data;
                this.updateInsumosFilters(this.insumosFazendasData);
                this.renderInsumos();
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            const tbody = document.querySelector('#insumos-table tbody');
            tbody.innerHTML = `
                <tr>
                    <td colspan="13" class="loading" style="color: var(--error);">
                        ❌ Erro ao carregar dados: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    async loadViagensAdubo() {
        try {
            if (!this.api || !this.api.getViagensAdubo) {
                this.api = window.apiService || (typeof ApiService !== 'undefined' ? new ApiService() : null);
            }
            const tbody = document.getElementById('viagens-adubo-table-body');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="9" class="loading">📡 Carregando dados...</td></tr>';
            const response = await this.api.getViagensAdubo();
            if (response && response.success) {
                this.viagensAdubo = Array.isArray(response.data) ? response.data : [];
                this.renderViagensAdubo();
            } else {
                throw new Error(response && response.message ? response.message : 'Erro ao carregar viagens');
            }
        } catch (error) {
            const tbody = document.getElementById('viagens-adubo-table-body');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="loading" style="color: var(--error);">
                            ❌ Erro ao carregar dados: ${error.message}
                        </td>
                    </tr>
                `;
            }
        }
    }

 
    setupViagemAduboListeners() {
        console.log('Setting up Viagem Adubo listeners...');
        // Button Nova Viagem (Open Modal)
        const btnNovaViagem = document.getElementById('btn-nova-viagem-adubo');
        
        if (btnNovaViagem) {
            console.log('Botão btn-nova-viagem-adubo encontrado.');
            // Remove listeners antigos clonando (opcional, mas seguro)
            const newBtn = btnNovaViagem.cloneNode(true);
            btnNovaViagem.parentNode.replaceChild(newBtn, btnNovaViagem);
            
            newBtn.addEventListener('click', () => {
                console.log('Botão Nova Viagem Adubo clicado!');
                this.openViagemAduboModal(null, 'create');
            });
        } else {
            console.error('Botão btn-nova-viagem-adubo NÃO encontrado!');
        }

        // Toggle Filters Button
        const btnToggleFilters = document.getElementById('btn-toggle-viagens-filters');
        const filtersContainer = document.getElementById('viagens-filters-container');
        if (btnToggleFilters && filtersContainer) {
            btnToggleFilters.onclick = () => {
                 const isHidden = filtersContainer.style.display === 'none';
                 filtersContainer.style.display = isHidden ? 'flex' : 'none';
            };
        }

        const prodSelect = document.getElementById('viagem-produto');
        if (prodSelect) {
            const newSel = prodSelect.cloneNode(true);
            prodSelect.parentNode.replaceChild(newSel, prodSelect);
            newSel.addEventListener('change', () => {
                const val = newSel.value;
                if (val === 'Outro') {
                    const modal = document.getElementById('modal-produto-outro');
                    if (modal) {
                        modal.style.zIndex = '12100';
                        if (!modal.dataset.appended) {
                            document.body.appendChild(modal);
                            modal.dataset.appended = '1';
                        }
                        modal.style.display = 'flex';
                        this._outroContext = 'main';
                        const baseModal = document.getElementById('modal-viagem-adubo');
                        if (baseModal) {
                            baseModal.dataset.prevZ = baseModal.style.zIndex || '';
                            baseModal.style.zIndex = '10400';
                        }
                        setTimeout(() => {
                            const nomeEl = document.getElementById('outro-produto-nome');
                            if (nomeEl) nomeEl.focus();
                        }, 0);
                    }
                }
            });
        }
        const prodSelectModal = document.getElementById('modal-viagem-produto');
        if (prodSelectModal) {
            const newSelM = prodSelectModal.cloneNode(true);
            prodSelectModal.parentNode.replaceChild(newSelM, prodSelectModal);
            newSelM.addEventListener('change', () => {
                const val = newSelM.value;
                if (val === 'Outro') {
                    const modal = document.getElementById('modal-produto-outro');
                    if (modal) {
                        modal.style.zIndex = '12100';
                        if (!modal.dataset.appended) {
                            document.body.appendChild(modal);
                            modal.dataset.appended = '1';
                        }
                        modal.style.display = 'flex';
                        this._outroContext = 'modal';
                        const baseModal = document.getElementById('modal-viagem-adubo');
                        if (baseModal) {
                            baseModal.dataset.prevZ = baseModal.style.zIndex || '';
                            baseModal.style.zIndex = '10400';
                        }
                        setTimeout(() => {
                            const nomeEl = document.getElementById('outro-produto-nome');
                            if (nomeEl) nomeEl.focus();
                        }, 0);
                    }
                }
            });
        }

        const outroCancelEls = ['outro-produto-cancel', 'outro-produto-cancel-btn'];
        outroCancelEls.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.onclick = () => {
                    const modal = document.getElementById('modal-produto-outro');
                    if (modal) modal.style.display = 'none';
                    const baseModal = document.getElementById('modal-viagem-adubo');
                    if (baseModal) {
                        baseModal.style.zIndex = baseModal.dataset.prevZ || '';
                        delete baseModal.dataset.prevZ;
                    }
                };
            }
        });
        const outroConfirm = document.getElementById('outro-produto-confirm');
        if (outroConfirm) {
            outroConfirm.onclick = () => {
                const nomeEl = document.getElementById('outro-produto-nome');
                const justEl = document.getElementById('outro-produto-justificativa');
                const nome = nomeEl ? nomeEl.value.trim() : '';
                const justificativa = justEl ? justEl.value.trim() : '';
                if (!nome || !justificativa) {
                    if (this.ui) this.ui.showNotification('Informe nome e justificativa do produto.', 'warning');
                    return;
                }
                const selectMain = document.getElementById('viagem-produto');
                const selectModal = document.getElementById('modal-viagem-produto');
                const targetSelect = (this._outroContext === 'modal' && selectModal) ? selectModal : selectMain;
                if (targetSelect) {
                    let opt = Array.from(targetSelect.options).find(o => o.value === nome);
                    if (!opt) {
                        opt = document.createElement('option');
                        opt.value = nome;
                        opt.textContent = nome;
                        targetSelect.appendChild(opt);
                    }
                    targetSelect.value = nome;
                }
                const obsMain = document.getElementById('viagem-observacoes');
                const obsModal = document.getElementById('modal-viagem-observacoes');
                const targetObs = (this._outroContext === 'modal' && obsModal) ? obsModal : obsMain;
                if (targetObs) {
                    const prefix = 'Justificativa: ';
                    const has = (targetObs.value || '').includes(prefix);
                    targetObs.value = has ? targetObs.value : `${prefix}${justificativa}`;
                }
                this.customProdutoInfo = { nome, justificativa };
                const modal = document.getElementById('modal-produto-outro');
                if (modal) modal.style.display = 'none';
                const baseModal = document.getElementById('modal-viagem-adubo');
                if (baseModal) {
                    baseModal.style.zIndex = baseModal.dataset.prevZ || '';
                    delete baseModal.dataset.prevZ;
                }
                this._outroContext = null;
            };
        }
        // Resumo Executivo (PDF)
        const btnResumo = document.getElementById('btn-export-resumo-executivo');
        if (btnResumo) {
            const newBtn = btnResumo.cloneNode(true);
            btnResumo.parentNode.replaceChild(newBtn, btnResumo);
            newBtn.addEventListener('click', async () => {
                await this.exportResumoExecutivoPDF();
            });
        }

        // Close Modal Buttons
        const closeBtns = document.querySelectorAll('.close-viagem-adubo-modal');
        closeBtns.forEach(btn => {
            btn.onclick = () => {
                const modal = document.getElementById('modal-viagem-adubo');
                if (modal) modal.style.display = 'none';
            };
        });

        // Add Bag Row (Main Form)
        const btnAddBag = document.getElementById('bag-add-btn');
        if (btnAddBag) {
            btnAddBag.onclick = () => this.addBagRow('');
        }
        
        // Add Bag Row (Modal)
        const btnAddBagModal = document.getElementById('modal-bag-add-btn');
        if (btnAddBagModal) {
            btnAddBagModal.onclick = () => this.addBagRow('modal-');
        }

        // Save Button (Main Form)
        const btnSave = document.getElementById('viagem-save-btn');
        if (btnSave) {
            // Remove previous listeners
            const newBtn = btnSave.cloneNode(true);
            btnSave.parentNode.replaceChild(newBtn, btnSave);
            
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Save button clicked (Main)!');
                this.saveViagemAdubo(false);
            });
        }

        // Save Button (Modal)
        // Handled via inline onclick in HTML to ensure reliability
        /*
        const btnSaveModal = document.getElementById('modal-viagem-save-btn');
        if (btnSaveModal) {
            const newBtn = btnSaveModal.cloneNode(true);
            btnSaveModal.parentNode.replaceChild(newBtn, btnSaveModal);
            newBtn.addEventListener('click', (e) => {
                 e.preventDefault();
                 this.saveViagemAdubo(true);
            });
        }
        */

        // Print Button
        const btnPrint = document.getElementById('modal-btn-print-viagem-adubo');
        if (btnPrint) {
            btnPrint.onclick = () => this.printViagemAdubo();
        }

        // Table Delegated Events (View/Edit/Delete)
        const tbody = document.getElementById('viagens-adubo-table-body');
        if (tbody) {
            // Replace with clone to ensure clean slate and no duplicates
            const newTbody = tbody.cloneNode(true);
            tbody.parentNode.replaceChild(newTbody, tbody);

            newTbody.addEventListener('click', (e) => {
                const target = e.target;
                console.log('Tbody click target:', target);
                
                if (target.classList.contains('btn-view-viagem-adubo') || target.closest('.btn-view-viagem-adubo')) {
                    const btn = target.classList.contains('btn-view-viagem-adubo') ? target : target.closest('.btn-view-viagem-adubo');
                    const id = btn.getAttribute('data-viagem-id');
                    console.log('View button clicked, id:', id);
                    this.openViagemAduboModal(id, 'view');
                } else if (target.classList.contains('btn-edit-viagem-adubo') || target.closest('.btn-edit-viagem-adubo')) {
                    const btn = target.classList.contains('btn-edit-viagem-adubo') ? target : target.closest('.btn-edit-viagem-adubo');
                    const id = btn.getAttribute('data-viagem-id');
                    console.log('Edit button clicked, id:', id);
                    this.openViagemAduboModal(id, 'edit');
                } else if (target.classList.contains('btn-delete-viagem-adubo') || target.closest('.btn-delete-viagem-adubo')) {
                    const btn = target.classList.contains('btn-delete-viagem-adubo') ? target : target.closest('.btn-delete-viagem-adubo');
                    const id = btn.getAttribute('data-viagem-id');
                    console.log('Delete button clicked, id:', id);
                    if (confirm('Tem certeza que deseja excluir esta viagem?')) {
                        this.deleteViagemAdubo(id);
                    }
                }
            });
        }

        // Bags Table Delegated Events (Delete Row / Toggle Devolvido)
        const bagsBody = document.getElementById('bags-table-body');
        if (bagsBody) {
            bagsBody.onclick = (e) => {
                const target = e.target;
                if (target.classList.contains('btn-delete-bag-row') || target.closest('.btn-delete-bag-row')) {
                    const btn = target.classList.contains('btn-delete-bag-row') ? target : target.closest('.btn-delete-bag-row');
                    const idx = parseInt(btn.getAttribute('data-idx'));
                    if (!isNaN(idx)) {
                        this.viagensAduboBagsDraft.splice(idx, 1);
                        this.renderBagsDraft();
                    }
                } else if (target.classList.contains('bag-devolvido-checkbox')) {
                    const idx = parseInt(target.getAttribute('data-idx'));
                    if (!isNaN(idx) && this.viagensAduboBagsDraft[idx]) {
                        this.viagensAduboBagsDraft[idx].devolvido = target.checked;
                        // No need to re-render full draft for a simple checkbox toggle unless we want to sync other tables
                    }
                }
            };
        }

        // Modal Bags Table Delegated Events (Delete Row / Toggle Devolvido)
        const modalBagsBody = document.getElementById('modal-bags-table-body');
        if (modalBagsBody) {
            modalBagsBody.onclick = (e) => {
                const target = e.target;
                if (target.classList.contains('btn-delete-bag-row') || target.closest('.btn-delete-bag-row')) {
                    const btn = target.classList.contains('btn-delete-bag-row') ? target : target.closest('.btn-delete-bag-row');
                    const idx = parseInt(btn.getAttribute('data-idx'));
                    if (!isNaN(idx)) {
                        this.viagensAduboBagsDraft.splice(idx, 1);
                        this.renderBagsDraft();
                    }
                } else if (target.classList.contains('bag-devolvido-checkbox')) {
                    const idx = parseInt(target.getAttribute('data-idx'));
                    if (!isNaN(idx) && this.viagensAduboBagsDraft[idx]) {
                        this.viagensAduboBagsDraft[idx].devolvido = target.checked;
                    }
                }
            };
        }

        // Summary Listeners (Adubo)
        const updateAduboSummary = () => this.checkViagemAduboLimit();
        const aduboInputs = ['modal-viagem-quantidade-total', 'modal-viagem-adubo-os'];
        aduboInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', updateAduboSummary);
                el.addEventListener('change', updateAduboSummary);
            }
        });
    }

    async openViagemAduboModal(id = null, mode = 'edit') {
        console.log('openViagemAduboModal chamado. ID:', id, 'Mode:', mode);
        const modal = document.getElementById('modal-viagem-adubo');
        if (!modal) {
            console.error('Modal modal-viagem-adubo NÃO encontrado!');
            return;
        }
        
        modal.dataset.editingId = id || ''; // Set editing ID for validation

        // Reset to Step 1
        if (this.goToModalStep) {
            this.goToModalStep('adubo', 1);
        }

        this.viagemAduboMode = mode;
        const isView = mode === 'view';
        if (isView) {
            modal.classList.add('view-mode');
        } else {
            modal.classList.remove('view-mode');
        }

        // Reset Fields (Using modal- prefix)
        const fields = [
            'modal-viagem-data', 'modal-viagem-adubo-os', 'modal-viagem-frente', 'modal-viagem-codigo-fazenda', 'modal-viagem-fazenda',
            'modal-viagem-origem', 'modal-viagem-destino', 'modal-viagem-produto', 'modal-viagem-quantidade-total',
            'modal-viagem-unidade', 'modal-viagem-caminhao', 'modal-viagem-carreta1', 'modal-viagem-carreta2',
            'modal-viagem-motorista', 'modal-viagem-documento-motorista', 'modal-viagem-transportadora',
            'modal-viagem-observacoes', 'modal-bag-identificacao', 'modal-bag-lacre', 'modal-bag-observacoes'
        ];
        fields.forEach(fid => {
            const el = document.getElementById(fid);
            if (el) {
                el.value = '';
                el.disabled = isView;
            }
        });

        // Hide/Show Buttons based on mode
        const btnSave = document.getElementById('btn-save-viagem-fix');
        if (btnSave) btnSave.style.display = isView ? 'none' : 'inline-block';
        // Now handled by .view-mode CSS and step logic

        const btnAddBag = document.getElementById('modal-bag-add-btn');
        if (btnAddBag) btnAddBag.style.display = isView ? 'none' : 'inline-block';

        // Reset Fazenda Select (repopulate if needed)
        await this.populateViagemAduboSelects(); 

        this.currentViagemAduboId = id;
        this.viagensAduboBagsDraft = [];

        if (id) {
            // Edit/View Mode
            const item = this.viagensAdubo.find(v => String(v.id) === String(id));
            if (!item) return;

            // Fill Fields
            if (document.getElementById('modal-viagem-data')) document.getElementById('modal-viagem-data').value = item.data || '';
            if (document.getElementById('modal-viagem-adubo-os')) document.getElementById('modal-viagem-adubo-os').value = item.numeroOS || item.numero_os || '';
            if (document.getElementById('modal-viagem-frente')) document.getElementById('modal-viagem-frente').value = item.frente || '';
            
            // Set Fazenda Select
            const fazendaSelect = document.getElementById('modal-viagem-fazenda');
            if (fazendaSelect && item.fazenda) {
                fazendaSelect.value = item.fazenda;
                // Trigger change to sync code
                if (fazendaSelect.onchange) fazendaSelect.onchange();
            }

            // If we have code but name didn't match (or vice versa), ensure consistency if possible
            // But syncing via onchange above should handle it if 'item.fazenda' matches an option.

            if (document.getElementById('modal-viagem-origem')) document.getElementById('modal-viagem-origem').value = item.origem || '';
            if (document.getElementById('modal-viagem-destino')) document.getElementById('modal-viagem-destino').value = item.destino || '';
            if (document.getElementById('modal-viagem-produto')) document.getElementById('modal-viagem-produto').value = item.produto || '';
            if (document.getElementById('modal-viagem-quantidade-total')) document.getElementById('modal-viagem-quantidade-total').value = item.quantidadeTotal || item.quantidade_total || '';
            if (document.getElementById('modal-viagem-unidade')) document.getElementById('modal-viagem-unidade').value = item.unidade || '';
            if (document.getElementById('modal-viagem-caminhao')) document.getElementById('modal-viagem-caminhao').value = item.caminhao || '';
            if (document.getElementById('modal-viagem-carreta1')) document.getElementById('modal-viagem-carreta1').value = item.carreta1 || '';
            if (document.getElementById('modal-viagem-carreta2')) document.getElementById('modal-viagem-carreta2').value = item.carreta2 || '';
            if (document.getElementById('modal-viagem-motorista')) document.getElementById('modal-viagem-motorista').value = item.motorista || '';
            if (document.getElementById('modal-viagem-documento-motorista')) document.getElementById('modal-viagem-documento-motorista').value = item.documentoMotorista || item.documento_motorista || '';
            if (document.getElementById('modal-viagem-transportadora')) document.getElementById('modal-viagem-transportadora').value = item.transportadora || '';
            if (document.getElementById('modal-viagem-observacoes')) document.getElementById('modal-viagem-observacoes').value = item.observacoes || '';

            // Bags
            this.viagensAduboBagsDraft = Array.isArray(item.bags) ? [...item.bags] : [];

            document.querySelector('#modal-viagem-adubo h3').textContent = isView ? 'Detalhes da Viagem' : 'Editar Viagem';
        } else {
            // New Mode
            document.querySelector('#modal-viagem-adubo h3').textContent = 'Nova Viagem (Adubo)';
            // Set today's date default (Local Time)
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const today = `${year}-${month}-${day}`;
            
            if (document.getElementById('modal-viagem-data')) document.getElementById('modal-viagem-data').value = today;
        }

        this.renderBagsDraft();

        // Control Print Button Visibility
        const btnPrint = document.getElementById('modal-btn-print-viagem-adubo');
        if (btnPrint) {
            btnPrint.style.display = id ? 'inline-block' : 'none';
        }

        this.checkViagemAduboLimit(); // Update Summary
        console.log('Exibindo modal modal-viagem-adubo agora.');
        

        

        // FORCE VISIBILITY - NUCLEAR OPTION
        modal.style.display = 'flex'; // Must be flex to center
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw'; // Viewport width
        modal.style.height = '100vh'; // Viewport height
        modal.style.zIndex = '10500';
        modal.style.opacity = '1';
        modal.style.visibility = 'visible';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)'; // Force semi-transparent background
        modal.style.backdropFilter = 'blur(2px)'; // Restore visual style

        // Override CSS classes potentially hiding it
        modal.classList.add('force-visible');
        
        // Force content visibility
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.display = 'flex';
            modalContent.style.flexDirection = 'column';
            modalContent.style.opacity = '1';
            modalContent.style.visibility = 'visible';
            modalContent.style.zIndex = '10501';
            modalContent.style.animation = 'none'; // Disable animation to prevent opacity: 0 lock
            modalContent.style.margin = 'auto'; // Ensure centering
            modalContent.style.position = 'relative'; // Ensure z-index works
        } else {
            console.error('CRITICAL: .modal-content NOT FOUND inside modal-viagem-adubo');
        }

        // Debug visibility
        setTimeout(() => {
            const rect = modal.getBoundingClientRect();
            const computed = window.getComputedStyle(modal);
            console.log('Modal Viagem Adubo DIAGNOSTIC:', {
                rect: {
                    width: rect.width,
                    height: rect.height,
                    top: rect.top,
                    left: rect.left
                },
                styles: {
                    display: computed.display,
                    opacity: computed.opacity,
                    visibility: computed.visibility,
                    zIndex: computed.zIndex,
                    position: computed.position
                },
                contentRect: modalContent ? modalContent.getBoundingClientRect() : 'NO CONTENT',
                hasContent: !!modalContent
            });
            
            // Fallback: If height is 0, append to body
            if (rect.height === 0 || rect.width === 0) {
                 console.warn('Modal has 0 dimensions! Moving to body end...');
                 document.body.appendChild(modal);
            }
        }, 100);
    }

    async populateViagemAduboSelects() {
        try {
            // 1. Populate Fazendas (Always all fazendas)
            await this.populateFazendaSelect();

            // [NEW] Populate OS Select
            const osRes = await this.api.getOSList();
            if (osRes.success) {
                this.osListCache = osRes.data || [];
                const osSelect = document.getElementById('modal-viagem-adubo-os');
                if (osSelect) {
                    const currentOS = osSelect.getAttribute('data-value') || osSelect.value;
                    const activeOS = this.osListCache.filter(os => os.status !== 'Cancelada');
                    // Sort desc by number
                    activeOS.sort((a, b) => parseInt(b.numero || 0) - parseInt(a.numero || 0));
                    
                    osSelect.innerHTML = '<option value="">Selecione a OS</option>' + 
                        activeOS.map(os => `<option value="${os.numero}">${os.numero} - ${os.fazenda || 'Sem Fazenda'}</option>`).join('');
                    
                    if (currentOS) osSelect.value = currentOS;
                }
            }

            // 2. Populate Frentes (From Plantio Data)
            let plantioData = [];
            if (this.plantioDiarioData && this.plantioDiarioData.length > 0) {
                plantioData = this.plantioDiarioData;
            } else {
                const res = await this.api.getPlantioDiario();
                if (res.success) plantioData = res.data;
            }

            if (plantioData && plantioData.length > 0) {
                const frentes = new Set();
                plantioData.forEach(p => {
                    const fs = p.frentes || [];
                    const list = Array.isArray(fs) ? fs : (fs ? [fs] : []);
                    list.forEach(f => {
                        if (f.frente) frentes.add(f.frente);
                    });
                });

                const frentesHtml = '<option value="">Selecione</option>' + 
                    Array.from(frentes).sort().map(f => `<option value="${f}">${f}</option>`).join('');
                
                const populateSelect = (id, html, current) => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.innerHTML = html;
                        if (current) el.value = current;
                    }
                };

                populateSelect('viagem-frente', frentesHtml, document.getElementById('viagem-frente')?.value);
                populateSelect('modal-viagem-frente', frentesHtml, document.getElementById('modal-viagem-frente')?.value);
            }
            
            // 3. Setup Sync Listeners
            this.setupViagemAduboSelectListeners();

        } catch (e) {
            console.error('Error populating Viagem Adubo selects:', e);
            // Fallback
            this.populateFazendaSelect();
        }
    }

    setupViagemAduboSelectListeners() {
        // [NEW] OS Listener
        const osSelect = document.getElementById('modal-viagem-adubo-os');
        const qtdInput = document.getElementById('modal-viagem-quantidade-total');

        if (qtdInput) {
            qtdInput.addEventListener('input', () => this.checkViagemAduboLimit());
        }

        if (osSelect) {
            osSelect.onchange = () => {
                const osNum = osSelect.value;
                this.checkViagemAduboLimit();
                
                if (!osNum || !this.osListCache) return;
                
                const os = this.osListCache.find(o => String(o.numero) === String(osNum));
                if (os) {
                    // Auto-fill fields
                    if (os.frente) {
                        const elFrente = document.getElementById('modal-viagem-frente');
                        if (elFrente) elFrente.value = os.frente;
                    }
                    if (os.fazenda) {
                         const elFazenda = document.getElementById('modal-viagem-fazenda');
                         const elCodigo = document.getElementById('modal-viagem-codigo-fazenda');
                         
                         if (elFazenda) {
                             const target = String(os.fazenda).trim().toUpperCase();
                             let bestMatchIndex = -1;
                             
                             // 1. Try Exact/Trimmed Match
                             for (let i = 0; i < elFazenda.options.length; i++) {
                                 const optVal = String(elFazenda.options[i].value || '').trim().toUpperCase();
                                 if (optVal === target) {
                                     bestMatchIndex = i;
                                     break;
                                 }
                             }
                             
                             // 2. If not found, try contains (fuzzy)
                             if (bestMatchIndex === -1) {
                                 for (let i = 0; i < elFazenda.options.length; i++) {
                                     const optVal = String(elFazenda.options[i].value || '').trim().toUpperCase();
                                     if (optVal && (optVal.includes(target) || target.includes(optVal))) {
                                         bestMatchIndex = i;
                                         break; // Take first match
                                     }
                                     const optText = String(elFazenda.options[i].text || '').trim().toUpperCase();
                                     if (optText && (optText.includes(target) || target.includes(optText))) {
                                         bestMatchIndex = i;
                                         break;
                                     }
                                 }
                             }

                             if (bestMatchIndex > 0) {
                                 elFazenda.selectedIndex = bestMatchIndex;
                                 
                                 // Manually sync code
                                 if (elCodigo) {
                                     const opt = elFazenda.options[bestMatchIndex];
                                     const codigo = opt.getAttribute('data-codigo');
                                     if (codigo) elCodigo.value = codigo;
                                 }
                                 
                                 // Dispatch change
                                 const event = new Event('change');
                                 elFazenda.dispatchEvent(event);
                             } else {
                                 // Fallback: Try to find by Code using Farm Name in data-fazenda
                                 if (elCodigo) {
                                      for (let i = 0; i < elCodigo.options.length; i++) {
                                         const optFazendaName = String(elCodigo.options[i].getAttribute('data-fazenda') || '').trim().toUpperCase();
                                         if (optFazendaName && (optFazendaName === target || optFazendaName.includes(target) || target.includes(optFazendaName))) {
                                              elCodigo.selectedIndex = i;
                                              
                                              // Now sync back to Fazenda
                                              const correctFazendaName = elCodigo.options[i].getAttribute('data-fazenda');
                                              if (correctFazendaName) {
                                                  elFazenda.value = correctFazendaName;
                                              }
                                              break;
                                         }
                                     }
                                 }
                             }
                         }
                    }
                    
                    // Populate Products from OS
                    if (os.produtos && Array.isArray(os.produtos) && os.produtos.length > 0) {
                        const prodSelect = document.getElementById('modal-viagem-produto');
                        if (prodSelect) {
                            const baseOpts = os.produtos.map(p => `<option value="${p.produto}">${p.produto}</option>`).join('');
                            prodSelect.innerHTML = '<option value="">Selecione</option>' + baseOpts + '<option value="Outro">Outro</option>';
                        }
                    }
                }
            };
        }

        const setupSync = (fazendaId, codigoId) => {
            const selFazenda = document.getElementById(fazendaId);
            const selCodigo = document.getElementById(codigoId);
            
            if (selFazenda && selCodigo) {
                selFazenda.onchange = () => {
                    const opt = selFazenda.options[selFazenda.selectedIndex];
                    const codigo = opt ? opt.getAttribute('data-codigo') : '';
                    if (codigo) selCodigo.value = codigo;
                };
                
                selCodigo.onchange = () => {
                    const opt = selCodigo.options[selCodigo.selectedIndex];
                    const fazenda = opt ? opt.getAttribute('data-fazenda') : '';
                    if (fazenda) selFazenda.value = fazenda;
                };
            }
        };

        setupSync('viagem-fazenda', 'viagem-codigo-fazenda');
        setupSync('modal-viagem-fazenda', 'modal-viagem-codigo-fazenda');
    }

    checkViagemAduboLimit() {
        const osNum = document.getElementById('modal-viagem-adubo-os')?.value;
        const qtdInput = document.getElementById('modal-viagem-quantidade-total');
        
        // Update Summary Total (Current Input)
        const summaryTotal = document.getElementById('summary-adubo-total');
        const currentQtd = qtdInput ? (parseFloat(qtdInput.value) || 0) : 0;
        
        if (summaryTotal) {
             summaryTotal.textContent = this.ui.formatNumber(currentQtd, 3);
        }
        
        // Elements for Meta/Realizado/Restante
        const summaryMeta = document.getElementById('summary-adubo-meta');
        const summaryRealizado = document.getElementById('summary-adubo-realizado');
        const summaryRestante = document.getElementById('summary-adubo-restante');

        if (!osNum) {
            if(summaryMeta) summaryMeta.textContent = '0.000';
            if(summaryRealizado) summaryRealizado.textContent = '0.000';
            if(summaryRestante) summaryRestante.textContent = '0.000';
            return;
        }
        
        // Find OS
        const os = this.osListCache ? this.osListCache.find(o => String(o.numero) === String(osNum)) : null;
        
        // Determine Target Quantity (Meta)
        let target = 0;
        if (os) {
            if (os.quantidade != null) {
                target = parseFloat(os.quantidade);
            } else if (os.doseRecomendada != null && os.areaTotal != null) {
                target = parseFloat(os.doseRecomendada) * parseFloat(os.areaTotal);
            } else if (os.dose != null && os.areaTotal != null) {
                target = parseFloat(os.dose) * parseFloat(os.areaTotal);
            }
        }
        
        // Calculate Realizado (Accumulated + Current)
        const editingId = document.getElementById('modal-viagem-adubo').dataset.editingId;
        const existingSum = (this.viagensAdubo || [])
            .filter(v => String(v.numero_os) === String(osNum) && String(v.id) !== String(editingId))
            .reduce((sum, v) => sum + (parseFloat(v.quantidade_total) || 0), 0);
            
        const totalRealizado = existingSum + currentQtd;
        const restante = Math.max(0, target - totalRealizado);

        // Update UI
        if (summaryMeta) summaryMeta.textContent = this.ui.formatNumber(target, 3);
        if (summaryRealizado) {
            summaryRealizado.textContent = this.ui.formatNumber(totalRealizado, 3);
            summaryRealizado.style.color = totalRealizado > target ? 'var(--error)' : 'var(--primary)';
        }
        if (summaryRestante) summaryRestante.textContent = this.ui.formatNumber(restante, 3);
        
        // Validation / Warnings
        if (target > 0 && totalRealizado > target) {
            // Check if notification already shown to avoid spam
            if (!this._lastAlertOS || this._lastAlertOS !== osNum || this._lastAlertTotal !== totalRealizado) {
                 this.ui.showNotification(`Atenção: Quantidade total (${this.ui.formatNumber(totalRealizado)}) excede o previsto na OS (${this.ui.formatNumber(target)})!`, 'warning');
                 this._lastAlertOS = osNum;
                 this._lastAlertTotal = totalRealizado;
            }
            if (qtdInput) {
                qtdInput.classList.add('input-warning');
                qtdInput.title = `Total Previsto: ${this.ui.formatNumber(target)} | Total Acumulado: ${this.ui.formatNumber(totalRealizado)}`;
            }
        } else {
            if (qtdInput) {
                qtdInput.classList.remove('input-warning');
                qtdInput.title = "";
            }
            this._lastAlertOS = null;
        }
    }

    // --- Helper for Confirmation Modal ---
    showConfirmationModal(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmation-modal');
            const titleEl = document.getElementById('confirmation-modal-title');
            const msgEl = document.getElementById('confirmation-modal-message');
            const btnYes = document.getElementById('btn-confirm-yes');
            const btnNo = document.getElementById('btn-confirm-no');

            if (!modal || !titleEl || !msgEl || !btnYes || !btnNo) {
                console.error('Confirmation modal elements not found');
                // Fallback to native confirm if custom modal fails
                resolve(confirm(`${title}\n\n${message}`));
                return;
            }

            titleEl.textContent = title;
            msgEl.textContent = message;
            modal.style.display = 'block';

            // Clone buttons to remove old listeners
            const newBtnYes = btnYes.cloneNode(true);
            const newBtnNo = btnNo.cloneNode(true);
            btnYes.parentNode.replaceChild(newBtnYes, btnYes);
            btnNo.parentNode.replaceChild(newBtnNo, btnNo);

            newBtnYes.addEventListener('click', () => {
                modal.style.display = 'none';
                resolve(true);
            });

            newBtnNo.addEventListener('click', () => {
                modal.style.display = 'none';
                resolve(false);
            });
            
            // Optional: Close on outside click (treat as cancel)
            const clickOutside = (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                    modal.removeEventListener('click', clickOutside);
                    resolve(false);
                }
            };
            // Remove previous outside click listener if any (hard to track without reference, 
            // but cloning buttons handles the buttons. The modal itself might accumulate listeners 
            // if we don't be careful. A simple way is to use a one-time listener or named function.
            // For now, let's keep it simple.
            modal.onclick = (e) => {
                 if (e.target === modal) {
                     modal.style.display = 'none';
                     resolve(false);
                 }
            };
        });
    }

    checkTransporteCompostoLimit() {
        const targetInput = document.getElementById('composto-quantidade');
        if (!targetInput) return;
        
        const target = parseFloat(targetInput.value) || 0;
        if (target <= 0) return;
        
        const currentSum = (this.compostoDiarioDraft || []).reduce((sum, d) => sum + (parseFloat(d.quantidade || d.qtd) || 0), 0);
        
        // Create or find feedback element (or just use notification)
        // Using notification is safer as I don't know the exact HTML structure to inject feedback
        
        if (currentSum > target) {
             // Avoid spamming if already showing
             if (!this._lastAlertCompostoTotal || this._lastAlertCompostoTotal !== currentSum) {
                 this.ui.showNotification(`Atenção: Quantidade lançada (${this.ui.formatNumber(currentSum)}) excede o previsto (${this.ui.formatNumber(target)})!`, 'warning');
                 this._lastAlertCompostoTotal = currentSum;
             }
             targetInput.classList.add('input-warning');
        } else {
             targetInput.classList.remove('input-warning');
             this._lastAlertCompostoTotal = null;
        }
    }

    async populateFazendaSelect() {
        const ids = ['viagem-fazenda', 'modal-viagem-fazenda'];
        const codeIds = ['viagem-codigo-fazenda', 'modal-viagem-codigo-fazenda'];
        
        const targets = ids.map(id => document.getElementById(id)).filter(el => el);
        const codeTargets = codeIds.map(id => document.getElementById(id)).filter(el => el);
        
        if (targets.length === 0 && codeTargets.length === 0) return;
        
        try {
             const res = await this.api.getFazendas();
             if (res.success) {
                 const fazendas = res.data || [];
                 // Sort alphabetically
                 fazendas.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
                 
                 const html = '<option value="">Selecione a Fazenda</option>' + 
                     fazendas.map(f => `<option value="${f.nome}" data-codigo="${f.codigo}">${f.nome}</option>`).join('');
                     
                 const codeHtml = '<option value="">Cód</option>' + 
                     fazendas.map(f => `<option value="${f.codigo}" data-fazenda="${f.nome}">${f.codigo}</option>`).join('');

                 targets.forEach(el => {
                     const current = el.value;
                     el.innerHTML = html;
                     if (current) el.value = current;
                 });
                 
                 codeTargets.forEach(el => {
                     const current = el.value;
                     el.innerHTML = codeHtml;
                     if (current) el.value = current;
                 });
             }
         } catch (e) {
             console.error('Erro ao carregar fazendas para select', e);
             if (this.ui) this.ui.showNotification('Erro ao carregar lista de fazendas. Verifique a conexão.', 'error');
         }
    }

    async saveViagemAdubo(isModal = false) {
        // UI Feedback for Modal Button
        let btnSaveModal = null;
        let originalText = '';
        if (isModal) {
            btnSaveModal = document.getElementById('btn-save-viagem-fix');
            if (btnSaveModal) {
                originalText = btnSaveModal.innerText;
                btnSaveModal.innerText = 'Processando...';
                btnSaveModal.disabled = true;
            }
        }

        try {
            const prefix = isModal ? 'modal-' : '';
            const getVal = (id) => {
                const el = document.getElementById(prefix + id);
                return el ? el.value : '';
            };

            const transportType = this.viagemAduboTransportType || 'adubo';

            const data = getVal('viagem-data');
            const fazenda = getVal('viagem-fazenda');
            let produto = getVal('viagem-produto');
            let unidade = getVal('viagem-unidade');
            
            if (transportType === 'composto') {
                produto = 'COMPOSTO';
                unidade = 't';
            }

            const qtdStr = getVal('viagem-quantidade-total');
            const quantidadeTotalNum = parseFloat((qtdStr || '').toString().replace(',', '.'));
            
            // Reset errors
            ['viagem-data', 'viagem-fazenda', 'viagem-produto', 'viagem-quantidade-total'].forEach(id => {
                const el = document.getElementById(prefix + id);
                if (el) el.classList.remove('input-error');
            });

            if (!data || !fazenda || !produto || isNaN(quantidadeTotalNum)) {
                let missing = [];
                if (!data) { missing.push('Data'); document.getElementById(prefix + 'viagem-data')?.classList.add('input-error'); }
                if (!fazenda) { missing.push('Fazenda'); document.getElementById(prefix + 'viagem-fazenda')?.classList.add('input-error'); }
                if (!produto) { missing.push('Produto'); document.getElementById(prefix + 'viagem-produto')?.classList.add('input-error'); }
                if (isNaN(quantidadeTotalNum)) { missing.push('Quantidade'); document.getElementById(prefix + 'viagem-quantidade-total')?.classList.add('input-error'); }
                
                if (this.ui && this.ui.showNotification) {
                    this.ui.showNotification(`Preencha os campos obrigatórios: ${missing.join(', ')}`, 'warning');
                }
                return;
            }
     
            const payload = {
                transportType: transportType,
                data: data,
                numeroOS: getVal('viagem-adubo-os'),
                frente: getVal('viagem-frente'),
                fazenda: fazenda,
                origem: getVal('viagem-origem'),
                destino: getVal('viagem-destino'),
                produto: produto,
                quantidadeTotal: quantidadeTotalNum,
                unidade: unidade,
                caminhao: getVal('viagem-caminhao'),
                carreta1: getVal('viagem-carreta1'),
                carreta2: getVal('viagem-carreta2'),
                motorista: getVal('viagem-motorista'),
                documentoMotorista: getVal('viagem-documento-motorista'),
                transportadora: getVal('viagem-transportadora'),
                observacoes: getVal('viagem-observacoes'),
                bags: (transportType === 'adubo' && Array.isArray(this.viagensAduboBagsDraft)) ? this.viagensAduboBagsDraft.slice() : [],
                dataAberturaOS: getVal('viagem-abertura-os'),
                dataFechamentoOS: getVal('viagem-fechamento-os'),
                totalPrevisto: getVal('viagem-previsto') ? parseFloat(getVal('viagem-previsto')) : null,
                totalRealizado: getVal('viagem-realizado') ? parseFloat(getVal('viagem-realizado')) : null
            };

            if (this.customProdutoInfo && this.customProdutoInfo.nome) {
                if (!payload.observacoes || !payload.observacoes.toLowerCase().includes('justificativa:')) {
                    if (this.ui) this.ui.showNotification('Informe justificativa para produto “Outro”.', 'warning');
                    return;
                }
            }

            // --- Verificação de Limite da OS (Alerta Inteligente) ---
            if (payload.numeroOS && this.osListCache) {
                const os = this.osListCache.find(o => String(o.numero) === String(payload.numeroOS));
                if (os) {
                    let predicted = parseFloat(os.quantidade || 0);
                    if (!predicted && os.area_total && os.dose_recomendada) {
                        predicted = parseFloat(os.area_total) * parseFloat(os.dose_recomendada);
                    }
                    
                    if (predicted > 0) {
                        const trips = this.viagensAdubo || [];
                        const currentId = this.currentViagemAduboId;
                        
                        const existingTotal = trips
                            .filter(t => String(t.numero_os) === String(payload.numeroOS) && t.id !== currentId)
                            .reduce((sum, t) => sum + (parseFloat(t.quantidade_total) || 0), 0);
                            
                        const newTotal = existingTotal + payload.quantidadeTotal;
                        
                        if (newTotal > predicted) {
                            const msg = `ATENÇÃO: A quantidade total acumulada (${this.ui.formatNumber(newTotal, 3)}) excederá o valor previsto na OS (${this.ui.formatNumber(predicted, 3)}).\n\nPrevisto: ${this.ui.formatNumber(predicted, 3)}\nAcumulado Anterior: ${this.ui.formatNumber(existingTotal, 3)}\nNovo Lançamento: ${this.ui.formatNumber(payload.quantidadeTotal, 3)}\n\nDeseja continuar?`;
                            if (!confirm(msg)) return;
                        }
                    }
                }
            }
            // --------------------------------------------------------
            
            let res;
            if (this.currentViagemAduboId) {
                res = await this.api.updateViagemAdubo(this.currentViagemAduboId, payload);
            } else {
                res = await this.api.addViagemAdubo(payload);
            }

            if (res.success) {
                if (this.ui) this.ui.showNotification('Viagem salva com sucesso!', 'success');
                // Update Stock
                if (payload.frente) {
                    try {
                        if (typeof this.updateEstoqueFromOS === 'function') {
                            await this.updateEstoqueFromOS(payload.frente);
                        }
                        if (typeof this.loadEstoqueAndRender === 'function') {
                            await this.loadEstoqueAndRender();
                        }
                    } catch (stockErr) {
                        console.error('Erro ao atualizar estoque:', stockErr);
                    }
                }

                const modal = document.getElementById('modal-viagem-adubo');
                if (modal) modal.style.display = 'none';
                await this.loadViagensAdubo();
                await this.loadTransporteComposto(); // Sync Parent OS List
                
                // Clear main form if saved from main form
                if (!isModal) {
                    const ids = ['viagem-data','viagem-frente','viagem-fazenda','viagem-origem','viagem-destino','viagem-produto','viagem-quantidade-total','viagem-unidade','viagem-caminhao','viagem-carreta1','viagem-carreta2','viagem-motorista','viagem-documento-motorista','viagem-transportadora','viagem-observacoes','viagem-os','viagem-abertura-os','viagem-fechamento-os','viagem-previsto','viagem-realizado'];
                    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
                }
            } else {
                throw new Error(res.message);
            }
        } catch (error) {
            console.error('Error saving Viagem Adubo:', error);
            if (this.ui) this.ui.showNotification('Erro ao salvar: ' + error.message, 'error');
        } finally {
            if (btnSaveModal) {
                btnSaveModal.innerText = originalText;
                btnSaveModal.disabled = false;
            }
        }
    }

    async deleteViagemAdubo(id) {

        try {
            const res = await this.api.deleteViagemAdubo(id);
            if (res.success) {
                if (this.ui) this.ui.showNotification('Viagem excluída com sucesso!', 'success');
                await this.loadViagensAdubo();
                await this.loadTransporteComposto();
            } else {
                throw new Error(res.message);
            }
        } catch (error) {
            if (this.ui) this.ui.showNotification('Erro ao excluir: ' + error.message, 'error');
        }
    }

    printViagemAdubo() {
        if (!this.currentViagemAduboId && this.viagensAduboBagsDraft.length === 0) {
            // Se for novo e não tiver dados, alertar
            if (this.ui) this.ui.showNotification('Salve a viagem antes de imprimir ou preencha os dados.', 'warning');
            // Allow printing drafts? Yes.
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // Helper to get value (Always from modal since print is only in modal)
        const getVal = (id) => {
            const el = document.getElementById('modal-' + id);
            return el ? (el.value || '-') : '-';
        };

        // Helper for Centered Text
        const centerText = (text, y) => {
            const textWidth = doc.getStringUnitWidth(text) * doc.internal.getFontSize() / doc.internal.scaleFactor;
            const x = (pageWidth - textWidth) / 2;
            doc.text(text, x, y);
        };

        // Helper to format date to BR
        const formatDateBR = (d) => {
            if (!d) return '';
            if (d.includes('/')) return d;
            const parts = d.split('-');
            if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
            return d;
        };

        const data = formatDateBR(getVal('viagem-data'));
        const fazenda = getVal('viagem-fazenda');

        // === HEADER / CAPA ===
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        centerText("Detalhes da Viagem - Adubo", 20);
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        centerText(`${fazenda} - ${data}`, 28);
        
        doc.setFontSize(10);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 14, 35, { align: 'right' });

        doc.setLineWidth(0.5);
        doc.line(14, 38, pageWidth - 14, 38);

        let y = 50;

        // === 1. VISÃO GERAL ===
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text("1. Visão Geral", 14, y);
        y += 10;

        // Box background (Gray Box)
        doc.setDrawColor(200);
        doc.setFillColor(245, 247, 250);
        doc.rect(14, y, pageWidth - 28, 45, 'FD');

        const produto = getVal('viagem-produto');
        const qtd = (getVal('viagem-quantidade-total') === '-' ? '0' : getVal('viagem-quantidade-total')) + ' ' + (getVal('viagem-unidade') === '-' ? '' : getVal('viagem-unidade'));
        const frente = getVal('viagem-frente');
        const motorista = getVal('viagem-motorista');

        doc.setFontSize(12);
        doc.setTextColor(0,0,0);
        doc.setFont(undefined, 'bold');
        doc.text(`Produto: ${produto}`, 20, y + 10);
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Quantidade: ${qtd}`, 20, y + 18);
        doc.text(`Frente: ${frente}`, 20, y + 26);
        doc.text(`Motorista: ${motorista}`, 20, y + 34);

        y += 55;

        // === 2. DETALHES DO TRANSPORTE ===
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text("2. Detalhes do Transporte", 14, y);
        y += 10;

        doc.setFontSize(10);
        
        const details = [
            ['Origem', getVal('viagem-origem')],
            ['Destino', getVal('viagem-destino')],
            ['Caminhão', getVal('viagem-caminhao')],
            ['Carreta 1', getVal('viagem-carreta1')],
            ['Carreta 2', getVal('viagem-carreta2')],
            ['Doc. Motorista', getVal('viagem-documento-motorista')],
            ['Transportadora', getVal('viagem-transportadora')],
            ['Observações', getVal('viagem-observacoes')]
        ];

        details.forEach((item, i) => {
            const label = item[0] + ':';
            const value = item[1];
            
            // Check page break
            if (y > 270) {
                doc.addPage();
                y = 20;
            }

            // Left col
            if (i % 2 === 0) {
                 doc.setFont(undefined, 'bold');
                 doc.text(label, 14, y);
                 doc.setFont(undefined, 'normal');
                 doc.text(value, 50, y);
            } else {
                 // Right col
                 doc.setFont(undefined, 'bold');
                 doc.text(label, 105, y);
                 doc.setFont(undefined, 'normal');
                 doc.text(value, 145, y);
                 y += 8;
            }
        });
        if (details.length % 2 !== 0) y += 8;

        // === 3. BAGS ===
        if (this.viagensAduboBagsDraft && this.viagensAduboBagsDraft.length > 0) {
            y += 10;
            if (y > 250) {
                doc.addPage();
                y = 20;
            }
            
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text("3. Bags", 14, y);
            y += 5;
            
            const bagsData = this.viagensAduboBagsDraft.map(b => [b.identificacao, b.lacre, b.observacoes]);
            doc.autoTable({
                startY: y,
                head: [['Identificação', 'Lacre', 'Observações']],
                body: bagsData,
                theme: 'grid',
                headStyles: { fillColor: [46, 125, 50], textColor: 255 },
                styles: { fontSize: 10, cellPadding: 3 }
            });
        }

        doc.save(`viagem_adubo_${data}.pdf`);
    }



 
    sortViagensAdubo(key) {
        if (!this.viagensAduboSort) this.viagensAduboSort = { key: null, dir: 'asc' };
        
        if (this.viagensAduboSort.key === key) {
            this.viagensAduboSort.dir = this.viagensAduboSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            this.viagensAduboSort.key = key;
            this.viagensAduboSort.dir = 'asc';
        }
        this.renderViagensAdubo();
    }

    renderViagensAdubo() {
        const tbody = document.getElementById('viagens-adubo-table-body');
        const theadTr = document.querySelector('#viagens-adubo-table thead tr');
        if (!tbody) return;
        
        const filters = this.viagensAduboFilters || {};
        let data = Array.isArray(this.viagensAdubo) ? [...this.viagensAdubo] : [];
        const norm = (v) => (v == null ? '' : String(v)).toLowerCase();
        
        // Filter by transport type (state variable)
        const currentType = this.viagemAduboTransportType || 'adubo';
        data = data.filter(v => (v.transportType || 'adubo') === currentType);

        // Update Headers (Preserving Sort Clicks)
        if (theadTr) {
            if (currentType === 'composto') {
                // Legacy Composto View within Adubo Tab (Should be deprecated but keeping for safety)
                theadTr.innerHTML = `
                    <th>Data</th>
                    <th>Fazenda</th>
                    <th>OS</th>
                    <th>Previsto (t)</th>
                    <th>Realizado (t)</th>
                    <th>Diferença (t)</th>
                    <th>Viagem (t)</th>
                    <th>Ações</th>
                `;
            } else {
                // Standard Adubo View - Sync with index.html onclicks
                theadTr.innerHTML = `
                    <th onclick="app.sortViagensAdubo('data')" style="cursor: pointer;">Data</th>
                    <th onclick="app.sortViagensAdubo('frente')" style="cursor: pointer;">Frente</th>
                    <th onclick="app.sortViagensAdubo('fazenda')" style="cursor: pointer;">Fazenda</th>
                    <th onclick="app.sortViagensAdubo('produto')" style="cursor: pointer;">Produto</th>
                    <th onclick="app.sortViagensAdubo('quantidadeTotal')" style="cursor: pointer;">Quantidade</th>
                    <th onclick="app.sortViagensAdubo('unidade')" style="cursor: pointer;">Unidade</th>
                    <th onclick="app.sortViagensAdubo('motorista')" style="cursor: pointer;">Motorista</th>
                    <th onclick="app.sortViagensAdubo('caminhao')" style="cursor: pointer;">Caminhão</th>
                    <th>Ações</th>
                `;
            }
        }
        
        if (filters.data) {
            data = data.filter(v => (v.data || '').includes(filters.data));
        }
        if (filters.fazenda) {
            const f = filters.fazenda.toLowerCase();
            data = data.filter(v => norm(v.fazenda).includes(f));
        }
        if (filters.frente) {
            const f = filters.frente.toLowerCase();
            data = data.filter(v => norm(v.frente).includes(f));
        }
        if (filters.motorista) {
            const f = filters.motorista.toLowerCase();
            data = data.filter(v => norm(v.motorista).includes(f));
        }
        if (filters.caminhao) {
            const f = filters.caminhao.toLowerCase();
            data = data.filter(v => norm(v.caminhao).includes(f));
        }
        if (filters.lacre) {
            const f = filters.lacre.toLowerCase();
            data = data.filter(v => Array.isArray(v.bags) && v.bags.some(b => norm(b.lacre).includes(f)));
        }

        // Sort Logic
        if (this.viagensAduboSort && this.viagensAduboSort.key) {
            const { key, dir } = this.viagensAduboSort;
            data.sort((a, b) => {
                let va = a[key];
                let vb = b[key];
                
                // Map complex keys if needed
                if (key === 'quantidadeTotal') {
                     va = va != null ? va : (a.quantidade_total != null ? a.quantidade_total : 0);
                     vb = vb != null ? vb : (b.quantidade_total != null ? b.quantidade_total : 0);
                }

                // Numeric check
                // Remove format chars if string number
                const parse = (val) => {
                    if (typeof val === 'number') return val;
                    if (!val) return 0;
                    return parseFloat(String(val).replace(/[^\d.-]/g, ''));
                };

                const na = parse(va);
                const nb = parse(vb);
                
                // Check if both are valid numbers (and not just empty strings converted to 0 if original was text)
                // Heuristic: if key is qty/amount, treat as number. Else try string.
                const isNumericField = ['quantidadeTotal', 'quantidade_total', 'quantidade'].includes(key);
                
                if (isNumericField || (!isNaN(na) && !isNaN(nb) && typeof va !== 'string')) {
                    return dir === 'asc' ? na - nb : nb - na;
                }

                va = String(va || '').toLowerCase();
                vb = String(vb || '').toLowerCase();
                if (va < vb) return dir === 'asc' ? -1 : 1;
                if (va > vb) return dir === 'asc' ? 1 : -1;
                return 0;
            });
        }

        if (!data.length) {
            const colspan = currentType === 'composto' ? 8 : 9;
            tbody.innerHTML = `
                <tr>
                    <td colspan="${colspan}" class="loading">Nenhuma viagem encontrada</td>
                </tr>
            `;
            return;
        }
        tbody.innerHTML = data.map(v => {
            const q = v.quantidadeTotal != null ? v.quantidadeTotal : (v.quantidade_total != null ? v.quantidade_total : 0);
            const qtd = typeof q === 'number' ? q : parseFloat(q) || 0;
            
            if (currentType === 'composto') {
                 const previsto = parseFloat(v.totalPrevisto || v.total_previsto || 0);
                 const realizado = parseFloat(v.totalRealizado || v.total_realizado || 0);
                 const diff = realizado - previsto;
                 const diffSign = diff > 0 ? '+' : '';

                 return `
                    <tr>
                        <td>${v.data}</td>
                        <td>${v.fazenda || ''}</td>
                        <td>${v.numeroOS || v.numero_os || ''}</td>
                        <td>${this.ui.formatNumber(previsto, 3)}</td>
                        <td>${this.ui.formatNumber(realizado, 3)}</td>
                        <td style="color: ${diff > 0 ? 'green' : (diff < 0 ? 'red' : 'inherit')}">${diffSign}${this.ui.formatNumber(diff, 3)}</td>
                        <td>${this.ui.formatNumber(qtd, 3)}</td>
                        <td>
                            <button class="btn btn-secondary btn-view-viagem-adubo" data-viagem-id="${v.id}">👁️</button>
                            <button class="btn btn-delete-viagem-adubo" data-viagem-id="${v.id}">🗑️</button>
                        </td>
                    </tr>
                 `;
            } else {
                return `
                    <tr>
                        <td>${this.ui.formatDateBR(v.data)}</td>
                        <td>${v.frente || ''}</td>
                        <td>${v.fazenda || ''}</td>
                        <td>${v.produto || ''}</td>
                        <td>${this.ui.formatNumber(qtd, 3)}</td>
                        <td>${v.unidade || ''}</td>
                        <td>${v.motorista || ''}</td>
                        <td>${v.caminhao || ''}</td>
                        <td style="white-space: nowrap;">
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-sm btn-secondary btn-view-viagem-adubo" data-viagem-id="${v.id}" title="Ver Detalhes">Detalhes</button>
                                <button class="btn btn-sm btn-secondary btn-edit-viagem-adubo" data-viagem-id="${v.id}" title="Editar">✏️</button>
                                <button class="btn btn-sm btn-danger btn-delete-viagem-adubo" data-viagem-id="${v.id}" title="Excluir">🗑️</button>
                            </div>
                        </td>
                    </tr>
                `;
            }
        }).join('');
    }

    applyViagensFilters() {
        const dataEl = document.getElementById('viagens-data-filter');
        const fazendaEl = document.getElementById('viagens-fazenda-filter');
        const frenteEl = document.getElementById('viagens-frente-filter');
        const motoristaEl = document.getElementById('viagens-motorista-filter');
        const caminhaoEl = document.getElementById('viagens-caminhao-filter');
        const lacreEl = document.getElementById('viagens-lacre-filter');
        this.viagensAduboFilters = {
            data: dataEl ? dataEl.value : '',
            fazenda: fazendaEl ? fazendaEl.value : '',
            frente: frenteEl ? frenteEl.value : '',
            motorista: motoristaEl ? motoristaEl.value : '',
            caminhao: caminhaoEl ? caminhaoEl.value : '',
            lacre: lacreEl ? lacreEl.value : ''
        };
        this.renderViagensAdubo();
    }

    resetViagensFilters() {
        const ids = [
            'viagens-data-filter',
            'viagens-fazenda-filter',
            'viagens-frente-filter',
            'viagens-motorista-filter',
            'viagens-caminhao-filter',
            'viagens-lacre-filter'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        this.viagensAduboFilters = {
            data: '',
            fazenda: '',
            frente: '',
            motorista: '',
            caminhao: '',
            lacre: ''
        };
        this.renderViagensAdubo();
    }

    addBagRow(prefix = '') {
        const identEl = document.getElementById(prefix + 'bag-identificacao');
        const lacreEl = document.getElementById(prefix + 'bag-lacre');
        const obsEl = document.getElementById(prefix + 'bag-observacoes');
        const devolvidoEl = document.getElementById(prefix + 'bag-devolvido');

        const identificacao = identEl && identEl.value ? identEl.value.trim() : '';
        const lacre = lacreEl && lacreEl.value ? lacreEl.value.trim() : '';
        const observacoes = obsEl && obsEl.value ? obsEl.value.trim() : '';
        const devolvido = devolvidoEl ? devolvidoEl.checked : false;

        if (!identificacao) {
            if (this.ui && this.ui.showNotification) this.ui.showNotification('Informe identificação do bag', 'warning');
            return;
        }
        if (!Array.isArray(this.viagensAduboBagsDraft)) this.viagensAduboBagsDraft = [];
        this.viagensAduboBagsDraft.push({ identificacao, lacre, observacoes, devolvido });
        this.renderBagsDraft();
        
        if (identEl) identEl.value = '';
        if (lacreEl) lacreEl.value = '';
        if (obsEl) obsEl.value = '';
        if (devolvidoEl) devolvidoEl.checked = false;
    }

    renderBagsDraft() {
        // Update Summary Bags Count
        const summaryBags = document.getElementById('summary-adubo-bags');
        if (summaryBags) {
            summaryBags.textContent = (this.viagensAduboBagsDraft || []).length;
        }

        const renderTo = (tbodyId, isViewMode) => {
            const tbody = document.getElementById(tbodyId);
            if (!tbody) return;

            // Hide/Show Actions Header
            const table = tbody.closest('table');
            if (table) {
                const actionsHeader = table.querySelector('thead th:last-child');
                if (actionsHeader && actionsHeader.textContent.trim() === 'Ações') {
                    actionsHeader.style.display = isViewMode ? 'none' : 'table-cell';
                }
            }

            if (!Array.isArray(this.viagensAduboBagsDraft) || !this.viagensAduboBagsDraft.length) {
                tbody.innerHTML = '';
                return;
            }
            tbody.innerHTML = this.viagensAduboBagsDraft.map((b, idx) => {
                const actionTd = isViewMode ? '' : `<td><button class="btn btn-delete-bag-row" data-idx="${idx}">🗑️</button></td>`;
                const devolvidoChecked = b.devolvido ? 'checked' : '';
                const devolvidoDisabled = isViewMode ? 'disabled' : '';
                
                return `
                    <tr>
                        <td>${b.identificacao || ''}</td>
                        <td>${b.lacre || ''}</td>
                        <td>${b.observacoes || ''}</td>
                        <td style="text-align: center;">
                            <input type="checkbox" class="bag-devolvido-checkbox" data-idx="${idx}" ${devolvidoChecked} ${devolvidoDisabled} style="width: 18px; height: 18px; cursor: ${isViewMode ? 'default' : 'pointer'};">
                        </td>
                        ${actionTd}
                    </tr>
                `;
            }).join('');
        };
        renderTo('bags-table-body', false);
        renderTo('modal-bags-table-body', this.viagemAduboMode === 'view');
    }

    openViagemDetail(id) {
        const modal = document.getElementById('viagem-detail-modal');
        const body = document.getElementById('viagem-detail-body');
        const title = document.getElementById('viagem-detail-title');
        if (!modal || !body) return;
        const list = Array.isArray(this.viagensAdubo) ? this.viagensAdubo : [];
        const viagem = list.find(v => String(v.id) === String(id));
        if (!viagem) {
            if (this.ui && this.ui.showNotification) this.ui.showNotification('Viagem não encontrada', 'error');
            return;
        }
        const q = viagem.quantidadeTotal != null ? viagem.quantidadeTotal : (viagem.quantidade_total != null ? viagem.quantidade_total : 0);
        const qtd = typeof q === 'number' ? q : parseFloat(q) || 0;
        const bags = Array.isArray(viagem.bags) ? viagem.bags : [];
        if (title) title.textContent = 'Viagem de ' + (viagem.produto || '');
        const infoRows = [
            ['Tipo', (viagem.transportType === 'composto' ? 'Transporte de Composto' : 'Transporte de Adubo')],
            ['Data', viagem.data || ''],
            ['Frente', viagem.frente || ''],
            ['Fazenda', viagem.fazenda || ''],
            ['Origem', viagem.origem || ''],
            ['Destino', viagem.destino || ''],
            ['Produto', viagem.produto || ''],
            ['Quantidade', this.ui.formatNumber(qtd, 3)],
            ['Unidade', viagem.unidade || ''],
            ['Caminhão', viagem.caminhao || ''],
            ['Carreta 1', viagem.carreta1 || ''],
            ['Carreta 2', viagem.carreta2 || ''],
            ['Motorista', viagem.motorista || ''],
            ['Doc. Motorista', viagem.documento_motorista || viagem.documentoMotorista || ''],
            ['Transportadora', viagem.transportadora || ''],
            ['Observações', viagem.observacoes || '']
        ];
        const infoHtml = `
            <table class="data-table" style="margin-bottom:16px;">
                <tbody>
                    ${infoRows.map(r => `
                        <tr>
                            <th style="text-align:left;width:160px;">${r[0]}</th>
                            <td>${r[1]}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        const bagsHtml = bags.length ? `
            <h4 style="margin: 10px 0;">Bags</h4>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Identificação</th>
                        <th>Peso</th>
                        <th>Lacre</th>
                        <th>Observações</th>
                        <th style="text-align: center;">Devolvido</th>
                    </tr>
                </thead>
                <tbody>
                    ${bags.map(b => {
                        const p = typeof b.peso === 'number' ? b.peso : parseFloat(b.peso) || 0;
                        const devolvidoIcon = b.devolvido ? '✅' : '❌';
                        return `
                            <tr>
                                <td>${b.identificacao || ''}</td>
                                <td>${this.ui.formatNumber(p, 3)}</td>
                                <td>${b.lacre || ''}</td>
                                <td>${b.observacoes || ''}</td>
                                <td style="text-align: center;">${devolvidoIcon}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        ` : '<p style="margin:0;">Nenhum bag cadastrado para esta viagem.</p>';
        body.innerHTML = infoHtml + bagsHtml;
        modal.style.display = 'flex';
        this.currentViagemDetailId = viagem.id;
    }

    closeViagemDetail() {
        const modal = document.getElementById('viagem-detail-modal');
        if (modal) modal.style.display = 'none';
    }

    printViagemDetail() {
        const body = document.getElementById('viagem-detail-body');
        const title = document.getElementById('viagem-detail-title');
        if (!body) return;
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write('<html><head><title>Viagem</title><link rel="stylesheet" href="main.css"></head><body>');
        if (title) w.document.write('<h2>' + title.textContent + '</h2>');
        w.document.write(body.innerHTML);
        w.document.write('</body></html>');
        w.document.close();
        w.focus();
        w.print();
    }

    updateInsumosFilters(data) {
        const produtos = Array.from(new Set(data.map(i => i.produto).filter(Boolean))).sort();
        const fazendas = Array.from(new Set(data.map(i => i.fazenda).filter(Boolean))).sort();
        const prodSelect = document.getElementById('produto-filter');
        const fazSelect = document.getElementById('fazenda-insumos-filter');
        if (prodSelect) this.ui.populateSelect(prodSelect, produtos, 'Todos os Produtos');
        if (fazSelect) this.ui.populateSelect(fazSelect, fazendas, 'Todas as Fazendas');
        this.buildFazendaIndex(data);
    }

    buildFazendaIndex(data) {
        const byName = {};
        const byCod = {};
        data.forEach(i => {
            if (i.fazenda) {
                const info = byName[i.fazenda] || {};
                if (i.cod != null) info.cod = i.cod;
                if (i.os != null) info.os = i.os;
                byName[i.fazenda] = info;
            }
            if (i.cod != null && i.fazenda) {
                byCod[i.cod] = { fazenda: i.fazenda, os: i.os };
            }
        });
        // Merge com cadastro, se existir
        if (this.fazendaIndex && this.fazendaIndex.cadastroByCod) {
            Object.entries(this.fazendaIndex.cadastroByCod).forEach(([cod, info]) => {
                const c = parseInt(cod);
                byCod[c] = { ...(byCod[c]||{}), ...info };
                if (info.nome) byName[info.nome] = { ...(byName[info.nome]||{}), cod: c };
            });
        }
        this.fazendaIndex = { byName, byCod, cadastroByCod: (this.fazendaIndex.cadastroByCod||{}) };
    }

    buildCadastroIndex(fazendas) {
        const cadastroByCod = {};
        fazendas.forEach(f => {
            if (f && f.cod != null) {
                cadastroByCod[parseInt(f.cod)] = {
                    nome: f.nome,
                    areaTotal: f.areaTotal || 0,
                    plantioAcumulado: f.plantioAcumulado || 0,
                    mudaAcumulada: f.mudaAcumulada || 0,
                    regiao: f.regiao || ''
                };
            }
        });
        // Atualiza índice principal
        const currentByName = (this.fazendaIndex && this.fazendaIndex.byName) ? this.fazendaIndex.byName : {};
        const currentByCod = (this.fazendaIndex && this.fazendaIndex.byCod) ? this.fazendaIndex.byCod : {};
        this.fazendaIndex = { byName: currentByName, byCod: currentByCod, cadastroByCod };
        // Reconstroi unindo
        this.buildFazendaIndex([]);
    }

    renderInsumos() {
        const data = [...this.insumosFazendasData];
        const tbody = document.querySelector('#insumos-table tbody');
        if (!tbody) return;
        this.ui.renderTable(tbody, data, this.getInsumosRowHTML.bind(this));
        this.updateCharts(data);
        this.loadEstoqueAndRender();
        this.renderInsumosResumoSection(data);
    }

    getInsumosRowHTML(item) {
        let doseAplicada = 0;
        if (item.doseAplicada != null && item.doseAplicada > 0) {
            doseAplicada = item.doseAplicada;
        } else if (item.insumDoseAplicada != null && item.insumDoseAplicada > 0) {
            doseAplicada = item.insumDoseAplicada;
        } else if (item.areaTotalAplicada > 0 && item.quantidadeAplicada != null) {
            doseAplicada = item.quantidadeAplicada / item.areaTotalAplicada;
        }

        const difPercent = (item.doseRecomendada > 0 && doseAplicada > 0) ? 
            ((doseAplicada / item.doseRecomendada - 1) * 100) : 0;
        const difClass = this.ui.getDifferenceClass(difPercent);
        const inicio = this.ui.formatDateBR(item.dataInicio);
        
        return `
            <td>${item.os ?? 0}</td>
            <td>${item.cod ?? 0}</td>
            <td>${item.fazenda || '—'}</td>
            <td>${this.ui.formatNumber(item.areaTalhao || 0)}</td>
            <td>${this.ui.formatNumber(item.areaTotalAplicada || 0)}</td>
            <td>${item.produto || '—'}</td>
            <td>${this.ui.formatNumber(item.doseRecomendada || 0, 3)}</td>
            <td>${this.ui.formatNumber(doseAplicada || 0, 3)}</td>
            <td>${this.ui.formatNumber(item.quantidadeAplicada || 0, 3)}</td>
            <td class="${difClass}">${this.ui.formatPercentage(difPercent)}</td>
            <td>${item.frente ?? 0}</td>
            <td>${inicio}</td>
        `;
    }

    applyInsumosFilters() {
        const produto = document.getElementById('produto-filter').value;
        const fazenda = document.getElementById('fazenda-insumos-filter').value;
        
        const filters = {};
        if (produto !== 'all') filters.produto = produto;
        if (fazenda !== 'all') filters.fazenda = fazenda;
        
        this.currentFilters.insumos = filters;
        this.loadInsumosData(filters);
    }

    resetInsumosFilters() {
        document.getElementById('produto-filter').value = 'all';
        document.getElementById('fazenda-insumos-filter').value = 'all';
        this.currentFilters.insumos = {};
        this.loadInsumosData();
    }

    renderInsumosResumoSection(data) {
        const tbody = document.getElementById('insumos-resumo-tbody');
        const canvas = document.getElementById('chart-insumos-resumo');
        if (!tbody) return;
        const key = (i) => `${i.fazenda || ''}||${i.produto || ''}`;
        const map = {};
        data.forEach(i => {
            const k = key(i);
            if (!map[k]) {
                map[k] = {
                    fazenda: i.fazenda || '',
                    produto: i.produto || '',
                    area: 0,
                    quantidade: 0,
                    doseRecomSum: 0,
                    doseRecomWeight: 0
                };
            }
            const m = map[k];
            const area = parseFloat(i.areaTotalAplicada || 0) || 0;
            const qtd = parseFloat(i.quantidadeAplicada || 0) || 0;
            const doseRec = parseFloat(i.doseRecomendada || 0) || 0;
            m.area += area;
            m.quantidade += qtd;
            if (doseRec > 0 && area > 0) {
                m.doseRecomSum += doseRec * area;
                m.doseRecomWeight += area;
            }
        });
        const rows = Object.values(map).map(m => {
            const doseRecom = m.doseRecomWeight > 0 ? (m.doseRecomSum / m.doseRecomWeight) : 0;
            const doseAplicada = m.area > 0 ? (m.quantidade / m.area) : 0;
            const previsto = doseRecom * m.area;
            const difAbs = m.quantidade - previsto;
            const difPerc = previsto > 0 ? ((m.quantidade / previsto - 1) * 100) : 0;
            return {
                fazenda: m.fazenda,
                produto: m.produto,
                area: m.area,
                doseRecom,
                doseAplicada,
                quantidade: m.quantidade,
                difAbs,
                difPerc
            };
        });
        tbody.innerHTML = rows.length === 0 ? `
            <tr><td colspan="7" style="text-align:center;">Nenhum dado para o resumo.</td></tr>
        ` : rows.map(r => {
            const difClass = this.ui.getDifferenceClass(r.difPerc);
            return `
                <tr>
                    <td>${r.fazenda || '—'}</td>
                    <td>${r.produto || '—'}</td>
                    <td>${this.ui.formatNumber(r.area || 0)}</td>
                    <td>${this.ui.formatNumber(r.doseRecom || 0, 3)}</td>
                    <td>${this.ui.formatNumber(r.doseAplicada || 0, 3)}</td>
                    <td>${this.ui.formatNumber(r.quantidade || 0, 3)}</td>
                    <td class="${difClass}">${this.ui.formatPercentage(r.difPerc || 0)}</td>
                </tr>
            `;
        }).join('');
        if (canvas && window.Chart) {
            const byProduto = {};
            rows.forEach(r => {
                const p = r.produto || '';
                if (!byProduto[p]) byProduto[p] = { aplicado: 0, previsto: 0 };
                byProduto[p].aplicado += r.quantidade || 0;
                byProduto[p].previsto += (r.doseRecom || 0) * (r.area || 0);
            });
            const labels = Object.keys(byProduto);
            const aplicado = labels.map(l => byProduto[l].aplicado);
            const previsto = labels.map(l => byProduto[l].previsto);
            if (canvas._chartInstance) {
                canvas._chartInstance.destroy();
            }
            const ctx = canvas.getContext('2d');
            const chart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        { label: 'Aplicado', data: aplicado, backgroundColor: 'rgba(52, 152, 219, 0.6)' },
                        { label: 'Previsto', data: previsto, backgroundColor: 'rgba(46, 204, 113, 0.6)' }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { position: 'top' }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
            canvas._chartInstance = chart;
        }
    }

    async loadSantaIreneData() {
        try {
            const tbody = document.querySelector('#santa-irene-table tbody');
            tbody.innerHTML = '<tr><td colspan="10" class="loading">📡 Carregando dados...</td></tr>';
            
            const response = await this.api.getSantaIrene();
            
            if (response.success) {
                this.santaIreneData = response.data;
                this.ui.renderTable(tbody, response.data, this.getSantaIreneRowHTML.bind(this));
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            const tbody = document.querySelector('#santa-irene-table tbody');
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="loading" style="color: var(--error-color);">
                        ❌ Erro ao carregar dados: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    getSantaIreneRowHTML(item) {
        let doseAplicada = 0;
        if (item.doseAplicada != null && item.doseAplicada > 0) {
            doseAplicada = item.doseAplicada;
        } else if (item.insumDoseAplicada != null && item.insumDoseAplicada > 0) {
            doseAplicada = item.insumDoseAplicada;
        } else if (item.areaTotalAplicada > 0 && item.quantidadeAplicada != null) {
            doseAplicada = item.quantidadeAplicada / item.areaTotalAplicada;
        }

        const difPercent = (item.doseRecomendada > 0 && doseAplicada > 0) ? 
            ((doseAplicada / item.doseRecomendada - 1) * 100) : 0;
        const difClass = this.ui.getDifferenceClass(difPercent);
        
        return `
            <td>${item.cod ?? 0}</td>
            <td>${item.fazenda || '—'}</td>
            <td>${this.ui.formatNumber(item.areaTalhao || 0)}</td>
            <td>${this.ui.formatNumber(item.areaTotalAplicada || 0)}</td>
            <td>${item.produto || '—'}</td>
            <td>${this.ui.formatNumber(item.doseRecomendada || 0, 3)}</td>
            <td>${this.ui.formatNumber(doseAplicada || 0, 3)}</td>
            <td>${this.ui.formatNumber(item.quantidadeAplicada || 0, 3)}</td>
            <td class="${difClass}">${this.ui.formatPercentage(difPercent)}</td>
            <td>${item.frente ?? 0}</td>
            <td>
                <button class="btn btn-edit" data-id="${item.id}">✏️ Editar</button>
                <button class="btn btn-delete" data-id="${item.id}">🗑️ Excluir</button>
            </td>
        `;
    }

    async loadDanielaData() {
        try {
            const tbody = document.querySelector('#daniela-table tbody');
            tbody.innerHTML = '<tr><td colspan="10" class="loading">📡 Carregando dados...</td></tr>';
            
            const response = await this.api.getDaniela();
            
            if (response.success) {
                this.danielaData = response.data;
                this.ui.renderTable(tbody, response.data, this.getDanielaRowHTML.bind(this));
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            const tbody = document.querySelector('#daniela-table tbody');
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="loading" style="color: var(--error-color);">
                        ❌ Erro ao carregar dados: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    getDanielaRowHTML(item) {
        let doseAplicada = 0;
        if (item.doseAplicada != null && item.doseAplicada > 0) {
            doseAplicada = item.doseAplicada;
        } else if (item.insumDoseAplicada != null && item.insumDoseAplicada > 0) {
            doseAplicada = item.insumDoseAplicada;
        } else if (item.areaTotalAplicada > 0 && item.quantidadeAplicada != null) {
            doseAplicada = item.quantidadeAplicada / item.areaTotalAplicada;
        }

        const difPercent = (item.doseRecomendada > 0 && doseAplicada > 0) ? 
            ((doseAplicada / item.doseRecomendada - 1) * 100) : 0;
        const difClass = this.ui.getDifferenceClass(difPercent);
        
        // Mapear areaTalhao para areaTotal se necessário
        const areaTotal = item.areaTotal || item.areaTalhao || 0;
        
        return `
            <td>${item.cod ?? 0}</td>
            <td>${item.fazenda || '—'}</td>
            <td>${this.ui.formatNumber(areaTotal)}</td>
            <td>${this.ui.formatNumber(item.areaTotalAplicada || 0)}</td>
            <td>${item.produto || '—'}</td>
            <td>${this.ui.formatNumber(item.doseRecomendada || 0, 3)}</td>
            <td>${this.ui.formatNumber(doseAplicada || 0, 3)}</td>
            <td>${this.ui.formatNumber(item.quantidadeAplicada || 0, 3)}</td>
            <td class="${difClass}">${this.ui.formatPercentage(difPercent)}</td>
            <td>${item.frente ?? 0}</td>
            <td>
                <button class="btn btn-edit" data-id="${item.id}">✏️ Editar</button>
                <button class="btn btn-delete" data-id="${item.id}">🗑️ Excluir</button>
            </td>
        `;
    }

    openInsumoModal(mode, item = null) {
        this.currentEdit = { mode, item };
        const modal = document.getElementById('insumo-modal');
        const title = document.getElementById('insumo-modal-title');
        if (modal) modal.style.display = 'block';
        if (title) title.textContent = mode === 'add' ? '➕ Adicionar Insumo' : '✏️ Editar Insumo';
        if (item) this.fillForm(item); else this.clearForm();
        const fornecedorEl = document.getElementById('fornecedor');
        if (fornecedorEl) {
            fornecedorEl.value = 'insumosFazendas';
        }
    }

    closeInsumoModal() {
        const modal = document.getElementById('insumo-modal');
        if (modal) modal.style.display = 'none';
        this.currentEdit = null;
    }

    clearForm() {
        ['fornecedor','os','cod','produto','fazenda','frente','processo','subprocesso','areaTalhao','areaTotalAplicada','doseRecomendada','doseAplicada','quantidadeAplicada','dataInicio']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const processoEl = document.getElementById('processo');
        const subprocessoEl = document.getElementById('subprocesso');
        if (processoEl && !processoEl.value) processoEl.value = 'CANA DE ACUCAR';
        if (subprocessoEl && !subprocessoEl.value) subprocessoEl.value = 'PLANTIO';
    }

    fillForm(item) {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
        set('os', item.os);
        set('cod', item.cod);
        set('produto', item.produto);
        set('fazenda', item.fazenda);
        set('frente', item.frente);
        set('processo', item.processo);
        set('subprocesso', item.subprocesso);
        set('areaTalhao', item.areaTalhao ?? item.areaTotal);
        set('areaTotalAplicada', item.areaTotalAplicada);
        set('doseRecomendada', item.doseRecomendada);
        set('doseAplicada', item.doseAplicada);
        set('quantidadeAplicada', item.quantidadeAplicada);
        set('dataInicio', item.dataInicio);
    }

    getFormData() {
        const get = (id) => document.getElementById(id)?.value;
        const fornecedor = get('fornecedor');
        const payload = {
            fornecedor,
            os: get('os') ? parseInt(get('os')) : undefined,
            cod: get('cod') ? parseInt(get('cod')) : undefined,
            produto: get('produto'),
            fazenda: get('fazenda'),
            frente: get('frente') ? parseInt(get('frente')) : undefined,
            processo: get('processo'),
            subprocesso: get('subprocesso'),
            areaTalhao: get('areaTalhao') ? parseFloat(get('areaTalhao')) : undefined,
            areaTotalAplicada: get('areaTotalAplicada') ? parseFloat(get('areaTotalAplicada')) : undefined,
            doseRecomendada: get('doseRecomendada') ? parseFloat(get('doseRecomendada')) : undefined,
            doseAplicada: get('doseAplicada') ? parseFloat(get('doseAplicada')) : undefined,
            quantidadeAplicada: get('quantidadeAplicada') ? parseFloat(get('quantidadeAplicada')) : undefined,
            dataInicio: get('dataInicio') || undefined
        };
        return payload;
    }

    async saveInsumo() {
        try {
            const data = this.getFormData();
            if (this.currentEdit && this.currentEdit.mode === 'edit' && this.currentEdit.item?.id) {
                await this.api.request(`/insumos/${this.currentEdit.item.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                this.ui.showNotification('Insumo atualizado!', 'success', 2000);
            } else {
                const created = await this.api.request(`/insumos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (!created.success) throw new Error('Falha ao adicionar');
                this.ui.showNotification('Insumo adicionado!', 'success', 2000);

                // === SYNC ESTOQUE ===
                // Atualiza o estoque automaticamente ao cadastrar nova O.S.
                try {
                    // Consideramos quantidadeAplicada como consumo/uso que deve ser registrado
                    // Ou se for Entrada, deve ser positivo.
                    // Assumindo que queremos REGISTRAR o item no estoque e ACUMULAR a quantidade (como se fosse entrada ou histórico).
                    if (data.frente && data.produto && data.quantidadeAplicada) {
                         const resEstoque = await this.api.getEstoque();
                         const estoqueList = (resEstoque && resEstoque.success && Array.isArray(resEstoque.data)) ? resEstoque.data : [];
                         
                         const itemEstoque = estoqueList.find(e => e.frente === data.frente && e.produto === data.produto);
                         const currentQty = itemEstoque ? (parseFloat(itemEstoque.quantidade) || 0) : 0;
                         const newQty = currentQty + parseFloat(data.quantidadeAplicada);

                         await this.api.setEstoque(
                            data.frente, 
                            data.produto, 
                            newQty, 
                            data.os ? String(data.os) : null, 
                            data.dataInicio
                         );
                         console.log('Estoque sincronizado com O.S.');
                    }
                } catch (syncErr) {
                    console.warn('Erro ao sincronizar estoque:', syncErr);
                }
            }
            this.closeInsumoModal();
            await this.loadTabData(this.getCurrentTab());
        } catch (err) {
            this.ui.showNotification('Erro ao salvar', 'error');
        }
    }

    startEdit(id) {
        const tab = this.getCurrentTab();
        let item = null;
        if (tab === 'insumos-fazendas') item = this.insumosFazendasData.find(i => i.id == id);
        if (item) this.openInsumoModal('edit', item);
    }

    async deleteInsumo(id) {
        try {
            const tab = this.getCurrentTab();
            if (tab === 'insumos-fazendas') {
                await this.api.deleteInsumoFazenda(id);
            } else {
                throw new Error('Funcionalidade não implementada para esta aba: ' + tab);
            }
            
            this.ui.showNotification('Insumo excluído!', 'success', 2000);
            await this.loadTabData(this.getCurrentTab());
        } catch (err) {
            console.error('Erro ao excluir insumo:', err);
            this.ui.showNotification('Erro ao excluir: ' + (err.message || ''), 'error');
        }
    }

    async refreshData() {
        this.api.clearCache();
        this.ui.showNotification('Atualizando dados...', 'info');
        
        await this.loadStaticData();
        await this.loadTabData(this.getCurrentTab());
        
        this.ui.showNotification('Dados atualizados com sucesso!', 'success', 2000);
    }

    getCurrentTab() {
        const activeTab = document.querySelector('.tab.active');
        return activeTab ? activeTab.getAttribute('data-tab') : 'insumos-fazendas';
    }

    // Função removida pois agora usamos import-btn
    // exportToExcel() foi substituída pelo sistema de importação

    // =========================================================
    // TRANSPORTE DE COMPOSTO (NEW MODULE)
    // =========================================================

    async loadTransporteComposto() {
        const viewAdubo = document.getElementById('view-adubo-mode');
        const viewComposto = document.getElementById('view-composto-mode');
        if (viewAdubo) viewAdubo.style.display = 'none';
        if (viewComposto) viewComposto.style.display = 'block';

        const tbody = document.getElementById('transporte-composto-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="loading">📡 Carregando dados...</td></tr>';

        try {
            // Fetch data from Supabase (Main OS and Daily Items for calc)
            const [res, resDaily] = await Promise.all([
                this.api.getTransporteComposto(),
                this.api.getAllTransporteDiario()
            ]);

            if (res && res.success && Array.isArray(res.data)) {
                let list = res.data;
                const dailyItems = (resDaily && resDaily.success) ? resDaily.data : [];
                
                // Calculate totals per OS
                const totals = {};
                dailyItems.forEach(d => {
                    const oid = d.os_id; 
                    if (!totals[oid]) totals[oid] = 0;
                    totals[oid] += (parseFloat(d.quantidade) || 0);
                });

                // Attach 'realizado' to each item for sorting/filtering
                this.transporteCompostoData = list.map(item => {
                    const meta = parseFloat(item.quantidade) || 0;
                    const realizado = totals[item.id] || 0;
                    return {
                        ...item,
                        realizado: realizado,
                        restante: meta - realizado
                    };
                });

                this.renderTransporteComposto();
            } else {
                if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="color:red;">Erro ao carregar dados.</td></tr>';
            }
        } catch (err) {
            console.error(err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="color:red;">Erro de conexão.</td></tr>';
        }
        
        if (!this._compostoListenersSet) {
            this.setupCompostoListeners();
            this._compostoListenersSet = true;
        }
    }

    sortTransporteComposto(key) {
        if (!this.compostoSort) this.compostoSort = { key: null, dir: 'asc' };
        
        if (this.compostoSort.key === key) {
            this.compostoSort.dir = this.compostoSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            this.compostoSort.key = key;
            this.compostoSort.dir = 'asc';
        }
        this.renderTransporteComposto();
    }

    renderTransporteComposto() {
        const tbody = document.getElementById('transporte-composto-body');
        const tfootMeta = document.getElementById('total-composto-meta');
        const tfootRealizado = document.getElementById('total-composto-realizado');
        const tfootRestante = document.getElementById('total-composto-restante');
        
        if (!tbody) return;
        
        let list = this.transporteCompostoData || [];

        // Filter
        const search = document.getElementById('composto-search-os')?.value.toLowerCase();
        const status = document.getElementById('composto-filter-status')?.value;
        
        if (search) list = list.filter(i => String(i.numero_os).toLowerCase().includes(search));
        if (status) list = list.filter(i => i.status === status);

        // Sort
        if (this.compostoSort && this.compostoSort.key) {
            const { key, dir } = this.compostoSort;
            list.sort((a, b) => {
                let va = a[key];
                let vb = b[key];
                
                // Handle specific types/nulls
                if (va == null) va = '';
                if (vb == null) vb = '';
                
                // Numeric sort for specific fields
                if (['quantidade', 'realizado', 'restante', 'numero_os'].includes(key)) {
                    va = parseFloat(va) || 0;
                    vb = parseFloat(vb) || 0;
                } else {
                    va = String(va).toLowerCase();
                    vb = String(vb).toLowerCase();
                }

                if (va < vb) return dir === 'asc' ? -1 : 1;
                if (va > vb) return dir === 'asc' ? 1 : -1;
                return 0;
            });
        }

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
            if (tfootMeta) tfootMeta.textContent = '0.000';
            if (tfootRealizado) tfootRealizado.textContent = '0.000';
            if (tfootRestante) tfootRestante.textContent = '0.000';
            return;
        }

        // Calculate Totals for visible rows
        let totalMeta = 0;
        let totalRealizado = 0;
        let totalRestante = 0;

        tbody.innerHTML = list.map(item => {
            const meta = parseFloat(item.quantidade) || 0;
            const realizado = parseFloat(item.realizado) || 0;
            const restante = parseFloat(item.restante) || 0;
            
            totalMeta += meta;
            totalRealizado += realizado;
            totalRestante += restante;

            // Color logic
            let restColor = '#d35400';
            if (restante < -0.01) restColor = 'red';
            else if (Math.abs(restante) < 0.01 && meta > 0) restColor = 'green';

            return `
            <tr>
                <td>${item.numero_os || '-'}</td>
                <td>${this.ui.formatDateBR(item.data_abertura)}</td>
                <td>${item.fazenda || '-'} / ${item.frente || '-'}</td>
                <td>${item.produto || '-'}</td>
                <td>${this.ui.formatNumber(meta, 3)}</td>
                <td style="color: blue; font-weight: bold;">${this.ui.formatNumber(realizado, 3)}</td>
                <td style="color: ${restColor}; font-weight: bold;">${this.ui.formatNumber(restante, 3)}</td>
                <td><span class="badge ${item.status === 'ABERTO' ? 'badge-warning' : 'badge-success'}">${item.status}</span></td>
                <td style="white-space: nowrap;">
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-sm btn-secondary btn-view-composto" data-id="${item.id}" title="Ver Detalhes">Detalhes</button>
                        <button class="btn btn-sm btn-secondary btn-edit-composto" data-id="${item.id}" title="Editar">✏️</button>
                        <button class="btn btn-sm btn-danger btn-delete-composto" data-id="${item.id}" title="Excluir">🗑️</button>
                    </div>
                </td>
            </tr>
        `}).join('');

        // Update Footer
        if (tfootMeta) tfootMeta.textContent = this.ui.formatNumber(totalMeta, 3);
        if (tfootRealizado) tfootRealizado.textContent = this.ui.formatNumber(totalRealizado, 3);
        if (tfootRestante) tfootRestante.textContent = this.ui.formatNumber(totalRestante, 3);
    }

    setupCompostoListeners() {
        // 1. Import PDF
        const btnImport = document.getElementById('btn-composto-import');
        const fileInput = document.getElementById('file-import-pdf');
        if (btnImport && fileInput) {
            btnImport.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleCompostoImport(e.target.files[0]);
                    e.target.value = ''; // Reset para permitir re-importar o mesmo arquivo
                }
            });
        }

        // 1.1 Print Detail
        const btnPrintDetail = document.getElementById('btn-print-composto-detail');
        if (btnPrintDetail) {
            btnPrintDetail.addEventListener('click', () => this.exportCompostoDetailToPDF());
        }

        // 2. Clear Form
        const btnClear = document.getElementById('btn-composto-clear');
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                const form = document.getElementById('form-transporte-composto');
                if (form) form.reset();
                document.getElementById('composto-id').value = '';
                this.compostoDiarioDraft = [];
                this.renderCompostoDiarioDraft();
            });
        }

        // 3. Confirm Import
        const btnConfirm = document.getElementById('btn-confirm-import');
        if (btnConfirm) {
            btnConfirm.addEventListener('click', () => {
                if (this._lastImportedData) {
                    this.fillCompostoForm(this._lastImportedData);
                    document.getElementById('import-preview').style.display = 'none';
                    // Show Modal
                    const modal = document.getElementById('modal-transporte-composto');
                    if (modal) {
                        modal.style.display = 'block';
                    }
                }
            });
        }
        
        // 3.1 New Button: Novo Lançamento (Manual)
        const btnNew = document.getElementById('btn-novo-lancamento-composto');
        if (btnNew) {
            // Remove existing listeners
            const newBtnNew = btnNew.cloneNode(true);
            btnNew.parentNode.replaceChild(newBtnNew, btnNew);

            newBtnNew.addEventListener('click', async () => {
                console.log('Botão Novo Transporte Composto clicado');
                try {
                    const form = document.getElementById('form-transporte-composto');
                    const modal = document.getElementById('modal-transporte-composto');
                    if (form && modal) {
                        form.reset();
                        const idField = document.getElementById('composto-id');
                        if (idField) idField.value = '';
                        
                        // Populate fazendas
                        await this.populateCompostoFazendas();

                        this.compostoDiarioDraft = [];
                        this.renderCompostoDiarioDraft();
                        
                        // Unlock fields for new entry
                        this.toggleCompostoFields(false);
                        
                        // Reset to Step 1
                        if (this.goToModalStep) {
                            this.goToModalStep('composto', 1);
                        }



                        // FORCE VISIBILITY - NUCLEAR OPTION
                        modal.style.display = 'flex';
                        modal.style.position = 'fixed';
                        modal.style.top = '0';
                        modal.style.left = '0';
                        modal.style.width = '100vw';
                        modal.style.height = '100vh';
                        modal.style.zIndex = '10500';
                        modal.style.opacity = '1';
                        modal.style.visibility = 'visible';
                        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
                        modal.style.backdropFilter = 'blur(2px)';
                        
                        modal.classList.add('force-visible');

                        const modalContent = modal.querySelector('.modal-content');
                        if (modalContent) {
                            modalContent.style.display = 'flex';
                            modalContent.style.flexDirection = 'column';
                            modalContent.style.opacity = '1';
                            modalContent.style.visibility = 'visible';
                            modalContent.style.zIndex = '10501';
                            modalContent.style.animation = 'none';
                            modalContent.style.margin = 'auto';
                            modalContent.style.position = 'relative';
                        }
                        
                        console.log('Exibindo modal modal-transporte-composto agora (Force Visible).');
                        
                        // Fallback check
                        setTimeout(() => {
                             const rect = modal.getBoundingClientRect();
                             if (rect.height === 0 || rect.width === 0) {
                                  console.warn('Modal Composto has 0 dimensions! Moving to body end...');
                                  document.body.appendChild(modal);
                             }
                        }, 100);

                    } else {
                        console.error('Form ou Modal Composto não encontrado');
                    }
                } catch (err) {
                    console.error('Erro ao abrir modal composto:', err);
                    this.ui.showNotification('Erro ao abrir modal', 'error');
                }
            });
        } else {
            console.error('Botão btn-novo-lancamento-composto não encontrado!');
        }
        
        // Listener for Fazenda Selection to auto-fill Code
        const fazendaSelect = document.getElementById('composto-fazenda');
        if (fazendaSelect) {
            fazendaSelect.addEventListener('change', () => {
                const selectedOpt = fazendaSelect.options[fazendaSelect.selectedIndex];
                const codigoInput = document.getElementById('composto-fazenda-codigo');
                if (codigoInput && selectedOpt && selectedOpt.dataset.codigo) {
                    codigoInput.value = selectedOpt.dataset.codigo;
                } else if (codigoInput) {
                     codigoInput.value = '';
                }
            });
        }
        
        // Listener for Meta Change to update summary
        const mainQtd = document.getElementById('composto-quantidade');
        if (mainQtd) {
            mainQtd.addEventListener('input', () => this.renderCompostoDiarioDraft());
        }

        // 4. Form Submit
        const form = document.getElementById('form-transporte-composto');
        if (form) {
            form.addEventListener('submit', (e) => this.handleCompostoSubmit(e));
        }
        
        // 5. Search/Filter/Refresh
        const searchOS = document.getElementById('composto-search-os');
        const filterStatus = document.getElementById('composto-filter-status');
        const btnRefresh = document.getElementById('btn-refresh-composto');
        if (searchOS) searchOS.addEventListener('input', () => this.renderTransporteComposto());
        if (filterStatus) filterStatus.addEventListener('change', () => this.renderTransporteComposto());
        if (btnRefresh) btnRefresh.addEventListener('click', () => this.renderTransporteComposto());

        // 6. Transportes Diários
        const btnAddDiario = document.getElementById('btn-add-composto-diario');
        if (btnAddDiario) {
            btnAddDiario.addEventListener('click', () => this.addCompostoDiarioItem());
        }

        // 7. Modal Close Logic
        const closeBtns = document.querySelectorAll('.close-composto-modal');
        closeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = document.getElementById('modal-transporte-composto');
                if(modal) {
                    modal.style.display = 'none';
                    // Reset fields to editable state when closing
                    this.toggleCompostoFields(false);
                    document.getElementById('form-transporte-composto')?.reset();
                }
            });
        });

        // Close when clicking outside
        const modalComposto = document.getElementById('modal-transporte-composto');
        if (modalComposto) {
            window.addEventListener('click', (e) => {
                if (e.target === modalComposto) {
                    modalComposto.style.display = 'none';
                    // Reset fields to editable state when closing
                    this.toggleCompostoFields(false);
                    document.getElementById('form-transporte-composto')?.reset();
                }
            });
        }
    }

    // Modal switch tab removed as we don't use tabs anymore

    async handleCompostoImport(file) {
        if (!file) return;
        
        if (!window.pdfjsLib) {
             this.ui.showNotification('Biblioteca PDF não carregada (pdf.js). Verifique a conexão.', 'error');
             return;
        }

        try {
            this.showProgress('Lendo PDF...', 0, 'Iniciando leitura...');
            const buffer = await file.arrayBuffer();
            const loadingTask = window.pdfjsLib.getDocument({ data: buffer });
            const pdf = await loadingTask.promise;
            let fullText = '';
            
            // Leitura de todas as páginas
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const percent = (pageNum / pdf.numPages) * 100;
                this.showProgress('Lendo PDF...', percent, `Lendo página ${pageNum} de ${pdf.numPages}`);
                
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                // Usando ' | ' como separador para depuração e regex mais seguro
                const pageText = textContent.items.map(item => item.str).join(' | ');
                fullText += pageText + '\n\n';
            }
            
            this.hideProgress();

            // Show Debug Info
            const debugArea = document.getElementById('import-debug-area');
            const debugMsg = document.getElementById('import-status-msg');
            
            if (debugArea && debugMsg) {
                debugArea.style.display = 'block';
                
                if (fullText.trim().length < 50) {
                    debugMsg.textContent = "ALERTA: Pouco texto extraído. Tentando ler como imagem (OCR)... Aguarde, isso pode demorar.";
                    debugMsg.style.color = "#d39e00"; // Orange
                    debugArea.style.borderColor = "#d39e00";

                    // Tesseract OCR Fallback
                    if (window.Tesseract) {
                        try {
                            fullText = ''; // Reset para preencher com OCR
                            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                                this.showProgress('Processando Imagem (OCR)...', (pageNum/pdf.numPages)*100, `Lendo página ${pageNum} de ${pdf.numPages} com IA...`);
                                
                                const page = await pdf.getPage(pageNum);
                                const viewport = page.getViewport({ scale: 2.0 }); // Melhor resolução
                                const canvas = document.createElement('canvas');
                                const context = canvas.getContext('2d');
                                canvas.height = viewport.height;
                                canvas.width = viewport.width;
                                
                                await page.render({ canvasContext: context, viewport: viewport }).promise;
                                
                                const result = await Tesseract.recognize(canvas, 'por', {
                                    logger: m => {
                                        console.log('[Tesseract Log]:', m);
                                        // Atualiza a barra de progresso com o status detalhado do OCR
                                        // Status comuns: 'loading tesseract core', 'initializing api', 'recognizing text'
                                        let statusText = m.status;
                                        let progressVal = m.status === 'recognizing text' ? m.progress * 100 : 0;
                                        
                                        // Traduzindo status para o usuário
                                        if (m.status.includes('loading') || m.status.includes('downloading')) statusText = 'Baixando componentes OCR...';
                                        if (m.status === 'initializing api') statusText = 'Inicializando IA...';
                                        if (m.status === 'recognizing text') statusText = `Lendo Texto da Pág ${pageNum}... ${(m.progress * 100).toFixed(0)}%`;

                                        this.showProgress('Processando Imagem (OCR)', progressVal, statusText);
                                    }
                                });
                                fullText += result.data.text + '\n\n';
                            }
                            debugMsg.textContent = "Leitura OCR concluída com sucesso.";
                            debugMsg.style.color = "#28a745"; // Green
                            debugArea.style.borderColor = "#28a745";
                            this.hideProgress();
                        } catch (ocrErr) {
                            console.error("OCR Error:", ocrErr);
                            debugMsg.textContent = "Erro na leitura OCR. Tente um PDF com texto selecionável.";
                            debugMsg.style.color = "#dc3545";
                            this.hideProgress();
                        }
                    }

                } else {
                    debugMsg.textContent = "Leitura do PDF concluída. Verifique os dados abaixo.";
                    debugMsg.style.color = "#28a745"; // Green
                    debugArea.style.borderColor = "#28a745";
                }
            }

            console.log('PDF Content Raw:', fullText);

            // === Lógica de Extração Melhorada (Versão 3 - Tolerante) ===
            
            // Helper para limpar strings (remove pipe e espaços extras)
            const clean = (s) => s ? s.replace(/\|/g, ' ').trim().replace(/\s+/g, ' ') : '';
            const getNum = (s) => s ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : 0;

            // 1. Número da OS
            // Procura "Ordem de serviço" seguido de algo que pareça um número, ignorando pipes e espaços
            let osMatch = fullText.match(/(?:Ordem\s*de\s*servi[çc]o|O\.?S\.?|N[ºo])(?:[^0-9]{0,30})(\d+)/i);

            // 2. Data de Abertura
            // Procura data DD/MM/YYYY
            let dataMatch = fullText.match(/(\d{2}\/\d{2}\/\d{4})/);

            // 3. Responsável
            // Procura "Resp" ou "Aplicador", pula até 50 caracteres (ignorando pipes) até achar ":" e pega o texto
            let respMatch = fullText.match(/(?:Resp|Aplicador)[^:]*:(?:[^a-zA-Z0-9]*)([A-Z\s]+?)(?=\s*(?:Empresa|Data|Área|\||$))/i);

            // 4. Empresa
            let empresaMatch = fullText.match(/Empresa(?:[^:]*):(?:[^a-zA-Z0-9]*)([^\n\r\|]+)/i);

            // 4.5 Fazenda / Local
            let fazendaMatch = fullText.match(/(?:Fazenda|Propriedade|Local|Unidade)(?:[^:]*):(?:[^a-zA-Z0-9]*)([^\n\r\|]+)/i);
            let rawFazenda = clean(fazendaMatch ? fazendaMatch[1] : '');
            let fazendaCodigo = null;

            // Extract code if exists (ex: "12 - FAZENDA")
            const codeMatch = rawFazenda.match(/^(\d+)\s*-\s*(.+)/);
            if (codeMatch) {
                fazendaCodigo = codeMatch[1];
                rawFazenda = codeMatch[2];
            } else if (/^\d+\s*-\s*/.test(rawFazenda)) {
                // Fallback cleanup
                rawFazenda = rawFazenda.replace(/^\d+\s*-\s*/, '');
            }

            // 5. Frente
            let frenteMatch = fullText.match(/Frente(?:[^:]*):(?:[^0-9]*)([\d]+)/i);

            // 6. Produto e Atividade
            // Tenta pegar linha com código numérico seguido de texto uppercase (Ex: 150944-COMPOSTO)
            // Agora a regex captura o grupo inteiro: CODIGO + NOME, mas para de capturar ao encontrar padrões numéricos de quantidade
            let prodMatch = fullText.match(/(\d+\s*-\s*[A-Z\s\.]+)(?=\s*\d+[.,]\d+)/i) || 
                            fullText.match(/(\d+\s*-\s*COMPOSTO[^\n\r\|]*)/i) ||
                            fullText.match(/Produto(?:[^:]*):(?:[^a-zA-Z0-9]*)([^\n\r\|]+)/i);
            
            let rawProd = clean(prodMatch ? prodMatch[1] : 'COMPOSTO');
            
            // Remove lixo do final se tiver passado (ex: "78-FERT. ORGANICO 13,000")
            // Remove sequências numéricas longas ou com vírgula no final da string
            rawProd = rawProd.replace(/\s+\d+[.,]\d+.*$/, '').trim();
            // Remove "1-TN" ou unidades soltas no final
            rawProd = rawProd.replace(/\s+\d+-[A-Z]+.*$/, '').trim();

            // Lógica similar para Atividade
            let ativMatch = fullText.match(/(\d+\s*-\s*[A-Z\s\.]*COMPOSTAGEM[^\n\r\|]*)/i) ||
                            fullText.match(/Atividade(?:[^:]*):(?:[^a-zA-Z0-9]*)([^\n\r\|]+)/i);
            
            let rawAtiv = clean(ativMatch ? ativMatch[1] : 'ADUBACAO');
            // Limpeza extra para atividade
            rawAtiv = rawAtiv.replace(/\s+\d+[.,]\d+.*$/, '').trim();
            rawAtiv = rawAtiv.replace(/\s+\d+-[A-Z]+.*$/, '').trim();

            // 7. Quantidade e Unidade
            // Estratégia: Procurar números com 4 casas decimais (padrão 13,0000)
            let qtdVal = 0;
            let undVal = 't';

            // Padrão específico "13,0000 1-TN" (com ou sem pipes no meio)
            // Regex: Num(4casas) ... Unidade
            const preciseQtdeMatch = fullText.match(/(\d+(?:[.,]\d{3,4}))\s*(?:\||\s)*\d+-[A-Z]+/);
            
            // Padrão "1-TN ... 572,000"
            const totalQtdeMatch = fullText.match(/\d+-[A-Z]+\s*(?:\||\s)*(\d+(?:[.,]\d{3,4}))/);

            if (totalQtdeMatch) {
                qtdVal = getNum(totalQtdeMatch[1]);
            } else if (preciseQtdeMatch) {
                // Se achou a dose (ex: 13,0000), tenta achar o total na mesma linha/bloco
                // Mas por segurança, se for um numero grande, assumimos ele
                let val = getNum(preciseQtdeMatch[1]);
                if (val > 50) qtdVal = val; // Assumindo que total > dose
                else {
                     // Tenta achar outro numero grande perto
                     const nearbyNum = fullText.substr(preciseQtdeMatch.index, 100).match(/(\d{2,}(?:[.,]\d+)?)/g);
                     if (nearbyNum && nearbyNum.length > 1) {
                         // Pega o maior numero encontrado perto
                         const nums = nearbyNum.map(n => getNum(n));
                         qtdVal = Math.max(...nums);
                     } else {
                         qtdVal = val;
                     }
                }
            } else {
                // Fallback genérico
                const qtdLabelMatch = fullText.match(/(?:Qtde|Quantidade|Peso|Total)(?:[^:]*):(?:[^0-9]*)([\d,.]+)/i);
                if (qtdLabelMatch) {
                    qtdVal = getNum(qtdLabelMatch[1]);
                }
            }
            
            // Unidade default t, tenta achar TN ou TO
            if (fullText.match(/1-TN|Ton|Tonelada/i)) undVal = 't';
            if (fullText.match(/M3|Metro/i)) undVal = 'm³';
            
            // Montar objeto final
            const extractedData = {
                numero_os: osMatch ? osMatch[1] : '',
                data_abertura: dataMatch ? dataMatch[1].split('/').reverse().join('-') : new Date().toISOString().split('T')[0],
                responsavel_aplicacao: clean(respMatch ? respMatch[1] : ''),
                empresa: clean(empresaMatch ? empresaMatch[1] : ''),
                fazenda: rawFazenda,
                fazenda_codigo: fazendaCodigo,
                frente: frenteMatch ? frenteMatch[1] : '',
                produto: rawProd,
                quantidade: qtdVal,
                unidade: clean(undVal),
                atividade_agricola: rawAtiv,
                status: 'ABERTO'
            };

            console.log('Dados Extraídos:', extractedData);

            this._lastImportedData = extractedData;
             
            const preview = document.getElementById('import-result-json');
            if (preview) {
                 preview.textContent = JSON.stringify(extractedData, null, 2);
                 document.getElementById('import-preview').style.display = 'block';
            }
            
            this.ui.showNotification('PDF processado! Verifique os dados.', 'success');
            
            // Preencher formulário automaticamente para visualização imediata
            this.fillCompostoForm(extractedData);

        } catch (err) {
            this.hideProgress();
            console.error(err);
            this.ui.showNotification('Erro ao processar PDF: ' + err.message, 'error');
        }
    }

    // === MÉTODOS DE TRANSPORTE DIÁRIO (COMPOSTO) ===
    addCompostoDiarioItem() {
        const dataEl = document.getElementById('composto-diario-data');
        const qtdEl = document.getElementById('composto-diario-qtd');
        const frotaEl = document.getElementById('composto-diario-frota');

        const data = dataEl.value;
        const qtd = parseFloat(qtdEl.value);
        const frota = frotaEl.value.trim();

        if (!data || isNaN(qtd) || qtd <= 0) {
            this.ui.showNotification('Preencha data e quantidade válida.', 'warning');
            return;
        }

        this.compostoDiarioDraft.push({
            id: 'temp_' + Date.now(),
            data: data,
            quantidade: qtd,
            frota: frota
        });

        // Limpar inputs
        dataEl.value = '';
        qtdEl.value = '';
        frotaEl.value = '';
        dataEl.focus();

        this.renderCompostoDiarioDraft();
    }

    removeCompostoDiarioItem(index) {
        this.compostoDiarioDraft.splice(index, 1);
        this.renderCompostoDiarioDraft();
    }

    renderCompostoDiarioDraft() {
        const tbody = document.getElementById('composto-diario-body');
        const totalEl = document.getElementById('composto-diario-total');
        if (!tbody) return;

        tbody.innerHTML = '';
        let total = 0;

        this.compostoDiarioDraft.forEach((item, index) => {
            total += (item.quantidade || 0);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${this.ui.formatDateBR(item.data)}</td>
                <td>${this.ui.formatNumber(item.quantidade, 3)}</td>
                <td>${item.frota || '-'}</td>
                <td>
                    <button type="button" class="btn btn-sm btn-danger" onclick="window.insumosApp.removeCompostoDiarioItem(${index})">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (totalEl) totalEl.textContent = this.ui.formatNumber(total, 3);
        
        // Update Summary Block
        const mainQtdInput = document.getElementById('composto-quantidade');
        const summaryMeta = document.getElementById('summary-composto-meta');
        const summaryRealizado = document.getElementById('summary-composto-realizado');
        const summaryRestante = document.getElementById('summary-composto-restante');

        if (summaryRealizado) summaryRealizado.textContent = this.ui.formatNumber(total, 3);

        if (mainQtdInput && summaryMeta && summaryRestante) {
            // Get raw value or 0
            const valStr = mainQtdInput.value; 
            // Handle comma if present (though type="number" usually uses dot or locale)
            const meta = parseFloat(valStr) || 0;
            
            summaryMeta.textContent = this.ui.formatNumber(meta, 3);
            
            const restante = meta - total;
            summaryRestante.textContent = this.ui.formatNumber(restante, 3);
            
            // Visual feedback for remaining
            if (restante < 0) {
                summaryRestante.style.color = 'red';
            } else if (restante === 0 && meta > 0) {
                summaryRestante.style.color = 'green';
            } else {
                summaryRestante.style.color = '#d35400'; // orange-ish
            }
        }
        
        this.checkTransporteCompostoLimit();
    }

    checkTransporteCompostoLimit() {
        // Method to check limits, primarily used during validation or UI updates
        // The visual feedback is already handled in renderCompostoDiarioDraft
        // This method can be expanded for real-time alerts if needed
    }

    async populateCompostoFazendas() {
        const select = document.getElementById('composto-fazenda');
        const codigoInput = document.getElementById('composto-fazenda-codigo');
        if (!select) return;

        const currentValue = select.value; // Preserve current value

        try {
            // Use cached fazendas if available, otherwise fetch
            let fazendas = [];
            if (this.cadastroFazendas && this.cadastroFazendas.length > 0) {
                fazendas = this.cadastroFazendas;
            } else {
                const res = await this.api.getFazendas();
                if (res && res.success && Array.isArray(res.data)) {
                    fazendas = res.data;
                    this.cadastroFazendas = fazendas; // Update cache
                }
            }

            if (fazendas.length > 0) {
                // Keep the first option
                select.innerHTML = '<option value="">Selecione a Fazenda...</option>';
                
                const sorted = [...fazendas].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
                
                sorted.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f.nome;
                    opt.textContent = `${f.codigo} - ${f.nome}`;
                    opt.dataset.codigo = f.codigo;
                    select.appendChild(opt);
                });

                // Restore or add current value
                if (currentValue) {
                    const exists = Array.from(select.options).some(o => o.value === currentValue);
                    if (exists) {
                        select.value = currentValue;
                    } else {
                        // If coming from import/edit and not in list, add it
                        const opt = document.createElement('option');
                        opt.value = currentValue;
                        opt.textContent = currentValue;
                        select.appendChild(opt);
                        select.value = currentValue;
                    }
                }
            }
        } catch (e) {
            console.error('Erro ao popular fazendas:', e);
        }

        // Listener para preencher código automaticamente
        // Remover listener anterior para evitar duplicidade (embora addEventListener não duplique se for a mesma função, aqui são anônimas)
        // Uma abordagem melhor seria usar uma propriedade do elemento para guardar a função, mas por simplicidade:
        const newSelect = select.cloneNode(true);
        select.parentNode.replaceChild(newSelect, select);
        
        newSelect.addEventListener('change', () => {
            const selected = newSelect.options[newSelect.selectedIndex];
            if (selected && selected.dataset.codigo && codigoInput) {
                codigoInput.value = selected.dataset.codigo;
            } else if (codigoInput) {
                codigoInput.value = '';
            }
        });

        // Listener reverso (Código -> Select)
        if (codigoInput) {
            const newCodigoInput = codigoInput.cloneNode(true);
            codigoInput.parentNode.replaceChild(newCodigoInput, codigoInput);

            newCodigoInput.addEventListener('blur', () => {
                const code = newCodigoInput.value;
                if (code) {
                    for (let i = 0; i < newSelect.options.length; i++) {
                        if (newSelect.options[i].dataset.codigo === code) {
                            newSelect.selectedIndex = i;
                            break;
                        }
                    }
                }
            });
        }
    }

    async fillCompostoForm(data) {
        const f = document.getElementById('form-transporte-composto');
        if (!f) return;

        // Ensure fazendas are loaded
        await this.populateCompostoFazendas();
            
        // Helper to set value by name
        const set = (name, val) => {
            const el = f.querySelector(`[name="${name}"]`);
            if (el) el.value = (val !== undefined && val !== null) ? val : '';
        };

        set('numero_os', data.numero_os || data.os);
        set('data_abertura', this.ui.formatDateForInput(data.data_abertura));
        set('responsavel_aplicacao', data.responsavel_aplicacao || data.responsavel);
        set('empresa', data.empresa);
        set('fazenda_codigo', data.fazenda_codigo);
        set('fazenda', data.fazenda);
        set('frente', data.frente);
        set('produto', data.produto || 'COMPOSTO');
        // Fix: Use nullish coalescing to preserve 0
        set('quantidade', (data.quantidade !== undefined && data.quantidade !== null) ? data.quantidade : data.volume);
        set('unidade', data.unidade || 't');
        set('atividade_agricola', data.atividade_agricola);
        set('status', data.status || 'ABERTO');

        // Carregar itens diários
        // Buscar itens relacionados na tabela filha
        try {
            const resDiarios = await this.api.getOSTransporteDiario(data.id);
            if (resDiarios && resDiarios.success) {
                // Normalize data structure for UI draft
                this.compostoDiarioDraft = resDiarios.data.map(d => ({
                    id: d.id, // keep db id if needed
                    data: d.data_transporte, // UI uses 'data'
                    quantidade: d.quantidade, // UI uses 'quantidade'
                    frota: d.frota
                }));
            } else {
                 this.compostoDiarioDraft = [];
            }
        } catch(e) {
            console.error("Erro ao carregar itens diários:", e);
            this.compostoDiarioDraft = [];
        }
        
        this.renderCompostoDiarioDraft();
    }

    async handleCompostoSubmit(e) {
        e.preventDefault();
        const form = e.target;
        
        // Check if user has unsaved daily items in the inputs
        const dailyData = document.getElementById('composto-diario-data')?.value;
        const dailyQtd = document.getElementById('composto-diario-qtd')?.value;
        
        if (dailyData && dailyQtd) {
            if (confirm('Existem dados de transporte diário preenchidos mas não adicionados à lista. Deseja adicioná-los antes de salvar?')) {
                const btnAdd = document.getElementById('btn-add-composto-diario');
                if (btnAdd) btnAdd.click();
                // Pequeno delay para garantir que o evento de click processou
                await new Promise(r => setTimeout(r, 100));
            }
        }

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Sanitize data_abertura if it comes in BR format (from readonly text field)
        if (data.data_abertura && typeof data.data_abertura === 'string' && data.data_abertura.includes('/')) {
            const parts = data.data_abertura.split('/');
            if (parts.length === 3) {
                const [d, m, y] = parts;
                data.data_abertura = `${y}-${m}-${d}`;
            }
        }

        // Validate
        if (!data.numero_os) {
            this.ui.showNotification('Número da OS é obrigatório', 'warning');
            return;
        }

        // Verificação de Limite (Alerta Inteligente)
        const totalRealizado = this.compostoDiarioDraft.reduce((sum, item) => sum + (item.quantidade || 0), 0);
        let meta = parseFloat(data.quantidade) || 0;
        
        // Busca valor oficial da OS para validação mais segura
        if (this.osListCache) {
            const osObj = this.osListCache.find(o => String(o.numero) === String(data.numero_os));
            if (osObj) {
                 let predicted = parseFloat(osObj.quantidade || 0);
                 if (!predicted && osObj.area_total && osObj.dose_recomendada) {
                     predicted = parseFloat(osObj.area_total) * parseFloat(osObj.dose_recomendada);
                 }
                 if (predicted > 0) meta = predicted;
            }
        }
        
        if (meta > 0 && totalRealizado > meta) {
             const confirmed = await this.showConfirmationModal('Alerta de Limite da OS', `ATENÇÃO: O total realizado (${this.ui.formatNumber(totalRealizado, 3)}) excede a quantidade prevista na OS (${this.ui.formatNumber(meta, 3)}).\n\nDeseja continuar mesmo assim?`);
             if (!confirmed) {
                 return;
             }
        }

        // Add daily items
        data.transportes_diarios = this.compostoDiarioDraft;

        try {
            console.log('Salvando transporte composto:', data); // Debug
            // Save to Supabase directly
            const res = await this.api.saveTransporteComposto(data);

            if (res && res.success) {
                this.ui.showNotification('Salvo com sucesso!', 'success');
                const modal = document.getElementById('modal-transporte-composto');
                if (modal) modal.style.display = 'none';
                
                form.reset();
                // Clear hidden ID field to reset to create mode
                const idField = document.getElementById('composto-id');
                if (idField) idField.value = '';
                
                this.compostoDiarioDraft = [];
                this.renderCompostoDiarioDraft();

                this.renderTransporteComposto();
            } else {
                throw new Error(res.message || 'Erro ao salvar');
            }
        } catch (err) {
            console.error('Erro ao salvar transporte composto:', err);
            this.ui.showNotification('Erro ao salvar: ' + (err.message || JSON.stringify(err)), 'error');
        }
    }

    exportCompostoDetailToPDF() {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            this.ui.showNotification('Biblioteca PDF não carregada. Tente atualizar a página.', 'error');
            return;
        }

        const doc = new window.jspdf.jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        
        // Helper to get value
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? (el.value || '') : '';
        };

        const os = getVal('composto-numero-os');
        
        if (!os) {
            this.ui.showNotification('Não há dados de OS para imprimir.', 'warning');
            return;
        }

        const dataAbertura = getVal('composto-data-abertura');
        const resp = getVal('composto-responsavel');
        const empresa = getVal('composto-empresa');
        const fazenda = getVal('composto-fazenda');
        const frente = getVal('composto-frente');
        const produto = getVal('composto-produto');
        const status = getVal('composto-status');
        const meta = parseFloat(getVal('composto-quantidade')) || 0;

        // Calculate Totals from Draft
        const realizado = this.compostoDiarioDraft.reduce((acc, curr) => acc + (parseFloat(curr.quantidade) || 0), 0);
        const restante = meta - realizado;
        const percent = meta > 0 ? (realizado / meta) * 100 : 0;

        // Helper for Centered Text (Matches Consolidated Report Style)
        const centerText = (text, y) => {
            const textWidth = doc.getStringUnitWidth(text) * doc.internal.getFontSize() / doc.internal.scaleFactor;
            const x = (pageWidth - textWidth) / 2;
            doc.text(text, x, y);
        };

        // === HEADER / CAPA ===
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        centerText("Relatório de Gestão de Transporte (O.S.)", 20);
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        centerText(`O.S. Nº ${os} - ${fazenda}`, 28);

        doc.setFontSize(10);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 14, 35, { align: 'right' });

        doc.setLineWidth(0.5);
        doc.line(14, 38, pageWidth - 14, 38);

        let y = 50;

        // === 1. VISÃO GERAL ===
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text("1. Visão Geral da O.S.", 14, y);
        y += 10;

        // Box background (Gray Box - Same as Consolidated)
        doc.setDrawColor(200);
        doc.setFillColor(245, 247, 250);
        doc.rect(14, y, pageWidth - 28, 55, 'FD'); // Increased height to accommodate progress bar text

        doc.setFontSize(12);
        doc.setTextColor(0,0,0);
        doc.setFont(undefined, 'bold');
        doc.text(`Status Atual: ${status}`, 20, y + 10);
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');

        // Fix: Handle long product names
        const maxTextWidth = 85; // Space between left (20) and right col (110) - margin
        const splitProd = doc.splitTextToSize(`Produto: ${produto}`, maxTextWidth);
        doc.text(splitProd, 20, y + 18);
        
        // Adjust vertical spacing based on product lines
        const prodHeight = (splitProd.length * 4); // approx 4 units per line
        let currentY = y + 18 + prodHeight + 2; // +2 padding

        doc.text(`Empresa: ${empresa}`, 20, currentY);
        doc.text(`Responsável: ${resp}`, 20, currentY + 6);

        // Stats Column (Right Side of Box)
        const col2X = 110;
        doc.setFont(undefined, 'bold');
        doc.text("Meta Total:", col2X, y + 10);
        doc.setFont(undefined, 'normal');
        doc.text(`${this.ui.formatNumber(meta, 3)} t`, col2X + 35, y + 10);

        doc.setFont(undefined, 'bold');
        doc.text("Realizado:", col2X, y + 18);
        doc.setFont(undefined, 'normal');
        doc.text(`${this.ui.formatNumber(realizado, 3)} t`, col2X + 35, y + 18);

        doc.setTextColor(0, 0, 0); // Force black text
        doc.setFont(undefined, 'bold');
        doc.text("Restante:", col2X, y + 26);
        doc.setFont(undefined, 'normal');
        doc.text(`${this.ui.formatNumber(restante, 3)} t`, col2X + 35, y + 26);

        // Progress Bar
        const barX = col2X;
        const barY = y + 32;
        const barW = 60;
        const barH = 8;
        
        doc.setDrawColor(0);
        doc.rect(barX, barY, barW, barH); // border
        const fillWidth = Math.min(barW, (percent / 100) * barW);
        
        if (percent >= 100) {
            doc.setFillColor(40, 167, 69);
        } else {
            doc.setFillColor(0, 123, 255);
        }
        
        doc.rect(barX, barY, fillWidth, barH, 'F');
        
        // Percent text BELOW bar
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0); // Force black text
        
        // Center text relative to bar
        const percentText = `${this.ui.formatNumber(percent, 1)}% Concluído`;
        const textWidth = doc.getStringUnitWidth(percentText) * doc.internal.getFontSize() / doc.internal.scaleFactor;
        const textX = barX + (barW - textWidth) / 2;
        
        // Ajuste Y para evitar corte (movemos para y + 55 para proxima seção, então barY + barH + 5 = y + 32 + 8 + 5 = y + 45. OK)
        // Mas se o box anterior era 45 de altura, precisamos garantir que o texto não "saia" visualmente se o box tiver borda
        // O box cinza vai até y + 45 (rect(..., y, ..., 45)).
        // barY = y + 32. barH = 8. Bottom = y + 40. Text em y + 45 fica no limite da borda do box.
        // Vamos aumentar a altura do box para 55 na chamada do rect acima.
        
        doc.text(percentText, textX, barY + barH + 5);

        y += 65; // Aumentado espaço antes da próxima seção para evitar sobreposição

        // === 2. DETALHAMENTO TÉCNICO ===
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0); // Force black text
        doc.setFont(undefined, 'bold');
        doc.text("2. Detalhamento Técnico", 14, y);
        y += 8;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        
        // Use a cleaner grid layout with explicit column widths
        doc.autoTable({
            startY: y,
            showHead: 'never', // Remove header as requested
            body: [
                ['Data Abertura', this.ui.formatDateBR(dataAbertura), 'Frente', frente],
                ['Unidade', getVal('composto-unidade'), 'Atividade', getVal('composto-atividade') || '-']
            ],
            theme: 'grid', // Switch to grid for better borders
            styles: { 
                fontSize: 10, 
                cellPadding: 4,
                lineColor: [200, 200, 200],
                lineWidth: 0.1,
                textColor: [0, 0, 0] // Force black text in table
            },
            columnStyles: {
                0: { fontStyle: 'bold', width: 40, fillColor: [250, 250, 250], textColor: [0, 0, 0] }, // Label col 1
                1: { width: 50, textColor: [0, 0, 0] }, // Value col 1
                2: { fontStyle: 'bold', width: 40, fillColor: [250, 250, 250], textColor: [0, 0, 0] }, // Label col 2
                3: { width: 50, textColor: [0, 0, 0] }  // Value col 2
            }
        });

        y = doc.lastAutoTable.finalY + 15;

        // === 3. REGISTROS DE TRANSPORTE ===
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0); // Force black text
        doc.setFont(undefined, 'bold');
        doc.text("3. Registros de Viagens (Diário)", 14, y);
        
        // Table
        const headers = [['Data', 'Quantidade (t)', 'Frota/Caminhão', 'Acumulado (t)']];
        
        // Use draft data
        // Sort by date
        const sortedDraft = [...this.compostoDiarioDraft].sort((a,b) => {
             return new Date(a.data) - new Date(b.data);
        });

        let acumulado = 0;
        const rows = sortedDraft.map(item => {
            const qtd = parseFloat(item.quantidade) || 0;
            acumulado += qtd;
            return [
                this.ui.formatDateBR(item.data),
                this.ui.formatNumber(qtd, 3),
                item.frota || '-',
                this.ui.formatNumber(acumulado, 3)
            ];
        });
        
        doc.autoTable({
            head: headers,
            body: rows,
            startY: y + 5,
            theme: 'striped',
            headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255] },
            styles: { fontSize: 10, cellPadding: 3, halign: 'center', textColor: [0, 0, 0] },
            columnStyles: {
                0: { halign: 'center' }, // Data
                2: { halign: 'left' }    // Frota
            },
            foot: [
                ['TOTAL REALIZADO', this.ui.formatNumber(realizado, 3), '', ''],
                ['RESTANTE (META)', this.ui.formatNumber(restante, 3), '', '']
            ],
            footStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' }
        });

        // Footer / Signature Area
        const finalY = doc.lastAutoTable.finalY + 30;
        if (finalY < 250) {
            doc.setLineWidth(0.5);
            doc.line(40, finalY, 90, finalY);
            doc.line(120, finalY, 170, finalY);
            
            doc.setFontSize(8);
            doc.text("Responsável Emissão", 65, finalY + 5, { align: 'center' });
            doc.text("Responsável Transporte", 145, finalY + 5, { align: 'center' });
        }

        doc.save(`relatorio_os_${os}.pdf`);
    }

    async exportConsolidatedReport() {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            this.ui.showNotification('Biblioteca PDF não carregada.', 'error');
            return;
        }

        this.ui.showNotification('Gerando relatório consolidado...', 'info');

        try {
            // 1. Fetch Data
            // We need ALL OS and ALL Daily Items to build the report properly
            const [resOS, resDaily] = await Promise.all([
                this.api.getTransporteComposto(),
                this.api.getAllTransporteDiario()
            ]);

            if (!resOS.success) throw new Error('Falha ao buscar dados de OS');
            
            const osList = resOS.data || [];
            const dailyList = (resDaily.success && resDaily.data) ? resDaily.data : [];

            // 2. Process Data
            // Link daily items to OS
            const fullData = osList.map(os => {
                const items = dailyList.filter(d => d.os_id === os.id);
                const realizado = items.reduce((acc, curr) => acc + (parseFloat(curr.quantidade) || 0), 0);
                const meta = parseFloat(os.quantidade) || 0; // "quantidade" field in OS table stores the Goal/Meta
                const percent = meta > 0 ? (realizado / meta) * 100 : 0;
                
                return {
                    ...os,
                    items: items.sort((a,b) => new Date(a.data_transporte) - new Date(b.data_transporte)),
                    realizado: realizado,
                    meta: meta,
                    restante: meta - realizado,
                    percent: percent,
                    status: os.status || 'ABERTO'
                };
            });

            // Calculate Global Totals
            const totalOS = fullData.length;
            const totalTransportado = fullData.reduce((acc, curr) => acc + curr.realizado, 0);
            const totalMeta = fullData.reduce((acc, curr) => acc + curr.meta, 0);
            const totalPercent = totalMeta > 0 ? (totalTransportado / totalMeta) * 100 : 0;
            
            // Sort for Ranking (by % completion descending)
            const rankedData = [...fullData].sort((a,b) => b.percent - a.percent);
            const topOS = rankedData.length > 0 ? rankedData[0] : null;
            const bottomOS = rankedData.length > 0 ? rankedData[rankedData.length - 1] : null;

            // 3. Generate PDF
            const doc = new window.jspdf.jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            
            // Helper for Centered Text
            const centerText = (text, y) => {
                const textWidth = doc.getStringUnitWidth(text) * doc.internal.getFontSize() / doc.internal.scaleFactor;
                const x = (pageWidth - textWidth) / 2;
                doc.text(text, x, y);
            };

            // === TITLE PAGE / HEADER ===
            doc.setFontSize(18);
            doc.setFont(undefined, 'bold');
            centerText("Relatório Consolidado de Transportes Diários", 20);
            
            doc.setFontSize(12);
            doc.setFont(undefined, 'normal');
            centerText(`Múltiplas O.S. - Gerado em: ${new Date().toLocaleString('pt-BR')}`, 28);
            
            doc.line(14, 32, pageWidth - 14, 32);

            // === VISÃO GERAL ===
            let y = 45;
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text("1. Visão Geral Consolidada", 14, y);
            
            y += 10;
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            
            // Draw Overview Box
            doc.setDrawColor(200);
            doc.setFillColor(245, 247, 250);
            doc.rect(14, y, pageWidth - 28, 25, 'FD');
            
            y += 8;
            doc.text(`Total de O.S.: ${totalOS}`, 20, y);
            doc.text(`Total Transportado: ${this.ui.formatNumber(totalTransportado, 3)} t`, 80, y);
            
            y += 8;
            doc.text(`Meta Total: ${this.ui.formatNumber(totalMeta, 3)} t`, 20, y);
            doc.text(`Conclusão Geral: ${this.ui.formatNumber(totalPercent, 1)}%`, 80, y);
            
            // Visual Progress Bar for Global
            doc.setDrawColor(0);
            doc.rect(150, y - 10, 40, 6); // border
            const fillWidth = Math.min(40, (totalPercent / 100) * 40);
            doc.setFillColor(totalPercent >= 100 ? [40, 167, 69] : [0, 123, 255]);
            doc.rect(150, y - 10, fillWidth, 6, 'F');


            // === TABELA RESUMO ===
            y += 25;
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text("2. Tabela Resumo por O.S.", 14, y);
            
            y += 5;
            const summaryRows = fullData.map(item => [
                item.numero_os,
                item.fazenda || '-',
                item.produto || '-',
                this.ui.formatNumber(item.meta, 1),
                this.ui.formatNumber(item.realizado, 1),
                this.ui.formatNumber(item.restante, 1),
                `${this.ui.formatNumber(item.percent, 1)}%`,
                item.status
            ]);

            doc.autoTable({
                startY: y,
                head: [['Nº OS', 'Fazenda', 'Produto', 'Meta', 'Realizado', 'Restante', '%', 'Status']],
                body: summaryRows,
                theme: 'striped',
                headStyles: { fillColor: [44, 62, 80], fontSize: 9 },
                styles: { fontSize: 8, cellPadding: 2 },
                columnStyles: {
                    0: { cellWidth: 20, fontStyle: 'bold' },
                    6: { fontStyle: 'bold' }
                }
            });

            y = doc.lastAutoTable.finalY + 15;

            // === ANÁLISE COMPARATIVA ===
            // Check if we need new page
            if (y > 250) { doc.addPage(); y = 20; }
            
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text("3. Análise Comparativa e KPIs", 14, y);
            y += 10;

            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            
            // Top/Bottom
            const topText = topOS ? `${topOS.numero_os} (${this.ui.formatNumber(topOS.percent, 1)}%)` : '-';
            const botText = bottomOS ? `${bottomOS.numero_os} (${this.ui.formatNumber(bottomOS.percent, 1)}%)` : '-';
            
            doc.text(`• O.S. com maior avanço: ${topText}`, 20, y);
            y += 6;
            doc.text(`• O.S. com menor avanço: ${botText}`, 20, y);
            y += 6;
            doc.text(`• Média de transporte por O.S.: ${this.ui.formatNumber(totalOS > 0 ? totalTransportado / totalOS : 0, 2)} t`, 20, y);

            // === DETALHAMENTO ===
            y += 15;
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text("4. Detalhamento por O.S.", 14, y);
            y += 5;

            // Loop through each OS to print details
            fullData.forEach((os, index) => {
                // Check page break for header
                if (y > 250) { doc.addPage(); y = 20; }
                
                y += 10;
                
                // OS Header Box
                doc.setFillColor(230, 230, 230);
                doc.rect(14, y, pageWidth - 28, 18, 'F');
                
                doc.setFontSize(11);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(0,0,0);
                doc.text(`O.S. ${os.numero_os} - ${os.fazenda} (${os.status})`, 18, y + 6);
                
                doc.setFontSize(9);
                doc.setFont(undefined, 'normal');
                doc.text(`Responsável: ${os.responsavel_aplicacao || '-'} | Empresa: ${os.empresa || '-'} | Abertura: ${this.ui.formatDateBR(os.data_abertura)}`, 18, y + 12);
                
                y += 20;

                // Daily Table for this OS
                if (os.items.length > 0) {
                    doc.autoTable({
                        startY: y,
                        head: [['Data', 'Quantidade (t)', 'Frota']],
                        body: os.items.map(d => [
                            this.ui.formatDateBR(d.data_transporte),
                            this.ui.formatNumber(d.quantidade, 3),
                            d.frota || '-'
                        ]),
                        theme: 'grid',
                        headStyles: { fillColor: [100, 100, 100], fontSize: 8 },
                        styles: { fontSize: 8, cellPadding: 1 },
                        margin: { left: 20 }
                    });
                    y = doc.lastAutoTable.finalY;
                } else {
                    doc.setFontSize(9);
                    doc.setTextColor(100);
                    doc.text("(Sem registros diários lançados)", 20, y);
                    y += 5;
                }
            });

            // === RECOMENDAÇÕES ===
            if (y > 240) { doc.addPage(); y = 20; }
            y += 15;
            
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(0,0,0);
            doc.text("5. Observações", 14, y);
            y += 8;
            
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text("__________________________________________________________________________________", 14, y);
            y += 8;
            doc.text("__________________________________________________________________________________", 14, y);
            y += 8;
            doc.text("__________________________________________________________________________________", 14, y);

            // Footer
            const pageCount = doc.internal.getNumberOfPages();
            for(let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.text(`Página ${i} de ${pageCount}`, pageWidth - 30, doc.internal.pageSize.getHeight() - 10);
                doc.text("Controle de Insumos - Relatório Gerencial", 14, doc.internal.pageSize.getHeight() - 10);
            }

            doc.save(`relatorio_consolidado_${new Date().toISOString().slice(0,10)}.pdf`);
            this.ui.showNotification('Relatório gerado com sucesso!', 'success');

        } catch (err) {
            console.error(err);
            this.ui.showNotification('Erro ao gerar relatório: ' + err.message, 'error');
        }
    }

    // renderTransporteComposto() movido para cima e refatorado.
    
    // Global helpers for onclick
    toggleCompostoFields(readOnly) {
        const fields = [
            'composto-numero-os', 'composto-data-abertura', 'composto-responsavel', 
            'composto-empresa', 'composto-fazenda-codigo', 'composto-fazenda', 'composto-frente', 
            'composto-produto', 'composto-quantidade', 'composto-unidade', 
            'composto-atividade'
        ];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                // Special handling for data_abertura to force BR format in readonly mode
                if (id === 'composto-data-abertura') {
                    if (readOnly) {
                        // Store original value if needed or just use current value
                        const currentVal = el.value; // YYYY-MM-DD
                        // Change type to text to allow custom formatting display
                        el.setAttribute('type', 'text');
                        el.value = this.ui.formatDateBR(currentVal);
                    } else {
                        // Revert to date input
                        const currentVal = el.value; // DD/MM/YYYY
                        el.setAttribute('type', 'date');
                        // Try to convert back to YYYY-MM-DD for date input
                        if (currentVal && /^\d{2}\/\d{2}\/\d{4}$/.test(currentVal)) {
                            const [d, m, y] = currentVal.split('/');
                            el.value = `${y}-${m}-${d}`;
                        } else if (currentVal && /^\d{4}-\d{2}-\d{2}$/.test(currentVal)) {
                             el.value = currentVal;
                        }
                    }
                }

                el.readOnly = readOnly;
                // Use CSS classes for better styling and theme support
                if (readOnly) {
                    el.classList.add('readonly-input');
                    // Remove inline styles that might conflict
                    el.style.backgroundColor = '';
                    el.style.cursor = '';
                    el.style.opacity = '';
                } else {
                    el.classList.remove('readonly-input');
                    el.style.backgroundColor = '';
                    el.style.cursor = '';
                    el.style.opacity = '';
                }
            }
        });
    }

    async editComposto(id) {
        this.ui.showNotification('Carregando dados...', 'info');
        try {
            console.log('🔄 Buscando dados do transporte composto:', id);
            const res = await this.api.getTransporteCompostoById(id);
            
            if (res && res.success && res.data) {
                console.log('✅ Dados recebidos:', res.data);
                
                // Aguardar o preenchimento do formulário
                try {
                    await this.fillCompostoForm(res.data);
                    console.log('📝 Formulário preenchido com sucesso');
                } catch (fillError) {
                    console.error('⚠️ Erro ao preencher formulário (continuando abertura do modal):', fillError);
                    this.ui.showNotification('Alerta: Alguns dados podem não ter sido carregados.', 'warning');
                }
                
                // Set hidden ID
                const idField = document.getElementById('composto-id');
                if (idField) idField.value = id;
                
                // Lock fields for editing (View Mode)
                this.toggleCompostoFields(true);
                
                // Show Modal
                const modal = document.getElementById('modal-transporte-composto');
                if (modal) {
                    console.log('🔓 Abrindo modal de transporte composto (forcing z-index & visibility)');
                    
                    // 1. Move para o body para evitar problemas de overflow/z-index do pai
                    if (modal.parentNode !== document.body) {
                        document.body.appendChild(modal);
                    }

                    // 2. Reset de Classes e Estilos
                    modal.classList.remove('fade'); // Remove fade se existir
                    modal.classList.add('show');    // Adiciona show por precaução
                    
                    // 3. Força Visual Extrema
                    modal.style.cssText = `
                        display: block !important;
                        z-index: 99999 !important;
                        opacity: 1 !important;
                        visibility: visible !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                        background-color: rgba(0,0,0,0.5) !important;
                    `;
                    
                    // 4. Garante que o conteúdo interno esteja visível e sem animações bugadas
                    const content = modal.querySelector('.modal-content');
                    if (content) {
                        content.style.display = 'flex';
                        content.style.opacity = '1';
                        content.style.visibility = 'visible';
                        content.style.animation = 'none'; // Desativa animação temporariamente
                    }

                } else {
                    console.error('❌ Modal #modal-transporte-composto não encontrado no DOM');
                    this.ui.showNotification('Erro interno: Modal não encontrado.', 'error');
                }
            } else {
                console.warn('⚠️ Dados não encontrados ou erro na resposta:', res);
                this.ui.showNotification('Erro ao carregar registro.', 'error');
            }
        } catch (e) {
            console.error('❌ Erro fatal em editComposto:', e);
            this.ui.showNotification('Erro de conexão ou processamento.', 'error');
        }
    }
    
    async deleteComposto(id) {
        if(confirm('Excluir este registro?')) {
             let frente = null;
             // Try to fetch or find in cache if available, but here we just fetch by ID if needed or rely on simple fetch
             // Since we don't have a reliable cache variable exposed here (maybe this.transporteCompostoData?), we try api
             try {
                 const { data } = await this.api.getTransporteCompostoById(id);
                 if (data) frente = data.frente;
             } catch(e) { console.warn('Ignore fetch error on delete', e); }

             const res = await this.api.deleteTransporteComposto(id);
             if(res && res.success) {
                 this.ui.showNotification('Excluído com sucesso', 'success');
                 
                 if (frente) {
                     await this.updateEstoqueFromOS(frente);
                     await this.loadEstoqueAndRender();
                 }

                 this.renderTransporteComposto();
             } else {
                 this.ui.showNotification('Erro ao excluir', 'error');
             }
        }
    }

    // === OS Transporte Diário Methods ===

    async loadOSTransporteDiario(osId) {
        const tbody = document.getElementById('os-transporte-body');
        const tfootTotal = document.getElementById('os-transporte-total-qtd');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="4" class="loading">Carregando...</td></tr>';
        
        try {
            const res = await this.api.getOSTransporteDiario(osId);
            if (res && res.success) {
                const list = res.data || [];
                
                if (list.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-light);">Nenhum lançamento.</td></tr>';
                    if (tfootTotal) tfootTotal.textContent = '0.000';
                    return;
                }
                
                let total = 0;
                tbody.innerHTML = list.map(item => {
                    const qtd = Number(item.quantidade) || 0;
                    total += qtd;
                    return `
                    <tr>
                        <td>${this.ui.formatDateBR(item.data_transporte)}</td>
                        <td>${this.ui.formatNumber(qtd, 3)}</td>
                        <td>${item.frota || '-'}</td>
                        <td>
                            <button class="btn btn-sm btn-delete-os-transporte" data-id="${item.id}" style="color:red; border:none; background:transparent; cursor:pointer;" title="Excluir">🗑️</button>
                        </td>
                    </tr>
                    `;
                }).join('');
                
                if (tfootTotal) tfootTotal.textContent = this.ui.formatNumber(total, 3);
                
                // Add listeners for delete buttons
                tbody.querySelectorAll('.btn-delete-os-transporte').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent bubbling if needed
                        const id = e.target.closest('button').getAttribute('data-id');
                        this.deleteOSTransporte(id, osId);
                    });
                });
                
            } else {
                tbody.innerHTML = '<tr><td colspan="4" style="color:red;">Erro ao carregar.</td></tr>';
            }
        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="4" style="color:red;">Erro de conexão.</td></tr>';
        }
    }

    async addOSTransporteDiario() {
        if (!this.currentOSData || !this.currentOSData.id) {
            this.ui.showNotification('Salve a OS primeiro.', 'warning');
            return;
        }

        const dataInput = document.getElementById('os-transporte-data');
        const qtdInput = document.getElementById('os-transporte-qtd');
        const frotaInput = document.getElementById('os-transporte-frota');

        if (!dataInput.value || !qtdInput.value) {
            this.ui.showNotification('Preencha Data e Quantidade.', 'warning');
            return;
        }

        const payload = {
            os_id: this.currentOSData.id,
            data_transporte: dataInput.value,
            quantidade: parseFloat(qtdInput.value),
            frota: frotaInput.value
        };

        this.ui.showLoading();
        try {
            const res = await this.api.saveOSTransporteDiario(payload);
            if (res && res.success) {
                this.ui.showNotification('Adicionado com sucesso!', 'success');
                // Clear inputs
                dataInput.value = '';
                qtdInput.value = '';
                frotaInput.value = '';
                // Reload list
                await this.loadOSTransporteDiario(this.currentOSData.id);
            } else {
                this.ui.showNotification('Erro ao adicionar.', 'error');
            }
        } catch (e) {
            console.error(e);
            this.ui.showNotification('Erro ao adicionar.', 'error');
        } finally {
            this.ui.hideLoading();
        }
    }

    async deleteOSTransporte(id, osId) {
        if (!confirm('Excluir este lançamento?')) return;
        
        this.ui.showLoading();
        try {
            const res = await this.api.deleteOSTransporteDiario(id);
            if (res && res.success) {
                this.ui.showNotification('Excluído.', 'success');
                await this.loadOSTransporteDiario(osId);
            } else {
                this.ui.showNotification('Erro ao excluir.', 'error');
            }
        } catch (e) {
            console.error(e);
            this.ui.showNotification('Erro ao excluir.', 'error');
        } finally {
            this.ui.hideLoading();
        }
    }
}



// Inicializar aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    console.log('App started - Version 20260119-4-FIX');
    // Verificar se já existe uma instância para evitar duplicação
    if (!window.insumosApp) {
        window.insumosApp = new InsumosApp();
        window.insumosApp.init().catch(e => console.error('Init failed:', e));
    }
});

InsumosApp.prototype.setupAIAnalysis = function() {
    const btnAnalyze = document.getElementById('btn-analyze-image');
    const fileInput = document.getElementById('ai-image-input');
    const imgPreview = document.getElementById('ai-image-preview');
    const placeholder = document.getElementById('ai-preview-placeholder');
    const loadingDiv = document.getElementById('ai-loading');
    const progressSpan = document.getElementById('ai-progress');

    if (!btnAnalyze || !fileInput) return;

    // 1. Handle File Selection
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                if (imgPreview) {
                    imgPreview.src = evt.target.result;
                    imgPreview.style.display = 'block';
                }
                if (placeholder) placeholder.style.display = 'none';
                btnAnalyze.disabled = false;
                btnAnalyze.textContent = '✨ Analisar com IA';
            };
            reader.readAsDataURL(file);
        }
    });

    // 2. Handle Analysis Click
    btnAnalyze.addEventListener('click', async () => {
        if (!fileInput.files[0]) return;

        // UI Loading State
        btnAnalyze.disabled = true;
        btnAnalyze.textContent = '⏳ Analisando...';
        if (loadingDiv) loadingDiv.style.display = 'block';
        
        try {
            // Get Base64
            const base64 = imgPreview.src;
            
            // Try Direct Gemini API Call first (since Supabase Edge Function has CORS issues on local file://)
            // Using window.apiService.analyzeImage which connects directly to Google
            console.log('Tentando análise direta via API Gemini (Client-side)...');
            const directResult = await window.apiService.analyzeImage(fileInput.files[0]);
            
            if (directResult.success) {
                var aiData = directResult.data;
            } else {
                console.warn('Falha na análise direta, tentando Supabase/Local...', directResult.message);
                
                // Fallback: Call Supabase Edge Function
                const { data: result, error } = await this.api.supabase.functions.invoke('analyze-image', {
                    body: { imageBase64: base64 }
                });

                if (error) {
                     console.error('Supabase Function Error:', error);
                     // Fallback to local server
                     try {
                        const localResp = await fetch('http://localhost:3000/api/analyze-image', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ imageBase64: base64 })
                        });
                        const localResult = await localResp.json();
                        if (localResult.success) {
                            var aiData = localResult.data;
                        } else {
                            throw new Error(error.message || 'Erro na análise via Edge Function e Local');
                        }
                     } catch (localErr) {
                         throw new Error(directResult.message || error.message || 'Erro na análise de imagem');
                     }
                } else {
                     if (!result.success) throw new Error(result.message);
                     var aiData = result.data;
                }
            }

            // Fill Fields with Real Data
            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el) {
                    el.value = val;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            };

            setVal('qual-gemas-total', aiData.gemas.total);
            setVal('qual-gemas-boas', aiData.gemas.boas);
            setVal('qual-gemas-ruins', aiData.gemas.ruins);

            setVal('qual-toletes-total', aiData.toletes.total);
            setVal('qual-toletes-bons', aiData.toletes.bons);
            setVal('qual-toletes-ruins', aiData.toletes.ruins);

            if (this.ui && this.ui.showNotification) {
                this.ui.showNotification(`Análise Realizada! Gemas: ${aiData.gemas.total}, Toletes: ${aiData.toletes.total}`, 'success', 5000);
            }
            btnAnalyze.textContent = '✅ Sucesso!';

        } catch (error) {
            console.error(error);
            if (this.ui && this.ui.showNotification) {
                this.ui.showNotification(`Erro: ${error.message}`, 'error');
            }
            btnAnalyze.textContent = '❌ Erro';
        } finally {
            // Reset UI
            if (loadingDiv) loadingDiv.style.display = 'none';
            btnAnalyze.disabled = false;
            
            setTimeout(() => {
                btnAnalyze.textContent = '✨ Analisar Novamente';
            }, 3000);
        }
    });
};

InsumosApp.prototype.updateInsumosDashboard = function(data) {
    const num = v => {
        if (typeof v === 'number') return v;
        if (typeof v === 'string') { const n = parseFloat(v.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; }
        return 0;
    };
    const keyOf = i => {
        const k2 = i.produto || '-';
        const k3 = i.fazenda || '-';
        const k4 = i.frente != null ? String(i.frente) : '-';
        const k5 = i.dataInicio ? this.ui.formatDateBR(i.dataInicio) : '-';
        return `${k2}|${k3}|${k4}|${k5}`;
    };
    const groups = new Map();
    data.forEach(i => {
        const k = keyOf(i);
        const g = groups.get(k) || { areaTalhaoSum: 0, areaAplicadaMax: 0, quantidadeMax: 0 };
        g.areaTalhaoSum += num(i.areaTalhao);
        g.areaAplicadaMax = Math.max(g.areaAplicadaMax, num(i.areaTotalAplicada));
        g.quantidadeMax = Math.max(g.quantidadeMax, num(i.quantidadeAplicada));
        groups.set(k, g);
    });
    const totalAreaTalhao = Array.from(groups.values()).reduce((s,g)=>s+g.areaTalhaoSum,0);
    const totalAreaAplicada = Array.from(groups.values()).reduce((s,g)=>s+g.areaAplicadaMax,0);
    const totalQuantidade = Array.from(groups.values()).reduce((s,g)=>s+g.quantidadeMax,0);
    const produtos = new Set(data.map(i => i.produto).filter(Boolean));
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('dash-total-registros', String(groups.size));
    setText('dash-area-talhao', this.ui.formatNumber(totalAreaTalhao) + ' ha');
    setText('dash-area-aplicada', this.ui.formatNumber(totalAreaAplicada) + ' ha');
    setText('dash-quantidade', this.ui.formatNumber(totalQuantidade, 3));
    setText('dash-produtos-distintos', String(produtos.size));
};

InsumosApp.prototype.destroyChart = function(ctxId, chartProp) {
    const ctx = document.getElementById(ctxId);
    if (ctx) {
        const existing = Chart.getChart(ctx);
        if (existing) existing.destroy();
    }
    if (this._charts && this._charts[chartProp]) {
        this._charts[chartProp].destroy();
        this._charts[chartProp] = null;
    }
};

InsumosApp.prototype.updateCharts = function(data) {
    try {
        if (!window.Chart) return;

        // Destroy existing charts first using the helper to prevent "invisible infinite" issues
        this.destroyChart('chart-recomendacao-dose', 'doseProd');
        this.destroyChart('chart-recomendacao-aplicacao', 'doseGlobal');
        this.destroyChart('chart-recomendacao-diferenca', 'diffProd');

        if (!data || data.length === 0) {
            console.log('Nenhum dado para exibir nos gráficos de Insumos.');
            // Continue to render empty charts
        }

        const byProdutoDose = {};
        const num = v => {
            if (typeof v === 'number') return v;
            if (typeof v === 'string') { const n = parseFloat(v.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; }
            return 0;
        };
        data.forEach(i => {
            const prod = i.produto || '—';
            const doseRec = num(i.doseRecomendada);
            // Prioridade: doseAplicada > insumDoseAplicada > Calculada
            let doseApl = 0;
            if (i.doseAplicada != null && i.doseAplicada > 0) {
                doseApl = num(i.doseAplicada);
            } else if (i.insumDoseAplicada != null && i.insumDoseAplicada > 0) {
                doseApl = num(i.insumDoseAplicada);
            } else if (num(i.areaTotalAplicada) > 0 && i.quantidadeAplicada != null) {
                doseApl = num(i.quantidadeAplicada) / num(i.areaTotalAplicada);
            }

            if (!byProdutoDose[prod]) byProdutoDose[prod] = { recSum: 0, recCount: 0, aplSum: 0, aplCount: 0 };
            if (doseRec > 0) { byProdutoDose[prod].recSum += doseRec; byProdutoDose[prod].recCount += 1; }
            if (doseApl > 0) { byProdutoDose[prod].aplSum += doseApl; byProdutoDose[prod].aplCount += 1; }
        });
        let produtos = Object.keys(byProdutoDose);
        let recAvg = produtos.map(p => byProdutoDose[p].recCount ? byProdutoDose[p].recSum/byProdutoDose[p].recCount : 0);
        let aplAvg = produtos.map(p => byProdutoDose[p].aplCount ? byProdutoDose[p].aplSum/byProdutoDose[p].aplCount : 0);
        let diffPct = produtos.map((p, idx) => {
            const r = recAvg[idx]; const a = aplAvg[idx];
            return (r>0 && a>0) ? ((a/r - 1)*100) : 0;
        });
        const idxs = produtos.map((p,i)=>i).sort((a,b)=>{
            const pa = produtos[a].toLowerCase();
            const pb = produtos[b].toLowerCase();
            if (this.chartOrder === 'az') return pa.localeCompare(pb);
            if (this.chartOrder === 'za') return pb.localeCompare(pa);
            if (this.chartOrder === 'diff_asc') return diffPct[a] - diffPct[b];
            if (this.chartOrder === 'diff_desc') return diffPct[b] - diffPct[a];
            return pa.localeCompare(pb);
        });
        produtos = idxs.map(i=>produtos[i]);
        recAvg = idxs.map(i=>recAvg[i]);
        aplAvg = idxs.map(i=>aplAvg[i]);
        diffPct = idxs.map(i=>diffPct[i]);
        
        // IDs matched to renderInsumos HTML
        const doseProdCtx = document.getElementById('chart-recomendacao-dose');
        const doseGlobalCtx = document.getElementById('chart-recomendacao-aplicacao');
        const diffProdCtx = document.getElementById('chart-recomendacao-diferenca');
        
        if (!this._charts) this._charts = {};

        if (doseProdCtx) {
            const gradRec = this.createGradient(doseProdCtx, '#22c55e', '#15803d'); // Green 500-700
            const gradApl = this.createGradient(doseProdCtx, '#f59e0b', '#b45309'); // Amber 500-700

            const doseProdData = {
                labels: produtos,
                datasets: [
                    { 
                        label: 'Dose Recomendada', 
                        data: recAvg, 
                        backgroundColor: gradRec,
                        borderRadius: 8,
                        barPercentage: 0.7,
                        categoryPercentage: 0.8
                    },
                    { 
                        label: 'Dose Aplicada', 
                        data: aplAvg, 
                        backgroundColor: gradApl,
                        borderRadius: 8,
                        barPercentage: 0.7,
                        categoryPercentage: 0.8
                    }
                ]
            };
            this._charts.doseProd = new Chart(doseProdCtx, { 
                type: 'bar', 
                data: doseProdData, 
                options: this.getCommonChartOptions({
                    scales: { y: { beginAtZero: true } }
                })
            });
        }
        
        if (doseGlobalCtx) {
            const gradRec = this.createGradient(doseGlobalCtx, '#22c55e', '#15803d');
            const gradApl = this.createGradient(doseGlobalCtx, '#f59e0b', '#b45309');

            const globalRec = recAvg.reduce((s,v)=>s+v,0)/ (recAvg.filter(v=>v>0).length || 1);
            const globalApl = aplAvg.reduce((s,v)=>s+v,0)/ (aplAvg.filter(v=>v>0).length || 1);
            const doseGlobalData = {
                labels: ['Global'],
                datasets: [
                    { 
                        label: 'Dose Recomendada', 
                        data: [globalRec], 
                        backgroundColor: gradRec,
                        borderRadius: 8,
                        barPercentage: 0.7
                    },
                    { 
                        label: 'Dose Aplicada', 
                        data: [globalApl], 
                        backgroundColor: gradApl,
                        borderRadius: 8,
                        barPercentage: 0.7
                    }
                ]
            };
            this._charts.doseGlobal = new Chart(doseGlobalCtx, { 
                type: 'bar', 
                data: doseGlobalData, 
                options: this.getCommonChartOptions({
                    scales: { y: { beginAtZero: true } }
                })
            });
        }
        
        if (diffProdCtx) {
            const gradDiff = this.createGradient(diffProdCtx, '#3b82f6', '#1d4ed8'); // Blue 500-700
            const diffProdData = {
                labels: produtos,
                datasets: [ { 
                    label: 'Diferença (%)', 
                    data: diffPct, 
                    backgroundColor: gradDiff,
                    borderRadius: 8,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                } ]
            };

            this._charts.diffProd = new Chart(diffProdCtx, { 
                type: 'bar', 
                data: diffProdData, 
                options: this.getCommonChartOptions({
                    indexAxis: 'y',
                    scales: {
                        x: { ticks: { callback: v => v + '%' } }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: (ctx) => `Diferença: ${ctx.raw.toFixed(2)}%`
                            }
                        }
                    }
                })
            });
        }
    } catch(e) {
        console.error('chart error', e);
    }
};

InsumosApp.prototype.loadEstoqueAndRender = async function(showAlerts = false) {
        if (this.isLoadingEstoque) return;
        this.isLoadingEstoque = true;
        try {
            const [resEstoque, resOS, resImport] = await Promise.all([
                this.api.getEstoque(),
                this.api.getOSList(), 
                this.api.getInsumosFazendas()
            ]);

            if (!resEstoque || !resEstoque.success) { this.isLoadingEstoque = false; return; }
            
            const estoqueList = Array.isArray(resEstoque.data) ? resEstoque.data : [];
            const osList = (resOS && resOS.success && Array.isArray(resOS.data)) ? resOS.data : [];
            const importList = (resImport && resImport.success && Array.isArray(resImport.data)) ? resImport.data : [];

            // Processar nomes de produtos e OSs
            estoqueList.forEach(item => {
                if (item.produto && item.produto.includes('__OS__')) {
                    const parts = item.produto.split('__OS__');
                    item.cleanProduto = parts[0].trim().toUpperCase();
                    item.realOS = parts[1];
                } else {
                    item.cleanProduto = item.produto ? item.produto.trim().toUpperCase() : '';
                    item.realOS = item.os_numero || '';
                }
            });

            // Coletar frentes únicas
            const frentesEstoque = estoqueList.map(e => e.frente).filter(Boolean);
            const frentesOS = osList.map(o => o.frente).filter(Boolean);
            const frentesImport = importList.map(i => i.frente).filter(Boolean);
            const todasFrentes = [...new Set([...frentesEstoque, ...frentesOS, ...frentesImport])].sort((a,b) => 
                a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'})
            );

            // Helper para atualizar dropdowns
            const updateSelect = (id, options, includeAllOption = false) => {
                const sel = document.getElementById(id);
                if (!sel) return;
                const currentVal = sel.value;
                
                let html = '';
                if (includeAllOption) html += '<option value="all">Todas as Frentes</option>';
                else html += '<option value="">Selecione</option>'; 

                options.forEach(opt => {
                    html += `<option value="${opt}">${opt}</option>`;
                });
                
                if (sel.innerHTML.length < 50 || sel.options.length !== (options.length + (includeAllOption?1:1))) {
                     sel.innerHTML = html;
                     if (currentVal && (options.includes(currentVal) || currentVal === 'all')) {
                         sel.value = currentVal;
                     } else if (includeAllOption) {
                         sel.value = 'all';
                     }
                }
            };

            updateSelect('estoque-frente-filter', todasFrentes, true);
            updateSelect('estoque-frente', todasFrentes, false);

            // Popular Dropdown de O.S. (Manual e Modal Adubo)
            const osNumbersOS = osList.map(o => o.numero).filter(Boolean);
            const osNumbersImport = importList.map(i => i.os).filter(Boolean);
            const osNumbers = [...new Set([...osNumbersOS, ...osNumbersImport])].sort((a,b) => {
                 const na = parseInt(a);
                 const nb = parseInt(b);
                 if (!isNaN(na) && !isNaN(nb)) return na - nb;
                 return String(a).localeCompare(String(b));
            });
            updateSelect('estoque-os-manual', osNumbers, false);
            // updateSelect('modal-viagem-adubo-os', osNumbers, false); // Removed: Handled by populateViagemAduboSelects with better formatting

            // Popular Dropdown de PRODUTOS
            const prodsEstoque = estoqueList.map(e => e.produto).filter(Boolean);
            const prodsImport = importList.map(i => i.produto).filter(Boolean);
            const prodsOS = [];
            osList.forEach(os => {
                if (os.produtos && Array.isArray(os.produtos)) {
                    os.produtos.forEach(p => {
                        if (p.produto) prodsOS.push(p.produto);
                    });
                }
            });

            const todosProdutos = [...new Set([...prodsEstoque, ...prodsOS, ...prodsImport])].sort();
            updateSelect('estoque-produto', todosProdutos, false);
            
            if (todosProdutos.length === 0) {
                const padrao = ['BIOZYME', '04-30-10', 'QUALITY', 'AZOKOP', 'SURVEY (FIPRONIL)', 'OXIFERTIL', 'LANEX 800 WG (REGENTE)', 'COMET', 'COMPOSTO', '10-49-00', 'PEREGRINO', 'NO-NEMA'];
                 updateSelect('estoque-produto', padrao.sort(), false);
            }

            // === CÁLCULO DE CONSUMO DIÁRIO (Últimos 30 dias) & DETECÇÃO DE OVERDOSE ===
            // === CÁLCULO DE CONSUMO DIÁRIO (Média Histórica) & DETECÇÃO DE OVERDOSE ===
            const consumptionStats = {};
            const overdoseList = []; // Lista para alertas de dose excedida
            // const thirtyDaysAgo = new Date();
            // thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const twoDaysAgo = new Date(); // Janela para alertas de overdose recentes
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

            importList.forEach(item => {
                if (!item.produto) return;
                
                const dateStr = item.dataInicio || item.data_inicio || item.inicio;
                const date = dateStr ? new Date(dateStr) : null;

                // Verificação de Overdose (Dose Aplicada > Dose Recomendada)
                const doseRec = parseFloat(item.doseRecomendada || item.dose_recomendada || 0);
                const doseApp = parseFloat(item.doseAplicada || item.dose_aplicada || 0);
                
                if (date && date >= twoDaysAgo && doseRec > 0 && doseApp > doseRec) {
                     const excessPct = ((doseApp / doseRec) - 1) * 100;
                     // Apenas alertar se exceder 2% (margem de erro/arredondamento)
                     if (excessPct > 2) { 
                         overdoseList.push({
                             produto: item.produto,
                             fazenda: item.fazenda || 'N/A',
                             talhao: item.talhao || item.frente || 'N/A',
                             doseRec: doseRec,
                             doseApp: doseApp,
                             pct: excessPct.toFixed(1)
                         });
                     }
                }

                const qtd = parseFloat(item.quantidadeAplicada || item.quantidade_aplicada || 0);
                if (qtd <= 0) return;

                // Cálculo de Consumo (Usar TODO o histórico para média estável)
                if (date) {
                    const pName = item.produto.trim().toUpperCase(); // Normalização UpperCase
                    if (!consumptionStats[pName]) {
                        consumptionStats[pName] = { 
                            total: 0, 
                            earliestDate: new Date() 
                        };
                    }
                    consumptionStats[pName].total += qtd;

                    // Rastrear a data mais antiga com consumo
                    if (date < consumptionStats[pName].earliestDate) {
                        consumptionStats[pName].earliestDate = date;
                    }
                }
            });
            
            const now = new Date();
            // Média diária ajustada POR PRODUTO
            const finalConsumptionStats = {}; // Objeto final mapeando Produto -> Média Diária

            Object.keys(consumptionStats).forEach(pName => {
                const stats = consumptionStats[pName];
                
                // Calcular divisor dinâmico para ESTE produto (dias desde o início do uso)
                let daysDivisor = Math.ceil((now - stats.earliestDate) / (1000 * 60 * 60 * 24));
                
                // Garantir limites lógicos
                if (daysDivisor < 1) daysDivisor = 1;
                // if (daysDivisor > 30) daysDivisor = 30; // REMOVIDO limite de 30 dias para usar histórico real

                finalConsumptionStats[pName] = stats.total / daysDivisor;
            });
            
            // Substituir a variável antiga pela nova estrutura
            Object.keys(consumptionStats).forEach(key => delete consumptionStats[key]);
            Object.assign(consumptionStats, finalConsumptionStats);

            // === PREPARAÇÃO DOS GRÁFICOS ===
            const estoqueMap = {};
            estoqueList.forEach(item => {
                if (!estoqueMap[item.frente]) estoqueMap[item.frente] = {};
                // Usar cleanProduto para agrupar no gráfico também
                const prodName = item.cleanProduto || item.produto; 
                estoqueMap[item.frente][prodName] = (estoqueMap[item.frente][prodName] || 0) + (parseFloat(item.quantidade) || 0);
            });

            const ctx = document.getElementById('chart-estoque-frente');
            if (ctx) {
                this.destroyChart('chart-estoque-frente', 'estoqueFrente');
                if (!this._charts) this._charts = {};
                let chartData;
                const gradientEstoque = this.createGradient(ctx, '#a855f7', '#7e22ce');
                
                const currentFilter = document.getElementById('estoque-frente-filter')?.value || 'all';
                this.estoqueFilters.frente = currentFilter;

                if (this.estoqueFilters.frente === 'all') {
                    const aggregated = {};
                    Object.values(estoqueMap).forEach(prodMap => {
                        Object.entries(prodMap).forEach(([prod, qtd]) => {
                            aggregated[prod] = (aggregated[prod] || 0) + qtd;
                        });
                    });
                    const rows = Object.entries(aggregated);
                    const filteredRows = this.estoqueFilters.produto ? rows.filter(([prod]) => prod.toLowerCase().includes(this.estoqueFilters.produto.toLowerCase())) : rows;
                    filteredRows.sort((a,b) => b[1] - a[1]);
                    const limitedRows = filteredRows.slice(0, 30);
                    if (filteredRows.length > 30) {
                         const othersCount = filteredRows.slice(30).reduce((acc, [,v]) => acc + v, 0);
                         limitedRows.push(['Outros...', othersCount]);
                    }
                    const labels = limitedRows.map(([prod]) => prod);
                    const values = limitedRows.map(([,v]) => v);
                    chartData = { labels, datasets: [{ label: 'Estoque Total (Todas as Frentes)', data: values, backgroundColor: gradientEstoque, borderRadius: 8, barPercentage: 0.7, categoryPercentage: 0.8 }] };
                } else {
                    const f = this.estoqueFilters.frente;
                    const byProd = estoqueMap[f] || {};
                    const rows = Object.entries(byProd);
                    const filteredRows = this.estoqueFilters.produto ? rows.filter(([prod]) => prod.toLowerCase().includes(this.estoqueFilters.produto.toLowerCase())) : rows;
                    filteredRows.sort((a,b) => b[1] - a[1]);
                    const limitedRows = filteredRows.slice(0, 30);
                    if (filteredRows.length > 30) {
                         const othersCount = filteredRows.slice(30).reduce((acc, [,v]) => acc + v, 0);
                         limitedRows.push(['Outros...', othersCount]);
                    }
                    const labels = limitedRows.map(([prod]) => prod);
                    const values = limitedRows.map(([,v]) => v);
                    chartData = { labels, datasets: [{ label: `Estoque - ${f}`, data: values, backgroundColor: gradientEstoque, borderRadius: 8, barPercentage: 0.7, categoryPercentage: 0.8 }] };
                }
                
                if (chartData && chartData.labels && chartData.labels.length > 0) {
                    this._charts.estoqueFrente = new Chart(ctx, { type: 'bar', data: chartData, options: this.getCommonChartOptions({ indexAxis: 'y', scales: { x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: (context) => { let label = context.dataset.label || ''; if (label) label += ': '; if (context.parsed.x !== null) label += context.parsed.x.toLocaleString('pt-BR'); return label; } } } } }) });
                }
            }

            // === RENDERIZAÇÃO DA TABELA COM ALERTAS ===
            const tbody = document.getElementById('estoque-table-body');
            const alertList = []; 

            if (tbody) {
                const currentFilter = document.getElementById('estoque-frente-filter')?.value || 'all';
                let filteredList = estoqueList.filter(item => {
                    const matchFrente = currentFilter === 'all' || item.frente === currentFilter;
                    const matchProd = !this.estoqueFilters.produto || item.produto.toLowerCase().includes(this.estoqueFilters.produto.toLowerCase());
                    return matchFrente && matchProd;
                });
                
                filteredList.sort((a,b) => {
                    const dateA = a.data_cadastro ? new Date(a.data_cadastro) : new Date(0);
                    const dateB = b.data_cadastro ? new Date(b.data_cadastro) : new Date(0);
                    return (dateB - dateA) || a.frente.localeCompare(b.frente) || a.produto.localeCompare(b.produto);
                });

                // Atualizar cabeçalho da tabela se necessário
                const thead = document.querySelector('#estoque-table thead tr');
                if (thead && !thead.innerHTML.includes('Duração Est.')) {
                    const actionTh = thead.lastElementChild;
                    const durationTh = document.createElement('th');
                    durationTh.textContent = 'Duração Est.';
                    thead.insertBefore(durationTh, actionTh);
                }

                if (filteredList.length === 0) {
                     tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum registro de estoque encontrado.</td></tr>';
                } else {
                    tbody.innerHTML = filteredList.map(r => {
                        const qtd = parseFloat(r.quantidade) || 0;
                        const colorClass = qtd <= 0 ? 'text-danger fw-bold' : 'text-success fw-bold';
                        
                        // Lógica de Consumo
                        const dailyAvg = consumptionStats[r.cleanProduto] || 0;
                        let durationStr = '-';
                        let daysLeft = Infinity;

                        if (qtd > 0 && dailyAvg > 0) {
                            daysLeft = qtd / dailyAvg;
                            if (daysLeft < 1) durationStr = '< 1 dia';
                            else durationStr = `${Math.floor(daysLeft)} dias`;
                            
                            // Verificar Alerta (Abaixo de 5 dias)
                            if (daysLeft < 5) {
                                alertList.push({
                                    produto: r.cleanProduto,
                                    frente: r.frente,
                                    dias: Math.floor(daysLeft)
                                });
                            }
                        } else if (qtd > 0 && dailyAvg === 0) {
                            durationStr = '∞';
                        } else {
                            durationStr = '-';
                        }

                        return `
                        <tr>
                            <td>${this.ui.formatDateBR(r.data_cadastro)}</td>
                            <td>${r.realOS || r.os_numero || '-'}</td>
                            <td>${r.frente}</td>
                            <td>${r.cleanProduto}</td>
                            <td class="${colorClass}">${this.ui.formatNumber(qtd, 3)}</td>
                            <td style="font-weight:bold; color: ${daysLeft < 5 ? '#ef4444' : '#10b981'}">${durationStr}</td>
                            <td><button class="btn btn-delete-estoque" data-frente="${r.frente}" data-produto="${r.produto}">🗑️ Excluir</button></td>
                        </tr>
                    `}).join('');
                }
            }
            
            // === DISPARAR MODAL DE ALERTA ===
            if (showAlerts && (alertList.length > 0 || overdoseList.length > 0)) {
                // Verificar Snooze (1 hora)
                const snoozeUntil = localStorage.getItem('alert_snooze_until');
                if (snoozeUntil && Date.now() < parseInt(snoozeUntil)) {
                    // Alerta silenciado
                    return;
                }

                let msgHtml = '';

                // Alertas de Estoque Baixo
                if (alertList.length > 0) {
                    const groupedAlerts = {};
                    alertList.forEach(a => {
                        if (!groupedAlerts[a.produto]) groupedAlerts[a.produto] = [];
                        groupedAlerts[a.produto].push(`${a.frente} (${a.dias} dias)`);
                    });

                    msgHtml += '<div style="margin-bottom: 15px;"><strong>⚠️ Estoque Crítico (Menos de 5 dias):</strong><br/><ul style="text-align:left; margin-top:5px; margin-bottom: 0;">';
                    Object.entries(groupedAlerts).forEach(([prod, details]) => {
                        msgHtml += `<li><strong>${prod}</strong>: ${details.join(', ')}</li>`;
                    });
                    msgHtml += '</ul></div>';
                }

                // Alertas de Overdose
                if (overdoseList.length > 0) {
                    const groupedOverdoses = {};
                    overdoseList.forEach(o => {
                        if (!groupedOverdoses[o.produto]) groupedOverdoses[o.produto] = [];
                        groupedOverdoses[o.produto].push(`${o.fazenda}/${o.talhao} (+${o.pct}%)`);
                    });

                    msgHtml += '<div style="color: #b91c1c;"><strong>🛑 Dose Excedida (Últimos 2 dias):</strong><br/><ul style="text-align:left; margin-top:5px; margin-bottom: 0;">';
                    Object.entries(groupedOverdoses).forEach(([prod, details]) => {
                         const showDetails = details.length > 5 ? details.slice(0, 5).concat([`...e mais ${details.length - 5}`]) : details;
                         msgHtml += `<li><strong>${prod}</strong>: ${showDetails.join(', ')}</li>`;
                    });
                    msgHtml += '</ul></div>';
                }

                const alertModal = document.getElementById('alert-modal');
                const alertMsg = document.getElementById('alert-modal-message');
                if (alertModal && alertMsg) {
                     alertMsg.innerHTML = msgHtml;
                     
                     // Reset checkbox state
                     const snoozeCheck = document.getElementById('alert-snooze-check');
                     if (snoozeCheck) snoozeCheck.checked = false;

                     alertModal.style.display = 'flex';
                }
            }

        } catch(e) {
            console.error('Error loading estoque:', e);
        } finally {
            this.isLoadingEstoque = false;
        }
    };

InsumosApp.prototype.getExportRows = function() {
    const rows = this.insumosFazendasData.map(i => ({
        OS: i.os ?? 0,
        Codigo: i.cod ?? 0,
        Fazenda: i.fazenda ?? '',
        AreaTalhao: i.areaTalhao ?? 0,
        AreaAplicada: i.areaTotalAplicada ?? 0,
        Produto: i.produto ?? '',
        DoseRecomendada: i.doseRecomendada ?? 0,
        DoseAplicada: (i.doseAplicada != null && i.doseAplicada > 0) ? i.doseAplicada : ((i.areaTotalAplicada>0 && i.quantidadeAplicada!=null) ? (i.quantidadeAplicada/i.areaTotalAplicada) : 0),
        Quantidade: i.quantidadeAplicada ?? 0,
        DifPercent: (i.doseRecomendada>0) ? (((((i.doseAplicada != null && i.doseAplicada > 0) ? i.doseAplicada : ((i.areaTotalAplicada>0 && i.quantidadeAplicada!=null) ? (i.quantidadeAplicada/i.areaTotalAplicada) : 0)))/i.doseRecomendada-1)*100) : 0,
        Frente: i.frente ?? 0,
        Inicio: this.ui.formatDateBR(i.dataInicio)
    }));
    return rows;
};

InsumosApp.prototype.exportCSV = function() {
    const rows = this.getExportRows();
    if (!rows.length) { this.ui.showNotification('Sem dados para exportar', 'warning'); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(';')].concat(rows.map(r=>headers.map(h=>String(r[h]).replace(/\n/g,' ').replace(/;/g, ',')).join(';'))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insumos_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

InsumosApp.prototype.exportExcel = function() {
    const rows = this.getExportRows();
    if (!rows.length) { this.ui.showNotification('Sem dados para exportar', 'warning'); return; }
    if (!window.XLSX) { this.ui.showNotification('Biblioteca Excel não carregada', 'error'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Insumos');
    XLSX.writeFile(wb, `insumos_${Date.now()}.xlsx`);
};

InsumosApp.prototype.exportPDF = function() {
    const rows = this.getExportRows();
    if (!rows.length) { this.ui.showNotification('Sem dados para exportar', 'warning'); return; }
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF || !window.jspdf || !document.createElement) { this.ui.showNotification('Biblioteca PDF não carregada', 'error'); return; }
    const doc = new jsPDF('l', 'pt', 'a4');
    const headers = Object.keys(rows[0]);
    const body = rows.map(r => headers.map(h => String(r[h])));
    if (doc.autoTable) doc.autoTable({ head: [headers], body });
    else {
        let y = 40;
        doc.setFontSize(12);
        doc.text(headers.join(' | '), 40, y);
        y += 20;
        body.slice(0, 40).forEach(row => { doc.text(row.join(' | '), 40, y); y += 14; });
    }
    doc.save(`insumos_${Date.now()}.pdf`);
};

    InsumosApp.prototype.exportResumoExecutivoPDF = async function() {
        try {
            if (!Array.isArray(this.viagensAdubo) || this.viagensAdubo.length === 0) {
                await this.loadViagensAdubo();
            }
            let trips = Array.isArray(this.viagensAdubo) ? this.viagensAdubo.slice() : [];
            trips = trips.filter(v => (v.transportType || 'adubo') === 'adubo');
            if (!trips.length) { this.ui.showNotification('Sem viagens de Adubo para o resumo', 'warning'); return; }
            const { jsPDF } = window.jspdf || {};
            if (!jsPDF || !window.jspdf) { this.ui.showNotification('Biblioteca PDF não carregada', 'error'); return; }
            const doc = new jsPDF('p', 'pt', 'a4');
            const nowStr = new Date().toLocaleDateString('pt-BR');
            doc.setFontSize(10);
            doc.text(`Emitido em: ${nowStr}`, 40, 30);
            doc.setFontSize(16);
            doc.text('RESUMO EXECUTIVO', 40, 52);
            const qtyOf = (v) => {
                const q = v.quantidadeTotal != null ? v.quantidadeTotal : (v.quantidade_total != null ? v.quantidade_total : (v.quantidade != null ? v.quantidade : 0));
                return typeof q === 'number' ? q : parseFloat(q) || 0;
            };
            const totalTrips = trips.length;
            const totalQty = trips.reduce((a, v) => a + qtyOf(v), 0);
            const frentesSet = new Set(trips.map(v => String(v.frente || '')).filter(Boolean));
            doc.setFillColor(240, 243, 245);
            doc.rect(40, 64, 520, 48, 'F');
            doc.setFontSize(11);
            doc.text(`Viagens totais: ${totalTrips}`, 52, 82);
            doc.text(`Quantidade total: ${this.ui.formatNumber(totalQty, 2)} bags`, 52, 98);
            doc.text(`Frentes atendidas: ${frentesSet.size}`, 272, 82);
            const byFrente = {};
            trips.forEach(v => {
                const f = v.frente || '—';
                if (!byFrente[f]) byFrente[f] = { trips: [], products: {} };
                byFrente[f].trips.push(v);
                const p = v.produto || '—';
                const q = qtyOf(v);
                byFrente[f].products[p] = (byFrente[f].products[p] || 0) + q;
            });
            const frenteOrder = Object.keys(byFrente).sort((a, b) => {
                const ta = byFrente[a].trips.reduce((s, v) => s + qtyOf(v), 0);
                const tb = byFrente[b].trips.reduce((s, v) => s + qtyOf(v), 0);
                return tb - ta;
            });
            const palette = [
                [52, 152, 219], [46, 204, 113], [231, 76, 60],
                [241, 196, 15], [155, 89, 182], [26, 188, 156],
                [127, 140, 141], [52, 73, 94]
            ];
            let startY = 124;
            for (const f of frenteOrder) {
                const group = byFrente[f];
                const sumQty = group.trips.reduce((s, v) => s + qtyOf(v), 0);
                const tripCount = group.trips.length;
                doc.setFontSize(13);
                doc.text(`FRENTE ${f}`, 40, startY);
                doc.setFontSize(10);
                doc.text(`Viagens: ${tripCount} | Quantidade: ${this.ui.formatNumber(sumQty, 2)} bags`, 40, startY + 16);
                const tripHead = ['Data', 'Origem', 'Destino', 'Produto', 'Quantidade'];
                const tripBody = group.trips.map(v => [
                    v.data || '',
                    v.origem || '',
                    v.destino || '',
                    v.produto || '',
                    this.ui.formatNumber(qtyOf(v), 2)
                ]);
                if (doc.autoTable) {
                    doc.autoTable({
                        head: [tripHead],
                        body: tripBody,
                        startY: startY + 28,
                        styles: { fontSize: 9 },
                        headStyles: { fillColor: [230, 235, 240], textColor: 20 }
                    });
                    startY = doc.lastAutoTable.finalY + 18;
                } else {
                    let y = startY + 28;
                    doc.setFontSize(10);
                    doc.text(tripHead.join(' | '), 40, y); y += 16;
                    tripBody.forEach(r => { doc.text(r.join(' | '), 40, y); y += 14; });
                    startY = y + 12;
                }
                const prodRows = Object.keys(group.products).map(p => ({
                    Produto: p,
                    Quantidade_bags: group.products[p]
                })).sort((a, b) => b.Quantidade_bags - a.Quantidade_bags);
                const prodHead = ['Produto', 'Quantidade (bags)'];
                const prodBody = prodRows.map(r => [r.Produto, this.ui.formatNumber(r.Quantidade_bags, 2)]);
                if (doc.autoTable) {
                    doc.autoTable({
                        head: [prodHead],
                        body: prodBody,
                        startY: startY,
                        styles: { fontSize: 9 },
                        headStyles: { fillColor: [230, 235, 240], textColor: 20 }
                    });
                    startY = doc.lastAutoTable.finalY + 10;
                } else {
                    let y = startY;
                    doc.setFontSize(10);
                    doc.text(prodHead.join(' | '), 40, y); y += 16;
                    prodBody.forEach(r => { doc.text(r.join(' | '), 40, y); y += 14; });
                    startY = y + 10;
                }
                doc.setFontSize(9);
                doc.text('Proporção no total', 40, startY + 12);
                const barX = 40, barY = startY + 18, barW = 520, barH = 10;
                let cursor = barX;
                const totalForBar = prodRows.reduce((s, r) => s + r.Quantidade_bags, 0) || 1;
                prodRows.forEach((r, idx) => {
                    const share = (r.Quantidade_bags / totalForBar);
                    const segW = Math.max(1, Math.round(barW * share));
                    const color = palette[idx % palette.length];
                    doc.setFillColor(color[0], color[1], color[2]);
                    doc.rect(cursor, barY, segW, barH, 'F');
                    cursor += segW;
                });
                doc.setDrawColor(180);
                doc.rect(barX, barY, barW, barH);
                startY = barY + barH + 24;
                if (startY > 760) {
                    doc.addPage();
                    startY = 40;
                }
            }
            doc.save(`resumo_executivo_insumos_${Date.now()}.pdf`);
        } catch (e) {
            console.error('Erro ao gerar Resumo Executivo:', e);
            this.ui.showNotification('Erro ao gerar Resumo Executivo', 'error');
        }
    };

InsumosApp.prototype.updateGemasPercent = function(triggerEl) {
    const totalEl = document.getElementById('qual-gemas-total');
    const bonsEl = document.getElementById('qual-gemas-boas');
    const ruinsEl = document.getElementById('qual-gemas-ruins');
    const bonsPctEl = document.getElementById('qual-gemas-boas-pct');
    const ruinsPctEl = document.getElementById('qual-gemas-ruins-pct');
    const amostraEl = document.getElementById('qual-gemas-amostra');
    const mediaEl = document.getElementById('qual-gemas-media');

    if (!totalEl || !bonsEl || !ruinsEl || !bonsPctEl || !ruinsPctEl) return;
    const total = parseFloat(totalEl.value || '0');
    const amostra = parseFloat(amostraEl?.value || '0');

    if (mediaEl) {
        mediaEl.value = (amostra > 0 && total > 0) ? (total / amostra).toFixed(2) : '';
    }

    if (total > 0) {
        let bons = parseFloat(bonsEl.value || '0');
        let ruins = parseFloat(ruinsEl.value || '0');
        
        if (triggerEl === bonsEl) {
            ruins = total - bons;
            if (ruins < 0) ruins = 0;
            ruinsEl.value = ruins;
        } else if (triggerEl === ruinsEl) {
            bons = total - ruins;
            if (bons < 0) bons = 0;
            bonsEl.value = bons;
        } else {
             // Fallback
             if (bonsEl.value && !ruinsEl.value) {
                ruins = total - bons;
                ruinsEl.value = ruins;
            } else if (ruinsEl.value && !bonsEl.value) {
                bons = total - ruins;
                bonsEl.value = bons;
            }
        }
        
        bonsPctEl.value = ((bons / total) * 100).toFixed(2);
        ruinsPctEl.value = ((ruins / total) * 100).toFixed(2);
    } else {
        bonsPctEl.value = '';
        ruinsPctEl.value = '';
    }
};

InsumosApp.prototype.loadLiberacoesForSelect = async function() {
    // Targets: muda-colheita-info (Qualidade/Colheita)
    const targets = ['muda-colheita-info'];
    
    // Filter active targets
    const activeTargets = targets.filter(id => document.getElementById(id));
    if (activeTargets.length === 0) return;
    
    // Save current values to restore after loading if valid
    const currentValues = {};
    activeTargets.forEach(id => {
        const el = document.getElementById(id);
        if (el) currentValues[id] = el.value;
    });

    // Set loading
    activeTargets.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<option value="">Carregando...</option>';
    });
    
    try {
        const res = await this.api.getLiberacaoColheita();
        
        if (res && res.success && Array.isArray(res.data)) {
            const list = res.data;
            this.liberacaoCache = list; 
            
            const renderOptions = (items, selectEl) => {
                selectEl.innerHTML = '<option value="">Selecione...</option>';
                items.forEach(lib => {
                    const opt = document.createElement('option');
                    // Force String for consistency
                    opt.value = String(lib.numero_liberacao || lib.id);
                    const dateStr = this.ui.formatDateBR(lib.data);
                    
                    let variety = '';
                    if (Array.isArray(lib.talhoes) && lib.talhoes.length > 0) {
                        const vars = [...new Set(lib.talhoes.map(t => t.variedade).filter(Boolean))];
                        if (vars.length > 0) variety = ` | ${vars.join(', ')}`;
                    }

                    opt.textContent = `${lib.numero_liberacao || lib.id} | ${dateStr} | ${lib.fazenda} | ${lib.frente}${variety}`;
                    selectEl.appendChild(opt);
                });
            };

            // Process each target
            activeTargets.forEach(id => {
                const selectEl = document.getElementById(id);
                
                if (selectEl) {
                    renderOptions(list, selectEl);
                    
                    // Restore value if it exists in the new options
                    if (currentValues[id]) {
                         selectEl.value = currentValues[id];
                    }

                    // Attach change listener via closure to capture ID
                    selectEl.onchange = () => {
                        this.onLiberacaoSelectChange(id);
                    };
                }
            });
        }
    } catch (e) {
        console.error('Erro ao carregar liberações:', e);
        activeTargets.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<option value="">Erro ao carregar</option>';
        });
    }
};

InsumosApp.prototype.onLiberacaoSelectChange = function(triggerId) {
    // Default to the main one if no triggerId provided (legacy support)
    if (!triggerId) triggerId = 'muda-colheita-info';

    const select = document.getElementById(triggerId);
    if (!select) return;
    const val = select.value;
    if (!val || !this.liberacaoCache) return;
    
    // Robust comparison using String
    const lib = this.liberacaoCache.find(l => 
        String(l.numero_liberacao || l.id) === String(val)
    );
    if (!lib) return;
    
    // Extract Variety
    let variety = '';
    if (Array.isArray(lib.talhoes) && lib.talhoes.length > 0) {
        const vars = [...new Set(lib.talhoes.map(t => t.variedade).filter(Boolean))];
        if (vars.length > 0) variety = vars.join(', ');
    }
    
    // Extract Talhao/Frente
    let talhao = lib.frente || '';
    if (!talhao && Array.isArray(lib.talhoes) && lib.talhoes.length > 0) {
         const tals = [...new Set(lib.talhoes.map(x => x.talhao).filter(Boolean))];
         if (tals.length > 0) talhao = tals.join(', ');
    }

    if (triggerId === 'muda-colheita-info') {
        // Logic for Colheita/Qualidade Mode
        const libEl = document.getElementById('qual-muda-liberacao');
        const fazendaOrigemEl = document.getElementById('muda-fazenda-origem');
        const talhaoOrigemEl = document.getElementById('muda-talhao-origem');
        const varEl = document.getElementById('qual-muda-variedade');
        
        if (libEl) libEl.value = lib.numero_liberacao || lib.id;
        if (fazendaOrigemEl) fazendaOrigemEl.value = lib.fazenda;
        if (talhaoOrigemEl) talhaoOrigemEl.value = talhao;
        if (varEl) varEl.value = variety;

    } else if (triggerId === 'muda-liberacao-fazenda') {
        // Logic for Plantio de Cana Mode
        const varEl = document.getElementById('muda-variedade');
        if (varEl) varEl.value = variety;
    }
};

InsumosApp.prototype.updateMudasPercent = function(triggerEl) {
    const totalEl = document.getElementById('qual-mudas-total');
    const bonsEl = document.getElementById('qual-mudas-boas');
    const ruinsEl = document.getElementById('qual-mudas-ruins');
    const bonsPctEl = document.getElementById('qual-mudas-boas-pct');
    // ruinsPctEl e amostraEl podem não existir no modo colheita_muda, então tratamos como opcional
    const ruinsPctEl = document.getElementById('qual-mudas-ruins-pct');
    const amostraEl = document.getElementById('qual-mudas-amostra');
    const mediaEl = document.getElementById('qual-mudas-media');

    if (!totalEl || !bonsEl || !ruinsEl || !bonsPctEl) return;
    const total = parseFloat(totalEl.value || '0');
    // Se não tiver amostraEl, assume 0 (ou 100 se for fixo, mas aqui é para cálculo de média que pode não existir)
    const amostra = amostraEl ? parseFloat(amostraEl.value || '0') : 0;

    if (mediaEl && amostraEl) {
        mediaEl.value = (amostra > 0 && total > 0) ? (total / amostra).toFixed(2) : '';
    }

    if (total > 0) {
        let bons = parseFloat(bonsEl.value || '0');
        let ruins = parseFloat(ruinsEl.value || '0');
        
        if (triggerEl === bonsEl) {
            ruins = total - bons;
            if (ruins < 0) ruins = 0;
            ruinsEl.value = ruins;
        } else if (triggerEl === ruinsEl) {
            bons = total - ruins;
            if (bons < 0) bons = 0;
            bonsEl.value = bons;
        } else {
             if (bonsEl.value && !ruinsEl.value) {
                ruins = total - bons;
                ruinsEl.value = ruins;
            } else if (ruinsEl.value && !bonsEl.value) {
                bons = total - ruins;
                bonsEl.value = bons;
            }
        }
        
        bonsPctEl.value = ((bons / total) * 100).toFixed(2);
        if (ruinsPctEl) ruinsPctEl.value = ((ruins / total) * 100).toFixed(2);
    } else {
        bonsPctEl.value = '';
        if (ruinsPctEl) ruinsPctEl.value = '';
    }

    // --- Lógica Reboulos ---
    const reboulosTotalEl = document.getElementById('qual-mudas-reboulos');
    const reboulosBonsEl = document.getElementById('qual-mudas-reboulos-bons');
    const reboulosRuinsEl = document.getElementById('qual-mudas-reboulos-ruins');
    const reboulosBonsPctEl = document.getElementById('qual-mudas-reboulos-bons-pct');
    const reboulosRuinsPctEl = document.getElementById('qual-mudas-reboulos-ruins-pct');

    if (reboulosTotalEl && reboulosBonsEl && reboulosRuinsEl && reboulosBonsPctEl && reboulosRuinsPctEl) {
        const reboulosTotal = parseFloat(reboulosTotalEl.value || '0');
        if (reboulosTotal > 0) {
            let reboulosBons = parseFloat(reboulosBonsEl.value || '0');
            let reboulosRuins = parseFloat(reboulosRuinsEl.value || '0');
            
            // Auto-complete logic
            if (triggerEl === reboulosBonsEl) {
                reboulosRuins = reboulosTotal - reboulosBons;
                if (reboulosRuins < 0) reboulosRuins = 0;
                reboulosRuinsEl.value = reboulosRuins;
            } else if (triggerEl === reboulosRuinsEl) {
                reboulosBons = reboulosTotal - reboulosRuins;
                if (reboulosBons < 0) reboulosBons = 0;
                reboulosBonsEl.value = reboulosBons;
            } else {
                if (reboulosBonsEl.value && !reboulosRuinsEl.value) {
                    reboulosRuins = reboulosTotal - reboulosBons;
                    reboulosRuinsEl.value = reboulosRuins;
                } else if (reboulosRuinsEl.value && !reboulosBonsEl.value) {
                    reboulosBons = reboulosTotal - reboulosRuins;
                    reboulosBonsEl.value = reboulosBons;
                }
            }

            reboulosBonsPctEl.value = ((reboulosBons / reboulosTotal) * 100).toFixed(2);
            reboulosRuinsPctEl.value = ((reboulosRuins / reboulosTotal) * 100).toFixed(2);
        } else {
            reboulosBonsPctEl.value = '';
            reboulosRuinsPctEl.value = '';
        }
    }
};

InsumosApp.prototype.updateToletesPercent = function() {
    const totalEl = document.getElementById('qual-toletes-total');
    const bonsEl = document.getElementById('qual-toletes-bons');
    const ruinsEl = document.getElementById('qual-toletes-ruins');
    const bonsPctEl = document.getElementById('qual-toletes-bons-pct');
    const ruinsPctEl = document.getElementById('qual-toletes-ruins-pct');
    const amostraEl = document.getElementById('qual-toletes-amostra');
    const mediaEl = document.getElementById('qual-toletes-media');

    if (!totalEl || !bonsEl || !ruinsEl || !bonsPctEl || !ruinsPctEl) return;
    const total = parseFloat(totalEl.value || '0');
    const amostra = parseFloat(amostraEl?.value || '0');

    if (mediaEl) {
        mediaEl.value = (amostra > 0 && total > 0) ? (total / amostra).toFixed(2) : '';
    }

    if (total > 0) {
        let bons = parseFloat(bonsEl.value || '0');
        let ruins = parseFloat(ruinsEl.value || '0');
        if (bonsEl.value && !ruinsEl.value) {
            ruins = total - bons;
            ruinsEl.value = ruins;
        } else if (ruinsEl.value && !bonsEl.value) {
            bons = total - ruins;
            bonsEl.value = bons;
        }
        bonsPctEl.value = ((bons / total) * 100).toFixed(2);
        ruinsPctEl.value = ((ruins / total) * 100).toFixed(2);
    } else {
        bonsPctEl.value = '';
        ruinsPctEl.value = '';
    }
};

// Plantio Diário helpers
InsumosApp.prototype.getInsumoUnits = function() {
    return {
        'BIOZYME': 'L/ha',
        '04-30-10': 'kg/ha',
        'QUALITY': 'L/ha',
        'AZOKOP': 'L/ha',
        'SURVEY (FIPRONIL)': 'L/ha',
        'OXIFERTIL': 'L/ha',
        'LANEX 800 WG (REGENTE)': 'kg/ha',
        'COMET': 'L/ha',
        'COMPOSTO': 't/ha',
        '10-49-00': 'kg/ha',
        'PEREGRINO': 'L/ha',
        'NO-NEMA': 'L/ha'
    };
};

// frentes fixas: leitura e totais
InsumosApp.prototype.getFixedFrentes = function() {
    const rows = [
        { frente: '4001', fazenda: 'fr-4001-fazenda', cod: 'fr-4001-cod', variedade: 'fr-4001-variedade', area: 'fr-4001-area', plantada: 'fr-4001-plantada', muda: 'fr-4001-muda' },
        { frente: '4002', fazenda: 'fr-4002-fazenda', cod: 'fr-4002-cod', variedade: 'fr-4002-variedade', area: 'fr-4002-area', plantada: 'fr-4002-plantada', muda: 'fr-4002-muda' },
        { frente: '4009 Abençoada', fazenda: 'fr-4009-fazenda', cod: 'fr-4009-cod', variedade: 'fr-4009-variedade', area: 'fr-4009-area', plantada: 'fr-4009-plantada', muda: 'fr-4009-muda' }
    ];
    return rows.map(r => ({
        frente: r.frente,
        fazenda: document.getElementById(r.fazenda)?.value || '',
        cod: document.getElementById(r.cod)?.value ? parseInt(document.getElementById(r.cod)?.value) : undefined,
        variedade: document.getElementById(r.variedade)?.value || '',
        area: parseFloat(document.getElementById(r.area)?.value || '0'),
        plantada: parseFloat(document.getElementById(r.plantada)?.value || '0'),
        muda: parseFloat(document.getElementById(r.muda)?.value || '0')
    })).filter(x => (x.area||0) > 0 || (x.plantada||0) > 0 || (x.muda||0) > 0);
};

InsumosApp.prototype.updateFixedFrentesTotals = function() {
    const frentes = this.getFixedFrentes();
    const sumArea = frentes.reduce((s,x)=> s + (Number(x.area)||0), 0);
    const sumPlant = frentes.reduce((s,x)=> s + (Number(x.plantada)||0), 0);
    const sumMuda = frentes.reduce((s,x)=> s + (Number(x.muda)||0), 0);
    const setText = (id,val)=>{ const el=document.getElementById(id); if (el) el.textContent = this.ui.formatNumber(val); };
    setText('total-area-ha', sumArea);
    setText('total-plantada-ha', sumPlant);
    setText('total-muda-ton', sumMuda);
};

InsumosApp.prototype.addInsumoRow = async function() {
    const produto = document.getElementById('insumo-produto')?.value || '';
    
    // Helper para parsear floats aceitando virgula e ponto
    const parseInput = (id) => {
        const val = document.getElementById(id)?.value || '0';
        return parseFloat(String(val).replace(',', '.'));
    };

    let dosePrev = parseInput('insumo-dose-prevista');
    const qtdTotal = parseInput('insumo-qtd-total');
    const areaDia = parseInput('single-plantio-dia');
    const areaAplicada = parseInput('insumo-area-aplicada'); // New Field
    
    if (!produto) { this.ui.showNotification('Selecione o produto', 'warning'); return; }
    
    let doseReal = 0;
    // Use Area Aplicada specific for this insumo if provided, otherwise fallback to daily area
    const areaCalc = areaAplicada > 0 ? areaAplicada : areaDia;
    
    if (areaCalc > 0) {
        doseReal = qtdTotal / areaCalc;
    } else {
        // Se não tiver área, permite adicionar mas avisa ou calcula como 0
        // Não vamos bloquear, pois o usuário pode preencher a área depois
    }

    // Tentar buscar dose prevista da OS se não foi informada
    if (dosePrev === 0) {
        const frenteKey = document.getElementById('single-frente')?.value || '';
        const osKey = document.getElementById('single-os')?.value || '';
        
        // Tenta buscar no cache primeiro se tiver OS selecionada
        if (osKey && this.osListCache) {
             const os = this.osListCache.find(o => String(o.numero).trim() === String(osKey).trim());
             if (os && os.produtos) {
                 const osProduto = os.produtos.find(p => p.produto.trim().toUpperCase() === produto.trim().toUpperCase());
                 if (osProduto) {
                     dosePrev = parseFloat(osProduto.doseRecomendada || osProduto.doseRec || osProduto.dose || osProduto.quantidade || 0);
                 }
             }
        }

        if (dosePrev === 0 && frenteKey) {
            try {
                const osRes = await this.api.getOSByFrente(frenteKey);
                if (osRes && osRes.success && osRes.data) {
                    const osProduto = osRes.data.produtos.find(p => p.produto.trim().toUpperCase() === produto.trim().toUpperCase());
                    if (osProduto) {
                        dosePrev = parseFloat(osProduto.doseRecomendada || osProduto.doseRec || osProduto.dose || osProduto.quantidade || 0);
                    }
                }
            } catch (e) {
                console.error('Erro ao buscar dados da OS:', e);
            }
        }
    }
    
    this.plantioInsumosDraft.push({ 
        produto, 
        dosePrevista: dosePrev, 
        doseRealizada: doseReal,
        qtdTotal: qtdTotal,
        areaAplicada: areaAplicada // Save field
    });
    this.renderInsumosDraft();
    
    // Limpar campos
    ['insumo-produto', 'insumo-dose-prevista', 'insumo-qtd-total', 'insumo-area-aplicada'].forEach(id => { 
        const el = document.getElementById(id); 
        if (el) el.value = ''; 
    });
    document.getElementById('insumo-produto')?.focus();
};

InsumosApp.prototype.removeInsumoRow = function(idx) {
    if (idx >= 0 && idx < this.plantioInsumosDraft.length) {
        this.plantioInsumosDraft.splice(idx, 1);
        this.renderInsumosDraft();
    }
};

InsumosApp.prototype.renderInsumosDraft = function() {
    const tbody = document.getElementById('insumos-plantio-tbody');
    const areaDia = parseFloat(document.getElementById('single-plantio-dia')?.value || '0');
    let totalGasto = 0;
    let totalPrevistoDia = 0;

    if (!tbody) return;
    tbody.innerHTML = this.plantioInsumosDraft.map((r,idx)=>{
        let gasto = 0;
        let doseReal = r.doseRealizada;
        
        // Se tiver qtdTotal armazenado, recalcula doseReal com base na área atual (ou específica)
        if (r.qtdTotal !== undefined) {
             gasto = r.qtdTotal;
             const areaCalc = (r.areaAplicada > 0) ? r.areaAplicada : areaDia;
             
             if (areaCalc > 0) {
                 doseReal = r.qtdTotal / areaCalc;
             } else {
                 doseReal = 0;
             }
             // Atualiza o objeto draft para manter consistência se salvar depois
             r.doseRealizada = doseReal; 
        } else {
             // Compatibilidade com registros antigos
             const areaCalc = (r.areaAplicada > 0) ? r.areaAplicada : areaDia;
             gasto = r.doseRealizada * areaCalc;
        }

        const areaCalc = (r.areaAplicada > 0) ? r.areaAplicada : areaDia;
        const previsto = r.dosePrevista * areaCalc;
        totalGasto += gasto;
        totalPrevistoDia += previsto;

        let rowClass = '';
        // Tolerância de 0.0001 para comparações de float
        const diff = doseReal - r.dosePrevista;
        
        if (r.dosePrevista > 0) { 
            if (diff < -0.0001) {
                // Menor que previsto -> Vermelho (economia ou sub-dosagem)
                rowClass = 'row-danger';
            } else if (diff > 0.0001) {
                // Maior que previsto -> Amarelo/Laranja (alerta de excesso)
                rowClass = 'row-warning'; 
            }
        }

        return `
        <tr class="${rowClass}">
            <td>${r.produto}</td>
            <td>${this.ui.formatNumber(r.dosePrevista||0, 3)}</td>
            <td>${this.ui.formatNumber(doseReal||0, 3)}</td>
            <td>${this.ui.formatNumber(r.areaAplicada||0, 2)}</td>
            <td>${this.ui.formatNumber(previsto||0, 3)}</td>
            <td>${this.ui.formatNumber(gasto||0, 3)}</td>
            <td><button class="btn btn-sm btn-delete-insumo-row" data-idx="${idx}" style="color:red;">🗑️</button></td>
        </tr>
    `}).join('');

    const totalEl = document.getElementById('insumos-total-gasto');
    if (totalEl) {
        totalEl.innerHTML = `
            <div>Total Gasto no Dia: <span id="val-total-gasto">${this.ui.formatNumber(totalGasto||0, 3)}</span></div>
            <div style="color: #666; font-size: 0.9em; margin-top: 5px;">Total Previsto Dia: ${this.ui.formatNumber(totalPrevistoDia||0, 3)}</div>
        `;
        this.updatePlantioSummary();
    }
};

InsumosApp.prototype.loadProdutosDatalist = async function() {
    try {
        const frenteKey = document.getElementById('single-frente')?.value || '';
        const osKey = document.getElementById('single-os')?.value || '';
        const fazendaKey = document.getElementById('single-fazenda')?.value || ''; // Filter by Farm
        let osProdutos = [];
        
        console.log(`[loadProdutosDatalist] Frente: ${frenteKey}, OS: ${osKey}, Fazenda: ${fazendaKey}`);

        // 1. Tentar pegar da OS selecionada (via Cache)
        if (osKey && this.osListCache) {
             const os = this.osListCache.find(o => String(o.numero).trim() === String(osKey).trim());
             if (os && Array.isArray(os.produtos)) {
                 console.log('[loadProdutosDatalist] Usando produtos da OS selecionada:', os.produtos);
                 osProdutos = os.produtos.map(p => p.produto).filter(p => p);
             }
        }
        
        // 2. Se não achou produtos (ou OS não selecionada), busca a mais recente via API
        if (osProdutos.length === 0 && frenteKey) {
            console.log('[loadProdutosDatalist] Buscando OS mais recente por frente...');
            const osRes = await this.api.getOSByFrente(frenteKey);
            if (osRes && osRes.success && osRes.data && Array.isArray(osRes.data.produtos)) {
                console.log('[loadProdutosDatalist] Produtos encontrados via API:', osRes.data.produtos);
                osProdutos = osRes.data.produtos.map(p => p.produto).filter(p => p);
            } else {
                console.warn('[loadProdutosDatalist] Nenhum produto encontrado na API para a frente:', frenteKey);
            }
        }

        // 3. Buscar produtos do ESTOQUE da Fazenda/Frente e MERGEAR com a lista
        if (fazendaKey || frenteKey) {
            try {
                // Fetch stock items filtered by Fazenda or Frente
                const stockRes = await this.api.getEstoque(); // Get all and filter in memory to be safe with name variations
                if (stockRes && stockRes.success && Array.isArray(stockRes.data)) {
                    const stockProducts = stockRes.data
                        .filter(item => {
                            const loc = (item.frente || '').toUpperCase().trim();
                            const faz = (fazendaKey || '').toUpperCase().trim();
                            const fre = (frenteKey || '').toUpperCase().trim();
                            // Match Fazenda Name OR Frente Code
                            return (faz && loc === faz) || (fre && loc === fre);
                        })
                        .map(item => item.produto)
                        .filter(Boolean);
                    
                    if (stockProducts.length > 0) {
                        console.log('[loadProdutosDatalist] Produtos do Estoque:', stockProducts);
                        // Merge and deduplicate
                        osProdutos = [...new Set([...osProdutos, ...stockProducts])];
                    }
                }
            } catch (err) {
                console.error('Erro ao buscar estoque para filtro de produtos:', err);
            }
        }
        
        const select = document.getElementById('insumo-produto');
        if (select) {
            select.innerHTML = '<option value="">Selecione o produto...</option>' + 
                               osProdutos.map(p => `<option value="${p}">${p}</option>`).join('');
        }
    } catch (e) {
        console.error('Erro ao carregar produtos para select:', e);
    }
};

InsumosApp.prototype.initPlantioModalSteps = function() {
    const steps = document.querySelectorAll('.step-btn');
    steps.forEach(btn => {
        btn.addEventListener('click', () => {
            const step = parseInt(btn.getAttribute('data-step'));
            this.goToPlantioStep(step);
        });
    });

    const prevBtn = document.getElementById('step-prev-btn');
    const nextBtn = document.getElementById('step-next-btn');

    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.currentStep > 1) {
                let prevStep = this.currentStep - 1;
                const tipo = document.getElementById('tipo-operacao')?.value;
                
                // Se for qualidade_muda, o passo 2 (Insumos) não existe, pula do 3 para o 1
                if (tipo === 'qualidade_muda' && prevStep === 2) {
                    prevStep = 1;
                }
                this.goToPlantioStep(prevStep);
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.validatePlantioStep(this.currentStep)) {
                // Determine max steps based on type
                const tipo = document.getElementById('tipo-operacao')?.value;
                let maxStep = 3;
                // if (tipo === 'plantio') maxStep = 2; // Plantio ends at step 2 (Insumos) -> Agora vai até 3 (Qualidade)
                if (tipo === 'colheita_muda') maxStep = 3; // Colheita agora vai até step 3 (Qualidade)

                if (this.currentStep < maxStep) {
                    let nextStep = this.currentStep + 1;
                    
                    // Se for qualidade_muda, o passo 2 (Insumos) não existe, pula do 1 para o 3
                    if (tipo === 'qualidade_muda' && nextStep === 2) {
                        nextStep = 3;
                    }
                    // Se for colheita_muda, o passo 2 (Insumos) também não existe, pula do 1 para o 3
                    if (tipo === 'colheita_muda' && nextStep === 2) {
                        nextStep = 3;
                    }
                    this.goToPlantioStep(nextStep);
                }
            }
        });
    }
};

InsumosApp.prototype.validatePlantioStep = function(step) {
    const currentStepEl = document.querySelector(`.step-content[data-step="${step}"]`);
    if (!currentStepEl) return true;

    // Validation for Step 1
    if (step === 1) {
        const dataEl = document.getElementById('plantio-data');
        const osEl = document.getElementById('single-os');
        const areaEl = document.getElementById('single-plantio-dia');
        const tipo = document.getElementById('tipo-operacao')?.value;
        let valid = true;

        if (!dataEl.value) {
            dataEl.classList.add('input-error');
            const msg = document.getElementById('msg-plantio-data');
            if (msg) msg.style.display = 'block';
            valid = false;
        }
        if (!osEl.value) {
            osEl.classList.add('input-error');
            const msg = document.getElementById('msg-single-os');
            if (msg) msg.style.display = 'block';
            valid = false;
        }
        
        // Only validate Plantio Area if NOT qualidade_muda and NOT colheita_muda (Colheita uses different fields or less strict)
        // Adjust validation logic as needed for Colheita
        if (tipo !== 'qualidade_muda' && tipo !== 'colheita_muda') {
            // Fix: Handle comma as decimal separator (common in Brazil)
            const valStr = (areaEl.value || '').replace(',', '.');
            const val = parseFloat(valStr);

            if (!areaEl.value || isNaN(val) || val <= 0) {
                areaEl.classList.add('input-error');
                const msg = document.getElementById('msg-single-plantio-dia');
                if (msg) msg.style.display = 'block';
                valid = false;
            }
        }

        if (!valid) {
            this.ui.showNotification('Preencha os campos obrigatórios (*)', 'warning');
            return false;
        }
    }

    // Validation for Step 3
    if (step === 3) {
        let valid = true;

        // Validar #muda-colheita-info (Colheita de Muda)
        const colheitaInfo = document.getElementById('muda-colheita-info');
        const colheitaInfoContainer = colheitaInfo?.closest('.form-group');
        
        if (colheitaInfo && colheitaInfoContainer && colheitaInfoContainer.offsetParent !== null) {
            if (!colheitaInfo.value) {
                colheitaInfo.classList.add('input-error');
                 let msg = document.getElementById('msg-muda-colheita-info');
                 if (!msg) {
                     msg = document.createElement('small');
                     msg.id = 'msg-muda-colheita-info';
                     msg.className = 'text-danger validation-msg';
                     msg.textContent = 'Selecione a Liberação de Colheita';
                     msg.style.display = 'block';
                     colheitaInfo.parentNode.appendChild(msg);
                 } else {
                     msg.style.display = 'block';
                 }
                valid = false;
            } else {
                colheitaInfo.classList.remove('input-error');
                const msg = document.getElementById('msg-muda-colheita-info');
                if (msg) msg.style.display = 'none';
            }
        }

        if (!valid) {
            this.ui.showNotification('Preencha os campos obrigatórios de qualidade.', 'warning');
            return false;
        }
    }
    
    return true;
};

InsumosApp.prototype.goToPlantioStep = function(step) {
    this.currentStep = step;
    
    // Update buttons
    const stepBtns = document.querySelectorAll('.step-btn');
    stepBtns.forEach(btn => {
        const s = parseInt(btn.getAttribute('data-step'));
        if (s === step) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Update content
    const contents = document.querySelectorAll('.step-content');
    contents.forEach(content => {
        const s = parseInt(content.getAttribute('data-step'));
        if (s === step) content.classList.add('active');
        else content.classList.remove('active');
    });

    // Update Footer Buttons
    const prevBtn = document.getElementById('step-prev-btn');
    const nextBtn = document.getElementById('step-next-btn');
    const saveBtn = document.getElementById('plantio-save-btn');
    const tipo = document.getElementById('tipo-operacao')?.value;

    if (prevBtn) prevBtn.style.display = step === 1 ? 'none' : 'block';
    
    // Logic for Finish/Save button
    let isLastStep = false;
    // if (tipo === 'plantio' && step === 2) isLastStep = true; // Agora vai até 3
    // if (tipo === 'colheita_muda' && step === 1) isLastStep = true; // Agora vai até 3
    if (tipo === 'qualidade_muda' && step === 3) isLastStep = true;
    
    // Fallback for safety
    if (step === 3) isLastStep = true;

    // Load Quality Records if entering Step 3 in Plantio or Colheita mode
            if (step === 3 && (tipo === 'plantio' || tipo === 'colheita_muda') && !this.isQualidadeMode) {
                // Pass current selection if available in hidden input to ensure highlighting
                const hiddenInput = document.getElementById('selected-qualidade-id');
                const currentId = hiddenInput ? hiddenInput.value : null;
                this.loadQualidadeRecords(tipo, currentId);
                
                // Also load dropdown options for Colheita de Muda
                if (tipo === 'colheita_muda') {
                    this.loadLiberacoesForSelect();
                }
            }
            
            if (isLastStep) {
        if (nextBtn) nextBtn.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'block';
    } else {
        if (nextBtn) nextBtn.style.display = 'block';
        if (saveBtn) saveBtn.style.display = 'none';
    }
    
    this.updatePlantioSummary();
};

InsumosApp.prototype.updatePlantioSummary = function() {
    const dataEl = document.getElementById('plantio-data');
    const sumData = document.getElementById('summary-data');

    if (sumData && dataEl) {
        const val = dataEl.value;
        if (val) {
            const horaEl = document.getElementById('plantio-hora');
            const horaVal = horaEl && horaEl.value ? horaEl.value : '';
            const parts = val.split('-');
            if (parts.length === 3) {
                const base = `${parts[2]}/${parts[1]}/${parts[0]}`;
                sumData.textContent = horaVal ? `${base} ${horaVal}` : base;
            } else {
                sumData.textContent = val;
            }
        } else {
            sumData.textContent = '-';
        }
    }
};

// Generic Modal Steps Logic (Adubo, Composto, etc.)
InsumosApp.prototype.initGenericModalSteps = function() {
    // Step Headers (Tabs)
    document.querySelectorAll('.step-btn[data-modal]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const modalName = btn.getAttribute('data-modal');
            const step = parseInt(btn.getAttribute('data-step'));
            this.goToModalStep(modalName, step);
        });
    });

    // Prev Buttons
    document.querySelectorAll('.btn-step-prev[data-modal]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const modalName = btn.getAttribute('data-modal');
            const currentStep = this.getCurrentStep(modalName);
            if (currentStep > 1) {
                this.goToModalStep(modalName, currentStep - 1);
            }
        });
    });

    // Next Buttons
    document.querySelectorAll('.btn-step-next[data-modal]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const modalName = btn.getAttribute('data-modal');
            const currentStep = this.getCurrentStep(modalName);
            if (this.validateModalStep(modalName, currentStep)) {
                this.goToModalStep(modalName, currentStep + 1);
            }
        });
    });
};

InsumosApp.prototype.getCurrentStep = function(modalName) {
    const activeStep = document.querySelector(`.step-content.active[data-modal="${modalName}"]`);
    return activeStep ? parseInt(activeStep.getAttribute('data-step')) : 1;
};

InsumosApp.prototype.goToModalStep = function(modalName, step) {
    // Hide all steps for this modal
    document.querySelectorAll(`.step-content[data-modal="${modalName}"]`).forEach(el => el.classList.remove('active'));
    document.querySelectorAll(`.step-btn[data-modal="${modalName}"]`).forEach(el => el.classList.remove('active'));

    // Show target step
    const targetContent = document.querySelector(`.step-content[data-modal="${modalName}"][data-step="${step}"]`);
    const targetBtn = document.querySelector(`.step-btn[data-modal="${modalName}"][data-step="${step}"]`);
    
    if (targetContent) targetContent.classList.add('active');
    if (targetBtn) targetBtn.classList.add('active');

    // Logic for loading Quality Records in Step 3 of Plantio
    if (modalName === 'novo-plantio' && step === 3 && !this.isQualidadeMode) {
        // Get the current operation type to filter relevant quality records
        const tipoOpEl = document.getElementById('tipo-operacao');
        const tipoOp = tipoOpEl ? tipoOpEl.value : null;
        this.loadQualidadeRecords(tipoOp);
    }

    // Update footer buttons visibility
    const prevBtn = document.querySelector(`.btn-step-prev[data-modal="${modalName}"]`);
    const nextBtn = document.querySelector(`.btn-step-next[data-modal="${modalName}"]`);
    const saveBtn = document.querySelector(`.btn-save-final[data-modal="${modalName}"]`);
    
    // Count total steps for this modal
    const totalSteps = document.querySelectorAll(`.step-content[data-modal="${modalName}"]`).length;

    if (prevBtn) prevBtn.style.display = step > 1 ? 'inline-block' : 'none';
    
    if (nextBtn) {
        if (step < totalSteps) {
            nextBtn.style.display = 'inline-block';
            if (saveBtn) saveBtn.style.display = 'none';
        } else {
            nextBtn.style.display = 'none';
            if (saveBtn) saveBtn.style.display = 'inline-block';
        }
    }
};

InsumosApp.prototype.validateModalStep = function(modalName, step) {
    // Simple validation: Check required fields in the current step
    const currentStepEl = document.querySelector(`.step-content[data-step="${step}"][data-modal="${modalName}"]`);
    if (!currentStepEl) return true;

    let valid = true;
    const requiredInputs = currentStepEl.querySelectorAll('[required], .highlight-input');
    
    requiredInputs.forEach(input => {
        // Skip hidden inputs
        if (input.type === 'hidden' || input.style.display === 'none') return;
        
        if (!input.value || input.value.trim() === '') {
            input.classList.add('input-error');
            // Remove error class on input
            input.addEventListener('input', function() {
                this.classList.remove('input-error');
            }, { once: true });
            valid = false;
        }
    });

    if (!valid) {
        this.ui.showNotification('Por favor, preencha todos os campos obrigatórios.', 'warning');
    }

    return valid;
};

InsumosApp.prototype.populateSingleFrente = async function(tipo) {
    const select = document.getElementById('single-frente');
    if (!select) return;

    const category = (tipo === 'plantio' || tipo === 'plantio_cana') ? 'plantio' : 'colheita';
    
    if (select.dataset.loadedType === category && select.options.length > 1) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="">Carregando...</option>';
    
    let options = [];
    if (category === 'plantio') {
        if (this.osListCache && Array.isArray(this.osListCache) && this.osListCache.length > 0) {
            const frentes = [...new Set(this.osListCache.map(os => os.frente).filter(Boolean))];
            options = frentes.sort();
        } else {
            options = ["4001", "4002", "4009 Abençoada"];
        }
    } else {
        if (!this.liberacaoCache) {
             try {
                 const res = await this.api.getLiberacaoColheita();
                 if (res && res.success) this.liberacaoCache = res.data;
                 else this.liberacaoCache = [];
             } catch(e) { console.error(e); this.liberacaoCache = []; }
        }
        const frentes = [...new Set(this.liberacaoCache.map(l => l.frente).filter(Boolean))];
        options = frentes.sort();
    }

    select.innerHTML = '<option value="">Selecione</option>';
    options.forEach(opt => {
        const el = document.createElement('option');
        el.value = opt;
        el.textContent = opt;
        select.appendChild(el);
    });

    select.dataset.loadedType = category;

    if (currentVal && options.includes(currentVal)) {
        select.value = currentVal;
    }
};

InsumosApp.prototype.loadQualidadeRecords = async function(targetType = null, preSelectedId = null) {
    const listContainer = document.getElementById('qualidade-records-list');
    const hiddenInput = document.getElementById('selected-qualidade-id');
    const dataInput = document.getElementById('plantio-data');
    const frenteInput = document.getElementById('single-frente');

    if (!listContainer) return;

    // Concurrency control
    const requestId = Date.now();
    this.lastQualidadeRequestId = requestId;

    const data = dataInput ? dataInput.value : null;
    const frente = frenteInput ? frenteInput.value : null;
    
    // Capture current selection to preserve highlight
    // Priority: preSelectedId > hiddenInput.value
    let currentSelectionId = preSelectedId;
    if (!currentSelectionId && hiddenInput) {
        currentSelectionId = hiddenInput.value;
    }
    
    // Note: Do NOT clear currentPlantioId here, as it tracks the main record being edited

    listContainer.innerHTML = '<div class="text-center p-3">Carregando registros...</div>';

    try {
        // Pass null for date to show ALL quality records available (regardless of current date filter)
        // Pass null for frente to show all quality records for any farm
        const res = await this.api.getQualidadeRecords(null, null);
        
        // Check if this is still the latest request
        if (this.lastQualidadeRequestId !== requestId) return;

        if (res.success && res.data && res.data.length > 0) {
            let rows = res.data;
            if (targetType) {
                rows = rows.filter(rec => {
                    const q = rec.qualidade || {};
                    const tipo = q.tipoOperacao;
                    
                    if (targetType === 'plantio') {
                        // Accept ONLY 'qualidade_muda' or 'plantio_cana' as requested by user
                        // But ensure we exclude normal plantio records (which have type 'plantio')
                        return tipo === 'qualidade_muda' || tipo === 'plantio_cana';
                    } else if (targetType === 'colheita_muda') {
                        // For Colheita, only show records that have quality metrics
                        // This excludes normal production records which will have minimal or null quality object
                        // Check for key quality fields like mudasReboulos or similar
                        return tipo === 'colheita_muda' && (q.mudasReboulos != null || q.gemasBoasPct != null);
                    }
                    return true;
                });
            }

            if (rows.length === 0) {
                listContainer.innerHTML = '<div class="text-center p-3 text-muted">Nenhum registro de qualidade encontrado para este tipo de operação.</div>';
                return;
            }

            listContainer.innerHTML = '';
            let foundSelection = false;

            rows.forEach(rec => {
                const div = document.createElement('div');
                div.className = 'quality-record-item';
                div.dataset.id = rec.id;
                div.style.padding = '10px';
                div.style.marginBottom = '8px';
                div.style.border = '1px solid #ddd';
                div.style.borderRadius = '4px';
                div.style.cursor = 'pointer';
                div.style.transition = 'background-color 0.2s';
                
                // Format details
                const dataFmt = this.ui.formatDateBR(rec.data);
                const resp = rec.responsavel || 'N/A';
                const q = rec.qualidade || {};
                const operador = q.qualOperador || 'N/A';
                const trator = q.qualEquipamentoTrator || 'N/A';
                const matricula = q.qualMatricula || 'N/A';
                const tipoLabel = q.tipoOperacao === 'colheita_muda' ? 'Colheita' : 'Plantio';
                const qualidadePct = (q.gemasBoasPct != null)
                    ? `${this.ui.formatNumber(q.gemasBoasPct, 1)}%`
                    : (q.mudasBoasPct != null ? `${this.ui.formatNumber(q.mudasBoasPct, 1)}%` : 'N/A');
                const variedade = q.mudaVariedade || rec.frentes?.[0]?.variedade || 'N/A';
                
                div.innerHTML = `
                    <div style="font-weight: bold; color: var(--primary);">
                        <span class="badge badge-info" style="font-size: 0.8em; margin-right: 5px;">${tipoLabel}</span>
                        📅 ${dataFmt} | Frente: ${rec.frentes?.[0]?.frente || 'N/A'}
                    </div>
                    <div style="margin-top: 4px;"><strong>Responsável:</strong> ${resp}</div>
                    <div style="margin-top: 2px; font-size: 0.9em; color: #555;">
                        <strong>Trator:</strong> ${trator} | <strong>Op:</strong> ${operador} | <strong>Mat:</strong> ${matricula}
                    </div>
                    <div style="margin-top: 2px; font-size: 0.9em; color: #333;">
                        <strong>Qualidade:</strong> ${qualidadePct} | <strong>Variedade:</strong> ${variedade}
                    </div>
                `;

                // Auto-highlight if matches current selection
                if (currentSelectionId && String(rec.id) === String(currentSelectionId)) {
                    div.style.backgroundColor = '#e3f2fd';
                    div.style.borderColor = '#2196F3';
                    div.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    foundSelection = true;
                    // Ensure hidden input is consistent (if passed via preSelectedId)
                    if (hiddenInput && hiddenInput.value !== String(rec.id)) {
                        hiddenInput.value = rec.id;
                        hiddenInput.dataset.label = `${dataFmt} | Frente: ${rec.frentes?.[0]?.frente || 'N/A'}`;
                    }
                }

                div.addEventListener('click', () => {
                    // Selection logic
                    document.querySelectorAll('.quality-record-item').forEach(el => {
                        el.style.backgroundColor = '';
                        el.style.borderColor = '#ddd';
                        el.style.boxShadow = 'none';
                    });
                    div.style.backgroundColor = '#e3f2fd'; // Light blue
                    div.style.borderColor = '#2196F3';
                    div.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    
                    if (hiddenInput) {
                        hiddenInput.value = rec.id;
                        hiddenInput.dataset.label = `${dataFmt} | Frente: ${rec.frentes?.[0]?.frente || 'N/A'}`;
                    }
                    // Note: Do NOT update this.currentPlantioId here. We are linking a quality record to the current Plantio record.
                    
                    // Populate hidden manual inputs with selected record data
                    // This ensures savePlantioDia includes the quality data instead of overwriting with zeros
                    if (rec.qualidade) {
                        const q = rec.qualidade;
                        const setVal = (id, val) => {
                            const el = document.getElementById(id);
                            if (el) el.value = (val !== undefined && val !== null) ? val : '';
                        };

                        setVal('qual-equipamento-trator', q.qualEquipamentoTrator);
                        setVal('qual-equipamento-plantadora', q.qualEquipamentoPlantadora);
                        setVal('qual-operador', q.qualOperador);
                        setVal('qual-matricula', q.qualMatricula);
                        
                        setVal('qual-toletes-total', q.toletesTotal);
                        setVal('qual-toletes-bons', q.toletesBons);
                        setVal('qual-toletes-ruins', q.toletesRuins);
                        setVal('qual-toletes-amostra', q.toletesAmostra);
                        setVal('qual-toletes-media', q.toletesMedia);
                        
                        setVal('qual-gemas-total', q.gemasTotal);
                        setVal('qual-gemas-boas', q.gemasBoas);
                        setVal('qual-gemas-ruins', q.gemasRuins);
                        setVal('qual-gemas-amostra', q.gemasAmostra);
                        setVal('qual-gemas-media', q.gemasMedia);
                        
                        setVal('qual-mudas-total', q.mudasTotal);
                        setVal('qual-mudas-boas', q.mudasBoas);
                        setVal('qual-mudas-ruins', q.mudasRuins);
                        setVal('qual-mudas-amostra', q.mudasAmostra);
                        setVal('qual-mudas-media', q.mudasMedia);
                        setVal('qual-mudas-reboulos', q.mudasReboulos);
                        
                        setVal('qual-muda', q.mudaTonHa);
                        setVal('qual-profundidade', q.profundidadeCm);
                        setVal('qual-cobertura', q.cobertura);
                        setVal('qual-alinhamento', q.alinhamento);
                        setVal('chuva-mm', q.chuvaMm);
                        
                        // Origem Info
                        setVal('muda-fazenda-origem', q.mudaFazendaOrigem);
                        setVal('muda-talhao-origem', q.mudaTalhaoOrigem);
                        setVal('muda-variedade', q.mudaVariedade);
                    }

                    this.ui.showNotification('Registro de qualidade selecionado', 'info');
                });

                listContainer.appendChild(div);
            });
        } else {
            listContainer.innerHTML = '<div class="text-center p-3 text-muted">Nenhum registro de qualidade encontrado para esta data/frente.</div>';
        }
    } catch (e) {
        console.error('Erro ao carregar qualidades:', e);
        listContainer.innerHTML = '<div class="text-center p-3 text-danger">Erro ao carregar registros.</div>';
    }
};

InsumosApp.prototype.toggleOperacaoSections = function() {
    const tipoEl = document.getElementById('tipo-operacao');
    const qualTipoSelect = document.getElementById('qualidade-tipo-select');
    
    // Restore 'tipo' for visibility logic
    const tipo = this.isQualidadeMode ? 'qualidade_muda' : (tipoEl?.value || 'plantio');

    // Determine type for Frente population
    let tipoParaFrente = tipoEl?.value || 'plantio';
    if (this.isQualidadeMode) {
        // In quality mode, use the quality sub-type (plantio_cana or colheita_muda)
        tipoParaFrente = qualTipoSelect ? qualTipoSelect.value : 'plantio_cana';
    }
    
    // Populate Frentes based on type
    this.populateSingleFrente(tipoParaFrente);

    // Toggle visibilidade do Select de Tipo
    const tipoGroup = tipoEl?.closest('.form-group');
    if (tipoGroup) {
        tipoGroup.style.display = this.isQualidadeMode ? 'none' : 'block';
    }

    // Toggle visibilidade do Select de Tipo de Qualidade (Agora no Step 1)
    const qualTipoContainer = document.getElementById('qualidade-tipo-container');
    if (qualTipoContainer) {
        qualTipoContainer.style.display = this.isQualidadeMode ? 'block' : 'none';
    }

    // Toggle campos específicos de Plantio vs Qualidade no Step 1
    const hideInQuality = document.querySelectorAll('.hide-in-quality');
    hideInQuality.forEach(el => {
        el.style.display = this.isQualidadeMode ? 'none' : 'block';
    });

    const showInQuality = document.querySelectorAll('.show-in-quality-only');
    showInQuality.forEach(el => {
        el.style.display = this.isQualidadeMode ? 'block' : 'none';
    });
    
    // Toggle Step 3 Content (Manual vs Selection)
    const qualSelectionContainer = document.getElementById('qualidade-selection-container');
    const qualManualContent = document.getElementById('qualidade-manual-content');
    const qualManualBlock = document.querySelector('.qualidade-manual-block');
    
    if (this.isQualidadeMode) {
        // Modo Qualidade: Preenchimento Manual
        if (qualSelectionContainer) qualSelectionContainer.style.display = 'none';
        if (qualManualContent) qualManualContent.style.display = 'block';
        if (qualManualBlock) qualManualBlock.style.display = 'block';
    } else if (tipo === 'plantio' || tipo === 'colheita_muda') {
        // Modo Plantio ou Colheita: Seleção de Registro Existente
        if (qualSelectionContainer) qualSelectionContainer.style.display = 'block';
        if (qualManualContent) qualManualContent.style.display = 'none';
        if (qualManualBlock) qualManualBlock.style.display = 'none';
    } else {
        // Outros: Pode variar, mas por padrão manual hidden se não tiver qualidade
        if (qualSelectionContainer) qualSelectionContainer.style.display = 'none';
        // Manual visibility handled below by sub-sections
    }

    // Subtipo de Qualidade (se estiver em modo qualidade)
    const subTipoQualidade = (this.isQualidadeMode && qualTipoSelect) ? qualTipoSelect.value : 'plantio_cana';

    // Elementos das Seções de Qualidade
    const secGemas = document.getElementById('sec-gemas');
    const secToletes = document.getElementById('sec-toletes');
    const secMudas = document.getElementById('sec-mudas');
    const secOutros = document.getElementById('sec-outros');
    const secMudaConsumo = document.getElementById('sec-muda-consumo-card');
    const secQualPlantioCana = document.getElementById('sec-qualidade-plantio-cana');
    const secQualPlantioCanaFields = document.getElementById('qualidade-plantio-cana-fields');
    
    // Seções principais
    const secInsumos = document.getElementById('sec-insumos');
    const secColheitaProducao = document.getElementById('sec-colheita-producao-card');

    // Campos de área de plantio que devem sumir em colheita ou qualidade
    const plantioAreaFields = [
        'single-area',           // Área Planejada OS
        'single-plantio-dia',    // Plantio dia
        'single-area-acumulada', // Acumulado Plantio
        'cobricao-dia',          // Cobrição Dia
        'cobricao-acumulada'     // Cobrição Acumulado
    ];

    // Lógica de Visibilidade dos Campos de Plantio
    plantioAreaFields.forEach(id => {
        const el = document.getElementById(id);
        const group = el?.closest('.form-group');
        if (group) {
            // Mostrar apenas se for tipo plantio E NÃO for modo qualidade
            group.style.display = (tipo === 'plantio') ? 'block' : 'none';
        }
    });

    // Toggle Step Buttons Visibility
    const step2Btn = document.querySelector('.step-btn[data-step="2"]'); // Insumos
    const step3Btn = document.querySelector('.step-btn[data-step="3"]'); // Qualidade
    const histBtns = document.querySelectorAll('.btn-qualidade-historico'); // Histórico Buttons
    
    if (step2Btn) {
        // Passo 2 (Insumos) só aparece em Plantio
        step2Btn.style.display = tipo === 'plantio' ? 'flex' : 'none';
    }
    if (step3Btn) {
        // Passo 3 (Qualidade) aparece em Qualidade de Muda OU Plantio (para agregar) OU Colheita
        step3Btn.style.display = (tipo === 'qualidade_muda' || this.isQualidadeMode || tipo === 'plantio' || tipo === 'colheita_muda') ? 'flex' : 'none';
    }
    if (histBtns.length > 0) {
        // Botão Histórico só aparece em Qualidade de Muda
        histBtns.forEach(btn => {
            btn.style.display = (tipo === 'qualidade_muda' || this.isQualidadeMode) ? 'block' : 'none';
        });
    }
    
    // Resetar visibilidade das seções
    const setDisplay = (el, show) => { if (el) el.style.display = show ? 'block' : 'none'; };

    if (tipo === 'plantio') {
        setDisplay(secInsumos, true);
        setDisplay(secColheitaProducao, false);
        // Mostrar seções de qualidade para Plantio (Agregado)
        setDisplay(secGemas, true);
        setDisplay(secToletes, true);
        setDisplay(secMudas, false);
        setDisplay(secOutros, true);
        setDisplay(secMudaConsumo, true);
        setDisplay(secQualPlantioCanaFields, false);
    } else if (tipo === 'colheita_muda') {
        setDisplay(secInsumos, false);
        setDisplay(secColheitaProducao, true); // Campos de colheita (hectares, tch)
        // Esconder seções de qualidade
        setDisplay(secGemas, false);
        setDisplay(secToletes, false);
        setDisplay(secMudas, false);
        setDisplay(secOutros, false);
        setDisplay(secMudaConsumo, false);
        setDisplay(secQualPlantioCanaFields, false);
    } else if (tipo === 'qualidade_muda') {
        setDisplay(secInsumos, false);
        setDisplay(secColheitaProducao, false);
        
        // Lógica diferenciada baseada no subtipo de qualidade
        if (subTipoQualidade === 'plantio_cana') {
            // Plantio de Cana: usar apenas a nova estrutura específica
            setDisplay(secGemas, false); 
            setDisplay(secToletes, false);
            setDisplay(secMudas, false);
            setDisplay(secOutros, false);
            setDisplay(secMudaConsumo, false);
            setDisplay(secQualPlantioCana, true);
            setDisplay(secQualPlantioCanaFields, true);
        } else {
            // Colheita de Muda: Trator..., Origem & Qualidade Muda
            setDisplay(secGemas, false); 
            setDisplay(secToletes, false);
            setDisplay(secMudas, true);
            setDisplay(secOutros, false);
            setDisplay(secMudaConsumo, false);
            setDisplay(secQualPlantioCana, false);
            setDisplay(secQualPlantioCanaFields, false);
        }
    }
};

InsumosApp.prototype.resetPlantioForm = function(mode = 'normal') {
    this.currentPlantioId = null;
    this.originalPlantioValue = 0; // Reset original value
    this.tempFazendaStats = null; // Limpar stats temporários para evitar valores residuais
    this.plantioInsumosDraft = [];
    this.renderInsumosDraft();
    
    // Definir modo de operação (normal vs qualidade)
    this.isQualidadeMode = (mode === 'qualidade');

    const modalTitle = document.getElementById('modal-novo-plantio-title');
    if (modalTitle) {
        modalTitle.textContent = this.isQualidadeMode ? 'Novo Lançamento de Qualidade' : 'Novo Lançamento de Plantio';
    }

    const tipoOp = document.getElementById('tipo-operacao');
    if (tipoOp) {
        // Se for modo normal, reseta para plantio
        // Se for modo qualidade, o toggleOperacaoSections vai cuidar de esconder o select e forçar o tipo lógico
        if (!this.isQualidadeMode) {
            tipoOp.value = 'plantio';
        }
        this.toggleOperacaoSections();
    }

    const ids = [
        'qual-equipamento-trator', 'qual-equipamento-plantadora', 'qual-operador', 'qual-matricula', 'qual-frota',
        'plantio-data', 'plantio-hora', 'plantio-turno', 'plantio-responsavel', 'plantio-obs',
        'qual-toletes-total', 'qual-toletes-bons', 'qual-toletes-ruins', 'qual-toletes-amostra',
        'qual-gemas-total', 'qual-gemas-boas', 'qual-gemas-ruins', 'qual-gemas-amostra', 'qual-gemas-media',
        'qual-mudas-total', 'qual-mudas-boas', 'qual-mudas-ruins', 'qual-mudas-amostra', 'qual-mudas-media', 'qual-mudas-reboulos',
        'qual-muda', 'qual-profundidade', 'qual-cobertura', 'qual-alinhamento', 'chuva-mm',
        'oxifertil-dose', 'cobricao-dia', 'cobricao-acumulada',
        'muda-consumo-total', 'muda-consumo-acumulado', 'muda-consumo-dia', 'muda-previsto',
        'muda-liberacao-fazenda', 'muda-variedade', 'qual-muda-liberacao', 'qual-muda-variedade', 'muda-colheita-info', 'muda-fazenda-origem', 'muda-talhao-origem',
        'colheita-hectares', 'colheita-tch-estimado', 'colheita-tch-real',
        'single-frente', 'single-fazenda', 'single-cod', 'single-regiao',
        'single-area', 'single-plantada', 'single-area-total', 'single-area-acumulada', 'single-plantio-dia',
        'qual-esq-peso-balde', 'qual-esq-peso-bruto', 'qual-esq-peso-liquido', 'qual-esq-kg-ha', 'qual-esq-qtd-bons', 'qual-esq-qtd-ruins', 
        'qual-esq-peso-bons', 'qual-esq-peso-ruins', 'qual-esq-peso-bons-pct', 'qual-esq-peso-ruins-pct', 'qual-esq-gemas-por-tolete', 'qual-esq-gemas-por5',
        'qual-dir-peso-balde', 'qual-dir-peso-bruto', 'qual-dir-peso-liquido', 'qual-dir-kg-ha', 'qual-dir-qtd-bons', 'qual-dir-qtd-ruins', 
        'qual-dir-peso-bons', 'qual-dir-peso-ruins', 'qual-dir-peso-bons-pct', 'qual-dir-peso-ruins-pct', 'qual-dir-gemas-por-tolete', 'qual-dir-gemas-por5',
        'qual-media-kg-ha', 'qual-media-gemas-por-tolete', 'qual-total-toletes-bons', 'qual-total-toletes-ruins', 'qual-total-gemas-boas', 'qual-media-gemas-por5'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = '';
            el.classList.remove('input-error');
            const msgEl = document.getElementById('msg-' + id);
            if (msgEl) msgEl.style.display = 'none';
        }
    });

    // Reset Turno Buttons to Default (A)
    const turnoBtns = document.querySelectorAll('.shift-selector .shift-btn');
    turnoBtns.forEach(b => {
        if (b.dataset.shift === 'A') {
            b.classList.add('active', 'btn-primary');
            b.classList.remove('btn-secondary');
        } else {
            b.classList.remove('active', 'btn-primary');
            b.classList.add('btn-secondary');
        }
    });
    const turnoInput = document.getElementById('plantio-turno');
    if (turnoInput) turnoInput.value = 'A';

    // Clear hidden inputs not in the list
    const hiddenQualId = document.getElementById('selected-qualidade-id');
    if (hiddenQualId) {
        hiddenQualId.value = '';
        hiddenQualId.dataset.label = '';
    }

    const dataEl = document.getElementById('plantio-data');
    if (dataEl) dataEl.valueAsDate = new Date();

    const saveBtn = document.getElementById('plantio-save-btn');
    if (saveBtn) saveBtn.textContent = '💾 Registrar Dia';

    this.updateToletesPercent();
    this.updateGemasPercent();
    this.updateMudasPercent();

    this.goToPlantioStep(1);
    this.updatePlantioSummary();
};

// Qualidade Plantio de Cana: listeners e cálculos
InsumosApp.prototype.initQualidadePlantioCanaListeners = function() {
    const isActive = document.getElementById('sec-qualidade-plantio-cana')?.style.display !== 'none';
    if (!isActive) return;
    const ids = [
        'qual-esq-peso-bruto','qual-esq-qtd-bons','qual-esq-qtd-ruins','qual-esq-peso-bons','qual-esq-peso-ruins','qual-esq-gemas-por-tolete',
        'qual-dir-peso-bruto','qual-dir-qtd-bons','qual-dir-qtd-ruins','qual-dir-peso-bons','qual-dir-peso-ruins','qual-dir-gemas-por-tolete'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.__qualCalcHandler) {
            el.removeEventListener('input', el.__qualCalcHandler);
        }
        const handler = () => {
            this.updateQualidadePlantioCanaCalculations();
        };
        el.addEventListener('input', handler);
        el.__qualCalcHandler = handler;
    });
    // Confirmar override manual dos pesos (bons/ruins) por lado
    const attachManualWeightConfirm = (pref) => {
        ['peso-bons','peso-ruins'].forEach(suffix => {
            const el = document.getElementById(`${pref}-${suffix}`);
            if (!el) return;
            if (el.__manualConfirmHandler) {
                el.removeEventListener('change', el.__manualConfirmHandler);
            }
            const handler = async () => {
                // Evita confirmar repetidamente
                if (el.dataset.manualOverride === 'true') return;
                const confirmed = await this.showConfirmationModal(
                    'Confirmar peso real dos toletes',
                    'Você está informando o peso real dos toletes. Confirmar vai desativar o preenchimento automático para este lado.'
                );
                if (confirmed) {
                    el.dataset.manualOverride = 'true';
                } else {
                    // Reverter para cálculo automático
                    el.dataset.manualOverride = '';
                    this.updateQualidadePlantioCanaCalculations();
                }
            };
            el.addEventListener('change', handler);
            el.__manualConfirmHandler = handler;
        });
    };
    attachManualWeightConfirm('qual-esq');
    attachManualWeightConfirm('qual-dir');
    this.updateQualidadePlantioCanaCalculations();
};

InsumosApp.prototype.updateQualidadePlantioCanaCalculations = function() {
    const meters = 5;
    const factor = 6666;
    const computeSide = (pref) => {
        const val = (id) => {
            const el = document.getElementById(`${pref}-${id}`);
            if (!el) return 0;
            let v = el.value || '0';
            v = String(v).replace(',', '.');
            const num = parseFloat(v);
            return isNaN(num) ? 0 : num;
        };
        const set = (id, v) => {
            const el = document.getElementById(`${pref}-${id}`);
            if (el) el.value = isFinite(v) ? Number(v).toFixed(2) : '';
        };
        const bucket = val('peso-balde') || 0.460;
        const pesoBruto = val('peso-bruto');
        const pesoLiquido = Math.max(0, pesoBruto - bucket);
        set('peso-liquido', pesoLiquido);
        const kgHa = (pesoLiquido / meters) * factor;
        set('kg-ha', kgHa);
        let qtdBons = val('qtd-bons');
        let qtdRuins = val('qtd-ruins');
        let pesoBons = val('peso-bons');
        let pesoRuins = val('peso-ruins');
        const totalPesoPart = (pesoBons || 0) + (pesoRuins || 0);
        if (pesoLiquido > 0 && totalPesoPart > 0) {
            const pctBons = (pesoBons / pesoLiquido) * 100;
            const pctRuins = (pesoRuins / pesoLiquido) * 100;
            set('peso-bons-pct', pctBons);
            set('peso-ruins-pct', pctRuins);
        } else {
            set('peso-bons-pct', 0);
            set('peso-ruins-pct', 0);
        }
        const gemasPorTolete = val('gemas-por-tolete');
        const gemasPor5 = gemasPorTolete / 5;
        set('gemas-por5', gemasPor5);
        return { kgHa, qtdBons, qtdRuins, pesoBons, pesoRuins, gemasPorTolete, gemasPor5 };
    };
    const esq = computeSide('qual-esq');
    const dir = computeSide('qual-dir');
    const mediaKgHa = ((esq.kgHa || 0) + (dir.kgHa || 0)) / 2;
    const mediaGemas = ((esq.gemasPor5 || 0) + (dir.gemasPor5 || 0)) / 2;
    const totalBons = (esq.qtdBons || 0) + (dir.qtdBons || 0);
    const totalRuins = (esq.qtdRuins || 0) + (dir.qtdRuins || 0);
    const setOut = (id, v) => { const el = document.getElementById(id); if (el) el.value = isFinite(v) ? Number(v).toFixed(2) : ''; };
    setOut('qual-media-kg-ha', mediaKgHa);
    setOut('qual-media-gemas-por-tolete', mediaGemas);
    const totalToletes = totalBons + totalRuins;
    let pctBons = 0;
    let pctRuins = 0;
    if (totalToletes > 0) {
        pctBons = (totalBons / totalToletes) * 100;
        pctRuins = (totalRuins / totalToletes) * 100;
    }
    setOut('qual-total-toletes-bons', pctBons);
    setOut('qual-total-toletes-ruins', pctRuins);
};
InsumosApp.prototype.handleEditPlantio = async function(id) {
    if (!this.plantioDia) return;
    const record = this.plantioDia.find(r => String(r.id) === String(id));
    if (!record) return;

    // Determine type FIRST
    const tipoOp = record.tipo_operacao || (record.qualidade && record.qualidade.tipoOperacao) || 'plantio';
    
    // Call reset with correct mode
    const isQualidadeTipo = (tipoOp === 'qualidade_muda' || tipoOp === 'plantio_cana');
    const mode = isQualidadeTipo ? 'qualidade' : 'normal';
    this.resetPlantioForm(mode);

    // Ensure quality options are loaded before setting values
    await this.loadLiberacoesForSelect();

    this.currentPlantioId = record.id;
    console.log('Editando Plantio:', record);

    const saveBtn = document.getElementById('plantio-save-btn');
    if (saveBtn) saveBtn.textContent = '💾 Salvar Alterações';

    // Campos Gerais
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

    set('plantio-data', record.data);
    set('plantio-hora', (record.qualidade && record.qualidade.horaRegistro) || '');
    set('plantio-responsavel', record.responsavel);
    set('plantio-obs', record.observacoes);

    // Tipo de Operação
    // Only set if option exists (for plantio/colheita). Para qualidade, o select específico é usado.
    if (!isQualidadeTipo) {
        set('tipo-operacao', tipoOp);
    } else {
        const qualTipoSelect = document.getElementById('qualidade-tipo-select');
        if (qualTipoSelect) {
            qualTipoSelect.value = tipoOp;
        }
    }
    
    // Disparar evento para ajustar visibilidade das seções
    const tipoOpEl = document.getElementById('tipo-operacao');
    if (tipoOpEl) {
        // Forçar chamada do toggle se o evento não funcionar como esperado ou para garantir
        if (typeof this.toggleOperacaoSections === 'function') {
            this.toggleOperacaoSections();
        } else {
            tipoOpEl.dispatchEvent(new Event('change'));
        }
    }

    // Qualidade
    const q = record.qualidade || {};
    
    // Restore quality selection if available
    if (q.qualitySourceId) {
        set('selected-qualidade-id', q.qualitySourceId);
        const hidden = document.getElementById('selected-qualidade-id');
        if (hidden) hidden.dataset.label = q.qualitySourceLabel || '';
        
        // Load and highlight the selected record
        // This ensures the list is populated and the item is highlighted immediately
        if (tipoOp === 'plantio' || tipoOp === 'colheita_muda') {
             // Use the modified loadQualidadeRecords with preSelectedId
             await this.loadQualidadeRecords(tipoOp, q.qualitySourceId);
        }
    }
    
    // Equipamentos
    set('qual-equipamento-trator', q.qualEquipamentoTrator);
    set('qual-equipamento-plantadora', q.qualEquipamentoPlantadora);
    set('qual-operador', q.qualOperador);
    set('qual-matricula', q.qualMatricula);
    set('qual-matricula-header', q.qualMatricula);

    set('qual-toletes-total', q.toletesTotal);
    set('qual-toletes-bons', q.toletesBons);
    set('qual-toletes-ruins', q.toletesRuins);
    set('qual-toletes-amostra', q.toletesAmostra);
    
    set('qual-gemas-total', q.gemasTotal);
    set('qual-gemas-boas', q.gemasBoas);
    set('qual-gemas-ruins', q.gemasRuins);
    set('qual-gemas-amostra', q.gemasAmostra);
    set('qual-gemas-media', q.gemasMedia);

    set('colheita-hectares', record.colheita_hectares || q.colheitaHectares);
    set('colheita-tch-estimado', record.colheita_tch_estimado || q.colheitaTchEstimado);
    set('colheita-tch-real', record.colheita_tch_real || q.colheitaTchReal);
    set('colheita-toneladas-totais', record.colheita_toneladas_totais || q.colheitaTonTotais);

    set('qual-mudas-total', q.mudasTotal);
    set('qual-mudas-boas', q.mudasBoas);
    set('qual-mudas-ruins', q.mudasRuins);
    set('qual-mudas-amostra', q.mudasAmostra);
    set('qual-mudas-media', q.mudasMedia);

    set('qual-muda', q.mudaTonHa);
    set('qual-profundidade', q.profundidadeCm);
    
    // Restore Qualidade Plantio de Cana Specific Fields
    if (tipoOp === 'plantio_cana' || q.tipoOperacao === 'plantio_cana') {
        set('qual-esq-peso-balde', q.esqPesoBalde || q.pesoBaldeKg || 0.460);
        set('qual-esq-peso-bruto', q.esqPesoBruto);
        set('qual-esq-peso-liquido', q.esqPesoLiquido);
        set('qual-esq-kg-ha', q.esqKgHa);
        set('qual-esq-qtd-bons', q.esqQtdBons);
        set('qual-esq-qtd-ruins', q.esqQtdRuins);
        set('qual-esq-peso-bons', q.esqPesoBons);
        set('qual-esq-peso-ruins', q.esqPesoRuins);
        set('qual-esq-peso-bons-pct', q.esqPesoBonsPct);
        set('qual-esq-peso-ruins-pct', q.esqPesoRuinsPct);
        set('qual-esq-gemas-por-tolete', q.esqGemasBoasPorTolete);
        set('qual-esq-gemas-por5', q.esqGemasBoasPor5);
        
        set('qual-dir-peso-balde', q.dirPesoBalde || q.pesoBaldeKg || 0.460);
        set('qual-dir-peso-bruto', q.dirPesoBruto);
        set('qual-dir-peso-liquido', q.dirPesoLiquido);
        set('qual-dir-kg-ha', q.dirKgHa);
        set('qual-dir-qtd-bons', q.dirQtdBons);
        set('qual-dir-qtd-ruins', q.dirQtdRuins);
        set('qual-dir-peso-bons', q.dirPesoBons);
        set('qual-dir-peso-ruins', q.dirPesoRuins);
        set('qual-dir-peso-bons-pct', q.dirPesoBonsPct);
        set('qual-dir-peso-ruins-pct', q.dirPesoRuinsPct);
        set('qual-dir-gemas-por-tolete', q.dirGemasBoasPorTolete);
        set('qual-dir-gemas-por5', q.dirGemasBoasPor5);
        
        set('qual-media-kg-ha', q.mediaKgHa);
        set('qual-media-gemas-por-tolete', q.mediaGemasPorTolete);
        set('qual-total-toletes-bons', q.totalToletesBons);
        set('qual-total-toletes-ruins', q.totalToletesRuins);
        set('qual-total-gemas-boas', q.totalGemasBoas);
        set('qual-media-gemas-por5', q.mediaGemasPor5);
    }
    set('qual-cobertura', q.cobertura);
    set('qual-alinhamento', q.alinhamento);
    set('chuva-mm', q.chuvaMm);
    
    set('oxifertil-dose', q.oxifertilDose);
    set('cobricao-dia', q.cobricaoDia);
    set('cobricao-acumulada', q.cobricaoAcumulada);
    
    set('muda-consumo-total', q.mudaConsumoTotal);
    set('muda-consumo-acumulado', q.mudaConsumoAcumulado);
    set('muda-consumo-dia', q.mudaConsumoDia);
    set('muda-previsto', q.mudaPrevisto);
    set('muda-liberacao-fazenda', q.mudaLiberacaoFazenda);
    set('qual-muda-liberacao', q.mudaLiberacaoFazenda);
    set('muda-variedade', q.mudaVariedade);
    set('qual-muda-variedade', q.mudaVariedade);
    set('muda-colheita-info', q.mudaColheitaInfo);
    set('muda-fazenda-origem', q.mudaFazendaOrigem);
    set('muda-talhao-origem', q.mudaTalhaoOrigem);
    set('qual-mudas-reboulos', q.mudasReboulos);
    set('qual-mudas-reboulos-bons', q.mudasReboulosBons);
    set('qual-mudas-reboulos-ruins', q.mudasReboulosRuins);
    // Pct fields are auto-calculated by updateMudasPercent() called later

    // Frentes (pega a primeira se houver)
    if (record.frentes && record.frentes.length > 0) {
        const f = record.frentes[0];
        set('single-frente', f.frente);
        
        // Trigger change para carregar OS list se necessário, mas pode ser assíncrono
        // Vamos setar diretamente por enquanto
        const singleFrente = document.getElementById('single-frente');
        if (singleFrente) singleFrente.dispatchEvent(new Event('change'));

        set('single-fazenda', f.fazenda);
        set('single-cod', f.cod);
        set('single-regiao', f.regiao);
        set('single-area', f.area);
        set('single-plantada', f.plantada);
        set('single-area-total', f.areaTotal);
        set('single-area-acumulada', f.areaAcumulada);
        set('single-plantio-dia', f.plantioDiario);
        this.originalPlantioValue = parseFloat(f.plantioDiario || f.plantada || 0);
        this.originalMudaValue = parseFloat(q.mudaConsumoDia || 0);
        this.originalCobricaoValue = parseFloat(q.cobricaoDia || 0);

        // --- FIX: Carregar stats atualizados da fazenda para cálculo correto do acumulado na edição ---
        if (f.cod) {
             this.api.getFazendaByCodigo(f.cod).then(res => {
                 if (res && res.success && res.data) {
                     this.tempFazendaStats = {
                        plantioAcumulado: res.data.plantio_acumulado || 0,
                        mudaAcumulada: res.data.muda_acumulada || 0,
                        cobricaoAcumulada: res.data.cobricao_acumulada || 0
                     };
                     console.log('Stats da fazenda carregados para edição:', this.tempFazendaStats);
                     
                     // Force update UI with loaded stats
                     this.updateAccumulatedStats();
                 }
             }).catch(e => console.error('Erro ao buscar stats fazenda edit:', e));
        }
    }

    // --- FIX: Restaurar Turno ---
    const savedHora = record.hora || (record.qualidade && record.qualidade.horaRegistro) || '';
    if (savedHora) {
        let shift = 'A';
        if (savedHora.includes('B')) shift = 'B';
        else if (savedHora.toLowerCase().includes('geral')) shift = 'Geral';
        
        const turnoInput = document.getElementById('plantio-turno');
        if (turnoInput) turnoInput.value = shift;
        
        const btns = document.querySelectorAll('.shift-selector .shift-btn');
        btns.forEach(b => {
            if (b.dataset.shift === shift) {
                b.classList.add('active', 'btn-primary');
                b.classList.remove('btn-secondary');
            } else {
                b.classList.remove('active', 'btn-primary');
                b.classList.add('btn-secondary');
            }
        });
    }

    // Insumos
    this.plantioInsumosDraft = Array.isArray(record.insumos) ? record.insumos.slice() : [];
    this.renderInsumosDraft();

    // Abrir Modal
    const modal = document.getElementById('novo-lancamento-modal');
    if (modal) modal.style.display = 'flex';
    
    // Atualizar labels de porcentagem
    this.updateToletesPercent();
    this.updateGemasPercent();
    this.updateMudasPercent();

    // Atualizar Resumo do Modal (Advanced UI)
    this.updatePlantioSummary();
};

InsumosApp.prototype.savePlantioDia = async function(createAnother = false) {
    console.log('Iniciando savePlantioDia...');

    // Fallback Check: If modal title says "Qualidade", force Quality Mode
    const modalTitle = document.getElementById('modal-novo-plantio-title')?.textContent || '';
    if (modalTitle.includes('Qualidade')) {
        console.log('Detectado modo Qualidade pelo título do modal.');
        this.isQualidadeMode = true;
    }

    console.log('Mode:', this.isQualidadeMode ? 'Qualidade' : 'Normal');

    // Helper to handle Brazilian number format (commas)
    const parseVal = (id) => {
        const el = document.getElementById(id);
        if (!el) return 0;
        let val = el.value;
        if (!val || typeof val === 'string' && val.trim() === '') return 0;
        if (typeof val === 'string') val = val.replace(',', '.');
        const num = parseFloat(val);
        return isNaN(num) ? 0 : num;
    };

    const data = document.getElementById('plantio-data')?.value;
    const responsavel = document.getElementById('plantio-responsavel')?.value;
    const observacoes = document.getElementById('plantio-obs')?.value || '';
    
    // Captura Turno ou Hora
    const turnoInput = document.getElementById('plantio-turno');
    const horaRegistro = turnoInput ? `Turno ${turnoInput.value}` : (document.getElementById('plantio-hora')?.value || '');
    
    const toletesTotalVal = parseVal('qual-toletes-total');
    const toletesBonsVal = parseVal('qual-toletes-bons');
    const toletesRuinsVal = parseVal('qual-toletes-ruins');
    const toletesBonsPctVal = toletesTotalVal > 0 ? (toletesBonsVal / toletesTotalVal) * 100 : 0;
    const toletesRuinsPctVal = toletesTotalVal > 0 ? (toletesRuinsVal / toletesTotalVal) * 100 : 0;

    const gemasTotalVal = parseVal('qual-gemas-total');
    const gemasBoasVal = parseVal('qual-gemas-boas');
    const gemasRuinsVal = parseVal('qual-gemas-ruins');
    const gemasBoasPctVal = gemasTotalVal > 0 ? (gemasBoasVal / gemasTotalVal) * 100 : 0;
    const gemasRuinsPctVal = gemasTotalVal > 0 ? (gemasRuinsVal / gemasTotalVal) * 100 : 0;

    const mudasTotalVal = parseVal('qual-mudas-total');
    const mudasBoasVal = parseVal('qual-mudas-boas');
    const mudasRuinsVal = parseVal('qual-mudas-ruins');
    const mudasBoasPctVal = mudasTotalVal > 0 ? (mudasBoasVal / mudasTotalVal) * 100 : 0;
    const mudasRuinsPctVal = mudasTotalVal > 0 ? (mudasRuinsVal / mudasTotalVal) * 100 : 0;

    const tipoOperacao = this.isQualidadeMode 
        ? (document.getElementById('qualidade-tipo-select')?.value || 'plantio_cana') // Use specific sub-type in Quality Mode
        : (document.getElementById('tipo-operacao')?.value || 'plantio');

    let qualidade;
    if (this.isQualidadeMode && tipoOperacao === 'plantio_cana') {
        const valRaw = (id) => {
            const el = document.getElementById(id);
            if (!el) return 0;
            let v = el.value || '0';
            v = String(v).replace(',', '.');
            const num = parseFloat(v);
            return isNaN(num) ? 0 : num;
        };
        qualidade = {
            tipoOperacao: tipoOperacao,
            // Constantes de amostragem
            amostraMetragem: 5,
            espacamentoLinhas: 1.5,
            // Lado Esquerdo
            esqPesoBalde: valRaw('qual-esq-peso-balde'),
            esqPesoBruto: valRaw('qual-esq-peso-bruto'),
            esqPesoLiquido: valRaw('qual-esq-peso-liquido'),
            esqKgHa: valRaw('qual-esq-kg-ha'),
            esqQtdBons: valRaw('qual-esq-qtd-bons'),
            esqQtdRuins: valRaw('qual-esq-qtd-ruins'),
            esqPesoBons: valRaw('qual-esq-peso-bons'),
            esqPesoRuins: valRaw('qual-esq-peso-ruins'),
            esqPesoBonsPct: valRaw('qual-esq-peso-bons-pct'),
            esqPesoRuinsPct: valRaw('qual-esq-peso-ruins-pct'),
            esqGemasBoasPorTolete: valRaw('qual-esq-gemas-por-tolete'),
            esqGemasBoasPor5: valRaw('qual-esq-gemas-por5'),
            // Lado Direito
            dirPesoBalde: valRaw('qual-dir-peso-balde'),
            dirPesoBruto: valRaw('qual-dir-peso-bruto'),
            dirPesoLiquido: valRaw('qual-dir-peso-liquido'),
            dirKgHa: valRaw('qual-dir-kg-ha'),
            dirQtdBons: valRaw('qual-dir-qtd-bons'),
            dirQtdRuins: valRaw('qual-dir-qtd-ruins'),
            dirPesoBons: valRaw('qual-dir-peso-bons'),
            dirPesoRuins: valRaw('qual-dir-peso-ruins'),
            dirPesoBonsPct: valRaw('qual-dir-peso-bons-pct'),
            dirPesoRuinsPct: valRaw('qual-dir-peso-ruins-pct'),
            dirGemasBoasPorTolete: valRaw('qual-dir-gemas-por-tolete'),
            dirGemasBoasPor5: valRaw('qual-dir-gemas-por5'),
            // Resultados finais
            mediaKgHa: valRaw('qual-media-kg-ha'),
            mediaGemasPorTolete: valRaw('qual-media-gemas-por-tolete'),
            totalToletesBons: valRaw('qual-total-toletes-bons'),
            totalToletesRuins: valRaw('qual-total-toletes-ruins'),
            totalGemasBoas: valRaw('qual-total-gemas-boas'),
            mediaGemasPor5: valRaw('qual-media-gemas-por5'),
            // Equipe e Equipamentos
            qualEquipamentoTrator: document.getElementById('qual-equipamento-trator')?.value || '',
            qualEquipamentoPlantadora: document.getElementById('qual-equipamento-plantadora')?.value || '',
            qualOperador: document.getElementById('qual-operador')?.value || '',
            qualMatricula: document.getElementById('qual-matricula')?.value || document.getElementById('qual-matricula-header')?.value || '',
            horaRegistro: horaRegistro,
            // Fallback for indicators used in summary/badges
            gemasTotal: valRaw('qual-total-gemas-boas') || 1, 
            gemasBoas: valRaw('qual-total-gemas-boas') || 0,
            gemasBoasPct: valRaw('qual-total-toletes-bons') || 0,
            toletesBons: valRaw('qual-total-toletes-bons') || 0,
            toletesRuins: valRaw('qual-total-toletes-ruins') || 0
        };
    } else {
        qualidade = {
            gemasTotal: gemasTotalVal,
            gemasBoas: gemasBoasVal,
            gemasRuins: gemasRuinsVal,
            gemasBoasPct: gemasBoasPctVal,
            gemasRuinsPct: gemasRuinsPctVal,
            gemasOk: gemasBoasVal,
            gemasNok: gemasRuinsVal,
            gemasAmostra: parseVal('qual-gemas-amostra'),
            gemasMedia: parseVal('qual-gemas-media'),
            mudasTotal: mudasTotalVal,
            mudasBoas: mudasBoasVal,
            mudasRuins: mudasRuinsVal,
            mudasBoasPct: mudasBoasPctVal,
            mudasRuinsPct: mudasRuinsPctVal,
            mudasAmostra: parseVal('qual-mudas-amostra'),
            mudasMedia: parseVal('qual-mudas-media'),
            toletesTotal: toletesTotalVal,
            toletesBons: toletesBonsVal,
            toletesRuins: toletesRuinsVal,
            toletesBonsPct: toletesBonsPctVal,
            toletesRuinsPct: toletesRuinsPctVal,
            toletesAmostra: parseVal('qual-toletes-amostra'),
            toletesMedia: parseVal('qual-toletes-media'),
            mudaTonHa: parseVal('qual-muda'),
            profundidadeCm: parseVal('qual-profundidade'),
            cobertura: document.getElementById('qual-cobertura')?.value || '',
            alinhamento: document.getElementById('qual-alinhamento')?.value || '',
            chuvaMm: parseVal('chuva-mm'),
            oxifertilDose: parseVal('oxifertil-dose'),
            cobricaoDia: parseVal('cobricao-dia'),
            cobricaoAcumulada: parseVal('cobricao-acumulada'),
            mudaConsumoTotal: parseVal('muda-consumo-total'),
            mudaConsumoAcumulado: parseVal('muda-consumo-acumulado'),
            mudaConsumoDia: parseVal('muda-consumo-dia'),
            mudaPrevisto: parseVal('muda-previsto'),
            mudaLiberacaoFazenda: document.getElementById('qual-muda-liberacao')?.value || document.getElementById('muda-liberacao-fazenda')?.value || '',
            mudaVariedade: document.getElementById('qual-muda-variedade')?.value || document.getElementById('muda-variedade')?.value || '',
            mudaColheitaInfo: document.getElementById('muda-colheita-info')?.value || '',
            mudaFazendaOrigem: document.getElementById('muda-fazenda-origem')?.value || '',
            mudaTalhaoOrigem: document.getElementById('muda-talhao-origem')?.value || '',
            mudasReboulos: parseVal('qual-mudas-reboulos'),
            mudasReboulosBons: parseVal('qual-mudas-reboulos-bons'),
            mudasReboulosRuins: parseVal('qual-mudas-reboulos-ruins'),
            mudasReboulosBonsPct: parseVal('qual-mudas-reboulos-bons-pct'),
            mudasReboulosRuinsPct: parseVal('qual-mudas-reboulos-ruins-pct'),
            colheitaHectares: parseVal('colheita-hectares'),
            colheitaTchEstimado: parseVal('colheita-tch-estimado'),
            colheitaTchReal: parseVal('colheita-tch-real'),
            colheitaTonTotais: parseVal('colheita-toneladas-totais'),
            qualEquipamentoTrator: document.getElementById('qual-equipamento-trator')?.value || '',
            qualEquipamentoPlantadora: document.getElementById('qual-equipamento-plantadora')?.value || '',
            qualOperador: document.getElementById('qual-operador')?.value || '',
            qualMatricula: document.getElementById('qual-matricula-header')?.value || document.getElementById('qual-matricula')?.value || '',
            horaRegistro: horaRegistro,
            qualitySourceId: document.getElementById('selected-qualidade-id')?.value || null,
            qualitySourceLabel: document.getElementById('selected-qualidade-id')?.dataset.label || null,
            tipoOperacao: tipoOperacao
        };
    }
    const osKeyForFazenda = document.getElementById('single-os')?.value || '';
    let osFazendaNome = '';
    if (osKeyForFazenda && this.osListCache && Array.isArray(this.osListCache)) {
        const osFromCache = this.osListCache.find(o => String(o.numero).trim() === String(osKeyForFazenda).trim());
        if (osFromCache && osFromCache.fazenda) {
            osFazendaNome = osFromCache.fazenda;
        }
    }

    let fazendaNome = osFazendaNome || document.getElementById('single-fazenda')?.value || '';
    const matchCod = fazendaNome.match(/^(\d+)\s*[-–]\s*(.+)$/);
    let codExtraido = null;
    if (matchCod) {
        codExtraido = parseInt(matchCod[1]);
        fazendaNome = matchCod[2].trim();
    }

    const frenteKey = document.getElementById('single-frente')?.value || '';
    if (!data || !frenteKey) { 
        console.warn('Validação falhou: data ou frente vazios', { data, frenteKey });
        this.ui.showNotification('Informe data e frente', 'warning'); 
        return; 
    }
    
    const codInput = document.getElementById('single-cod')?.value;
    const codFinal = codInput ? parseInt(codInput) : (codExtraido || undefined);

    const frente = {
        frente: frenteKey,
        fazenda: fazendaNome,
        cod: codFinal,
        regiao: document.getElementById('single-regiao')?.value || '',
        area: parseVal('single-area'),
        plantada: parseVal('single-plantada'),
        areaTotal: parseVal('single-area-total'),
        areaAcumulada: parseVal('single-area-acumulada'),
        plantioDiario: parseVal('single-plantio-dia')
    };
    
    // Capturar tipo de operação e colheita
    // const tipoOperacao = document.getElementById('tipo-operacao')?.value || 'plantio';
    // Se for colheita_muda, pegar do input específico, senão 0
    const colheitaHa = parseVal('colheita-hectares');
    const colheitaTchEst = parseVal('colheita-tch-estimado');
    const colheitaTchReal = parseVal('colheita-tch-real');
    const colheitaTonTotais = parseVal('colheita-toneladas-totais');

    const payload = {
        data, responsavel, observacoes,
        hora: horaRegistro,
        // Campos movidos para o root (requer atualização no banco de dados)
        tipo_operacao: this.isQualidadeMode ? 'qualidade_muda' : tipoOperacao,
        colheita_hectares: colheitaHa,
        colheita_tch_estimado: colheitaTchEst,
        colheita_tch_real: colheitaTchReal,
        colheita_toneladas_totais: colheitaTonTotais,
        frentes: [frente],
        insumos: this.plantioInsumosDraft.slice(),
        qualidade
    };

    // Remove auto-generated quality for Normal Colheita to prevent "ghost" quality records
    if (!this.isQualidadeMode && tipoOperacao === 'colheita_muda') {
        const linkedId = document.getElementById('selected-qualidade-id')?.value;
        if (linkedId) {
             // Keep minimal link if user explicitly selected a quality
             payload.qualidade = { 
                 qualitySourceId: linkedId, 
                 tipoOperacao: 'colheita_muda'
             };
        } else {
             // No quality record generated
             payload.qualidade = null;
        }
    }
    
    // Auto-Aggregation Logic for Quality Mode
    if (this.isQualidadeMode && !this.currentPlantioId) {
        try {
            const found = await this.api.findPlantioByDataFrente(data, frenteKey);
            if (found && found.success && found.data) {
                const rec = found.data;
                console.log('Registro existente encontrado para agregação:', rec);
                this.currentPlantioId = rec.id;
                
                // Preserve existing data that shouldn't be overwritten by Quality form
                // Only overwrite if we actually have drafts (which we shouldn't in quality mode)
                if ((!this.plantioInsumosDraft || this.plantioInsumosDraft.length === 0) && rec.insumos) {
                    payload.insumos = rec.insumos;
                }
                
                // Merge observations
                if (rec.observacoes && payload.observacoes && !rec.observacoes.includes(payload.observacoes)) {
                    payload.observacoes = rec.observacoes + ' | ' + payload.observacoes;
                } else if (rec.observacoes) {
                    payload.observacoes = rec.observacoes;
                }
                
                this.ui.showNotification('Agregando dados de qualidade ao registro existente.', 'info');
            }
        } catch (e) {
            console.error('Erro ao buscar registro existente:', e);
        }
    }
    
    try {
        let res;
        if (this.currentPlantioId) {
            console.log('Atualizando registro:', this.currentPlantioId);
            res = await this.api.updatePlantioDia(this.currentPlantioId, payload);
        } else {
            console.log('Criando novo registro');
            if (navigator.onLine) {
                res = await this.api.addPlantioDia(payload);
            } else {
                await this.saveOfflinePlantio(payload);
                res = { success: true, offline: true };
            }
        }

        if (res && res.success) {
            this.ui.showNotification(this.currentPlantioId ? 'Registro atualizado' : 'Dia de plantio registrado', 'success', 1500);
            
            if (frente.cod && tipoOperacao !== 'colheita_muda') {
                try {
                    // Fetch current farm data to ensure accurate base values
                    const fazendaRes = await this.api.getFazendaByCodigo(frente.cod);
                    if (fazendaRes && fazendaRes.success && fazendaRes.data) {
                        const currentFazenda = fazendaRes.data;
                        
                        // Calculate deltas
                        const newPlantioDia = frente.plantioDiario || 0;
                        const oldPlantioDia = this.currentPlantioId ? (this.originalPlantioValue || 0) : 0;
                        const deltaPlantio = newPlantioDia - oldPlantioDia;

                        const updates = {};
                        
                        // Check if accumulated values were manually edited
                        // If manually edited, we use the value directly instead of calculating delta
                        const manualPlantioAcum = document.getElementById('single-area-acumulada');
                        const manualMudaAcum = document.getElementById('muda-consumo-acumulado');
                        const manualCobricaoAcum = document.getElementById('cobricao-acumulada');

                        if (manualPlantioAcum && manualPlantioAcum.value !== "" && !manualPlantioAcum.readOnly) {
                             updates.plantioAcumulado = parseFloat(manualPlantioAcum.value);
                        } else {
                             updates.plantioAcumulado = (currentFazenda.plantio_acumulado || 0) + deltaPlantio;
                        }

                        if (qualidade) {
                             const newMudaDia = qualidade.mudaConsumoDia || 0;
                             const oldMudaDia = this.currentPlantioId ? (this.originalMudaValue || 0) : 0;
                             const deltaMuda = newMudaDia - oldMudaDia;

                             const newCobricaoDia = qualidade.cobricaoDia || 0;
                             const oldCobricaoDia = this.currentPlantioId ? (this.originalCobricaoValue || 0) : 0;
                             const deltaCobricao = newCobricaoDia - oldCobricaoDia;

                             if (manualMudaAcum && manualMudaAcum.value !== "" && !manualMudaAcum.readOnly) {
                                 updates.mudaAcumulada = parseFloat(manualMudaAcum.value);
                             } else {
                                 updates.mudaAcumulada = (currentFazenda.muda_acumulada || 0) + deltaMuda;
                             }
                             
                             if (manualCobricaoAcum && manualCobricaoAcum.value !== "" && !manualCobricaoAcum.readOnly) {
                                 updates.cobricaoAcumulada = parseFloat(manualCobricaoAcum.value);
                             } else {
                                 updates.cobricaoAcumulada = (currentFazenda.cobricao_acumulada || 0) + deltaCobricao;
                             }
                        }
                        
                        // Prevent negative values
                        updates.plantioAcumulado = Math.max(0, updates.plantioAcumulado);
                        if (updates.mudaAcumulada !== undefined) updates.mudaAcumulada = Math.max(0, updates.mudaAcumulada);
                        if (updates.cobricaoAcumulada !== undefined) updates.cobricaoAcumulada = Math.max(0, updates.cobricaoAcumulada);

                        await this.api.updateFazenda(frente.cod, updates);
                    } else {
                         // Fallback: use frontend calculated values if fetch fails
                         const updates = {
                            plantioAcumulado: frente.areaAcumulada
                         };
                         if (qualidade) {
                             updates.mudaAcumulada = qualidade.mudaConsumoAcumulado;
                             updates.cobricaoAcumulada = qualidade.cobricaoAcumulada;
                         }
                         await this.api.updateFazenda(frente.cod, updates);
                    }
                    // Atualiza cache de fazendas
                    const cadResp = await this.api.getFazendas();
                    if (cadResp && cadResp.success && Array.isArray(cadResp.data)) {
                        this.renderCadastroFazendas(cadResp.data);
                    }
                } catch(e) { 
                    console.error('Erro ao atualizar fazenda:', e);
                    this.ui.showNotification('Aviso: Erro ao atualizar totais da fazenda', 'warning');
                }
            }
            
            // Salvar insumos na tabela insumos_fazendas para o dashboard
            // [ATUALIZAÇÃO] Desabilitado para evitar duplicidade, já que o dashboard deve ler de plantio_diario
            /*
            if (this.plantioInsumosDraft && this.plantioInsumosDraft.length > 0) {
                console.log('Salvando insumos para dashboard...');
                const areaDia = frente.plantioDiario || frente.plantada || 0;
                const promises = this.plantioInsumosDraft.map(insumo => {
                    const dose = parseFloat(insumo.doseRealizada || 0);
                    const qtd = dose * areaDia;
                    return this.api.addInsumoFazenda({
                        fazenda: frente.fazenda,
                        produto: insumo.produto,
                        inicio: data,
                        quantidadeAplicada: qtd,
                        doseAplicada: dose,
                        areaTotalAplicada: areaDia,
                        talhao: frente.frente // ou frente.cod
                    }).catch(err => console.error('Erro ao salvar insumo individual:', err));
                });
                await Promise.all(promises);
            }
            */

            this.resetPlantioForm();
            await this.loadPlantioDia();
            
            // Force reset throttle to ensure dashboard updates
            this._lastDashboardLoad = 0;

            // Atualizar estoque consumido (redução baseada no consumo do plantio)
            if (frente.frente) {
                try {
                    console.log('Atualizando estoque para frente:', frente.frente);
                    await this.updateEstoqueFromOS(frente.frente);
                } catch (e) {
                    console.error('Erro ao atualizar estoque após salvar plantio:', e);
                }
            }

            // Atualizar dashboard para refletir novos dados
            this.loadDashboard();
            
            if (!createAnother) {
                const modal = document.getElementById('novo-lancamento-modal');
                if (modal) modal.style.display = 'none';
            } else {
                this.ui.showNotification('Registro salvo! Pronto para o próximo.', 'success', 2000);
            }
        } else {
            console.error('Erro na resposta da API:', res);
            this.ui.showNotification('Erro ao registrar', 'error');
        }
    } catch(e) { 
        console.error('Exceção ao salvar plantio:', e);
        if (e.response && e.response.data) {
            console.error('Detalhes do erro API:', e.response.data);
            this.ui.showNotification(`Erro API: ${e.response.data.message || JSON.stringify(e.response.data)}`, 'error', 5000);
        } else {
            this.ui.showNotification(`Erro ao salvar: ${e.message || 'Verifique os dados'}`, 'error');
        }

        // Fallback offline
        try {
            await this.saveOfflinePlantio(payload);
            this.ui.showNotification('Sem conexão. Registro salvo offline e será sincronizado.', 'info');
        } catch (err) {
            this.ui.showNotification('Erro ao registrar', 'error'); 
        }
    }
};

// Offline storage via IndexedDB
InsumosApp.prototype.saveOfflinePlantio = async function(payload) {
    const dbName = 'insumos_offline';
    const store = 'qualidade_muda';
    const openDB = () => new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(store)) {
                db.createObjectStore(store, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    const db = await openDB();
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    const record = { id: `offline_${Date.now()}`, payload, status: 'pending' };
    os.put(record);
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
};

// Sync when online
window.addEventListener('online', async () => {
    try {
        const dbName = 'insumos_offline';
        const store = 'qualidade_muda';
        const openDB = () => new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName, 1);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        const db = await openDB();
        const tx = db.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        const getAllReq = os.getAll();
        getAllReq.onsuccess = async () => {
            const items = getAllReq.result || [];
            for (const it of items) {
                if (it.status === 'pending') {
                    try {
                        const api = window.insumosApp?.api || null;
                        if (api && typeof api.addPlantioDia === 'function') {
                            const res = await api.addPlantioDia(it.payload);
                            if (res && res.success) {
                                it.status = 'synced';
                                os.put(it);
                            }
                        }
                    } catch(e) { /* ignore and retry later */ }
                }
            }
        };
    } catch(e) { /* ignore */ }
});


InsumosApp.prototype.autofillPlantioByFazenda = function() {
    const fazendaEl = document.getElementById('plantio-fazenda');
    const codEl = document.getElementById('plantio-cod');
    const info = fazendaEl ? this.fazendaIndex.byName[fazendaEl.value] : null;
    if (info && codEl) codEl.value = info.cod ?? '';
};

InsumosApp.prototype.autofillPlantioByCod = function() {
    const codEl = document.getElementById('plantio-cod');
    const fazendaEl = document.getElementById('plantio-fazenda');
    const info = codEl ? this.fazendaIndex.byCod[parseInt(codEl.value)] : null;
    if (info && fazendaEl) fazendaEl.value = info.fazenda ?? '';
};
InsumosApp.prototype.autofillRowByFazenda = function(fazId, codId) {
    const fEl = document.getElementById(fazId);
    const cEl = document.getElementById(codId);
    if (!fEl || !cEl || !this.fazendaIndex) return;
    const nome = fEl.value || '';
    let info = nome && this.fazendaIndex.byName ? this.fazendaIndex.byName[nome] : null;
    if (!info && this.fazendaIndex.cadastroByCod) {
        const match = Object.entries(this.fazendaIndex.cadastroByCod).find(([, v]) => (v.nome || '').toLowerCase() === nome.toLowerCase());
        if (match) {
            const cod = parseInt(match[0]);
            const data = match[1];
            info = { cod, ...data };
        }
    }
    if (info && info.cod != null) {
        cEl.value = String(info.cod);
        this.autofillCadastroFields(info.cod);
    } else {
        cEl.value = '';
    }
};
InsumosApp.prototype.autofillRowByCod = function(fazId, codId) {
    const fEl = document.getElementById(fazId);
    const cEl = document.getElementById(codId);
    if (!fEl || !cEl || !this.fazendaIndex) return;
    const raw = cEl.value;
    const code = raw ? parseInt(raw) : null;
    if (!code) {
        fEl.value = '';
        return;
    }
    let info = this.fazendaIndex.byCod && this.fazendaIndex.byCod[code] ? this.fazendaIndex.byCod[code] : null;
    if (!info && this.fazendaIndex.cadastroByCod) {
        const cad = this.fazendaIndex.cadastroByCod[code];
        if (cad) info = { fazenda: cad.nome, ...cad };
    }
    if (info) {
        fEl.value = info.fazenda || info.nome || '';
        this.autofillCadastroFields(code);
    }
};

InsumosApp.prototype.autofillCadastroFields = function(code) {
    if (!code || !this.fazendaIndex || !this.fazendaIndex.cadastroByCod) return;
    const info = this.fazendaIndex.cadastroByCod[code];
    if (!info) return;

    this.tempFazendaStats = {
        plantioAcumulado: info.plantioAcumulado || 0,
        mudaAcumulada: info.mudaAcumulada || 0,
        cobricaoAcumulada: info.cobricaoAcumulada || 0
    };

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    if (info.nome) setVal('single-fazenda', info.nome);
    setVal('single-regiao', info.regiao || '');
    setVal('single-area-total', String(info.areaTotal || 0));
    setVal('single-area-acumulada', String(info.plantioAcumulado || 0));
    setVal('cobricao-acumulada', String(info.cobricaoAcumulada || 0));
    
    const mudaAccumEl = document.getElementById('muda-consumo-acumulado');
    if (mudaAccumEl) mudaAccumEl.value = String(info.mudaAcumulada || 0);

    this.updateAccumulatedStats();
};

InsumosApp.prototype.savePlantioFrente = async function(frenteKey) {
    const data = document.getElementById('plantio-data')?.value;
    const responsavel = document.getElementById('plantio-responsavel')?.value;
    const observacoes = document.getElementById('plantio-obs')?.value || '';
    if (!data) { this.ui.showNotification('Informe a data', 'warning'); return; }
    const map = {
        '4001': { fazenda: 'fr-4001-fazenda', cod: 'fr-4001-cod', area: 'fr-4001-area', plantada: 'fr-4001-plantada' },
        '4002': { fazenda: 'fr-4002-fazenda', cod: 'fr-4002-cod', area: 'fr-4002-area', plantada: 'fr-4002-plantada' },
        '4009 Abençoada': { fazenda: 'fr-4009-fazenda', cod: 'fr-4009-cod', area: 'fr-4009-area', plantada: 'fr-4009-plantada' }
    }[frenteKey];
    if (!map) return;
    const frente = {
        frente: frenteKey,
        fazenda: document.getElementById(map.fazenda)?.value || '',
        cod: document.getElementById(map.cod)?.value ? parseInt(document.getElementById(map.cod)?.value) : undefined,
        area: parseFloat(document.getElementById(map.area)?.value || '0'),
        plantada: parseFloat(document.getElementById(map.plantada)?.value || '0')
    };
    if (!frente.fazenda && !frente.cod) { this.ui.showNotification('Informe a fazenda ou código da frente', 'warning'); return; }
    const payload = { data, responsavel, observacoes, frentes: [frente], insumos: this.plantioInsumosDraft.slice(), qualidade };
    try {
        const res = await this.api.addPlantioDia(payload);
        if (res && res.success) {
            this.ui.showNotification(`Frente ${frenteKey} registrada`, 'success', 1500);
            this.clearFrenteRow(frenteKey);
            this.updateFixedFrentesTotals();
            await this.loadPlantioDia();
        } else {
            this.ui.showNotification('Erro ao registrar', 'error');
        }
    } catch(e) { this.ui.showNotification('Erro ao registrar', 'error'); }
};

InsumosApp.prototype.clearFrenteRow = function(frenteKey) {
    const ids = frenteKey === '4001' ? ['fr-4001-fazenda','fr-4001-cod','fr-4001-area','fr-4001-plantada']
        : frenteKey === '4002' ? ['fr-4002-fazenda','fr-4002-cod','fr-4002-area','fr-4002-plantada']
        : ['fr-4009-fazenda','fr-4009-cod','fr-4009-area','fr-4009-plantada'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
};

 

InsumosApp.prototype.handleLogin = async function() {
    const u = document.getElementById('login-user')?.value || '';
    const p = document.getElementById('login-pass')?.value || '';
    if (!u || !p) { this.ui.showNotification('Informe usuário e senha', 'warning'); return; }
    try {
        const res = await this.api.login(u, p);
        if (res && res.success) { 
            this.ui.showNotification('Login efetuado', 'success', 1500);
            
            // Verificar se tem nome e matrícula
            const meta = this.api.user.user_metadata || {};
            if (!meta.nome || !meta.matricula) {
                // Mostrar tela de atualização cadastral
                this.hideLoginScreen();
                const updateScreen = document.getElementById('update-profile-screen');
                if (updateScreen) updateScreen.style.display = 'flex';
            } else {
                this.hideLoginScreen(); 
                this.updateCurrentUserUI(); 
                await this.loadInitialData(); 
            }
        }
        else this.ui.showNotification('Credenciais inválidas', 'error');
    } catch(e) { this.ui.showNotification('Erro de login', 'error'); }
};

InsumosApp.prototype.handleRegister = async function() {
    const u = document.getElementById('register-user')?.value || '';
    const p = document.getElementById('register-pass')?.value || '';
    const email = document.getElementById('register-email')?.value || '';
    const firstName = document.getElementById('register-firstname')?.value || '';
    const lastName = document.getElementById('register-lastname')?.value || '';

    if (!u || !p || !email) { this.ui.showNotification('Preencha Usuário, Email e Senha', 'warning'); return; }
    
    try {
        const res = await this.api.register({ username: u, password: p, email, firstName, lastName });
        if (res && res.success) {
            this.ui.showNotification(res.message || 'Conta criada! Verifique seu email para confirmar.', 'success', 5000);
            this.showLoginScreen();
            
            // Clear inputs
            const inputs = ['register-user', 'register-pass', 'register-email', 'register-firstname', 'register-lastname'];
            inputs.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
        } else {
            this.ui.showNotification('Erro ao criar conta: ' + (res.message||''), 'error');
        }
    } catch(e) { 
        console.error(e);
        this.ui.showNotification('Erro ao criar conta', 'error'); 
    }
};

InsumosApp.prototype.handleUpdateProfile = async function() {
    const nome = document.getElementById('update-name')?.value || '';
    const matricula = document.getElementById('update-matricula')?.value || '';

    if (!nome || !matricula) { this.ui.showNotification('Preencha nome e matrícula', 'warning'); return; }

    try {
        const res = await this.api.updateProfile({ nome, matricula });
        if (res && res.success) {
            this.ui.showNotification('Cadastro atualizado!', 'success', 1500);
            const updateScreen = document.getElementById('update-profile-screen');
            if (updateScreen) updateScreen.style.display = 'none';
            this.updateCurrentUserUI();
            await this.loadInitialData();
        } else {
            this.ui.showNotification('Erro ao atualizar: ' + (res.message||''), 'error');
        }
    } catch(e) { this.ui.showNotification('Erro ao atualizar cadastro', 'error'); }
};

InsumosApp.prototype.handleLogout = async function() {
    try { await this.api.logout(); } catch(e) {}
    this.showLoginScreen();
    this.ui.showNotification('Sessão encerrada', 'success', 1000);
    this.updateCurrentUserUI();
};

InsumosApp.prototype.setupAdminPanel = function() {
    const btn = document.getElementById('admin-panel-btn');
    const modal = document.getElementById('admin-modal');
    const closeBtn = document.querySelector('.close-admin-modal');

    if (btn) {
        btn.addEventListener('click', () => {
            if (modal) {
                modal.style.display = 'flex';
                this.loadAdminUsers();
            }
        });
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    if (modal) {
        // Tab switching
        const tabs = modal.querySelectorAll('.admin-tabs .tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const target = tab.getAttribute('data-tab');
                modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                const targetContent = document.getElementById(target);
                if (targetContent) targetContent.classList.add('active');
                
                if (target === 'admin-users') this.loadAdminUsers();
                if (target === 'admin-logs') this.loadAuditLogs();
                if (target === 'admin-system') this.loadSystemSettings();
            });
        });

        // Force Update Button
        const forceUpdateBtn = document.getElementById('admin-force-update-btn');
        if (forceUpdateBtn) {
            const newBtn = forceUpdateBtn.cloneNode(true);
            forceUpdateBtn.parentNode.replaceChild(newBtn, forceUpdateBtn);
            
            newBtn.addEventListener('click', async () => {
                if (confirm('Tem certeza que deseja forçar uma atualização para TODOS os usuários? Isso recarregará a página deles.')) {
                    try {
                        const now = new Date().toISOString();
                        await this.api.updateSystemSettings('force_update_timestamp', now);
                        alert('Atualização forçada enviada com sucesso!');
                        this.loadSystemSettings();
                    } catch (error) {
                        console.error('Erro ao forçar atualização:', error);
                        alert('Erro ao forçar atualização: ' + error.message);
                    }
                }
            });
        }
    }

    // Permissions Modal Handlers
    const permModal = document.getElementById('permissions-modal');
    const closePerms = document.querySelectorAll('.close-permissions-modal');
    closePerms.forEach(btn => btn.addEventListener('click', () => {
        if (permModal) permModal.style.display = 'none';
        this.currentEditingUserId = null;
        document.body.style.overflow = document.body.dataset.lockScrollPrev || '';
        delete document.body.dataset.lockScrollPrev;
    }));

    const permForm = document.getElementById('permissions-form');
    if (permForm) {
        permForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.savePermissions();
        });
    }
};

InsumosApp.prototype.loadSystemSettings = async function() {
    const infoEl = document.getElementById('admin-last-update-info');
    
    if (infoEl) infoEl.textContent = 'Carregando...';
    
    try {
        const { success, data } = await this.api.getSystemSettings('force_update_timestamp');
        
        if (success && data && data.value) {
            const date = new Date(data.value);
            if (infoEl) infoEl.textContent = `Última atualização forçada: ${date.toLocaleString('pt-BR')}`;
        } else {
            if (infoEl) infoEl.textContent = 'Nenhuma atualização forçada registrada.';
        }
    } catch (error) {
        console.error('Erro ao carregar configurações:', error);
        if (infoEl) infoEl.textContent = 'Erro ao carregar informações.';
    }
};

InsumosApp.prototype.setupVersionCheck = async function() {
    console.log('Versão do Frontend: FIX-56-REMOVE-ARROWS');
    let lastKnownUpdate = null;
    
    const checkUpdate = async () => {
        if (!this.api) return;
        try {
            const { success, data } = await this.api.getSystemSettings('force_update_timestamp');
            if (success && data && data.value) {
                const serverUpdate = new Date(data.value).getTime();
                
                if (lastKnownUpdate === null) {
                    lastKnownUpdate = serverUpdate;
                } else if (serverUpdate > lastKnownUpdate) {
                    console.log('Nova versão detectada. Atualizando...');
                    alert('Uma nova versão do sistema está disponível. A página será recarregada.');
                    window.location.reload();
                }
            }
        } catch (error) {
            console.warn('Falha ao verificar atualizações:', error);
        }
    };
    
    setTimeout(checkUpdate, 2000);
    setInterval(checkUpdate, 60000);
};

InsumosApp.prototype.loadAuditLogs = async function() {
    const tbody = document.getElementById('admin-logs-list');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="loading">Carregando histórico...</td></tr>';

    try {
        const res = await this.api.getAuditLogs();
        if (res && res.success) {
            const logs = res.data || [];
            if (logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4">Nenhum registro encontrado.</td></tr>';
                return;
            }
            tbody.innerHTML = logs.map(log => `
                <tr>
                    <td>${new Date(log.created_at).toLocaleString('pt-BR')}</td>
                    <td>${log.users ? (log.users.username || log.users.email) : 'Desconhecido'}</td>
                    <td>${log.action}</td>
                    <td style="font-size: 0.8em; color: #666;">${JSON.stringify(log.details || {}).substring(0, 50)}...</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="error">Erro ao carregar logs.</td></tr>';
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" class="error">Erro de conexão.</td></tr>';
    }
};

InsumosApp.prototype.handleEditPermissions = function(userId, username, permsStr) {
    const modal = document.getElementById('permissions-modal');
    if (!modal) return;
    
    this.currentEditingUserId = userId;
    const nameEl = document.getElementById('permissions-user-name');
    if (nameEl) {
        let safeName = '';
        try { safeName = decodeURIComponent(username); } catch (e) { safeName = username; }
        nameEl.textContent = `Usuário: ${safeName}`;
    }
    
    let perms = {};
    try {
        perms = JSON.parse(decodeURIComponent(permsStr));
    } catch (e) {
        perms = {};
    }

    const form = document.getElementById('permissions-form');
    if (!form) return;
    
    form.reset();

    const checkboxes = form.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (perms[cb.value]) {
            cb.checked = true;
        }
    });

    if (!modal.dataset.appended) {
        document.body.appendChild(modal);
        modal.dataset.appended = '1';
    }
    modal.style.display = 'flex';
    document.body.dataset.lockScrollPrev = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
};

InsumosApp.prototype.savePermissions = async function() {
    if (!this.currentEditingUserId) return;
    
    const form = document.getElementById('permissions-form');
    const checkboxes = form.querySelectorAll('input[type="checkbox"]');
    
    const newPerms = {};
    checkboxes.forEach(cb => {
        if (cb.checked) {
            newPerms[cb.value] = true;
        }
    });
    
    try {
        const res = await this.api.updateUser(this.currentEditingUserId, { permissions: newPerms });
        if (res && res.success) {
            this.ui.showNotification('Permissões salvas!', 'success');
            document.getElementById('permissions-modal').style.display = 'none';
            document.body.style.overflow = document.body.dataset.lockScrollPrev || '';
            delete document.body.dataset.lockScrollPrev;
            await this.loadAdminUsers(); // Wait for reload
        } else {
            this.ui.showNotification(res.message || 'Erro ao salvar permissões', 'error');
        }
    } catch (e) {
        console.error(e);
        this.ui.showNotification('Erro de conexão', 'error');
    }
};

InsumosApp.prototype.loadAdminUsers = async function() {
    const tbody = document.getElementById('admin-users-list');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Carregando...</td></tr>';

    try {
        const res = await this.api.getUsers();
        if (res && res.success) {
            const users = res.data || [];
            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5">Nenhum usuário encontrado.</td></tr>';
                return;
            }
            
            tbody.innerHTML = '';
            users.forEach(u => {
                const tr = document.createElement('tr');
                const isMe = this.api.user && this.api.user.id === u.id;
                
                tr.innerHTML = `
                    <td>${u.username}</td>
                    <td>${u.email || '-'}</td>
                    <td>${u.first_name || ''} ${u.last_name || ''}</td>
                    <td>
                        <select onchange="window.insumosApp.handleUpdateRole('${u.id}', this.value)" ${isMe ? 'disabled' : ''}>
                            <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                            <option value="readonly" ${u.role === 'readonly' ? 'selected' : ''}>Read-Only</option>
                        </select>
                    </td>
                    <td>
                        <button class="btn btn-secondary" onclick="window.insumosApp.handleEditPermissions('${u.id}', '${encodeURIComponent(u.username || '')}', '${encodeURIComponent(JSON.stringify(u.permissions || {}))}')" style="padding: 5px 10px; font-size: 0.8em; margin-right: 5px;">🔑 Permissões</button>
                        <button class="btn btn-delete-fazenda" onclick="window.insumosApp.handleDeleteUser('${u.id}')" ${isMe ? 'disabled' : ''} style="padding: 5px 10px; font-size: 0.8em;">Excluir</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="error">Erro ao carregar usuários.</td></tr>';
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" class="error">Erro de conexão.</td></tr>';
    }
};

InsumosApp.prototype.handleUpdateRole = async function(id, role) {
    try {
        const res = await this.api.updateUser(id, { role });
        if (res && res.success) {
            this.ui.showNotification('Role atualizado!', 'success');
            await this.loadAdminUsers();
        } else {
            this.ui.showNotification(res.message || 'Erro ao atualizar permissão.', 'error');
            await this.loadAdminUsers(); // Revert changes in UI
        }
    } catch (e) {
        this.ui.showNotification('Erro de conexão.', 'error');
        await this.loadAdminUsers();
    }
};

InsumosApp.prototype.handleDeleteUser = async function(id) {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
    
    try {
        const res = await this.api.deleteUser(id);
        if (res && res.success) {
            this.ui.showNotification('Usuário excluído!', 'success');
            this.loadAdminUsers();
        } else {
            this.ui.showNotification('Erro ao excluir usuário.', 'error');
        }
    } catch (e) {
        this.ui.showNotification('Erro de conexão.', 'error');
    }
};

InsumosApp.prototype.updateLoginStatus = function() {
};
InsumosApp.prototype.updateCurrentUserUI = function() {
    const el = document.getElementById('current-user');
    let u = null;
    if (this.api && this.api.user) {
        // Prioridade: Username (nome de usuário)
        if (this.api.user.user_metadata && this.api.user.user_metadata.username) {
            u = this.api.user.user_metadata.username;
        } else if (this.api.user.username) {
            u = this.api.user.username;
        }
        // Fallback: Nome do funcionário
        else if (this.api.user.user_metadata && this.api.user.user_metadata.nome) {
            u = this.api.user.user_metadata.nome;
        } else if (this.api.user.email) {
            u = this.api.user.email;
        }
    }

    if (el) {
        if (u) { el.style.display = 'inline-block'; el.textContent = `👤 ${u}`; }
        else { el.style.display = 'none'; el.textContent = ''; }
    }

    // Admin Button Logic
    const adminBtn = document.getElementById('admin-panel-btn');
    if (adminBtn) {
        if (this.api && this.api.user && this.api.user.role === 'admin') {
            adminBtn.style.display = 'inline-block';
        } else {
            adminBtn.style.display = 'none';
        }
    }

    // Apply Page Permissions
    const mainTabs = document.querySelectorAll('.tabs:not(.admin-tabs) .tab');
    const userPerms = (this.api && this.api.user && this.api.user.permissions) ? this.api.user.permissions : {};
    const role = (this.api && this.api.user && this.api.user.role) ? this.api.user.role : 'user';

    // Se for admin ou tiver permissão 'all', vê tudo. Caso contrário, filtra.
    const canSeeAll = role === 'admin' || userPerms.all === true;

    let firstVisible = null;
    mainTabs.forEach(t => {
        const key = t.getAttribute('data-tab');
        // Se tem permissão total OU permissão específica
        if (canSeeAll || userPerms[key]) {
            t.style.display = 'inline-block';
            if (!firstVisible) firstVisible = t;
        } else {
            t.style.display = 'none';
        }
    });

    // Se a tab ativa atual ficou invisível, mudar para a primeira visível
    const currentActive = document.querySelector('.tabs:not(.admin-tabs) .tab.active');
    if (currentActive && currentActive.style.display === 'none' && firstVisible) {
        firstVisible.click();
    } else if (!currentActive && firstVisible) {
        firstVisible.click();
    }

    // Apply Sub-tab Permissions (Plantio)
    const plantioSubTabs = document.querySelectorAll('.plantio-tab-btn');
    if (plantioSubTabs.length > 0) {
        let firstVisibleSub = null;
        plantioSubTabs.forEach(t => {
            const key = t.getAttribute('data-tab'); // plantio, colheita_muda, qualidade_muda
            const permKey = 'sub_' + key; 
            
            if (canSeeAll || userPerms[permKey]) {
                t.style.display = 'inline-block';
                if (!firstVisibleSub) firstVisibleSub = t;
            } else {
                t.style.display = 'none';
            }
        });

        // Ensure active sub-tab is visible
        const currentActiveSub = document.querySelector('.plantio-tab-btn.active');
        if (currentActiveSub && currentActiveSub.style.display === 'none' && firstVisibleSub) {
            firstVisibleSub.click();
        } else if (!currentActiveSub && firstVisibleSub) {
            firstVisibleSub.click();
        }
    }

    // Apply Sub-tab Permissions (Viagens Adubo)
    const btnAdubo = document.getElementById('btn-type-adubo');
    const btnComposto = document.getElementById('btn-type-composto');
    
    const permAdubo = canSeeAll || userPerms.sub_viagem_adubo;
    const permComposto = canSeeAll || userPerms.sub_viagem_composto;

    let firstVisibleViagem = null;

    if (btnAdubo) {
        if (permAdubo) {
            btnAdubo.style.display = ''; // Revert to CSS default (flex)
            if (!firstVisibleViagem) firstVisibleViagem = btnAdubo;
        } else {
            btnAdubo.style.display = 'none';
        }
    }

    if (btnComposto) {
        if (permComposto) {
            btnComposto.style.display = ''; // Revert to CSS default (flex)
            if (!firstVisibleViagem) firstVisibleViagem = btnComposto;
        } else {
            btnComposto.style.display = 'none';
        }
    }

    // Ensure active sub-tab is visible
    const currentActiveViagem = document.querySelector('.viagem-type-selector .type-toggle.active');
    if (currentActiveViagem && currentActiveViagem.style.display === 'none' && firstVisibleViagem) {
        firstVisibleViagem.click();
    } else if (!currentActiveViagem && firstVisibleViagem) {
        firstVisibleViagem.click();
    }

    // Apply Button Permissions (Main Panel Action Buttons)
    const btnOS = document.getElementById('btn-os');
    const btnFazendas = document.getElementById('btn-open-fazendas-modal');
    const btnLiberacao = document.getElementById('btn-liberacao-colheita');
    const btnNovoPlantio = document.getElementById('btn-novo-lancamento');
    const btnNovaQualidade = document.getElementById('btn-nova-qualidade-muda');

    const checkBtn = (el, permKey) => {
        if (!el) return;
        if (canSeeAll || userPerms[permKey]) {
            el.style.display = ''; // Default
        } else {
            el.style.display = 'none';
        }
    };

    checkBtn(btnOS, 'btn_os');
    checkBtn(btnFazendas, 'btn_fazendas');
    checkBtn(btnLiberacao, 'btn_liberacao');
    checkBtn(btnNovoPlantio, 'btn_novo_plantio');
    checkBtn(btnNovaQualidade, 'btn_nova_qualidade');
};
InsumosApp.prototype.showLoginScreen = function() {
    const el = document.getElementById('login-screen');
    const appContent = document.getElementById('app-content');
    if (el) el.style.display = 'flex';
    if (appContent) appContent.style.display = 'none';
    
    const registerArea = document.getElementById('register-area');
    const loginGrid = document.querySelector('#login-screen .form-grid.boletim-grid');
    const loginButton = document.getElementById('login-btn');
    const regToggle = document.getElementById('login-register-toggle');
    if (registerArea) registerArea.style.display = 'none';
    if (loginGrid) loginGrid.style.display = 'grid';
    if (loginButton) loginButton.style.display = 'inline-block';
    if (regToggle) regToggle.textContent = 'Cadastrar';
};
InsumosApp.prototype.hideLoginScreen = function() { 
    const el = document.getElementById('login-screen'); 
    if (el) el.style.display = 'none';
    const appContent = document.getElementById('app-content');
    if (appContent) appContent.style.display = 'flex';
};

InsumosApp.prototype.handlePrintReport = async function() {
    this.ui.showNotification('Preparando relatório para impressão...', 'info');

    const container = document.getElementById('report-print-container');
    if (!container) return;

    // Aguardar renderização dos gráficos
    await new Promise(r => setTimeout(r, 500));

    // Capturar KPIs
    const kpiAreaPlantada = document.getElementById('kpi-area-plantada')?.innerText || '0 ha';
    const kpiOsAtivas = document.getElementById('kpi-os-ativas')?.innerText || '0';
    const kpiEficiencia = document.getElementById('kpi-eficiencia')?.innerText || '0%';
    const kpiViagens = document.getElementById('kpi-viagens-total')?.innerText || '0';
    const kpiVolume = document.getElementById('kpi-volume-total')?.innerText || '0 t';
    const kpiInsumos = document.getElementById('kpi-insumos-total')?.innerText || '0 L/kg';

    // Capturar Gráficos como Imagem
    const getChartImg = (id) => {
        const canvas = document.getElementById(id);
        return canvas ? canvas.toDataURL('image/png') : null;
    };

    const chartPlantio = getChartImg('chart-plantio-diario');
    const chartFazenda = getChartImg('chart-fazenda-progresso');
    const chartOs = getChartImg('chart-os-status');
    const chartViagens = getChartImg('chart-viagens-diarias');
    const chartDoseGlobal = getChartImg('chart-dose-global');
    const chartInsumosEvolucao = getChartImg('chart-insumos-evolucao');

    const now = new Date();
    const dataHora = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR');

    // Construir HTML do Relatório
    let html = `
        <div class="report-controls no-print" style="position: sticky; top: 0; background: var(--surface); padding: 10px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; z-index: 1000;">
            <h2 style="margin:0;">Visualização de Impressão</h2>
            <button onclick="document.getElementById('report-print-container').style.display='none'" class="btn btn-secondary" style="background-color: #e74c3c; color: white;">❌ Fechar</button>
        </div>
        <div class="report-content" style="padding: 20px;">
        <div class="report-header">
            <h1>Relatório Geral de Gestão Agrícola</h1>
            <p>Gerado em: ${dataHora} | Usuário: ${this.api.user?.email || 'Sistema'}</p>
        </div>

        <div class="report-section">
            <h3>Indicadores Chave (KPIs)</h3>
            <div class="report-kpis" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                <div class="kpi-box" style="border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
                    <strong>Área Plantada:</strong> <span style="font-size: 1.2em; color: #2E7D32;">${kpiAreaPlantada}</span>
                </div>
                <div class="kpi-box" style="border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
                    <strong>OS Ativas:</strong> <span style="font-size: 1.2em; color: #1976D2;">${kpiOsAtivas}</span>
                </div>
                <div class="kpi-box" style="border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
                    <strong>Eficiência Média:</strong> <span style="font-size: 1.2em; color: #F57C00;">${kpiEficiencia}</span>
                </div>
                <div class="kpi-box" style="border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
                    <strong>Viagens Adubo:</strong> <span style="font-size: 1.2em;">${kpiViagens}</span>
                </div>
                <div class="kpi-box" style="border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
                    <strong>Vol. Transportado:</strong> <span style="font-size: 1.2em;">${kpiVolume}</span>
                </div>
                <div class="kpi-box" style="border: 1px solid #ddd; padding: 10px; border-radius: 5px;">
                    <strong>Insumos Totais:</strong> <span style="font-size: 1.2em;">${kpiInsumos}</span>
                </div>
            </div>
        </div>

        <div class="report-section page-break">
            <h3>Plantio e Progresso</h3>
            <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                ${chartPlantio ? `<div style="flex: 1;"><img src="${chartPlantio}" style="width: 100%; border: 1px solid #eee;"></div>` : ''}
                ${chartFazenda ? `<div style="flex: 1;"><img src="${chartFazenda}" style="width: 100%; border: 1px solid #eee;"></div>` : ''}
            </div>
        </div>

        <div class="report-section">
            <h3>Operacional e Logística</h3>
            <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                ${chartOs ? `<div style="flex: 1;"><img src="${chartOs}" style="width: 100%; border: 1px solid #eee;"></div>` : ''}
                ${chartViagens ? `<div style="flex: 1;"><img src="${chartViagens}" style="width: 100%; border: 1px solid #eee;"></div>` : ''}
            </div>
        </div>

        <div class="report-section page-break">
            <h3>Insumos Agrícolas</h3>
            <div style="display: flex; flex-direction: column; gap: 20px;">
                ${chartDoseGlobal ? `<div><img src="${chartDoseGlobal}" style="width: 100%; max-height: 300px; object-fit: contain; border: 1px solid #eee;"></div>` : ''}
                ${chartInsumosEvolucao ? `<div><img src="${chartInsumosEvolucao}" style="width: 100%; max-height: 300px; object-fit: contain; border: 1px solid #eee;"></div>` : ''}
            </div>
        </div>
        
        <div class="report-footer" style="margin-top: 50px; border-top: 1px solid var(--border); padding-top: 10px; font-size: 0.8em; text-align: center; color: var(--text-light);">
            <p>Sistema de Gestão Agrícola - Relatório Impresso</p>
        </div>
        </div> <!-- Fim .report-content -->
    `;

    container.innerHTML = html;
    container.style.display = 'block'; // Mostrar o container como modal/overlay

    // Pequeno delay para renderização do DOM antes de imprimir
    setTimeout(() => {
        window.print();
    }, 500);
};
