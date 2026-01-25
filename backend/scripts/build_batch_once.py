#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from backend.utils.timeline_store import TimelineStore

def main() -> None:
    network = os.getenv("CLAW_NETWORK", "bitcoin-mainnet")
    protocol_version = os.getenv("CLAW_PROTOCOL_VERSION", "CLAW-PROOF-v1")

    store = TimelineStore()
    out = store.build_next_batch(network=network, protocol_version=protocol_version, limit=5000)

    # keep output tiny
    print(json.dumps(out, indent=2, sort_keys=True))

if __name__ == "__main__":
    main()
