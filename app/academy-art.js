/* Aardvark Academy artwork.
   Maps courses and modules to the illustrations in assets/academy/.
   Works for demo and live data: matches by course id first, then by
   keywords in the title, so courses the owner adds later still get a picture. */
(function () {
  var BASE = "../assets/academy/";

  var COURSES = {
    skin:   { badge: "badge-skin",    hero: "skin-labcoat",  phase: 1,
              modules: ["skin-anatomy", "badge-skin-check", "badge-skin-dryer", "skin-labcoat"] },
    bath:   { badge: "badge-bath",    hero: "bath-tub",      phase: 1,
              modules: ["bath-sink", "badge-bath", "badge-blowout"] },
    feline: { badge: "badge-feline",  hero: "cat-brushing",  phase: 1,
              modules: ["badge-feline", "badge-cat-wrap", "cat-nails", "badge-sanitary", "cat-harness"] },
    comms:  { badge: "badge-comms",   hero: "client-desk",   phase: 1,
              modules: ["badge-desk-phone", "client-calls"] },
    tools:  { badge: "badge-tools",   hero: "theory-quiz",   phase: 1,
              modules: ["badge-tool-blades", "badge-tools", "theory-book", "theory-quiz"] },
    shadow: { badge: "badge-nails",   hero: "shadow-table",  phase: 2,
              modules: ["shadow-mentor", "badge-nails", "badge-sanitary", "badge-blowout"] }
  };

  // Keyword fallbacks, checked in order against course and module titles.
  var KEYWORDS = [
    [/cat|feline|kitten/i, "badge-feline"],
    [/towel|wrap|handl/i, "badge-cat-wrap"],
    [/nail|grind|dremel/i, "badge-nails"],
    [/sanitary|lion cut|poodle|trim/i, "badge-sanitary"],
    [/dry|blow/i, "badge-blowout"],
    [/bath|shampoo|rinse|water/i, "bath-sink"],
    [/skin|coat|parasite|flea|tick|hot spot|vet/i, "badge-skin-check"],
    [/blade|clipper|scissor|shear|tool|mechanic/i, "badge-tool-blades"],
    [/client|customer|phone|call|doorstep|script|talk|communicat/i, "client-calls"],
    [/shadow|mentor|practic|shelter|table/i, "shadow-table"],
    [/quiz|theory|test|exam/i, "theory-quiz"],
    [/read|book|study|intro|basics/i, "theory-book"]
  ];

  function src(name) { return name ? BASE + name + ".webp" : null; }
  function byKeyword(title, fallback) {
    for (var i = 0; i < KEYWORDS.length; i++) if (KEYWORDS[i][0].test(title || "")) return KEYWORDS[i][1];
    return fallback;
  }

  window.AcademyArt = {
    mascot: src("mascot-thumbs"),
    phaseArt: { 1: src("theory-quiz"), 2: src("shadow-table") },
    course: function (c) {
      var m = COURSES[c.id] || {};
      var badge = m.badge || byKeyword(c.title, "theory-book");
      return { badge: src(badge), hero: src(m.hero || badge), phase: c.phase || m.phase || 1 };
    },
    module: function (c, mod, i) {
      var m = COURSES[c.id];
      return src((m && m.modules[i]) || byKeyword(mod.title, (m && m.badge) || byKeyword(c.title, "theory-book")));
    }
  };
})();
