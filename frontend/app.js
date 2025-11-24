class InsumosApp {
    constructor() {
        this.api = window.apiService;
        this.ui = window.uiManager;
        this.currentFilters = {
            insumos: {}
        };
        this.insumosFazendasData = [];
        this.currentEdit = null;
        this.estoqueFilters = { frente: 'all', produto: '' };
        this.chartOrder = 'az';
    }

    async init() {
        try {
            this.ui.showLoading();
            
            this.initTheme();
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

        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const isDark = document.body.classList.toggle('theme-dark');
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
            });
        }
        const estoqueSaveBtn = document.getElementById('estoque-save-btn');
        if (estoqueSaveBtn) {
            estoqueSaveBtn.addEventListener('click', async () => {
                const frente = document.getElementById('estoque-frente')?.value;
                const produto = document.getElementById('estoque-produto')?.value;
                const quantidadeStr = document.getElementById('estoque-quantidade')?.value;
                const quantidade = quantidadeStr ? parseFloat(quantidadeStr) : 0;
                if (!frente || !produto || !quantidade || isNaN(quantidade)) {
                    this.ui.showNotification('Preencha frente, produto e quantidade', 'warning');
                    return;
                }
                try {
                    const res = await this.api.setEstoque(frente, produto, quantidade);
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

        const chartsOrderSelect = document.getElementById('charts-order-select');
        if (chartsOrderSelect) {
            chartsOrderSelect.addEventListener('change', () => {
                this.chartOrder = chartsOrderSelect.value || 'az';
                if (this.insumosFazendasData && this.insumosFazendasData.length) this.updateCharts(this.insumosFazendasData);
            });
        }

        const estoqueFrenteFilter = document.getElementById('estoque-frente-filter');
        const estoqueProdutoFilter = document.getElementById('estoque-produto-filter');
        if (estoqueFrenteFilter) {
            estoqueFrenteFilter.addEventListener('change', async () => {
                this.estoqueFilters.frente = estoqueFrenteFilter.value || 'all';
                await this.loadEstoqueAndRender();
            });
        }
        if (estoqueProdutoFilter) {
            estoqueProdutoFilter.addEventListener('input', async () => {
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

        const fazendaInput = document.getElementById('fazenda');
        if (fazendaInput) {
            fazendaInput.addEventListener('change', () => this.autofillByFazenda());
        }

        document.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.btn-edit');
            const deleteBtn = e.target.closest('.btn-delete');
            const delEstoqueBtn = e.target.closest('.btn-delete-estoque');
            if (editBtn) {
                const id = editBtn.getAttribute('data-id');
                this.startEdit(parseInt(id));
            } else if (deleteBtn) {
                const id = deleteBtn.getAttribute('data-id');
                this.deleteInsumo(parseInt(id));
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
        if (!fazenda) return;
        const existing = this.insumosFazendasData.find(i => i.fazenda === fazenda && (i.os || i.cod));
        if (existing) {
            if (osEl && existing.os != null) osEl.value = existing.os;
            if (codEl && existing.cod != null) codEl.value = existing.cod;
            this.ui.showNotification('Dados existentes encontrados. OS e Código preenchidos automaticamente.', 'info', 2000);
        }
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
        } else if (tabName === 'graficos') {
            if (this.insumosFazendasData && this.insumosFazendasData.length) {
                this.updateCharts(this.insumosFazendasData);
            } else {
                await this.loadInsumosData();
            }
        } else if (tabName === 'estoque') {
            await this.loadEstoqueAndRender();
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
            <td>${item.processo || '—'}</td>
            <td>${item.subprocesso || '—'}</td>
            <td>${item.produto || '—'}</td>
            <td>${item.fazenda || '—'}</td>
            <td>${this.ui.formatNumber(item.areaTalhao || 0)}</td>
            <td>${this.ui.formatNumber(item.areaTotalAplicada || 0)}</td>
            <td>${this.ui.formatNumber(item.doseRecomendada || 0, 3)}</td>
            <td>${this.ui.formatNumber(item.insumDoseAplicada || 0, 7)}</td>
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

    updateInsumosFilters(data) {
        const produtos = Array.from(new Set(data.map(i => i.produto).filter(Boolean))).sort();
        const fazendas = Array.from(new Set(data.map(i => i.fazenda).filter(Boolean))).sort();
        const prodSelect = document.getElementById('produto-filter');
        const fazSelect = document.getElementById('fazenda-insumos-filter');
        if (prodSelect) this.ui.populateSelect(prodSelect, produtos, 'Todos os Produtos');
        if (fazSelect) this.ui.populateSelect(fazSelect, fazendas, 'Todas as Fazendas');
    }

    renderInsumos() {
        const data = [...this.insumosFazendasData];
        const tbody = document.querySelector('#insumos-table tbody');
        if (!tbody) return;
        this.ui.renderTable(tbody, data, this.getInsumosRowHTML.bind(this));
        this.updateCharts(data);
        this.loadEstoqueAndRender();
    }

    getInsumosRowHTML(item) {
        const doseAplicada = (item.doseAplicada != null && item.doseAplicada > 0) ? item.doseAplicada :
            ((item.areaTotalAplicada > 0 && item.quantidadeAplicada != null) ? (item.quantidadeAplicada / item.areaTotalAplicada) : 0);
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
        const doseAplicada = (item.doseAplicada != null && item.doseAplicada > 0) ? item.doseAplicada :
            ((item.areaTotalAplicada > 0 && item.quantidadeAplicada != null) ? (item.quantidadeAplicada / item.areaTotalAplicada) : 0);
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
        const doseAplicada = (item.doseAplicada != null && item.doseAplicada > 0) ? item.doseAplicada :
            ((item.areaTotalAplicada > 0 && item.quantidadeAplicada != null) ? (item.quantidadeAplicada / item.areaTotalAplicada) : 0);
        const difPercent = (item.doseRecomendada > 0 && doseAplicada > 0) ? 
            ((doseAplicada / item.doseRecomendada - 1) * 100) : 0;
        const difClass = this.ui.getDifferenceClass(difPercent);
        
        return `
            <td>${item.cod ?? 0}</td>
            <td>${item.fazenda || '—'}</td>
            <td>${this.ui.formatNumber(item.areaTotal || 0)}</td>
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

InsumosApp.prototype.updateCharts = function(data) {
    try {
        if (!window.Chart) return;
        const byProdutoDose = {};
        const num = v => {
            if (typeof v === 'number') return v;
            if (typeof v === 'string') { const n = parseFloat(v.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; }
            return 0;
        };
        data.forEach(i => {
            const prod = i.produto || '—';
            const doseRec = num(i.doseRecomendada);
            const doseApl = (i.doseAplicada != null && i.doseAplicada > 0) ? num(i.doseAplicada) : ((num(i.areaTotalAplicada)>0 && i.quantidadeAplicada!=null) ? (num(i.quantidadeAplicada)/num(i.areaTotalAplicada)) : 0);
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
        const doseProdCtx = document.getElementById('chart-dose-produtos');
        const doseGlobalCtx = document.getElementById('chart-dose-global');
        const diffProdCtx = document.getElementById('chart-diff-produtos');
        if (!this._charts) this._charts = {};
        const baseOpts = { responsive: true, maintainAspectRatio: true, aspectRatio: 2, plugins: { legend: { display: true, position: 'top' } }, scales: { x: { grid: { display: false } }, y: { grid: { display: false } } } };
        const doseProdData = {
            labels: produtos,
            datasets: [
                { label: 'Dose Recomendada', data: recAvg, backgroundColor: '#4CAF50' },
                { label: 'Dose Aplicada', data: aplAvg, backgroundColor: '#FF9800' }
            ]
        };
        const globalRec = recAvg.reduce((s,v)=>s+v,0)/ (recAvg.filter(v=>v>0).length || 1);
        const globalApl = aplAvg.reduce((s,v)=>s+v,0)/ (aplAvg.filter(v=>v>0).length || 1);
        const doseGlobalData = {
            labels: ['Global'],
            datasets: [
                { label: 'Dose Recomendada', data: [globalRec], backgroundColor: '#4CAF50' },
                { label: 'Dose Aplicada', data: [globalApl], backgroundColor: '#FF9800' }
            ]
        };
        const diffProdData = {
            labels: produtos,
            datasets: [ { label: 'Diferença (%)', data: diffPct, backgroundColor: '#2196F3' } ]
        };
        if (doseProdCtx) {
            if (this._charts.doseProd) { this._charts.doseProd.data = doseProdData; this._charts.doseProd.update(); }
            else this._charts.doseProd = new Chart(doseProdCtx, { type: 'bar', data: doseProdData, options: baseOpts });
        }
        if (doseGlobalCtx) {
            if (this._charts.doseGlobal) { this._charts.doseGlobal.data = doseGlobalData; this._charts.doseGlobal.update(); }
            else this._charts.doseGlobal = new Chart(doseGlobalCtx, { type: 'bar', data: doseGlobalData, options: baseOpts });
        }
        if (diffProdCtx) {
            if (this._charts.diffProd) { this._charts.diffProd.data = diffProdData; this._charts.diffProd.options = { ...baseOpts, indexAxis: 'y' }; this._charts.diffProd.update(); }
            else this._charts.diffProd = new Chart(diffProdCtx, { type: 'bar', data: diffProdData, options: { ...baseOpts, indexAxis: 'y' } });
        }
    } catch(e) {
        console.error('chart error', e);
    }
};

InsumosApp.prototype.loadEstoqueAndRender = async function() {
    try {
        const res = await this.api.getEstoque();
        if (!res || !res.success) return;
        const estoque = res.data || {};
        const ctx = document.getElementById('chart-estoque-frente');
        if (!ctx) return;
        if (!this._charts) this._charts = {};
        let chartData;
        let chartOpts = { responsive: true, maintainAspectRatio: true, aspectRatio: 2, plugins: { legend: { display: true, position: 'top' } } };
        if (this.estoqueFilters.frente === 'all') {
            chartData = { labels: [], datasets: [{ label: 'Selecione uma frente', data: [], backgroundColor: '#9C27B0' }] };
            chartOpts = { ...chartOpts };
        } else {
            const f = this.estoqueFilters.frente;
            const byProd = estoque[f] || {};
            const rows = Object.entries(byProd);
            const filteredRows = this.estoqueFilters.produto ? rows.filter(([prod]) => prod.toLowerCase().includes(this.estoqueFilters.produto.toLowerCase())) : rows;
            const labels = filteredRows.map(([prod]) => prod);
            const values = filteredRows.map(([,v]) => (typeof v==='number'?v:parseFloat(v)||0));
            chartData = { labels, datasets: [{ label: `Estoque - ${f}`, data: values, backgroundColor: '#9C27B0' }] };
            chartOpts = { ...chartOpts, indexAxis: 'y' };
        }
        if (this._charts.estoqueFrente) { this._charts.estoqueFrente.data = chartData; this._charts.estoqueFrente.options = chartOpts; this._charts.estoqueFrente.update(); }
        else this._charts.estoqueFrente = new Chart(ctx, { type: 'bar', data: chartData, options: chartOpts });

        const tbody = document.getElementById('estoque-table-body');
        if (tbody) {
            const rows = [];
            (this.estoqueFilters.frente === 'all' ? ['Frente 1','Frente 2','Frente Abençoada'] : frentes).forEach(f => {
                const byProd = estoque[f] || {};
                Object.keys(byProd).forEach(prod => {
                    if (!this.estoqueFilters.produto || prod.toLowerCase().includes(this.estoqueFilters.produto.toLowerCase())) {
                        rows.push({ frente: f, produto: prod, quantidade: byProd[prod] });
                    }
                });
            });
            rows.sort((a,b)=> a.frente.localeCompare(b.frente) || a.produto.localeCompare(b.produto));
            tbody.innerHTML = rows.map(r => `
                <tr>
                    <td>${r.frente}</td>
                    <td>${r.produto}</td>
                    <td>${this.ui.formatNumber(typeof r.quantidade==='number'?r.quantidade:parseFloat(r.quantidade)||0, 3)}</td>
                    <td><button class="btn btn-delete-estoque" data-frente="${r.frente}" data-produto="${r.produto}">🗑️ Excluir</button></td>
                </tr>
            `).join('');
        }
    } catch(e) {}
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