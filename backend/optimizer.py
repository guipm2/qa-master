from agno.agent import Agent
from agno.models.openai import OpenAIChat
from models import EvaluationResult

def create_optimizer_agent(current_prompt: str, evaluation_result: EvaluationResult, best_prompt: str = None) -> Agent:
    """
    Cria um agente projetado para otimizar o prompt do agente de teste com base no feedback.
    """
    
    system_prompt = f"""
    Você é um Especialista Sênior em Engenharia de Prompt e Otimização de Comportamento de IA.
    
    SEU OBJETIVO:
    Analisar o feedback de um teste de QA (Avaliação do Juiz), o prompt atual e o MELHOR PROMPT histórico.
    Você deve gerar uma VERSÃO MELHORADA do prompt para corrigir as falhas, SEM PERDER as qualidades anteriores.
    
    ⚠️ REGRAS CRÍTICAS DE PRESERVAÇÃO (IMPORTANTE):
    1. JAMAIS REMOVA INSTRUÇÕES ou SEÇÕES do prompt original que não estejam relacionadas ao erro.
    2. JAMAIS ENCURTE ou RESUMA o prompt. O novo prompt deve ser SEMPRE do mesmo tamanho ou MAIOR.
    3. MANTENHA A ESTRUTURA, o tom e a persona originais INTEGRALMENTE.
    4. Apenas ADICIONE ou AJUSTE regras específicas para corrigir as violações apontadas.
    5. Se o prompt anterior (melhor histórico) era melhor em algum aspecto, recupere aquela parte.

    ENTRADAS:
    1. PROMPT ATUAL: O prompt usado no último teste.
    2. MELHOR PROMPT HISTÓRICO: O prompt que teve o maior score até agora.
    3. RESULTADO DA AVALIAÇÃO: Scores, violações e recomendações do último teste.
    
    DIRETRIZES DE OTIMIZAÇÃO:
    - Foco TOTAL nas VIOLAÇÕES CRÍTICAS e PONTOS FRACOS.
    - Se o agente revelou ser IA: Adicione regra explícita "NEGAR ser IA, dizer que é [Nome] da equipe".
    - Se falhou em coletar dados: Reforce a instrução de coleta como passo obrigatório.
    - Se perdeu informações do prompt original: RECUPERE do melhor prompt histórico.
    - Se houver problema de formatação (WhatsApp): Adicione regra "NUNCA usar markdown (negrito/itálico). Usar mensagens curtas pro-ativas."
    - Use "Chain of Thought" para planejar a correção antes de gerar o prompt final.
    
    SAÍDA ESPERADA:
    Apenas o TEXTO COMPLETO DO NOVO PROMPT. 
    NÃO inclua explicações, markdown de código (```) ou comentários.
    O prompt deve estar pronto para ser usado.
    """

    return Agent(
        model=OpenAIChat(id="gpt-4.1"),
        description="Você é o Otimizador de Prompts.",
        instructions=[system_prompt],
        markdown=False 
    )

def create_verifier_agent() -> Agent:
    """
    Cria um agente verificador que garante que o prompt otimizado não perdeu informações do original.
    """
    system_prompt = f"""
    Você é o Auditor de Integridade de Prompts.
    
    SEU OBJETIVO:
    Comparar o PROMPT ORIGINAL com o PROMPT GERADO (Otimizado) e garantir que NENHUMA informação foi perdida.
    
    SUA TAREFA:
    1. Identifique todas as seções, regras e instruções do PROMPT ORIGINAL.
    2. Verifique se todas elas estão presentes no PROMPT GERADO.
    3. Se algo foi removido ou resumido indevidamente, RESTAURE o conteúdo original mantendo as correções do otimizador.
    4. Se o PROMPT GERADO estiver perfeito e não perdeu nada, mantenha-o.
    
    SAÍDA ESPERADA:
    Retorne APENAS o texto final do prompt corrigido/validado. NADA MAIS.
    """
    
    return Agent(
        model=OpenAIChat(id="gpt-4.1"),
        description="Você é o Auditor de Prompts.",
        instructions=[system_prompt],
        markdown=False
    )

def verify_prompt_integrity(verifier: Agent, original_prompt: str, draft_prompt: str) -> str:
    user_msg = f"""
    --- PROMPT ORIGINAL ---
    {original_prompt}
    -----------------------
    
    --- PROMPT GERADO PELO OTIMIZADOR ---
    {draft_prompt}
    -------------------------------------
    
    Verifique se o Prompt Gerado "esqueceu" ou resumiu partes importantes do Original.
    Se sim, REESCREVA o prompt completo restaurando o que falta, mas mantendo as melhorias feitas.
    Se não, retorne o Prompt Gerado exatamente como está.
    
    Retorne APENAS o prompt final.
    """
    response = verifier.run(user_msg)
    return response.content

def generate_improved_prompt(optimizer_agent: Agent, current_prompt: str, evaluation_result: EvaluationResult, best_prompt: str = None) -> str:
    # 1. Gera o rascunho da otimização
    feedback_str = f"""
    --- RESULTADO DA AVALIAÇÃO DO ÚLTIMO TESTE ---
    Score Geral: {evaluation_result.scores.score_geral}
    Violações Críticas de Compliance: {evaluation_result.analise.compliance.violacoes_criticas}
    Pontos Fracos: {evaluation_result.resumo.pontos_fracos}
    Recomendações: {evaluation_result.resumo.recomendacoes}
    ------------------------------
    """
    
    comparative_str = ""
    if best_prompt and best_prompt != current_prompt:
        comparative_str = f"""
        --- IMPORTANTE: CONTEXTO HISTÓRICO ---
        Existe um prompt anterior que teve melhor performance (MELHOR HISTÓRICO).
        Use-o como referência de qualidade se o prompt atual tiver perdido informações importantes.
        
        [INÍCIO DO MELHOR PROMPT HISTÓRICO]
        {best_prompt}
        [FIM DO MELHOR PROMPT HISTÓRICO]
        --------------------------------------
        """

    user_message = f"""
    --- PROMPT ATUAL (Que precisa ser melhorado) ---
    {current_prompt}
    --------------------
    
    {feedback_str}

    {comparative_str}
    
    ATENÇÃO: Respeite rigorosamente as Regras de Preservação.
    Não remova nada. Apenas corrija o que falhou.
    
    Gere o NOVO PROMPT OTIMIZADO COMPLETO:
    """
    
    draft_response = optimizer_agent.run(user_message)
    draft_prompt = draft_response.content
    
    # 2. Verifica integridade (Auto-correção)
    verifier = create_verifier_agent()
    final_prompt = verify_prompt_integrity(verifier, current_prompt, draft_prompt)
    
    return final_prompt
