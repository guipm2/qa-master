import os
from typing import Union
from agno.agent import Agent
from agno.models.anthropic import Claude
from models import EvaluationResult, DocumentEvaluationResult

CLAUDE_MODEL_ID = "claude-opus-4-6"


def _read_prompt(filename: str, fallback: str = "") -> str:
    """Lê um arquivo de prompt da pasta prompts/."""
    prompt_path = os.path.join(os.path.dirname(__file__), "prompts", filename)
    try:
        with open(prompt_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        print(f"AVISO: Não foi possível ler {prompt_path}: {e}")
        return fallback


def create_optimizer_agent() -> Agent:
    """
    Cria um agente Otimizador de Prompts usando Claude Opus 4.6.
    Suporta feedback tanto do Judge padrão quanto do Document Judge.
    """
    optimizer_instructions = _read_prompt(
        "prompt_optimizer_agent.md",
        "Você é um especialista em otimização de prompts. Gere uma versão melhorada do prompt corrigindo as falhas sem perder informações."
    )

    return Agent(
        model=Claude(id=CLAUDE_MODEL_ID),
        description="Você é um dos maiores especialistas do mundo em Engenharia de Prompts e Otimização Comportamental de IA.",
        instructions=[optimizer_instructions],
        markdown=False
    )


def create_verifier_agent() -> Agent:
    """
    Cria um agente Verificador de Integridade de Prompts usando Claude Opus 4.6.
    """
    verifier_instructions = _read_prompt(
        "prompt_verifier_agent.md",
        "Compare o prompt original com o gerado e garanta que nenhuma informação foi perdida. Retorne o prompt final corrigido."
    )

    return Agent(
        model=Claude(id=CLAUDE_MODEL_ID),
        description="Você é um Auditor Senior de Integridade de Prompts.",
        instructions=[verifier_instructions],
        markdown=False
    )


def verify_prompt_integrity(verifier: Agent, original_prompt: str, draft_prompt: str) -> str:
    user_msg = f"""
--- PROMPT ORIGINAL (REFERÊNCIA DE INTEGRIDADE) ---
{original_prompt}
--- FIM DO PROMPT ORIGINAL ---

--- PROMPT GERADO PELO OTIMIZADOR (A SER VERIFICADO) ---
{draft_prompt}
--- FIM DO PROMPT GERADO ---

Execute sua auditoria de integridade completa:
1. Decomponha o prompt original em todos os seus elementos constituintes
2. Verifique cada elemento no prompt gerado
3. Identifique qualquer perda, resumo, generalização ou diluição
4. Se encontrou perdas, restaure o conteúdo mantendo as melhorias do Otimizador
5. Se não encontrou perdas, retorne o prompt gerado exatamente como está

Retorne APENAS o prompt final verificado e completo.
"""
    response = verifier.run(user_msg)
    return response.content


def _format_standard_evaluation(evaluation_result: EvaluationResult) -> str:
    """Formata o feedback de uma avaliação padrão (Judge) para o Optimizer."""
    return f"""
--- RESULTADO DA AVALIAÇÃO PADRÃO (JUDGE) ---
TIPO DE AVALIAÇÃO: Avaliação de qualidade geral (sem documentos de referência)

Score Geral: {evaluation_result.scores.score_geral}/100
Scores por Dimensão:
  - Compliance: {evaluation_result.scores.compliance}
  - Eficácia: {evaluation_result.scores.eficacia}
  - Eficiência: {evaluation_result.scores.eficiencia}
  - Qualidade Comunicação: {evaluation_result.scores.qualidade_comunicacao}
  - Experiência Usuário: {evaluation_result.scores.experiencia_usuario}

COMPLIANCE:
  Violações Críticas: {evaluation_result.analise.compliance.violacoes_criticas}
  Violações Menores: {evaluation_result.analise.compliance.violacoes_menores}
  Comentário: {evaluation_result.analise.compliance.comentario}

EFICÁCIA:
  Objetivo Atingido: {evaluation_result.analise.eficacia.objetivo_atingido}
  Dados Coletados: {evaluation_result.analise.eficacia.dados_coletados}
  Dados Faltantes: {evaluation_result.analise.eficacia.dados_faltantes}
  Comentário: {evaluation_result.analise.eficacia.comentario}

EFICIÊNCIA:
  Repetições: {evaluation_result.analise.eficiencia.repeticoes}
  Comentário: {evaluation_result.analise.eficiencia.comentario}

QUALIDADE DE COMUNICAÇÃO:
  Tom: {evaluation_result.analise.qualidade_comunicacao.tom}
  Clareza: {evaluation_result.analise.qualidade_comunicacao.clareza}
  Naturalidade: {evaluation_result.analise.qualidade_comunicacao.naturalidade}
  Formatação: {evaluation_result.analise.qualidade_comunicacao.formatacao}
  Erros: {evaluation_result.analise.qualidade_comunicacao.erros}
  Problemas Formatação: {evaluation_result.analise.qualidade_comunicacao.problemas_formatacao}
  Comentário: {evaluation_result.analise.qualidade_comunicacao.comentario}

EXPERIÊNCIA DO USUÁRIO:
  Sentimento: {evaluation_result.analise.experiencia_usuario.sentimento_usuario}
  Momentos de Atrito: {evaluation_result.analise.experiencia_usuario.momentos_de_atrito}
  Momentos Positivos: {evaluation_result.analise.experiencia_usuario.momentos_positivos}
  Comentário: {evaluation_result.analise.experiencia_usuario.comentario}

RESUMO:
  Resultado: {evaluation_result.resumo.resultado}
  Pontos Fortes: {evaluation_result.resumo.pontos_fortes}
  Pontos Fracos: {evaluation_result.resumo.pontos_fracos}
  Recomendações: {evaluation_result.resumo.recomendacoes}
--- FIM DA AVALIAÇÃO PADRÃO ---
"""


def _format_document_evaluation(evaluation_result: DocumentEvaluationResult) -> str:
    """Formata o feedback de uma avaliação documental (Document Judge) para o Optimizer."""

    # Violações detalhadas
    violations_str = ""
    if hasattr(evaluation_result, 'analise') and hasattr(evaluation_result.analise, 'compliance_documental'):
        for v in evaluation_result.analise.compliance_documental.violacoes:
            violations_str += f"""
  [{v.severidade.upper()}] Regra: {v.regra}
    Documento diz: "{v.trecho_documento}"
    Agente fez: "{v.trecho_resposta}"
    Correção sugerida: {v.sugestao_correcao}
"""

    # Comportamentos ausentes
    missing_str = ""
    if hasattr(evaluation_result, 'analise') and hasattr(evaluation_result.analise, 'comportamentos_obrigatorios'):
        for b in evaluation_result.analise.comportamentos_obrigatorios.comportamentos_ausentes:
            missing_str += f"""
  [{b.impacto.upper()}] {b.comportamento}
    Documento exige: "{b.trecho_documento}"
    Correção sugerida: {b.sugestao_correcao}
"""

    return f"""
--- RESULTADO DA AVALIAÇÃO DOCUMENTAL (DOCUMENT JUDGE) ---
TIPO DE AVALIAÇÃO: Auditoria de aderência a documentos de referência (playbooks, regras, blueprints)
DOCUMENTOS UTILIZADOS: {', '.join(evaluation_result.documentos_utilizados)}

Score Geral de Aderência: {evaluation_result.scores.score_geral}/100
Scores por Dimensão:
  - Compliance Documental: {evaluation_result.scores.compliance_documental}
  - Tom e Estilo: {evaluation_result.scores.tom_e_estilo}
  - Aderência ao Escopo: {evaluation_result.scores.aderencia_escopo}
  - Violações de Regras: {evaluation_result.scores.violacoes_regras}
  - Comportamentos Obrigatórios: {evaluation_result.scores.comportamentos_obrigatorios}
  - Alinhamento com Padrões: {evaluation_result.scores.alinhamento_padroes}

COMPLIANCE DOCUMENTAL:
  Score: {evaluation_result.analise.compliance_documental.score}
  Total regras identificadas: {evaluation_result.analise.compliance_documental.total_regras_identificadas}
  Regras cumpridas: {evaluation_result.analise.compliance_documental.regras_cumpridas}
  Regras violadas: {evaluation_result.analise.compliance_documental.regras_violadas}
  Comentário: {evaluation_result.analise.compliance_documental.comentario}

VIOLAÇÕES DETALHADAS:
{violations_str if violations_str else "  Nenhuma violação encontrada."}

TOM E ESTILO:
  Score: {evaluation_result.analise.tom_e_estilo.score}
  Tom esperado: {evaluation_result.analise.tom_e_estilo.tom_esperado}
  Tom observado: {evaluation_result.analise.tom_e_estilo.tom_observado}
  Estilo esperado: {evaluation_result.analise.tom_e_estilo.estilo_esperado}
  Estilo observado: {evaluation_result.analise.tom_e_estilo.estilo_observado}
  Desvios: {evaluation_result.analise.tom_e_estilo.exemplos_desvio}
  Comentário: {evaluation_result.analise.tom_e_estilo.comentario}

ADERÊNCIA AO ESCOPO:
  Score: {evaluation_result.analise.aderencia_escopo.score}
  Escopo definido: {evaluation_result.analise.aderencia_escopo.escopo_definido}
  Desvios de escopo: {evaluation_result.analise.aderencia_escopo.desvios_escopo}
  Comportamentos proibidos detectados: {evaluation_result.analise.aderencia_escopo.comportamentos_proibidos_detectados}
  Comentário: {evaluation_result.analise.aderencia_escopo.comentario}

COMPORTAMENTOS OBRIGATÓRIOS:
  Score: {evaluation_result.analise.comportamentos_obrigatorios.score}
  Total obrigatórios: {evaluation_result.analise.comportamentos_obrigatorios.total_comportamentos_obrigatorios}
  Executados: {evaluation_result.analise.comportamentos_obrigatorios.comportamentos_executados}
  Comentário: {evaluation_result.analise.comportamentos_obrigatorios.comentario}

COMPORTAMENTOS AUSENTES DETALHADOS:
{missing_str if missing_str else "  Todos os comportamentos obrigatórios foram executados."}

ALINHAMENTO COM PADRÕES:
  Score: {evaluation_result.analise.alinhamento_padroes.score}
  Padrões seguidos: {evaluation_result.analise.alinhamento_padroes.padroes_seguidos}
  Padrões ignorados: {evaluation_result.analise.alinhamento_padroes.padroes_ignorados}
  Comentário: {evaluation_result.analise.alinhamento_padroes.comentario}

RESUMO:
  Resultado: {evaluation_result.resumo.resultado}
  Gaps Críticos: {evaluation_result.resumo.gaps_criticos}
  Pontos Fortes: {evaluation_result.resumo.pontos_fortes}
  Pontos Fracos: {evaluation_result.resumo.pontos_fracos}
  Recomendações para o Prompt: {evaluation_result.resumo.recomendacoes_prompt}
--- FIM DA AVALIAÇÃO DOCUMENTAL ---
"""


def generate_improved_prompt(
    optimizer_agent: Agent,
    current_prompt: str,
    evaluation_result: Union[EvaluationResult, DocumentEvaluationResult],
    best_prompt: str = None,
    documents_context: str = None,
) -> str:
    """
    Gera um prompt otimizado com base no feedback do Judge ou Document Judge.

    Args:
        optimizer_agent: O agente otimizador
        current_prompt: O prompt atual do agente testado
        evaluation_result: Resultado da avaliação (pode ser EvaluationResult ou DocumentEvaluationResult)
        best_prompt: Melhor prompt histórico (opcional)
        documents_context: Conteúdo dos documentos de referência (opcional, usado no fluxo documental)
    """
    # 1. Formatar feedback de acordo com o tipo de avaliação
    if isinstance(evaluation_result, DocumentEvaluationResult):
        feedback_str = _format_document_evaluation(evaluation_result)
    elif isinstance(evaluation_result, EvaluationResult):
        feedback_str = _format_standard_evaluation(evaluation_result)
    else:
        # Fallback para dict (quando vem do banco sem parse)
        feedback_str = f"""
--- RESULTADO DA AVALIAÇÃO ---
{evaluation_result}
--- FIM ---
"""

    # 2. Contexto dos documentos (se disponível)
    documents_str = ""
    if documents_context:
        documents_str = f"""
--- DOCUMENTOS DE REFERÊNCIA (O AGENTE DEVE ADERIR A ESTES DOCUMENTOS) ---
IMPORTANTE: O prompt otimizado deve garantir que o agente siga TODAS as regras,
tom, estilo e comportamentos definidos nestes documentos.

{documents_context}
--- FIM DOS DOCUMENTOS DE REFERÊNCIA ---
"""

    # 3. Melhor prompt histórico
    comparative_str = ""
    if best_prompt and best_prompt != current_prompt:
        comparative_str = f"""
--- MELHOR PROMPT HISTÓRICO (REFERÊNCIA DE QUALIDADE) ---
Este prompt teve o melhor score até agora. Use como referência.
Se o prompt atual perdeu informações que este tinha, RECUPERE-as.

[INÍCIO DO MELHOR PROMPT HISTÓRICO]
{best_prompt}
[FIM DO MELHOR PROMPT HISTÓRICO]
--- FIM DO CONTEXTO HISTÓRICO ---
"""

    # 4. Montar mensagem completa para o Optimizer
    user_message = f"""
--- PROMPT ATUAL DO AGENTE (QUE PRECISA SER OTIMIZADO) ---
{current_prompt}
--- FIM DO PROMPT ATUAL ---

{feedback_str}

{documents_str}

{comparative_str}

Execute seu processo de otimização completo:
1. Analise CADA falha identificada na avaliação
2. Diagnostique a causa raiz de cada falha (instrução ausente? ambígua? conflitante?)
3. Se há documentos de referência, garanta que o novo prompt incorpore TODAS as regras dos documentos
4. Planeje as correções necessárias
5. Gere o prompt otimizado COMPLETO

LEMBRETE CRÍTICO: O novo prompt deve ser do MESMO TAMANHO ou MAIOR que o original.
Preserve TUDO que funciona. Corrija APENAS o que falhou. ADICIONE regras dos documentos que estão faltando.

Gere o NOVO PROMPT OTIMIZADO COMPLETO:
"""

    draft_response = optimizer_agent.run(user_message)
    draft_prompt = draft_response.content

    # 5. Verifica integridade (Auto-correção pelo Verifier)
    verifier = create_verifier_agent()
    final_prompt = verify_prompt_integrity(verifier, current_prompt, draft_prompt)

    return final_prompt
