from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from ..models import JoinQueueRequest, Organization, Service, TicketView
from ..store import DatabaseStore, get_store

router = APIRouter(prefix="/api", tags=["Customer"])
Store = Annotated[DatabaseStore, Depends(get_store)]


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


@router.get("/organizations", response_model=list[Organization], operation_id="listOrganizations")
def list_organizations(store: Store):
    return store.list_organizations()


@router.get("/organizations/{id}", response_model=Organization, operation_id="getOrganization")
def get_organization(id: str, store: Store):
    org = next((org for org in store.list_organizations() if org.id == id), None)
    if org is None:
        raise HTTPException(404, "Organization not found")
    return org
