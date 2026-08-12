/**
 * General N-party Paid Pro server corpus builder for tests and deterministic recovery previews.
 * Not fixture-specific — parameterized by party list and intake metadata.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  parseLabeledPartyBlocks,
  multiPartyExecutionBlockHeading,
  type LabeledPartyBlock,
} from "./labeledPartyBlockParse";
import { applyPaidProCanonicalDocumentStructureAuthority } from "./paidProCanonicalDocumentStructureAuthority";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { PAID_PRO_AUTHORITY_MAX_PARTIES } from "./paidProAuthorityLimits";
import { PAID_PRO_RECOVERY_MIN_DISPLAY_LEN } from "./paidProPostCheckoutRenderGate";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { expandOperativeCorpusWithUniqueSupplements } from "./paidProSupplementalProvisionsFillerGate";

function oxfordPartyList(parties: readonly string[]): string {
  if (parties.length <= 1) return parties[0] ?? "";
  if (parties.length === 2) return `${parties[0]} and ${parties[1]}`;
  return `${parties.slice(0, -1).join(", ")}, and ${parties[parties.length - 1]}`;
}

function buildNoticeStanzas(
  parties: readonly string[],
  labeled: readonly LabeledPartyBlock[],
): string[] {
  return parties.map((party, index) => {
    const block = labeled.find((b) => b.legalEntity === party) ?? labeled[index];
    const email = (block?.signerEmail || "").trim() || "provided during signer setup";
    const address =
      (block?.address || "").trim() || "provided during signer setup";
    const attn = block?.signerName
      ? `${block.signerName}${block.signerTitle ? `, ${block.signerTitle}` : ""}`
      : "Authorized Signer";
    return [
      `If to ${party}:`,
      party,
      `Attn: ${attn}`,
      `Email: ${email}`,
      `Address: ${address}`,
    ].join("\n");
  });
}

function buildSignatureBlocks(
  parties: readonly string[],
  labeled: readonly LabeledPartyBlock[],
  rawIntake: string,
): string[] {
  // 3+ party recovery corpora use entity-name headings (canonical multiparty shape).
  // CLIENT/SERVICE PROVIDER role headings are only for classic 2-party execution tails.
  const useEntityHeadings = parties.length >= 3;
  return parties.map((party, index) => {
    const block = labeled.find((b) => b.legalEntity === party) ?? labeled[index];
    const heading = useEntityHeadings
      ? party.trim().toUpperCase()
      : multiPartyExecutionBlockHeading(index, rawIntake);
    if (useEntityHeadings) {
      return [
        `${heading}:`,
        "By: ______________________________",
        `Name: ${block?.signerName || "______________________________"}`,
        `Title: ${block?.signerTitle || "______________________________"}`,
        `Email: ${block?.signerEmail || "______________________________"}`,
        "Date: ______________________________",
      ].join("\n");
    }
    return [
      `${heading}:`,
      party,
      "By: ______________________________",
      `Name: ${block?.signerName || "______________________________"}`,
      `Title: ${block?.signerTitle || "______________________________"}`,
      `Email: ${block?.signerEmail || "______________________________"}`,
      "Date: ______________________________",
    ].join("\n");
  });
}

export function buildNPartyPaidProServerCorpus(args: {
  parties: readonly string[];
  intakeText: string;
  draft?: ParsedDraftShape | null;
  title?: string;
  minLen?: number;
}): string {
  const parties = args.parties
    .map((p) => p.trim())
    .filter((p) => isAuthoritativeLegalEntityName(p))
    .slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES);
  if (parties.length < 2) return "";
  const intake = args.intakeText.trim();
  const labeled = parseLabeledPartyBlocks(intake);
  const title = (args.title || args.draft?.title || "Multi-Party Services Agreement").trim();
  const purpose =
    (args.draft?.purpose || "").trim() ||
    "professional services, implementation support, and related deliverables described in the intake.";
  const payment =
    (args.draft?.payment_terms || "").trim() ||
    "Fees and milestone payments as stated in the intake and any written order forms the Parties execute.";
  const term = (args.draft?.duration || "").trim() || "twelve (12) months";
  const law =
    (args.draft?.jurisdiction || "").trim() ||
    (/delaware/i.test(intake) ? "Delaware" : /texas/i.test(intake) ? "Texas" : "the State designated in the intake");

  const blocks = [
    title.toUpperCase(),
    "",
    `This ${title} (this "Agreement") is entered into by and among ${oxfordPartyList(parties)} (each a "Party" and collectively the "Parties").`,
    "",
    "1. SERVICES AND SCOPE",
    `Each Party may provide ${purpose}`,
    "",
    "2. TERM AND TERMINATION",
    `The initial term is ${term}, unless extended or terminated as provided herein.`,
    "",
    "3. PAYMENT AND CONSIDERATION",
    payment,
    "",
    "4. CONFIDENTIALITY",
    "Each Party will protect confidential information received from the other Parties and use it only to perform under this Agreement.",
    "",
    "5. INTELLECTUAL PROPERTY",
    "Each Party retains its pre-existing intellectual property. Work product ownership is as stated in the intake or a signed statement of work.",
    "",
    "6. LIMITATION OF LIABILITY",
    "Direct damages are limited to amounts paid under this Agreement in the twelve (12) months preceding the claim, except for breaches of confidentiality or willful misconduct.",
    "",
    "7. INDEPENDENT CONTRACTOR STATUS",
    "Each Party performs as an independent contractor. Nothing creates a partnership, joint venture, or employment relationship among the Parties.",
    "",
    "8. WARRANTIES AND COMPLIANCE",
    "Each Party represents it has authority to enter this Agreement and will comply with applicable law.",
    "",
    "9. DISPUTE RESOLUTION",
    "The Parties will attempt good-faith negotiation before pursuing formal dispute resolution under applicable law.",
    "",
    "10. NOTICES",
    "Notices under this Agreement must be in writing and may be delivered by email or mail to the addresses below.",
    "",
    ...buildNoticeStanzas(parties, labeled).flatMap((stanza) => ["", stanza]),
    "",
    "11. GOVERNING LAW",
    `This Agreement is governed by the laws of ${law}.`,
    "",
    "12. MISCELLANEOUS AND ELECTRONIC SIGNATURES",
    "This Agreement may be executed in counterparts using electronic signatures permitted by applicable law.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    ...buildSignatureBlocks(parties, labeled, intake),
  ];

  let body = blocks.join("\n\n").trim();

  const execution = enforcePaidProSingleExecutionBlock(body, {
    intakeText: intake,
    draftPartyNames: [...parties],
  });
  body = execution.text;

  const canonical = applyPaidProCanonicalDocumentStructureAuthority(body, {
    source: "paid_pro_n_party_corpus_builder",
    phase: "pre_freeze",
  });
  body = canonical.text;

  if (countPaidProExecutionBlocks(body) !== 1) {
    const retry = enforcePaidProSingleExecutionBlock(body, { intakeText: intake, draftPartyNames: [...parties] });
    body = retry.text;
  }

  const minLen = args.minLen ?? PAID_PRO_RECOVERY_MIN_DISPLAY_LEN;
  if (body.length < minLen) {
    body = expandOperativeCorpusWithUniqueSupplements(body, minLen);
  }

  return body.trim();
}
