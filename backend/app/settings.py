"""Validated startup configuration; connection credentials never appear in repr."""

from dataclasses import dataclass, field
import os
from pathlib import Path
from urllib.parse import urlsplit

from sqlalchemy.engine import make_url


def _validated_database_url(value: str) -> str:
    try:
        parsed = make_url(value)
        if not parsed.drivername or (parsed.get_backend_name() == "sqlite" and parsed.database in {None, ""}) or (parsed.get_backend_name() != "sqlite" and not parsed.database):
            raise ValueError()
    except Exception:
        # SQLAlchemy parsing errors may quote a password-bearing URL.
        raise ValueError("DATABASE_URL must be a valid SQLAlchemy connection URL") from None
    return value


def database_url_from_environment() -> str:
    default = "sqlite:///" + str(Path(__file__).resolve().parents[1] / "data" / "kezek.db")
    value = os.environ.get("DATABASE_URL", default)
    if not value.strip():
        raise ValueError("DATABASE_URL must not be empty")
    return _validated_database_url(value)


def boolean_setting(name: str, default: str) -> bool:
    value = os.getenv(name, default).strip().lower()
    if value not in {"true", "false", "1", "0"}:
        raise ValueError(f"{name} must be true or false")
    return value in {"true", "1"}


def origin_settings() -> tuple[str, ...]:
    origins = []
    for value in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","):
        value = value.strip()
        if not value:
            continue
        try:
            parsed = urlsplit(value)
            valid = (parsed.scheme in {"http", "https"} and parsed.hostname
                     and not parsed.username and not parsed.password
                     and parsed.path in {"", "/"} and not parsed.query and not parsed.fragment)
            parsed.port  # Reject malformed ports without reflecting their value.
        except ValueError:
            valid = False
        if not valid:
            raise ValueError("CORS_ORIGINS must contain explicit HTTP(S) origins without credentials or paths")
        origins.append(value.rstrip("/"))
    return tuple(dict.fromkeys(origins))


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str = field(repr=False)
    seed_demo: bool
    cors_origins: tuple[str, ...]
    environment: str

    @classmethod
    def from_environment(cls, database_url: str | None = None):
        environment = os.getenv("APP_ENV", "development").strip().lower()
        if environment not in {"development", "test", "production"}:
            raise ValueError("APP_ENV must be development, test or production")
        seed = boolean_setting("SEED_DEMO_DATA", "true")
        if environment == "production" and seed:
            raise ValueError("SEED_DEMO_DATA must be false in production")
        # Overrides are validated without temporarily mutating process environment.
        effective_database_url = (_validated_database_url(database_url) if database_url is not None
                                  else database_url_from_environment())
        return cls(effective_database_url,
                   seed, origin_settings(), environment)
