/**
 * Test/production-parity harness for paidProInlineRecipientShell recipient fields.
 * Mirrors CreateFlowSendRecipientsPanel signaturePrepMode + signer name visibility.
 */
import React, { useState } from "react";
import {
  PAID_PRO_SIGNER_EMAIL_FIELD_WRAPPER_CLASS,
  PAID_PRO_SIGNER_EMAIL_INPUT_CLASS,
} from "./paidProPaidSessionLanding";
import {
  PAID_PRO_INLINE_SIGNER_SECTION_BODY,
  PAID_PRO_INLINE_SIGNER_SECTION_TITLE,
} from "./paidProInlineSignerSetupCopy";
import { formatPartySetupRowStatus } from "./paidProNPartySignerSetup";
import type { PremiumSendIntent } from "../../launch/simpleProduct/premiumSendIntent";
import type { SignerSetupPartyIdentity } from "./signerSetupPartyIdentity";
import { shouldShowRecipientEmailFormatError } from "./recipientEmailValidation";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

export type PaidProInlineSignerSetupPanelHarnessProps = {
  draft: ParsedDraftShape | null;
  effectivePremiumSendMode: PremiumSendIntent;
  paidProInlineRecipientShell?: boolean;
  nameEmailOnlySignerFields?: boolean;
  recipient1Name: string;
  setRecipient1Name: React.Dispatch<React.SetStateAction<string>>;
  recipient1Email: string;
  setRecipient1Email: React.Dispatch<React.SetStateAction<string>>;
  recipient2Name: string;
  setRecipient2Name: React.Dispatch<React.SetStateAction<string>>;
  recipient2Email: string;
  setRecipient2Email: React.Dispatch<React.SetStateAction<string>>;
  partySignerNames: string[];
  setPartySignerNames: React.Dispatch<React.SetStateAction<string[]>>;
  primaryCtaHelperText?: string | null;
  stripRecipientEmailNoise: (s: string) => string;
};

export function PaidProInlineSignerSetupPanelHarness({
  draft,
  effectivePremiumSendMode,
  paidProInlineRecipientShell = true,
  nameEmailOnlySignerFields = false,
  recipient1Name,
  setRecipient1Name,
  recipient1Email,
  setRecipient1Email,
  recipient2Name,
  setRecipient2Name,
  recipient2Email,
  setRecipient2Email,
  partySignerNames,
  setPartySignerNames,
  primaryCtaHelperText,
  stripRecipientEmailNoise,
}: PaidProInlineSignerSetupPanelHarnessProps) {
  const [recipientEmailTouched, setRecipientEmailTouched] = useState<Record<number, boolean>>({});
  const signaturePrepMode =
    effectivePremiumSendMode === "review"
      ? false
      : paidProInlineRecipientShell || effectivePremiumSendMode === "signature";
  const showOptionalSignerMetadataFields = signaturePrepMode && !nameEmailOnlySignerFields;

  const parties = [draft?.parties?.[0] ?? { name: "" }, draft?.parties?.[1] ?? { name: "" }];

  return (
    <div
      data-testid="paid-pro-inline-signer-setup-panel"
      className="rounded-xl border border-slate-700/50 bg-slate-950/90 p-4 sm:p-5"
      role="region"
      aria-label={PAID_PRO_INLINE_SIGNER_SECTION_TITLE}
    >
      <h2 className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
        {PAID_PRO_INLINE_SIGNER_SECTION_TITLE}
      </h2>
      <p className="mt-1 text-sm leading-snug text-slate-400">{PAID_PRO_INLINE_SIGNER_SECTION_BODY}</p>
      <div className="mt-4 space-y-4">
        {parties.map((_party, idx) => {
          const legalEntityValue = idx === 0 ? recipient1Name : recipient2Name;
          const emailVal = idx === 0 ? recipient1Email : recipient2Email;
          const signerNameVal = partySignerNames[idx] ?? "";
          return (
            <div
              key={`ag_party_recipient_${idx}`}
              className="rounded-lg border border-slate-700/45 bg-slate-950/30 p-3 sm:p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {formatPartySetupRowStatus({
                  partyIndex: idx,
                  legalEntity: legalEntityValue,
                  signerName: signerNameVal,
                  email: emailVal,
                  signaturePrepMode,
                })}
              </p>
              <label className="mt-3 block text-xs font-medium text-slate-400 sm:text-sm">
                {idx === 0 ? "Party 1 legal entity" : "Party 2 legal entity"}
                <input
                  type="text"
                  data-claw-recipient-field={idx === 0 ? "r1-name" : "r2-name"}
                  value={legalEntityValue}
                  onChange={(e) => (idx === 0 ? setRecipient1Name : setRecipient2Name)(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-600/70 bg-[#141d32] px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className={PAID_PRO_SIGNER_EMAIL_FIELD_WRAPPER_CLASS}>
                <span className="block">{idx === 0 ? "Signer 1 email" : "Signer 2 email"}</span>
                <input
                  type="email"
                  data-claw-recipient-field={idx === 0 ? "r1-email" : "r2-email"}
                  aria-label={idx === 0 ? "Signer 1 email" : "Signer 2 email"}
                  value={emailVal}
                  onChange={(e) => (idx === 0 ? setRecipient1Email : setRecipient2Email)(e.target.value)}
                  onBlur={() => setRecipientEmailTouched((prev) => ({ ...prev, [idx]: true }))}
                  className={PAID_PRO_SIGNER_EMAIL_INPUT_CLASS}
                />
                {shouldShowRecipientEmailFormatError(stripRecipientEmailNoise(emailVal), {
                  touched: recipientEmailTouched[idx],
                }) ? (
                  <span className="mt-1 block text-[10px] text-amber-200/90">Invalid email</span>
                ) : null}
              </label>
              {signaturePrepMode ? (
                <>
                  <label className="mt-3 block text-xs font-medium text-slate-400 sm:text-sm">
                    <span className="block">Signer name</span>
                    <input
                      type="text"
                      data-claw-recipient-field={idx === 0 ? "r1-signer-name" : "r2-signer-name"}
                      value={signerNameVal}
                      onChange={(e) =>
                        setPartySignerNames((prev) => {
                          const next = [...prev];
                          while (next.length <= idx) next.push("");
                          next[idx] = e.target.value;
                          return next;
                        })
                      }
                      className="mt-1 w-full rounded-md border border-slate-600/70 bg-[#141d32] px-3 py-2 text-sm text-slate-100"
                      autoComplete="name"
                    />
                  </label>
                  {showOptionalSignerMetadataFields ? (
                    <label className="mt-3 block text-xs font-medium text-slate-400 sm:text-sm">
                      Signer title (optional)
                      <input type="text" readOnly value="" className="mt-1 w-full" />
                    </label>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      {primaryCtaHelperText ? (
        <p className="mt-3 text-sm leading-snug text-amber-200/90" role="note">
          {primaryCtaHelperText}
        </p>
      ) : null}
    </div>
  );
}

export type { SignerSetupPartyIdentity };
