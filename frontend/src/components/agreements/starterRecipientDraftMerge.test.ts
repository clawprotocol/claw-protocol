import { describe, expect, it } from "vitest";
import {
  applyStarterRecipientUiToDraftParties,
  buildCanonicalSimpleProductHandoffDraft,
  canonicalizeStarterDraftForReview,
  sanitizeStarterSignerLabelsLine,
} from "./starterRecipientDraftMerge";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const strip = (s: string) => s.trim();
const ok = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

const baseDraft = (): ParsedDraftShape => ({
  title: "Test",
  jurisdiction: "CA",
  parties: [
    { name: "Alice", role: "signer" },
    { name: "Bob", role: "signer" },
  ],
  purpose: "p",
  payment_terms: "",
  duration: null,
  due_date: null,
  effective_date: null,
  payment: { amount: null, cadence: null, valid: false },
});

describe("applyStarterRecipientUiToDraftParties", () => {
  it("merges recipient emails and names into existing parties", () => {
    const d = baseDraft();
    const next = applyStarterRecipientUiToDraftParties(d, {
      recipient1Name: "Alice Corp",
      recipient1Email: "alice@example.com",
      recipient2Name: "Bob LLC",
      recipient2Email: "bob@example.com",
      stripRecipientEmailNoise: strip,
      looksLikeEmail: ok,
    });
    expect(next.parties[0]?.name).toBe("Alice Corp");
    expect((next.parties[0] as { email?: string }).email).toBe("alice@example.com");
    expect(next.parties[0]?.role).toBe("signer");
    expect(next.parties[1]?.name).toBe("Bob LLC");
    expect((next.parties[1] as { email?: string }).email).toBe("bob@example.com");
    expect(next.parties[1]?.role).toBe("signer");
  });

  it("fills slot 1 when only one party exists on draft", () => {
    const d: ParsedDraftShape = {
      ...baseDraft(),
      parties: [{ name: "Solo", role: "party" }],
    };
    const next = applyStarterRecipientUiToDraftParties(d, {
      recipient1Name: "Renamed",
      recipient1Email: "r1@example.com",
      recipient2Name: "Second",
      recipient2Email: "r2@example.com",
      stripRecipientEmailNoise: strip,
      looksLikeEmail: ok,
    });
    expect(next.parties.length).toBe(2);
    expect(next.parties[1]?.name).toBe("Second");
    expect((next.parties[1] as { email?: string }).email).toBe("r2@example.com");
  });

  it("buildCanonical fills first party when draft parties array is empty", () => {
    const d = { ...baseDraft(), parties: [] };
    const next = buildCanonicalSimpleProductHandoffDraft(d, {
      recipient1Name: "Solo Org",
      recipient1Email: "solo@ex.co",
      recipient2Name: "",
      recipient2Email: "",
      stripRecipientEmailNoise: strip,
      looksLikeEmail: ok,
    });
    expect(next.parties[0]?.name).toBe("Solo Org");
    expect((next.parties[0] as { email?: string }).email).toBe("solo@ex.co");
  });

  it("does not attach invalid emails", () => {
    const d = baseDraft();
    const next = applyStarterRecipientUiToDraftParties(d, {
      recipient1Name: "A",
      recipient1Email: "not-an-email",
      recipient2Name: "",
      recipient2Email: "",
      stripRecipientEmailNoise: strip,
      looksLikeEmail: ok,
    });
    expect((next.parties[0] as { email?: string }).email).toBeUndefined();
  });

  it("canonicalizes prose-polluted party names and weak jurisdiction", () => {
    const d: ParsedDraftShape = {
      ...baseDraft(),
      jurisdiction: "y",
      parties: [
        { name: "Acme LLC make it for 12 months and include payment language", role: "" },
        { name: "Beta", role: "reviewer" },
      ],
    };
    const next = canonicalizeStarterDraftForReview(d);
    expect(next.jurisdiction).toBe("Delaware");
    expect(next.parties[0]?.name).toBe("Party A");
    expect(next.parties[0]?.role).toBe("party");
    expect(next.parties[1]?.name).toBe("Beta");
  });

  it("drops prose-like signer labels", () => {
    expect(sanitizeStarterSignerLabelsLine("Acme LLC · Beta LLC")).toBe("Acme LLC · Beta LLC");
    expect(sanitizeStarterSignerLabelsLine("Acme LLC make it for 12 months please fix")).toBe("");
  });
});
