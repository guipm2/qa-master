"""
Test Executor - Sistema de execução de testes automatizados com personas.

Este módulo fornece funções para:
- Detectar fim de conversa
- Executar testes individuais com personas
- Executar baterias de testes (1 teste x N personas)
- Executar matrizes de testes (N testes x M personas)
- Análise consolidada com agente juiz
"""

import logging
import os
import re
import uuid
import random
from collections import Counter
from datetime import datetime
from typing import Optional, Any

from agno.agent import Agent

# Importar PersonaInjector do módulo core
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.persona_injector import PersonaInjector, gerar_dados_cliente_aleatorios

# Configuração de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constantes padrão
DEFAULT_MAX_TURNOS = 20
DEFAULT_NUM_PERSONAS = 5


# Padrões para detecção de fim de conversa
PADROES_FIM_CONVERSA = [
    r"\[FIM\]",  # Marcador explícito
    r"\[ENCERRAR\]",
    r"transferir_para_comercial",  # Função de transferência
    r"transferido.*comercial",
]

PADROES_DESPEDIDA = [
    r"tchau",
    r"até mais",
    r"obrigad[oa]",
    r"valeu",
    r"falou",
    r"vlw",
    r"foi bom falar",
    r"boa sorte",
    r"tudo certo",
    r"tenha um bom dia",
]


def detectar_fim_conversa(conversa: list[dict]) -> bool:
    """
    Detecta se conversa chegou ao fim natural.
    
    Args:
        conversa: Lista de mensagens {"role": "user/assistant", "content": "..."}
    
    Returns:
        True se deve encerrar, False caso contrário
    
    Critérios:
    - Testador respondeu "[FIM]"
    - Padrões de despedida bilateral
    - Função de transferência foi chamada
    - Checklist aprovado + confirmação
    
    Example:
        >>> conversa = [
        ...     {"role": "user", "content": "ok, [FIM]"},
        ... ]
        >>> detectar_fim_conversa(conversa)
        True
    """
    if not conversa:
        return False
    
    # Pegar últimas mensagens
    ultimas_msgs = conversa[-4:] if len(conversa) >= 4 else conversa
    
    for msg in ultimas_msgs:
        content = msg.get("content", "").lower()
        
        # Verificar padrões de fim
        for padrao in PADROES_FIM_CONVERSA:
            if re.search(padrao, content, re.IGNORECASE):
                logger.info(f"Fim detectado: padrão '{padrao}'")
                return True
    
    # Verificar despedida bilateral (últimas 2 mensagens)
    if len(conversa) >= 2:
        msg_user = ""
        msg_assistant = ""
        
        for msg in reversed(ultimas_msgs):
            if msg["role"] == "user" and not msg_user:
                msg_user = msg.get("content", "").lower()
            elif msg["role"] == "assistant" and not msg_assistant:
                msg_assistant = msg.get("content", "").lower()
        
        despedida_user = any(
            re.search(p, msg_user) for p in PADROES_DESPEDIDA
        )
        despedida_assistant = any(
            re.search(p, msg_assistant) for p in PADROES_DESPEDIDA
        )
        
        if despedida_user and despedida_assistant:
            logger.info("Fim detectado: despedida bilateral")
            return True
    
    return False


def executar_teste_com_persona(
    prompt_teste_path: str,
    persona_id: str,
    agente_alvo: Agent,
    max_turnos: int = 20,
    personas_path: Optional[str] = None
) -> dict:
    """
    Executa 1 teste completo com uma persona específica.
    
    Args:
        prompt_teste_path: Caminho para arquivo .md do teste
        persona_id: ID da persona a usar (ex: "PERSONA_010")
        agente_alvo: Agente sendo testado (ex: Sofia)
        max_turnos: Máximo de turnos de conversa
        personas_path: Caminho para JSON de personas (opcional)
    
    Returns:
        Dicionário com resultado do teste:
        {
            "test_id": str,
            "persona_id": str,
            "persona_nome": str,
            "prompt_teste": str,
            "timestamp_inicio": str,
            "timestamp_fim": str,
            "duracao_segundos": float,
            "total_turnos": int,
            "finalizado_naturalmente": bool,
            "conversa": list,
            "dados_cliente_usados": dict
        }
    
    Example:
        >>> from agno.agent import Agent
        >>> sofia = Agent(description="Sofia SDR", instructions=["..."])
        >>> resultado = executar_teste_com_persona(
        ...     "prompts_teste/sofia_teste_001.md",
        ...     "PERSONA_010",
        ...     sofia
        ... )
    """
    # Configurar caminho das personas
    if personas_path is None:
        # Usar caminho padrão relativo
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        personas_path = os.path.join(base_dir, "core", "personas_genericas_puras.json")
    
    # Validar arquivo de teste
    if not os.path.exists(prompt_teste_path):
        raise FileNotFoundError(f"Arquivo de teste não encontrado: {prompt_teste_path}")
    
    # Inicializar
    injector = PersonaInjector(personas_path)
    persona = injector.obter_persona(persona_id)
    
    # Gerar dados do cliente
    dados_cliente = gerar_dados_cliente_aleatorios()
    
    # Carregar prompt de teste
    with open(prompt_teste_path, "r", encoding="utf-8") as f:
        prompt_teste = f.read()
    
    # Criar prompt final do testador
    prompt_testador = injector.criar_prompt_testador(
        seu_prompt=prompt_teste,
        persona_id=persona_id,
        dados_opcionais=dados_cliente
    )
    
    # Criar agente testador
    testador = Agent(
        description=f"Cliente {persona['nome']}",
        instructions=[prompt_testador],
        markdown=False
    )
    
    # Inicializar resultado
    test_id = f"TEST_{uuid.uuid4().hex[:8].upper()}"
    timestamp_inicio = datetime.now().isoformat()
    conversa: list[dict] = []
    
    logger.info(f"Iniciando teste {test_id} com persona {persona_id} ({persona['nome']})")
    
    # Loop de conversa
    turno = 0
    finalizado_naturalmente = False
    
    # Mensagem inicial do testador
    try:
        msg_testador = testador.run("Inicie a conversa como descrito na Fase 1.")
        msg_testador_content = msg_testador.content if hasattr(msg_testador, 'content') else str(msg_testador)
    except Exception as e:
        logger.error(f"Erro ao iniciar testador: {e}")
        msg_testador_content = "oi, quero limpar meu sofa"
    
    conversa.append({
        "turno": 1,
        "role": "user",
        "content": msg_testador_content,
        "timestamp": datetime.now().isoformat()
    })
    
    logger.info(f"Turno 1: Testador → '{msg_testador_content[:50]}...'")
    
    while turno < max_turnos:
        turno += 1
        
        # Agente alvo responde
        try:
            msg_alvo = agente_alvo.run(msg_testador_content)
            msg_alvo_content = msg_alvo.content if hasattr(msg_alvo, 'content') else str(msg_alvo)
        except Exception as e:
            logger.error(f"Erro no agente alvo: {e}")
            break
        
        conversa.append({
            "turno": turno,
            "role": "assistant",
            "content": msg_alvo_content,
            "timestamp": datetime.now().isoformat()
        })
        
        logger.info(f"Turno {turno}: Alvo → '{msg_alvo_content[:50]}...'")
        
        # Verificar fim de conversa
        if detectar_fim_conversa(conversa):
            finalizado_naturalmente = True
            logger.info("Conversa finalizada naturalmente")
            break
        
        # Testador responde
        try:
            msg_testador = testador.run(msg_alvo_content)
            msg_testador_content = msg_testador.content if hasattr(msg_testador, 'content') else str(msg_testador)
        except Exception as e:
            logger.error(f"Erro no testador: {e}")
            break
        
        turno += 1
        conversa.append({
            "turno": turno,
            "role": "user",
            "content": msg_testador_content,
            "timestamp": datetime.now().isoformat()
        })
        
        logger.info(f"Turno {turno}: Testador → '{msg_testador_content[:50]}...'")
        
        # Verificar fim após resposta do testador
        if detectar_fim_conversa(conversa):
            finalizado_naturalmente = True
            logger.info("Conversa finalizada naturalmente")
            break
    
    # Calcular duração
    timestamp_fim = datetime.now().isoformat()
    duracao = (
        datetime.fromisoformat(timestamp_fim) - 
        datetime.fromisoformat(timestamp_inicio)
    ).total_seconds()
    
    if turno >= max_turnos and not finalizado_naturalmente:
        logger.warning(f"Conversa atingiu limite de {max_turnos} turnos")
    
    resultado = {
        "test_id": test_id,
        "persona_id": persona_id,
        "persona_nome": persona["nome"],
        "prompt_teste": os.path.basename(prompt_teste_path),
        "timestamp_inicio": timestamp_inicio,
        "timestamp_fim": timestamp_fim,
        "duracao_segundos": round(duracao, 2),
        "total_turnos": len(conversa),
        "finalizado_naturalmente": finalizado_naturalmente,
        "conversa": conversa,
        "dados_cliente_usados": dados_cliente
    }
    
    logger.info(f"Teste {test_id} concluído. Turnos: {len(conversa)}, Natural: {finalizado_naturalmente}")
    
    return resultado


def executar_bateria_testes(
    prompt_teste_path: str,
    persona_ids: list[str],
    agente_alvo: Agent,
    max_turnos: int = 20,
    personas_path: Optional[str] = None
) -> list[dict]:
    """
    Executa mesmo teste com múltiplas personas.
    
    Args:
        prompt_teste_path: Caminho para arquivo .md do teste
        persona_ids: Lista de IDs de personas
        agente_alvo: Agente sendo testado
        max_turnos: Máximo de turnos por teste
        personas_path: Caminho para JSON de personas (opcional)
    
    Returns:
        Lista de resultados (um por persona)
    
    Example:
        >>> personas = ["PERSONA_001", "PERSONA_010", "PERSONA_020"]
        >>> resultados = executar_bateria_testes(
        ...     "prompts_teste/sofia_teste_001.md",
        ...     personas,
        ...     sofia_agent
        ... )
        >>> print(f"Executados: {len(resultados)} testes")
    """
    logger.info(f"Iniciando bateria de testes com {len(persona_ids)} personas")
    
    resultados = []
    
    for i, persona_id in enumerate(persona_ids, 1):
        logger.info(f"Executando teste {i}/{len(persona_ids)}: {persona_id}")
        
        try:
            resultado = executar_teste_com_persona(
                prompt_teste_path=prompt_teste_path,
                persona_id=persona_id,
                agente_alvo=agente_alvo,
                max_turnos=max_turnos,
                personas_path=personas_path
            )
            resultados.append(resultado)
        except Exception as e:
            logger.error(f"Erro no teste com {persona_id}: {e}")
            resultados.append({
                "test_id": f"ERRO_{uuid.uuid4().hex[:8].upper()}",
                "persona_id": persona_id,
                "erro": str(e)
            })
    
    logger.info(f"Bateria concluída. {len(resultados)} testes executados.")
    return resultados


def executar_matriz_testes(
    prompts_teste_paths: list[str],
    persona_ids: list[str],
    agente_alvo: Agent,
    max_turnos: int = 20,
    personas_path: Optional[str] = None
) -> list[dict]:
    """
    Executa múltiplos testes com múltiplas personas (matriz N x M).
    
    Args:
        prompts_teste_paths: Lista de caminhos para arquivos .md de teste
        persona_ids: Lista de IDs de personas
        agente_alvo: Agente sendo testado
        max_turnos: Máximo de turnos por teste
        personas_path: Caminho para JSON de personas (opcional)
    
    Returns:
        Lista de todos os resultados (N testes x M personas)
    
    Example:
        >>> testes = [
        ...     "prompts_teste/sofia_teste_001.md",
        ...     "prompts_teste/sofia_teste_002.md"
        ... ]
        >>> personas = ["PERSONA_001", "PERSONA_010"]
        >>> # 2 testes x 2 personas = 4 execuções
        >>> resultados = executar_matriz_testes(testes, personas, sofia)
    """
    total = len(prompts_teste_paths) * len(persona_ids)
    logger.info(
        f"Iniciando matriz de testes: "
        f"{len(prompts_teste_paths)} testes x {len(persona_ids)} personas = {total} execuções"
    )
    
    resultados = []
    contador = 0
    
    for prompt_path in prompts_teste_paths:
        for persona_id in persona_ids:
            contador += 1
            logger.info(
                f"Executando {contador}/{total}: "
                f"{os.path.basename(prompt_path)} x {persona_id}"
            )
            
            try:
                resultado = executar_teste_com_persona(
                    prompt_teste_path=prompt_path,
                    persona_id=persona_id,
                    agente_alvo=agente_alvo,
                    max_turnos=max_turnos,
                    personas_path=personas_path
                )
                resultados.append(resultado)
            except Exception as e:
                logger.error(f"Erro: {e}")
                resultados.append({
                    "test_id": f"ERRO_{uuid.uuid4().hex[:8].upper()}",
                    "prompt_teste": os.path.basename(prompt_path),
                    "persona_id": persona_id,
                    "erro": str(e)
                })
    
    logger.info(f"Matriz concluída. {len(resultados)} testes executados.")
    return resultados


def selecionar_personas(
    num_personas: int = DEFAULT_NUM_PERSONAS,
    modo: str = "aleatorio",
    personas_path: Optional[str] = None
) -> list[str]:
    """
    Seleciona N personas para usar nos testes.
    
    Args:
        num_personas: Quantidade de personas a selecionar (1-20)
        modo: "aleatorio", "sequencial", ou "diversificado"
        personas_path: Caminho para JSON de personas (opcional)
    
    Returns:
        Lista de IDs de personas selecionadas
        
    Raises:
        ValueError: Se num_personas < 1 ou > 20
    
    Example:
        >>> personas = selecionar_personas(5, modo="aleatorio")
        >>> print(personas)
        ['PERSONA_003', 'PERSONA_010', 'PERSONA_015', ...]
    """
    # Validar quantidade
    if num_personas < 1 or num_personas > 20:
        raise ValueError(f"num_personas deve estar entre 1 e 20, recebido: {num_personas}")
    
    # Configurar caminho das personas
    if personas_path is None:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        personas_path = os.path.join(base_dir, "core", "personas_genericas_puras.json")
    
    # Carregar personas
    injector = PersonaInjector(personas_path)
    todas_ids = list(injector.personas.keys())
    
    if modo == "sequencial":
        # Pegar as primeiras N
        selecionadas = todas_ids[:num_personas]
    elif modo == "diversificado":
        # Distribuir uniformemente pelo range
        step = len(todas_ids) // num_personas
        indices = [i * step for i in range(num_personas)]
        selecionadas = [todas_ids[i] for i in indices[:num_personas]]
    else:  # aleatorio
        selecionadas = random.sample(todas_ids, num_personas)
    
    logger.info(f"Selecionadas {len(selecionadas)} personas (modo: {modo})")
    return selecionadas


def executar_bateria_com_analise_juiz(
    prompt_teste_path: str,
    num_personas: int = DEFAULT_NUM_PERSONAS,
    agente_alvo: Optional[Agent] = None,
    agente_juiz: Optional[Agent] = None,
    max_turnos: int = DEFAULT_MAX_TURNOS,
    regras_agente: str = "",
    modo_selecao: str = "aleatorio",
    personas_path: Optional[str] = None,
    persona_ids: Optional[list[str]] = None
) -> dict:
    """
    Executa bateria de testes com múltiplas personas e análise consolidada do juiz.
    
    O juiz analisa CADA teste separadamente, gera score individual,
    e no final produz uma análise geral consolidada.
    
    Args:
        prompt_teste_path: Caminho para arquivo .md do teste
        num_personas: Quantidade de personas a usar (1-20)
        agente_alvo: Agente sendo testado (obrigatório)
        agente_juiz: Agente juiz para análise (opcional, cria um se não fornecido)
        max_turnos: Máximo de turnos por teste (padrão: 20)
        regras_agente: Regras do agente para análise do juiz
        modo_selecao: "aleatorio", "sequencial", ou "diversificado"
        personas_path: Caminho para JSON de personas
        persona_ids: Lista específica de IDs (ignora num_personas e modo_selecao)
    
    Returns:
        Dicionário com resultado consolidado:
        {
            "session_id": str,
            "timestamp_inicio": str,
            "timestamp_fim": str,
            "duracao_total_segundos": float,
            "num_personas": int,
            "max_turnos_por_teste": int,
            "prompt_teste_usado": str,
            "resultados_por_persona": [...],
            "testes_detalhados": [...],
            "analise_geral": {...}
        }
    
    Example:
        >>> resultado = executar_bateria_com_analise_juiz(
        ...     prompt_teste_path="prompts_teste/sofia_teste_001.md",
        ...     num_personas=5,
        ...     agente_alvo=sofia_agent,
        ...     regras_agente="Nunca revelar ser IA, sempre coletar nome e telefone"
        ... )
    """
    if agente_alvo is None:
        raise ValueError("agente_alvo é obrigatório")
    
    # Selecionar personas
    if persona_ids:
        personas_selecionadas = persona_ids[:20]  # Limita a 20
    else:
        personas_selecionadas = selecionar_personas(
            num_personas=num_personas,
            modo=modo_selecao,
            personas_path=personas_path
        )
    
    # Inicializar sessão
    session_id = f"SESSION_{uuid.uuid4().hex[:8].upper()}"
    timestamp_inicio = datetime.now().isoformat()
    
    logger.info(f"=== INICIANDO SESSÃO {session_id} ===")
    logger.info(f"Personas: {len(personas_selecionadas)}, Max turnos: {max_turnos}")
    
    # Carregar prompt de teste
    with open(prompt_teste_path, "r", encoding="utf-8") as f:
        prompt_teste_conteudo = f.read()
    
    # Executar todos os testes primeiro
    logger.info("FASE 1: Executando testes com todas as personas...")
    testes_executados = []
    
    for i, persona_id in enumerate(personas_selecionadas, 1):
        logger.info(f"[{i}/{len(personas_selecionadas)}] Testando com {persona_id}...")
        
        try:
            resultado = executar_teste_com_persona(
                prompt_teste_path=prompt_teste_path,
                persona_id=persona_id,
                agente_alvo=agente_alvo,
                max_turnos=max_turnos,
                personas_path=personas_path
            )
            testes_executados.append(resultado)
        except Exception as e:
            logger.error(f"Erro no teste com {persona_id}: {e}")
            testes_executados.append({
                "test_id": f"ERRO_{uuid.uuid4().hex[:8].upper()}",
                "persona_id": persona_id,
                "persona_nome": persona_id,
                "erro": str(e),
                "conversa": []
            })
    
    # FASE 2: Analisar cada teste com o juiz
    logger.info("FASE 2: Analisando cada teste com o agente juiz...")
    resultados_por_persona = []
    pontos_fortes_todos = []
    pontos_fracos_todos = []
    recomendacoes_todas = []
    scores_soma = {
        "compliance": 0,
        "eficacia": 0,
        "eficiencia": 0,
        "qualidade_comunicacao": 0,
        "experiencia_usuario": 0,
        "score_geral": 0
    }
    testes_aprovados = 0
    testes_reprovados = 0
    testes_atencao = 0
    testes_com_score = 0
    
    for teste in testes_executados:
        persona_id = teste.get("persona_id", "DESCONHECIDO")
        persona_nome = teste.get("persona_nome", persona_id)
        
        if "erro" in teste:
            resultados_por_persona.append({
                "persona_id": persona_id,
                "persona_nome": persona_nome,
                "scores": None,
                "aprovado": False,
                "erro": teste["erro"]
            })
            continue
        
        # Analisar com juiz se disponível
        avaliacao = None
        if agente_juiz is not None:
            try:
                # Formatar conversa para análise
                conversa_texto = "\n".join([
                    f"{msg['role'].upper()}: {msg['content']}"
                    for msg in teste.get("conversa", [])
                ])
                
                prompt_analise = f"""
## REGRAS DO AGENTE
{regras_agente}

## CENÁRIO DO TESTE
Teste com persona: {persona_nome} ({persona_id})
Prompt: {os.path.basename(prompt_teste_path)}
Total de turnos: {teste.get('total_turnos', 0)}

## CONVERSA COMPLETA
{conversa_texto}

Analise esta conversa e forneça a avaliação no formato JSON especificado.
"""
                
                resultado_juiz = agente_juiz.run(prompt_analise)
                
                # Tentar extrair dados estruturados
                if hasattr(resultado_juiz, 'content'):
                    import json
                    try:
                        # Se for um objeto Pydantic
                        if hasattr(resultado_juiz.content, 'model_dump'):
                            avaliacao = resultado_juiz.content.model_dump()
                        elif isinstance(resultado_juiz.content, str):
                            # Tentar parsear JSON do texto
                            content = resultado_juiz.content
                            if '{' in content:
                                json_start = content.find('{')
                                json_end = content.rfind('}') + 1
                                avaliacao = json.loads(content[json_start:json_end])
                        elif isinstance(resultado_juiz.content, dict):
                            avaliacao = resultado_juiz.content
                    except:
                        logger.warning(f"Não foi possível parsear avaliação do juiz para {persona_id}")
                
                teste["avaliacao"] = avaliacao
                
            except Exception as e:
                logger.error(f"Erro na análise do juiz para {persona_id}: {e}")
        
        # Coletar métricas
        if avaliacao and "scores" in avaliacao:
            scores = avaliacao["scores"]
            for key in scores_soma:
                scores_soma[key] += scores.get(key, 0)
            testes_com_score += 1
            
            # Coletar pontos fortes/fracos
            if "resumo" in avaliacao:
                pontos_fortes_todos.extend(avaliacao["resumo"].get("pontos_fortes", []))
                pontos_fracos_todos.extend(avaliacao["resumo"].get("pontos_fracos", []))
                recomendacoes_todas.extend(avaliacao["resumo"].get("recomendacoes", []))
                
                resultado_status = avaliacao["resumo"].get("resultado", "ATENÇÃO")
                if resultado_status == "APROVADO":
                    testes_aprovados += 1
                elif resultado_status == "REPROVADO":
                    testes_reprovados += 1
                else:
                    testes_atencao += 1
            
            resultados_por_persona.append({
                "persona_id": persona_id,
                "persona_nome": persona_nome,
                "scores": scores,
                "aprovado": avaliacao.get("status_final", {}).get("aprovado", False),
                "erro": None
            })
        else:
            # Sem avaliação disponível
            resultados_por_persona.append({
                "persona_id": persona_id,
                "persona_nome": persona_nome,
                "scores": None,
                "aprovado": False,
                "erro": "Avaliação não disponível"
            })
    
    # FASE 3: Calcular análise geral
    logger.info("FASE 3: Gerando análise geral consolidada...")
    
    # Calcular médias
    if testes_com_score > 0:
        scores_medios = {
            key: round(val / testes_com_score) 
            for key, val in scores_soma.items()
        }
    else:
        scores_medios = {key: 0 for key in scores_soma}
    
    # Encontrar personas com melhor/pior desempenho
    personas_ordenadas = sorted(
        [r for r in resultados_por_persona if r.get("scores")],
        key=lambda x: x["scores"].get("score_geral", 0) if x.get("scores") else 0,
        reverse=True
    )
    
    melhores = [p["persona_nome"] for p in personas_ordenadas[:3]]
    piores = [p["persona_nome"] for p in personas_ordenadas[-3:]] if len(personas_ordenadas) >= 3 else []
    
    # Consolidar pontos recorrentes (aparecem mais de uma vez)
    pontos_fortes_counter = Counter(pontos_fortes_todos)
    pontos_fracos_counter = Counter(pontos_fracos_todos)
    recomendacoes_counter = Counter(recomendacoes_todas)
    
    pontos_fortes_recorrentes = [p for p, c in pontos_fortes_counter.most_common(5)]
    pontos_fracos_recorrentes = [p for p, c in pontos_fracos_counter.most_common(5)]
    recomendacoes_prioritarias = [r for r, c in recomendacoes_counter.most_common(5)]
    
    # Taxa de aprovação
    total_analisados = testes_aprovados + testes_reprovados + testes_atencao
    taxa_aprovacao = round((testes_aprovados / total_analisados * 100), 1) if total_analisados > 0 else 0
    
    # Gerar conclusão
    if taxa_aprovacao >= 80:
        conclusao = f"O agente teve excelente desempenho com taxa de aprovação de {taxa_aprovacao}%. Está pronto para produção com pequenos ajustes sugeridos."
    elif taxa_aprovacao >= 60:
        conclusao = f"O agente teve bom desempenho ({taxa_aprovacao}% aprovação) mas necessita melhorias nos pontos fracos identificados antes de ir para produção."
    elif taxa_aprovacao >= 40:
        conclusao = f"O agente teve desempenho abaixo do esperado ({taxa_aprovacao}% aprovação). Recomenda-se revisão significativa antes de produção."
    else:
        conclusao = f"O agente teve desempenho crítico ({taxa_aprovacao}% aprovação). Necessita reformulação antes de qualquer uso em produção."
    
    analise_geral = {
        "total_testes": len(testes_executados),
        "testes_aprovados": testes_aprovados,
        "testes_reprovados": testes_reprovados,
        "testes_atencao": testes_atencao,
        "taxa_aprovacao": taxa_aprovacao,
        "score_medio_geral": scores_medios.get("score_geral", 0),
        "scores_medios": scores_medios,
        "personas_com_melhor_desempenho": melhores,
        "personas_com_pior_desempenho": piores,
        "pontos_fortes_recorrentes": pontos_fortes_recorrentes,
        "pontos_fracos_recorrentes": pontos_fracos_recorrentes,
        "recomendacoes_prioritarias": recomendacoes_prioritarias,
        "conclusao": conclusao
    }
    
    # Finalizar sessão
    timestamp_fim = datetime.now().isoformat()
    duracao_total = (
        datetime.fromisoformat(timestamp_fim) - 
        datetime.fromisoformat(timestamp_inicio)
    ).total_seconds()
    
    resultado_consolidado = {
        "session_id": session_id,
        "timestamp_inicio": timestamp_inicio,
        "timestamp_fim": timestamp_fim,
        "duracao_total_segundos": round(duracao_total, 2),
        "num_personas": len(personas_selecionadas),
        "max_turnos_por_teste": max_turnos,
        "prompt_teste_usado": os.path.basename(prompt_teste_path),
        "resultados_por_persona": resultados_por_persona,
        "testes_detalhados": testes_executados,
        "analise_geral": analise_geral
    }
    
    logger.info(f"=== SESSÃO {session_id} CONCLUÍDA ===")
    logger.info(f"Total: {len(testes_executados)} testes, Aprovados: {testes_aprovados}, Taxa: {taxa_aprovacao}%")
    
    return resultado_consolidado
