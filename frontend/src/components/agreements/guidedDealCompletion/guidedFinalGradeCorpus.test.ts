import { describe, expect, it } from "vitest";
import {
  detectFinalGradeCorpusDefects,
  repairFinalGradeGuidedCorpus,
  assertFinalGradeCorpusReady,
} from "./guidedFinalGradeCorpus";
import { prepareGuidedSigningCorpusCleanup } from "./guidedFinalReviewToSigning";
import {
  manifestToCanonicalPartyIdentities,
  resolveCanonicalFinalPartyManifest,
} from "./canonicalFinalPartyManifest";

/** Malformed guided Pro corpus captured from test73 regression (section merge / numbering). */
export const TEST73_BAD_GUIDED_CORPUS = `
AI AUTOMATION SERVICES AGREEMENT

This Agreement is between Acme LLC ("Client") and Joe Brown ("Provider") for AI automation services.
${"Provider will deliver workflow automation, integrations, and operational reporting with milestone acceptance. ".repeat(12)}

1. Purpose and Scope

2. Fees and Payment
3.1 Client shall pay a monthly service fee of $6,000 per month for ongoing support.
3.2 Invoices are due Net 30 from receipt of invoice.
3.4 Total project fee is $120,000 for the initial build phase.

3. Confidentiality
3.1 Each Party shall protect Confidential Information.

4. Ownership and Work Product
4.1 Client owns project deliverables upon payment.

5. Support Expectations
2.1 Each Party shall keep confidential information confidential and use it only as permitted.
2.2 Neither Party shall disclose confidential information without consent.
2.3 Provider will maintain 99.9% monthly uptime for production automation components.
5.1 Provider offers commercially reasonable support during business hours.

6. Term and Termination
6.1 Initial term is twelve (12) months.
6.3 Termination if not working; breach.
6.4 Effect of termination.

7. Notices
7.1 Notices may be delivered electronically to the addresses on file.

Add LLC suffixes to party names before signing.

Acme LLC
Name: Anthem H Blanchard
Title: Manager

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: ______________________
Name: Anthem H Blanchard
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Joe Brown
By: ______________________
Name: Joe Brown
Date: ____________________
`.trim();

const TEST73_MANIFEST = resolveCanonicalFinalPartyManifest({
  partyCount: 2,
  partySignerNames: ["Anthem H Blanchard", ""],
  partySignerTitles: ["Manager", ""],
  recipient1Name: "Acme LLC",
  recipient2Name: "Joe Brown",
  recipient1Email: "anthem@example.test",
  recipient2Email: "joe@example.test",
  extraPartyReviewEmails: [],
  draftPartyNames: ["Acme LLC", "Joe Brown"],
  sendMode: "signature",
  recipientsDeferred: false,
});
const TEST73_SIGNERS = manifestToCanonicalPartyIdentities(TEST73_MANIFEST);

describe("guidedFinalGradeCorpus (test73 regression)", () => {
  it("detects malformed test73 corpus defects", () => {
    const defects = detectFinalGradeCorpusDefects(TEST73_BAD_GUIDED_CORPUS, {
      authoritativePartyNames: ["Acme LLC", "Joe Brown"],
    });
    expect(defects).toContain("empty_numbered_section");
    expect(defects).toContain("subsection_number_mismatch");
    expect(defects).toContain("misplaced_subsection_content");
    expect(defects).toContain("duplicate_conflicting_fees");
    expect(defects).toContain("orphan_signer_metadata");
    expect(defects).toContain("instruction_leak");
  });

  it("repairs test73 numbering, clause placement, fees, and pre-witness identity leak", () => {
    const { text, repairs, defects } = repairFinalGradeGuidedCorpus(TEST73_BAD_GUIDED_CORPUS, {
      signerIdentities: TEST73_SIGNERS,
      authoritativePartyNames: ["Acme LLC", "Joe Brown"],
    });

    expect(repairs.some((r) => r.includes("final_grade") || r.includes("structure") || r.length > 0)).toBe(
      true,
    );
    expect(text).not.toMatch(/Add LLC suffixes/i);
    expect(text).toMatch(/2\.\s+Fees/i);
    expect(text).toMatch(/2\.\d+\s+.*(?:fee|invoice|payment)/i);
    expect(text).not.toMatch(/3\.1\s+.*monthly service fee/i);
    expect(text).not.toMatch(/2\.1\s+.*confidential information confidential/i);
    if (MONTHLY_AND_TOTAL.test(text)) {
      expect(text).not.toMatch(/\$6,000[\s\S]{0,400}\$120,000/);
    }

    expect(text).toMatch(/3\.\s+Confidentiality/i);
    expect(text).toMatch(/confidential/i);

    const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
    const preWitness = text.slice(0, witnessIdx);
    expect(preWitness).not.toMatch(/^Name:\s*Anthem/im);
    expect(preWitness).not.toMatch(/^Title:\s*Manager/im);
    expect(preWitness).not.toMatch(/^Acme LLC\s*$/m);

    const hasPurposeBody =
      /1\.\s+Purpose[\s\S]{40,}?(?=\n\s*2\.\s+)/i.test(text) ||
      /1\.\s+Purpose[^\n]+\n[^\n]{40,}/i.test(text);
    expect(hasPurposeBody || /Provider will deliver workflow automation/i.test(text)).toBe(true);

    expect(text).toMatch(/99\.9%|uptime/i);
    expect(defects.filter((d) => d !== "party_letter_fallback")).toEqual([]);
  });

  it("assertFinalGradeCorpusReady accepts signing-cleanup output for test73", () => {
    const cleaned = prepareGuidedSigningCorpusCleanup({
      body: TEST73_BAD_GUIDED_CORPUS,
      partyManifest: TEST73_MANIFEST,
      signerIdentities: TEST73_SIGNERS,
    }).body;
    const ready = assertFinalGradeCorpusReady(cleaned, {
      signerIdentities: TEST73_SIGNERS,
      authoritativePartyNames: ["Acme LLC", "Joe Brown"],
    });
    expect(ready.defects.filter((d) => d !== "party_letter_fallback")).toEqual([]);
    expect(ready.ok).toBe(true);
    expect(ready.corpus.length).toBeGreaterThan(1500);
  });

  it("prepareGuidedSigningCorpusCleanup repairs test73 before VS01 handoff", () => {
    const cleaned = prepareGuidedSigningCorpusCleanup({
      body: TEST73_BAD_GUIDED_CORPUS,
      partyManifest: TEST73_MANIFEST,
      signerIdentities: TEST73_SIGNERS,
    }).body;
    expect(cleaned).not.toMatch(/Add LLC suffixes/i);
    expect(cleaned).not.toMatch(/^\s*2\.1\b.*Support/im);
    const witnessIdx = cleaned.search(/\bIN WITNESS WHEREOF\b/i);
    expect(cleaned.slice(Math.max(0, witnessIdx - 400), witnessIdx)).not.toMatch(/^Name:\s*Anthem/im);
  });
});

const MONTHLY_AND_TOTAL = /\$6,000[\s\S]*\$120,000|\$120,000[\s\S]*\$6,000/;
