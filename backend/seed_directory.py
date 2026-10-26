"""Optional, idempotent demo directory: run from backend with .venv/bin/python seed_directory.py."""
from datetime import time
from sqlalchemy import select
from app.settings import Settings
from app.store import DatabaseStore
from app.auth import hash_password
from app.orm import OrganizationRow, ServiceRow, CounterRow, CounterServiceRow, UserRow, StaffAssignmentRow


def seed(store):
    with store.db.session(write=True) as session:
        for key, name, category, city, service, prefix, duration in [
            ("university", "Almaty University", "Universities", "Almaty", "Student services", "U", 6),
            ("clinic", "City Health Clinic", "Clinics", "Astana", "General consultation", "H", 12),
            ("government", "Citizen Service Office", "Government Services", "Shymkent", "Documents & applications", "G", 8),
            ("center", "Community Service Center", "Service Centers", "Karaganda", "Customer support", "S", 5),
        ]:
            oid, sid, cid = f"demo-{key}", f"demo-svc-{key}", f"demo-counter-{key}"
            if session.get(OrganizationRow, oid):
                continue
            session.add(OrganizationRow(id=oid, name=f"{name} · Demo", slug=oid,
                category=category, location=f"{city}, Kazakhstan", timezone="Asia/Almaty",
                description="Demonstration organization. Join a sample queue to explore Kezek; this is not a real provider."))
            session.flush()
            session.add(ServiceRow(id=sid, organization_id=oid, name=service, description="Demo service for exploring virtual queues.",
                prefix=prefix, isOpen=True, avgServiceMinutes=duration, durationMinutes=duration,
                opensAt=time(0), closesAt=time(23, 59), isActive=True))
            uid = f"demo-staff-{key}"
            session.add(UserRow(id=uid, organization_id=oid, name=f"{name} demo staff", username=uid,
                email=f"{uid}@example.invalid", role="staff", password_hash=hash_password("staff123"), is_active=True))
            session.flush()
            session.add(CounterRow(id=cid, organization_id=oid, name=f"{name} demo counter", isActive=True, staffId=uid))
            session.flush()
            session.add(CounterServiceRow(organization_id=oid, counter_id=cid, service_id=sid))
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
