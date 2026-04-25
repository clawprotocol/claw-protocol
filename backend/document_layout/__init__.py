"""
Document spatial intelligence: layout extraction, field candidates, and localization.

Outputs are advisory workflow metadata only — never merged into proof / signed artifacts.
"""

from backend.document_layout.pipeline import run_layout_analysis

__all__ = ["run_layout_analysis"]
