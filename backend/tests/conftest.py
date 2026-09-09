"""Global pytest fixtures for backend tests."""

import pytest
import app.api.layouts as layout_routes


@pytest.fixture(autouse=True)
def _isolate_test_env(monkeypatch):
    """Ensure tests run in in-memory mode by default unless overridden."""
    original_url = layout_routes.store.url
    original_key = layout_routes.store.key
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    layout_routes.store.url = ""
    layout_routes.store.key = ""
    yield
    layout_routes.store.url = original_url
    layout_routes.store.key = original_key

