const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Dados em memória para armazenar importações
let importedData = {
    oxifertil: [],
    insumosFazendas: [],
    santaIrene: [],
    daniela: []
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
        startRow: 2, // Linha onde começam os dados (base 0)
        columns: {
            0: 'processo',      // A
            1: 'subprocesso',   // B  
            2: 'produto',       // C
            3: 'fazenda',       // D
            4: 'areaTalhao',    // E
            5: 'areaTotalAplicada', // F
            6: 'doseRecomendada',   // G
            7: 'insumDoseAplicada', // H
            8: 'quantidadeAplicada', // I
            9: 'dif',           // J
            10: 'frente'        // K
        }
    },
    'INSUMOS FAZENDAS': {
        startRow: 2, // Linha onde começam os dados
        columns: {
            0: 'os',            // A
            1: 'cod',           // B
            2: 'fazenda',       // C
            3: 'areaTalhao',    // D
            4: 'areaTotalAplicada', // E
            5: 'produto',       // F
            6: 'doseRecomendada',   // G
            7: 'insumDoseAplicada', // H
            8: 'quantidadeAplicada', // I
            9: 'dif',           // J
            10: 'frente'        // K
        }
    },
    'SANTA IRENE (STEIN)': {
        startRow: 4, // Linha onde começam os dados
        columns: {
            0: 'cod',           // A
            1: 'fazenda',       // B
            2: 'areaTalhao',    // C
            3: 'areaTotalAplicada', // D
            4: 'produto',       // E
            5: 'doseRecomendada',   // F
            6: 'insumDoseAplicada', // G
            7: 'quantidadeAplicada', // H
            8: 'dif',           // I
            9: 'frente'         // J
        }
    },
    'DANIELA': {
        startRow: 3, // Linha onde começam os dados
        columns: {
            0: 'cod',           // A
            1: 'fazenda',       // B
            2: 'areaTotal',     // C
            3: 'areaTotalAplicada', // D
            4: 'produto',       // E
            5: 'doseRecomendada',   // F
            6: 'insumDoseAplicada', // G
            7: 'quantidadeAplicada', // H
            8: 'dif',           // I
            9: 'frente'         // J
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
        
        // Manter como texto se for produto com hífen
        if (trimmed.includes('-') && !isNaN(parseFloat(trimmed.replace(',', '.')))) {
            const num = parseFloat(trimmed.replace(',', '.'));
            return isNaN(num) ? trimmed : num;
        }
        
        // Tentar converter para número
        const numValue = parseFloat(trimmed.replace(',', '.').replace('%', ''));
        if (!isNaN(numValue)) {
            return numValue;
        }
        
        return trimmed;
    }
    
    return value;
}

// Função para processar linha baseada no mapeamento por posição
function processRowByPosition(mapping, row, rowIndex, sheetName) {
    try {
        // Verificar se a linha tem dados suficientes
        const nonEmptyCells = row.filter(cell => 
            cell !== null && cell !== undefined && cell !== '' && 
            (!(typeof cell === 'string') || cell.trim() !== '')
        ).length;
        
        if (nonEmptyCells < 3) {
            return null; // Linha com poucos dados
        }
        
        const item = { 
            id: Date.now() + rowIndex,
            _sheet: sheetName,
            _row: rowIndex + 1
        };
        
        let hasFazenda = false;
        let hasProduto = false;
        
        // Processar cada coluna baseado no mapeamento
        Object.entries(mapping.columns).forEach(([colIndex, fieldName]) => {
            const numColIndex = parseInt(colIndex);
            if (row[numColIndex] !== undefined && row[numColIndex] !== null && row[numColIndex] !== '') {
                const convertedValue = convertValue(row[numColIndex]);
                if (convertedValue !== null) {
                    item[fieldName] = convertedValue;
                    
                    if (fieldName === 'fazenda' && convertedValue) hasFazenda = true;
                    if (fieldName === 'produto' && convertedValue) hasProduto = true;
                }
            }
        });
        
        // Aplicar valores padrão baseado no tipo de sheet
        if (sheetName.toUpperCase().includes('OXIFERTIL')) {
            if (!item.processo) item.processo = "CANA DE ACUCAR";
            if (!item.subprocesso) item.subprocesso = "PLANTIO";
            if (!item.produto) item.produto = "CALCARIO OXIFERTIL";
            if (!item.doseRecomendada) item.doseRecomendada = 0.15;
        }
        
        if (sheetName.toUpperCase().includes('IRENE') && !item.fazenda) {
            item.fazenda = "SANTA IRENE";
            hasFazenda = true;
        }
        
        if (sheetName.toUpperCase().includes('DANIELA') && !item.fazenda) {
            item.fazenda = "SÃO TOMAZ DANIELA";
            hasFazenda = true;
        }
        
        // Apenas retornar se tiver dados essenciais
        return (hasFazenda || hasProduto) && Object.keys(item).length > 3 ? item : null;
        
    } catch (error) {
        console.error(`❌ Erro na linha ${rowIndex}:`, error);
        return null;
    }
}

// Rota para upload e processamento DIRETO
router.post('/excel', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Nenhum arquivo foi enviado'
            });
        }

        console.log('\n🚀 ========== INICIANDO PROCESSAMENTO DIRETO ==========');
        console.log('📁 Arquivo:', req.file.originalname);
        
        const filePath = req.file.path;
        
        // Ler o arquivo Excel
        const workbook = XLSX.readFile(filePath);
        console.log('✅ Arquivo lido! Abas:', workbook.SheetNames);
        
        const importResult = {
            success: true,
            message: 'Arquivo processado com sucesso!',
            sheets: {},
            totals: {
                oxifertil: 0,
                insumosFazendas: 0,
                santaIrene: 0,
                daniela: 0
            }
        };

        // Processar cada aba da planilha
        workbook.SheetNames.forEach(sheetName => {
            try {
                console.log(`\n📊 ========== PROCESSANDO "${sheetName}" ==========`);
                
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    header: 1,
                    defval: null,
                    raw: false
                });
                
                console.log(`📈 Total de linhas: ${jsonData.length}`);
                
                // Encontrar o mapeamento correto para esta sheet
                const mappingKey = Object.keys(columnMapping).find(key => 
                    sheetName.toUpperCase().includes(key.toUpperCase())
                );
                
                if (!mappingKey) {
                    console.log(`❌ Nenhum mapeamento encontrado para: ${sheetName}`);
                    importResult.sheets[sheetName] = {
                        rows: 0,
                        headers: [],
                        sampleData: [],
                        error: 'Sheet não mapeada'
                    };
                    return;
                }
                
                const mapping = columnMapping[mappingKey];
                console.log(`🎯 Usando mapeamento: ${mappingKey} (começa na linha ${mapping.startRow + 1})`);
                
                const rows = jsonData.slice(mapping.startRow); // Pular linhas iniciais
                console.log(`📝 ${rows.length} linhas para processar`);
                
                const processedData = rows
                    .map((row, index) => processRowByPosition(mapping, row, index, sheetName))
                    .filter(item => item !== null);
                
                console.log(`✅ ${sheetName}: ${processedData.length} registros válidos`);
                
                importResult.sheets[sheetName] = {
                    rows: processedData.length,
                    headers: Object.values(mapping.columns),
                    sampleData: processedData 
                };

                // Classificar dados
                if (sheetName.toUpperCase().includes('OXIFERTIL')) {
                    importResult.totals.oxifertil = processedData.length;
                    importedData.oxifertil = processedData;
                } else if (sheetName.toUpperCase().includes('INSUMOS')) {
                    importResult.totals.insumosFazendas = processedData.length;
                    importedData.insumosFazendas = processedData;
                } else if (sheetName.toUpperCase().includes('IRENE')) {
                    importResult.totals.santaIrene = processedData.length;
                    importedData.santaIrene = processedData;
                } else if (sheetName.toUpperCase().includes('DANIELA')) {
                    importResult.totals.daniela = processedData.length;
                    importedData.daniela = processedData;
                }
                
            } catch (sheetError) {
                console.error(`❌ Erro na sheet ${sheetName}:`, sheetError);
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

        console.log('\n✅ ========== PROCESSAMENTO CONCLUÍDO ==========');
        console.log('📊 TOTAIS:', importResult.totals);
        
        res.json(importResult);

    } catch (error) {
        console.error('❌ ERRO NO PROCESSAMENTO:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao processar arquivo Excel: ' + error.message,
            error: error.message
        });
    }
});

// Rota para obter dados importados
router.get('/dados', (req, res) => {
    try {
        const totals = {
            oxifertil: importedData.oxifertil.length,
            insumosFazendas: importedData.insumosFazendas.length,
            santaIrene: importedData.santaIrene.length,
            daniela: importedData.daniela.length
        };
        
        console.log('📤 Enviando dados importados:', totals);
        
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
            insumosFazendas: [],
            santaIrene: [],
            daniela: []
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