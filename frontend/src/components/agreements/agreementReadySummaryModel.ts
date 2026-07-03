import type { AgreementDraft } from "../../agreement/agreementTypes";
import { normalizeJurisdictionDisplay } from "../../agreement/jurisdictionNormalize";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

export type AgreementReadySummaryDraftSource = Pick<
  AgreementDraft,
  | "title"
  | "parties"
  | "duration"
  | "due_date"
  | "payment_terms"
  | "jurisdiction"
  | "effective_date"
  | "purpose"
>;

export function agreementReadySummaryDraftFromParsed(parsed: ParsedDraftShape): AgreementReadySummaryDraftSource {
  return {
    title: parsed.title,
    jurisdiction: parsed.jurisdiction,
    parties: (parsed.parties || []).map((party, index) => ({
      id: party.id || `party-${index + 1}`,
      name: party.name,
      role: party.role,
      email: party.email || "",
    })),
    purpose: parsed.purpose,
    payment_terms: parsed.payment_terms,
    duration: parsed.duration,
    due_date: parsed.due_date,
    effective_date: parsed.effective_date,
  };
}

export type AgreementReadySummaryParty = {
  name: string;
  roleLabel: string;
};

export type AgreementReadySummaryModel = {
  title: string;
  parties: AgreementReadySummaryParty[];
  term: string | null;
  payment: string | null;
  governingLaw: string | null;
  effectiveDate: string | null;
  purpose: string | null;
  statusLabel: string;
};

function collapseWs(raw: string | null | undefined): string {
  return (raw || "").replace(/\s+/g, " ").trim();
}

export function formatPartyRoleLabel(role: string | null | undefined): string {
  const r = collapseWs(role);
  if (!r || /^party$/i.test(r)) return "";
  return r
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildAgreementReadySummaryModel(draft: AgreementReadySummaryDraftSource): AgreementReadySummaryModel {
  const title = collapseWs(draft.title) || "Agreement";
  const parties = (draft.parties || [])
    .map((p) => ({
      name: collapseWs(p.name),
      roleLabel: formatPartyRoleLabel(p.role),
    }))
    .filter((p) => p.name.length > 0);

  const term = collapseWs(draft.duration) || collapseWs(draft.due_date) || null;
  const payment = collapseWs(draft.payment_terms) || null;
  const jurisdictionRaw = collapseWs(draft.jurisdiction);
  const governingLaw = jurisdictionRaw ? normalizeJurisdictionDisplay(jurisdictionRaw) : null;
  const effectiveDate = collapseWs(draft.effective_date) || null;
  const purpose = collapseWs(draft.purpose) || null;

  return {
    title,
    parties,
    term,
    payment,
    governingLaw,
    effectiveDate,
    purpose,
    statusLabel: "Ready for review",
  };
}
