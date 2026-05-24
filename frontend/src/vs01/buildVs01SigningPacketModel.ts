import type { AgreementDraft } from "../agreement/agreementTypes";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { stripStaleExecutionPlacementCorpusCopy } from "../components/agreements/guidedDealCompletion/guidedCorpusLineRepairs";
import {
  corpusHasVisibleSignatureExecutionLines,
  corpusSignatureBlocksHaveRequiredByLines,
} from "../components/agreements/guidedDealCompletion/signatureRegion";
import {
  resolveFinalVs01CorpusOrBlock,
  type FinalVs01CorpusResolution,
  type ResolveFinalVs01CorpusOrBlockArgs,
} from "./vs01SigningCorpus";
import type { Vs01NormalizedRect } from "./vs01FieldCssGeometry";
import {
  findSignatureLinePlacementsFromPageLayout,
  type Vs01ByLinePlacement,
  type Vs01NormTextRect,
  type Vs01PageTextLayout,
} from "./vs01PageTextLayout";
import { newSigningFieldId, type PlacedSigningField } from "./signingFields";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { PREPARE_FIELD_ASSIGNMENT_SOURCE } from "./vs01PrepareFieldPlacement";
import { defaultPrepareTemplateStoredValue } from "./vs01PrepareTemplateField";

export type Vs01SigningPacketMode = "guided_pro" | "free" | "uploaded_pdf";

export type Vs01SigningPacketPage = {
  pageIndex: number;
  contentRect: Vs01NormalizedRect;
  /** Source lines for flow layout (preferred over absolute textBlocks). */
  flowLines: string[];
  textBlocks: Vs01NormTextRect[];
  initialsBandRect: Vs01NormalizedRect;
  reservedInitialsBandRect: Vs01NormalizedRect;
  signatureAnchorRects: Vs01ByLinePlacement[];
  signatureLineAnchors: Vs01ByLinePlacement[];
  footerRect: Vs01NormalizedRect;
};

export type Vs01SigningPacketDiagnostics = {
  corpusGate: FinalVs01CorpusResolution;
  textIntersectsInitialsBand: boolean;
  signatureAnchorCount: number;
  signatureFieldCount: number;
  initialsFieldCount: number;
  validationErrors: string[];
};

export type Vs01SigningPacketModel = {
  allowed: boolean;
  pages: Vs01SigningPacketPage[];
  fields: PlacedSigningField[];
  corpus: string;
  diagnostics: Vs01SigningPacketDiagnostics;
};

export const VS01_PACKET_PAGE_WIDTH_PT = 612;
export const VS01_PACKET_PAGE_HEIGHT_PT = 792;
export const VS01_PACKET_MARGIN_LEFT_PT = 44;
export const VS01_PACKET_MARGIN_TOP_PT = 50;
export const VS01_PACKET_MARGIN_RIGHT_PT = 44;
export const VS01_PACKET_MARGIN_BOTTOM_PT = 40;
export const VS01_PACKET_INITIALS_BAND_PT = 300;
export const VS01_PACKET_LINE_HEIGHT_PT = 18;

const CONTENT_X = VS01_PACKET_MARGIN_LEFT_PT / VS01_PACKET_PAGE_WIDTH_PT;
const CONTENT_TOP = VS01_PACKET_MARGIN_TOP_PT / VS01_PACKET_PAGE_HEIGHT_PT;
const CONTENT_WIDTH =
  (VS01_PACKET_PAGE_WIDTH_PT - VS01_PACKET_MARGIN_LEFT_PT - VS01_PACKET_MARGIN_RIGHT_PT) /
  VS01_PACKET_PAGE_WIDTH_PT;
const BAND_TOP =
  (VS01_PACKET_PAGE_HEIGHT_PT - VS01_PACKET_MARGIN_BOTTOM_PT - VS01_PACKET_INITIALS_BAND_PT) /
  VS01_PACKET_PAGE_HEIGHT_PT;
const BAND_HEIGHT = VS01_PACKET_INITIALS_BAND_PT / VS01_PACKET_PAGE_HEIGHT_PT;
const FOOTER_TOP = (VS01_PACKET_PAGE_HEIGHT_PT - VS01_PACKET_MARGIN_BOTTOM_PT) / VS01_PACKET_PAGE_HEIGHT_PT;
const LINE_HEIGHT = VS01_PACKET_LINE_HEIGHT_PT / VS01_PACKET_PAGE_HEIGHT_PT;
const CONTENT_BOTTOM_LIMIT = BAND_TOP;
const CHARS_PER_LINE = 84;

function normalizeLines(corpus: string): string[] {
  const out: string[] = [];
  for (const raw of corpus.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = raw.trimEnd();
    if (!trimmed.trim()) {
      out.push("");
      continue;
    }
    if (trimmed.length <= CHARS_PER_LINE) {
      out.push(trimmed);
      continue;
    }
    let rest = trimmed;
    while (rest.length > CHARS_PER_LINE) {
      const cut = rest.lastIndexOf(" ", CHARS_PER_LINE);
      const idx = cut > 32 ? cut : CHARS_PER_LINE;
      out.push(rest.slice(0, idx).trimEnd());
      rest = rest.slice(idx).trimStart();
    }
    if (rest) out.push(rest);
  }
  return out;
}

function canonicalWitnessBlockFromRoles(roles: readonly Vs01PrepareSigningRole[]): string {
  const [owner, ...others] = roles;
  const blocks: string[] = ["IN WITNESS WHEREOF, the Parties execute this Agreement."];
  if (owner) {
    blocks.push(
      [
        "CLIENT:",
        owner.entityName || owner.partyName || "Client",
        "By: ______________________",
        `Name: ${owner.signerName || owner.entityName || owner.partyName || ""}`.trim(),
        ...(owner.signerTitle ? [`Title: ${owner.signerTitle}`] : []),
        "Date: ____________________",
      ].join("\n"),
    );
  }
  others.forEach((role, i) => {
    blocks.push(
      [
        i === 0 ? "SERVICE PROVIDER:" : `PARTY ${i + 2}:`,
        role.entityName || role.partyName || `Party ${i + 2}`,
        "Signature: _______________",
        `Name: ${role.signerName || role.entityName || role.partyName || ""}`.trim(),
        ...(role.signerTitle ? [`Title: ${role.signerTitle}`] : []),
        "Date: ____________________",
      ].join("\n"),
    );
  });
  return blocks.join("\n\n");
}

function ensureWitnessBlockFromRoles(corpus: string, roles: readonly Vs01PrepareSigningRole[]): string {
  const cleaned = stripStaleExecutionPlacementCorpusCopy(corpus).text.trim();
  const signerCount = Math.max(2, roles.length);
  if (
    corpusHasVisibleSignatureExecutionLines(cleaned) &&
    corpusSignatureBlocksHaveRequiredByLines(cleaned, signerCount)
  ) {
    return cleaned;
  }
  return `${cleaned.replace(/\n+$/g, "")}\n\n${canonicalWitnessBlockFromRoles(roles)}`.trim();
}

function classifyText(line: string): Vs01NormTextRect["kind"] {
  const t = line.trim();
  if (/^(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(t)) return "heading";
  if (/^(?:By|Signature|Name|Title|Date)\s*:/i.test(t)) return "signature_label";
  if (/^IN WITNESS WHEREOF/i.test(t)) return "heading";
  return "body";
}

function lineWidth(line: string): number {
  return Math.min(CONTENT_WIDTH, Math.max(0.08, line.trim().length * 0.0052));
}

function textRectIntersects(a: Vs01NormalizedRect, b: Vs01NormalizedRect): boolean {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x > 0 && y > 0;
}

type PaginatedCorpusSlice = {
  pageIndex: number;
  flowLines: string[];
  textRects: Vs01NormTextRect[];
};

function paginateCorpus(corpus: string): PaginatedCorpusSlice[] {
  const lines = normalizeLines(corpus);
  const maxLinesPerPage = Math.max(1, Math.floor((CONTENT_BOTTOM_LIMIT - CONTENT_TOP) / LINE_HEIGHT));
  const pages: PaginatedCorpusSlice[] = [];
  let pageIndex = 0;
  let lineInPage = 0;
  let pageLines: string[] = [];
  let rects: Vs01NormTextRect[] = [];

  const flush = () => {
    pages.push({ pageIndex, flowLines: pageLines, textRects: rects });
    pageIndex += 1;
    lineInPage = 0;
    pageLines = [];
    rects = [];
  };

  for (const line of lines) {
    if (lineInPage >= maxLinesPerPage) flush();
    pageLines.push(line);
    if (line.trim()) {
      rects.push({
        x: CONTENT_X,
        y: CONTENT_TOP + lineInPage * LINE_HEIGHT,
        width: lineWidth(line),
        height: LINE_HEIGHT * 0.92,
        text: line,
        kind: classifyText(line),
      });
    }
    lineInPage += 1;
  }
  flush();
  return pages.length ? pages : [{ pageIndex: 0, flowLines: [], textRects: [] }];
}

function fieldBase(role: Vs01PrepareSigningRole, page: number): Pick<
  PlacedSigningField,
  | "page"
  | "assignedPartyId"
  | "assignedPartyIndex"
  | "assignedSignerEmail"
  | "assignedSignerRoleId"
  | "assignedSignerRoleLabel"
  | "assignedSignerRoleKind"
  | "assignmentSource"
> {
  return {
    page,
    assignedPartyId: role.partyId,
    assignedPartyIndex: role.partyIndex,
    assignedSignerEmail: role.signerEmail,
    assignedSignerRoleId: role.roleId,
    assignedSignerRoleLabel: role.entityName,
    assignedSignerRoleKind: role.kind,
    assignmentSource: PREPARE_FIELD_ASSIGNMENT_SOURCE,
  };
}

function signatureFieldForAnchor(role: Vs01PrepareSigningRole, anchor: Vs01ByLinePlacement, page: number): PlacedSigningField {
  return {
    id: `canonical_sig_${role.roleId}_${page}_${newSigningFieldId()}`,
    type: "signature",
    x: anchor.x,
    y: anchor.y,
    width: Math.max(0.2, anchor.width),
    height: Math.max(0.028, anchor.height * 1.35),
    value: defaultPrepareTemplateStoredValue("signature", role, {
      typedName: role.signerName || role.entityName,
      initials: "",
      signerEmail: role.signerEmail,
    }),
    ...fieldBase(role, page),
  };
}

function initialsFieldForRole(role: Vs01PrepareSigningRole, page: number, roleIndex: number, roleCount: number): PlacedSigningField {
  const boxWidth = 0.15;
  const boxHeight = 0.08;
  const gap = 0.022;
  const cols = Math.min(2, Math.max(1, roleCount));
  const col = roleIndex % cols;
  const row = Math.floor(roleIndex / cols);
  const right = CONTENT_X + CONTENT_WIDTH - 0.055 - boxWidth - (cols - 1 - col) * (boxWidth + gap);
  const top = BAND_TOP + 0.16 + row * (boxHeight + 0.035);
  return {
    id: `canonical_initials_${role.roleId}_${page}`,
    type: "initials",
    x: right,
    y: Math.min(BAND_TOP + BAND_HEIGHT - boxHeight - 0.02, top),
    width: boxWidth,
    height: boxHeight,
    value: defaultPrepareTemplateStoredValue("initials", role, {
      typedName: role.signerName || role.entityName,
      initials: "",
      signerEmail: role.signerEmail,
    }),
    autoInitials: true,
    ...fieldBase(role, page),
  };
}

export function signingPacketLayoutsFromModel(model: Pick<Vs01SigningPacketModel, "pages">): Vs01PageTextLayout[] {
  return model.pages.map((p) => ({
    pageIndex: p.pageIndex,
    source: "corpus_sim",
    textRects: p.textBlocks,
  }));
}

export function validateVs01SigningPacketGeometry(args: {
  pages: readonly Vs01SigningPacketPage[];
  fields: readonly PlacedSigningField[];
  roleCount: number;
}): string[] {
  const errors: string[] = [];
  const textIntersectsInitialsBand = args.pages.some((page) =>
    page.textBlocks.some((text) => textRectIntersects(text, page.initialsBandRect)),
  );
  if (textIntersectsInitialsBand) {
    for (const page of args.pages) {
      const offenders = page.textBlocks.filter((text) => textRectIntersects(text, page.initialsBandRect));
      if (offenders.length > 0) {
        // eslint-disable-next-line no-console
        console.warn("[vs01-text-in-initials-band-fail]", {
          page: page.pageIndex,
          text: offenders.slice(0, 3).map((t) => t.text),
          count: offenders.length,
        });
      }
    }
    errors.push("text_intersects_initials_band");
  }

  const signatureAnchorCount = args.pages.reduce((sum, p) => sum + p.signatureLineAnchors.length, 0);
  if (signatureAnchorCount < args.roleCount) errors.push("signature_anchor_count_below_roles");

  for (const field of args.fields.filter((f) => f.type === "initials")) {
    const page = args.pages.find((p) => p.pageIndex === field.page);
    if (!page || !textRectIntersects(field, page.initialsBandRect)) {
      errors.push(`initials_outside_reserved_band:${field.page}`);
    }
  }
  return [...new Set(errors)];
}

export function validateVs01SigningPacketDomRects(args: {
  model: Pick<Vs01SigningPacketModel, "pages" | "fields">;
  domRects: readonly { fieldId: string; fieldType: PlacedSigningField["type"]; page: number; rect: Vs01NormalizedRect }[];
}): { ok: boolean; mismatchCount: number } {
  let mismatchCount = 0;
  for (const dom of args.domRects) {
    const expected = args.model.fields.find((f) => f.id === dom.fieldId);
    const page = args.model.pages.find((p) => p.pageIndex === dom.page);
    let ok = Boolean(expected && page);
    if (expected && page) {
      if (expected.type === "signature") {
        const anchor = page.signatureAnchorRects.find((a) => a.partyIndex === expected.assignedPartyIndex);
        ok = Boolean(
          anchor &&
            (textRectIntersects(dom.rect, anchor) ||
              Math.abs(dom.rect.y - anchor.y) < 0.04),
        );
      } else if (expected.type === "initials") {
        ok =
          textRectIntersects(dom.rect, page.initialsBandRect) &&
          !page.textBlocks.some((text) => textRectIntersects(text, dom.rect));
      } else {
        ok = textRectIntersects(dom.rect, expected);
      }
    }
    if (!ok) mismatchCount += 1;
    // eslint-disable-next-line no-console
    console.info("[vs01-field-dom-vs-model]", {
      fieldType: dom.fieldType,
      page: dom.page,
      expectedRect: expected ?? null,
      actualRect: dom.rect,
      delta: expected
        ? {
            x: dom.rect.x - expected.x,
            y: dom.rect.y - expected.y,
            width: dom.rect.width - expected.width,
            height: dom.rect.height - expected.height,
          }
        : null,
      ok,
    });
  }
  return { ok: mismatchCount === 0, mismatchCount };
}

export function buildVs01SigningPacketModel(args: {
  mode: Vs01SigningPacketMode;
  authoritativeCorpusPlain?: string | null;
  roles: readonly Vs01PrepareSigningRole[];
  corpusGateArgs?: Omit<ResolveFinalVs01CorpusOrBlockArgs, "agreementCorpusText" | "guidedPro">;
  bridge?: AgreementVs01BridgeSession | null;
  draft?: AgreementDraft | null;
}): Vs01SigningPacketModel {
  const guidedPro = args.mode === "guided_pro";
  const authoritativeCorpusPlain = guidedPro
    ? ensureWitnessBlockFromRoles(args.authoritativeCorpusPlain ?? "", args.roles)
    : (args.authoritativeCorpusPlain ?? "");
  const corpusGate = resolveFinalVs01CorpusOrBlock({
    ...(args.corpusGateArgs ?? {}),
    agreementCorpusText: authoritativeCorpusPlain,
    bridge: args.bridge ?? args.corpusGateArgs?.bridge ?? null,
    draft: args.draft ?? args.corpusGateArgs?.draft ?? null,
    guidedPro,
  });
  const validationErrors: string[] = [];
  if (!corpusGate.allowed) validationErrors.push(corpusGate.blockReason ?? "corpus_gate_blocked");
  const layouts = corpusGate.allowed ? paginateCorpus(corpusGate.corpus) : [];
  const roles = [...args.roles];
  const fields: PlacedSigningField[] = [];
  const pages: Vs01SigningPacketPage[] = layouts.map((slice) => {
    const layout: Vs01PageTextLayout = {
      pageIndex: slice.pageIndex,
      source: "corpus_sim",
      textRects: slice.textRects,
    };
    const signatureLineAnchors = findSignatureLinePlacementsFromPageLayout(layout);
    const contentRect = {
      x: CONTENT_X,
      y: CONTENT_TOP,
      width: CONTENT_WIDTH,
      height: CONTENT_BOTTOM_LIMIT - CONTENT_TOP,
    };
    const initialsBandRect = {
      x: CONTENT_X,
      y: BAND_TOP,
      width: CONTENT_WIDTH,
      height: BAND_HEIGHT,
    };
    return {
      pageIndex: slice.pageIndex,
      contentRect,
      flowLines: slice.flowLines,
      textBlocks: slice.textRects,
      initialsBandRect,
      reservedInitialsBandRect: initialsBandRect,
      signatureAnchorRects: signatureLineAnchors,
      signatureLineAnchors,
      footerRect: {
        x: CONTENT_X,
        y: FOOTER_TOP,
        width: CONTENT_WIDTH,
        height: VS01_PACKET_MARGIN_BOTTOM_PT / VS01_PACKET_PAGE_HEIGHT_PT,
      },
    };
  });

  for (const role of roles) {
    const anchorPage = pages.find((p) => p.signatureLineAnchors.some((a) => a.partyIndex === role.partyIndex));
    const anchor = anchorPage?.signatureLineAnchors.find((a) => a.partyIndex === role.partyIndex) ?? null;
    if (!anchor || !anchorPage) {
      validationErrors.push(`missing_signature_anchor:${role.partyIndex}`);
      continue;
    }
    fields.push(signatureFieldForAnchor(role, anchor, anchorPage.pageIndex));
  }

  for (const page of pages) {
    roles.forEach((role, roleIndex) => {
      fields.push(initialsFieldForRole(role, page.pageIndex, roleIndex, roles.length));
    });
  }

  const totalVisibleChars = pages.reduce(
    (sum, p) =>
      sum +
      p.flowLines.reduce((lineSum, line) => lineSum + line.trim().length, 0),
    0,
  );
  if (corpusGate.allowed && totalVisibleChars < 80) {
    validationErrors.push("canonical_pages_blank");
  }
  const hasWitnessInPages = pages.some((p) =>
    p.textBlocks.some((b) => /\bIN WITNESS WHEREOF\b/i.test(b.text)),
  );
  if (corpusGate.allowed && guidedPro && !hasWitnessInPages) {
    validationErrors.push("witness_block_not_in_pages");
  }

  const signatureAnchorCount = pages.reduce((sum, p) => sum + p.signatureLineAnchors.length, 0);
  const geometryErrors = validateVs01SigningPacketGeometry({
    pages,
    fields,
    roleCount: roles.length,
  });
  validationErrors.push(...geometryErrors);

  const diagnostics: Vs01SigningPacketDiagnostics = {
    corpusGate,
    textIntersectsInitialsBand: geometryErrors.includes("text_intersects_initials_band"),
    signatureAnchorCount,
    signatureFieldCount: fields.filter((f) => f.type === "signature").length,
    initialsFieldCount: fields.filter((f) => f.type === "initials").length,
    validationErrors: [...new Set(validationErrors)],
  };

  return {
    allowed: corpusGate.allowed && diagnostics.validationErrors.length === 0,
    pages,
    fields,
    corpus: corpusGate.corpus,
    diagnostics,
  };
}
