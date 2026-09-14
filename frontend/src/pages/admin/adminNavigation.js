import { LayoutDashboard, Youtube, Package, GraduationCap, Calendar, ClipboardCheck, Mic, MountainSnow, Gift, Settings, Upload, Flower2, Sparkles, ShoppingBag, Truck, Image, FileText, MessageSquareQuote, Smartphone, CalendarClock, CreditCard } from "lucide-react";

export const ADMIN_GROUPS = [
  { label: "Workspace", items: [{ key: "stats", label: "Overview", icon: LayoutDashboard }] },
  { label: "Website & app", items: [
    { key: "content", label: "Pages & live editor", icon: FileText },
    { key: "images", label: "Site images", icon: Image },
    { key: "testimonials", label: "Testimonials", icon: MessageSquareQuote },
    { key: "downloads", label: "App & pop-up offers", icon: Smartphone },
  ] },
  { label: "Teaching & content", items: [
    { key: "courses", label: "Courses & videos", icon: Youtube },
    { key: "classes", label: "Classes & schedule", icon: Calendar },
    { key: "pricing", label: "Class pricing", icon: CreditCard },
    { key: "private", label: "Private sessions", icon: CalendarClock },
    { key: "availability", label: "Availability", icon: Calendar },
    { key: "asanas", label: "Asana index", icon: Flower2 },
    { key: "meditations", label: "Meditation & breath", icon: Sparkles },
    { key: "challenges", label: "Challenges", icon: Sparkles },
    { key: "retreats", label: "Retreats", icon: MountainSnow },
  ] },
  { label: "Community", items: [
    { key: "students", label: "Students & access", icon: GraduationCap },
    { key: "apps", label: "Applications", icon: ClipboardCheck },
    { key: "leads", label: "Quiz leads", icon: Sparkles },
    { key: "broadcast", label: "Broadcasts", icon: Mic },
  ] },
  { label: "Commerce", items: [
    { key: "shop", label: "Shop & products", icon: ShoppingBag },
    { key: "orders", label: "Orders & fulfillment", icon: Truck },
    { key: "printmedia", label: "Printful & print media", icon: Truck },
    { key: "bundles", label: "Bundles", icon: Package },
    { key: "giftcards", label: "Gift cards", icon: Gift },
  ] },
  { label: "Administration", items: [
    { key: "settings", label: "Settings & integrations", icon: Settings },
    { key: "import", label: "Import", icon: Upload },
  ] },
];
export const ADMIN_NAV = ADMIN_GROUPS.flatMap(group => group.items);