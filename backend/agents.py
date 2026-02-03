from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.db.postgres import PostgresDb
import os
from dotenv import load_dotenv

load_dotenv()
from models import TestConfig, EvaluationResult

# Inicialização Singleton do Banco de Dados para evitar conflitos de Metadata
# Isso garante que a tabela 'agent_memories' seja definida apenas uma vez
agent_storage = None

# Construção segura da URL do banco a partir das variáveis individuais
db_user = os.getenv("DB_USER")
db_password = os.getenv("DB_PASSWORD")
db_host = os.getenv("DB_HOST")
db_port = os.getenv("DB_PORT", "5432")
db_name = os.getenv("DB_NAME", "postgres")

if db_user and db_password and db_host:
    from urllib.parse import quote_plus
    encoded_password = quote_plus(db_password)
    db_url = f"postgresql://{db_user}:{encoded_password}@{db_host}:{db_port}/{db_name}"
    
    agent_storage = PostgresDb(
        db_url=db_url,
        memory_table="agent_memories",
    )

# Modelos disponíveis da OpenAI
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

def create_subject_agent(config: TestConfig, model_id: str = "gpt-4.1") -> Agent:
    """
    Cria o agente que está sendo testado (O Sujeito).
    Aceita o model_id para selecionar qual modelo OpenAI usar.
    """
    return Agent(
        model=OpenAIChat(id=model_id),
        description="Você é o Assistente de IA sendo testado.",
        instructions=[config.subject_instruction],
        markdown=True,
        db=agent_storage,
        update_memory_on_run=True,
    )

def create_evaluator_agent(config: TestConfig) -> Agent:
    """
    Cria o agente que conduz o teste (O Avaliador).
    Usa gpt-4.1 como padrão.
    """
    return Agent(
        model=OpenAIChat(id="gpt-4.1"),
        description="Você é o Testador QA avaliando outro agente de IA.",
        instructions=[
            config.evaluator_instruction, 
            "Seu objetivo é testar o outro agente de acordo com suas instruções.",
            "Interaja sequencialmente. Não gere o relatório final até que a conversa termine."
        ],
        markdown=True,
        db=agent_storage,
        update_memory_on_run=True,
    )

def create_judge_agent(config: TestConfig) -> Agent:
    """
    Um agente especializado de curta duração que analisa a transcrição e produz o relatório final.
    Usa o modelo padrão do Agno (OpenAIChat gpt-4o).
    """
    # Define o caminho para o arquivo de prompt
    prompt_path = os.path.join(os.path.dirname(__file__), "prompts", "prompt_judge_agent.md")
    
    # Lê o conteúdo do arquivo
    try:
        with open(prompt_path, "r", encoding="utf-8") as f:
            judge_instructions = f.read()
    except Exception as e:
        # Fallback caso o arquivo não seja encontrado
        print(f"AVISO: Não foi possível ler o prompt do juiz em {prompt_path}: {e}")
        judge_instructions = (
            "Analise a conversa a seguir entre um Testador QA e um Agente Sujeito. "
            "Com base nos objetivos, avalie o desempenho do Agente Sujeito. "
            "Retorne o resultado no formato JSON especificado. O campo 'reasoning' e 'suggestions' DEVEM estar em Português do Brasil."
        )

    return Agent(
        model=OpenAIChat(id="gpt-4.1"),
        description="Você é o Juiz Final.",
        instructions=[judge_instructions],
        output_schema=EvaluationResult,
        markdown=False
    )
