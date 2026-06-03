import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  isRecitalFragmentExecutionPartyLine,
  repairDuplicatedLegalEntitySuffixPhrase,
} from "./paidProLegalEntityNameHygiene";
import {
  clearPremiumParseSessionGuard,
  markPremiumAuthoritativeServerCorpusAccepted,
  shouldSuppressPremiumPipelineRetryAfterAuthoritativeAccept,
} from "./premiumParseSessionGuard";
import {
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";

const RECITAL = `This Agreement is between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`;

function goodExecutionBlock(): string {
  return [
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    PAID_PRO_HARDENING_CLIENT,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
    "",
    "SERVICE PROVIDER:",
    PAID_PRO_HARDENING_PROVIDER,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
  ].join("\n");
}

function buildTriplicateCorpus(): string {
  const operative = [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    RECITAL,
    "",
    "1. SCOPE OF SERVICES. Provider delivers services.",
    "Substantive operative clause. ".repeat(400),
  ].join("\n");
  const fragmentBlock = [
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    `This Agreement is between ${PAID_PRO_HARDENING_CLIENT}`,
    "By: __________________________",
    "",
    "SERVICE PROVIDER:",
    `and ${PAID_PRO_HARDENING_PROVIDER.replace(/\.$/, "")} Systems Inc`,
    "By: __________________________",
  ].join("\n");
  return [operative, goodExecutionBlock(), fragmentBlock, fragmentBlock].join("\n\n");
}

describe("paidPro Test234 execution normalization", () => {
  it("repairs duplicated legal suffix phrases", () => {
    expect(repairDuplicatedLegalEntitySuffixPhrase("Iron Vale Systems Inc. Systems Inc")).toMatch(
      /Iron Vale Systems Inc\.?$/,
    );
  });

  it("rejects recital fragments as execution party lines", () => {
    expect(isRecitalFragmentExecutionPartyLine("This Agreement is between Blue Canyon Analytics LLC")).toBe(
      true,
    );
    expect(isRecitalFragmentExecutionPartyLine("by and between Blue Canyon Analytics LLC")).toBe(true);
    expect(isRecitalFragmentExecutionPartyLine(`and ${PAID_PRO_HARDENING_PROVIDER}`)).toBe(true);
    expect(isRecitalFragmentExecutionPartyLine(PAID_PRO_HARDENING_CLIENT)).toBe(false);
    expect(
      isRecitalFragmentExecutionPartyLine(
        `This Agreement is entered into between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
      ),
    ).toBe(false);
  });

  it("collapses triplicate execution blocks to exactly one canonical tail", () => {
    const raw = buildTriplicateCorpus();
    expect(countPaidProExecutionBlocks(raw)).toBeGreaterThan(1);
    const normalized = enforcePaidProSingleExecutionBlock(raw);
    expect(countPaidProExecutionBlocks(normalized.text)).toBe(1);
    expect(normalized.text).toMatch(new RegExp(`CLIENT:\\s*\\n\\s*${PAID_PRO_HARDENING_CLIENT.replace(/\./g, "\\.")}`, "i"));
    expect(normalized.text).toMatch(/SERVICE PROVIDER:\s*\n\s*Iron Vale/i);
    expect(normalized.text).not.toMatch(/This Agreement is between Blue Canyon Analytics LLC\s*\nBy:/i);
    expect(normalized.text).not.toMatch(/Systems Inc\. Systems Inc/i);
  });

  it("applyAcceptedProCorpusSafeDisplay enforces single execution block on long accepted corpus", () => {
    const raw = buildTriplicateCorpus();
    const safe = applyAcceptedProCorpusSafeDisplay(raw, {
      draft: {
        parties: [
          { name: PAID_PRO_HARDENING_CLIENT, role: "Client" },
          { name: PAID_PRO_HARDENING_PROVIDER, role: "Service Provider" },
        ],
      } as ParsedDraftShape,
      intakeText: `Consulting agreement between ${PAID_PRO_HARDENING_CLIENT} and ${PAID_PRO_HARDENING_PROVIDER}.`,
    });
    expect(countPaidProExecutionBlocks(safe.text)).toBe(1);
    expect(safe.text).toContain(PAID_PRO_HARDENING_CLIENT);
    expect(safe.text).toMatch(/Iron Vale Systems Inc/i);
  });
});

describe("paidPro Test234 parse session guard", () => {
  it("classifies premium_parse_timeout separately from completion attempt timeout", async () => {
    const { isPremiumParseTimeoutError } = await import("./premiumParseSessionGuard");
    expect(isPremiumParseTimeoutError(new Error("premium_parse_timeout"))).toBe(true);
    expect(isPremiumParseTimeoutError(new Error("premium_completion_attempt_timeout_600000ms"))).toBe(
      false,
    );
  });

  it("suppresses retry after authoritative server corpus is marked accepted", () => {
    clearPremiumParseSessionGuard();
    expect(shouldSuppressPremiumPipelineRetryAfterAuthoritativeAccept(new Error("premium_parse_timeout"))).toBe(
      false,
    );
    markPremiumAuthoritativeServerCorpusAccepted();
    expect(shouldSuppressPremiumPipelineRetryAfterAuthoritativeAccept(new Error("premium_parse_timeout"))).toBe(
      true,
    );
    clearPremiumParseSessionGuard();
  });
});

describe("paidPro Test234 premium completion track B", () => {
  it("reuses track A parse for track B instead of a third parseDraft call", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "premiumCompletionPipeline.ts"), "utf8");
    expect(source).toMatch(/const trackBParse = premiumParse;/);
    expect(source).not.toMatch(/await\s+input\.parseDraft\([^)]*trackB/i);
    const parseDraftCalls = source.match(/await\s+input\.parseDraft\(/g) ?? [];
    expect(parseDraftCalls.length).toBeLessThanOrEqual(2);
  });
});
