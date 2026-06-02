import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  clearSignerSetupAutoCorrectLatch,
  detectSignerSlotContamination,
  isRecitalSentenceFragmentPartyName,
  resolveSignerSetupAutoCorrectTarget,
  resolveSignerSetupPartyIdentities,
  resolveSignerSetupRenderSlot,
  type SignerSetupPartyIdentity,
} from "./signerSetupPartyIdentity";
import {
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";

const RECITAL = `This Agreement is between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`;

const ACCEPTED = [
  "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  RECITAL,
  "",
  "1. SCOPE OF SERVICES. Provider delivers services.",
  "Substantive operative clause. ".repeat(400),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  PAID_PRO_HARDENING_CLIENT,
  "By: __________________________",
  "",
  "SERVICE PROVIDER:",
  PAID_PRO_HARDENING_PROVIDER,
  "By: __________________________",
].join("\n");

const INTAKE = `Create a consulting agreement between ${PAID_PRO_HARDENING_CLIENT} and ${PAID_PRO_HARDENING_PROVIDER}.`;

describe("paidPro signer render binding (Test233)", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearSignerSetupAutoCorrectLatch();
    vi.restoreAllMocks();
  });

  it("rejects recital sentence fragments as party-name candidates", () => {
    expect(isRecitalSentenceFragmentPartyName("This Agreement is between")).toBe(true);
    expect(isRecitalSentenceFragmentPartyName("This Agreement is between Blue Canyon Analytics LLC")).toBe(
      true,
    );
    expect(isRecitalSentenceFragmentPartyName(PAID_PRO_HARDENING_CLIENT)).toBe(false);
  });

  it("does not seed signer slots from recital sentence extraction after server_full_draft acceptance", () => {
    establishPaidProSourceOfTruth({
      text: ACCEPTED,
      source: "server_full_draft",
    });
    const ids = resolveSignerSetupPartyIdentities({
      parties: [{ name: RECITAL }, { name: RECITAL }],
      intakeText: INTAKE,
      agreementBodyText: ACCEPTED,
    });
    expect(ids[0].legalEntityName).toBe(PAID_PRO_HARDENING_CLIENT);
    expect(ids[1].legalEntityName).toMatch(/Iron Vale/);
    expect(ids[0].legalEntityName).not.toMatch(/^This Agreement is between/i);
    expect(ids[1].legalEntityName).not.toMatch(/^This Agreement is between/i);
  });

  it("illegal render binding never corrects to a recital fragment", () => {
    establishPaidProSourceOfTruth({
      text: ACCEPTED,
      source: "server_full_draft",
    });
    const pollutedSlots: SignerSetupPartyIdentity[] = [
      {
        legalEntityName: PAID_PRO_HARDENING_CLIENT,
        displayName: "Blue Canyon",
        source: "authoritative_manifest",
      },
      {
        legalEntityName: "This Agreement is between",
        displayName: "Party 2",
        source: "display_fallback",
      },
    ];
    const contamination = detectSignerSlotContamination(
      1,
      `This Agreement is between ${PAID_PRO_HARDENING_CLIENT}`,
      pollutedSlots,
    );
    expect(contamination.contaminated).toBe(true);
    expect(contamination.correctedValue).toMatch(/Iron Vale/);
    expect(contamination.correctedValue).not.toBe("This Agreement is between");

    const slot = resolveSignerSetupRenderSlot({
      slotIndex: 1,
      currentLegalEntityValue: `This Agreement is between ${PAID_PRO_HARDENING_CLIENT}`,
      slotIdentities: pollutedSlots,
      source: "signer_setup_input_render",
    });
    expect(slot.canonicalLegalEntity).toMatch(/Iron Vale/);
    expect(slot.canonicalLegalEntity).not.toBe("This Agreement is between");
  });

  it("auto_correct stabilizes without repeated writes (no render loop)", () => {
    establishPaidProSourceOfTruth({
      text: ACCEPTED,
      source: "server_full_draft",
    });
    const hash = "test233-hash";
    const slots: SignerSetupPartyIdentity[] = [
      {
        legalEntityName: PAID_PRO_HARDENING_CLIENT,
        displayName: "Blue Canyon",
        source: "sot_signature_block",
      },
      {
        legalEntityName: "This Agreement is between",
        displayName: "Party 2",
        source: "display_fallback",
      },
    ];
    let current = `This Agreement is between ${PAID_PRO_HARDENING_CLIENT}`;
    const writes: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const target = resolveSignerSetupAutoCorrectTarget({
        slotIndex: 1,
        currentRecipientName: current,
        slotIdentities: slots,
        corpusHash: hash,
      });
      if (target) {
        writes.push(target);
        current = target;
      }
    }
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(writes.length).toBeLessThanOrEqual(2);
    expect(current).toMatch(/Iron Vale/);
    expect(current).not.toMatch(/^This Agreement is between/i);
    expect(
      resolveSignerSetupAutoCorrectTarget({
        slotIndex: 1,
        currentRecipientName: current,
        slotIdentities: slots,
        corpusHash: hash,
      }),
    ).toBeNull();
  });

  it("does not spam illegal-signer-render-binding-blocked for recital fragment corrections", () => {
    establishPaidProSourceOfTruth({
      text: ACCEPTED,
      source: "server_full_draft",
    });
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const pollutedSlots: SignerSetupPartyIdentity[] = [
      {
        legalEntityName: PAID_PRO_HARDENING_CLIENT,
        displayName: "Blue Canyon",
        source: "authoritative_manifest",
      },
      {
        legalEntityName: "This Agreement is between",
        displayName: "Party 2",
        source: "display_fallback",
      },
    ];
    for (let i = 0; i < 5; i += 1) {
      resolveSignerSetupRenderSlot({
        slotIndex: 1,
        currentLegalEntityValue: `This Agreement is between ${PAID_PRO_HARDENING_CLIENT}`,
        slotIdentities: pollutedSlots,
        source: "signer_setup_input_render",
      });
    }
    const blocked = logSpy.mock.calls.filter(([msg]) => msg === "[illegal-signer-render-binding-blocked]");
    expect(blocked.length).toBeLessThanOrEqual(1);
    for (const [, payload] of blocked) {
      expect((payload as { correctedValue?: string }).correctedValue).not.toBe("This Agreement is between");
    }
  });
});
