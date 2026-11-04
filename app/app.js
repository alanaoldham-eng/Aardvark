/* Aardvark groomer app — installable web app prototype (no build step). */
(function () {
  "use strict";
  var D = window.AARDVARK_DATA;
  var params = new URLSearchParams(location.search);
  var EMBED = params.get("embed") === "1";
  if (EMBED) document.documentElement.classList.add("embed");

  /* ---------- storage (best effort) ---------- */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("aardvark:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { if (EMBED) return; try { localStorage.setItem("aardvark:" + k, JSON.stringify(v)); } catch (e) {} }
  };
  var statusOf = EMBED ? {} : store.get("status", {});
  var progress = EMBED ? {} : store.get("progress", {});
  D.courses.forEach(function (c) {
    c.modules = c.modules.map(function (m, i) {
      var key = c.id + ":" + i;
      return { title: m[0], done: key in progress ? progress[key] : m[1], key: key };
    });
  });

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
  function status(a) { return statusOf[a.id] || "Confirmed"; }
  function setStatus(a, s) { statusOf[a.id] = s; store.set("status", statusOf); }

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
    play: '<path d="M8 5v14l11-7z"/>'
  };
  function icon(n, cls) { return '<svg class="ico ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + "</svg>"; }

  var PALETTE = { "dog-golden": "#d9a35b", "dog-poodle": "#c9a27e", cat: "#8a8f99", "dog-aussie": "#5b6a7d", "dog-shihtzu": "#c7a98f", "dog-doodle": "#d8b48a", "dog-schnauzer": "#7d7f80" };
  function avatar(p, size) {
    size = size || 44;
    return '<span class="avatar" style="--s:' + size + 'px;--c:' + (PALETTE[p.photo] || "#a99") + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="8.5" r="1.9"/><circle cx="12" cy="6" r="1.9"/><circle cx="17" cy="8.5" r="1.9"/><path d="M7.6 16.6c0-2.8 2-5.1 4.4-5.1s4.4 2.3 4.4 5.1c0 1.7-1.5 2.3-4.4 2.3s-4.4-.6-4.4-2.3z"/></svg>' +
      "<b>" + esc(p.name[0]) + "</b></span>";
  }
  function statusChip(s) { return '<span class="chip chip-' + s.toLowerCase().replace(/\s+/g, "-") + '">' + s + "</span>"; }

  function toast(msg) { var t = $("[data-toast]"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 2200); }

  /* ---------- navigation chrome ---------- */
  var TABS = [["today", "Today"], ["route", "Route"], ["pets", "Clients"], ["academy", "Academy"], ["more", "Business"]];
  $("[data-tabs]").innerHTML = TABS.map(function (t) { return '<a href="#' + t[0] + '" data-tab="' + t[0] + '">' + icon(t[0]) + "<span>" + t[1] + "</span></a>"; }).join("");
  $("[data-nav]").innerHTML = TABS.map(function (t) { return '<a href="#' + t[0] + '" data-tab="' + t[0] + '">' + icon(t[0]) + "<span>" + (t[0] === "today" ? "Dashboard" : t[0] === "route" ? "Dispatch" : t[0] === "more" ? "Reports" : t[1]) + "</span></a>"; }).join("");

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
      '<span class="appt-body"><b>' + esc(p.name) + "</b><small>" + esc(p.breed) + "</small><small>" + esc(a.service) + "</small></span>" +
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
      '<div class="list">' + D.appointments.map(apptRow).join("") + "</div></section>";

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

  function perfCard() {
    var W = D.weekly, t = W.trend, max = Math.max.apply(null, t), min = Math.min.apply(null, t);
    var pts = t.map(function (v, i) { return (i * (200 / (t.length - 1))).toFixed(1) + "," + (52 - ((v - min) / (max - min)) * 44).toFixed(1); }).join(" ");
    return '<section class="card perf"><h2>Business Performance</h2><div class="perf-row">' +
      "<div><small>Bookings</small><b>" + W.bookings + '</b><em>↑ ' + W.bookingsDelta + "%</em></div>" +
      "<div><small>Revenue</small><b>" + money(W.revenue) + '</b><em>↑ ' + W.revenueDelta + "%</em></div></div>" +
      '<svg viewBox="0 0 200 56" class="spark" preserveAspectRatio="none"><polyline points="' + pts + '"/></svg><small class="muted">This week vs. last · last 8 weeks</small></section>';
  }

  function drawMap(id, compact) {
    if (activeMap) { activeMap.remove(); activeMap = null; }
    var el = document.getElementById(id);
    if (!el || !window.L) { if (el) el.innerHTML = '<p class="muted pad">Map unavailable offline.</p>'; return; }
    var map = L.map(el, { zoomControl: !compact, attributionControl: true, scrollWheelZoom: !compact, dragging: !EMBED, tap: false });
    activeMap = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    var latlngs = [[D.van.depot.lat, D.van.depot.lng]];
    L.marker([D.van.depot.lat, D.van.depot.lng], { icon: L.divIcon({ className: "pin depot", html: icon("route"), iconSize: [30, 30] }) }).addTo(map);
    D.appointments.forEach(function (a, i) {
      var p = petById(a.petId), done = status(a) === "Done";
      latlngs.push([a.lat, a.lng]);
      L.marker([a.lat, a.lng], { icon: L.divIcon({ className: "pin" + (done ? " done" : ""), html: "<b>" + (i + 1) + "</b>", iconSize: [30, 30] }) })
        .addTo(map).bindPopup("<b>" + esc(p.name) + "</b><br>" + fmtTime(a.time) + " · " + esc(a.service) + '<br><a href="#appt/' + a.id + '">Open stop</a>');
    });
    L.polyline(latlngs, { color: "#0f4a3c", weight: 4, opacity: .85, dashArray: "1 8", lineCap: "round" }).addTo(map);
    L.polyline(latlngs, { color: "#0f4a3c", weight: 3, opacity: .55 }).addTo(map);
    map.fitBounds(latlngs, { padding: [28, 28] });
    setTimeout(function () { map.invalidateSize(); }, 50);
  }

  function directionsUrl(stops) {
    var o = D.van.depot, last = stops[stops.length - 1];
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
      setStatus(a, nextS);
      if (nextS === "Done") toast(p.name + " is done! Rebook set for " + shortDate(daysFromNow(p.cadenceWeeks * 7)) + ".");
      viewAppt(id);
    };
  }

  function viewPets() {
    setHeader("Clients", D.pets.length + " pets · Mobile & Eastern Shore", null, "pets");
    view.innerHTML = '<input class="search" type="search" placeholder="Search pets, owners, breeds" data-search aria-label="Search clients"><div class="card list" data-petlist></div>';
    function render(q) {
      q = (q || "").toLowerCase();
      var rows = D.pets.filter(function (p) { return !q || (p.name + p.owner + p.breed + p.area).toLowerCase().indexOf(q) > -1; }).map(function (p) {
        var due = daysFromNow(p.lastGroom + p.cadenceWeeks * 7), overdue = due < today;
        return '<a class="appt" href="#pet/' + p.id + '">' + avatar(p) + '<span class="appt-body"><b>' + esc(p.name) + "</b><small>" + esc(p.breed) + " · " + esc(p.owner) + "</small></span>" +
          '<span class="chip ' + (overdue ? "chip-due" : "chip-confirmed") + '">' + (overdue ? "Due " : "Next ") + shortDate(due) + "</span>" + icon("chev", "chev") + "</a>";
      });
      $("[data-petlist]").innerHTML = rows.join("") || '<p class="muted pad">No matches.</p>';
    }
    render();
    $("[data-search]").oninput = function (e) { render(e.target.value); };
  }

  function viewPet(id) {
    var p = petById(id); if (!p) return viewPets();
    setHeader(p.name, p.breed, "pets", "pets");
    var last = daysFromNow(p.lastGroom), due = daysFromNow(p.lastGroom + p.cadenceWeeks * 7);
    view.innerHTML = '<section class="card pet-hero">' + avatar(p, 72) + "<div><h2>" + esc(p.name) + "</h2><p>" + esc(p.breed) + " · " + p.age + " yrs · " + p.weight + " lbs</p>" +
      '<div class="tags">' + (p.tags || ["Regular"]).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div></div></section>" +
      '<section class="card"><dl class="facts"><dt>Owner</dt><dd>' + esc(p.owner) + "</dd><dt>Phone</dt><dd><a href=\"tel:" + p.phone.replace(/\D/g, "") + '">' + esc(p.phone) + "</a></dd><dt>Area</dt><dd>" + esc(p.area) + "</dd><dt>Coat</dt><dd>" + esc(p.coat) + "</dd><dt>Cadence</dt><dd>Every " + p.cadenceWeeks + " weeks</dd><dt>Last groom</dt><dd>" + shortDate(last) + "</dd><dt>Next due</dt><dd>" + shortDate(due) + "</dd></dl>" +
      '<div class="note"><b>Groomer notes</b><p>' + esc(p.notes) + "</p></div></section>" +
      '<button class="btn full" data-book>Book next groom</button>';
    $("[data-book]").onclick = function () { toast("Booking request saved for " + shortDate(due) + " (prototype)."); };
  }

  function overallProgress() {
    var all = [].concat.apply([], D.courses.map(function (c) { return c.modules; }));
    return Math.round(all.filter(function (m) { return m.done; }).length / all.length * 100);
  }
  function coursePct(c) { return Math.round(c.modules.filter(function (m) { return m.done; }).length / c.modules.length * 100); }

  function viewAcademy() {
    setHeader("Academy", "Your training. Your growth.", null, "academy");
    var pct = overallProgress();
    view.innerHTML = '<section class="card academy-head"><div><h2>10-Week Groomer Program</h2><p class="muted">Theory · Table mechanics · Shelter practicum</p></div>' +
      '<div class="ring" style="--p:' + pct + '"><b>' + pct + "%</b><small>Complete</small></div></section>" +
      '<div class="seg"><button class="on">My Courses</button><button data-browse>Browse</button></div>' +
      '<div class="card list">' + D.courses.map(function (c) {
        var cp = coursePct(c);
        return '<a class="course" href="#course/' + c.id + '">' + avatar({ name: c.title, photo: c.photo }, 54) +
          '<span class="course-body"><b>' + esc(c.title) + "</b><small>" + c.modules.length + " modules · " + c.duration + '</small><span class="bar"><i style="width:' + cp + '%"></i></span></span>' +
          '<span class="pct ' + (cp === 100 ? "full" : "") + '">' + (cp === 100 ? icon("check") : cp + "%") + "</span></a>";
      }).join("") + "</div>";
    $("[data-browse]").onclick = function () { toast("Course catalog opens with public enrollment."); };
  }

  function viewCourse(id) {
    var c = D.courses.find(function (x) { return x.id === id; }); if (!c) return viewAcademy();
    setHeader(c.title, c.modules.length + " modules · " + c.duration, "academy", "academy");
    view.innerHTML = '<section class="card video">' + icon("play") + "<span>Video lessons are being filmed</span></section>" +
      '<section class="card"><div class="card-head"><h2>Modules</h2><span class="muted">' + coursePct(c) + '% complete</span></div><ul class="modules">' +
      c.modules.map(function (m, i) {
        return '<li><label><input type="checkbox" data-mod="' + i + '"' + (m.done ? " checked" : "") + '><span class="box">' + icon("check") + '</span><span><small>Module ' + (i + 1) + "</small>" + esc(m.title) + "</span></label></li>";
      }).join("") + "</ul></section>";
    view.querySelectorAll("[data-mod]").forEach(function (cb) {
      cb.onchange = function () {
        var m = c.modules[+cb.dataset.mod]; m.done = cb.checked; progress[m.key] = cb.checked; store.set("progress", progress);
        if (coursePct(c) === 100) toast("Course complete! 🎉");
        viewCourse(id);
      };
    });
  }

  function viewMore() {
    setHeader("Business", "This week · " + D.van.name, null, "more");
    var W = D.weekly, avg = Math.round(W.revenue / W.bookings);
    view.innerHTML = '<div class="dash-row">' + perfCard() +
      '<section class="card"><h2>Unit economics</h2><dl class="facts"><dt>Average ticket</dt><dd>' + money(avg) + "</dd><dt>Rebook rate</dt><dd>" + W.rebookRate + "%</dd><dt>Grooms / day</dt><dd>" + (W.bookings / 5).toFixed(1) + "</dd><dt>Drive time today</dt><dd>" + D.appointments.reduce(function (s, a) { return s + a.drive; }, 0) + " min</dd></dl></section></div>" +
      '<section class="card"><h2>Get the app</h2><p class="muted">On iPhone: open this page in Safari, tap Share, then <b>Add to Home Screen</b>. On Android: tap <b>Install app</b> in Chrome\'s menu.</p><button class="btn ghost" data-install-again>Install Aardvark</button></section>' +
      '<p class="muted center small">Prototype with sample data · <a href="../">aardvark website</a></p>';
    $("[data-install-again]").onclick = promptInstall;
  }

  /* ---------- router ---------- */
  function route() {
    var h = (location.hash || "#today").slice(1).split("/");
    if (activeMap && !(h[0] === "today" || h[0] === "route")) { activeMap.remove(); activeMap = null; }
    switch (h[0]) {
      case "route": viewRoute(); break;
      case "appt": viewAppt(h[1]); break;
      case "pets": viewPets(); break;
      case "pet": viewPet(h[1]); break;
      case "academy": viewAcademy(); break;
      case "course": viewCourse(h[1]); break;
      case "more": viewMore(); break;
      default: viewToday();
    }
    view.scrollTop = 0; window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  var lastWide = isWide();
  window.addEventListener("resize", function () { if (isWide() !== lastWide) { lastWide = isWide(); route(); } });
  route();

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
  if (!EMBED && !standalone && !store.get("installDismissed", false)) {
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; banner.hidden = false; });
    if (isIOS) { $("[data-install-text]").textContent = "Tap Share, then “Add to Home Screen”."; $("[data-install-btn]").hidden = true; banner.hidden = false; }
  }
  $("[data-install-btn]").onclick = promptInstall;
  $("[data-install-close]").onclick = function () { banner.hidden = true; store.set("installDismissed", true); };

  if (!EMBED && "serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(function (e) { console.warn("SW registration failed", e); });
  }
})();
