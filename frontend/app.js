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

        // Controle de Load do Dashboard (Circuit Breaker)
        this.dashboardLoadCount = 0;
        this.dashboardLoadResetTime = Date.now();
        this.dashboardDisabled = false;
        this.isDashboardLoading = false;
        this._lastDashboardLoad = 0;

        // Inicializar PDF.js worker
        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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
                    mudaAcumulada: f.muda_acumulada || 0
                };
                const set = (id, val) => { const t = document.getElementById(id); if (t) t.value = val; };
                set('single-fazenda', f.nome || '');
                set('single-regiao', f.regiao || '');
                set('single-area-total', String(f.area_total || 0));
                set('single-area-acumulada', String(f.plantio_acumulado || 0));
                const mEl = document.getElementById('muda-consumo-acumulado');
                if (mEl) mEl.value = String(f.muda_acumulada || 0);
                this.updateAccumulatedStats();
            } else {
                this.ui.showNotification('Fazenda não encontrada', 'warning', 2000);
            }
        } catch(e) {}
    }

    updateAccumulatedStats() {
        if (!this.tempFazendaStats) return;
        
        const plantioDiaInput = document.getElementById('single-plantio-dia');
        const mudaDiaInput = document.getElementById('muda-consumo-dia');
        const cobricaoDiaInput = document.getElementById('cobricao-dia');
        
        const plantioDia = plantioDiaInput && plantioDiaInput.value ? parseFloat(plantioDiaInput.value) : 0;
        const mudaDia = mudaDiaInput && mudaDiaInput.value ? parseFloat(mudaDiaInput.value) : 0;
        const cobricaoDia = cobricaoDiaInput && cobricaoDiaInput.value ? parseFloat(cobricaoDiaInput.value) : 0;
        
        const newPlantioAcum = (this.tempFazendaStats.plantioAcumulado || 0) + plantioDia;
        const newMudaAcum = (this.tempFazendaStats.mudaAcumulada || 0) + mudaDia;
        const newCobricaoAcum = (this.tempFazendaStats.cobricaoAcumulada || 0) + cobricaoDia;
        
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
        const obsEl = document.getElementById('cadastro-fazenda-observacoes');

        const codigo = codigoEl && codigoEl.value ? codigoEl.value.trim() : '';
        const nome = nomeEl && nomeEl.value ? nomeEl.value.trim() : '';
        const regiao = regiaoEl && regiaoEl.value ? regiaoEl.value.trim() : '';
        const areaTotal = areaTotalEl && areaTotalEl.value ? parseFloat(areaTotalEl.value) : 0;
        const plantioAcumulado = plantioAcumEl && plantioAcumEl.value ? parseFloat(plantioAcumEl.value) : 0;
        const mudaAcumulada = mudaAcumEl && mudaAcumEl.value ? parseFloat(mudaAcumEl.value) : 0;
        const observacoes = obsEl && obsEl.value ? obsEl.value.trim() : '';

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
        const obsEl = document.getElementById('cadastro-fazenda-observacoes');
        if (codigoEl) codigoEl.value = item.codigo ?? '';
        if (nomeEl) nomeEl.value = item.nome ?? '';
        if (regiaoEl) regiaoEl.value = item.regiao ?? '';
        if (areaTotalEl) areaTotalEl.value = item.area_total != null ? String(item.area_total) : '';
        if (plantioAcumEl) plantioAcumEl.value = item.plantio_acumulado != null ? String(item.plantio_acumulado) : '';
        if (mudaAcumEl) mudaAcumEl.value = item.muda_acumulada != null ? String(item.muda_acumulada) : '';
        if (obsEl) obsEl.value = item.observacoes ?? '';
        this.cadastroEditCodigo = item.codigo;
        const saveBtn = document.getElementById('cadastro-fazenda-save');
        if (saveBtn) saveBtn.textContent = '💾 Atualizar Fazenda';
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
        if (modal) modal.style.display = 'none';
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
            let geminiKey = localStorage.getItem('geminiApiKey') || '';
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
                        '    { "codigo": "96", "nome": "FAZENDA EXEMPLO", "regiao": "OPCIONAL", "areaTotal": 123.45 }',
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
                        '- Se a mesma fazenda aparecer em mais de uma página some as áreas em uma única entrada.',
                        '- No "resumoGeral", a chave é o número do bloco como string.',
                        '- Não inclua comentários, texto explicativo nem campos extras, apenas o JSON.'
                    ].join('\n');

                    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + geminiKey;
                    
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
            this.openFazendaImportPreview(fazendas);
        } catch (e) {
            this.ui.showNotification('Erro ao ler PDF de fazendas', 'error', 4000);
            console.error('Erro na leitura de PDF de fazendas:', e);
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
                regiao: f.regiao
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
            tabela.addEventListener('click', (e) => {
                const editBtn = e.target.closest('.btn-edit-fazenda');
                const deleteBtn = e.target.closest('.btn-delete-fazenda');
                const usePlantioBtn = e.target.closest('.btn-use-fazenda-plantio');
                if (editBtn) {
                    const codigo = editBtn.getAttribute('data-codigo');
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
    async init() {
        try {
            this.ui.showLoading();
            
            this.initTheme();
            await this.setupEventListeners();
            await this.ensureApiReady();
            await this.loadStaticData();
            
            this.hideLoginScreen();
            
            // Verificar metadados se usuário estiver logado
            if (this.api && this.api.user) {
                const meta = this.api.user.user_metadata || {};
                if (!meta.nome || !meta.matricula) {
                    const updateScreen = document.getElementById('update-profile-screen');
                    if (updateScreen) updateScreen.style.display = 'flex';
                }
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

    async setupEventListeners() {
        console.log('setupEventListeners started');
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
                novoLancamentoModal.style.display = 'flex';
                // Garantir que a lista de OS e Frentes esteja carregada
                await this.loadOSList();
                
                // Carregar lista de produtos para o datalist
                this.loadProdutosDatalist();
            });

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

        if (btnLiberacao && liberacaoModal) {
            btnLiberacao.addEventListener('click', async () => {
                liberacaoModal.style.display = 'flex';
                // Reset form and draft
                this.liberacaoTalhoesDraft = [];
                this.renderLiberacaoTalhoes();
                document.getElementById('liberacao-form').reset();
                
                // Pre-fill date with today
                const dateInput = document.getElementById('liberacao-data');
                if (dateInput && !dateInput.value) {
                    dateInput.valueAsDate = new Date();
                }

                await this.populateLiberacaoOptions();
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
                                // Fetch insumos_fazendas to get talhoes
                                const res = await this.api.getInsumosFazendas({ fazenda: f.nome });
                                if (res && res.success && res.data) {
                                    // Extract unique talhoes (cod) and their areas
                                    const talhoesMap = new Map();
                                    res.data.forEach(item => {
                                        if (item.cod && item.areaTalhao) {
                                            talhoesMap.set(String(item.cod), item.areaTalhao);
                                        }
                                    });
                                    
                                    libTalhaoSelect.innerHTML = '<option value="">Selecione...</option>';
                                    if (talhoesMap.size > 0) {
                                        const sortedTalhoes = Array.from(talhoesMap.keys()).sort((a, b) => a - b);
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
                                    libTalhaoSelect.innerHTML = '<option value="">Erro ao carregar</option>';
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
            libAddTalhaoBtn.addEventListener('click', () => {
                const tInput = document.getElementById('liberacao-talhao-add');
                const vInput = document.getElementById('liberacao-variedade-add');
                const aInput = document.getElementById('liberacao-area-add');
                const tVal = tInput ? tInput.value.trim() : '';
                const vVal = vInput ? vInput.value.trim() : '';
                const aVal = aInput ? parseFloat(aInput.value) : 0;

                if (!tVal || !aVal || aVal <= 0) {
                    this.ui.showNotification('Informe talhão e área válida', 'warning');
                    return;
                }

                this.liberacaoTalhoesDraft.push({ talhao: tVal, variedade: vVal, area: aVal });
                this.renderLiberacaoTalhoes();
                
                if (tInput) tInput.value = '';
                if (vInput) vInput.value = '';
                if (aInput) aInput.value = '';
                tInput.focus();
            });
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
                    await this.api.saveLiberacao({
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
                    if (liberacaoModal) liberacaoModal.style.display = 'none';
                    
                    // Clear form
                    document.getElementById('liberacao-form').reset();
                    this.liberacaoTalhoesDraft = [];
                    this.renderLiberacaoTalhoes();

                } catch (error) {
                    console.error(error);
                    this.ui.showNotification('Erro ao salvar liberação', 'error');
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
                        <div class="report-kpi-card">
                            <span class="report-kpi-value">${kpiInsumos}</span>
                            <span class="report-kpi-label">Insumos Aplicados</span>
                        </div>
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
                        ${imgInsumosTimeline ? `<div><h3>Evolução de Insumos</h3><img src="${imgInsumosTimeline}" class="report-chart-img"></div>` : ''}
                        ${imgOsStatus ? `<div><h3>Status OS</h3><img src="${imgOsStatus}" class="report-chart-img"></div>` : ''}
                        ${imgInsumosGlobal ? `<div><h3>Comparativo Insumos</h3><img src="${imgInsumosGlobal}" class="report-chart-img"></div>` : ''}
                    </div>
                </div>
                
                <div class="page-break"></div>

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

            // Tabela Insumos
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

                <div class="report-section">
                    <h2>4. Ordens de Serviço (Recentes)</h2>
                    <table class="report-table">
                        <thead>
                            <tr>
                                <th>Número</th>
                                <th>Data</th>
                                <th>Tipo/Descrição</th>
                                <th>Status</th>
                                <th>Responsável</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

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
            
            // Carregar dados em paralelo
            const [plantioRes, osRes, insumosRes, estoqueRes, viagensRes, fazendasRes] = await Promise.all([
                this.api.getPlantioDia(),
                this.api.getOSList(),
                this.api.getInsumosFazendas(),
                this.api.getEstoque(),
                this.api.getViagensAdubo(),
                this.api.getFazendas()
            ]);

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
            setTxt('kpi-os-ativas', osActive);
            setTxt('kpi-eficiencia', `${efficiency > 0 ? efficiency.toFixed(1) : 0}%`);
            setTxt('kpi-estoque-items', produtosComSaldo);
            setTxt('kpi-viagens-total', totalViagens);
            setTxt('kpi-volume-total', `${totalVolume.toLocaleString('pt-BR', {maximumFractionDigits: 1})} t`);
            setTxt('kpi-insumos-total', `${totalInsumos.toLocaleString('pt-BR', {maximumFractionDigits: 1})} L/kg`);
            setTxt('kpi-os-concluidas', osConcluidas);

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

        // Sequência de renderização
        try { this.renderPlantioChart(); } catch(e) { console.error('Erro Chart Plantio:', e); }
        try { this.renderOSStatusChart(); } catch(e) { console.error('Erro Chart OS:', e); }
        // renderEstoqueGeralChart, etc.
        try { this.renderEstoqueGeralChart(); } catch(e) { console.error('Erro Chart Estoque:', e); }
        try { this.renderProductDetailsCharts(); } catch(e) { console.error('Erro Chart Produtos:', e); }
        try { this.renderLogisticsCharts(); } catch(e) { console.error('Erro Chart Logistica:', e); }
        try { this.renderFarmProgressChart(); } catch(e) { console.error('Erro Chart Fazendas:', e); }
        try { this.renderInsumosGlobalChart(); } catch(e) { console.error('Erro Chart Insumos Global:', e); }
        try { this.renderInsumosTimelineChart(); } catch(e) { console.error('Erro Chart Insumos Timeline:', e); }
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

    renderOSStatusChart() {
        const ctx = document.getElementById('chart-os-status');
        if (!ctx) return;

        const existingChart = Chart.getChart(ctx);
        if (existingChart) {
            existingChart.destroy();
        }

        const data = this.osListCache || [];
        const statusCounts = {};
        
        data.forEach(os => {
            const s = (os.status || 'Indefinido').toUpperCase();
            statusCounts[s] = (statusCounts[s] || 0) + 1;
        });

        const labels = Object.keys(statusCounts);
        const values = Object.values(statusCounts);
        const colors = labels.map(s => {
            if(s.includes('CONCLU')) return '#4CAF50';
            if(s.includes('ANDAMENTO') || s.includes('ABERTA')) return '#2196F3';
            if(s.includes('CANCEL')) return '#F44336';
            return '#FF9800';
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
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
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
                }
            }
        });
    }

    renderInsumosGlobalChart() {
        const ctx = document.getElementById('chart-dose-global');
        if (!ctx) return;

        const existingChart = Chart.getChart(ctx);
        if (existingChart) existingChart.destroy();
        
        const data = this.insumosFazendasData || [];
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

        this._charts.insumosGlobal = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Planejado (L/kg)',
                        data: plannedData,
                        backgroundColor: '#90CAF9'
                    },
                    {
                        label: 'Realizado (L/kg)',
                        data: realData,
                        backgroundColor: '#1E88E5'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    renderInsumosTimelineChart() {
        const ctx = document.getElementById('chart-insumos-evolucao');
        if (!ctx) return;

        const existingChart = Chart.getChart(ctx);
        if (existingChart) existingChart.destroy();

        const data = this.insumosFazendasData || [];
        const daily = {};

        data.forEach(item => {
            const date = item.inicio ? item.inicio.split('T')[0] : null;
            if (!date) return;
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

        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(0, 150, 136, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 150, 136, 0.0)');

        this._charts.insumosTimeline = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Aplicação Diária (L/kg)',
                    data: values,
                    borderColor: '#009688',
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    renderEstoqueGeralChart() {
         const ctxId = 'chart-estoque-geral';
         const ctx = document.getElementById(ctxId);
         if (!ctx) return;

         this.destroyChart(ctxId, 'estoqueGeral');
         
         const data = this.estoqueList || [];
         if (data.length === 0) return;

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

         if (labels.length === 0) return;

         this._charts.estoqueGeral = new Chart(ctx, {
             type: 'bar',
             data: {
                 labels: labels,
                 datasets: [{
                     label: 'Quantidade em Estoque',
                     data: values,
                     backgroundColor: '#9C27B0'
                 }]
             },
             options: {
                 responsive: true,
                 maintainAspectRatio: false,
                 plugins: {
                     tooltip: {
                         callbacks: {
                             label: function(context) {
                                 let label = context.dataset.label || '';
                                 if (label) {
                                     label += ': ';
                                 }
                                 if (context.parsed.y !== null) {
                                     label += context.parsed.y.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
                                 }
                                 return label;
                             }
                         }
                     }
                 }
             }
         });
    }

    renderProductDetailsCharts() {
         // Wrapper para chamar a antiga updateCharts com os dados atuais
         if (this.insumosFazendasData) {
             this.updateCharts(this.insumosFazendasData);
         }
    }

    renderLogisticsCharts() {
        const ctxId = 'chart-viagens-diarias';
        const ctx = document.getElementById(ctxId);
        if (!ctx) return;

        this.destroyChart(ctxId, 'logistics');

        const periodo = document.getElementById('dashboard-periodo')?.value || '30';
        const now = new Date();
        const filterDate = (dateStr) => {
            if (periodo === 'all') return true;
            if (!dateStr) return false;
            const d = new Date(dateStr);
            const diffTime = Math.abs(now - d);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= parseInt(periodo);
        };

        const data = (this.viagensAdubo || []).filter(v => filterDate(v.data));
        
        if (data.length === 0) return; // Don't create chart if no data

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

        const gradientLogistics = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
        gradientLogistics.addColorStop(0, 'rgba(255, 193, 7, 0.4)');
        gradientLogistics.addColorStop(1, 'rgba(255, 193, 7, 0.0)');

        this._charts.logistics = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Viagens por Dia',
                    data: values,
                    borderColor: '#FFC107',
                    backgroundColor: gradientLogistics,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#FFF',
                    pointBorderColor: '#FFB300',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        titleColor: '#333',
                        bodyColor: '#333',
                        borderColor: '#e0e0e0',
                        borderWidth: 1,
                        intersect: false,
                        mode: 'index',
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
                        ticks: { stepSize: 1, color: '#666' },
                        grid: { color: '#f0f0f0' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#666' }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
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
        } else {
             // console.warn('⚠️ OS List Cache is empty or invalid during Farm Progress Chart render.');
        }

        // Use cadastroFazendas for total area and current progress
        // Filter out farms with 0 area AND only show farms that have registered OS
        let farms = (this.cadastroFazendas || []).filter(f => {
            const area = parseFloat(f.area_total);
            if (area <= 0) return false;

            // Check if linked to any OS
            const nome = normalize(f.nome);
            const cod = String(f.codigo || '').trim();
            
            let hasOS = osFarms.has(cod) || osFarms.has(nome);
            
            if (!hasOS) {
                // Check if any OS farm string contains this farm name or starts with code
                for (const osFarm of osFarms) {
                    if (osFarm.includes(nome) || (cod && osFarm.startsWith(cod + ' '))) {
                        hasOS = true;
                        break;
                    }
                }
            }
            return hasOS;
        });
        
        if (farms.length === 0) return; // Don't create chart if no data

        // Sort by area total descending and take top 15 to avoid clutter
        farms.sort((a, b) => parseFloat(b.area_total) - parseFloat(a.area_total));
        farms = farms.slice(0, 15);

        const labels = farms.map(f => f.nome || f.codigo || 'N/A');
        const progressData = farms.map(f => {
            const total = parseFloat(f.area_total);
            let done = 0;

            // Calcular realizado varrendo plantioDiarioData para garantir dados atualizados
            (this.plantioDiarioData || []).forEach(p => {
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
        const gradientComplete = ctx.getContext('2d').createLinearGradient(0, 0, 200, 0);
        gradientComplete.addColorStop(0, '#43a047');
        gradientComplete.addColorStop(1, '#66bb6a');

        const gradientProgress = ctx.getContext('2d').createLinearGradient(0, 0, 200, 0);
        gradientProgress.addColorStop(0, '#1976d2');
        gradientProgress.addColorStop(1, '#42a5f5');

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
                    borderRadius: 4,
                    barPercentage: 0.6
                }]
            },
            options: {
                indexAxis: 'y', // Horizontal bar
                responsive: true,
                maintainAspectRatio: false,
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
                        grid: { color: '#f0f0f0' },
                        ticks: { callback: v => v + '%' }
                    },
                    y: {
                        grid: { display: false }
                    }
                }
            }
        });
    }


    // === MÉTODOS DE OS ===
    setupOSListeners() {
        const btnOS = document.getElementById('btn-os');
        const modal = document.getElementById('os-modal');
        const closeBtns = document.querySelectorAll('.close-os-modal');
        const fileInput = document.getElementById('os-file-input');

        // Inputs de Fazenda na OS para lógica de split e verificação
        const osCodFazendaInput = document.getElementById('os-cod-fazenda');
        const osFazendaInput = document.getElementById('os-fazenda');

        if (osCodFazendaInput && osFazendaInput) {
            const bindSplit = () => {
                const val = osFazendaInput.value;
                const match = val.match(/^(\d+)[\W_]+(.+)$/);
                if (match) {
                    // Se encontrar padrão "1387 - Nome", separa
                    osCodFazendaInput.value = match[1];
                    osFazendaInput.value = match[2].trim();
                    // Dispara verificação de existência
                    checkFazendaExists();
                }
            };

            const checkFazendaExists = () => {
                const codigo = osCodFazendaInput.value ? parseInt(osCodFazendaInput.value) : null;
                const nome = osFazendaInput.value.trim();
                if (!codigo && !nome) return;

                const normalize = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
                const nomeNorm = normalize(nome);

                const exists = this.cadastroFazendas && this.cadastroFazendas.find(f => {
                    const fNomeNorm = normalize(f.nome);
                    const matchName = nome && fNomeNorm === nomeNorm;
                    const matchCode = codigo && String(f.codigo) === String(codigo);
                    return matchName || matchCode;
                });

                if (exists) {
                    this.ui.showNotification(`Fazenda já cadastrada: ${exists.nome} (Cód: ${exists.codigo})`, 'success');
                    if (!osCodFazendaInput.value && exists.codigo) {
                        osCodFazendaInput.value = exists.codigo;
                    }
                    // Se o nome estiver diferente (ex: "Fazenda X" vs "X"), atualiza para o oficial
                    if (exists.nome && exists.nome !== osFazendaInput.value) {
                         // Opcional: Atualizar para o nome oficial? Pode ser intrusivo.
                         // osFazendaInput.value = exists.nome;
                    }
                } else {
                    this.ui.showNotification('Fazenda não cadastrada. Será necessário cadastrar ao salvar.', 'warning');
                }
            };

            osFazendaInput.addEventListener('input', bindSplit);
            osFazendaInput.addEventListener('blur', checkFazendaExists);
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
        console.log('Iniciando processamento do arquivo:', file.name, file.type);
        if (!file) return;

        this.ui.showNotification('Processando arquivo da OS...', 'info', 3000);

        try {
            let content = '';
            let inlineData = null; // Para imagem ou PDF convertido em imagem

            // Configurar Worker do PDF.js se necessário (importante para renderização)
            if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
            
            console.log('Tipo do arquivo:', file.type);

            if (file.type === 'application/pdf') {
                if (!window.pdfjsLib) {
                    this.ui.showNotification('Leitor de PDF não carregado', 'error');
                    console.error('pdfjsLib não encontrado');
                    return;
                }
                
                try {
                    const buffer = await file.arrayBuffer();
                    const loadingTask = window.pdfjsLib.getDocument({ data: buffer });
                    const pdf = await loadingTask.promise;
                    
                    // Tentar extrair texto primeiro
                    let fullText = '';
                    for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 3); pageNum++) {
                        const page = await pdf.getPage(pageNum);
                        const textContent = await page.getTextContent();
                        const strings = textContent.items.map(item => item.str);
                        fullText += strings.join(' ') + '\n';
                    }

                    console.log('Texto extraído (chars):', fullText.length);

                    // Lógica de Fallback: Se tiver pouco texto (< 50 chars), renderizar como imagem
                    if (fullText.replace(/\s/g, '').length < 50) {
                        console.warn('PDF com pouco texto detectado. Convertendo página 1 para imagem...');
                        this.ui.showNotification('PDF escaneado detectado. Lendo como imagem...', 'info', 2000);

                        const page = await pdf.getPage(1);
                        const viewport = page.getViewport({ scale: 2.0 }); // Alta resolução
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;

                        await page.render({ canvasContext: context, viewport: viewport }).promise;
                        
                        // Converter canvas para base64 (JPEG para reduzir tamanho)
                        const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                        inlineData = { mime_type: 'image/jpeg', data: base64 };
                    } else {
                        content = fullText;
                    }
                } catch (pdfErr) {
                    console.error('Erro no processamento do PDF:', pdfErr);
                    this.ui.showNotification('Erro ao ler PDF.', 'error');
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
                this.ui.showNotification('Formato não suportado. Use PDF ou Imagem.', 'error');
                console.error('Formato não suportado:', file.type);
                return;
            }

            // Chamar Gemini
            let geminiKey = localStorage.getItem('geminiApiKey') || '';
            if (!geminiKey || geminiKey.trim().length < 20) {
                geminiKey = await this.askGeminiKey();
            }

            if (!geminiKey || geminiKey.length < 20) {
                this.ui.showNotification('Chave API necessária.', 'error');
                return;
            }

            this.ui.showNotification('Enviando para análise inteligente...', 'info', 3000);

            const prompt = `
                Você é um assistente especializado em extração de dados de Ordens de Serviço (OS) Agrícolas.
                Analise o documento fornecido (imagem ou texto) e extraia os dados para preencher o formulário.
                
                ATENÇÃO: Retorne APENAS um JSON válido. Não use Markdown (\`\`\`json). Não inclua explicações.
                
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
                    "fazenda": "string",
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

            const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + geminiKey;
            
            // Montar payload
            const parts = [{ text: prompt }];
            if (inlineData) {
                parts.push({ inline_data: inlineData });
            } else {
                parts.push({ text: content });
            }

            const requestBody = {
                contents: [{ parts: parts }],
                generationConfig: {
                    response_mime_type: 'application/json'
                }
            };

            let response;
            const maxRetries = 3;
            for (let i = 0; i < maxRetries; i++) {
                try {
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    });

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
                        this.ui.showNotification(`Erro na IA (${response.status}). Verifique sua chave ou tente novamente.`, 'error');
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
        set('os-fazenda', data.fazenda);
        
        // Disparar evento input para ativar a lógica de split e verificação de fazenda
        const fazendaEl = document.getElementById('os-fazenda');
        if (fazendaEl && data.fazenda) {
            fazendaEl.dispatchEvent(new Event('input', { bubbles: true }));
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
            let lastOS = null;

            // 1. Buscar dados das OSs (Planejado/Manual)
            const res = await this.api.getOSList();
            let countOS = 0;
            if (res.success && res.data) {
                // Filtrar OS da frente (Case Insensitive)
                const osList = res.data.filter(o => String(o.frente).trim().toLowerCase() === String(frente).trim().toLowerCase());
                
                osList.forEach(os => {
                    lastOS = os.numero;
                    if (os.produtos && Array.isArray(os.produtos)) {
                        os.produtos.forEach(p => {
                            const nome = p.produto;
                            let qtd = 0;
                            if (p.qtdTotal != null) qtd = parseFloat(p.qtdTotal);
                            else if (p.total != null) qtd = parseFloat(p.total);
                            else if (p.quantidade != null) qtd = parseFloat(p.quantidade);
                            else if (p.qtd != null) qtd = parseFloat(p.qtd);
                            
                            if (isNaN(qtd)) qtd = 0;

                            if (nome && qtd > 0) {
                                const key = nome.trim();
                                if (!totais[key]) totais[key] = 0;
                                totais[key] += qtd;
                                countOS++;
                            }
                        });
                    }
                });
            }

            // 2. Buscar dados Importados (Insumos Fazendas)
            let countImport = 0;
            try {
                const { data: insumosFaz } = await this.api.supabase
                    .from('insumos_fazendas')
                    .select('produto, quantidade_aplicada, os')
                    .ilike('frente', frente); // Case insensitive match

                if (insumosFaz && insumosFaz.length > 0) {
                    insumosFaz.forEach(i => {
                        const nome = i.produto;
                        const qtd = parseFloat(i.quantidade_aplicada) || 0;
                        if (nome && qtd > 0) {
                            const key = nome.trim();
                            if (!totais[key]) totais[key] = 0;
                            totais[key] += qtd;
                            if (!lastOS && i.os) lastOS = i.os;
                            countImport++;
                        }
                    });
                }
            } catch (errFaz) {
                console.error('Erro ao buscar insumos_fazendas:', errFaz);
            }

            // 3. Buscar dados Importados (Insumos Oxifertil)
            try {
                const { data: insumosOxi } = await this.api.supabase
                    .from('insumos_oxifertil')
                    .select('produto, quantidade_aplicada')
                    .ilike('frente', frente);

                if (insumosOxi && insumosOxi.length > 0) {
                    insumosOxi.forEach(i => {
                        const nome = i.produto;
                        const qtd = parseFloat(i.quantidade_aplicada) || 0;
                        if (nome && qtd > 0) {
                            const key = nome.trim();
                            if (!totais[key]) totais[key] = 0;
                            totais[key] += qtd;
                            countImport++;
                        }
                    });
                }
            } catch (errOxi) {
                console.error('Erro ao buscar insumos_oxifertil:', errOxi);
            }

            // Salvar no Estoque
            const promises = Object.entries(totais).map(([prod, qtd]) => {
                return this.api.setEstoque(
                    frente, 
                    prod, 
                    qtd, 
                    String(lastOS || ''), 
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

            const { data: oxiFrentes } = await this.api.supabase.from('insumos_oxifertil').select('frente');
            if (oxiFrentes) oxiFrentes.forEach(f => { if(f.frente) frentes.add(f.frente); });

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
        
        // Limpar formulário para nova inserção se não estiver editando
        // (Mas se estiver vindo de handleEditOS, já estará preenchido. 
        //  Se for 'Nova OS', deve limpar. Vamos assumir que quem chama lida com isso 
        //  ou implementamos um clear aqui se currentOSData for null)
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
                
                // Populate Frente dropdown
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
        
        // Carregar lista de frentes únicas para o datalist e filtro
        const allData = this.insumosFazendasData || [];
        const frentes = [...new Set(allData.map(i => i.frente).filter(Boolean))].sort();
        
        const datalist = document.getElementById('frentes-list');
        if (datalist) {
            datalist.innerHTML = frentes.map(f => `<option value="${f}">`).join('');
        }

        const filterSelect = document.getElementById('plantio-chart-frente');
        if (filterSelect && filterSelect.options.length <= 1) { // Só 'all' existe
             frentes.forEach(f => {
                 const opt = document.createElement('option');
                 opt.value = f;
                 opt.textContent = f;
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
        if (!canvas) {
             // console.error('❌ Canvas chart-plantio-diario não encontrado');
             return;
        }

        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            existingChart.destroy();
        }

        // Dados base - CORREÇÃO: Usar plantioDiarioData em vez de insumosFazendasData
        const data = this.plantioDiarioData || [];
        // console.log(`📊 Dados para plantio: ${data.length} registros`);
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

            // Função helper para processar entrada de frente/área
            const addEntry = (frenteRaw, area) => {
                const f = normalize(frenteRaw) || 'Geral';
                if (filterFrente !== 'all' && f !== filterFrente) return;
                
                if (!diario[dataKey]) diario[dataKey] = {};
                if (!diario[dataKey][f]) diario[dataKey][f] = 0;
                
                diario[dataKey][f] += parseFloat(area || 0);
                frentesSet.add(f);
                datesSet.add(dataKey);
            };

            // Verifica se tem array de frentes (estrutura nova)
            if (item.frentes && Array.isArray(item.frentes)) {
                item.frentes.forEach(f => {
                    // Correção: Usar plantioDiario com fallback seguro
                    let val = f.plantioDiario;
                    if (val === undefined || val === null) val = f.plantada;
                    addEntry(f.frente, val);
                });
            } else {
                // Estrutura antiga ou simplificada
                addEntry(item.frente, item.area_plantada);
            }
        });

        // Ordenar datas
        const dates = Array.from(datesSet).sort();
        
        if (dates.length === 0) {
            console.warn('⚠️ Sem dados de datas para renderizar gráfico de plantio.');
            if (this.plantioChartInstance) {
                this.plantioChartInstance.destroy();
                this.plantioChartInstance = null;
            }
            return;
        }

        // Se quiser limitar aos últimos 30 dias:
        // const dates = Array.from(datesSet).sort().slice(-30);

        const frentes = Array.from(frentesSet).sort();

        // Datasets
        const datasets = [];
        
        // Paleta de gradients
        const palettes = [
            ['#42a5f5', '#1976d2'], // Blue
            ['#66bb6a', '#43a047'], // Green
            ['#ffa726', '#f57c00'], // Orange
            ['#ab47bc', '#7b1fa2'], // Purple
            ['#ef5350', '#c62828'], // Red
            ['#26c6da', '#00acc1'], // Cyan
            ['#8d6e63', '#5d4037'], // Brown
            ['#78909c', '#455a64']  // Grey
        ];

        frentes.forEach((frente, index) => {
            const palette = palettes[index % palettes.length];
            const ctx = canvas.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, palette[0]);
            gradient.addColorStop(1, palette[1]);
            
            // Dados de Realizado (Barras)
            const dataPoints = dates.map(d => diario[d] && diario[d][frente] ? diario[d][frente] : 0);
            
            datasets.push({
                label: `Realizado - ${frente}`,
                data: dataPoints,
                backgroundColor: gradient,
                borderColor: palette[1],
                borderWidth: 1,
                borderRadius: 4,
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
                    borderColor: palette[1], // Mesma cor base da barra
                    borderWidth: 2,
                    borderDash: [5, 5],
                    type: 'line',
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0, // Linha reta
                    order: 1
                });
            }
        });

        // Destruir anterior
        if (this.plantioChartInstance) {
            this.plantioChartInstance.destroy();
        }

        // Criar novo Chart
        this.plantioChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: dates.map(d => {
                    const parts = d.split('-');
                    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
                }),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ha';
                                }
                                return label;
                            }
                        }
                    },
                    legend: {
                        position: 'bottom'
                    }
                },
                scales: {
                    x: {
                        stacked: false // Lado a lado para facilitar comparação
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Hectares (ha)'
                        }
                    }
                }
            }
        });
    }
    async setupLegacyListeners() {
        if (this.legacyListenersAttached) return;
        console.log('setupLegacyListeners started');
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
        if (viagemCodEl) viagemCodEl.addEventListener('change', () => this.autofillRowByCod('viagem-fazenda', 'viagem-codigo-fazenda'));

        document.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.btn-edit');
            const deleteBtn = e.target.closest('.btn-delete');
            const delEstoqueBtn = e.target.closest('.btn-delete-estoque');
            const delPlantioBtn = e.target.closest('.btn-delete-plantio');
            const editPlantioBtn = e.target.closest('.btn-edit-plantio');
            const togglePlantioBtn = e.target.closest('.btn-toggle-plantio-details');
            const delBagRowBtn = e.target.closest('.btn-delete-bag-row');
            const viewViagemBtn = e.target.closest('.btn-view-viagem-adubo');
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
            } else if (viewViagemBtn) {
                const id = viewViagemBtn.getAttribute('data-viagem-id');
                this.openViagemDetail(id);
            } else if (delViagemBtn) {
                const id = delViagemBtn.getAttribute('data-viagem-id');
                const ok = window.confirm('Excluir viagem de adubo?');
                if (!ok) return;
                this.api.deleteViagemAdubo(id).then(async (res) => {
                    if (res && res.success) {
                        this.ui.showNotification('Viagem excluída', 'success', 1500);
                        await this.loadViagensAdubo();
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
        if (plantioSaveBtn) plantioSaveBtn.addEventListener('click', async () => { await this.savePlantioDia(); });

        const singlePlantioDia = document.getElementById('single-plantio-dia');
        const mudaConsumoDia = document.getElementById('muda-consumo-dia');
        const cobricaoDia = document.getElementById('cobricao-dia');
        if (singlePlantioDia) singlePlantioDia.addEventListener('input', () => {
            this.updateAccumulatedStats();
            this.renderInsumosDraft();
        });
        if (mudaConsumoDia) mudaConsumoDia.addEventListener('input', () => this.updateAccumulatedStats());
        if (cobricaoDia) cobricaoDia.addEventListener('input', () => this.updateAccumulatedStats());

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
        const bindGemas = () => this.updateGemasPercent();
        if (gemasTotal) gemasTotal.addEventListener('input', bindGemas);
        if (gemasBoas) gemasBoas.addEventListener('input', bindGemas);
        if (gemasRuins) gemasRuins.addEventListener('input', bindGemas);
        if (gemasAmostra) gemasAmostra.addEventListener('input', bindGemas);

        const mudasTotal = document.getElementById('qual-mudas-total');
        const mudasBoas = document.getElementById('qual-mudas-boas');
        const mudasRuins = document.getElementById('qual-mudas-ruins');
        const mudasAmostra = document.getElementById('qual-mudas-amostra');
        const bindMudas = () => this.updateMudasPercent();
        if (mudasTotal) mudasTotal.addEventListener('input', bindMudas);
        if (mudasBoas) mudasBoas.addEventListener('input', bindMudas);
        if (mudasRuins) mudasRuins.addEventListener('input', bindMudas);
        if (mudasAmostra) mudasAmostra.addEventListener('input', bindMudas);

        const singleFrente = document.getElementById('single-frente');
        const singleOs = document.getElementById('single-os');

        if (singleFrente) {
            singleFrente.addEventListener('change', async () => {
                const val = singleFrente.value;
                
                // Carregar produtos da OS para o select de insumos
                await this.loadProdutosDatalist();

                if (singleOs) {
                    singleOs.innerHTML = '<option value="">Selecione a OS</option>';
                    if (val && this.osListCache) {
                        // Comparação robusta (string e trim)
                        const osList = this.osListCache.filter(o => String(o.frente).trim() === String(val).trim());
                        
                        if (osList.length === 0) {
                            console.warn(`Nenhuma OS encontrada para a frente: "${val}"`);
                        }

                        osList.forEach(os => {
                            const opt = document.createElement('option');
                            opt.value = os.numero;
                            opt.textContent = `${os.numero} - ${os.fazenda || 'Sem Fazenda'}`;
                            singleOs.appendChild(opt);
                        });
                        
                        // Sincronizar estoque para a frente selecionada
                        // (Garante que se tiver estoque cadastrado, ele apareça na tabela abaixo se implementado)
                        // await this.loadEstoqueByFrente(val); // Futuro: Implementar se necessário tabela de estoque aqui
                    }
                }
            });
        }

        if (singleOs) {
            singleOs.addEventListener('change', async () => {
                // Atualizar lista de produtos com base na OS selecionada
                await this.loadProdutosDatalist();

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
                    
                    this.ui.showNotification('Dados da OS preenchidos.', 'info', 1500);
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
            await this.autofetchFazendaByCodigoApi('single-cod');
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
        const gpsSel = document.getElementById('plantio-gps');
        const gpsCoords = document.getElementById('gps-coords');
        if (gpsSel && gpsCoords) {
            const applyGps = () => { const v = gpsSel.value; gpsCoords.style.display = (v === 'Sim') ? 'grid' : 'none'; };
            gpsSel.addEventListener('change', applyGps);
            applyGps();
        }
        
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
        if (tabName === 'insumos-fazendas') {
            await this.loadInsumosData();
        } else if (tabName === 'graficos') {
            // Carregamento automático com circuit breaker (implementado em loadDashboard)
            await this.loadDashboard();
        } else if (tabName === 'estoque') {
            await this.loadEstoqueAndRender();
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
        if (!tbody) return;
        
        const rows = (this.plantioDia || []).slice().sort((a,b)=> String(a.data||'').localeCompare(String(b.data||'')));
        
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #666;">Nenhum registro de plantio encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const sumArea = (r.frentes||[]).reduce((s,x)=> s + (Number(x.area)||0), 0);
            const resumoFrentes = (r.frentes||[]).map(f => `${f.frente}: ${f.fazenda||'—'}${f.regiao?(' / '+f.regiao):''}`).join(' | ');
            const expanded = this.plantioExpanded.has(String(r.id));
            const details = expanded ? this.getPlantioDetailsHTML(r) : '';
            const toggleIcon = expanded ? '🔼' : '🔽';
            const toggleText = expanded ? 'Ocultar' : 'Detalhes';
            
            return `
            <tr>
                <td>${this.ui.formatDateBR(r.data)}</td>
                <td>${resumoFrentes || '—'}</td>
                <td>${this.ui.formatNumber(sumArea)}</td>
                
                <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn btn-sm btn-secondary btn-toggle-plantio-details" data-plantio-id="${r.id}">
                            ${toggleIcon} ${toggleText}
                        </button>
                        <button class="btn btn-sm btn-secondary btn-edit-plantio" data-plantio-id="${r.id}" title="Editar Registro">
                            ✏️
                        </button>
                        <button class="btn btn-sm btn-delete-plantio" data-plantio-id="${r.id}" style="background-color: #e74c3c; color: white;" title="Excluir Registro">
                            🗑️
                        </button>
                    </div>
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
                <td>${f.regiao||'—'}</td>
                <td>${this.ui.formatNumber(f.areaTotal||0)}</td>
                <td>${this.ui.formatNumber(f.area||0)}</td>
                <td>${this.ui.formatNumber(f.areaAcumulada||0)}</td>
                <td>${this.ui.formatNumber(f.plantioDiario||0)}</td>
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
        
        // Helper para item de qualidade
        const qualItem = (label, val, sub = '') => `
            <div class="quality-item">
                <div class="label" title="${label}">${label}</div>
                <div class="value">${val}${sub ? `<span class="sub-value">${sub}</span>` : ''}</div>
            </div>
        `;

        return `
        <tr class="plantio-details-row"><td colspan="4">
            <div class="plantio-details-container">
                <!-- Seção 1: Frentes -->
                <div class="details-card full-width">
                    <h5>🚜 Frentes e Áreas</h5>
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

                <!-- Seção 2: Insumos -->
                <div class="details-card flex-1">
                    <h5>🧪 Insumos Aplicados</h5>
                    <div style="overflow-x: auto;">
                        <table class="details-inner-table">
                            <thead><tr><th>Produto</th><th>Dose</th><th>Unid</th></tr></thead>
                            <tbody>${insumosRows || '<tr><td colspan="3" style="text-align:center;">—</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>

                <!-- Seção 3: Qualidade e Condições -->
                <div class="details-card flex-2">
                    <h5>📊 Qualidade e Condições</h5>
                    <div class="quality-grid">
                        ${qualItem('Gemas Totais', this.ui.formatNumber(q.gemasTotal||0))}
                        ${qualItem('Gemas Boas', this.ui.formatNumber(q.gemasBoas||0), `(${this.ui.formatNumber(q.gemasBoasPct||0,1)}%)`)}
                        ${qualItem('Gemas Ruins', this.ui.formatNumber(q.gemasRuins||0), `(${this.ui.formatNumber(q.gemasRuinsPct||0,1)}%)`)}
                        
                        ${qualItem('Toletes Totais', this.ui.formatNumber(q.toletesTotal||0))}
                        ${qualItem('Toletes Bons', this.ui.formatNumber(q.toletesBons||0), `(${this.ui.formatNumber(q.toletesBonsPct||0,1)}%)`)}
                        ${qualItem('Toletes Ruins', this.ui.formatNumber(q.toletesRuins||0), `(${this.ui.formatNumber(q.toletesRuinsPct||0,1)}%)`)}
                        
                        ${qualItem('Mudas Totais', this.ui.formatNumber(q.mudasTotal||0))}
                        ${qualItem('Mudas Boas', this.ui.formatNumber(q.mudasBoas||0), `(${this.ui.formatNumber(q.mudasBoasPct||0,1)}%)`)}
                        ${qualItem('Mudas Ruins', this.ui.formatNumber(q.mudasRuins||0), `(${this.ui.formatNumber(q.mudasRuinsPct||0,1)}%)`)}
                        
                        ${qualItem('Muda (ton/ha)', this.ui.formatNumber(q.mudaTonHa||0))}
                        ${qualItem('Profundidade', this.ui.formatNumber(q.profundidadeCm||0), 'cm')}
                        ${qualItem('Cobertura', q.cobertura||'—')}
                        ${qualItem('Alinhamento', q.alinhamento||'—')}
                        ${qualItem('Chuva', this.ui.formatNumber(q.chuvaMm||0,1), 'mm')}
                        ${qualItem('GPS', q.gps ? 'Sim' : 'Não')}
                        
                        ${qualItem('Cobrição Dia', this.ui.formatNumber(q.cobricaoDia||0,2))}
                        ${qualItem('Cobrição Acum.', this.ui.formatNumber(q.cobricaoAcumulada||0,2))}
                        
                        ${qualItem('Consumo Muda Dia', this.ui.formatNumber(q.mudaConsumoDia||0,2))}
                        ${qualItem('Consumo Muda Total', this.ui.formatNumber(q.mudaConsumoTotal||0,2))}
                        ${qualItem('Muda Previsto', this.ui.formatNumber(q.mudaPrevisto||0,2))}
                        ${qualItem('Variedade', q.mudaVariedade||'—')}
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

        // Update Headers
        if (theadTr) {
            if (currentType === 'composto') {
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
                theadTr.innerHTML = `
                    <th>Data</th>
                    <th>Frente</th>
                    <th>Fazenda</th>
                    <th>Produto</th>
                    <th>Quantidade</th>
                    <th>Unidade</th>
                    <th>Motorista</th>
                    <th>Caminhão</th>
                    <th>Ações</th>
                `;
            }
        }

        if (filters.tipo && filters.tipo !== currentType) {
             // If filter explicitly set and differs (shouldn't happen with new logic but safe to keep), respect filter? 
             // Actually, let's enforce the tab selection.
             // data = data.filter(v => (v.transportType || 'adubo') === filters.tipo);
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
                 const diffClass = diff > 0 ? 'text-success' : (diff < 0 ? 'text-danger' : '');
                 const diffSign = diff > 0 ? '+' : '';

                 return `
                    <tr>
                        <td>${v.data || ''}</td>
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
                        <td>${v.data || ''}</td>
                        <td>${v.frente || ''}</td>
                        <td>${v.fazenda || ''}</td>
                        <td>${v.produto || ''}</td>
                        <td>${this.ui.formatNumber(qtd, 3)}</td>
                        <td>${v.unidade || ''}</td>
                        <td>${v.motorista || ''}</td>
                        <td>${v.caminhao || ''}</td>
                        <td>
                            <button class="btn btn-secondary btn-view-viagem-adubo" data-viagem-id="${v.id}">👁️ Ver</button>
                            <button class="btn btn-delete-viagem-adubo" data-viagem-id="${v.id}">🗑️ Excluir</button>
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

    addBagRow() {
        const identEl = document.getElementById('bag-identificacao');
        const pesoEl = document.getElementById('bag-peso');
        const lacreEl = document.getElementById('bag-lacre');
        const obsEl = document.getElementById('bag-observacoes');
        const identificacao = identEl && identEl.value ? identEl.value.trim() : '';
        const pesoRaw = pesoEl && pesoEl.value ? pesoEl.value : '0';
        const pesoVal = parseFloat(pesoRaw);
        const peso = isNaN(pesoVal) ? 0 : pesoVal;
        const lacre = lacreEl && lacreEl.value ? lacreEl.value.trim() : '';
        const observacoes = obsEl && obsEl.value ? obsEl.value.trim() : '';
        if (!identificacao && !peso) {
            if (this.ui && this.ui.showNotification) this.ui.showNotification('Informe identificação ou peso do bag', 'warning');
            return;
        }
        if (!Array.isArray(this.viagensAduboBagsDraft)) this.viagensAduboBagsDraft = [];
        this.viagensAduboBagsDraft.push({ identificacao, peso, lacre, observacoes });
        this.renderBagsDraft();
        if (identEl) identEl.value = '';
        if (pesoEl) pesoEl.value = '';
        if (lacreEl) lacreEl.value = '';
        if (obsEl) obsEl.value = '';
    }

    renderBagsDraft() {
        const tbody = document.getElementById('bags-table-body');
        if (!tbody) return;
        if (!Array.isArray(this.viagensAduboBagsDraft) || !this.viagensAduboBagsDraft.length) {
            tbody.innerHTML = '';
            return;
        }
        tbody.innerHTML = this.viagensAduboBagsDraft.map((b, idx) => {
            const p = typeof b.peso === 'number' ? b.peso : parseFloat(b.peso) || 0;
            return `
                <tr>
                    <td>${b.identificacao || ''}</td>
                    <td>${this.ui.formatNumber(p, 3)}</td>
                    <td>${b.lacre || ''}</td>
                    <td>${b.observacoes || ''}</td>
                    <td><button class="btn btn-delete-bag-row" data-idx="${idx}">🗑️</button></td>
                </tr>
            `;
        }).join('');
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
                    </tr>
                </thead>
                <tbody>
                    ${bags.map(b => {
                        const p = typeof b.peso === 'number' ? b.peso : parseFloat(b.peso) || 0;
                        return `
                            <tr>
                                <td>${b.identificacao || ''}</td>
                                <td>${this.ui.formatNumber(p, 3)}</td>
                                <td>${b.lacre || ''}</td>
                                <td>${b.observacoes || ''}</td>
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

    loadTransporteComposto() {
        const viewAdubo = document.getElementById('view-adubo-mode');
        const viewComposto = document.getElementById('view-composto-mode');
        if (viewAdubo) viewAdubo.style.display = 'none';
        if (viewComposto) viewComposto.style.display = 'block';

        this.renderTransporteComposto();
        
        if (!this._compostoListenersSet) {
            this.setupCompostoListeners();
            this._compostoListenersSet = true;
        }
    }

    setupCompostoListeners() {
        // 1. Import PDF
        const btnImport = document.getElementById('btn-composto-import');
        const fileInput = document.getElementById('file-import-pdf');
        if (btnImport && fileInput) {
            btnImport.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleCompostoImport(e.target.files[0]));
        }

        // 2. Clear Form
        const btnClear = document.getElementById('btn-composto-clear');
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                const form = document.getElementById('form-transporte-composto');
                if (form) form.reset();
                document.getElementById('composto-id').value = '';
            });
        }

        // 3. Confirm Import
        const btnConfirm = document.getElementById('btn-confirm-import');
        if (btnConfirm) {
            btnConfirm.addEventListener('click', () => {
                if (this._lastImportedData) {
                    this.fillCompostoForm(this._lastImportedData);
                    document.getElementById('import-preview').style.display = 'none';
                }
            });
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
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const percent = (pageNum / pdf.numPages) * 100;
                this.showProgress('Lendo PDF...', percent, `Lendo página ${pageNum} de ${pdf.numPages}`);
                
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
            }
            
            this.hideProgress();

            console.log('PDF Content Extracted:', fullText);

            // Tenta extrair dados com regex mais específicos baseados no layout real da O.S.
            
            // 1. Número da OS: "Ordem de serviço - 357"
            const osMatch = fullText.match(/Ordem de serviço\s*-\s*(\d+)/i);
            
            // 2. Data de Abertura: "Abertura: 22/01/2026"
            const dataMatch = fullText.match(/Abertura:\s*(\d{2}\/\d{2}\/\d{4})/i);
            
            // 3. Responsável: "Resp. Apl.: NOME DO RESPONSAVEL"
            // Pega tudo até encontrar a palavra "Empresa" ou quebra de linha
            const respMatch = fullText.match(/Resp\.?\s*Apl\.?:\s*([^\n\r]+?)(?=\s+Empresa|\s+Área|$)/i);
            
            // 4. Empresa: "Empresa: 4-4 CAMBUI"
            const empresaMatch = fullText.match(/Empresa:\s*([^\n\r]+?)(?=\s+Área|$)/i);
            
            // 5. Frente: "Frente: 99 A DEFINIR" -> extrair apenas o número ou tudo
            const frenteMatch = fullText.match(/Frente:\s*(\d+)/i);
            
            // 6. Atividade Agrícola: Código e nome na tabela inferior
            // Ex: "2243-TRANSPORTE DE COMPOSTAGEM"
            // Procura padrão de código-texto seguido de datas
            const ativMatch = fullText.match(/(\d+-[A-Z\s]+COMPOSTAGEM[^\n\r]*)/i) || 
                              fullText.match(/Atividade Agrícola\s*([\w\s-]+)/i);

            // 7. Produto: "150944-COMPOSTO ORGANICO"
            // Geralmente está abaixo da atividade ou próximo
            const prodMatch = fullText.match(/(\d+-COMPOSTO[^\n\r]*)/i) ||
                              fullText.match(/Produto\s*([^\n\r]+)/i);

            // 8. Quantidade e Unidade: "13,0000 1-TN 572,000"
            // A quantidade total geralmente é o maior número na linha do produto ou coluna específica
            // Regex tenta capturar a linha do produto e seus valores
            let qtdVal = 0;
            let undVal = 't';
            
            // Tenta achar a linha de totais ou valores específicos do produto
            // Padrão: Dose Rec. Unidade Quantidade
            // Ex: 13,0000 1-TN 572,000
            const valMatch = fullText.match(/(\d+(?:[.,]\d+)?)\s+(\d+-[A-Z]+)\s+(\d+(?:[.,]\d+)?)/);
            
            if (valMatch) {
                // valMatch[1] = Dose (13,0000)
                // valMatch[2] = Unidade (1-TN)
                // valMatch[3] = Quantidade Total (572,000)
                undVal = valMatch[2];
                qtdVal = parseFloat(valMatch[3].replace('.','').replace(',','.'));
            } else {
                // Fallback simples
                const qtdMatch = fullText.match(/(?:Qtde|Quantidade|Peso|Volume|Total)[:\s]*([\d,.]+)/i);
                if (qtdMatch) qtdVal = parseFloat(qtdMatch[1].replace('.','').replace(',','.'));
            }

            // Fallback para OS no nome do arquivo
            const osFile = file.name.match(/\d+/);
            
            // Limpeza de strings capturadas
            const cleanStr = (s) => s ? s.trim() : '';

            const extractedData = {
                numero_os: osMatch ? osMatch[1] : (osFile ? osFile[0] : ''),
                data_abertura: dataMatch ? dataMatch[1].split('/').reverse().join('-') : new Date().toISOString().split('T')[0],
                responsavel_aplicacao: cleanStr(respMatch ? respMatch[1] : 'Importado PDF'),
                empresa: cleanStr(empresaMatch ? empresaMatch[1] : 'Detectado via PDF'),
                frente: frenteMatch ? frenteMatch[1] : '',
                produto: cleanStr(prodMatch ? prodMatch[1] : 'COMPOSTO'),
                quantidade: qtdVal,
                unidade: cleanStr(undVal),
                atividade_agricola: cleanStr(ativMatch ? ativMatch[1].split('  ')[0] : 'ADUBACAO'), // Split para evitar pegar datas junto
                status: 'ABERTO'
            };

            this._lastImportedData = extractedData;
             
            const preview = document.getElementById('import-result-json');
            if (preview) {
                 preview.textContent = JSON.stringify(extractedData, null, 2);
                 document.getElementById('import-preview').style.display = 'block';
            }
            
            this.ui.showNotification('PDF processado com sucesso!', 'success');

        } catch (err) {
            this.hideProgress();
            console.error(err);
            this.ui.showNotification('Erro ao processar PDF: ' + err.message, 'error');
        }
    }

    fillCompostoForm(data) {
        const f = document.getElementById('form-transporte-composto');
        if (!f) return;
        
        // Helper to set value by name
        const set = (name, val) => {
            const el = f.querySelector(`[name="${name}"]`);
            if (el) el.value = val || '';
        };

        set('numero_os', data.numero_os || data.os);
        set('data_abertura', data.data_abertura ? data.data_abertura.split('T')[0] : '');
        set('responsavel_aplicacao', data.responsavel_aplicacao || data.responsavel);
        set('empresa', data.empresa);
        set('frente', data.frente);
        set('produto', data.produto || 'COMPOSTO');
        set('quantidade', data.quantidade || data.volume);
        set('unidade', data.unidade || 't');
        set('atividade_agricola', data.atividade_agricola);
        set('status', data.status || 'ABERTO');
    }

    async handleCompostoSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Validate
        if (!data.numero_os) {
            this.ui.showNotification('Número da OS é obrigatório', 'warning');
            return;
        }

        try {
            console.log('Salvando transporte composto:', data); // Debug
            // Save to Supabase directly
            const res = await this.api.saveTransporteComposto(data);

            if (res && res.success) {
                this.ui.showNotification('Salvo com sucesso!', 'success');
                // document.getElementById('modal-transporte-composto').style.display = 'none'; // Modal removed in new layout
                form.reset();
                // Clear hidden ID field to reset to create mode
                const idField = document.getElementById('composto-id');
                if (idField) idField.value = '';
                
                this.renderTransporteComposto();
            } else {
                throw new Error(res.message || 'Erro ao salvar');
            }
        } catch (err) {
            console.error('Erro ao salvar transporte composto:', err);
            this.ui.showNotification('Erro ao salvar: ' + (err.message || JSON.stringify(err)), 'error');
        }
    }

    async renderTransporteComposto() {
        const tbody = document.getElementById('transporte-composto-body');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Carregando...</td></tr>';

        try {
            // Fetch data from Supabase
            const res = await this.api.getTransporteComposto();
            if (res && res.success && Array.isArray(res.data)) {
                let list = res.data;
                
                // Filter
                const search = document.getElementById('composto-search-os')?.value.toLowerCase();
                const status = document.getElementById('composto-filter-status')?.value;
                
                if (search) list = list.filter(i => String(i.numero_os).toLowerCase().includes(search));
                if (status) list = list.filter(i => i.status === status);

                if (list.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
                    return;
                }

                tbody.innerHTML = list.map(item => `
                    <tr>
                        <td>${item.numero_os || '-'}</td>
                        <td>${this.ui.formatDateBR(item.data_abertura)}</td>
                        <td>${item.fazenda || '-'} / ${item.frente || '-'}</td>
                        <td>${item.produto || '-'}</td>
                        <td>${this.ui.formatNumber(item.quantidade, 3)}</td>
                        <td><span class="badge ${item.status === 'ABERTO' ? 'badge-warning' : 'badge-success'}">${item.status}</span></td>
                        <td style="white-space: nowrap; min-width: 120px;">
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-sm btn-secondary" onclick="window.insumosApp.editComposto('${item.id}')" title="Editar">✏️</button>
                                <button class="btn btn-sm btn-danger" onclick="window.insumosApp.deleteComposto('${item.id}')" title="Excluir">🗑️</button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="7" style="color:red;">Erro ao carregar dados.</td></tr>';
            }
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="7" style="color:red;">Erro de conexão.</td></tr>';
        }
    }
    
    // Global helpers for onclick
    editComposto(id) {
        // Implement edit fetch and open modal
        this.ui.showNotification('Editar: ' + id, 'info');
    }
    
    deleteComposto(id) {
        if(confirm('Excluir este registro?')) {
            // Implement delete
             this.api.deleteTransporteComposto(id)
                .then(res => {
                    if(res.success) {
                        this.ui.showNotification('Excluído', 'success');
                        this.renderTransporteComposto();
                    } else {
                        this.ui.showNotification('Erro ao excluir', 'error');
                    }
                });
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
            return;
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
        const baseOpts = { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: true, position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            
                            let value = context.parsed.y;
                            // Check if horizontal bar (indexAxis: 'y')
                            if (context.chart.config.options.indexAxis === 'y') {
                                value = context.parsed.x;
                            }
                            
                            if (value !== null && value !== undefined) {
                                label += value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
                            }
                            
                            if (context.dataset.label && context.dataset.label.includes('Diferença')) label += '%';
                            return label;
                        }
                    }
                }
            }, 
            scales: { x: { grid: { display: false } }, y: { grid: { display: false } } } 
        };
        
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
            this._charts.doseProd = new Chart(doseProdCtx, { type: 'bar', data: doseProdData, options: baseOpts });
        }
        if (doseGlobalCtx) {
            this._charts.doseGlobal = new Chart(doseGlobalCtx, { type: 'bar', data: doseGlobalData, options: baseOpts });
        }
        if (diffProdCtx) {
            this._charts.diffProd = new Chart(diffProdCtx, { type: 'bar', data: diffProdData, options: { ...baseOpts, indexAxis: 'y' } });
        }
    } catch(e) {
        console.error('chart error', e);
    }
};

InsumosApp.prototype.loadEstoqueAndRender = async function() {
        if (this.isLoadingEstoque) return;
        this.isLoadingEstoque = true;
        try {
            const [resEstoque, resOS, resImport] = await Promise.all([
                this.api.getEstoque(),
                this.api.getOSList(), // Busca OSs para saber todas as frentes possíveis
                this.api.supabase.from('insumos_fazendas').select('os, frente, produto').not('os', 'is', null)
            ]);

            if (!resEstoque || !resEstoque.success) { this.isLoadingEstoque = false; return; }
            
            // Dados vêm como array de objetos do Supabase: [{frente, produto, quantidade, os_numero, data_cadastro}, ...]
            const estoqueList = Array.isArray(resEstoque.data) ? resEstoque.data : [];
            const osList = (resOS && resOS.success && Array.isArray(resOS.data)) ? resOS.data : [];
            const importList = (resImport && Array.isArray(resImport.data)) ? resImport.data : [];

            // Coletar frentes únicas de AMBOS (estoque, OS e importados) para popular filtros
            const frentesEstoque = estoqueList.map(e => e.frente).filter(Boolean);
            const frentesOS = osList.map(o => o.frente).filter(Boolean);
            const frentesImport = importList.map(i => i.frente).filter(Boolean);
            const todasFrentes = [...new Set([...frentesEstoque, ...frentesOS, ...frentesImport])].sort((a,b) => 
                a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'})
            );

            // === DROPDOWNS POPULATION ===
            // Popular filtro de Frente
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
                
                // Só atualiza se mudou significativamente
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

        // Popular Dropdown de O.S. (Manual) - Incluindo OSs importadas
        const osNumbersOS = osList.map(o => o.numero).filter(Boolean);
        const osNumbersImport = importList.map(i => i.os).filter(Boolean);
        const osNumbers = [...new Set([...osNumbersOS, ...osNumbersImport])].sort((a,b) => {
             // Tenta ordenar numericamente se possível
             const na = parseInt(a);
             const nb = parseInt(b);
             if (!isNaN(na) && !isNaN(nb)) return na - nb;
             return String(a).localeCompare(String(b));
        });
        updateSelect('estoque-os-manual', osNumbers, false);

        // Popular Dropdown de PRODUTOS (novo)
        // Coletar produtos únicos de AMBOS (estoque, OS e importados)
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
        
        // Atualizar dropdown de produtos manual
        updateSelect('estoque-produto', todosProdutos, false);
        
        // Se a lista de produtos estiver vazia, adicionar alguns padrão
        if (todosProdutos.length === 0) {
            const padrao = ['BIOZYME', '04-30-10', 'QUALITY', 'AZOKOP', 'SURVEY (FIPRONIL)', 'OXIFERTIL', 'LANEX 800 WG (REGENTE)', 'COMET', 'COMPOSTO', '10-49-00', 'PEREGRINO', 'NO-NEMA'];
             updateSelect('estoque-produto', padrao.sort(), false);
        }

        // === CHART PREPARATION ===
        // Precisamos agrupar por frente para o gráfico
        // Estrutura para gráfico: { 'Frente 1': { 'Produto A': 10 }, ... }
        const estoqueMap = {};
        estoqueList.forEach(item => {
            if (!estoqueMap[item.frente]) estoqueMap[item.frente] = {};
            // Se houver múltiplos registros do mesmo produto na mesma frente (não deveria pelo upsert key), somamos
            // Mas o upsert key é (frente, produto), então deve ser único.
            estoqueMap[item.frente][item.produto] = (estoqueMap[item.frente][item.produto] || 0) + (parseFloat(item.quantidade) || 0);
        });

        const ctx = document.getElementById('chart-estoque-frente');
        if (ctx) {
            // Destruir gráfico anterior para evitar sobreposição infinita
            this.destroyChart('chart-estoque-frente', 'estoqueFrente');

            if (!this._charts) this._charts = {};
            let chartData;
            let chartOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top' } } };
            
            // Se o filtro atual não estiver na lista (ex: usuário digitou algo manual no filtro?), fallback para 'all'
            // Mas o filtro é um select agora.
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
                
                // Sort by quantity desc
                filteredRows.sort((a,b) => b[1] - a[1]);

                // Limit to top 30 items to prevent "infinite" chart
                const limitedRows = filteredRows.slice(0, 30);
                if (filteredRows.length > 30) {
                     const othersCount = filteredRows.slice(30).reduce((acc, [,v]) => acc + v, 0);
                     limitedRows.push(['Outros...', othersCount]);
                }

                const labels = limitedRows.map(([prod]) => prod);
                const values = limitedRows.map(([,v]) => v);
                
                chartData = { labels, datasets: [{ label: 'Estoque Total (Todas as Frentes)', data: values, backgroundColor: '#9C27B0' }] };
                chartOpts = { ...chartOpts, indexAxis: 'y' };
            } else {
                const f = this.estoqueFilters.frente;
                const byProd = estoqueMap[f] || {};
                const rows = Object.entries(byProd);
                const filteredRows = this.estoqueFilters.produto ? rows.filter(([prod]) => prod.toLowerCase().includes(this.estoqueFilters.produto.toLowerCase())) : rows;
                
                // Sort by quantity desc
                filteredRows.sort((a,b) => b[1] - a[1]);

                // Limit to top 30 items
                const limitedRows = filteredRows.slice(0, 30);
                if (filteredRows.length > 30) {
                     const othersCount = filteredRows.slice(30).reduce((acc, [,v]) => acc + v, 0);
                     limitedRows.push(['Outros...', othersCount]);
                }

                const labels = limitedRows.map(([prod]) => prod);
                const values = limitedRows.map(([,v]) => v);
                
                chartData = { labels, datasets: [{ label: `Estoque - ${f}`, data: values, backgroundColor: '#9C27B0' }] };
                chartOpts = { ...chartOpts, indexAxis: 'y' };
            }
            
            // Só cria o gráfico se houver dados, senão apenas loga (ou mostra vazio se preferir, mas sem dados evita loop de render)
            if (chartData && chartData.labels && chartData.labels.length > 0) {
                this._charts.estoqueFrente = new Chart(ctx, { type: 'bar', data: chartData, options: chartOpts });
            } else {
                // Se não houver dados, podemos mostrar uma mensagem ou deixar em branco, mas garantindo que o chart anterior foi destruído (já feito acima)
            }
        }

        // === TABLE RENDER ===
        const tbody = document.getElementById('estoque-table-body');
        if (tbody) {
            // Filtrar lista
            const currentFilter = document.getElementById('estoque-frente-filter')?.value || 'all';
            
            let filteredList = estoqueList.filter(item => {
                const matchFrente = currentFilter === 'all' || item.frente === currentFilter;
                const matchProd = !this.estoqueFilters.produto || item.produto.toLowerCase().includes(this.estoqueFilters.produto.toLowerCase());
                return matchFrente && matchProd;
            });
            
            // Ordenar
            filteredList.sort((a,b) => {
                // Ordenar por data (mais recente primeiro), depois frente, depois produto
                const dateA = a.data_cadastro ? new Date(a.data_cadastro) : new Date(0);
                const dateB = b.data_cadastro ? new Date(b.data_cadastro) : new Date(0);
                return (dateB - dateA) || a.frente.localeCompare(b.frente) || a.produto.localeCompare(b.produto);
            });

            if (filteredList.length === 0) {
                 tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum registro de estoque encontrado.</td></tr>';
            } else {
                tbody.innerHTML = filteredList.map(r => {
                    const qtd = parseFloat(r.quantidade) || 0;
                    return `
                    <tr>
                        <td>${this.ui.formatDateBR(r.data_cadastro)}</td>
                        <td>${r.os_numero || '-'}</td>
                        <td>${r.frente}</td>
                        <td>${r.produto}</td>
                        <td>${this.ui.formatNumber(qtd, 3)}</td>
                        <td><button class="btn btn-delete-estoque" data-frente="${r.frente}" data-produto="${r.produto}">🗑️ Excluir</button></td>
                    </tr>
                `}).join('');
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

InsumosApp.prototype.updateGemasPercent = function() {
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

InsumosApp.prototype.updateMudasPercent = function() {
    const totalEl = document.getElementById('qual-mudas-total');
    const bonsEl = document.getElementById('qual-mudas-boas');
    const ruinsEl = document.getElementById('qual-mudas-ruins');
    const bonsPctEl = document.getElementById('qual-mudas-boas-pct');
    const ruinsPctEl = document.getElementById('qual-mudas-ruins-pct');
    const amostraEl = document.getElementById('qual-mudas-amostra');
    const mediaEl = document.getElementById('qual-mudas-media');

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
    
    if (!produto) { this.ui.showNotification('Selecione o produto', 'warning'); return; }
    
    let doseReal = 0;
    if (areaDia > 0) {
        doseReal = qtdTotal / areaDia;
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
        qtdTotal: qtdTotal
    });
    this.renderInsumosDraft();
    
    // Limpar campos
    ['insumo-produto', 'insumo-dose-prevista', 'insumo-qtd-total'].forEach(id => { 
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
        
        // Se tiver qtdTotal armazenado, recalcula doseReal com base na área atual
        if (r.qtdTotal !== undefined) {
             gasto = r.qtdTotal;
             if (areaDia > 0) {
                 doseReal = r.qtdTotal / areaDia;
             } else {
                 doseReal = 0;
             }
             // Atualiza o objeto draft para manter consistência se salvar depois
             r.doseRealizada = doseReal; 
        } else {
             // Compatibilidade com registros antigos
             gasto = r.doseRealizada * areaDia;
        }

        const previsto = r.dosePrevista * areaDia;
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
            <td>${this.ui.formatNumber(previsto||0, 3)}</td>
            <td>${this.ui.formatNumber(gasto||0, 3)}</td>
            <td><button class="btn btn-sm btn-delete-insumo-row" data-idx="${idx}" style="color:red;">🗑️</button></td>
        </tr>
    `}).join('');

    const totalEl = document.getElementById('insumos-total-gasto');
    if (totalEl) {
        totalEl.innerHTML = `
            <div>Total Gasto no Dia: ${this.ui.formatNumber(totalGasto||0, 3)}</div>
            <div style="color: #666; font-size: 0.9em; margin-top: 5px;">Total Previsto Dia: ${this.ui.formatNumber(totalPrevistoDia||0, 3)}</div>
        `;
    }
};

InsumosApp.prototype.loadProdutosDatalist = async function() {
    try {
        const frenteKey = document.getElementById('single-frente')?.value || '';
        const osKey = document.getElementById('single-os')?.value || '';
        let osProdutos = [];
        
        console.log(`[loadProdutosDatalist] Frente: ${frenteKey}, OS: ${osKey}`);

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
        
        const select = document.getElementById('insumo-produto');
        if (select) {
            select.innerHTML = '<option value="">Selecione o produto...</option>' + 
                               osProdutos.map(p => `<option value="${p}">${p}</option>`).join('');
        }
    } catch (e) {
        console.error('Erro ao carregar produtos para select:', e);
    }
};

InsumosApp.prototype.toggleOperacaoSections = function() {
    const tipo = document.getElementById('tipo-operacao')?.value || 'plantio';
    
    const secGemas = document.getElementById('sec-gemas');
    const secToletes = document.getElementById('sec-toletes');
    const secMudas = document.getElementById('sec-mudas');
    const secOutros = document.getElementById('sec-outros');
    
    if (tipo === 'plantio') {
        if (secGemas) secGemas.style.display = 'block';
        if (secToletes) secToletes.style.display = 'block';
        if (secOutros) secOutros.style.display = 'block';
        if (secMudas) secMudas.style.display = 'none';
    } else { // colheita_muda
        if (secGemas) secGemas.style.display = 'none';
        if (secToletes) secToletes.style.display = 'none';
        if (secOutros) secOutros.style.display = 'none';
        if (secMudas) secMudas.style.display = 'block';
    }
};

InsumosApp.prototype.resetPlantioForm = function() {
    this.currentPlantioId = null;
    this.plantioInsumosDraft = [];
    this.renderInsumosDraft();

    const tipoOp = document.getElementById('tipo-operacao');
    if (tipoOp) {
        tipoOp.value = 'plantio';
        this.toggleOperacaoSections();
    }

    const ids = [
        'plantio-data', 'plantio-responsavel', 'plantio-obs',
        'qual-toletes-total', 'qual-toletes-bons', 'qual-toletes-ruins', 'qual-toletes-amostra',
        'qual-gemas-total', 'qual-gemas-boas', 'qual-gemas-ruins', 'qual-gemas-amostra', 'qual-gemas-media',
        'qual-mudas-total', 'qual-mudas-boas', 'qual-mudas-ruins', 'qual-mudas-amostra', 'qual-mudas-media',
        'qual-muda', 'qual-profundidade', 'qual-cobertura', 'qual-alinhamento', 'chuva-mm',
        'oxifertil-dose', 'cobricao-dia', 'cobricao-acumulada',
        'muda-consumo-total', 'muda-consumo-acumulado', 'muda-consumo-dia', 'muda-previsto',
        'muda-liberacao-fazenda', 'muda-variedade',
        'single-frente', 'single-fazenda', 'single-cod', 'single-regiao',
        'single-area', 'single-plantada', 'single-area-total', 'single-area-acumulada', 'single-plantio-dia'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const saveBtn = document.getElementById('plantio-save-btn');
    if (saveBtn) saveBtn.textContent = '💾 Registrar Dia';

    this.updateToletesPercent();
    this.updateGemasPercent();
    this.updateMudasPercent();
};

InsumosApp.prototype.handleEditPlantio = function(id) {
    if (!this.plantioDia) return;
    const record = this.plantioDia.find(r => String(r.id) === String(id));
    if (!record) return;

    this.resetPlantioForm();
    this.currentPlantioId = record.id;
    console.log('Editando Plantio:', record);

    const saveBtn = document.getElementById('plantio-save-btn');
    if (saveBtn) saveBtn.textContent = '💾 Salvar Alterações';

    // Campos Gerais
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

    set('plantio-data', record.data);
    set('plantio-responsavel', record.responsavel);
    set('plantio-obs', record.observacoes);

    // Qualidade
    const q = record.qualidade || {};
    set('qual-toletes-total', q.toletesTotal);
    set('qual-toletes-bons', q.toletesBons);
    set('qual-toletes-ruins', q.toletesRuins);
    set('qual-toletes-amostra', q.toletesAmostra);
    
    set('qual-gemas-total', q.gemasTotal);
    set('qual-gemas-boas', q.gemasBoas);
    set('qual-gemas-ruins', q.gemasRuins);
    set('qual-gemas-amostra', q.gemasAmostra);
    set('qual-gemas-media', q.gemasMedia);

    set('qual-mudas-total', q.mudasTotal);
    set('qual-mudas-boas', q.mudasBoas);
    set('qual-mudas-ruins', q.mudasRuins);
    set('qual-mudas-amostra', q.mudasAmostra);
    set('qual-mudas-media', q.mudasMedia);

    set('qual-muda', q.mudaTonHa);
    set('qual-profundidade', q.profundidadeCm);
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
    set('muda-variedade', q.mudaVariedade);

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
};

InsumosApp.prototype.savePlantioDia = async function() {
    console.log('Iniciando savePlantioDia...');
    const data = document.getElementById('plantio-data')?.value;
    const responsavel = document.getElementById('plantio-responsavel')?.value;
    const observacoes = document.getElementById('plantio-obs')?.value || '';
    const toletesTotalVal = parseFloat(document.getElementById('qual-toletes-total')?.value || '0');
    const toletesBonsVal = parseFloat(document.getElementById('qual-toletes-bons')?.value || '0');
    const toletesRuinsVal = parseFloat(document.getElementById('qual-toletes-ruins')?.value || '0');
    const toletesBonsPctVal = toletesTotalVal > 0 ? (toletesBonsVal / toletesTotalVal) * 100 : 0;
    const toletesRuinsPctVal = toletesTotalVal > 0 ? (toletesRuinsVal / toletesTotalVal) * 100 : 0;

    const gemasTotalVal = parseFloat(document.getElementById('qual-gemas-total')?.value || '0');
    const gemasBoasVal = parseFloat(document.getElementById('qual-gemas-boas')?.value || '0');
    const gemasRuinsVal = parseFloat(document.getElementById('qual-gemas-ruins')?.value || '0');
    const gemasBoasPctVal = gemasTotalVal > 0 ? (gemasBoasVal / gemasTotalVal) * 100 : 0;
    const gemasRuinsPctVal = gemasTotalVal > 0 ? (gemasRuinsVal / gemasTotalVal) * 100 : 0;

    const mudasTotalVal = parseFloat(document.getElementById('qual-mudas-total')?.value || '0');
    const mudasBoasVal = parseFloat(document.getElementById('qual-mudas-boas')?.value || '0');
    const mudasRuinsVal = parseFloat(document.getElementById('qual-mudas-ruins')?.value || '0');
    const mudasBoasPctVal = mudasTotalVal > 0 ? (mudasBoasVal / mudasTotalVal) * 100 : 0;
    const mudasRuinsPctVal = mudasTotalVal > 0 ? (mudasRuinsVal / mudasTotalVal) * 100 : 0;

    const qualidade = {
        gemasTotal: gemasTotalVal,
        gemasBoas: gemasBoasVal,
        gemasRuins: gemasRuinsVal,
        gemasBoasPct: gemasBoasPctVal,
        gemasRuinsPct: gemasRuinsPctVal,
        gemasOk: gemasBoasVal,
        gemasNok: gemasRuinsVal,
        gemasAmostra: parseFloat(document.getElementById('qual-gemas-amostra')?.value || '0'),
        gemasMedia: parseFloat(document.getElementById('qual-gemas-media')?.value || '0'),

        mudasTotal: mudasTotalVal,
        mudasBoas: mudasBoasVal,
        mudasRuins: mudasRuinsVal,
        mudasBoasPct: mudasBoasPctVal,
        mudasRuinsPct: mudasRuinsPctVal,
        mudasAmostra: parseFloat(document.getElementById('qual-mudas-amostra')?.value || '0'),
        mudasMedia: parseFloat(document.getElementById('qual-mudas-media')?.value || '0'),

        toletesTotal: toletesTotalVal,
        toletesBons: toletesBonsVal,
        toletesRuins: toletesRuinsVal,
        toletesBonsPct: toletesBonsPctVal,
        toletesRuinsPct: toletesRuinsPctVal,
        toletesAmostra: parseFloat(document.getElementById('qual-toletes-amostra')?.value || '0'),
        toletesMedia: parseFloat(document.getElementById('qual-toletes-media')?.value || '0'),
        mudaTonHa: parseFloat(document.getElementById('qual-muda')?.value || '0'),
        profundidadeCm: parseFloat(document.getElementById('qual-profundidade')?.value || '0'),
        cobertura: document.getElementById('qual-cobertura')?.value || '',
        alinhamento: document.getElementById('qual-alinhamento')?.value || '',
        chuvaMm: parseFloat(document.getElementById('chuva-mm')?.value || '0'),
        gps: !!document.getElementById('plantio-gps')?.checked,
        oxifertilDose: parseFloat(document.getElementById('oxifertil-dose')?.value || '0'),
        cobricaoDia: parseFloat(document.getElementById('cobricao-dia')?.value || '0'),
        cobricaoAcumulada: parseFloat(document.getElementById('cobricao-acumulada')?.value || '0'),
        mudaConsumoTotal: parseFloat(document.getElementById('muda-consumo-total')?.value || '0'),
        mudaConsumoAcumulado: parseFloat(document.getElementById('muda-consumo-acumulado')?.value || '0'),
        mudaConsumoDia: parseFloat(document.getElementById('muda-consumo-dia')?.value || '0'),
        mudaPrevisto: parseFloat(document.getElementById('muda-previsto')?.value || '0'),
        mudaLiberacaoFazenda: document.getElementById('muda-liberacao-fazenda')?.value || '',
        mudaVariedade: document.getElementById('muda-variedade')?.value || ''
    };
    let fazendaNome = document.getElementById('single-fazenda')?.value || '';
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
        area: parseFloat(document.getElementById('single-area')?.value || '0'),
        plantada: parseFloat(document.getElementById('single-plantada')?.value || '0'),
        areaTotal: parseFloat(document.getElementById('single-area-total')?.value || '0'),
        areaAcumulada: parseFloat(document.getElementById('single-area-acumulada')?.value || '0'),
        plantioDiario: parseFloat(document.getElementById('single-plantio-dia')?.value || '0')
    };
    const payload = {
        data, responsavel, observacoes,
        frentes: [frente],
        insumos: this.plantioInsumosDraft.slice(),
        qualidade
    };
    
    try {
        let res;
        if (this.currentPlantioId) {
            console.log('Atualizando registro:', this.currentPlantioId);
            res = await this.api.updatePlantioDia(this.currentPlantioId, payload);
        } else {
            console.log('Criando novo registro');
            res = await this.api.addPlantioDia(payload);
        }

        if (res && res.success) {
            this.ui.showNotification(this.currentPlantioId ? 'Registro atualizado' : 'Dia de plantio registrado', 'success', 1500);
            
            if (frente.cod) {
                try {
                    await this.api.updateFazenda(frente.cod, {
                        plantioAcumulado: frente.areaAcumulada,
                        mudaAcumulada: qualidade.mudaConsumoAcumulado,
                        cobricaoAcumulada: qualidade.cobricaoAcumulada
                    });
                    // Atualiza cache de fazendas
                    const cadResp = await this.api.getFazendas();
                    if (cadResp && cadResp.success && Array.isArray(cadResp.data)) {
                        this.renderCadastroFazendas(cadResp.data);
                    }
                } catch(e) { console.error('Erro ao atualizar fazenda:', e); }
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
            // Atualizar dashboard para refletir novos dados
            this.loadDashboard();
            
            const modal = document.getElementById('novo-lancamento-modal');
            if (modal) modal.style.display = 'none';
        } else {
            console.error('Erro na resposta da API:', res);
            this.ui.showNotification('Erro ao registrar', 'error');
        }
    } catch(e) { 
        console.error('Exceção ao salvar plantio:', e);
        this.ui.showNotification('Erro ao registrar', 'error'); 
    }
};

InsumosApp.prototype.saveViagemAdubo = async function() {
    const transportType = this.viagemAduboTransportType || 'adubo';

    const data = document.getElementById('viagem-data')?.value || '';
    const frente = document.getElementById('viagem-frente')?.value || '';
    const fazenda = document.getElementById('viagem-fazenda')?.value || '';
    const origem = document.getElementById('viagem-origem')?.value || '';
    const destino = document.getElementById('viagem-destino')?.value || '';
    
    // Conditional Fields
    let produto = document.getElementById('viagem-produto')?.value || '';
    let unidade = document.getElementById('viagem-unidade')?.value || '';
    if (transportType === 'composto') {
        produto = 'COMPOSTO';
        unidade = 't';
    }

    const quantidadeRaw = document.getElementById('viagem-quantidade-total')?.value || '';
    
    const caminhao = document.getElementById('viagem-caminhao')?.value || '';
    const carreta1 = document.getElementById('viagem-carreta1')?.value || '';
    const carreta2 = document.getElementById('viagem-carreta2')?.value || '';
    const motorista = document.getElementById('viagem-motorista')?.value || '';
    const documentoMotorista = document.getElementById('viagem-documento-motorista')?.value || '';
    const transportadora = document.getElementById('viagem-transportadora')?.value || '';
    const observacoes = document.getElementById('viagem-observacoes')?.value || '';
    
    // Novos campos Composto
    const numeroOS = document.getElementById('viagem-os')?.value || '';
    const dataAberturaOS = document.getElementById('viagem-abertura-os')?.value || '';
    const dataFechamentoOS = document.getElementById('viagem-fechamento-os')?.value || '';
    const totalPrevisto = document.getElementById('viagem-previsto')?.value || '';
    const totalRealizado = document.getElementById('viagem-realizado')?.value || '';

    if (!data || !produto) {
        this.ui.showNotification('Informe data e produto da viagem', 'warning');
        return;
    }
    const quantidadeVal = quantidadeRaw ? parseFloat(quantidadeRaw) : 0;
    const quantidadeTotal = isNaN(quantidadeVal) ? 0 : quantidadeVal;
    
    const payload = {
        transportType,
        data,
        frente,
        fazenda,
        origem,
        destino,
        produto,
        quantidadeTotal,
        unidade,
        caminhao,
        carreta1,
        carreta2,
        motorista,
        documentoMotorista,
        transportadora,
        observacoes,
        bags: (transportType === 'adubo' && Array.isArray(this.viagensAduboBagsDraft)) ? this.viagensAduboBagsDraft.slice() : [],
        // Novos campos
        numeroOS,
        dataAberturaOS,
        dataFechamentoOS,
        totalPrevisto: totalPrevisto ? parseFloat(totalPrevisto) : null,
        totalRealizado: totalRealizado ? parseFloat(totalRealizado) : null
    };
    try {
        const res = await this.api.addViagemAdubo(payload);
        if (res && res.success) {
            this.ui.showNotification('Viagem de adubo registrada', 'success', 1500);
            this.viagensAduboBagsDraft = [];
            if (typeof this.renderBagsDraft === 'function') this.renderBagsDraft();
            const ids = [
                'viagem-data',
                'viagem-frente',
                'viagem-fazenda',
                'viagem-origem',
                'viagem-destino',
                'viagem-produto',
                'viagem-quantidade-total',
                'viagem-unidade',
                'viagem-caminhao',
                'viagem-carreta1',
                'viagem-carreta2',
                'viagem-motorista',
                'viagem-documento-motorista',
                'viagem-transportadora',
                'viagem-observacoes',
                'viagem-os',
                'viagem-abertura-os',
                'viagem-fechamento-os',
                'viagem-previsto',
                'viagem-realizado'
            ];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            await this.loadViagensAdubo();
        } else {
            this.ui.showNotification('Erro ao registrar viagem', 'error');
        }
    } catch(e) {
        this.ui.showNotification('Erro ao registrar viagem', 'error');
    }
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
    const gpsSel = document.getElementById('plantio-gps');
    const qualidade = { gps: (gpsSel && gpsSel.value === 'Sim') ? 'Sim' : 'Não' };
    if (qualidade.gps === 'Sim') {
        qualidade.gps_lat = document.getElementById('gps-lat')?.value || '';
        qualidade.gps_lon = document.getElementById('gps-lon')?.value || '';
        qualidade.gps_alt = document.getElementById('gps-alt')?.value ? parseFloat(document.getElementById('gps-alt')?.value) : undefined;
    }
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
    const nome = document.getElementById('register-name')?.value || '';
    const matricula = document.getElementById('register-matricula')?.value || '';

    if (!u || !p) { this.ui.showNotification('Informe novo usuário e senha', 'warning'); return; }
    try {
        const res = await this.api.register(u, p, { nome, matricula });
        if (res && res.success) {
            this.ui.showNotification('Conta criada e login efetuado', 'success', 1500);
            this.hideLoginScreen();
            this.updateCurrentUserUI();
            await this.loadInitialData();
        } else {
            this.ui.showNotification('Erro ao criar conta: ' + (res.message||''), 'error');
        }
    } catch(e) { this.ui.showNotification('Erro ao criar conta', 'error'); }
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

InsumosApp.prototype.updateLoginStatus = function() {
};
InsumosApp.prototype.updateCurrentUserUI = function() {
    const el = document.getElementById('current-user');
    let u = null;
    if (this.api && this.api.user) {
        if (this.api.user.user_metadata && this.api.user.user_metadata.nome) {
            u = this.api.user.user_metadata.nome;
        } else if (this.api.user.email) {
            u = this.api.user.email;
        } else if (this.api.user.username) {
            u = this.api.user.username;
        }
    }

    if (el) {
        if (u) { el.style.display = 'inline-block'; el.textContent = `👤 ${u}`; }
        else { el.style.display = 'none'; el.textContent = ''; }
    }
};
InsumosApp.prototype.showLoginScreen = function() {
    const el = document.getElementById('login-screen');
    if (el) el.style.display = 'flex';
    const registerArea = document.getElementById('register-area');
    const loginGrid = document.querySelector('#login-screen .form-grid.boletim-grid');
    const loginButton = document.getElementById('login-btn');
    const regToggle = document.getElementById('login-register-toggle');
    if (registerArea) registerArea.style.display = 'none';
    if (loginGrid) loginGrid.style.display = 'grid';
    if (loginButton) loginButton.style.display = 'inline-block';
    if (regToggle) regToggle.textContent = 'Cadastrar';
};
InsumosApp.prototype.hideLoginScreen = function() { const el = document.getElementById('login-screen'); if (el) el.style.display = 'none'; };

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
        
        <div class="report-footer" style="margin-top: 50px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 0.8em; text-align: center; color: #777;">
            <p>Sistema de Gestão Agrícola - Relatório Impresso</p>
        </div>
    `;

    container.innerHTML = html;

    // Pequeno delay para renderização do DOM antes de imprimir
    setTimeout(() => {
        window.print();
    }, 500);
};
