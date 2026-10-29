from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from ..auth import (CSRF_COOKIE_NAME, SESSION_COOKIE_NAME, current_user,
                    request_session_token)
from ..models import CsrfTokenResponse, LoginRequest, LoginResponse, StaffUser
from ..store import DatabaseStore, get_store

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/login", response_model=LoginResponse, operation_id="login")
def login(body: LoginRequest, store: Annotated[DatabaseStore, Depends(get_store)],
          request: Request, response: Response):
    origin = request.headers.get("origin")
    settings = request.app.state.settings
    own_origin = f"{request.url.scheme}://{request.url.netloc}"
    trusted_origins = set(settings.cors_origins) | {own_origin}
    if origin is not None and origin.rstrip("/") not in trusted_origins:
        raise HTTPException(403, "Origin is not allowed")

    result, csrf_token = store.login_with_csrf(body)
    secure_setting = request.app.state.settings.session_cookie_secure
    secure = request.url.scheme == "https" if secure_setting is None else secure_setting
    response.set_cookie(
        SESSION_COOKIE_NAME, result.token, max_age=8 * 60 * 60, path="/api",
        secure=secure,
        httponly=True, samesite="lax",
    )
    response.set_cookie(
        CSRF_COOKIE_NAME, csrf_token, max_age=8 * 60 * 60, path="/",
        secure=secure, httponly=False, samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"
    return result


@router.get("/me", response_model=StaffUser, operation_id="getCurrentIdentity")
def get_current_identity(user: Annotated[StaffUser, Depends(current_user)], response: Response):
    response.headers["Cache-Control"] = "no-store"
    return user


@router.get("/csrf", response_model=CsrfTokenResponse, operation_id="getCsrfToken")
def get_csrf_token(request: Request, store: Annotated[DatabaseStore, Depends(get_store)],
                   user: Annotated[StaffUser, Depends(current_user)], response: Response):
    session_token = request_session_token(request)
    csrf_token = request.cookies.get(CSRF_COOKIE_NAME)
    if session_token is None or not store.verify_csrf(session_token, csrf_token, csrf_token):
        raise HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    response.headers["Cache-Control"] = "no-store"
    return CsrfTokenResponse(csrfToken=csrf_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, operation_id="logout")
def logout(request: Request, store: Annotated[DatabaseStore, Depends(get_store)],
           user: Annotated[StaffUser, Depends(current_user)], response: Response):
    session_token = request_session_token(request)
    if session_token is None or not store.logout(session_token):
        raise HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    cookie_token = request.cookies.get(SESSION_COOKIE_NAME)
    if cookie_token and cookie_token != session_token:
        store.logout(cookie_token)
    secure_setting = request.app.state.settings.session_cookie_secure
    secure = request.url.scheme == "https" if secure_setting is None else secure_setting
    response.delete_cookie(SESSION_COOKIE_NAME, path="/api", secure=secure,
                           httponly=True, samesite="lax")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/", secure=secure,
                           httponly=False, samesite="lax")
    response.headers["Cache-Control"] = "no-store"
