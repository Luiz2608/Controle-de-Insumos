-- Script para corrigir erro 42501 (RLS Policy Violation) na tabela users
-- Execute este script no SQL Editor do Supabase

-- 1. Habilitar RLS (caso não esteja)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Remover políticas conflitantes antigas
DROP POLICY IF EXISTS "Users can read own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
DROP POLICY IF EXISTS "Users can insert own data" ON public.users;
DROP POLICY IF EXISTS "Admins can do everything" ON public.users;

-- 3. CRIAR NOVAS POLÍTICAS

-- Permitir que o usuário leia seus próprios dados
CREATE POLICY "Users can read own data" ON public.users
FOR SELECT
USING (auth.uid() = id);

-- Permitir que o usuário atualize seus próprios dados
CREATE POLICY "Users can update own data" ON public.users
FOR UPDATE
USING (auth.uid() = id);

-- CRÍTICO: Permitir que o usuário INSIRA seus próprios dados (necessário para o sync no login)
CREATE POLICY "Users can insert own data" ON public.users
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Opcional: Permitir que Admins vejam tudo (Cuidado com recursão, idealmente usar claims)
-- Por enquanto, vamos garantir que o próprio usuário consiga se gerenciar, que resolve o erro.
