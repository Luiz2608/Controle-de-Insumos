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
        const allowedExtensions = ['.xlsx', '.xls', '.csv', '.pdf'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Formato de arquivo não suportado. Use Excel, CSV ou PDF.'));
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB
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
function forwardFillColumns(jsonData, startRow = 0, columnsMapping = {}) {
    if (!Array.isArray(jsonData) || jsonData.length === 0) return;
    const colCount = Math.max(...jsonData.map(r => Array.isArray(r) ? r.length : 0));
    const lastVals = new Array(colCount).fill(undefined);
    const allowedForward = new Set(['os','cod','fazenda','produto','processo','subprocesso','frente','dataInicio']);
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
                        const textFields = new Set(['produto','fazenda','processo','subprocesso']);
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
                        } else if (textFields.has(fieldName)) {
                            item[fieldName] = trimmed;
                        } else if (fieldName === 'os' || fieldName === 'cod') {
                            // Preservar zeros à esquerda para OS e Código
                            item[fieldName] = trimmed;
                        } else {
                            // Considerar vírgulas decimais e milhares
                            let clean = trimmed;
                            // Se houver ambos '.' e ',', assumir formato pt-BR (milhares '.' e decimal ',')
                            if (clean.includes('.') && clean.includes(',')) {
                                clean = clean.replace(/\./g, '').replace(',', '.');
                            } else if (clean.includes(',')) {
                                // Apenas vírgula: tratar como decimal
                                clean = clean.replace(',', '.');
                            } else {
                                // Remover separadores não numéricos
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
                            const dd = String(d.d).padStart(2,'0');
                            const mm = String(d.m).padStart(2,'0');
                            const yyyy = d.y;
                            item[fieldName] = `${dd}/${mm}/${yyyy}`;
                        }
                    } else if (fieldName === 'os' || fieldName === 'cod') {
                        // Converter número para string para evitar perda de zeros à esquerda em planilhas salvas como texto
                        item[fieldName] = String(cellValue);
                    } else {
                        item[fieldName] = cellValue;
                    }
                }
            }
        });
        
        // Defaults numéricos: se não vier valor, usar 0
        const numericFields = new Set(['areaTalhao','areaTotal','areaTotalAplicada','doseRecomendada','insumDoseAplicada','doseAplicada','quantidadeAplicada','dif','frente']);
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
                
                forwardFillColumns(jsonData, mapping.startRow, mapping.columns);
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

const pdfModule = require('pdf-parse');
const pdfParse = typeof pdfModule === 'function' ? pdfModule : pdfModule.default;

router.post('/fazendas-gemini', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Arquivo PDF não enviado'
            });
        }

        // Ler o arquivo PDF de forma assíncrona
        let dataBuffer;
        try {
            dataBuffer = await fs.promises.readFile(req.file.path);
        } catch (readError) {
            console.error('Erro ao ler arquivo do disco:', readError);
            return res.status(500).json({
                success: false,
                message: 'Erro ao ler o arquivo enviado.'
            });
        }
        
        // Extrair texto do PDF usando pdf-parse
        let text = '';
        try {
            const data = await pdfParse(dataBuffer);
            text = data.text;
        } catch (pdfError) {
            console.error('Erro ao ler PDF com pdf-parse:', pdfError);
            return res.status(500).json({
                success: false,
                message: 'Erro ao extrair texto do PDF: ' + pdfError.message
            });
        } finally {
            // Limpar arquivo temporário
            try {
                fs.unlinkSync(req.file.path);
            } catch (e) { console.warn('Não foi possível remover arquivo temporário do PDF'); }
        }

        if (!text || !text.trim()) {
            return res.status(400).json({
                success: false,
                message: 'O PDF parece estar vazio ou não contém texto extraível'
            });
        }

        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                success: false,
                message: 'Chave da API Gemini não configurada no servidor'
            });
        }

        const prompt = [
            'Você recebe o texto bruto extraído de um PDF de Caderno de Mapas com fazendas e áreas em hectares.',
            'Extraia todas as fazendas encontradas e devolva somente um JSON válido, sem nenhum texto adicional.',
            'O formato do JSON deve ser exatamente:',
            '{',
            '  "fazendas": [',
            '    { "codigo": "1/96", "nome": "FAZENDA EXEMPLO", "regiao": "OPCIONAL", "areaTotal": 123.45 }',
            '  ],',
            '  "resumoGeral": {',
            '    "1": { "totalFazendas": 10, "areaTotal": 1234.56 }',
            '  }',
            '}',
            'Regras:',
            '- "codigo" deve seguir o padrão Bloco/Número (ex: "1/96").',
            '- "nome" é o nome da fazenda.',
            '- "regiao" pode ser vazio se não estiver claro.',
            '- "areaTotal" deve ser número em hectares com ponto como separador decimal.',
            '- Se a mesma fazenda aparecer em mais de uma página some as áreas em uma única entrada.',
            '- No "resumoGeral", a chave é o número do bloco como string.',
            '- Não inclua comentários, texto explicativo nem campos extras, apenas o JSON.'
        ].join('\n');

        const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(apiKey);

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
                            { text }
                        ]
                    }
                ]
            })
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            return res.status(500).json({
                success: false,
                message: 'Falha ao chamar a API Gemini',
                details: errText
            });
        }

        const data = await response.json();
        const candidates = data && Array.isArray(data.candidates) ? data.candidates : [];
        if (!candidates.length || !candidates[0].content || !Array.isArray(candidates[0].content.parts)) {
            return res.status(500).json({
                success: false,
                message: 'Resposta inválida da API Gemini'
            });
        }

        const rawText = candidates[0].content.parts.map(p => p.text || '').join('');
        let cleaned = rawText.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```json/i, '').replace(/^```/, '');
            if (cleaned.endsWith('```')) {
                cleaned = cleaned.slice(0, -3);
            }
            cleaned = cleaned.trim();
        }

        let parsed;
        try {
            parsed = JSON.parse(cleaned);
        } catch (e) {
            return res.status(500).json({
                success: false,
                message: 'Não foi possível interpretar a resposta da API Gemini como JSON'
            });
        }

        const fazendasRaw = Array.isArray(parsed.fazendas) ? parsed.fazendas : [];
        const fazendas = fazendasRaw.map(f => {
            const codigo = f && f.codigo != null ? String(f.codigo).trim() : '';
            const nome = f && f.nome != null ? String(f.nome).trim() : '';
            const regiao = f && f.regiao != null ? String(f.regiao).trim() : '';
            let area = 0;
            if (f && typeof f.areaTotal === 'number') {
                area = f.areaTotal;
            } else if (f && typeof f.areaTotal === 'string') {
                const n = parseFloat(f.areaTotal.replace('.', '').replace(',', '.'));
                if (!Number.isNaN(n)) area = n;
            } else if (f && typeof f.area_total === 'number') {
                area = f.area_total;
            } else if (f && typeof f.area_total === 'string') {
                const n = parseFloat(f.area_total.replace('.', '').replace(',', '.'));
                if (!Number.isNaN(n)) area = n;
            }
            return {
                codigo,
                nome,
                regiao,
                areaTotal: area
            };
        }).filter(f => f.codigo && f.nome);

        const resumoGeral = parsed && parsed.resumoGeral ? parsed.resumoGeral : null;

        if (!fazendas.length) {
            return res.status(200).json({
                success: false,
                message: 'Nenhuma fazenda encontrada pelo Gemini',
                fazendas: [],
                resumoGeral
            });
        }

        res.json({
            success: true,
            fazendas,
            resumoGeral
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao processar fazendas com Gemini: ' + error.message
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

// Limpar histórico importado
router.delete('/dados', (req, res) => {
    try {
        importedData = { insumosFazendas: [] };
        res.json({ success: true, message: 'Histórico de importação limpo' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao limpar histórico' });
    }
});

module.exports = router;
