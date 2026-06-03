/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  VS01_PACKET_PAGE_HEIGHT_PT,
  VS01_PACKET_PAGE_WIDTH_PT,
  buildVs01SigningPacketModel,
} from "./buildVs01SigningPacketModel";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { Vs01CanonicalSigningPage } from "./Vs01CanonicalSigningPage";
import {
  measureSignatureUnderlineNormRects,
  resolveSignatureDomFieldRect,
  signatureFieldRectFromMeasuredUnderline,
} from "./vs01SignatureDomPlacement";
import {
  VS01_SIGNATURE_BELOW_LINE_FRAC,
  VS01_SIGNATURE_OPTICAL_OFFSET_NORM,
  VS01_SIGNATURE_OVERLAY_HEIGHT_NORM,
} from "./vs01VisualConstants";

const STARTER_749 = `${"Starter free preview clause. ".repeat(40)}`.slice(0, 749);

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_dom_placement",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@example.test",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.test", signerName: "Joe Smith" }],
  });
}

function witnessCorpus(): string {
  return `${"Premium operational clause with milestones and payment terms. ".repeat(80)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: ______________________
Name: Anthem H Blanchard
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Joe Smith
By: ______________________
Name: Joe Smith
Title: Consultant
Date: ____________________`;
}

describe("vs01SignatureDomPlacement", () => {
  it("anchors signature overlay on underline with below-line overlap tail", () => {
    const underline = { x: 0.12, y: 0.72, width: 190 / 612, height: 0.012 };
    const field = signatureFieldRectFromMeasuredUnderline(underline);
    const underlineBaseline = underline.y + underline.height;
    const fieldBottom = field.y + field.height;
    expect(field.height).toBeCloseTo(VS01_SIGNATURE_OVERLAY_HEIGHT_NORM, 4);
    expect(fieldBottom - underlineBaseline).toBeCloseTo(
      VS01_SIGNATURE_OVERLAY_HEIGHT_NORM * VS01_SIGNATURE_BELOW_LINE_FRAC + VS01_SIGNATURE_OPTICAL_OFFSET_NORM,
      4,
    );
    expect(field.x).toBeGreaterThanOrEqual(underline.x);
  });

  it("reads underline DOM rects relative to the canonical page surface box", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: witnessCorpus(),
      roles: roles(),
      corpusGateArgs: {
        freeBaselinePlain: STARTER_749,
        premiumComplete: true,
        signaturePreparationRequested: true,
      },
    });
    expect(model.allowed).toBe(true);
    const witnessPage = model.pages.find((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    )!;
    expect(witnessPage).toBeTruthy();

    const { container } = render(
      <div
        className="vs01-sign-page-surface vs01-sign-page-surface--canonical"
        style={{ width: VS01_PACKET_PAGE_WIDTH_PT, height: VS01_PACKET_PAGE_HEIGHT_PT, position: "relative" }}
      >
        <Vs01CanonicalSigningPage page={witnessPage} pageWidthPx={VS01_PACKET_PAGE_WIDTH_PT} />
      </div>,
    );

    const surface = container.querySelector(".vs01-sign-page-surface") as HTMLElement;
    expect(surface).toBeTruthy();

    // jsdom has no layout engine — stub measured rects to prove DOM-relative normalization.
    const surfaceRect = { left: 40, top: 80, width: VS01_PACKET_PAGE_WIDTH_PT, height: VS01_PACKET_PAGE_HEIGHT_PT };
    surface.getBoundingClientRect = () =>
      ({
        ...surfaceRect,
        right: surfaceRect.left + surfaceRect.width,
        bottom: surfaceRect.top + surfaceRect.height,
        x: surfaceRect.left,
        y: surfaceRect.top,
        toJSON: () => ({}),
      }) as DOMRect;

    const lines = surface.querySelectorAll<HTMLElement>("[data-vs01-signature-execution-line]");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    lines.forEach((lineEl, idx) => {
      const underline = lineEl.querySelector<HTMLElement>(".vs01-canonical-signature-underline");
      expect(underline).toBeTruthy();
      const top = surfaceRect.top + 520 + idx * 72;
      const left = surfaceRect.left + 72;
      underline!.getBoundingClientRect = () =>
        ({
          left,
          top,
          width: 190,
          height: 14,
          right: left + 190,
          bottom: top + 14,
          x: left,
          y: top,
          toJSON: () => ({}),
        }) as DOMRect;
    });

    const measured = measureSignatureUnderlineNormRects(surface);
    expect(measured.size).toBeGreaterThanOrEqual(2);

    for (const partyIndex of [0, 1]) {
      const fallback = model.fields.find(
        (f) => f.type === "signature" && f.assignedPartyIndex === partyIndex,
      )!;
      const resolved = resolveSignatureDomFieldRect({
        pageSurface: surface,
        partyIndex,
        normalizedFallback: fallback,
      });
      const underline = measured.get(partyIndex)!;
      const expected = signatureFieldRectFromMeasuredUnderline(underline);
      expect(resolved.y).toBeCloseTo(expected.y, 4);
      expect(resolved.x).toBeCloseTo(expected.x, 4);
    }
  });
});
