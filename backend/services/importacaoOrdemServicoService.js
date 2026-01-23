const fs = require('fs');
const pdf = require('pdf-parse');
const supabase = require('../config/supabase');

class ImportacaoOrdemServicoService {

    /**
     * Extrai dados de um arquivo PDF usando padrões regex configuráveis
     * @param {string} filePath - Caminho do arquivo PDF
     * @returns {Promise<Object>} - Objeto com os dados extraídos
     */
    async extrairDadosDePdf(filePath) {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdf(dataBuffer);
            const text = data.text;

            // Carregar mapeamentos do banco (ou usar padrão se falhar)
            let mappings = await this.getMappings();
            
            // Fallback para mapeamentos padrão se o banco estiver vazio/erro
            if (!mappings || mappings.length === 0) {
                mappings = this.getDefaultMappings();
            }

            const result = {};

            for (const map of mappings) {
                try {
                    const regex = new RegExp(map.pdf_field_pattern, 'i'); // Case insensitive
                    const match = text.match(regex);

                    if (match && match[1]) {
                        let value = match[1].trim();
                        result[map.db_field] = this.applyTransform(value, map.transform);
                    }
                } catch (err) {
                    console.error(`Erro ao aplicar regex para campo ${map.db_field}:`, err);
                }
            }

            return {
                success: true,
                data: result,
                raw_text: text.substring(0, 1000) + '...' // Preview do texto para debug
            };

        } catch (error) {
            console.error('Erro ao processar PDF:', error);
            return { success: false, error: error.message };
        }
    }

    async getMappings() {
        try {
            const { data, error } = await supabase
                .from('mapeamento_campos_pdf')
                .select('*');
            
            if (error) {
                console.warn('Erro ao buscar mapeamentos (usando padrão):', error.message);
                return [];
            }
            return data;
        } catch (e) {
            return [];
        }
    }

    getDefaultMappings() {
        return [
            { pdf_field_pattern: 'Ordem de serviço - (\\d+)', db_field: 'numero_os', transform: 'trim' },
            { pdf_field_pattern: 'Data de Abertura:\\s*(\\d{2}/\\d{2}/\\d{4})', db_field: 'data_abertura', transform: 'date_br' },
            { pdf_field_pattern: 'Responsável:\\s*(.*)', db_field: 'responsavel_aplicacao', transform: 'trim' },
            { pdf_field_pattern: 'Empresa:\\s*(.*)', db_field: 'empresa', transform: 'trim' },
            { pdf_field_pattern: 'Frente:\\s*(.*)', db_field: 'frente', transform: 'trim' },
            { pdf_field_pattern: 'Produto:\\s*(.*)', db_field: 'produto', transform: 'trim' },
            { pdf_field_pattern: 'Quantidade:\\s*([\\d\\.,]+)', db_field: 'quantidade', transform: 'decimal_br' },
            { pdf_field_pattern: 'Atividade Agrícola:\\s*(.*)', db_field: 'atividade_agricola', transform: 'trim' }
        ];
    }

    applyTransform(value, transform) {
        if (!transform) return value;

        switch (transform.toLowerCase()) {
            case 'trim':
                return value.trim();
            case 'upper':
                return value.toUpperCase().trim();
            case 'date_br':
                // Converte DD/MM/YYYY para YYYY-MM-DD
                const parts = value.split('/');
                if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
                return value;
            case 'decimal_br':
                // Converte 1.000,00 para 1000.00
                return parseFloat(value.replace(/\./g, '').replace(',', '.'));
            default:
                return value;
        }
    }
}

module.exports = new ImportacaoOrdemServicoService();
