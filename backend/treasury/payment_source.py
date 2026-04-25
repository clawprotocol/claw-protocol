"""
Thin payment-source abstraction: normalize external facts into ``PaymentRecord`` rows.

Full Stripe/Solana/ramp verification is deferred; adapters encapsulate source-specific parsing.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, Literal, Optional

PaymentSourceType = Literal["fiat_processor", "solana", "ramp", "manual"]
PaymentStatus = Literal["pending", "confirmed", "failed", "refunded"]


@dataclass
class NormalizedPaymentInput:
    """Provider-agnostic ingestion payload for the treasury pipeline."""

    source_type: PaymentSourceType
    source_reference: str
    payer_ref: str
    gross_amount: Decimal
    currency: str
    normalized_usd_amount: Optional[Decimal] = None
    status: PaymentStatus = "pending"
    metadata: Optional[Dict[str, Any]] = None
    solana_wallet: Optional[str] = None
    solana_signature: Optional[str] = None
    solana_memo: Optional[str] = None
    solana_token_mint: Optional[str] = None


class PaymentVerificationAdapter(ABC):
    """Future: verify webhook signatures / RPC confirmations before confirming."""

    @abstractmethod
    def source_type(self) -> PaymentSourceType: ...

    @abstractmethod
    def normalize_incoming(self, raw: Dict[str, Any]) -> NormalizedPaymentInput:
        """Map provider payload → normalized input (may still be pending until verified)."""


class ManualPaymentAdapter(PaymentVerificationAdapter):
    """Dev/operator injection — trusts caller when used behind dev gates."""

    def source_type(self) -> PaymentSourceType:
        return "manual"

    def normalize_incoming(self, raw: Dict[str, Any]) -> NormalizedPaymentInput:
        amt = Decimal(str(raw.get("gross_amount") or "0"))
        return NormalizedPaymentInput(
            source_type="manual",
            source_reference=str(raw.get("source_reference") or "manual"),
            payer_ref=str(raw.get("payer_ref") or "unknown"),
            gross_amount=amt,
            currency=str(raw.get("currency") or "USD"),
            normalized_usd_amount=Decimal(str(raw["normalized_usd_amount"]))
            if raw.get("normalized_usd_amount") is not None
            else None,
            status=str(raw.get("status") or "pending"),  # type: ignore[arg-type]
            metadata=raw.get("metadata") if isinstance(raw.get("metadata"), dict) else None,
            solana_wallet=(str(raw["solana_wallet"]) if raw.get("solana_wallet") else None),
            solana_signature=(str(raw["solana_signature"]) if raw.get("solana_signature") else None),
            solana_memo=(str(raw["solana_memo"]) if raw.get("solana_memo") else None),
            solana_token_mint=(str(raw["solana_token_mint"]) if raw.get("solana_token_mint") else None),
        )


def default_adapters() -> Dict[PaymentSourceType, PaymentVerificationAdapter]:
    return {"manual": ManualPaymentAdapter()}
