import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  resolveCanonicalPlainForVisibleShell,
  resolvePaidProVisibleShellRenderBranch,
  PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN,
  PAID_PRO_FALLBACK_REBUILD_MIN_LEN,
} from "./paidProVisibleDocumentShell";

vi.mock("./paidProFirstReviewDisplayAuthority", () => ({
  resolvePaidProFirstReviewVisibleDisplayPlain: vi.fn(),
  logTest310DisplaySource: vi.fn(),
  logTest310BlockClassification: vi.fn(),
  logTest313HeadingRenderSource: vi.fn(),
  logTest314HeadingInvariant: vi.fn(),
}));

vi.mock("./paidProSignerMetadataCommitPolicy", () => ({
  isPaidProPostFinalizeHydratedCorpusLocked: vi.fn(() => false),
}));

vi.mock("./paidProDocumentTitleOpeningRepair", () => ({
  projectPaidProVisibleTitleDisplayPlain: vi.fn((plain) => plain),
}));

const { resolvePaidProFirstReviewVisibleDisplayPlain } = await import("./paidProFirstReviewDisplayAuthority");

/**
 * Canonical Harbor dump fixture for leak regression tests.
 * These lines MUST be stripped when rendering the first Pro screen document.
 */
const HARBOR_LEAK_FIXTURE_LINES = [
  `11. Mesa Realty Group LLC / said they'll send us buyer and listing leads if we pay them 7% after the customer puts down a deposit.`,
  `12. Don't / count / our house accounts or anyone we already did a job for last year.`,
  `13. 12 month deal, exclusive in the Phoenix metro as long as they send a decent number of leads, and they can't poach our customers or call them direct.`,
  `Commercial detail carried forward from user notes (edit freely before send):`,
];

/**
 * Additional Harbor leak fixture lines from PR #30 live retest (2026-08-21).
 * These appear AFTER the numbered heading strip removed the "12. Don't" heading
 * but left orphan body text behind.
 */
const HARBOR_ORPHAN_BODY_LINES = [
  `count`,
  `our house accounts or anyone we already did a job for last year.`,
];

/**
 * Meta headers that leak into section bodies.
 */
const HARBOR_META_HEADER_LINES = [
  `Signal persistence safeguards:`,
];

/**
 * Personal detail leaks from user dump (pet names, truck colors).
 */
const HARBOR_PERSONAL_DETAIL_LINES = [
  `no teal/or logos and dog Biscuit`,
];

/**
 * Build a corpus with leaked lines embedded, meeting minimum length requirements.
 * Includes all leak patterns: numbered headings, meta lines, orphan body, personal details.
 */
function buildCorpusWithLeaks(): string {
  const substantive = `SERVICES AGREEMENT

This Agreement is entered into by and between Harbor Pool & Patio LLC ("Client") and Mesa Realty Group LLC ("Service Provider").

1. SERVICES
The Service Provider shall provide lead generation services to the Client.

2. COMPENSATION
Client shall pay Service Provider 7% of the deposit amount received from leads referred by Service Provider.

3. REFERRAL TERMS
All leads generated through this Agreement shall be subject to the terms herein.

4. CLAWBACK PROVISION
If the job falls through within 45 days, Service Provider must refund the fee.

5. EXCLUSIVITY
This Agreement is exclusive in the Phoenix metro area.

6. NON-SOLICITATION
Service Provider shall not poach or directly contact Client's existing customers.

7. TERM
This Agreement shall remain in effect for 12 months from the Effective Date.

8. CONFIDENTIALITY
All proprietary information shall remain confidential.

9. INDEMNIFICATION
Each party shall indemnify the other against third-party claims.

10. ENTIRE AGREEMENT

${HARBOR_META_HEADER_LINES[0]}

This Agreement constitutes the entire agreement between the parties.

${HARBOR_LEAK_FIXTURE_LINES[0]}

${HARBOR_LEAK_FIXTURE_LINES[1]}

${HARBOR_LEAK_FIXTURE_LINES[2]}

${HARBOR_LEAK_FIXTURE_LINES[3]}

${HARBOR_ORPHAN_BODY_LINES[0]}

${HARBOR_ORPHAN_BODY_LINES[1]}

${HARBOR_PERSONAL_DETAIL_LINES[0]}

1. We need fast turnaround.

14. NOTICES
All notices shall be sent to the addresses listed below.

13. GOVERNING LAW
This Agreement shall be governed by the laws of the State of Arizona.

IN WITNESS WHEREOF, the parties have executed this Agreement.`;
  return substantive;
}

describe("resolveCanonicalPlainForVisibleShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("strips Harbor leak lines from first Pro screen visible shell render path", () => {
    const corpusWithLeaks = buildCorpusWithLeaks();
    expect(corpusWithLeaks.length).toBeGreaterThanOrEqual(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);

    vi.mocked(resolvePaidProFirstReviewVisibleDisplayPlain).mockReturnValue({
      plain: corpusWithLeaks,
      source: "paid_pro_accepted_canonical_source_of_truth",
      fallbackReason: null,
      hasSoT: true,
      hasServerFullDoc: true,
      paidProActive: true,
    });

    const result = resolveCanonicalPlainForVisibleShell({
      paidProActive: true,
      premiumCheckoutCompleted: true,
    });

    // MUST NOT appear in output (leaked dump lines - numbered headings)
    expect(result.plain).not.toMatch(/11\.\s*Mesa Realty Group LLC.*said/i);
    expect(result.plain).not.toMatch(/12\.\s*Don't.*count.*house accounts/i);
    expect(result.plain).not.toMatch(/13\.\s*12 month deal/i);
    expect(result.plain).not.toMatch(/Commercial detail carried forward from user notes/i);

    // MUST NOT appear in output (PR #30 regression leaks)
    expect(result.plain).not.toMatch(/Signal persistence safeguards/i);
    expect(result.plain).not.toMatch(/^\s*count\s*$/m);
    expect(result.plain).not.toMatch(/our house accounts or anyone we already did a job for/i);
    expect(result.plain).not.toMatch(/Biscuit/i);
    expect(result.plain).not.toMatch(/\bteal\b/i);

    // MUST still appear (legitimate agreement content)
    expect(result.plain).toContain("SERVICES AGREEMENT");
    expect(result.plain).toContain("Harbor Pool & Patio LLC");
    expect(result.plain).toContain("Mesa Realty Group LLC");
    expect(result.plain).toContain("7%");
    expect(result.plain).toContain("Arizona");
    expect(result.plain).toContain("1. SERVICES");
    expect(result.plain).toContain("2. COMPENSATION");
    expect(result.plain).toContain("10. ENTIRE AGREEMENT");
    expect(result.plain).toContain("14. NOTICES");
    expect(result.plain).toContain("13. GOVERNING LAW");
    expect(result.plain).toContain("45 days");
    expect(result.plain).toContain("exclusive");
  });

  it("strips heading-then-body leak blocks where heading is on separate line from body", () => {
    // This tests the case where the leak appears as:
    // "11. Mesa Realty Group LLC" (heading)
    // "said they'll send us buyer..." (body on next block)
    // The regex must still match after slash normalization and stripping
    const corpusWithSplitLeaks = `SERVICES AGREEMENT

1. SCOPE
Services to be provided.

10. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement.

11. Mesa Realty Group LLC

said they'll send us buyer and listing leads if we pay them 7%.

12. Don't

count our house accounts or anyone we already did a job for.

13. 12 month deal

exclusive in the Phoenix metro.

14. NOTICES
All notices shall be sent.

IN WITNESS WHEREOF.

${"Substantive clause for length padding. ".repeat(30)}`;

    vi.mocked(resolvePaidProFirstReviewVisibleDisplayPlain).mockReturnValue({
      plain: corpusWithSplitLeaks,
      source: "paid_pro_accepted_canonical_source_of_truth",
      fallbackReason: null,
      hasSoT: true,
      hasServerFullDoc: true,
      paidProActive: true,
    });

    const result = resolveCanonicalPlainForVisibleShell({
      paidProActive: true,
      premiumCheckoutCompleted: true,
    });

    // Legitimate sections stay
    expect(result.plain).toContain("1. SCOPE");
    expect(result.plain).toContain("10. ENTIRE AGREEMENT");
    expect(result.plain).toContain("14. NOTICES");

    // Leak patterns are stripped (the heading line "11. Mesa Realty Group LLC" should be gone)
    // Note: The body line "said they'll send us..." may remain as orphaned body text,
    // but the numbered heading must not appear as a section heading
    expect(result.plain).not.toMatch(/^11\.\s*Mesa Realty Group LLC$/m);
    expect(result.plain).not.toMatch(/^12\.\s*Don't$/m);
    expect(result.plain).not.toMatch(/^13\.\s*12 month deal$/m);
  });

  it("preserves legitimate high-numbered sections with formal headings", () => {
    const legitimateCorpus = `SERVICES AGREEMENT

1. SCOPE
Services to be provided.

10. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement.

11. INDEMNIFICATION
Each party shall indemnify the other.

12. LIMITATION OF LIABILITY
Neither party shall be liable for consequential damages.

13. GOVERNING LAW
This Agreement shall be governed by Arizona law.

14. NOTICES
All notices shall be sent to the addresses below.

IN WITNESS WHEREOF.

${"Substantive clause for length padding. ".repeat(30)}`;

    vi.mocked(resolvePaidProFirstReviewVisibleDisplayPlain).mockReturnValue({
      plain: legitimateCorpus,
      source: "paid_pro_accepted_canonical_source_of_truth",
      fallbackReason: null,
      hasSoT: true,
      hasServerFullDoc: true,
      paidProActive: true,
    });

    const result = resolveCanonicalPlainForVisibleShell({
      paidProActive: true,
      premiumCheckoutCompleted: true,
    });

    // All legitimate sections preserved
    expect(result.plain).toContain("11. INDEMNIFICATION");
    expect(result.plain).toContain("12. LIMITATION OF LIABILITY");
    expect(result.plain).toContain("13. GOVERNING LAW");
    expect(result.plain).toContain("14. NOTICES");
  });

  it("strips Commercial detail meta line regardless of case variations", () => {
    const corpusWithMeta = `SERVICES AGREEMENT

1. SCOPE
Services to be provided.

10. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement.

Commercial detail carried forward from user notes (edit freely before send):

1. Quick turnaround needed.

14. NOTICES
All notices shall be sent.

IN WITNESS WHEREOF.

${"Substantive clause for length padding. ".repeat(30)}`;

    vi.mocked(resolvePaidProFirstReviewVisibleDisplayPlain).mockReturnValue({
      plain: corpusWithMeta,
      source: "paid_pro_accepted_canonical_source_of_truth",
      fallbackReason: null,
      hasSoT: true,
      hasServerFullDoc: true,
      paidProActive: true,
    });

    const result = resolveCanonicalPlainForVisibleShell({
      paidProActive: true,
      premiumCheckoutCompleted: true,
    });

    // Meta line must be stripped
    expect(result.plain).not.toMatch(/Commercial detail carried forward/i);

    // Legitimate sections preserved
    expect(result.plain).toContain("1. SCOPE");
    expect(result.plain).toContain("10. ENTIRE AGREEMENT");
    expect(result.plain).toContain("14. NOTICES");
  });

  it("strips orphan count/house accounts body fragments (PR #30 regression)", () => {
    const corpusWithOrphans = `SERVICES AGREEMENT

1. SCOPE
Services to be provided.

10. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement.

count

our house accounts or anyone we already did a job for last year.

14. NOTICES
All notices shall be sent.

IN WITNESS WHEREOF.

${"Substantive clause for length padding. ".repeat(30)}`;

    vi.mocked(resolvePaidProFirstReviewVisibleDisplayPlain).mockReturnValue({
      plain: corpusWithOrphans,
      source: "paid_pro_accepted_canonical_source_of_truth",
      fallbackReason: null,
      hasSoT: true,
      hasServerFullDoc: true,
      paidProActive: true,
    });

    const result = resolveCanonicalPlainForVisibleShell({
      paidProActive: true,
      premiumCheckoutCompleted: true,
    });

    // Orphan body fragments must be stripped
    expect(result.plain).not.toMatch(/^\s*count\s*$/m);
    expect(result.plain).not.toMatch(/our house accounts or anyone we already did a job for/i);

    // Legitimate sections preserved
    expect(result.plain).toContain("1. SCOPE");
    expect(result.plain).toContain("10. ENTIRE AGREEMENT");
    expect(result.plain).toContain("14. NOTICES");
  });

  it("strips Signal persistence safeguards meta header (PR #30 regression)", () => {
    const corpusWithSignal = `SERVICES AGREEMENT

1. SCOPE
Services to be provided.

10. ENTIRE AGREEMENT

Signal persistence safeguards:

This Agreement constitutes the entire agreement.

14. NOTICES
All notices shall be sent.

IN WITNESS WHEREOF.

${"Substantive clause for length padding. ".repeat(30)}`;

    vi.mocked(resolvePaidProFirstReviewVisibleDisplayPlain).mockReturnValue({
      plain: corpusWithSignal,
      source: "paid_pro_accepted_canonical_source_of_truth",
      fallbackReason: null,
      hasSoT: true,
      hasServerFullDoc: true,
      paidProActive: true,
    });

    const result = resolveCanonicalPlainForVisibleShell({
      paidProActive: true,
      premiumCheckoutCompleted: true,
    });

    // Signal meta header must be stripped
    expect(result.plain).not.toMatch(/Signal persistence safeguards/i);

    // Legitimate sections preserved
    expect(result.plain).toContain("1. SCOPE");
    expect(result.plain).toContain("10. ENTIRE AGREEMENT");
    expect(result.plain).toContain("14. NOTICES");
  });

  it("strips Biscuit/teal personal detail leaks (PR #30 regression)", () => {
    const corpusWithPersonalDetails = `SERVICES AGREEMENT

1. SERVICES
The Service Provider shall provide lead generation services.

2. SCOPE OF WORK

no teal/or logos and dog Biscuit

3. COMPENSATION
Client shall pay 7% of deposit.

14. NOTICES
All notices shall be sent.

IN WITNESS WHEREOF.

${"Substantive clause for length padding. ".repeat(30)}`;

    vi.mocked(resolvePaidProFirstReviewVisibleDisplayPlain).mockReturnValue({
      plain: corpusWithPersonalDetails,
      source: "paid_pro_accepted_canonical_source_of_truth",
      fallbackReason: null,
      hasSoT: true,
      hasServerFullDoc: true,
      paidProActive: true,
    });

    const result = resolveCanonicalPlainForVisibleShell({
      paidProActive: true,
      premiumCheckoutCompleted: true,
    });

    // Personal detail leaks must be stripped
    expect(result.plain).not.toMatch(/Biscuit/i);
    expect(result.plain).not.toMatch(/\bteal\b/i);

    // Legitimate sections preserved
    expect(result.plain).toContain("1. SERVICES");
    expect(result.plain).toContain("3. COMPENSATION");
    expect(result.plain).toContain("7%");
    expect(result.plain).toContain("14. NOTICES");
  });
});

/**
 * Test fixtures for paid pro fallback rebuild validation.
 * Verifies that rebuild bodies 200-999 chars paint correctly during paid first-review.
 */

const PRIYA_DIEGO_DUMP = `
Commercial consulting engagement between Priya Sharma Consulting LLC (Consultant) and Diego Martinez Enterprises (Client).
Consultant will provide marketing strategy services for $2,400 monthly.
Governing law: Texas.
Term: 6 months starting March 1, 2025.
`;

const MARCUS_ELENA_DUMP = `
Software development services agreement between Marcus Chen Technology Solutions (Provider) and Elena Rodriguez Digital Agency (Client).
Provider will develop custom web applications for $5,500 per milestone.
Governing law: California.
Term: 9 months with two milestone payments.
Confidentiality and IP assignment clauses required.
`;

function buildPriyaDiegoFallbackBody(): string {
  return `SERVICES AGREEMENT

This Agreement ("Agreement") is entered into by and between:

Priya Sharma Consulting LLC ("Consultant")
and
Diego Martinez Enterprises ("Client")

(collectively, the "Parties").

1. SERVICES
The service provider agrees to provide marketing strategy services.

2. PAYMENT TERMS
Payment of $2,400 monthly for services rendered under this Agreement.

3. TERM
This Agreement shall continue for 6 months unless earlier terminated by either Party with written notice.

4. GOVERNING LAW
This Agreement shall be governed by the laws of the State of Texas.

IN WITNESS WHEREOF, the parties have executed this Agreement.

___________________________
Priya Sharma Consulting LLC

___________________________
Diego Martinez Enterprises`;
}

function buildMarcusElenaFallbackBody(): string {
  return `SERVICES AGREEMENT

This Agreement ("Agreement") is entered into by and between:

Marcus Chen Technology Solutions ("Provider")
and
Elena Rodriguez Digital Agency ("Client")

(collectively, the "Parties").

1. SERVICES
The service provider agrees to develop custom web applications.

2. PAYMENT TERMS
Payment of $5,500 per milestone for services rendered under this Agreement.

3. TERM
This Agreement shall continue for 9 months with two milestone payments.

4. CONFIDENTIALITY
All proprietary information shall remain confidential.

5. GOVERNING LAW
This Agreement shall be governed by the laws of the State of California.

IN WITNESS WHEREOF, the parties have executed this Agreement.

___________________________
Marcus Chen Technology Solutions

___________________________
Elena Rodriguez Digital Agency`;
}

describe("resolvePaidProVisibleShellRenderBranch - fallback rebuild 200-999 chars", () => {
  it("returns canonical_plain_forced (not empty) for Priya/Diego rebuild 200-999 chars during paid first-review", () => {
    const fallbackBody = buildPriyaDiegoFallbackBody();
    expect(fallbackBody.length).toBeGreaterThanOrEqual(PAID_PRO_FALLBACK_REBUILD_MIN_LEN);
    expect(fallbackBody.length).toBeLessThan(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);

    const { branch, reason } = resolvePaidProVisibleShellRenderBranch({
      hasSoT: false,
      sotLen: 0,
      htmlLen: 0,
      canonicalPlainLen: fallbackBody.length,
      canonicalPlainSource: "paid_pro_fallback_rebuild",
      paidProFirstReviewActive: true,
    });

    expect(branch).toBe("canonical_plain_forced");
    expect(reason).toBe("paid_pro_fallback_rebuild_from_intake");
    expect(branch).not.toBe("empty");
  });

  it("returns canonical_plain_forced (not empty) for Marcus/Elena rebuild 200-999 chars during paid first-review", () => {
    const fallbackBody = buildMarcusElenaFallbackBody();
    expect(fallbackBody.length).toBeGreaterThanOrEqual(PAID_PRO_FALLBACK_REBUILD_MIN_LEN);
    expect(fallbackBody.length).toBeLessThan(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);

    const { branch, reason } = resolvePaidProVisibleShellRenderBranch({
      hasSoT: false,
      sotLen: 0,
      htmlLen: 0,
      canonicalPlainLen: fallbackBody.length,
      canonicalPlainSource: "paid_pro_fallback_rebuild",
      paidProFirstReviewActive: true,
    });

    expect(branch).toBe("canonical_plain_forced");
    expect(reason).toBe("paid_pro_fallback_rebuild_from_intake");
    expect(branch).not.toBe("empty");
  });

  it("still returns empty when canonicalPlainLen < 200 during paid first-review", () => {
    const { branch, reason } = resolvePaidProVisibleShellRenderBranch({
      hasSoT: false,
      sotLen: 0,
      htmlLen: 0,
      canonicalPlainLen: 150,
      canonicalPlainSource: "none",
      paidProFirstReviewActive: true,
    });

    expect(branch).toBe("empty");
    expect(reason).toBe("paid_pro_awaiting_display_authority");
  });

  it("still returns empty when paidProFirstReviewActive is false and canonicalPlainLen < 1001", () => {
    const fallbackBody = buildPriyaDiegoFallbackBody();
    expect(fallbackBody.length).toBeLessThan(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);

    const { branch, reason } = resolvePaidProVisibleShellRenderBranch({
      hasSoT: false,
      sotLen: 0,
      htmlLen: 0,
      canonicalPlainLen: fallbackBody.length,
      canonicalPlainSource: "none",
      paidProFirstReviewActive: false,
    });

    expect(branch).toBe("empty");
    expect(reason).toBe("no_sot_and_no_html");
  });

  it("prefers 1001+ SoT over fallback rebuild when both exist", () => {
    const longSoT = "A".repeat(1100);
    const fallbackBody = buildPriyaDiegoFallbackBody();

    const { branch, reason } = resolvePaidProVisibleShellRenderBranch({
      hasSoT: true,
      sotLen: longSoT.length,
      htmlLen: 0,
      canonicalPlainLen: longSoT.length,
      canonicalPlainSource: "paid_pro_accepted_canonical_source_of_truth",
      paidProFirstReviewActive: true,
    });

    expect(branch).toBe("canonical_plain_forced");
    expect(reason).toBe("paid_pro_accepted_canonical_source_of_truth");
  });
});

describe("resolveCanonicalPlainForVisibleShell - fallback rebuild 200-999 chars", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("paints Priya/Diego fallback body (200-999 chars) during paidProActive", () => {
    const fallbackBody = buildPriyaDiegoFallbackBody();
    expect(fallbackBody.length).toBeGreaterThanOrEqual(PAID_PRO_FALLBACK_REBUILD_MIN_LEN);
    expect(fallbackBody.length).toBeLessThan(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);

    vi.mocked(resolvePaidProFirstReviewVisibleDisplayPlain).mockReturnValue({
      plain: fallbackBody,
      source: "paid_pro_fallback_rebuild",
      fallbackReason: null,
      hasSoT: false,
      hasServerFullDoc: false,
      paidProActive: true,
    });

    const result = resolveCanonicalPlainForVisibleShell({
      paidProActive: true,
      premiumCheckoutCompleted: true,
    });

    expect(result.plain.length).toBeGreaterThanOrEqual(PAID_PRO_FALLBACK_REBUILD_MIN_LEN);
    expect(result.plain).toContain("Priya Sharma Consulting LLC");
    expect(result.plain).toContain("Diego Martinez Enterprises");
    expect(result.plain).toContain("$2,400");
    expect(result.plain).toContain("Texas");
  });

  it("paints Marcus/Elena fallback body (200-999 chars) during paidProActive", () => {
    const fallbackBody = buildMarcusElenaFallbackBody();
    expect(fallbackBody.length).toBeGreaterThanOrEqual(PAID_PRO_FALLBACK_REBUILD_MIN_LEN);
    expect(fallbackBody.length).toBeLessThan(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);

    vi.mocked(resolvePaidProFirstReviewVisibleDisplayPlain).mockReturnValue({
      plain: fallbackBody,
      source: "paid_pro_fallback_rebuild",
      fallbackReason: null,
      hasSoT: false,
      hasServerFullDoc: false,
      paidProActive: true,
    });

    const result = resolveCanonicalPlainForVisibleShell({
      paidProActive: true,
      premiumCheckoutCompleted: true,
    });

    expect(result.plain.length).toBeGreaterThanOrEqual(PAID_PRO_FALLBACK_REBUILD_MIN_LEN);
    expect(result.plain).toContain("Marcus Chen Technology Solutions");
    expect(result.plain).toContain("Elena Rodriguez Digital Agency");
    expect(result.plain).toContain("$5,500");
    expect(result.plain).toContain("California");
  });

  it("does NOT paint fallback body when paidProActive is false", () => {
    const fallbackBody = buildPriyaDiegoFallbackBody();

    vi.mocked(resolvePaidProFirstReviewVisibleDisplayPlain).mockReturnValue({
      plain: fallbackBody,
      source: "none",
      fallbackReason: null,
      hasSoT: false,
      hasServerFullDoc: false,
      paidProActive: false,
    });

    const result = resolveCanonicalPlainForVisibleShell({
      paidProActive: false,
    });

    expect(result.plain).toBe("");
  });

  it("both Priya/Diego and Marcus/Elena fallback bodies meet minimum length for display", () => {
    const priyaBody = buildPriyaDiegoFallbackBody();
    const marcusBody = buildMarcusElenaFallbackBody();

    expect(priyaBody.length).toBeGreaterThanOrEqual(PAID_PRO_FALLBACK_REBUILD_MIN_LEN);
    expect(marcusBody.length).toBeGreaterThanOrEqual(PAID_PRO_FALLBACK_REBUILD_MIN_LEN);

    expect(priyaBody.length).toBeLessThan(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);
    expect(marcusBody.length).toBeLessThan(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);
  });
});
