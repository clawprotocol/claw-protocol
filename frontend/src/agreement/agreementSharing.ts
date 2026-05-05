import type { AgreementDraft } from "./agreementTypes";
import { agreementPublicVerifyPath } from "./agreementPublicVerify";

export function publicVerifyAbsoluteUrl(agreementId: string): string {
  const path = agreementPublicVerifyPath(agreementId.trim());
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

/** Short, high-signal text for email / X / LinkedIn (includes private deal terms — share thoughtfully). */
export function buildAgreementSocialSummary(args: {
  draft: AgreementDraft;
  anonymizeParties?: boolean;
}): string {
  const id = String(args.draft.id || "").trim();
  const title = (args.draft.title || "Agreement").trim();
  const jurisdiction = (args.draft.jurisdiction || "").trim();
  const parties = args.draft.parties || [];
  const partyLine = args.anonymizeParties
    ? `${Math.max(parties.length, 2)} parties`
    : parties
        .map((p) => (p.name || "").trim())
        .filter(Boolean)
        .slice(0, 5)
        .join(" · ") || "Parties TBD";
  const purpose = (args.draft.purpose || "").trim().replace(/\s+/g, " ");
  const pay = (args.draft.payment_terms || "").trim().replace(/\s+/g, " ");
  const keyBits = [
    purpose ? (purpose.length > 140 ? `${purpose.slice(0, 137)}…` : purpose) : null,
    pay ? (pay.length > 120 ? `${pay.slice(0, 117)}…` : pay) : null,
  ].filter(Boolean);
  const when = args.draft.updated_at
    ? new Date(args.draft.updated_at).toLocaleString()
    : new Date().toLocaleString();
  const verify = id ? publicVerifyAbsoluteUrl(id) : "";
  return [
    `${title}${jurisdiction ? ` · ${jurisdiction}` : ""}`,
    `Parties: ${partyLine}`,
    keyBits.length ? `Key terms: ${keyBits.join(" · ")}` : null,
    `Record: ${when}`,
    verify ? `Status / proof link (LawDog): ${verify}` : "LawDog",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildVersionShareText(args: {
  agreementId: string;
  versionOrdinal: number;
  instruction: string;
  createdAt: string;
}): string {
  const verify = publicVerifyAbsoluteUrl(args.agreementId);
  const ins = args.instruction.trim().replace(/\s+/g, " ");
  const short = ins.length > 180 ? `${ins.slice(0, 177)}…` : ins;
  return [
    `LawDog · ${args.agreementId.slice(0, 12)}… · v${args.versionOrdinal}`,
    short ? `Note: ${short}` : null,
    `Saved: ${new Date(args.createdAt).toLocaleString()}`,
    `Public verify: ${verify}`,
  ]
    .filter(Boolean)
    .join("\n");
}
