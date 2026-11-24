/* La Maison Dubart · l'enquête — interactions (sans dépendance).
   Recherche globale, au hasard, historique local (rien n'est envoyé), fil d'exploration,
   bulles de preuves, filtres, visionneuse d'archives. */
(function () {
  "use strict";
  const R = document.documentElement.dataset.racine || "";
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const norm = t => (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const CLE = "dubart-historique";

  /* ---------- Historique local et fil d'exploration ---------- */
  function lireHist() {
    try { return (JSON.parse(localStorage.getItem(CLE)) || []).map(h => ({ ...h, u: String(h.u).replace(/^\/?maison-dubart\//, "") })).filter(h => h.u && !h.u.startsWith("/")); }
    catch (e) { return []; }
  }
  const racineAbs = new URL(R || "./", location.href).pathname;
  const chemin = location.pathname.startsWith(racineAbs) ? location.pathname.slice(racineAbs.length) : location.pathname.replace(/^\//, "");
  const ici = { u: (chemin || "index.html").replace(/\/$/, "/index.html"), t: document.body.dataset.titre || document.title.split(" · ")[0], k: document.body.dataset.genre || "", ts: Date.now() };
  const ancien = lireHist();
  try {
    const nouv = [ici, ...ancien.filter(h => h.u !== ici.u)].slice(0, 40);
    localStorage.setItem(CLE, JSON.stringify(nouv));
  } catch (e) {}
  const fil = $("#fil");
  if (fil) {
    const prec = ancien.filter(h => h.u !== ici.u && h.u !== "index.html").slice(0, matchMedia("(max-width: 600px)").matches ? 1 : 3).reverse();
    if (prec.length) {
      fil.innerHTML = '<span class="sr">Votre chemin :</span>' + prec.map(h => `<a href="${R}${esc(h.u)}">${esc(h.t)}</a><span class="sep" aria-hidden="true">›</span>`).join("") + `<span class="ici">${esc(ici.t)}</span>`;
    } else fil.remove();
  }
  function quand(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 2) return "à l’instant"; if (m < 60) return `il y a ${m} min`;
    const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
    const j = Math.round(h / 24); return j === 1 ? "hier" : `il y a ${j} jours`;
  }
  $$("[data-reprendre]").forEach(el => {
    const hist = ancien.filter(h => h.u !== ici.u && h.u !== "index.html").slice(0, 6);
    if (!hist.length) return;
    el.hidden = false;
    $("ol", el).innerHTML = hist.map(h => `<li><a href="${R}${esc(h.u)}">${esc(h.t)}</a> <span class="mono discret">${quand(h.ts)}</span></li>`).join("");
  });

  /* ---------- Feuille « Explorer » (mobile) ---------- */
  const voile = $("#voile");
  function ouvrirFeuille(id) {
    const f = document.getElementById(id); if (!f) return;
    const zh = $("[data-historique]", f);
    if (zh) {
      const h = lireHist().filter(x => x.u !== ici.u).slice(0, 6);
      zh.hidden = !h.length;
      $("nav", zh).innerHTML = h.map(x => `<a href="${R}${esc(x.u)}"><span>${esc(x.t)}</span><span class="mono discret">${quand(x.ts)}</span></a>`).join("");
    }
    f.hidden = false; voile.hidden = false; f.querySelector("a, button")?.focus({ preventScroll: true });
  }
  function fermerFeuilles() { $$(".feuille").forEach(f => f.hidden = true); if (voile) voile.hidden = true; }
  $$("[data-feuille]").forEach(b => b.addEventListener("click", () => ouvrirFeuille(b.dataset.feuille)));
  $$(".fermer-tiroir").forEach(b => b.addEventListener("click", fermerFeuilles));
  voile && voile.addEventListener("click", () => { fermerFeuilles(); fermerBulle(); });

  /* ---------- Index de recherche (chargé à la demande) ---------- */
  let INDEX = null;
  function charger() {
    if (INDEX) return Promise.resolve(INDEX);
    return fetch(R + "recherche.json").then(r => r.json()).then(j => {
      j.forEach(e => { e.n = norm(e.l); e.k = norm(e.k || ""); });
      return (INDEX = j);
    });
  }

  /* ---------- Au hasard ---------- */
  $$("[data-hasard]").forEach(b => b.addEventListener("click", e => {
    e.preventDefault();
    charger().then(ix => {
      const pool = ix.filter(x => x.h && x.u !== ici.u);
      const x = pool[Math.floor(Math.random() * pool.length)];
      if (x) location.href = R + x.u;
    });
  }));

  /* ---------- Recherche globale ---------- */
  const boite = $("#recherche");
  const champ = boite && $("input", boite);
  const zone = boite && $(".resultats", boite);
  let dernierFocus = null, selection = -1, positionAvant = 0;
  const TYPES = [["personne", "Personnes"], ["lieu", "Lieux"], ["metier", "Métiers"], ["annee", "Années"], ["archive", "Archives"], ["enigme", "Questions ouvertes"], ["fait", "Dans les informations"], ["page", "Pages"]];
  function distance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const d = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let p = d[0]; d[0] = i;
      for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; }
    }
    return d[b.length];
  }
  function surligner(txt, mots) {
    let h = esc(txt);
    mots.filter(m => m.length > 1).forEach(m => {
      const re = new RegExp("(" + m.split("").map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\u0300-\\u036f]*") + ")", "ig");
      const base = h.normalize("NFD"); h = base.replace(re, "<mark>$1</mark>").normalize("NFC");
    });
    return h;
  }
  function chercher(q) {
    const nq = norm(q), mots = nq.split(" ").filter(Boolean);
    if (!nq) return accueilRecherche();
    const res = [];
    const annee = nq.match(/^(1[5-9]\d\d|20[0-2]\d)$/);
    for (const e of INDEX) {
      const tout = e.n + " " + e.k;
      let s = 0;
      if (mots.every(m => tout.includes(m))) {
        s = 10;
        if (e.n.startsWith(nq)) s += 8; else if (e.n.includes(nq)) s += 5;
        if (mots.every(m => e.n.includes(m))) s += 4;
        s += { personne: 4, lieu: 4, metier: 3, annee: 5, archive: 2, enigme: 2, page: 3, fait: 0 }[e.t] || 0;
      } else if (e.t === "personne" || e.t === "lieu") {
        const toks = e.n.split(" ");
        if (mots.every(m => m.length > 3 && toks.some(t => distance(m, t) <= (m.length > 6 ? 2 : 1)))) s = 6;
      }
      if (annee && e.t === "personne" && e.a && e.a[0] && e.a[0] <= +annee[1] && (e.a[1] || e.a[0] + 90) >= +annee[1]) s = Math.max(s, 7);
      if (s) res.push([s, e]);
    }
    res.sort((a, b) => b[0] - a[0]);
    afficher(res.map(r => r[1]), mots, q, annee);
  }
  function ligne(e, mots) {
    return `<li><a href="${R}${esc(e.u)}" role="option"><span class="l">${surligner(e.l, mots)}</span><span class="s">${surligner(e.s || "", mots)}</span><span class="tp">${{ personne: "personne", lieu: "lieu", metier: "métier", archive: "archive", enigme: "question", fait: "information", annee: "année", page: "page" }[e.t]}</span></a></li>`;
  }
  function afficher(liste, mots, q, annee) {
    if (!liste.length) {
      const proches = INDEX.filter(e => e.t === "personne" || e.t === "lieu").map(e => [Math.min(...e.n.split(" ").map(t => distance(norm(q).split(" ")[0] || "", t))), e]).filter(x => x[0] <= 3).sort((a, b) => a[0] - b[0]).slice(0, 6).map(x => x[1]);
      zone.innerHTML = `<div class="enveloppe"><p class="aide">Rien ne correspond à « ${esc(q)} » dans la base.${proches.length ? " Vouliez-vous dire :" : ""}</p>${proches.length ? "<ul>" + proches.map(e => ligne(e, [])).join("") + "</ul>" : ""}`
        + `<p class="aide" style="margin-top:1.5rem">Essayez un nom de famille, une commune, un métier ou une année (par exemple 1836).</p><div class="essais">${["Rignault", "Le Quesnel", "violon", "1848", "châles", "Montmartre"].map(t => `<button class="puce" type="button" data-essai="${t}">${t}</button>`).join("")}</div></div>`;
      selection = -1; return;
    }
    let html = '<div class="enveloppe">';
    if (annee) html += `<p class="aide">En ${annee[1]} : les personnes de la base alors en vie, et ce qui s’est passé. <a href="${R}epoques.html#a${annee[1].slice(0, 3)}0">Voir l’époque sur la frise</a>.</p>`;
    for (const [t, titre] of TYPES) {
      const g = liste.filter(e => e.t === t); if (!g.length) continue;
      const max = t === "fait" ? 8 : 12;
      html += `<h2>${titre} <span class="mono">${g.length}</span></h2><ul role="listbox">${g.slice(0, max).map(e => ligne(e, mots)).join("")}</ul>`;
    }
    zone.innerHTML = html + "</div>"; selection = -1;
  }
  function accueilRecherche() {
    zone.innerHTML = `<div class="enveloppe"><p class="aide">Un nom (même mal orthographié), un prénom, une commune, une rue, un métier, une année, un mot d’un acte…</p><div class="essais">${["Dubart", "Octavie", "Le Quesnel", "violoniste", "agent de change", "1836", "concession", "Gaîté", "adoption"].map(t => `<button class="puce" type="button" data-essai="${t}">${t}</button>`).join("")}</div>`
      + `<h2>Ou bien</h2><ul><li><a href="#" data-hasard-r><span class="l">Ouvrir une page au hasard</span><span class="s">une personne, un lieu ou un document</span><span class="tp">hasard</span></a></li></ul></div>`;
  }
  function ouvrirRecherche(q) {
    if (!boite) return;
    dernierFocus = document.activeElement; positionAvant = window.scrollY; boite.hidden = false; document.documentElement.classList.add("recherche-ouverte");
    champ.value = q || ""; champ.focus();
    zone.innerHTML = '<div class="enveloppe"><p class="aide">Chargement de l’index…</p></div>';
    charger().then(() => chercher(champ.value)).catch(() => zone.innerHTML = '<div class="enveloppe"><p class="aide">L’index de recherche n’a pas pu être chargé.</p></div>');
  }
  function fermerRecherche() {
    if (!boite || boite.hidden) return;
    champ.blur();
    boite.hidden = true; document.documentElement.classList.remove("recherche-ouverte");
    window.scrollTo(0, positionAvant);
    dernierFocus && dernierFocus.focus({ preventScroll: true });
  }
  if (boite) {
    let t; champ.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => INDEX && chercher(champ.value), 90); });
    $(".fermer", boite).addEventListener("click", fermerRecherche);
    boite.addEventListener("click", e => {
      const b = e.target.closest("[data-essai]"); if (b) { champ.value = b.dataset.essai; chercher(champ.value); champ.focus(); }
      const h = e.target.closest("[data-hasard-r]"); if (h) { e.preventDefault(); const p = INDEX.filter(x => x.h); location.href = R + p[Math.floor(Math.random() * p.length)].u; }
    });
    boite.addEventListener("keydown", e => {
      const liens = $$(".resultats a[role=option]", boite);
      if (e.key === "Escape") { fermerRecherche(); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); if (!liens.length) return;
        selection = (selection + (e.key === "ArrowDown" ? 1 : -1) + liens.length) % liens.length;
        liens.forEach((l, i) => l.setAttribute("aria-selected", i === selection)); liens[selection].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && document.activeElement === champ) {
        const l = liens[Math.max(0, selection)]; if (l) { e.preventDefault(); location.href = l.href; }
      }
    });
  }
  $$("[data-chercher]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); fermerFeuilles(); ouvrirRecherche(b.dataset.chercher || ""); }));
  document.addEventListener("keydown", e => {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName) && boite && boite.hidden) { e.preventDefault(); ouvrirRecherche(""); }
    if (e.key === "Escape") { fermerBulle(); fermerFeuilles(); }
  });
  const qs = new URLSearchParams(location.search).get("q");
  if (qs && document.body.dataset.genre === "recherche") ouvrirRecherche(qs);
  else if (document.body.dataset.genre === "recherche") ouvrirRecherche("");

  /* ---------- Bulles de preuves ---------- */
  const PREUVES = (() => { const s = $("#preuves"); try { return s ? JSON.parse(s.textContent) : {}; } catch (e) { return {}; } })();
  const bulle = document.createElement("div");
  bulle.className = "bulle"; bulle.hidden = true; bulle.setAttribute("role", "dialog"); bulle.setAttribute("aria-label", "Preuves");
  document.body.appendChild(bulle);
  let bouton = null;
  const LIB = { v: "vérifié", p: "partiellement vérifié", n: "non vérifié", x: "contredit", f: "réfuté", r: "non résolu", i: "recherche infructueuse", o: "non recherché" };
  function fermerBulle() { if (bulle.hidden) return; bulle.hidden = true; if (bouton) { bouton.setAttribute("aria-expanded", "false"); bouton.focus(); bouton = null; } }
  document.addEventListener("click", e => {
    const b = e.target.closest("button.preuve");
    if (!b) { if (!bulle.contains(e.target)) fermerBulle(); return; }
    if (bouton === b) { fermerBulle(); return; }
    fermerBulle(); bouton = b; b.setAttribute("aria-expanded", "true");
    const ids = b.dataset.a.split(" ");
    bulle.innerHTML = `<button class="fermer" aria-label="Fermer">×</button><h2>${ids.length > 1 ? ids.length + " preuves" : "Preuve"} de ce passage</h2>` + ids.map(id => {
      const a = PREUVES[id]; if (!a) return `<div class="item"><span class="mono">${id}</span></div>`;
      const c = a.c === "f" ? "x" : a.c === "i" || a.c === "o" ? "n" : a.c;
      return `<div class="item"><span class="cert c-${c}">${LIB[a.c] || ""}${a.h ? " · " + esc(a.h) : ""}</span><p>${esc(a.e)}</p>`
        + (a.s || []).map(s => `<div class="src">${s.u ? `<a href="${R}${esc(s.u)}">${esc(s.t)}</a>` : esc(s.t)}${s.c ? ` · <span class="mono">${esc(s.c)}</span>` : ""}</div>`).join("")
        + `<div class="src"><a href="${R}assertions.html#${id}">Fiche complète ${id}</a></div></div>`;
    }).join("");
    bulle.hidden = false;
    const r = b.getBoundingClientRect();
    bulle.style.top = (window.scrollY + r.bottom + 8) + "px";
    bulle.style.left = Math.max(8, Math.min(window.scrollX + r.left - 40, window.scrollX + document.documentElement.clientWidth - bulle.offsetWidth - 8)) + "px";
    $(".fermer", bulle).addEventListener("click", fermerBulle);
    bulle.querySelector("a, .fermer").focus({ preventScroll: true });
  });

  /* ---------- Sommaire local actif ---------- */
  const som = $$(".sommaire a");
  if (som.length && "IntersectionObserver" in window) {
    const obs = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) som.forEach(a => a.classList.toggle("actif", a.hash === "#" + en.target.id));
    }), { rootMargin: "-30% 0px -60% 0px" });
    som.forEach(a => { const s = document.getElementById(a.hash.slice(1)); s && obs.observe(s); });
  }

  /* ---------- Filtres de listes ---------- */
  $$("[data-filtrer]").forEach(zoneF => {
    const cible = document.getElementById(zoneF.dataset.filtrer);
    const items = $$("[data-f]", cible);
    const txt = items.map(i => norm(i.textContent + " " + (i.dataset.f || "")));
    const q = $("input[type=search]", zoneF), selects = $$("select", zoneF), puces = $$(".puce[data-v]", zoneF), compte = $(".compte", zoneF);
    const etat = {};
    function app() {
      const v = norm(q ? q.value : "");
      let n = 0;
      items.forEach((it, i) => {
        let ok = !v || v.split(" ").every(m => txt[i].includes(m));
        for (const [k, val] of Object.entries(etat)) if (val && !(it.dataset[k] || "").split(" ").includes(val)) ok = false;
        it.hidden = !ok; if (ok) n++;
      });
      $$(".lettre", cible).forEach(l => { let s = l.nextElementSibling, vis = false; while (s && !s.classList.contains("lettre")) { if (!s.hidden) vis = true; s = s.nextElementSibling; } l.hidden = !vis; });
      if (compte) compte.textContent = n + " / " + items.length;
      const p = new URLSearchParams(); if (q && q.value) p.set("q", q.value); Object.entries(etat).forEach(([k, val]) => val && p.set(k, val));
      history.replaceState(null, "", (p.toString() ? "?" + p : location.pathname) + location.hash);
    }
    q && q.addEventListener("input", app);
    selects.forEach(s => s.addEventListener("change", () => { etat[s.name] = s.value; app(); }));
    puces.forEach(b => b.addEventListener("click", () => {
      const on = b.getAttribute("aria-pressed") !== "true";
      puces.filter(x => x.dataset.k === b.dataset.k).forEach(x => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", on); etat[b.dataset.k] = on ? b.dataset.v : ""; app();
    }));
    const init = new URLSearchParams(location.search);
    if (q && init.get("q")) q.value = init.get("q");
    selects.forEach(s => { if (init.get(s.name)) { s.value = init.get(s.name); etat[s.name] = s.value; } });
    puces.forEach(b => { if (init.get(b.dataset.k) === b.dataset.v) { b.setAttribute("aria-pressed", "true"); etat[b.dataset.k] = b.dataset.v; } });
    app();
  });

  /* ---------- Questions ouvertes : tout déplier / tout replier ---------- */
  $$("[data-deplier]").forEach(b => b.addEventListener("click", () => {
    const ouvrir = b.getAttribute("aria-pressed") !== "true";
    $$("details.groupe-enigmes").forEach(dd => { dd.open = ouvrir; });
    b.setAttribute("aria-pressed", ouvrir); b.textContent = ouvrir ? "Tout replier" : "Tout déplier";
  }));

  /* ---------- Cartes de branche : filtrer et descendre à la liste ---------- */
  $$("[data-branche-lien]").forEach(a => a.addEventListener("click", e => {
    const s = $("select[name=branche]"); if (!s) return;
    e.preventDefault(); s.value = a.dataset.brancheLien; s.dispatchEvent(new Event("change"));
    $("#liste-personnes").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }));
  if (location.hash === "#liste-personnes" && $("#liste-personnes")) setTimeout(() => $("#liste-personnes").scrollIntoView(), 50);

  /* ---------- Éventail : centré sur René quand il déborde (mobile) ---------- */
  $$(".eventail-defile").forEach(d => { d.scrollLeft = (d.scrollWidth - d.clientWidth) / 2; });

  /* ---------- Visionneuse d'archives ---------- */
  const grande = $(".planche figure img");
  $$(".planche .vues button").forEach(b => b.addEventListener("click", () => {
    grande.src = b.dataset.src; grande.dataset.hd = b.dataset.hd; grande.alt = b.dataset.alt;
    $(".planche figcaption .vue").textContent = b.dataset.legende;
    $$(".planche .vues button").forEach(x => x.setAttribute("aria-current", x === b));
  }));
  const loupe = $("dialog.loupe");
  if (grande && loupe) {
    const ouvrir = () => { $("img", loupe).src = grande.dataset.hd || grande.src; $("img", loupe).alt = grande.alt; loupe.showModal(); };
    grande.addEventListener("click", ouvrir);
    $("[data-loupe]") && $("[data-loupe]").addEventListener("click", ouvrir);
    loupe.addEventListener("click", e => { if (e.target.tagName === "IMG" || e.target.classList.contains("fermer") || e.target === loupe) loupe.close(); });
  }
})();
