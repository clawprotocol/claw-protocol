/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, waitFor } from "@testing-library/react";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  buildVs01SigningPacketModel,
  maxFlowLinesPerSigningPacketPage,
  signatureFieldRectOnUnderlineAnchor,
  validateVs01SigningPacketDomRects,
  validateVs01SigningPacketGeometry,
} from "./buildVs01SigningPacketModel";
import { alignPlacedSignatureFieldToMeasuredUnderline } from "./vs01CanonicalTextLayout";
import { resolveVs01PreparePacketReadiness } from "./vs01PreparePacketReadiness";
import { Vs01CanonicalSigningPage } from "./Vs01CanonicalSigningPage";

const STARTER_749 = `${"Starter free preview clause. ".repeat(40)}`.slice(0, 749);

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_prepare_ux",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@example.test",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.test", signerName: "Joe Smith" }],
  });
}

function premiumCorpus(repeat = 90): string {
  return `${"Premium operational clause with detailed duties, milestones, remedies, approvals, and payment mechanics. ".repeat(repeat)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: ______________________
Name: Anthem H Blanchard
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Joe Smith
Signature: _______________
Name: Joe Smith
Date: ____________________`;
}

function buildPremiumModel() {
  return buildVs01SigningPacketModel({
    mode: "guided_pro",
    authoritativeCorpusPlain: premiumCorpus(),
    roles: roles(),
    corpusGateArgs: { freeBaselinePlain: STARTER_749 },
  });
}

describe("VS01 canonical prepare UX regressions", () => {
  it("keeps paginated text blocks out of the initials band", () => {
    const model = buildPremiumModel();
    expect(model.allowed).toBe(true);
    expect(model.diagnostics.textIntersectsInitialsBand).toBe(false);
    expect(
      validateVs01SigningPacketGeometry({
        pages: model.pages,
        fields: model.fields,
        roleCount: roles().length,
      }),
    ).not.toContain("text_intersects_initials_band");
  });

  it("places initials on every page for each signer", () => {
    const model = buildPremiumModel();
    const roleCount = roles().length;
    for (const page of model.pages) {
      const initials = model.fields.filter((f) => f.type === "initials" && f.page === page.pageIndex);
      expect(initials).toHaveLength(roleCount);
      for (const field of initials) {
        expect(field.y + field.height).toBeLessThanOrEqual(1);
        expect(field.y).toBeGreaterThanOrEqual(page.initialsBandRect.y - 0.01);
      }
    }
  });

  it("aligns both signature fields to underline anchors", () => {
    const model = buildPremiumModel();
    const witnessPage = model.pages.find((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    );
    expect(witnessPage).toBeTruthy();
    for (const partyIndex of [0, 1]) {
      const anchor = witnessPage!.signatureLineAnchors.find((a) => a.partyIndex === partyIndex);
      const field = model.fields.find((f) => f.type === "signature" && f.assignedPartyIndex === partyIndex);
      expect(anchor).toBeTruthy();
      expect(field).toBeTruthy();
      const onUnderline = signatureFieldRectOnUnderlineAnchor(anchor!);
      expect(field!.y).toBeCloseTo(onUnderline.y, 3);
      const aligned = alignPlacedSignatureFieldToMeasuredUnderline(field!, {
        x: anchor!.x,
        y: anchor!.y,
        width: anchor!.width,
        height: anchor!.height,
      });
      expect(aligned.y).toBeCloseTo(onUnderline.y, 3);
    }
  });

  it("does not start the witness block deep in a mostly empty page", () => {
    const model = buildPremiumModel();
    const witnessPage = model.pages.find((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    );
    expect(witnessPage).toBeTruthy();
    const witnessLineIdx = witnessPage!.flowLines.findIndex((line) =>
      /\bIN WITNESS WHEREOF\b/i.test(line),
    );
    const maxLines = maxFlowLinesPerSigningPacketPage();
    expect(witnessLineIdx).toBeGreaterThanOrEqual(0);
    expect(witnessLineIdx).toBeLessThan(Math.ceil(maxLines * 0.65));
  });

  it("bridge prepare source uses canonical-only geometry and debug hooks", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(src).toContain("[vs01-bridge-canonical-only]");
    expect(src).toContain("[vs01-packet-ready-reason]");
    const modelSrc = readFileSync(join(__dirname, "buildVs01SigningPacketModel.ts"), "utf8");
    expect(modelSrc).toContain("[vs01-canonical-pagination-page]");
    expect(src).toMatch(/effectivePageLayouts = agreementBridgePlacementCopy \? canonicalPageLayouts : pageLayouts/);
    expect(src).not.toMatch(/canonicalPageLayouts \?\? pageLayouts/);
    expect(src).toMatch(/packetReady[\s\S]{0,80}PREPARE_PACKET_BRIDGE_HEADLINE_READY/);
    expect(src).toContain("canonical_field_dom_pending");
    expect(src).toContain("Preparing fields...");
    expect(src).toContain("Initials band overlap");
    expect(src).toContain("Signature line alignment issue");
  });

  it("treats DOM measurement as pending before packetReady", () => {
    const pending = resolveVs01PreparePacketReadiness({
      corpusGate: { allowed: true },
      placementCanFinish: true,
      initialsSummary: { complete: true, unsafeInitialsCount: 0, unsafeSignatureCount: 0 },
      canonicalTextRendered: true,
      canonicalSignatureLinesRendered: true,
      canonicalDomMeasured: false,
      canonicalDomAligned: undefined,
    });
    expect(pending.packetReady).toBe(false);
    expect(pending.reason).toBe("canonical_field_dom_pending");
  });

  it("canonical rendered pages do not report initials-band overlap in DOM measure", async () => {
    const model = buildPremiumModel();
    const pagesWithText = model.pages.filter((page) => page.flowLines.some((line) => line.trim()));
    const layoutResults: boolean[] = [];
    for (const page of pagesWithText) {
      const pageHeightPx = (520 * 792) / 612;
      render(
        <div
          className="vs01-sign-page-surface vs01-sign-page-surface--canonical"
          style={{ width: 520, height: pageHeightPx, position: "relative" }}
        >
          <Vs01CanonicalSigningPage
            page={page}
            pageWidthPx={520}
            onLayoutMeasured={(result) => {
              layoutResults.push(result.textEntersInitialsBand);
            }}
          />
        </div>,
      );
    }
    await waitFor(() => {
      expect(layoutResults).toHaveLength(pagesWithText.length);
    });
    expect(layoutResults.every((flag) => flag === false)).toBe(true);
  });

  it("validates aligned signature DOM rects against canonical fields", () => {
    const model = buildPremiumModel();
    const witnessPage = model.pages.find((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    )!;
    const signatureFields = model.fields.filter((f) => f.type === "signature");
    const domRects = signatureFields.map((field) => {
      const anchor = witnessPage.signatureLineAnchors.find((a) => a.partyIndex === field.assignedPartyIndex)!;
      const onUnderline = signatureFieldRectOnUnderlineAnchor(anchor);
      return {
        fieldId: field.id,
        fieldType: field.type,
        page: field.page,
        rect: { x: onUnderline.x, y: onUnderline.y, width: onUnderline.width, height: onUnderline.height },
      };
    });
    const validation = validateVs01SigningPacketDomRects({
      pages: model.pages,
      fields: signatureFields,
      domRects,
    });
    expect(validation.ok).toBe(true);
  });
});
