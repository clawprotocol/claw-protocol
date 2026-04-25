import { describe, expect, it, vi } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { FULL_DRAFT_EXPANSION_MARKER } from "./fullDraftUpgradeEnrich";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { evaluateUniversalPremiumMateriality } from "./premiumIntakeAskCoverage";
import { PREMIUM_JURISDICTION_PLACEHOLDER } from "./premiumDraftTransform";
import {
  buildPremiumMergedIntakeWithUserNotes,
  extractCleanPremiumParties,
  extractPremiumUserUpgradeNotes,
  runPremiumCompletion,
  stripPremiumInternalArtifacts,
  stripPremiumUserNotesFromMergedIntake,
} from "./premiumCompletionPipeline";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

describe("extractCleanPremiumParties", () => {
  it("pulls LLC names out of a prompt-like party cell", () => {
    const draft: ParsedDraftShape = {
      title: "Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "Create a contracting agreement between ABC LLC and Voyage LLC for marketing", role: "party" },
        { name: "Party B", role: "party" },
      ],
      purpose: "Services.",
      payment_terms: "Monthly.",
      duration: "12 months",
      due_date: null,
      effective_date: "January 1, 2026",
      payment: emptyPayment,
    };
    const intake = "Create a contracting agreement between ABC LLC and Voyage LLC";
    const out = extractCleanPremiumParties(intake, draft);
    expect(out[0].name).toContain("ABC");
    expect(out[1].name).toContain("Voyage");
  });

  it("falls back to Party A / Party B when nothing is recoverable", () => {
    const draft: ParsedDraftShape = {
      title: "Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "", role: "party" },
        { name: "", role: "party" },
      ],
      purpose: "Services.",
      payment_terms: "Monthly.",
      duration: "12 months",
      due_date: null,
      effective_date: "January 1, 2026",
      payment: emptyPayment,
    };
    const out = extractCleanPremiumParties("short", draft);
    expect(out[0].name).toBe("Party A");
    expect(out[1].name).toBe("Party B");
  });

  it("never surfaces intake prose as party names when the draft cells are polluted", () => {
    const draft: ParsedDraftShape = {
      title: "Agreement",
      jurisdiction: "Delaware",
      agreement_family: "independent_contractor_agreement",
      parties: [
        {
          name: "I'm a freelance designer and I need an agreement with a client for a small website build",
          role: "party",
        },
        { name: "two parties need something in writing before we start", role: "party" },
      ],
      purpose: "Services.",
      payment_terms: "Monthly.",
      duration: "12 months",
      due_date: null,
      effective_date: "January 1, 2026",
      payment: emptyPayment,
    };
    const out = extractCleanPremiumParties("I need help drafting a contractor agreement ASAP.", draft);
    expect(out[0].name).toBe("Service Provider");
    expect(out[1].name).toBe("Client");
  });

  it("trusts structured draft parties when they are already non-placeholder", () => {
    const draft: ParsedDraftShape = {
      title: "Services Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "Mike Green", role: "party" },
        { name: "Sarah Homeowner", role: "party" },
      ],
      purpose: "Landscaping services.",
      payment_terms: "Net 30",
      duration: "12 months",
      due_date: null,
      effective_date: "Upon signing",
      payment: emptyPayment,
    };
    const longIntake =
      "I run a small landscaping company and need something in writing with a homeowner because this project keeps changing.";
    const out = extractCleanPremiumParties(longIntake, draft);
    expect(out[0].name).toBe("Mike Green");
    expect(out[1].name).toBe("Sarah Homeowner");
  });
});

describe("stripPremiumInternalArtifacts", () => {
  it("removes expansion marker and claw bracket tags", () => {
    const raw = `Hello\n${FULL_DRAFT_EXPANSION_MARKER}\n[claw_test_tag_v9]\nMore`;
    const cleaned = stripPremiumInternalArtifacts(raw);
    expect(cleaned).not.toContain(FULL_DRAFT_EXPANSION_MARKER);
    expect(cleaned).not.toMatch(/\[claw/i);
  });
});

describe("premium pay-path wording helpers", () => {
  it("extracts user notes after the exact wording marker", () => {
    const notes = "Luxury outdoor living: pools, patios, landscaping.";
    const raw = `Starter intake between parties.\n\n--- Complete Version: exact wording / notes to apply ---\n${notes}`;
    expect(extractPremiumUserUpgradeNotes(raw)).toBe(notes);
  });

  it("buildPremiumMergedIntakeWithUserNotes appends marker section when notes are absent from base", () => {
    const merged = buildPremiumMergedIntakeWithUserNotes("Acme and Beta consulting.", "pools patios CRM");
    expect(merged).toContain("Complete Version: exact wording");
    expect(merged).toContain("pools patios CRM");
  });
});

describe("runPremiumCompletion", () => {
  it("does not keep raw-intake dump in purpose and removes expansion boilerplate", async () => {
    const noise = "Z".repeat(450);
    const intake = `Between Acme LLC and Beta LLC for marketing analytics.\n\n${noise}`;
    const structured: ParsedDraftShape = {
      title: "Services Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "Acme LLC", role: "party" },
        { name: "Beta LLC", role: "party" },
      ],
      purpose: noise,
      payment_terms: "To be agreed",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      agreement_family: "services_agreement",
    };
    const parseDraft = vi.fn(
      async (): Promise<ParsedDraftShape> => ({
        ...structured,
        additional_terms: `${FULL_DRAFT_EXPANSION_MARKER}\nExpanded commercial provisions for review`,
      }),
    );
    const out = await runPremiumCompletion({
      intakeText: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft,
    });
    expect(out.premiumDraft.purpose.length).toBeLessThan(1200);
    expect(out.premiumDraft.purpose).not.toContain("ZZZZ");
    expect(out.premiumDraft.additional_terms ?? "").not.toContain(FULL_DRAFT_EXPANSION_MARKER);
    expect(out.premiumDraft.jurisdiction).toBe(PREMIUM_JURISDICTION_PLACEHOLDER);
  });

  it("preserves upgraded premium outdoor / sales wording when premium parse stays generic", async () => {
    const upgrade =
      "Luxury outdoor living projects: pools, patios, landscaping. Influencer sales partner with CRM, drone footage, FTC compliance, exclusivity.";
    const intake = `Between Service Provider and Client for consulting.\n\n--- Complete Version: exact wording / notes to apply ---\n${upgrade}`;
    const structured: ParsedDraftShape = {
      title: "Consulting Agreement",
      jurisdiction: "Delaware",
      agreement_family: "consulting_agreement",
      parties: [
        { name: "Service Provider", role: "party" },
        { name: "Client", role: "party" },
      ],
      purpose: "Consulting and advisory services between the parties.",
      payment_terms: "Monthly advisory fee.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
    };
    const parseDraft = vi.fn(
      async (): Promise<ParsedDraftShape> => ({
        ...structured,
        purpose: "The parties will engage in consulting and advisory services as described herein.",
      }),
    );
    const out = await runPremiumCompletion({
      intakeText: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft,
    });
    expect(parseDraft).toHaveBeenCalledWith(intake);
    const blob = `${out.premiumDraft.purpose}\n${out.premiumDraft.additional_terms}\n${out.premiumDraft.payment_terms}`.toLowerCase();
    expect(blob).toMatch(/\b(pools|patios|landscaping|crm|influencer)\b/);
  });

  it("preserves long home-page commercial substance when premium parse compresses starter-like fields", async () => {
    const longHome =
      "Between Acme LLC and Beta LLC. Retainer $5000 monthly plus 10% commission on qualified net revenue, " +
      "with 90-day clawback on refunded deals. Reimburse pre-approved travel within 14 days. " +
      "Client owns all deliverables, including lead lists and CRM exports. Exclusive territory: US Northeast. " +
      "Either party may terminate for scandal, adverse press, or ethics breach. Disputes in AAA before Delaware law. " +
      "X".repeat(80);

    const structured: ParsedDraftShape = {
      title: "Consulting Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "Acme LLC", role: "party" },
        { name: "Beta LLC", role: "party" },
      ],
      purpose: "The parties will provide consulting and advisory services.",
      payment_terms: "$10,000",
      duration: "Initial term of twelve months with automatic renewal unless either party gives 60 days notice.",
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      agreement_family: "consulting_agreement",
    };

    const parseDraft = vi.fn(
      async (): Promise<ParsedDraftShape> => ({
        ...structured,
        purpose: "Consulting services.",
        payment_terms: "$10,000",
        duration: "12 months.",
        jurisdiction: PREMIUM_JURISDICTION_PLACEHOLDER,
        termination_summary: "Either party may terminate with 30 days notice.",
      }),
    );

    const out = await runPremiumCompletion({
      intakeText: longHome,
      originalUserIntakeRawForMerge: longHome,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft,
    });

    const blob = `${out.premiumDraft.purpose}\n${out.premiumDraft.payment_terms}\n${out.premiumDraft.additional_terms ?? ""}\n${out.premiumDraft.termination_summary ?? ""}`.toLowerCase();
    expect(blob).toMatch(/retainer|commission/);
    expect(blob).toMatch(/clawback|refund/);
    expect(blob).toMatch(/reimburs/);
    expect(blob).toMatch(/exclusiv|territor/);
    expect(blob).toMatch(/scandal|reputation|disparag|conduct and publicity/);
    expect(blob).toMatch(/dispute|arbitrat|negotiation|mediat/);
    expect(blob).toMatch(/own|lead|crm|deliverable/);
    expect(out.premiumDraft.jurisdiction).not.toBe(PREMIUM_JURISDICTION_PLACEHOLDER);
  });

  it("stripPremiumUserNotesFromMergedIntake removes the exact wording tail", () => {
    const base = "Commercial terms about retainer and territory.";
    const merged = `${base}\n\n--- Complete Version: exact wording / notes to apply ---\nMore pools detail.`;
    expect(stripPremiumUserNotesFromMergedIntake(merged)).toBe(base);
  });

  it("keeps rich messy premium intake commercially complete with correct title", async () => {
    const messy =
      "I own a specialty pool + outdoor living company. Need an agreement with growth partner: $6,500 monthly plus 12% commission after deposit clears; clawback if cancel first 30 days; approval rights and no misleading claims; leads CRM ad accounts ours; phoenix metro exclusivity if 8 qualified leads/mo for 3 straight months; NDA; noncircumvent; nonsolicit; 12 month auto renew; immediate termination for fraud brand damage criminal repeated bad leads; reimbursement preapproved; arbitration Arizona or Delaware.";
    const structured: ParsedDraftShape = {
      title: "Confidentiality Agreement",
      jurisdiction: "Arizona",
      agreement_family: "nda",
      parties: [
        { name: "PoolCo LLC", role: "party" },
        { name: "Growth Partner LLC", role: "party" },
      ],
      purpose: "Consulting advisory services",
      payment_terms: "$7,500",
      duration: "Paid monthly",
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      termination_summary: "Generic termination",
      additional_terms: "",
    };
    const parseDraft = vi.fn(async () => structured);
    const out = await runPremiumCompletion({
      intakeText: messy,
      originalUserIntakeRawForMerge: messy,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft,
    });
    const title = out.premiumDraft.title.toLowerCase();
    expect(title).not.toContain("confidentiality agreement");
    expect(title).toMatch(/consulting|services|marketing|business|referral|channel|commercial protections/);
    const blob = `${out.premiumDraft.purpose}\n${out.premiumDraft.payment_terms}\n${out.premiumDraft.additional_terms ?? ""}\n${out.premiumDraft.termination_summary ?? ""}`.toLowerCase();
    expect(blob).toMatch(/commission/);
    expect(blob).toMatch(/clawback|refund|reversal/);
    expect(blob).toMatch(/ownership|lead|crm|data/);
    expect(blob).toMatch(/approval|compliance|misleading|claims/);
    expect(blob).toMatch(/exclusive|exclusivity|territory|qualified leads/);
    expect(blob).toMatch(/non[-\s]?circumvent|bypass/);
    expect(blob).toMatch(/non[-\s]?solicit/);
    expect(blob).toMatch(/reimburs|pre-?approved/);
    expect(blob).toMatch(/termination|fraud|brand damage|criminal/);
    expect(blob).toMatch(/dispute|arbitrat|governing law|jurisdiction/);
  });

  it("p20 pattern: referral/bd prompts keep noncircumvent and nonsolicit with non-generic title", async () => {
    const intake =
      "Business dev rep agreement: no circumvention of introduced accounts for 24 months; no solicitation of staff; fee clawback on cancellations; channel partner referrals.";
    const structured: ParsedDraftShape = {
      title: "Business Agreement",
      jurisdiction: "Delaware",
      agreement_family: "generic_business_agreement",
      parties: [
        { name: "Alpha LLC", role: "party" },
        { name: "Beta LLC", role: "party" },
      ],
      purpose: "Services",
      payment_terms: "To be agreed",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: null,
    };
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: async () => ({ ...structured }),
    });
    const text = `${out.premiumDraft.title}\n${out.premiumDraft.additional_terms ?? ""}`.toLowerCase();
    expect(text).toMatch(/business development|referral|channel partner/);
    expect(text).toMatch(/non[-\s]?circumvent|bypass/);
    expect(text).toMatch(/non[-\s]?solicit/);
  });

  it("p15 pattern: contractor-like prompts retain compliance controls", async () => {
    const intake =
      "Freelance copywriter contractor, monthly fee, NDA, client approval before publishing any claims, immediate termination for criminal conduct.";
    const structured: ParsedDraftShape = {
      title: "Business Agreement",
      jurisdiction: "Delaware",
      agreement_family: "generic_business_agreement",
      parties: [
        { name: "Writer", role: "party" },
        { name: "Client", role: "party" },
      ],
      purpose: "Services",
      payment_terms: "$2,500",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: null,
    };
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: async () => ({ ...structured }),
    });
    const text = `${out.premiumDraft.title}\n${out.premiumDraft.additional_terms ?? ""}`.toLowerCase();
    expect(text).toMatch(/contractor/);
    expect(text).toMatch(/compliance|approval|claims/);
  });

  it("p14 pattern: channel partner prompts keep non-solicit", async () => {
    const intake =
      "B2B referral channel partner with anti-bypass, anti-solicit of team, payout true-up monthly, disputes under JAMS California.";
    const structured: ParsedDraftShape = {
      title: "Business Agreement",
      jurisdiction: "California",
      agreement_family: "generic_business_agreement",
      parties: [
        { name: "ChannelCo", role: "party" },
        { name: "VendorCo", role: "party" },
      ],
      purpose: "Partnership",
      payment_terms: "Monthly payout",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: null,
    };
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: async () => ({ ...structured }),
    });
    const text = `${out.premiumDraft.additional_terms ?? ""}`.toLowerCase();
    expect(text).toMatch(/non[-\s]?solicit/);
  });

  it("p19 pattern: confidentiality + ownership hybrid keeps ownership language", async () => {
    const intake = "Two-party confidentiality and invention assignment for pre-launch collaboration; client owns resulting work product and data.";
    const structured: ParsedDraftShape = {
      title: "Confidentiality Agreement",
      jurisdiction: "Delaware",
      agreement_family: "nda",
      parties: [
        { name: "A", role: "party" },
        { name: "B", role: "party" },
      ],
      purpose: "Confidentiality only.",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: null,
    };
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: async () => ({ ...structured }),
    });
    const text = `${out.premiumDraft.additional_terms ?? ""}`.toLowerCase();
    expect(text).toMatch(/ownership|work product|data/);
  });

  it("p23 pattern: nda with non-solicit/non-circumvent keeps both protections", async () => {
    const intake = "Mutual NDA with non-solicit and non-circumvent tied to acquisition talks.";
    const structured: ParsedDraftShape = {
      title: "Confidentiality Agreement",
      jurisdiction: "Delaware",
      agreement_family: "nda",
      parties: [
        { name: "A", role: "party" },
        { name: "B", role: "party" },
      ],
      purpose: "NDA",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: null,
    };
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: async () => ({ ...structured }),
    });
    const text = `${out.premiumDraft.additional_terms ?? ""}`.toLowerCase();
    expect(text).toMatch(/non[-\s]?circumvent|bypass/);
    expect(text).toMatch(/non[-\s]?solicit/);
  });

  it("plain NDA stays simple", async () => {
    const intake = "Mutual NDA for product roadmap sharing only.";
    const structured: ParsedDraftShape = {
      title: "Confidentiality Agreement",
      jurisdiction: "Delaware",
      agreement_family: "nda",
      parties: [
        { name: "A", role: "party" },
        { name: "B", role: "party" },
      ],
      purpose: "NDA only",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: null,
    };
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: async () => ({ ...structured }),
    });
    expect(out.premiumDraft.title.toLowerCase()).toMatch(/confidentiality|non-disclosure/);
    expect(out.premiumDraft.title.toLowerCase()).not.toContain("commercial protections");
  });

  it("NDA + ownership becomes hybrid", async () => {
    const intake = "Mutual NDA plus work product ownership and IP assignment for a pilot collaboration.";
    const structured: ParsedDraftShape = {
      title: "Confidentiality Agreement",
      jurisdiction: "Delaware",
      agreement_family: "nda",
      parties: [{ name: "A", role: "party" }, { name: "B", role: "party" }],
      purpose: "NDA",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: null,
    };
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: async () => ({ ...structured }),
    });
    const t = out.premiumDraft.title.toLowerCase();
    const blob = `${out.premiumDraft.additional_terms ?? ""}\n${out.premiumDraft.purpose}`.toLowerCase();
    expect(t).toMatch(/commercial protections|collaboration|referral protection|confidentiality and referral agreement/);
    expect(blob).toMatch(/ownership|intellectual property|work product/);
  });

  it("NDA + no-poach becomes hybrid", async () => {
    const intake = "Mutual NDA with no-hire and anti-solicitation of team for 18 months.";
    const structured: ParsedDraftShape = {
      title: "Confidentiality Agreement",
      jurisdiction: "Delaware",
      agreement_family: "nda",
      parties: [{ name: "A", role: "party" }, { name: "B", role: "party" }],
      purpose: "NDA",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: null,
    };
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: async () => ({ ...structured }),
    });
    const text = `${out.premiumDraft.title}\n${out.premiumDraft.additional_terms ?? ""}`.toLowerCase();
    expect(text).toMatch(/commercial protections|collaboration|referral protection|confidentiality and referral agreement|confidentiality agreement/);
    expect(text).toMatch(/non[-\s]?solicit|no[-\s]?hire/);
  });

  it("NDA + referral/noncircumvent becomes hybrid", async () => {
    const intake = "Mutual NDA for referral introductions with non-circumvent protections and commission tracking.";
    const structured: ParsedDraftShape = {
      title: "Confidentiality Agreement",
      jurisdiction: "Delaware",
      agreement_family: "nda",
      parties: [{ name: "A", role: "party" }, { name: "B", role: "party" }],
      purpose: "NDA",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: null,
    };
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: async () => ({ ...structured }),
    });
    const text = `${out.premiumDraft.title}\n${out.premiumDraft.additional_terms ?? ""}`.toLowerCase();
    expect(text).toMatch(/referral protection|commercial protections|confidentiality and referral agreement/);
    expect(text).toMatch(/non[-\s]?circumvent|bypass/);
  });

  it("NDA + CRM/customer lists becomes hybrid", async () => {
    const intake = "Mutual NDA for evaluation; customer lists and CRM lead data remain discloser-owned and must be returned or destroyed.";
    const structured: ParsedDraftShape = {
      title: "Confidentiality Agreement",
      jurisdiction: "Delaware",
      agreement_family: "nda",
      parties: [{ name: "A", role: "party" }, { name: "B", role: "party" }],
      purpose: "NDA",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: null,
    };
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: async () => ({ ...structured }),
    });
    const text = `${out.premiumDraft.title}\n${out.premiumDraft.additional_terms ?? ""}`.toLowerCase();
    expect(text).toMatch(/commercial protections|collaboration|referral protection|confidentiality and referral agreement/);
    expect(text).toMatch(/crm|customer list|lead data|return|destroy/);
  });

  it("roofing closer prompt generates materially premium sales-rep protections", async () => {
    const intake =
      "Need independent contractor outside sales closer agreement for roofing. Commission based on closed deals. Rep cannot make fake promises or bind company. CRM and lead data are company-owned with immediate access revocation on termination. Clawback for canceled deals within 60 days. Terminate for cause. Include signatures.";
    const structured: ParsedDraftShape = {
      title: "Business Agreement",
      jurisdiction: "Delaware",
      agreement_family: "generic_business_agreement",
      parties: [{ name: "RoofCo", role: "party" }, { name: "Closer", role: "party" }],
      purpose: "Sales support.",
      payment_terms: "Commission.",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: null,
    };
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: async () => ({ ...structured }),
    });
    const title = out.premiumDraft.title.toLowerCase();
    const blob = `${out.premiumDraft.purpose}\n${out.premiumDraft.payment_terms}\n${out.premiumDraft.additional_terms ?? ""}\n${out.premiumDraft.termination_summary ?? ""}`.toLowerCase();
    expect(title).toMatch(/independent contractor|sales|services/);
    expect(blob).toMatch(/commission/);
    expect(blob).toMatch(/no authority|cannot bind|bind company|authority/);
    expect(blob).toMatch(/fake promises|misleading|claims|prohibited/);
    expect(blob).toMatch(/crm|lead data|ownership|access revocation|revoke/);
    expect(blob).toMatch(/clawback|cancel(?:ed|s)? deals?|60 days|refund/);
    expect(blob).toMatch(/termination|for cause/);
    expect(blob).toMatch(/signature|signer|authorized signer|date/);
  });

  it("pool/realtor referral prompt keeps explicit commission mechanics instead of generic payment placeholders", async () => {
    const intake =
      "Need referral agreement with 7% on closed jobs they source, paid after deposit clears, no commission on house accounts, no commission on existing clients, and clawback/refund offsets. Pool builder and realtor referral relationship.";
    const structured: ParsedDraftShape = {
      title: "Business Agreement",
      jurisdiction: "Arizona",
      agreement_family: "generic_business_agreement",
      parties: [{ name: "Pool Builder LLC", role: "party" }, { name: "Realtor LLC", role: "party" }],
      purpose: "Referral services.",
      payment_terms: "Payment schedule to be agreed.",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: null,
    };
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: async () => ({ ...structured }),
    });
    const blob = `${out.premiumDraft.payment_terms}\n${out.premiumDraft.additional_terms ?? ""}`.toLowerCase();
    expect(blob).toMatch(/7%/);
    expect(blob).toMatch(/closed.*jobs|attributable sourced/);
    expect(blob).toMatch(/deposit clears|cleared funds/);
    expect(blob).toMatch(/house accounts/);
    expect(blob).toMatch(/existing clients/);
    expect(blob).toMatch(/clawback|offset|refund/);
    expect(blob).not.toMatch(/payment schedule to be agreed|to be determined|to be specified/);
  });

  it("universal materiality: referral intake materially beats thin starter when parse echoes starter", async () => {
    const intake =
      "Between Orion Labs LLC and Connector LLC for a software referral channel. Connector introduces qualified enterprise buyers; Orion pays 11% of first-year contract value after customer pays invoice. No commission on house accounts Orion already knew. Clawback if customer churns within 120 days. Governing law California.";
    const structured: ParsedDraftShape = {
      title: "Business Agreement",
      jurisdiction: "California",
      agreement_family: "generic_business_agreement",
      parties: [
        { name: "Orion Labs LLC", role: "party" },
        { name: "Connector LLC", role: "party" },
      ],
      purpose: "The parties will work together on business introductions.",
      payment_terms: "Payment schedule to be agreed between the parties.",
      duration: "1 year",
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: "Either party may terminate with 30 days written notice.",
    };
    const thinEcho = vi.fn(async (): Promise<ParsedDraftShape> => ({
      ...structured,
      purpose: "The parties will work together on business introductions.",
      payment_terms: "Payment schedule to be agreed between the parties.",
      additional_terms: null,
    }));
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: thinEcho,
    });
    const free = buildAgreementPreviewText(structured, { starterPreview: true });
    const premium = out.winningPremiumBodyText;
    expect(premium.length).toBeGreaterThan(Math.floor(free.length * 1.12));
    expect(evaluateUniversalPremiumMateriality(free, premium, intake).ok).toBe(true);
    expect(premium.toLowerCase()).toMatch(/11%/);
    expect(premium.toLowerCase()).toMatch(/churn|clawback|120/);
  });

  it("universal materiality: agency / paid media services intake materially beats thin starter when parse echoes starter", async () => {
    const intake =
      "BrightCart Inc wants to hire Northwind Media to run Meta and TikTok campaigns plus lifecycle email. Need written spend caps, client-owned ad accounts and pixels, weekly performance readouts, FTC-safe claims handling, no undisclosed subcontractors, 45-day termination notice with orderly handoff, and no repurposing our creatives for competing brands.";
    const structured: ParsedDraftShape = {
      title: "Services Agreement",
      jurisdiction: "Delaware",
      agreement_family: "services_agreement",
      parties: [
        { name: "BrightCart Inc", role: "party" },
        { name: "Northwind Media LLC", role: "party" },
      ],
      purpose: "Marketing and advertising services between the parties.",
      payment_terms: "Fees to be agreed in writing.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: "Either party may terminate with notice.",
    };
    const thinEcho = vi.fn(async (): Promise<ParsedDraftShape> => ({
      ...structured,
      purpose: "Marketing and advertising services between the parties.",
      payment_terms: "Fees to be agreed in writing.",
      additional_terms: null,
    }));
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: thinEcho,
    });
    const free = buildAgreementPreviewText(structured, { starterPreview: true });
    const premium = out.winningPremiumBodyText;
    expect(premium.length).toBeGreaterThan(Math.floor(free.length * 1.12));
    expect(evaluateUniversalPremiumMateriality(free, premium, intake).ok).toBe(true);
    const low = premium.toLowerCase();
    expect(low).toMatch(/meta|tiktok/);
    expect(low).toMatch(/pixel|ad account/);
    expect(low).toMatch(/subcontract|reporting|ftc|compet/);
  });

  it("universal materiality: JV / profit-split intake materially beats thin starter when parse echoes starter", async () => {
    const intake =
      "Joint venture LLC between Stone Ridge Developer LLC and Atlas Capital Fund II for a 180-unit workforce housing rehab in Columbus Ohio. Atlas provides pref equity $18M; Stone Ridge manages construction and leasing. Waterfall: 8% preferred return to Atlas, then 50/50 profit split. Capital calls require 10 business days notice with cure for missed calls. Deadlock on major decisions resolved by mutual buy-sell mechanism. Books audited annually. Mutual confidentiality on underwriting model.";
    const structured: ParsedDraftShape = {
      title: "Business Agreement",
      jurisdiction: "Ohio",
      agreement_family: "generic_business_agreement",
      parties: [
        { name: "Stone Ridge Developer LLC", role: "party" },
        { name: "Atlas Capital Fund II", role: "party" },
      ],
      purpose: "The parties will pursue a joint business opportunity.",
      payment_terms: "Economics to be agreed between the parties.",
      duration: "36 months",
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: "Standard termination as provided in this Agreement.",
    };
    const thinEcho = vi.fn(async (): Promise<ParsedDraftShape> => ({
      ...structured,
      purpose: "The parties will pursue a joint business opportunity.",
      payment_terms: "Economics to be agreed between the parties.",
      additional_terms: null,
    }));
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft: thinEcho,
    });
    const free = buildAgreementPreviewText(structured, { starterPreview: true });
    const premium = out.winningPremiumBodyText;
    expect(premium.length).toBeGreaterThan(Math.floor(free.length * 1.12));
    expect(evaluateUniversalPremiumMateriality(free, premium, intake).ok).toBe(true);
    const low = premium.toLowerCase();
    expect(low).toMatch(/50\/50|profit split/);
    expect(low).toMatch(/capital calls|pref|preferred|8%/);
    expect(low).toMatch(/deadlock|confidential/);
  });

  it("browser-proven: marketing agency — rich premium parse survives into winning paper vs thin starter snapshot", async () => {
    const intake =
      "BrightCart Inc hired Northwind Media to run Meta/TikTok ads and email flows. Need spend approval, client-owned ad accounts and pixels, subcontractors disclosed, weekly reporting, FTC-safe claims workflow, chargeback cooperation, 45-day exit notice, and no reusing our creatives for competing brands. Delaware law.";
    const structured: ParsedDraftShape = {
      title: "Services Agreement",
      jurisdiction: "Delaware",
      agreement_family: "services_agreement",
      parties: [
        { name: "BrightCart Inc", role: "party" },
        { name: "Northwind Media LLC", role: "party" },
      ],
      purpose: "Marketing and advertising services between the parties.",
      payment_terms: "Fees to be agreed in writing.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: "Either party may terminate with notice.",
    };
    const richPurpose =
      "Commercial relationship. The Agency shall obtain the Client’s written approval before increasing media spend above agreed weekly caps or launching net-new creative that materially changes pricing or offer claims. " +
      "The Client shall retain ownership of its advertising accounts, pixels, tags, remarketing audiences, and performance histories; the Agency shall receive limited administrative access solely to perform the Services and shall not merge Client assets with other advertisers without written consent. " +
      "The Agency shall disclose and obtain written approval for any subcontractors performing material parts of the Services and shall remain responsible for approved subcontractors. " +
      "The Agency shall provide weekly performance readouts with spend, delivery, tests, and attributable outcomes where reasonably available. " +
      "Externally facing advertisements shall comply with FTC truth-in-advertising expectations and platform policies, with substantiation maintained for sensitive claims. " +
      "Either Party may terminate on forty-five days written notice with cooperation on pausing spend, exporting deliverables Client is entitled to receive, and revoking access credentials.";
    const parseDraft = vi.fn(
      async (): Promise<ParsedDraftShape> => ({
        ...structured,
        purpose: richPurpose,
        payment_terms:
          "Professional fees shall be invoiced monthly in arrears within fifteen days of invoice; Client shall pre-approve any pass-through platform spend above the monthly test budget of $2,500.",
        additional_terms: "",
      }),
    );
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft,
    });
    const free = buildAgreementPreviewText(structured, { starterPreview: true });
    expect(out.winningPremiumBodyText.length).toBeGreaterThan(Math.floor(free.length * 1.08));
    const low = out.winningPremiumBodyText.toLowerCase();
    expect(low).toMatch(/ftc|pixel|subcontract|forty-five|45|pre-approv|weekly/);
    expect(parseDraft).toHaveBeenCalled();
  });

  it("browser-proven: independent contractor closer — rich premium parse survives into winning paper vs thin starter snapshot", async () => {
    const intake =
      "Independent contractor commission-only roofing closer. Rep cannot bind company. CRM/leads owned by company with log revocation on termination. Commission on closed net jobs after deposit clears. 60-day clawback on canceled work. Arizona.";
    const structured: ParsedDraftShape = {
      title: "Business Agreement",
      jurisdiction: "Arizona",
      agreement_family: "generic_business_agreement",
      parties: [
        { name: "RoofCo LLC", role: "party" },
        { name: "Rep Name", role: "party" },
      ],
      purpose: "Sales assistance.",
      payment_terms: "Commission.",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: null,
    };
    const richPurpose =
      "The Contractor shall solicit and close roofing contracts solely in accordance with written price lists and disclosures approved by the Company. The Contractor shall not have authority to bind the Company to any obligation without a countersigned purchase order. " +
      "The Company shall retain exclusive ownership of CRM records, lead lists, and estimate templates; the Contractor’s access shall terminate immediately upon notice of termination. " +
      "Commissions shall accrue only on closed projects after customer deposits clear, net of documented refunds for work not performed. " +
      "For customers who cancel within sixty days of contract execution, the Company may claw back paid commissions on a dollar-for-dollar basis. " +
      "Either Party may terminate this Agreement immediately for fraud, false promises to customers, or criminal misconduct.";
    const parseDraft = vi.fn(
      async (): Promise<ParsedDraftShape> => ({
        ...structured,
        agreement_family: "independent_contractor_agreement",
        purpose: richPurpose,
        payment_terms:
          "Commission only: fifteen percent of collected contract value after permitted discounts, payable monthly with a sixty-day clawback window tied to project cancellations shown in the Company ledger.",
        additional_terms: "",
      }),
    );
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft,
    });
    const free = buildAgreementPreviewText(structured, { starterPreview: true });
    expect(out.winningPremiumBodyText.length).toBeGreaterThan(Math.floor(free.length * 1.06));
    const low = out.winningPremiumBodyText.toLowerCase();
    expect(low).toMatch(/clawback|60|sixty|commission|crm|authority|bind/);
  });

  it("browser-proven: referral agreement — rich premium parse survives into winning paper vs thin starter snapshot", async () => {
    const intake =
      "Channel referral deal: introduce qualified B2B accounts, 12% of first-year paid revenue, 18-month non-circumvent on introduced logos, fee true-ups monthly, Texas law.";
    const structured: ParsedDraftShape = {
      title: "Business Agreement",
      jurisdiction: "Texas",
      agreement_family: "generic_business_agreement",
      parties: [
        { name: "Alpha LLC", role: "party" },
        { name: "Beta LLC", role: "party" },
      ],
      purpose: "Referrals.",
      payment_terms: "To be agreed.",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
      additional_terms: "",
      termination_summary: null,
    };
    const richAdd =
      "Non-circumvention: for eighteen months following each introduction, neither Party shall solicit, negotiate with, or contract with an introduced account in a manner that avoids the referral fees described here. " +
      "Referral fees shall be twelve percent of first-year contractually invoiced amounts after customer payments clear, excluding taxes and pass-through costs. " +
      "Fees shall be reconciled monthly with supporting ledger extracts and credited against chargebacks or refunds within the same calendar quarter.";
    const parseDraft = vi.fn(async (): Promise<ParsedDraftShape> => ({
      ...structured,
      purpose:
        "The Parties intend a referral-led commercial introduction relationship where Beta introduces qualified accounts and Alpha handles contracting and fulfillment. Detailed economics and protections appear below.",
      payment_terms: "Monthly true-up with ledger exports; payment due fifteen days after invoice.",
      additional_terms: richAdd,
    }));
    const out = await runPremiumCompletion({
      intakeText: intake,
      originalUserIntakeRawForMerge: intake,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft,
    });
    const free = buildAgreementPreviewText(structured, { starterPreview: true });
    expect(out.winningPremiumBodyText.length).toBeGreaterThan(Math.floor(free.length * 1.06));
    const low = out.winningPremiumBodyText.toLowerCase();
    expect(low).toMatch(/12%|twelve percent/);
    expect(low).toMatch(/non-circumvent|eighteen|18/);
    expect(low).toMatch(/true-?up|ledger|chargeback/);
  });
});
