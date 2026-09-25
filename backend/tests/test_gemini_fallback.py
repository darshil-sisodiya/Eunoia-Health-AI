"""A quota error on one Gemini model must fall through to the next one."""
from __future__ import annotations

import pytest
from google.api_core.exceptions import ResourceExhausted

import server


def _fake_models(monkeypatch, exhausted):
    tried = []

    class FakeModel:
        def __init__(self, model_name, **_):
            self.name = model_name

        async def generate_content_async(self, _contents):
            tried.append(self.name)
            if self.name in exhausted:
                raise ResourceExhausted('quota')
            return type('Resp', (), {'text': f' from {self.name} '})()

    monkeypatch.setattr(server.genai, 'GenerativeModel', FakeModel)
    monkeypatch.setattr(server, 'GEMINI_MODEL', 'primary')
    monkeypatch.setattr(server, 'GEMINI_FALLBACK_MODELS', ['primary', 'backup1', 'backup2'])
    return tried


async def test_falls_back_to_next_model_on_quota_error(monkeypatch):
    tried = _fake_models(monkeypatch, exhausted={'primary'})
    assert await server.gemini_generate('sys', 'hi') == 'from backup1'
    assert tried == ['primary', 'backup1']


async def test_raises_when_every_model_is_exhausted(monkeypatch):
    tried = _fake_models(monkeypatch, exhausted={'primary', 'backup1', 'backup2'})
    with pytest.raises(ResourceExhausted):
        await server.gemini_generate('sys', 'hi')
    assert tried == ['primary', 'backup1', 'backup2']
