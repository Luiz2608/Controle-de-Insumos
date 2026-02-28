
class LacreReportGenerator {
    constructor() {
        this.doc = null;
        this.pageWidth = 0;
        this.pageHeight = 0;
        this.margin = 15;
        this.cursorY = 0;
    }

    async generate(viagens) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('Biblioteca jsPDF não carregada. Tente recarregar a página.');
            return;
        }

        const { jsPDF } = window.jspdf;
        this.doc = new jsPDF('p', 'mm', 'a4');
        this.pageWidth = this.doc.internal.pageSize.getWidth();
        this.pageHeight = this.doc.internal.pageSize.getHeight();

        const data = this.processData(viagens);

        this.createCover(data);
        this.createExecutiveSummary(data);
        this.createFarmAnalysis(data);
        this.createFrontAnalysis(data);
        this.createDetailedList(data);
        this.createAlerts(data);
        this.createConclusion(data);
        this.addFooter();

        this.doc.save(`Relatorio_Controle_Lacres_${new Date().toISOString().split('T')[0]}.pdf`);
    }

    processData(viagens) {
        const lacres = [];
        const now = new Date();

        viagens.forEach(v => {
            if (v.bags && Array.isArray(v.bags)) {
                v.bags.forEach(bag => {
                    // Normalização
                    const numeroLacre = this.normalizeLacre(bag.lacre);
                    const identificacao = this.normalizeBagId(bag.identificacao);
                    const fazenda = this.normalizeText(v.fazenda || 'N/I');
                    const frente = this.normalizeText(v.frente || 'N/I');
                    const dataViagem = v.data ? new Date(v.data) : null;
                    const isDevolvido = !!bag.devolvido;
                    
                    let diasEmAberto = 0;
                    if (!isDevolvido && dataViagem) {
                        const diffTime = Math.abs(now - dataViagem);
                        diasEmAberto = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    }

                    if (numeroLacre) { // Só considera se tiver número de lacre
                        lacres.push({
                            data: dataViagem,
                            fazenda,
                            frente,
                            identificacao,
                            lacre: numeroLacre,
                            status: isDevolvido ? 'Devolvido' : 'Pendente',
                            diasEmAberto,
                            originalBag: bag,
                            originalViagem: v
                        });
                    }
                });
            }
        });

        // Estatísticas Gerais
        const total = lacres.length;
        const devolvidos = lacres.filter(l => l.status === 'Devolvido').length;
        const pendentes = total - devolvidos;
        const percDevolucao = total > 0 ? (devolvidos / total) * 100 : 0;
        const percPendencia = total > 0 ? (pendentes / total) * 100 : 0;

        // Rankings
        const fazendasStats = {};
        const frentesStats = {};

        lacres.forEach(l => {
            // Fazendas
            if (!fazendasStats[l.fazenda]) fazendasStats[l.fazenda] = { total: 0, devolvidos: 0, pendentes: 0 };
            fazendasStats[l.fazenda].total++;
            if (l.status === 'Devolvido') fazendasStats[l.fazenda].devolvidos++;
            else fazendasStats[l.fazenda].pendentes++;

            // Frentes
            if (!frentesStats[l.frente]) frentesStats[l.frente] = { total: 0, devolvidos: 0, pendentes: 0 };
            frentesStats[l.frente].total++;
            if (l.status === 'Devolvido') frentesStats[l.frente].devolvidos++;
            else frentesStats[l.frente].pendentes++;
        });

        // Alertas
        const alertas = {
            atrasados: lacres.filter(l => l.status === 'Pendente' && l.diasEmAberto > 30),
            duplicados: [],
            inconsistentes: [], // Padrão divergente já tratado na normalização, mas podemos listar os originais estranhos se quisermos. Aqui vamos focar em duplicidade lógica.
            divergentes: lacres.filter(l => !l.lacre.match(/^\d+$/)) // Ex: lacres que não são apenas números
        };

        // Checar duplicados
        const mapLacres = {};
        lacres.forEach(l => {
            if (!mapLacres[l.lacre]) mapLacres[l.lacre] = [];
            mapLacres[l.lacre].push(l);
        });
        for (const [key, val] of Object.entries(mapLacres)) {
            if (val.length > 1) alertas.duplicados.push({ lacre: key, ocorrencias: val.length, details: val });
        }

        return {
            lacres: lacres.sort((a, b) => (b.data || 0) - (a.data || 0)), // Mais recentes primeiro
            stats: { total, devolvidos, pendentes, percDevolucao, percPendencia },
            fazendas: fazendasStats,
            frentes: frentesStats,
            alertas
        };
    }

    normalizeLacre(val) {
        if (!val) return '';
        // Remove espaços e padroniza zeros à esquerda (assumindo 6 dígitos como padrão ideal, mas adaptável)
        let s = String(val).trim();
        // Se for numérico, padroniza com zeros à esquerda até 6 dígitos (exemplo)
        if (/^\d+$/.test(s)) {
            return s.padStart(6, '0');
        }
        return s.toUpperCase();
    }

    normalizeBagId(val) {
        if (!val) return 'BAG S/N';
        let s = String(val).trim().toUpperCase();
        // Tenta padronizar "BAG 1", "BAG01" -> "BAG 01"
        const match = s.match(/BAG\s*0*(\d+)/);
        if (match) {
            return `BAG ${match[1].padStart(2, '0')}`;
        }
        return s;
    }

    normalizeText(val) {
        if (!val) return '';
        return String(val).trim().toUpperCase();
    }

    // --- PDF Helper Methods ---

    addPage() {
        this.doc.addPage();
        this.cursorY = this.margin;
    }

    checkSpace(needed) {
        if (this.cursorY + needed > this.pageHeight - this.margin) {
            this.addPage();
        }
    }

    // 1. CAPA
    createCover(data) {
        this.cursorY = 60;
        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(22);
        this.doc.text("RELATÓRIO GERENCIAL DE", this.pageWidth / 2, this.cursorY, { align: "center" });
        this.cursorY += 12;
        this.doc.text("CONTROLE DE LACRES", this.pageWidth / 2, this.cursorY, { align: "center" });
        
        this.cursorY += 30;
        this.doc.setFontSize(14);
        this.doc.setFont("helvetica", "normal");
        
        const period = this.getPeriodText(data.lacres);
        this.doc.text(`Período Analisado: ${period}`, this.pageWidth / 2, this.cursorY, { align: "center" });
        this.cursorY += 10;
        this.doc.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}`, this.pageWidth / 2, this.cursorY, { align: "center" });
        
        this.cursorY += 40;
        this.doc.setFontSize(16);
        this.doc.setFont("helvetica", "bold");
        this.doc.text("AGRO MCN", this.pageWidth / 2, this.cursorY, { align: "center" }); // Nome fictício ou pegar de config
        
        this.cursorY += 10;
        this.doc.setFontSize(12);
        this.doc.setFont("helvetica", "normal");
        // Tenta pegar usuário logado
        const user = window.insumosApp?.api?.user?.firstName || 'Gestor Responsável';
        this.doc.text(`Responsável: ${user}`, this.pageWidth / 2, this.cursorY, { align: "center" });

        this.addPage(); // Vai para conteúdo
    }

    getPeriodText(lacres) {
        if (lacres.length === 0) return "N/A";
        const dates = lacres.map(l => l.data).filter(d => d).sort((a, b) => a - b);
        if (dates.length === 0) return "N/A";
        const start = dates[0].toLocaleDateString('pt-BR');
        const end = dates[dates.length - 1].toLocaleDateString('pt-BR');
        return `${start} a ${end}`;
    }

    // 2. RESUMO EXECUTIVO
    createExecutiveSummary(data) {
        this.doc.setFontSize(16);
        this.doc.setFont("helvetica", "bold");
        this.doc.text("1. RESUMO EXECUTIVO", this.margin, this.cursorY);
        this.cursorY += 10;

        // Cards (Simulados com retângulos)
        const stats = data.stats;
        const cardWidth = 40;
        const cardHeight = 25;
        const gap = 5;
        let startX = this.margin;

        this.drawCard(startX, this.cursorY, cardWidth, cardHeight, "Total Lacres", stats.total.toString(), [220, 220, 220]);
        startX += cardWidth + gap;
        this.drawCard(startX, this.cursorY, cardWidth, cardHeight, "Devolvidos", stats.devolvidos.toString(), [200, 230, 201]); // Verde claro
        startX += cardWidth + gap;
        this.drawCard(startX, this.cursorY, cardWidth, cardHeight, "Pendentes", stats.pendentes.toString(), [255, 205, 210]); // Vermelho claro
        startX += cardWidth + gap;
        this.drawCard(startX, this.cursorY, cardWidth, cardHeight, "% Devolução", stats.percDevolucao.toFixed(1) + "%", [255, 255, 255]);

        this.cursorY += cardHeight + 15;

        // Rankings
        this.doc.setFontSize(12);
        this.doc.text("Top Pendências por Fazenda:", this.margin, this.cursorY);
        this.cursorY += 6;
        
        const sortedFazendas = Object.entries(data.fazendas)
            .sort(([,a], [,b]) => b.pendentes - a.pendentes)
            .slice(0, 5);

        sortedFazendas.forEach(([name, st], i) => {
            this.doc.setFont("helvetica", "normal");
            this.doc.setFontSize(10);
            this.doc.text(`${i+1}. ${name}: ${st.pendentes} pendentes`, this.margin + 5, this.cursorY);
            this.cursorY += 5;
        });

        this.cursorY += 5;
    }

    drawCard(x, y, w, h, title, value, bgColor) {
        this.doc.setFillColor(...bgColor);
        this.doc.rect(x, y, w, h, 'F');
        this.doc.rect(x, y, w, h, 'S'); // Borda
        
        this.doc.setFontSize(8);
        this.doc.setTextColor(0);
        this.doc.text(title, x + w/2, y + 8, { align: "center" });
        
        this.doc.setFontSize(12);
        this.doc.setFont("helvetica", "bold");
        this.doc.text(value, x + w/2, y + 18, { align: "center" });
    }

    // 3. ANÁLISE POR FAZENDA
    createFarmAnalysis(data) {
        this.cursorY += 10;
        this.checkSpace(60);
        
        this.doc.setFontSize(16);
        this.doc.setFont("helvetica", "bold");
        this.doc.text("2. ANÁLISE POR FAZENDA", this.margin, this.cursorY);
        this.cursorY += 8;

        const headers = [["Fazenda", "Total", "Devolvidos", "Pendentes", "% Pend.", "Risco"]];
        const body = Object.entries(data.fazendas).map(([name, st]) => {
            const percPend = st.total > 0 ? (st.pendentes / st.total) * 100 : 0;
            let risco = "Baixo";
            if (percPend > 25) risco = "ALTO";
            else if (percPend > 10) risco = "Médio";
            
            return [
                name,
                st.total,
                st.devolvidos,
                st.pendentes,
                percPend.toFixed(1) + "%",
                risco
            ];
        });

        // Ordenar por risco (Alto primeiro)
        body.sort((a, b) => {
            const map = { "ALTO": 3, "Médio": 2, "Baixo": 1 };
            return map[b[5]] - map[a[5]];
        });

        this.doc.autoTable({
            startY: this.cursorY,
            head: headers,
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [46, 125, 50] },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 5) {
                    if (data.cell.raw === 'ALTO') data.cell.styles.textColor = [200, 0, 0];
                    if (data.cell.raw === 'Médio') data.cell.styles.textColor = [200, 150, 0];
                    if (data.cell.raw === 'Baixo') data.cell.styles.textColor = [0, 100, 0];
                }
            }
        });

        this.cursorY = this.doc.lastAutoTable.finalY + 10;
    }

    // 4. ANÁLISE POR FRENTE
    createFrontAnalysis(data) {
        this.checkSpace(60);
        this.doc.setFontSize(16);
        this.doc.setFont("helvetica", "bold");
        this.doc.text("3. ANÁLISE POR FRENTE", this.margin, this.cursorY);
        this.cursorY += 8;

        const headers = [["Frente", "Total", "Devolvidos", "Pendentes", "% Eficiência"]];
        const body = Object.entries(data.frentes).map(([name, st]) => {
            const percDev = st.total > 0 ? (st.devolvidos / st.total) * 100 : 0;
            return [
                name,
                st.total,
                st.devolvidos,
                st.pendentes,
                percDev.toFixed(1) + "%"
            ];
        });

        this.doc.autoTable({
            startY: this.cursorY,
            head: headers,
            body: body,
            theme: 'striped',
            headStyles: { fillColor: [0, 121, 107] }
        });

        this.cursorY = this.doc.lastAutoTable.finalY + 15;
    }

    // 5. LISTAGEM DETALHADA
    createDetailedList(data) {
        this.addPage();
        this.doc.setFontSize(16);
        this.doc.setFont("helvetica", "bold");
        this.doc.text("4. LISTAGEM DETALHADA DE LACRES", this.margin, this.cursorY);
        this.cursorY += 8;

        const headers = [["Data", "Fazenda", "Frente", "Bag ID", "Lacre", "Status", "Dias Aberto"]];
        const body = data.lacres.map(l => [
            l.data ? l.data.toLocaleDateString('pt-BR') : '-',
            l.fazenda,
            l.frente,
            l.identificacao,
            l.lacre,
            l.status,
            l.status === 'Pendente' ? l.diasEmAberto : '-'
        ]);

        this.doc.autoTable({
            startY: this.cursorY,
            head: headers,
            body: body,
            theme: 'plain',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [100, 100, 100], textColor: 255 },
            columnStyles: {
                5: { fontStyle: 'bold' } // Status
            },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 5) {
                    if (data.cell.raw === 'Pendente') data.cell.styles.textColor = [200, 0, 0];
                    else data.cell.styles.textColor = [0, 100, 0];
                }
            }
        });

        this.cursorY = this.doc.lastAutoTable.finalY + 15;
    }

    // 6. ALERTAS AUTOMÁTICOS
    createAlerts(data) {
        this.addPage();
        this.doc.setFontSize(16);
        this.doc.setFont("helvetica", "bold");
        this.doc.text("5. ALERTAS E INCONSISTÊNCIAS", this.margin, this.cursorY);
        this.cursorY += 10;

        // Atrasos
        this.doc.setFontSize(12);
        this.doc.setTextColor(200, 0, 0);
        this.doc.text(`⚠️ Lacres Pendentes Críticos (> 30 dias): ${data.alertas.atrasados.length}`, this.margin, this.cursorY);
        this.cursorY += 6;
        this.doc.setFont("helvetica", "normal");
        this.doc.setTextColor(0);
        this.doc.setFontSize(10);
        if (data.alertas.atrasados.length > 0) {
            data.alertas.atrasados.slice(0, 10).forEach(l => {
                this.doc.text(`- Lacre ${l.lacre} (${l.fazenda}): ${l.diasEmAberto} dias`, this.margin + 5, this.cursorY);
                this.cursorY += 5;
            });
            if (data.alertas.atrasados.length > 10) {
                this.doc.text(`... e mais ${data.alertas.atrasados.length - 10} casos.`, this.margin + 5, this.cursorY);
                this.cursorY += 5;
            }
        } else {
            this.doc.text("Nenhum caso crítico identificado.", this.margin + 5, this.cursorY);
            this.cursorY += 5;
        }

        this.cursorY += 5;

        // Duplicados
        this.doc.setFontSize(12);
        this.doc.setFont("helvetica", "bold");
        this.doc.setTextColor(200, 150, 0);
        this.doc.text(`⚠️ Duplicidade de Numeração: ${data.alertas.duplicados.length} casos`, this.margin, this.cursorY);
        this.cursorY += 6;
        this.doc.setFont("helvetica", "normal");
        this.doc.setTextColor(0);
        this.doc.setFontSize(10);
        
        if (data.alertas.duplicados.length > 0) {
            data.alertas.duplicados.forEach(d => {
                this.doc.text(`- Lacre ${d.lacre}: Aparece ${d.ocorrencias} vezes`, this.margin + 5, this.cursorY);
                this.cursorY += 5;
            });
        } else {
            this.doc.text("Nenhuma duplicidade encontrada.", this.margin + 5, this.cursorY);
            this.cursorY += 5;
        }
    }

    // 7. CONCLUSÃO GERENCIAL
    createConclusion(data) {
        this.cursorY += 15;
        this.checkSpace(80);
        
        this.doc.setFontSize(16);
        this.doc.setFont("helvetica", "bold");
        this.doc.setTextColor(0);
        this.doc.text("6. CONCLUSÃO GERENCIAL", this.margin, this.cursorY);
        this.cursorY += 10;

        this.doc.setFontSize(11);
        this.doc.setFont("helvetica", "normal");

        const percPend = data.stats.percPendencia;
        let situation = "";
        let recommendation = "";

        if (percPend < 5) {
            situation = "A situação do controle de lacres encontra-se em nível EXCELENTE, com baixo índice de pendências.";
            recommendation = "Manter o rigor atual nos lançamentos e conferências de devolução.";
        } else if (percPend < 15) {
            situation = "A situação encontra-se em nível REGULAR. Existe um volume moderado de lacres não baixados.";
            recommendation = "Reforçar a cobrança junto às frentes com maiores pendências e verificar se há falha no processo de registro de devolução.";
        } else {
            situation = "A situação é CRÍTICA. O volume de pendências compromete a integridade do controle.";
            recommendation = "Realizar auditoria urgente nas fazendas de alto risco e revisar o fluxo de recolhimento das embalagens vazias.";
        }

        const text = [
            `Situação Geral: ${situation}`,
            "",
            "Recomendações Operacionais:",
            `1. ${recommendation}`,
            "2. Verificar periodicamente os alertas de duplicidade para evitar erros de digitação.",
            "3. Priorizar a regularização dos lacres com mais de 30 dias em aberto."
        ];

        this.doc.text(text, this.margin, this.cursorY);
    }

    addFooter() {
        const pageCount = this.doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            this.doc.setPage(i);
            this.doc.setFontSize(8);
            this.doc.setTextColor(150);
            this.doc.text(`Página ${i} de ${pageCount} - Relatório Gerado pelo Sistema Agro MCN`, this.pageWidth / 2, this.pageHeight - 10, { align: "center" });
        }
    }
}

// Expor globalmente
window.LacreReportGenerator = LacreReportGenerator;
