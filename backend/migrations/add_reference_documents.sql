-- Tabela para armazenar documentos de referência (playbooks, regras, blueprints)
CREATE TABLE IF NOT EXISTS reference_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL, -- pdf, md, txt
    content_text TEXT NOT NULL, -- Conteúdo extraído do documento
    file_size_bytes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para armazenar resultados de testes baseados em documentos
CREATE TABLE IF NOT EXISTS document_test_runs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
    subject_instruction TEXT NOT NULL,
    document_ids UUID[] NOT NULL, -- IDs dos documentos usados como referência
    transcript JSONB,
    evaluation_result JSONB, -- Resultado com métricas de aderência aos documentos
    score REAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index para buscar documentos por collection
CREATE INDEX IF NOT EXISTS idx_reference_documents_collection ON reference_documents(collection_id);
CREATE INDEX IF NOT EXISTS idx_document_test_runs_collection ON document_test_runs(collection_id);
