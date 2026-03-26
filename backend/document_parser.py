"""
Parser de documentos para extrair texto de PDF, Markdown e TXT.
"""
import io


def parse_pdf(file_bytes: bytes) -> str:
    """Extrai texto de um arquivo PDF."""
    from PyPDF2 import PdfReader
    reader = PdfReader(io.BytesIO(file_bytes))
    text_parts = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            text_parts.append(text)
    return "\n\n".join(text_parts)


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
