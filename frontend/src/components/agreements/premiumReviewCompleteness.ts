import { draftHasPlaceholderParties } from "./reviewPlaceholderGuard";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PREMIUM_JURISDICTION_PLACEHOLDER } from "./premiumDraftTransform";

export type PremiumCompletenessRow = {
  id: string;
  label: string;
  ok: boolean;
  hint?: string;
};

function nz(s: string | null | undefined): string {
  return (s || "").trim();
}

const VAGUE_PAY = /\b(to be agreed|tbd|as discussed|standard terms)\b/i;

export function computePremiumReviewCompleteness(
  draft: ParsedDraftShape | null,
  agreementDocumentText: string,
): PremiumCompletenessRow[] {
  const corpus = `${nz(agreementDocumentText)}\n${nz(draft?.purpose)}\n${nz(draft?.payment_terms)}`.toLowerCase();
  const partiesOk = Boolean(draft && !draftHasPlaceholderParties(draft));
  const pay = nz(draft?.payment_terms);
  const compensationOk = pay.length >= 12 && !VAGUE_PAY.test(pay);
  const termOk =
    Boolean(nz(draft?.duration) || nz(draft?.due_date) || nz(draft?.effective_date)) ||
    /\bterm|effective|until|notice period\b/i.test(corpus);
  const lawRaw = nz(draft?.jurisdiction);
  const governingOk =
    lawRaw.length >= 2 &&
    lawRaw !== PREMIUM_JURISDICTION_PLACEHOLDER &&
    !/^tbd$/i.test(lawRaw);
  const confidentialityOk = /\bconfidential|non-disclosure|nda\b/i.test(corpus);
  const ipOk = /\bintellectual property|\bip\b|work product|assignment|inventions|ownership of deliverables\b/i.test(
    corpus,
  );
  const signatureReady =
    partiesOk &&
    (draft?.parties?.length ?? 0) >= 2 &&
    nz(draft?.parties?.[0]?.name).length > 1 &&
    nz(draft?.parties?.[1]?.name).length > 1 &&
    /\b(sign|signature|electronically)\b/i.test(agreementDocumentText.toLowerCase());

  return [
    {
      id: "parties",
      label: "Party names",
      ok: partiesOk,
      hint: partiesOk ? undefined : "Replace placeholders with legal or business names.",
    },
    {
      id: "compensation",
      label: "Compensation",
      ok: compensationOk,
      hint: compensationOk ? undefined : "Clarify fees, milestones, or payment rhythm.",
    },
    {
      id: "term",
      label: "Term",
      ok: termOk,
      hint: termOk ? undefined : "Add duration, end date, or effective date.",
    },
    {
      id: "law",
      label: "Governing law",
      ok: governingOk,
      hint: governingOk ? undefined : "Pick governing law in the title block or jurisdiction field.",
    },
    {
      id: "confidentiality",
      label: "Confidentiality",
      ok: confidentialityOk,
      hint: confidentialityOk ? undefined : "Add if trade secrets or sensitive data are shared.",
    },
    {
      id: "ip",
      label: "IP / ownership",
      ok: ipOk,
      hint: ipOk ? undefined : "Confirm deliverables and IP assignment if work product is created.",
    },
    {
      id: "signature",
      label: "Signature ready",
      ok: signatureReady,
      hint: signatureReady ? undefined : "Finalize party names and keep the signing notice block.",
    },
  ];
}
