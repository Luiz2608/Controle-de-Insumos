-- FIX: Adiciona a coluna updated_at que está faltando e causando erro no Trigger
-- Execute este script no Editor SQL do Supabase

-- 1. Adicionar a coluna updated_at na tabela plantio_diario
ALTER TABLE plantio_diario 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. (Opcional) Se o erro persistir, pode ser necessário recriar o trigger corretamente
-- Primeiro removemos o trigger antigo se existir
DROP TRIGGER IF EXISTS update_plantio_diario_modtime ON plantio_diario;

-- Recriamos a função de atualização de data
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Recriamos o trigger na tabela plantio_diario
CREATE TRIGGER update_plantio_diario_modtime
BEFORE UPDATE ON plantio_diario
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();
