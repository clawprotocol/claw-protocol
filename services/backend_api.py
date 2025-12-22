# services/backend_api.py

import os
from typing import List, Dict, Any

import httpx

from utils.logger import logger

CLAUSE_API_URL = os.getenv("CLAUSE_API_URL", "http://localhost:8000")


# -------------------------------------------------
# Upload + extract
# -------------------------------------------------
async def upload_and_extract(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    """
    Sends a file to /extract endpoint and returns the JSON result.
    """
    url = f"{CLAUSE_API_URL}/extract"
    logger.info(f"Sending file '{filename}' to backend for clause extraction at {url}")

    async with httpx.AsyncClient() as client:
        try:
            files = {"file": (filename, file_bytes, "application/pdf")}
            resp = await client.post(url, files=files, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"✅ Extraction response: {data}")
            return data
        except Exception as e:
            logger.error(f"❌ Error calling /extract: {e}")
            raise


# -------------------------------------------------
# Proof generation
# -------------------------------------------------
async def generate_proof(clauses: List[str]) -> Dict[str, Any]:
    """
    Calls /proof with a list of clauses.
    """
    url = f"{CLAUSE_API_URL}/proof"
    logger.info(f"Calling backend /proof at {url}")

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, json={"clauses": clauses}, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"✅ Proof response: {data}")
            return data
        except Exception as e:
            logger.error(f"❌ Error calling /proof: {e}")
            raise


# -------------------------------------------------
# Signing workflow
# -------------------------------------------------
async def start_signing(
    clauses: List[str],
    signer_name: str,
    signer_id: int,
) -> Dict[str, Any]:
    """
    Calls /sign to create a CLAW-style signing packet.
    """
    url = f"{CLAUSE_API_URL}/sign"
    payload = {
        "clauses": clauses,
        "signer_name": signer_name,
        "signer_id": signer_id,
    }

    logger.info(f"Calling backend /sign at {url} with signer={signer_name}")

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"✅ Sign response: {data}")
            return data
        except Exception as e:
            logger.error(f"❌ Error calling /sign: {e}")
            raise
