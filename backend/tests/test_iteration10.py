"""Iteration 10: i18n localization (Memberships/Schedule) + mixkit video URL upgrade."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"

MIXKIT_SUBSTR = "mixkit-young-woman-doing-yoga-on-a-rooftop"


# ---------- Membership plans i18n ----------
def test_membership_plans_three_with_i18n_prefix():
    r = requests.get(f"{API}/membership-plans", timeout=15)
    assert r.status_code == 200, r.text
    plans = r.json()
    assert isinstance(plans, list)
    assert len(plans) == 3, f"expected 3 plans, got {len(plans)}: {[p.get('name') for p in plans]}"
    for p in plans:
        # name
        assert isinstance(p.get("name"), str)
        assert p["name"].startswith("i18n:memb.plan."), p
        # description
        assert isinstance(p.get("description"), str)
        assert p["description"].startswith("i18n:"), p
        # features: list of i18n keys
        feats = p.get("features", [])
        assert isinstance(feats, list) and len(feats) > 0, p
        for f in feats:
            assert isinstance(f, str)
            assert f.startswith("i18n:memb.feat."), f"feature must be i18n key: {f}"
        # billing_cycle key
        bc = p.get("billing_cycle")
        assert isinstance(bc, str)
        # Either i18n key or plain 'monthly'/'yearly'
        assert bc.startswith("i18n:memb.cycle.") or bc in ("monthly", "yearly"), bc


def test_membership_plan_expected_names_present():
    r = requests.get(f"{API}/membership-plans", timeout=15)
    plans = r.json()
    names = sorted([p["name"] for p in plans])
    # Expected keys per review request: essential / unlimited / annual
    joined = " ".join(names)
    assert "essential" in joined.lower()
    assert "unlimited" in joined.lower()
    assert "annual" in joined.lower()


# ---------- Mixkit video URL upgrade ----------
def test_all_videos_use_mixkit_url():
    r = requests.get(f"{API}/videos", timeout=15)
    assert r.status_code == 200, r.text
    vids = r.json()
    assert isinstance(vids, list) and len(vids) > 0
    bad = []
    missing = []
    for v in vids:
        url = v.get("video_url")
        if not url:
            # Locked-strip may have removed it; skip
            missing.append(v.get("id"))
            continue
        assert "mov_bbb.mp4" not in url, f"video {v.get('id')} still using bbb: {url}"
        # All should be mixkit
        if MIXKIT_SUBSTR not in url:
            bad.append((v.get("id"), url))
    assert not bad, f"non-mixkit URLs: {bad[:5]}"


def test_program_first_lesson_video_url_is_mixkit():
    progs = requests.get(f"{API}/programs", timeout=15).json()
    assert len(progs) >= 1
    for p in progs:
        detail = requests.get(f"{API}/programs/{p['id']}", timeout=15).json()
        lessons = detail.get("lessons", [])
        assert len(lessons) >= 2
        l0 = lessons[0]
        assert l0.get("is_free_preview") is True, l0
        assert l0.get("is_unlocked") is True
        url = l0["video"].get("video_url")
        assert url, "free preview must expose video_url"
        assert MIXKIT_SUBSTR in url, f"first lesson url not mixkit: {url}"
        # locked rest
        for l in lessons[1:]:
            assert l.get("is_unlocked") is False
            v = l.get("video", {}) or {}
            assert not v.get("video_url"), f"locked lesson leaked url: {v}"


# ---------- Stripe checkout regression: membership session ----------
def test_checkout_session_membership_anonymous():
    plans = requests.get(f"{API}/membership-plans", timeout=15).json()
    plan_id = plans[0]["id"]
    payload = {
        "item_type": "membership",
        "item_id": plan_id,
        "success_url": f"{BASE_URL}/checkout/success",
        "cancel_url": f"{BASE_URL}/memberships",
    }
    r = requests.post(f"{API}/checkout/session", json=payload, timeout=20)
    # Anonymous may require auth -> 401, or accept and return a url.
    # We accept either 200/201 with checkout url OR 401/403 indicating auth required.
    assert r.status_code in (200, 201, 401, 403), r.text
    if r.status_code in (200, 201):
        d = r.json()
        # Common keys
        assert any(k in d for k in ("url", "checkout_url", "session_url", "session_id", "id")), d
