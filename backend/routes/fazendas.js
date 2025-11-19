const express = require('express');
const router = express.Router();

// Dados para os filtros
const filterData = {
    fazendas: [
        "ORIENTE", "AMOREIRA", "SANTA FE CABELEIRA", "SANTA NARCISA", 
        "SANTO EXPEDITO", "SANTA LUIZA", "SANTA TEREZINHA II", "CAMPO BELO",
        "FORTALEZA TONHÃO A", "FORTALEZA TONHÃO C", "SANTA IRENE",
        "TONHÃO B", "PAULO FRANCO", "MAGNOLIA", "CABELEIRA INVERNADA (CRIOLO)",
        "SÃO TOMAZ CORREGO FUNDO", "SÃO PEDRO", "DIAMANTE AZUL", "CABELEIRA PAIVA",
        "SKALADA", "ARTUR FRANCO", "GAMELEIRA", "PRIMAVERA"
    ],
    
    produtos: [
        "LANEX 800 WG (REGENTE)", "COMET", "BIOZYME", "04-30-10", "QUALIT",
        "AZOKOP", "OXIFERTIL", "COMPOSTO", "10-49-00", "SURVEY (FIPRONIL)",
        "CALCARIO OXIFERTIL"
    ]
};

// GET /api/fazendas
router.get('/', (req, res) => {
    try {
        res.json({
            success: true,
            data: filterData.fazendas,
            total: filterData.fazendas.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar fazendas',
            error: error.message
        });
    }
});

// GET /api/fazendas/produtos
router.get('/produtos', (req, res) => {
    try {
        res.json({
            success: true,
            data: filterData.produtos,
            total: filterData.produtos.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar produtos',
            error: error.message
        });
    }
});

module.exports = router;