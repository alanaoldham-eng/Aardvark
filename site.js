// Aardvark marketing site
(function () {
  // Waitlist sign-ups go straight into the Supabase "waitlist" table once
  // config.js has the Supabase URL + publishable key. No library needed.
  var CFG = window.AARDVARK_CONFIG || {};
  var LIVE = !!(CFG.supabaseUrl && CFG.supabaseKey);

  document.getElementById("yr").textContent = new Date().getFullYear();

  // Render the laptop preview at desktop size, then scale it to fit
  var vp = document.querySelector("[data-scale-frame]");
  if (vp) {
    var fit = function () { vp.firstElementChild.style.transform = "scale(" + vp.clientWidth / 1280 + ")"; };
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(vp); else window.addEventListener("resize", fit);
  }

  // Phone previews render at iPhone width, scaled into the frames
  document.querySelectorAll("[data-scale-phone]").forEach(function (box) {
    var fitP = function () { box.firstElementChild.style.transform = "scale(" + box.clientWidth / 390 + ")"; box.firstElementChild.style.height = (box.clientHeight / (box.clientWidth / 390)) + "px"; };
    fitP();
    if (window.ResizeObserver) new ResizeObserver(fitP).observe(box);
  });

  // Mobile nav
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  toggle.addEventListener("click", function () {
    var open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
  });
  links.addEventListener("click", function (e) {
    if (e.target.tagName === "A") links.classList.remove("open");
  });

  // QR code that always points at the app on whatever domain the site is served from
  var appUrl = new URL("app/", location.href).href;
  try {
    var qr = qrcode(0, "H"); // high error correction so the center logo badge doesn't break scanning
    qr.addData(appUrl);
    qr.make();
    var box = document.getElementById("qr");
    box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true })
      .replace(/fill="black"/g, 'fill="#0f4a3c"');
    var badge = document.createElement("img");
    badge.src = "assets/mark.png";
    badge.alt = "";
    badge.className = "qr-badge";
    box.appendChild(badge);
    box.title = appUrl;
  } catch (err) {
    console.warn("QR generation failed", err);
  }

  document.getElementById("copy-link").addEventListener("click", function (e) {
    var btn = e.currentTarget;
    var done = function () { btn.textContent = "Link copied ✓"; setTimeout(function () { btn.textContent = "Copy app link"; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(appUrl).then(done, function () { prompt("Copy this link:", appUrl); });
    else prompt("Copy this link:", appUrl);
  });

  // Waitlist
  var form = document.getElementById("waitlist");
  var msg = form.querySelector(".form-msg");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    msg.className = "form-msg";
    var data = Object.fromEntries(new FormData(form).entries());
    data.name = (data.name || "").trim(); data.contact = (data.contact || "").trim();
    if (!data.name || !data.contact || !/^\d{5}$/.test(data.zip || "")) {
      msg.textContent = "Please add your name, a way to reach you, and a 5-digit ZIP.";
      msg.classList.add("err");
      return;
    }
    if (!LIVE) {
      msg.textContent = "Preview mode — the waitlist isn't connected yet, so this wasn't sent.";
      msg.classList.add("err");
      return;
    }
    msg.textContent = "Sending…";
    var row = {
      name: data.name, zip: data.zip, contact: data.contact,
      breed: data.breed || null, weight: data.weight || null, coat: data.coat || null,
      groomer_interest: !!data.groomer, source: location.hostname
    };
    fetch(CFG.supabaseUrl.replace(/\/$/, "") + "/rest/v1/waitlist", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json", apikey: CFG.supabaseKey, Prefer: "return=minimal" },
        /^eyJ/.test(CFG.supabaseKey) ? { Authorization: "Bearer " + CFG.supabaseKey } : {}), // legacy anon JWT keys
      body: JSON.stringify(row)
    }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      form.reset();
      msg.textContent = "You're on the list! We'll be in touch when a route opens near " + data.zip + ".";
    }).catch(function () {
      msg.textContent = "Something went wrong — please try again.";
      msg.classList.add("err");
    });
  });
})();
