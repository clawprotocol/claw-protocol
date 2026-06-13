/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { ReviewMetaGrid } from "../../agreement/reviewFirstLayout";
import {
  buildAgreementVs01BridgeSession,
  type AgreementVs01BridgeSession,
} from "../../launch/simpleProduct/agreementToVs01SigningBridge";
import { navigateCreatorPrepareSignatureLinks } from "../../launch/creatorDashboardPrepareSignatureLinks";
import { resolveVs01EsignShellCopy } from "../../vs01/vs01EsignShellCopy";
import {
  PREPARE_PACKET_BRIDGE_PRIMARY_CTA_PARALLEL,
  resolvePreparePacketBridgePrimaryCta,
} from "../../vs01/vs01PreparePacketCompletion";
import { handlePreparePacketContinue } from "../../vs01/vs01PreparePacketContinue";
import type { PlacedSigningField } from "../../vs01/signingFields";
import {
  buildVs01PrepareSigningRoles,
  stampSenderFieldWithPrepareRole,
  type Vs01PrepareSigningRole,
} from "../../vs01/vs01SignerFieldAssignment";
import type { Vs01Counterparty } from "../../vs01/types";

const here = dirname(fileURLToPath(import.meta.url));

function completeRoleFields(role: Vs01PrepareSigningRole): PlacedSigningField[] {
  const base: PlacedSigningField = {
    id: `sig-${role.roleId}`,
    type: "signature",
    page: 0,
    x: 0.1,
    y: 0.1,
    width: 0.34,
    height: 0.075,
    assignedSignerRoleId: role.roleId,
  };
  return [stampSenderFieldWithPrepareRole(base, role)];
}

function twoPartyDraft(): AgreementDraft {
  return {
    id: "ag_test343",
    title: "Services Agreement",
    jurisdiction: "TX",
    parties: [
      {
        id: "p_owner",
        name: "Red Mesa Logistics LLC",
        role: "owner",
        email: "owner@example.com",
      },
      {
        id: "p_cp",
        name: "Harbor Peak Automation LLC",
        role: "party",
        email: "counterparty@example.com",
      },
    ],
    purpose: "Services",
    payment_terms: "Net 30",
    duration: "1y",
    due_date: null,
    effective_date: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T12:00:00.000Z",
    versions: [{ version: 1, created_at: "2026-06-01T00:00:00.000Z" }],
    audit_log: [
      {
        event_type: "participant_approved",
        at: "2026-06-01T11:00:00.000Z",
        value: { participant_id: "p_cp", participant_display_name: "Harbor Peak Automation LLC" },
      },
    ],
  } as AgreementDraft;
}

describe("test343 post-review / signature handoff UX", () => {
  it("recipient ReviewMetaGrid uses high-contrast dark-shell tone", () => {
    const html = renderToStaticMarkup(
      <ReviewMetaGrid
        tone="recipientDark"
        testId="recipient-summary-card"
        items={[
          { label: "Agreement", value: "Services Agreement" },
          { label: "Shared by", value: "Red Mesa Logistics LLC" },
          { label: "Parties", value: "Red Mesa Logistics LLC · Harbor Peak Automation LLC" },
        ]}
      />,
    );
    expect(html).toContain('data-review-meta-tone="recipientDark"');
    expect(html).toContain("text-slate-400");
    expect(html).toContain("text-slate-100");
    expect(html).not.toContain("text-slate-900");
  });

  it("default ReviewMetaGrid keeps owner/light document styling classes", () => {
    const html = renderToStaticMarkup(
      <ReviewMetaGrid items={[{ label: "Agreement", value: "Services Agreement" }]} />,
    );
    expect(html).toContain('data-review-meta-tone="default"');
    expect(html).toContain("text-slate-500");
    expect(html).toContain("text-slate-900");
  });

  it("VS01 bridge shell copy reflects auto-placed fields, not manual packet prep", () => {
    const bridge: AgreementVs01BridgeSession = {
      vs01DocumentId: "doc_343",
      agreementId: "ag_test343",
      agreementTitle: "Services Agreement",
      creatorName: "Red Mesa Logistics LLC",
      creatorEmail: "owner@example.com",
      counterparties: [
        { id: "p_cp", name: "Harbor Peak Automation LLC", email: "counterparty@example.com", phone: "" },
      ],
      targetStep: 2,
      senderFirstLawdogHandoff: true,
      source: "paid_pro_sender_first",
      signerFirst: true,
      reviewerApprovedCleanHandoff: true,
    };
    const copy = resolveVs01EsignShellCopy({
      search: "?agreement_bridge=1",
      seedDocumentId: "doc_343",
      bridge,
      vs01Step: 2,
    });
    expect(copy.title).toBe("Prepare signature links");
    expect(copy.subtitle).toMatch(/send signing links to all parties/i);
  });

  it("prepare bridge primary CTA sends signing links in parallel mode", () => {
    expect(resolvePreparePacketBridgePrimaryCta()).toBe(PREPARE_PACKET_BRIDGE_PRIMARY_CTA_PARALLEL);
    expect(PREPARE_PACKET_BRIDGE_PRIMARY_CTA_PARALLEL).toBe("Send signing links");
  });

  it("dashboard prepare signature links seeds VS01 bridge with two participants", async () => {
    const draft = twoPartyDraft();
    const session = buildAgreementVs01BridgeSession({
      agreementId: draft.id!,
      vs01DocumentId: "doc_bridge",
      draft,
      reviewerApprovedCleanHandoff: true,
      senderFirstLawdogHandoff: true,
    });
    expect(session.counterparties).toHaveLength(1);
    expect(session.creatorEmail).toContain("@");
    expect(session.counterparties[0]?.email).toContain("@");

    const navigate = vi.fn();
    const vs01 = await import("../../launch/simpleProduct/agreementToVs01SigningBridge");
    const spy = vi.spyOn(vs01, "tryNavigatePaidProAgreementSenderFirstVs01Esign").mockResolvedValue(true);
    const result = await navigateCreatorPrepareSignatureLinks({
      agreementId: draft.id!,
      navigate,
      draft,
      logSource: "creator_dashboard",
    });
    expect(result.vs01RouteAttempted).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewerApprovedCleanHandoff: true,
        agreementId: draft.id,
      }),
    );
    spy.mockRestore();
  });

  it("prepare packet continue preserves two participant links (owner + counterparty)", () => {
    const counterparties: Vs01Counterparty[] = [
      {
        id: "p_cp",
        name: "Harbor Peak Automation LLC",
        email: "counterparty@example.com",
        signerName: "Harbor Peak Automation LLC",
      },
    ];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_test343",
      creatorName: "Red Mesa Logistics LLC",
      creatorEmail: "owner@example.com",
      counterparties,
    });
    expect(roles.filter((r) => r.requiresSignature)).toHaveLength(2);

    let sender: PlacedSigningField[] = [];
    for (const role of roles) {
      sender = [...sender, ...completeRoleFields(role)];
    }

    const result = handlePreparePacketContinue({
      agreementId: "ag_test343",
      agreementTitle: "Services Agreement",
      documentId: "doc_343",
      creatorName: "Red Mesa Logistics LLC",
      creatorEmail: "owner@example.com",
      counterparties,
      senderPlacedFields: sender,
      recipientPlacedFields: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handoff.signers).toHaveLength(1);
    expect(result.handoff.ownerSigningUrl).toMatch(/doc_343/);
    expect(result.handoff.signers[0]?.email).toBe("counterparty@example.com");
    expect(result.handoff.signers[0]?.signingUrl).toMatch(/doc_343/);
    expect(result.handoff.senderMustSignFirst).toBe(false);
    expect(result.handoff.signers[0]?.signingUrl).not.toBe(result.handoff.ownerSigningUrl);
  });

  it("Vs01Wizard packet-prepared log uses totalParticipantCount semantics", () => {
    const wizardSrc = readFileSync(join(here, "../../vs01/Vs01Wizard.tsx"), "utf8");
    expect(wizardSrc).toContain("counterpartySignerCount");
    expect(wizardSrc).toContain("totalParticipantCount");
    expect(wizardSrc).toContain("senderMustSignFirst");
  });
});
