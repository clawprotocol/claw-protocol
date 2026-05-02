import { describe, expect, it } from "vitest";
import {
  buildDetailsStepFieldErrors,
  counterpartyNameErrorKey,
  detailsStepIsValid,
  firstDetailsErrorFieldSelector,
  firstPlausibleEmailInSignerRef,
} from "./detailsStepValidation";

const row = (id: string, name: string) => ({ id, name, email: "", phone: "" });

const em = "me@example.com";

describe("buildDetailsStepFieldErrors", () => {
  it("returns all required errors when everything is empty", () => {
    const cp = [row("cp-1", "")];
    const e = buildDetailsStepFieldErrors("", "", "", cp);
    expect(e.agreementTitle).toBe("Agreement title is required");
    expect(e.creatorName).toBe("Your name is required");
    expect(e.creatorEmail).toBe("Your email is required");
    expect(e[counterpartyNameErrorKey("cp-1")]).toBe("Add at least one signer name");
  });

  it("clears title error when title present", () => {
    const cp = [row("cp-1", "Jamie")];
    const e = buildDetailsStepFieldErrors("Lease", "", "", cp);
    expect(e.agreementTitle).toBeUndefined();
    expect(e.creatorName).toBeDefined();
  });

  it("flags invalid email when present but malformed", () => {
    const cp = [row("cp-1", "Jamie")];
    const e = buildDetailsStepFieldErrors("Lease", "Me", "not-an-email", cp);
    expect(e.creatorEmail).toBe("Enter a valid email address");
  });

  it("clears signer error when any counterparty has a name", () => {
    const cp = [row("a", ""), row("b", "Pat")];
    const e = buildDetailsStepFieldErrors("T", "Me", em, cp);
    expect(Object.keys(e)).toHaveLength(0);
  });

  it("binds missing-signer error to the first row id", () => {
    const cp = [row("first-id", ""), row("second", "")];
    const e = buildDetailsStepFieldErrors("T", "Me", em, cp);
    expect(e[counterpartyNameErrorKey("first-id")]).toBe("Add at least one signer name");
    expect(e[counterpartyNameErrorKey("second")]).toBeUndefined();
  });
});

describe("detailsStepIsValid", () => {
  it("is true only when all requirements met", () => {
    expect(detailsStepIsValid("", "", "", [row("1", "")])).toBe(false);
    expect(detailsStepIsValid("Title", "Me", "", [row("1", "They")])).toBe(false);
    expect(detailsStepIsValid("Title", "Me", em, [row("1", "They")])).toBe(true);
  });
});

describe("firstDetailsErrorFieldSelector", () => {
  it("orders title before creator before counterparty", () => {
    const cp = [row("x", "")];
    expect(
      firstDetailsErrorFieldSelector(cp, {
        agreementTitle: "Agreement title is required",
        creatorName: "Your name is required",
        creatorEmail: "Your email is required",
        [counterpartyNameErrorKey("x")]: "Add at least one signer name",
      })
    ).toBe(`[data-vs01-details-field="agreementTitle"]`);

    expect(
      firstDetailsErrorFieldSelector(cp, {
        creatorName: "Your name is required",
        creatorEmail: "Your email is required",
        [counterpartyNameErrorKey("x")]: "x",
      })
    ).toBe(`[data-vs01-details-field="creatorName"]`);

    expect(
      firstDetailsErrorFieldSelector(cp, {
        creatorEmail: "Your email is required",
        [counterpartyNameErrorKey("x")]: "x",
      })
    ).toBe(`[data-vs01-details-field="creatorEmail"]`);

    expect(
      firstDetailsErrorFieldSelector(cp, {
        [counterpartyNameErrorKey("x")]: "x",
      })
    ).toContain(`data-counterparty-id=`);
  });
});

describe("firstPlausibleEmailInSignerRef", () => {
  it("extracts email from defaultSignerRef style strings", () => {
    expect(firstPlausibleEmailInSignerRef("Acme LLC · billing@acme.com")).toBe("billing@acme.com");
    expect(firstPlausibleEmailInSignerRef("solo@signer.dev")).toBe("solo@signer.dev");
    expect(firstPlausibleEmailInSignerRef("Name only")).toBeUndefined();
  });
});
