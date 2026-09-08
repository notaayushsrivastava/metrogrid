"""Vercel serverless entrypoint for the MetroGrid FastAPI backend.

Vercel's Python runtime imports this module at ``/api/*`` and uses the ASGI
app as the request handler. We re-export the exact FastAPI app from
``backend.app.main`` so the deployed behavior is identical to local dev.

Note: Vercel needs ``backend`` on ``sys.path``. The bundler handles this by
COPYING the ``backend`` package into the function working directory (see
``vercel.json`` ``builds`` for the root include), so ``from app.main import
app`` resolves. ``backend/requirements.txt`` is the install manifest.
"""

import os
import sys

# Ensure the backend package is importable regardless of cwd.
_BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.main import app as app  # noqa: E402,F401  (re-export for Vercel ASGI)

asgi_app = app