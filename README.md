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

All of it runs on **sample data** in `app/data.js`. Statuses and Academy progress are saved in the browser on each device. There is no server yet.

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

## Deploying
`.github/workflows/pages.yml` publishes the repo to GitHub Pages on every push to `main`:
`https://alanaoldham-eng.github.io/Aardvark/`

**Custom domain (aardvarkgroom.com):** in GitHub → Settings → Pages, set the custom domain. Then at Porkbun add these DNS records:
- `A` records for `@` → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
- `CNAME` for `www` → `alanaoldham-eng.github.io`

## Wiring up the waitlist
The waitlist form collects the Phase 0 data: ZIP code, breed, weight and coat condition. To start receiving sign-ups, create a free form endpoint (for example Formspree) and paste its URL into `WAITLIST_ENDPOINT` at the top of `site.js`. Until then the form runs in preview mode and says so.

## Next steps
- A backend for real bookings, clients and logins (Supabase or Firebase are good fits)
- Academy video hosting
- Native App Store / Google Play builds, if wanted later. Wrapping this app with Capacitor reuses the same code.

## Third-party code
- `vendor/leaflet/`: Leaflet 1.9.4 (BSD-2-Clause). Map data © OpenStreetMap contributors.
- `vendor/qrcode.js`: qrcode-generator 1.4.4 by Kazuhiko Arase (MIT)
