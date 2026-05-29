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
  PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA,
  PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA,
  resolveEditableSignerLegalEntityForSlot,
  resolvePaidProSignerDetailsGate,
  resolveLegalEntityNameForHandoffSlot,
  resolveSignerSetupRenderSlot,
  resolveSignerSetupPartyIdentities,
  resolveSignerSetupPartyIdentity,
  shouldUpgradeRecipientNameToLegalEntity,
  signerDetailsFieldKey,
  slotIsolatedCanonicalEntity,
  type SignerSetupPartyIdentity,
} from "./signerSetupPartyIdentity";
import { buildResolvedPartyDisplayModel } from "../../agreement/resolvedPartyDisplayModel";
import { buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
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

  it("signer details gate blocker copy names the full legal entity and combines name + email", () => {
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
    expect(gate.blockerMessage).toBe("Add signer name and email for Red Mesa Logistics LLC.");
    expect(gate.firstIncompleteFieldKey).toBe("r1-signer-name");
    expect(gate.ctaLabel).toBe(PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA);
  });

  it("signer details gate advances Party 2 copy once Party 1 is complete", () => {
    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      partySignerNames: ["Alex Client", ""],
      recipient1Name: "Red Mesa Logistics LLC",
      recipient2Name: "Harbor Peak Automation LLC",
      recipient1Email: "alex@redmesa.test",
      recipient2Email: "",
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(false);
    expect(gate.blockerMessage).toBe("Add signer name and email for Harbor Peak Automation LLC.");
    expect(gate.firstIncompleteFieldKey).toBe("r2-signer-name");
  });

  it("signer details gate CTA becomes Continue to final review once complete", () => {
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
    expect(gate.blockerMessage).toBe("");
    expect(gate.firstIncompleteFieldKey).toBeNull();
    expect(gate.ctaLabel).toBe(PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA);
  });

  it("signerDetailsFieldKey maps party + field to recipient input keys", () => {
    expect(signerDetailsFieldKey(0, "email")).toBe("r1-email");
    expect(signerDetailsFieldKey(1, "signer_name")).toBe("r2-signer-name");
    expect(signerDetailsFieldKey(0, "legal_entity")).toBe("r1-name");
    expect(signerDetailsFieldKey(2, "email")).toBe("party-2-email");
  });

  it("resolved party display model keeps full legal names for both parties (no truncation)", () => {
    const slots = buildResolvedPartyDisplayModel({
      parties: [
        { name: "Red Mesa Logistics LLC", role: "Client" },
        { name: "Harbor Peak Automation LLC", role: "Service Provider" },
      ],
      intakeText: INTAKE,
      recipientEmails: ["", ""],
      recipientSignerNames: ["", ""],
      recipientDisplayNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      canonicalLegalEntityNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
    });
    expect(slots).toHaveLength(2);
    expect(slots[0]?.displayName).toBe("Red Mesa Logistics LLC");
    expect(slots[1]?.displayName).toBe("Harbor Peak Automation LLC");
  });

  it("free starter preview preserves full legal party names from intake", () => {
    const intake =
      "Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup services. Red Mesa will pay Harbor Peak $5,000. Texas law.";
    const text = buildStarterAgreementPreviewForReview(
      {
        ...baseDraft([
          { name: "Red Mesa", role: "Client" },
          { name: "Harbor Peak", role: "Service Provider" },
        ]),
        title: "AI Workflow Setup Services Agreement",
        purpose: "AI workflow setup services",
        payment_terms: "$5,000",
        agreement_family: "services_agreement",
      },
      { intakeText: intake },
    );
    expect(text).toContain("Red Mesa Logistics LLC");
    expect(text).toContain("Harbor Peak Automation LLC");
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

describe("signer entity slot isolation (Defect #1 — no cross-slot concatenation)", () => {
  const identity = (legalEntityName: string): SignerSetupPartyIdentity => ({
    legalEntityName,
    displayName: compactDisplayNameFromLegalEntity(legalEntityName),
    source: "authoritative_manifest",
  });

  // Reproduces the QA bug: slot 0 identity already carries slot 1's entity concatenated.
  const contaminatedSlots: SignerSetupPartyIdentity[] = [
    identity("Blue Canyon Analytics LLC Iron Vale Systems Inc"),
    identity("Iron Vale Systems Inc."),
  ];
  const cleanSlots: SignerSetupPartyIdentity[] = [
    identity("Blue Canyon Analytics LLC"),
    identity("Iron Vale Systems Inc."),
  ];

  it("a concatenated two-entity value is detected as multiple entities (the $-anchored count bug)", () => {
    const r = detectSignerSlotContamination(
      0,
      "Blue Canyon Analytics LLC Iron Vale Systems Inc",
      cleanSlots,
    );
    expect(r.contaminated).toBe(true);
    expect(r.reason).toBe("multiple_entities");
  });

  it("correctedValue is the clean slot entity — never the concatenation", () => {
    const r = detectSignerSlotContamination(
      0,
      "Blue Canyon Analytics LLC Iron Vale Systems Inc",
      cleanSlots,
    );
    expect(r.correctedValue).toBe("Blue Canyon Analytics LLC");
    expect(r.correctedValue).not.toContain("Iron Vale");
  });

  it("slot 0 render never contains slot 1 entity, even when the slot identity itself is contaminated", () => {
    const slot0 = resolveSignerSetupRenderSlot({ slotIndex: 0, slotIdentities: contaminatedSlots });
    expect(slot0.canonicalLegalEntity).toBe("Blue Canyon Analytics LLC");
    expect(slot0.canonicalLegalEntity).not.toMatch(/Iron Vale/i);
    expect(slot0.compactDisplayLabel).not.toMatch(/Iron Vale/i);
  });

  it("slot 1 render never contains slot 0 entity", () => {
    const slot1 = resolveSignerSetupRenderSlot({ slotIndex: 1, slotIdentities: contaminatedSlots });
    expect(slot1.canonicalLegalEntity).not.toMatch(/Blue Canyon/i);
    expect(slot1.canonicalLegalEntity).toBe("Iron Vale Systems Inc");
  });

  it("slotIsolatedCanonicalEntity strips a leaked adjacent entity (no merge recovery)", () => {
    expect(slotIsolatedCanonicalEntity(0, contaminatedSlots)).toBe("Blue Canyon Analytics LLC");
    expect(slotIsolatedCanonicalEntity(1, contaminatedSlots)).toBe("Iron Vale Systems Inc");
  });

  it("editable field keeps a clean slot value and is never 'corrected' into a concatenation", () => {
    const value = resolveEditableSignerLegalEntityForSlot({
      slotIndex: 0,
      currentInputValue: "Blue Canyon Analytics LLC",
      slotIdentities: cleanSlots,
    });
    expect(value).toBe("Blue Canyon Analytics LLC");
    expect(value).not.toMatch(/Iron Vale/i);
  });

  it("no concatenated entity render possible from either slot", () => {
    for (const slotIndex of [0, 1]) {
      const slot = resolveSignerSetupRenderSlot({ slotIndex, slotIdentities: contaminatedSlots });
      // A rendered slot value must be a single entity (no second corporate suffix in the interior).
      expect(slot.canonicalLegalEntity).not.toMatch(/\b(?:LLC|Inc|Corp|Ltd)\b\.?\s+\S/i);
    }
  });
});

describe("signer slot canonical mapping (Defect — Party 2 duplicates Party 1)", () => {
  const PARTY_1 = "Blue Canyon Analytics LLC";
  const PARTY_2 = "Iron Vale Systems Inc.";
  const INTAKE = `Services agreement between ${PARTY_1} and ${PARTY_2} for data work. Texas law.`;
  const BODY = `SERVICES AGREEMENT between ${PARTY_1} ("Client") and ${PARTY_2} ("Service Provider"). ${"Substantive operative clause. ".repeat(600)}`;

  function establishTwoPartyManifest() {
    establishAuthoritativeAgreementDocument({
      fullCorpusText: BODY,
      canonicalPartyManifest: [
        { name: PARTY_1, role: "Client" } as never,
        { name: PARTY_2, role: "Service Provider" } as never,
      ],
    });
  }

  afterEach(() => clearAuthoritativeAgreementDocument());

  it("renders two distinct canonical parties from a 2-party manifest", () => {
    establishTwoPartyManifest();
    const ids = resolveSignerSetupPartyIdentities({
      parties: [{ name: PARTY_1 }, { name: PARTY_2 }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
    });
    expect(ids).toHaveLength(2);
    expect(ids[0].legalEntityName).toBe("Blue Canyon Analytics LLC");
    expect(ids[1].legalEntityName).toBe("Iron Vale Systems Inc");
    expect(ids[0].legalEntityName).not.toBe(ids[1].legalEntityName);
  });

  it("Party 2 stays Iron Vale even when a duplicated draft slot leaks Party 1's (longer) entity", () => {
    // Root cause: pickBestLegalCandidate ranked by length, so the longer duplicated draft name for
    // slot 1 used to override the canonical manifest entity and collapse both parties into Party 1.
    establishTwoPartyManifest();
    const ids = resolveSignerSetupPartyIdentities({
      parties: [{ name: PARTY_1 }, { name: PARTY_1 }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
    });
    expect(ids[1].legalEntityName).toBe("Iron Vale Systems Inc");
    expect(ids[1].legalEntityName).not.toMatch(/Blue Canyon/i);
  });

  it("Party 2 stays Iron Vale even when handoff slots both seed Party 1's entity", () => {
    establishTwoPartyManifest();
    const ids = resolveSignerSetupPartyIdentities({
      parties: [{ name: PARTY_1 }, { name: PARTY_2 }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
      handoffSlots: [{ name: PARTY_1 }, { name: PARTY_1 }],
    });
    expect(ids[1].legalEntityName).toBe("Iron Vale Systems Inc");
    expect(ids[1].legalEntityName).not.toMatch(/Blue Canyon/i);
  });

  it("render slots map Party 1 → Blue Canyon, Party 2 → Iron Vale (never the same entity)", () => {
    establishTwoPartyManifest();
    const ids = resolveSignerSetupPartyIdentities({
      parties: [{ name: PARTY_1 }, { name: PARTY_1 }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
    });
    const slot0 = resolveSignerSetupRenderSlot({ slotIndex: 0, slotIdentities: ids });
    const slot1 = resolveSignerSetupRenderSlot({ slotIndex: 1, slotIdentities: ids });
    expect(slot0.canonicalLegalEntity).toBe("Blue Canyon Analytics LLC");
    expect(slot1.canonicalLegalEntity).toBe("Iron Vale Systems Inc");
    expect(slot0.canonicalLegalEntity).not.toBe(slot1.canonicalLegalEntity);
  });

  it("agreement-parties summary renders both parties distinctly", () => {
    establishTwoPartyManifest();
    const ids = resolveSignerSetupPartyIdentities({
      parties: [{ name: PARTY_1 }, { name: PARTY_1 }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
    });
    const model = buildResolvedPartyDisplayModel({
      parties: [
        { name: PARTY_1, role: "Client" },
        { name: PARTY_2, role: "Service Provider" },
      ],
      intakeText: INTAKE,
      recipientEmails: ["", ""],
      recipientSignerNames: ["", ""],
      recipientDisplayNames: ["", ""],
      canonicalLegalEntityNames: ids.map((i) => i.legalEntityName),
    });
    expect(model[0].displayName).toMatch(/Blue Canyon/i);
    expect(model[1].displayName).toMatch(/Iron Vale/i);
    expect(model[0].displayName).not.toBe(model[1].displayName);
  });

  it("entering Party 2 signer metadata advances the gate without contaminating its canonical entity", () => {
    establishTwoPartyManifest();
    const ids = resolveSignerSetupPartyIdentities({
      parties: [{ name: PARTY_1 }, { name: PARTY_2 }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
    });
    // Party 1 already filled, Party 2 still blank → stay on signer setup (CTA = Add signer details).
    const beforeParty2 = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      signerSetupPartyIdentities: ids,
      draftPartyNames: [PARTY_1, PARTY_2],
      partySignerNames: ["Avery Client", ""],
      recipient1Name: PARTY_1,
      recipient2Name: PARTY_2,
      recipient1Email: "avery@bluecanyon.test",
      recipient2Email: "",
      extraPartyReviewEmails: [],
    });
    expect(beforeParty2.complete).toBe(false);
    expect(beforeParty2.ctaLabel).toBe(PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA);
    expect(beforeParty2.firstIncompleteFieldKey).toBe("r2-signer-name");

    // Completing Party 2 advances to final review; Party 2's entity stays Iron Vale (no merge/dupe).
    const afterParty2 = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      signerSetupPartyIdentities: ids,
      draftPartyNames: [PARTY_1, PARTY_2],
      partySignerNames: ["Avery Client", "Morgan Provider"],
      recipient1Name: PARTY_1,
      recipient2Name: PARTY_2,
      recipient1Email: "avery@bluecanyon.test",
      recipient2Email: "morgan@ironvale.test",
      extraPartyReviewEmails: [],
    });
    expect(afterParty2.complete).toBe(true);
    expect(afterParty2.ctaLabel).toBe(PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA);
    expect(ids[1].legalEntityName).toBe("Iron Vale Systems Inc");
    expect(ids[1].legalEntityName).not.toMatch(/Blue Canyon/i);
  });

  it("QA: stale manifest duplicating Party 1 across both slots still renders slot 1 as Iron Vale", () => {
    // Reproduce the QA: a frozen/compact manifest that duplicated Party 1 into slot 1, while the
    // intake/body clearly contain two DISTINCT entities. Canonical extraction must win for slot 1.
    establishAuthoritativeAgreementDocument({
      fullCorpusText: BODY,
      canonicalPartyManifest: [
        { name: PARTY_1, role: "Client" } as never,
        { name: PARTY_1, role: "Service Provider" } as never,
      ],
    });
    const ids = resolveSignerSetupPartyIdentities({
      parties: [{ name: PARTY_1 }, { name: PARTY_1 }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
    });
    expect(ids[0].legalEntityName).toBe("Blue Canyon Analytics LLC");
    expect(ids[1].legalEntityName).toBe("Iron Vale Systems Inc");
    expect(ids[1].legalEntityName).not.toMatch(/Blue Canyon/i);
    // Render slots and editable fields must also be slot-isolated and distinct.
    const slot1 = resolveSignerSetupRenderSlot({ slotIndex: 1, slotIdentities: ids });
    expect(slot1.canonicalLegalEntity).toBe("Iron Vale Systems Inc");
  });

  it("metadata legalEntity conflict cannot overwrite the canonical slot legalEntity", () => {
    establishTwoPartyManifest();
    const ids = resolveSignerSetupPartyIdentities({
      parties: [{ name: PARTY_1 }, { name: PARTY_2 }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
    });
    // Stale recipient metadata tries to set slot 1's legal entity to Party 1's entity.
    const editedSlot1 = resolveEditableSignerLegalEntityForSlot({
      slotIndex: 1,
      currentInputValue: "Blue Canyon Analytics LLC",
      slotIdentities: ids,
    });
    expect(editedSlot1).toBe("Iron Vale Systems Inc");
    expect(editedSlot1).not.toMatch(/Blue Canyon/i);
  });

  it("a fuller form of the SAME manifest entity may still upgrade the short canonical (no regression)", () => {
    establishAuthoritativeAgreementDocument({
      fullCorpusText: BODY,
      canonicalPartyManifest: [
        { name: "Red Mesa", role: "Client" } as never,
        { name: "Harbor Peak", role: "Provider" } as never,
      ],
    });
    const ids = resolveSignerSetupPartyIdentities({
      parties: [{ name: "Red Mesa Logistics LLC" }, { name: "Harbor Peak Automation LLC" }],
      intakeText: "between Red Mesa Logistics LLC and Harbor Peak Automation LLC",
      agreementBodyText: BODY,
    });
    expect(ids[0].legalEntityName).toBe("Red Mesa Logistics LLC");
    expect(ids[1].legalEntityName).toBe("Harbor Peak Automation LLC");
  });

  it("typing Party 2 signer name/email flips only the gate — legal entity slots stay isolated", () => {
    establishTwoPartyManifest();
    const ids = resolveSignerSetupPartyIdentities({
      parties: [{ name: PARTY_1 }, { name: PARTY_2 }],
      intakeText: INTAKE,
      agreementBodyText: BODY,
    });

    // Before any signer metadata: gate is incomplete, slots already correct + distinct.
    const before = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      signerSetupPartyIdentities: ids,
      draftPartyNames: [PARTY_1, PARTY_2],
      partySignerNames: ["", ""],
      recipient1Name: "",
      recipient2Name: "",
      recipient1Email: "",
      recipient2Email: "",
      extraPartyReviewEmails: [],
    });
    expect(before.complete).toBe(false);
    expect(before.legalEntityNames).toEqual(["Blue Canyon Analytics LLC", "Iron Vale Systems Inc"]);

    // Typing Party 2 signer name/email only advances completeness; legal entity slots are unchanged.
    const after = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      signerSetupPartyIdentities: ids,
      draftPartyNames: [PARTY_1, PARTY_2],
      partySignerNames: ["Sam Canyon", "Dana Vale"],
      recipient1Name: "Sam Canyon",
      recipient2Name: "Dana Vale",
      recipient1Email: "sam@bluecanyon.com",
      recipient2Email: "dana@ironvale.com",
      extraPartyReviewEmails: [],
    });
    expect(after.complete).toBe(true);
    expect(after.legalEntityNames).toEqual(before.legalEntityNames);
    expect(after.legalEntityNames[1]).toBe("Iron Vale Systems Inc");
    expect(after.legalEntityNames[1]).not.toMatch(/Blue Canyon/i);
  });
});
