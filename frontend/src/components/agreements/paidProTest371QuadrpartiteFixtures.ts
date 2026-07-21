/** Shared TEST371 quadrpartite labeled-party intake — not a Vitest module (safe to import from other tests). */

export const TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE = `Create a QUADRIPARTITE SOFTWARE PLATFORM DEVELOPMENT, ANALYTICS, IMPLEMENTATION, AND REVENUE SHARING AGREEMENT.

Party 1
Legal Entity: Pioneer Freight Solutions LLC
Signer Name: Jennifer Lawson
Signer Title: President
Signer Email: jlawson@pioneerfreight.com

Party 2
Legal Entity: Summit Ridge Technologies LLC
Signer Name: Unknown
Signer Title: Unknown
Signer Email: legal@summitridgetech.com
Address: 4200 Legacy Drive, Plano, TX 75024

Party 3
Legal Entity: North Star Data Analytics LLC
Signer Name: Michael Carter
Signer Title: Director of Analytics
Signer Email: michael@northstaranalytics.com

Party 4
Legal Entity: Iron Vale Implementation Partners LLC
Signer Name: Rebecca Stone
Signer Title: Managing Partner
Signer Email: rstone@ironvalepartners.com
Address: 1800 Commerce Street, Dallas, TX

Coordinator
Name: Alex Morgan
Email: alex.morgan@coordinator.test
Role: coordinating this agreement, not signing as a party

Purpose: Development and maintenance of a custom software platform with analytics dashboard and implementation support.

Term: thirty-six (36) months.

Payment: $185,000 in milestone payments; monthly analytics and implementation fees as specified.

Revenue sharing: licensing revenue will be shared among the parties as set forth in Exhibit A.

Each party will keep confidential information received from the other parties confidential.

Texas law governs. Electronic execution via LawDog.`;

export const TEST371_EXPECTED_PARTIES = [
  "Pioneer Freight Solutions LLC",
  "Summit Ridge Technologies LLC",
  "North Star Data Analytics LLC",
  "Iron Vale Implementation Partners LLC",
] as const;
