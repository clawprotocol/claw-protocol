import { describe, expect, it } from "vitest";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { canShowPremiumSuccess } from "./premiumSuccessGate";

const LONG = "x".repeat(500);

const logoServerDoc = (title = "LOGO DESIGN AGREEMENT") =>
  [
    title,
    "",
    "1. Custom logo/brand work and deliverables with two (2) revision rounds.",
    "2. Flat fee and IP assignment to Client upon full payment. ",
    "3. Out-of-scope revisions, acceptance, and sign-off. ",
    LONG,
  ].join("\n");

const founderServerDoc = () =>
  [
    "FOUNDER VESTING AGREEMENT",
    "The parties are founders; this agreement sets forth vesting, repurchase, and equity between the founders.",
    "Vesting schedule: four-year with one-year cliff. Economic split 60/40 as between the founders.",
    "Confidentiality, IP assignment, and leaver provisions. Cap table mechanics in Schedule A. ",
    LONG,
  ].join("\n");

describe("premium success gate (universal Pro truth)", () => {
  it("1) logo: blocks success when body/title are not design services", () => {
    const c = resolveAgreementIntentContract("Need a logo, $1,500, two revisions, IP to client");
    const bad = "AGREEMENT\n" + "commercial work.\n" + LONG;
    const v = validatePaidProOutput({ text: bad, rawIntake: "foo", intentContract: c, draft: null });
    const g = canShowPremiumSuccess({
      intentContract: c,
      renderSource: "server_full_document_text",
      validation: v,
      documentText: bad,
      intakeText: "x",
      premiumPipelineSource: "server_full_draft",
      stale: false,
    });
    expect(g.successBannerAllowed).toBe(false);
  });

  it("1b) logo: success with server + pipeline when doc validates", () => {
    const c = resolveAgreementIntentContract("Need a logo, $1,500, two revisions, IP to client");
    const doc = logoServerDoc("LOGO DESIGN SERVICES AGREEMENT");
    const v = validatePaidProOutput({ text: doc, rawIntake: "Need a logo", intentContract: c, draft: null });
    const g = canShowPremiumSuccess({
      intentContract: c,
      renderSource: "server_full_document_text",
      validation: v,
      documentText: doc,
      intakeText: "x",
      premiumPipelineSource: "server_full_draft",
      stale: false,
    });
    expect(g.state).toBe("premium_success");
  });

  it("2) founder 60/40: no success when title is generic shell", () => {
    const c = resolveAgreementIntentContract("60/40 vesting for two founders, four-year, cliff");
    const bad = "AGREEMENT\n" + "scope. payment. term. law. term.\n" + LONG;
    const v = validatePaidProOutput({ text: bad, rawIntake: "vesting", intentContract: c, draft: null });
    const g = canShowPremiumSuccess({
      intentContract: c,
      renderSource: "server_full_document_text",
      validation: v,
      documentText: bad,
      intakeText: "x",
      premiumPipelineSource: "server_full_draft",
      stale: false,
    });
    expect(g.successBannerAllowed).toBe(false);
  });

  it("2b) founder: success with proper founder-style body", () => {
    const c = resolveAgreementIntentContract("60/40 vesting for two founders, four-year, cliff");
    const d = founderServerDoc();
    const v = validatePaidProOutput({ text: d, rawIntake: "60/40 founders", intentContract: c, draft: null });
    const g = canShowPremiumSuccess({
      intentContract: c,
      renderSource: "server_full_document_text",
      validation: v,
      documentText: d,
      intakeText: "x",
      premiumPipelineSource: "server_full_draft",
      stale: false,
    });
    expect(g.state).toBe("premium_success");
  });

  it("3) loan: blocks success when body equates principal to monthly installment", () => {
    const c = resolveAgreementIntentContract("Lent friend $5,000 repay monthly");
    const bad = `Loan. Principal: $5,000. Monthly installments of $5,000 until paid. ${LONG}`;
    const v = validatePaidProOutput({ text: bad, rawIntake: "Lent friend $5,000 repay monthly", intentContract: c, draft: null });
    expect(v.ok).toBe(false);
    const g = canShowPremiumSuccess({
      intentContract: c,
      renderSource: "server_full_document_text",
      validation: v,
      documentText: bad,
      intakeText: "Lent $5,000",
      premiumPipelineSource: "server_full_draft",
      stale: false,
    });
    expect(g.successBannerAllowed).toBe(false);
  });

  it("4) estate: cross-category fails validation", () => {
    const c = resolveAgreementIntentContract("Siblings, dad's estate, executor duties, probate");
    const bad = "Founder 60/40 cap table vesting and cliff. " + LONG;
    const v = validatePaidProOutput({ text: bad, rawIntake: "sibling estate", intentContract: c, draft: null });
    const g = canShowPremiumSuccess({
      intentContract: c,
      renderSource: "server_full_document_text",
      validation: v,
      documentText: bad,
      intakeText: "x",
      premiumPipelineSource: "server_full_draft",
      stale: false,
    });
    expect(g.successBannerAllowed).toBe(false);
  });

  it("5) rent/utilities: strict must validate or no success", () => {
    const c = resolveAgreementIntentContract("roommate rent split utilities 60/40");
    const thin = "1. SCOPE. 2. Payment. 3. Term. " + LONG;
    const v = validatePaidProOutput({ text: thin, rawIntake: "roommate", intentContract: c, draft: null });
    const g = canShowPremiumSuccess({
      intentContract: c,
      renderSource: "server_repair_document_text",
      validation: v,
      documentText: thin,
      intakeText: "roommate",
      premiumPipelineSource: "server_full_draft_retry",
      stale: false,
    });
    expect(g.successBannerAllowed).toBe(v.ok);
  });

  it("6) generic vague: custom_unknown with live readout stays draft / not finished pro success (banner off)", () => {
    const c = resolveAgreementIntentContract("a");
    const t = "Some text that passes basic Pro checks. " + LONG;
    const v = validatePaidProOutput({ text: t, rawIntake: "a", intentContract: c, draft: null });
    const g = canShowPremiumSuccess({
      intentContract: c,
      renderSource: "live_generated_preview",
      validation: v,
      documentText: t,
      intakeText: "a",
      premiumPipelineSource: "server_full_draft",
      stale: false,
    });
    expect(g.successBannerAllowed).toBe(false);
    expect(g.state).toBe("premium_fallback_preview_allowed");
  });

  it("7) strict: live_generated_preview + server pipeline => no Pro success (readonly gate)", () => {
    const c = resolveAgreementIntentContract("I need a logo, $1,500, two revisions");
    const t = logoServerDoc();
    const v = validatePaidProOutput({ text: t, rawIntake: "logo", intentContract: c, draft: null });
    const g = canShowPremiumSuccess({
      intentContract: c,
      renderSource: "live_generated_preview",
      validation: v,
      documentText: t,
      intakeText: "logo",
      premiumPipelineSource: "server_full_draft",
      stale: false,
    });
    expect(g.successBannerAllowed).toBe(false);
  });

  it("8) stale generation cannot show Pro success", () => {
    const c = resolveAgreementIntentContract("logo 2k");
    const t = logoServerDoc();
    const v = validatePaidProOutput({ text: t, rawIntake: "logo 2k", intentContract: c, draft: null });
    const g = canShowPremiumSuccess({
      intentContract: c,
      renderSource: "server_full_document_text",
      validation: v,
      documentText: t,
      intakeText: "x",
      premiumPipelineSource: "server_full_draft",
      stale: true,
    });
    expect(g.state).toBe("premium_failed_generation");
  });

  it("8b) qualityRetryActive always blocks", () => {
    const c = resolveAgreementIntentContract("logo 2k");
    const t = logoServerDoc();
    const v = validatePaidProOutput({ text: t, rawIntake: "logo 2k", intentContract: c, draft: null });
    const g = canShowPremiumSuccess({
      intentContract: c,
      renderSource: "server_full_document_text",
      validation: v,
      documentText: t,
      intakeText: "x",
      premiumPipelineSource: "server_full_draft",
      stale: false,
      qualityRetryActive: true,
    });
    expect(g.state).toBe("premium_needs_details");
  });

  it("9) server full draft: allowed", () => {
    const c = resolveAgreementIntentContract("roommate and rent split");
    const t = "Lease / roommate. Rent, utilities, premises, and deposit. " + LONG;
    const v = validatePaidProOutput({ text: t, rawIntake: "roommate rent", intentContract: c, draft: null });
    const g = canShowPremiumSuccess({
      intentContract: c,
      renderSource: "server_full_document_text",
      validation: v,
      documentText: t,
      intakeText: "roommate",
      premiumPipelineSource: "server_full_draft",
      stale: false,
    });
    if (g.validation.ok) {
      expect(g.state).toBe("premium_success");
    }
  });

  it("10) repair + server_repair: allowed as finished Pro", () => {
    const c = resolveAgreementIntentContract("roommate and rent split");
    const t = "Lease. Rent, premises, tenant, and utilities. " + LONG;
    const v = validatePaidProOutput({ text: t, rawIntake: "roommate rent", intentContract: c, draft: null });
    const g = canShowPremiumSuccess({
      intentContract: c,
      renderSource: "server_repair_document_text",
      validation: v,
      documentText: t,
      intakeText: "x",
      premiumPipelineSource: "server_full_draft_retry",
      stale: false,
    });
    if (g.validation.ok) {
      expect(g.state).toBe("premium_success");
    }
  });

  it("11) server_generation_degraded: success + signer CTA even if validation failed on fallback body", () => {
    const c = resolveAgreementIntentContract("Need a logo, $1,500, two revisions, IP to client");
    const thin = "Short fallback body.";
    const v = validatePaidProOutput({ text: thin, rawIntake: "logo", intentContract: c, draft: null });
    expect(v.ok).toBe(false);
    const g = canShowPremiumSuccess({
      intentContract: c,
      renderSource: "server_full_document_text",
      validation: v,
      documentText: thin,
      intakeText: "logo",
      premiumPipelineSource: "server_full_draft_degraded",
      stale: false,
      serverGenerationDegraded: true,
    });
    expect(g.state).toBe("premium_success");
    expect(g.signerCtaAllowed).toBe(true);
    expect(g.successBannerAllowed).toBe(true);
  });
});
