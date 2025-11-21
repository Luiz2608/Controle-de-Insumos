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
                            <h4 style="color: black;">Arraste o arquivo Excel aqui</h4>
                            <p style="color: black;">Formatos: .xlsx, .xls, .csv</p>
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
                uploadArea.style.borderColor = '#4CAF50';
                uploadArea.style.backgroundColor = '#f0f7f0';
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.style.borderColor = '#ccc';
                uploadArea.style.backgroundColor = '';
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
            const formData = new FormData();
            formData.append('file', file);

            console.log('📤 Enviando arquivo para análise...');
            const response = await fetch('/api/importar/excel', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }

            const result = await response.json();
            console.log('📥 Resposta da análise:', result);
            
            if (result.success) {
                this.showMessage('✅ Arquivo analisado com sucesso!', 'success');
                this.showRealPreview(result);
                document.getElementById('start-import').disabled = false;
            } else {
                throw new Error(result.message);
            }
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

        this.showMessage('🔄 Importando dados...', 'info');
        document.getElementById('start-import').disabled = true;
        document.getElementById('start-import').textContent = '🔄 Importando...';

        try {
            const formData = new FormData();
            formData.append('file', this.currentFile);

            console.log('🚀 INICIANDO IMPORTACAO REAL...');

            // 1. Fazer upload e processamento do arquivo
            console.log('📝 Passo 1: Processando arquivo Excel...');
            const response = await fetch('/api/importar/excel', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Erro no processamento do arquivo:', response.status, errorText);
                throw new Error(`Erro no servidor: ${response.status}`);
            }

            const result = await response.json();
            console.log('📥 Resposta do processamento:', result);
            
            if (result.success) {
                this.showMessage(`✅ Arquivo processado! ${Object.values(result.totals).reduce((a, b) => a + b, 0)} registros encontrados`, 'success');
                
                // Pequeno delay para garantir processamento
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 2. Obter os dados processados
                console.log('📝 Passo 2: Obtendo dados processados...');
                const dadosResponse = await fetch('/api/importar/dados');
                if (!dadosResponse.ok) {
                    throw new Error(`Erro ao buscar dados: ${dadosResponse.status}`);
                }
                
                const dadosResult = await dadosResponse.json();
                console.log('📊 Dados obtidos para atualização:', dadosResult);
                
                if (dadosResult.success && dadosResult.data) {
                    console.log('📝 Passo 3: Enviando dados para atualização...');
                    
                    // 3. Atualizar o sistema com os novos dados
                    const updateResponse = await fetch('/api/insumos/atualizar-dados', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            dados: dadosResult.data
                        })
                    });

                    console.log('📝 Status da atualização:', updateResponse.status);
                    
                    if (!updateResponse.ok) {
                        let errorDetail = `Status: ${updateResponse.status}`;
                        try {
                            const errorData = await updateResponse.json();
                            errorDetail += ` - ${errorData.message || 'Erro desconhecido'}`;
                        } catch (e) {
                            errorDetail += ' - Não foi possível ler detalhes do erro';
                        }
                        console.error('❌ Erro na atualização:', errorDetail);
                        throw new Error(`Falha na atualização: ${errorDetail}`);
                    }

                    const updateResult = await updateResponse.json();
                    console.log('🔄 Resultado da atualização:', updateResult);
                    
                    if (updateResult.success) {
                        const totalRegistros = Object.values(updateResult.totals || {}).reduce((sum, val) => sum + val, 0);
                        this.showMessage(`✅ Importação REAL concluída! ${totalRegistros} registros importados`, 'success');
                        
                        // Fechar modal após sucesso
                        setTimeout(() => {
                            this.closeImportModal();
                            
                            // 🔥 SOLUÇÃO: FORÇAR ATUALIZAÇÃO DA PÁGINA
                            console.log('🔄 Recarregando página para exibir todos os dados...');
                            setTimeout(() => {
                                window.location.reload();
                            }, 1000);
                            
                        }, 2000);
                    } else {
                        throw new Error(updateResult.message || 'Erro desconhecido na atualização');
                    }
                } else {
                    throw new Error(dadosResult.message || 'Dados não processados corretamente');
                }
            } else {
                throw new Error(result.message || 'Erro no processamento do arquivo');
            }
        } catch (error) {
            console.error('❌ Erro completo na importação:', error);
            this.showMessage(`❌ Falha na importação: ${error.message}`, 'error');
            document.getElementById('start-import').disabled = false;
            document.getElementById('start-import').textContent = '🚀 Iniciar Importação';
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