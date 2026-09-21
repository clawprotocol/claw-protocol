import { CORE_PAID_JOURNEY_EXPECTED_FACTS as FACTS, CORE_PAID_JOURNEY_REPETITIVE_FILLER_PHRASE } from "./corePaidJourneyAcceptanceMatrix";

export function consultingPositiveSnippet(): string {
  const harbor = FACTS.parties[0].name;
  const ironvale = FACTS.parties[1].name;
  return [
    "CONSULTING SERVICES AGREEMENT",
    `This Consulting Services Agreement (the "Agreement") is entered into as of October 1, 2026 by and between ${harbor} ("Consultant") and ${ironvale} ("Client").`,
    "1. PARTIES AND ROLES. Consultant is an independent professional services firm. Client is retaining Consultant to perform the services described in this Agreement. Consultant's authorized signer is Maya Chen. Client's authorized signer is Jordan Hale.",
    "2. SCOPE OF SERVICES. Consultant shall perform AI workflow implementation for Client, including discovery, implementation planning, configuration, and knowledge transfer.",
    "3. FEES AND PAYMENT. Client shall pay a fixed fee of $48,000 for the services. Invoices are due net thirty (30) days.",
    "4. TERM AND DURATION. The initial term is twelve months beginning October 1, 2026.",
    "5. OBLIGATIONS. Consultant shall perform the services in a professional manner. Client shall provide timely access to systems.",
    "6. INTELLECTUAL PROPERTY. Consultant retains ownership of pre-existing tools. Client owns deliverables after payment.",
    "9. GOVERNING LAW. This Agreement is governed by the laws of the State of Delaware.",
    `Consultant: ${harbor}   By: Maya Chen   Title: Principal`,
    `Client: ${ironvale}   By: Jordan Hale   Title: Operations Lead`,
  ].join("\n\n");
}

export function consultingCorpusPaddedSnippet(): string {
  return `${consultingPositiveSnippet()}\n\n${`${CORE_PAID_JOURNEY_REPETITIVE_FILLER_PHRASE} `.repeat(220)}`;
}
