# backend/timestamping.py

from datetime import datetime, timezone
from typing import Dict, Any


def timestamp_proof(packet: Dict[str, Any], provider: str = "local") -> Dict[str, Any]:
    """
    Attach simple ISO-8601 timestamps to the proof packet.
    Placeholder for future external / on-chain timestamp providers.
    """
    meta = packet.setdefault("meta", {})
    timestamps = meta.setdefault("timestamps", {})

    now = datetime.now(timezone.utc).isoformat()

    if provider == "local":
        timestamps.setdefault("local_received_utc", now)
        timestamps.setdefault("provider", "local")
        timestamps.setdefault("status", "ok")
    else:
        # Placeholder for future provider-specific logic
        timestamps.setdefault("provider", provider)
        timestamps.setdefault("status", "unimplemented")
        timestamps.setdefault("local_received_utc", now)

    return packet
