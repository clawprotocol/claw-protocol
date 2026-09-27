import { describe, expect, it } from "vitest";
import {
  mergeStructuredPartyIdentity,
  missingConfirmedSignerNames,
  signingPreparationBlockedForMissingSigners,
} from "./partyIdentityPersist";

const HARBOR_ID = "61321f75-dd4a-4100-9629-e6cfeaff379f";
const IRONVALE_ID = "e535096f-bbc9-4b18-8cef-07d70be0ea88";

const current = [
  {
    id: HARBOR_ID,
    name: "Harbor Peak Analytics LLC",
    role: "Consultant",
    signerName: "Maya Chen",
    email: "maya.chen@harborpeak.test",
    signerTitle: "Principal",
  },
  {
    id: IRONVALE_ID,
    name: "Ironvale Manufacturing Inc.",
    role: "Client",
    signerName: "Jordan Hale",
    email: "jordan.hale@ironvale.test",
    signerTitle: "Operations Lead",
  },
];

describe("mergeStructuredPartyIdentity", () => {
  it("keeps Harbor IDs and signer names through an accepted-revision shell", () => {
    const merged = mergeStructuredPartyIdentity({
      current,
      incoming: [
        { id: HARBOR_ID, name: "Harbor Peak Analytics LLC", role: "Consultant", signer_name: null, email: null },
        {
          id: IRONVALE_ID,
          name: "Ironvale Manufacturing Inc.",
          role: "Client",
          signer_name: null,
          email: "jordan.hale@ironvale.test",
        },
      ],
    });
    const byId = Object.fromEntries(merged.map((row) => [row.id, row]));
    expect(byId[HARBOR_ID]).toMatchObject({
      signerName: "Maya Chen",
      signer_name: "Maya Chen",
      email: "maya.chen@harborpeak.test",
    });
    expect(byId[IRONVALE_ID]).toMatchObject({
      signerName: "Jordan Hale",
      email: "jordan.hale@ironvale.test",
    });
  });

  it("hydrates camelCase from snake_case backend fields", () => {
    const merged = mergeStructuredPartyIdentity({
      current: [
        {
          id: HARBOR_ID,
          name: "Harbor Peak Analytics LLC",
          role: "Consultant",
          signer_name: "Maya Chen",
          signer_title: "Principal",
        },
      ],
      incoming: [{ id: HARBOR_ID, name: "Harbor Peak Analytics LLC", role: "Consultant" }],
    });
    expect(merged[0]?.signerName).toBe("Maya Chen");
    expect(merged[0]?.signerTitle).toBe("Principal");
  });

  it("does not let accepted-corpus replacement blank signer metadata", () => {
    const merged = mergeStructuredPartyIdentity({
      current,
      incoming: [
        { id: HARBOR_ID, name: "Harbor Peak Analytics LLC", role: "Consultant" },
        { id: IRONVALE_ID, name: "Ironvale Manufacturing Inc.", role: "Client" },
      ],
    });
    expect(merged.map((row) => row.signerName)).toEqual(["Maya Chen", "Jordan Hale"]);
  });

  it("keeps signer identity bound by ID when parties are reordered", () => {
    const merged = mergeStructuredPartyIdentity({
      current,
      incoming: [
        { id: IRONVALE_ID, name: "Ironvale Manufacturing Inc.", role: "Client" },
        { id: HARBOR_ID, name: "Harbor Peak Analytics LLC", role: "Consultant" },
      ],
    });
    expect(merged[0]?.id).toBe(IRONVALE_ID);
    expect(merged[0]?.signerName).toBe("Jordan Hale");
    expect(merged[1]?.id).toBe(HARBOR_ID);
    expect(merged[1]?.signerName).toBe("Maya Chen");
  });

  it("does not let an empty incoming shell erase confirmed metadata", () => {
    const merged = mergeStructuredPartyIdentity({ current, incoming: [] });
    expect(merged.map((row) => row.signerName)).toEqual(["Maya Chen", "Jordan Hale"]);
  });

  it("does not cross-bind shared legal-name bases", () => {
    const merged = mergeStructuredPartyIdentity({
      current: [
        { id: "a", name: "Acme LLC", role: "party", signerName: "Ann", email: "ann@a.test" },
        { id: "b", name: "Acme LLC", role: "party", signerName: "Bob", email: "bob@b.test" },
      ],
      incoming: [{ name: "Acme LLC", role: "party", email: "other@x.test" }],
    });
    const byId = Object.fromEntries(merged.filter((row) => row.id).map((row) => [row.id, row]));
    expect(byId.a?.signerName).toBe("Ann");
    expect(byId.b?.signerName).toBe("Bob");
  });

  it("allows reviewer email updates on the same party without replacing signer name", () => {
    const merged = mergeStructuredPartyIdentity({
      current,
      incoming: [
        { id: HARBOR_ID, name: "Harbor Peak Analytics LLC", role: "Consultant", email: "notices@harborpeak.test" },
        {
          id: IRONVALE_ID,
          name: "Ironvale Manufacturing Inc.",
          role: "Client",
          email: "jordan.reviewer@ironvale.test",
        },
      ],
    });
    const byId = Object.fromEntries(merged.map((row) => [row.id, row]));
    expect(byId[HARBOR_ID]?.signerName).toBe("Maya Chen");
    expect(byId[HARBOR_ID]?.email).toBe("notices@harborpeak.test");
    expect(byId[IRONVALE_ID]?.signerName).toBe("Jordan Hale");
    expect(byId[IRONVALE_ID]?.email).toBe("jordan.reviewer@ironvale.test");
  });

  it("rejects entity-name copies as human signer names", () => {
    const merged = mergeStructuredPartyIdentity({
      current,
      incoming: [
        {
          id: HARBOR_ID,
          name: "Harbor Peak Analytics LLC",
          role: "Consultant",
          signerName: "Harbor Peak Analytics LLC",
        },
      ],
    });
    expect(merged[0]?.signerName).toBe("Maya Chen");
  });

  it("leaves a genuinely missing signer missing and blocks signing preparation", () => {
    const parties = [
      { id: HARBOR_ID, name: "Harbor Peak Analytics LLC", role: "Consultant", signerName: "Maya Chen" },
      { id: IRONVALE_ID, name: "Ironvale Manufacturing Inc.", role: "Client" },
    ];
    const merged = mergeStructuredPartyIdentity({ current: parties, incoming: parties });
    expect(merged[1]?.signerName).toBeUndefined();
    expect(missingConfirmedSignerNames(merged)).toEqual([IRONVALE_ID]);
    expect(signingPreparationBlockedForMissingSigners(merged)).toBe(true);
  });
});
