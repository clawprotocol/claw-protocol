import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCorePaidJourneyRuntime } from './corePaidJourneyLiveAuth';
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from '../../src/launch/corePaidJourneyAcceptanceMatrix';

// Diagnostic regression: ordinary basic parse succeeds against the production
// handler's acceptance stub. Premium parse is held in-flight (not failed).
// This isolates premature success paint from the live eval's blocked basic call.
test('paid entry inventory: basic bootstrap then premium, without premature success', async ({ page }) => {
  const runtime = loadCorePaidJourneyRuntime();
  const api = process.env.CORE_PAID_JOURNEY_LIVE_API!;
  const origin = process.env.CORE_PAID_JOURNEY_LIVE_ORIGIN!;
  const out = process.env.QUALITY_EVAL_RESULT_DIR!;
  const requests: { path: string; modelClass: string | null }[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let premiumStarted!: () => void;
  const premium = new Promise<void>(resolve => { premiumStarted = resolve; });
  await page.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (![api, origin].includes(url.origin)) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/__supabase/auth/v1/')) {
      return route.fulfill({ json: { id: runtime.owner_id, email: runtime.email, aud: 'authenticated', role: 'authenticated' } });
    }
    if (req.method() === 'POST' && /\/agreements\/(parse|premium-)/.test(url.pathname)) {
      const data = req.postDataJSON();
      requests.push({ path: url.pathname, modelClass: data?.ai_model_class ?? null });
      if (url.pathname.endsWith('/parse') && data.ai_model_class === 'premium') {
        premiumStarted();
        await held;
        return route.abort('aborted');
      }
    }
    return route.continue();
  });
  await page.addInitScript(({ runtime, api }) => {
    localStorage.setItem(`sb-${new URL(api).hostname.split('.')[0]}-auth-token`, JSON.stringify({
      access_token: runtime.access_token, refresh_token: 'synthetic-local-refresh', token_type: 'bearer',
      expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600,
      user: { id: runtime.owner_id, email: runtime.email, role: 'authenticated', aud: 'authenticated',
        app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Core Paid Owner' } } }));
    localStorage.setItem('claw_org_id', runtime.org_id);
    sessionStorage.setItem('claw_authenticated_workspace_session', '1');
  }, { runtime, api });
  try {
    await page.goto('/app/create', { waitUntil: 'domcontentloaded' });
    const input = page.locator('.vs01-agreement-intake textarea').first();
    await expect(input).toBeVisible({ timeout: 20_000 });
    await input.fill(CORE_PAID_JOURNEY_FILLED_INTAKE);
    await page.getByRole('button', { name: /Create agreement|Create draft|Review|Next/i }).first().click();
    await Promise.race([premium, new Promise((_, reject) => setTimeout(() => reject(new Error('premium_parse_not_started')), 20000))]);
    await expect(page.getByText('Creating agreement', { exact: true }).first()).toBeVisible({ timeout: 5000 });
    const text = await page.locator('body').innerText();
    writeFileSync(join(out, 'paid-entry-held-premium.json'), JSON.stringify({
      provider: 'stub', basicParse: 'production_handler_success', premiumParse: 'held_in_flight',
      requests, prematureGeneratedClaim: text.includes('Agreement draft generated'),
      prematureChecksClaim: text.includes('Automated draft checks completed'), text,
    }, null, 2));
    await page.screenshot({ path: join(out, 'paid-entry-held-premium.png'), fullPage: true });
    // The previous audit wrongly required no basic call. Production explicitly
    // uses this bootstrap; its presence is inventory evidence, not a new policy.
    expect.soft(requests.map(r => r.modelClass)).toEqual(['basic', 'premium']);
    expect.soft(text, 'An unfinished premium request cannot claim generated/checked agreement paper').not.toMatch(/Agreement draft generated|Automated draft checks completed/);
  } finally {
    release();
  }
});
