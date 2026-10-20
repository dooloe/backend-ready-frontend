from typing import Annotated

from fastapi import APIRouter, Depends

from ..models import LoginRequest, LoginResponse
from ..store import DatabaseStore, get_store

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/login", response_model=LoginResponse, operation_id="login")
def login(body: LoginRequest, store: Annotated[DatabaseStore, Depends(get_store)]):
    return store.login(body)
