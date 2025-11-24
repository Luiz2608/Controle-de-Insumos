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
        this.plantioDia = [];
        this.plantioFrentesDraft = [];
        this.plantioInsumosDraft = [];
        this.fazendaIndex = { byName: {}, byCod: {} };
        this.plantioExpanded = new Set();
    }

    async init() {
        try {
            this.ui.showLoading();
            
            this.initTheme();
            await this.setupEventListeners();
            await this.loadStaticData();
            if (this.api.token) {
                this.hideLoginScreen();
                this.updateCurrentUserUI();
                await this.loadInitialData();
            } else {
                this.showLoginScreen();
            }
            
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

        const fazendaInput = document.getElementById('fazenda');
        const codInput = document.getElementById('cod');
        if (fazendaInput) fazendaInput.addEventListener('change', () => this.autofillByFazenda());
        if (codInput) codInput.addEventListener('change', () => this.autofillByCod());

        document.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.btn-edit');
            const deleteBtn = e.target.closest('.btn-delete');
            const delEstoqueBtn = e.target.closest('.btn-delete-estoque');
            const delPlantioBtn = e.target.closest('.btn-delete-plantio');
            const togglePlantioBtn = e.target.closest('.btn-toggle-plantio-details');
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
            } else if (togglePlantioBtn) {
                const id = togglePlantioBtn.getAttribute('data-plantio-id');
                if (this.plantioExpanded.has(id)) this.plantioExpanded.delete(id); else this.plantioExpanded.add(id);
                this.renderPlantioDia();
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

        const insumoAddBtn = document.getElementById('insumo-add-btn');
        if (insumoAddBtn) insumoAddBtn.addEventListener('click', () => this.addInsumoRow());
        const insumoProdutoSel = document.getElementById('insumo-produto');
        if (insumoProdutoSel) insumoProdutoSel.addEventListener('change', () => {
            const prod = insumoProdutoSel.value;
            const unidInput = document.getElementById('insumo-unid');
            const map = this.getInsumoUnits();
            if (unidInput) unidInput.value = map[prod] || '';
        });
        const plantioSaveBtn = document.getElementById('plantio-save-btn');
        if (plantioSaveBtn) plantioSaveBtn.addEventListener('click', async () => { await this.savePlantioDia(); });
        const singleFrente = document.getElementById('single-frente');
        const singleCod = document.getElementById('single-cod');
        const singleFazenda = document.getElementById('single-fazenda');
        if (singleFazenda) singleFazenda.addEventListener('change', () => this.autofillRowByFazenda('single-fazenda', 'single-cod'));
        if (singleCod) singleCod.addEventListener('change', () => this.autofillRowByCod('single-fazenda', 'single-cod'));
        
        const loginBtn = document.getElementById('login-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const regToggle = document.getElementById('login-register-toggle');
        const regBtn = document.getElementById('register-btn');
        if (loginBtn) loginBtn.addEventListener('click', () => this.handleLogin());
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.handleLogout());
        if (regToggle) regToggle.addEventListener('click', () => {
            const area = document.getElementById('register-area');
            if (area) area.style.display = (area.style.display === 'none' || !area.style.display) ? 'block' : 'none';
        });
        if (regBtn) regBtn.addEventListener('click', () => this.handleRegister());
        const plantioFazenda = document.getElementById('plantio-fazenda');
        const plantioCod = document.getElementById('plantio-cod');
        if (plantioFazenda) plantioFazenda.addEventListener('change', () => this.autofillPlantioByFazenda());
        if (plantioCod) plantioCod.addEventListener('change', () => this.autofillPlantioByCod());
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
        const info = this.fazendaIndex.byName[fazenda];
        if (info) {
            if (osEl && info.os != null) osEl.value = info.os;
            if (codEl && info.cod != null) codEl.value = info.cod;
            this.ui.showNotification('Dados da fazenda preenchidos automaticamente.', 'info', 1500);
        }
    }

    autofillByCod() {
        const codEl = document.getElementById('cod');
        const fazendaEl = document.getElementById('fazenda');
        const info = codEl ? this.fazendaIndex.byCod[parseInt(codEl.value)] : null;
        if (info && fazendaEl) {
            fazendaEl.value = info.fazenda;
            this.ui.showNotification('Fazenda preenchida a partir do código.', 'info', 1500);
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
        const info = codEl ? this.fazendaIndex.byCod[parseInt(codEl.value)] : null;
        if (info && fazendaEl) fazendaEl.value = info.fazenda ?? '';
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
        } else if (tabName === 'plantio-dia') {
            await this.loadPlantioDia();
        }
    }

    async loadPlantioDia() {
        try {
            const res = await this.api.getPlantioDia();
            if (res && res.success) {
                this.plantioDia = res.data || [];
                this.renderPlantioDia();
            }
        } catch(e) {}
    }

    renderPlantioDia() {
        const tbody = document.getElementById('plantio-table-body');
        if (!tbody) return;
        const rows = (this.plantioDia || []).slice().sort((a,b)=> String(a.data||'').localeCompare(String(b.data||'')));
        tbody.innerHTML = rows.map(r => {
            const sumArea = (r.frentes||[]).reduce((s,x)=> s + (Number(x.area)||0), 0);
            const sumMuda = (r.frentes||[]).reduce((s,x)=> s + (Number(x.muda)||0), 0);
            const resumoFrentes = (r.frentes||[]).map(f => `${f.frente}: ${f.fazenda||'—'}${f.talhao?(' / '+f.talhao):''}`).join(' | ');
            const expanded = this.plantioExpanded.has(String(r.id));
            const details = expanded ? this.getPlantioDetailsHTML(r) : '';
            const toggleText = expanded ? 'Ocultar detalhes' : 'Ver detalhes';
            return `
            <tr>
                <td>${this.ui.formatDateBR(r.data)}</td>
                <td>${resumoFrentes || '—'}</td>
                <td>${this.ui.formatNumber(sumArea)}</td>
                <td>${this.ui.formatNumber(sumMuda)}</td>
                <td>
                    <button class="btn btn-secondary btn-toggle-plantio-details" data-plantio-id="${r.id}">${toggleText}</button>
                    <button class="btn btn-delete-plantio" data-plantio-id="${r.id}">🗑️</button>
                </td>
            </tr>
            ${details}`;
        }).join('');
    }

    getPlantioDetailsHTML(r) {
        const frentesRows = (r.frentes||[]).map(f => `
            <tr>
                <td>${f.frente||'—'}</td>
                <td>${f.fazenda||'—'}</td>
                <td>${f.cod!=null?f.cod:'—'}</td>
                <td>${f.talhao||'—'}</td>
                <td>${f.variedade||'—'}</td>
                <td>${this.ui.formatNumber(f.area||0)}</td>
                <td>${this.ui.formatNumber(f.plantada||0)}</td>
                <td>${this.ui.formatNumber(f.muda||0)}</td>
            </tr>
        `).join('');
        const insumosRows = (r.insumos||[]).map(i => `
            <tr>
                <td>${i.produto}</td>
                <td>${this.ui.formatNumber(i.dose||0, 6)}</td>
                <td>${i.unid||''}</td>
            </tr>
        `).join('');
        const q = r.qualidade||{};
        return `
        <tr class="plantio-details"><td colspan="5">
            <div class="details-grid">
                <div>
                    <h5>Frentes</h5>
                    <table class="data-table">
                        <thead><tr><th>Frente</th><th>Fazenda</th><th>Cód</th><th>Talhão</th><th>Variedade</th><th>Área</th><th>Plantada</th><th>Muda</th></tr></thead>
                        <tbody>${frentesRows || '<tr><td colspan="8">—</td></tr>'}</tbody>
                    </table>
                </div>
                <div>
                    <h5>Insumos</h5>
                    <table class="data-table">
                        <thead><tr><th>Produto</th><th>Dose</th><th>Unid</th></tr></thead>
                        <tbody>${insumosRows || '<tr><td colspan="3">—</td></tr>'}</tbody>
                    </table>
                </div>
                <div>
                    <h5>Qualidade</h5>
                    <div class="quality-block">
                        <div>Gemas viáveis/m: ${this.ui.formatNumber(q.gemasOk||0)}</div>
                        <div>Gemas não viáveis/m: ${this.ui.formatNumber(q.gemasNok||0)}</div>
                        <div>Toletes bons (≥%): ${this.ui.formatNumber(q.toletesBons||0)}</div>
                        <div>Toletes ruins (≤%): ${this.ui.formatNumber(q.toletesRuins||0)}</div>
                        <div>Muda (ton/ha): ${this.ui.formatNumber(q.mudaTonHa||0)}</div>
                        <div>Profundidade (cm): ${this.ui.formatNumber(q.profundidadeCm||0)}</div>
                        <div>Cobertura: ${q.cobertura||'—'}</div>
                        <div>Alinhamento: ${q.alinhamento||'—'}</div>
                    </div>
                </div>
            </div>
        </td></tr>`;
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
        this.fazendaIndex = { byName, byCod };
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
        { frente: '4001', fazenda: 'fr-4001-fazenda', cod: 'fr-4001-cod', talhao: 'fr-4001-talhao', variedade: 'fr-4001-variedade', area: 'fr-4001-area', plantada: 'fr-4001-plantada', muda: 'fr-4001-muda' },
        { frente: '4002', fazenda: 'fr-4002-fazenda', cod: 'fr-4002-cod', talhao: 'fr-4002-talhao', variedade: 'fr-4002-variedade', area: 'fr-4002-area', plantada: 'fr-4002-plantada', muda: 'fr-4002-muda' },
        { frente: '4009 Abençoada', fazenda: 'fr-4009-fazenda', cod: 'fr-4009-cod', talhao: 'fr-4009-talhao', variedade: 'fr-4009-variedade', area: 'fr-4009-area', plantada: 'fr-4009-plantada', muda: 'fr-4009-muda' }
    ];
    return rows.map(r => ({
        frente: r.frente,
        fazenda: document.getElementById(r.fazenda)?.value || '',
        cod: document.getElementById(r.cod)?.value ? parseInt(document.getElementById(r.cod)?.value) : undefined,
        talhao: document.getElementById(r.talhao)?.value || '',
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

InsumosApp.prototype.addInsumoRow = function() {
    const produto = document.getElementById('insumo-produto')?.value || '';
    const dose = parseFloat(document.getElementById('insumo-dose')?.value || '0');
    const unid = document.getElementById('insumo-unid')?.value || '';
    if (!produto) { this.ui.showNotification('Selecione o produto', 'warning'); return; }
    this.plantioInsumosDraft.push({ produto, dose, unid });
    this.renderInsumosDraft();
    ['insumo-dose'].forEach(id=>{ const el=document.getElementById(id); if (el) el.value=''; });
};

InsumosApp.prototype.renderInsumosDraft = function() {
    const tbody = document.getElementById('insumos-table-body');
    if (!tbody) return;
    tbody.innerHTML = this.plantioInsumosDraft.map((r,idx)=>`
        <tr>
            <td>${r.produto}</td>
            <td>${this.ui.formatNumber(r.dose||0, 6)}</td>
            <td>${r.unid||''}</td>
            <td><button class="btn btn-delete-insumo-row" data-idx="${idx}">🗑️</button></td>
        </tr>
    `).join('');
};

InsumosApp.prototype.savePlantioDia = async function() {
    const data = document.getElementById('plantio-data')?.value;
    const responsavel = document.getElementById('plantio-responsavel')?.value;
    const observacoes = document.getElementById('plantio-obs')?.value || '';
    const qualidade = {
        gemasOk: parseFloat(document.getElementById('qual-gemas-ok')?.value || '0'),
        gemasNok: parseFloat(document.getElementById('qual-gemas-nok')?.value || '0'),
        toletesBons: parseFloat(document.getElementById('qual-toletes-bons')?.value || '0'),
        toletesRuins: parseFloat(document.getElementById('qual-toletes-ruins')?.value || '0'),
        mudaTonHa: parseFloat(document.getElementById('qual-muda')?.value || '0'),
        profundidadeCm: parseFloat(document.getElementById('qual-profundidade')?.value || '0'),
        cobertura: document.getElementById('qual-cobertura')?.value || '',
        alinhamento: document.getElementById('qual-alinhamento')?.value || ''
    };
    const frenteKey = document.getElementById('single-frente')?.value || '';
    if (!data || !frenteKey) { this.ui.showNotification('Informe data e frente', 'warning'); return; }
    const frente = {
        frente: frenteKey,
        fazenda: document.getElementById('single-fazenda')?.value || '',
        cod: document.getElementById('single-cod')?.value ? parseInt(document.getElementById('single-cod')?.value) : undefined,
        talhao: document.getElementById('single-talhao')?.value || '',
        variedade: document.getElementById('single-variedade')?.value || '',
        area: parseFloat(document.getElementById('single-area')?.value || '0'),
        plantada: parseFloat(document.getElementById('single-plantada')?.value || '0'),
        muda: parseFloat(document.getElementById('single-muda')?.value || '0')
    };
    const payload = {
        data, responsavel, observacoes,
        frentes: [frente],
        insumos: this.plantioInsumosDraft.slice(),
        qualidade
    };
    try {
        const res = await this.api.addPlantioDia(payload);
        if (res && res.success) {
            this.ui.showNotification('Dia de plantio registrado', 'success', 1500);
            this.plantioInsumosDraft = [];
            this.renderInsumosDraft();
            ['single-fazenda','single-cod','single-talhao','single-variedade','single-area','single-plantada','single-muda'].forEach(id=>{ const el=document.getElementById(id); if (el) el.value=''; });
            await this.loadPlantioDia();
        } else {
            this.ui.showNotification('Erro ao registrar', 'error');
        }
    } catch(e) { this.ui.showNotification('Erro ao registrar', 'error'); }
};

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
    const info = fEl && fEl.value ? this.fazendaIndex.byName[fEl.value] : null;
    if (info && cEl) cEl.value = info.cod ?? '';
};
InsumosApp.prototype.autofillRowByCod = function(fazId, codId) {
    const fEl = document.getElementById(fazId);
    const cEl = document.getElementById(codId);
    const info = cEl && cEl.value ? this.fazendaIndex.byCod[parseInt(cEl.value)] : null;
    if (info && fEl) fEl.value = info.fazenda ?? '';
};

InsumosApp.prototype.savePlantioFrente = async function(frenteKey) {
    const data = document.getElementById('plantio-data')?.value;
    const responsavel = document.getElementById('plantio-responsavel')?.value;
    const observacoes = document.getElementById('plantio-obs')?.value || '';
    if (!data) { this.ui.showNotification('Informe a data', 'warning'); return; }
    const map = {
        '4001': { fazenda: 'fr-4001-fazenda', cod: 'fr-4001-cod', talhao: 'fr-4001-talhao', variedade: 'fr-4001-variedade', area: 'fr-4001-area', plantada: 'fr-4001-plantada', muda: 'fr-4001-muda' },
        '4002': { fazenda: 'fr-4002-fazenda', cod: 'fr-4002-cod', talhao: 'fr-4002-talhao', variedade: 'fr-4002-variedade', area: 'fr-4002-area', plantada: 'fr-4002-plantada', muda: 'fr-4002-muda' },
        '4009 Abençoada': { fazenda: 'fr-4009-fazenda', cod: 'fr-4009-cod', talhao: 'fr-4009-talhao', variedade: 'fr-4009-variedade', area: 'fr-4009-area', plantada: 'fr-4009-plantada', muda: 'fr-4009-muda' }
    }[frenteKey];
    if (!map) return;
    const frente = {
        frente: frenteKey,
        fazenda: document.getElementById(map.fazenda)?.value || '',
        cod: document.getElementById(map.cod)?.value ? parseInt(document.getElementById(map.cod)?.value) : undefined,
        talhao: document.getElementById(map.talhao)?.value || '',
        variedade: document.getElementById(map.variedade)?.value || '',
        area: parseFloat(document.getElementById(map.area)?.value || '0'),
        plantada: parseFloat(document.getElementById(map.plantada)?.value || '0'),
        muda: parseFloat(document.getElementById(map.muda)?.value || '0')
    };
    if (!frente.fazenda && !frente.cod) { this.ui.showNotification('Informe a fazenda ou código da frente', 'warning'); return; }
    const payload = { data, responsavel, observacoes, frentes: [frente], insumos: this.plantioInsumosDraft.slice(), qualidade: {} };
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
    const ids = frenteKey === '4001' ? ['fr-4001-fazenda','fr-4001-cod','fr-4001-talhao','fr-4001-variedade','fr-4001-area','fr-4001-plantada','fr-4001-muda']
        : frenteKey === '4002' ? ['fr-4002-fazenda','fr-4002-cod','fr-4002-talhao','fr-4002-variedade','fr-4002-area','fr-4002-plantada','fr-4002-muda']
        : ['fr-4009-fazenda','fr-4009-cod','fr-4009-talhao','fr-4009-variedade','fr-4009-area','fr-4009-plantada','fr-4009-muda'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
};

 

InsumosApp.prototype.handleLogin = async function() {
    const u = document.getElementById('login-user')?.value || '';
    const p = document.getElementById('login-pass')?.value || '';
    if (!u || !p) { this.ui.showNotification('Informe usuário e senha', 'warning'); return; }
    try {
        const res = await this.api.login(u, p);
        if (res && res.success) { this.ui.showNotification('Login efetuado', 'success', 1500); this.hideLoginScreen(); this.updateCurrentUserUI(); await this.loadInitialData(); }
        else this.ui.showNotification('Credenciais inválidas', 'error');
    } catch(e) { this.ui.showNotification('Erro de login', 'error'); }
};

InsumosApp.prototype.handleRegister = async function() {
    const u = document.getElementById('register-user')?.value || '';
    const p = document.getElementById('register-pass')?.value || '';
    if (!u || !p) { this.ui.showNotification('Informe novo usuário e senha', 'warning'); return; }
    try {
        const res = await this.api.register(u, p);
        if (res && res.success) {
            this.ui.showNotification('Conta criada e login efetuado', 'success', 1500);
            this.hideLoginScreen();
            this.updateCurrentUserUI();
            await this.loadInitialData();
        } else {
            this.ui.showNotification('Erro ao criar conta', 'error');
        }
    } catch(e) { this.ui.showNotification('Erro ao criar conta', 'error'); }
};

InsumosApp.prototype.handleLogout = async function() {
    try { await this.api.logout(); } catch(e) {}
    this.showLoginScreen();
    this.ui.showNotification('Sessão encerrada', 'success', 1000);
    this.updateCurrentUserUI();
};

InsumosApp.prototype.updateLoginStatus = function() {
};
InsumosApp.prototype.updateCurrentUserUI = function() {
    const el = document.getElementById('current-user');
    const u = (this.api && this.api.user && this.api.user.username) ? this.api.user.username : null;
    if (el) {
        if (u) { el.style.display = 'inline-block'; el.textContent = `👤 ${u}`; }
        else { el.style.display = 'none'; el.textContent = ''; }
    }
};
InsumosApp.prototype.showLoginScreen = function() { const el = document.getElementById('login-screen'); if (el) el.style.display = 'flex'; };
InsumosApp.prototype.hideLoginScreen = function() { const el = document.getElementById('login-screen'); if (el) el.style.display = 'none'; };