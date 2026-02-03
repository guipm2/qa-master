# 🎯 QA Master

Sistema de testes automatizados para agentes conversacionais (AI agents) com suporte a personas.

## 📋 Visão Geral

O QA Master permite testar agentes de IA de forma automatizada, utilizando:
- **Agente Testador**: Simula clientes com diferentes personas
- **Agente Sujeito**: O agente sendo testado
- **Agente Juiz**: Analisa e pontua cada conversa

## 🏗️ Arquitetura

```
QA Master/
├── backend/                    # FastAPI + Python
│   ├── main.py                # API endpoints
│   ├── agents.py              # Configuração dos agentes Agno
│   ├── models.py              # Modelos Pydantic
│   ├── database.py            # Integração Supabase
│   ├── core/                  # Sistema de Personas
│   │   ├── persona_injector.py
│   │   └── personas_genericas_puras.json
│   ├── tests/                 # Executor de Testes
│   │   └── test_executor.py
│   └── prompts_teste/         # Prompts de cenários
│
└── frontend/                   # Next.js + React
    └── src/app/
        ├── page.tsx           # Dashboard de Coleções
        └── collections/[id]/  # Detalhes da Coleção
```

## 🚀 Instalação

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

pip install -r requirements.txt
```

Crie um arquivo `.env`:
```env
SUPABASE_URL=sua_url
SUPABASE_KEY=sua_key
OPENAI_API_KEY=sua_key
```

### Frontend

```bash
cd frontend
npm install
```

## ▶️ Executando

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

## ✨ Funcionalidades

### Dashboard de Coleções
- Criar/editar/excluir coleções de testes
- Configurar Max Turnos (1-50)
- Configurar Nº de Personas (1-20)
- Definir prompts do agente sujeito e avaliador

### Sistema de Personas
20 personas genéricas com comportamentos distintos:
- O Desconfiado, O Apressado, O Confuso
- O Detalhista, O Indeciso, O Gentil
- E mais 14 perfis comportamentais

### Modos de Seleção de Personas
```python
from tests.test_executor import selecionar_personas

# Aleatório (padrão)
personas = selecionar_personas(5, modo="aleatorio")

# Sequencial (PERSONA_001, PERSONA_002, ...)
personas = selecionar_personas(5, modo="sequencial")

# Diversificado (distribuído uniformemente)
personas = selecionar_personas(5, modo="diversificado")
```

### Execução de Testes
```python
from tests.test_executor import executar_bateria_com_analise_juiz

resultado = executar_bateria_com_analise_juiz(
    prompt_teste_path="prompts_teste/meu_teste.md",
    num_personas=5,
    agente_alvo=meu_agente,
    agente_juiz=juiz,
    max_turnos=20
)
```

### Análise Consolidada
O juiz analisa cada teste individualmente e gera:
- Score por persona (0-100)
- Pontos fortes e fracos recorrentes
- Taxa de aprovação geral
- Recomendações prioritárias

## 📊 Estrutura de Resultados

```json
{
  "session_id": "SESSION_ABC123",
  "num_personas": 5,
  "max_turnos_por_teste": 20,
  "analise_geral": {
    "total_testes": 5,
    "testes_aprovados": 4,
    "taxa_aprovacao": 80.0,
    "score_medio_geral": 85,
    "pontos_fortes_recorrentes": [...],
    "pontos_fracos_recorrentes": [...],
    "conclusao": "O agente teve excelente desempenho..."
  }
}
```

## 🗄️ Database (Supabase)

### Tabela: collections
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | ID único |
| name | TEXT | Nome da coleção |
| description | TEXT | Descrição |
| base_subject_instruction | TEXT | Prompt do agente |
| base_evaluator_instruction | TEXT | Prompt do avaliador |
| max_turns | INT | Max interações (padrão: 20) |
| num_personas | INT | Nº de personas (padrão: 5) |
| openai_api_key | TEXT | Chave da API |
| created_at | TIMESTAMP | Data de criação |

### Tabela: test_runs
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | ID único |
| collection_id | UUID | FK para collections |
| iteration | INT | Número da iteração |
| status | TEXT | running/completed/failed |
| transcript | JSONB | Conversa completa |
| evaluation_result | JSONB | Resultado da análise |
| score | FLOAT | Score final |

## 🛠️ Tecnologias

- **Backend**: Python, FastAPI, Agno, OpenAI
- **Frontend**: Next.js, React, TypeScript, TailwindCSS
- **Database**: Supabase (PostgreSQL)
- **UI**: Framer Motion, Lucide Icons

## 📄 Licença

MIT License
