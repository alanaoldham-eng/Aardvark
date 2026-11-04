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

  var Api = { mode: LIVE ? "live" : "demo", user: null, staff: null, client: null, kind: null, data: null };

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
  async function loadCustomer(client) {
    var res = await Promise.all([
      sb.from("pets").select("*").eq("client_id", client.id).order("created_at"),
      sb.from("appointments").select("*, pets(name, species)").order("starts_at", { ascending: false }).limit(200)
    ]);
    var pets = must(res[0]), appts = must(res[1]);
    var groups = {};
    appts.forEach(function (a) {
      var key = a.booking_id || (a.starts_at.slice(0, 10) + ":" + (a.address || ""));
      var g = groups[key] || (groups[key] = { id: a.booking_id, online: !!a.booking_id, items: [], start: null, end: null, total: 0, address: a.address, status: a.status });
      var st = new Date(a.starts_at), en = new Date(st.getTime() + a.duration_min * 60000);
      g.items.push({ pet: a.pets ? a.pets.name : "Pet", service: a.service, price: Number(a.price), status: a.status });
      if (!g.start || st < g.start) g.start = st;
      if (!g.end || en > g.end) g.end = en;
      if (a.status !== "Cancelled") g.total += Number(a.price);
      if (a.status !== "Cancelled") g.status = a.status;
    });
    var bookings = Object.keys(groups).map(function (k) { return groups[k]; })
      .sort(function (x, y) { return x.start - y.start; });
    return { client: client, pets: pets, bookings: bookings };
  }

  async function loadLive() {
    var uid = Api.user.id;
    var staff = must(await sb.from("staff").select("*").eq("id", uid).maybeSingle());
    if (!staff) {
      var client = must(await sb.from("clients").select("*").eq("user_id", uid).maybeSingle());
      if (client) { Api.kind = "customer"; Api.client = client; return loadCustomer(client); }
      throw new Error("We couldn't find your account details. Please sign out and sign in again, or contact us.");
    }
    Api.kind = "staff";
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
                 lat: a.lat, lng: a.lng, status: a.status, online: a.source === "online", address: a.address };
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
    var recovery = false;
    sb.auth.onAuthStateChange(function (evt, session) {
      Api.user = session ? session.user : null;
      if (evt === "PASSWORD_RECOVERY") { recovery = true; if (Api.onRecovery) Api.onRecovery(); }
      if (evt === "SIGNED_OUT" && Api.onSignedOut) Api.onSignedOut();
    });
    var s = (await sb.auth.getSession()).data.session;
    await new Promise(function (r) { setTimeout(r, 50); }); // let a recovery event arrive
    if (location.search.indexOf("code=") > -1) history.replaceState(null, "", location.pathname + location.hash);
    Api.user = s ? s.user : null;
    return { needsLogin: !Api.user, recovery: recovery };
  };

  Api.load = async function () {
    if (!LIVE) Api.kind = "staff";
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

  var appUrl = function () { return location.origin + location.pathname; };

  // Self sign-up: the account starts inactive until an owner approves it on the Team screen.
  Api.signUp = async function (name, email, password) {
    var r = await sb.auth.signUp({ email: email, password: password,
      options: { data: { full_name: name, account_type: "staff" }, emailRedirectTo: appUrl() } });
    if (r.error) throw r.error;
    // Supabase hides "already registered" for privacy: no identities means the email is taken
    if (r.data.user && r.data.user.identities && r.data.user.identities.length === 0)
      throw new Error("That email already has an account. Sign in, or use “Forgot password?”.");
    Api.user = r.data.session ? r.data.user : null;
    return { signedIn: !!r.data.session };
  };

  Api.resetPassword = async function (email) {
    var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
    if (r.error) throw r.error;
  };

  Api.updatePassword = async function (password) {
    var r = await sb.auth.updateUser({ password: password });
    if (r.error) throw r.error;
  };

  // Owners only (enforced by the database, not just the screen)
  Api.listTeam = async function () {
    return must(await sb.from("staff").select("id, full_name, email, role, active, created_at").order("created_at"));
  };
  Api.updateStaff = async function (id, patch) {
    var rows = must(await sb.from("staff").update(patch).eq("id", id).select("id"));
    if (!rows || !rows.length) throw new Error("Only owners can change the team.");
  };

  /* ---------------- online booking ---------------- */
  var cache = {};
  var DEMO_SETTINGS = { timezone: "America/Chicago", slot_step_min: 30, buffer_min: 10, service_radius_miles: 25, lead_time_hours: 18,
                        booking_window_days: 21, max_stops_per_day: 6, trip_fee: 10, extra_pet_discount: 5, min_cancel_hours: 24, avg_speed_mph: 28, road_factor: 1.35 };
  var DEMO_SERVICES = [
    ["dog-small", "Full groom · small dog", "Bath, blow-dry, haircut, nails, ears and sanitary trim. Up to 20 lb.", "Dog", 0, 20, 75, 70],
    ["dog-medium", "Full groom · medium dog", "Bath, blow-dry, haircut, nails, ears and sanitary trim. 21–50 lb.", "Dog", 21, 50, 90, 90],
    ["dog-large", "Full groom · large dog", "Bath, blow-dry, haircut, nails, ears and sanitary trim. 51–80 lb.", "Dog", 51, 80, 105, 110],
    ["dog-xl", "Full groom · XL or doodle", "For 80 lb+ dogs, doodles and heavy coats that need extra time.", "Dog", 81, 300, 120, 140],
    ["bath-small", "Bath & tidy · up to 40 lb", "Bath, blow-dry, brush-out, nails, ears and a face/feet/sanitary tidy. No haircut.", "Dog", 0, 40, 50, 55],
    ["bath-large", "Bath & tidy · 41 lb+", "Bath, blow-dry, brush-out, nails, ears and a face/feet/sanitary tidy. No haircut.", "Dog", 41, 300, 65, 70],
    ["cat-groom", "Cat groom", "Gentle bath, dry, brush-out, nails and sanitary trim.", "Cat", 0, 100, 75, 95],
    ["nails", "Nail trim & file", "Quick nail trim and smoothing, dogs or cats.", "Any", 0, 300, 15, 25],
    ["addon-deshed", "De-shedding treatment", "Loosens and removes undercoat.", "Any", null, null, 15, 15, true],
    ["addon-demat", "Dematting", "Extra time for tangles and mats.", "Any", null, null, 20, 20, true],
    ["addon-teeth", "Teeth brushing", "Enzymatic toothpaste and fresh breath.", "Any", null, null, 5, 10, true],
    ["addon-facial", "Blueberry facial", "Brightening face wash.", "Dog", null, null, 5, 8, true],
    ["addon-pawbalm", "Paw balm", "Soothes and protects paw pads.", "Any", null, null, 5, 8, true]
  ].map(function (r, i) { return { id: r[0], name: r[1], description: r[2], species: r[3], min_weight: r[4], max_weight: r[5], duration_min: r[6], price: r[7], is_addon: !!r[8], sort: i }; });

  Api.live = LIVE;
  Api.settings = async function () {
    if (cache.settings) return cache.settings;
    cache.settings = LIVE ? (must(await sb.from("booking_settings").select("*").eq("id", 1).maybeSingle()) || DEMO_SETTINGS) : DEMO_SETTINGS;
    return cache.settings;
  };
  Api.services = async function () {
    if (cache.services) return cache.services;
    cache.services = LIVE ? must(await sb.from("services").select("*").eq("active", true).order("sort")) : DEMO_SERVICES;
    return cache.services;
  };
  Api.checkArea = async function (lat, lng) {
    if (!LIVE) return { ok: window.Geo.miles({ lat: 30.699, lng: -88.152 }, { lat: lat, lng: lng }) <= 25, miles: +window.Geo.miles({ lat: 30.699, lng: -88.152 }, { lat: lat, lng: lng }).toFixed(1), radius: 25 };
    return must(await sb.rpc("check_service_area", { p_lat: lat, p_lng: lng }));
  };
  Api.slots = async function (lat, lng, minutes) {
    if (!LIVE) {
      var out = [], d = new Date(); d.setHours(0, 0, 0, 0);
      for (var i = 1; i <= 14; i++) { var day = new Date(d.getTime() + i * DAY); if (day.getDay() === 0 || day.getDay() === 6) continue;
        [9, 10, 11, 13, 14, 15].forEach(function (h) { if (h * 60 + minutes <= 17 * 60) { var t = new Date(day); t.setHours(h); out.push(t); } }); }
      return out;
    }
    var rows = must(await sb.rpc("get_available_slots", { p_lat: lat, p_lng: lng, p_dur: minutes }));
    return (rows || []).map(function (r) { return new Date(r.slot || r); });
  };
  Api.book = async function (payload) {
    if (!LIVE) throw new Error("Demo mode — bookings aren't saved. Connect Supabase in config.js to take real bookings.");
    var r = await sb.rpc("book_appointment", { p: payload });
    if (r.error) throw new Error(r.error.message.replace(/^.*?ERROR:\s*/, ""));
    return r.data;
  };
  Api.cancelBooking = async function (id) { must(await sb.rpc("cancel_my_booking", { b: id })); };
  Api.signUpCustomer = async function (name, email, password, phone) {
    var r = await sb.auth.signUp({ email: email, password: password,
      options: { data: { full_name: name, phone: phone, account_type: "customer" }, emailRedirectTo: appUrl() } });
    if (r.error) throw r.error;
    if (r.data.user && r.data.user.identities && r.data.user.identities.length === 0)
      throw new Error("That email already has an account. Sign in instead.");
    if (r.data.session) Api.user = r.data.user;
    return { signedIn: !!r.data.session };
  };
  Api.updateMyClient = async function (patch) {
    var rows = must(await sb.from("clients").update(patch).eq("id", Api.client.id).select("*"));
    Api.client = rows[0] || Api.client;
  };
  Api.updateMyPet = async function (id, patch) { must(await sb.from("pets").update(patch).eq("id", id)); };

  /* ---------------- owner: availability ---------------- */
  Api.vans = async function () { return must(await sb.from("vans").select("*").eq("active", true).order("id")); };
  Api.vanHours = async function (vanId) { return must(await sb.from("van_hours").select("*").eq("van_id", vanId)); };
  Api.saveVanHours = async function (vanId, rows) {
    // rows: [{weekday, start_time, end_time} | {weekday, off:true}]
    var on = rows.filter(function (r) { return !r.off; }).map(function (r) { return { van_id: vanId, weekday: r.weekday, start_time: r.start_time, end_time: r.end_time }; });
    var off = rows.filter(function (r) { return r.off; }).map(function (r) { return r.weekday; });
    if (off.length) must(await sb.from("van_hours").delete().eq("van_id", vanId).in("weekday", off));
    if (on.length) must(await sb.from("van_hours").upsert(on, { onConflict: "van_id,weekday" }));
  };
  Api.timeOff = async function (vanId) {
    return must(await sb.from("time_off").select("*").eq("van_id", vanId).gte("ends_at", new Date().toISOString()).order("starts_at"));
  };
  Api.addTimeOff = async function (row) { must(await sb.from("time_off").insert(row)); };
  Api.deleteTimeOff = async function (id) { must(await sb.from("time_off").delete().eq("id", id)); };
  Api.saveSettings = async function (patch) {
    var rows = must(await sb.from("booking_settings").update(patch).eq("id", 1).select("*"));
    if (!rows || !rows.length) throw new Error("Only owners can change booking rules.");
    cache.settings = rows[0];
  };

  window.Api = Api;
})();
