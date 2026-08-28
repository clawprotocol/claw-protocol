/** @vitest-environment jsdom */
/**
 * Live persist / canonical-review-snapshot paint path that #131 missed.
 *
 * #131 asserted ensureOperativeIfToNoticeDelivery + projectPaidProFrozenSoTDisplayPlain
 * after injecting consumed signer metadata. Incognito refresh paints persist/snapshot
 * through resolveCanonicalPlainForVisibleShell without that injection.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  clearAcceptedReviewSnapshotRef,
  clearDisplayReviewSnapshotAuthority,
  sha256CorpusDigest,
  storeVerifiedCommercialDisplayCorpus,
} from "../../agreement/canonicalReviewSnapshotApi";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  countOperativeIfToNoticeStanzas,
  extractPartyAddressesFromOperativeNoticeStanzas,
} from "./paidProPartyNoticeDetails";
import { resolvePaidProFirstReviewVisibleDisplayPlain } from "./paidProFirstReviewDisplayAuthority";
import {
  PaidProVisibleDocumentShell,
  PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN,
  resetPaidProVisibleDocumentShellLogsForTests,
  resolveCanonicalPlainForVisibleShell,
} from "./paidProVisibleDocumentShell";
import { projectPaidProFrozenSoTDisplayPlain } from "./paidProDisplayPlainAuthority";
import {
  clearPaidProReviewSessionAuthorityForTests,
  establishPaidProReviewSessionAuthority,
} from "./paidProReviewSessionAuthority";
import {
  clearConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { clearPaidProSourceOfTruth, hashPaidProCorpus } from "./paidProSourceOfTruth";
import { replacePaidProSourceOfTruth } from "./paidProSourceOfTruthState";

const INTAKE =
  "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit for $2,400, term 30 days, governing law Texas.";
const NORTHLINE = "Northline Studio";
const HARBOR = "Harbor Marks LLC";
const FUSED = "Northline Studio Harbor Marks LLC";
const STUFFED_ADDRESS =
  "30 days, Upon full execution by the parties unless otherwise specified., Texas";
/** Exact live Harbor Address on persist dd37f0e4 / index-C9Nf20Qw.js after #132 heading paint. */
const LIVE_HARBOR_ADDRESS_BLOB =
  "User-stated material terms:, 30-day term, Texas governing law, Commercial safeguards (edit as needed), Deliverables and IP: Deliverables and ownership/license rights will follow the statement of work or specifications agreed by the Parties., Economics preserved from intake (confirm in Schedule A):";
const PERSIST_ID = "dd37f0e4-feba-42e5-bb37-713218aaf346";
const SNAPSHOT_ID = "crs_dd37f0e4_live_paint";

const NOTICE_CONTAMINATION_MARKERS = [
  "$2,400",
  "2,400",
  "30 days",
  "30-day term",
  "Texas",
  "Texas governing law",
  "logo",
  "brand kit",
  "Upon full execution",
  "User-stated material terms",
  "Commercial safeguards",
  "Economics preserved from intake",
  "Schedule A",
  FUSED,
  "Party A",
  "Party B",
  "generic_placeholder",
] as const;

function northlineDraft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Texas",
    agreement_family: "services_agreement",
    parties: [
      { name: NORTHLINE, role: "Client" },
      { name: HARBOR, role: "Service Provider" },
    ],
    purpose: "logo and brand kit",
    payment_terms: "$2,400",
    duration: "30 days",
    due_date: null,
    effective_date: "Upon full execution by the parties unless otherwise specified.",
    payment: { amount: 2400, cadence: "one_time", valid: true },
  };
}

/** Exact live Pro regenerate Notices (persist dd37f0e4). */
function exactLiveRegenerateNorthlineHarborCorpus(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is between ${NORTHLINE} ("Client") and ${HARBOR} ("Service Provider").`,
    "",
    "1. Scope of Services",
    "Provider will design a logo and brand kit.",
    "",
    "2. Term",
    "The term is 30 days.",
    "",
    "4. Compensation",
    "4.1 Fees. The total fee is $2,400.",
    "",
    "12. NOTICES",
    "Any notice under this Agreement must be in writing and delivered as set forth below.",
    "",
    `If to ${FUSED}: ${FUSED} Attn: ______________, ______________ Email: ____________________ Address: ____________________ ____________________`,
    `If to ${HARBOR}: ${HARBOR} Address: ${STUFFED_ADDRESS}`,
    "",
    "13. Miscellaneous",
    `This Agreement is the entire agreement This Agreement is between ${FUSED} ("Service Provider") and Service Provider ("Service Provider").`,
    "",
    "11. Governing Law",
    "This Agreement is governed by the laws of Texas.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    NORTHLINE,
    "By: ____________________",
    "",
    "SERVICE PROVIDER:",
    HARBOR,
    "By: ____________________",
  ].join("\n");
}

/**
 * Live staging persist after #132 fused-heading paint: independent If-to headings,
 * Harbor Address is the intake / commercial-safeguard / Schedule A blob, and §10
 * runs into Notices with no newline.
 */
function exactLiveHarborAddressContaminationCorpus(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is between ${NORTHLINE} ("Client") and ${HARBOR} ("Service Provider").`,
    "",
    "1. Scope of Services",
    "Provider will design a logo and brand kit.",
    "",
    "2. Term",
    "The term is 30 days.",
    "",
    "4. Compensation",
    "4.1 Fees. The total fee is $2,400.",
    "",
    "10. Limitation of Liability",
    "Provider's aggregate liability will not exceed the total amount payable under this Agreement12. NOTICES",
    "Any notice under this Agreement must be in writing and delivered as set forth below.",
    "",
    `If to ${NORTHLINE}: ${NORTHLINE}`,
    `If to ${HARBOR}: ${HARBOR} Address: ${LIVE_HARBOR_ADDRESS_BLOB}`,
    "",
    "13. Miscellaneous",
    `This Agreement is the entire agreement This Agreement is between ${FUSED} ("Service Provider") and Service Provider ("Service Provider").`,
    "",
    "11. Governing Law",
    "This Agreement is governed by the laws of Texas.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    NORTHLINE,
    "By: ____________________",
    "",
    "SERVICE PROVIDER:",
    HARBOR,
    "By: ____________________",
  ].join("\n");
}

function padToVisibleShellFloor(corpus: string): string {
  const min = PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN + 1500;
  if (corpus.length >= min) return corpus;
  const pad = "Each party shall keep confidential information confidential. ".repeat(80);
  return corpus.replace(
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    `${pad.trim()}\n\nIN WITNESS WHEREOF, the Parties execute this Agreement.`,
  );
}

function noticesRegion(text: string): string {
  const start = text.search(/(?:^|\n)\s*\d+\.\s+NOTICES\b|(?:^|\n)If to\s+/im);
  if (start < 0) return "";
  const from = text.slice(start);
  const nextTop = from.search(/\n(?=\d+\.(?!\d)\s+(?!NOTICES\b)\S)/i);
  return nextTop >= 0 ? from.slice(0, nextTop) : from;
}

function topLevelHeadingSequence(text: string): Array<{ n: number; title: string }> {
  const witness = text.search(/\bIN WITNESS WHEREOF\b/i);
  const head = witness >= 0 ? text.slice(0, witness) : text;
  const seq: Array<{ n: number; title: string }> = [];
  for (const line of head.split("\n")) {
    const match = line.trim().match(/^(\d+)\.(?!\d)\s+(.+)$/);
    if (!match?.[1] || !match[2]) continue;
    seq.push({ n: Number(match[1]), title: match[2].trim() });
  }
  return seq;
}

/** Persist/snapshot paint must not emit 10→12→13→11 (11 after 13). */
function assertSequentialTopLevelPaintOrder(text: string): void {
  const seq = topLevelHeadingSequence(text);
  const nums = seq.map((s) => s.n);
  for (let i = 1; i < nums.length; i += 1) {
    expect(nums[i]).toBeGreaterThan(nums[i - 1]!);
  }
  expect(text).not.toMatch(/13\.\s+\S[\s\S]*11\.\s+Governing Law/i);
  expect(text).toMatch(/11\.\s+Governing Law[\s\S]*laws of Texas/i);
}

function assertLiveTailIs10Then11Then12Then13(text: string): void {
  const from10 = topLevelHeadingSequence(text).filter((s) => s.n >= 10);
  expect(from10.map((s) => s.n)).toEqual([10, 11, 12, 13]);
  expect(from10[1]?.title).toMatch(/Governing Law/i);
  expect(from10[2]?.title).toMatch(/NOTICES/i);
  expect(from10[3]?.title).toMatch(/Miscellaneous/i);
  expect(text).toMatch(
    /10\.\s+[\s\S]*11\.\s+Governing Law[\s\S]*12\.\s+NOTICES[\s\S]*13\.\s+Miscellaneous/i,
  );
}

function assertIndependentNorthlineHarborNotices(text: string): void {
  const region = noticesRegion(text);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(2);
  expect(region).toMatch(new RegExp(`If to ${NORTHLINE}\\s*:`, "i"));
  expect(region).toMatch(new RegExp(`If to ${HARBOR}\\s*:`, "i"));
  expect(region).not.toMatch(new RegExp(`If to ${FUSED}`, "i"));
  expect(region).not.toMatch(/Party [AB]/i);
  expect(region).not.toMatch(/generic_placeholder/i);
  for (const marker of NOTICE_CONTAMINATION_MARKERS) {
    expect(region).not.toContain(marker);
  }
  const addresses = extractPartyAddressesFromOperativeNoticeStanzas(text);
  for (const addr of addresses) {
    expect(addr).not.toMatch(/30\s*-?\s*days?/i);
    expect(addr).not.toMatch(/Texas/i);
    expect(addr).not.toMatch(/\$2,400/);
    expect(addr).not.toMatch(/logo|brand kit/i);
    expect(addr).not.toMatch(/User-stated material terms/i);
    expect(addr).not.toMatch(/Commercial safeguards/i);
    expect(addr).not.toMatch(/Economics preserved from intake/i);
    expect(addr).not.toMatch(/Schedule A/i);
    expect(addr).not.toMatch(/governing law/i);
  }
}

function assertCertifiedTermsStayOutsideNotices(text: string): void {
  const region = noticesRegion(text);
  const outside = text.replace(region, "");
  expect(outside).toContain(NORTHLINE);
  expect(outside).toContain(HARBOR);
  expect(outside).toMatch(/\$2,400/);
  expect(outside).toMatch(/30 days/);
  expect(outside).toMatch(/Texas/);
  expect(outside).toMatch(/logo and brand kit/i);
  expect(outside).not.toMatch(/Party [AB]/i);
}

function latchPersistAuthority(corpus: string): void {
  const plain = corpus.trim();
  replacePaidProSourceOfTruth({
    text: plain,
    hash: hashPaidProCorpus(plain),
    accepted_at: Date.now(),
    source: "server_full_draft",
    reviewSessionId: "dd37f0e4_live_refresh",
  });
  establishPaidProReviewSessionAuthority({
    corpusPlain: plain,
    source: "persist_get",
    integrityOk: true,
    reviewSessionId: "dd37f0e4_live_refresh",
    agreementId: PERSIST_ID,
  });
}

async function seedVerifiedSnapshot(corpus: string): Promise<void> {
  const plain = corpus.trim();
  const sha = await sha256CorpusDigest(plain);
  storeVerifiedCommercialDisplayCorpus({
    agreementId: PERSIST_ID,
    snapshotId: SNAPSHOT_ID,
    corpusSha256: sha,
    corpusLength: plain.length,
    status: "pending",
    corpusPlain: plain,
  });
}

const livePaintContext = {
  draft: northlineDraft(),
  intakeText: INTAKE,
  agreementId: PERSIST_ID,
  paidProActive: true,
  premiumCheckoutCompleted: true,
  premiumPaidDocumentSurface: true,
};

describe("live persist / snapshot Notices paint (path #131 missed)", () => {
  afterEach(() => {
    cleanup();
    clearPaidProSourceOfTruth();
    clearPaidProReviewSessionAuthorityForTests();
    clearDisplayReviewSnapshotAuthority();
    clearAcceptedReviewSnapshotRef();
    clearConsumedPaidProSignerMetadataAuthority();
    resetPaidProVisibleDocumentShellLogsForTests();
  });

  it("first-review resolver still serves raw persist/snapshot bytes (why #131 was green)", () => {
    const fused = padToVisibleShellFloor(exactLiveRegenerateNorthlineHarborCorpus());
    latchPersistAuthority(fused);
    const resolution = resolvePaidProFirstReviewVisibleDisplayPlain(livePaintContext);
    expect(resolution.plain).toContain(`If to ${FUSED}`);
    expect(resolution.plain).toContain(STUFFED_ADDRESS);
    expect(hashPaidProCorpus(resolution.plain)).toBe(hashPaidProCorpus(fused.trim()));
  });

  it("projectPaidProFrozenSoTDisplayPlain without consumed metadata leaves fused If-to (the #131 miss)", () => {
    const fused = padToVisibleShellFloor(exactLiveRegenerateNorthlineHarborCorpus());
    expect(projectPaidProFrozenSoTDisplayPlain(fused)).toContain(`If to ${FUSED}`);
    const painted = resolveCanonicalPlainForVisibleShell({
      ...livePaintContext,
      acceptedCanonicalPlain: fused,
    });
    assertIndependentNorthlineHarborNotices(painted.plain);
    assertCertifiedTermsStayOutsideNotices(painted.plain);
    assertSequentialTopLevelPaintOrder(painted.plain);
  });

  it("refresh paint of persist + snapshot GET repairs fused If-to without consumed signer metadata", async () => {
    const fused = padToVisibleShellFloor(exactLiveRegenerateNorthlineHarborCorpus());
    latchPersistAuthority(fused);
    await seedVerifiedSnapshot(fused);

    const painted = resolveCanonicalPlainForVisibleShell(livePaintContext);
    expect(painted.plain.length).toBeGreaterThanOrEqual(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);
    assertIndependentNorthlineHarborNotices(painted.plain);
    assertCertifiedTermsStayOutsideNotices(painted.plain);
    assertSequentialTopLevelPaintOrder(painted.plain);

    const { container } = render(
      <PaidProVisibleDocumentShell html="" displayContext={livePaintContext} />,
    );
    const shell = container.querySelector('[data-testid="paid-pro-visible-document-shell"]');
    const visible = shell?.textContent || "";
    expect(shell?.getAttribute("data-paid-pro-render-branch")).toBe("canonical_plain_forced");
    expect(visible).toMatch(new RegExp(`If to ${NORTHLINE}\\s*:`, "i"));
    expect(visible).toMatch(new RegExp(`If to ${HARBOR}\\s*:`, "i"));
    expect(visible).not.toMatch(new RegExp(`If to ${FUSED}`, "i"));
    expect(visible).not.toMatch(/Address:\s*30 days/i);
    expect(visible).toMatch(/\$2,400/);
    expect(visible).toMatch(/30 days/);
    expect(visible).toMatch(/Texas/);
    expect(visible).toMatch(/logo and brand kit/i);
    expect(visible).not.toMatch(/13\.\s+Miscellaneous[\s\S]*11\.\s+Governing Law/i);
  });

  it("regenerate that re-emits the fused persist artifact still paints independent If-to", async () => {
    const fused = padToVisibleShellFloor(exactLiveRegenerateNorthlineHarborCorpus());
    latchPersistAuthority(fused);
    await seedVerifiedSnapshot(fused);
    const first = resolveCanonicalPlainForVisibleShell(livePaintContext);
    assertIndependentNorthlineHarborNotices(first.plain);

    const regenerated = padToVisibleShellFloor(exactLiveRegenerateNorthlineHarborCorpus());
    latchPersistAuthority(regenerated);
    await seedVerifiedSnapshot(regenerated);
    const second = resolveCanonicalPlainForVisibleShell(livePaintContext);
    assertIndependentNorthlineHarborNotices(second.plain);
    assertCertifiedTermsStayOutsideNotices(second.plain);
    assertSequentialTopLevelPaintOrder(second.plain);
  });

  it("verified snapshot GET alone (no consumed metadata) paints last-good If-to", async () => {
    const fused = padToVisibleShellFloor(exactLiveRegenerateNorthlineHarborCorpus());
    await seedVerifiedSnapshot(fused);
    const painted = resolveCanonicalPlainForVisibleShell({
      ...livePaintContext,
      acceptedCanonicalPlain: fused,
    });
    assertIndependentNorthlineHarborNotices(painted.plain);
    assertCertifiedTermsStayOutsideNotices(painted.plain);
    assertSequentialTopLevelPaintOrder(painted.plain);
  });

  it("persist-rewrite still repairs, but live paint does not depend on that rewrite", () => {
    const fused = exactLiveRegenerateNorthlineHarborCorpus();
    const persist = applyAcceptedProCorpusSafeDisplay(fused, {
      draft: northlineDraft(),
      intakeText: INTAKE,
      surface: "premium_completion_pipeline",
    });
    assertIndependentNorthlineHarborNotices(persist.text);

    const paintedFromFusedPersist = resolveCanonicalPlainForVisibleShell({
      ...livePaintContext,
      acceptedCanonicalPlain: padToVisibleShellFloor(fused),
    });
    assertIndependentNorthlineHarborNotices(paintedFromFusedPersist.plain);
    assertSequentialTopLevelPaintOrder(paintedFromFusedPersist.plain);
  });

  it("hard refresh of persist paints blank Harbor Address — not the live commercial-safeguard blob", async () => {
    const live = padToVisibleShellFloor(exactLiveHarborAddressContaminationCorpus());
    expect(live).toContain(LIVE_HARBOR_ADDRESS_BLOB);
    expect(live).toMatch(/Agreement12\.\s+NOTICES/);
    latchPersistAuthority(live);
    await seedVerifiedSnapshot(live);

    const painted = resolveCanonicalPlainForVisibleShell(livePaintContext);
    expect(painted.plain.length).toBeGreaterThanOrEqual(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);
    assertIndependentNorthlineHarborNotices(painted.plain);
    assertCertifiedTermsStayOutsideNotices(painted.plain);
    expect(painted.plain).not.toMatch(/Address:\s*User-stated material terms/i);
    expect(painted.plain).not.toMatch(/Agreement12\.\s+NOTICES/);
    expect(painted.plain).toMatch(/this Agreement\n+11\.\s+Governing Law/i);
    assertSequentialTopLevelPaintOrder(painted.plain);
    assertLiveTailIs10Then11Then12Then13(painted.plain);

    const { container } = render(
      <PaidProVisibleDocumentShell html="" displayContext={livePaintContext} />,
    );
    const shell = container.querySelector('[data-testid="paid-pro-visible-document-shell"]');
    const visible = shell?.textContent || "";
    expect(shell?.getAttribute("data-paid-pro-render-branch")).toBe("canonical_plain_forced");
    expect(visible).toMatch(new RegExp(`If to ${NORTHLINE}\\s*:`, "i"));
    expect(visible).toMatch(new RegExp(`If to ${HARBOR}\\s*:`, "i"));
    expect(visible).not.toMatch(/Address:\s*User-stated material terms/i);
    expect(visible).not.toMatch(/Commercial safeguards/i);
    expect(visible).toMatch(/\$2,400/);
    expect(visible).toMatch(/30 days/);
    expect(visible).toMatch(/Texas/);
    expect(visible).toMatch(/logo and brand kit/i);
    expect(visible).toMatch(/10\.\s+[\s\S]*11\.\s+Governing Law[\s\S]*12\.\s+NOTICES[\s\S]*13\.\s+Miscellaneous/i);
    expect(visible).not.toMatch(/13\.\s+Miscellaneous[\s\S]*11\.\s+Governing Law/i);
  });

  it("hard refresh of persist paints sequential 10/11/12/13 — not 11-after-13", async () => {
    const live = padToVisibleShellFloor(exactLiveHarborAddressContaminationCorpus());
    expect(live).toMatch(/Agreement12\.\s+NOTICES/);
    expect(live).toMatch(/13\.\s+Miscellaneous[\s\S]*11\.\s+Governing Law/i);
    latchPersistAuthority(live);
    await seedVerifiedSnapshot(live);

    const painted = resolveCanonicalPlainForVisibleShell(livePaintContext);
    assertIndependentNorthlineHarborNotices(painted.plain);
    assertCertifiedTermsStayOutsideNotices(painted.plain);
    assertSequentialTopLevelPaintOrder(painted.plain);
    assertLiveTailIs10Then11Then12Then13(painted.plain);
    expect(painted.plain).toMatch(/11\.\s+Governing Law[\s\S]*laws of Texas/i);
    expect(noticesRegion(painted.plain)).toMatch(new RegExp(`If to ${NORTHLINE}\\s*:`, "i"));
    expect(noticesRegion(painted.plain)).toMatch(new RegExp(`If to ${HARBOR}\\s*:`, "i"));
    const addresses = extractPartyAddressesFromOperativeNoticeStanzas(painted.plain);
    for (const addr of addresses) {
      expect(addr.trim()).toBe("");
    }
  });
});
