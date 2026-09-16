import { describe, expect, it } from "vitest";
import {
  displayCorpusDropsBoundCommercialFacts,
  preferBoundReviewRevisionOverDisplayCorpus,
  resolveRecipientVisibleReviewPlain,
} from "./preferBoundReviewRevisionCorpus";

const APPLIED = `
CONSULTING AGREEMENT

This Services Agreement (this "Agreement") is entered into by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client") and Alex Rivera ("Advisor"). Consultant, Client, and Advisor may be referred to individually as a "Party" and collectively as the "Parties".

1. PARTIES AND ROLES
Consultant is an independent professional services firm.

3. FEES AND PAYMENT
Client shall pay a fixed fee of $48,000 for the services.

10. GOVERNING LAW
This Agreement is governed by the laws of the State of Delaware, without regard to conflict-of-law rules

11. NOTICES
If to Harbor Peak Analytics LLC:
Harbor Peak Analytics LLC
If to Ironvale Manufacturing Inc.:
Ironvale Manufacturing Inc.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CONSULTANT:
Harbor Peak Analytics LLC
By: __________________________
Name: __________________________
Title: _________________________

CLIENT:
Ironvale Manufacturing Inc
By: __________________________
Name: __________________________
Title: _________________________

ADVISOR:
Alex Rivera
By: __________________________
Name: Alex Rivera
Title: ________
`.trim();

const GUIDED_SHRINK = `
CONSULTING AGREEMENT
This Agreement is between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc ("Client").

1. Purpose and Scope
Consultant shall perform AI workflow implementation for Client.

2. Fees and Payment
Client shall pay a fixed fee of $48,000 for the services.

6. NOTICES
If to Harbor Peak Analytics LLC:
Harbor Peak Analytics LLC
Attn: Pat Harbor

PARTY 3:
Alex Rivera
By: __________________________
Name: Alex Rivera
`.trim();

describe("preferBoundReviewRevisionOverDisplayCorpus", () => {
  it("keeps the applied snapshot when guided display drops Delaware and Advisor", () => {
    expect(displayCorpusDropsBoundCommercialFacts(APPLIED, GUIDED_SHRINK)).toBe(true);
    expect(
      preferBoundReviewRevisionOverDisplayCorpus({
        boundRevisionPlain: APPLIED,
        displayCorpus: GUIDED_SHRINK,
      }),
    ).toBe(APPLIED);
  });

  it("does not infer notice Attn from signer names on the visible bound paper", () => {
    const visible = resolveRecipientVisibleReviewPlain({
      boundRevisionPlain: APPLIED,
      displayCorpus: GUIDED_SHRINK,
      parties: [
        { name: "Harbor Peak Analytics LLC", signerName: "Pat Harbor" },
        { name: "Ironvale Manufacturing Inc", signerName: "Sam Ironvale" },
        { name: "Alex Rivera", signerName: "Alex Rivera" },
      ],
    });
    expect(visible).toContain("Delaware");
    expect(visible).toMatch(/\("Advisor"\)/);
    expect(visible).toContain("Name: Pat Harbor");
    expect(visible).toContain("Name: Sam Ironvale");
    expect(visible).not.toMatch(/If to Harbor Peak Analytics LLC:[\s\S]{0,160}Attn:\s*Pat Harbor/);
    expect(visible).not.toContain("PARTY 3:");
  });
});
