import { describe, expect, it } from "vitest";
import { resolvePremiumSignaturePreviewMode } from "../components/agreements/premiumAgreementDocumentHtml";
import { updateLastKnownGoodAuthoritativeDraftRef } from "../components/agreements/guidedDealCompletion/guidedCompletionRenderAuthority";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  buildVs01SigningPacketModel,
  validateVs01SigningPacketGeometry,
  VS01_PACKET_INITIALS_BAND_PT,
} from "./buildVs01SigningPacketModel";
import { VS01_CORPUS_PREFERRED_MIN_LEN } from "./vs01SigningCorpus";

const SHORT_STARTER = `${"Starter/free rendered preview. ".repeat(34)}`.slice(0, 734);

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test61",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@example.test",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.test", signerName: "Joe Smith" }],
  });
}

function premiumCorpus(extra = 70): string {
  return `${"Dense premium body clause with detailed implementation responsibilities and milestones. ".repeat(extra)}

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

describe("VS01 canonical signing packet model (test61)", () => {
  it("blocks 734-char starter corpus before prepare render", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: SHORT_STARTER,
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: SHORT_STARTER },
    });
    expect(model.allowed).toBe(false);
    expect(model.pages).toHaveLength(0);
    expect(model.diagnostics.corpusGate.len).toBeLessThan(1500);
  });

  it("blocked corpus cannot render decorative fallback card", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: SHORT_STARTER,
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: SHORT_STARTER },
    });
    expect(model.allowed).toBe(false);
    expect(model.pages).toHaveLength(0);
    expect(model.fields).toHaveLength(0);
  });

  it("premium corpus later replaces starter corpus", () => {
    const ref = { current: SHORT_STARTER };
    const premium = premiumCorpus();
    expect(
      updateLastKnownGoodAuthoritativeDraftRef(ref, premium, "test61_premium_snapshot", {
        paidProFlow: true,
        freeBaselinePlain: SHORT_STARTER,
      }),
    ).toBe(true);
    expect(ref.current.length).toBeGreaterThan(VS01_CORPUS_PREFERRED_MIN_LEN);
  });

  it("reserves initials band on every page and paginates dense bottom text away from it", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(120),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: SHORT_STARTER },
    });
    expect(model.allowed).toBe(true);
    expect(model.pages.length).toBeGreaterThan(1);
    for (const page of model.pages) {
      expect(page.reservedInitialsBandRect.height).toBeCloseTo(VS01_PACKET_INITIALS_BAND_PT / 792, 3);
      const textBottom = Math.max(0, ...page.textBlocks.map((b) => b.y + b.height));
      expect(textBottom).toBeLessThanOrEqual(page.reservedInitialsBandRect.y);
    }
  });

  it("signature block anchors produce fields on By/Signature lines and no decorative fallback", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: SHORT_STARTER },
    });
    expect(model.allowed).toBe(true);
    expect(model.diagnostics.signatureAnchorCount).toBeGreaterThanOrEqual(2);
    expect(model.diagnostics.signatureFieldCount).toBe(2);
    expect(resolvePremiumSignaturePreviewMode(model.corpus, 2).mode).not.toBe(
      "decorative_fallback_signature_card",
    );
  });

  it("validation fails if a text block intersects initialsBandRect", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: SHORT_STARTER },
    });
    const page = model.pages[0]!;
    const errors = validateVs01SigningPacketGeometry({
      pages: [
        {
          ...page,
          textBlocks: [
            ...page.textBlocks,
            {
              x: page.reservedInitialsBandRect.x,
              y: page.reservedInitialsBandRect.y + 0.01,
              width: 0.3,
              height: 0.04,
              text: "bad bottom text",
              kind: "body",
            },
          ],
        },
      ],
      fields: model.fields,
      roleCount: roles().length,
    });
    expect(errors).toContain("text_intersects_initials_band");
  });
});
