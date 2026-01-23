-- Tabela para Transporte de Composto
CREATE TABLE IF NOT EXISTS transporte_composto (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    numero_os VARCHAR(255),
    data_abertura DATE,
    responsavel_aplicacao VARCHAR(255),
    empresa VARCHAR(255),
    frente VARCHAR(50),
    produto VARCHAR(255) DEFAULT 'COMPOSTO',
    quantidade NUMERIC(10, 3),
    unidade VARCHAR(50) DEFAULT 't',
    atividade_agricola VARCHAR(255) DEFAULT 'ADUBACAO',
    status VARCHAR(50) DEFAULT 'ABERTO',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS (opcional, recomendado)
ALTER TABLE transporte_composto ENABLE ROW LEVEL SECURITY;

-- Política para permitir tudo (desenvolvimento) ou ajustar conforme necessidade
CREATE POLICY "Enable all access for all users" ON transporte_composto
FOR ALL USING (true) WITH CHECK (true);
