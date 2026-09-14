"""Pydantic request/response models for Tony Yoga API."""
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, EmailStr
from access_terms import AccessTerm, ClassPricing


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    referral_code: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    remember: Optional[bool] = None

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    timezone: Optional[str] = None
    location: Optional[str] = None
    level: Optional[str] = None
    goals: Optional[List[str]] = None
    bio: Optional[str] = None
    photo_url: Optional[str] = None

class MagicLinkRequest(BaseModel):
    email: EmailStr
    type: str = "login"

class MagicLinkConsume(BaseModel):
    token: str

class PasswordReset(BaseModel):
    token: str
    new_password: str

class ForgotPassword(BaseModel):
    email: EmailStr

class InstructorApplication(BaseModel):
    name: str
    email: EmailStr
    years_experience: int
    certifications: str
    styles: List[str]
    bio: str
    social_links: Optional[Dict[str, str]] = None

class ApprovalAction(BaseModel):
    application_id: str
    action: str
    notes: Optional[str] = None

class ClassTemplateCreate(BaseModel):
    purchase_options: ClassPricing = ClassPricing()
    title: str
    description: str
    instructor_id: str
    location_type: str
    location_detail: Optional[str] = None
    style: str
    level: str
    duration_minutes: int = 60
    capacity: int = 20
    props_needed: Optional[List[str]] = None

class ClassInstanceCreate(BaseModel):
    template_id: str
    start_time: datetime
    capacity: Optional[int] = None
    is_recorded: bool = False

class BookingCreate(BaseModel):
    class_instance_id: str

class CheckInRequest(BaseModel):
    booking_id: str

class ProgramCreate(BaseModel):
    access_term: AccessTerm = AccessTerm()
    title: str
    description: str
    level: str
    style: str
    instructor_id: str
    duration_weeks: int = 4
    price_model: str = "membership"
    price: float = 0.0
    currency: str = "usd"
    cover_image: Optional[str] = None
    trailer_url: Optional[str] = None
    demo_video_url: Optional[str] = None
    main_video_url: Optional[str] = None
    focus_areas: Optional[List[str]] = None
    intensity: Optional[str] = None
    language: Optional[str] = None
    benefits: Optional[List[str]] = None
    included_in_plans: Optional[List[str]] = None
    related_product_ids: Optional[List[str]] = None
    bundle_discount_pct: Optional[int] = None
    drip_enabled: bool = False
    drip_interval_days: int = 7

class ProgramUpdate(BaseModel):
    access_term: Optional[AccessTerm] = None
    title: Optional[str] = None
    description: Optional[str] = None
    level: Optional[str] = None
    style: Optional[str] = None
    duration_weeks: Optional[int] = None
    price_model: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    cover_image: Optional[str] = None
    trailer_url: Optional[str] = None
    demo_video_url: Optional[str] = None
    main_video_url: Optional[str] = None
    focus_areas: Optional[List[str]] = None
    intensity: Optional[str] = None
    language: Optional[str] = None
    benefits: Optional[List[str]] = None
    included_in_plans: Optional[List[str]] = None
    related_product_ids: Optional[List[str]] = None
    bundle_discount_pct: Optional[int] = None
    drip_enabled: Optional[bool] = None
    drip_interval_days: Optional[int] = None

class VideoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    level: Optional[str] = None
    style: Optional[str] = None
    tags: Optional[List[str]] = None
    video_url: Optional[str] = None
    visibility: Optional[str] = None
    cover_image: Optional[str] = None
    source_url: Optional[str] = None
    start_seconds: Optional[int] = None
    end_seconds: Optional[int] = None

class ProgramLessonUpdate(BaseModel):
    order_index: Optional[int] = None
    is_free_preview: Optional[bool] = None
    assignment_prompt: Optional[str] = None
    requires_submission: Optional[bool] = None
    pass_threshold: Optional[int] = None  # 0-100
    max_attempts: Optional[int] = None  # 0 = unlimited

class AssignmentSubmissionCreate(BaseModel):
    lesson_id: str
    video_url: str  # public/unlisted YouTube/Vimeo/Loom URL the student pastes
    note: Optional[str] = None

class VideoCreate(BaseModel):
    title: str
    description: str
    duration_minutes: int
    level: str
    style: str
    tags: List[str] = []
    video_url: str
    visibility: str = "members"
    program_id: Optional[str] = None
    instructor_id: Optional[str] = None
    cover_image: Optional[str] = None
    source_type: Optional[str] = None
    source_url: Optional[str] = None
    start_seconds: Optional[int] = None
    end_seconds: Optional[int] = None

class ProgramLesson(BaseModel):
    program_id: str
    video_id: str
    order_index: int = 0

# --- Course lesson editor (YouTube video + optional timestamp segment) ---
class LessonUpsert(BaseModel):
    title: str
    description: Optional[str] = None
    youtube_url: str
    start_seconds: int = 0
    end_seconds: Optional[int] = None
    duration_minutes: Optional[int] = None
    level: Optional[str] = None
    style: Optional[str] = None
    is_free_preview: bool = False
    is_private: bool = False
    cover_image: Optional[str] = None
    requires_submission: Optional[bool] = None
    assignment_prompt: Optional[str] = None
    pass_threshold: Optional[int] = None
    max_attempts: Optional[int] = None

class LessonPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    youtube_url: Optional[str] = None
    start_seconds: Optional[int] = None
    end_seconds: Optional[int] = None
    duration_minutes: Optional[int] = None
    is_free_preview: Optional[bool] = None
    is_private: Optional[bool] = None
    cover_image: Optional[str] = None
    order_index: Optional[int] = None
    requires_submission: Optional[bool] = None
    assignment_prompt: Optional[str] = None
    pass_threshold: Optional[int] = None
    max_attempts: Optional[int] = None

class BundleCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    program_ids: List[str] = []
    price: float = 0.0
    currency: str = "eur"
    cover_image: Optional[str] = None
    active: bool = True

class BundleUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    program_ids: Optional[List[str]] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    cover_image: Optional[str] = None
    active: Optional[bool] = None

class LessonReorder(BaseModel):
    lesson_ids: List[str]

class ChapterIn(BaseModel):
    title: str
    start_seconds: int = 0
    end_seconds: Optional[int] = None

class LessonBulk(BaseModel):
    youtube_url: str
    chapters: List[ChapterIn]
    is_private: bool = False
    free_preview_first: bool = False

class ProductCreate(BaseModel):
    title: str
    description: str
    type: str = "physical"
    category: str
    price: float
    currency: str = "usd"
    stock_qty: int = 0
    images: List[str] = []
    variants: Optional[List[Dict[str, Any]]] = None
    external_amazon_link: Optional[str] = None
    ebook_file_url: Optional[str] = None      # digital download delivered after purchase (type == "ebook")
    author: Optional[str] = None              # book author line

class ProductUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None                # physical | book | ebook
    category: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    stock_qty: Optional[int] = None
    images: Optional[List[str]] = None
    visible: Optional[bool] = None
    featured: Optional[bool] = None
    featured_rank: Optional[int] = None
    compare_at_price: Optional[float] = None
    external_amazon_link: Optional[str] = None
    ebook_file_url: Optional[str] = None
    author: Optional[str] = None

class AsanaCreate(BaseModel):
    name: str                       # English / common name
    sanskrit: Optional[str] = None
    benefits: Optional[List[str]] = None
    description: Optional[str] = None
    category: Optional[str] = None  # e.g. Standing, Seated, Backbend, Inversion
    difficulty: Optional[str] = None  # beginner | intermediate | advanced
    cover_image: Optional[str] = None
    youtube_url: Optional[str] = None
    start_seconds: Optional[int] = None
    end_seconds: Optional[int] = None
    program_id: Optional[str] = None
    order_index: Optional[int] = None
    is_published: bool = True

class AsanaUpdate(BaseModel):
    name: Optional[str] = None
    sanskrit: Optional[str] = None
    benefits: Optional[List[str]] = None
    description: Optional[str] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None
    cover_image: Optional[str] = None
    youtube_url: Optional[str] = None
    start_seconds: Optional[int] = None
    end_seconds: Optional[int] = None
    program_id: Optional[str] = None
    order_index: Optional[int] = None
    is_published: Optional[bool] = None

class MeditationCreate(BaseModel):
    title: str
    kind: str = "meditation"          # meditation | breathwork | nidra
    media_kind: str = "video"         # video | audio
    youtube_url: Optional[str] = None
    audio_url: Optional[str] = None
    duration_minutes: Optional[int] = None
    focus_areas: Optional[List[str]] = None
    level: Optional[str] = "beginner"
    language: Optional[str] = "both"
    cover_image: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = None
    is_published: bool = True

class MeditationUpdate(BaseModel):
    title: Optional[str] = None
    kind: Optional[str] = None
    media_kind: Optional[str] = None
    youtube_url: Optional[str] = None
    audio_url: Optional[str] = None
    duration_minutes: Optional[int] = None
    focus_areas: Optional[List[str]] = None
    level: Optional[str] = None
    language: Optional[str] = None
    cover_image: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = None
    is_published: Optional[bool] = None

class MembershipPlanCreate(BaseModel):
    name: str
    description: str
    price: float
    currency: str = "usd"
    billing_cycle: str
    tier: str
    trial_days: int = 0
    features: List[str] = []

class CheckoutRequest(BaseModel):
    item_type: str
    item_id: str
    origin_url: str
    quantity: int = 1
    metadata: Optional[Dict[str, str]] = None
    apply_credit: Optional[bool] = False  # apply the user's gift-card store credit

class CouponCreate(BaseModel):
    code: str
    discount_type: str
    discount_value: float
    valid_until: Optional[datetime] = None
    usage_limit: int = 100

class LegacyImportRow(BaseModel):
    email: EmailStr
    name: Optional[str] = None

class LegacyImportRequest(BaseModel):
    batch_name: str
    rows: List[LegacyImportRow]
    offer_config: Optional[Dict[str, Any]] = None

class AnnouncementCreate(BaseModel):
    title: str
    body: str
    audience: str = "all"

class PrivateSessionRequest(BaseModel):
    instructor_id: str
    session_type: str
    duration_minutes: int = 60
    focus_area: str
    notes: str
    preferred_time: datetime

class RevenueShareRuleCreate(BaseModel):
    instructor_id: str
    type: str
    percentage: float
    target_id: Optional[str] = None

class ReferralInviteRequest(BaseModel):
    emails: List[EmailStr]
    personal_note: Optional[str] = None
