/**
 * Per-page VS01 initials placement planning and packet validation.
 */

import type { Vs01SigningPacketPage } from "./buildVs01SigningPacketModel";
import type { Vs01NormTextRect } from "./vs01PageTextLayout";
import { fieldRectsOverlap, type PlacedSigningField } from "./signingFields";
import {
  checkInitialsDomTextCollisions,
  computeInitialsDomPlacementPx,
  initialsReservedBandForPage,
  initialsDomSignerColumn,
  logVs01InitialsReservedBand,
  logVs01InitialsTextCollisionCheck,
  validateInitialsDomPlacement,
  VS01_INITIALS_DOM_REFERENCE_PAGE_HEIGHT_PX,
  VS01_INITIALS_DOM_REFERENCE_PAGE_WIDTH_PX,
} from "./vs01InitialsDomPlacement";
import { textObstaclesForInitialsPlacement } from "./vs01InitialsSafeZone";
import { verifySignatureRectClear } from "./vs01SignaturePlacement";
import { buildVs01PlacementContext } from "./vs01FieldGeometry";
import {
  buildCorpusSimulatedPageLayouts,
  mergePageLayoutForInitials,
  pageLayoutForIndex,
  type Vs01PageTextLayout,
} from "./vs01PageTextLayout";
import { resolveVs01InitialsPlacementPolicy } from "./vs01InitialsPlacementPolicy";

export type Vs01InitialsPagePlan = {
  page: number;
  eligible: boolean;
  textObstacleCount: number;
  fieldObstacleCount: number;
};

export type Vs01SigningPacketInitialsSummary = {
  pageCount: number;
  roleCount: number;
  eligiblePages: number[];
  pagesWithInitialsPerRole: number[];
  incompletePages: number[];
  unsafeInitialsCount: number;
  initialsFieldCount: number;
  signatureFieldCount: number;
  unsafeSignatureCount: number;
  witnessPageIndex: number;
  complete: boolean;
};

export function logVs01PageInitialsPlan(payload: Vs01InitialsPagePlan): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-page-initials-plan]", payload);
}

export function logVs01InitialsPageComplete(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-page-complete]", payload);
}

export function logVs01InitialsPageIncomplete(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-initials-page-incomplete]", payload);
}

export function logVs01SigningPacketValidation(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-signing-packet-validation]", payload);
}

export function planVs01InitialsPages(args: {
  pageCount: number;
  partyIndices: readonly number[];
  corpusText?: string | null;
  pageLayouts?: readonly Vs01PageTextLayout[] | null;
  documentId?: string | null;
  existingFields?: readonly PlacedSigningField[];
}): Vs01InitialsPagePlan[] {
  const pageCount = Math.max(1, args.pageCount);
  const policy = resolveVs01InitialsPlacementPolicy(args);
  const corpusLayouts =
    (args.corpusText ?? "").trim().length >= 40
      ? buildCorpusSimulatedPageLayouts(args.corpusText!, pageCount)
      : [];
  const plans: Vs01InitialsPagePlan[] = [];

  for (let p = 0; p < pageCount; p += 1) {
    const pdfLayout = pageLayoutForIndex(args.pageLayouts, p);
    const corpusLayout = pageLayoutForIndex(corpusLayouts, p);
    const effective = mergePageLayoutForInitials(pdfLayout, corpusLayout);
    const eligible = policy.eligiblePages.includes(p);
    const onPage = (args.existingFields ?? []).filter((f) => f.page === p);
    const plan: Vs01InitialsPagePlan = {
      page: p,
      eligible,
      textObstacleCount: textObstaclesForInitialsPlacement(effective).length,
      fieldObstacleCount: onPage.length,
    };
    plans.push(plan);
    logVs01PageInitialsPlan(plan);
  }
  return plans;
}

function canonicalBodyTextOverlapsField(
  field: PlacedSigningField,
  text: Pick<Vs01NormTextRect, "text" | "kind" | "x" | "y" | "width" | "height">,
  tolerance: number,
): boolean {
  if (text.kind !== "body") return false;
  if (!text.text.trim()) return false;
  return fieldRectsOverlap(field, text, tolerance);
}

/** Initials/signature summary for canonical signing packet fields (no PDF/corpus merge). */
export function summarizeCanonicalSigningPacketInitials(args: {
  fields: readonly PlacedSigningField[];
  pageCount: number;
  roleCount: number;
  pages: readonly Pick<Vs01SigningPacketPage, "pageIndex" | "textBlocks">[];
}): Vs01SigningPacketInitialsSummary {
  const pageCount = Math.max(1, args.pageCount);
  const roleCount = Math.max(1, args.roleCount);
  const witnessPageIndex =
    args.pages.find((page) =>
      page.textBlocks.some((b) => /\bIN WITNESS WHEREOF\b/i.test(b.text)),
    )?.pageIndex ?? pageCount - 1;
  const eligiblePages = Array.from({ length: pageCount }, (_, i) => i).filter(
    (p) => p !== witnessPageIndex,
  );
  const initialsFields = args.fields.filter((f) => f.type === "initials" && f.autoInitials);
  const signatureFields = args.fields.filter((f) => f.type === "signature");
  const pagesWithInitialsPerRole: number[] = [];
  const incompletePages: number[] = [];
  let unsafeInitialsCount = 0;
  let unsafeSignatureCount = 0;

  for (const p of eligiblePages) {
    const pageModel = args.pages.find((page) => page.pageIndex === p);
    const onPage = args.fields.filter((f) => f.page === p);
    const partiesWithInitials = new Set(
      initialsFields
        .filter((f) => f.page === p)
        .map((f) => f.assignedPartyIndex ?? -1)
        .filter((idx) => idx >= 0),
    );
    const placedCount = partiesWithInitials.size;
    pagesWithInitialsPerRole.push(placedCount);
    if (placedCount < roleCount) incompletePages.push(p);

    for (const field of initialsFields.filter((f) => f.page === p)) {
      const hitsText = (pageModel?.textBlocks ?? []).some((text) =>
        canonicalBodyTextOverlapsField(field, text, 0.004),
      );
      const hitsSignature = onPage.some(
        (o) => o.id !== field.id && o.type === "signature" && fieldRectsOverlap(field, o, 0.012),
      );
      if (hitsText || hitsSignature) unsafeInitialsCount += 1;
    }
  }

  for (const sig of signatureFields) {
    if (sig.page === witnessPageIndex) continue;
    const pageModel = args.pages.find((page) => page.pageIndex === sig.page);
    const hitsText = (pageModel?.textBlocks ?? []).some((text) =>
      canonicalBodyTextOverlapsField(sig, text, 0.004),
    );
    if (hitsText) unsafeSignatureCount += 1;
  }

  const initialsRequired = eligiblePages.length * roleCount;

  return {
    pageCount,
    roleCount,
    eligiblePages,
    pagesWithInitialsPerRole,
    incompletePages,
    unsafeInitialsCount,
    initialsFieldCount: initialsFields.length,
    signatureFieldCount: signatureFields.length,
    unsafeSignatureCount,
    witnessPageIndex,
    complete:
      signatureFields.length >= roleCount &&
      unsafeSignatureCount === 0 &&
      incompletePages.length === 0 &&
      unsafeInitialsCount === 0 &&
      initialsFields.length >= initialsRequired,
  };
}

export function summarizeVs01SigningPacketInitials(args: {
  fields: readonly PlacedSigningField[];
  pageCount: number;
  roleCount: number;
  partyIndices: readonly number[];
  corpusText?: string | null;
  pageLayouts?: readonly Vs01PageTextLayout[] | null;
  documentId?: string | null;
}): Vs01SigningPacketInitialsSummary {
  const pageCount = Math.max(1, args.pageCount);
  const roleCount = Math.max(1, args.roleCount);
  const policy = resolveVs01InitialsPlacementPolicy({
    pageCount,
    partyIndices: args.partyIndices,
    corpusText: args.corpusText,
    pageLayouts: args.pageLayouts,
    documentId: args.documentId,
    existingFields: args.fields.filter((f) => f.type !== "initials" || !f.autoInitials),
  });
  const eligiblePages = policy.eligiblePages;
  const initialsFields = args.fields.filter((f) => f.type === "initials" && f.autoInitials);
  const signatureFields = args.fields.filter((f) => f.type === "signature");
  const placementCtx = buildVs01PlacementContext({
    corpusText: args.corpusText,
    pageCount,
    pageLayouts: args.pageLayouts,
    documentId: args.documentId,
    roleCount,
  });
  const reconciledLayouts = placementCtx.layouts;
  const witnessPageIndex = placementCtx.witnessPageIndex ?? pageCount - 1;
  const corpusLayouts =
    (args.corpusText ?? "").trim().length >= 40
      ? buildCorpusSimulatedPageLayouts(args.corpusText!, pageCount)
      : [];

  const pagesWithInitialsPerRole: number[] = [];
  const incompletePages: number[] = [];
  let unsafeInitialsCount = 0;
  let unsafeSignatureCount = 0;
  const witnessLayout = mergePageLayoutForInitials(
    pageLayoutForIndex(reconciledLayouts, witnessPageIndex),
    pageLayoutForIndex(corpusLayouts, witnessPageIndex),
  );
  for (const sig of signatureFields) {
    const check = verifySignatureRectClear({
      rect: sig,
      pageLayout: witnessLayout,
      fieldObstacles: args.fields.filter((f) => f.id !== sig.id && f.page === sig.page),
    });
    if (!check.ok) unsafeSignatureCount += 1;
  }

  for (const p of eligiblePages) {
    const pdfLayout = pageLayoutForIndex(reconciledLayouts, p);
    const corpusLayout = pageLayoutForIndex(corpusLayouts, p);
    const effective = mergePageLayoutForInitials(pdfLayout, corpusLayout);
    const onPage = args.fields.filter((f) => f.page === p);
    const band = initialsReservedBandForPage(VS01_INITIALS_DOM_REFERENCE_PAGE_HEIGHT_PX);
    logVs01InitialsReservedBand({
      page: p,
      reservedBottomPx: band.reservedBottomPx,
      pageHeight: VS01_INITIALS_DOM_REFERENCE_PAGE_HEIGHT_PX,
      contentBottomLimit: band.contentBottomLimit,
    });
    const partiesWithInitials = new Set(
      initialsFields
        .filter((f) => f.page === p)
        .map((f) => f.assignedPartyIndex ?? -1)
        .filter((idx) => idx >= 0),
    );
    const placedCount = partiesWithInitials.size;
    pagesWithInitialsPerRole.push(placedCount);

    if (placedCount < roleCount) {
      incompletePages.push(p);
      logVs01InitialsPageIncomplete({
        page: p,
        reason: "missing_initials_for_role",
        placedCount,
        roleCount,
      });
    } else {
      logVs01InitialsPageComplete({ page: p, partyCount: roleCount, placedCount });
    }

    for (const field of initialsFields.filter((f) => f.page === p)) {
      const partyIndex = field.assignedPartyIndex ?? 0;
      const fieldObstacles = onPage
        .filter((o) => o.id !== field.id)
        .map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height }));
      const dom = computeInitialsDomPlacementPx({
        pageWidth: VS01_INITIALS_DOM_REFERENCE_PAGE_WIDTH_PX,
        pageHeight: VS01_INITIALS_DOM_REFERENCE_PAGE_HEIGHT_PX,
        signerIndex: partyIndex,
        signerCount: roleCount,
        fieldObstacles,
        allowSignatureShift: true,
      });
      const { colFromRight } = initialsDomSignerColumn(partyIndex, roleCount);
      const domCheck = validateInitialsDomPlacement({
        page: p,
        signerIndex: partyIndex,
        placement: dom,
        pageHeight: VS01_INITIALS_DOM_REFERENCE_PAGE_HEIGHT_PX,
        isRightmostInRow: colFromRight === 0,
        shiftedForSignature: dom.bottomDistance > 96,
      });
      const textCollision = checkInitialsDomTextCollisions({
        placement: dom,
        pageWidth: VS01_INITIALS_DOM_REFERENCE_PAGE_WIDTH_PX,
        pageHeight: VS01_INITIALS_DOM_REFERENCE_PAGE_HEIGHT_PX,
        textRects: effective?.textRects ?? [],
      });
      logVs01InitialsTextCollisionCheck({
        page: p,
        signerIndex: partyIndex,
        initialsRect: {
          left: dom.left,
          top: dom.top,
          width: dom.width,
          height: dom.height,
        },
        textRectCount: effective?.textRects.length ?? 0,
        collisionCount: textCollision.collisionCount,
        worstOverlapPx: textCollision.worstOverlapPx,
      });
      if (!domCheck.passed) {
        unsafeInitialsCount += 1;
      }
      if (textCollision.collisionCount > 0) {
        unsafeInitialsCount += 1;
      }
      const hitsSignature = onPage.some(
        (o) => o.id !== field.id && o.type === "signature" && fieldRectsOverlap(field, o, 0.012),
      );
      if (hitsSignature) {
        unsafeInitialsCount += 1;
      }
    }
  }

  const summary: Vs01SigningPacketInitialsSummary = {
    pageCount,
    roleCount,
    eligiblePages,
    pagesWithInitialsPerRole,
    incompletePages,
    unsafeInitialsCount,
    initialsFieldCount: initialsFields.length,
    signatureFieldCount: signatureFields.length,
    unsafeSignatureCount,
    witnessPageIndex,
    complete:
      signatureFields.length >= roleCount &&
      unsafeSignatureCount === 0 &&
      eligiblePages.length > 0 &&
      incompletePages.length === 0 &&
      unsafeInitialsCount === 0 &&
      initialsFields.length >= eligiblePages.length * roleCount,
  };

  const initialsPagesPlaced = new Set(initialsFields.map((f) => f.page)).size;
  logVs01SigningPacketValidation({
    pageCount: summary.pageCount,
    signatureFieldCount: summary.signatureFieldCount,
    initialsPagesExpected: pageCount * roleCount,
    initialsPagesPlaced,
    initialsFieldsPlaced: initialsFields.length,
    unsafeInitialsCount: summary.unsafeInitialsCount,
    unsafeSignatureCount: summary.unsafeSignatureCount,
    witnessPageIndex: summary.witnessPageIndex,
    incompletePages: summary.incompletePages,
    complete: summary.complete,
  });

  return summary;
}

export function formatVs01InitialsOnlyStatusLine(
  summary: Vs01SigningPacketInitialsSummary | null,
): string | null {
  if (!summary || summary.eligiblePages.length === 0) return null;
  const expectedPages = summary.eligiblePages.length;
  const pagesFullyPlaced = summary.eligiblePages.filter(
    (_, i) => (summary.pagesWithInitialsPerRole[i] ?? 0) >= summary.roleCount,
  ).length;
  if (summary.complete) {
    return `Initials placed on ${pagesFullyPlaced} of ${expectedPages} pages.`;
  }
  if (pagesFullyPlaced < expectedPages) {
    const pageNums = summary.incompletePages.map((p) => p + 1).join(", ");
    return `Initials need review on page${summary.incompletePages.length === 1 ? "" : "s"} ${pageNums}.`;
  }
  if (summary.unsafeInitialsCount > 0) {
    return "Initials overlap text or fields — review placement.";
  }
  return "Initials placement incomplete — review before sending.";
}

export function formatVs01PrepareInitialsStatus(args: {
  signatureFieldCount: number;
  initialsSummary: Vs01SigningPacketInitialsSummary | null;
}): string {
  const sig = args.signatureFieldCount;
  const sigLabel = `${sig} signature field${sig === 1 ? "" : "s"} placed`;
  const summary = args.initialsSummary;
  if (!summary || summary.eligiblePages.length === 0) {
    return `${sigLabel}.`;
  }
  const expectedPages = summary.eligiblePages.length;
  const pagesFullyPlaced = summary.eligiblePages.filter(
    (_, i) => (summary.pagesWithInitialsPerRole[i] ?? 0) >= summary.roleCount,
  ).length;
  if (summary.complete) {
    return `${sigLabel}. Initials placed on ${pagesFullyPlaced} of ${expectedPages} pages.`;
  }
  if (pagesFullyPlaced < expectedPages) {
    const pageNums = summary.incompletePages.map((p) => p + 1).join(", ");
    return `${sigLabel}. Initials need review on page${summary.incompletePages.length === 1 ? "" : "s"} ${pageNums}.`;
  }
  if (summary.unsafeInitialsCount > 0) {
    return `${sigLabel}. Initials overlap text or fields — review placement.`;
  }
  return `${sigLabel}. Initials placement incomplete — review before sending.`;
}
