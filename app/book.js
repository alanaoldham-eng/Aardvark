/* Aardvark public app: landing page, online booking, and the customer portal.
   Uses helpers from app.js (window.AppUI) and data from api.js (window.Api). */
(function () {
  "use strict";
  var U, Api = window.Api, Geo = window.Geo;
  var settings = null, services = null;

  // Booking draft — kept in memory so it survives signing in halfway through
  var B = { step: 1, address: null, area: null, pets: [], slot: null, day: null, slots: null, slotsKey: "",
            contact: { name: "", phone: "", email: "" }, notes: "", save: true, password: "", result: null,
            client: null, sms: false, notifyCustomer: true };
  function isStaff() { return Api.kind === "staff"; }
  var staffClients = null;
  var map = null;

  /* ---------- small helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return U.esc(s == null ? "" : s); }
  function money(n) { n = Number(n) || 0; return "$" + (n % 1 ? n.toFixed(2) : n.toFixed(0)); }
  function tz() { return (settings && settings.timezone) || "America/Chicago"; }
  function fmt(d, opts) { return new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: tz() }, opts)).format(d); }
  function dayKey(d) { return fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" }); }
  function timeLabel(d) { return fmt(d, { hour: "numeric", minute: "2-digit" }); }
  function longDate(d) { return fmt(d, { weekday: "long", month: "long", day: "numeric" }); }
  function mins(n) { var h = Math.floor(n / 60), m = n % 60; return (h ? h + " hr" + (h > 1 ? "s" : "") : "") + (h && m ? " " : "") + (m ? m + " min" : ""); }
  function firstName(n) { return String(n || "").trim().split(/\s+/)[0] || "there"; }
  function killMap() { if (map) { map.remove(); map = null; } }

  function loadBasics() {
    return Promise.all([Api.settings(), Api.services()]).then(function (r) { settings = r[0]; services = r[1]; });
  }
  function svc(id) { return (services || []).find(function (s) { return s.id === id; }); }
  function mainServices(species) {
    return services.filter(function (s) { return !s.is_addon && (s.species === species || s.species === "Any"); });
  }
  function addons(species) { return services.filter(function (s) { return s.is_addon && (s.species === species || s.species === "Any"); }); }
  function recommend(pet) {
    var w = parseFloat(pet.weight), list = mainServices(pet.species || "Dog");
    if (pet.species === "Cat") return (list.find(function (s) { return s.species === "Cat"; }) || list[0] || {}).id;
    var groomTier = list.filter(function (s) { return /groom/i.test(s.name) && s.species === "Dog"; });
    if (!isNaN(w)) {
      var hit = groomTier.find(function (s) { return w >= (s.min_weight || 0) && w <= (s.max_weight || 999); });
      if (/doodle/i.test(pet.breed || "") || /heavy|matted/i.test(pet.coat || "")) hit = groomTier.find(function (s) { return s.id === "dog-xl"; }) || hit;
      if (hit) return hit.id;
    }
    return null;
  }
  function petLine(p) {
    var s = svc(p.service_id); if (!s) return { dur: 0, price: 0, label: "" };
    var dur = s.duration_min, price = Number(s.price), label = s.name;
    (p.addon_ids || []).forEach(function (id) { var a = svc(id); if (a) { dur += a.duration_min; price += Number(a.price); label += " + " + a.name; } });
    return { dur: dur, price: price, label: label };
  }
  function totals() {
    var dur = 0, sub = 0, disc = 0;
    B.pets.forEach(function (p, i) { var l = petLine(p); dur += l.dur; sub += l.price; if (i > 0) disc += Math.min(Number(settings.extra_pet_discount), l.price); });
    var trip = B.pets.length ? Number(settings.trip_fee) : 0;
    return { dur: dur, sub: sub, trip: trip, disc: disc, total: sub + trip - disc };
  }

  /* ---------- public landing ---------- */
  function landing() {
    killMap();
    U.chrome(false); document.body.classList.add("public-landing");
    U.setHeader("Aardvark", "Mobile pet grooming", null, "");
    U.view.innerHTML = '<div class="pl"><p class="muted pad center">Loading…</p></div>';
    loadBasics().then(function () {
      var groom = services.filter(function (s) { return !s.is_addon; });
      var extras = services.filter(function (s) { return s.is_addon; });
      U.view.innerHTML = '<div class="pl">' +
        '<header class="pl-nav"><span class="pl-brand"><img src="../assets/logo-nav.png" alt="Aardvark Pet Grooming Systems" width="75" height="90"></span>' +
        '<a class="pl-signin" href="#signin">Sign in</a></header>' +
        '<section class="pl-hero"><div class="pl-hero-copy">' +
          '<p class="pl-eyebrow">Mobile &amp; the Eastern Shore</p>' +
          "<h1>Grooming that comes to your driveway.</h1>" +
          "<p>One pet, one groomer, start to finish, in our quiet, climate-controlled salon on wheels. No crates, no waiting rooms, no strange dogs.</p>" +
          '<a class="btn pl-cta" href="#book">' + U.icon("today") + " Book a groom</a>" +
          '<p class="pl-small">See real-time openings near you · about 2 minutes</p></div>' +
          '<img class="pl-hero-logo" src="../assets/logo-tagline.png" alt="Aardvark Pet Grooming Systems — Better care. Smarter grooming." width="794" height="888"></section>' +
        '<section class="pl-section"><h2>How it works</h2><ol class="pl-steps">' +
          "<li><span>1</span><b>Tell us where</b><small>Type your address or use your phone's location. We check that we can reach you.</small></li>" +
          "<li><span>2</span><b>Pick your pets &amp; services</b><small>Prices and times shown up front: no surprises.</small></li>" +
          "<li><span>3</span><b>Choose a time that's really open</b><small>We only show times our groomer can actually drive to and finish.</small></li>" +
        "</ol></section>" +
        '<section class="pl-section"><h2>Services &amp; prices</h2><div class="pl-menu">' +
          groom.map(function (s) { return '<div class="pl-item"><div><b>' + esc(s.name) + "</b><small>" + esc(s.description || "") + '</small></div><span class="pl-price">' + money(s.price) + "<small>" + mins(s.duration_min) + "</small></span></div>"; }).join("") +
        "</div>" + (extras.length ? '<p class="pl-extras"><b>Add-ons:</b> ' + extras.map(function (s) { return esc(s.name) + " " + money(s.price); }).join(" · ") + "</p>" : "") +
        '<p class="pl-small">Plus a ' + money(settings.trip_fee) + " trip fee per visit · " + money(settings.extra_pet_discount) + " off each extra pet at the same address.</p></section>" +
        '<section class="pl-section pl-account"><div><h2>Make rebooking a 3-tap job</h2>' +
          "<p>Create a free account and we'll remember your address, gate code and every pet's details, so next time you just pick a time.</p>" +
          '<ul class="pl-ticks"><li>Saved address &amp; pets</li><li>See and cancel upcoming visits</li><li>Book again in seconds</li></ul></div>' +
          '<div class="pl-account-cta"><a class="btn" href="#join">Create a free account</a><a class="btn ghost" href="#book">Book as a guest</a></div></section>' +
        '<footer class="pl-foot"><a href="../">aardvarkgroom.com</a><span>·</span><a href="#signin">Staff sign in</a></footer>' +
      "</div>";
    }).catch(U.showError);
  }

  /* ---------- customer account creation ---------- */
  function join() {
    killMap(); document.body.classList.remove("public-landing");
    U.chrome(false);
    U.setHeader("Create account", "Save your details for faster booking", "welcome", "");
    U.view.innerHTML = '<section class="card login"><img src="../assets/mark.png" alt="" width="72" height="72"><h2>Create your account</h2>' +
      '<p class="muted">Save your address and pets so rebooking takes seconds.</p><form data-join>' +
      '<label>Your name<input name="name" required autocomplete="name" maxlength="80"></label>' +
      '<label>Mobile phone<input name="phone" type="tel" required autocomplete="tel" placeholder="(251) 555-0123"><small class="hint">We text on the day when we\'re on our way</small></label>' +
      '<label>Email<input type="email" name="email" required autocomplete="email"></label>' +
      '<label>Password<input type="password" name="password" required minlength="8" autocomplete="new-password"><small class="hint">At least 8 characters</small></label>' +
      '<button class="btn full" type="submit">Create account</button><p class="form-msg" role="status"></p></form>' +
      '<div class="login-links"><a class="linkish" href="#signin">Already have an account? Sign in</a><a class="linkish" href="#book">Book without an account</a></div></section>';
    var f = $("[data-join]"), out = $(".form-msg", f);
    f.onsubmit = function (e) {
      e.preventDefault();
      if (!f.checkValidity()) return f.reportValidity();
      var btn = $("button", f); btn.disabled = true; out.textContent = "Creating your account…";
      Api.signUpCustomer(f.name.value.trim(), f.email.value.trim(), f.password.value, f.phone.value.trim()).then(function (r) {
        if (r.signedIn) return U.start();
        U.view.innerHTML = '<section class="card login"><img src="../assets/mark.png" alt="" width="72" height="72"><h2>Check your email</h2>' +
          '<p class="muted">We sent a confirmation link to <b>' + esc(f.email.value.trim()) + "</b>. Tap it, then come back and sign in.</p>" +
          '<a class="btn full" href="#signin">Go to sign in</a><a class="btn ghost full" href="#book">Book now while you wait</a></section>';
      }).catch(function (err) { btn.disabled = false; out.textContent = err.message || "Couldn't create the account."; });
    };
  }

  /* ---------- booking flow ---------- */
  var STEPS = ["Address", "Pets", "Time", "Details", "Confirm"];

  function flow() {
    document.body.classList.remove("public-landing");
    U.chrome(Api.kind === "customer" || isStaff());
    U.setHeader(isStaff() ? "New booking" : "Book a groom", STEPS[B.step - 1] + " · step " + B.step + " of 5", "book-back", isStaff() ? "today" : "book");
    var back = document.querySelector("[data-back]");
    var home = isStaff() ? "#today" : Api.kind === "customer" ? "#home" : "#welcome";
    if (back && B.step > 1) back.onclick = function () { B.step--; flow(); };
    else if (back) back.onclick = function () { location.hash = home; };
    U.view.innerHTML = '<div class="bk"><p class="muted pad center">Loading…</p></div>';
    (isStaff() && !staffClients ? Api.staffClients().then(function (c) { staffClients = c; }) : Promise.resolve()).then(loadBasics).then(function () {
      if (Api.kind === "customer") prefillCustomer();
      killMap();
      var bar = '<div class="bk-progress">' + STEPS.map(function (s, i) { return '<i class="' + (i < B.step ? "on" : "") + '"></i>'; }).join("") + "</div>";
      U.view.innerHTML = '<div class="bk">' + bar + '<div class="bk-body"></div></div>';
      [stepAddress, stepPets, stepTime, stepDetails, stepConfirm][B.step - 1]($(".bk-body"));
    }).catch(U.showError);
  }
  function go(step) { B.step = step; flow(); window.scrollTo(0, 0); }

  function prefillCustomer() {
    var c = Api.client || {};
    if (!B.address && c.lat != null && c.lng != null) {
      B.address = { label: c.address || [c.street, c.city].filter(Boolean).join(", "), street: c.street, city: c.city, state: c.state, zip: c.zip, lat: c.lat, lng: c.lng };
      B.area = null;
    }
    if (!B.contact.name) B.contact = { name: c.name || "", phone: c.phone || "", email: c.email || (Api.user && Api.user.email) || "" };
  }

  function footer(label, enabled, onNext, note) {
    var t = totals();
    return '<div class="bk-foot"><div class="bk-sum">' + (B.pets.length && B.pets.every(function (p) { return p.service_id; })
        ? "<b>" + money(t.total) + "</b><small>" + mins(t.dur) + " · " + B.pets.length + " pet" + (B.pets.length > 1 ? "s" : "") + "</small>"
        : "<small>" + (note || "") + "</small>") +
      '</div><button class="btn" data-next' + (enabled ? "" : " disabled") + ">" + label + "</button></div>";
  }
  function bindNext(fn) { var b = $("[data-next]"); if (b) b.onclick = fn; }

  // Step 1 — where
  function clientPicker() {
    if (!isStaff()) return "";
    return '<section class="card picker"><p class="label" style="margin-top:0">Customer</p>' +
      (B.client ? '<div class="picked">' + U.avatar({ name: B.client.name }, 38) + "<div><b>" + esc(B.client.name) + "</b><small>" + esc(B.client.phone || "") + " · " + esc((B.client.address || "").split(",")[0]) +
        '</small></div><button type="button" class="linkish" data-unpick>Change</button></div>'
        : '<input class="search" data-csearch placeholder="Search existing customers by name or phone"><ul class="addr-list" data-cresults hidden></ul>' +
          '<p class="muted small">New customer? Just enter their address below; you\'ll add their details in step 4.</p>') + "</section>";
  }
  function bindClientPicker(el) {
    if (!isStaff()) return;
    var un = $("[data-unpick]", el);
    if (un) un.onclick = function () { B.client = null; B.address = null; B.area = null; B.pets = []; B.contact = { name: "", phone: "", email: "" }; B.sms = false; stepAddress(el); };
    var inp = $("[data-csearch]", el), out = $("[data-cresults]", el);
    if (!inp) return;
    inp.oninput = function () {
      var q = inp.value.trim().toLowerCase(), qd = q.replace(/\D/g, "");
      if (q.length < 2) { out.hidden = true; return; }
      var hits = (staffClients || []).filter(function (c) {
        return (c.name || "").toLowerCase().indexOf(q) > -1 || (qd.length >= 3 && (c.phone || "").replace(/\D/g, "").indexOf(qd) > -1) ||
          (c.pets || []).some(function (p) { return (p.name || "").toLowerCase().indexOf(q) > -1; });
      }).slice(0, 8);
      out.innerHTML = hits.map(function (c, i) {
        return '<li><button type="button" data-ci="' + i + '">' + U.icon("user") + "<span><b>" + esc(c.name) + "</b> · " + esc(c.phone || "") +
          '<br><small class="muted">' + esc((c.pets || []).map(function (p) { return p.name; }).join(", ")) + "</small></span></button></li>";
      }).join("") || '<li class="muted">No match. Treat as a new customer.</li>';
      out.hidden = false;
      $$("[data-ci]", out).forEach(function (b) {
        b.onclick = function () {
          var c = hits[+b.dataset.ci];
          B.client = c; B.contact = { name: c.name || "", phone: c.phone || "", email: c.email || "" }; B.sms = !!c.sms_opt_in; B.pets = []; B.slots = null;
          if (c.lat != null) { B.address = { label: c.address || [c.street, c.city].filter(Boolean).join(", "), street: c.street, city: c.city, state: c.state, zip: c.zip, lat: c.lat, lng: c.lng }; B.area = null; }
          stepAddress(el);
        };
      });
    };
  }

  function stepAddress(el) {
    el.innerHTML = clientPicker() + "<h2>" + (isStaff() ? "Visit address" : "Where should we park?") + "</h2><p class=\"muted\">We'll check you're in our service area and only offer times our van can reach.</p>" +
      '<div class="addr"><input class="search" data-addr type="text" inputmode="search" autocomplete="street-address" placeholder="Start typing your street address" value="' + esc(B.address ? B.address.label : "") + '">' +
      '<ul class="addr-list" data-sugg hidden></ul></div>' +
      '<button class="btn ghost full" data-gps>' + U.icon("nav") + " Use my current location</button>" +
      '<div class="addr-map" data-map hidden></div><p class="addr-note" data-area></p>' +
      '<p class="geo-credit">Address search by Photon · © OpenStreetMap contributors</p>' +
      footer("Continue", B.address && B.area && B.area.ok, null, "Step 1: your address");
    var input = $("[data-addr]"), list = $("[data-sugg]"), timer = null, lastQ = "";
    input.oninput = function () {
      clearTimeout(timer);
      var q = input.value;
      timer = setTimeout(function () {
        if (q === lastQ) return; lastQ = q;
        Geo.search(q).then(function (places) {
          if (input.value !== q) return;
          list.innerHTML = places.map(function (p, i) { return '<li><button type="button" data-i="' + i + '">' + U.icon("nav") + "<span>" + esc(p.label) + "</span></button></li>"; }).join("") ||
            (q.length >= 4 ? '<li class="muted">No matches yet. Keep typing, or use your location.</li>' : "");
          list.hidden = !list.innerHTML;
          $$("button", list).forEach(function (b) { b.onclick = function () { list.hidden = true; choose(places[+b.dataset.i], input.value); }; });
        }).catch(function () { list.innerHTML = '<li class="muted">Address search is unavailable. Use your location instead.</li>'; list.hidden = false; });
      }, 350);
    };
    $("[data-gps]").onclick = function () {
      var b = this; b.disabled = true; b.lastChild.textContent = " Finding you…";
      Geo.locate().then(function (pos) {
        return Geo.reverse(pos.lat, pos.lng).then(function (p) {
          choose(p || { label: "My location", lat: pos.lat, lng: pos.lng }, null);
        });
      }).catch(function (e) { U.toast(e.message); }).then(function () { b.disabled = false; b.lastChild.textContent = " Use my current location"; });
    };
    bindClientPicker(el);
    if (B.address) showPin();
    bindNext(function () { go(2); });

    function choose(place, typed) {
      // Keep the house number the customer typed if the map only knew the street
      if (typed && !place.exact && /^\d+\s/.test(typed.trim()) && !/^\d/.test(place.street || "")) {
        place.street = typed.trim().split(",")[0]; place.label = [place.street, place.city, [place.state, place.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      }
      B.address = place; B.area = null; B.slots = null; input.value = place.label;
      showPin();
    }
    function showPin() {
      var box = $("[data-map]"); box.hidden = false;
      killMap();
      map = L.map(box, { zoomControl: false, attributionControl: true }).setView([B.address.lat, B.address.lng], 17);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      var mk = L.marker([B.address.lat, B.address.lng], { draggable: true, icon: L.divIcon({ className: "pin home", html: U.icon("pets"), iconSize: [36, 36] }) }).addTo(map);
      mk.on("dragend", function () {
        var ll = mk.getLatLng(); B.address.lat = ll.lat; B.address.lng = ll.lng; B.area = null; B.slots = null; checkArea();
      });
      setTimeout(function () { if (map) map.invalidateSize(); }, 60);
      checkArea();
    }
    function checkArea() {
      var note = $("[data-area]"); note.className = "addr-note"; note.innerHTML = "Checking your distance from our van…";
      $("[data-next]").disabled = true;
      Api.checkArea(B.address.lat, B.address.lng).then(function (a) {
        B.area = a;
        if (a && a.ok) {
          note.classList.add("ok");
          note.innerHTML = U.icon("check") + "<span><b>We come to you!</b> " + a.miles + " miles from our base. Drag the pin onto your driveway if it isn't quite right.</span>";
          $("[data-next]").disabled = false;
        } else {
          note.classList.add("bad");
          note.innerHTML = "<span><b>We're not in your area yet</b> (" + (a ? a.miles : "?") + " miles away; we currently cover " + (a ? a.radius : 25) +
            ' miles). <a href="../#groomers">Join the waitlist</a> and we\'ll tell you when we expand.</span>';
        }
      }).catch(function (e) { note.classList.add("bad"); note.textContent = "Couldn't check the address: " + e.message; });
    }
  }

  // Step 2 — pets + services
  function stepPets(el) {
    var saved = (Api.kind === "customer" && Api.data && Api.data.pets) || (isStaff() && B.client && B.client.pets) || [];
    var html = "<h2>Who's getting pampered?</h2>";
    if (saved.length) {
      html += '<p class="muted">Your pets</p><div class="petpick">' + saved.map(function (p) {
        var on = B.pets.some(function (x) { return x.pet_id === p.id; });
        return '<button type="button" class="petchip' + (on ? " on" : "") + '" data-saved="' + p.id + '">' + U.avatar({ name: p.name, color: p.color }, 34) +
          "<span><b>" + esc(p.name) + "</b><small>" + esc(p.breed || p.species) + (p.weight_lbs ? " · " + Number(p.weight_lbs) + " lb" : "") + "</small></span>" + U.icon("check", "tick") + "</button>";
      }).join("") + "</div>";
    }
    html += B.pets.map(function (p, i) { return petCard(p, i); }).join("");
    html += B.pets.length < 4 ? '<button class="btn ghost full" data-addpet>+ Add ' + (B.pets.length || saved.length ? "another" : "a") + " pet</button>" : "";
    el.innerHTML = html + footer("Choose a time", B.pets.length && B.pets.every(function (p) { return p.service_id && p.name; }), null, "Add at least one pet");

    $$("[data-saved]").forEach(function (b) {
      b.onclick = function () {
        var p = saved.find(function (x) { return x.id === b.dataset.saved; });
        var idx = B.pets.findIndex(function (x) { return x.pet_id === p.id; });
        if (idx > -1) B.pets.splice(idx, 1);
        else if (B.pets.length < 4) {
          var np = { pet_id: p.id, name: p.name, species: p.species, breed: p.breed, weight: p.weight_lbs, coat: p.coat, addon_ids: [] };
          np.service_id = recommend(np); B.pets.push(np);
        }
        B.slots = null; stepPets(el);
      };
    });
    var add = $("[data-addpet]");
    if (add) add.onclick = function () { B.pets.push({ name: "", species: "Dog", breed: "", weight: "", coat: "", service_id: null, addon_ids: [], editing: true }); B.slots = null; stepPets(el); };
    B.pets.forEach(function (p, i) { bindPetCard(el, p, i); });
    bindNext(nextFromPets);
  }

  function petCard(p, i) {
    var form = p.pet_id ? '<div class="pet-head">' + U.avatar({ name: p.name }, 40) + "<div><b>" + esc(p.name) + "</b><small>" + esc(p.breed || p.species) + (p.weight ? " · " + p.weight + " lb" : "") + "</small></div></div>"
      : '<div class="pet-form"><div class="seg2"><button type="button" data-species="Dog" class="' + (p.species !== "Cat" ? "on" : "") + '">🐶 Dog</button><button type="button" data-species="Cat" class="' + (p.species === "Cat" ? "on" : "") + '">🐱 Cat</button></div>' +
        '<label>Name<input data-f="name" value="' + esc(p.name) + '" maxlength="60" placeholder="e.g. Biscuit"></label>' +
        '<div class="row2"><label>Breed<input data-f="breed" value="' + esc(p.breed) + '" maxlength="80" placeholder="e.g. Goldendoodle"></label>' +
        '<label>Weight (lb)<input data-f="weight" value="' + esc(p.weight) + '" inputmode="decimal" placeholder="e.g. 45"></label></div>' +
        '<label>Coat today<select data-f="coat">' + ["", "Well kept", "A little tangled", "Matted", "Heavy double coat"].map(function (c) { return "<option" + (p.coat === c ? " selected" : "") + ' value="' + c + '">' + (c || "Choose…") + "</option>"; }).join("") + "</select></label></div>";
    return '<section class="card petcard" data-pet="' + i + '">' + form + '<div class="svc-zone">' + svcZone(p, i) + "</div>" +
      '<button type="button" class="linkish danger" data-remove>Remove ' + esc(p.name || "this pet") + "</button></section>";
  }

  function svcZone(p, i) {
    var rec = recommend(p), list = mainServices(p.species || "Dog"), ex = addons(p.species || "Dog");
    return '<p class="label">Service' + (rec ? ' <span class="muted">· best fit for ' + (p.weight ? p.weight + " lb" : "this coat") + (/doodle/i.test(p.breed || "") ? " doodle" : "") + "</span>" : "") + "</p>" +
      '<div class="svc-list">' + list.map(function (s) {
        return '<label class="svc' + (p.service_id === s.id ? " on" : "") + '"><input type="radio" name="svc' + i + '" value="' + s.id + '"' + (p.service_id === s.id ? " checked" : "") + ">" +
          "<span><b>" + esc(s.name) + (s.id === rec ? ' <em class="rec">Best fit</em>' : "") + "</b><small>" + esc(s.description || "") + "</small></span>" +
          '<span class="svc-price">' + money(s.price) + "<small>" + mins(s.duration_min) + "</small></span></label>";
      }).join("") + "</div>" +
      (ex.length ? '<p class="label">Add-ons</p><div class="addons">' + ex.map(function (a) {
        var on = (p.addon_ids || []).indexOf(a.id) > -1;
        return '<button type="button" class="addon' + (on ? " on" : "") + '" data-addon="' + a.id + '">' + esc(a.name) + " <small>+" + money(a.price) + "</small></button>";
      }).join("") + "</div>" : "");
  }

  function bindPetCard(el, p, i) {
    var card = $('[data-pet="' + i + '"]', el);
    // Typing never redraws the form (so focus and text are never lost); only the service list refreshes
    $$("[data-f]", card).forEach(function (inp) {
      var f = inp.dataset.f;
      var timer = null;
      var apply = function () {
        clearTimeout(timer);
        if ((p[f] == null ? "" : String(p[f])) === inp.value.trim()) return; // nothing changed: don't redraw
        p[f] = inp.value.trim();
        if (f === "name") { var rm = $("[data-remove]", card); if (rm) rm.textContent = "Remove " + (p.name || "this pet"); return refreshFoot(); }
        var r = recommend(p);
        if (r && (!p.service_id || p.autoSvc)) { p.service_id = r; p.autoSvc = true; }
        B.slots = null; refreshZone();
      };
      // Update as they type (short pause), so the list is already current before they tap anything else
      inp.oninput = f === "name" ? apply : function () { clearTimeout(timer); timer = setTimeout(apply, 450); };
      inp.onchange = apply;
    });
    $$("[data-species]", card).forEach(function (b) {
      b.onclick = function () {
        p.species = b.dataset.species; p.service_id = recommend(p) || null; p.autoSvc = true; p.addon_ids = []; B.slots = null;
        $$("[data-species]", card).forEach(function (x) { x.classList.toggle("on", x === b); });
        refreshZone();
      };
    });
    var rm = $("[data-remove]", card);
    if (rm) rm.onclick = function () { B.pets.splice(i, 1); B.slots = null; var y = window.scrollY; stepPets(el); window.scrollTo(0, y); };
    bindZone();

    function bindZone() {
      $$("input[type=radio]", card).forEach(function (r) { r.onchange = function () { p.service_id = r.value; p.autoSvc = false; B.slots = null; refreshZone(); }; });
      $$("[data-addon]", card).forEach(function (b) {
        b.onclick = function () {
          var id = b.dataset.addon, k = p.addon_ids.indexOf(id);
          if (k > -1) p.addon_ids.splice(k, 1); else p.addon_ids.push(id);
          B.slots = null; refreshZone();
        };
      });
    }
    function refreshZone() { $(".svc-zone", card).innerHTML = svcZone(p, i); bindZone(); refreshFoot(); }
    function refreshFoot() {
      // Update the totals and button state in place; never replace the button (a tap may be landing on it)
      var ok = B.pets.length && B.pets.every(function (x) { return x.service_id && x.name; });
      var tmp = document.createElement("div"); tmp.innerHTML = footer("Choose a time", ok, null, "Add at least one pet");
      $(".bk-sum", el).innerHTML = $(".bk-sum", tmp).innerHTML;
      $("[data-next]", el).disabled = !ok;
    }
  }
  function nextFromPets() {
    if (B.pets.length && B.pets.every(function (p) { return p.name && p.service_id; })) go(3);
    else U.toast("Give each pet a name and choose a service.");
  }

  // Step 3 — time
  function stepTime(el) {
    var t = totals();
    var key = [B.address.lat, B.address.lng, t.dur].join("|");
    el.innerHTML = "<h2>Pick a time</h2><p class=\"muted\">Showing times our groomer can reach " + esc((B.address.street || B.address.label || "you").split(",")[0]) + " and finish your " + mins(t.dur) + " visit.</p>" +
      '<div data-times><p class="muted pad center">Finding open times…</p></div>' + footer("Continue", !!B.slot);
    var box = $("[data-times]");
    var load = B.slots && B.slotsKey === key ? Promise.resolve(B.slots) : Api.slots(B.address.lat, B.address.lng, t.dur);
    load.then(function (slots) {
      B.slots = slots; B.slotsKey = key;
      if (B.slot && !slots.some(function (s) { return +s === +B.slot; })) B.slot = null;
      if (!slots.length) {
        box.innerHTML = '<section class="card empty"><b>No openings in the next ' + settings.booking_window_days + " days for a " + mins(t.dur) + " visit.</b>" +
          "<p class=\"muted\">Try fewer pets or services per visit, or check back soon: new times open up as routes fill in.</p></section>";
        return;
      }
      var days = {}; slots.forEach(function (s) { var k = dayKey(s); (days[k] = days[k] || []).push(s); });
      var keys = Object.keys(days);
      if (!B.day || !days[B.day]) B.day = B.slot ? dayKey(B.slot) : keys[0];
      box.innerHTML = '<div class="days">' + keys.map(function (k) {
        var d = days[k][0];
        return '<button type="button" class="day' + (k === B.day ? " on" : "") + '" data-day="' + k + '"><small>' + fmt(d, { weekday: "short" }) + "</small><b>" + fmt(d, { day: "numeric" }) + "</b><small>" + fmt(d, { month: "short" }) + "</small><i>" + days[k].length + "</i></button>";
      }).join("") + "</div>" +
        '<p class="label">' + longDate(days[B.day][0]) + "</p>" +
        '<div class="times">' + days[B.day].map(function (s) {
          return '<button type="button" class="time' + (B.slot && +B.slot === +s ? " on" : "") + '" data-slot="' + s.toISOString() + '">' + timeLabel(s) + "</button>";
        }).join("") + "</div>" +
        '<p class="muted small">Arrival window: we\'ll text you when we\'re on our way. Times shown in Central Time.</p>';
      $$("[data-day]", box).forEach(function (b) { b.onclick = function () { B.day = b.dataset.day; stepTime(el); }; });
      $$("[data-slot]", box).forEach(function (b) { b.onclick = function () { B.slot = new Date(b.dataset.slot); stepTime(el); }; });
      var on = $(".day.on", box); if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "center" });
    }).catch(function (e) { box.innerHTML = '<section class="card empty"><b>Couldn\'t load times.</b><p class="muted">' + esc(e.message) + "</p></section>"; });
    bindNext(function () { if (B.slot) go(4); });
  }

  // Step 4 — details + account nudge
  function stepDetails(el) {
    var guest = Api.kind !== "customer" && !isStaff();
    el.innerHTML = "<h2>Your details</h2>" +
      '<form class="card form" data-details novalidate>' +
      '<label>Your name<input name="name" required autocomplete="name" maxlength="120" value="' + esc(B.contact.name) + '"></label>' +
      '<label>Mobile phone<input name="phone" type="tel" required autocomplete="tel" value="' + esc(B.contact.phone) + '" placeholder="(251) 555-0123"><small class="hint">We\'ll text when we\'re on our way</small></label>' +
      '<label>Email' + (isStaff() ? " (optional)" : "") + '<input name="email" type="email"' + (isStaff() ? "" : " required") + ' autocomplete="email" value="' + esc(B.contact.email) + '"' + (Api.kind === "customer" ? " readonly" : "") + '><small class="hint">' + (isStaff() ? "For the customer's confirmation" : "For your confirmation") + "</small></label>" +
      '<label class="check"><input type="checkbox" name="sms"' + (B.sms ? " checked" : "") + "> <span>" + (isStaff() ? "Customer agreed to get text updates about this visit" : "Text me appointment updates (confirmation, reminder, on-our-way). Msg &amp; data rates may apply; reply STOP to opt out.") + "</span></label>" +
      (isStaff() ? '<label class="check"><input type="checkbox" name="notify"' + (B.notifyCustomer ? " checked" : "") + "> <span>Send the customer a confirmation</span></label>" : "") +
      '<label>Anything we should know?<textarea name="notes" rows="3" maxlength="500" placeholder="Gate code, where to park, pet nerves, matting…">' + esc(B.notes) + "</textarea></label></form>" +
      (guest ? '<section class="card nudge"><label class="nudge-head"><input type="checkbox" data-save' + (B.save ? " checked" : "") + '><span><b>Save my details for next time</b>' +
        "<small>Create a free account. Your address, gate code and pets are saved, so rebooking takes 3 taps.</small></span></label>" +
        '<label class="nudge-pw"' + (B.save ? "" : " hidden") + '>Choose a password<input type="password" data-pw minlength="8" autocomplete="new-password" value="' + esc(B.password) + '"><small class="hint">At least 8 characters</small></label>' +
        '<p class="muted small">Already have an account? <a href="#signin" data-signin>Sign in</a>: your booking so far is kept.</p></section>' : "") +
      footer("Review booking", true);
    var f = $("[data-details]");
    function collect() {
      B.contact = { name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim() };
      B.notes = f.notes.value.trim();
      B.sms = f.sms.checked;
      if (f.notify) B.notifyCustomer = f.notify.checked;
      if (guest) { B.save = $("[data-save]").checked; B.password = $("[data-pw]").value; }
    }
    if (guest) {
      $("[data-save]").onchange = function () { $(".nudge-pw").hidden = !this.checked; };
      $("[data-signin]").onclick = function () { collect(); };
    }
    bindNext(function () {
      collect();
      var bad = !B.contact.name ? "Please enter your name." : B.contact.phone.replace(/\D/g, "").length < 10 ? "Please enter a 10-digit mobile number." :
        (B.contact.email || !isStaff()) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(B.contact.email) ? "Please enter a valid email." :
        guest && B.save && B.password.length < 8 ? "Choose a password of at least 8 characters, or untick “Save my details”." : "";
      if (bad) return U.toast(bad);
      go(5);
    });
  }

  // Step 5 — confirm
  function stepConfirm(el) {
    var t = totals();
    el.innerHTML = "<h2>Review &amp; book</h2>" +
      '<section class="card review"><div class="rv-when">' + U.icon("today") + "<div><b>" + longDate(B.slot) + "</b><span>" + timeLabel(B.slot) + " – " + timeLabel(new Date(+B.slot + t.dur * 60000)) + "</span></div></div>" +
      '<div class="rv-when">' + U.icon("nav") + "<div><b>" + esc((B.address.label || "").split(",")[0]) + "</b><span>" + esc((B.address.label || "").split(",").slice(1).join(",").trim()) + "</span></div></div>" +
      '<div class="rv-when">' + U.icon("phone") + "<div><b>" + esc(B.contact.name) + "</b><span>" + esc(B.contact.phone) + " · " + esc(B.contact.email) + "</span></div></div></section>" +
      '<section class="card"><table class="bill">' + B.pets.map(function (p, i) {
        var l = petLine(p);
        return "<tr><td><b>" + esc(p.name) + "</b><small>" + esc(l.label) + "</small></td><td>" + money(l.price) + "</td></tr>";
      }).join("") +
      "<tr><td>Trip fee</td><td>" + money(t.trip) + "</td></tr>" +
      (t.disc ? "<tr><td>Multi-pet savings</td><td>−" + money(t.disc) + "</td></tr>" : "") +
      '<tr class="tot"><td>Total</td><td>' + money(t.total) + "</td></tr></table>" +
      '<p class="muted small">Nothing to pay now. Free cancellation up to ' + settings.min_cancel_hours + " hours before.</p></section>" +
      (B.notes ? '<section class="card"><p class="label">Notes for the groomer</p><p>' + esc(B.notes) + "</p></section>" : "") +
      '<p class="form-msg" data-err role="alert"></p>' +
      footer("Book for " + money(t.total), true);
    bindNext(function () {
      var btn = $("[data-next]"); btn.disabled = true; btn.textContent = "Booking…";
      var payload = {
        starts_at: B.slot.toISOString(), contact: B.contact, notes: B.notes, save_details: true, sms_opt_in: B.sms,
        notify_customer: isStaff() ? B.notifyCustomer : true,
        address: { label: B.address.label, street: B.address.street, city: B.address.city, state: B.address.state, zip: B.address.zip, lat: B.address.lat, lng: B.address.lng },
        pets: B.pets.map(function (p) {
          var o = { service_id: p.service_id, addon_ids: p.addon_ids || [] };
          if (p.pet_id) o.pet_id = p.pet_id; else Object.assign(o, { name: p.name, species: p.species, breed: p.breed, weight: p.weight, coat: p.coat });
          return o;
        })
      };
      if (isStaff() && B.client) payload.client_id = B.client.id;
      Api.book(payload).then(function (res) {
        B.result = { res: res, slot: B.slot, total: t.total, dur: t.dur, pets: B.pets.map(function (p) { return p.name; }), address: B.address.label, account: null };
        if (!isStaff() && Api.kind !== "customer" && B.save && B.password.length >= 8) {
          return Api.signUpCustomer(B.contact.name, B.contact.email, B.password, B.contact.phone)
            .then(function (r) { B.result.account = r.signedIn ? "signed-in" : "confirm"; })
            .catch(function (e) { B.result.account = "error:" + e.message; });
        }
      }).then(function () { if (B.result) success(); })
        .catch(function (e) {
          btn.disabled = false; btn.textContent = "Book for " + money(t.total);
          $("[data-err]").textContent = e.message;
          if (/taken|available/i.test(e.message)) { B.slot = null; B.slots = null; setTimeout(function () { go(3); }, 1800); }
        });
    });
  }

  function icsFile(r) {
    function z(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
    var end = new Date(+r.slot + r.dur * 60000);
    var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Aardvark//Booking//EN", "BEGIN:VEVENT",
      "UID:" + (r.res && r.res.booking_id || Date.now()) + "@aardvarkgroom.com", "DTSTAMP:" + z(new Date()),
      "DTSTART:" + z(r.slot), "DTEND:" + z(end), "SUMMARY:Aardvark grooming: " + r.pets.join(", "),
      "LOCATION:" + String(r.address || "").replace(/,/g, "\\,"), "DESCRIPTION:Mobile grooming visit. We'll text when we're on our way.",
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
  }

  function success() {
    var r = B.result;
    U.setHeader(isStaff() ? "Booked" : "You're booked!", "", null, isStaff() ? "today" : "book");
    var acct = r.account === "confirm" ? '<section class="card nudge"><b>One more step for your account</b><p class="muted small">We emailed a confirmation link to ' + esc(B.contact.email) + ". Tap it, then sign in; this booking will be waiting in your account.</p></section>"
      : r.account && r.account.indexOf("error:") === 0 ? '<section class="card nudge"><b>Your booking is confirmed</b><p class="muted small">We couldn\'t create your account (' + esc(r.account.slice(6)) + '). You can <a href="#join">try again</a> any time.</p></section>'
      : isStaff() ? ""
      : Api.kind !== "customer" ? '<section class="card nudge"><b>Want faster rebooking?</b><p class="muted small">Create a free account with ' + esc(B.contact.email) + ' and this booking will be saved to it.</p><a class="btn ghost full" href="#join">Create account</a></section>' : "";
    U.view.innerHTML = '<div class="bk done"><div class="done-badge">' + U.icon("check") + "</div><h2>" + (isStaff() ? "Booked for " + esc(B.contact.name || "the customer") : "See you " + fmt(r.slot, { weekday: "long" }) + "!") + "</h2>" +
      '<section class="card review"><div class="rv-when">' + U.icon("today") + "<div><b>" + longDate(r.slot) + "</b><span>" + timeLabel(r.slot) + " · " + mins(r.dur) + "</span></div></div>" +
      '<div class="rv-when">' + U.icon("nav") + "<div><b>" + esc(String(r.address || "").split(",")[0]) + "</b><span>" + esc(r.pets.join(", ")) + " · " + money(r.total) + "</span></div></div></section>" +
      '<a class="btn ghost full" download="aardvark-groom.ics" href="' + icsFile(r) + '">' + U.icon("today") + " Add to calendar</a>" + acct +
      '<a class="btn full" href="' + (isStaff() ? "#today" : Api.kind === "customer" ? "#home" : "#welcome") + '" data-done>Done</a></div>';
    if (isStaff()) $("[data-done]").onclick = function (e) { e.preventDefault(); staffClients = null; U.start(); location.hash = "#today"; };
    B = { step: 1, address: isStaff() ? null : B.address, area: null, pets: [], slot: null, day: null, slots: null, slotsKey: "",
          contact: isStaff() ? { name: "", phone: "", email: "" } : B.contact, notes: "", save: true, password: "", result: null, client: null, sms: false, notifyCustomer: true };
    if (Api.kind === "customer") Api.load().catch(function () {});
  }

  /* ---------- customer portal ---------- */
  function upcoming() { var now = new Date(); return (Api.data.bookings || []).filter(function (b) { return b.end > now && b.status !== "Cancelled"; }); }

  function home() {
    killMap(); document.body.classList.remove("public-landing");
    U.chrome(true);
    U.setHeader("Hi " + firstName(Api.client && Api.client.name), "Your grooming visits", null, "home");
    loadBasics().then(function () {
      var up = upcoming(), now = new Date();
      var past = (Api.data.bookings || []).filter(function (b) { return b.end <= now && b.status !== "Cancelled"; }).reverse().slice(0, 5);
      U.view.innerHTML =
        '<a class="card book-cta" href="#book"><div><b>Book a groom</b><small>Your address and pets are saved</small></div>' + U.icon("chev", "chev") + "</a>" +
        '<section class="card"><div class="card-head"><h2>Upcoming</h2></div>' + (up.length ? up.map(bookingRow).join("") : '<p class="muted">No visits booked yet.</p>') + "</section>" +
        (past.length ? '<section class="card"><div class="card-head"><h2>Past visits</h2></div>' + past.map(function (b) { return bookingRow(b, true); }).join("") + "</section>" : "");
      $$("[data-cancel]").forEach(function (btn) {
        btn.onclick = function () {
          if (!confirm("Cancel this visit?")) return;
          btn.disabled = true;
          Api.cancelBooking(btn.dataset.cancel).then(function () { U.toast("Visit cancelled."); return Api.load(); }).then(home)
            .catch(function (e) { btn.disabled = false; U.toast(e.message); });
        };
      });
      $$("[data-again]").forEach(function (btn) {
        btn.onclick = function () {
          var b = Api.data.bookings[+btn.dataset.again];
          B.pets = []; B.slot = null; B.slots = null; B.step = 1;
          b.items.forEach(function (it) {
            var p = Api.data.pets.find(function (x) { return x.name === it.pet; });
            if (p) { var np = { pet_id: p.id, name: p.name, species: p.species, breed: p.breed, weight: p.weight_lbs, coat: p.coat, addon_ids: [] }; np.service_id = recommend(np); B.pets.push(np); }
          });
          location.hash = "#book";
        };
      });
    }).catch(U.showError);
  }

  function bookingRow(b, past) {
    var hrs = (b.start - new Date()) / 36e5, canCancel = !past && b.online && b.id && hrs >= settings.min_cancel_hours;
    var idx = Api.data.bookings.indexOf(b);
    return '<div class="visit"><div class="visit-date"><small>' + fmt(b.start, { weekday: "short" }) + "</small><b>" + fmt(b.start, { day: "numeric" }) + "</b><small>" + fmt(b.start, { month: "short" }) + "</small></div>" +
      '<div class="visit-body"><b>' + timeLabel(b.start) + " · " + esc(b.items.map(function (i) { return i.pet; }).join(", ")) + "</b><small>" +
      esc(b.items.map(function (i) { return i.service; }).join(" · ")) + "</small><small>" + esc((b.address || "").split(",")[0]) + " · " + money(b.total) + "</small>" +
      '<div class="visit-actions">' + (canCancel ? '<button class="pill ghost" data-cancel="' + b.id + '">Cancel</button>' : "") +
      (!past && !canCancel ? '<span class="muted small">To change this visit, text or call us.</span>' : "") +
      (past ? '<button class="pill" data-again="' + idx + '">Book again</button>' : "") + "</div></div></div>";
  }

  function myPets() {
    killMap(); U.chrome(true);
    U.setHeader("My pets", "Saved for faster booking", null, "mypets");
    var pets = Api.data.pets || [];
    U.view.innerHTML = (pets.length ? pets.map(function (p) {
      return '<form class="card petedit" data-id="' + p.id + '"><div class="pet-head">' + U.avatar({ name: p.name, color: p.color }, 44) + "<div><b>" + esc(p.name) + "</b><small>" + esc(p.species) + "</small></div></div>" +
        '<div class="row2"><label>Name<input name="name" value="' + esc(p.name) + '" maxlength="60"></label><label>Breed<input name="breed" value="' + esc(p.breed || "") + '" maxlength="80"></label></div>' +
        '<div class="row2"><label>Weight (lb)<input name="weight" inputmode="decimal" value="' + (p.weight_lbs != null ? Number(p.weight_lbs) : "") + '"></label>' +
        '<label>Coat<input name="coat" value="' + esc(p.coat || "") + '" maxlength="60"></label></div><button class="btn ghost full" type="submit">Save</button></form>';
    }).join("") : '<section class="card"><p class="muted">Pets you book are saved here automatically.</p></section>') +
      '<a class="btn full" href="#book">Book a groom</a>';
    $$("form.petedit").forEach(function (f) {
      f.onsubmit = function (e) {
        e.preventDefault();
        var w = parseFloat(f.weight.value);
        Api.updateMyPet(f.dataset.id, { name: f.name.value.trim() || undefined, breed: f.breed.value.trim(), weight_lbs: isNaN(w) ? null : w, coat: f.coat.value.trim() })
          .then(function () { U.toast("Saved."); return Api.load(); }).then(myPets).catch(function (err) { U.toast(err.message); });
      };
    });
  }

  function account() {
    killMap(); U.chrome(true);
    U.setHeader("Account", Api.user && Api.user.email || "", null, "account");
    var c = Api.client || {};
    U.view.innerHTML = '<form class="card form" data-acct><h2>Your details</h2>' +
      '<label>Name<input name="name" value="' + esc(c.name || "") + '" maxlength="120"></label>' +
      '<label>Mobile phone<input name="phone" type="tel" value="' + esc(c.phone || "") + '"></label>' +
      '<label>Email<input value="' + esc(c.email || (Api.user && Api.user.email) || "") + '" readonly></label>' +
      '<button class="btn ghost full" type="submit">Save</button></form>' +
      '<section class="card"><h2>Saved address</h2><p>' + esc(c.address || "No address yet. It's saved when you book.") + '</p><p class="muted small">To change it, start a new booking and pick the new address.</p></section>' +
      '<button class="btn ghost full" data-out>Sign out</button>';
    $("[data-acct]").onsubmit = function (e) {
      e.preventDefault();
      Api.updateMyClient({ name: this.name.value.trim(), phone: this.phone.value.trim() }).then(function () { U.toast("Saved."); account(); }).catch(function (err) { U.toast(err.message); });
    };
    $("[data-out]").onclick = function () { Api.signOut().then(function () { location.hash = "#welcome"; U.toPublic(); }); };
  }

  window.Book = {
    init: function (ui) { U = ui; },
    hasDraft: function () { return B.pets.length > 0 || B.step > 1; },
    staffFlow: function (fresh) {
      if (fresh) B = { step: 1, address: null, area: null, pets: [], slot: null, day: null, slots: null, slotsKey: "", contact: { name: "", phone: "", email: "" }, notes: "", save: false, password: "", result: null, client: null, sms: false, notifyCustomer: true };
      staffClients = fresh ? null : staffClients;
      flow();
    },
    reset: function () { B.step = 1; B.slot = null; B.slots = null; },
    routePublic: function (h) {
      switch (h[0]) {
        case "book": return flow();
        case "join": return join();
        case "signin": document.body.classList.remove("public-landing"); killMap(); return U.showLogin();
        case "staffjoin": document.body.classList.remove("public-landing"); killMap(); return U.showSignup();
        default: return landing();
      }
    },
    routeCustomer: function (h) {
      switch (h[0]) {
        case "book": return flow();
        case "mypets": return myPets();
        case "account": return account();
        default: return home();
      }
    }
  };
})();
