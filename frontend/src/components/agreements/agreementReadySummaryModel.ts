import type { AgreementDraft } from "../../agreement/agreementTypes";
import { normalizeJurisdictionDisplay } from "../../agreement/jurisdictionNormalize";

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

export function buildAgreementReadySummaryModel(draft: AgreementDraft): AgreementReadySummaryModel {
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
