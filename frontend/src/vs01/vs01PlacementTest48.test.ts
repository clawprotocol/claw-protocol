import { describe, expect, it } from "vitest";
import {
  buildAutoSignaturePacketForAllRoles,
  removeStaleSignatureOnlyAutoplaceFields,
  signingFieldGeometryHash,
} from "./vs01AutoSignaturePacket";
import { buildPrepareAutoInitialsEveryPage } from "./vs01PrepareFieldPlacement";
import {
  __resetVs01DocumentLayoutCacheForTests,
  clearVs01DocumentPageLayouts,
  getVs01DocumentPageLayouts,
  setVs01DocumentPageLayouts,
} from "./vs01DocumentLayoutCache";
import {
  buildVs01PlacementContext,
  resolveSignatureRectForRole,
  vs01SignatureManualPlacementRequired,
} from "./vs01FieldGeometry";
import {
  buildCorpusSimulatedPageLayouts,
  detectWitnessSignaturePageIndex,
  findByLinePlacementsFromPageLayout,
  pageLayoutForIndex,
  reconcileVs01PageLayouts,
  type Vs01PageTextLayout,
} from "./vs01PageTextLayout";
import type { PlacedSigningField } from "./signingFields";
import {
  buildRecipientSigningDocumentFields,
  buildVs01PrepareSigningRoles,
} from "./vs01SignerFieldAssignment";
import { buildFullPacketSigningManifestFields } from "./vs01SigningPacketManifest";

const TEST48_TAIL = `
IN WITNESS WHEREOF, the parties execute below.

CLIENT:
Acme LLC
By: __________________________
Name: Anthem H Blanchard
Title: Manager
Date: _________________________

SERVICE PROVIDER:
Joe Smith
By: __________________________
Name: Joe Smith
Date: _________________________
`.trim();

const TEST48_BODY = `AI Automation Services Agreement between Acme LLC and Joe Smith.

${"Operational terms, payment, confidentiality, and general provisions apply throughout. ".repeat(48)}
`;

const TEST48_CORPUS = `${TEST48_BODY}\n${TEST48_TAIL}`;
const WITNESS_PAGE_INDEX = 3;
const PAGE_COUNT = 5;

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test48",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@acme.com",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@x.com", signerName: "Joe Smith" }],
  });
}

/** Witness block on page 4 (0-based index 3); page 5 is footer-only (mimics PDF extraction drift). */
function buildTest48PdfLikeLayouts(): Vs01PageTextLayout[] {
  const sim = buildCorpusSimulatedPageLayouts(TEST48_CORPUS, PAGE_COUNT);
  const witnessTail = pageLayoutForIndex(sim, PAGE_COUNT - 1)!;
  const sparseBody = (pageIndex: number): Vs01PageTextLayout => ({
    pageIndex,
    source: "pdf",
    textRects: [
      {
        x: 0.072,
        y: 0.14,
        width: 0.42,
        height: 0.018,
        text: `Agreement body page ${pageIndex + 1}`,
        kind: "body",
      },
    ],
  });
  return [
    sparseBody(0),
    sparseBody(1),
    sparseBody(2),
    { ...witnessTail, pageIndex: WITNESS_PAGE_INDEX, source: "pdf" },
    {
      pageIndex: 4,
      source: "pdf",
      textRects: [
        {
          x: 0.32,
          y: 0.93,
          width: 0.36,
          height: 0.02,
          text: "Confidential — page 5 footer",
          kind: "footer",
        },
      ],
    },
  ];
}

function witnessPageWithoutByLines(): Vs01PageTextLayout[] {
  const layouts = buildTest48PdfLikeLayouts();
  const witness = pageLayoutForIndex(layouts, WITNESS_PAGE_INDEX)!;
  return layouts.map((l) =>
    l.pageIndex === WITNESS_PAGE_INDEX
      ? {
          ...witness,
          textRects: witness.textRects.filter((r) => !/^By\s*:/i.test(r.text.trim())),
        }
      : l,
  );
}

describe("VS01 placement test48 — witness page geometry", () => {
  it("detects witness signature page from By lines, not last PDF page", () => {
    const pdfLike = buildTest48PdfLikeLayouts();
    expect(detectWitnessSignaturePageIndex(pdfLike, TEST48_CORPUS, 2)).toBe(WITNESS_PAGE_INDEX);
    expect(detectWitnessSignaturePageIndex(pdfLike, TEST48_CORPUS, 2)).not.toBe(PAGE_COUNT - 1);
    const lastBy = findByLinePlacementsFromPageLayout(pageLayoutForIndex(pdfLike, PAGE_COUNT - 1));
    expect(lastBy).toHaveLength(0);
  });

  it("reconciles PDF layouts with corpus witness page enrichment", () => {
    const reconciled = reconcileVs01PageLayouts({
      corpusText: TEST48_CORPUS,
      pageCount: PAGE_COUNT,
      pageLayouts: buildTest48PdfLikeLayouts(),
      roleCount: 2,
    });
    expect(reconciled.witnessPageIndex).toBe(WITNESS_PAGE_INDEX);
    expect(reconciled.finalPageCount).toBe(PAGE_COUNT);
    const by = findByLinePlacementsFromPageLayout(
      pageLayoutForIndex(reconciled.layouts, WITNESS_PAGE_INDEX),
    );
    expect(by.length).toBe(2);
  });

  it("places exactly two signatures on witness page By lines, not page 5", () => {
    const pdfLike = buildTest48PdfLikeLayouts();
    const r = roles();
    const result = buildAutoSignaturePacketForAllRoles({
      roles: r,
      pageCount: PAGE_COUNT,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AB", signerEmail: "anthem@acme.com" },
      corpusText: TEST48_CORPUS,
      pageLayouts: pdfLike,
    });
    const sigs = result.fields.filter((f) => f.type === "signature");
    expect(sigs).toHaveLength(2);
    expect(sigs.every((f) => f.page === WITNESS_PAGE_INDEX)).toBe(true);
    expect(sigs.some((f) => f.page === PAGE_COUNT - 1)).toBe(false);
    const by = findByLinePlacementsFromPageLayout(pageLayoutForIndex(pdfLike, WITNESS_PAGE_INDEX));
    const owner = sigs.find((f) => f.assignedPartyIndex === 0)!;
    const cp = sigs.find((f) => f.assignedPartyIndex === 1)!;
    expect(owner.x).toBeCloseTo(by[0]!.x, 2);
    expect(cp.x).toBeCloseTo(by[1]!.x, 2);
  });

  it("places initials on every page including witness and footer-only last page", () => {
    const pdfLike = buildTest48PdfLikeLayouts();
    const owner = roles()[0]!;
    const initials = buildPrepareAutoInitialsEveryPage({
      role: owner,
      pageCount: PAGE_COUNT,
      skippedPages: new Set(),
      existingFields: [],
      valueCtx: { typedName: "Anthem H Blanchard", initials: "AB" },
      corpusText: TEST48_CORPUS,
      pageLayouts: pdfLike,
      signerCount: 2,
    });
    const pages = new Set(initials.map((f) => f.page));
    expect(initials.some((f) => f.page === WITNESS_PAGE_INDEX)).toBe(true);
    expect(pages.has(PAGE_COUNT - 1)).toBe(true);
    expect(pages.size).toBe(PAGE_COUNT);
  });

  it("prepare and recipient signing share the same geometry hash", () => {
    const r = roles();
    const owner = r[0]!;
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: r,
      pageCount: PAGE_COUNT,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AB", signerEmail: "anthem@acme.com" },
      corpusText: TEST48_CORPUS,
      pageLayouts: buildTest48PdfLikeLayouts(),
    });
    const manifest = buildFullPacketSigningManifestFields({
      ownerRole: owner,
      roles: r,
      senderPlacedFields: packet.fields,
      recipientPlacedFields: [],
    });
    const recipientView = buildRecipientSigningDocumentFields({
      ownerRole: owner,
      roles: r,
      recipientPlacedFields: [],
      senderPlacedFields: manifest,
    });
    expect(signingFieldGeometryHash(manifest)).toBe(signingFieldGeometryHash(recipientView));
  });

  it("fresh signature_only packet strips stale page-5 signatures and non-signature autoplace", () => {
    const staleSig: PlacedSigningField = {
      id: "stale-sig-p5",
      type: "signature",
      page: PAGE_COUNT - 1,
      x: 0.2,
      y: 0.5,
      width: 0.3,
      height: 0.04,
      value: "",
      assignmentSource: "autoplace",
      assignedPartyIndex: 0,
      assignedPartyId: "owner",
      assignedSignerRoleId: "role-owner",
      assignedSignerRoleKind: "owner",
      assignedSignerRoleLabel: "Owner",
    };
    const staleName: PlacedSigningField = {
      ...staleSig,
      id: "stale-name",
      type: "printed_name",
      page: WITNESS_PAGE_INDEX,
    };
    const cleaned = removeStaleSignatureOnlyAutoplaceFields([staleSig, staleName]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]?.type).toBe("signature");
    expect(cleaned[0]?.page).toBe(PAGE_COUNT - 1);
    const fresh = buildAutoSignaturePacketForAllRoles({
      roles: roles(),
      pageCount: PAGE_COUNT,
      existingFields: cleaned,
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AB", signerEmail: "anthem@acme.com" },
      corpusText: TEST48_CORPUS,
      pageLayouts: buildTest48PdfLikeLayouts(),
    });
    const sigs = fresh.fields.filter((f) => f.type === "signature");
    expect(sigs.every((f) => f.page === WITNESS_PAGE_INDEX)).toBe(true);
    expect(sigs.some((f) => f.page === PAGE_COUNT - 1)).toBe(false);
  });

  it("recovers layout anchors from corpus when PDF witness page lacks By lines", () => {
    const layouts = witnessPageWithoutByLines();
    const ctx = buildVs01PlacementContext({
      corpusText: TEST48_CORPUS,
      pageCount: PAGE_COUNT,
      pageLayouts: layouts,
      roleCount: 2,
    });
    expect(
      vs01SignatureManualPlacementRequired({
        roles: roles(),
        corpusText: TEST48_CORPUS,
        pageLayouts: ctx.layouts,
        lastPage: ctx.witnessPageIndex ?? WITNESS_PAGE_INDEX,
      }),
    ).toBe(false);
    const ownerPlacement = resolveSignatureRectForRole({
      role: { partyIndex: 0, kind: "owner" },
      roleCount: 2,
      corpusText: TEST48_CORPUS,
      pageLayouts: ctx.layouts,
      lastPage: ctx.witnessPageIndex ?? WITNESS_PAGE_INDEX,
    });
    expect(ownerPlacement.rect).not.toBeNull();
    expect(ownerPlacement.anchorKind).toBe("by_line_layout");
  });

  it("clears stale document layout cache on fresh document id", () => {
    __resetVs01DocumentLayoutCacheForTests();
    const layouts = buildTest48PdfLikeLayouts();
    setVs01DocumentPageLayouts("doc-a", layouts);
    expect(getVs01DocumentPageLayouts("doc-a")).toEqual(layouts);
    clearVs01DocumentPageLayouts();
    expect(getVs01DocumentPageLayouts("doc-a")).toBeNull();
  });
});
