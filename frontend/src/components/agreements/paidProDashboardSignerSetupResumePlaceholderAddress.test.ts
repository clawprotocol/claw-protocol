/**
 * Dashboard resume must not keep "provided during signer setup" in address fields —
 * that string fails isPaidProSigningReadyHydratedCorpus and previously caused a silent Continue.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildHydratedAuthoritativeSigningCorpusFromAuthority,
} from "./authoritativeSignerHydration";
import { sanitizeCanonicalPartyAddress } from "./canonicalPartyStructuredAddress";
import { formatNoticeAddressLines } from "./paidProPartyNoticeDetails";
import { isPaidProSigningReadyHydratedCorpus } from "./paidProPostFinalizeReviewSurface";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";

const here = dirname(fileURLToPath(import.meta.url));
const intakeSrc = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");

const RAW_WITH_PLACEHOLDER_NOTICES = `
SERVICES AGREEMENT

This Services Agreement (this "Agreement") is entered into as of the Effective Date by and between Acme Test Co ("Client") and LawDog Demo LLC ("Service Provider").

1. Services
Provider will make its agreement-drafting software available to Client during the Term.

2. Term
The initial term is thirty (30) days.

3. Fees
Client will pay Provider $1,000 per month.

4. Confidentiality
Each party will protect the other party's confidential information.

5. Intellectual Property
Provider retains all rights in the software.

6. Limitation of Liability
Neither party's aggregate liability exceeds fees paid in the prior twelve months.

7. Indemnification
Each party will indemnify the other against third-party claims arising from its breach.

8. Governing Law
Illinois law governs this Agreement.

9. Notices
Any notice under this Agreement must be in writing.

If to Acme Test Co:
Acme Test Co
Attention: Authorized Signer
Email: provided during signer setup
Address: provided during signer setup

If to LawDog Demo LLC:
LawDog Demo LLC
Attention: Authorized Signer
Email: provided during signer setup
Address: provided during signer setup

10. Entire Agreement
This Agreement is the entire agreement between the parties.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT: Acme Test Co
By: __________________________
Name: __________________________
Title: _________________________
Date: _____________________________

SERVICE PROVIDER:
LawDog Demo LLC
By: __________________________
Name: __________________________
Title: _________________________
Date: _____________________________
`.trim();

describe("dashboard resume placeholder address finalize", () => {
  it("sanitizes resume-prefilled placeholder addresses to empty", () => {
    expect(sanitizeCanonicalPartyAddress("provided during signer setup")).toBe("");
    expect(
      sanitizeCanonicalPartyAddress("provided during signer setup, If to LawDog Demo LLC:"),
    ).toBe("");
    expect(formatNoticeAddressLines("provided during signer setup")).toEqual([]);
  });

  it("finalize with placeholder address UI still produces signing-ready corpus", () => {
    const authority = buildLivePaidProSignerMetadataAuthority(
      {
        partyCount: 2,
        partySignerNames: ["Alice Resume", "Bob Resume"],
        partySignerTitles: ["CEO", "General Counsel"],
        partyAddresses: [
          "provided during signer setup, If to LawDog Demo LLC:",
          "provided during signer setup",
        ],
        recipient1Email: "alice@acme.test",
        recipient2Email: "bob@lawdog.test",
        recipient1Name: "Acme Test Co",
        recipient2Name: "LawDog Demo LLC",
        extraPartyReviewEmails: [],
      },
      "live_ui",
      {
        intakeText: RAW_WITH_PLACEHOLDER_NOTICES,
        draftPartyNames: ["Acme Test Co", "LawDog Demo LLC"],
      },
    );
    for (const p of authority.parties) {
      expect(p.partyAddress).not.toMatch(/provided during signer setup/i);
    }
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW_WITH_PLACEHOLDER_NOTICES,
      authority,
      intakeRaw: RAW_WITH_PLACEHOLDER_NOTICES,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).toBe(false);
    expect(hydrated.corpus).toMatch(/Alice Resume/);
    expect(hydrated.corpus).toMatch(/Bob Resume/);
    expect(hydrated.corpus).not.toMatch(/provided during signer setup/i);
    expect(isPaidProSigningReadyHydratedCorpus(hydrated.corpus)).toBe(true);
  });

  it("intake surfaces finalize failures on signer-setup CTA helper (not silent)", () => {
    expect(intakeSrc).toContain("isActionableSignerFinalizeErrorRaw");
    expect(intakeSrc).toContain("guidedSigningConfirmationBlockMessage ||");
    expect(intakeSrc).toContain("paidProSignerDetailsGate.blockerMessage");
    expect(intakeSrc).toContain("Signer details could not be applied");
  });
});
