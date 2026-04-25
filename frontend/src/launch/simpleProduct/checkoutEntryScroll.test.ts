import { describe, expect, it } from "vitest";
import { isSimpleCheckoutPath } from "./checkoutEntryScroll";

describe("isSimpleCheckoutPath", () => {
  it("matches simple checkout routes", () => {
    expect(isSimpleCheckoutPath("/app/checkout/foo")).toBe(true);
    expect(isSimpleCheckoutPath("/app/checkout/__create_flow__")).toBe(true);
  });

  it("does not match other app routes", () => {
    expect(isSimpleCheckoutPath("/app/create")).toBe(false);
    expect(isSimpleCheckoutPath("/app/billing")).toBe(false);
    expect(isSimpleCheckoutPath("/")).toBe(false);
  });
});
