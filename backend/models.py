from pydantic import BaseModel, Field
from typing import List, Optional, Literal

class TestConfig(BaseModel):
    subject_instruction: str = Field(..., description="Prompt de sistema do agente a ser testado")
    evaluator_instruction: str = Field(..., description="Prompt de sistema do agente avaliador")
    openai_api_key: str = Field(..., description="Chave da API OpenAI para ambos os agentes")
    max_turns: int = Field(5, description="Número máximo de turnos de conversa")

class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system", "evaluator", "subject"]
    content: str

# --- Modelos de Avaliação (prompt_judge_agent.md) ---

class Scores(BaseModel):
    compliance: int = Field(..., description="0-100")
    eficacia: int = Field(..., description="0-100")
    eficiencia: int = Field(..., description="0-100")
    qualidade_comunicacao: int = Field(..., description="0-100")
    experiencia_usuario: int = Field(..., description="0-100")
    score_geral: int = Field(..., description="Média dos 5 scores")

class ComplianceAnalysis(BaseModel):
    score: int
    violacoes_criticas: List[str] = Field(default_factory=list)
    violacoes_menores: List[str] = Field(default_factory=list)
    comentario: str

class EfficacyAnalysis(BaseModel):
    score: int
    objetivo_atingido: bool
    dados_coletados: List[str] = Field(default_factory=list)
    dados_faltantes: List[str] = Field(default_factory=list)
    comentario: str

class EfficiencyAnalysis(BaseModel):
    score: int
    total_turnos: Optional[int] = None
    repeticoes: List[str] = Field(default_factory=list)
    tempo_estimado: Optional[str] = None
    comentario: str

class QualityAnalysis(BaseModel):
    score: int
    tom: str = Field(..., description="apropriado/inapropriado")
    clareza: str = Field(..., description="alta/média/baixa")
    naturalidade: str = Field(..., description="natural/mecânica/robótica")
    formatacao: str = Field(..., description="adequada/inadequada (estilo WhatsApp)")
    erros: List[str] = Field(default_factory=list)
    problemas_formatacao: List[str] = Field(default_factory=list, description="Ex: usou negrito, texto longo, lista numeral")
    comentario: str

class UXAnalysis(BaseModel):
    score: int
    sentimento_usuario: str = Field(..., description="positivo/neutro/negativo")
    momentos_de_atrito: List[str] = Field(default_factory=list)
    momentos_positivos: List[str] = Field(default_factory=list)
    comentario: str

class FullAnalysis(BaseModel):
    compliance: ComplianceAnalysis
    eficacia: EfficacyAnalysis
    eficiencia: EfficiencyAnalysis
    qualidade_comunicacao: QualityAnalysis
    experiencia_usuario: UXAnalysis

class Summary(BaseModel):
    resultado: Literal["APROVADO", "REPROVADO", "ATENÇÃO"]
    pontos_fortes: List[str]
    pontos_fracos: List[str]
    recomendacoes: List[str]

class FinalStatus(BaseModel):
    aprovado: bool
    criterio_reprovacao: Optional[str] = None
    pronto_para_producao: bool

class EvaluationResult(BaseModel):
    test_id: Optional[str] = "N/A"
    test_scenario: Optional[str] = "Geral"
    scores: Scores
    analise: FullAnalysis
    resumo: Summary
    status_final: FinalStatus

class TestSessionResponse(BaseModel):
    transcript: List[ChatMessage]
    result: Optional[EvaluationResult]
    status: Literal["running", "completed", "failed"]
    error: Optional[str] = None

# --- Modelos para Sistema de Testes com Personas ---

class PersonaTestResult(BaseModel):
    """Resultado de um teste individual com uma persona"""
    test_id: str
    persona_id: str
    persona_nome: str
    prompt_teste: str
    timestamp_inicio: str
    timestamp_fim: str
    duracao_segundos: float
    total_turnos: int
    finalizado_naturalmente: bool
    conversa: List[dict]
    dados_cliente_usados: dict
    # Avaliação do juiz para este teste específico
    avaliacao: Optional[EvaluationResult] = None

class PersonaScoreSummary(BaseModel):
    """Resumo de scores de uma persona"""
    persona_id: str
    persona_nome: str
    scores: Optional[Scores] = None
    aprovado: bool = False
    erro: Optional[str] = None

class GeneralAnalysis(BaseModel):
    """Análise geral consolidando todos os testes com todas as personas"""
    total_testes: int
    testes_aprovados: int
    testes_reprovados: int
    testes_atencao: int
    taxa_aprovacao: float
    score_medio_geral: float
    scores_medios: Scores
    personas_com_melhor_desempenho: List[str]
    personas_com_pior_desempenho: List[str]
    pontos_fortes_recorrentes: List[str]
    pontos_fracos_recorrentes: List[str]
    recomendacoes_prioritarias: List[str]
    conclusao: str

class ConsolidatedTestResult(BaseModel):
    """Resultado consolidado de todos os testes com todas as personas"""
    session_id: str
    timestamp_inicio: str
    timestamp_fim: str
    duracao_total_segundos: float
    num_personas: int
    max_turnos_por_teste: int
    prompt_teste_usado: str
    # Resultados individuais por persona
    resultados_por_persona: List[PersonaScoreSummary]
    # Detalhes completos de cada teste
    testes_detalhados: List[PersonaTestResult]
    # Análise geral consolidada
    analise_geral: GeneralAnalysis


# --- Modelos para Document-based Testing ---

class RuleViolation(BaseModel):
    """Uma violação específica de regra encontrada nos documentos"""
    regra: str = Field(..., description="A regra do documento que foi violada")
    severidade: Literal["critica", "media", "baixa"] = Field(..., description="Severidade da violação")
    trecho_documento: str = Field(..., description="Trecho do documento que define a regra")
    trecho_resposta: str = Field(..., description="Trecho da resposta do agente que viola a regra")
    sugestao_correcao: str = Field(..., description="Sugestão de como corrigir no prompt")

class MissingBehavior(BaseModel):
    """Comportamento obrigatório que não foi executado pelo agente"""
    comportamento: str = Field(..., description="O comportamento esperado")
    trecho_documento: str = Field(..., description="Trecho do documento que exige esse comportamento")
    impacto: Literal["alto", "medio", "baixo"] = Field(..., description="Impacto da ausência")
    sugestao_correcao: str = Field(..., description="Sugestão de como adicionar ao prompt")

class DocumentComplianceAnalysis(BaseModel):
    """Análise de aderência geral aos documentos"""
    score: int = Field(..., description="0-100 - Aderência geral às regras/diretrizes")
    total_regras_identificadas: int
    regras_cumpridas: int
    regras_violadas: int
    violacoes: List[RuleViolation] = Field(default_factory=list)
    comentario: str

class ToneStyleAnalysis(BaseModel):
    """Análise de tom e estilo"""
    score: int = Field(..., description="0-100 - Match de tom e estilo com os documentos")
    tom_esperado: str = Field(..., description="Tom definido nos documentos")
    tom_observado: str = Field(..., description="Tom observado nas respostas do agente")
    estilo_esperado: str = Field(..., description="Estilo de comunicação esperado")
    estilo_observado: str = Field(..., description="Estilo de comunicação observado")
    exemplos_desvio: List[str] = Field(default_factory=list)
    comentario: str

class ScopeAdherenceAnalysis(BaseModel):
    """Análise de aderência ao escopo"""
    score: int = Field(..., description="0-100 - Agente ficou dentro do escopo definido")
    escopo_definido: str = Field(..., description="Resumo do escopo nos documentos")
    desvios_escopo: List[str] = Field(default_factory=list, description="Momentos onde o agente saiu do escopo")
    comportamentos_proibidos_detectados: List[str] = Field(default_factory=list)
    comentario: str

class PatternAlignmentAnalysis(BaseModel):
    """Análise de alinhamento com padrões/exemplos dos documentos"""
    score: int = Field(..., description="0-100 - Alinhamento com exemplos/padrões")
    padroes_identificados: List[str] = Field(default_factory=list, description="Padrões encontrados nos documentos")
    padroes_seguidos: List[str] = Field(default_factory=list)
    padroes_ignorados: List[str] = Field(default_factory=list)
    comentario: str

class MissingBehaviorsAnalysis(BaseModel):
    """Análise de comportamentos obrigatórios ausentes"""
    score: int = Field(..., description="0-100 - Cobertura de comportamentos obrigatórios")
    total_comportamentos_obrigatorios: int
    comportamentos_executados: int
    comportamentos_ausentes: List[MissingBehavior] = Field(default_factory=list)
    comentario: str

class DocumentScores(BaseModel):
    """Scores das métricas baseadas em documentos"""
    compliance_documental: int = Field(..., description="0-100 - Aderência às regras dos documentos")
    tom_e_estilo: int = Field(..., description="0-100 - Match de tom e estilo")
    aderencia_escopo: int = Field(..., description="0-100 - Agente dentro do escopo")
    violacoes_regras: int = Field(..., description="0-100 - Inverso: mais violações = menor score")
    comportamentos_obrigatorios: int = Field(..., description="0-100 - Cobertura de comportamentos obrigatórios")
    alinhamento_padroes: int = Field(..., description="0-100 - Alinhamento com exemplos/padrões")
    score_geral: int = Field(..., description="Média ponderada dos scores")

class DocumentFullAnalysis(BaseModel):
    """Análise completa baseada em documentos"""
    compliance_documental: DocumentComplianceAnalysis
    tom_e_estilo: ToneStyleAnalysis
    aderencia_escopo: ScopeAdherenceAnalysis
    comportamentos_obrigatorios: MissingBehaviorsAnalysis
    alinhamento_padroes: PatternAlignmentAnalysis

class DocumentSummary(BaseModel):
    """Resumo da avaliação baseada em documentos"""
    resultado: Literal["CONFORME", "PARCIALMENTE CONFORME", "NAO CONFORME"]
    gaps_criticos: List[str] = Field(default_factory=list, description="Gaps mais graves entre expectativa e realidade")
    pontos_fortes: List[str] = Field(default_factory=list)
    pontos_fracos: List[str] = Field(default_factory=list)
    recomendacoes_prompt: List[str] = Field(default_factory=list, description="Recomendações específicas para melhorar o prompt")

class DocumentEvaluationResult(BaseModel):
    """Resultado completo da avaliação baseada em documentos"""
    scores: DocumentScores
    analise: DocumentFullAnalysis
    resumo: DocumentSummary
    documentos_utilizados: List[str] = Field(default_factory=list, description="Nomes dos documentos usados")
