import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGREEMENT_CREATOR_INTAKE_STORAGE_KEY } from "../components/agreements/agreementIntakeStorage";

const session: Record<string, string> = {};
let historyState: Record<string, unknown> | null = null;
let localRemoveItem: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  for (const k of Object.keys(session)) delete session[k];
  historyState = null;
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => (k in session ? session[k] : null),
    setItem: (k: string, v: string) => {
      session[k] = v;
    },
    removeItem: (k: string) => {
      delete session[k];
    },
  });
  vi.stubGlobal("history", {
    get state() {
      return historyState;
    },
    replaceState: (s: unknown, _t?: string, _u?: string) => {
      historyState = s as Record<string, unknown> | null;
    },
  });
  localRemoveItem = vi.fn();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: localRemoveItem,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveHomeHeroSubmitText", () => {
  it("prefers the longer DOM textarea value when state lags dictation append", async () => {
    const hero = await import("./heroIntakePrefill");
    const dom =
      "Create a services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.";
    const state = "Create a services agreement between Red Mesa";
    expect(hero.resolveHomeHeroSubmitText(state, dom)).toBe(dom);
  });

  it("falls back to state when DOM is empty", async () => {
    const hero = await import("./heroIntakePrefill");
    expect(hero.resolveHomeHeroSubmitText("typed only", "")).toBe("typed only");
  });
});

describe("mergeHomeHeroDraftForHandoff (Start drafting while recording)", () => {
  it("appends finalized transcript to typed hero text", async () => {
    const hero = await import("./heroIntakePrefill");
    expect(hero.mergeHomeHeroDraftForHandoff("hello", { status: "ok", transcript: "world" })).toEqual({
      merged: "hello world",
      voiceFinalize: true,
    });
  });

  it("uses only transcript when hero was empty", async () => {
    const hero = await import("./heroIntakePrefill");
    expect(hero.mergeHomeHeroDraftForHandoff("", { status: "ok", transcript: "only voice" })).toEqual({
      merged: "only voice",
      voiceFinalize: true,
    });
  });

  it("keeps typed draft when finalize failed (no stale injection here)", async () => {
    const hero = await import("./heroIntakePrefill");
    expect(hero.mergeHomeHeroDraftForHandoff("typed only", { status: "failed", reason: "network" })).toEqual({
      merged: "typed only",
      voiceFinalize: false,
    });
  });
});

describe("heroIntakePrefill", () => {
  it("second read returns same handoff (Strict Mode–safe) while session is cleared", async () => {
    const hero = await import("./heroIntakePrefill");
    hero.stashHeroIntakePrefill("draft B");
    const raw = session["claw_hero_intake_prefill_v1"];
    expect(JSON.parse(raw).v).toBe(2);
    expect(JSON.parse(raw).text).toBe("draft B");

    historyState = { clawHeroIntake: "draft B" };

    const first = hero.readHeroIntakeHandoffForCreate();
    expect(first?.text).toBe("draft B");

    sessionStorage.removeItem("claw_hero_intake_prefill_v1");

    const second = hero.readHeroIntakeHandoffForCreate();
    expect(second?.text).toBe("draft B");
  });

  it("prefers history.state over stale session after a new stash", async () => {
    const hero = await import("./heroIntakePrefill");
    hero.stashHeroIntakePrefill("draft A");
    historyState = { clawHeroIntake: "draft B" };
    expect(hero.readHeroIntakeHandoffForCreate()?.text).toBe("draft B");
  });

  it("navigate-without-payload reset yields no handoff", async () => {
    const hero = await import("./heroIntakePrefill");
    hero.stashHeroIntakePrefill("stale");
    hero.resetHeroHandoffForCreateNavigationWithoutPayload();
    expect(localRemoveItem).toHaveBeenCalledWith(AGREEMENT_CREATOR_INTAKE_STORAGE_KEY);
    historyState = null;
    expect(hero.readHeroIntakeHandoffForCreate()).toBe(null);
  });

  it("expires v2 session handoff after max age", async () => {
    const t0 = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(t0);
    const hero = await import("./heroIntakePrefill");
    hero.stashHeroIntakePrefill("timed out");
    historyState = null;
    vi.spyOn(Date, "now").mockReturnValue(t0 + 31 * 60 * 1000);
    expect(hero.readHeroIntakeHandoffForCreate()).toBe(null);
    vi.restoreAllMocks();
  });

  it("legacy plain string session is removed after one read", async () => {
    const hero = await import("./heroIntakePrefill");
    session["claw_hero_intake_prefill_v1"] = "legacy plain";
    historyState = null;
    expect(hero.readHeroIntakeHandoffForCreate()?.text).toBe("legacy plain");
    expect(session["claw_hero_intake_prefill_v1"]).toBeUndefined();
  });

  it("clearHeroIntakeHandoffAfterApply drops cache for next visit", async () => {
    const hero = await import("./heroIntakePrefill");
    hero.stashHeroIntakePrefill("once");
    expect(hero.readHeroIntakeHandoffForCreate()?.text).toBe("once");
    hero.clearHeroIntakeHandoffAfterApply();
    historyState = null;
    expect(hero.readHeroIntakeHandoffForCreate()).toBe(null);
  });

  it("fromHome handoff preserves empty string (explicit blank over restored draft)", async () => {
    const hero = await import("./heroIntakePrefill");
    historyState = { clawHeroIntake: "", clawHeroFromHome: true, clawHeroVoiceFinalize: false };
    expect(hero.readHeroIntakeHandoffForCreate()).toEqual({
      text: "",
      fromHome: true,
      voiceFinalize: false,
      autoGenerate: false,
    });
  });

  it("voice finalize flag is visible on payload for create-page UX", async () => {
    const hero = await import("./heroIntakePrefill");
    historyState = {
      clawHeroIntake: "party A pays party B",
      clawHeroFromHome: true,
      clawHeroVoiceFinalize: true,
    };
    expect(hero.readHeroIntakeHandoffForCreate()).toEqual({
      text: "party A pays party B",
      fromHome: true,
      voiceFinalize: true,
      autoGenerate: false,
    });
  });
});
