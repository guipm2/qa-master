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

# --- Pydantic Models for DB Operations ---

class CollectionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    base_subject_instruction: str
    base_evaluator_instruction: str
    openai_api_key: str
    max_turns: int = 20
    num_personas: int = 5

class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    base_subject_instruction: Optional[str] = None
    base_evaluator_instruction: Optional[str] = None
    openai_api_key: Optional[str] = None
    max_turns: Optional[int] = None
    num_personas: Optional[int] = None


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
    response = supabase.table("collections").insert({
        "name": data.name,
        "description": data.description,
        "base_subject_instruction": data.base_subject_instruction,
        "base_evaluator_instruction": data.base_evaluator_instruction,
        "openai_api_key": data.openai_api_key,
        "max_turns": data.max_turns,
        "num_personas": data.num_personas
    }).execute()
    return response.data[0]

def get_collections() -> List[Dict[str, Any]]:
    response = supabase.table("collections").select("*").order("created_at", desc=True).execute()
    return response.data

def get_collection_by_id(collection_id: str) -> Dict[str, Any]:
    response = supabase.table("collections").select("*").eq("id", collection_id).single().execute()
    return response.data

def update_collection(collection_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    response = supabase.table("collections").update(updates).eq("id", collection_id).execute()
    return response.data[0]

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
    return response.data[0]

def update_test_run(run_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    response = supabase.table("test_runs").update(updates).eq("id", run_id).execute()
    return response.data[0]

def get_collection_runs(collection_id: str) -> List[Dict[str, Any]]:
    response = supabase.table("test_runs").select("*").eq("collection_id", collection_id).order("iteration", desc=False).execute()
    return response.data
