"""Organization-local business dates and daily service availability."""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


@dataclass(frozen=True)
class QueueSchedule:
    business_date: date
    within_hours: bool


def resolve_queue_schedule(
    timezone_name: str,
    opens_at: time | None,
    closes_at: time | None,
    instant: datetime,
) -> QueueSchedule:
    """Resolve an instant to the local queue date and configured open window.

    Both missing hours (or equal opening/closing times) mean a 24-hour daily
    schedule. A partial schedule is invalid. Overnight windows belong to the
    date on which they opened, including the after-midnight segment.
    """
    if instant.tzinfo is None or instant.utcoffset() is None:
        raise ValueError("The schedule instant must be timezone-aware")
    if (opens_at is None) != (closes_at is None):
        raise ValueError("Both opening and closing times must be configured")
    try:
        local = instant.astimezone(ZoneInfo(timezone_name))
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError("Organization timezone must be a valid IANA timezone") from exc

    local_time = local.timetz().replace(tzinfo=None)
    business_date = local.date()
    if opens_at is None or opens_at == closes_at:
        return QueueSchedule(business_date, True)
    if opens_at < closes_at:
        return QueueSchedule(business_date, opens_at <= local_time < closes_at)

    if local_time >= opens_at:
        return QueueSchedule(business_date, True)
    if local_time < closes_at:
        return QueueSchedule(business_date - timedelta(days=1), True)
    return QueueSchedule(business_date, False)
