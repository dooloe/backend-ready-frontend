"""Update only the existing production admin password on Render PostgreSQL."""

import hmac
import os
from getpass import getpass

from sqlalchemy import delete, or_, select
from sqlalchemy.engine import make_url

from app.auth import hash_password, verify_password
from app.database import Database
from app.orm import SessionRow, UserRow
from app.settings import Settings


def _render_database_url() -> str:
    value = os.getenv("DATABASE_URL")
    if not value:
        value = getpass("Render kezek-db External Database URL: ")
    settings = Settings.from_environment(database_url=value)
    url = make_url(settings.database_url)
    if (
        settings.environment != "production"
        or settings.seed_demo
        or url.get_backend_name() != "postgresql"
        or url.database != "kezek"
        or not (url.host or "").lower().endswith(".render.com")
    ):
        raise SystemExit(
            "Expected APP_ENV=production, SEED_DEMO_DATA=false, and the "
            "Render External Database URL for database kezek; no changes made."
        )
    return settings.database_url


def _existing_admin(database: Database) -> UserRow:
    with database.session() as session:
        rows = list(session.scalars(
            select(UserRow)
            .where(or_(UserRow.username == "admin", UserRow.role == "admin"))
            .order_by(UserRow.username, UserRow.id)
        ))
    if not rows:
        raise SystemExit(
            "No existing account named admin and no admin-role accounts were found; "
            "no changes made. Use the production bootstrap to create the first admin."
        )

    print(f"Found {len(rows)} matching account(s):")
    for row in rows:
        print(
            f"id={row.id!r} username={row.username!r} role={row.role!r} "
            f"active={str(row.is_active).lower()}"
        )

    if len(rows) == 1 and rows[0].username == "admin":
        admin = rows[0]
    else:
        selection = input("Select the exact username or account ID to update (blank cancels): ").strip()
        if not selection:
            raise SystemExit("No account selected; no changes made.")
        matches = [row for row in rows if row.username == selection or row.id == selection]
        if len(matches) != 1:
            raise SystemExit("Selection did not identify exactly one account; no changes made.")
        admin = matches[0]

    if admin.role != "admin" or not admin.is_active:
        raise SystemExit("Selected account must be active and have role admin; no changes made.")
    return admin


def main() -> None:
    database_url = _render_database_url()
    try:
        database = Database(database_url)
    except ModuleNotFoundError as exc:
        module = exc.name
        if not module or any(not (char.isalnum() or char in "_.") for char in module):
            module = "unknown"
        raise SystemExit(
            f"Missing Python module '{module}' in this environment; install "
            "backend/requirements.txt there. No changes made."
        ) from None
    except Exception as exc:
        raise SystemExit(
            f"Could not connect to the configured Render database ({type(exc).__name__}); "
            "no changes made."
        ) from None

    try:
        admin = _existing_admin(database)
        password = getpass("New admin password (12+ characters): ")
        confirmation = getpass("Confirm new admin password: ")
        if len(password) < 12:
            raise SystemExit("Password must contain at least 12 characters; no changes made.")
        if not hmac.compare_digest(password, confirmation):
            raise SystemExit("Passwords do not match; no changes made.")

        password_hash = hash_password(password)
        if not verify_password(password, password_hash):
            raise SystemExit("Password verification failed; no changes made.")

        with database.session(write=True) as session:
            current = session.scalar(
                select(UserRow)
                .where(UserRow.id == admin.id, UserRow.username == admin.username)
                .with_for_update()
            )
            if current is None or current.role != "admin" or not current.is_active:
                raise SystemExit("Admin account changed during update; no changes made.")
            current.password_hash = password_hash
            session.execute(delete(SessionRow).where(SessionRow.user_id == current.id))
            if not verify_password(password, current.password_hash):
                raise SystemExit("Stored password verification failed; update rolled back.")

        print("Updated the existing admin password and revoked its active sessions.")
    finally:
        database.engine.dispose()


if __name__ == "__main__":
    main()
