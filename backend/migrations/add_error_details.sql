-- Adicionar campos de detalhamento de erro em test_runs e document_test_runs
-- Permite persistir o motivo da falha e em qual etapa o teste quebrou

ALTER TABLE test_runs
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS failed_at_stage TEXT;  -- conversation, evaluation, optimization

ALTER TABLE document_test_runs
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS failed_at_stage TEXT;  -- conversation, evaluation, optimization
