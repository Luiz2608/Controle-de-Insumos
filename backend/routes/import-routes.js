const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Dados em memória para armazenar importações
let importedData = {
    oxifertil: [],
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

// MAPEAMENTO DIRETO POR POSIÇÃO DE COLUNA
const columnMapping = {
    'OXIFERTIL': {
        startRow: 1, // Começa na linha 2 (base 0)
        columns: {
            0: 'processo',      // A - Processo
            1: 'subprocesso',   // B - Subprocesso  
            2: 'produto',       // C - Produto
            3: 'fazenda',       // D - Fazenda
            4: 'areaTalhao',    // E - Área Talhão (ha)
            5: 'areaTotalAplicada', // F - Área Aplicada (ha)
            6: 'doseRecomendada',   // G - Dose Recom.
            7: 'insumDoseAplicada', // H - Dose Aplicada
            8: 'quantidadeAplicada', // I - Quantidade
            9: 'dif',           // J - Diferença
            10: 'frente'        // K - Frente
        }
    },
    'INSUMOS FAZENDAS': {
        startRow: 1, // Começa na linha 2 (base 0)
        columns: {
            0: 'os',            // A - OS
            1: 'cod',           // B - Código
            2: 'fazenda',       // C - Fazenda
            3: 'areaTalhao',    // D - Área Talhão (ha)
            4: 'areaTotalAplicada', // E - Área Aplicada (ha)
            5: 'produto',       // F - Produto
            6: 'doseRecomendada',   // G - Dose Recom.
            7: 'insumDoseAplicada', // H - Dose Aplicada
            8: 'quantidadeAplicada', // I - Quantidade
            9: 'dif',           // J - Diferença
            10: 'frente'        // K - Frente
        }
    }
};

// Função para converter valor
function convertValue(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    
    if (typeof value === 'number') {
        return value;
    }
    
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return null;
        
        // Ignorar textos específicos
        if (trimmed.toUpperCase() === 'N/A' || trimmed.toUpperCase() === 'NAN' || trimmed === '-') {
            return null;
        }
        
        // Converter números com vírgula (formato brasileiro)
        if (trimmed.includes(',')) {
            // Remover pontos de milhar e substituir vírgula decimal por ponto
            const cleanValue = trimmed.replace(/\./g, '').replace(',', '.');
            const numValue = parseFloat(cleanValue);
            if (!isNaN(numValue)) {
                return numValue;
            }
        }
        
        // Tentar converter normalmente
        const numValue = parseFloat(trimmed.replace(',', '.').replace('%', ''));
        if (!isNaN(numValue)) {
            return numValue;
        }
        
        return trimmed;
    }
    
    return value;
}

// Função para processar linha
function processRowByPosition(mapping, row, rowIndex, sheetName) {
    try {
        // Ignorar apenas linhas COMPLETAMENTE vazias
        const isEmptyRow = row.every(cell => 
            cell === null || cell === undefined || cell === '' || 
            (typeof cell === 'string' && cell.trim() === '')
        );
        
        if (isEmptyRow) {
            return null;
        }

        const item = { 
            id: Date.now() + rowIndex,
            _sheet: sheetName,
            _row: rowIndex + 1
        };
        
        let hasAnyData = false;
        
        // Processar TODAS as colunas
        Object.entries(mapping.columns).forEach(([colIndex, fieldName]) => {
            const numColIndex = parseInt(colIndex);
            if (numColIndex < row.length && row[numColIndex] !== undefined && row[numColIndex] !== null && row[numColIndex] !== '') {
                const cellValue = row[numColIndex];
                
                // Converter valor
                let convertedValue = cellValue;
                
                // Se for string, tentar converter números
                if (typeof cellValue === 'string') {
                    const trimmed = cellValue.trim();
                    if (trimmed) {
                        // Tentar converter formato brasileiro (1.000,50 -> 1000.50)
                        const cleanValue = trimmed.replace(/\./g, '').replace(',', '.');
                        const numValue = parseFloat(cleanValue);
                        if (!isNaN(numValue)) {
                            convertedValue = numValue;
                        }
                    }
                }
                
                item[fieldName] = convertedValue;
                hasAnyData = true;
            }
        });
        
        // Aceitar QUALQUER linha que tenha dados
        return hasAnyData ? item : null;
        
    } catch (error) {
        console.error(`❌ Erro na linha ${rowIndex}:`, error);
        return null;
    }
}

// Rota para upload e processamento
router.post('/excel', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Nenhum arquivo foi enviado'
            });
        }

        console.log('📁 Processando arquivo:', req.file.originalname);
        
        const filePath = req.file.path;
        const workbook = XLSX.readFile(filePath);
        
        const importResult = {
            success: true,
            message: 'Arquivo processado com sucesso!',
            sheets: {},
            totals: {
                oxifertil: 0,
                insumosFazendas: 0
            }
        };

        workbook.SheetNames.forEach(sheetName => {
            try {
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    header: 1,
                    defval: null,
                    raw: false
                });
                
                const mappingKey = Object.keys(columnMapping).find(key => 
                    sheetName.toUpperCase().includes(key.toUpperCase())
                );
                
                if (!mappingKey) {
                    importResult.sheets[sheetName] = {
                        rows: 0,
                        headers: [],
                        sampleData: [],
                        error: 'Sheet não mapeada'
                    };
                    return;
                }
                
                const mapping = columnMapping[mappingKey];
                const rows = jsonData.slice(mapping.startRow);
                const processedData = rows
                    .map((row, index) => processRowByPosition(mapping, row, index, sheetName))
                    .filter(item => item !== null);
                
                importResult.sheets[sheetName] = {
    rows: processedData.length,
    headers: Object.values(mapping.columns),
    sampleData: processedData // ← MOSTRA TODOS OS DADOS
};

                if (sheetName.toUpperCase().includes('OXIFERTIL')) {
                    importResult.totals.oxifertil = processedData.length;
                    importedData.oxifertil = processedData;
                } else if (sheetName.toUpperCase().includes('INSUMOS')) {
                    importResult.totals.insumosFazendas = processedData.length;
                    importedData.insumosFazendas = processedData;
                }
                
            } catch (sheetError) {
                importResult.sheets[sheetName] = {
                    rows: 0,
                    headers: [],
                    sampleData: [],
                    error: sheetError.message
                };
            }
        });

        try {
            fs.unlinkSync(filePath);
        } catch (unlinkError) {
            console.warn('⚠️ Não foi possível remover arquivo temporário');
        }
        
        res.json(importResult);

    } catch (error) {
        console.error('❌ ERRO NO PROCESSAMENTO:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao processar arquivo Excel: ' + error.message
        });
    }
});

// Rota para obter dados importados
router.get('/dados', (req, res) => {
    try {
        const totals = {
            oxifertil: importedData.oxifertil.length,
            insumosFazendas: importedData.insumosFazendas.length
        };
        
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

// Rota para limpar dados importados
router.delete('/limpar', (req, res) => {
    try {
        importedData = {
            oxifertil: [],
            insumosFazendas: []
        };
        
        res.json({
            success: true,
            message: 'Dados importados limpos com sucesso'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao limpar dados',
            error: error.message
        });
    }
});

module.exports = router;