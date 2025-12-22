# backend/models/clauses.py

from typing import List, Optional
from pydantic import BaseModel


class Clause(BaseModel):
    raw_text: str
    section: Optional[str] = None
    title: Optional[str] = None
    body: Optional[str] = None
    type: Optional[str] = None
    parties: List[str] = []
    risk_flags: List[str] = []
    source_doc: Optional[str] = None
