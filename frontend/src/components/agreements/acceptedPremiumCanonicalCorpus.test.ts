import { afterEach, describe, expect, it, vi } from "vitest";
import * as proAgreementCanonicalizer from "./proAgreementCanonicalizer";
import { canonicalizeProAgreementText } from "./proAgreementCanonicalizer";
import {
  clearAcceptedPremiumCanonicalCorpus,
  establishAcceptedPremiumCanonicalCorpus,
  getAcceptedPremiumCorpusForVs01Signing,
  getAcceptedPremiumDisplayText,
  hydrateAcceptedPremiumCanonicalCorpusFromSnapshot,
  logAcceptedPremiumCorpusInstrumentation,
} from "./acceptedPremiumCanonicalCorpus";
import {
  getPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
  logPaidProCorpusInvariant,
} from "./paidProSourceOfTruth";
import { hashPlainTextCorpus } from "./premiumReadonlyRenderCorpus";
import { pickPremiumPaidReadonlyPlainText } from "./premiumReadonlyRenderCorpus";
import { polishedAuthoritativeProPlainForCopy } from "./polishProAgreementDisplayLayer";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const MINIMAL_INTAKE = `
Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup.
Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.
`.trim();

const servicesDraft: ParsedDraftShape = {
  title: "Services Agreement",
  jurisdiction: "Texas",
  parties: [
    { name: "Red Mesa Logistics LLC", role: "Client" },
    { name: "Harbor Peak Automation LLC", role: "Service Provider" },
  ],
  purpose: "AI workflow setup.",
  payment_terms: "$5,000",
  duration: null,
  due_date: null,
  effective_date: null,
  payment: { amount: 5000, cadence: null, valid: true },
  agreement_family: "services_agreement",
};

function padBody(core: string, minLen = 2_700): string {
  const pad = " Commercial services clause with reasonable performance standards. ".repeat(30);
  let t = core;
  while (t.length < minLen) t += pad;
  return t;
}

const acceptedBody = padBody(`
SERVICES AGREEMENT

This SERVICES AGREEMENT (the "Agreement") is between Red Mesa Logistics LLC ("Client") and Harbor Peak Automation LLC ("Service Provider").

1. Scope. Provider delivers AI workflow setup.

2. Fees. Client pays Provider $5,000.

3. Governing Law. Texas.

4. Confidentiality. Mutual duties apply.

5. Termination. Material breach with notice.

6. Entire Agreement. Electronic signatures permitted.
`);

afterEach(() => {
  clearAcceptedPremiumCanonicalCorpus();
});

describe("acceptedPremiumCanonicalCorpus", () => {
  it("display, copy, and final review share identical hash after establishment", () => {
    const record = establishAcceptedPremiumCanonicalCorpus({
      rawAcceptedBody: acceptedBody,
      intakeText: MINIMAL_INTAKE,
      draft: servicesDraft,
      pipelineSource: "server_full_draft",
    });
    const display = getAcceptedPremiumDisplayText();
    const copy = polishedAuthoritativeProPlainForCopy(["short fallback"], {
      acceptedAuthoritativeBody: record.text,
      draft: servicesDraft,
      intakeText: MINIMAL_INTAKE,
    });
    const finalReview = getAcceptedPremiumDisplayText();
    expect(hashPlainTextCorpus(display)).toBe(record.hash);
    expect(hashPlainTextCorpus(copy)).toBe(record.hash);
    expect(hashPlainTextCorpus(finalReview)).toBe(record.hash);
    expect(display.length).toBe(record.acceptedLen);
    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(getPaidProSourceOfTruth()?.source).toBe("server_full_draft");
  });

  it("does not pass accepted corpus through destructive canonicalizer", () => {
    establishAcceptedPremiumCanonicalCorpus({
      rawAcceptedBody: acceptedBody,
      intakeText: MINIMAL_INTAKE,
      draft: servicesDraft,
      pipelineSource: "server_full_draft",
    });
    const canonicalSpy = vi.spyOn(proAgreementCanonicalizer, "canonicalizeProAgreementText");
    const pick = pickPremiumPaidReadonlyPlainText({
      draft: servicesDraft,
      intakeText: MINIMAL_INTAKE,
      premiumCheckoutCompleted: true,
      premiumWinningBodyText: "z".repeat(880),
      premiumReadonlySnapshotText: "z".repeat(880),
      agreementDocumentText: "z".repeat(880),
      paidAuthoritativeProBody: acceptedBody,
      lastPremiumPipelineRenderSource: "server_full_draft",
    });
    expect(pick.plainText.length).toBeGreaterThan(2_000);
    expect(canonicalSpy).not.toHaveBeenCalled();
    canonicalSpy.mockRestore();
  });

  it("strips markdown artifacts without renumbering", () => {
    const md = padBody(
      `# Services Agreement\n\nBetween **Red Mesa Logistics LLC** and **Harbor Peak Automation LLC**.\n\n1. Fees. $5,000.\n\n2. Confidentiality. Duties.\n\n3. Confidentiality. Duplicate.`,
      2_000,
    );
    const record = establishAcceptedPremiumCanonicalCorpus({
      rawAcceptedBody: md,
      intakeText: MINIMAL_INTAKE,
      draft: servicesDraft,
      pipelineSource: "server_full_draft",
    });
    expect(record.text).not.toMatch(/\*\*/);
    expect(record.text).not.toMatch(/^#/m);
    expect((record.text.match(/Confidentiality/gi) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("VS01 uses accepted corpus and may differ only by execution append", () => {
    const withoutSig = padBody(
      "SERVICES AGREEMENT\n\nBetween Red Mesa Logistics LLC and Harbor Peak Automation LLC.\n\n1. Fees. $5,000.\n\n2. Law. Texas.",
      2_000,
    );
    const record = establishAcceptedPremiumCanonicalCorpus({
      rawAcceptedBody: withoutSig,
      intakeText: MINIMAL_INTAKE,
      draft: servicesDraft,
      pipelineSource: "server_full_draft",
    });
    const vs01 = getAcceptedPremiumCorpusForVs01Signing({
      draft: servicesDraft,
      intakeText: MINIMAL_INTAKE,
    });
    const inst = logAcceptedPremiumCorpusInstrumentation({
      displayed: record.text,
      copied: record.text,
      finalReview: record.text,
      vs01,
    });
    expect(inst?.vs01_matches_accepted_or_execution_only).toBe(true);
    expect(vs01.length).toBeGreaterThanOrEqual(record.acceptedLen);
  });

  it("hydrates immutable snapshot fields without re-running canonicalizer", () => {
    const record = establishAcceptedPremiumCanonicalCorpus({
      rawAcceptedBody: acceptedBody,
      intakeText: MINIMAL_INTAKE,
      draft: servicesDraft,
      pipelineSource: "server_full_draft",
    });
    clearAcceptedPremiumCanonicalCorpus();
    const hydrated = hydrateAcceptedPremiumCanonicalCorpusFromSnapshot({
      savedAt: Date.now(),
      premiumDraft: servicesDraft,
      premiumParties: [],
      recipientCandidates: [],
      premiumAccepted: true,
      premiumPipelineRenderSource: "server_full_draft",
      acceptedPremiumCanonicalText: record.text,
      acceptedPremiumCanonicalHash: record.hash,
      acceptedPremiumCanonicalPipelineSource: "server_full_draft",
      paidProSourceOfTruthText: record.text,
      paidProSourceOfTruthHash: record.hash,
      paidProSourceOfTruthAcceptedAt: Date.now(),
      paidProSourceOfTruthSource: "server_full_draft",
    });
    expect(hydrated?.hash).toBe(record.hash);
    expect(getAcceptedPremiumDisplayText()).toBe(record.text);
  });

  it("display stays on accepted hash even when canonicalizer would rewrite the same raw input", () => {
    const broken = padBody(
      'This SERVICES AGREEMENT (the "Agreement") is This Agreement is between Red Mesa and Harbor Peak.\n\n1. Fees. $5,000.\n\n2. Confidentiality.\n\n3. Confidentiality.',
      2_000,
    );
    const record = establishAcceptedPremiumCanonicalCorpus({
      rawAcceptedBody: broken,
      intakeText: MINIMAL_INTAKE,
      draft: servicesDraft,
      pipelineSource: "server_full_draft",
    });
    const mutated = canonicalizeProAgreementText(broken, {
      canonicalPartyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      canonicalRoles: ["Client", "Service Provider"],
      intakeText: MINIMAL_INTAKE,
      surface: "test_should_not_run_on_accepted",
    }).text;
    expect(mutated).not.toBe(broken);
    expect(hashPlainTextCorpus(getAcceptedPremiumDisplayText())).toBe(record.hash);
  });

  it("logs paid-pro-corpus-invariant-violation when a post-acceptance corpus diverges", () => {
    const record = establishAcceptedPremiumCanonicalCorpus({
      rawAcceptedBody: acceptedBody,
      intakeText: MINIMAL_INTAKE,
      draft: servicesDraft,
      pipelineSource: "server_full_draft",
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const inst = logPaidProCorpusInvariant({
      displayed: record.text,
      copied: `${record.text}\n\nUnexpected fallback mutation.`,
      review: record.text,
      finalized: record.text,
      vs01: record.text,
    });
    expect(inst?.copied_matches).toBe(false);
    expect(spy).toHaveBeenCalledWith(
      "[paid-pro-corpus-invariant-violation]",
      expect.objectContaining({ copied_matches: false }),
    );
    spy.mockRestore();
  });
});
