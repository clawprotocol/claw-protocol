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

const ID_DEFAULTS: Partial<Record<string, (family: CommercialFamilyHint) => DealVariableDefault[]>> = {
  saas_sla: DEFAULTS_BY_CATEGORY.sla!,
  referral_economics: DEFAULTS_BY_CATEGORY.referral_economics!,
  payment_timing: DEFAULTS_BY_CATEGORY.payment_timing!,
  payment_structure: () => CONSULTING_PAYMENT_STRUCTURE,
  support_obligations: () => CONSULTING_SUPPORT,
  scope_change_approval: () => CONSULTING_SCOPE_APPROVAL,
  ip_ownership: () => CONSULTING_IP,
  milestone_schedule: DEFAULTS_BY_CATEGORY.milestones!,
  governing_venue: DEFAULTS_BY_CATEGORY.governing_law!,
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
