import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LanguageProvider } from './contexts/LanguageContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Profile from './pages/Profile';
import EditProfile from './pages/EditProfile';
import Register from './pages/Register';
import Login from './pages/Login';
import MapView from './pages/Map';
import Events from './pages/Events';
import EventDetails from './pages/EventDetails';
import SubmitPhoto from './pages/SubmitPhoto';
import ContestPage from './pages/ContestPage';
import NotificationsPage from './pages/NotificationsPage';
import Admin from './pages/Admin';
import AdminLogin from './pages/AdminLogin';

export default function App() {
  return (
    <LanguageProvider>
      <Router>
        <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-primary/30 grid-pattern">
          <Navbar />
          <main className="pt-16 relative z-10">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/profile/:username" element={<Profile />} />
              <Route path="/edit-profile/:username" element={<EditProfile />} />
              <Route path="/register" element={<Register />} />
              <Route path="/login" element={<Login />} />
              <Route path="/map" element={<MapView />} />
              <Route path="/events" element={<Events />} />
              <Route path="/events/:id" element={<EventDetails />} />
              <Route path="/submit-photo" element={<SubmitPhoto />} />
              <Route path="/contest" element={<ContestPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/login" element={<AdminLogin />} />
            </Routes>
          </main>
        </div>
      </Router>
    </LanguageProvider>
  );
}
