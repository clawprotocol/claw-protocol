import { describe, expect, it } from "vitest";
import { repairMalformedPaidProAgreementRecital } from "./paidProAgreementRecitalRepair";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc";

const QA_MALFORMED_RECITAL =
  `This Mutual Consulting and Implementation Agreement ("Agreement") is This Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").execution by both parties.`;

const parties = [
  {
    partyIndex: 0,
    partyLegalName: BLUE,
    signerEmail: "anthemhayek@gmail.com",
    signerName: "Anthem H Blanchard",
    signerTitle: "Member",
    partyAddress: "1027 S. Rainbow Blvd., #124, Las Vegas, NV 89132",
  },
  {
    partyIndex: 1,
    partyLegalName: IRON,
    signerEmail: "irenev34@gmail.com",
    signerName: "Irene Vale",
    signerTitle: "CEO",
    partyAddress: "149 First St., Smithville, AR 75023",
  },
] as const;

describe("paidProAgreementRecitalRepair", () => {
  it("repairs exact QA malformed mutual consulting opener", () => {
    const { text, repairs } = repairMalformedPaidProAgreementRecital(QA_MALFORMED_RECITAL, parties);
    expect(repairs.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/is This Agreement is between/i);
    expect(text).not.toMatch(/\)\.execution/i);
    expect(text).not.toMatch(/\.execution by both parties/i);
    expect(text).toContain(
      'This Mutual Consulting and Implementation Agreement ("Agreement") is entered into as of the Effective Date by and between',
    );
    expect(text).toContain(`${BLUE} ("Client")`);
    expect(text).toContain(`${IRON} ("Service Provider")`);
    expect(text).toContain(
      'The "Effective Date" is the date on which the Agreement has been fully executed by both parties.',
    );
  });
});
