"""Argon2id passwords, legacy scrypt verification and opaque bearer sessions."""

import hashlib
import hmac
import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from argon2.low_level import Type as Argon2Type

from .models import StaffUser


_PASSWORD_HASHER = PasswordHasher(
    time_cost=3, memory_cost=65536, parallelism=2, hash_len=32, salt_len=16,
    type=Argon2Type.ID,
)


def hash_password(password: str) -> str:
    """Hash new passwords with Argon2id and an independent random salt."""
    return _PASSWORD_HASHER.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    if encoded.startswith("$argon2id$"):
        try:
            return _PASSWORD_HASHER.verify(encoded, password)
        except (VerifyMismatchError, VerificationError, InvalidHashError, ValueError):
            return False

    # Existing database rows use the former scrypt format. Continue accepting
    # those accounts while new seed and password writes use Argon2id.
    try:
        algorithm, n, r, p, salt, expected = encoded.split("$")
        if algorithm != "scrypt":
            return False
        actual = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r),
            p=int(p), dklen=32, maxmem=67108864,
        )
        return hmac.compare_digest(actual, bytes.fromhex(expected))
    except (ValueError, TypeError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


bearer = HTTPBearer(auto_error=False, scheme_name="BearerAuth")


def current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> StaffUser:
    user = None
    if credentials is not None:
        user = request.app.state.store.authenticate(credentials.credentials)
    if user is None:
        raise HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    return user


def require_staff(user: Annotated[StaffUser, Depends(current_user)]) -> StaffUser:
    # Both roles can operate staff endpoints in the existing contract.
    return user


def require_admin(user: Annotated[StaffUser, Depends(current_user)]) -> StaffUser:
    if user.role != "admin":
        raise HTTPException(403, "Admins only")
    return user
