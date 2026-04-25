import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPaidFunnelIntentAttributionForTests,
  resolveBestPaidFunnelIntentId,
  setPaidFunnelLastPremiumProContext,
} from "./paidFunnelIntentAttribution";
import { resolveAgreementIntentContract } from "../../components/agreements/agreementIntentContract";
import { buildPremiumFullDraftContextForProRequest } from "../../components/agreements/premiumFullDraftApi";
import type { ParsedDraftShape } from "../../components/agreements/intakeSmartDefaults";
import { appendPaidFunnelEvent, backfillPaidFunnelIntentForSession, loadPaidFunnelEvents, PAID_FUNNEL_EVENT_STORAGE_KEY } from "./paidFunnelLocalStorage";

const SID = "test-session-1";

const minimalParseShape = (purpose: string): ParsedDraftShape => ({
  title: "Placeholder",
  jurisdiction: "",
  parties: [],
  purpose,
  payment_terms: "",
  duration: null,
  due_date: null,
  effective_date: null,
  agreement_family: "generic_business_agreement",
  material_asks: [],
  additional_terms: null,
  termination_summary: null,
  payment: { amount: null, cadence: null, valid: false },
});

afterEach(() => {
  __resetPaidFunnelIntentAttributionForTests();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(PAID_FUNNEL_EVENT_STORAGE_KEY);
  }
});

describe("resolveBestPaidFunnelIntentId", () => {
  it("regression intros resolve to the same family as contract resolver (not custom_unknown)", () => {
    const cases: { q: string; want: string }[] = [
      { q: "Need a logo contract for $1,500 with 2 revisions", want: "design_creative" },
      { q: "Two founders 60/40 vesting", want: "founder_equity_vesting" },
      { q: "Need a simple NDA before sharing my pitch deck", want: "nda_confidentiality" },
      { q: "Lent friend $5,000 repay monthly", want: "loan_repayment" },
      { q: "Settlement pay $3,000 mutual release", want: "settlement_dispute" },
      { q: "Split rent/utilities roommate damages", want: "rent_roommate_property" },
    ];
    for (const c of cases) {
      const viaContract = resolveAgreementIntentContract(c.q).intent_id;
      const viaFunnel = resolveBestPaidFunnelIntentId({ sessionId: SID, longCorpus: c.q, parserHint: "" });
      expect(c.want, c.q).toBe(viaContract);
      expect(viaFunnel, c.q).toBe(c.want);
    }
  });

  it("takes Pro request context deterministic_id when corpus alone is still unknown (session-scoped)", () => {
    const long = "x".repeat(4);
    const unknownUntilPro = resolveBestPaidFunnelIntentId({ sessionId: SID, longCorpus: long, parserHint: long });
    expect(unknownUntilPro).toBe("custom_unknown");
    const userIntake = "Need a logo for our café, $1,200 flat, 2 revision rounds as stated.";
    const draft = minimalParseShape(userIntake);
    const proCtx = buildPremiumFullDraftContextForProRequest(userIntake, draft);
    setPaidFunnelLastPremiumProContext(SID, proCtx);
    const after = resolveBestPaidFunnelIntentId({ sessionId: SID, longCorpus: long, parserHint: "" });
    expect(after).toBe("design_creative");
  });

  it("parser hint is used when long corpus is too thin", () => {
    const t = "Design Services Agreement";
    const p = "Logo design, flat $1,200, two included revision rounds.";
    const hint = `${t}\n${p}`;
    const r = resolveBestPaidFunnelIntentId({ sessionId: SID, longCorpus: "x", parserHint: hint });
    expect(r).toBe("design_creative");
  });
});

function stubWindowLocalStorage(): void {
  const backing: Record<string, string> = {};
  const ls = {
    getItem: (k: string) => (Object.prototype.hasOwnProperty.call(backing, k) ? backing[k]! : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
  };
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("window", { ...globalThis, localStorage: ls } as unknown as typeof window);
}

describe("backfillPaidFunnelIntentForSession", () => {
  beforeEach(() => {
    stubWindowLocalStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rewrites only unknown/empty intent rows in the same session", () => {
    appendPaidFunnelEvent({
      name: "free_draft_generated",
      ts: 1,
      session_id: SID,
      agreement_intent_id: "custom_unknown",
    });
    appendPaidFunnelEvent({
      name: "premium_upsell_seen",
      ts: 2,
      session_id: "other",
      agreement_intent_id: "custom_unknown",
    });
    backfillPaidFunnelIntentForSession(SID, "nda_confidentiality");
    const rows = loadPaidFunnelEvents();
    expect(rows[0]!.agreement_intent_id).toBe("nda_confidentiality");
    expect(rows[1]!.agreement_intent_id).toBe("custom_unknown");
    expect(rows[1]!.session_id).toBe("other");
  });
});
