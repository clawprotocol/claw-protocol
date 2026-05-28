import { afterEach, describe, expect, it } from "vitest";
import {
  clearAuthoritativeAgreementDocument,
  establishAuthoritativeAgreementDocument,
} from "./authoritativeAgreementDocument";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { mergePremiumDraftPartiesWithRecipientPriority } from "./reviewPlaceholderGuard";
import { resolveCanonicalPartyIdentitiesFromSignerSetup } from "./guidedDealCompletion/signerPartyIdentity";
import {
  assertSignerPartyManifestHashesMatch,
  fingerprintSignerPartyManifest,
} from "./signerPartyManifestInvariants";
import {
  assertSignerSlotLegalEntityForPersist,
  assertEditableSignerRenderValueInvariant,
  compactDisplayNameFromLegalEntity,
  containsMultipleCanonicalLegalEntities,
  detectSignerSlotContamination,
  hydrateLegalEntityNameFromHandoff,
  isShortPrefixOfFullLegal,
  resolveEditableSignerLegalEntityForSlot,
  resolvePaidProSignerDetailsGate,
  resolveLegalEntityNameForHandoffSlot,
  resolveSignerSetupRenderSlot,
  resolveSignerSetupPartyIdentities,
  resolveSignerSetupPartyIdentity,
  shouldUpgradeRecipientNameToLegalEntity,
} from "./signerSetupPartyIdentity";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const baseDraft = (parties: ParsedDraftShape["parties"]): ParsedDraftShape => ({
  title: "Services Agreement",
  jurisdiction: "TX",
  parties,
  purpose: "Services",
  payment_terms: "Milestones",
  duration: "1y",
  due_date: null,
  effective_date: "Signing",
  payment: { amount: null, cadence: null, valid: true },
});

const SIGNER_SLOT_ARGS = {
  sendMode: "review" as const,
  recipientsDeferred: false,
};

const INTAKE = [
  "Services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
  "Provider delivers workflow automation and CRM integration.",
].join(" ");

const BODY = [
  "This Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
  "Red Mesa Logistics LLC engages Harbor Peak Automation LLC for services.",
].join(" ");

afterEach(() => {
  clearAuthoritativeAgreementDocument();
});

describe("signerSetupPartyIdentity", () => {
  it("pre-fills Red Mesa Logistics LLC and Harbor Peak Automation LLC from authoritative manifest", () => {
    establishAuthoritativeAgreementDocument({
      fullCorpusText: BODY,
      canonicalPartyManifest: [
        { name: "Red Mesa Logistics LLC", role: "client" },
        { name: "Harbor Peak Automation LLC", role: "service_provider" },
      ],
    });
    const p0 = resolveSignerSetupPartyIdentity({
      partyIndex: 0,
      draftPartyName: "Red Mesa",
      recipientDisplayName: "Red Mesa",
      handoffName: "Red Mesa",
      intakeText: INTAKE,
      agreementBodyText: BODY,
      log: false,
    });
    const p1 = resolveSignerSetupPartyIdentity({
      partyIndex: 1,
      draftPartyName: "Harbor Peak",
      recipientDisplayName: "Harbor Peak",
      handoffName: "Harbor Peak",
      intakeText: INTAKE,
      agreementBodyText: BODY,
      log: false,
    });
    expect(p0.legalEntityName).toBe("Red Mesa Logistics LLC");
    expect(p1.legalEntityName).toBe("Harbor Peak Automation LLC");
    expect(p0.source).toBe("authoritative_manifest");
    expect(p1.source).toBe("authoritative_manifest");
  });

  it("paid Pro signer details gate pre-fills legal names but requires signer names and emails", () => {
    const identities = resolveSignerSetupPartyIdentities({
      parties: [{ name: "Red Mesa Logistics LLC" }, { name: "Harbor Peak Automation LLC" }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
    });
    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      signerSetupPartyIdentities: identities,
      draftPartyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      partySignerNames: ["", ""],
      recipient1Name: "Red Mesa Logistics LLC",
      recipient2Name: "Harbor Peak Automation LLC",
      recipient1Email: "",
      recipient2Email: "",
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(false);
    expect(gate.legalEntityNames).toEqual(["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"]);
    expect(gate.blockers.some((b) => b.field === "signer_name")).toBe(true);
    expect(gate.blockers.some((b) => b.field === "email")).toBe(true);
    expect(gate.blockerMessage).toMatch(/signer name|signer email/i);
  });

  it("paid Pro signer details gate completes when signer names and emails are present", () => {
    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      partySignerNames: ["Alex Client", "Priya Provider"],
      recipient1Name: "Red Mesa Logistics LLC",
      recipient2Name: "Harbor Peak Automation LLC",
      recipient1Email: "alex@redmesa.test",
      recipient2Email: "priya@harborpeak.test",
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(true);
    expect(gate.blockers).toEqual([]);
  });

  it("uses compact display names only as displayName, not legalEntityName", () => {
    const identity = resolveSignerSetupPartyIdentity({
      partyIndex: 0,
      draftPartyName: "Red Mesa Logistics LLC",
      log: false,
    });
    expect(identity.legalEntityName).toBe("Red Mesa Logistics LLC");
    expect(identity.displayName).toBe(compactDisplayNameFromLegalEntity("Red Mesa Logistics LLC"));
    expect(identity.displayName).not.toContain("LLC");
  });

  it("upgrades short handoff labels to full legal names", () => {
    const legal = resolveLegalEntityNameForHandoffSlot({
      partyIndex: 0,
      currentSlotName: "Red Mesa",
      draftPartyName: "Red Mesa",
      intakeText: INTAKE,
      agreementBodyText: BODY,
      draftPartyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
    });
    expect(legal).toBe("Red Mesa Logistics LLC");
  });

  it("does not render user legal entity edits over canonical slot identity", () => {
    expect(
      shouldUpgradeRecipientNameToLegalEntity("Red Mesa Logistics LLC", "Red Mesa Logistics LLC"),
    ).toBe(false);
    expect(
      hydrateLegalEntityNameFromHandoff("Custom Entity LLC", "Red Mesa", "Red Mesa Logistics LLC"),
    ).toBe("Red Mesa Logistics LLC");
  });

  it("detects short prefix of full legal entity", () => {
    expect(isShortPrefixOfFullLegal("Red Mesa", "Red Mesa Logistics LLC")).toBe(true);
    expect(isShortPrefixOfFullLegal("Harbor Peak", "Harbor Peak Automation LLC")).toBe(true);
    expect(isShortPrefixOfFullLegal("Acme Corp", "Beta LLC")).toBe(false);
  });

  it("canonical final party manifest and VS01 identities use full legal names, not short labels", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      ...SIGNER_SLOT_ARGS,
      partyCount: 2,
      recipient1Name: "Red Mesa",
      recipient2Name: "Harbor Peak",
      recipient1Email: "",
      recipient2Email: "",
      draftPartyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      partySignerNames: ["", ""],
      extraPartyReviewEmails: [],
    });
    expect(manifest.parties[0]?.partyName).toBe("Red Mesa Logistics LLC");
    expect(manifest.parties[1]?.partyName).toBe("Harbor Peak Automation LLC");
    const identities = resolveCanonicalPartyIdentitiesFromSignerSetup({
      ...SIGNER_SLOT_ARGS,
      partyCount: 2,
      recipient1Name: "Red Mesa",
      recipient2Name: "Harbor Peak",
      recipient1Email: "",
      recipient2Email: "",
      draftPartyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      partySignerNames: ["", ""],
      extraPartyReviewEmails: [],
    });
    expect(identities[0]?.partyDisplayName).toBe("Red Mesa Logistics LLC");
    expect(identities[1]?.partyDisplayName).toBe("Harbor Peak Automation LLC");
  });

  it("Party 1 editable field equals Red Mesa Logistics LLC and excludes Harbor Peak", () => {
    establishAuthoritativeAgreementDocument({
      fullCorpusText: BODY,
      canonicalPartyManifest: [
        { name: "Red Mesa Logistics LLC", role: "client" },
        { name: "Harbor Peak Automation LLC", role: "service_provider" },
      ],
    });
    const identities = resolveSignerSetupPartyIdentities({
      parties: [{ name: "Red Mesa Logistics LLC" }, { name: "Harbor Peak Automation LLC" }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
    });
    const party1 = resolveEditableSignerLegalEntityForSlot({
      slotIndex: 0,
      currentInputValue: "Red Mesa Logistics LLC Harbor Peak Automation LLC",
      slotIdentities: identities,
    });
    const party2 = resolveEditableSignerLegalEntityForSlot({
      slotIndex: 1,
      currentInputValue: "Harbor Peak Automation LLC",
      slotIdentities: identities,
    });
    expect(party1).toBe("Red Mesa Logistics LLC");
    expect(party2).toBe("Harbor Peak Automation LLC");
    expect(party1).not.toContain("Harbor Peak");
    expect(party2).not.toContain("Red Mesa Logistics");
  });

  it("rejects combined party strings via contamination guard on persist", () => {
    const identities = resolveSignerSetupPartyIdentities({
      parties: [{ name: "Red Mesa Logistics LLC" }, { name: "Harbor Peak Automation LLC" }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
    });
    expect(() =>
      assertSignerSlotLegalEntityForPersist({
        slotIndex: 0,
        attemptedValue: "Red Mesa Logistics LLC Harbor Peak Automation LLC",
        slotIdentities: identities,
        source: "test_persist",
      }),
    ).toThrow(/signer-slot-contamination-persist/);
    const clean = assertSignerSlotLegalEntityForPersist({
      slotIndex: 0,
      attemptedValue: "Red Mesa Logistics LLC",
      slotIdentities: identities,
      source: "test_persist_clean",
    });
    expect(clean).toBe("Red Mesa Logistics LLC");
  });

  it("corrects contaminated handoff slot names", () => {
    const identities = resolveSignerSetupPartyIdentities({
      parties: [{ name: "Red Mesa Logistics LLC" }, { name: "Harbor Peak Automation LLC" }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
    });
    expect(
      resolveLegalEntityNameForHandoffSlot({
        partyIndex: 0,
        currentSlotName: "Red Mesa Logistics LLC Harbor Peak Automation LLC",
        slotIdentities: identities,
        intakeText: INTAKE,
        agreementBodyText: BODY,
        draftPartyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      }),
    ).toBe("Red Mesa Logistics LLC");
  });

  it("supports 3-party slot isolation", () => {
    const identities = resolveSignerSetupPartyIdentities({
      parties: [
        { name: "Alpha LLC" },
        { name: "Beta LLC" },
        { name: "Gamma LLC" },
      ],
      intakeText: "Agreement among Alpha LLC, Beta LLC, and Gamma LLC.",
      agreementBodyText: "Between Alpha LLC, Beta LLC, and Gamma LLC.",
    });
    expect(identities).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      const otherNames = identities.filter((_, j) => j !== i).map((id) => id.legalEntityName);
      const contaminated = [...otherNames, identities[i]!.legalEntityName].join(" ");
      const corrected = resolveEditableSignerLegalEntityForSlot({
        slotIndex: i,
        currentInputValue: contaminated,
        slotIdentities: identities,
      });
      expect(corrected).toBe(identities[i]!.legalEntityName);
    }
  });

  it("preserves three canonical slots even when the body repeats one entity", () => {
    const identities = resolveSignerSetupPartyIdentities({
      parties: [
        { name: "Alpha Services LLC" },
        { name: "Beta Operations LLC" },
        { name: "Gamma Holdings LLC" },
      ],
      intakeText: "Services agreement among Alpha Services LLC, Beta Operations LLC, and Gamma Holdings LLC.",
      agreementBodyText: [
        "Alpha Services LLC appoints Beta Operations LLC as implementation provider.",
        "Alpha Services LLC will coordinate approvals with Gamma Holdings LLC.",
        "Alpha Services LLC appears several times but remains only Party 1.",
      ].join(" "),
    });
    expect(identities.map((id) => id.legalEntityName)).toEqual([
      "Alpha Services LLC",
      "Beta Operations LLC",
      "Gamma Holdings LLC",
    ]);
    expect(new Set(identities.map((id) => id.legalEntityName)).size).toBe(3);
  });

  it("keeps signer metadata attached to canonical slots after refresh-style hydration", () => {
    const identities = resolveSignerSetupPartyIdentities({
      parties: [{ name: "Alpha Services LLC" }, { name: "Beta Operations LLC" }],
      intakeText: "Agreement between Alpha Services LLC and Beta Operations LLC.",
      agreementBodyText: "Alpha Services LLC retains Beta Operations LLC for implementation services.",
    });
    const hydratedSlot = resolveSignerSetupRenderSlot({
      slotIndex: 1,
      currentLegalEntityValue: "Beta",
      slotIdentities: identities,
      email: "signer.beta@example.test",
      signerName: "Jordan Beta",
      signerTitle: "COO",
      partyAddress: "2 Main Street",
      source: "refresh_hydration",
    });
    expect(hydratedSlot.canonicalLegalEntity).toBe("Beta Operations LLC");
    expect(hydratedSlot.persistedSignerMetadata).toMatchObject({
      email: "signer.beta@example.test",
      signerName: "Jordan Beta",
      signerTitle: "COO",
      partyAddress: "2 Main Street",
    });
  });

  it("isolates same-leading-token entities", () => {
    const identities = resolveSignerSetupPartyIdentities({
      parties: [{ name: "Red Mesa Logistics LLC" }, { name: "Red Mesa Automation LLC" }],
      intakeText: "Between Red Mesa Logistics LLC and Red Mesa Automation LLC.",
      agreementBodyText: "Red Mesa Logistics LLC and Red Mesa Automation LLC.",
    });
    expect(identities[0]?.legalEntityName).toBe("Red Mesa Logistics LLC");
    expect(identities[1]?.legalEntityName).toBe("Red Mesa Automation LLC");
    const p0 = resolveEditableSignerLegalEntityForSlot({
      slotIndex: 0,
      currentInputValue: "Red Mesa Logistics LLC Red Mesa Automation LLC",
      slotIdentities: identities,
    });
    expect(p0).toBe("Red Mesa Logistics LLC");
    expect(p0).not.toContain("Automation");
  });

  it("manual legal entity edits do not render over canonical slot values", () => {
    const identities = resolveSignerSetupPartyIdentities({
      parties: [{ name: "Red Mesa Logistics LLC" }, { name: "Harbor Peak Automation LLC" }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
    });
    const edited = resolveEditableSignerLegalEntityForSlot({
      slotIndex: 0,
      currentInputValue: "Custom Client Entity LLC",
      slotIdentities: identities,
    });
    expect(edited).toBe("Red Mesa Logistics LLC");
    const party2 = resolveEditableSignerLegalEntityForSlot({
      slotIndex: 1,
      currentInputValue: identities[1]!.legalEntityName,
      slotIdentities: identities,
    });
    expect(party2).toBe("Harbor Peak Automation LLC");
    expect(party2).not.toContain("Custom Client");
  });

  it("render model separates canonical legal entity, compact label, and signer metadata", () => {
    const identities = resolveSignerSetupPartyIdentities({
      parties: [{ name: "Red Mesa Logistics LLC" }, { name: "Harbor Peak Automation LLC" }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
    });
    const slot = resolveSignerSetupRenderSlot({
      slotIndex: 0,
      currentLegalEntityValue: "Red Mesa Logistics LLC Harbor Peak Automation LLC",
      slotIdentities: identities,
      email: "legal@redmesa.test",
      signerName: "Avery Client",
      signerTitle: "Manager",
      source: "test_render_slot",
    });
    expect(slot.canonicalLegalEntity).toBe("Red Mesa Logistics LLC");
    expect(slot.compactDisplayLabel).toBe(compactDisplayNameFromLegalEntity("Red Mesa Logistics LLC"));
    expect(slot.persistedSignerMetadata).toMatchObject({
      email: "legal@redmesa.test",
      signerName: "Avery Client",
      signerTitle: "Manager",
    });
    assertEditableSignerRenderValueInvariant({
      slotIndex: 0,
      renderedValue: slot.canonicalLegalEntity,
      slotIdentities: identities,
      source: "test_render_slot",
    });
    expect(() =>
      assertEditableSignerRenderValueInvariant({
        slotIndex: 0,
        renderedValue: "Red Mesa Logistics LLC Harbor Peak Automation LLC",
        slotIdentities: identities,
        source: "test_bad_render_slot",
      }),
    ).toThrow(/editable-signer-render-invariant/);
  });

  it("compact display may shorten while legal entity stays full", () => {
    const identity = resolveSignerSetupPartyIdentity({
      partyIndex: 0,
      draftPartyName: "Red Mesa Logistics LLC",
      log: false,
    });
    expect(identity.displayName.length).toBeLessThan(identity.legalEntityName.length);
    expect(identity.legalEntityName).toContain("LLC");
  });

  it("manifest hash invariant holds across signer setup and VS01 identities", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      ...SIGNER_SLOT_ARGS,
      partyCount: 2,
      recipient1Name: "Red Mesa Logistics LLC Harbor Peak Automation LLC",
      recipient2Name: "Harbor Peak Automation LLC",
      recipient1Email: "",
      recipient2Email: "",
      draftPartyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      partySignerNames: ["", ""],
      extraPartyReviewEmails: [],
    });
    const identities = resolveCanonicalPartyIdentitiesFromSignerSetup({
      ...SIGNER_SLOT_ARGS,
      partyCount: 2,
      recipient1Name: "Red Mesa Logistics LLC Harbor Peak Automation LLC",
      recipient2Name: "Harbor Peak Automation LLC",
      recipient1Email: "",
      recipient2Email: "",
      draftPartyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      partySignerNames: ["", ""],
      extraPartyReviewEmails: [],
    });
    const authoritative = ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"];
    assertSignerPartyManifestHashesMatch({
      label: "red_mesa_harbor_peak",
      authoritativeNames: authoritative,
      signerSetupNames: manifest.parties.map((p) => p.partyName),
      vs01Names: identities.map((i) => i.partyDisplayName),
    });
    expect(fingerprintSignerPartyManifest(authoritative)).toBe(
      fingerprintSignerPartyManifest(manifest.parties.map((p) => p.partyName)),
    );
  });

  it("detects joined party list contamination", () => {
    const identities = resolveSignerSetupPartyIdentities({
      parties: [{ name: "A LLC" }, { name: "B LLC" }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
    });
    expect(
      containsMultipleCanonicalLegalEntities("A LLC B LLC", identities.map((i) => i.legalEntityName)),
    ).toBe(true);
    expect(
      detectSignerSlotContamination(0, "A LLC B LLC", identities).contaminated,
    ).toBe(true);
  });

  it("review-link handoff merge does not overwrite full legal names with short recipient labels", () => {
    const premiumDraft = baseDraft([
      { name: "Red Mesa Logistics LLC", role: "client" },
      { name: "Harbor Peak Automation LLC", role: "service_provider" },
    ]);
    const { draft, displayName1, displayName2 } = mergePremiumDraftPartiesWithRecipientPriority(
      premiumDraft,
      null,
      "Red Mesa",
      "Harbor Peak",
      null,
      null,
    );
    expect(displayName1).toBe("Red Mesa Logistics LLC");
    expect(displayName2).toBe("Harbor Peak Automation LLC");
    expect(draft.parties?.[0]?.name).toBe("Red Mesa Logistics LLC");
    expect(draft.parties?.[1]?.name).toBe("Harbor Peak Automation LLC");
  });
});
