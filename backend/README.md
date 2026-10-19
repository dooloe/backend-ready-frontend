# Kezek backend scaffold

This is the empty FastAPI foundation for issue #1. It exposes built-in API
documentation only; authentication, queue operations and persistence are not
implemented yet.

Use Python 3.12 or newer with pip/venv support. From the repository root:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
backend/.venv/bin/python -m pytest backend/tests -q
backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --reload
```

Open `http://127.0.0.1:8000/docs` for API documentation or
`http://127.0.0.1:8000/openapi.json` for the empty schema. Stop the server with
Ctrl+C. The existing frontend runs separately and still uses mocks.

`requirements.in` declares direct development dependencies; `requirements.txt`
pins the resolved versions verified for the scaffold. To deliberately update
the lock, use a fresh environment, install `-r backend/requirements.in`, run
the test, then capture `python -m pip freeze` to `backend/requirements.txt`.
Do not commit the virtual environment or credentials.
