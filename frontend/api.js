class ApiService {
    constructor() {
        // Usar URL relativa para evitar problemas de CORS
        this.baseURL = '/api';
        this.cache = new Map();
    }

    async request(endpoint, options = {}) {
        try {
            const url = `${this.baseURL}${endpoint}`;
            console.log(`🔄 Fazendo requisição para: ${url}`);
            
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
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