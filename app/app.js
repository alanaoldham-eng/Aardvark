/* Aardvark groomer app — installable web app prototype (no build step). */
(function () {
  "use strict";
  var D = null; // filled by Api.load()
  var params = new URLSearchParams(location.search);
  var EMBED = params.get("embed") === "1";
  if (EMBED) document.documentElement.classList.add("embed");
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("aardvark:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { if (EMBED) return; try { localStorage.setItem("aardvark:" + k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------- helpers ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var petById = function (id) { return D.pets.find(function (p) { return p.id === id; }); };
  var apptById = function (id) { return D.appointments.find(function (a) { return a.id === id; }); };
  var money = function (n) { return "$" + n.toLocaleString("en-US"); };
  function fmtTime(t) { var h = +t.slice(0, 2), m = t.slice(3); return (h % 12 || 12) + ":" + m + " " + (h < 12 ? "AM" : "PM"); }
  var today = new Date();
  var todayLabel = today.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  function daysFromNow(n) { var d = new Date(today); d.setDate(d.getDate() + n); return d; }
  function shortDate(d) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }

  var STATUSES = ["Confirmed", "On the way", "In progress", "Done"];
  function status(a) { return a.status || "Confirmed"; }
  function fail(err) { console.error(err); toast("Couldn't save — " + (err && err.message ? err.message : "check your connection")); }

  var ICON = {
    today: '<path d="M4 6h16v14H4zM4 10h16M9 3v4M15 3v4"/>',
    route: '<path d="M2 7h11v9H2zM13 10h4l3 3v3h-7z"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
    pets: '<circle cx="7" cy="8" r="2"/><circle cx="12" cy="5.5" r="2"/><circle cx="17" cy="8" r="2"/><path d="M7.5 17c0-3 2-5.5 4.5-5.5s4.5 2.5 4.5 5.5c0 1.8-1.5 2.5-4.5 2.5S7.5 18.8 7.5 17z"/>',
    academy: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
    more: '<path d="M4 20V10M10 20V6M16 20v-8M22 4l-6 6-4-3-8 6"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/>',
    msg: '<path d="M4 5h16v11H8l-4 4z"/>',
    nav: '<path d="M3 11l18-8-8 18-2-8z"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    book: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>'
  };
  function icon(n, cls) { return '<svg class="ico ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + "</svg>"; }

  var PALETTE = { "dog-golden": "#d9a35b", "dog-poodle": "#c9a27e", cat: "#8a8f99", "dog-aussie": "#5b6a7d", "dog-shihtzu": "#c7a98f", "dog-doodle": "#d8b48a", "dog-schnauzer": "#7d7f80" };
  function avatar(p, size) {
    size = size || 44;
    return '<span class="avatar" style="--s:' + size + 'px;--c:' + (p.color || PALETTE[p.photo] || "#a99") + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="8.5" r="1.9"/><circle cx="12" cy="6" r="1.9"/><circle cx="17" cy="8.5" r="1.9"/><path d="M7.6 16.6c0-2.8 2-5.1 4.4-5.1s4.4 2.3 4.4 5.1c0 1.7-1.5 2.3-4.4 2.3s-4.4-.6-4.4-2.3z"/></svg>' +
      "<b>" + esc(p.name[0]) + "</b></span>";
  }
  function statusChip(s) { return '<span class="chip chip-' + s.toLowerCase().replace(/\s+/g, "-") + '">' + s + "</span>"; }

  function toast(msg) { var t = $("[data-toast]"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 2200); }

  /* ---------- navigation chrome ---------- */
  var STAFF_TABS = [["today", "Today", "today", "Dashboard"], ["route", "Route", "route", "Dispatch"], ["pets", "Clients", "pets", "Clients"], ["academy", "Academy", "academy", "Academy"], ["more", "Business", "more", "Reports"]];
  var CUSTOMER_TABS = [["home", "Home", "home", "Home"], ["book", "Book", "book", "Book a groom"], ["mypets", "My pets", "pets", "My pets"], ["account", "Account", "user", "Account"]];
  var MODE = "staff"; // "public" (not signed in) | "customer" | "staff"
  function setTabs(list) {
    $("[data-tabs]").innerHTML = list.map(function (t) { return '<a href="#' + t[0] + '" data-tab="' + t[0] + '">' + icon(t[2]) + "<span>" + t[1] + "</span></a>"; }).join("");
    $("[data-nav]").innerHTML = list.map(function (t) { return '<a href="#' + t[0] + '" data-tab="' + t[0] + '">' + icon(t[2]) + "<span>" + t[3] + "</span></a>"; }).join("");
  }
  setTabs(STAFF_TABS);

  var view = $("[data-view]");
  var activeMap = null;
  function setHeader(title, sub, back, tab) {
    $("[data-title]").textContent = title;
    $("[data-subtitle]").textContent = sub || "";
    var b = $("[data-back]"); b.hidden = !back; b.onclick = function () { history.length > 1 ? history.back() : (location.hash = back); };
    document.querySelectorAll("[data-tab]").forEach(function (a) { a.classList.toggle("active", a.dataset.tab === tab); });
    document.title = title + " · Aardvark";
  }
  function isWide() { return window.matchMedia("(min-width: 900px)").matches; }

  /* ---------- views ---------- */
  function apptRow(a) {
    var p = petById(a.petId);
    return '<a class="appt" href="#appt/' + a.id + '">' +
      '<span class="appt-time">' + fmtTime(a.time) + "</span>" + avatar(p) +
      '<span class="appt-body"><b>' + esc(p.name) + (a.online ? ' <span class="chip chip-online">Online</span>' : "") + "</b><small>" + esc(p.breed) + "</small><small>" + esc(a.service) + "</small></span>" +
      statusChip(status(a)) + icon("chev", "chev") + "</a>";
  }

  function viewToday() {
    setHeader("Today", todayLabel + " · " + D.van.name, null, "today");
    var done = D.appointments.filter(function (a) { return status(a) === "Done"; }).length;
    var total = D.appointments.reduce(function (s, a) { return s + a.price; }, 0);
    var next = D.appointments.find(function (a) { return status(a) !== "Done"; });
    var schedule = '<section class="card">' +
      '<div class="seg"><button class="on">Schedule</button><button data-week>Week</button></div>' +
      '<div class="day-summary"><div><b>' + D.appointments.length + "</b><small>stops</small></div><div><b>" + done + "</b><small>done</small></div><div><b>" + money(total) + "</b><small>booked</small></div></div>" +
      '<div class="list">' + (D.appointments.length ? D.appointments.map(apptRow).join("") : '<p class="muted pad center">No stops scheduled today.</p>') + "</div></section>";

    if (!isWide()) { view.innerHTML = schedule; bindWeek(); return; }

    var np = next && petById(next.petId);
    view.innerHTML = '<div class="dash">' +
      '<div class="dash-col">' + schedule + "</div>" +
      '<div class="dash-col">' +
        '<section class="card map-card"><div class="card-head"><h2>' + D.van.name + " · " + D.van.zone + '</h2><a href="#route" class="link">Open dispatch</a></div><div class="map" id="mini-map"></div>' +
        (np ? '<div class="next-stop">' + avatar(np, 38) + "<div><small>Next stop</small><b>" + esc(np.name) + "</b><small>" + fmtTime(next.time) + "</small></div></div>" : "") +
        "</section>" +
        '<div class="dash-row">' + perfCard() +
        (np ? '<section class="card pet-mini"><h2>Customer &amp; Pet Record</h2><a href="#pet/' + np.id + '" class="pet-mini-body">' + avatar(np, 52) + "<div><b>" + esc(np.name) + "</b><small>" + esc(np.breed) + " · " + np.age + " yrs · " + np.weight + " lbs</small><div class=\"tags\">" + (np.tags || ["Regular"]).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div></div></a></section>" : "") +
        "</div></div></div>";
    bindWeek();
    drawMap("mini-map", true);
  }

  function bindWeek() {
    var w = $("[data-week]");
    if (w) w.onclick = function () { toast("Week calendar is coming in the next build."); };
  }

  function delta(n) { return n ? '<em class="' + (n < 0 ? "down" : "") + '">' + (n < 0 ? "↓ " : "↑ ") + Math.abs(n) + "%</em>" : ""; }
  function perfCard() {
    var W = D.weekly, t = W.trend, max = Math.max.apply(null, t), min = Math.min.apply(null, t);
    var pts = t.map(function (v, i) { return (i * (200 / (t.length - 1))).toFixed(1) + "," + (52 - ((v - min) / (max - min)) * 44).toFixed(1); }).join(" ");
    return '<section class="card perf"><h2>Business Performance</h2><div class="perf-row">' +
      "<div><small>Bookings</small><b>" + W.bookings + "</b>" + delta(W.bookingsDelta) + "</div>" +
      "<div><small>Revenue</small><b>" + money(W.revenue) + "</b>" + delta(W.revenueDelta) + "</div></div>" +
      '<svg viewBox="0 0 200 56" class="spark" preserveAspectRatio="none"><polyline points="' + pts + '"/></svg><small class="muted">This week so far vs. last week · revenue, last 8 weeks</small></section>';
  }

  function drawMap(id, compact) {
    if (activeMap) { activeMap.remove(); activeMap = null; }
    var el = document.getElementById(id);
    var depotOk = D.van.depot && D.van.depot.lat != null;
    if (!el || !window.L) { if (el) el.innerHTML = '<p class="muted pad">Map unavailable offline.</p>'; return; }
    var map = L.map(el, { zoomControl: !compact, attributionControl: true, scrollWheelZoom: !compact, dragging: !EMBED, tap: false });
    activeMap = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    var latlngs = depotOk ? [[D.van.depot.lat, D.van.depot.lng]] : [];
    if (depotOk) L.marker([D.van.depot.lat, D.van.depot.lng], { icon: L.divIcon({ className: "pin depot", html: icon("route"), iconSize: [30, 30] }) }).addTo(map);
    D.appointments.forEach(function (a, i) {
      if (a.mappable === false) return;
      var p = petById(a.petId), done = status(a) === "Done";
      latlngs.push([a.lat, a.lng]);
      L.marker([a.lat, a.lng], { icon: L.divIcon({ className: "pin" + (done ? " done" : ""), html: "<b>" + (i + 1) + "</b>", iconSize: [30, 30] }) })
        .addTo(map).bindPopup("<b>" + esc(p.name) + "</b><br>" + fmtTime(a.time) + " · " + esc(a.service) + '<br><a href="#appt/' + a.id + '">Open stop</a>');
    });
    map._straight = [L.polyline(latlngs, { color: "#0f4a3c", weight: 4, opacity: .85, dashArray: "1 8", lineCap: "round" }).addTo(map),
                     L.polyline(latlngs, { color: "#0f4a3c", weight: 3, opacity: .55 }).addTo(map)];
    if (latlngs.length) map.fitBounds(latlngs, { padding: [28, 28] }); else map.setView([30.6954, -88.0399], 12);
    setTimeout(function () { map.invalidateSize(); }, 50);
  }

  function directionsUrl(stops) {
    stops = stops.filter(function (a) { return a.mappable !== false; });
    if (!stops.length) return "#route";
    var o = D.van.depot && D.van.depot.lat != null ? D.van.depot : stops[0], last = stops[stops.length - 1];
    var wp = stops.slice(0, -1).map(function (a) { return a.lat + "," + a.lng; }).join("|");
    return "https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=" + o.lat + "," + o.lng +
      "&destination=" + last.lat + "," + last.lng + (wp ? "&waypoints=" + encodeURIComponent(wp) : "");
  }

  function viewRoute() {
    setHeader("Route", D.van.name + " · " + D.van.zone, null, "route");
    var remaining = D.appointments.filter(function (a) { return status(a) !== "Done"; });
    var driveMins = D.appointments.reduce(function (s, a) { return s + a.drive; }, 0);
    view.innerHTML = '<div class="route-layout"><section class="card map-full"><div class="map" id="route-map"></div></section>' +
      '<section class="card"><div class="card-head"><h2>' + D.appointments.length + " stops · " + driveMins + ' min driving</h2></div><ol class="stops">' +
      D.appointments.map(function (a, i) {
        var p = petById(a.petId), done = status(a) === "Done";
        return '<li class="' + (done ? "done" : "") + '"><a href="#appt/' + a.id + '"><span class="num">' + (done ? icon("check") : i + 1) + "</span><b>" + esc(p.name) + '</b><span class="t">' + fmtTime(a.time) + '</span><span class="d">' + a.drive + " min</span></a></li>";
      }).join("") + "</ol>" +
      (remaining.length ? '<a class="btn full" target="_blank" rel="noopener" href="' + directionsUrl(remaining) + '">' + icon("nav") + " Start navigation</a>" : '<p class="muted center">Route complete — nice work!</p>') +
      "</section></div>";
    drawMap("route-map", false);
    roadLegs();
  }

  function minsOfDay(t) { return +t.slice(0, 2) * 60 + +t.slice(3, 5); }
  // Real driving times between stops (OpenStreetMap routing); warn where the gap is too short
  function roadLegs() {
    if (!window.Geo) return;
    var stops = D.appointments.filter(function (a) { return a.mappable !== false && a.lat != null; });
    var depot = D.van.depot && D.van.depot.lat != null ? [D.van.depot] : [];
    var pts = depot.concat(stops);
    var mapAtStart = activeMap;
    Geo.route(pts).then(function (r) {
      if (!r || activeMap !== mapAtStart || !document.getElementById("route-map")) return;
      if (activeMap) {
        (activeMap._straight || []).forEach(function (l) { activeMap.removeLayer(l); });
        L.polyline(r.line, { color: "#0f4a3c", weight: 5, opacity: .8 }).addTo(activeMap);
      }
      var tight = 0;
      stops.forEach(function (a, i) {
        // With a depot the first leg is base → stop 1; without one, stop 1 has no incoming leg
        var leg = depot.length ? r.legs[i] : (i > 0 ? r.legs[i - 1] : null);
        var li = document.querySelector('.stops a[href="#appt/' + a.id + '"]');
        if (!li || !leg) return;
        var prev = i > 0 ? stops[i - 1] : null;
        var gap = prev ? minsOfDay(a.time) - (minsOfDay(prev.time) + prev.mins) : null;
        var isTight = gap != null && leg.minutes > gap; // not enough time to drive between the two jobs
        if (isTight) tight++;
        var d = li.querySelector(".d"); if (d) d.textContent = leg.minutes + " min";
        var note = document.createElement("span");
        note.className = "leg" + (isTight ? " tight" : "");
        note.textContent = (isTight ? "⚠ Tight: " : "") + leg.minutes + " min · " + leg.miles + " mi by road" + (gap != null ? " · " + gap + " min gap" : " from base");
        li.parentNode.appendChild(note);
      });
      var h = document.querySelector(".route-layout .card-head h2");
      if (h) h.textContent = stops.length + " stops · " + r.minutes + " min · " + r.miles + " mi by road";
      if (tight) toast(tight + " stop" + (tight > 1 ? "s are" : " is") + " tight on drive time today.");
    });
  }

  /* ---------- owner: availability ---------- */
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function zoned(dateStr, timeStr, tz) {
    // Local date + time in the business time zone → Date
    var guess = new Date(dateStr + "T" + timeStr + ":00Z");
    var parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess);
    var g = {}; parts.forEach(function (x) { g[x.type] = x.value; });
    var asLocal = Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour, +g.minute);
    return new Date(guess.getTime() - (asLocal - guess.getTime()));
  }
  function viewAvailability() {
    setHeader("Availability", "When customers can book online", "more", "more");
    if (Api.mode !== "live") { view.innerHTML = '<section class="card"><p class="muted">Availability settings are available once the app is connected to the database.</p></section>'; return; }
    if (!Api.staff || Api.staff.role !== "owner") { view.innerHTML = '<section class="card"><p class="muted">Only owners can change availability.</p></section>'; return; }
    view.innerHTML = '<p class="muted pad center">Loading…</p>';
    var van;
    Promise.all([Api.vans(), Api.settings()]).then(function (r) {
      van = r[0][0]; var st = r[1];
      if (!van) throw new Error("No vans yet. Add one in Supabase → Table Editor → vans.");
      return Promise.all([Api.vanHours(van.id), Api.timeOff(van.id)]).then(function (x) { render(x[0], x[1], st); });
    }).catch(showError);

    function fmtTO(d) { return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(d)); }
    function render(hours, off, st) {
      var byDay = {}; hours.forEach(function (h) { byDay[h.weekday] = h; });
      var rules = [["slot_step_min", "Offer a start time every (min)"], ["buffer_min", "Setup time between stops (min)"], ["max_stops_per_day", "Max stops per day"],
                   ["service_radius_miles", "Service radius (miles)"], ["lead_time_hours", "Earliest booking (hours ahead)"], ["booking_window_days", "Book up to (days ahead)"],
                   ["trip_fee", "Trip fee ($)"], ["extra_pet_discount", "Extra-pet discount ($)"], ["min_cancel_hours", "Online cancel cutoff (hours)"],
                   ["avg_speed_mph", "Average driving speed (mph)"], ["road_factor", "Road distance factor"]];
      view.innerHTML =
        '<section class="card"><div class="card-head"><h2>Working hours · ' + esc(van.name) + '</h2></div><div data-hours>' +
        DAYS.map(function (n, d) {
          var h = byDay[d];
          return '<div class="hours-row" data-day="' + d + '"><label><input type="checkbox"' + (h ? " checked" : "") + "> " + n.slice(0, 3) + "</label>" +
            '<input type="time" data-start value="' + (h ? h.start_time.slice(0, 5) : "08:00") + '"' + (h ? "" : " disabled") + ">" +
            '<input type="time" data-end value="' + (h ? h.end_time.slice(0, 5) : "17:00") + '"' + (h ? "" : " disabled") + "></div>";
        }).join("") + '</div><button class="btn full" data-save-hours>Save hours</button></section>' +
        '<section class="card"><div class="card-head"><h2>Time off</h2></div>' +
        (off.length ? off.map(function (o) { return '<div class="off-row"><div><b>' + fmtTO(o.starts_at) + " – " + fmtTO(o.ends_at) + "</b><small>" + esc(o.reason || "") + '</small></div><button class="pill ghost" data-del="' + o.id + '">Remove</button></div>'; }).join("") : '<p class="muted">No time off booked.</p>') +
        '<form class="off-form" data-off><label>From<input type="date" name="d1" required></label><label>To<input type="date" name="d2" required></label>' +
        '<label>Start time<input type="time" name="t1" value="00:00"></label><label>End time<input type="time" name="t2" value="23:59"></label>' +
        '<label class="wide">Reason (staff only)<input name="reason" maxlength="100" placeholder="e.g. Van service, vacation"></label>' +
        '<button class="btn ghost full wide" type="submit">Add time off</button></form></section>' +
        '<section class="card"><div class="card-head"><h2>Booking rules</h2></div><form class="rules" data-rules>' +
        rules.map(function (r) { return "<label>" + r[1] + '<input name="' + r[0] + '" type="number" step="any" min="0" value="' + (st[r[0]] != null ? Number(st[r[0]]) : "") + '"></label>'; }).join("") +
        '</form><p class="muted small">Drive time between stops is estimated from GPS distance × road factor ÷ speed, plus setup time. Customers only see times that fit.</p>' +
        '<button class="btn full" data-save-rules>Save rules</button></section>';

      document.querySelectorAll(".hours-row input[type=checkbox]").forEach(function (cb) {
        cb.onchange = function () { cb.closest(".hours-row").querySelectorAll("input[type=time]").forEach(function (t) { t.disabled = !cb.checked; }); };
      });
      $("[data-save-hours]").onclick = function () {
        var rows = [], bad = "";
        document.querySelectorAll(".hours-row").forEach(function (r) {
          var on = r.querySelector("input[type=checkbox]").checked, s1 = r.querySelector("[data-start]").value, e1 = r.querySelector("[data-end]").value;
          if (on && (!s1 || !e1 || e1 <= s1)) bad = DAYS[+r.dataset.day] + ": the end time must be after the start time.";
          rows.push(on ? { weekday: +r.dataset.day, start_time: s1, end_time: e1 } : { weekday: +r.dataset.day, off: true });
        });
        if (bad) return toast(bad);
        Api.saveVanHours(van.id, rows).then(function () { toast("Hours saved. Online booking updates right away."); }).catch(fail);
      };
      document.querySelectorAll("[data-del]").forEach(function (b) {
        b.onclick = function () { Api.deleteTimeOff(b.dataset.del).then(function () { toast("Removed."); viewAvailability(); }).catch(fail); };
      });
      $("[data-off]").onsubmit = function (e) {
        e.preventDefault(); var f = e.target;
        var a = zoned(f.d1.value, f.t1.value || "00:00", "America/Chicago"), b2 = zoned(f.d2.value, f.t2.value || "23:59", "America/Chicago");
        if (!(b2 > a)) return toast("The end must be after the start.");
        Api.addTimeOff({ van_id: van.id, starts_at: a.toISOString(), ends_at: b2.toISOString(), reason: f.reason.value.trim() || null })
          .then(function () { toast("Time off added. Those times are now hidden from customers."); viewAvailability(); }).catch(fail);
      };
      $("[data-save-rules]").onclick = function () {
        var patch = {};
        rules.forEach(function (r) { var v = $('[data-rules] [name="' + r[0] + '"]').value; if (v !== "") patch[r[0]] = Number(v); });
        Api.saveSettings(patch).then(function () { toast("Booking rules saved."); }).catch(fail);
      };
    }
  }

  function viewAppt(id) {
    var a = apptById(id); if (!a) return viewToday();
    var p = petById(a.petId), s = status(a), idx = STATUSES.indexOf(s);
    setHeader(p.name, fmtTime(a.time) + " · " + a.service, "today", "today");
    var nextS = STATUSES[idx + 1];
    var sms = "sms:" + p.phone.replace(/\D/g, "") + "?&body=" + encodeURIComponent("Hi! This is Aardvark — your groomer is on the way for " + p.name + ". See you in about " + a.drive + " minutes.");
    view.innerHTML = '<section class="card pet-hero">' + avatar(p, 72) + "<div><h2>" + esc(p.name) + "</h2><p>" + esc(p.breed) + " · " + p.age + " yrs · " + p.weight + " lbs</p>" + statusChip(s) + "</div></section>" +
      '<section class="card"><ol class="stepper">' + STATUSES.map(function (st, i) { return '<li class="' + (i <= idx ? "on" : "") + '">' + st + "</li>"; }).join("") + "</ol>" +
      (nextS ? '<button class="btn full" data-advance>' + (nextS === "On the way" ? "Head to stop" : nextS === "In progress" ? "Start groom" : "Complete groom") + "</button>" : '<p class="muted center">Groom complete · ' + money(a.price) + " collected</p>") +
      "</section>" +
      '<div class="actions"><a class="act" href="tel:' + p.phone.replace(/\D/g, "") + '">' + icon("phone") + "Call</a>" +
      '<a class="act" href="' + sms + '">' + icon("msg") + "On my way</a>" +
      '<a class="act" target="_blank" rel="noopener" href="' + directionsUrl([a]) + '">' + icon("nav") + "Navigate</a></div>" +
      '<section class="card"><dl class="facts"><dt>Service</dt><dd>' + esc(a.service) + "</dd><dt>Price</dt><dd>" + money(a.price) + "</dd><dt>Est. time</dt><dd>" + a.mins + " min</dd><dt>Coat</dt><dd>" + esc(p.coat) + "</dd><dt>Owner</dt><dd>" + esc(p.owner) + "</dd><dt>Area</dt><dd>" + esc(p.area) + "</dd></dl>" +
      '<div class="note"><b>Groomer notes</b><p>' + esc(p.notes) + "</p></div>" +
      '<a href="#pet/' + p.id + '" class="link">Full pet record ›</a></section>';
    var adv = $("[data-advance]");
    if (adv) adv.onclick = function () {
      adv.disabled = true;
      Api.setStatus(a, nextS).then(function () {
        if (nextS === "Done") {
          p.lastGroom = 0;
          toast(p.name + " is done! " + (Api.mode === "live" ? "Next groom booked for " : "Rebook due ") + shortDate(daysFromNow(p.cadenceWeeks * 7)) + ".");
          if (Api.mode === "live") { p.hasNext = true; p.nextAt = daysFromNow(p.cadenceWeeks * 7); }
        }
        viewAppt(id);
      }).catch(function (e) { adv.disabled = false; fail(e); });
    };
  }

  function viewPets() {
    setHeader("Clients", D.pets.length + " pets · Mobile & Eastern Shore", null, "pets");
    view.innerHTML = '<input class="search" type="search" placeholder="Search pets, owners, breeds" data-search aria-label="Search clients"><div class="card list" data-petlist></div>';
    function render(q) {
      q = (q || "").toLowerCase();
      var rows = D.pets.filter(function (p) { return !q || (p.name + p.owner + p.breed + p.area).toLowerCase().indexOf(q) > -1; }).map(function (p) {
        var due = p.nextAt || daysFromNow((p.lastGroom || 0) + p.cadenceWeeks * 7), overdue = !p.nextAt && due < today;
        var label = p.nextAt ? "Booked " : overdue ? "Due " : "Next ";
        return '<a class="appt" href="#pet/' + p.id + '">' + avatar(p) + '<span class="appt-body"><b>' + esc(p.name) + "</b><small>" + esc(p.breed) + " · " + esc(p.owner) + "</small></span>" +
          '<span class="chip ' + (overdue ? "chip-due" : "chip-confirmed") + '">' + label + shortDate(due) + "</span>" + icon("chev", "chev") + "</a>";
      });
      $("[data-petlist]").innerHTML = rows.join("") || '<p class="muted pad">No matches.</p>';
    }
    render();
    $("[data-search]").oninput = function (e) { render(e.target.value); };
  }

  function viewPet(id) {
    var p = petById(id); if (!p) return viewPets();
    setHeader(p.name, p.breed, "pets", "pets");
    var last = p.lastGroom == null ? null : daysFromNow(p.lastGroom), due = p.nextAt || daysFromNow((p.lastGroom || 0) + p.cadenceWeeks * 7);
    view.innerHTML = '<section class="card pet-hero">' + avatar(p, 72) + "<div><h2>" + esc(p.name) + "</h2><p>" + esc(p.breed) + " · " + p.age + " yrs · " + p.weight + " lbs</p>" +
      '<div class="tags">' + (p.tags || ["Regular"]).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div></div></section>" +
      '<section class="card"><dl class="facts"><dt>Owner</dt><dd>' + esc(p.owner) + "</dd><dt>Phone</dt><dd><a href=\"tel:" + p.phone.replace(/\D/g, "") + '">' + esc(p.phone) + "</a></dd><dt>Area</dt><dd>" + esc(p.area) + "</dd><dt>Coat</dt><dd>" + esc(p.coat) + "</dd><dt>Cadence</dt><dd>Every " + p.cadenceWeeks + " weeks</dd><dt>Last groom</dt><dd>" + (last ? shortDate(last) : "—") + "</dd><dt>" + (p.nextAt ? "Booked" : "Next due") + "</dt><dd>" + shortDate(due) + "</dd></dl>" +
      '<div class="note"><b>Groomer notes</b><p>' + esc(p.notes) + "</p></div></section>" +
      (p.hasNext ? "" : '<button class="btn full" data-book>Book next groom · ' + shortDate(due < today ? today : due) + "</button>");
    var bk = $("[data-book]");
    if (bk) bk.onclick = function () {
      var when = due < today ? today : due;
      bk.disabled = true;
      Api.bookNext(p, when).then(function () {
        toast(Api.mode === "live" ? "Booked " + shortDate(when) + " at 9:00 AM — confirm details with the owner." : "Demo mode — nothing was booked.");
        viewPet(id);
      }).catch(function (e) { bk.disabled = false; fail(e); });
    };
  }

  function overallProgress() {
    var all = [].concat.apply([], D.courses.map(function (c) { return c.modules; }));
    return all.length ? Math.round(all.filter(function (m) { return m.done; }).length / all.length * 100) : 0;
  }
  function coursePct(c) { return c.modules.length ? Math.round(c.modules.filter(function (m) { return m.done; }).length / c.modules.length * 100) : 0; }

  function viewAcademy() {
    setHeader("Academy", "Your training. Your growth.", null, "academy");
    var pct = overallProgress();
    view.innerHTML = '<section class="card academy-head"><div><h2>10-Week Groomer Program</h2><p class="muted">Theory · Table mechanics · Shelter practicum</p></div>' +
      '<div class="ring" style="--p:' + pct + '"><b>' + pct + "%</b><small>Complete</small></div></section>" +
      '<div class="seg"><button class="on">My Courses</button><button data-browse>Browse</button></div>' +
      '<div class="card list">' + D.courses.map(function (c) {
        var cp = coursePct(c);
        return '<a class="course" href="#course/' + c.id + '">' + avatar({ name: c.title, photo: c.photo, color: c.color }, 54) +
          '<span class="course-body"><b>' + esc(c.title) + "</b><small>" + c.modules.length + " modules · " + c.duration + '</small><span class="bar"><i style="width:' + cp + '%"></i></span></span>' +
          '<span class="pct ' + (cp === 100 ? "full" : "") + '">' + (cp === 100 ? icon("check") : cp + "%") + "</span></a>";
      }).join("") + "</div>";
    $("[data-browse]").onclick = function () { toast("Course catalog opens with public enrollment."); };
  }

  function viewCourse(id) {
    var c = D.courses.find(function (x) { return x.id === id; }); if (!c) return viewAcademy();
    setHeader(c.title, c.modules.length + " modules · " + c.duration, "academy", "academy");
    var vid = (c.modules.find(function (m) { return m.video && !m.done; }) || c.modules.find(function (m) { return m.video; }) || {}).video;
    view.innerHTML = (vid ? '<a class="card video" target="_blank" rel="noopener" href="' + esc(vid) + '">' + icon("play") + "<span>Play next lesson</span></a>"
                          : '<section class="card video">' + icon("play") + "<span>Video lessons are being filmed</span></section>") +
      '<section class="card"><div class="card-head"><h2>Modules</h2><span class="muted">' + coursePct(c) + '% complete</span></div><ul class="modules">' +
      c.modules.map(function (m, i) {
        return '<li><label><input type="checkbox" data-mod="' + i + '"' + (m.done ? " checked" : "") + '><span class="box">' + icon("check") + '</span><span><small>Module ' + (i + 1) + "</small>" + esc(m.title) + "</span></label></li>";
      }).join("") + "</ul></section>";
    view.querySelectorAll("[data-mod]").forEach(function (cb) {
      cb.onchange = function () {
        var m = c.modules[+cb.dataset.mod];
        Api.setModule(m, cb.checked).then(function () {
          if (coursePct(c) === 100) toast("Course complete! 🎉");
          viewCourse(id);
        }).catch(function (e) { cb.checked = !cb.checked; fail(e); });
      };
    });
  }

  function viewMore() {
    setHeader("Business", "This week · " + D.van.name, null, "more");
    var W = D.weekly, avg = Math.round(W.revenue / W.bookings);
    view.innerHTML = '<div class="dash-row">' + perfCard() +
      '<section class="card"><h2>Unit economics</h2><dl class="facts"><dt>Average ticket</dt><dd>' + money(avg) + "</dd><dt>Rebook rate</dt><dd>" + W.rebookRate + "%</dd><dt>Grooms / day</dt><dd>" + (W.bookings / 5).toFixed(1) + "</dd><dt>Drive time today</dt><dd>" + D.appointments.reduce(function (s, a) { return s + a.drive; }, 0) + " min</dd></dl></section></div>" +
      (MOBILE && !standalone ? '<section class="card"><h2>Get the app</h2><p class="muted">On iPhone: open this page in Safari, tap Share, then <b>Add to Home Screen</b>. On Android: tap <b>Install app</b> in Chrome\'s menu.</p><button class="btn ghost" data-install-again>Install Aardvark</button></section>' : "") +
      (Api.mode === "live" && Api.staff.role === "owner"
        ? '<a class="card team-link" href="#availability"><span><b>Availability</b><small class="muted">Working hours, time off, booking rules</small></span>' + icon("chev", "chev") + "</a>" +
          '<a class="card team-link" href="#team"><span><b>Team</b><small class="muted">Approve new staff, set roles</small></span>' + icon("chev", "chev") + "</a>" : "") +
      (Api.mode === "live"
        ? '<section class="card"><h2>Account</h2><dl class="facts"><dt>Signed in</dt><dd>' + esc(Api.user.email || "") + "</dd><dt>Role</dt><dd>" + esc(Api.staff.role) + '</dd></dl><button class="btn ghost full" data-signout>Sign out</button></section>'
        : '<p class="muted center small">Demo mode · sample data · <a href="../">Aardvark website</a></p>');
    var ia = $("[data-install-again]"); if (ia) ia.onclick = promptInstall;
    var so = $("[data-signout]");
    if (so) so.onclick = function () { Api.signOut().then(function () { location.hash = "#welcome"; toPublic(); }); };
  }

  var ROLES = [["owner", "Owner"], ["groomer", "Groomer"], ["student", "Academy student"]];
  function viewTeam() {
    setHeader("Team", "Approve new staff and set roles", "more", "more");
    if (Api.mode !== "live") { view.innerHTML = '<section class="card"><p class="muted">The team list is available once the app is connected to the database.</p></section>'; return; }
    if (!Api.staff || Api.staff.role !== "owner") { view.innerHTML = '<section class="card"><p class="muted">Only owners can manage the team.</p></section>'; return; }
    view.innerHTML = '<p class="muted pad center">Loading team…</p>';
    Api.listTeam().then(function (team) {
      var pending = team.filter(function (m) { return !m.active; });
      var active = team.filter(function (m) { return m.active; });
      function row(m) {
        var me = m.id === Api.user.id;
        return '<div class="member" data-id="' + m.id + '">' + avatar({ name: m.full_name || m.email || "?", color: m.active ? "#17604e" : "#b4532f" }, 42) +
          '<div class="member-body"><b>' + esc(m.full_name || "—") + (me ? ' <span class="tag">You</span>' : "") + "</b><small>" + esc(m.email || "") + "</small>" +
          '<div class="member-actions"><select data-role aria-label="Role"' + (me ? " disabled" : "") + ">" +
          ROLES.map(function (r) { return '<option value="' + r[0] + '"' + (m.role === r[0] ? " selected" : "") + ">" + r[1] + "</option>"; }).join("") + "</select>" +
          (m.active ? (me ? "" : '<button class="pill ghost" data-off>Switch off</button>') : '<button class="pill" data-approve>Approve</button>') +
          "</div></div></div>";
      }
      view.innerHTML =
        (pending.length ? '<section class="card"><div class="card-head"><h2>Waiting for approval</h2><span class="chip chip-due">' + pending.length + "</span></div>" + pending.map(row).join("") + "</section>" : "") +
        '<section class="card"><div class="card-head"><h2>Active team</h2><span class="muted">' + active.length + "</span></div>" + (active.map(row).join("") || '<p class="muted">No one yet.</p>') + "</section>" +
        '<section class="card"><h2>Adding someone</h2><p class="muted">Ask them to open this app, tap <b>Create a staff account</b>, and confirm their email. They\'ll appear above for you to approve. Switched-off staff can be approved again any time.</p></section>';
      view.querySelectorAll(".member").forEach(function (el) {
        var id = el.dataset.id, m = team.find(function (x) { return x.id === id; });
        function save(patch, msg) {
          el.classList.add("busy");
          Api.updateStaff(id, patch).then(function () { toast(msg); viewTeam(); })
            .catch(function (e) { el.classList.remove("busy"); fail(e); viewTeam(); });
        }
        var sel = el.querySelector("[data-role]"), ap = el.querySelector("[data-approve]"), off = el.querySelector("[data-off]");
        if (sel && !sel.disabled) sel.onchange = function () { save({ role: sel.value }, (m.full_name || "Role") + " is now " + sel.options[sel.selectedIndex].text.toLowerCase() + "."); };
        if (ap) ap.onclick = function () { save({ active: true, role: sel.value }, (m.full_name || "They") + " can sign in now."); };
        if (off) off.onclick = function () { if (confirm("Switch off " + (m.full_name || m.email) + "? They won't see any data until approved again.")) save({ active: false }, "Switched off."); };
      });
    }).catch(showError);
  }

  /* ---------- router ---------- */
  var PUBLIC_ROUTES = ["welcome", "book", "join", "signin", "staffjoin", "home", "mypets", "account"];
  function route() {
    var h = (location.hash || "").slice(1).split("/");
    if (MODE !== "staff") {
      if (activeMap) { activeMap.remove(); activeMap = null; }
      if (MODE === "public") Book.routePublic(h); else Book.routeCustomer(h);
      window.scrollTo(0, 0);
      return;
    }
    if (!h[0] || PUBLIC_ROUTES.indexOf(h[0]) > -1) h = ["today"];
    if (activeMap && !(h[0] === "today" || h[0] === "route")) { activeMap.remove(); activeMap = null; }
    switch (h[0]) {
      case "route": viewRoute(); break;
      case "appt": viewAppt(h[1]); break;
      case "pets": viewPets(); break;
      case "pet": viewPet(h[1]); break;
      case "academy": viewAcademy(); break;
      case "course": viewCourse(h[1]); break;
      case "more": viewMore(); break;
      case "team": viewTeam(); break;
      case "availability": viewAvailability(); break;
      default: viewToday();
    }
    view.scrollTop = 0; window.scrollTo(0, 0);
  }
  var lastWide = isWide();
  window.addEventListener("resize", function () { if (MODE === "staff" && D && isWide() !== lastWide) { lastWide = isWide(); route(); } });

  /* ---------- sign-in + boot ---------- */
  function chrome(on) { document.body.classList.toggle("signed-out", !on); }

  function showLogin(msg) {
    chrome(false);
    if (activeMap) { activeMap.remove(); activeMap = null; }
    setHeader("Sign in", "Customers and staff", "welcome", "");
    view.innerHTML = '<section class="card login"><img src="../assets/mark.png" alt="" width="72" height="72">' +
      '<h2>Welcome back</h2><p class="muted">Sign in to book faster and manage your visits.</p>' +
      '<form data-login><label>Email<input type="email" name="email" required autocomplete="username"></label>' +
      '<label>Password<input type="password" name="password" autocomplete="current-password"></label>' +
      '<button class="btn full" type="submit">Sign in</button>' +
      '<button class="btn ghost full" type="button" data-link>Email me a sign-in link</button>' +
      '<p class="form-msg" role="status">' + esc(msg || "") + "</p></form>" +
      '<div class="login-links"><button type="button" class="linkish" data-forgot>Forgot password?</button>' +
      '<a class="linkish" href="#join">New customer? Create an account</a>' +
      '<a class="linkish" href="#book">Book without an account</a>' +
      '<button type="button" class="linkish subtle" data-signup>Work at Aardvark? Create a staff account</button></div></section>';
    var f = $("[data-login]"), out = f.querySelector(".form-msg");
    f.onsubmit = function (e) {
      e.preventDefault();
      var email = f.email.value.trim(), pw = f.password.value;
      if (!pw) { out.textContent = "Enter your password, or use the email link."; return; }
      out.textContent = "Signing in…";
      Api.signIn(email, pw).then(function () { return start(); })
        .catch(function (err) { out.textContent = err.message || "Sign-in failed."; });
    };
    $("[data-link]").onclick = function () {
      var email = f.email.value.trim();
      if (!email || !f.email.checkValidity()) { out.textContent = "Enter your email first."; return; }
      out.textContent = "Sending…";
      Api.sendLink(email).then(function () { out.textContent = "Check your email for a sign-in link (open it on this device)."; })
        .catch(function (err) { out.textContent = err.message || "Couldn't send the link."; });
    };
    $("[data-forgot]").onclick = function () {
      var email = f.email.value.trim();
      if (!email || !f.email.checkValidity()) { out.textContent = "Enter your email above, then tap “Forgot password?” again."; f.email.focus(); return; }
      out.textContent = "Sending…";
      Api.resetPassword(email).then(function () {
        out.textContent = "If that email has an account, a reset link is on its way. Open it in this same browser.";
      }).catch(function (err) { out.textContent = err.message || "Couldn't send the reset email."; });
    };
    $("[data-signup]").onclick = function () { showSignup(f.email.value.trim()); };
  }

  function authCard(title, intro, fields, button, extra) {
    return '<section class="card login"><img src="../assets/mark.png" alt="" width="72" height="72">' +
      "<h2>" + title + '</h2><p class="muted">' + intro + "</p><form data-auth>" + fields +
      '<button class="btn full" type="submit">' + button + "</button>" +
      '<p class="form-msg" role="status"></p></form>' + (extra || "") + "</section>";
  }

  function showSignup(prefill) {
    chrome(false);
    setHeader("Create account", "Aardvark staff", null, "");
    view.innerHTML = authCard("Join the team",
      "Create your login. An Aardvark owner will approve it before you can see the schedule.",
      '<label>Your name<input name="name" required autocomplete="name" maxlength="80"></label>' +
      '<label>Email<input type="email" name="email" required autocomplete="email" value="' + esc(prefill || "") + '"></label>' +
      '<label>Password<input type="password" name="password" required minlength="8" autocomplete="new-password"><small class="hint">At least 8 characters</small></label>',
      "Create account",
      '<div class="login-links"><button type="button" class="linkish" data-back-login>Already have an account? Sign in</button></div>');
    var f = $("[data-auth]"), out = f.querySelector(".form-msg");
    $("[data-back-login]").onclick = function () { location.hash = "#signin"; showLogin(); };
    f.onsubmit = function (e) {
      e.preventDefault();
      if (!f.checkValidity()) { f.reportValidity(); return; }
      var btn = f.querySelector("button[type=submit]"); btn.disabled = true;
      out.textContent = "Creating your account…";
      Api.signUp(f.name.value.trim(), f.email.value.trim(), f.password.value).then(function (r) {
        if (r.signedIn) return start();
        view.innerHTML = authCard("Check your email",
          "We sent a confirmation link to <b>" + esc(f.email.value.trim()) + "</b>. Tap it, then come back here and sign in. " +
          "An owner will approve your account; until then you'll see a waiting message.", "", "Back to sign in");
        $("[data-auth]").onsubmit = function (ev) { ev.preventDefault(); showLogin(); };
      }).catch(function (err) { btn.disabled = false; out.textContent = err.message || "Couldn't create the account."; });
    };
  }

  function showSetPassword() {
    chrome(false);
    setHeader("New password", "Aardvark staff", null, "");
    view.innerHTML = authCard("Choose a new password", "Enter a new password for your Aardvark account.",
      '<label>New password<input type="password" name="password" required minlength="8" autocomplete="new-password"><small class="hint">At least 8 characters</small></label>',
      "Save password");
    var f = $("[data-auth]"), out = f.querySelector(".form-msg");
    f.onsubmit = function (e) {
      e.preventDefault();
      if (!f.checkValidity()) { f.reportValidity(); return; }
      out.textContent = "Saving…";
      Api.updatePassword(f.password.value).then(function () { toast("Password updated."); start(); })
        .catch(function (err) { out.textContent = err.message || "Couldn't save the password."; });
    };
  }

  function showError(err) {
    console.error(err);
    chrome(true);
    setHeader("Something went wrong", "", null, "");
    view.innerHTML = '<section class="card"><p>' + esc(err && err.message ? err.message : String(err)) + '</p><button class="btn full" data-retry>Try again</button>' +
      (Api.mode === "live" ? '<button class="btn ghost full" data-out>Sign out</button>' : "") + "</section>";
    $("[data-retry]").onclick = start;
    var o = $("[data-out]"); if (o) o.onclick = function () { Api.signOut().then(function () { location.hash = "#welcome"; toPublic(); }); };
  }

  function start() {
    document.body.classList.remove("public-landing");
    view.innerHTML = '<p class="muted pad center">Loading…</p>';
    return Api.load().then(function (data) {
      document.documentElement.classList.toggle("demo", Api.mode === "demo");
      var h = (location.hash || "").slice(1).split("/")[0];
      if (Api.kind === "customer") {
        MODE = "customer"; D = null; setTabs(CUSTOMER_TABS); chrome(true);
        if (["home", "book", "mypets", "account"].indexOf(h) < 0) history.replaceState(null, "", location.pathname + location.search + (Book.hasDraft() ? "#book" : "#home"));
      } else {
        MODE = "staff"; D = data; setTabs(STAFF_TABS); chrome(true);
        if (!h || PUBLIC_ROUTES.indexOf(h) > -1) history.replaceState(null, "", location.pathname + location.search + "#today");
      }
      route();
    }).catch(showError);
  }

  function toPublic() {
    MODE = "public"; D = null; setTabs([]);
    var h = (location.hash || "").slice(1).split("/")[0];
    if (["welcome", "book", "join", "signin", "staffjoin"].indexOf(h) < 0) history.replaceState(null, "", location.pathname + location.search + "#welcome");
    route();
  }

  window.AppUI = { $: $, esc: esc, view: view, icon: icon, avatar: avatar, toast: toast, setHeader: setHeader, chrome: chrome,
                   showError: showError, showLogin: showLogin, showSignup: showSignup, start: start, toPublic: toPublic };
  Book.init(window.AppUI);

  Api.onSignedOut = function () { toPublic(); };
  Api.onRecovery = function () { D = null; showSetPassword(); };
  window.addEventListener("hashchange", function () { if (MODE !== "staff" || D) route(); });
  Api.init().then(function (r) { r.recovery ? showSetPassword() : r.needsLogin ? toPublic() : start(); }).catch(showError);

  /* ---------- install + offline ---------- */
  var deferred = null, banner = $("[data-install]");
  var standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  function promptInstall() {
    if (deferred) { deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; banner.hidden = true; }); }
    else if (standalone) toast("Aardvark is already installed.");
    else if (isIOS) toast("Tap Share, then “Add to Home Screen”.");
    else toast("Use your browser menu → Install app.");
  }
  var MOBILE = !!window.AARDVARK_MOBILE;
  if (MOBILE && !EMBED && !standalone && !store.get("installDismissed", false)) {
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; banner.hidden = false; });
    if (isIOS) { $("[data-install-text]").textContent = "Tap Share, then “Add to Home Screen”."; $("[data-install-btn]").hidden = true; banner.hidden = false; }
  }
  $("[data-install-btn]").onclick = promptInstall;
  $("[data-install-close]").onclick = function () { banner.hidden = true; store.set("installDismissed", true); };

  if (!EMBED && "serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(function (e) { console.warn("SW registration failed", e); });
  }
})();
