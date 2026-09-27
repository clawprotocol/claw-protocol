/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyPendingOwnershipMigrationToClient,
  commitPostAuthOwnershipMigration,
  clearOwnershipMigrationReceipt,
  isSupersededAgreementId,
  readOwnershipMigrationReceipt,
  resolveCanonicalMigratedAgreementId,
  shouldBlockDraftWriteForOwnershipTransition,
} from "./ownershipMigrationFinalize";
import {
  readCreateReviewAgreementResumeId,
  writeCreateReviewAgreementResumeId,
} from "../components/agreements/agreementIntakeStorage";

describe("ownershipMigrationFinalize", () => {
  beforeEach(() => {
    sessionStorage.clear();
    writeCreateReviewAgreementResumeId(null);
  });

  it("resolves canonical id from migrated list preferring the prior leftover persist", () => {
    expect(
      resolveCanonicalMigratedAgreementId({
        migratedAgreementIds: ["ag-a", "ag-b"],
        continuationAgreementId: "ag-b",
        priorClientAgreementId: "ag-a",
      }),
    ).toBe("ag-a");
  });

  it("commits receipt and writes resume id", () => {
    writeCreateReviewAgreementResumeId("ag-anon-old");
    const receipt = commitPostAuthOwnershipMigration({
      migratedAgreementIds: ["ag-user-owned"],
      continuationAgreementId: "ag-user-owned",
      priorClientAgreementId: "ag-anon-old",
    });
    expect(receipt?.canonicalAgreementId).toBe("ag-user-owned");
    expect(readCreateReviewAgreementResumeId()).toBe("ag-user-owned");
    expect(readOwnershipMigrationReceipt()?.supersededAgreementIds).toEqual(["ag-anon-old"]);
  });

  it("blocks draft writes against superseded id until client rebind", () => {
    commitPostAuthOwnershipMigration({
      migratedAgreementIds: ["ag-owned"],
      priorClientAgreementId: "ag-stale",
    });
    expect(shouldBlockDraftWriteForOwnershipTransition("ag-stale")).toBe(true);
    expect(isSupersededAgreementId("ag-stale")).toBe(true);
    expect(shouldBlockDraftWriteForOwnershipTransition("ag-owned")).toBe(false);
  });

  it("applyPendingOwnershipMigrationToClient rebinds ref and clears receipt", () => {
    commitPostAuthOwnershipMigration({
      migratedAgreementIds: ["ag-owned"],
      priorClientAgreementId: "ag-stale",
    });
    const ref = { current: "ag-stale" as string | null };
    let state: string | null = "ag-stale";
    let bumped = 0;
    applyPendingOwnershipMigrationToClient({
      reviewAgreementIdRef: ref,
      setReviewAgreementId: (id) => {
        state = id;
      },
      invalidateWorkspaceSession: () => {
        bumped += 1;
      },
      clearEnsurePromise: () => undefined,
    });
    expect(ref.current).toBe("ag-owned");
    expect(state).toBe("ag-owned");
    expect(bumped).toBe(1);
    expect(readOwnershipMigrationReceipt()).toBeNull();
  });

  it("replay is idempotent when canonical id already bound", () => {
    commitPostAuthOwnershipMigration({
      migratedAgreementIds: ["ag-owned"],
      priorClientAgreementId: "ag-stale",
    });
    const ref = { current: "ag-owned" as string | null };
    applyPendingOwnershipMigrationToClient({
      reviewAgreementIdRef: ref,
      setReviewAgreementId: () => undefined,
      invalidateWorkspaceSession: () => undefined,
      clearEnsurePromise: () => undefined,
    });
    expect(readOwnershipMigrationReceipt()).toBeNull();
    clearOwnershipMigrationReceipt();
  });
});
