"""Real HTTP browser fixture; never opens the development database."""
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from datetime import datetime, timedelta, timezone

import uvicorn
from app.auth import token_hash
from app.main import create_app
from app.store import DatabaseStore
from app.orm import SessionRow
from seed_directory import seed

if __name__ == '__main__':
    with TemporaryDirectory(prefix='kezek-browser-') as directory:
        os.environ['DATABASE_URL'] = f"sqlite:///{Path(directory) / 'browser.db'}"
        os.environ['SEED_DEMO_DATA'] = 'true'
        os.environ['CORS_ORIGINS'] = 'http://127.0.0.1:15173'
        store = DatabaseStore(seed_tickets=False)
        seed(store)
        with store.db.session(write=True) as session:
            session.add(SessionRow(
                token_hash=token_hash("e2e-expired-session"),
                user_id="demo-staff-university",
                expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            ))
        try:
            uvicorn.run(create_app(store), host='127.0.0.1', port=18765, access_log=False)
        finally:
            store.close()
