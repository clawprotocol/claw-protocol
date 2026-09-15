import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import * as agreementWorkspaceApi from "../../agreement/agreementWorkspaceApi";
import * as recipientAccessApi from "../../agreement/recipientAccessApi";
import * as ownerDeliveryTrack from "../../components/agreements/paidProOwnerDeliveryTrack";
import * as reviewEmailPartyRoles from "./reviewEmailPartyRoles";
import {
  isDurableSigningParticipantId,
  lockAuthoritativeVersionAndMintSigningInvites,
  requiredDirectSigningParticipantIds,
  resolveDirectSigningLockedVersionId,
} from "./paidProDirectSigningLockAndInvite";

function draft(overrides: Partial<AgreementDraft> = {}): AgreementDraft {
  return {
    id: "ag-direct",
    title: "Consulting Services Agreement",
    jurisdiction: "DE",
    parties: [
      { id: "harbor-uuid", name: "Harbor Peak Analytics LLC", role: "owner" },
      { id: "ironvale-uuid", name: "Ironvale Manufacturing Inc.", role: "reviewer" },
    ],
    purpose: "AI workflow",
    payment_terms: "$48,000",
    duration: "twelve months",
    due_date: null,
    effective_date: "2026-10-01",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    versions: [{ version: 1, created_at: "2026-09-01T00:00:00.000Z" }],
    audit_log: [],
    ...overrides,
  };
}

describe("paidProDirectSigningLockAndInvite", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects synthetic party_0 and emails-only placeholders", () => {
    expect(isDurableSigningParticipantId("party_0")).toBe(false);
    expect(isDurableSigningParticipantId("party_1")).toBe(false);
    expect(isDurableSigningParticipantId("")).toBe(false);
    expect(isDurableSigningParticipantId("legacy_p1")).toBe(false);
    expect(isDurableSigningParticipantId("harbor-uuid")).toBe(true);
    expect(isDurableSigningParticipantId("party_27:e02cafe9")).toBe(false);
  });

  it("requires durable owner and counterparty ids, never array order", () => {
    expect(requiredDirectSigningParticipantIds(draft())).toEqual(["harbor-uuid", "ironvale-uuid"]);
    expect(
      requiredDirectSigningParticipantIds(
        draft({
          parties: [
            { id: "party_0", name: "Harbor Peak Analytics LLC", role: "owner" },
            { id: "ironvale-uuid", name: "Ironvale Manufacturing Inc.", role: "reviewer" },
          ],
        }),
      ),
    ).toEqual(["ironvale-uuid"]);
  });

  it("reuses an existing lock id and otherwise uses the last version", () => {
    expect(resolveDirectSigningLockedVersionId(draft(), "ag-direct", "lv-existing")).toBe("lv-existing");
    expect(resolveDirectSigningLockedVersionId(draft(), "ag-direct")).toBe("v1");
  });

  it("locks the server draft using durable ids, never party_0", async () => {
    vi.spyOn(ownerDeliveryTrack, "persistOwnerDeliveryTrack").mockResolvedValue(true);
    vi.spyOn(reviewEmailPartyRoles, "persistReviewEmailPartyRolesOnServer").mockResolvedValue({
      ok: true,
      draft: draft(),
      rolesPersisted: true,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: draft(),
      lockedVersionId: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: draft(),
    });
    const lockSpy = vi.spyOn(recipientAccessApi, "putSigningLock").mockResolvedValue({ ok: true });
    const mintSpy = vi.spyOn(recipientAccessApi, "mintRecipientAccessTokenResult");

    const result = await lockAuthoritativeVersionAndMintSigningInvites({
      agreementId: "ag-direct",
      draft: draft({
        parties: [
          { id: "party_0", name: "Harbor Peak Analytics LLC", role: "owner" },
          { id: "party_1", name: "Ironvale Manufacturing Inc.", role: "reviewer" },
        ],
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ownerPartyId).toBe("harbor-uuid");
    expect(result.lockedVersionId).toBe("v1");
    expect(result.requiredParticipantIds).toEqual(["harbor-uuid", "ironvale-uuid"]);
    expect(result.mintAllRequiredSignTokens).toBe(false);
    expect(lockSpy).toHaveBeenCalledWith(
      "ag-direct",
      expect.objectContaining({ locked_version_id: "v1", locked_by: "owner" }),
    );
    expect(mintSpy).not.toHaveBeenCalled();
  });

  it("fails closed when the owner binding is missing or synthetic", async () => {
    vi.spyOn(ownerDeliveryTrack, "persistOwnerDeliveryTrack").mockResolvedValue(true);
    const noOwner = draft({
      parties: [{ id: "ironvale-uuid", name: "Ironvale Manufacturing Inc.", role: "reviewer" }],
    });
    vi.spyOn(reviewEmailPartyRoles, "persistReviewEmailPartyRolesOnServer").mockResolvedValue({
      ok: true,
      draft: noOwner,
      rolesPersisted: false,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: noOwner,
      lockedVersionId: null,
    });

    const result = await lockAuthoritativeVersionAndMintSigningInvites({
      agreementId: "ag-direct",
      draft: noOwner,
    });
    expect(result).toEqual({ ok: false, reason: "missing_owner_participant" });
  });

  it("locks a four-party draft without rewriting a commercial role to owner and mints every party", async () => {
    const fourParty = draft({
      parties: [
        { id: "lumen-uuid", name: "Lumen Bioinformatics Inc.", role: "Platform Developer" },
        { id: "thalassa-uuid", name: "Thalassa Data Systems LLC", role: "Data Infrastructure Provider" },
        { id: "coastal-uuid", name: "Coastal Meridian Analytics LLC", role: "Analytics Integrator" },
        { id: "vanguard-uuid", name: "Vanguard Regulatory Sciences Ltd.", role: "Regulatory Compliance Advisor" },
      ],
    });
    vi.spyOn(ownerDeliveryTrack, "persistOwnerDeliveryTrack").mockResolvedValue(true);
    vi.spyOn(reviewEmailPartyRoles, "persistReviewEmailPartyRolesOnServer").mockResolvedValue({
      ok: true,
      draft: fourParty,
      rolesPersisted: false,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: fourParty,
      lockedVersionId: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: fourParty,
    });
    vi.spyOn(recipientAccessApi, "putSigningLock").mockResolvedValue({ ok: true });

    const result = await lockAuthoritativeVersionAndMintSigningInvites({
      agreementId: "ag-direct",
      draft: fourParty,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mintAllRequiredSignTokens).toBe(true);
    expect(result.requiredParticipantIds).toEqual([
      "lumen-uuid",
      "thalassa-uuid",
      "coastal-uuid",
      "vanguard-uuid",
    ]);
    expect(fourParty.parties.some((party) => party.role === "owner")).toBe(false);
  });
});
