/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { sha256CorpusDigest } from "../../agreement/canonicalReviewSnapshotApi";
import { evaluateCreateResumeSnapshotAuthority } from "../../components/agreements/paidCreateResumeHydration";
import { getOrgId, setOrgId, subscribeToOrgContextChanges } from "../orgContext";
import {
  applyAuthenticatedWorkspaceBind,
  resolveAcceptedCreateResumeUiState,
  resolveCreateResumeIntakeMount,
  shouldClearResumeIdForIntakeSeed,
  shouldPreserveAcceptedCreateResume,
  shouldRedirectCreateForStaleOrg,
  traceAcceptedCreateResumeWorkspace,
  type AcceptedCreateResumeGet,
} from "./acceptedCreateResumeWorkspace";
import { resolveCreateWorkspaceProbeReadiness } from "./createWorkspaceProbeReadiness";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGREEMENT_ID = "e8f04394-17d1-4df7-b0de-68632202c848";
const SNAPSHOT_ID = "crs_c0c1410ee9764750b159f66775b90681";
const AUTH_USER = "core-paid-owner";
const USER_ORG = "user-core-paid-owner";
const ANON_ORG = "anon-8066d4a6aff6450c969ef2ee62043718";
const ORIGINAL_NOTICE = "olivia.hart@silvermesaanalytics.com";
const ACCEPTED_NOTICE = "notices@silvermesaanalytics.com";

function silverMesaAcceptedPaper(): string {
  return `${"Joint AI software rollout. Ironclad Systems Group LLC is the Sponsor. Harborline Data Solutions Inc. is the Vendor. Northwind Automation Partners LLC is the Integrator. Silver Mesa Analytics LP is the Analyst. Notices to Silver Mesa Email: "}${ACCEPTED_NOTICE}. Reviewer access remains ${ORIGINAL_NOTICE}. Fee $187,500. Term 24 months. Texas law. Austin ZIP 78701. `.repeat(
    18,
  ).trim();
}

async function acceptedGet(overrides?: Partial<AcceptedCreateResumeGet>): Promise<AcceptedCreateResumeGet> {
  const corpus = silverMesaAcceptedPaper();
  const digest = await sha256CorpusDigest(corpus);
  return {
    agreement_id: AGREEMENT_ID,
    snapshot_id: SNAPSHOT_ID,
    corpus_sha256: digest,
    corpus_plain: corpus,
    corpus_length: corpus.length,
    status: "accepted",
    ...overrides,
  };
}

describe("accepted create resume workspace", () => {
  afterEach(() => {
    try {
      localStorage.removeItem("claw_org_id");
    } catch {
      /* ignore */
    }
  });

  it("records the failing authenticated + stale-org transitions and then binds into accepted review", async () => {
    const get = await acceptedGet();
    const traced = traceAcceptedCreateResumeWorkspace({
      authUserId: AUTH_USER,
      initialStoredOrgId: ANON_ORG,
      initialReactOrgId: ANON_ORG,
      urlAgreementId: AGREEMENT_ID,
      route: `/app/create?agreementId=${AGREEMENT_ID}`,
      bind: { ok: true, orgId: USER_ORG },
      acceptedGet: get,
    });

    expect(traced.steps.map((step) => step.name)).toEqual([
      "authenticated_session",
      "stored_and_react_org",
      "probe_readiness",
      "bind_authenticated_user_workspace",
      "route_create_resume",
      "intake_mount_gate",
      "hydrated_resume_ui",
    ]);
    expect(traced.steps[0]?.authUserId).toBe(AUTH_USER);
    expect(traced.steps[2]?.probeReason).toBe("awaiting_user_org");
    expect(traced.steps[2]?.intakeMayMount).toBe(false);
    expect(traced.steps[3]?.bindAttempted).toBe(true);
    expect(traced.steps[3]?.reactWorkspaceOrgId).toBe(USER_ORG);
    expect(traced.steps[5]?.intakeMayMount).toBe(true);
    expect(traced.firstIncorrect).toBeNull();
    expect(traced.ui.settling).toBe(false);
    expect(traced.ui.draftAgreementId).toBe(AGREEMENT_ID);
    expect(traced.ui.reviewAgreementId).toBe(AGREEMENT_ID);
    expect(traced.ui.createUiStage).toBe("DRAFT");
    expect(traced.ui.createFlowPhase).toBe("draft_ready_for_review");
    expect(traced.ui.displayPhase).toBe("review");
    expect(traced.ui.articleCorpus).toContain(ACCEPTED_NOTICE);
    expect(traced.ui.articleCorpus).toContain(ORIGINAL_NOTICE);
    expect(evaluateCreateResumeSnapshotAuthority({ requestedAgreementId: AGREEMENT_ID, snapshot: get }).ok).toBe(
      true,
    );
  });

  it("valid authenticated author + user workspace + matching accepted snapshot mounts review", async () => {
    const get = await acceptedGet();
    const probe = resolveCreateWorkspaceProbeReadiness({
      authLoading: false,
      isAuthenticated: true,
      orgId: USER_ORG,
      coldReferralRedirect: false,
    });
    expect(resolveCreateResumeIntakeMount(probe)).toEqual({
      settling: false,
      intakeMayMount: true,
      reason: "authenticated_user_org",
    });
    const ui = resolveAcceptedCreateResumeUiState({
      requestedAgreementId: AGREEMENT_ID,
      authUserId: AUTH_USER,
      workspaceOrgId: USER_ORG,
      probe,
      acceptedGet: get,
    });
    expect(ui.createUiStage).toBe("DRAFT");
    expect(ui.displayPhase).toBe("review");
    expect(ui.articleCorpus).toContain(ACCEPTED_NOTICE);
    expect(ui.articleCorpus).toContain(`Reviewer access remains ${ORIGINAL_NOTICE}`);
    expect(
      shouldPreserveAcceptedCreateResume({
        urlAgreementId: AGREEMENT_ID,
        reviewAgreementId: AGREEMENT_ID,
        draftAgreementId: AGREEMENT_ID,
        createUiStage: "DRAFT",
        createFlowPhase: "draft_ready_for_review",
      }),
    ).toBe(true);
  });

  it("stale anonymous org binds to the authenticated user org or fails with a terminal result", () => {
    const bound = applyAuthenticatedWorkspaceBind({
      isAuthenticated: true,
      authUserId: AUTH_USER,
      storedOrgId: ANON_ORG,
      bind: { ok: true, orgId: USER_ORG },
    });
    expect(bound.reactWorkspaceOrgId).toBe(USER_ORG);
    expect(bound.terminal).toBeNull();

    const failed = applyAuthenticatedWorkspaceBind({
      isAuthenticated: true,
      authUserId: AUTH_USER,
      storedOrgId: ANON_ORG,
      bind: { ok: false, error: "Could not bind workspace." },
    });
    expect(failed.reactWorkspaceOrgId).toBe(ANON_ORG);
    expect(failed.terminal).toBe("workspace_bind_failed:Could not bind workspace.");
    expect(
      shouldRedirectCreateForStaleOrg({
        urlAgreementId: AGREEMENT_ID,
        probeReason: "awaiting_user_org",
      }),
    ).toBe(false);
  });

  it("keeps wrong agreement, unauthorized GET, pending, superseded, and digest mismatch closed", async () => {
    const get = await acceptedGet();
    const probe = resolveCreateWorkspaceProbeReadiness({
      authLoading: false,
      isAuthenticated: true,
      orgId: USER_ORG,
      coldReferralRedirect: false,
    });
    expect(
      resolveAcceptedCreateResumeUiState({
        requestedAgreementId: AGREEMENT_ID,
        authUserId: AUTH_USER,
        workspaceOrgId: USER_ORG,
        probe,
        acceptedGet: { ...get, agreement_id: "ag-other" },
      }).terminal,
    ).toBe("agreement_id_mismatch");
    expect(
      resolveAcceptedCreateResumeUiState({
        requestedAgreementId: AGREEMENT_ID,
        authUserId: AUTH_USER,
        workspaceOrgId: USER_ORG,
        probe,
        acceptedGet: null,
        getError: "unauthorized_get",
      }).terminal,
    ).toBe("unauthorized_get");
    expect(
      resolveAcceptedCreateResumeUiState({
        requestedAgreementId: AGREEMENT_ID,
        authUserId: AUTH_USER,
        workspaceOrgId: USER_ORG,
        probe,
        acceptedGet: { ...get, status: "pending" },
      }).terminal,
    ).toBe("rejected_pending");
    expect(
      resolveAcceptedCreateResumeUiState({
        requestedAgreementId: AGREEMENT_ID,
        authUserId: AUTH_USER,
        workspaceOrgId: USER_ORG,
        probe,
        acceptedGet: { ...get, status: "superseded" },
      }).terminal,
    ).toBe("rejected_superseded");
    expect(
      resolveAcceptedCreateResumeUiState({
        requestedAgreementId: AGREEMENT_ID,
        authUserId: AUTH_USER,
        workspaceOrgId: USER_ORG,
        probe,
        acceptedGet: { ...get, corpus_sha256: "c".repeat(64) },
        expectedDigest: get.corpus_sha256,
      }).terminal,
    ).toBe("digest_mismatch");
  });

  it("opens a genuine new create route on the INPUT composer", () => {
    const probe = resolveCreateWorkspaceProbeReadiness({
      authLoading: false,
      isAuthenticated: true,
      orgId: USER_ORG,
      coldReferralRedirect: false,
    });
    const ui = resolveAcceptedCreateResumeUiState({
      requestedAgreementId: "",
      authUserId: AUTH_USER,
      workspaceOrgId: USER_ORG,
      probe,
      acceptedGet: null,
    });
    expect(ui.createUiStage).toBe("INPUT");
    expect(ui.createFlowPhase).toBe("capturing_input");
    expect(ui.displayPhase).toBe("intake");
    expect(ui.articleCorpus).toBe("");
    expect(ui.reviewAgreementId).toBeNull();
  });

  it("does not let a later empty-create init replace a hydrated accepted resume", () => {
    expect(
      shouldPreserveAcceptedCreateResume({
        urlAgreementId: AGREEMENT_ID,
        reviewAgreementId: AGREEMENT_ID,
        draftAgreementId: AGREEMENT_ID,
        createUiStage: "DRAFT",
        createFlowPhase: "draft_ready_for_review",
      }),
    ).toBe(true);
    expect(
      shouldClearResumeIdForIntakeSeed({
        urlAgreementId: AGREEMENT_ID,
        initialIntakeText: "Four-party Texas rollout leftover intake",
      }),
    ).toBe(false);
    expect(
      shouldClearResumeIdForIntakeSeed({
        urlAgreementId: "",
        initialIntakeText: "Four-party Texas rollout leftover intake",
      }),
    ).toBe(true);
  });

  it("syncs React workspace org from stored org-context changes after bind", () => {
    setOrgId(ANON_ORG);
    let seen = "";
    const stop = subscribeToOrgContextChanges((orgId) => {
      seen = orgId;
    });
    setOrgId(USER_ORG);
    stop();
    expect(getOrgId()).toBe(USER_ORG);
    expect(seen).toBe(USER_ORG);
  });

  it("create page and intake keep accepted-resume workspace and URL identity", () => {
    const createPage = readFileSync(join(__dirname, "SimpleCreatePage.tsx"), "utf8");
    expect(createPage).toContain("subscribeToOrgContextChanges");
    expect(createPage).toContain("shouldRedirectCreateForStaleOrg");
    expect(createPage).toContain("resumeAgreementIdFromQuery");
    const intake = readFileSync(
      join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"),
      "utf8",
    );
    expect(intake).toContain("shouldPreserveAcceptedCreateResume");
    expect(intake).toContain("shouldClearResumeIdForIntakeSeed");
    expect(intake).toContain("parseCreateAgreementIdFromSearch()");
  });
});
