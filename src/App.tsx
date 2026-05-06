import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './contexts/LanguageContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { FeatureFlagProvider } from './contexts/FeatureFlagContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Header from './components/Header';
import BottomNavigation from './components/BottomNavigation';
import Home from './pages/Home';
import MotorFeed from './pages/MotorFeed';
import Profile from './pages/Profile';
import EditProfile from './pages/EditProfile';
import Onboarding from './pages/Onboarding';
import Login from './pages/Login';
import InviteLanding from './pages/InviteLanding';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import Discover from './pages/Discover';
import Events from './pages/Events';
import EventDetails from './pages/EventDetails';
import SubmitPhoto from './pages/SubmitPhoto';
import ContestPage from './pages/ContestPage';
import NotificationsPage from './pages/NotificationsPage';
import Admin from './pages/Admin';
import AdminLogin from './pages/AdminLogin';
import RoadsDiscovery from './pages/RoadsDiscovery';
import MotoClubsHub from './pages/MotoClubsHub';
import Passport from './pages/Passport';
import ScannerPage from './pages/ScannerPage';
import AmbassadorDashboard from './pages/AmbassadorDashboard';
import FAQ from './pages/FAQ';
import About from './pages/About';
import Messages from './pages/Messages';
import PrivacyPolicy from './pages/PrivacyPolicy';

import PartsAndService from './pages/PartsAndService';

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
