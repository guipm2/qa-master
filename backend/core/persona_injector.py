"""
PersonaInjector - Sistema de injeção de personas para testes automatizados.

Este módulo fornece a classe PersonaInjector que:
- Carrega 20 personas genéricas de um arquivo JSON
- Combina persona + prompt de teste em um único prompt final
- Gera dados aleatórios opcionais (nome, telefone)
"""

import json
import logging
import os
import random
from typing import Optional

# Configuração de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PersonaInjector:
    """
    Classe responsável por carregar personas e gerar prompts de teste.
    
    Attributes:
        personas_path: Caminho para o arquivo JSON de personas
        personas: Dicionário de personas indexado por ID
    
    Example:
        >>> injector = PersonaInjector("personas_genericas_puras.json")
        >>> prompt = injector.criar_prompt_testador(
        ...     seu_prompt="# Teste\\nFaça X",
        ...     persona_id="PERSONA_001"
        ... )
        >>> print(prompt)
    """
    
    def __init__(self, personas_path: str):
        """
        Inicializa o PersonaInjector carregando personas do JSON.
        
        Args:
            personas_path: Caminho para o arquivo JSON de personas
            
        Raises:
            FileNotFoundError: Se o arquivo não existir
            json.JSONDecodeError: Se o JSON for inválido
        """
        self.personas_path = personas_path
        self.personas: dict[str, dict] = {}
        self._carregar_personas()
    
    def _carregar_personas(self) -> None:
        """Carrega personas do arquivo JSON."""
        if not os.path.exists(self.personas_path):
            raise FileNotFoundError(
                f"Arquivo de personas não encontrado: {self.personas_path}"
            )
        
        logger.info(f"Carregando personas de: {self.personas_path}")
        
        with open(self.personas_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # Indexar personas por ID
        for persona in data.get("personas", []):
            persona_id = persona.get("id")
            if persona_id:
                self.personas[persona_id] = persona
        
        logger.info(f"Carregadas {len(self.personas)} personas")
    
    def listar_personas(self) -> list[dict]:
        """
        Retorna lista de todas as personas disponíveis.
        
        Returns:
            Lista de dicionários com informações de cada persona
        """
        return [
            {
                "id": p["id"],
                "nome": p["nome"],
                "personalidade": p.get("personalidade", ""),
                "nivel_stress": p.get("nivel_stress", "")
            }
            for p in self.personas.values()
        ]
    
    def obter_persona(self, persona_id: str) -> dict:
        """
        Retorna uma persona específica pelo ID.
        
        Args:
            persona_id: ID da persona (ex: "PERSONA_001")
            
        Returns:
            Dicionário com dados completos da persona
            
        Raises:
            ValueError: Se o ID não existir
        """
        if persona_id not in self.personas:
            ids_validos = list(self.personas.keys())
            raise ValueError(
                f"Persona '{persona_id}' não encontrada. "
                f"IDs válidos: {ids_validos}"
            )
        return self.personas[persona_id]
    
    def _formatar_persona(self, persona: dict) -> str:
        """
        Formata os dados da persona em texto legível.
        
        Args:
            persona: Dicionário com dados da persona
            
        Returns:
            Texto formatado com os dados da persona
        """
        linhas = []
        
        # Cabeçalho
        linhas.append(f"# SUA PERSONA: {persona['nome']}")
        linhas.append("")
        
        # Informações básicas
        linhas.append(f"**Personalidade:** {persona.get('personalidade', 'N/A')}")
        linhas.append(f"**Nível de Stress:** {persona.get('nivel_stress', 'N/A')}")
        linhas.append(f"**Tom de Comunicação:** {persona.get('tom_comunicacao', 'N/A')}")
        linhas.append("")
        
        # Comportamentos
        comportamentos = persona.get("comportamentos", [])
        if comportamentos:
            linhas.append("## Como você se comporta:")
            for comp in comportamentos:
                linhas.append(f"- {comp}")
            linhas.append("")
        
        # Padrões de linguagem
        padroes = persona.get("padroes_linguagem", [])
        if padroes:
            linhas.append("## Padrões típicos de linguagem:")
            for padrao in padroes:
                linhas.append(f'- "{padrao}"')
            linhas.append("")
        
        # Triggers de comportamento
        triggers = persona.get("triggers_comportamento", {})
        if triggers:
            linhas.append("## Comportamentos ao longo da conversa:")
            for momento, comportamento in triggers.items():
                linhas.append(f"- **{momento}:** {comportamento}")
            linhas.append("")
        
        return "\n".join(linhas)
    
    def _formatar_dados_cliente(self, dados: Optional[dict]) -> str:
        """
        Formata dados do cliente em texto.
        
        Args:
            dados: Dicionário com dados opcionais (nome, telefone, etc)
            
        Returns:
            Texto formatado com os dados
        """
        if not dados:
            return ""
        
        linhas = ["## SEUS DADOS PARA ESTE TESTE", ""]
        
        for chave, valor in dados.items():
            linhas.append(f"- **{chave.title()}:** {valor}")
        
        linhas.append("")
        return "\n".join(linhas)
    
    def criar_prompt_testador(
        self,
        seu_prompt: str,
        persona_id: str,
        dados_opcionais: Optional[dict] = None
    ) -> str:
        """
        Combina persona + prompt de teste em um único prompt final.
        
        Args:
            seu_prompt: Conteúdo do prompt de teste (texto do arquivo .md)
            persona_id: ID da persona a usar (ex: "PERSONA_010")
            dados_opcionais: Dados extras como nome, telefone (opcional)
        
        Returns:
            Prompt final formatado para o agente testador
            
        Raises:
            ValueError: Se persona_id não existir ou prompt for vazio
            
        Example:
            >>> prompt = injector.criar_prompt_testador(
            ...     seu_prompt=open("teste.md").read(),
            ...     persona_id="PERSONA_010",
            ...     dados_opcionais={"nome": "João", "telefone": "(27)99999-9999"}
            ... )
        """
        # Validar prompt
        if not seu_prompt or not seu_prompt.strip():
            raise ValueError("Prompt de teste não pode ser vazio")
        
        # Obter persona (valida se existe)
        persona = self.obter_persona(persona_id)
        
        logger.info(f"Criando prompt com persona: {persona_id} ({persona['nome']})")
        
        # Montar prompt final
        partes = []
        
        # 1. Dados da persona
        partes.append(self._formatar_persona(persona))
        
        # 2. Separador
        partes.append("---\n")
        
        # 3. Prompt de teste
        partes.append(seu_prompt.strip())
        
        # 4. Separador
        partes.append("\n---\n")
        
        # 5. Dados do cliente (se houver)
        if dados_opcionais:
            partes.append(self._formatar_dados_cliente(dados_opcionais))
        
        # 6. Instruções finais
        partes.append("""## INSTRUÇÕES FINAIS

Você deve:
1. Usar a PERSONA "{nome}" durante toda a conversa
2. Seguir as instruções do PROMPT DE TESTE acima
3. Ser natural - combine a persona com as instruções
4. Manter o tom e padrões de linguagem da sua persona

**COMECE AGORA!**""".format(nome=persona["nome"]))
        
        return "\n".join(partes)


# Funções de conveniência para geração de dados

# Listas de nomes brasileiros para uso quando faker não estiver disponível
NOMES_BRASILEIROS = [
    "João Silva", "Maria Santos", "Pedro Oliveira", "Ana Costa",
    "Carlos Pereira", "Fernanda Lima", "Lucas Rodrigues", "Juliana Souza",
    "Rafael Almeida", "Camila Ferreira", "Gustavo Ribeiro", "Larissa Martins",
    "Bruno Carvalho", "Amanda Gomes", "Diego Barbosa", "Patrícia Rocha",
    "Thiago Nascimento", "Vanessa Mendes", "Felipe Araújo", "Mariana Castro"
]

DDDS_BRASIL = [
    "11", "21", "27", "31", "41", "47", "48", "51", "61", "62",
    "71", "81", "82", "83", "84", "85", "86", "87", "88", "91"
]


def gerar_dados_cliente_aleatorios() -> dict:
    """
    Gera dados fictícios de cliente brasileiro.
    
    Tenta usar a biblioteca faker se disponível, caso contrário
    usa listas internas de nomes brasileiros.
    
    Returns:
        dict: Dicionário com nome, telefone e opcionalmente email
        
    Example:
        >>> dados = gerar_dados_cliente_aleatorios()
        >>> print(dados)
        {'nome': 'João Silva', 'telefone': '(27)99999-9999'}
    """
    try:
        from faker import Faker
        fake = Faker("pt_BR")
        
        nome = fake.name()
        ddd = random.choice(DDDS_BRASIL)
        numero = fake.msisdn()[4:13]  # 9 dígitos
        telefone = f"({ddd}){numero[:5]}-{numero[5:]}"
        
        dados = {
            "nome": nome,
            "telefone": telefone
        }
        
        # 30% de chance de incluir email
        if random.random() < 0.3:
            dados["email"] = fake.email()
        
        return dados
        
    except ImportError:
        logger.warning("Faker não instalado, usando dados internos")
        
        nome = random.choice(NOMES_BRASILEIROS)
        ddd = random.choice(DDDS_BRASIL)
        numero = "".join([str(random.randint(0, 9)) for _ in range(9)])
        telefone = f"({ddd}){numero[:5]}-{numero[5:]}"
        
        return {
            "nome": nome,
            "telefone": telefone
        }
