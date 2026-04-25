"""
Deterministic layout extraction via PyMuPDF (text geometry + optional OCR).
Never uses LLMs for coordinates.
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from backend.document_layout.coords import normalize_rect_pdf, union_bboxes


@dataclass
class SpanRecord:
    text: str
    bbox_pdf: Tuple[float, float, float, float]
    size: float = 0.0
    font: str = ""


@dataclass
class LineRecord:
    spans: List[SpanRecord] = field(default_factory=list)
    bbox_pdf: Tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)
    text: str = ""


@dataclass
class BlockRecord:
    lines: List[LineRecord] = field(default_factory=list)
    bbox_pdf: Tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)
    block_type: str = "text"


@dataclass
class PageLayout:
    page_number: int
    width_pt: float
    height_pt: float
    blocks: List[BlockRecord] = field(default_factory=list)
    ocr_used: bool = False
    native_text_empty: bool = False


def _is_pdf_magic(content: bytes) -> bool:
    return len(content) >= 5 and content[:5] == b"%PDF-"


def _open_fitz_doc(content: bytes, content_type: Optional[str]):
    import fitz

    try:
        if _is_pdf_magic(content):
            return fitz.open(stream=content, filetype="pdf"), "pdf"

        ct = (content_type or "").lower()
        if "png" in ct:
            return fitz.open(stream=content, filetype="png"), "image"
        if "jpeg" in ct or "jpg" in ct:
            return fitz.open(stream=content, filetype="jpeg"), "image"
        if "webp" in ct:
            try:
                return fitz.open(stream=content, filetype="webp"), "image"
            except Exception:
                pass

        try:
            from PIL import Image
        except ImportError as exc:
            raise ValueError("unsupported_document_format") from exc

        im = Image.open(io.BytesIO(content))
        fmt = (im.format or "PNG").upper()
        if fmt == "JPEG":
            return fitz.open(stream=content, filetype="jpeg"), "image"
        if fmt == "PNG":
            return fitz.open(stream=content, filetype="png"), "image"
        buf = io.BytesIO()
        im.convert("RGB").save(buf, format="PNG")
        return fitz.open(stream=buf.getvalue(), filetype="png"), "image"
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("unsupported_document_format") from exc


def _dict_page_empty(text_dict: Dict[str, Any]) -> bool:
    blocks = text_dict.get("blocks") or []
    for b in blocks:
        if b.get("type") != 0:
            continue
        for line in b.get("lines") or []:
            for sp in line.get("spans") or []:
                if (sp.get("text") or "").strip():
                    return False
    return True


def _try_ocr_page(page, flags: int) -> Optional[Dict[str, Any]]:
    """PyMuPDF OCR when Tesseract is available; returns text dict or None."""
    try:
        tp = page.get_textpage_ocr(dpi=200, language="eng", full=True)
        return page.get_text("dict", flags=flags, textpage=tp)
    except Exception:
        return None


def extract_spatial_pages(
    content: bytes,
    content_type: Optional[str] = None,
    *,
    prefer_ocr: bool = False,
) -> Tuple[List[PageLayout], Dict[str, Any]]:
    """
    Returns per-page layout with blocks / lines / spans and PDF point bboxes.
    """
    import fitz

    doc, src_kind = _open_fitz_doc(content, content_type)
    meta: Dict[str, Any] = {
        "source_kind": src_kind,
        "page_count": len(doc),
        "ocr_any_page": False,
    }
    pages: List[PageLayout] = []
    flags = fitz.TEXT_PRESERVE_WHITESPACE

    try:
        for i in range(len(doc)):
            page = doc[i]
            rect = page.rect
            pw, ph = float(rect.width), float(rect.height)
            d = page.get_text("dict", flags=flags)
            native_empty = _dict_page_empty(d)
            ocr_used = False
            if prefer_ocr or native_empty:
                ocr_d = _try_ocr_page(page, flags)
                if ocr_d is not None and not _dict_page_empty(ocr_d):
                    d = ocr_d
                    ocr_used = True
                    meta["ocr_any_page"] = True

            blocks_out: List[BlockRecord] = []
            for block in d.get("blocks") or []:
                if block.get("type") != 0:
                    continue
                bb = block.get("bbox")
                if not bb or len(bb) < 4:
                    continue
                bx0, by0, bx1, by1 = float(bb[0]), float(bb[1]), float(bb[2]), float(bb[3])
                line_recs: List[LineRecord] = []
                for line in block.get("lines") or []:
                    lb = line.get("bbox")
                    if not lb or len(lb) < 4:
                        continue
                    spans_raw = line.get("spans") or []
                    span_recs: List[SpanRecord] = []
                    for sp in spans_raw:
                        sb = sp.get("bbox")
                        if not sb or len(sb) < 4:
                            continue
                        t = str(sp.get("text") or "")
                        span_recs.append(
                            SpanRecord(
                                text=t,
                                bbox_pdf=(float(sb[0]), float(sb[1]), float(sb[2]), float(sb[3])),
                                size=float(sp.get("size") or 0),
                                font=str(sp.get("font") or ""),
                            )
                        )
                    if not span_recs:
                        continue
                    u = span_recs
                    lx0, ly0, lx1, ly1 = union_bboxes([s.bbox_pdf for s in u])
                    line_text = "".join(s.text for s in u)
                    line_recs.append(
                        LineRecord(spans=u, bbox_pdf=(lx0, ly0, lx1, ly1), text=line_text)
                    )
                if not line_recs:
                    continue
                b_union = union_bboxes([ln.bbox_pdf for ln in line_recs])
                blocks_out.append(
                    BlockRecord(lines=line_recs, bbox_pdf=b_union, block_type="text")
                )
            pages.append(
                PageLayout(
                    page_number=i + 1,
                    width_pt=pw,
                    height_pt=ph,
                    blocks=blocks_out,
                    ocr_used=ocr_used,
                    native_text_empty=native_empty,
                )
            )
    finally:
        doc.close()

    return pages, meta


def pages_to_review_dict(pages: List[PageLayout]) -> Dict[str, Any]:
    """Serializable structure for API / storage (machine-readable)."""
    out_pages: List[Dict[str, Any]] = []
    for p in pages:
        blocks_j: List[Dict[str, Any]] = []
        for b in p.blocks:
            lines_j: List[Dict[str, Any]] = []
            for ln in b.lines:
                spans_j = []
                for sp in ln.spans:
                    spans_j.append(
                        {
                            "text": sp.text,
                            "bbox_pdf": {
                                "x0": sp.bbox_pdf[0],
                                "y0": sp.bbox_pdf[1],
                                "x1": sp.bbox_pdf[2],
                                "y1": sp.bbox_pdf[3],
                            },
                            "bbox_normalized": normalize_rect_pdf(
                                sp.bbox_pdf[0],
                                sp.bbox_pdf[1],
                                sp.bbox_pdf[2],
                                sp.bbox_pdf[3],
                                p.width_pt,
                                p.height_pt,
                            ),
                            "font": sp.font,
                            "size_pt": sp.size,
                        }
                    )
                lines_j.append(
                    {
                        "text": ln.text,
                        "bbox_pdf": {
                            "x0": ln.bbox_pdf[0],
                            "y0": ln.bbox_pdf[1],
                            "x1": ln.bbox_pdf[2],
                            "y1": ln.bbox_pdf[3],
                        },
                        "bbox_normalized": normalize_rect_pdf(
                            ln.bbox_pdf[0],
                            ln.bbox_pdf[1],
                            ln.bbox_pdf[2],
                            ln.bbox_pdf[3],
                            p.width_pt,
                            p.height_pt,
                        ),
                        "spans": spans_j,
                    }
                )
            blocks_j.append(
                {
                    "bbox_pdf": {
                        "x0": b.bbox_pdf[0],
                        "y0": b.bbox_pdf[1],
                        "x1": b.bbox_pdf[2],
                        "y1": b.bbox_pdf[3],
                    },
                    "bbox_normalized": normalize_rect_pdf(
                        b.bbox_pdf[0], b.bbox_pdf[1], b.bbox_pdf[2], b.bbox_pdf[3], p.width_pt, p.height_pt
                    ),
                    "lines": lines_j,
                }
            )
        out_pages.append(
            {
                "page_number": p.page_number,
                "dimensions_pt": {"width": p.width_pt, "height": p.height_pt},
                "ocr_used": p.ocr_used,
                "native_text_empty": p.native_text_empty,
                "text_blocks": blocks_j,
            }
        )
    return {"pages": out_pages}
