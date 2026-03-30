from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.models.anthropic import Claude
from dotenv import load_dotenv

load_dotenv()
from models import TestConfig, EvaluationResult, DocumentEvaluationResult
from utils import read_prompt

# Modelo Claude usado para todos os agentes auxiliares (avaliador, juiz, otimizador)
CLAUDE_MODEL_ID = "claude-opus-4-6"

# Modelos disponíveis da OpenAI (para o agente testado)
AVAILABLE_MODELS = [
    # GPT-5 família (mais recentes)
    "gpt-5.2",
    "gpt-5.1",
    "gpt-5",
    # GPT-4 família
    "gpt-4.1",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4",
    # GPT-3.5 família
    "gpt-3.5-turbo",
    # Modelos O-série (raciocínio)
    "o1",
    "o1-mini",
    "o1-preview",
    "o3-mini"
]

# Default model para o agente testado
DEFAULT_SUBJECT_MODEL = "gpt-5.2"


def _get_claude_model() -> Claude:
    """Retorna instância do Claude Opus 4.6 para agentes auxiliares."""
    return Claude(id=CLAUDE_MODEL_ID)


def create_subject_agent(config: TestConfig, model_id: str = DEFAULT_SUBJECT_MODEL) -> Agent:
    """
    Cria o agente que está sendo testado (O Sujeito).
    ÚNICO agente que usa OpenAI. Default: gpt-5.2.
    """
    return Agent(
        model=OpenAIChat(id=model_id, api_key=config.openai_api_key),
        description="Você é o Assistente de IA sendo testado.",
        instructions=[config.subject_instruction],
        markdown=True,
    )


def create_evaluator_agent(config: TestConfig) -> Agent:
    """
    Cria o agente que conduz o teste (O Avaliador).
    Usa Claude Opus 4.6 com prompt especializado de QA.
    """
    evaluator_prompt = read_prompt("prompt_evaluator_agent.md")

    return Agent(
        model=_get_claude_model(),
        description="Você é um Especialista Senior em QA de Agentes Conversacionais.",
        instructions=[
            evaluator_prompt,
            config.evaluator_instruction,
        ],
        markdown=False,
    )


def create_judge_agent(config: TestConfig) -> Agent:
    """
    Agente juiz que analisa a transcrição e produz o relatório final.
    Usa Claude Opus 4.6 com prompt especializado de avaliação.
    """
    judge_instructions = read_prompt(
        "prompt_judge_agent.md",
        "Analise a conversa e avalie o desempenho do Agente Sujeito. Retorne JSON em Português do Brasil."
    )

    return Agent(
        model=_get_claude_model(),
        description="Você é um Avaliador Senior de Qualidade de Agentes Conversacionais.",
        instructions=[judge_instructions],
        output_schema=EvaluationResult,
        markdown=False
    )


def create_document_judge_agent() -> Agent:
    """
    Agente juiz especializado em avaliar aderência a documentos de referência.
    Usa Claude Opus 4.6 com prompt especializado de auditoria documental.
    """
    judge_instructions = read_prompt(
        "prompt_document_judge.md",
        "Analise a conversa comparando com os documentos de referência. Retorne JSON em Português do Brasil."
    )

    return Agent(
        model=_get_claude_model(),
        description="Você é um Auditor Senior de Conformidade de Agentes de IA.",
        instructions=[judge_instructions],
        output_schema=DocumentEvaluationResult,
        markdown=False
    )
