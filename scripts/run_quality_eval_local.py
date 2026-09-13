#!/usr/bin/env python3
"""Isolated production-build checks; real drafting requires --live + passed preflight.

Only live mode reads the explicitly scoped Railway drafting credential. It never
deploys, changes hosted state, or passes that credential to the frontend.
"""
from __future__ import annotations

import hashlib
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
PY = ROOT / '.venv/bin/python'
sys.path.insert(0, str(ROOT))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--preflight', type=Path)
    parser.add_argument('--audit-paid-entry', action='store_true')
    parser.add_argument('--case', choices=['all', 'consulting', 'saas'], default='all')
    args = parser.parse_args()
    if args.live and args.audit_paid_entry:
        raise RuntimeError('routing_audit_is_no_spend_only')
    files = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'], cwd=ROOT, text=True).splitlines()
    source_hashes = {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest()
        for name in files if not name.startswith('evals/commercial-readiness/results/') and (ROOT/name).is_file()}
    if args.live:
        if not args.preflight or json.loads((args.preflight/'status.json').read_text()).get('status') != 'PASS':
            raise RuntimeError('passing_no_spend_preflight_required')
        if json.loads((args.preflight/'identity.json').read_text()).get('source_files_sha256') != source_hashes:
            raise RuntimeError('source_changed_since_preflight')
    os.umask(0o077)
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
    family = 'quality-eval-live' if args.live else 'quality-eval-paid-entry-audit' if args.audit_paid_entry else 'quality-eval-preflight'
    out = ROOT / 'evals/commercial-readiness/results' / family / f'{stamp}-{os.getpid()}'
    out.mkdir(parents=True)
    print(f'result_dir={out}', flush=True)
    api, origin = 'http://127.0.0.1:4190', 'http://127.0.0.1:4191'
    # Do not inherit hosted billing/email/storage credentials. Local synthetic data.
    env = {k: v for k, v in os.environ.items() if k in {'PATH','HOME','TMPDIR','LANG','LC_ALL','SYSTEMROOT'}}
    data = out / 'data'
    data.mkdir()
    env.update({
        'CLAW_ENVIRONMENT': 'test', 'CLAW_NODE_MODE': 'api', 'CLAW_COMMERCIAL_MODE': '1',
        'CLAW_USAGE_ECONOMICS_ENABLED': '1', 'CLAW_STORAGE_BACKEND': 'local',
        'CLAW_DATA_DIR': str(data), 'CLAW_BLOB_ROOT': str(data/'blobs'),
        'CLAW_DOCUMENTS_DIR': str(data/'documents'), 'CLAW_RECEIPTS_DIR': str(data/'receipts'),
        'CLAW_ARTIFACT_REGISTRY_DB_PATH': str(data/'registry.sqlite3'),
        'CLAW_TIMELINE_DB_PATH': str(data/'timeline.sqlite3'),
        'CLAW_USAGE_ECONOMICS_DB_PATH': str(data/'usage.sqlite3'),
        'CLAW_ECONOMICS_DB_PATH': str(data/'economics.sqlite3'),
        'CLAW_VS01_COMPLETION_LEDGER_PATH': str(data/'completion.sqlite3'),
        'CLAW_ANON_SESSION_SECRET': 'synthetic-preflight-anon',
        'CLAW_AGREEMENT_SIGNING_TOKEN_SECRET': 'synthetic-preflight-sign',
        'CLAW_CORS_ALLOW_ORIGINS': origin, 'CLAW_LLM_ACCEPTANCE_STUB': '1',
        'OPENAI_API_KEY': 'sk-acceptance-stub-not-live',
        'SUPABASE_JWT_ISSUER': 'https://example.supabase.co/auth/v1',
        'SUPABASE_JWT_AUDIENCE': 'authenticated',
        'CORE_PAID_JOURNEY_RUNTIME_JSON': str(out/'runtime.json'),
        'CORE_PAID_JOURNEY_JWKS_DIR': str(out),
        'CLAW_JWT_ACCEPTANCE_JWKS_PATH': str(out/'acceptance-jwks.json'),
        'CORE_PAID_JOURNEY_LIVE_API': api, 'CORE_PAID_JOURNEY_LIVE_ORIGIN': origin,
        'CORE_PAID_JOURNEY_LIVE_OUTPUT': str(out/'playwright'),
        'VITE_CLAW_SUPPRESS_API_BASE_LOG': '1', 'VITE_CLAW_API_BASE': api,
        'VITE_SUPABASE_URL': api+'/__supabase', 'VITE_SUPABASE_ANON_KEY': 'synthetic-public-anon',
        'VITE_CLAW_FEATURE_SUPABASE_AUTH': '1',
        'QUALITY_EVAL_RESULT_DIR': str(out),
    })
    budget = None
    if args.live:
        # Read exactly the known staging service. Raw variable output never
        # reaches logs/files; only the drafting credential is passed to the API.
        provider = subprocess.run(['railway','variable','list','--project',
            '865aee06-0e3e-49f4-b954-b9670ba483eb','--service','claw-protocol',
            '--environment','staging','--json'], capture_output=True, text=True, timeout=30)
        if provider.returncode:
            raise RuntimeError('railway_read_failed_output_suppressed')
        values = json.loads(provider.stdout)
        if (not values.get('OPENAI_API_KEY') or values.get('CLAW_LLM_MODEL_PREMIUM') != 'gpt-5.4'
                or values.get('CLAW_LLM_MODEL_BASIC') != 'gpt-4o-mini'
                or values.get('OPENAI_BASE_URL', 'https://api.openai.com/v1').rstrip('/') != 'https://api.openai.com/v1'):
            raise RuntimeError('drafting_configuration_requires_review')
        from backend.quality_eval_budget import QualityEvalBudget
        ledger = ROOT / 'evals/commercial-readiness/results/quality-eval-approved-20260913.sqlite3'
        budget = QualityEvalBudget(ledger) if ledger.exists() else QualityEvalBudget.create(ledger, model='gpt-5.4')
        if budget.summary()['model'] != 'gpt-5.4' or budget.summary()['halted']:
            raise RuntimeError('approval_ledger_not_ready')
        env.update({'OPENAI_API_KEY': values['OPENAI_API_KEY'], 'CLAW_LLM_ACCEPTANCE_STUB': '0',
                    'CLAW_LLM_MODEL_PREMIUM': 'gpt-5.4', 'CLAW_LLM_MODEL_PREMIUM_REGEN': 'gpt-5.4',
                    'CLAW_LLM_MODEL_BASIC': values.get('CLAW_LLM_MODEL_BASIC', 'gpt-4o-mini'),
                    'CLAW_QUALITY_EVAL_BUDGET_PATH': str(ledger),
                    'CLAW_QUALITY_EVAL_LIVE': '1', 'QUALITY_EVAL_RESULT_DIR': str(out)})
        del values, provider
        print('live_model=gpt-5.4; approval_ceiling_usd=8; SDK retries disabled', flush=True)
    diff = subprocess.check_output(['git', 'diff', 'HEAD'], cwd=ROOT)
    identity = {'head': subprocess.check_output(['git','rev-parse','HEAD'], cwd=ROOT, text=True).strip(),
                'tracked_diff_sha256': hashlib.sha256(diff).hexdigest(),
                'frontend': 'production-build', 'repeats': 1 if args.live else 3,
                'viewports': ['desktop'] if args.live else ['desktop','mobile'],
                'retries': 0, 'model': 'gpt-5.4' if args.live else 'acceptance-stub', 'auth_provider': 'local-ES256/SDK-storage'}
    identity['selected_cases'] = ['consulting', 'saas'] if args.case == 'all' else [args.case]
    identity['source_files_sha256'] = source_hashes
    (out/'identity.json').write_text(json.dumps(identity, indent=2)+'\n')
    processes: list[subprocess.Popen] = []
    logs = []
    def run(name, args, cwd=ROOT, timeout=180):
        print(name, flush=True)
        with (out/f'{name}.log').open('w') as log:
            safe_env = {k:v for k,v in env.items() if k != 'OPENAI_API_KEY'} if cwd == ROOT/'frontend' else env
            p = subprocess.run([str(a) for a in args], cwd=cwd, env=safe_env, stdout=log,
                               stderr=subprocess.STDOUT, timeout=timeout)
        if p.returncode:
            raise RuntimeError(f'{name}_failed:{p.returncode}; see {out/name}.log')
    def start(name, args, cwd=ROOT):
        log = (out/f'{name}.log').open('w')
        logs.append(log)
        safe_env = {k:v for k,v in env.items() if k != 'OPENAI_API_KEY'} if cwd == ROOT/'frontend' else env
        p = subprocess.Popen([str(a) for a in args], cwd=cwd, env=safe_env, stdout=log,
                             stderr=subprocess.STDOUT, start_new_session=True)
        processes.append(p)
        return p
    def ready(url, process):
        for _ in range(60):
            if process.poll() is not None:
                raise RuntimeError('local_server_exited')
            try:
                with urlopen(url, timeout=1) as response:
                    if response.status == 200:
                        return
            except Exception:
                time.sleep(0.5)
        raise RuntimeError('local_server_not_ready')
    try:
        run('seed', [PY, 'scripts/seed_core_paid_journey_runtime.py'])
        run('typecheck', ['node_modules/.bin/tsc', '-b'], ROOT/'frontend')
        run('build', ['node_modules/.bin/vite', 'build'], ROOT/'frontend')
        server = start('api', [PY, '-m', 'uvicorn', 'backend.main:app', '--host','127.0.0.1', '--port','4190','--log-level','warning'])
        ready(api+'/api/agreements/access/policy', server)
        frontend = start('preview', ['node_modules/.bin/vite','preview','--host','127.0.0.1','--port','4191','--strictPort'], ROOT/'frontend')
        ready(origin, frontend)
        if args.live:
            case_filter = [] if args.case == 'all' else ['--grep', f'real drafting: {args.case}$']
            run('browser', ['node_modules/.bin/playwright','test','--config','playwright.quality-eval.config.ts',
                'qualityEvalDrafts.live.spec.ts','--project=desktop','--workers=1','--retries=0','--max-failures=1','--reporter=line', *case_filter],
                ROOT/'frontend', timeout=660)
            print('live_browser=PASS; independent human document review still required', flush=True)
            (out/'status.json').write_text(json.dumps({'status':'DRAFT_BROWSER_PASS',
                'cases': identity['selected_cases'],
                'quality_review':'pending','recipient_paths':'not_yet_exercised'})+'\n')
        elif args.audit_paid_entry:
            run('browser', ['node_modules/.bin/playwright','test','--config','playwright.quality-eval.config.ts',
                'qualityEvalPaidEntry.audit.spec.ts','--project=desktop','--workers=1','--retries=0','--reporter=line'],
                ROOT/'frontend', timeout=100)
            (out/'status.json').write_text(json.dumps({'status':'PAID_ENTRY_AUDIT_PASS','model_calls':0})+'\n')
        else:
            run('browser', ['node_modules/.bin/playwright','test','--config','playwright.quality-eval.config.ts',
                        'qualityEvalPreflight.spec.ts','phase4b2RecipientSigning.spec.ts',
                        '--grep','quality preflight|retryable network failure',
                        '--workers=1','--retries=0','--repeat-each=3','--reporter=line'],
                ROOT/'frontend', timeout=360)
            (out/'status.json').write_text(json.dumps({'status': 'PASS', 'checks': 12, 'model_calls': 0})+'\n')
            print('preflight=PASS (12 checks; no live model)', flush=True)
        return 0
    finally:
        for p in reversed(processes):
            if p.poll() is None:
                os.killpg(p.pid, signal.SIGTERM)
                try:
                    p.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(p.pid, signal.SIGKILL)
                    p.wait(timeout=5)
        for log in logs:
            log.close()
        if budget:
            (out/'budget-summary.json').write_text(json.dumps(budget.summary(), indent=2)+'\n')
            print(json.dumps(budget.summary()), flush=True)


if __name__ == '__main__':
    raise SystemExit(main())
