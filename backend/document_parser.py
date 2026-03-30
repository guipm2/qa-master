"""
Parser de documentos para extrair texto de PDF, Markdown e TXT.
"""
import io
import logging

logger = logging.getLogger(__name__)


def parse_pdf(file_bytes: bytes) -> str:
    """Extrai texto de um arquivo PDF."""
    try:
        from PyPDF2 import PdfReader
        from PyPDF2.errors import PdfReadError
    except ImportError:
        from PyPDF2 import PdfReader, PdfReadError  # type: ignore

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        text_parts = []
        for i, page in enumerate(reader.pages):
            try:
                text = page.extract_text()
                if text:
                    text_parts.append(text)
            except Exception as e:
                logger.warning("Falha ao extrair texto da página %d do PDF: %s", i, e)
        if not text_parts:
            raise ValueError("Nenhum texto pôde ser extraído do PDF (arquivo protegido ou sem texto)")
        return "\n\n".join(text_parts)
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"PDF inválido ou corrompido: {type(e).__name__}") from e


def parse_markdown(file_bytes: bytes) -> str:
    """Retorna o conteudo de um arquivo Markdown como texto."""
    return file_bytes.decode("utf-8", errors="replace")


def parse_txt(file_bytes: bytes) -> str:
    """Retorna o conteudo de um arquivo TXT."""
    return file_bytes.decode("utf-8", errors="replace")


def parse_document(filename: str, file_bytes: bytes) -> str:
    """
    Detecta o tipo de arquivo e extrai o texto.
    Suporta: .pdf, .md, .txt
    """
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return parse_pdf(file_bytes)
    elif lower.endswith(".md") or lower.endswith(".markdown"):
        return parse_markdown(file_bytes)
    elif lower.endswith(".txt"):
        return parse_txt(file_bytes)
    else:
        raise ValueError(f"Tipo de arquivo nao suportado: {filename}. Use .pdf, .md ou .txt")
