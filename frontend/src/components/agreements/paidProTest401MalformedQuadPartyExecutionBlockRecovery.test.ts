/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import {
  countPaidProExecutionBlocks,
  tailHasCollapsedInlineSignerFields,
} from "./paidProExecutionBlockAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import {
  TEST398_QUAD_PARTY_MUTUAL_SERVICES_INTAKE,
  test398Draft,
  test398Parties,
} from "./paidProTest398Fixtures";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc";

const MALFORMED_INLINE_WITNESS =
  "IN WITNESS WHEREOF, the Parties execute this Agreement. CLIENT: Red Mesa Logistics LLC By: ___ Name: ___ Title: ___ Date: ___ SERVICE PROVIDER: Blue Canyon Analytics By: ___ Name: ___ Title: ___ Date: ___ Harbor Peak Automation : Harbor Peak Automation By: ___ Name: ___ Title: ___ Date: ___ Iron Vale Systems Inc: Iron Vale Systems By: ___ Name: ___ Title: ___ Date: ___";

export function buildTest401MalformedServerDraft(): string {
  const notices = [
    "11. Notices",
    `If to ${RED}: ${RED}`,
    `If to ${BLUE}: ${BLUE}`,
    `If to ${HARBOR}: ${HARBOR}`,
    `If to ${IRON}: ${IRON}`,
  ].join("\n\n");

  return [
    "MUTUAL SERVICES AGREEMENT",
    "",
    `This Mutual Services Agreement is among ${RED}, ${BLUE}, ${HARBOR}, and ${IRON}.`,
    "",
    "1. Services and Engagement",
    "The Providers will deliver platform design, implementation, and support services.",
    "",
    "1.3 Out-of-Scope Work and Changes",
    "Any material expansion of scope must be approved in writing.",
    "",
    notices,
    "",
    "12. Governing Law",
    "Oklahoma law governs.",
    "",
    MALFORMED_INLINE_WITNESS,
  ].join("\n");
}

function countWitnessClauses(text: string): number {
  return (text.match(/\bIN WITNESS WHEREOF\b/gi) || []).length;
}

function countProperEntitySignatureSections(text: string): number {
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : text;
  const names = [RED, BLUE, HARBOR, IRON];
  return names.filter((name) => {
    const heading = name.trim().toUpperCase();
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|\\n\\n)${escaped}\\s*\\n\\nBy:`, "m").test(tail);
  }).length;
}

function assertRecoveredQuadPartyExecutionBlock(corpus: string): void {
  expect(countWitnessClauses(corpus)).toBe(1);
  expect(countPaidProExecutionBlocks(corpus)).toBe(1);
  expect(countProperEntitySignatureSections(corpus)).toBe(4);

  const witnessIdx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  const tail = witnessIdx >= 0 ? corpus.slice(witnessIdx) : corpus;
  expect(tail).toMatch(new RegExp(RED.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  expect(tail).toMatch(new RegExp(BLUE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  expect(tail).toMatch(new RegExp(HARBOR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  expect(tail).toMatch(new RegExp(IRON.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

  expect(tail).not.toMatch(/\bCLIENT\s*:/i);
  expect(tail).not.toMatch(/\bSERVICE\s+PROVIDER\s*:/i);
  expect(tail).not.toMatch(/Harbor Peak Automation\s*:\s*Harbor Peak Automation/i);
  expect(tail).not.toMatch(/Iron Vale Systems Inc\s*:\s*Iron Vale Systems/i);
  expect(tailHasCollapsedInlineSignerFields(tail)).toBe(false);

  expect(tail).toContain("RED MESA LOGISTICS LLC");
  expect(tail).toContain("BLUE CANYON ANALYTICS LLC");
  expect(tail).toContain("HARBOR PEAK AUTOMATION LLC");
  expect(tail).toContain("IRON VALE SYSTEMS INC");
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
});

describe("TEST401 — malformed quad-party execution block recovery", () => {
  it("prepare + establish + review render recover manifest-based 4-party execution block", () => {
    const draft = test398Draft();
    const intake = TEST398_QUAD_PARTY_MUTUAL_SERVICES_INTAKE;
    const raw = buildTest401MalformedServerDraft();

    setConsumedPaidProSignerMetadataAuthority({
      parties: test398Parties(),
      source: "live_ui",
      hash: "test401",
      updatedAt: 0,
    });

    const prep = preparePaidProServerDocumentForAcceptance(raw, draft, intake);
    assertRecoveredQuadPartyExecutionBlock(prep.text);

    markPaidProPipelineValidationPassed({ text: prep.text, source: "server_full_draft_retry" });

    establishPaidProSourceOfTruth({
      text: prep.text,
      source: "server_full_draft_retry",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
    });

    const sot = getPaidProSourceOfTruthText();
    assertRecoveredQuadPartyExecutionBlock(sot);

    const safe = applyAcceptedProCorpusSafeDisplay(sot, { draft, intakeText: intake }).text;
    assertRecoveredQuadPartyExecutionBlock(safe);

    const displayPrep = preparePaidProReviewDisplayPlain(safe);
    assertRecoveredQuadPartyExecutionBlock(displayPrep.text);

    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    assertRecoveredQuadPartyExecutionBlock(reviewPlain);

    const parity = auditPaidProReviewRenderSotParity({ reviewPlain });
    expect(parity.invariantOk || parity.signerFieldOnlyDelta).toBe(true);
  });
});
