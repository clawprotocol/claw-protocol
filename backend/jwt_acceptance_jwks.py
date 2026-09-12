"""Test-only JWKS fetch stub for isolated Core Paid Journey acceptance.

Activated only when CLAW_ENVIRONMENT is local/dev/test AND
CLAW_JWT_ACCEPTANCE_JWKS_PATH points at a local JWKS document.

This mocks the external Supabase JWKS boundary. Production never honors it.
Commercial mode still requires ES256; HS256 stays impossible.
"""

from __future__ import annotations

import base64
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

ACCEPTANCE_KID = "core-paid-journey-es256"
DEFAULT_ISSUER = "https://example.supabase.co/auth/v1"
DEFAULT_AUDIENCE = "authenticated"


def acceptance_jwks_enabled() -> bool:
    env = (os.getenv("CLAW_ENVIRONMENT") or "").strip().lower()
    if env not in {"test", "local", "dev"}:
        return False
    return bool((os.getenv("CLAW_JWT_ACCEPTANCE_JWKS_PATH") or "").strip())


def _b64url_uint(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _public_jwk(private_key: ec.EllipticCurvePrivateKey, *, kid: str) -> Dict[str, Any]:
    pub = private_key.public_key().public_numbers()
    return {
        "kty": "EC",
        "crv": "P-256",
        "alg": "ES256",
        "use": "sig",
        "kid": kid,
        "x": _b64url_uint(pub.x.to_bytes(32, "big")),
        "y": _b64url_uint(pub.y.to_bytes(32, "big")),
    }


def write_acceptance_jwks_bundle(directory: Path) -> Dict[str, str]:
    """Write a reusable P-256 JWKS + PKCS8 PEM for the isolated gate."""
    directory.mkdir(parents=True, exist_ok=True)
    pem_path = directory / "acceptance-es256.pem"
    jwks_path = directory / "acceptance-jwks.json"
    if pem_path.is_file() and jwks_path.is_file():
        return {"jwks_path": str(jwks_path), "pem_path": str(pem_path), "kid": ACCEPTANCE_KID}
    key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    pem_path.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    jwks_path.write_text(
        json.dumps({"keys": [_public_jwk(key, kid=ACCEPTANCE_KID)]}, indent=2) + "\n",
        encoding="utf-8",
    )
    return {"jwks_path": str(jwks_path), "pem_path": str(pem_path), "kid": ACCEPTANCE_KID}


def load_acceptance_private_key(pem_path: Path) -> ec.EllipticCurvePrivateKey:
    loaded = serialization.load_pem_private_key(pem_path.read_bytes(), password=None)
    if not isinstance(loaded, ec.EllipticCurvePrivateKey):
        raise ValueError("acceptance_jwks_pem_not_ec")
    return loaded


def mint_acceptance_es256_jwt(
    sub: str,
    *,
    pem_path: Path,
    issuer: str = DEFAULT_ISSUER,
    audience: str = DEFAULT_AUDIENCE,
    ttl_seconds: int = 8 * 3600,
    extra: Optional[Dict[str, Any]] = None,
) -> str:
    import jwt as pyjwt

    key = load_acceptance_private_key(pem_path)
    now = int(time.time())
    payload: Dict[str, Any] = {
        "sub": sub,
        "iss": issuer,
        "aud": audience,
        "iat": now,
        "exp": now + max(60, int(ttl_seconds)),
    }
    if extra:
        payload.update(extra)
    return pyjwt.encode(
        payload,
        key,
        algorithm="ES256",
        headers={"alg": "ES256", "typ": "JWT", "kid": ACCEPTANCE_KID},
    )


def install_acceptance_jwks_fetch_if_configured() -> bool:
    """Replace JWKS HTTP fetch with the local document. No-op outside test env."""
    if not acceptance_jwks_enabled():
        return False
    path = Path(os.environ["CLAW_JWT_ACCEPTANCE_JWKS_PATH"].strip())
    doc = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(doc, dict) or not doc.get("keys"):
        raise ValueError("acceptance_jwks_invalid")
    import backend.security.supabase_jwt as jwt_mod

    jwt_mod._fetch_jwks_document = lambda _url: doc  # type: ignore[method-assign]
    jwt_mod.reset_supabase_jwks_cache_for_tests()
    return True
