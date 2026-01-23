const supabase = require('../config/supabase');
const importService = require('../services/importacaoOrdemServicoService');
const fs = require('fs');

class TransporteCompostoController {

    // Listar todos
    async index(req, res) {
        try {
            const { data, error } = await supabase
                .from('transporte_composto')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // Criar manual
    async store(req, res) {
        try {
            const { data, error } = await supabase
                .from('transporte_composto')
                .insert([req.body])
                .select();

            if (error) throw error;
            res.json({ success: true, data: data[0] });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // Importar PDF
    async importarPdf(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
            }

            const filePath = req.file.path;
            
            // 1. Extrair dados
            const extractionResult = await importService.extrairDadosDePdf(filePath);
            
            // Remover arquivo temporário após extração (opcional: manter se for salvar o anexo)
            // fs.unlinkSync(filePath); 

            if (!extractionResult.success) {
                return res.status(500).json({ success: false, message: extractionResult.error });
            }

            // Retornar dados extraídos para o frontend confirmar/editar antes de salvar
            // Não salvamos direto no banco ainda
            res.json({ 
                success: true, 
                extractedData: extractionResult.data,
                message: 'Dados extraídos com sucesso. Verifique e confirme.' 
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // Salvar com upload (se o frontend enviar o arquivo para armazenamento definitivo)
    // Aqui assumimos que o upload já foi feito no passo anterior ou é um novo upload
    // Mas geralmente o fluxo é: Upload -> Extração -> Form -> Save
}

module.exports = new TransporteCompostoController();
