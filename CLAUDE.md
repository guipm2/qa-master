# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QA Master is an automated testing and prompt optimization system for AI conversational agents. It runs iterative test-evaluate-optimize loops: an Evaluator (Claude) simulates a real user, a Subject (OpenAI) is the agent under test, a Judge (Claude) scores the conversation, an Optimizer (Claude) improves the prompt, and a Verifier (Claude) audits integrity. Two modes: Standard (general quality, target 90) and Document (compliance against reference docs, target 80), auto-detected by presence of uploaded documents.

## Commands

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate                          # Windows
pip install -r requirements.txt
python -m uvicorn main:app --port 8000 --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev       # dev on port 3000
npm run build     # production build
```

### Database Migrations
Run in Supabase SQL Editor in order:
1. `backend/migrations/add_subject_model.sql`
2. `backend/migrations/add_reference_documents.sql`
3. `backend/migrations/add_error_details.sql`

## Architecture

**Backend** (FastAPI, Python): `backend/main.py` is the monolith containing all API endpoints and the core test execution loop. Agent factories live in `backend/agents.py` (Agno framework). Prompt optimization + verification in `backend/optimizer.py`. Pydantic models in `backend/models.py`. Database access via Supabase client in `backend/database.py`.

**Frontend** (Next.js 16, React 19, TypeScript, Tailwind 4): App Router with three pages:
- `frontend/src/app/page.tsx` - Dashboard (collection CRUD, model selection)
- `frontend/src/app/collections/[id]/page.tsx` - Test studio (live chat, logs, history, documents)
- `frontend/src/app/webhook/page.tsx` - Webhook dispatcher with auth support

**Database** (Supabase/PostgreSQL): Four tables - `collections`, `test_runs`, `document_test_runs`, `reference_documents`.

### Agent Architecture
- **Subject Agent**: OpenAI (configurable model, default GPT-5.2) - the agent being tested
- **Evaluator, Judge, Document Judge, Optimizer, Verifier**: All Claude Opus 4.6 via Agno framework
- Agent prompts are markdown files in `backend/prompts/`

### Real-time Communication
SSE (Server-Sent Events) streams test progress from `GET /api/collections/{id}/events` to the frontend. The frontend handles reconnection with buffer/cursor. Test execution runs as a background task decoupled from HTTP responses.

### Test Execution Flow
`POST /api/collections/{id}/run-smart` triggers a background loop (max 10 iterations):
1. **Conversation** - Evaluator simulates user, Subject responds (multi-turn)
2. **Evaluation** - Judge scores on 5-6 dimensions
3. **Optimization** - Optimizer improves prompt, Verifier checks integrity
4. Loop terminates when score hits target, max iterations reached, or user stops

## Key Patterns

- All agent `.run()` calls use `asyncio.to_thread()` since Agno agents are synchronous
- Retry with exponential backoff (2s-32s, 5 attempts) for API overload errors (HTTP 529)
- Error tracking: `failed_at_stage` (conversation/evaluation/optimization) + `error_message` persisted in DB
- Agents are created fresh per test run (no persistent memory between runs)
- Frontend API base URL configurable via `NEXT_PUBLIC_API_URL` (defaults to `http://127.0.0.1:8000`)

## Environment Variables

**Backend** (`backend/.env`): `SUPABASE_URL`, `SUPABASE_KEY`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ALLOWED_ORIGINS` (optional)

**Frontend**: `NEXT_PUBLIC_API_URL` (optional, defaults to `http://127.0.0.1:8000`)

## Language

The codebase, UI, prompts, and commit messages are in **Brazilian Portuguese**. Maintain this convention.
