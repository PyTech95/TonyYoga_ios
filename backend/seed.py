"""Seed initial data on first startup (idempotent)."""
import os
from datetime import timedelta, datetime
from core import db, logger, now_utc, gen_id, gen_referral_code, hash_password, verify_password


async def seed():
    # Admin
    admin_email = os.environ.get("ADMIN_EMAIL", "tony@tonyyoga.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "TonyYoga2026!")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": gen_id(), "email": admin_email, "name": "Tony Sanchez",
            "password_hash": hash_password(admin_password),
            "role": "admin", "active": True,
            "bio": "Founder & lead instructor. 50+ years of practice. Trained at Ghosh's College of Physical Education, Kolkata (1983). Creator of The Ideal Yoga Practice — Core 26+, Core 40, Core 84.",
            "photo_url": "/brand/tony/tony-face.jpg",
            "years_experience": 50, "styles": ["Core 26+", "Core 40", "Core 84", "Tree of Yoga"],
            "source": "seed", "created_at": now_utc().isoformat(),
        })
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    if not await db.users.find_one({"email": "student@demo.com"}):
        await db.users.insert_one({
            "id": gen_id(), "email": "student@demo.com", "name": "Demo Student",
            "password_hash": hash_password("Student2026!"),
            "role": "student", "level": "intermediate",
            "goals": ["flexibility", "stress relief"], "timezone": "UTC",
            "active": True, "source": "seed", "created_at": now_utc().isoformat(),
        })

    # Seed a dedicated instructor so the Instructor Dashboard has an owner + data.
    if not await db.users.find_one({"email": "instructor@demo.com"}):
        await db.users.insert_one({
            "id": gen_id(), "email": "instructor@demo.com", "name": "Ana Ruiz",
            "password_hash": hash_password("Instructor2026!"),
            "role": "instructor", "level": "advanced", "timezone": "UTC",
            "bio": "Certified Ghosh-lineage instructor. Leads Vinyasa and Power classes.",
            "tax_nif": "X1234567Z", "iban": "ES9121000418450200051332",
            "active": True, "source": "seed", "created_at": now_utc().isoformat(),
        })

    if await db.membership_plans.count_documents({}) == 0:
        await db.membership_plans.insert_many([
            {"id": gen_id(),
             "name": "i18n:memb.plan.essential.name",
             "description": "i18n:memb.plan.essential.desc",
             "price": 29.0, "currency": "eur", "billing_cycle": "monthly", "tier": "online_only",
             "trial_days": 7,
             "features": [
                "i18n:memb.feat.live_2pw",
                "i18n:memb.feat.library_full",
                "i18n:memb.feat.programs_one",
                "i18n:memb.feat.community",
                "i18n:memb.feat.cancel_any",
             ],
             "is_active": True, "created_at": now_utc().isoformat()},
            {"id": gen_id(),
             "name": "i18n:memb.plan.unlimited.name",
             "description": "i18n:memb.plan.unlimited.desc",
             "price": 59.0, "currency": "eur", "billing_cycle": "monthly", "tier": "online_inperson",
             "trial_days": 7,
             "features": [
                "i18n:memb.feat.live_unlimited",
                "i18n:memb.feat.library_full",
                "i18n:memb.feat.programs_all",
                "i18n:memb.feat.workshops_10",
                "i18n:memb.feat.private_disc",
                "i18n:memb.feat.cancel_any",
             ],
             "is_active": True, "created_at": now_utc().isoformat()},
            {"id": gen_id(),
             "name": "i18n:memb.plan.annual.name",
             "description": "i18n:memb.plan.annual.desc",
             "price": 999.0, "currency": "eur", "billing_cycle": "yearly", "tier": "vip",
             "trial_days": 0,
             "features": [
                "i18n:memb.feat.live_unlimited",
                "i18n:memb.feat.library_full",
                "i18n:memb.feat.programs_all",
                "i18n:memb.feat.workshops_20",
                "i18n:memb.feat.private_disc",
                "i18n:memb.feat.priority_support",
                "i18n:memb.feat.offline_downloads",
             ],
             "is_active": True, "created_at": now_utc().isoformat()},
        ])

    admin_user = await db.users.find_one({"role": "admin"})
    if admin_user and await db.class_templates.count_documents({}) == 0:
        templates = [
            {"id": gen_id(), "title": "Morning Vinyasa Flow", "description": "Wake up with breath and flow.",
             "instructor_id": admin_user["id"], "location_type": "online", "location_detail": "Zoom",
             "style": "Vinyasa", "level": "intermediate", "duration_minutes": 60, "capacity": 30,
             "props_needed": ["mat"], "created_by": admin_user["id"], "created_at": now_utc().isoformat()},
            {"id": gen_id(), "title": "Gentle Hatha", "description": "Slow, mindful and grounded.",
             "instructor_id": admin_user["id"], "location_type": "in-person", "location_detail": "Studio A, 123 Sunrise Ave",
             "style": "Hatha", "level": "beginner", "duration_minutes": 75, "capacity": 18,
             "props_needed": ["mat", "blocks"], "created_by": admin_user["id"], "created_at": now_utc().isoformat()},
            {"id": gen_id(), "title": "Therapeutic Back Care", "description": "Heal and strengthen the spine.",
             "instructor_id": admin_user["id"], "location_type": "online", "location_detail": "Zoom",
             "style": "Therapeutic", "level": "all", "duration_minutes": 60, "capacity": 25,
             "props_needed": ["mat", "blanket"], "created_by": admin_user["id"], "created_at": now_utc().isoformat()},
            {"id": gen_id(), "title": "Power Yoga", "description": "Strong, energizing practice.",
             "instructor_id": admin_user["id"], "location_type": "in-person", "location_detail": "Studio A",
             "style": "Power", "level": "advanced", "duration_minutes": 60, "capacity": 20,
             "props_needed": ["mat", "towel"], "created_by": admin_user["id"], "created_at": now_utc().isoformat()},
        ]
        await db.class_templates.insert_many(templates)
        base = now_utc().replace(hour=8, minute=0, second=0, microsecond=0)
        instances = []
        for i in range(7):
            for j, t in enumerate(templates):
                start = base + timedelta(days=i, hours=j * 2)
                instances.append({
                    "id": gen_id(), "template_id": t["id"], "title": t["title"],
                    "instructor_id": t["instructor_id"], "location_type": t["location_type"],
                    "location_detail": t.get("location_detail"),
                    "style": t["style"], "level": t["level"], "duration_minutes": t["duration_minutes"],
                    "start_time": start.isoformat(),
                    "end_time": (start + timedelta(minutes=t["duration_minutes"])).isoformat(),
                    "capacity": t["capacity"], "is_recorded": True,
                    "status": "scheduled", "bookings_count": 0,
                    "created_at": now_utc().isoformat(),
                })
        await db.class_instances.insert_many(instances)

    if admin_user:
        # Seed the Core series programs only if they aren't present yet (idempotent, additive).
        # No destructive deletes: existing content is always preserved on startup/deploy.
        if not await db.programs.find_one({"title": "Core 26+"}):
            COVERS = {
                "core26": "/brand/seed/core26.png",
                "core40": "/brand/seed/core40.jpg",
                "core84": "/brand/seed/core84.png",
            }
            DEMO_VIDEO = "https://assets.mixkit.co/videos/preview/mixkit-young-woman-doing-yoga-on-a-rooftop-4849-large.mp4"

            programs_spec = [
                {
                    "key": "core26",
                    "title": "Core 26+",
                    "description": "The foundational 26-pose hot yoga sequence. Perfect for beginners and those looking to master the essential poses that form the basis of all yoga practice. 200 hours.",
                    "level": "beginner", "style": "Core 26+",
                    "duration_weeks": 12, "price": 199.0, "currency": "eur",
                    "benefits": ["26 Classical Poses", "Beginner Friendly", "Hot Yoga Foundation", "Breathing Techniques"],
                    "lessons": [
                        "Welcome & Setup · Your Practice Begins",
                        "Pranayama · Standing Deep Breathing",
                        "Half Moon Pose · Ardha Chandrasana",
                        "Awkward Pose · Utkatasana",
                        "Eagle Pose · Garurasana",
                        "Standing Head to Knee · Dandayamana Janushirasana",
                        "Standing Bow Pulling Pose · Dandayamana Dhanurasana",
                        "Balancing Stick Pose · Tuladandasana",
                        "Standing Separate Leg Stretching · Dandayamana Bibhaktapada Paschimotthanasana",
                        "Triangle Pose · Trikonasana",
                        "Standing Separate Leg Head to Knee · Dandayamana Bibhaktapada Janushirasana",
                        "Tree Pose & Toe Stand · Tadasana & Padangustasana",
                        "Dead Body Pose · Savasana",
                        "Wind Removing Pose · Pavanamuktasana",
                        "Sit-Up & Cobra · Bhujangasana",
                        "Locust Pose · Salabhasana",
                        "Full Locust · Poorna Salabhasana",
                        "Bow Pose · Dhanurasana",
                        "Fixed Firm Pose · Supta Vajrasana",
                        "Half Tortoise · Ardha Kurmasana",
                        "Camel Pose · Ustrasana",
                        "Rabbit Pose · Sasangasana",
                        "Head to Knee with Stretching · Janushirasana with Paschimotthanasana",
                        "Spine Twisting Pose · Ardha Matsyendrasana",
                        "Blowing in Firm · Kapalbhati in Vajrasana",
                        "Closing Sequence · Integration",
                    ],
                },
                {
                    "key": "core40",
                    "title": "Core 40 Fitness",
                    "description": "A comprehensive 40-pose yoga fitness system. Combines standing postures, floor work, and breathing exercises for complete mind-body transformation. 300 hours.",
                    "level": "intermediate", "style": "Core 40",
                    "duration_weeks": 16, "price": 299.0, "currency": "eur",
                    "benefits": ["40 Progressive Poses", "Standing & Floor Series", "Detailed Instructions", "Inspirational Wisdom"],
                    "lessons": [
                        "Introduction · The Practice & Its Principles",
                        "Pranayama Series · Breath as Foundation",
                        "Standing Series Part 1 · Half Moon & Backbend",
                        "Standing Series Part 2 · Awkward & Eagle",
                        "Standing Series Part 3 · Standing Head to Knee",
                        "Standing Series Part 4 · Standing Bow & Balancing Stick",
                        "Standing Series Part 5 · Separate Leg & Triangle",
                        "Standing Series Part 6 · Tree & Toe Stand",
                        "Transitional Savasana",
                        "Floor Series Part 1 · Wind Removing & Sit-Up",
                        "Floor Series Part 2 · Cobra to Full Locust",
                        "Floor Series Part 3 · Bow to Fixed Firm",
                        "Floor Series Part 4 · Half Tortoise to Camel",
                        "Floor Series Part 5 · Rabbit & Head to Knee",
                        "Floor Series Part 6 · Spine Twist & Kapalbhati",
                        "Tree of Yoga · Sun Salutation A",
                        "Tree of Yoga · Sun Salutation B",
                        "Tree of Yoga · Warrior Sequences",
                        "Tree of Yoga · Hip Openers",
                        "Tree of Yoga · Backbend Therapy",
                        "Tree of Yoga · Forward Folds & Twists",
                        "Tree of Yoga · Inversions Intro",
                        "Tree of Yoga · Restorative Mudras",
                        "Closing Integration · Building Your Daily Practice",
                    ],
                },
                {
                    "key": "core84",
                    "title": "Core 84 Asana Mastery",
                    "description": "Master all 84 classical yoga asanas across 18 progressive series. From foundational breathing to advanced inversions — the ultimate yoga journey. 500 hours.",
                    "level": "advanced", "style": "Core 84",
                    "duration_weeks": 24, "price": 599.0, "currency": "eur",
                    "benefits": ["84 Classical Asanas", "18 Progressive Series", "Beginner to Expert", "Lifetime Access"],
                    "lessons": [
                        "Series 01 · Pranayama & Bandhas",
                        "Series 02 · Surya Namaskar Foundations",
                        "Series 03 · Standing Hip-Openers",
                        "Series 04 · Standing Backbends",
                        "Series 05 · Standing Forward Folds",
                        "Series 06 · Standing Balances",
                        "Series 07 · Floor Forward Folds",
                        "Series 08 · Floor Backbends I — Cobra & Locust Family",
                        "Series 09 · Floor Backbends II — Bow & Camel Family",
                        "Series 10 · Hip Opening Series",
                        "Series 11 · Twists — Seated & Reclined",
                        "Series 12 · Arm Balances I — Crow & Side Crow",
                        "Series 13 · Arm Balances II — Eight-Angle & Firefly",
                        "Series 14 · Inversions I — Headstand Family",
                        "Series 15 · Inversions II — Shoulderstand & Plough",
                        "Series 16 · Inversions III — Handstand Progression",
                        "Series 17 · Advanced Backbends — Kapotasana & Tiriang Mukhottanasana",
                        "Series 18 · Closing — Mudras, Savasana & Integration",
                    ],
                },
            ]

            for spec in programs_spec:
                pid = gen_id()
                cover = COVERS[spec["key"]]
                await db.programs.insert_one({
                    "id": pid,
                    "title": spec["title"],
                    "description": spec["description"],
                    "level": spec["level"],
                    "style": spec["style"],
                    "instructor_id": admin_user["id"],
                    "duration_weeks": spec["duration_weeks"],
                    "price_model": "one_time",
                    "price": spec["price"],
                    "currency": spec["currency"],
                    "cover_image": cover,
                    "trailer_url": DEMO_VIDEO,
                    "benefits": spec["benefits"],
                    "included_in_plans": [],
                    "rating": 4.9, "review_count": 0,
                    "created_at": now_utc().isoformat(),
                })
                lessons_docs = []
                videos_docs = []
                for idx, title in enumerate(spec["lessons"]):
                    vid = gen_id()
                    lid = gen_id()
                    is_free = (idx == 0)
                    videos_docs.append({
                        "id": vid, "title": title,
                        "description": f"{title} — guided practice in the {spec['title']} series.",
                        "duration_minutes": 25 + (idx % 5) * 5,
                        "level": spec["level"], "style": spec["style"],
                        "tags": [spec["style"].lower(), "core"],
                        "video_url": DEMO_VIDEO,
                        "visibility": "free" if is_free else "program",
                        "program_id": pid, "instructor_id": admin_user["id"],
                        "cover_image": cover,
                        "views": 0, "created_at": now_utc().isoformat(),
                    })
                    lessons_docs.append({
                        "id": lid, "program_id": pid, "video_id": vid,
                        "order_index": idx + 1,
                        "is_free_preview": is_free,
                    })
                await db.videos.insert_many(videos_docs)
                await db.program_lessons.insert_many(lessons_docs)

            # Standalone free meditation (only if not present)
            if not await db.videos.find_one({"title": "10-min Morning Meditation"}):
                await db.videos.insert_one({
                    "id": gen_id(), "title": "10-min Morning Meditation",
                    "description": "Gentle start to your day.",
                    "duration_minutes": 10, "level": "all", "style": "Meditation",
                    "tags": ["meditation", "morning"],
                    "video_url": DEMO_VIDEO, "visibility": "free",
                    "program_id": None, "instructor_id": admin_user["id"],
                    "cover_image": "https://images.pexels.com/photos/8436684/pexels-photo-8436684.jpeg?auto=compress",
                    "views": 0, "created_at": now_utc().isoformat(),
                })

    if await db.products.count_documents({}) == 0:
        await db.products.insert_many([
            {"id": gen_id(), "title": "Tony's Cork Yoga Mat", "description": "Sustainable cork & natural rubber mat.",
             "type": "physical", "category": "mats", "price": 89.0, "currency": "eur",
             "stock_qty": 50, "images": ["https://images.unsplash.com/photo-1637157216470-d92cd2edb2e8?crop=entropy&cs=srgb&fm=jpg&q=85"],
             "rating": 4.8, "created_at": now_utc().isoformat()},
            {"id": gen_id(), "title": "Tony Yoga Tee — Sand", "description": "Organic cotton, branded subtly.",
             "type": "physical", "category": "apparel", "price": 34.0, "currency": "eur",
             "stock_qty": 75, "images": ["https://images.pexels.com/photos/8436684/pexels-photo-8436684.jpeg?auto=compress"],
             "variants": [{"size": "S"}, {"size": "M"}, {"size": "L"}, {"size": "XL"}],
             "rating": 4.6, "created_at": now_utc().isoformat()},
            {"id": gen_id(), "title": "Cork Blocks (Set of 2)", "description": "Natural cork yoga blocks.",
             "type": "physical", "category": "mats", "price": 32.0, "currency": "eur",
             "stock_qty": 60, "images": ["https://images.unsplash.com/photo-1637157216470-d92cd2edb2e8?crop=entropy&cs=srgb&fm=jpg&q=85"],
             "rating": 4.7, "created_at": now_utc().isoformat()},
        ])

    # --- Books & reading (idempotent) — Tony Sanchez's real titles on Amazon ---
    _demo_books = [
        {"title": "Genesis of Yoga — Core 26+ Level 1",
         "description": "Tony Sanchez's foundational Core 26+ Level 1 system — the complete beginner's method to the original hot yoga series, posture by posture, from the breath to the final savasana. The perfect companion to the Core 26+ course. Available on Amazon Kindle.",
         "type": "book", "category": "books", "price": 9.99, "currency": "eur", "stock_qty": 0,
         "author": "Tony Sanchez",
         "images": ["https://m.media-amazon.com/images/I/71jc8Yuzk7L._SL1200_.jpg"],
         "external_amazon_link": "https://www.amazon.com/Genesis-Yoga-Core-Level-Systems-ebook/dp/B0C3YSPHCB",
         "featured": True, "featured_rank": 0},
        {"title": "84 Asanas — Level I: Practice Manual",
         "description": "The definitive Level I practice manual for the advanced 84-asana series: detailed alignment, sequencing and technique from Tony Sanchez with Sandy Wong-Sanchez, Kurt Anderson and Baeta Priolo. A reference for dedicated practitioners and teachers. Paperback on Amazon.",
         "type": "book", "category": "books", "price": 0, "currency": "eur", "stock_qty": 0,
         "author": "Tony Sanchez & senior teachers",
         "images": ["https://m.media-amazon.com/images/I/814LOKEjiEL._SL1200_.jpg"],
         "external_amazon_link": "https://www.amazon.com/84-Asanas-Level-Practice-Manual/dp/1463683308",
         "featured": True, "featured_rank": 1},
    ]
    for b in _demo_books:
        if not await db.products.find_one({"title": b["title"]}):
            await db.products.insert_one({
                "id": gen_id(), "rating": 5.0, "review_count": 0, "visible": True,
                "created_at": now_utc().isoformat(), **b,
            })


    if await db.announcements.count_documents({}) == 0:
        await db.announcements.insert_one({
            "id": gen_id(), "title": "Welcome to Tony Yoga",
            "body": "We've launched the new home for our community. Browse the new schedule and try a free class.",
            "audience": "all", "created_at": now_utc().isoformat(), "author": "Tony",
        })

    # Seed retreats (idempotent — only if collection empty). Only the upcoming
    # December Core 40 retreat is seeded/active; past retreats are not shown.
    if await db.workshops.count_documents({}) == 0:
        await db.workshops.insert_many([
            {
                "id": gen_id(),
                "title": "Tree of Yoga · Core 40",
                "subtitle": "All levels welcome — students and teachers.",
                "system": "Core 40",
                "description": "Learn yoga philosophy, history, practice principles and practice in the planes. Enhance your practice and improve your teachings. Includes the full Tree of Yoga sequences.",
                "location": "Villa San Pedro · Málaga, Spain",
                "start_date": "2026-12-01T09:00:00+00:00",
                "end_date": "2026-12-07T18:00:00+00:00",
                "nights": 6, "meals_included": True,
                "price_eur": 1600.0, "teacher_training_price_eur": None,
                "cover_image": "https://images.squarespace-cdn.com/content/v1/620bca2d082bbf5542408178/1645553875741-8O0MMKPYJ9Q2BX6F4SIH/Core+40.jpg",
                "schedule": "9:00–1:00 pm / 3:00–6:00 pm",
                "capacity": 14, "is_active": True,
                "created_at": now_utc().isoformat(),
            },
        ])

    # Backfill referral codes
    users_no_code = await db.users.find({"referral_code": {"$exists": False}}, {"id": 1, "name": 1}).to_list(1000)
    for u in users_no_code:
        await db.users.update_one({"id": u["id"]}, {"$set": {"referral_code": gen_referral_code(u.get("name", "yogi"))}})

    # Migrate legacy bcrypt magic-link rows: the plain token isn't recoverable,
    # so mark unused legacy rows (token_hash present, token_sha absent) as expired.
    # This lets us safely drop the bcrypt fallback in routers/auth.py.
    legacy_purged = await db.magic_link_tokens.update_many(
        {"used_at": None, "token_hash": {"$exists": True}, "token_sha": {"$exists": False}},
        {"$set": {"used_at": now_utc().isoformat(), "migrated": True}},
    )
    if legacy_purged.modified_count:
        logger.info(f"Migrated {legacy_purged.modified_count} legacy bcrypt magic-link rows (marked used).")

    # Migrate referral_invites.created_at from ISO string -> native datetime (for accurate quota queries)
    iso_invites = await db.referral_invites.find(
        {"created_at": {"$type": "string"}}, {"id": 1, "created_at": 1}
    ).to_list(5000)
    for inv in iso_invites:
        try:
            dt = datetime.fromisoformat(inv["created_at"])
            await db.referral_invites.update_one({"id": inv["id"]}, {"$set": {"created_at": dt}})
        except Exception:
            pass
    if iso_invites:
        logger.info(f"Migrated {len(iso_invites)} referral_invites.created_at to native datetime.")

    # Indexes
    # Seed a few starter news/blog posts so Home has content out of the box
    if await db.news_posts.count_documents({}) == 0:
        base_now = now_utc()
        starter_posts = [
            {
                "id": gen_id(), "slug": "welcome-to-tony-yoga",
                "title": "Welcome to Tony Yoga — the new online home",
                "excerpt": "Same practice, same lineage — now with live Zoom classes, on-demand programs, and workshops all under one roof.",
                "body": "For over 40 years Tony has taught The Ideal Yoga Practice. This platform brings Core 26+, Core 40 and Core 84 to your mat wherever you are. Log in, book a class, and let's practice together.",
                "cover_image": "https://images.squarespace-cdn.com/content/v1/620bca2d082bbf5542408178/2e0d829f-31b4-44fe-98e5-25e88270dd0f/Untitled+design.jpg",
                "category": "news", "tags": ["launch", "welcome"],
                "is_published": True, "published_at": base_now.isoformat(),
                "author_id": "seed", "author_name": "Tony Sanchez",
                "created_at": base_now.isoformat(),
            },
            {
                "id": gen_id(), "slug": "genesis-of-yoga-april-retreat",
                "title": "Genesis of Yoga · Core 26+ · Málaga April 8–13",
                "excerpt": "Six days at Villa San Pedro. Philosophy, practice, and slow meals — the perfect deep-dive for students or teachers.",
                "body": "Join Tony in Málaga for the Genesis of Yoga Core 26+ retreat. Two practice sessions a day (9-1pm / 3-6pm), three meals daily, and 6 nights at Villa San Pedro. €1,600 all-in. Fourteen spots.",
                "cover_image": "https://images.squarespace-cdn.com/content/v1/620bca2d082bbf5542408178/1645608838615-ZCYH6HCH1EZN3O08MN54/Core26.jpg",
                "category": "event", "tags": ["retreat", "malaga", "core-26"],
                "event_date": "2026-04-08T09:00:00+00:00",
                "event_location": "Villa San Pedro · Málaga, Spain",
                "is_published": True, "published_at": (base_now - timedelta(days=2)).isoformat(),
                "author_id": "seed", "author_name": "Tony Sanchez",
                "created_at": (base_now - timedelta(days=2)).isoformat(),
            },
            {
                "id": gen_id(), "slug": "why-we-teach-core-84",
                "title": "Why we teach the classic 84 asanas",
                "excerpt": "A short reflection on the Ghosh lineage and why the 84-pose challenge is still the gold standard for teachers.",
                "body": "The 84-asana challenge system, taught at Ghosh's College in Kolkata since 1923, remains the deepest practical body of work in hatha yoga. This post explains why we still use it — and how Core 84 fits into a modern practice.",
                "cover_image": "https://images.squarespace-cdn.com/content/v1/620bca2d082bbf5542408178/1645553998616-K2P2CXQSJD43Y1JDV59X/Core+84.jpg",
                "category": "blog", "tags": ["philosophy", "core-84", "ghosh"],
                "is_published": True, "published_at": (base_now - timedelta(days=5)).isoformat(),
                "author_id": "seed", "author_name": "Tony Sanchez",
                "created_at": (base_now - timedelta(days=5)).isoformat(),
            },
        ]
        await db.news_posts.insert_many(starter_posts)

    # Seed starter podcast/broadcast episodes (idempotent — only if empty)
    if await db.broadcasts.count_documents({}) == 0:
        bnow = now_utc()
        await db.broadcasts.insert_many([
            {
                "id": gen_id(), "title": "The breath is the practice",
                "description": "A short talk on why pranayama comes first — and how the breath steadies the nervous system before a single pose.",
                "media_type": "audio",
                "media_url": "https://assets.mixkit.co/active_storage/sfx/2434/2434.wav",
                "cover_image": "https://images.pexels.com/photos/8436684/pexels-photo-8436684.jpeg?auto=compress",
                "tags": ["philosophy", "breath", "beginner"],
                "program_id": None, "series": "Foundations", "publish_at": bnow.isoformat(),
                "is_published": True, "notify_push": False, "notified": True,
                "views": 0, "created_at": bnow.isoformat(),
            },
            {
                "id": gen_id(), "title": "Inside the Ghosh lineage",
                "description": "A video conversation on the 84-asana system, its history from Kolkata, and what it means for a modern practice.",
                "media_type": "video",
                "media_url": "https://www.youtube.com/watch?v=inpok4MKVLM",
                "cover_image": "https://images.squarespace-cdn.com/content/v1/620bca2d082bbf5542408178/1645553998616-K2P2CXQSJD43Y1JDV59X/Core+84.jpg",
                "tags": ["history", "core-84"],
                "program_id": None, "series": "Foundations", "publish_at": (bnow - timedelta(days=3)).isoformat(),
                "is_published": True, "notify_push": False, "notified": True,
                "views": 0, "created_at": (bnow - timedelta(days=3)).isoformat(),
            },
        ])

    # Idempotent: assign the instructor their classes + a revenue-share rule
    # (runs after templates/instances/programs exist).
    instructor = await db.users.find_one({"email": "instructor@demo.com"})
    if instructor:
        iid = instructor["id"]
        pw = await db.class_templates.find_one({"title": "Power Yoga"})
        if pw and pw.get("instructor_id") != iid:
            await db.class_templates.update_one({"id": pw["id"]}, {"$set": {"instructor_id": iid}})
            await db.class_instances.update_many({"template_id": pw["id"]}, {"$set": {"instructor_id": iid}})
        prog = await db.programs.find_one({"title": "Core 40 Fitness"})
        if prog and not await db.revenue_share_rules.find_one({"instructor_id": iid}):
            await db.revenue_share_rules.insert_one({
                "id": gen_id(), "instructor_id": iid, "type": "program",
                "target_id": prog["id"], "percentage": 50.0, "created_at": now_utc().isoformat(),
            })

    # Seed the Asana Index — searchable pose library (idempotent — only if empty)
    if await db.asanas.count_documents({}) == 0:
        anow = now_utc().isoformat()
        poses = [
            {"name": "Half Moon Pose", "sanskrit": "Ardha Chandrasana", "category": "Standing", "difficulty": "beginner",
             "benefits": ["Opens the chest and shoulders", "Strengthens the spine", "Improves lateral flexibility"],
             "description": "A deep standing side-bend that lengthens the whole spine and opens the ribcage.",
             "cover_image": "https://images.pexels.com/photos/14051370/pexels-photo-14051370.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"},
            {"name": "Awkward Pose", "sanskrit": "Utkatasana", "category": "Standing", "difficulty": "beginner",
             "benefits": ["Strengthens thighs and calves", "Builds heat and stamina", "Tones the core"],
             "description": "Three-part chair-like pose that builds strength and balance in the legs.",
             "cover_image": "https://images.unsplash.com/photo-1593164842264-854604db2260?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"},
            {"name": "Eagle Pose", "sanskrit": "Garurasana", "category": "Balancing", "difficulty": "intermediate",
             "benefits": ["Improves balance and focus", "Opens the major joints", "Boosts circulation"],
             "description": "A wrapped standing balance that compresses then flushes the joints.",
             "cover_image": "https://images.unsplash.com/photo-1767611114501-ee5c2ea37ee7?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"},
            {"name": "Triangle Pose", "sanskrit": "Trikonasana", "category": "Standing", "difficulty": "beginner",
             "benefits": ["Stretches hamstrings and hips", "Strengthens the legs", "Relieves back tension"],
             "description": "The master pose of the standing series — combines strength, stretch and balance.",
             "cover_image": "https://images.unsplash.com/photo-1606663368493-131f4f97c095?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"},
            {"name": "Tree Pose", "sanskrit": "Vrksasana", "category": "Balancing", "difficulty": "beginner",
             "benefits": ["Improves standing balance", "Strengthens ankles and legs", "Calms the mind"],
             "description": "A grounding one-legged balance that builds steadiness and concentration.",
             "cover_image": "https://images.pexels.com/photos/8173547/pexels-photo-8173547.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"},
            {"name": "Cobra Pose", "sanskrit": "Bhujangasana", "category": "Backbend", "difficulty": "beginner",
             "benefits": ["Strengthens the spine", "Opens the chest", "Eases lower-back stiffness"],
             "description": "A gentle prone backbend that strengthens the back body and opens the heart.",
             "cover_image": "https://images.unsplash.com/photo-1717821552922-61e18814a44a?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"},
            {"name": "Bow Pose", "sanskrit": "Dhanurasana", "category": "Backbend", "difficulty": "intermediate",
             "benefits": ["Opens the whole front body", "Strengthens the back", "Stimulates digestion"],
             "description": "A full backbend that stretches the entire front of the body like a drawn bow.",
             "cover_image": "https://images.pexels.com/photos/3822366/pexels-photo-3822366.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"},
            {"name": "Camel Pose", "sanskrit": "Ustrasana", "category": "Backbend", "difficulty": "intermediate",
             "benefits": ["Deeply opens the chest and hip flexors", "Improves posture", "Energising"],
             "description": "A kneeling backbend and the deepest heart-opener of the Core sequence.",
             "cover_image": "https://images.unsplash.com/photo-1723406230636-aa8c4ac1e6c5?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"},
            {"name": "Rabbit Pose", "sanskrit": "Sasangasana", "category": "Forward Fold", "difficulty": "intermediate",
             "benefits": ["Stretches the spine and back", "Calms the nervous system", "Counter-poses backbends"],
             "description": "A rounded forward fold that decompresses the spine after backbending.",
             "cover_image": "https://images.unsplash.com/photo-1767611128194-1b6e3fbd5861?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"},
            {"name": "Seated Spine Twist", "sanskrit": "Ardha Matsyendrasana", "category": "Twist", "difficulty": "beginner",
             "benefits": ["Improves spinal mobility", "Aids digestion", "Releases the lower back"],
             "description": "A seated twist that wrings out the spine from top to bottom.",
             "cover_image": "https://images.unsplash.com/photo-1730672786064-c0836eeb41c2?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"},
            {"name": "Headstand", "sanskrit": "Sirsasana", "category": "Inversion", "difficulty": "advanced",
             "benefits": ["Builds core and shoulder strength", "Improves focus", "Boosts circulation"],
             "description": "The king of asanas — a full inversion that demands strength and steadiness.",
             "cover_image": "https://images.unsplash.com/photo-1560233075-4c1e2007908e?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"},
            {"name": "Corpse Pose", "sanskrit": "Savasana", "category": "Restorative", "difficulty": "beginner",
             "benefits": ["Deep relaxation", "Integrates the practice", "Lowers stress"],
             "description": "Total stillness — the most important and most challenging pose of all.",
             "cover_image": "https://images.unsplash.com/photo-1767611104976-86ce57776dc3?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"},
        ]
        docs = []
        for i, p in enumerate(poses):
            docs.append({
                "id": gen_id(), **p,
                "youtube_url": "", "youtube_id": None,
                "start_seconds": 0, "end_seconds": None, "program_id": None,
                "order_index": i, "is_published": True, "created_at": anow,
            })
        await db.asanas.insert_many(docs)

    # Seed Meditation & Breathwork module (idempotent — only if empty)
    if await db.meditations.count_documents({}) == 0:
        mnow = now_utc().isoformat()
        AU = [f"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-{n}.mp3" for n in range(1, 6)]
        def U(u): return u if u.startswith("https://images.pexels") else (u + "?auto=format&fit=crop&w=800&q=80")
        meds = [
            {"title": "Morning Calm Meditation", "kind": "meditation", "duration_minutes": 10, "focus_areas": ["Focus", "Grounding"], "description": "A gentle sit to arrive, settle the breath and set an intention for the day.", "cover_image": U("https://images.unsplash.com/photo-1506126613408-eca07ce68773")},
            {"title": "Let Go of the Day", "kind": "meditation", "duration_minutes": 15, "focus_areas": ["Stress relief", "Sleep"], "description": "Unwind the nervous system and release tension held from the day.", "cover_image": U("https://images.unsplash.com/photo-1522075782449-e45a34f1ddfb")},
            {"title": "Gratitude Practice", "kind": "meditation", "duration_minutes": 8, "focus_areas": ["Gratitude", "Focus"], "description": "A short heart-centred practice to cultivate appreciation.", "cover_image": U("https://images.unsplash.com/photo-1533162507191-d90c625b2640")},
            {"title": "Box Breathing Reset", "kind": "breathwork", "duration_minutes": 6, "focus_areas": ["Stress relief", "Breath control"], "description": "Equal-count breathing (4-4-4-4) to steady the mind in minutes.", "cover_image": U("https://images.unsplash.com/photo-1518708909080-704599b19972")},
            {"title": "Energising Breath of Fire", "kind": "breathwork", "duration_minutes": 7, "focus_areas": ["Energy", "Breath control"], "description": "Kapalabhati-style breathing to wake up the body and clear the mind.", "cover_image": U("https://images.unsplash.com/photo-1554244933-d876deb6b2ff")},
            {"title": "Alternate Nostril (Nadi Shodhana)", "kind": "breathwork", "duration_minutes": 10, "focus_areas": ["Anxiety relief", "Focus"], "description": "Balancing pranayama to calm anxiety and sharpen focus.", "cover_image": U("https://images.unsplash.com/photo-1532798442725-41036acc7489")},
            {"title": "Yoga Nidra for Deep Sleep", "kind": "nidra", "duration_minutes": 30, "focus_areas": ["Sleep", "Stress relief"], "description": "A full yogic-sleep journey to guide you into deep rest.", "cover_image": U("https://images.unsplash.com/photo-1593358578736-186f3d13c789")},
            {"title": "Afternoon Nidra Reset", "kind": "nidra", "duration_minutes": 20, "focus_areas": ["Stress relief", "Sleep"], "description": "A midday reset to restore energy without a full nap.", "cover_image": U("https://images.unsplash.com/photo-1613602025754-04e1b4a24156")},
            {"title": "Body Scan Nidra", "kind": "nidra", "duration_minutes": 25, "focus_areas": ["Grounding", "Sleep"], "description": "A slow rotation of consciousness through the body to fully let go.", "cover_image": U("https://images.pexels.com/photos/6111596/pexels-photo-6111596.jpeg")},
        ]
        mdocs = []
        for i, m in enumerate(meds):
            mdocs.append({
                "id": gen_id(), **m,
                "media_kind": "audio", "audio_url": AU[i % len(AU)],
                "youtube_url": "", "youtube_id": None,
                "level": "beginner", "language": "both",
                "order_index": i, "is_published": True, "created_at": mnow,
            })
        await db.meditations.insert_many(mdocs)


    # Backfill discovery tags (focus/intensity/language) on programs + on-demand videos
    _FMAP = {"beginner": "gentle", "intermediate": "moderate", "advanced": "strong"}
    _FOCUS_ALL = ["Back care", "Flexibility", "Balance", "Strength", "Stress relief", "Sleep", "Energy", "Beginner basics"]
    def _focus(title, level):
        t = (title or "").lower(); f = set()
        if "back" in t or "cobra" in t or "locust" in t or "bow" in t or "camel" in t or "backbend" in t: f.update(["Back care", "Flexibility"])
        if "standing" in t or "triangle" in t or "warrior" in t or "balanc" in t or "eagle" in t or "tree" in t: f.update(["Balance", "Strength"])
        if "core 40" in t: f.update(["Strength", "Balance"])
        if "core 84" in t or (level or "") == "advanced": f.update(["Strength", "Flexibility"])
        if "core 26" in t or (level or "") == "beginner": f.update(["Beginner basics", "Flexibility"])
        if "forward" in t or "stretch" in t or "split" in t: f.add("Flexibility")
        if "breath" in t or "pranayama" in t or "medit" in t or "savasana" in t or "relax" in t or "nidra" in t or "yin" in t or "restor" in t: f.update(["Stress relief", "Sleep"])
        return f
    for _coll in (db.programs, db.videos):
        _idx = 0
        async for _doc in _coll.find({}).sort("title", 1):
            _upd = {}
            if not _doc.get("focus_areas"):
                _f = _focus(_doc.get("title"), _doc.get("level"))
                if _coll is db.videos:
                    _f.add(_FOCUS_ALL[_idx % len(_FOCUS_ALL)])  # rotate → every focus chip has content
                _upd["focus_areas"] = sorted(_f) or ["Flexibility", "Strength"]
            if not _doc.get("intensity"): _upd["intensity"] = _FMAP.get((_doc.get("level") or "").lower(), "moderate")
            if not _doc.get("language"): _upd["language"] = "both"
            if _upd: await _coll.update_one({"id": _doc["id"]}, {"$set": _upd})
            _idx += 1


    try:
        await db.class_instances.create_index("start_time")
        await db.bookings.create_index([("user_id", 1), ("class_instance_id", 1)])
        await db.magic_link_tokens.create_index("email")
        await db.magic_link_tokens.create_index("token_sha")
        await db.password_reset_tokens.create_index("token_sha")
        await db.payment_transactions.create_index("session_id", unique=True)
        await db.users.create_index("referral_code")
        await db.referral_invites.create_index([("referrer_id", 1), ("created_at", -1)])
        await db.news_posts.create_index("slug", unique=True)
        await db.news_posts.create_index([("is_published", 1), ("published_at", -1)])
    except Exception as e:
        logger.warning(f"Index creation issue: {e}")
