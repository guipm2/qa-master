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

# --- Evaluation Models (Matching prompt_judge_agent.md) ---

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
    erros: List[str] = Field(default_factory=list)
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
