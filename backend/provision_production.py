"""One-time, idempotent bootstrap for the Kezek production directory and users.

Run with APP_ENV=production, SEED_DEMO_DATA=false, and DATABASE_URL set. Passwords
are read with getpass and only Argon2id hashes are written to the database.
"""

from getpass import getpass

from sqlalchemy import select

from app.auth import hash_password
from app.orm import (
    CounterRow,
    CounterServiceRow,
    OrganizationRow,
    ServiceRow,
    StaffAssignmentRow,
    UserRow,
)
from app.settings import Settings
from app.store import DatabaseStore


ORGANIZATIONS = (
    {
        "id": "org-university",
        "name": "Almaty University",
        "slug": "almaty-university",
        "category": "Universities",
        "location": "Almaty, Kazakhstan",
        "timezone": "Asia/Almaty",
        "description": "",
    },
    {
        "id": "org-health-clinic",
        "name": "City Health Clinic",
        "slug": "city-health-clinic",
        "category": "Clinics",
        "location": "Astana, Kazakhstan",
        "timezone": "Asia/Almaty",
        "description": "",
    },
)

SERVICES = (
    ("svc-uni-dormitory", "org-university", "Dormitory Support", "D", 10),
    ("svc-uni-tuition", "org-university", "Tuition Payment", "T", 10),
    ("svc-clinic-primary-care", "org-health-clinic", "Primary Care Consultation", "H", 10),
)

COUNTERS = (
    ("counter-uni", "org-university", "University Service Counter", "uni_staff",
     ("svc-uni-dormitory", "svc-uni-tuition")),
    ("counter-clinic", "org-health-clinic", "Health Clinic Counter", "health_staff",
     ("svc-clinic-primary-care",)),
)

USERS = (
    ("user-admin", "org-university", "admin", "admin", True),
    ("user-uni-staff", "org-university", "uni_staff", "staff", False),
    ("user-health-staff", "org-health-clinic", "health_staff", "staff", False),
)


def provision(store: DatabaseStore, passwords: dict[str, str]) -> None:
    with store.db.session(write=True) as session:
        for data in ORGANIZATIONS:
            row = session.get(OrganizationRow, data["id"])
            if row is None:
                session.add(OrganizationRow(**data))
            elif row.slug != data["slug"]:
                raise RuntimeError(f"Organization ID collision for {data['id']}")
        session.flush()

        for service_id, organization_id, name, prefix, duration in SERVICES:
            row = session.get(ServiceRow, service_id)
            if row is None:
                session.add(ServiceRow(
                    id=service_id,
                    organization_id=organization_id,
                    name=name,
                    description="",
                    prefix=prefix,
                    isOpen=False,
                    avgServiceMinutes=duration,
                    durationMinutes=duration,
                    isActive=True,
                    opensAt=None,
                    closesAt=None,
                ))
            elif row.organization_id != organization_id:
                raise RuntimeError(f"Service ID collision for {service_id}")
        session.flush()

        users = {}
        for user_id, organization_id, username, role, platform_admin in USERS:
            row = session.scalar(select(UserRow).where(UserRow.username == username))
            if row is None:
                row = UserRow(
                    id=user_id,
                    organization_id=organization_id,
                    name=username,
                    username=username,
                    email=f"{username}@provisioned.invalid",
                    role=role,
                    password_hash=hash_password(passwords[username]),
                    is_active=True,
                    is_platform_admin=platform_admin,
                )
                session.add(row)
            elif row.organization_id != organization_id or row.role != role:
                raise RuntimeError(f"Existing account {username} has a conflicting role or organization")
            elif platform_admin and not row.is_platform_admin:
                raise RuntimeError("Existing admin account is not a platform admin; refusing to widen its scope")
            users[username] = row
        session.flush()

        for counter_id, organization_id, name, username, service_ids in COUNTERS:
            counter = session.get(CounterRow, counter_id)
            if counter is None:
                counter = CounterRow(
                    id=counter_id,
                    organization_id=organization_id,
                    name=name,
                    isActive=True,
                    staffId=users[username].id,
                )
                session.add(counter)
                session.flush()
                for service_id in service_ids:
                    session.add(CounterServiceRow(
                        organization_id=organization_id,
                        counter_id=counter_id,
                        service_id=service_id,
                    ))
                session.add(StaffAssignmentRow(
                    organization_id=organization_id,
                    user_id=users[username].id,
                    counter_id=counter_id,
                ))
            elif counter.organization_id != organization_id:
                raise RuntimeError(f"Counter ID collision for {counter_id}")


def main() -> None:
    settings = Settings.from_environment()
    if settings.environment != "production" or settings.seed_demo:
        raise SystemExit("Set APP_ENV=production and SEED_DEMO_DATA=false before provisioning")

    store = DatabaseStore(settings.database_url, seed_demo=False)
    try:
        missing = []
        with store.db.session() as session:
            for _, _, username, _, _ in USERS:
                if session.scalar(select(UserRow.id).where(UserRow.username == username)) is None:
                    missing.append(username)

        passwords = {}
        for username in missing:
            password = getpass(f"Initial password for {username}: ")
            if not password:
                raise SystemExit("Passwords must not be empty")
            passwords[username] = password

        provision(store, passwords)
        print("Production organizations, services, counters, and initial users are ready.")
        print("Queue hours and service activation remain closed until configured by an admin.")
    finally:
        store.close()


if __name__ == "__main__":
    main()
