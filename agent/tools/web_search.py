import asyncio
import json
import logging
import os
from datetime import timedelta
from typing import Any
from urllib.parse import urlsplit

from exa_py import Exa
from langchain_mcp_adapters.client import MultiServerMCPClient
from mcp.types import CallToolResult

logger = logging.getLogger(__name__)

_PARALLEL_MCP_URL = "https://search.parallel.ai/mcp"
_USER_AGENT = "OpenSWE/0.1.0 (+https://github.com/junyius1/cover_center)"
_SEARCH_TIMEOUT_SECONDS = 30


def _mcp_json(result: CallToolResult) -> dict[str, Any]:
    text = "\n".join(block.text for block in result.content if block.type == "text")
    if result.isError:
        raise RuntimeError(text or "Parallel MCP tool failed")
    payload = result.structuredContent
    if payload is None:
        payload = json.loads(text)
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        raise ValueError("Parallel MCP returned an invalid results payload")
    return payload


async def _parallel_search(query: str, num_results: int, include_contents: bool) -> str:
    client = MultiServerMCPClient(
        {
            "parallel": {
                "transport": "streamable_http",
                "url": _PARALLEL_MCP_URL,
                "headers": {"User-Agent": _USER_AGENT},
                "timeout": timedelta(seconds=_SEARCH_TIMEOUT_SECONDS),
                "sse_read_timeout": timedelta(seconds=_SEARCH_TIMEOUT_SECONDS),
            }
        }
    )
    async with client.session("parallel") as session:
        search = _mcp_json(
            await session.call_tool("web_search", {"objective": query, "search_queries": [query]})
        )
        results = search["results"][:num_results]
        urls = []
        for result in results:
            if not isinstance(result, dict) or not isinstance(result.get("url"), str):
                raise ValueError("Parallel MCP returned an invalid search result")
            parsed = urlsplit(result["url"])
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                raise ValueError("Parallel MCP returned an invalid result URL")
            urls.append(result["url"])
        search["results"] = results
        if include_contents and urls:
            search["contents"] = _mcp_json(
                await session.call_tool(
                    "web_fetch",
                    {
                        "urls": urls,
                        "objective": query[:200],
                        "search_queries": [query],
                        "full_content": True,
                    },
                )
            )
        elif not include_contents:
            search["results"] = [
                {
                    key: value
                    for key, value in result.items()
                    if key not in {"excerpts", "full_content"}
                }
                for result in results
            ]
        return json.dumps(search, ensure_ascii=False)


async def web_search(
    query: str,
    num_results: int = 5,
    include_contents: bool = True,
) -> dict[str, Any]:
    """Search the web for documentation, code examples, news, or research.

    Uses Parallel Search MCP without an account or API key by default. A configured
    EXA_API_KEY keeps Exa selected. WEB_SEARCH_PROVIDER can explicitly select
    parallel, exa, or none (disabled). Provider failures never trigger a fallback.

    Args:
        query: The search query
        num_results: Number of results to return, from 1 to 20 (default: 5)
        include_contents: Whether to include full page contents (default: True)

    Returns:
        Dictionary containing:
        - success: Whether the search succeeded
        - results: Search results as text, including source URLs
        - error: Error message if something failed
    """
    try:
        api_key = os.environ.get("EXA_API_KEY")
        provider = os.environ.get("WEB_SEARCH_PROVIDER", "").strip().lower()
        provider = provider or ("exa" if api_key else "parallel")
        if provider == "none":
            raise ValueError("Web search is disabled by WEB_SEARCH_PROVIDER=none")
        if provider not in {"exa", "parallel"}:
            raise ValueError("WEB_SEARCH_PROVIDER must be parallel, exa, or none")
        if not query.strip():
            raise ValueError("query must not be empty")
        if type(num_results) is not int or not 1 <= num_results <= 20:
            raise ValueError("num_results must be an integer from 1 to 20")
        async with asyncio.timeout(_SEARCH_TIMEOUT_SECONDS):
            if provider == "parallel":
                results = await _parallel_search(query, num_results, include_contents)
            else:
                if not api_key:
                    raise ValueError("EXA_API_KEY is not configured for WEB_SEARCH_PROVIDER=exa")
                client = Exa(api_key=api_key)
                if include_contents:
                    result = await asyncio.to_thread(
                        client.search_and_contents,
                        query,
                        text=True,
                        num_results=num_results,
                        type="auto",
                    )
                else:
                    result = await asyncio.to_thread(
                        client.search, query, num_results=num_results, type="auto"
                    )
                results = str(result)
        return {"success": True, "results": results, "error": None}
    except Exception as e:
        logger.exception("web_search failed")
        return {"success": False, "results": None, "error": f"{type(e).__name__}: {e}"}
