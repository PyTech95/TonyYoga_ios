import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import { isNativeApp } from "@/lib/platform";
import { getAuthDestination } from "@/lib/authRouting";
import { UsageTracker } from "@/components/UsageTracker";
import AppShell from "@/components/AppShell";
import Marketing from "@/pages/Marketing";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import HomePage from "@/pages/Home";
import Schedule from "@/pages/Schedule";
import ClassDetail from "@/pages/ClassDetail";
import Programs from "@/pages/Programs";
import ProgramDetail from "@/pages/ProgramDetail";
import Asanas from "@/pages/Asanas";
import Discover from "@/pages/Discover";
import Meditations from "@/pages/Meditations";
import FindYourPath from "@/pages/FindYourPath";
import Library from "@/pages/Library";
import VideoPlayer from "@/pages/VideoPlayer";
import Memberships from "@/pages/Memberships";
import Shop from "@/pages/Shop";
import ProductDetail from "@/pages/ProductDetail";
import Workshops from "@/pages/Workshops";
import News from "@/pages/News";
import Broadcasts from "@/pages/Broadcasts";
import Profile from "@/pages/Profile";
import Referrals from "@/pages/Referrals";
import Admin from "@/pages/Admin";
import Instructor from "@/pages/Instructor";
import ResetPassword from "@/pages/ResetPassword";
import MagicLink from "@/pages/MagicLink";
import Cart from "@/pages/Cart";
import WorkshopDetail from "@/pages/WorkshopDetail";
import Streak from "@/pages/Streak";
import Leaderboard from "@/pages/Leaderboard";
import Passes from "@/pages/Passes";
import Wishlist from "@/pages/Wishlist";
import { CheckoutSuccess, CheckoutCancel } from "@/pages/Checkout";
import Certificate from "@/pages/Certificate";
import MenuHub from "@/pages/MenuHub";
import TeacherTraining from "@/pages/TeacherTraining";
import PrivateSessions from "@/pages/PrivateSessions";
import Challenges from "@/pages/Challenges";
import Privacy from "@/pages/legal/Privacy";
import Terms from "@/pages/legal/Terms";
import AccountDeletion from "@/pages/legal/AccountDeletion";
import Support from "@/pages/legal/Support";
import Locations from "@/pages/Locations";
import LocationDetail from "@/pages/LocationDetail";
import CustomPage from "@/pages/CustomPage";
import NewsArticle from "@/pages/NewsArticle";
import { RouteSeo } from "@/lib/seo";
import { AppDownloads } from "@/components/AppDownloads";
import AssistantWidget from "@/components/AssistantWidget";
import LiveEditor from "@/lib/liveEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import "@/App.css";
import { isIOSApp } from "@/lib/iosPlatform";
import IOSCommerceLifecycle from "@/components/IOSCommerceLifecycle";
import AuthLoading from "@/components/AuthLoading";
import IOSAssistantConsent from "@/components/IOSAssistantConsent";

function RequireAuth({ children }) {
  const { user, ready, networkError } = useAuth();
  if (!ready || (networkError && !user)) return <AuthLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Landed() {
  const { user, ready, networkError } = useAuth();
  if (!ready || (networkError && !user)) return <AuthLoading />;
  return user ? <Navigate to={getAuthDestination(user)} replace /> : <Landing />;
}

function AppRoot() {
  // Web: the public marketing/landing page stays at "/".
  // Mobile app (Capacitor): skip the landing page — go straight to /home if the
  // user's session is still valid, otherwise to the login / sign-up page.
  const { user, ready, networkError } = useAuth();
  if (isNativeApp()) {
    if (!ready || (networkError && !user)) return <AuthLoading />;
    return <Navigate to={user ? getAuthDestination(user) : "/login"} replace />;
  }
  return <Marketing />;
}

export default function App() {
  const NATIVE = isNativeApp();
  return (
    <AuthProvider>
      <BrowserRouter>
        {!isIOSApp() && <UsageTracker />}
        <IOSCommerceLifecycle />
        {/* Default title / description / canonical / robots per route (website only). */}
        <RouteSeo />
        <Routes>
          <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
          <Route path="/certificate/:code" element={<Certificate />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/account-deletion" element={<AccountDeletion />} />
          <Route path="/support" element={<Support />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/locations/:slug" element={<LocationDetail />} />
          {/* Pages from Admin → Custom pages and Journal posts: website layout on the web,
              inside the app shell (tab bar, back button) in the iOS/Android app. */}
          {!NATIVE && <Route path="/news/:slug" element={<NewsArticle />} />}
          {!NATIVE && <Route path="/:slug" element={<CustomPage />} />}
          <Route element={<AppShell />}>
            <Route path="/" element={<AppRoot />} />
            <Route path="/welcome" element={<Landed />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/magic-link" element={<MagicLink />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/schedule/:id" element={<ClassDetail />} />
            <Route path="/programs" element={<Programs />} />
            <Route path="/programs/:id" element={<ProgramDetail />} />
            <Route path="/asanas" element={<Asanas />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/meditations" element={<Meditations />} />
            <Route path="/find-your-path" element={<FindYourPath />} />
            <Route path="/quiz" element={<FindYourPath />} />
            <Route path="/breathwork" element={<Meditations />} />
            <Route path="/library" element={<Library />} />
            <Route path="/library/:id" element={<VideoPlayer />} />
            <Route path="/memberships" element={<Memberships />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/menu" element={<RequireAuth><MenuHub /></RequireAuth>} />
            <Route path="/teacher-training" element={<TeacherTraining />} />
            <Route path="/private-sessions" element={<PrivateSessions />} />
            <Route path="/challenges" element={<Challenges />} />
            <Route path="/shop/:id" element={<ProductDetail />} />
            <Route path="/workshops" element={<Workshops />} />
            <Route path="/workshops/:id" element={<WorkshopDetail />} />
            <Route path="/news" element={<News />} />
            <Route path="/broadcasts" element={<Broadcasts />} />
            <Route path="/broadcasts/:id" element={<Broadcasts />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/streak" element={<RequireAuth><Streak /></RequireAuth>} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/passes" element={<Passes />} />
            <Route path="/wishlist" element={<RequireAuth><Wishlist /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="/referrals" element={isIOSApp() ? <Navigate to="/profile" replace /> : <RequireAuth><Referrals /></RequireAuth>} />
            <Route path="/instructor" element={<RequireAuth><Instructor /></RequireAuth>} />
            <Route path="/checkout/success" element={<CheckoutSuccess />} />
            <Route path="/checkout/cancel" element={<CheckoutCancel />} />
            {NATIVE && <Route path="/news/:slug" element={<NewsArticle />} />}
            {NATIVE && <Route path="/:slug" element={<CustomPage />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        {/* Floating extras must never take the whole app down with them. */}
        <ErrorBoundary fallback={null}><AppDownloads /></ErrorBoundary>
        <ErrorBoundary fallback={null}>{isIOSApp() ? <IOSAssistantConsent><AssistantWidget /></IOSAssistantConsent> : <AssistantWidget />}</ErrorBoundary>
        {!isIOSApp() && <ErrorBoundary fallback={null}><LiveEditor /></ErrorBoundary>}
        <Toaster
          position="top-center"
          offset={{ top: "calc(var(--sat) + 16px)" }}
          mobileOffset={{ top: "calc(var(--sat) + 10px)", left: "12px", right: "12px" }}
          toastOptions={{
            style: {
              background: "#1C221F",
              color: "#FAFAF7",
              border: "none",
              borderRadius: "999px",
              padding: "10px 20px",
              fontSize: "13px",
            },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}
