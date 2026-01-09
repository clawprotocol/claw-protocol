# backend/handlers/payment_adapters/base.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, Protocol


class PaymentAdapter(Protocol):
    """
    Transport-agnostic payment interface.

    CLAW core should never depend on a specific rail (x402, Stripe, ACH, etc.).
    Adapters produce:
      - a quote/terms object (used to construct a 402 response, if applicable)
      - a verification result (used to embed a payment fragment in a CLAW receipt)
    """

    protocol: str
    version: str

    def quote(
        self, *, claw_action_id: str, action: str, request_context: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Return a terms object if this action requires payment, else None.
        """
        ...

    def verify(
        self,
        *,
        claw_action_id: str,
        action: str,
        request_context: Dict[str, Any],
        payment_proof_header: Optional[str],
        expected_terms: Dict[str, Any],
    ) -> "PaymentVerificationResult":
        """
        Verify a payment proof and return a result suitable for embedding into a CLAW receipt.
        """
        ...


@dataclass(frozen=True)
class PaymentVerificationResult:
    status: str  # "paid" | "required_unpaid" | "failed"
    verified_at: Optional[str]
    payment_fragment: Optional[Dict[str, Any]]
    error: Optional[str] = None


class PaymentRequiredError(Exception):
    """
    Raised by CLAW handlers when payment is required (HTTP 402).
    The FastAPI layer should catch this and return JSONResponse(status_code=402, content=terms).
    """

    def __init__(self, terms: Dict[str, Any]):
        super().__init__("Payment Required")
        self.terms = terms
