from __future__ import annotations

from typing import Dict

_COUNTERS: Dict[str, int] = {
    "requests_total": 0,
    "rate_limited_total": 0,
    "verify_upload_rejected_total": 0,
}


def inc(name: str, value: int = 1) -> None:
    if name not in _COUNTERS:
        _COUNTERS[name] = 0
    _COUNTERS[name] += int(value)


def get_all() -> Dict[str, int]:
    return dict(_COUNTERS)
