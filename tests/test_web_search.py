from __future__ import annotations

import asyncio
import importlib
import json
from unittest.mock import AsyncMock

import httpx
import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult

search_module = importlib.import_module("agent.tools.web_search")
SOURCE_URL = "https://docs.python.org/3/library/asyncio-task.html"


@pytest.fixture(autouse=True)
def isolated_search_environment(monkeypatch):
    for key in ("EXA_API_KEY", "PARALLEL_API_KEY", "WEB_SEARCH_PROVIDER"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("LANGSMITH_TRACING", "false")
    monkeypatch.setenv("LANGCHAIN_TRACING_V2", "false")


@pytest.fixture
def mcp_endpoint(monkeypatch):
    """Run the real MCP session/HTTP transport against a deterministic server."""
    state = {
        "requests": [],
        "search": {
            "results": [{"url": SOURCE_URL, "title": "Task groups", "excerpts": ["Snippet"]}]
        },
        "fetch": {
            "results": [{"url": SOURCE_URL, "full_content": "TaskGroup cancels sibling tasks."}]
        },
        "started": asyncio.Event(),
        "closed": asyncio.Event(),
    }

    async def respond(request):
        state["requests"].append(request)
        if request.method != "POST":
            return httpx.Response(405)
        rpc = json.loads(request.content)
        method = rpc["method"]
        if method.startswith("notifications/"):
            return httpx.Response(202)
        if method == "initialize":
            result = {
                "protocolVersion": rpc["params"]["protocolVersion"],
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "search-fixture", "version": "1"},
            }
        elif method == "tools/list":
            result = {
                "tools": [
                    {"name": name, "inputSchema": {"type": "object"}}
                    for name in ("web_search", "web_fetch")
                ]
            }
        else:
            assert method == "tools/call"
            if state.get("wait"):
                state["started"].set()
                try:
                    await asyncio.Event().wait()
                finally:
                    state["closed"].set()
            if state.get("status"):
                return httpx.Response(state["status"], text="Provider unavailable")
            payload = state["search"] if rpc["params"]["name"] == "web_search" else state["fetch"]
            result = {
                "content": [{"type": "text", "text": json.dumps(payload)}],
                "isError": state.get("is_error", False),
            }
            if state.get("structured"):
                result["structuredContent"] = payload
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": rpc["id"], "result": result})

    real_client = search_module.MultiServerMCPClient

    def client(connections):
        def http_client_factory(headers=None, timeout=None, auth=None):
            return httpx.AsyncClient(
                headers=headers, timeout=timeout, auth=auth, transport=httpx.MockTransport(respond)
            )

        connections["parallel"]["httpx_client_factory"] = http_client_factory
        return real_client(connections)

    monkeypatch.setattr(search_module, "MultiServerMCPClient", client)
    return state


def _calls(state):
    return [
        json.loads(request.content)["params"]
        for request in state["requests"]
        if request.method == "POST" and json.loads(request.content)["method"] == "tools/call"
    ]


async def test_anonymous_search_and_fetch_use_real_transport(mcp_endpoint):
    result = await search_module.web_search("Python TaskGroup cancellation", num_results=1)
    assert result["success"] is True
    data = json.loads(result["results"])
    assert data["results"][0]["url"] == SOURCE_URL
    assert data["contents"]["results"][0]["full_content"] == "TaskGroup cancels sibling tasks."
    calls = _calls(mcp_endpoint)
    assert calls == [
        {
            "name": "web_search",
            "arguments": {
                "objective": "Python TaskGroup cancellation",
                "search_queries": ["Python TaskGroup cancellation"],
            },
        },
        {
            "name": "web_fetch",
            "arguments": {
                "urls": [SOURCE_URL],
                "objective": "Python TaskGroup cancellation",
                "search_queries": ["Python TaskGroup cancellation"],
                "full_content": True,
            },
        },
    ]
    methods = []
    for request in mcp_endpoint["requests"]:
        assert str(request.url) == "https://search.parallel.ai/mcp"
        assert request.headers["user-agent"] == search_module._USER_AGENT
        assert "authorization" not in request.headers
        if request.method == "POST":
            methods.append(json.loads(request.content)["method"])
    assert "initialize" in methods and "tools/list" in methods


@pytest.mark.parametrize("structured", [True, False])
async def test_limit_and_no_contents(mcp_endpoint, structured):
    mcp_endpoint["structured"] = structured
    mcp_endpoint["search"]["results"] *= 3
    result = await search_module.web_search("Python TaskGroup docs", 2, False)
    assert result["success"] is True
    results = json.loads(result["results"])["results"]
    assert len(results) == 2
    assert all("excerpts" not in result for result in results)
    assert len(_calls(mcp_endpoint)) == 1


@pytest.mark.parametrize("include_contents", [True, False])
async def test_configured_exa_preserves_mode_and_arguments(
    monkeypatch, mcp_endpoint, include_contents
):
    calls = []

    class Exa:
        def __init__(self, *, api_key):
            assert api_key == "configured-exa-key"

        def search_and_contents(self, *args, **kwargs):
            calls.append(("contents", args, kwargs))
            return "Exa page contents"

        def search(self, *args, **kwargs):
            calls.append(("search", args, kwargs))
            return "Exa links"

    monkeypatch.setenv("EXA_API_KEY", "configured-exa-key")
    monkeypatch.setattr(search_module, "Exa", Exa)
    result = await search_module.web_search("Python TaskGroup docs", 3, include_contents)
    assert result == {
        "success": True,
        "results": "Exa page contents" if include_contents else "Exa links",
        "error": None,
    }
    assert calls == [
        (
            "contents" if include_contents else "search",
            ("Python TaskGroup docs",),
            {"num_results": 3, "type": "auto", **({"text": True} if include_contents else {})},
        )
    ]
    assert mcp_endpoint["requests"] == []


async def test_explicit_parallel_overrides_exa_key(monkeypatch, mcp_endpoint):
    monkeypatch.setenv("EXA_API_KEY", "configured-exa-key")
    monkeypatch.setenv("WEB_SEARCH_PROVIDER", "parallel")
    assert (await search_module.web_search("Python TaskGroup docs", include_contents=False))[
        "success"
    ]
    assert len(_calls(mcp_endpoint)) == 1


@pytest.mark.parametrize(
    "provider, expected", [("none", "disabled"), ("exa", "EXA_API_KEY"), ("typo", "must be")]
)
async def test_explicit_disabled_missing_key_and_invalid_provider(
    monkeypatch, mcp_endpoint, provider, expected
):
    monkeypatch.setenv("WEB_SEARCH_PROVIDER", provider)
    result = await search_module.web_search("Python TaskGroup docs")
    assert result["success"] is False
    assert expected in result["error"]
    assert mcp_endpoint["requests"] == []


async def test_exa_failure_does_not_fall_back(monkeypatch, mcp_endpoint):
    class Exa:
        def __init__(self, **kwargs):
            raise RuntimeError("Exa failed")

    monkeypatch.setenv("EXA_API_KEY", "configured-exa-key")
    monkeypatch.setenv("WEB_SEARCH_PROVIDER", "exa")
    monkeypatch.setattr(search_module, "Exa", Exa)
    result = await search_module.web_search("Python TaskGroup docs")
    assert result["success"] is False and "Exa failed" in result["error"]
    assert mcp_endpoint["requests"] == []


async def test_disabled_search_preserves_configured_key(monkeypatch, mcp_endpoint):
    monkeypatch.setenv("EXA_API_KEY", "configured-exa-key")
    monkeypatch.setenv("WEB_SEARCH_PROVIDER", "none")
    result = await search_module.web_search("Python TaskGroup docs")
    assert result["success"] is False and "disabled" in result["error"]
    assert mcp_endpoint["requests"] == []


@pytest.mark.parametrize("query, count", [(" ", 5), ("docs", 0), ("docs", 21)])
async def test_invalid_arguments_make_no_request(mcp_endpoint, query, count):
    result = await search_module.web_search(query, count)
    assert result["success"] is False
    assert mcp_endpoint["requests"] == []


async def test_empty_search_skips_fetch(mcp_endpoint):
    mcp_endpoint["search"] = {"results": []}
    result = await search_module.web_search("Python TaskGroup docs")
    assert result["success"] is True
    assert json.loads(result["results"])["results"] == []
    assert len(_calls(mcp_endpoint)) == 1


async def test_partial_extraction_errors_remain_visible(mcp_endpoint):
    mcp_endpoint["fetch"] = {"results": [], "errors": [{"url": SOURCE_URL, "error": "Unavailable"}]}
    result = await search_module.web_search("Python TaskGroup docs")
    assert result["success"] is True
    data = json.loads(result["results"])
    assert data["results"][0]["url"] == SOURCE_URL
    assert data["contents"]["errors"][0]["error"] == "Unavailable"


@pytest.mark.parametrize(
    "settings",
    [
        {"status": 401},
        {"status": 429},
        {"is_error": True},
        {"search": {"invalid": []}},
        {"search": {"results": [{"url": "file:///etc/passwd"}]}},
    ],
)
async def test_provider_and_payload_errors_are_not_success(mcp_endpoint, settings):
    mcp_endpoint.update(settings)
    result = await search_module.web_search("Python TaskGroup docs")
    assert result["success"] is False
    assert result["results"] is None and result["error"]
    assert len(_calls(mcp_endpoint)) == 1


async def test_timeout_closes_request(monkeypatch, mcp_endpoint):
    mcp_endpoint["wait"] = True
    monkeypatch.setattr(search_module, "_SEARCH_TIMEOUT_SECONDS", 0.05)
    result = await search_module.web_search("Python TaskGroup docs")
    assert result["success"] is False and "TimeoutError" in result["error"]
    assert mcp_endpoint["closed"].is_set()


async def test_cancellation_propagates_and_closes_request(mcp_endpoint):
    mcp_endpoint["wait"] = True
    task = asyncio.create_task(search_module.web_search("Python TaskGroup docs"))
    await asyncio.wait_for(mcp_endpoint["started"].wait(), timeout=2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert mcp_endpoint["closed"].is_set()


class _SearchModel(BaseChatModel):
    search_visible: bool = True

    @property
    def _llm_type(self):
        return "scripted-search-consumer"

    def bind_tools(self, tools, **kwargs):
        self.search_visible = any(getattr(tool, "name", None) == "web_search" for tool in tools)
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        if isinstance(messages[-1], ToolMessage):
            payload = json.loads(messages[-1].content)
            if payload["success"]:
                result = json.loads(payload["results"])
                content = result["contents"]["results"][0]["full_content"]
                answer = f"{content} Source: {result['results'][0]['url']}"
            else:
                answer = payload["error"]
            response = AIMessage(content=answer)
        elif not self.search_visible:
            response = AIMessage(content="Web search is not permitted.")
        else:
            response = AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "web_search",
                        "args": {"query": "Python TaskGroup docs", "num_results": 1},
                        "id": "search-1",
                    }
                ],
            )
        return ChatResult(generations=[ChatGeneration(message=response)])


@pytest.mark.parametrize("mode", ["normal", "disabled", "excluded"])
async def test_chat_factory_dispatches_search_and_consumes_results(monkeypatch, mcp_endpoint, mode):
    from agent import chat

    monkeypatch.setattr(chat, "graph_loaded_for_execution", lambda config: True)
    monkeypatch.setattr(chat, "get_github_app_installation_token", AsyncMock(return_value=None))
    monkeypatch.setattr(chat, "_resolve_chat_model", AsyncMock(return_value=("local:test", "none")))
    monkeypatch.setattr(chat, "make_model", lambda *args, **kwargs: _SearchModel())
    if mode == "disabled":
        monkeypatch.setenv("WEB_SEARCH_PROVIDER", "none")
    if mode == "excluded":
        monkeypatch.setattr(chat, "_EXCLUDED_TOOLS", chat._EXCLUDED_TOOLS | {"web_search"})
    graph = await chat.get_chat_agent(
        {"configurable": {"thread_id": "search-test", "chat_pr_number": 1}}
    )
    result = await graph.ainvoke({"messages": [{"role": "user", "content": "Find TaskGroup docs"}]})
    answer = result["messages"][-1].content
    if mode == "normal":
        assert "TaskGroup cancels sibling tasks." in answer and SOURCE_URL in answer
        assert len(_calls(mcp_endpoint)) == 2
    else:
        assert ("disabled" if mode == "disabled" else "not permitted") in answer
        assert mcp_endpoint["requests"] == []
