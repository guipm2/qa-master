import json
import asyncio
from typing import AsyncGenerator, Dict, Any
import os
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from models import TestConfig, EvaluationResult
from agents import create_subject_agent, create_evaluator_agent, create_judge_agent, AVAILABLE_MODELS
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
    TestRunCreate
)

from optimizer import create_optimizer_agent, generate_improved_prompt

app = FastAPI(title="QA Master Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

    # 2. Pega a chave do objeto 'collection' e disponibiliza para a biblioteca Agno
    os.environ["OPENAI_API_KEY"] = collection["openai_api_key"]

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
                result_data = eval_response.content
                
                if hasattr(result_data, "model_dump"):
                    result_json = result_data.model_dump()
                else:
                    result_json = result_data if isinstance(result_data, dict) else {}

                score = result_json.get("scores", {}).get("score_geral", 0)

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
                
                # Passa o melhor prompt histórico para o otimizador usar de base comparativa
                opt_agent = create_optimizer_agent(current_subject_instruction, result_data, best_prompt=best_subject_instruction)
                
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
