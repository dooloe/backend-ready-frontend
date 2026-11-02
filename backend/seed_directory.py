"""Optional, idempotent demo directory: run from backend with .venv/bin/python seed_directory.py."""
from datetime import time
from sqlalchemy import select
from app.settings import Settings
from app.store import DatabaseStore
from app.auth import hash_password
from app.orm import OrganizationRow, ServiceRow, CounterRow, CounterServiceRow, UserRow, StaffAssignmentRow


def seed(store):
    with store.db.session(write=True) as session:
        for key, name, category, city, services in [
            ("university", "Almaty University", "Universities", "Almaty", [
                ("university", "Enrollment certificate", "Request proof of student status.", "U", 6),
                ("tuition", "Tuition payment questions", "Discuss payment options and outstanding balances.", "T", 8),
                ("dormitory", "Dormitory support", "Ask about accommodation and residence procedures.", "D", 10),
            ]),
            ("clinic", "City Health Clinic", "Clinics", "Astana", [
                ("clinic", "Primary care consultation", "Discuss a non-emergency health concern with clinic staff.", "H", 12),
            ]),
            ("government", "Citizen Service Office", "Government Services", "Shymkent", [
                ("government", "Identity and document services", "Explore the sample queue for document requests.", "G", 8),
            ]),
            ("center", "Community Service Center", "Service Centers", "Karaganda", [
                ("center", "Community support", "Ask about local services and support.", "S", 5),
            ]),
        ]:
            oid, cid = f"demo-{key}", f"demo-counter-{key}"
            organization = session.get(OrganizationRow, oid)
            if organization is None:
                organization = OrganizationRow(id=oid, name=f"{name} · Demo", slug=oid,
                    category=category, location=f"{city}, Kazakhstan", timezone="Asia/Almaty",
                    description="Demonstration organization. Join a sample queue to explore Kezek; this is not a real provider.")
                session.add(organization)
                session.flush()
            service_ids = []
            for service_key, service_name, description, prefix, duration in services:
                sid = f"demo-svc-{service_key}"
                service_ids.append(sid)
                existing_service = session.get(ServiceRow, sid)
                if existing_service is None:
                    session.add(ServiceRow(id=sid, organization_id=oid, name=service_name, description=description,
                        prefix=prefix, isOpen=True, avgServiceMinutes=duration, durationMinutes=duration,
                        opensAt=time(0), closesAt=time(23, 59), isActive=True))
                elif (service_key == "university" and existing_service.name == "Student services"
                      and existing_service.description == "Demo service for exploring virtual queues."):
                    existing_service.name = service_name
                    existing_service.description = description
            uid = f"demo-staff-{key}"
            if session.get(UserRow, uid) is None:
                session.add(UserRow(id=uid, organization_id=oid, name=f"{name} demo staff", username=uid,
                    email=f"{uid}@example.invalid", role="staff", password_hash=hash_password("staff123"), is_active=True))
            session.flush()
            counter = session.get(CounterRow, cid)
            if counter is None:
                counter = CounterRow(id=cid, organization_id=oid, name=f"{name} demo counter", isActive=True, staffId=uid)
                session.add(counter)
                session.flush()
            for sid in service_ids:
                if session.get(CounterServiceRow, (cid, sid)) is None:
                    session.add(CounterServiceRow(organization_id=oid, counter_id=cid, service_id=sid))
            if session.get(StaffAssignmentRow, (uid, cid)) is None:
                session.add(StaffAssignmentRow(organization_id=oid, user_id=uid, counter_id=cid))

        # Keep a single development admin available even for databases that
        # were initialized before the demo directory was added.
        if session.scalar(select(UserRow.id).where(UserRow.username == "admin")) is None:
            admin_organization_id = (
                "org-demo" if session.get(OrganizationRow, "org-demo") else "demo-university"
            )
            session.add(UserRow(id="stf-admin", organization_id=admin_organization_id, name="Platform Admin",
                username="admin", email="admin@example.invalid", role="admin",
                password_hash=hash_password("admin123"), is_active=True))


if __name__ == "__main__":
    settings = Settings.from_environment()
    if settings.environment == "production":
        raise SystemExit("Demo directory seeding is limited to development or test environments")
    store = DatabaseStore(settings.database_url, seed_demo=settings.seed_demo)
    try:
        seed(store)
        print("Demo directory ready. All four organizations are explicitly labeled Demo.")
    finally:
        store.close()
