import {
  TEST490_CLEARSPRING,
  TEST490_NOVAPATH,
  TEST490_STONEBRIDGE,
  TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE,
} from "./paidProTest490Fixtures";

export const TEST494_SIGNERS = [
  {
    partyLegalName: TEST490_STONEBRIDGE,
    signerName: "Sandra Wells",
    signerTitle: "Managing Member",
    signerEmail: "cryptocurated21+s@gmail.com",
    partyAddress: "710 Meadow Birch Rd.\nNorman, OK 73069",
  },
  {
    partyLegalName: TEST490_NOVAPATH,
    signerName: "Caleb Price",
    signerTitle: "Chief Product Officer",
    signerEmail: "cryptocurated21+nova@gmail.com",
    partyAddress: "2841 Foundry Ave.\nRaleigh, NC 27601",
  },
  {
    partyLegalName: TEST490_CLEARSPRING,
    signerName: "Maya Coleman",
    signerTitle: "President",
    signerEmail: "cryptocurated21+cs@gmail.com",
    partyAddress: "903 Harbor Mill Dr.\nTampa, FL 33602",
  },
];

function noticeStanzasPlaceholder(): string {
  return TEST494_SIGNERS.map(
    (party) =>
      `If to ${party.partyLegalName}:\nAttention: Authorized Signer\nEmail: provided during signer setup.\nAddress: provided during signer setup.`,
  ).join("\n\n");
}

/** Server-style corpus with composite §10 and §10.4 Notices — no standalone misplaced NOTICES. */
export function buildTest494ThreePartySection10Corpus(): string {
  const stanzas = noticeStanzasPlaceholder();
  const body = [
    "TRIPARTITE INTELLECTUAL PROPERTY LICENSE AND ROYALTY AGREEMENT",
    "",
    `This Agreement is entered into among ${TEST490_STONEBRIDGE}, ${TEST490_NOVAPATH}, and ${TEST490_CLEARSPRING} (each a "Party").`,
    "",
    "1. LICENSE GRANT",
    "Stonebridge grants NovaPath a license to adapt and host the original wellness materials.",
    "",
    "2. REVENUE SHARING",
    "Subscription revenue is allocated 45% to Stonebridge, 35% to NovaPath, and 20% to ClearSpring.",
    "",
    "3. CONFIDENTIALITY",
    "Each Party shall protect confidential information received from the other Parties.",
    "",
    "4. WARRANTIES AND INDEMNIFICATION",
    "Each Party provides customary warranties and indemnification as set forth herein.",
    "",
    "5. LIMITATION OF LIABILITY",
    "Except for excluded claims, liability is limited to direct damages.",
    "",
    "6. TERMINATION",
    "Either Party may terminate for material breach after notice and cure.",
    "",
    "7. TRANSITION ASSISTANCE",
    "Upon termination, Parties will cooperate on orderly transition.",
    "",
    "8. ELECTRONIC SIGNATURES",
    "Electronic signatures are permitted under applicable law.",
    "",
    "9. GOVERNING LAW",
    "Oklahoma law governs this Agreement.",
    "",
    "10. Assignment, Dispute Resolution, Notices and Miscellaneous",
    "",
    "10.1 Assignment",
    "No Party may assign this Agreement without the prior written consent of the other Parties.",
    "",
    "10.2 Independent Contractors",
    "The Parties are independent contractors and not partners or joint venturers.",
    "",
    "10.3 Governing Law and Venue",
    "Disputes shall be resolved in Oklahoma courts of competent jurisdiction.",
    "",
    "10.4 Notices",
    "",
    stanzas,
    "",
    "10.5 Miscellaneous",
    "This Agreement constitutes the entire agreement among the Parties.",
    "",
    "IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.",
    "",
    "PARTY 1: STONEBRIDGE WELLNESS LLC",
    "",
    "PARTY 2: NOVAPATH LEARNING INC.",
    "",
    "PARTY 3: CLEARSPRING DISTRIBUTION LLC",
  ].join("\n");

  if (body.length >= 2800) return body;
  let pad = "";
  let i = 0;
  while (body.length + pad.length < 2800) {
    pad += `14.${i + 1} Supplemental provision ${i + 1}. The Parties will cooperate in good faith.\n\n`;
    i += 1;
  }
  const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
  const insertAt = witnessIdx >= 0 ? witnessIdx : body.length;
  return `${body.slice(0, insertAt)}${pad}${body.slice(insertAt)}`;
}

export function test494Draft() {
  return {
    title: "Tripartite IP License",
    jurisdiction: "Oklahoma",
    parties: TEST494_SIGNERS.map((party, i) => ({
      name: party.partyLegalName,
      role: i === 0 ? "Licensor" : i === 1 ? "Platform" : "Distributor",
    })),
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: false },
  };
}

export function excerptSection10NoticesRegion(text: string): string {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const start = normalized.search(/10\.\s+Assignment[\s\S]{0,80}Notices/i);
  if (start < 0) {
    const notices = normalized.search(/\b10\.4\s+Notices\b/i);
    return notices >= 0 ? normalized.slice(notices, notices + 480) : normalized.slice(0, 480);
  }
  return normalized.slice(start, start + 720);
}

export { TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE as TEST494_INTAKE };
