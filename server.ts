import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import multer from "multer";

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
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'banned')),
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

  CREATE TABLE IF NOT EXISTS ecosystems (
    user_id INTEGER PRIMARY KEY,
    company_name TEXT NOT NULL,
    full_address TEXT,
    service_category TEXT,
    details TEXT,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Insert some mock data for demonstration
const insertUser = db.prepare("INSERT INTO users (username, email, password, type, profile_picture_url, role) VALUES (?, ?, ?, ?, ?, ?)");
const insertRider = db.prepare("INSERT INTO riders (user_id, name, age, city) VALUES (?, ?, ?, ?)");
const insertMoto = db.prepare("INSERT INTO motorcycles (rider_id, make, model, year) VALUES (?, ?, ?, ?)");
const insertEco = db.prepare("INSERT INTO ecosystems (user_id, company_name, full_address, service_category, details) VALUES (?, ?, ?, ?, ?)");
const insertPost = db.prepare("INSERT INTO posts (user_id, content, image_url, tagged_motorcycle_id) VALUES (?, ?, ?, ?)");
const insertEvent = db.prepare("INSERT INTO events (user_id, title, description, date, time, location, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)");

db.transaction(() => {
  // Rider 1 (Admin)
  const r1 = insertUser.run("john_rider", "john@cafe777.com", "password123", "rider", "https://picsum.photos/seed/john/200/200", "admin").lastInsertRowid;
  insertRider.run(r1, "John Doe", 32, "Los Angeles");
  insertMoto.run(r1, "Harley-Davidson", "Iron 883", 2020);
  insertMoto.run(r1, "Triumph", "Bonneville T120", 2018);

  // Rider 2 (Moderator)
  const r2 = insertUser.run("sarah_speed", "sarah@cafe777.com", "password123", "rider", "https://picsum.photos/seed/sarah/200/200", "moderator").lastInsertRowid;
  insertRider.run(r2, "Sarah Connor", 28, "San Francisco");
  insertMoto.run(r2, "Ducati", "Panigale V4", 2022);

  // Ecosystem 1
  const e1 = insertUser.run("moto_garage_la", "garage@cafe777.com", "password123", "ecosystem", "https://picsum.photos/seed/garage/200/200", "user").lastInsertRowid;
  insertEco.run(e1, "Moto Garage LA", "123 Sunset Blvd, Los Angeles, CA", "repair", "Premium motorcycle repair and custom builds.");

  // Ecosystem 2
  const e2 = insertUser.run("leather_n_steel", "leather@cafe777.com", "password123", "ecosystem", "https://picsum.photos/seed/leather/200/200", "user").lastInsertRowid;
  insertEco.run(e2, "Leather & Steel Barbers", "456 Route 66, Santa Monica, CA", "barbershop", "Classic cuts and shaves for the modern rider.");

  // Mock Posts
  insertPost.run(r1, "Just finished a long ride through the canyons. The Iron 883 handled like a dream!", "https://picsum.photos/seed/ride1/800/600", 1);
  insertPost.run(e1, "New custom build just rolled out of the shop. Check out this vintage cafe racer style!", "https://picsum.photos/seed/shop1/800/600", null);
  insertPost.run(r2, "Track day at Laguna Seca was intense. The Panigale V4 is a beast on the straights.", "https://picsum.photos/seed/track1/800/600", 3);

  // Mock Events
  insertEvent.run(e1, "Sunday Morning Canyon Run", "Join us for a spirited ride through the Malibu canyons. All skill levels welcome!", "2026-03-15", "08:00 AM", "Mulholland Hwy, Malibu", "https://picsum.photos/seed/event1/800/600");
  insertEvent.run(e2, "Classic Bike Night", "Bring your vintage iron and enjoy some live music and great company.", "2026-03-20", "07:00 PM", "Leather & Steel Barbers, Santa Monica", "https://picsum.photos/seed/event2/800/600");
  insertEvent.run(e1, "Maintenance Workshop", "Learn the basics of motorcycle maintenance from our expert mechanics.", "2026-03-25", "10:00 AM", "Moto Garage LA", "https://picsum.photos/seed/event3/800/600");
})();

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
  app.get("/api/users", (req, res) => {
    const users = db.prepare("SELECT * FROM users").all();
    res.json(users);
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
      const motorcycles = db.prepare("SELECT * FROM motorcycles WHERE rider_id = ?").all(user.id);
      res.json({ ...user, profile: rider, garage: motorcycles, posts });
    } else {
      const ecosystem = db.prepare("SELECT * FROM ecosystems WHERE user_id = ?").get(user.id) as any;
      const events = db.prepare("SELECT * FROM events WHERE user_id = ? ORDER BY date ASC").all(user.id);
      res.json({ ...user, profile: ecosystem, posts, events });
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

  app.get("/api/events", (req, res) => {
    const events = db.prepare(`
      SELECT ev.*, u.username, u.profile_picture_url,
             e.company_name, e.service_category
      FROM events ev
      JOIN users u ON ev.user_id = u.id
      LEFT JOIN ecosystems e ON u.id = e.user_id
      ORDER BY ev.is_promoted DESC, ev.date ASC
    `).all();
    res.json(events);
  });

  app.post("/api/events", (req, res) => {
    const { username, title, description, date, time, location, image_url } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.type === 'rider') {
      return res.status(403).json({ error: "Riders cannot create events" });
    }

    try {
      insertEvent.run(user.id, title, description, date, time, location, image_url || "https://picsum.photos/seed/event/800/600");
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

  app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password) as any;
    
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ error: "Your account has been banned" });
    }

    res.json({ 
      id: user.id,
      username: user.username,
      email: user.email,
      type: user.type,
      role: user.role,
      profile_picture_url: user.profile_picture_url
    });
  });

  app.post("/api/register", (req, res) => {
    const { username, email, password, type, profile_picture_url, ...profileData } = req.body;

    try {
      let userId;
      db.transaction(() => {
        const userResult = insertUser.run(
          username, 
          email,
          password,
          type, 
          profile_picture_url || `https://picsum.photos/seed/${username}/200/200`,
          "user"
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
    if (!['active', 'banned'].includes(status)) {
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
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
