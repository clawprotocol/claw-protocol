.PHONY: bootstrap test test-backend dev validate deploy-smoke

bootstrap:
	@bash scripts/bootstrap.sh

test:
	@bash scripts/test.sh

test-backend:
	@python3 -m pytest -q backend/tests

dev:
	@bash scripts/dev.sh

deploy-smoke:
	@python3 scripts/deploy_smoke.py

dev-install:
	@uv pip install -e ".[dev]"

validate:
	@bash -eu -o pipefail -c '\
		echo "==> CLAW validate: backend syntax"; \
		python3 -m py_compile backend/main.py backend/routers/agreements_api.py backend/routers/agreements_v2_api.py \
			backend/routers/compliance_api.py \
			backend/routers/client_events_api.py \
			backend/routers/transcription_hero_api.py \
			backend/compliance/disclosure_registry.py backend/compliance/acknowledgement_store.py \
			backend/routers/economics_v1_api.py \
			backend/economics/store.py backend/economics/events.py backend/economics/hooks.py backend/economics/config.py \
			backend/billing/pricing.py backend/billing/subscriptions.py backend/billing/usage_metering.py \
			backend/billing/receipts.py backend/billing/usage_receipt_service.py \
			backend/verification/usage_bundle.py \
			backend/proof/receipt.py \
			backend/handlers/verify_handler.py \
			backend/affiliates/service.py backend/affiliates/payouts.py backend/affiliates/referrals.py \
			backend/payments/service.py backend/payments/store.py backend/payments/canon_events.py backend/payments/config.py \
			backend/payments/webhooks.py backend/payments/reconciliation.py backend/payments/reserve_job.py \
			backend/payments/adapters/coinbase_adapter.py backend/payments/adapters/ramp_adapter.py backend/payments/adapters/paynow_adapter.py \
			backend/models/onramp_events.py backend/models/usage_receipt.py; \
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
