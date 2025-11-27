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

// Estoque por frente
let estoque = {
    'Frente 1': {},
    'Frente 2': {},
    'Frente Abençoada': {}
};
// Plantio diário
let plantioDia = [];
// Cadastro de fazendas (em memória)
let fazendasCad = {
    // cod: { cod, nome, areaTotal, plantioAcumulado, mudaAcumulada, regiao }
    1030: { cod: 1030, nome: 'ORIENTE', areaTotal: 0, plantioAcumulado: 0, mudaAcumulada: 0, regiao: '' }
};

// Auth simples em memória
const crypto = require('crypto');
const users = [{ username: 'admin', password: '123456' }];
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

// CRUD de Fazendas (em memória)
// Modelo: { codigo, nome, regiao, area_total, plantio_acumulado, muda_acumulada, observacoes }
const fazendasStore = new Map();
// Seed básico
fazendasStore.set('1030', { codigo: '1030', nome: 'ORIENTE', regiao: '', area_total: 0, plantio_acumulado: 0, muda_acumulada: 0, observacoes: '' });

// GET lista completa
app.get('/api/fazendas', (req, res) => {
    try {
        res.json({ success: true, data: Array.from(fazendasStore.values()) });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao listar fazendas' }); }
});

// Rotas auxiliares devem vir ANTES das rotas com parâmetro
app.get('/api/fazendas/produtos', (req, res) => {
    res.json({ success: true, data: filterData.produtos });
});

app.get('/api/fazendas/fornecedores', (req, res) => {
    res.json({ success: true, data: filterData.fornecedores });
});

// POST criar
app.post('/api/fazendas', (req, res) => {
    try {
        const { codigo, nome, regiao = '', area_total = 0, plantio_acumulado = 0, muda_acumulada = 0, observacoes = '' } = req.body || {};
        if (!codigo || !nome) return res.status(400).json({ success: false, message: 'codigo e nome são obrigatórios' });
        if (fazendasStore.has(String(codigo))) return res.status(409).json({ success: false, message: 'Fazenda já existe' });
        const item = { codigo: String(codigo), nome, regiao, area_total: Number(area_total)||0, plantio_acumulado: Number(plantio_acumulado)||0, muda_acumulada: Number(muda_acumulada)||0, observacoes };
        fazendasStore.set(item.codigo, item);
        res.json({ success: true, data: item });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao criar fazenda' }); }
});

// GET por código
app.get('/api/fazendas/:codigo', (req, res) => {
    try { const codigo = String(req.params.codigo); const f = fazendasStore.get(codigo); if (!f) return res.status(404).json({ success: false, message: 'Fazenda não encontrada' }); res.json({ success: true, data: f }); } catch(e) { res.status(500).json({ success: false, message: 'Erro ao buscar fazenda' }); }
});

// PUT atualizar
app.put('/api/fazendas/:codigo', (req, res) => {
    try {
        const codigo = String(req.params.codigo);
        if (!fazendasStore.has(codigo)) return res.status(404).json({ success: false, message: 'Fazenda não encontrada' });
        const curr = fazendasStore.get(codigo);
        const { nome, regiao, area_total, plantio_acumulado, muda_acumulada, observacoes } = req.body || {};
        const updated = {
            codigo,
            nome: nome ?? curr.nome,
            regiao: regiao ?? curr.regiao,
            area_total: area_total != null ? Number(area_total)||0 : curr.area_total,
            plantio_acumulado: plantio_acumulado != null ? Number(plantio_acumulado)||0 : curr.plantio_acumulado,
            muda_acumulada: muda_acumulada != null ? Number(muda_acumulada)||0 : curr.muda_acumulada,
            observacoes: observacoes ?? curr.observacoes
        };
        fazendasStore.set(codigo, updated);
        res.json({ success: true, data: updated });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao atualizar fazenda' }); }
});

// DELETE apagar
app.delete('/api/fazendas/:codigo', (req, res) => {
    try { const codigo = String(req.params.codigo); if (!fazendasStore.has(codigo)) return res.status(404).json({ success: false, message: 'Fazenda não encontrada' }); fazendasStore.delete(codigo); res.json({ success: true }); } catch(e) { res.status(500).json({ success: false, message: 'Erro ao excluir fazenda' }); }
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

        // Baixa automática de estoque
        const produto = novoInsumo.produto;
        const frenteNum = novoInsumo.frente;
        const qtd = novoInsumo.quantidadeAplicada || 0;
        const frenteNome = (frenteNum === 1) ? 'Frente 1' : (frenteNum === 2 ? 'Frente 2' : 'Frente Abençoada');
        if (produto && qtd > 0 && estoque[frenteNome]) {
            const atual = estoque[frenteNome][produto] || 0;
            estoque[frenteNome][produto] = Math.max(0, atual - qtd);
        }

        res.json({ success: true, message: 'Insumo adicionado!', data: novoInsumo });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao adicionar' });
    }
});

// Estoque endpoints
app.get('/api/estoque', (req, res) => {
    try { res.json({ success: true, data: estoque }); } catch(e) { res.status(500).json({ success: false }); }
});
app.post('/api/estoque', (req, res) => {
    try {
        const { frente, produto, quantidade } = req.body;
        if (!frente || !produto || quantidade == null) return res.status(400).json({ success: false, message: 'Dados inválidos' });
        if (!estoque[frente]) estoque[frente] = {};
        const atual = estoque[frente][produto] || 0;
        estoque[frente][produto] = atual + Number(quantidade);
        res.json({ success: true, data: { frente, produto, quantidade: estoque[frente][produto] } });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao salvar estoque' }); }
});

app.delete('/api/estoque', (req, res) => {
    try {
        const { frente, produto } = req.body && Object.keys(req.body).length ? req.body : req.query;
        if (!frente || !produto) return res.status(400).json({ success: false, message: 'Dados inválidos' });
        if (estoque[frente] && estoque[frente][produto] != null) {
            delete estoque[frente][produto];
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Lançamento não encontrado' });
        }
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao excluir estoque' }); }
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

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    const ok = users.find(u => u.username === username && u.password === password);
    if (!ok) return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    const token = signToken(username);
    res.json({ success: true, token, user: { username } });
});
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
    const exists = users.find(u => u.username === username);
    if (exists) return res.status(409).json({ success: false, message: 'Usuário já existe' });
    users.push({ username, password });
    const token = signToken(username);
    res.json({ success: true, token, user: { username } });
});
app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ success: true, user: { username: req.user.username } });
});
app.post('/api/auth/logout', (req, res) => {
    res.json({ success: true });
});

// Plantio diário endpoints (antes do catch-all)
app.get('/api/plantio-dia', (req, res) => {
    try { res.json({ success: true, data: plantioDia }); } catch(e) { res.status(500).json({ success: false }); }
});
app.post('/api/plantio-dia', requireAuth, (req, res) => {
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
            frentes: normalizeFrentes,
            insumos: Array.isArray(payload.insumos) ? payload.insumos : [],
            qualidade: payload.qualidade || {}
        };
        plantioDia.push(item);
        res.json({ success: true, data: item });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao registrar' }); }
});
app.delete('/api/plantio-dia/:id', requireAuth, (req, res) => {
    try {
        const id = req.params.id;
        const idx = plantioDia.findIndex(i => String(i.id) === String(id));
        if (idx >= 0) { plantioDia.splice(idx, 1); return res.json({ success: true }); }
        res.status(404).json({ success: false, message: 'Registro não encontrado' });
    } catch(e) { res.status(500).json({ success: false, message: 'Erro ao excluir' }); }
});

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

// Excluir todos os dados (insumos e estoque)
app.delete('/api/all', (req, res) => {
    try {
        insumosData = { oxifertil: [], insumosFazendas: [], santaIrene: [], daniela: [] };
        estoque = { 'Frente 1': {}, 'Frente 2': {}, 'Frente Abençoada': {} };
        if (typeof plantioDia !== 'undefined') plantioDia = [];
        res.json({ success: true, message: 'Todos os dados foram excluídos' });
    } catch(e) {
        res.status(500).json({ success: false, message: 'Erro ao excluir todos os dados' });
    }
});
// Endpoints antigos de cadastro removidos em favor de /api/fazendas
