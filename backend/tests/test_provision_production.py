from sqlalchemy import select
from fastapi import HTTPException
import pytest

from app.models import LoginRequest, ServiceCreate
from app.orm import OrganizationRow, ServiceRow, UserRow
from app.store import DatabaseStore
from provision_production import provision


def test_production_bootstrap_creates_real_catalog_and_scoped_accounts(tmp_path):
    store = DatabaseStore(f"sqlite:///{tmp_path / 'production.db'}", seed_demo=False)
    passwords = {"admin": "a-private-admin-pass", "uni_staff": "private-uni-pass",
                 "health_staff": "private-health-pass"}
    try:
        provision(store, passwords)
        admin = store.login(LoginRequest(username="admin", password=passwords["admin"])).user

        organizations = store.list_organizations()
        assert {(row.name, row.location) for row in organizations} == {
            ("Almaty University", "Almaty, Kazakhstan"),
            ("City Health Clinic", "Astana, Kazakhstan"),
        }
        assert {service.name for service in store.list_admin_services(admin)} == {
            "Dormitory Support", "Tuition Payment", "Primary Care Consultation",
        }
        assert {user.username for user in store.list_staff(admin)} == {
            "admin", "uni_staff", "health_staff",
        }
        assert len(store.list_counters(admin)) == 2

        with store.db.session() as session:
            users = {row.username: row for row in session.scalars(select(UserRow))}
            assert users["admin"].is_platform_admin is True
            assert users["admin"].organization_id == "org-university"
            assert users["uni_staff"].organization_id == "org-university"
            assert users["health_staff"].organization_id == "org-health-clinic"
            assert all(row.password_hash != passwords[row.username] for row in users.values())
            assert all(row.password_hash.startswith("$argon2id$") for row in users.values())
            hashes_before_retry = {key: row.password_hash for key, row in users.items()}

        clinic_service = next(
            service for service in store.list_admin_services(admin)
            if service.name == "Primary Care Consultation"
        )
        store.update_service(clinic_service.id, {"description": "Operator-provided clinic details"}, admin)
        store.create_service(ServiceCreate(
            organizationId="org-health-clinic", name="Follow-up", description="",
            prefix="F", isOpen=False, avgServiceMinutes=10,
        ), admin)

        health_staff = next(user for user in store.list_staff(admin) if user.username == "health_staff")
        own_counters = store.list_counters(health_staff)
        assert [counter.id for counter in own_counters] == ["counter-clinic"]
        with pytest.raises(HTTPException) as denied:
            store.queue("counter-uni", health_staff)
        assert denied.value.status_code == 404

        provision(store, {key: "must-not-reset" for key in passwords})
        with store.db.session() as session:
            users_after_retry = {row.username: row for row in session.scalars(select(UserRow))}
            assert {key: row.password_hash for key, row in users_after_retry.items()} == hashes_before_retry
            edited = session.get(ServiceRow, clinic_service.id)
            assert edited.description == "Operator-provided clinic details"
            assert session.scalar(select(OrganizationRow).where(
                OrganizationRow.id == "org-health-clinic"
            )).location == "Astana, Kazakhstan"

        assert store.login(LoginRequest(username="uni_staff", password=passwords["uni_staff"])).user.role == "staff"
        with pytest.raises(HTTPException):
            store.login(LoginRequest(username="admin", password="wrong-password"))
    finally:
        store.close()
