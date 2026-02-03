from agno.agent import Agent
from models import EvaluationResult

def create_optimizer_agent(current_prompt: str, evaluation_result: EvaluationResult) -> Agent:
    """
    Cria um agente projetado para otimizar o prompt do agente de teste com base no feedback.
    """
    
    system_prompt = f"""
    Você é um Especialista em Engenharia de Prompt e Otimização de Comportamento de IA.
    
    SEU OBJETIVO:
    Analisar o feedback de um teste de QA (Avaliação do Juiz) e o prompt atual de um agente, 
    e gerar uma VERSÃO MELHORADA do prompt para corrigir as falhas apontadas.
    
    ENTRADAS:
    1. PROMPT ATUAL: O prompt de sistema que foi usado no teste.
    2. RESULTADO DA AVALIAÇÃO: O JSON contendo scores, violações e recomendações.
    
    DIRETRIZES DE OTIMIZAÇÃO:
    - Foco nas VIOLAÇÕES CRÍTICAS e PONTOS FRACOS apontados pelo Juiz.
    - NÃO reescreva o prompt inteiro se não for necessário. Faça cirurgias precisas.
    - Se o agente revelou ser IA indevidamente, adicione regras de persona estritas.
    - Se falhou em coletar dados, reforce as instruções de coleta.
    - Mantenha o tom e a persona originais, apenas corrija o comportamento falho.
    
    SAÍDA ESPERADA:
    Apenas o TEXTO DO NOVO PROMPT. Nada mais. Sem "Aqui está o novo prompt". Apenas o prompt cru.
    """

    return Agent(
        description="Você é o Otimizador de Prompts.",
        instructions=[system_prompt],
        markdown=False 
    )

def generate_improved_prompt(optimizer_agent: Agent, current_prompt: str, evaluation_result: EvaluationResult) -> str:
    # Converte EvaluationResult para um resumo legível para o LLM
    feedback_str = f"""
    --- RESULTADO DA AVALIAÇÃO ---
    Score Geral: {evaluation_result.scores.score_geral}
    Aprovado: {evaluation_result.status_final.aprovado}
    
    Violações Críticas de Compliance: {evaluation_result.analise.compliance.violacoes_criticas}
    Pontos Fracos: {evaluation_result.resumo.pontos_fracos}
    Recomendações: {evaluation_result.resumo.recomendacoes}
    
    Análise de Eficácia: {evaluation_result.analise.eficacia.comentario}
    Dados Faltantes: {evaluation_result.analise.eficacia.dados_faltantes}
    ------------------------------
    """
    
    user_message = f"""
    --- PROMPT ATUAL ---
    {current_prompt}
    --------------------
    
    {feedback_str}
    
    Com base nisso, gere o NOVO PROMPT OTIMIZADO:
    """
    
    response = optimizer_agent.run(user_message)
    return response.content
