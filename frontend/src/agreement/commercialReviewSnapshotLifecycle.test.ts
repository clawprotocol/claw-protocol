import { describe, expect, it } from "vitest";
import {
  assertAcceptTargetsDisplayedAuthority,
  assertPrepareAllowedAfterServerAccept,
  assertServerSnapshotDisplayParity,
} from "./commercialReviewSnapshotLifecycle";

const corpusA = ("OPERATIVE TERMS A.\n\n" + "A".repeat(600)).trim();
const corpusB = ("OPERATIVE TERMS B.\n\n" + "B".repeat(600)).trim();

describe("commercialReviewSnapshotLifecycle", () => {
  it("rejects rendered corpus B when GET/display authority is A", () => {
    const displayed = {
      agreementId: "ag_1",
      snapshotId: "crs_a",
      corpusSha256: "aaa",
      corpusLength: corpusA.length,
    };
    const parity = assertServerSnapshotDisplayParity({
      displayed,
      fromGet: {
        snapshot_id: "crs_a",
        corpus_sha256: "aaa",
        corpus_length: corpusA.length,
        corpus_plain: corpusA,
      },
      renderedCorpusPlain: corpusB,
    });
    expect(parity).toEqual({ ok: false, code: "rendered_corpus_differs_from_get" });
  });

  it("rejects accept of snapshot B while display authority is A", () => {
    const result = assertAcceptTargetsDisplayedAuthority({
      displayed: {
        agreementId: "ag_1",
        snapshotId: "crs_a",
        corpusSha256: "digest_a",
        corpusLength: corpusA.length,
      },
      acceptSnapshotId: "crs_b",
      acceptDigest: "digest_b",
    });
    expect(result).toEqual({ ok: false, code: "accept_targets_non_displayed_snapshot" });
  });

  it("rejects accept payloads that include corpus bytes", () => {
    const result = assertAcceptTargetsDisplayedAuthority({
      displayed: {
        agreementId: "ag_1",
        snapshotId: "crs_a",
        corpusSha256: "digest_a",
        corpusLength: corpusA.length,
      },
      acceptSnapshotId: "crs_a",
      acceptDigest: "digest_a",
      acceptIncludesCorpusPlain: corpusB,
    });
    expect(result).toEqual({ ok: false, code: "accept_must_not_include_corpus" });
  });

  it("blocks Prepare before awaited server acceptance", () => {
    const display = {
      agreementId: "ag_1",
      snapshotId: "crs_a",
      corpusSha256: "digest_a",
      corpusLength: corpusA.length,
    };
    expect(
      assertPrepareAllowedAfterServerAccept({
        display,
        accepted: null,
        serverAcceptAwaitedOk: false,
      }),
    ).toEqual({ ok: false, code: "prepare_blocked_before_server_accept" });
  });

  it("allows Prepare only when accepted matches displayed GET authority", () => {
    const display = {
      agreementId: "ag_1",
      snapshotId: "crs_a",
      corpusSha256: "digest_a",
      corpusLength: corpusA.length,
    };
    expect(
      assertPrepareAllowedAfterServerAccept({
        display,
        accepted: display,
        serverAcceptAwaitedOk: true,
      }),
    ).toEqual({ ok: true });
    expect(
      assertPrepareAllowedAfterServerAccept({
        display,
        accepted: { ...display, snapshotId: "crs_b" },
        serverAcceptAwaitedOk: true,
      }),
    ).toEqual({ ok: false, code: "prepare_blocked_display_accepted_mismatch" });
  });

  it("reload parity requires GET bytes/digest/length match display", () => {
    const displayed = {
      agreementId: "ag_1",
      snapshotId: "crs_a",
      corpusSha256: "digest_a",
      corpusLength: corpusA.length,
    };
    expect(
      assertServerSnapshotDisplayParity({
        displayed,
        fromGet: {
          snapshot_id: "crs_a",
          corpus_sha256: "digest_a",
          corpus_length: corpusA.length,
          corpus_plain: corpusA,
        },
        renderedCorpusPlain: corpusA,
      }),
    ).toEqual({ ok: true });
  });
});
