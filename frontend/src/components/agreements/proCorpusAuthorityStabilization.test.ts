import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearFrozenCanonicalAgreementCorpus,
  readCanonicalAgreementCorpusForSurface,
} from "./canonicalAgreementSnapshot";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { pickPremiumPaidReadonlyPlainText } from "./premiumReadonlyRenderCorpus";
import { pickAuthoritativePlainForSendHandoff } from "./sendHandoffAuthoritativeCorpus";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";
import {
  enforceAuthoritativeProCorpusDisplay,
  logUserEditedAuthoritativeCorpus,
  PRO_CORPUS_AUTHORITY_DRIFT_MIN_RATIO,
} from "./proCorpusSourcePath";
import { MINIMAL_SERVICES_INTAKE } from "./paidProMinimalServicesAcceptance.test";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const structuredServices: ParsedDraftShape = {
  title: "Services Agreement",
  jurisdiction: "Texas",
  parties: [
    { name: "Red Mesa Logistics LLC", role: "Client" },
    { name: "Harbor Peak Automation LLC", role: "Provider" },
  ],
  purpose: "AI workflow setup.",
  payment_terms: "$5,000",
  duration: null,
  due_date: null,
  effective_date: null,
  payment: { amount: 5000, cadence: null, valid: true },
  agreement_family: "services_agreement",
};

const minimalServicesBody = [
  "# Services Agreement",
  "",
  'This Services Agreement is between **Red Mesa Logistics LLC** ("Client") and **Harbor Peak Automation LLC** ("Provider").',
  "",
  "## Scope",
  "Provider shall perform AI workflow setup and related professional services for Client.",
  "",
  "## Fees",
  "Client shall pay Provider **$5,000** as total consideration for the Services.",
  "",
  "## Governing Law",
  "This Agreement is governed by the laws of the **State of Texas**.",
  "",
  "## Execution",
  "The parties may execute this Agreement using **electronic signatures**.",
  "",
  "1. Confidentiality. Each party protects nonpublic information.",
  "2. Work Product. Client owns paid deliverables.",
  "3. Termination. Either party may terminate on notice.",
].join("\n");
import {
  buildPremiumAgreementReadonlyHtml,
  stripCorpusSignatureRegionForExternalSignerUi,
} from "./premiumAgreementDocumentHtml";

function padServerDraft(core: string, minLen = 10_000): string {
  const filler = " The parties agree to commercially reasonable implementation, support, and acceptance terms. ";
  let t = core;
  while (t.length < minLen) t += filler;
  return t;
}

const redMesaServerDraft = padServerDraft(minimalServicesBody);

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearFrozenCanonicalAgreementCorpus();
  vi.restoreAllMocks();
});

describe("pro corpus authority stabilization", () => {
  it("accepted server_full_draft cannot be replaced by shorter fallback in readonly pick", () => {
    const short = "z".repeat(900);
    establishPaidProSourceOfTruth({
      text: redMesaServerDraft,
      draft: structuredServices,
      intakeText: MINIMAL_SERVICES_INTAKE,
    });
    const out = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: short,
      premiumWinningBodyText: short,
      agreementDocumentText: short,
      draft: structuredServices,
      premiumCheckoutCompleted: true,
      intakeText: MINIMAL_SERVICES_INTAKE,
      paidAuthoritativeProBody: redMesaServerDraft,
      lastPremiumPipelineRenderSource: "server_full_draft",
      stickyAuthoritativePlainText: redMesaServerDraft,
    });
    expect(out.plainText.length).toBeGreaterThanOrEqual(
      Math.floor(redMesaServerDraft.length * PRO_CORPUS_AUTHORITY_DRIFT_MIN_RATIO),
    );
    expect(out.plainText).toContain("Red Mesa Logistics LLC");
    expect(out.plainText).toContain("Harbor Peak Automation LLC");
  });

  it("review, handoff, and signature prep hashes match authoritativeProCorpus", () => {
    const record = establishPaidProSourceOfTruth({
      text: redMesaServerDraft,
      draft: structuredServices,
      intakeText: MINIMAL_SERVICES_INTAKE,
    });
    const review = getPaidProDocumentForSurface("review");
    const handoff = pickAuthoritativePlainForSendHandoff(structuredServices);
    const signerSetup = getPaidProDocumentForSurface("signer_setup");
    expect(review?.hash).toBe(record.hash);
    expect(handoff?.text).toBe(record.text);
    expect(hashPaidProCorpus(handoff?.text ?? "")).toBe(record.hash);
    expect(signerSetup?.hash).toBe(record.hash);
  });

  it("fails loudly in test when display corpus is under 90% of authoritative without user edit", () => {
    const authoritative = redMesaServerDraft;
    expect(() =>
      enforceAuthoritativeProCorpusDisplay({
        authoritativeText: authoritative,
        displayText: authoritative.slice(0, Math.floor(authoritative.length * 0.5)),
        source: "live_generated_preview",
        surface: "pro_review_display",
      }),
    ).toThrow(/\[pro-corpus-authority-drift\]/);
  });

  it("logs user-edited-authoritative-corpus when user edit changes hash", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const authoritative = redMesaServerDraft;
    const edited = `${authoritative}\n\n7. Additional user clause.`;
    enforceAuthoritativeProCorpusDisplay({
      authoritativeText: authoritative,
      displayText: edited,
      source: "user_edit",
      surface: "pro_review_display",
      userEdited: true,
    });
    logUserEditedAuthoritativeCorpus({
      oldHash: hashPaidProCorpus(authoritative),
      newHash: hashPaidProCorpus(edited),
    });
    expect(spy).toHaveBeenCalledWith(
      "[user-edited-authoritative-corpus]",
      expect.objectContaining({ oldHash: expect.any(String), newHash: expect.any(String) }),
    );
    spy.mockRestore();
  });

  it("suppresses embedded signature block in Pro review HTML", () => {
    const body = [
      redMesaServerDraft,
      "",
      "IN WITNESS WHEREOF, the parties execute.",
      "By: ____________________",
    ].join("\n");
    establishPaidProSourceOfTruth({ text: body, draft: structuredServices, intakeText: MINIMAL_SERVICES_INTAKE });
    const display = getPaidProDocumentForSurface("display")?.text ?? "";
    const stripped = stripCorpusSignatureRegionForExternalSignerUi(display);
    expect(stripped).not.toMatch(/IN WITNESS WHEREOF/i);
    const html = buildPremiumAgreementReadonlyHtml(body, {
      signatureSectionMode: "collaboration",
      partyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      suppressCorpusEmbeddedSignatureForDisplay: true,
    });
    expect(html).not.toMatch(/IN WITNESS WHEREOF/i);
    expect(html).not.toContain("claw-premium-signature-section");
  });

  it("preserves full legal names across review, signer setup, and VS01", () => {
    establishPaidProSourceOfTruth({
      text: redMesaServerDraft.replace(/Harbor Peak Automation LLC/g, "Harbor Peak"),
      draft: structuredServices,
      intakeText: MINIMAL_SERVICES_INTAKE,
    });
    const review = getPaidProDocumentForSurface("review")?.text ?? "";
    const signer = getPaidProDocumentForSurface("signer_setup")?.text ?? "";
    const vs01 = resolveFinalVs01CorpusOrBlock({ draft: structuredServices as never, guidedPro: true }).corpus;
    for (const text of [review, signer, vs01]) {
      expect(text).toContain("Red Mesa Logistics LLC");
      expect(text).toContain("Harbor Peak Automation LLC");
      expect(text).not.toMatch(/\bbetween Red Mesa and Harbor Peak\b/i);
    }
    const frozen = readCanonicalAgreementCorpusForSurface("review", { required: true });
    expect(frozen?.signerManifest[0]?.name).toBe("Red Mesa Logistics LLC");
    expect(frozen?.signerManifest[1]?.name).toBe("Harbor Peak Automation LLC");
  });

  it("hides stale Add signers footer CTA when delivery track chooser is active", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const chrome = readFileSync(join(__dirname, "paidProForcedFirstReviewChrome.tsx"), "utf8");
    expect(intake).toContain("pro_delivery_track_chooser_active");
    expect(intake).toContain("proDeliveryTrackChooserActive");
    expect(chrome).toContain('data-testid="paid-pro-delivery-track-chooser"');
    const ctaIdx = intake.indexOf("proDeliveryTrackChooserActive");
    expect(ctaIdx).toBeGreaterThan(0);
  });

  it("golden Red Mesa path displays professional body without cosmetic-only patch", () => {
    const record = establishPaidProSourceOfTruth({
      text: redMesaServerDraft,
      draft: structuredServices,
      intakeText: MINIMAL_SERVICES_INTAKE,
    });
    const display = getPaidProDocumentForSurface("display")?.text ?? "";
    expect(display.length).toBeGreaterThanOrEqual(Math.floor(record.text.length * 0.9));
    expect(display).toContain("$5,000");
    expect(display.toLowerCase()).toMatch(/texas|laws of texas/i);
    expect(display.toLowerCase()).toMatch(/electronic signatures/i);
    expect(display.toLowerCase()).toMatch(/workflow|automation|ai/i);
    expect(display).not.toMatch(/principal place of business|_{3,}/i);
  });
});
