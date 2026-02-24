import type { DraftState } from "../../components/AgreementBuilderChat";
import type { AgreementSession } from "./sessionTypes";
import { normalizeDraft, validateDraft } from "./normalizeValidate";

type EscrowState = AgreementSession["escrow"];

function escText(escrow: EscrowState): string {
  if (escrow.mode === "real_estate_escrow") {
    return `Escrow is expected through ${escrow.provider_name || "Escrow.com"} (${escrow.provider_url || "https://www.escrow.com"}) [stub].`;
  }
  if (escrow.mode === "crypto_escrow") {
    return "Crypto escrow workflow selected (coming soon / stub).";
  }
  if (escrow.mode === "external_manual") {
    return `External/manual escrow selected${escrow.provider_name ? `: ${escrow.provider_name}` : ""}.`;
  }
  return "No escrow selected.";
}

export function generateContractMarkdown(input: {
  draft: DraftState;
  escrow: EscrowState;
  effectiveDate?: string | null;
}): string {
  const { draft, escrow, effectiveDate } = input;
  const normalized = normalizeDraft(draft).draft;
  const validation = validateDraft(normalized);
  const title = (normalized.title || "").trim() || "TBD (required)";
  const jurisdiction = (normalized.jurisdiction || "").trim() || "TBD (required)";
  const parties = normalized.parties || [];
  const body = (normalized.body_md || "")
    .replace(/^Template Body:\s*(true|false)\s*$/gim, "")
    .trim();
  const scheduleText =
    typeof normalized.payment?.schedule === "string"
      ? normalized.payment?.schedule
      : normalized.payment?.schedule?.text || "";
  const dayList =
    typeof normalized.payment?.schedule === "string"
      ? []
      : normalized.payment?.schedule?.daysWorked || [];
  const paymentAmount = (normalized.payment?.amount || "").trim() || "TBD (required)";
  const paymentFrequency = (normalized.payment?.frequency || "").trim() || "TBD (required)";
  const paymentSchedule = (scheduleText || (dayList.length ? `Days worked: ${dayList.join(", ")}` : "")).trim() || "TBD (required)";
  const paymentTerms = (normalized.payment_terms || "").trim();
  const partyA = parties[0]?.name || "Party A";
  const partyB = parties[1]?.name || "Party B";
  const partyARole = parties[0]?.role ? ` (${parties[0]?.role})` : "";
  const partyBRole = parties[1]?.role ? ` (${parties[1]?.role})` : "";
  const partyAContact = (parties[0]?.contact || "").trim() || "TBD (required)";
  const partyBContact = (parties[1]?.contact || "").trim() || "TBD (required)";
  const termDuration = (normalized.term?.duration || normalized.term_duration || "").trim() || "TBD (required)";
  const governingLaw = (normalized.governingLaw || jurisdiction || "").trim() || "TBD (required)";
  const warnings = validation.warnings;
  const additional = parties
    .slice(2)
    .map((p, i) => `- Additional Party ${i + 1}: ${(p.name || "").trim() || "TBD (required)"}${p.role ? ` (${p.role})` : ""}`)
    .join("\n");

  if (normalized.customBodyEnabled === true && body) {
    return [
      `# ${title}`,
      "",
      `Jurisdiction: ${jurisdiction}`,
      effectiveDate ? `Effective Date: ${effectiveDate}` : "",
      "",
      "## Parties",
      `- ${partyA}${partyARole}`,
      `  - Contact: ${partyAContact}`,
      `- ${partyB}${partyBRole}`,
      `  - Contact: ${partyBContact}`,
      additional || "",
      "",
      "## Payment",
      `Amount: ${paymentAmount}`,
      `Frequency: ${paymentFrequency}`,
      `Schedule: ${paymentSchedule}`,
      paymentTerms ? `Terms: ${paymentTerms}` : "",
      "",
      "## Term",
      `Duration: ${termDuration}`,
      "",
      "## Escrow",
      escText(escrow),
      escrow.notes ? `Notes: ${escrow.notes}` : "",
      "",
      "## Governing Law",
      `This Agreement is governed by the laws of ${governingLaw}, without regard to conflict of law principles.`,
      warnings.length ? "\n## Validation Warnings" : "",
      ...warnings.map((w) => `- ${w}`),
      "",
      "## Custom Body",
      body,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `# ${title}`,
    "",
    "## Parties",
    `- ${partyA}${partyARole}`,
    `  - Contact: ${partyAContact}`,
    `- ${partyB}${partyBRole}`,
    `  - Contact: ${partyBContact}`,
    additional || "",
    "",
    "## Jurisdiction",
    jurisdiction,
    effectiveDate ? `\n## Effective Date\n${effectiveDate}` : "",
    "",
    "## Purpose",
    (normalized.purpose || normalized.context_summary || "").trim() || "TBD (required)",
    "",
    "## Scope",
    (normalized.scope || normalized.key_terms || "").trim() || "TBD (required)",
    "",
    "## Payment",
    `Amount: ${paymentAmount}`,
    `Frequency: ${paymentFrequency}`,
    `Schedule: ${paymentSchedule}`,
    paymentTerms ? `Terms: ${paymentTerms}` : "",
    "",
    "## Term",
    `Duration: ${termDuration}`,
    `Start Date: ${(normalized.term?.startDate || normalized.effective_date || "").trim() || "TBD (required)"}`,
    "",
    "## Escrow",
    escText(escrow),
    escrow.notes ? `Notes: ${escrow.notes}` : "",
    "",
    "## Termination",
    (normalized.termination || normalized.termination_terms || "").trim() || "TBD (required)",
    "",
    "## Governing Law",
    `This Agreement is governed by the laws of ${governingLaw}, without regard to conflict of law principles.`,
    warnings.length ? "\n## Validation Warnings" : "",
    ...warnings.map((w) => `- ${w}`),
    "",
    "## Required Field Check",
    validation.missingRequired.length
      ? validation.missingRequired.map((m) => `- Missing: ${m}`).join("\n")
      : "All required fields present or explicitly waived.",
    "",
    "## Signatures",
    "Each signer should confirm and sign the exact revision hash presented at signing.",
  ]
    .filter(Boolean)
    .join("\n");
}

