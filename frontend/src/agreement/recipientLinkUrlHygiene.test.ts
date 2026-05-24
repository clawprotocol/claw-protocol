/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  sanitizedRecipientLinkSearch,
  stripRecipientAccessTokenQueryFromLocation,
} from "./recipientLinkUrlHygiene";

describe("recipient link URL hygiene", () => {
  it("removes recipient access tokens while preserving non-sensitive route params", () => {
    expect(sanitizedRecipientLinkSearch("?t=secret-token&p=party-1&role=reviewer")).toBe("?p=party-1&role=reviewer");
    expect(sanitizedRecipientLinkSearch("?token=secret-token&v=locked-1")).toBe("?v=locked-1");
  });

  it("strips recipient access token query params from browser history", () => {
    window.history.replaceState({}, "", "/agreements/ag_1/review?t=secret-token&p=party-1#section");

    stripRecipientAccessTokenQueryFromLocation();

    expect(window.location.href).not.toContain("secret-token");
    expect(window.location.search).toBe("?p=party-1");
    expect(window.location.hash).toBe("#section");
  });
});
