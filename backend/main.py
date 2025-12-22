# backend/main.py

from typing import List, Optional, Literal, Dict, Any

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from handlers.clause_extract import extract_clauses_from_bytes
from handlers.sign_handler import create_sign_packet
from handlers.proof_handler import generate_proof_packet
from handlers.receipt_handler import build_receipt
from handlers.verify_handler import (
    verify_evm_personal_sign,
    verify_solana_sign_message,
)

app = FastAPI(title="CLAW Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------
# Models
# -------------------------------------------------
SigningRole = Literal["author", "verifier", "judge"]
Chain = Literal["evm", "solana"]


class SignRequest(BaseModel):
    clauses: List[str]
    role: SigningRole
    signer_name: Optional[str] = None
    signer_wallet: Optional[str] = None  # EVM address OR Solana pubkey (base58)
    document_title: Optional[str] = None
    chain: Optional[Chain] = "evm"


class ProofPacketRequest(BaseModel):
    clauses: List[str]
    sign_packet: Dict[str, Any]


class VerifyRequest(BaseModel):
    chain: Chain
    address: str  # EVM address or Solana pubkey (base58)
    message: str  # e.g. "CLAW:<packet_hash>"
    signature: str  # EVM: hex (0x...), Solana: base58


class ReceiptRequest(BaseModel):
    proof_packet: Dict[str, Any]
    signatures: List[Dict[str, Any]]


# -------------------------------------------------
# /health
# -------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "service": "claw-backend"}


# -------------------------------------------------
# /extract
# -------------------------------------------------
@app.post("/extract")
async def extract(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename missing.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file.")

    try:
        clauses = extract_clauses_from_bytes(content, filename=file.filename)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {exc}") from exc

    return JSONResponse({"clauses": clauses})


# -------------------------------------------------
# /sign — create signing packet (UI preview)
# -------------------------------------------------
@app.post("/sign")
async def sign(request: SignRequest):
    try:
        sign_packet = create_sign_packet(
            clauses=request.clauses,
            role=request.role,
            signer_name=request.signer_name,
            signer_wallet=request.signer_wallet,
            document_title=request.document_title,
            chain=request.chain,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Signing packet generation failed: {exc}") from exc

    return JSONResponse({"sign_packet": sign_packet})


# -------------------------------------------------
# /proof — generate proof packet from clauses + sign packet
# -------------------------------------------------
@app.post("/proof")
async def proof(request: ProofPacketRequest):
    try:
        proof_packet = generate_proof_packet(
            clauses=request.clauses,
            sign_packet=request.sign_packet,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Proof packet generation failed: {exc}") from exc

    return JSONResponse({"proof_packet": proof_packet})


# -------------------------------------------------
# /verify — verify a wallet signature (EVM + Solana)
# -------------------------------------------------
@app.post("/verify")
async def verify(request: VerifyRequest):
    chain = request.chain.lower().strip()

    if chain == "evm":
        res = verify_evm_personal_sign(
            message=request.message,
            signature_hex=request.signature,
            expected_address=request.address,
        )
        return JSONResponse(
            {
                "ok": res.ok,
                "reason": res.reason,
                "recovered_address": res.recovered_address,
            }
        )

    if chain == "solana":
        res = verify_solana_sign_message(
            message=request.message,
            signature=request.signature,
            expected_pubkey_base58=request.address,
        )
        return JSONResponse(
            {
                "ok": res.ok,
                "reason": res.reason,
            }
        )

    return JSONResponse({"ok": False, "reason": "chain must be 'evm' or 'solana'"}, status_code=400)


# -------------------------------------------------
# /receipt — build deterministic receipt from proof_packet + signatures[]
# -------------------------------------------------
@app.post("/receipt")
async def receipt(request: ReceiptRequest):
    try:
        receipt_obj = build_receipt(
            proof_packet=request.proof_packet,
            signatures=request.signatures,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Receipt generation failed: {exc}") from exc

    return JSONResponse({"receipt": receipt_obj})
