/**
 * Phase 4C.2.3 contracts — server-confirmed recipient completion, versioned consent.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertPhase4c22QuickReceiptIntegrityContracts } from "./phase4c22QuickReceiptIntegrityCoverage";
import {
  ESIGN_CONSENT_ACTION,
  ESIGN_CONSENT_INTENT_STATEMENT,
  ESIGN_CONSENT_INTENT_VERSION,
} from "../compliance/disclosureCopy";
import {
  RECIPIENT_COMPLETION_FATAL_MESSAGE,
  RECIPIENT_COMPLETION_RETRY_MESSAGE,
  confirmDraftedCeremonyCompletion,
  confirmRecipientCompletionResponse,
  recipientCompletionIsFatal,
  recipientCompletionIsRetryable,
  versionedRecipientConsentIntent,
} from "../vs01/vs01RecipientCompletionContract";

const here = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

export function assertPhase4c23RecipientCompletionTruthContracts(): void {
  assertPhase4c22QuickReceiptIntegrityContracts();
  const intent = versionedRecipientConsentIntent();
  if (intent.intent_version !== ESIGN_CONSENT_INTENT_VERSION) {
    throw new Error("4C.2.3 lost the versioned consent intent");
  }
  if (intent.action !== ESIGN_CONSENT_ACTION || intent.intent_statement !== ESIGN_CONSENT_INTENT_STATEMENT) {
    throw new Error("4C.2.3 consent statement drifted from disclosure copy");
  }
  if (!recipientCompletionIsRetryable(503, "network_retryable") || !recipientCompletionIsFatal("invalid_token")) {
    throw new Error("4C.2.3 lost retryable/fatal completion classification");
  }
  if (!/Agree and sign/.test(RECIPIENT_COMPLETION_RETRY_MESSAGE)) {
    throw new Error("4C.2.3 retry copy no longer names Agree and sign");
  }
  if (!/new link/.test(RECIPIENT_COMPLETION_FATAL_MESSAGE)) {
    throw new Error("4C.2.3 fatal copy no longer asks for a new link");
  }

  const wizard = src("../vs01/Vs01Wizard.tsx");
  if (wizard.includes("setRecipientSigningFinished(true);\n                const aid")) {
    throw new Error("Vs01Wizard still marks recipient success before server confirmation");
  }
  if (!wizard.includes("if (!result.serverSynced)")) {
    throw new Error("Vs01Wizard no longer requires serverSynced before success");
  }
  if (!wizard.includes("signerAlreadyCompleted")) {
    throw new Error("Vs01Wizard no longer restores server-confirmed success on refresh");
  }

  const view = src("../vs01/RecipientSigningView.tsx");
  if (!view.includes("Agree and sign") || !view.includes("esign-recipient-consent")) {
    throw new Error("RecipientSigningView lost affirmative consent or Agree and sign");
  }
  if (view.includes(">Finish signing<")) {
    throw new Error("RecipientSigningView still uses Finish signing as the primary action");
  }

  const review = src("../agreement/AgreementRecipientReview.tsx");
  if (!review.includes("Agree and sign") || !review.includes("recipient-sign-consent")) {
    throw new Error("AgreementRecipientReview lost affirmative consent or Agree and sign");
  }
  if (!review.includes("confirmDraftedCeremonyCompletion")) {
    throw new Error("AgreementRecipientReview no longer confirms the ceremony completion response");
  }

  const sync = src("../vs01/vs01SignerCompletionSync.ts");
  if (!sync.includes("assigned_fields") || !sync.includes("consent")) {
    throw new Error("Completion sync no longer sends the typed field/consent contract");
  }
  if (!sync.includes("confirmRecipientCompletionResponse")) {
    throw new Error("Completion sync no longer validates the server completion confirmation");
  }
  if (
    confirmRecipientCompletionResponse({
      agreementId: "ag",
      documentId: "doc",
      signerRoleId: "role",
      completion: { status: "completed", agreement_id: "other" },
    })
  ) {
    throw new Error("4C.2.3 accepts a completion confirmation for the wrong agreement");
  }
  if (
    confirmRecipientCompletionResponse({
      agreementId: "ag",
      documentId: "doc",
      signerRoleId: "role",
      completion: { status: "completed" },
    })
  ) {
    throw new Error("4C.2.3 accepts HTTP 200 without matching agreement/document/signer confirmation");
  }
  if (
    !confirmRecipientCompletionResponse({
      agreementId: "ag",
      documentId: "doc",
      signerRoleId: "role",
      participantId: "p1",
      packetRevision: "qpk_1",
      completion: {
        status: "completed",
        agreement_id: "ag",
        document_id: "doc",
        signer_role_id: "role",
        participant_id: "p1",
        packet_revision: "qpk_1",
      },
    })
  ) {
    throw new Error("4C.2.3 rejects a matching completion confirmation");
  }
  if (
    confirmDraftedCeremonyCompletion({
      agreementId: "ag",
      participantId: "p1",
      response: { ok: true, agreement_id: "ag" },
    })
  ) {
    throw new Error("4C.2.3 accepts a drafted ceremony 200 without participant/signed_at confirmation");
  }
}
