import express from "express";
import helmet from "helmet";
import fs from "fs";

process.on('unhandledRejection', (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  fs.appendFileSync('crash2.log', `REJECTION: ${reason}\n`);
});
process.on('uncaughtException', (error) => {
  console.error("Uncaught Exception:", error);
  fs.appendFileSync('crash2.log', `EXCEPTION: ${error.stack}\n`);
});
import { rateLimit } from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import { z } from "zod";
import Database from "libsql";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import { OAuth2Client } from 'google-auth-library';
import { fetchOSMPlaces } from './src/services/osmService.ts';
import {
  computeGarageStats,
  computeOilAlert,
  lastKnownOdometer,
  latestOilChange,
  derivePrice,
  isOdometerDecreasing,
  FUEL_TYPES,
  type OilChangeRecord,
  type RefuelingRecord,
} from './src/utils/garageCalculations.ts';
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (!admin.apps.length) {
  let credential;
  const serviceAccountPath = path.resolve(__dirname, 'serviceAccountKey.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    console.log("Firebase Admin initializing with serviceAccountKey.json");
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    credential = admin.credential.cert(serviceAccount);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.log("Firebase Admin initializing with FIREBASE_SERVICE_ACCOUNT_KEY secret");
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      credential = admin.credential.cert(serviceAccount);
    } catch (e) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON:", e);
      credential = admin.credential.applicationDefault();
    }
  } else {
    console.log("Firebase Admin initializing with applicationDefault() (may lack permissions if unconfigured)");
    credential = admin.credential.applicationDefault();
  }

  admin.initializeApp({
    credential,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket
  });
}

// @ts-expect-error firebase-admin@10 types don't expose the 2-arg `getFirestore(app, databaseId)` overload yet, but it works at runtime.
const firestore = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
const bucket = admin.storage().bucket();
console.log(`Firestore initialized for database: ${firebaseConfig.firestoreDatabaseId}`);

// Firestore Helpers to mimic some SQLite behaviors
const collections = {
  users: firestore.collection("users"),
  riders: firestore.collection("riders"),
  motorcycles: firestore.collection("motorcycles"),
  ecosystems: firestore.collection("ecosystems"),
  posts: firestore.collection("posts"),
  post_likes: firestore.collection("post_likes"),
  followers: firestore.collection("followers"),
  events: firestore.collection("events"),
  events_staging: firestore.collection("events_staging"),
  contests: firestore.collection("contests"),
  submissions: firestore.collection("submissions"),
  votes: firestore.collection("votes"),
  notifications: firestore.collection("notifications"),
  event_rsvps: firestore.collection("event_rsvps"),
  chats: firestore.collection("chats"),
  messages: firestore.collection("messages"),
  keywords_config: firestore.collection("keywords_config"),
  places_cache: firestore.collection("places_cache"),
  places_control: firestore.collection("places_control"),
  event_photos: firestore.collection("event_photos"),
  settings: firestore.collection("settings"),
  ambassadors: firestore.collection("ambassadors"),
  invite_links: firestore.collection("invite_links"),
  passport_stamps: firestore.collection("passport_stamps"),
  user_passport_stamps: firestore.collection("user_passport_stamps"),
  badges: firestore.collection("badges"),
  user_badges: firestore.collection("user_badges"),
  maintenance_logs: firestore.collection("maintenance_logs"),
  oil_changes: firestore.collection("oil_changes"),
  refuelings: firestore.collection("refuelings"),
  comments: firestore.collection("comments"),
  checkins: firestore.collection("checkins"),
  ambassador_posts: firestore.collection("ambassador_posts"),
  social_walls: firestore.collection("social_walls"),
  recommendations: firestore.collection("recommendations"),
  discovered_routes: firestore.collection("discovered_routes"),
  rating_summaries: firestore.collection("rating_summaries"),
  reviews: firestore.collection("reviews"),
  review_verifications: firestore.collection("review_verifications"),
  checkpoints: firestore.collection("checkpoints"),
  user_route_progress: firestore.collection("user_route_progress"),
  club_roles: firestore.collection("club_roles"),
  club_chapters: firestore.collection("club_chapters"),
  club_memberships: firestore.collection("club_memberships"),
  ambassador_applications: firestore.collection("ambassador_applications"),
  // Relatos de Estrada (road reports) — Fase 0. `relatos` is the source of truth
  // for the full lifecycle (draft→pending→approved→rejected→featured); the SQLite
  // `relatos` mirror only holds approved/featured for fast public reads.
  // `places_staging` is admin-only (mirrors events_staging). `routes` is modeled
  // now (Fase 0) and built in Fase 5.
  relatos: firestore.collection("relatos"),
  places_staging: firestore.collection("places_staging"),
  routes: firestore.collection("routes"),
  // Gamification (Fase 4): contribution stats for the "Guia" title + per-moto mini-passport.
  relato_author_stats: firestore.collection("relato_author_stats"),
  moto_relato_stats: firestore.collection("moto_relato_stats"),
};

// Generic counter for pseudo-incrementing IDs if needed (though random IDs are preferred in Firestore)
async function getNextId(collectionName: string) {
  const counterRef = firestore.collection("_counters").doc(collectionName);
  return firestore.runTransaction(async (transaction) => {
    const doc = await transaction.get(counterRef);
    const newId = (doc.exists ? doc.data()?.count || 0 : 0) + 1;
    transaction.set(counterRef, { count: newId });
    return newId;
  });
}

// ---- Garagem (My Garage) helpers --------------------------------------------
// Ownership check for a motorcycle, robust to the Firestore/SQLite split: tries
// Firestore first (where moto routes write), falls back to Turso.
interface OwnershipResult {
  ok: boolean;
  status: number;
  message: string;
  rider_id: any;
}
async function verifyMotoOwnership(motoId: string | number, req: any): Promise<OwnershipResult> {
  let rider_id: any = null;
  try {
    const motoDoc = await collections.motorcycles.doc(motoId.toString()).get();
    if (motoDoc.exists) rider_id = (motoDoc.data() as any).rider_id;
  } catch (e) {}
  if (rider_id == null) {
    try {
      const row = db.prepare("SELECT rider_id FROM motorcycles WHERE id = ?").get(motoId) as any;
      if (row) rider_id = row.rider_id;
    } catch (e) {}
  }
  if (rider_id == null) return { ok: false, status: 404, message: "Motorcycle not found", rider_id: null };
  if (
    rider_id.toString() !== req.user.id.toString() &&
    req.user.role !== "admin" &&
    req.user.role !== "moderator"
  ) {
    return { ok: false, status: 403, message: "Forbidden: not your motorcycle", rider_id };
  }
  return { ok: true, status: 200, message: "", rider_id };
}

// Load a single garage record (oil change / refueling), Firestore-first.
async function loadGarageRecord(kind: "oil_changes" | "refuelings", id: string): Promise<any | null> {
  try {
    const doc = await collections[kind].doc(id).get();
    if (doc.exists) return { id, ...(doc.data() as any) };
  } catch (e) {}
  try {
    const row = db.prepare(`SELECT * FROM ${kind} WHERE id = ?`).get(id) as any;
    if (row) return row;
  } catch (e) {}
  return null;
}

// Raw oil_changes + refuelings for a moto. Firestore-primary; falls back per
// collection to SQLite when Firestore is empty (handles failed dual-writes).
async function fetchGarageRecords(
  motoIdNum: number,
): Promise<{ oil_changes: any[]; refuelings: any[] }> {
  let oil_changes: any[] = [];
  let refuelings: any[] = [];
  try {
    const [oilSnap, refuelSnap] = await Promise.all([
      collections.oil_changes.where("motorcycle_id", "==", motoIdNum).get(),
      collections.refuelings.where("motorcycle_id", "==", motoIdNum).get(),
    ]);
    oil_changes = oilSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    refuelings = refuelSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch (e) {}
  // SQLite fallback per collection (in case the Firestore dual-write failed).
  if (oil_changes.length === 0) {
    try { oil_changes = db.prepare("SELECT * FROM oil_changes WHERE motorcycle_id = ?").all(motoIdNum) as any[]; } catch (e) {}
  }
  if (refuelings.length === 0) {
    try {
      refuelings = (db.prepare("SELECT * FROM refuelings WHERE motorcycle_id = ?").all(motoIdNum) as any[])
        .map((r) => ({ ...r, full_tank: !!r.full_tank }));
    } catch (e) {}
  }
  return { oil_changes, refuelings };
}

// Build the per-moto garage view (records + derived stats + alert) and apply the
// server-side premium strip. This is the security half of the gating: freemium
// viewers never receive the premium analytics, regardless of client behaviour.
function buildGarageView(moto: any, oil_changes: any[], refuelings: any[], isPremium: boolean) {
  const stats = computeGarageStats(oil_changes as OilChangeRecord[], refuelings as RefuelingRecord[]);
  const alertCfg = {
    active: !!moto.oil_alert_active,
    interval_km: moto.oil_alert_interval_km ?? null,
    interval_months: moto.oil_alert_interval_months ?? null,
  };
  let garage_stats: any = { ...stats };
  let oil_alert: any = computeOilAlert(
    alertCfg,
    latestOilChange(oil_changes as OilChangeRecord[]),
    stats.last_known_odometer,
  );
  if (!isPremium) {
    garage_stats.general_kmpl = null;
    garage_stats.cost_per_km_last = null;
    garage_stats.cost_per_km_general = null;
    oil_alert = { state: "locked", km_remaining: null, months_elapsed: null, reason: null };
  }
  return { oil_changes, refuelings, garage_stats, oil_alert, oil_alert_config: alertCfg };
}

// Zod schemas for garage payloads (server never trusts the client).
const refuelingSchema = z.object({
  km: z.coerce.number().positive(),
  liters: z.coerce.number().positive(),
  fuel_type: z.enum(FUEL_TYPES as [string, ...string[]]),
  full_tank: z.boolean().optional(),
  price_per_liter: z.coerce.number().positive().nullable().optional(),
  total_value: z.coerce.number().positive().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  record_date: z.string().min(1).optional(),
});
const oilChangeSchema = z.object({
  km: z.coerce.number().positive(),
  oil_type: z.string().min(1).max(120),
  liters: z.coerce.number().positive(),
  shop: z.string().max(200).nullable().optional(),
  shop_ref: z
    .object({
      refType: z.enum(["user", "place", "freetext"]),
      refId: z.string().nullable().optional(),
      nomeExibicao: z.string().max(200),
    })
    .nullable()
    .optional(),
  note: z.string().max(500).nullable().optional(),
  record_date: z.string().min(1).optional(),
});

// ---- Relatos de Estrada (Fase 0): strict validation + secure-write helpers -----
// The server never trusts the client for any sensitive field. Top-level relato
// payloads use Zod's default STRIP mode, so unknown/sensitive keys the client may
// send (status, verificationLevel, qualitySignals, origin, featuredAt/Until,
// authorId, ...) are silently dropped — the server assigns them authoritatively.
// `structuredFields` is the one extensible map (catchall) so new moto-native keys
// can appear without a schema migration.
const RELATO_LIMITS = { title: 160, body: 8000, part: 2000, media: 12, links: 10 } as const;
const RELATO_GPS_RADIUS_KM = 0.5; // within 500m of the place ⇒ verified_gps

const RELATO_ANCHOR_TYPES = ["place", "route"] as const;
const SF_ROAD_SURFACE = ["asfalto_bom", "asfalto_ruim", "paralelepipedo", "cascalho", "terra", "misto"] as const;
const SF_SUITABILITY = ["qualquer_moto", "melhor_trail", "evitar_moto_baixa"] as const;
const SF_TRISTATE = ["sim", "nao", "incerto"] as const;
const SF_PARKING_FEATURES = ["rua", "patio", "coberto", "vigiado"] as const;
const SF_AMENITIES = ["banheiro", "agua", "sombra", "comida", "combustivel_proximo"] as const;
const SF_GROUP_CAPACITY = ["pequeno", "medio", "grande"] as const;

const structuredFieldsSchema = z
  .object({
    accessRoadSurface: z.enum(SF_ROAD_SURFACE).optional(),
    accessSuitability: z.enum(SF_SUITABILITY).optional(),
    motoParking: z.enum(SF_TRISTATE).optional(),
    motoParkingFeatures: z.array(z.enum(SF_PARKING_FEATURES)).max(8).optional(),
    gearStorage: z.enum(SF_TRISTATE).optional(),
    amenities: z.array(z.enum(SF_AMENITIES)).max(12).optional(),
    receivesGroup: z.enum(SF_TRISTATE).optional(),
    groupCapacity: z.enum(SF_GROUP_CAPACITY).optional(),
  })
  // Extensible: future moto-native keys enter without migration, but stay typed.
  .catchall(z.union([z.string().max(120), z.number(), z.boolean(), z.array(z.string().max(120)).max(20)]));

const narrativePartsSchema = z
  .object({
    motivacao: z.string().max(RELATO_LIMITS.part).optional(),
    recepcao: z.string().max(RELATO_LIMITS.part).optional(),
    paraQuem: z.string().max(RELATO_LIMITS.part).optional(),
    atencao: z.string().max(RELATO_LIMITS.part).optional(),
  })
  .strict();

const mediaItemSchema = z
  .object({
    type: z.literal("photo"),
    url: z.string().url().max(2000).refine((u) => /^https:\/\//i.test(u), "media url must be https"),
    storageRef: z.string().max(500).optional(),
  })
  .strict();

const externalLinkSchema = z
  .object({
    kind: z.enum(["website", "gmaps", "other"]),
    url: z.string().url().max(2000).refine((u) => /^https:\/\//i.test(u), "external link must be https"),
  })
  .strict(); // resolvedPlaceId / resolvedCoords are SERVER-assigned, never accepted here

// Client only sends motoId; the server validates ownership and builds the snapshot
// from the Garagem (a relato must not carry an unvalidated bike snapshot).
const motoUsedSchema = z.object({ motoId: z.string().min(1).max(64) }).strict();

const evidenceSchema = z
  .object({
    coords: z.object({ lat: z.number(), lng: z.number(), accuracy: z.number().optional() }).strict().optional(),
    checkinId: z.string().max(200).optional(),
    gpxRef: z.string().max(500).optional(),
  })
  .strict();

// New place candidate (Fase 1): when the relato anchors to a place that doesn't
// exist yet. Goes to places_staging (admin-moderated), NEVER straight to production.
const newPlaceSchema = z
  .object({
    name: z.string().min(2).max(160),
    coords: z.object({ lat: z.number(), lng: z.number() }).strict(),
    category: z.string().max(40).optional(),
    motoAttributes: structuredFieldsSchema.optional(),
  })
  .strict();

// New route (Fase 5): start/end/waypoints (NO live breadcrumb) + optional GPX ref.
// Created directly (origin user_submitted); the route line is derived server-side
// via routing. privacyLevel gates exposure (origin/destination reveal where you live).
const ROUTE_WAYPOINT_KINDS = ["curva", "combustivel", "mirante", "perigo", "asfalto_ruim"] as const;
const routePointSchema = z.object({ lat: z.number(), lng: z.number(), placeRef: z.string().max(200).optional() }).strip();
const routeWaypointSchema = z
  .object({ lat: z.number(), lng: z.number(), label: z.string().max(80).optional(), kind: z.enum(ROUTE_WAYPOINT_KINDS).optional() })
  .strip();
const newRouteSchema = z
  .object({
    name: z.string().min(2).max(160),
    start: routePointSchema,
    end: routePointSchema,
    waypoints: z.array(routeWaypointSchema).max(50).optional(),
    gpxRef: z.string().max(500).optional(),
    surfaceTypes: z.array(z.string().max(40)).max(20).optional(),
    difficulty: z.enum(["leve", "media", "pesada"]).optional(),
    privacyLevel: z.enum(["public", "community", "private"]).optional(),
  })
  .strip();

const relatoCreateSchema = z
  .object({
    anchorType: z.enum(RELATO_ANCHOR_TYPES),
    anchorId: z.string().min(1).max(200).optional(), // existing place_id / route id
    newPlace: newPlaceSchema.optional(),             // OR a new place candidate (Fase 1)
    newRoute: newRouteSchema.optional(),             // OR a new route (Fase 5)
    title: z.string().min(1).max(RELATO_LIMITS.title),
    body: z.string().max(RELATO_LIMITS.body).optional(),
    narrativeParts: narrativePartsSchema.optional(),
    structuredFields: structuredFieldsSchema.optional(),
    media: z.array(mediaItemSchema).max(RELATO_LIMITS.media).optional(),
    motoUsed: motoUsedSchema.optional(),
    externalLinks: z.array(externalLinkSchema).max(RELATO_LIMITS.links).optional(),
    evidence: evidenceSchema.optional(), // server reads this to ASSIGN verificationLevel
    requestedStatus: z.enum(["draft", "pending"]).default("draft"), // only status the client may ask for
  })
  .superRefine((val, ctx) => {
    if (val.anchorType === "place") {
      // Exactly one of anchorId / newPlace must be present for a place relato.
      if (!!val.anchorId === !!val.newPlace) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "provide exactly one of anchorId or newPlace" });
      }
    } else if (val.anchorType === "route") {
      if (!!val.anchorId === !!val.newRoute) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "provide exactly one of anchorId or newRoute" });
      }
    } else if (!val.anchorId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "anchorId is required for this anchorType" });
    }
  });

const relatoEditSchema = z.object({
  title: z.string().min(1).max(RELATO_LIMITS.title).optional(),
  body: z.string().max(RELATO_LIMITS.body).optional(),
  narrativeParts: narrativePartsSchema.optional(),
  structuredFields: structuredFieldsSchema.optional(),
  media: z.array(mediaItemSchema).max(RELATO_LIMITS.media).optional(),
  motoUsed: motoUsedSchema.nullable().optional(),
  externalLinks: z.array(externalLinkSchema).max(RELATO_LIMITS.links).optional(),
  evidence: evidenceSchema.optional(),
  requestedStatus: z.enum(["draft", "pending"]).optional(), // submit a saved draft (draft→pending)
});

// Plain-text discipline: strip control chars (keep \n \t), cap length, trim. The
// real XSS defense is rendering as plain text (React escapes) on every surface;
// this just rejects junk and bounds size. Body/narrative are NEVER rendered as HTML.
function normalizeRelatoText(s: string, max: number): string {
  // Strip control chars except tab (\x09) and newline (\x0A); cap length; trim.
  return (s || "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .slice(0, max)
    .trim();
}

// Compose `body` from the guided-script parts (when provided), then append any free
// text. Order mirrors the form. If no parts, `body` stays the free text as-is.
function composeRelatoBody(parts: any, freeBody?: string): string {
  const ordered = ["motivacao", "recepcao", "paraQuem", "atencao"];
  const segments: string[] = [];
  if (parts && typeof parts === "object") {
    for (const k of ordered) {
      const v = parts[k];
      if (typeof v === "string" && v.trim()) segments.push(v.trim());
    }
  }
  if (typeof freeBody === "string" && freeBody.trim()) segments.push(freeBody.trim());
  return normalizeRelatoText(segments.join("\n\n"), RELATO_LIMITS.body);
}

// Firestore-first place coords (for GPS proximity), SQLite fallback.
async function loadPlaceCoords(placeId: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const doc = await collections.places_cache.doc(placeId).get();
    if (doc.exists) {
      const d = doc.data() as any;
      if (typeof d.lat === "number" && typeof d.lng === "number") return { lat: d.lat, lng: d.lng };
    }
  } catch (e) { /* fall through */ }
  try {
    const row = db.prepare("SELECT lat, lng FROM places_cache WHERE place_id = ?").get(placeId) as any;
    if (row && row.lat != null && row.lng != null) return { lat: Number(row.lat), lng: Number(row.lng) };
  } catch (e) { /* not found */ }
  return null;
}

// Haversine distance in km (module-scope; the existing getDistanceFromLatLonInKm /
// haversineM are nested inside the route-setup closure and not reachable here).
function relatoDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// SERVER-ASSIGNED verification level. The client supplies proof; the server decides
// the level. QR codes are static/unsigned (see Open Questions) → verified_qr is WEAK
// proof, on par with verified_gps, never a gold standard.
type VerificationLevel = "verified_qr" | "verified_gps" | "verified_gpx" | "community";
async function assignVerificationLevel(
  anchorType: string,
  anchorId: string,
  evidence: any,
  placeCoords?: { lat: number; lng: number } | null,
): Promise<{ level: VerificationLevel; verificationEvidence: Record<string, any> }> {
  const capturedAt = new Date().toISOString();
  if (evidence?.gpxRef) {
    return { level: "verified_gpx", verificationEvidence: { method: "gpx", gpxRef: String(evidence.gpxRef), capturedAt } };
  }
  if (evidence?.checkinId) {
    return { level: "verified_qr", verificationEvidence: { method: "qr", checkinId: String(evidence.checkinId), capturedAt } };
  }
  if (evidence?.coords && anchorType === "place") {
    // For a new place the coords aren't in places_cache yet — use the supplied ones.
    const place = placeCoords || (anchorId ? await loadPlaceCoords(anchorId) : null);
    if (place) {
      const km = relatoDistanceKm(evidence.coords.lat, evidence.coords.lng, place.lat, place.lng);
      if (km <= RELATO_GPS_RADIUS_KM) {
        return {
          level: "verified_gps",
          verificationEvidence: {
            method: "gps",
            coords: { lat: evidence.coords.lat, lng: evidence.coords.lng, accuracy: evidence.coords.accuracy ?? null },
            capturedAt,
          },
        };
      }
    }
  }
  return { level: "community", verificationEvidence: { method: "none", capturedAt } };
}

// Resolve a Google Maps short link (maps.app.goo.gl / goo.gl) to coords / place_id
// SERVER-side; we persist the resolved values, never the ephemeral short link as the
// source of truth. Best-effort: failures return {} and the link is just stored.
//
// SSRF-hardened: the input is user-supplied (relato externalLinks). A generic goo.gl
// link can redirect anywhere — including internal addresses — so we follow redirects
// MANUALLY and re-validate EVERY hop (https + Google-host allowlist + DNS/private-IP
// block) and cap the chain length. Never auto-follow into an unvalidated host.
const MAPS_REDIRECT_MAX = 5;

function isAllowedMapsHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "maps.app.goo.gl" || h === "goo.gl") return true;
  // google.com, www.google.com, maps.google.com, consent.google.com, google.com.br ...
  return /^([a-z0-9-]+\.)*google(\.[a-z]{2,3})+$/.test(h);
}

function isPrivateIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 127 || a === 10) return true;          // this-host / loopback / private
  if (a === 172 && b >= 16 && b <= 31) return true;            // private
  if (a === 192 && b === 168) return true;                     // private
  if (a === 169 && b === 254) return true;                     // link-local (cloud metadata)
  if (a >= 224) return true;                                   // multicast / reserved
  return false;
}
function isPrivateIpv6(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === "::1" || x === "::") return true;                  // loopback / unspecified
  if (x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80")) return true; // ULA / link-local
  if (x.startsWith("::ffff:")) return isPrivateIpv4(x.split(":").pop() || ""); // IPv4-mapped
  return false;
}
// Resolve the host and reject if ANY address is loopback/private/link-local.
async function isPublicHost(hostname: string): Promise<boolean> {
  try {
    const { promises: dnsp } = await import("node:dns");
    const addrs = await dnsp.lookup(hostname, { all: true });
    if (!addrs.length) return false;
    return addrs.every((a) => (a.family === 6 ? !isPrivateIpv6(a.address) : !isPrivateIpv4(a.address)));
  } catch (e) {
    return false;
  }
}

function parseMapsUrl(finalUrl: string): { resolvedCoords?: { lat: number; lng: number }; resolvedPlaceId?: string } {
  const out: { resolvedCoords?: { lat: number; lng: number }; resolvedPlaceId?: string } = {};
  const at = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) out.resolvedCoords = { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
  if (!out.resolvedCoords) {
    const ll = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (ll) out.resolvedCoords = { lat: parseFloat(ll[1]), lng: parseFloat(ll[2]) };
  }
  const pid = finalUrl.match(/[?&]q_place_id=([^&]+)/) || finalUrl.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  if (pid) out.resolvedPlaceId = decodeURIComponent(pid[1]);
  return out;
}

async function resolveMapsShortLink(
  url: string,
): Promise<{ resolvedCoords?: { lat: number; lng: number }; resolvedPlaceId?: string }> {
  try {
    let current = url;
    for (let hop = 0; hop < MAPS_REDIRECT_MAX; hop++) {
      let u: URL;
      try { u = new URL(current); } catch (e) { return {}; }
      // Re-validate EVERY hop before issuing the request.
      if (u.protocol !== "https:") return {};
      if (!isAllowedMapsHost(u.hostname)) return {};
      if (!(await isPublicHost(u.hostname))) return {};

      const resp = await fetch(current, { redirect: "manual" });
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get("location");
        if (!loc) return {};
        current = new URL(loc, current).toString(); // resolve relative; re-checked next loop
        continue;
      }
      // Final (non-redirect) response: parse the resolved URL only (never the body).
      return parseMapsUrl((resp as any).url || current);
    }
    return {}; // redirect chain too long
  } catch (e) {
    return {};
  }
}

// Resolve external links server-side: enforce https (defense-in-depth beyond Zod)
// and expand Google Maps short links into resolvedCoords/resolvedPlaceId.
async function resolveRelatoExternalLinks(links: any[] | undefined): Promise<any[]> {
  if (!Array.isArray(links)) return [];
  const out: any[] = [];
  for (const link of links.slice(0, RELATO_LIMITS.links)) {
    if (!link || typeof link.url !== "string" || !/^https:\/\//i.test(link.url)) continue;
    const entry: any = { kind: link.kind, url: link.url };
    if (link.kind === "gmaps" || /maps\.app\.goo\.gl|goo\.gl\//i.test(link.url)) {
      const resolved = await resolveMapsShortLink(link.url);
      if (resolved.resolvedCoords) entry.resolvedCoords = resolved.resolvedCoords;
      if (resolved.resolvedPlaceId) entry.resolvedPlaceId = resolved.resolvedPlaceId;
    }
    out.push(entry);
  }
  return out;
}

// Denormalized moto snapshot for motoUsed — the relato stays truthful even if the
// bike is later edited/removed from the Garagem. Firestore-first, SQLite fallback.
async function buildMotoSnapshot(motoId: string | number): Promise<Record<string, any>> {
  try {
    const doc = await collections.motorcycles.doc(motoId.toString()).get();
    if (doc.exists) {
      const d = doc.data() as any;
      return { make: d.make ?? null, model: d.model ?? null, year: d.year ?? null, image_url: d.image_url ?? null };
    }
  } catch (e) { /* fall through */ }
  try {
    const row = db.prepare("SELECT make, model, year, image_url FROM motorcycles WHERE id = ?").get(motoId) as any;
    if (row) return { make: row.make ?? null, model: row.model ?? null, year: row.year ?? null, image_url: row.image_url ?? null };
  } catch (e) { /* not found */ }
  return { make: null, model: null, year: null, image_url: null };
}

// Normalize a place name for dedup/search: accent-insensitive, alnum only.
function normalizePlaceName(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

// Proximity + name dedup against places_cache. Returns the "você quis dizer um
// destes?" candidates so a user-submitted place can be merged in moderation (Fase 2).
function dedupPlaces(
  name: string,
  coords: { lat: number; lng: number },
  radiusM = 300,
): Array<{ placeId: string; name: string; distanceMeters: number; score: number }> {
  const target = normalizePlaceName(name);
  const latDelta = radiusM / 111000;
  const lngDelta = radiusM / (111000 * Math.cos((coords.lat * Math.PI) / 180) || 111000);
  let rows: any[] = [];
  try {
    rows = db
      .prepare(`SELECT place_id, name, lat, lng FROM places_cache WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`)
      .all(coords.lat - latDelta, coords.lat + latDelta, coords.lng - lngDelta, coords.lng + lngDelta) as any[];
  } catch (e) { rows = []; }
  const out: Array<{ placeId: string; name: string; distanceMeters: number; score: number }> = [];
  for (const r of rows) {
    if (r.lat == null || r.lng == null) continue;
    const d = relatoDistanceKm(coords.lat, coords.lng, Number(r.lat), Number(r.lng)) * 1000;
    const rn = normalizePlaceName(r.name);
    const nameMatch = !!target && (rn === target || rn.includes(target) || target.includes(rn));
    if (d > radiusM && !nameMatch) continue;
    const score = (nameMatch ? 0.6 : 0) + Math.max(0, 1 - d / radiusM) * 0.4;
    out.push({ placeId: r.place_id, name: r.name, distanceMeters: Math.round(d), score: Number(score.toFixed(2)) });
  }
  out.sort((a, b) => b.score - a.score || a.distanceMeters - b.distanceMeters);
  return out.slice(0, 8);
}

// Search places_cache by name for the anchor picker (existing place).
function searchCachedPlaces(
  q: string,
  limit = 10,
): Array<{ placeId: string; name: string; lat: number; lng: number; category: string | null; address: string | null }> {
  const like = `%${(q || "").toLowerCase().trim()}%`;
  try {
    const rows = db
      .prepare(
        `SELECT place_id, name, lat, lng, category, full_address FROM places_cache
         WHERE name IS NOT NULL AND LOWER(name) LIKE ? ORDER BY reviews DESC LIMIT ?`,
      )
      .all(like, limit) as any[];
    return rows.map((r) => ({
      placeId: r.place_id,
      name: r.name,
      lat: Number(r.lat),
      lng: Number(r.lng),
      category: r.category ?? null,
      address: r.full_address ?? null,
    }));
  } catch (e) {
    return [];
  }
}

// ---- Fase 2 (moderation) helpers -------------------------------------------
function relatoTsToStr(v: any): string | null {
  if (v == null) return null;
  if (typeof v?.toDate === "function") { try { return v.toDate().toISOString(); } catch (e) { return null; } }
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

// Mirror an approved/featured relato into the SQLite read table (fast public reads
// for the place page / home / feed in Fase 3). Drafts/pending never land here.
function upsertRelatoMirror(r: any): void {
  try {
    db.prepare(
      `INSERT OR REPLACE INTO relatos
       (id, author_id, author_name, anchor_type, anchor_id, title, body, narrative_parts,
        structured_fields, media, moto_used, external_links, verification_level, verification_evidence,
        status, quality_saves, quality_helpful_votes, quality_editorial_picks, featured_at, featured_until,
        created_at, updated_at, last_edited_at, resubmitted_at, approved_at, schema_version)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      r.id, r.authorId ?? null, r.authorName ?? null, r.anchorType ?? null, r.anchorId ?? null,
      r.title ?? null, r.body ?? null, JSON.stringify(r.narrativeParts ?? null),
      JSON.stringify(r.structuredFields ?? {}), JSON.stringify(r.media ?? []), JSON.stringify(r.motoUsed ?? null),
      JSON.stringify(r.externalLinks ?? []), r.verificationLevel ?? null, JSON.stringify(r.verificationEvidence ?? {}),
      r.status ?? "approved", r.qualitySignals?.saves ?? 0, r.qualitySignals?.helpfulVotes ?? 0, r.qualitySignals?.editorialPicks ?? 0,
      relatoTsToStr(r.featuredAt), relatoTsToStr(r.featuredUntil), relatoTsToStr(r.createdAt), relatoTsToStr(r.updatedAt),
      relatoTsToStr(r.lastEditedAt), relatoTsToStr(r.resubmittedAt), relatoTsToStr(r.approvedAt), r.schemaVersion ?? 1,
    );
  } catch (e) {
    console.error("relato mirror upsert failed:", e);
  }
}

function removeRelatoMirror(id: string): void {
  try { db.prepare("DELETE FROM relatos WHERE id = ?").run(id); } catch (e) { /* mirror only */ }
}

// Denormalized relato_count on places_control (the durable layer; Firestore =
// source of truth via merge). UPSERT (not INSERT OR REPLACE) preserves other cols.
function bumpRelatoCount(placeId: string, delta = 1): void {
  if (!placeId) return;
  collections.places_control
    .doc(placeId)
    .set({ place_id: placeId, relato_count: admin.firestore.FieldValue.increment(delta) }, { merge: true })
    .catch(() => {});
  try {
    db.prepare(
      `INSERT INTO places_control (place_id, relato_count) VALUES (?, ?)
       ON CONFLICT(place_id) DO UPDATE SET relato_count = MAX(0, relato_count + ?)`,
    ).run(placeId, Math.max(0, delta), delta);
  } catch (e) { /* mirror only */ }
}

// Create a production place (places_cache + places_control) from a staging
// candidate, origin=user_submitted. Returns the new place_id.
async function createPlaceFromStaging(staging: any): Promise<string> {
  const c = staging.candidate || {};
  const placeId = `user_${staging.id}`;
  await collections.places_cache.doc(placeId).set(
    {
      place_id: placeId, name: c.name || "Lugar", lat: c.coords?.lat ?? null, lng: c.coords?.lng ?? null,
      category: c.category || null, source: "user_submitted", last_fetched: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await collections.places_control.doc(placeId).set(
    {
      place_id: placeId, is_approved: true, is_hidden: false, needs_revision: false,
      origin: "user_submitted", moto_attributes: c.motoAttributes || {}, relato_count: 0, schema_version: 1,
    },
    { merge: true },
  );
  try {
    db.prepare(`INSERT OR REPLACE INTO places_cache (place_id, name, lat, lng, category, source) VALUES (?, ?, ?, ?, ?, 'user_submitted')`)
      .run(placeId, c.name || "Lugar", c.coords?.lat ?? null, c.coords?.lng ?? null, c.category || null);
    db.prepare(
      `INSERT INTO places_control (place_id, is_approved, origin, moto_attributes, schema_version) VALUES (?, 1, 'user_submitted', ?, 1)
       ON CONFLICT(place_id) DO UPDATE SET is_approved = 1, origin = 'user_submitted', moto_attributes = excluded.moto_attributes`,
    ).run(placeId, JSON.stringify(c.motoAttributes || {}));
  } catch (e) {
    console.error("createPlaceFromStaging sqlite failed:", e);
  }
  return placeId;
}

// ---- Fase 5 (route reports) ------------------------------------------------
// Derive the route line server-side from start/end/waypoints via OSRM (public
// demo, a fixed trusted host — no SSRF). Falls back to raw points on failure.
async function routeViaOSRM(
  points: Array<{ lat: number; lng: number }>,
): Promise<{ polyline: Array<[number, number]>; distanceMeters: number } | null> {
  try {
    if (!Array.isArray(points) || points.length < 2) return null;
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    // Bound the external routing call so a slow OSRM can't hang route creation.
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
    const resp: any = await Promise.race([fetch(url), timeout]);
    if (!resp || !resp.ok) return null;
    const data: any = await resp.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates) return null;
    const polyline = route.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]); // [lng,lat]→[lat,lng]
    return { polyline, distanceMeters: Math.round(route.distance || 0) };
  } catch (e) {
    return null;
  }
}

// Create a route entity (origin user_submitted). The line is derived, not raw GPS.
async function createRouteEntity(input: any, authorId: any): Promise<string> {
  const ref = collections.routes.doc();
  const id = ref.id;
  const start = input.start;
  const end = input.end;
  const waypoints = Array.isArray(input.waypoints) ? input.waypoints : [];
  const points = [start, ...waypoints, end].filter((p: any) => p && typeof p.lat === "number" && typeof p.lng === "number");
  const routed = await routeViaOSRM(points);
  const polyline = routed?.polyline || points.map((p: any) => [p.lat, p.lng]);
  const polylineJson = JSON.stringify(polyline); // Firestore rejects nested arrays → store as JSON
  const geometry = { start, end, waypoints };
  const privacyLevel = ["public", "community", "private"].includes(input.privacyLevel) ? input.privacyLevel : "private";
  const data: Record<string, any> = {
    id,
    name: normalizeRelatoText(input.name || "Rota", 160),
    geometry,
    polyline: polylineJson,
    gpxRef: input.gpxRef || null,
    distanceMeters: routed?.distanceMeters ?? null,
    surfaceTypes: Array.isArray(input.surfaceTypes) ? input.surfaceTypes : [],
    difficulty: input.difficulty || null,
    privacyLevel,
    origin: "user_submitted",
    createdBy: authorId ?? null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    schemaVersion: 1,
  };
  await ref.set(data);
  try {
    db.prepare(
      `INSERT OR REPLACE INTO routes (id, name, geometry, polyline, gpx_ref, distance_meters, surface_types, difficulty, privacy_level, origin, created_by, schema_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'user_submitted', ?, 1)`,
    ).run(id, data.name, JSON.stringify(geometry), polylineJson, data.gpxRef, data.distanceMeters, JSON.stringify(data.surfaceTypes), data.difficulty, privacyLevel, authorId ?? null);
  } catch (e) {
    console.error("createRouteEntity sqlite failed:", e);
  }
  return id;
}

// ---- Fase 3 (display) helpers ----------------------------------------------
function safeJsonParse(s: any, fallback: any = null): any {
  try { return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
}

// Shape a SQLite relatos-mirror row for the public API (place page / home / feed).
function parseRelatoMirrorRow(r: any): Record<string, any> {
  return {
    id: r.id,
    authorId: r.author_id,
    authorName: r.author_name,
    anchorType: r.anchor_type,
    anchorId: r.anchor_id,
    title: r.title,
    body: r.body,
    structuredFields: safeJsonParse(r.structured_fields, {}),
    media: safeJsonParse(r.media, []),
    motoUsed: safeJsonParse(r.moto_used, null),
    verificationLevel: r.verification_level,
    status: r.status,
    featuredUntil: r.featured_until,
    createdAt: r.created_at,
  };
}

// ---- Fase 4 (gamification) -------------------------------------------------
// Reward weight by verification level. QR is static/unsigned → weak, on par with
// GPS (never a gold standard). NEVER weighted by distance/speed/frequency.
const RELATO_POINTS: Record<string, number> = { community: 1, verified_qr: 3, verified_gps: 3, verified_gpx: 4 };

// "Guia" progression — thresholds by approved-relato count (product's call).
function computeGuiaTitle(count: number): string | null {
  if (count >= 15) return "Guia Mestre";
  if (count >= 5) return "Guia de Estrada";
  if (count >= 1) return "Guia";
  return null;
}

// Award (sign +1) or revoke (-1) a relato's contribution to its author and, when a
// moto was used, to that moto's mini-passport. Counters floor at 0; the moto place
// set is monotonic (a place the moto visited stays visited). All counts are discrete
// events — no distance/speed/frequency, and no public leaderboard is produced here.
function awardRelatoContribution(r: any, sign: number): void {
  try {
    const pts = (RELATO_POINTS[r.verificationLevel] || 1) * sign;
    const authorId = r.authorId;
    if (authorId != null) {
      db.prepare(
        `INSERT INTO relato_author_stats (user_id, relatos_approved, points, title, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET
           relatos_approved = MAX(0, relatos_approved + ?),
           points = MAX(0, points + ?),
           updated_at = CURRENT_TIMESTAMP`,
      ).run(authorId, Math.max(0, sign), Math.max(0, pts), computeGuiaTitle(Math.max(0, sign)), sign, pts);
      const row = db.prepare("SELECT relatos_approved, points FROM relato_author_stats WHERE user_id = ?").get(authorId) as any;
      const title = computeGuiaTitle(row?.relatos_approved || 0);
      db.prepare("UPDATE relato_author_stats SET title = ? WHERE user_id = ?").run(title, authorId);
      collections.relato_author_stats.doc(String(authorId)).set(
        { user_id: authorId, relatos_approved: row?.relatos_approved || 0, points: row?.points || 0, title },
        { merge: true },
      ).catch(() => {});
    }

    const motoId = r.motoUsed?.motoId != null ? Number(r.motoUsed.motoId) : NaN;
    if (!Number.isNaN(motoId)) {
      const snap = r.motoUsed?.snapshot || {};
      const existing = db.prepare("SELECT place_ids FROM moto_relato_stats WHERE moto_id = ?").get(motoId) as any;
      const placeIds: string[] = existing?.place_ids ? safeJsonParse(existing.place_ids, []) : [];
      if (sign > 0 && r.anchorType === "place" && r.anchorId && !placeIds.includes(r.anchorId)) placeIds.push(r.anchorId);
      const placeJson = JSON.stringify(placeIds);
      db.prepare(
        `INSERT INTO moto_relato_stats (moto_id, owner_id, make, model, year, relatos_approved, points, place_ids, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(moto_id) DO UPDATE SET
           relatos_approved = MAX(0, relatos_approved + ?),
           points = MAX(0, points + ?),
           place_ids = ?, make = excluded.make, model = excluded.model, year = excluded.year,
           owner_id = excluded.owner_id, updated_at = CURRENT_TIMESTAMP`,
      ).run(motoId, authorId ?? null, snap.make ?? null, snap.model ?? null, snap.year ?? null, Math.max(0, sign), Math.max(0, pts), placeJson, sign, pts, placeJson);
      collections.moto_relato_stats.doc(String(motoId)).set(
        { moto_id: motoId, owner_id: authorId ?? null, make: snap.make ?? null, model: snap.model ?? null, year: snap.year ?? null, place_ids: placeIds },
        { merge: true },
      ).catch(() => {});
    }
  } catch (e) {
    console.error("awardRelatoContribution failed:", e);
  }
}

// Project an approved/featured relato into the MotorFeed as a post (one per relato).
async function projectRelatoToFeed(r: any): Promise<void> {
  try {
    // Privacy (Fase 5 non-goal): route relatos must NOT hit the public feed (start/end
    // reveal where the rider lives). Only place relatos are projected.
    if (r.anchorType !== "place") return;
    const existing = await collections.posts.where("shared_relato_id", "==", r.id).limit(1).get();
    if (!existing.empty) return; // already projected
    // Denormalize the author like POST /api/posts does — the feed reads username /
    // profile_picture_url straight off the post doc and crashes without them.
    const author: any = (await findUserById(r.authorId)) || {};
    const postId = await getNextId("posts");
    const imageUrl = (Array.isArray(r.media) && r.media[0]?.url) || null;
    // created_at MUST be an ISO string (like POST /api/posts) — a Firestore Timestamp
    // sorts into a different type-bucket in orderBy('created_at'), breaking the feed's
    // chronological order. Use the relato's own creation date so it lands where the
    // author posted it, not at approval time.
    const createdAt = relatoTsToStr(r.createdAt) || new Date().toISOString();
    const postData: Record<string, any> = {
      id: postId, user_id: r.authorId,
      username: author.username || r.authorName || null,
      user_type: author.type || null,
      profile_picture_url: author.profile_picture_url || null,
      content: r.title || "", image_url: imageUrl,
      tagged_motorcycle_id: null, privacy_level: "public", shared_event_id: null, shared_relato_id: r.id,
      is_pinned: 0, respect_count: 0, comment_count: 0, created_at: createdAt,
    };
    await collections.posts.doc(postId.toString()).set(postData);
    try {
      db.prepare("INSERT OR IGNORE INTO posts (id, user_id, content, image_url, privacy_level, shared_relato_id, created_at) VALUES (?, ?, ?, ?, 'public', ?, ?)")
        .run(postId, r.authorId, r.title || "", imageUrl, r.id, createdAt);
    } catch (e) { /* mirror */ }
  } catch (e) {
    console.error("projectRelatoToFeed failed:", e);
  }
}

async function removeRelatoFeedPost(relatoId: string): Promise<void> {
  try {
    const snap = await collections.posts.where("shared_relato_id", "==", relatoId).get();
    for (const d of snap.docs) await d.ref.delete();
  } catch (e) { /* best effort */ }
  try { db.prepare("DELETE FROM posts WHERE shared_relato_id = ?").run(relatoId); } catch (e) { /* mirror */ }
}

async function ensureSqliteUserExists(userId: number | string) {
  const parsedId = isNaN(Number(userId)) ? userId : Number(userId);
  const userExists = db.prepare("SELECT 1 FROM users WHERE id = ?").get(parsedId);
  if (!userExists) {
    try {
      const userDoc = await collections.users.doc(userId.toString()).get();
      if (userDoc.exists) {
        const u = userDoc.data() as any;
        db.prepare(`INSERT INTO users (id, username, email, type, status, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(parsedId, u.username || `user_${parsedId}`, u.email || `user${parsedId}@example.com`, u.type || 'rider', 'active', 'user', new Date().toISOString());
      } else {
        db.prepare(`INSERT INTO users (id, username, email, type, status, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(parsedId, `user_${parsedId}`, `user${parsedId}@example.com`, 'rider', 'active', 'user', new Date().toISOString());
      }
    } catch(e) {
      console.error("Error setting up missing sqlite user:", e);
    }
  }
}

// SQLite-first user lookups with Firestore fallback. Use these instead of
// querying collections.users directly: Turso is the source of truth for users
// (it survived the Firebase project migration; Firestore was reset). Firestore
// remains a fallback so legacy / dual-written rows still resolve.
const isPermissionDeniedErr = (e: any) =>
  typeof e?.message === "string" && e.message.includes("PERMISSION_DENIED");

// Purge a user from Firestore on account deletion. Without this, login and
// authenticateToken fall back to Firestore and re-hydrate the Turso row — the
// account "comes back" even after DELETE FROM users. Deleting the `users` doc is
// the critical step (it kills both resurrection paths); owned content is cleaned
// up best-effort so we don't leave the deleted user's data live.
async function deleteUserFromFirestore(userId: number | string) {
  const idStr = userId.toString();

  // Docs keyed directly by the user id (deterministic). The users doc is the one
  // that matters for resurrection; the rest are the user's own mirror rows.
  for (const ref of [
    collections.users.doc(idStr),
    collections.riders.doc(idStr),
    collections.ecosystems.doc(idStr),
    collections.ambassadors.doc(idStr),
  ]) {
    try {
      await ref.delete();
    } catch (e: any) {
      if (!isPermissionDeniedErr(e)) console.warn(`Firestore delete failed for ${ref.path}:`, e.message);
    }
  }

  // Owned/related docs found by query. Best-effort and batched; a failure here
  // must not block account deletion (the users doc above is already gone).
  // user_id is stored as a number for self-created rows, so query by the numeric
  // id and its string form to cover dual-written documents.
  const idVariants = [userId, idStr].filter((v, i, a) => a.indexOf(v) === i);
  const queries = idVariants.flatMap((id) => [
    collections.events.where("user_id", "==", id),
    collections.posts.where("user_id", "==", id),
    collections.event_rsvps.where("user_id", "==", id),
    collections.followers.where("user_id", "==", id),
    collections.followers.where("follower_id", "==", id),
    collections.notifications.where("user_id", "==", id),
    collections.post_likes.where("user_id", "==", id),
    collections.comments.where("user_id", "==", id),
  ]);
  for (const q of queries) {
    try {
      const snap = await q.get();
      let batch = firestore.batch();
      let n = 0;
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
        if (++n % 400 === 0) {
          await batch.commit();
          batch = firestore.batch();
        }
      }
      if (n % 400 !== 0) await batch.commit();
    } catch (e: any) {
      if (!isPermissionDeniedErr(e)) console.warn("Firestore owned-doc cleanup failed:", e.message);
    }
  }
}

async function findUserByUsername(username: string): Promise<any | null> {
  if (!username) return null;
  const sq = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
  if (sq) return sq;
  try {
    const snap = await collections.users.where("username", "==", username).limit(1).get();
    if (!snap.empty) {
      const raw = snap.docs[0].data() as any;
      const id = isNaN(Number(snap.docs[0].id)) ? snap.docs[0].id : Number(snap.docs[0].id);
      return { id, ...raw };
    }
  } catch (e: any) {
    if (!isPermissionDeniedErr(e)) console.warn("findUserByUsername Firestore fallback failed:", e.message);
  }
  return null;
}

async function findUserByEmail(email: string): Promise<any | null> {
  if (!email) return null;
  const sq = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
  if (sq) return sq;
  try {
    const snap = await collections.users.where("email", "==", email).limit(1).get();
    if (!snap.empty) {
      const raw = snap.docs[0].data() as any;
      const id = isNaN(Number(snap.docs[0].id)) ? snap.docs[0].id : Number(snap.docs[0].id);
      return { id, ...raw };
    }
  } catch (e: any) {
    if (!isPermissionDeniedErr(e)) console.warn("findUserByEmail Firestore fallback failed:", e.message);
  }
  return null;
}

async function findUserById(userId: number | string): Promise<any | null> {
  if (userId === undefined || userId === null) return null;
  const parsedId = isNaN(Number(userId)) ? userId : Number(userId);
  const sq = db.prepare("SELECT * FROM users WHERE id = ?").get(parsedId) as any;
  if (sq) return sq;
  try {
    const doc = await collections.users.doc(userId.toString()).get();
    if (doc.exists) {
      return { id: parsedId, ...(doc.data() as any) };
    }
  } catch (e: any) {
    if (!isPermissionDeniedErr(e)) console.warn("findUserById Firestore fallback failed:", e.message);
  }
  return null;
}

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
  bloodType: z.string().max(5).optional(),
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
const tursoUrl = process.env.TURSO_DB_URL;
const tursoToken = process.env.TURSO_DB_AUTH_TOKEN;

// Connection mode: REMOTE (no local replica).
// We previously used embedded replicas (`syncUrl`), but they produced write divergence —
// libsql 0.5.x applies writes locally first, propagates to Turso async, and if Turso
// rejects (e.g. FK between same-txn rows because the prior write hasn't synced yet),
// the local replica reverts both writes. Net effect: orphan rows in some tables,
// silent data loss in others, and PRAGMA settings not reaching the Turso server.
// Remote mode trades ~50ms per query for actual atomicity and correct enforcement.
function createDb() {
  if (tursoUrl) {
    // @ts-expect-error libsql 0.5.x accepts { authToken } but its Options type doesn't declare it.
    return new Database(tursoUrl, { authToken: tursoToken });
  }
  return new Database(isProd ? '/tmp/cafe777.db' : 'cafe777.db');
}

// Turso closes idle Hrana streams after a period of inactivity (common on Cloud Run
// when scaled to zero). Detect that error so the middleware can reconnect.
function isHranaStreamError(e: any): boolean {
  const msg = String(e?.message ?? e);
  return msg.includes('stream not found') || (msg.includes('Hrana') && msg.includes('404'));
}

// libsql 0.5.x embedded replicas don't preserve multi-statement transactions across
// the Hrana protocol — each write auto-commits server-side, so BEGIN/COMMIT become
// effectively no-ops. The built-in wrapper also swallows the original error when
// ROLLBACK fails. This patch:
//   1) surfaces the real error from the transaction body (not the rollback's),
//   2) tolerates "no transaction is active" on COMMIT/ROLLBACK (auto-commit reality).
// Note: this means we lose true atomicity with embedded replicas. Partial-failure
// recovery relies on the boot-time orphan cleanup above and idempotent writes.
const isNoActiveTxnError = (err: any) =>
  typeof err?.message === "string" && err.message.includes("no transaction is active");

function patchDbTransaction() {
  (db as any).transaction = function (fn: (...args: any[]) => any) {
    if (typeof fn !== "function") throw new TypeError("Expected first argument to be a function");
    const wrap = (mode: string) => (...args: any[]) => {
      // Re-apply PRAGMA before BEGIN: Turso may silently recreate the Hrana stream
      // after idle shutdown, losing the session-scoped PRAGMA foreign_keys = OFF.
      try { db.exec("PRAGMA foreign_keys = OFF;"); } catch {}
      try { db.exec(`BEGIN${mode ? " " + mode : ""}`); } catch (beginErr) {
        if (!isNoActiveTxnError(beginErr)) throw beginErr;
      }
      let result: any;
      try {
        result = fn(...args);
      } catch (originalErr) {
        try { db.exec("ROLLBACK"); } catch (rollbackErr) {
          if (!isNoActiveTxnError(rollbackErr)) {
            console.error("ROLLBACK failed (suppressed, propagating original error):", rollbackErr);
          }
        }
        throw originalErr;
      }
      try { db.exec("COMMIT"); } catch (commitErr) {
        if (!isNoActiveTxnError(commitErr)) throw commitErr;
        // Auto-committed by libsql remote mode — writes are already persisted.
      }
      return result;
    };
    const base: any = wrap("");
    base.default = base;
    base.deferred = wrap("DEFERRED");
    base.immediate = wrap("IMMEDIATE");
    base.exclusive = wrap("EXCLUSIVE");
    base.database = db;
    return base;
  };
}

let db: any = createDb();

function reconnectDb() {
  try { db.close(); } catch {}
  db = createDb();
  db.exec("PRAGMA foreign_keys = OFF;");
  patchDbTransaction();
  console.log("Turso stream reconnected.");
}

if (tursoUrl) {
  console.log(`Turso (remote mode) connected to ${tursoUrl}`);
} else {
  console.log(`Local-only SQLite (TURSO_DB_URL not set — data will not persist across restarts in production)`);
}

// FK enforcement OFF to match the original better-sqlite3 default the codebase was built on.
// In remote mode this PRAGMA now actually reaches the Turso server (unlike embedded replica).
db.exec("PRAGMA foreign_keys = OFF;");
patchDbTransaction();

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
const upload = multer({ 
  storage: multer.memoryStorage(),
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

const uploadToFirebase = async (file: any, folder: string = "uploads"): Promise<string> => {
  if (!file) return "";
  const originalName = file.originalname || "image.jpg";
  const safeName = originalName.replace(/[^a-zA-Z0-9.]/g, "_");
  const fileName = `${Date.now()}-${safeName}`;
  const firebasePath = `${folder}/${fileName}`;
  
  if (!bucket) {
    throw new Error("Firebase storage bucket is not initialized.");
  }

  const downloadToken = crypto.randomUUID();
  const blob = bucket.file(firebasePath);
  const blobStream = blob.createWriteStream({
    metadata: {
      contentType: file.mimetype,
      metadata: {
        // Embeds a stable download token so the URL works in <img> tags
        // without requiring public bucket access or storage rules changes.
        firebaseStorageDownloadTokens: downloadToken
      }
    },
    resumable: false
  });

  return await new Promise<string>((resolve, reject) => {
    blobStream.on('error', (err) => {
      console.error("Firebase upload error:", err.message);
      reject(err);
    });
    blobStream.on('finish', () => {
      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/${encodeURIComponent(blob.name)}?alt=media&token=${downloadToken}`;
      resolve(publicUrl);
    });
    blobStream.end(file.buffer);
  });
};


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
    blood_type TEXT,
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

  CREATE TABLE IF NOT EXISTS oil_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    motorcycle_id INTEGER NOT NULL,
    km INTEGER NOT NULL,
    oil_type TEXT,
    liters REAL,
    shop TEXT,
    shop_ref TEXT,
    note TEXT,
    record_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS refuelings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    motorcycle_id INTEGER NOT NULL,
    km INTEGER NOT NULL,
    liters REAL NOT NULL,
    fuel_type TEXT,
    full_tank INTEGER DEFAULT 1,
    price_per_liter REAL,
    total_value REAL,
    note TEXT,
    record_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
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

  CREATE TABLE IF NOT EXISTS keywords_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_name TEXT NOT NULL,
    keywords TEXT NOT NULL,
    radius INTEGER DEFAULT 5000,
    icon TEXT
  );

  CREATE TABLE IF NOT EXISTS places_cache (
    place_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    rating REAL DEFAULT 0,
    reviews INTEGER DEFAULT 0,
    category TEXT,
    source_keyword TEXT,
    city TEXT,
    details TEXT,
    full_address TEXT,
    source TEXT,
    last_fetched DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS places_control (
    place_id TEXT PRIMARY KEY,
    is_approved INTEGER DEFAULT 0,
    is_hidden INTEGER DEFAULT 0,
    needs_revision INTEGER DEFAULT 0
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

  CREATE TABLE IF NOT EXISTS invite_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    sponsor_id INTEGER NOT NULL,
    is_used INTEGER DEFAULT 0,
    used_by_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sponsor_id) REFERENCES ambassadors(user_id) ON DELETE CASCADE,
    FOREIGN KEY(used_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS club_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    permissions TEXT DEFAULT '[]',
    hierarchy_order INTEGER DEFAULT 0,
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
    needs_revision INTEGER DEFAULT 0
  );

  -- Relatos de Estrada (Fase 0). SQLite mirror of the Firestore relatos source
  -- of truth; only approved/featured relatos are written here (in Fase 2 approve).
  -- JSON-encoded TEXT columns hold extensible maps (structured_fields, media, etc.).
  CREATE TABLE IF NOT EXISTS relatos (
    id TEXT PRIMARY KEY,
    author_id INTEGER NOT NULL,
    author_name TEXT,
    anchor_type TEXT NOT NULL,            -- 'place' | 'route'
    anchor_id TEXT NOT NULL,
    title TEXT,
    body TEXT,                            -- sanitized narrative; rendered as plain text
    narrative_parts TEXT,                 -- JSON
    structured_fields TEXT,               -- JSON (moto-native place attributes)
    media TEXT,                           -- JSON array of {type,url,storageRef}
    moto_used TEXT,                       -- JSON {motoId, snapshot}
    external_links TEXT,                  -- JSON array of {kind,url,resolved*}
    verification_level TEXT,              -- SERVER-ASSIGNED
    verification_evidence TEXT,           -- JSON audit trail
    status TEXT NOT NULL DEFAULT 'pending',
    quality_saves INTEGER DEFAULT 0,
    quality_helpful_votes INTEGER DEFAULT 0,
    quality_editorial_picks INTEGER DEFAULT 0,
    featured_at DATETIME,
    featured_until DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_edited_at DATETIME,
    resubmitted_at DATETIME,
    approved_at DATETIME,
    schema_version INTEGER DEFAULT 1
  );

  -- Gamification (Fase 4). Contribution stats for the "Guia" title. Derived from
  -- approved relatos; recomputable, but maintained incrementally on moderation.
  CREATE TABLE IF NOT EXISTS relato_author_stats (
    user_id INTEGER PRIMARY KEY,
    relatos_approved INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    title TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Per-moto mini-passport. Keyed by moto_id but NOT FK-constrained, and carries a
  -- make/model/year snapshot so the history survives the moto being edited/removed
  -- from the Garagem. Aggregates ONLY discrete events (relatos/places) — never km,
  -- speed or frequency.
  CREATE TABLE IF NOT EXISTS moto_relato_stats (
    moto_id INTEGER PRIMARY KEY,
    owner_id INTEGER,
    make TEXT,
    model TEXT,
    year INTEGER,
    relatos_approved INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    place_ids TEXT,                       -- JSON array of distinct place anchorIds
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Route entity (sister of place). Modeled in Fase 0, built in Fase 5. Distinct
  -- from the existing discovered_routes (the scenic-roads discovery feature).
  CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY,
    name TEXT,
    geometry TEXT,                        -- JSON {start,end,waypoints[]}
    polyline TEXT,                        -- derived from routing, not raw breadcrumb
    gpx_ref TEXT,                         -- storage ref of imported GPX
    distance_meters REAL,
    surface_types TEXT,                   -- JSON array
    difficulty TEXT,                      -- 'leve' | 'media' | 'pesada'
    privacy_level TEXT NOT NULL DEFAULT 'private',  -- 'public'|'community'|'private'
    origin TEXT,                          -- 'user_submitted' | 'curated'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    schema_version INTEGER DEFAULT 1
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
  db.prepare("ALTER TABLE places_control ADD COLUMN needs_revision INTEGER DEFAULT 0").run();
} catch (e) {}

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
try {
  db.prepare("ALTER TABLE places_cache ADD COLUMN import_batch_id TEXT").run();
} catch (e) { /* Column might already exist */ }

// Relatos de Estrada (Fase 0): durable place-level metadata lives on places_control
// (NOT places_cache, which is the volatile Google/OSM cache rewritten via
// INSERT OR REPLACE on every refresh). The Firestore places_control doc is the
// source of truth (written with { merge: true }); these SQLite columns are the
// mirror. NOTE for Fase 2: increment relato_count and write moto_attributes via a
// targeted UPDATE / UPSERT (ON CONFLICT DO UPDATE) — the existing bulk-import and
// cleanup-agent `INSERT OR REPLACE INTO places_control (...)` statements only list
// the three control flags and would otherwise reset these columns.
try { db.prepare("ALTER TABLE places_control ADD COLUMN moto_attributes TEXT").run(); } catch (e) { /* exists */ }
try { db.prepare("ALTER TABLE places_control ADD COLUMN origin TEXT").run(); } catch (e) { /* exists */ }
try { db.prepare("ALTER TABLE places_control ADD COLUMN relato_count INTEGER DEFAULT 0").run(); } catch (e) { /* exists */ }
try { db.prepare("ALTER TABLE places_control ADD COLUMN schema_version INTEGER DEFAULT 1").run(); } catch (e) { /* exists */ }
// Relatos de Estrada — route owner (Fase 5), for private-route access checks.
try { db.prepare("ALTER TABLE routes ADD COLUMN created_by INTEGER").run(); } catch (e) { /* exists */ }

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
try {
  // Marks whether a user finished onboarding. DEFAULT 1 so every pre-existing user is
  // treated as onboarded; new Google accounts are inserted with 0 (see /api/auth/google)
  // until they complete onboarding — so an abandoned Google sign-up is never mistaken for
  // a finished rider profile, and is routed back to onboarding on the next login.
  db.exec("ALTER TABLE users ADD COLUMN onboarding_complete INTEGER DEFAULT 1;");
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
  db.exec("ALTER TABLE posts ADD COLUMN shared_relato_id TEXT;");
} catch (e) {
  // Ignore if column already exists (Relatos de Estrada feed projection — Fase 3)
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

// Per-moto oil-change alert config (Garagem premium module).
try {
  db.exec("ALTER TABLE motorcycles ADD COLUMN oil_alert_active INTEGER DEFAULT 0;");
} catch (e) {}
try {
  db.exec("ALTER TABLE motorcycles ADD COLUMN oil_alert_interval_km INTEGER;");
} catch (e) {}
try {
  db.exec("ALTER TABLE motorcycles ADD COLUMN oil_alert_interval_months INTEGER;");
} catch (e) {}
try {
  db.exec("ALTER TABLE motorcycles ADD COLUMN oil_alert_updated_at TEXT;");
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

try {
  db.exec("ALTER TABLE events ADD COLUMN price TEXT;");
} catch (e) {}

try {
  db.exec("ALTER TABLE events ADD COLUMN external_link TEXT;");
} catch (e) {}

try {
  db.exec("ALTER TABLE events ADD COLUMN price_starting_from INTEGER DEFAULT 0;");
} catch (e) {}
try {
  db.exec("ALTER TABLE events ADD COLUMN source_type TEXT DEFAULT 'internal';");
} catch (e) {}
try {
  db.exec("ALTER TABLE events ADD COLUMN source_name TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE events ADD COLUMN created_by_user_id TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE events ADD COLUMN ingested_at TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE events ADD COLUMN is_verified INTEGER DEFAULT 0;");
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

try {
  db.exec("ALTER TABLE riders ADD COLUMN blood_type TEXT;");
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

// Boot-time cleanup: remove orphan riders/ecosystems whose user_id has no matching users row.
// These are residuals from libsql 0.5.x partial rollbacks (see db.transaction monkey-patch above).
// FK enforcement is OFF (intentional), so orphans accumulate silently otherwise.
try {
  const orphanRiders = db.prepare("DELETE FROM riders WHERE user_id NOT IN (SELECT id FROM users)").run();
  const orphanEcosystems = db.prepare("DELETE FROM ecosystems WHERE user_id NOT IN (SELECT id FROM users)").run();
  if (orphanRiders.changes > 0 || orphanEcosystems.changes > 0) {
    console.log(`Boot cleanup: removed ${orphanRiders.changes} orphan riders, ${orphanEcosystems.changes} orphan ecosystems`);
  }
} catch (e) {
  console.error("Orphan cleanup error:", e);
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

// Default app settings (idempotent). Always runs.
([
  ["fullscreen_enabled", "true"],
  ["feature_create_event", "freemium"],
  ["feature_promote_event", "premium"],
  ["feature_create_motoclub", "premium"],
  ["feature_promote_photo_contest", "premium"],
  // Garagem module: refueling CRUD is freemium; oil module, general economy,
  // cost-per-km and the oil-change alert are premium.
  ["feature_refuel_records", "freemium"],
  ["feature_oil_change_records", "premium"],
  ["feature_fuel_economy_general", "premium"],
  ["feature_cost_per_km", "premium"],
  ["feature_oil_change_alert", "premium"],
  ["photo_contest_enabled", "true"],
  ["photo_contest_allowed_types", JSON.stringify(['premium'])],
  ["api_google_maps", "true"],
  ["api_osm", "true"],
] as [string, string][]).forEach(([k, v]) => insertSetting.run(k, v));

// Mock seed (28+ users, 50 ecosystems, motos with "Oil Change" logs, etc.)
// disabled. Real data only — comes from /api/register and /api/auth/google.
if (false as boolean) {
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

  // 6. Thomaz Capilla - Owner / Admin
  const tcap = insertUser.run("tomcapilla_owner", "thomaz.capilla@gmail.com", "password123", "rider", "https://picsum.photos/seed/tomcapilla_owner/200/200", "admin", "active", "TOMCAPILLA", null, "premium", 0, "Thomaz Capilla", "Unknown", "Platform Owner", null, null, null, null, null, "TOMCAPILLA").lastInsertRowid;
  insertRider.run(tcap, "Thomaz Capilla", null, null);
  
  // 6b. Thomaz Capila - Owner / Admin (added single L spelling just in case login uses this)
  const tcap2 = insertUser.run("tomcapila_owner", "thomaz.capila@gmail.com", "password123", "rider", "https://picsum.photos/seed/tomcapila_owner/200/200", "admin", "active", "TOMCAPILA", null, "premium", 0, "Thomaz Capila", "Unknown", "Platform Owner", null, null, null, null, null, "TOMCAPILA").lastInsertRowid;
  insertRider.run(tcap2, "Thomaz Capila", null, null);

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
}

const updateAmbassadorReputation = async (userId: number | string) => {
  try {
    const ambassadorSnapshot = await collections.ambassadors.doc(userId.toString()).get();
    if (!ambassadorSnapshot.exists) return;

    // 1. Stamps issued
    const stampsIssuedSnapshot = await collections.user_passport_stamps.where("ambassador_id", "==", userId).get();
    const stampsIssued = stampsIssuedSnapshot.size;

    // 2. Events hosted
    const eventsHostedSnapshot = await collections.events.where("user_id", "==", userId).get();
    const eventsHosted = eventsHostedSnapshot.size;

    // 3. Average rating (if ecosystem)
    let ratingScore = 0;
    const ecoSnapshot = await collections.ecosystems.doc(userId.toString()).get();
    if (ecoSnapshot.exists) {
      const rating = db.prepare("SELECT average_rating FROM rating_summaries WHERE target_type = 'ecosystem' AND target_id = ?").get(userId) as any;
      if (rating) {
        ratingScore = Math.floor(rating.average_rating * 10); // 4.5 -> 45
      }
    }

    // 4. Successful Invites
    let successfulInvites = 0;
    try {
      successfulInvites = db.prepare("SELECT COUNT(*) as count FROM invite_links WHERE sponsor_id = ? AND is_used = 1").get(userId).count;
    } catch(err) {}

    // Calculate total reputation
    const totalReputation = stampsIssued + (eventsHosted * 10) + ratingScore + (successfulInvites * 20);

    await collections.ambassadors.doc(userId.toString()).set({
      reputation_score: totalReputation,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Dual-write to SQLite
    try {
      db.prepare("UPDATE ambassadors SET reputation_score = ? WHERE user_id = ?").run(totalReputation, userId);
    } catch (sqe) {}
    
  } catch (err) {
    console.error("Failed to update ambassador reputation in Firestore/SQLite:", err);
  }
};

// Automation logic
function checkContests() {
  try {
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
  } catch (error) {
    if ((error as any).message && !(error as any).message.includes('no such table')) {
      console.error("Error in checkContests automated task:", error);
    }
  }
}

// Run check every minute
setInterval(checkContests, 60000);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Trust proxy for rate limiting behind Cloud Run/Nginx
  app.set('trust proxy', 1);

  // Security Headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:", "https:", "http:"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://maps.googleapis.com"],
        "connect-src": [
          "'self'",
          "https://maps.googleapis.com",
          "https://*.googleapis.com",
          // Vite HMR WebSocket — needed in dev, blocked in prod to reduce attack surface.
          ...(isProd ? [] : ["ws://localhost:*", "wss://localhost:*"]),
        ],
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

  // Reconnect Turso if the Hrana stream expired (e.g. after Cloud Run idle scale-down).
  app.use('/api', (_req, _res, next) => {
    if (tursoUrl) {
      try {
        db.exec("SELECT 1");
      } catch (e) {
        if (isHranaStreamError(e)) reconnectDb();
      }
    }
    next();
  });

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

  const checkAmbassador = async (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    let ambassador = db.prepare("SELECT user_id FROM ambassadors WHERE user_id = ? AND is_active = 1").get(req.user.id);
    
    if (!ambassador) {
       try {
         const doc = await collections.ambassadors.doc(req.user.id.toString()).get();
         if (doc.exists && doc.data()?.is_active) {
            ambassador = { user_id: req.user.id };
         }
       } catch(e) {}
    }

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
  const authenticateToken = async (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
      console.log(`Auth failed: Missing token [${req.method} ${req.path}]`);
      return res.status(401).json({ error: "Unauthorized: Missing token" });
    }

    try {
      const user: any = await new Promise((resolve, reject) => {
        jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
          if (err) reject(err);
          else resolve(decoded);
        });
      });

      // Try SQLite first as it's faster and works without permissions in this environment
      let dbUser: any = db.prepare("SELECT id, username, role, plan, type FROM users WHERE id = ?").get(user.id) as any;

      if (!dbUser) {
        // Fallback to Firestore if not found in SQLite — 4s timeout so a slow/down
        // Firestore never blocks authenticated requests indefinitely.
        try {
          const fsTimeout = new Promise<null>((_, r) => setTimeout(() => r(new Error('timeout')), 4000));
          const firestoreUser = await Promise.race([
            collections.users.doc(user.id?.toString()).get(),
            fsTimeout
          ]) as any;
          if (firestoreUser && firestoreUser.exists) {
            dbUser = { id: user.id, ...firestoreUser.data() };
            ensureSqliteUserExists(user.id).catch(() => {});
          }
        } catch (firestoreErr: any) {
          if (!firestoreErr.message?.includes('PERMISSION_DENIED') && firestoreErr.message !== 'timeout') {
            console.warn(`Firestore user fetch failed in authenticateToken:`, firestoreErr.message);
          }
        }
      }

      if (!dbUser) {
        return res.status(401).json({ error: "Unauthorized: User no longer exists" });
      }
      req.user = dbUser;
      next();
    } catch (err: any) {
      return res.status(401).json({ error: `Unauthorized: Invalid or expired token (${err.message})` });
    }
  };

  const checkFeatureAccess = (feature: string) => {
    return async (req: any, res: any, next: any) => {
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
  app.get(['/auth/callback', '/auth/callback/'], (req, res) => {
    res.send(`
      <html>
        <head><title>Authenticating...</title></head>
        <body>
          <script>
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const idToken = params.get('id_token') || new URLSearchParams(window.location.search).get('credential');
            
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', credential: idToken }, '*');
              window.close();
            } else {
              window.location.href = '/login';
            }
          </script>
          <p>Authentication complete. You can close this window.</p>
        </body>
      </html>
    `);
  });

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
      let user: any = null;
      let isNewUser = false;
      
      // SQLite first (source of truth post-Firebase-migration), Firestore fallback.
      user = db.prepare("SELECT * FROM users WHERE google_id = ? OR email = ?").get(googleId, email) as any;

      if (!user) {
        try {
          const fsUserSnap = await collections.users.where("google_id", "==", googleId).limit(1).get();
          if (!fsUserSnap.empty) {
            user = { id: parseInt(fsUserSnap.docs[0].id), ...fsUserSnap.docs[0].data() };
          } else {
            const fsEmailSnap = await collections.users.where("email", "==", email).limit(1).get();
            if (!fsEmailSnap.empty) {
              user = { id: parseInt(fsEmailSnap.docs[0].id), ...fsEmailSnap.docs[0].data() };
            }
          }
        } catch (e: any) {
          if (!isPermissionDeniedErr(e)) console.warn("Firestore Google lookup failed:", e.message);
        }

        if (user) {
          // Hydrate SQLite from Firestore.
          try {
            db.prepare("INSERT OR REPLACE INTO users (id, username, email, google_id, role, type, profile_picture_url, status, fullName, referral_code, referralCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
              user.id, user.username, user.email, googleId, user.role || 'user', user.type || 'rider', picture || user.profile_picture_url || null, user.status || 'active', name || user.fullName || null, user.referral_code || null, user.referralCode || null
            );
          } catch (e) {}
        }
      }

      if (!user) {
        // Create new user
        isNewUser = true;
        const username = email.split('@')[0] + Math.floor(Math.random() * 1000);
        const newReferralCode = `GOOGLE_${googleId.substring(0, 8)}`.toUpperCase();
        // `type` is NOT NULL CHECK(rider|ecosystem), so we store a placeholder — it is
        // meaningless until onboarding sets the real type. onboarding_complete=0 marks the
        // account as not-yet-onboarded, so it is routed back to onboarding on every login
        // until finished. We intentionally do NOT create a `riders` row here: onboarding
        // creates the correct detail row (riders OR ecosystems) once a profile type is
        // chosen, so a user who selects "Empresa" is never left with a stray rider identity.
        const result = db.prepare("INSERT INTO users (username, email, google_id, type, profile_picture_url, status, fullName, referral_code, referralCode, onboarding_complete) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)").run(
          username,
          email,
          googleId,
          'rider', // placeholder; the real type is chosen in onboarding
          picture || null,
          'active',
          name || null,
          newReferralCode,
          newReferralCode
        );

        const userId = result.lastInsertRowid;
        user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
      } else if (!user.google_id) {
        // Link Google ID to existing email account
        db.prepare("UPDATE users SET google_id = ? WHERE id = ?").run(googleId, user.id);
        user.google_id = googleId;
      }

      if (user.status !== 'active') {
        return res.status(403).json({ error: `Account is ${user.status}` });
      }

      // Route to onboarding not only for brand-new accounts, but also for any Google user
      // whose onboarding never completed (picked a type but abandoned it, or hit an older
      // buggy build). Otherwise they'd be stuck forever on the placeholder rider profile,
      // unable to finish signing up as a rider or a business.
      const needsOnboarding = isNewUser || !user.onboarding_complete;

      // Don't return the password
      const { password: _, ...userInfo } = user;

      // Generate JWT
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role, plan: user.PLAN ?? user.plan }, JWT_SECRET, { expiresIn: '24h' });

      res.json({
        user: userInfo,
        token,
        isNewUser: needsOnboarding,
        googleData: needsOnboarding ? { email, name, picture, username: user.username } : null
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
      const _t0 = Date.now();
      // SQLite is the source of truth for users (it survived the Firebase
      // project migration; Firestore was reset). Check Turso first, then fall
      // back to Firestore for legacy / dual-written rows.
      let user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
      console.log(`[login] Turso query: ${Date.now()-_t0}ms found=${!!user}`);
      let foundInFirestore = false;

      if (!user) {
        const _t1 = Date.now();
        try {
          const timeout = new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
          const firestoreUserSnap = await Promise.race([
            collections.users.where("email", "==", email).limit(1).get(),
            timeout
          ]) as any;
          if (firestoreUserSnap && !firestoreUserSnap.empty) {
            user = { id: firestoreUserSnap.docs[0].id, ...firestoreUserSnap.docs[0].data() };
            foundInFirestore = true;
          }
        } catch (fsError: any) {
          if (!isPermissionDeniedErr(fsError) && fsError?.message !== 'timeout') {
            console.error("Firestore user fetch failed:", fsError);
          }
        }
        console.log(`[login] Firestore fallback: ${Date.now()-_t1}ms found=${!!user}`);
      }

      if (foundInFirestore && user) {
        // Hydrate SQLite so subsequent lookups are local.
        try {
          db.prepare("INSERT OR REPLACE INTO users (id, username, email, password, google_id, role, type, profile_picture_url, status, fullName, referral_code, referralCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
            parseInt(user.id), user.username, user.email, user.password || null, user.google_id || null, user.role || 'user', user.type || 'rider', user.profile_picture_url || null, user.status || 'active', user.fullName || null, user.referral_code || null, user.referralCode || null
          );
        } catch (e) {}
      } else if (user) {
        // Found in SQLite — best-effort sync to Firestore; fire-and-forget so it
        // never blocks the login response even if Firestore is slow/rate-limiting.
        collections.users.doc(user.id.toString()).set({
          ...user,
          interests: user.interests ? user.interests.split(',') : [],
          services: user.services ? user.services.split(',') : [],
          created_at: user.created_at || new Date().toISOString()
        }).catch((migError: any) => {
          if (!isPermissionDeniedErr(migError)) {
            console.error("Auto-migration to Firestore failed:", migError);
          }
        });
      }

      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (!user.password) {
        return res.status(401).json({ error: "Please login with Google or reset your password." });
      }

      // Check if password is hashed (starts with $2a$ or $2b$ or $2y$)
      const isHashed = user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$');
      
      let passwordMatch = false;
      const _tb = Date.now();
      if (isHashed) {
        passwordMatch = await bcrypt.compare(password, user.password);
      } else {
        passwordMatch = user.password === password;
        if (passwordMatch) {
          const hashedPassword = await bcrypt.hash(password, 10);
          db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashedPassword, user.id);
        }
      }
      console.log(`[login] bcrypt: ${Date.now()-_tb}ms match=${passwordMatch}`);

      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (user.status !== 'active') {
        return res.status(403).json({ error: `Account is ${user.status}` });
      }

      const { password: _, ...userInfo } = user;
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role, plan: user.PLAN ?? user.plan }, JWT_SECRET, { expiresIn: '24h' });
      console.log(`[login] total: ${Date.now()-_t0}ms`);
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

  app.get("/api/contests/active", async (req, res) => {
    try {
      const now = new Date().toISOString();
      const snapshot = await collections.contests
        .where("status", "==", "active")
        .orderBy("start_date", "desc")
        .get();
      
      const filteredDocs = snapshot.docs.filter(doc => {
        const data = doc.data();
        return now >= data.start_date && now <= data.end_date;
      });

      const contests = await Promise.all(filteredDocs.map(async (doc) => {
        const contest = doc.data() as any;
        let badgeData: { name: any; icon: any } = { name: null, icon: null };
        if (contest.prize_badge_id) {
          const badgeDoc = await collections.badges.doc(contest.prize_badge_id.toString()).get();
          if (badgeDoc.exists) {
            const b = badgeDoc.data() as any;
            badgeData = { name: b.name, icon: b.icon };
          }
        }
        return { id: doc.id, ...contest, prize_badge_name: badgeData.name, prize_badge_icon: badgeData.icon };
      }));
      res.json(contests);
    } catch (error: any) {
      console.error("Error fetching active contests from Firestore:", error);
      // Fallback
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
      } catch (sqe) {
        res.status(500).json({ error: error.message });
      }
    }
  });

  app.post("/api/contests/:id/submissions", authenticateToken, upload.single('photo'), async (req: any, res) => {
    const { user_id, motorcycle_id, description } = req.body;
    const contest_id = req.params.id;
    let photo_url = null;

    if (req.file) {
      try {
        photo_url = await uploadToFirebase(req.file, "contest_submissions");
      } catch (err) {
        return res.status(500).json({ error: "Failed to upload photo" });
      }
    }

    if (!user_id || !photo_url) {
      return res.status(400).json({ error: "User ID and photo are required" });
    }
    
    if (user_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only submit for yourself" });
    }

    try {
      // Verify contest is active in Firestore
      const contestDoc = await collections.contests.doc(contest_id).get();
      if (!contestDoc.exists) return res.status(404).json({ error: "Contest not found" });
      const contest = contestDoc.data() as any;
      
      const now = new Date().toISOString();
      if (contest.status !== 'active' || now < contest.start_date || now > contest.end_date) {
        return res.status(400).json({ error: "Active contest not found" });
      }

      // Check if user already submitted in Firestore
      const existingSnapshot = await collections.submissions
        .where("contest_id", "==", Number(contest_id))
        .where("user_id", "==", Number(user_id))
        .limit(1)
        .get();

      if (!existingSnapshot.empty) {
        return res.status(400).json({ error: "You have already submitted a photo for this contest" });
      }

      const submissionId = await getNextId("submissions");
      const submissionData = {
        id: submissionId,
        contest_id: Number(contest_id),
        user_id: Number(user_id),
        motorcycle_id: motorcycle_id ? Number(motorcycle_id) : null,
        photo_url,
        description: description || "",
        votes_count: 0,
        approved: 0,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      };

      await collections.submissions.doc(submissionId.toString()).set(submissionData);

      // Dual-write to SQLite
      try {
        db.prepare(`
          INSERT OR REPLACE INTO submissions (id, contest_id, user_id, motorcycle_id, photo_url, description)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(submissionId, Number(contest_id), Number(user_id), motorcycle_id ? Number(motorcycle_id) : null, photo_url, description || null);
      } catch (sqe) {
        console.error("SQLite dual-write failed for submission:", sqe);
      }

      res.status(201).json({ message: "Submission successful", id: submissionId });
    } catch (error: any) {
      console.error("Error adding submission to Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/contests/:id/submissions", async (req, res) => {
    const contest_id = req.params.id;
    try {
      const contestDoc = await collections.contests.doc(contest_id).get();
      if (!contestDoc.exists) return res.status(404).json({ error: "Contest not found" });
      const contest = { id: contestDoc.id, ...contestDoc.data() as any };

      const snapshot = await collections.submissions
        .where("contest_id", "==", parseInt(contest_id))
        .where("approved", "==", 1)
        .orderBy("created_at", "desc")
        .get();
      
      const submissions = await Promise.all(snapshot.docs.map(async (doc) => {
        const sub = doc.data() as any;
        const userData = (await findUserById(sub.user_id)) || {};
        
        let motoData: { make: any; model: any; year: any } = { make: null, model: null, year: null };
        if (sub.motorcycle_id) {
          const motoDoc = await collections.motorcycles.doc(sub.motorcycle_id.toString()).get();
          if (motoDoc.exists) {
            const m = motoDoc.data() as any;
            motoData = { make: m.make, model: m.model, year: m.year };
          }
        }

        const votesSnapshot = await collections.votes.where("submission_id", "==", parseInt(doc.id)).get();
        
        return {
          id: doc.id,
          ...sub,
          username: (userData as any).username,
          profile_picture_url: (userData as any).profile_picture_url,
          moto_make: motoData.make,
          moto_model: motoData.model,
          moto_year: motoData.year,
          vote_count: votesSnapshot.size
        };
      }));

      res.json({ contest, submissions });
    } catch (error: any) {
      console.error("Error fetching contest submissions from Firestore:", error);
      // Fallback
      try {
        const contest = db.prepare(`
          SELECT * FROM contests WHERE id = ?
        `).get(contest_id) as any;

        if (!contest) {
          return res.status(404).json({ error: "Contest not found" });
        }

        const submissionsList = db.prepare(`
          SELECT s.*, u.username, u.profile_picture_url,
                 m.make as moto_make, m.model as moto_model, m.year as moto_year,
                 (SELECT COUNT(*) FROM votes WHERE submission_id = s.id) as vote_count
          FROM submissions s
          JOIN users u ON s.user_id = u.id
          LEFT JOIN motorcycles m ON s.motorcycle_id = m.id
          WHERE s.contest_id = ? AND s.approved = 1
        `).all(contest_id);

        res.json({ contest, submissions: submissionsList });
      } catch (sqe) {
        res.status(500).json({ error: error.message });
      }
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
  
  app.get("/api/conversations", authenticateToken, (req: any, res) => {
    try {
      console.log("-> /api/conversations HIT, user:", req.user?.id);
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

      console.log("-> /api/conversations fetched sqlite, count:", chats.length);

      // Parse participantIds into an array
      const formattedChats = chats.map(chat => ({
        ...chat,
        participantIds: chat.participantIds ? chat.participantIds.split(',').map(Number) : [],
        unread_count: chat.unread_count || 0
      }));

      console.log("-> /api/conversations formatted chats.");

      res.setHeader('Content-Type', 'application/json');
      res.json(formattedChats);
    } catch (error: any) {
      console.error("Error in GET /api/chats:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/conversations", authenticateToken, async (req: any, res) => {
    const { participantIds, type, title } = req.body;
    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ error: "Participant IDs are required" });
    }

    const numericParticipantIds = Array.from(new Set(participantIds.map(Number)));
    if (!numericParticipantIds.includes(Number(req.user.id))) {
      return res.status(403).json({ error: "Forbidden: You must be a participant to create a chat" });
    }

    try {
      // Ensure users exist in SQLite to satisfy foreign key constraints
      for (const userId of numericParticipantIds) {
        await ensureSqliteUserExists(userId);
      }

      const stmt = db.prepare("INSERT INTO chats (type, title) VALUES (?, ?)");
      const info = stmt.run(type || 'one-on-one', title || null);
      const chatId = info.lastInsertRowid;

      const participantStmt = db.prepare("INSERT OR IGNORE INTO chat_participants (chat_id, user_id) VALUES (?, ?)");
      for (const userId of numericParticipantIds) {
        participantStmt.run(chatId, userId);
      }

      res.status(201).json({ id: chatId });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/conversations/find", authenticateToken, (req: any, res) => {
    const { participantIds } = req.body;
    if (!participantIds || !Array.isArray(participantIds) || participantIds.length !== 2) {
      return res.status(400).json({ error: "Exactly two participant IDs are required for one-on-one chat" });
    }

    const numericParticipantIds = Array.from(new Set(participantIds.map(Number)));
    if (!numericParticipantIds.includes(Number(req.user.id))) {
      return res.status(403).json({ error: "Forbidden: You must be a participant to find a chat" });
    }

    try {
      let chat;
      if (numericParticipantIds.length === 1) {
        chat = db.prepare(`
          SELECT c.id 
          FROM chats c
          WHERE c.type = 'one-on-one'
            AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) = 1
            AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id AND user_id = ?) = 1
          LIMIT 1
        `).get(numericParticipantIds[0]) as any;
      } else {
        chat = db.prepare(`
          SELECT c.id 
          FROM chats c
          WHERE c.type = 'one-on-one'
            AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) = 2
            AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id AND user_id IN (?, ?)) = 2
          LIMIT 1
        `).get(numericParticipantIds[0], numericParticipantIds[1]) as any;
      }

      if (chat) {
        res.json({ id: chat.id });
      } else {
        res.json({ id: null });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/conversations/:id/messages", authenticateToken, (req: any, res) => {
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

  app.post("/api/conversations/:id/messages", authenticateToken, (req: any, res) => {
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

  app.post("/api/conversations/:id/read", authenticateToken, (req: any, res) => {
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

  app.get("/api/user-alerts", authenticateToken, async (req: any, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: "User ID is required" });
    
    if (user_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only view your own notifications" });
    }

    try {
      // Try SQLite first
      const notifications = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC").all(user_id);
      
      // If we have local notifications, return them
      if (notifications.length > 0) {
        return res.json(notifications);
      }

      // Otherwise try Firestore
      try {
        const snapshot = await collections.notifications
          .where("user_id", "==", parseInt(user_id as string))
          .orderBy("created_at", "desc")
          .get();
        const firestoreNotifications = snapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id }));
        res.json(firestoreNotifications);
      } catch (err: any) {
        if (!err.message?.includes('PERMISSION_DENIED')) {
          console.error("Error fetching notifications from Firestore:", err.message);
        }
        res.json([]); // Return empty if both fail
      }
    } catch (err : any) {
      console.error("Error fetching notifications:", err.message);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.post("/api/user-alerts/:id/read", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const numericId = Number(id);
    const isNumericId = !isNaN(numericId) && String(numericId) === id;

    try {
      // SQLite-primary: if the id looks like a SQLite integer, update there directly.
      if (isNumericId) {
        const row = db.prepare("SELECT id, user_id FROM notifications WHERE id = ?").get(numericId) as any;
        if (!row) return res.status(404).json({ error: "Notification not found" });
        if (row.user_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
          return res.status(403).json({ error: "Forbidden: You can only read your own notifications" });
        }
        db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(numericId);
        // Best-effort Firestore sync (won't match by integer id, but harmless)
        try { await collections.notifications.doc(id).update({ is_read: 1 }); } catch (_) {}
        return res.json({ message: "Notification marked as read" });
      }

      // Firestore-primary: id is a Firestore string document id.
      const notifDoc = await collections.notifications.doc(id).get();
      if (!notifDoc.exists) return res.status(404).json({ error: "Notification not found" });

      const notification = notifDoc.data() as any;
      if (notification.user_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: You can only read your own notifications" });
      }

      await collections.notifications.doc(id).update({ is_read: 1 });
      try { db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(id); } catch (_) {}

      res.json({ message: "Notification marked as read" });
    } catch (err) {
      console.error("Error updating notification status:", err);
      res.status(500).json({ error: "Failed to update notification" });
    }
  });

  // Public: Get keywords config
  app.get("/api/keywords", async (req, res) => {
    try {
      const dbKeywords = db.prepare("SELECT * FROM keywords_config").all();
      // Ensure keywords is parsed from JSON string if needed
      const keywords = (dbKeywords as any[]).map((k: any) => ({
        ...k,
        keywords: typeof k.keywords === 'string' ? JSON.parse(k.keywords) : k.keywords
      }));
      res.json(keywords);
    } catch (e) {
      // Postgres or Firestore fallback... wait, this is sqlite.
      // Firestore fallback
      try {
        const snapshot = await collections.keywords_config.get();
        const keywords = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        res.json(keywords);
      } catch (error) {
        console.error("Error fetching keywords API:", error);
        res.status(500).json({ error: "Failed to fetch keywords" });
      }
    }
  });

  // Admin: Get keywords config — SQLite-first for instant response.
  app.get("/api/admin/keywords", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    try {
      const rows = db.prepare("SELECT id, category_name, keywords, radius, icon FROM keywords_config ORDER BY id").all() as any[];
      if (rows.length > 0) {
        return res.json(rows.map(r => ({ ...r, keywords: typeof r.keywords === 'string' ? JSON.parse(r.keywords) : r.keywords })));
      }
      // Fallback to Firestore when SQLite is empty.
      const snapshot = await collections.keywords_config.get();
      res.json(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    } catch (error) {
      console.error("Error fetching keywords config:", error);
      res.status(500).json({ error: "Failed to fetch keywords" });
    }
  });

  // Admin: Create keyword config
  app.post("/api/admin/keywords", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { category_name, keywords, radius, icon } = req.body;
    try {
      const newId = await getNextId("keywords_config");
      const data = { 
        category_name, 
        keywords: Array.isArray(keywords) ? keywords : [], 
        radius: Number(radius) || 5000, 
        icon: icon || 'MapPin' 
      };
      
      await collections.keywords_config.doc(newId.toString()).set(data);
      
      // Dual-write to SQLite for fallback
      try {
        db.prepare("INSERT OR REPLACE INTO keywords_config (id, category_name, keywords, radius, icon) VALUES (?, ?, ?, ?, ?)")
          .run(newId, category_name, JSON.stringify(keywords), radius || 5000, icon);
      } catch (sqError) {
        console.error("SQLite write failed for keywords_config:", sqError);
      }
      
      res.json({ id: newId, ...data });
    } catch (error) {
      console.error("Error creating keyword config:", error);
      res.status(500).json({ error: "Failed to create keyword config" });
    }
  });

  // Admin: Update keyword config
  app.put("/api/admin/keywords/:id", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { category_name, keywords, radius, icon } = req.body;
    try {
      const data = {
        category_name,
        keywords: Array.isArray(keywords) ? keywords : [],
        radius: Number(radius),
        icon
      };
      await collections.keywords_config.doc(req.params.id).set(data, { merge: true });
      
      // Dual-write to SQLite
      try {
        db.prepare("UPDATE keywords_config SET category_name = ?, keywords = ?, radius = ?, icon = ? WHERE id = ?")
          .run(category_name, JSON.stringify(keywords), radius, icon, req.params.id);
      } catch (sqError) {
        console.error("SQLite update failed for keywords_config:", sqError);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating keyword config:", error);
      res.status(500).json({ error: "Failed to update keyword config" });
    }
  });

  // Admin: Delete keyword config
  app.delete("/api/admin/keywords/:id", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    try {
      await collections.keywords_config.doc(req.params.id).delete();
      
      // Delete from SQLite
      try {
        db.prepare("DELETE FROM keywords_config WHERE id = ?").run(req.params.id);
      } catch (sqError) {
        console.error("SQLite delete failed for keywords_config:", sqError);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting keyword config:", error);
      res.status(500).json({ error: "Failed to delete keyword config" });
    }
  });

  // Admin: Get places control — SQLite-first (fast, offline-safe); Firestore fallback only when SQLite is empty.
  app.get("/api/admin/places", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    try {
      const sqlitePlaces = db.prepare(`
        SELECT pc.place_id, pc.name, pc.lat, pc.lng, pc.rating, pc.reviews,
               pc.category, pc.full_address, pc.city,
               COALESCE(ctrl.is_approved, 0)     AS is_approved,
               COALESCE(ctrl.is_hidden, 0)        AS is_hidden,
               COALESCE(ctrl.needs_revision, 0)   AS needs_revision
        FROM   places_cache pc
        LEFT JOIN places_control ctrl ON pc.place_id = ctrl.place_id
        ORDER  BY pc.name
      `).all() as any[];

      if (sqlitePlaces.length > 0) {
        return res.json(sqlitePlaces);
      }

      // SQLite empty — fall back to Firestore with a 8s timeout.
      const fsTimeout = new Promise<null>((_, r) => setTimeout(() => r(new Error('timeout')), 8000));
      const [cacheSnapshot, controlSnapshot] = await Promise.race([
        Promise.all([collections.places_cache.get(), collections.places_control.get()]),
        fsTimeout.then(() => { throw new Error('timeout'); })
      ]) as any;

      const controlsMap = new Map();
      controlSnapshot.docs.forEach((doc: any) => controlsMap.set(doc.id, doc.data()));
      const places = cacheSnapshot.docs.map((doc: any) => ({
        ...doc.data(), ...(controlsMap.get(doc.id) || {}), place_id: doc.id
      }));
      res.json(places);
    } catch (error) {
      console.error("Error fetching admin places:", error);
      res.status(500).json({ error: "Failed to fetch places" });
    }
  });

  // Admin: Bulk import places
  app.post("/api/admin/places/bulk-import", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { places } = req.body;
    if (!Array.isArray(places)) return res.status(400).json({ error: "Invalid data format" });

    // Accent-insensitive, lowercase normalization for matching category text.
    const normalize = (s: any) =>
      String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    // Turn arbitrary category text into a category slug (a-z0-9 + underscores).
    const slugify = (s: any) =>
      normalize(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'other';

    // Maps Google/Apify PT category text -> canonical app slug. First match wins.
    const CANONICAL_RULES: { needles: string[]; slug: string }[] = [
      { needles: ['pecas para motocicletas', 'moto pecas', 'motopecas', 'loja de autopecas', 'autopecas', 'auto pecas', 'loja de pecas'], slug: 'parts_store' },
      { needles: ['concessionaria de motocicletas', 'loja de motocicletas', 'concessionaria de ciclomotores'], slug: 'dealership' },
      { needles: ['oficina mecanica de motos', 'oficina de moto', 'oficina de motos', 'oficina mecanica'], slug: 'repair' },
      { needles: ['borracharia', 'alinhamento e balanceamento', 'alinhamento', 'fornecedor de produtos de borracha'], slug: 'repair' },
      { needles: ['comercio de pneu', 'loja de pneus', 'pneus usados', 'loja de rodas', 'pneu'], slug: 'parts_store' },
      { needles: ['bateria'], slug: 'parts_store' },
      { needles: ['lava-rapido', 'lava rapido', 'lava jato', 'lava-jato', 'lavagem de motos'], slug: 'wash' },
      { needles: ['motocross'], slug: 'motocross' },
      { needles: ['aluguel de motocicletas', 'aluguel de moto'], slug: 'rental' },
      { needles: ['servico de entrega', 'entregas expresso', 'motoboy'], slug: 'delivery' },
    ];

    // Clearly non-motorcycle categories: still imported, but flagged for admin revision.
    const NON_MOTO: string[] = [
      'bicicleta', 'pet shop', 'artigos esportivos', 'esportiv', 'tecido', 'estofa',
      'caminhao', 'caminhoes', 'caminh', 'volvo', 'carros usados', 'revendedora de carros',
      'leilao', 'automoveis', 'concessionaria de veiculos', 'veiculos motorizados', 'concessionaria',
    ];

    // Slugs considered motorcycle-relevant (auto-approved).
    const MOTO_SLUGS = new Set(['dealership', 'repair', 'parts_store', 'gear_shop', 'biker_cafe', 'biker_bar', 'meeting_spot', 'ride_stop', 'motoclub', 'wash', 'motocross', 'rental', 'delivery']);

    // Default Lucide icon per slug (unknown names fall back to MapPin client-side).
    const ICON_FOR: Record<string, string> = {
      dealership: 'Building2', repair: 'Wrench', parts_store: 'Cog', gear_shop: 'ShoppingBag',
      biker_cafe: 'Coffee', wash: 'SprayCan', motocross: 'Flag', rental: 'Bike', delivery: 'Navigation',
    };

    // Existing category slugs from keywords_config.
    const existingRows = db.prepare("SELECT category_name FROM keywords_config").all() as { category_name: string }[];
    const existingCats = new Set(existingRows.map(r => normalize(r.category_name)));

    const classify = (categoryText: string): { slug: string; motoRelevant: boolean } => {
      const n = normalize(categoryText);
      if (!n) return { slug: 'other', motoRelevant: false };
      // Already a known slug (e.g. legacy flat imports where category is already a slug).
      const asSlug = slugify(categoryText);
      if (existingCats.has(normalize(asSlug))) return { slug: asSlug, motoRelevant: MOTO_SLUGS.has(asSlug) };
      // Canonical motorcycle mapping.
      for (const rule of CANONICAL_RULES) {
        if (rule.needles.some(needle => n.includes(needle))) return { slug: rule.slug, motoRelevant: true };
      }
      // Explicitly non-motorcycle -> create its own category but flag for revision.
      if (NON_MOTO.some(needle => n.includes(needle))) return { slug: slugify(categoryText), motoRelevant: false };
      // Mentions "moto" -> treat as a new motorcycle category.
      if (n.includes('moto')) return { slug: slugify(categoryText), motoRelevant: true };
      // Unknown -> import but flag for review.
      return { slug: slugify(categoryText), motoRelevant: false };
    };

    // Tag every place in this import so the cleanup agent can target just this batch.
    const importBatchId = Date.now().toString();

    try {
      // First pass: normalize records and collect category seeds for any new categories.
      const records: any[] = [];
      const slugInfo = new Map<string, { keywords: Set<string> }>();

      for (const p of places) {
        const place_id = p.placeId || p.place_id || p.id;
        if (!place_id) continue;

        const name = p.title || p.name || 'Unknown';
        const lat = Number(p.location?.lat ?? p.lat);
        const lng = Number(p.location?.lng ?? p.lng);
        if (!isFinite(lat) || !isFinite(lng)) continue;

        const categoryText = p.categoryName || p.category || (Array.isArray(p.categories) ? p.categories[0] : '') || 'other';
        const { slug, motoRelevant } = classify(categoryText);

        const rating = Number(p.totalScore ?? p.rating ?? 0) || 0;
        const reviews = Number(p.reviewsCount ?? p.reviews ?? 0) || 0;
        const full_address = p.address || p.full_address || null;
        const city = p.city || null;
        const source_keyword = p.searchString || p.source_keyword || 'bulk_import';

        // Respect explicit control flags when provided (back-compat); else derive from relevance.
        const is_approved = p.is_approved !== undefined ? !!p.is_approved : motoRelevant;
        const is_hidden = !!p.is_hidden;
        const needs_revision = p.needs_revision !== undefined ? !!p.needs_revision : !motoRelevant;

        records.push({ place_id, name, lat, lng, rating, reviews, category: slug, source_keyword, full_address, city, is_approved, is_hidden, needs_revision });

        if (!existingCats.has(normalize(slug))) {
          if (!slugInfo.has(slug)) slugInfo.set(slug, { keywords: new Set<string>() });
          const info = slugInfo.get(slug)!;
          if (categoryText) info.keywords.add(String(categoryText).trim());
          if (source_keyword && source_keyword !== 'bulk_import') info.keywords.add(String(source_keyword).trim());
        }
      }

      // Create any missing categories in keywords_config (Firestore + SQLite).
      // Allocate ids locally instead of via getNextId()'s Firestore transaction —
      // running many transactions during a bulk import triggers INVALID_ARGUMENT
      // ("Invalid transaction"). The shared counter is bumped once at the end.
      let categoriesCreated = 0;
      let nextCategoryId = 0;
      try {
        const maxRow = db.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM keywords_config").get() as { m: number };
        nextCategoryId = Number(maxRow?.m || 0);
      } catch (e) { /* ignore */ }
      try {
        const counterDoc = await firestore.collection("_counters").doc("keywords_config").get();
        const counterVal = counterDoc.exists ? Number(counterDoc.data()?.count || 0) : 0;
        if (counterVal > nextCategoryId) nextCategoryId = counterVal;
      } catch (e) { /* ignore */ }

      for (const [slug, info] of slugInfo) {
        if (existingCats.has(normalize(slug))) continue;
        const keywords = Array.from(info.keywords).filter(Boolean);
        if (keywords.length === 0) keywords.push(slug.replace(/_/g, ' '));
        const icon = ICON_FOR[slug] || 'MapPin';
        const radius = 5000;
        const newId = ++nextCategoryId;
        try {
          await collections.keywords_config.doc(newId.toString()).set({ category_name: slug, keywords, radius, icon });
          try {
            db.prepare("INSERT OR REPLACE INTO keywords_config (id, category_name, keywords, radius, icon) VALUES (?, ?, ?, ?, ?)")
              .run(newId, slug, JSON.stringify(keywords), radius, icon);
          } catch (sqError) { console.error("SQLite keyword create failed:", sqError); }
          existingCats.add(normalize(slug));
          categoriesCreated++;
        } catch (kwErr) {
          console.error("Failed to create keyword category", slug, kwErr);
        }
      }

      // Keep the shared counter ahead of the ids we just allocated so future
      // getNextId("keywords_config") calls don't collide with them.
      if (categoriesCreated > 0) {
        try {
          await firestore.collection("_counters").doc("keywords_config").set({ count: nextCategoryId }, { merge: true });
        } catch (e) { console.error("Failed to bump keywords_config counter:", e); }
      }

      // Write places. Chunk Firestore commits to stay under the 500-op batch limit.
      let batch = firestore.batch();
      let opsInBatch = 0;
      const commitIfNeeded = async (force = false) => {
        if (opsInBatch > 0 && (force || opsInBatch >= 400)) {
          await batch.commit();
          batch = firestore.batch();
          opsInBatch = 0;
        }
      };

      let needsRevisionCount = 0;
      for (const r of records) {
        const cacheRef = collections.places_cache.doc(r.place_id);
        const controlRef = collections.places_control.doc(r.place_id);

        batch.set(cacheRef, {
          place_id: r.place_id, name: r.name, lat: r.lat, lng: r.lng,
          rating: r.rating, reviews: r.reviews, category: r.category,
          source_keyword: r.source_keyword, full_address: r.full_address, city: r.city,
          import_batch_id: importBatchId,
          last_fetched: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        opsInBatch++;

        batch.set(controlRef, {
          place_id: r.place_id, is_approved: r.is_approved, is_hidden: r.is_hidden, needs_revision: r.needs_revision,
        }, { merge: true });
        opsInBatch++;

        if (r.needs_revision) needsRevisionCount++;

        try {
          db.prepare(`
            INSERT OR REPLACE INTO places_cache
            (place_id, name, lat, lng, rating, reviews, category, source_keyword, city, import_batch_id, last_fetched)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run(r.place_id, r.name, r.lat, r.lng, r.rating, r.reviews, r.category, r.source_keyword, r.city, importBatchId);

          db.prepare(`
            INSERT OR REPLACE INTO places_control
            (place_id, is_approved, is_hidden, needs_revision)
            VALUES (?, ?, ?, ?)
          `).run(r.place_id, r.is_approved ? 1 : 0, r.is_hidden ? 1 : 0, r.needs_revision ? 1 : 0);
        } catch (sqError) {
          console.error("SQLite bulk import failed for one item:", sqError);
        }

        await commitIfNeeded();
      }
      await commitIfNeeded(true);

      res.json({ success: true, count: records.length, categoriesCreated, needsRevision: needsRevisionCount, batchId: importBatchId });
    } catch (error) {
      console.error("Error bulk importing places:", error);
      res.status(500).json({ error: "Failed to bulk import places" });
    }
  });

  // ---- Places Cleanup Agent ------------------------------------------------
  // Helpers kept local to this block (the server file is intentionally non-modular).
  const agentNormalize = (s: any) =>
    String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const AGENT_MOTO_SLUGS = new Set(['dealership', 'repair', 'parts_store', 'gear_shop', 'biker_cafe', 'biker_bar', 'meeting_spot', 'ride_stop', 'motoclub', 'wash', 'motocross', 'rental', 'delivery']);
  const AGENT_MIN_RATING_APPROVE = 4.5;
  const AGENT_MIN_REVIEWS_APPROVE = 50;
  const AGENT_MIN_RATING_KEEP = 3.5;
  const AGENT_DUP_DISTANCE_M = 100;

  const haversineM = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  let agentGenaiClient: GoogleGenAI | null = null;
  // Wraps a Gemini call with retry + exponential backoff on 429 (rate limit).
  // Honors the server-suggested retryDelay when the error carries one.
  const generateWithRetry = async (params: any, maxRetries = 4): Promise<any> => {
    let attempt = 0;
    while (true) {
      try {
        return await agentGenaiClient!.models.generateContent(params);
      } catch (err: any) {
        const status = err?.status ?? err?.code;
        const msg = String(err?.message ?? err ?? '');
        const is429 = status === 429 || /\b429\b|too many requests|rate.?limit|resource_exhausted/i.test(msg);
        if (!is429 || attempt >= maxRetries) throw err;
        // Prefer the API's own retryDelay; otherwise exponential backoff (2s, 4s, 8s, 16s) + jitter.
        const suggested = msg.match(/retryDelay"?\s*:?\s*"?(\d+)s/i);
        const waitMs = suggested
          ? (Number(suggested[1]) + 1) * 1000
          : Math.min(2000 * 2 ** attempt, 30000) + Math.floor(Math.random() * 500);
        console.warn(`Gemini 429 — backing off ${waitMs}ms (retry ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, waitMs));
        attempt++;
      }
    }
  };
  // Classifies motorcycle-relevance + suggests a category, in batches.
  // Returns a map place_id -> {relevant, suggestedCategory, reason}, or null when AI is unavailable/failed.
  const classifyPlacesWithAI = async (
    items: { place_id: string; name: string; category: string; full_address?: string | null }[],
    validSlugs: string[]
  ): Promise<Map<string, { relevant: boolean; suggestedCategory: string; reason: string }> | null> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || items.length === 0) return null;
    try {
      if (!agentGenaiClient) agentGenaiClient = new GoogleGenAI({ apiKey });
      const result = new Map<string, { relevant: boolean; suggestedCategory: string; reason: string }>();
      const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const CHUNK = 25;
      const CHUNK_DELAY_MS = 1500; // proactively stay under the free-tier RPM
      let anySuccess = false;
      for (let i = 0; i < items.length; i += CHUNK) {
        const chunk = items.slice(i, i + CHUNK);
        const prompt = `You are curating a directory of MOTORCYCLE-related places (dealerships, repair shops, parts stores, gear shops, biker cafes/bars, ride stops, motorcycle wash, motocross tracks, rental, delivery). For each place below decide if it is relevant to MOTORCYCLISTS. Bicycle shops, car dealerships, pet shops, generic sporting goods stores and truck dealers are NOT relevant.\nValid category slugs: ${validSlugs.join(', ')}.\nReturn ONLY a JSON array, one object per place in the same order, each shaped: {"id": string, "relevant": boolean, "category": string (a slug from the valid list or "other"), "reason": string (max 8 words, Portuguese)}.\nPlaces:\n${JSON.stringify(chunk.map((c) => ({ id: c.place_id, name: c.name, category: c.category, address: c.full_address || '' })))}`;
        let response: any;
        try {
          response = await generateWithRetry({
            model,
            contents: prompt,
            config: { responseMimeType: 'application/json' },
          });
        } catch (chunkErr) {
          // Chunk failed even after retries; skip it — its places fall back to manual flag.
          console.error('Gemini chunk failed after retries, leaving for manual review:', chunkErr);
          continue;
        }
        anySuccess = true;
        const txt = (response.text || '').trim();
        let parsed: any = null;
        try {
          parsed = JSON.parse(txt);
        } catch {
          try { parsed = JSON.parse(txt.replace(/^```json\s*|\s*```$/g, '')); } catch { parsed = null; }
        }
        if (Array.isArray(parsed)) {
          for (const row of parsed) {
            if (row && row.id != null) {
              result.set(String(row.id), {
                relevant: !!row.relevant,
                suggestedCategory: String(row.category || 'other'),
                reason: String(row.reason || ''),
              });
            }
          }
        }
        // Throttle between chunks to stay under the rate limit (skip after the last).
        if (i + CHUNK < items.length) await new Promise(r => setTimeout(r, CHUNK_DELAY_MS));
      }
      // Return whatever we classified. A partial map is safe — unclassified places
      // fall back to "flag for revision" individually. Null only if nothing succeeded.
      return anySuccess ? result : null;
    } catch (err) {
      console.error('AI classification failed:', err);
      return null;
    }
  };

  // Admin: Cleanup agent — analyze a batch and return a proposed plan (no writes).
  app.post("/api/admin/places/agent/analyze", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    try {
      let { batchId } = req.body || {};
      if (!batchId) {
        const last = db.prepare("SELECT import_batch_id FROM places_cache WHERE import_batch_id IS NOT NULL ORDER BY import_batch_id DESC LIMIT 1").get() as any;
        batchId = last?.import_batch_id;
      }
      if (!batchId) return res.status(404).json({ error: "No imported batch found" });

      const rows = db.prepare(`
        SELECT place_id, name, lat, lng, rating, reviews, category, full_address
        FROM places_cache WHERE import_batch_id = ?
      `).all(batchId) as any[];

      if (rows.length === 0) {
        return res.json({ batchId, plan: [], summary: { total: 0, approve: 0, delete: 0, flag: 0, aiUsed: false } });
      }

      // Existing live places (outside this batch) for cross-batch duplicate detection.
      const existing = db.prepare(`
        SELECT place_id, name, lat, lng, reviews
        FROM places_cache WHERE import_batch_id IS NULL OR import_batch_id != ?
      `).all(batchId) as any[];

      type Decision = { place_id: string; name: string; category: string; rating: number; reviews: number; action: 'approve' | 'delete' | 'flag'; reason: string; suggestedCategory: string };
      const decided = new Map<string, Decision>();
      const survivors: any[] = [];

      // 1-4: deterministic rules (no API cost).
      for (const r of rows) {
        const rating = Number(r.rating) || 0;
        const reviews = Number(r.reviews) || 0;
        const lat = Number(r.lat), lng = Number(r.lng);
        const base = { place_id: r.place_id, name: r.name, category: r.category, rating, reviews, suggestedCategory: r.category };
        if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
          decided.set(r.place_id, { ...base, action: 'delete', reason: 'Sem coordenadas válidas' });
        } else if (rating === 0 || reviews === 0) {
          decided.set(r.place_id, { ...base, action: 'delete', reason: 'Sem rating ou reviews' });
        } else if (rating < AGENT_MIN_RATING_KEEP) {
          decided.set(r.place_id, { ...base, action: 'delete', reason: `Rating baixo (${rating})` });
        } else {
          survivors.push(r);
        }
      }

      // Duplicate detection: same normalized name within AGENT_DUP_DISTANCE_M. Keep most-reviewed.
      const dupDeleted = new Set<string>();
      for (let i = 0; i < survivors.length; i++) {
        const a = survivors[i];
        if (dupDeleted.has(a.place_id)) continue;
        const an = agentNormalize(a.name);
        for (let j = i + 1; j < survivors.length; j++) {
          const b = survivors[j];
          if (dupDeleted.has(b.place_id)) continue;
          if (agentNormalize(b.name) === an && haversineM(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng)) < AGENT_DUP_DISTANCE_M) {
            const loser = (Number(a.reviews) >= Number(b.reviews)) ? b : a;
            const winner = loser === a ? b : a;
            dupDeleted.add(loser.place_id);
            decided.set(loser.place_id, {
              place_id: loser.place_id, name: loser.name, category: loser.category,
              rating: Number(loser.rating) || 0, reviews: Number(loser.reviews) || 0,
              suggestedCategory: loser.category, action: 'delete', reason: `Duplicata de "${winner.name}"`,
            });
            if (loser.place_id === a.place_id) break;
          }
        }
        if (dupDeleted.has(a.place_id)) continue;
        for (const e of existing) {
          if (agentNormalize(e.name) === an && haversineM(Number(a.lat), Number(a.lng), Number(e.lat), Number(e.lng)) < AGENT_DUP_DISTANCE_M) {
            dupDeleted.add(a.place_id);
            decided.set(a.place_id, {
              place_id: a.place_id, name: a.name, category: a.category,
              rating: Number(a.rating) || 0, reviews: Number(a.reviews) || 0,
              suggestedCategory: a.category, action: 'delete', reason: `Duplicata de lugar existente "${e.name}"`,
            });
            break;
          }
        }
      }

      const toClassify = survivors.filter(s => !dupDeleted.has(s.place_id));

      // Valid slugs = motorcycle canon + whatever categories already exist.
      const kwRows = db.prepare("SELECT category_name FROM keywords_config").all() as any[];
      const validSlugsSet = new Set<string>(AGENT_MOTO_SLUGS);
      for (const k of kwRows) validSlugsSet.add(k.category_name);
      const validSlugs = Array.from(validSlugsSet);

      // 5-7: AI relevance + threshold combination.
      const aiResult = await classifyPlacesWithAI(
        toClassify.map(s => ({ place_id: s.place_id, name: s.name, category: s.category, full_address: s.full_address })),
        validSlugs
      );

      for (const s of toClassify) {
        const rating = Number(s.rating) || 0;
        const reviews = Number(s.reviews) || 0;
        const ai = aiResult?.get(s.place_id);
        const suggestedCategory = (ai?.suggestedCategory && ai.suggestedCategory !== 'other') ? ai.suggestedCategory : s.category;
        const base = { place_id: s.place_id, name: s.name, category: s.category, rating, reviews, suggestedCategory };
        const isMoto = AGENT_MOTO_SLUGS.has(suggestedCategory) || validSlugsSet.has(suggestedCategory);

        if (aiResult && ai && !ai.relevant) {
          decided.set(s.place_id, { ...base, action: 'delete', reason: ai.reason || 'Não relacionado a motociclismo' });
        } else if (aiResult && ai?.relevant && isMoto && rating >= AGENT_MIN_RATING_APPROVE && reviews >= AGENT_MIN_REVIEWS_APPROVE) {
          decided.set(s.place_id, { ...base, action: 'approve', reason: `Atende critérios (${rating}★, ${reviews} reviews)` });
        } else if (!aiResult) {
          decided.set(s.place_id, { ...base, action: 'flag', reason: 'IA indisponível — revisar manualmente' });
        } else {
          decided.set(s.place_id, { ...base, action: 'flag', reason: 'Métricas/categoria a confirmar' });
        }
      }

      // Preserve original import order.
      const plan: Decision[] = [];
      for (const r of rows) {
        const d = decided.get(r.place_id);
        if (d) plan.push(d);
      }

      const summary = {
        total: plan.length,
        approve: plan.filter(p => p.action === 'approve').length,
        delete: plan.filter(p => p.action === 'delete').length,
        flag: plan.filter(p => p.action === 'flag').length,
        aiUsed: !!aiResult,
      };

      res.json({ batchId, plan, summary });
    } catch (error) {
      console.error("Agent analyze failed:", error);
      res.status(500).json({ error: "Failed to analyze batch" });
    }
  });

  // Admin: Cleanup agent — apply the (possibly edited) decisions.
  app.post("/api/admin/places/agent/apply", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { decisions } = req.body || {};
    if (!Array.isArray(decisions)) return res.status(400).json({ error: "Invalid decisions" });
    let approved = 0, deleted = 0, flagged = 0;
    try {
      for (const d of decisions) {
        const placeId = String(d.place_id || '');
        if (!placeId) continue;
        const category = d.category;

        if (d.action === 'delete') {
          try { await collections.places_cache.doc(placeId).delete(); } catch (e) {}
          try { await collections.places_control.doc(placeId).delete(); } catch (e) {}
          try {
            db.prepare("DELETE FROM places_cache WHERE place_id = ?").run(placeId);
            db.prepare("DELETE FROM places_control WHERE place_id = ?").run(placeId);
          } catch (e) { console.error("SQLite agent delete failed:", e); }
          deleted++;
        } else if (d.action === 'approve') {
          if (category) {
            try { await collections.places_cache.doc(placeId).set({ category }, { merge: true }); } catch (e) {}
            try { db.prepare("UPDATE places_cache SET category = ? WHERE place_id = ?").run(category, placeId); } catch (e) {}
          }
          try { await collections.places_control.doc(placeId).set({ place_id: placeId, is_approved: true, is_hidden: false, needs_revision: false }, { merge: true }); } catch (e) {}
          try { db.prepare("INSERT OR REPLACE INTO places_control (place_id, is_approved, is_hidden, needs_revision) VALUES (?, 1, 0, 0)").run(placeId); } catch (e) { console.error("SQLite agent approve failed:", e); }
          approved++;
        } else if (d.action === 'flag') {
          if (category) {
            try { await collections.places_cache.doc(placeId).set({ category }, { merge: true }); } catch (e) {}
            try { db.prepare("UPDATE places_cache SET category = ? WHERE place_id = ?").run(category, placeId); } catch (e) {}
          }
          try { await collections.places_control.doc(placeId).set({ place_id: placeId, is_approved: false, needs_revision: true }, { merge: true }); } catch (e) {}
          try { db.prepare("INSERT OR REPLACE INTO places_control (place_id, is_approved, is_hidden, needs_revision) VALUES (?, 0, 0, 1)").run(placeId); } catch (e) { console.error("SQLite agent flag failed:", e); }
          flagged++;
        }
      }
      logAdminAction((req as any).user.id, 'PLACES_AGENT_APPLY', 'places', 'agent', `approved=${approved} deleted=${deleted} flagged=${flagged}`);
      res.json({ success: true, approved, deleted, flagged });
    } catch (error) {
      console.error("Agent apply failed:", error);
      res.status(500).json({ error: "Failed to apply decisions" });
    }
  });

  // Admin: Update place cache data
  app.put("/api/admin/places/:id", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { name, lat, lng, category, full_address, rating, reviews, is_approved, is_hidden, needs_revision } = req.body;
    try {
      const cacheRef = collections.places_cache.doc(req.params.id);
      const controlRef = collections.places_control.doc(req.params.id);
      
      const updateData: any = {
        name,
        lat: Number(lat),
        lng: Number(lng),
        category,
        full_address,
        rating: Number(rating || 0),
        reviews: Number(reviews || 0),
        last_fetched: admin.firestore.FieldValue.serverTimestamp()
      };

      await cacheRef.set(updateData, { merge: true });
      
      if (is_approved !== undefined || is_hidden !== undefined || needs_revision !== undefined) {
        await controlRef.set({
          place_id: req.params.id,
          is_approved: !!is_approved,
          is_hidden: !!is_hidden,
          needs_revision: !!needs_revision
        }, { merge: true });
      }

      // Update SQLite
      try {
        db.prepare(`
          INSERT OR REPLACE INTO places_cache 
          (place_id, name, lat, lng, rating, reviews, category, source_keyword, last_fetched)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          req.params.id, name, lat, lng, rating || 0,
          reviews || 0, category, 'manual_edit'
        );
      } catch (sqError) {
        console.error("SQLite update failed for places_cache:", sqError);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating place cache:", error);
      res.status(500).json({ error: "Failed to update place data" });
    }
  });

  // Admin: Delete place
  app.delete("/api/admin/places/:id", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const placeId = req.params.id;
    try {
      await collections.places_cache.doc(placeId).delete();
      await collections.places_control.doc(placeId).delete();
      try {
        db.prepare("DELETE FROM places_cache WHERE place_id = ?").run(placeId);
        db.prepare("DELETE FROM places_control WHERE place_id = ?").run(placeId);
      } catch (sqError) {
        console.error("SQLite delete failed for place:", sqError);
      }
      logAdminAction((req as any).user.id, 'DELETE_PLACE', 'place', placeId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting place:", error);
      res.status(500).json({ error: "Failed to delete place" });
    }
  });

  // Admin: Update place control
  app.post("/api/admin/places/:id/control", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { is_approved, is_hidden, needs_revision } = req.body;
    try {
      const docRef = collections.places_control.doc(req.params.id);
      const doc = await docRef.get();
      const existingData = doc.exists ? doc.data() : {};

      const finalData = {
        place_id: req.params.id,
        is_approved: is_approved !== undefined ? !!is_approved : (existingData?.is_approved ?? false),
        is_hidden: is_hidden !== undefined ? !!is_hidden : (existingData?.is_hidden ?? false),
        needs_revision: needs_revision !== undefined ? !!needs_revision : (existingData?.needs_revision ?? false)
      };

      await docRef.set(finalData, { merge: true });
      
      // Dual-write to SQLite
      try {
        db.prepare(`
          INSERT OR REPLACE INTO places_control (place_id, is_approved, is_hidden, needs_revision)
          VALUES (?, ?, ?, ?)
        `).run(
          req.params.id,
          finalData.is_approved ? 1 : 0,
          finalData.is_hidden ? 1 : 0,
          finalData.needs_revision ? 1 : 0
        );
      } catch (sqError) {
        console.error("SQLite update failed for place control:", sqError);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating place control:", error);
      res.status(500).json({ error: "Failed to update place control" });
    }
  });

  app.post("/api/admin/places/:id/category", authenticateToken, async (req, res) => {
    if ((req as any).user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { category } = req.body;
    try {
      const docRef = collections.places_cache.doc(req.params.id);
      await docRef.update({ category });
      
      // Dual-write to SQLite
      db.prepare("UPDATE places_cache SET category = ? WHERE place_id = ?").run(category, req.params.id);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating place category:", error);
      res.status(500).json({ error: "Failed to update place category" });
    }
  });

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

  const insertPlaceCacheStmt = db.prepare(`
    INSERT OR REPLACE INTO places_cache 
    (place_id, name, lat, lng, rating, reviews, category, source_keyword, city, details, full_address, source, last_fetched)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  // Advanced Search Endpoint
  app.post("/api/places/advanced-search", async (req, res) => {
    const { mode, lat, lng, radius, bounds, polyline, keywords } = req.body;
    const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY || (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY;
    
    try {
      const [settingsSnapshot, keywordsSnapshot, controlSnapshot, ecoSnapshot] = await Promise.all([
        collections.settings.get().catch(() => ({ docs: [] as any[] })),
        collections.keywords_config.get().catch(() => ({ docs: [] as any[] })),
        collections.places_control.get().catch(() => ({ docs: [] as any[] })),
        collections.ecosystems.get().catch(() => ({ docs: [] as any[] }))
      ]);

      const settingsMap = settingsSnapshot.docs.reduce((acc: any, doc: any) => {
        acc[doc.id] = (doc.data() as any).value;
        return acc;
      }, {} as any);

      // Fallback if settings empty (Firestore might be unconfigured or empty)
      if (Object.keys(settingsMap).length === 0) {
        try {
          const settings = db.prepare("SELECT * FROM settings").all() as any[];
          settings.forEach((row: any) => settingsMap[row.KEY ?? row.key] = row.value);
        } catch (e) {}
      }

      let keywordConfigs = keywordsSnapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id }));
      if (keywordConfigs.length === 0) {
        try {
          keywordConfigs = db.prepare("SELECT * FROM keywords_config").all();
          keywordConfigs = keywordConfigs.map(k => ({
            ...k,
            keywords: typeof k.keywords === 'string' ? JSON.parse(k.keywords) : (k.keywords || [])
          }));
        } catch (e) {}
      }

      const controlMap = new Map();
      controlSnapshot.docs.forEach(doc => controlMap.set(doc.id, doc.data()));

      const internalPlaces = ecoSnapshot.docs.map(doc => doc.data() as any);
      
      const enableGoogleMaps = settingsMap['api_google_maps'] === 'true' || settingsMap['api_osm'] === 'true'; // Used as generic API toggle now
      const enableOSM = settingsMap['api_osm'] === 'true';

      const activeKeywords = keywords && keywords.length > 0 
        ? keywordConfigs.filter((k: any) => keywords.includes(k.category_name))
        : keywordConfigs;

      let allPlaces: any[] = [];
      let samplePoints: number[][] = [];

      const fetchPlaces = async (searchLat: number, searchLng: number, searchRadius: number, keywordStr: string, category: string) => {
        const apiKey = "BNecDxcWcrUQ5X1SzghrH2OMxssFG8pgDA6-D9MrlDk";
        if (!enableGoogleMaps || !apiKey) return [];
        
        const url = new URL("https://discover.search.hereapi.com/v1/discover");
        url.searchParams.append("at", `${searchLat},${searchLng}`);
        url.searchParams.append("q", keywordStr || category || "restaurant");
        url.searchParams.append("limit", "20");
        url.searchParams.append("apikey", apiKey);

        try {
          const response = await fetch(url.toString());
          if (!response.ok) {
            console.error("HERE Places API HTTP error in advanced search:", response.status, response.statusText);
            return [];
          }
          
          const text = await response.text();
          if (!text || text.trim() === "") {
            console.warn("HERE Places API returned an empty response");
            return [];
          }

          let data;
          try {
            data = JSON.parse(text);
          } catch (parseError) {
            return [];
          }
          
          if (data.items) {
            const places = data.items.map((p: any) => ({
              place_id: p.id,
              name: p.title,
              lat: p.position?.lat || 0,
              lng: p.position?.lng || 0,
              rating: 0,
              reviews: 0,
              category: category,
              source_keyword: keywordStr,
              city: p.address?.city || '',
              details: p.categories?.map((c: any) => c.name).join(', ') || '',
              full_address: p.address?.label || '',
              source: 'here'
            }));

            // Sync to SQLite in background (don't await for each point to stay fast)
            process.nextTick(() => {
              try {
                db.transaction(() => {
                  for (const p of places) {
                    insertPlaceCacheStmt.run(p.place_id, p.name, p.lat, p.lng, p.rating, p.reviews, p.category, p.source_keyword, p.city, p.details, p.full_address, p.source);
                  }
                })();
              } catch (sqe) {
                console.error("SQLite cache sync error:", sqe);
              }
            });

            return places;
          }
          return [];
        } catch (error) {
          console.error("fetchPlaces error:", error);
          return [];
        }
      };

      // Helper function to fetch from OSM
      const fetchOSMInner = async (searchLat: number, searchLng: number, searchRadius: number) => {
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

          // Sync to SQLite in background
          process.nextTick(() => {
            try {
              db.transaction(() => {
                for (const p of mappedOSM) {
                  insertPlaceCacheStmt.run(p.place_id, p.name, p.lat, p.lng, p.rating, p.reviews, p.category, p.source_keyword, p.city, p.details, p.full_address, p.source);
                }
              })();
            } catch (sqe) {
              console.error("SQLite OSM cache sync error:", sqe);
            }
          });

          return mappedOSM;
        } catch (e) {
          console.error(`OSM fetch error in advanced-search for point [${searchLat}, ${searchLng}]:`, e);
          return [];
        }
      };

      // Helper for limited concurrency
      const limitConcurrency = async (tasks: (() => Promise<any[]>)[], limit: number) => {
        const results: any[] = [];
        const running = new Set<Promise<void>>();
        for (const task of tasks) {
          const p = task().then(res => { 
            results.push(res);
          }).catch(err => {
            console.error("Error in task execution:", err);
          }).finally(() => {
            running.delete(p);
          });
          running.add(p);
          if (running.size >= limit) {
            await Promise.race(running);
          }
        }
        await Promise.all(running);
        return results;
      };

      // 2. Execute search based on mode
      const searchTasks: (() => Promise<any[]>)[] = [];
      if (mode === 'near_me' && lat && lng) {
        const searchRadius = radius || 5000;
        activeKeywords.forEach((config: any) => {
          const kwsRaw = config.keywords;
          const kws = Array.isArray(kwsRaw) ? kwsRaw : (typeof kwsRaw === 'string' ? JSON.parse(kwsRaw) : []);
          kws.forEach((kw: string) => {
            searchTasks.push(() => fetchPlaces(lat, lng, searchRadius, kw, config.category_name));
          });
        });
        searchTasks.push(() => fetchOSMInner(lat, lng, searchRadius));
      } else if (mode === 'viewport' && bounds) {
        const centerLat = (bounds.north + bounds.south) / 2;
        const centerLng = (bounds.east + bounds.west) / 2;
        const viewportRadius = Math.min((getDistance([bounds.north, bounds.west], [bounds.south, bounds.east])) / 2, 50000);

        activeKeywords.forEach((config: any) => {
          const kwsRaw = config.keywords;
          const kws = Array.isArray(kwsRaw) ? kwsRaw : (typeof kwsRaw === 'string' ? JSON.parse(kwsRaw) : []);
          kws.forEach((kw: string) => {
            searchTasks.push(() => fetchPlaces(centerLat, centerLng, viewportRadius, kw, config.category_name));
          });
        });
        searchTasks.push(() => fetchOSMInner(centerLat, centerLng, viewportRadius));
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
          
          limitedSamples.forEach(pt => {
            activeKeywords.forEach((config: any) => {
              const kwsRaw = config.keywords;
              const kws = Array.isArray(kwsRaw) ? kwsRaw : (typeof kwsRaw === 'string' ? JSON.parse(kwsRaw) : []);
              kws.forEach((kw: string) => {
                searchTasks.push(() => fetchPlaces(pt[0], pt[1], 3000, kw, config.category_name));
              });
            });
            // OSM sequentially within the samples loop? 
            // Better to just push all tasks and let the limitConcurrency handle it.
            searchTasks.push(() => fetchOSMInner(pt[0], pt[1], 3000));
          });
        }
      }

      const results = await limitConcurrency(searchTasks, 5); // Limit to 5 concurrent fetches
      allPlaces = results.flat();

      // 3. Deduplicate
      const uniquePlacesMap = new Map();
      for (const p of allPlaces) {
        if (!uniquePlacesMap.has(p.place_id)) {
          uniquePlacesMap.set(p.place_id, p);
        }
      }

      // Background Firestore Cache Update (Batch)
      process.nextTick(async () => {
        try {
          const allFound = Array.from(uniquePlacesMap.values());
          if (allFound.length === 0) return;
          
          // Chunk into 500s for Firestore
          for (let i = 0; i < allFound.length; i += 500) {
            const chunk = allFound.slice(i, i + 500);
            const batch = firestore.batch();
            for (const p of chunk) {
              const cacheRef = collections.places_cache.doc(p.place_id);
              batch.set(cacheRef, { ...p, last_fetched: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            }
            await batch.commit();
          }
        } catch (e) {
          console.error("Background Firestore cache sync error:", e);
        }
      });

      // 3.5 Add approved places from control table
      try {
        const approvedIds: string[] = [];
        controlMap.forEach((data, id) => {
          if (data.is_approved === true && data.is_hidden === false && data.needs_revision === false) {
            if (!uniquePlacesMap.has(id)) {
              approvedIds.push(id);
            }
          }
        });
        
        if (approvedIds.length > 0) {
          // Fetch corresponding cache entries efficiently using local SQLite
          const cacheDocs: any[] = [];
          for (let i = 0; i < approvedIds.length; i += 900) {
            const chunk = approvedIds.slice(i, i + 900);
            const placeholders = chunk.map(() => '?').join(',');
            const rows = db.prepare(`SELECT * FROM places_cache WHERE place_id IN (${placeholders})`).all(...chunk);
            cacheDocs.push(...rows);
          }
          
          cacheDocs.forEach(cacheData => {
            if (cacheData.lat && cacheData.lng) {
              const p = { ...cacheData, ...controlMap.get(cacheData.place_id) };
              
              let shouldAdd = false;
              if (mode === 'near_me' && lat && lng) {
                const dist = getDistance([lat, lng], [p.lat, p.lng]);
                if (dist <= (radius || 50000)) shouldAdd = true;
              } else if (mode === 'viewport' && bounds) {
                if (p.lat <= bounds.north && p.lat >= bounds.south && p.lng <= bounds.east && p.lng >= bounds.west) {
                  shouldAdd = true;
                }
              } else if (mode === 'route' && polyline) {
                for (const pt of samplePoints) {
                  if (getDistance(pt, [p.lat, p.lng]) <= 10000) {
                    shouldAdd = true;
                    break;
                  }
                }
              }

              if (shouldAdd) {
                uniquePlacesMap.set(cacheData.place_id, p);
              }
            }
          });
        }
      } catch (e) {
        console.error("Error adding approved places to search results:", e);
      }

      let uniquePlaces = Array.from(uniquePlacesMap.values());

      // 4. Apply Admin Controls & Filtering
      try {
        const registeredCategories = new Set(keywordConfigs.map(k => k.category_name.toLowerCase()));

        uniquePlaces = uniquePlaces.filter(p => {
          const control = controlMap.get(p.place_id) as any;
          
          if (control && control.is_hidden) return false;
          if (control && control.needs_revision) return false;
          
          if (p.category && !registeredCategories.has(p.category.toLowerCase())) {
            if (!control || !control.is_approved) return false;
          }

          if (control && control.is_approved) return true;
          return p.rating >= 3.5 || (p.rating > 0 && p.reviews >= 5);
        });

        uniquePlaces = uniquePlaces.map(p => {
          const control = controlMap.get(p.place_id) as any;
          return {
            ...p,
            needs_revision: control ? !!control.needs_revision : false
          };
        });
      } catch (e) {
        console.error("Error applying controls:", e);
      }

      // 5. Ranking Logic (simplified without priority)
      uniquePlaces.sort((a, b) => {
        const scoreA = (a.rating * 10) + (a.reviews * 0.1);
        const scoreB = (b.rating * 10) + (b.reviews * 0.1);
        return scoreB - scoreA;
      });

      // 6. Deduplicate with internal places
      try {
        uniquePlaces = uniquePlaces.filter(p => {
          const isDuplicate = internalPlaces.some((internal: any) => 
            (internal.company_name || internal.name) && p.name &&
            (internal.company_name || internal.name).toLowerCase() === p.name.toLowerCase() &&
            Math.abs(internal.lat - p.lat) < 0.01 &&
            Math.abs(internal.lng - p.lng) < 0.01
          );
          return !isDuplicate;
        });
      } catch (e) {
        console.error("Error deduplicating with internal places:", e);
      }

      res.json(uniquePlaces);
    } catch (error: any) {
      console.error("Advanced Search Error:", error);
      res.status(500).json({ error: error.message || "Internal server error during search" });
    }
  });

  app.get("/api/places/autocomplete", async (req, res) => {
    const { q, at, lang } = req.query;
    const apiKey = "BNecDxcWcrUQ5X1SzghrH2OMxssFG8pgDA6-D9MrlDk";
    
    try {
      const url = new URL("https://autosuggest.search.hereapi.com/v1/autosuggest");
      url.searchParams.append("at", (at as string) || "0,0");
      url.searchParams.append("limit", "5");
      url.searchParams.append("q", (q as string) || "");
      url.searchParams.append("lang", (lang as string) || "en-US");
      url.searchParams.append("apikey", apiKey);
      
      const response = await fetch(url.toString());
      if (!response.ok) {
         return res.status(response.status).json({ error: "Failed to fetch autocomplete" });
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Autocomplete API Exception:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/places/nearby", async (req, res) => {
    const { lat, lng, radius, keyword } = req.query;
    const apiKey = "BNecDxcWcrUQ5X1SzghrH2OMxssFG8pgDA6-D9MrlDk";
    
    if (!apiKey) {
      return res.status(500).json({ error: "HERE Maps API key not configured" });
    }

    try {
      const url = new URL("https://discover.search.hereapi.com/v1/discover");
      url.searchParams.append("at", `${lat},${lng}`);
      if (keyword && typeof keyword === 'string' && keyword.trim()) url.searchParams.append("q", keyword.trim());
      else url.searchParams.append("q", "restaurant"); // HERE Discover requires q
      url.searchParams.append("limit", "20");
      url.searchParams.append("apikey", apiKey);

      const response = await fetch(url.toString());
      if (!response.ok) {
         console.error("HERE Places API HTTP error:", response.status, response.statusText);
         return res.status(500).json({ error: "Failed to fetch places" });
      }
      
      const text = await response.text();
      if (!text || text.trim() === "") {
        console.warn("HERE Places API returned an empty response in nearby endpoint");
        return res.json([]);
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error("Failed to parse HERE Places API response as JSON in nearby endpoint. Response text:", text.substring(0, 500));
        return res.status(500).json({ error: "Invalid response from HERE Places API" });
      }
      
      if (!data.items) {
        console.error("HERE Places API Status Error:", data);
        return res.status(500).json({ error: "Failed to fetch places" });
      }
      
      // Map to backward compatible structure for the frontend temporarily
      const mappedResults = data.items.map((p: any) => ({
        place_id: p.id,
        name: p.title,
        geometry: { location: { lat: p.position?.lat, lng: p.position?.lng } },
        rating: 0,
        user_ratings_total: 0,
        vicinity: p.address?.label || ''
      }));

      res.json(mappedResults);
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

  // Place detail = the living guide (Fase 3): place info + its approved relatos.
  // Public. Registered AFTER the literal /api/places/* routes so they win.
  app.get("/api/places/:placeId", async (req, res) => {
    const placeId = req.params.placeId;
    try {
      let place: any = db.prepare(
        "SELECT place_id, name, lat, lng, rating, reviews, category, city, full_address, source FROM places_cache WHERE place_id = ?",
      ).get(placeId);
      if (!place) {
        try {
          const doc = await collections.places_cache.doc(placeId).get();
          if (doc.exists) place = doc.data();
        } catch (e) { /* not in Firestore either */ }
      }
      if (!place) return res.status(404).json({ error: "Place not found" });
      const control: any = db.prepare(
        "SELECT moto_attributes, origin, relato_count FROM places_control WHERE place_id = ?",
      ).get(placeId);
      const relatos = (db.prepare(
        `SELECT * FROM relatos WHERE anchor_type = 'place' AND anchor_id = ? AND status IN ('approved','featured')
         ORDER BY created_at DESC LIMIT 50`,
      ).all(placeId) as any[]).map(parseRelatoMirrorRow);
      return res.json({
        place: {
          placeId: place.place_id || place.placeId || placeId,
          name: place.name, lat: place.lat, lng: place.lng, category: place.category,
          address: place.full_address || place.address || null, city: place.city || null,
          motoAttributes: control?.moto_attributes ? safeJsonParse(control.moto_attributes, {}) : {},
          origin: control?.origin || null,
          relatoCount: control?.relato_count ?? relatos.length,
        },
        relatos,
      });
    } catch (error: any) {
      console.error("place detail error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Route detail (Fase 5): the routed line + its approved relatos. Auth required and
  // privacyLevel-gated (start/end reveal where the rider lives): public/community →
  // any signed-in user; private → owner/admin only.
  app.get("/api/routes/:id", authenticateToken, async (req: any, res) => {
    const id = req.params.id;
    try {
      let route: any = db.prepare("SELECT * FROM routes WHERE id = ?").get(id);
      if (route) {
        route = {
          ...route,
          geometry: safeJsonParse(route.geometry, null),
          polyline: safeJsonParse(route.polyline, []),
          surfaceTypes: safeJsonParse(route.surface_types, []),
          privacyLevel: route.privacy_level,
          distanceMeters: route.distance_meters,
          gpxRef: route.gpx_ref,
          createdBy: route.created_by,
        };
      } else {
        const doc = await collections.routes.doc(id).get();
        if (doc.exists) {
          route = doc.data();
          route.polyline = safeJsonParse(route.polyline, []); // stored as JSON string
        }
      }
      if (!route) return res.status(404).json({ error: "Route not found" });
      const privacy = route.privacyLevel || "private";
      const isStaff = req.user.role === "admin" || req.user.role === "moderator";
      const isOwner = route.createdBy != null && String(route.createdBy) === String(req.user.id);
      if (privacy === "private" && !isOwner && !isStaff) return res.status(403).json({ error: "Forbidden" });
      const relatos = (db.prepare(
        `SELECT * FROM relatos WHERE anchor_type = 'route' AND anchor_id = ? AND status IN ('approved','featured') ORDER BY created_at DESC LIMIT 50`,
      ).all(id) as any[]).map(parseRelatoMirrorRow);
      return res.json({
        route: {
          id,
          name: route.name,
          geometry: route.geometry,
          polyline: route.polyline,
          distanceMeters: route.distanceMeters ?? null,
          difficulty: route.difficulty || null,
          surfaceTypes: route.surfaceTypes ?? [],
          privacyLevel: privacy,
          gpxRef: route.gpxRef ?? null,
        },
        relatos,
      });
    } catch (error: any) {
      console.error("route detail error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/search", async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') return res.json({ routes: [], events: [], clubs: [], riders: [], locations: [] });

    const searchLower = q.toLowerCase();
    const searchTerm = `%${searchLower}%`;

    try {
      // 1. Search Routes
      const routes = db.prepare(`
        SELECT * FROM discovered_routes 
        WHERE LOWER(name) LIKE ? OR LOWER(tags) LIKE ?
        LIMIT 5
      `).all(searchTerm, searchTerm);

      // 2. Search Events
      const events = db.prepare(`
        SELECT * FROM events 
        WHERE LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(location) LIKE ?
        LIMIT 5
      `).all(searchTerm, searchTerm, searchTerm);

      // 3. Search Users in Firestore
      let riders: any[] = [];
      let clubs: any[] = [];
      let locations: any[] = [];

      try {
        const userSnap = await collections.users
          .where("username", ">=", searchLower)
          .where("username", "<=", searchLower + "\uf8ff")
          .limit(10)
          .get();
        
        userSnap.docs.forEach(doc => {
          const u = { id: doc.id, ...doc.data() as any };
          if (u.type === 'rider') {
            riders.push(u);
          } else if (u.type === 'ecosystem') {
            // we distinguish club vs location typically by service_category
            if (u.service_category === 'club') clubs.push(u);
            else locations.push(u);
          }
        });
      } catch(err) {}

      // Fallback search Riders in SQLite
      if (riders.length === 0) {
        riders = db.prepare(`
          SELECT u.id, u.username, u.profile_picture_url, r.name as rider_name 
          FROM users u 
          LEFT JOIN riders r ON u.id = r.user_id 
          WHERE u.type = 'rider' AND (LOWER(u.username) LIKE ? OR LOWER(r.name) LIKE ?)
          LIMIT 5
        `).all(searchTerm, searchTerm);
      }

      // Fallback search Clubs in SQLite
      if (clubs.length === 0) {
        clubs = db.prepare(`
          SELECT u.id, u.username, u.profile_picture_url, e.company_name, e.full_address 
          FROM users u 
          JOIN ecosystems e ON u.id = e.user_id 
          WHERE u.type = 'ecosystem' AND e.service_category = 'club' AND (LOWER(u.username) LIKE ? OR LOWER(e.company_name) LIKE ?)
          LIMIT 5
        `).all(searchTerm, searchTerm);
      }

      // Fallback search Locations in SQLite
      if (locations.length === 0) {
        locations = db.prepare(`
          SELECT u.id, u.username, u.profile_picture_url, e.company_name, e.full_address, e.service_category, e.lat, e.lng 
          FROM users u 
          JOIN ecosystems e ON u.id = e.user_id 
          WHERE u.type = 'ecosystem' AND e.service_category != 'club' AND (LOWER(u.username) LIKE ? OR LOWER(e.company_name) LIKE ?)
          LIMIT 5
        `).all(searchTerm, searchTerm);
      }

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

  app.get("/api/users/search", async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.json([]);
    }
    
    try {
      let users: any[] = [];
      const userMap = new Map();
      
      try {
        const userSnap = await collections.users.where("username", ">=", q.toLowerCase()).where("username", "<=", q.toLowerCase() + "\uf8ff").limit(5).get();
        if (!userSnap.empty) {
          userSnap.docs.forEach(doc => {
            const data = { id: doc.id, ...(doc.data() as any) };
            userMap.set(data.username.toLowerCase(), data);
          });
        }
      } catch (err) {}

      try {
        const sqliteUsers = db.prepare(`
          SELECT id, username, profile_picture_url 
          FROM users 
          WHERE LOWER(username) LIKE ? AND status = 'active'
          LIMIT 5
        `).all(`${q.toLowerCase()}%`) as any[];
        
        sqliteUsers.forEach(su => {
          if (!userMap.has(su.username.toLowerCase())) {
            userMap.set(su.username.toLowerCase(), su);
          }
        });
      } catch (err) {}
      
      users = Array.from(userMap.values()).slice(0, 5);
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/users", authenticateToken, checkAdmin, (req, res) => {
    const users = db.prepare("SELECT id, username, email, type, role, profile_picture_url, created_at FROM users").all();
    res.json(users);
  });

  // Tracking protection bypass: changed from /api/users/:username/badges
  app.get(["/api/users/:username/achievements", "/api/users/:username/badges"], (req, res) => {
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

  app.get("/api/stamps", async (req, res) => {
    try {
      const stamps = db.prepare("SELECT * FROM passport_stamps").all();
      if (stamps.length > 0) return res.json(stamps);
      const snapshot = await collections.passport_stamps.get();
      res.json(snapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id })));
    } catch (error: any) {
      if (!error.message?.includes('PERMISSION_DENIED')) {
        console.error("Error fetching stamps from Firestore:", error);
      }
      res.json([]);
    }
  });

  // Tracking protection bypass: changed from /api/badges
  app.get(["/api/achievements", "/api/badges"], async (req, res) => {
    const { creator_id } = req.query;
    try {
      let queryStr = `
        SELECT b.*, creator.username as creator_username, creator.type as creator_type_name
        FROM badges b LEFT JOIN users creator ON b.creator_id = creator.id
        WHERE b.is_active = 1
      `;
      const params: any[] = [];
      if (creator_id) { queryStr += " AND b.creator_id = ?"; params.push(parseInt(creator_id as string)); }
      queryStr += " ORDER BY b.badge_id DESC";
      const badges = db.prepare(queryStr).all(...params);
      if (badges.length > 0) return res.json(badges);
      // Fallback to Firestore when SQLite is empty.
      let query: admin.firestore.Query = collections.badges.where("is_active", "==", 1);
      if (creator_id) query = query.where("creator_id", "==", parseInt(creator_id as string));
      const snapshot = await query.get();
      const fsBadges = await Promise.all(snapshot.docs.map(async (doc) => {
        const b = doc.data() as any;
        const creatorData = (await findUserById(b.creator_id)) || {};
        return { ...b, id: doc.id, creator_username: creatorData.username || 'unknown', creator_type_name: creatorData.type || 'unknown' };
      }));
      res.json(fsBadges);
    } catch (error: any) {
      if (!error.message?.includes('PERMISSION_DENIED')) {
        console.error("Error fetching badges from Firestore:", error);
      }
      res.status(500).json({ error: "Failed to load badges" });
    }
  });

  app.post("/api/stamps", authenticateToken, checkAdmin, async (req, res) => {
    const { name, description, icon, category, creator_type, creator_id } = req.body;
    try {
      const stampId = await getNextId("passport_stamps");
      const stampData = {
        name,
        description: description || '',
        icon,
        type: category || 'event',
        creator_type,
        creator_id: creator_id ? parseInt(creator_id as string) : null,
        ambassador_id: 0,
        created_at: new Date().toISOString()
      };

      await collections.passport_stamps.doc(stampId.toString()).set(stampData);

      // Dual write to SQLite
      try {
        const stmt = db.prepare("INSERT INTO passport_stamps (name, description, icon, type, creator_type, creator_id, ambassador_id) VALUES (?, ?, ?, ?, ?, ?, ?)");
        stmt.run(name, description || '', icon, category || 'event', creator_type, creator_id || null, 0);
      } catch (sqe) {}

      res.status(201).json({ message: "Stamp created successfully", id: stampId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/stamps/:id", authenticateToken, checkAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, description, icon, category } = req.body;
    try {
      await collections.passport_stamps.doc(id).update({
        name,
        description,
        icon,
        type: category
      });

      // Dual write to SQLite
      try {
        const stmt = db.prepare(`
          UPDATE passport_stamps 
          SET name = ?, description = ?, icon = ?, type = ? 
          WHERE id = ?
        `);
        stmt.run(name, description, icon, category, id);
      } catch (sqe) {}

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

  app.get("/api/roads", async (req, res) => {
    try {
      const snapshot = await collections.discovered_routes.get();
      const routes = snapshot.docs.map(doc => {
        const route = doc.data() as any;
        return {
          route_id: doc.id,
          name: route.name,
          distance_km: route.distance_km,
          difficulty: route.difficulty,
          road_score: route.road_score,
          tags: route.tags || [],
          polyline: route.polyline || [],
          start_point: { lat: route.start_lat, lng: route.start_lng },
          metrics: {
            curvature: route.curvature,
            elevation: route.elevation,
            scenic: route.scenic,
            stops: route.stops,
            popularity: route.popularity
          }
        };
      });
      res.json(routes);
    } catch (error: any) {
      console.error("Error fetching roads from Firestore:", error);
      // Fallback
      try {
        const routes = db.prepare("SELECT * FROM discovered_routes").all() as any[];
        const formattedRoutes = routes.map(route => ({
          route_id: route.id,
          name: route.name,
          distance_km: route.distance_km,
          difficulty: route.difficulty,
          road_score: route.road_score,
          tags: typeof route.tags === 'string' ? JSON.parse(route.tags) : route.tags,
          polyline: typeof route.polyline === 'string' ? JSON.parse(route.polyline) : route.polyline,
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
      } catch (sqe) {
        res.status(500).json({ error: error.message });
      }
    }
  });

  app.get("/api/trending-routes", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 20);
    try {
      const routes = db.prepare(
        "SELECT id, name, distance_km, difficulty, road_score, popularity FROM discovered_routes ORDER BY popularity DESC, road_score DESC LIMIT ?"
      ).all(limit) as any[];
      res.json(routes.map((r) => ({
        id: r.id,
        name: r.name,
        distance_km: r.distance_km,
        difficulty: r.difficulty,
        road_score: r.road_score,
      })));
    } catch (err: any) {
      console.error("trending-routes failed:", err.message);
      res.json([]);
    }
  });

  app.get("/api/nearby-pit-stops", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 6, 20);
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const bikerCategories = ["biker_cafe", "biker_bar", "ride_stop", "meeting_spot", "motoclub", "repair", "gear_shop"];
    try {
      const cats = bikerCategories.map(() => "?").join(",");
      let rows: any[];
      if (!isNaN(lat) && !isNaN(lng)) {
        // Rough distance ordering via squared-deg (good enough for "nearby").
        rows = db.prepare(
          `SELECT place_id, name, lat, lng, category, full_address,
                  ((lat - ?) * (lat - ?) + (lng - ?) * (lng - ?)) AS dist_sq
           FROM places_cache
           WHERE category IN (${cats})
           ORDER BY dist_sq ASC
           LIMIT ?`
        ).all(lat, lat, lng, lng, ...bikerCategories, limit) as any[];
      } else {
        rows = db.prepare(
          `SELECT place_id, name, lat, lng, category, full_address
           FROM places_cache
           WHERE category IN (${cats})
           ORDER BY (rating * reviews) DESC
           LIMIT ?`
        ).all(...bikerCategories, limit) as any[];
      }
      res.json(rows.map((r) => ({
        id: r.place_id,
        name: r.name,
        category: r.category,
        full_address: r.full_address,
        lat: r.lat,
        lng: r.lng,
      })));
    } catch (err: any) {
      console.error("nearby-pit-stops failed:", err.message);
      res.json([]);
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

  app.get("/api/users/:id/recommendations", async (req, res) => {
    try {
      const snapshot = await collections.recommendations
        .where("user_id", "==", parseInt(req.params.id as string))
        .orderBy("created_at", "desc")
        .get();
      const recommendations = snapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id }));
      res.json(recommendations);
    } catch (error: any) {
      console.error("Error fetching recommendations from Firestore:", error);
      // Fallback
      try {
        const recommendations = db.prepare("SELECT * FROM recommendations WHERE user_id = ? ORDER BY created_at DESC").all(req.params.id);
        res.json(recommendations);
      } catch (sqe) {
        res.status(500).json({ error: error.message });
      }
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
  // Reviews Routes
  app.get("/api/reviews/:target_type/:target_id", async (req, res) => {
    try {
      const snapshot = await collections.reviews
        .where("target_type", "==", req.params.target_type)
        .where("target_id", "==", req.params.target_id)
        .orderBy("created_at", "desc")
        .get();
      
      const reviews = await Promise.all(snapshot.docs.map(async (doc) => {
        const review = doc.data() as any;
        const userData = (await findUserById(review.reviewer_user_id)) || {};
        return {
          ...review,
          review_id: doc.id,
          username: (userData as any).username,
          profile_picture_url: (userData as any).profile_picture_url
        };
      }));
      res.json(reviews);
    } catch (error: any) {
      console.error("Error fetching reviews from Firestore:", error);
      // Fallback
      try {
        const reviews = db.prepare(`
          SELECT r.*, u.username, u.profile_picture_url
          FROM reviews r
          JOIN users u ON r.reviewer_user_id = u.id
          WHERE r.target_type = ? AND r.target_id = ?
          ORDER BY r.created_at DESC
        `).all(req.params.target_type, req.params.target_id);
        res.json(reviews);
      } catch (sqe) {
        res.status(500).json({ error: error.message });
      }
    }
  });

  app.post("/api/reviews", authenticateToken, async (req: any, res) => {
    const { reviewer_user_id, target_type, target_id, rating, review_text } = req.body;
    if (!reviewer_user_id || !target_type || !target_id || !rating) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    if (reviewer_user_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
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

      const reviewId = await getNextId("reviews");
      const reviewData = {
        reviewer_user_id: parseInt(reviewer_user_id as string),
        target_type,
        target_id,
        rating: parseFloat(rating as string),
        review_text: review_text || null,
        verification_status: isVerified ? 'verified' : 'unverified',
        created_at: new Date().toISOString()
      };

      await collections.reviews.doc(reviewId.toString()).set(reviewData);

      // Update rating summary in Firestore (using transaction for consistency)
      const summaryId = `${target_type}_${target_id}`;
      const summaryRef = collections.rating_summaries.doc(summaryId);
      
      await firestore.runTransaction(async (transaction) => {
        const doc = await transaction.get(summaryRef);
        if (!doc.exists) {
          transaction.set(summaryRef, {
            target_type,
            target_id,
            average_rating: parseFloat(rating as string),
            total_reviews: 1,
            verified_reviews: isVerified ? 1 : 0
          });
        } else {
          const data = doc.data() as any;
          const newTotal = data.total_reviews + 1;
          const newAvg = ((data.average_rating * data.total_reviews) + parseFloat(rating as string)) / newTotal;
          transaction.update(summaryRef, {
            average_rating: newAvg,
            total_reviews: newTotal,
            verified_reviews: data.verified_reviews + (isVerified ? 1 : 0)
          });
        }
      });

      // Dual write to SQLite
      try {
        const stmt = db.prepare(`
          INSERT INTO reviews (reviewer_user_id, target_type, target_id, rating, review_text, verification_status)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(reviewer_user_id, target_type, target_id, rating, review_text || null, isVerified ? 'verified' : 'unverified');
        
        db.prepare(`
          INSERT INTO rating_summaries (target_type, target_id, average_rating, total_reviews, verified_reviews)
          VALUES (?, ?, ?, 1, ?)
          ON CONFLICT(target_type, target_id) DO UPDATE SET
          average_rating = ((average_rating * total_reviews) + ?) / (total_reviews + 1),
          total_reviews = total_reviews + 1,
          verified_reviews = verified_reviews + ?
        `).run(target_type, target_id, rating, isVerified ? 1 : 0, rating, isVerified ? 1 : 0);
      } catch (sqe) {}
      
      if (target_type === 'ecosystem') {
        const ecosystem = db.prepare("SELECT user_id FROM ecosystems WHERE id = ?").get(target_id) as any;
        if (ecosystem) {
          updateAmbassadorReputation(ecosystem.user_id);
        }
      }

      res.status(201).json({ review_id: reviewId });
    } catch (error: any) {
      console.error("Error creating review in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/rating-summaries/:target_type/:target_id", async (req, res) => {
    try {
      const summaryId = `${req.params.target_type}_${req.params.target_id}`;
      const doc = await collections.rating_summaries.doc(summaryId).get();
      if (doc.exists) {
        res.json(doc.data());
      } else {
        // Try fallback
        const summary = db.prepare("SELECT * FROM rating_summaries WHERE target_type = ? AND target_id = ?").get(req.params.target_type, req.params.target_id);
        res.json(summary || { average_rating: 0, total_reviews: 0, verified_reviews: 0 });
      }
    } catch (error: any) {
      console.error("Error fetching rating summary from Firestore:", error);
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

  app.post("/api/checkpoints", authenticateToken, checkAmbassador, async (req, res) => {
    const { route_id, type, lat, lng } = req.body;
    try {
      // Fetch route to check distance
      const routeDoc = await collections.discovered_routes.doc(route_id.toString()).get();
      if (!routeDoc.exists) {
        return res.status(404).json({ error: "Route not found" });
      }
      const route = routeDoc.data() as any;
      if (route.distance_km <= 400) {
        return res.status(400).json({ error: "Checkpoints can only be added to routes longer than 400km" });
      }

      const checkpoint_id = `cp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await collections.checkpoints.doc(checkpoint_id).set({
        route_id: parseInt(route_id as string),
        type,
        lat: parseFloat(lat as string),
        lng: parseFloat(lng as string),
        created_at: new Date().toISOString()
      });

      // Dual write to SQLite
      try {
        db.prepare("INSERT INTO checkpoints (checkpoint_id, route_id, type, lat, lng) VALUES (?, ?, ?, ?, ?)").run(checkpoint_id, route_id, type, lat, lng);
      } catch (sqe) {}

      res.json({ success: true, checkpoint_id });
    } catch (error: any) {
      console.error("Error creating checkpoint in Firestore:", error);
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

  app.post("/api/checkpoints/scan", authenticateToken, async (req: any, res) => {
    const { user_id, checkpoint_id, location_lat, location_lng } = req.body;
    
    if (user_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only scan checkpoints for yourself" });
    }

    try {
      const cpDoc = await collections.checkpoints.doc(checkpoint_id).get();
      if (!cpDoc.exists) {
        return res.status(404).json({ error: "Checkpoint not found" });
      }

      const checkpoint = cpDoc.data() as any;
      const { route_id, type, lat, lng } = checkpoint;

      // Anti-fraud: Distance validation (e.g., within 1km)
      if (location_lat && location_lng && lat && lng) {
        const distance = getDistanceFromLatLonInKm(location_lat, location_lng, lat, lng);
        if (distance > 1) { // 1 km radius
          return res.status(403).json({ error: "You are too far from the checkpoint to verify." });
        }
      }

      // Initialize progress in Firestore
      const progressId = `${user_id}_${route_id}`;
      const progressRef = collections.user_route_progress.doc(progressId);
      const progressDoc = await progressRef.get();
      
      const updates: any = {};
      if (type === 'start') updates.start_scanned = 1;
      else if (type === 'end') updates.end_scanned = 1;

      if (!progressDoc.exists) {
        await progressRef.set({
          user_id: parseInt(user_id as string),
          route_id: parseInt(route_id as string),
          start_scanned: type === 'start' ? 1 : 0,
          end_scanned: type === 'end' ? 1 : 0,
          updated_at: new Date().toISOString()
        });
      } else {
        await progressRef.update({
          ...updates,
          updated_at: new Date().toISOString()
        });
      }
      
      // Check for completion in Firestore
      const updatedProgress = (await progressRef.get()).data() as any;
      if (updatedProgress.start_scanned === 1 && updatedProgress.end_scanned === 1) {
        // Auto-verify Firestore reviews
        const reviewsSnapshot = await collections.reviews
          .where("reviewer_user_id", "==", parseInt(user_id as string))
          .where("target_id", "==", route_id.toString())
          .where("verification_status", "==", "unverified")
          .get();
        
        for (const doc of reviewsSnapshot.docs) {
          const rev = doc.data() as any;
          if (rev.target_type === 'route' || rev.target_type === 'ride_route') {
            await doc.ref.update({ verification_status: 'verified' });
            
            // Update summary
            const summaryId = `${rev.target_type}_${route_id}`;
            await collections.rating_summaries.doc(summaryId).update({
              verified_reviews: admin.firestore.FieldValue.increment(1)
            });
          }
        }
      }

      // Dual write to SQLite
      try {
        db.prepare("INSERT OR IGNORE INTO user_route_progress (user_id, route_id) VALUES (?, ?)").run(user_id, route_id);
        if (type === 'start') {
          db.prepare("UPDATE user_route_progress SET start_scanned = 1 WHERE user_id = ? AND route_id = ?").run(user_id, route_id);
        } else if (type === 'end') {
          db.prepare("UPDATE user_route_progress SET end_scanned = 1 WHERE user_id = ? AND route_id = ?").run(user_id, route_id);
        }
        
        const sqliteProgress = db.prepare("SELECT start_scanned, end_scanned FROM user_route_progress WHERE user_id = ? AND route_id = ?").get(user_id, route_id) as any;
        if (sqliteProgress && sqliteProgress.start_scanned === 1 && sqliteProgress.end_scanned === 1) {
          const unverifiedReviews = db.prepare("SELECT review_id, rating FROM reviews WHERE reviewer_user_id = ? AND (target_type = 'route' OR target_type = 'ride_route') AND target_id = ? AND verification_status = 'unverified'").all(user_id, route_id) as any[];
          for (const rev of unverifiedReviews) {
            db.prepare("UPDATE reviews SET verification_status = 'verified' WHERE review_id = ?").run(rev.review_id);
            db.prepare("UPDATE rating_summaries SET verified_reviews = verified_reviews + 1 WHERE target_type = ? AND target_id = ?").run('route', route_id);
            db.prepare("UPDATE rating_summaries SET verified_reviews = verified_reviews + 1 WHERE target_type = ? AND target_id = ?").run('ride_route', route_id);
          }
        }
      } catch (sqe) {}

      res.json({ message: "Checkpoint scanned", route_id, type });
    } catch (error: any) {
      console.error("Error scanning checkpoint in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ecosystems", async (req, res) => {
    try {
      // Try SQLite first
      const ecosystems = db.prepare(`
        SELECT e.*, u.username, u.profile_picture_url 
        FROM ecosystems e
        JOIN users u ON e.user_id = u.id
      `).all();

      if (ecosystems.length > 0) {
        return res.json(ecosystems);
      }

      // Fallback to Firestore
      try {
        const ecosystemsSnapshot = await collections.ecosystems.get();
        const firestoreEcosystems = await Promise.all(ecosystemsSnapshot.docs.map(async (doc) => {
          const eData = doc.data() as any;
          const uData = (await findUserById(eData.user_id)) || {};
          return {
            ...eData,
            username: uData.username || 'unknown',
            profile_picture_url: uData.profile_picture_url || null
          };
        }));
        res.json(firestoreEcosystems);
      } catch (err: any) {
        if (!err.message?.includes('PERMISSION_DENIED')) {
          console.error("Error fetching ecosystems from Firestore:", err.message);
        }
        res.json([]);
      }
    } catch (err: any) {
      console.error("Error fetching ecosystems:", err.message);
      res.status(500).json({ error: "Failed to fetch ecosystems" });
    }
  });

  app.get("/api/profile/:username", async (req, res) => {
    const { viewer_id } = req.query;
    const { username } = req.params;
    console.log(`DEBUG: Fetching profile for username: ${username}`);

    try {
      let user: any = null;
      // Try SQLite first as primary source of truth for profile data
      const sqliteUser = db.prepare(`
        SELECT id, username, email, fullName, location, bio, profile_picture_url, 
               cover_photo_url, type, role, plan, status, reputation, 
               created_at, motorcycle, businessName, businessType, 
               interests, services, referralCode 
        FROM users 
        WHERE LOWER(username) = LOWER(?)
      `).get(username) as any;

      user = sqliteUser || null;
      try {
        const userSnapshot = await collections.users.where("username", "==", username).limit(1).get();
        if (!userSnapshot.empty) {
          const firestoreUser = { id: userSnapshot.docs[0].id, ...userSnapshot.docs[0].data() as any };
          user = sqliteUser ? { ...firestoreUser, ...sqliteUser } : firestoreUser;
        }
      } catch (fsErr: any) {
        if (!isPermissionDeniedErr(fsErr)) {
          console.warn("Profile Firestore lookup failed (using SQLite only):", fsErr.message);
        }
      }

      if (!user) {
        console.log(`DEBUG: User not found: ${username}`);
        return res.status(404).json({ error: "User not found" });
      }

      const userId = user.id.toString();

      // Following/Followers from Firestore and SQLite
      const userStrId = user.id.toString();
      const userNumId = isNaN(Number(user.id)) ? user.id : Number(user.id);

      let followers_count = 0;
      let following_count = 0;
      let is_following = false;
      
      try {
        let sqliteFollowersCount = 0;
        let sqliteFollowingCount = 0;
        
        try {
          const fsRow = db.prepare("SELECT count(*) as c FROM followers WHERE user_id = ?").get(userNumId) as any;
          if (fsRow) sqliteFollowersCount = fsRow.c;
          
          const flRow = db.prepare("SELECT count(*) as c FROM followers WHERE follower_id = ?").get(userNumId) as any;
          if (flRow) sqliteFollowingCount = flRow.c;
        } catch (e) {}

        const followersSnap = await collections.followers.where("user_id", "==", userNumId).get();
        followers_count = followersSnap.size;
        
        if (followers_count === 0 && userStrId !== userNumId) {
          const followersSnapStr = await collections.followers.where("user_id", "==", userStrId).get();
          followers_count = followersSnapStr.size;
        }

        const followingSnap = await collections.followers.where("follower_id", "==", userNumId).get();
        following_count = followingSnap.size;
        
        if (following_count === 0 && userStrId !== userNumId) {
          const followingSnapStr = await collections.followers.where("follower_id", "==", userStrId).get();
          following_count = followingSnapStr.size;
        }

        followers_count = Math.max(followers_count, sqliteFollowersCount);
        following_count = Math.max(following_count, sqliteFollowingCount);
      } catch (err) {}
      
      if (viewer_id && viewer_id !== 'undefined') {
        const viewerNumId = isNaN(Number(viewer_id)) ? viewer_id : Number(viewer_id);
        
        try {
          const sqCheck = db.prepare("SELECT 1 FROM followers WHERE user_id = ? AND follower_id = ?").get(userNumId, viewerNumId);
          if (sqCheck) {
            is_following = true;
          }
        } catch (e) {}

        if (!is_following) {
          const followCheck = await collections.followers.doc(`${user.id}_${viewer_id}`).get();
          is_following = followCheck.exists;
        }
        
        if (!is_following) {
          // Check for string variant document ID as fallback
          const followCheckAlt = await collections.followers.where('user_id', 'in', [userNumId, userStrId]).where('follower_id', 'in', [viewerNumId, viewer_id.toString()]).get();
          is_following = !followCheckAlt.empty;
        }
      }

      // Referral count (Turso primary — Firestore data was reset).
      let referral_count = 0;
      try {
        const refRow = db.prepare("SELECT COUNT(*) as c FROM users WHERE referred_by = ?").get(user.id) as any;
        referral_count = refRow?.c || 0;
      } catch (e) {}
      if (referral_count === 0) {
        try {
          const referralSnapshot = await collections.users.where("referred_by", "==", user.id).get();
          referral_count = referralSnapshot.size;
        } catch (e: any) {
          if (!isPermissionDeniedErr(e)) console.warn("Firestore referral count failed:", e.message);
        }
      }

      const is_owner = viewer_id && viewer_id.toString() === userId;
      const can_view_locked = is_owner || is_following;

      // Posts from Firestore
      const postsSnapshot = await collections.posts
        .where("user_id", "==", user.id)
        .orderBy("created_at", "desc")
        .get();
      
      let posts = postsSnapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id }));
      posts = posts.filter(p => p.privacy_level === 'public' || can_view_locked);

      // Recommendations from Firestore
      const recommendationsSnapshot = await collections.recommendations
        .where("user_id", "==", user.id)
        .orderBy("created_at", "desc")
        .get();
      const recommendations = recommendationsSnapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id }));

      // Ambassador from Firestore
      const ambassadorDoc = await collections.ambassadors.doc(userId).get();
      const ambassador = ambassadorDoc.exists ? ambassadorDoc.data() : null;

      if (user.type === "rider") {
        const riderDoc = await collections.riders.doc(userId).get();
        // Fallback ao Turso (fonte de verdade) quando o doc do Firestore não existe.
        const rider = riderDoc.exists
          ? riderDoc.data()
          : (db.prepare("SELECT * FROM riders WHERE user_id = ?").get(user.id) || null);

        const motorcyclesSnapshot = await collections.motorcycles.where("rider_id", "==", user.id).get();
        const motorcycles = motorcyclesSnapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id }));

        // Garagem premium analytics are gated on the OWNER's plan (it's the
        // owner's tracking feature). buildGarageView strips premium fields when
        // the owner is freemium, so the data never leaves the server.
        const ownerIsPremium = (user.PLAN ?? user.plan) === 'premium' || user.role === 'admin';
        const garage = await Promise.all(motorcycles.map(async (moto) => {
          const logsSnapshot = await collections.maintenance_logs
            .where("motorcycle_id", "==", parseInt(moto.id))
            .get();
          let logs = logsSnapshot.docs.map(d => {
            const data = d.data() as any;
            return { id: d.id, ...data, date: data.date ?? data.created_at?.toDate?.()?.toISOString?.() ?? null };
          });
          if (logs.length === 0) {
            try { logs = db.prepare("SELECT * FROM maintenance_logs WHERE motorcycle_id = ?").all(parseInt(moto.id)) as any[]; } catch (e) {}
          }
          const { oil_changes, refuelings } = await fetchGarageRecords(parseInt(moto.id));
          const view = buildGarageView(moto, oil_changes, refuelings, ownerIsPremium);
          return { ...moto, maintenance_logs: logs, ...view };
        }));

        // Created events
        const createdEventsSnapshot = await collections.events.where("user_id", "==", user.id).get();
        const createdEvents = await Promise.all(createdEventsSnapshot.docs.map(async (doc) => {
          const e = doc.data() as any;
          const rsvps = await collections.event_rsvps.where("event_id", "==", doc.id).get();
          return { ...e, id: doc.id, username: user.username, profile_picture_url: user.profile_picture_url, rsvp_count: rsvps.size };
        }));

        // RSVP'd events
        const rsvpdSnapshot = await collections.event_rsvps.where("user_id", "==", user.id).get();
        const rsvpdEvents = await Promise.all(rsvpdSnapshot.docs.map(async (doc) => {
          const r = doc.data() as any;
          const eDoc = await collections.events.doc(r.event_id.toString()).get();
          if (!eDoc.exists) return null;
          const e = eDoc.data() as any;
          const host = (await findUserById(e.user_id)) || {};
          const rsvps = await collections.event_rsvps.where("event_id", "==", eDoc.id).get();
          return { ...e, id: eDoc.id, username: host.username, profile_picture_url: host.profile_picture_url, rsvp_count: rsvps.size };
        }));

        const { password: _, ...safeUser } = user;
        // Relatos de Estrada gamification (Fase 4): "Guia" title + per-moto mini-passport.
        const relatoStats = (db.prepare(
          "SELECT relatos_approved, points, title FROM relato_author_stats WHERE user_id = ?",
        ).get(user.id) as any) || { relatos_approved: 0, points: 0, title: null };
        const motoPassports = (db.prepare(
          "SELECT moto_id, make, model, year, relatos_approved, points, place_ids FROM moto_relato_stats WHERE owner_id = ?",
        ).all(user.id) as any[]).map((m) => ({
          moto_id: m.moto_id, make: m.make, model: m.model, year: m.year,
          relatos_approved: m.relatos_approved, points: m.points,
          places: (safeJsonParse(m.place_ids, []) as any[]).length,
        }));
        res.json({
          ...safeUser,
          profile: rider,
          garage,
          posts,
          events: createdEvents,
          rsvpd_events: rsvpdEvents.filter(e => e !== null),
          recommendations,
          followers_count,
          following_count,
          is_following,
          ambassador,
          referral_count,
          relatoStats,
          motoPassports
        });
      } else {
        const ecosystemDoc = await collections.ecosystems.doc(userId).get();
        // Turso é a fonte de verdade; o register cria a linha ecosystems só lá (não
        // no Firestore). Sem este fallback, profile vem null e o front quebra.
        const ecosystem = ecosystemDoc.exists
          ? ecosystemDoc.data()
          : (db.prepare("SELECT * FROM ecosystems WHERE user_id = ?").get(user.id) || null);

        // Hosted events
        const hostedEventsSnapshot = await collections.events.where("user_id", "==", user.id).get();
        const hostedEvents = await Promise.all(hostedEventsSnapshot.docs.map(async (doc) => {
          const e = doc.data() as any;
          const rsvps = await collections.event_rsvps.where("event_id", "==", doc.id).get();
          return { ...e, id: doc.id, username: user.username, profile_picture_url: user.profile_picture_url, rsvp_count: rsvps.size };
        }));

        // RSVP'd events for ecosystem
        const rsvpdSnapshot = await collections.event_rsvps.where("user_id", "==", user.id).get();
        const rsvpdEvents = await Promise.all(rsvpdSnapshot.docs.map(async (doc) => {
          const r = doc.data() as any;
          const eDoc = await collections.events.doc(r.event_id.toString()).get();
          if (!eDoc.exists) return null;
          const e = eDoc.data() as any;
          const host = (await findUserById(e.user_id)) || {};
          const rsvps = await collections.event_rsvps.where("event_id", "==", eDoc.id).get();
          return { ...e, id: eDoc.id, username: host.username, profile_picture_url: host.profile_picture_url, rsvp_count: rsvps.size };
        }));

        const { password: __, ...safeUser } = user;
        res.json({ 
          ...safeUser, 
          profile: ecosystem, 
          posts, 
          events: hostedEvents, 
          rsvpd_events: rsvpdEvents.filter(e => e !== null), 
          recommendations, 
          followers_count, 
          following_count, 
          is_following, 
          ambassador, 
          referral_count 
        });
      }
    } catch (error: any) {
      if (!error.message?.includes('PERMISSION_DENIED')) {
        console.error("Profile retrieval error in Firestore:", error);
      }
      
      // Complete Fallback for /api/profile/:username
      try {
        const user = db.prepare(`
          SELECT id, username, fullName, location, bio, profile_picture_url, 
                 cover_photo_url, type, role, plan, status, reputation, 
                 created_at, motorcycle, businessName, businessType, 
                 interests, services, referral_code as referralCode 
          FROM users 
          WHERE LOWER(username) = LOWER(?)
        `).get(req.params.username) as any;

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const followers_count = db.prepare("SELECT COUNT(*) as count FROM followers WHERE user_id = ?").get(user.id).count;
        const following_count = db.prepare("SELECT COUNT(*) as count FROM followers WHERE follower_id = ?").get(user.id).count;
        const is_following = req.query.viewer_id ? !!db.prepare("SELECT 1 FROM followers WHERE user_id = ? AND follower_id = ?").get(user.id, req.query.viewer_id) : false;
        
        let posts = db.prepare(`
          SELECT p.*, u.username, u.profile_picture_url as user_profile_pic,
                 (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes,
                 (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comments,
                 EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = ?) as userHasLiked
          FROM posts p
          JOIN users u ON p.user_id = u.id
          WHERE p.user_id = ?
          ORDER BY p.created_at DESC
        `).all(req.query.viewer_id || 0, user.id);
        
        const is_owner = req.query.viewer_id && req.query.viewer_id.toString() === user.id.toString();
        const can_view_locked = is_owner || is_following;
        posts = posts.filter((p: any) => p.privacy_level === 'public' || can_view_locked);

        const recommendations = db.prepare("SELECT * FROM recommendations WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
        let ambassador = db.prepare("SELECT * FROM ambassadors WHERE user_id = ?").get(user.id);
        if (!ambassador) {
           try {
             const aDoc = await collections.ambassadors.doc(user.id.toString()).get();
             if (aDoc.exists) ambassador = aDoc.data();
           } catch(e) {}
        }
        const referral_count = db.prepare("SELECT COUNT(*) as count FROM users WHERE referred_by = ?").get(user.id).count;

        let profile = null;
        let garage = [];
        
        if (user.type === "rider") {
          const ownerIsPremium = (user.PLAN ?? user.plan) === 'premium' || user.role === 'admin';
          profile = db.prepare("SELECT * FROM riders WHERE user_id = ?").get(user.id);
          garage = db.prepare("SELECT * FROM motorcycles WHERE rider_id = ?").all(user.id).map((moto: any) => {
            const maintenance_logs = db.prepare("SELECT * FROM maintenance_logs WHERE motorcycle_id = ?").all(moto.id);
            const oil_changes = db.prepare("SELECT * FROM oil_changes WHERE motorcycle_id = ?").all(moto.id);
            const refuelings = (db.prepare("SELECT * FROM refuelings WHERE motorcycle_id = ?").all(moto.id) as any[])
              .map((r) => ({ ...r, full_tank: !!r.full_tank }));
            const view = buildGarageView(moto, oil_changes, refuelings, ownerIsPremium);
            return { ...moto, maintenance_logs, ...view };
          });
        } else {
          profile = db.prepare("SELECT * FROM ecosystems WHERE user_id = ?").get(user.id);
        }

        const events = db.prepare(`
          SELECT e.*, u.username, u.profile_picture_url,
                 (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id) as rsvp_count
          FROM events e
          JOIN users u ON e.user_id = u.id
          WHERE e.user_id = ?
        `).all(user.id);

        const rsvpd_events = db.prepare(`
          SELECT e.*, u.username, u.profile_picture_url,
                 (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id) as rsvp_count
          FROM event_rsvps r
          JOIN events e ON r.event_id = e.id
          JOIN users u ON e.user_id = u.id
          WHERE r.user_id = ?
        `).all(user.id);

        res.json({
          ...user,
          profile,
          garage,
          posts,
          events,
          rsvpd_events,
          recommendations,
          followers_count,
          following_count,
          is_following,
          ambassador,
          referral_count
        });
      } catch (sqe: any) {
        console.error("SQLite Fallback error in profile:", sqe);
        res.status(500).json({ error: sqe.message, originalError: error.message });
      }
    }
  });

  app.get("/api/posts", async (req, res) => {
    const { user_id } = req.query;
    
    try {
      let posts: any[] = [];

      // Try Firestore first; gracefully fall back to SQLite if the query fails
      // (e.g. missing composite index on privacy_level+created_at).
      try {
        // Cap the Firestore read so a stuck gRPC connection (Avast/TLS interference
        // on long-running servers) can't hang the whole feed — fall back to SQLite.
        const fsTimeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("firestore posts timeout")), 4500));
        const firestorePostsSnap: any = await Promise.race([
          collections.posts
            .where("privacy_level", "==", "public")
            .orderBy("created_at", "desc")
            .limit(50)
            .get(),
          fsTimeout,
        ]);

        for (const doc of firestorePostsSnap.docs) {
        const data = doc.data() as any;
        let motoData: any = null;
        let eventData: any = null;
        let hasLiked = false;
        let isPinned = false;
        
        try {
          if (data.tagged_motorcycle_id) {
              // Priority 1: Check Firestore
              const motoDoc = await collections.motorcycles.doc(data.tagged_motorcycle_id.toString()).get();
              if (motoDoc.exists) {
                const fsMotoData = motoDoc.data() as any;
                if (Number(fsMotoData.rider_id) === Number(data.user_id)) {
                   motoData = fsMotoData;
                }
              }
              
              if (!motoData) {
                // Try SQLite if not in Firestore or rider mismatch
                const parsedId = parseInt(data.tagged_motorcycle_id, 10);
                if (!isNaN(parsedId)) {
                  motoData = db.prepare("SELECT rider_id, make, model, year FROM motorcycles WHERE id = ?").get(parsedId);
                  // Prevent showing mockup/other user's motos in case of ID collisions
                  if (motoData && Number(motoData.rider_id) !== Number(data.user_id)) {
                    motoData = null;
                  }
                }
              }
          }
          if (data.shared_event_id) {
            const eventDoc = await collections.events.doc(data.shared_event_id.toString()).get();
            if (eventDoc.exists) {
              eventData = eventDoc.data();
            } else {
              eventData = db.prepare("SELECT title, date, image_url, location FROM events WHERE id = ?").get(data.shared_event_id);
            }
          }
          if (user_id) {
            // Check Firestore for likes first
            const likeDoc = await collections.post_likes.doc(`${data.id}_${user_id}`).get();
            if (likeDoc.exists) {
               hasLiked = true;
            } else {
               const likeCheck = db.prepare("SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?").get(data.id, user_id);
               if (likeCheck) hasLiked = true;
            }
            
            // Check pins
            const pinCheck = db.prepare("SELECT 1 FROM user_pinned_posts WHERE post_id = ? AND user_id = ?").get(data.id, user_id);
            if (pinCheck) isPinned = true;
          }
        } catch(e) {}

        posts.push({
          ...data,
          make: motoData?.make || data.make,
          model: motoData?.model || data.model,
          year: motoData?.year || data.year,
          shared_event_title: eventData?.title || data.shared_event_title,
          shared_event_date: eventData?.date || data.shared_event_date,
          shared_event_image_url: eventData?.image_url || data.shared_event_image_url,
          shared_event_location: eventData?.location || data.shared_event_location,
          likes_count: data.respect_count || 0,
          respect_count: data.respect_count || 0,
          has_liked: hasLiked,
          is_pinned: isPinned ? 1 : (data.is_pinned || 0)
        });
      }
      } catch (fsErr: any) {
        // Firestore query failed (e.g. missing composite index). Fall through to SQLite.
        if (!isPermissionDeniedErr(fsErr)) console.error("Firestore posts fetch failed, falling back to SQLite:", fsErr);
      }

      // For migration, we still mix in SQLite posts if Firestore is empty or sparsely populated
      if (posts.length < 10) {
        // Validate user_id to prevent SQL injection before embedding in subquery.
        const safeUid = user_id && /^\d+$/.test(String(user_id)) ? Number(user_id) : -1;
        const sqlitePosts = db.prepare(`
          SELECT p.*, u.username, u.type, u.profile_picture_url,
                r.name as rider_name, e.company_name, e.service_category,
                m.make, m.model, m.year,
                ev.title as shared_event_title, ev.date as shared_event_date, ev.image_url as shared_event_image_url, ev.location as shared_event_location,
                p.respect_count as likes_count,
                p.respect_count,
                p.comment_count,
                (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id AND user_id = ?) > 0 as has_liked,
                (SELECT COUNT(*) FROM user_pinned_posts WHERE post_id = p.id AND user_id = ?) > 0 as is_pinned
          FROM posts p
          JOIN users u ON p.user_id = u.id
          LEFT JOIN riders r ON u.id = r.user_id
          LEFT JOIN ecosystems e ON u.id = e.user_id
          LEFT JOIN motorcycles m ON p.tagged_motorcycle_id = m.id AND m.rider_id = p.user_id
          LEFT JOIN events ev ON CAST(p.shared_event_id AS INTEGER) = ev.id
          WHERE (p.privacy_level = 'public' OR p.user_id = ?)
          ORDER BY is_pinned DESC, p.created_at DESC
          LIMIT 50
        `).all(safeUid, safeUid, safeUid);
        
        // Deduplicate using user_id and content, and fallback to id
        const firestoreSignatures = new Set(posts.map(p => `${p.user_id}_${String(p.content).trim()}`));
        const firestoreIds = new Set(posts.map(p => p.id));
        
        const filteredSqlite = sqlitePosts.filter((sqp: any) => {
          if (firestoreIds.has(sqp.id)) return false;
          if (firestoreSignatures.has(`${sqp.user_id}_${String(sqp.content).trim()}`)) return false;
          return true;
        });
        
        posts = [...posts, ...filteredSqlite];
      }

      // Final deduplicate any strange identical posts array-wide
      const uniquePosts: any[] = [];
      const seenSigs = new Set();
      for (const p of posts) {
        const sig = `${p.user_id}_${String(p.content).trim()}`;
        if (!seenSigs.has(sig)) {
          seenSigs.add(sig);
          uniquePosts.push(p);
        }
      }
      posts = uniquePosts;

      // Resolve projected Relatos de Estrada (shared_relato_id) from the SQLite
      // mirror (approved/featured only) so the feed can render a relato card.
      for (const p of posts) {
        // Backfill author fields for any post missing them (e.g. older projected
        // relato posts) — the client reads username straight off the post.
        if (!p.username && p.user_id != null) {
          try {
            const u = db.prepare("SELECT username, type AS user_type, profile_picture_url FROM users WHERE id = ?").get(p.user_id) as any;
            if (u) {
              p.username = u.username;
              p.user_type = p.user_type || u.user_type;
              p.profile_picture_url = p.profile_picture_url || u.profile_picture_url;
            }
          } catch (e) { /* leave as-is */ }
        }
        if (p.shared_relato_id && !p.relato) {
          try {
            const rm = db.prepare(
              "SELECT id, title, body, verification_level, anchor_type, anchor_id, media, moto_used, author_name FROM relatos WHERE id = ?",
            ).get(String(p.shared_relato_id)) as any;
            if (rm) {
              p.relato = {
                id: rm.id, title: rm.title, body: rm.body, verificationLevel: rm.verification_level,
                anchorType: rm.anchor_type, anchorId: rm.anchor_id, authorName: rm.author_name,
                media: safeJsonParse(rm.media, []), motoUsed: safeJsonParse(rm.moto_used, null),
              };
            }
          } catch (e) { /* leave as a plain post */ }
        }
      }

      res.json(posts);
    } catch (error: any) {
      console.error("GET posts error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/posts/:id/pin", authenticateToken, async (req: any, res) => {
    const postId = req.params.id;
    const userId = req.user.id;

    try {
      // Check if post exists — SQLite first, then Firestore (handles IDs that pre-date the
      // dual-write fix where Firestore and SQLite IDs diverged).
      let post: any = db.prepare("SELECT id, user_id FROM posts WHERE id = ?").get(postId);
      if (!post) {
        const fsDoc = await collections.posts.doc(postId.toString()).get();
        if (!fsDoc.exists) {
          return res.status(404).json({ error: "Post not found" });
        }
        post = { id: postId, user_id: fsDoc.data()?.user_id };
      }
      if (String(post.user_id) !== String(userId)) {
        return res.status(403).json({ error: "You can only pin your own posts" });
      }

      const existingPin = db.prepare("SELECT * FROM user_pinned_posts WHERE user_id = ? AND post_id = ?").get(userId, postId);

      try {
        db.transaction(() => {
          // Always clear existing pin for this user (since only one can be pinned)
          db.prepare("DELETE FROM user_pinned_posts WHERE user_id = ?").run(userId);
          
          // If it wasn't this specific post, pin it now
          if (!existingPin) {
            const postExists = db.prepare("SELECT id FROM posts WHERE id = ?").get(postId);
            const userExists = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
            if (postExists && userExists) {
              db.prepare("INSERT INTO user_pinned_posts (user_id, post_id) VALUES (?, ?)").run(userId, postId);
            }
          }
        })();
      } catch (sqe) {
        console.error("SQLite pin insert failed", sqe);
      }

      res.json({ success: true, is_pinned: !existingPin });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/posts/:id/like", authenticateToken, async (req: any, res) => {
    const { user_id } = req.body;
    const post_id = req.params.id;
    
    if (!user_id) return res.status(400).json({ error: "User ID is required" });
    
    if (Number(user_id) !== Number(req.user.id) && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only like posts for yourself" });
    }

    try {
      let existing: any = null;
      let hasLikedInFirestore = false;
      const likeDocId = `${post_id}_${user_id}`;

      try {
        existing = db.prepare("SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?").get(post_id, user_id);
      } catch (sqliteErr) {
        console.error("SQLite select like failed", sqliteErr);
      }

      try {
        const fsLike = await collections.post_likes.doc(likeDocId).get();
        if (fsLike.exists) hasLikedInFirestore = true;
      } catch (e) { }

      const isLiking = !(existing || hasLikedInFirestore);

      try {
        db.transaction(() => {
          const postExists = db.prepare("SELECT id FROM posts WHERE id = ?").get(post_id);
          const userExists = db.prepare("SELECT id FROM users WHERE id = ?").get(user_id);
          
          if (postExists && userExists) {
            if (!isLiking) {
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
                  if (liker) {
                    db.prepare("INSERT INTO notifications (user_id, type, content, link) VALUES (?, ?, ?, ?)").run(
                      post.user_id, 'like', `${liker.username} respected your post.`, `/profile/${liker.username}`
                    );
                  }
                }
              }
            }
          }
        })();
      } catch (sqliteErr) {
        console.error("SQLite like update failed, possibly due to orphaned post_id", sqliteErr);
      }

      try {
        const postRef = collections.posts.doc(post_id.toString());
        await firestore.runTransaction(async (t) => {
          const pDoc = await t.get(postRef);
          if (pDoc.exists) {
            const currentRespect = pDoc.data()?.respect_count || 0;
            const newRespect = isLiking ? currentRespect + 1 : Math.max(0, currentRespect - 1);
            t.update(postRef, { respect_count: newRespect });
          }
        });
        
        // Also update the post_likes collection and notifications
        if (isLiking) {
            await collections.post_likes.doc(likeDocId).set({
                post_id: post_id.toString(),
                user_id: user_id.toString(),
                created_at: new Date().toISOString()
            });

            // Create firestore notification
            try {
                const postSnap = await collections.posts.doc(post_id.toString()).get();
                if (postSnap.exists) {
                    const postData = postSnap.data();
                    if (postData?.user_id && postData.user_id.toString() !== user_id.toString()) {
                         const likerName = req.user.username || "Someone";
                         await collections.notifications.add({
                             user_id: postData.user_id,
                             type: 'like',
                             content: `${likerName} respected your post.`,
                             link: `/profile/${likerName}`,
                             read: false,
                             created_at: new Date().toISOString()
                         });
                    }
                }
            } catch(e) { }

        } else {
            await collections.post_likes.doc(likeDocId).delete();
        }

      } catch (err) {
        console.error("Failed to sync respect_count to Firestore:", err);
      }
      
      res.json({ success: true, action: isLiking ? 'liked' : 'unliked' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/posts/:id/comments", async (req, res) => {
    const post_id = req.params.id;
    try {
      let comments: any[] = [];
      
      // 1. Fetch from Firestore
      try {
        const firestoreCommentsSnap = await collections.comments
          .where("post_id", "==", parseInt(post_id as string))
          .get();
          
        for (const doc of firestoreCommentsSnap.docs) {
          const cData = doc.data() as any;
          // Get user details (SQLite-first via helper).
          const userData: any = await findUserById(cData.user_id);
          
          comments.push({
             id: doc.id,
             ...cData,
             username: userData?.username || "Unknown",
             profile_picture_url: userData?.profile_picture_url || null
          });
        }
      } catch (fErr) {
         // Silently fallback if missing index or firestore error
         console.error("Firestore comments fetch error:", fErr);
      }
      
      // 2. Fetch from SQLite
      try {
        const sqliteComments = db.prepare(`
          SELECT c.*, u.username, u.profile_picture_url
          FROM post_comments c
          JOIN users u ON c.user_id = u.id
          WHERE c.post_id = ?
          ORDER BY c.created_at ASC
        `).all(post_id);
        
        // 3. Deduplicate
        for (const sqc of sqliteComments) {
          const duplicate = comments.find(c => c.user_id == sqc.user_id && c.content.trim() === sqc.content.trim());
          if (!duplicate) {
             comments.push(sqc);
          }
        }
      } catch (sqErr) {}

      // Sort combined
      comments.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      res.json(comments);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/posts/:id/comments", authenticateToken, async (req: any, res) => {
    const post_id = req.params.id;
    const { content } = req.body;
    const user_id = req.user.id;

    if (!content) return res.status(400).json({ error: "Comment content is required" });

    try {
      const commentId = Math.random().toString(36).substring(2, 15);
      const now = new Date().toISOString();
      const commentData = {
        post_id: parseInt(post_id as string),
        user_id: parseInt(user_id as string),
        content,
        created_at: now
      };

      await collections.comments.doc(commentId).set(commentData);
      
      // Update post comment count in Firestore
      const postRef = collections.posts.doc(post_id.toString());
      await firestore.runTransaction(async (t) => {
        const pDoc = await t.get(postRef);
        if (pDoc.exists) {
          const newCount = (pDoc.data()?.comment_count || 0) + 1;
          t.update(postRef, { comment_count: newCount });
        }
      });

      // Notification in Firestore
      const postDoc = await collections.posts.doc(post_id.toString()).get();
      if (postDoc.exists) {
        const post = postDoc.data() as any;
        if (post.user_id.toString() !== user_id.toString()) {
          const commenter = (await findUserById(user_id)) || { username: "Someone" };
          
          const notifId = Math.random().toString(36).substring(2, 15);
          await collections.notifications.doc(notifId).set({
            user_id: post.user_id,
            type: 'comment',
            content: `${commenter.username} commented on your post.`,
            link: `/profile/${commenter.username}`,
            is_read: 0,
            created_at: now
          });
        }
      }

      // Dual-write to SQLite
      try {
        db.transaction(() => {
          const postExists = db.prepare("SELECT id FROM posts WHERE id = ?").get(post_id);
          const userExists = db.prepare("SELECT id FROM users WHERE id = ?").get(user_id);
          
          if (postExists && userExists) {
            db.prepare("INSERT INTO post_comments (post_id, user_id, content) VALUES (?, ?, ?)").run(post_id, user_id, content);
            db.prepare("UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?").run(post_id);
            
            // SQLite Notification fallback
            const post = db.prepare("SELECT user_id FROM posts WHERE id = ?").get(post_id) as any;
            if (post && post.user_id !== user_id) {
              const commenter = db.prepare("SELECT username FROM users WHERE id = ?").get(user_id) as any;
              if (commenter) {
                db.prepare("INSERT INTO notifications (user_id, type, content, link) VALUES (?, ?, ?, ?)").run(
                  post.user_id, 'comment', `${commenter.username} commented on your post.`, `/profile/${commenter.username}`
                );
              }
            }
          }
        })();
      } catch (sqe) {
        console.error("SQLite comment insert failed", sqe);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error adding comment in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/users/:id/follow", authenticateToken, async (req: any, res) => {
    const { follower_id } = req.body;
    const user_id = req.params.id;
    
    if (!follower_id) return res.status(400).json({ error: "Follower ID is required" });
    
    // Convert to strings for consistent comparison
    const s_follower_id = follower_id.toString();
    const s_user_id = user_id.toString();

    if (s_follower_id === s_user_id) {
      return res.status(400).json({ error: "You cannot follow yourself" });
    }

    if (s_follower_id !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only follow users for yourself" });
    }

    try {
      const parsedUserId = isNaN(Number(user_id)) ? user_id : Number(user_id);
      const parsedFollowerId = isNaN(Number(follower_id)) ? follower_id : Number(follower_id);
      
      await ensureSqliteUserExists(parsedUserId);
      await ensureSqliteUserExists(parsedFollowerId);
      
      const followId = `${user_id}_${follower_id}`;
      
      let isFollowingSQLite = false;
      try {
        const sqCheck = db.prepare("SELECT 1 FROM followers WHERE user_id = ? AND follower_id = ?").get(parsedUserId, parsedFollowerId);
        if (sqCheck) isFollowingSQLite = true;
      } catch (e) {}

      let isFollowingFirestore = false;
      try {
        const followDoc = await collections.followers.doc(followId).get();
        if (followDoc.exists) isFollowingFirestore = true;
      } catch (e) {}

      if (isFollowingFirestore || isFollowingSQLite) {
        // UNFOLLOW — delete Firestore doc, then delete SQLite row independently
        try {
          await collections.followers.doc(followId).delete();
        } catch (e) {}

        try {
          db.prepare("DELETE FROM followers WHERE user_id = ? AND follower_id = ?").run(parsedUserId, parsedFollowerId);
        } catch (sqe) {
          console.error("SQLite delete followers error:", sqe);
        }

        res.json({ success: true, action: 'unfollowed' });
      } else {
        const now = new Date().toISOString();
        
        await collections.followers.doc(followId).set({
          user_id: parsedUserId,
          follower_id: parsedFollowerId,
          created_at: now
        });
        
        // Create notification in Firestore
        let follower: any = { username: "Someone" };
        try {
          follower = await findUserById(follower_id);
        } catch(e) {}
        
        try {
          const notifId = Math.random().toString(36).substring(2, 15);
          await collections.notifications.doc(notifId).set({
            user_id: parsedUserId,
            type: 'follow',
            content: `${follower.username} started following you.`,
            link: `/profile/${follower.username}`,
            is_read: 0,
            created_at: now
          });
        } catch(e) {}

        // Dual-write SQLite
        try {
          const userExists = db.prepare("SELECT 1 FROM users WHERE id = ?").get(parsedUserId);
          const followerExists = db.prepare("SELECT 1 FROM users WHERE id = ?").get(parsedFollowerId);
          if (userExists && followerExists) {
            db.prepare("INSERT OR IGNORE INTO followers (user_id, follower_id) VALUES (?, ?)").run(parsedUserId, parsedFollowerId);
          }
        } catch (sqe) {
          console.error("SQLite insert followers error:", sqe);
        }
        try {
          const userExists = db.prepare("SELECT 1 FROM users WHERE id = ?").get(parsedUserId);
          if (userExists) {
            // Check if table notifications has type and link columns
            db.prepare("INSERT INTO notifications (user_id, content) VALUES (?, ?)").run(
              parsedUserId, `${follower.username} started following you.`
            );
          }
        } catch (sqe) {
           console.error("SQLite insert notifications error:", sqe);
        }
        
        res.json({ success: true, action: 'followed' });
      }
    } catch (error: any) {
      console.error("Error in follow action in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/events/:id/photos", authenticateToken, upload.single("image"), async (req: any, res) => {
    const eventId = req.params.id;
    const userId = req.body.userId;
    let imageUrl = null;

    if (req.file) {
      try {
        imageUrl = await uploadToFirebase(req.file, "event_photos");
      } catch (err) {
        return res.status(500).json({ error: "Failed to upload photo" });
      }
    }
    
    if (userId.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only upload photos for yourself" });
    }

    try {
      const photoId = await getNextId("event_photos");
      const photoData = {
        id: photoId,
        event_id: Number(eventId),
        user_id: Number(userId),
        image_url: imageUrl,
        status: 'pending',
        created_at: admin.firestore.FieldValue.serverTimestamp()
      };

      await collections.event_photos.doc(photoId.toString()).set(photoData);

      // Dual-write to SQLite
      try {
        db.prepare("INSERT OR REPLACE INTO event_photos (id, event_id, user_id, image_url) VALUES (?, ?, ?, ?)")
          .run(photoId, eventId, userId, imageUrl);
      } catch (sqe) {}
      
      res.json({ success: true, id: photoId });
    } catch (error: any) {
      console.error("Error adding event photo to Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events/:id/photos", async (req, res) => {
    const { id } = req.params;
    try {
      const photosSnapshot = await collections.event_photos
        .where("event_id", "==", Number(id))
        .where("status", "==", "approved")
        .get();
      const photos = photosSnapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id }));
      res.json(photos);
    } catch (error: any) {
      console.error("Error fetching event photos from Firestore:", error);
      res.status(500).json({ error: "Failed to fetch photos" });
    }
  });

  app.get("/api/events/:id/pending-photos", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      const eventDoc = await collections.events.doc(id).get();
      if (!eventDoc.exists) return res.status(404).json({ error: "Event not found" });
      const event = eventDoc.data() as any;
      
      const isHostOrAdmin = event.user_id.toString() === req.user.id.toString() || req.user.role === 'admin' || req.user.role === 'moderator';

      let query = collections.event_photos.where("event_id", "==", Number(id)).where("status", "==", "pending");
      
      if (!isHostOrAdmin) {
        // Regular user only sees their own pending photos
        query = query.where("user_id", "==", Number(req.user.id));
      }
      
      const photosSnapshot = await query.get();
      const photos = photosSnapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id }));
      res.json(photos);
    } catch (error: any) {
      console.error("Error fetching pending event photos from Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/events/photos/:photoId/status", authenticateToken, async (req: any, res) => {
    const { status } = req.body;
    const { photoId } = req.params;
    
    try {
      const photoDoc = await collections.event_photos.doc(photoId).get();
      if (!photoDoc.exists) return res.status(404).json({ error: "Photo not found" });
      const photoData = photoDoc.data() as any;
      
      const eventDoc = await collections.events.doc(photoData.event_id.toString()).get();
      if (!eventDoc.exists) return res.status(404).json({ error: "Event not found" });
      const event = eventDoc.data() as any;
      
      if (event.user_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: Only the event host can manage photo status" });
      }

      await collections.event_photos.doc(photoId).update({ status });

      // Dual-write to SQLite
      try {
        db.prepare("UPDATE event_photos SET status = ? WHERE id = ?").run(status, photoId);
      } catch (sqe) {}

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating event photo status in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/events/photos/bulk-status", authenticateToken, async (req: any, res) => {
    const { photoIds, status } = req.body;
    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return res.status(400).json({ error: "Invalid photoIds" });
    }
    try {
      const photoDocs = await Promise.all(photoIds.map(id => collections.event_photos.doc(id.toString()).get()));
      const photos = photoDocs.filter(d => d.exists).map(d => d.data() as any);
      
      if (photos.length === 0) return res.status(404).json({ error: "Photos not found" });

      const eventIds = [...new Set(photos.map(p => p.event_id))];
      const eventDocs = await Promise.all(eventIds.map(id => collections.events.doc(id.toString()).get()));
      const events = eventDocs.filter(d => d.exists).map(d => d.data() as any);
      
      const isAuthorized = req.user.role === 'admin' || req.user.role === 'moderator' || events.every(e => e.user_id.toString() === req.user.id.toString());
      
      if (!isAuthorized) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const batch = firestore.batch();
      photoIds.forEach(id => {
        batch.update(collections.event_photos.doc(id.toString()), { status });
      });
      await batch.commit();

      // Dual-write to SQLite
      try {
        const placeholders = photoIds.map(() => '?').join(',');
        db.prepare(`UPDATE event_photos SET status = ? WHERE id IN (${placeholders})`).run(status, ...photoIds);
      } catch (sqe) {}

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error bulk updating event photos in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/events/photos/:photoId", authenticateToken, async (req: any, res) => {
    const { photoId } = req.params;
    try {
      const photoDoc = await collections.event_photos.doc(photoId).get();
      if (!photoDoc.exists) return res.status(404).json({ error: "Photo not found" });
      const photo = photoDoc.data() as any;
      
      const eventDoc = await collections.events.doc(photo.event_id.toString()).get();
      if (!eventDoc.exists) return res.status(404).json({ error: "Event not found" });
      const event = eventDoc.data() as any;
      
      if (event.user_id.toString() !== req.user.id.toString() && photo.user_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: You don't have permission to delete this photo" });
      }

      await collections.event_photos.doc(photoId).delete();

      // Dual-write to SQLite
      try {
        db.prepare("DELETE FROM event_photos WHERE id = ?").run(photoId);
      } catch (sqe) {}

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting event photo in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/pending-event-photos", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const photosSnapshot = await collections.event_photos.where("status", "==", "pending").orderBy("created_at", "desc").get();
      const photos = await Promise.all(photosSnapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const eventDoc = await collections.events.doc(data.event_id.toString()).get();
        const userData = await findUserById(data.user_id);
        return {
          id: doc.id,
          ...data,
          event_title: eventDoc.exists ? (eventDoc.data() as any).title : "Unknown Event",
          username: userData?.username || "Unknown User"
        };
      }));
      res.json(photos);
    } catch (error: any) {
      console.error("Error fetching pending event photos from Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events", async (req, res) => {
    const { username, category, location, source_type } = req.query;
    let userId = null;
    if (username && typeof username === 'string') {
      const found = await findUserByUsername(username);
      if (found) userId = found.id;
    }

    const validSourceTypes = ['all', 'internal', 'external'];
    const sourceTypeFilter = (typeof source_type === 'string' && validSourceTypes.includes(source_type))
      ? source_type : 'all';
    if (source_type && !validSourceTypes.includes(source_type as string)) {
      return res.status(400).json({ error: "source_type must be 'all', 'internal', or 'external'" });
    }

    try {
      let query: admin.firestore.Query = collections.events.where("is_approved", "==", 1);

      if (category && category !== 'all') {
        query = query.where("category", "==", category);
      }

      const snapshot = await query.get();
      let events = snapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id }));

      // Filter source_type in-memory rather than via Firestore .where(): a Firestore
      // equality clause skips docs that lack the field entirely, so legacy events
      // (created before source_type existed) would silently disappear from the
      // "Community" filter. Treat a missing field as 'internal' (the SQLite default).
      if (sourceTypeFilter !== 'all') {
        events = events.filter(e => (e.source_type || 'internal') === sourceTypeFilter);
      }

      if (location) {
        events = events.filter(e => e.location?.toLowerCase().includes((location as string).toLowerCase()));
      }

      // Populate host and stats
      const populatedEvents = await Promise.all(events.map(async (ev) => {
        const hostData = (await findUserById(ev.user_id)) || {};
        const ecoDoc = await collections.ecosystems.doc(ev.user_id.toString()).get();
        const ecoData = ecoDoc.exists ? ecoDoc.data() : {};
        
        const rsvpSnapshot = await collections.event_rsvps.where("event_id", "==", ev.id).get();
        const hasRsvpd = userId ? rsvpSnapshot.docs.some(d => d.data().user_id.toString() === userId.toString()) : false;

        return {
          ...ev,
          username: hostData?.username || 'Unknown',
          profile_picture_url: hostData?.profile_picture_url || null,
          company_name: (ecoData as any)?.company_name || null,
          service_category: (ecoData as any)?.service_category || null,
          rsvp_count: rsvpSnapshot.size,
          has_rsvpd: hasRsvpd ? 1 : 0
        };
      }));

      // Sort: promoted first, then date
      populatedEvents.sort((a, b) => {
        if (b.is_promoted !== a.is_promoted) return (b.is_promoted || 0) - (a.is_promoted || 0);
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });

      res.json(populatedEvents);
    } catch (error: any) {
      console.error("Error fetching events from Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events/:id", async (req, res) => {
    const { id } = req.params;
    const { username } = req.query;
    let userId = null;
    if (username && typeof username === 'string') {
      const found = await findUserByUsername(username);
      if (found) userId = found.id;
    }

    try {
      const eventDoc = await collections.events.doc(id).get();
      if (!eventDoc.exists) {
        return res.status(404).json({ error: "Event not found" });
      }
      const eventData = eventDoc.data() as any;

      const hostData = (await findUserById(eventData.user_id)) || {};
      const ecoDoc = await collections.ecosystems.doc(eventData.user_id.toString()).get();
      const ecoData = ecoDoc.exists ? ecoDoc.data() : {};
      
      const rsvpSnapshot = await collections.event_rsvps.where("event_id", "==", id).get();
      const hasRsvpd = userId ? rsvpSnapshot.docs.some(d => d.data().user_id.toString() === userId.toString()) : false;

      const event = {
        id: eventDoc.id,
        ...eventData,
        username: hostData?.username || 'Unknown',
        profile_picture_url: hostData?.profile_picture_url || null,
        company_name: (ecoData as any)?.company_name || null,
        service_category: (ecoData as any)?.service_category || null,
        rsvp_count: rsvpSnapshot.size,
        has_rsvpd: hasRsvpd ? 1 : 0
      };

      res.json(event);
    } catch (error: any) {
      console.error("Error fetching eventById from Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/events", authenticateToken, checkFeatureAccess('create_event'), async (req: any, res) => {
    const { username, title, description, date, time, location, image_url, participation_badge_id, category, participation_stamp_id, price, external_link, price_starting_from } = req.body;
    
    if (username !== req.user.username && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only create events for yourself" });
    }

    try {
      const user = { id: req.user.id, username: req.user.username, role: req.user.role };

      const newId = await getNextId("events");
      const eventData = {
        user_id: user.id,
        title,
        description: description || null,
        date: date || new Date().toISOString().split('T')[0],
        time: time || null,
        location: location || null,
        image_url: image_url || null,
        participation_badge_id: participation_badge_id || null,
        participation_stamp_id: participation_stamp_id || null,
        category: category || 'other',
        price: price || null,
        external_link: external_link || null,
        price_starting_from: price_starting_from ? 1 : 0,
        is_promoted: 0,
        is_approved: 1, // Auto-approve for now or based on rules
        source_type: "internal",
        source_name: "user_created",
        created_by_user_id: user.id.toString(),
        ingested_at: null as null,
        is_verified: false,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      };

      await collections.events.doc(newId.toString()).set(eventData);

      // Determine approval status — check SQLite first, then Firestore.
      const sqliteAmbassador = db.prepare("SELECT is_active FROM ambassadors WHERE user_id = ?").get(user.id) as any;
      let isAmbassadorActive = sqliteAmbassador?.is_active === 1;
      if (!isAmbassadorActive) {
        try {
          const ambassadorSnapshot = await collections.ambassadors.doc(user.id.toString()).get();
          if (ambassadorSnapshot.exists && (ambassadorSnapshot.data() as any).is_active) {
            isAmbassadorActive = true;
          }
        } catch (e: any) {
          if (!isPermissionDeniedErr(e)) console.warn("ambassador Firestore check failed:", e.message);
        }
      }
      const isApproved = (user.role === 'admin' || user.role === 'moderator' || isAmbassadorActive) ? 1 : 0;
      
      if (!isApproved) {
        await collections.events.doc(newId.toString()).update({ is_approved: 0 });
      }

      // Dual-write to SQLite
      try {
        db.prepare(`
          INSERT OR REPLACE INTO events (id, user_id, title, description, date, time, location, image_url, participation_badge_id, category, participation_stamp_id, is_approved, price, external_link, price_starting_from) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newId, user.id, title, description, date, time, location, image_url, participation_badge_id, category, participation_stamp_id, isApproved, price || null, external_link || null, price_starting_from ? 1 : 0);
      } catch (sqError) {
        console.error("SQLite insert failed for event:", sqError);
      }

      // Async update reputation
      await updateAmbassadorReputation(user.id);

      res.status(201).json({ id: newId, ...eventData, is_approved: isApproved });
    } catch (error: any) {
      console.error("Error creating event in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/events/:id", authenticateToken, async (req: any, res) => {
    const { title, description, date, time, location, image_url, participation_badge_id, category, participation_stamp_id, price, external_link, price_starting_from } = req.body;
    const { id } = req.params;

    try {
      const eventDoc = await collections.events.doc(id).get();
      if (!eventDoc.exists) {
        return res.status(404).json({ error: "Event not found" });
      }
      const event = eventDoc.data() as any;
      if (event.user_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: You can only update your own events" });
      }

      const updateData = {
        title: title || event.title || 'Untitled',
        description: description !== undefined ? description : (event.description || null),
        date: date || event.date || new Date().toISOString().split('T')[0],
        time: time !== undefined ? time : (event.time || null),
        location: location !== undefined ? location : (event.location || null),
        image_url: image_url !== undefined ? image_url : (event.image_url || null),
        participation_badge_id: participation_badge_id !== undefined ? participation_badge_id : (event.participation_badge_id || null),
        participation_stamp_id: participation_stamp_id !== undefined ? participation_stamp_id : (event.participation_stamp_id || null),
        category: category || event.category || 'other',
        price: price !== undefined ? price : (event.price || null),
        external_link: external_link !== undefined ? external_link : (event.external_link || null),
        price_starting_from: price_starting_from !== undefined ? (price_starting_from ? 1 : 0) : (event.price_starting_from || 0),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      };

      await collections.events.doc(id).update(updateData);

      // Dual-write to SQLite
      try {
        db.prepare(`
          UPDATE events 
          SET title = ?, description = ?, date = ?, time = ?, location = ?, image_url = ?, participation_badge_id = ?, category = ?, participation_stamp_id = ?, price = ?, external_link = ?, price_starting_from = ?
          WHERE id = ?
        `).run(
          updateData.title, updateData.description, updateData.date, updateData.time, 
          updateData.location, updateData.image_url, updateData.participation_badge_id || null, 
          updateData.category || 'other', updateData.participation_stamp_id || null, updateData.price || null, updateData.external_link || null, updateData.price_starting_from, id
        );
      } catch (sqError) {
        console.error("SQLite update failed for event:", sqError);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating event in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Relatos de Estrada (Fase 0) — secure write path ====================
  // All creation/transition goes through the server (Admin SDK). The client may
  // ONLY request a status of 'draft' or 'pending'; status, verificationLevel,
  // qualitySignals, origin, featuredAt/Until, moderationNotes and author* are
  // SERVER-ASSIGNED and silently ignored if sent (relatoCreateSchema strips unknown
  // keys). The Firestore `relatos` doc is the source of truth across the whole
  // lifecycle; the SQLite mirror is only written on approval (Fase 2), so
  // draft/pending/rejected never reach public read paths.
  // Anchor picker (Fase 1): search existing places in places_cache by name.
  app.get("/api/relatos/places/search", authenticateToken, async (req: any, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json([]);
    try {
      return res.json(searchCachedPlaces(q, 10));
    } catch (error: any) {
      console.error("relato place search error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Dedup for a NEW place candidate (Fase 1): "você quis dizer um destes aqui perto?".
  app.get("/api/relatos/places/dedup", authenticateToken, async (req: any, res) => {
    const name = String(req.query.name || "").trim();
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!name || Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: "name, lat and lng are required" });
    }
    try {
      return res.json(dedupPlaces(name, { lat, lng }));
    } catch (error: any) {
      console.error("relato dedup error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Upload one relato photo → returns { url } for the media[] array (Fase 1).
  app.post("/api/relatos/media", authenticateToken, upload.single("image"), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: "No image provided" });
    try {
      const url = await uploadToFirebase(req.file, "relatos");
      return res.status(201).json({ type: "photo", url });
    } catch (error: any) {
      console.error("relato media upload error:", error);
      return res.status(500).json({ error: "Upload failed" });
    }
  });

  // The author's own relatos (any status) — for "Meus relatos" + draft resume
  // (works across devices since drafts live server-side). Registered BEFORE the
  // /:id route so "mine" isn't captured as an id.
  app.get("/api/relatos/mine", authenticateToken, async (req: any, res) => {
    const status = String(req.query.status || "all");
    try {
      const snap = await collections.relatos.where("authorId", "==", req.user.id).get();
      let items = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
      if (status !== "all") items = items.filter((r: any) => r.status === status);
      const ts = (v: any) => String(v?.toDate?.()?.toISOString?.() || v || "");
      items.sort((a: any, b: any) => ts(b.createdAt).localeCompare(ts(a.createdAt)));
      return res.json(items);
    } catch (error: any) {
      console.error("relato mine error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Featured "Relato da Semana" for the home slot (public). Reads the SQLite mirror.
  // Registered BEFORE /api/relatos/:id so "featured" is not captured as an id.
  app.get("/api/relatos/featured", async (req, res) => {
    try {
      const now = new Date().toISOString();
      // anchor_type='place' only: route relatos stay off the public home (privacy).
      const rows = db.prepare(
        "SELECT * FROM relatos WHERE status = 'featured' AND anchor_type = 'place' AND (featured_until IS NULL OR featured_until > ?) ORDER BY featured_at DESC LIMIT 5",
      ).all(now) as any[];
      return res.json(rows.map(parseRelatoMirrorRow));
    } catch (error: any) {
      console.error("relato featured error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/relatos", authenticateToken, async (req: any, res) => {
    const parsed = relatoCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const input = parsed.data;
    try {
      const title = normalizeRelatoText(input.title, RELATO_LIMITS.title);
      const body = composeRelatoBody(input.narrativeParts, input.body);
      if (!title) return res.status(400).json({ error: "title is required" });
      if (!body) return res.status(400).json({ error: "relato needs a body or guided-script answers" });

      // motoUsed (optional): validate ownership and build the snapshot server-side.
      let motoUsed: any = null;
      if (input.motoUsed?.motoId) {
        const ownership = await verifyMotoOwnership(input.motoUsed.motoId, req);
        if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.message });
        motoUsed = { motoId: String(input.motoUsed.motoId), snapshot: await buildMotoSnapshot(input.motoUsed.motoId) };
      }

      const externalLinks = await resolveRelatoExternalLinks(input.externalLinks);

      // SERVER assigns the verification level from the supplied proof.
      const { level: verificationLevel, verificationEvidence } = await assignVerificationLevel(
        input.anchorType, input.anchorId || "", input.evidence, input.newPlace?.coords,
      );

      const narrativeParts = input.narrativeParts
        ? Object.fromEntries(
            Object.entries(input.narrativeParts).map(([k, v]) => [k, normalizeRelatoText(String(v ?? ""), RELATO_LIMITS.part)]),
          )
        : null;

      const ref = collections.relatos.doc();
      const id = ref.id;

      // Anchor: an existing place_id/route id, OR a NEW place candidate → goes to
      // places_staging (with proximity+name dedup). User-submitted places NEVER land
      // straight in production places_cache; an admin merges/creates in Fase 2.
      let anchorId = input.anchorId || "";
      let stagingWrite: { ref: any; data: Record<string, any> } | null = null;
      if (input.anchorType === "place" && input.newPlace) {
        const stagingRef = collections.places_staging.doc();
        anchorId = stagingRef.id;
        const dedupCandidates = dedupPlaces(input.newPlace.name, input.newPlace.coords);
        stagingWrite = {
          ref: stagingRef,
          data: {
            id: stagingRef.id,
            candidate: {
              name: normalizeRelatoText(input.newPlace.name, RELATO_LIMITS.title),
              coords: input.newPlace.coords,
              category: input.newPlace.category || null,
              motoAttributes: input.newPlace.motoAttributes || input.structuredFields || {},
            },
            dedupCandidates,
            sourceRelatoId: id,
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            schemaVersion: 1,
          },
        };
      }
      // New route (Fase 5): created directly (no staging); the line is routed.
      if (input.anchorType === "route" && input.newRoute) {
        anchorId = await createRouteEntity(input.newRoute, req.user.id);
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const relato: Record<string, any> = {
        id,
        authorId: req.user.id,
        authorName: req.user.username || null,
        anchorType: input.anchorType,
        anchorId,
        title,
        body,
        narrativeParts,
        structuredFields: input.structuredFields || {},
        media: input.media || [],
        motoUsed,
        externalLinks,
        verificationLevel,        // SERVER-ASSIGNED
        verificationEvidence,     // audit trail
        status: input.requestedStatus, // 'draft' | 'pending' only (validated)
        moderationNotes: null,    // admin-only, never set by the client
        qualitySignals: { saves: 0, helpfulVotes: 0, editorialPicks: 0 },
        featuredAt: null,
        featuredUntil: null,
        createdAt: now,
        updatedAt: now,
        lastEditedAt: null,
        resubmittedAt: null,
        approvedAt: null,
        schemaVersion: 1,
      };
      await ref.set(relato);
      if (stagingWrite) {
        try { await stagingWrite.ref.set(stagingWrite.data); }
        catch (e) { console.error("places_staging write failed:", e); }
      }
      return res.status(201).json({ id, status: relato.status, verificationLevel, anchorId });
    } catch (error: any) {
      console.error("Error creating relato:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Author edit. Only the OWN relato, only while {draft, pending, rejected}, OR a
  // published one (which re-enqueues to pending — prevents approving clean text then
  // swapping the content). Never touches server-assigned fields. Same sanitization
  // as creation. rejected→edit re-submits to pending (correction cycle).
  app.put("/api/relatos/:id", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const parsed = relatoEditSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const input = parsed.data;
    try {
      const ref = collections.relatos.doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "Relato not found" });
      const existing = snap.data() as any;

      if (existing.authorId?.toString() !== req.user.id.toString()) {
        return res.status(403).json({ error: "Forbidden: not your relato" });
      }

      const current = String(existing.status || "");
      const editable = ["draft", "pending", "rejected"];
      const isPublished = current === "approved" || current === "featured";
      if (!editable.includes(current) && !isPublished) {
        return res.status(409).json({ error: `Relato in status '${current}' cannot be edited` });
      }

      const update: Record<string, any> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastEditedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Narrative fields (recompose body if guided-script parts are provided).
      if (input.title !== undefined || input.body !== undefined || input.narrativeParts !== undefined) {
        const title = input.title !== undefined ? normalizeRelatoText(input.title, RELATO_LIMITS.title) : existing.title;
        const narrativeParts = input.narrativeParts !== undefined
          ? Object.fromEntries(
              Object.entries(input.narrativeParts).map(([k, v]) => [k, normalizeRelatoText(String(v ?? ""), RELATO_LIMITS.part)]),
            )
          : existing.narrativeParts;
        const body = input.narrativeParts !== undefined
          ? composeRelatoBody(narrativeParts, input.body)
          : (input.body !== undefined ? normalizeRelatoText(input.body, RELATO_LIMITS.body) : existing.body);
        if (!title) return res.status(400).json({ error: "title is required" });
        if (!body) return res.status(400).json({ error: "relato needs a body or guided-script answers" });
        update.title = title;
        update.narrativeParts = narrativeParts;
        update.body = body;
      }
      if (input.structuredFields !== undefined) update.structuredFields = input.structuredFields;
      if (input.media !== undefined) update.media = input.media;
      if (input.externalLinks !== undefined) update.externalLinks = await resolveRelatoExternalLinks(input.externalLinks);
      if (input.motoUsed !== undefined) {
        if (input.motoUsed === null) {
          update.motoUsed = null;
        } else {
          const ownership = await verifyMotoOwnership(input.motoUsed.motoId, req);
          if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.message });
          update.motoUsed = { motoId: String(input.motoUsed.motoId), snapshot: await buildMotoSnapshot(input.motoUsed.motoId) };
        }
      }
      if (input.evidence !== undefined) {
        const { level, verificationEvidence } = await assignVerificationLevel(existing.anchorType, existing.anchorId, input.evidence);
        update.verificationLevel = level;        // SERVER re-assigns; client cannot force
        update.verificationEvidence = verificationEvidence;
      }

      // Server-controlled status lifecycle.
      if (current === "rejected") {
        update.status = "pending";
        update.resubmittedAt = admin.firestore.FieldValue.serverTimestamp();
      } else if (isPublished) {
        update.status = "pending"; // re-enqueue; anti bait-and-switch
        update.resubmittedAt = admin.firestore.FieldValue.serverTimestamp();
        // Fully unpublish: pull from public read mirror + feed, decrement count and
        // revoke the contribution until it is re-approved.
        removeRelatoMirror(id);
        await removeRelatoFeedPost(id);
        if (existing.anchorType === "place" && existing.anchorId) bumpRelatoCount(existing.anchorId, -1);
        awardRelatoContribution({ id, ...existing }, -1);
      } else if (current === "draft" && input.requestedStatus === "pending") {
        update.status = "pending"; // author submits a saved draft for moderation
      }

      await ref.update(update);
      return res.json({ success: true, status: update.status || current });
    } catch (error: any) {
      console.error("Error editing relato:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Single relato. Public for approved/featured; author/admin for any other status.
  // Registered AFTER /places/* and /mine so those aren't captured as :id.
  app.get("/api/relatos/:id", authenticateToken, async (req: any, res) => {
    try {
      const doc = await collections.relatos.doc(req.params.id).get();
      if (!doc.exists) return res.status(404).json({ error: "Relato not found" });
      const r = doc.data() as any;
      const isPublic = r.status === "approved" || r.status === "featured";
      const isOwner = r.authorId?.toString() === req.user.id.toString();
      const isStaff = req.user.role === "admin" || req.user.role === "moderator";
      if (!isPublic && !isOwner && !isStaff) return res.status(403).json({ error: "Forbidden" });
      // moderationNotes: visible to the author (correction cycle) and staff; never to
      // third parties (matters for a public relato that carried an old rejection note).
      if (!isStaff && !isOwner) delete r.moderationNotes;
      return res.json({ id: doc.id, ...r });
    } catch (error: any) {
      console.error("relato get error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ===== Relatos de Estrada — admin moderation (Fase 2) =====================
  // Mirrors the events_staging admin model. Status transitions ONLY via these
  // admin endpoints (authenticateToken + checkAdmin + logAdminAction).

  app.get("/api/admin/relatos", authenticateToken, checkAdmin, async (req: any, res) => {
    const status = String(req.query.status || "pending");
    try {
      const snap = status === "all"
        ? await collections.relatos.get()
        : await collections.relatos.where("status", "==", status).get();
      const items = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
      const ts = (v: any) => relatoTsToStr(v) || "";
      items.sort((a: any, b: any) => ts(b.updatedAt || b.createdAt).localeCompare(ts(a.updatedAt || a.createdAt)));
      return res.json(items);
    } catch (error: any) {
      console.error("admin relatos list error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Admin curation edit (whitelist of content fields; same plain-text sanitization).
  app.put("/api/admin/relatos/:id", authenticateToken, checkAdmin, async (req: any, res) => {
    const { id } = req.params;
    try {
      const ref = collections.relatos.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: "Relato not found" });
      const update: Record<string, any> = { editedAt: admin.firestore.FieldValue.serverTimestamp(), editedBy: req.user.id };
      if (typeof req.body.title === "string") update.title = normalizeRelatoText(req.body.title, RELATO_LIMITS.title);
      if (typeof req.body.body === "string") update.body = normalizeRelatoText(req.body.body, RELATO_LIMITS.body);
      if (req.body.structuredFields && typeof req.body.structuredFields === "object" && !Array.isArray(req.body.structuredFields)) {
        update.structuredFields = req.body.structuredFields;
      }
      await ref.update(update);
      const fresh = (await ref.get()).data() as any;
      if (fresh && (fresh.status === "approved" || fresh.status === "featured")) upsertRelatoMirror({ id, ...fresh });
      logAdminAction(req.user.id, "EDIT_RELATO", "relatos", id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("admin relato edit error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Approve → status approved, mirror to SQLite, bump places_control.relato_count.
  app.put("/api/admin/relatos/:id/approve", authenticateToken, checkAdmin, async (req: any, res) => {
    const { id } = req.params;
    try {
      const ref = collections.relatos.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: "Relato not found" });
      const r = doc.data() as any;
      if (r.status === "approved" || r.status === "featured") return res.status(409).json({ error: "Already published" });
      // A user-submitted place must be resolved (merged/created) before approval.
      if (r.anchorType === "place" && r.anchorId) {
        try {
          const st = await collections.places_staging.doc(r.anchorId).get();
          if (st.exists && (st.data() as any).status === "pending") {
            return res.status(409).json({ error: "Resolve the place candidate before approving this relato" });
          }
        } catch (e) { /* no staging → it is a real place */ }
      }
      const patch: Record<string, any> = { status: "approved", approvedAt: admin.firestore.FieldValue.serverTimestamp(), reviewedBy: req.user.id, moderationNotes: null };
      await ref.update(patch);
      upsertRelatoMirror({ id, ...r, ...patch, status: "approved" });
      if (r.anchorType === "place" && r.anchorId) bumpRelatoCount(r.anchorId, 1);
      await projectRelatoToFeed({ id, ...r, status: "approved" });
      awardRelatoContribution({ id, ...r }, 1);
      logAdminAction(req.user.id, "APPROVE_RELATO", "relatos", id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("admin relato approve error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Reject with moderationNotes (drives the author correction cycle).
  app.put("/api/admin/relatos/:id/reject", authenticateToken, checkAdmin, async (req: any, res) => {
    const { id } = req.params;
    try {
      const ref = collections.relatos.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: "Relato not found" });
      const r = doc.data() as any;
      const notes = typeof req.body.moderationNotes === "string" ? req.body.moderationNotes.slice(0, 2000) : null;
      await ref.update({ status: "rejected", moderationNotes: notes, reviewedBy: req.user.id });
      // Pull from public surfaces (and decrement count/contribution if published).
      const wasPublished = r.status === "approved" || r.status === "featured";
      removeRelatoMirror(id);
      await removeRelatoFeedPost(id);
      if (wasPublished && r.anchorType === "place" && r.anchorId) bumpRelatoCount(r.anchorId, -1);
      if (wasPublished) awardRelatoContribution({ id, ...r }, -1);
      logAdminAction(req.user.id, "REJECT_RELATO", "relatos", id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("admin relato reject error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Feature ("Relato da Semana") with a time window. Must already be approvable.
  app.put("/api/admin/relatos/:id/feature", authenticateToken, checkAdmin, async (req: any, res) => {
    const { id } = req.params;
    const days = Math.min(60, Math.max(1, Number(req.body.days) || 7));
    try {
      const ref = collections.relatos.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: "Relato not found" });
      const r = doc.data() as any;
      const until = admin.firestore.Timestamp.fromDate(new Date(Date.now() + days * 86400000));
      const patch: Record<string, any> = {
        status: "featured",
        featuredAt: admin.firestore.FieldValue.serverTimestamp(),
        featuredUntil: until,
        approvedAt: r.approvedAt || admin.firestore.FieldValue.serverTimestamp(),
        reviewedBy: req.user.id,
      };
      await ref.update(patch);
      const wasPublished = r.status === "approved" || r.status === "featured";
      upsertRelatoMirror({ id, ...r, ...patch, status: "featured", featuredUntil: until });
      if (!wasPublished && r.anchorType === "place" && r.anchorId) bumpRelatoCount(r.anchorId, 1);
      await projectRelatoToFeed({ id, ...r, status: "featured" });
      if (!wasPublished) awardRelatoContribution({ id, ...r }, 1);
      logAdminAction(req.user.id, "FEATURE_RELATO", "relatos", id, `${days}d`);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("admin relato feature error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Unfeature → back to approved (stays published).
  app.put("/api/admin/relatos/:id/unfeature", authenticateToken, checkAdmin, async (req: any, res) => {
    const { id } = req.params;
    try {
      const ref = collections.relatos.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: "Relato not found" });
      const r = doc.data() as any;
      const patch: Record<string, any> = { status: "approved", featuredUntil: null };
      await ref.update(patch);
      upsertRelatoMirror({ id, ...r, ...patch, status: "approved" });
      logAdminAction(req.user.id, "UNFEATURE_RELATO", "relatos", id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("admin relato unfeature error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ----- places_staging resolution -----
  app.get("/api/admin/places-staging", authenticateToken, checkAdmin, async (req: any, res) => {
    const status = String(req.query.status || "pending");
    try {
      const snap = status === "all"
        ? await collections.places_staging.get()
        : await collections.places_staging.where("status", "==", status).get();
      const items = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
      return res.json(items);
    } catch (error: any) {
      console.error("admin places-staging list error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Merge the candidate into an existing place: repoint the source relato.
  app.put("/api/admin/places-staging/:id/merge", authenticateToken, checkAdmin, async (req: any, res) => {
    const { id } = req.params;
    const targetPlaceId = String(req.body.placeId || "");
    if (!targetPlaceId) return res.status(400).json({ error: "placeId is required" });
    try {
      const ref = collections.places_staging.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: "Staging candidate not found" });
      const s = doc.data() as any;
      await ref.update({ status: "merged", reviewedBy: req.user.id, mergedPlaceId: targetPlaceId });
      if (s.sourceRelatoId) await collections.relatos.doc(s.sourceRelatoId).update({ anchorId: targetPlaceId }).catch(() => {});
      logAdminAction(req.user.id, "MERGE_PLACE_STAGING", "places_staging", id, `-> ${targetPlaceId}`);
      return res.json({ success: true, placeId: targetPlaceId });
    } catch (error: any) {
      console.error("admin places-staging merge error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Create a new production place from the candidate (origin=user_submitted).
  app.put("/api/admin/places-staging/:id/create", authenticateToken, checkAdmin, async (req: any, res) => {
    const { id } = req.params;
    try {
      const ref = collections.places_staging.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: "Staging candidate not found" });
      const s = doc.data() as any;
      const placeId = await createPlaceFromStaging({ ...s, id });
      await ref.update({ status: "created", reviewedBy: req.user.id, createdPlaceId: placeId });
      if (s.sourceRelatoId) await collections.relatos.doc(s.sourceRelatoId).update({ anchorId: placeId }).catch(() => {});
      logAdminAction(req.user.id, "CREATE_PLACE_STAGING", "places_staging", id, `-> ${placeId}`);
      return res.json({ success: true, placeId });
    } catch (error: any) {
      console.error("admin places-staging create error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/places-staging/:id/reject", authenticateToken, checkAdmin, async (req: any, res) => {
    const { id } = req.params;
    try {
      const ref = collections.places_staging.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: "Staging candidate not found" });
      await ref.update({ status: "rejected", reviewedBy: req.user.id });
      logAdminAction(req.user.id, "REJECT_PLACE_STAGING", "places_staging", id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("admin places-staging reject error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Featured window expiry: demote expired "Relato da Semana" back to approved.
  // Runs in every instance (like checkContests) — idempotent.
  async function checkFeaturedRelatos() {
    try {
      const snap = await collections.relatos.where("status", "==", "featured").get();
      const now = Date.now();
      for (const d of snap.docs) {
        const r = d.data() as any;
        const until = r.featuredUntil?.toDate ? r.featuredUntil.toDate().getTime() : (r.featuredUntil ? new Date(r.featuredUntil).getTime() : 0);
        if (until && until < now) {
          await d.ref.update({ status: "approved", featuredUntil: null });
          upsertRelatoMirror({ id: d.id, ...r, status: "approved", featuredUntil: null });
        }
      }
    } catch (e) { /* best effort */ }
  }
  setInterval(checkFeaturedRelatos, 5 * 60 * 1000);

  app.get("/api/events/:id/attendees", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      const eventDoc = await collections.events.doc(id).get();
      if (!eventDoc.exists) return res.status(404).json({ error: "Event not found" });
      const event = eventDoc.data() as any;
      
      if (event.user_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: Only event host can view attendees" });
      }

      const rsvpsSnapshot = await collections.event_rsvps.where("event_id", "==", id).get();
      const attendees = await Promise.all(rsvpsSnapshot.docs.map(async (doc) => {
        const data = doc.data() as any;
        const userData = (await findUserById(data.user_id)) || {};
        return {
          id: data.user_id,
          username: userData.username || 'Unknown',
          profile_picture_url: userData.profile_picture_url || null,
          checked_in: data.checked_in
        };
      }));

      res.json(attendees);
    } catch (err) {
      console.error("Error fetching attendees from Firestore:", err);
      res.status(500).json({ error: "Failed to fetch attendees" });
    }
  });

  app.post("/api/events/:id/checkin", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const { userId, checkedIn } = req.body;

    try {
      const eventDoc = await collections.events.doc(id).get();
      if (!eventDoc.exists) return res.status(404).json({ error: "Event not found" });
      const event = eventDoc.data() as any;
      
      if (event.user_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: Only event host can check in attendees" });
      }

      await collections.event_rsvps.doc(`${id}_${userId}`).set({ checked_in: checkedIn ? 1 : 0 }, { merge: true });

      // Dual-write to SQLite
      try {
        db.prepare(`
          UPDATE event_rsvps 
          SET checked_in = ? 
          WHERE event_id = ? AND user_id = ?
        `).run(checkedIn ? 1 : 0, id, userId);
      } catch (sqe) {}

      // Award participation stamp if configured
      if (checkedIn) {
        if (event.participation_stamp_id) {
          const stampRef = collections.user_passport_stamps.doc(`${userId}_${event.participation_stamp_id}`);
          const stampDoc = await stampRef.get();
          if (!stampDoc.exists) {
            await stampRef.set({
              user_id: userId,
              stamp_id: event.participation_stamp_id,
              ambassador_id: 0,
              creator_type: 'event_host',
              creator_id: req.user.id,
              created_at: admin.firestore.FieldValue.serverTimestamp()
            });
            
            const stampDocInfo = await collections.passport_stamps.doc(event.participation_stamp_id.toString()).get();
            if (stampDocInfo.exists) {
              const stampName = (stampDocInfo.data() as any).name;
              await collections.notifications.add({
                user_id: userId,
                type: 'stamp_awarded',
                content: `You've earned the "${stampName}" stamp for participating in an event!`,
                created_at: admin.firestore.FieldValue.serverTimestamp()
              });
            }

            // Dual-write to SQLite
            try {
              db.prepare("INSERT OR IGNORE INTO user_passport_stamps (user_id, stamp_id, ambassador_id, creator_type, creator_id) VALUES (?, ?, ?, ?, ?)")
                .run(userId, event.participation_stamp_id, 0, 'event_host', req.user.id);
              
              const stamp = db.prepare("SELECT name FROM passport_stamps WHERE id = ?").get(event.participation_stamp_id) as any;
              if (stamp) {
                db.prepare("INSERT INTO notifications (user_id, type, content) VALUES (?, ?, ?)")
                  .run(userId, 'stamp_awarded', `You've earned the "${stamp.name}" stamp for participating in an event!`);
              }
            } catch (sqe) {}
          }
        }

        // Award badge
        if (event.participation_badge_id) {
          const badgeRef = collections.user_badges.doc(`${userId}_${event.participation_badge_id}`);
          const badgeDoc = await badgeRef.get();
          if (!badgeDoc.exists) {
            await badgeRef.set({
              user_id: userId,
              badge_id: event.participation_badge_id,
              awarded_by: req.user.id,
              created_at: admin.firestore.FieldValue.serverTimestamp()
            });

            const badgeDocInfo = await collections.badges.doc(event.participation_badge_id.toString()).get();
            if (badgeDocInfo.exists) {
              const badgeName = (badgeDocInfo.data() as any).name;
              await collections.notifications.add({
                user_id: userId,
                type: 'badge_awarded',
                content: `You've earned the "${badgeName}" badge for participating in an event!`,
                created_at: admin.firestore.FieldValue.serverTimestamp()
              });
            }

            // Dual-write to SQLite
            try {
              db.prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_id, awarded_by) VALUES (?, ?, ?)")
                .run(userId, event.participation_badge_id, req.user.id);
              
              const badge = db.prepare("SELECT name FROM badges WHERE badge_id = ?").get(event.participation_badge_id) as any;
              if (badge) {
                db.prepare("INSERT INTO notifications (user_id, type, content) VALUES (?, ?, ?)")
                  .run(userId, 'badge_awarded', `You've earned the "${badge.name}" badge for participating in an event!`);
              }
            } catch (sqe) {}
          }
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Check-in error in Firestore:", err);
      res.status(500).json({ error: "Failed to update check-in status" });
    }
  });

  app.post("/api/events/:id/rsvp", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const { username } = req.body;
    
    try {
      if (username && username !== req.user.username && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: You can only RSVP for yourself" });
      }
      const user = { id: req.user.id, username: req.user.username };

      // Check if already RSVP'd in Firestore
      const rsvpRef = collections.event_rsvps.doc(`${id}_${user.id}`);
      const rsvpDoc = await rsvpRef.get();

      if (rsvpDoc.exists) {
        await rsvpRef.delete();
        // Dual-write delete to SQLite
        try {
          db.prepare("DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?").run(id, user.id);
        } catch (sqe) {}
        return res.json({ success: true, action: 'unrsvp' });
      } else {
        await rsvpRef.set({
          event_id: id,
          user_id: user.id,
          checked_in: 0,
          created_at: admin.firestore.FieldValue.serverTimestamp()
        });
        // Dual-write to SQLite
        try {
          db.prepare("INSERT INTO event_rsvps (event_id, user_id, checked_in) VALUES (?, ?, 0)").run(id, user.id);
        } catch (sqe) {}
        return res.json({ success: true, action: 'rsvp' });
      }
    } catch (err) {
      console.error("RSVP error in Firestore:", err);
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

  app.get("/api/admin/photo-contest-settings", (req, res) => {
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

  // ---------------------------------------------------------------------------
  // Revisão de ingestão de eventos (events_staging)
  // O serviço de ingestão (Python) escreve em events_staging com status "pending".
  // O admin revisa, edita, aprova (move para /events) ou rejeita. Aprovação é
  // server-side (Admin SDK). Todo texto é DADO — o front renderiza como texto.
  // ---------------------------------------------------------------------------

  // Deriva date/time/location/category/external_link de um doc de staging.
  const mapStagingToEvent = (s: any) => {
    const start = (s.start_datetime || "").toString().replace(" ", "T");
    const date = start.slice(0, 10) || new Date().toISOString().split("T")[0];
    const hhmm = start.slice(11, 16);
    const time = /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : null;
    const locationParts = [s.venue_name, s.address || s.city].filter(Boolean);
    const location = locationParts.join(" — ") || s.city || null;
    return {
      title: s.title || "Evento",
      description: s.description || null,
      date,
      time,
      location,
      category: s.event_type || "other",
      external_link: s.canonical_url || s.raw_url || null,
    };
  };

  app.get("/api/admin/staging-events", authenticateToken, checkAdmin, async (req: any, res) => {
    try {
      const status = (req.query.status as string) || "pending";
      const snap = await collections.events_staging.where("status", "==", status).get();
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      // Ordena por fetched_at desc no servidor (evita índice composto no Firestore).
      items.sort((a: any, b: any) => String(b.fetched_at || "").localeCompare(String(a.fetched_at || "")));
      res.json(items);
    } catch (error: any) {
      console.error("Error listing staging events:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/staging-events/:id", authenticateToken, checkAdmin, async (req: any, res) => {
    const { id } = req.params;
    const editable = ["title", "description", "venue_name", "address", "city", "state", "start_datetime", "end_datetime", "event_type"];
    try {
      const ref = collections.events_staging.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: "Staging event not found" });

      const patch: any = {};
      for (const key of editable) {
        if (req.body[key] !== undefined) {
          // Valores tratados como texto puro (admin é confiável, mas mantemos consistência).
          patch[key] = req.body[key] === null ? null : String(req.body[key]);
        }
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "No editable fields provided" });
      }
      patch.edited_at = new Date().toISOString();
      patch.edited_by = req.user.id;

      await ref.update(patch);
      logAdminAction(req.user.id, "EDIT_STAGING_EVENT", "events_staging", id);
      res.json({ success: true, ...patch });
    } catch (error: any) {
      console.error("Error editing staging event:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/staging-events/:id/approve", authenticateToken, checkAdmin, async (req: any, res) => {
    const { id } = req.params;
    try {
      const ref = collections.events_staging.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: "Staging event not found" });
      const s = doc.data() as any;
      if (s.status === "approved") return res.status(409).json({ error: "Already approved" });

      const mapped = mapStagingToEvent(s);
      const newId = await getNextId("events");
      const eventData: Record<string, any> = {
        user_id: req.user.id, // o admin que aprova é o "host" do evento publicado
        title: mapped.title,
        description: mapped.description,
        date: mapped.date,
        time: mapped.time,
        location: mapped.location,
        image_url: null,
        participation_badge_id: null,
        participation_stamp_id: null,
        category: mapped.category,
        price: null,
        external_link: mapped.external_link,
        price_starting_from: 0,
        is_promoted: 0,
        is_approved: 1,
        source_type: "external",
        source_name: s.source_name || null,
        created_by_user_id: null,
        ingested_at: new Date().toISOString(),
        is_verified: false,
        staging_id: id,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      };
      await collections.events.doc(newId.toString()).set(eventData);

      // Dual-write para SQLite (mesmo padrão de POST /api/events).
      try {
        db.prepare(`
          INSERT OR REPLACE INTO events (id, user_id, title, description, date, time, location, image_url, participation_badge_id, category, participation_stamp_id, is_approved, price, external_link, price_starting_from)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newId, req.user.id, mapped.title, mapped.description, mapped.date, mapped.time, mapped.location, null, null, mapped.category, null, 1, null, mapped.external_link, 0);
      } catch (sqError) {
        console.error("SQLite insert failed for approved staging event:", sqError);
      }

      await ref.update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: req.user.id,
        approved_event_id: newId,
      });
      logAdminAction(req.user.id, "APPROVE_STAGING_EVENT", "events_staging", id, `-> events/${newId}`);
      res.json({ success: true, event_id: newId });
    } catch (error: any) {
      console.error("Error approving staging event:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/events/:id/verify", authenticateToken, checkAdmin, async (req: any, res) => {
    const { id } = req.params;
    const { is_verified } = req.body;
    if (typeof is_verified !== 'boolean') {
      return res.status(400).json({ error: "is_verified must be a boolean" });
    }
    try {
      await collections.events.doc(id).update({ is_verified });
      logAdminAction(req.user.id, "VERIFY_EVENT", "event", id, `is_verified=${is_verified}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error verifying event:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/staging-events/:id/reject", authenticateToken, checkAdmin, async (req: any, res) => {
    const { id } = req.params;
    try {
      const ref = collections.events_staging.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ error: "Staging event not found" });
      await ref.update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: req.user.id,
      });
      logAdminAction(req.user.id, "REJECT_STAGING_EVENT", "events_staging", id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error rejecting staging event:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/staging-events/clear", authenticateToken, checkAdmin, async (req: any, res) => {
    const { status = "all" } = req.body || {};
    const validStatuses = ["pending", "approved", "rejected", "all"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
    }
    try {
      let query = collections.events_staging as any;
      if (status !== "all") {
        query = query.where("status", "==", status);
      }
      const snap = await query.get();
      const batch = db.batch ? db.batch() : null;
      let count = 0;
      const deleteBatch = db.batch ? db.batch() : null;

      snap.docs.forEach((doc: any) => {
        deleteBatch?.delete(doc.ref);
        count++;
      });

      await deleteBatch?.commit();
      logAdminAction(req.user.id, "CLEAR_STAGING_EVENTS", "events_staging", "batch", `status=${status}, count=${count}`);
      res.json({ success: true, deleted: count, status });
    } catch (error: any) {
      console.error("Error clearing staging events:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/events/clear-approved", authenticateToken, checkAdmin, async (req: any, res) => {
    const { sourceType = "external" } = req.body || {};
    const validSources = ["internal", "external", "all"];
    if (!validSources.includes(sourceType)) {
      return res.status(400).json({ error: `sourceType must be one of: ${validSources.join(", ")}` });
    }
    try {
      let query = collections.events as any;
      if (sourceType !== "all") {
        query = query.where("source_type", "==", sourceType);
      }
      const snap = await query.get();
      let count = 0;
      const deleteBatch = db.batch();

      snap.docs.forEach((doc: any) => {
        deleteBatch.delete(doc.ref);
        count++;
      });

      await deleteBatch.commit();

      // Also delete SQLite entries
      try {
        if (sourceType === "all") {
          db.exec("DELETE FROM events");
        } else {
          db.prepare("DELETE FROM events WHERE source_type = ?").run(sourceType);
        }
      } catch (sqe) {
        console.warn("Could not delete from SQLite events:", sqe);
      }

      logAdminAction(req.user.id, "CLEAR_APPROVED_EVENTS", "events", "batch", `sourceType=${sourceType}, count=${count}`);
      res.json({ success: true, deleted: count, sourceType });
    } catch (error: any) {
      console.error("Error clearing approved events:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/motorcycles", authenticateToken, upload.single('photo'), async (req: any, res) => {
    const { username, make, model, year, last_service, last_km, last_shop, image_url } = req.body;
    let photo_url = image_url || null;
    
    if (req.file) {
      try {
        photo_url = await uploadToFirebase(req.file, "motorcycles");
      } catch (err) {
        console.error("Motorcycle photo upload error:", err);
      }
    }
    
    if (username !== req.user.username && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only add motorcycles for yourself" });
    }

    try {
      const user = { id: req.user.id, username: req.user.username };

      const motoId = await getNextId("motorcycles");
      const motoData = {
        id: motoId,
        rider_id: user.id,
        make,
        model,
        year: parseInt(year),
        image_url: photo_url,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      };

      await collections.motorcycles.doc(motoId.toString()).set(motoData);

      if (last_service || last_km || last_shop) {
        const logId = await getNextId("maintenance_logs");
        const logData = {
          id: logId,
          motorcycle_id: motoId,
          service: last_service || "Initial Entry",
          km: parseInt(last_km) || null,
          shop: last_shop || null,
          created_at: admin.firestore.FieldValue.serverTimestamp()
        };
        await collections.maintenance_logs.doc(logId.toString()).set(logData);

        // SQLite maintenance
        try {
          db.prepare("INSERT INTO maintenance_logs (motorcycle_id, service, km, shop) VALUES (?, ?, ?, ?)").run(motoId, logData.service, logData.km, logData.shop);
        } catch (sqe) {}
      }

      // Dual-write moto to SQLite
      try {
        db.prepare("INSERT OR REPLACE INTO motorcycles (id, rider_id, make, model, year, image_url) VALUES (?, ?, ?, ?, ?, ?)").run(motoId, user.id, make, model, parseInt(year), photo_url);
      } catch (sqe) {}
      
      res.json({ success: true, id: motoId });
    } catch (err) {
      console.error("Error adding motorcycle to Firestore:", err);
      res.status(500).json({ error: "Failed to add motorcycle" });
    }
  });

  app.put("/api/motorcycles/:id", authenticateToken, upload.single('photo'), async (req: any, res) => {
    const { id } = req.params;
    const { make, model, year, image_url } = req.body;
    let photo_url = image_url || null;

    if (req.file) {
      try {
        photo_url = await uploadToFirebase(req.file, "motorcycles");
      } catch (err) {
        console.error("Motorcycle photo update error:", err);
      }
    }

    try {
      const motoDoc = await collections.motorcycles.doc(id).get();
      if (!motoDoc.exists) {
        return res.status(404).json({ error: "Motorcycle not found" });
      }
      const moto = motoDoc.data() as any;

      if (moto.rider_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: You can only edit your own motorcycles" });
      }

      const updateData = {
        make: make || moto.make,
        model: model || moto.model,
        year: year ? parseInt(year) : moto.year,
        image_url: photo_url !== undefined ? photo_url : moto.image_url,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      };

      await collections.motorcycles.doc(id).update(updateData);

      // Dual-write to SQLite
      try {
        db.prepare("UPDATE motorcycles SET make = ?, model = ?, year = ?, image_url = ? WHERE id = ?").run(updateData.make, updateData.model, updateData.year, updateData.image_url, id);
      } catch (sqe) {}

      res.json({ success: true });
    } catch (err) {
      console.error("Error updating motorcycle in Firestore:", err);
      res.status(500).json({ error: "Failed to update motorcycle" });
    }
  });

  app.delete("/api/motorcycles/:id", authenticateToken, async (req: any, res) => {
    const { id } = req.params;

    try {
      const motoDoc = await collections.motorcycles.doc(id).get();
      if (!motoDoc.exists) {
        return res.status(404).json({ error: "Motorcycle not found" });
      }
      const moto = motoDoc.data() as any;

      if (moto.rider_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: You can only delete your own motorcycles" });
      }

      // Delete associated maintenance logs, oil changes and refuelings (cascade)
      const [logsSnapshot, oilSnapshot, refuelSnapshot] = await Promise.all([
        collections.maintenance_logs.where("motorcycle_id", "==", parseInt(id)).get(),
        collections.oil_changes.where("motorcycle_id", "==", parseInt(id)).get(),
        collections.refuelings.where("motorcycle_id", "==", parseInt(id)).get(),
      ]);
      const batch = firestore.batch();
      logsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      oilSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      refuelSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      batch.delete(collections.motorcycles.doc(id));
      await batch.commit();

      // Dual-delete from SQLite
      try {
        db.prepare("DELETE FROM maintenance_logs WHERE motorcycle_id = ?").run(id);
        db.prepare("DELETE FROM oil_changes WHERE motorcycle_id = ?").run(id);
        db.prepare("DELETE FROM refuelings WHERE motorcycle_id = ?").run(id);
        db.prepare("DELETE FROM motorcycles WHERE id = ?").run(id);
      } catch (sqe) {}

      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting motorcycle from Firestore:", err);
      res.status(500).json({ error: "Failed to delete motorcycle" });
    }
  });

  app.post("/api/motorcycles/:id/maintenance", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const { service, km, shop } = req.body;

    try {
      const motoDoc = await collections.motorcycles.doc(id).get();
      if (!motoDoc.exists) {
        return res.status(404).json({ error: "Motorcycle not found" });
      }
      const moto = motoDoc.data() as any;

      if (moto.rider_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden: You can only add maintenance logs for your own motorcycles" });
      }

      const logId = await getNextId("maintenance_logs");
      const logDate = new Date().toISOString();
      await collections.maintenance_logs.doc(logId.toString()).set({
        id: logId,
        motorcycle_id: parseInt(id),
        service,
        km: parseInt(km) || null,
        shop: shop || null,
        date: logDate,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });

      // Dual-write to SQLite
      try {
        db.prepare("INSERT INTO maintenance_logs (motorcycle_id, service, km, shop) VALUES (?, ?, ?, ?)").run(parseInt(id), service, parseInt(km) || null, shop);
      } catch (sqe) {}

      res.json({ success: true });
    } catch (err) {
      console.error("Error adding maintenance log to Firestore:", err);
      res.status(500).json({ error: "Failed to add maintenance log" });
    }
  });

  app.put("/api/maintenance/:logId", authenticateToken, async (req: any, res) => {
    const { logId } = req.params;
    const { service, km, shop } = req.body;
    if (!service) return res.status(400).json({ error: "service is required" });
    try {
      // Verify ownership via motorcycle parent
      const logRow = db.prepare("SELECT motorcycle_id FROM maintenance_logs WHERE id = ?").get(parseInt(logId)) as any;
      if (!logRow) return res.status(404).json({ error: "Maintenance log not found" });
      const motoRow = db.prepare("SELECT rider_id FROM motorcycles WHERE id = ?").get(logRow.motorcycle_id) as any;
      if (!motoRow) return res.status(404).json({ error: "Motorcycle not found" });
      if (motoRow.rider_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden" });
      }
      db.prepare("UPDATE maintenance_logs SET service = ?, km = ?, shop = ? WHERE id = ?")
        .run(service, parseInt(km) || null, shop || null, parseInt(logId));
      try {
        await collections.maintenance_logs.doc(logId).update({
          service,
          km: parseInt(km) || null,
          shop: shop || null,
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (_) {}
      res.json({ success: true });
    } catch (err) {
      console.error("[maintenance PUT]", err);
      res.status(500).json({ error: "Failed to update maintenance log" });
    }
  });

  app.delete("/api/maintenance/:logId", authenticateToken, async (req: any, res) => {
    const { logId } = req.params;
    try {
      const logRow = db.prepare("SELECT motorcycle_id FROM maintenance_logs WHERE id = ?").get(parseInt(logId)) as any;
      if (!logRow) return res.status(404).json({ error: "Maintenance log not found" });
      const motoRow = db.prepare("SELECT rider_id FROM motorcycles WHERE id = ?").get(logRow.motorcycle_id) as any;
      if (!motoRow) return res.status(404).json({ error: "Motorcycle not found" });
      if (motoRow.rider_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: "Forbidden" });
      }
      db.prepare("DELETE FROM maintenance_logs WHERE id = ?").run(parseInt(logId));
      try { await collections.maintenance_logs.doc(logId).delete(); } catch (_) {}
      res.json({ success: true });
    } catch (err) {
      console.error("[maintenance DELETE]", err);
      res.status(500).json({ error: "Failed to delete maintenance log" });
    }
  });

  // ===========================================================================
  // Garagem — Abastecimento (refueling, freemium CRUD) + Troca de Óleo (oil,
  // premium) + alerta de troca. Stats are derived on read; these routes only
  // persist raw records (dual-write Firestore + SQLite, like the moto routes).
  // ===========================================================================

  // --- Refuelings (freemium: authenticated, no premium gate) ---
  app.post("/api/motorcycles/:id/refuelings", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const parsed = refuelingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    }
    try {
      const owner = await verifyMotoOwnership(id, req);
      if (!owner.ok) return res.status(owner.status).json({ error: owner.message });

      const d = parsed.data;
      const { price_per_liter, total_value } = derivePrice({
        liters: d.liters,
        price_per_liter: d.price_per_liter ?? null,
        total_value: d.total_value ?? null,
      });
      const full_tank = d.full_tank ?? true;
      const record_date = d.record_date || new Date().toISOString();

      // Non-blocking decreasing-odometer warning (computed against current records).
      const { oil_changes, refuelings } = await fetchGarageRecords(parseInt(id));
      const odometer_warning = isOdometerDecreasing(d.km, lastKnownOdometer(oil_changes, refuelings));

      const recId = await getNextId("refuelings");
      const recData = {
        id: recId,
        motorcycle_id: parseInt(id),
        km: d.km,
        liters: d.liters,
        fuel_type: d.fuel_type,
        full_tank,
        price_per_liter,
        total_value,
        note: d.note ?? null,
        record_date,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      };
      await collections.refuelings.doc(recId.toString()).set(recData);
      try {
        db.prepare(
          "INSERT INTO refuelings (id, motorcycle_id, km, liters, fuel_type, full_tank, price_per_liter, total_value, note, record_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(recId, parseInt(id), d.km, d.liters, d.fuel_type, full_tank ? 1 : 0, price_per_liter, total_value, d.note ?? null, record_date);
      } catch (sqe) {}

      res.json({ success: true, id: recId, odometer_warning });
    } catch (err) {
      console.error("Error adding refueling:", err);
      res.status(500).json({ error: "Failed to add refueling" });
    }
  });

  app.put("/api/refuelings/:id", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const parsed = refuelingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    }
    try {
      const rec = await loadGarageRecord("refuelings", id);
      if (!rec) return res.status(404).json({ error: "Refueling not found" });
      const owner = await verifyMotoOwnership(rec.motorcycle_id, req);
      if (!owner.ok) return res.status(owner.status).json({ error: owner.message });

      const d = parsed.data;
      const { price_per_liter, total_value } = derivePrice({
        liters: d.liters,
        price_per_liter: d.price_per_liter ?? null,
        total_value: d.total_value ?? null,
      });
      const full_tank = d.full_tank ?? rec.full_tank ?? true;
      const record_date = d.record_date || rec.record_date || new Date().toISOString();

      // Warning against the other records (exclude this one being edited).
      const { oil_changes, refuelings } = await fetchGarageRecords(parseInt(rec.motorcycle_id));
      const others = refuelings.filter((r) => r.id.toString() !== id.toString());
      const odometer_warning = isOdometerDecreasing(d.km, lastKnownOdometer(oil_changes, others));

      const updateData = {
        km: d.km,
        liters: d.liters,
        fuel_type: d.fuel_type,
        full_tank,
        price_per_liter,
        total_value,
        note: d.note ?? null,
        record_date,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      };
      await collections.refuelings.doc(id).set(updateData, { merge: true });
      try {
        db.prepare(
          "UPDATE refuelings SET km = ?, liters = ?, fuel_type = ?, full_tank = ?, price_per_liter = ?, total_value = ?, note = ?, record_date = ?, updated_at = ? WHERE id = ?",
        ).run(d.km, d.liters, d.fuel_type, full_tank ? 1 : 0, price_per_liter, total_value, d.note ?? null, record_date, new Date().toISOString(), id);
      } catch (sqe) {}

      res.json({ success: true, odometer_warning });
    } catch (err) {
      console.error("Error updating refueling:", err);
      res.status(500).json({ error: "Failed to update refueling" });
    }
  });

  app.delete("/api/refuelings/:id", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      const rec = await loadGarageRecord("refuelings", id);
      if (!rec) return res.status(404).json({ error: "Refueling not found" });
      const owner = await verifyMotoOwnership(rec.motorcycle_id, req);
      if (!owner.ok) return res.status(owner.status).json({ error: owner.message });

      try {
        await collections.refuelings.doc(id).delete();
      } catch (e) {}
      try {
        db.prepare("DELETE FROM refuelings WHERE id = ?").run(id);
      } catch (sqe) {}

      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting refueling:", err);
      res.status(500).json({ error: "Failed to delete refueling" });
    }
  });

  // --- Oil changes (premium: feature_oil_change_records) ---
  app.post(
    "/api/motorcycles/:id/oil-changes",
    authenticateToken,
    checkFeatureAccess("oil_change_records"),
    async (req: any, res) => {
      const { id } = req.params;
      const parsed = oilChangeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      try {
        const owner = await verifyMotoOwnership(id, req);
        if (!owner.ok) return res.status(owner.status).json({ error: owner.message });

        const d = parsed.data;
        const record_date = d.record_date || new Date().toISOString();

        const { oil_changes, refuelings } = await fetchGarageRecords(parseInt(id));
        const odometer_warning = isOdometerDecreasing(d.km, lastKnownOdometer(oil_changes, refuelings));

        const recId = await getNextId("oil_changes");
        const recData = {
          id: recId,
          motorcycle_id: parseInt(id),
          km: d.km,
          oil_type: d.oil_type,
          liters: d.liters,
          shop: d.shop ?? null,
          shop_ref: d.shop_ref ?? null,
          note: d.note ?? null,
          record_date,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        };
        await collections.oil_changes.doc(recId.toString()).set(recData);
        try {
          db.prepare(
            "INSERT INTO oil_changes (id, motorcycle_id, km, oil_type, liters, shop, shop_ref, note, record_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ).run(recId, parseInt(id), d.km, d.oil_type, d.liters, d.shop ?? null, d.shop_ref ? JSON.stringify(d.shop_ref) : null, d.note ?? null, record_date);
        } catch (sqe) {}

        res.json({ success: true, id: recId, odometer_warning });
      } catch (err) {
        console.error("Error adding oil change:", err);
        res.status(500).json({ error: "Failed to add oil change" });
      }
    },
  );

  app.put(
    "/api/oil-changes/:id",
    authenticateToken,
    checkFeatureAccess("oil_change_records"),
    async (req: any, res) => {
      const { id } = req.params;
      const parsed = oilChangeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      try {
        const rec = await loadGarageRecord("oil_changes", id);
        if (!rec) return res.status(404).json({ error: "Oil change not found" });
        const owner = await verifyMotoOwnership(rec.motorcycle_id, req);
        if (!owner.ok) return res.status(owner.status).json({ error: owner.message });

        const d = parsed.data;
        const record_date = d.record_date || rec.record_date || new Date().toISOString();

        const { oil_changes, refuelings } = await fetchGarageRecords(parseInt(rec.motorcycle_id));
        const others = oil_changes.filter((r) => r.id.toString() !== id.toString());
        const odometer_warning = isOdometerDecreasing(d.km, lastKnownOdometer(others, refuelings));

        const updateData = {
          km: d.km,
          oil_type: d.oil_type,
          liters: d.liters,
          shop: d.shop ?? null,
          shop_ref: d.shop_ref ?? null,
          note: d.note ?? null,
          record_date,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        };
        await collections.oil_changes.doc(id).set(updateData, { merge: true });
        try {
          db.prepare(
            "UPDATE oil_changes SET km = ?, oil_type = ?, liters = ?, shop = ?, shop_ref = ?, note = ?, record_date = ?, updated_at = ? WHERE id = ?",
          ).run(d.km, d.oil_type, d.liters, d.shop ?? null, d.shop_ref ? JSON.stringify(d.shop_ref) : null, d.note ?? null, record_date, new Date().toISOString(), id);
        } catch (sqe) {}

        res.json({ success: true, odometer_warning });
      } catch (err) {
        console.error("Error updating oil change:", err);
        res.status(500).json({ error: "Failed to update oil change" });
      }
    },
  );

  app.delete(
    "/api/oil-changes/:id",
    authenticateToken,
    checkFeatureAccess("oil_change_records"),
    async (req: any, res) => {
      const { id } = req.params;
      try {
        const rec = await loadGarageRecord("oil_changes", id);
        if (!rec) return res.status(404).json({ error: "Oil change not found" });
        const owner = await verifyMotoOwnership(rec.motorcycle_id, req);
        if (!owner.ok) return res.status(owner.status).json({ error: owner.message });

        try {
          await collections.oil_changes.doc(id).delete();
        } catch (e) {}
        try {
          db.prepare("DELETE FROM oil_changes WHERE id = ?").run(id);
        } catch (sqe) {}

        res.json({ success: true });
      } catch (err) {
        console.error("Error deleting oil change:", err);
        res.status(500).json({ error: "Failed to delete oil change" });
      }
    },
  );

  // --- Oil-change alert config (premium: feature_oil_change_alert) ---
  app.put(
    "/api/motorcycles/:id/oil-alert",
    authenticateToken,
    checkFeatureAccess("oil_change_alert"),
    async (req: any, res) => {
      const { id } = req.params;
      const schema = z
        .object({
          active: z.boolean(),
          interval_km: z.coerce.number().positive().nullable().optional(),
          interval_months: z.coerce.number().positive().nullable().optional(),
        })
        .refine((v) => !v.active || (v.interval_km != null && v.interval_km > 0), {
          message: "interval_km is required when the alert is active",
          path: ["interval_km"],
        });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      try {
        const owner = await verifyMotoOwnership(id, req);
        if (!owner.ok) return res.status(owner.status).json({ error: owner.message });

        const d = parsed.data;
        const oil_alert_active = d.active;
        const oil_alert_interval_km = d.interval_km ?? null;
        const oil_alert_interval_months = d.interval_months ?? null;
        const oil_alert_updated_at = new Date().toISOString();

        await collections.motorcycles.doc(id).set(
          {
            oil_alert_active,
            oil_alert_interval_km,
            oil_alert_interval_months,
            oil_alert_updated_at,
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        try {
          db.prepare(
            "UPDATE motorcycles SET oil_alert_active = ?, oil_alert_interval_km = ?, oil_alert_interval_months = ?, oil_alert_updated_at = ? WHERE id = ?",
          ).run(oil_alert_active ? 1 : 0, oil_alert_interval_km, oil_alert_interval_months, oil_alert_updated_at, id);
        } catch (sqe) {}

        res.json({
          success: true,
          oil_alert_config: {
            active: oil_alert_active,
            interval_km: oil_alert_interval_km,
            interval_months: oil_alert_interval_months,
          },
        });
      } catch (err) {
        console.error("Error updating oil alert:", err);
        res.status(500).json({ error: "Failed to update oil alert" });
      }
    },
  );

  // --- Oficina autocomplete: ecosystem users + cached places by name prefix ---
  app.get("/api/garage/oficina-search", authenticateToken, async (req: any, res) => {
    const q = (req.query.q as string || "").trim();
    if (q.length < 2) return res.json({ results: [] });
    const like = `${q.toLowerCase()}%`;
    const results: Array<{ refType: string; refId: string | null; nomeExibicao: string; address: string | null }> = [];
    try {
      // Ecosystem-type users (workshops, shops, etc.), matched by business name.
      try {
        const ecos = db
          .prepare(
            `SELECT e.user_id AS id, e.company_name AS name, e.full_address AS address
             FROM ecosystems e
             JOIN users u ON u.id = e.user_id
             WHERE u.type = 'ecosystem' AND LOWER(e.company_name) LIKE ?
             LIMIT 10`,
          )
          .all(like) as any[];
        ecos.forEach((e) =>
          results.push({ refType: "user", refId: String(e.id), nomeExibicao: e.name, address: e.address ?? null }),
        );
      } catch (e) {}
      // Cached places by name prefix.
      try {
        const places = db
          .prepare(
            `SELECT place_id AS id, name, full_address AS address FROM places_cache WHERE LOWER(name) LIKE ? LIMIT 10`,
          )
          .all(like) as any[];
        places.forEach((p) =>
          results.push({ refType: "place", refId: String(p.id), nomeExibicao: p.name, address: p.address ?? null }),
        );
      } catch (e) {}

      res.json({ results: results.slice(0, 10) });
    } catch (err) {
      console.error("Oficina search failed:", err);
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.post("/api/posts", authenticateToken, upload.single('image'), async (req: any, res) => {
    const { username, content, tagged_motorcycle_id, privacy_level, shared_event_id } = req.body;
    let image_url = req.body.image_url;
    
    if (req.file) {
      try {
        image_url = await uploadToFirebase(req.file, "posts");
      } catch (err) {
        console.error("Post image upload error:", err);
        return res.status(500).json({ error: "Failed to upload image to Firebase Storage" });
      }
    }
    
    // Ensure the authenticated user matches the username they are trying to post as
    if ((req as any).user.username !== username && (req as any).user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden: You can only post as yourself" });
    }

    try {
      // Refresh user to get full details for denormalization (SQLite-first).
      const user: any = await findUserById(req.user.id);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const postId = await getNextId("posts");
      const postDoc = {
        id: postId,
        user_id: user.id,
        username: user.username,
        user_type: user.type,
        profile_picture_url: user.profile_picture_url,
        content: content || "",
        image_url: image_url || null,
        tagged_motorcycle_id: tagged_motorcycle_id || null,
        privacy_level: privacy_level || 'public',
        shared_event_id: shared_event_id ? Number(shared_event_id) : null,
        respect_count: 0,
        comment_count: 0,
        created_at: new Date().toISOString()
      };

      await collections.posts.doc(postId.toString()).set(postDoc);

      // Dual write to SQLite — use the same postId so both systems stay in sync.
      db.prepare("INSERT OR IGNORE INTO posts (id, user_id, content, image_url, tagged_motorcycle_id, privacy_level, shared_event_id) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        postId,
        user.id,
        postDoc.content,
        postDoc.image_url,
        postDoc.tagged_motorcycle_id,
        postDoc.privacy_level,
        postDoc.shared_event_id
      );

      res.json({ success: true, id: postId });
    } catch (error: any) {
      console.error("Post creation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/posts/:id", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const user = req.user;

    try {
      // Find the post
      const postDoc = await collections.posts.doc(id).get();
      let isOwner = false;

      if (postDoc.exists) {
        isOwner = postDoc.data()?.user_id?.toString() === user.id.toString();
      } else {
        // Fallback to SQLite
        const sqlitePost = db.prepare("SELECT user_id FROM posts WHERE id = ?").get(id) as any;
        if (!sqlitePost) {
          return res.status(404).json({ error: "Post not found" });
        }
        isOwner = sqlitePost.user_id?.toString() === user.id.toString();
      }

      if (!isOwner && user.role !== 'admin') {
        return res.status(403).json({ error: "Forbidden: You can only delete your own posts" });
      }

      // Delete from Firestore
      await collections.posts.doc(id).delete();
      
      // Delete from SQLite
      db.prepare("DELETE FROM post_comments WHERE post_id = ?").run(id);
      db.prepare("DELETE FROM post_likes WHERE post_id = ?").run(id);
      db.prepare("DELETE FROM user_pinned_posts WHERE post_id = ?").run(id);
      db.prepare("DELETE FROM posts WHERE id = ?").run(id);

      res.json({ success: true, message: "Post deleted successfully" });
    } catch (error: any) {
      console.error("Post deletion error:", error);
      res.status(500).json({ error: "Failed to delete post" });
    }
  });

  app.put("/api/profile/:username", authenticateToken, async (req: any, res) => {
    const { username } = req.params;
    const { profile_picture_url, cover_photo_url, new_username, ...profileData } = req.body;

    const interestsStr = Array.isArray(profileData.interests) ? profileData.interests.join(',') : profileData.interests;
    const servicesStr = Array.isArray(profileData.services) ? profileData.services.join(',') : profileData.services;
    
    if (username !== req.user.username && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only update your own profile" });
    }

    try {
      // 1. Get user data from SQLite first
      let user = db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)").get(username) as any;
      if (!user) {
        // Try Firestore fallback for lookup
        try {
          const userSnapshot = await collections.users.where("username", "==", username).limit(1).get();
          if (!userSnapshot.empty) {
            user = { id: userSnapshot.docs[0].id, ...userSnapshot.docs[0].data() as any };
          }
        } catch (e) {}
      }

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (new_username && new_username !== username) {
        const usernameExists = db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").get(new_username, user.id);
        if (usernameExists) {
          return res.status(400).json({ error: "Username already taken" });
        }
      }

      // 2. Update SQLite first
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
            db.prepare("UPDATE riders SET name = ?, age = ?, city = ?, blood_type = ? WHERE user_id = ?")
              .run(profileData.name || null, profileData.age || null, profileData.city || null, profileData.blood_type || null, user.id);
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
      } catch (sqError: any) {
        console.error("SQLite update failed for profile:", sqError.message);
        return res.status(500).json({ error: "Failed to update profile locally" });
      }

      // 3. Sync to Firestore in background (fail silently but log if not permission error)
      try {
        const userUpdate: any = {
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        };
        if (profile_picture_url) userUpdate.profile_picture_url = profile_picture_url;
        if (cover_photo_url) userUpdate.cover_photo_url = cover_photo_url;
        if (new_username && new_username !== username) userUpdate.username = new_username;

        if (user.type === "rider") {
          userUpdate.fullName = profileData.name || user.fullName;
          userUpdate.location = profileData.city || user.location;
          userUpdate.bio = profileData.bio || user.bio;
          userUpdate.motorcycle = profileData.motorcycle || user.motorcycle;
          userUpdate.interests = interestsStr || user.interests;

          await collections.riders.doc(user.id.toString()).set({
            name: profileData.name || null,
            age: profileData.age || null,
            city: profileData.city || null,
            blood_type: profileData.blood_type || null,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } else {
          userUpdate.businessName = profileData.company_name || user.businessName;
          userUpdate.location = profileData.full_address || user.location;
          userUpdate.businessType = profileData.service_category || user.businessType;
          userUpdate.bio = profileData.details || user.bio;
          userUpdate.services = servicesStr || user.services;

          await collections.ecosystems.doc(user.id.toString()).set({
            company_name: profileData.company_name || null,
            full_address: profileData.full_address || null,
            service_category: profileData.service_category || null,
            details: profileData.details || null,
            phone: profileData.phone || null,
            website: profileData.website || null,
            chapter_label: profileData.chapter_label || 'Chapter',
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }

        await collections.users.doc(user.id.toString()).set(userUpdate, { merge: true });
      } catch (firestoreError: any) {
        if (!firestoreError.message?.includes('PERMISSION_DENIED')) {
          console.warn("Firestore profile sync failed:", firestoreError.message);
        }
      }

      res.json({ 
        success: true, 
        username: new_username || username,
        profile_picture_url: profile_picture_url || user.profile_picture_url,
        cover_photo_url: cover_photo_url || user.cover_photo_url
      });
    } catch (error: any) {
      console.error("Error updating profile:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // MotoClubs Endpoints
  app.get("/api/clubs", async (req, res) => {
    try {
      // 1. Fetch from Firestore
      const snapshot = await collections.ecosystems.where("service_category", "==", "club").get();
      let clubs: any[] = [];
      if (!snapshot.empty) {
         clubs = await Promise.all(snapshot.docs.map(async doc => {
           const data = doc.data();
           const userData = (await findUserById(doc.id)) || {};
           const membersSnap = await collections.club_memberships.where("club_id", "==", parseInt(doc.id)).where("status", "==", "approved").get();
           return {
             club_id: parseInt(doc.id),
             username: (userData as any).username || '',
             logo_url: (userData as any).profile_picture_url || '',
             name: data.company_name,
             description: data.details,
             founded_date: (userData as any).created_at,
             plan: (userData as any).plan || 'freemium',
             member_count: membersSnap.size
           };
         }));
      }

      // 2. Fetch from SQLite
      const sqliteClubs = db.prepare(`
        SELECT u.id as club_id, u.username, u.profile_picture_url as logo_url, e.company_name as name, e.details as description, u.created_at as founded_date, u.plan,
               (SELECT COUNT(*) FROM club_memberships WHERE club_id = u.id AND status = 'approved') as member_count
        FROM users u
        JOIN ecosystems e ON u.id = e.user_id
        WHERE u.type = 'ecosystem' AND e.service_category = 'club'
      `).all() as any[];

      // 3. Merge
      const allClubsMap = new Map();
      sqliteClubs.forEach((c: any) => allClubsMap.set(c.club_id.toString(), c));
      clubs.forEach((c: any) => allClubsMap.set(c.club_id.toString(), c)); // Firestore overwrites SQLite

      res.json(Array.from(allClubsMap.values()));
    } catch (error: any) {
      console.error("Error fetching clubs:", error);
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

  app.get("/api/clubs/my", authenticateToken, async (req: any, res) => {
    const userId = req.user.id;
    try {
      // 1. Try SQLite first
      const ownedClubs = db.prepare(`
        SELECT u.id as club_id, u.username, u.profile_picture_url as logo_url, e.company_name as name, e.details as description, u.created_at as founded_date, u.plan, e.chapter_label
        FROM users u
        JOIN ecosystems e ON u.id = e.user_id
        WHERE (u.id = ? OR e.owner_id = ?) AND e.service_category = 'club'
      `).all(userId, userId);

      const memberships = db.prepare(`
        SELECT cm.*, u.username, u.profile_picture_url as logo_url, e.company_name as name, e.details as description, u.plan, e.chapter_label
        FROM club_memberships cm
        JOIN users u ON cm.club_id = u.id
        JOIN ecosystems e ON u.id = e.user_id
        WHERE cm.user_id = ? AND cm.status != 'rejected'
      `).all(userId);

      if (ownedClubs.length > 0 || memberships.length > 0) {
        return res.json({ ownedClubs, memberships });
      }

      // 2. Fallback to Firestore
      try {
        const ownedSnapshot = await collections.ecosystems
          .where("service_category", "==", "club")
          .get();
        
        const ownedClubsDocs = await Promise.all(ownedSnapshot.docs.filter(doc => {
          const data = doc.data();
          return doc.id.toString() === userId.toString() || (data.owner_id && data.owner_id.toString() === userId.toString());
        }).map(async (doc) => {
          const userData = (await findUserById(doc.id)) || {};
          return {
            club_id: doc.id,
            username: (userData as any).username,
            logo_url: (userData as any).profile_picture_url,
            name: doc.data().company_name,
            description: doc.data().details,
            founded_date: (userData as any).created_at,
            plan: (userData as any).plan,
            chapter_label: doc.data().chapter_label
          };
        }));

        const membershipSnapshot = await collections.club_memberships
          .where("user_id", "==", parseInt(userId as string))
          .get();
        
        const membershipsDocs = await Promise.all(membershipSnapshot.docs.filter(d => d.data().status !== 'rejected').map(async (doc) => {
          const mem = doc.data() as any;
          const userData = (await findUserById(mem.club_id)) || {};
          const clubEcoDoc = await collections.ecosystems.doc(mem.club_id.toString()).get();
          const ecoData = clubEcoDoc.exists ? clubEcoDoc.data() : {};
          return {
            ...mem,
            id: doc.id,
            username: (userData as any).username,
            logo_url: (userData as any).profile_picture_url,
            name: (ecoData as any).company_name,
            description: (ecoData as any).details,
            plan: (userData as any).plan,
            chapter_label: (ecoData as any).chapter_label
          };
        }));

        res.json({ ownedClubs: ownedClubsDocs, memberships: membershipsDocs });
      } catch (err: any) {
        if (!err.message?.includes('PERMISSION_DENIED')) {
          console.error("Error fetching clubs from Firestore:", err.message);
        }
        res.json({ ownedClubs: [], memberships: [] });
      }
    } catch (error: any) {
      console.error("Error fetching my clubs:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/clubs/:id", async (req, res) => {
    const clubId = req.params.id;
    try {
      let club: any = null;

      // 1. Check SQLite
      club = db.prepare(`
        SELECT u.id as club_id, u.username, u.profile_picture_url as logo_url, e.company_name as name, e.details as description, u.created_at as founded_date, u.plan, e.chapter_label
        FROM users u
        JOIN ecosystems e ON u.id = e.user_id
        WHERE u.id = ? AND e.service_category = 'club'
      `).get(clubId);

      // 2. Fallback to Firestore
      if (!club) {
        const clubDoc = await collections.ecosystems.doc(clubId.toString()).get();
        if (clubDoc.exists && clubDoc.data()?.service_category === 'club') {
          const userData = (await findUserById(clubId)) || {};
          club = {
            club_id: parseInt(clubId),
            username: (userData as any).username || '',
            logo_url: (userData as any).profile_picture_url || '',
            name: clubDoc.data()?.company_name,
            description: clubDoc.data()?.details,
            founded_date: (userData as any).created_at,
            plan: (userData as any).plan || 'freemium',
            chapter_label: clubDoc.data()?.chapter_label || 'Chapter'
          };
        }
      }

      if (!club) return res.status(404).json({ error: "Club not found" });

      // Fetch structured data
      let chapters = db.prepare("SELECT * FROM club_chapters WHERE club_id = ?").all(clubId) as any[];
      let roles = db.prepare("SELECT * FROM club_roles WHERE club_id = ? ORDER BY hierarchy_order ASC").all(clubId) as any[];
      
      // Sync from Firestore if local is empty (container restart scenario)
      if (chapters.length === 0) {
        const chaptersSnap = await collections.club_chapters.where("club_id", "==", parseInt(clubId)).get();
        if (!chaptersSnap.empty) {
          chapters = chaptersSnap.docs.map(doc => doc.data());
          // Populate SQLite cache
          const insertStmt = db.prepare("INSERT OR IGNORE INTO club_chapters (id, club_id, name, city, country, description) VALUES (?, ?, ?, ?, ?, ?)");
          chapters.forEach(c => {
            try { insertStmt.run(c.id, c.club_id, c.name, c.city || '', c.country || '', c.description || ''); } catch (e) {}
          });
        }
      }
      
      if (roles.length === 0) {
        const rolesSnap = await collections.club_roles.where("club_id", "==", parseInt(clubId)).orderBy("hierarchy_order", "asc").get();
        if (!rolesSnap.empty) {
          roles = rolesSnap.docs.map(doc => doc.data());
          // Populate SQLite cache
          const insertStmt = db.prepare("INSERT OR IGNORE INTO club_roles (id, club_id, name, description, permissions, hierarchy_order) VALUES (?, ?, ?, ?, ?, ?)");
          roles.forEach(r => {
            try { insertStmt.run(r.id, r.club_id, r.name, r.description || '', JSON.stringify(typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || [])), r.hierarchy_order || 0); } catch (e) {}
          });
        }
      }
      
      // Fetch members from SQLite + Firestore
      const sqliteMembers = db.prepare(`
        SELECT cm.*, u.username, u.profile_picture_url as avatar_url, r.name as rider_name, u.plan
        FROM club_memberships cm
        JOIN users u ON cm.user_id = u.id
        LEFT JOIN riders r ON u.id = r.user_id
        WHERE cm.club_id = ?
      `).all(clubId) as any[];

      const fsMembersSnap = await collections.club_memberships.where("club_id", "==", parseInt(clubId)).get();
      let membersMap = new Map();
      sqliteMembers.forEach(m => membersMap.set(m.user_id.toString(), m));

      await Promise.all(fsMembersSnap.docs.map(async (doc) => {
        const data = doc.data();
        if (!membersMap.has(data.user_id.toString())) {
          const uData = (await findUserById(data.user_id)) || {};
          const rDoc = await collections.riders.doc(data.user_id.toString()).get();
          const rData = rDoc.exists ? rDoc.data() : {};
          membersMap.set(data.user_id.toString(), {
            id: doc.id,
            ...data,
            username: (uData as any).username,
            avatar_url: (uData as any).profile_picture_url,
            rider_name: (rData as any).name,
            plan: (uData as any).plan
          });
        }
      }));

      res.json({ club, chapters, roles, members: Array.from(membersMap.values()) });
    } catch (error: any) {
      console.error("Error fetching single club:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clubs/:id/members", authenticateToken, async (req: any, res) => {
    const clubId = req.params.id;
    const { user_id, chapter_id, role_id } = req.body;

    try {
      let club: any = null;
      let clubOwnerId = null;

      const clubDoc = await collections.ecosystems.doc(clubId.toString()).get();
      if (clubDoc.exists) {
        club = clubDoc.data();
        clubOwnerId = club?.owner_id;
      } else {
        const sqliteClub = db.prepare("SELECT * FROM ecosystems WHERE user_id = ? AND service_category = 'club'").get(Number(clubId)) as any;
        if (!sqliteClub) {
          console.error("DEBUG: Club not found in POST /api/clubs/:id/members. clubId:", clubId);
          return res.status(404).json({ error: "Club not found" });
        }
        club = sqliteClub;
        clubOwnerId = sqliteClub.owner_id;
      }
      
      if (clubId.toString() !== req.user.id.toString() && (clubOwnerId && clubOwnerId.toString() !== req.user.id.toString()) && req.user.role !== 'admin') {
        return res.status(403).json({ error: "Forbidden: Only club owners can add members" });
      }

      const existingSnapshot = await collections.club_memberships
        .where("club_id", "==", parseInt(clubId))
        .where("user_id", "==", parseInt(user_id as string))
        .limit(1)
        .get();

      if (!existingSnapshot.empty) {
        return res.status(400).json({ error: "User is already a member or has a pending application" });
      }

      const membershipId = await getNextId("club_memberships");
      await collections.club_memberships.doc(membershipId.toString()).set({
        club_id: parseInt(clubId),
        chapter_id: chapter_id ? parseInt(chapter_id as string) : null,
        user_id: parseInt(user_id as string),
        role_id: role_id ? parseInt(role_id as string) : null,
        status: 'approved',
        created_at: new Date().toISOString()
      });
      
      // Dual write to SQLite
      try {
        db.prepare("INSERT INTO club_memberships (club_id, chapter_id, user_id, role_id, status) VALUES (?, ?, ?, ?, 'approved')")
          .run(parseInt(clubId), chapter_id || null, user_id, role_id || null);
      } catch (sqe) {}
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error adding club member in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clubs/:id/apply", authenticateToken, async (req: any, res) => {
    const clubId = req.params.id;
    const userId = req.user.id;
    const { chapter_id } = req.body;

    try {
      const existingSnapshot = await collections.club_memberships
        .where("club_id", "==", parseInt(clubId))
        .where("user_id", "==", parseInt(userId as string))
        .limit(1)
        .get();

      if (!existingSnapshot.empty) {
        return res.status(400).json({ error: "Application already exists or you are already a member" });
      }

      const membershipId = await getNextId("club_memberships");
      await collections.club_memberships.doc(membershipId.toString()).set({
        club_id: parseInt(clubId),
        chapter_id: chapter_id ? parseInt(chapter_id as string) : null,
        user_id: parseInt(userId as string),
        status: 'pending',
        created_at: new Date().toISOString()
      });

      // Dual write to SQLite
      try {
        db.prepare("INSERT INTO club_memberships (club_id, chapter_id, user_id, status) VALUES (?, ?, ?, 'pending')")
          .run(parseInt(clubId), chapter_id || null, userId);
      } catch (sqe) {}

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error applying to club in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/clubs/:id/members/:membership_id", authenticateToken, async (req: any, res) => {
    const clubId = req.params.id;
    const membershipId = req.params.membership_id;
    const { status, role_id, chapter_id } = req.body;
    
    try {
      let club: any = null;
      let clubOwnerId = null;
      const clubDoc = await collections.ecosystems.doc(clubId.toString()).get();
      if (clubDoc.exists) {
        club = clubDoc.data();
        clubOwnerId = club?.owner_id;
      } else {
        const sqliteClub = db.prepare("SELECT * FROM ecosystems WHERE user_id = ?").get(Number(clubId)) as any;
        if (!sqliteClub) {
          console.error("DEBUG: Club not found in PUT /api/clubs/:id/members. clubId:", clubId);
          return res.status(404).json({ error: "Club not found" });
        }
        club = sqliteClub;
        clubOwnerId = sqliteClub.owner_id;
      }
      
      if (clubId.toString() !== req.user.id.toString() && (clubOwnerId && clubOwnerId.toString() !== req.user.id.toString()) && req.user.role !== 'admin') {
        return res.status(403).json({ error: "Forbidden: Only club owners can manage members" });
      }

      const updates: any = {};
      if (status) updates.status = status;
      if (role_id !== undefined) updates.role_id = role_id ? parseInt(role_id as string) : null;
      if (chapter_id !== undefined) updates.chapter_id = chapter_id ? parseInt(chapter_id as string) : null;
      
      if (Object.keys(updates).length > 0) {
        try {
          await collections.club_memberships.doc(membershipId.toString()).set(updates, { merge: true });
        } catch (fbErr) {
          console.error('Firestore membership update error:', fbErr);
        }
        
        // Dual write to SQLite
        try {
          const sqlUpdates = [];
          const params = [];
          if (status) { sqlUpdates.push("status = ?"); params.push(status); }
          if (role_id !== undefined) { sqlUpdates.push("role_id = ?"); params.push(role_id); }
          if (chapter_id !== undefined) { sqlUpdates.push("chapter_id = ?"); params.push(chapter_id); }
          params.push(membershipId, parseInt(clubId));
          db.prepare(`UPDATE club_memberships SET ${sqlUpdates.join(", ")} WHERE id = ? AND club_id = ?`).run(...params);
        } catch (sqe) {}
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating club membership in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/clubs/:id/members/:membership_id", authenticateToken, async (req: any, res) => {
    const clubId = req.params.id;
    const membershipId = req.params.membership_id;
    const userId = req.user.id;

    try {
      let membership: any = null;
      const memDoc = await collections.club_memberships.doc(membershipId.toString()).get();
      if (memDoc.exists) {
        membership = memDoc.data();
      } else {
        membership = db.prepare("SELECT * FROM club_memberships WHERE id = ?").get(membershipId) as any;
      }

      if (!membership) {
        return res.status(404).json({ error: "Membership not found" });
      }

      const clubDoc = await collections.ecosystems.doc(clubId.toString()).get();
      const clubData = clubDoc.exists ? (clubDoc.data() as any) : (db.prepare("SELECT owner_id FROM ecosystems WHERE user_id = ?").get(clubId) || {});

      const isOwner = clubId.toString() === userId.toString() || (clubData.owner_id && clubData.owner_id.toString() === userId.toString());
      
      if (membership.user_id.toString() !== userId.toString() && !isOwner && req.user.role !== 'admin') {
        return res.status(403).json({ error: "Forbidden: You can only cancel your own membership" });
      }

      try {
        await collections.club_memberships.doc(membershipId.toString()).delete();
      } catch (e) {}
      
      // Dual delete SQLite
      try {
        db.prepare("DELETE FROM club_memberships WHERE id = ? AND club_id = ?").run(membershipId, parseInt(clubId));
      } catch (sqe) {}

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting club membership in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clubs/:id/roles", authenticateToken, async (req: any, res) => {
    const clubId = req.params.id;
    const { name, description, permissions } = req.body;

    try {
      let club = db.prepare("SELECT user_id, owner_id FROM ecosystems WHERE user_id = ?").get(clubId) as any;
      if (!club) {
        const clubDoc = await collections.ecosystems.doc(clubId.toString()).get();
        if (clubDoc.exists) club = { user_id: clubDoc.id, owner_id: clubDoc.data()?.owner_id };
      }
      if (!club || (Number(club.user_id) !== Number(req.user.id) && Number(club.owner_id) !== Number(req.user.id) && req.user.role !== 'admin')) {
        return res.status(403).json({ error: "Forbidden: Only club owners can manage roles" });
      }

      // Ensure club exists in SQLite users to avoid FOREIGN KEY errors
      try {
        db.prepare("INSERT OR IGNORE INTO users (id, username, email, type, status) VALUES (?, ?, ?, 'ecosystem', 'active')").run(parseInt(clubId), `club_${clubId}`, `club_${clubId}@temp.com`);
      } catch (sqErr) {}

      const info = db.prepare("INSERT INTO club_roles (club_id, name, description, permissions) VALUES (?, ?, ?, ?)")
        .run(parseInt(clubId), name, description, JSON.stringify(permissions || []));
      
      const roleId = info.lastInsertRowid;
      
      try {
        await collections.club_roles.doc(roleId.toString()).set({
          id: roleId,
          club_id: parseInt(clubId),
          name,
          description,
          permissions: JSON.stringify(permissions || []),
          hierarchy_order: 0
        });
      } catch (fbErr) {
        console.error("Failed to write role to Firestore", fbErr);
      }

      res.json({ success: true, role_id: roleId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/clubs/:id/roles/reorder", authenticateToken, async (req: any, res) => {
    const clubId = req.params.id;
    const { roles } = req.body; // Array of { id, hierarchy_order }

    try {
      let club = db.prepare("SELECT user_id, owner_id FROM ecosystems WHERE user_id = ?").get(clubId) as any;
      if (!club) {
        const clubDoc = await collections.ecosystems.doc(clubId.toString()).get();
        if (clubDoc.exists) club = { user_id: clubDoc.id, owner_id: clubDoc.data()?.owner_id };
      }
      if (!club || (Number(club.user_id) !== Number(req.user.id) && Number(club.owner_id) !== Number(req.user.id) && req.user.role !== 'admin')) {
        return res.status(403).json({ error: "Forbidden: Only club owners can manage roles" });
      }

      const updateStmt = db.prepare("UPDATE club_roles SET hierarchy_order = ? WHERE id = ? AND club_id = ?");
      const transaction = db.transaction((rolesToUpdate: any[]) => {
        for (const role of rolesToUpdate) {
          updateStmt.run(role.hierarchy_order, role.id, parseInt(clubId));
        }
      });

      transaction(roles);
      
      try {
        const batch = firestore.batch();
        for (const role of roles) {
          batch.update(collections.club_roles.doc(role.id.toString()), {
            hierarchy_order: role.hierarchy_order
          });
        }
        await batch.commit();
      } catch (fbErr) {
        console.error("Failed to sync role reorder to Firestore", fbErr);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/clubs/:id/roles/:role_id", authenticateToken, async (req: any, res) => {
    const clubId = req.params.id;
    const roleId = req.params.role_id;
    const { name, description, permissions } = req.body;

    try {
      let club = db.prepare("SELECT user_id, owner_id FROM ecosystems WHERE user_id = ?").get(clubId) as any;
      if (!club) {
        const clubDoc = await collections.ecosystems.doc(clubId.toString()).get();
        if (clubDoc.exists) club = { user_id: clubDoc.id, owner_id: clubDoc.data()?.owner_id };
      }
      if (!club || (Number(club.user_id) !== Number(req.user.id) && Number(club.owner_id) !== Number(req.user.id) && req.user.role !== 'admin')) {
        return res.status(403).json({ error: "Forbidden: Only club owners can manage roles" });
      }

      db.prepare("UPDATE club_roles SET name = ?, description = ?, permissions = ? WHERE id = ? AND club_id = ?")
        .run(name, description, JSON.stringify(permissions || []), roleId, parseInt(clubId));

      try {
        await collections.club_roles.doc(roleId.toString()).update({
          name,
          description,
          permissions: JSON.stringify(permissions || [])
        });
      } catch (fbErr) {
        console.error("Failed to update role in Firestore", fbErr);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/clubs/:id/roles/:role_id", authenticateToken, async (req: any, res) => {
    const clubId = req.params.id;
    const roleId = req.params.role_id;

    try {
      let club = db.prepare("SELECT user_id, owner_id FROM ecosystems WHERE user_id = ?").get(clubId) as any;
      if (!club) {
        const clubDoc = await collections.ecosystems.doc(clubId.toString()).get();
        if (clubDoc.exists) club = { user_id: clubDoc.id, owner_id: clubDoc.data()?.owner_id };
      }
      if (!club || (Number(club.user_id) !== Number(req.user.id) && Number(club.owner_id) !== Number(req.user.id) && req.user.role !== 'admin')) {
        return res.status(403).json({ error: "Forbidden: Only club owners can manage roles" });
      }

      // SQLite modifications
      db.prepare("UPDATE club_memberships SET role_id = NULL WHERE role_id = ? AND club_id = ?").run(roleId, parseInt(clubId));
      db.prepare("DELETE FROM club_roles WHERE id = ? AND club_id = ?").run(roleId, parseInt(clubId));

      try {
        // Find memberships with this role in Firestore and nullify it
        const membershipsSnap = await collections.club_memberships.where("club_id", "==", parseInt(clubId)).where("role_id", "==", parseInt(roleId)).get();
        if (!membershipsSnap.empty) {
          const batch = firestore.batch();
          membershipsSnap.docs.forEach(doc => {
            batch.update(doc.ref, { role_id: null });
          });
          await batch.commit();
        }
        await collections.club_roles.doc(roleId.toString()).delete();
      } catch (fbErr) {
        console.error("Failed to update/delete role in Firestore", fbErr);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/clubs/:id/settings", authenticateToken, async (req: any, res) => {
    const clubId = req.params.id;
    const userId = req.user.id;
    const { chapter_label, company_name, details } = req.body;

    try {
      let club = db.prepare("SELECT user_id, owner_id FROM ecosystems WHERE user_id = ?").get(clubId) as any;
      if (!club) {
        const clubDoc = await collections.ecosystems.doc(clubId.toString()).get();
        if (clubDoc.exists) club = { user_id: clubDoc.id, owner_id: clubDoc.data()?.owner_id };
        if (!club) return res.status(404).json({ error: "Club not found" });
      }
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

  app.post("/api/clubs/create", authenticateToken, async (req: any, res) => {
    const userId = req.user.id;
    const { name, description, location, chapter_label, external_link } = req.body;

    try {
      // Check if user is an approved ambassador
      let ambassador = db.prepare("SELECT * FROM ambassadors WHERE user_id = ?").get(userId);
      if (!ambassador) {
         try {
           const doc = await collections.ambassadors.doc(userId.toString()).get();
           if (doc.exists && doc.data()?.is_active) ambassador = true;
         } catch(e) {}
      }

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
      db.prepare("INSERT INTO ecosystems (user_id, company_name, details, full_address, service_category, owner_id, chapter_label, website) VALUES (?, ?, ?, ?, 'club', ?, ?, ?)")
        .run(clubUserId, name, description, location || null, userId, chapter_label || 'Chapter', external_link || null);
        
      // Write to Firestore User
      const nowInt = Math.floor(Date.now() / 1000);
      await collections.users.doc(clubUserId.toString()).set({
          username,
          email,
          type: 'ecosystem',
          role: 'user',
          status: 'active',
          plan: 'freemium',
          fullName: name || '',
          bio: description || '',
          location: location || '',
          created_at: nowInt,
          updated_at: nowInt
      });

      // Write to Firestore Ecosystems
      await collections.ecosystems.doc(clubUserId.toString()).set({
          company_name: name || '',
          details: description || '',
          full_address: location || '',
          service_category: 'club',
          owner_id: parseInt(userId as string),
          chapter_label: chapter_label || 'Chapter',
          website: external_link || ''
      });

      res.json({ success: true, club_id: clubUserId });
    } catch (error: any) {
      console.error("Error creating club:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clubs/:id/chapters", authenticateToken, async (req: any, res) => {
    const clubId = req.params.id;
    const { name, city, country, description } = req.body;

    try {
      let club = db.prepare("SELECT user_id, owner_id FROM ecosystems WHERE user_id = ?").get(clubId) as any;
      if (!club) {
        const clubDoc = await collections.ecosystems.doc(clubId.toString()).get();
        if (clubDoc.exists) club = { user_id: clubDoc.id, owner_id: clubDoc.data()?.owner_id };
      }
      if (!club || (Number(club.user_id) !== Number(req.user.id) && Number(club.owner_id) !== Number(req.user.id) && req.user.role !== 'admin')) {
        return res.status(403).json({ error: "Forbidden: Only club owners can manage chapters" });
      }

      // Ensure club exists in SQLite users to avoid FOREIGN KEY errors
      try {
        db.prepare("INSERT OR IGNORE INTO users (id, username, email, type, status) VALUES (?, ?, ?, 'ecosystem', 'active')").run(parseInt(clubId), `club_${clubId}`, `club_${clubId}@temp.com`);
      } catch (sqErr) {}

      const info = db.prepare("INSERT INTO club_chapters (club_id, name, city, country, description) VALUES (?, ?, ?, ?, ?)")
        .run(parseInt(clubId), name, city, country, description);
      
      const chapterId = info.lastInsertRowid;
      
      try {
        await collections.club_chapters.doc(chapterId.toString()).set({
          id: chapterId,
          club_id: parseInt(clubId),
          name,
          city: city || '',
          country: country || '',
          description: description || ''
        });
      } catch (fbErr) {
        console.error("Failed to write chapter to Firestore", fbErr);
      }

      res.json({ success: true, chapter_id: chapterId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/clubs/:id/chapters/:chapter_id", authenticateToken, async (req: any, res) => {
    const clubId = req.params.id;
    const chapterId = req.params.chapter_id;

    if (Number(clubId) !== Number(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden: Only club owners can manage chapters" });
    }

    try {
      db.prepare("DELETE FROM club_chapters WHERE id = ? AND club_id = ?").run(chapterId, parseInt(clubId));
      
      try {
        await collections.club_chapters.doc(chapterId.toString()).delete();
      } catch (fbErr) {
        console.error("Failed to delete chapter in Firestore", fbErr);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Ambassador Invite Links
  app.post("/api/ambassadors/invites", authenticateToken, checkAmbassador, async (req: any, res) => {
    try {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const inviteId = await getNextId("invite_links");
      const inviteData: any = {
        id: inviteId,
        code,
        sponsor_id: req.user.id,
        is_used: 0,
        used_by_user_id: null,
        created_at: new Date().toISOString()
      };
      await collections.invite_links.doc(inviteId.toString()).set(inviteData);
      
      // Dual write to SQLite
      try {
        db.prepare("INSERT INTO invite_links (id, code, sponsor_id, is_used, created_at) VALUES (?, ?, ?, ?, ?)").run(inviteId, code, req.user.id, 0, inviteData.created_at);
      } catch (sqe) {}
      
      res.json({ success: true, code, inviteData });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ambassadors/invites", authenticateToken, checkAmbassador, async (req: any, res) => {
    try {
      const fbInvites = await collections.invite_links.where("sponsor_id", "==", req.user.id).orderBy("created_at", "desc").get();
      if (!fbInvites.empty) {
        return res.json(fbInvites.docs.map(doc => doc.data()));
      }
      
      const invites = db.prepare("SELECT * FROM invite_links WHERE sponsor_id = ? ORDER BY created_at DESC").all(req.user.id);
      res.json(invites);
    } catch (error: any) {
      if (!error.message?.includes('PERMISSION_DENIED')) {
         console.error("Error fetching invites:", error);
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/invites/:code/verify", async (req, res) => {
    try {
      let invite: any = null;
      try {
        invite = db.prepare("SELECT * FROM invite_links WHERE code = ?").get(req.params.code) as any;
      } catch (sqe) {}
      
      if (!invite) {
        try {
          const inviteDocs = await collections.invite_links.where("code", "==", req.params.code).get();
          if (!inviteDocs.empty) {
             invite = inviteDocs.docs[0].data();
          }
        } catch (fbErr: any) {
          console.error("Invite Firestore Error:", fbErr);
        }
      }

      if (!invite) return res.status(404).json({ valid: false, error: "Invite code not found" });
      if (invite.is_used === 1) return res.status(400).json({ valid: false, error: "Invite code already used" });
      
      let sponsor: any = null;
      try {
        sponsor = db.prepare(`SELECT a.*, u.username, u.profile_picture_url FROM ambassadors a JOIN users u ON a.user_id = u.id WHERE a.user_id = ?`).get(invite.sponsor_id);
      } catch (sqe) {}
      
      if (!sponsor) {
        try {
          const aDoc = await collections.ambassadors.doc(invite.sponsor_id.toString()).get();
          const uDoc = await collections.users.doc(invite.sponsor_id.toString()).get();
          if (aDoc.exists && uDoc.exists) {
             sponsor = { ...aDoc.data(), username: uDoc.data()?.username, profile_picture_url: uDoc.data()?.profile_picture_url };
          }
        } catch (fbErr) {}
      }
      
      res.json({ valid: true, sponsor });
    } catch (error: any) {
      res.status(500).json({ valid: false, error: error.message });
    }
  });

  // Ambassador Network Endpoints
  app.post("/api/ambassadors/apply", authenticateToken, checkFeatureAccess('create_club'), async (req: any, res) => {
    const { user_id, category, name, location, description, photos, links, proof_of_legitimacy } = req.body;
    
    if (user_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only apply for yourself" });
    }

    try {
      const appId = await getNextId("ambassador_applications");
      const appData = {
        user_id: parseInt(user_id as string),
        category,
        name,
        location,
        description,
        photos: photos || [],
        links: links || [],
        proof_of_legitimacy,
        status: 'pending',
        created_at: new Date().toISOString()
      };

      await collections.ambassador_applications.doc(appId.toString()).set(appData);

      // Dual write to SQLite
      try {
        db.prepare(`
          INSERT INTO ambassador_applications (user_id, category, name, location, description, photos, links, proof_of_legitimacy)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(user_id, category, name, location, description, JSON.stringify(photos || []), JSON.stringify(links || []), proof_of_legitimacy);
      } catch (sqe) {}

      res.json({ success: true, id: appId });
    } catch (error: any) {
      console.error("Error submitting ambassador application in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ambassadors/applications", authenticateToken, checkAdmin, async (req, res) => {
    try {
      const applications = db.prepare(`
        SELECT a.*, u.username, u.email
        FROM ambassador_applications a
        JOIN users u ON a.user_id = u.id
        ORDER BY a.created_at DESC
      `).all();
      if (applications.length > 0) return res.json(applications);
      // Fallback to Firestore when SQLite is empty.
      const snapshot = await collections.ambassador_applications.orderBy("created_at", "desc").get();
      const fsApps = await Promise.all(snapshot.docs.map(async (doc) => {
        const a = doc.data() as any;
        const userData = (await findUserById(a.user_id)) || {};
        return { ...a, id: doc.id, username: userData.username, email: userData.email };
      }));
      res.json(fsApps);
    } catch (error: any) {
      console.error("Error fetching ambassador applications:", error);
      res.json([]);
    }
  });

  app.post("/api/ambassadors/applications/:id/approve", authenticateToken, checkAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const appRef = collections.ambassador_applications.doc(id);
      const appDoc = await appRef.get();
      if (!appDoc.exists) throw new Error("Application not found");
      const app = appDoc.data() as any;
      
      const now = new Date().toISOString();
      await appRef.update({ status: 'approved' });
      
      const ambassadorData = {
        user_id: app.user_id,
        category: app.category,
        is_active: 1,
        reputation: 0,
        level: 1,
        created_at: now
      };
      await collections.ambassadors.doc(app.user_id.toString()).set(ambassadorData);
      
      // Notify user
      const notifId = Math.random().toString(36).substring(2, 15);
      await collections.notifications.doc(notifId).set({
        user_id: app.user_id,
        type: 'system',
        content: 'Your ambassador application has been approved!',
        link: `/profile`,
        is_read: 0,
        created_at: now
      });

      // Dual write to SQLite
      try {
        db.transaction(() => {
          db.prepare("UPDATE ambassador_applications SET status = 'approved' WHERE id = ?").run(id);
          db.prepare("INSERT OR IGNORE INTO ambassadors (user_id, category) VALUES (?, ?)").run(app.user_id, app.category);
          db.prepare("INSERT INTO notifications (user_id, type, content, link) VALUES (?, ?, ?, ?)").run(
            app.user_id, 'system', 'Your ambassador application has been approved!', `/profile`
          );
        })();
      } catch (sqe) {}

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error approving ambassador application in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ambassadors/applications/:id/reject", authenticateToken, checkAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const appRef = collections.ambassador_applications.doc(id);
      const appDoc = await appRef.get();
      if (!appDoc.exists) throw new Error("Application not found");
      const app = appDoc.data() as any;
      
      const now = new Date().toISOString();
      await appRef.update({ status: 'rejected' });
      
      // Notify user
      const notifId = Math.random().toString(36).substring(2, 15);
      await collections.notifications.doc(notifId).set({
        user_id: app.user_id,
        type: 'system',
        content: 'Your ambassador application has been reviewed but not approved at this time.',
        link: `/ambassador`,
        is_read: 0,
        created_at: now
      });

      // Dual write to SQLite
      try {
        db.transaction(() => {
          db.prepare("UPDATE ambassador_applications SET status = 'rejected' WHERE id = ?").run(id);
          db.prepare("INSERT INTO notifications (user_id, type, content, link) VALUES (?, ?, ?, ?)").run(
            app.user_id, 'system', 'Your ambassador application has been reviewed but not approved at this time.', `/ambassador`
          );
        })();
      } catch (sqe) {}

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error rejecting ambassador application in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ambassadors", async (req, res) => {
    try {
      // Try SQLite first
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

      if (ambassadors.length > 0) {
        return res.json(ambassadors);
      }

      // Fallback to Firestore
      try {
        const snapshot = await collections.ambassadors.where("is_active", "==", 1).get();
        const firestoreAmbassadors = await Promise.all(snapshot.docs.map(async (doc) => {
          const a = doc.data() as any;
          const userData = (await findUserById(a.user_id)) || {};
          
          let profileDetails: any = {};
          if (userData.type === 'ecosystem') {
            const ecoDoc = await collections.ecosystems.doc(a.user_id.toString()).get();
            if (ecoDoc.exists) profileDetails = ecoDoc.data();
          } else {
            const riderDoc = await collections.riders.doc(a.user_id.toString()).get();
            if (riderDoc.exists) profileDetails = riderDoc.data();
          }

          return {
            ...a,
            id: doc.id,
            username: userData.username,
            profile_picture_url: userData.profile_picture_url,
            display_name: profileDetails.company_name || profileDetails.name || userData.username,
            location: profileDetails.full_address || profileDetails.city || 'Unknown',
            lat: profileDetails.lat || null,
            lng: profileDetails.lng || null
          };
        }));
        res.json(firestoreAmbassadors);
      } catch (err: any) {
        if (!err.message?.includes('PERMISSION_DENIED')) {
          console.error("Error fetching ambassadors from Firestore:", err.message);
        }
        res.json([]);
      }
    } catch (error: any) {
      console.error("Error fetching ambassadors:", error.message);
      res.status(500).json({ error: "Failed to fetch ambassadors" });
    }
  });

  app.get("/api/ambassadors/:id/application-status", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    if (id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      let snapshot = await collections.ambassador_applications
        .where("user_id", "==", typeof id === 'string' && !isNaN(Number(id)) ? parseInt(id) : id)
        .get();
        
      if (snapshot.empty) {
         snapshot = await collections.ambassador_applications
           .where("user_id", "==", id.toString())
           .get();
      }
      
      if (!snapshot.empty) {
        const apps = snapshot.docs.map(doc => doc.data() as any);
        apps.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        res.json({ status: apps[0].status });
      } else {
        // Fallback
        const application = db.prepare(`
          SELECT status 
          FROM ambassador_applications 
          WHERE user_id = ? 
          ORDER BY created_at DESC 
          LIMIT 1
        `).get(id) as any;
        res.json(application || { status: 'none' });
      }
    } catch (error: any) {
      console.error("Error fetching application status from Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/ambassadors/:id", async (req, res) => {
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

      if (ambassador) {
        return res.json(ambassador);
      }

      // Fallback
      const doc = await collections.ambassadors.doc(id.toString()).get();
      if (doc.exists) {
        const a = doc.data() as any;
        const userData = (await findUserById(id)) || {};
        
        let profileDetails: any = {};
        if (userData.type === 'ecosystem') {
          const ecoDoc = await collections.ecosystems.doc(id.toString()).get();
          if (ecoDoc.exists) profileDetails = ecoDoc.data();
        } else {
          const riderDoc = await collections.riders.doc(id.toString()).get();
          if (riderDoc.exists) profileDetails = riderDoc.data();
        }

        return res.json({
          ...a,
          id: doc.id,
          username: userData.username,
          profile_picture_url: userData.profile_picture_url,
          display_name: profileDetails.company_name || profileDetails.name || userData.username,
          location: profileDetails.full_address || profileDetails.city || 'Unknown',
          lat: profileDetails.lat || null,
          lng: profileDetails.lng || null
        });
      }

      res.json(null);
    } catch (error: any) {
      if (!error.message?.includes('PERMISSION_DENIED')) {
          console.error("Error fetching ambassador:", error.message);
      }
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

  // Tracking protection bypass: changed from /api/ambassadors/:id/stamps
  app.get(["/api/ambassadors/:id/passport-tokens", "/api/ambassadors/:id/stamps"], (req, res) => {
    const { id } = req.params;
    try {
      const stamps = db.prepare("SELECT * FROM passport_stamps WHERE ambassador_id = ?").all(id);
      res.json(stamps);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/stamps/scan", authenticateToken, async (req: any, res) => {
    const { user_id, stamp_id, location_lat, location_lng } = req.body;
    
    if (user_id.toString() !== req.user.id.toString() && req.user.role !== 'admin' && req.user.role !== 'moderator') {
      return res.status(403).json({ error: "Forbidden: You can only scan stamps for yourself" });
    }

    try {
      const stampDoc = await collections.passport_stamps.doc(stamp_id.toString()).get();
      if (!stampDoc.exists) {
        return res.status(404).json({ error: "Stamp not found" });
      }
      const stamp = stampDoc.data() as any;
      const ambassador_id = stamp.ambassador_id || 0;
      const creator_type = stamp.creator_type;
      const creator_id = stamp.creator_id;

      if (ambassador_id > 0) {
        const ambassadorDoc = await collections.ambassadors.doc(ambassador_id.toString()).get();
        const ambassador = ambassadorDoc.exists ? ambassadorDoc.data() as any : null;
        
        // Anti-fraud: Distance validation
        if (location_lat && location_lng && ambassador && ambassador.location_lat && ambassador.location_lng) {
          const distance = getDistanceFromLatLonInKm(location_lat, location_lng, ambassador.location_lat, ambassador.location_lng);
          if (distance > 1) {
            return res.status(403).json({ error: "You are too far from the ambassador to collect this stamp." });
          }
        }
      }

      const userStampId = `${user_id}_${stamp_id}`;
      const existingDoc = await collections.user_passport_stamps.doc(userStampId).get();
      if (existingDoc.exists) {
        return res.status(400).json({ error: "You already have this stamp!" });
      }

      await collections.user_passport_stamps.doc(userStampId).set({
        user_id: parseInt(user_id as string),
        stamp_id: parseInt(stamp_id as string),
        ambassador_id,
        location_lat: location_lat || 0,
        location_lng: location_lng || 0,
        creator_type,
        creator_id,
        created_at: new Date().toISOString()
      });
      
      // Dual write to SQLite
      try {
        db.prepare(`
          INSERT INTO user_passport_stamps (user_id, stamp_id, ambassador_id, location_lat, location_lng, creator_type, creator_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(user_id, stamp_id, ambassador_id, location_lat || 0, location_lng || 0, creator_type, creator_id);
      } catch (sqe) {}
      
      if (ambassador_id > 0) {
        await updateAmbassadorReputation(ambassador_id);
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error scanning stamp in Firestore:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/users/:id/basic", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    try {
      await ensureSqliteUserExists(id);
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

  app.post("/api/upload", authenticateToken, upload.single("file"), async (req: any, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    try {
      const fileUrl = await uploadToFirebase(req.file, "general");
      res.json({ url: fileUrl });
    } catch (err) {
      console.error("General upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
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
  app.get("/api/test-db-info", (req, res) => {
    res.json({ dbPath: isProd ? '/tmp/cafe777.db' : 'cafe777.db' });
  });

  // Tracking protection bypass: changed from /api/feature-access
  app.get("/api/f-access", (req, res) => {
    try {
      const all = (db.prepare("SELECT key, value FROM settings").all() as any[])
        .map((r: any) => ({ key: r.KEY ?? r.key, value: r.value }));
      const access: Record<string, string> = {};
      all.filter(s => s.key?.startsWith('feature_')).forEach(s => {
        access[s.key.replace('feature_', '')] = s.value;
      });
      res.json(access);
    } catch (err) {
      console.error("[f-access]", err);
      res.status(500).json({ error: "Failed to fetch feature access settings" });
    }
  });

  app.get("/api/admin/feature-access", authenticateToken, checkAdmin, (req, res) => {
    try {
      const settings = (db.prepare("SELECT key, value FROM settings").all() as any[])
        .map((r: any) => ({ key: r.KEY ?? r.key, value: r.value }))
        .filter((s: any) => s.key?.startsWith('feature_'));
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/feature-access", authenticateToken, checkAdmin, (req, res) => {
    const { featureKey, allowedPlan, features } = req.body;

    try {
      const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
      if (featureKey && allowedPlan && ['freemium', 'premium'].includes(allowedPlan)) {
        stmt.run(featureKey, allowedPlan);
      } else if (features && typeof features === 'object') {
        for (const [feature, access] of Object.entries(features)) {
          if (['freemium', 'premium'].includes(access as string)) {
            stmt.run(`feature_${feature}`, access);
          }
        }
      } else {
        return res.status(400).json({ error: "Invalid features configuration" });
      }
      res.json({ message: "Feature access configuration updated" });
    } catch (error: any) {
      console.error("[admin/feature-access POST]", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/register", async (req, res) => {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      console.error("Register validation failed:", JSON.stringify(validation.error.format(), null, 2));
      return res.status(400).json({ error: "Invalid input", details: validation.error.format() });
    }
    const { username, email, password, type, fullName, location, bio, motorcycle, bloodType, businessName, businessType, interests, services, referralCode } = validation.data;

    const interestsStr = Array.isArray(interests) ? interests.join(',') : interests;
    const servicesStr = Array.isArray(services) ? services.join(',') : services;

    try {
      // Check Turso first (source of truth post-Firebase-migration) then Firestore.
      const sqliteEmail = db.prepare("SELECT 1 FROM users WHERE email = ?").get(email);
      if (sqliteEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }
      const sqliteUsername = db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
      if (sqliteUsername) {
        return res.status(400).json({ error: "Username already exists" });
      }

      try {
        const firestoreEmailCheck = await collections.users.where("email", "==", email).limit(1).get();
        if (!firestoreEmailCheck.empty) {
          return res.status(400).json({ error: "Email already exists" });
        }
        const firestoreUsernameCheck = await collections.users.where("username", "==", username).limit(1).get();
        if (!firestoreUsernameCheck.empty) {
          return res.status(400).json({ error: "Username already exists" });
        }
      } catch (fsCheckErr: any) {
        if (!isPermissionDeniedErr(fsCheckErr)) {
          console.warn("Firestore duplicate check failed (proceeding):", fsCheckErr.message);
        }
      }

      let userId: any;
      const initialStatus = type === 'rider' ? 'active' : 'pending';
      const newReferralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      let hashedPassword = null;
      if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
      }
      
      // Writes diretas em auto-commit (sem db.transaction / BEGIN).
      // Em Turso remote mode (Hrana), db.exec("BEGIN") abre uma transação interativa
      // no Stream A, mas chamadas subsequentes de db.prepare().run() vão para streams
      // novos (auto-commit). O resultado é que apenas o INSERT INTO users fica dentro
      // da transação e nunca commita (COMMIT chega num stream sem tx → swallowed),
      // enquanto os INSERTs seguintes já commitaram. Sem BEGIN, cada statement
      // auto-commita individualmente e os dados persistem de imediato.
      {
        let referredBy = null;
        let isAmbassadorInvite = false;
        if (referralCode) {
          const referrer = db.prepare("SELECT id FROM users WHERE referral_code = ?").get(referralCode) as any;
          if (referrer) {
            referredBy = referrer.id;
          } else {
            const inviteLink = db.prepare("SELECT * FROM invite_links WHERE code = ? AND is_used = 0").get(referralCode) as any;
            if (inviteLink) {
              referredBy = inviteLink.sponsor_id;
              isAmbassadorInvite = true;
            }
          }
        }

        const result = insertUser.run(
          username,
          email,
          hashedPassword,
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
        userId = result.lastInsertRowid;

        // Limpa qualquer órfão que tenha ficado de tentativas anteriores com o mesmo
        // userId. Como userId é recém-gerado por AUTOINCREMENT, qualquer linha
        // pré-existente em ecosystems/riders com esse id é resíduo de write parcial.
        db.prepare("DELETE FROM ecosystems WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM riders WHERE user_id = ?").run(userId);

        if (type === "rider") {
          insertRider.run(userId, fullName || username, null, location || null);
          if (bloodType) {
            db.prepare("UPDATE riders SET blood_type = ? WHERE user_id = ?").run(bloodType, userId);
          }
        } else {
          insertEco.run(userId, businessName || 'Unknown Business', location || null, businessType || null, bio || null, null, null, userId);
        }

        if (isAmbassadorInvite) {
          db.prepare("UPDATE invite_links SET is_used = 1, used_by_user_id = ? WHERE code = ?").run(userId, referralCode);
        }
      }

      // Defesa contra gravação parcial do libsql remoto (Turso): confirmar que a
      // linha em `users` realmente persistiu ANTES de espelhar no Firestore. Sem
      // isso, uma falha parcial cria um usuário só no Firestore — invisível na tela
      // Admin (que lê só o Turso). Foi o que ocorreu com o user 69 / cafe777.app.
      const persisted = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
      if (!persisted) {
        // users não persistiu mas ecosystems/riders podem ter persistido (write
        // parcial). Remove o resíduo antes de abortar para não deixar um órfão
        // que trave o próximo cadastro com a mesma colisão de PK.
        try {
          db.prepare("DELETE FROM ecosystems WHERE user_id = ?").run(userId);
          db.prepare("DELETE FROM riders WHERE user_id = ?").run(userId);
        } catch {}
        throw new Error("Falha ao gravar o usuário no Turso; cadastro abortado para não divergir do Firestore. Tente novamente.");
      }
      if (type !== "rider") {
        // Garante a linha em `ecosystems` (idempotente) — evita órfão/ausência no Turso.
        const ecoRow = db.prepare("SELECT user_id FROM ecosystems WHERE user_id = ?").get(userId);
        if (!ecoRow) {
          insertEco.run(userId, businessName || 'Unknown Business', location || null, businessType || null, bio || null, null, null, userId);
        }
      }

      const userDoc = {
        id: userId,
        username,
        email,
        password: hashedPassword,
        type,
        profile_picture_url: `https://picsum.photos/seed/${username}/200/200`,
        role: "user",
        status: initialStatus,
        referral_code: newReferralCode,
        referred_by: db.prepare("SELECT referred_by FROM users WHERE id = ?").get(userId)?.referred_by || null,
        plan: 'freemium',
        reputation: 0,
        fullName: fullName || null,
        location: location || null,
        bio: bio || null,
        motorcycle: motorcycle || null,
        businessName: businessName || null,
        businessType: businessType || null,
        interests: Array.isArray(interests) ? interests : [],
        services: Array.isArray(services) ? services : [],
        created_at: new Date().toISOString()
      };
      await collections.users.doc(userId.toString()).set(userDoc);
      
      const isAmbassadorInvite = db.prepare("SELECT 1 FROM invite_links WHERE used_by_user_id = ?").get(userId);
      if (isAmbassadorInvite && referralCode) {
        const inviteQuery = await collections.invite_links.where("code", "==", referralCode).get();
        if (!inviteQuery.empty) {
          await collections.invite_links.doc(inviteQuery.docs[0].id).update({
            is_used: 1,
            used_by_user_id: userId
          });
        }
      }

      if (userDoc.referred_by) {
        updateAmbassadorReputation(userDoc.referred_by).catch(e => console.error(e));
      }

      res.json({ success: true, username, id: userId, token: jwt.sign({ id: userId, username, role: 'user', plan: 'freemium' }, JWT_SECRET, { expiresIn: '24h' }) });
    } catch (error: any) {
      console.error("Register error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/user/onboarding", authenticateToken, async (req: any, res) => {
    const { type, fullName, location, bio, motorcycle, businessName, businessType, interests, services, referralCode } = req.body;
    const userId = (req as any).user.id;

    const interestsStr = Array.isArray(interests) ? interests.join(',') : interests;
    const servicesStr = Array.isArray(services) ? services.join(',') : services;

    try {
      // Writes diretas em auto-commit — NÃO usar db.transaction. Em Turso remote mode
      // (Hrana) o BEGIN abre uma transação interativa e o primeiro write (o UPDATE users)
      // fica preso num stream que nunca commita, fazendo a atualização do onboarding
      // "sumir" silenciosamente (mesmo problema já corrigido no /api/register). Cada
      // statement abaixo auto-commita individualmente e persiste de imediato.
      {
        let referredBy = null;
        let isAmbassadorInvite = false;
        if (referralCode) {
          const referrer = db.prepare("SELECT id FROM users WHERE referral_code = ?").get(referralCode) as any;
          if (referrer) {
            referredBy = referrer.id;
          } else {
            const inviteLink = db.prepare("SELECT * FROM invite_links WHERE code = ? AND is_used = 0").get(referralCode) as any;
            if (inviteLink) {
              referredBy = inviteLink.sponsor_id;
              isAmbassadorInvite = true;
            }
          }
        }

        // Update user type and status based on type
        const newStatus = type === 'rider' ? 'active' : 'pending';
        db.prepare(`
          UPDATE users
          SET type = ?,
              status = ?,
              onboarding_complete = 1,
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
          // Drop any stray ecosystem identity (e.g. the user switched type mid-onboarding).
          db.prepare("DELETE FROM ecosystems WHERE user_id = ?").run(userId);
          // Check if rider record exists, if not create it, else update
          const rider = db.prepare("SELECT * FROM riders WHERE user_id = ?").get(userId);
          if (rider) {
            db.prepare("UPDATE riders SET name = ?, city = ? WHERE user_id = ?").run(fullName || null, location || null, userId);
          } else {
            insertRider.run(userId, fullName || null, null, location || null);
          }
          console.log(`Rider updated with motorcycle: ${motorcycle}, interests: ${interests}`);
        } else {
          // Drop the placeholder rider identity left by Google auth / an earlier flow, so a
          // business account is never left with a stray rider row.
          db.prepare("DELETE FROM riders WHERE user_id = ?").run(userId);
          // Check if eco record exists, if not create it, else update
          const eco = db.prepare("SELECT * FROM ecosystems WHERE user_id = ?").get(userId);
          if (eco) {
            db.prepare("UPDATE ecosystems SET company_name = ?, full_address = ?, service_category = ?, details = ? WHERE user_id = ?").run(businessName || 'Unknown Business', location || null, businessType || null, bio || null, userId);
          } else {
            insertEco.run(userId, businessName || 'Unknown Business', location || null, businessType || null, bio || null, null, null, userId);
          }
          console.log(`Ecosystem updated with services: ${services}`);
        }
        
        if (isAmbassadorInvite) {
          db.prepare("UPDATE invite_links SET is_used = 1, used_by_user_id = ? WHERE code = ?").run(userId, referralCode);
        }
      }

      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;

      // Espelha no Firestore. O register grava as duas fontes; o onboarding, até
      // aqui, gravava só o Turso — o que deixava Firestore desatualizado (tipo/status
      // de ecosystem, perfil) e divergente. merge:true para não apagar outros campos.
      try {
        await collections.users.doc(userId.toString()).set({
          type: user.type,
          status: user.status,
          fullName: user.fullName ?? null,
          location: user.location ?? null,
          bio: user.bio ?? null,
          motorcycle: user.motorcycle ?? null,
          businessName: user.businessName ?? null,
          businessType: user.businessType ?? null,
          interests: user.interests ? user.interests.split(',') : [],
          services: user.services ? user.services.split(',') : [],
          username: user.username,
        }, { merge: true });
      } catch (e: any) {
        if (!isPermissionDeniedErr(e)) console.warn("onboarding Firestore mirror failed:", e.message);
      }

      if (user.referred_by) {
        updateAmbassadorReputation(user.referred_by).catch(e => console.error("Could not update reputation", e));
      }

      res.json({ success: true, username: user.username, type: user.type });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/user", authenticateToken, async (req: any, res) => {
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
        db.prepare("DELETE FROM followers WHERE follower_id = ? OR user_id = ?").run(userId, userId);
        db.prepare("DELETE FROM post_likes WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM post_comments WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM comments WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM user_pinned_posts WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM motorcycles WHERE rider_id = ?").run(userId);
        db.prepare("DELETE FROM events WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM submissions WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM votes WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM user_reports WHERE reporter_id = ? OR reported_id = ?").run(userId, userId);
        db.prepare("DELETE FROM riders WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM ecosystems WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM ambassadors WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM club_memberships WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM posts WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM users WHERE id = ?").run(userId);
      })();

      // Also purge Firestore — otherwise login / authenticateToken re-hydrate the
      // Turso row from the durable mirror and the account stays active.
      await deleteUserFromFirestore(userId);

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

  app.delete("/api/admin/users/:id", authenticateToken, checkAdmin, async (req: any, res) => {
    const id = req.params.id;
    try {
      // Same child cleanup as the self-serve delete (DELETE /api/user) so an admin
      // delete doesn't leave orphan rows behind.
      db.transaction(() => {
        db.prepare("DELETE FROM messages WHERE sender_id = ?").run(id);
        db.prepare("DELETE FROM chat_participants WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM notifications WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM event_rsvps WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM user_badges WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM user_passport_stamps WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM user_route_progress WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM reviews WHERE reviewer_user_id = ?").run(id);
        db.prepare("DELETE FROM recommendations WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM followers WHERE follower_id = ? OR user_id = ?").run(id, id);
        db.prepare("DELETE FROM post_likes WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM post_comments WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM comments WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM user_pinned_posts WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM motorcycles WHERE rider_id = ?").run(id);
        db.prepare("DELETE FROM events WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM submissions WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM votes WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM user_reports WHERE reporter_id = ? OR reported_id = ?").run(id, id);
        db.prepare("DELETE FROM riders WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM ecosystems WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM ambassadors WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM club_memberships WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM posts WHERE user_id = ?").run(id);
        db.prepare("DELETE FROM users WHERE id = ?").run(id);
      })();

      // Purge Firestore too, or the next login resurrects the Turso row.
      await deleteUserFromFirestore(id);

      logAdminAction(req.user.id, "DELETE_USER", "user", id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/settings", (req, res) => {
    try {
      const settings = db.prepare("SELECT * FROM settings").all() as any[];
      const settingsMap = settings.reduce((acc: any, curr: any) => {
        acc[curr.KEY ?? curr.key] = curr.value === 'true' ? true : curr.value === 'false' ? false : curr.value;
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
      const settingsMap = settings.reduce((acc: any, curr: any) => {
        let val = curr.value;
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(Number(val)) && val !== '') val = Number(val);

        acc[curr.KEY ?? curr.key] = val;
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
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  if (process.env.NODE_ENV !== "production") {
    console.log("Loading Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite middleware loaded");
  } else {
    console.log("Loading production static server...");
    const distPath = __dirname;
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    fs.appendFileSync('server_reboots.log', `[${new Date().toISOString()}] Server listening on ${PORT}\n`);
  });
}

startServer();
