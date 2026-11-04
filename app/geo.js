/* Aardvark location helpers: address search, phone GPS, distances and road routes.
   Uses free OpenStreetMap services by default (Photon for address search, OSRM for
   driving routes). To switch providers later (Mapbox, Google…), change only this
   file or set geocodeUrl / reverseUrl / routeUrl in config.js. */
(function () {
  "use strict";
  var cfg = window.AARDVARK_CONFIG || {};
  var GEOCODE = cfg.geocodeUrl || "https://photon.komoot.io/api/";
  var REVERSE = cfg.reverseUrl || "https://photon.komoot.io/reverse";
  var ROUTE = cfg.routeUrl || "https://router.project-osrm.org/route/v1/driving/";
  // Bias searches to the Mobile Bay area
  var CENTER = { lat: 30.6954, lng: -88.0399 };
  var BBOX = "-88.6,30.2,-87.4,31.2";

  function toPlace(f) {
    var p = f.properties || {}, c = f.geometry && f.geometry.coordinates;
    if (!c) return null;
    var street = [p.housenumber, p.street || (p.housenumber ? "" : p.name)].filter(Boolean).join(" ").trim();
    var city = p.city || p.town || p.village || p.district || p.county || "";
    var state = p.state === "Alabama" ? "AL" : p.state === "Florida" ? "FL" : p.state === "Mississippi" ? "MS" : p.state === "Louisiana" ? "LA" : (p.state || "");
    var first = street || p.name || "";
    var label = [first, city, [state, p.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    return { label: label, street: street || p.name || "", city: city, state: state, zip: p.postcode || "",
             lat: c[1], lng: c[0], exact: !!p.housenumber, country: p.countrycode };
  }

  var Geo = {
    center: CENTER,

    // Address suggestions as the customer types
    search: function (q) {
      if (!q || q.trim().length < 4) return Promise.resolve([]);
      var url = GEOCODE + "?limit=6&lang=en&lat=" + CENTER.lat + "&lon=" + CENTER.lng + "&bbox=" + BBOX + "&q=" + encodeURIComponent(q.trim());
      return fetch(url).then(function (r) { if (!r.ok) throw new Error("search " + r.status); return r.json(); })
        .then(function (j) {
          return (j.features || []).map(toPlace).filter(function (p) { return p && (!p.country || p.country === "US"); });
        });
    },

    // Address for a GPS point (after "Use my location" or dragging the pin)
    reverse: function (lat, lng) {
      return fetch(REVERSE + "?lat=" + lat + "&lon=" + lng + "&lang=en")
        .then(function (r) { if (!r.ok) throw new Error("reverse " + r.status); return r.json(); })
        .then(function (j) { var p = j.features && j.features[0] && toPlace(j.features[0]); if (p) { p.lat = lat; p.lng = lng; } return p; })
        .catch(function () { return null; });
    },

    // The phone's GPS
    locate: function () {
      return new Promise(function (resolve, reject) {
        if (!navigator.geolocation) return reject(new Error("Location isn't available on this device."));
        navigator.geolocation.getCurrentPosition(function (pos) {
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        }, function (err) {
          reject(new Error(err.code === 1 ? "Location permission was declined. You can type your address instead." : "Couldn't get your location. Please type your address."));
        }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
      });
    },

    // Straight-line GPS distance in miles
    miles: function (a, b) {
      var R = 3958.8, toR = Math.PI / 180;
      var dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
      var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return 2 * R * Math.asin(Math.sqrt(h));
    },

    // Driving route through points [{lat,lng}…] → { legs:[{minutes,miles}], line:[[lat,lng]…], minutes, miles }
    route: function (points) {
      var pts = points.filter(function (p) { return p && p.lat != null && p.lng != null; });
      if (pts.length < 2) return Promise.resolve(null);
      var coords = pts.map(function (p) { return (+p.lng).toFixed(6) + "," + (+p.lat).toFixed(6); }).join(";");
      return fetch(ROUTE + coords + "?overview=full&geometries=geojson&steps=false")
        .then(function (r) { if (!r.ok) throw new Error("route " + r.status); return r.json(); })
        .then(function (j) {
          var rt = j.routes && j.routes[0];
          if (!rt) return null;
          return {
            minutes: Math.round(rt.duration / 60), miles: +(rt.distance / 1609.34).toFixed(1),
            legs: rt.legs.map(function (l) { return { minutes: Math.round(l.duration / 60), miles: +(l.distance / 1609.34).toFixed(1) }; }),
            line: rt.geometry.coordinates.map(function (c) { return [c[1], c[0]]; })
          };
        }).catch(function () { return null; });
    }
  };
  window.Geo = Geo;
})();
