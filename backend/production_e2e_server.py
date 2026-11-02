"""Serve the production frontend build and test API from one local origin."""

from pathlib import Path
from tempfile import TemporaryDirectory
import os

import uvicorn

from app.main import create_app


if __name__ == "__main__":
    host = "127.0.0.1"
    port = 18080
    origin = f"http://{host}:{port}"
    static_dir = Path(__file__).resolve().parents[1] / "frontend" / ".output" / "public"
    if not (static_dir / "_shell.html").is_file():
        raise SystemExit("Build the production frontend before starting this test server.")

    with TemporaryDirectory(prefix="kezek-production-browser-") as directory:
        os.environ.update({
            "APP_ENV": "test",
            "SEED_DEMO_DATA": "true",
            "DATABASE_URL": f"sqlite:///{Path(directory) / 'production-browser.db'}",
            "FRONTEND_STATIC_DIR": str(static_dir),
            "CUSTOMER_ORIGIN": origin,
            "ADMIN_ORIGIN": origin,
            "CORS_ORIGINS": origin,
        })
        uvicorn.run(create_app(), host=host, port=port, access_log=False)
