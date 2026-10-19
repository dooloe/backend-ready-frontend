from typing import Annotated

from fastapi import APIRouter, Depends

from ..auth import require_staff
from ..models import Counter, QueueView, TicketView
from ..store import MemoryStore, get_store

router = APIRouter(prefix="/api", tags=["Staff"], dependencies=[Depends(require_staff)])
Store = Annotated[MemoryStore, Depends(get_store)]
roles = {"x-required-roles": ["staff", "admin"]}


@router.get("/counters", response_model=list[Counter], operation_id="listCounters", openapi_extra=roles)
def list_counters(store: Store):
    return store.list_counters()


@router.get("/counters/{counterId}/queue", response_model=QueueView, operation_id="getQueue", openapi_extra=roles)
def get_queue(counterId: str, store: Store):
    return store.queue(counterId)


@router.post("/counters/{counterId}/call-next", response_model=TicketView | None, operation_id="callNext", openapi_extra=roles)
def call_next(counterId: str, store: Store):
    return store.call_next(counterId)


@router.post("/tickets/{id}/start", response_model=TicketView, operation_id="startService", openapi_extra=roles)
def start_service(id: str, store: Store):
    return store.transition(id, "start")


@router.post("/tickets/{id}/complete", response_model=TicketView, operation_id="completeTicket", openapi_extra=roles)
def complete_ticket(id: str, store: Store):
    return store.transition(id, "complete")


@router.post("/tickets/{id}/no-show", response_model=TicketView, operation_id="markNoShow", openapi_extra=roles)
def no_show(id: str, store: Store):
    return store.transition(id, "no-show")
