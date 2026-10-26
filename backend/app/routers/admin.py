from typing import Annotated

from fastapi import APIRouter, Depends, Response

from ..auth import require_admin
from ..models import (
    Counter, CounterCreate, CounterUpdate, QueueOverride, QueueSummary, Service, ServiceCreate, ServiceUpdate,
    StaffCreate, StaffUpdate, StaffUser, Stats,
)
from ..store import DatabaseStore, get_store

router = APIRouter(prefix="/api/admin", tags=["Admin"], dependencies=[Depends(require_admin)])
Store = Annotated[DatabaseStore, Depends(get_store)]
AdminActor = Annotated[StaffUser, Depends(require_admin)]
roles = {"x-required-roles": ["admin"]}


@router.get("/services", response_model=list[Service], operation_id="listAdminServices", openapi_extra=roles)
def list_services(store: Store, actor: AdminActor):
    return store.list_admin_services(actor)


@router.post("/services", response_model=Service, operation_id="createService", openapi_extra=roles)
def create_service(body: ServiceCreate, store: Store, actor: AdminActor):
    return store.create_service(body, actor)


@router.patch("/services/{serviceId}", response_model=Service, operation_id="updateService", openapi_extra=roles)
def update_service(serviceId: str, body: ServiceUpdate, store: Store, actor: AdminActor):
    return store.update_service(serviceId, body.model_dump(exclude_unset=True), actor)


@router.delete("/services/{serviceId}", status_code=204, operation_id="deleteService", openapi_extra=roles)
def delete_service(serviceId: str, store: Store, actor: AdminActor) -> Response:
    store.delete_service(serviceId, actor)
    return Response(status_code=204)


@router.post("/counters", response_model=Counter, operation_id="createCounter", openapi_extra=roles)
def create_counter(body: CounterCreate, store: Store, actor: AdminActor):
    return store.create_counter(body, actor)


@router.patch("/counters/{counterId}", response_model=Counter, operation_id="updateCounter", openapi_extra=roles)
def update_counter(counterId: str, body: CounterUpdate, store: Store, actor: AdminActor):
    return store.update_counter(counterId, body.model_dump(exclude_unset=True), actor)


@router.delete("/counters/{counterId}", status_code=204, operation_id="deleteCounter", openapi_extra=roles)
def delete_counter(counterId: str, store: Store, actor: AdminActor) -> Response:
    store.delete_counter(counterId, actor)
    return Response(status_code=204)


@router.patch("/queues/{queueId}", response_model=QueueSummary,
              operation_id="setQueueOverride", openapi_extra=roles)
def set_queue_override(queueId: str, body: QueueOverride, store: Store, actor: AdminActor):
    return store.set_queue_override(queueId, body.isOpen, actor)


@router.get("/staff", response_model=list[StaffUser], operation_id="listStaff", openapi_extra=roles)
def list_staff(store: Store, actor: AdminActor):
    return store.list_staff(actor)


@router.post("/staff", response_model=StaffUser, operation_id="createStaff", openapi_extra=roles)
def create_staff(body: StaffCreate, store: Store, actor: AdminActor):
    return store.create_staff(body, actor)


@router.patch("/staff/{staffId}", response_model=StaffUser, operation_id="updateStaff", openapi_extra=roles)
def update_staff(staffId: str, body: StaffUpdate, store: Store, actor: AdminActor):
    return store.update_staff(staffId, body.model_dump(exclude_unset=True), actor)


@router.get("/stats", response_model=Stats, operation_id="getStats", openapi_extra=roles)
def stats(store: Store, actor: AdminActor):
    return store.stats(actor)
