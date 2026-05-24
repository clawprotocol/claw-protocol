/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { buildVs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { Vs01CanonicalSigningPage } from "./Vs01CanonicalSigningPage";
import { buildFlowLineDescriptors } from "./vs01CanonicalTextLayout";
import { updateLastKnownGoodAuthoritativeDraftRef } from "../components/agreements/guidedDealCompletion/guidedCompletionRenderAuthority";
import { resolvePremiumSignaturePreviewMode } from "../components/agreements/premiumAgreementDocumentHtml";

const STARTER_735 = `${"Starter preview. ".repeat(40)}`.slice(0, 735);

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_layout",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@example.test",
    ownerSignerName: "Anthem H Blanchard",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.test", signerName: "Joe Smith" }],
  });
}

function premiumCorpus(repeat = 100): string {
  return `${"Professional services agreement clause with operational detail and payment milestones. ".repeat(repeat)}

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

describe("VS01 canonical text flow layout", () => {
  it("renders readable deterministic flow lines on dense corpus", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_735 },
    });
    expect(model.allowed).toBe(true);
    expect(model.pages[0]!.flowLines.length).toBeGreaterThan(5);
    const { container } = render(<Vs01CanonicalSigningPage page={model.pages[0]!} pageWidthPx={612} />);
    const textEls = [...container.querySelectorAll<HTMLElement>("[data-vs01-canonical-text]")];
    expect(textEls.length).toBeGreaterThan(3);
    expect(container.querySelector("[data-vs01-canonical-layout-mode='flow']")).toBeTruthy();
    expect(container.textContent).toMatch(/Professional services agreement/i);
  });

  it("classifies canonical flow descriptors without a fallback layout mode", () => {
    const descriptors = buildFlowLineDescriptors(["Line one", "Line two", "By: ______"]);
    expect(descriptors).toHaveLength(3);
    expect(descriptors[2]?.isSignatureExecutionLine).toBe(true);
  });

  it("paginates dense text across pages without sharing flow lines", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(160),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_735 },
    });
    expect(model.pages.length).toBeGreaterThan(1);
    const allLines = model.pages.flatMap((p) => p.flowLines).join("\n");
    expect(allLines).toMatch(/IN WITNESS WHEREOF/i);
    for (const page of model.pages) {
      const textBottom = Math.max(0, ...page.textBlocks.map((b) => b.y + b.height));
      expect(textBottom).toBeLessThanOrEqual(page.initialsBandRect.y + 0.002);
    }
  });

  it("renders witness block signature underlines on witness page", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_735 },
    });
    const witnessPage = model.pages.find((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    )!;
    const { container } = render(<Vs01CanonicalSigningPage page={witnessPage} pageWidthPx={612} />);
    expect(container.textContent).toMatch(/IN WITNESS WHEREOF/i);
    expect(container.querySelectorAll("[data-vs01-signature-execution-line]").length).toBeGreaterThanOrEqual(2);
  });

  it("rejects 735-char starter for guided Pro prepare", () => {
    const ref = { current: "" };
    expect(
      updateLastKnownGoodAuthoritativeDraftRef(ref, STARTER_735, "rendered_preview", {
        paidProFlow: true,
        freeBaselinePlain: STARTER_735,
        source: "rendered_preview",
      }),
    ).toBe(false);
    const blocked = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: STARTER_735,
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_735 },
    });
    expect(blocked.allowed).toBe(false);
  });

  it("forbids decorative fallback for guided Pro", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_735 },
    });
    expect(resolvePremiumSignaturePreviewMode(model.corpus, 2).mode).not.toBe(
      "decorative_fallback_signature_card",
    );
  });
});
