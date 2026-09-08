# Permission-first Video Webpage — Full Setup Guide

A static website that requests browser permissions (camera, microphone, location),
records a short clip, uploads it to Supabase, then plays a bundled video.
Deployable to [Netlify](https://netlify.com) with no backend server required.

---

## How it works

```
USER OPENS LINK
      ↓
PERMISSION SCREEN
      ↓ (user clicks Allow Access)
Browser dialog: Camera + Microphone
      ↓ (retry on denial)
Browser dialog: Location
      ↓ (retry on denial)
PROCESSING SCREEN
      ↓  📹  ~5 s recording  (camera + mic)
      ↓  📍  location captured simultaneously
      ↓  ⬆️  upload to Supabase Storage
      ↓  🗄️  metadata saved to Supabase Database
VIDEO SCREEN  (full-screen video plays)
```

---

## Project structure

```
/
├── index.html          ← HTML + Open Graph meta tags
├── style.css           ← All styles (dark, responsive, animated)
├── script.js           ← CONFIG + permission flow + recording + upload
├── video.mp4           ← YOUR video file (place it here, in the root)
├── supabase-setup.sql  ← Run this in Supabase SQL Editor once
├── netlify.toml        ← Netlify headers, cache, redirect rules
├── .gitignore
└── README.md
```

---

## Quick configuration

All configurable values are in **one place** at the top of [`script.js`](./script.js):

```js
const CONFIG = {
  videoUrl:                "./video.mp4",
  previewImage:            "https://...",      // WhatsApp preview image
  title:                   "My Video",
  description:             "Watch this video.",
  siteUrl:                 "https://YOUR-SITE.netlify.app",
  recordingDurationSeconds: 5,                 // recording length in seconds
  consentVersion:          "v1",               // bump to "v2" if terms change
  supabaseUrl:             "https://xxx.supabase.co",
  supabaseAnonKey:         "eyJ...",           // public anon key (safe to commit)
};
```

After editing `script.js`, also update the matching static values in `index.html`
(the `<title>`, `<meta>` OG/Twitter tags) — WhatsApp crawlers read the raw HTML,
not JavaScript.

---

## Section A — GitHub

### Where to put the video

Place your 3–5 second video file in the **root** of this project folder:

```
web/
├── video.mp4   ← HERE
├── index.html
...
```

The video is referenced as `"./video.mp4"` in `CONFIG.videoUrl`.
It is served directly by Netlify as a static file — no CDN, no external hosting needed.

> **File size:** Netlify's free tier has a 100 MB file size limit per file and
> 100 GB/month bandwidth. A 3–5 second 720p MP4 is typically 2–10 MB, well within limits.

### Committing the video

```bash
git add video.mp4
git commit -m "Add bundled video"
git push
```

---

## Section B — Supabase

### B1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project**.
3. Choose an organization, give the project a name, set a strong database password, and pick a region close to your testers.
4. Wait ~2 minutes for the project to provision.

### B2. Create the database table + RLS policies

1. In your Supabase project, go to **SQL Editor** → **New query**.
2. Paste the entire contents of [`supabase-setup.sql`](./supabase-setup.sql).
3. Click **Run** (or press `Ctrl+Enter`).

This creates:
- The `submissions` table with all required columns.
- An **INSERT-only** RLS policy for anonymous users (so the browser can upload metadata).
- A **SELECT** policy for authenticated users (so you can read data in the Dashboard).

### B3. Create the private Storage bucket

Storage buckets cannot be created via SQL. Do this in the Dashboard:

1. **Storage** → **New bucket**
   - Name: `recordings`
   - Public access: **OFF** (keep the toggle disabled)
   - Click **Create bucket**

2. **Storage** → **Policies** → select the `recordings` bucket → **New policy**

   **Policy A — let anonymous users upload:**
   - Name: `anon_can_upload`
   - Allowed operations: **INSERT**
   - Role: `anon`
   - WITH CHECK expression: `bucket_id = 'recordings'`
   - Save

   **Policy B — let you (authenticated) do everything:**
   - Name: `authenticated_full_access`
   - Allowed operations: **SELECT, INSERT, UPDATE, DELETE**
   - Role: `authenticated`
   - USING expression: `bucket_id = 'recordings'`
   - WITH CHECK expression: `bucket_id = 'recordings'`
   - Save

> **Why no SELECT for anon?** Anonymous visitors cannot download any recording.
> Only you, logged in to the Supabase Dashboard, can access the files.

### B4. Find your credentials

Go to **Project Settings → API**:

| Value | Where to paste it |
|-------|-------------------|
| **Project URL** | `CONFIG.supabaseUrl` in `script.js` |
| **anon / public key** | `CONFIG.supabaseAnonKey` in `script.js` |

> **IMPORTANT:** The `anon` key is a **public** key designed to be exposed in
> client-side code. Supabase explicitly intends this. Security comes from RLS policies.
>
> The `service_role` key is **private** and must NEVER appear in any frontend file,
> `script.js`, `index.html`, or anywhere in the GitHub repository.

### B5. RLS policies explained

| Operation | anon (browser) | authenticated (you) |
|-----------|---------------|---------------------|
| INSERT row into `submissions` | ✅ allowed | ✅ allowed |
| SELECT rows from `submissions` | ❌ blocked | ✅ allowed |
| UPDATE rows | ❌ blocked | ❌ blocked (add policy if needed) |
| DELETE rows | ❌ blocked | ❌ blocked (add policy if needed) |
| Upload to `recordings` bucket | ✅ allowed | ✅ allowed |
| Download from `recordings` bucket | ❌ blocked | ✅ allowed |

---

## Section C — Netlify

### C1. Connect your GitHub repository

1. Push this entire project folder to a GitHub repository.
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**.
3. Select GitHub and authorise Netlify.
4. Select your repository.
5. **Build settings:**
   - Build command: *(leave blank)*
   - Publish directory: `.` (a single dot — the root)
6. Click **Deploy site**.

> Alternatively: **drag and drop** the entire project folder onto
> [app.netlify.com/drop](https://app.netlify.com/drop) for an instant deploy
> (no GitHub required, but you won't get automatic re-deploys on push).

### C2. Environment variables — none required!

Because this project uses the Supabase **public anon key** (which is safe to
include directly in `script.js`), you do **not** need to configure any environment
variables in Netlify.

Simply fill in `CONFIG.supabaseUrl` and `CONFIG.supabaseAnonKey` in `script.js`,
commit the change, and push. Netlify will redeploy automatically.

> If you later add a Netlify Function that uses the Supabase **service-role key**,
> add it as a Netlify environment variable at:
> **Site settings → Environment variables → Add a variable**
> Variable name: `SUPABASE_SERVICE_ROLE_KEY`
> Never commit this value to the repository.

### C3. After deploying

1. Netlify gives you a URL like `https://amazing-name-abc123.netlify.app`.
2. Update `CONFIG.siteUrl` in `script.js` with that URL.
3. Update `<meta property="og:url">` in `index.html` with the same URL.
4. Commit and push → Netlify redeploys automatically.

### C4. Custom domain (optional)

**Site settings → Domain management → Add custom domain.**
Netlify provisions a free Let's Encrypt HTTPS certificate automatically.

> Camera, microphone, and geolocation APIs **require HTTPS**. They will not work
> on plain HTTP. Netlify's default `.netlify.app` domain is always HTTPS.

---

## Section D — Testing

### D1. Test permissions locally

Open `index.html` directly from the filesystem via a local HTTPS dev server.
Camera/microphone/geolocation require HTTPS even locally.

```bash
# Option 1: Python (if you have it)
python -m http.server 8080
# Then visit http://localhost:8080 — note: geolocation may still require HTTPS

# Option 2: VS Code Live Server extension (easiest)
# Install "Live Server" → right-click index.html → Open with Live Server

# Option 3: Netlify CLI (serves with HTTPS)
npx netlify-cli dev
```

### D2. Testing checklist

| Test | Expected result |
|------|----------------|
| Open page | Permission screen visible. No video playing. |
| Deny camera/mic | Error message. "Try Again" button appears. |
| Click "Try Again" after denial | Browser prompts again |
| Grant camera/mic, deny location | Error message. "Try Again" button. |
| Click "Try Again" after location denial | Browser prompts for location again |
| Grant all permissions | Processing screen appears |
| Processing screen | Shows "Preparing… → Recording… (countdown) → Uploading…" |
| After upload | "Done ✓" flash, then full-screen video plays |
| Supabase Storage | File appears at `recordings/{uuid}/capture.webm` |
| Supabase Database | Row in `submissions` with correct lat/lon |
| Kill network during upload | Error message + "Try Again" retry button |
| Click video retry | Browser re-prompts same dialog |
| Double-click "Allow Access" fast | Only one submission created (isProcessing lock) |
| Open on iPhone Safari | All permissions work, video plays |
| Open on Android Chrome | All permissions work, video plays |

### D3. Verifying a recording was saved

In your Supabase Dashboard:

- **Table Editor** → `submissions` → you see a new row
- **Storage** → `recordings` → `{uuid}/` folder → `capture.webm` file

---

## Section E — Accessing your data

### Viewing submissions (location + metadata)

1. [supabase.com](https://supabase.com) → your project
2. **Table Editor** → `submissions`
3. All rows are visible here. You can filter, sort, and export as CSV.

Or use the SQL Editor:
```sql
SELECT id, created_at, latitude, longitude, recording_path, status
FROM submissions
ORDER BY created_at DESC;
```

### Downloading a recording

1. **Storage** → `recordings`
2. Navigate to a submission folder (named by UUID)
3. Click the file → **Download**

Or via the API (authenticated):
```js
const { data } = await supabase
  .storage
  .from("recordings")
  .createSignedUrl("recordings/{uuid}/capture.webm", 3600); // 1-hour signed URL
// data.signedUrl — share this temporarily
```

### Keeping the bucket private

The bucket is **Private** by default after following Section B3.

- There is no public URL for any recording.
- Anonymous visitors cannot read, list, or delete recordings.
- Only authenticated users (you, logged into Supabase) can access files.
- Do not click "Make public" in the bucket settings.

---

## Architecture summary

```
BROWSER (Netlify static site)
  │
  ├─ getUserMedia()              → camera + mic (browser API, user approves)
  ├─ geolocation.getCurrentPosition()  → location (browser API, user approves)
  ├─ MediaRecorder               → records ~5 s Blob in memory
  │
  └─ Supabase JS client (anon key)
       ├─ storage.upload()       → Blob → supabase.co Storage (private bucket)
       └─ from("submissions").insert()  → metadata row in DB
```

No backend server. No Netlify Functions. No proxying.
The Supabase anon key + RLS policies are the security boundary.

---

## Privacy

- Recordings are **not** continuous. MediaRecorder stops after the configured duration.
- All media tracks are **stopped immediately** after recording ends.
- Location is captured **once** and never polled again.
- No data is stored in the browser (no cookies, no localStorage).
- No analytics, no fingerprinting, no third-party tracking scripts.
- Recordings are stored in a **private** Supabase Storage bucket.
- Only you (authenticated) can access the recordings.

---

## Changing the recording duration

In `script.js`, change:

```js
recordingDurationSeconds: 5,  // ← change to any number of seconds
```

---

## Changing the consent version

When your consent terms change, increment the version so you know which
submissions were made under which version of your terms:

```js
consentVersion: "v2",   // was "v1"
```

Each submitted row in the database records the `consent_version` at the time
of submission.
