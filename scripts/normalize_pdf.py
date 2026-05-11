#!/usr/bin/env python3
"""
Rewrite a PDF through pypdf (lossy for some advanced features; preserves normal pages).

Usage:
  python scripts/normalize_pdf.py path/to/file.pdf

Writes: path/to/file-normalized.pdf (same directory as input).

Requires: pypdf (see backend/requirements.txt).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def normalize(src: Path) -> int:
    if not src.is_file():
        print(f"ERROR: not a file: {src}", file=sys.stderr)
        return 2

    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError as e:
        print(f"ERROR: pypdf not installed ({e})", file=sys.stderr)
        return 2

    before = src.stat().st_size
    out = src.with_name(f"{src.stem}-normalized{src.suffix}")

    try:
        reader = PdfReader(str(src), strict=False)
    except Exception as exc:
        print(f"ERROR: could not read PDF ({type(exc).__name__}: {exc})", file=sys.stderr)
        return 2

    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    try:
        with open(out, "wb") as f:
            writer.write(f)
    except Exception as exc:
        print(f"ERROR: write failed ({type(exc).__name__}: {exc})", file=sys.stderr)
        return 2

    after = out.stat().st_size
    print(f"Input:  {src.resolve()} ({before:,} bytes)")
    print(f"Output: {out.resolve()} ({after:,} bytes)")
    print(f"Delta:  {after - before:+,} bytes ({(after / before * 100) if before else 0:.1f}% of original)")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser(description="Normalize PDF via pypdf rewrite.")
    ap.add_argument("pdf", type=Path, help="Path to input .pdf")
    args = ap.parse_args()
    sys.exit(normalize(args.pdf.expanduser().resolve()))


if __name__ == "__main__":
    main()
