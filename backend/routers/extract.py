"""
Legacy / Non-Core Router.
Not part of CLAW v1 four utilities.
Do not expand; only maintain for compatibility.
"""

# Legacy / Non-Core Router: keep for compatibility only.

from fastapi import APIRouter, File, UploadFile, Request

# Exists for CLI and legacy compatibility; do not expand scope.
router = APIRouter()


@router.post("/clauses/extract")
async def extract_clauses(
    req: Request,
    file: UploadFile = File(...),
):
    """
    Optional clause extraction endpoint.
    Loaded only when explicitly enabled.
    """
    # Lazy import to avoid import-time dependency traps
    from backend.handlers.clause_extract import extract_clauses_from_bytes

    data = await file.read()
    return extract_clauses_from_bytes(data)
