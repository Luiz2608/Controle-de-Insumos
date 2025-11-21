const express = require('express');
const router = express.Router();

// Dados em memória (serão atualizados pela importação)
let insumosData = {
    insumosFazendas: []
};

// GET /api/insumos/oxifertil
// Removido endpoint oxifertil

// GET /api/insumos/insumos-fazendas
router.get('/insumos-fazendas', (req, res) => {
    try {
        const { produto, fazenda } = req.query;
        let data = insumosData.insumosFazendas;

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
// Removido endpoint santa-irene

// GET /api/insumos/daniela
// Removido endpoint daniela

// Rota para debug - ver dados atuais
router.get('/debug-data', (req, res) => {
    try {
        const totals = {
            insumosFazendas: insumosData.insumosFazendas.length,
            santaIrene: 0,
            daniela: 0
        };
        
        console.log('🔍 DEBUG COMPLETO - Dados atuais em insumosData:');
        console.log('📊 Totais:', totals);
        
        if (insumosData.insumosFazendas.length > 0) {
            console.log('📋 Primeiros 5 registros INSUMOS FAZENDAS:');
            insumosData.insumosFazendas.slice(0, 5).forEach((item, index) => {
                console.log(`   ${index + 1}:`, item);
            });
        }
        
        res.json({
            success: true,
            totals: totals,
            insumosFazendas: {
                total: insumosData.insumosFazendas.length,
                sample: insumosData.insumosFazendas.slice(0, 10),
                fields: insumosData.insumosFazendas.length > 0 ? Object.keys(insumosData.insumosFazendas[0]) : []
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Rota para atualizar dados com importação - DEBUG COMPLETO
router.post('/atualizar-dados', express.json(), (req, res) => {
    try {
        console.log('\n🔄 ========== ATUALIZANDO DADOS - DEBUG COMPLETO ==========');
        
        const { dados } = req.body;
        
        if (!dados) {
            console.log('❌ Dados não fornecidos');
            return res.status(400).json({
                success: false,
                message: 'Dados não fornecidos'
            });
        }
        
        console.log('📥 DADOS RECEBIDOS PARA ATUALIZAÇÃO:');
        console.log('   - INSUMOS FAZENDAS:', dados.insumosFazendas?.length || 0);
        console.log('   - SANTA IRENE:', 0);
        console.log('   - DANIELA:', 0);
        
        // 🔍 DEBUG DETALHADO DOS DADOS RECEBIDOS
        if (dados.insumosFazendas && Array.isArray(dados.insumosFazendas)) {
            console.log('\n🔍 ANALISANDO DADOS INSUMOS FAZENDAS RECEBIDOS:');
            console.log(`📊 Total recebido: ${dados.insumosFazendas.length} registros`);
            
            // Analisar estrutura dos dados
            if (dados.insumosFazendas.length > 0) {
                console.log('🎯 Estrutura do primeiro registro:', Object.keys(dados.insumosFazendas[0]));
                
                // Mostrar primeiros 5 registros
                console.log('📋 Primeiros 5 registros recebidos:');
                dados.insumosFazendas.slice(0, 5).forEach((item, index) => {
                    console.log(`   ${index + 1}:`, {
                        fazenda: item.fazenda,
                        produto: item.produto,
                        quantidade: item.quantidadeAplicada,
                        os: item.os,
                        cod: item.cod,
                        areaTalhao: item.areaTalhao,
                        areaTotalAplicada: item.areaTotalAplicada
                    });
                });
                
                // Analisar últimos 5 registros
                console.log('📋 Últimos 5 registros recebidos:');
                dados.insumosFazendas.slice(-5).forEach((item, index) => {
                    console.log(`   ${dados.insumosFazendas.length - 4 + index}:`, {
                        fazenda: item.fazenda,
                        produto: item.produto,
                        quantidade: item.quantidadeAplicada,
                        os: item.os,
                        cod: item.cod
                    });
                });
                
                // Contar registros com dados válidos
                const comFazenda = dados.insumosFazendas.filter(item => item.fazenda && item.fazenda.trim() !== '').length;
                const comProduto = dados.insumosFazendas.filter(item => item.produto && item.produto.trim() !== '').length;
                const comQuantidade = dados.insumosFazendas.filter(item => item.quantidadeAplicada !== undefined && item.quantidadeAplicada !== null).length;
                const comOS = dados.insumosFazendas.filter(item => item.os !== undefined && item.os !== null).length;
                const comCod = dados.insumosFazendas.filter(item => item.cod !== undefined && item.cod !== null).length;
                
                console.log('📈 ESTATÍSTICAS DOS DADOS RECEBIDOS:');
                console.log(`   - Com fazenda: ${comFazenda}/${dados.insumosFazendas.length}`);
                console.log(`   - Com produto: ${comProduto}/${dados.insumosFazendas.length}`);
                console.log(`   - Com quantidade: ${comQuantidade}/${dados.insumosFazendas.length}`);
                console.log(`   - Com OS: ${comOS}/${dados.insumosFazendas.length}`);
                console.log(`   - Com código: ${comCod}/${dados.insumosFazendas.length}`);
            }
        }
        
        // 🔥 ATUALIZAÇÃO SEM FILTRO - ACEITA TUDO
        const updates = {};
        
        
        if (dados.insumosFazendas && Array.isArray(dados.insumosFazendas)) {
            console.log(`\n✅ INSUMOS FAZENDAS: ${dados.insumosFazendas.length} registros`);
            
            // 🔥 SIMPLESMENTE SALVA TUDO - SEM VALIDAÇÃO
            insumosData.insumosFazendas = dados.insumosFazendas;
            updates.insumosFazendas = dados.insumosFazendas.length;
        }
        
        // Removidos santaIrene e daniela
        
        const totalAtualizado = Object.values(updates).reduce((sum, val) => sum + val, 0);
        
        console.log('\n✅ ATUALIZAÇÃO CONCLUÍDA:', updates);
        
        // 🔍 VERIFICAÇÃO IMEDIATA APÓS SALVAR
        console.log('\n🔍 VERIFICAÇÃO DOS DADOS SALVOS:');
        console.log(`   - INSUMOS FAZENDAS: ${insumosData.insumosFazendas.length}`);
        console.log(`   - SANTA IRENE: 0`);
        console.log(`   - DANIELA: 0`);
        
        // Verificar o que realmente foi salvo
        if (insumosData.insumosFazendas.length > 0) {
            console.log('\n📋 PRIMEIROS 3 REGISTROS SALVOS:');
            insumosData.insumosFazendas.slice(0, 3).forEach((item, index) => {
                console.log(`   ${index + 1}:`, item);
            });
        }
        
        console.log('========== FIM DO DEBUG ==========\n');
        
        res.json({
            success: true,
            message: `Dados atualizados com sucesso! ${totalAtualizado} registros importados.`,
            totals: updates,
            storedData: {
                insumosFazendas: insumosData.insumosFazendas.length,
                santaIrene: 0,
                daniela: 0
            }
        });
        
    } catch (error) {
        console.error('❌ ERRO CRÍTICO ao atualizar dados:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno ao atualizar dados',
            error: error.message
        });
    }
});

module.exports = router;