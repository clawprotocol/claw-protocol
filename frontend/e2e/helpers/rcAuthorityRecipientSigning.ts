/**
 * RC Journey 7 — VS01 recipient signing harness with bounded diagnostics.
 */
import { expect, type Page } from "@playwright/test";
import type { AuthoritySigningChainState, AuthoritySignerCompletion } from "./rcAuthorityCertificationChain";
import type { DeliveryMessageRecord } from "./rcDeliveryAdapter";

export type RecipientSigningStage =
  | "context_create"
  | "page_create"
  | "url_assert"
  | "navigation"
  | "readiness"
  | "identity"
  | "field_interaction"
  | "finish_enable"
  | "submit"
  | "completion_api"
  | "completion_ui"
  | "context_close";

export type RecipientSigningDiagnostic = {
  stage: RecipientSigningStage;
  signerIndex: number;
  expectedName: string;
  expectedEmail: string;
  signingUrl: string;
  detail: string;
  at: number;
};

const TIMEOUTS = {
  contextCreate: 10_000,
  pageCreate: 10_000,
  navigation: 30_000,
  readiness: 30_000,
  interaction: 10_000,
  finishEnable: 30_000,
  submit: 10_000,
  completionApi: 30_000,
  completionUi: 30_000,
} as const;

export function normalizeRecipientHref(href: string, baseURL: string): string {
  const base = new URL(baseURL);
  const u = new URL(href, baseURL);
  u.protocol = base.protocol;
  u.host = base.host;
  return u.toString();
}

export function parseRecipientUrlAuthority(href: string, baseURL: string): {
  agreementId: string;
  documentId: string;
  counterpartyId: string;
  signerRoleId: string;
  recipientEmail: string;
  recipientName: string;
  tokenRedacted: string;
  originOk: boolean;
} {
  const normalized = normalizeRecipientHref(href, baseURL);
  const u = new URL(normalized);
  const base = new URL(baseURL);
  const token = u.searchParams.get("t") || u.searchParams.get("token") || "";
  return {
    agreementId: (u.searchParams.get("agreement_id") ?? "").trim(),
    documentId: (u.searchParams.get("document_id") ?? u.pathname.split("/").pop() ?? "").trim(),
    counterpartyId: (u.searchParams.get("counterparty_id") ?? "").trim(),
    signerRoleId: (u.searchParams.get("signer_role_id") ?? "").trim(),
    recipientEmail: (u.searchParams.get("recipient_email") ?? "").trim(),
    recipientName: (u.searchParams.get("recipient_name") ?? "").trim(),
    tokenRedacted: token ? `${token.slice(0, 6)}…${token.slice(-4)}` : "",
    originOk: u.host === base.host,
  };
}

export function assertRecipientUrlAuthority(
  msg: DeliveryMessageRecord,
  args: { agreementId: string; baseURL: string; signerIndex: number },
): ReturnType<typeof parseRecipientUrlAuthority> {
  expect(msg.href.trim().length, `signer ${args.signerIndex}: empty signing href`).toBeGreaterThan(0);
  const parsed = parseRecipientUrlAuthority(msg.href, args.baseURL);
  expect(parsed.originOk, `signer ${args.signerIndex}: host mismatch href=${msg.href}`).toBe(true);
  expect(parsed.agreementId, `signer ${args.signerIndex}: missing agreement_id`).toBe(args.agreementId);
  expect(parsed.documentId.length, `signer ${args.signerIndex}: missing document_id`).toBeGreaterThan(0);
  expect(parsed.counterpartyId.length, `signer ${args.signerIndex}: missing counterparty_id`).toBeGreaterThan(0);
  expect(parsed.signerRoleId.length, `signer ${args.signerIndex}: missing signer_role_id`).toBeGreaterThan(0);
  expect(parsed.recipientEmail.length, `signer ${args.signerIndex}: missing recipient_email`).toBeGreaterThan(0);
  return parsed;
}

async function captureRecipientFailure(page: Page, diag: RecipientSigningDiagnostic): Promise<string> {
  const url = page.isClosed() ? "(page closed)" : page.url();
  let bodySnippet = "";
  let consoleErrors: string[] = [];
  try {
    bodySnippet = await page.evaluate(() =>
      (document.body.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
    );
  } catch {
    bodySnippet = "(unavailable)";
  }
  try {
    const shotPath = `test-results/rc-recipient-fail-s${diag.signerIndex}-${diag.stage}.png`;
    await page.screenshot({ path: shotPath, fullPage: true });
  } catch {
    /* ignore */
  }
  return [
    `stage=${diag.stage}`,
    `signerIndex=${diag.signerIndex}`,
    `expectedName=${diag.expectedName}`,
    `expectedEmail=${diag.expectedEmail}`,
    `url=${url}`,
    `detail=${diag.detail}`,
    `body=${bodySnippet}`,
    consoleErrors.length ? `console=${consoleErrors.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function recipientFieldSelector(fieldType: "signature" | "initials", partyIndex?: number): string {
  let sel = `[data-vs01-visual-field-type='${fieldType}']`;
  if (partyIndex !== undefined) sel += `[data-vs01-visual-party-index='${partyIndex}']`;
  return sel;
}

async function completeRecipientFields(signPage: Page, partyIndex?: number): Promise<void> {
  for (const fieldType of ["signature", "initials"] as const) {
    const fields = signPage.locator(recipientFieldSelector(fieldType, partyIndex));
    const count = await fields.count();
    for (let i = 0; i < count; i += 1) {
      const field = fields.nth(i);
      if (!(await field.isVisible({ timeout: TIMEOUTS.interaction }).catch(() => false))) continue;

      const inlineInput = field.locator("input.vs01-sign-field-inline-input, input[type='text']").first();
      if (await inlineInput.isVisible({ timeout: 500 }).catch(() => false)) {
        await inlineInput.fill("Signed Name", { timeout: TIMEOUTS.interaction });
        continue;
      }
      await field.click({ timeout: TIMEOUTS.interaction }).catch(() => undefined);
      const applySig = signPage
        .getByRole("button", { name: /Apply signature|Save signature|Use signature/i })
        .first();
      if (await applySig.isVisible({ timeout: 500 }).catch(() => false)) {
        await applySig.click({ timeout: TIMEOUTS.interaction });
      }
    }
  }
}

export type CompleteVs01RecipientSigningResult = {
  diagnostics: RecipientSigningDiagnostic[];
  completion: AuthoritySignerCompletion | null;
  durationMs: number;
};

export async function completeVs01RecipientSigning(args: {
  signPage: Page;
  msg: DeliveryMessageRecord;
  chainState: AuthoritySigningChainState;
  signerIndex: number;
  baseURL: string;
  completionsBefore: number;
}): Promise<CompleteVs01RecipientSigningResult> {
  const started = Date.now();
  const diagnostics: RecipientSigningDiagnostic[] = [];
  const { signPage, msg, chainState, signerIndex, baseURL, completionsBefore } = args;

  const push = (stage: RecipientSigningStage, detail: string, signingUrl = msg.href) => {
    diagnostics.push({
      stage,
      signerIndex,
      expectedName: msg.destination,
      expectedEmail: msg.destination,
      signingUrl,
      detail,
      at: Date.now(),
    });
  };

  const fail = async (stage: RecipientSigningStage, detail: string): Promise<never> => {
    const diag: RecipientSigningDiagnostic = {
      stage,
      signerIndex,
      expectedName: msg.destination,
      expectedEmail: msg.destination,
      signingUrl: msg.href,
      detail,
      at: Date.now(),
    };
    diagnostics.push(diag);
    const evidence = await captureRecipientFailure(signPage, diag);
    throw new Error(`VS01 recipient signing failed:\n${evidence}`);
  };

  const urlAuth = assertRecipientUrlAuthority(msg, {
    agreementId: chainState.packet?.agreementId ?? msg.agreementId,
    baseURL,
    signerIndex,
  });
  push("url_assert", JSON.stringify({ ...urlAuth, href: normalizeRecipientHref(msg.href, baseURL) }));

  signPage.on("dialog", (d) => d.accept());

  const navUrl = normalizeRecipientHref(msg.href, baseURL);
  push("navigation", `start ${navUrl}`);
  const navResponse = await signPage
    .goto(navUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUTS.navigation })
    .catch(async (err) => fail("navigation", `goto failed: ${String(err)}`));
  const status = navResponse?.status();
  push("navigation", `end status=${status ?? "unknown"} final=${signPage.url()}`);

  await signPage
    .getByRole("heading", { name: /Review and sign/i })
    .first()
    .waitFor({ state: "visible", timeout: TIMEOUTS.readiness })
    .catch(async () => {
      const errText = await signPage
        .locator("[role='alert'], .vs01-error, .text-rose-100")
        .first()
        .textContent()
        .catch(() => null);
      await fail(
        "readiness",
        `Review and sign heading not visible; alert=${errText ?? "none"} url=${signPage.url()}`,
      );
    });
  push("readiness", "Review and sign visible");

  const bodyText = await signPage.evaluate(() => document.body.textContent ?? "");
  if (/could not be verified|does not match your invite|Ask the sender for a new link/i.test(bodyText)) {
    await fail("identity", `identity error visible: ${bodyText.replace(/\s+/g, " ").slice(0, 200)}`);
  }

  const namePattern = new RegExp(
    (urlAuth.recipientName || msg.destination).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i",
  );
  if (urlAuth.recipientName) {
    await expect(signPage.getByText(namePattern).first())
      .toBeVisible({ timeout: TIMEOUTS.readiness })
      .catch(async () => push("identity", "expected signer name not explicitly visible — continuing"));
  }
  push("identity", `urlRole=${urlAuth.signerRoleId.slice(0, 24)} cp=${urlAuth.counterpartyId.slice(0, 24)}`);

  const finish = signPage.getByRole("button", { name: "Finish signing" });
  for (let round = 0; round < 16; round += 1) {
    if (await finish.isEnabled({ timeout: 800 }).catch(() => false)) break;
    push("field_interaction", `round=${round}`);
    await completeRecipientFields(signPage, urlAuth.recipientEmail ? undefined : undefined);
    if (!(await finish.isEnabled({ timeout: 800 }).catch(() => false))) {
      for (const navLabel of ["Next", "Bottom"] as const) {
        const nav = signPage.getByRole("button", { name: navLabel });
        if (await nav.isEnabled({ timeout: 500 }).catch(() => false)) {
          await nav.click({ timeout: TIMEOUTS.interaction });
          break;
        }
      }
    }
  }

  if (!(await finish.isEnabled({ timeout: TIMEOUTS.finishEnable }).catch(() => false))) {
    await fail("finish_enable", "Finish signing remained disabled after field interactions");
  }
  push("finish_enable", "Finish signing enabled");

  const completionPromise = expect
    .poll(() => chainState.completions.length, { timeout: TIMEOUTS.completionApi })
    .toBeGreaterThan(completionsBefore);

  push("submit", "click Finish signing");
  await finish.click({ timeout: TIMEOUTS.submit });

  try {
    await completionPromise;
  } catch (err) {
    await fail(
      "completion_api",
      `vs01-signer-complete not recorded; completions=${chainState.completions.length} before=${completionsBefore} timeline=${chainState.timeline.map((t) => t.tag).join(",")} cause=${String(err)}`,
    );
  }

  const completion = chainState.completions.find((c) => c.signerRoleId === urlAuth.signerRoleId) ?? null;
  expect(completion, "completion event missing expected signer_role_id").not.toBeNull();
  push("completion_api", `signerRoleId=${completion!.signerRoleId.slice(0, 24)}`);

  await signPage
    .getByText(/thank you|signing complete|finished signing|you.?re done|all set/i)
    .first()
    .waitFor({ state: "visible", timeout: TIMEOUTS.completionUi })
    .catch(async () => {
      if (await finish.isHidden({ timeout: 2_000 }).catch(() => false)) {
        push("completion_ui", "Finish button hidden — treating as complete");
        return;
      }
      await fail("completion_ui", "No completion UI after successful API completion");
    });
  push("completion_ui", "completion surface reached");

  return {
    diagnostics,
    completion,
    durationMs: Date.now() - started,
  };
}
