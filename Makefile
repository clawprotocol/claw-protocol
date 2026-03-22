.PHONY: bootstrap test test-backend dev validate

bootstrap:
	@bash scripts/bootstrap.sh

test:
	@bash scripts/test.sh

test-backend:
	@python3 -m pytest -q backend/tests

dev:
	@bash scripts/dev.sh

dev-install:
	@uv pip install -e ".[dev]"

validate:
	@bash -eu -o pipefail -c '\
		echo "==> CLAW validate: backend syntax"; \
		python3 -m py_compile backend/main.py backend/routers/agreements_api.py backend/routers/agreements_v2_api.py; \
		if command -v ruff >/dev/null 2>&1 && ( [ -f ruff.toml ] || [ -f .ruff.toml ] || ( [ -f pyproject.toml ] && grep -q "\\[tool\\.ruff\\]" pyproject.toml ) ); then \
			echo "==> CLAW validate: ruff"; \
			ruff check .; \
		else \
			echo "==> CLAW validate: ruff (skipped: not installed or not configured)"; \
		fi; \
		if command -v mypy >/dev/null 2>&1 && ( [ -f mypy.ini ] || [ -f .mypy.ini ] || [ -f setup.cfg ] || ( [ -f pyproject.toml ] && grep -q "\\[tool\\.mypy\\]" pyproject.toml ) ); then \
			echo "==> CLAW validate: mypy"; \
			mypy backend; \
		else \
			echo "==> CLAW validate: mypy (skipped: not installed or not configured)"; \
		fi; \
		echo "==> CLAW validate: pytest"; \
		bash scripts/test.sh; \
		if [ -f frontend/package.json ]; then \
			echo "==> CLAW validate: frontend build"; \
			npm --prefix frontend run build; \
		else \
			echo "==> CLAW validate: frontend build (skipped: frontend/package.json missing)"; \
		fi; \
		echo "==> CLAW validate: OK"; \
	'
