import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import * as agreementWorkspaceApi from "../../agreement/agreementWorkspaceApi";
import * as recipientAccessApi from "../../agreement/recipientAccessApi";
import * as ownerDeliveryTrack from "../../components/agreements/paidProOwnerDeliveryTrack";
import * as reviewEmailPartyRoles from "./reviewEmailPartyRoles";
import {
  isDurableSigningParticipantId,
  lockAndMintSigningInvitesFromPersistedDraft,
  lockAuthoritativeVersionAndMintSigningInvites,
  richerSigningPartyDraft,
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

  it("reuses an existing signing lock when delivery-track PATCH is negotiation-locked", async () => {
    const silverMesa = draft({
      parties: [
        { id: "ironclad-uuid", name: "Ironclad Systems Group LLC", role: "Sponsor" },
        { id: "harborline-uuid", name: "Harborline Data Solutions Inc.", role: "Vendor" },
        { id: "northwind-uuid", name: "Northwind Automation Partners LLC", role: "Integrator" },
        { id: "silver-uuid", name: "Silver Mesa Analytics LP", role: "Analyst" },
      ],
    });
    vi.spyOn(ownerDeliveryTrack, "persistOwnerDeliveryTrack").mockResolvedValue(false);
    vi.spyOn(reviewEmailPartyRoles, "persistReviewEmailPartyRolesOnServer").mockResolvedValue({
      ok: true,
      draft: silverMesa,
      rolesPersisted: false,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: silverMesa,
      lockedVersionId: "v-accepted",
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: silverMesa,
    });
    const lockSpy = vi.spyOn(recipientAccessApi, "putSigningLock").mockResolvedValue({ ok: true });

    const result = await lockAuthoritativeVersionAndMintSigningInvites({
      agreementId: "ag-silver-mesa",
      draft: silverMesa,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lockedVersionId).toBe("v-accepted");
    expect(result.requiredParticipantIds).toEqual([
      "ironclad-uuid",
      "harborline-uuid",
      "northwind-uuid",
      "silver-uuid",
    ]);
    expect(lockSpy).not.toHaveBeenCalled();
  });

  it("fails closed when delivery-track persist fails and no signing lock exists", async () => {
    vi.spyOn(ownerDeliveryTrack, "persistOwnerDeliveryTrack").mockResolvedValue(false);
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: draft(),
      lockedVersionId: null,
    });
    const result = await lockAuthoritativeVersionAndMintSigningInvites({
      agreementId: "ag-direct",
      draft: draft(),
    });
    expect(result).toEqual({ ok: false, reason: "delivery_track_persist_failed" });
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

  it("mints every Silver Mesa commercial role from persisted ids, not review-link count or list position", async () => {
    const silverMesa = draft({
      parties: [
        {
          id: "ironclad-uuid",
          name: "Ironclad Systems Group LLC",
          role: "Sponsor",
          signerName: "Ethan Cole",
          email: "ethan.cole@ironcladsg.com",
        },
        {
          id: "harborline-uuid",
          name: "Harborline Data Solutions Inc.",
          role: "Vendor",
          signerName: "Maya Bennett",
          email: "maya.bennett@harborlinedata.com",
        },
        {
          id: "northwind-uuid",
          name: "Northwind Automation Partners LLC",
          role: "Integrator",
          signerName: "Lucas Reed",
          email: "lucas.reed@northwindap.io",
        },
        {
          id: "silver-uuid",
          name: "Silver Mesa Analytics LP",
          role: "Analyst",
          signerName: "Olivia Hart",
          email: "olivia.hart@silvermesaanalytics.com",
        },
      ],
    });
    expect(requiredDirectSigningParticipantIds(silverMesa)).toEqual([
      "ironclad-uuid",
      "harborline-uuid",
      "northwind-uuid",
      "silver-uuid",
    ]);
    vi.spyOn(ownerDeliveryTrack, "persistOwnerDeliveryTrack").mockResolvedValue(true);
    vi.spyOn(reviewEmailPartyRoles, "persistReviewEmailPartyRolesOnServer").mockResolvedValue({
      ok: true,
      draft: silverMesa,
      rolesPersisted: true,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: silverMesa,
      lockedVersionId: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: silverMesa,
    });
    vi.spyOn(recipientAccessApi, "putSigningLock").mockResolvedValue({ ok: true });
    const mintSpy = vi.spyOn(recipientAccessApi, "mintRecipientAccessTokenResult").mockResolvedValue({
      ok: true,
      data: { token: "tok", expires_in_seconds: 3600, locked_version_id: "v1" },
    });

    const result = await lockAndMintSigningInvitesFromPersistedDraft({
      agreementId: "ag-silver-mesa",
      draft: silverMesa,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mintAllRequiredSignTokens).toBe(true);
    expect(result.requiredParticipantIds).toEqual([
      "ironclad-uuid",
      "harborline-uuid",
      "northwind-uuid",
      "silver-uuid",
    ]);
    expect(result.mintedParticipantIds).toEqual(result.requiredParticipantIds);
    expect(mintSpy).toHaveBeenCalledTimes(4);
    expect(mintSpy).toHaveBeenCalledWith(
      "ag-silver-mesa",
      { mode: "sign", role: "signer", recipient_party_id: "silver-uuid" },
      "",
    );
  });

  it("derives required signer ids from the persisted manifest for two, three, and four legal parties", () => {
    expect(
      requiredDirectSigningParticipantIds(
        draft({
          parties: [
            { id: "harbor-uuid", name: "Harbor Peak Analytics LLC", role: "Consultant" },
            { id: "ironvale-uuid", name: "Ironvale Manufacturing Inc.", role: "Client" },
          ],
        }),
      ),
    ).toEqual(["harbor-uuid", "ironvale-uuid"]);
    expect(
      requiredDirectSigningParticipantIds(
        draft({
          parties: [
            { id: "harbor-uuid", name: "Harbor Peak Analytics LLC", role: "Consultant" },
            { id: "ironvale-uuid", name: "Ironvale Manufacturing Inc.", role: "Client" },
            { id: "alex-uuid", name: "Alex Rivera", role: "Advisor" },
          ],
        }),
      ),
    ).toEqual(["harbor-uuid", "ironvale-uuid", "alex-uuid"]);
    expect(
      requiredDirectSigningParticipantIds(
        draft({
          parties: [
            { id: "ironclad-uuid", name: "Ironclad Systems Group LLC", role: "Sponsor" },
            { id: "harborline-uuid", name: "Harborline Data Solutions Inc.", role: "Vendor" },
            { id: "northwind-uuid", name: "Northwind Automation Partners LLC", role: "Integrator" },
            { id: "silver-uuid", name: "Silver Mesa Analytics LP", role: "Analyst" },
          ],
        }),
      ),
    ).toEqual(["ironclad-uuid", "harborline-uuid", "northwind-uuid", "silver-uuid"]);
  });

  it("prefers the draft that still has the durable added party after a two-party GET collapse", async () => {
    const threeParty = draft({
      parties: [
        { id: "harbor-uuid", name: "Harbor Peak Analytics LLC", role: "Consultant" },
        { id: "ironvale-uuid", name: "Ironvale Manufacturing Inc.", role: "Client" },
        { id: "alex-uuid", name: "Alex Rivera", role: "Advisor" },
      ],
    });
    const collapsed = draft({
      parties: [
        { id: "harbor-uuid", name: "Harbor Peak Analytics LLC", role: "Consultant" },
        { id: "ironvale-uuid", name: "Ironvale Manufacturing Inc.", role: "Client" },
      ],
    });
    expect(richerSigningPartyDraft(collapsed, threeParty)).toBe(threeParty);

    vi.spyOn(ownerDeliveryTrack, "persistOwnerDeliveryTrack").mockResolvedValue(true);
    vi.spyOn(reviewEmailPartyRoles, "persistReviewEmailPartyRolesOnServer").mockResolvedValue({
      ok: true,
      draft: collapsed,
      rolesPersisted: true,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: collapsed,
      lockedVersionId: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: threeParty,
    });
    const lockSpy = vi.spyOn(recipientAccessApi, "putSigningLock").mockResolvedValue({ ok: true });

    const result = await lockAuthoritativeVersionAndMintSigningInvites({
      agreementId: "ag-direct",
      draft: threeParty,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mintAllRequiredSignTokens).toBe(true);
    expect(result.requiredParticipantIds).toEqual(["harbor-uuid", "ironvale-uuid", "alex-uuid"]);
    expect(lockSpy).toHaveBeenCalled();
  });

  it("prefers owner/reviewer over an equal-score Client/Service Provider sibling", () => {
    const commercial = draft({
      parties: [
        { id: "harbor-uuid", name: "Harbor Peak Analytics LLC", role: "Client", signerName: "Maya Chen" },
        {
          id: "ironvale-uuid",
          name: "Ironvale Manufacturing Inc.",
          role: "Service Provider",
          signerName: "Jordan Hale",
        },
      ],
    });
    const ownerNormalized = draft({
      parties: [
        { id: "harbor-uuid", name: "Harbor Peak Analytics LLC", role: "owner", signerName: "Maya Chen" },
        { id: "ironvale-uuid", name: "Ironvale Manufacturing Inc.", role: "reviewer", signerName: "Jordan Hale" },
      ],
    });
    expect(richerSigningPartyDraft(commercial, ownerNormalized)).toBe(ownerNormalized);
    expect(richerSigningPartyDraft(ownerNormalized, commercial)).toBe(ownerNormalized);
  });

  it("locks a two-party Client/Service Provider send after persist stamps owner/reviewer", async () => {
    const commercial = draft({
      parties: [
        { id: "harbor-uuid", name: "Harbor Peak Analytics LLC", role: "Client", signerName: "Maya Chen" },
        {
          id: "ironvale-uuid",
          name: "Ironvale Manufacturing Inc.",
          role: "Service Provider",
          signerName: "Jordan Hale",
        },
      ],
    });
    const ownerNormalized = draft({
      parties: [
        { id: "harbor-uuid", name: "Harbor Peak Analytics LLC", role: "owner", signerName: "Maya Chen" },
        { id: "ironvale-uuid", name: "Ironvale Manufacturing Inc.", role: "reviewer", signerName: "Jordan Hale" },
      ],
    });
    vi.spyOn(ownerDeliveryTrack, "persistOwnerDeliveryTrack").mockResolvedValue(true);
    vi.spyOn(reviewEmailPartyRoles, "persistReviewEmailPartyRolesOnServer").mockResolvedValue({
      ok: true,
      draft: ownerNormalized,
      rolesPersisted: true,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: commercial,
      lockedVersionId: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: ownerNormalized,
    });
    const lockSpy = vi.spyOn(recipientAccessApi, "putSigningLock").mockResolvedValue({ ok: true });

    const result = await lockAuthoritativeVersionAndMintSigningInvites({
      agreementId: "ag-direct",
      draft: commercial,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ownerPartyId).toBe("harbor-uuid");
    expect(result.requiredParticipantIds).toEqual(["harbor-uuid", "ironvale-uuid"]);
    expect(result.mintAllRequiredSignTokens).toBe(false);
    expect(lockSpy).toHaveBeenCalledWith(
      "ag-direct",
      expect.objectContaining({ locked_version_id: "v1", locked_by: "owner" }),
    );
  });

  it("mints sign tokens for both two-party participants including the owner", async () => {
    const ownerNormalized = draft();
    vi.spyOn(ownerDeliveryTrack, "persistOwnerDeliveryTrack").mockResolvedValue(true);
    vi.spyOn(reviewEmailPartyRoles, "persistReviewEmailPartyRolesOnServer").mockResolvedValue({
      ok: true,
      draft: ownerNormalized,
      rolesPersisted: true,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: ownerNormalized,
      lockedVersionId: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: ownerNormalized,
    });
    vi.spyOn(recipientAccessApi, "putSigningLock").mockResolvedValue({ ok: true });
    const mintSpy = vi.spyOn(recipientAccessApi, "mintRecipientAccessTokenResult").mockResolvedValue({
      ok: true,
      data: { token: "tok", expires_in_seconds: 3600, locked_version_id: "v1" },
    });

    const result = await lockAndMintSigningInvitesFromPersistedDraft({
      agreementId: "ag-direct",
      draft: ownerNormalized,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mintedParticipantIds).toEqual(["harbor-uuid", "ironvale-uuid"]);
    expect(mintSpy).toHaveBeenCalledTimes(2);
    expect(mintSpy).toHaveBeenCalledWith(
      "ag-direct",
      { mode: "sign", role: "signer", recipient_party_id: "harbor-uuid" },
      "",
    );
    expect(mintSpy).toHaveBeenCalledWith(
      "ag-direct",
      { mode: "sign", role: "signer", recipient_party_id: "ironvale-uuid" },
      "",
    );
  });

  it("mints sign tokens from persisted GET parties after remount without an owner role", async () => {
    const threeParty = draft({
      parties: [
        { id: "harbor-uuid", name: "Harbor Peak Analytics LLC", role: "Consultant", signerName: "Pat Harbor" },
        { id: "ironvale-uuid", name: "Ironvale Manufacturing Inc.", role: "Client", signerName: "Sam Ironvale" },
        { id: "alex-uuid", name: "Alex Rivera", role: "Advisor", signerName: "Alex Rivera" },
      ],
    });
    vi.spyOn(ownerDeliveryTrack, "persistOwnerDeliveryTrack").mockResolvedValue(true);
    vi.spyOn(reviewEmailPartyRoles, "persistReviewEmailPartyRolesOnServer").mockResolvedValue({
      ok: true,
      draft: threeParty,
      rolesPersisted: true,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: threeParty,
      lockedVersionId: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: threeParty,
    });
    const lockSpy = vi.spyOn(recipientAccessApi, "putSigningLock").mockResolvedValue({ ok: true });
    const mintSpy = vi.spyOn(recipientAccessApi, "mintRecipientAccessTokenResult").mockResolvedValue({
      ok: true,
      data: { token: "tok", expires_in_seconds: 3600, locked_version_id: "v1" },
    });

    const result = await lockAndMintSigningInvitesFromPersistedDraft({
      agreementId: "ag-direct",
      draft: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mintedParticipantIds).toEqual(["harbor-uuid", "ironvale-uuid", "alex-uuid"]);
    expect(lockSpy).toHaveBeenCalledWith(
      "ag-direct",
      expect.objectContaining({ locked_version_id: "v1", locked_by: "owner" }),
    );
    expect(mintSpy).toHaveBeenCalledTimes(3);
    expect(mintSpy).toHaveBeenCalledWith(
      "ag-direct",
      { mode: "sign", role: "signer", recipient_party_id: "alex-uuid" },
      "",
    );
  });
});
