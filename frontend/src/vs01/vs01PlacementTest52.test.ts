import { describe, expect, it } from "vitest";
import {
  buildAutoSignaturePacketForAllRoles,
  autoSignaturePacketStatusMessage,
} from "./vs01AutoSignaturePacket";
import { buildPrepareAutoInitialsForAllRoles } from "./vs01PrepareFieldPlacement";
import {
  formatVs01InitialsOnlyStatusLine,
  summarizeVs01SigningPacketInitials,
} from "./vs01SigningPacketInitials";
import { verifyCanonicalInitialsRectClear } from "./vs01InitialsCanonicalPlacement";
import {
  buildCorpusSimulatedPageLayouts,
  findSignatureLinePlacementsFromPageLayout,
  mergePageLayoutForInitials,
  pageLayoutForIndex,
  type Vs01PageTextLayout,
} from "./vs01PageTextLayout";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { test52CorruptedPostAnswerCorpus } from "../components/agreements/guidedDealCompletion/guidedCorpusLineRepairs.test";
import { normalizeGuidedProCorpusStructure } from "../components/agreements/guidedDealCompletion/guidedCanonicalCorpusNormalizer";

const PAGE_COUNT = 4;

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test52",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@acme.com",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.com" }],
  });
}

function fourPageLayouts(corpus: string): Vs01PageTextLayout[] {
  const sim = buildCorpusSimulatedPageLayouts(corpus, PAGE_COUNT);
  return sim.map((l) => ({ ...l, source: "pdf" as const }));
}

/** Page 2 PDF layer empty — corpus simulation must still enable initials. */
function layoutsWithEmptyPdfMiddle(corpus: string): Vs01PageTextLayout[] {
  const sim = fourPageLayouts(corpus);
  return sim.map((l) =>
    l.pageIndex === 1
      ? { pageIndex: 1, source: "pdf" as const, textRects: [] }
      : l,
  );
}

describe("VS01 placement test52", () => {
  it("places signatures on visible By/Signature lines and initials on every eligible page", () => {
    const corpus = normalizeGuidedProCorpusStructure(test52CorruptedPostAnswerCorpus()).text;
    const pageLayouts = layoutsWithEmptyPdfMiddle(corpus);
    const witnessPage = PAGE_COUNT - 1;
    const sigLines = findSignatureLinePlacementsFromPageLayout(pageLayoutForIndex(pageLayouts, witnessPage));
    expect(sigLines.length).toBeGreaterThanOrEqual(2);

    const packet = buildAutoSignaturePacketForAllRoles({
      roles: roles(),
      pageCount: PAGE_COUNT,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AHB", signerEmail: "a@acme.com" },
      corpusText: corpus,
      pageLayouts,
    });
    expect(packet.fields.filter((f) => f.type === "signature").length).toBe(2);

    const signatures = packet.fields;
    const initials = buildPrepareAutoInitialsForAllRoles({
      roles: roles(),
      pageCount: PAGE_COUNT,
      skippedSlots: new Set(),
      existingFields: signatures,
      valueCtxForRole: () => ({ typedName: "Anthem H Blanchard", initials: "AHB", signerEmail: "a@acme.com" }),
      corpusText: corpus,
      pageLayouts,
    });
    const summary = summarizeVs01SigningPacketInitials({
      fields: [...signatures, ...initials],
      pageCount: PAGE_COUNT,
      roleCount: 2,
      partyIndices: [0, 1],
      corpusText: corpus,
      pageLayouts,
    });
    expect(summary.incompletePages).not.toContain(1);
    expect(summary.complete).toBe(true);

    for (const field of initials) {
      const layout = mergePageLayoutForInitials(
        pageLayoutForIndex(pageLayouts, field.page),
        pageLayoutForIndex(buildCorpusSimulatedPageLayouts(corpus, PAGE_COUNT), field.page),
      );
      const check = verifyCanonicalInitialsRectClear({
        rect: field,
        pageLayout: layout,
        fieldObstacles: signatures.filter((s) => s.page === field.page),
      });
      expect(check.ok, `page ${field.page + 1}`).toBe(true);
    }
  });

  it("prepare status does not claim initials are safe when pages are incomplete", () => {
    const incomplete = summarizeVs01SigningPacketInitials({
      fields: [],
      pageCount: 4,
      roleCount: 2,
      partyIndices: [0, 1],
      corpusText: "x".repeat(60),
      pageLayouts: fourPageLayouts(normalizeGuidedProCorpusStructure(test52CorruptedPostAnswerCorpus()).text),
    });
    const line = formatVs01InitialsOnlyStatusLine(incomplete);
    expect(line).not.toMatch(/added where safe/i);
    expect(autoSignaturePacketStatusMessage(
      {
        fields: [],
        confidence: "high",
        placedCount: 2,
        mode: "signature_only",
        requiredSignatureCount: 2,
        optionalFieldCount: 0,
      },
      { initialsStatusLine: line },
    )).toMatch(/need review|incomplete/i);
  });
});
