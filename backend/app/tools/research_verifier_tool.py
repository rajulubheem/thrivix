"""
Research Verifier Tool
Checks the synthesized content against provided sources and flags weak citations.
Returns a JSON string with verification notes.
"""
from strands import tool
from typing import Any, List, Dict
from .use_llm_wrapper import use_llm_with_model
import json

@tool
def research_verifier(content: str, sources: List[Dict[str, Any]]) -> str:
    """Verify synthesized content against the ordered sources.

    Args:
        content: Final synthesized markdown content.
        sources: Ordered list of sources (dicts with title, url, snippet, domain).

    Returns:
        JSON string: {
          "weak_citations": [int],
          "missing_citations": ["..."],
          "notes": ["..."],
          "flagged_urls": ["..."]
        }
    """
    try:
        # Build a compact sources block
        lines = []
        for idx, s in enumerate(sources, 1):
            title = s.get('title','Untitled')
            url = s.get('url','')
            snippet = (s.get('snippet') or '')[:200]
            lines.append(f"[{idx}] {title} ({url}) :: {snippet}")
        src_block = "\n".join(lines)

        prompt = (
            "You are a meticulous verifier. Review the content against the ordered sources.\n"
            "- Identify any claims that appear weakly supported or not supported by the sources.\n"
            "- If possible, identify which citation numbers look weak.\n"
            "- Output STRICT JSON with keys: weak_citations (array of ints), missing_citations (array of strings), notes (array of strings), flagged_urls (array of strings).\n\n"
            f"CONTENT:\n{content}\n\nSOURCES (ordered):\n{src_block}\n\nJSON_ONLY:"
        )
        text = use_llm_with_model(prompt, system_prompt="You output JSON only.")
        # Ensure valid JSON string
        try:
            json.loads(text)
        except Exception:
            text = json.dumps({"weak_citations":[],"missing_citations":[],"notes":["Verifier could not parse results"],"flagged_urls":[]})
        return text
    except Exception as e:
        return json.dumps({"weak_citations":[],"missing_citations":[],"notes":[f"Verifier error: {e}"],"flagged_urls":[]})

