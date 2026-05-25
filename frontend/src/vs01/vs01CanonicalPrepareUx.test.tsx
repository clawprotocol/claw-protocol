/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { buildGuidedVs01SigningHandoff } from "../components/agreements/guidedDealCompletion/guidedVs01SigningHandoff";
import { resolveFinalVs01CorpusOrBlock } from "./vs01SigningCorpus";
import {
  buildVs01SigningPacketModel,
  maxFlowLinesPerSigningPacketPage,
  signatureFieldRectOnUnderlineAnchor,
  validateVs01SigningPacketGeometry,
} from "./buildVs01SigningPacketModel";
import { prepareGuidedSigningCorpusCleanup } from "../components/agreements/guidedDealCompletion/guidedFinalReviewToSigning";
import { resolveCanonicalFinalPartyManifest } from "../components/agreements/guidedDealCompletion/canonicalFinalPartyManifest";
import { resolveVs01PreparePacketReadiness } from "./vs01PreparePacketReadiness";
import { summarizeCanonicalSigningPacketInitials } from "./vs01SigningPacketInitials";
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

function rectsIntersect(
  a: Pick<ReturnType<typeof signatureFieldRectOnUnderlineAnchor>, "x" | "y" | "width" | "height">,
  b: Pick<ReturnType<typeof signatureFieldRectOnUnderlineAnchor>, "x" | "y" | "width" | "height">,
): boolean {
  const x = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return x > 0 && y > 0;
}

function aiAutomationFinalizedCorpus(): string {
  const manifest = resolveCanonicalFinalPartyManifest({
    partyCount: 2,
    partySignerNames: ["Anthem H Blanchard", ""],
    partySignerTitles: ["Manager", ""],
    recipient1Name: "Acme LLC",
    recipient2Name: "Joe Smith",
    recipient1Email: "anthem@example.test",
    recipient2Email: "joe@example.test",
    extraPartyReviewEmails: [],
    draftPartyNames: ["Acme LLC", "Joe Smith"],
    sendMode: "signature",
    recipientsDeferred: false,
  });
  const body = `
AI AUTOMATION SERVICES AGREEMENT

This Agreement covers AI automation strategy, implementation, prompt operations, dashboarding, and managed workflow support for the Client.

1. Purpose and Scope
Provider will design, configure, test, and support AI automation workflows for lead intake, reporting, and internal operations. ${"The parties will coordinate on approvals, implementation cadence, data handoffs, and commercially reasonable acceptance criteria. ".repeat(7)}

2. Fees and Payment
Client will pay the agreed monthly service fee and approved implementation fees. Invoices are due Net 30 from receipt.

3. Confidentiality
Each party will protect non-public business, technical, financial, and customer information using reasonable safeguards.

4. Ownership and Work Product
Client owns client data, brand assets, customer lists, ad accounts, and final client-specific deliverables after payment.

5. Support and Service Levels
Provider will provide commercially reasonable support, monitor automations during business hours, and respond to priority incidents.

6. Term and Termination
The initial term continues until terminated by either party with 30 days written notice.

7. Notices
Notices may be delivered electronically to the recipient emails listed for the parties.

9. Electronic Signatures
The parties may execute this Agreement electronically and in counterparts.

${"AI automation operating clause with workflow definitions, model review responsibilities, change control, incident response, and human approval safeguards. ".repeat(20)}
`.trim();
  return prepareGuidedSigningCorpusCleanup({ body, partyManifest: manifest }).body;
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

  it("places initials on each body page (not witness) for each signer", () => {
    const model = buildPremiumModel();
    const roleCount = roles().length;
    const witnessPage = model.pages.find((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    )!;
    for (const page of model.pages) {
      const initials = model.fields.filter((f) => f.type === "initials" && f.page === page.pageIndex);
      if (page.pageIndex === witnessPage.pageIndex) {
        expect(initials).toHaveLength(0);
        continue;
      }
      expect(initials).toHaveLength(roleCount);
      for (const field of initials) {
        expect(field.y + field.height).toBeLessThanOrEqual(1);
        expect(field.y).toBeGreaterThanOrEqual(page.initialsBandRect.y - 0.01);
      }
    }
  });

  it("aligns both signature fields to model underline anchors", () => {
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
      expect(field!.x).toBeCloseTo(onUnderline.x, 3);
      expect(field!.width).toBeCloseTo(onUnderline.width, 3);
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

  it("bridge prepare source uses canonical-only model geometry without DOM debug gates", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(src).toContain("[vs01-bridge-canonical-only]");
    expect(src).toContain("[vs01-packet-ready-reason]");
    const modelSrc = readFileSync(join(__dirname, "buildVs01SigningPacketModel.ts"), "utf8");
    expect(modelSrc).toContain("[vs01-canonical-pagination-page]");
    expect(src).toMatch(/effectivePageLayouts = agreementBridgePlacementCopy \? canonicalPageLayouts : pageLayouts/);
    expect(src).not.toMatch(/canonicalPageLayouts \?\? pageLayouts/);
    expect(src).toMatch(/packetReady[\s\S]{0,80}PREPARE_PACKET_BRIDGE_HEADLINE_READY/);
    expect(src).not.toContain("canonical_field_dom_pending");
    expect(src).not.toContain("canonical_field_dom_mismatch");
    expect(src).not.toContain("Initials band overlap");
    expect(src).not.toContain("Signature line alignment issue");
  });

  it("does not wait for DOM measurement before packetReady", () => {
    const ready = resolveVs01PreparePacketReadiness({
      corpusGate: { allowed: true },
      placementCanFinish: true,
      initialsSummary: { complete: true, unsafeInitialsCount: 0, unsafeSignatureCount: 0 },
      canonicalTextRendered: true,
      canonicalSignatureLinesRendered: true,
    });
    expect(ready.packetReady).toBe(true);
    expect(ready.reason).toBeNull();
  });

  it("canonical rendered pages use model-reserved initials band without DOM measurement", () => {
    const model = buildPremiumModel();
    const pagesWithText = model.pages.filter((page) => page.flowLines.some((line) => line.trim()));
    for (const page of pagesWithText) {
      const { container } = render(
        <div
          className="vs01-sign-page-surface vs01-sign-page-surface--canonical"
          style={{ width: 612, height: 792, position: "relative" }}
        >
          <Vs01CanonicalSigningPage page={page} pageWidthPx={612} />
        </div>,
      );
      expect(container.querySelectorAll("[data-vs01-canonical-text]").length).toBeGreaterThan(0);
      const textBottom = Math.max(0, ...page.textBlocks.map((b) => b.y + b.height));
      expect(textBottom).toBeLessThanOrEqual(page.initialsBandRect.y);
    }
  });

  it("keeps signature fields aligned to canonical model anchors", () => {
    const model = buildPremiumModel();
    const witnessPage = model.pages.find((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    )!;
    const signatureFields = model.fields.filter((f) => f.type === "signature");
    for (const field of signatureFields) {
      const anchor = witnessPage.signatureLineAnchors.find((a) => a.partyIndex === field.assignedPartyIndex)!;
      const onUnderline = signatureFieldRectOnUnderlineAnchor(anchor);
      expect(field.x).toBeCloseTo(onUnderline.x, 3);
      expect(field.y).toBeCloseTo(onUnderline.y, 3);
      expect(field.width).toBeCloseTo(onUnderline.width, 3);
    }
  });

  it("test68 renders finalized guided Pro handoff as ready canonical packet at narrow and desktop widths", async () => {
    const corpus = aiAutomationFinalizedCorpus();
    expect(corpus.length).toBeGreaterThan(4000);
    expect(corpus).not.toMatch(/^\s*4\.2\.?\s*$/m);
    expect(corpus).not.toMatch(/\*\*\s*\d+\./);
    const sectionNumbers = [...corpus.matchAll(/^\s*(\d+)\.\s+[A-Z]/gm)].map((m) => Number(m[1]));
    expect(sectionNumbers).toEqual(sectionNumbers.map((_, i) => i + 1));
    expect(sectionNumbers).toContain(8);

    const signerRoles = roles();
    const handoff = buildGuidedVs01SigningHandoff({
      corpusText: corpus,
      source: "finalized_signer_applied_guided_corpus",
      signerMetadata: null,
      recipientEmails: ["anthem@example.test", "joe@example.test"],
      signatureRebuilt: true,
    });
    const gate = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: corpus,
      guidedSigningHandoff: handoff,
      guidedPro: true,
      premiumComplete: true,
      signatureRebuilt: true,
      freeBaselinePlain: STARTER_749,
    });
    expect(gate.allowed).toBe(true);

    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: gate.corpus,
      roles: signerRoles,
      corpusGateArgs: {
        guidedSigningHandoff: handoff,
        freeBaselinePlain: STARTER_749,
        premiumComplete: true,
        signatureRebuilt: true,
      },
    });
    expect(model.allowed).toBe(true);
    expect(model.pages.length).toBeGreaterThanOrEqual(4);
    expect(model.diagnostics.textIntersectsInitialsBand).toBe(false);
    const witnessIdx =
      model.pages.find((p) => p.flowLines.some((l) => /\bIN WITNESS WHEREOF\b/i.test(l)))?.pageIndex ??
      model.pages.length - 1;
    const bodyPageCount = model.pages.filter((p) => p.pageIndex !== witnessIdx).length;
    expect(model.diagnostics.initialsFieldCount).toBe(bodyPageCount * signerRoles.length);

    const initialsSummary = summarizeCanonicalSigningPacketInitials({
      fields: model.fields,
      pageCount: model.pages.length,
      roleCount: signerRoles.length,
      pages: model.pages,
    });
    expect(initialsSummary.complete).toBe(true);
    const readinessFromModel = resolveVs01PreparePacketReadiness({
      corpusGate: gate,
      placementCanFinish: model.fields.filter((f) => f.type === "signature").length >= signerRoles.length,
      initialsSummary,
      canonicalTextRendered: true,
      canonicalSignatureLinesRendered: true,
    });
    expect(readinessFromModel.packetReady).toBe(true);
    expect(model.diagnostics.signatureFieldCount).toBe(signerRoles.length);

    const signatureFields = model.fields.filter((f) => f.type === "signature");
    for (const field of signatureFields) {
      const page = model.pages.find((p) => p.pageIndex === field.page)!;
      const anchor = page.signatureLineAnchors.find((a) => a.partyIndex === field.assignedPartyIndex)!;
      expect(anchor.lineText).toMatch(/^By:/);
      expect(rectsIntersect(field, signatureFieldRectOnUnderlineAnchor(anchor))).toBe(true);
    }

    const readiness = resolveVs01PreparePacketReadiness({
      corpusGate: gate,
      placementCanFinish: true,
      initialsSummary: { complete: true, unsafeInitialsCount: 0, unsafeSignatureCount: 0 },
      canonicalTextRendered: true,
      canonicalSignatureLinesRendered: true,
    });
    expect(readiness.packetReady).toBe(true);

    for (const width of [376, 612]) {
      const { container } = render(
        <div
          className="vs01-sign-page-surface vs01-sign-page-surface--canonical"
          style={{ width: 612, height: 792, position: "relative", maxWidth: "none", overflowX: "auto" }}
        >
          <Vs01CanonicalSigningPage page={model.pages[0]!} pageWidthPx={width} />
        </div>,
      );
      expect(container.querySelectorAll("[data-vs01-canonical-text]").length).toBeGreaterThan(0);
    }
  });
});
