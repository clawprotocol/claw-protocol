/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import {
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { applyPaidProSectionHeadingTitleAuthority } from "./paidProSectionHeadingTitleAuthority";
import {
  buildTest439CorruptedServerDraft,
  TEST439_HARBOR_PEAK,
  TEST439_INTAKE_WITH_SIGNERS,
  TEST439_MIN_SERVER_LEN,
  TEST439_RED_MESA,
  test439Draft,
} from "./paidProTest439Fixtures";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

const HARBOR_STANDALONE_RE = /Harbor Peak Automation(?!\s+LLC)/;

function extractRecital(text: string): string {
  const witness = text.search(/\bIN WITNESS WHEREOF\b/i);
  const head = witness >= 0 ? text.slice(0, witness) : text;
  const notices = head.search(/\n\d+\.?\s*NOTICES\b/i);
  return notices >= 0 ? head.slice(0, notices) : head.slice(0, Math.min(head.length, 4500));
}

function extractNotices(text: string): string {
  const start = text.search(/\n\d+\.?\s*NOTICES\b/i);
  if (start < 0) return "";
  const witness = text.search(/\bIN WITNESS WHEREOF\b/i);
  return witness >= 0 ? text.slice(start, witness) : text.slice(start);
}

function extractServiceProviderSignature(text: string): string {
  const witness = text.search(/\bIN WITNESS WHEREOF\b/i);
  const tail = witness >= 0 ? text.slice(witness) : text;
  const sp = tail.search(/\bSERVICE\s+PROVIDER\s*:/i);
  return sp >= 0 ? tail.slice(sp) : "";
}

describe("TEST439 — Pro section heading title authority (Red Mesa / Harbor Peak)", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
    });
    resetPaidProPipelineTestIsolation();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    resetPaidProPipelineTestIsolation();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("repairs split comma headings and orphan fragments in isolation", () => {
    const corrupted = buildTest439CorruptedServerDraft();
    const { text, repairs } = applyPaidProSectionHeadingTitleAuthority(corrupted);
    expect(repairs.length).toBeGreaterThan(0);
    expect(text.split("\n").some((line) => line.trim() === "3. Fees,")).toBe(false);
    expect(text.split("\n").some((line) => line.trim() === "8. Term,")).toBe(false);
    expect(text).not.toMatch(/\nOwnership, Licenses and\n/);
    expect(text).not.toMatch(/\nClient Materials\n(?=\n*4\.)/);
    expect(text).not.toMatch(/\nResponsibilities, Compliance and Relationship of the\n/);
    expect(text).toMatch(/3\. Fees, Invoicing and Expenses/);
    expect(text).toMatch(/8\. Term, Termination and Effect of Termination/);
  });

  it("freeze commit accepts repaired corpus with full Harbor Peak LLC in recital, notices, and signature", () => {
    const server = buildTest439CorruptedServerDraft();
    expect(server.length).toBeGreaterThan(TEST439_MIN_SERVER_LEN - 500);

    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      test439Draft(),
      TEST439_INTAKE_WITH_SIGNERS,
      { surface: "test439_prepare" },
    );

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test439Draft(),
      intakeText: TEST439_INTAKE_WITH_SIGNERS,
      agreementGenerationId: "gen-test439",
      surface: "test439_freeze_commit",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);

    const frozen = freezeCommit.text;
    expect(frozen.split("\n").some((line) => line.trim() === "3. Fees,")).toBe(false);
    expect(frozen.split("\n").some((line) => line.trim() === "8. Term,")).toBe(false);
    expect(frozen).not.toMatch(/\nOwnership, Licenses and\n/);
    expect(frozen).not.toMatch(/\nClient Materials\n(?=\n*4\.)/);
    expect(frozen).not.toMatch(/\nResponsibilities, Compliance and Relationship of the\n/);

    const recital = extractRecital(frozen);
    expect(recital).toContain(TEST439_HARBOR_PEAK);
    expect(recital).not.toMatch(HARBOR_STANDALONE_RE);

    const notices = extractNotices(frozen);
    expect(notices).toContain(TEST439_HARBOR_PEAK);
    expect(notices).not.toMatch(HARBOR_STANDALONE_RE);

    const signature = extractServiceProviderSignature(frozen);
    expect(signature).toContain(TEST439_HARBOR_PEAK);
    expect(signature).not.toMatch(HARBOR_STANDALONE_RE);
  });

  it("establishes SoT from repaired freeze candidate", () => {
    const server = buildTest439CorruptedServerDraft();
    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      test439Draft(),
      TEST439_INTAKE_WITH_SIGNERS,
      { surface: "test439_sot_prepare" },
    );
    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test439Draft(),
      intakeText: TEST439_INTAKE_WITH_SIGNERS,
      agreementGenerationId: "gen-test439-sot",
      surface: "test439_sot_freeze",
    });
    expect(freezeCommit.ok).toBe(true);

    establishPaidProSourceOfTruth({
      text: freezeCommit.text,
      source: "test439_sot",
      reviewSessionId: "gen-test439-sot",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    const sot = getPaidProSourceOfTruthText();
    expect(sot).toContain(TEST439_RED_MESA);
    expect(sot).toContain(TEST439_HARBOR_PEAK);
    expect(sot.split("\n").some((line) => line.trim() === "3. Fees,")).toBe(false);
  });
});
