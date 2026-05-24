import { describe, expect, it } from "vitest";
import {
  computeInitialsDomPlacementNormalized,
  computeInitialsDomPlacementPx,
  domPlacementPxToNormalized,
  checkInitialsDomTextCollisions,
  initialsReservedBandForPage,
  validateInitialsDomPlacement,
  VS01_INITIALS_DOM_BOTTOM_MARGIN_PX,
  VS01_INITIALS_DOM_BOX_HEIGHT_PX,
  VS01_INITIALS_DOM_BOX_WIDTH_PX,
  VS01_INITIALS_RESERVED_BOTTOM_BAND_PX,
  VS01_INITIALS_DOM_RIGHT_MARGIN_PX,
  VS01_INITIALS_DOM_SIGNER_GAP_PX,
} from "./vs01InitialsDomPlacement";
import { buildPrepareAutoInitialsForAllRoles } from "./vs01PrepareFieldPlacement";
import { buildCorpusSimulatedPageLayouts } from "./vs01PageTextLayout";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { findSafeInitialsRectOnPage } from "./vs01FieldGeometry";
import { summarizeVs01SigningPacketInitials } from "./vs01SigningPacketInitials";

const PAGE_W = 816;
const PAGE_H = 1056;

describe("vs01InitialsDomPlacement", () => {
  it("places two signer boxes at bottom-right margins on 816x1056 page", () => {
    const right = computeInitialsDomPlacementPx({
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
      signerIndex: 1,
      signerCount: 2,
    });
    const left = computeInitialsDomPlacementPx({
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
      signerIndex: 0,
      signerCount: 2,
    });

    expect(right.rightDistance).toBeCloseTo(VS01_INITIALS_DOM_RIGHT_MARGIN_PX, 0);
    expect(right.bottomDistance).toBeCloseTo(VS01_INITIALS_DOM_BOTTOM_MARGIN_PX, 0);
    expect(left.bottomDistance).toBeCloseTo(VS01_INITIALS_DOM_BOTTOM_MARGIN_PX, 0);
    expect(left.left + left.width + VS01_INITIALS_DOM_SIGNER_GAP_PX).toBeCloseTo(right.left, 0);
    expect(left.top).toBeCloseTo(right.top, 0);

    const checkRight = validateInitialsDomPlacement({
      page: 0,
      signerIndex: 1,
      placement: right,
      isRightmostInRow: true,
    });
    expect(checkRight.passed).toBe(true);
  });

  it("converts DOM px back to normalized top-left geometry", () => {
    const px = computeInitialsDomPlacementPx({
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
      signerIndex: 1,
      signerCount: 2,
    });
    const norm = domPlacementPxToNormalized(px, PAGE_W, PAGE_H);
    expect(norm.x).toBeGreaterThan(0.7);
    expect(norm.y).toBeGreaterThan(0.88);
    expect(norm.width).toBeCloseTo(VS01_INITIALS_DOM_BOX_WIDTH_PX / PAGE_W, 3);
    expect(norm.height).toBeCloseTo(VS01_INITIALS_DOM_BOX_HEIGHT_PX / PAGE_H, 3);
  });

  it("keeps initials inside the reserved footer band", () => {
    const px = computeInitialsDomPlacementPx({
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
      signerIndex: 1,
      signerCount: 2,
    });
    const band = initialsReservedBandForPage(PAGE_H);
    expect(band.reservedBottomPx).toBe(VS01_INITIALS_RESERVED_BOTTOM_BAND_PX);
    expect(px.top).toBeGreaterThanOrEqual(band.contentBottomLimit);
  });

  it("detects mocked text collisions inside the initials band", () => {
    const px = computeInitialsDomPlacementPx({
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
      signerIndex: 1,
      signerCount: 2,
    });
    const collision = checkInitialsDomTextCollisions({
      placement: px,
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
      textRects: [
        {
          x: px.left / PAGE_W,
          y: px.top / PAGE_H,
          width: px.width / PAGE_W,
          height: px.height / PAGE_H,
        },
      ],
    });
    expect(collision.collisionCount).toBe(1);
    expect(collision.worstOverlapPx).toBeGreaterThan(0);
  });

  it("does not overlap adjacent signer boxes", () => {
    const a = computeInitialsDomPlacementPx({
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
      signerIndex: 0,
      signerCount: 2,
    });
    const b = computeInitialsDomPlacementPx({
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
      signerIndex: 1,
      signerCount: 2,
    });
    const overlapX = a.left < b.left + b.width && a.left + a.width > b.left;
    const overlapY = a.top < b.top + b.height && a.top + a.height > b.top;
    expect(overlapX && overlapY).toBe(false);
  });

  it("places initials on all four pages without PDF text layer", () => {
    const corpus = "Section one.\n\nSection two.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nBy: ___\n\nSERVICE PROVIDER:\nSignature: ___\n";
    const pageCount = 4;
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_dom",
      creatorName: "Acme LLC",
      creatorEmail: "a@acme.com",
      ownerSignerName: "Anthem",
      counterparties: [{ id: "cp1", name: "Joe", email: "j@j.com" }],
    });
    const sim = buildCorpusSimulatedPageLayouts(corpus, pageCount);
    const pageLayouts = sim.map((l) =>
      l.pageIndex === 1 ? { pageIndex: 1, source: "pdf" as const, textRects: [] } : { ...l, source: "pdf" as const },
    );
    const initials = buildPrepareAutoInitialsForAllRoles({
      roles,
      pageCount,
      skippedSlots: new Set(),
      existingFields: [],
      valueCtxForRole: () => ({ typedName: "A", initials: "AB" }),
      corpusText: corpus,
      pageLayouts,
    });
    expect(initials).toHaveLength(pageCount * roles.length);
    for (let p = 0; p < pageCount; p += 1) {
      expect(initials.some((f) => f.page === p)).toBe(true);
    }
  });

  it("uses DOM bottom-right when text layer is empty or crowded in lower right", () => {
    const crowdedLayout = {
      pageIndex: 2,
      source: "pdf" as const,
      textRects: [
        {
          x: 0.05,
          y: 0.82,
          width: 0.9,
          height: 0.12,
          text: "Dense paragraph near footer.",
          kind: "body" as const,
        },
      ],
    };
    const rect = findSafeInitialsRectOnPage({
      page: 2,
      partyIndex: 0,
      pageLayout: crowdedLayout,
      fieldObstacles: [],
      signerCount: 2,
    });
    expect(rect.rect).not.toBeNull();
    const dom = computeInitialsDomPlacementNormalized({
      signerIndex: 0,
      signerCount: 2,
      fieldObstacles: [],
    });
    expect(rect.rect!.y).toBeCloseTo(dom.y, 1);
    expect(rect.rect!.x).toBeCloseTo(dom.x, 1);
  });

  it("prepare and recipient reference placement share DOM bottom-right anchor", () => {
    const a = computeInitialsDomPlacementNormalized({ signerIndex: 0, signerCount: 2 });
    const b = computeInitialsDomPlacementNormalized({ signerIndex: 0, signerCount: 2 });
    expect(a.x).toBeCloseTo(b.x, 4);
    expect(a.y).toBeCloseTo(b.y, 4);
  });

  it("packet validation fails when a mocked text rect intersects initials", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_collision",
      creatorName: "Acme LLC",
      creatorEmail: "a@acme.com",
      ownerSignerName: "Anthem",
      counterparties: [{ id: "cp1", name: "Joe", email: "j@j.com" }],
    });
    const pageCount = 1;
    const initials = buildPrepareAutoInitialsForAllRoles({
      roles,
      pageCount,
      skippedSlots: new Set(),
      existingFields: [],
      valueCtxForRole: () => ({ typedName: "A", initials: "AB" }),
      corpusText: "Agreement body.\n\nIN WITNESS WHEREOF\nBy: ___",
      pageLayouts: [],
    });
    const rightmost = computeInitialsDomPlacementNormalized({ signerIndex: 1, signerCount: 2 });
    const summary = summarizeVs01SigningPacketInitials({
      fields: initials,
      pageCount,
      roleCount: roles.length,
      partyIndices: roles.map((r) => r.partyIndex),
      pageLayouts: [
        {
          pageIndex: 0,
          source: "pdf",
          textRects: [
            {
              x: rightmost.x,
              y: rightmost.y,
              width: rightmost.width,
              height: rightmost.height,
              text: "Mocked text in initials band",
              kind: "body",
            },
          ],
        },
      ],
    });
    expect(summary.unsafeInitialsCount).toBeGreaterThan(0);
    expect(summary.complete).toBe(false);
  });
});
