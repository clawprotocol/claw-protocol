/**
 * Authenticated `/app/create?agreementId=` resume after an accepted snapshot.
 * Workspace bind and accepted GET identity are separate gates. Length is not authority.
 */
import { evaluateCreateResumeSnapshotAuthority } from "../../components/agreements/paidCreateResumeHydration";
import {
  isStaleAnonymousOrgId,
  isUserWorkspaceOrgId,
  resolveCreateWorkspaceProbeReadiness,
  type CreateWorkspaceProbeReadiness,
} from "./createWorkspaceProbeReadiness";

export type CreateResumeWorkspaceTraceStep = {
  name: string;
  authUserId: string | null;
  storedOrgId: string;
  reactWorkspaceOrgId: string;
  probeReason: CreateWorkspaceProbeReadiness["reason"];
  probeReady: boolean;
  intakeMayMount: boolean;
  bindAttempted: boolean;
  bindOrgId?: string;
  bindError?: string;
  route?: string;
};

export type AcceptedCreateResumeGet = {
  agreement_id: string;
  snapshot_id: string;
  corpus_sha256: string;
  corpus_plain: string;
  corpus_length: number;
  status: string;
};

export type AcceptedCreateResumeUiState = {
  draftAgreementId: string | null;
  reviewAgreementId: string | null;
  createUiStage: "INPUT" | "DRAFT";
  createFlowPhase: "capturing_input" | "draft_ready_for_review";
  displayPhase: "intake" | "review";
  articleCorpus: string;
  settling: boolean;
  terminal: string | null;
};

export function resolveCreateResumeIntakeMount(probe: CreateWorkspaceProbeReadiness): {
  settling: boolean;
  intakeMayMount: boolean;
  reason: CreateWorkspaceProbeReadiness["reason"];
} {
  if (probe.ready) {
    return { settling: false, intakeMayMount: true, reason: probe.reason };
  }
  return { settling: true, intakeMayMount: false, reason: probe.reason };
}

export function applyAuthenticatedWorkspaceBind(args: {
  isAuthenticated: boolean;
  authUserId: string;
  storedOrgId: string;
  bind:
    | { ok: true; orgId: string }
    | { ok: false; error: string };
}): {
  storedOrgId: string;
  reactWorkspaceOrgId: string;
  terminal: string | null;
  bindAttempted: boolean;
} {
  if (!args.isAuthenticated) {
    return {
      storedOrgId: args.storedOrgId,
      reactWorkspaceOrgId: args.storedOrgId,
      terminal: "unauthenticated",
      bindAttempted: false,
    };
  }
  if (args.bind.ok) {
    const orgId = String(args.bind.orgId || "").trim();
    if (!isUserWorkspaceOrgId(orgId)) {
      return {
        storedOrgId: args.storedOrgId,
        reactWorkspaceOrgId: args.storedOrgId,
        terminal: "workspace_bind_not_user_org",
        bindAttempted: true,
      };
    }
    return {
      storedOrgId: orgId,
      reactWorkspaceOrgId: orgId,
      terminal: null,
      bindAttempted: true,
    };
  }
  return {
    storedOrgId: args.storedOrgId,
    reactWorkspaceOrgId: args.storedOrgId,
    terminal: `workspace_bind_failed:${args.bind.error}`,
    bindAttempted: true,
  };
}

/** Accepted resume must stay on the create URL. Do not kick to /app while bind is in flight. */
export function shouldRedirectCreateForStaleOrg(args: {
  urlAgreementId: string;
  probeReason: CreateWorkspaceProbeReadiness["reason"];
}): boolean {
  if (String(args.urlAgreementId || "").trim()) return false;
  return args.probeReason === "awaiting_user_org";
}

export function shouldPreserveAcceptedCreateResume(args: {
  urlAgreementId: string;
  reviewAgreementId?: string | null;
  draftAgreementId?: string | null;
  createUiStage?: string;
  createFlowPhase?: string;
}): boolean {
  const urlId = String(args.urlAgreementId || "").trim();
  if (!urlId) return false;
  const reviewId = String(args.reviewAgreementId || "").trim();
  const draftId = String(args.draftAgreementId || "").trim();
  if (reviewId && reviewId !== urlId) return false;
  if (draftId && draftId !== urlId) return false;
  if (args.createUiStage === "DRAFT" && args.createFlowPhase === "draft_ready_for_review") {
    return true;
  }
  return !reviewId || reviewId === urlId;
}

export function resolveAcceptedCreateResumeUiState(args: {
  requestedAgreementId: string;
  authUserId: string;
  workspaceOrgId: string;
  probe: CreateWorkspaceProbeReadiness;
  acceptedGet: AcceptedCreateResumeGet | null;
  getError?: string | null;
  expectedDigest?: string | null;
}): AcceptedCreateResumeUiState {
  const requested = String(args.requestedAgreementId || "").trim();
  const mount = resolveCreateResumeIntakeMount(args.probe);
  if (mount.settling) {
    return {
      draftAgreementId: null,
      reviewAgreementId: requested || null,
      createUiStage: "INPUT",
      createFlowPhase: "capturing_input",
      displayPhase: "intake",
      articleCorpus: "",
      settling: true,
      terminal: null,
    };
  }
  if (!requested) {
    return {
      draftAgreementId: null,
      reviewAgreementId: null,
      createUiStage: "INPUT",
      createFlowPhase: "capturing_input",
      displayPhase: "intake",
      articleCorpus: "",
      settling: false,
      terminal: null,
    };
  }
  if (args.getError) {
    return {
      draftAgreementId: null,
      reviewAgreementId: requested,
      createUiStage: "INPUT",
      createFlowPhase: "capturing_input",
      displayPhase: "intake",
      articleCorpus: "",
      settling: false,
      terminal: args.getError,
    };
  }
  if (!args.acceptedGet) {
    return {
      draftAgreementId: null,
      reviewAgreementId: requested,
      createUiStage: "INPUT",
      createFlowPhase: "capturing_input",
      displayPhase: "intake",
      articleCorpus: "",
      settling: false,
      terminal: "accepted_get_missing",
    };
  }
  const evaluated = evaluateCreateResumeSnapshotAuthority({
    requestedAgreementId: requested,
    snapshot: args.acceptedGet,
    expectedDigest: args.expectedDigest ?? args.acceptedGet.corpus_sha256,
  });
  if (!evaluated.ok) {
    return {
      draftAgreementId: null,
      reviewAgreementId: requested,
      createUiStage: "INPUT",
      createFlowPhase: "capturing_input",
      displayPhase: "intake",
      articleCorpus: "",
      settling: false,
      terminal: evaluated.code,
    };
  }
  return {
    draftAgreementId: requested,
    reviewAgreementId: requested,
    createUiStage: "DRAFT",
    createFlowPhase: "draft_ready_for_review",
    displayPhase: "review",
    articleCorpus: evaluated.authority.corpus,
    settling: false,
    terminal: null,
  };
}

export function traceAcceptedCreateResumeWorkspace(args: {
  authUserId: string;
  initialStoredOrgId: string;
  initialReactOrgId: string;
  urlAgreementId: string;
  route: string;
  bind: { ok: true; orgId: string } | { ok: false; error: string };
  acceptedGet: AcceptedCreateResumeGet | null;
  getError?: string | null;
}): {
  steps: CreateResumeWorkspaceTraceStep[];
  firstIncorrect: string | null;
  ui: AcceptedCreateResumeUiState;
} {
  const steps: CreateResumeWorkspaceTraceStep[] = [];
  const push = (
    name: string,
    storedOrgId: string,
    reactWorkspaceOrgId: string,
    extra?: Partial<CreateResumeWorkspaceTraceStep>,
  ) => {
    const probe = resolveCreateWorkspaceProbeReadiness({
      authLoading: false,
      isAuthenticated: true,
      orgId: reactWorkspaceOrgId,
      coldReferralRedirect: false,
    });
    const mount = resolveCreateResumeIntakeMount(probe);
    steps.push({
      name,
      authUserId: args.authUserId,
      storedOrgId,
      reactWorkspaceOrgId,
      probeReason: probe.reason,
      probeReady: probe.ready,
      intakeMayMount: mount.intakeMayMount,
      bindAttempted: false,
      route: args.route,
      ...extra,
    });
  };

  push("authenticated_session", args.initialStoredOrgId, args.initialReactOrgId);
  push("stored_and_react_org", args.initialStoredOrgId, args.initialReactOrgId);
  const initialProbe = resolveCreateWorkspaceProbeReadiness({
    authLoading: false,
    isAuthenticated: true,
    orgId: args.initialReactOrgId,
    coldReferralRedirect: false,
  });
  push("probe_readiness", args.initialStoredOrgId, args.initialReactOrgId);

  let storedOrgId = args.initialStoredOrgId;
  let reactOrgId = args.initialReactOrgId;
  let firstIncorrect: string | null = null;

  if (isStaleAnonymousOrgId(reactOrgId) && initialProbe.reason === "awaiting_user_org") {
    const bound = applyAuthenticatedWorkspaceBind({
      isAuthenticated: true,
      authUserId: args.authUserId,
      storedOrgId,
      bind: args.bind,
    });
    storedOrgId = bound.storedOrgId;
    reactOrgId = bound.reactWorkspaceOrgId;
    push("bind_authenticated_user_workspace", storedOrgId, reactOrgId, {
      bindAttempted: bound.bindAttempted,
      bindOrgId: args.bind.ok ? args.bind.orgId : undefined,
      bindError: args.bind.ok ? undefined : args.bind.error,
    });
    if (bound.terminal && args.bind.ok === false) {
      firstIncorrect = firstIncorrect ?? null;
    }
    if (args.bind.ok && reactOrgId !== args.bind.orgId) {
      firstIncorrect = "react_workspace_org_did_not_follow_bind";
    }
  } else if (isUserWorkspaceOrgId(reactOrgId)) {
    push("workspace_already_user_org", storedOrgId, reactOrgId);
  }

  push("route_create_resume", storedOrgId, reactOrgId, { route: args.route });
  const readyProbe = resolveCreateWorkspaceProbeReadiness({
    authLoading: false,
    isAuthenticated: true,
    orgId: reactOrgId,
    coldReferralRedirect: false,
  });
  const mount = resolveCreateResumeIntakeMount(readyProbe);
  push("intake_mount_gate", storedOrgId, reactOrgId);

  const ui = resolveAcceptedCreateResumeUiState({
    requestedAgreementId: args.urlAgreementId,
    authUserId: args.authUserId,
    workspaceOrgId: reactOrgId,
    probe: readyProbe,
    acceptedGet: mount.intakeMayMount ? args.acceptedGet : null,
    getError: mount.intakeMayMount ? args.getError : undefined,
  });
  push("hydrated_resume_ui", storedOrgId, reactOrgId);

  if (!args.urlAgreementId) {
    return { steps, firstIncorrect, ui };
  }
  if (args.bind.ok && isStaleAnonymousOrgId(args.initialReactOrgId) && !mount.intakeMayMount) {
    firstIncorrect = firstIncorrect ?? "intake_blocked_after_successful_bind";
  }
  if (
    args.bind.ok &&
    mount.intakeMayMount &&
    args.acceptedGet &&
    !args.getError &&
    (ui.createUiStage !== "DRAFT" || ui.displayPhase !== "review")
  ) {
    firstIncorrect = firstIncorrect ?? "accepted_get_did_not_enter_review";
  }
  return { steps, firstIncorrect, ui };
}

export function shouldClearResumeIdForIntakeSeed(args: {
  urlAgreementId: string;
  initialIntakeText: string;
}): boolean {
  if (String(args.urlAgreementId || "").trim()) return false;
  return String(args.initialIntakeText || "").trim().length > 0;
}
