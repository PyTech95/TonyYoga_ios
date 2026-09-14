"""Contracts for first-party, non-identifying usage telemetry."""
from typing import Literal, Optional
from uuid import UUID
from pydantic import BaseModel, Field, field_validator


class UsageEvent(BaseModel):
    event_id: UUID
    session_id: UUID
    path: str = Field(max_length=160)
    platform: Literal["website", "pwa", "native"]
    load_ms: Optional[float] = Field(default=None, ge=0, le=120000, allow_inf_nan=False)

    @field_validator("path")
    @classmethod
    def public_path(cls, value):
        # Only route families are retained: never tokens, emails or record IDs.
        public = {"/", "/home", "/welcome", "/schedule", "/programs", "/asanas",
                  "/discover", "/meditations", "/find-your-path", "/quiz", "/breathwork",
                  "/memberships", "/shop", "/teacher-training", "/private-sessions",
                  "/challenges", "/workshops", "/news", "/broadcasts", "/leaderboard",
                  "/passes", "/support", "/privacy", "/terms"}
        root = "/" + value.strip("/").split("/")[0]
        if "?" in value or "#" in value or root not in public:
            raise ValueError("Only public page paths are accepted")
        return root


class TrackingConfig(BaseModel):
    enabled: bool


class EventResult(BaseModel):
    accepted: bool


class DailyUsage(BaseModel):
    date: str
    website: int = 0
    app: int = 0
    website_load_ms: Optional[float] = None
    app_load_ms: Optional[float] = None


class UsageSummary(BaseModel):
    views: int = 0
    sessions: int = 0
    website_views: int = 0
    app_views: int = 0
    avg_load_ms: Optional[float] = None
    load_samples: int = 0


class PopularPage(BaseModel):
    path: str
    views: int


class UsageReport(BaseModel):
    enabled: bool
    days: int
    retention_days: int = 90
    collected_since: Optional[str] = None
    summary: UsageSummary
    series: list[DailyUsage]
    top_pages: list[PopularPage]