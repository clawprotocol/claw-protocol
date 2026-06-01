import { afterEach, describe, expect, it } from "vitest";
import {
  assertNoPostAcceptanceStructuralMutation,
  clearAuthoritativeAgreementDocument,
  clearPostAcceptanceMutationAuditBuffer,
  establishAuthoritativeAgreementDocument,
  getAuthoritativeAgreementDocument,
  readPostAcceptanceMutationAuditBuffer,
  returnAuthoritativeTextForIllegalPostAcceptanceGeneration,
  setPostAcceptanceMutationAuditCapture,
} from "../../authoritativeAgreementDocument";
import { clearAuthoritativeSigningSnapshot } from "../../authoritativeSigningSnapshot";
import { clearPaidProPinnedSignerAppliedCorpus } from "../../paidProFinalHydratedCorpus";
import { clearConsumedPaidProSignerMetadataAuthority } from "../../paidProSignerMetadataAuthority";
import { clearPaidProSourceOfTruth } from "../../paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "../../paidProReviewRenderCorpus";
import { resetPaidProMutationTraceForTests } from "../../paidProMutationTrace";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
} from "../paidProHardening/paidProHardeningFixtures";
import { normalizeCorpusForCopyCompare } from "./paidProCorpusIntegrityMetrics";

const FIXTURE = "freeProQaTemplateATest204";

describe("paidProCorpusIntegrity post-acceptance mutation audit", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
    clearAuthoritativeAgreementDocument();
    clearPostAcceptanceMutationAuditBuffer();
    setPostAcceptanceMutationAuditCapture(false);
    resetPaidProMutationTraceForTests();
  });

  it("records guard events and leaves user-visible review plain unchanged (SAFE GUARDRAIL)", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    const { acceptedText } = armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    establishAuthoritativeAgreementDocument({
      fullCorpusText: acceptedText,
      generationMetadata: { source: "server_full_draft", rawAcceptedLen: acceptedText.length },
    });
    setPostAcceptanceMutationAuditCapture(true);

    const opts = { draft: fixture.draft, intakeText: fixture.intakeText };
    const visibleBefore = resolvePaidProReviewRenderPlain(opts);
    const authHashBefore = getAuthoritativeAgreementDocument()?.authoritativeHash ?? "";

    expect(() =>
      assertNoPostAcceptanceStructuralMutation({
        surface: "integrity_audit",
        mutation: "synthetic_post_acceptance_append",
        inputText: acceptedText,
        outputText: `${acceptedText}\n\n9. Injected clause after acceptance.`,
      }),
    ).toThrow(/illegal-post-acceptance-mutation-attempt/);

    expect(() =>
      returnAuthoritativeTextForIllegalPostAcceptanceGeneration({
        surface: "integrity_audit",
        builder: "synthetic_independent_builder",
        generatedText: `${acceptedText}\n\nDUPLICATE EXECUTION BLOCK.`,
      }),
    ).toThrow(/illegal-post-acceptance-mutation-attempt/);

    const visibleAfter = resolvePaidProReviewRenderPlain(opts);
    const authHashAfter = getAuthoritativeAgreementDocument()?.authoritativeHash ?? "";

    expect(normalizeCorpusForCopyCompare(visibleAfter)).toBe(normalizeCorpusForCopyCompare(visibleBefore));
    expect(authHashAfter).toBe(authHashBefore);

    const events = readPostAcceptanceMutationAuditBuffer();
    expect(events.length).toBeGreaterThanOrEqual(2);

    const qaReport = {
      authoritativeCorpusChanged: authHashAfter !== authHashBefore,
      renderedCorpusChanged: visibleAfter !== visibleBefore,
      userVisibleTextChanged: normalizeCorpusForCopyCompare(visibleAfter) !== normalizeCorpusForCopyCompare(visibleBefore),
      events: events.map((e) => ({
        kind: e.kind,
        surface: e.surface,
        mutation: e.mutation,
        attemptedHash: e.attemptedHash,
        authoritativeHash: e.authoritativeHash,
        outcome: e.outcome,
        classification:
          e.outcome === "rejected_throw" || e.outcome === "rejected_fallback"
            ? "SAFE_GUARDRAIL_EVENT"
            : "LOGGED_ONLY",
      })),
    };
    // eslint-disable-next-line no-console
    console.info("[paid-pro-post-acceptance-mutation-audit]", qaReport);

    expect(qaReport.authoritativeCorpusChanged).toBe(false);
    expect(qaReport.userVisibleTextChanged).toBe(false);
    for (const row of qaReport.events) {
      expect(row.classification).toBe("SAFE_GUARDRAIL_EVENT");
    }
  });
});
