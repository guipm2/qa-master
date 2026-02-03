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
