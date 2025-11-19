const insumosData = require('../data/insumos.json');

class FazendasController {
    // GET /api/fazendas
    getFazendas(req, res) {
        try {
            const fazendas = [...new Set([
                ...insumosData.oxifertil.map(item => item.fazenda),
                ...insumosData.insumosFazendas.map(item => item.fazenda),
                ...insumosData.santaIrene.map(item => item.fazenda),
                ...insumosData.daniela.map(item => item.fazenda)
            ])].filter(Boolean).sort();

            res.json({
                success: true,
                data: fazendas
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Erro ao buscar fazendas',
                error: error.message
            });
        }
    }

    // GET /api/fazendas/produtos
    getProdutos(req, res) {
        try {
            const produtos = [...new Set([
                ...insumosData.oxifertil.map(item => item.produto),
                ...insumosData.insumosFazendas.map(item => item.produto),
                ...insumosData.santaIrene.map(item => item.produto),
                ...insumosData.daniela.map(item => item.produto)
            ])].filter(Boolean).sort();

            res.json({
                success: true,
                data: produtos
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Erro ao buscar produtos',
                error: error.message
            });
        }
    }
}

module.exports = new FazendasController();