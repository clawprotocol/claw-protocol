import { describe, expect, it } from "vitest";
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from "../../launch/corePaidJourneyAcceptanceMatrix";
import { TEST487_PRODUCTION_INTAKE } from "./paidProTest487ProductionValidationFixtures";
import { TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE } from "./paidProTest490Fixtures";
import {
  closestEntityToCue,
  cueAssignedToExpectedEntity,
  partyReceiveAllocationsFromIntake,
  partyRevenueSharesFromIntake,
  preservePartyEconomicRelationshipsInPaymentSection,
} from "./paidProPartyEconomicRelationships";

const COLLAPSED_FOUR_PARTY_PAYMENT = [
  "PRECISION MEDICINE DATA PLATFORM AGREEMENT",
  "3. PAYMENT AND CONSIDERATION",
  "Milestone amounts are $250,000, $400,000, $350,000, $180,000, $220,000, $150,000, $175,000, $95,000, and $105,000.",
  "4. CONFIDENTIALITY",
  "Each Party will protect confidential information.",
].join("\n");

describe("paidProPartyEconomicRelationships", () => {
  it("extracts party-bound receive allocations and revenue shares from intake", () => {
    const allocations = partyReceiveAllocationsFromIntake(TEST487_PRODUCTION_INTAKE);
    expect(allocations.map((row) => row.entity)).toEqual([
      "Lumen Bioinformatics Inc.",
      "Thalassa Data Systems LLC",
      "Coastal Meridian Analytics LLC",
      "Vanguard Regulatory Sciences Ltd.",
    ]);
    expect(allocations[0]!.amounts).toEqual(["$250,000", "$400,000", "$350,000"]);
    expect(partyRevenueSharesFromIntake(TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE)).toEqual([
      { entity: "Stonebridge Wellness LLC", percent: "45" },
      { entity: "NovaPath Learning Inc.", percent: "35" },
      { entity: "ClearSpring Distribution LLC", percent: "20" },
    ]);
  });

  it("restores unbound listed amounts onto the payment section without inventing a payer", () => {
    const restored = preservePartyEconomicRelationshipsInPaymentSection(
      COLLAPSED_FOUR_PARTY_PAYMENT,
      TEST487_PRODUCTION_INTAKE,
    );
    expect(restored).toMatch(/Lumen Bioinformatics Inc\. receives \$250,000/);
    expect(restored).toMatch(/Thalassa Data Systems LLC receives \$180,000/);
    expect(restored).not.toMatch(/\b(?:pays?|shall pay|will pay|paying party)\b/i);
    expect(preservePartyEconomicRelationshipsInPaymentSection(restored, TEST487_PRODUCTION_INTAKE)).toBe(
      restored,
    );
  });

  it("leaves Harbor two-party paper unchanged", () => {
    const harbor = [
      "CONSULTING SERVICES AGREEMENT",
      "3. FEES AND PAYMENT",
      "Client shall pay a fixed fee of $48,000 for the services.",
      "4. TERM AND DURATION",
      "The initial term is twelve (12) months.",
    ].join("\n");
    expect(preservePartyEconomicRelationshipsInPaymentSection(harbor, CORE_PAID_JOURNEY_FILLED_INTAKE)).toBe(
      harbor,
    );
  });

  it("assigns a cue to the nearest legal entity so swapped allocations fail", () => {
    const entities = ["Stonebridge Wellness LLC", "NovaPath Learning Inc.", "ClearSpring Distribution LLC"];
    const listing =
      "Subscription revenue is split 45% to Stonebridge Wellness LLC, 35% to NovaPath Learning Inc., and 20% to ClearSpring Distribution LLC.";
    expect(closestEntityToCue(listing, entities, /\b45\s*%/)).toBe("Stonebridge Wellness LLC");
    expect(cueAssignedToExpectedEntity(listing, "Stonebridge Wellness LLC", entities, /\b45\s*%/)).toBe(true);
    const swapped =
      "Subscription revenue is split 45% to NovaPath Learning Inc., 35% to Stonebridge Wellness LLC, and 20% to ClearSpring Distribution LLC.";
    expect(cueAssignedToExpectedEntity(swapped, "Stonebridge Wellness LLC", entities, /\b45\s*%/)).toBe(false);
    expect(cueAssignedToExpectedEntity(swapped, "NovaPath Learning Inc.", entities, /\b45\s*%/)).toBe(true);
  });
});
