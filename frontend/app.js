class InsumosApp {
    constructor() {
        this.api = window.apiService;
        this.ui = window.uiManager;
        this.currentFilters = {
            oxifertil: {},
            insumos: {}
        };
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

        // Filtros OXIFERTIL
        const applyFiltersBtn = document.getElementById('apply-filters');
        const resetFiltersBtn = document.getElementById('reset-filters');
        
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => {
                this.applyOxifertilFilters();
            });
        }
        
        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => {
                this.resetOxifertilFilters();
            });
        }

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
        ['fazenda-filter', 'frente-filter'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', () => {
                    this.applyOxifertilFilters();
                });
            }
        });
    }

    async loadStaticData() {
        try {
            // Carregar fazendas
            const fazendasResponse = await this.api.getFazendas();
            if (fazendasResponse.success) {
                this.ui.populateSelect(
                    document.getElementById('fazenda-filter'),
                    fazendasResponse.data,
                    'Todas as Fazendas'
                );
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
        await this.loadOxifertilData();
    }

    async loadTabData(tabName) {
        switch (tabName) {
            case 'oxifertil':
                await this.loadOxifertilData();
                break;
            case 'insumos-fazendas':
                await this.loadInsumosData();
                break;
            case 'santa-irene':
                await this.loadSantaIreneData();
                break;
            case 'daniela':
                await this.loadDanielaData();
                break;
        }
    }

    async loadOxifertilData(filters = {}) {
        try {
            const tbody = document.querySelector('#oxifertil-table tbody');
            tbody.innerHTML = '<tr><td colspan="11" class="loading">📡 Carregando dados...</td></tr>';
            
            const response = await this.api.getOxifertil(filters);
            
            if (response.success) {
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
            tbody.innerHTML = '<tr><td colspan="11" class="loading">📡 Carregando dados...</td></tr>';
            
            const response = await this.api.getInsumosFazendas(filters);
            
            if (response.success) {
                this.ui.renderTable(tbody, response.data, this.getInsumosRowHTML.bind(this));
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
        `;
    }

    async loadDanielaData() {
        try {
            const tbody = document.querySelector('#daniela-table tbody');
            tbody.innerHTML = '<tr><td colspan="10" class="loading">📡 Carregando dados...</td></tr>';
            
            const response = await this.api.getDaniela();
            
            if (response.success) {
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
        `;
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
        return activeTab ? activeTab.getAttribute('data-tab') : 'oxifertil';
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