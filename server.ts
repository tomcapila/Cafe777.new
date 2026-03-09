import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(":memory:"); // Using in-memory for prototype

// Ensure uploads directory exists
const uploadsDir = path.resolve(process.cwd(), "public/uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Initialize Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    type TEXT CHECK(type IN ('rider', 'ecosystem')) NOT NULL,
    profile_picture_url TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'banned', 'pending')),
    role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin', 'moderator')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS riders (
    user_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER,
    city TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS motorcycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rider_id INTEGER NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER,
    FOREIGN KEY(rider_id) REFERENCES riders(user_id)
  );

  CREATE TABLE IF NOT EXISTS maintenance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    motorcycle_id INTEGER NOT NULL,
    service TEXT NOT NULL,
    km INTEGER,
    shop TEXT,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(motorcycle_id) REFERENCES motorcycles(id)
  );

  CREATE TABLE IF NOT EXISTS ecosystems (
    user_id INTEGER PRIMARY KEY,
    company_name TEXT NOT NULL,
    full_address TEXT,
    service_category TEXT,
    details TEXT,
    lat REAL,
    lng REAL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    tagged_motorcycle_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(tagged_motorcycle_id) REFERENCES motorcycles(id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    time TEXT,
    location TEXT,
    image_url TEXT,
    is_promoted INTEGER DEFAULT 0,
    is_approved INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS event_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(event_id) REFERENCES events(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS contests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT CHECK(type IN ('weekly', 'monthly', 'yearly')) NOT NULL,
    start_date DATETIME NOT NULL,
    voting_start_date DATETIME NOT NULL,
    end_date DATETIME NOT NULL,
    winner_submission_id INTEGER
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contest_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    motorcycle_id INTEGER,
    photo_url TEXT NOT NULL,
    description TEXT,
    approved INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(contest_id) REFERENCES contests(id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(motorcycle_id) REFERENCES motorcycles(id)
  );

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contest_id INTEGER NOT NULL,
    submission_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contest_id, user_id),
    FOREIGN KEY(contest_id) REFERENCES contests(id),
    FOREIGN KEY(submission_id) REFERENCES submissions(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(submission_id) REFERENCES submissions(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS event_rsvps (
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(event_id, user_id),
    FOREIGN KEY(event_id) REFERENCES events(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Insert some mock data for demonstration
const insertUser = db.prepare("INSERT INTO users (username, email, password, type, profile_picture_url, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)");
const insertRider = db.prepare("INSERT INTO riders (user_id, name, age, city) VALUES (?, ?, ?, ?)");
const insertMoto = db.prepare("INSERT INTO motorcycles (rider_id, make, model, year) VALUES (?, ?, ?, ?)");
const insertMaintenance = db.prepare("INSERT INTO maintenance_logs (motorcycle_id, service, km, shop) VALUES (?, ?, ?, ?)");
const insertEco = db.prepare("INSERT INTO ecosystems (user_id, company_name, full_address, service_category, details, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?)");
const insertPost = db.prepare("INSERT INTO posts (user_id, content, image_url, tagged_motorcycle_id) VALUES (?, ?, ?, ?)");
const insertEvent = db.prepare("INSERT INTO events (user_id, title, description, date, time, location, image_url, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
const insertContest = db.prepare("INSERT INTO contests (type, start_date, voting_start_date, end_date) VALUES (?, ?, ?, ?)");
const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");

db.transaction(() => {
  // Default Settings
  insertSetting.run("fullscreen_enabled", "true");
  // Rider 1 (Admin)
  const r1 = insertUser.run("john_rider", "john@cafe777.com", "password123", "rider", "https://picsum.photos/seed/john/200/200", "admin", "active").lastInsertRowid;
  insertRider.run(r1, "John Doe", 32, "Los Angeles");
  const m1 = insertMoto.run(r1, "Harley-Davidson", "Iron 883", 2020).lastInsertRowid;
  insertMaintenance.run(m1, "Oil Change", 5000, "Moto Garage LA");
  const m2 = insertMoto.run(r1, "Triumph", "Bonneville T120", 2018).lastInsertRowid;
  insertMaintenance.run(m2, "Tire Replacement", 12000, "Moto Garage LA");

  // Rider 2 (Moderator)
  const r2 = insertUser.run("sarah_speed", "sarah@cafe777.com", "password123", "rider", "https://picsum.photos/seed/sarah/200/200", "moderator", "active").lastInsertRowid;
  insertRider.run(r2, "Sarah Connor", 28, "San Francisco");
  const m3 = insertMoto.run(r2, "Ducati", "Panigale V4", 2022).lastInsertRowid;
  insertMaintenance.run(m3, "First Service", 1000, "Ducati SF");

  // Ecosystem 1
  const e1 = insertUser.run("moto_garage_la", "garage@cafe777.com", "password123", "ecosystem", "https://picsum.photos/seed/garage/200/200", "user", "active").lastInsertRowid;
  insertEco.run(e1, "Moto Garage LA", "123 Sunset Blvd, Los Angeles, CA", "repair", "Premium motorcycle repair and custom builds.", 34.0928, -118.3287);

  // Ecosystem 2
  const e2 = insertUser.run("leather_n_steel", "leather@cafe777.com", "password123", "ecosystem", "https://picsum.photos/seed/leather/200/200", "user", "active").lastInsertRowid;
  insertEco.run(e2, "Leather & Steel Barbers", "456 Route 66, Santa Monica, CA", "barbershop", "Classic cuts and shaves for the modern rider.", 34.0195, -118.4912);

  // Mock Events
  insertEvent.run(e1, "Sunday Morning Canyon Run", "Join us for a scenic ride through the Malibu canyons. All skill levels welcome!", "2026-03-15", "08:00 AM", "Malibu, CA", "https://picsum.photos/seed/event1/800/600", 1);
  insertEvent.run(e2, "Classic Bike Meetup", "Show off your vintage machines and enjoy some coffee with fellow enthusiasts.", "2026-03-22", "10:00 AM", "Santa Monica, CA", "https://picsum.photos/seed/event2/800/600", 1);
  insertEvent.run(r1, "Night Ride: City Lights", "A late night cruise through the neon-lit streets of downtown LA.", "2026-03-10", "09:00 PM", "Downtown LA", "https://picsum.photos/seed/event3/800/600", 1);

  // Mock Posts
  insertContest.run("weekly", "2026-03-01 00:00:00", "2026-03-04 00:00:00", "2026-03-07 23:59:59");
  insertContest.run("weekly", "2026-03-08 00:00:00", "2026-03-11 00:00:00", "2026-03-14 23:59:59");

  // Mock Posts
  insertPost.run(r1, "Just finished a long ride through the canyons. The Iron 883 handled like a dream!", "https://picsum.photos/seed/ride1/800/600", 1);
  insertPost.run(e1, "New custom build just rolled out of the shop. Check out this vintage cafe racer style!", "https://picsum.photos/seed/shop1/800/600", null);
  insertPost.run(r2, "Track day at Laguna Seca was intense. The Panigale V4 is a beast on the straights.", "https://picsum.photos/seed/track1/800/600", 3);
})();

// Automation logic
function checkContests() {
  // Find contests that ended and don't have a winner
  const endedContests = db.prepare(`
    SELECT * FROM contests 
    WHERE end_date < datetime('now') AND winner_submission_id IS NULL
  `).all() as any[];

  for (const contest of endedContests) {
    // Select winner
    const winner = db.prepare(`
      SELECT submission_id, COUNT(*) as vote_count
      FROM votes
      WHERE contest_id = ?
      GROUP BY submission_id
      ORDER BY vote_count DESC
      LIMIT 1
    `).get(contest.id) as any;

    if (winner) {
      db.prepare("UPDATE contests SET winner_submission_id = ? WHERE id = ?").run(winner.submission_id, contest.id);
    }
  }
}

// Run check every minute
setInterval(checkContests, 60000);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Admin check middleware
  const checkAdmin = (req: any, res: any, next: any) => {
    // Simulate checking a 'x-admin-role' header for demonstration
    const role = req.headers['x-admin-role'] || 'user'; 
    if (role !== 'admin' && role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: Insufficient permissions" });
    }
    next();
  };

  // API Routes
  app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    try {
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;

      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (user.password !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (user.status !== 'active') {
        return res.status(403).json({ error: `Account is ${user.status}` });
      }

      // Don't return the password
      const { password: _, ...userInfo } = user;
      res.json(userInfo);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contests/current/submissions", upload.single('photo'), (req, res) => {
    const { user_id, motorcycle_id, description } = req.body;
    const photo_url = req.file ? `/uploads/${req.file.filename}` : null;

    if (!user_id || !photo_url) {
      return res.status(400).json({ error: "User ID and photo are required" });
    }

    try {
      // Find current active contest
      const contest = db.prepare(`
        SELECT * FROM contests 
        WHERE datetime('now') BETWEEN start_date AND end_date 
        ORDER BY start_date DESC LIMIT 1
      `).get() as any;

      if (!contest) {
        return res.status(404).json({ error: "No active contest found" });
      }

      // Check if user already submitted
      const existing = db.prepare("SELECT id FROM submissions WHERE contest_id = ? AND user_id = ?").get(contest.id, user_id);
      if (existing) {
        return res.status(400).json({ error: "You have already submitted a photo for this contest" });
      }

      const stmt = db.prepare(`
        INSERT INTO submissions (contest_id, user_id, motorcycle_id, photo_url, description)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(contest.id, user_id, motorcycle_id || null, photo_url, description || null);

      res.status(201).json({ message: "Submission successful" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/contests/current/submissions", (req, res) => {
    try {
      const contest = db.prepare(`
        SELECT * FROM contests 
        WHERE datetime('now') BETWEEN start_date AND end_date 
        ORDER BY start_date DESC LIMIT 1
      `).get() as any;

      if (!contest) {
        return res.status(404).json({ error: "No active contest found" });
      }

      const submissions = db.prepare(`
        SELECT s.*, u.username, 
               (SELECT COUNT(*) FROM votes WHERE submission_id = s.id) as vote_count
        FROM submissions s
        JOIN users u ON s.user_id = u.id
        WHERE s.contest_id = ? AND s.approved = 1
      `).all(contest.id);

      res.json({ contest, submissions });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contests/current/votes", (req, res) => {
    const { user_id, submission_id } = req.body;

    if (!user_id || !submission_id) {
      return res.status(400).json({ error: "User ID and submission ID are required" });
    }

    try {
      const contest = db.prepare(`
        SELECT * FROM contests 
        WHERE datetime('now') BETWEEN start_date AND end_date 
        ORDER BY start_date DESC LIMIT 1
      `).get() as any;

      if (!contest) {
        return res.status(404).json({ error: "No active contest found" });
      }

      // Check if user already voted
      const existing = db.prepare("SELECT id FROM votes WHERE contest_id = ? AND user_id = ?").get(contest.id, user_id);
      if (existing) {
        return res.status(400).json({ error: "You have already voted in this contest" });
      }

      const stmt = db.prepare(`
        INSERT INTO votes (contest_id, submission_id, user_id)
        VALUES (?, ?, ?)
      `);
      stmt.run(contest.id, submission_id, user_id);

      res.status(201).json({ message: "Vote successful" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/submissions/:id/comments", (req, res) => {
    const comments = db.prepare(`
      SELECT c.*, u.username, u.profile_picture_url 
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.submission_id = ?
      ORDER BY c.created_at ASC
    `).all(req.params.id);
    res.json(comments);
  });

  app.post("/api/submissions/:id/comments", (req, res) => {
    const { user_id, content } = req.body;
    if (!user_id || !content) {
      return res.status(400).json({ error: "User ID and content are required" });
    }
    try {
      const stmt = db.prepare("INSERT INTO comments (submission_id, user_id, content) VALUES (?, ?, ?)");
      stmt.run(req.params.id, user_id, content);
      res.status(201).json({ message: "Comment added" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/notifications", (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: "User ID is required" });
    const notifications = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC").all(user_id);
    res.json(notifications);
  });

  app.post("/api/notifications/:id/read", (req, res) => {
    db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(req.params.id);
    res.json({ message: "Notification marked as read" });
  });

  app.get("/api/users", (req, res) => {
    const users = db.prepare("SELECT * FROM users").all();
    res.json(users);
  });

  app.get("/api/ecosystems", (req, res) => {
    const ecosystems = db.prepare(`
      SELECT e.*, u.username, u.profile_picture_url 
      FROM ecosystems e
      JOIN users u ON e.user_id = u.id
    `).all();
    res.json(ecosystems);
  });

  app.get("/api/profile/:username", (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(req.params.username) as any;
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const posts = db.prepare(`
      SELECT p.*, 
             m.make, m.model, m.year
      FROM posts p
      LEFT JOIN motorcycles m ON p.tagged_motorcycle_id = m.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `).all(user.id);

    if (user.type === "rider") {
      const rider = db.prepare("SELECT * FROM riders WHERE user_id = ?").get(user.id) as any;
      const motorcycles = db.prepare("SELECT * FROM motorcycles WHERE rider_id = ?").all(user.id) as any[];
      
      // Fetch maintenance logs for each motorcycle
      const garage = motorcycles.map(moto => {
        const logs = db.prepare("SELECT * FROM maintenance_logs WHERE motorcycle_id = ? ORDER BY date DESC, km DESC").all(moto.id);
        return { ...moto, maintenance_logs: logs };
      });

      // Fetch events created by user
      const createdEvents = db.prepare(`
        SELECT e.*, u.username, u.profile_picture_url,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id) as rsvp_count
        FROM events e
        JOIN users u ON e.user_id = u.id
        WHERE e.user_id = ?
        ORDER BY e.date ASC
      `).all(user.id);

      // Fetch events RSVP'd by user
      const rsvpdEvents = db.prepare(`
        SELECT e.*, u.username, u.profile_picture_url,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id) as rsvp_count
        FROM events e
        JOIN event_rsvps r ON e.id = r.event_id
        JOIN users u ON e.user_id = u.id
        WHERE r.user_id = ?
        ORDER BY e.date ASC
      `).all(user.id);

      res.json({ ...user, profile: rider, garage, posts, events: createdEvents, rsvpd_events: rsvpdEvents });
    } else {
      const ecosystem = db.prepare("SELECT * FROM ecosystems WHERE user_id = ?").get(user.id) as any;
      
      // Fetch events hosted by this business
      const hostedEvents = db.prepare(`
        SELECT e.*, u.username, u.profile_picture_url,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id) as rsvp_count
        FROM events e
        JOIN users u ON e.user_id = u.id
        WHERE e.user_id = ?
        ORDER BY e.date ASC
      `).all(user.id);

      // Fetch events RSVP'd by this business
      const rsvpdEvents = db.prepare(`
        SELECT e.*, u.username, u.profile_picture_url,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id) as rsvp_count
        FROM events e
        JOIN event_rsvps r ON e.id = r.event_id
        JOIN users u ON e.user_id = u.id
        WHERE r.user_id = ?
        ORDER BY e.date ASC
      `).all(user.id);

      res.json({ ...user, profile: ecosystem, posts, events: hostedEvents, rsvpd_events: rsvpdEvents });
    }
  });

  app.get("/api/posts", (req, res) => {
    const posts = db.prepare(`
      SELECT p.*, u.username, u.type, u.profile_picture_url,
             r.name as rider_name, e.company_name,
             m.make, m.model, m.year
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN riders r ON u.id = r.user_id
      LEFT JOIN ecosystems e ON u.id = e.user_id
      LEFT JOIN motorcycles m ON p.tagged_motorcycle_id = m.id
      ORDER BY p.created_at DESC
    `).all();
    res.json(posts);
  });

  // Event Photo Management
  app.post("/api/events/:id/photos", upload.single("image"), (req, res) => {
    const eventId = req.params.id;
    const userId = req.body.userId;
    const imageUrl = `/uploads/${(req as any).file?.filename}`;
    
    db.prepare("INSERT INTO event_photos (event_id, user_id, image_url) VALUES (?, ?, ?)")
      .run(eventId, userId, imageUrl);
    
    res.json({ success: true });
  });

  app.get("/api/events/:id/photos", (req, res) => {
    const photos = db.prepare("SELECT * FROM event_photos WHERE event_id = ? AND status = 'approved'").all(req.params.id);
    res.json(photos);
  });

  app.get("/api/events/:id/pending-photos", (req, res) => {
    const photos = db.prepare("SELECT * FROM event_photos WHERE event_id = ? AND status = 'pending'").all(req.params.id);
    res.json(photos);
  });

  app.post("/api/events/photos/:photoId/status", (req, res) => {
    const { status } = req.body;
    db.prepare("UPDATE event_photos SET status = ? WHERE id = ?").run(status, req.params.photoId);
    res.json({ success: true });
  });

  app.get("/api/events", (req, res) => {
    const { username } = req.query;
    let userId = null;
    if (username) {
      const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as any;
      if (user) userId = user.id;
    }

    const events = db.prepare(`
      SELECT ev.*, u.username, u.profile_picture_url,
             e.company_name, e.service_category,
             (SELECT COUNT(*) FROM event_rsvps WHERE event_id = ev.id) as rsvp_count,
             ${userId ? `(SELECT COUNT(*) FROM event_rsvps WHERE event_id = ev.id AND user_id = ${userId}) > 0` : '0'} as has_rsvpd
      FROM events ev
      JOIN users u ON ev.user_id = u.id
      LEFT JOIN ecosystems e ON u.id = e.user_id
      WHERE ev.is_approved = 1
      ORDER BY ev.is_promoted DESC, ev.date ASC
    `).all();
    res.json(events);
  });

  app.get("/api/events/:id", (req, res) => {
    const { id } = req.params;
    const { username } = req.query;
    let userId = null;
    if (username) {
      const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as any;
      if (user) userId = user.id;
    }

    try {
      const event = db.prepare(`
        SELECT ev.*, u.username, u.profile_picture_url,
               e.company_name, e.service_category,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = ev.id) as rsvp_count,
               ${userId ? `(SELECT COUNT(*) FROM event_rsvps WHERE event_id = ev.id AND user_id = ${userId}) > 0` : '0'} as has_rsvpd
        FROM events ev
        JOIN users u ON ev.user_id = u.id
        LEFT JOIN ecosystems e ON u.id = e.user_id
        WHERE ev.id = ?
      `).get(id) as any;

      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      res.json(event);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/events", (req, res) => {
    const { username, title, description, date, time, location, image_url } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    try {
      // Admins/Moderators auto-approve their own events
      const isApproved = (user.role === 'admin' || user.role === 'moderator') ? 1 : 0;
      insertEvent.run(user.id, title, description, date, time, location, image_url || `https://picsum.photos/seed/${Math.random()}/800/600`, isApproved);
      res.json({ success: true, approved: isApproved });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/events/:id", (req, res) => {
    const { title, description, date, time, location, image_url } = req.body;
    const { id } = req.params;

    try {
      db.prepare(`
        UPDATE events 
        SET title = ?, description = ?, date = ?, time = ?, location = ?, image_url = ?
        WHERE id = ?
      `).run(title, description, date, time, location, image_url, id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/events/:id/rsvp", (req, res) => {
    const { id } = req.params;
    const { username } = req.body;
    const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as any;
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    try {
      // Check if already RSVP'd
      const existing = db.prepare("SELECT * FROM event_rsvps WHERE event_id = ? AND user_id = ?").get(id, user.id);
      if (existing) {
        db.prepare("DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?").run(id, user.id);
        return res.json({ success: true, action: 'unrsvp' });
      } else {
        db.prepare("INSERT INTO event_rsvps (event_id, user_id) VALUES (?, ?)").run(id, user.id);
        return res.json({ success: true, action: 'rsvp' });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to process RSVP" });
    }
  });

  app.put("/api/admin/submissions/:id/approve", checkAdmin, (req, res) => {
    const { approved } = req.body;
    try {
      db.prepare("UPDATE submissions SET approved = ? WHERE id = ?").run(approved ? 1 : 0, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/submissions", checkAdmin, (req, res) => {
    try {
      const submissions = db.prepare(`
        SELECT s.*, u.username, c.type as contest_type
        FROM submissions s
        JOIN users u ON s.user_id = u.id
        JOIN contests c ON s.contest_id = c.id
        ORDER BY s.created_at DESC
      `).all();
      res.json(submissions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/events", checkAdmin, (req, res) => {
    try {
      const events = db.prepare(`
        SELECT ev.*, u.username, u.profile_picture_url,
               e.company_name, e.service_category,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = ev.id) as rsvp_count
        FROM events ev
        JOIN users u ON ev.user_id = u.id
        LEFT JOIN ecosystems e ON u.id = e.user_id
        ORDER BY ev.is_approved ASC, ev.date ASC
      `).all();
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/events/:id/approve", checkAdmin, (req, res) => {
    const { is_approved } = req.body;
    try {
      db.prepare("UPDATE events SET is_approved = ? WHERE id = ?").run(is_approved ? 1 : 0, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/events/:id/promote", checkAdmin, (req, res) => {
    const { is_promoted } = req.body;
    try {
      db.prepare("UPDATE events SET is_promoted = ? WHERE id = ?").run(is_promoted ? 1 : 0, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/motorcycles", (req, res) => {
    const { username, make, model, year, last_service, last_km, last_shop } = req.body;
    const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as any;
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    try {
      const motoResult = insertMoto.run(user.id, make, model, parseInt(year));
      const motoId = motoResult.lastInsertRowid;

      if (last_service || last_km || last_shop) {
        insertMaintenance.run(motoId, last_service || "Initial Entry", parseInt(last_km) || null, last_shop);
      }
      
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to add motorcycle" });
    }
  });

  app.post("/api/motorcycles/:id/maintenance", (req, res) => {
    const { id } = req.params;
    const { service, km, shop } = req.body;

    try {
      insertMaintenance.run(parseInt(id), service, parseInt(km) || null, shop);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to add maintenance log" });
    }
  });

  app.post("/api/posts", (req, res) => {
    const { username, content, image_url, tagged_motorcycle_id } = req.body;
    const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as any;
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    try {
      insertPost.run(user.id, content, image_url, tagged_motorcycle_id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/profile/:username", (req, res) => {
    const { username } = req.params;
    const { profile_picture_url, ...profileData } = req.body;

    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    try {
      db.transaction(() => {
        if (profile_picture_url) {
          db.prepare("UPDATE users SET profile_picture_url = ? WHERE id = ?").run(profile_picture_url, user.id);
        }

        if (user.type === "rider") {
          db.prepare("UPDATE riders SET name = ?, age = ?, city = ? WHERE user_id = ?")
            .run(profileData.name, profileData.age, profileData.city, user.id);
        } else {
          db.prepare("UPDATE ecosystems SET company_name = ?, full_address = ?, service_category = ?, details = ? WHERE user_id = ?")
            .run(profileData.company_name, profileData.full_address, profileData.service_category, profileData.details, user.id);
        }
      })();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/upload", upload.single("file"), (req: any, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
  });

  app.post("/api/register", (req, res) => {
    const { username, email, password, type, profile_picture_url, ...profileData } = req.body;

    try {
      let userId;
      const initialStatus = type === 'rider' ? 'active' : 'pending';
      
      db.transaction(() => {
        const userResult = insertUser.run(
          username, 
          email,
          password,
          type, 
          profile_picture_url || `https://picsum.photos/seed/${username}/200/200`,
          "user",
          initialStatus
        );
        userId = userResult.lastInsertRowid;

        if (type === "rider") {
          insertRider.run(userId, profileData.name, profileData.age, profileData.city);
        } else {
          insertEco.run(userId, profileData.company_name, profileData.full_address, profileData.service_category, profileData.details);
        }
      })();
      res.json({ success: true, username });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin Routes
  // Note: In a real app, you would get the current user from the session/token
  // For this prototype, we'll simulate a permission check
  
  app.get("/api/admin/users", checkAdmin, (req, res) => {
    const users = db.prepare(`
      SELECT u.*, 
             r.name as rider_name, 
             e.company_name 
      FROM users u
      LEFT JOIN riders r ON u.id = r.user_id
      LEFT JOIN ecosystems e ON u.id = e.user_id
      ORDER BY u.created_at DESC
    `).all();
    res.json(users);
  });

  app.put("/api/admin/users/:id/status", checkAdmin, (req, res) => {
    const { status } = req.body;
    if (!['active', 'banned', 'pending'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    
    try {
      db.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/users/:id/role", checkAdmin, (req, res) => {
    const { role } = req.body;
    if (!['user', 'admin', 'moderator'].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    
    try {
      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/users/:id", checkAdmin, (req, res) => {
    try {
      db.transaction(() => {
        const id = req.params.id;
        db.prepare("DELETE FROM motorcycles WHERE rider_id = ?").run(id);
        db.prepare("DELETE FROM riders WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM ecosystems WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM users WHERE id = ?").run(id);
      })();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/settings", (req, res) => {
    try {
      const settings = db.prepare("SELECT * FROM settings").all() as any[];
      const settingsMap = settings.reduce((acc, curr) => {
        acc[curr.key] = curr.value === 'true' ? true : curr.value === 'false' ? false : curr.value;
        return acc;
      }, {});
      res.json(settingsMap);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/settings", checkAdmin, (req, res) => {
    const { key, value } = req.body;
    try {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, String(value));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API 404 handler
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  // Serve uploads
  app.use("/uploads", express.static(uploadsDir));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
