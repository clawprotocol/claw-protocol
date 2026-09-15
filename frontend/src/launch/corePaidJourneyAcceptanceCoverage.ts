/**
 * Fail-closed contracts for Core Paid Journey acceptance.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CORE_PAID_JOURNEY_MATRIX } from "./corePaidJourneyAcceptanceMatrix";

const here = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

export function assertCorePaidJourneyAcceptanceContracts(): void {
  if (CORE_PAID_JOURNEY_MATRIX.length < 17) {
    throw new Error("core paid journey matrix lost required customer rows");
  }
  const ids = CORE_PAID_JOURNEY_MATRIX.map((row) => row.id);
  for (const required of [
    "I1_sparse_asks_targeted_questions",
    "Q1_article_matches_expected_facts",
    "A1_review_recipient_reads_correct_version",
    "B1_direct_sign_skips_mandatory_review",
    "C1_refresh_preserves_paper_version_path",
    "C3_fresh_context_editable_reopen",
    "C4_resume_apply_after_dashboard_reset",
    "C5_date_and_completion_meaning",
  ]) {
    if (!ids.includes(required as (typeof ids)[number])) {
      throw new Error(`core paid journey matrix missing ${required}`);
    }
  }

  const stub = src("../../../backend/llm_acceptance_stub.py");
  if (!stub.includes("acceptance_stub_enabled") || !stub.includes("Harbor Peak Analytics LLC")) {
    throw new Error("acceptance stub no longer binds to the declared Harbor/Ironvale facts");
  }
  if (!stub.includes("consulting_corpus_padded") || !stub.includes("PADDED_FILLER_REPEAT")) {
    throw new Error("padded stub negative fixture is missing");
  }
  if (!stub.includes("def _full_draft_response") || !stub.includes("_consulting_corpus()")) {
    throw new Error("acceptance stub no longer uses the non-padded positive corpus at the model boundary");
  }
  if (!stub.includes("def stub_legal_llm_completion")) {
    throw new Error("acceptance stub lost its completion entrypoint");
  }
  const jwks = src("../../../backend/jwt_acceptance_jwks.py");
  if (!jwks.includes("install_acceptance_jwks_fetch_if_configured") || !jwks.includes("ES256")) {
    throw new Error("acceptance JWKS stub no longer mocks the external identity boundary");
  }
  const router = src("../../../backend/llm_router.py");
  if (!router.includes("acceptance_stub_enabled") || !router.includes("stub_legal_llm_completion")) {
    throw new Error("call_legal_llm no longer honors the test-only acceptance stub");
  }

  const spec = src("../../e2e/core-paid-journey-live/corePaidJourneyAcceptance.live.spec.ts");
  if (spec.includes("PHASE4A_FROZEN_BODY") || spec.includes("seedDraftedCeremony")) {
    throw new Error("core paid journey live spec injects a ready draft or frozen snapshot");
  }
  if (
    !spec.includes("simple-pro-final-review-document") ||
    !spec.includes("paid-pro-visible-document-shell") ||
    !spec.includes("agreement-intake-clarification")
  ) {
    throw new Error("core paid journey live spec no longer inspects the interview and document article");
  }
  if (!spec.includes("simple-pro-send-for-review") || !spec.includes("simple-pro-send-for-signature")) {
    throw new Error("core paid journey live spec no longer exercises both owner choices");
  }
  if (!spec.includes("browser.newContext") || !spec.includes("/review?t=") || !spec.includes("/sign?t=")) {
    throw new Error("core paid journey live spec no longer opens recipient contexts with minted tokens");
  }
  if (!spec.includes("persistCorePaidJourneyRow") || !spec.includes("project:")) {
    throw new Error("core paid journey live spec no longer persists rows by project/test");
  }
  if (!spec.includes("operativeArticleFingerprint") || !spec.includes("recipient-approve")) {
    throw new Error("core paid journey live spec no longer compares operative hashes or server approval");
  }
  if (!spec.includes("data-snapshot-id") || !spec.includes("data-corpus-sha256") || !spec.includes("displayCompare")) {
    throw new Error("core paid journey live spec no longer binds review to snapshot id and server digest");
  }
  if (!spec.includes("timed_out_unexercised") || !spec.includes("CORE_PAID_RECIPIENT_VIEWPORTS")) {
    throw new Error("core paid journey live spec no longer instruments review timings or recipient viewports");
  }
  if (!spec.includes("mintedTokenForParticipant") || !spec.includes("first_unmet")) {
    throw new Error("core paid journey live spec no longer requires a participant-bound sign token");
  }
  if (
    !spec.includes("verifiedParticipantId") ||
    !spec.includes("CORE_PAID_JOURNEY_LIVE_API") ||
    !spec.includes("FACTS.parties[1].name") ||
    !spec.includes("FACTS.signers[1].name") ||
    spec.includes("[...byParty.values()][1]")
  ) {
    throw new Error("core paid journey live spec no longer selects Ironvale/Jordan by verified participant id");
  }
  if (!spec.includes("owner review token must not approve") || !spec.includes("priorOwnerTokenA1=partial_document_integrity_only")) {
    throw new Error("core paid journey live spec no longer preserves owner-approval rejection");
  }
  if (!spec.includes("recipient-accepted-awaiting-lock-root") || !spec.includes("Couldn't record approval")) {
    throw new Error("core paid journey live spec no longer asserts the post-approval confirmation surface");
  }
  if (!spec.includes("recipient-send-suggested-edits-confirm") || !spec.includes("Submit proposed update")) {
    throw new Error("core paid journey live spec no longer submits the painted proposal confirmation");
  }
  if (
    !spec.includes("awaitingOwner") ||
    !spec.includes("proposalId") ||
    !spec.includes("fetchOwnerPersistedProposalIds") ||
    spec.includes("submittedAck && serverProposal")
  ) {
    throw new Error("core paid journey live spec no longer asserts submitted/awaiting-owner state, proposal id, and persistence");
  }
  if (!spec.includes("owner-proposal-review-load-error") || !spec.includes("data-error-code")) {
    throw new Error("core paid journey live spec no longer records sanitized owner-review load errors");
  }
  if (!spec.includes("completeRequiredSignerCeremony") || !spec.includes("owner_sign_token_not_minted")) {
    throw new Error("core paid journey live spec no longer completes every required signer ceremony");
  }
  if (!spec.includes("ownerAlreadyOnSigningInvite") || !spec.includes("existingInvitationPage")) {
    throw new Error("core paid journey live spec no longer completes the owner ceremony on the actual signing invitation");
  }
  if (!spec.includes("Finalize signer details and continue to signing")) {
    throw new Error("core paid journey live spec no longer waits for the signing confirmation CTA");
  }
  if (
    !spec.includes("owner-proposal-accept-success") ||
    !spec.includes('expect(page.getByTestId("owner-proposal-accept-success")).toBeVisible') ||
    !spec.includes("expect(a4Pass")
  ) {
    throw new Error("core paid journey live spec no longer waits for owner apply success before refresh");
  }
  if (!spec.includes("/recipient-proposal") || !spec.includes("/signing-ceremony/complete")) {
    throw new Error("core paid journey live spec no longer requires durable proposal or signing server confirmation");
  }
  if (
    !spec.includes("/view-signed") ||
    !spec.includes("owner-signed-agreement-page") ||
    !spec.includes("data-completed-document-view")
  ) {
    throw new Error("core paid journey live spec no longer inspects the completed-document view");
  }
  if (!spec.includes("status: \"success\"") || !spec.includes("required fields absent")) {
    throw new Error("core paid journey live spec no longer returns explicit signer-setup results");
  }
  if (
    !spec.includes("canonical-review-snapshot") ||
    !spec.includes("LawDog home") ||
    !spec.includes("/app/create?agreementId=") ||
    !spec.includes("editable reopen after delayed complete save")
  ) {
    throw new Error("core paid journey live spec no longer delays the production snapshot save or reopens editable paper");
  }
  if (
    !spec.includes("fresh-context editable reopen restores persisted clarified paper") ||
    !spec.includes("resume and apply after dashboard session reset") ||
    !spec.includes("C3_fresh_context_editable_reopen") ||
    !spec.includes("C4_resume_apply_after_dashboard_reset") ||
    !spec.includes("C5_date_and_completion_meaning") ||
    !spec.includes("paid-draft-content-clarification-panel") ||
    !spec.includes("date-meaning-clarification-question") ||
    !spec.includes("completion-criteria-clarification-question") ||
    !spec.includes("dashboard-create-new-agreement") ||
    !spec.includes("fresh context must not inherit payment sessionStorage") ||
    !spec.includes('return "applied"') ||
    !spec.includes("isCanonicalSnapshotCreatePost") ||
    !spec.includes("readOptionalRoleAlert") ||
    !spec.includes("requireEditingAction") ||
    !spec.includes("simple-pro-edit-agreement-text-toggle") ||
    !spec.includes("simple-pro-edit-agreement-plain-input") ||
    !spec.includes("describeOperativeArticleCompare(\"canonical_get\"") ||
    spec.includes("snapshotRes.json().catch(() => ({}))") ||
    spec.includes("persisted.corpus || afterApply || postedCorpus") ||
    spec.includes("locator(\"[role='alert']\").first().textContent()")
  ) {
    throw new Error("core paid journey live spec no longer requires an independent C4 snapshot-create/GET/visible evidence chain");
  }

  const createResume = src("../components/agreements/paidCreateResumeHydration.ts");
  if (
    !createResume.includes("shouldAttemptCanonicalSnapshotOnCreateResume") ||
    !createResume.includes("resolvePaidCreateResumeCorpus") ||
    createResume.includes("draftPipelineCorpus.length >=")
  ) {
    throw new Error("create resume hydration still gates canonical snapshot GET on draft pipeline length");
  }
  const applyRecovery = src("../components/agreements/paymentClarificationApplyRecovery.ts");
  if (
    !applyRecovery.includes("resolvePaymentClarificationApplyPrerequisites") ||
    !applyRecovery.includes("authorized_draft") ||
    !applyRecovery.includes("paymentApplyPrerequisitesReady") ||
    !applyRecovery.includes("shouldReparseStructuredDraftFromRecoveredIntake")
  ) {
    throw new Error("payment Apply recovery no longer restores authorized intake and structured draft");
  }
  const applySession = src("../components/agreements/paymentClarificationSession.ts");
  if (
    !applySession.includes("resolveLivePaymentClarificationRevision") ||
    !applySession.includes("session:${agreementId}") ||
    !applySession.includes("readRecoveredPaymentClarificationAnswers") ||
    !applySession.includes("recoveredAnswersAgreeWithAuthorizedPaper") ||
    !applySession.includes("payment_clarification_stale_request") ||
    !applySession.includes("paymentApplyRequestedRevisionMatchesLive")
  ) {
    throw new Error("payment Apply no longer rebinds the live-paper handler after resume");
  }
  const revisionOp = src("../components/agreements/paidProRevisionOperation.ts");
  if (
    !revisionOp.includes("paidProRevisionOperationAllowsPersist") ||
    !revisionOp.includes("paidProRevisionOperationAllowsDisplay") ||
    !revisionOp.includes("readActivePaidProRevisionOperation")
  ) {
    throw new Error("paid revision operations no longer distinguish persist from display identity");
  }
  const revisionCommit = src("../components/agreements/paidProUserApprovedRevisionCommit.ts");
  if (
    !revisionCommit.includes("prepareCommercialReviewSnapshotAuthority") ||
    !revisionCommit.includes("paidProRevisionOperationAllowsPersist") ||
    !revisionCommit.includes("paidProRevisionOperationAllowsDisplay") ||
    !revisionCommit.includes("resolveOwnerApprovedRevisionCallerOutcome") ||
    !revisionCommit.includes("applyOwnerApprovedRevisionCallerDisplay")
  ) {
    throw new Error("paid revision commit no longer checks the active operation before shared mutations");
  }

  const intakeCaller = src("../components/agreements/AgreementBuilderIntake.tsx");
  if (
    !intakeCaller.includes("authorizedPaidProRevisionId") ||
    !intakeCaller.includes("resolveOwnerApprovedRevisionCallerOutcome") ||
    !intakeCaller.includes("applyOwnerApprovedRevisionCallerDisplay") ||
    !intakeCaller.includes("committed.displayed") ||
    intakeCaller.includes("setAgreementDocumentText(painted)")
  ) {
    throw new Error("production Apply caller no longer carries the persist/display result or still overrides displayed:false");
  }
  if (!intakeCaller.includes("authorizedPaidProRevisionId(getPaidProSourceOfTruthText())")) {
    throw new Error("Apply/resume revision identity still treats hashPaidProCorpus(\"\") as present");
  }

  const advisory = src("../components/agreements/PaymentClarificationAdvisory.tsx");
  if (!advisory.includes("authorizedPaidProRevisionId") || advisory.includes("hashPaidProCorpus(getPaidProSourceOfTruthText() || \"\")")) {
    throw new Error("payment advisory still treats the empty-corpus hash as a live revision");
  }
  const visibleShell = src("../components/agreements/paidProVisibleDocumentShell.tsx");
  if (!visibleShell.includes("PaidDraftContentAdvisory") || !visibleShell.includes("PaymentClarificationAdvisory")) {
    throw new Error("visible paid review shell no longer mounts date/completion clarification on the painted paper");
  }
  const openingGuard = src("../components/agreements/paidProOpeningRecitalGuard.ts");
  if (!openingGuard.includes("!/as\\s+of\\s+the\\s+Effective\\s+Date/i.test")) {
    throw new Error("opening repair no longer refuses to invent an undefined Effective Date on a named-party recital");
  }

  const observe = src("./corePaidJourneySnapshotObserve.ts");
  if (
    !observe.includes("isCanonicalSnapshotCreateUrl") ||
    !observe.includes("parseObservedJsonPayload") ||
    !observe.includes("readOptionalAlertFromCount")
  ) {
    throw new Error("C4 observation helpers no longer distinguish snapshot-create from sibling snapshot operations");
  }

  const meta = src("../agreement/recipientReviewAuthorityMeta.ts");
  if (!meta.includes("status !== \"pending\"") || meta.includes("if (!lockedVersionId ||")) {
    throw new Error("review authority meta still requires a signing lock for pre-lock review");
  }

  const signAuth = src("../agreement/recipientSigningLockedVersion.ts");
  if (signAuth.includes("if (lockSha && snapSha && lockSha !== snapSha)")) {
    throw new Error("sign paper authority still treats lock vs snapshot encoding mismatch as an expired invite");
  }

  const projection = src("../../../backend/services/recipient_draft_projection.py");
  if (
    !projection.includes("_recipient_visible_approval_audit") ||
    !projection.includes("_current_approval_revision_binding") ||
    !projection.includes('out["audit_log"] = approval_audit')
  ) {
    throw new Error("recipient projection no longer preserves the bound current-revision participant approval");
  }

  const normalize = src("../agreement/agreementDraftNormalize.ts");
  if (
    !normalize.includes("normalizeAcceptedReviewSnapshotFromApi") ||
    !normalize.includes("accepted_review_snapshot_v1") ||
    !normalize.includes("Placeholder scrub would")
  ) {
    throw new Error("draft normalize no longer preserves accepted snapshot corpus for signed-view authority");
  }

  const fetchDraft = src("../agreement/agreementWorkspaceApi.ts");
  if (
    !fetchDraft.includes("classifyFetchAgreementDraftFailure") ||
    !fetchDraft.includes("normalize_failed") ||
    !fetchDraft.includes("http_401")
  ) {
    throw new Error("fetchAgreementDraft no longer distinguishes HTTP, network, and normalize failures");
  }
  const lockFetch = fetchDraft.slice(fetchDraft.indexOf("export async function fetchAgreementDraftWithSigningLock"));
  if (!lockFetch.includes("refreshCachedAccessToken") || !lockFetch.includes("Authorization")) {
    throw new Error("signing-lock draft fetch no longer authenticates the owner the same way as draft GET");
  }

  const reviewPage = src("./simpleProduct/OwnerProposalReviewPage.tsx");
  if (!reviewPage.includes("authLoading") || !reviewPage.includes("data-error-code")) {
    throw new Error("owner proposal review no longer waits for auth or surfaces sanitized load errors");
  }

  const confirmation = src("../components/agreements/paidProSignatureConfirmationAuthority.ts");
  if (
    !confirmation.includes("emails_only") ||
    !confirmation.includes("missing_participant") ||
    !confirmation.includes("stale_agreement")
  ) {
    throw new Error("signature confirmation authority no longer rejects emails-only or stale bindings");
  }

  const intake = src("../components/agreements/AgreementBuilderIntake.tsx");
  if (
    !intake.includes("resolvePaidProSignatureConfirmationAuthority") ||
    /namesAndEmailsComplete:\s*[\s\S]{0,180}emailsReady/.test(intake)
  ) {
    throw new Error("direct signing still treats emailsReady as namesAndEmailsComplete");
  }
  if (intake.includes("if (productionResumeCorpus.length >= PAID_PRO_AUTHORITY_MIN_LEN)")) {
    throw new Error("create resume still skips canonical snapshot hydrate when draft pipeline fields are short");
  }
  if (
    !intake.includes("resolvePaidCreateResumeCorpus") ||
    !intake.includes("resolvePaymentClarificationApplyPrerequisites") ||
    !intake.includes("shouldReparseStructuredDraftFromRecoveredIntake") ||
    !intake.includes("readRecoveredPaymentClarificationAnswers") ||
    !intake.includes("setPaidProLiveRevisionView({") ||
    !intake.includes("hydrateCommercialReviewFromServerSnapshot({ agreementId: hid })") ||
    !intake.includes("resolvePaidCreateResumeDisplayPhase")
  ) {
    throw new Error("create resume / Apply no longer recover from authorized GET snapshot and draft");
  }

  const routerApi = src("../../../backend/routers/agreements_v2_api.py");
  if (
    !routerApi.includes("lock_authority_from_accepted_snapshot") ||
    !routerApi.includes("accepted_snapshot_digest") ||
    !routerApi.includes("recipient_review_revision_with_corpus") ||
    !routerApi.includes("_require_production_signing_lock_authority") ||
    !routerApi.includes("_issue_or_reuse_drafted_finalized_receipt") ||
    !routerApi.includes("legacy_pre_cutover") ||
    !routerApi.includes("verify_drafted_finalized_receipt") ||
    !routerApi.includes("receipt_pending") ||
    !routerApi.includes("receipt_unavailable")
  ) {
    throw new Error("signing lock no longer binds accepted snapshot id/digest onto the server lock");
  }

  const snap = src("../../../backend/services/accepted_review_snapshot.py");
  if (
    !snap.includes("current_review_revision_public") ||
    !snap.includes("assert_review_revision_binding") ||
    !snap.includes("review_snapshot_authority_required") ||
    !snap.includes("if resolve_err:") ||
    !snap.includes("assert_signing_lock_bound_to_snapshot") ||
    !snap.includes("assert_production_signing_lock_authority") ||
    !snap.includes("snapshot_agreement_mismatch") ||
    !snap.includes("is_pure_legacy_pre_cutover") ||
    !snap.includes("lock_authority_from_accepted_snapshot") ||
    !snap.includes("recipient_review_revision_with_corpus")
  ) {
    throw new Error("server review revision binding still bypasses missing snapshot authority");
  }

  const handoff = src("./simpleProduct/paidProPostRecipientSetupHandoff.ts");
  if (!handoff.includes("resolveOwnerSigningPartyId") || handoff.includes("for (const party of parties)")) {
    throw new Error("owner signing party id is no longer resolved from owner role");
  }
  if (!handoff.includes("lockAuthoritativeVersionAndMintSigningInvites")) {
    throw new Error("direct signing no longer locks then mints participant-bound invitations");
  }

  const lockInvite = src("./simpleProduct/paidProDirectSigningLockAndInvite.ts");
  if (
    !lockInvite.includes("isDurableSigningParticipantId") ||
    !lockInvite.includes("party_0") ||
    !lockInvite.includes("putSigningLock")
  ) {
    throw new Error("direct signing lock helper no longer rejects synthetic ids or locks before mint");
  }
  if (!handoff.includes('mode: "sign"') || !handoff.includes("requiredParticipantIds")) {
    throw new Error("direct signing no longer mints remaining participant-bound invitations after lock");
  }

  const persist = src("../../e2e/core-paid-journey-live/corePaidJourneyRowPersist.ts");
  if (
    !persist.includes("CORE_PAID_JOURNEY_REQUIRED_PROJECTS") ||
    !persist.includes("viewport_incomplete") ||
    !persist.includes("persistCorePaidJourneyArticleCompare")
  ) {
    throw new Error("row persist no longer requires desktop and mobile separately");
  }

  const matrix = src("./corePaidJourneyAcceptanceMatrix.ts");
  if (!matrix.includes("party_role:") || !matrix.includes("repetitive_filler:")) {
    throw new Error("article inspectors no longer verify party-to-role bindings or repetitive filler");
  }
  if (!matrix.includes("normalizeArticleWhitespace") || !matrix.includes("articlePresentationIssues")) {
    throw new Error("date presentation is no longer assessed separately from semantic fact checks");
  }
  if (!matrix.includes("operativeArticleFingerprint") || !matrix.includes("stripSignatureMetadataForOperativeCompare")) {
    throw new Error("article inspectors no longer fingerprint operative paper separately from signature metadata");
  }
  if (!matrix.includes("stripPresentationChromeForOperativeCompare") || !matrix.includes("describeOperativeArticleCompare")) {
    throw new Error("article inspectors no longer separate presentation chrome from operative wording");
  }

  if (
    !spec.includes("persistCorePaidJourneyArticleCompare") ||
    !spec.includes("describeOperativeArticleCompare") ||
    !spec.includes("sameOperative &&")
  ) {
    throw new Error("core paid journey live spec no longer fails closed on unresolved operative differences");
  }
  if (
    !spec.includes("/proof-status") ||
    !spec.includes("finalized_receipt") ||
    !spec.includes("required_participant_ids") ||
    !spec.includes("receiptBound") ||
    !spec.includes("accepted_snapshot") ||
    !spec.includes('status === "bound"')
  ) {
    throw new Error("core paid journey live spec no longer verifies the persisted receipt separately from the completed-document view");
  }
  if (spec.includes("/api/agreements/public/")) {
    throw new Error("core paid journey live spec still treats public verify as persisted receipt proof");
  }

  const recipientReview = src("../agreement/AgreementRecipientReview.tsx");
  if (
    !recipientReview.includes('renderReviewFirstCorpusHtml(snapPlain, "sign")') ||
    !recipientReview.includes("Agreement locked for signature") ||
    !recipientReview.includes("documentLifecycleBanner")
  ) {
    throw new Error("signing surface still hard-codes non-binding template chrome");
  }

  const signedView = src("./ownerSignedAgreementView.ts");
  if (
    !signedView.includes("accepted_snapshot") ||
    !signedView.includes("accepted_snapshot_digest") ||
    signedView.includes("if (fallback.length >= 80) {") ||
    signedView.includes('String(raw.corpusPlain || "").trim()')
  ) {
    throw new Error("owner signed view no longer requires lock-bound document authority");
  }

  const signedPage = src("./simpleProduct/OwnerSignedAgreementPage.tsx");
  if (
    !signedPage.includes("owner-signed-agreement-unavailable") ||
    !signedPage.includes("data-completed-document-view") ||
    !signedPage.includes("data-completed-view-surface")
  ) {
    throw new Error("owner signed page no longer labels the completed-document view or recovery");
  }

  if (signAuth.includes("if (!boundId || !/^[0-9a-f]{64}$/.test(boundDigest)) return true;") === false) {
    throw new Error("sign paper authority still treats locked_version_id alone as sufficient");
  }
  if (
    !signAuth.includes("legacyPreCutover") ||
    !signAuth.includes("Never infer legacy from absent fields")
  ) {
    throw new Error("sign paper authority still infers legacy from absent snapshot binding");
  }
}
