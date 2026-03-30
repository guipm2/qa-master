"""Utilitários compartilhados entre módulos do backend."""
import os
import logging

logger = logging.getLogger(__name__)


def read_prompt(filename: str, fallback: str = "") -> str:
    """Lê um arquivo de prompt da pasta prompts/."""
    prompt_path = os.path.join(os.path.dirname(__file__), "prompts", filename)
    try:
        with open(prompt_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        logger.warning("Não foi possível ler prompt '%s': %s", prompt_path, e)
        return fallback
