import os
from supabase import create_client, Client
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uuid
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Initialize Supabase Client
# Ensure SUPABASE_URL and SUPABASE_KEY are set in environment variables
url: str = os.environ.get("SUPABASE_URL", "")
key: str = os.environ.get("SUPABASE_KEY", "")

supabase: Client = create_client(url, key)


def _first_row_or_error(response: Any, operation: str) -> Dict[str, Any]:
    rows = getattr(response, "data", None)
    if rows and len(rows) > 0:
        return rows[0]
    raise RuntimeError(f"Supabase retornou resposta vazia em {operation}")

# --- Pydantic Models for DB Operations ---

class CollectionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    base_subject_instruction: str
    base_evaluator_instruction: str
    openai_api_key: str
    max_turns: int = 20
    num_personas: int = 5
    subject_model: str = "gpt-5.2"  # Modelo OpenAI para o agente testado

class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    base_subject_instruction: Optional[str] = None
    base_evaluator_instruction: Optional[str] = None
    openai_api_key: Optional[str] = None
    max_turns: Optional[int] = None
    num_personas: Optional[int] = None
    subject_model: Optional[str] = None  # Modelo OpenAI para o agente testado


class TestRunCreate(BaseModel):
    collection_id: str
    iteration: int
    status: str = "running"
    subject_instruction: str
    transcript: Optional[List[Dict[str, Any]]] = None
    evaluation_result: Optional[Dict[str, Any]] = None
    score: Optional[float] = None

# --- DB Functions ---

def create_collection(data: CollectionCreate) -> Dict[str, Any]:
    payload = {
        "name": data.name,
        "description": data.description,
        "base_subject_instruction": data.base_subject_instruction,
        "base_evaluator_instruction": data.base_evaluator_instruction,
        "openai_api_key": data.openai_api_key,
        "max_turns": data.max_turns,
        "num_personas": data.num_personas,
        "subject_model": data.subject_model
    }
    try:
        response = supabase.table("collections").insert(payload).execute()
        return _first_row_or_error(response, "create_collection")
    except Exception as e:
        # Fallback: Se a coluna subject_model não existir, tenta salvar sem ela
        if "subject_model" in str(e) or "PGRST204" in str(e):
            print("AVISO: Coluna 'subject_model' não encontrada. Salvando sem preferencia de modelo.")
            payload.pop("subject_model", None)
            response = supabase.table("collections").insert(payload).execute()
            return _first_row_or_error(response, "create_collection_fallback")
        raise e

def get_collections() -> List[Dict[str, Any]]:
    response = supabase.table("collections").select("*").order("created_at", desc=True).execute()
    return response.data

def get_collection_by_id(collection_id: str) -> Dict[str, Any]:
    response = supabase.table("collections").select("*").eq("id", collection_id).single().execute()
    return response.data

def update_collection(collection_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    try:
        response = supabase.table("collections").update(updates).eq("id", collection_id).execute()
        return _first_row_or_error(response, "update_collection")
    except Exception as e:
        # Fallback: Se a coluna subject_model não existir, tenta atualizar sem ela
        if "subject_model" in str(e) or "PGRST204" in str(e):
            print("AVISO: Coluna 'subject_model' não encontrada. Atualizando sem preferencia de modelo.")
            updates.pop("subject_model", None)
            response = supabase.table("collections").update(updates).eq("id", collection_id).execute()
            return _first_row_or_error(response, "update_collection_fallback")
        raise e

def delete_collection(collection_id: str) -> None:
    supabase.table("collections").delete().eq("id", collection_id).execute()


def create_test_run(data: TestRunCreate) -> Dict[str, Any]:
    response = supabase.table("test_runs").insert({
        "collection_id": data.collection_id,
        "iteration": data.iteration,
        "status": data.status,
        "subject_instruction": data.subject_instruction,
        "transcript": data.transcript,
        "evaluation_result": data.evaluation_result,
        "score": data.score
    }).execute()
    return _first_row_or_error(response, "create_test_run")

def update_test_run(run_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    response = supabase.table("test_runs").update(updates).eq("id", run_id).execute()
    if response.data:
        return response.data[0]
    return {"id": run_id, **updates}

def delete_test_run(run_id: str) -> None:
    supabase.table("test_runs").delete().eq("id", run_id).execute()

def get_collection_runs(collection_id: str) -> List[Dict[str, Any]]:
    response = supabase.table("test_runs").select("*").eq("collection_id", collection_id).order("iteration", desc=False).execute()
    return response.data


# --- Reference Documents DB Functions ---

def create_reference_document(collection_id: str, filename: str, file_type: str, content_text: str, file_size_bytes: int) -> Dict[str, Any]:
    response = supabase.table("reference_documents").insert({
        "collection_id": collection_id,
        "filename": filename,
        "file_type": file_type,
        "content_text": content_text,
        "file_size_bytes": file_size_bytes
    }).execute()
    return _first_row_or_error(response, "create_reference_document")

def get_collection_documents(collection_id: str) -> List[Dict[str, Any]]:
    response = supabase.table("reference_documents").select("*").eq("collection_id", collection_id).order("created_at", desc=False).execute()
    return response.data

def get_document_by_id(doc_id: str) -> Dict[str, Any]:
    response = supabase.table("reference_documents").select("*").eq("id", doc_id).single().execute()
    return response.data

def delete_reference_document(doc_id: str) -> None:
    supabase.table("reference_documents").delete().eq("id", doc_id).execute()

def get_documents_by_ids(doc_ids: List[str]) -> List[Dict[str, Any]]:
    response = supabase.table("reference_documents").select("*").in_("id", doc_ids).execute()
    return response.data


# --- Document Test Runs DB Functions ---

def create_document_test_run(collection_id: str, subject_instruction: str, document_ids: List[str]) -> Dict[str, Any]:
    response = supabase.table("document_test_runs").insert({
        "collection_id": collection_id,
        "status": "running",
        "subject_instruction": subject_instruction,
        "document_ids": document_ids
    }).execute()
    return _first_row_or_error(response, "create_document_test_run")

def update_document_test_run(run_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    response = supabase.table("document_test_runs").update(updates).eq("id", run_id).execute()
    if response.data:
        return response.data[0]
    return {"id": run_id, **updates}

def delete_document_test_run(run_id: str) -> None:
    supabase.table("document_test_runs").delete().eq("id", run_id).execute()

def get_document_test_runs(collection_id: str) -> List[Dict[str, Any]]:
    response = supabase.table("document_test_runs").select("*").eq("collection_id", collection_id).order("created_at", desc=True).execute()
    return response.data
