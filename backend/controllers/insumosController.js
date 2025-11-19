const insumosData = require('../data/insumos.json');

class InsumosController {
    // GET /api/insumos/oxifertil
    getOxifertil(req, res) {
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
    }

    // GET /api/insumos/insumos-fazendas
    getInsumosFazendas(req, res) {
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
    }

    // GET /api/insumos/santa-irene
    getSantaIrene(req, res) {
        try {
            res.json({
                success: true,
                data: insumosData.santaIrene
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Erro ao buscar dados Santa Irene',
                error: error.message
            });
        }
    }

    // GET /api/insumos/daniela
    getDaniela(req, res) {
        try {
            res.json({
                success: true,
                data: insumosData.daniela
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Erro ao buscar dados Daniela',
                error: error.message
            });
        }
    }

    // POST /api/insumos/novo
    addInsumo(req, res) {
        try {
            const novoInsumo = req.body;
            // Aqui você salvaria no banco de dados
            console.log('Novo insumo:', novoInsumo);
            
            res.json({
                success: true,
                message: 'Insumo adicionado com sucesso',
                data: novoInsumo
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Erro ao adicionar insumo',
                error: error.message
            });
        }
    }

    // PUT /api/insumos/editar/:id
    updateInsumo(req, res) {
        try {
            const { id } = req.params;
            const dadosAtualizados = req.body;
            
            console.log(`Atualizando insumo ${id}:`, dadosAtualizados);
            
            res.json({
                success: true,
                message: 'Insumo atualizado com sucesso'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Erro ao atualizar insumo',
                error: error.message
            });
        }
    }

    // DELETE /api/insumos/excluir/:id
    deleteInsumo(req, res) {
        try {
            const { id } = req.params;
            console.log(`Excluindo insumo ${id}`);
            
            res.json({
                success: true,
                message: 'Insumo excluído com sucesso'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Erro ao excluir insumo',
                error: error.message
            });
        }
    }
}

module.exports = new InsumosController();