/* Aardvark data layer.
   - Demo mode (no Supabase settings in config.js, or ?demo=1, or website previews):
     uses app/data.js and saves changes in this browser only.
   - Live mode: reads and writes the Supabase database defined in supabase/schema.sql.
   Every screen talks to window.Api, so swapping hosts or backends never touches the UI. */
(function () {
  "use strict";
  var cfg = window.AARDVARK_CONFIG || {};
  var params = new URLSearchParams(location.search);
  var forceDemo = params.get("demo") === "1" || params.get("embed") === "1";
  var LIVE = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase && !forceDemo);
  var sb = LIVE ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  var Api = { mode: LIVE ? "live" : "demo", user: null, staff: null, data: null };

  function must(res) { if (res.error) throw res.error; return res.data; }
  var DAY = 864e5;
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function daysBetween(a, b) { return Math.round((startOfDay(a) - startOfDay(b)) / DAY); }
  function hhmm(d) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function pctDelta(cur, prev) { return prev ? Math.round((cur - prev) / prev * 100) : 0; }

  /* ---------------- demo mode ---------------- */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("aardvark:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { if (forceDemo) return; try { localStorage.setItem("aardvark:" + k, JSON.stringify(v)); } catch (e) {} }
  };

  function loadDemo() {
    var src = JSON.parse(JSON.stringify(window.AARDVARK_DATA));
    var statusOf = forceDemo ? {} : store.get("status", {});
    var progress = forceDemo ? {} : store.get("progress", {});
    src.appointments.forEach(function (a) { a.status = statusOf[a.id] || "Confirmed"; });
    src.courses.forEach(function (c) {
      c.modules = c.modules.map(function (m, i) {
        var key = c.id + ":" + i;
        return { id: key, title: m[0], done: key in progress ? progress[key] : m[1] };
      });
    });
    src.pets.forEach(function (p) { p.hasNext = false; });
    return src;
  }

  /* ---------------- live mode ---------------- */
  async function loadLive() {
    var uid = Api.user.id;
    var staff = must(await sb.from("staff").select("*").eq("id", uid).maybeSingle());
    if (!staff) throw new Error("Your account isn't set up as Aardvark staff yet. Ask an owner to add you.");
    if (!staff.active) throw new Error("Your account is waiting for an owner to activate it. Once they do, tap Try again.");
    Api.staff = staff;

    var vq = sb.from("vans").select("*").eq("active", true).order("id").limit(1);
    if (staff.van_id) vq = sb.from("vans").select("*").eq("id", staff.van_id).limit(1);
    var vanRow = (must(await vq))[0];
    if (!vanRow) throw new Error("No vans set up yet. Run supabase/seed.sql or add a van in Supabase.");

    var dayStart = startOfDay(new Date()), dayEnd = new Date(dayStart.getTime() + DAY);
    var results = await Promise.all([
      sb.from("appointments").select("*").eq("van_id", vanRow.id)
        .gte("starts_at", dayStart.toISOString()).lt("starts_at", dayEnd.toISOString())
        .neq("status", "Cancelled").order("starts_at"),
      sb.from("pet_overview").select("*").order("name").limit(2000),
      sb.from("weekly_stats").select("*").eq("van_id", vanRow.id).order("week_start", { ascending: false }).limit(9),
      sb.from("courses").select("*, course_modules(*)").order("sort"),
      sb.from("module_progress").select("module_id, done").eq("staff_id", uid)
    ]);
    var appts = must(results[0]), pets = must(results[1]), weeks = must(results[2]).reverse(),
        courses = must(results[3]), prog = must(results[4]);
    var now = new Date(), year = now.getFullYear();

    var D = {
      van: { id: vanRow.id, name: vanRow.name, zone: vanRow.zone || "",
             depot: { lat: vanRow.depot_lat, lng: vanRow.depot_lng, label: "Depot" } },
      pets: pets.map(function (p) {
        return {
          id: p.id, name: p.name, species: p.species, breed: p.breed || p.species,
          age: p.birth_year ? year - p.birth_year : "?", weight: p.weight_lbs != null ? Number(p.weight_lbs) : "?",
          coat: p.coat || "—", color: p.color, owner: p.owner_name, phone: p.owner_phone || "", area: p.owner_area || "",
          cadenceWeeks: p.cadence_weeks, notes: p.notes || "No notes yet.", tags: p.tags && p.tags.length ? p.tags : null,
          lastGroom: p.last_groom_at ? daysBetween(new Date(p.last_groom_at), now) : null,
          hasNext: !!p.next_appointment_at,
          nextAt: p.next_appointment_at ? new Date(p.next_appointment_at) : null
        };
      }),
      appointments: appts.map(function (a) {
        return { id: a.id, petId: a.pet_id, time: hhmm(new Date(a.starts_at)), service: a.service,
                 price: Number(a.price), mins: a.duration_min, drive: a.drive_min || 0,
                 lat: a.lat, lng: a.lng, status: a.status };
      }),
      courses: courses.map(function (c) {
        var mods = (c.course_modules || []).sort(function (x, y) { return x.sort - y.sort; });
        return { id: c.id, title: c.title, color: c.color, duration: c.duration_label || "",
                 modules: mods.map(function (m) {
                   var p = prog.find(function (r) { return r.module_id === m.id; });
                   return { id: m.id, title: m.title, done: !!(p && p.done), video: m.video_url };
                 }) };
      })
    };
    // Appointments without coordinates can't be mapped; keep them in the list
    D.appointments.forEach(function (a) { a.mappable = a.lat != null && a.lng != null; });

    var cur = weeks[weeks.length - 1], prev = weeks[weeks.length - 2];
    var thisMonday = startOfDay(now); thisMonday.setDate(thisMonday.getDate() - ((thisMonday.getDay() + 6) % 7));
    var curIsThisWeek = cur && daysBetween(new Date(cur.week_start + "T00:00:00"), thisMonday) === 0;
    var thisWeek = curIsThisWeek ? cur : null, lastWeek = curIsThisWeek ? prev : cur;
    var withNext = D.pets.filter(function (p) { return p.hasNext; }).length;
    D.weekly = {
      bookings: thisWeek ? thisWeek.grooms : 0,
      bookingsDelta: pctDelta(thisWeek ? thisWeek.grooms : 0, lastWeek ? lastWeek.grooms : 0),
      revenue: thisWeek ? Number(thisWeek.revenue) : 0,
      revenueDelta: pctDelta(thisWeek ? Number(thisWeek.revenue) : 0, lastWeek ? Number(lastWeek.revenue) : 0),
      rebookRate: D.pets.length ? Math.round(withNext / D.pets.length * 100) : 0,
      trend: weeks.slice(-8).map(function (w) { return Number(w.revenue); })
    };
    if (D.weekly.trend.length < 2) D.weekly.trend = [0, D.weekly.revenue];
    return D;
  }

  /* ---------------- public API ---------------- */
  Api.init = async function () {
    if (!LIVE) return { needsLogin: false };
    var s = (await sb.auth.getSession()).data.session;
    if (location.search.indexOf("code=") > -1) history.replaceState(null, "", location.pathname + location.hash);
    Api.user = s ? s.user : null;
    sb.auth.onAuthStateChange(function (evt, session) {
      Api.user = session ? session.user : null;
      if (evt === "SIGNED_OUT" && Api.onSignedOut) Api.onSignedOut();
    });
    return { needsLogin: !Api.user };
  };

  Api.load = async function () {
    Api.data = LIVE ? await loadLive() : loadDemo();
    return Api.data;
  };

  Api.setStatus = async function (appt, status) {
    if (LIVE) must(await sb.from("appointments").update({ status: status }).eq("id", appt.id));
    else { var m = store.get("status", {}); m[appt.id] = status; store.set("status", m); }
    appt.status = status;
  };

  Api.setModule = async function (mod, done) {
    if (LIVE) must(await sb.from("module_progress").upsert(
      { staff_id: Api.user.id, module_id: mod.id, done: done, updated_at: new Date().toISOString() },
      { onConflict: "staff_id,module_id" }));
    else { var m = store.get("progress", {}); m[mod.id] = done; store.set("progress", m); }
    mod.done = done;
  };

  // Books a 9:00 AM placeholder on the due date; details get confirmed with the client.
  Api.bookNext = async function (pet, date) {
    if (!LIVE) return;
    var d = new Date(date); d.setHours(9, 0, 0, 0);
    must(await sb.from("appointments").insert({
      pet_id: pet.id, van_id: Api.data.van.id, starts_at: d.toISOString(),
      service: "Groom (confirm details)", price: 0, duration_min: 60
    }));
    pet.hasNext = true; pet.nextAt = d;
  };

  Api.signIn = async function (email, password) {
    var r = await sb.auth.signInWithPassword({ email: email, password: password });
    if (r.error) throw r.error;
    Api.user = r.data.user;
  };

  Api.sendLink = async function (email) {
    var r = await sb.auth.signInWithOtp({ email: email, options: {
      shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
    if (r.error) throw r.error;
  };

  Api.signOut = async function () { if (LIVE) await sb.auth.signOut(); Api.user = null; };

  window.Api = Api;
})();
