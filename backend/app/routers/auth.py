from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from ..auth import current_user
from ..models import LoginRequest, LoginResponse, StaffUser
from ..store import DatabaseStore, get_store

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/login", response_model=LoginResponse, operation_id="login")
def login(body: LoginRequest, store: Annotated[DatabaseStore, Depends(get_store)],
          request: Request, response: Response):
    result = store.login(body)
    secure_setting = request.app.state.settings.session_cookie_secure
    response.set_cookie(
        "kezek_session", result.token, max_age=8 * 60 * 60, path="/api",
        secure=request.url.scheme == "https" if secure_setting is None else secure_setting,
        httponly=True, samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"
    return result


@router.get("/me", response_model=StaffUser, operation_id="getCurrentIdentity")
def get_current_identity(user: Annotated[StaffUser, Depends(current_user)], response: Response):
    response.headers["Cache-Control"] = "no-store"
    return user
