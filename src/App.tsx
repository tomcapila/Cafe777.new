import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Profile from './pages/Profile';
import EditProfile from './pages/EditProfile';
import Register from './pages/Register';
import Login from './pages/Login';
import MapView from './pages/Map';
import Events from './pages/Events';
import Admin from './pages/Admin';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-orange-500/30">
        <Navbar />
        <main className="pt-16">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/profile/:username" element={<Profile />} />
            <Route path="/edit-profile/:username" element={<EditProfile />} />
            <Route path="/register" element={<Register />} />
            <Route path="/login" element={<Login />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/events" element={<Events />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
