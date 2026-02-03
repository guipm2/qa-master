# PROMPT PARA CLAUDE CODE - IMPLEMENTAÇÃO DO SISTEMA DE PERSONAS

## CONTEXTO DO PROJETO

Tenho um sistema de testes automatizados para agentes conversacionais (AI agents) usando Python + FastAPI + Agno (framework com OpenAI).

**Sistema atual:**
- Backend em Python com FastAPI
- Agno para gerenciar agentes (usando OpenAI API)
- 3 agentes: Testador (simula cliente) → Sofia (agente testado) → Analisador (avalia conversa)

**O que preciso implementar:**
Um sistema modular de personas + prompts de teste que permite criar testes automatizados reutilizáveis.

---

## ARQUITETURA DO NOVO SISTEMA

### Componentes:

1. **personas_genericas_puras.json** - 20 personas com comportamentos humanos universais
2. **Prompts de teste** - Arquivos .md com instruções específicas de cada teste
3. **PersonaInjector** - Classe que combina persona + prompt de teste
4. **Sistema de execução** - Roda testes automatizados com múltiplas personas

### Fluxo:
```
Persona (JSON) + Prompt de Teste (.md) → PersonaInjector → Prompt Final → Agente Testador
```

---

## ESPECIFICAÇÃO TÉCNICA

### 1. ARQUIVO personas_genericas_puras.json

Estrutura:
```json
{
  "metadata": {
    "version": "2.0",
    "description": "Personas genéricas reutilizáveis",
    "total_personas": 20
  },
  "personas": [
    {
      "id": "PERSONA_001",
      "nome": "O Desconfiado",
      "personalidade": "desconfiado",
      "nivel_stress": "alto",
      "comportamentos": [
        "Questiona tudo constantemente",
        "Pede provas e garantias múltiplas vezes"
      ],
      "tom_comunicacao": "casual_brasileiro_desconfiado",
      "padroes_linguagem": [
        "vocês são sérios?",
        "como sei que não é golpe?"
      ],
      "triggers_comportamento": {
        "inicio": "muito_desconfiado",
        "apos_3_interacoes": "ligeiramente_mais_confiante"
      }
    }
    // ... 19 personas mais
  ]
}
```

**Nota:** O arquivo completo com as 20 personas está em anexo.

---

### 2. CLASSE PersonaInjector

Implementar classe que:

**Responsabilidades:**
- Carregar personas do JSON
- Ler prompt de teste de arquivo .md
- Combinar persona + prompt em um único prompt final
- Gerar dados aleatórios opcionais (nome, telefone)

**Assinatura:**
```python
class PersonaInjector:
    def __init__(self, personas_path: str = "personas_genericas_puras.json"):
        """Carrega arquivo de personas"""
        
    def criar_prompt_testador(
        self,
        seu_prompt: str,
        persona_id: str,
        dados_opcionais: dict = None
    ) -> str:
        """
        Combina persona + prompt de teste.
        
        Args:
            seu_prompt: Conteúdo do arquivo .md de teste
            persona_id: ID da persona (ex: "PERSONA_010")
            dados_opcionais: Dados extras como nome, telefone (opcional)
        
        Returns:
            Prompt final formatado para o agente testador
        """
```

**Formato do prompt final gerado:**
```markdown
# SUA PERSONA: [nome da persona]

**Personalidade:** [personalidade]
**Nível de Stress:** [nivel_stress]
**Tom de Comunicação:** [tom_comunicacao]

## Como você se comporta:
- [comportamento 1]
- [comportamento 2]
...

## Padrões típicos de linguagem:
- "[padrão 1]"
- "[padrão 2]"
...

## Comportamentos ao longo da conversa:
- **[trigger1]:** [comportamento]
...

---

[CONTEÚDO DO PROMPT DE TESTE AQUI]

---

## SEUS DADOS PARA ESTE TESTE

- **Nome:** [nome]
- **Telefone:** [telefone]
[... outros dados opcionais]

---

## INSTRUÇÕES FINAIS

Você deve:
1. Usar a PERSONA "[nome]" durante toda a conversa
2. Seguir as instruções do PROMPT DE TESTE acima
3. Ser natural - combine a persona com as instruções

**COMECE AGORA!**
```

---

### 3. SISTEMA DE EXECUÇÃO DE TESTES

Implementar funções para executar testes automatizados:

```python
def executar_teste_com_persona(
    prompt_teste_path: str,
    persona_id: str,
    agente_alvo: Agent,
    max_turnos: int = 20
) -> dict:
    """
    Executa 1 teste completo.
    
    Args:
        prompt_teste_path: Caminho para arquivo .md do teste
        persona_id: ID da persona a usar
        agente_alvo: Agente sendo testado (ex: Sofia)
        max_turnos: Máximo de turnos de conversa
    
    Returns:
        {
            "persona_id": str,
            "test_id": str,
            "conversa": list,
            "total_turnos": int,
            "finalizado": bool
        }
    """

def executar_bateria_testes(
    prompt_teste_path: str,
    persona_ids: list[str],
    agente_alvo: Agent
) -> list[dict]:
    """
    Executa mesmo teste com múltiplas personas.
    
    Args:
        prompt_teste_path: Caminho para arquivo .md do teste
        persona_ids: Lista de IDs de personas
        agente_alvo: Agente sendo testado
    
    Returns:
        Lista de resultados (um por persona)
    """

def executar_matriz_testes(
    prompts_teste_paths: list[str],
    persona_ids: list[str],
    agente_alvo: Agent
) -> list[dict]:
    """
    Executa múltiplos testes com múltiplas personas.
    Matriz: N testes x M personas
    
    Args:
        prompts_teste_paths: Lista de caminhos para arquivos .md
        persona_ids: Lista de IDs de personas
        agente_alvo: Agente sendo testado
    
    Returns:
        Lista de todos os resultados
    """
```

---

### 4. DETECÇÃO DE FIM DE CONVERSA

Implementar função para detectar quando conversa deve terminar:

```python
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
    """
```

---

### 5. GERAÇÃO DE DADOS ALEATÓRIOS

Implementar função auxiliar:

```python
def gerar_dados_cliente_aleatorios() -> dict:
    """
    Gera dados fictícios de cliente.
    
    Returns:
        {
            "nome": str,
            "telefone": str,
            "email": str (opcional)
        }
    """
```

Usar biblioteca `faker` ou lista interna de nomes brasileiros.

---

## ESTRUTURA DE ARQUIVOS

```
projeto/
├── core/
│   ├── personas_genericas_puras.json    # Arquivo de personas
│   └── persona_injector.py              # Classe PersonaInjector
│
├── prompts_teste/
│   ├── sofia_teste_001_qualificacao.md
│   ├── sofia_teste_002_compliance.md
│   └── sofia_teste_003_eficiencia.md
│
├── agents/
│   ├── sofia_agent.py                   # Agente Sofia
│   └── analisador_agent.py              # Agente Analisador
│
├── tests/
│   └── test_executor.py                 # Funções de execução
│
├── resultados/                          # Outputs
│
└── main.py                              # Orquestração
```

---

## EXEMPLO DE USO

### Uso Básico:
```python
from core.persona_injector import PersonaInjector
from agno import Agent

# 1. Inicializar
injector = PersonaInjector("core/personas_genericas_puras.json")

# 2. Carregar prompt de teste
with open("prompts_teste/sofia_teste_001.md") as f:
    prompt_teste = f.read()

# 3. Criar prompt final
prompt_final = injector.criar_prompt_testador(
    seu_prompt=prompt_teste,
    persona_id="PERSONA_010"
)

# 4. Criar agente testador
testador = Agent(
    description="Cliente Provocador",
    instructions=[prompt_final],
    markdown=False
)

# 5. Usar
msg = testador.run("Inicie a conversa")
print(msg)
```

### Executar Teste Completo:
```python
from tests.test_executor import executar_teste_com_persona
from agents.sofia_agent import criar_sofia_agent

sofia = criar_sofia_agent()

resultado = executar_teste_com_persona(
    prompt_teste_path="prompts_teste/sofia_teste_001.md",
    persona_id="PERSONA_010",
    agente_alvo=sofia,
    max_turnos=20
)

print(f"Turnos: {resultado['total_turnos']}")
print(f"Finalizado: {resultado['finalizado']}")
```

### Executar Bateria (1 teste, múltiplas personas):
```python
from tests.test_executor import executar_bateria_testes

personas = ["PERSONA_001", "PERSONA_010", "PERSONA_015", "PERSONA_020"]

resultados = executar_bateria_testes(
    prompt_teste_path="prompts_teste/sofia_teste_001.md",
    persona_ids=personas,
    agente_alvo=sofia
)

print(f"Executados: {len(resultados)} testes")
```

### Executar Matriz (múltiplos testes, múltiplas personas):
```python
from tests.test_executor import executar_matriz_testes

testes = [
    "prompts_teste/sofia_teste_001.md",
    "prompts_teste/sofia_teste_002.md",
    "prompts_teste/sofia_teste_003.md"
]

personas = ["PERSONA_001", "PERSONA_010", "PERSONA_020"]

# 3 testes x 3 personas = 9 execuções
resultados = executar_matriz_testes(
    prompts_teste_paths=testes,
    persona_ids=personas,
    agente_alvo=sofia
)

print(f"Total de testes: {len(resultados)}")
# Saída: Total de testes: 9
```

---

## REQUISITOS TÉCNICOS

### Dependências:
```python
# requirements.txt
agno>=0.1.0
openai>=1.0.0
fastapi>=0.100.0
pydantic>=2.0.0
faker>=20.0.0  # Para gerar dados aleatórios
```

### Configuração Agno:
```python
from agno import Agent

# Agentes usam OpenAI via Agno
agent = Agent(
    description="...",
    instructions=["..."],
    markdown=False,
    model="gpt-4o"  # ou outro modelo
)
```

---

## TRATAMENTO DE ERROS

Implementar tratamento para:

1. **Arquivo de persona não encontrado:**
```python
if not os.path.exists(personas_path):
    raise FileNotFoundError(f"Arquivo de personas não encontrado: {personas_path}")
```

2. **Persona ID inválido:**
```python
if persona_id not in self.personas:
    raise ValueError(f"Persona {persona_id} não encontrada. IDs válidos: {list(self.personas.keys())}")
```

3. **Prompt de teste vazio:**
```python
if not seu_prompt or not seu_prompt.strip():
    raise ValueError("Prompt de teste não pode ser vazio")
```

4. **Timeout em conversa:**
```python
if turnos >= max_turnos:
    logging.warning(f"Conversa atingiu limite de {max_turnos} turnos")
    return resultado
```

---

## LOGGING

Implementar logging detalhado:

```python
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Logs importantes:
logger.info(f"Carregadas {len(personas)} personas")
logger.info(f"Iniciando teste com {persona_id}")
logger.info(f"Turno {i}: Testador → Sofia")
logger.info(f"Conversa finalizada. Total turnos: {total}")
logger.warning(f"Conversa não finalizou naturalmente")
```

---

## FORMATO DE SAÍDA

Cada execução deve retornar:

```python
{
    "test_id": "TEST_001",
    "persona_id": "PERSONA_010",
    "persona_nome": "O Provocador",
    "prompt_teste": "sofia_teste_001.md",
    "timestamp_inicio": "2024-02-03T10:30:00",
    "timestamp_fim": "2024-02-03T10:32:15",
    "duracao_segundos": 135,
    "total_turnos": 12,
    "finalizado_naturalmente": true,
    "conversa": [
        {
            "turno": 1,
            "role": "user",
            "content": "oi, quero limpar meu sofa. vc é robo? kkk",
            "timestamp": "2024-02-03T10:30:05"
        },
        {
            "turno": 1,
            "role": "assistant",
            "content": "Oi! Tudo bem? 😊 Sou a Sofia...",
            "timestamp": "2024-02-03T10:30:08"
        },
        // ... resto da conversa
    ],
    "dados_cliente_usados": {
        "nome": "João Silva",
        "telefone": "(27)99999-9999"
    }
}
```

---

## TESTES UNITÁRIOS

Criar testes para:

```python
# test_persona_injector.py

def test_carregar_personas():
    """Testa carregamento do JSON"""
    injector = PersonaInjector("personas_genericas_puras.json")
    assert len(injector.personas) == 20

def test_persona_invalida():
    """Testa erro com ID inválido"""
    injector = PersonaInjector("personas_genericas_puras.json")
    with pytest.raises(ValueError):
        injector.criar_prompt_testador("...", "PERSONA_999")

def test_criar_prompt():
    """Testa criação de prompt"""
    injector = PersonaInjector("personas_genericas_puras.json")
    prompt = injector.criar_prompt_testador(
        "# Teste\nFaça X",
        "PERSONA_001"
    )
    assert "Desconfiado" in prompt
    assert "Teste" in prompt
    assert "Faça X" in prompt
```

---

## MELHORIAS OPCIONAIS

Se tiver tempo, implementar:

1. **Cache de prompts:** Evitar reprocessar o mesmo prompt+persona
2. **Execução paralela:** Rodar testes em paralelo usando `asyncio`
3. **Retry logic:** Tentar novamente se API falhar
4. **Métricas:** Coletar estatísticas (tempo médio, taxa de sucesso)
5. **Relatórios:** Gerar HTML/PDF com resultados

---

## PRIORIDADES

### Alta Prioridade (Implementar primeiro):
1. ✅ Classe PersonaInjector
2. ✅ Função executar_teste_com_persona
3. ✅ Função detectar_fim_conversa
4. ✅ Logging básico

### Média Prioridade:
5. ✅ Função executar_bateria_testes
6. ✅ Geração de dados aleatórios
7. ✅ Tratamento de erros

### Baixa Prioridade:
8. ⭐ Função executar_matriz_testes
9. ⭐ Testes unitários
10. ⭐ Melhorias opcionais

---

## ARQUIVOS FORNECIDOS

Você receberá:
1. `personas_genericas_puras.json` - Arquivo completo com 20 personas
2. `exemplo_sofia_adaptado.md` - Exemplo de prompt de teste
3. Esta especificação

---

## VALIDAÇÃO

Para validar que a implementação está correta:

```python
# Teste rápido
injector = PersonaInjector("personas_genericas_puras.json")

# Deve funcionar
prompt = injector.criar_prompt_testador(
    "# Teste\nPergunte: você é robô?",
    "PERSONA_010"
)

assert "Provocador" in prompt
assert "você é robô?" in prompt

print("✅ PersonaInjector funcionando!")

# Teste de execução
resultado = executar_teste_com_persona(
    "prompts_teste/sofia_teste_001.md",
    "PERSONA_010",
    sofia_agent
)

assert resultado["persona_id"] == "PERSONA_010"
assert len(resultado["conversa"]) > 0

print("✅ Executor funcionando!")
```

---

## OBSERVAÇÕES IMPORTANTES

1. **Compatibilidade:** Manter compatível com sistema Agno atual
2. **Modularidade:** Código deve ser fácil de estender
3. **Documentação:** Adicionar docstrings em todas as funções
4. **Type Hints:** Usar type hints em todo código Python
5. **PEP 8:** Seguir convenções de estilo Python

---

## PERGUNTAS?

Se algo não estiver claro:
- Assuma melhor prática Python
- Use logging para debug
- Adicione comentários explicativos
- Crie funções auxiliares se necessário

**BOA SORTE! 🚀**