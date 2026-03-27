# QA Master

Sistema de testes automatizados e otimizacao de prompts para agentes conversacionais de IA. Testa, avalia e melhora agentes iterativamente usando documentos de referencia como gabarito.

## Visao Geral

O QA Master executa loops de teste-avaliacao-otimizacao para agentes de IA:

1. **Evaluator** (Claude Opus 4.6) simula um usuario real interagindo com o agente
2. **Subject** (OpenAI, modelo configuravel) e o agente sendo testado
3. **Judge** (Claude Opus 4.6) avalia a conversa e gera scores detalhados
4. **Optimizer** (Claude Opus 4.6) melhora o prompt com base no feedback do Judge
5. **Verifier** (Claude Opus 4.6) audita integridade do prompt otimizado

O sistema detecta automaticamente se ha documentos de referencia (playbooks, regras, blueprints) e escolhe o fluxo adequado:
- **Modo Padrao**: Judge avalia qualidade geral (target score: 90)
- **Modo Documental**: Document Judge compara comportamento do agente com os documentos (target score: 80)

## Arquitetura

```
QA Master/
├── backend/                        # FastAPI + Python
│   ├── main.py                     # API endpoints (CRUD, smart-run, webhook, docs)
│   ├── agents.py                   # Agentes Agno (subject, evaluator, judge, doc-judge)
│   ├── optimizer.py                # Optimizer + Verifier agents
│   ├── models.py                   # Pydantic schemas (EvaluationResult, DocumentEvaluationResult)
│   ├── database.py                 # Supabase client (collections, runs, documents)
│   ├── document_parser.py          # Parser de PDF, MD, TXT
│   ├── prompts/                    # Prompts especializados dos agentes auxiliares
│   │   ├── prompt_evaluator_agent.md
│   │   ├── prompt_judge_agent.md
│   │   ├── prompt_document_judge.md
│   │   ├── prompt_optimizer_agent.md
│   │   └── prompt_verifier_agent.md
│   └── migrations/                 # SQL para Supabase
│       ├── add_subject_model.sql
│       └── add_reference_documents.sql
│
└── frontend/                       # Next.js + React + TypeScript
    └── src/app/
        ├── page.tsx                # Dashboard de colecoes
        ├── collections/[id]/       # Studio de testes (chat, logs, historico, docs)
        └── webhook/                # Webhook dispatcher
```

## Instalacao

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac
pip install -r requirements.txt
```

Crie o arquivo `.env`:
```env
SUPABASE_URL=sua_url
SUPABASE_KEY=sua_key

DB_USER=seu_user
DB_PASSWORD=sua_senha
DB_HOST=seu_host
DB_PORT=5432
DB_NAME=postgres

OPENAI_API_KEY=sua_key_openai
ANTHROPIC_API_KEY=sua_key_anthropic
```

### Frontend

```bash
cd frontend
npm install
```

### Database (Supabase)

Execute as migrations na ordem:
1. `backend/migrations/add_subject_model.sql`
2. `backend/migrations/add_reference_documents.sql`

## Executando

### Backend (porta 8000)
```bash
cd backend
venv\Scripts\activate
python -m uvicorn main:app --port 8000 --reload
```

### Frontend (porta 3000)
```bash
cd frontend
npm run dev
```

Acesse: http://localhost:3000

## Funcionalidades

### Teste Inteligente (botao unico)
- Detecta automaticamente se ha documentos de referencia na colecao
- Com documentos: usa Document Judge para avaliar aderencia a playbooks/regras
- Sem documentos: usa Judge padrao para avaliar qualidade geral
- Loop automatico: testa -> avalia -> otimiza -> repete ate atingir score alvo
- Botao de parada para interromper teste em andamento
- Navegacao livre enquanto o teste roda

### Documentos de Referencia
- Upload de PDFs, Markdowns e TXTs como gabarito
- O Document Judge compara comportamento do agente com os documentos
- 7 metricas de aderencia: compliance, tom/estilo, escopo, violacoes, comportamentos obrigatorios, alinhamento com padroes
- Cada violacao vem com trecho do documento, trecho da resposta e sugestao de correcao

### Webhook Dispatcher
- Envio de payloads para qualquer webhook externo
- Suporte a autenticacao: Bearer, API Key, Basic Auth
- Editor de JSON com auto-formatacao (formata ao colar)
- Visualizacao de resposta com status, headers e body

### Metricas de Avaliacao

**Modo Padrao (5 dimensoes):**
- Compliance, Eficacia, Eficiencia, Qualidade de Comunicacao, Experiencia do Usuario

**Modo Documental (6 dimensoes):**
- Compliance Documental, Tom e Estilo, Aderencia ao Escopo, Violacoes de Regras, Comportamentos Obrigatorios, Alinhamento com Padroes

### Resiliencia
- Retry com exponential backoff para erros 529/overloaded da API
- Ate 5 tentativas com espera crescente (2s, 4s, 8s, 16s, 32s)

## Database (Supabase)

### Tabela: collections
| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | UUID | ID unico |
| name | TEXT | Nome da colecao |
| description | TEXT | Descricao |
| base_subject_instruction | TEXT | Prompt base do agente testado |
| base_evaluator_instruction | TEXT | Cenario de teste do avaliador |
| openai_api_key | TEXT | Chave da API OpenAI |
| subject_model | TEXT | Modelo OpenAI (default: gpt-5.2) |
| max_turns | INT | Max interacoes por teste |
| num_personas | INT | Numero de personas |

### Tabela: test_runs
| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | UUID | ID unico |
| collection_id | UUID | FK para collections |
| iteration | INT | Numero da iteracao |
| status | TEXT | running/completed/failed/stopped |
| transcript | JSONB | Conversa completa |
| evaluation_result | JSONB | Resultado da analise |
| score | FLOAT | Score final |

### Tabela: reference_documents
| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | UUID | ID unico |
| collection_id | UUID | FK para collections |
| filename | TEXT | Nome do arquivo |
| file_type | TEXT | pdf/md/txt |
| content_text | TEXT | Conteudo extraido |
| file_size_bytes | INT | Tamanho do arquivo |

### Tabela: document_test_runs
| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | UUID | ID unico |
| collection_id | UUID | FK para collections |
| status | TEXT | running/completed/failed/stopped |
| subject_instruction | TEXT | Prompt usado |
| document_ids | UUID[] | IDs dos documentos usados |
| transcript | JSONB | Conversa completa |
| evaluation_result | JSONB | Resultado da analise documental |
| score | FLOAT | Score de aderencia |

## Tecnologias

- **Backend**: Python, FastAPI, Agno Framework
- **IA (agente testado)**: OpenAI (GPT-5.2 default, configuravel)
- **IA (agentes auxiliares)**: Anthropic Claude Opus 4.6
- **Frontend**: Next.js 16, React, TypeScript, TailwindCSS
- **Database**: Supabase (PostgreSQL)
- **UI**: Framer Motion, Lucide Icons

## Licenca

MIT License
