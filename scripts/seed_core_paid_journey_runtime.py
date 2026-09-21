#!/usr/bin/env python3
"""Seed Pro entitlement and a local ES256 owner JWT for Core Paid Journey live acceptance."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.jwt_acceptance_jwks import (
    DEFAULT_AUDIENCE,
    DEFAULT_ISSUER,
    mint_acceptance_es256_jwt,
    write_acceptance_jwks_bundle,
)
from backend.tests.entitlement_test_support import ensure_org_pro_entitlement

OWNER_ID = os.environ.get("CORE_PAID_JOURNEY_OWNER_ID", "core-paid-owner")
ORG_ID = os.environ.get("CORE_PAID_JOURNEY_ORG_ID", f"user-{OWNER_ID}")
ISSUER = os.environ.get("SUPABASE_JWT_ISSUER", DEFAULT_ISSUER)
OUT = Path(os.environ["CORE_PAID_JOURNEY_RUNTIME_JSON"])
JWKS_DIR = Path(os.environ.get("CORE_PAID_JOURNEY_JWKS_DIR") or OUT.parent)


def main() -> None:
    bundle = write_acceptance_jwks_bundle(JWKS_DIR)
    os.environ["CLAW_JWT_ACCEPTANCE_JWKS_PATH"] = bundle["jwks_path"]
    ensure_org_pro_entitlement(ORG_ID, user_id=OWNER_ID)
    token = mint_acceptance_es256_jwt(
        OWNER_ID,
        pem_path=Path(bundle["pem_path"]),
        issuer=ISSUER,
        audience=DEFAULT_AUDIENCE,
        extra={"email": "core.paid.owner@lawdog.test"},
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "owner_id": OWNER_ID,
                "org_id": ORG_ID,
                "access_token": token,
                "email": "core.paid.owner@lawdog.test",
                "jwks_path": bundle["jwks_path"],
                "kid": bundle["kid"],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(OUT)
    print(bundle["jwks_path"])


if __name__ == "__main__":
    main()
