# backend/versioning.py

SCHEMA_VERSION = "claw-v0.1.0"


def get_schema_version() -> str:
    """Single place to bump schema / protocol version."""
    return SCHEMA_VERSION
