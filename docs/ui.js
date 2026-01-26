class UIManager {
    constructor() {
        this.notificationTimeout = null;
    }

    showLoading() {
        document.getElementById('loading').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loading').style.display = 'none';
    }

    showNotification(message, type = 'info', duration = 5000) {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type} show`;
        
        // Limpar timeout anterior
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }
        
        // Auto-esconder
        this.notificationTimeout = setTimeout(() => {
            this.hideNotification();
        }, duration);
    }

    hideNotification() {
        const notification = document.getElementById('notification');
        notification.classList.remove('show');
    }

    populateSelect(selectElement, options, placeholder = 'Selecione...') {
        selectElement.innerHTML = `<option value="all">${placeholder}</option>`;
        
        options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option;
            optionElement.textContent = option;
            selectElement.appendChild(optionElement);
        });
    }

    formatNumber(number, decimals = 2) {
        const n = (typeof number === 'number' && !isNaN(number)) ? number : 0;
        return new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(n);
    }

    formatPercentage(number) {
        return `${this.formatNumber(number, 2)}%`;
    }

    formatDateBR(val) {
        if (!val) return '-';
        if (typeof val === 'string') {
            const m = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (m) return val;
            
            // Fix for YYYY-MM-DD causing D-1 due to timezone
            if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                const [y, m, d] = val.split('-');
                return `${d}/${m}/${y}`;
            }

            const d = new Date(val);
            if (!isNaN(d)) {
                const dd = String(d.getDate()).padStart(2,'0');
                const mm = String(d.getMonth()+1).padStart(2,'0');
                const yyyy = d.getFullYear();
                return `${dd}/${mm}/${yyyy}`;
            }
            return '-';
        }
        if (val instanceof Date) {
            const dd = String(val.getDate()).padStart(2,'0');
            const mm = String(val.getMonth()+1).padStart(2,'0');
            const yyyy = val.getFullYear();
            return `${dd}/${mm}/${yyyy}`;
        }
        return '-';
    }

    getDifferenceClass(difference) {
        if (difference > 5) return 'status-positive';
        if (difference < -5) return 'status-negative';
        return 'status-warning';
    }

    renderTable(tbody, data, rowTemplate) {
        tbody.innerHTML = '';
        
        if (!data || data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="13" class="loading">
                        📭 Nenhum dado encontrado
                    </td>
                </tr>
            `;
            return;
        }
        
        data.forEach((item, index) => {
            const row = document.createElement('tr');
            row.innerHTML = rowTemplate(item, index);
            tbody.appendChild(row);
        });
    }

    switchTab(tabName) {
        // Remove active class de todas as tabs e conteúdos
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        // Adiciona active class à tab selecionada
        const selectedTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
        const selectedContent = document.getElementById(tabName);
        
        if (selectedTab && selectedContent) {
            selectedTab.classList.add('active');
            selectedContent.classList.add('active');
        }
    }

    updateOxifertilTotals(data) {
        if (!data || data.length === 0) {
            this.resetOxifertilTotals();
            return;
        }

        const totalAreaTalhao = data.reduce((sum, item) => sum + (item.areaTalhao || 0), 0);
        const totalAreaAplicada = data.reduce((sum, item) => sum + (item.areaTotalAplicada || 0), 0);
        const totalQuantidade = data.reduce((sum, item) => sum + (item.quantidadeAplicada || 0), 0);
        
        const totalInsumDose = totalAreaAplicada > 0 ? (totalQuantidade / totalAreaAplicada) : 0;
        const totalDif = totalAreaAplicada > 0 ? ((totalInsumDose / 0.15 - 1) * 100) : 0;

        document.getElementById('total-area-talhao').textContent = this.formatNumber(totalAreaTalhao);
        document.getElementById('total-area-aplicada').textContent = this.formatNumber(totalAreaAplicada);
        document.getElementById('total-insum-dose').textContent = this.formatNumber(totalInsumDose, 7);
        document.getElementById('total-quantidade').textContent = this.formatNumber(totalQuantidade, 6);
        
        const difElement = document.getElementById('total-dif');
        difElement.textContent = this.formatPercentage(totalDif);
        difElement.className = this.getDifferenceClass(totalDif);
    }

    resetOxifertilTotals() {
        document.getElementById('total-area-talhao').textContent = '0.00';
        document.getElementById('total-area-aplicada').textContent = '0.00';
        document.getElementById('total-insum-dose').textContent = '0.0000000';
        document.getElementById('total-quantidade').textContent = '0.000000';
        
        const difElement = document.getElementById('total-dif');
        difElement.textContent = '0.00%';
        difElement.className = '';
    }
}

// Instância global do gerenciador de UI
window.uiManager = new UIManager();