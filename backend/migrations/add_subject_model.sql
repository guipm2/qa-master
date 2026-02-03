-- Migration: Adiciona coluna subject_model na tabela collections
-- Descrição: Permite ao usuário selecionar qual modelo OpenAI usar para testar o agente
-- Execute este SQL no Supabase SQL Editor

ALTER TABLE collections 
ADD COLUMN IF NOT EXISTS subject_model TEXT DEFAULT 'gpt-4o';

-- Comentário para documentação
COMMENT ON COLUMN collections.subject_model IS 'Modelo OpenAI selecionado para o agente testado (ex: gpt-4o, gpt-4-turbo, gpt-3.5-turbo)';
