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
        this.viagensAduboFilters = {
            data: '',
            fazenda: '',
            frente: '',
            motorista: '',
            caminhao: '',
            lacre: ''
        };

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
        if (!this.cadastroFazendas) {
            if (this.fazendaIndex && this.fazendaIndex.byName) {
                const info = this.fazendaIndex.byName[name];
                if (info) return { ...info, codigo: info.cod, nome: name };
            }
            return null;
        }

        const normalizedName = name.trim().toLowerCase();
        
        // Estratégia 1: Match exato ou case insensitive
        let found = this.cadastroFazendas.find(f => (f.nome || '').trim().toLowerCase() === normalizedName);
        if (found) return found;

        // Estratégia 2: O nome procurado contém o código (ex: "123 - Fazenda") e no cadastro é só "Fazenda"
        const matchCod = normalizedName.match(/^(\d+)\s*[-–]\s*(.+)$/);
        if (matchCod) {
            const nomeSemCod = matchCod[2].trim();
            // Tenta achar pelo nome limpo
            found = this.cadastroFazendas.find(f => (f.nome || '').trim().toLowerCase() === nomeSemCod);
            if (found) return found;

            // Tenta achar pelo código
            const codExt = parseInt(matchCod[1]);
            found = this.cadastroFazendas.find(f => parseInt(f.codigo) === codExt);
            if (found) return found;
        }

        // Estratégia 3: O nome no cadastro contém código ("123 - Fazenda") e procuramos "Fazenda"
        found = this.cadastroFazendas.find(f => {
            const fNome = (f.nome || '').trim().toLowerCase();
            const match = fNome.match(/^\d+\s*[-–]\s*(.+)$/);
            return match && match[1].trim() === normalizedName;
        });
        
        if (found) return found;

        // Estratégia 4: Busca parcial (contém)
        found = this.cadastroFazendas.find(f => (f.nome || '').trim().toLowerCase().includes(normalizedName) || normalizedName.includes((f.nome || '').trim().toLowerCase()));

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
            btnNovoLancamento.addEventListener('click', () => {
                novoLancamentoModal.style.display = 'flex';
            });
        }

        closeNovoLancamentoButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (novoLancamentoModal) novoLancamentoModal.style.display = 'none';
            });
        });

        if (novoLancamentoModal) {
            window.addEventListener('click', (e) => {
                if (e.target === novoLancamentoModal) {
                    novoLancamentoModal.style.display = 'none';
                }
            });
        }

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
        this.setupOSListeners();
        console.log('setupEventListeners completed');
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
                 if (btnEdit) {
                     const numero = btnEdit.getAttribute('data-numero');
                     this.handleEditOS(numero);
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

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (response.ok) {
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
                console.error('Erro HTTP Gemini:', response.status, response.statusText);
                this.ui.showNotification('Erro na análise do documento.', 'error');
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
        const canvas = document.getElementById('chart-plantio-diario');
        if (!canvas) return;

        // Dados base
        const data = this.insumosFazendasData || [];
        const metas = this.metasData || [];

        // Filtro de frente
        const filterFrente = document.getElementById('plantio-chart-frente')?.value || 'all';
        
        // Processamento: Agrupar por data e frente
        const diario = {}; 
        const frentesSet = new Set();
        const datesSet = new Set();

        data.forEach(item => {
            // Considerar apenas itens com área aplicada e data
            // E opcionalmente filtrar por 'PLANTIO' se houver campo de processo/atividade
            // Como não tenho certeza do filtro 'PLANTIO', vou usar tudo que tem areaTotalAplicada > 0
            if (!item.dataInicio || !item.areaTotalAplicada) return;
            
            const dataKey = item.dataInicio.split('T')[0]; // YYYY-MM-DD
            const frente = item.frente || 'Geral';

            if (filterFrente !== 'all' && frente !== filterFrente) return;

            if (!diario[dataKey]) diario[dataKey] = {};
            if (!diario[dataKey][frente]) diario[dataKey][frente] = 0;
            
            diario[dataKey][frente] += parseFloat(item.areaTotalAplicada);
            frentesSet.add(frente);
            datesSet.add(dataKey);
        });

        // Ordenar datas
        const dates = Array.from(datesSet).sort();
        // Se quiser limitar aos últimos 30 dias:
        // const dates = Array.from(datesSet).sort().slice(-30);

        const frentes = Array.from(frentesSet).sort();

        // Datasets
        const datasets = [];
        const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#34495e', '#1abc9c', '#e67e22'];

        frentes.forEach((frente, index) => {
            const color = colors[index % colors.length];
            
            // Dados de Realizado (Barras)
            const dataPoints = dates.map(d => diario[d] && diario[d][frente] ? diario[d][frente] : 0);
            
            datasets.push({
                label: `Realizado - ${frente}`,
                data: dataPoints,
                backgroundColor: color,
                borderColor: color,
                borderWidth: 1,
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
                    borderColor: color, // Mesma cor da barra
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
                    const [y, m, day] = d.split('-');
                    return `${day}/${m}`;
                }),
                datasets: datasets
            },
            options: {
                responsive: true,
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
                                    label += context.parsed.y.toFixed(2) + ' ha';
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
        console.log('setupLegacyListeners started');
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
            const togglePlantioBtn = e.target.closest('.btn-toggle-plantio-details');
            const delBagRowBtn = e.target.closest('.btn-delete-bag-row');
            const viewViagemBtn = e.target.closest('.btn-view-viagem-adubo');
            const delViagemBtn = e.target.closest('.btn-delete-viagem-adubo');
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

        const singlePlantioDia = document.getElementById('single-plantio-dia');
        const mudaConsumoDia = document.getElementById('muda-consumo-dia');
        const cobricaoDia = document.getElementById('cobricao-dia');
        if (singlePlantioDia) singlePlantioDia.addEventListener('input', () => this.updateAccumulatedStats());
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
            singleFrente.addEventListener('change', () => {
                const val = singleFrente.value;
                if (singleOs) {
                    singleOs.innerHTML = '<option value="">Selecione a OS</option>';
                    if (val && this.osListCache) {
                        const osList = this.osListCache.filter(o => o.frente === val);
                        osList.forEach(os => {
                            const opt = document.createElement('option');
                            opt.value = os.numero;
                            opt.textContent = `${os.numero} - ${os.fazenda || 'Sem Fazenda'}`;
                            singleOs.appendChild(opt);
                        });
                    }
                }
            });
        }

        if (singleOs) {
            singleOs.addEventListener('change', () => {
                const val = singleOs.value;
                if (!val || !this.osListCache) return;
                
                const os = this.osListCache.find(o => String(o.numero) === String(val));
                if (os) {
                    // Preencher Responsável
                    const respEl = document.getElementById('plantio-responsavel');
                    if (respEl && os.respAplicacao) respEl.value = os.respAplicacao;
                    
                    // Preencher Área Total
                    const areaEl = document.getElementById('single-area');
                    if (areaEl && os.areaTotal) areaEl.value = os.areaTotal;

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
                        // Tentar encontrar no cadastro para ter o objeto completo e acumulados
                        const fazendaObj = this.findFazendaByName(targetFazenda);

                        if (fazendaObj) {
                            // Se achou no cadastro, aplica os dados (incluindo acumulados)
                            this.applyCadastroFazendaToPlantio(fazendaObj);
                            
                            // IMPORTANTE: Restaurar a Região/Setor da OS se ela existir, 
                            // pois a OS pode ser específica de um setor e o cadastro ser genérico
                            if (regiaoEl && os.setor) {
                                regiaoEl.value = os.setor;
                            }
                        } else {
                            // Fallback: Cadastro não encontrado, preencher manualmente o possível
                            
                            // Tentar extrair código do nome da fazenda na OS (ex: "123 - Fazenda X")
                            const matchCod = targetFazenda.match(/^(\d+)\s*[-–]\s*(.+)$/);
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
                                    
                                    // Match parcial se tiver código na OS e não no select
                                    if (matchCod) {
                                        const nomeSemCod = matchCod[2].trim().toLowerCase();
                                        if (optText === nomeSemCod || optVal === nomeSemCod) {
                                            fazendaEl.selectedIndex = i;
                                            foundInSelect = true;
                                            break;
                                        }
                                    }
                                }
                                
                                // Se não achou no select e o select for editável ou apenas visual, 
                                // não podemos forçar valor que não existe no select padrão HTML.
                                // Mas podemos tentar setar value se for um input texto disfarçado (não é, é select).
                            }
                        }
                    }
                    
                    this.ui.showNotification('Dados da OS preenchidos.', 'info', 1500);
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

            try {
                const fazendasResponse = await this.api.getFazendas();
                if (fazendasResponse.success) {
                    const list = Array.isArray(fazendasResponse.data) ? fazendasResponse.data : [];
                    const nomes = list.map(f => (typeof f === 'string') ? f : (f.nome || f.codigo)).filter(Boolean);
                    this.ui.populateSelect(
                        document.getElementById('fazenda-insumos-filter'),
                        nomes,
                        'Todas as Fazendas'
                    );
                    const viagemFazSelect = document.getElementById('viagem-fazenda');
                    if (viagemFazSelect) {
                        viagemFazSelect.innerHTML = '<option value=\"\">Selecione a Fazenda</option>';
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
                }
            } catch(e) {}

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

            try {
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
            } catch (e) {}
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
        } else if (tabName === 'viagens-adubo') {
            await this.loadViagensAdubo();
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
        const resumoFrentes = (r.frentes||[]).map(f => `${f.frente}: ${f.fazenda||'—'}${f.regiao?(' / '+f.regiao):''}`).join(' | ');
            const expanded = this.plantioExpanded.has(String(r.id));
            const details = expanded ? this.getPlantioDetailsHTML(r) : '';
            const toggleText = expanded ? 'Ocultar detalhes' : 'Ver detalhes';
            return `
            <tr>
                <td>${this.ui.formatDateBR(r.data)}</td>
                <td>${resumoFrentes || '—'}</td>
                <td>${this.ui.formatNumber(sumArea)}</td>
                
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
                <td>${f.regiao||'—'}</td>
                <td>${this.ui.formatNumber(f.area||0)}</td>
                <td>${this.ui.formatNumber(f.plantada||0)}</td>
                <td>${this.ui.formatNumber(f.areaAcumulada||0)}</td>
                <td>${this.ui.formatNumber(f.areaTotal||0)}</td>
                <td>${this.ui.formatNumber(f.plantioDiario||0)}</td>
                <td>${this.ui.formatNumber(f.areaAcumulada||0)}</td>
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
                        <thead><tr><th>Frente</th><th>Fazenda</th><th>Cód</th><th>Região</th><th>Área total (ha)</th><th>Área plantada (ha)</th><th>Área total acumulada (ha)</th><th>Plantio total (ha)</th><th>Plantio diário (ha)</th><th>Plantio acumulado (ha)</th></tr></thead>
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
                    <h5>Qualidade / Condições</h5>
                    <div class="quality-block">
                        <div>Gemas totais: ${this.ui.formatNumber(q.gemasTotal||0)}</div>
                        <div>Gemas boas: ${this.ui.formatNumber(q.gemasBoas||0)} (${this.ui.formatNumber(q.gemasBoasPct||0,2)}%)</div>
                        <div>Gemas ruins: ${this.ui.formatNumber(q.gemasRuins||0)} (${this.ui.formatNumber(q.gemasRuinsPct||0,2)}%)</div>
                        <div>Toletes totais: ${this.ui.formatNumber(q.toletesTotal||0)}</div>
                        <div>Toletes bons: ${this.ui.formatNumber(q.toletesBons||0)} (${this.ui.formatNumber(q.toletesBonsPct||0,2)}%)</div>
                        <div>Toletes ruins: ${this.ui.formatNumber(q.toletesRuins||0)} (${this.ui.formatNumber(q.toletesRuinsPct||0,2)}%)</div>
                        <div>Mudas totais: ${this.ui.formatNumber(q.mudasTotal||0)}</div>
                        <div>Mudas boas: ${this.ui.formatNumber(q.mudasBoas||0)} (${this.ui.formatNumber(q.mudasBoasPct||0,2)}%)</div>
                        <div>Mudas ruins: ${this.ui.formatNumber(q.mudasRuins||0)} (${this.ui.formatNumber(q.mudasRuinsPct||0,2)}%)</div>
                        <div>Muda (ton/ha): ${this.ui.formatNumber(q.mudaTonHa||0)}</div>
                        <div>Profundidade (cm): ${this.ui.formatNumber(q.profundidadeCm||0)}</div>
                        <div>Cobertura: ${q.cobertura||'—'}</div>
                        <div>Alinhamento: ${q.alinhamento||'—'}</div>
                        <div>Chuva (mm): ${this.ui.formatNumber(q.chuvaMm||0,1)}</div>
                        <div>GPS: ${q.gps? 'Sim':'Não'}</div>
                        
                        <div>Cobrição (dia): ${this.ui.formatNumber(q.cobricaoDia||0,2)}</div>
                        <div>Cobrição (acum.): ${this.ui.formatNumber(q.cobricaoAcumulada||0,2)}</div>
                        <div>Consumo total de muda: ${this.ui.formatNumber(q.mudaConsumoTotal||0,2)}</div>
                        <div>Consumo acumulado: ${this.ui.formatNumber(q.mudaConsumoAcumulado||0,2)}</div>
                        <div>Consumo total do dia: ${this.ui.formatNumber(q.mudaConsumoDia||0,2)}</div>
                        <div>Previsto das mudas: ${this.ui.formatNumber(q.mudaPrevisto||0,2)}</div>
                        <div>Liberação fazenda: ${q.mudaLiberacaoFazenda||'—'}</div>
                        <div>Variedade: ${q.mudaVariedade||'—'}</div>
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
        if (!tbody) return;
        const filters = this.viagensAduboFilters || {};
        let data = Array.isArray(this.viagensAdubo) ? [...this.viagensAdubo] : [];
        const norm = (v) => (v == null ? '' : String(v)).toLowerCase();
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
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="loading">Nenhuma viagem encontrada</td>
                </tr>
            `;
            return;
        }
        tbody.innerHTML = data.map(v => {
            const q = v.quantidadeTotal != null ? v.quantidadeTotal : (v.quantidade_total != null ? v.quantidade_total : 0);
            const qtd = typeof q === 'number' ? q : parseFloat(q) || 0;
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
    // Tentar remover código do início do nome (ex: "1387 - Fazenda X" -> "Fazenda X")
    // O usuário relatou que o código está aparecendo junto com o nome
    const matchCod = fazendaNome.match(/^(\d+)\s*[-–]\s*(.+)$/);
    let codExtraido = null;
    if (matchCod) {
        codExtraido = parseInt(matchCod[1]);
        fazendaNome = matchCod[2].trim();
    }

    const frenteKey = document.getElementById('single-frente')?.value || '';
    if (!data || !frenteKey) { this.ui.showNotification('Informe data e frente', 'warning'); return; }
    
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
        const res = await this.api.addPlantioDia(payload);
        if (res && res.success) {
            this.ui.showNotification('Dia de plantio registrado', 'success', 1500);
            if (frente.cod) {
                try {
                    await this.api.updateFazenda(frente.cod, {
                        plantioAcumulado: frente.areaAcumulada,
                        mudaAcumulada: qualidade.mudaConsumoAcumulado,
                        cobricaoAcumulada: qualidade.cobricaoAcumulada
                    });
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
                } catch(e) {}
            }
            this.plantioInsumosDraft = [];
            this.renderInsumosDraft();
            ['single-fazenda','single-cod','single-regiao','single-area','single-plantada','single-area-total','single-area-acumulada','single-plantio-dia','cobricao-dia','cobricao-acumulada'].forEach(id=>{ const el=document.getElementById(id); if (el) el.value=''; });
            await this.loadPlantioDia();
        } else {
            this.ui.showNotification('Erro ao registrar', 'error');
        }
    } catch(e) { this.ui.showNotification('Erro ao registrar', 'error'); }
};

InsumosApp.prototype.saveViagemAdubo = async function() {
    const data = document.getElementById('viagem-data')?.value || '';
    const frente = document.getElementById('viagem-frente')?.value || '';
    const fazenda = document.getElementById('viagem-fazenda')?.value || '';
    const origem = document.getElementById('viagem-origem')?.value || '';
    const destino = document.getElementById('viagem-destino')?.value || '';
    const produto = document.getElementById('viagem-produto')?.value || '';
    const quantidadeRaw = document.getElementById('viagem-quantidade-total')?.value || '';
    const unidade = document.getElementById('viagem-unidade')?.value || '';
    const caminhao = document.getElementById('viagem-caminhao')?.value || '';
    const carreta1 = document.getElementById('viagem-carreta1')?.value || '';
    const carreta2 = document.getElementById('viagem-carreta2')?.value || '';
    const motorista = document.getElementById('viagem-motorista')?.value || '';
    const documentoMotorista = document.getElementById('viagem-documento-motorista')?.value || '';
    const transportadora = document.getElementById('viagem-transportadora')?.value || '';
    const observacoes = document.getElementById('viagem-observacoes')?.value || '';
    if (!data || !produto) {
        this.ui.showNotification('Informe data e produto da viagem', 'warning');
        return;
    }
    const quantidadeVal = quantidadeRaw ? parseFloat(quantidadeRaw) : 0;
    const quantidadeTotal = isNaN(quantidadeVal) ? 0 : quantidadeVal;
    const payload = {
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
        bags: Array.isArray(this.viagensAduboBagsDraft) ? this.viagensAduboBagsDraft.slice() : []
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
                'viagem-observacoes'
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
