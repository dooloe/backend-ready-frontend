from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status

from ..models import AnonymousJoinRequest, IssuedTicket, JoinQueueRequest, JoinResponse, Organization, QueueSummary, Service, ServiceSummary, TicketView
from ..store import DatabaseStore, get_store

router = APIRouter(prefix="/api", tags=["Customer"])
Store = Annotated[DatabaseStore, Depends(get_store)]


@router.get("/services", response_model=list[Service], operation_id="listServices")
def list_services(store: Store):
    return store.list_services()


@router.post("/tickets", response_model=TicketView, operation_id="joinQueue")
def join_queue(body: JoinQueueRequest, store: Store):
    return store.join(body)


@router.post("/queues/{queueId}/tickets", response_model=JoinResponse,
             operation_id="issueTicket", status_code=status.HTTP_201_CREATED)
def issue_ticket(queueId: str, body: AnonymousJoinRequest, response: Response,
                 store: Store, idempotency_key: str = Header(alias="Idempotency-Key")):
    result, created = store.issue_ticket(queueId, idempotency_key, body.accessToken)
    response.headers["Cache-Control"] = "no-store"
    if not created:
        response.status_code = status.HTTP_200_OK
    return result


@router.get("/tickets/{token}", response_model=IssuedTicket, operation_id="readPrivateTicket")
def read_private_ticket(token: str, store: Store, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return store.private_ticket(token)


@router.get("/legacy/tickets/{id}", response_model=TicketView, operation_id="getTicket")
def get_legacy_ticket(id: str, store: Store):
    return store.ticket(id)


@router.post("/legacy/tickets/{id}/cancel", response_model=TicketView, operation_id="cancelTicket")
def cancel_legacy_ticket(id: str, store: Store):
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


@router.get("/organizations/{orgId}/services", response_model=list[ServiceSummary],
            operation_id="listOrganizationServices")
def list_organization_services(orgId: str, store: Store):
    return store.list_organization_services(orgId)


@router.get("/queues/{queueId}/status", response_model=QueueSummary,
            operation_id="getQueueStatus")
def get_queue_status(queueId: str, store: Store):
    return store.queue_status(queueId)
