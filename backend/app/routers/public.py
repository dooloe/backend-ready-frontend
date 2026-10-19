from typing import Annotated

from fastapi import APIRouter, Depends

from ..models import JoinQueueRequest, Service, TicketView
from ..store import MemoryStore, get_store

router = APIRouter(prefix="/api", tags=["Customer"])
Store = Annotated[MemoryStore, Depends(get_store)]


@router.get("/services", response_model=list[Service], operation_id="listServices")
def list_services(store: Store):
    return store.list_services()


@router.post("/tickets", response_model=TicketView, operation_id="joinQueue")
def join_queue(body: JoinQueueRequest, store: Store):
    return store.join(body)


@router.get("/tickets/{id}", response_model=TicketView, operation_id="getTicket")
def get_ticket(id: str, store: Store):
    return store.ticket(id)


@router.post("/tickets/{id}/cancel", response_model=TicketView, operation_id="cancelTicket")
def cancel_ticket(id: str, store: Store):
    return store.cancel(id)
