import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCorePaidJourneyRuntime } from './corePaidJourneyLiveAuth';
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from '../../src/launch/corePaidJourneyAcceptanceMatrix';

// Live only through the authorized local runner; never runs in the stub core gate.
test.skip(process.env.CLAW_QUALITY_EVAL_LIVE !== '1', 'Explicit authorized live runner required');
const cases = [
  { id: 'consulting', sparse: 'need a consulting agreement for about 48k',
    filled: CORE_PAID_JOURNEY_FILLED_INTAKE, parties: ['Harbor Peak Analytics LLC', 'Ironvale Manufacturing Inc.'],
    terms: ['$48,000', 'Delaware'], track: 'review' },
  { id: 'saas', sparse: 'Need a SaaS subscription agreement',
    filled: 'Draft a 12-month SaaS subscription agreement between Orion Harbor LLC (Provider) and Northwind Retail Inc. (Customer). Scope: hosted platform access and standard onboarding, hosted platform only, no professional services. Fee $48,000 annually, net 30. Governing law New York. Provider signer Avery Cole, avery@orionharbor.test. Customer signer Casey Reed, casey@northwind.test.',
    parties: ['Orion Harbor LLC', 'Northwind Retail Inc.'], terms: ['$48,000', 'New York'], track: 'signature' },
];

for (const scenario of cases) {
  test(`real drafting: ${scenario.id}`, async ({ page }) => {
    test.setTimeout(300_000);
    const out = process.env.QUALITY_EVAL_RESULT_DIR!;
    const runtime = loadCorePaidJourneyRuntime();
    const api = process.env.CORE_PAID_JOURNEY_LIVE_API!;
    const origin = process.env.CORE_PAID_JOURNEY_LIVE_ORIGIN!;
    const responses: object[] = [];
    const pending: Promise<void>[] = [];
    page.on('response', response => {
      if (response.request().method() !== 'POST' || !/\/agreements\/(parse|premium-)/.test(response.url())) return;
      pending.push((async () => {
        const body = await response.json().catch(() => ({ non_json: true }));
        responses.push({ path: new URL(response.url()).pathname, status: response.status(),
          request: response.request().postDataJSON(), body });
      })());
    });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (![api, origin].includes(url.origin)) return route.abort('blockedbyclient');
      if (url.pathname.startsWith('/__supabase/auth/v1/')) {
        return route.fulfill({ json: { id: runtime.owner_id, email: runtime.email, aud: 'authenticated', role: 'authenticated' } });
      }
      if (route.request().method() !== 'GET' && /billing|checkout|\/send-email|\/email\//.test(url.pathname)) {
        return route.abort('blockedbyclient');
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
      const submit = async (text: string) => {
        await expect(input).toBeVisible({ timeout: 20_000 });
        await input.fill(text);
        await page.getByRole('button', { name: /Create agreement|Create draft|Review|Next/i }).first().click();
      };
      await submit(scenario.sparse);
      const clarification = page.getByTestId('agreement-intake-clarification');
      await expect(clarification).toBeVisible({ timeout: 30_000 });
      writeFileSync(join(out, `${scenario.id}-clarifications.txt`), await clarification.innerText());
      for (const party of scenario.parties) await expect(clarification).not.toContainText(party);
      const edit = page.getByRole('button', { name: /edit myself|revise|i.?ll edit/i }).first();
      if (await edit.isVisible()) await edit.click();
      const premiumResponse = page.waitForResponse(r => r.request().method() === 'POST' &&
        new URL(r.url()).pathname.endsWith('/agreements/premium-full-draft'), { timeout: 240_000 });
      await submit(scenario.filled);
      // An early local/basic preview is not the completed premium result.
      const generatedResponse = await premiumResponse;
      const generated = await generatedResponse.json();
      writeFileSync(join(out, `${scenario.id}-premium-result.json`), JSON.stringify(generated, null, 2));
      expect(generatedResponse.ok(), 'Premium handler must finish successfully').toBeTruthy();
      expect(generated.generation_ok, 'A degraded response is not an accepted premium draft').toBe(true);
      expect(generated.generation_outcome, 'Unresolved material questions need an interview, not a signing-ready claim').toBe('ok');
      const article = page.locator('[data-testid="simple-pro-final-review-document"]:visible, [data-testid="paid-pro-visible-document-shell"]:visible').first();
      await expect(article).toBeVisible({ timeout: 30_000 });
      for (const fact of [...scenario.parties, ...scenario.terms]) await expect(article).toContainText(fact, { timeout: 20_000 });
      const paper = await article.innerText();
      writeFileSync(join(out, `${scenario.id}-visible-agreement.txt`), paper);
      for (const fact of [...scenario.parties, ...scenario.terms]) expect(paper).toContain(fact);
      expect(paper).not.toMatch(/\[insert[^\]]*\]|lorem ipsum|\bTBD\b|Orion Labs|Contoso Retail/);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(article).toBeVisible({ timeout: 20_000 });
      for (const party of scenario.parties) await expect(article).toContainText(party);
      writeFileSync(join(out, `${scenario.id}-after-refresh.txt`), await article.innerText());
      // A subsequent controlled step will exercise the chosen recipient path on
      // this server-persisted agreement; never regenerate just to test navigation.
      writeFileSync(join(out, `${scenario.id}-continuation.json`), JSON.stringify({
        url: page.url(), intended_track: scenario.track, quality: 'human_review_required',
        recipient_path: 'not_yet_exercised' }, null, 2));
    } finally {
      await Promise.all(pending);
      writeFileSync(join(out, `${scenario.id}-model-endpoints.json`), JSON.stringify(responses, null, 2));
      writeFileSync(join(out, `${scenario.id}-last-page.txt`), await page.locator('body').innerText().catch(() => 'unavailable'));
    }
  });
}
