# Aardvark Pet Grooming Systems — website + groomer app

*Better care. Smarter grooming.*

This repo holds two things:

| Path | What it is |
|---|---|
| `/` (`index.html`, `site.css`, `site.js`) | Marketing website: hero, platform features, Academy, waitlist, and a **QR code** that installs the app |
| `/app/` | The Aardvark groomer app — an installable web app (PWA) for iPhone, Android and desktop |

No build step and no frameworks: plain HTML, CSS and JavaScript, so the site runs from any static host.

## The app (`/app/`)

- **Today:** the day's schedule with status (Confirmed → On the way → In progress → Done). On wide screens it becomes the dashboard: schedule, route map, business performance and the next pet's record.
- **Route:** van dispatch map with numbered stops and drive times. *Start navigation* opens Google Maps with every remaining stop in order.
- **Appointment:** call the owner, text "on my way", navigate, and step through the groom. Finishing a groom sets the rebook date from the pet's cadence.
- **Clients:** searchable pet and owner records, with next-due and overdue dates.
- **Academy:** the 10-week program, with course progress and module checklists.
- **Business:** bookings, revenue trend, average ticket, rebook rate.

**Two modes, picked automatically:**
- **Demo mode** is used when `config.js` is empty, or when the address ends with `?demo=1`. The app runs on the sample data in `app/data.js`, and changes are saved on that device only. The previews on the website always use demo mode.
- **Live mode** is used once `config.js` has your Supabase details. Staff sign in, and everything reads from and saves to the Supabase database: schedule, statuses, clients, Academy progress and the website waitlist.

**👉 To connect the database and go live, follow [SETUP.md](SETUP.md).**

### Installing on a phone
The QR code on the website always points at `<this site>/app/`, so it keeps working when the domain changes.
- **iPhone:** open in Safari → Share → *Add to Home Screen*
- **Android:** open in Chrome → *Install app*

The app works offline after the first visit; the service worker is in `app/sw.js`. **When you change app files, bump `VERSION` in `app/sw.js`** so installed phones pick up the update.

## Run locally
```bash
python3 -m http.server 8000
# open http://localhost:8000  (site)  and  http://localhost:8000/app/  (app)
```

## Project layout
```
config.js            ← Supabase URL + publishable key (the only settings file)
index.html site.*    ← marketing website (+ waitlist form → Supabase)
app/                 ← installable app: api.js (data layer), app.js (screens), sw.js (offline)
supabase/schema.sql  ← tables, security rules, automatic rebooking
supabase/seed.sql    ← sample data
_headers             ← caching rules for Cloudflare Pages / Netlify
```

## Hosting
GitHub Pages hosts the site for now (`.github/workflows/pages.yml` deploys every push to `main`). Moving to Cloudflare Pages at go-live needs no code changes; see [SETUP.md](SETUP.md#3-go-live-move-hosting-to-cloudflare-pages).

## Next steps
- Screens for adding clients, pets and appointments (for now, add these in Supabase's Table Editor)
- Online booking for pet owners
- Academy video hosting: put a link in `course_modules.video_url`
- Native App Store / Google Play builds, if wanted later. Wrapping this app with Capacitor reuses the same code.

## Third-party code
- `vendor/leaflet/`: Leaflet 1.9.4 (BSD-2-Clause). Map data © OpenStreetMap contributors.
- `vendor/qrcode.js`: qrcode-generator 1.4.4 by Kazuhiko Arase (MIT)
- `vendor/supabase/`: supabase-js 2.119.0 (MIT)
