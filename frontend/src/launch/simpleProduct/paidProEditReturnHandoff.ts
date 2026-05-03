import type { AgreementDraft } from "../../agreement/agreementTypes";
import { looksLikeEmail, stripRecipientEmailNoise } from "../../components/agreements/recipientEmailValidation";
import type { PremiumSendIntent } from "./premiumSendIntent";
import { materialPremiumPipelineCorpusMaxLen } from "../../components/agreements/sendHandoffAuthoritativeCorpus";

const SESSION_KEY = "claw_paid_pro_edit_return_v1";

export type PaidProEditReturnHandoffV1 = {
  v: 1;
  agreementId: string;
  premiumSendIntent: PremiumSendIntent;
  savedAt: number;
};

function shortAgreementId(id: string): string {
  const t = id.trim();
  if (t.length <= 12) return t;
  return `${t.slice(0, 8)}…`;
}

function recipientEmailCountFromDraft(d: AgreementDraft | null | undefined): number {
  if (!d?.parties?.length) return 0;
  let n = 0;
  for (const p of d.parties) {
    const em = stripRecipientEmailNoise(String((p as { email?: string }).email ?? ""));
    if (looksLikeEmail(em)) n += 1;
  }
  return n;
}

export function logPaidProEditReturnWrite(payload: {
  agreementIdShort: string;
  hasPremiumDoc: boolean;
  docLen: number;
  partyCount: number;
  recipientEmailCount: number;
  intent: PremiumSendIntent;
}): void {
  // eslint-disable-next-line no-console
  console.info("[paid-pro-edit-return-write]", payload);
}

export function logPaidProEditReturnRead(payload: {
  agreementIdShort: string;
  hasPremiumDoc: boolean;
  docLen: number;
  partyCount: number;
  recipientEmailCount: number;
  intent: PremiumSendIntent;
}): void {
  // eslint-disable-next-line no-console
  console.info("[paid-pro-edit-return-read]", payload);
}

export function logPaidProEditReturnHydrated(payload: {
  agreementIdShort: string;
  createUiStage: string;
  createFlowPhase: string;
  displayPhase: string;
  hasPremiumDoc: boolean;
  docLen: number;
}): void {
  // eslint-disable-next-line no-console
  console.info("[paid-pro-edit-return-hydrated]", payload);
}

export function logPaidProEditReturnSkipBasicGenerate(reason: string, agreementIdShort: string): void {
  // eslint-disable-next-line no-console
  console.info("[paid-pro-edit-return-skip-basic-generate]", { reason, agreementIdShort });
}

export function writePaidProEditReturnHandoff(params: {
  agreementId: string;
  liveDraft: AgreementDraft | null;
  premiumSendIntent: PremiumSendIntent;
}): void {
  const id = String(params.agreementId || "").trim();
  if (!id) return;
  const d = params.liveDraft;
  const docLen = materialPremiumPipelineCorpusMaxLen(d);
  const hasPremiumDoc = docLen >= 500;
  const partyCount = Array.isArray(d?.parties) ? d!.parties!.length : 0;
  const recipientEmailCount = recipientEmailCountFromDraft(d);
  const payload: PaidProEditReturnHandoffV1 = {
    v: 1,
    agreementId: id,
    premiumSendIntent: params.premiumSendIntent,
    savedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  logPaidProEditReturnWrite({
    agreementIdShort: shortAgreementId(id),
    hasPremiumDoc,
    docLen,
    partyCount,
    recipientEmailCount,
    intent: params.premiumSendIntent,
  });
}

export function readPaidProEditReturnHandoff(): PaidProEditReturnHandoffV1 | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as PaidProEditReturnHandoffV1;
    if (o?.v !== 1 || !String(o.agreementId || "").trim()) return null;
    const intent = o.premiumSendIntent === "signature" || o.premiumSendIntent === "review" ? o.premiumSendIntent : null;
    if (!intent) return null;
    return {
      v: 1,
      agreementId: String(o.agreementId).trim(),
      premiumSendIntent: intent,
      savedAt: typeof o.savedAt === "number" ? o.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function clearPaidProEditReturnHandoff(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
