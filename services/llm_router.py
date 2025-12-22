# backend/services/llm_router.py

"""
Stub LLM router for future use.

Right now, the extraction pipeline only uses simple regex-based
clause splitting. When you're ready, you can plug in OpenAI or
another provider here and call it from extraction_service.
"""


def call_legal_llm(prompt: str) -> str:
    """
    Placeholder function for an LLM call.
    Currently just echoes the prompt back.
    """
    return prompt
