"""Mint a sign-mode recipient token for VS01 public packet GETs."""

from backend.config.agreement_signing_token import resolve_signing_token_secret_raw
from backend.security.recipient_access_token import mint_recipient_access_token


def mint_vs01_packet_sign_token(agreement_id: str, participant_id: str = "p_cp") -> str:
    return mint_recipient_access_token(
        secret=resolve_signing_token_secret_raw().encode("utf-8"),
        agreement_id=agreement_id,
        locked_version_id="v1",
        mode="sign",
        role="signer",
        ttl_seconds=3600,
        recipient_party_id=participant_id,
    )
