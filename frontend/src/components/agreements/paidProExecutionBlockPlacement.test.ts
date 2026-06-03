import { afterEach, describe, expect, it } from "vitest";
import {
  enforcePaidProSingleExecutionBlock,
  stripPreWitnessExecutionPollutionFromPrefix,
} from "./paidProExecutionBlockNormalization";
import {
  countPaidProExecutionBlocks,
} from "./paidProExecutionBlockAuthority";
import {
  detectProReviewDisplaySanityViolations,
  polishProAgreementDisplayLayer,
  sanitizeProReviewDisplayText,
} from "./polishProAgreementDisplayLayer";
import {
  analyzeExecutionBlockLocation,
} from "./paidProExecutionBlockInstrumentation";
import {
  establishPaidProSourceOfTruth,
  clearPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const parties: ParsedDraftShape["parties"] = [
  { name: "Blue Canyon Analytics LLC", role: "Client" },
  { name: "Iron Vale Systems Inc.", role: "Service Provider" },
];

function productionStyleMidBodyExecutionCorpus(): string {
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    'This Agreement is between Blue Canyon Analytics LLC ("Client") and Iron Vale Systems Inc. ("Service Provider").',
    "",
    "1. Definitions and interpretation.",
    "Substantive operative detail for section one.",
    "",
    "2. Scope of Services.",
    "Substantive operative detail for section two.",
    "",
    "CLIENT:",
    "Blue Canyon Analytics LLC",
    "By: __________________________",
    "Name: __________________________",
    "Title: _________________________",
    "Date: _____________________________",
    "",
    "SERVICE PROVIDER:",
    "Iron Vale Systems Inc.",
    "By: __________________________",
    "Name: __________________________",
    "Title: _________________________",
    "Date: _____________________________",
    "",
    "3. Fees and payment.",
    "Substantive operative detail for section three.",
    "",
    "SIGNATURES",
    "",
    "Name: __________________________",
    "Title: _________________________",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    "Blue Canyon Analytics LLC",
    "By: __________________________",
    "Name: __________________________",
    "Title: _________________________",
    "Date: _____________________________",
    "",
    "SERVICE PROVIDER:",
    "Iron Vale Systems Inc.",
    "By: __________________________",
    "Name: __________________________",
    "Title: _________________________",
    "Date: _____________________________",
  ].join("\n");
}

describe("paidProExecutionBlockPlacement", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("strips mid-body CLIENT/SERVICE PROVIDER and premature SIGNATURES from operative prefix", () => {
    const corpus = productionStyleMidBodyExecutionCorpus();
    const witnessIdx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
    const prefix = corpus.slice(0, witnessIdx);
    const stripped = stripPreWitnessExecutionPollutionFromPrefix(prefix);
    expect(stripped.repairs.length).toBeGreaterThan(0);
    expect(stripped.text).not.toMatch(/^\s*CLIENT\s*:/im);
    expect(stripped.text).not.toMatch(/^\s*SIGNATURES\s*$/im);
    expect(stripped.text).toMatch(/3\.\s+Fees and payment/i);
  });

  it("enforcePaidProSingleExecutionBlock leaves one witness tail after final numbered section", () => {
    const { text } = enforcePaidProSingleExecutionBlock(productionStyleMidBodyExecutionCorpus());
    expect(detectProReviewDisplaySanityViolations(text)).toEqual([]);
    expect(countPaidProExecutionBlocks(text)).toBe(1);
    const location = analyzeExecutionBlockLocation(text, "test");
    expect(location.executionAfterFinalSection).toBe(true);
    const section3 = text.search(/3\.\s+Fees and payment/i);
    const witness = text.search(/\bIN WITNESS WHEREOF\b/i);
    expect(section3).toBeGreaterThanOrEqual(0);
    expect(witness).toBeGreaterThan(section3);
    const preWitness = text.slice(0, witness);
    expect(preWitness).not.toMatch(/^\s*By:\s*_{2,}/im);
  });

  it("post-SoT review render and polish stay hash-identical to authoritative corpus", () => {
    const intake =
      "Services between Blue Canyon Analytics LLC and Iron Vale Systems Inc for AI workflow implementation $8500 Delaware";
    let raw = productionStyleMidBodyExecutionCorpus();
    const { text: normalized } = enforcePaidProSingleExecutionBlock(raw);
    let body = normalized;
    const padLine = "10. Additional operative clause for acceptance gates and substantive commercial detail.";
    while (body.length < 6_500) {
      const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
      const chunk = `\n${padLine}\n`;
      body =
        witnessIdx >= 0
          ? `${body.slice(0, witnessIdx).trimEnd()}${chunk}\n${body.slice(witnessIdx).trimStart()}`
          : `${body}${chunk}`;
    }
    establishPaidProSourceOfTruth({
      text: body,
      source: "server_full_draft",
      draft: { parties, title: "Agreement", jurisdiction: "Delaware" } as ParsedDraftShape,
      intakeText: intake,
    });
    const sotHash = hashPaidProCorpus(getPaidProSourceOfTruthText());
    const renderPlain = resolvePaidProReviewRenderPlain({
      draft: { parties, title: "Agreement", jurisdiction: "Delaware" } as ParsedDraftShape,
      intakeText: intake,
    });
    expect(hashPaidProCorpus(renderPlain)).toBe(sotHash);
    const polished = polishProAgreementDisplayLayer(renderPlain, { reviewDisplayMode: true });
    expect(hashPaidProCorpus(polished.text)).toBe(sotHash);
    const sanitized = sanitizeProReviewDisplayText(polished.text, { source: "test_post_freeze" });
    expect(hashPaidProCorpus(sanitized.text)).toBe(sotHash);
    expect(detectProReviewDisplaySanityViolations(renderPlain)).toEqual([]);
  });
});
