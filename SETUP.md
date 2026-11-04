# Aardvark setup guide

Three parts, in this order. Part 1 takes about 15 minutes; Part 3 is only for go-live.

1. [Connect Supabase (database + staff logins)](#1-connect-supabase)
2. [Point aardvarkgroom.com at the site](#2-point-aardvarkgroomcom-at-the-site)
3. [Move hosting to Cloudflare Pages when you go live](#3-go-live-move-hosting-to-cloudflare-pages)

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
