import { expect, test } from '@playwright/test';
import { loadCorePaidJourneyRuntime } from './corePaidJourneyLiveAuth';

test('quality preflight: production-built paid Create survives fresh entry and reload', async ({ page }) => {
  const runtime = loadCorePaidJourneyRuntime();
  const api = process.env.CORE_PAID_JOURNEY_LIVE_API!;
  const origin = process.env.CORE_PAID_JOURNEY_LIVE_ORIGIN!;
  const errors: string[] = [];
  const modelPosts: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'POST' && /\/agreements\/(parse|premium-)/.test(request.url())) {
      modelPosts.push(new URL(request.url()).pathname);
    }
  });
  // No external requests, emails, payment sessions or model calls in preflight.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (![api, origin].includes(url.origin)) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/__supabase/auth/v1/')) {
      return route.fulfill({ json: { id: runtime.owner_id, email: runtime.email,
        aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' } } });
    }
    return route.continue();
  });
  await page.addInitScript(({ runtime, api }) => {
    const key = `sb-${new URL(api).hostname.split('.')[0]}-auth-token`;
    localStorage.setItem(key, JSON.stringify({ access_token: runtime.access_token,
      refresh_token: 'synthetic-local-refresh', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer',
      user: { id: runtime.owner_id, email: runtime.email, aud: 'authenticated',
        role: 'authenticated', app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Core Paid Owner' }, identities: [] } }));
    localStorage.setItem('claw_org_id', runtime.org_id);
    sessionStorage.setItem('claw_authenticated_workspace_session', '1');
    // Deliberately NOT using the DEV-only e2e session bridge.
  }, { runtime, api });
  await page.goto('/app/create', { waitUntil: 'domcontentloaded' });
  const intake = page.locator('.vs01-agreement-intake textarea').first();
  await expect(intake).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /Sign in required/i })).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(intake).toBeVisible({ timeout: 20_000 });
  expect(modelPosts, 'Opening or reloading Create must not generate paid model calls').toEqual([]);
  expect(errors, 'Production-built page must not crash').toEqual([]);
});
