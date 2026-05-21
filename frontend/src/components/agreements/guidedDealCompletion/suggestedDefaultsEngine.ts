import type { CommercialFamilyHint } from "../proAgreementCompleteness/types";
import type { DealVariableCategory, DealVariableDefault } from "./types";

const DEFAULTS_BY_CATEGORY: Partial<
  Record<DealVariableCategory, (family: CommercialFamilyHint) => DealVariableDefault[]>
> = {
  payment_timing: () => [
    { id: "net30", label: "Net 30", value: "Invoices due Net 30 days from receipt." },
    { id: "net15", label: "Net 15", value: "Invoices due Net 15 days from receipt." },
    { id: "on_receipt", label: "On receipt", value: "Payment due upon receipt of invoice." },
    { id: "custom", label: "Custom", value: "" },
  ],
  referral_economics: () => [
    {
      id: "pct5",
      label: "5% collected revenue",
      value: "Referral fee of 5% of net collected revenue from introduced customers.",
      rationale: "Common for channel introductions.",
    },
    {
      id: "pct10",
      label: "10% collected revenue",
      value: "Referral fee of 10% of net collected revenue from introduced customers.",
    },
    { id: "flat", label: "Flat fee per deal", value: "Flat referral fee per closed introduced deal." },
    { id: "custom", label: "Custom", value: "" },
  ],
  sla: (family) => [
    {
      id: "uptime999",
      label: "99.9% uptime",
      value: "Service availability target of 99.9% monthly uptime, excluding scheduled maintenance.",
      rationale: family === "saas_msa" ? "Most SaaS MSAs use 99.9% uptime." : undefined,
    },
    {
      id: "uptime995",
      label: "99.5% uptime",
      value: "Service availability target of 99.5% monthly uptime.",
    },
    { id: "commercial", label: "Commercially reasonable", value: "Commercially reasonable uptime and support levels." },
    { id: "custom", label: "Custom", value: "" },
  ],
  milestones: () => [
    { id: "on_accept", label: "On acceptance", value: "Milestone payments due upon written acceptance of deliverables." },
    { id: "monthly", label: "Monthly", value: "Milestone fees invoiced monthly upon completion of agreed tasks." },
    { id: "custom", label: "Custom", value: "" },
  ],
  governing_law: () => [
    { id: "de", label: "Delaware", value: "Governed by the laws of the State of Delaware." },
    { id: "ca", label: "California", value: "Governed by the laws of the State of California." },
    { id: "ny", label: "New York", value: "Governed by the laws of the State of New York." },
    { id: "custom", label: "Custom", value: "" },
  ],
  ip_ownership: () => [
    { id: "client", label: "Client owns deliverables", value: "Client owns all work product and deliverables created under this Agreement." },
    { id: "license", label: "License to client", value: "Consultant grants Client a perpetual license to use deliverables." },
    { id: "custom", label: "Custom", value: "" },
  ],
  termination: () => [
    { id: "30", label: "30 days notice", value: "Either Party may terminate on thirty (30) days written notice." },
    { id: "60", label: "60 days notice", value: "Either Party may terminate on sixty (60) days written notice." },
    { id: "custom", label: "Custom", value: "" },
  ],
  confidentiality: () => [
    { id: "3y", label: "3 years survival", value: "Confidentiality obligations survive three (3) years after termination." },
    { id: "5y", label: "5 years survival", value: "Confidentiality obligations survive five (5) years after termination." },
    { id: "custom", label: "Custom", value: "" },
  ],
  governance: () => [
    { id: "majority", label: "Majority vote", value: "Project decisions require majority approval of the Parties." },
    { id: "unanimous", label: "Unanimous budget", value: "Material budgets require unanimous written approval." },
    { id: "custom", label: "Custom", value: "" },
  ],
};

const CONSULTING_PAYMENT_STRUCTURE: DealVariableDefault[] = [
  { id: "hourly", label: "Hourly", value: "Consultant is paid hourly at the agreed rate, invoiced monthly." },
  { id: "fixed", label: "Fixed project fee", value: "Fixed project fee for the agreed scope and deliverables." },
  { id: "retainer", label: "Monthly retainer", value: "Monthly retainer for ongoing services, with extra work approved in writing." },
  { id: "milestone", label: "Milestone-based", value: "Fees tied to defined milestones or deliverables with written acceptance." },
  { id: "custom", label: "Custom", value: "" },
];

const CONSULTING_SUPPORT: DealVariableDefault[] = [
  { id: "handoff", label: "Reasonable handoff only", value: "Reasonable handoff and knowledge transfer after delivery; no ongoing maintenance." },
  { id: "business_hours", label: "Business-hours support", value: "Business-hours support for 30 days after delivery for material defects." },
  { id: "maintenance", label: "Monthly maintenance", value: "Monthly maintenance and bug-fix support under agreed hours or fees." },
  { id: "separate_sow", label: "Separate SOW", value: "Post-delivery support provided only under a separate signed SOW." },
  { id: "custom", label: "Custom", value: "" },
];

const CONSULTING_SCOPE_APPROVAL: DealVariableDefault[] = [
  { id: "email", label: "Email approval is enough", value: "Scope changes approved by email from an authorized company contact." },
  { id: "sow", label: "Signed SOW / change order", value: "Material scope changes require a signed SOW or change order before work begins." },
  { id: "ticket", label: "Ticket approval", value: "Scope changes approved through the parties' agreed project ticketing system." },
  { id: "written", label: "Company written approval", value: "Scope changes require written approval from the company's authorized representative." },
  { id: "custom", label: "Custom", value: "" },
];

const CONSULTING_IP: DealVariableDefault[] = [
  { id: "company_deliverables", label: "Company owns project deliverables", value: "Company owns all project deliverables; consultant retains pre-existing tools and know-how." },
  { id: "developer_tools", label: "Developer keeps reusable tools", value: "Company owns deliverables; consultant retains reusable tools, libraries, and general methods." },
  { id: "shared", label: "Shared / custom", value: "Custom IP allocation as described by the parties." },
  { id: "custom", label: "Custom", value: "" },
];

const IP_CONTRADICTION: DealVariableDefault[] = [
  {
    id: "split_tools",
    label: "Company owns project deliverables; developer keeps reusable tools",
    value:
      "Company owns all project deliverables created under this Agreement; Contractor retains pre-existing tools, libraries, know-how, and reusable developer materials.",
  },
  {
    id: "exclusive_license",
    label: "Developer owns all work; company gets exclusive license",
    value:
      "Contractor owns all work product and grants Company an exclusive, perpetual, worldwide license to use, modify, and exploit deliverables for its business.",
  },
  {
    id: "shared",
    label: "Shared / custom",
    value:
      "Use a split IP structure: Company owns project-specific deliverables created for the engagement; Contractor retains pre-existing tools, libraries, know-how, and reusable developer materials; Company receives a perpetual license to embedded Contractor background materials as needed to use the deliverables.",
  },
  { id: "custom", label: "Custom", value: "" },
];

const TERM_CONTRADICTION: DealVariableDefault[] = [
  { id: "monthly_notice", label: "Month-to-month, terminable on notice", value: "Month-to-month term; either Party may terminate on thirty (30) days written notice." },
  { id: "three_year_early", label: "3-year initial term with monthly work orders", value: "Initial term of three (3) years with services ordered month-to-month under written work orders." },
  { id: "monthly_cap", label: "Month-to-month after 3-year lock", value: "Services continue month-to-month for up to three (3) years unless terminated on thirty (30) days written notice." },
  { id: "custom", label: "Custom", value: "" },
];

const PHASE_PAYMENT: DealVariableDefault[] = [
  { id: "even_thirds", label: "Even thirds across phases", value: "Fees split evenly across build, rollout, and support phases (approximately one-third each)." },
  { id: "build_heavy", label: "Build-heavy split", value: "40% on build acceptance, 40% on rollout go-live, 20% for first-year support." },
  { id: "milestone", label: "Milestone triggers", value: "Payments due on written acceptance of each phase deliverable per Schedule A." },
  { id: "custom", label: "Custom", value: "" },
];

const TOTAL_FEE: DealVariableDefault[] = [
  { id: "120k", label: "$120,000 total", value: "Total contract fee of $120,000 USD." },
  { id: "confirm_intake", label: "Use intake estimate", value: "Total fee as stated in the parties' intake (confirm exact amount in Schedule A)." },
  { id: "custom", label: "Custom", value: "" },
];

const PARTY_LEGAL: DealVariableDefault[] = [
  { id: "llc_pair", label: "Add LLC suffixes", value: "Use full legal entity names with LLC/Inc. suffixes for each party listed in the agreement." },
  { id: "custom", label: "Custom", value: "" },
];

const SECURITY_OBLIGATIONS: DealVariableDefault[] = [
  { id: "baseline", label: "Commercially reasonable security", value: "Commercially reasonable administrative, technical, and physical safeguards for Customer data." },
  { id: "enterprise", label: "Enterprise baseline", value: "Encryption in transit and at rest; access controls; 72-hour breach notification; annual security questionnaire." },
  { id: "custom", label: "Custom", value: "" },
];

const VENUE: DealVariableDefault[] = [
  { id: "client_venue", label: "Client headquarters courts", value: "Exclusive venue in courts where Client is headquartered." },
  { id: "neutral", label: "Neutral arbitration", value: "Disputes resolved by binding arbitration in a mutually agreed city." },
  { id: "custom", label: "Custom", value: "" },
];

const DEAL_TERMS: DealVariableDefault[] = [
  {
    id: "standard",
    label: "Use standard commercial terms",
    value: "Use commercially reasonable standard terms typical for this type of agreement.",
  },
  {
    id: "schedule_a",
    label: "Keep flexible / confirm later in Schedule A",
    value: "Defer detailed commercial terms to Schedule A to be confirmed before execution.",
  },
  { id: "custom", label: "Add custom details", value: "" },
];

const PROJECT_FEE_PHASE: DealVariableDefault[] = [
  {
    id: "even_split",
    label: "$120k even across phases",
    value: "Total fee $120,000 USD split evenly across build, rollout, and support phases.",
  },
  {
    id: "build_heavy",
    label: "Build-heavy split",
    value: "Total $120,000: 40% on build acceptance, 40% on rollout go-live, 20% for year-one support.",
  },
  { id: "custom", label: "Custom", value: "" },
];

const RENEWAL_NOTICE: DealVariableDefault[] = [
  { id: "30_day", label: "30 days notice", value: "Either Party may terminate on thirty (30) days written notice; auto-renewal requires the same notice." },
  { id: "60_day", label: "60 days notice", value: "Either Party may terminate on sixty (60) days written notice before renewal." },
  { id: "custom", label: "Custom", value: "" },
];

const LICENSE_BACKGROUND: DealVariableDefault[] = [
  {
    id: "perpetual_embedded",
    label: "Company gets perpetual license to embedded tools",
    value:
      "Company receives a perpetual, royalty-free license to use Contractor background materials embedded in deliverables as needed to operate the deliverables.",
  },
  {
    id: "approval_required",
    label: "Developer must avoid embedding reusable tools without approval",
    value:
      "Contractor will not embed reusable tools or background materials in deliverables without Company's prior written approval.",
  },
  { id: "custom", label: "Custom", value: "" },
];

const DELIVERABLES_SCOPE: DealVariableDefault[] = [
  { id: "software_dev", label: "Software development and bug fixes", value: "Software development, implementation, and reasonable bug fixes for delivered work." },
  { id: "product_build", label: "App / product buildout", value: "Application or product buildout as described in the agreed scope." },
  { id: "maintenance", label: "Maintenance and support", value: "Ongoing maintenance and support for delivered systems." },
  { id: "custom", label: "Custom", value: "" },
];

const ID_DEFAULTS: Partial<Record<string, (family: CommercialFamilyHint) => DealVariableDefault[]>> = {
  phase_payment_allocation: () => PHASE_PAYMENT,
  total_fee_confirmation: () => TOTAL_FEE,
  party_legal_names: () => PARTY_LEGAL,
  security_obligations: () => SECURITY_OBLIGATIONS,
  renewal_notice: () => RENEWAL_NOTICE,
  governing_venue: () => VENUE,
  deal_terms_confirmation: () => DEAL_TERMS,
  project_fee_phase_confirmation: () => PROJECT_FEE_PHASE,
  supplemental_schedule_confirmation: () => PHASE_PAYMENT,
  as_specified_in_schedule_a: () => PHASE_PAYMENT,
  amount_to_be_confirmed: () => TOTAL_FEE,
  payment_timing_to_be_confirmed: DEFAULTS_BY_CATEGORY.payment_timing!,
  saas_sla: DEFAULTS_BY_CATEGORY.sla!,
  referral_economics: DEFAULTS_BY_CATEGORY.referral_economics!,
  payment_timing: DEFAULTS_BY_CATEGORY.payment_timing!,
  payment_structure: () => CONSULTING_PAYMENT_STRUCTURE,
  support_obligations: () => CONSULTING_SUPPORT,
  scope_change_approval: () => CONSULTING_SCOPE_APPROVAL,
  ip_ownership: () => CONSULTING_IP,
  ip_ownership_contradiction: () => IP_CONTRADICTION,
  term_structure_contradiction: () => TERM_CONTRADICTION,
  license_background_tools: () => LICENSE_BACKGROUND,
  deliverables_scope: () => DELIVERABLES_SCOPE,
  milestone_schedule: DEFAULTS_BY_CATEGORY.milestones!,
  governing_law_notice: DEFAULTS_BY_CATEGORY.governing_law!,
  ip_allocation: () => CONSULTING_IP,
  jv_contributions: DEFAULTS_BY_CATEGORY.governance!,
  jv_ip_governance: DEFAULTS_BY_CATEGORY.governance!,
};

export function suggestedDefaultsForVariable(args: {
  id: string;
  category: DealVariableCategory;
  family: CommercialFamilyHint;
}): DealVariableDefault[] {
  const byId = ID_DEFAULTS[args.id];
  if (byId) return byId(args.family);
  const byCat = DEFAULTS_BY_CATEGORY[args.category];
  if (byCat) return byCat(args.family);
  return [
    { id: "standard", label: "Use standard commercial terms", value: "Use commercially reasonable terms typical for this deal type." },
    { id: "custom", label: "Custom", value: "" },
  ];
}
