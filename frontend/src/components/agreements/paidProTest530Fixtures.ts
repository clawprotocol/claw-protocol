import {
  TEST518_BLUE_HARBOR,
  TEST518_BLUE_HARBOR_ADDRESS,
  TEST518_IRON_GATE,
  TEST518_IRON_GATE_ADDRESS,
  TEST518_REDWOOD,
  TEST518_REDWOOD_ADDRESS,
  TEST518_SUMMIT,
  TEST518_SUMMIT_ADDRESS,
  test518Draft,
} from "./paidProTest518Fixtures";
import { TEST519_COLON_ROLE_DASHBOARD_CREATE_INTAKE } from "./paidProTest519Fixtures";

export {
  TEST518_REDWOOD as TEST530_REDWOOD,
  TEST518_SUMMIT as TEST530_SUMMIT,
  TEST518_BLUE_HARBOR as TEST530_BLUE_HARBOR,
  TEST518_IRON_GATE as TEST530_IRON_GATE,
};

export const TEST530_PRODUCTION_QUAD_PARTY_INTAKE = TEST519_COLON_ROLE_DASHBOARD_CREATE_INTAKE;

export const TEST530_PARTY_ADDRESSES = [
  TEST518_REDWOOD_ADDRESS,
  TEST518_SUMMIT_ADDRESS,
  TEST518_BLUE_HARBOR_ADDRESS,
  TEST518_IRON_GATE_ADDRESS,
] as const;

export function test530Draft() {
  return test518Draft();
}

/**
 * Simulates TEST530 post-freeze notice corruption: duplicated NOTICES headings, shifted
 * party/address mapping, stale Scope Inc. stanza, and missing Redwood.
 */
export function buildTest530MalformedNoticeSectionBody(): string {
  return [
    "CONSULTING SERVICES AGREEMENT",
    "",
    `This Agreement is entered into among ${TEST518_REDWOOD} ("Client"), ${TEST518_SUMMIT} ("Lead Provider"), ${TEST518_BLUE_HARBOR} ("Implementation Partner"), and ${TEST518_IRON_GATE} ("Cybersecurity Auditor").`,
    "",
    "1. Scope of Services",
    "Each party shall perform its assigned role as described in the intake.",
    "",
    "2. Payment",
    "Total fee of $450,000 payable in milestone installments.",
    "",
    "3. Term",
    "The term is eighteen (18) months.",
    "",
    "4. Confidentiality",
    "Each party shall maintain confidentiality of non-public information.",
    "",
    "5. Governing Law",
    "This Agreement is governed by the laws of the State of Delaware.",
    "",
    "11. NOTICES",
    "Notices under this Agreement must be in writing and delivered as set forth below.",
    "",
    "NOTICES",
    "Notices under this Agreement must be in writing and delivered as set forth below.",
    "",
    `If to ${TEST518_SUMMIT}:`,
    TEST518_SUMMIT,
    "Address:",
    TEST518_REDWOOD_ADDRESS,
    "",
    `If to ${TEST518_BLUE_HARBOR}:`,
    TEST518_BLUE_HARBOR,
    "Address:",
    TEST518_SUMMIT_ADDRESS,
    "",
    `If to ${TEST518_IRON_GATE}:`,
    TEST518_IRON_GATE,
    "Address:",
    TEST518_BLUE_HARBOR_ADDRESS,
    "",
    "If to Scope Inc.:",
    "Scope Inc.",
    "Address:",
    TEST518_IRON_GATE_ADDRESS,
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    TEST518_SUMMIT,
    "By: _____________________________",
    "Name:",
    "Title:",
    "Date: _____________________________",
    "",
    TEST518_BLUE_HARBOR,
    "By: _____________________________",
    "Name:",
    "Title:",
    "Date: _____________________________",
    "",
    TEST518_IRON_GATE,
    "By: _____________________________",
    "Name:",
    "Title:",
    "Date: _____________________________",
  ].join("\n");
}
