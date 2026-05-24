/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { updateLastKnownGoodAuthoritativeDraftRef } from "../components/agreements/guidedDealCompletion/guidedCompletionRenderAuthority";
import { resolvePremiumSignaturePreviewMode } from "../components/agreements/premiumAgreementDocumentHtml";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { buildVs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import { resolveVs01PreparePacketReadiness } from "./vs01PreparePacketReadiness";
import {
  canonicalPageTypographyPx,
  countCanonicalPageTextMetrics,
  signingPacketHasVisibleText,
} from "./vs01CanonicalPageRender";
import { Vs01CanonicalSigningPage } from "./Vs01CanonicalSigningPage";

const STARTER_748 = `${"Starter preview clause. ".repeat(38)}`.slice(0, 748);

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test64",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@example.test",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.test", signerName: "Joe Smith" }],
  });
}

function premiumCorpus(repeat = 90): string {
  return `${"Premium services clause with milestones, payment terms, and operational detail. ".repeat(repeat)}

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

describe("test64 canonical signing document text render", () => {
  it("renders visible DOM text nodes for canonical textBlocks", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_748 },
    });
    expect(model.allowed).toBe(true);
    const page = model.pages[0]!;
    const { container } = render(<Vs01CanonicalSigningPage page={page} pageWidthPx={612} />);
    const renderedTextNodeCount = container.querySelectorAll("[data-vs01-canonical-text]").length;
    const metrics = countCanonicalPageTextMetrics(page);
    expect(metrics.textBlockCount).toBeGreaterThan(0);
    expect(renderedTextNodeCount).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/Premium services clause/i);
    expect(container.querySelector('[data-vs01-canonical-layout-mode="flow"]')).toBeTruthy();
  });

  it("cannot be packetReady when textBlocks exist but renderedTextNodeCount is zero", () => {
    const readiness = resolveVs01PreparePacketReadiness({
      corpusGate: { allowed: true },
      placementCanFinish: true,
      initialsSummary: { complete: true, unsafeInitialsCount: 0, unsafeSignatureCount: 0 },
      canonicalTextRendered: false,
      canonicalSignatureLinesRendered: true,
      canonicalDomAligned: true,
    });
    expect(readiness.packetReady).toBe(false);
    expect(readiness.reason).toBe("canonical_page_text_not_rendered");
  });

  it("blocks blank canonical pages at model build time", () => {
    const blocked = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: STARTER_748,
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_748 },
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.pages).toHaveLength(0);
    const src = readFileSync(join(__dirname, "buildVs01SigningPacketModel.ts"), "utf8");
    expect(src).toContain("canonical_pages_blank");
  });

  it("renders witness block and signature underline anchors on witness page", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_748 },
    });
    const witnessPage = model.pages.find((p) =>
      p.textBlocks.some((b) => /\bIN WITNESS WHEREOF\b/i.test(b.text)),
    );
    expect(witnessPage).toBeTruthy();
    expect(witnessPage!.signatureAnchorRects.length).toBeGreaterThanOrEqual(2);
    const { container } = render(<Vs01CanonicalSigningPage page={witnessPage!} pageWidthPx={612} />);
    expect(container.textContent).toMatch(/IN WITNESS WHEREOF/i);
    expect(container.querySelectorAll(".vs01-canonical-signature-underline").length).toBeGreaterThanOrEqual(2);
  });

  it("uses readable px typography derived from page width", () => {
    const { fontSizePx, lineHeightPx } = canonicalPageTypographyPx(612);
    expect(fontSizePx).toBeGreaterThanOrEqual(10);
    expect(lineHeightPx).toBeGreaterThan(fontSizePx);
  });

  it("keeps initials band reserved and forbids decorative fallback for guided Pro", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_748 },
    });
    expect(signingPacketHasVisibleText(model.pages)).toBe(true);
    expect(resolvePremiumSignaturePreviewMode(model.corpus, 2).mode).not.toBe(
      "decorative_fallback_signature_card",
    );
    for (const page of model.pages) {
      const textBottom = Math.max(0, ...page.textBlocks.map((b) => b.y + b.height));
      expect(textBottom).toBeLessThanOrEqual(page.initialsBandRect.y + 0.001);
    }
  });

  it("rejects 748-char starter authoritative corpus and blocks prepare source", () => {
    const ref = { current: "" };
    expect(
      updateLastKnownGoodAuthoritativeDraftRef(ref, STARTER_748, "rendered_preview", {
        paidProFlow: true,
        freeBaselinePlain: STARTER_748,
        source: "rendered_preview",
      }),
    ).toBe(false);
    const blocked = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: STARTER_748,
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_748 },
    });
    expect(blocked.allowed).toBe(false);
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(src).toContain('data-testid="vs01-canonical-finalize-blocked"');
  });

  it("renders full text across all pages for valid guided Pro corpus", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: premiumCorpus(120),
      roles: roles(),
      corpusGateArgs: { freeBaselinePlain: STARTER_748 },
    });
    expect(model.pages.length).toBeGreaterThan(1);
    const totalChars = model.pages.reduce(
      (sum, p) => sum + p.textBlocks.reduce((lineSum, b) => lineSum + b.text.length, 0),
      0,
    );
    expect(totalChars).toBeGreaterThan(500);
    for (const page of model.pages) {
      if (page.textBlocks.length === 0) continue;
      const { container } = render(<Vs01CanonicalSigningPage page={page} pageWidthPx={520} />);
      expect(container.querySelectorAll("[data-vs01-canonical-text]").length).toBeGreaterThan(0);
    }
  });
});
