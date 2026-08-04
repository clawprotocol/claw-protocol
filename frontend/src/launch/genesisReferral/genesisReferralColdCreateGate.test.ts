/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildColdReferralSignInPath,
  buildGenesisReferralCreateDestination,
  prepareColdReferralCreateRedirect,
  referralCodeFromCreateSearch,
  resolveColdReferralCreateRedirect,
  resolveSignInNextDestination,
} from "./genesisReferralColdCreateGate";
import { getGenesisReferralCode } from "./genesisReferralCapture";

describe("genesisReferralColdCreateGate", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie.split(";").forEach((c) => {
      const name = c.split("=")[0]?.trim();
      if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("extracts and normalizes ref from create search", () => {
    expect(referralCodeFromCreateSearch("?ref=FOUNDERTEST")).toBe("FOUNDERTEST");
    expect(referralCodeFromCreateSearch("?ref=founder-test")).toBe("FOUNDER-TEST");
    expect(referralCodeFromCreateSearch("")).toBeNull();
    expect(referralCodeFromCreateSearch("?join=genesis-dogs")).toBeNull();
  });

  it("builds create destination and sign-in next path preserving CODE", () => {
    expect(buildGenesisReferralCreateDestination("FOUNDERTEST")).toBe(
      "/app/create?ref=FOUNDERTEST",
    );
    expect(buildColdReferralSignInPath("FOUNDERTEST")).toBe(
      "/app/sign-in?next=%2Fapp%2Fcreate%3Fref%3DFOUNDERTEST",
    );
  });

  it("redirects cold unauthenticated create?ref visitors to sign-in", () => {
    const gate = resolveColdReferralCreateRedirect({
      authLoading: false,
      isAuthenticated: false,
      search: "?ref=FOUNDERTEST",
    });
    expect(gate).toEqual({
      referralCode: "FOUNDERTEST",
      redirectTo: "/app/sign-in?next=%2Fapp%2Fcreate%3Fref%3DFOUNDERTEST",
    });
  });

  it("does not redirect while auth is loading, when signed in, or without ref", () => {
    expect(
      resolveColdReferralCreateRedirect({
        authLoading: true,
        isAuthenticated: false,
        search: "?ref=FOUNDERTEST",
      }),
    ).toBeNull();
    expect(
      resolveColdReferralCreateRedirect({
        authLoading: false,
        isAuthenticated: true,
        search: "?ref=FOUNDERTEST",
      }),
    ).toBeNull();
    expect(
      resolveColdReferralCreateRedirect({
        authLoading: false,
        isAuthenticated: false,
        search: "",
      }),
    ).toBeNull();
  });

  it("persists referral code before cold redirect so attribution survives auth", () => {
    const gate = prepareColdReferralCreateRedirect({
      authLoading: false,
      isAuthenticated: false,
      search: "?ref=FOUNDERTEST",
      pathname: "/app/create",
    });
    expect(gate?.referralCode).toBe("FOUNDERTEST");
    expect(getGenesisReferralCode()).toBe("FOUNDERTEST");
  });

  it("resolves allowlisted next= destinations and blocks open redirects", () => {
    expect(
      resolveSignInNextDestination("?next=%2Fapp%2Fcreate%3Fref%3DFOUNDERTEST", "/app"),
    ).toBe("/app/create?ref=FOUNDERTEST");
    expect(resolveSignInNextDestination("?next=https://evil.example", "/app")).toBe("/app");
    expect(resolveSignInNextDestination("?next=//evil.example", "/app")).toBe("/app");
    expect(resolveSignInNextDestination("", "/app")).toBe("/app");
  });
});
