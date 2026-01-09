# backend/handlers/payment_adapters/x402.py
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from backend.handlers.payment_adapters.base import PaymentVerificationResult
from backend.handlers.agent_api_handler import canonical_json, sha256_hex


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _iso_in(minutes: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat().replace("+00:00", "Z")


def _b64url_decode(s: str) -> bytes:
    # base64url without padding is common in headers
    s = s.strip()
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _decode_payment_proof_header(raw: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Accept either:
      1) raw JSON: {"tx_hash": "...", ...}
      2) base64url JSON, prefixed by "b64:" (recommended for header-safe proofs)
         e.g. X-PAYMENT: b64:eyJ0eF9oYXNoIjoiMHhhYmMiLC4uLn0

    Returns (proof_dict, error_str).
    """
    if not raw:
        return None, "Missing payment proof header"

    raw = raw.strip()

    # b64:<base64url-json>
    if raw.lower().startswith("b64:"):
        b64_payload = raw.split(":", 1)[1].strip()
        try:
            decoded = _b64url_decode(b64_payload).decode("utf-8")
        except Exception:
            return None, "Could not base64url-decode payment proof"
        try:
            return json.loads(decoded), None
        except Exception:
            return None, "Decoded base64 payment proof is not valid JSON"

    # raw JSON
    try:
        return json.loads(raw), None
    except Exception:
        return None, "Payment proof header is neither valid JSON nor b64:<base64url-json>"


def _facilitator_hmac_ok(secret: str, payload_obj: Dict[str, Any], signature_hex: str) -> bool:
    """
    Very lightweight "signature checking" for facilitator attestations.
    Facilitator signs canonical JSON of `payload` with HMAC-SHA256(secret).
    """
    msg = canonical_json(payload_obj).encode("utf-8")
    mac = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(mac, signature_hex)


class X402PaymentAdapter:
    """
    Minimal x402-shaped adapter (production-shaped, conservative).

    Adds:
      - header-safe proofs via base64url: X-PAYMENT: b64:<...>
      - optional facilitator attestation verification (HMAC-based, configurable)
      - deterministic terms fingerprint + binding_hash (anti-replay / anti-substitution)

    Facilitator attestation format (optional in proof):
      "facilitator": {
        "id": "did:web:example",
        "scheme": "hmac_sha256",
        "payload": { ... },         # must include at minimum tx_hash/amount/asset/payee/binding_hash
        "signature": "<hex>"        # HMAC(secret, canonical_json(payload))
      }

    To enforce facilitator signatures, set:
      CLAW_X402_FACILITATOR_HMAC_SECRET=<shared secret>
      CLAW_X402_REQUIRE_FACILITATOR_ATTESTATION=true
    """

    protocol = "x402"
    version = "x402/embedded/0.1"

    def __init__(self) -> None:
        # Defaults: no payment required unless prices are set.
        self.default_asset_symbol = os.getenv("CLAW_X402_ASSET_SYMBOL", "USDC")
        self.default_asset_decimals = int(os.getenv("CLAW_X402_ASSET_DECIMALS", "6"))
        self.default_asset_contract = os.getenv("CLAW_X402_ASSET_CONTRACT", "")  # optional
        self.default_chain = os.getenv("CLAW_X402_CHAIN", "base")  # informational
        self.default_chain_id = int(os.getenv("CLAW_X402_CHAIN_ID", "8453"))  # Base mainnet
        self.default_payee = os.getenv("CLAW_X402_PAYEE", "")  # REQUIRED if charging
        self.ttl_minutes = int(os.getenv("CLAW_X402_TERMS_TTL_MINUTES", "15"))

        # Per-action prices (decimal string)
        self.prices = {
            "propose_clause": os.getenv("CLAW_X402_PRICE_PROPOSE_USDC", "0"),
            "sign_clause": os.getenv("CLAW_X402_PRICE_SIGN_USDC", "0"),
            "generate_proof": os.getenv("CLAW_X402_PRICE_PROOF_USDC", "0"),
            "anchor_proof": os.getenv("CLAW_X402_PRICE_ANCHOR_USDC", "0"),
        }

        self.payment_header_name = os.getenv("CLAW_X402_PAYMENT_HEADER", "X-PAYMENT")

        self.fac_hmac_secret = os.getenv("CLAW_X402_FACILITATOR_HMAC_SECRET", "")
        self.require_fac_attestation = os.getenv("CLAW_X402_REQUIRE_FACILITATOR_ATTESTATION", "false").lower() in (
            "1",
            "true",
            "yes",
        )

    def _price_for(self, action: str) -> str:
        return self.prices.get(action, "0") or "0"

    def quote(self, *, claw_action_id: str, action: str, request_context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        amount = self._price_for(action)
        if amount in ("0", "0.0", "0.00"):
            return None

        if not self.default_payee:
            # If configured to charge but missing payee, fail safe: do not charge.
            return None

        terms: Dict[str, Any] = {
            "protocol": self.protocol,
            "version": self.version,
            "action": action,
            "claw_action_id": claw_action_id,
            "asset": {
                "symbol": self.default_asset_symbol,
                "contract": self.default_asset_contract,
                "decimals": self.default_asset_decimals,
            },
            "amount": amount,
            "payee": self.default_payee,
            "network": {"chain": self.default_chain, "chain_id": self.default_chain_id},
            "expires_at": _iso_in(self.ttl_minutes),
            "http_402": {
                "resource": request_context.get("resource", ""),
                "method": request_context.get("method", ""),
                "path": request_context.get("path", ""),
                "payment_header": self.payment_header_name,
                "proof_encodings": ["json", "b64:base64url(json)"],
            },
            "verification": {
                "facilitator_attestation_required": self.require_fac_attestation,
                "facilitator_scheme_supported": ["hmac_sha256"] if self.fac_hmac_secret else [],
            },
        }

        terms_fingerprint = sha256_hex(canonical_json(terms))
        terms["terms_fingerprint"] = terms_fingerprint

        binding_material = (
            f"{claw_action_id}|{action}|{terms_fingerprint}|{amount}|{self.default_asset_symbol}|{self.default_payee}"
        )
        terms["binding_hash"] = sha256_hex(binding_material)

        return terms

    def verify(
        self,
        *,
        claw_action_id: str,
        action: str,
        request_context: Dict[str, Any],
        payment_proof_header: Optional[str],
        expected_terms: Dict[str, Any],
    ) -> PaymentVerificationResult:
        if not payment_proof_header:
            return PaymentVerificationResult(
                status="required_unpaid",
                verified_at=None,
                payment_fragment=None,
                error="Missing payment proof header",
            )

        proof, err = _decode_payment_proof_header(payment_proof_header)
        if err or proof is None:
            return PaymentVerificationResult(status="failed", verified_at=None, payment_fragment=None, error=err)

        # Accept either direct fields or a facilitator-wrapped payload
        facilitator = proof.get("facilitator")
        fac_payload: Optional[Dict[str, Any]] = None
        fac_sig_ok = False

        if facilitator and isinstance(facilitator, dict):
            fac_payload = facilitator.get("payload")
            scheme = str(facilitator.get("scheme") or "")
            signature = str(facilitator.get("signature") or "")
            if fac_payload and isinstance(fac_payload, dict) and scheme == "hmac_sha256" and self.fac_hmac_secret:
                fac_sig_ok = _facilitator_hmac_ok(self.fac_hmac_secret, fac_payload, signature)

        # Enforce facilitator attestations if configured
        if self.require_fac_attestation:
            if not facilitator or not fac_payload:
                return PaymentVerificationResult(
                    status="failed",
                    verified_at=None,
                    payment_fragment=None,
                    error="Facilitator attestation required but missing",
                )
            if self.fac_hmac_secret and not fac_sig_ok:
                return PaymentVerificationResult(
                    status="failed",
                    verified_at=None,
                    payment_fragment=None,
                    error="Facilitator attestation signature invalid",
                )

        # Merge: facilitator payload overrides top-level proof fields when present
        merged = dict(proof)
        if fac_payload:
            merged.update(fac_payload)

        tx_hash = str(merged.get("tx_hash") or merged.get("transaction_hash") or "")
        payer = str(merged.get("payer") or "")
        amount = str(merged.get("amount") or "")
        asset = str(merged.get("asset") or merged.get("symbol") or "")
        payee = str(merged.get("payee") or "")
        provided_binding = str(merged.get("binding_hash") or "")

        if not tx_hash or not amount or not asset or not payee:
            return PaymentVerificationResult(
                status="failed",
                verified_at=None,
                payment_fragment=None,
                error="Payment proof missing required fields (tx_hash/amount/asset/payee)",
            )

        if asset != expected_terms["asset"]["symbol"]:
            return PaymentVerificationResult(status="failed", verified_at=None, payment_fragment=None, error="Asset mismatch")

        if amount != expected_terms["amount"]:
            return PaymentVerificationResult(status="failed", verified_at=None, payment_fragment=None, error="Amount mismatch")

        if payee.lower() != str(expected_terms["payee"]).lower():
            return PaymentVerificationResult(status="failed", verified_at=None, payment_fragment=None, error="Payee mismatch")

        expected_binding = str(expected_terms.get("binding_hash") or "")
        if provided_binding and expected_binding and provided_binding != expected_binding:
            return PaymentVerificationResult(
                status="failed",
                verified_at=None,
                payment_fragment=None,
                error="binding_hash mismatch",
            )

        fragment: Dict[str, Any] = {
            "payment_version": self.version,
            "protocol": self.protocol,
            "status": "paid",
            "binding": {
                "binds_to": "claw.action_id",
                "terms_fingerprint": expected_terms.get("terms_fingerprint"),
                "binding_hash": expected_binding,
            },
            "x402": {
                "asset": expected_terms.get("asset", {}),
                "amount": expected_terms.get("amount"),
                "payer": payer,
                "payee": expected_terms.get("payee"),
                "network": expected_terms.get("network", {}),
                "payment_tx": {
                    "tx_hash": tx_hash,
                    "confirmed": bool(merged.get("confirmed", False)),
                    "block_height": merged.get("block_height"),
                    "block_time": merged.get("block_time"),
                },
                "http_402_context": expected_terms.get("http_402", {}),
                "facilitator": {
                    "id": facilitator.get("id") if isinstance(facilitator, dict) else None,
                    "scheme": facilitator.get("scheme") if isinstance(facilitator, dict) else None,
                    "signature_valid": fac_sig_ok if self.fac_hmac_secret else None,
                }
                if facilitator
                else None,
                "extensions": merged.get("extensions", {}) if isinstance(merged.get("extensions", {}), dict) else {},
            },
        }

        return PaymentVerificationResult(status="paid", verified_at=_utc_now_iso(), payment_fragment=fragment)
