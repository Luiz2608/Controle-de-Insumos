-- Script de Correção para Colheita e Acumulados
-- Execute este script no Editor SQL do Supabase

-- 1. Garantir que a tabela plantio_diario tenha as colunas de colheita
ALTER TABLE plantio_diario 
ADD COLUMN IF NOT EXISTS colheita_hectares NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS colheita_tch_estimado NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS colheita_tch_real NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS colheita_toneladas_totais NUMERIC(10,2) DEFAULT 0;

-- 2. Garantir colunas de acumulados na tabela fazendas (caso não existam ou estejam com nome errado)
ALTER TABLE fazendas
ADD COLUMN IF NOT EXISTS plantio_acumulado NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS muda_acumulada NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cobricao_acumulada NUMERIC(10,2) DEFAULT 0;

-- 3. (Opcional) Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_plantio_diario_modtime') THEN
        CREATE TRIGGER update_plantio_diario_modtime
        BEFORE UPDATE ON plantio_diario
        FOR EACH ROW
        EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END
$$;
