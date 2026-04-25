import { describe, expect, it } from "vitest";
import {
  canAccessFullTimeline,
  canReuseTemplates,
  canUseAdvancedWorkProduct,
  monetizationPlanFromAccessTier,
  shouldBlockSecondAgreementCreation,
} from "./lawDogMonetization";
import type { LawDogUserMonetizationState } from "./types";

function user(p: Partial<LawDogUserMonetizationState>): LawDogUserMonetizationState {
  return { isAuthenticated: true, plan: "free", agreements_created: 0, ...p };
}

describe("monetizationPlanFromAccessTier", () => {
  it("maps free standard premium admin", () => {
    expect(monetizationPlanFromAccessTier("free")).toBe("free");
    expect(monetizationPlanFromAccessTier("standard")).toBe("pro");
    expect(monetizationPlanFromAccessTier("premium")).toBe("power");
    expect(monetizationPlanFromAccessTier("admin")).toBe("power");
  });
});

describe("shouldBlockSecondAgreementCreation", () => {
  it("blocks only free with count >= 1", () => {
    expect(shouldBlockSecondAgreementCreation(user({ plan: "free", agreements_created: 1 }))).toBe(true);
    expect(shouldBlockSecondAgreementCreation(user({ plan: "pro", agreements_created: 5 }))).toBe(false);
    expect(shouldBlockSecondAgreementCreation(user({ plan: "power", agreements_created: 5 }))).toBe(false);
  });
});

describe("Power feature gates", () => {
  it("free and pro cannot reuse templates or advanced work product or full timeline", () => {
    expect(canReuseTemplates(user({ plan: "free" }))).toBe(false);
    expect(canReuseTemplates(user({ plan: "pro" }))).toBe(false);
    expect(canUseAdvancedWorkProduct(user({ plan: "pro" }))).toBe(false);
    expect(canAccessFullTimeline(user({ plan: "free" }))).toBe(false);
    expect(canAccessFullTimeline(user({ plan: "pro" }))).toBe(false);
  });

  it("power unlocks all three", () => {
    expect(canReuseTemplates(user({ plan: "power" }))).toBe(true);
    expect(canUseAdvancedWorkProduct(user({ plan: "power" }))).toBe(true);
    expect(canAccessFullTimeline(user({ plan: "power" }))).toBe(true);
  });
});
