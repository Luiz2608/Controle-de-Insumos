-- Tabela para configurações do sistema (ex: versionamento para forçar update)
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Política: Todos podem ler (para verificar versão)
CREATE POLICY "Public read access" ON system_settings
    FOR SELECT USING (true);

-- Política: Apenas admins podem atualizar (para forçar update)
CREATE POLICY "Admins can update settings" ON system_settings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Política: Apenas admins podem inserir (inicialização)
CREATE POLICY "Admins can insert settings" ON system_settings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Inserir valor inicial de versão se não existir
INSERT INTO system_settings (key, value)
VALUES ('app_version', '{"version": "1.0.0", "timestamp": 0}'::jsonb)
ON CONFLICT (key) DO NOTHING;
