const express = require('express');
const router = express.Router();

// Dados em memória (serão atualizados pela importação)
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
        },
        {
            id: 2,
            processo: "CANA DE ACUCAR",
            subprocesso: "PLANTIO",
            produto: "CALCARIO OXIFERTIL",
            fazenda: "SANTO EXPEDITO",
            areaTalhao: 128.61,
            areaTotalAplicada: 128.61,
            doseRecomendada: 0.15,
            insumDoseAplicada: 0.1433792,
            quantidadeAplicada: 18.439998912,
            dif: -0.0441387,
            frente: 4009
        },
        {
            id: 3,
            processo: "CANA DE ACUCAR",
            subprocesso: "PLANTIO",
            produto: "CALCARIO OXIFERTIL",
            fazenda: "SANTA LUIZA",
            areaTalhao: 22.18,
            areaTotalAplicada: 22.18,
            doseRecomendada: 0.15,
            insumDoseAplicada: 0.1487827,
            quantidadeAplicada: 3.3,
            dif: -0.0081153,
            frente: 4001
        }
    ],
    
    insumosFazendas: [
        {
            id: 1,
            os: 7447,
            cod: 1030,
            fazenda: "ORIENTE",
            areaTalhao: 37.42,
            areaTotalAplicada: 37.42,
            produto: "LANEX 800 WG (REGENTE)",
            doseRecomendada: 0.25,
            quantidadeAplicada: 10.000001056,
            frente: 4001
        },
        {
            id: 2,
            os: 7453,
            cod: 1037,
            fazenda: "AMOREIRA",
            areaTalhao: 18.53,
            areaTotalAplicada: 18.53,
            produto: "LANEX 800 WG (REGENTE)",
            doseRecomendada: 0.25,
            quantidadeAplicada: 4.999999931,
            frente: 4002
        }
    ],
    
    santaIrene: [
        {
            id: 1,
            cod: 8053,
            fazenda: "SANTA IRENE",
            areaTalhao: 147.52,
            areaTotalAplicada: 147.52,
            produto: "BIOZYME",
            doseRecomendada: 0.5,
            quantidadeAplicada: 80,
            frente: 4009
        },
        {
            id: 2,
            cod: 8053,
            fazenda: "SANTA IRENE",
            areaTalhao: 147.52,
            areaTotalAplicada: 147.52,
            produto: "04-30-10",
            doseRecomendada: 0.5,
            quantidadeAplicada: 77,
            frente: 4009
        }
    ],
    
    daniela: [
        {
            id: 1,
            cod: 8061,
            fazenda: "SÃO TOMAZ DANIELA",
            areaTotal: 16.6,
            areaTotalAplicada: 16.6,
            produto: "BIOZYME",
            doseRecomendada: 0.5,
            quantidadeAplicada: 9,
            frente: 4001
        },
        {
            id: 2,
            cod: 8061,
            fazenda: "SÃO TOMAZ DANIELA",
            areaTotal: 16.6,
            areaTotalAplicada: 16.6,
            produto: "04-30-10",
            doseRecomendada: 0.5,
            quantidadeAplicada: 8.7,
            frente: 4001
        }
    ]
};

// GET /api/insumos/oxifertil
router.get('/oxifertil', (req, res) => {
    try {
        const { fazenda, frente } = req.query;
        let data = insumosData.oxifertil;

        // Aplicar filtros
        if (fazenda && fazenda !== 'all') {
            data = data.filter(item => item.fazenda === fazenda);
        }
        if (frente && frente !== 'all') {
            data = data.filter(item => item.frente.toString() === frente);
        }

        res.json({
            success: true,
            data: data,
            total: data.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados OXIFERTIL',
            error: error.message
        });
    }
});

// GET /api/insumos/insumos-fazendas
router.get('/insumos-fazendas', (req, res) => {
    try {
        const { produto, fazenda } = req.query;
        let data = insumosData.insumosFazendas;

        // Aplicar filtros
        if (produto && produto !== 'all') {
            data = data.filter(item => item.produto === produto);
        }
        if (fazenda && fazenda !== 'all') {
            data = data.filter(item => item.fazenda === fazenda);
        }

        res.json({
            success: true,
            data: data,
            total: data.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados de insumos',
            error: error.message
        });
    }
});

// GET /api/insumos/santa-irene
router.get('/santa-irene', (req, res) => {
    try {
        res.json({
            success: true,
            data: insumosData.santaIrene,
            total: insumosData.santaIrene.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados Santa Irene',
            error: error.message
        });
    }
});

// GET /api/insumos/daniela
router.get('/daniela', (req, res) => {
    try {
        res.json({
            success: true,
            data: insumosData.daniela,
            total: insumosData.daniela.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados Daniela',
            error: error.message
        });
    }
});

// Rota para atualizar dados com importação
router.post('/atualizar-dados', express.json(), (req, res) => {
    try {
        console.log('📥 Recebendo requisição para atualizar dados...');
        
        const { dados } = req.body;
        
        if (!dados) {
            console.log('❌ Dados não fornecidos no corpo da requisição');
            return res.status(400).json({
                success: false,
                message: 'Dados não fornecidos'
            });
        }
        
        console.log('📊 Estrutura dos dados recebidos:', {
            temOxifertil: !!dados.oxifertil,
            temInsumosFazendas: !!dados.insumosFazendas,
            temSantaIrene: !!dados.santaIrene,
            temDaniela: !!dados.daniela,
            tipos: {
                oxifertil: typeof dados.oxifertil,
                insumosFazendas: typeof dados.insumosFazendas,
                santaIrene: typeof dados.santaIrene,
                daniela: typeof dados.daniela
            }
        });
        
        // Validar e atualizar cada categoria
        const updates = {};
        
        if (dados.oxifertil && Array.isArray(dados.oxifertil)) {
            console.log(`🔄 Atualizando OXIFERTIL: ${dados.oxifertil.length} registros`);
            insumosData.oxifertil = dados.oxifertil.filter(item => item && item.fazenda);
            updates.oxifertil = insumosData.oxifertil.length;
        } else {
            console.log('⚠️ OXIFERTIL: dados inválidos ou não fornecidos');
        }
        
        if (dados.insumosFazendas && Array.isArray(dados.insumosFazendas)) {
            console.log(`🔄 Atualizando INSUMOS FAZENDAS: ${dados.insumosFazendas.length} registros`);
            insumosData.insumosFazendas = dados.insumosFazendas.filter(item => item && item.fazenda);
            updates.insumosFazendas = insumosData.insumosFazendas.length;
        } else {
            console.log('⚠️ INSUMOS FAZENDAS: dados inválidos ou não fornecidos');
        }
        
        if (dados.santaIrene && Array.isArray(dados.santaIrene)) {
            console.log(`🔄 Atualizando SANTA IRENE: ${dados.santaIrene.length} registros`);
            insumosData.santaIrene = dados.santaIrene.filter(item => item && item.fazenda);
            updates.santaIrene = insumosData.santaIrene.length;
        } else {
            console.log('⚠️ SANTA IRENE: dados inválidos ou não fornecidos');
        }
        
        if (dados.daniela && Array.isArray(dados.daniela)) {
            console.log(`🔄 Atualizando DANIELA: ${dados.daniela.length} registros`);
            insumosData.daniela = dados.daniela.filter(item => item && item.fazenda);
            updates.daniela = insumosData.daniela.length;
        } else {
            console.log('⚠️ DANIELA: dados inválidos ou não fornecidos');
        }
        
        const totalAtualizado = Object.values(updates).reduce((sum, val) => sum + val, 0);
        
        console.log('✅ Atualização concluída:', updates);
        
        res.json({
            success: true,
            message: `Dados atualizados com sucesso! ${totalAtualizado} registros importados.`,
            totals: updates
        });
        
    } catch (error) {
        console.error('❌ Erro CRÍTICO ao atualizar dados:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Erro interno ao atualizar dados',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

module.exports = router;