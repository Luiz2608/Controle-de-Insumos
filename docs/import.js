const columnMapping = {
    'OXIFERTIL': {
        startRow: 1,
        columns: {
            0: 'processo',
            1: 'subprocesso',
            2: 'produto',
            3: 'fazenda',
            4: 'areaTalhao',
            5: 'areaTotalAplicada',
            6: 'doseRecomendada',
            7: 'insumDoseAplicada',
            8: 'quantidadeAplicada',
            9: 'dif',
            10: 'frente'
        }
    },
    'INSUMOS FAZENDAS': {
        startRow: 1,
        columns: {
            0: 'os',
            1: 'cod',
            2: 'fazenda',
            3: 'areaTalhao',
            4: 'areaTotalAplicada',
            5: 'produto',
            6: 'doseRecomendada',
            7: 'insumDoseAplicada',
            8: 'quantidadeAplicada',
            9: 'dif',
            10: 'frente',
            11: 'dataInicio'
        }
    },
    'INSUMOS': {
        startRow: 1,
        columns: {
            0: 'os',
            1: 'cod',
            2: 'fazenda',
            3: 'areaTalhao',
            4: 'areaTotalAplicada',
            5: 'produto',
            6: 'doseRecomendada',
            7: 'insumDoseAplicada',
            8: 'quantidadeAplicada',
            9: 'dif',
            10: 'frente',
            11: 'dataInicio'
        }
    },
    'INSUMOS AGRICOLAS': {
        startRow: 1,
        columns: {
            0: 'os',
            1: 'cod',
            2: 'fazenda',
            3: 'areaTalhao',
            4: 'areaTotalAplicada',
            5: 'produto',
            6: 'doseRecomendada',
            7: 'insumDoseAplicada',
            8: 'quantidadeAplicada',
            9: 'dif',
            10: 'frente',
            11: 'dataInicio'
        }
    },
    'INSUMOS AGRÍCOLAS': {
        startRow: 1,
        columns: {
            0: 'os',
            1: 'cod',
            2: 'fazenda',
            3: 'areaTalhao',
            4: 'areaTotalAplicada',
            5: 'produto',
            6: 'doseRecomendada',
            7: 'insumDoseAplicada',
            8: 'quantidadeAplicada',
            9: 'dif',
            10: 'frente',
            11: 'dataInicio'
        }
    },
    'SANTA IRENE (STEIN)': {
        startRow: 1,
        columns: {
            0: 'cod',
            1: 'fazenda',
            2: 'areaTalhao',
            3: 'areaTotalAplicada',
            4: 'produto',
            5: 'doseRecomendada',
            6: 'insumDoseAplicada',
            7: 'quantidadeAplicada',
            8: 'dif',
            9: 'frente'
        }
    },
    'DANIELA': {
        startRow: 1,
        columns: {
            0: 'cod',
            1: 'fazenda',
            2: 'areaTotal',
            3: 'areaTotalAplicada',
            4: 'produto',
            5: 'doseRecomendada',
            6: 'insumDoseAplicada',
            7: 'quantidadeAplicada',
            8: 'dif',
            9: 'frente'
        }
    }
};

function worksheetToGrid(ws) {
    const ref = ws['!ref'];
    if (!ref) return [];
    const range = XLSX.utils.decode_range(ref);
    const rows = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
        const row = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r, c });
            const cell = ws[addr];
            let val = null;
            if (cell) {
                if (cell.t === 'n' && typeof cell.v === 'number' && cell.z && /[dmy]/i.test(String(cell.z))) {
                    const d = XLSX.SSF.parse_date_code(cell.v);
                    if (d) val = `${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}/${d.y}`;
                } else {
                    val = cell.w != null ? cell.w : cell.v;
                }
            }
            row.push(val);
        }
        rows.push(row);
    }
    const merges = ws['!merges'] || [];
    merges.forEach(m => {
        const top = rows[m.s.r - range.s.r]?.[m.s.c - range.s.c];
        if (top === undefined || top === null || top === '') return;
        for (let r = m.s.r; r <= m.e.r; r++) {
            for (let c = m.s.c; c <= m.e.c; c++) {
                const rr = r - range.s.r;
                const cc = c - range.s.c;
                if (rows[rr]?.[cc] === undefined || rows[rr][cc] === null || rows[rr][cc] === '') {
                    rows[rr][cc] = top;
                }
            }
        }
    });
    return rows;
}

function forwardFillColumns(jsonData, startRow = 0, columnsMapping = {}) {
    if (!Array.isArray(jsonData) || jsonData.length === 0) return;
    const colCount = Math.max(...jsonData.map(r => Array.isArray(r) ? r.length : 0));
    const lastVals = new Array(colCount).fill(undefined);
    const allowedForward = new Set(['os', 'cod', 'fazenda', 'produto', 'processo', 'subprocesso', 'frente', 'dataInicio']);
    const allowedIndexes = new Set(
        Object.entries(columnsMapping)
            .filter(([, field]) => allowedForward.has(field))
            .map(([idx]) => parseInt(idx))
    );
    for (let r = 0; r < jsonData.length; r++) {
        const row = jsonData[r] || [];
        for (let c = 0; c < colCount; c++) {
            if (!allowedIndexes.has(c)) continue;
            const cell = row[c];
            if (r < startRow) {
                if (cell !== undefined && cell !== null && cell !== '') lastVals[c] = cell;
                continue;
            }
            if (cell !== undefined && cell !== null && cell !== '') {
                lastVals[c] = cell;
            } else if (lastVals[c] !== undefined) {
                row[c] = lastVals[c];
            }
        }
    }
}

function processRowByPosition(mapping, row, rowIndex, sheetName) {
    try {
        const item = {
            id: Date.now() + rowIndex,
            _sheet: sheetName,
            _row: rowIndex + 1
        };

        Object.entries(mapping.columns).forEach(([colIndex, fieldName]) => {
            const numColIndex = parseInt(colIndex);
            if (numColIndex < row.length && row[numColIndex] !== undefined && row[numColIndex] !== null && row[numColIndex] !== '') {
                const cellValue = row[numColIndex];

                if (typeof cellValue === 'string') {
                    const trimmed = cellValue.trim();
                    if (trimmed && trimmed !== 'N/A' && trimmed !== '-' && trimmed !== 'NULL') {
                        const textFields = new Set(['produto', 'fazenda', 'processo', 'subprocesso']);
                        if (fieldName.toLowerCase().includes('data')) {
                            const m = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
                            if (m) {
                                item[fieldName] = `${m[1]}/${m[2]}/${m[3]}`;
                            } else {
                                const d = new Date(trimmed);
                                if (!isNaN(d)) {
                                    const dd = String(d.getDate()).padStart(2, '0');
                                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                                    const yyyy = d.getFullYear();
                                    item[fieldName] = `${dd}/${mm}/${yyyy}`;
                                } else {
                                    item[fieldName] = trimmed;
                                }
                            }
                        } else if (textFields.has(fieldName)) {
                            item[fieldName] = trimmed;
                        } else if (fieldName === 'os' || fieldName === 'cod') {
                            item[fieldName] = trimmed;
                        } else {
                            let clean = trimmed;
                            if (clean.includes('.') && clean.includes(',')) {
                                clean = clean.replace(/\./g, '').replace(',', '.');
                            } else if (clean.includes(',')) {
                                clean = clean.replace(',', '.');
                            } else {
                                clean = clean.replace(/[^\d.-]/g, '');
                            }
                            const numValue = parseFloat(clean);
                            if (!isNaN(numValue)) item[fieldName] = numValue; else item[fieldName] = trimmed;
                        }
                    }
                } else if (typeof cellValue === 'number') {
                    if (fieldName.toLowerCase().includes('data')) {
                        const d = XLSX.SSF.parse_date_code(cellValue);
                        if (d) {
                            const dd = String(d.d).padStart(2, '0');
                            const mm = String(d.m).padStart(2, '0');
                            const yyyy = d.y;
                            item[fieldName] = `${dd}/${mm}/${yyyy}`;
                        }
                    } else if (fieldName === 'os' || fieldName === 'cod') {
                        item[fieldName] = String(cellValue);
                    } else {
                        item[fieldName] = cellValue;
                    }
                }
            }
        });

        const numericFields = new Set(['areaTalhao', 'areaTotal', 'areaTotalAplicada', 'doseRecomendada', 'insumDoseAplicada', 'doseAplicada', 'quantidadeAplicada', 'dif', 'frente']);
        Object.values(mapping.columns).forEach(field => {
            if (numericFields.has(field)) {
                const v = item[field];
                if (v === undefined || v === null || v === '' || (typeof v === 'number' && isNaN(v))) {
                    item[field] = 0;
                }
            }
        });

        if (item.insumDoseAplicada !== undefined && item.insumDoseAplicada !== null) {
            item.doseAplicada = item.insumDoseAplicada;
        }

        return item;
    } catch (error) {
        console.error(`Erro na linha ${rowIndex + 1}:`, error);
        return null;
    }
}

class ImportManager {
    constructor() {
        this.currentFile = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        
        console.log('🔄 Inicializando ImportManager...');
        this.createImportModal();
        this.setupEventListeners();
        this.initialized = true;
        console.log('✅ ImportManager pronto!');
    }

    createImportModal() {
        // Verificar se o modal já existe
        if (document.getElementById('import-modal')) {
            console.log('📌 Modal já existe');
            return;
        }

        const modalHTML = `
            <div id="import-modal" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>📤 Importar Dados do Excel</h3>
                        <button class="close-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="upload-area" id="upload-area">
                            <div class="upload-icon">📊</div>
                            <h4 style="color: var(--text);">Arraste o arquivo Excel aqui</h4>
                            <p style="color: var(--text);">Formatos: .xlsx, .xls, .csv</p>
                            <input type="file" id="file-input" accept=".xlsx,.xls,.csv" style="display: none;">
                            <button type="button" class="btn btn-primary" id="select-file-btn">Selecionar Arquivo</button>
                        </div>
                        
                        <div id="file-info" class="file-info" style="display: none;">
                            <div class="file-details">
                                <strong>Arquivo:</strong> 
                                <span id="file-name" style="margin: 0 10px;"></span>
                                <span id="file-size" style="color: #666;"></span>
                                <button type="button" class="btn btn-small" id="remove-file" style="margin-left: 10px;">✕ Remover</button>
                            </div>
                        </div>

                        <div id="preview-section" style="display: none; margin-top: 20px;">
                            <h4>📋 Prévia dos Dados</h4>
                            <div id="preview-content"></div>
                        </div>

                        <div id="import-options" style="display: none; margin-top: 20px;">
                            <h4>⚙️ Opções</h4>
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                <label>
                                    <input type="checkbox" id="update-existing" checked> 
                                    Atualizar registros existentes
                                </label>
                                <label>
                                    <input type="checkbox" id="skip-duplicates" checked> 
                                    Pular duplicatas
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" id="cancel-import">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="start-import" disabled>🚀 Iniciar Importação</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        console.log('📦 Modal criado com sucesso');
    }

    setupEventListeners() {
        // Botão de importação no header
        const importBtn = document.getElementById('import-btn');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                console.log('🎯 Botão de importação clicado!');
                this.openImportModal();
            });
        } else {
            console.error('❌ Botão de importação não encontrado!');
        }

        // Eventos do modal
        this.setupModalEvents();
    }

    setupModalEvents() {
        // Fechar modal
        document.querySelector('.close-modal')?.addEventListener('click', () => this.closeImportModal());
        document.getElementById('cancel-import')?.addEventListener('click', () => this.closeImportModal());
        
        // Clique fora do modal
        document.getElementById('import-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'import-modal') this.closeImportModal();
        });

        // Selecionar arquivo
        document.getElementById('select-file-btn')?.addEventListener('click', () => {
            document.getElementById('file-input').click();
        });

        document.getElementById('file-input')?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files[0]);
            }
        });

        // Remover arquivo
        document.getElementById('remove-file')?.addEventListener('click', () => {
            this.resetFileSelection();
        });

        // Iniciar importação
        document.getElementById('start-import')?.addEventListener('click', () => {
            this.startImport();
        });

        // Drag and drop
        const uploadArea = document.getElementById('upload-area');
        if (uploadArea) {
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = 'var(--primary-light)';
                uploadArea.style.backgroundColor = 'var(--surface)';
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.style.borderColor = 'var(--border)';
                uploadArea.style.backgroundColor = 'transparent';
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#ccc';
                uploadArea.style.backgroundColor = '';
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.handleFileSelect(files[0]);
                }
            });
        }
    }

    handleFileSelect(file) {
        console.log('📁 Arquivo selecionado:', file.name);
        
        if (!this.isValidExcelFile(file)) {
            this.showMessage('❌ Selecione um arquivo Excel válido (.xlsx, .xls, .csv)', 'error');
            return;
        }

        this.currentFile = file;
        this.showFileInfo(file);
        this.processFileForPreview(file);
    }

    isValidExcelFile(file) {
        const allowedExtensions = ['.xlsx', '.xls', '.csv'];
        const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        return allowedExtensions.includes(ext);
    }

    showFileInfo(file) {
        document.getElementById('file-name').textContent = file.name;
        document.getElementById('file-size').textContent = this.formatFileSize(file.size);
        document.getElementById('file-info').style.display = 'block';
        document.getElementById('import-options').style.display = 'block';
        document.getElementById('upload-area').style.display = 'none';
    }

    resetFileSelection() {
        document.getElementById('file-info').style.display = 'none';
        document.getElementById('import-options').style.display = 'none';
        document.getElementById('preview-section').style.display = 'none';
        document.getElementById('upload-area').style.display = 'block';
        document.getElementById('start-import').disabled = true;
        document.getElementById('file-input').value = '';
        this.currentFile = null;
    }

    async processFileForPreview(file) {
        this.showMessage('📖 Analisando arquivo...', 'info');
        try {
            if (typeof XLSX === 'undefined' || !XLSX) {
                throw new Error('Biblioteca Excel não carregada');
            }
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });

            const importResult = {
                success: true,
                message: 'Arquivo processado com sucesso!',
                sheets: {},
                totals: { insumosFazendas: 0, oxifertil: 0 }
            };

            const importedData = { insumosFazendas: [], oxifertil: [] };

            workbook.SheetNames.forEach(sheetName => {
                try {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = worksheetToGrid(worksheet);

                    let mappingKey = Object.keys(columnMapping).find(key =>
                        sheetName.toUpperCase().includes(key.toUpperCase())
                    );
                    if (!mappingKey && sheetName.toUpperCase().includes('INSUMOS')) {
                        mappingKey = 'INSUMOS FAZENDAS';
                    }

                    if (!mappingKey) {
                        importResult.sheets[sheetName] = { rows: 0, headers: [], sampleData: [], error: 'Sheet não mapeada' };
                        return;
                    }

                    const mapping = columnMapping[mappingKey];
                    forwardFillColumns(jsonData, mapping.startRow, mapping.columns);
                    const rows = jsonData.slice(mapping.startRow);

                    const processedData = rows.map((row, index) =>
                        processRowByPosition(mapping, row, index, sheetName)
                    ).filter(item => item !== null);

                    importResult.sheets[sheetName] = {
                        rows: processedData.length,
                        headers: Object.values(mapping.columns),
                        sampleData: processedData.slice(0, 10)
                    };

                    if (sheetName.toUpperCase().includes('INSUMOS')) {
                        importResult.totals.insumosFazendas += processedData.length;
                        importedData.insumosFazendas = importedData.insumosFazendas.concat(processedData);
                    }

                    if (sheetName.toUpperCase().includes('OXIFERTIL')) {
                        importResult.totals.oxifertil += processedData.length;
                        importedData.oxifertil = importedData.oxifertil.concat(processedData);
                    }
                } catch (sheetError) {
                    importResult.sheets[sheetName] = { rows: 0, headers: [], sampleData: [], error: sheetError.message };
                }
            });

            this.importedData = importedData;

            if (importResult.totals.insumosFazendas === 0 && importResult.totals.oxifertil === 0) {
                throw new Error('Nenhum dado reconhecido nas planilhas');
            }

            this.showMessage('✅ Arquivo analisado com sucesso!', 'success');
            this.showRealPreview(importResult);
            document.getElementById('start-import').disabled = false;
        } catch (error) {
            console.error('❌ Erro ao processar arquivo:', error);
            this.showMessage(`❌ Erro ao analisar arquivo: ${error.message}`, 'error');
            this.resetFileSelection();
        }
    }

    showRealPreview(importResult) {
        const previewSection = document.getElementById('preview-section');
        const previewContent = document.getElementById('preview-content');
        
        previewSection.style.display = 'block';
        
        let previewHTML = '<div style="background: var(--surface); color: var(--text); padding: 15px; border-radius: 5px; margin-bottom: 15px;">';
        previewHTML += '<p><strong>📊 Resumo do Arquivo:</strong></p>';
        
        // Mostrar totais por categoria
        Object.keys(importResult.totals).forEach(category => {
            if (importResult.totals[category] > 0) {
                previewHTML += `<p><strong>${this.formatCategoryName(category)}:</strong> ${importResult.totals[category]} registros</p>`;
            }
        });
        
        const totalRegistros = Object.values(importResult.totals).reduce((sum, val) => sum + val, 0);
        previewHTML += `<p><strong>Total:</strong> ${totalRegistros} registros</p>`;
        previewHTML += '</div>';
        
        // Container principal com barra de rolagem
        previewHTML += `<div style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border); border-radius: 5px; padding: 10px; background: var(--surface); color: var(--text);">`;
        
        // Mostrar preview de cada sheet
        Object.keys(importResult.sheets).forEach(sheetName => {
            const sheet = importResult.sheets[sheetName];
            if (sheet.rows > 0) {
                previewHTML += `<div style="margin-bottom: 20px; padding: 10px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); color: var(--text);">`;
                previewHTML += `<h4 style="margin: 0 0 10px 0; color: var(--text); display: flex; justify-content: space-between; align-items: center;">`;
                previewHTML += `<span>${sheetName}</span>`;
                previewHTML += `<span style="background: #3498db; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: normal;">${sheet.rows} registros</span>`;
                previewHTML += `</h4>`;
                
                if (sheet.sampleData && sheet.sampleData.length > 0) {
                    // Container da tabela com rolagem individual
                    previewHTML += `<div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); color: var(--text);">`;
                    previewHTML += `<table style="width: 100%; border-collapse: collapse; font-size: 11px; min-width: 600px;">`;
                    
                    // Cabeçalhos fixos
                    previewHTML += `<thead><tr style="background: var(--primary); color: white; position: sticky; top: 0;">`;
                    sheet.headers.forEach(header => {
                        previewHTML += `<th style="border: 1px solid #34495e; padding: 6px 4px; text-align: left; font-weight: 600;">${header || ''}</th>`;
                    });
                    previewHTML += `</tr></thead>`;
                    
                    // Dados
                    previewHTML += `<tbody>`;
                    sheet.sampleData.forEach((row, index) => {
                        const rowStyle = index % 2 === 0 ? 'background: rgba(0,0,0,0.03);' : 'background: transparent;';
                        previewHTML += `<tr style="${rowStyle}">`;
                        sheet.headers.forEach((header, colIndex) => {
                            const value = row[header] !== undefined ? row[header] : (Array.isArray(row) ? row[colIndex] : '');
                            const displayValue = value !== null && value !== undefined ? String(value) : '';
                            previewHTML += `<td style="border: 1px solid var(--border); padding: 4px; white-space: nowrap; color: var(--text);">${displayValue}</td>`;
                        });
                        previewHTML += `</tr>`;
                    });
                    previewHTML += `</tbody></table>`;
                    previewHTML += `</div>`; // Fim do container da tabela
                    
                    if (sheet.rows > sheet.sampleData.length) {
                        previewHTML += `<p style="text-align: center; color: #666; font-style: italic; margin: 8px 0 0 0; font-size: 11px;">`;
                        previewHTML += `... e mais ${sheet.rows - sheet.sampleData.length} registros`;
                        previewHTML += `</p>`;
                    }
                } else if (sheet.error) {
                    previewHTML += `<div style="background: #e74c3c; color: white; padding: 8px; border-radius: 4px; text-align: center;">`;
                    previewHTML += `❌ ${sheet.error}`;
                    previewHTML += `</div>`;
                }
                
                previewHTML += `</div>`;
            }
        });
        
        previewHTML += `</div>`; // Fim do container principal
        
        previewContent.innerHTML = previewHTML;
        
        // Adicionar estilos CSS para a barra de rolagem
        this.addScrollbarStyles();
    }

    addScrollbarStyles() {
        // Verificar se os estilos já foram adicionados
        if (document.getElementById('import-scrollbar-styles')) {
            return;
        }
        
        const styles = `
            <style id="import-scrollbar-styles">
                /* Estilos para a barra de rolagem do preview */
                #preview-content div[style*="max-height"]::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                
                #preview-content div[style*="max-height"]::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 4px;
                }
                
                #preview-content div[style*="max-height"]::-webkit-scrollbar-thumb {
                    background: #c1c1c1;
                    border-radius: 4px;
                }
                
                #preview-content div[style*="max-height"]::-webkit-scrollbar-thumb:hover {
                    background: #a8a8a8;
                }
                
                #preview-content table thead th {
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                
                /* Melhorar a aparência das tabelas */
                #preview-content table {
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                
                #preview-content table tr:hover {
                    background: #e3f2fd !important;
                }
            </style>
        `;
        
        document.head.insertAdjacentHTML('beforeend', styles);
    }

    formatCategoryName(category) {
        const names = {
            'oxifertil': 'OXIFERTIL',
            'insumosFazendas': 'INSUMOS FAZENDAS',
            'santaIrene': 'SANTA IRENE',
            'daniela': 'DANIELA'
        };
        return names[category] || category;
    }

    async startImport() {
        if (!this.currentFile) {
            this.showMessage('❌ Nenhum arquivo selecionado', 'error');
            return;
        }
        if (!this.importedData || (!this.importedData.insumosFazendas && !this.importedData.oxifertil)) {
            this.showMessage('❌ Nenhum dado processado para importar', 'error');
            return;
        }

        this.showMessage('🔄 Importando dados...', 'info');
        const startBtn = document.getElementById('start-import');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.textContent = '🔄 Importando...';
        }

        try {
            const api = window.apiService;
            if (!api || !api.supabase) {
                throw new Error('Supabase não configurado');
            }

            const supabase = api.supabase;
            const dados = this.importedData;
            const totals = { oxifertil: 0, insumosFazendas: 0 };

            if (dados.oxifertil && Array.isArray(dados.oxifertil) && dados.oxifertil.length > 0) {
                const mappedOxifertil = dados.oxifertil.map(d => ({
                    processo: d.processo,
                    subprocesso: d.subprocesso,
                    produto: d.produto,
                    fazenda: d.fazenda,
                    area_talhao: d.areaTalhao,
                    area_total_aplicada: d.areaTotalAplicada,
                    dose_recomendada: d.doseRecomendada,
                    insum_dose_aplicada: d.insumDoseAplicada,
                    quantidade_aplicada: d.quantidadeAplicada,
                    dif: d.dif,
                    frente: d.frente
                }));
                const { error: errOx } = await supabase.from('insumos_oxifertil').insert(mappedOxifertil);
                if (errOx) {
                    throw errOx;
                }
                totals.oxifertil = mappedOxifertil.length;
            }

            if (dados.insumosFazendas && Array.isArray(dados.insumosFazendas) && dados.insumosFazendas.length > 0) {
                const mappedInsumos = dados.insumosFazendas.map(d => ({
                    os: d.os,
                    cod: d.cod,
                    fazenda: d.fazenda,
                    area_talhao: d.areaTalhao,
                    area_total_aplicada: d.areaTotalAplicada,
                    produto: d.produto,
                    dose_recomendada: d.doseRecomendada,
                    quantidade_aplicada: d.quantidadeAplicada,
                    frente: d.frente,
                    insum_dose_aplicada: d.insumDoseAplicada
                }));
                const { error: errInsumos } = await supabase.from('insumos_fazendas').insert(mappedInsumos);
                if (errInsumos) {
                    throw errInsumos;
                }

                // === Sincronização de Estoque ===
                try {
                    console.log('🔄 Sincronizando estoque...');
                    const resEstoque = await api.getEstoque();
                    const estoqueList = (resEstoque && resEstoque.success && Array.isArray(resEstoque.data)) ? resEstoque.data : [];
                    
                    const estoqueUpdates = new Map();

                    // Carregar estado atual
                    estoqueList.forEach(e => {
                        const key = `${e.frente}|${e.produto}`;
                        estoqueUpdates.set(key, {
                            frente: e.frente,
                            produto: e.produto,
                            quantidade: parseFloat(e.quantidade) || 0,
                            os: e.os_numero,
                            data: e.data_cadastro
                        });
                    });

                    // Acumular novos dados
                    mappedInsumos.forEach(item => {
                        if (!item.frente || !item.produto || !item.quantidade_aplicada) return;
                        
                        const key = `${item.frente}|${item.produto}`;
                        let entry = estoqueUpdates.get(key);
                        
                        if (!entry) {
                            entry = {
                                frente: item.frente,
                                produto: item.produto,
                                quantidade: 0,
                                os: null,
                                data: null
                            };
                            estoqueUpdates.set(key, entry);
                        }
                        
                        entry.quantidade += parseFloat(item.quantidade_aplicada);
                        entry.os = item.os;
                        entry.data = new Date().toISOString();
                    });

                    // Identificar chaves afetadas para atualizar apenas o necessário
                    const affectedKeys = new Set(mappedInsumos
                        .filter(i => i.frente && i.produto && i.quantidade_aplicada)
                        .map(i => `${i.frente}|${i.produto}`));

                    const updatePromises = [];
                    for (const key of affectedKeys) {
                        const entry = estoqueUpdates.get(key);
                        if (entry) {
                            updatePromises.push(api.setEstoque(
                                entry.frente,
                                entry.produto,
                                entry.quantidade,
                                entry.os ? String(entry.os) : null,
                                entry.data
                            ));
                        }
                    }

                    if (updatePromises.length > 0) {
                        await Promise.all(updatePromises);
                        console.log(`✅ Estoque sincronizado: ${updatePromises.length} itens atualizados.`);
                    }
                } catch (stockError) {
                    console.error('⚠️ Erro ao sincronizar estoque na importação:', stockError);
                    this.showMessage('⚠️ Insumos importados, mas houve erro ao atualizar estoque.', 'warning');
                }

                totals.insumosFazendas = mappedInsumos.length;
            }

            const totalRegistros = Object.values(totals).reduce((sum, val) => sum + val, 0);
            this.showMessage(`✅ Importação concluída! ${totalRegistros} registros importados`, 'success');

            setTimeout(async () => {
                this.closeImportModal();
                if (window.insumosApp) {
                    try {
                        console.log('🔄 Atualizando dados da aplicação...');
                        // Atualizar estoque e listas
                        await window.insumosApp.loadEstoqueAndRender();
                        if (window.insumosApp.getCurrentTab) {
                            const currentTab = window.insumosApp.getCurrentTab();
                            await window.insumosApp.loadTabData(currentTab);
                        }
                        window.uiManager.showNotification('Dados atualizados com sucesso!', 'success');
                    } catch(e) {
                        console.error('Erro ao atualizar interface via app:', e);
                        window.location.reload();
                    }
                } else {
                    window.location.reload();
                }
            }, 1500);
        } catch (error) {
            console.error('❌ Erro completo na importação:', error);
            this.showMessage(`❌ Falha na importação: ${error.message}`, 'error');
            const btn = document.getElementById('start-import');
            if (btn) {
                btn.disabled = false;
                btn.textContent = '🚀 Iniciar Importação';
            }
        }
    }

    showMessage(message, type = 'info') {
        // Usar o sistema de notificação existente ou criar um simples
        if (window.uiManager && window.uiManager.showNotification) {
            window.uiManager.showNotification(message, type);
        } else {
            // Fallback simples
            console.log(`${type}: ${message}`);
            alert(message);
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    openImportModal() {
        console.log('🎯 Abrindo modal de importação...');
        const modal = document.getElementById('import-modal');
        if (modal) {
            modal.style.display = 'block';
            this.resetFileSelection();
        } else {
            console.error('❌ Modal não encontrado!');
        }
    }

    closeImportModal() {
        const modal = document.getElementById('import-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.resetFileSelection();
    }
}

// Inicialização segura
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inicializando sistema de importação...');
    
    // Criar instância global
    window.importManager = new ImportManager();
    
    // Inicializar com delay para garantir que tudo esteja carregado
    setTimeout(() => {
        window.importManager.init();
        console.log('✅ Sistema de importação inicializado!');
    }, 500);
});
