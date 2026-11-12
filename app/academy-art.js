/* Aardvark Academy artwork.
   Maps courses and modules to the illustrations in assets/academy/.
   Works for demo and live data: matches by course id first, then by
   keywords in the title, so courses the owner adds later still get a picture. */
(function () {
  var BASE = "../assets/academy/";

  var COURSES = {
    // "photo-…" entries are real photographs; the rest are illustrations
    skin:   { badge: "badge-skin",    hero: "photo-dematting",  phase: 1,
              modules: ["skin-anatomy", "badge-skin-check", "photo-matting", "skin-labcoat"] },
    bath:   { badge: "badge-bath",    hero: "photo-bathing",    phase: 1,
              modules: ["photo-rinse", "badge-bath", "photo-drying"] },
    feline: { badge: "badge-feline",  hero: "cat-brushing",     phase: 1,
              modules: ["badge-feline", "badge-cat-wrap", "cat-nails", "badge-sanitary", "cat-harness"] },
    comms:  { badge: "badge-comms",   hero: "photo-doorstep",   phase: 1,
              modules: ["photo-porch", "client-calls"] },
    tools:  { badge: "badge-tools",   hero: "photo-sanitation", phase: 1,
              modules: ["photo-clippers", "photo-scissoring", "theory-book", "theory-quiz"] },
    shadow: { badge: "badge-nails",   hero: "photo-mentor",     phase: 2,
              modules: ["photo-shadowing", "photo-nails", "badge-sanitary", "photo-blowout"] }
  };

  // Keyword fallbacks, checked in order against course and module titles.
  var KEYWORDS = [
    [/cat|feline|kitten/i, "badge-feline"],
    [/towel|wrap/i, "badge-cat-wrap"],
    [/safe|handl|restrain/i, "photo-safety"],
    [/nail|paw|grind|dremel/i, "photo-nails"],
    [/sanitary|lion cut/i, "badge-sanitary"],
    [/doodle|teddy/i, "photo-doodle"],
    [/schnauzer|terrier|beard/i, "photo-schnauzer"],
    [/poodle|scissor|shear|topknot/i, "photo-scissoring"],
    [/dry|blow/i, "photo-drying"],
    [/bath|shampoo|rinse|water/i, "photo-bathing"],
    [/mat|tangle|brush/i, "photo-matting"],
    [/ear|eye/i, "photo-ears-eyes"],
    [/senior|anxious|nervous|fear/i, "photo-anxious"],
    [/van|setup|tank|generator/i, "photo-van-ops"],
    [/route|business|schedule/i, "photo-route"],
    [/skin|coat|parasite|flea|tick|hot spot|vet/i, "badge-skin-check"],
    [/blade|clipper|tool|mechanic|sanitat|disinfect/i, "photo-clippers"],
    [/client|customer|doorstep|porch|script|talk|communicat/i, "photo-doorstep"],
    [/phone|call/i, "client-calls"],
    [/shadow|mentor|practic|shelter|table/i, "photo-shadowing"],
    [/quiz|theory|test|exam/i, "theory-quiz"],
    [/read|book|study|intro|basics/i, "theory-book"]
  ];

  function src(name) { return name ? BASE + name + ".webp" : null; }
  // Module thumbnails: photos use a small square crop
  function thumb(name) { return name ? BASE + name + (/^photo-/.test(name) ? "-sq" : "") + ".webp" : null; }
  function byKeyword(title, fallback) {
    for (var i = 0; i < KEYWORDS.length; i++) if (KEYWORDS[i][0].test(title || "")) return KEYWORDS[i][1];
    return fallback;
  }

  window.AcademyArt = {
    mascot: src("mascot-thumbs"),
    banner: src("photo-hero"),
    graduate: src("photo-graduate"),
    phaseArt: { 1: src("photo-online"), 2: src("photo-practicum") },
    course: function (c) {
      var m = COURSES[c.id] || {};
      var badge = m.badge || byKeyword(c.title, "theory-book");
      var hero = m.hero || byKeyword(c.title, badge);
      return { badge: src(badge), hero: src(hero), heroIsPhoto: /^photo-/.test(hero), phase: c.phase || m.phase || 1 };
    },
    module: function (c, mod, i) {
      var m = COURSES[c.id];
      return thumb((m && m.modules[i]) || byKeyword(mod.title, (m && m.badge) || byKeyword(c.title, "theory-book")));
    }
  };
})();
