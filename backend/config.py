import os

# ---- Core limits (safe defaults for local dev) ----

# Max clauses we’ll clean synchronously for a “PUBLIC” role
MAX_CLAUSES_SYNC = int(os.getenv("CLAW_MAX_CLAUSES_SYNC", "400"))

# How many clauses to process per batch
CLEAN_BATCH_SIZE = int(os.getenv("CLAW_CLEAN_BATCH_SIZE", "100"))

# Rough safety cap on total characters in all clauses
MAX_TOTAL_CHARS = int(os.getenv("CLAW_MAX_TOTAL_CHARS", "200000"))

# Hard timeout guard for the cleaning loop (seconds)
REQUEST_TIMEOUT_SECONDS = int(os.getenv("CLAW_CLEAN_TIMEOUT_SECONDS", "60"))

# ---- Role / priority multipliers ----
# You can tune these via env later to favor Lawyer-DAO, Node-DAO, etc.

DEFAULT_ROLE = "PUBLIC"

ROLE_LIMIT_MULTIPLIERS = {
    # Lawyers get up to 3× the public limits
    "LAWYER_DAO": float(os.getenv("CLAW_ROLE_MULTIPLIER_LAWYER_DAO", "3.0")),
    # Nodes maybe 2× (for later “GPU queue” / infra roles)
    "NODE_DAO": float(os.getenv("CLAW_ROLE_MULTIPLIER_NODE_DAO", "2.0")),
    # Public default
    "PUBLIC": float(os.getenv("CLAW_ROLE_MULTIPLIER_PUBLIC", "1.0")),
}
