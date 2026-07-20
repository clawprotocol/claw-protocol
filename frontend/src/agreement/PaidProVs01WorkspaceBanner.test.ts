import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("PaidProVs01WorkspaceBanner (static)", () => {
  const bannerSrc = () => readFileSync(join(__dirname, "PaidProVs01WorkspaceBanner.tsx"), "utf8");
  const shellSrc = () => readFileSync(join(__dirname, "AgreementWizardShell.tsx"), "utf8");

  it("AgreementWizardShell mounts banner when workspace is ready", () => {
    const shell = shellSrc();
    expect(shell).toContain("PaidProVs01WorkspaceBanner");
    expect(shell).toContain("wizardBoot === \"ready\"");
  });

  it("post-sign banner renders pending signer line", () => {
    const s = bannerSrc();
    expect(s).toContain("still needs to sign");
    expect(s).toMatch(/Your signature is complete\.\s.*still needs to sign/);
  });

  it("advanced workspace dropdown absent in post-sign simple mode", () => {
    const shell = shellSrc();
    expect(shell).not.toContain("vs01-agreement-advanced-workspace");
    expect(shell).not.toContain("Advanced workspace details");
  });

  it("receipt ID and SHA-256 absent by default (gated behind diagnostic flag)", () => {
    const s = bannerSrc();
    expect(s).toContain("showProofDiag");
    const diagGateIdx = s.indexOf("showProofDiag ? (");
    const receiptIdIdx = s.indexOf("Receipt ID");
    const sha256Idx = s.indexOf("SHA-256");
    expect(diagGateIdx).toBeGreaterThanOrEqual(0);
    expect(receiptIdIdx).toBeGreaterThan(diagGateIdx);
    expect(sha256Idx).toBeGreaterThan(diagGateIdx);
  });

  it("signing link buttons still render", () => {
    const s = bannerSrc();
    expect(s).toContain("Copy signing link");
    expect(s).toContain("Open signing link");
    expect(s).toContain("Download proof");
  });

  it("dev proof diagnostics can expose receipt/hash if diagnostic flag enabled", () => {
    const s = bannerSrc();
    expect(s).toContain("import.meta.env.DEV");
    expect(s).toContain("lawdogProofDiag");
    expect(s).toContain("proof_diag");
    expect(s).toContain("Receipt ID");
    expect(s).toContain("SHA-256");
    expect(s).toContain("Copy proof receipt");
  });

  it("displays compact proof line and optional public timestamp copy", () => {
    const s = bannerSrc();
    expect(
      s.includes("Proof record saved. Verification package available.") || s.includes("Packet prepared. Proof downloads"),
    ).toBe(true);
    expect(s).toContain("Optional public timestamp");
    expect(s).toContain("Not requested yet");
  });

  it("does not mention Dogecoin or Bitcoin in banner UI", () => {
    const s = bannerSrc();
    expect(s.toLowerCase()).not.toContain("dogecoin");
    expect(s.toLowerCase()).not.toContain("bitcoin");
  });

  it("does not show Anchored externally wording", () => {
    const s = bannerSrc();
    expect(s).not.toContain("Anchored externally");
  });

  it("banner surfaces saved or packet-ready headline", () => {
    const s = bannerSrc();
    expect(s).toContain("Saved in LawDog");
    expect(s).toContain("Signature links are ready");
    expect(s).toContain("vs01_packet_ready");
  });
});
