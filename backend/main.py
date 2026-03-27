import json
import asyncio
from typing import AsyncGenerator, Dict, Any, Optional, List
import os
import uuid
import httpx
from urllib.parse import urlparse
import ipaddress
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from models import TestConfig, EvaluationResult
from agents import create_subject_agent, create_evaluator_agent, create_judge_agent, create_document_judge_agent, AVAILABLE_MODELS
from database import (
    create_collection,
    get_collections,
    get_collection_by_id,
    create_test_run,
    update_test_run,
    get_collection_runs,
    update_test_run,
    get_collection_runs,
    update_collection,
    delete_collection,
    CollectionCreate,
    CollectionUpdate,
    TestRunCreate,
    create_reference_document,
    get_collection_documents,
    delete_reference_document,
    get_documents_by_ids,
    create_document_test_run,
    update_document_test_run,
    get_document_test_runs,
)
from document_parser import parse_document

from optimizer import create_optimizer_agent, generate_improved_prompt
from models import DocumentEvaluationResult

app = FastAPI(title="QA Master Backend")

MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024
MAX_RETRIES = 5
RETRY_BASE_DELAY = 2.0

# ══════════════════════════════════════════════════════════
# Background test infrastructure
# Tests run as asyncio tasks, decoupled from SSE connections.
# Events are buffered so clients can reconnect at any time.
# ══════════════════════════════════════════════════════════

class TestSession:
    """Holds state for a running (or finished) test."""
    def __init__(self, collection_id: str):
        self.collection_id = collection_id
        self.events: List[Dict[str, Any]] = []
        self.finished = False
        self.stop_requested = False
        self._waiters: List[asyncio.Event] = []

    def emit(self, event: Dict[str, Any]) -> None:
        self.events.append(event)
        for w in self._waiters:
            w.set()

    def request_stop(self) -> None:
        self.stop_requested = True

    async def wait_for_new(self) -> None:
        ev = asyncio.Event()
        self._waiters.append(ev)
        try:
            await asyncio.wait_for(ev.wait(), timeout=30)
        except asyncio.TimeoutError:
            pass
        finally:
            self._waiters.remove(ev)


_sessions: Dict[str, TestSession] = {}


def _get_session(collection_id: str) -> Optional[TestSession]:
    return _sessions.get(collection_id)


async def _run_agent_with_retry(agent, prompt: str, label: str = "agent") -> Any:
    """
    Executa agent.run() em thread separada (não bloqueia o event loop)
    com retry e exponential backoff para erros 529/overloaded.
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            # agent.run() é síncrono — roda em thread pool para não bloquear o servidor
            return await asyncio.to_thread(agent.run, prompt)
        except Exception as e:
            err_str = str(e)
            is_retryable = "529" in err_str or "overloaded" in err_str.lower() or "rate" in err_str.lower()
            if is_retryable and attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))
                print(f"[RETRY] {label} tentativa {attempt}/{MAX_RETRIES} falhou (overloaded). Aguardando {delay}s...")
                await asyncio.sleep(delay)
                continue
            raise


def _get_allowed_origins() -> List[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    return origins if origins else ["http://localhost:3000"]


def _is_private_or_local_host(hostname: str) -> bool:
    if not hostname:
        return True

    normalized = hostname.strip().lower()
    if normalized in {"localhost", "127.0.0.1", "::1"}:
        return True

    try:
        ip = ipaddress.ip_address(normalized)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return normalized.endswith(".local")


def _validate_webhook_url(raw_url: str) -> str:
    parsed = urlparse(raw_url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="URL inválida: use apenas http/https")
    if not parsed.hostname:
        raise HTTPException(status_code=400, detail="URL inválida: hostname ausente")
    if _is_private_or_local_host(parsed.hostname):
        raise HTTPException(status_code=400, detail="URL bloqueada por segurança (host privado/local)")
    return raw_url


def _to_dict(data: Any) -> Dict[str, Any]:
    if isinstance(data, dict):
        return data
    if hasattr(data, "model_dump"):
        return data.model_dump()
    if hasattr(data, "dict"):
        return data.dict()
    raise ValueError("Formato de avaliação inválido")


def _coerce_standard_evaluation(data: Any) -> EvaluationResult:
    if isinstance(data, EvaluationResult):
        return data

    payload = _to_dict(data)
    if hasattr(EvaluationResult, "model_validate"):
        return EvaluationResult.model_validate(payload)
    return EvaluationResult.parse_obj(payload)


def _coerce_document_evaluation(data: Any) -> DocumentEvaluationResult:
    if isinstance(data, DocumentEvaluationResult):
        return data

    payload = _to_dict(data)
    if hasattr(DocumentEvaluationResult, "model_validate"):
        return DocumentEvaluationResult.model_validate(payload)
    return DocumentEvaluationResult.parse_obj(payload)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "QA Master Backend está rodando"}

# --- Endpoint para listar modelos disponíveis ---

@app.get("/api/models")
def list_available_models():
    """Retorna a lista de modelos OpenAI disponíveis para teste"""
    return {"models": AVAILABLE_MODELS}

# --- Endpoints de CRUD de Coleções ---

@app.get("/api/collections")
def list_collections():
    return get_collections()

@app.post("/api/collections")
def add_collection(data: CollectionCreate):
    return create_collection(data)

@app.get("/api/collections/{collection_id}")
def get_collection(collection_id: str):
    data = get_collection_by_id(collection_id)
    if not data:
        raise HTTPException(status_code=404, detail="Collection not found")
    return data

@app.get("/api/collections/{collection_id}/runs")
def list_collection_runs(collection_id: str):
    return get_collection_runs(collection_id)

@app.put("/api/collections/{collection_id}")
def update_collection_endpoint(collection_id: str, data: CollectionUpdate):
    # Filter out None values
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    return update_collection(collection_id, updates)

@app.delete("/api/collections/{collection_id}")
def delete_collection_endpoint(collection_id: str):
    delete_collection(collection_id)
    return {"message": "Collection deleted"}


# --- Endpoint de Webhook Dispatcher ---

class WebhookAuthConfig(BaseModel):
    type: str = "none"  # none, bearer, api_key, basic
    value: Optional[str] = None
    header_name: Optional[str] = None  # Para api_key: nome do header (ex: X-API-Key)

class WebhookRequest(BaseModel):
    url: str
    method: str = "POST"  # POST, GET, PUT, PATCH, DELETE
    auth: WebhookAuthConfig = WebhookAuthConfig()
    headers: Optional[Dict[str, str]] = None
    payload: Optional[Dict[str, Any]] = None

@app.post("/api/webhook/send")
async def send_webhook(data: WebhookRequest):
    """
    Dispara um payload para qualquer webhook externo.
    Suporta autenticação Bearer, API Key, Basic Auth ou nenhuma.
    """
    webhook_url = _validate_webhook_url(data.url)
    headers = {"Content-Type": "application/json"}

    # Merge custom headers
    if data.headers:
        headers.update(data.headers)

    # Apply auth
    if data.auth.type == "bearer" and data.auth.value:
        headers["Authorization"] = f"Bearer {data.auth.value}"
    elif data.auth.type == "api_key" and data.auth.value:
        header_name = data.auth.header_name or "X-API-Key"
        headers[header_name] = data.auth.value
    elif data.auth.type == "basic" and data.auth.value:
        import base64
        encoded = base64.b64encode(data.auth.value.encode()).decode()
        headers["Authorization"] = f"Basic {encoded}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method=data.method.upper(),
                url=webhook_url,
                headers=headers,
                json=data.payload if data.method.upper() in ["POST", "PUT", "PATCH"] else None,
                params=data.payload if data.method.upper() == "GET" else None,
            )

        # Try to parse response as JSON
        try:
            response_body = response.json()
        except Exception:
            response_body = response.text

        return {
            "status_code": response.status_code,
            "headers": dict(response.headers),
            "body": response_body,
            "elapsed_ms": response.elapsed.total_seconds() * 1000
        }
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Webhook timeout - o servidor não respondeu em 30s")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Erro de conexão: {str(e)}")


# --- Endpoint de Otimização (Loop) ---

@app.post("/api/collections/{collection_id}/run")
async def run_optimization_stream(collection_id: str):
    """
    Inicia o Loop de Otimização para uma coleção específica.
    """
    
    # 1. Buscar dados da Coleção
    collection = get_collection_by_id(collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    async def event_generator() -> AsyncGenerator[str, None]:
        
        # Recuperar histórico para saber qual iteração estamos
        runs = get_collection_runs(collection_id)
        current_iteration = len(runs) + 1
        
        # Determinar prompt inicial (se for 1ª iteração usa base, senão usa o último melhor ou o último gerado)
        # Lógica simplificada: usa o último gerado, ou o base.
        if runs:
            # Pega o último rodado
            last_run = runs[-1]
            current_subject_instruction = last_run["subject_instruction"]
        else:
            current_subject_instruction = collection["base_subject_instruction"]

        # Variável para controle do loop (neste endpoint rodaremos APENAS 1 ITERAÇÃO por chamada para simplificar controle UI,
        # MAS o usuário pediu loop automático. Vamos fazer o loop aqui.)
        # Limite de segurança
        MAX_SAFETY_ITERATIONS = 10 
        TARGET_SCORE = 90
        
        iteration_count = 0

        while iteration_count < MAX_SAFETY_ITERATIONS:
            
            yield f"data: {json.dumps({'type': 'status', 'content': f'Iniciando Iteração {current_iteration}...'})}\n\n"
            
            # --- SALVAR ESTADO INICIAL NO BANCO (Status Running) ---
            created_run = create_test_run(TestRunCreate(
                collection_id=collection_id,
                iteration=current_iteration,
                status="running",
                subject_instruction=current_subject_instruction
            ))
            run_id = created_run["id"]
            
            # Configuração para criar agentes
            config = TestConfig(
                subject_instruction=current_subject_instruction,
                evaluator_instruction=collection["base_evaluator_instruction"],
                openai_api_key=collection["openai_api_key"],
                max_turns=collection["max_turns"]
            )

            # --- EXECUTAR TESTE (Mesma lógica do run_test_stream anterior) ---
            try:
                # Usa o modelo selecionado na collection (ou gpt-4o por padrão)
                model_id = collection.get("subject_model", "gpt-4o")
                subject = create_subject_agent(config, model_id=model_id)
                evaluator = create_evaluator_agent(config)
                judge = create_judge_agent(config)
                
                transcript_str = ""
                transcript_objs = []
                last_message = "Comece a conversa."
                sender = "evaluator" 

                # Transmite que começou
                yield f"data: {json.dumps({'type': 'iteration_start', 'iteration': current_iteration, 'prompt': current_subject_instruction})}\n\n"

                for turn_i in range(config.max_turns * 2):
                    if sender == "evaluator":
                        agent = evaluator
                        current_role = "evaluator"
                        prompt = last_message if turn_i > 0 else "Inicie a conversa conforme as instruções. Seja conciso."
                    else:
                        agent = subject
                        current_role = "subject"
                        prompt = last_message

                    response = agent.run(prompt)
                    content = response.content
                    
                    last_message = content
                    transcript_str += f"{current_role.upper()}: {content}\n\n"
                    transcript_objs.append({"role": current_role, "content": content})
                    
                    # Yield realtime message (opcional, pode poluir se for muito rápido, mas legal para ver)
                    yield f"data: {json.dumps({'type': 'message', 'role': current_role, 'content': content})}\n\n"
                    
                    sender = "subject" if sender == "evaluator" else "evaluator"
                    await asyncio.sleep(0.1) # Rápido

                # --- AVALIAÇÃO ---
                yield f"data: {json.dumps({'type': 'status', 'content': 'Avaliando...'})}\n\n"
                eval_response = judge.run(f"Transcrição:\n{transcript_str}")
                result_data = _coerce_standard_evaluation(eval_response.content)
                result_json = _to_dict(result_data)
                score = result_data.scores.score_geral

                # --- ATUALIZAR BANCO (Status Completed) ---
                update_test_run(run_id, {
                    "status": "completed",
                    "transcript": transcript_objs,
                    "evaluation_result": result_json,
                    "score": score
                })
                
                yield f"data: {json.dumps({'type': 'result', 'iteration': current_iteration, 'score': score, 'details': result_json})}\n\n"

                # --- VERIFICAR CONDIÇÃO DE PARADA ---
                if score >= TARGET_SCORE:
                    yield f"data: {json.dumps({'type': 'status', 'content': f'Alvo atingido! Score {score} >= {TARGET_SCORE}. Parando.'})}\n\n"
                    yield f"data: {json.dumps({'type': 'done', 'reason': 'target_reached'})}\n\n"
                    break
                
                # --- ATUALIZAR MELHOR PROMPT (Rastreamento Histórico) ---
                # Inicializa na primeira iteração se necessário (fora do loop seria ideal, mas aqui tbm funciona)
                if 'best_score' not in locals():
                    best_score = -1
                    best_subject_instruction = current_subject_instruction

                if score > best_score:
                    best_score = score
                    best_subject_instruction = current_subject_instruction
                    yield f"data: {json.dumps({'type': 'status', 'content': f'Novo melhor score: {score}!'})}\n\n"
                elif score < best_score:
                     yield f"data: {json.dumps({'type': 'status', 'content': f'Score caiu ({score} < {best_score}). Otimizador usará o melhor histórico como referência.'})}\n\n"

                # --- OTIMIZAÇÃO (Se não atingiu score) ---
                yield f"data: {json.dumps({'type': 'status', 'content': 'Otimizando prompt...'})}\n\n"

                opt_agent = create_optimizer_agent()
                new_prompt = generate_improved_prompt(opt_agent, current_subject_instruction, result_data, best_prompt=best_subject_instruction)
                
                current_subject_instruction = new_prompt
                current_iteration += 1
                iteration_count += 1
                
                yield f"data: {json.dumps({'type': 'optimization', 'new_prompt': new_prompt})}\n\n"
                await asyncio.sleep(1) 

            except Exception as e:
                print(f"Erro no loop: {e}")
                update_test_run(run_id, {"status": "failed"})
                yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
                break
        
        else:
            yield f"data: {json.dumps({'type': 'done', 'reason': 'max_iterations'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# --- Endpoints de controle de teste ---

@app.post("/api/collections/{collection_id}/stop")
def stop_collection_run(collection_id: str):
    """Solicita parada do teste em andamento."""
    session = _get_session(collection_id)
    if session and not session.finished:
        session.request_stop()
        return {"message": "Parada solicitada"}
    return {"message": "Nenhum teste em andamento"}


@app.get("/api/collections/{collection_id}/test-status")
def get_test_status(collection_id: str):
    """Retorna status do teste: running, finished, ou none."""
    session = _get_session(collection_id)
    if not session:
        return {"status": "none"}
    return {"status": "finished" if session.finished else "running", "event_count": len(session.events)}


@app.get("/api/collections/{collection_id}/events")
async def stream_events(collection_id: str):
    """
    SSE reconectavel: envia todos os eventos acumulados + novos em tempo real.
    O cliente pode conectar, desconectar e reconectar a qualquer momento.
    """
    session = _get_session(collection_id)
    if not session:
        raise HTTPException(status_code=404, detail="Nenhum teste em andamento ou recente")

    async def event_generator() -> AsyncGenerator[str, None]:
        cursor = 0
        while True:
            # Enviar todos os eventos pendentes
            while cursor < len(session.events):
                yield f"data: {json.dumps(session.events[cursor])}\n\n"
                cursor += 1

            if session.finished:
                break

            # Esperar por novos eventos
            await session.wait_for_new()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# --- Endpoint Unificado de Teste (Smart Run) ---

@app.post("/api/collections/{collection_id}/run-smart")
async def run_smart_test(collection_id: str, background_tasks: Any = None):
    """
    Inicia teste como background task. Retorna imediatamente.
    Use GET /events para acompanhar o progresso (reconectavel).
    """
    from fastapi import BackgroundTasks
    collection = get_collection_by_id(collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Se ja tem teste rodando, rejeita
    existing = _get_session(collection_id)
    if existing and not existing.finished:
        raise HTTPException(status_code=409, detail="Ja existe um teste em andamento para esta colecao")

    documents = get_collection_documents(collection_id)
    has_documents = len(documents) > 0
    os.environ["OPENAI_API_KEY"] = collection.get("openai_api_key", "")

    session = TestSession(collection_id)
    _sessions[collection_id] = session

    async def _run_test_loop():
        s = session  # alias
        try:
            current_subject_instruction = collection["base_subject_instruction"]
            model_id = collection.get("subject_model", "gpt-5.2")
            MAX_SAFETY_ITERATIONS = 10
            best_score = -1
            best_subject_instruction = current_subject_instruction

            documents_context = ""
            doc_ids: List[str] = []
            doc_names: List[str] = []
            if has_documents:
                TARGET_SCORE = 80
                for doc in documents:
                    documents_context += f"\n\n{'='*60}\nDOCUMENTO: {doc['filename']}\n{'='*60}\n{doc['content_text']}\n{'='*60}\n"
                doc_ids = [doc["id"] for doc in documents]
                doc_names = [doc["filename"] for doc in documents]
                s.emit({"type": "mode", "mode": "document", "document_count": len(documents), "document_names": doc_names})
                s.emit({"type": "status", "content": f"Modo Documental: {len(documents)} documento(s) detectado(s)"})
            else:
                TARGET_SCORE = 90
                runs = get_collection_runs(collection_id)
                if runs:
                    current_subject_instruction = runs[-1]["subject_instruction"]
                s.emit({"type": "mode", "mode": "standard", "document_count": 0})
                s.emit({"type": "status", "content": "Modo Padrao: usando Judge de qualidade geral"})

            iteration_count = 0
            while iteration_count < MAX_SAFETY_ITERATIONS:
                if s.stop_requested:
                    s.emit({"type": "done", "reason": "stopped_by_user"})
                    break

                current_iteration = iteration_count + 1
                s.emit({"type": "iteration_start", "iteration": current_iteration, "prompt": current_subject_instruction})

                if has_documents:
                    run_record = create_document_test_run(collection_id, current_subject_instruction, doc_ids)
                else:
                    run_record = create_test_run(TestRunCreate(
                        collection_id=collection_id,
                        iteration=current_iteration + len(get_collection_runs(collection_id)),
                        status="running",
                        subject_instruction=current_subject_instruction
                    ))
                run_id = run_record["id"]
                update_fn = update_document_test_run if has_documents else update_test_run

                try:
                    config = TestConfig(
                        subject_instruction=current_subject_instruction,
                        evaluator_instruction=collection["base_evaluator_instruction"],
                        openai_api_key=collection.get("openai_api_key", ""),
                        max_turns=collection["max_turns"]
                    )
                    subject_agent = create_subject_agent(config, model_id=model_id)
                    evaluator_agent = create_evaluator_agent(config)

                    transcript_str = ""
                    transcript_objs: List[Dict[str, str]] = []
                    last_message = "Comece a conversa."
                    sender = "evaluator"
                    stopped = False

                    for turn_i in range(config.max_turns * 2):
                        if s.stop_requested:
                            stopped = True
                            break
                        if sender == "evaluator":
                            agent = evaluator_agent
                            current_role = "evaluator"
                            prompt = last_message if turn_i > 0 else "Inicie a conversa conforme as instruções. Seja conciso."
                        else:
                            agent = subject_agent
                            current_role = "subject"
                            prompt = last_message

                        response = await _run_agent_with_retry(agent, prompt, label=current_role)
                        content = response.content
                        last_message = content
                        transcript_str += f"{current_role.upper()}: {content}\n\n"
                        transcript_objs.append({"role": current_role, "content": content})
                        s.emit({"type": "message", "role": current_role, "content": content})
                        sender = "subject" if sender == "evaluator" else "evaluator"
                        await asyncio.sleep(0.1)

                    if stopped:
                        update_fn(run_id, {"status": "stopped", "transcript": transcript_objs})
                        s.emit({"type": "done", "reason": "stopped_by_user"})
                        break

                    s.emit({"type": "status", "content": "Avaliando..."})

                    if has_documents:
                        judge = create_document_judge_agent()
                        judge_input = f"--- DOCUMENTOS DE REFERÊNCIA (GABARITO) ---\n{documents_context}\n\n--- PROMPT ATUAL DO AGENTE ---\n{current_subject_instruction}\n\n--- CONVERSA COMPLETA ---\n{transcript_str}\n\nAnalise a conversa comparando com os documentos de referência acima."
                        eval_response = await _run_agent_with_retry(judge, judge_input, label="document_judge")
                        result_data = _coerce_document_evaluation(eval_response.content)
                        result_json = _to_dict(result_data)
                        result_json["documentos_utilizados"] = doc_names
                        score = result_data.scores.score_geral
                    else:
                        judge = create_judge_agent(config)
                        eval_response = await _run_agent_with_retry(judge, f"Transcrição:\n{transcript_str}", label="judge")
                        result_data = _coerce_standard_evaluation(eval_response.content)
                        result_json = _to_dict(result_data)
                        score = result_data.scores.score_geral

                    update_fn(run_id, {"status": "completed", "transcript": transcript_objs, "evaluation_result": result_json, "score": score})
                    s.emit({"type": "result", "iteration": current_iteration, "score": score, "details": result_json})

                    if score >= TARGET_SCORE:
                        s.emit({"type": "status", "content": f"Alvo atingido! Score {score} >= {TARGET_SCORE}."})
                        s.emit({"type": "done", "reason": "target_reached"})
                        break

                    if score > best_score:
                        best_score = score
                        best_subject_instruction = current_subject_instruction
                        s.emit({"type": "status", "content": f"Novo melhor score: {score}!"})
                    elif score < best_score:
                        s.emit({"type": "status", "content": f"Score caiu ({score} < {best_score}). Usando melhor historico."})

                    if s.stop_requested:
                        s.emit({"type": "done", "reason": "stopped_by_user"})
                        break

                    s.emit({"type": "status", "content": "Otimizando prompt..."})
                    opt_agent = create_optimizer_agent()
                    new_prompt = generate_improved_prompt(
                        opt_agent, current_subject_instruction, result_data,
                        best_prompt=best_subject_instruction,
                        documents_context=documents_context if has_documents else None,
                    )
                    current_subject_instruction = new_prompt
                    iteration_count += 1
                    s.emit({"type": "optimization", "new_prompt": new_prompt})
                    await asyncio.sleep(1)

                except Exception as e:
                    print(f"Erro no loop: {e}")
                    import traceback
                    traceback.print_exc()
                    update_fn(run_id, {"status": "failed"})
                    s.emit({"type": "error", "content": str(e)})
                    break
            else:
                s.emit({"type": "done", "reason": "max_iterations"})

        except Exception as e:
            print(f"Erro fatal no test loop: {e}")
            s.emit({"type": "error", "content": str(e)})
            s.emit({"type": "done", "reason": "fatal_error"})
        finally:
            s.finished = True

    # Lanca como background task
    asyncio.create_task(_run_test_loop())

    return {"status": "started", "mode": "document" if has_documents else "standard", "collection_id": collection_id}


# --- Endpoints de Documentos de Referência ---

@app.post("/api/collections/{collection_id}/documents")
async def upload_document(collection_id: str, file: UploadFile = File(...)):
    """Upload de documento de referência (PDF, MD, TXT) para uma coleção."""
    collection = get_collection_by_id(collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    allowed_extensions = [".pdf", ".md", ".markdown", ".txt"]
    filename = file.filename or "unknown"
    if not any(filename.lower().endswith(ext) for ext in allowed_extensions):
        raise HTTPException(status_code=400, detail=f"Tipo de arquivo não suportado. Use: {', '.join(allowed_extensions)}")

    file_bytes = await file.read()
    file_size = len(file_bytes)
    if file_size > MAX_DOCUMENT_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"Arquivo muito grande. Limite: {MAX_DOCUMENT_SIZE_BYTES // (1024 * 1024)}MB")

    try:
        content_text = parse_document(filename, file_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao processar documento: {str(e)}")

    if not content_text.strip():
        raise HTTPException(status_code=400, detail="Documento vazio ou sem texto extraível")

    file_type = filename.rsplit(".", 1)[-1].lower()
    doc = create_reference_document(collection_id, filename, file_type, content_text, file_size)
    return doc


@app.get("/api/collections/{collection_id}/documents")
def list_documents(collection_id: str):
    """Lista todos os documentos de referência de uma coleção."""
    return get_collection_documents(collection_id)


@app.delete("/api/documents/{document_id}")
def remove_document(document_id: str):
    """Remove um documento de referência."""
    delete_reference_document(document_id)
    return {"message": "Documento removido"}


# --- Endpoint de Teste Baseado em Documentos ---

@app.get("/api/collections/{collection_id}/document-test-runs")
def list_document_test_runs(collection_id: str):
    """Lista todos os testes baseados em documentos de uma coleção."""
    return get_document_test_runs(collection_id)


@app.post("/api/collections/{collection_id}/run-document-test")
async def run_document_test(collection_id: str):
    """
    Executa loop de teste + otimização comparando o agente com documentos de referência.
    Document Judge avalia -> Optimizer corrige prompt -> repete até score alvo ou max iterações.
    """
    collection = get_collection_by_id(collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    documents = get_collection_documents(collection_id)
    if not documents:
        raise HTTPException(status_code=400, detail="Nenhum documento de referência encontrado. Faça upload de documentos antes de rodar o teste.")

    async def event_generator() -> AsyncGenerator[str, None]:
        current_subject_instruction = collection["base_subject_instruction"]
        doc_ids = [doc["id"] for doc in documents]
        doc_names = [doc["filename"] for doc in documents]

        # Concatenar conteúdo dos documentos
        documents_context = ""
        for doc in documents:
            documents_context += f"\n\n{'='*60}\n"
            documents_context += f"DOCUMENTO: {doc['filename']}\n"
            documents_context += f"{'='*60}\n"
            documents_context += doc["content_text"]
            documents_context += f"\n{'='*60}\n"

        yield f"data: {json.dumps({'type': 'status', 'content': f'Iniciando loop de teste com {len(documents)} documento(s) de referência...'})}\n\n"
        yield f"data: {json.dumps({'type': 'status', 'content': f'Documentos: {chr(44).join(doc_names)}'})}\n\n"

        MAX_SAFETY_ITERATIONS = 10
        TARGET_SCORE = 80
        iteration_count = 0
        best_score = -1
        best_subject_instruction = current_subject_instruction

        while iteration_count < MAX_SAFETY_ITERATIONS:
            current_iteration = iteration_count + 1

            yield f"data: {json.dumps({'type': 'iteration_start', 'iteration': current_iteration, 'prompt': current_subject_instruction})}\n\n"
            yield f"data: {json.dumps({'type': 'status', 'content': f'Iteração {current_iteration} — Executando conversa...'})}\n\n"

            # Criar registro no banco
            run_record = create_document_test_run(collection_id, current_subject_instruction, doc_ids)
            run_id = run_record["id"]

            try:
                # Criar agentes
                config = TestConfig(
                    subject_instruction=current_subject_instruction,
                    evaluator_instruction=collection["base_evaluator_instruction"],
                    openai_api_key=collection["openai_api_key"],
                    max_turns=collection["max_turns"]
                )

                model_id = collection.get("subject_model", "gpt-5.2")
                subject = create_subject_agent(config, model_id=model_id)
                evaluator = create_evaluator_agent(config)

                # Executar conversa
                transcript_str = ""
                transcript_objs = []
                last_message = "Comece a conversa."
                sender = "evaluator"

                for turn_i in range(config.max_turns * 2):
                    if sender == "evaluator":
                        agent = evaluator
                        current_role = "evaluator"
                        prompt = last_message if turn_i > 0 else "Inicie a conversa conforme as instruções. Seja conciso."
                    else:
                        agent = subject
                        current_role = "subject"
                        prompt = last_message

                    response = agent.run(prompt)
                    content = response.content

                    last_message = content
                    transcript_str += f"{current_role.upper()}: {content}\n\n"
                    transcript_objs.append({"role": current_role, "content": content})

                    yield f"data: {json.dumps({'type': 'message', 'role': current_role, 'content': content})}\n\n"

                    sender = "subject" if sender == "evaluator" else "evaluator"
                    await asyncio.sleep(0.1)

                # --- AVALIAÇÃO com Document Judge ---
                yield f"data: {json.dumps({'type': 'status', 'content': 'Analisando aderência aos documentos...'})}\n\n"

                document_judge = create_document_judge_agent()

                judge_input = f"""
--- DOCUMENTOS DE REFERÊNCIA (GABARITO) ---
{documents_context}

--- PROMPT ATUAL DO AGENTE ---
{current_subject_instruction}

--- CONVERSA COMPLETA ---
{transcript_str}

Analise a conversa comparando com os documentos de referência acima.
Avalie cada dimensão conforme as instruções.
"""

                eval_response = document_judge.run(judge_input)
                result_data = _coerce_document_evaluation(eval_response.content)
                result_json = _to_dict(result_data)
                result_json["documentos_utilizados"] = doc_names
                result_data = _coerce_document_evaluation(result_json)
                result_json = _to_dict(result_data)
                score = result_data.scores.score_geral

                # Salvar no banco
                update_document_test_run(run_id, {
                    "status": "completed",
                    "transcript": transcript_objs,
                    "evaluation_result": result_json,
                    "score": score
                })

                yield f"data: {json.dumps({'type': 'result', 'iteration': current_iteration, 'score': score, 'details': result_json})}\n\n"

                # --- VERIFICAR CONDIÇÃO DE PARADA ---
                if score >= TARGET_SCORE:
                    yield f"data: {json.dumps({'type': 'status', 'content': f'Alvo atingido! Score {score} >= {TARGET_SCORE}. Parando.'})}\n\n"
                    yield f"data: {json.dumps({'type': 'done', 'reason': 'target_reached'})}\n\n"
                    break

                # --- RASTREAMENTO DO MELHOR PROMPT ---
                if score > best_score:
                    best_score = score
                    best_subject_instruction = current_subject_instruction
                    yield f"data: {json.dumps({'type': 'status', 'content': f'Novo melhor score: {score}!'})}\n\n"
                elif score < best_score:
                    yield f"data: {json.dumps({'type': 'status', 'content': f'Score caiu ({score} < {best_score}). Otimizador usará o melhor histórico.'})}\n\n"

                # --- OTIMIZAÇÃO com feedback do Document Judge + documentos ---
                yield f"data: {json.dumps({'type': 'status', 'content': 'Otimizando prompt com base nos documentos e avaliação...'})}\n\n"

                opt_agent = create_optimizer_agent()
                new_prompt = generate_improved_prompt(
                    opt_agent,
                    current_subject_instruction,
                    result_data,
                    best_prompt=best_subject_instruction,
                    documents_context=documents_context,
                )

                current_subject_instruction = new_prompt
                iteration_count += 1

                yield f"data: {json.dumps({'type': 'optimization', 'new_prompt': new_prompt})}\n\n"
                await asyncio.sleep(1)

            except Exception as e:
                print(f"Erro no loop de teste com documentos: {e}")
                import traceback
                traceback.print_exc()
                update_document_test_run(run_id, {"status": "failed"})
                yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
                break

        else:
            yield f"data: {json.dumps({'type': 'done', 'reason': 'max_iterations'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
