import { describe, expect, it } from "vitest";
import { overlayCorpusDeclaredRoleLabels } from "../components/agreements/paidProAcceptedCorpusPartyRoles";
import { applyPaidProReviewRenderSanitizer } from "../components/agreements/paidProReviewRenderCorpus";
import { repairMalformedPaidProAgreementRecital } from "../components/agreements/paidProAgreementRecitalRepair";
import { restoreDeclaredConsultantClientPaper } from "../components/agreements/paidProDeclaredConsultantClientPaper";
import { applyReviewTrackDisplayFormatting } from "../launch/simpleProduct/reviewFirstDisplayCorpus";
import { buildReviewFirstDocumentDisplayHtml } from "./reviewFirstDocumentDisplay";
import { extractVisiblePlainFromReviewHtml } from "./reviewFirstDocumentDisplayParity";

const HARBOR = "Harbor Peak Analytics LLC";
const IRONVALE = "Ironvale Manufacturing Inc.";
const HARBOR_CONSULTANT_CORPUS = `CONSULTING SERVICES AGREEMENT

This Consulting Services Agreement (the "Agreement") is entered into as of October 1, 2026 by and between ${HARBOR} ("Consultant") and ${IRONVALE} ("Client").

1. PARTIES AND ROLES

Consultant is an independent professional services firm. Client is retaining Consultant to perform the services described in this Agreement. Consultant's authorized signer is Maya Chen. Client's authorized signer is Jordan Hale.

2. SCOPE OF SERVICES

Consultant shall perform AI workflow implementation for Client, including discovery, implementation planning, configuration, and knowledge transfer.

3. FEES AND PAYMENT

Client shall pay a fixed fee of $48,000 for the services.

4. TERM AND DURATION

The initial term is twelve months beginning October 1, 2026.

5. OBLIGATIONS

Consultant shall perform the services in a professional manner.

6. INTELLECTUAL PROPERTY

Consultant retains ownership of pre-existing tools. Client owns deliverables after payment.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CONSULTANT:
${HARBOR}
By: __________________________
Name: Maya Chen
Title: __________________________
Date: _____________________________

CLIENT:
${IRONVALE}
By: __________________________
Name: Jordan Hale
Title: __________________________
Date: _____________________________`;

const CORPUS = `MASTER SERVICES AGREEMENT

This Mutual Services Agreement (the "Agreement") is entered into as of the Effective Date by and between Client Co, a Delaware corporation ("Client"), and Provider LLC, a California limited liability company ("Service Provider").

${"Consulting services shall be performed in a professional manner. ".repeat(24)}`;

describe("reviewFirstDocumentDisplay", () => {
  it("includes signature region in display html when corpus has execution block", () => {
    const corpus = `MASTER SERVICES AGREEMENT

This Agreement is between parties.

${"Services shall be performed professionally. ".repeat(30)}

IN WITNESS WHEREOF

Blue Canyon Analytics LLC
Sarah Mitchell
CEO
Notice Email: legal@bluecanyon.example

Iron Vale Systems Inc.
Michael Torres
President`;
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "<p>short</p>",
      corpusText: corpus,
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
    });
    expect(html).toMatch(/premium-doc-signature|Sarah Mitchell|Michael Torres/i);
  });

  it("routes long paid-pro corpus through premium readonly html builder", () => {
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "<p>weak title</p>",
      corpusText: CORPUS,
      partyNames: ["Client Co", "Provider LLC"],
    });
    expect(html).not.toContain('class="premium-readonly-doc"');
    expect(html.toLowerCase()).toContain("master services agreement");
    expect(html).not.toContain("weak title");
  });

  it("wraps short server html with premium-readonly-doc class", () => {
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "<p>Short draft</p>",
      corpusText: "tiny",
    });
    expect(html).toContain('class="premium-readonly-doc"');
    expect(html).toContain("Short draft");
  });

  it("overlay maps Harbor CLIENT slots to Consultant from the accepted opening", () => {
    const overlaid = overlayCorpusDeclaredRoleLabels(
      [
        { fullLegalName: HARBOR, roleLabel: "CLIENT" },
        { fullLegalName: IRONVALE, roleLabel: "SERVICE PROVIDER" },
      ],
      HARBOR_CONSULTANT_CORPUS,
    );
    expect(overlaid[0]?.roleLabel).toBe("Consultant");
    expect(overlaid[1]?.roleLabel).toBe("Client");
  });

  it("does not rewrite Harbor Consultant / Ironvale Client on the reviewer display surface", () => {
    const formatted = applyReviewTrackDisplayFormatting(HARBOR_CONSULTANT_CORPUS);
    expect(formatted).toContain(`${HARBOR} ("Consultant")`);
    expect(formatted).not.toMatch(/Harbor Peak Analytics LLC\s*\(\s*"CLIENT"\s*\)/);
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "<p>unused</p>",
      corpusText: formatted,
      partyNames: [HARBOR, IRONVALE],
      surface: "reviewer",
    });
    const visible = extractVisiblePlainFromReviewHtml(html);
    expect(visible).toContain(`${HARBOR} ("Consultant")`);
    expect(visible).toMatch(/Ironvale Manufacturing Inc\.?\s*\(\s*"Client"\s*\)/);
    expect(visible).not.toMatch(/Harbor Peak Analytics LLC\s*\(\s*"CLIENT"\s*\)/);
    expect(visible).not.toMatch(/Ironvale Manufacturing Inc\.?\s*\(\s*"SERVICE PROVIDER"\s*\)/);
    const sanitized = applyPaidProReviewRenderSanitizer(
      HARBOR_CONSULTANT_CORPUS,
      [
        {
          partyIndex: 0,
          partyLegalName: HARBOR,
          signerName: "Maya Chen",
          signerEmail: "maya.chen@harborpeak.test",
          signerTitle: "",
          partyAddress: "",
        },
        {
          partyIndex: 1,
          partyLegalName: IRONVALE,
          signerName: "Jordan Hale",
          signerEmail: "jordan.hale@ironvale.test",
          signerTitle: "",
          partyAddress: "",
        },
      ],
      { acceptedCorpus: HARBOR_CONSULTANT_CORPUS },
    ).text;
    expect(sanitized).toContain(`${HARBOR} ("Consultant")`);
    expect(sanitized).not.toMatch(/Harbor Peak Analytics LLC\s*\(\s*"CLIENT"\s*\)/);
  });

  it("recital hydration does not remap Harbor Consultant to CLIENT", () => {
    const repaired = repairMalformedPaidProAgreementRecital(HARBOR_CONSULTANT_CORPUS, [
      {
        partyIndex: 0,
        partyLegalName: HARBOR,
        signerName: "Maya Chen",
        signerEmail: "maya.chen@harborpeak.test",
        signerTitle: "",
        partyAddress: "",
      },
      {
        partyIndex: 1,
        partyLegalName: IRONVALE,
        signerName: "Jordan Hale",
        signerEmail: "jordan.hale@ironvale.test",
        signerTitle: "",
        partyAddress: "",
      },
    ]).text;
    expect(repaired).toContain(`${HARBOR} ("Consultant")`);
    expect(repaired).not.toMatch(/Harbor Peak Analytics LLC\s*\(\s*"CLIENT"\s*\)/);
    expect(repaired).toMatch(/CONSULTANT\s*:/i);
  });

  it("restores Consultant opening and remaps inverted CLIENT execution headings", () => {
    const flipped = `SERVICES AGREEMENT

This Services Agreement (this "Agreement") is entered into as of the Effective Date by and between ${HARBOR} ("CLIENT") and ${IRONVALE} ("SERVICE PROVIDER").

1. PARTIES AND ROLES

Consultant is an independent professional services firm.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
${HARBOR}
By: __________________________

SERVICE PROVIDER:
${IRONVALE}
By: __________________________`;
    const restored = restoreDeclaredConsultantClientPaper(flipped, HARBOR_CONSULTANT_CORPUS);
    expect(restored).toContain(`${HARBOR} ("Consultant")`);
    expect(restored).toMatch(/CONSULTANT\s*:/i);
    expect(restored).not.toMatch(/Harbor Peak Analytics LLC\s*\(\s*"CLIENT"\s*\)/);
  });

  it("owner signed view restores ClearSpring LLC stripped from the opening", () => {
    const stone = "Stonebridge Wellness LLC";
    const nova = "NovaPath Learning Inc.";
    const clear = "ClearSpring Distribution LLC";
    const accepted = [
      `INTELLECTUAL PROPERTY LICENSE AND ROYALTY AGREEMENT`,
      "",
      `This Services Agreement (the "Agreement") is entered into as of the Effective Date by and among ${stone} ("Content Owner / Licensor"), ${nova} ("Platform Adapter / Host"), and ${clear} ("Distributor") (each a "Party" and collectively, the "Parties").`,
      "",
      "1. PARTIES AND ROLES",
      `${stone}'s authorized signer is Sandra Wells. ${nova}'s authorized signer is Caleb Price. ${clear}'s authorized signer is Maya Coleman.`,
      "",
      "3. FEES AND PAYMENT",
      `Subscription revenue is split 45% to ${stone}, 35% to ${nova}, and 20% to ${clear}.`,
      "",
      `If to ${clear}:`,
      clear,
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      clear,
      "By: Maya Coleman",
      ...Array.from({ length: 20 }, () => "Operative commercial paragraph for length."),
    ].join("\n");
    const stripped = accepted
      .replace(`${clear} ("Distributor")`, `ClearSpring Distribution ("Distributor")`)
      .replace(`${clear}'s authorized signer`, `ClearSpring Distribution 's authorized signer`)
      .replace(`20% to ${clear}.`, `20% to ClearSpring Distribution .`);
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "",
      corpusText: stripped,
      partyNames: [stone, nova, clear],
      surface: "owner_done",
    });
    const visible = extractVisiblePlainFromReviewHtml(html);
    expect(visible).toContain(`${clear} ("Distributor")`);
    expect(visible).toContain(`${clear}'s authorized signer`);
    expect(visible).toContain(`20% to ${clear}.`);
    expect(visible).not.toMatch(/ClearSpring Distribution \("Distributor"\)/);
  });

  it("owner signed view does not double Ironvale Inc.", () => {
    const harbor = "Harbor Peak Analytics LLC";
    const ironvale = "Ironvale Manufacturing Inc.";
    const accepted = [
      `This Services Agreement (this "Agreement") is entered into by and between ${harbor} ("Service Provider") and ${ironvale} ("Client"). Service Provider and Client may be referred to individually as a "Party" and collectively as the "Parties."`,
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      ...Array.from({ length: 20 }, () => "Operative commercial paragraph for length."),
    ].join("\n");
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "",
      corpusText: accepted,
      partyNames: [harbor, ironvale],
      surface: "owner_done",
    });
    const visible = extractVisiblePlainFromReviewHtml(html);
    expect(visible).toContain(`${ironvale} ("Client")`);
    expect(visible).not.toMatch(/Ironvale Manufacturing Inc\. Inc\./);
  });
});
