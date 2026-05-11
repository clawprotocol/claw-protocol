#!/usr/bin/env python3
"""
Dev-only PDF diagnostics (no external APIs).

Usage:
  python scripts/diagnose_pdf.py path/to/file.pdf

Requires: pypdf (see backend/requirements.txt).
"""

from __future__ import annotations

import argparse
import io
import re
import sys
from pathlib import Path


def _tail_has_eof(data: bytes, window: int = 8192) -> bool:
    tail = data[-window:] if len(data) > window else data
    return b"%%EOF" in tail


def _header_version_line(data: bytes) -> str:
    line = data.split(b"\n", 1)[0].decode("latin-1", errors="replace")
    return line


def _xref_heuristic(data: bytes) -> tuple[bool, bool]:
    """(has_classic_xref_keyword, has_startxref)."""
    has_xref = bool(re.search(rb"\bxref\r?\n", data))
    has_startxref = b"startxref" in data
    return has_xref, has_startxref


def _image_subtype_count(data: bytes) -> int:
    return len(re.findall(rb"/Subtype\s*/Image", data))


def diagnose(path: Path) -> int:
    fails = 0
    warns = 0

    if not path.is_file():
        print(f"FAIL: not a file: {path}")
        return 2

    raw = path.read_bytes()
    print(f"File: {path.resolve()}")
    print(f"Size: {len(raw):,} bytes ({len(raw) / 1024 / 1024:.2f} MiB)")

    if len(raw) < 32:
        print("FAIL: file too small to be a PDF")
        return 2

    if not raw.startswith(b"%PDF-"):
        print("FAIL: does not start with %PDF-")
        fails += 1
    else:
        print(f"PASS: PDF header present ({_header_version_line(raw)!r})")

    if _tail_has_eof(raw):
        print("PASS: %%EOF present in final 8 KiB")
    else:
        print("FAIL: %%EOF not found in final 8 KiB")
        fails += 1

    classic_xref, has_startxref = _xref_heuristic(raw)
    if has_startxref:
        print("PASS: startxref marker present")
    else:
        print("WARN: no startxref marker (unusual)")
        warns += 1
    if classic_xref or b"/Type /XRef" in raw or b"/Type/XRef" in raw:
        print("PASS: xref / xref-stream markers present")
    else:
        print("WARN: classic xref table not detected (may still be valid)")
        warns += 1

    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError as e:
        print(f"FAIL: pypdf not installed ({e}). Install backend requirements.")
        return 2

    try:
        reader = PdfReader(io.BytesIO(raw), strict=False)
    except Exception as exc:
        print(f"FAIL: pypdf PdfReader could not open file ({type(exc).__name__}: {exc})")
        return 2

    n_pages = len(reader.pages)
    print(f"PASS: pypdf opened ({n_pages} page(s))")
    if n_pages == 0:
        print("FAIL: zero pages")
        fails += 1

    # Re-save / rewrite
    try:
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        buf = io.BytesIO()
        writer.write(buf)
        raw2 = buf.getvalue()
        reader2 = PdfReader(io.BytesIO(raw2), strict=False)
        if len(reader2.pages) != n_pages:
            print("WARN: page count changed after pypdf rewrite")
            warns += 1
        else:
            print(f"PASS: pypdf rewrite + read-back ok ({len(raw2):,} bytes after rewrite)")
    except Exception as exc:
        print(f"WARN: pypdf rewrite/read-back failed ({type(exc).__name__}: {exc})")
        warns += 1

    # Text extraction (first two pages)
    for i in range(min(2, n_pages)):
        try:
            text = reader.pages[i].extract_text() or ""
        except Exception as exc:
            print(f"WARN: page {i + 1} extract_text raised ({type(exc).__name__}: {exc})")
            warns += 1
            continue
        collapsed = " ".join(text.split())
        if collapsed.strip():
            preview = collapsed[:160] + ("…" if len(collapsed) > 160 else "")
            print(f"PASS: page {i + 1} text extract ({len(text)} chars) preview: {preview!r}")
        else:
            # Blank vector pages often have no extractable text; large/image-heavy PDFs are suspicious.
            if len(raw) > 200_000 or _image_subtype_count(raw) > 3:
                print(f"WARN: page {i + 1} extract_text empty (possible scan/image-heavy layout)")
                warns += 1
            else:
                print(f"INFO: page {i + 1} extract_text empty (blank or vector-only page)")

    # Embedded images (pypdf + raw heuristic)
    try:
        total_img_bytes = 0
        img_objects = 0
        for page in reader.pages[: min(n_pages, 50)]:
            for _name, img in page.images.items():
                img_objects += 1
                data = getattr(img, "data", None) or b""
                total_img_bytes += len(data)
        if img_objects:
            print(
                f"INFO: embedded images (first {min(n_pages, 50)} pages): "
                f"{img_objects} object(s), ~{total_img_bytes:,} decoded bytes"
            )
            if total_img_bytes > 15 * 1024 * 1024:
                print("WARN: very large embedded image payload (>15 MiB decoded)")
                warns += 1
        else:
            subtype_n = _image_subtype_count(raw)
            if subtype_n:
                print(f"INFO: raw /Subtype /Image markers: {subtype_n} (pypdf did not enumerate images)")
            else:
                print("INFO: no inline images detected on sampled pages")
    except Exception as exc:
        print(f"WARN: image scan failed ({type(exc).__name__}: {exc})")
        warns += 1

    # Size sanity (QA agreements)
    if len(raw) > 25 * 1024 * 1024:
        print("WARN: file exceeds 25 MiB (upload tools often cap lower)")
        warns += 1

    print("---")
    if fails:
        print(f"Summary: FAIL ({fails} critical issue(s), {warns} warning(s))")
        return 2
    if warns:
        print(f"Summary: WARN ({warns} warning(s), structure readable)")
        return 1
    print("Summary: PASS")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser(description="Diagnose a PDF for structure and pypdf compatibility.")
    ap.add_argument("pdf", type=Path, help="Path to .pdf file")
    args = ap.parse_args()
    code = diagnose(args.pdf.expanduser().resolve())
    sys.exit(code)


if __name__ == "__main__":
    main()
