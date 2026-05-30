"""Shared pytest fixtures for the backend test suite.

Provides an in-process FastAPI ``AsyncClient`` so tests can exercise the API
without binding to a network port. The FastAPI ``app`` is imported from
``backend.server``; that module already calls ``app.include_router(api_router)``
at import time, so the client sees every route under the ``/api`` prefix.

The ``sys.path`` shim makes the conftest work whether pytest is invoked from the
repository root (``pytest backend``) or from inside ``backend/`` (``pytest``).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import AsyncIterator

# Ensure the repository root is on sys.path so ``import backend.server`` works
# regardless of the directory pytest is launched from.
_BACKEND_DIR = Path(__file__).resolve().parent.parent  # .../backend
_REPO_ROOT = _BACKEND_DIR.parent                       # repo root
for _candidate in (_REPO_ROOT, _BACKEND_DIR):
    _candidate_str = str(_candidate)
    if _candidate_str not in sys.path:
        sys.path.insert(0, _candidate_str)

import httpx
import pytest_asyncio

# Import the fully-configured FastAPI app. ``backend/server.py`` registers
# ``api_router`` (prefix ``/api``) on ``app`` at module import time, so no
# additional ``include_router`` call is needed here.
from backend.server import app  # noqa: E402  (import after sys.path tweak)


@pytest_asyncio.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    """Yield an in-process AsyncClient bound to the FastAPI app.

    Uses ``httpx.ASGITransport`` so requests are dispatched directly to the
    ASGI application without opening a TCP socket. ``base_url`` is a stable
    placeholder used only for URL resolution.
    """
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
