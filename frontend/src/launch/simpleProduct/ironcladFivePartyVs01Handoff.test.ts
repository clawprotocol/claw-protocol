/**
 * Ironclad 5-party QA fixture — party/contact extraction, free starter, Pro gates, VS01 handoff.
 */
import { describe, expect, it, vi } from "vitest";
import {
  IRONCLAD_JOINT_ROLLOUT_INTAKE,
  IRONCLAD_PARTIES,
} from "../../../e2e/fixtures/ironcladFivePartyRollout";
import { buildRecipientAccessMintBody } from "../../agreement/recipientAccessMintPayload";
import { extractIntakeContacts } from "../../components/agreements/paidProIntakeContactSubstitution";
import { buildAgreementPreviewText } from "../../components/agreements/agreementPreviewFromDraft";
import { enrichStarterPreviewPartiesFromIntake } from "../../components/agreements/starterOpeningPartyPreserve";
import { rejectPremiumDegradedFiller } from "../../components/agreements/premiumFullDraftClientAcceptance";
import { validateAndRepairPremiumAgreementStructure } from "../../components/agreements/premiumAgreementStructure";
import { formatMilestonePaymentTermsFromIntake } from "../../components/agreements/intakeCurrencyParse";
import type { ParsedDraftShape } from "../../components/agreements/intakeSmartDefaults";
import {
  buildAgreementVs01BridgeSession,
  mergeLiveDraftWithRecipientSetupForVs01Bridge,
  resolveRecipientSetupForVs01Bridge,
} from "./agreementToVs01SigningBridge";
import { writePremiumRecipientHandoffLinear } from "../../components/agreements/premiumPartyNamesHandoff";
import type { AgreementDraft } from "../../agreement/agreementTypes";

const IRONCLAD_MILESTONE_PAYMENT_TERMS =
  "$187,500 paid over six milestone payments tied to deployment stages and launch targets.";

function ironcladDraft(): ParsedDraftShape {
  return enrichStarterPreviewPartiesFromIntake(
    {
      title: "Joint AI Rollout",
      jurisdiction: "Texas",
      purpose: "Joint AI software rollout.",
      payment_terms: IRONCLAD_MILESTONE_PAYMENT_TERMS,
      duration: "24 months",
      due_date: "",
      effective_date: "Upon full execution by all parties",
      payment: { amount: 187_500, cadence: null, valid: true },
      parties: IRONCLAD_PARTIES.map((name) => ({ name, role: "party" })),
      agreement_family: "generic_business_agreement",
    },
    IRONCLAD_JOINT_ROLLOUT_INTAKE,
  );
}

describe("Ironclad five-party fixture", () => {
  it("preserves all five legal party names from intake", () => {
    const d = ironcladDraft();
    expect(d.parties?.map((p) => p.name)).toEqual([...IRONCLAD_PARTIES]);
  });

  it("maps five contacts to names, titles, and emails", () => {
    const contacts = extractIntakeContacts(IRONCLAD_JOINT_ROLLOUT_INTAKE);
    expect(contacts).toHaveLength(5);
    expect(contacts[0]?.name).toMatch(/Ethan Cole/i);
    expect(contacts[0]?.email).toBe("ethan.cole@ironcladsg.com");
    expect(contacts[1]?.title).toMatch(/CTO/i);
    expect(contacts[4]?.email).toBe("adrian.vale@vertexgridtech.com");
  });

  it("free starter preview avoids binding Systems, annual-only payment, and empty sections", () => {
    const milestone = formatMilestonePaymentTermsFromIntake(IRONCLAD_JOINT_ROLLOUT_INTAKE);
    expect(milestone).toMatch(/\$187,500/);
    expect(milestone).toMatch(/six milestone payments/i);
    const d = ironcladDraft();
    expect(d.payment_terms).toMatch(/six milestone payments/i);
    const preview = buildAgreementPreviewText(d, {
      starterPreview: true,
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
    });
    expect(preview).not.toMatch(/binding Systems Group LLC/i);
    expect(preview).not.toMatch(/\bannual payment\b/i);
    expect(d.jurisdiction).toMatch(/Texas/i);
    expect(preview).toMatch(/six milestone payments/i);
    for (const party of IRONCLAD_PARTIES) {
      expect(preview).toContain(party);
    }
  });

  it("Pro quality gate rejects good-faith filler repeated more than twice", () => {
    const filler =
      "The Parties shall perform their obligations in good faith and in accordance with this Agreement.\n";
    const body = filler.repeat(4) + "1. SCOPE.\nOperative terms here.";
    const r = rejectPremiumDegradedFiller(body);
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("repeated_good_faith"))).toBe(true);
  });

  it("removes IMPLEMENTATION MILESTONES block inside Notices", () => {
    const body = [
      "16. NOTICES.",
      "4.1 Term. Initial term twenty-four months.",
      "IMPLEMENTATION MILESTONES",
      "| Milestone | Amount |",
      "| 1 | $30k |",
      "5. FEES.",
      "5.1 Payment terms apply.",
    ].join("\n");
    const { text } = validateAndRepairPremiumAgreementStructure(body);
    const noticesIdx = text.indexOf("16. NOTICES");
    const feesIdx = text.indexOf("5. FEES");
    const between = text.slice(noticesIdx, feesIdx);
    expect(between).not.toMatch(/IMPLEMENTATION MILESTONES/i);
  });

  it("recipient-access-token payload omits null fields and uses schema defaults", () => {
    const body = buildRecipientAccessMintBody({
      mode: "review",
      role: "signer",
      recipient_party_id: "pid-1",
      inviter_display_name: "Ironclad Systems Group LLC",
    });
    expect(body.mode).toBe("review");
    expect(body.role).toBe("signer");
    expect(body.ttl_seconds).toBeGreaterThan(0);
    expect(body.single_use).toBe(false);
    expect(Object.values(body).every((v) => v !== null)).toBe(true);
    expect(JSON.stringify(body)).not.toContain("null");
  });

  it("VS01 bridge carries five signer emails from handoff", () => {
    const ssStore: Record<string, string> = {};
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => ssStore[k] ?? null,
      setItem: (k: string, v: string) => {
        ssStore[k] = v;
      },
      removeItem: (k: string) => {
        delete ssStore[k];
      },
      clear: () => {
        Object.keys(ssStore).forEach((x) => delete ssStore[x]);
      },
      key: () => null,
      get length() {
        return Object.keys(ssStore).length;
      },
    } as Storage);

    const contacts = extractIntakeContacts(IRONCLAD_JOINT_ROLLOUT_INTAKE);
    writePremiumRecipientHandoffLinear(
      IRONCLAD_PARTIES.map((name, i) => ({
        name,
        email: contacts[i]?.email ?? "",
        role: i === 0 ? "owner" : "signer",
        signerName: contacts[i]?.name ?? "",
        signerTitle: contacts[i]?.title ?? "",
      })),
    );

    const draft = {
      title: "Multi-party",
      parties: IRONCLAD_PARTIES.map((name, i) => ({
        id: `p${i}`,
        name,
        role: i === 0 ? "owner" : "signer",
        email: "",
      })),
    } as AgreementDraft;

    const merged = mergeLiveDraftWithRecipientSetupForVs01Bridge(draft, null);
    const emails = (merged?.parties ?? []).map((p) => String((p as { email?: string }).email ?? "").trim());
    expect(emails.filter(Boolean)).toHaveLength(5);

    const bridge = buildAgreementVs01BridgeSession({
      agreementId: "ag-ironclad",
      vs01DocumentId: "doc-ironclad",
      draft: merged,
      senderFirstLawdogHandoff: true,
    });
    expect(bridge.counterparties).toHaveLength(4);
    expect(
      [bridge.creatorEmail, ...bridge.counterparties.map((c) => c.email)].filter((e) => e.includes("@")),
    ).toHaveLength(5);

    const resolved = resolveRecipientSetupForVs01Bridge(draft, null);
    expect(resolved?.recipientPartyEmails?.filter((e) => String(e).includes("@"))).toHaveLength(5);
    vi.unstubAllGlobals();
  });
});
