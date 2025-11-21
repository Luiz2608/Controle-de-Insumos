// Dados completos baseados na planilha Excel
const insumosData = {
    oxifertil: [
        {
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
        },
        {
            processo: "CANA DE ACUCAR",
            subprocesso: "PLANTIO",
            produto: "CALCARIO OXIFERTIL",
            fazenda: "SANTO EXPEDITO",
            areaTalhao: 128.61,
            areaTotalAplicada: 128.61,
            doseRecomendada: 0.15,
            insumDoseAplicada: 0.1433792,
            quantidadeAplicada: 18.439998912,
            dif: -0.0441387,
            frente: 4009
        },
        // ... adicione todos os outros registros
    ],

    insumosFazendas: [
        {
            os: 7447,
            cod: 1030,
            fazenda: "ORIENTE",
            areaTalhao: 37.42,
            areaTotalAplicada: 37.42,
            produto: "LANEX 800 WG (REGENTE)",
            doseRecomendada: 0.25,
            quantidadeAplicada: 10.000001056,
            frente: 4001
        },
        // ... adicione todos os outros registros
    ],

    santaIrene: [
        {
            cod: 8053,
            fazenda: "SANTA IRENE",
            areaTalhao: 147.52,
            areaTotalAplicada: 147.52,
            produto: "BIOZYME",
            doseRecomendada: 0.5,
            quantidadeAplicada: 80,
            frente: 4009
        },
        // ... adicione outros registros
    ],

    daniela: [
        {
            cod: 8061,
            fazenda: "SÃO TOMAZ DANIELA",
            areaTotal: 16.6,
            areaTotalAplicada: 16.6,
            produto: "BIOZYME",
            doseRecomendada: 0.5,
            quantidadeAplicada: 9,
            frente: 4001
        },
        // ... adicione outros registros
    ]
};

// Lista de fazendas para os filtros
const fazendasList = [
    "ORIENTE", "AMOREIRA", "SANTA FE CABELEIRA", "SANTA NARCISA", 
    "SANTO EXPEDITO", "SANTA LUIZA", "SANTA TEREZINHA II", "CAMPO BELO",
    "FORTALEZA TONHÃO A", "FORTALEZA TONHÃO C", "SANTA IRENE (STEIN)",
    "TONHÃO B", "PAULO FRANCO", "MAGNOLIA", "CABELEIRA INVERNADA (CRIOLO)",
    "SÃO TOMAZ CORREGO FUNDO", "SÃO PEDRO", "DIAMANTE AZUL", "CABELEIRA PAIVA",
    "SKALADA", "ARTUR FRANCO", "GAMELEIRA", "PRIMAVERA"
];

// Lista de produtos
const produtosList = [
    "LANEX 800 WG (REGENTE)", "COMET", "BIOZYME", "04-30-10", "QUALIT",
    "AZOKOP", "OXIFERTIL", "COMPOSTO", "10-49-00", "SURVEY (FIPRONIL)"
];