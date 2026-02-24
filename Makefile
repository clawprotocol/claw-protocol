.PHONY: bootstrap test test-backend dev

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
