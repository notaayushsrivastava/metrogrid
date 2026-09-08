"""Root FastAPI entrypoint for Vercel (Python runtime).

Vercel auto-detects a FastAPI app at the repo root (``main.py``) and also lets
``api/*`` expose Python serverless functions. This module simply re-exports the
MetroGrid app so both entrypoints serve the identical backend. Static files
(e.g. the built Vite SPA in ``public/``) are served by the Vercel static engine
via ``vercel.json`` routes, not by this app.
"""

import os
import sys

_BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.main import app  # noqa: E402,F401

__all__ = ["app", "asgi_app"]

# Expose under the conventional ASGI name Vercel resolves for Python.
asgi_app = app