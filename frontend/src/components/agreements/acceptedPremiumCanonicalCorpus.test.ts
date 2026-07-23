/** @vitest-environment jsdom */
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
import { SHARED_ACCEPTED_PAID_BODY } from "./paidProSharedFixtureSystem";

/** Intake/purpose avoid AI/workflow tokens that arm the minimum-substance hard gate. */
const MINIMAL_INTAKE =
  "Professional services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC. Fee $96,000. Delaware law. Electronic signatures allowed.";
const acceptedBody = SHARED_ACCEPTED_PAID_BODY;

const servicesDraft: ParsedDraftShape = {
  title: "Services Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Red Mesa Logistics LLC", role: "Client" },
    { name: "Harbor Peak Automation LLC", role: "Service Provider" },
  ],
  purpose: "Professional consulting and implementation services.",
  payment_terms: "$96,000",
  duration: null,
  due_date: null,
  effective_date: null,
  payment: { amount: 96000, cadence: null, valid: true },
  agreement_family: "services_agreement",
};

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
    const md = `# Services Agreement\n\nBetween **Red Mesa Logistics LLC** and **Harbor Peak Automation LLC**.\n\n${acceptedBody}`;
    const record = establishAcceptedPremiumCanonicalCorpus({
      rawAcceptedBody: md,
      intakeText: MINIMAL_INTAKE,
      draft: servicesDraft,
      pipelineSource: "server_full_draft",
    });
    expect(record.text).not.toMatch(/\*\*/);
    expect(record.text).not.toMatch(/^#/m);
    expect(record.text).toContain("Red Mesa Logistics LLC");
    expect(record.text).toContain("Harbor Peak Automation LLC");
  });

  it("VS01 uses accepted corpus and may differ only by execution append", () => {
    const record = establishAcceptedPremiumCanonicalCorpus({
      rawAcceptedBody: acceptedBody,
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

  it("hydrateAcceptedPremiumCanonicalCorpusFromSnapshot returns null and does not establish SoT", () => {
    expect(hasPaidProSourceOfTruth()).toBe(false);
    const hydrated = hydrateAcceptedPremiumCanonicalCorpusFromSnapshot({
      savedAt: Date.now(),
      premiumDraft: servicesDraft,
      premiumParties: [],
      recipientCandidates: [],
      premiumAccepted: true,
      premiumPipelineRenderSource: "server_full_draft",
      acceptedPremiumCanonicalText: acceptedBody,
      acceptedPremiumCanonicalHash: "f".repeat(64),
      acceptedPremiumCanonicalPipelineSource: "server_full_draft",
      paidProSourceOfTruthText: acceptedBody,
      paidProSourceOfTruthHash: "f".repeat(64),
      paidProSourceOfTruthAcceptedAt: Date.now(),
      paidProSourceOfTruthSource: "server_full_draft",
    });
    expect(hydrated).toBeNull();
    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(getAcceptedPremiumDisplayText()).toBe("");
  });

  it("display stays on accepted hash even when canonicalizer would rewrite the same raw input", () => {
    const broken = `This SERVICES AGREEMENT (the "Agreement") is This Agreement is between Red Mesa and Harbor Peak.\n\n${acceptedBody}`;
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
