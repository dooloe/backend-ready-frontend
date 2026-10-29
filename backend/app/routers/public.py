from typing import Annotated
import os

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status

from ..models import (AnonymousJoinRequest, IssuedTicket, JoinQueueRequest, JoinResponse,
                      Organization, PushConfig, PushEndpointRequest, PushSubscriptionRequest,
                      QueueSummary, Service, ServiceSummary, TicketView)
from ..store import DatabaseStore, get_store

router = APIRouter(prefix="/api", tags=["Customer"])
Store = Annotated[DatabaseStore, Depends(get_store)]


@router.get("/push/config", response_model=PushConfig, operation_id="getPushConfig")
def get_push_config(response: Response):
    response.headers["Cache-Control"] = "no-store"
    public_key = os.getenv("VAPID_PUBLIC_KEY")
    enabled = bool(public_key and os.getenv("VAPID_PRIVATE_KEY") and os.getenv("VAPID_CLAIMS_EMAIL"))
    return PushConfig(enabled=enabled, publicKey=public_key if enabled else None)


@router.post("/tickets/{token}/push-subscriptions", status_code=status.HTTP_204_NO_CONTENT,
             operation_id="registerPrivateTicketPush")
def register_push_subscription(token: str, body: PushSubscriptionRequest, store: Store, response: Response):
    response.headers["Cache-Control"] = "no-store"
    if not (os.getenv("VAPID_PUBLIC_KEY") and os.getenv("VAPID_PRIVATE_KEY")
            and os.getenv("VAPID_CLAIMS_EMAIL")):
        raise HTTPException(503, "Browser notifications are not configured")
    store.register_push_subscription(token, str(body.endpoint), body.keys.p256dh, body.keys.auth)


@router.delete("/tickets/{token}/push-subscriptions", status_code=status.HTTP_204_NO_CONTENT,
               operation_id="removePrivateTicketPush")
def remove_push_subscription(token: str, body: PushEndpointRequest, store: Store, response: Response):
    response.headers["Cache-Control"] = "no-store"
    store.remove_push_subscription(token, str(body.endpoint))


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


@router.post("/tickets/{token}/cancel", response_model=IssuedTicket,
             operation_id="cancelPrivateTicket")
def cancel_private_ticket(token: str, store: Store, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return store.cancel_private_ticket(token)


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
