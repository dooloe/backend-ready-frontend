"""Salted scrypt passwords and opaque bearer sessions; no plaintext secrets stored."""

import hashlib
import hmac
import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .models import StaffUser


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=32768, r=8, p=1, dklen=32, maxmem=67108864
    )
    return f"scrypt$32768$8$1${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
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
