const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Dados em memória para armazenar importações
let importedData = {
    insumosFazendas: []
};

// Configuração do multer
const uploadsDir = path.join(__dirname, '../uploads/excel');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const safeName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, safeName);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.xlsx', '.xls', '.csv'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos Excel (.xlsx, .xls) e CSV são permitidos'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

// MAPEAMENTO 
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
    // Sinônimos aceitos para INSUMOS
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

// Preenche valores de células mescladas replicando o valor do topo
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
                    if (d) val = `${String(d.d).padStart(2,'0')}/${String(d.m).padStart(2,'0')}/${d.y}`;
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

// Forward-fill: propaga valores anteriores por coluna quando a célula está vazia
function forwardFillColumns(jsonData, startRow = 0) {
    if (!Array.isArray(jsonData) || jsonData.length === 0) return;
    const colCount = Math.max(...jsonData.map(r => Array.isArray(r) ? r.length : 0));
    const lastVals = new Array(colCount).fill(undefined);
    for (let r = 0; r < jsonData.length; r++) {
        const row = jsonData[r] || [];
        for (let c = 0; c < colCount; c++) {
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

// Função para processar linha - SEM FILTROS
function processRowByPosition(mapping, row, rowIndex, sheetName) {
    try {
        const item = { 
            id: Date.now() + rowIndex,
            _sheet: sheetName,
            _row: rowIndex + 1
        };
        
        // Processar cada coluna
        Object.entries(mapping.columns).forEach(([colIndex, fieldName]) => {
            const numColIndex = parseInt(colIndex);
            if (numColIndex < row.length && row[numColIndex] !== undefined && row[numColIndex] !== null && row[numColIndex] !== '') {
                const cellValue = row[numColIndex];
                
                if (typeof cellValue === 'string') {
                    const trimmed = cellValue.trim();
                    if (trimmed && trimmed !== 'N/A' && trimmed !== '-' && trimmed !== 'NULL') {
                        if (fieldName.toLowerCase().includes('data')) {
                            const m = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
                            if (m) {
                                item[fieldName] = `${m[1]}/${m[2]}/${m[3]}`;
                            } else {
                                const d = new Date(trimmed);
                                if (!isNaN(d)) {
                                    const dd = String(d.getDate()).padStart(2,'0');
                                    const mm = String(d.getMonth()+1).padStart(2,'0');
                                    const yyyy = d.getFullYear();
                                    item[fieldName] = `${dd}/${mm}/${yyyy}`;
                                } else {
                                    item[fieldName] = trimmed;
                                }
                            }
                        } else {
                            const cleanValue = trimmed.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
                            const numValue = parseFloat(cleanValue);
                            if (!isNaN(numValue)) item[fieldName] = numValue; else item[fieldName] = trimmed;
                        }
                    }
                } else if (typeof cellValue === 'number') {
                    if (fieldName.toLowerCase().includes('data')) {
                        const d = XLSX.SSF.parse_date_code(cellValue);
                        if (d) {
                            const dd = String(d.d).padStart(2,'0');
                            const mm = String(d.m).padStart(2,'0');
                            const yyyy = d.y;
                            item[fieldName] = `${dd}/${mm}/${yyyy}`;
                        }
                    } else {
                        item[fieldName] = cellValue;
                    }
                }
            }
        });
        
        // Defaults numéricos: se não vier valor, usar 0
        const numericFields = new Set(['os','cod','areaTalhao','areaTotal','areaTotalAplicada','doseRecomendada','insumDoseAplicada','doseAplicada','quantidadeAplicada','dif','frente']);
        Object.values(mapping.columns).forEach(field => {
            if (numericFields.has(field)) {
                const v = item[field];
                if (v === undefined || v === null || v === '' || (typeof v === 'number' && isNaN(v))) {
                    item[field] = 0;
                }
            }
        });
        
        // Alias: se veio 'insumDoseAplicada', popular também 'doseAplicada'
        if (item.insumDoseAplicada !== undefined && item.insumDoseAplicada !== null) {
            item.doseAplicada = item.insumDoseAplicada;
        }
        
        // 🔥 ACEITA TODAS AS LINHAS - MESMO VAZIAS
        return item;
        
    } catch (error) {
        console.error(`❌ Erro na linha ${rowIndex + 1}:`, error);
        return null;
    }
}

// 🔥 ROTA PRINCIPAL - USA /excel (não /importar/excel)
router.post('/excel', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Nenhum arquivo foi enviado'
            });
        }

        console.log('\n🚀 PROCESSANDO ARQUIVO:', req.file.originalname);
        
        const filePath = req.file.path;
        const workbook = XLSX.readFile(filePath);
        
        const importResult = {
            success: true,
            message: 'Arquivo processado com sucesso!',
            sheets: {},
            totals: { insumosFazendas: 0 }
        };

        workbook.SheetNames.forEach(sheetName => {
            try {
                console.log(`\n📊 PROCESSANDO: "${sheetName}"`);
                
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = worksheetToGrid(worksheet);
                console.log(`📈 Total de linhas brutas: ${jsonData.length}`);
                
        let mappingKey = Object.keys(columnMapping).find(key => 
            sheetName.toUpperCase().includes(key.toUpperCase())
        );
        // Se não encontrou, mas é uma sheet de INSUMOS, usar mapeamento padrão
        if (!mappingKey && sheetName.toUpperCase().includes('INSUMOS')) {
            mappingKey = 'INSUMOS FAZENDAS';
        }
                
                if (!mappingKey) {
                    console.log(`❌ Sheet não mapeada: ${sheetName}`);
                    importResult.sheets[sheetName] = { 
                        rows: 0, 
                        headers: [], 
                        sampleData: [], 
                        error: 'Sheet não mapeada' 
                    };
                    return;
                }
                
                const mapping = columnMapping[mappingKey];
                console.log(`🎯 Mapeamento: ${mappingKey} (linha ${mapping.startRow + 1})`);
                
                forwardFillColumns(jsonData, mapping.startRow);
                const rows = jsonData.slice(mapping.startRow);
                console.log(`📝 ${rows.length} linhas para processar`);
                
                // Processamento SEM FILTRO
                const processedData = rows.map((row, index) => 
                    processRowByPosition(mapping, row, index, sheetName)
                ).filter(item => item !== null);
                
                console.log(`✅ ${sheetName}: ${processedData.length} registros processados`);
                
                importResult.sheets[sheetName] = {
                    rows: processedData.length,
                    headers: Object.values(mapping.columns),
                    sampleData: processedData.slice(0, 10)
                };

                // Classificar dados
                if (sheetName.toUpperCase().includes('INSUMOS')) {
                    importResult.totals.insumosFazendas = processedData.length;
                    importedData.insumosFazendas = processedData;
                    console.log(`💾 INSUMOS FAZENDAS: ${processedData.length} registros`);
                }
                
            } catch (sheetError) {
                console.error(`❌ Erro em ${sheetName}:`, sheetError);
                importResult.sheets[sheetName] = { 
                    rows: 0, 
                    headers: [], 
                    sampleData: [], 
                    error: sheetError.message 
                };
            }
        });

        // Limpar arquivo temporário
        try {
            fs.unlinkSync(filePath);
        } catch (unlinkError) {
            console.warn('⚠️ Não foi possível remover arquivo temporário');
        }

        console.log('\n✅ PROCESSAMENTO CONCLUÍDO');
        console.log('📊 TOTAIS FINAIS:', importResult.totals);
        
        res.json(importResult);

    } catch (error) {
        console.error('❌ ERRO NO PROCESSAMENTO:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao processar arquivo Excel: ' + error.message
        });
    }
});

// Rota para obter dados
router.get('/dados', (req, res) => {
    try {
        const totals = {
            insumosFazendas: importedData.insumosFazendas.length
        };
        
        console.log('📤 Enviando dados:', totals);
        
        res.json({
            success: true,
            data: importedData,
            totals: totals
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados importados',
            error: error.message
        });
    }
});

module.exports = router;