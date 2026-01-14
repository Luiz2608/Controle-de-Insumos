const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
require('dotenv').config();
const supabase = require('./config/supabase');

// Importar rotas existentes (mantendo compatibilidade)
// Note: importRoutes é usado para processamento de arquivo temporário
const importRoutes = require('./routes/import-routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: [
        'https://luiz2608.github.io',
        'http://localhost:3000',
        'http://localhost:5500',
        'http://localhost:8080'
    ],
    credentials: true
}));
app.use(bodyParser.json({ limit: '50mb' }));

// ⭐⭐ SERVIR ARQUIVOS ESTÁTICOS DO FRONTEND ⭐⭐
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Listas para filtros (Mantido estático por enquanto, poderia vir do DB)
const filterData = {
    fazendas: ["ORIENTE", "AMOREIRA", "SANTA NARCISA", "SANTO EXPEDITO", "SANTA LUIZA"],
    produtos: ["CALCARIO OXIFERTIL", "LANEX 800 WG (REGENTE)", "BIOZYME", "04-30-10"],
    fornecedores: ["oxifertil", "insumosFazendas"]
};

// Auth Helper Functions
const crypto = require('crypto');
const AUTH_SECRET = process.env.AUTH_SECRET || 'dev-secret';

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); }

function signToken(username, expSec = 7 * 24 * 60 * 60) {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({ sub: username, exp: Math.floor(Date.now() / 1000) + expSec }));
    const data = `${header}.${payload}`;
    const sig = b64url(crypto.createHmac('sha256', AUTH_SECRET).update(data).digest());
    return `${data}.${sig}`;
}

function verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const data = `${h}.${p}`;
    const sig = b64url(crypto.createHmac('sha256', AUTH_SECRET).update(data).digest());
    if (sig !== s) return null;
    try {
        const payload = JSON.parse(Buffer.from(p.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8'));
        if (!payload || !payload.sub || !payload.exp) return null;
        if (payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch { return null; }
}

function requireAuth(req, res, next) {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const payload = verifyToken(token);
    if (payload) { req.user = { username: payload.sub }; return next(); }
    res.status(401).json({ success: false, message: 'Não autorizado' });
}

// === ROTAS DA API ===

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'API Supabase funcionando!' });
});

// === CRUD de Fazendas (Supabase) ===

app.get('/api/fazendas', async (req, res) => {
    try {
        const { data, error } = await supabase.from('fazendas').select('*');
        if (error) throw error;
        res.json({ success: true, data });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao listar fazendas: ' + e.message }); }
});

// Rotas auxiliares
app.get('/api/fazendas/produtos', (req, res) => {
    res.json({ success: true, data: filterData.produtos });
});

app.get('/api/fazendas/fornecedores', (req, res) => {
    res.json({ success: true, data: filterData.fornecedores });
});

app.post('/api/fazendas', async (req, res) => {
    try {
        const { codigo, nome, regiao = '', area_total = 0, plantio_acumulado = 0, muda_acumulada = 0, observacoes = '' } = req.body || {};
        if (!codigo || !nome) return res.status(400).json({ success: false, message: 'codigo e nome são obrigatórios' });

        // Check if exists
        const { data: existing } = await supabase.from('fazendas').select('codigo').eq('codigo', String(codigo)).single();
        if (existing) return res.status(409).json({ success: false, message: 'Fazenda já existe' });

        const item = { 
            codigo: String(codigo), 
            nome, 
            regiao, 
            area_total: Number(area_total)||0, 
            plantio_acumulado: Number(plantio_acumulado)||0, 
            muda_acumulada: Number(muda_acumulada)||0, 
            observacoes 
        };
        
        const { data, error } = await supabase.from('fazendas').insert([item]).select();
        if (error) throw error;
        
        res.json({ success: true, data: data[0] });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao criar fazenda: ' + e.message }); }
});

app.get('/api/fazendas/:codigo', async (req, res) => {
    try {
        const codigo = String(req.params.codigo);
        const { data, error } = await supabase.from('fazendas').select('*').eq('codigo', codigo).single();
        if (error || !data) return res.status(404).json({ success: false, message: 'Fazenda não encontrada' });
        res.json({ success: true, data });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao buscar fazenda' }); }
});

app.put('/api/fazendas/:codigo', async (req, res) => {
    try {
        const codigo = String(req.params.codigo);
        const { nome, regiao, area_total, plantio_acumulado, muda_acumulada, observacoes } = req.body || {};
        
        const updates = {};
        if (nome !== undefined) updates.nome = nome;
        if (regiao !== undefined) updates.regiao = regiao;
        if (area_total !== undefined) updates.area_total = Number(area_total);
        if (plantio_acumulado !== undefined) updates.plantio_acumulado = Number(plantio_acumulado);
        if (muda_acumulada !== undefined) updates.muda_acumulada = Number(muda_acumulada);
        if (observacoes !== undefined) updates.observacoes = observacoes;

        const { data, error } = await supabase.from('fazendas').update(updates).eq('codigo', codigo).select();
        if (error) throw error;
        if (!data || data.length === 0) return res.status(404).json({ success: false, message: 'Fazenda não encontrada' });

        res.json({ success: true, data: data[0] });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao atualizar fazenda: ' + e.message }); }
});

app.delete('/api/fazendas/:codigo', async (req, res) => {
    try {
        const codigo = String(req.params.codigo);
        const { error } = await supabase.from('fazendas').delete().eq('codigo', codigo);
        if (error) throw error;
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao excluir fazenda' }); }
});

// === Insumos - OXIFERTIL ===
app.get('/api/insumos/oxifertil', async (req, res) => {
    try {
        const { fazenda, frente } = req.query;
        let query = supabase.from('insumos_oxifertil').select('*');
        
        if (fazenda && fazenda !== 'all') query = query.eq('fazenda', fazenda);
        if (frente && frente !== 'all') query = query.eq('frente', frente);

        const { data, error } = await query;
        if (error) throw error;

        // Mapper para camelCase se necessário (Supabase retorna snake_case por padrão se a coluna for snake_case)
        // O frontend espera camelCase. Vou mapear manualmente.
        // As colunas no banco são snake_case (criadas no schema.sql).
        // Frontend: areaTalhao, areaTotalAplicada, doseRecomendada, insumDoseAplicada, quantidadeAplicada
        // DB: area_talhao, area_total_aplicada, dose_recomendada, insum_dose_aplicada, quantidade_aplicada
        
        const mappedData = data.map(d => ({
            ...d,
            areaTalhao: d.area_talhao,
            areaTotalAplicada: d.area_total_aplicada,
            doseRecomendada: d.dose_recomendada,
            insumDoseAplicada: d.insum_dose_aplicada,
            quantidadeAplicada: d.quantidade_aplicada
        }));

        res.json({ success: true, data: mappedData, total: mappedData.length });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao buscar OXIFERTIL: ' + error.message });
    }
});

// === Insumos - INSUMOS FAZENDAS ===
app.get('/api/insumos/insumos-fazendas', async (req, res) => {
    try {
        const { produto, fazenda } = req.query;
        let query = supabase.from('insumos_fazendas').select('*');

        if (produto && produto !== 'all') query = query.eq('produto', produto);
        if (fazenda && fazenda !== 'all') query = query.eq('fazenda', fazenda);

        const { data, error } = await query;
        if (error) throw error;

        const mappedData = data.map(d => ({
            ...d,
            areaTalhao: d.area_talhao,
            areaTotalAplicada: d.area_total_aplicada,
            doseRecomendada: d.dose_recomendada,
            insumDoseAplicada: d.insum_dose_aplicada,
            quantidadeAplicada: d.quantidade_aplicada
        }));

        res.json({ success: true, data: mappedData, total: mappedData.length });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao buscar insumos: ' + error.message });
    }
});

// Endpoints legados para evitar erros no frontend
app.get('/api/insumos/santa-irene', (req, res) => res.json({ success: true, data: [] }));
app.get('/api/insumos/daniela', (req, res) => res.json({ success: true, data: [] }));

// === CRUD - Adicionar insumo (Manual) ===
app.post('/api/insumos', async (req, res) => {
    try {
        const novoInsumo = req.body;
        
        // Mapper para DB
        const dbItem = {
            produto: novoInsumo.produto,
            fazenda: novoInsumo.fazenda,
            frente: novoInsumo.frente,
            area_talhao: novoInsumo.areaTalhao,
            area_total_aplicada: novoInsumo.areaTotalAplicada,
            dose_recomendada: novoInsumo.doseRecomendada,
            insum_dose_aplicada: novoInsumo.insumDoseAplicada,
            quantidade_aplicada: novoInsumo.quantidadeAplicada,
            dif: novoInsumo.dif
        };

        let table = '';
        if (novoInsumo.fornecedor === 'oxifertil') {
            table = 'insumos_oxifertil';
            dbItem.processo = novoInsumo.processo;
            dbItem.subprocesso = novoInsumo.subprocesso;
        } else {
            table = 'insumos_fazendas';
            dbItem.os = novoInsumo.os;
            dbItem.cod = novoInsumo.cod;
        }

        const { data, error } = await supabase.from(table).insert([dbItem]).select();
        if (error) throw error;

        // Baixa automática de estoque
        const produto = novoInsumo.produto;
        const frenteNum = novoInsumo.frente;
        const qtd = novoInsumo.quantidadeAplicada || 0;
        const frenteNome = (frenteNum === 1) ? 'Frente 1' : (frenteNum === 2 ? 'Frente 2' : 'Frente Abençoada');
        
        if (produto && qtd > 0) {
            // Buscar estoque atual
            const { data: estData } = await supabase.from('estoque').select('*').eq('frente', frenteNome).eq('produto', produto).single();
            const atual = estData ? Number(estData.quantidade) : 0;
            const novaQtd = Math.max(0, atual - qtd);
            
            await supabase.from('estoque').upsert({ frente: frenteNome, produto, quantidade: novaQtd }, { onConflict: 'frente, produto' });
        }

        res.json({ success: true, message: 'Insumo adicionado!', data: data[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao adicionar: ' + error.message });
    }
});

// === Estoque endpoints ===
app.get('/api/estoque', async (req, res) => {
    try {
        const { data, error } = await supabase.from('estoque').select('*');
        if (error) throw error;

        // Transformar para formato aninhado esperado pelo frontend: { 'Frente 1': { 'Produto': 10 } }
        const estoqueObj = { 'Frente 1': {}, 'Frente 2': {}, 'Frente Abençoada': {} };
        data.forEach(item => {
            if (!estoqueObj[item.frente]) estoqueObj[item.frente] = {};
            estoqueObj[item.frente][item.produto] = Number(item.quantidade);
        });

        res.json({ success: true, data: estoqueObj });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao buscar estoque' }); }
});

app.post('/api/estoque', async (req, res) => {
    try {
        const { frente, produto, quantidade } = req.body;
        if (!frente || !produto || quantidade == null) return res.status(400).json({ success: false, message: 'Dados inválidos' });
        
        // Buscar atual para somar
        const { data: curr } = await supabase.from('estoque').select('quantidade').eq('frente', frente).eq('produto', produto).single();
        const atual = curr ? Number(curr.quantidade) : 0;
        const novaQtd = atual + Number(quantidade);

        const { data, error } = await supabase.from('estoque').upsert({ frente, produto, quantidade: novaQtd }, { onConflict: 'frente, produto' }).select();
        if (error) throw error;

        res.json({ success: true, data: { frente, produto, quantidade: novaQtd } });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao salvar estoque: ' + e.message }); }
});

app.delete('/api/estoque', async (req, res) => {
    try {
        const { frente, produto } = req.body && Object.keys(req.body).length ? req.body : req.query;
        if (!frente || !produto) return res.status(400).json({ success: false, message: 'Dados inválidos' });
        
        const { error } = await supabase.from('estoque').delete().eq('frente', frente).eq('produto', produto);
        if (error) throw error;
        
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao excluir estoque' }); }
});

// === CRUD - Editar/Excluir Insumo ===
app.put('/api/insumos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const dados = req.body;
        // Tenta atualizar em ambas as tabelas (ID pode colidir? Supabase identity gera IDs únicos por tabela, mas podem repetir entre tabelas. O frontend deve saber a origem ou tentamos as duas)
        // O ideal seria o frontend enviar o 'tipo' ou 'fornecedor'.
        // Assumindo tentativa e erro se não vier fornecedor.
        
        const updates = {
            produto: dados.produto,
            fazenda: dados.fazenda,
            frente: dados.frente,
            area_talhao: dados.areaTalhao,
            area_total_aplicada: dados.areaTotalAplicada,
            dose_recomendada: dados.doseRecomendada,
            insum_dose_aplicada: dados.insumDoseAplicada,
            quantidade_aplicada: dados.quantidadeAplicada,
            dif: dados.dif
        };
        // Remover undefined
        Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);

        // Tentar Oxifertil
        let { data: d1, error: e1 } = await supabase.from('insumos_oxifertil').update(updates).eq('id', id).select();
        if (d1 && d1.length > 0) return res.json({ success: true, message: 'Insumo atualizado (Oxifertil)!' });

        // Tentar Insumos Fazendas
        let { data: d2, error: e2 } = await supabase.from('insumos_fazendas').update(updates).eq('id', id).select();
        if (d2 && d2.length > 0) return res.json({ success: true, message: 'Insumo atualizado (Fazendas)!' });

        res.status(404).json({ success: false, message: 'Insumo não encontrado' });
    } catch (error) { res.status(500).json({ success: false, message: 'Erro ao atualizar' }); }
});

app.delete('/api/insumos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Tentar Oxifertil
        const { count: c1 } = await supabase.from('insumos_oxifertil').delete().eq('id', id, { count: 'exact' });
        if (c1 > 0) return res.json({ success: true, message: 'Insumo excluído!' });

        // Tentar Insumos Fazendas
        const { count: c2 } = await supabase.from('insumos_fazendas').delete().eq('id', id, { count: 'exact' });
        if (c2 > 0) return res.json({ success: true, message: 'Insumo excluído!' });

        res.status(404).json({ success: false, message: 'Insumo não encontrado' });
    } catch (error) { res.status(500).json({ success: false, message: 'Erro ao excluir' }); }
});

// === ATUALIZAR DADOS COM IMPORTAÇÃO REAL ===
app.post('/api/insumos/atualizar-dados', async (req, res) => {
    try {
        console.log('🔄 Atualizando dados no Supabase...');
        const { dados } = req.body;
        if (!dados) return res.status(400).json({ success: false, message: 'Dados não fornecidos' });

        const updates = { oxifertil: 0, insumosFazendas: 0 };

        // Processar Oxifertil
        if (dados.oxifertil && Array.isArray(dados.oxifertil) && dados.oxifertil.length > 0) {
            const mapped = dados.oxifertil.map(d => ({
                processo: d.processo,
                subprocesso: d.subprocesso,
                produto: d.produto,
                fazenda: d.fazenda,
                area_talhao: d.areaTalhao,
                area_total_aplicada: d.areaTotalAplicada,
                dose_recomendada: d.doseRecomendada,
                insum_dose_aplicada: d.insumDoseAplicada,
                quantidade_aplicada: d.quantidadeAplicada,
                dif: d.dif,
                frente: d.frente
            }));
            const { error } = await supabase.from('insumos_oxifertil').insert(mapped); // Insert massivo
            if (error) throw error;
            updates.oxifertil = mapped.length;
        }

        // Processar Insumos Fazendas
        if (dados.insumosFazendas && Array.isArray(dados.insumosFazendas) && dados.insumosFazendas.length > 0) {
            const mapped = dados.insumosFazendas.map(d => ({
                os: d.os,
                cod: d.cod,
                fazenda: d.fazenda,
                area_talhao: d.areaTalhao,
                area_total_aplicada: d.areaTotalAplicada,
                produto: d.produto,
                dose_recomendada: d.doseRecomendada,
                quantidade_aplicada: d.quantidadeAplicada,
                frente: d.frente,
                insum_dose_aplicada: d.insumDoseAplicada // As vezes vem mapeado
            }));
            const { error } = await supabase.from('insumos_fazendas').insert(mapped);
            if (error) throw error;
            updates.insumosFazendas = mapped.length;
        }

        res.json({ success: true, message: 'Dados importados para o Supabase!', totals: updates });
    } catch (error) {
        console.error('❌ Erro ao atualizar Supabase:', error);
        res.status(500).json({ success: false, message: 'Erro ao atualizar dados: ' + error.message });
    }
});

// === IMPORT ROUTES ===
app.use('/api/importar', importRoutes);

// === AUTH ===
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    try {
        const { data: user, error } = await supabase.from('users').select('*').eq('username', username).eq('password', password).single();
        if (error || !user) return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
        
        const token = signToken(username);
        res.json({ success: true, token, user: { username } });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro no login' }); }
});

app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ success: false, message: 'Campos obrigatórios' });
    try {
        const { data: existing } = await supabase.from('users').select('id').eq('username', username).single();
        if (existing) return res.status(409).json({ success: false, message: 'Usuário já existe' });

        const { error } = await supabase.from('users').insert([{ username, password }]);
        if (error) throw error;

        const token = signToken(username);
        res.json({ success: true, token, user: { username } });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro no registro' }); }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ success: true, user: { username: req.user.username } });
});
app.post('/api/auth/logout', (req, res) => {
    res.json({ success: true });
});

// === PLANTIO DIÁRIO ===
app.get('/api/plantio-dia', async (req, res) => {
    try {
        const { data, error } = await supabase.from('plantio_diario').select('*');
        if (error) throw error;
        // Converter id string p/ number se precisar? O frontend espera? 
        // ID no banco é bigint, vem como number ou string. 
        // JS max safe int é 2^53. Timestamp cabe.
        res.json({ success: true, data });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao buscar plantio' }); }
});

app.post('/api/plantio-dia', requireAuth, async (req, res) => {
    try {
        const payload = req.body || {};
        const id = Date.now();
        const normalizeFrentes = (Array.isArray(payload.frentes) ? payload.frentes : []).map(f => ({
            frente: f.frente,
            fazenda: f.fazenda,
            cod: typeof f.cod === 'number' ? f.cod : (f.cod ? parseInt(f.cod) : undefined),
            regiao: f.regiao || f.variedade || '',
            area: Number(f.area) || 0,
            plantada: Number(f.plantada) || 0,
            areaTotal: Number(f.areaTotal) || 0,
            areaAcumulada: Number(f.areaAcumulada) || 0,
            plantioDiario: Number(f.plantioDiario) || 0,
        }));
        
        const item = {
            id,
            data: payload.data,
            responsavel: payload.responsavel || '',
            observacoes: payload.observacoes || '',
            frentes: normalizeFrentes, // Salva como JSONB
            insumos: Array.isArray(payload.insumos) ? payload.insumos : [],
            qualidade: payload.qualidade || {}
        };

        const { error } = await supabase.from('plantio_diario').insert([item]);
        if (error) throw error;

        res.json({ success: true, data: item });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao registrar: ' + e.message }); }
});

app.delete('/api/plantio-dia/:id', requireAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const { error } = await supabase.from('plantio_diario').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao excluir' }); }
});

app.get('/api/viagens-adubo', async (req, res) => {
    try {
        const { data, error } = await supabase.from('viagens_adubo').select('*');
        if (error) throw error;
        const mapped = (data || []).map(v => ({
            ...v,
            quantidadeTotal: v.quantidade_total,
            bags: Array.isArray(v.bags) ? v.bags : []
        }));
        res.json({ success: true, data: mapped });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao buscar viagens' }); }
});

app.post('/api/viagens-adubo', requireAuth, async (req, res) => {
    try {
        const payload = req.body || {};
        const id = Date.now();
        const item = {
            id,
            data: payload.data || null,
            frente: payload.frente || null,
            fazenda: payload.fazenda || null,
            origem: payload.origem || null,
            destino: payload.destino || null,
            produto: payload.produto || null,
            quantidade_total: payload.quantidadeTotal != null ? Number(payload.quantidadeTotal) : null,
            unidade: payload.unidade || null,
            caminhao: payload.caminhao || null,
            carreta1: payload.carreta1 || null,
            carreta2: payload.carreta2 || null,
            motorista: payload.motorista || null,
            documento_motorista: payload.documentoMotorista || null,
            transportadora: payload.transportadora || null,
            observacoes: payload.observacoes || null,
            bags: Array.isArray(payload.bags) ? payload.bags : []
        };
        const { data, error } = await supabase.from('viagens_adubo').insert([item]).select();
        if (error) throw error;
        const saved = data && data[0] ? data[0] : item;
        const mapped = {
            ...saved,
            quantidadeTotal: saved.quantidade_total,
            bags: Array.isArray(saved.bags) ? saved.bags : []
        };
        res.json({ success: true, data: mapped });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao registrar viagem: ' + e.message }); }
});

app.put('/api/viagens-adubo/:id', requireAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const payload = req.body || {};
        const updates = {
            data: payload.data,
            frente: payload.frente,
            fazenda: payload.fazenda,
            origem: payload.origem,
            destino: payload.destino,
            produto: payload.produto,
            quantidade_total: payload.quantidadeTotal != null ? Number(payload.quantidadeTotal) : undefined,
            unidade: payload.unidade,
            caminhao: payload.caminhao,
            carreta1: payload.carreta1,
            carreta2: payload.carreta2,
            motorista: payload.motorista,
            documento_motorista: payload.documentoMotorista,
            transportadora: payload.transportadora,
            observacoes: payload.observacoes,
            bags: Array.isArray(payload.bags) ? payload.bags : undefined
        };
        Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);
        const { data, error } = await supabase.from('viagens_adubo').update(updates).eq('id', id).select();
        if (error) throw error;
        if (!data || !data.length) return res.status(404).json({ success: false, message: 'Viagem não encontrada' });
        const saved = data[0];
        const mapped = {
            ...saved,
            quantidadeTotal: saved.quantidade_total,
            bags: Array.isArray(saved.bags) ? saved.bags : []
        };
        res.json({ success: true, data: mapped });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao atualizar viagem: ' + e.message }); }
});

app.delete('/api/viagens-adubo/:id', requireAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const { error } = await supabase.from('viagens_adubo').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao excluir viagem' }); }
});

// SPA Fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start
app.listen(PORT, () => {
    console.log(`🚀 Servidor Supabase rodando: http://localhost:${PORT}`);
    console.log(`📁 Servindo frontend de: ${frontendPath}`);
});
