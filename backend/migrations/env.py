"""Alembic environment; application startup supplies its configured connection."""

import os

from alembic import context

from app.database import Database
from app.orm import Base

config = context.config
target_metadata = Base.metadata


def run_migrations_offline():
    url = os.getenv("DATABASE_URL", config.get_main_option("sqlalchemy.url"))
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_as_batch=url.startswith("sqlite:"),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connection = config.attributes.get("connection")
    if connection is not None:
        _run_with_connection(connection)
        return

    database = Database(os.getenv("DATABASE_URL", config.get_main_option("sqlalchemy.url")))
    try:
        with database.engine.connect() as connection:
            _run_with_connection(connection)
    finally:
        database.close()


def _run_with_connection(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
