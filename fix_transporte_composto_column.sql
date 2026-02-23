-- FIX: Adiciona a coluna fazenda_codigo que está faltando na tabela transporte_composto
-- Execute este script no Editor SQL do Supabase

-- 1. Adicionar a coluna fazenda_codigo na tabela transporte_composto
ALTER TABLE transporte_composto 
ADD COLUMN IF NOT EXISTS fazenda_codigo NUMERIC(10,0);

-- 2. Recarregar o cache do esquema (necessário para o PostgREST reconhecer a nova coluna)
NOTIFY pgrst, 'reload schema';
