/**
 * Tests for demo session user signer metadata persistence.
 * Verifies that party/signer metadata (name, email, role, etc.) persists correctly
 * through the first Pro copy screen when users add or correct signer information.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const HANDOFF_KEY = "claw_premium_recipient_handoff_v2";

function stubSessionStorage() {
  const mem: Record<string, string> = {};
  vi.stubGlobal(
    "sessionStorage",
    {
      getItem: (k: string) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
      setItem: (k: string, v: string) => {
        mem[k] = v;
      },
      removeItem: (k: string) => {
        delete mem[k];
      },
      clear: () => {
        Object.keys(mem).forEach((k) => delete mem[k]);
      },
      key: () => null,
      get length() {
        return Object.keys(mem).length;
      },
    } as Storage,
  );
}

type HandoffSlot = {
  name: string;
  email: string;
  role: string;
  signerName?: string;
  signerTitle?: string;
  partyAddress?: string;
};

type HandoffV2 = {
  v: 2;
  party1: HandoffSlot;
  party2: HandoffSlot;
  savedAt: number;
  partyIndexSlots?: HandoffSlot[];
};

function buildHandoffSlot(overrides?: Partial<HandoffSlot>): HandoffSlot {
  return {
    name: "",
    email: "",
    role: "party",
    signerName: "",
    signerTitle: "",
    partyAddress: "",
    ...overrides,
  };
}

function writeHandoff(handoff: HandoffV2): void {
  sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff));
}

function readHandoff(): HandoffV2 | null {
  const raw = sessionStorage.getItem(HANDOFF_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as HandoffV2;
}

describe("demoSessionUserSignerMetadataPersistence", () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("handoff storage format verification", () => {
    it("stores party legal names correctly", () => {
      const handoff: HandoffV2 = {
        v: 2,
        party1: buildHandoffSlot({ name: "Harbor Pool & Patio LLC" }),
        party2: buildHandoffSlot({ name: "Anthem Ventures Inc." }),
        savedAt: Date.now(),
      };
      
      writeHandoff(handoff);
      
      const read = readHandoff();
      expect(read).not.toBeNull();
      expect(read!.party1.name).toBe("Harbor Pool & Patio LLC");
      expect(read!.party2.name).toBe("Anthem Ventures Inc.");
    });

    it("stores signer names correctly", () => {
      const handoff: HandoffV2 = {
        v: 2,
        party1: buildHandoffSlot({ name: "Harbor Pool LLC", signerName: "John Harbor" }),
        party2: buildHandoffSlot({ name: "Anthem Inc.", signerName: "Jane Anthem" }),
        savedAt: Date.now(),
      };
      
      writeHandoff(handoff);
      
      const read = readHandoff();
      expect(read!.party1.signerName).toBe("John Harbor");
      expect(read!.party2.signerName).toBe("Jane Anthem");
    });

    it("stores signer titles correctly", () => {
      const handoff: HandoffV2 = {
        v: 2,
        party1: buildHandoffSlot({ signerTitle: "CEO" }),
        party2: buildHandoffSlot({ signerTitle: "Manager" }),
        savedAt: Date.now(),
      };
      
      writeHandoff(handoff);
      
      const read = readHandoff();
      expect(read!.party1.signerTitle).toBe("CEO");
      expect(read!.party2.signerTitle).toBe("Manager");
    });

    it("stores emails correctly", () => {
      const handoff: HandoffV2 = {
        v: 2,
        party1: buildHandoffSlot({ email: "harbor@example.com" }),
        party2: buildHandoffSlot({ email: "anthem@example.com" }),
        savedAt: Date.now(),
      };
      
      writeHandoff(handoff);
      
      const read = readHandoff();
      expect(read!.party1.email).toBe("harbor@example.com");
      expect(read!.party2.email).toBe("anthem@example.com");
    });

    it("stores party addresses correctly", () => {
      const handoff: HandoffV2 = {
        v: 2,
        party1: buildHandoffSlot({ partyAddress: "123 Main St, Phoenix, AZ" }),
        party2: buildHandoffSlot({ partyAddress: "456 Oak Ave, Scottsdale, AZ" }),
        savedAt: Date.now(),
      };
      
      writeHandoff(handoff);
      
      const read = readHandoff();
      expect(read!.party1.partyAddress).toBe("123 Main St, Phoenix, AZ");
      expect(read!.party2.partyAddress).toBe("456 Oak Ave, Scottsdale, AZ");
    });
  });

  describe("signer metadata corrections persist", () => {
    it("corrected signer name overwrites prior value", () => {
      writeHandoff({
        v: 2,
        party1: buildHandoffSlot({ name: "Harbor LLC", signerName: "John Harbor" }),
        party2: buildHandoffSlot({ name: "Anthem Inc." }),
        savedAt: Date.now(),
      });
      
      const first = readHandoff();
      expect(first!.party1.signerName).toBe("John Harbor");
      
      writeHandoff({
        v: 2,
        party1: buildHandoffSlot({ name: "Harbor LLC", signerName: "John Harbor Jr." }),
        party2: buildHandoffSlot({ name: "Anthem Inc." }),
        savedAt: Date.now(),
      });
      
      const second = readHandoff();
      expect(second!.party1.signerName).toBe("John Harbor Jr.");
    });

    it("corrected email overwrites prior value", () => {
      writeHandoff({
        v: 2,
        party1: buildHandoffSlot({ email: "old@example.com" }),
        party2: buildHandoffSlot(),
        savedAt: Date.now(),
      });
      
      const first = readHandoff();
      expect(first!.party1.email).toBe("old@example.com");
      
      writeHandoff({
        v: 2,
        party1: buildHandoffSlot({ email: "corrected@example.com" }),
        party2: buildHandoffSlot(),
        savedAt: Date.now(),
      });
      
      const second = readHandoff();
      expect(second!.party1.email).toBe("corrected@example.com");
    });

    it("adding missing signer metadata does not clear existing party name", () => {
      writeHandoff({
        v: 2,
        party1: buildHandoffSlot({ name: "Harbor Pool & Patio LLC", email: "harbor@example.com" }),
        party2: buildHandoffSlot({ name: "Anthem Inc." }),
        savedAt: Date.now(),
      });
      
      const first = readHandoff();
      const existingParty1 = first!.party1;
      
      writeHandoff({
        v: 2,
        party1: buildHandoffSlot({
          name: existingParty1.name,
          email: existingParty1.email,
          signerName: "John Harbor",
          signerTitle: "Owner",
        }),
        party2: buildHandoffSlot({ name: "Anthem Inc." }),
        savedAt: Date.now(),
      });
      
      const second = readHandoff();
      expect(second!.party1.name).toBe("Harbor Pool & Patio LLC");
      expect(second!.party1.email).toBe("harbor@example.com");
      expect(second!.party1.signerName).toBe("John Harbor");
      expect(second!.party1.signerTitle).toBe("Owner");
    });
  });

  describe("ampersand party names", () => {
    it("ampersand in party name survives storage roundtrip", () => {
      writeHandoff({
        v: 2,
        party1: buildHandoffSlot({ name: "Harbor Pool & Patio LLC" }),
        party2: buildHandoffSlot({ name: "Smith & Wesson Holdings LLC" }),
        savedAt: Date.now(),
      });
      
      const read = readHandoff();
      expect(read!.party1.name).toBe("Harbor Pool & Patio LLC");
      expect(read!.party2.name).toBe("Smith & Wesson Holdings LLC");
      expect(read!.party1.name).toContain("&");
      expect(read!.party2.name).toContain("&");
    });

    it("ampersand party names not split into separate parties", () => {
      const handoff: HandoffV2 = {
        v: 2,
        party1: buildHandoffSlot({ name: "Black & Decker Inc." }),
        party2: buildHandoffSlot({ name: "Harbor Pool & Patio LLC" }),
        savedAt: Date.now(),
      };
      
      writeHandoff(handoff);
      
      const read = readHandoff();
      expect(read!.party1.name).toBe("Black & Decker Inc.");
      expect(read!.party2.name).toBe("Harbor Pool & Patio LLC");
      expect(read!.partyIndexSlots).toBeUndefined();
    });
  });

  describe("multi-party (3-4 signers) metadata persistence", () => {
    it("stores third party signer metadata in partyIndexSlots", () => {
      writeHandoff({
        v: 2,
        party1: buildHandoffSlot({ name: "Party 1 LLC", signerName: "Signer 1" }),
        party2: buildHandoffSlot({ name: "Party 2 LLC", signerName: "Signer 2" }),
        savedAt: Date.now(),
        partyIndexSlots: [
          buildHandoffSlot({ name: "Party 3 LLC", signerName: "Signer 3", email: "party3@example.com" }),
        ],
      });
      
      const read = readHandoff();
      expect(read!.partyIndexSlots).toBeDefined();
      expect(read!.partyIndexSlots!.length).toBe(1);
      expect(read!.partyIndexSlots![0].name).toBe("Party 3 LLC");
      expect(read!.partyIndexSlots![0].signerName).toBe("Signer 3");
      expect(read!.partyIndexSlots![0].email).toBe("party3@example.com");
    });

    it("stores fourth party signer metadata", () => {
      writeHandoff({
        v: 2,
        party1: buildHandoffSlot({ name: "Party 1 LLC" }),
        party2: buildHandoffSlot({ name: "Party 2 LLC" }),
        savedAt: Date.now(),
        partyIndexSlots: [
          buildHandoffSlot({ name: "Party 3 LLC", signerName: "Signer 3" }),
          buildHandoffSlot({ name: "Party 4 Inc.", signerName: "Signer 4", signerTitle: "Director" }),
        ],
      });
      
      const read = readHandoff();
      expect(read!.partyIndexSlots!.length).toBe(2);
      expect(read!.partyIndexSlots![1].name).toBe("Party 4 Inc.");
      expect(read!.partyIndexSlots![1].signerName).toBe("Signer 4");
      expect(read!.partyIndexSlots![1].signerTitle).toBe("Director");
    });

    it("correcting fourth party signer does not lose other party data", () => {
      const original: HandoffV2 = {
        v: 2,
        party1: buildHandoffSlot({ name: "Party 1", signerName: "Signer 1", email: "p1@example.com" }),
        party2: buildHandoffSlot({ name: "Party 2", signerName: "Signer 2", email: "p2@example.com" }),
        savedAt: Date.now(),
        partyIndexSlots: [
          buildHandoffSlot({ name: "Party 3", signerName: "Signer 3", email: "p3@example.com" }),
          buildHandoffSlot({ name: "Party 4", signerName: "Signer 4", email: "p4@example.com" }),
        ],
      };
      
      writeHandoff(original);
      
      const updated: HandoffV2 = {
        v: 2,
        party1: original.party1,
        party2: original.party2,
        savedAt: Date.now(),
        partyIndexSlots: [
          original.partyIndexSlots![0],
          buildHandoffSlot({
            name: "Party 4",
            signerName: "Signer 4 - Corrected",
            email: "p4@example.com",
          }),
        ],
      };
      
      writeHandoff(updated);
      
      const read = readHandoff();
      expect(read!.party1.signerName).toBe("Signer 1");
      expect(read!.party1.email).toBe("p1@example.com");
      expect(read!.party2.signerName).toBe("Signer 2");
      expect(read!.party2.email).toBe("p2@example.com");
      expect(read!.partyIndexSlots![0].signerName).toBe("Signer 3");
      expect(read!.partyIndexSlots![0].email).toBe("p3@example.com");
      expect(read!.partyIndexSlots![1].signerName).toBe("Signer 4 - Corrected");
      expect(read!.partyIndexSlots![1].email).toBe("p4@example.com");
    });
  });

  describe("handoff survives simulated refresh", () => {
    it("handoff data remains in sessionStorage after write", () => {
      writeHandoff({
        v: 2,
        party1: buildHandoffSlot({
          name: "Harbor Pool & Patio LLC",
          email: "harbor@example.com",
          signerName: "John Harbor",
          signerTitle: "Owner",
        }),
        party2: buildHandoffSlot({
          name: "Anthem Ventures Inc.",
          email: "anthem@example.com",
          signerName: "Jane Anthem",
          signerTitle: "CEO",
        }),
        savedAt: Date.now(),
      });
      
      const raw = sessionStorage.getItem(HANDOFF_KEY);
      expect(raw).not.toBeNull();
      
      const parsed = JSON.parse(raw!);
      expect(parsed.v).toBe(2);
      expect(parsed.party1.name).toBe("Harbor Pool & Patio LLC");
      expect(parsed.party1.signerName).toBe("John Harbor");
      expect(parsed.party2.name).toBe("Anthem Ventures Inc.");
      expect(parsed.party2.signerName).toBe("Jane Anthem");
    });

    it("multiple writes preserve last state", () => {
      writeHandoff({
        v: 2,
        party1: buildHandoffSlot({ signerName: "First" }),
        party2: buildHandoffSlot(),
        savedAt: Date.now(),
      });
      
      writeHandoff({
        v: 2,
        party1: buildHandoffSlot({ signerName: "Second" }),
        party2: buildHandoffSlot(),
        savedAt: Date.now(),
      });
      
      writeHandoff({
        v: 2,
        party1: buildHandoffSlot({ signerName: "Third" }),
        party2: buildHandoffSlot(),
        savedAt: Date.now(),
      });
      
      const read = readHandoff();
      expect(read!.party1.signerName).toBe("Third");
    });
  });

  describe("demo session user flow", () => {
    const DEMO_SESSION_KEY = "claw_demo_session_user_v1";

    it("demo session user marker coexists with handoff data", () => {
      const demoUser = {
        v: 1,
        displayName: "Harbor Buyer",
        email: "buyer@harborpool.com",
        source: "demo_checkout",
        settlementReceiptId: "rcpt_4242",
        createdAt: Date.now(),
      };
      sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demoUser));
      
      writeHandoff({
        v: 2,
        party1: buildHandoffSlot({ name: "Harbor Pool LLC", signerName: "John Harbor" }),
        party2: buildHandoffSlot({ name: "Anthem Inc." }),
        savedAt: Date.now(),
      });
      
      const handoff = readHandoff();
      const demoRaw = sessionStorage.getItem(DEMO_SESSION_KEY);
      
      expect(handoff).not.toBeNull();
      expect(demoRaw).not.toBeNull();
      expect(handoff!.party1.signerName).toBe("John Harbor");
      
      const demoParsed = JSON.parse(demoRaw!);
      expect(demoParsed.source).toBe("demo_checkout");
    });

    it("handoff persists after premium completion session cleared", () => {
      const PREMIUM_KEY = "claw_paid_premium_completion_session_v1";
      
      sessionStorage.setItem(PREMIUM_KEY, JSON.stringify({
        v: 1,
        source: "settled_checkout",
        markedAt: Date.now(),
      }));
      
      writeHandoff({
        v: 2,
        party1: buildHandoffSlot({ signerName: "John Harbor" }),
        party2: buildHandoffSlot({ signerName: "Jane Anthem" }),
        savedAt: Date.now(),
      });
      
      sessionStorage.removeItem(PREMIUM_KEY);
      
      const handoff = readHandoff();
      expect(handoff!.party1.signerName).toBe("John Harbor");
      expect(handoff!.party2.signerName).toBe("Jane Anthem");
    });
  });
});
