from agno.agent import Agent
import os
from models import TestConfig, EvaluationResult

def create_subject_agent(config: TestConfig) -> Agent:
    """
    Cria o agente que está sendo testado (O Sujeito).
    Usa o modelo padrão do Agno (OpenAIChat gpt-4o).
    """
    return Agent(
        # Agno usa OpenAIChat(id="gpt-4o") como padrão quando nenhum modelo é fornecido
        description="Você é o Assistente de IA sendo testado.",
        instructions=[config.subject_instruction],
        markdown=True
    )

def create_evaluator_agent(config: TestConfig) -> Agent:
    """
    Cria o agente que conduz o teste (O Avaliador).
    Usa o modelo padrão do Agno (OpenAIChat gpt-4o).
    """
    return Agent(
        # Agno usa OpenAIChat(id="gpt-4o") como padrão quando nenhum modelo é fornecido
        description="Você é o Testador QA avaliando outro agente de IA.",
        instructions=[
            config.evaluator_instruction, 
            "Seu objetivo é testar o outro agente de acordo com suas instruções.",
            "Interaja sequencialmente. Não gere o relatório final até que a conversa termine."
        ],
        markdown=True
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
        # Agno usa OpenAIChat(id="gpt-4o") como padrão quando nenhum modelo é fornecido
        description="Você é o Juiz Final.",
        instructions=[judge_instructions],
        output_schema=EvaluationResult,
        markdown=False
    )
