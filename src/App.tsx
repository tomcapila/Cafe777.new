import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './contexts/LanguageContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { FeatureFlagProvider } from './contexts/FeatureFlagContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Header from './components/Header';
import BottomNavigation from './components/BottomNavigation';

const Home = lazy(() => import('./pages/Home'));
const MotorFeed = lazy(() => import('./pages/MotorFeed'));
const Profile = lazy(() => import('./pages/Profile'));
const EditProfile = lazy(() => import('./pages/EditProfile'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Login = lazy(() => import('./pages/Login'));
const InviteLanding = lazy(() => import('./pages/InviteLanding'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const Discover = lazy(() => import('./pages/Discover'));
const Events = lazy(() => import('./pages/Events'));
const EventDetails = lazy(() => import('./pages/EventDetails'));
const SubmitPhoto = lazy(() => import('./pages/SubmitPhoto'));
const ContestPage = lazy(() => import('./pages/ContestPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const Admin = lazy(() => import('./pages/Admin'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const RoadsDiscovery = lazy(() => import('./pages/RoadsDiscovery'));
const MotoClubsHub = lazy(() => import('./pages/MotoClubsHub'));
const Passport = lazy(() => import('./pages/Passport'));
const ScannerPage = lazy(() => import('./pages/ScannerPage'));
const AmbassadorDashboard = lazy(() => import('./pages/AmbassadorDashboard'));
const FAQ = lazy(() => import('./pages/FAQ'));
const About = lazy(() => import('./pages/About'));
const Messages = lazy(() => import('./pages/Messages'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const PartsAndService = lazy(() => import('./pages/PartsAndService'));
const CreateRelato = lazy(() => import('./pages/CreateRelato'));
const PlaceDetail = lazy(() => import('./pages/PlaceDetail'));
const RouteDetail = lazy(() => import('./pages/RouteDetail'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full w-full">
      <div className="w-10 h-10 border-4 border-steel/20 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <NotificationProvider>
          <FeatureFlagProvider>
            <Router>
              <div className="h-[100dvh] flex flex-col bg-engine text-chrome font-sans selection:bg-primary/30 grid-pattern overflow-hidden">
                <Header />
            
            <main className="flex-1 relative z-10 overflow-y-auto overflow-x-hidden pt-20 pb-20">
              <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/motorfeed" element={<MotorFeed />} />
                <Route path="/profile" element={<ProfileRedirect />} />
                <Route path="/profile/:username" element={<Profile />} />
                <Route path="/edit-profile/:username" element={<EditProfile />} />
                <Route path="/register" element={<Navigate to="/onboarding" replace />} />
                <Route path="/invite/:code" element={<InviteLanding />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/events" element={<Events />} />
                <Route path="/events/:id" element={<EventDetails />} />
                <Route path="/submit-photo" element={<SubmitPhoto />} />
                <Route path="/contest" element={<ContestPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/scan" element={<ScannerPage />} />
                <Route path="/roads" element={<RoadsDiscovery />} />
                <Route path="/relatos/new" element={<CreateRelato />} />
                <Route path="/place/:placeId" element={<PlaceDetail />} />
                <Route path="/route/:routeId" element={<RouteDetail />} />
                <Route path="/clubs" element={<MotoClubsHub />} />
                <Route path="/passport" element={<Passport />} />
                <Route path="/ambassador" element={<AmbassadorDashboard />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/faq" element={<FAQ />} />
                <Route path="/about" element={<About />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/parts-and-service" element={<PartsAndService />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
              </Routes>
              </Suspense>
            </main>

            <BottomNavigation />
          </div>
        </Router>
        </FeatureFlagProvider>
      </NotificationProvider>
    </LanguageProvider>
    </ThemeProvider>
  );
}

function ProfileRedirect() {
  const storedUser = localStorage.getItem('user');
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      if (user && user.username) {
        return <Navigate to={`/profile/${user.username}`} replace />;
      }
    } catch (e) {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    }
  }
  return <Navigate to="/login" replace />;
}
