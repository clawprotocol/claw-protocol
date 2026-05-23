/**
 * Per-page VS01 initials placement planning and packet validation.
 */

import type { PlacedSigningField } from "./signingFields";
import {
  initialsFieldsOverlapDocumentText,
  layoutHasPlaceableInitialsContent,
  textObstaclesForInitialsPlacement,
  verifyInitialsRectClear,
} from "./vs01InitialsSafeZone";
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
    const eligible =
      policy.eligiblePages.includes(p) && layoutHasPlaceableInitialsContent(effective);
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
  const corpusLayouts =
    (args.corpusText ?? "").trim().length >= 40
      ? buildCorpusSimulatedPageLayouts(args.corpusText!, pageCount)
      : [];

  const pagesWithInitialsPerRole: number[] = [];
  const incompletePages: number[] = [];
  let unsafeInitialsCount = 0;

  for (const p of eligiblePages) {
    const pdfLayout = pageLayoutForIndex(args.pageLayouts, p);
    const corpusLayout = pageLayoutForIndex(corpusLayouts, p);
    const effective = mergePageLayoutForInitials(pdfLayout, corpusLayout);
    const onPage = args.fields.filter((f) => f.page === p);
    const roleIdsWithInitials = new Set(
      initialsFields.filter((f) => f.page === p).map((f) => (f.assignedSignerRoleId ?? "").trim()),
    );
    const placedCount = roleIdsWithInitials.size;
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
      const fieldObstacles = onPage
        .filter((o) => o.id !== field.id)
        .map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height }));
      const check = verifyInitialsRectClear({
        rect: field,
        pageLayout: effective,
        fieldObstacles,
      });
      if (!check.ok || initialsFieldsOverlapDocumentText([field], effective ? [effective] : [])) {
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
    complete:
      eligiblePages.length > 0 &&
      incompletePages.length === 0 &&
      unsafeInitialsCount === 0 &&
      initialsFields.length >= eligiblePages.length * roleCount,
  };

  logVs01SigningPacketValidation({
    pageCount: summary.pageCount,
    signatureFieldCount: args.fields.filter((f) => f.type === "signature").length,
    initialsPagesExpected: eligiblePages.length * roleCount,
    initialsPagesPlaced: initialsFields.length,
    unsafeInitialsCount: summary.unsafeInitialsCount,
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
