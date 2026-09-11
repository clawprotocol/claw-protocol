import { describe, expect, it } from "vitest";
import { canonicalizeEsignNewAliasPath, isEsignNewAliasPath } from "./quickAliasCanonicalize";
import { parseEsignDocumentPath } from "./esignDocumentAccess";

describe("esign new alias canonicalize", () => {
  it("maps only bare /app/esign and /app/esign/new", () => {
    expect(isEsignNewAliasPath("/app/esign")).toBe(true);
    expect(isEsignNewAliasPath("/app/esign/new")).toBe(true);
    expect(isEsignNewAliasPath("/app/esign/doc-1")).toBe(false);
    expect(canonicalizeEsignNewAliasPath("/app/esign/doc-1", "?start=pdf")).toBeNull();
    expect(parseEsignDocumentPath("/app/esign/doc-1")).toEqual({ documentId: "doc-1" });
  });

  it("keeps only start=pdf and approved attribution", () => {
    expect(canonicalizeEsignNewAliasPath("/app/esign/new", "")).toBe("/app/quick?start=pdf");
    expect(canonicalizeEsignNewAliasPath("/app/esign", "?src=csn&aff=ref1")).toBe(
      "/app/quick?start=pdf&src=csn&aff=ref1",
    );
    expect(
      canonicalizeEsignNewAliasPath(
        "/app/esign/new",
        "?t=secret&token=x&continuation_id=c1&agreement_bridge=1&vs01_recipient_sign=1&documentId=doc_1&start=type&foo=bar&src=csn",
      ),
    ).toBe("/app/quick?start=pdf&src=csn");
  });
});
