/**
 * Seeded accepted-author reopen only.
 * Does not replay create, review-link minting, proposal, or acceptance UI.
 */
import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { loadCorePaidJourneyRuntime, seedCorePaidJourneyOwner } from "./corePaidJourneyLiveAuth";
import {
  articleText,
  configuredLiveApiBase,
  fetchOwnerCanonicalSnapshot,
  waitForOwnerWorkspaceReady,
} from "./qualityEvalJourney";

const enabled = Boolean(process.env.CORE_PAID_JOURNEY_LIVE_API && process.env.CORE_PAID_JOURNEY_LIVE_ORIGIN);
test.skip(!enabled, "Local official API/origin required; no provider calls");

const SILVER_MESA = "Silver Mesa Analytics LP";
const ORIGINAL_REVIEWER = "olivia.hart@silvermesaanalytics.com";
const ACCEPTED_NOTICE = "notices@silvermesaanalytics.com";
const STALE_ANON_ORG = "anon-8066d4a6aff6450c969ef2ee62043718";

function acceptedSilverMesaPaper(): string {
  const body = [
    "JOINT AI SOFTWARE ROLLOUT AGREEMENT",
    "This Agreement is among Ironclad Systems Group LLC (\"Sponsor\"), Harborline Data Solutions Inc. (\"Vendor\"), Northwind Automation Partners LLC (\"Integrator\"), and Silver Mesa Analytics LP (\"Analyst\").",
    "Ethan Cole is CEO of Ironclad. Maya Bennett is CTO of Harborline. Lucas Reed is Managing Partner of Northwind. Olivia Hart is Ops Director of Silver Mesa.",
    "Ironclad Systems Group LLC pays $187,500 over six milestone payments. Term is 24 months. Texas law. Austin ZIP 78701.",
    "If to Silver Mesa Analytics LP: Email: notices@silvermesaanalytics.com.",
    "Reviewer access remains olivia.hart@silvermesaanalytics.com and is not the Silver Mesa notice address.",
  ].join("\n");
  return `${body}\n${"Operative commercial paragraph continues the same four-party Texas rollout. ".repeat(80)}`.trim();
}

function ownerHeaders() {
  const runtime = loadCorePaidJourneyRuntime();
  return {
    Authorization: `Bearer ${runtime.access_token}`,
    "X-Claw-Org-Id": runtime.org_id,
    "Content-Type": "application/json",
  };
}

async function seedAcceptedAgreement(page: Page): Promise<{
  agreementId: string;
  snapshotId: string;
  digest: string;
  corpus: string;
}> {
  const api = configuredLiveApiBase();
  const headers = ownerHeaders();
  const corpus = acceptedSilverMesaPaper();
  const created = await page.request.post(`${api}/api/agreements/draft`, {
    headers,
    data: {
      title: "Joint AI Software Rollout Agreement",
      jurisdiction: "Texas",
      parties: [
        { id: "p1", name: "Ironclad Systems Group LLC", role: "Sponsor", email: "ethan.cole@ironcladsg.com" },
        { id: "p2", name: "Harborline Data Solutions Inc.", role: "Vendor", email: "maya.bennett@harborlinedata.com" },
        { id: "p3", name: "Northwind Automation Partners LLC", role: "Integrator", email: "lucas.reed@northwindap.io" },
        { id: "p4", name: SILVER_MESA, role: "Analyst", email: ORIGINAL_REVIEWER },
      ],
      purpose: "four-party Texas joint AI software rollout",
      payment_terms: "$187,500 over six milestones",
    },
  });
  expect(created.ok(), `draft create failed ${created.status()} ${await created.text()}`).toBeTruthy();
  const agreementId = String((await created.json()).id || "").trim();
  expect(agreementId.length).toBeGreaterThan(8);

  const digest = createHash("sha256").update(corpus).digest("hex");
  const posted = await page.request.post(
    `${api}/api/agreements/${encodeURIComponent(agreementId)}/canonical-review-snapshot`,
    {
      headers,
      data: {
        corpus_plain: corpus,
        generation_session_id: "accepted-author-create-reopen",
        claimed_digest: digest,
      },
    },
  );
  expect(posted.ok(), `snapshot-create failed ${posted.status()} ${await posted.text()}`).toBeTruthy();
  const postedSnap = (await posted.json()).snapshot || {};
  const snapshotId = String(postedSnap.snapshot_id || "").trim();
  expect(snapshotId).toBeTruthy();
  expect(String(postedSnap.corpus_sha256 || "")).toBe(digest);

  const accepted = await page.request.post(
    `${api}/api/agreements/${encodeURIComponent(agreementId)}/canonical-review-snapshot/accept`,
    {
      headers,
      data: {
        snapshot_id: snapshotId,
        expected_digest: digest,
        expected_accepted_snapshot_id: "",
        accepting_session: "accepted-author-create-reopen",
      },
    },
  );
  expect(accepted.ok(), `snapshot-accept failed ${accepted.status()} ${await accepted.text()}`).toBeTruthy();
  return { agreementId, snapshotId, digest, corpus };
}

async function seedAuthorWithStaleAnonymousOrg(page: Page): Promise<void> {
  await seedCorePaidJourneyOwner(page);
  await page.addInitScript((anonOrg) => {
    try {
      localStorage.setItem("claw_org_id", anonOrg);
    } catch {
      /* ignore */
    }
  }, STALE_ANON_ORG);
}

async function readAcceptedReopenClient(page: Page): Promise<{
  href: string;
  hrefAgreementId: string | null;
  storedOrgId: string;
  resumeAgreementId: string;
  draftReady: boolean;
  intakeMounted: boolean;
  emptyCreateComposerVisible: boolean;
  createAgreementCta: boolean;
  stage: string;
  phase: string;
  displayPhase: string;
  draftPresent: boolean;
  reviewIdPresent: boolean;
  settling: boolean;
  bindFailed: boolean;
  article: string;
}> {
  return page.evaluate(() => {
    const readable = (el: Element | null): string => ((el as HTMLElement | null)?.innerText || "").trim();
    const nodes = Array.from(
      document.querySelectorAll(
        '[data-testid="simple-pro-final-review-document"], [data-testid="paid-pro-visible-document-shell"], article[aria-label="Agreement document preview"]',
      ),
    );
    let article = "";
    for (const node of nodes) {
      const text = readable(node);
      if (text.length > article.length) article = text;
    }
    const debug = readable(document.body);
    const field = (label: string): string => {
      const match = debug.match(new RegExp(`${label}:\\s*([^\\n]+)`));
      return (match?.[1] || "").trim();
    };
    const emptyCreateComposer = Array.from(
      document.querySelectorAll<HTMLTextAreaElement>(".vs01-agreement-intake textarea"),
    ).some((el) => {
      if (!el.offsetParent) return false;
      const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
      return /describe your deal|start typing|create agreement|what should this agreement/i.test(
        placeholder || readable(el.parentElement),
      );
    });
    return {
      href: window.location.href,
      hrefAgreementId: new URL(window.location.href).searchParams.get("agreementId"),
      storedOrgId: localStorage.getItem("claw_org_id") || "",
      resumeAgreementId: sessionStorage.getItem("claw_agreement_create_review_resume_v1") || "",
      draftReady: sessionStorage.getItem("claw_agreement_create_review_draft_ready_v1") === "1",
      intakeMounted: Boolean(document.querySelector(".vs01-agreement-intake")),
      emptyCreateComposerVisible: emptyCreateComposer,
      createAgreementCta: /Create agreement/i.test(debug) && !/Review your agreement draft/i.test(debug),
      stage: field("stage"),
      phase: field("phase"),
      displayPhase: field("displayPhase"),
      draftPresent: /^yes$/i.test(field("draft")),
      reviewIdPresent: /^yes$/i.test(field("reviewId")),
      settling: Boolean(document.querySelector('[data-testid="create-auth-workspace-settling"]')),
      bindFailed: Boolean(document.querySelector('[data-testid="create-auth-workspace-bind-failed"]')),
      article,
    };
  });
}

async function assertAcceptedCreateResume(page: Page, seeded: {
  agreementId: string;
  snapshotId: string;
  digest: string;
  corpus: string;
}): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/app/create\\?agreementId=${seeded.agreementId}`));
  await waitForOwnerWorkspaceReady(page, seeded.agreementId);
  await expect(page.getByTestId("create-auth-workspace-bind-failed")).toHaveCount(0);
  await expect
    .poll(async () => (await readAcceptedReopenClient(page)).intakeMounted, { timeout: 30_000 })
    .toBe(true);

  let painted = "";
  await expect
    .poll(
      async () => {
        painted = await articleText(page, SILVER_MESA);
        return painted.includes(ACCEPTED_NOTICE) && painted.includes(ORIGINAL_REVIEWER) ? painted.length : 0;
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(400);

  const client = await readAcceptedReopenClient(page);
  expect(client.href).toContain(`/app/create?agreementId=${seeded.agreementId}`);
  expect(client.hrefAgreementId).toBe(seeded.agreementId);
  expect(client.storedOrgId.startsWith("user-"), `workspace must bind to user-* org, got ${client.storedOrgId}`).toBe(
    true,
  );
  expect(client.resumeAgreementId).toBe(seeded.agreementId);
  expect(client.draftReady).toBe(true);
  expect(client.intakeMounted).toBe(true);
  expect(client.settling).toBe(false);
  expect(client.bindFailed).toBe(false);
  expect(client.emptyCreateComposerVisible, "accepted resume must not fall back to empty INPUT composer").toBe(
    false,
  );
  expect(client.createAgreementCta).toBe(false);
  expect(client.stage.toUpperCase()).toBe("DRAFT");
  expect(client.phase).toBe("draft_ready_for_review");
  expect(client.displayPhase).toBe("review");
  expect(client.draftPresent).toBe(true);
  expect(client.reviewIdPresent).toBe(true);
  expect(painted).toContain(ACCEPTED_NOTICE);
  expect(painted).toContain(`Reviewer access remains ${ORIGINAL_REVIEWER}`);
  expect(painted).toMatch(/If to Silver Mesa Analytics LP:\s*Email:\s*notices@silvermesaanalytics\.com/i);
  expect(painted).not.toMatch(/If to Silver Mesa Analytics LP:\s*Email:\s*olivia\.hart@silvermesaanalytics\.com/i);
  expect(painted).toContain("Ironclad Systems Group LLC");
  expect(painted).toContain("Harborline Data Solutions Inc.");
  expect(painted).toContain("Northwind Automation Partners LLC");
  expect(painted).toContain("Texas");

  const get = await fetchOwnerCanonicalSnapshot(page, seeded.agreementId);
  expect(get.agreementId).toBe(seeded.agreementId);
  expect(get.snapshotId).toBe(seeded.snapshotId);
  expect(get.digest).toBe(seeded.digest);
  expect(get.status).toBe("accepted");
  expect(get.corpus).toBe(seeded.corpus);
}

test("seeded accepted author reopen leaves settling and paints the accepted article", async ({ page }) => {
  const seeded = await seedAcceptedAgreement(page);
  const get = await fetchOwnerCanonicalSnapshot(page, seeded.agreementId);
  expect(get.status).toBe("accepted");
  expect(get.snapshotId).toBe(seeded.snapshotId);
  expect(get.digest).toBe(seeded.digest);
  expect(get.corpus).toContain(ACCEPTED_NOTICE);
  expect(get.corpus).toContain(ORIGINAL_REVIEWER);

  await seedAuthorWithStaleAnonymousOrg(page);
  await page.goto(`/app/create?agreementId=${seeded.agreementId}`, { waitUntil: "domcontentloaded" });
  await assertAcceptedCreateResume(page, seeded);

  await page.reload({ waitUntil: "domcontentloaded" });
  await assertAcceptedCreateResume(page, seeded);
});
