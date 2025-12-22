# backend/roles.py

"""
Canonical role definitions for CLAW.

These are metadata only — actual auth / keys will live
in CLAW-Key + Lawyer-DAO layers.
"""

from __future__ import annotations

from typing import List, Dict


LAWYER_DAO_ROLE: Dict[str, str] = {
    "name": "lawyer_dao",
    "description": "Bar-verified counsel with clause registration powers.",
}

NODE_DAO_ROLE: Dict[str, str] = {
    "name": "node_dao",
    "description": "Infrastructure / compute nodes that run CLAW pipelines.",
}

CLIENT_ROLE: Dict[str, str] = {
    "name": "client",
    "description": "End users submitting contracts or grievances.",
}

DEFAULT_PIPELINE_ROLES: List[Dict[str, str]] = [
    LAWYER_DAO_ROLE,
    NODE_DAO_ROLE,
    CLIENT_ROLE,
]
