/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LaunchNavProvider } from "./LaunchNavContext";
import type { OwnerSigningStatusHydratedState } from "./ownerSigningStatusHydration";
import type { PaidProVs01PostSignHandoffV1 } from "../vs01/vs01PaidProPostSignHandoff";
import type { Vs01CanonicalPacketPortableV1 } from "../vs01/vs01CanonicalPacketSeed";
import {
  CREATOR_DOWNLOAD_PROOF_LABEL,
  CREATOR_VIEW_SIGNED_AGREEMENT_LABEL,
} from "./creatorDashboardCopy";
import { OwnerSigningStatusPage } from "./OwnerSigningStatusPage";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  activate: vi.fn(),
  cancel: vi.fn(),
  resolveHandoff: vi.fn(),
  packetStatus: vi.fn(),
  loadPortable: vi.fn(),
  downloadPdf: vi.fn(),
  proofDownload: vi.fn(),
}));

vi.mock("./ownerSigningStatusHydration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ownerSigningStatusHydration")>();
  return {
    ...actual,
    createOwnerSigningStatusHydrationBoundary: () => ({
      activate: mocks.activate,
      load: mocks.load,
      cancel: mocks.cancel,
    }),
  };
});

vi.mock("./ownerSigningStatusResolver", () => ({
  resolveOwnerSigningHandoff: mocks.resolveHandoff,
  ownerProofReceiptAvailable: () => true,
  packetStatusFromPublicVerify: mocks.packetStatus,
}));

vi.mock("../vs01/vs01CanonicalPacketSeed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../vs01/vs01CanonicalPacketSeed")>();
  return {
    ...actual,
    loadVs01CanonicalPacketPortable: mocks.loadPortable,
  };
});

vi.mock("../agreement/completedSignedAgreementPdfDownload", () => ({
  downloadCompletedSignedAgreementPdf: mocks.downloadPdf,
}));

vi.mock("../export/dataExportApi", () => ({
  openReceiptProofBundleDownload: mocks.proofDownload,
}));

vi.mock("../vs01/StepSigningPacketStatus", () => ({
  StepSigningPacketStatus: (props: {
    handoff: PaidProVs01PostSignHandoffV1;
    prepareSignerRoles: Array<{ entityName?: string; signerName?: string }>;
    authoritativeProgress: {
      signedCount: number;
      requiredCount: number;
      fullySigned: boolean;
    };
    onRefresh?: () => void;
  }) => (
    <section data-testid="signer-status-cards">
      <p>
        Backend progress: {props.authoritativeProgress.signedCount}/
        {props.authoritativeProgress.requiredCount}
      </p>
      <p>Authoritative complete: {String(props.authoritativeProgress.fullySigned)}</p>
      {props.prepareSignerRoles.map((role) => (
        <p key={role.entityName}>
          {role.entityName} · {role.signerName}
        </p>
      ))}
      <p>{props.handoff.ownerSigningUrl}</p>
      <button type="button" onClick={props.onRefresh}>
        Refresh status
      </button>
    </section>
  ),
}));

const AGREEMENT_ID = "ag_owner_page";

const frozen = {
  version: 1 as const,
  agreementId: AGREEMENT_ID,
  acceptedVersionId: "av_owner_page",
  acceptedCorpusSha256: "a".repeat(64),
  frozenAt: "2026-07-17T12:00:00Z",
  parties: [
    {
      agreementPartyId: "party_owner",
      legalEntityName: "Owner Legal LLC",
      agreementRole: "owner",
      canonicalOrder: 0,
    },
    {
      agreementPartyId: "party_counterparty",
      legalEntityName: "Counterparty Legal Inc.",
      agreementRole: "party",
      canonicalOrder: 1,
    },
  ],
  signers: [
    {
      signerRecordId: "signer:party_owner:0",
      agreementPartyId: "party_owner",
      signerName: "Olivia Owner",
      signerTitle: "CEO",
      signerEmail: "owner@example.test",
      signingOrder: 0,
    },
    {
      signerRecordId: "signer:party_counterparty:0",
      agreementPartyId: "party_counterparty",
      signerName: "Casey Counterparty",
      signerTitle: "President",
      signerEmail: "counterparty@example.test",
      signingOrder: 1,
    },
  ],
  execution: {
    partyOrder: ["party_owner", "party_counterparty"],
    signerOrder: ["signer:party_owner:0", "signer:party_counterparty:0"],
    executionPartyHash: "b".repeat(64),
  },
};

const portable: Vs01CanonicalPacketPortableV1 = {
  v: 1,
  seed: {
    v: 1,
    documentId: "doc_owner_page",
    agreementId: AGREEMENT_ID,
    corpusPlain: "x".repeat(1500),
    corpusHash: "not-read-by-page-test",
    savedAt: "2026-07-17T12:00:00Z",
  },
  fields: [],
  roles: frozen.signers.map((signer, index) => ({
    roleId: signer.signerRecordId,
    partyIndex: index,
    partyId: signer.agreementPartyId,
    entityName: frozen.parties[index]!.legalEntityName,
    partyName: frozen.parties[index]!.legalEntityName,
    roleLabel: index === 0 ? "Owner" : "Counterparty",
    signerName: signer.signerName,
    signerTitle: signer.signerTitle,
    signerEmail: signer.signerEmail,
    reviewEmail: signer.signerEmail,
    isEntityParty: true,
    requiresSignature: true,
    vs01CounterpartyId: signer.agreementPartyId,
    kind: index === 0 ? ("owner" as const) : ("counterparty" as const),
  })),
  pageCount: 1,
  witnessPageIndex: 0,
  initialsPolicy: { enabled: false, bodyPagesOnly: true },
  fieldCount: 0,
};

const handoff: PaidProVs01PostSignHandoffV1 = {
  v: 1,
  agreementId: AGREEMENT_ID,
  agreementTitle: "Owner Agreement",
  vs01DocumentId: portable.seed.documentId,
  receiptId: "receipt_owner_page",
  receiptHashSha256: null,
  packetPrepareOnly: true,
  savedAt: "2026-07-17T12:00:00Z",
  ownerSignerRoleId: frozen.signers[0]!.signerRecordId,
  ownerSigningUrl: "https://example.test/owner-signing-link",
  signers: [
    {
      counterpartyId: "party_counterparty",
      displayName: "Counterparty Legal Inc.",
      email: "counterparty@example.test",
      signingUrl: "https://example.test/counterparty-signing-link",
      signerRoleId: frozen.signers[1]!.signerRecordId,
    },
  ],
};

function state(
  overrides: Partial<OwnerSigningStatusHydratedState>,
): OwnerSigningStatusHydratedState {
  return {
    agreementId: AGREEMENT_ID,
    agreementTitle: "Owner Agreement",
    status: "frozen",
    authorityClassification: "frozen",
    accepted: {
      agreement_id: AGREEMENT_ID,
      version_id: frozen.acceptedVersionId,
      corpus_sha256: frozen.acceptedCorpusSha256,
      accepted_at: "2026-07-17T12:00:00Z",
      authority_state: "accepted",
    },
    frozen,
    signedCount: 0,
    requiredCount: 2,
    backendCompleted: false,
    verify: null,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <LaunchNavProvider>
      <OwnerSigningStatusPage agreementId={AGREEMENT_ID} />
    </LaunchNavProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.resolveHandoff.mockReturnValue(handoff);
  mocks.loadPortable.mockReturnValue(portable);
});

afterEach(() => {
  cleanup();
});

describe("OwnerSigningStatusPage Phase 3B1 compatibility", () => {
  it("shows loading until backend hydration resolves", () => {
    mocks.load.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByText("Loading signing status…")).toBeTruthy();
  });

  it("labels legacy state without silently promoting browser completion", async () => {
    localStorage.setItem(
      `vs01_signing_packet_status_v1:${AGREEMENT_ID}`,
      JSON.stringify({ agreementId: AGREEMENT_ID, fullySigned: true, bySignerKey: {} }),
    );
    mocks.load.mockResolvedValue(
      state({
        status: "legacy",
        authorityClassification: "legacy_unversioned",
        accepted: null,
        frozen: null,
        backendCompleted: false,
      }),
    );
    renderPage();
    expect(await screen.findByText(/Legacy\/unversioned agreement/)).toBeTruthy();
    expect(screen.queryByTestId("owner-signed-actions")).toBeNull();
    expect(screen.getByText("Authoritative complete: false")).toBeTruthy();
  });

  it("keeps backend-confirmed legacy signed document actions accessible", async () => {
    mocks.load.mockResolvedValue(
      state({
        status: "legacy",
        authorityClassification: "legacy_unversioned",
        accepted: null,
        frozen: null,
        signedCount: 2,
        requiredCount: 2,
        backendCompleted: true,
      }),
    );
    renderPage();
    expect(await screen.findByText("Legacy signed agreement")).toBeTruthy();
    expect(screen.getByText(CREATOR_VIEW_SIGNED_AGREEMENT_LABEL)).toBeTruthy();
    fireEvent.click(screen.getByTestId("owner-signing-status-download-pdf"));
    await waitFor(() => expect(mocks.downloadPdf).toHaveBeenCalled());
    expect(screen.getByText(CREATOR_DOWNLOAD_PROOF_LABEL)).toBeTruthy();
  });

  it("retains signer cards and signing links with backend-confirmed progress", async () => {
    mocks.load.mockResolvedValue(
      state({ status: "signing", signedCount: 1, requiredCount: 2 }),
    );
    renderPage();
    expect(await screen.findByText("Backend progress: 1/2")).toBeTruthy();
    expect(screen.getByText("Owner Legal LLC · Olivia Owner")).toBeTruthy();
    expect(screen.getByText("https://example.test/owner-signing-link")).toBeTruthy();
    expect(screen.getByText("Authoritative complete: false")).toBeTruthy();
  });

  it("retains safe signer presentation for a frozen agreement", async () => {
    mocks.load.mockResolvedValue(state({ status: "frozen", signedCount: 0 }));
    renderPage();
    expect(await screen.findByText("Backend progress: 0/2")).toBeTruthy();
    expect(screen.getByText("Counterparty Legal Inc. · Casey Counterparty")).toBeTruthy();
    expect(screen.getByText("https://example.test/owner-signing-link")).toBeTruthy();
  });

  it("shows pending certification instead of certified completion", async () => {
    mocks.load.mockResolvedValue(
      state({
        status: "conflict",
        signedCount: 2,
        requiredCount: 2,
        backendCompleted: true,
        conflict: "completed_parity_not_certified",
      }),
    );
    renderPage();
    expect(await screen.findByText(/certification is pending Phase 3B2 parity/)).toBeTruthy();
    expect(screen.queryByText("Agreement fully signed")).toBeNull();
    expect(screen.getByTestId("owner-signed-actions")).toBeTruthy();
    expect(screen.getByText("Authoritative complete: false")).toBeTruthy();
  });

  it("refresh invokes backend hydration again", async () => {
    mocks.load.mockResolvedValue(state({ status: "signing", signedCount: 1 }));
    renderPage();
    await screen.findByText("Backend progress: 1/2");
    fireEvent.click(screen.getByText("Refresh status"));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
  });
});
