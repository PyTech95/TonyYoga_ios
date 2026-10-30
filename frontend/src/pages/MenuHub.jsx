import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Calendar, GraduationCap, Play, Flower2, Mic, ShoppingBag, Sparkles, Ticket, MountainSnow, User, Heart, Trophy, LifeBuoy, Compass, ChevronRight, FileText, Newspaper } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useCmsPages } from "@/lib/siteData";

const GROUPS = [
  {
    title: "Practise & watch",
    items: [
      { to: "/schedule", label: "Live schedule", desc: "Book today's live classes", icon: Calendar, tid: "menu-schedule" },
      { to: "/challenges", label: "30-day challenge", desc: "Your daily practice", icon: Trophy, tid: "menu-challenges" },
      { to: "/programs", label: "Programs", desc: "Multi-week guided courses", icon: GraduationCap, tid: "menu-programs" },
      { to: "/meditations", label: "Meditation & breath", desc: "Calm, focus and rest", icon: Flower2, tid: "menu-meditations" },
      { to: "/broadcasts", label: "Podcast", desc: "Talks and conversations", icon: Mic, tid: "menu-podcast" },
    ],
  },
  {
    title: "Shop",
    items: [
      { to: "/shop", label: "Shop", desc: "Books, mats, apparel & more", icon: ShoppingBag, tid: "menu-shop" },
    ],
  },
  {
    title: "Join & train",
    items: [
      { to: "/memberships", label: "Membership", desc: "Unlimited classes, cancel anytime", icon: Sparkles, tid: "menu-memberships" },
      { to: "/passes", label: "Class passes", desc: "Pay per class, no commitment", icon: Ticket, tid: "menu-passes" },
      { to: "/teacher-training", label: "Teacher training", desc: "200 · 300 · 500-hour paths", icon: GraduationCap, tid: "menu-teacher-training" },
      { to: "/workshops", label: "Retreats", desc: "Small-group retreats in Spain", icon: MountainSnow, tid: "menu-retreats" },
    ],
  },
  {
    title: "My account",
    items: [
      { to: "/my-yoga", label: "My Yoga", desc: "Your membership, courses, classes & orders", icon: Flower2, tid: "menu-my-yoga" },
      { to: "/my-yoga?tab=orders", label: "My orders", desc: "Order status and parcel tracking", icon: ShoppingBag, tid: "menu-orders" },
      { to: "/profile", label: "My profile", desc: "Bookings, membership & settings", icon: User, tid: "menu-profile" },
      { to: "/wishlist", label: "Saved & wishlist", desc: "Things you've saved for later", icon: Heart, tid: "menu-wishlist" },
      { to: "/leaderboard", label: "Leaderboard", desc: "Your streaks and community", icon: Trophy, tid: "menu-leaderboard" },
      { to: "/support", label: "Help & contact", desc: "We're here if you're stuck", icon: LifeBuoy, tid: "menu-support" },
    ],
  },
];

export default function MenuHub() {
  const [challengesEnabled, setChallengesEnabled] = useState(false);
  // Pages marked "Show in app menu" in Admin → Custom pages, plus the Journal.
  const cmsPages = useCmsPages().filter((p) => p.show_in_app_menu);
  const groups = [
    ...GROUPS.slice(0, 3),
    {
      title: "About Tony Yoga",
      items: [
        ...cmsPages.map((p) => ({ to: `/${p.slug}`, label: p.menu_label || p.title, desc: p.eyebrow || "", icon: FileText, tid: `menu-page-${p.slug}` })),
        { to: "/news", label: "Journal", desc: "News and writing from Tony", icon: Newspaper, tid: "menu-news" },
      ],
    },
    ...GROUPS.slice(3),
  ];
  useEffect(() => { api.get("/settings/public").then(({ data }) => setChallengesEnabled(!!data.challenges_enabled)).catch(() => {}); }, []);
  return (
    <div data-testid="menu-hub-page">
      <PageHeader eyebrow="Everything in one place" title="Menu" testId="menu-header" />
      <div className="mx-auto max-w-2xl px-4 pb-10 space-y-7">
        {groups.map((g) => (
          <section key={g.title}>
            <h2 className="eyebrow !text-[#839682] mb-3 px-1">{g.title}</h2>
            <div className="rounded-3xl bg-white border border-[#E5E6DF] overflow-hidden divide-y divide-[#EFEFE9]">
              {g.items.filter(it => it.to !== "/challenges" || challengesEnabled).map((it) => (
                <Link
                  key={it.tid}
                  to={it.to}
                  data-testid={it.tid}
                  className="flex items-center gap-4 px-4 py-4 hover:bg-[#F7F6F1] active:bg-[#F2F2EC] transition-colors"
                >
                  <span className="h-11 w-11 rounded-full bg-[#FBF1EE] flex items-center justify-center shrink-0">
                    <it.icon className="h-5 w-5 text-[#B25A45]" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[15px] text-[#1C221F] leading-tight">{it.label}</span>
                    <span className="block text-[13px] text-[#6B7269] leading-snug mt-0.5">{it.desc}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-[#C3C6BE] shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
