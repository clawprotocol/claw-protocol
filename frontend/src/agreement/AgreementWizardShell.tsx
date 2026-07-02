import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLaunchNav } from "../launch/LaunchNavContext";
import AgreementBuilderIntake, {
  clearAgreementCreatorIntakeStorage,
} from "../components/agreements/AgreementBuilderIntake";
import AgreementReview, { type AgreementReviewSection } from "../components/agreements/AgreementReview";
import { AgreementReviewErrorBoundary } from "./AgreementReviewErrorBoundary";
import {
  bundleForWorkspaceRow,
  clampAgreementWizardStepAfterHydrate,
  normalizeLifecycleForOpen,
  resolveAgreementEntryRouteWithFallback,
  type AgreementCreatorPrepState,
  type AgreementWorkspaceEntryMode,
} from "./agreementLifecycle";
import { MyAgreementsLanding } from "./MyAgreementsLanding";
import { isAgreementDetailsStepReady } from "./agreementDraftNormalize";
import type { AgreementDraft } from "./agreementTypes";
import {
  fetchAgreementAuditSignedFlag,
  fetchAgreementDraft,
  type WorkspaceIndexAgreement,
} from "./agreementWorkspaceApi";
import { useAccess } from "../access/AccessContext";
import type { GateResult } from "../access/types";
import { UpgradeLimitNotice } from "../components/access/UpgradeLimitNotice";
import { logProductEvent } from "../lib/experimentation/productEvents";
import {
  readLawDogUserMonetizationState,
  shouldBlockSecondAgreementCreation,
} from "../monetization/lawDogMonetization";
import { UpgradeToProModal } from "../monetization/UpgradeToProModal";
import { AgreementMemoryAgreementStrip } from "./AgreementMemoryAgreementStrip";
import { PaidProVs01WorkspaceBanner } from "./PaidProVs01WorkspaceBanner";
import { readPaidProVs01PostSignHandoff } from "../vs01/vs01PaidProPostSignHandoff";

function adjacentWizardSteps(
  current: number,
  allowedSteps: number[] | null,
  stepCount: number
): { prev: number; next: number } {
  if (!allowedSteps || allowedSteps.length === 0) {
    return {
      prev: Math.max(1, current - 1),
      next: Math.min(stepCount - 1, current + 1),
    };
  }
  const idx = allowedSteps.indexOf(current);
  const prev = idx <= 0 ? current : allowedSteps[idx - 1]!;
  const next = idx < 0 || idx >= allowedSteps.length - 1 ? current : allowedSteps[idx + 1]!;
  return { prev, next };
}

const STEPS: { id: number; label: string; section: AgreementReviewSection | null }[] = [
  { id: 0, label: "Start", section: null },
  { id: 1, label: "Agreement details", section: "details" },
  { id: 2, label: "Negotiate draft", section: "draft" },
  { id: 3, label: "Recipients", section: "recipients" },
  { id: 4, label: "Finalize", section: "finalize" },
];

const STEP_INTRO: { title: string; subtitle: string }[] = [
  {
    title: "Structured draft from your input",
    subtitle:
      "Describe the deal in plain language — review and refine the structured draft, then continue to send or sign when ready.",
  },
  { title: "Agreement details", subtitle: "Confirm the basics and who’s involved." },
  {
    title: "Negotiate the draft",
    subtitle: "Propose revisions, compare versions, and track changes with recipients.",
  },
  {
    title: "Recipients",
    subtitle: "Who signs, who reviews, and who gets a copy — before signatures.",
  },
  {
    title: "Finalize",
    subtitle: "Lock a version for signing when the negotiation is stable.",
  },
];

type WizardBootState = "idle" | "loading_saved" | "ready" | "error";

export type AgreementWizardShellProps = {
  /** Open step-0 wizard immediately (e.g. /app/agreements/new). */
  startFreshWizard?: boolean;
  /** Hydrate an existing agreement from the server (e.g. /app/agreements/:id). */
  openAgreementId?: string | null;
};

/** Wraps intake + review with a VS01-style stepper; uses existing /api/agreements/* only. */
export function AgreementWizardShell(props: AgreementWizardShellProps = {}) {
  const { startFreshWizard = false, openAgreementId = null } = props;
  const { search } = useLaunchNav();
  const access = useAccess();
  const [workspaceMode, setWorkspaceMode] = useState<"landing" | "wizard">("landing");
  const [step, setStep] = useState(0);
  const [agreementId, setAgreementId] = useState<string | null>(null);
  const [allowedSteps, setAllowedSteps] = useState<number[] | null>(null);
  const [workspaceEntryMode, setWorkspaceEntryMode] = useState<AgreementWorkspaceEntryMode>("default");
  /** True only after successful create (intake) or successful GET hydrate when opening saved. */
  const [wizardDraftReady, setWizardDraftReady] = useState(false);
  const [wizardBoot, setWizardBoot] = useState<WizardBootState>("idle");
  const [openHydrateError, setOpenHydrateError] = useState<string | null>(null);
  const [intakeResumeNotice, setIntakeResumeNotice] = useState<string | null>(null);
  const [creatorPrepState, setCreatorPrepState] = useState<AgreementCreatorPrepState>("intake");
  /** Seeds AgreementReview on first paint after create to avoid fetch-before-ready races. */
  const [reviewPrimedDraft, setReviewPrimedDraft] = useState<AgreementDraft | null>(null);
  /** Create succeeded server-side but client hydrate failed; offer Retry from Step 1. */
  const [postCreateRetryId, setPostCreateRetryId] = useState<string | null>(null);
  const lastOpenedRowRef = useRef<WorkspaceIndexAgreement | null>(null);
  const agreementIdRef = useRef<string | null>(null);
  const [openingFromList, setOpeningFromList] = useState(false);
  const [landingWorkspaceCount, setLandingWorkspaceCount] = useState(0);
  const [landingNotice, setLandingNotice] = useState<GateResult | null>(null);
  const [monetizationPaywallOpen, setMonetizationPaywallOpen] = useState(false);
  const launchBootRef = useRef(false);

  agreementIdRef.current = agreementId;

  const postVs01SignatureFirstLanding = useMemo(() => {
    try {
      const q = new URLSearchParams(search || (typeof window !== "undefined" ? window.location.search : ""));
      if (q.get("vs01_saved") === "1" || q.get("vs01_packet_ready") === "1") return true;
    } catch {
      /* ignore */
    }
    const aid = agreementId?.trim();
    if (aid && readPaidProVs01PostSignHandoff(aid)) return true;
    return false;
  }, [search, agreementId, wizardBoot]);

  useEffect(() => {
    if (!postVs01SignatureFirstLanding || !agreementId?.trim() || wizardBoot !== "ready") return;
    let packet = false;
    try {
      const q = new URLSearchParams(search || (typeof window !== "undefined" ? window.location.search : ""));
      packet = q.get("vs01_packet_ready") === "1";
    } catch {
      /* ignore */
    }
    if (packet) {
      // eslint-disable-next-line no-console
      console.info("[flow] dashboard_landing_packet_ready", { agreementId: agreementId.trim() });
    } else {
      // eslint-disable-next-line no-console
      console.info("[flow] dashboard_landing_post_sign", { agreementId: agreementId.trim() });
    }
  }, [postVs01SignatureFirstLanding, agreementId, wizardBoot, search]);

  const stepCount = STEPS.length;

  const goToLanding = useCallback(() => {
    setWorkspaceMode("landing");
    setAgreementId(null);
    setStep(0);
    setAllowedSteps(null);
    setWorkspaceEntryMode("default");
    setWizardDraftReady(false);
    setWizardBoot("idle");
    setOpenHydrateError(null);
    setIntakeResumeNotice(null);
    setReviewPrimedDraft(null);
    setPostCreateRetryId(null);
  }, []);

  const hydrateAndRouteSaved = useCallback(async (row: WorkspaceIndexAgreement) => {
    const rid = String(row.id || "").trim();
    if (!rid) return;

    setWorkspaceMode("wizard");
    setWizardBoot("loading_saved");
    setWizardDraftReady(false);
    setOpenHydrateError(null);
    setIntakeResumeNotice(null);
    setAgreementId(null);
    setStep(0);

    const { ok, draft } = await fetchAgreementDraft(rid);
    if (!ok || !draft?.id) {
      console.error("[AgreementWizard] hydrate failed", rid);
      setWizardBoot("error");
      setOpenHydrateError("Unable to load agreement. Check your connection and try again.");
      setAgreementId(null);
      setIntakeResumeNotice(
        "We couldn’t restore the draft setup exactly. Review the prompt below and continue."
      );
      setStep(0);
      setAllowedSteps(null);
      setWorkspaceEntryMode("default");
      return;
    }

    console.log("[AgreementWizard] hydrate success", rid);

    const bundle = bundleForWorkspaceRow(rid);
    const auditSigned = await fetchAgreementAuditSignedFlag(rid);
    const effectiveRow: WorkspaceIndexAgreement =
      auditSigned && !row.completed_signed ? { ...row, completed_signed: true } : row;
    const lc = normalizeLifecycleForOpen(effectiveRow, bundle);
    let route = resolveAgreementEntryRouteWithFallback(effectiveRow, bundle, lc, { hydratedDraft: draft });
    route = clampAgreementWizardStepAfterHydrate(route, draft, bundle);

    setAgreementId(rid);
    setAllowedSteps(route.allowedSteps);
    setWorkspaceEntryMode(route.entryMode);
    setStep(route.step);
    setWizardDraftReady(true);
    setWizardBoot("ready");
  }, []);

  const onOpenSaved = useCallback(
    (row: WorkspaceIndexAgreement) => {
      const rid = String(row.id || "").trim();
      if (!rid) {
        console.warn("[AgreementWizard] onOpenSaved: missing row id");
        return;
      }
      lastOpenedRowRef.current = row;
      console.log("[AgreementWizard] opening saved agreement", rid);
      setOpeningFromList(true);
      void (async () => {
        try {
          await hydrateAndRouteSaved(row);
          console.log("[AgreementWizard] open complete", rid);
        } catch (e) {
          console.error("[AgreementWizard] open failed", rid, e);
          setWorkspaceMode("wizard");
          setWizardBoot("error");
          setOpenHydrateError("Something went wrong opening this agreement.");
          setAgreementId(null);
          setStep(0);
          setIntakeResumeNotice(
            "We couldn’t restore the draft setup exactly. Review the prompt below and continue."
          );
          setWizardDraftReady(false);
        } finally {
          setOpeningFromList(false);
        }
      })();
    },
    [hydrateAndRouteSaved]
  );

  useEffect(() => {
    if (launchBootRef.current) return;
    const oid = String(openAgreementId || "").trim();
    if (oid) {
      launchBootRef.current = true;
      const row: WorkspaceIndexAgreement = {
        id: oid,
        title: "",
        updated_at: new Date().toISOString(),
        party_count: 0,
        signer_count: 0,
        version_ledger_count: 0,
        completed_signed: false,
        has_server_signing_lock: false,
        locked_version_id: null,
        workspace_archived_at: null,
        review_sent_at: null,
      };
      onOpenSaved(row);
      return;
    }
    if (startFreshWizard) {
      launchBootRef.current = true;
      const g = access.check("create_agreement", {
        activeWorkspaceAgreements: landingWorkspaceCount,
      });
      if (!g.allowed) {
        setLandingNotice(g);
        launchBootRef.current = false;
        return;
      }
      const monUser = readLawDogUserMonetizationState(access.tier, access.usage);
      if (shouldBlockSecondAgreementCreation(monUser)) {
        launchBootRef.current = false;
        logProductEvent("paywall_triggered", { surface: "agreement_wizard_new", reason: "free_second_agreement" });
        setMonetizationPaywallOpen(true);
        return;
      }
      setLandingNotice(null);
      clearAgreementCreatorIntakeStorage();
      setAgreementId(null);
      setStep(0);
      setAllowedSteps(null);
      setWorkspaceEntryMode("default");
      setWizardDraftReady(false);
      setWizardBoot("idle");
      setOpenHydrateError(null);
      setIntakeResumeNotice(null);
      setReviewPrimedDraft(null);
      setPostCreateRetryId(null);
      setWorkspaceMode("wizard");
    }
  }, [
    startFreshWizard,
    openAgreementId,
    onOpenSaved,
    access,
    access.tier,
    access.usage,
    landingWorkspaceCount,
  ]);

  const retryOpenSaved = useCallback(() => {
    const row = lastOpenedRowRef.current;
    if (!row) return;
    setOpeningFromList(true);
    void (async () => {
      try {
        await hydrateAndRouteSaved(row);
      } finally {
        setOpeningFromList(false);
      }
    })();
  }, [hydrateAndRouteSaved]);

  const onCreated = useCallback((id: string, primedDraft: AgreementDraft) => {
    const tid = String(id || "").trim();
    if (!tid) {
      console.error("[AgreementWizard] onCreated: backend did not return a valid agreement_id");
      return;
    }
    if (!isAgreementDetailsStepReady(primedDraft, tid)) {
      console.error("[AgreementWizard] onCreated: primed draft failed details-step invariant", tid);
      setPostCreateRetryId(tid);
      setIntakeResumeNotice(
        "We couldn't prepare your agreement for editing. Your description is saved below — try Retry loading or Generate draft again."
      );
      return;
    }
    console.log("[AgreementWizard] draft_ready after create + hydrate", tid, {
      parties: primedDraft.parties?.length ?? 0,
      hasVersions: Array.isArray(primedDraft.versions),
    });
    setPostCreateRetryId(null);
    setReviewPrimedDraft(primedDraft);
    setWizardDraftReady(true);
    setWizardBoot("ready");
    setOpenHydrateError(null);
    setIntakeResumeNotice(null);
    setAgreementId(tid);
    setStep(1);
    setAllowedSteps(null);
    setWorkspaceEntryMode("default");
    access.recordUsage("agreements_created");
  }, [access]);

  const onCreateHydrateFailed = useCallback((failedId: string) => {
    const tid = String(failedId || "").trim();
    if (!tid) return;
    console.warn("[AgreementWizard] create hydrate failed — retry id preserved", tid);
    setPostCreateRetryId(tid);
    setWizardDraftReady(false);
    setReviewPrimedDraft(null);
    setAgreementId(null);
    setStep(0);
    setAllowedSteps(null);
  }, []);

  const onRetryHydrateCreate = useCallback(async (retryId: string) => {
    const tid = String(retryId || "").trim();
    if (!tid) return;
    console.log("[AgreementWizard] retry hydrate for post-create", tid);
    const { ok, draft } = await fetchAgreementDraft(tid);
    const ready = Boolean(draft && isAgreementDetailsStepReady(draft, tid));
    console.log("[AgreementWizard] retry hydrate result", { ok, ready });
    if (ok && draft && ready) {
      onCreated(tid, draft);
    } else {
      setIntakeResumeNotice("Still couldn't load this agreement. Check your connection, or open it from My agreements.");
    }
  }, [onCreated]);

  const clearReviewPrimedDraft = useCallback(() => {
    console.log("[AgreementWizard] canonical AgreementReview load complete — dropping primed snapshot");
    setReviewPrimedDraft(null);
  }, []);

  const handleWorkspaceDetailsNotReady = useCallback(() => {
    const aid = String(agreementIdRef.current || "").trim();
    console.warn("[AgreementWizard] Agreement details guard: redirect to Step 1", aid || "(no id)");
    setWizardDraftReady(false);
    setReviewPrimedDraft(null);
    if (aid) setPostCreateRetryId(aid);
    setAgreementId(null);
    setStep(0);
    setIntakeResumeNotice(
      "We couldn't show agreement details yet. Your description is saved below — Retry loading or Generate draft again."
    );
  }, []);

  useEffect(() => {
    if (workspaceMode !== "wizard") return;
    if (step > 0 && !agreementId?.trim()) {
      console.warn("[AgreementWizard] invariant: step > 0 without agreementId — resetting to Start");
      setStep(0);
    }
  }, [workspaceMode, step, agreementId]);

  useEffect(() => {
    if (wizardDraftReady && step > 0 && wizardBoot === "ready") {
      setCreatorPrepState("draft_ready");
    }
  }, [wizardDraftReady, step, wizardBoot]);

  const currentSection = STEPS[step]?.section ?? null;
  const canOpenStep = useCallback(
    (target: number) => {
      if (target === 0) return !agreementId;
      if (!agreementId?.trim()) return false;
      if (!wizardDraftReady) return false;
      if (wizardBoot !== "ready") return false;
      if (allowedSteps && allowedSteps.length > 0) {
        return allowedSteps.includes(target);
      }
      return true;
    },
    [agreementId, allowedSteps, wizardDraftReady, wizardBoot]
  );

  const guardedSetStep = useCallback(
    (target: number) => {
      if (!canOpenStep(target)) {
        console.warn("[AgreementWizard] blocked step", target, {
          wizardDraftReady,
          wizardBoot,
          agreementId,
        });
        return;
      }
      setStep(target);
    },
    [canOpenStep, wizardBoot, wizardDraftReady, agreementId]
  );

  const ownerJumpToRecipientsStep = useCallback(() => {
    guardedSetStep(3);
  }, [guardedSetStep]);

  const reviewSection = useMemo((): AgreementReviewSection | undefined => {
    if (!agreementId || currentSection === null) return undefined;
    return currentSection;
  }, [agreementId, currentSection]);

  const { prev: prevNavStep, next: nextNavStep } = useMemo(
    () => adjacentWizardSteps(step, allowedSteps, stepCount),
    [step, allowedSteps, stepCount]
  );

  if (workspaceMode === "landing") {
    return (
      <>
      <div
        className="vs01-card vs01-card--envelope vs01-agreement-wizard-card relative"
        data-vs01-agreement-landing
      >
        {openingFromList ? (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-slate-950/35"
            aria-live="polite"
          >
            <p className="rounded-lg border border-slate-700 bg-slate-900/95 px-4 py-3 text-xs text-slate-200 shadow-lg">
              Loading agreement…
            </p>
          </div>
        ) : null}
        {landingNotice && (!landingNotice.allowed || landingNotice.approaching) ? (
          <div className="mb-4">
            <UpgradeLimitNotice gate={landingNotice} onDismiss={() => setLandingNotice(null)} />
          </div>
        ) : null}
        <MyAgreementsLanding
          onWorkspaceIndex={(r) => setLandingWorkspaceCount(r.length)}
          onNewAgreement={() => {
            const g = access.check("create_agreement", {
              activeWorkspaceAgreements: landingWorkspaceCount,
            });
            if (!g.allowed) {
              setLandingNotice(g);
              return;
            }
            const monUser = readLawDogUserMonetizationState(access.tier, access.usage);
            if (shouldBlockSecondAgreementCreation(monUser)) {
              logProductEvent("paywall_triggered", { surface: "agreement_wizard_landing", reason: "free_second_agreement" });
              setMonetizationPaywallOpen(true);
              return;
            }
            setLandingNotice(null);
            clearAgreementCreatorIntakeStorage();
            setAgreementId(null);
            setStep(0);
            setAllowedSteps(null);
            setWorkspaceEntryMode("default");
            setWizardDraftReady(false);
            setWizardBoot("idle");
            setOpenHydrateError(null);
            setIntakeResumeNotice(null);
            setReviewPrimedDraft(null);
            setPostCreateRetryId(null);
            setWorkspaceMode("wizard");
          }}
          onOpenAgreement={onOpenSaved}
        />
      </div>
      <UpgradeToProModal
        open={monetizationPaywallOpen}
        onClose={() => setMonetizationPaywallOpen(false)}
        surface="agreement_wizard"
      />
      </>
    );
  }

  const showWizardLoadingOverlay = wizardBoot === "loading_saved";
  const showIntakeErrorPanel = wizardBoot === "error" && step === 0;
  const showPostVs01SimpleFirst =
    postVs01SignatureFirstLanding && step > 0 && wizardDraftReady && wizardBoot === "ready";

  return (
    <>
      <UpgradeToProModal
        open={monetizationPaywallOpen}
        onClose={() => setMonetizationPaywallOpen(false)}
        surface="agreement_wizard"
      />
      <div className="vs01-agreement-ws-back">
        <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact" onClick={goToLanding}>
          My agreements
        </button>
      </div>
      {!showPostVs01SimpleFirst ? (
        <nav className="vs01-stepper" aria-label={`Agreement Workspace: ${stepCount} steps`}>
          {STEPS.map(({ id, label }) => {
            const active = id === step;
            const blocked = !canOpenStep(id);
            const stepNum = id + 1;
            return (
              <button
                key={id}
                type="button"
                className={`vs01-stepper-step${active ? " vs01-stepper-step--active" : ""}`}
                disabled={blocked}
                aria-current={active ? "step" : undefined}
                aria-label={
                  blocked
                    ? id === 0
                      ? `Step ${stepNum} of ${stepCount}: ${label} (use My agreements to start a new agreement)`
                      : `Step ${stepNum} of ${stepCount}: ${label} (complete preparation first)`
                    : `Step ${stepNum} of ${stepCount}: ${label}`
                }
                onClick={() => {
                  if (!blocked) guardedSetStep(id);
                }}
              >
                <span className="vs01-stepper-num">{stepNum}</span>
                <span className="vs01-stepper-label">{label}</span>
              </button>
            );
          })}
        </nav>
      ) : null}

      <div
        className="vs01-card vs01-card--envelope vs01-agreement-wizard-card relative"
        data-vs01-agreement-step={step}
        data-vs01-wizard-draft-ready={wizardDraftReady ? "1" : "0"}
        data-vs01-post-sign-landing={postVs01SignatureFirstLanding ? "1" : "0"}
        data-vs01-prep={creatorPrepState}
      >
        {showWizardLoadingOverlay ? (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[inherit] bg-slate-950/55"
            aria-live="polite"
          >
            <p className="rounded-lg border border-slate-700 bg-slate-900/95 px-4 py-3 text-sm text-slate-200 shadow-lg">
              Loading agreement…
            </p>
          </div>
        ) : null}

        {!showPostVs01SimpleFirst ? (
          <>
            <p className="vs01-agreement-ws-eyebrow">Agreement workspace</p>
            <h2 className="vs01-card-title vs01-agreement-ws-step-title">{STEP_INTRO[step]?.title ?? ""}</h2>
            <p className="vs01-card-help vs01-agreement-ws-step-sub">{STEP_INTRO[step]?.subtitle ?? ""}</p>
          </>
        ) : null}

        {step > 0 && agreementId?.trim() && wizardDraftReady && wizardBoot === "ready" && postVs01SignatureFirstLanding ? (
          <PaidProVs01WorkspaceBanner agreementId={agreementId.trim()} visible />
        ) : null}

        {step > 0 && agreementId?.trim() && !showPostVs01SimpleFirst ? (
          step === 1 ? (
            <details className="mb-4 rounded-lg border border-slate-800/60 bg-slate-950/25 px-3 py-2">
              <summary className="cursor-pointer list-none text-[11px] font-medium text-slate-500 marker:content-none [&::-webkit-details-marker]:hidden">
                Agreement Memory &amp; reuse
              </summary>
              <div className="mt-3 border-t border-slate-800/50 pt-3">
                <AgreementMemoryAgreementStrip agreementId={agreementId.trim()} compact />
              </div>
            </details>
          ) : (
            <AgreementMemoryAgreementStrip agreementId={agreementId.trim()} />
          )
        ) : null}

        {step > 0 && agreementId?.trim() && wizardDraftReady && wizardBoot === "ready" && !postVs01SignatureFirstLanding ? (
          <PaidProVs01WorkspaceBanner agreementId={agreementId.trim()} visible />
        ) : null}

        {step === 0 ? (
          <>
            {showIntakeErrorPanel && openHydrateError ? (
              <div className="mb-4 rounded-lg border border-rose-800/50 bg-rose-950/25 px-4 py-3 text-sm text-rose-100">
                <p>{openHydrateError}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lastOpenedRowRef.current ? (
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                      onClick={() => void retryOpenSaved()}
                    >
                      Retry
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                    onClick={goToLanding}
                  >
                    My agreements
                  </button>
                </div>
              </div>
            ) : null}
            <AgreementBuilderIntake
              onCreated={onCreated}
              onCreateHydrateFailed={onCreateHydrateFailed}
              createRetryAgreementId={postCreateRetryId}
              onRetryHydrateCreate={onRetryHydrateCreate}
              className="vs01-agreement-intake"
              workspaceUi
              resumeNotice={intakeResumeNotice}
              onPrepStateChange={setCreatorPrepState}
            />
          </>
        ) : null}

        {step > 0 && agreementId?.trim() && reviewSection && wizardDraftReady && wizardBoot === "ready" ? (
          showPostVs01SimpleFirst ? null : (
            <>
              <AgreementReviewErrorBoundary onBack={goToLanding}>
                <AgreementReview
                  agreementId={agreementId}
                  section={reviewSection}
                  embeddedInCard
                  workspaceEntryMode={workspaceEntryMode}
                  postVs01SignatureFirstLanding={postVs01SignatureFirstLanding}
                  onBackToNew={goToLanding}
                  initialDraftSnapshot={
                    reviewPrimedDraft && reviewPrimedDraft.id === agreementId ? reviewPrimedDraft : null
                  }
                  onCanonicalDraftLoaded={clearReviewPrimedDraft}
                  onWorkspaceDetailsNotReady={handleWorkspaceDetailsNotReady}
                  onOwnerJumpToRecipientsStep={ownerJumpToRecipientsStep}
                />
              </AgreementReviewErrorBoundary>
              <div className="vs01-agreement-step-actions">
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                  disabled={prevNavStep === step}
                  onClick={() => guardedSetStep(prevNavStep)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--primary"
                  disabled={nextNavStep === step}
                  onClick={() => guardedSetStep(nextNavStep)}
                >
                  {step === 1
                    ? "Continue"
                    : step === 2
                      ? "Continue"
                      : step === 3
                        ? "Continue to send"
                        : "Continue"}
                </button>
              </div>
            </>
          )
        ) : null}
      </div>
    </>
  );
}
