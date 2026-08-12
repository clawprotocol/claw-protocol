/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  getPricingCadencePreference,
  setPricingCadencePreference,
} from "./pricingCadenceStorage";

describe("pricingCadenceStorage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("defaults to monthly for paid beta when no preference is stored", () => {
    expect(getPricingCadencePreference()).toBe("monthly");
  });

  it("honors an explicit annual preference once selected", () => {
    setPricingCadencePreference("annual");
    expect(getPricingCadencePreference()).toBe("annual");
  });

  it("honors an explicit monthly preference", () => {
    setPricingCadencePreference("monthly");
    expect(getPricingCadencePreference()).toBe("monthly");
  });
});
