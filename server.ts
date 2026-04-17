import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import { z } from "zod";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import { OAuth2Client } from 'google-auth-library';
import { fetchOSMPlaces } from './src/services/osmService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'cafe777-super-secret-key-for-dev';
console.log(`JWT_SECRET initialized (length: ${JWT_SECRET.length})`);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Zod Schemas for Validation
const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number and one special character").optional(),
  type: z.enum(['rider', 'ecosystem']),
  fullName: z.string().min(2).max(100).optional(),
  location: z.string().max(200).optional(),
  bio: z.string().max(500).optional(),
  motorcycle: z.string().max(100).optional(),
  businessName: z.string().max(100).optional(),
  businessType: z.string().max(50).optional(),
  interests: z.union([z.string(), z.array(z.string())]).optional(),
  services: z.union([z.string(), z.array(z.string())]).optional(),
  referralCode: z.string().max(20).optional().nullable(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const mailerSend = new MailerSend({
  apiKey: process.env.MAILERSEND_API_KEY || "",
});

const isProd = process.env.NODE_ENV === 'production' || !!process.env.K_SERVICE;
const dbPath = isProd ? '/tmp/cafe777.db' : 'cafe777.db';
console.log(`Initializing database at ${dbPath}`);
const db = new Database(dbPath); // Using file-based for persistence
console.log("Database initialized successfully");

// Ensure uploads directory exists
const uploadsDir = isProd ? '/tmp/uploads' : path.resolve(process.cwd(), "public/uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Migration: Add chapter_label to ecosystems if it doesn't exist
try {
  db.prepare("ALTER TABLE ecosystems ADD COLUMN chapter_label TEXT DEFAULT 'Chapter'").run();
  console.log("Migration: Added chapter_label to ecosystems table");
} catch (e) {
  // Column likely already exists
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
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedExtensions = /\.(jpe?g|png|gif|webp|avif|heic|heif|jfif)$/i;
    const allowedMimeTypes = /^image\/(jpeg|png|gif|webp|avif|heic|heif)$/i;
    
    const extension = path.extname(file.originalname).toLowerCase();
    const mimetype = file.mimetype;

    if (allowedExtensions.test(extension) || allowedMimeTypes.test(mimetype)) {
      return cb(null, true);
    }
    cb(new Error("Only images are allowed (jpeg, jpg, png, webp, gif, avif, heic)"));
  }
});

// Initialize Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT,
    google_id TEXT UNIQUE,
    type TEXT CHECK(type IN ('rider', 'ecosystem')) NOT NULL,
    profile_picture_url TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'banned', 'pending')),
    role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin', 'moderator')),
    referral_code TEXT UNIQUE,
    referred_by INTEGER REFERENCES users(id),
    password_reset_token TEXT,
    password_reset_expires DATETIME,
    is_mock INTEGER DEFAULT 0,
    plan TEXT DEFAULT 'freemium' CHECK(plan IN ('freemium', 'premium')),
    fullName TEXT,
    location TEXT,
    bio TEXT,
    cover_photo_url TEXT,
    reputation INTEGER DEFAULT 0,
    motorcycle TEXT,
    businessName TEXT,
    businessType TEXT,
    interests TEXT,
    services TEXT,
    referralCode TEXT,
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
    image_url TEXT,
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
    phone TEXT,
    website TEXT,
    chapter_label TEXT DEFAULT 'Chapter',
    owner_id INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(owner_id) REFERENCES users(id)
  );
`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      image_url TEXT,
      tagged_motorcycle_id INTEGER,
      privacy_level TEXT DEFAULT 'public',
      shared_event_id INTEGER,
      is_pinned INTEGER DEFAULT 0,
      respect_count INTEGER DEFAULT 0,
      comment_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(tagged_motorcycle_id) REFERENCES motorcycles(id),
      FOREIGN KEY(shared_event_id) REFERENCES events(id)
    );

  CREATE TABLE IF NOT EXISTS post_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id),
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_pinned_posts (
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS followers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    follower_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, follower_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE
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
    participation_badge_id INTEGER,
    category TEXT DEFAULT 'other',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(participation_badge_id) REFERENCES badges(badge_id)
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
    title TEXT NOT NULL,
    type TEXT CHECK(type IN ('weekly', 'monthly', 'special')),
    description TEXT,
    status TEXT DEFAULT 'draft',
    prize_description TEXT,
    prize_badge_id INTEGER,
    start_date DATETIME NOT NULL,
    voting_start_date DATETIME,
    end_date DATETIME NOT NULL,
    winner_submission_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

  CREATE TABLE IF NOT EXISTS post_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES posts(id),
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
    checked_in INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(event_id, user_id),
    FOREIGN KEY(event_id) REFERENCES events(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    review_id INTEGER PRIMARY KEY AUTOINCREMENT,
    reviewer_user_id INTEGER NOT NULL,
    target_type TEXT CHECK(target_type IN ('route', 'ecosystem_entity')) NOT NULL,
    target_id TEXT NOT NULL,
    rating INTEGER CHECK(rating >= 1 AND rating <= 5) NOT NULL,
    review_text TEXT,
    verification_status TEXT DEFAULT 'unverified' CHECK(verification_status IN ('verified', 'unverified')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(reviewer_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS review_verifications (
    verification_id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id INTEGER NOT NULL,
    verification_method TEXT CHECK(verification_method IN ('QR', 'route_completion')) NOT NULL,
    checkpoint_id TEXT,
    verification_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(review_id) REFERENCES reviews(review_id)
  );

  CREATE TABLE IF NOT EXISTS checkpoints (
    checkpoint_id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL,
    type TEXT CHECK(type IN ('start', 'end')) NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_route_progress (
    user_id INTEGER NOT NULL,
    route_id TEXT NOT NULL,
    start_scanned INTEGER DEFAULT 0,
    end_scanned INTEGER DEFAULT 0,
    PRIMARY KEY(user_id, route_id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS rating_summaries (
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    average_rating REAL DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    verified_reviews INTEGER DEFAULT 0,
    PRIMARY KEY(target_type, target_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(admin_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL,
    reported_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'dismissed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(reporter_id) REFERENCES users(id),
    FOREIGN KEY(reported_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS badges (
    badge_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    category TEXT NOT NULL,
    creator_type TEXT CHECK(creator_type IN ('platform', 'event', 'business', 'club')) NOT NULL,
    creator_id INTEGER,
    creation_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    distribution_rules TEXT,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS user_badges (
    user_badge_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    badge_id INTEGER NOT NULL,
    awarded_by INTEGER,
    awarded_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(badge_id) REFERENCES badges(badge_id),
    UNIQUE(user_id, badge_id)
  );

  CREATE TABLE IF NOT EXISTS badge_rules (
    rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
    badge_id INTEGER NOT NULL,
    rule_type TEXT NOT NULL,
    rule_condition TEXT NOT NULL,
    FOREIGN KEY(badge_id) REFERENCES badges(badge_id)
  );

  CREATE TABLE IF NOT EXISTS discovered_routes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    distance_km REAL NOT NULL,
    difficulty TEXT NOT NULL,
    road_score REAL NOT NULL,
    tags TEXT NOT NULL, -- JSON array
    polyline TEXT NOT NULL, -- JSON array
    start_lat REAL NOT NULL,
    start_lng REAL NOT NULL,
    curvature INTEGER NOT NULL,
    elevation INTEGER NOT NULL,
    scenic INTEGER NOT NULL,
    stops INTEGER NOT NULL,
    popularity INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT CHECK(type IN ('road', 'shop')) NOT NULL,
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    item_description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ambassador_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT CHECK(category IN ('rider', 'business', 'motoclub', 'event')) NOT NULL,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    description TEXT NOT NULL,
    photos TEXT,
    links TEXT,
    proof_of_legitimacy TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ambassadors (
    user_id INTEGER PRIMARY KEY,
    category TEXT CHECK(category IN ('rider', 'business', 'motoclub', 'event')) NOT NULL,
    reputation_score INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS club_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    permissions TEXT DEFAULT '[]',
    FOREIGN KEY(club_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS club_chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    city TEXT,
    country TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(club_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS club_memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL,
    chapter_id INTEGER,
    user_id INTEGER NOT NULL,
    role_id INTEGER,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'banned')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(club_id) REFERENCES users(id),
    FOREIGN KEY(chapter_id) REFERENCES club_chapters(id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(role_id) REFERENCES club_roles(id),
    UNIQUE(club_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS passport_stamps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ambassador_id INTEGER NOT NULL,
    type TEXT CHECK(type IN ('location', 'event', 'challenge', 'route_completion', 'special_edition')) NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    rarity TEXT CHECK(rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')) DEFAULT 'common',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(ambassador_id) REFERENCES ambassadors(user_id)
  );

  CREATE TABLE IF NOT EXISTS user_passport_stamps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    stamp_id INTEGER NOT NULL,
    ambassador_id INTEGER NOT NULL,
    location_lat REAL,
    location_lng REAL,
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(stamp_id) REFERENCES passport_stamps(id),
    FOREIGN KEY(ambassador_id) REFERENCES ambassadors(user_id),
    UNIQUE(user_id, stamp_id)
  );

  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT CHECK(type IN ('one-on-one', 'group')) NOT NULL,
    title TEXT,
    last_message TEXT,
    last_message_timestamp DATETIME,
    last_message_sender_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_participants (
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_read_message_id INTEGER,
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY(chat_id) REFERENCES chats(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(chat_id) REFERENCES chats(id),
    FOREIGN KEY(sender_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS keywords_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_name TEXT NOT NULL,
    keywords TEXT NOT NULL, -- JSON array
    radius INTEGER DEFAULT 5000,
    icon TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS places_cache (
    place_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    rating REAL,
    reviews INTEGER,
    category TEXT,
    source_keyword TEXT,
    city TEXT,
    details TEXT,
    full_address TEXT,
    source TEXT DEFAULT 'google',
    last_fetched DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS places_control (
    place_id TEXT PRIMARY KEY,
    is_approved INTEGER DEFAULT 0,
    is_hidden INTEGER DEFAULT 0,
    custom_category TEXT,
    priority_score INTEGER DEFAULT 0
  );

  -- Seed default keywords if empty
  INSERT INTO keywords_config (category_name, keywords, radius, icon)
  SELECT 'dealership', '["motorcycle dealership", "concessionária moto", "yamaha", "honda", "bmw motorrad", "triumph"]', 10000, 'Building2'
  WHERE NOT EXISTS (SELECT 1 FROM keywords_config WHERE category_name = 'dealership');

  INSERT INTO keywords_config (category_name, keywords, radius, icon)
  SELECT 'repair', '["motorcycle repair", "oficina moto", "mecanico moto", "pneus moto"]', 5000, 'Wrench'
  WHERE NOT EXISTS (SELECT 1 FROM keywords_config WHERE category_name = 'repair');

  INSERT INTO keywords_config (category_name, keywords, radius, icon)
  SELECT 'biker_cafe', '["biker cafe", "motocafé", "coffee shop", "cafeteria"]', 5000, 'Coffee'
  WHERE NOT EXISTS (SELECT 1 FROM keywords_config WHERE category_name = 'biker_cafe');

  INSERT INTO keywords_config (category_name, keywords, radius, icon)
  SELECT 'meeting_spot', '["motorcycle meeting", "ponto de encontro moto", "mirante"]', 10000, 'Users'
  WHERE NOT EXISTS (SELECT 1 FROM keywords_config WHERE category_name = 'meeting_spot');

  INSERT INTO keywords_config (category_name, keywords, radius, icon)
  SELECT 'gear_shop', '["motorcycle gear", "capacete moto", "jaqueta moto"]', 10000, 'ShoppingBag'
  WHERE NOT EXISTS (SELECT 1 FROM keywords_config WHERE category_name = 'gear_shop');
`);

// Add columns to existing places_cache table if they don't exist
try {
  db.prepare("ALTER TABLE places_cache ADD COLUMN city TEXT").run();
} catch (e) { /* Column might already exist */ }
try {
  db.prepare("ALTER TABLE places_cache ADD COLUMN details TEXT").run();
} catch (e) { /* Column might already exist */ }
try {
  db.prepare("ALTER TABLE places_cache ADD COLUMN full_address TEXT").run();
} catch (e) { /* Column might already exist */ }
try {
  db.prepare("ALTER TABLE places_cache ADD COLUMN source TEXT DEFAULT 'google'").run();
} catch (e) { /* Column might already exist */ }

// Migration: Add respect_count and comment_count if they don't exist
try {
  const columns = db.prepare("PRAGMA table_info(posts)").all() as any[];
  const hasRespectCount = columns.some(c => c.name === 'respect_count');
  const hasCommentCount = columns.some(c => c.name === 'comment_count');
  
  if (!hasRespectCount) {
    db.prepare("ALTER TABLE posts ADD COLUMN respect_count INTEGER DEFAULT 0").run();
    console.log("Added respect_count column to posts table");
  }
  if (!hasCommentCount) {
    db.prepare("ALTER TABLE posts ADD COLUMN comment_count INTEGER DEFAULT 0").run();
    console.log("Added comment_count column to posts table");
  }
} catch (e) {
  console.error("Migration error:", e);
}

// Migration for event_photos status column
try {
  const columns = db.prepare("PRAGMA table_info(event_photos)").all() as any[];
  const hasStatus = columns.some(c => c.name === 'status');
  if (!hasStatus) {
    db.prepare("ALTER TABLE event_photos ADD COLUMN status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected'))").run();
    console.log("Added status column to event_photos table");
  }
} catch (e) {
  console.error("Migration error for event_photos:", e);
}

// Migration for events is_approved column
try {
  const columns = db.prepare("PRAGMA table_info(events)").all() as any[];
  const hasIsApproved = columns.some(c => c.name === 'is_approved');
  if (!hasIsApproved) {
    db.prepare("ALTER TABLE events ADD COLUMN is_approved INTEGER DEFAULT 0").run();
    console.log("Added is_approved column to events table");
  }
} catch (e) {
  console.error("Migration error for events:", e);
}

// Add missing columns if they don't exist
try { db.prepare("ALTER TABLE contests ADD COLUMN type TEXT CHECK(type IN ('weekly', 'monthly', 'special'))").run(); } catch (e) {}
try { db.prepare("ALTER TABLE contests ADD COLUMN voting_start_date DATETIME").run(); } catch (e) {}

try {
  db.exec("ALTER TABLE users ADD COLUMN google_id TEXT;");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);");
} catch (e) {}
try {
  // SQLite doesn't support MODIFY COLUMN, but password is already TEXT
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN referral_code TEXT;");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN referred_by INTEGER REFERENCES users(id);");
} catch (e) {}

// Backfill referral codes for existing users
const usersWithoutReferral = db.prepare("SELECT id FROM users WHERE referral_code IS NULL").all() as any[];
if (usersWithoutReferral.length > 0) {
  const updateReferral = db.prepare("UPDATE users SET referral_code = ? WHERE id = ?");
  db.transaction(() => {
    for (const u of usersWithoutReferral) {
      updateReferral.run(Math.random().toString(36).substring(2, 10).toUpperCase(), u.id);
    }
  })();
}

try {
  db.exec("ALTER TABLE recommendations ADD COLUMN image_url TEXT;");
} catch (e) {
  // Ignore if column already exists
}
try {
  db.exec("ALTER TABLE recommendations ADD COLUMN item_description TEXT;");
} catch (e) {
  // Ignore if column already exists
}
try {
  db.exec("ALTER TABLE posts ADD COLUMN privacy_level TEXT DEFAULT 'public';");
} catch (e) {
  // Ignore if column already exists
}
try {
  db.exec("ALTER TABLE posts ADD COLUMN shared_event_id INTEGER;");
} catch (e) {
  // Ignore if column already exists
}
try {
  db.exec("ALTER TABLE posts ADD COLUMN is_pinned INTEGER DEFAULT 0;");
} catch (e) {
  // Ignore if column already exists
}

try {
  db.exec("ALTER TABLE notifications ADD COLUMN type TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE notifications ADD COLUMN link TEXT;");
} catch (e) {}

try {
  db.exec("ALTER TABLE discovered_routes ADD COLUMN curvature INTEGER;");
} catch (e) {}
try {
  db.exec("ALTER TABLE discovered_routes ADD COLUMN elevation INTEGER;");
} catch (e) {}
try {
  db.exec("ALTER TABLE discovered_routes ADD COLUMN scenic INTEGER;");
} catch (e) {}
try {
  db.exec("ALTER TABLE discovered_routes ADD COLUMN stops INTEGER;");
} catch (e) {}
try {
  db.exec("ALTER TABLE discovered_routes ADD COLUMN popularity INTEGER;");
} catch (e) {}
try {
  db.exec("ALTER TABLE event_rsvps ADD COLUMN checked_in INTEGER DEFAULT 0;");
} catch (e) {}

try {
  db.exec("ALTER TABLE motorcycles ADD COLUMN image_url TEXT;");
} catch (e) {}

try {
  db.exec("ALTER TABLE ecosystems ADD COLUMN phone TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE ecosystems ADD COLUMN website TEXT;");
} catch (e) {}

try {
  db.exec("ALTER TABLE events ADD COLUMN category TEXT;");
} catch (e) {}

try {
  db.exec("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'freemium' CHECK(plan IN ('freemium', 'premium'));");
} catch (e) {}

try {
  db.exec("ALTER TABLE passport_stamps ADD COLUMN creator_type TEXT DEFAULT 'ambassador';");
} catch (e) {}
try {
  db.exec("ALTER TABLE passport_stamps ADD COLUMN creator_id INTEGER;");
} catch (e) {}
try {
  db.exec("ALTER TABLE user_passport_stamps ADD COLUMN creator_type TEXT DEFAULT 'ambassador';");
} catch (e) {}
try {
  db.exec("ALTER TABLE user_passport_stamps ADD COLUMN creator_id INTEGER;");
} catch (e) {}
try {
  db.exec("ALTER TABLE events ADD COLUMN participation_stamp_id INTEGER REFERENCES passport_stamps(id);");
} catch (e) {}

// Insert missing badges
try {
  db.exec("ALTER TABLE users ADD COLUMN fullName TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN location TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN bio TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN cover_photo_url TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN reputation INTEGER DEFAULT 0;");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN motorcycle TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN businessName TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN businessType TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN interests TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN services TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN referralCode TEXT;");
} catch (e) {}

// Sync existing data from riders and ecosystems to users table
try {
  db.exec(`
    UPDATE users 
    SET fullName = (SELECT name FROM riders WHERE riders.user_id = users.id),
        location = (SELECT city FROM riders WHERE riders.user_id = users.id)
    WHERE type = 'rider' AND (fullName IS NULL OR location IS NULL);
  `);
  db.exec(`
    UPDATE users 
    SET businessName = (SELECT company_name FROM ecosystems WHERE ecosystems.user_id = users.id),
        location = (SELECT full_address FROM ecosystems WHERE ecosystems.user_id = users.id),
        businessType = (SELECT service_category FROM ecosystems WHERE ecosystems.user_id = users.id),
        bio = (SELECT details FROM ecosystems WHERE ecosystems.user_id = users.id)
    WHERE type = 'ecosystem' AND (businessName IS NULL OR location IS NULL);
  `);
  db.exec("UPDATE users SET referralCode = referral_code WHERE referralCode IS NULL;");
} catch (e) {
  console.error("Sync migration error:", e);
}

try {
  const existingCommunityBuilder = db.prepare("SELECT badge_id FROM badges WHERE name = 'Community Builder'").get();
  if (!existingCommunityBuilder) {
    db.prepare("INSERT INTO badges (name, description, icon, category, creator_type, creator_id) VALUES (?, ?, ?, ?, ?, ?)").run("Community Builder", "Received 100 likes on your posts.", "Heart", "Community Participation", "platform", null);
  }
  const existingInfluencerRider = db.prepare("SELECT badge_id FROM badges WHERE name = 'Influencer Rider'").get();
  if (!existingInfluencerRider) {
    db.prepare("INSERT INTO badges (name, description, icon, category, creator_type, creator_id) VALUES (?, ?, ?, ?, ?, ?)").run("Influencer Rider", "Received 1000 likes on your posts.", "Star", "Community Participation", "platform", null);
  }
} catch (e) {
  console.error("Failed to insert missing badges", e);
}

// Insert some mock data for demonstration
const insertUser = db.prepare("INSERT INTO users (username, email, password, type, profile_picture_url, role, status, referral_code, referred_by, plan, is_mock, fullName, location, bio, motorcycle, businessName, businessType, interests, services, referralCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
const insertRider = db.prepare("INSERT INTO riders (user_id, name, age, city) VALUES (?, ?, ?, ?)");
const insertMoto = db.prepare("INSERT INTO motorcycles (rider_id, make, model, year, image_url) VALUES (?, ?, ?, ?, ?)");
const insertMaintenance = db.prepare("INSERT INTO maintenance_logs (motorcycle_id, service, km, shop) VALUES (?, ?, ?, ?)");
const insertEco = db.prepare("INSERT INTO ecosystems (user_id, company_name, full_address, service_category, details, lat, lng, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
const insertPost = db.prepare("INSERT INTO posts (user_id, content, image_url, tagged_motorcycle_id, privacy_level, shared_event_id) VALUES (?, ?, ?, ?, ?, ?)");
const insertEvent = db.prepare("INSERT INTO events (user_id, title, description, date, time, location, image_url, is_approved, participation_badge_id, category, participation_stamp_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
const insertContest = db.prepare("INSERT INTO contests (title, type, start_date, voting_start_date, end_date) VALUES (?, ?, ?, ?, ?)");
const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
const insertRoute = db.prepare("INSERT OR IGNORE INTO discovered_routes (id, name, distance_km, difficulty, road_score, tags, polyline, start_lat, start_lng, curvature, elevation, scenic, stops, popularity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
const insertBadge = db.prepare("INSERT INTO badges (name, description, icon, category, creator_type, creator_id) VALUES (?, ?, ?, ?, ?, ?)");
const insertUserBadge = db.prepare("INSERT INTO user_badges (user_id, badge_id, awarded_by) VALUES (?, ?, ?)");
const insertAmbassador = db.prepare("INSERT INTO ambassadors (user_id, category, reputation_score, is_active) VALUES (?, ?, ?, ?)");

db.transaction(() => {
  const userCount = (db.prepare("SELECT COUNT(*) as count FROM users").get() as any).count;
  if (userCount > 0) return;

  // Default Settings
  insertSetting.run("fullscreen_enabled", "true");
  insertSetting.run("feature_create_event", "freemium");
  insertSetting.run("feature_promote_event", "premium");
  insertSetting.run("feature_create_motoclub", "premium");
  insertSetting.run("feature_promote_photo_contest", "premium");
  insertSetting.run("photo_contest_enabled", "true");
  insertSetting.run("photo_contest_allowed_types", JSON.stringify(['premium']));
  insertSetting.run("api_google_maps", "true");
  insertSetting.run("api_osm", "true");
  
  // --- TEST USERS ---
  // 1. Normal Rider
  const tr = insertUser.run("test_rider", "rider@test.com", "password123", "rider", "https://picsum.photos/seed/test_rider/200/200", "user", "active", "TESTRIDER", null, "freemium", 0, "Test Rider", "New York", "I love riding!", "Honda CB500X", null, null, null, null, "TESTRIDER").lastInsertRowid;
  insertRider.run(tr, "Test Rider", 25, "New York");
  insertMoto.run(tr, "Honda", "CB500X", 2021, null);

  // 2. Business/Shop User
  const tb = insertUser.run("test_business", "shop@test.com", "password123", "ecosystem", "https://picsum.photos/seed/test_business/200/200", "user", "active", "TESTBIZ", null, "freemium", 0, "Test Moto Shop", "Chicago, IL", "A test shop for all your needs.", null, "Test Moto Shop", "repair", null, null, "TESTBIZ").lastInsertRowid;
  insertEco.run(tb, "Test Moto Shop", "789 Bike Lane, Chicago, IL", "repair", "A test shop for all your needs.", 41.8781, -87.6298, tb);

  // 3. MotoClub Owner User (Rider + Ambassador category motoclub)
  const tc = insertUser.run("test_motoclub", "club@test.com", "password123", "rider", "https://picsum.photos/seed/test_motoclub/200/200", "user", "active", "TESTCLUB", null, "freemium", 0, "Club Owner", "Miami", "Riding together", null, null, null, null, null, "TESTCLUB").lastInsertRowid;
  insertRider.run(tc, "Club Owner", 40, "Miami");
  insertAmbassador.run(tc, "motoclub", 50, 1);

  // 4. Ambassador User (Rider + Ambassador category rider)
  const ta = insertUser.run("test_ambassador", "ambassador@test.com", "password123", "rider", "https://picsum.photos/seed/test_ambassador/200/200", "user", "active", "TESTAMB", null, "freemium", 0, "Test Ambassador", "Austin", "Promoting safety", null, null, null, null, null, "TESTAMB").lastInsertRowid;
  insertRider.run(ta, "Test Ambassador", 30, "Austin");
  insertAmbassador.run(ta, "rider", 100, 1);

  // 5. Admin User
  const tad = insertUser.run("test_admin", "admin@test.com", "password123", "rider", "https://picsum.photos/seed/test_admin/200/200", "admin", "active", "TESTADM", null, "premium", 0, "Test Admin", "Seattle", "Administering the platform", null, null, null, null, null, "TESTADM").lastInsertRowid;
  insertRider.run(tad, "Test Admin", 35, "Seattle");

  // --- EXISTING MOCK DATA ---
  // Rider 1 (Admin)
  const r1 = insertUser.run("john_rider", "john@cafe777.com", "password123", "rider", "https://picsum.photos/seed/john/200/200", "admin", "active", "JOHNRIDER", null, "premium", 0, "John Doe", "Los Angeles", "Riding since 1990", "Harley-Davidson Iron 883", null, null, null, null, "JOHNRIDER").lastInsertRowid;
  insertRider.run(r1, "John Doe", 32, "Los Angeles");
  const m1 = insertMoto.run(r1, "Harley-Davidson", "Iron 883", 2020, null).lastInsertRowid;
  insertMaintenance.run(m1, "Oil Change", 5000, "Moto Garage LA");
  const m2 = insertMoto.run(r1, "Triumph", "Bonneville T120", 2018, null).lastInsertRowid;
  insertMaintenance.run(m2, "Tire Replacement", 12000, "Moto Garage LA");

  // Rider 2 (Moderator)
  const r2 = insertUser.run("sarah_speed", "sarah@cafe777.com", "password123", "rider", "https://picsum.photos/seed/sarah/200/200", "moderator", "active", "SARAHSPEED", null, "freemium", 0, "Sarah Connor", "San Francisco", "Track day enthusiast", "Ducati Panigale V4", null, null, null, null, "SARAHSPEED").lastInsertRowid;
  insertRider.run(r2, "Sarah Connor", 28, "San Francisco");
  const m3 = insertMoto.run(r2, "Ducati", "Panigale V4", 2022, null).lastInsertRowid;
  insertMaintenance.run(m3, "First Service", 1000, "Ducati SF");

  // Ecosystem 1
  const e1 = insertUser.run("moto_garage_la", "garage@cafe777.com", "password123", "ecosystem", "https://picsum.photos/seed/garage/200/200", "user", "active", "MOTOGARAGE", null, "freemium", 0, "Moto Garage LA", "Los Angeles, CA", "Premium motorcycle repair and custom builds.", null, "Moto Garage LA", "repair", null, null, "MOTOGARAGE").lastInsertRowid;
  insertEco.run(e1, "Moto Garage LA", "123 Sunset Blvd, Los Angeles, CA", "repair", "Premium motorcycle repair and custom builds.", 34.0928, -118.3287, e1);

  // Ecosystem 2
  const e2 = insertUser.run("leather_n_steel", "leather@cafe777.com", "password123", "ecosystem", "https://picsum.photos/seed/leather/200/200", "user", "active", "LEATHERSTEEL", null, "freemium", 0, "Leather & Steel Barbers", "Santa Monica, CA", "Classic cuts and shaves for the modern rider.", null, "Leather & Steel Barbers", "barbershop", null, null, "LEATHERSTEEL").lastInsertRowid;
  insertEco.run(e2, "Leather & Steel Barbers", "456 Route 66, Santa Monica, CA", "barbershop", "Classic cuts and shaves for the modern rider.", 34.0195, -118.4912, e2);

  // BH Ecosystems Mock Data
  [
    ["moto_shop_1", "shop1@example.com", "Vibrant Moto Shop", "San Francisco, CA", "shop", "Your one-stop shop for all things motorcycle.", ["motorcycles", "parts", "repair"], "LEGACY"],
    ["moto_mechanic_2", "mechanic2@example.com", "Precision Moto Repair", "Los Angeles, CA", "mechanic", "Expert repairs for all makes and models.", ["repair", "maintenance", "diagnostics"], "LEGACY"],
    ["moto_cafe_3", "cafe3@example.com", "The Biker's Brew", "Austin, TX", "cafe", "Great coffee and a welcoming atmosphere for riders.", ["coffee", "snacks", "community"], "LEGACY"],
    ["moto_rental_4", "rental4@example.com", "Open Road Rentals", "Las Vegas, NV", "rental", "Rent the bike of your dreams and explore the desert.", ["rentals", "tours", "gear"], "LEGACY"],
    ["moto_custom_5", "custom5@example.com", "Iron Horse Customs", "Portland, OR", "custom", "Creating unique, hand-crafted custom motorcycles.", ["custom builds", "fabrication", "paint"], "LEGACY"],
    ["moto_gear_6", "gear6@example.com", "Protective Gear Co.", "Seattle, WA", "shop", "Top-quality helmets, jackets, and gloves.", ["gear", "safety", "apparel"], "LEGACY"],
    ["moto_clubhouse_7", "clubhouse7@example.com", "The Rider's Den", "Denver, CO", "clubhouse", "A private space for motorcycle enthusiasts to connect.", ["events", "storage", "lounge"], "LEGACY"],
    ["moto_track_8", "track8@example.com", "Speedway Circuit", "Phoenix, AZ", "track", "Experience the thrill of the track in a safe environment.", ["track days", "training", "racing"], "LEGACY"],
    ["moto_tours_9", "tours9@example.com", "Scenic Routes Tours", "Salt Lake City, UT", "tours", "Guided motorcycle tours through breathtaking landscapes.", ["tours", "adventure", "travel"], "LEGACY"],
    ["moto_storage_10", "storage10@example.com", "Safe Haven Storage", "San Diego, CA", "storage", "Secure, climate-controlled storage for your motorcycle.", ["storage", "security", "winterization"], "LEGACY"],
    ["moto_detailing_11", "detailing11@example.com", "Shine & Sparkle Detailing", "Miami, FL", "detailing", "Professional detailing services to keep your bike looking new.", ["detailing", "cleaning", "polishing"], "LEGACY"],
    ["moto_insurance_12", "insurance12@example.com", "Rider's Shield Insurance", "Chicago, IL", "insurance", "Specialized insurance coverage for motorcycle riders.", ["insurance", "protection", "liability"], "LEGACY"],
    ["moto_training_13", "training13@example.com", "Master Rider Academy", "Atlanta, GA", "training", "Comprehensive training programs for riders of all levels.", ["training", "safety", "skills"], "LEGACY"],
    ["moto_parts_14", "parts14@example.com", "Classic Parts Warehouse", "Nashville, TN", "shop", "A vast selection of parts for vintage and modern bikes.", ["parts", "accessories", "online store"], "LEGACY"],
    ["moto_events_15", "events15@example.com", "Moto Fest Organizers", "New Orleans, LA", "events", "Organizing the biggest and best motorcycle events.", ["events", "festivals", "rallies"], "LEGACY"],
    ["moto_photography_16", "photography16@example.com", "Lens & Leathers Photography", "Boston, MA", "photography", "Capturing the beauty and spirit of the motorcycle lifestyle.", ["photography", "portraits", "action shots"], "LEGACY"],
    ["moto_app_17", "app17@example.com", "RideSync Technology", "San Jose, CA", "technology", "Innovative apps and gadgets for the modern rider.", ["apps", "gps", "connectivity"], "LEGACY"],
    ["moto_charity_18", "charity18@example.com", "Riders for a Cause", "Washington, D.C.", "charity", "Using our passion for riding to support important causes.", ["charity", "fundraising", "community"], "LEGACY"],
    ["moto_magazine_19", "magazine19@example.com", "Two Wheels Monthly", "New York, NY", "media", "The leading magazine for motorcycle news and culture.", ["media", "news", "reviews"], "LEGACY"],
    ["moto_museum_20", "museum20@example.com", "Heritage Motorcycle Museum", "Milwaukee, WI", "museum", "Exploring the rich history of motorcycles.", ["museum", "history", "exhibits"], "LEGACY"],
    ["moto_artist_21", "artist21@example.com", "Chrome & Canvas Art", "Santa Fe, NM", "art", "Unique artwork inspired by the world of motorcycles.", ["art", "design", "custom paint"], "LEGACY"],
    ["moto_legal_22", "legal22@example.com", "The Rider's Lawyer", "Philadelphia, PA", "legal", "Legal representation specialized in motorcycle accidents.", ["legal", "advocacy", "consultation"], "LEGACY"],
    ["moto_shipping_23", "shipping23@example.com", "Swift Bike Shipping", "Houston, TX", "shipping", "Safe and reliable motorcycle transportation services.", ["shipping", "transport", "logistics"], "LEGACY"],
    ["moto_tires_24", "tires24@example.com", "Grip & Go Tire Center", "Charlotte, NC", "shop", "The best selection of tires for every type of ride.", ["tires", "fitting", "balancing"], "LEGACY"],
    ["moto_exhaust_25", "exhaust25@example.com", "Roar & Rumble Exhausts", "Indianapolis, IN", "shop", "High-performance exhaust systems for that perfect sound.", ["exhausts", "performance", "tuning"], "LEGACY"],
    ["moto_suspension_26", "suspension26@example.com", "Smooth Ride Suspension", "Columbus, OH", "mechanic", "Expert suspension tuning and upgrades.", ["suspension", "tuning", "handling"], "LEGACY"],
    ["moto_brakes_27", "brakes27@example.com", "Stop on a Dime Brakes", "Detroit, MI", "mechanic", "Specialized brake services for maximum safety.", ["brakes", "safety", "performance"], "LEGACY"],
    ["moto_electric_28", "electric28@example.com", "Volt Moto Systems", "San Francisco, CA", "technology", "Specializing in electric motorcycle conversions and repair.", ["electric", "technology", "innovation"], "LEGACY"],
    ["moto_vintage_29", "vintage29@example.com", "Old Soul Motorcycles", "Savannah, GA", "custom", "Restoring and maintaining classic and vintage bikes.", ["restoration", "vintage", "history"], "LEGACY"],
    ["moto_adventure_30", "adventure30@example.com", "Wild Frontier Adventures", "Anchorage, AK", "tours", "Extreme motorcycle adventures in the Alaskan wilderness.", ["adventure", "tours", "off-road"], "LEGACY"],
    ["moto_offroad_31", "offroad31@example.com", "Dirt & Dust Off-Road", "Boise, ID", "training", "Off-road riding clinics and guided trail rides.", ["off-road", "training", "tours"], "LEGACY"],
    ["moto_racing_32", "racing32@example.com", "Apex Racing Team", "Daytona Beach, FL", "racing", "Professional motorcycle racing team and support.", ["racing", "support", "performance"], "LEGACY"],
    ["moto_safety_33", "safety33@example.com", "Ride Safe Foundation", "Sacramento, CA", "charity", "Promoting motorcycle safety through education and awareness.", ["safety", "education", "advocacy"], "LEGACY"],
    ["moto_apparel_34", "apparel34@example.com", "Road Style Apparel", "Los Angeles, CA", "shop", "Fashionable and functional motorcycle clothing.", ["apparel", "fashion", "lifestyle"], "LEGACY"],
    ["moto_helmets_35", "helmets35@example.com", "The Helmet Head", "Boulder, CO", "shop", "Expert advice and a wide selection of motorcycle helmets.", ["helmets", "safety", "gear"], "LEGACY"],
    ["moto_luggage_36", "luggage36@example.com", "Pack & Go Luggage", "Minneapolis, MN", "shop", "Durable and versatile luggage solutions for riders.", ["luggage", "touring", "accessories"], "LEGACY"],
    ["moto_lighting_37", "lighting37@example.com", "Bright Path Lighting", "Orlando, FL", "shop", "Advanced LED lighting systems for better visibility.", ["lighting", "safety", "customization"], "LEGACY"],
    ["moto_security_38", "security38@example.com", "Lock & Key Security", "Newark, NJ", "technology", "State-of-the-art security systems for your motorcycle.", ["security", "protection", "technology"], "LEGACY"],
    ["moto_tools_39", "tools39@example.com", "The Rider's Toolbox", "St. Louis, MO", "shop", "High-quality tools for motorcycle maintenance and repair.", ["tools", "maintenance", "diy"], "LEGACY"],
    ["moto_batteries_40", "batteries40@example.com", "Power Up Batteries", "Kansas City, MO", "shop", "Reliable batteries and charging systems for all bikes.", ["batteries", "charging", "electrical"], "LEGACY"],
    ["moto_cleaning_41", "cleaning41@example.com", "Pristine Moto Clean", "Richmond, VA", "detailing", "Eco-friendly cleaning products and services.", ["cleaning", "detailing", "eco-friendly"], "LEGACY"],
    ["moto_upholstery_42", "upholstery42@example.com", "Custom Seat & Stitch", "Oklahoma City, OK", "custom", "Custom motorcycle seats and upholstery services.", ["seats", "upholstery", "comfort"], "LEGACY"],
    ["moto_dyno_43", "dyno43@example.com", "Peak Power Dyno", "Birmingham, AL", "mechanic", "Precision dyno tuning for maximum performance.", ["tuning", "performance", "dyno"], "LEGACY"],
    ["moto_powdercoating_44", "powdercoating44@example.com", "Tough Coat Powder", "Memphis, TN", "custom", "Durable and colorful powder coating for bike parts.", ["powder coating", "finishing", "protection"], "LEGACY"],
    ["moto_chrome_45", "chrome45@example.com", "Mirror Finish Chrome", "Louisville, KY", "custom", "Professional chrome plating and metal finishing.", ["chrome", "finishing", "custom"], "LEGACY"],
    ["moto_hydrographics_46", "hydrographics46@example.com", "Dip & Design Hydro", "Jacksonville, FL", "custom", "Unique hydrographic patterns for motorcycle parts.", ["hydrographics", "design", "custom"], "LEGACY"],
    ["moto_vinyl_47", "vinyl47@example.com", "Wrap It Up Vinyl", "Las Vegas, NV", "custom", "Custom vinyl wraps and graphics for motorcycles.", ["wraps", "graphics", "design"], "LEGACY"],
    ["moto_engraving_48", "engraving48@example.com", "Etch & Edge Engraving", "Tucson, AZ", "custom", "Intricate hand-engraving for custom motorcycle parts.", ["engraving", "custom", "art"], "LEGACY"],
    ["moto_leather_49", "leather49@example.com", "The Leather Craftsman", "Albuquerque, NM", "custom", "Hand-crafted leather accessories for riders.", ["leather", "accessories", "custom"], "LEGACY"],
    ["moto_jewelry_50", "jewelry50@example.com", "Biker Bling Jewelry", "Providence, RI", "art", "Unique jewelry inspired by motorcycle culture.", ["jewelry", "art", "lifestyle"], "LEGACY"]
  ].forEach(([username, email, businessName, location, businessType, bio, services, referralCode]) => {
    const details = `Bio: ${bio} | Services: ${(services as string[]).join(', ')}`;
    const uid = insertUser.run(
      username as string, 
      email as string, 
      "businessSecurePass", 
      "ecosystem", 
      `https://picsum.photos/seed/${username as string}/200/200`, 
      "user", 
      "active", 
      `LEGACY_${(username as string).toUpperCase()}`, 
      null, 
      "freemium", 
      1,
      businessName as string, // Use businessName as fullName for ecosystems
      location as string,
      bio as string,
      null,
      businessName as string,
      businessType as string,
      null,
      (services as string[]).join(', '),
      `LEGACY_${(username as string).toUpperCase()}`
    ).lastInsertRowid;
    insertEco.run(uid, businessName as string, location as string, businessType as string, details, null, null, uid);
  });

  // Mock Badges
  const b1 = insertBadge.run("First Ride", "Completed your first recorded ride.", "MapPin", "Riding Achievements", "platform", null).lastInsertRowid;
  const b2 = insertBadge.run("1,000 km Club", "Ridden over 1,000 km.", "Activity", "Riding Achievements", "platform", null).lastInsertRowid;
  const b3 = insertBadge.run("Social Butterfly", "Received 100 likes on your posts.", "Heart", "Community Participation", "platform", null).lastInsertRowid;
  const b4 = insertBadge.run("Garage Regular", "Visited Moto Garage LA 5 times.", "Wrench", "Ecosystem Interaction", "business", e1).lastInsertRowid;
  const b5 = insertBadge.run("Canyon Carver", "Completed the Sunday Morning Canyon Run.", "Mountain", "Events", "event", null).lastInsertRowid;
  const b6 = insertBadge.run("Community Builder", "Received 100 likes on your posts.", "Heart", "Community Participation", "platform", null).lastInsertRowid;
  const b7 = insertBadge.run("Influencer Rider", "Received 1000 likes on your posts.", "Star", "Community Participation", "platform", null).lastInsertRowid;

  // Award Badges to Users
  insertUserBadge.run(r1, b1, null);
  insertUserBadge.run(r1, b2, null);
  insertUserBadge.run(r1, b4, e1);
  insertUserBadge.run(r1, b6, null);
  insertUserBadge.run(r2, b1, null);
  insertUserBadge.run(r2, b5, null);

  // Mock Events
  insertEvent.run(e1, "Sunday Morning Canyon Run", "Join us for a scenic ride through the Malibu canyons. All skill levels welcome!", "2026-03-15", "08:00 AM", "Malibu, CA", "https://picsum.photos/seed/event1/800/600", 1, null, "road_trip", null);
  insertEvent.run(e2, "Classic Bike Meetup", "Show off your vintage machines and enjoy some coffee with fellow enthusiasts.", "2026-03-22", "10:00 AM", "Santa Monica, CA", "https://picsum.photos/seed/event2/800/600", 1, null, "club_meetup", null);
  insertEvent.run(r1, "Night Ride: City Lights", "A late night cruise through the neon-lit streets of downtown LA.", "2026-03-10", "09:00 PM", "Downtown LA", "https://picsum.photos/seed/event3/800/600", 1, null, "road_trip", null);

  // Mock Contests
  insertContest.run("Weekly Photo Contest", "weekly", "2026-03-01 00:00:00", "2026-03-04 00:00:00", "2026-03-07 23:59:59");
  insertContest.run("Weekly Video Contest", "weekly", "2026-03-08 00:00:00", "2026-03-11 00:00:00", "2026-03-14 23:59:59");

  // Mock Posts
  insertPost.run(r1, "Just finished a long ride through the canyons. The Iron 883 handled like a dream!", "https://picsum.photos/seed/ride1/800/600", 1, 'public', null);
  insertPost.run(e1, "New custom build just rolled out of the shop. Check out this vintage cafe racer style!", "https://picsum.photos/seed/shop1/800/600", null, 'public', null);
  insertPost.run(r2, "Track day at Laguna Seca was intense. The Panigale V4 is a beast on the straights.", "https://picsum.photos/seed/track1/800/600", 3, 'public', null);

  // Mock Routes
  insertRoute.run("rt_9921", "Serra da Moeda Scenic Loop", 72.1, "medium", 94.5, JSON.stringify(["twisty", "scenic", "mountain"]), JSON.stringify([[-20.123, -43.987], [-20.130, -43.980], [-20.140, -43.970], [-20.150, -43.960]]), -20.123, -43.987, 85, 60, 90, 40, 75);
  insertRoute.run("rt_9922", "Pacific Coast Highway - Big Sur", 120.5, "hard", 98.2, JSON.stringify(["scenic", "coastal", "legendary"]), JSON.stringify([[36.2704, -121.8081], [36.2500, -121.7800], [35.8561, -121.3262]]), 36.2704, -121.8081, 70, 50, 100, 60, 95);
  insertRoute.run("rt_9923", "Tail of the Dragon", 17.7, "hard", 99.5, JSON.stringify(["twisty", "legendary", "mountain"]), JSON.stringify([[35.4761, -83.9205], [35.5000, -83.9500], [35.5261, -83.9805]]), 35.4761, -83.9205, 100, 80, 70, 20, 100);
  insertRoute.run("rt_9924", "Hidden Valley Run", 45.2, "easy", 82.4, JSON.stringify(["hidden", "forest"]), JSON.stringify([[40.7128, -74.0060], [40.7200, -74.0100], [40.7300, -74.0200]]), 40.7128, -74.0060, 60, 40, 85, 10, 15);
})();

const updateAmbassadorReputation = (userId: number) => {
  try {
    const ambassador = db.prepare("SELECT user_id FROM ambassadors WHERE user_id = ?").get(userId) as any;
    if (!ambassador) return;

    // 1. Stamps issued
    const stampsIssued = (db.prepare("SELECT COUNT(*) as count FROM user_passport_stamps WHERE ambassador_id = ?").get(userId) as any).count;

    // 2. Events hosted
    const eventsHosted = (db.prepare("SELECT COUNT(*) as count FROM events WHERE user_id = ?").get(userId) as any).count;

    // 3. Average rating (if ecosystem)
    let ratingScore = 0;
    const ecosystem = db.prepare("SELECT user_id FROM ecosystems WHERE user_id = ?").get(userId) as any;
    if (ecosystem) {
      const rating = db.prepare("SELECT average_rating FROM rating_summaries WHERE target_type = 'ecosystem' AND target_id = ?").get(ecosystem.user_id) as any;
      if (rating) {
        ratingScore = Math.floor(rating.average_rating * 10); // 4.5 -> 45
      }
    }

    // Calculate total reputation
    // 1 point per stamp issued
    // 10 points per event hosted
    // Rating score (up to 50 points)
    const totalReputation = stampsIssued + (eventsHosted * 10) + ratingScore;

    db.prepare("UPDATE ambassadors SET reputation_score = ? WHERE user_id = ?").run(totalReputation, userId);
  } catch (err) {
    console.error("Failed to update ambassador reputation:", err);
  }
};

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

  // Trust proxy for rate limiting behind Cloud Run/Nginx
  app.set('trust proxy', 1);

  // Security Headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:", "https:", "http:"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://maps.googleapis.com"],
        "connect-src": ["'self'", "https://maps.googleapis.com", "*.googleapis.com"],
        "frame-ancestors": ["'self'", "https://ai.studio", "https://*.ai.studio", "https://*.google.com", "https://*.run.app"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "unsafe-none" },
    frameguard: false, // Allow embedding in AI Studio preview
  }));

  // Explicitly remove X-Frame-Options to ensure Firefox compatibility
  app.use((req, res, next) => {
    res.removeHeader('X-Frame-Options');
    next();
  });

  // Global Rate Limiting
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 1000, // Limit each IP to 1000 requests per windowMs
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: { error: "Too many requests, please try again later." }
  });
  app.use("/api/", globalLimiter);

  // Stricter Rate Limiting for Auth
  const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 10, // Limit each IP to 10 login/register attempts per hour
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: { error: "Too many authentication attempts, please try again in an hour." }
  });
  app.use("/api/login", authLimiter);
  app.use("/api/register", authLimiter);
  app.use("/api/forgot-password", authLimiter);
  app.use("/api/reset-password", authLimiter);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Admin check middleware (must be used after authenticateToken)
  const checkAdmin = (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const role = req.user.role; 
    if (role !== 'admin' && role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: Insufficient permissions" });
    }
    next();
  };

  const checkAmbassador = (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const ambassador = db.prepare("SELECT user_id FROM ambassadors WHERE user_id = ? AND is_active = 1").get(req.user.id);
    if (!ambassador && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: Ambassador access required" });
    }
    next();
  };

  const logAdminAction = (adminId: number, action: string, targetType?: string, targetId?: string, details?: string) => {
    try {
      db.prepare(`
        INSERT INTO admin_logs (admin_id, action, target_type, target_id, details)
        VALUES (?, ?, ?, ?, ?)
      `).run(adminId, action, targetType || null, targetId || null, details || null);
    } catch (error) {
      console.error("Failed to log admin action:", error);
    }
  };

  // JWT Authentication middleware
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
      console.log(`Auth failed: Missing token [${req.method} ${req.path}]`);
      return res.status(401).json({ error: "Unauthorized: Missing token" });
    }

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) {
        return res.status(401).json({ error: `Unauthorized: Invalid or expired token (${err.message})` });
      }
      // Refresh user data from DB to get latest plan/role
      const dbUser = db.prepare("SELECT id, username, role, plan, type FROM users WHERE id = ?").get(user.id) as any;
      if (!dbUser) {
        return res.status(401).json({ error: "Unauthorized: User no longer exists" });
      }
      req.user = dbUser;
      next();
    });
  };

  const checkFeatureAccess = (feature: string) => {
    return (req: any, res: any, next: any) => {
      try {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });

        // Admins bypass feature access checks
        if (req.user.role === 'admin') return next();

        if (feature === 'create_event' && req.user.type === 'ecosystem') {
          if (req.user.plan !== 'premium') {
            return res.status(403).json({ 
              error: "Premium feature", 
              message: "Ecosystem profiles require a premium plan to create events." 
            });
          }
          return next();
        }

        const setting = db.prepare("SELECT value FROM settings WHERE key = ?").get(`feature_${feature}`) as any;
        const requiredPlan = setting ? setting.value : 'freemium';

        if (requiredPlan === 'premium' && req.user.plan !== 'premium') {
          return res.status(403).json({ 
            error: "Premium feature", 
            message: "This feature requires a premium plan." 
          });
        }

        next();
      } catch (err) {
        console.error(`Feature access check failed for ${feature}:`, err);
        res.status(500).json({ error: "Internal server error" });
      }
    };
  };

  const optionalAuthenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
      req.user = null;
      return next();
    }

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) {
        req.user = null;
        return next();
      }
      const dbUser = db.prepare("SELECT id, username, role, plan, type FROM users WHERE id = ?").get(user.id) as any;
      req.user = dbUser || null;
      next();
    });
  };

  // API Routes
  app.post("/api/auth/google", async (req, res) => {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: "Google credential is required" });
    }

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return res.status(400).json({ error: "Invalid Google token" });
      }

      const { sub: googleId, email, name, picture } = payload;

      if (!email) {
        return res.status(400).json({ error: "Email not provided by Google" });
      }

      // Check if user exists
      let user = db.prepare("SELECT * FROM users WHERE google_id = ? OR email = ?").get(googleId, email) as any;
      let isNewUser = false;

      if (!user) {
        // Create new user
        isNewUser = true;
        const username = email.split('@')[0] + Math.floor(Math.random() * 1000);
        const newReferralCode = `GOOGLE_${googleId.substring(0, 8)}`.toUpperCase();
        const result = db.prepare("INSERT INTO users (username, email, google_id, type, profile_picture_url, status, fullName, referral_code, referralCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
          username,
          email,
          googleId,
          'rider', // Default to rider, will be updated in onboarding
          picture || null,
          'active',
          name || null,
          newReferralCode,
          newReferralCode
        );
        
        const userId = result.lastInsertRowid;
        db.prepare("INSERT INTO riders (user_id, name) VALUES (?, ?)").run(userId, name || username);
        
        user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
      } else if (!user.google_id) {
        // Link Google ID to existing email account
        db.prepare("UPDATE users SET google_id = ? WHERE id = ?").run(googleId, user.id);
        user.google_id = googleId;
      }

      if (user.status !== 'active') {
        return res.status(403).json({ error: `Account is ${user.status}` });
      }

      // Don't return the password
      const { password: _, ...userInfo } = user;
      
      // Generate JWT
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role, plan: user.plan }, JWT_SECRET, { expiresIn: '24h' });
      
      res.json({ 
        user: userInfo, 
        token,
        isNewUser,
        googleData: isNewUser ? { email, name, picture, username: user.username } : null
      });
    } catch (error: any) {
      console.error("Google Auth Error:", error);
      res.status(500).json({ error: "Google authentication failed" });
    }
  });

  app.post("/api/login", async (req, res) => {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid input", details: validation.error.format() });
    }
    const { email, password } = validation.data;
    
    try {
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;

      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (!user.password) {
        return res.status(401).json({ error: "Please login with Google or reset your password." });
      }

      // Check if password is hashed (starts with $2a$ or $2b$ or $2y$)
      const isHashed = user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$');
      
      let passwordMatch = false;
      if (isHashed) {
        passwordMatch = await bcrypt.compare(password, user.password);
      } else {
        passwordMatch = user.password === password;
        if (passwordMatch) {
          // Migrate to hashed password
          const hashedPassword = await bcrypt.hash(password, 10);
          db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashedPassword, user.id);
        }
      }

      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (user.status !== 'active') {
        return res.status(403).json({ error: `Account is ${user.status}` });
      }

      // Don't return the password
      const { password: _, ...userInfo } = user;
      
      // Generate JWT
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role, plan: user.plan }, JWT_SECRET, { expiresIn: '24h' });
      
      res.json({ user: userInfo, token });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/forgot-password", async (req, res) => {
    const { email } = req.body;
    console.log(`[Forgot Password] Request for: ${email}`);
    
    try {
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
      if (!user) {
        console.log(`[Forgot Password] User not found: ${email}`);
        return res.status(404).json({ error: "User not found" });
      }

      const token = crypto.randomBytes(20).toString('hex');
      const expires = new Date(Date.now() + 3600000); // 1 hour

      console.log(`[Forgot Password] Updating database for: ${email}`);
      const dbResult = db.prepare("UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE email = ?").run(token, expires.toISOString(), email);
      console.log(`[Forgot Password] Database update result:`, dbResult);
      
      const resetLink = `${process.env.APP_URL}/reset-password/${token}`;

      console.log(`[Forgot Password] Attempting to send email via MailerSend...`);
      if (!process.env.MAILERSEND_API_KEY) {
        console.error("[Forgot Password] Error: MAILERSEND_API_KEY is not set in environment variables.");
        throw new Error("Email service is not configured. Please contact support.");
      }
      
      const sentFrom = new Sender(
        process.env.MAILERSEND_SENDER_EMAIL || "no-reply@test-vz9dlem9ok74kj50.mlsender.net",
        process.env.MAILERSEND_SENDER_NAME || "Cafe 777"
      );
      const recipients = [new Recipient(email, user.username)];

      const emailParams = new EmailParams()
        .setFrom(sentFrom)
        .setTo(recipients)
        .setReplyTo(sentFrom)
        .setSubject("Password Reset Request")
        .setHtml(`
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #141414; color: #ffffff; border-radius: 10px;">
            <h1 style="color: #f97316;">Password Reset</h1>
            <p>Hello ${user.username},</p>
            <p>You requested a password reset for your Cafe 777 account. Click the button below to reset it. This link will expire in 1 hour.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
            </div>
            <p>If you didn't request this, you can safely ignore this email.</p>
            <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;">
            <p style="font-size: 12px; color: #888;">Cafe 777 - The Ultimate Biker Ecosystem</p>
          </div>
        `)
        .setText(`Hello ${user.username},\n\nYou requested a password reset for your Cafe 777 account. Use the link below to reset it:\n\n${resetLink}\n\nIf you didn't request this, ignore this email.`);

      // Add a 10-second timeout to the MailerSend call
      const sendPromise = mailerSend.email.send(emailParams);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Email service timed out")), 10000)
      );

      const result = await Promise.race([sendPromise, timeoutPromise]);
      console.log(`[Forgot Password] MailerSend result:`, result);
      res.json({ message: "Reset link sent" });
    } catch (error: any) {
      console.error("[Forgot Password] Error:", error);
      res.status(500).json({ error: error.message || "Failed to send email" });
    }
  });

  app.post("/api/reset-password", async (req, res) => {
    const { token, password } = req.body;
    
    // Password strength validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ error: "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number and one special character" });
    }

    const user = db.prepare("SELECT * FROM users WHERE password_reset_token = ? AND password_reset_expires > ?").get(token, new Date().toISOString()) as any;
    
    if (!user) return res.status(400).json({ error: "Invalid or expired token" });

    const hashedPassword = await bcrypt.hash(password, 10);
    db.prepare("UPDATE users SET password = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?").run(hashedPassword, user.id);

    res.json({ message: "Password updated successfully" });
  });

  app.get("/api/contests/active", (req, res) => {
    try {
      const contests = db.prepare(`
        SELECT c.*, b.name as prize_badge_name, b.icon as prize_badge_icon
        FROM contests c 
        LEFT JOIN badges b ON c.prize_badge_id = b.badge_id
        WHERE c.status = 'active'
        AND datetime('now') BETWEEN c.start_date AND c.end_date 
        ORDER BY c.start_date DESC
      `).all();
      res.json(contests);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contests/:id/submissions", authenticateToken, upload.single('photo'), (req: any, res) => {
    const { user_id, motorcycle_id, description } = req.body;
    const contest_id = req.params.id;
    const photo_url = (req as any).file ? `/uploads/${(req as any).file.filename}` : null;

    if (!user_id || !photo_url) {
      return res.status(400).json({ error: "User ID and photo are required" });
    }
    
    if (user_id !== req.user.id.toString() && user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only submit for yourself" });
    }

    try {
      // Verify contest is active
      const contest = db.prepare(`
        SELECT * FROM contests 
        WHERE id = ? AND status = 'active'
        AND datetime('now') BETWEEN start_date AND end_date
      `).get(contest_id) as any;

      if (!contest) {
        return res.status(404).json({ error: "Active contest not found" });
      }

      // Check if user already submitted
      const existing = db.prepare("SELECT id FROM submissions WHERE contest_id = ? AND user_id = ?").get(contest_id, user_id);
      if (existing) {
        return res.status(400).json({ error: "You have already submitted a photo for this contest" });
      }

      const stmt = db.prepare(`
        INSERT INTO submissions (contest_id, user_id, motorcycle_id, photo_url, description)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(contest_id, user_id, motorcycle_id || null, photo_url, description || null);

      res.status(201).json({ message: "Submission successful" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/contests/:id/submissions", (req, res) => {
    const contest_id = req.params.id;
    try {
      const contest = db.prepare(`
        SELECT * FROM contests WHERE id = ?
      `).get(contest_id) as any;

      if (!contest) {
        return res.status(404).json({ error: "Contest not found" });
      }

      const submissions = db.prepare(`
        SELECT s.*, u.username, u.profile_picture_url,
               m.make as moto_make, m.model as moto_model, m.year as moto_year,
               (SELECT COUNT(*) FROM votes WHERE submission_id = s.id) as vote_count
        FROM submissions s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN motorcycles m ON s.motorcycle_id = m.id
        WHERE s.contest_id = ? AND s.approved = 1
      `).all(contest_id);

      res.json({ contest, submissions });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contests/:id/votes", authenticateToken, (req: any, res) => {
    const { user_id, submission_id } = req.body;
    const contest_id = req.params.id;

    if (!user_id || !submission_id) {
      return res.status(400).json({ error: "User ID and submission ID are required" });
    }

    if (user_id !== req.user.id.toString() && user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only vote for yourself" });
    }

    try {
      // Verify contest is active
      const contest = db.prepare(`
        SELECT * FROM contests 
        WHERE id = ? AND status = 'active'
        AND datetime('now') BETWEEN COALESCE(voting_start_date, start_date) AND end_date
      `).get(contest_id) as any;

      if (!contest) {
        return res.status(404).json({ error: "Contest is not in voting phase" });
      }

      // Check if user already voted
      const existing = db.prepare("SELECT id FROM votes WHERE contest_id = ? AND user_id = ?").get(contest_id, user_id);
      if (existing) {
        return res.status(400).json({ error: "You have already voted in this contest" });
      }

      const stmt = db.prepare(`
        INSERT INTO votes (contest_id, submission_id, user_id)
        VALUES (?, ?, ?)
      `);
      stmt.run(contest_id, submission_id, user_id);

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

  app.post("/api/submissions/:id/comments", authenticateToken, (req: any, res) => {
    const { user_id, content } = req.body;
    if (!user_id || !content) {
      return res.status(400).json({ error: "User ID and content are required" });
    }
    
    if (user_id !== req.user.id.toString() && user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only comment for yourself" });
    }
    
    try {
      const stmt = db.prepare("INSERT INTO comments (submission_id, user_id, content) VALUES (?, ?, ?)");
      stmt.run(req.params.id, user_id, content);
      res.status(201).json({ message: "Comment added" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Chat API Endpoints ---

  app.get("/api/chats", authenticateToken, (req: any, res) => {
    try {
      const userId = req.user.id;
      const chats = db.prepare(`
        SELECT c.*, 
               (SELECT GROUP_CONCAT(user_id) FROM chat_participants WHERE chat_id = c.id) as participantIds,
               (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id AND m.sender_id != ? AND (cp.last_read_message_id IS NULL OR m.id > cp.last_read_message_id)) as unread_count
        FROM chats c
        JOIN chat_participants cp ON c.id = cp.chat_id
        WHERE cp.user_id = ?
        ORDER BY c.last_message_timestamp DESC, c.created_at DESC
      `).all(userId, userId) as any[];

      // Parse participantIds into an array
      const formattedChats = chats.map(chat => ({
        ...chat,
        participantIds: chat.participantIds ? chat.participantIds.split(',').map(Number) : [],
        unread_count: chat.unread_count || 0
      }));

      res.setHeader('Content-Type', 'application/json');
      res.json(formattedChats);
    } catch (error: any) {
      console.error("Error in GET /api/chats:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chats", authenticateToken, (req: any, res) => {
    const { participantIds, type, title } = req.body;
    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ error: "Participant IDs are required" });
    }

    const numericParticipantIds = participantIds.map(Number);
    if (!numericParticipantIds.includes(Number(req.user.id))) {
      return res.status(403).json({ error: "Forbidden: You must be a participant to create a chat" });
    }

    try {
      const stmt = db.prepare("INSERT INTO chats (type, title) VALUES (?, ?)");
      const info = stmt.run(type || 'one-on-one', title || null);
      const chatId = info.lastInsertRowid;

      const participantStmt = db.prepare("INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)");
      for (const userId of numericParticipantIds) {
        participantStmt.run(chatId, userId);
      }

      res.status(201).json({ id: chatId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chats/find", authenticateToken, (req: any, res) => {
    const { participantIds } = req.body;
    if (!participantIds || !Array.isArray(participantIds) || participantIds.length !== 2) {
      return res.status(400).json({ error: "Exactly two participant IDs are required for one-on-one chat" });
    }

    const numericParticipantIds = participantIds.map(Number);
    if (!numericParticipantIds.includes(Number(req.user.id))) {
      return res.status(403).json({ error: "Forbidden: You must be a participant to find a chat" });
    }

    try {
      // Find a one-on-one chat that has exactly these two participants
      const chat = db.prepare(`
        SELECT c.id 
        FROM chats c
        WHERE c.type = 'one-on-one'
          AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) = 2
          AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id AND user_id IN (?, ?)) = 2
        LIMIT 1
      `).get(numericParticipantIds[0], numericParticipantIds[1]) as any;

      if (chat) {
        res.json({ id: chat.id });
      } else {
        res.json({ id: null });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/chats/:id/messages", authenticateToken, (req: any, res) => {
    try {
      const chatId = req.params.id;
      const userId = req.user.id;

      // Check if user is a participant
      const participant = db.prepare("SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?").get(chatId, userId);
      if (!participant) {
        return res.status(403).json({ error: "Forbidden: You are not a participant in this chat" });
      }

      const messages = db.prepare(`
        SELECT m.*, u.username as sender_name, u.profile_picture_url as sender_avatar
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.chat_id = ?
        ORDER BY m.created_at ASC
      `).all(chatId);

      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chats/:id/messages", authenticateToken, (req: any, res) => {
    const { text } = req.body;
    const chatId = req.params.id;
    const senderId = req.user.id;

    if (!text) {
      return res.status(400).json({ error: "Message text is required" });
    }

    try {
      // Check if user is a participant
      const participant = db.prepare("SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?").get(chatId, senderId);
      if (!participant) {
        return res.status(403).json({ error: "Forbidden: You are not a participant in this chat" });
      }

      const stmt = db.prepare("INSERT INTO messages (chat_id, sender_id, text) VALUES (?, ?, ?)");
      const info = stmt.run(chatId, senderId, text);
      const messageId = info.lastInsertRowid;

      // Update chat last message
      db.prepare(`
        UPDATE chats 
        SET last_message = ?, last_message_timestamp = CURRENT_TIMESTAMP, last_message_sender_id = ? 
        WHERE id = ?
      `).run(text, senderId, chatId);

      // Update sender's last read message
      db.prepare("UPDATE chat_participants SET last_read_message_id = ? WHERE chat_id = ? AND user_id = ?").run(messageId, chatId, senderId);

      res.status(201).json({ id: messageId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chats/:id/read", authenticateToken, (req: any, res) => {
    const chatId = req.params.id;
    const userId = req.user.id;

    try {
      // Check if user is a participant
      const participant = db.prepare("SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?").get(chatId, userId);
      if (!participant) {
        return res.status(403).json({ error: "Forbidden: You are not a participant in this chat" });
      }

      // Get the latest message ID
      const latestMessage = db.prepare("SELECT id FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1").get(chatId) as any;
      if (latestMessage) {
        db.prepare("UPDATE chat_participants SET last_read_message_id = ? WHERE chat_id = ? AND user_id = ?").run(latestMessage.id, chatId, userId);
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/notifications", authenticateToken, (req: any, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: "User ID is required" });
    
    if (user_id !== req.user.id.toString() && user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only view your own notifications" });
    }

    const notifications = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC").all(user_id);
    res.json(notifications);
  });

  app.post("/api/notifications/:id/read", authenticateToken, (req: any, res) => {
    const notification = db.prepare("SELECT user_id FROM notifications WHERE id = ?").get(req.params.id) as any;
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    if (notification.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only read your own notifications" });
    }
    db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(req.params.id);
    res.json({ message: "Notification marked as read" });
  });

  // Admin: Get keywords config
  app.get("/api/admin/keywords", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    try {
      const keywords = db.prepare("SELECT * FROM keywords_config").all();
      res.json(keywords.map((k: any) => ({ ...k, keywords: JSON.parse(k.keywords) })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch keywords" });
    }
  });

  // Admin: Create keyword config
  app.post("/api/admin/keywords", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { category_name, keywords, radius, icon } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO keywords_config (category_name, keywords, radius, icon) VALUES (?, ?, ?, ?)");
      const result = stmt.run(category_name, JSON.stringify(keywords), radius || 5000, icon);
      res.json({ id: result.lastInsertRowid, category_name, keywords, radius, icon });
    } catch (error) {
      res.status(500).json({ error: "Failed to create keyword config" });
    }
  });

  // Admin: Update keyword config
  app.put("/api/admin/keywords/:id", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { category_name, keywords, radius, icon } = req.body;
    try {
      const stmt = db.prepare("UPDATE keywords_config SET category_name = ?, keywords = ?, radius = ?, icon = ? WHERE id = ?");
      stmt.run(category_name, JSON.stringify(keywords), radius, icon, req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update keyword config" });
    }
  });

  // Admin: Delete keyword config
  app.delete("/api/admin/keywords/:id", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    try {
      db.prepare("DELETE FROM keywords_config WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete keyword config" });
    }
  });

  // Admin: Get places control
  app.get("/api/admin/places", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    try {
      const places = db.prepare(`
        SELECT c.*, p.is_approved, p.is_hidden, p.custom_category, p.priority_score 
        FROM places_cache c
        LEFT JOIN places_control p ON c.place_id = p.place_id
      `).all();
      res.json(places);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch places" });
    }
  });

  // Admin: Bulk import places
  app.post("/api/admin/places/bulk-import", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { places } = req.body;
    if (!Array.isArray(places)) return res.status(400).json({ error: "Invalid data format" });

    try {
      const insertCache = db.prepare(`
        INSERT OR REPLACE INTO places_cache 
        (place_id, name, lat, lng, rating, reviews, category, source_keyword, last_fetched)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      const insertControl = db.prepare(`
        INSERT OR REPLACE INTO places_control 
        (place_id, is_approved, is_hidden, custom_category, priority_score)
        VALUES (?, ?, ?, ?, ?)
      `);

      db.transaction(() => {
        for (const p of places) {
          const placeId = p.place_id || p.id;
          if (!placeId) continue;

          // Insert into cache
          insertCache.run(
            placeId,
            p.name,
            p.lat,
            p.lng,
            p.rating || 0,
            p.reviews || 0,
            p.category || 'other',
            p.source_keyword || 'manual_import'
          );

          // Insert into control (default to approved if not specified)
          insertControl.run(
            placeId,
            p.is_approved !== undefined ? (p.is_approved ? 1 : 0) : 1,
            p.is_hidden !== undefined ? (p.is_hidden ? 1 : 0) : 0,
            p.custom_category || p.category || null,
            p.priority_score || 0
          );
        }
      })();

      res.json({ success: true, count: places.length });
    } catch (error) {
      console.error("Error bulk importing places:", error);
      res.status(500).json({ error: "Failed to bulk import places" });
    }
  });

  // Admin: Update place control
  app.post("/api/admin/places/:id/control", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { is_approved, is_hidden, custom_category, priority_score } = req.body;
    try {
      const existing = db.prepare("SELECT * FROM places_control WHERE place_id = ?").get(req.params.id) as any;
      
      if (existing) {
        const final_approved = is_approved !== undefined ? (is_approved ? 1 : 0) : existing.is_approved;
        const final_hidden = is_hidden !== undefined ? (is_hidden ? 1 : 0) : existing.is_hidden;
        const final_category = custom_category !== undefined ? custom_category : existing.custom_category;
        const final_priority = priority_score !== undefined ? priority_score : existing.priority_score;

        db.prepare("UPDATE places_control SET is_approved = ?, is_hidden = ?, custom_category = ?, priority_score = ? WHERE place_id = ?")
          .run(final_approved, final_hidden, final_category, final_priority, req.params.id);
      } else {
        db.prepare("INSERT INTO places_control (place_id, is_approved, is_hidden, custom_category, priority_score) VALUES (?, ?, ?, ?, ?)")
          .run(
            req.params.id, 
            is_approved !== undefined ? (is_approved ? 1 : 0) : 0, 
            is_hidden !== undefined ? (is_hidden ? 1 : 0) : 0, 
            custom_category || null, 
            priority_score || 0
          );
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating place control:", error);
      res.status(500).json({ error: "Failed to update place control" });
    }
  });

  // Advanced Search Endpoint
  app.post("/api/places/advanced-search", async (req, res) => {
    const { mode, lat, lng, radius, bounds, polyline, keywords } = req.body;
    const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY || (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY;
    
    const settings = db.prepare("SELECT key, value FROM settings").all() as any[];
    const settingsMap = settings.reduce((acc, curr) => { acc[curr.key] = curr.value; return acc; }, {} as any);
    const enableGoogleMaps = settingsMap['api_google_maps'] === 'true';
    const enableOSM = settingsMap['api_osm'] === 'true';

    const getDistance = (p1: number[], p2: number[]) => {
      const R = 6371e3; // metres
      const φ1 = p1[0] * Math.PI/180;
      const φ2 = p2[0] * Math.PI/180;
      const Δφ = (p2[0]-p1[0]) * Math.PI/180;
      const Δλ = (p2[1]-p1[1]) * Math.PI/180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    try {
      // 1. Get all keywords config
      const keywordConfigs = db.prepare("SELECT * FROM keywords_config").all();
      const activeKeywords = keywords && keywords.length > 0 
        ? keywordConfigs.filter((k: any) => keywords.includes(k.category_name))
        : keywordConfigs;

      let allPlaces: any[] = [];
      let samplePoints: number[][] = [];

      // Helper function to fetch from Google Places
      const fetchPlaces = async (searchLat: number, searchLng: number, searchRadius: number, keywordStr: string, category: string) => {
        if (!enableGoogleMaps || !apiKey) return [];
        const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
        url.searchParams.append("location", `${searchLat},${searchLng}`);
        url.searchParams.append("radius", searchRadius.toString());
        url.searchParams.append("keyword", keywordStr);
        url.searchParams.append("key", apiKey);

        const response = await fetch(url.toString());
        const data = await response.json();
        
        if (data.status === 'OK') {
          const places = data.results.map((p: any) => ({
            place_id: p.place_id,
            name: p.name,
            lat: p.geometry.location.lat,
            lng: p.geometry.location.lng,
            rating: p.rating || 0,
            reviews: p.user_ratings_total || 0,
            category: category,
            source_keyword: keywordStr,
            city: '',
            details: '',
            full_address: p.vicinity || '',
            source: 'google'
          }));

          // Cache places
          const insertCache = db.prepare(`
            INSERT OR REPLACE INTO places_cache 
            (place_id, name, lat, lng, rating, reviews, category, source_keyword, city, details, full_address, source, last_fetched)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `);
          
          db.transaction(() => {
            for (const p of places) {
              insertCache.run(p.place_id, p.name, p.lat, p.lng, p.rating, p.reviews, p.category, p.source_keyword, p.city, p.details, p.full_address, p.source);
            }
          })();

          return places;
        }
        return [];
      };

      // Helper function to fetch from OSM
      const fetchOSM = async (searchLat: number, searchLng: number, searchRadius: number) => {
        if (!enableOSM) return [];
        try {
          const osmPlaces = await fetchOSMPlaces(searchLat, searchLng, searchRadius);
          const mappedOSM = osmPlaces.map(p => ({
            place_id: p.id,
            name: p.name,
            lat: p.lat,
            lng: p.lng,
            rating: p.rating,
            reviews: p.reviews,
            category: p.category,
            source_keyword: 'osm_search',
            city: p.city,
            details: p.details,
            full_address: p.full_address,
            source: 'osm'
          }));

          // Cache OSM places
          const insertCache = db.prepare(`
            INSERT OR REPLACE INTO places_cache 
            (place_id, name, lat, lng, rating, reviews, category, source_keyword, city, details, full_address, source, last_fetched)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `);
          
          db.transaction(() => {
            for (const p of mappedOSM) {
              insertCache.run(p.place_id, p.name, p.lat, p.lng, p.rating, p.reviews, p.category, p.source_keyword, p.city, p.details, p.full_address, p.source);
            }
          })();

          return mappedOSM;
        } catch (e) {
          console.error("OSM fetch error in advanced-search:", e);
          return [];
        }
      };

      // 2. Execute search based on mode
      if (mode === 'near_me' && lat && lng) {
        const searchRadius = radius || 5000;
        for (const config of activeKeywords) {
          const kws = JSON.parse((config as any).keywords);
          for (const kw of kws) {
            const places = await fetchPlaces(lat, lng, searchRadius, kw, (config as any).category_name);
            allPlaces = [...allPlaces, ...places];
          }
        }
        const osmPlaces = await fetchOSM(lat, lng, searchRadius);
        allPlaces = [...allPlaces, ...osmPlaces];
      } else if (mode === 'viewport' && bounds) {
        // Calculate center and radius from bounds
        const centerLat = (bounds.north + bounds.south) / 2;
        const centerLng = (bounds.east + bounds.west) / 2;
        const viewportRadius = Math.min((getDistance([bounds.north, bounds.west], [bounds.south, bounds.east])) / 2, 50000); // Max 50km

        for (const config of activeKeywords) {
          const kws = JSON.parse((config as any).keywords);
          for (const kw of kws) {
            const places = await fetchPlaces(centerLat, centerLng, viewportRadius, kw, (config as any).category_name);
            allPlaces = [...allPlaces, ...places];
          }
        }
        const osmPlaces = await fetchOSM(centerLat, centerLng, viewportRadius);
        allPlaces = [...allPlaces, ...osmPlaces];
      } else if (mode === 'route' && polyline) {
        const points = polyline;
        if (points.length > 0) {
          samplePoints = [points[0]];
          let lastPoint = points[0];
          
          for (let i = 1; i < points.length; i++) {
            const dist = getDistance(lastPoint, points[i]);
            if (dist > 5000) {
              samplePoints.push(points[i]);
              lastPoint = points[i];
            }
          }
          
          if (getDistance(lastPoint, points[points.length - 1]) > 1000) {
            samplePoints.push(points[points.length - 1]);
          }
          
          const limitedSamples = samplePoints.slice(0, 10);
          
          for (const pt of limitedSamples) {
            for (const config of activeKeywords) {
              const kws = JSON.parse((config as any).keywords);
              for (const kw of kws) {
                const places = await fetchPlaces(pt[0], pt[1], 3000, kw, (config as any).category_name);
                allPlaces = [...allPlaces, ...places];
              }
            }
            const osmPlaces = await fetchOSM(pt[0], pt[1], 3000);
            allPlaces = [...allPlaces, ...osmPlaces];
          }
        }
      }

      // 3. Deduplicate
      const uniquePlacesMap = new Map();
      for (const p of allPlaces) {
        if (!uniquePlacesMap.has(p.place_id)) {
          uniquePlacesMap.set(p.place_id, p);
        }
      }

      // 3.5 Add approved places from control table that might not be in the current search results
      // This ensures that "Deka Customs" and others show up if they are in the cache and approved
      try {
        const approvedPlaces = db.prepare(`
          SELECT c.*, p.is_approved, p.is_hidden, p.custom_category, p.priority_score 
          FROM places_control p
          JOIN places_cache c ON p.place_id = c.place_id
          WHERE p.is_approved = 1 AND p.is_hidden = 0
        `).all();

        for (const p of approvedPlaces as any[]) {
          if (!uniquePlacesMap.has(p.place_id)) {
            // Only add if it's within a reasonable distance of the search area
            let shouldAdd = false;
            if (mode === 'near_me' && lat && lng) {
              const dist = getDistance([lat, lng], [p.lat, p.lng]);
              if (dist <= (radius || 50000)) shouldAdd = true;
            } else if (mode === 'viewport' && bounds) {
              if (p.lat <= bounds.north && p.lat >= bounds.south && p.lng <= bounds.east && p.lng >= bounds.west) {
                shouldAdd = true;
              }
            } else if (mode === 'route' && polyline) {
              // For routes, we check if it's near any of the sample points
              for (const pt of samplePoints) {
                if (getDistance(pt, [p.lat, p.lng]) <= 10000) { // 10km radius from any route point
                  shouldAdd = true;
                  break;
                }
              }
            }

            if (shouldAdd) {
              uniquePlacesMap.set(p.place_id, p);
            }
          }
        }
      } catch (e) {
        console.error("Error adding approved places to search results:", e);
      }

      let uniquePlaces = Array.from(uniquePlacesMap.values());

      // 4. Apply Admin Controls & Filtering
      const placeIds = uniquePlaces.map(p => `'${p.place_id}'`).join(',');
      let controls: any[] = [];
      if (placeIds.length > 0) {
        controls = db.prepare(`SELECT * FROM places_control WHERE place_id IN (${placeIds})`).all();
      }
      
      const controlMap = new Map(controls.map(c => [c.place_id, c]));

      uniquePlaces = uniquePlaces.filter(p => {
        const control = controlMap.get(p.place_id);
        if (control && control.is_hidden) return false;
        // Hybrid mode: Show if approved OR (rating >= 4.0 and reviews >= 10)
        if (control && control.is_approved) return true;
        // More inclusive default filtering: rating >= 3.5 OR (rating > 0 and reviews >= 5)
        return p.rating >= 3.5 || (p.rating > 0 && p.reviews >= 5);
      });

      // Apply custom categories and priority
      uniquePlaces = uniquePlaces.map(p => {
        const control = controlMap.get(p.place_id);
        if (control) {
          return {
            ...p,
            category: control.custom_category || p.category,
            priority_score: control.priority_score || 0
          };
        }
        return { ...p, priority_score: 0 };
      });

      // 5. Ranking Logic
      // score = (rating * 10) + (reviews * 0.1) + priority_score
      uniquePlaces.sort((a, b) => {
        const scoreA = (a.rating * 10) + (a.reviews * 0.1) + a.priority_score;
        const scoreB = (b.rating * 10) + (b.reviews * 0.1) + b.priority_score;
        return scoreB - scoreA;
      });

      // 6. Deduplicate with internal places
      // Get internal places to check for duplicates
      const internalPlaces = db.prepare(`
        SELECT company_name as name, lat, lng FROM ecosystems
        UNION ALL
        SELECT COALESCE(e.company_name, r.name) as name, e.lat, e.lng 
        FROM ambassadors a
        JOIN users u ON a.user_id = u.id
        LEFT JOIN ecosystems e ON u.id = e.user_id
        LEFT JOIN riders r ON u.id = r.user_id
        WHERE e.lat IS NOT NULL AND e.lng IS NOT NULL
      `).all();

      uniquePlaces = uniquePlaces.filter(p => {
        const isDuplicate = internalPlaces.some((internal: any) => 
          internal.name && p.name &&
          internal.name.toLowerCase() === p.name.toLowerCase() &&
          Math.abs(internal.lat - p.lat) < 0.01 &&
          Math.abs(internal.lng - p.lng) < 0.01
        );
        return !isDuplicate;
      });

      res.json(uniquePlaces);
    } catch (error: any) {
      console.error("Advanced Search Error:", error);
      res.status(500).json({ error: error.message || "Internal server error during search" });
    }
  });

  app.get("/api/places/nearby", async (req, res) => {
    const { lat, lng, radius, keyword } = req.query;
    const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY || (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: "Google Maps API key not configured" });
    }

    try {
      const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
      url.searchParams.append("location", `${lat},${lng}`);
      url.searchParams.append("radius", (radius as string) || "25000"); // Default 25km
      if (keyword) url.searchParams.append("keyword", keyword as string);
      url.searchParams.append("key", apiKey);

      const response = await fetch(url.toString());
      const data = await response.json();
      
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error("Google Places API Error:", data);
        return res.status(500).json({ error: data.error_message || "Failed to fetch places" });
      }
      
      res.json(data.results || []);
    } catch (error: any) {
      console.error("Places API Exception:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/places/osm", async (req, res) => {
    const { lat, lng, radius } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: "Missing lat or lng parameters" });
    }

    try {
      const places = await fetchOSMPlaces(Number(lat), Number(lng), radius ? Number(radius) : 10000);
      res.json(places);
    } catch (error: any) {
      console.error("OSM Places API Exception:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/search", (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') return res.json({ routes: [], events: [], clubs: [], riders: [], locations: [] });

    const searchTerm = `%${q.toLowerCase()}%`;

    try {
      // Search Routes
      const routes = db.prepare(`
        SELECT * FROM discovered_routes 
        WHERE LOWER(name) LIKE ? OR LOWER(tags) LIKE ?
        LIMIT 5
      `).all(searchTerm, searchTerm);

      // Search Events
      const events = db.prepare(`
        SELECT * FROM events 
        WHERE LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(location) LIKE ?
        LIMIT 5
      `).all(searchTerm, searchTerm, searchTerm);

      // Search Clubs (Ecosystems with service_category = 'club')
      const clubs = db.prepare(`
        SELECT u.id, u.username, u.profile_picture_url, e.company_name, e.full_address 
        FROM users u 
        JOIN ecosystems e ON u.id = e.user_id 
        WHERE u.type = 'ecosystem' AND e.service_category = 'club' AND (LOWER(u.username) LIKE ? OR LOWER(e.company_name) LIKE ?)
        LIMIT 5
      `).all(searchTerm, searchTerm);

      // Search Riders
      const riders = db.prepare(`
        SELECT u.id, u.username, u.profile_picture_url, r.name as rider_name 
        FROM users u 
        LEFT JOIN riders r ON u.id = r.user_id 
        WHERE u.type = 'rider' AND (LOWER(u.username) LIKE ? OR LOWER(r.name) LIKE ?)
        LIMIT 5
      `).all(searchTerm, searchTerm);

      // Search Locations (Ecosystems with service_category != 'club')
      const locations = db.prepare(`
        SELECT u.id, u.username, u.profile_picture_url, e.company_name, e.full_address, e.service_category, e.lat, e.lng 
        FROM users u 
        JOIN ecosystems e ON u.id = e.user_id 
        WHERE u.type = 'ecosystem' AND e.service_category != 'club' AND (LOWER(u.username) LIKE ? OR LOWER(e.company_name) LIKE ?)
        LIMIT 5
      `).all(searchTerm, searchTerm);

      res.json({
        routes,
        events,
        clubs,
        riders,
        locations
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/search/parts-and-service", (req, res) => {
    const { keyword, location } = req.query;
    
    try {
      let query = `
        SELECT u.id, u.username, u.profile_picture_url, e.company_name, e.full_address, e.service_category, e.lat, e.lng, e.details, e.phone, e.website
        FROM users u 
        JOIN ecosystems e ON u.id = e.user_id 
        WHERE u.type = 'ecosystem' AND e.service_category IN ('repair', 'dealership', 'parts', 'parts_store')
      `;
      const params: any[] = [];

      if (keyword && typeof keyword === 'string') {
        query += ` AND (LOWER(e.company_name) LIKE ? OR LOWER(e.service_category) LIKE ? OR LOWER(e.details) LIKE ?)`;
        const searchTerm = `%${keyword.toLowerCase()}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      if (location && typeof location === 'string') {
        query += ` AND LOWER(e.full_address) LIKE ?`;
        params.push(`%${location.toLowerCase()}%`);
      }

      query += ` LIMIT 20`;

      const results = db.prepare(query).all(...params);
      res.json(results);
    } catch (err) {
      console.error("Parts and service search error:", err);
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.get("/api/users/firebase/:firebase_uid", (req, res) => {
    const { firebase_uid } = req.params;
    try {
      const user = db.prepare("SELECT * FROM users WHERE firebase_uid = ?").get(firebase_uid) as any;
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const profile = db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(user.id);
      res.json({ ...user, profile });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.get("/api/users/search", (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.json([]);
    }
    
    try {
      const users = db.prepare(`
        SELECT id, username, profile_picture_url 
        FROM users 
        WHERE username LIKE ? AND status = 'active'
        LIMIT 5
      `).all(`${q}%`); // Search for usernames starting with q
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/users", authenticateToken, checkAdmin, (req, res) => {
    const users = db.prepare("SELECT id, username, email, type, role, profile_picture_url, created_at FROM users").all();
    res.json(users);
  });

  app.get("/api/users/:username/badges", (req, res) => {
    try {
      const user = db.prepare("SELECT id FROM users WHERE username = ?").get(req.params.username) as any;
      if (!user) return res.status(404).json({ error: "User not found" });

      const badges = db.prepare(`
        SELECT b.*, ub.user_badge_id, ub.awarded_date, ub.awarded_by,
               creator.username as creator_username,
               creator.type as creator_type_name
        FROM user_badges ub
        JOIN badges b ON ub.badge_id = b.badge_id
        LEFT JOIN users creator ON b.creator_id = creator.id
        WHERE ub.user_id = ?
        ORDER BY ub.awarded_date DESC
      `).all(user.id);
      res.json(badges);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/stamps", (req, res) => {
    try {
      const stamps = db.prepare("SELECT * FROM passport_stamps").all();
      res.json(stamps);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/badges", (req, res) => {
    const { creator_id } = req.query;
    try {
      let query = `
        SELECT b.*, creator.username as creator_username, creator.type as creator_type_name
        FROM badges b
        LEFT JOIN users creator ON b.creator_id = creator.id
        WHERE b.is_active = 1
      `;
      const params: any[] = [];

      if (creator_id) {
        query += ` AND b.creator_id = ?`;
        params.push(creator_id);
      }

      query += ` ORDER BY b.creation_date DESC`;

      const badges = db.prepare(query).all(...params);
      res.json(badges);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/stamps", authenticateToken, checkAdmin, (req, res) => {
    const { name, description, icon, category, creator_type, creator_id } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO passport_stamps (name, description, icon, type, creator_type, creator_id, ambassador_id) VALUES (?, ?, ?, ?, ?, ?, ?)");
      const result = stmt.run(name, description || '', icon, category || 'event', creator_type, creator_id || null, 0);
      res.status(201).json({ message: "Stamp created successfully", id: result.lastInsertRowid });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/stamps/:id", authenticateToken, checkAdmin, (req, res) => {
    const { id } = req.params;
    const { name, description, icon, category } = req.body;
    try {
      const stmt = db.prepare(`
        UPDATE passport_stamps 
        SET name = ?, description = ?, icon = ?, type = ? 
        WHERE id = ?
      `);
      stmt.run(name, description, icon, category, id);
      res.json({ message: "Stamp updated successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/badges", authenticateToken, checkAdmin, (req, res) => {
    const { name, description, icon, category, creator_type, creator_id } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO badges (name, description, icon, category, creator_type, creator_id) VALUES (?, ?, ?, ?, ?, ?)");
      const result = stmt.run(name, description || '', icon, category || 'General', creator_type, creator_id || null);
      res.status(201).json({ message: "Badge created successfully", badge_id: result.lastInsertRowid });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/badges/:id", authenticateToken, checkAdmin, (req, res) => {
    const { id } = req.params;
    const { name, description, icon, category } = req.body;
    try {
      const stmt = db.prepare(`
        UPDATE badges 
        SET name = ?, description = ?, icon = ?, category = ? 
        WHERE badge_id = ?
      `);
      stmt.run(name, description, icon, category, id);
      res.json({ message: "Badge updated successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/badges/award", authenticateToken, checkAdmin, (req, res) => {
    const { user_id, badge_id, awarded_by } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO user_badges (user_id, badge_id, awarded_by) VALUES (?, ?, ?)");
      stmt.run(user_id, badge_id, awarded_by);
      res.status(201).json({ message: "Badge awarded successfully" });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: "User already has this badge" });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/roads", (req, res) => {
    try {
      const routes = db.prepare("SELECT * FROM discovered_routes").all() as any[];
      // Parse JSON strings back to arrays/objects
      const formattedRoutes = routes.map(route => ({
        route_id: route.id,
        name: route.name,
        distance_km: route.distance_km,
        difficulty: route.difficulty,
        road_score: route.road_score,
        tags: JSON.parse(route.tags),
        polyline: JSON.parse(route.polyline),
        start_point: { lat: route.start_lat, lng: route.start_lng },
        metrics: {
          curvature: route.curvature,
          elevation: route.elevation,
          scenic: route.scenic,
          stops: route.stops,
          popularity: route.popularity
        }
      }));
      res.json(formattedRoutes);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/roads/predict", authenticateToken, (req, res) => {
    const { curvature, elevation, scenic, stops, popularity } = req.body;
    
    // Simulated ML Model for "Motorcycle Fun Score"
    // Weights based on typical rider preferences
    const w_curvature = 0.4;
    const w_elevation = 0.2;
    const w_scenic = 0.25;
    const w_stops = 0.05;
    const w_popularity = 0.1;

    const baseScore = (
      (curvature || 0) * w_curvature +
      (elevation || 0) * w_elevation +
      (scenic || 0) * w_scenic +
      (stops || 0) * w_stops +
      (popularity || 0) * w_popularity
    );

    // Add some random noise to simulate ML variance
    const noise = (Math.random() * 5) - 2.5; // -2.5 to +2.5
    const finalScore = Math.min(100, Math.max(0, baseScore + noise));

    res.json({ 
      predicted_score: parseFloat(finalScore.toFixed(1)),
      confidence: parseFloat((Math.random() * (0.99 - 0.85) + 0.85).toFixed(2)) // 85% to 99%
    });
  });

  app.get("/api/users/:id/recommendations", (req, res) => {
    try {
      const recommendations = db.prepare("SELECT * FROM recommendations WHERE user_id = ? ORDER BY created_at DESC").all(req.params.id);
      res.json(recommendations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/recommendations", authenticateToken, (req: any, res) => {
    const { user_id, type, item_id, item_name, description, image_url, item_description } = req.body;
    if (!user_id || !type || !item_id || !item_name) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    if (user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only recommend items for yourself" });
    }
    
    try {
      // Check if already recommended
      const existing = db.prepare("SELECT id FROM recommendations WHERE user_id = ? AND type = ? AND item_id = ?").get(user_id, type, item_id);
      if (existing) {
        return res.status(400).json({ error: "You have already recommended this item." });
      }

      const stmt = db.prepare("INSERT INTO recommendations (user_id, type, item_id, item_name, description, image_url, item_description) VALUES (?, ?, ?, ?, ?, ?, ?)");
      const result = stmt.run(user_id, type, item_id, item_name, description || null, image_url || null, item_description || null);
      
      const recommendation = db.prepare("SELECT * FROM recommendations WHERE id = ?").get(result.lastInsertRowid);
      res.status(201).json(recommendation);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/recommendations/:id", authenticateToken, (req: any, res) => {
    try {
      const rec = db.prepare("SELECT user_id FROM recommendations WHERE id = ?").get(req.params.id) as any;
      if (!rec) {
        return res.status(404).json({ error: "Recommendation not found" });
      }
      if (rec.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: You can only delete your own recommendations" });
      }
      db.prepare("DELETE FROM recommendations WHERE id = ?").run(req.params.id);
      res.json({ message: "Recommendation removed" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reviews Routes
  app.get("/api/reviews/:target_type/:target_id", (req, res) => {
    try {
      const reviews = db.prepare(`
        SELECT r.*, u.username, u.profile_picture_url
        FROM reviews r
        JOIN users u ON r.reviewer_user_id = u.id
        WHERE r.target_type = ? AND r.target_id = ?
        ORDER BY r.created_at DESC
      `).all(req.params.target_type, req.params.target_id);
      res.json(reviews);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/reviews", authenticateToken, (req: any, res) => {
    const { reviewer_user_id, target_type, target_id, rating, review_text } = req.body;
    if (!reviewer_user_id || !target_type || !target_id || !rating) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    if (reviewer_user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only post reviews for yourself" });
    }

    try {
      let isVerified = false;

      // Auto-verify route reviews if user completed the route
      if (target_type === 'route' || target_type === 'ride_route') {
        const progress = db.prepare("SELECT start_scanned, end_scanned FROM user_route_progress WHERE user_id = ? AND route_id = ?").get(reviewer_user_id, target_id) as any;
        if (progress && progress.start_scanned === 1 && progress.end_scanned === 1) {
          isVerified = true;
        }
      }

      const stmt = db.prepare(`
        INSERT INTO reviews (reviewer_user_id, target_type, target_id, rating, review_text, verification_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(reviewer_user_id, target_type, target_id, rating, review_text || null, isVerified ? 'verified' : 'unverified');
      
      // Update rating summary
      db.prepare(`
        INSERT INTO rating_summaries (target_type, target_id, average_rating, total_reviews, verified_reviews)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(target_type, target_id) DO UPDATE SET
        average_rating = ((average_rating * total_reviews) + ?) / (total_reviews + 1),
        total_reviews = total_reviews + 1,
        verified_reviews = verified_reviews + ?
      `).run(target_type, target_id, rating, isVerified ? 1 : 0, rating, isVerified ? 1 : 0);
      
      if (target_type === 'ecosystem') {
        const ecosystem = db.prepare("SELECT user_id FROM ecosystems WHERE id = ?").get(target_id) as any;
        if (ecosystem) {
          updateAmbassadorReputation(ecosystem.user_id);
        }
      }

      res.status(201).json({ review_id: result.lastInsertRowid });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/rating-summaries/:target_type/:target_id", (req, res) => {
    try {
      const summary = db.prepare("SELECT * FROM rating_summaries WHERE target_type = ? AND target_id = ?").get(req.params.target_type, req.params.target_id);
      res.json(summary || { average_rating: 0, total_reviews: 0, verified_reviews: 0 });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/reviews/:review_id/verify", authenticateToken, (req, res) => {
    const { verification_method, checkpoint_id } = req.body;
    try {
      const stmt = db.prepare(`
        INSERT INTO review_verifications (review_id, verification_method, checkpoint_id)
        VALUES (?, ?, ?)
      `);
      stmt.run(req.params.review_id, verification_method, checkpoint_id || null);
      
      db.prepare("UPDATE reviews SET verification_status = 'verified' WHERE review_id = ?").run(req.params.review_id);
      
      // Update verified count in summary
      const review = db.prepare("SELECT target_type, target_id FROM reviews WHERE review_id = ?").get(req.params.review_id) as any;
      if (review) {
        db.prepare("UPDATE rating_summaries SET verified_reviews = verified_reviews + 1 WHERE target_type = ? AND target_id = ?").run(review.target_type, review.target_id);
      }
      
      res.json({ message: "Review verified" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // QR & Verification Routes

  app.get("/api/qr/:target_type/:target_id", async (req, res) => {
    try {
      const data = JSON.stringify({ target_type: req.params.target_type, target_id: req.params.target_id });
      const qrCode = await QRCode.toDataURL(data);
      res.json({ qrCode });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/checkpoints", authenticateToken, checkAmbassador, (req, res) => {
    const { route_id, type, lat, lng } = req.body;
    try {
      // Fetch route to check distance
      const route = db.prepare("SELECT distance_km FROM discovered_routes WHERE id = ?").get(route_id) as any;
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      if (route.distance_km <= 400) {
        return res.status(400).json({ error: "Checkpoints can only be added to routes longer than 400km" });
      }

      const checkpoint_id = `cp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      db.prepare("INSERT INTO checkpoints (checkpoint_id, route_id, type, lat, lng) VALUES (?, ?, ?, ?, ?)").run(checkpoint_id, route_id, type, lat, lng);
      res.json({ success: true, checkpoint_id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Helper function to calculate distance between two coordinates in km
  function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  app.post("/api/checkpoints/scan", authenticateToken, (req: any, res) => {
    const { user_id, checkpoint_id, location_lat, location_lng } = req.body;
    
    if (user_id !== req.user.id.toString() && user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only scan checkpoints for yourself" });
    }

    try {
      const checkpoint = db.prepare("SELECT route_id, type, lat, lng FROM checkpoints WHERE checkpoint_id = ?").get(checkpoint_id) as any;
      if (!checkpoint) {
        return res.status(404).json({ error: "Checkpoint not found" });
      }

      const { route_id, type, lat, lng } = checkpoint;

      // Anti-fraud: Distance validation (e.g., within 1km)
      if (location_lat && location_lng && lat && lng) {
        const distance = getDistanceFromLatLonInKm(location_lat, location_lng, lat, lng);
        if (distance > 1) { // 1 km radius
          return res.status(403).json({ error: "You are too far from the checkpoint to verify." });
        }
      }

      // Initialize progress if not exists
      db.prepare("INSERT OR IGNORE INTO user_route_progress (user_id, route_id) VALUES (?, ?)").run(user_id, route_id);
      
      if (type === 'start') {
        db.prepare("UPDATE user_route_progress SET start_scanned = 1 WHERE user_id = ? AND route_id = ?").run(user_id, route_id);
      } else if (type === 'end') {
        db.prepare("UPDATE user_route_progress SET end_scanned = 1 WHERE user_id = ? AND route_id = ?").run(user_id, route_id);
      }
      
      // Check if route is now fully completed
      const progress = db.prepare("SELECT start_scanned, end_scanned FROM user_route_progress WHERE user_id = ? AND route_id = ?").get(user_id, route_id) as any;
      if (progress && progress.start_scanned === 1 && progress.end_scanned === 1) {
        // Auto-verify any existing unverified reviews for this route by this user
        const unverifiedReviews = db.prepare("SELECT review_id, rating FROM reviews WHERE reviewer_user_id = ? AND (target_type = 'route' OR target_type = 'ride_route') AND target_id = ? AND verification_status = 'unverified'").all(user_id, route_id) as any[];
        
        for (const rev of unverifiedReviews) {
          db.prepare("UPDATE reviews SET verification_status = 'verified' WHERE review_id = ?").run(rev.review_id);
          db.prepare("UPDATE rating_summaries SET verified_reviews = verified_reviews + 1 WHERE target_type = ? AND target_id = ?").run('route', route_id);
          db.prepare("UPDATE rating_summaries SET verified_reviews = verified_reviews + 1 WHERE target_type = ? AND target_id = ?").run('ride_route', route_id);
        }
      }

      res.json({ message: "Checkpoint scanned", route_id, type });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
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
    const { viewer_id } = req.query;
    console.log(`DEBUG: Fetching profile for username: ${req.params.username}`);
    const user = db.prepare(`
      SELECT id, username, fullName, location, bio, profile_picture_url, 
             cover_photo_url, type, role, plan, status, reputation, 
             created_at, motorcycle, businessName, businessType, 
             interests, services, referralCode 
      FROM users 
      WHERE LOWER(username) = LOWER(?)
    `).get(req.params.username) as any;
    if (!user) {
      console.log(`DEBUG: User not found in database: ${req.params.username}`);
      return res.status(404).json({ error: "User not found" });
    }
    console.log(`DEBUG: User found: ${user.id}, ${user.username}, status: ${user.status}`);

    const followers_count = (db.prepare("SELECT COUNT(*) as count FROM followers WHERE user_id = ?").get(user.id) as any).count;
    const following_count = (db.prepare("SELECT COUNT(*) as count FROM followers WHERE follower_id = ?").get(user.id) as any).count;
    const is_following = viewer_id ? (db.prepare("SELECT 1 FROM followers WHERE user_id = ? AND follower_id = ?").get(user.id, viewer_id) ? true : false) : false;
    const referral_count = (db.prepare("SELECT COUNT(*) as count FROM users WHERE referred_by = ?").get(user.id) as any).count;

    const is_owner = viewer_id && parseInt(viewer_id as string) === user.id;
    const can_view_locked = is_owner || is_following;

    const posts = db.prepare(`
      SELECT p.*, 
             m.make, m.model, m.year,
             ev.title as shared_event_title, ev.date as shared_event_date, ev.image_url as shared_event_image_url, ev.location as shared_event_location,
             p.respect_count as likes_count,
             p.comment_count,
             ${viewer_id ? `(SELECT COUNT(*) FROM post_likes WHERE post_id = p.id AND user_id = ${viewer_id}) > 0` : '0'} as has_liked,
             (SELECT COUNT(*) FROM user_pinned_posts WHERE post_id = p.id AND user_id = ${user.id}) > 0 as is_pinned_by_owner,
             ${viewer_id ? `(SELECT COUNT(*) FROM user_pinned_posts WHERE post_id = p.id AND user_id = ${viewer_id}) > 0` : '0'} as is_pinned
      FROM posts p
      LEFT JOIN motorcycles m ON p.tagged_motorcycle_id = m.id
      LEFT JOIN events ev ON CAST(p.shared_event_id AS INTEGER) = ev.id
      WHERE p.user_id = ? AND (p.privacy_level = 'public' OR ? = 1)
      ORDER BY is_pinned_by_owner DESC, p.created_at DESC
    `).all(user.id, can_view_locked ? 1 : 0);

    const recommendations = db.prepare(`
      SELECT * FROM recommendations 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `).all(user.id);

    const ambassador = db.prepare(`
      SELECT * FROM ambassadors WHERE user_id = ?
    `).get(user.id) as any;

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

      const { password: _, ...safeUser } = user;
      res.json({ ...safeUser, profile: rider, garage, posts, events: createdEvents, rsvpd_events: rsvpdEvents, recommendations, followers_count, following_count, is_following, ambassador, referral_count });
    } else {
      const ecosystem = db.prepare("SELECT * FROM ecosystems WHERE user_id = ?").get(user.id) as any;
      const { password: __, ...safeUser } = user;
      
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

      res.json({ ...safeUser, profile: ecosystem, posts, events: hostedEvents, rsvpd_events: rsvpdEvents, recommendations, followers_count, following_count, is_following, ambassador, referral_count });
    }
  });

  app.get("/api/posts", (req, res) => {
    const { user_id } = req.query;
    
    try {
      const posts = db.prepare(`
        SELECT p.*, u.username, u.type, u.profile_picture_url,
               r.name as rider_name, e.company_name, e.service_category,
               m.make, m.model, m.year,
               ev.title as shared_event_title, ev.date as shared_event_date, ev.image_url as shared_event_image_url, ev.location as shared_event_location,
               p.respect_count as likes_count,
               p.comment_count,
               ${user_id ? `(SELECT COUNT(*) FROM post_likes WHERE post_id = p.id AND user_id = ${user_id}) > 0` : '0'} as has_liked,
               ${user_id ? `(SELECT COUNT(*) FROM user_pinned_posts WHERE post_id = p.id AND user_id = ${user_id}) > 0` : '0'} as is_pinned
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN riders r ON u.id = r.user_id
        LEFT JOIN ecosystems e ON u.id = e.user_id
        LEFT JOIN motorcycles m ON p.tagged_motorcycle_id = m.id
        LEFT JOIN events ev ON CAST(p.shared_event_id AS INTEGER) = ev.id
        WHERE p.privacy_level = 'public' 
           OR p.user_id = ? 
           OR (p.privacy_level = 'followers' AND EXISTS (SELECT 1 FROM followers WHERE user_id = p.user_id AND follower_id = ?))
        ORDER BY is_pinned DESC, p.created_at DESC
      `).all(user_id || -1, user_id || -1);
      res.json(posts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/posts/:id/pin", authenticateToken, (req: any, res) => {
    const postId = req.params.id;
    const userId = req.user.id;

    try {
      // Check if post exists
      const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(postId) as any;
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      if (post.user_id !== userId) {
        return res.status(403).json({ error: "You can only pin your own posts" });
      }

      const existingPin = db.prepare("SELECT * FROM user_pinned_posts WHERE user_id = ? AND post_id = ?").get(userId, postId);

      db.transaction(() => {
        // Always clear existing pin for this user (since only one can be pinned)
        db.prepare("DELETE FROM user_pinned_posts WHERE user_id = ?").run(userId);
        
        // If it wasn't this specific post, pin it now
        if (!existingPin) {
          db.prepare("INSERT INTO user_pinned_posts (user_id, post_id) VALUES (?, ?)").run(userId, postId);
        }
      })();

      res.json({ success: true, is_pinned: !existingPin });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/posts/:id/like", authenticateToken, (req: any, res) => {
    const { user_id } = req.body;
    const post_id = req.params.id;
    
    if (!user_id) return res.status(400).json({ error: "User ID is required" });
    
    if (Number(user_id) !== Number(req.user.id) && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only like posts for yourself" });
    }

    try {
      const existing = db.prepare("SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?").get(post_id, user_id);
      
      db.transaction(() => {
        if (existing) {
          db.prepare("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?").run(post_id, user_id);
          db.prepare("UPDATE posts SET respect_count = MAX(0, respect_count - 1) WHERE id = ?").run(post_id);
        } else {
          db.prepare("INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)").run(post_id, user_id);
          db.prepare("UPDATE posts SET respect_count = respect_count + 1 WHERE id = ?").run(post_id);
          
          // Check for badges
          const post = db.prepare("SELECT user_id FROM posts WHERE id = ?").get(post_id) as any;
          if (post) {
            const totalLikes = db.prepare("SELECT COUNT(*) as count FROM post_likes pl JOIN posts p ON pl.post_id = p.id WHERE p.user_id = ?").get(post.user_id) as any;
            
            if (totalLikes.count === 100) {
              const badge = db.prepare("SELECT badge_id FROM badges WHERE name = 'Community Builder'").get() as any;
              if (badge) {
                db.prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)").run(post.user_id, badge.badge_id);
              }
            } else if (totalLikes.count === 1000) {
              const badge = db.prepare("SELECT badge_id FROM badges WHERE name = 'Influencer Rider'").get() as any;
              if (badge) {
                db.prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)").run(post.user_id, badge.badge_id);
              }
            }

            // Create notification
            if (post.user_id !== user_id) {
              const liker = db.prepare("SELECT username FROM users WHERE id = ?").get(user_id) as any;
              db.prepare("INSERT INTO notifications (user_id, type, content, link) VALUES (?, ?, ?, ?)").run(
                post.user_id, 'like', `${liker.username} respected your post.`, `/profile/${liker.username}`
              );
            }
          }
        }
      })();
      
      res.json({ success: true, action: existing ? 'unliked' : 'liked' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/posts/:id/comments", (req, res) => {
    const post_id = req.params.id;
    try {
      const comments = db.prepare(`
        SELECT c.*, u.username, u.profile_picture_url
        FROM post_comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ?
        ORDER BY c.created_at ASC
      `).all(post_id);
      res.json(comments);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/posts/:id/comments", authenticateToken, (req: any, res) => {
    const post_id = req.params.id;
    const { content } = req.body;
    const user_id = req.user.id;

    if (!content) return res.status(400).json({ error: "Comment content is required" });

    try {
      db.transaction(() => {
        db.prepare("INSERT INTO post_comments (post_id, user_id, content) VALUES (?, ?, ?)").run(post_id, user_id, content);
        db.prepare("UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?").run(post_id);
        
        // Notification
        const post = db.prepare("SELECT user_id FROM posts WHERE id = ?").get(post_id) as any;
        if (post && post.user_id !== user_id) {
          const commenter = db.prepare("SELECT username FROM users WHERE id = ?").get(user_id) as any;
          db.prepare("INSERT INTO notifications (user_id, type, content, link) VALUES (?, ?, ?, ?)").run(
            post.user_id, 'comment', `${commenter.username} commented on your post.`, `/profile/${commenter.username}`
          );
        }
      })();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/users/:id/follow", authenticateToken, (req: any, res) => {
    const { follower_id } = req.body;
    const user_id = req.params.id;
    
    if (!follower_id) return res.status(400).json({ error: "Follower ID is required" });
    
    if (follower_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only follow users for yourself" });
    }

    try {
      const existing = db.prepare("SELECT id FROM followers WHERE user_id = ? AND follower_id = ?").get(user_id, follower_id);
      
      if (existing) {
        db.prepare("DELETE FROM followers WHERE user_id = ? AND follower_id = ?").run(user_id, follower_id);
        res.json({ success: true, action: 'unfollowed' });
      } else {
        db.prepare("INSERT INTO followers (user_id, follower_id) VALUES (?, ?)").run(user_id, follower_id);
        
        // Create notification
        const follower = db.prepare("SELECT username FROM users WHERE id = ?").get(follower_id) as any;
        db.prepare("INSERT INTO notifications (user_id, type, content, link) VALUES (?, ?, ?, ?)").run(
          user_id, 'follow', `${follower.username} started following you.`, `/profile/${follower.username}`
        );
        
        res.json({ success: true, action: 'followed' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Event Photo Management
  app.post("/api/events/:id/photos", authenticateToken, upload.single("image"), (req: any, res) => {
    const eventId = req.params.id;
    const userId = req.body.userId;
    const imageUrl = `/uploads/${(req as any).file?.filename}`;
    
    if (userId !== req.user.id.toString() && userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only upload photos for yourself" });
    }

    db.prepare("INSERT INTO event_photos (event_id, user_id, image_url) VALUES (?, ?, ?)")
      .run(eventId, userId, imageUrl);
    
    res.json({ success: true });
  });

  app.get("/api/events/:id/photos", (req, res) => {
    const photos = db.prepare("SELECT * FROM event_photos WHERE event_id = ? AND status = 'approved'").all(req.params.id);
    res.json(photos);
  });

  app.get("/api/events/:id/pending-photos", authenticateToken, (req: any, res) => {
    try {
      const event = db.prepare("SELECT user_id FROM events WHERE id = ?").get(req.params.id) as any;
      if (!event) return res.status(404).json({ error: "Event not found" });
      
      const isHostOrAdmin = event.user_id === req.user.id || req.user.role === 'admin' || req.user.role === 'moderator';

      let photos;
      if (isHostOrAdmin) {
        photos = db.prepare("SELECT * FROM event_photos WHERE event_id = ? AND status = 'pending'").all(req.params.id);
      } else {
        // Regular user only sees their own pending photos
        photos = db.prepare("SELECT * FROM event_photos WHERE event_id = ? AND status = 'pending' AND user_id = ?").all(req.params.id, req.user.id);
      }
      res.json(photos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/events/photos/:photoId/status", authenticateToken, (req: any, res) => {
    const { status } = req.body;
    
    try {
      const photo = db.prepare("SELECT event_id FROM event_photos WHERE id = ?").get(req.params.photoId) as any;
      if (!photo) return res.status(404).json({ error: "Photo not found" });
      
      const event = db.prepare("SELECT user_id FROM events WHERE id = ?").get(photo.event_id) as any;
      if (!event) return res.status(404).json({ error: "Event not found" });
      
      if (event.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: Only the event host can manage photo status" });
      }

      db.prepare("UPDATE event_photos SET status = ? WHERE id = ?").run(status, req.params.photoId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/events/photos/bulk-status", authenticateToken, (req: any, res) => {
    const { photoIds, status } = req.body;
    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return res.status(400).json({ error: "Invalid photoIds" });
    }
    try {
      const placeholders = photoIds.map(() => '?').join(',');
      const photos = db.prepare(`SELECT event_id FROM event_photos WHERE id IN (${placeholders})`).all(...photoIds) as any[];
      
      if (photos.length === 0) return res.status(404).json({ error: "Photos not found" });

      const eventIds = [...new Set(photos.map(p => p.event_id))];
      const events = db.prepare(`SELECT id, user_id FROM events WHERE id IN (${eventIds.map(() => '?').join(',')})`).all(...eventIds) as any[];
      
      const isAuthorized = req.user.role === 'admin' || req.user.role === 'moderator' || events.every(e => e.user_id === req.user.id);
      
      if (!isAuthorized) {
        return res.status(403).json({ error: "Forbidden" });
      }

      db.prepare(`UPDATE event_photos SET status = ? WHERE id IN (${placeholders})`).run(status, ...photoIds);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/events/photos/:photoId", authenticateToken, (req: any, res) => {
    try {
      const photo = db.prepare("SELECT event_id, user_id FROM event_photos WHERE id = ?").get(req.params.photoId) as any;
      if (!photo) return res.status(404).json({ error: "Photo not found" });
      
      const event = db.prepare("SELECT user_id FROM events WHERE id = ?").get(photo.event_id) as any;
      if (!event) return res.status(404).json({ error: "Event not found" });
      
      if (event.user_id !== req.user.id && photo.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: You don't have permission to delete this photo" });
      }

      db.prepare("DELETE FROM event_photos WHERE id = ?").run(req.params.photoId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/pending-event-photos", authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const photos = db.prepare(`
        SELECT ep.*, e.title as event_title, u.username
        FROM event_photos ep
        JOIN events e ON ep.event_id = e.id
        JOIN users u ON ep.user_id = u.id
        WHERE ep.status = 'pending'
        ORDER BY ep.created_at DESC
      `).all();
      res.json(photos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events", (req, res) => {
    const { username, category, location } = req.query;
    let userId = null;
    if (username) {
      const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as any;
      if (user) userId = user.id;
    }

    let query = `
      SELECT ev.*, u.username, u.profile_picture_url,
             e.company_name, e.service_category,
             b.name as participation_badge_name,
             b.icon as participation_badge_icon,
             ps.name as stamp_name,
             ps.icon as stamp_icon,
             (SELECT COUNT(*) FROM event_rsvps WHERE event_id = ev.id) as rsvp_count,
             ${userId ? `(SELECT COUNT(*) FROM event_rsvps WHERE event_id = ev.id AND user_id = ${userId}) > 0` : '0'} as has_rsvpd
      FROM events ev
      JOIN users u ON ev.user_id = u.id
      LEFT JOIN ecosystems e ON u.id = e.user_id
      LEFT JOIN badges b ON ev.participation_badge_id = b.badge_id
      LEFT JOIN passport_stamps ps ON ev.participation_stamp_id = ps.id
      WHERE ev.is_approved = 1
    `;
    const params: any[] = [];

    if (category && category !== 'all') {
      query += ` AND ev.category = ?`;
      params.push(category);
    }
    if (location) {
      query += ` AND ev.location LIKE ?`;
      params.push(`%${location}%`);
    }

    query += ` ORDER BY ev.is_promoted DESC, ev.date ASC`;

    const events = db.prepare(query).all(...params);
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
               b.name as participation_badge_name, b.icon as participation_badge_icon,
               ps.name as stamp_name, ps.icon as stamp_icon, ps.description as stamp_description,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = ev.id) as rsvp_count,
               ${userId ? `(SELECT COUNT(*) FROM event_rsvps WHERE event_id = ev.id AND user_id = ${userId}) > 0` : '0'} as has_rsvpd
        FROM events ev
        JOIN users u ON ev.user_id = u.id
        LEFT JOIN ecosystems e ON u.id = e.user_id
        LEFT JOIN badges b ON ev.participation_badge_id = b.badge_id
        LEFT JOIN passport_stamps ps ON ev.participation_stamp_id = ps.id
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

  app.post("/api/events", authenticateToken, checkFeatureAccess('create_event'), (req: any, res) => {
    const { username, title, description, date, time, location, image_url, participation_badge_id, category, participation_stamp_id } = req.body;
    
    if (username !== req.user.username && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only create events for yourself" });
    }

    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    try {
      const ambassador = db.prepare("SELECT 1 FROM ambassadors WHERE user_id = ? AND is_active = 1").get(user.id);
      const isApproved = (user.role === 'admin' || user.role === 'moderator' || ambassador) ? 1 : 0;
      insertEvent.run(user.id, title, description, date, time, location, image_url || `https://picsum.photos/seed/${Math.random()}/800/600`, isApproved, participation_badge_id || null, category || 'other', participation_stamp_id || null);
      
      updateAmbassadorReputation(user.id);

      res.json({ success: true, approved: isApproved });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/events/:id", authenticateToken, (req: any, res) => {
    const { title, description, date, time, location, image_url, participation_badge_id, category, participation_stamp_id } = req.body;
    const { id } = req.params;

    try {
      const event = db.prepare("SELECT user_id FROM events WHERE id = ?").get(id) as any;
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (event.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: You can only update your own events" });
      }

      db.prepare(`
        UPDATE events 
        SET title = ?, description = ?, date = ?, time = ?, location = ?, image_url = ?, participation_badge_id = ?, category = ?, participation_stamp_id = ?
        WHERE id = ?
      `).run(title, description, date, time, location, image_url, participation_badge_id || null, category || 'other', participation_stamp_id || null, id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events/:id/attendees", authenticateToken, (req: any, res) => {
    const { id } = req.params;
    try {
      const event = db.prepare("SELECT user_id FROM events WHERE id = ?").get(id) as any;
      if (!event) return res.status(404).json({ error: "Event not found" });
      
      if (event.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: Only event host can view attendees" });
      }

      const attendees = db.prepare(`
        SELECT u.id, u.username, u.profile_picture_url, er.checked_in
        FROM event_rsvps er
        JOIN users u ON er.user_id = u.id
        WHERE er.event_id = ?
      `).all(id);
      res.json(attendees);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch attendees" });
    }
  });

  app.post("/api/events/:id/checkin", authenticateToken, (req: any, res) => {
    const { id } = req.params;
    const { userId, checkedIn } = req.body;
    try {
      const event = db.prepare("SELECT user_id FROM events WHERE id = ?").get(id) as any;
      if (!event) return res.status(404).json({ error: "Event not found" });
      
      if (event.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: Only event host can check in attendees" });
      }

      db.prepare(`
        UPDATE event_rsvps 
        SET checked_in = ? 
        WHERE event_id = ? AND user_id = ?
      `).run(checkedIn ? 1 : 0, id, userId);

      // Award participation stamp if configured
      if (checkedIn) {
        const eventData = db.prepare("SELECT participation_stamp_id, participation_badge_id FROM events WHERE id = ?").get(id) as any;
        
        // Award stamp
        if (eventData && eventData.participation_stamp_id) {
          // Check if user already has this stamp
          const existingStamp = db.prepare("SELECT 1 FROM user_passport_stamps WHERE user_id = ? AND stamp_id = ?").get(userId, eventData.participation_stamp_id);
          if (!existingStamp) {
            db.prepare("INSERT INTO user_passport_stamps (user_id, stamp_id, ambassador_id, creator_type, creator_id) VALUES (?, ?, ?, ?, ?)")
              .run(userId, eventData.participation_stamp_id, 0, 'event_host', req.user.id);
            
            // Create notification for the user
            const stamp = db.prepare("SELECT name FROM passport_stamps WHERE id = ?").get(eventData.participation_stamp_id) as any;
            if (stamp) {
              db.prepare("INSERT INTO notifications (user_id, type, content) VALUES (?, ?, ?)")
                .run(userId, 'stamp_awarded', `You've earned the "${stamp.name}" stamp for participating in an event!`);
            }
          }
        }

        // Award badge
        if (eventData && eventData.participation_badge_id) {
          // Check if user already has this badge
          const existingBadge = db.prepare("SELECT 1 FROM user_badges WHERE user_id = ? AND badge_id = ?").get(userId, eventData.participation_badge_id);
          if (!existingBadge) {
            db.prepare("INSERT INTO user_badges (user_id, badge_id, awarded_by) VALUES (?, ?, ?)")
              .run(userId, eventData.participation_badge_id, req.user.id);
            
            // Create notification for the user
            const badge = db.prepare("SELECT name FROM badges WHERE badge_id = ?").get(eventData.participation_badge_id) as any;
            if (badge) {
              db.prepare("INSERT INTO notifications (user_id, type, content) VALUES (?, ?, ?)")
                .run(userId, 'badge_awarded', `You've earned the "${badge.name}" badge for participating in an event!`);
            }
          }
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update check-in status" });
    }
  });

  app.post("/api/events/:id/rsvp", authenticateToken, (req: any, res) => {
    const { id } = req.params;
    const { username } = req.body;
    const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as any;
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    if (user.id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only RSVP for yourself" });
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

  app.put("/api/admin/submissions/:id/approve", authenticateToken, checkAdmin, (req, res) => {
    const { approved } = req.body;
    try {
      db.prepare("UPDATE submissions SET approved = ? WHERE id = ?").run(approved ? 1 : 0, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/photo-contest-settings", authenticateToken, (req, res) => {
    try {
      const enabled = db.prepare("SELECT value FROM settings WHERE key = 'photo_contest_enabled'").get() as any;
      const allowedTypes = db.prepare("SELECT value FROM settings WHERE key = 'photo_contest_allowed_types'").get() as any;
      
      let parsedAllowedTypes = ['premium'];
      if (allowedTypes && allowedTypes.value) {
        try {
          parsedAllowedTypes = JSON.parse(allowedTypes.value);
        } catch (e) {
          console.error("Error parsing photo_contest_allowed_types:", e);
        }
      }

      res.json({
        enabled: enabled ? enabled.value === 'true' : false,
        allowedTypes: parsedAllowedTypes
      });
    } catch (error: any) {
      console.error("Error fetching photo contest settings:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/photo-contest-settings", authenticateToken, checkAdmin, (req, res) => {
    const { enabled, allowedTypes } = req.body;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('photo_contest_enabled', ?)").run(enabled.toString());
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('photo_contest_allowed_types', ?)").run(JSON.stringify(allowedTypes));
    res.json({ success: true });
  });

  app.post("/api/events/photos/:photoId/promote", authenticateToken, checkFeatureAccess('promote_contest'), (req: any, res) => {
    const photoId = req.params.photoId;
    const photo = db.prepare("SELECT * FROM event_photos WHERE id = ?").get(photoId) as any;
    if (!photo) return res.status(404).json({ error: "Photo not found" });

    // Check if user is owner or admin
    if (photo.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Check if contest promotion is enabled
    const enabled = db.prepare("SELECT value FROM settings WHERE key = 'photo_contest_enabled'").get() as any;
    if (!enabled || enabled.value !== 'true') return res.status(403).json({ error: "Contest promotion is disabled" });

    // Check if user type is allowed
    const user = db.prepare("SELECT type FROM users WHERE id = ?").get(req.user.id) as any;
    const allowedTypes = db.prepare("SELECT value FROM settings WHERE key = 'photo_contest_allowed_types'").get() as any;
    const allowed = allowedTypes ? JSON.parse(allowedTypes.value) : ['premium'];
    if (!allowed.includes(user.type)) return res.status(403).json({ error: "Account type not allowed" });

    // Add to submissions
    const contest = db.prepare("SELECT id FROM contests WHERE status = 'active' ORDER BY start_date DESC LIMIT 1").get() as any;
    if (!contest) return res.status(404).json({ error: "No active contest found" });

    db.prepare("INSERT INTO submissions (contest_id, user_id, photo_url) VALUES (?, ?, ?)")
      .run(contest.id, photo.user_id, photo.image_url);
    
    res.json({ success: true });
  });

  app.get("/api/admin/submissions", authenticateToken, checkAdmin, (req, res) => {
    try {
      const submissions = db.prepare(`
        SELECT s.*, u.username, c.title as contest_title,
               (SELECT COUNT(*) FROM votes WHERE submission_id = s.id) as vote_count
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

  // Admin Contest Routes
  app.get("/api/admin/contests", authenticateToken, checkAdmin, (req, res) => {
    try {
      const contests = db.prepare(`
        SELECT c.*, 
               b.name as prize_badge_name,
               b.icon as prize_badge_icon,
               (SELECT COUNT(*) FROM submissions WHERE contest_id = c.id) as submission_count,
               (SELECT u.username FROM submissions s JOIN users u ON s.user_id = u.id WHERE s.id = c.winner_submission_id) as winner_username,
               (
                 SELECT u.username 
                 FROM submissions s 
                 JOIN users u ON s.user_id = u.id 
                 WHERE s.contest_id = c.id AND s.approved = 1
                 ORDER BY (SELECT COUNT(*) FROM votes WHERE submission_id = s.id) DESC 
                 LIMIT 1
               ) as leader_username,
               (
                 SELECT COUNT(*) 
                 FROM votes 
                 WHERE submission_id = (
                   SELECT s.id 
                   FROM submissions s 
                   WHERE s.contest_id = c.id AND s.approved = 1
                   ORDER BY (SELECT COUNT(*) FROM votes WHERE submission_id = s.id) DESC 
                   LIMIT 1
                 )
               ) as leader_votes
        FROM contests c
        LEFT JOIN badges b ON c.prize_badge_id = b.badge_id
        ORDER BY c.start_date DESC
      `).all();
      res.json(contests);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/contests", authenticateToken, checkAdmin, (req, res) => {
    const { title, description, start_date, voting_start_date, end_date, status, prize_description, prize_badge_id } = req.body;
    try {
      const stmt = db.prepare(`
        INSERT INTO contests (title, description, start_date, voting_start_date, end_date, status, prize_description, prize_badge_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(title, description, start_date, voting_start_date || null, end_date, status || 'draft', prize_description, prize_badge_id || null);
      logAdminAction((req as any).user.id, 'CREATE_CONTEST', 'contest', result.lastInsertRowid.toString());
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/contests/:id", authenticateToken, checkAdmin, (req, res) => {
    const { id } = req.params;
    const { title, description, start_date, voting_start_date, end_date, status, prize_description, prize_badge_id } = req.body;
    try {
      const stmt = db.prepare(`
        UPDATE contests 
        SET title = ?, description = ?, start_date = ?, voting_start_date = ?, end_date = ?, status = ?, prize_description = ?, prize_badge_id = ?
        WHERE id = ?
      `);
      stmt.run(title, description, start_date, voting_start_date || null, end_date, status, prize_description, prize_badge_id || null, id);
      logAdminAction((req as any).user.id, 'UPDATE_CONTEST', 'contest', id);
      res.json({ message: "Contest updated" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/contests/:id", authenticateToken, checkAdmin, (req, res) => {
    const { id } = req.params;
    try {
      // Check if there are submissions
      const submissions = db.prepare("SELECT id FROM submissions WHERE contest_id = ?").get(id);
      if (submissions) {
        return res.status(400).json({ error: "Cannot delete contest with submissions" });
      }
      db.prepare("DELETE FROM contests WHERE id = ?").run(id);
      logAdminAction((req as any).user.id, 'DELETE_CONTEST', 'contest', id);
      res.json({ message: "Contest deleted" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/contests/:id/pick-winner", authenticateToken, checkAdmin, (req, res) => {
    const { id } = req.params;
    try {
      // Find top submission
      const topSubmission = db.prepare(`
        SELECT s.*, (SELECT COUNT(*) FROM votes WHERE submission_id = s.id) as vote_count
        FROM submissions s
        WHERE s.contest_id = ? AND s.approved = 1
        ORDER BY vote_count DESC LIMIT 1
      `).get(id) as any;

      if (!topSubmission) {
        return res.status(404).json({ error: "No approved submissions found for this contest" });
      }

      // Update contest winner
      db.prepare("UPDATE contests SET winner_submission_id = ?, status = 'completed' WHERE id = ?").run(topSubmission.id, id);

      // Award reputation points (e.g. 500)
      db.prepare("UPDATE users SET reputation = reputation + 500 WHERE id = ?").run(topSubmission.user_id);

      // Add notification for the winner
      db.prepare(`
        INSERT INTO notifications (user_id, type, title, message, related_id)
        VALUES (?, 'contest_winner', 'Contest Winner!', 'Congratulations! Your submission won the contest.', ?)
      `).run(topSubmission.user_id, id);

      logAdminAction((req as any).user.id, 'PICK_CONTEST_WINNER', 'contest', id, `Winner: ${topSubmission.user_id}`);
      res.json({ message: "Winner picked and prize awarded", winner_id: topSubmission.user_id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/events", authenticateToken, checkAdmin, (req, res) => {
    try {
      const events = db.prepare(`
        SELECT ev.*, u.username, u.profile_picture_url,
               e.company_name, e.service_category,
               b.name as participation_badge_name,
               b.icon as participation_badge_icon,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = ev.id) as rsvp_count
        FROM events ev
        JOIN users u ON ev.user_id = u.id
        LEFT JOIN ecosystems e ON u.id = e.user_id
        LEFT JOIN badges b ON ev.participation_badge_id = b.badge_id
        ORDER BY ev.is_approved ASC, ev.date ASC
      `).all();
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/events/:id/approve", authenticateToken, checkAdmin, (req, res) => {
    const { is_approved } = req.body;
    try {
      db.prepare("UPDATE events SET is_approved = ? WHERE id = ?").run(is_approved ? 1 : 0, req.params.id);
      logAdminAction((req as any).user.id, is_approved ? 'APPROVE_EVENT' : 'UNAPPROVE_EVENT', 'event', req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/events/:id/promote", authenticateToken, checkAdmin, (req, res) => {
    const { is_promoted } = req.body;
    try {
      db.prepare("UPDATE events SET is_promoted = ? WHERE id = ?").run(is_promoted ? 1 : 0, req.params.id);
      logAdminAction((req as any).user.id, is_promoted ? 'PROMOTE_EVENT' : 'UNPROMOTE_EVENT', 'event', req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/motorcycles", authenticateToken, upload.single('photo'), (req: any, res) => {
    const { username, make, model, year, last_service, last_km, last_shop, image_url } = req.body;
    const photo_url = req.file ? `/uploads/${req.file.filename}` : (image_url || null);
    
    if (username !== req.user.username && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only add motorcycles for yourself" });
    }

    const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as any;
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    try {
      const motoResult = insertMoto.run(user.id, make, model, parseInt(year), photo_url);
      const motoId = motoResult.lastInsertRowid;

      if (last_service || last_km || last_shop) {
        insertMaintenance.run(motoId, last_service || "Initial Entry", parseInt(last_km) || null, last_shop);
      }
      
      res.json({ success: true, id: motoId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to add motorcycle" });
    }
  });

  app.put("/api/motorcycles/:id", authenticateToken, upload.single('photo'), (req: any, res) => {
    const { id } = req.params;
    const { make, model, year, image_url } = req.body;
    const photo_url = req.file ? `/uploads/${req.file.filename}` : (image_url || null);

    try {
      const moto = db.prepare("SELECT rider_id FROM motorcycles WHERE id = ?").get(id) as any;
      
      if (!moto) {
        return res.status(404).json({ error: "Motorcycle not found" });
      }

      if (moto.rider_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: You can only edit your own motorcycles" });
      }

      db.prepare("UPDATE motorcycles SET make = ?, model = ?, year = ?, image_url = ? WHERE id = ?").run(make, model, parseInt(year), photo_url, id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update motorcycle" });
    }
  });

  app.delete("/api/motorcycles/:id", authenticateToken, (req: any, res) => {
    const { id } = req.params;

    try {
      const moto = db.prepare("SELECT rider_id FROM motorcycles WHERE id = ?").get(id) as any;
      
      if (!moto) {
        return res.status(404).json({ error: "Motorcycle not found" });
      }

      if (moto.rider_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: You can only delete your own motorcycles" });
      }

      // Delete associated maintenance logs first
      db.prepare("DELETE FROM maintenance_logs WHERE motorcycle_id = ?").run(id);
      db.prepare("DELETE FROM motorcycles WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete motorcycle" });
    }
  });

  app.post("/api/motorcycles/:id/maintenance", authenticateToken, (req: any, res) => {
    const { id } = req.params;
    const { service, km, shop } = req.body;

    try {
      const moto = db.prepare("SELECT rider_id FROM motorcycles WHERE id = ?").get(id) as any;
      if (!moto) {
        return res.status(404).json({ error: "Motorcycle not found" });
      }
      if (moto.rider_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: You can only add maintenance logs for your own motorcycles" });
      }

      insertMaintenance.run(parseInt(id), service, parseInt(km) || null, shop);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to add maintenance log" });
    }
  });

  app.post("/api/posts", authenticateToken, upload.single('image'), (req, res) => {
    const { username, content, tagged_motorcycle_id, privacy_level, shared_event_id } = req.body;
    const image_url = (req as any).file ? `/uploads/${(req as any).file.filename}` : req.body.image_url;
    
    // Ensure the authenticated user matches the username they are trying to post as
    if ((req as any).user.username !== username && (req as any).user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden: You can only post as yourself" });
    }

    const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as any;
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (tagged_motorcycle_id) {
      const moto = db.prepare("SELECT rider_id FROM motorcycles WHERE id = ?").get(tagged_motorcycle_id) as any;
      if (!moto || (moto.rider_id !== user.id && (req as any).user.role !== 'admin')) {
        return res.status(403).json({ error: "Forbidden: You can only tag your own motorcycles" });
      }
    }

    try {
      insertPost.run(
        user.id, 
        content || "", 
        image_url || null, 
        tagged_motorcycle_id || null, 
        privacy_level || 'public', 
        shared_event_id ? Number(shared_event_id) : null
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/profile/:username", authenticateToken, (req: any, res) => {
    const { username } = req.params;
    const { profile_picture_url, cover_photo_url, new_username, ...profileData } = req.body;

    const interestsStr = Array.isArray(profileData.interests) ? profileData.interests.join(',') : profileData.interests;
    const servicesStr = Array.isArray(profileData.services) ? profileData.services.join(',') : profileData.services;
    
    if (username !== req.user.username && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only update your own profile" });
    }

    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (new_username && new_username !== username) {
      const existingUser = db.prepare("SELECT id FROM users WHERE username = ?").get(new_username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already taken" });
      }
    }

    try {
      db.transaction(() => {
        if (profile_picture_url) {
          db.prepare("UPDATE users SET profile_picture_url = ? WHERE id = ?").run(profile_picture_url, user.id);
        }

        if (cover_photo_url) {
          db.prepare("UPDATE users SET cover_photo_url = ? WHERE id = ?").run(cover_photo_url, user.id);
        }

        if (new_username && new_username !== username) {
          db.prepare("UPDATE users SET username = ? WHERE id = ?").run(new_username, user.id);
        }

        if (user.type === "rider") {
          db.prepare("UPDATE riders SET name = ?, age = ?, city = ? WHERE user_id = ?")
            .run(profileData.name || null, profileData.age || null, profileData.city || null, user.id);
          db.prepare("UPDATE users SET fullName = ?, location = ?, bio = ?, motorcycle = ?, interests = ? WHERE id = ?")
            .run(profileData.name || null, profileData.city || null, profileData.bio || null, profileData.motorcycle || null, interestsStr || null, user.id);
        } else {
          db.prepare("UPDATE ecosystems SET company_name = ?, full_address = ?, service_category = ?, details = ?, phone = ?, website = ?, chapter_label = ? WHERE user_id = ?")
            .run(
              profileData.company_name || null, 
              profileData.full_address || null, 
              profileData.service_category || null, 
              profileData.details || null, 
              profileData.phone || null, 
              profileData.website || null, 
              profileData.chapter_label || 'Chapter',
              user.id
            );
          db.prepare("UPDATE users SET businessName = ?, location = ?, businessType = ?, bio = ?, services = ? WHERE id = ?")
            .run(
              profileData.company_name || null, 
              profileData.full_address || null, 
              profileData.service_category || null, 
              profileData.details || null, 
              servicesStr || null, 
              user.id
            );
        }
      })();
      res.json({ success: true, username: new_username || username });
    } catch (error: any) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // MotoClubs Endpoints
  app.get("/api/clubs", (req, res) => {
    try {
      const clubs = db.prepare(`
        SELECT u.id as club_id, u.username, u.profile_picture_url as logo_url, e.company_name as name, e.details as description, u.created_at as founded_date, u.plan,
               (SELECT COUNT(*) FROM club_memberships WHERE club_id = u.id AND status = 'approved') as member_count
        FROM users u
        JOIN ecosystems e ON u.id = e.user_id
        WHERE u.type = 'ecosystem' AND e.service_category = 'club'
      `).all();
      res.json(clubs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/stats/counts", (req, res) => {
    try {
      const riderCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE type = 'rider'").get() as any;
      const ecosystemCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE type = 'ecosystem'").get() as any;
      res.json({
        riders: riderCount.count || 0,
        ecosystems: ecosystemCount.count || 0
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/clubs/my", authenticateToken, (req: any, res) => {
    const userId = req.user.id;
    try {
      // Clubs the user owns (either as the club account itself or as the owner/ambassador)
      const ownedClubs = db.prepare(`
        SELECT u.id as club_id, u.username, u.profile_picture_url as logo_url, e.company_name as name, e.details as description, u.created_at as founded_date, u.plan, e.chapter_label
        FROM users u
        JOIN ecosystems e ON u.id = e.user_id
        WHERE (u.id = ? OR e.owner_id = ?) AND e.service_category = 'club'
      `).all(userId, userId);

      // Clubs the user is a member of
      const memberships = db.prepare(`
        SELECT cm.*, u.username, u.profile_picture_url as logo_url, e.company_name as name, e.details as description, u.plan, e.chapter_label
        FROM club_memberships cm
        JOIN users u ON cm.club_id = u.id
        JOIN ecosystems e ON u.id = e.user_id
        WHERE cm.user_id = ? AND cm.status != 'rejected'
      `).all(userId);

      res.json({ ownedClubs, memberships });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/clubs/:id", (req, res) => {
    const clubId = req.params.id;
    try {
      const club = db.prepare(`
        SELECT u.id as club_id, u.username, u.profile_picture_url as logo_url, e.company_name as name, e.details as description, u.created_at as founded_date, u.plan, e.chapter_label
        FROM users u
        JOIN ecosystems e ON u.id = e.user_id
        WHERE u.id = ? AND e.service_category = 'club'
      `).get(clubId);

      if (!club) return res.status(404).json({ error: "Club not found" });

      const chapters = db.prepare("SELECT * FROM club_chapters WHERE club_id = ?").all(clubId);
      const roles = db.prepare("SELECT * FROM club_roles WHERE club_id = ? ORDER BY hierarchy_order ASC").all(clubId);
      const members = db.prepare(`
        SELECT cm.*, u.username, u.profile_picture_url as avatar_url, r.name as rider_name, u.plan
        FROM club_memberships cm
        JOIN users u ON cm.user_id = u.id
        LEFT JOIN riders r ON u.id = r.user_id
        WHERE cm.club_id = ?
      `).all(clubId);

      res.json({ club, chapters, roles, members });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clubs/:id/members", authenticateToken, (req: any, res) => {
    const clubId = req.params.id;
    const { user_id, chapter_id, role_id } = req.body;

    try {
      const club = db.prepare("SELECT user_id, owner_id FROM ecosystems WHERE user_id = ?").get(clubId) as any;
      if (!club || (Number(club.user_id) !== Number(req.user.id) && Number(club.owner_id) !== Number(req.user.id) && req.user.role !== 'admin')) {
        return res.status(403).json({ error: "Forbidden: Only club owners can add members" });
      }

      const existing = db.prepare("SELECT id FROM club_memberships WHERE club_id = ? AND user_id = ?").get(clubId, user_id);
      if (existing) {
        return res.status(400).json({ error: "User is already a member or has a pending application" });
      }

      db.prepare("INSERT INTO club_memberships (club_id, chapter_id, user_id, role_id, status) VALUES (?, ?, ?, ?, 'approved')")
        .run(clubId, chapter_id || null, user_id, role_id || null);
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clubs/:id/apply", authenticateToken, (req: any, res) => {
    const clubId = req.params.id;
    const userId = req.user.id;
    const { chapter_id } = req.body;

    try {
      const existing = db.prepare("SELECT id FROM club_memberships WHERE club_id = ? AND user_id = ?").get(clubId, userId);
      if (existing) {
        return res.status(400).json({ error: "Application already exists or you are already a member" });
      }

      db.prepare("INSERT INTO club_memberships (club_id, chapter_id, user_id, status) VALUES (?, ?, ?, 'pending')")
        .run(clubId, chapter_id || null, userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/clubs/:id/members/:membership_id", authenticateToken, (req: any, res) => {
    const clubId = req.params.id;
    const membershipId = req.params.membership_id;
    const { status, role_id, chapter_id } = req.body;
    
    try {
      const club = db.prepare("SELECT user_id, owner_id FROM ecosystems WHERE user_id = ?").get(clubId) as any;
      if (!club || (Number(club.user_id) !== Number(req.user.id) && Number(club.owner_id) !== Number(req.user.id) && req.user.role !== 'admin')) {
        return res.status(403).json({ error: "Forbidden: Only club owners can manage members" });
      }

      const updates = [];
      const params = [];
      if (status) { updates.push("status = ?"); params.push(status); }
      if (role_id !== undefined) { updates.push("role_id = ?"); params.push(role_id); }
      if (chapter_id !== undefined) { updates.push("chapter_id = ?"); params.push(chapter_id); }
      
      if (updates.length > 0) {
        params.push(membershipId, clubId);
        db.prepare(`UPDATE club_memberships SET ${updates.join(", ")} WHERE id = ? AND club_id = ?`).run(...params);
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/clubs/:id/members/:membership_id", authenticateToken, (req: any, res) => {
    const clubId = req.params.id;
    const membershipId = req.params.membership_id;
    const userId = req.user.id;

    try {
      // Check if the membership belongs to the user OR if the user is the club owner/admin
      const membership = db.prepare("SELECT user_id FROM club_memberships WHERE id = ? AND club_id = ?").get(membershipId, clubId);
      
      if (!membership) {
        return res.status(404).json({ error: "Membership not found" });
      }

      if (membership.user_id !== userId && Number(clubId) !== Number(userId) && req.user.role !== 'admin') {
        return res.status(403).json({ error: "Forbidden: You can only cancel your own membership" });
      }

      db.prepare("DELETE FROM club_memberships WHERE id = ? AND club_id = ?").run(membershipId, clubId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clubs/:id/roles", authenticateToken, (req: any, res) => {
    const clubId = req.params.id;
    const { name, description, permissions } = req.body;

    try {
      const club = db.prepare("SELECT user_id, owner_id FROM ecosystems WHERE user_id = ?").get(clubId) as any;
      if (!club || (Number(club.user_id) !== Number(req.user.id) && Number(club.owner_id) !== Number(req.user.id) && req.user.role !== 'admin')) {
        return res.status(403).json({ error: "Forbidden: Only club owners can manage roles" });
      }

      const info = db.prepare("INSERT INTO club_roles (club_id, name, description, permissions) VALUES (?, ?, ?, ?)")
        .run(clubId, name, description, JSON.stringify(permissions || []));
      res.json({ success: true, role_id: info.lastInsertRowid });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/clubs/:id/roles/reorder", authenticateToken, (req: any, res) => {
    const clubId = req.params.id;
    const { roles } = req.body; // Array of { id, hierarchy_order }

    try {
      const club = db.prepare("SELECT user_id, owner_id FROM ecosystems WHERE user_id = ?").get(clubId) as any;
      if (!club || (Number(club.user_id) !== Number(req.user.id) && Number(club.owner_id) !== Number(req.user.id) && req.user.role !== 'admin')) {
        return res.status(403).json({ error: "Forbidden: Only club owners can manage roles" });
      }

      const updateStmt = db.prepare("UPDATE club_roles SET hierarchy_order = ? WHERE id = ? AND club_id = ?");
      const transaction = db.transaction((rolesToUpdate) => {
        for (const role of rolesToUpdate) {
          updateStmt.run(role.hierarchy_order, role.id, clubId);
        }
      });

      transaction(roles);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/clubs/:id/roles/:role_id", authenticateToken, (req: any, res) => {
    const clubId = req.params.id;
    const roleId = req.params.role_id;
    const { name, description, permissions } = req.body;

    try {
      const club = db.prepare("SELECT user_id, owner_id FROM ecosystems WHERE user_id = ?").get(clubId) as any;
      if (!club || (Number(club.user_id) !== Number(req.user.id) && Number(club.owner_id) !== Number(req.user.id) && req.user.role !== 'admin')) {
        return res.status(403).json({ error: "Forbidden: Only club owners can manage roles" });
      }

      db.prepare("UPDATE club_roles SET name = ?, description = ?, permissions = ? WHERE id = ? AND club_id = ?")
        .run(name, description, JSON.stringify(permissions || []), roleId, clubId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/clubs/:id/roles/:role_id", authenticateToken, (req: any, res) => {
    const clubId = req.params.id;
    const roleId = req.params.role_id;

    try {
      const club = db.prepare("SELECT user_id, owner_id FROM ecosystems WHERE user_id = ?").get(clubId) as any;
      if (!club || (Number(club.user_id) !== Number(req.user.id) && Number(club.owner_id) !== Number(req.user.id) && req.user.role !== 'admin')) {
        return res.status(403).json({ error: "Forbidden: Only club owners can manage roles" });
      }

      db.prepare("UPDATE club_memberships SET role_id = NULL WHERE role_id = ? AND club_id = ?").run(roleId, clubId);
      db.prepare("DELETE FROM club_roles WHERE id = ? AND club_id = ?").run(roleId, clubId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/clubs/:id/settings", authenticateToken, (req: any, res) => {
    const clubId = req.params.id;
    const userId = req.user.id;
    const { chapter_label, company_name, details } = req.body;

    try {
      const club = db.prepare("SELECT user_id, owner_id FROM ecosystems WHERE user_id = ?").get(clubId) as any;
      if (!club) return res.status(404).json({ error: "Club not found" });
      if (Number(club.user_id) !== Number(userId) && Number(club.owner_id) !== Number(userId) && req.user.role !== 'admin') {
        return res.status(403).json({ error: "Not authorized to manage this club" });
      }

      db.prepare("UPDATE ecosystems SET chapter_label = ?, company_name = ?, details = ? WHERE user_id = ?")
        .run(chapter_label || 'Chapter', company_name, details, clubId);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clubs/create", authenticateToken, (req: any, res) => {
    const userId = req.user.id;
    const { name, description, location } = req.body;

    try {
      // Check if user is an approved ambassador
      const ambassador = db.prepare("SELECT * FROM ambassadors WHERE user_id = ?").get(userId);
      if (!ambassador && req.user.role !== 'admin') {
        return res.status(400).json({ error: "Only approved ambassadors can create clubs" });
      }

      // Create a new user entry for the club (ecosystem type)
      const username = name.toLowerCase().replace(/\s+/g, '_') + '_club_' + Date.now();
      const email = `${username}@motoclub.local`;
      const password = 'NoLoginRequired123!';
      const result = db.prepare("INSERT INTO users (username, email, password, type, role) VALUES (?, ?, ?, 'ecosystem', 'user')").run(username, email, password);
      const clubUserId = result.lastInsertRowid;

      // Create ecosystem entry
      db.prepare("INSERT INTO ecosystems (user_id, company_name, details, full_address, service_category, owner_id) VALUES (?, ?, ?, ?, 'club', ?)")
        .run(clubUserId, name, description, location, userId);

      res.json({ success: true, club_id: clubUserId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clubs/:id/chapters", authenticateToken, (req: any, res) => {
    const clubId = req.params.id;
    const { name, city, country, description } = req.body;

    try {
      const club = db.prepare("SELECT user_id, owner_id FROM ecosystems WHERE user_id = ?").get(clubId) as any;
      if (!club || (Number(club.user_id) !== Number(req.user.id) && Number(club.owner_id) !== Number(req.user.id) && req.user.role !== 'admin')) {
        return res.status(403).json({ error: "Forbidden: Only club owners can manage chapters" });
      }

      const info = db.prepare("INSERT INTO club_chapters (club_id, name, city, country, description) VALUES (?, ?, ?, ?, ?)")
        .run(clubId, name, city, country, description);
      res.json({ success: true, chapter_id: info.lastInsertRowid });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/clubs/:id/chapters/:chapter_id", authenticateToken, (req: any, res) => {
    const clubId = req.params.id;
    const chapterId = req.params.chapter_id;

    if (Number(clubId) !== Number(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden: Only club owners can manage chapters" });
    }

    try {
      db.prepare("DELETE FROM club_chapters WHERE id = ? AND club_id = ?").run(chapterId, clubId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Ambassador Network Endpoints
  app.post("/api/ambassadors/apply", authenticateToken, checkFeatureAccess('create_club'), (req: any, res) => {
    const { user_id, category, name, location, description, photos, links, proof_of_legitimacy } = req.body;
    
    if (user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only apply for yourself" });
    }

    try {
      db.prepare(`
        INSERT INTO ambassador_applications (user_id, category, name, location, description, photos, links, proof_of_legitimacy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(user_id, category, name, location, description, JSON.stringify(photos || []), JSON.stringify(links || []), proof_of_legitimacy);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ambassadors/applications", authenticateToken, checkAdmin, (req, res) => {
    try {
      const applications = db.prepare(`
        SELECT a.*, u.username, u.email 
        FROM ambassador_applications a
        JOIN users u ON a.user_id = u.id
        ORDER BY a.created_at DESC
      `).all();
      res.json(applications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ambassadors/applications/:id/approve", authenticateToken, checkAdmin, (req, res) => {
    const { id } = req.params;
    try {
      db.transaction(() => {
        const app = db.prepare("SELECT * FROM ambassador_applications WHERE id = ?").get(id) as any;
        if (!app) throw new Error("Application not found");
        
        db.prepare("UPDATE ambassador_applications SET status = 'approved' WHERE id = ?").run(id);
        db.prepare("INSERT OR IGNORE INTO ambassadors (user_id, category) VALUES (?, ?)").run(app.user_id, app.category);
        
        // Notify user
        db.prepare("INSERT INTO notifications (user_id, type, content, link) VALUES (?, ?, ?, ?)").run(
          app.user_id, 'system', 'Your ambassador application has been approved!', `/profile`
        );
      })();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ambassadors/applications/:id/reject", authenticateToken, checkAdmin, (req, res) => {
    const { id } = req.params;
    try {
      db.transaction(() => {
        const app = db.prepare("SELECT * FROM ambassador_applications WHERE id = ?").get(id) as any;
        if (!app) throw new Error("Application not found");
        
        db.prepare("UPDATE ambassador_applications SET status = 'rejected' WHERE id = ?").run(id);
        
        // Notify user
        db.prepare("INSERT INTO notifications (user_id, type, content, link) VALUES (?, ?, ?, ?)").run(
          app.user_id, 'system', 'Your ambassador application has been reviewed but not approved at this time.', `/ambassador`
        );
      })();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ambassadors", (req, res) => {
    try {
      const ambassadors = db.prepare(`
        SELECT a.*, u.username, u.profile_picture_url,
               COALESCE(e.company_name, r.name) as display_name,
               COALESCE(e.full_address, r.city) as location,
               e.lat, e.lng
        FROM ambassadors a
        JOIN users u ON a.user_id = u.id
        LEFT JOIN ecosystems e ON u.id = e.user_id
        LEFT JOIN riders r ON u.id = r.user_id
        WHERE a.is_active = 1
      `).all();
      res.json(ambassadors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ambassadors/:id/application-status", authenticateToken, (req: any, res) => {
    const { id } = req.params;
    if (id !== req.user.id.toString() && id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const application = db.prepare(`
        SELECT status 
        FROM ambassador_applications 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 1
      `).get(id) as any;
      
      res.json(application || { status: 'none' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ambassadors/:id", (req, res) => {
    const { id } = req.params;
    try {
      const ambassador = db.prepare(`
        SELECT a.*, u.username, u.profile_picture_url,
               COALESCE(e.company_name, r.name) as display_name,
               COALESCE(e.full_address, r.city) as location,
               e.lat, e.lng
        FROM ambassadors a
        JOIN users u ON a.user_id = u.id
        LEFT JOIN ecosystems e ON u.id = e.user_id
        LEFT JOIN riders r ON u.id = r.user_id
        WHERE a.user_id = ?
      `).get(id);
      res.json(ambassador || null);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ambassadors/stamps", authenticateToken, (req: any, res) => {
    const { ambassador_id, type, name, description, icon, rarity } = req.body;
    
    try {
      const ambassador = db.prepare("SELECT user_id FROM ambassadors WHERE id = ?").get(ambassador_id) as any;
      if (!ambassador) {
        return res.status(404).json({ error: "Ambassador not found" });
      }
      if (ambassador.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: You can only create stamps for yourself" });
      }

      db.prepare(`
        INSERT INTO passport_stamps (ambassador_id, type, name, description, icon, rarity)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(ambassador_id, type, name, description, icon, rarity || 'common');
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ambassadors/:id/stamps", (req, res) => {
    const { id } = req.params;
    try {
      const stamps = db.prepare("SELECT * FROM passport_stamps WHERE ambassador_id = ?").all(id);
      res.json(stamps);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/stamps/scan", authenticateToken, (req: any, res) => {
    const { user_id, stamp_id, location_lat, location_lng } = req.body;
    
    if (user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only scan stamps for yourself" });
    }

    try {
      const stamp = db.prepare("SELECT ambassador_id, creator_type, creator_id FROM passport_stamps WHERE id = ?").get(stamp_id) as any;
      if (!stamp) {
        return res.status(404).json({ error: "Stamp not found" });
      }
      const ambassador_id = stamp.ambassador_id;
      const creator_type = stamp.creator_type;
      const creator_id = stamp.creator_id;

      if (ambassador_id > 0) {
        const ambassador = db.prepare("SELECT location_lat, location_lng FROM ambassadors WHERE user_id = ?").get(ambassador_id) as any;
        
        // Anti-fraud: Distance validation (e.g., within 1km)
        if (location_lat && location_lng && ambassador && ambassador.location_lat && ambassador.location_lng) {
          const distance = getDistanceFromLatLonInKm(location_lat, location_lng, ambassador.location_lat, ambassador.location_lng);
          if (distance > 1) { // 1 km radius
            return res.status(403).json({ error: "You are too far from the ambassador to collect this stamp." });
          }
        }
      }

      db.transaction(() => {
        db.prepare(`
          INSERT INTO user_passport_stamps (user_id, stamp_id, ambassador_id, location_lat, location_lng, creator_type, creator_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(user_id, stamp_id, ambassador_id, location_lat || 0, location_lng || 0, creator_type, creator_id);
      })();
      
      if (ambassador_id > 0) {
        updateAmbassadorReputation(ambassador_id);
      }
      
      res.json({ success: true });
    } catch (error: any) {
      if (error.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ error: "You already have this stamp!" });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  });

  app.get("/api/users/:id/basic", authenticateToken, (req: any, res) => {
    const { id } = req.params;
    try {
      const user = db.prepare(`
        SELECT u.id, u.username, u.profile_picture_url, u.type,
               COALESCE(e.company_name, r.name) as name
        FROM users u
        LEFT JOIN ecosystems e ON u.id = e.user_id
        LEFT JOIN riders r ON u.id = r.user_id
        WHERE u.id = ?
      `).get(id) as any;

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/users/:id/passport", optionalAuthenticateToken, (req: any, res) => {
    const { id } = req.params;
    const isOwner = req.user && req.user.id.toString() === id.toString();
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'moderator');

    try {
      const stamps = db.prepare(`
        SELECT us.id, us.user_id, us.stamp_id, us.ambassador_id, us.scanned_at,
               ${(isOwner || isAdmin) ? 'us.location_lat, us.location_lng,' : ''}
               s.name, s.description, s.icon, s.rarity, s.type,
               u.username as ambassador_username,
               COALESCE(e.company_name, r.name) as ambassador_name
        FROM user_passport_stamps us
        JOIN passport_stamps s ON us.stamp_id = s.id
        LEFT JOIN users u ON us.ambassador_id = u.id
        LEFT JOIN ecosystems e ON u.id = e.user_id
        LEFT JOIN riders r ON u.id = r.user_id
        WHERE us.user_id = ?
        ORDER BY us.scanned_at DESC
      `).all(id);
      res.json(stamps);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/upload", authenticateToken, upload.single("file"), (req: any, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
  });

  // Admin: User Plan Management
  app.post("/api/admin/users/:id/plan", authenticateToken, checkAdmin, (req, res) => {
    const { plan } = req.body;
    const { id } = req.params;

    if (!['freemium', 'premium'].includes(plan)) {
      return res.status(400).json({ error: "Invalid plan type" });
    }

    try {
      db.prepare("UPDATE users SET plan = ? WHERE id = ?").run(plan, id);
      res.json({ message: `User plan updated to ${plan}` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Feature Access Configuration
  app.get("/api/feature-access", (req, res) => {
    try {
      const settings = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'feature_%'").all() as any[];
      const access: Record<string, string> = {};
      settings.forEach(s => {
        access[s.key.replace('feature_', '')] = s.value;
      });
      res.json(access);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch feature access settings" });
    }
  });

  app.get("/api/admin/feature-access", authenticateToken, checkAdmin, (req, res) => {
    try {
      const settings = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'feature_%'").all() as any[];
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/feature-access", authenticateToken, checkAdmin, (req, res) => {
    const { featureKey, allowedPlan, features } = req.body;

    try {
      const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
      db.transaction(() => {
        if (featureKey && allowedPlan && ['freemium', 'premium'].includes(allowedPlan)) {
          stmt.run(featureKey, allowedPlan);
        } else if (features && typeof features === 'object') {
          for (const [feature, access] of Object.entries(features)) {
            if (['freemium', 'premium'].includes(access as string)) {
              stmt.run(`feature_${feature}`, access);
            }
          }
        } else {
          throw new Error("Invalid features configuration");
        }
      })();
      res.json({ message: "Feature access configuration updated" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/register", async (req, res) => {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      console.error("Register validation failed:", JSON.stringify(validation.error.format(), null, 2));
      return res.status(400).json({ error: "Invalid input", details: validation.error.format() });
    }
    const { username, email, password, type, fullName, location, bio, motorcycle, businessName, businessType, interests, services, referralCode } = validation.data;

    const interestsStr = Array.isArray(interests) ? interests.join(',') : interests;
    const servicesStr = Array.isArray(services) ? services.join(',') : services;

    try {
      let userId;
      const initialStatus = type === 'rider' ? 'active' : 'pending';
      const newReferralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      let hashedPassword = null;
      if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
      }
      
      db.transaction(() => {
        let referredBy = null;
        if (referralCode) {
          const referrer = db.prepare("SELECT id FROM users WHERE referral_code = ?").get(referralCode) as any;
          if (referrer) referredBy = referrer.id;
        }

        const userResult = insertUser.run(
          username, 
          email,
          hashedPassword, // Allow null for Google Auth
          type, 
          `https://picsum.photos/seed/${username}/200/200`,
          "user",
          initialStatus,
          newReferralCode,
          referredBy,
          'freemium',
          0,
          fullName || null,
          location || null,
          bio || null,
          motorcycle || null,
          businessName || null,
          businessType || null,
          interestsStr || null,
          servicesStr || null,
          newReferralCode
        );
        userId = userResult.lastInsertRowid;

        if (type === "rider") {
          insertRider.run(userId, fullName, null, location); // age is null for now
          
          // Optional: Handle motorcycle and interests if you have tables for them
          // For now, we'll just log them or ignore if tables don't exist
          console.log(`Rider ${username} registered with motorcycle: ${motorcycle}, interests: ${interests}`);
        } else {
          insertEco.run(userId, businessName, location, businessType, bio, null, null, userId); // lat, lng are null for now
          
          // Optional: Handle services
          console.log(`Ecosystem ${username} registered with services: ${services}`);
        }
      })();
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
      res.json({ success: true, username, id: userId, token: jwt.sign({ id: userId, username, role: 'user', plan: user.plan }, JWT_SECRET, { expiresIn: '24h' }) });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/user/onboarding", authenticateToken, (req, res) => {
    const { type, fullName, location, bio, motorcycle, businessName, businessType, interests, services, referralCode } = req.body;
    const userId = (req as any).user.id;

    const interestsStr = Array.isArray(interests) ? interests.join(',') : interests;
    const servicesStr = Array.isArray(services) ? services.join(',') : services;

    try {
      db.transaction(() => {
        let referredBy = null;
        if (referralCode) {
          const referrer = db.prepare("SELECT id FROM users WHERE referral_code = ?").get(referralCode) as any;
          if (referrer) referredBy = referrer.id;
        }

        // Update user type and status based on type
        const newStatus = type === 'rider' ? 'active' : 'pending';
        db.prepare(`
          UPDATE users 
          SET type = ?, 
              status = ?, 
              referred_by = COALESCE(referred_by, ?),
              fullName = ?,
              location = ?,
              bio = ?,
              motorcycle = ?,
              businessName = ?,
              businessType = ?,
              interests = ?,
              services = ?,
              referralCode = COALESCE(referralCode, referral_code),
              username = COALESCE(?, username)
          WHERE id = ?
        `).run(
          type, 
          newStatus, 
          referredBy, 
          fullName || null,
          location || null,
          bio || null,
          motorcycle || null,
          businessName || null,
          businessType || null,
          interestsStr || null,
          servicesStr || null,
          req.body.username || null,
          userId
        );

        if (type === "rider") {
          // Check if rider record exists, if not create it, else update
          const rider = db.prepare("SELECT * FROM riders WHERE user_id = ?").get(userId);
          if (rider) {
            db.prepare("UPDATE riders SET name = ?, city = ? WHERE user_id = ?").run(fullName || null, location || null, userId);
          } else {
            insertRider.run(userId, fullName || null, null, location || null);
          }
          console.log(`Rider updated with motorcycle: ${motorcycle}, interests: ${interests}`);
        } else {
          // Check if eco record exists, if not create it, else update
          const eco = db.prepare("SELECT * FROM ecosystems WHERE user_id = ?").get(userId);
          if (eco) {
            db.prepare("UPDATE ecosystems SET company_name = ?, full_address = ?, service_category = ?, details = ? WHERE user_id = ?").run(businessName || null, location || null, businessType || null, bio || null, userId);
          } else {
            insertEco.run(userId, businessName || null, location || null, businessType || null, bio || null, null, null, userId);
          }
          console.log(`Ecosystem updated with services: ${services}`);
        }
      })();
      
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
      res.json({ success: true, username: user.username, type: user.type });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/user", authenticateToken, (req: any, res) => {
    const userId = req.user.id;
    try {
      db.transaction(() => {
        // Delete from all related tables
        db.prepare("DELETE FROM messages WHERE sender_id = ?").run(userId);
        db.prepare("DELETE FROM chat_participants WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM notifications WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM event_rsvps WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM user_badges WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM user_passport_stamps WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM user_route_progress WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM reviews WHERE reviewer_user_id = ?").run(userId);
        db.prepare("DELETE FROM recommendations WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM followers WHERE follower_id = ? OR following_id = ?").run(userId, userId);
        db.prepare("DELETE FROM riders WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM ecosystems WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM ambassadors WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM club_memberships WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM posts WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM users WHERE id = ?").run(userId);
      })();
      res.json({ success: true, message: "Account deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/reports", authenticateToken, (req: any, res) => {
    const { reported_id, reason, details } = req.body;
    const reporter_id = req.user.id;

    if (!reported_id || !reason) {
      return res.status(400).json({ error: "Reported ID and reason are required" });
    }

    try {
      db.prepare(`
        INSERT INTO user_reports (reporter_id, reported_id, reason, details)
        VALUES (?, ?, ?, ?)
      `).run(reporter_id, reported_id, reason, details || null);
      res.status(201).json({ success: true, message: "Report submitted successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin Routes
  // Note: In a real app, you would get the current user from the session/token
  // For this prototype, we'll simulate a permission check
  
  app.get("/api/admin/users", authenticateToken, checkAdmin, (req, res) => {
    const users = db.prepare(`
      SELECT u.id, u.username, u.email, u.type, u.role, u.status, u.profile_picture_url, u.created_at, u.plan,
             r.name as rider_name, 
             e.company_name 
      FROM users u
      LEFT JOIN riders r ON u.id = r.user_id
      LEFT JOIN ecosystems e ON u.id = e.user_id
      ORDER BY u.created_at DESC
    `).all();
    res.json(users);
  });

  app.put("/api/admin/users/:id/status", authenticateToken, checkAdmin, (req, res) => {
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

  app.put("/api/admin/users/:id/role", authenticateToken, checkAdmin, (req, res) => {
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

  app.put("/api/admin/users/:id/email", authenticateToken, checkAdmin, (req, res) => {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: "Invalid email" });
    }
    
    try {
      // Check if email already exists for another user
      const existingUser = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, req.params.id);
      if (existingUser) {
        return res.status(400).json({ error: "Email already in use" });
      }

      db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/users/:id", authenticateToken, checkAdmin, (req, res) => {
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

  app.get("/api/admin/settings", authenticateToken, checkAdmin, (req, res) => {
    try {
      const settings = db.prepare("SELECT * FROM settings").all() as any[];
      const settingsMap = settings.reduce((acc, curr) => {
        let val = curr.value;
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(Number(val)) && val !== '') val = Number(val);
        
        acc[curr.key] = val;
        return acc;
      }, {});
      res.json(settingsMap);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/settings", authenticateToken, checkAdmin, (req, res) => {
    const { key, value } = req.body;
    try {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, String(value));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Global error handler caught an error:", err);
    console.error("Request path:", req.path);
    console.error("Request method:", req.method);
    
    if (err instanceof multer.MulterError) {
      console.error("Multer error:", err.code, err.message);
      return res.status(400).json({ error: err.message });
    }
    
    if (err.message && err.message.includes("Only images are allowed")) {
      return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: err.message || "Internal Server Error" });
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
    const distPath = __dirname;
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
