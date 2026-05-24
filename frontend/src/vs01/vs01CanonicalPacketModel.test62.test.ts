import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePremiumSignaturePreviewMode } from "../components/agreements/premiumAgreementDocumentHtml";
import { updateLastKnownGoodAuthoritativeDraftRef } from "../components/agreements/guidedDealCompletion/guidedCompletionRenderAuthority";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  buildVs01SigningPacketModel,
  canonicalFlowStackBottomNorm,
  signatureFieldRectOnUnderlineAnchor,
  VS01_PACKET_INITIALS_BAND_PT,
} from "./buildVs01SigningPacketModel";

const STARTER_749 = `${"Starter free preview clause. ".repeat(40)}`.slice(0, 749);

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test62",
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

describe("test62 canonical VS01 e-sign packet render", () => {
  it("rejects 749-char rendered preview and last-known-good for paid guided e-sign", () => {
    const ref = { current: "" };
    expect(
      updateLastKnownGoodAuthoritativeDraftRef(ref, STARTER_749, "rendered_preview", {
        paidProFlow: true,
        freeBaselinePlain: STARTER_749,
        source: "rendered_preview",
      }),
    ).toBe(false);
    expect(ref.current).toBe("");

    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: STARTER_749,
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_749 },
    });
    expect(model.allowed).toBe(false);
    expect(model.pages).toHaveLength(0);
    expect(model.fields).toHaveLength(0);
  });

  it("forbids decorative fallback and renders explicit canonical page geometry", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_749 },
    });
    expect(model.allowed).toBe(true);
    expect(resolvePremiumSignaturePreviewMode(model.corpus, 2).mode).not.toBe(
      "decorative_fallback_signature_card",
    );
    expect(model.pages[0]).toMatchObject({
      contentRect: expect.any(Object),
      initialsBandRect: expect.any(Object),
      signatureAnchorRects: expect.any(Array),
      textBlocks: expect.any(Array),
    });
  });

  it("reserves initials band and paginates dense text before the band", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(160),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_749 },
    });
    expect(model.allowed).toBe(true);
    expect(model.pages.length).toBeGreaterThan(1);
    for (const page of model.pages) {
      expect(page.initialsBandRect.height).toBeCloseTo(VS01_PACKET_INITIALS_BAND_PT / 792, 3);
      const textBottom = Math.max(0, ...page.textBlocks.map((b) => b.y + b.height));
      expect(textBottom).toBeLessThanOrEqual(page.initialsBandRect.y);
      expect(canonicalFlowStackBottomNorm(page)).toBeLessThanOrEqual(page.initialsBandRect.y);
      for (const field of model.fields.filter((f) => f.type === "initials" && f.page === page.pageIndex)) {
        expect(field.y).toBeGreaterThanOrEqual(page.initialsBandRect.y);
        expect(field.y + field.height).toBeLessThanOrEqual(page.initialsBandRect.y + page.initialsBandRect.height);
        expect(page.textBlocks.some((text) => text.y < field.y + field.height && text.y + text.height > field.y)).toBe(
          false,
        );
      }
    }
  });

  it("aligns signature fields to model signature lines", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_749 },
    });
    const signatureFields = model.fields.filter((f) => f.type === "signature");
    expect(signatureFields.length).toBe(2);
    for (const field of signatureFields) {
      const page = model.pages.find((p) => p.pageIndex === field.page);
      const anchor = page?.signatureAnchorRects.find((a) => a.partyIndex === field.assignedPartyIndex);
      expect(anchor).toBeTruthy();
      const onUnderline = signatureFieldRectOnUnderlineAnchor(anchor!);
      expect(field.x).toBeCloseTo(onUnderline.x, 3);
      expect(field.y).toBeCloseTo(onUnderline.y, 3);
      expect(field.width).toBeCloseTo(onUnderline.width, 3);
    }
  });

  it("prepare source blocks PDF preview when canonical corpus is blocked", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(src).toContain('data-testid="vs01-canonical-model-render"');
    expect(src).toContain("setPdfUrl(null)");
    expect(src).toContain("return;");
    expect(src).toContain("renderCanonicalModel && signingPacketModel");
  });
});
