import { describe, expect, it } from "vitest";
import { finalizeUserVisibleAgreementPlainText } from "./agreementTemplatePlaceholderSafety";
import {
  substitutePaidProIntakeContactPlaceholders,
} from "./paidProIntakeContactSubstitution";
import {
  preserveFullLegalPartyNamesInOpeningAndSignatures,
} from "./paidProPartyNamePreserve";
import { applyPaidProRenderPolish, verifyIntakeEmailsPreserved } from "./paidProRenderPolish";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";

const IRONCLAD_JOINT_ROLLOUT_INTAKE = `Need an agreement between Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, Silver Mesa Analytics LP, and VertexGrid Technologies LLC for a joint AI software and infrastructure rollout project.

Main people involved:

* Ethan Cole — CEO at Ironclad — ethan.cole@ironcladsg.com
* Maya Bennett — CTO at Harborline — maya.bennett@harborlinedata.com
* Lucas Reed — Managing Partner at Northwind — lucas.reed@northwindap.io
* Olivia Hart — Ops Director at Silver Mesa — olivia.hart@silvermesaanalytics.com
* Adrian Vale — President at VertexGrid — adrian.vale@vertexgridtech.com`;

const IRONCLAD_PARTIES = [
  "Ironclad Systems Group LLC",
  "Harborline Data Solutions Inc.",
  "Northwind Automation Partners LLC",
  "Silver Mesa Analytics LP",
  "VertexGrid Technologies LLC",
] as const;

const IRONCLAD_EMAILS = [
  "ethan.cole@ironcladsg.com",
  "maya.bennett@harborlinedata.com",
  "lucas.reed@northwindap.io",
  "olivia.hart@silvermesaanalytics.com",
  "adrian.vale@vertexgridtech.com",
] as const;

function padOperative(core: string, targetLen = 26_000): string {
  const pad = "\n\nThe parties agree to cooperate in good faith on commercial terms. ".repeat(400);
  let t = core;
  while (t.length < targetLen) t += pad;
  return t;
}

describe("applyPaidProRenderPolish", () => {
  it("preserves exact intake emails and never injects legal entity text into domains", () => {
    const contacts = IRONCLAD_PARTIES.map((p, i) => `${p}\nEmail: [EMAIL_${i + 1}]`).join("\n\n");
    const body = padOperative(
      [
        "CONFIDENTIALITY AND COMMERCIAL PROTECTIONS AGREEMENT",
        "entered into by and among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid.",
        "KEY CONTACTS",
        contacts,
        "IN WITNESS WHEREOF:",
        "Ironclad\nBy: _________________________",
        "Harborline\nBy: _________________________",
        "Northwind\nBy: _________________________",
        "Silver Mesa\nBy: _________________________",
        "VertexGrid\nBy: _________________________",
      ].join("\n"),
      25_000,
    );

    const polished = applyPaidProRenderPolish(body, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "test",
    });

    expect(polished.contactSub.replacedEmailCount).toBe(5);
    expect(polished.emailGuard.mutatedEmailCount).toBe(0);

    for (const email of IRONCLAD_EMAILS) {
      expect(polished.text).toContain(email);
    }
    expect(polished.text).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
    expect(polished.text).not.toMatch(/@Ironclad Systems Group LLC/i);
    expect(polished.text).not.toMatch(/@Harborline Data Solutions Inc\./i);
  });

  it("opening recital in first 1,000 chars uses full legal party names", () => {
    /**
     * Five-party fixture is outside the 2–4 party release scope. Recital polish must
     * expand shorts to full legal names. It must not stamp two-party Client/SP roles
     * onto an unlabeled multiparty opening.
     */
    const body = padOperative(
      "entered into by and among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid.\nKEY CONTACTS\n[EMAIL_1]\n",
      20_000,
    );
    const { text } = applyPaidProRenderPolish(body, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "test",
    });
    const opening = text.slice(0, 1200);
    for (const party of IRONCLAD_PARTIES) {
      expect(opening).toContain(party);
    }
    expect(opening).toMatch(/Ironclad Systems Group LLC\s*\(/);
    expect(opening).not.toMatch(/Ironclad Systems Group LLC\s*\(\s*["'“](?:Client|Service Provider)["'”]\s*\)/i);
    expect(opening).not.toMatch(/among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid/i);
  });

  it("strips manual signature grids; full legal names stay in KEY CONTACTS not witness tail", () => {
    const body = padOperative(
      [
        `AGREEMENT among ${IRONCLAD_PARTIES.join(", ")}.`,
        "KEY CONTACTS",
        IRONCLAD_PARTIES.map((p, i) => `${p}\nEmail: [EMAIL_${i + 1}]`).join("\n\n"),
        "IN WITNESS WHEREOF:",
        "Ironclad\nBy: _________________________",
        "Harborline\nBy: _________________________",
        "Northwind\nBy: _________________________",
        "Silver Mesa\nBy: _________________________",
        "VertexGrid\nBy: _________________________",
      ].join("\n"),
      22_000,
    );
    const { text } = applyPaidProRenderPolish(body, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "test",
    });
    const contacts = text.slice(text.indexOf("KEY CONTACTS"), text.search(/IN WITNESS WHEREOF/i));
    for (const party of IRONCLAD_PARTIES) {
      expect(contacts).toContain(party);
    }
    const sig = text.slice(text.search(/IN WITNESS WHEREOF/i));
    expect(sig).toMatch(/LawDog signing workflow/i);
    expect(sig).not.toMatch(/\nIronclad\nBy:/);
    expect(sig).not.toMatch(/\nVertexGrid\nBy:/);
    expect(sig).not.toContain("Signatory 1");
  });

  it("party expansion after email substitution does not corrupt domains (regression)", () => {
    const body = padOperative(
      [
        "entered into by and among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid.",
        "KEY CONTACTS",
        IRONCLAD_PARTIES.map((p, i) => `${p}\nEmail: [EMAIL_${i + 1}]`).join("\n\n"),
      ].join("\n"),
      18_000,
    );
    const sub = substitutePaidProIntakeContactPlaceholders(body, IRONCLAD_JOINT_ROLLOUT_INTAKE, {
      surface: "test",
    });
    const expanded = preserveFullLegalPartyNamesInOpeningAndSignatures(
      sub.text,
      [...IRONCLAD_PARTIES],
      IRONCLAD_JOINT_ROLLOUT_INTAKE,
    );
    for (const email of IRONCLAD_EMAILS) {
      expect(expanded).toContain(email);
    }
    expect(verifyIntakeEmailsPreserved(IRONCLAD_JOINT_ROLLOUT_INTAKE, expanded).mutatedEmailCount).toBe(0);
  });

  it("keeps the approved notice clause through normal applyPaidProRenderPolish", () => {
    const oak = "Oak Street Holdings LLC";
    const pine = "Pine Creek Manufacturing Inc.";
    const recordedInput = [
      `This Agreement is between ${oak} ("Client") and ${pine} ("Supplier").`,
      "Send notices to legal@new-company.com within five days.",
      "Supplier shall ship conforming goods FOB Wilmington.",
      "If to Supplier: purchasing@pine-creek.example.",
    ].join("\n");
    const intake = [
      `Delaware supply agreement between ${oak} and ${pine}.`,
      "Notices: legal@old-company.com",
      "purchasing@pine-creek.example",
    ].join("\n");
    const authorityParties: PaidProSignerMetadataParty[] = [
      {
        partyIndex: 0,
        partyLegalName: oak,
        signerEmail: "legal@new-company.com",
        signerName: "Avery Oak",
        signerTitle: "Manager",
        partyAddress: "",
      },
      {
        partyIndex: 1,
        partyLegalName: pine,
        signerEmail: "purchasing@pine-creek.example",
        signerName: "Casey Pine",
        signerTitle: "President",
        partyAddress: "",
      },
    ];
    const polishOpts = {
      surface: "notice_clause_polish",
      skipCache: true as const,
      authorityParties,
    };
    expect("skipNoticeRepair" in polishOpts).toBe(false);

    const first = applyPaidProRenderPolish(recordedInput, intake, [oak, pine], polishOpts);
    const second = applyPaidProRenderPolish(first.text, intake, [oak, pine], polishOpts);

    const expectedNotice = "Send notices to legal@new-company.com within five days.";
    const expectedAdjacent = "Supplier shall ship conforming goods FOB Wilmington.";
    const expectedPineNotice = "If to Supplier: purchasing@pine-creek.example.";
    expect(first.text).toContain(expectedNotice);
    expect(first.text).toContain(expectedAdjacent);
    expect(first.text).toContain(expectedPineNotice);
    expect(first.text).toContain("legal@new-company.com");
    expect(first.text).toMatch(/within five days/i);
    expect(first.text).not.toContain("legal@old-company.com");
    expect(first.text.match(/Send notices to legal@new-company\.com within five days\./g)?.length).toBe(1);
    expect(first.text).not.toMatch(/If to Oak Street Holdings LLC[\s\S]{0,80}legal@old-company\.com/i);
    expect(second.text).toBe(first.text);
  });

  it("keeps each following operative clause through normal applyPaidProRenderPolish", () => {
    const oak = "Oak Street Holdings LLC";
    const pine = "Pine Creek Manufacturing Inc.";
    const opening = `This Agreement is between ${oak} ("Client") and ${pine} ("Supplier").`;
    const intake = `Delaware supply agreement between ${oak} and ${pine}.`;
    const clauses = [
      "Client shall pay $5,000 upon delivery.",
      "Supplier shall ship conforming goods FOB Wilmington.",
      "All deliverables remain owned by Client.",
      "Either party may terminate on thirty days written notice.",
    ] as const;
    const authorityParties: PaidProSignerMetadataParty[] = [
      {
        partyIndex: 0,
        partyLegalName: oak,
        signerEmail: "legal@new-company.com",
        signerName: "Avery Hale",
        signerTitle: "Manager",
        partyAddress: "",
      },
      {
        partyIndex: 1,
        partyLegalName: pine,
        signerEmail: "purchasing@pine-creek.example",
        signerName: "Casey Quinn",
        signerTitle: "President",
        partyAddress: "",
      },
    ];
    const polishOpts = { surface: "recital_opening_boundary", skipCache: true as const, authorityParties };
    expect("skipNoticeRepair" in polishOpts).toBe(false);

    for (const clause of clauses) {
      const recordedInput = [opening, clause].join("\n");
      const first = applyPaidProRenderPolish(recordedInput, intake, [oak, pine], polishOpts);
      const second = applyPaidProRenderPolish(first.text, intake, [oak, pine], polishOpts);
      expect(first.text).toContain(clause);
      expect(first.text.split(clause).length - 1).toBe(1);
      expect(second.text).toBe(first.text);
    }

    const longer = [
      opening,
      clauses[0],
      "",
      "1. Scope",
      "Manufacturing will occur in Delaware under U.S. law.",
      "",
      "2. Fees",
      "Invoices are due net thirty days.",
    ].join("\n");
    const longerOut = applyPaidProRenderPolish(longer, intake, [oak, pine], polishOpts);
    expect(longerOut.text).toContain(clauses[0]);
    expect(longerOut.text.split(clauses[0]).length - 1).toBe(1);
    expect(longerOut.text).toMatch(/1\.\s*Scope/i);
    expect(longerOut.text).toMatch(/Manufacturing will occur in Delaware/i);
    expect(longerOut.text).toMatch(/Invoices are due net thirty days/i);
    const longerAgain = applyPaidProRenderPolish(longerOut.text, intake, [oak, pine], polishOpts);
    expect(longerAgain.text).toBe(longerOut.text);

    const threeOpening =
      'This Agreement is among Stonebridge Wellness LLC ("Licensor"), NovaPath Learning Inc. ("Platform"), and ClearSpring Distribution LLC ("Distributor").';
    const threeNames = [
      "Stonebridge Wellness LLC",
      "NovaPath Learning Inc.",
      "ClearSpring Distribution LLC",
    ];
    const three = applyPaidProRenderPolish(
      `${threeOpening}\n${clauses[2]}`,
      "Oklahoma license among Stonebridge Wellness LLC, NovaPath Learning Inc., and ClearSpring Distribution LLC.",
      threeNames,
      { surface: "recital_opening_boundary_three", skipCache: true },
    );
    expect(three.text).toContain("Stonebridge Wellness LLC");
    expect(three.text).toContain("ClearSpring Distribution LLC");
    expect(three.text).toContain(clauses[2]);
    expect(three.text.split(clauses[2]).length - 1).toBe(1);
    expect(three.text).not.toMatch(/This Agreement is between Oak Street/i);
  });

  it("keeps confirmed representatives and postal addresses through normal applyPaidProRenderPolish", () => {
    const oak = "Oak Street Holdings LLC";
    const pine = "Pine Creek Manufacturing Inc.";
    const oakAddr = "1 Oak Street, Wilmington, DE 19801";
    const pineAddr = "9 Pine Creek Rd, Wilmington, DE 19802";
    const recordedInput = [
      `This Agreement is between ${oak}, a Delaware limited liability company ("Client"), with a principal place of business at ${oakAddr},`,
      `and ${pine}, a Delaware corporation ("Supplier"), with a principal place of business at ${pineAddr}`,
      `(each a "Party" and collectively the "Parties").`,
      "Client representative: Avery Oak.",
      "Supplier representative: Casey Pine.",
      "Oak Street shall provide access credentials.",
    ].join("\n");
    const intake = `Delaware supply agreement between ${oak} and ${pine}.`;
    const polishOpts = {
      surface: "contact_name_address_preservation",
      skipCache: true as const,
      authorityParties: [
        {
          partyIndex: 0,
          partyLegalName: oak,
          signerEmail: "legal@new-company.com",
          signerName: "Avery Oak",
          signerTitle: "Manager",
          partyAddress: oakAddr,
        },
        {
          partyIndex: 1,
          partyLegalName: pine,
          signerEmail: "purchasing@pine-creek.example",
          signerName: "Casey Pine",
          signerTitle: "President",
          partyAddress: pineAddr,
        },
      ] satisfies PaidProSignerMetadataParty[],
    };
    expect("skipNoticeRepair" in polishOpts).toBe(false);
    const first = applyPaidProRenderPolish(recordedInput, intake, [oak, pine], polishOpts);
    const second = applyPaidProRenderPolish(first.text, intake, [oak, pine], polishOpts);
    expect(first.text).toContain("Client representative: Avery Oak.");
    expect(first.text).not.toContain("Avery Oak Street");
    expect(first.text).toContain("Supplier representative: Casey Pine.");
    expect(first.text).not.toContain("Casey Pine Creek");
    expect(first.text).toContain(oakAddr);
    expect(first.text.split(oakAddr).length - 1).toBeGreaterThanOrEqual(1);
    expect(first.text).not.toContain("1 Client");
    expect(first.text).toContain(pineAddr);
    expect(first.text).not.toContain("9 Service Provider");
    expect(first.text).toMatch(/Client shall provide access credentials/);
    expect(second.text).toBe(first.text);
  });

  it("preserves three- and four-party confirmed roles through normal applyPaidProRenderPolish", () => {
    const stone = "Stonebridge Wellness LLC";
    const nova = "NovaPath Learning Inc.";
    const clear = "ClearSpring Distribution LLC";
    const threeInput = [
      `This Agreement is among ${stone} ("Licensor"), ${nova} ("Platform"), and ${clear} ("Distributor").`,
      "Licensor shall grant a nonexclusive license to the Platform.",
      "Distributor shall pay $1,000 upon delivery.",
      `If to ${stone}: notices@stonebridge.example`,
      "IN WITNESS WHEREOF, the parties have executed this Agreement.",
      `${stone} ("Licensor")`,
      "By: _________________________",
      `${clear} ("Distributor")`,
      "By: _________________________",
    ].join("\n");
    const threeIntake = `Oklahoma license among ${stone}, ${nova}, and ${clear}.`;
    const threeOpts = {
      surface: "multiparty_role_preservation_three",
      skipCache: true as const,
      authorityParties: [
        { partyIndex: 0, partyLegalName: stone, signerEmail: "a@stone.example", signerName: "Jordan Stonebridge", signerTitle: "Manager", partyAddress: "", roleLabel: "Licensor" },
        { partyIndex: 1, partyLegalName: nova, signerEmail: "b@nova.example", signerName: "Sam NovaPath", signerTitle: "CPO", partyAddress: "", roleLabel: "Platform" },
        { partyIndex: 2, partyLegalName: clear, signerEmail: "c@clear.example", signerName: "Lee ClearSpring", signerTitle: "President", partyAddress: "", roleLabel: "Distributor" },
      ] satisfies PaidProSignerMetadataParty[],
    };
    expect("skipNoticeRepair" in threeOpts).toBe(false);
    const threeFirst = applyPaidProRenderPolish(threeInput, threeIntake, [stone, nova, clear], threeOpts);
    const threeSecond = applyPaidProRenderPolish(threeFirst.text, threeIntake, [stone, nova, clear], threeOpts);
    expect(threeFirst.text).toContain(`${stone} ("Licensor")`);
    expect(threeFirst.text).toContain(`${nova} ("Platform")`);
    expect(threeFirst.text).toContain(`${clear} ("Distributor")`);
    expect(threeFirst.text).toContain("Licensor shall grant a nonexclusive license to the Platform.");
    expect(threeFirst.text).toContain("Distributor shall pay $1,000 upon delivery.");
    expect(threeFirst.text).toContain(`If to ${stone}: notices@stonebridge.example`);
    expect(threeFirst.text).toMatch(/IN WITNESS WHEREOF[\s\S]*Stonebridge Wellness LLC[\s\S]*By:/i);
    expect(threeFirst.text).toMatch(/IN WITNESS WHEREOF[\s\S]*ClearSpring Distribution LLC[\s\S]*By:/i);
    expect(threeFirst.text).not.toContain(`${stone} ("Client")`);
    expect(threeSecond.text).toBe(threeFirst.text);

    const shuffledAuthority = applyPaidProRenderPolish(threeInput, threeIntake, [stone, nova, clear], {
      surface: "multiparty_role_preservation_three_reorder",
      skipCache: true,
      authorityParties: [
        { partyIndex: 2, partyLegalName: clear, signerEmail: "c@clear.example", signerName: "Lee ClearSpring", signerTitle: "President", partyAddress: "", roleLabel: "Distributor" },
        { partyIndex: 0, partyLegalName: stone, signerEmail: "a@stone.example", signerName: "Jordan Stonebridge", signerTitle: "Manager", partyAddress: "", roleLabel: "Licensor" },
        { partyIndex: 1, partyLegalName: nova, signerEmail: "b@nova.example", signerName: "Sam NovaPath", signerTitle: "CPO", partyAddress: "", roleLabel: "Platform" },
      ] satisfies PaidProSignerMetadataParty[],
    });
    expect(shuffledAuthority.text).toContain(`${stone} ("Licensor")`);
    expect(shuffledAuthority.text).toContain(`${nova} ("Platform")`);
    expect(shuffledAuthority.text).toContain(`${clear} ("Distributor")`);
    expect(shuffledAuthority.text).toContain("Licensor shall grant a nonexclusive license to the Platform.");

    const explicitClientSp = applyPaidProRenderPolish(
      [
        `This Agreement is among ${stone} ("Client"), ${nova} ("Service Provider"), and ${clear} ("Distributor").`,
        "Client shall pay the Service Provider.",
      ].join("\n"),
      threeIntake,
      [stone, nova, clear],
      {
        surface: "multiparty_role_preservation_three_client_sp",
        skipCache: true,
        authorityParties: [
          { partyIndex: 0, partyLegalName: stone, signerEmail: "a@stone.example", signerName: "Jordan Stonebridge", signerTitle: "Manager", partyAddress: "", roleLabel: "Client" },
          { partyIndex: 1, partyLegalName: nova, signerEmail: "b@nova.example", signerName: "Sam NovaPath", signerTitle: "CPO", partyAddress: "", roleLabel: "Service Provider" },
          { partyIndex: 2, partyLegalName: clear, signerEmail: "c@clear.example", signerName: "Lee ClearSpring", signerTitle: "President", partyAddress: "", roleLabel: "Distributor" },
        ] satisfies PaidProSignerMetadataParty[],
      },
    );
    expect(explicitClientSp.text).toContain(`${stone} ("Client")`);
    expect(explicitClientSp.text).toContain(`${nova} ("Service Provider")`);
    expect(explicitClientSp.text).toContain(`${clear} ("Distributor")`);
    expect(explicitClientSp.text).toContain("Client shall pay the Service Provider.");

    const oak = "Oak Street Holdings LLC";
    const pine = "Pine Creek Manufacturing Inc.";
    const two = applyPaidProRenderPolish(
      `This Agreement is between ${oak} ("Client") and ${pine} ("Service Provider").\nClient shall pay $5,000 upon delivery.`,
      `Delaware supply agreement between ${oak} and ${pine}.`,
      [oak, pine],
      { surface: "multiparty_role_preservation_two", skipCache: true },
    );
    expect(two.text).toContain(`${oak} ("Client")`);
    expect(two.text).toMatch(/Pine Creek Manufacturing Inc\.?\s*\(["']Service Provider["']\)/);
    expect(two.text).toContain("Client shall pay $5,000 upon delivery.");

    const iron = "Ironclad Systems Group LLC";
    const harbor = "Harborline Data Solutions Inc.";
    const north = "Northwind Automation Partners LLC";
    const silver = "Silver Mesa Analytics LP";
    const fourInput = [
      `This Agreement is among ${iron} ("Sponsor"), ${harbor} ("Vendor"), ${north} ("Integrator"), and ${silver} ("Analyst").`,
      "Sponsor shall fund the rollout.",
      `If to ${harbor}: maya.bennett@harborlinedata.com`,
      "IN WITNESS WHEREOF, the parties have executed this Agreement.",
      `${iron} ("Sponsor")`,
      "By: _________________________",
      `${silver} ("Analyst")`,
      "By: _________________________",
    ].join("\n");
    const fourOpts = { surface: "multiparty_role_preservation_four", skipCache: true as const };
    const four = applyPaidProRenderPolish(
      fourInput,
      `Joint rollout among ${iron}, ${harbor}, ${north}, and ${silver}.`,
      [iron, harbor, north, silver],
      fourOpts,
    );
    const fourAgain = applyPaidProRenderPolish(
      four.text,
      `Joint rollout among ${iron}, ${harbor}, ${north}, and ${silver}.`,
      [iron, harbor, north, silver],
      fourOpts,
    );
    expect(four.text).toContain(`${iron} ("Sponsor")`);
    expect(four.text).toContain(`${harbor} ("Vendor")`);
    expect(four.text).toContain(`${north} ("Integrator")`);
    expect(four.text).toContain(`${silver} ("Analyst")`);
    expect(four.text).toContain("Sponsor shall fund the rollout.");
    expect(four.text).toContain("maya.bennett@harborlinedata.com");
    expect(four.text).toMatch(/If to Harborline Data Solutions Inc\./);
    expect(four.text).toMatch(/IN WITNESS WHEREOF[\s\S]*Ironclad Systems Group LLC[\s\S]*By:/i);
    expect(four.text).toMatch(/IN WITNESS WHEREOF[\s\S]*Silver Mesa Analytics LP[\s\S]*By:/i);
    expect(four.text).not.toContain(`${iron} ("Client")`);
    expect(fourAgain.text).toBe(four.text);
  });

  it("finalize keeps operative payment placeholders fatal and substitutes contact emails", () => {
    const body = padOperative(
      [
        "AGREEMENT among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid.",
        "2. PAYMENT\nFees: [INSERT PAYMENT TERMS HERE].\n",
        "KEY CONTACTS\n[EMAIL_1]\n[EMAIL_2]\n[EMAIL_3]\n[EMAIL_4]\n[EMAIL_5]",
      ].join("\n"),
      20_000,
    );
    const fin = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      partyNames: [...IRONCLAD_PARTIES],
      surface: "test",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remainingFatal.some((t) => /PAYMENT/i.test(t))).toBe(true);
    for (const email of IRONCLAD_EMAILS) {
      expect(fin.text).toContain(email);
    }
  });
});
