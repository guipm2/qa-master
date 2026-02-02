import json
import asyncio
from typing import AsyncGenerator
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from models import TestConfig, ChatMessage, EvaluationResult
from agents import create_subject_agent, create_evaluator_agent, create_judge_agent

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

@app.post("/api/run-test")
async def run_test_stream(config: TestConfig):
    """
    Executa a conversa de teste e transmite os resultados via SSE.
    """
    async def event_generator() -> AsyncGenerator[str, None]:
        # Define a chave da API no ambiente para o Agno usar
        os.environ["OPENAI_API_KEY"] = config.openai_api_key
        
        try:
            # 1. Inicializar Agentes
            subject = create_subject_agent(config)
            evaluator = create_evaluator_agent(config)
            judge = create_judge_agent(config)
            
            transcript_str = ""
            transcript_objs = []
            
            last_message = "Comece a conversa."
            sender = "evaluator" 

            yield f"data: {json.dumps({'type': 'status', 'content': 'Agentes inicializados. Iniciando conversa...'})}\n\n"

            # 2. Loop de Conversa
            for turn_i in range(config.max_turns * 2):  # *2 porque é ping-pong
                
                if sender == "evaluator":
                    # Avaliador fala
                    agent = evaluator
                    current_role = "evaluator"
                    prompt = last_message if turn_i > 0 else "Inicie a conversa conforme as instruções. Seja conciso."
                else:
                    # Sujeito fala
                    agent = subject
                    current_role = "subject"
                    prompt = last_message

                # Executar Agente
                response = agent.run(prompt)
                content = response.content
                
                # Atualizar Estado
                last_message = content
                transcript_str += f"{current_role.upper()}: {content}\n\n"
                transcript_objs.append({"role": current_role, "content": content})
                
                # Transmitir Mensagem
                yield f"data: {json.dumps({'type': 'message', 'role': current_role, 'content': content})}\n\n"
                
                # Alternar Turno
                sender = "subject" if sender == "evaluator" else "evaluator"
                
                # Pequeno atraso para evitar rate limits ou disparo rápido na UI
                await asyncio.sleep(0.5)

            # 3. Fase de Avaliação
            yield f"data: {json.dumps({'type': 'status', 'content': 'Conversa concluída. Gerando avaliação...'})}\n\n"
            
            eval_response = judge.run(f"Transcrição:\n{transcript_str}")
            result_data = eval_response.content  # Deve ser modelo Pydantic convertido em dict automaticamente pelo Agno
            # Agno retorna objeto 'Response'. Se output_schema está definido, content é o objeto.
            
            # Serializar EvaluationResult
            if hasattr(result_data, "model_dump"):
                result_json = result_data.model_dump()
            elif isinstance(result_data, dict):
                 result_json = result_data
            else:
                 # Fallback se algo estranho acontecer (improvável com output_schema)
                 result_json = {"score": 0, "passed": False, "reasoning": str(result_data), "suggestions": []}

            yield f"data: {json.dumps({'type': 'result', 'content': result_json})}\n\n"
            
            yield f"data: {json.dumps({'type': 'status', 'content': 'Concluído'})}\n\n"
            
        except Exception as e:
            print(f"ERRO em run_test_stream: {e}")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
