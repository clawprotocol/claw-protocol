"""Replay captured live Harbor LLM bodies through the production path.

This is not a provider call and not fresh-model evidence. Production never
honors the replay directory. SaaS falls through to the acceptance stub.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

HARBOR = "Harbor Peak Analytics LLC"
IRONVALE = "Ironvale Manufacturing Inc"
REPLAY_ENV = "QUALITY_EVAL_REPLAY_LIVE_DIR"
DEFAULT_LIVE_DIR = Path("evals/commercial-readiness/results/quality-eval-live/20260914T195201Z-5037")


def live_replay_enabled() -> bool:
    env = (os.getenv("CLAW_ENVIRONMENT") or "").strip().lower()
    if env not in {"test", "local", "dev"}:
        return False
    return bool((os.getenv(REPLAY_ENV) or "").strip())


def replay_dir() -> Optional[Path]:
    raw = (os.getenv(REPLAY_ENV) or "").strip()
    if not raw:
        return None
    path = Path(raw)
    return path if path.is_dir() else None


def _joined(messages: List[Dict[str, Any]]) -> str:
    return "\n".join(str(row.get("content") or "") for row in messages or [])


def _is_harbor(text: str) -> bool:
    return HARBOR in text and IRONVALE in text


def _is_saas(text: str) -> bool:
    return "Orion Harbor LLC" in text and "Northwind Retail Inc" in text


@lru_cache(maxsize=4)
def _load_endpoints(dir_key: str) -> List[Dict[str, Any]]:
    path = Path(dir_key) / "consulting-desktop-model-endpoints.json"
    if not path.is_file():
        return []
    raw = json.loads(path.read_text())
    return raw if isinstance(raw, list) else []


def _harbor_parse_draft(premium: bool) -> Optional[Dict[str, Any]]:
    root = replay_dir()
    if root is None:
        return None
    wanted = "premium" if premium else "basic"
    for row in _load_endpoints(str(root)):
        if row.get("path") != "/api/agreements/parse":
            continue
        request = row.get("request") or {}
        if request.get("ai_model_class") != wanted:
            continue
        body = row.get("body") or {}
        draft = body.get("draft")
        if not isinstance(draft, dict):
            continue
        extract = body.get("extract") if isinstance(body.get("extract"), dict) else {}
        payload = {
            "title": draft.get("title"),
            "jurisdiction": draft.get("jurisdiction"),
            "parties": draft.get("parties") or [],
            "purpose": draft.get("purpose"),
            "payment_terms": draft.get("payment_terms"),
            "duration": draft.get("duration"),
            "due_date": draft.get("due_date"),
            "effective_date": draft.get("effective_date"),
            "material_asks": extract.get("material_asks") or [],
            "agreement_family_hint": extract.get("agreement_family_hint"),
            "confidence": extract.get("confidence"),
        }
        return payload
    return None


def _harbor_premium_body() -> Optional[Dict[str, Any]]:
    root = replay_dir()
    if root is None:
        return None
    for row in _load_endpoints(str(root)):
        if row.get("path") != "/api/agreements/premium-full-draft":
            continue
        body = row.get("body")
        if isinstance(body, dict) and body.get("document_text"):
            return body
    premium_path = root / "consulting-desktop-premium-result.json"
    if premium_path.is_file():
        body = json.loads(premium_path.read_text())
        if isinstance(body, dict) and body.get("document_text"):
            return body
    return None


def replay_legal_llm_completion(
    messages: List[Dict[str, Any]],
    *,
    call_purpose: Optional[str] = None,
) -> Optional[str]:
    """Return a captured Harbor body, or None to use the stub / live path."""
    if not live_replay_enabled():
        return None
    text = _joined(messages)
    if _is_saas(text) or not _is_harbor(text):
        return None
    purpose = (call_purpose or "").strip().lower()
    if purpose == "structured_extraction":
        premium = "premium" in text.lower()
        draft = _harbor_parse_draft(premium)
        return json.dumps(draft) if draft else None
    if purpose in {"agreement_drafting", "conditional_repair", "explicit_revision"}:
        body = _harbor_premium_body()
        if not body:
            return None
        current = ""
        for row in reversed(list(messages or [])):
            raw = str(row.get("content") or "")
            if raw.startswith("{"):
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    parsed = {}
                if isinstance(parsed, dict):
                    current = str(parsed.get("current_document_text") or parsed.get("document_text") or "")
                    if current:
                        break
        document = current if current and purpose in {"conditional_repair", "explicit_revision"} else str(
            body.get("document_text") or ""
        )
        return json.dumps(
            {
                "title": body.get("title") or "Consulting Services Agreement",
                "agreement_family": body.get("agreement_family") or "services_agreement",
                "document_text": document,
                "authoritative_draft": document,
                "updated_document_text": document,
                "key_terms_found": body.get("key_terms_found") or [],
                "missing_material_info": body.get("missing_material_info") or [],
            }
        )
    return None
