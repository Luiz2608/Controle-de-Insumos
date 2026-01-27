-- Adiciona a coluna 'fazenda' na tabela 'transporte_composto'
ALTER TABLE transporte_composto ADD COLUMN IF NOT EXISTS fazenda VARCHAR(255);
