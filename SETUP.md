# Aardvark setup guide

Three parts, in this order. Part 1 takes about 15 minutes; Part 3 is only for go-live.

1. [Connect Supabase (database + staff logins)](#1-connect-supabase)
2. [Point aardvarkgroom.com at the site](#2-point-aardvarkgroomcom-at-the-site)
3. [Move hosting to Cloudflare Pages when you go live](#3-go-live-move-hosting-to-cloudflare-pages)
4. [Turn on emails, texts and reminders](#4-turn-on-emails-texts-and-reminders)
5. [Go-live checklist](#5-go-live-checklist)

How the pieces fit:

```
 Phone / browser ──► Website + app files (GitHub Pages now, Cloudflare Pages later)
        │                 └─ config.js  ← the only file that knows about Supabase
        └──────────────► Supabase (Postgres database, staff logins, waitlist)
```

The website and app are plain files with no build step and no server code. Every link is relative, and all backend settings live in `config.js`. So the files move to any static host unchanged, and the database never moves.

---

## 1. Connect Supabase

### 1a. Create the project
On **supabase.com → New project**, fill in:

| Field | Value |
|---|---|
| Organization | Aardvark (Free) |
| GitHub (optional) | **Leave blank.** It's only for auto-applying database changes from the repo, which we don't use yet. |
| Project name | `aardvark` |
| Database password | Click **Generate a password** and save it in your password manager |
| Region | **Americas**. If you open "Need a specific region?", pick **East US (North Virginia)** |
| Enable Data API | ✅ on (the app needs it) |
| Automatically expose new tables | ⬜ **off**. Safer; `schema.sql` grants access table by table |
| Enable automatic RLS | ✅ on |
| Advanced configuration | leave as is |

Plan: **Free** while you build. Free projects pause after 7 days without use; click **Restore** in the dashboard if that happens. Switch to **Pro** before real customers rely on the app.

### 1b. Create the tables
1. In the project, go to **SQL Editor → New query**.
2. Paste in all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It should end with "Success. No rows returned."
   **Whenever `schema.sql` is updated in the repo, run it again the same way.** It's safe to re-run, and it keeps your data.
3. Open a new query, paste [`supabase/seed.sql`](supabase/seed.sql) and click **Run**. This loads the sample van, 7 sample pets, today's route, 8 weeks of history and the Academy courses.
   *Skip this step if you want to start with an empty database. You'll still need at least one row in the `vans` table.*

### 1c. Sign-ups and your team
Staff create their own accounts in the app, and an owner approves them. New accounts start **inactive** and can't see any data until approved.

1. Go to **Authentication → Sign In / Providers**. Turn **on** "Allow new users to sign up", and keep **Confirm email** on.
2. **First owner only:** create your own account, either in the app (**Create a staff account**) or in **Authentication → Users → Add user** with **Auto Confirm User** ticked. Then switch yourself on in **SQL Editor**:
   ```sql
   update public.staff s set active = true, role = 'owner'
   from auth.users u
   where u.id = s.id and lower(trim(u.email)) = lower(trim('you@example.com'));
   ```
   ("Success. No rows returned" is normal for an update.)
3. **Everyone after that:** they tap **Create a staff account** in the app and confirm their email. You approve them in the app under **Business → Team** and choose their role (Owner, Groomer or Academy student). You can switch people off or change roles there too. The database always keeps at least one active owner.

> Supabase's built-in email sender only allows a few emails per hour. That's fine for a small team. If confirmation or reset emails stop arriving, wait an hour, or set up your own email sender under **Authentication → Emails → SMTP Settings**.

### 1d. Allow sign-in links from your web addresses
Go to **Authentication → URL Configuration**:
- **Site URL:** `https://aardvarkgroom.com/app/` (use `https://alanaoldham-eng.github.io/Aardvark/app/` until the domain is connected)
- **Redirect URLs**: add all of these:
  - `https://alanaoldham-eng.github.io/Aardvark/app/`
  - `https://aardvarkgroom.com/app/`
  - `https://www.aardvarkgroom.com/app/`
  - `http://localhost:8000/app/` (for testing on a computer)

### 1e. Put the keys in `config.js`
1. Go to **Project Settings → API Keys** (or click **Connect** at the top).
2. Copy the **Project URL** and the **Publishable key** (`sb_publishable_…`). On older projects it's the **anon public** key.
3. On GitHub, open [`config.js`](config.js), click the pencil icon, and fill in both values:
   ```js
   supabaseUrl: "https://YOURPROJECT.supabase.co",
   supabaseKey: "sb_publishable_xxxxxxxxxxxxxxxx",
   ```
4. Click **Commit changes**. GitHub Pages redeploys in under a minute.

> ✅ The publishable key is designed to be public. Your data is protected by the database's Row Level Security rules in `schema.sql`: the public can only add themselves to the waitlist, and only active staff see clients and schedules.
> ⛔ **Never** put the `secret` / `service_role` key in `config.js` or anywhere in this repo.

### 1f. Check it works
- Open the app and sign in with your email and temporary password. You should see the sample route.
- Forgot a password? Tap **Forgot password?** on the sign-in screen and open the email link in the same browser.
- Submit the website's waitlist form, then check **Table Editor → waitlist**.
- To preview the app with built-in sample data at any time, add `?demo=1` to the app address.

### 1g. Turn on online booking
1. In **SQL Editor**, run the latest [`supabase/schema.sql`](supabase/schema.sql), then [`supabase/seed.sql`](supabase/seed.sql). Both are safe to re-run. This adds the service menu, Van 1's hours (Mon–Fri 8–5), and the booking rules.
2. **Authentication → Sign In / Providers:** keep **Confirm email** **on**. Customers' accounts are linked to their earlier guest bookings by email, so the email must be verified.
3. **Set prices:** in **Table Editor → services**, edit `price`, `duration_min` and `description`. The ones loaded are placeholders based on the strategic plan. Set `active` to false to hide a service.
4. **Set hours:** in the app, go to **Business → Availability**. There you can set each day's hours, add time off (vacations, van service) and adjust the booking rules: setup time between stops, max stops per day, service radius, trip fee and so on.
5. **Try it:** open https://aardvarkgroom.com/app/ on your phone while signed out and make a test booking. It appears on the staff **Today** screen for that day, marked **Online**.

**How times are checked:** every address becomes GPS coordinates (customers can type it, use their phone's location, or drag the pin). A start time is only offered if the van is working, it isn't time off, the day isn't full, and there's enough time to drive from the previous stop and on to the next one. Drive time is the GPS distance × the road factor ÷ average speed, plus setup time. The database checks again at the moment of booking, so two people can't take the same slot. On the staff **Route** screen, real road directions show each drive and flag any **tight** gap.

**Location services:** address search uses Photon and road routes use OSRM. Both are free OpenStreetMap services with fair-use limits, which is fine while you're small. When volume grows, switch to a paid provider (Mapbox or Google) by editing `app/geo.js` only.

### Removing the sample data later
```sql
delete from public.clients where notes = 'sample';   -- also removes their pets and appointments
```

---

## 2. Point aardvarkgroom.com at the site

While hosting on GitHub Pages:

1. **GitHub → repo Settings → Pages → Custom domain:** enter `aardvarkgroom.com` and click Save. Do this first.
2. **Porkbun → aardvarkgroom.com → DNS:** delete the default parking records (ALIAS/CNAME to `pixie.porkbun.com`), then add:

   | Type | Host | Answer |
   |---|---|---|
   | A | *(blank)* | 185.199.108.153 |
   | A | *(blank)* | 185.199.109.153 |
   | A | *(blank)* | 185.199.110.153 |
   | A | *(blank)* | 185.199.111.153 |
   | CNAME | www | alanaoldham-eng.github.io |

3. When GitHub shows the DNS check as green (usually under an hour), tick **Enforce HTTPS**.

---

## 3. Go live: move hosting to Cloudflare Pages

GitHub Pages isn't allowed as free hosting for a business or commercial software. Cloudflare Pages' free plan allows commercial use and doesn't cap bandwidth for static sites, and this site needs no build step.

1. Sign up at **dash.cloudflare.com** (free).
2. Go to **Workers & Pages → Create → Pages → Connect to Git**, then pick `alanaoldham-eng/Aardvark`.
3. Build settings: **Framework preset: None**, **Build command:** *(leave empty)*, **Build output directory:** `/`.
4. Deploy. You get a `*.pages.dev` address; test the site and the app there.
5. **Custom domains → Set up a domain:** add `aardvarkgroom.com` and `www.aardvarkgroom.com`, and follow Cloudflare's DNS instructions. Cloudflare will either give you records to add at Porkbun, or offer to manage DNS if you move the nameservers. Moving nameservers is optional; it's free and makes future changes easier.
6. In GitHub → Settings → Pages, **remove** the custom domain, then set Source to **None** to stop the GitHub copy. You can also delete `.github/workflows/pages.yml`.
7. In Supabase → Authentication → URL Configuration, keep the `aardvarkgroom.com` URLs and add the `*.pages.dev` one if you'll use it.

Nothing in the code changes. The `_headers` file in this repo is picked up by Cloudflare Pages (and Netlify) so updates to the app reach phones right away.

**When you outgrow free:**
- Supabase Pro: $25/month. No pausing, daily backups, 8 GB database.
- Cloudflare Pages: stays free for this kind of site.
- Porkbun domain: about $12/year.


---

## 4. Turn on emails, texts and reminders

Until this is set up, every booking change is still recorded (owners can see it under **Business → Recent notifications**, marked "queued"), but nothing is sent. Bookings never fail because of email.

**What gets sent once it's on:**
| When | Customer gets | Staff with "Booking alerts" on get |
|---|---|---|
| Customer books online | Confirmation email (+ text if they ticked "Text me") | Email (+ text to `STAFF_ALERT_PHONES`) |
| Customer cancels | Cancellation email/text | Email/text |
| Staff books, reschedules or cancels | Email/text, if "Let the customer know" was ticked | — |
| 4 PM the day before | Reminder email/text | — |

### 4a. Email sender: Resend (free tier)
1. Sign up at **resend.com** → **Domains → Add domain** → `aardvarkgroom.com`.
2. Resend shows a few DNS records (TXT and MX, usually on a `send` subdomain, plus a DKIM TXT). Add each one at **Porkbun → aardvarkgroom.com → DNS** exactly as shown. They don't affect the website or the existing records.
3. Back in Resend, click **Verify**. It can take a few minutes to an hour.
4. **API Keys → Create API key** (Sending access). Copy it; you'll paste it twice below.

### 4b. Send Supabase's own emails through Resend
Supabase's built-in sender only allows a few emails per hour.
1. **Supabase → Authentication → Emails → SMTP Settings** → enable custom SMTP:
   - Host `smtp.resend.com` · Port `465` · Username `resend` · Password = your Resend API key
   - Sender email `hello@aardvarkgroom.com` · Sender name `Aardvark Pet Grooming`
2. **Authentication → Emails → Templates:** for **Confirm signup**, **Reset password** and **Magic link**, paste the matching file from [`supabase/email-templates/`](supabase/email-templates/) so they carry your logo.

### 4c. Deploy the notification sender
1. **Supabase → Edge Functions → Deploy a new function → Via Editor**. Name it exactly `notify`.
2. Replace the sample code with all of [`supabase/functions/notify/index.ts`](supabase/functions/notify/index.ts) and click **Deploy**.
3. In the function's settings, **turn off JWT verification** ("Verify JWT"). The function checks its own secret instead.
4. **Edge Functions → Secrets** (Manage secrets) → add:
   - `NOTIFY_SECRET`: make up a long random password (e.g. from your password manager). You'll use it again in 4d.
   - `RESEND_API_KEY`: your Resend key
   - `NOTIFY_FROM`: `Aardvark Pet Grooming <hello@aardvarkgroom.com>`
   - `NOTIFY_REPLY_TO`: the inbox where customer replies should go (e.g. your Gmail)

### 4d. Connect the database to the sender
1. **Database → Extensions:** enable **pg_net** and **pg_cron**.
2. **SQL Editor**: run this with your project URL and the same `NOTIFY_SECRET`:
   ```sql
   select vault.create_secret('https://YOURPROJECT.supabase.co/functions/v1/notify', 'aardvark_notify_url');
   select vault.create_secret('PASTE-THE-SAME-NOTIFY_SECRET', 'aardvark_notify_secret');

   -- Day-before reminders at 4 PM Central (22:00 UTC; 5 PM during daylight saving)
   select cron.schedule('aardvark-reminders', '0 22 * * *', $$select public.queue_reminders()$$);

   -- Every 15 minutes, retry anything that didn't send
   select cron.schedule('aardvark-retry', '*/15 * * * *', $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'aardvark_notify_url'),
       headers := jsonb_build_object('Content-Type', 'application/json',
                  'x-aardvark-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'aardvark_notify_secret')),
       body := '{"sweep": true}'::jsonb)
   $$);
   ```
3. **Test:** make a booking on the app with your own email. Within a minute you should get the confirmation, and **Business → Recent notifications** should say **sent**. If it says **error**, the reason is shown next to it (most often an unverified Resend domain).

### 4e. Text messages (optional, can come later)
Texting US mobiles from a business number requires carrier registration (called **A2P 10DLC**), which takes from a few days to a couple of weeks, so start early.
1. Sign up at **twilio.com**, buy a local (251) number, and complete **A2P 10DLC** registration for your business (brand + "customer care / appointment reminders" campaign).
2. Add Edge Function secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (your Twilio number like `+12515550000`, or a Messaging Service SID starting `MG`).
3. Optional: `STAFF_ALERT_PHONES` = `+12515550111,+12515550122` to text staff about each online booking.

Customers only get texts if they ticked **"Text me appointment updates"** (or staff ticked "Customer agreed to get text updates"). Every text ends with "Reply STOP to opt out"; Twilio handles STOP automatically.

---

## 5. Go-live checklist

**In the app (Business tab, owners):**
- [ ] **Availability → Van base location**: set the real starting address. The service radius and drive times are measured from it.
- [ ] **Availability → Working hours** and **Booking rules** (setup time, max stops per day, radius, trip fee).
- [ ] **Services & prices**: final menu and prices.
- [ ] **Availability → Remove sample data**.
- [ ] **Team**: approve Jared (and Bryan, per your agreement); tick **Booking alerts** for whoever should get them.

**In Supabase:**
- [ ] Re-run the latest `schema.sql` (safe; keeps data).
- [ ] Section 4 above: emails (and texts when ready).
- [ ] **Authentication → Sign In / Providers**: sign-ups on, **Confirm email** on.
- [ ] Upgrade to **Pro** before real customers rely on it (no pausing, daily backups).

**Real-world test (on your phones):**
- [ ] Guest booking at a real Mobile address using "Use my location": check the address, times, confirmation email and the booking on **Today**.
- [ ] Create a customer account, cancel online, rebook in 3 taps.
- [ ] Staff: **+ New booking** for a phone customer, **Reschedule**, **Cancel**, **Block time**.

**Before advertising:**
- [ ] Privacy policy, terms and cancellation policy pages (have a lawyer review). You collect addresses and phone numbers and send texts.
- [ ] Grooming consent/waiver (matted pets, senior pets).
- [ ] Legal opinion on Jared's prior clinic NDA (a launch gate in your Strategic Master Plan).
- [ ] Move hosting to Cloudflare Pages (section 3).
