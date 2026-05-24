import { describe, expect, it } from "vitest";
import {
  buildAutoSignaturePacketForAllRoles,
  signingFieldGeometryHash,
} from "./vs01AutoSignaturePacket";
import { buildVs01PlacementContext, findSafeInitialsRectOnPage } from "./vs01FieldGeometry";
import { verifyCanonicalInitialsRectClear } from "./vs01InitialsCanonicalPlacement";
import { buildPrepareAutoInitialsForAllRoles } from "./vs01PrepareFieldPlacement";
import { summarizeVs01SigningPacketInitials } from "./vs01SigningPacketInitials";
import {
  buildCorpusSimulatedPageLayouts,
  findSignatureLinePlacementsFromPageLayout,
  mergePageLayoutForInitials,
  pageLayoutForIndex,
  type Vs01PageTextLayout,
} from "./vs01PageTextLayout";
import {
  buildRecipientSigningDocumentFields,
  buildVs01PrepareSigningRoles,
} from "./vs01SignerFieldAssignment";

const WITNESS_TAIL = `
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

const ELECTRONIC_SIGS =
  "Electronic signatures shall be considered valid and binding. This Agreement may be executed electronically through the LawDog workflow and signature process. Electronic signatures and records shall be binding and enforceable to the maximum extent permitted by applicable law.";

const PAGE_COUNT = 3;
const SIGNATURE_PAGE = 2;

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test51",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@acme.com",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.com" }],
  });
}

/** Page 3 (index 2): body text runs low; mimics smoke-test overlap on electronic-signatures paragraph. */
function buildThreePageLayoutsWithLowText(): Vs01PageTextLayout[] {
  const body = Array.from({ length: 28 }, (_, i) => `Section ${i + 1} operative clause text.`);
  const corpus = `${body.join("\n")}\n\n10.3 ${ELECTRONIC_SIGS}\n\n${WITNESS_TAIL}`;
  const sim = buildCorpusSimulatedPageLayouts(corpus, PAGE_COUNT);
  const sigPage = pageLayoutForIndex(sim, SIGNATURE_PAGE)!;
  const lowTextRects = [
    ...sigPage.textRects.filter((r) => !/Electronic signatures/i.test(r.text)),
    {
      x: 0.072,
      y: 0.78,
      width: 0.86,
      height: 0.11,
      text: ELECTRONIC_SIGS,
      kind: "body" as const,
    },
  ];
  return sim.map((l) =>
    l.pageIndex === SIGNATURE_PAGE
      ? { ...l, source: "pdf" as const, textRects: lowTextRects }
      : { ...l, source: "pdf" as const },
  );
}

describe("VS01 placement test51 — initials safe zones", () => {
  it("uses DOM bottom-right placement when text extends near footer", () => {
    const layouts = buildThreePageLayoutsWithLowText();
    const layout = pageLayoutForIndex(layouts, SIGNATURE_PAGE)!;

    const safe = findSafeInitialsRectOnPage({
      page: SIGNATURE_PAGE,
      partyIndex: 0,
      pageLayout: layout,
      fieldObstacles: [],
      isSignaturePage: true,
      signerCount: 2,
    });
    expect(safe.rect).not.toBeNull();
    expect(safe.rect!.y).toBeGreaterThan(0.8);
  });

  it("includes signature page initials for guided Pro 3-page path", () => {
    const layouts = buildThreePageLayoutsWithLowText();
    const body = Array.from({ length: 28 }, (_, i) => `Section ${i + 1} operative clause text.`);
    const corpus = `${body.join("\n")}\n\n10.3 ${ELECTRONIC_SIGS}\n\n${WITNESS_TAIL}`;
    const initials = buildPrepareAutoInitialsForAllRoles({
      roles: roles(),
      pageCount: PAGE_COUNT,
      skippedSlots: new Set(),
      existingFields: [],
      corpusText: corpus,
      pageLayouts: layouts,
      valueCtxForRole: () => ({ typedName: "Anthem H Blanchard", initials: "AHB" }),
    });
    const owner = initials.filter((f) => f.assignedPartyIndex === 0);
    expect(owner.some((f) => f.page === SIGNATURE_PAGE)).toBe(true);
    const placementCtx = buildVs01PlacementContext({
      corpusText: corpus,
      pageCount: PAGE_COUNT,
      pageLayouts: layouts,
      roleCount: roles().length,
    });
    const corpusLayouts = buildCorpusSimulatedPageLayouts(corpus, PAGE_COUNT);
    for (const field of owner) {
      const effective = mergePageLayoutForInitials(
        pageLayoutForIndex(placementCtx.layouts, field.page),
        pageLayoutForIndex(corpusLayouts, field.page),
      );
      const check = verifyCanonicalInitialsRectClear({
        rect: field,
        pageLayout: effective,
        fieldObstacles: initials.filter((f) => f.id !== field.id && f.page === field.page),
      });
      expect(check.ok).toBe(true);
    }
  });

  it("keeps two signature fields anchored to visible By/Signature lines", () => {
    const layouts = buildThreePageLayoutsWithLowText();
    const corpus = `${"Terms. ".repeat(200)}\n${WITNESS_TAIL}`;
    const ctx = buildVs01PlacementContext({
      corpusText: corpus,
      pageCount: PAGE_COUNT,
      pageLayouts: layouts,
      roleCount: 2,
    });
    const witnessPage = ctx.witnessPageIndex ?? SIGNATURE_PAGE;
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: roles(),
      pageCount: PAGE_COUNT,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AHB", signerEmail: "anthem@acme.com" },
      corpusText: corpus,
      pageLayouts: layouts,
    });
    const sigs = packet.fields.filter((f) => f.type === "signature");
    expect(sigs.length).toBe(2);
    expect(sigs.every((f) => f.page === witnessPage)).toBe(true);
    const lines = findSignatureLinePlacementsFromPageLayout(pageLayoutForIndex(ctx.layouts, witnessPage));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(packet.confidence).toBe("high");
  });

  it("prepare and recipient share geometry hash with initials clear of text", () => {
    const layouts = buildThreePageLayoutsWithLowText();
    const corpus = `${"Terms. ".repeat(200)}\n${WITNESS_TAIL}`;
    const r = roles();
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: r,
      pageCount: PAGE_COUNT,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AHB", signerEmail: "anthem@acme.com" },
      corpusText: corpus,
      pageLayouts: layouts,
    });
    const initials = buildPrepareAutoInitialsForAllRoles({
      roles: r,
      pageCount: PAGE_COUNT,
      skippedSlots: new Set(),
      existingFields: packet.fields,
      corpusText: corpus,
      pageLayouts: layouts,
      valueCtxForRole: () => ({ typedName: "Anthem H Blanchard", initials: "AHB" }),
    });
    const merged = [...packet.fields, ...initials];
    const summary = summarizeVs01SigningPacketInitials({
      fields: merged,
      pageCount: PAGE_COUNT,
      roleCount: r.length,
      partyIndices: r.map((role) => role.partyIndex),
      corpusText: corpus,
      pageLayouts: layouts,
    });
    expect(summary.incompletePages).toEqual([]);
    expect(summary.complete).toBe(true);
    const recipient = buildRecipientSigningDocumentFields({
      ownerRole: r[0]!,
      roles: r,
      recipientPlacedFields: [],
      senderPlacedFields: merged,
    });
    const prepHash = signingFieldGeometryHash(merged);
    const recHash = signingFieldGeometryHash(recipient);
    expect(recHash).toBe(prepHash);
  });
});
