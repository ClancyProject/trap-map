/* Mitten crab trap map - Leaflet app. Data comes from data/traps.js (var TRAPS). */
(function () {
  "use strict";

  var CAT = {            // colourblind-safe (Okabe-Ito) colours + one shape per category
    "Fixed":   { color: "#0072B2", shape: "circle",   label: "Fixed trap" },
    "Mobile":  { color: "#E69F00", shape: "triangle", label: "Mobile trap" },
    "Condo":   { color: "#CC79A7", shape: "square",   label: "Condo trap" },
    "Unknown": { color: "#6b6b6b", shape: "diamond",  label: "Other / unknown" }
  };
  var SIZE = 22;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function withUnit(v) { return /^\d+([.,]\d+)?$/.test(v) ? v + " m" : v; }

  /* ---------- marker symbols (SVG) ---------- */
  function shapeSvg(category, status, size) {
    var c = CAT[category] || CAT.Unknown, s = size || SIZE, h = s / 2, p = 3;
    var path;
    if (c.shape === "circle") path = '<circle cx="' + h + '" cy="' + h + '" r="' + (h - p) + '"';
    else if (c.shape === "square") path = '<rect x="' + p + '" y="' + p + '" width="' + (s - 2 * p) + '" height="' + (s - 2 * p) + '"';
    else if (c.shape === "triangle") path = '<polygon points="' + h + ',' + (p - 1) + ' ' + (s - p + 1) + ',' + (s - p) + ' ' + (p - 1) + ',' + (s - p) + '"';
    else path = '<polygon points="' + h + ',' + (p - 1) + ' ' + (s - p + 1) + ',' + h + ' ' + h + ',' + (s - p + 1) + ' ' + (p - 1) + ',' + h + '"';
    var style;
    if (status === "Planned") style = 'fill="#fff" stroke="' + c.color + '" stroke-width="3"';
    else style = 'fill="' + c.color + '" stroke="#1a1a1a" stroke-width="1.5"';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + ' ' + s +
      '" aria-hidden="true" focusable="false">' + path + ' ' + style + '/></svg>';
  }
  function trapIcon(p) {
    return L.divIcon({
      className: "trap-icon", html: shapeSvg(p.category, p.status), iconSize: [SIZE, SIZE], iconAnchor: [SIZE / 2, SIZE / 2],
      popupAnchor: [0, -SIZE / 2]
    });
  }

  /* ---------- popup ---------- */
  function row(label, value) {
    return value ? "<tr><th scope=\"row\">" + esc(label) + "</th><td>" + esc(value) + "</td></tr>" : "";
  }
  function popupHtml(p) {
    var w = p.width && p.width !== "NA" ? withUnit(p.width) : "";
    var l = p.length && p.length !== "NA" ? withUnit(p.length) : "";
    var h = "<div class=\"popup-scroll\"><h2>Trap " + esc(p.id) + "</h2><table class=\"attr\">" +
      row("Country", p.country) + row("State", p.state) + row("Town", p.town) + row("River/Lake", p.river) +
      row("River width", w) + row("Trap type", p.type) + row("Trap length", l) +
      row("Date installed", p.installed) +
      "<tr><th scope=\"row\">Status</th><td><span class=\"badge " + esc(p.status) + "\">" + esc(p.status) + "</span></td></tr>" +
      "</table>";
    h += "<h3>Catch</h3><div class=\"catch\">" + (p.catch || "<i>No catch recorded</i>") + "</div>";   // trusted HTML from build script
    if (p.photos) h += "<h3>Photos</h3><div class=\"photos\">" + p.photos + "</div>";                  // trusted HTML from build script
    return h + "</div>";
  }

  /* ---------- map + basemaps ---------- */
  var map = L.map("map", { zoomControl: true, maxZoom: 19, worldCopyJump: true });
  /* Default basemap is Esri World Topo Map: free with attribution and it also loads when index.html is opened
     straight from disk, whereas tile.openstreetmap.org blocks requests without a Referer (403 "Access blocked")
     on file:// pages and CARTO basemaps now need an API key. */
  var carto = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, maxNativeZoom: 18,
    attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, USGS, and the GIS User Community"
  }).addTo(map);
  var osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });
  var sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, maxNativeZoom: 18,
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
  });
  L.control.scale({ metric: true, imperial: false }).addTo(map);

  /* ---------- data ---------- */
  var features = (window.TRAPS && TRAPS.features) || [];
  var group = L.markerClusterGroup({
    spiderfyOnMaxZoom: true, showCoverageOnHover: false, zoomToBoundsOnClick: true,
    maxClusterRadius: 45, spiderLegPolylineOptions: { weight: 2, color: "#222", opacity: 0.6 },
    iconCreateFunction: function (cl) {
      var n = cl.getChildCount(), k = n < 10 ? "s" : n < 50 ? "m" : "l";
      return L.divIcon({ html: "<div><span>" + n + "</span></div>", className: "tc-cluster tc-" + k,
        iconSize: L.point(40, 40) });
    }
  });
  var markers = {};   // id -> marker
  features.forEach(function (f) {
    var p = f.properties, ll = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
    var m = L.marker(ll, { icon: trapIcon(p), title: "Trap " + p.id, alt: "Trap " + p.id, keyboard: true, riseOnHover: true });
    m.feature = f;
    m.bindTooltip("Trap " + esc(p.id) + (p.river ? " &ndash; " + esc(p.river) : ""), { direction: "top", offset: [0, -10] });
    m.bindPopup(function () { return popupHtml(p); }, { maxWidth: Math.min(340, window.innerWidth - 60), autoPanPadding: [20, 70] });
    m.on("popupopen", function () { m.closeTooltip(); });
    markers[p.id] = m;
  });
  group.addTo(map);

  L.control.layers({ "Topographic map (Esri)": carto, "OpenStreetMap (online hosting only)": osm, "Satellite (Esri)": sat }, { "Traps": group }, { collapsed: true }).addTo(map);

  map.on("popupopen", function (e) {
    var node = e.popup.getElement();
    if (!node) return;
    Array.prototype.forEach.call(node.querySelectorAll("img"), function (img) {
      if (!img.complete) img.addEventListener("load", function () { e.popup.update(); });
    });
    Array.prototype.forEach.call(node.querySelectorAll("a[target=_blank]"), function (a) { a.rel = "noopener"; });
  });

  /* ---------- legend ---------- */
  var legendEl = null;
  var Legend = L.Control.extend({
    options: { position: "bottomleft" },
    onAdd: function () {
      var d = L.DomUtil.create("details", "legend");
      legendEl = d;
      var h = "<summary>Legend</summary><h4>Trap category</h4><ul>";
      ["Fixed", "Mobile", "Condo"].forEach(function (c) {
        h += "<li>" + shapeSvg(c, "Installed", 18) + " " + CAT[c].label + "</li>";
      });
      h += "</ul><h4>Status</h4><ul>" +
        "<li>" + shapeSvg("Fixed", "Installed", 18) + " Installed</li>" +
        "<li>" + shapeSvg("Fixed", "Planned", 18) + " Planned</li></ul>" +
        "<p>Numbered circles group nearby traps. Click one to zoom in; traps at the exact same position fan out when you click the group at the highest zoom.</p>";
      d.innerHTML = h;
      L.DomEvent.disableClickPropagation(d);
      return d;
    }
  });
  new Legend().addTo(map);

  /* ---------- filters ---------- */
  var selCountry = el("f-country"), selStatus = el("f-status"), countEl = el("count");
  function fillSelect(sel, values) {
    values.forEach(function (v) { var o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); });
  }
  function uniq(key) {
    var seen = {};
    features.forEach(function (f) { if (f.properties[key]) seen[f.properties[key]] = 1; });
    return Object.keys(seen).sort();
  }
  fillSelect(selCountry, uniq("country"));
  fillSelect(selStatus, ["Installed", "Planned"].filter(function (s) { return uniq("status").indexOf(s) >= 0; }));

  function passes(p) {
    return (!selCountry.value || p.country === selCountry.value) && (!selStatus.value || p.status === selStatus.value);
  }
  function applyFilter(fit) {
    var show = [];
    group.clearLayers();
    features.forEach(function (f) { if (passes(f.properties)) show.push(markers[f.properties.id]); });
    group.addLayers(show);
    countEl.textContent = show.length ? "Showing " + show.length + " of " + features.length + " traps" : "No traps match these filters";
    if (fit !== false && show.length) {
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(show.map(function (m) { return m.getLatLng(); })), { padding: [30, 30], maxZoom: 12 });
    }
  }
  selCountry.addEventListener("change", function () { applyFilter(true); });
  selStatus.addEventListener("change", function () { applyFilter(true); });

  /* ---------- search (Trap ID / river-lake / town) ---------- */
  var q = el("q"), resEl = el("results"), hits = [], active = -1;
  function norm(s) { return String(s || "").toLowerCase(); }
  function search(text) {
    var t = norm(text).trim();
    if (!t) return [];
    var out = [];
    features.forEach(function (f) {
      var p = f.properties, score = 0;
      if (norm(p.id) === t) score = 100;
      else if (norm(p.id).indexOf(t) === 0) score = 60;
      else if (norm(p.river).indexOf(t) >= 0) score = 40;
      else if (norm(p.town).indexOf(t) >= 0) score = 30;
      else if (norm(p.state).indexOf(t) >= 0) score = 10;
      if (score) out.push({ p: p, score: score });
    });
    out.sort(function (a, b) { return b.score - a.score || (parseInt(a.p.id, 10) || 0) - (parseInt(b.p.id, 10) || 0); });
    return out.slice(0, 12).map(function (o) { return o.p; });
  }
  function showResults() {
    hits = search(q.value); active = -1;
    resEl.innerHTML = "";
    if (!q.value.trim()) { resEl.hidden = true; q.setAttribute("aria-expanded", "false"); return; }
    if (!hits.length) {
      resEl.innerHTML = '<li role="option" aria-disabled="true">No match</li>';
    } else {
      hits.forEach(function (p, i) {
        var li = document.createElement("li");
        li.setAttribute("role", "option"); li.id = "res-" + i; li.setAttribute("aria-selected", "false");
        li.innerHTML = "<strong>Trap " + esc(p.id) + "</strong> <small>" + esc([p.river, p.town, p.country].filter(Boolean).join(", ")) + "</small>";
        li.addEventListener("mousedown", function (ev) { ev.preventDefault(); choose(p); });
        resEl.appendChild(li);
      });
    }
    resEl.hidden = false; q.setAttribute("aria-expanded", "true");
  }
  function setActive(i) {
    var items = resEl.querySelectorAll("li[role=option]");
    if (!hits.length) return;
    active = (i + hits.length) % hits.length;
    Array.prototype.forEach.call(items, function (li, k) { li.setAttribute("aria-selected", k === active ? "true" : "false"); });
    q.setAttribute("aria-activedescendant", "res-" + active);
    items[active].scrollIntoView({ block: "nearest" });
  }
  function closeResults() { resEl.hidden = true; q.setAttribute("aria-expanded", "false"); }
  // Fly to a trap and open its popup. If other traps share its position (a cluster that never dissolves),
  // fan the cluster out first. Polls briefly because cluster markers appear after the zoom animation.
  function showTrap(m) {
    var tries = 0;
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 18));
    (function reveal() {
      var v = map._animatingZoom ? null : group.getVisibleParent(m);   // wait until the zoom has finished
      if (v === m) { m.openPopup(); return; }
      if (v && v.spiderfy && !group._inZoomAnimation) {
        group.once("spiderfied", function () { m.openPopup(); });
        v.spiderfy();
        return;
      }
      if (++tries < 40) setTimeout(reveal, 100);
    })();
  }
  function choose(p) {
    q.value = "Trap " + p.id; closeResults();
    if (!passes(p)) { selCountry.value = ""; selStatus.value = ""; applyFilter(false); }
    var m = markers[p.id];
    map.closePopup();
    showTrap(m);
  }
  q.addEventListener("input", showResults);
  q.addEventListener("focus", function () { if (q.value.trim()) showResults(); });
  q.addEventListener("blur", closeResults);
  q.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowDown") { ev.preventDefault(); if (resEl.hidden) showResults(); setActive(active + 1); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); setActive(active - 1); }
    else if (ev.key === "Enter") { if (hits.length) { ev.preventDefault(); choose(hits[active >= 0 ? active : 0]); } }
    else if (ev.key === "Escape") { closeResults(); }
  });

  /* ---------- go ---------- */
  map.setView([50, 5], 4);
  applyFilter(false);
  // Fit to all traps as soon as the map container has a real size (can be 0 while the page is still laying out).
  var fitted = false;
  function initialFit() {
    if (fitted) return;
    map.invalidateSize();
    if (map.getSize().x > 0 && map.getSize().y > 0) {
      fitted = true; applyFilter(true);
      if (legendEl && window.innerWidth > 600) legendEl.open = true;   // legend starts collapsed on phones
    }
  }
  if (window.ResizeObserver) new ResizeObserver(function () { map.invalidateSize(); initialFit(); }).observe(el("map"));
  window.addEventListener("load", initialFit);
  initialFit();
  el("updated").textContent = "Data last updated: " + ((window.TRAPS && TRAPS.generatedText) || "unknown");
  window.__trapMap = { map: map, group: group, markers: markers };   // handy for debugging in the console
})();
