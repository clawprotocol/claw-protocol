import os
import tempfile

# Ensure env is set before importing backend.main in tests
_db_dir = tempfile.mkdtemp(prefix="claw_db_")
os.environ["CLAW_TIMELINE_DB_PATH"] = os.path.join(_db_dir, "timeline.sqlite3")
os.environ.setdefault("CLAW_NODE_MODE", "api")
