import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  armPaidProStarterSignatureSendFromCreateFlow,
  clearPaidProStarterSignatureSendFromCreateFlow,
} from "../../launch/simpleProduct/premiumSendIntent";
import {
  agreementTextSuggestsNegotiation,
  clearPremiumForkUserSendMode,
  inferPremiumDefaultSendMode,
  peekPremiumForkUserSendMode,
  persistPremiumForkUserSendMode,
} from "./premiumSendForkDefaults";
import { getDraftFirstReviewBlocker } from "./reviewPlaceholderGuard";

const baseDraft = (over: Partial<ParsedDraftShape> = {}): ParsedDraftShape =>
  ({
    title: "Services Agreement",
    jurisdiction: "DE",
    parties: [
      { name: "Jane Smith", role: "party" },
      { name: "Acme LLC", role: "party" },
    ],
    purpose: "Scope of work",
    payment_terms: "Net 30",
    duration: "1 year",
    due_date: null,
    effective_date: "Upon signing",
    payment: { amount: null, cadence: null, valid: true },
    ...over,
  }) as ParsedDraftShape;

describe("agreementTextSuggestsNegotiation", () => {
  it("detects negotiation phrasing", () => {
    expect(agreementTextSuggestsNegotiation("Parties will negotiate payment terms.", "")).toBe(true);
  });

  it("returns false for plain commercial text", () => {
    expect(agreementTextSuggestsNegotiation("Payment due within 30 days.", "")).toBe(false);
  });
});

describe("inferPremiumDefaultSendMode", () => {
  const common = {
    agreementDocDirty: false,
    agreementDocumentText: "",
    intakeCombined: "",
    suggestCollaboratePrimed: false,
    getDraftFirstReviewBlocker,
  };
  const sessionMem: Record<string, string> = {};
  beforeEach(() => {
    Object.keys(sessionMem).forEach((k) => delete sessionMem[k]);
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => (Object.prototype.hasOwnProperty.call(sessionMem, k) ? sessionMem[k] : null),
      setItem: (k: string, v: string) => {
        sessionMem[k] = v;
      },
      removeItem: (k: string) => {
        delete sessionMem[k];
      },
      clear: () => {
        Object.keys(sessionMem).forEach((k) => delete sessionMem[k]);
      },
      key: () => null,
      get length() {
        return Object.keys(sessionMem).length;
      },
    } as Storage);
  });

  afterEach(() => {
    clearPaidProStarterSignatureSendFromCreateFlow();
    vi.unstubAllGlobals();
  });

  it("defaults to review when draft has review blocker", () => {
    const draft = baseDraft({
      parties: [
        { name: "Party A (edit in review)", role: "party" },
        { name: "Party B (edit in review)", role: "party" },
      ],
    });
    expect(
      inferPremiumDefaultSendMode({
        ...common,
        draft,
        hasRecipientsReady: true,
      }),
    ).toBe("review");
  });

  it("defaults to review when primed after premium rewrite", () => {
    const draft = baseDraft();
    expect(
      inferPremiumDefaultSendMode({
        ...common,
        draft,
        hasRecipientsReady: true,
        suggestCollaboratePrimed: true,
      }),
    ).toBe("review");
  });

  it("defaults to review even when names resolved and recipients are ready (review-first product default)", () => {
    const draft = baseDraft();
    expect(
      inferPremiumDefaultSendMode({
        ...common,
        draft,
        hasRecipientsReady: true,
      }),
    ).toBe("review");
  });

  it("defaults to review when agreement doc is dirty", () => {
    const draft = baseDraft();
    expect(
      inferPremiumDefaultSendMode({
        ...common,
        draft,
        hasRecipientsReady: true,
        agreementDocDirty: true,
      }),
    ).toBe("review");
  });

  it("defaults to review when title is still a generic placeholder", () => {
    const draft = baseDraft({ title: "Agreement" });
    expect(
      inferPremiumDefaultSendMode({
        ...common,
        draft,
        hasRecipientsReady: true,
      }),
    ).toBe("review");
  });

  it("stays review-first when starter LawDog Pro send path is armed (signature deferred until Prepare signatures)", () => {
    const draft = baseDraft({ title: "Agreement" });
    armPaidProStarterSignatureSendFromCreateFlow();
    expect(
      inferPremiumDefaultSendMode({
        ...common,
        draft,
        hasRecipientsReady: true,
        suggestCollaboratePrimed: true,
      }),
    ).toBe("review");
  });
});

describe("premium fork user send mode persistence", () => {
  const mem: Record<string, string> = {};
  beforeEach(() => {
    Object.keys(mem).forEach((k) => delete mem[k]);
    vi.stubGlobal("sessionStorage", {
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
    } as Storage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists review and clears", () => {
    clearPremiumForkUserSendMode();
    expect(peekPremiumForkUserSendMode()).toBe(null);
    persistPremiumForkUserSendMode("review");
    expect(peekPremiumForkUserSendMode()).toBe("review");
    clearPremiumForkUserSendMode();
    expect(peekPremiumForkUserSendMode()).toBe(null);
  });

  it("persists signature", () => {
    clearPremiumForkUserSendMode();
    persistPremiumForkUserSendMode("signature");
    expect(peekPremiumForkUserSendMode()).toBe("signature");
    clearPremiumForkUserSendMode();
  });
});
