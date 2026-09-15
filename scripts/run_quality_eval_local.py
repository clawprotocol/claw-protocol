#!/usr/bin/env python3
"""Isolated production-build checks; real drafting requires --live + passed preflight.

--offline-journey exercises Harbor + SaaS through production draft/Apply/GET/reopen.
Harbor may replay captured live parse/premium bodies; SaaS stays on the acceptance
stub. Neither is a live-quality pass.

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
    parser.add_argument('--offline-journey', action='store_true')
    parser.add_argument('--preflight', type=Path)
    parser.add_argument('--offline-journey-evidence', type=Path)
    parser.add_argument('--filled-only', action='store_true')
    parser.add_argument(
        '--replay-live-evidence',
        type=Path,
        help='Captured live result dir. Offline Harbor parse/draft replay only; not a provider call.',
    )
    parser.add_argument('--increment-policy', type=Path,
                        help='Increment sidecar to select. Defaults to the committed inactive policy.')
    parser.add_argument('--authorize-increment', action='store_true',
                        help='Required with an active authorized policy copy. Does not flip the committed sidecar.')
    parser.add_argument('--audit-paid-entry', action='store_true')
    parser.add_argument(
        '--case',
        choices=['all', 'consulting', 'saas', 'three_party', 'four_party', 'release_scope'],
        default='all',
        help='all keeps the Harbor+SaaS pair. release_scope is the four-sample campaign.',
    )
    args = parser.parse_args()
    if args.live and args.audit_paid_entry:
        raise RuntimeError('routing_audit_is_no_spend_only')
    if args.offline_journey and (args.live or args.audit_paid_entry):
        raise RuntimeError('offline_journey_is_no_spend_only')
    # Three-/four-party offline now uses the local acceptance stub (not live replay).
    # --case all remains the Harbor + SaaS rematch pair.
    if args.replay_live_evidence and args.live:
        raise RuntimeError('live_replay_is_no_spend_only')
    from backend.quality_eval_live_prepare import (
        DEFAULT_INACTIVE_POLICY,
        assert_live_provider_may_be_contacted,
        prepare_authorized_live_boundary,
        product_source_hashes,
        resolve_increment_selection,
        retrieve_live_drafting_credentials,
    )
    source_hashes = product_source_hashes(ROOT)
    increment_selection = resolve_increment_selection(
        args.increment_policy or DEFAULT_INACTIVE_POLICY,
        authorize=bool(args.authorize_increment),
    )
    if args.live:
        if not args.preflight or json.loads((args.preflight/'status.json').read_text()).get('status') != 'PASS':
            raise RuntimeError('passing_no_spend_preflight_required')
        if json.loads((args.preflight/'identity.json').read_text()).get('source_files_sha256') != source_hashes:
            raise RuntimeError('source_changed_since_preflight')
        if not args.offline_journey_evidence:
            raise RuntimeError('matching_offline_journey_evidence_required')
        offline_status = json.loads((args.offline_journey_evidence/'status.json').read_text())
        if offline_status.get('status') != 'OFFLINE_JOURNEY_PASS':
            raise RuntimeError('matching_offline_journey_evidence_required')
        if json.loads((args.offline_journey_evidence/'identity.json').read_text()).get('source_files_sha256') != source_hashes:
            raise RuntimeError('source_changed_since_offline_journey')
        try:
            assert_live_provider_may_be_contacted(increment_selection)
        except Exception as exc:
            raise RuntimeError(str(exc) or 'increment_not_authorized') from exc
    os.umask(0o077)
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
    family = (
        'quality-eval-live' if args.live else
        'quality-eval-offline-journey' if args.offline_journey else
        'quality-eval-paid-entry-audit' if args.audit_paid_entry else
        'quality-eval-preflight'
    )
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
        'QUALITY_EVAL_CASE': args.case,
    })
    replay_dir = None
    if args.offline_journey:
        env['QUALITY_EVAL_OFFLINE_JOURNEY'] = '1'
        # Harbor replay is Harbor-only. Three-/four-party offline uses the stub.
        attach_harbor_replay = args.case in {'all', 'consulting', 'release_scope'}
        default_replay = ROOT / 'evals/commercial-readiness/results/quality-eval-live/20260914T195201Z-5037'
        replay_dir = args.replay_live_evidence or (default_replay if attach_harbor_replay and default_replay.is_dir() else None)
        if replay_dir:
            if not (replay_dir / 'consulting-desktop-model-endpoints.json').is_file():
                raise RuntimeError('replay_live_evidence_missing_harbor_endpoints')
            env['QUALITY_EVAL_REPLAY_LIVE_DIR'] = str(replay_dir.resolve())
    if args.filled_only or args.live or args.case in {'three_party', 'four_party', 'release_scope'}:
        env['QUALITY_EVAL_FILLED_ONLY'] = '1'
    env['CLAW_QUALITY_EVAL_INCREMENT_PATH'] = increment_selection['path']
    budget = None
    if args.live:
        # Authorization is checked before any credential retrieval.
        try:
            assert_live_provider_may_be_contacted(increment_selection)
        except Exception as exc:
            raise RuntimeError(str(exc) or 'increment_not_authorized') from exc
        ledger = ROOT / 'evals/commercial-readiness/results/quality-eval-approved-20260913.sqlite3'
        prepared = prepare_authorized_live_boundary(
            selection=increment_selection,
            ledger_path=ledger,
            retrieve=retrieve_live_drafting_credentials,
        )
        budget = prepared['budget']
        if budget.summary()['model'] != 'gpt-5.4' or budget.summary()['halted']:
            raise RuntimeError('approval_ledger_not_ready')
        creds = prepared['credentials']
        env.update({'OPENAI_API_KEY': creds['OPENAI_API_KEY'], 'CLAW_LLM_ACCEPTANCE_STUB': '0',
                    'CLAW_LLM_MODEL_PREMIUM': 'gpt-5.4', 'CLAW_LLM_MODEL_PREMIUM_REGEN': 'gpt-5.4',
                    'CLAW_LLM_MODEL_BASIC': creds.get('CLAW_LLM_MODEL_BASIC', 'gpt-4o-mini'),
                    'CLAW_QUALITY_EVAL_BUDGET_PATH': str(ledger),
                    'CLAW_QUALITY_EVAL_INCREMENT_PATH': increment_selection['path'],
                    'CLAW_QUALITY_EVAL_LIVE': '1', 'QUALITY_EVAL_FILLED_ONLY': '1',
                    'QUALITY_EVAL_RESULT_DIR': str(out),
                    # TRACE is metadata-only (hashes/lengths). Restricted rejected-paper
                    # capture requires TRACE+DUMP+matching eval auth; never enable DUMP here.
                    'CLAW_DRAFT_QUALITY_TRACE': '1'})
        if (os.environ.get('CLAW_DRAFT_QUALITY_TRACE_DUMP') or '').strip() in {'1', 'true', 'yes', 'on'}:
            auth = (os.environ.get('CLAW_DRAFT_QUALITY_EVAL_AUTH') or '').strip()
            expected = (os.environ.get('CLAW_DRAFT_QUALITY_EVAL_AUTH_EXPECTED') or '').strip()
            if auth and expected and auth == expected:
                env['CLAW_DRAFT_QUALITY_TRACE_DUMP'] = '1'
                env['CLAW_DRAFT_QUALITY_EVAL_AUTH'] = auth
                env['CLAW_DRAFT_QUALITY_EVAL_AUTH_EXPECTED'] = expected
                dump_dir = (os.environ.get('CLAW_DRAFT_QUALITY_TRACE_DIR') or '').strip()
                if dump_dir:
                    env['CLAW_DRAFT_QUALITY_TRACE_DIR'] = dump_dir
        print(
            f"live_model=gpt-5.4; increment_authorized={increment_selection['authorized']}; "
            f"increment_active={increment_selection['active']}; leftover one-pager excluded; SDK retries disabled",
            flush=True,
        )
    diff = subprocess.check_output(['git', 'diff', 'HEAD'], cwd=ROOT)
    identity = {'head': subprocess.check_output(['git','rev-parse','HEAD'], cwd=ROOT, text=True).strip(),
                'tracked_diff_sha256': hashlib.sha256(diff).hexdigest(),
                'frontend': 'production-build',
                'repeats': 1 if args.live or args.offline_journey else 3,
                'viewports': ['desktop', 'mobile'],
                'retries': 0,
                'model': 'gpt-5.4' if args.live else 'acceptance-stub',
                'harbor_evidence': (
                    'not_exercised' if args.case in {'saas', 'three_party', 'four_party'} else
                    'live-replay' if replay_dir else ('live-model' if args.live else 'acceptance-stub')
                ),
                'saas_evidence': (
                    'not_exercised' if args.case in {'consulting', 'three_party', 'four_party'} else
                    'acceptance-stub' if args.offline_journey else ('live-model' if args.live else 'acceptance-stub')
                ),
                'three_party_evidence': (
                    'acceptance-stub' if args.case in {'three_party', 'release_scope'} else 'not_exercised'
                ),
                'four_party_evidence': (
                    'acceptance-stub' if args.case in {'four_party', 'release_scope'} else 'not_exercised'
                ),
                'replay_boundary': (
                    'captured Harbor parse + premium-full-draft bodies; frontend transforms, date/payment guards, display, Apply, GET, and reopen are current product code'
                    if replay_dir else None
                ),
                'replay_live_dir': str(replay_dir) if replay_dir else None,
                'auth_provider': 'local-ES256/SDK-storage',
                'filled_only': bool(args.filled_only or args.live),
                'increment_policy': increment_selection['basename'],
                'increment_policy_sha256': increment_selection['policy_sha256'],
                'increment_active': increment_selection['active'],
                'increment_authorized': increment_selection['authorized'],
                'increment_reason': increment_selection['reason'],
                'independent_model_samples': (
                    4 if args.live and args.case == 'release_scope' else
                    2 if args.live and args.case == 'all' else
                    (1 if args.live else 0)
                ),
                'mode': 'live' if args.live else 'offline-journey' if args.offline_journey else 'audit' if args.audit_paid_entry else 'preflight'}
    identity['selected_cases'] = (
        ['consulting', 'saas', 'three_party', 'four_party'] if args.case == 'release_scope' else
        ['consulting', 'saas'] if args.case == 'all' else
        [args.case]
    )
    identity['source_files_sha256'] = source_hashes
    if args.live:
        identity['viewports'] = ['desktop']
        identity['reopen_viewports'] = ['desktop', 'mobile']
        identity['sample_limitation'] = (
            'four filled release-scope cases; not arbitrary-input proof'
            if args.case == 'release_scope' else
            'two filled cases only; not arbitrary-input proof'
        )
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
            case_filter = [] if args.case in {'all', 'release_scope'} else ['--grep', f'real drafting: {args.case}$']
            run('browser-samples', ['node_modules/.bin/playwright','test','--config','playwright.quality-eval.config.ts',
                'qualityEvalDrafts.live.spec.ts','--project=desktop','--workers=1','--retries=0','--max-failures=1','--reporter=line', *case_filter],
                ROOT/'frontend', timeout=1800 if args.case == 'release_scope' else 900)
            env['QUALITY_EVAL_REOPEN_ONLY'] = '1'
            run('browser-reopen', ['node_modules/.bin/playwright','test','--config','playwright.quality-eval.config.ts',
                'qualityEvalDrafts.live.spec.ts','--grep','reopen saved samples','--workers=1','--retries=0','--max-failures=1','--reporter=line'],
                ROOT/'frontend', timeout=900 if args.case == 'release_scope' else 600)
            print(
                'live_browser=PASS; selected_cases='
                + ','.join(identity['selected_cases'])
                + '; independent human document review still required',
                flush=True,
            )
            recipient_paths = []
            for name in sorted(p.name for p in out.glob('*-continuation.json')):
                row = json.loads((out / name).read_text())
                recipient_paths.append({
                    'file': name,
                    'case_id': row.get('case_id'),
                    'viewport': row.get('viewport'),
                    'recipient_path': row.get('recipient_path'),
                    'stage': row.get('stage'),
                    'receipt_id': row.get('receipt_id'),
                })
            exercised = [row['recipient_path'] for row in recipient_paths if row.get('recipient_path') and row['recipient_path'] != 'not_yet_exercised']
            (out/'status.json').write_text(json.dumps({
                'status': 'DRAFT_BROWSER_PASS',
                'cases': identity['selected_cases'],
                'independent_model_samples': identity['independent_model_samples'],
                'quality_review': 'pending',
                'recipient_paths': exercised or 'not_yet_exercised',
                'recipient_path_records': recipient_paths,
                'live_quality': 'not_claimed',
                'sample_limitation': identity['sample_limitation'],
            })+'\n')
        elif args.offline_journey:
            case_filter = [] if args.case in {'all', 'release_scope'} else ['--grep', f'real drafting: {args.case}$']
            browser_timeout = 2400 if args.case in {'four_party', 'three_party', 'release_scope'} else 1500
            run('browser', ['node_modules/.bin/playwright','test','--config','playwright.quality-eval.config.ts',
                'qualityEvalDrafts.live.spec.ts','--workers=1','--retries=0','--max-failures=1','--reporter=line', *case_filter],
                ROOT/'frontend', timeout=browser_timeout)
            recipient_paths = []
            for name in sorted(p.name for p in out.glob('*-continuation.json')):
                row = json.loads((out / name).read_text())
                recipient_paths.append({
                    'file': name,
                    'case_id': row.get('case_id'),
                    'viewport': row.get('viewport'),
                    'recipient_path': row.get('recipient_path'),
                    'stage': row.get('stage'),
                    'receipt_id': row.get('receipt_id'),
                })
            exercised = [row['recipient_path'] for row in recipient_paths if row.get('recipient_path') and row['recipient_path'] != 'not_yet_exercised']
            print(
                'offline_journey=PASS; selected_cases='
                + ','.join(identity['selected_cases'])
                + '; not fresh-model evidence; live quality not claimed',
                flush=True,
            )
            (out/'status.json').write_text(json.dumps({
                'status': 'OFFLINE_JOURNEY_PASS',
                'cases': identity['selected_cases'],
                'viewports': ['desktop', 'mobile'],
                'model_calls': 0,
                'harbor_evidence': identity.get('harbor_evidence'),
                'saas_evidence': identity.get('saas_evidence'),
                'three_party_evidence': identity.get('three_party_evidence'),
                'four_party_evidence': identity.get('four_party_evidence'),
                'replay_boundary': identity.get('replay_boundary'),
                'live_quality': 'not_claimed',
                'fresh_model_quality': 'unverified',
                'manual_edit_recovery': 'unverified',
                'recipient_paths': exercised or 'not_yet_exercised',
                'recipient_path_records': recipient_paths,
            })+'\n')
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
