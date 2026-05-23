import { describe, expect, it } from "vitest";
import { buildAutoSignaturePacketForAllRoles } from "./vs01AutoSignaturePacket";
import {
  computeWitnessExecutionBand,
  resolveSignatureFieldRect,
  verifySignatureRectClear,
} from "./vs01SignaturePlacement";
import {
  buildCorpusSimulatedPageLayouts,
  findSignatureLinePlacementsFromPageLayout,
  pageLayoutForIndex,
} from "./vs01PageTextLayout";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { test52CorruptedPostAnswerCorpus } from "../components/agreements/guidedDealCompletion/guidedCorpusLineRepairs.test";
import { normalizeGuidedProCorpusStructure } from "../components/agreements/guidedDealCompletion/guidedCanonicalCorpusNormalizer";

function witnessCorpus(): string {
  return normalizeGuidedProCorpusStructure(test52CorruptedPostAnswerCorpus()).text;
}

describe("vs01SignaturePlacement", () => {
  it("rejects signature rects that overlap body text on witness page", () => {
    const layout = {
      pageIndex: 3,
      source: "corpus_sim" as const,
      textRects: [
        { x: 0.072, y: 0.42, width: 0.82, height: 0.018, text: "10.3 Electronic signatures body text.", kind: "body" as const },
        { x: 0.072, y: 0.58, width: 0.5, height: 0.018, text: "IN WITNESS WHEREOF", kind: "heading" as const },
        { x: 0.072, y: 0.62, width: 0.2, height: 0.018, text: "CLIENT:", kind: "heading" as const },
        { x: 0.118, y: 0.68, width: 0.36, height: 0.018, text: "By: __________________________", kind: "signature_label" as const },
      ],
    };
    const overlap = { x: 0.1, y: 0.42, width: 0.3, height: 0.05 };
    const check = verifySignatureRectClear({ rect: overlap, pageLayout: layout });
    expect(check.ok).toBe(false);
    expect(check.overlapText).toBe(true);
  });

  it("places signatures on explicit By lines without body overlap", () => {
    const corpus = witnessCorpus();
    const layouts = buildCorpusSimulatedPageLayouts(corpus, 4);
    const witnessPage = layouts.length - 1;
    const layout = pageLayoutForIndex(layouts, witnessPage)!;
    const byLines = findSignatureLinePlacementsFromPageLayout(layout);
    expect(byLines.length).toBeGreaterThanOrEqual(2);
    for (const partyIndex of [0, 1]) {
      const placed = resolveSignatureFieldRect({
        page: witnessPage,
        partyIndex,
        roleCount: 2,
        fieldType: "signature",
        pageLayout: layout,
        corpusAnchor: null,
      });
      expect(placed.rect, `party ${partyIndex}`).not.toBeNull();
      expect(placed.mode).toBe("explicit_signature_line");
      const check = verifySignatureRectClear({ rect: placed.rect!, pageLayout: layout });
      expect(check.ok).toBe(true);
    }
  });

  it("keeps signatures above disclosure/footer band", () => {
    const corpus = `${witnessCorpus()}\nGenerated with LawDog — Draft for Review`;
    const layouts = buildCorpusSimulatedPageLayouts(corpus, 4);
    const witnessPage = layouts.length - 1;
    const layout = pageLayoutForIndex(layouts, witnessPage)!;
    const band = computeWitnessExecutionBand(layout);
    const byLines = findSignatureLinePlacementsFromPageLayout(layout);
    for (const by of byLines) {
      expect(by.y + 0.05).toBeLessThanOrEqual(band.yMax + 1e-4);
    }
  });

  it("auto packet uses signature_only when witness has Name lines", () => {
    const corpus = witnessCorpus();
    const layouts = buildCorpusSimulatedPageLayouts(corpus, 4);
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "sig_test",
      creatorName: "Acme LLC",
      creatorEmail: "a@acme.com",
      ownerSignerName: "Anthem H Blanchard",
      ownerSignerTitle: "Manager",
      counterparties: [{ id: "cp", name: "Joe Smith", email: "joe@example.com" }],
    });
    const packet = buildAutoSignaturePacketForAllRoles({
      roles,
      pageCount: 4,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AHB", signerEmail: "a@acme.com" },
      corpusText: corpus,
      pageLayouts: layouts,
    });
    expect(packet.mode).toBe("signature_only");
    expect(packet.fields.filter((f) => f.type === "signature")).toHaveLength(2);
    expect(packet.fields.some((f) => f.type === "printed_name")).toBe(false);
  });
});
