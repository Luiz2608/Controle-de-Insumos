class ApiService {
    constructor() {
        // Usar URL relativa para evitar problemas de CORS
        this.baseURL = '/api';
        this.cache = new Map();
        this.token = localStorage.getItem('authToken') || null;
        try { this.user = JSON.parse(localStorage.getItem('authUser') || 'null'); } catch { this.user = null; }
    }

    async request(endpoint, options = {}) {
        try {
            const url = `${this.baseURL}${endpoint}`;
            console.log(`🔄 Fazendo requisição para: ${url}`);
            
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                if (response.status === 401) {
                    this.token = null;
                    this.user = null;
                    try { localStorage.removeItem('authToken'); } catch {}
                    try { localStorage.removeItem('authUser'); } catch {}
                    try { window.uiManager?.showNotification('Sessão expirada. Faça login novamente', 'warning'); } catch {}
                    try { window.insumosApp?.showLoginScreen(); } catch {}
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log(`✅ Resposta recebida de: ${endpoint}`, data);
            
            return data;
        } catch (error) {
            console.error(`❌ Erro na requisição ${endpoint}:`, error);
            throw error;
        }
    }

    async clearImportData() {
        return this.request('/importar/dados', { method: 'DELETE' });
    }

    async clearAll() {
        return this.request('/all', { method: 'DELETE' });
    }

    async deleteEstoque(frente, produto) {
        return this.request('/estoque', { method: 'DELETE', body: JSON.stringify({ frente, produto }) });
    }

    async getPlantioDia() {
        return this.request('/plantio-dia');
    }
    async addPlantioDia(payload) {
        return this.request('/plantio-dia', { method: 'POST', body: JSON.stringify(payload) });
    }
    async deletePlantioDia(id) {
        return this.request(`/plantio-dia/${id}`, { method: 'DELETE' });
    }

    async login(username, password) {
        const res = await this.request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        if (res && res.success && res.token) {
            this.token = res.token;
            localStorage.setItem('authToken', res.token);
            if (res.user) { this.user = res.user; localStorage.setItem('authUser', JSON.stringify(res.user)); }
        }
        return res;
    }
    async logout() {
        const res = await this.request('/auth/logout', { method: 'POST' });
        this.token = null; localStorage.removeItem('authToken'); this.user = null; localStorage.removeItem('authUser');
        return res;
    }

    async register(username, password) {
        const res = await this.request('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
        if (res && res.success && res.token) {
            this.token = res.token;
            localStorage.setItem('authToken', res.token);
            if (res.user) { this.user = res.user; localStorage.setItem('authUser', JSON.stringify(res.user)); }
        }
        return res;
    }

    async me() {
        return this.request('/auth/me');
    }

    async getOxifertil(filters = {}) {
        const queryString = new URLSearchParams(filters).toString();
        return this.request(`/insumos/oxifertil?${queryString}`);
    }

    async getInsumosFazendas(filters = {}) {
        const queryString = new URLSearchParams(filters).toString();
        return this.request(`/insumos/insumos-fazendas?${queryString}`);
    }

    async getSantaIrene() {
        return this.request('/insumos/santa-irene');
    }

    async getDaniela() {
        return this.request('/insumos/daniela');
    }

    async getFazendas() {
        return this.request('/fazendas');
    }

    async getProdutos() {
        return this.request('/fazendas/produtos');
    }

    async createFazenda(payload) {
        return this.request('/fazendas', { method: 'POST', body: JSON.stringify(payload) });
    }
    async getFazendaByCodigo(codigo) {
        return this.request(`/fazendas/${codigo}`);
    }
    async updateFazenda(codigo, payload) {
        return this.request(`/fazendas/${codigo}`, { method: 'PUT', body: JSON.stringify(payload) });
    }
    async deleteFazenda(codigo) {
        return this.request(`/fazendas/${codigo}`, { method: 'DELETE' });
    }

    

    async healthCheck() {
        return this.request('/health');
    }

    clearCache() {
        this.cache.clear();
    }

    async getEstoque() {
        return this.request('/estoque');
    }

    async setEstoque(frente, produto, quantidade) {
        return this.request('/estoque', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ frente, produto, quantidade })
        });
    }
}

// Instância global do serviço API
window.apiService = new ApiService();
