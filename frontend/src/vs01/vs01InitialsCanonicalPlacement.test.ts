import { describe, expect, it } from "vitest";
import {
  CANONICAL_INITIALS_BOTTOM_MARGIN,
  CANONICAL_INITIALS_RIGHT_MARGIN,
  canonicalInitialsGridPosition,
  overlapsSignatureFieldObstacles,
  placeCanonicalInitialsRect,
  verifyCanonicalInitialsRectClear,
} from "./vs01InitialsCanonicalPlacement";
import { prepareAutoInitialsPlacementDims, fieldRectsOverlap } from "./signingFields";
import { buildPrepareAutoInitialsForAllRoles } from "./vs01PrepareFieldPlacement";
import { buildAutoSignaturePacketForAllRoles } from "./vs01AutoSignaturePacket";
import { summarizeVs01SigningPacketInitials } from "./vs01SigningPacketInitials";
import { buildCorpusSimulatedPageLayouts } from "./vs01PageTextLayout";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { normalizeGuidedProCorpusStructure } from "../components/agreements/guidedDealCompletion/guidedCanonicalCorpusNormalizer";
import {
  normalizedPdfRectToCssRect,
  vs01InitialsVisualBottomRightCheck,
} from "./vs01FieldCssGeometry";

const PAGE_COUNT = 4;

const FOUR_PAGE_WITNESS_CORPUS = `
1. Scope of work and deliverables for the engagement.

2. Payment terms and invoicing schedule.

3. Term and termination rights.

4. Confidentiality obligations.

5. Governing law and venue.

6. Entire agreement and amendments.

IN WITNESS WHEREOF

CLIENT:
Acme LLC
By: __________________________
Name: Anthem H Blanchard
Title: Manager
Date: _________________________

SERVICE PROVIDER:
Joe Smith
Signature: __________________________
Name: Joe Smith
Date: _________________________
`.trim();

function twoSignerRoles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_canonical",
    creatorName: "Acme LLC",
    creatorEmail: "a@acme.com",
    ownerSignerName: "Anthem H Blanchard",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.com" }],
  });
}

function layoutsWithEmptyPdfMiddle(corpus: string) {
  const sim = buildCorpusSimulatedPageLayouts(corpus, PAGE_COUNT);
  return sim.map((l) =>
    l.pageIndex === 1 ? { pageIndex: 1, source: "pdf" as const, textRects: [] } : { ...l, source: "pdf" as const },
  );
}

describe("vs01InitialsCanonicalPlacement", () => {
  it("places two signer boxes bottom-right with fixed spacing", () => {
    const dims = prepareAutoInitialsPlacementDims();
    const r0 = canonicalInitialsGridPosition({ signerIndex: 0, signerCount: 2, dims });
    const r1 = canonicalInitialsGridPosition({ signerIndex: 1, signerCount: 2, dims });
    expect(r1.x).toBeGreaterThan(r0.x);
    expect(r0.y).toBeCloseTo(1 - CANONICAL_INITIALS_BOTTOM_MARGIN - dims.height, 3);
    expect(r1.y).toBeCloseTo(r0.y, 3);
    expect(1 - r1.x - dims.width).toBeCloseTo(CANONICAL_INITIALS_RIGHT_MARGIN, 2);
  });

  it("places initials on pages 1–4 including middle page without PDF text layer", () => {
    const corpus = normalizeGuidedProCorpusStructure(FOUR_PAGE_WITNESS_CORPUS).text;
    const pageLayouts = layoutsWithEmptyPdfMiddle(corpus);
    const roles = twoSignerRoles();
    const signatures = buildAutoSignaturePacketForAllRoles({
      roles,
      pageCount: PAGE_COUNT,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AHB", signerEmail: "a@acme.com" },
      corpusText: corpus,
      pageLayouts,
    }).fields;
    const initials = buildPrepareAutoInitialsForAllRoles({
      roles,
      pageCount: PAGE_COUNT,
      skippedSlots: new Set(),
      existingFields: signatures,
      valueCtxForRole: () => ({ typedName: "Anthem H Blanchard", initials: "AHB", signerEmail: "a@acme.com" }),
      corpusText: corpus,
      pageLayouts,
    });
    expect(initials).toHaveLength(PAGE_COUNT * roles.length);
    for (let p = 0; p < PAGE_COUNT; p += 1) {
      const onPage = initials.filter((f) => f.page === p);
      expect(onPage.length, `page ${p + 1}`).toBe(roles.length);
    }
    const summary = summarizeVs01SigningPacketInitials({
      fields: [...signatures, ...initials],
      pageCount: PAGE_COUNT,
      roleCount: roles.length,
      partyIndices: roles.map((r) => r.partyIndex),
      corpusText: corpus,
      pageLayouts,
    });
    expect(summary.incompletePages).toEqual([]);
    expect(summary.unsafeInitialsCount).toBe(0);
    expect(summary.unsafeSignatureCount).toBe(0);
    expect(summary.signatureFieldCount).toBe(roles.length);
    expect(summary.initialsFieldCount).toBe(PAGE_COUNT * roles.length);
    expect(summary.eligiblePages).toHaveLength(PAGE_COUNT);
    expect(summary.complete).toBe(true);
  });

  it("first and last page initials use consistent box size and stay inside margins", () => {
    const dims = prepareAutoInitialsPlacementDims();
    const corpus = normalizeGuidedProCorpusStructure(FOUR_PAGE_WITNESS_CORPUS).text;
    const pageLayouts = layoutsWithEmptyPdfMiddle(corpus);
    const roles = twoSignerRoles();
    const signatures = buildAutoSignaturePacketForAllRoles({
      roles,
      pageCount: PAGE_COUNT,
      existingFields: [],
      ownerValueCtx: { typedName: "A", initials: "AB", signerEmail: "a@x.com" },
      corpusText: corpus,
      pageLayouts,
    }).fields;
    const initials = buildPrepareAutoInitialsForAllRoles({
      roles,
      pageCount: PAGE_COUNT,
      skippedSlots: new Set(),
      existingFields: signatures,
      valueCtxForRole: () => ({ typedName: "A", initials: "AB", signerEmail: "a@x.com" }),
      corpusText: corpus,
      pageLayouts,
    });
    for (const page of [0, PAGE_COUNT - 1]) {
      const onPage = initials.filter((f) => f.page === page);
      for (const f of onPage) {
        expect(f.width).toBeCloseTo(dims.width, 3);
        expect(f.height).toBeCloseTo(dims.height, 3);
        expect(f.x + f.width).toBeLessThanOrEqual(1 - CANONICAL_INITIALS_RIGHT_MARGIN + 0.02);
        const visual = vs01InitialsVisualBottomRightCheck({
          rect: f,
          pageWidthPx: 612,
          pageHeightPx: 792,
          allowShiftedUp: true,
        });
        expect(visual.distanceFromRightPx).toBeGreaterThanOrEqual(48);
        expect(visual.distanceFromRightPx).toBeLessThanOrEqual(128);
        expect(visual.distanceFromBottomPx).toBeGreaterThanOrEqual(48);
        expect(f.y).toBeGreaterThanOrEqual(0.04);
      }
    }
  });

  it("maps normalized top-origin rects to CSS without y inversion", () => {
    const css = normalizedPdfRectToCssRect(
      { x: 0.8, y: 0.9, width: 0.08, height: 0.05 },
      { width: 612, height: 792 },
    );
    expect(css.left).toBeCloseTo(489.6, 1);
    expect(css.top).toBeCloseTo(712.8, 1);
    expect(612 - css.left - css.width).toBeCloseTo(73.44, 1);
    expect(792 - css.top - css.height).toBeCloseTo(39.6, 1);
  });

  it("converts bottom-origin rects once at the render boundary", () => {
    const css = normalizedPdfRectToCssRect(
      { x: 0.8, y: 0.05, width: 0.08, height: 0.05 },
      { width: 612, height: 792 },
      { yOrigin: "bottom-left" },
    );
    expect(css.top).toBeCloseTo(712.8, 1);
  });

  it("initials do not overlap each other on the same page", () => {
    const dims = prepareAutoInitialsPlacementDims();
    const placed0 = placeCanonicalInitialsRect({
      page: 0,
      signerIndex: 0,
      signerCount: 2,
      fieldObstacles: [],
      pageLayout: null,
      dims,
    });
    const placed1 = placeCanonicalInitialsRect({
      page: 0,
      signerIndex: 1,
      signerCount: 2,
      fieldObstacles: placed0.rect ? [placed0.rect] : [],
      pageLayout: null,
      dims,
    });
    expect(placed0.rect).not.toBeNull();
    expect(placed1.rect).not.toBeNull();
    expect(fieldRectsOverlap(placed0.rect!, placed1.rect!, 0.01)).toBe(false);
  });

  it("shifts initials upward when signature field occupies bottom-right", () => {
    const dims = prepareAutoInitialsPlacementDims();
    const grid = canonicalInitialsGridPosition({ signerIndex: 0, signerCount: 1, dims });
    const signatureBlock = {
      x: grid.x,
      y: grid.y,
      width: dims.width * 1.2,
      height: dims.height * 1.2,
    };
    const placed = placeCanonicalInitialsRect({
      page: 2,
      signerIndex: 0,
      signerCount: 1,
      fieldObstacles: [signatureBlock],
      pageLayout: null,
      dims,
    });
    expect(placed.rect).not.toBeNull();
    expect(placed.rect!.y).toBeLessThan(grid.y - 0.001);
    expect(overlapsSignatureFieldObstacles(placed.rect!, [signatureBlock])).toBe(false);
    expect(verifyCanonicalInitialsRectClear({ rect: placed.rect!, fieldObstacles: [signatureBlock] }).ok).toBe(
      true,
    );
  });
});
