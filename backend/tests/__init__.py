# Tests module for persona testing system
"""
Test execution module containing functions to run automated tests.
"""

from .test_executor import (
    detectar_fim_conversa,
    executar_teste_com_persona,
    executar_bateria_testes,
    executar_matriz_testes,
    selecionar_personas,
    executar_bateria_com_analise_juiz,
    DEFAULT_MAX_TURNOS,
    DEFAULT_NUM_PERSONAS
)

__all__ = [
    "detectar_fim_conversa",
    "executar_teste_com_persona", 
    "executar_bateria_testes",
    "executar_matriz_testes",
    "selecionar_personas",
    "executar_bateria_com_analise_juiz",
    "DEFAULT_MAX_TURNOS",
    "DEFAULT_NUM_PERSONAS"
]

