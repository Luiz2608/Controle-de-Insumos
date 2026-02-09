-- Script para verificar tabelas no Supabase SQL Editor
-- Copie e cole este código no SQL Editor do seu projeto Supabase para verificar a integridade.

DO $$
DECLARE
    required_tables text[] := ARRAY[
        'fazendas', 
        'insumos_oxifertil', 
        'insumos_fazendas', 
        'estoque', 
        'plantio_diario', 
        'users', 
        'viagens_adubo', 
        'metas', 
        'os_agricola',
        'transporte_composto',
        'liberacao_colheita',
        'metas_plantio',
        'os_transporte_diario',
        'audit_logs',
        'system_settings',
        'equipamento_operador'
    ];
    t text;
    missing_tables text[] := ARRAY[]::text[];
    extra_tables text[] := ARRAY[]::text[];
    found_tables text[] := ARRAY[]::text[];
BEGIN
    -- 1. Verificar tabelas faltantes
    FOREACH t IN ARRAY required_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = t
        ) THEN
            missing_tables := array_append(missing_tables, t);
        ELSE
            found_tables := array_append(found_tables, t);
        END IF;
    END LOOP;

    -- 2. Verificar tabelas extras (que não estão na lista de requeridas)
    SELECT ARRAY(
        SELECT table_name::text
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name != ALL(required_tables)
        -- Ignorar tabelas internas ou migrations se houver
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT LIKE 'sql_%'
    ) INTO extra_tables;

    -- 3. Exibir Relatório
    RAISE NOTICE '---------------------------------------------------';
    RAISE NOTICE 'RELATÓRIO DE VERIFICAÇÃO DE TABELAS';
    RAISE NOTICE '---------------------------------------------------';
    
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE NOTICE '❌ TABELAS FALTANTES (CRÍTICO): %', missing_tables;
        RAISE NOTICE 'Ação recomendada: Execute o script de criação (schema) para estas tabelas.';
    ELSE
        RAISE NOTICE '✅ Todas as tabelas necessárias foram encontradas.';
    END IF;

    IF array_length(extra_tables, 1) > 0 THEN
        RAISE NOTICE '⚠️ TABELAS EXTRAS ENCONTRADAS: %', extra_tables;
        RAISE NOTICE 'Ação recomendada: Verifique se são tabelas antigas ou de testes. Se não forem usadas, podem ser removidas.';
    ELSE
        RAISE NOTICE '✅ Nenhuma tabela extra desconhecida encontrada.';
    END IF;

    RAISE NOTICE '---------------------------------------------------';
END $$;
