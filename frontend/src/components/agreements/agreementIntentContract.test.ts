import { SHARED_ACCEPTED_PAID_BODY } from "./paidProSharedFixtureSystem";
import { describe, expect, it } from "vitest";
import {
  type AgreementIntentContract,
  proIntentMessageWhenServerFullDraftFailed,
  proIntentPlainEnglishForGate,
  resolveAgreementIntentContract,
  validateIntentContractForPaidProOutput,
} from "./agreementIntentContract";

const LONG = SHARED_ACCEPTED_PAID_BODY;

function docDesignGood(): string {
  return [
    "# Logo Design Services Agreement",
    "",
    "1. Parties. Client and Designer agree on the project described on intake.",
    "2. IP. Upon full payment, copyright in the final **logo** and deliverable creative work is assigned to Client, except for Designer’s pre-existing tools and stock licensed to the project.",
    "3. Revisions. Two (2) revision rounds, then time-and-materials change order.",
    "4. Payment. The fee, invoicing, and **deliverable** sign-off are as stated in a schedule.",
    "5. Confidentiality. The parties will protect non-public information.",
    "6. Term. Until completion and acceptance, then a short post-launch handoff window.",
  ].join("\n");
}

describe("agreementIntentContract (LawDog Pro universal)", () => {
  it("resolves logo / design to design_creative with pro_strict", () => {
    const c = resolveAgreementIntentContract("I need a logo and brand mark, $2k, two revisions, IP to client.");
    expect(c.intent_id).toBe("design_creative");
    expect(c.pro_strict).toBe(true);
    expect(c.expected_title_terms[0].toLowerCase()).toMatch(/logo|design/);
  });

  it("routes quad-party brand licensing stack to consulting_services — not design_creative", () => {
    const intake =
      "Outdoor products brand. Evergreen Outdoor Brands LLC manufactures distributes and sells with Atlas Consumer Products Inc. " +
      "Horizon Wholesale Group LLC wholesale distributor North America. BrightPeak Retail Solutions LLC Amazon Shopify ecommerce. " +
      "8% royalty gross product sales. 14% wholesale distribution margin. trademark usage. Oklahoma governing law.";
    const c = resolveAgreementIntentContract(intake);
    expect(c.intent_id).not.toBe("design_creative");
    expect(c.intent_id).toBe("consulting_services");
  });

  it("rejects misclassified commercial boilerplate in body for a design prompt", () => {
    const c = resolveAgreementIntentContract("logo design 2k revisions");
    const bad = [
      "AGREEMENT",
      "This LawDog Pro preview groups related commercial topics in commercial workstreams below for serious review",
      "1. Scope 2. Payment 3. Term 4. Law 5. Term",
      LONG,
    ].join("\n");
    const v = validateIntentContractForPaidProOutput({
      contract: c,
      text: bad,
      rawIntake: "logo design 2k revisions",
      draftTitle: "AGREEMENT",
    });
    expect(v.ok).toBe(false);
  });

  it("passes a substantive design / IP document for a logo prompt", () => {
    const c = resolveAgreementIntentContract("Logo design, IP to client, deliverables, revisions as stated");
    const v = validateIntentContractForPaidProOutput({ contract: c, text: docDesignGood(), rawIntake: "foo", draftTitle: "" });
    expect(v.ok).toBe(true);
  });

  it("founder vesting requires professional title, rejects generic AGRR shell", () => {
    const c = resolveAgreementIntentContract("60/40 vesting between two founders, four-year, equity split");
    expect(c.intent_id).toBe("founder_equity_vesting");
    const v = validateIntentContractForPaidProOutput({
      contract: c,
      text: "AGREEMENT\n\n" + "scope payment term law term\n".repeat(20),
      rawIntake: "vesting and founders 60-40",
      draftTitle: "AGREEMENT",
    });
    expect(v.ok).toBe(false);
  });

  it("loan monthly repayment: preserves principal + installment (not conflated)", () => {
    const c = resolveAgreementIntentContract("I lent a friend $5,000 repay monthly.");
    expect(c.intent_id).toBe("loan_repayment");
    const noSch = [
      "Loan",
      "Principal: $5,000.",
      "Borrower will pay the entire principal in one month.",
      "There is a lender and a borrower. ",
      LONG,
    ].join("\n");
    const v0 = validateIntentContractForPaidProOutput({
      contract: c,
      text: noSch,
      rawIntake: "I lent a friend $5,000 repay monthly",
      draftTitle: "Loan Agreement",
    });
    /* May fail for missing installment distinction — policy requires operative anchors */
    expect(v0.ok).toBe(false);
    const withInstall = [
      "Promissory-style arrangement between parties. Principal: $5,000.",
      "Borrower shall repay principal in **monthly installments** in amounts agreed or on Schedule A.",
      "Lender and Borrower. Interest TBD. Default and notices follow commercial norms.",
      LONG,
    ].join("\n");
    const v1 = validateIntentContractForPaidProOutput({
      contract: c,
      text: withInstall,
      rawIntake: "I lent a friend $5,000 repay monthly",
      draftTitle: "Loan Agreement",
    });
    expect(v1.ok).toBe(true);
  });

  it("does not classify modal will pay as estate (minimal services prompt)", () => {
    const intake =
      "Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC. Red Mesa will pay Harbor Peak $5,000. Texas law.";
    const c = resolveAgreementIntentContract(intake);
    expect(c.intent_id).not.toBe("estate_family_admin");
    expect(c.intent_id).toBe("consulting_services");
  });

  it("estate / family: reject founder vesting bleed", () => {
    const c = resolveAgreementIntentContract("My siblings and I need rules for dad’s estate and executor duties tonight.");
    expect(c.intent_id).toBe("estate_family_admin");
    const bad = [
      "# Vesting of Founder Equity 60/40 for Four Years",
      "1. The parties adopt a cap table and cliff. ",
      LONG,
    ].join("\n");
    const v = validateIntentContractForPaidProOutput({ contract: c, text: bad, rawIntake: "sibling estate", draftTitle: "" });
    expect(v.ok).toBe(false);
  });

  it("rent + utilities: property / roommate allocation", () => {
    const c = resolveAgreementIntentContract("roommate rent split utilities 60/40 on electric");
    expect(c.intent_id).toBe("rent_roommate_property");
  });

  it("unknown / vague: not pro_strict", () => {
    const c = resolveAgreementIntentContract("k");
    expect(c.intent_id).toBe("custom_unknown");
    expect(c.pro_strict).toBe(false);
  });

  it("proIntentMessageWhenServerFullDraftFailed is set only when strict", () => {
    const strict: AgreementIntentContract = { ...resolveAgreementIntentContract("logo for cafe"), pro_strict: true };
    const loose: AgreementIntentContract = { ...resolveAgreementIntentContract("logo for cafe"), pro_strict: false };
    expect(proIntentMessageWhenServerFullDraftFailed(strict).length).toBeGreaterThan(20);
    expect(proIntentMessageWhenServerFullDraftFailed(loose)).toBe("");
  });

  it("proIntentPlainEnglishForGate explains missing pieces", () => {
    const c = resolveAgreementIntentContract("logo for cafe");
    const msg = proIntentPlainEnglishForGate(c, ["intent:title_mismatch_category:design_creative"]);
    expect(msg.toLowerCase()).toMatch(/generic|agreement|retry|pro/i);
  });

  it("logo $1,500 + revisions: rejects commercial review / wrong-category title and review-services framing", () => {
    const c = resolveAgreementIntentContract("Need a logo contract for $1,500 with 2 revisions");
    expect(c.intent_id).toBe("design_creative");
    const bad = [
      "COMMERCIAL ARRANGEMENT",
      "",
      "1. Review Services. Vendor will perform a commercial review cycle including two revisions of documentation.",
      "2. The parties structure deliverables for serious review, not a starter template.",
      LONG,
    ].join("\n");
    const v = validateIntentContractForPaidProOutput({
      contract: c,
      text: bad,
      rawIntake: "Need a logo contract for $1,500 with 2 revisions",
      draftTitle: "",
    });
    expect(v.ok).toBe(false);
    expect(v.reasons.join(",")).toMatch(/design_|review_services|commercial/);
  });

  it("logo $1,500: accepts Logo Design / Design Services head + creative substance", () => {
    const c = resolveAgreementIntentContract("Need a logo contract for $1,500 with 2 revisions");
    const body = [
      "LOGO DESIGN AGREEMENT",
      "",
      "1. Designer will deliver custom logo/brand mark concepts and stated file formats; two (2) included revision rounds then additional work at a change rate.",
      "2. Fee. Flat $1,500. ",
      "3. IP. Upon full payment, Client owns final deliverables; Designer retains pre-existing rights.",
      "4. Out-of-scope revisions, acceptance, and portfolio use are as stated in Schedule A. ",
      LONG,
    ].join("\n");
    const v = validateIntentContractForPaidProOutput({
      contract: c,
      text: body,
      rawIntake: "Need a logo contract for $1,500 with 2 revisions",
      draftTitle: "Logo Design Agreement",
    });
    expect(v.ok).toBe(true);
  });

  it("loan: rejects monthly installments of $5,000 when intake only states principal + repay monthly", () => {
    const c = resolveAgreementIntentContract("Lent friend $5,000 repay monthly");
    const bad = [
      "PROMISSORY NOTE STYLE",
      "Principal: $5,000.",
      "Borrower will make monthly installments of $5,000 until paid in full.",
      "Lender and Borrower agree. ",
      LONG,
    ].join("\n");
    const v = validateIntentContractForPaidProOutput({
      contract: c,
      text: bad,
      rawIntake: "Lent friend $5,000 repay monthly",
      draftTitle: "Loan Agreement",
    });
    expect(v.ok).toBe(false);
    expect(v.reasons.some((r) => r.includes("equated") || r.includes("installment"))).toBe(true);
  });

  it("loan: accepts principal $5,000 with installment amount TBD / Schedule A wording", () => {
    const c = resolveAgreementIntentContract("Lent friend $5,000 repay monthly");
    const ok = [
      "LOAN / REPAYMENT",
      "Principal: $5,000.",
      "Borrower shall repay principal in monthly installments in amounts agreed by the parties in Schedule A (installment amount not yet fixed).",
      "Lender and Borrower. Default, notices, and law as customary.",
      LONG,
    ].join("\n");
    const v = validateIntentContractForPaidProOutput({
      contract: c,
      text: ok,
      rawIntake: "Lent friend $5,000 repay monthly",
      draftTitle: "Loan Agreement",
    });
    expect(v.ok).toBe(true);
  });

  it("loan: explicit $200 per month still allows per-installment amount in the body", () => {
    const c = resolveAgreementIntentContract("Lent friend $5,000, pay $200 per month");
    const body = [
      "LOAN",
      "Principal: $5,000.",
      "The monthly installment shall be $200, first payment 30 days after signing.",
      "Lender, Borrower, and customary remedies.",
      LONG,
    ].join("\n");
    const v = validateIntentContractForPaidProOutput({
      contract: c,
      text: body,
      rawIntake: "Lent friend $5,000, pay $200 per month",
      draftTitle: "Loan Agreement",
    });
    expect(v.ok).toBe(true);
  });
});
