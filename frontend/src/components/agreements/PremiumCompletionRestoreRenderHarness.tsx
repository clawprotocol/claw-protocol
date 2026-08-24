/**
 * RTL harness mirroring post-payment premiumCompletion restore signer headings + review plain.
 */
import { useEffect, useMemo, useState } from "react";
import { repairCheckoutBackRestoreDraftParties } from "./checkoutBackRestore";
import { PaidProCanonicalPlainReviewDocument } from "./paidProCanonicalPlainReviewDocument";
import { PAID_PRO_REVIEW_DOCUMENT_TAIL_PADDING_CLASS } from "./paidProReviewLayoutConstants";
import { resolvePaidProFirstReviewVisibleDisplayPlain } from "./paidProFirstReviewDisplayAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  resolveSignerSetupAutoCorrectTarget,
  resolveSignerSetupPartyHeadingLine,
  resolveSignerSetupPartyIdentities,
  resolveSignerSetupRenderSlot,
} from "./signerSetupPartyIdentity";

export type PremiumCompletionRestoreRenderHarnessProps = {
  intakeText: string;
  draft: ParsedDraftShape;
  agreementBodyText: string;
  initialRecipient1Name: string;
  initialRecipient2Name: string;
  premiumCheckoutCompleted?: boolean;
  premiumPaidDocumentSurface?: boolean;
  paidProActive?: boolean;
};

function PartySignerRow(props: {
  slotIndex: number;
  legalEntityValue: string;
  onLegalEntityChange: (value: string) => void;
  slotIdentities: ReturnType<typeof resolveSignerSetupPartyIdentities>;
}) {
  const signerRenderSlot = resolveSignerSetupRenderSlot({
    slotIndex: props.slotIndex,
    currentLegalEntityValue: props.legalEntityValue,
    slotIdentities: props.slotIdentities,
    source: "signer_setup_input_render",
  });
  const partyLine = resolveSignerSetupPartyHeadingLine({
    slotIndex: props.slotIndex,
    legalEntityValue: props.legalEntityValue,
    signerRenderSlot,
    slotIdentities: props.slotIdentities,
  });
  const label = props.slotIndex === 0 ? "Party 1 legal entity" : "Party 2 legal entity";
  const fieldId = props.slotIndex === 0 ? "r1-name" : "r2-name";

  return (
    <div data-testid={`premium-restore-party-row-${props.slotIndex}`}>
      <p className="mt-1 text-sm font-semibold" data-testid={`premium-restore-party-heading-${props.slotIndex}`}>
        {partyLine}
      </p>
      <label>
        {label}
        <input
          type="text"
          data-claw-recipient-field={fieldId}
          data-testid={`premium-restore-party-input-${props.slotIndex}`}
          value={props.legalEntityValue}
          onChange={(e) => props.onLegalEntityChange(e.target.value)}
        />
      </label>
    </div>
  );
}

export function PremiumCompletionRestoreRenderHarness({
  intakeText,
  draft,
  agreementBodyText,
  initialRecipient1Name,
  initialRecipient2Name,
  premiumCheckoutCompleted = true,
  premiumPaidDocumentSurface = true,
  paidProActive = true,
}: PremiumCompletionRestoreRenderHarnessProps) {
  const [recipient1Name, setRecipient1Name] = useState(initialRecipient1Name);
  const [recipient2Name, setRecipient2Name] = useState(initialRecipient2Name);

  const resolvedIntakeText = intakeText.trim();
  const repairedDraft = useMemo(
    () =>
      resolvedIntakeText.length >= 20
        ? repairCheckoutBackRestoreDraftParties(draft, resolvedIntakeText)
        : draft,
    [draft, resolvedIntakeText],
  );

  const signerSetupPartyIdentities = useMemo(
    () =>
      resolveSignerSetupPartyIdentities({
        parties: repairedDraft.parties,
        intakeText: resolvedIntakeText,
        agreementBodyText,
      }),
    [repairedDraft.parties, resolvedIntakeText, agreementBodyText],
  );

  useEffect(() => {
    const target0 = resolveSignerSetupAutoCorrectTarget({
      slotIndex: 0,
      currentRecipientName: recipient1Name,
      slotIdentities: signerSetupPartyIdentities,
      corpusHash: "harness",
    });
    if (target0) setRecipient1Name(target0);
    const target1 = resolveSignerSetupAutoCorrectTarget({
      slotIndex: 1,
      currentRecipientName: recipient2Name,
      slotIdentities: signerSetupPartyIdentities,
      corpusHash: "harness",
    });
    if (target1) setRecipient2Name(target1);
  }, [signerSetupPartyIdentities, recipient1Name, recipient2Name]);

  const visiblePlain = resolvePaidProFirstReviewVisibleDisplayPlain({
    draft: repairedDraft,
    intakeText: resolvedIntakeText,
    premiumCheckoutCompleted,
    premiumPaidDocumentSurface,
    paidProActive,
  }).plain;

  return (
    <div data-testid="premium-completion-restore-harness">
      <section data-testid="premium-restore-signer-setup">
        <PartySignerRow
          slotIndex={0}
          legalEntityValue={recipient1Name}
          onLegalEntityChange={setRecipient1Name}
          slotIdentities={signerSetupPartyIdentities}
        />
        <PartySignerRow
          slotIndex={1}
          legalEntityValue={recipient2Name}
          onLegalEntityChange={setRecipient2Name}
          slotIdentities={signerSetupPartyIdentities}
        />
      </section>
      <PaidProCanonicalPlainReviewDocument
        plain={visiblePlain}
        tailPaddingClass={PAID_PRO_REVIEW_DOCUMENT_TAIL_PADDING_CLASS}
        compactTopPadding
        authoritativeSource="premium_completion_restore_harness"
      />
    </div>
  );
}
