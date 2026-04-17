import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { APIProvider } from '@vis.gl/react-google-maps';
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
import Messages from './pages/Messages';
import PrivacyPolicy from './pages/PrivacyPolicy';

import PartsAndService from './pages/PartsAndService';

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

export default function App() {
  if (!hasValidKey) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'sans-serif',backgroundColor:'#141414',color:'#fff'}}>
        <div style={{textAlign:'center',maxWidth:520,padding:'2rem',backgroundColor:'#222',borderRadius:'12px'}}>
          <h2 style={{marginBottom:'1rem',fontSize:'1.5rem'}}>Google Maps API Key Required</h2>
          <p style={{marginBottom:'1rem'}}><strong>Step 1:</strong> <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noopener" style={{color:'#f97316'}}>Get an API Key</a></p>
          <p style={{marginBottom:'0.5rem'}}><strong>Step 2:</strong> Add your key as a secret in AI Studio:</p>
          <ul style={{textAlign:'left',lineHeight:'1.8',marginBottom:'1rem',listStyle:'disc',paddingLeft:'1.5rem'}}>
            <li>Open <strong>Settings</strong> (⚙️ gear icon, <strong>top-right corner</strong>)</li>
            <li>Select <strong>Secrets</strong></li>
            <li>Type <code>GOOGLE_MAPS_PLATFORM_KEY</code> as the secret name, press <strong>Enter</strong></li>
            <li>Paste your API key as the value, press <strong>Enter</strong></li>
          </ul>
          <p style={{color:'#999'}}>The app rebuilds automatically after you add the secret.</p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly">
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
    </APIProvider>
  );
}

function ProfileRedirect() {
  const storedUser = localStorage.getItem('user');
  if (storedUser) {
    const user = JSON.parse(storedUser);
    return <Navigate to={`/profile/${user.username}`} replace />;
  }
  return <Navigate to="/login" replace />;
}
