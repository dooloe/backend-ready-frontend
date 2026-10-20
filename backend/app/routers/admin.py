from typing import Annotated

from fastapi import APIRouter, Depends, Response

from ..auth import require_admin
from ..models import (
    Counter, CounterCreate, CounterUpdate, Service, ServiceCreate, ServiceUpdate,
    StaffCreate, StaffUser, Stats,
)
from ..store import DatabaseStore, get_store

router = APIRouter(prefix="/api/admin", tags=["Admin"], dependencies=[Depends(require_admin)])
Store = Annotated[DatabaseStore, Depends(get_store)]
roles = {"x-required-roles": ["admin"]}


@router.post("/services", response_model=Service, operation_id="createService", openapi_extra=roles)
def create_service(body: ServiceCreate, store: Store):
    return store.create_service(body)


@router.patch("/services/{serviceId}", response_model=Service, operation_id="updateService", openapi_extra=roles)
def update_service(serviceId: str, body: ServiceUpdate, store: Store):
    return store.update_service(serviceId, body.model_dump(exclude_unset=True))


@router.delete("/services/{serviceId}", status_code=204, operation_id="deleteService", openapi_extra=roles)
def delete_service(serviceId: str, store: Store) -> Response:
    store.delete_service(serviceId)
    return Response(status_code=204)


@router.post("/counters", response_model=Counter, operation_id="createCounter", openapi_extra=roles)
def create_counter(body: CounterCreate, store: Store):
    return store.create_counter(body)


@router.patch("/counters/{counterId}", response_model=Counter, operation_id="updateCounter", openapi_extra=roles)
def update_counter(counterId: str, body: CounterUpdate, store: Store):
    return store.update_counter(counterId, body.model_dump(exclude_unset=True))


@router.delete("/counters/{counterId}", status_code=204, operation_id="deleteCounter", openapi_extra=roles)
def delete_counter(counterId: str, store: Store) -> Response:
    store.delete_counter(counterId)
    return Response(status_code=204)


@router.get("/staff", response_model=list[StaffUser], operation_id="listStaff", openapi_extra=roles)
def list_staff(store: Store):
    return store.list_staff()


@router.post("/staff", response_model=StaffUser, operation_id="createStaff", openapi_extra=roles)
def create_staff(body: StaffCreate, store: Store):
    return store.create_staff(body)


@router.get("/stats", response_model=Stats, operation_id="getStats", openapi_extra=roles)
def stats(store: Store):
    return store.stats()
