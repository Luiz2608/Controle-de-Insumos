const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');

// Importar rotas
const insumosRoutes = require('./routes/insumos');
const fazendasRoutes = require('./routes/fazendas');
const importRoutes = require('./routes/import-routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// ⭐⭐ SERVIR ARQUIVOS ESTÁTICOS DO FRONTEND ⭐⭐
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Dados em memória (SIMPLES)
let insumosData = {
    oxifertil: [
        {
            id: 1,
            processo: "CANA DE ACUCAR",
            subprocesso: "PLANTIO",
            produto: "CALCARIO OXIFERTIL",
            fazenda: "SANTA NARCISA",
            areaTalhao: 90.16,
            areaTotalAplicada: 90.16,
            doseRecomendada: 0.15,
            insumDoseAplicada: 0.1207853,
            quantidadeAplicada: 10.890002648,
            dif: -0.1947647,
            frente: 4001
        }
    ],
    insumosFazendas: [
        {
            id: 2,
            os: 7447,
            cod: 1030,
            fazenda: "ORIENTE",
            areaTalhao: 37.42,
            areaTotalAplicada: 37.42,
            produto: "LANEX 800 WG (REGENTE)",
            doseRecomendada: 0.25,
            quantidadeAplicada: 10.000001056,
            frente: 4001
        }
    ],
    santaIrene: [],
    daniela: []
};

// Listas para filtros
const filterData = {
    fazendas: ["ORIENTE", "AMOREIRA", "SANTA NARCISA", "SANTO EXPEDITO", "SANTA LUIZA"],
    produtos: ["CALCARIO OXIFERTIL", "LANEX 800 WG (REGENTE)", "BIOZYME", "04-30-10"],
    fornecedores: ["oxifertil", "insumosFazendas"]
};

// === ROTAS DA API ===

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'API funcionando!' });
});

// Fazendas
app.get('/api/fazendas', (req, res) => {
    res.json({ success: true, data: filterData.fazendas });
});

app.get('/api/fazendas/produtos', (req, res) => {
    res.json({ success: true, data: filterData.produtos });
});

app.get('/api/fazendas/fornecedores', (req, res) => {
    res.json({ success: true, data: filterData.fornecedores });
});

// Insumos - OXIFERTIL
app.get('/api/insumos/oxifertil', (req, res) => {
    try {
        const { fazenda, frente } = req.query;
        let data = insumosData.oxifertil;

        if (fazenda && fazenda !== 'all') {
            data = data.filter(item => item.fazenda === fazenda);
        }
        if (frente && frente !== 'all') {
            data = data.filter(item => item.frente.toString() === frente);
        }

        res.json({ success: true, data: data, total: data.length });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao buscar OXIFERTIL' });
    }
});

// Insumos - INSUMOS FAZENDAS
app.get('/api/insumos/insumos-fazendas', (req, res) => {
    try {
        const { produto, fazenda } = req.query;
        let data = insumosData.insumosFazendas;

        if (produto && produto !== 'all') {
            data = data.filter(item => item.produto === produto);
        }
        if (fazenda && fazenda !== 'all') {
            data = data.filter(item => item.fazenda === fazenda);
        }

        res.json({ success: true, data: data, total: data.length });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao buscar insumos' });
    }
});

// Removidos endpoints Santa Irene e Daniela

// CRUD - Adicionar insumo
app.post('/api/insumos', (req, res) => {
    try {
        const novoInsumo = {
            id: Date.now(),
            ...req.body
        };
        
        if (novoInsumo.fornecedor === 'oxifertil') {
            insumosData.oxifertil.push(novoInsumo);
        } else if (novoInsumo.fornecedor === 'insumosFazendas') {
            insumosData.insumosFazendas.push(novoInsumo);
        }

        res.json({ success: true, message: 'Insumo adicionado!', data: novoInsumo });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao adicionar' });
    }
});

// CRUD - Editar insumo
app.put('/api/insumos/:id', (req, res) => {
    try {
        const { id } = req.params;
        const dadosAtualizados = req.body;
        
        let encontrado = false;
        
        // Buscar em OXIFERTIL
        const indexOxifertil = insumosData.oxifertil.findIndex(item => item.id == id);
        if (indexOxifertil !== -1) {
            insumosData.oxifertil[indexOxifertil] = { ...insumosData.oxifertil[indexOxifertil], ...dadosAtualizados };
            encontrado = true;
        }
        
        // Buscar em INSUMOS FAZENDAS
        const indexInsumos = insumosData.insumosFazendas.findIndex(item => item.id == id);
        if (indexInsumos !== -1) {
            insumosData.insumosFazendas[indexInsumos] = { ...insumosData.insumosFazendas[indexInsumos], ...dadosAtualizados };
            encontrado = true;
        }

        if (!encontrado) {
            return res.status(404).json({ success: false, message: 'Insumo não encontrado' });
        }

        res.json({ success: true, message: 'Insumo atualizado!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao atualizar' });
    }
});

// CRUD - Excluir insumo
app.delete('/api/insumos/:id', (req, res) => {
    try {
        const { id } = req.params;
        let encontrado = false;
        
        // Remover de OXIFERTIL
        const indexOxifertil = insumosData.oxifertil.findIndex(item => item.id == id);
        if (indexOxifertil !== -1) {
            insumosData.oxifertil.splice(indexOxifertil, 1);
            encontrado = true;
        }
        
        // Remover de INSUMOS FAZENDAS
        const indexInsumos = insumosData.insumosFazendas.findIndex(item => item.id == id);
        if (indexInsumos !== -1) {
            insumosData.insumosFazendas.splice(indexInsumos, 1);
            encontrado = true;
        }

        if (!encontrado) {
            return res.status(404).json({ success: false, message: 'Insumo não encontrado' });
        }

        res.json({ success: true, message: 'Insumo excluído!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao excluir' });
    }
});

// ==================================================
// ⭐⭐ USAR ROTAS REAIS DE IMPORTAÇÃO ⭐⭐
// ==================================================

// Rota para atualizar dados com importação REAL
app.post('/api/insumos/atualizar-dados', (req, res) => {
    try {
        console.log('🔄 Atualizando dados com importação REAL...');
        const { dados } = req.body;
        
        if (!dados) {
            return res.status(400).json({
                success: false,
                message: 'Dados não fornecidos'
            });
        }

        const updates = {};
        
        // Atualizar OXIFERTIL
        if (dados.oxifertil && Array.isArray(dados.oxifertil)) {
            insumosData.oxifertil = dados.oxifertil;
            updates.oxifertil = insumosData.oxifertil.length;
        }
        
        // Atualizar INSUMOS FAZENDAS
        if (dados.insumosFazendas && Array.isArray(dados.insumosFazendas)) {
            insumosData.insumosFazendas = dados.insumosFazendas;
            updates.insumosFazendas = insumosData.insumosFazendas.length;
        }

        if (dados.santaIrene && Array.isArray(dados.santaIrene)) {
            insumosData.santaIrene = dados.santaIrene;
            updates.santaIrene = insumosData.santaIrene.length;
        }

        if (dados.daniela && Array.isArray(dados.daniela)) {
            insumosData.daniela = dados.daniela;
            updates.daniela = insumosData.daniela.length;
        }

        const totalAtualizado = Object.values(updates).reduce((sum, val) => sum + val, 0);
        
        console.log('✅ Dados atualizados:', updates);
        
        res.json({
            success: true,
            message: `Dados importados com sucesso! ${totalAtualizado} registros.`,
            totals: updates
        });
    } catch (error) {
        console.error('❌ Erro ao atualizar dados:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar dados com importação'
        });
    }
});

// ==================================================
// ⭐⭐ USAR AS ROTAS DO IMPORT-ROUTES.JS ⭐⭐
// ==================================================

// Use as rotas reais de importação
app.use('/api/importar', importRoutes);

// ⭐⭐ ROTA PARA O FRONTEND - SPA ⭐⭐
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando: http://localhost:${PORT}`);
    console.log(`📁 Servindo frontend de: ${frontendPath}`);
    console.log(`🔍 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🌱 API Insumos Agrícolas: http://localhost:${PORT}/api/insumos/insumos-fazendas`);
    console.log(`📤 IMPORTAR (REAL): http://localhost:${PORT}/api/importar/excel`);
});