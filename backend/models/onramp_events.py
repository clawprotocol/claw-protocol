"""Typed shapes for crypto onramp ledger events (documentation; source of truth is ``canon_events``)."""

from __future__ import annotations

from typing import Literal, TypedDict


class PaymentReceivedEvent(TypedDict):
    type: Literal["PaymentReceived"]
    payment_id: str
    provider: str
    amount_usd: str
    currency: str


class CryptoReceivedEvent(TypedDict):
    type: Literal["CryptoReceived"]
    payment_id: str
    tx_hash: str
    amount_usd: str
    currency: str


class ReserveAllocatedEvent(TypedDict):
    type: Literal["ReserveAllocated"]
    payment_id: str
    org_id: str
    amount_usd: str
    currency: str


class ClawKeyIssuedEvent(TypedDict):
    type: Literal["ClawKeyIssued"]
    org_id: str
    payment_id: str
    keys: int


class ReserveReleasedEvent(TypedDict):
    type: Literal["ReserveReleased"]
    reserve_id: str
