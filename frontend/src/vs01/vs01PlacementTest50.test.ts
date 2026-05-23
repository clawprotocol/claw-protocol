import { describe, expect, it, vi } from "vitest";
import {
  buildAutoSignaturePacketForAllRoles,
  evaluateVs01SigningAutoPlacementQuality,
} from "./vs01AutoSignaturePacket";
import { rebuildSignatureBlocksWithPartyIdentities } from "../components/agreements/guidedDealCompletion/signerPartyIdentity";
import type { CanonicalPartyIdentity } from "../components/agreements/guidedDealCompletion/signerPartyIdentity";
import {
  findSignatureLineAnchorsFromCorpusText,
} from "./vs01SignatureBlockAnchors";
import { buildVs01PlacementContext } from "./vs01FieldGeometry";
import {
  buildCorpusSimulatedPageLayouts,
  detectWitnessSignaturePageIndex,
  findSignatureLinePlacementsFromPageLayout,
  pageLayoutForIndex,
  scoreWitnessPage,
} from "./vs01PageTextLayout";
import { buildPrepareAutoInitialsForAllRoles } from "./vs01PrepareFieldPlacement";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { corpusHasVisibleSignatureExecutionLines } from "../components/agreements/guidedDealCompletion/signatureRegion";
import { buildSendRouteReadonlyHtmlFromPlain } from "../components/agreements/sendHandoffAuthoritativeCorpus";

const IDENTITIES: readonly CanonicalPartyIdentity[] = [
  {
    index: 0,
    partyDisplayName: "Acme LLC",
    email: "anthem@acme.com",
    representativeName: "Anthem H Blanchard",
    title: "Manager",
    blockHeading: "CLIENT",
    isIndividual: false,
  },
  {
    index: 1,
    partyDisplayName: "Joe Smith",
    email: "joe@example.com",
    representativeName: "Joe Smith",
    title: null,
    blockHeading: "SERVICE PROVIDER",
    isIndividual: true,
  },
];

const WITNESS_TAIL = `
IN WITNESS WHEREOF, the parties execute below.

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

const CORPUS_BODY = `${Array.from({ length: 48 }, () => "Services, payment, and confidentiality terms apply throughout.").join("\n")}\n\n${WITNESS_TAIL}`;
const PAGE_COUNT = 10;

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test50",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@acme.com",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.com" }],
  });
}

/** PDF-like layouts: witness on page 7, schedule + execution placeholder on page 9 (last). */
function buildMisleadingLastPageLayouts(): ReturnType<typeof buildCorpusSimulatedPageLayouts> {
  const sim = buildCorpusSimulatedPageLayouts(CORPUS_BODY, PAGE_COUNT);
  const witnessPage = 7;
  const witnessLayout = pageLayoutForIndex(sim, PAGE_COUNT - 1)!;
  const layouts = sim.map((l) => {
    if (l.pageIndex === PAGE_COUNT - 1) {
      return {
        pageIndex: l.pageIndex,
        source: "pdf" as const,
        textRects: [
          {
            x: 0.072,
            y: 0.12,
            width: 0.5,
            height: 0.02,
            text: "SCHEDULE A — Phase, Payment, and Support Terms",
            kind: "heading" as const,
          },
          {
            x: 0.1,
            y: 0.42,
            width: 0.7,
            height: 0.02,
            text: "Execution and signature placement are handled in the electronic signing step.",
            kind: "body" as const,
          },
        ],
      };
    }
    if (l.pageIndex === witnessPage) {
      return { ...witnessLayout, pageIndex: witnessPage, source: "pdf" as const };
    }
    return { pageIndex: l.pageIndex, source: "pdf" as const, textRects: [] };
  });
  return layouts;
}

describe("VS01 placement test50 — visible signature block + initials regression", () => {
  it("rebuilds entity By and individual Signature execution lines for two parties", () => {
    const rebuilt = rebuildSignatureBlocksWithPartyIdentities("Agreement body.\n", IDENTITIES);
    expect(rebuilt.text).toMatch(/By:\s*_{3,}/);
    expect(rebuilt.text).toMatch(/Signature:\s*_{3,}/);
    expect(corpusHasVisibleSignatureExecutionLines(rebuilt.text)).toBe(true);
  });

  it("anchor parser resolves By for entity and Signature for individual", () => {
    const rebuilt = rebuildSignatureBlocksWithPartyIdentities(CORPUS_BODY, IDENTITIES);
    const anchors = findSignatureLineAnchorsFromCorpusText(rebuilt.text);
    expect(anchors.length).toBe(2);
    expect(anchors.map((a) => a.partyIndex).sort()).toEqual([0, 1]);
  });

  it("prefers witness page over schedule-only last page when PDF layouts drift", () => {
    const pdfLike = buildMisleadingLastPageLayouts();
    const witnessIdx = detectWitnessSignaturePageIndex(pdfLike, CORPUS_BODY, 2);
    expect(witnessIdx).toBe(7);
    expect(witnessIdx).not.toBe(PAGE_COUNT - 1);
    expect(scoreWitnessPage(pageLayoutForIndex(pdfLike, PAGE_COUNT - 1)).score).toBeLessThan(0);
  });

  it("places initials on every non-signature page via footer fallback when margin scan overlaps", () => {
    const pageCount = 5;
    const denseLayouts = buildCorpusSimulatedPageLayouts(CORPUS_BODY, pageCount).map((l) => ({
      ...l,
      textRects: l.textRects.map((r) => ({ ...r, kind: "body" as const })),
    }));
    const initials = buildPrepareAutoInitialsForAllRoles({
      roles: roles(),
      pageCount,
      skippedSlots: new Set(),
      existingFields: [],
      corpusText: CORPUS_BODY,
      pageLayouts: denseLayouts,
      valueCtxForRole: () => ({ typedName: "Anthem H Blanchard", initials: "AHB" }),
    });
    const witnessPage = detectWitnessSignaturePageIndex(denseLayouts, CORPUS_BODY, 2) ?? pageCount - 1;
    const ownerInitials = initials.filter((f) => f.assignedPartyIndex === 0);
    expect(ownerInitials.length).toBeGreaterThanOrEqual(witnessPage);
    for (const f of ownerInitials) {
      expect(f.page).toBeLessThan(witnessPage);
      expect(f.x).toBeGreaterThan(0.75);
    }
  });

  it("does not report placementOk when initials count is zero but initials are intended", () => {
    const quality = evaluateVs01SigningAutoPlacementQuality({
      signatureFieldCount: 2,
      initialsFieldCount: 0,
      roleCount: 2,
      pageCount: PAGE_COUNT,
      witnessPageIndex: 7,
      layoutSignatureLineCount: 2,
      corpusAnchorCount: 2,
      intendsInitials: true,
    });
    expect(quality.placementOk).toBe(false);
    expect(quality.initialsOk).toBe(false);
    expect(quality.warnings).toContain("initials_missing");
  });

  it("anchors signature fields on witness page By/Signature lines, not floating on schedule page", () => {
    const pdfLike = buildMisleadingLastPageLayouts();
    const witnessPage = detectWitnessSignaturePageIndex(pdfLike, CORPUS_BODY, 2)!;
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: roles(),
      pageCount: PAGE_COUNT,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AHB", signerEmail: "anthem@acme.com" },
      corpusText: CORPUS_BODY,
      pageLayouts: pdfLike,
    });
    const sigs = packet.fields.filter((f) => f.type === "signature");
    expect(sigs.length).toBe(2);
    for (const f of sigs) {
      expect(f.page).toBe(witnessPage);
      expect(f.page).not.toBe(PAGE_COUNT - 1);
    }
    const ctx = buildVs01PlacementContext({
      corpusText: CORPUS_BODY,
      pageCount: PAGE_COUNT,
      pageLayouts: pdfLike,
      roleCount: 2,
    });
    const witnessLines = findSignatureLinePlacementsFromPageLayout(
      pageLayoutForIndex(ctx.layouts, witnessPage),
    );
    expect(witnessLines.length).toBeGreaterThanOrEqual(2);
  });

  it("omits execution-only HTML footer when corpus already has visible signature lines", () => {
    const html = buildSendRouteReadonlyHtmlFromPlain(CORPUS_BODY);
    expect(html).not.toContain("Execution and signature placement are handled");
  });

  it("warns instead of success when auto packet lacks layout anchors", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    buildAutoSignaturePacketForAllRoles({
      roles: roles(),
      pageCount: 2,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AHB", signerEmail: "anthem@acme.com" },
      corpusText: "Short agreement without witness block.",
    });
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes("[signing-auto-placement-incomplete]"))).toBe(
      true,
    );
    warnSpy.mockRestore();
  });
});
