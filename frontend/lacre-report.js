
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

        // Ordem do novo padrão
        this.createHeader(data);
        this.createOperationalOverview(data);
        this.createFarmRiskAnalysis(data);
        this.createFrontPerformance(data);
        this.createTemporalAnalysis(data);
        this.createDataIntegrityAudit(data);
        this.createConsolidatedList(data);
        this.createTechnicalDiagnosis(data);
        this.addPageNumbers();

        this.doc.save(`Relatorio_Operacional_Lacres_${new Date().toISOString().split('T')[0]}.pdf`);
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

                    if (numeroLacre) { 
                        lacres.push({
                            data: dataViagem,
                            fazenda,
                            frente,
                            identificacao,
                            lacre: numeroLacre,
                            status: isDevolvido ? 'DEVOLVIDO' : 'PENDENTE',
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
        const devolvidos = lacres.filter(l => l.status === 'DEVOLVIDO').length;
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
            if (l.status === 'DEVOLVIDO') fazendasStats[l.fazenda].devolvidos++;
            else fazendasStats[l.fazenda].pendentes++;

            // Frentes
            if (!frentesStats[l.frente]) frentesStats[l.frente] = { total: 0, devolvidos: 0, pendentes: 0 };
            frentesStats[l.frente].total++;
            if (l.status === 'DEVOLVIDO') frentesStats[l.frente].devolvidos++;
            else frentesStats[l.frente].pendentes++;
        });

        // Auditoria
        const auditoria = {
            duplicados: [],
            sequenciaIncoerente: [], // Placeholder
            divergenciaPadrao: lacres.filter(l => !l.originalBag.identificacao.match(/^BAG \d{2}$/i) && !l.originalBag.identificacao.match(/^BAG\d{2}$/i)),
            foraPadraoDigitos: lacres.filter(l => l.lacre.length !== 6),
            inconsistentes: []
        };

        // Checar duplicados
        const mapLacres = {};
        lacres.forEach(l => {
            if (!mapLacres[l.lacre]) mapLacres[l.lacre] = [];
            mapLacres[l.lacre].push(l);
        });
        for (const [key, val] of Object.entries(mapLacres)) {
            if (val.length > 1) auditoria.duplicados.push({ lacre: key, ocorrencias: val.length });
        }

        // Aging
        const aging = {
            d0_7: lacres.filter(l => l.status === 'PENDENTE' && l.diasEmAberto <= 7).length,
            d8_15: lacres.filter(l => l.status === 'PENDENTE' && l.diasEmAberto > 7 && l.diasEmAberto <= 15).length,
            d16_30: lacres.filter(l => l.status === 'PENDENTE' && l.diasEmAberto > 15 && l.diasEmAberto <= 30).length,
            d30_plus: lacres.filter(l => l.status === 'PENDENTE' && l.diasEmAberto > 30).length
        };

        return {
            lacres,
            stats: { total, devolvidos, pendentes, percDevolucao, percPendencia },
            fazendas: fazendasStats,
            frentes: frentesStats,
            auditoria,
            aging
        };
    }

    normalizeLacre(val) {
        if (!val) return '';
        let s = String(val).trim();
        if (/^\d+$/.test(s)) {
            return s.padStart(6, '0');
        }
        return s.toUpperCase();
    }

    normalizeBagId(val) {
        if (!val) return 'BAG 00';
        let s = String(val).trim().toUpperCase();
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

    // --- PDF Components ---

    addPage() {
        this.doc.addPage();
        this.cursorY = this.margin + 10; // Margem superior maior
    }

    checkSpace(needed) {
        if (this.cursorY + needed > this.pageHeight - this.margin) {
            this.addPage();
        }
    }

    // Cabeçalho Institucional
    createHeader(data) {
        this.cursorY = 20;
        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(14);
        this.doc.text("RELATÓRIO OPERACIONAL DE CONTROLE DE LACRES", this.margin, this.cursorY);
        
        this.doc.setFont("helvetica", "normal");
        this.doc.setFontSize(10);
        this.cursorY += 8;
        
        const user = window.insumosApp?.api?.user?.firstName || 'Gestor Responsável';
        const period = this.getPeriodText(data.lacres);
        
        this.doc.text(`Unidade: AGRO MCN`, this.margin, this.cursorY);
        this.doc.text(`Período: ${period}`, this.margin + 80, this.cursorY);
        this.cursorY += 5;
        this.doc.text(`Responsável Técnico: ${user}`, this.margin, this.cursorY);
        this.doc.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}`, this.margin + 80, this.cursorY);
        
        this.cursorY += 5;
        this.doc.setLineWidth(0.5);
        this.doc.line(this.margin, this.cursorY, this.pageWidth - this.margin, this.cursorY);
        this.cursorY += 10;
    }

    getPeriodText(lacres) {
        if (lacres.length === 0) return "N/A";
        const dates = lacres.map(l => l.data).filter(d => d).sort((a, b) => a - b);
        if (dates.length === 0) return "N/A";
        const start = dates[0].toLocaleDateString('pt-BR');
        const end = dates[dates.length - 1].toLocaleDateString('pt-BR');
        return `${start} a ${end}`;
    }

    // 1. VISÃO GERAL OPERACIONAL
    createOperationalOverview(data) {
        this.sectionTitle("1. VISÃO GERAL OPERACIONAL (Indicadores Estratégicos)");
        
        const stats = data.stats;
        
        // Classificação
        let classificacao = "";
        let corClassificacao = [0, 0, 0];
        let interpretacao = "";
        
        if (stats.percDevolucao >= 90) {
            classificacao = "EXCELENTE CONTROLE";
            corClassificacao = [0, 100, 0];
            interpretacao = "O processo de recolhimento apresenta alta eficácia, garantindo rastreabilidade quase total dos insumos utilizados.";
        } else if (stats.percDevolucao >= 80) {
            classificacao = "CONTROLE ADEQUADO";
            corClassificacao = [0, 0, 200];
            interpretacao = "Indicadores dentro da margem aceitável, porém com pontos de atenção pontuais que requerem monitoramento.";
        } else if (stats.percDevolucao >= 65) {
            classificacao = "ALERTA OPERACIONAL";
            corClassificacao = [200, 150, 0];
            interpretacao = "Volume de pendências elevado, indicando falhas no fluxo de retorno das embalagens ou atraso nos lançamentos.";
        } else {
            classificacao = "NÃO CONFORMIDADE OPERACIONAL";
            corClassificacao = [200, 0, 0];
            interpretacao = "Situação crítica com risco severo de perda de rastreabilidade. Necessária intervenção imediata nos processos.";
        }

        // Tabela de Indicadores
        const headers = [["Indicador", "Valor", "Meta Ref.", "Status"]];
        const body = [
            ["Total de Lacres Emitidos", stats.total, "-", "-"],
            ["Total de Lacres Devolvidos", stats.devolvidos, "-", "-"],
            ["Total de Lacres Pendentes", stats.pendentes, "0", stats.pendentes > 0 ? "Atenção" : "OK"],
            ["Taxa Geral de Devolução", stats.percDevolucao.toFixed(1) + "%", "> 90%", classificacao],
            ["Taxa Geral de Pendência", stats.percPendencia.toFixed(1) + "%", "< 10%", "-"]
        ];

        this.doc.autoTable({
            startY: this.cursorY,
            head: headers,
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold' },
            columnStyles: { 
                0: { fontStyle: 'bold' },
                3: { fontStyle: 'bold', textColor: corClassificacao }
            },
            margin: { left: this.margin, right: this.margin }
        });
        
        this.cursorY = this.doc.lastAutoTable.finalY + 5;
        
        // Interpretação Técnica
        this.doc.setFontSize(9);
        this.doc.setFont("helvetica", "italic");
        this.doc.text(`Nota Técnica: ${interpretacao}`, this.margin, this.cursorY, { maxWidth: this.pageWidth - (this.margin*2) });
        this.cursorY += 15;
    }

    // 2. ANÁLISE DE RISCO POR FAZENDA
    createFarmRiskAnalysis(data) {
        this.checkSpace(60);
        this.sectionTitle("2. ANÁLISE DE RISCO POR FAZENDA");

        const body = Object.entries(data.fazendas).map(([name, st]) => {
            const percPend = st.total > 0 ? (st.pendentes / st.total) * 100 : 0;
            let classificacao = "";
            let nivel = 0; // Para ordenação

            if (percPend <= 10) { classificacao = "BAIXO RISCO"; nivel = 1; }
            else if (percPend <= 25) { classificacao = "RISCO MODERADO"; nivel = 2; }
            else if (percPend <= 40) { classificacao = "RISCO ELEVADO"; nivel = 3; }
            else { classificacao = "RISCO CRÍTICO"; nivel = 4; }

            return { name, ...st, percPend, classificacao, nivel };
        });

        // Ordenar por nível de risco (desc) e depois por total de pendências
        body.sort((a, b) => b.nivel - a.nivel || b.pendentes - a.pendentes);

        const tableBody = body.map(row => [
            row.name,
            row.total,
            row.pendentes,
            row.percPend.toFixed(1) + "%",
            row.classificacao
        ]);

        this.doc.autoTable({
            startY: this.cursorY,
            head: [["Fazenda", "Total", "Pendentes", "% Pendência", "Nível de Exposição"]],
            body: tableBody,
            theme: 'striped',
            headStyles: { fillColor: [50, 50, 50] },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 4) {
                    const val = data.cell.raw;
                    if (val.includes("CRÍTICO")) data.cell.styles.textColor = [200, 0, 0];
                    else if (val.includes("ELEVADO")) data.cell.styles.textColor = [200, 100, 0];
                    else if (val.includes("MODERADO")) data.cell.styles.textColor = [200, 180, 0];
                    else data.cell.styles.textColor = [0, 100, 0];
                }
            }
        });
        
        this.cursorY = this.doc.lastAutoTable.finalY + 5;

        // Observação Automática
        const totalPendentesGeral = data.stats.pendentes;
        if (totalPendentesGeral > 0) {
            const concentradores = body.filter(f => (f.pendentes / totalPendentesGeral) > 0.30);
            if (concentradores.length > 0) {
                this.doc.setFontSize(9);
                this.doc.setTextColor(150, 0, 0);
                const nomes = concentradores.map(c => c.name).join(", ");
                this.doc.text(`⚠️ Atenção: As fazendas [${nomes}] concentram mais de 30% das pendências totais.`, this.margin, this.cursorY);
                this.doc.setTextColor(0);
                this.cursorY += 10;
            }
        }
    }

    // 3. ANÁLISE DE PERFORMANCE POR FRENTE
    createFrontPerformance(data) {
        this.checkSpace(60);
        this.sectionTitle("3. ANÁLISE DE PERFORMANCE POR FRENTE OPERACIONAL");

        const body = Object.entries(data.frentes).map(([name, st]) => {
            const eficiencia = st.total > 0 ? (st.devolvidos / st.total) * 100 : 0;
            return { name, ...st, eficiencia };
        });

        // Ordenar por eficiência (crescente -> pior primeiro)
        body.sort((a, b) => a.eficiencia - b.eficiencia);

        const tableBody = body.map((row, index) => [
            row.name,
            row.total,
            row.pendentes,
            row.eficiencia.toFixed(1) + "%",
            `${index + 1}º` // Ranking inverso (1º é o pior)
        ]);

        this.doc.autoTable({
            startY: this.cursorY,
            head: [["Frente", "Total Lacres", "Pendentes", "Índice de Eficiência", "Ranking (Pior Desemp.)"]],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [70, 70, 70] }
        });
        
        if (body.length > 0) {
            this.cursorY = this.doc.lastAutoTable.finalY + 5;
            this.doc.setFontSize(9);
            this.doc.text(`Frente com maior impacto operacional negativo: ${body[0].name}`, this.margin, this.cursorY);
            this.cursorY += 10;
        } else {
            this.cursorY = this.doc.lastAutoTable.finalY + 10;
        }
    }

    // 4. ANÁLISE TEMPORAL
    createTemporalAnalysis(data) {
        this.checkSpace(60);
        this.sectionTitle("4. ANÁLISE TEMPORAL DAS PENDÊNCIAS");

        const aging = data.aging;
        const totalP = data.stats.pendentes || 1; // evitar div por zero

        const body = [
            ["0 a 7 dias", aging.d0_7, ((aging.d0_7 / totalP) * 100).toFixed(1) + "%"],
            ["8 a 15 dias", aging.d8_15, ((aging.d8_15 / totalP) * 100).toFixed(1) + "%"],
            ["16 a 30 dias", aging.d16_30, ((aging.d16_30 / totalP) * 100).toFixed(1) + "%"],
            ["Acima de 30 dias", aging.d30_plus, ((aging.d30_plus / totalP) * 100).toFixed(1) + "%"]
        ];

        this.doc.autoTable({
            startY: this.cursorY,
            head: [["Aging (Idade da Pendência)", "Qtd. Lacres", "% do Total Pendente"]],
            body: body,
            theme: 'plain',
            headStyles: { fillColor: [100, 100, 100], textColor: 255 },
            columnStyles: { 0: { fontStyle: 'bold' } }
        });

        this.cursorY = this.doc.lastAutoTable.finalY + 5;
        
        // Análise de tendência
        let analise = "";
        if (aging.d30_plus > aging.d0_7) {
            analise = "⚠️ Tendência de envelhecimento crítico: O volume de pendências antigas supera as recentes, indicando abandono de controle.";
        } else if (aging.d16_30 > 0 || aging.d30_plus > 0) {
            analise = "⚠️ Risco de ruptura: Existem pendências significativas em fase de envelhecimento.";
        } else {
            analise = "✅ Acúmulo concentrado no curto prazo, característico de fluxo operacional normal.";
        }
        
        this.doc.setFontSize(9);
        this.doc.text(analise, this.margin, this.cursorY);
        this.cursorY += 10;
    }

    // 5. AUDITORIA DE INTEGRIDADE
    createDataIntegrityAudit(data) {
        this.checkSpace(60);
        this.sectionTitle("5. AUDITORIA DE INTEGRIDADE DOS DADOS");

        const audit = data.auditoria;
        const totalIssues = audit.duplicados.length + audit.foraPadraoDigitos.length + audit.divergenciaPadrao.length;

        if (totalIssues === 0) {
            this.doc.setFontSize(10);
            this.doc.text("Nenhuma não conformidade de integridade detectada.", this.margin, this.cursorY);
            this.cursorY += 10;
        } else {
            this.doc.setFontSize(10);
            this.doc.setTextColor(200, 0, 0);
            
            if (audit.duplicados.length > 0) {
                this.doc.text(`• Numeração Duplicada: ${audit.duplicados.length} ocorrências.`, this.margin, this.cursorY);
                this.cursorY += 5;
            }
            if (audit.foraPadraoDigitos.length > 0) {
                this.doc.text(`• Lacres fora do padrão (6 dígitos): ${audit.foraPadraoDigitos.length} ocorrências.`, this.margin, this.cursorY);
                this.cursorY += 5;
            }
            if (audit.divergenciaPadrao.length > 0) {
                this.doc.text(`• Divergência de padrão BAG: ${audit.divergenciaPadrao.length} ocorrências.`, this.margin, this.cursorY);
                this.cursorY += 5;
            }
            this.doc.setTextColor(0);
            this.cursorY += 5;
        }
    }

    // 6. LISTAGEM CONSOLIDADA
    createConsolidatedList(data) {
        this.addPage();
        this.sectionTitle("6. LISTAGEM OPERACIONAL CONSOLIDADA");

        // Ordenação: 
        // 1. Pendentes > 15 dias (mais antigos primeiro)
        // 2. Pendentes recentes
        // 3. Devolvidos
        const sortedLacres = [...data.lacres].sort((a, b) => {
            const aCritico = a.status === 'PENDENTE' && a.diasEmAberto > 15;
            const bCritico = b.status === 'PENDENTE' && b.diasEmAberto > 15;
            
            if (aCritico && !bCritico) return -1;
            if (!aCritico && bCritico) return 1;
            
            if (a.status === 'PENDENTE' && b.status !== 'PENDENTE') return -1;
            if (a.status !== 'PENDENTE' && b.status === 'PENDENTE') return 1;
            
            return 0;
        });

        const body = sortedLacres.map(l => [
            l.data ? l.data.toLocaleDateString('pt-BR') : '-',
            l.fazenda, // Já está em uppercase
            l.frente,
            l.identificacao, // Já normalizado para BAG XX
            l.lacre, // Já normalizado para 6 dígitos
            l.status,
            l.status === 'PENDENTE' ? l.diasEmAberto : '-'
        ]);

        this.doc.autoTable({
            startY: this.cursorY,
            head: [["Data", "Fazenda", "Frente", "Identificação", "Lacre", "Status", "Dias"]],
            body: body,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [0, 0, 0], textColor: 255 },
            didParseCell: function(data) {
                if (data.section === 'body') {
                    if (data.column.index === 5) { // Status
                        if (data.cell.raw === 'PENDENTE') {
                            data.cell.styles.textColor = [200, 0, 0];
                            data.cell.styles.fontStyle = 'bold';
                        } else {
                            data.cell.styles.textColor = [0, 100, 0];
                        }
                    }
                    if (data.column.index === 1) { // Fazenda
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        });
        
        this.cursorY = this.doc.lastAutoTable.finalY + 10;
    }

    // 7. DIAGNÓSTICO TÉCNICO
    createTechnicalDiagnosis(data) {
        this.addPage();
        this.sectionTitle("7. DIAGNÓSTICO TÉCNICO OPERACIONAL");

        const percPend = data.stats.percPendencia;
        let analiseGeral = "";
        let acoes = [];
        let auditoriaFreq = "";

        if (percPend < 10) {
            analiseGeral = "O controle encontra-se estável e aderente aos padrões de compliance operacional.";
            acoes = [
                "Manter rotina de baixa diária das devoluções.",
                "Realizar conferência amostral semanal."
            ];
            auditoriaFreq = "Mensal";
        } else if (percPend < 25) {
            analiseGeral = "Identificadas oportunidades de melhoria no fluxo de retorno das informações.";
            acoes = [
                "Reforçar treinamento com apontadores das frentes críticas.",
                "Estabelecer corte semanal para justificativa de pendências."
            ];
            auditoriaFreq = "Quinzenal";
        } else {
            analiseGeral = "Cenário de risco operacional elevado, exigindo plano de ação corretiva imediato.";
            acoes = [
                "Realizar força-tarefa para saneamento da base de pendências.",
                "Bloquear novas liberações para frentes com pendência crítica (>30 dias).",
                "Revisar processo de recolhimento físico das embalagens."
            ];
            auditoriaFreq = "Semanal";
        }

        const textLines = [
            `Situação Geral: ${analiseGeral}`,
            "",
            "Principais Pontos Críticos:",
            `- Volume de pendências: ${data.stats.pendentes} unidades.`,
            `- Índice de não conformidade: ${percPend.toFixed(1)}%.`,
            "",
            "Ações Corretivas Sugeridas:",
            ...acoes.map(a => `• ${a}`),
            "",
            `Frequência Recomendada de Auditoria: ${auditoriaFreq}`
        ];

        this.doc.setFontSize(10);
        this.doc.setFont("helvetica", "normal");
        this.doc.text(textLines, this.margin, this.cursorY);
    }

    // Utils
    sectionTitle(text) {
        this.doc.setFontSize(12);
        this.doc.setFont("helvetica", "bold");
        this.doc.setFillColor(240, 240, 240);
        this.doc.rect(this.margin, this.cursorY, this.pageWidth - (this.margin*2), 8, 'F');
        this.doc.text(text, this.margin + 2, this.cursorY + 5.5);
        this.cursorY += 12;
    }

    addPageNumbers() {
        const pageCount = this.doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            this.doc.setPage(i);
            this.doc.setFontSize(8);
            this.doc.setTextColor(150);
            this.doc.text(`${i} / ${pageCount}`, this.pageWidth - this.margin, this.pageHeight - 10, { align: "right" });
        }
    }
}

window.LacreReportGenerator = LacreReportGenerator;
