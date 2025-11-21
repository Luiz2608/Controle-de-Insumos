class InsumosApp {
    constructor() {
        this.api = window.apiService;
        this.ui = window.uiManager;
        this.currentFilters = {
            insumos: {}
        };
        this.insumosFazendasData = [];
        this.currentEdit = null;
    }

    async init() {
        try {
            this.ui.showLoading();
            
            await this.setupEventListeners();
            await this.loadStaticData();
            await this.loadInitialData();
            
            this.ui.hideLoading();
            this.ui.showNotification('Sistema carregado com sucesso!', 'success', 2000);
            
        } catch (error) {
            this.ui.hideLoading();
            this.ui.showNotification('Erro ao inicializar o sistema', 'error');
            console.error('Initialization error:', error);
        }
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

    async setupEventListeners() {
        // Navegação por tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.getAttribute('data-tab');
                this.ui.switchTab(tabName);
                this.loadTabData(tabName);
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

        // Botões gerais
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshData();
            });
        }

        const addBtn = document.getElementById('add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.openInsumoModal('add');
            });
        }

        // Botão de IMPORTAR (substitui o export-btn)
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

        document.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.btn-edit');
            const deleteBtn = e.target.closest('.btn-delete');
            if (editBtn) {
                const id = editBtn.getAttribute('data-id');
                this.startEdit(parseInt(id));
            } else if (deleteBtn) {
                const id = deleteBtn.getAttribute('data-id');
                this.deleteInsumo(parseInt(id));
            }
        });
    }

    async loadStaticData() {
        try {
            const fazendasResponse = await this.api.getFazendas();
            if (fazendasResponse.success) {
                this.ui.populateSelect(
                    document.getElementById('fazenda-insumos-filter'),
                    fazendasResponse.data,
                    'Todas as Fazendas'
                );
            }

            // Carregar produtos
            const produtosResponse = await this.api.getProdutos();
            if (produtosResponse.success) {
                this.ui.populateSelect(
                    document.getElementById('produto-filter'),
                    produtosResponse.data,
                    'Todos os Produtos'
                );
            }
        } catch (error) {
            console.error('Error loading static data:', error);
        }
    }

    async loadInitialData() {
        await this.loadInsumosData();
    }

    async loadTabData(tabName) {
        if (tabName === 'insumos-fazendas') {
            await this.loadInsumosData();
        }
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
        const difPercent = (item.dif * 100) || 0;
        const difClass = this.ui.getDifferenceClass(difPercent);
        
        return `
            <td>${item.processo || 'N/A'}</td>
            <td>${item.subprocesso || 'N/A'}</td>
            <td>${item.produto || 'N/A'}</td>
            <td>${item.fazenda || 'N/A'}</td>
            <td>${this.ui.formatNumber(item.areaTalhao)}</td>
            <td>${this.ui.formatNumber(item.areaTotalAplicada)}</td>
            <td>${item.doseRecomendada || '0.15'}</td>
            <td>${this.ui.formatNumber(item.insumDoseAplicada, 7)}</td>
            <td>${this.ui.formatNumber(item.quantidadeAplicada, 6)}</td>
            <td class="${difClass}">${this.ui.formatPercentage(difPercent)}</td>
            <td>${item.frente || 'N/A'}</td>
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
            const tbody = document.querySelector('#insumos-table tbody');
            tbody.innerHTML = '<tr><td colspan="14" class="loading">📡 Carregando dados...</td></tr>';
            
            const response = await this.api.getInsumosFazendas(filters);
            
            if (response.success) {
                this.insumosFazendasData = response.data;
                this.ui.renderTable(tbody, response.data, this.getInsumosRowHTML.bind(this));
                this.updateInsumosDashboard(response.data);
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            const tbody = document.querySelector('#insumos-table tbody');
            tbody.innerHTML = `
                <tr>
                    <td colspan="11" class="loading" style="color: var(--error-color);">
                        ❌ Erro ao carregar dados: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    getInsumosRowHTML(item) {
        const doseAplicada = item.areaTotalAplicada > 0 ? 
            (item.quantidadeAplicada / item.areaTotalAplicada) : 0;
        const difPercent = item.doseRecomendada > 0 ? 
            ((doseAplicada / item.doseRecomendada - 1) * 100) : 0;
        const difClass = this.ui.getDifferenceClass(difPercent);
        const inicio = item.dataInicio ? new Date(item.dataInicio).toLocaleString('pt-BR') : '—';
        const fim = item.dataFim ? new Date(item.dataFim).toLocaleString('pt-BR') : '—';
        
        return `
            <td>${item.os || 'N/A'}</td>
            <td>${item.cod || 'N/A'}</td>
            <td>${item.fazenda || 'N/A'}</td>
            <td>${this.ui.formatNumber(item.areaTalhao)}</td>
            <td>${this.ui.formatNumber(item.areaTotalAplicada)}</td>
            <td>${item.produto || 'N/A'}</td>
            <td>${this.ui.formatNumber(item.doseRecomendada, 3)}</td>
            <td>${this.ui.formatNumber(doseAplicada, 3)}</td>
            <td>${this.ui.formatNumber(item.quantidadeAplicada, 3)}</td>
            <td class="${difClass}">${this.ui.formatPercentage(difPercent)}</td>
            <td>${item.frente || 'N/A'}</td>
            <td>${inicio}</td>
            <td>${fim}</td>
            <td>
                <button class="btn btn-edit" data-id="${item.id}">✏️ Editar</button>
                <button class="btn btn-delete" data-id="${item.id}">🗑️ Excluir</button>
            </td>
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
        const doseAplicada = item.areaTotalAplicada > 0 ? 
            (item.quantidadeAplicada / item.areaTotalAplicada) : 0;
        const difPercent = item.doseRecomendada > 0 ? 
            ((doseAplicada / item.doseRecomendada - 1) * 100) : 0;
        const difClass = this.ui.getDifferenceClass(difPercent);
        
        return `
            <td>${item.cod || 'N/A'}</td>
            <td>${item.fazenda || 'N/A'}</td>
            <td>${this.ui.formatNumber(item.areaTalhao)}</td>
            <td>${this.ui.formatNumber(item.areaTotalAplicada)}</td>
            <td>${item.produto || 'N/A'}</td>
            <td>${this.ui.formatNumber(item.doseRecomendada, 3)}</td>
            <td>${this.ui.formatNumber(doseAplicada, 3)}</td>
            <td>${this.ui.formatNumber(item.quantidadeAplicada, 3)}</td>
            <td class="${difClass}">${this.ui.formatPercentage(difPercent)}</td>
            <td>${item.frente || 'N/A'}</td>
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
        const doseAplicada = item.areaTotalAplicada > 0 ? 
            (item.quantidadeAplicada / item.areaTotalAplicada) : 0;
        const difPercent = item.doseRecomendada > 0 ? 
            ((doseAplicada / item.doseRecomendada - 1) * 100) : 0;
        const difClass = this.ui.getDifferenceClass(difPercent);
        
        return `
            <td>${item.cod || 'N/A'}</td>
            <td>${item.fazenda || 'N/A'}</td>
            <td>${this.ui.formatNumber(item.areaTotal)}</td>
            <td>${this.ui.formatNumber(item.areaTotalAplicada)}</td>
            <td>${item.produto || 'N/A'}</td>
            <td>${this.ui.formatNumber(item.doseRecomendada, 3)}</td>
            <td>${this.ui.formatNumber(doseAplicada, 3)}</td>
            <td>${this.ui.formatNumber(item.quantidadeAplicada, 3)}</td>
            <td class="${difClass}">${this.ui.formatPercentage(difPercent)}</td>
            <td>${item.frente || 'N/A'}</td>
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
        ['fornecedor','produto','fazenda','frente','processo','subprocesso','areaTalhao','areaTotalAplicada','doseRecomendada','quantidadeAplicada','dataInicio','dataFim']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const processoEl = document.getElementById('processo');
        const subprocessoEl = document.getElementById('subprocesso');
        if (processoEl && !processoEl.value) processoEl.value = 'CANA DE ACUCAR';
        if (subprocessoEl && !subprocessoEl.value) subprocessoEl.value = 'PLANTIO';
    }

    fillForm(item) {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
        set('produto', item.produto);
        set('fazenda', item.fazenda);
        set('frente', item.frente);
        set('processo', item.processo);
        set('subprocesso', item.subprocesso);
        set('areaTalhao', item.areaTalhao ?? item.areaTotal);
        set('areaTotalAplicada', item.areaTotalAplicada);
        set('doseRecomendada', item.doseRecomendada);
        set('quantidadeAplicada', item.quantidadeAplicada);
        set('dataInicio', item.dataInicio);
        set('dataFim', item.dataFim);
    }

    getFormData() {
        const get = (id) => document.getElementById(id)?.value;
        const fornecedor = get('fornecedor');
        const payload = {
            fornecedor,
            produto: get('produto'),
            fazenda: get('fazenda'),
            frente: get('frente') ? parseInt(get('frente')) : undefined,
            processo: get('processo'),
            subprocesso: get('subprocesso'),
            areaTalhao: get('areaTalhao') ? parseFloat(get('areaTalhao')) : undefined,
            areaTotalAplicada: get('areaTotalAplicada') ? parseFloat(get('areaTotalAplicada')) : undefined,
            doseRecomendada: get('doseRecomendada') ? parseFloat(get('doseRecomendada')) : undefined,
            quantidadeAplicada: get('quantidadeAplicada') ? parseFloat(get('quantidadeAplicada')) : undefined,
            dataInicio: get('dataInicio') || undefined,
            dataFim: get('dataFim') || undefined
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
            await this.api.request(`/insumos/${id}`, { method: 'DELETE' });
            this.ui.showNotification('Insumo excluído!', 'success', 2000);
            await this.loadTabData(this.getCurrentTab());
        } catch (err) {
            this.ui.showNotification('Erro ao excluir', 'error');
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
}



// Inicializar aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se já existe uma instância para evitar duplicação
    if (!window.insumosApp) {
        window.insumosApp = new InsumosApp();
        window.insumosApp.init();
    }
});

InsumosApp.prototype.updateInsumosDashboard = function(data) {
    const totalRegistros = data.length;
    const totalAreaTalhao = data.reduce((s, i) => s + (i.areaTalhao || 0), 0);
    const totalAreaAplicada = data.reduce((s, i) => s + (i.areaTotalAplicada || 0), 0);
    const totalQuantidade = data.reduce((s, i) => s + (i.quantidadeAplicada || 0), 0);
    const produtos = new Set(data.map(i => i.produto).filter(Boolean));
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('dash-total-registros', String(totalRegistros));
    setText('dash-area-talhao', this.ui.formatNumber(totalAreaTalhao) + ' ha');
    setText('dash-area-aplicada', this.ui.formatNumber(totalAreaAplicada) + ' ha');
    setText('dash-quantidade', this.ui.formatNumber(totalQuantidade, 3));
    setText('dash-produtos-distintos', String(produtos.size));
};