class UIManager {
    constructor() {
        this.notificationTimeout = null;
    }

    showLoading() {
        const el = document.getElementById('loading');
        if (el) {
            el.style.display = 'flex';
            // Força reflow para garantir transição
            void el.offsetWidth; 
            el.classList.add('visible');
        }
    }

    hideLoading() {
        const el = document.getElementById('loading');
        if (el) {
            el.classList.remove('visible');
            // Aguarda transição se possível, ou esconde direto
            setTimeout(() => {
                if (!el.classList.contains('visible')) {
                    el.style.display = 'none';
                }
            }, 300);
        }
    }

    showNotification(message, type = 'info', duration = 5000, position = null) {
        const notification = document.getElementById('notification');
        if (!notification) return;
        notification.textContent = message;
        // Reset base classes
        notification.className = `notification ${type}`;
        // Positioning
        if (position === 'top-right') {
            notification.classList.add('top-right');
        } else if (position === 'bottom-right') {
            notification.classList.add('bottom-right');
        }
        // Show
        notification.classList.add('show');
        notification.style.display = 'block';
        
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
        if (!notification) return;
        notification.classList.remove('show', 'top-right', 'bottom-right');
        // Delay to allow animation end
        setTimeout(() => { notification.style.display = 'none'; }, 150);
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
        
        // Case 1: Already in DD/MM/YYYY format
        if (typeof val === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
            return val;
        }

        // Case 2: YYYY-MM-DD string (fix D-1 by treating as local date parts)
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
            // Extract YYYY, MM, DD regardless of time component
            const parts = val.split('T')[0].split('-'); 
            if (parts.length === 3) {
                const [y, m, d] = parts;
                return `${d}/${m}/${y}`;
            }
        }

        // Case 3: Date Object or other string format
        const d = (val instanceof Date) ? val : new Date(val);
        if (!isNaN(d)) {
            // Use UTC methods if the original string was ISO UTC (endsWith Z) 
            // BUT for this system, we want to treat everything as "what you see is what you get"
            // Best approach for "2025-01-27" string -> display "27/01/2025"
            // If we use new Date("2025-01-27"), it is UTC. toLocaleString might shift it.
            // So we rely on getUTC* methods if we suspect it's a date-only string, 
            // or get* methods if it includes time.
            
            // Simpler: Just format using local time, but correct for the specific "date-only" parsing issue if needed.
            // Actually, best is to use the manual extraction above for strings. 
            // For real Date objects:
            const dd = String(d.getDate()).padStart(2,'0');
            const mm = String(d.getMonth()+1).padStart(2,'0');
            const yyyy = d.getFullYear();
            return `${dd}/${mm}/${yyyy}`;
        }
        
        return '-';
    }

    // Helper to set <input type="date"> values correctly avoiding timezone shifts
    formatDateForInput(val) {
        if (!val) return '';
        
        // If it's already YYYY-MM-DD
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
            return val;
        }
        
        // If it's YYYY-MM-DDTHH:mm... take the date part
        if (typeof val === 'string' && val.includes('T')) {
            return val.split('T')[0];
        }

        const d = (val instanceof Date) ? val : new Date(val);
        if (isNaN(d)) return '';

        // Manually construct YYYY-MM-DD from local time to avoid UTC shift
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
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
