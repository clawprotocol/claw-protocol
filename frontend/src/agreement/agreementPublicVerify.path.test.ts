import { describe, expect, it } from "vitest";
import { agreementPublicVerifyPath, parseAgreementVerifyPath } from "./agreementPublicVerify";

describe("agreementPublicVerify path contract", () => {
  it("canonical shareable path is /verify/:id", () => {
    expect(agreementPublicVerifyPath("ag_test")).toBe("/verify/ag_test");
  });

  it("parseAgreementVerifyPath accepts public and legacy app paths", () => {
    expect(parseAgreementVerifyPath("/verify/ag_x")).toEqual({ agreementId: "ag_x" });
    expect(parseAgreementVerifyPath("/app/verify/ag_x")).toEqual({ agreementId: "ag_x" });
    expect(parseAgreementVerifyPath("/app/verification/ag_x")).toBeNull();
  });
});
