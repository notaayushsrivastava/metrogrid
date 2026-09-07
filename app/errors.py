"""Shared error types (PRD §20.2).

``ApiError`` lets any layer raise an HTTP-flavored error with a safe message
and a status code; the FastAPI exception handler in ``main.py`` translates it
to a JSON response without leaking stack traces.
"""


class ApiError(Exception):
    """Internal error carrying an HTTP status code and safe message."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message

