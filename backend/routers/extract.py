from fastapi import APIRouter, File, UploadFile, Request

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
