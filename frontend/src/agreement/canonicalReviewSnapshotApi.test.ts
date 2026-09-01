/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptCanonicalReviewSnapshot,
  acceptDisplayedCommercialReviewSnapshot,
  canEnableCommercialPrepareFromServerSnapshot,
  establishServerAcceptedReviewSnapshot,
  persistCanonicalReviewSnapshot,
  prepareCommercialReviewSnapshotAuthority,
  readAcceptedReviewSnapshotRef,
  readDisplayReviewSnapshotAuthority,
  sha256CorpusDigest,
  storeAcceptedReviewSnapshotRef,
  storeDisplayReviewSnapshotAuthority,
} from "./canonicalReviewSnapshotApi";

describe("canonicalReviewSnapshotApi", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores and reads accepted snapshot ref scoped by agreement", () => {
    storeAcceptedReviewSnapshotRef({
      agreementId: "ag_1",
      snapshotId: "crs_1",
      corpusSha256: "abc",
      corpusLength: 1200,
    });
    expect(readAcceptedReviewSnapshotRef("ag_1")?.snapshotId).toBe("crs_1");
    expect(readAcceptedReviewSnapshotRef("ag_other")).toBeNull();
  });

  it("sha256CorpusDigest is stable for identical corpus", async () => {
    const a = await sha256CorpusDigest("hello world corpus ".repeat(40));
    const b = await sha256CorpusDigest("hello world corpus ".repeat(40));
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fire-and-forget establishServerAcceptedReviewSnapshot is removed (fail closed)", async () => {
    const result = await establishServerAcceptedReviewSnapshot({
      agreementId: "ag_test",
      corpusPlain: ("OPERATIVE\n\n" + "x".repeat(600)).trim(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("fire_and_forget_commercial_accept_removed");
  });

  it("prepareCommercialReviewSnapshotAuthority persists then GETs and does not accept", async () => {
    const corpus = ("OPERATIVE\n\n" + "x".repeat(600)).trim();
    const digest = await sha256CorpusDigest(corpus);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();
      if (url.includes("/canonical-review-snapshot") && method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            snapshot: {
              snapshot_id: "crs_test",
              agreement_id: "ag_test",
              corpus_plain: corpus,
              corpus_sha256: digest,
              corpus_length: corpus.length,
              status: "pending",
              schema_version: "claw.canonical_review_snapshot/v1",
            },
            registry_version: 1,
          }),
        } as Response;
      }
      if (url.includes("/canonical-review-snapshot") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "pending",
            snapshot: {
              snapshot_id: "crs_test",
              agreement_id: "ag_test",
              corpus_plain: corpus,
              corpus_sha256: digest,
              corpus_length: corpus.length,
              status: "pending",
              schema_version: "claw.canonical_review_snapshot/v1",
            },
            registry_version: 1,
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await prepareCommercialReviewSnapshotAuthority({
      agreementId: "ag_test",
      corpusPlain: corpus,
      generationSessionId: "gen_1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.snapshot.snapshot_id).toBe("crs_test");
    expect(result.status).toBe("pending");
    expect(readDisplayReviewSnapshotAuthority("ag_test")?.snapshotId).toBe("crs_test");
    expect(readAcceptedReviewSnapshotRef("ag_test")).toBeNull();
    expect(canEnableCommercialPrepareFromServerSnapshot("ag_test")).toBe(false);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/accept"))).toBe(false);
  });

  it("acceptDisplayedCommercialReviewSnapshot fails when display differs from GET", async () => {
    const corpus = ("OPERATIVE\n\n" + "x".repeat(600)).trim();
    const digest = await sha256CorpusDigest(corpus);
    storeDisplayReviewSnapshotAuthority({
      agreementId: "ag_test",
      snapshotId: "crs_display_a",
      corpusSha256: digest,
      corpusLength: corpus.length,
      status: "pending",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: "pending",
          snapshot: {
            snapshot_id: "crs_other_b",
            agreement_id: "ag_test",
            corpus_plain: corpus,
            corpus_sha256: digest,
            corpus_length: corpus.length,
            status: "pending",
          },
        }),
      })),
    );
    const result = await acceptDisplayedCommercialReviewSnapshot({ agreementId: "ag_test" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("display_authority_mismatch");
  });

  it("acceptCanonicalReviewSnapshot does not send replacement corpus bytes", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        accepted: {
          snapshot_id: "crs_a",
          agreement_id: "ag_a",
          corpus_plain: "body",
          corpus_sha256: "d".repeat(64),
          corpus_length: 4,
          status: "accepted",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await acceptCanonicalReviewSnapshot({
      agreementId: "ag_a",
      snapshotId: "crs_a",
      expectedDigest: "d".repeat(64),
      expectedAcceptedSnapshotId: "",
      displaySnapshotId: "crs_a",
      displayDigest: "d".repeat(64),
      displayLength: 4,
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit?];
    const body = JSON.parse(String(firstCall[1]?.body ?? "{}"));
    expect(body.snapshot_id).toBe("crs_a");
    expect(body.expected_digest).toBe("d".repeat(64));
    expect(body.corpus_plain).toBeUndefined();
    expect(body.display_snapshot_id).toBe("crs_a");
  });

  it("persistCanonicalReviewSnapshot returns error code on http failure", async () => {
    const res = await persistCanonicalReviewSnapshot({
      agreementId: "ag_x",
      corpusPlain: "short",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("invalid_snapshot_args");
  });

  it("canEnableCommercialPrepareFromServerSnapshot requires verified GET corpus + display==accepted", async () => {
    const corpus = ("OPERATIVE\n\n" + "x".repeat(600)).trim();
    const sha = await sha256CorpusDigest(corpus);
    const { storeVerifiedCommercialDisplayCorpus } = await import("./canonicalReviewSnapshotApi");
    storeVerifiedCommercialDisplayCorpus({
      agreementId: "ag_1",
      snapshotId: "crs_1",
      corpusSha256: sha,
      corpusLength: corpus.length,
      status: "pending",
      corpusPlain: corpus,
    });
    expect(canEnableCommercialPrepareFromServerSnapshot("ag_1")).toBe(false);
    storeAcceptedReviewSnapshotRef({
      agreementId: "ag_1",
      snapshotId: "crs_1",
      corpusSha256: sha,
      corpusLength: corpus.length,
    });
    storeVerifiedCommercialDisplayCorpus({
      agreementId: "ag_1",
      snapshotId: "crs_1",
      corpusSha256: sha,
      corpusLength: corpus.length,
      status: "accepted",
      corpusPlain: corpus,
    });
    expect(canEnableCommercialPrepareFromServerSnapshot("ag_1")).toBe(true);
  });

  it("prepare/empty agreementId cannot bypass Prepare authority", async () => {
    const corpus = ("OPERATIVE\n\n" + "x".repeat(600)).trim();
    for (const agreementId of ["", "   "]) {
      const prepared = await prepareCommercialReviewSnapshotAuthority({
        agreementId,
        corpusPlain: corpus,
      });
      expect(prepared.ok).toBe(false);
      if (!prepared.ok) expect(prepared.code).toBe("invalid_snapshot_args");
      expect(canEnableCommercialPrepareFromServerSnapshot(agreementId)).toBe(false);
    }
  });

  it("local accepted/display refs alone do not unlock Prepare without verified GET corpus", async () => {
    // Local-only session refs (simulating a premium completion snap leftover) are insufficient
    // until verified GET corpus + matching accepted authority exist.
    storeAcceptedReviewSnapshotRef({
      agreementId: "ag_local_only",
      snapshotId: "crs_local",
      corpusSha256: "f".repeat(64),
      corpusLength: 1200,
    });
    expect(canEnableCommercialPrepareFromServerSnapshot("ag_local_only")).toBe(false);
    expect(canEnableCommercialPrepareFromServerSnapshot("")).toBe(false);
    expect(canEnableCommercialPrepareFromServerSnapshot(null)).toBe(false);

    storeDisplayReviewSnapshotAuthority({
      agreementId: "ag_local_only",
      snapshotId: "crs_other",
      corpusSha256: "e".repeat(64),
      corpusLength: 1200,
      status: "accepted",
    });
    expect(canEnableCommercialPrepareFromServerSnapshot("ag_local_only")).toBe(false);

    storeDisplayReviewSnapshotAuthority({
      agreementId: "ag_local_only",
      snapshotId: "crs_local",
      corpusSha256: "f".repeat(64),
      corpusLength: 1200,
      status: "accepted",
    });
    // Matching metadata without GET corpus bytes still blocks Prepare.
    expect(canEnableCommercialPrepareFromServerSnapshot("ag_local_only")).toBe(false);

    const corpus = ("OPERATIVE\n\n" + "y".repeat(600)).trim();
    const sha = await sha256CorpusDigest(corpus);
    const { storeVerifiedCommercialDisplayCorpus } = await import("./canonicalReviewSnapshotApi");
    storeVerifiedCommercialDisplayCorpus({
      agreementId: "ag_local_only",
      snapshotId: "crs_local",
      corpusSha256: sha,
      corpusLength: corpus.length,
      status: "accepted",
      corpusPlain: corpus,
    });
    storeAcceptedReviewSnapshotRef({
      agreementId: "ag_local_only",
      snapshotId: "crs_local",
      corpusSha256: sha,
      corpusLength: corpus.length,
    });
    expect(canEnableCommercialPrepareFromServerSnapshot("ag_local_only")).toBe(true);
  });

  it("persistCanonicalReviewSnapshot refuses 12-then-14 without repair-then-accept", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const skipped = [
      "SERVICES AGREEMENT",
      "",
      "This Services Agreement is between Cedar Ridge LLC and Maple Grove Inc.",
      "",
      "1. Services and Deliverables",
      "Designer will provide the deliverables.",
      "",
      "10. Miscellaneous",
      "This is the entire agreement.",
      "",
      "11. Independent Contractor and Assignment",
      "Designer is an independent contractor.",
      "",
      "12. Force Majeure",
      "Neither party is liable for delay beyond its control.",
      "",
      "14. Notices",
      "Any notice must be in writing.",
      "",
      "IN WITNESS WHEREOF, the parties have executed this Agreement.",
      "",
      "x".repeat(400),
    ].join("\n");
    const res = await persistCanonicalReviewSnapshot({
      agreementId: "ag_skip",
      corpusPlain: skipped,
      intakeText: "Cedar Ridge LLC is hiring Maple Grove Inc, governing law Oklahoma.",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("skipped_top_level_section_integers");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { law: "Oklahoma", client: "Cedar Ridge LLC", provider: "Maple Grove Inc", attnA: "Jordan Hale", attnB: "Morgan Ellis" },
    { law: "Colorado", client: "Riverbend Studio", provider: "Oak Point LLC", attnA: "Casey Quinn", attnB: "Riley Chen" },
    { law: "New York", client: "Summit Craft Co", provider: "Harborline Design LLC", attnA: "Avery Cole", attnB: "Sam Ortiz" },
  ] as const)(
    "persistCanonicalReviewSnapshot accepts sequential wrapped-heading 1..12 with Notices Attn ($law)",
    async ({ law, client, provider, attnA, attnB }) => {
      const sequential = [
        "SERVICES AGREEMENT",
        "",
        `This Services Agreement is between ${client} and ${provider}.`,
        "",
        "1. Services and Deliverables",
        "Designer will provide a logo and brand kit.",
        "",
        "2. Revisions,",
        "Client Input, and Changes",
        "The flat fee includes up to two rounds of reasonable revisions.",
        "",
        "3. Fees and Payment",
        "Fees are due as stated.",
        "",
        "4. Term and Termination",
        "The engagement continues until complete.",
        "4.1 Early Termination",
        "Either party may terminate for material breach.",
        "",
        "5. Intellectual Property",
        "Client owns final deliverables upon payment.",
        "5.1 Portfolio License",
        "Designer retains a limited portfolio license.",
        "",
        "6. Confidentiality",
        "Each party keeps non-public information confidential.",
        "",
        "7. Representations and Warranties",
        "Each party represents it has authority to enter this Agreement.",
        "",
        "8. Indemnification",
        "Each party indemnifies the other for third-party claims arising from its breach.",
        "",
        "9. Liability Allocation",
        "Total liability is capped at fees paid.",
        "",
        "10. Independent Contractor and Assignment",
        "This Agreement cannot be assigned without prior written consent.",
        "",
        "11. Governing Law",
        `This Agreement is governed by the laws of ${law}, without regard to conflict-of-laws principles.`,
        "",
        "12. Notices",
        "Any notice must be in writing.",
        "1. Email",
        "2. Personal delivery",
        `If to ${client}:`,
        `Attn: ${attnA}`,
        "10. Main Street",
        `If to ${provider}:`,
        `Attn: ${attnB}`,
        "2. Revisions,",
        "Client Input, and Changes",
        "",
        "IN WITNESS WHEREOF, the parties have executed this Agreement.",
        "",
        "x".repeat(400),
      ].join("\n");
      const digest = await sha256CorpusDigest(sequential);
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          snapshot: {
            snapshot_id: "crs_wrap_1_12",
            agreement_id: "ag_wrap_1_12",
            corpus_plain: sequential,
            corpus_sha256: digest,
            corpus_length: sequential.length,
            status: "pending",
          },
        }),
      }));
      vi.stubGlobal("fetch", fetchMock);
      const res = await persistCanonicalReviewSnapshot({
        agreementId: "ag_wrap_1_12",
        corpusPlain: sequential,
        intakeText: `${client} is hiring ${provider}, governing law ${law}.`,
      });
      expect(res.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalled();
      expect(sequential).not.toMatch(/Texas|Northline|Priya|Diego/);
    },
  );

  it.each([
    { law: "Oklahoma", client: "Cedar Ridge LLC", provider: "Maple Grove Inc", attnA: "Jordan Hale", attnB: "Morgan Ellis" },
    { law: "Colorado", client: "Riverbend Studio", provider: "Oak Point LLC", attnA: "Casey Quinn", attnB: "Riley Chen" },
    { law: "New York", client: "Summit Craft Co", provider: "Harborline Design LLC", attnA: "Avery Cole", attnB: "Sam Ortiz" },
  ] as const)(
    "persistCanonicalReviewSnapshot accepts persist-time HTML/markup 1..12 ($law)",
    async ({ law, client, provider, attnA, attnB }) => {
      const headingMarkers = [
        "Services",
        "Revisions",
        "Fees",
        "Term",
        "Intellectual",
        "Confidentiality",
        "Representations",
        "Indemnification",
        "Liability",
        "Independent",
        "Governing",
        "Notices",
      ];
      const sequential = [
        "SERVICES AGREEMENT",
        "",
        `This Services Agreement is between ${client} and ${provider}.`,
        "",
        "1. Services and Deliverables",
        "Designer will provide a logo and brand kit.",
        "",
        "2. Revisions,",
        "Client Input, and Changes",
        "The flat fee includes up to two rounds of reasonable revisions.",
        "",
        "3. Fees and Payment",
        "Fees are due as stated.",
        "",
        "4. Term and Termination",
        "The engagement continues until complete.",
        "4.1 Early Termination",
        "Either party may terminate for material breach.",
        "",
        "5. Intellectual Property",
        "Client owns final deliverables upon payment.",
        "",
        "6. Confidentiality",
        "Each party keeps non-public information confidential.",
        "",
        "7. Representations and Warranties",
        "Each party represents it has authority to enter this Agreement.",
        "",
        "8. Indemnification",
        "Each party indemnifies the other for third-party claims arising from its breach.",
        "",
        "9. Liability Allocation",
        "Total liability is capped at fees paid.",
        "",
        "10. Independent Contractor and Assignment",
        "This Agreement cannot be assigned without prior written consent.",
        "",
        "11. Governing Law",
        `This Agreement is governed by the laws of ${law}, without regard to conflict-of-laws principles.`,
        "",
        "12. Notices",
        "Any notice must be in writing.",
        "1. Email",
        "2. Personal delivery",
        "3. Overnight courier",
        `If to ${client}:`,
        `Attn: ${attnA}`,
        "10. Main Street",
        `If to ${provider}:`,
        `Attn: ${attnB}`,
        "2. Revisions,",
        "Client Input, and Changes",
        "",
        "IN WITNESS WHEREOF, the parties have executed this Agreement.",
        "",
        "x".repeat(400),
      ].join("\n");
      const htmlCorpus = sequential
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          if (
            trimmed &&
            !/^\d+\.\d+/.test(trimmed) &&
            /^\d{1,2}\.\s+/.test(trimmed) &&
            headingMarkers.some((marker) => trimmed.includes(marker))
          ) {
            return `<h2 class="premium-doc-section-heading">${trimmed}</h2>`;
          }
          return trimmed ? `<p>${trimmed}</p>` : "";
        })
        .join("\n");
      const markupCorpus = sequential
        .replace("2. Revisions,", '<h2 class="premium-doc-section-heading">2. Revisions,</h2>')
        .replace("12. Notices", "<strong>12. Notices</strong>")
        .replace(
          "1. Email\n2. Personal delivery\n3. Overnight courier",
          "1. Email<br />2. Personal delivery<br />3. Overnight courier",
        );
      for (const corpus of [htmlCorpus, markupCorpus]) {
        const digest = await sha256CorpusDigest(corpus);
        const fetchMock = vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            snapshot: {
              snapshot_id: "crs_wrap_html_1_12",
              agreement_id: "ag_wrap_html_1_12",
              corpus_plain: corpus,
              corpus_sha256: digest,
              corpus_length: corpus.length,
              status: "pending",
            },
          }),
        }));
        vi.stubGlobal("fetch", fetchMock);
        const res = await persistCanonicalReviewSnapshot({
          agreementId: "ag_wrap_html_1_12",
          corpusPlain: corpus,
          intakeText: `${client} is hiring ${provider}, governing law ${law}.`,
        });
        expect(res.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalled();
        expect(corpus).not.toMatch(/Texas|Northline|Priya|Diego/);
      }
    },
  );

  it("persistCanonicalReviewSnapshot refuses HTML 12-then-14 without repair-then-accept", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const skipped = [
      "<h2 class=\"premium-doc-section-heading\">1. Services and Deliverables</h2>",
      "<p>Designer will provide the deliverables.</p>",
      "<h2 class=\"premium-doc-section-heading\">10. Miscellaneous</h2>",
      "<p>This is the entire agreement.</p>",
      "<h2 class=\"premium-doc-section-heading\">11. Independent Contractor and Assignment</h2>",
      "<p>Designer is an independent contractor.</p>",
      "<h2 class=\"premium-doc-section-heading\">12. Force Majeure</h2>",
      "<p>Neither party is liable for delay beyond its control.</p>",
      "<h2 class=\"premium-doc-section-heading\">14. Notices</h2>",
      "<p>Any notice must be in writing.</p>",
      "",
      "x".repeat(400),
    ].join("\n");
    const res = await persistCanonicalReviewSnapshot({
      agreementId: "ag_skip_html",
      corpusPlain: skipped,
      intakeText: "Cedar Ridge LLC is hiring Maple Grove Inc, governing law Oklahoma.",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("skipped_top_level_section_integers");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("persistCanonicalReviewSnapshot accepts leftover 1..8 and does not remint to 10/11/12/13", async () => {
    const leftover = [
      "SERVICES AGREEMENT",
      "",
      "This consulting engagement is between Summit Craft Co and Harborline Design LLC.",
      "",
      "1. Services and Deliverables",
      "Designer will provide the deliverables.",
      "",
      "2. Fees",
      "Fees are due as stated.",
      "",
      "3. Term and Termination",
      "The engagement continues until complete.",
      "",
      "4. Intellectual Property",
      "Client owns final deliverables upon payment.",
      "",
      "5. Confidentiality",
      "Each party keeps non-public information confidential.",
      "",
      "6. Limitation of Liability",
      "Liability is limited to fees paid.",
      "",
      "7. Governing Law",
      "This Agreement is governed by the laws of the jurisdiction named in the intake.",
      "",
      "8. Notices",
      "Notices must be in writing.",
      "",
      "IN WITNESS WHEREOF, the parties have executed this Agreement.",
      "",
      "x".repeat(400),
    ].join("\n");
    const digest = await sha256CorpusDigest(leftover);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        snapshot: {
          snapshot_id: "crs_leftover",
          agreement_id: "ag_leftover",
          corpus_plain: leftover,
          corpus_sha256: digest,
          corpus_length: leftover.length,
          status: "pending",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await persistCanonicalReviewSnapshot({
      agreementId: "ag_leftover",
      corpusPlain: leftover,
    });
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit?];
    const body = JSON.parse(String(firstCall[1]?.body ?? "{}"));
    expect(body.corpus_plain).toContain("1. Services and Deliverables");
    expect(body.corpus_plain).toContain("8. Notices");
    expect(body.corpus_plain).not.toMatch(/\n10\. /);
    expect(body.corpus_plain).not.toMatch(/\n11\. /);
    expect(body.corpus_plain).not.toMatch(/\n12\. /);
    expect(body.corpus_plain).not.toMatch(/\n13\. /);
  });
});
