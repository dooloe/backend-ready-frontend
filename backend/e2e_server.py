"""Real HTTP browser fixture; never opens the development database."""
import os
from pathlib import Path
from tempfile import TemporaryDirectory

import uvicorn
from app.main import create_app
from app.store import DatabaseStore
from seed_directory import seed

if __name__ == '__main__':
    with TemporaryDirectory(prefix='kezek-browser-') as directory:
        os.environ['DATABASE_URL'] = f"sqlite:///{Path(directory) / 'browser.db'}"
        os.environ['SEED_DEMO_DATA'] = 'true'
        os.environ['CORS_ORIGINS'] = 'http://127.0.0.1:15173'
        store = DatabaseStore(seed_tickets=False)
        seed(store)
        try:
            uvicorn.run(create_app(store), host='127.0.0.1', port=18765, access_log=False)
        finally:
            store.close()
