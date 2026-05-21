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

const ID_DEFAULTS: Partial<Record<string, (family: CommercialFamilyHint) => DealVariableDefault[]>> = {
  saas_sla: DEFAULTS_BY_CATEGORY.sla!,
  referral_economics: DEFAULTS_BY_CATEGORY.referral_economics!,
  payment_timing: DEFAULTS_BY_CATEGORY.payment_timing!,
  milestone_schedule: DEFAULTS_BY_CATEGORY.milestones!,
  governing_venue: DEFAULTS_BY_CATEGORY.governing_law!,
  ip_allocation: DEFAULTS_BY_CATEGORY.ip_ownership!,
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
