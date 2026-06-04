import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPaidProAuthoritySurfaceLogDedupeForTests } from "./paidProAuthoritySurfaceLog";
import * as postFreezeInvariant from "./paidProPostFreezeCorpusInvariant";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  buildPostFreezeCorpusByteDiffPayload,
  isPostFreezeAuthorizedSignerOverlayDrift,
} from "./paidProPostFreezeCorpusInvariant";
import {
  decidePostFreezeCorpusInstrumentation,
  detectPostFreezeStructuralDrift,
  logPostFreezeCorpusDrift,
  setPaidProInstrumentationLogForceForTests,
} from "./paidProExecutionBlockInstrumentation";

const WITNESS_TAIL =
  "\n\nIN WITNESS WHEREOF, the parties execute.\n\nCLIENT:\nAlpha LLC\n\nSERVICE PROVIDER:\nBeta LLC\n";

function corpusBody(marker: string): string {
  return `${"Consulting scope and deliverables. ".repeat(24)}\n\n10. Final.\n${marker}`;
}

describe("paidProExecutionBlockInstrumentation", () => {
  beforeEach(() => {
    resetPaidProAuthoritySurfaceLogDedupeForTests();
    setPaidProInstrumentationLogForceForTests(true);
  });

  afterEach(() => {
    setPaidProInstrumentationLogForceForTests(false);
    clearPaidProSourceOfTruth();
    resetPaidProAuthoritySurfaceLogDedupeForTests();
  });

  it("Case A: frozenHash == renderedHash → canonical-establish-reconcile, no post-freeze-corpus-drift", () => {
    const plain = corpusBody(WITNESS_TAIL);
    establishPaidProSourceOfTruth({ text: plain, source: "server_full_draft" });
    const record = getPaidProSourceOfTruth()!;
    const sotPlain = record.text;

    const decision = decidePostFreezeCorpusInstrumentation({
      surface: "test_boundary_match",
      renderedText: sotPlain,
      frozenHash: record.hash,
      frozenPlain: sotPlain,
    });
    expect(decision.emit).toBe("canonical_establish_reconcile");
    expect(decision.identical).toBe(true);

    resetPaidProAuthoritySurfaceLogDedupeForTests();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logPostFreezeCorpusDrift({
      surface: "test_boundary_match",
      renderedText: sotPlain,
      frozenHash: record.hash,
    });

    const reconcile = infoSpy.mock.calls.filter(
      (c) =>
        c[0] === "[canonical-establish-reconcile]" &&
        (c[1] as { classification?: string }).classification === "corpus_boundary_match",
    );
    const drift = infoSpy.mock.calls.filter((c) => c[0] === "[post-freeze-corpus-drift]");
    expect(reconcile.length).toBe(1);
    expect((reconcile[0]![1] as { identical?: boolean }).identical).toBe(true);
    expect(drift).toHaveLength(0);
    infoSpy.mockRestore();
  });

  it("Case B: frozenHash != renderedHash → post-freeze-corpus-drift emitted", () => {
    const frozen = corpusBody(WITNESS_TAIL);
    establishPaidProSourceOfTruth({ text: frozen, source: "server_full_draft" });
    const record = getPaidProSourceOfTruth()!;
    const mutated = `${record.text}\n\n9. Injected clause after freeze.`;

    const decision = decidePostFreezeCorpusInstrumentation({
      surface: "test_hash_drift",
      renderedText: mutated,
      frozenHash: record.hash,
      frozenPlain: record.text,
    });
    expect(decision.emit).toBe("post_freeze_corpus_drift");
    expect(decision.identical).toBe(false);

    vi.spyOn(postFreezeInvariant, "assertPostFreezeRenderedCorpusMatchesFrozen").mockImplementation(
      () => {},
    );
    resetPaidProAuthoritySurfaceLogDedupeForTests();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logPostFreezeCorpusDrift({
      surface: "test_hash_drift",
      renderedText: mutated,
      frozenHash: record.hash,
    });

    const drift = infoSpy.mock.calls.filter((c) => c[0] === "[post-freeze-corpus-drift]");
    const reconcileMatch = infoSpy.mock.calls.filter(
      (c) =>
        c[0] === "[canonical-establish-reconcile]" &&
        (c[1] as { classification?: string }).classification === "corpus_boundary_match",
    );
    expect(drift.length).toBe(1);
    expect((drift[0]![1] as { identical?: boolean }).identical).toBe(false);
    expect(reconcileMatch).toHaveLength(0);
    infoSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("Case C: executionBlockCount changes → post-freeze-corpus-drift emitted", () => {
    const oneBlock = corpusBody(WITNESS_TAIL);
    establishPaidProSourceOfTruth({ text: oneBlock, source: "server_full_draft" });
    const record = getPaidProSourceOfTruth()!;
    const twoBlocks = `${record.text}${WITNESS_TAIL}`;
    expect(detectPostFreezeStructuralDrift(record.text, twoBlocks)).toBe(true);

    const decision = decidePostFreezeCorpusInstrumentation({
      surface: "test_execution_block_drift",
      renderedText: twoBlocks,
      frozenHash: record.hash,
      frozenPlain: record.text,
    });
    expect(decision.emit).toBe("post_freeze_corpus_drift");
    expect(decision.structuralDrift).toBe(true);

    vi.spyOn(postFreezeInvariant, "assertPostFreezeRenderedCorpusMatchesFrozen").mockImplementation(
      () => {},
    );
    resetPaidProAuthoritySurfaceLogDedupeForTests();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logPostFreezeCorpusDrift({
      surface: "test_execution_block_drift",
      renderedText: twoBlocks,
      frozenHash: record.hash,
    });

    const drift = infoSpy.mock.calls.filter((c) => c[0] === "[post-freeze-corpus-drift]");
    expect(drift.length).toBe(1);
    expect((drift[0]![1] as { executionBlockCount?: number }).executionBlockCount).toBeGreaterThan(1);
    infoSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("suppresses post-freeze drift for authorized signature-region overlay (3-byte tail)", () => {
    const frozen = corpusBody(
      `${WITNESS_TAIL}\n\nCLIENT:\nAlpha LLC\nName:\n\nTitle:\n\nSERVICE PROVIDER:\nBeta LLC\nName:\n\nTitle:\n`,
    );
    const rendered = corpusBody(
      `${WITNESS_TAIL}\n\nCLIENT:\nAlpha LLC\nName: Pat Lee\nTitle: CEO\n\nSERVICE PROVIDER:\nBeta LLC\nName: Sam Lee\nTitle: VP\n`,
    );
    establishPaidProSourceOfTruth({ text: frozen, source: "server_full_draft" });
    const record = getPaidProSourceOfTruth()!;
    expect(isPostFreezeAuthorizedSignerOverlayDrift(frozen, rendered)).toBe(true);
    const diff = buildPostFreezeCorpusByteDiffPayload(frozen, rendered, "test_signer_overlay");
    expect(diff.lenDelta).toBeGreaterThan(0);
    expect(typeof diff.firstChangeOffset).toBe("number");

    const decision = decidePostFreezeCorpusInstrumentation({
      surface: "paid_pro_review_render",
      renderedText: rendered,
      frozenHash: record.hash,
      frozenPlain: frozen,
      mutationSource: "signer_identity_apply",
    });
    expect(decision.emit).not.toBe("post_freeze_corpus_drift");

    resetPaidProAuthoritySurfaceLogDedupeForTests();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logPostFreezeCorpusDrift({
      surface: "paid_pro_review_render",
      renderedText: rendered,
      frozenHash: record.hash,
      mutationSource: "signer_identity_apply",
    });
    expect(infoSpy.mock.calls.filter((c) => c[0] === "[post-freeze-corpus-drift]")).toHaveLength(0);
    infoSpy.mockRestore();
  });

  it("never logs post-freeze-corpus-drift with identical: true", () => {
    const plain = corpusBody(WITNESS_TAIL);
    establishPaidProSourceOfTruth({ text: plain, source: "server_full_draft" });
    const record = getPaidProSourceOfTruth()!;

    resetPaidProAuthoritySurfaceLogDedupeForTests();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logPostFreezeCorpusDrift({
      surface: "paid_pro_source_of_truth_establish",
      renderedText: record.text,
      frozenHash: record.hash,
    });
    logPostFreezeCorpusDrift({
      surface: "paid_pro_review_render",
      renderedText: record.text,
      frozenHash: record.hash,
    });

    const drift = infoSpy.mock.calls.filter((c) => c[0] === "[post-freeze-corpus-drift]");
    const reconcile = infoSpy.mock.calls.filter(
      (c) =>
        c[0] === "[canonical-establish-reconcile]" &&
        (c[1] as { classification?: string }).classification === "corpus_boundary_match",
    );
    expect(drift).toHaveLength(0);
    expect(reconcile.length).toBe(2);
    infoSpy.mockRestore();
  });
});
