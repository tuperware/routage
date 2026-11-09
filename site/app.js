/* Routage : isochrones sur vent Open-Meteo et polaire chargée. */
(() => {
  'use strict';

  // ---------- Modèles ----------
  const MODELS = [
    { id: 'ecmwf_ifs025', name: 'ECMWF', note: 'IFS, 15 jours', days: 15, wave: ['ecmwf_wam', 'ECMWF WAM'] },
    { id: 'gfs_seamless', name: 'GFS', note: 'NOAA, 16 jours', days: 16, wave: ['ncep_gfswave025', 'GFS Wave'] },
    { id: 'icon_seamless', name: 'ICON', note: 'DWD, 7 jours', days: 7, wave: ['dwd_ewam', 'DWD EWAM'] },
    { id: 'meteofrance_arome_france_hd', name: 'AROME', note: 'Météo-France 1,5 km, 2 jours', days: 3, fine: true, wave: ['meteofrance_wave', 'MFWAM Météo-France'], area: { s: 37.6, n: 55.3, w: -11.9, e: 15.9 } },
    { id: 'meteofrance_seamless', name: 'ARPEGE', note: 'Météo-France, 4 jours', days: 5, wave: ['meteofrance_wave', 'MFWAM Météo-France'] },
    { id: 'ukmo_seamless', name: 'UKMO', note: 'Met Office, 7 jours', days: 7 },
    { id: 'ecmwf_aifs025_single', name: 'AIFS', note: 'ECMWF IA, 15 jours', days: 15, wave: ['ecmwf_wam', 'ECMWF WAM'] },
  ];
  let model = MODELS[0].id;

  // ---------- Outils géo ----------
  const R_NM = 3440.065;
  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;
  const norm360 = a => ((a % 360) + 360) % 360;
  const norm180 = a => { a = norm360(a); return a > 180 ? a - 360 : a; };

  function distNm(a, b) {
    const p1 = rad(a.lat), p2 = rad(b.lat), dp = p2 - p1, dl = rad(b.lon - a.lon);
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    const p1 = rad(a.lat), p2 = rad(b.lat), dl = rad(b.lon - a.lon);
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return norm360(deg(Math.atan2(y, x)));
  }
  function move(a, hdg, nm) {
    const d = nm / R_NM, t = rad(hdg), p1 = rad(a.lat), l1 = rad(a.lon);
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
    const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lat: deg(p2), lon: norm180(deg(l2)) };
  }

  // ---------- Polaire ----------
  // c/l : avec spi (chute 96,1 m² dès 100°) ; cs/ls : sans spi, gréement de route 54,62 m² partout
  const POLARS = { c: window.POLAR, l: window.POLAR_LEGER, cs: window.POLAR_SANS_SPI, ls: window.POLAR_LEGER_SANS_SPI };
  let polKey = '';
  let P = POLARS.c;

  // ---------- Polaire d'un autre bateau (import .pol / .csv / .txt) ----------
  // Tableau TWA × TWS (qtVlm, OpenCPN, MaxSea, Adrena, PredictWind .pol) ou lignes « TWS TWA vitesse TWA vitesse… » (Expedition, PredictWind .txt).
  // Aucune valeur inventée : hors des angles du fichier, vitesse 0 ; au-delà du vent max du fichier, vitesse 0.
  function parsePolarText(txt) {
    const lines = String(txt).replace(/^\ufeff/, '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^[#!]/.test(l) && !/^pol\b/i.test(l));
    if (lines.length < 3) throw new Error('Fichier trop court.');
    const sep = lines.some(l => l.includes('\t')) ? /\t/ : lines.some(l => l.includes(';')) ? /;/ : lines[0].includes(',') && !/\d,\d/.test(lines[0].replace(/,\s*/g, ',x')) ? /,/ : /\s+/;
    const decComma = String(sep) !== String(/,/);
    const num = c => { c = String(c).trim(); if (c === '') return NaN; return parseFloat(decComma ? c.replace(',', '.') : c); };
    const rows = lines.map(l => l.split(sep).map(x => x.trim()));
    const head = rows[0], headNum = head.slice(1).map(num);
    let tws, twa = [], sp = [];
    if (!Number.isFinite(num(head[0])) && headNum.length >= 2 && headNum.every(Number.isFinite)) {
      // Tableau : 1re ligne = vents, 1re colonne = angles
      tws = headNum;
      for (const r of rows.slice(1)) {
        const a = num(r[0]); if (!Number.isFinite(a)) continue;
        twa.push(a); sp.push(tws.map((_, j) => { const v = num(r[j + 1]); return Number.isFinite(v) ? v : 0; }));
      }
    } else {
      // Lignes : vent, puis paires angle / vitesse
      const curves = rows.map(r => r.map(num)).filter(r => r.length >= 7 && r.length % 2 === 1 && r.every(Number.isFinite));
      if (curves.length < 2) throw new Error('Format non reconnu. Il faut un tableau TWA \\ TWS (.pol, .csv) ou des lignes « vent angle vitesse… ».');
      curves.sort((a, b) => a[0] - b[0]);
      tws = curves.map(c => c[0]);
      const set = new Set(); curves.forEach(c => { for (let i = 1; i < c.length; i += 2) set.add(c[i]); });
      twa = [...set].sort((a, b) => a - b);
      const at = (c, a) => { const P2 = []; for (let i = 1; i < c.length; i += 2) P2.push([c[i], c[i + 1]]); P2.sort((x, y) => x[0] - y[0]);
        if (a < P2[0][0] || a > P2[P2.length - 1][0]) return 0;
        for (let i = 0; i < P2.length - 1; i++) if (a <= P2[i + 1][0]) { const f = (a - P2[i][0]) / ((P2[i + 1][0] - P2[i][0]) || 1); return P2[i][1] + (P2[i + 1][1] - P2[i][1]) * f; }
        return P2[P2.length - 1][1]; };
      sp = twa.map(a => curves.map(c => at(c, a)));
    }
    if (tws.length < 2 || twa.length < 3) throw new Error('Pas assez de valeurs dans le fichier.');
    if (tws.some((v, i) => i && v <= tws[i - 1])) throw new Error('Les vents de la 1re ligne doivent être croissants.');
    const ord = twa.map((a, i) => [a, sp[i]]).filter(x => x[0] >= 0 && x[0] <= 180).sort((a, b) => a[0] - b[0]);
    twa = ord.map(x => x[0]); sp = ord.map(x => x[1].map(v => Math.max(0, Math.min(60, v))));
    if (twa.length < 3 || !sp.some(r => r.some(v => v > 0))) throw new Error('Aucune vitesse lisible dans le fichier.');
    // Bords sans données : vitesse 0 juste avant le premier angle et juste après le dernier
    const zero = () => tws.map(() => 0);
    if (twa[0] > 0) { if (twa[0] > 0.2) { twa.unshift(twa[0] - 0.1); sp.unshift(zero()); } twa.unshift(0); sp.unshift(zero()); }
    if (twa[twa.length - 1] < 180) { twa.push(twa[twa.length - 1] + 0.1); sp.push(zero()); if (twa[twa.length - 1] < 180) { twa.push(180); sp.push(zero()); } }
    if (tws[0] > 0) { tws = [0, ...tws]; sp = sp.map(r => [0, ...r]); }
    return { tws, twa, speed: sp };
  }
  const PXK = 'tiki_px';
  function boatNameFromFile(f) { return String(f).replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Autre bateau'; }
  function savePx(name, p) {
    let a = p.twa, sp = p.speed;
    const enc = () => [encodeURIComponent(name).replace(/[~_]/g, ''), p.tws.map(v => Math.round(v * 10)).join('_'), a.map(v => Math.round(v * 10)).join('_'), sp.map(r => r.map(v => Math.round(v * 10)).join('_')).join('_')].join('~');
    let v = enc();
    if (v.length > 12000) return false;
    const n = Math.ceil(v.length / 3000);
    const old = +((document.cookie.split('; ').find(c => c.startsWith(PXK + 'n=')) || '=0').split('=')[1]) || 0;
    for (let i = n; i < old; i++) document.cookie = `${PXK}${i}=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
    for (let i = 0; i < n; i++) document.cookie = `${PXK}${i}=${v.slice(i * 3000, (i + 1) * 3000)}; Max-Age=31536000; Path=/; Secure; SameSite=Lax`;
    document.cookie = `${PXK}n=${n}; Max-Age=31536000; Path=/; Secure; SameSite=Lax`;
    return true;
  }
  function loadPx() {
    try {
      const C = Object.fromEntries(document.cookie.split('; ').map(c => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
      const n = +C[PXK + 'n']; if (!n) return null;
      let v = ''; for (let i = 0; i < n; i++) { if (C[PXK + i] == null) return null; v += C[PXK + i]; }
      const [nm, w, a, s2] = v.split('~');
      const tws = w.split('_').map(x => +x / 10), twa = a.split('_').map(x => +x / 10), flat = s2.split('_').map(x => +x / 10);
      if (flat.length !== tws.length * twa.length) return null;
      return { name: decodeURIComponent(nm), p: { tws, twa, speed: twa.map((_, i) => flat.slice(i * tws.length, (i + 1) * tws.length)) } };
    } catch (e) { return null; }
  }
  let PX_NAME = '';
  // Polaire importée : elle n'existe que tant qu'elle est en service. Revenir au Tiki 38 l'efface.
  function clearPx() {
    const old = +((document.cookie.split('; ').find(c => c.startsWith(PXK + 'n=')) || '=0').split('=')[1]) || 0;
    for (let i = 0; i < old; i++) document.cookie = `${PXK}${i}=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
    document.cookie = `${PXK}n=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
    delete POLARS.x; PX_NAME = '';
    const m = document.getElementById('o-x-msg'); if (m) m.textContent = '';
  }
  { const x = loadPx(); if (x) { POLARS.x = x.p; PX_NAME = x.name; } }
  function idx(arr, v) {
    if (v <= arr[0]) return [0, 0, 0];
    const n = arr.length - 1;
    if (v >= arr[n]) return [n, n, 0];
    let i = 0;
    while (arr[i + 1] < v) i++;
    return [i, i + 1, (v - arr[i]) / (arr[i + 1] - arr[i])];
  }
  function polar(twa, tws) {
    const a = Math.abs(norm180(twa));
    const [i0, i1, fa] = idx(P.twa, a);
    const [j0, j1, fw] = idx(P.tws, tws);
    const s = P.speed;
    const top = s[i0][j0] * (1 - fw) + s[i0][j1] * fw;
    const bot = s[i1][j0] * (1 - fw) + s[i1][j1] * fw;
    return top * (1 - fa) + bot * fa;
  }

  // ---------- Réglages bateau ----------
  const OPT = { hmax: 4, pol: 1, wmax: 35, eng: false, min: 3, engs: 5, engw: 15, pk: 'c', cx: 20, coast: 300, dmin: 2, spi: true, cp: 1, ct: 1, cd: 1, cl: 1 };
  const lerp = (a, b, f) => a + (b - a) * f;
  // Coefficient selon l'allure : près jusqu'à 60°, travers à 90°, portant à partir de 135°, transition linéaire entre deux.
  function allureCoef(twa, o = OPT) {
    const a = Math.abs(norm180(twa));
    if (a <= 60) return o.cp;
    if (a <= 90) return lerp(o.cp, o.ct, (a - 60) / 30);
    if (a <= 135) return lerp(o.ct, o.cd, (a - 90) / 45);
    return o.cd;
  }
  // Petit temps : plein effet à 6 nds et moins, plus d'effet à 12 nds.
  function lightCoef(tws, o = OPT) {
    if (tws <= 6) return o.cl;
    if (tws >= 12) return 1;
    return lerp(o.cl, 1, (tws - 6) / 6);
  }
  function sailSpeed(twa, tws, o = OPT, base = P) {
    if (tws > base.tws[base.tws.length - 1]) return 0; // au-delà des données de la polaire
    const save = P; P = base;
    const v = polar(twa, tws);
    P = save;
    return v * o.pol * allureCoef(twa, o) * lightCoef(tws, o);
  }
  function boatSpeed(twa, tws) {
    if (tws > OPT.wmax) return { s: 0, m: false };
    const v = sailSpeed(twa, tws);
    if (OPT.eng && v < OPT.min && motOk(twa, tws)) return { s: OPT.engs, m: true };
    return { s: v, m: false };
  }
  // Moteur face au vent : au-delà du seuil choisi (OPT.engw), pas de moteur à moins de 60° du vent
  function motOk(twa, tws) { return tws <= OPT.engw || Math.abs(norm180(twa)) >= 60; }

  // ---------- Masque terre (Natural Earth 1:10 m, 120 px par degré) ----------
  const MASK_RES = 120, TILE = 10;
  let maskIndex = null;
  const rawMasks = new Map();
  const masks = new Map();

  async function loadMaskIndex() {
    if (!maskIndex) maskIndex = await (await fetch('land/index.json')).json();
  }
  function tileKey(lat, lon) {
    return `${Math.floor(lon / TILE) * TILE}_${Math.floor(lat / TILE) * TILE}`;
  }
  async function loadMasks(bb) {
    await loadMaskIndex();
    const jobs = [];
    for (let ty = Math.floor(bb.s / TILE) * TILE; ty < bb.n; ty += TILE) {
      for (let tx = Math.floor(bb.w / TILE) * TILE; tx < bb.e; tx += TILE) {
        const k = `${tx}_${ty}`;
        if (maskIndex[k] !== 2 || masks.has(k)) continue;
        jobs.push(new Promise((ok, ko) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            const g = c.getContext('2d', { willReadFrequently: true });
            g.drawImage(img, 0, 0);
            const d = g.getImageData(0, 0, c.width, c.height).data;
            const m = new Uint8Array(c.width * c.height);
            for (let i = 0; i < m.length; i++) m[i] = d[i * 4] > 127 ? 1 : 0;
            // marge de sécurité : la terre est élargie d'un pixel (≈ 0,9 km) dans toutes les directions
            const W = c.width, H = c.height, g2 = new Uint8Array(m);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
              if (!m[y * W + x]) continue;
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const yy = y + dy, xx = x + dx;
                if (yy >= 0 && yy < H && xx >= 0 && xx < W) g2[yy * W + xx] = 1;
              }
            }
            masks.set(k, g2); rawMasks.set(k, m);
            ok();
          };
          img.onerror = () => ko(new Error('Masque des côtes introuvable'));
          img.src = `land/${k}.png`;
        }));
      }
    }
    await Promise.all(jobs);
  }
  // ---------- Côte précise (OpenStreetMap, tuiles OpenFreeMap z10, ≈ 50 m) ----------
  // Le masque Natural Earth ignore les flèches de sable, digues et petits îlots. Là où une tuile précise
  // est chargée, elle remplace le masque grossier : mer = surfaces « ocean » de la carte, le reste = terre.
  const FZ = 10, FN = 512;
  const fine = new Map(); // "x/y" → Uint8Array (1 = terre) | 'S' (tout mer)
  let fineUrl = null;
  const fineKey = (lat, lon) => {
    const n = 1 << FZ, x = (lon + 180) / 360 * n;
    const s = Math.sin(rad(Math.max(-85, Math.min(85, lat))));
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    return { x, y, k: `${Math.floor(x)}/${Math.floor(y)}` };
  };
  let fineOn = true;
  function fineLand(lat, lon) { // true / false, ou undefined si pas de tuile précise
    if (!fineOn) return undefined;
    const h = portLand(lat, lon);
    if (h !== undefined) return h;
    const t = fineKey(lat, lon), m = fine.get(t.k);
    if (m === undefined) return undefined;
    if (m === 'S') return false;
    const px = Math.min(FN - 1, Math.floor((t.x % 1) * FN)), py = Math.min(FN - 1, Math.floor((t.y % 1) * FN));
    const dPx = m.d[py * FN + px];
    if (dPx <= (narrowOk ? 0.5 : 1.5)) return true; // terre + un pixel (≈ 50 m), comme avant ; passage étroit : la terre seule
    return dPx * m.px < coastLim(lat, lon);
  }
  // Distance à garder avec la côte : réglage (300 m par défaut), mais 50 m à moins d'un mille
  // du départ et de l'arrivée pour pouvoir sortir d'un port ou d'une anse.
  let coastM = 300, coastNear = [];
  let narrowOk = false; // passage étroit (canal de Caronte…) : pas de marge d'un pixel le long des berges
  let chanMode = false; // recherche du chenal : pas de marge à la côte (seulement terre + 25 m)
  function coastLim(lat, lon) {
    if (chanMode) return 0;
    for (const q of coastNear) { const dy = lat - q.lat, dx = (lon - q.lon) * Math.cos(rad(q.lat)); if (dy * dy + dx * dx < (1 / 60) * (1 / 60)) return 0; }
    return coastM;
  }
  // Lecture minimale d'une tuile vectorielle (Mapbox Vector Tile) : couche « water », classes ocean et dock
  function mvtWater(buf, piers) {
    const b = new Uint8Array(buf); let p = 0;
    const varint = () => { let r = 0, s = 1, c; do { c = b[p++]; r += (c & 127) * s; s *= 128; } while (c & 128); return r; };
    const skip = w => { if (w === 0) varint(); else if (w === 1) p += 8; else if (w === 2) p += varint(); else if (w === 5) p += 4; };
    const sub = () => { const l = varint(); return p + l; };
    const out = [];
    while (p < b.length) {
      const tag = varint();
      if ((tag >> 3) !== 3 || (tag & 7) !== 2) { skip(tag & 7); continue; }
      const end = sub(); let name = '', keys = [], vals = [], feats = [], extent = 4096;
      while (p < end) {
        const t = varint(), f = t >> 3;
        if (f === 1) { const l = varint(); name = new TextDecoder().decode(b.subarray(p, p + l)); p += l; }
        else if (f === 3) { const l = varint(); keys.push(new TextDecoder().decode(b.subarray(p, p + l))); p += l; }
        else if (f === 4) { const e2 = sub(); let v = null; while (p < e2) { const t2 = varint(); if ((t2 >> 3) === 1) { const l = varint(); v = new TextDecoder().decode(b.subarray(p, p + l)); p += l; } else skip(t2 & 7); } vals.push(v); }
        else if (f === 2) { const e2 = sub(); const ft = { tags: [], geom: [], type: 0 }; while (p < e2) { const t2 = varint(), f2 = t2 >> 3; if (f2 === 2 || f2 === 4) { const e3 = sub(); const a = f2 === 2 ? ft.tags : ft.geom; while (p < e3) a.push(varint()); } else if (f2 === 3) ft.type = varint(); else skip(t2 & 7); } feats.push(ft); }
        else if (f === 5) extent = varint();
        else skip(t & 7);
      }
      p = end;
      const tr = piers && name === 'transportation';
      if (name !== 'water' && !tr) continue;
      const ci = keys.indexOf('class'), bi = keys.indexOf('brunnel');
      for (const ft of feats) {
        let cls = null, br = null; for (let i = 0; i < ft.tags.length; i += 2) { if (ft.tags[i] === ci) cls = vals[ft.tags[i + 1]]; if (ft.tags[i] === bi) br = vals[ft.tags[i + 1]]; }
        if (tr) { // digues, jetées, routes sur digue : de la terre (sauf ponts et lignes de ferry)
          if (cls === 'ferry' || br === 'bridge' || br === 'tunnel' || (ft.type !== 2 && !(ft.type === 3 && cls === 'pier'))) continue;
        } else if (ft.type !== 3 || (cls !== 'ocean' && cls !== 'dock' && cls !== 'lake' && cls !== 'pond' && cls !== 'river')) continue;
        const rings = []; let x = 0, y = 0, ring = null, i = 0; const g = ft.geom;
        const zz = n => (n >> 1) ^ -(n & 1);
        while (i < g.length) {
          const cmd = g[i] & 7, cnt = g[i] >> 3; i++;
          if (cmd === 7) { if (ring) rings.push(ring); ring = null; continue; }
          for (let j = 0; j < cnt; j++) { x += zz(g[i++]); y += zz(g[i++]); if (cmd === 1) { if (ring) rings.push(ring); ring = [[x, y]]; } else ring.push([x, y]); }
        }
        if (ring) rings.push(ring);
        out.push({ rings, extent, kind: tr ? (ft.type === 2 ? 'line' : 'pier') : 'sea' });
      }
    }
    return out;
  }
  async function loadFineTile(k) {
    if (fine.has(k)) return;
    if (!fineUrl) {
      const tj = await (await fetch('https://tiles.openfreemap.org/planet')).json();
      fineUrl = tj.tiles[0];
    }
    const [x, y] = k.split('/');
    const r = await fetch(fineUrl.replace('{z}', FZ).replace('{x}', x).replace('{y}', y));
    if (!r.ok) throw new Error('tuile');
    const feats = mvtWater(await r.arrayBuffer());
    const c = document.createElement('canvas'); c.width = c.height = FN;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff';
    for (const f of feats) {
      const s = FN / f.extent; g.beginPath();
      for (const ring of f.rings) { ring.forEach(([a, b2], i) => i ? g.lineTo(a * s, b2 * s) : g.moveTo(a * s, b2 * s)); g.closePath(); }
      g.fill('evenodd');
    }
    const d = g.getImageData(0, 0, FN, FN).data, m = new Uint8Array(FN * FN);
    let any = 0;
    for (let i = 0; i < m.length; i++) if (d[i * 4] < 128) { m[i] = 1; any++; }
    if (!any) { fine.set(k, 'S'); return; }
    // distance à la terre en pixels (chanfrein 1 / 1,41) ; un pixel ≈ 55 m en Méditerranée
    const D = new Float32Array(FN * FN), BIG = 1e4, Q = Math.SQRT2;
    for (let i = 0; i < D.length; i++) D[i] = m[i] ? 0 : BIG;
    for (let yy = 0; yy < FN; yy++) for (let xx = 0; xx < FN; xx++) {
      const i = yy * FN + xx; let v = D[i]; if (!v) continue;
      if (xx) v = Math.min(v, D[i - 1] + 1);
      if (yy) { v = Math.min(v, D[i - FN] + 1); if (xx) v = Math.min(v, D[i - FN - 1] + Q); if (xx < FN - 1) v = Math.min(v, D[i - FN + 1] + Q); }
      D[i] = v;
    }
    for (let yy = FN - 1; yy >= 0; yy--) for (let xx = FN - 1; xx >= 0; xx--) {
      const i = yy * FN + xx; let v = D[i]; if (!v) continue;
      if (xx < FN - 1) v = Math.min(v, D[i + 1] + 1);
      if (yy < FN - 1) { v = Math.min(v, D[i + FN] + 1); if (xx < FN - 1) v = Math.min(v, D[i + FN + 1] + Q); if (xx) v = Math.min(v, D[i + FN - 1] + Q); }
      D[i] = v;
    }
    const n = 1 << FZ, latC = Math.atan(Math.sinh(Math.PI * (1 - 2 * (+y + 0.5) / n))) * 180 / Math.PI;
    fine.set(k, { d: D, px: 40075016.7 * Math.cos(rad(latC)) / (n * FN) });
  }
  // ---------- Ports (OpenStreetMap z13, ≈ 7 m) : digues, jetées et quais autour du départ et de l'arrivée ----------
  // La côte z10 (≈ 55 m) efface les digues fines ; à moins d'un mille du départ et de l'arrivée, où la marge
  // à la côte est nulle, on lit la carte détaillée avec ses digues et jetées.
  const PZ = 13, port = new Map();
  const portKey = (lat, lon) => {
    const n = 1 << PZ, x = (lon + 180) / 360 * n;
    const s = Math.sin(rad(Math.max(-85, Math.min(85, lat))));
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    return { x, y, k: `${Math.floor(x)}/${Math.floor(y)}` };
  };
  function portLand(lat, lon) {
    if (!port.size) return undefined;
    const t = portKey(lat, lon), m = port.get(t.k);
    if (!m) return undefined;
    if (m === 'S') return false;
    const px = Math.min(FN - 1, Math.floor((t.x % 1) * FN)), py = Math.min(FN - 1, Math.floor((t.y % 1) * FN));
    const dM = m.d[py * FN + px] * m.px;
    if (dM <= (narrowOk ? 8 : 25)) return true; // terre, digue ou jetée + 25 m (passage étroit : 8 m)
    return coastLim(lat, lon) ? undefined : false; // au-delà d'un mille : marge habituelle (côte z10)
  }
  async function loadPortTile(k) {
    if (port.has(k)) return;
    if (!fineUrl) fineUrl = (await (await fetch('https://tiles.openfreemap.org/planet')).json()).tiles[0];
    const [x, y] = k.split('/');
    const r = await fetch(fineUrl.replace('{z}', PZ).replace('{x}', x).replace('{y}', y));
    if (!r.ok) throw new Error('tuile');
    const feats = mvtWater(await r.arrayBuffer(), true);
    if (!feats.some(f => f.kind === 'sea')) return; // pas de mer dans la tuile : on garde la côte z10
    const c = document.createElement('canvas'); c.width = c.height = FN;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const f of feats.filter(f => f.kind === 'sea')) {
      const s = FN / f.extent; g.beginPath();
      for (const ring of f.rings) { ring.forEach(([a, b2], i) => i ? g.lineTo(a * s, b2 * s) : g.moveTo(a * s, b2 * s)); g.closePath(); }
      g.fill('evenodd');
    }
    g.fillStyle = '#000';
    for (const f of feats.filter(f => f.kind !== 'sea')) {
      const s = FN / f.extent; g.beginPath();
      for (const ring of f.rings) { ring.forEach(([a, b2], i) => i ? g.lineTo(a * s, b2 * s) : g.moveTo(a * s, b2 * s)); if (f.kind === 'pier') g.closePath(); }
      if (f.kind === 'pier') g.fill('evenodd');
      g.stroke();
    }
    const d = g.getImageData(0, 0, FN, FN).data, m = new Uint8Array(FN * FN);
    let any = 0;
    for (let i = 0; i < m.length; i++) if (d[i * 4] < 128) { m[i] = 1; any++; }
    if (!any) { port.set(k, 'S'); return; }
    const D = distField(m);
    const n = 1 << PZ, latC = Math.atan(Math.sinh(Math.PI * (1 - 2 * (+y + 0.5) / n))) * 180 / Math.PI;
    port.set(k, { d: D, px: 40075016.7 * Math.cos(rad(latC)) / (n * FN) });
  }
  function distField(m) { // distance à la terre en pixels (chanfrein 1 / 1,41)
    const D = new Float32Array(FN * FN), BIG = 1e4, Q = Math.SQRT2;
    for (let i = 0; i < D.length; i++) D[i] = m[i] ? 0 : BIG;
    for (let yy = 0; yy < FN; yy++) for (let xx = 0; xx < FN; xx++) {
      const i = yy * FN + xx; let v = D[i]; if (!v) continue;
      if (xx) v = Math.min(v, D[i - 1] + 1);
      if (yy) { v = Math.min(v, D[i - FN] + 1); if (xx) v = Math.min(v, D[i - FN - 1] + Q); if (xx < FN - 1) v = Math.min(v, D[i - FN + 1] + Q); }
      D[i] = v;
    }
    for (let yy = FN - 1; yy >= 0; yy--) for (let xx = FN - 1; xx >= 0; xx--) {
      const i = yy * FN + xx; let v = D[i]; if (!v) continue;
      if (xx < FN - 1) v = Math.min(v, D[i + 1] + 1);
      if (yy < FN - 1) { v = Math.min(v, D[i + FN] + 1); if (xx < FN - 1) v = Math.min(v, D[i + FN + 1] + Q); if (xx) v = Math.min(v, D[i + FN - 1] + Q); }
      D[i] = v;
    }
    return D;
  }
  async function loadPorts(pts, rNm = 1.2) {
    const keys = [];
    for (const p of pts) {
      const dLat = rNm / 60, dLon = dLat / Math.cos(rad(p.lat));
      const a = portKey(p.lat + dLat, p.lon - dLon), b = portKey(p.lat - dLat, p.lon + dLon);
      for (let x = Math.floor(a.x); x <= Math.floor(b.x); x++) for (let y = Math.floor(a.y); y <= Math.floor(b.y); y++) keys.push(`${x}/${y}`);
    }
    const todo = [...new Set(keys)].filter(k => !port.has(k));
    await Promise.all(todo.map(k => loadPortTile(k).catch(() => {})));
  }
  async function loadFineKeys(keys) {
    await loadHazKeys(keys);
    const todo = [...new Set(keys)].filter(k => !fine.has(k));
    for (let i = 0; i < todo.length; i += 8) await Promise.all(todo.slice(i, i + 8).map(k => loadFineTile(k).catch(() => {})));
    return todo.length;
  }
  // Passages étroits (détroits, passes entre îles) : là où la marge du masque grossier (≈ 0,9 km)
  // ferme un chenal d'eau de moins de ~4 km. On y charge la côte précise pour pouvoir y passer.
  function pinchKeys(bb, a, b, max = 40) {
    const found = new Map(), N = TILE * MASK_RES;
    for (const [k, m] of rawMasks) {
      const [tx, ty] = k.split('_').map(Number);
      if (tx > bb.e || tx + TILE < bb.w || ty > bb.n || ty + TILE < bb.s) continue;
      const g = masks.get(k);
      const x0 = Math.max(0, Math.floor((bb.w - tx) * MASK_RES)), x1 = Math.min(N - 1, Math.ceil((bb.e - tx) * MASK_RES));
      const y0 = Math.max(0, Math.floor((ty + TILE - bb.n) * MASK_RES)), y1 = Math.min(N - 1, Math.ceil((ty + TILE - bb.s) * MASK_RES));
      const L = (x, y) => x >= 0 && y >= 0 && x < N && y < N && m[y * N + x] === 1;
      const side = (x, y, dx, dy) => { for (let i = 1; i <= 3; i++) if (L(x + dx * i, y + dy * i)) return true; return false; };
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * N + x;
        if (m[i] || !g[i]) continue; // eau fermée par la marge seulement
        if (!((side(x, y, 1, 0) && side(x, y, -1, 0)) || (side(x, y, 0, 1) && side(x, y, 0, -1)) || (side(x, y, 1, 1) && side(x, y, -1, -1)) || (side(x, y, 1, -1) && side(x, y, -1, 1)))) continue;
        const lat = ty + TILE - (y + 0.5) / MASK_RES, lon = tx + (x + 0.5) / MASK_RES, fk = fineKey(lat, lon).k;
        if (found.has(fk)) continue;
        // priorité aux passages proches de la ligne directe
        const t = Math.max(0, Math.min(1, ((lon - a.lon) * (b.lon - a.lon) + (lat - a.lat) * (b.lat - a.lat)) / ((b.lon - a.lon) ** 2 + (b.lat - a.lat) ** 2 || 1)));
        found.set(fk, Math.hypot(lon - a.lon - t * (b.lon - a.lon), lat - a.lat - t * (b.lat - a.lat)));
      }
    }
    return [...found].sort((p, q) => p[1] - q[1]).slice(0, max).map(p => p[0]);
  }
  // Tuiles précises autour d'un point (rayon en milles), seulement là où le masque grossier voit une côte
  function fineKeysAround(p, rNm) {
    const out = [], dLat = rNm / 60, dLon = dLat / Math.cos(rad(p.lat));
    const a = fineKey(p.lat + dLat, p.lon - dLon), b = fineKey(p.lat - dLat, p.lon + dLon);
    for (let x = Math.floor(a.x); x <= Math.floor(b.x); x++) for (let y = Math.floor(a.y); y <= Math.floor(b.y); y++) out.push(`${x}/${y}`);
    return out;
  }
  // Tuiles précises touchées par une route (là où le masque grossier voit une côte à moins de 3 km)
  function fineKeysAlong(legs) {
    const out = [];
    for (let i = 1; i < legs.length; i++) {
      const a = legs[i - 1], b = legs[i], n = Math.max(1, Math.ceil(distNm(a, b) * 1.852 / 0.5));
      for (let j = 0; j <= n; j++) {
        const lat = a.lat + (b.lat - a.lat) * j / n, lon = a.lon + (b.lon - a.lon) * j / n;
        if (coarseNear(lat, lon)) out.push(fineKey(lat, lon).k);
      }
    }
    return out;
  }
  function coarseNear(lat, lon) {
    const d = 0.03;
    for (const [u, v] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]]) if (coarseLand(lat + u, lon + v / Math.cos(rad(lat)))) return true;
    return false;
  }

  // ---------- Petits fonds et dangers balisés (Open Waters Seascape + OpenSeaMap, tuiles z10) ----------
  // Profondeur par rapport au niveau moyen (pas au zéro des cartes) : 0 = pas de donnée, on laisse passer.
  // Dangers : épaves, roches, obstructions, dangers isolés (100 m autour) ; cardinales : 150 m du côté du danger.
  const haz = new Map(); // "x/y" → { e: Float32Array | null, pts: [], m: Uint8Array | null, dm }
  let hazOn = true;
  function mvtPoints(buf, layer) {
    const b = new Uint8Array(buf); let p = 0;
    const varint = () => { let r = 0, s = 1, c; do { c = b[p++]; r += (c & 127) * s; s *= 128; } while (c & 128); return r; };
    const skip = w => { if (w === 0) varint(); else if (w === 1) p += 8; else if (w === 2) p += varint(); else if (w === 5) p += 4; };
    const sub = () => { const l = varint(); return p + l; };
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), td = new TextDecoder();
    const out = [];
    while (p < b.length) {
      const tag = varint();
      if ((tag >> 3) !== 3 || (tag & 7) !== 2) { skip(tag & 7); continue; }
      const end = sub(); let name = '', keys = [], vals = [], feats = [], extent = 4096;
      while (p < end) {
        const t = varint(), f = t >> 3;
        if (f === 1) { const l = varint(); name = td.decode(b.subarray(p, p + l)); p += l; }
        else if (f === 3) { const l = varint(); keys.push(td.decode(b.subarray(p, p + l))); p += l; }
        else if (f === 4) { const e2 = sub(); let v = null; while (p < e2) { const t2 = varint(), f2 = t2 >> 3; if (f2 === 1) { const l = varint(); v = td.decode(b.subarray(p, p + l)); p += l; } else if (f2 === 2) { v = dv.getFloat32(p, true); p += 4; } else if (f2 === 3) { v = dv.getFloat64(p, true); p += 8; } else if (f2 === 4 || f2 === 5) v = varint(); else if (f2 === 6) { const n = varint(); v = (n >> 1) ^ -(n & 1); } else if (f2 === 7) v = !!varint(); else skip(t2 & 7); } vals.push(v); }
        else if (f === 2) { const e2 = sub(); const ft = { tags: [], geom: [], type: 0 }; while (p < e2) { const t2 = varint(), f2 = t2 >> 3; if (f2 === 2 || f2 === 4) { const e3 = sub(); const a = f2 === 2 ? ft.tags : ft.geom; while (p < e3) a.push(varint()); } else if (f2 === 3) ft.type = varint(); else skip(t2 & 7); } feats.push(ft); }
        else if (f === 5) extent = varint();
        else skip(t & 7);
      }
      p = end;
      if (name !== layer) continue;
      for (const ft of feats) {
        if (ft.type !== 1 || ft.geom.length < 3) continue;
        const pr = {}; for (let i = 0; i < ft.tags.length; i += 2) pr[keys[ft.tags[i]]] = vals[ft.tags[i + 1]];
        const zz = n => (n >> 1) ^ -(n & 1);
        out.push({ x: zz(ft.geom[1]) / extent, y: zz(ft.geom[2]) / extent, pr });
      }
    }
    return out;
  }
  async function loadHazTile(k) {
    if (haz.has(k)) return;
    const [x, y] = k.split('/');
    const h = { e: null, pts: [], m: null, dm: null };
    const dem = (async () => {
      const r = await fetch(`https://tiles.openwaters.io/seascape/10/${x}/${y}.webp`);
      if (!r.ok) return;
      const bm = await createImageBitmap(await r.blob());
      const c = document.createElement('canvas'); c.width = c.height = FN;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0, FN, FN);
      const d = g.getImageData(0, 0, FN, FN).data, e = new Float32Array(FN * FN);
      for (let i = 0; i < e.length; i++) e[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
      h.e = e;
    })().catch(() => {});
    const mk = (async () => {
      const r = await fetch(`https://tiles.openwaters.io/seamap/10/${x}/${y}.pbf`);
      if (!r.ok) return;
      for (const q of mvtPoints(await r.arrayBuffer(), 'seamark')) {
        const t = String(q.pr.type || ''), fam = String(q.pr.family || ''), cat = String(q.pr.category || '');
        let kind = null;
        if (/cardinal/.test(t) && /^(north|south|east|west)$/.test(cat)) kind = cat;
        else if (/isolated_danger/.test(t)) kind = 'iso';
        else if (fam === 'hazard' || /^(wreck|rock|obstruction)$/.test(t)) kind = 'iso';
        if (kind) h.pts.push({ x: q.x, y: q.y, kind, depth: typeof q.pr.depth === 'number' ? q.pr.depth : null });
      }
    })().catch(() => {});
    await Promise.all([dem, mk]);
    haz.set(k, h);
  }
  async function loadHazKeys(keys) {
    const todo = [...new Set(keys)].filter(k => !haz.has(k));
    for (let i = 0; i < todo.length; i += 8) await Promise.all(todo.slice(i, i + 8).map(k => loadHazTile(k).catch(() => {})));
    return todo.length;
  }
  function hazMask(k) {
    const h = haz.get(k); if (!h) return null;
    const dm = OPT.dmin || 0;
    if (h.m && h.dm === dm) return h.m;
    const m = new Uint8Array(FN * FN); let any = 0;
    if (h.e && dm > 0) for (let i = 0; i < m.length; i++) { const v = h.e[i]; if (v !== 0 && v > -dm) { m[i] = 1; any++; } }
    const [, y] = k.split('/'), n = 1 << FZ, latC = Math.atan(Math.sinh(Math.PI * (1 - 2 * (+y + 0.5) / n))) * 180 / Math.PI;
    const pxM = 40075016.7 * Math.cos(rad(latC)) / (n * FN);
    for (const q of h.pts) {
      if (q.depth != null && q.kind === 'iso' && q.depth >= dm + 1) continue;
      const R = (q.kind === 'iso' ? 100 : 150) / pxM, off = q.kind === 'iso' ? 0 : 150 / pxM;
      const cx = q.x * FN + (q.kind === 'east' ? -off : q.kind === 'west' ? off : 0), cy = q.y * FN + (q.kind === 'north' ? off : q.kind === 'south' ? -off : 0);
      for (let yy = Math.max(0, Math.floor(cy - R)); yy <= Math.min(FN - 1, Math.ceil(cy + R)); yy++)
        for (let xx = Math.max(0, Math.floor(cx - R)); xx <= Math.min(FN - 1, Math.ceil(cx + R)); xx++)
          if ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 <= R * R) { m[yy * FN + xx] = 1; any++; }
    }
    h.m = any ? m : 'S'; h.dm = dm;
    return h.m;
  }
  function hazLand(lat, lon) {
    if (!hazOn || !fineOn || chanMode || narrowOk) return false;
    if (!coastLim(lat, lon)) return false; // près du départ, de l'arrivée et des points : pas de contrôle
    const t = fineKey(lat, lon), m = hazMask(t.k);
    if (!m || m === 'S') return false;
    const px = Math.min(FN - 1, Math.floor((t.x % 1) * FN)), py = Math.min(FN - 1, Math.floor((t.y % 1) * FN));
    return m[py * FN + px] === 1;
  }
  function hazNear(lat, lon) { if (!hazOn || !fineOn) return false; const m = hazMask(fineKey(lat, lon).k); return !!m && m !== 'S'; }
  function keysAlong(legs) {
    const out = [];
    for (let i = 1; i < legs.length; i++) {
      const a = legs[i - 1], b = legs[i], n = Math.max(1, Math.ceil(distNm(a, b) * 1.852 / 2));
      for (let j = 0; j <= n; j++) out.push(fineKey(a.lat + (b.lat - a.lat) * j / n, a.lon + (b.lon - a.lon) * j / n).k);
    }
    return out;
  }
  function isLand(lat, lon) {
    const f = fineLand(lat, lon);
    if (f === undefined ? coarseLand(lat, lon) : f) return true;
    return hazLand(lat, lon);
  }
  function coarseLand(lat, lon) {
    const k = tileKey(lat, lon);
    const v = maskIndex && maskIndex[k];
    if (!v) return false;
    if (v === 1) return true;
    const m = masks.get(k);
    if (!m) return true; // zone des côtes non chargée : on considère que c'est de la terre, par prudence
    const tx = Math.floor(lon / TILE) * TILE, ty = Math.floor(lat / TILE) * TILE;
    const N = TILE * MASK_RES;
    const x = Math.min(N - 1, Math.floor((lon - tx) * MASK_RES));
    const y = Math.min(N - 1, Math.floor((ty + TILE - lat) * MASK_RES));
    return m[y * N + x] === 1;
  }
  function segmentClear(a, b) {
    const km = distNm(a, b) * 1.852;
    const n = Math.max(2, Math.ceil(km / 0.45));
    let nearFine = false;
    for (let i = 0; i <= n; i++) {
      const f = i / n, lat = a.lat + (b.lat - a.lat) * f, lon = a.lon + (b.lon - a.lon) * f;
      const t = fineOn && fine.size ? fine.get(fineKey(lat, lon).k) : undefined;
      if ((t !== undefined && t !== 'S') || portLand(lat, lon) !== undefined || hazNear(lat, lon)) nearFine = true;
      if (i && isLand(lat, lon)) return false;
    }
    if (nearFine) { // côte précise : pas de 40 m pour ne pas sauter une digue ou une flèche de sable
      const n2 = Math.ceil(km / 0.04);
      for (let i = 1; i < n2; i++) { const f = i / n2; if (isLand(a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f)) return false; }
    }
    return true;
  }
  function routeClear(legs) {
    for (let i = 1; i < legs.length; i++) if (!segmentClear(legs[i - 1], legs[i])) return false;
    return true;
  }
  // Point ramené en mer : pas dans un petit bassin fermé (on doit pouvoir faire 0,5 M en ligne droite)
  function openSea(q) {
    if (!fineOn) return true;
    for (let a = 0; a < 360; a += 15) {
      const r = { lat: q.lat + 0.5 / 60 * Math.cos(rad(a)), lon: q.lon + 0.5 / 60 * Math.sin(rad(a)) / Math.cos(rad(q.lat)) };
      if (segmentClear(q, r)) return true;
    }
    return false;
  }
  // ---------- Chenal (rivière, estuaire, port au fond d'une ria) ----------
  // Les isochrones avancent par grands bonds : dans une rivière sinueuse comme le Trieux, elles restent bloquées.
  // On cherche alors sur une grille de 55 m le chemin d'eau jusqu'à la mer ouverte (distance normale à la côte).
  function isOpen(q) {
    const cn = coastNear, cm = chanMode, ho = hazOn; coastNear = []; chanMode = false; hazOn = false; // fin du chenal : côte seule
    let r = !isLand(q.lat, q.lon);
    if (r) { // au moins 135° de directions libres sur 1,2 M : les isochrones peuvent partir de là
      let ok = 0;
      for (let a = 0; a < 360 && ok < 9; a += 15) if (segmentClear(q, move(q, a, 1.2))) ok++;
      r = ok >= 9;
    }
    coastNear = cn; chanMode = cm; hazOn = ho;
    return r;
  }
  function channel(p, maxNm = 6) {
    if (isOpen(p)) return null;
    chanMode = true;
    try {
      const st = 0.03 / 60, stL = st / Math.cos(rad(p.lat)), R = Math.round(maxNm / 0.03);
      const at = (i, j) => ({ lat: p.lat + i * st, lon: p.lon + j * stL });
      const par = new Map([['0,0', null]]), q = [[0, 0]];
      let found = null;
      const cheapOpen = c => { const cn = coastNear, cm = chanMode; coastNear = []; chanMode = false; const r = !isLand(c.lat, c.lon); coastNear = cn; chanMode = cm; return r; };
      for (let h = 0; h < q.length && !found && q.length < 250000; h++) {
        const [i, j] = q[h];
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const a = i + di, b = j + dj, k = `${a},${b}`;
          if (par.has(k) || Math.abs(a) > R || Math.abs(b) > R) continue;
          const c = at(a, b), m = at(i + di / 2, j + dj / 2);
          if (isLand(c.lat, c.lon) || isLand(m.lat, m.lon)) { par.set(k, false); continue; }
          par.set(k, `${i},${j}`); q.push([a, b]);
          if (cheapOpen(c) && isOpen(c)) { found = k; break; }
        }
      }
      if (!found) return null;
      const path = [];
      for (let k = found; k; k = par.get(k)) { const [a, b] = k.split(',').map(Number); path.push(at(a, b)); }
      path.reverse(); path[0] = { lat: p.lat, lon: p.lon };
      // Tirer la ficelle : le moins de points possible, sans toucher la terre
      const out = [path[0]];
      for (let i = 0; i < path.length - 1;) {
        let j = path.length - 1;
        while (j > i + 1 && !segmentClear(path[i], path[j])) j--;
        out.push(path[j]); i = j;
      }
      return out;
    } finally { chanMode = false; }
  }
  // Bords du chenal : à la voile si possible, sinon au louvoyage (VMG) ou au moteur s'il est autorisé
  function chanLegs(pts, t) {
    const legs = [];
    chanMode = true;
    try {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const r = sailStraight(a, b, t, 0.25, Infinity, Infinity);
        if (r && r.pts.length) { legs.push(...r.pts); t = r.h; continue; }
        const w = windAt(a.lat, a.lon, t); if (!w) return null;
        const brg = bearing(a, b);
        // Ligne droite impossible à la voile (face au vent ou vent arrière) : on tire des bords dans le passage
        let vmg = 0, bs = { s: 0, m: false }, bd = 0;
        for (let d = -90; d <= 90; d += 5) { const x = boatSpeed(norm360(brg + d) - w.twd, w.tws), v = x.s * Math.cos(rad(d)); if (v > vmg) { vmg = v; bs = x; bd = d; } }
        if (OPT.eng && vmg < OPT.engs && w.tws <= OPT.wmax && motOk(brg - w.twd, w.tws)) { vmg = OPT.engs; bs = { s: OPT.engs, m: true }; bd = 0; }
        const sog = Math.max(0.5, vmg), tack = !bs.m && Math.abs(bd) >= 5;
        legs.push({ lat: a.lat, lon: a.lon, h: t, hdg: tack ? norm360(brg + bd) : brg, hdg2: tack ? norm360(brg - bd) : null, tack, tws: w.tws, twd: w.twd, bsp: bs.s, mot: bs.m, wv: waveAt(a.lat, a.lon, t), cog: brg, sog, cu: null });
        t += distNm(a, b) / sog;
      }
    } finally { chanMode = false; }
    const z = pts[pts.length - 1];
    legs.push({ lat: z.lat, lon: z.lon, h: t, hdg: null, tws: null, twd: null, bsp: null, mot: false, wv: null });
    return { legs, h: t };
  }
  // Passage d'eau étroit entre deux plans d'eau ouverts (canal de Caronte vers l'étang de Berre…) :
  // chemin le plus court sur une grille de 55 m (A*), puis on repère la partie étroite.
  function narrowPass(a, b, maxCells = 1500000) {
    narrowOk = true; chanMode = true;
    try {
      const st = 0.0135 / 60, stL = st / Math.cos(rad(a.lat)); // 25 m
      const at = (i, j) => ({ lat: a.lat + i * st, lon: a.lon + j * stL });
      const bi = Math.round((b.lat - a.lat) / st), bj = Math.round((b.lon - a.lon) / stL);
      const hfn = (i, j) => { const di = Math.abs(i - bi), dj = Math.abs(j - bj); return Math.max(di, dj) + 0.4142 * Math.min(di, dj); };
      const g = new Map([['0,0', 0]]), par = new Map([['0,0', null]]);
      const heap = [[2 * hfn(0, 0), 0, 0]];
      const push = e => { heap.push(e); let k = heap.length - 1; while (k) { const u = (k - 1) >> 1; if (heap[u][0] <= heap[k][0]) break; [heap[u], heap[k]] = [heap[k], heap[u]]; k = u; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
      let found = null, n = 0;
      while (heap.length && n++ < maxCells) {
        const [, i, j] = pop(), k0 = `${i},${j}`, g0 = g.get(k0);
        if (Math.abs(i - bi) <= 1 && Math.abs(j - bj) <= 1) { found = k0; break; }
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const x = i + di, y = j + dj, k = `${x},${y}`;
          const c = at(x, y), m = at(i + di / 2, j + dj / 2);
          // l'eau la plus large d'abord : à moins de 40 m d'une berge, chaque pas coûte 6 fois plus
          let ng = g0 + (di && dj ? 1.4142 : 1);
          if (g.has(k) && g.get(k) <= ng) continue;
          if (isLand(c.lat, c.lon) || isLand(m.lat, m.lon)) continue;
          const w = 40 / 1852 / 60, wl = w / Math.cos(rad(c.lat));
          if (isLand(c.lat + w, c.lon) || isLand(c.lat - w, c.lon) || isLand(c.lat, c.lon + wl) || isLand(c.lat, c.lon - wl)) ng += (di && dj ? 1.4142 : 1) * 5;
          if (g.has(k) && g.get(k) <= ng) continue;
          g.set(k, ng); par.set(k, k0); push([ng + 2 * hfn(x, y), x, y]);
        }
      }
      if (!found) return null;
      const path = [];
      for (let k = found; k; k = par.get(k)) { const [x, y] = k.split(',').map(Number); path.push(at(x, y)); }
      path.reverse(); path[0] = { lat: a.lat, lon: a.lon }; path.push({ lat: b.lat, lon: b.lon });
      // morceaux : étroits (chemin le plus court) et ouverts (isochrones)
      narrowOk = false; chanMode = false;
      const N = path.length, open = new Array(N).fill(true);
      for (let i = 0; i < N; i += 6) { const o = isOpen(path[i]); for (let j = Math.max(0, i - 6); j <= Math.min(N - 1, i + 6); j++) if (!o) open[j] = false; }
      if (!isOpen(path[N - 1])) for (let j = Math.max(0, N - 7); j < N; j++) open[j] = false;
      if (open.every(Boolean)) return null;
      narrowOk = true; chanMode = true;
      const pull = mid => { const out = [mid[0]]; for (let i = 0; i < mid.length - 1;) { let j = mid.length - 1; while (j > i + 1 && !segmentClear(mid[i], mid[j])) j--; out.push(mid[j]); i = j; } return out; };
      const parts = [];
      for (let i = 0; i < N;) {
        let j = i; while (j + 1 < N && open[j + 1] === open[i]) j++;
        const e = Math.min(N - 1, j + 1);
        parts.push(open[i] ? { open: true, a: path[i], b: path[e] } : { open: false, pts: pull(path.slice(i, e + 1)) });
        i = j + 1;
      }
      parts.path = path; parts.open = open;
      return parts;
    } finally { narrowOk = false; chanMode = false; }
  }
  function snapToSea(p) {
    if (!isLand(p.lat, p.lon)) return { p, moved: 0 };
    for (let r = 0.0005; r <= 0.12; r += (r < 0.01 ? 0.0005 : 0.005)) {
      for (let a = 0; a < 360; a += 10) {
        const q = { lat: p.lat + r * Math.cos(rad(a)), lon: p.lon + r * Math.sin(rad(a)) / Math.cos(rad(p.lat)) };
        if (!isLand(q.lat, q.lon) && openSea(q)) return { p: q, moved: distNm(p, q) };
      }
    }
    return null;
  }

  // ---------- Économie de requêtes Open-Meteo (gratuit : 10 000 points par jour et par connexion) ----------
  // Mémoire de la session (pas de stockage) : recalculer la même zone avec d'autres réglages ne retélécharge rien.
  const omCache = new Map();
  async function omJson(url) {
    const c = omCache.get(url);
    if (c && Date.now() - c.t < 45 * 60e3) return c.j;
    const r = await fetch(url);
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok || !j || j.error) throw new Error(omError((j && j.reason) || '', r.status));
    omCache.set(url, { t: Date.now(), j });
    return j;
  }
  let omLimited = false;
  function omError(reason, status) {
    const t = String(reason);
    if (/daily/i.test(t)) { omLimited = true; return 'Limite gratuite d\u2019Open-Meteo atteinte pour aujourd\u2019hui sur cette connexion (10 000 points météo par jour, partagés avec les autres utilisateurs du même réseau). Réessayez demain, ou changez de connexion : Wi-Fi au lieu de 4G, ou l\u2019inverse.'; }
    if (/hour/i.test(t)) { omLimited = true; return 'Limite gratuite d\u2019Open-Meteo atteinte pour cette heure sur cette connexion. Réessayez dans une heure, ou changez de connexion (Wi-Fi ou 4G).'; }
    if (/minut/i.test(t) || status === 429) { omLimited = true; return 'Trop de demandes météo en une minute. Attendez une minute puis touchez à nouveau « Calculer la route ».'; }
    return t || `Open-Meteo ${status}`;
  }
  // Point de grille dont tout le carré voisin (± une maille) est de la terre : aucune position en mer
  // ne s'en sert pour interpoler, inutile de demander le vent ou les vagues
  function inland(lat, lon, step) {
    const d = Math.min(0.05, step / 4);
    for (let y = lat - step; y <= lat + step + 1e-9; y += d) for (let x = lon - step; x <= lon + step + 1e-9; x += d) if (!surelyLand(y, x)) return false;
    return true;
  }
  function surelyLand(lat, lon) {
    const k = tileKey(lat, lon), v = maskIndex && maskIndex[k];
    if (!v) return false;
    if (v === 1) return true;
    const m = masks.get(k);
    if (!m) return false;
    const tx = Math.floor(lon / TILE) * TILE, ty = Math.floor(lat / TILE) * TILE, N = TILE * MASK_RES;
    return m[Math.min(N - 1, Math.floor((ty + TILE - lat) * MASK_RES)) * N + Math.min(N - 1, Math.floor((lon - tx) * MASK_RES))] === 1;
  }

  // Open-Meteo refuse les longitudes hors de -180..180 (grille élargie au-delà de l'antiméridien)
  const wrapLon = l => +((((l + 180) % 360) + 360) % 360 - 180).toFixed(3);
  const clampLat = l => Math.max(-89.9, Math.min(89.9, l));
  // ---------- Vent Open-Meteo ----------
  let wind = null; // {lats, lons, t0, times(h), u, v, nx, ny, nt}

  async function loadWind(bb, days, modelId, onProgress) {
    const span = Math.max(bb.n - bb.s, bb.e - bb.w);
    const M = MODELS.find(x => x.id === modelId) || {};
    // Modèle fin (AROME) : grille jusqu'à 0,1° pour garder le détail près des côtes
    const step = M.fine ? Math.max(0.1, Math.ceil((span / 14) * 10) / 10) : Math.max(0.25, Math.ceil((span / 14) * 4) / 4);
    const lats = [], lons = [];
    // Grille calée sur des multiples du pas : déplacer un peu un point redemande les mêmes données (mémoire)
    const s0 = Math.round(bb.s / step) * step, n0 = Math.round(bb.n / step) * step;
    const w0 = Math.round(bb.w / step) * step, e0 = Math.round(bb.e / step) * step;
    for (let y = s0; y <= n0 + 1e-9; y += step) lats.push(+y.toFixed(3));
    for (let x = w0; x <= e0 + 1e-9; x += step) lons.push(+x.toFixed(3));
    const pts = [], keep = [];
    lats.forEach(la => lons.forEach(lo => { const k = pts.length; pts.push([la, lo]); if (!inland(la, lo, step)) keep.push(k); }));
    const chunks = [];
    for (let i = 0; i < keep.length; i += 80) chunks.push(keep.slice(i, i + 80).map(k => pts[k]));

    let done = 0;
    const results = new Array(chunks.length);
    async function get(ci) {
      const c = chunks[ci];
      const url = 'https://api.open-meteo.com/v1/forecast'
        + `?latitude=${c.map(p => clampLat(p[0])).join(',')}`
        + `&longitude=${c.map(p => wrapLon(p[1])).join(',')}`
        + `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kn`
        + `&models=${modelId}&forecast_days=${days}&timezone=UTC&cell_selection=sea`;
      const j = await omJson(url);
      results[ci] = Array.isArray(j) ? j : [j];
      done++;
      onProgress && onProgress(done / chunks.length);
    }
    const queue = chunks.map((_, i) => i);
    await Promise.all([0, 1, 2].map(async () => { while (queue.length) await get(queue.shift()); }));

    const got = results.flat();
    if (!got.length) throw new Error('Pas de mer dans cette zone.');
    const tStr = got[0].hourly.time;
    const t0 = Date.parse(tStr[0] + 'Z');
    const nx = lons.length, ny = lats.length;
    // Points à l'intérieur des terres non demandés : vent vide (comme la terre)
    const empty = { hourly: { wind_speed_10m: [], wind_direction_10m: [], wind_gusts_10m: [] } };
    const flat = pts.map(() => empty); keep.forEach((k, i) => { flat[k] = got[i]; });
    // Fin de prévision : on coupe aux dernières heures où la plupart des points ont du vent
    let nt = tStr.length;
    while (nt > 2 && got.filter(l => l.hourly.wind_speed_10m[nt - 1] != null).length < got.length * 0.5) nt--;
    if (!flat.some(l => l.hourly.wind_speed_10m.slice(0, nt).some(x => x != null))) throw new Error('Pas de vent pour cette zone avec ce modèle. Choisissez un autre modèle.');
    const u = new Float32Array(nt * ny * nx), v = new Float32Array(nt * ny * nx), g = new Float32Array(nt * ny * nx);
    flat.forEach((loc, k) => {
      const iy = Math.floor(k / nx), ix = k % nx;
      const S = loc.hourly.wind_speed_10m, D = loc.hourly.wind_direction_10m, G = loc.hourly.wind_gusts_10m || [];
      for (let t = 0; t < nt; t++) {
        const o = (t * ny + iy) * nx + ix;
        g[o] = G[t] == null ? NaN : G[t];
        if (S[t] == null || D[t] == null) { u[o] = NaN; v[o] = NaN; continue; }
        const d = rad(D[t]);
        u[o] = -S[t] * Math.sin(d);
        v[o] = -S[t] * Math.cos(d);
      }
    });
    return { lats, lons, step, t0, nt, nx, ny, u, v, g, bb, keep };
  }

  // h = heures depuis wind.t0. Renvoie {tws, twd} ou null hors données.
  function windAt(lat, lon, h) {
    const W = wind;
    if (!W || h < 0 || h > W.nt - 1) return null;
    const fx = (lon - W.lons[0]) / W.step, fy = (lat - W.lats[0]) / W.step;
    if (fx < 0 || fy < 0 || fx > W.nx - 1 || fy > W.ny - 1) return null;
    const x0 = Math.min(W.nx - 2, Math.floor(fx)), y0 = Math.min(W.ny - 2, Math.floor(fy));
    const ax = fx - x0, ay = fy - y0;
    const t0 = Math.min(W.nt - 2, Math.floor(h)), at = h - t0;
    let U = 0, V = 0, Gs = 0, Gw = 0;
    for (let dt = 0; dt < 2; dt++) {
      const wt = dt ? at : 1 - at;
      if (wt === 0) continue;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const w = wt * (dy ? ay : 1 - ay) * (dx ? ax : 1 - ax);
        if (w === 0) continue;
        const o = ((t0 + dt) * W.ny + y0 + dy) * W.nx + x0 + dx;
        const uu = W.u[o], vv = W.v[o];
        if (Number.isNaN(uu)) return null;
        U += w * uu; V += w * vv;
        if (W.g && !Number.isNaN(W.g[o])) { Gs += w * W.g[o]; Gw += w; }
      }
    }
    const tws = Math.hypot(U, V);
    return { tws, twd: norm360(deg(Math.atan2(-U, -V))), gu: Gw > 0.5 ? Math.max(tws, Gs / Gw) : null };
  }

  // ---------- Vagues Open-Meteo Marine (grille propre, plus fine que le vent près des côtes) ----------
  // La grille du vent (0,25° pour ECMWF/GFS) est trop lâche pour les vagues : près d'une côte, ses points
  // tombent sur la terre et la valeur du départ venait du large (ex. Cavalaire : mer du sud des îles).
  // On prend une grille dédiée, de 0,05° (≈ 5 km) sur un petit trajet jusqu'à la maille du vent sur un grand,
  // et chaque point est rattaché par Open-Meteo à la case de mer la plus proche (cell_selection=sea).
  let waves = null; // {off, nt, hs, cx, cy, tp, lats, lons, step, nx, ny} ; hs en m, direction d'où viennent les vagues
  async function loadWaves(days, wm) {
    const W = wind;
    const s = W.lats[0], n = W.lats[W.lats.length - 1], w = W.lons[0], e = W.lons[W.lons.length - 1];
    const span = Math.max(n - s, e - w);
    const step = Math.min(W.step, Math.max(0.05, Math.ceil((span / 16) * 20) / 20));
    const lats = [], lons = [];
    for (let y = s; y <= n + 1e-9; y += step) lats.push(+y.toFixed(3));
    for (let x = w; x <= e + 1e-9; x += step) lons.push(+x.toFixed(3));
    if (lats[lats.length - 1] < n - 1e-9) lats.push(+(lats[lats.length - 1] + step).toFixed(3));
    if (lons[lons.length - 1] < e - 1e-9) lons.push(+(lons[lons.length - 1] + step).toFixed(3));
    const nx = lons.length, ny = lats.length, pts = [], keep = [];
    lats.forEach(la => lons.forEach(lo => { const k = pts.length; pts.push([la, lo]); if (!inland(la, lo, step)) keep.push(k); }));
    if (!keep.length) return null;
    const chunks = [];
    for (let i = 0; i < keep.length; i += 80) chunks.push(keep.slice(i, i + 80).map(k => pts[k]));
    const results = new Array(chunks.length);
    async function get(ci) {
      const c = chunks[ci];
      const url = 'https://marine-api.open-meteo.com/v1/marine'
        + `?latitude=${c.map(p => clampLat(p[0])).join(',')}&longitude=${c.map(p => wrapLon(p[1])).join(',')}`
        + `&hourly=wave_height,wave_direction,wave_period&forecast_days=${Math.min(16, days)}&timezone=UTC&cell_selection=sea${wm ? `&models=${wm}` : ''}`;
      const j = await omJson(url);
      results[ci] = Array.isArray(j) ? j : [j];
    }
    const queue = chunks.map((_, i) => i);
    await Promise.all([0, 1, 2].map(async () => { while (queue.length) await get(queue.shift()); }));
    const got = results.flat();
    const flat = pts.map(() => ({ hourly: { wave_height: [], wave_direction: [], wave_period: [] } }));
    keep.forEach((k, i) => { flat[k] = got[i]; });
    const tStr = got[0].hourly.time, nt = tStr.length, nn = nx * ny;
    const hs = new Float32Array(nt * nn).fill(NaN), cx = new Float32Array(nt * nn), cy = new Float32Array(nt * nn), tp = new Float32Array(nt * nn);
    flat.forEach((loc, k) => {
      if (!loc || !loc.hourly) return;
      const H = loc.hourly.wave_height || [], D = loc.hourly.wave_direction || [], T = loc.hourly.wave_period || [];
      for (let t = 0; t < nt; t++) {
        if (H[t] == null) continue;
        const o = t * nn + k;
        hs[o] = H[t]; tp[o] = T[t] || 0;
        const d = rad(D[t] || 0); cx[o] = Math.sin(d); cy[o] = Math.cos(d);
      }
    });
    return { off: (Date.parse(tStr[0] + 'Z') - W.t0) / 3.6e6, nt, hs, cx, cy, tp, lats, lons, step, nx, ny };
  }
  // Vagues à un point et une heure (h = heures depuis wind.t0) : {hs, dir, tp} ou null (terre, hors prévision)
  function waveAt(lat, lon, h) {
    const V = waves;
    if (!V || !wind) return null;
    const t = h - V.off;
    if (t < 0 || t > V.nt - 1) return null;
    const G = V.lats ? V : { lats: wind.lats, lons: wind.lons, step: wind.step, nx: wind.nx, ny: wind.ny };
    const fx = (lon - G.lons[0]) / G.step, fy = (lat - G.lats[0]) / G.step;
    if (fx < 0 || fy < 0 || fx > G.nx - 1 || fy > G.ny - 1) return null;
    const x0 = Math.min(G.nx - 2, Math.floor(fx)), y0 = Math.min(G.ny - 2, Math.floor(fy));
    const ax = fx - x0, ay = fy - y0, t0 = Math.min(V.nt - 2, Math.floor(t)), at = t - t0, n = G.nx * G.ny;
    let S = 0, H = 0, X = 0, Y = 0, T = 0;
    for (let dt = 0; dt < 2; dt++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const w = (dt ? at : 1 - at) * (dy ? ay : 1 - ay) * (dx ? ax : 1 - ax);
      if (w === 0) continue;
      const o = (t0 + dt) * n + (y0 + dy) * G.nx + x0 + dx;
      if (Number.isNaN(V.hs[o])) continue; // case sur la terre : on l'ignore
      S += w; H += w * V.hs[o]; X += w * V.cx[o]; Y += w * V.cy[o]; T += w * V.tp[o];
    }
    if (S < 0.25) return null;
    return { hs: H / S, dir: norm360(deg(Math.atan2(X, Y))), tp: T / S };
  }

  // ---------- Courant (marée comprise) : Météo-France SMOC via Open-Meteo Marine, maille 8 km, 10 jours ----------
  let currents = null; // {off, nt, u, v} en nœuds, sens où va le courant
  const curCache = new Map();
  async function loadCurrents(days) {
    const W = wind, pts = [];
    const nd = Math.min(10, days);
    const key = `${W.lats[0]}:${W.lons[0]}:${W.step}:${W.nx}:${W.ny}:${nd}`;
    const hit = curCache.get(key);
    if (hit && Date.now() - hit.at < 45 * 60e3) return hit.c ? { ...hit.c, off: (hit.c.tA - W.t0) / 3.6e6 } : null;
    for (const la of W.lats) for (const lo of W.lons) pts.push([la, lo]);
    const keep = W.keep || pts.map((_, k) => k);
    const chunks = [];
    for (let i = 0; i < keep.length; i += 80) chunks.push(keep.slice(i, i + 80).map(k => pts[k]));
    const results = new Array(chunks.length);
    async function get(ci) {
      const c = chunks[ci];
      const url = 'https://marine-api.open-meteo.com/v1/marine'
        + `?latitude=${c.map(p => clampLat(p[0])).join(',')}&longitude=${c.map(p => wrapLon(p[1])).join(',')}`
        + `&hourly=ocean_current_velocity,ocean_current_direction&forecast_days=${nd}&timezone=UTC&cell_selection=sea`;
      const j = await omJson(url);
      results[ci] = Array.isArray(j) ? j : [j];
    }
    const queue = chunks.map((_, i) => i);
    await Promise.all([0, 1, 2].map(async () => { while (queue.length) await get(queue.shift()); }));
    const got = results.flat();
    if (!got.length || !got[0].hourly) return null;
    // Unité donnée par l'API (km/h par défaut) : conversion en nœuds
    const unit = String((got[0].hourly_units || {}).ocean_current_velocity || 'km/h').toLowerCase();
    const f = unit.includes('m/s') ? 1.943844 : unit.startsWith('kn') ? 1 : unit.includes('mp') ? 0.868976 : 1 / 1.852;
    const tStr = got[0].hourly.time, nt = tStr.length, n = W.nx * W.ny;
    const u = new Float32Array(nt * n).fill(NaN), v = new Float32Array(nt * n).fill(NaN);
    let any = false;
    keep.forEach((k, i) => {
      const loc = got[i]; if (!loc || !loc.hourly) return;
      const S = loc.hourly.ocean_current_velocity || [], D = loc.hourly.ocean_current_direction || [];
      for (let t = 0; t < nt; t++) {
        if (S[t] == null || D[t] == null) continue;
        const o = t * n + k, sp = S[t] * f, d = rad(D[t]);
        u[o] = sp * Math.sin(d); v[o] = sp * Math.cos(d); any = true;
      }
    });
    const tA = Date.parse(tStr[0] + 'Z');
    const c = any ? { tA, nt, u, v } : null;
    curCache.set(key, { at: Date.now(), c });
    return c ? { ...c, off: (tA - W.t0) / 3.6e6 } : null;
  }
  // Courant à un point et une heure : {u, v, sp, dir} en nœuds (dir = vers où il va), ou null (terre, hors prévision)
  function curAt(lat, lon, h) {
    const C = currents, W = wind;
    if (!C || !W) return null;
    const t = h - C.off;
    if (t < 0 || t > C.nt - 1) return null;
    const fx = (lon - W.lons[0]) / W.step, fy = (lat - W.lats[0]) / W.step;
    if (fx < 0 || fy < 0 || fx > W.nx - 1 || fy > W.ny - 1) return null;
    const x0 = Math.min(W.nx - 2, Math.floor(fx)), y0 = Math.min(W.ny - 2, Math.floor(fy));
    const ax = fx - x0, ay = fy - y0, t0 = Math.min(C.nt - 2, Math.floor(t)), at = t - t0, n = W.nx * W.ny;
    let S = 0, U = 0, V = 0;
    for (let dt = 0; dt < 2; dt++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const w = (dt ? at : 1 - at) * (dy ? ay : 1 - ay) * (dx ? ax : 1 - ax);
      if (w === 0) continue;
      const o = (t0 + dt) * n + (y0 + dy) * W.nx + x0 + dx;
      if (Number.isNaN(C.u[o])) continue;
      S += w; U += w * C.u[o]; V += w * C.v[o];
    }
    if (S < 0.25) return null;
    U /= S; V /= S;
    return { u: U, v: V, sp: Math.hypot(U, V), dir: norm360(deg(Math.atan2(U, V))) };
  }
  // Courant utilisé par le routage (réglage « Avec courant »)
  const curUse = (lat, lon, h) => (OPT.cur && currents ? curAt(lat, lon, h) : null);
  // Cap à tenir pour suivre une route fond donnée malgré le courant : {hdg, bs, sog} ou null
  function steer(brg, w, c, keepMot) {
    const spd = hd => {
      let bs = boatSpeed(hd - w.twd, w.tws);
      if (keepMot && OPT.eng && !bs.m && bs.s < OPT.engs && w.tws <= OPT.wmax && motOk(hd - w.twd, w.tws)) bs = { s: OPT.engs, m: true };
      return bs;
    };
    if (!c) { const bs = spd(brg); return { hdg: brg, bs, sog: bs.s }; }
    const b = rad(brg), cn = c.u * Math.cos(b) - c.v * Math.sin(b), ct = c.u * Math.sin(b) + c.v * Math.cos(b);
    let hdg = brg, bs = spd(hdg);
    for (let k = 0; k < 4; k++) {
      if (bs.s < 0.2) return null;
      const x = -cn / bs.s;
      if (Math.abs(x) > 0.97) return null;
      hdg = norm360(brg + deg(Math.asin(x))); bs = spd(hdg);
    }
    if (bs.s < 0.2) return null;
    const x = -cn / bs.s;
    if (Math.abs(x) > 1) return null;
    const sog = bs.s * Math.sqrt(1 - x * x) + ct;
    return sog > 0.2 ? { hdg, bs, sog } : null;
  }
  // Près des côtes (terre à moins de 4 M) : le courant de marée du modèle à 8 km y est peu fiable
  function nearCoast(lat, lon) {
    for (const d of [1.5, 4]) for (let a = 0; a < 360; a += 45) { const q = move({ lat, lon }, a, d); if (isLand(q.lat, q.lon)) return true; }
    return false;
  }

  // ---------- Isochrones ----------
  // À chaque pas, chaque point avance dans 72 caps.
  // 'sector' : par degré vu du départ, on garde le plus avancé. Optimal en eau libre.
  // 'wave'   : une case de mer ne garde que le premier passage. Contourne les caps et les îles.
  async function route(start, end, h0, onStep, mode = 'sector') {
    const wave = mode === 'wave';
    const total = distNm(start, end);
    const dt = Math.min(2, Math.max(0.25, Math.round((total / 6 / 50) * 4) / 4));
    const HDG = 5;
    const cellNm = Math.max(0.2, 6 * dt / 2.5);
    const SEC = total > 300 ? 2 : 1; // secteurs de 1° (0,5° au long cours)
    const cLat = cellNm / 60;
    const cellOf = q => `${Math.floor(q.lat / cLat)}:${Math.floor(q.lon * Math.cos(rad(q.lat)) / cLat)}`;
    const seen = new Set([cellOf(start)]);
    const limit = total * 1.8 + 20; // ellipse autour du trajet direct
    let frontier = [{ ...start, h: h0, parent: null }];
    const isos = [];
    let best = null, horizon = false, minD = Infinity, hImprove = h0;
    // Pourquoi ça bloque : compte des refus par vent, vagues, terre
    const rej = { wind: 0, wave: 0, land: 0, windMin: Infinity, waveMin: Infinity };
    const maxSteps = Math.floor((wind.nt - 1 - h0) / dt);

    for (let k = 0; k < maxSteps; k++) {
      const h = h0 + k * dt;
      const next = new Map(); const land0 = rej.land, wave0 = rej.wave;
      for (const p of frontier) {
        const w = windAt(p.lat, p.lon, h);
        if (!w) { horizon = true; continue; }
        const wv = waveAt(p.lat, p.lon, h);
        const tooBig = q => { const x = waveAt(q.lat, q.lon, h + dt); if (x && x.hs > OPT.hmax) { rej.wave++; rej.waveMin = Math.min(rej.waveMin, x.hs); return true; } return false; };
        if (w.tws > OPT.wmax) { rej.wind++; rej.windMin = Math.min(rej.windMin, w.tws); }
        const dD = distNm(p, end), bD = bearing(p, end);
        const cu = curUse(p.lat, p.lon, h);
        const stD = steer(bD, w, cu), sD = stD ? stD.sog : 0;
        if (sD > 0.2 && dD <= sD * dt && segmentClear(p, end) && !tooBig(end)) {
          const ta = h + dD / sD;
          if (!best || ta < best.h) best = { ...end, h: ta, parent: p, hdg: stD.hdg, tws: w.tws, twd: w.twd, bsp: stD.bs.s, mot: stD.bs.m, wv, cog: bD, sog: sD, cu };
        }
        for (let a = 0; a < 360; a += HDG) {
          const bs = boatSpeed(a - w.twd, w.tws), s = bs.s;
          if (s < 0.2) continue;
          // Avec courant : on avance sur le fond (vitesse surface + courant)
          let cg = a, sg = s;
          if (cu) { const vx = s * Math.sin(rad(a)) + cu.u, vy = s * Math.cos(rad(a)) + cu.v; sg = Math.hypot(vx, vy); cg = norm360(deg(Math.atan2(vx, vy))); if (sg < 0.2) continue; }
          const q = move(p, cg, sg * dt);
          const c = cellOf(q);
          if (wave && seen.has(c)) continue;
          const dE = distNm(q, end);
          const dS = distNm(start, q);
          if (dS + dE > limit) continue;
          // Secteurs : le plus loin du départ par degré. Vague : le plus près de l'arrivée par case.
          const key = wave ? c : Math.round(bearing(start, q) * SEC);
          const cur = next.get(key);
          if (cur && (wave ? cur.dE <= dE : cur.dS >= dS)) continue;
          if (!segmentClear(p, q)) { rej.land++; continue; }
          if (tooBig(q)) continue;
          next.set(key, { lat: q.lat, lon: q.lon, h: h + dt, parent: p, hdg: a, tws: w.tws, twd: w.twd, bsp: s, mot: bs.m, wv, dE, dS, c, cog: cg, sog: sg, cu });
        }
      }
      if (best) break;
      // Calme plat partout : on attend sur place le retour du vent au lieu d'abandonner
      if (!next.size && frontier.length && rej.land === land0 && rej.wave === wave0) { rej.calm = (rej.calm || 0) + 1; frontier = frontier.map(p => ({ ...p, h: h + dt })); continue; }
      frontier = [...next.values()];
      if (wave) for (const p of frontier) seen.add(p.c);
      if (!frontier.length) break;
      if (frontier.length > 5000) frontier = frontier.sort((x, y) => x.dE - y.dE).slice(0, 5000);
      const dMin = Math.min(...frontier.map(p => p.dE));
      if (dMin < minD - 0.5) { minD = dMin; hImprove = h; }
      else if (h - hImprove > (wave ? 48 : 24)) return { error: 'stuck', isos, rej };
      isos.push(frontier.map(p => [p.lon, p.lat, bearing(start, p)]).sort((x, y) => x[2] - y[2]));
      if (k % 3 === 0) { onStep && onStep(k / maxSteps, isos); await new Promise(r => setTimeout(r, 0)); }
    }
    if (!best) return { error: horizon || frontier.length ? 'horizon' : 'blocked', isos, rej };

    const path = [];
    for (let n = best; n; n = n.parent) path.push(n);
    path.reverse();
    // Le cap et le vent d'un nœud décrivent le bord qui y arrive. On les décale vers le nœud de départ du bord.
    let legs = path.map((n, i) => {
      const nx = path[i + 1];
      return { lat: n.lat, lon: n.lon, h: n.h, hdg: nx ? nx.hdg : null, tws: nx ? nx.tws : null, twd: nx ? nx.twd : null, bsp: nx ? nx.bsp : null, mot: nx ? nx.mot : false, wv: nx ? nx.wv : null, cog: nx ? nx.cog : null, sog: nx ? nx.sog : null, cu: nx ? nx.cu : null };
    });
    const st = straighten(path, dt);
    if (st && st[st.length - 1].h <= best.h + 0.25 + (best.h - h0) * 0.03) legs = st;
    legs = pullString(legs, dt);
    legs = mergeTacks(legs, dt);
    legs = removeHooks(legs, dt);
    // S'il y a une attente : combien de temps gagné si on accepte un peu plus de vagues ?
    let alt = null;
    const wi = legs.findIndex(l => l.wait);
    if (wi >= 0) {
      const a = legs[wi], r2 = sailStraight(a, end, a.h, dt, Infinity, Infinity);
      if (r2 && r2.h < legs[legs.length - 1].h - 0.25) {
        const xe = waveAt(end.lat, end.lon, r2.h);
        const hsAlt = Math.max(xe ? xe.hs : 0, ...r2.pts.map(p => (p.wv ? p.wv.hs : 0)));
        const hsRoute = Math.max(0, ...legs.map(l => (l.wv ? l.wv.hs : 0)));
        if (hsAlt <= Math.max(hsRoute, OPT.hmax) + 0.3) {
          // Attendre ne vaut pas la peine pour quelques centimètres de vagues : on continue tout droit.
          legs = [...legs.slice(0, wi), ...r2.pts, { lat: end.lat, lon: end.lon, h: r2.h, hdg: null, tws: null, twd: null, bsp: null, mot: false, wv: null }];
        } else alt = { h: r2.h, hs: hsAlt };
      }
    }
    let dist = 0;
    for (let i = 1; i < legs.length; i++) dist += distNm(legs[i - 1], legs[i]);
    return { legs, dist, dur: legs[legs.length - 1].h - h0, isos, dt, alt };
  }

  // ---------- Redresser la route ----------
  // Les isochrones laissent des petits bords sans intérêt (surtout le long d'une limite de vagues ou de vent).
  // On tire la ficelle : depuis chaque point, on cherche le point le plus loin de la route qu'on peut
  // rejoindre en ligne droite, en respectant vent max, vagues max et terre, sans arriver plus tard.
  function sailStraight(a, b, t, dt, tMax, hLim = OPT.hmax * 1.1 + 0.05, keepMot = false) {
    const out = [];
    let cur = { lat: a.lat, lon: a.lon }, h = t;
    const tau = Math.min(0.5, dt);
    for (let k = 0; k < 400; k++) {
      const rem = distNm(cur, b);
      if (rem < 0.05) break;
      const w = windAt(cur.lat, cur.lon, h);
      if (!w) return null;
      const brg = bearing(cur, b), cu = curUse(cur.lat, cur.lon, h);
      // Déjà au moteur : on ne remet pas les voiles pour aller moins vite, on garde le moteur (dans steer)
      const st = steer(brg, w, cu, keepMot);
      if (!st) return null;
      const bs = st.bs, hdg = st.hdg, sg = st.sog;
      if (!(sg > 0.05)) return null; // face au vent : pas de ligne droite possible
      const step = Math.min(rem, sg * tau);
      const nxt = rem - step < 0.05 ? { lat: b.lat, lon: b.lon } : move(cur, brg, step);
      const nh = h + step / sg;
      const x = waveAt(nxt.lat, nxt.lon, nh);
      if (x && x.hs > hLim) return null; // 10 % de marge : 2,0 ou 2,1 m, c'est pareil en mer
      if (nh > tMax) return null;
      out.push({ lat: cur.lat, lon: cur.lon, h, hdg, tws: w.tws, twd: w.twd, bsp: bs.s, mot: bs.m, wv: waveAt(cur.lat, cur.lon, h), cog: brg, sog: sg, cu });
      cur = nxt; h = nh;
    }
    if (!segmentClear(a, b)) return null;
    return { pts: out, h };
  }
  function straighten(path, dt) {
    const n = path.length;
    if (n < 3) return null;
    const legs = [];
    let i = 0, t = path[0].h;
    while (i < n - 1) {
      let done = null;
      // D'abord : peut-on aller tout droit jusqu'à l'arrivée ? Si oui, on ne cherche pas plus loin.
      const rEnd = sailStraight(path[i], path[n - 1], t, dt, Infinity);
      if (rEnd) done = { j: n - 1, r: rEnd };
      for (let j = Math.min(n - 1, i + 80); !done && j > i; j--) {
        const r = sailStraight(path[i], path[j], t, dt, path[j].h + 0.1 + (path[j].h - t) * 0.04);
        if (r) { done = { j, r }; break; }
      }
      if (!done) {
        const a = path[i], b = path[i + 1];
        if (t < a.h - 0.05) {
          // En avance mais bloqué (vagues ou vent devant) : attendre sur place plutôt que tirer des bords.
          const w = windAt(a.lat, a.lon, t);
          legs.push({ lat: a.lat, lon: a.lon, h: t, hdg: b.hdg, tws: w ? w.tws : b.tws, twd: w ? w.twd : b.twd, bsp: 0, mot: false, wv: waveAt(a.lat, a.lon, t), wait: true });
          t = a.h;
          continue;
        }
        // Repli : le bord d'origine
        legs.push({ lat: a.lat, lon: a.lon, h: Math.max(t, a.h), hdg: b.hdg, tws: b.tws, twd: b.twd, bsp: b.bsp, mot: b.mot, wv: b.wv, cog: b.cog, sog: b.sog, cu: b.cu });
        // Retard gardé : sinon le bord suivant paraît couvert en quelques minutes
        i++; t = b.h + Math.max(0, t - a.h);
        continue;
      }
      legs.push(...done.r.pts);
      i = done.j; t = done.r.h;
    }
    const e = path[n - 1];
    legs.push({ lat: e.lat, lon: e.lon, h: t, hdg: null, tws: null, twd: null, bsp: null, mot: false, wv: null });
    return legs;
  }

  // Dernière passe « ficelle tendue » : on supprime les coins inutiles (surtout au moteur, où le cap
  // n'a aucune importance pour la vitesse) dès qu'une ligne droite arrive au même endroit sans retard.
  function pullString(legs, dt) {
    const n = legs.length;
    if (n < 3) return legs;
    const out = [];
    let i = 0, t = legs[0].h;
    while (i < n - 1) {
      if (legs[i].wait) { out.push({ ...legs[i], h: t }); t = legs[i + 1].h; i++; continue; }
      let done = null;
      let jMax = i + 1;
      while (jMax < n - 1 && !legs[jMax].wait && jMax - i < 200) jMax++;
      for (let j = jMax; j > i + 1; j--) {
        const r = sailStraight({ lat: legs[i].lat, lon: legs[i].lon }, legs[j], t, dt, legs[j].h + 0.02, undefined, !!legs[i].mot);
        if (r) { done = { j, r }; break; }
      }
      if (!done) { out.push({ ...legs[i], h: Math.max(t, legs[i].h) }); t = legs[i + 1].h + Math.max(0, t - legs[i].h); i++; continue; }
      out.push(...done.r.pts);
      i = done.j; t = done.r.h;
    }
    const e = legs[n - 1];
    out.push({ ...e, h: t });
    return out.length >= 2 ? out : legs;
  }

  // Regrouper les bords : une suite de virements ou d'empannages est remplacée par deux longs bords
  // (mêmes caps, un seul changement d'amure) si l'arrivée au même point n'est pas plus tardive
  // (tolérance 1 % + 3 min), en respectant vent max, vagues max et terre.
  function mergeTacks(legs, dt) {
    const n = legs.length;
    if (n < 4) return legs;
    const sd = l => (l.hdg == null || l.wait || l.mot ? 0 : (norm180(l.twd - l.hdg) >= 0 ? 1 : -1));
    const gy = [];
    for (let k = 1; k < n - 1; k++) { const a = sd(legs[k - 1]), b = sd(legs[k]); if (a && b && a !== b) gy.push(k); }
    if (gy.length < 2) return legs;
    const ends = [...gy, n - 1];
    const out = [];
    let i = 0, t = legs[0].h;
    while (i < n - 1) {
      let done = null;
      const A = legs[i];
      if (sd(A)) {
        for (let q = ends.length - 1; q >= 0 && !done; q--) {
          const j = ends[q];
          if (j <= i + 1) break;
          if (gy.filter(g => g > i && g < j).length < 2) break;
          const B = legs[j], L2 = legs[j - 1];
          if (!sd(L2) || sd(L2) === sd(A)) continue;
          const c = Math.cos(A.lat * Math.PI / 180);
          const bx = (B.lon - A.lon) * 60 * c, by = (B.lat - A.lat) * 60;
          const gA = A.cog != null ? A.cog : A.hdg, gB = L2.cog != null ? L2.cog : L2.hdg;
          const u1 = [Math.sin(gA * Math.PI / 180), Math.cos(gA * Math.PI / 180)], u2 = [Math.sin(gB * Math.PI / 180), Math.cos(gB * Math.PI / 180)];
          const det = u1[0] * u2[1] - u1[1] * u2[0];
          if (Math.abs(det) < 0.05) continue;
          const sA = (bx * u2[1] - by * u2[0]) / det, sB = (u1[0] * by - u1[1] * bx) / det;
          if (sA < 0.05 || sB < 0.05) continue;
          const Pm = move(A, gA, sA);
          const r1 = sailStraight(A, Pm, t, dt, Infinity);
          if (!r1) continue;
          const r2 = sailStraight(Pm, B, r1.h, dt, B.h + 0.05 + (B.h - t) * 0.01);
          if (!r2) continue;
          done = { j, pts: [...r1.pts, ...r2.pts], h: r2.h };
        }
      }
      if (!done) {
        const g = gy.find(x => x > i) || n - 1;
        // Bords regroupés plus tôt : l'heure d'arrivée a pu bouger, on décale la suite d'autant
        const dh = t - legs[i].h;
        out.push(...legs.slice(i, g).map(l => ({ ...l, h: l.h + dh }))); i = g; t = legs[g].h + dh; continue;
      }
      out.push(...done.pts); i = done.j; t = done.h;
    }
    out.push({ ...legs[n - 1], h: t });
    return out.length >= 2 ? out : legs;
  }

  // Crochets : deux virements rapprochés (un petit bord d'aller-retour) au milieu d'un long bord.
  // On reste sur le bord d'avant puis on rejoint la route plus loin en ligne droite, en respectant
  // vent max, vagues max et terre. Accepté si on n'arrive pas plus de 1 % du trajet plus tard
  // (au total, pour tous les crochets supprimés) : quelques minutes contre deux virements inutiles.
  function removeHooks(legs, dt) {
    const sd = l => (l.hdg == null || l.wait || l.mot ? 0 : (norm180(l.twd - l.hdg) >= 0 ? 1 : -1));
    let budget = 0.05 + (legs[legs.length - 1].h - legs[0].h) * 0.01;
    for (let guard = 0; guard < 12; guard++) {
      const n = legs.length;
      if (n < 4 || budget <= 0) return legs;
      const gy = [];
      for (let k = 1; k < n - 1; k++) { const a = sd(legs[k - 1]), b = sd(legs[k]); if (a && b && a !== b) gy.push(k); }
      let done = null;
      for (let q = 0; q + 1 < gy.length && !done; q++) {
        const k1 = gy[q], k2 = gy[q + 1];
        if (legs[k2].h - legs[k1].h > 2) continue; // seulement les petits bords (moins de 2 h)
        const A = legs[k1], P0 = legs[k1 - 1];
        const g = P0.cog != null ? P0.cog : P0.hdg;
        if (g == null) continue;
        for (let jx = k2 + 1; jx < Math.min(n, k2 + 80); jx++) {
          const B = legs[jx];
          if (B.wait || legs[jx - 1].wait) break;
          const tMax = B.h + Math.min(budget, done ? done.dh : Infinity);
          for (let s = 0; s <= 14; s += 0.5) {
            let r1 = { pts: [], h: A.h }, P = A;
            if (s > 0) { P = move(A, g, s); r1 = sailStraight(A, P, A.h, dt, tMax); if (!r1) break; }
            const r2 = sailStraight(P, B, r1.h, dt, tMax);
            if (r2 && (!done || r2.h - B.h < done.dh)) done = { k1, jx, pts: [...r1.pts, ...r2.pts], h: r2.h, dh: r2.h - B.h };
          }
        }
      }
      if (!done) return legs;
      budget -= Math.max(0, done.dh);
      legs = [...legs.slice(0, done.k1), ...done.pts, ...legs.slice(done.jx).map(l => ({ ...l, h: l.h + done.dh }))];
    }
    return legs;
  }

  // ---------- Formatage ----------
  const nf1 = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 });
  const dfmt = new Intl.DateTimeFormat('fr-CH', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const tfmt = new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit' });
  const hfmt = new Intl.DateTimeFormat('fr-CH', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtDur = h => { const m = Math.round(h * 60), d = Math.floor(m / 1440); if (d) return `${d} j ${Math.round((m - d * 1440) / 60)} h`; return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
  const fmtPos = p => {
    const f = (v, pos, neg) => { const t = Math.round(Math.abs(v) * 600), d = Math.floor(t / 600), m = (t % 600) / 10; return `${d}°${m.toFixed(1).replace('.', ',')}′ ${v >= 0 ? pos : neg}`; };
    return `${f(p.lat, 'N', 'S')}  ${f(p.lon, 'E', 'O')}`;
  };
  const side = (hdg, twd) => norm180(twd - hdg) >= 0 ? 'tribord' : 'bâbord';

  const BR_CH = 'carta_2,-80.006,-75.001,-0.002,-19.996;carta_19002,-58.001,-43.0,28.004,7.996;carta_19001,-70.002,-60.001,-11.997,10.005;carta_1,-58.999,-38.0,-24.999,9.003;carta_10,-62.0,-8.0,-28.0,15.0;carta_19400,-37.0,-15.0,-13.999,18.0;carta_20,-47.0,-24.0,-13.999,-3.001;carta_30,-59.001,-38.334,-26.0,-19.002;carta_21070,-49.167,-28.667,-38.25,-21.833;carta_21060,-42.167,-24.333,-31.333,-17.583;carta_21040,-38.0,-12.333,-28.0,-5.583;carta_21050,-40.0,-18.333,-30.0,-11.583;carta_21010,-52.417,-1.583,-45.667,8.333;carta_21080,-53.833,-34.167,-43.0,-28.0;carta_21020,-47.667,-3.833,-38.083,2.916;carta_21030,-39.333,-6.5,-29.5,-0.167;carta_23100,-46.367,-24.783,-43.0,-22.667;carta_23000,-43.35,-24.0,-40.0,-21.917;carta_23300,-48.917,-28.333,-46.617,-25.333;carta_23500,-52.25,-32.217,-48.917,-30.233;carta_23600,-53.667,-33.917,-50.333,-32.0;carta_22200,-36.0,-9.917,-33.917,-6.917;carta_22400,-38.417,-12.967,-35.417,-10.9;carta_22500,-39.25,-15.583,-37.167,-12.667;carta_21800,-39.967,-4.317,-37.933,-1.333;carta_21900,-38.1,-5.25,-35.133,-3.217;carta_21400,-48.583,-1.583,-46.583,1.417;carta_22600,-39.417,-17.333,-36.417,-15.333;carta_22700,-39.833,-18.817,-36.833,-16.833;carta_21100,-51.917,2.75,-48.95,4.75;carta_21200,-51.0,1.083,-48.033,3.083;carta_21300,-51.25,-0.333,-48.283,1.667;carta_21500,-46.75,-1.667,-43.783,0.333;carta_22000,-35.3,-5.0,-32.333,-3.0;carta_22100,-35.583,-7.25,-33.55,-4.333;carta_21600,-45.0,-2.833,-42.083,-0.833;carta_21700,-42.417,-3.333,-39.5,-1.333;carta_23400,-50.25,-30.583,-48.0,-28.0;carta_23200,-48.633,-25.633,-45.633,-23.75;carta_22800,-40.333,-20.417,-37.417,-18.5;carta_22900,-41.25,-22.083,-38.333,-20.167;carta_2140,-52.355,-32.339,-50.18,-29.956;carta_1550,-41.833,-23.417,-39.167,-21.5;carta_22300,-37.333,-11.25,-34.583,-9.5;carta_1402,-40.667,-20.917,-39.667,-19.583;carta_1403,-41.15,-22.133,-40.167,-20.8;carta_410,-44.55,-2.617,-43.417,-1.767;carta_4101A,-51.772,-0.881,-50.831,0.095;carta_4101B,-52.267,-1.62,-51.386,-0.605;carta_4381A,-55.393,-3.143,-54.59,-2.092;carta_4361B,-52.333,-3.233,-51.592,-2.167;carta_4381B,-55.622,-3.847,-54.889,-2.78;carta_1310,-39.367,-18.25,-38.577,-17.267;carta_222,-51.067,0.04,-50.09,0.772;carta_303,-48.667,-1.15,-48.0,-0.167;carta_720,-37.167,-5.167,-36.183,-4.533;carta_1820,-48.717,-26.0,-47.7,-25.4;carta_1910,-48.883,-28.75,-48.233,-27.833;carta_302,-48.117,-0.75,-47.167,-0.133;carta_1902,-48.683,-27.967,-48.033,-27.067;carta_221,-50.126,0.59,-49.25,1.257;carta_930,-35.0,-8.417,-34.4,-7.583;carta_1711,-46.717,-24.533,-46.108,-23.842;carta_305,-49.667,-1.867,-48.858,-1.35;carta_243,-51.267,-1.033,-50.701,-0.333;carta_242,-51.267,-0.467,-50.55,0.083;carta_51,-34.083,-4.083,-33.55,-3.356;carta_1620,-44.2,-23.35,-43.433,-22.85;carta_1640,-45.747,-24.122,-44.98,-23.622;carta_244,-51.75,-1.417,-51.033,-0.883;carta_241,-50.633,-0.25,-49.917,0.283;carta_920,-36.083,-10.0,-35.333,-9.5;carta_306,-50.367,-2.05,-49.534,-1.6;carta_2112,-52.369,-32.251,-51.802,-31.601;carta_231,-48.833,-0.333,-48.15,0.183;carta_232,-49.417,-0.25,-48.734,0.25;carta_233,-50.0,-0.25,-49.317,0.25;carta_4361A,-52.333,-2.36,-52.001,-1.338;carta_4102A,-52.65,-1.667,-51.635,-1.333;carta_1506,-43.417,-23.308,-42.667,-22.858;carta_1508,-42.7,-23.308,-41.95,-22.858;carta_1830,-48.692,-26.483,-48.017,-25.983;carta_304,-48.917,-1.667,-48.417,-1.0;carta_1406,-41.083,-22.075,-40.383,-21.6;carta_110,-51.917,4.2,-51.417,4.833;carta_202,-50.4,0.5,-49.933,1.167;carta_204,-51.183,-0.083,-50.508,0.367;carta_810,-35.362,-5.962,-34.753,-5.467;carta_203,-50.717,0.233,-50.267,0.9;carta_52,-32.811,-4.15,-32.233,-3.709;carta_1110,-38.825,-13.183,-38.433,-12.583;carta_4343A,-50.94,-1.656,-50.562,-1.068;carta_4382A,-55.691,-4.068,-55.268,-3.551;carta_4382B,-56.063,-4.33,-55.542,-3.92;carta_4342A,-50.695,-1.695,-50.295,-1.169;carta_4342B,-50.874,-1.29,-50.35,-0.894;carta_4018,-53.997,-2.116,-53.455,-1.737;carta_4017,-53.485,-1.943,-52.943,-1.565;carta_4016,-52.972,-1.801,-52.43,-1.423;carta_4011,-51.398,-0.313,-50.857,0.064;carta_4024,-56.368,-2.399,-55.988,-1.863;carta_4343B,-51.25,-1.204,-50.716,-0.823;carta_4019,-54.342,-2.467,-53.962,-1.932;carta_4383,-56.381,-4.547,-55.853,-4.162;carta_4362,-49.633,-2.594,-49.254,-2.058;carta_4363,-49.834,-3.098,-49.455,-2.562;carta_4021,-55.002,-2.257,-54.466,-1.878;carta_4025,-56.717,-2.716,-56.338,-2.18;carta_4023,-56.014,-2.241,-55.479,-1.862;carta_4027,-57.728,-2.667,-57.193,-2.288;carta_4052,-61.1,-3.645,-60.564,-3.267;carta_4361,-49.468,-2.082,-48.932,-1.704;carta_4051,-60.578,-3.578,-60.042,-3.2;carta_4054,-62.143,-4.037,-61.608,-3.659;carta_4541,-55.337,-2.627,-54.802,-2.249;carta_4022,-55.503,-2.257,-54.968,-1.879;carta_4028,-58.186,-2.931,-57.651,-2.553;carta_4056,-63.184,-4.139,-62.648,-3.762;carta_4053,-61.622,-3.903,-61.087,-3.526;carta_4055,-62.662,-4.025,-62.128,-3.648;carta_4032,-60.053,-3.38,-59.52,-3.003;carta_4026,-57.225,-2.817,-56.69,-2.443;carta_4031,-59.54,-3.38,-59.01,-3.003;carta_4029,-58.543,-3.253,-58.01,-2.88;carta_4030,-59.043,-3.45,-58.513,-3.077;carta_21300pl,-49.493,1.277,-48.918,1.614;carta_2110,-52.217,-32.35,-51.667,-32.0;carta_2111,-51.402,-30.439,-51.002,-29.967;carta_411,-44.45,-2.583,-44.083,-2.1;carta_1410,-40.383,-20.55,-40.033,-20.083;carta_2010,-50.218,-30.167,-49.835,-29.751;carta_710,-38.842,-3.783,-38.35,-3.467;carta_1420,-40.208,-19.9,-39.717,-19.6;carta_806,-34.951,-7.182,-34.634,-6.732;carta_1501,-43.318,-23.092,-43.0,-22.667;carta_1210,-39.133,-15.0,-38.833,-14.583;carta_1404,-40.717,-20.892,-40.333,-20.6;carta_1635,-45.233,-23.583,-44.833,-23.333;Carta_1631,-44.567,-23.308,-44.2,-23.042;carta_1634,-44.867,-23.525,-44.483,-23.275;carta_1632,-44.55,-23.158,-44.183,-22.908;carta_1633,-44.734,-23.317,-44.467,-22.984;carta_1505,-42.042,-23.05,-41.783,-22.709;carta_112,-51.932,3.761,-51.669,4.067;carta_HS-C9,-66.667,-2.603,-66.338,-2.368;carta_HS-B6,-64.667,-3.492,-64.338,-3.257;carta_HS-C10,-66.882,-2.802,-66.553,-2.567;carta_HS-C11,-67.162,-2.802,-66.833,-2.567;carta_HS-C6,-65.837,-2.705,-65.508,-2.47;carta_HS-D2,-68.212,-3.475,-67.883,-3.24;carta_HS-D6,-69.212,-3.557,-68.883,-3.322;carta_HS-B2,-63.592,-3.943,-63.263,-3.708;carta_HS-B3,-63.882,-3.928,-63.553,-3.693;carta_HS-C5,-65.532,-2.648,-65.203,-2.413;carta_HS-C1,-64.942,-3.405,-64.613,-3.17;carta_HS-C12,-67.437,-2.702,-67.108,-2.467;carta_HS-D3,-68.512,-3.475,-68.183,-3.24;carta_HS-D7,-69.512,-3.667,-69.183,-3.432;carta_HS-C2,-65.02,-3.192,-64.692,-2.957;carta_HS-C3,-65.305,-3.083,-64.977,-2.848;carta_HS-D1,-68.145,-3.285,-67.817,-3.05;carta_HS-D10,-69.583,-4.275,-69.255,-4.04;carta_HS-D11,-69.795,-4.41,-69.467,-4.175;carta_HS-B4,-64.17,-3.893,-63.842,-3.658;carta_HS-C13,-67.645,-2.85,-67.317,-2.615;carta_HS-C14,-67.9,-2.933,-67.572,-2.698;carta_HS-C15,-68.025,-3.092,-67.697,-2.857;carta_HS-C4,-65.438,-2.863,-65.11,-2.628;carta_HS-C7,-66.083,-2.65,-65.755,-2.415;carta_HS-C8,-66.373,-2.61,-66.045,-2.375;carta_HS-D4,-68.778,-3.5,-68.45,-3.265;carta_HS-D5,-69.04,-3.568,-68.712,-3.333;carta_HS-D8,-69.545,-3.867,-69.217,-3.632;carta_HS-D12,-70.083,-4.435,-69.755,-4.2;carta_HS-B1,-63.388,-4.122,-63.06,-3.887;carta_HS-B5,-64.475,-3.7,-64.147,-3.465;carta_HS-D9,-69.578,-4.071,-69.25,-3.837;carta_111,-51.755,3.978,-51.541,4.299;carta_1101,-38.667,-13.125,-38.467,-12.834;carta_1107,-38.917,-12.901,-38.617,-12.717;carta_2108,-51.306,-30.401,-51.019,-30.217;carta_1205,-39.09,-16.5,-38.91,-16.208;carta_2102,-52.219,-32.034,-52.002,-31.798;carta_4352,-50.653,-1.878,-50.463,-1.61;carta_4365,-49.733,-3.612,-49.544,-3.343;carta_4026A,-57.317,-2.645,-57.05,-2.455;carta_4023A,-56.117,-2.093,-55.85,-1.903;carta_4364,-49.733,-3.355,-49.544,-3.087;carta_4366,-49.742,-3.868,-49.553,-3.6;carta_4029A,-58.403,-3.197,-58.136,-3.008;carta_4351,-50.47,-1.919,-50.282,-1.651;carta_4353,-50.81,-1.712,-50.623,-1.443;carta_1312,-39.283,-17.867,-39.012,-17.683;carta_2133,-51.362,-30.233,-51.167,-29.983;carta_1104,-38.667,-12.87,-38.408,-12.683;carta_4032A,-60.125,-3.217,-59.867,-3.033;carta_1831,-48.692,-26.282,-48.417,-26.112;carta_2106,-52.052,-31.884,-51.785,-31.709;carta_2107,-51.169,-30.567,-50.969,-30.334;carta_1003,-37.1,-11.133,-36.917,-10.883;carta_2011,-50.227,-30.09,-49.958,-29.92;carta_412,-44.433,-2.592,-44.2,-2.4;carta_2103,-52.252,-31.834,-51.986,-31.667;carta_1821,-48.492,-25.637,-48.233,-25.467;carta_2105,-52.05,-31.767,-51.8,-31.6;carta_1703,-47.967,-25.2,-47.767,-24.992;carta_2101,-52.183,-32.217,-52.0,-32.0;carta_2140Bpl,-51.563,-31.033,-51.367,-30.833;carta_1001,-37.0,-10.933,-36.767,-10.767;carta_703,-37.2,-4.977,-36.983,-4.8;carta_2140Apl,-51.431,-30.849,-51.267,-30.616;carta_1822,-48.72,-25.547,-48.467,-25.4;carta_2140Epl,-51.998,-31.499,-51.833,-31.283;carta_1405,-41.042,-21.917,-40.808,-21.767;carta_1623,-44.0,-23.045,-43.775,-22.895;carta_1625,-44.22,-23.229,-43.992,-23.082;carta_1624,-44.188,-23.1,-43.967,-22.95;carta_1637,-44.522,-23.06,-44.297,-22.917;carta_4741,-62.837,-7.083,-62.623,-6.933;carta_4712,-58.972,-3.623,-58.758,-3.473;carta_4715,-59.352,-4.025,-59.138,-3.875;carta_4727,-60.942,-5.617,-60.728,-5.467;carta_4739,-62.547,-6.875,-62.333,-6.725;carta_4749,-63.372,-8.305,-63.158,-8.155;carta_4713,-59.172,-3.718,-58.958,-3.568;carta_4716,-59.442,-4.227,-59.292,-4.013;carta_4720,-59.97,-4.727,-59.82,-4.513;carta_4740,-62.683,-6.947,-62.533,-6.733;carta_4744,-63.045,-7.597,-62.895,-7.383;carta_4714,-59.15,-3.922,-59.0,-3.708;carta_4731,-61.602,-5.927,-61.388,-5.777;carta_4735,-62.147,-6.3,-61.933,-6.15;carta_4750,-63.48,-8.447,-63.33,-8.233;carta_4753,-63.958,-8.812,-63.808,-8.598;carta_4719,-59.898,-4.525,-59.748,-4.312;carta_4734,-61.95,-6.358,-61.8,-6.145;carta_4745,-63.017,-7.793,-62.867,-7.58;carta_4746,-62.965,-7.995,-62.815,-7.782;carta_4743,-63.023,-7.395,-62.873,-7.182;carta_4722,-60.235,-5.0,-60.022,-4.85;carta_4724,-60.508,-5.222,-60.295,-5.072;carta_4725,-60.693,-5.322,-60.48,-5.172;carta_4733,-61.873,-6.165,-61.66,-6.015;carta_4748,-63.17,-8.223,-62.957,-8.073;carta_4752,-63.818,-8.662,-63.605,-8.512;carta_4711,-58.898,-3.485,-58.685,-3.335;carta_4717,-59.575,-4.345,-59.362,-4.195;carta_4718,-59.755,-4.462,-59.542,-4.312;carta_4728,-61.143,-5.683,-60.93,-5.533;carta_4729,-61.345,-5.733,-61.132,-5.583;carta_4721,-60.033,-4.928,-59.883,-4.715;carta_4723,-60.358,-5.083,-60.208,-4.87;carta_4732,-61.74,-6.038,-61.59,-5.825;carta_4736,-62.283,-6.363,-62.133,-6.15;carta_4738,-62.433,-6.755,-62.283,-6.542;carta_4730,-61.4,-5.935,-61.25,-5.722;carta_4742,-62.975,-7.193,-62.825,-6.98;carta_4747,-62.983,-8.193,-62.833,-7.98;carta_4751,-63.62,-8.623,-63.47,-8.41;carta_4737,-62.38,-6.553,-62.23,-6.345;carta_515,-41.75,-2.913,-41.537,-2.767;carta_4726,-60.827,-5.48,-60.677,-5.273;carta_2140Cpl,-51.224,-31.118,-51.0,-30.983;carta_1636,-44.383,-23.133,-44.172,-22.992;carta_702,-36.773,-5.117,-36.578,-4.983;carta_2140Dpl,-51.478,-31.549,-51.282,-31.416;carta_2792,-47.942,-15.867,-47.775,-15.713;carta_1511,-43.233,-23.0,-43.04,-22.867;carta_1106,-38.772,-12.761,-38.631,-12.586;carta_4101Apl,-51.343,-0.282,-51.198,-0.124;carta_1512,-43.277,-22.915,-43.09,-22.795;carta_1507,-41.833,-22.459,-41.65,-22.338;carta_52pl,-32.52,-3.908,-32.346,-3.792;carta_23100pl,-45.758,-24.139,-45.595,-24.021;carta_3365,-57.679,-19.058,-57.512,-18.945;carta_4020A,-54.8,-2.448,-54.64,-2.335;carta_1401,-40.367,-20.362,-40.217,-20.253;carta_1803,-48.638,-25.9,-48.483,-25.8;carta_305Bpl,-49.25,-1.685,-49.083,-1.593;carta_1713,-46.393,-24.083,-46.278,-23.95;carta_1211,-39.088,-14.828,-38.938,-14.727;carta_321,-48.817,-1.617,-48.717,-1.467;carta_921,-35.8,-9.75,-35.65,-9.65;carta_1644,-45.5,-23.893,-45.358,-23.797;carta_4203,-52.459,-0.892,-52.256,-0.825;carta_4381Apl,-55.219,-2.958,-55.114,-2.829;carta_2113,-51.334,-30.029,-51.201,-29.929;carta_912,-35.0,-8.425,-34.867,-8.325;carta_821,-34.9,-7.0,-34.767,-6.9;carta_1712,-46.4,-23.967,-46.267,-23.867;carta_320,-48.55,-1.5,-48.45,-1.367;carta_3361,-57.303,-19.293,-57.207,-19.156;carta_3363,-57.4,-19.083,-57.256,-18.992;carta_3364,-57.533,-19.046,-57.39,-18.955;carta_3355,-57.68,-19.801,-57.537,-19.71;carta_3356,-57.603,-19.714,-57.46,-19.623;carta_3348,-58.133,-20.424,-58.037,-20.289;carta_3352,-57.928,-20.087,-57.833,-19.951;carta_3357,-57.493,-19.636,-57.398,-19.5;carta_3358,-57.467,-19.538,-57.372,-19.402;carta_3351,-58.048,-20.106,-57.905,-20.016;carta_3353,-57.881,-19.96,-57.738,-19.87;carta_3354,-57.784,-19.879,-57.641,-19.789;carta_3362,-57.37,-19.165,-57.227,-19.075;carta_3339,-57.944,-21.439,-57.848,-21.305;carta_3335,-58.0,-21.939,-57.904,-21.805;carta_3342,-57.9,-21.063,-57.804,-20.929;carta_3343,-57.943,-20.937,-57.847,-20.803;carta_3341,-57.914,-21.189,-57.819,-21.054;carta_3331,-58.005,-22.295,-57.861,-22.206;carta_3333,-58.006,-22.138,-57.862,-22.049;carta_3328,-57.87,-22.624,-57.774,-22.491;carta_3329,-57.897,-22.499,-57.801,-22.366;carta_3334,-58.035,-22.063,-57.939,-21.93;carta_3336,-57.966,-21.814,-57.871,-21.68;carta_3337,-57.973,-21.689,-57.878,-21.555;carta_3338,-57.99,-21.564,-57.895,-21.43;carta_3340,-57.933,-21.314,-57.838,-21.18;carta_3321,-57.642,-23.241,-57.499,-23.152;carta_3344,-57.991,-20.811,-57.85,-20.721;carta_3322,-57.742,-23.154,-57.598,-23.066;carta_3325,-57.936,-22.828,-57.792,-22.74;carta_3327,-57.896,-22.705,-57.752,-22.617;carta_3320,-57.552,-23.366,-57.456,-23.234;carta_3326,-57.97,-22.749,-57.874,-22.617;carta_4412,-55.843,-1.882,-55.71,-1.787;carta_3347,-58.073,-20.524,-57.978,-20.391;carta_3349,-58.178,-20.295,-58.083,-20.162;carta_3346,-58.047,-20.65,-57.952,-20.517;carta_4411,-55.723,-1.917,-55.59,-1.822;carta_3359,-57.402,-19.456,-57.262,-19.366;carta_3360,-57.369,-19.373,-57.229,-19.283;carta_3307,-57.298,-24.773,-57.155,-24.685;carta_3317,-57.444,-23.685,-57.301,-23.597;carta_3330,-57.949,-22.374,-57.806,-22.286;carta_3332,-58.039,-22.214,-57.896,-22.126;carta_3345,-58.005,-20.73,-57.864,-20.641;carta_3350,-58.183,-20.171,-58.042,-20.082;carta_3315,-57.325,-23.938,-57.23,-23.806;carta_3313,-57.291,-24.175,-57.196,-24.043;carta_3324,-57.849,-22.952,-57.754,-22.82;carta_3318,-57.5,-23.612,-57.405,-23.48;carta_3319,-57.518,-23.485,-57.423,-23.353;carta_3323,-57.794,-23.075,-57.699,-22.943;carta_3301,-57.669,-25.258,-57.525,-25.171;carta_3302,-57.587,-25.18,-57.491,-25.05;carta_1841,-48.7,-26.95,-48.55,-26.867;carta_3300,-57.691,-25.358,-57.596,-25.227;carta_3306,-57.313,-24.901,-57.218,-24.77;carta_3309,-57.208,-24.621,-57.113,-24.49;carta_3310,-57.208,-24.499,-57.113,-24.368;carta_3311,-57.227,-24.376,-57.132,-24.245;carta_3314,-57.284,-24.053,-57.189,-23.922;carta_3316,-57.342,-23.813,-57.247,-23.682;carta_3308,-57.254,-24.702,-57.111,-24.615;carta_3303,-57.5,-25.136,-57.357,-25.049;carta_3304,-57.446,-25.057,-57.303,-24.97;carta_3305,-57.346,-24.979,-57.203,-24.892;carta_3312,-57.291,-24.253,-57.148,-24.166;carta_1643,-45.433,-23.817,-45.333,-23.7;carta_902,-34.893,-8.118,-34.803,-7.99;carta_4414,-55.991,-1.728,-55.904,-1.596;carta_4417,-56.323,-1.548,-56.193,-1.46;carta_4416,-56.198,-1.551,-56.068,-1.463;carta_1103,-38.542,-12.838,-38.413,-12.75;carta_4413,-55.92,-1.833,-55.834,-1.701;carta_4415,-56.073,-1.634,-55.987,-1.502;carta_4418,-56.448,-1.503,-56.318,-1.416;carta_1108,-38.875,-12.887,-38.747,-12.8;carta_21Apl,-28.904,-20.538,-28.796,-20.436;carta_413,-44.433,-2.617,-44.345,-2.5;carta_1503,-42.042,-23.05,-41.957,-22.934;carta_1513,-43.18,-22.827,-43.08,-22.733;carta_1504,-41.967,-22.787,-41.85,-22.707;carta_21,-29.367,-20.549,-29.275,-20.449;carta_21Bpl,-29.368,-20.553,-29.276,-20.453;carta_701,-38.557,-3.747,-38.447,-3.667;carta_711,-38.842,-3.583,-38.767,-3.467;carta_4215,-52.295,-1.165,-52.188,-1.085;carta_305Apl,-48.95,-1.742,-48.858,-1.65;carta_1633pl,-44.725,-23.239,-44.627,-23.154;carta_4214,-52.192,-1.192,-52.085,-1.115;carta_4218,-52.475,-0.967,-52.368,-0.89;carta_4211,-51.973,-1.187,-51.867,-1.11;carta_4216,-52.368,-1.15,-52.292,-1.043;carta_4212,-52.077,-1.188,-51.97,-1.112;carta_4213,-52.135,-1.263,-52.028,-1.187;carta_4217,-52.44,-1.07,-52.365,-0.963;carta_1112,-38.567,-13.032,-38.497,-12.925;Carta_1631pl,-44.35,-23.157,-44.238,-23.097;carta_414,-44.408,-2.671,-44.342,-2.571;carta_2791,-47.867,-15.837,-47.775,-15.767;carta_704,-36.35,-5.125,-36.258,-5.055;carta_2113pl,-51.384,-29.962,-51.294,-29.892;carta_1901,-48.794,-28.525,-48.697,-28.467;carta_1635pl,-45.087,-23.47,-45.0,-23.412;carta_811,-35.233,-5.797,-35.158,-5.738;carta_2104A,-52.35,-31.799,-52.217,-31.766;carta_1311,-38.741,-18.0,-38.666,-17.942;carta_51pl,-33.845,-3.897,-33.778,-3.837;carta_2104B,-52.25,-31.816,-52.172,-31.766;carta_920pl,-35.924,-9.912,-35.863,-9.85;carta_1115,-38.667,-12.77,-38.597,-12.718;carta_1515,-43.178,-22.9,-43.108,-22.85;carta_206,-51.208,-0.075,-51.13,-0.033;carta_1921,-48.672,-28.255,-48.623,-28.192;carta_204Apl,-50.789,0.183,-50.732,0.233;carta_1420pl,-40.083,-19.875,-40.025,-19.828;carta_4342Bpl,-50.631,-1.159,-50.577,-1.11;carta_303pl,-48.532,-0.767,-48.483,-0.725;carta_3400,-57.689,-17.706,-57.652,-17.653;carta_3376,-57.547,-18.647,-57.51,-18.594;carta_3389,-57.456,-18.132,-57.4,-18.097;carta_3381,-57.413,-18.501,-57.357,-18.466;carta_3369,-57.684,-18.853,-57.629,-18.818;carta_3371,-57.594,-18.81,-57.539,-18.775;carta_3372,-57.594,-18.776,-57.539,-18.741;carta_3395,-57.546,-17.875,-57.491,-17.84;carta_3399,-57.689,-17.739,-57.634,-17.704;carta_3404,-57.556,-17.566,-57.501,-17.531;carta_3428,-57.854,-16.729,-57.799,-16.694;carta_3367,-57.702,-18.955,-57.665,-18.903;carta_3383,-57.394,-18.415,-57.357,-18.363;carta_3386,-57.431,-18.282,-57.394,-18.23;carta_3387,-57.407,-18.23,-57.37,-18.178;carta_3394,-57.492,-17.906,-57.455,-17.854;carta_3411,-57.356,-17.301,-57.319,-17.249;carta_3401,-57.696,-17.655,-57.66,-17.602;carta_3405,-57.502,-17.538,-57.466,-17.485;carta_3410,-57.347,-17.353,-57.311,-17.3;carta_3412,-57.363,-17.25,-57.327,-17.197;carta_3417,-57.404,-17.01,-57.368,-16.957;carta_3433,-57.81,-16.494,-57.774,-16.441;carta_3439,-57.787,-16.229,-57.751,-16.176;carta_3378,-57.494,-18.583,-57.458,-18.53;carta_3382,-57.396,-18.467,-57.36,-18.414;carta_3414,-57.384,-17.147,-57.348,-17.094;carta_3440,-57.79,-16.182,-57.754,-16.129;carta_3370,-57.629,-18.855,-57.593,-18.802;carta_3431,-57.852,-16.596,-57.816,-16.543;carta_3393,-57.486,-17.958,-57.45,-17.905;carta_3415,-57.413,-17.095,-57.377,-17.042;carta_3373,-57.594,-18.742,-57.538,-18.708;carta_3421,-57.523,-16.848,-57.469,-16.813;carta_3426,-57.754,-16.757,-57.7,-16.722;carta_3427,-57.8,-16.723,-57.746,-16.688;carta_3438,-57.785,-16.257,-57.731,-16.222;carta_3390,-57.491,-18.106,-57.455,-18.054;carta_3408,-57.415,-17.42,-57.379,-17.368;carta_3432,-57.834,-16.545,-57.798,-16.493;carta_3368,-57.688,-18.903,-57.652,-18.851;carta_3374,-57.539,-18.733,-57.503,-18.681;carta_3379,-57.461,-18.57,-57.425,-18.518;carta_3384,-57.381,-18.372,-57.345,-18.32;carta_3385,-57.404,-18.32,-57.368,-18.268;carta_3388,-57.401,-18.178,-57.365,-18.126;carta_3391,-57.493,-18.055,-57.457,-18.003;carta_3392,-57.47,-18.009,-57.434,-17.957;carta_3398,-57.635,-17.774,-57.599,-17.722;carta_3406,-57.485,-17.486,-57.449,-17.434;carta_3407,-57.45,-17.461,-57.414,-17.409;carta_3413,-57.375,-17.198,-57.339,-17.146;carta_3418,-57.404,-16.958,-57.368,-16.906;carta_3419,-57.432,-16.906,-57.396,-16.854;carta_3425,-57.7,-16.785,-57.664,-16.733;carta_3429,-57.874,-16.695,-57.838,-16.643;carta_3430,-57.874,-16.644,-57.838,-16.592;carta_3434,-57.798,-16.442,-57.762,-16.39;carta_3441,-57.758,-16.149,-57.722,-16.097;carta_3366,-57.669,-19.0,-57.633,-18.948;carta_3435,-57.791,-16.391,-57.755,-16.339;carta_3437,-57.803,-16.307,-57.767,-16.255;carta_3375,-57.566,-18.681,-57.511,-18.647;carta_3396,-57.585,-17.841,-57.53,-17.807;carta_3377,-57.546,-18.596,-57.491,-18.562;carta_3380,-57.467,-18.518,-57.412,-18.484;carta_3397,-57.627,-17.807,-57.572,-17.773;carta_3409,-57.381,-17.386,-57.326,-17.352;carta_3416,-57.422,-17.043,-57.367,-17.009;carta_3420,-57.485,-16.881,-57.43,-16.847;carta_3422,-57.577,-16.84,-57.522,-16.806;carta_3442,-57.722,-16.108,-57.687,-16.055;carta_3424,-57.665,-16.822,-57.63,-16.769;carta_3403,-57.609,-17.589,-57.555,-17.555;carta_3423,-57.63,-16.833,-57.576,-16.799;carta_3436,-57.798,-16.339,-57.744,-16.305;carta_3402,-57.66,-17.622,-57.606,-17.588;carta_1531,-43.177,-22.802,-43.133,-22.762;carta_1841A,-48.73,-26.883,-48.687,-26.843;carta_4365pl,-49.626,-3.476,-49.581,-3.44;carta_4363pl,-49.545,-2.604,-49.506,-2.563;carta_1404pl,-40.583,-20.8,-40.54,-20.767;carta_4024pl,-56.118,-2.177,-56.087,-2.135;carta_515pl,-41.669,-2.883,-41.636,-2.847;carta_4366pl,-49.673,-3.786,-49.64,-3.754;carta_414pl,-44.37,-2.683,-44.35,-2.633;carta_4362pl,-49.507,-2.26,-49.473,-2.233;carta_1831pl,-48.655,-26.25,-48.628,-26.217;carta_1001pl,-36.945,-10.85,-36.912,-10.823;carta_4382Bpl,-55.994,-4.299,-55.967,-4.267;carta_4023pl,-55.528,-1.928,-55.5,-1.9;carta_306pl,-49.808,-1.83,-49.784,-1.803;carta_4736pl,-62.255,-6.272,-62.237,-6.238;carta_4029Apl,-58.455,-3.161,-58.425,-3.142;carta_204Bpl,-51.057,0.022,-51.03,0.043;carta_4733pl,-61.84,-6.125,-61.818,-6.102;carta_1507pl,-41.774,-22.395,-41.745,-22.379;carta_1401pl,-40.352,-20.328,-40.31,-20.317;carta_4749pl,-63.252,-8.239,-63.227,-8.225;carta_4418pl,-56.389,-1.467,-56.367,-1.452;carta_1108PL,-38.85,-12.861,-38.832,-12.844;carta_1623pl,-43.86,-22.939,-43.843,-22.923;carta_4026pl,-56.742,-2.631,-56.725,-2.617;carta_2104C,-52.341,-31.789,-52.32,-31.778;carta_4753pl,-63.926,-8.755,-63.913,-8.741;carta_1841B,-48.673,-26.902,-48.652,-26.894;carta_4032ACpl,-59.957,-3.155,-59.943,-3.143;carta_4032ABpl,-60.0,-3.165,-59.987,-3.153;carta_4032AApl,-60.035,-3.144,-60.023,-3.132;carta_4029Bpl,-58.49,-3.142,-58.477,-3.132;carta_4381Bpl,-58.49,-3.142,-58.477,-3.132;carta_4102ABpl,-51.654,-1.411,-51.643,-1.401;carta_4016pl,-52.583,-1.537,-52.572,-1.528;carta_4102AApl,-52.583,-1.537,-52.572,-1.528;carta_11pl,-29.348,0.915,-29.344,0.919'.split(';').map(t => { const a = t.split(','); return [a[0], +a[1], +a[2], +a[3], +a[4]]; });
  // Brésil (DHN) : une couche par carte ; on ne demande que les cartes qui touchent la tuile, les plus détaillées dessus
  const brUrl = url => {
    const m = url.match(/bbox=([-\d.e]+),([-\d.e]+),([-\d.e]+),([-\d.e]+)/); if (!m) return url;
    const R = 6378137, lo = x => x / R * 180 / Math.PI, la = y => (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI;
    const w = lo(+m[1]), s = la(+m[2]), e = lo(+m[3]), n = la(+m[4]), A = (e - w) * (n - s);
    let L = BR_CH.filter(c => c[1] < e && c[3] > w && c[2] < n && c[4] > s && (c[3] - c[1]) * (c[4] - c[2]) > A * 0.02);
    if (L.length > 40) L = L.slice(L.length - 40);
    return url.replace('__BR__', (L.length ? L.map(c => 'carta_nautica:' + c[0]) : ['carta_nautica:carta_1']).join(','));
  };
  // ---------- Carte ----------
  const map = new maplibregl.Map({
    transformRequest: url => (url.includes('__BR__') ? { url: brUrl(url) } : undefined),
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/positron',
    center: [5.5, 42.3],
    zoom: 5.2,
    attributionControl: { compact: true },
    dragRotate: false, pitchWithRotate: false, maxPitch: 0, // carte toujours nord en haut
  });
  map.touchZoomRotate.disableRotation(); map.keyboard.disableRotation();

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  const scaleCtl = new maplibregl.ScaleControl({ unit: 'nautical' });
  map.addControl(scaleCtl, 'bottom-right');
  { // Échelle en mètres quand elle fait moins de 0,5 M
    let u = 'nautical';
    const upd = () => { const c = map.getCenter(), mpp = 40075016.7 * Math.cos(c.lat * Math.PI / 180) / (512 * 2 ** map.getZoom()); const nu = mpp * 100 < 926 ? 'metric' : 'nautical'; if (nu !== u) { u = nu; scaleCtl.setUnit(nu); } };
    map.on('moveend', upd); map.on('load', upd);
  }

  const el = id => document.getElementById(id);
  const ui = {
    hint: el('hint'), vStart: el('v-start'), vEnd: el('v-end'), models: el('models'), tStart: el('t-start'),
    go: el('go'), result: el('result'), msg: el('msg'), scrub: el('scrub'), scrubInfo: el('scrub-info'),
    book: el('book'), dur: el('r-dur'), eta: el('r-eta'), dist: el('r-dist'), wmax: el('r-wind'),
  };

  let start = null, end = null, mStart = null, mEnd = null, boat = null, last = null;
  let chartOn = false; // la carte marine est toujours éteinte à l'ouverture

  function markerEl(color) {
    const d = document.createElement('div');
    d.style.cssText = `width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:grab`;
    return d;
  }
  const IS_PC = !!(window.matchMedia && matchMedia('(any-pointer: fine)').matches);
  const PC_WORD = IS_PC
    ? { one: 'Cliquez sur', dbl: 'double-cliquez', end: 'Double-cliquez pour le dernier point' }
    : { one: 'Touchez', dbl: 'touchez deux fois avec le doigt', end: 'Touchez deux fois avec le doigt pour le dernier point' };
  // Construction de la route : départ, puis des points dans l'ordre, puis « Terminer » ferme la route :
  // le dernier point devient l'arrivée. Une fois la route fermée, toucher la carte ne pose plus rien.
  let vias = []; // { p, m }
  function viaEl(n) {
    const d = document.createElement('div');
    d.className = 'via-mk'; d.textContent = n;
    return d;
  }
  function addVia(p) {
    const v = { p, m: new maplibregl.Marker({ element: viaEl(vias.length + 1), draggable: true }).setLngLat([p.lon, p.lat]).addTo(map) };
    v.m.on('dragend', () => { const q = v.m.getLngLat(); v.p = { lat: q.lat, lon: q.lng }; clearResult(); refresh(); });
    // Double clic ou double toucher sur le dernier point : la route se ferme
    let t1 = 0;
    v.m.getElement().addEventListener('click', e => {
      e.stopPropagation();
      const t = Date.now();
      if (Date.now() < tapHold) return;
      if (!end && vias[vias.length - 1] === v && t - t1 < 500) closeRoute();
      t1 = t;
    });
    vias.push(v);
  }
  function routePts() { return start && end ? [start, ...vias.map(v => v.p), end] : []; }
  function planDraw() {
    const c = [start, ...vias.map(v => v.p), end].filter(Boolean).map(q => [q.lon, q.lat]);
    const src = map.getSource('plan');
    if (src) src.setData(c.length > 1 && !last ? { type: 'Feature', geometry: { type: 'LineString', coordinates: c }, properties: {} } : EMPTY);
  }
  function setPoint(which, lngLat) {
    const p = { lat: lngLat.lat, lon: lngLat.lng };
    if (which === 'start') {
      start = p;
      if (!mStart) {
        mStart = new maplibregl.Marker({ element: markerEl('#1f5f8b'), draggable: true }).setLngLat(lngLat).addTo(map);
        mStart.on('dragend', () => setPoint('start', mStart.getLngLat()));
      } else mStart.setLngLat(lngLat);
    } else {
      end = p;
      if (!mEnd) {
        mEnd = new maplibregl.Marker({ element: markerEl('#b8322a'), draggable: true }).setLngLat(lngLat).addTo(map);
        mEnd.on('dragend', () => setPoint('end', mEnd.getLngLat()));
      } else mEnd.setLngLat(lngLat);
    }
    clearResult();
    refresh();
  }
  // Fermer la route : le dernier point posé devient l'arrivée
  function closeRoute() {
    if (end || !vias.length) return;
    const v = vias.pop(); v.m.remove();
    setPoint('end', { lat: v.p.lat, lng: v.p.lon });
  }
  // Retirer le dernier point (si la route est fermée, l'arrivée redevient un point et la route se rouvre)
  function undoPoint() {
    if (!start) return;
    if (end) { mEnd.remove(); mEnd = null; const q = end; end = null; addVia(q); }
    else if (vias.length) { const v = vias.pop(); v.m.remove(); }
    else { mStart && mStart.remove(); mStart = null; start = null; }
    clearResult();
    refresh();
  }
  el('undo-pt').addEventListener('click', e => { e.stopPropagation(); undoPoint(); });
  function refresh() {
    ui.vStart.textContent = start ? fmtPos(start) : `${PC_WORD.one} la carte`;
    ui.vEnd.textContent = end ? fmtPos(end) : PC_WORD.end;
    const box = el('step-vias');
    box.parentElement.hidden = !vias.length;
    box.innerHTML = vias.map((v, i) => `<li class="step"><span class="dot dot-via" aria-hidden="true">${i + 1}</span><div><div class="label">Point ${i + 1}</div><div class="value">${fmtPos(v.p)}</div></div></li>`).join('');
    ui.go.disabled = !(start && (end || vias.length));
    el('undo-pt').hidden = !start;
    ui.hint.textContent = !start ? `${PC_WORD.one} la carte pour placer le départ.`
      : end ? 'Route terminée. Choisissez le modèle, puis calculez.'
      : `${PC_WORD.one} la carte pour chaque point. Pour l\u2019arrivée : ${PC_WORD.dbl}.`;
    // pendant la construction, le double clic ou double toucher ferme la route au lieu de zoomer
    try { if (start && !end) map.doubleClickZoom.disable(); else map.doubleClickZoom.enable(); } catch (e) {}
    planDraw();
  }
  let lastClick = 0, tapHold = 0;
  // Double toucher du doigt : la position du premier toucher devient l'arrivée.
  // Écouté sur toute la fenêtre (phase de capture) : le 2e toucher tombe souvent sur le point
  // que le 1er vient de poser, et un vrai doigt bouge et dure plus qu'un essai sur ordinateur.
  (() => {
    const box = map.getContainer(); let t0 = 0, x0 = 0, y0 = 0, moved = false, prev = null;
    const onMap = t => box.contains(t) && !(t.closest && t.closest('.maplibregl-ctrl, .wave-fab, button'));
    window.addEventListener('touchstart', e => {
      if (e.touches.length !== 1 || !onMap(e.target)) { t0 = 0; prev = e.touches.length > 1 ? null : prev; return; }
      t0 = Date.now(); x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; moved = false;
    }, { capture: true, passive: true });
    window.addEventListener('touchmove', e => { const t = e.touches[0]; if (t0 && t && Math.hypot(t.clientX - x0, t.clientY - y0) > 22) moved = true; }, { capture: true, passive: true });
    window.addEventListener('touchend', () => {
      if (!t0 || moved || Date.now() - t0 > 900) { prev = null; t0 = 0; return; }
      const now = Date.now(), gap = prev ? t0 - prev.t : 1e9; t0 = 0;
      // intervalle entre la fin du 1er toucher et le début du 2e
      if (prev && gap < 600 && Math.hypot(x0 - prev.x, y0 - prev.y) < 70 && start && !end && vias.length && !rulerOn && !wxOn && !tideOn) {
        tapHold = now + 800; prev = null; closeRoute(); return;
      }
      prev = { t: now, x: x0, y: y0 };
    }, { capture: true, passive: true });
  })();
  map.on('click', e => {
    if (Date.now() < tapHold) return; // second toucher d'un double toucher
    // Un toucher peut produire deux clics : ignorer le second.
    if (e.originalEvent && e.originalEvent.timeStamp - lastClick < 450) return;
    lastClick = e.originalEvent ? e.originalEvent.timeStamp : 0;
    if (rulerOn) { rulerTap(e.lngLat); return; }
    if (tideOn) { tideTap(e.lngLat); return; } // en mode marée, toucher la carte choisit le lieu
    if (wxOn) return; // en mode météo, toucher la carte ne pose rien
    if (!start) setPoint('start', e.lngLat);
    else if (!end) { addVia({ lat: e.lngLat.lat, lon: e.lngLat.lng }); clearResult(); refresh(); }
    // route fermée : toucher la carte ne change plus rien (on peut zoomer et se déplacer)
  });
  // Double clic sur PC : pose le dernier point et ferme la route
  map.on('dblclick', e => {
    if (rulerOn || wxOn || tideOn || !start || end || !vias.length) return;
    e.preventDefault(); closeRoute();
  });

  // Flèches de vent (SDF pour la couleur).
  function arrowImage() {
    const s = 32, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.beginPath();
    g.moveTo(16, 3); g.lineTo(24, 15); g.lineTo(18.5, 15); g.lineTo(18.5, 29); g.lineTo(13.5, 29); g.lineTo(13.5, 15); g.lineTo(8, 15);
    g.closePath(); g.fill();
    return g.getImageData(0, 0, s, s);
  }
  // Barbule de vent (convention météo) : la hampe pointe d'où vient le vent.
  // Demi-barbule = 5 nds, barbule = 10 nds, triangle = 50 nds. Pied de la hampe = le point.
  function barbImage(kt) {
    const W = 58, H = 88, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.strokeStyle = g.fillStyle = '#000'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
    const x = 29, top = 6, foot = 84;
    if (kt < 2.5) { g.beginPath(); g.arc(x, foot - 8, 7, 0, 2 * Math.PI); g.stroke(); return g.getImageData(0, 0, W, H); }
    g.beginPath(); g.moveTo(x, foot); g.lineTo(x, top); g.stroke();
    g.beginPath(); g.arc(x, foot - 2, 3.5, 0, 2 * Math.PI); g.fill();
    let n = Math.round(kt / 5) * 5, y = top;
    while (n >= 50) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 26, y - 2); g.lineTo(x, y + 11); g.closePath(); g.fill(); y += 14; n -= 50; }
    if (n < 10 && y === top) y += 9; // demi-barbule seule : un peu en retrait du bout
    while (n >= 10) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 28, y - 9); g.stroke(); y += 10; n -= 10; }
    if (n >= 5) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 15, y - 5); g.stroke(); }
    return g.getImageData(0, 0, W, H);
  }
  // Flèche des vagues : double chevron (sens où vont les vagues)
  function waveArrowImage() {
    const s = 64, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.lineCap = 'round'; g.lineJoin = 'round';
    const chev = () => { g.beginPath(); g.moveTo(15, 31); g.lineTo(32, 14); g.lineTo(49, 31); g.moveTo(15, 50); g.lineTo(32, 33); g.lineTo(49, 50); g.stroke(); };
    g.strokeStyle = '#0b3a5c'; g.lineWidth = 13; chev();
    g.strokeStyle = '#ffffff'; g.lineWidth = 7; chev();
    return g.getImageData(0, 0, s, s);
  }
  // Flèche de courant (pointe vers où va le courant), vert d'eau avec liseré blanc
  function curArrowImage() {
    const s = 64, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.lineJoin = 'round';
    const path = () => { g.beginPath(); g.moveTo(32, 6); g.lineTo(52, 30); g.lineTo(39, 30); g.lineTo(39, 58); g.lineTo(25, 58); g.lineTo(25, 30); g.lineTo(12, 30); g.closePath(); };
    path(); g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.stroke();
    path(); g.fillStyle = '#0a7a6e'; g.fill();
    return g.getImageData(0, 0, s, s);
  }
  const EMPTY = { type: 'FeatureCollection', features: [] };
  // Fond de carte : profondeurs en bandes bleues (mer) et relief ombré ton sable (terre)
  function addRelief() {
    map.addSource('dem', {
      type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 12,
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      attribution: 'Relief : <a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a> (ETOPO1, GMTED) · Fonds et dangers pour la route : © <a href="https://openwaters.io/charts/seascape" target="_blank">Open Waters: Seascape</a>, OpenSeaMap',
    });
    // La côte précise vient de la carte OpenStreetMap ; le relief (≈ 2 km) ne sert qu'à teinter
    // la terre en altitude et le large. Près des côtes, il s'efface pour ne jamais déborder.
    const sea = [[-6000, '#7fb2d8'], [-2000, '#8bbadc'], [-1000, '#98c3e1'], [-500, '#a6cce6'], [-200, '#b5d6eb'], [-100, '#c4dff0'], [-50, '#d2e7f4']];
    const stops = [];
    sea.forEach(([z, c], i) => { if (i > 0) stops.push(z - 0.01, sea[i - 1][1]); stops.push(z, c); });
    stops.push(-49.99, 'rgba(210,231,244,0.6)', -25, 'rgba(210,231,244,0)', 1e5, 'rgba(210,231,244,0)');
    const land = [-1e5, 'rgba(239,228,201,0)', 40, 'rgba(239,228,201,0)', 200, '#efe4c9', 600, '#e6d8b6', 1200, '#dbcaa2', 2000, '#cfbd95', 3000, '#e9e4da', 4500, '#ffffff'];
    try {
      map.setPaintProperty('background', 'background-color', '#f4ecd8');
      if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', '#dfeef7');
    } catch (e) {}
    const afterWater = map.getLayer('landcover_ice_shelf') ? 'landcover_ice_shelf' : (map.getLayer('landuse_residential') ? 'landuse_residential' : undefined);
    const beforeWater = map.getLayer('water') ? 'water' : afterWater;
    try {
      map.addLayer({ id: 'relief-land', type: 'color-relief', source: 'dem', paint: { 'color-relief-color': ['interpolate', ['linear'], ['elevation'], ...land] } }, beforeWater);
      map.addLayer({ id: 'relief-sea', type: 'color-relief', source: 'dem', paint: { 'color-relief-color': ['interpolate', ['linear'], ['elevation'], ...stops.slice(0)] } }, afterWater);
    } catch (e) { /* ancien navigateur : on garde le fond simple */ }
    map.addLayer({ id: 'relief-shade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#6b5a3e', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#8a7756' } }, afterWater);
    // Trait de côte marqué : contour des surfaces d'eau OpenStreetMap (mer et lacs, pas les rivières)
    try {
      const firstSym = (map.getStyle().layers.find(l => l.type === 'symbol') || {}).id;
      map.addLayer({ id: 'coast', type: 'line', source: 'openmaptiles', 'source-layer': 'water',
        filter: ['!=', ['get', 'class'], 'river'],
        paint: { 'line-color': '#3d5a75', 'line-opacity': 0.6,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 6, 0.9, 9, 1.2, 12, 1.6] } }, firstSym);
    } catch (e) {}
  }

  // Tiki 38 vu du dessus, d'après le plan : deux coques Wharram blanches et fines, pointues aux deux bouts,
  // deux roofs de coque, barrots en bois, pont à lattes et cockpit central, goélette à deux mâts
  // (voiles à bôme et corne) plus la trinquette sur l'étai avant.
  // Les voiles se placent sous le vent selon l'angle du vent ; au moteur elles sont affalées.
  const VB = { x: -16, y: -6, w: 72, h: 80 };
  // Icône du bateau : 't' Tiki 38, 'c' catamaran courant, 'm' monocoque courant (même échelle : coque de 0 à 64)
  function boatEl(kind = OPT.ico) {
    const d = document.createElement('div');
    d.className = 'boat';
    const sail = (id, mx, my, L, kind) => `<g class="sail" id="${id}" data-x="${mx}" data-y="${my}" data-l="${L}" data-k="${kind}">
        <path class="sail-cloth" d="" fill="#fffdf5" fill-opacity="0.92" stroke="#1d2733" stroke-width="0.9" stroke-linejoin="round"/>
        <path class="sail-spar" d="" stroke="#5b3a1a" stroke-width="1.2" stroke-linecap="round" fill="none"/>
      </g>`;
    const mast = y => `<circle cx="20" cy="${y}" r="2" fill="#1d2733" stroke="#fff" stroke-width="0.6"/>`;
    if (kind === 'c') {
      // Catamaran de croisière : coques à tableau, trampoline à l'avant, nacelle avec rouf, gréement en tête
      d.dataset.hw = '15';
      const hull = cx => `M${cx} 0 C${cx + 4.8} 10 ${cx + 4.8} 48 ${cx + 4.2} 64 L${cx - 4.2} 64 C${cx - 4.8} 48 ${cx - 4.8} 10 ${cx} 0 Z`;
      const net = Array.from({ length: 6 }, (_, k) => `<line x1="${10.5 + k * 3.8}" y1="9" x2="${10.5 + k * 3.8}" y2="24"/>`).join('') + Array.from({ length: 4 }, (_, k) => `<line x1="10" y1="${11.5 + k * 3.6}" x2="30" y2="${11.5 + k * 3.6}"/>`).join('');
      d.innerHTML = `<svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" aria-hidden="true">
      <path d="M7 3 L20 9 L33 3" stroke="#3a4552" stroke-width="0.6" fill="none"/>
      <rect x="9" y="9" width="22" height="15" fill="#dfe6ec" fill-opacity="0.75"/>
      <g stroke="#9aa8b5" stroke-width="0.4">${net}</g>
      <g stroke="#1d2733" stroke-width="0.9" fill="#fbfbfa"><path d="${hull(7)}"/><path d="${hull(33)}"/></g>
      <path d="M8 24 L32 24 L32.5 58 Q20 61 7.5 58 Z" fill="#f4f6f7" stroke="#1d2733" stroke-width="0.8"/>
      <rect x="11" y="26" width="18" height="17" rx="3.5" fill="#e9edf0" stroke="#556270" stroke-width="0.6"/>
      <path d="M12.5 27.5 L27.5 27.5 L26.5 31 L13.5 31 Z" fill="#5d7387"/>
      <rect x="12" y="46" width="16" height="10" rx="1.5" fill="#d9b27a" stroke="#7a4a22" stroke-width="0.5"/>
      <line x1="7.5" y1="9" x2="32.5" y2="9" stroke="#556270" stroke-width="1.4" stroke-linecap="round"/>
            <g class="spi" display="none"><g class="spi-rot">
        <path d="M6 -1 Q8 -19 20 -23 Q32 -19 34 -1 Q20 -10 6 -1 Z" fill="#d8452f" stroke="#1d2733" stroke-width="0.9" stroke-linejoin="round"/>
        <path d="M13.5 -5.2 Q15 -18 20 -20 Q25 -18 26.5 -5.2 Q20 -8 13.5 -5.2 Z" fill="#fffdf5"/>
        <path d="M18 -6.6 Q18.6 -16 20 -17 Q21.4 -16 22 -6.6 Q20 -7.2 18 -6.6 Z" fill="#1f5f99"/>
      </g><path class="spi-sheet" d="" stroke="#1d2733" stroke-width="0.5" fill="none"/></g>
      ${sail('sail-j', 20, 9, 16, 'jib')}
      ${sail('sail-m', 20, 27, 26, 'main')}
      ${mast(27)}
    </svg>`;
      return d;
    }
    if (kind === 'm') {
      // Monocoque de croisière : coque à tableau, rouf, cockpit avec barre à roue, gréement en tête
      d.dataset.hw = '9'; d.dataset.sc = '11,1'; d.dataset.sy = '50';
      d.innerHTML = `<svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" aria-hidden="true">
      <path d="M20 0 C28.5 9 30 34 28.6 64 L11.4 64 C10 34 11.5 9 20 0 Z" fill="#fbfbfa" stroke="#1d2733" stroke-width="0.9"/>
      <path d="M20 2.2 C26.8 10 28 34 26.8 62 L13.2 62 C12 34 13.2 10 20 2.2 Z" fill="#e6d3ad" stroke="#a7783f" stroke-width="0.4"/>
      <rect x="14.2" y="20" width="11.6" height="22" rx="4" fill="#f1f3f4" stroke="#556270" stroke-width="0.6"/>
      <path d="M15.5 21.5 L24.5 21.5 L24 25 L16 25 Z" fill="#5d7387"/>
      <rect x="14.5" y="45" width="11" height="15" rx="1.5" fill="#d9b27a" stroke="#7a4a22" stroke-width="0.5"/>
      <circle cx="20" cy="56" r="3" fill="none" stroke="#1d2733" stroke-width="0.8"/>
      <g class="spi" display="none"><g class="spi-rot">
        <path d="M9 1 Q10.5 -17 20 -21 Q29.5 -17 31 1 Q20 -7 9 1 Z" fill="#d8452f" stroke="#1d2733" stroke-width="0.9" stroke-linejoin="round"/>
        <path d="M14.5 -3.4 Q15.8 -16 20 -18 Q24.2 -16 25.5 -3.4 Q20 -6 14.5 -3.4 Z" fill="#fffdf5"/>
        <path d="M18.2 -4.8 Q18.7 -14 20 -15 Q21.3 -14 21.8 -4.8 Q20 -5.4 18.2 -4.8 Z" fill="#1f5f99"/>
      </g><path class="spi-sheet" d="" stroke="#1d2733" stroke-width="0.5" fill="none"/></g>
      ${sail('sail-j', 20, 2, 19, 'jib')}
      ${sail('sail-m', 20, 21, 25, 'main')}
      ${mast(21)}
    </svg>`;
      return d;
    }
    // Tiki 38 vu du dessus, d'après le plan : deux coques Wharram blanches et fines, pointues aux deux bouts,
    // deux roofs de coque, barrots en bois, pont à lattes et cockpit central, goélette à deux mâts
    // (voiles à bôme et corne) plus la trinquette sur l'étai avant.
    d.dataset.hw = '15';
    const hull = cx => `M${cx} 0 C${cx + 4.4} 12 ${cx + 4.4} 50 ${cx + 0.6} 64 L${cx - 0.6} 64 C${cx - 4.4} 50 ${cx - 4.4} 12 ${cx} 0 Z`;
    const roof = cx => `<rect x="${cx - 2.2}" y="20" width="4.4" height="24" rx="2" fill="#efe6d2" stroke="#556270" stroke-width="0.5"/>
      <rect x="${cx - 1.3}" y="25" width="2.6" height="3" rx="0.6" fill="#8fa3b5"/><rect x="${cx - 1.3}" y="36" width="2.6" height="3" rx="0.6" fill="#8fa3b5"/>`;
    const slats = Array.from({ length: 8 }, (_, k) => `<line x1="${11.2 + k * 2.5}" y1="25" x2="${11.2 + k * 2.5}" y2="41"/>`).join('');
    d.innerHTML = `<svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" aria-hidden="true">
      <path d="M7 3 L20 8 L33 3" stroke="#3a4552" stroke-width="0.6" fill="none"/>
      <g stroke="#1d2733" stroke-width="0.9" fill="#fbf8f1"><path d="${hull(7)}"/><path d="${hull(33)}"/></g>
      <g stroke="#b8322a" stroke-width="0.9" fill="none"><path d="M5 10 C3.4 24 3.4 44 5.6 58"/><path d="M9 10 C10.6 24 10.6 44 8.4 58"/>
        <path d="M31 10 C29.4 24 29.4 44 31.6 58"/><path d="M35 10 C36.6 24 36.6 44 34.4 58"/></g>
      ${roof(7)}${roof(33)}
      <rect x="10" y="24" width="20" height="18" fill="#d9b27a" stroke="#7a4a22" stroke-width="0.6"/>
      <g stroke="#a7783f" stroke-width="0.5">${slats}</g>
      <g stroke="#6b3f1c" stroke-width="2" stroke-linecap="round">
        <line x1="5" y1="12" x2="35" y2="12"/><line x1="4.6" y1="24" x2="35.4" y2="24"/>
        <line x1="4.6" y1="42" x2="35.4" y2="42"/><line x1="5" y1="53" x2="35" y2="53"/>
      </g>
      <rect x="15" y="28" width="10" height="10" rx="2" fill="#f6f1e4" stroke="#3a4552" stroke-width="0.7"/>
      <rect x="17" y="30.5" width="6" height="5" rx="1" fill="#c7d3de"/>
      <g class="spi" display="none"><g class="spi-rot">
        <path d="M6 -1 Q8 -19 20 -23 Q32 -19 34 -1 Q20 -10 6 -1 Z" fill="#d8452f" stroke="#1d2733" stroke-width="0.9" stroke-linejoin="round"/>
        <path d="M13.5 -5.2 Q15 -18 20 -20 Q25 -18 26.5 -5.2 Q20 -8 13.5 -5.2 Z" fill="#fffdf5"/>
        <path d="M18 -6.6 Q18.6 -16 20 -17 Q21.4 -16 22 -6.6 Q20 -7.2 18 -6.6 Z" fill="#1f5f99"/>
      </g><path class="spi-sheet" d="" stroke="#1d2733" stroke-width="0.5" fill="none"/></g>
      ${sail('sail-j', 20, 7, 12, 'jib')}
      ${sail('sail-f', 20, 15, 20, 'gaff')}
      ${sail('sail-m', 20, 32, 25, 'gaff')}
      <circle cx="20" cy="15" r="2" fill="#1d2733" stroke="#fff" stroke-width="0.6"/><circle cx="20" cy="32" r="2" fill="#1d2733" stroke="#fff" stroke-width="0.6"/>
    </svg>`;
    return d;
  }
  function trimSails(elB, hdg, twd, mot, spi) {
    if (!elB) return;
    const twa = twd != null && hdg != null ? norm180(twd - hdg) : 0;
    const port = twa >= 0; // vent de tribord : voiles à bâbord
    const sg = port ? 1 : -1;
    // Spi : gonflé devant les étraves, déporté sous le vent ; le foc est alors roulé
    const sp = elB.querySelector('.spi');
    if (sp) {
      sp.setAttribute('display', spi && !mot ? 'inline' : 'none');
      if (spi && !mot) {
        const r = -sg * Math.min(55, Math.max(0, (180 - Math.abs(twa)) * 0.6));
        sp.querySelector('.spi-rot').setAttribute('transform', `rotate(${r.toFixed(1)} 20 4)`);
        const c = (x, y) => { const a = r * Math.PI / 180, dx = x - 20, dy = y - 4; return [20 + dx * Math.cos(a) - dy * Math.sin(a), 4 + dx * Math.sin(a) + dy * Math.cos(a)]; };
        const [scx, scy] = (elB.dataset.sc || '6,-1').split(',').map(Number), hw = +(elB.dataset.hw || 15), sy = +(elB.dataset.sy || 56);
        const k = c(sg > 0 ? scx : 40 - scx, scy), hx = 20 - sg * hw; // écoute vers l'arrière de la coque sous le vent
        sp.querySelector('.spi-sheet').setAttribute('d', `M${k[0].toFixed(1)} ${k[1].toFixed(1)} L${hx} ${sy} M${c(sg > 0 ? 40 - scx : scx, scy).map(v => v.toFixed(1)).join(' ')} L20 3`);
      }
    }
    const base = mot ? 0 : Math.min(80, Math.max(10, Math.abs(twa) * 0.5));
    const rad = a => (a * Math.PI) / 180;
    // point à l'arrière du mât (0° = vers l'arrière), tourné du côté bâbord si sg > 0
    const pt = (mx, my, L, a) => [mx - Math.sin(rad(a * sg)) * L, my + Math.cos(rad(a * sg)) * L];
    elB.querySelectorAll('.sail').forEach(g => {
      const mx = +g.dataset.x, my = +g.dataset.y, L = +g.dataset.l, k = g.dataset.k;
      const cloth = g.querySelector('.sail-cloth'), spar = g.querySelector('.sail-spar');
      if (k === 'jib') {
        if (mot || spi) { cloth.setAttribute('d', ''); spar.setAttribute('d', ''); return; }
        const a = Math.min(60, base * 0.8);
        const c = pt(mx, my, L, a), m = pt(mx, my, L * 0.6, a + 22);
        cloth.setAttribute('d', `M${mx} ${my} Q${m[0].toFixed(1)} ${m[1].toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)} Z`);
        spar.setAttribute('d', '');
        return;
      }
      const b = pt(mx, my, L, base);                      // bout de bôme
      if (mot) { cloth.setAttribute('d', ''); spar.setAttribute('d', `M${mx} ${my} L${b[0].toFixed(1)} ${b[1].toFixed(1)}`); return; }
      if (k === 'main') { // grand-voile triangulaire : seule la bôme, la chute arrondie revient en tête de mât
        const hd = pt(mx, my, L * 0.5, Math.min(115, base + 30)); // haut de la voile, plus ouvert (vrillage)
        const bm = pt(mx, my, L * 0.85, base + 14);
        cloth.setAttribute('d', `M${mx} ${my} L${b[0].toFixed(1)} ${b[1].toFixed(1)} Q${bm[0].toFixed(1)} ${bm[1].toFixed(1)} ${hd[0].toFixed(1)} ${hd[1].toFixed(1)} Z`);
        spar.setAttribute('d', `M${mx} ${my} L${b[0].toFixed(1)} ${b[1].toFixed(1)}`);
        return;
      }
      const gf = pt(mx, my, L * 0.85, Math.min(105, base + 24)); // bout de corne : la voile vrille vers le haut
      const bm = pt(mx, my, L * 0.75, base + 16);         // creux de la voile
      cloth.setAttribute('d', `M${mx} ${my} L${b[0].toFixed(1)} ${b[1].toFixed(1)} Q${bm[0].toFixed(1)} ${bm[1].toFixed(1)} ${gf[0].toFixed(1)} ${gf[1].toFixed(1)} Z`);
      spar.setAttribute('d', `M${mx} ${my} L${b[0].toFixed(1)} ${b[1].toFixed(1)} M${mx} ${my} L${gf[0].toFixed(1)} ${gf[1].toFixed(1)}`);
    });
  }
  // Taille du bateau selon le zoom : petit au large, grand près des côtes
  function sizeBoat() {
    if (!boat) return;
    const pc = Math.min(window.innerWidth, window.innerHeight) > 600 || window.matchMedia('(any-pointer: fine)').matches; // grand écran ou souris
    const len = pc
      ? Math.max(26, Math.min(105, 30 * Math.pow(1.3, map.getZoom() - 6)))   // PC : 105 px au plus
      : Math.max(22, Math.min(190, 30 * Math.pow(1.5, map.getZoom() - 6))); // téléphone : longueur des coques en px
    const w = len * VB.w / 64, h = len * VB.h / 64;
    const e = boat.getElement();
    e.style.width = `${w.toFixed(1)}px`; e.style.height = `${h.toFixed(1)}px`;
  }
  map.on('zoom', sizeBoat);

  map.on('load', () => {
    addRelief();
    const SZ = BIG() ? 1.4 : 1;
    for (let k = 0; k <= 70; k += 5) map.addImage(`barb-${k}`, barbImage(k), { sdf: true, pixelRatio: 2 });
    // Style des lignes de sonde (bleu, avec la profondeur écrite)
    const EMOD_SLD = '%3CStyledLayerDescriptor%20version%3D%221.0.0%22%20xmlns%3D%22http%3A//www.opengis.net/sld%22%20xmlns%3Aogc%3D%22http%3A//www.opengis.net/ogc%22%3E%3CNamedLayer%3E%3CName%3Eemodnet%3Acontours%3C/Name%3E%3CUserStyle%3E%3CFeatureTypeStyle%3E%3CRule%3E%3CLineSymbolizer%3E%3CStroke%3E%3CCssParameter%20name%3D%22stroke%22%3E%233d6f99%3C/CssParameter%3E%3CCssParameter%20name%3D%22stroke-width%22%3E1.2%3C/CssParameter%3E%3C/Stroke%3E%3C/LineSymbolizer%3E%3CTextSymbolizer%3E%3CLabel%3E%3Cogc%3APropertyName%3Eelevation%3C/ogc%3APropertyName%3E%3C/Label%3E%3CFont%3E%3CCssParameter%20name%3D%22font-size%22%3E12%3C/CssParameter%3E%3C/Font%3E%3CLabelPlacement%3E%3CLinePlacement/%3E%3C/LabelPlacement%3E%3CHalo%3E%3CRadius%3E2%3C/Radius%3E%3CFill%3E%3CCssParameter%20name%3D%22fill%22%3E%23ffffff%3C/CssParameter%3E%3C/Fill%3E%3C/Halo%3E%3CFill%3E%3CCssParameter%20name%3D%22fill%22%3E%232f5d85%3C/CssParameter%3E%3C/Fill%3E%3C/TextSymbolizer%3E%3C/Rule%3E%3C/FeatureTypeStyle%3E%3C/UserStyle%3E%3C/NamedLayer%3E%3C/StyledLayerDescriptor%3E';
    // Carte marine : profondeurs EMODnet (lignes de sonde) et balises/feux OpenSeaMap, cachées par défaut
    map.addSource('emod', { type: 'raster', tileSize: 256, tiles: ['https://ows.emodnet-bathymetry.eu/wms?service=WMS&request=GetMap&version=1.1.1&layers=emodnet:contours&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}&SLD_BODY=' + EMOD_SLD], attribution: 'Sondes <a href="https://emodnet.ec.europa.eu/en/bathymetry" target="_blank">EMODnet</a>' });
    map.addSource('seamark', { type: 'raster', tileSize: 256, minzoom: 6, maxzoom: 18, tiles: ['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'], attribution: 'Balises <a href="https://www.openseamap.org" target="_blank">OpenSeaMap</a>' });
    // Carte littorale SHOM-IGN du Géoportail (flux public de l'IGN), France seulement
    map.addSource('shom', { type: 'raster', tileSize: 256, minzoom: 6, maxzoom: 16, bounds: [-61.88, -21.52, 56.14, 51.19],
      tiles: ['https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.COASTALMAPS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png'],
      attribution: 'Carte littorale © <a href="https://www.shom.fr" target="_blank">SHOM</a>-<a href="https://www.ign.fr" target="_blank">IGN</a> (<a href="https://www.geoportail.gouv.fr" target="_blank">Géoportail</a>)' });
    map.addLayer({ id: 'shom', type: 'raster', source: 'shom', layout: { visibility: 'none' } });
    // Cartes marines électroniques de l'IHM (Instituto Hidrográfico de la Marina), côtes d'Espagne, accès public
    map.addSource('ihm', { type: 'raster', tileSize: 256, minzoom: 5, maxzoom: 17, bounds: [-19.5, 26.5, 6.5, 45.5],
      tiles: ['https://ideihm.covam.es/ihmcache/wmts/1.0.0/RasterENC/default/googlemapscompatible/{z}/{y}/{x}.png'],
      attribution: 'Carte marine © <a href="https://ideihm.covam.es/portal/" target="_blank">IHM España</a>' });
    map.addLayer({ id: 'ihm', type: 'raster', source: 'ihm', layout: { visibility: 'none' } });
    // Cartes officielles gratuites : NOAA (États-Unis), DHN (Brésil), Kartverket (Norvège), Traficom (Finlande)
    map.addSource('noaa', { type: 'raster', tileSize: 256, minzoom: 3, maxzoom: 18, bounds: [-180, -15, -63, 72],
      tiles: ['https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/NOAAChartDisplay/MapServer/exts/MaritimeChartService/WMSServer?service=WMS&version=1.3.0&request=GetMap&layers=1,2,3,4,5,6,7,10,11&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png'],
      attribution: 'Carte marine <a href="https://nauticalcharts.noaa.gov" target="_blank">NOAA</a>' });
    map.addSource('bra', { type: 'raster', tileSize: 256, minzoom: 4, maxzoom: 17, bounds: [-60, -36, -26, 7],
      tiles: ['https://idem.marinha.mil.br/geoserver/carta_nautica/wms?service=WMS&version=1.1.1&request=GetMap&layers=__BR__&styles=&srs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png'],
      attribution: 'Carta náutica © <a href="https://www.marinha.mil.br/chm/" target="_blank">DHN Marinha do Brasil</a>' });
    map.addSource('nor', { type: 'raster', tileSize: 256, minzoom: 3, maxzoom: 18, bounds: [-11, 56, 35, 82],
      tiles: ['https://cache.kartverket.no/v1/wmts/1.0.0/sjokartraster/default/webmercator/{z}/{y}/{x}.png'],
      attribution: 'Sjøkart © <a href="https://www.kartverket.no" target="_blank">Kartverket</a>' });
    map.addSource('fin', { type: 'raster', tileSize: 256, minzoom: 5, maxzoom: 17, bounds: [19, 59.3, 31, 66.5],
      tiles: ['https://julkinen.traficom.fi/rasteripalvelu/wmts/rest/Traficom:Merikarttasarja%20A%20public/default/WGS84_Pseudo-Mercator/WGS84_Pseudo-Mercator:{z}/{y}/{x}?format=image/png'],
      attribution: 'Merikartta © <a href="https://www.traficom.fi" target="_blank">Traficom</a> CC BY 4.0' });
    map.addSource('isl', { type: 'raster', tileSize: 256, minzoom: 5, maxzoom: 17, bounds: [-25.5, 62.8, -12.5, 67.6],
      tiles: ['https://gis.lmi.is/mapcache/sjokort/wms?service=WMS&version=1.1.1&request=GetMap&layers=Sjomaelingar:Sjokort_Sjomaelinga&styles=&srs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png'],
      attribution: 'Sjókort © <a href="https://www.lhg.is" target="_blank">Landhelgisgæsla Íslands</a>, <a href="https://www.lmi.is" target="_blank">LMÍ</a>' });
    map.addSource('swe', { type: 'raster', tileSize: 256, minzoom: 5, maxzoom: 17, bounds: [10.5, 55, 24.5, 66.2],
      tiles: ['https://geokatalog.sjofartsverket.se/MapService/wms.axd/Sjokort_TS?service=WMS&version=1.1.1&request=GetMap&layers=Sjokort&styles=&srs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png'],
      attribution: 'Sjökort © <a href="https://www.sjofartsverket.se" target="_blank">Sjöfartsverket</a>' });
    ['noaa', 'bra', 'nor', 'fin', 'isl', 'swe'].forEach(id => map.addLayer({ id, type: 'raster', source: id, layout: { visibility: 'none' } }));
    map.addLayer({ id: 'emod', type: 'raster', source: 'emod', layout: { visibility: chartOn ? 'visible' : 'none' }, paint: { 'raster-opacity': 0.9 } });
    map.addLayer({ id: 'seamark', type: 'raster', source: 'seamark', layout: { visibility: chartOn ? 'visible' : 'none' } });
    map.addSource('wind', { type: 'geojson', data: EMPTY });
    map.addSource('isos', { type: 'geojson', data: EMPTY });
    map.addSource('route', { type: 'geojson', data: EMPTY });
    map.addSource('route2', { type: 'geojson', data: EMPTY });
    map.addSource('nodes', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'wind', type: 'symbol', source: 'wind',
      layout: {
        'icon-image': ['concat', 'barb-', ['to-string', ['get', 'bb']]], 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map',
        'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-size': BIG() ? 1.15 : 0.9,
        'text-field': ['to-string', ['get', 'label']], 'text-size': BIG() ? 13 : 11, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-allow-overlap': false,
        'text-font': ['Noto Sans Regular'],
      },
      paint: {
        'icon-color': ['interpolate', ['linear'], ['get', 'tws'], 0, '#3d5366', 10, '#1f4e74', 17, '#0f3352', 22, '#c27a00', 30, '#b8322a'],
        'icon-opacity': 0.95, 'text-color': '#13263a', 'text-halo-color': 'rgba(255,255,255,0.35)', 'text-halo-width': 0.6,
      },
    });
    map.addImage('wave-arrow', waveArrowImage(), { pixelRatio: 2 });
    map.addSource('wave-dirs', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'wave-dirs', type: 'symbol', source: 'wave-dirs',
      layout: {
        'icon-image': 'wave-arrow', 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true, 'icon-size': ['interpolate', ['linear'], ['get', 'hs'], 0, 0.6 * SZ, 4, 1 * SZ],
        'text-field': ['get', 'label'], 'text-size': BIG() ? 13 : 12, 'text-offset': [0, 1.5], 'text-allow-overlap': false,
        'text-font': ['Noto Sans Regular'],
      },
      paint: { 'text-color': '#0b2a45', 'text-halo-color': 'rgba(255,255,255,0.35)', 'text-halo-width': 0.6 },
    });
    map.addImage('cur-arrow', curArrowImage(), { pixelRatio: 2 });
    map.addSource('cur-dirs', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'cur-dirs', type: 'symbol', source: 'cur-dirs',
      layout: {
        'icon-image': 'cur-arrow', 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true, 'icon-size': ['interpolate', ['linear'], ['get', 'sp'], 0, 0.45 * SZ, 1, 0.8 * SZ, 3, 1.15 * SZ],
        'text-field': ['get', 'label'], 'text-size': BIG() ? 13 : 12, 'text-offset': [0, 1.5], 'text-allow-overlap': false,
        'text-font': ['Noto Sans Regular'],
      },
      paint: { 'text-color': '#064b44', 'text-halo-color': 'rgba(255,255,255,0.85)', 'text-halo-width': 1 },
    });
    map.addLayer({ id: 'isos', type: 'line', source: 'isos', paint: { 'line-color': '#1f5f8b', 'line-width': 1, 'line-opacity': 0.35 } });
    map.addLayer({ id: 'route2', type: 'line', source: 'route2', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#7b3fa8', 'line-width': 3, 'line-dasharray': [2, 1.5], 'line-opacity': 0.9 } });
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fff', 'line-width': 6 } });
    map.addSource('plan', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'plan', type: 'line', source: 'plan', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#1f5f8b', 'line-width': 2.5, 'line-opacity': 0.8, 'line-dasharray': [2, 1.5] } });
    map.addLayer({ id: 'route', type: 'line', source: 'route', filter: ['!=', ['get', 'mot'], true], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#b8322a', 'line-width': 3.5 } });
    map.addLayer({ id: 'route-mot', type: 'line', source: 'route', filter: ['==', ['get', 'mot'], true], layout: { 'line-join': 'round' }, paint: { 'line-color': '#1d2733', 'line-width': 3.5, 'line-dasharray': [1.6, 1.2] } });
    map.addLayer({ id: 'nodes', type: 'circle', source: 'nodes', paint: { 'circle-radius': 3, 'circle-color': '#fff', 'circle-stroke-color': '#b8322a', 'circle-stroke-width': 1.5 } });
    map.addSource('ruler', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'ruler-casing', type: 'line', source: 'ruler', paint: { 'line-color': '#fff', 'line-width': 5 } });
    map.addLayer({ id: 'ruler-line', type: 'line', source: 'ruler', paint: { 'line-color': '#e07b00', 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
  });

  // Carte Seamap (Open Waters, CC-BY 4.0) : fonds, sondes, balises et feux dessinés comme une carte marine.
  // Chargée seulement quand on la choisit ; les couches passent sous les noms de villes et sous la route.
  const SEA_SRC = ['seamap', 'seascape-dem', 'seascape-vector'];
  let seaIds = null, seaLoading = false;
  async function addSeamap() {
    if (seaIds || seaLoading) return;
    seaLoading = true;
    try {
      if (!map.getLayer('shom')) await new Promise(r => map.once('load', () => setTimeout(r, 0)));
      const st = await (await fetch('https://tiles.openwaters.io/seamap/style.json')).json();
      const at = '© <a href="https://openwaters.io/charts/seamap" target="_blank">Open Waters: Seamap</a>';
      for (const k of SEA_SRC) if (!map.getSource(k)) map.addSource(k, Object.assign({}, st.sources[k], k === 'seamap' ? { attribution: at } : {}));
      try { map.addSprite('freenauticalchart', 'https://tiles.openwaters.io/seamap/sprites/freenauticalchart'); } catch (e) {}
      const firstSym = (map.getStyle().layers.find(l => l.type === 'symbol') || {}).id;
      seaIds = [];
      for (const l of st.layers) {
        if (!SEA_SRC.includes(l.source) || l.id === 'land_area') continue;
        const L = JSON.parse(JSON.stringify(l).replace(/Noto Sans SemiBold/g, 'Noto Sans Bold'));
        L.id = 'sea-' + l.id;
        if (l.id === 'depth-areas') L.paint = Object.assign({}, L.paint, { 'fill-opacity': 0.55 });
        L.layout = Object.assign({}, L.layout, { visibility: chartOn && chartSrc === 'sea' ? 'visible' : 'none' });
        try { map.addLayer(L, L.type === 'symbol' ? 'shom' : firstSym); seaIds.push(L.id); } catch (e) { console.warn('seamap', l.id, e.message); }
      }
    } catch (e) { console.warn('seamap', e); seaIds = null; }
    seaLoading = false;
  }

  // Couche vagues : image calculée sur la zone, transparente sur la terre (masque des côtes)
  const WCOL = [[0, [120, 200, 225, 110]], [0.5, [64, 170, 205, 185]], [1, [30, 120, 190, 200]], [1.5, [40, 70, 170, 210]], [2, [242, 190, 40, 215]], [3, [238, 120, 30, 220]], [4, [214, 50, 35, 225]], [6, [130, 20, 60, 235]]];
  function wcol(v) {
    if (v <= 0) return WCOL[0][1];
    for (let i = 1; i < WCOL.length; i++) if (v <= WCOL[i][0]) {
      const [a, ca] = WCOL[i - 1], [b, cb] = WCOL[i], f = (v - a) / (b - a);
      return ca.map((c, k) => c + (cb[k] - c) * f);
    }
    return WCOL[WCOL.length - 1][1];
  }
  let showWaves = false, wavesKey = '', wavesCanvas = null, wavesSea = null;
  const merc = la => Math.log(Math.tan(Math.PI / 4 + rad(la) / 2));
  const imerc = y => deg(2 * Math.atan(Math.exp(y)) - Math.PI / 2);
  // Zone dessinée : la partie visible de la carte, limitée à la grille météo
  const BIG = () => window.innerWidth > 720;
  function viewBox() {
    const W = wind, la0 = W.lats[0], la1 = W.lats[W.ny - 1], lo0 = W.lons[0], lo1 = W.lons[W.nx - 1];
    const b = map.getBounds();
    const s = Math.max(la0, b.getSouth()), n = Math.min(la1, b.getNorth()), w = Math.max(lo0, b.getWest()), e = Math.min(lo1, b.getEast());
    if (!(n > s && e > w)) return null;
    return { s, n, w, e };
  }
  // Points régulièrement espacés à l'écran (même densité sur téléphone et ordinateur, quel que soit le zoom)
  function screenGrid(gap, off) {
    const B = viewBox(); if (!B) return [];
    const c = map.getCanvas(), Wd = c.clientWidth, Hd = c.clientHeight, pts = [];
    for (let y = gap * (0.5 + off); y < Hd; y += gap) for (let x = gap * (0.5 + off); x < Wd; x += gap) {
      const ll = map.unproject([x, y]);
      if (ll.lat < B.s || ll.lat > B.n || ll.lng < B.w || ll.lng > B.e || isLand(ll.lat, ll.lng)) continue;
      pts.push([ll.lng, ll.lat]);
    }
    return pts;
  }
  let curH = 0, showCur = false;
  // Flèches de courant sur la zone visible (bouton « Courant »)
  function drawCur(h) {
    if (h != null) curH = h;
    const btn = el('cur-toggle');
    btn.hidden = !(currents && wind && (last || wxOn));
    const vis = showCur && !btn.hidden;
    el('cur-legend').hidden = !vis;
    const src = map.getSource('cur-dirs'); if (!src) return;
    if (!vis) { src.setData(EMPTY); return; }
    const feats = [];
    for (const [lo, la] of screenGrid(BIG() ? 110 : 90, 0.5)) {
      const c = curAt(la, lo, curH);
      if (!c) continue;
      feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lo, la] }, properties: { rot: c.dir, sp: c.sp, label: `${nf1.format(c.sp)}` } });
    }
    src.setData({ type: 'FeatureCollection', features: feats });
  }
  el('cur-toggle').addEventListener('click', () => {
    showCur = !showCur;
    el('cur-toggle').setAttribute('aria-pressed', String(showCur));
    el('cur-toggle').setAttribute('aria-label', showCur ? 'Masquer le courant' : 'Afficher le courant');
    // Courant et vagues : un seul à la fois, pour garder la carte lisible
    if (showCur && showWaves) el('wave-toggle').click();
    const r = last; drawCur(wxOn ? Number(el('wx-range').value) : r ? r.h0 + (Number(ui.scrub.value) / 1000) * r.dur : 0);
  });
  function drawWaves(h) {
    if (h != null) curH = h;
    drawCur();
    const vis = showWaves && waves && wind;
    if (map.getLayer('waves')) map.setLayoutProperty('waves', 'visibility', vis ? 'visible' : 'none');
    if (map.getLayer('relief-sea')) map.setLayoutProperty('relief-sea', 'visibility', vis ? 'none' : 'visible');
    el('wave-legend').hidden = !vis;
    if (!vis) { map.getSource('wave-dirs') && map.getSource('wave-dirs').setData(EMPTY); return; }
    const B = viewBox(); if (!B) return;
    const hh = Math.round(curH), bk = [B.s, B.n, B.w, B.e].map(x => x.toFixed(3)).join(':');
    const key = `${wind.t0}:${hh}:${bk}`;
    if (key === wavesKey) return;
    wavesKey = key;
    const W = wind, la0 = B.s, la1 = B.n, lo0 = B.w, lo1 = B.e;
    const cv = map.getCanvas(), pxW = cv.clientWidth * (lo1 - lo0) / Math.max(1e-6, map.getBounds().getEast() - map.getBounds().getWest());
    const NX = Math.max(120, Math.min(700, Math.round(pxW / 2.5))), ym0 = merc(la0), ym1 = merc(la1);
    const NY = Math.max(40, Math.min(700, Math.round(NX * (ym1 - ym0) / rad(lo1 - lo0))));
    if (!wavesCanvas || wavesCanvas.width !== NX || wavesCanvas.height !== NY || !wavesSea || wavesSea.k !== bk) {
      wavesCanvas = document.createElement('canvas'); wavesCanvas.width = NX; wavesCanvas.height = NY;
      const sea = new Uint8Array(NX * NY);
      for (let j = 0; j < NY; j++) { const la = imerc(ym1 - (ym1 - ym0) * (j + 0.5) / NY); for (let i = 0; i < NX; i++) sea[j * NX + i] = isLand(la, lo0 + (lo1 - lo0) * (i + 0.5) / NX) ? 0 : 1; }
      wavesSea = { k: bk, sea };
    }
    const g = wavesCanvas.getContext('2d'), img = g.createImageData(NX, NY);
    for (let j = 0; j < NY; j++) {
      const la = imerc(ym1 - (ym1 - ym0) * (j + 0.5) / NY);
      for (let i = 0; i < NX; i++) {
        const o = j * NX + i;
        if (!wavesSea.sea[o]) continue;
        const v = waveAt(la, lo0 + (lo1 - lo0) * (i + 0.5) / NX, hh);
        if (!v) continue;
        const c = wcol(v.hs);
        img.data[o * 4] = c[0]; img.data[o * 4 + 1] = c[1]; img.data[o * 4 + 2] = c[2]; img.data[o * 4 + 3] = c[3];
      }
    }
    g.putImageData(img, 0, 0);
    // Flèches de direction, décalées d'une demi-maille par rapport aux flèches de vent
    if (map.getSource('wave-dirs')) {
      const feats = [];
      for (const [lo, la] of screenGrid(BIG() ? 110 : 90, 0.5)) {
        const v = waveAt(la, lo, hh);
        if (!v || v.hs < 0.05) continue;
        feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lo, la] }, properties: { rot: norm360(v.dir + 180), hs: v.hs, label: `${nf1.format(v.hs)} m` } });
      }
      map.getSource('wave-dirs').setData({ type: 'FeatureCollection', features: feats });
    }
    const coords = [[lo0, la1], [lo1, la1], [lo1, la0], [lo0, la0]];
    const src = map.getSource('waves'), url = wavesCanvas.toDataURL();
    if (src) src.updateImage({ url, coordinates: coords });
    else {
      map.addSource('waves', { type: 'image', url, coordinates: coords });
      map.addLayer({ id: 'waves', type: 'raster', source: 'waves', paint: { 'raster-opacity': 0.9, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, map.getLayer('landcover_ice_shelf') ? 'landcover_ice_shelf' : (map.getLayer('isos') ? 'isos' : undefined));
    }
  }
  el('wave-toggle').addEventListener('click', () => {
    showWaves = !showWaves;
    if (showWaves && showCur) { showCur = false; el('cur-toggle').setAttribute('aria-pressed', 'false'); el('cur-toggle').setAttribute('aria-label', 'Afficher le courant'); }
    el('wave-toggle').setAttribute('aria-pressed', String(showWaves));
    el('wave-toggle').setAttribute('aria-label', showWaves ? 'Masquer les vagues' : 'Afficher les vagues');
    wavesKey = '';
    // Sur le fond coloré des vagues, barbules toutes foncées avec un liseré clair (l'orange du vent fort s'y perdait)
    const WC = ['interpolate', ['linear'], ['get', 'tws'], 0, '#3d5366', 10, '#1f4e74', 17, '#0f3352', 22, '#c27a00', 30, '#b8322a'];
    map.setPaintProperty('wind', 'icon-color', showWaves ? '#0a1424' : WC);
    map.setPaintProperty('wind', 'icon-halo-color', 'rgba(255,255,255,0.8)');
    map.setPaintProperty('wind', 'icon-halo-width', showWaves ? 1.2 : 0);
    const r = last; drawWaves(wxOn ? Number(el('wx-range').value) : r ? r.h0 + (Number(ui.scrub.value) / 1000) * r.dur : 0);
  });

  function drawWindMap(h) {
    if (h != null) curH = h;
    if (!wind || !map.getSource('wind')) return;
    const feats = [];
    const gap = BIG() ? 110 : 90, W = wind;
    for (const [lo, la] of screenGrid(gap, 0)) {
      // Vue large : une flèche couvre plusieurs points du modèle ; on montre le vent le plus fort de sa case
      // (sinon un coup de vent local, mistral près de Marseille par exemple, passe entre deux flèches)
      let w = windAt(la, lo, curH);
      const q = map.project([lo, la]), A = map.unproject([q.x - gap / 2, q.y - gap / 2]), B2 = map.unproject([q.x + gap / 2, q.y + gap / 2]);
      const i0 = Math.ceil((Math.min(A.lng, B2.lng) - W.lons[0]) / W.step), i1 = Math.floor((Math.max(A.lng, B2.lng) - W.lons[0]) / W.step);
      const j0 = Math.ceil((Math.min(A.lat, B2.lat) - W.lats[0]) / W.step), j1 = Math.floor((Math.max(A.lat, B2.lat) - W.lats[0]) / W.step);
      for (let j = Math.max(0, j0); j <= Math.min(W.ny - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(W.nx - 1, i1); i++) {
        const nla = W.lats[0] + j * W.step, nlo = W.lons[0] + i * W.step;
        if (isLand(nla, nlo)) continue;
        const x = windAt(nla, nlo, curH);
        if (x && (!w || x.tws > w.tws)) w = x;
      }
      if (!w) continue;
      feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lo, la] }, properties: { rot: norm360(w.twd), tws: w.tws, bb: Math.min(70, Math.round(w.tws / 5) * 5), label: nf0.format(w.tws) } });
    }
    map.getSource('wind').setData({ type: 'FeatureCollection', features: feats });
  }
  // Après un déplacement ou un zoom, redessiner vent et vagues sur la nouvelle zone visible
  let mvT = null;
  map.on('moveend', () => { clearTimeout(mvT); mvT = setTimeout(() => { if (wind) { drawWindMap(); drawWaves(); } if (wxOn) wxCheckView(); }, 120); });

  // ---------- Météo seule (avant le routage) : vent et vagues sur la zone visible ----------
  let wxOn = false, wxW = null, wxSeq = 0, wxSaved = null, wxSpan = 0, wxT = null;
  const wxFmt = new Intl.DateTimeFormat('fr-CH', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  function wxInfo(t, err) { const i = el('wx-time'); i.textContent = t; i.classList.toggle('err', !!err); }
  function wxBox() {
    const b = map.getBounds(), dy = (b.getNorth() - b.getSouth()) * 0.25, dx = (b.getEast() - b.getWest()) * 0.25;
    return { s: Math.max(-80, b.getSouth() - dy), n: Math.min(80, b.getNorth() + dy), w: Math.max(-180, b.getWest() - dx), e: Math.min(180, b.getEast() + dx) };
  }
  function wxShow() {
    if (!wind) return;
    const h = Number(el('wx-range').value);
    const t = wxFmt.format(new Date(wind.t0 + h * 3.6e6)); wxInfo(t.charAt(0).toUpperCase() + t.slice(1) + (h === Number(el('wx-range').min) ? ' · maintenant' : ''));
    drawWindMap(h); wavesKey = ''; drawWaves(h);
  }
  async function wxLoad() {
    const seq = ++wxSeq, M = MODELS.find(x => x.id === model), bb = wxBox();
    el('wx-range').disabled = true;
    const c = map.getCenter();
    if (M.area && (c.lat < M.area.s || c.lat > M.area.n || c.lng < M.area.w || c.lng > M.area.e)) {
      wxInfo(`${M.name} ne couvre que la France et ses abords. Choisissez un autre modèle.`, true); return;
    }
    try {
      wxInfo(`Vent ${M.name}\u2026`); omLimited = false;
      await loadMasks(bb);
      const W = await loadWind(bb, M.days, model, f => { if (seq === wxSeq) wxInfo(`Vent ${M.name}\u2026 ${Math.round(f * 100)} %`); });
      if (seq !== wxSeq || !wxOn) return;
      const keepH = wind && wind === wxW ? wind.t0 + Number(el('wx-range').value) * 3.6e6 : null;
      wind = W; wxW = W; waves = null; currents = null; wxSpan = bb.e - bb.w;
      const r = el('wx-range'), hNow = Math.max(0, Math.min(W.nt - 1, Math.floor((Date.now() - W.t0) / 3.6e6)));
      r.min = hNow; r.max = W.nt - 1;
      const tS = new Date(ui.tStart.value), want = keepH != null ? keepH : (Number.isNaN(+tS) || (!tStartSet && !last) ? Date.now() : +tS);
      r.value = Math.max(hNow, Math.min(W.nt - 1, Math.round((want - W.t0) / 3.6e6)));
      r.disabled = false; wxShow();
      // Vagues ensuite, sans bloquer le vent
      let V = null;
      if (M.wave) { try { V = await loadWaves(M.days, M.wave[0]); } catch (e) { V = null; } }
      if (V && !V.hs.some(x => !Number.isNaN(x))) V = null;
      if (!V && !omLimited) { try { V = await loadWaves(M.days); } catch (e) { V = null; } }
      if (seq !== wxSeq || !wxOn || wind !== W) return;
      waves = V; el('wave-toggle').hidden = !V; wavesKey = ''; drawWaves(Number(r.value));
      // Courant ensuite (10 jours au plus)
      let C = null;
      if (!omLimited) { try { C = await loadCurrents(M.days); } catch (e) { C = null; } }
      if (seq !== wxSeq || !wxOn || wind !== W) return;
      currents = C; drawCur(Number(r.value));
    } catch (e) {
      if (seq === wxSeq) wxInfo(e.message || 'Météo indisponible.', true);
    }
  }
  function wxCheckView() {
    if (!wind) return;
    const b = map.getBounds(), B = wind.bb, sp = b.getEast() - b.getWest();
    const out = b.getSouth() < B.s || b.getNorth() > B.n || b.getWest() < B.w || b.getEast() > B.e;
    if (out || sp < wxSpan / 4) { clearTimeout(wxT); wxT = setTimeout(wxLoad, 500); }
  }
  function wxOpen() {
    if (typeof tideOn !== 'undefined' && tideOn) tideSet(false);
    const sel = el('wx-model'); sel.innerHTML = ui.models.innerHTML; sel.value = ui.models.value;
    wxOn = true; document.body.classList.add('wx');
    el('wx-btn').setAttribute('aria-pressed', 'true');
    el('wx-bar').hidden = false;
    if (isMobile()) setSheet(false);
    wxSaved = last ? { wind, waves, currents } : null; wxW = null;
    el('wave-toggle').hidden = true;
    wxLoad();
  }
  function wxClose(keep) {
    wxOn = false; wxSeq++; clearTimeout(wxT); document.body.classList.remove('wx');
    el('wx-btn').setAttribute('aria-pressed', 'false');
    el('wx-bar').hidden = true;
    if (!keep && last && wxSaved) {
      wind = wxSaved.wind; waves = wxSaved.waves; currents = wxSaved.currents; wavesKey = ''; wavesSea = null;
      el('wave-toggle').hidden = !!last.noWaves;
      ui.scrub.dispatchEvent(new Event('input'));
    } else {
      wind = null; waves = null; currents = null;
      el('wave-toggle').hidden = true;
      map.getSource('wind') && map.getSource('wind').setData(EMPTY);
      drawWaves();
    }
    wxSaved = null;
  }
  // Boutons Météo / Vagues : glisser vers la droite = icônes seules, vers la gauche = avec le texte (mémorisé dans un cookie)
  (() => {
    const fab = el('wave-fab'), CKF = 'tiki_fab';
    const setMini = on => { fab.classList.toggle('mini', on); try { document.cookie = `${CKF}=${on ? 1 : 0}; Max-Age=31536000; Path=/; Secure; SameSite=Lax`; } catch (e) {} };
    if (document.cookie.split('; ').some(c => c === CKF + '=1')) fab.classList.add('mini');
    let x0 = null, y0 = 0, swiped = 0;
    fab.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; });
    fab.addEventListener('pointermove', e => {
      if (x0 == null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 1.5) { setMini(dx > 0); swiped = Date.now(); x0 = null; }
    });
    const end = () => { x0 = null; };
    fab.addEventListener('pointerup', end); fab.addEventListener('pointercancel', end);
    // Un glissement ne doit pas compter comme un appui sur le bouton
    fab.addEventListener('click', e => { if (Date.now() - swiped < 500) { e.stopPropagation(); e.preventDefault(); } }, true);
  })();
  // Mesure : toucher deux points, afficher la distance et le cap vrai. Les points se déplacent au doigt.
  let rulerOn = false, rA = null, rB = null;
  const rulerMk = () => { const d = document.createElement('div'); d.style.cssText = 'width:22px;height:22px;border-radius:50%;background:#e07b00;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:grab'; return d; };
  // Petites distances en mètres (moins de 0,5 M), comme sur les traceurs : arrondi à 5 m sous 200 m, sinon à 10 m
  const mTxt = d => { const m = d * 1852, r = m < 200 ? 5 : 10; return `${new Intl.NumberFormat('fr-CH').format(Math.max(r, Math.round(m / r) * r))} m`; };
  const distTxt = d => d < 0.5 ? mTxt(d) : `${new Intl.NumberFormat('fr-CH', { maximumFractionDigits: d < 10 ? 1 : 0, minimumFractionDigits: d < 10 ? 1 : 0 }).format(d)} M`;
  const nmTxt = d => new Intl.NumberFormat('fr-CH', { maximumFractionDigits: d < 10 ? 2 : 1, minimumFractionDigits: d < 10 ? 2 : 1 }).format(d);
  function rulerDraw() {
    const src = map.getSource('ruler'); if (!src) return;
    const a = rA && rA.getLngLat(), b = rB && rB.getLngLat();
    src.setData(a && b ? { type: 'Feature', geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] } } : EMPTY);
    const v = el('ruler-val');
    if (!a) v.innerHTML = 'Touchez 2 points sur la carte';
    else if (!b) v.innerHTML = 'Touchez le 2e point';
    else {
      const p = { lat: a.lat, lon: a.lng }, q = { lat: b.lat, lon: b.lng }, d = distNm(p, q), c = Math.round(bearing(p, q)) % 360;
      v.innerHTML = `${d < 0.5 ? `${mTxt(d)} <span class="rl-nm">(${nmTxt(d)} M)</span>` : `${nmTxt(d)} M`} · cap ${String(c).padStart(3, '0')}°<small>Cap vrai. Glissez les points, ou touchez pour recommencer.</small>`;
    }
  }
  function rulerPt(ll) { const m = new maplibregl.Marker({ element: rulerMk(), draggable: true }).setLngLat(ll).addTo(map); m.on('drag', rulerDraw); return m; }
  function rulerClear() { rA && rA.remove(); rB && rB.remove(); rA = rB = null; rulerDraw(); }
  function rulerTap(ll) { if (rA && rB) rulerClear(); if (!rA) rA = rulerPt(ll); else rB = rulerPt(ll); rulerDraw(); }
  function rulerSet(on) {
    rulerOn = on; document.body.classList.toggle('ruler', on);
    el('ruler-btn').setAttribute('aria-pressed', on ? 'true' : 'false');
    el('ruler-box').hidden = !on;
    if (on && isMobile()) setSheet(false);
    if (!on) rulerClear(); else rulerDraw();
  }
  el('ruler-btn').addEventListener('click', () => { if (!rulerOn && tideOn) tideSet(false); rulerSet(!rulerOn); });
  // Marée : toucher la mer, courbe de hauteur d'eau sur 3 jours (Open-Meteo, modèle Météo-France SMOC)
  let tideOn = false, tideMk = null, tideSeq = 0;
  const tideMkEl = () => { const d = document.createElement('div'); d.style.cssText = 'width:22px;height:22px;border-radius:50%;background:#0a6fa8;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)'; return d; };
  const mfmt = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',') + ' m';
  function tideSet(on) {
    tideOn = on; tideSeq++; document.body.classList.toggle('tide', on);
    el('tide-btn').setAttribute('aria-pressed', on ? 'true' : 'false');
    el('tide-box').hidden = !on;
    if (on) { if (rulerOn) rulerSet(false); if (wxOn) wxClose(); if (isMobile()) setSheet(false); }
    else { tideMk && tideMk.remove(); tideMk = null; el('tide-body').hidden = true; el('tide-ttl').textContent = "Touchez la mer à l'endroit voulu"; }
  }
  async function tideTap(ll) {
    const seq = ++tideSeq;
    if (tideMk) tideMk.setLngLat(ll); else tideMk = new maplibregl.Marker({ element: tideMkEl() }).setLngLat(ll).addTo(map);
    el('tide-ttl').textContent = 'Chargement de la marée…';
    try {
      const url = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + ll.lat.toFixed(4) + '&longitude=' + ll.lng.toFixed(4)
        + '&hourly=sea_level_height_msl&timezone=auto&timeformat=unixtime&cell_selection=sea&forecast_days=4&past_days=1';
      const j = await (await fetch(url)).json();
      if (seq !== tideSeq || !tideOn) return;
      // fuseau du lieu (donné par Open-Meteo) ; minuit du jour dans ce fuseau
      let tz = j.timezone || 'UTC'; try { new Intl.DateTimeFormat('fr-CH', { timeZone: tz }); } catch (e) { tz = 'UTC'; }
      // En pleine mer, Open-Meteo répond « GMT » (pas de fuseau) : on prend l'heure de l'appareil
      const atSea = /^(GMT|UTC|Etc\/)/.test(tz); if (atSea) tz = devTz;
      const off = (j.utc_offset_seconds || 0) * 1000;
      const T = (j.hourly && j.hourly.time) || [], H = (j.hourly && j.hourly.sea_level_height_msl) || [];
      const all = [];
      T.forEach((t, i) => { if (H[i] != null) all.push([t * 1000, H[i]]); });
      if (all.length < 48) { el('tide-ttl').textContent = 'Pas de données de marée à cet endroit'; el('tide-body').hidden = true; return; }
      tideData = { all, tz, atSea, med: isMed(ll.lat, ll.lng) };
      if (!tideData.med) brestExt().then(pm => { brestPM = pm; if (seq === tideSeq && tideOn) tideRender(); });
      el('tide-ttl').innerHTML = 'Marée · ' + fmtPos({ lat: ll.lat, lon: ll.lng });
      tideRender();
      el('tide-body').hidden = false;
    } catch (e) { if (seq === tideSeq) el('tide-ttl').textContent = 'Marée indisponible (pas de réseau ?)'; }
  }
  const tzOff = (tz, t) => { try { const p = new Intl.DateTimeFormat('fr-CH', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date(t)).find(x => x.type === 'timeZoneName'); return (p ? p.value : 'UTC').replace('GMT', 'UTC').replace('-', '−').replace(/^UTC$/, 'UTC+0'); } catch (e) { return 'UTC'; } };
  const tzName = (tz, t) => { try { const p = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, timeZoneName: 'long' }).formatToParts(new Date(t)).find(x => x.type === 'timeZoneName'); return p && !/^(UTC|GMT)/.test(p.value) ? p.value : ''; } catch (e) { return ''; } };
  let tideCur = null, tideData = null;
  // Coefficient de marée calculé à Brest (marnage / 6,10 m × 100), même valeur pour toute la côte ; pas en Méditerranée
  let brestP = null;
  const isMed = (lat, lon) => lon > -5.6 && lon < 42 && lat > 30 && lat < 47.5 && !(lon < 0.5 && lat > 43);
  function brestExt() {
    if (!brestP) brestP = fetch('https://marine-api.open-meteo.com/v1/marine?latitude=48.38&longitude=-4.495&hourly=sea_level_height_msl&timeformat=unixtime&cell_selection=sea&forecast_days=5&past_days=1')
      .then(r => r.json()).then(j => {
        const T = (j.hourly && j.hourly.time) || [], H = (j.hourly && j.hourly.sea_level_height_msl) || [], e = [];
        for (let i = 1; i < T.length - 1; i++) {
          const a = H[i - 1], b = H[i], c = H[i + 1]; if (a == null || b == null || c == null) continue;
          const hi = b > a && b >= c, lo = b < a && b <= c; if (!hi && !lo) continue;
          const den = a - 2 * b + c, off = den ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * den))) : 0;
          e.push({ t: (T[i] + off * 3600) * 1000, h: b - (a - c) * off / 4, hi });
        }
        const pm = [];
        for (let k = 1; k < e.length - 1; k++) if (e[k].hi && !e[k - 1].hi && !e[k + 1].hi) pm.push({ t: e[k].t, c: Math.round(Math.max(20, Math.min(120, (e[k].h - (e[k - 1].h + e[k + 1].h) / 2) / 6.1 * 100))) });
        return pm;
      }).catch(() => { brestP = null; return []; });
    return brestP;
  }
  let brestPM = [];
  const coefAt = t => { if (!tideData || tideData.med || !brestPM.length) return null; let b = null; for (const p of brestPM) if (!b || Math.abs(p.t - t) < Math.abs(b.t - t)) b = p; return b && Math.abs(b.t - t) < 9 * 3600e3 ? b.c : null; };
  // Choix des heures : lieu touché, appareil ou UTC (mémorisé dans un cookie)
  let tideZone = 'app'; // toujours l'heure de l'appareil
  const devTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
  const offOf = (tz, t) => { const m = tzOff(tz, t).replace('−', '-').match(/UTC([+-])(\d+)(?::(\d+))?/); return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) * 60e3 : 0; };
  el('tide-s').addEventListener('input', () => tideRender());
  function tideRender() {
    if (!tideData) return;
    const tz = tideZone === 'utc' ? 'UTC' : tideZone === 'app' ? devTz : tideData.tz;
    const off = offOf(tz, Date.now()), dz = Math.floor((Date.now() + off) / 86400e3) * 86400e3 - off;
    const base = Math.min(...tideData.all.map(p => p[1]));
    const pts = tideData.all.filter(p => p[0] >= dz - 3600e3 && p[0] <= dz + 73 * 3600e3).map(p => [p[0], p[1] - base]);
    ['lieu', 'app', 'utc'].forEach(k => el('tz-' + k).setAttribute('aria-pressed', k === tideZone ? 'true' : 'false'));
    tideDraw(pts, dz, tz);
  }
  ['lieu', 'app', 'utc'].forEach(k => el('tz-' + k).addEventListener('click', () => {
    tideZone = k; try { document.cookie = `tiki_tidetz=${k}; Max-Age=31536000; Path=/; Secure; SameSite=Lax`; } catch (e) {} tideRender();
  }));
  // Sonde lue sur la carte (facultative) : on affiche alors l'eau totale
  const tideS = () => { const v = parseFloat(String(el('tide-s').value).replace(',', '.')); return Number.isFinite(v) && v >= 0 ? v : null; };
  const tmfmt = v => { const S = tideS(); return S == null ? '+' + nf1.format(Math.max(0, v)) + ' m' : nf1.format(S + Math.max(0, v)) + ' m'; };
  function tideDraw(pts, d0, tz) {
    const fD = new Intl.DateTimeFormat('fr-CH', { timeZone: tz, weekday: 'short', day: 'numeric' });
    const fH = new Intl.DateTimeFormat('fr-CH', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit' });
    const fh = new Intl.DateTimeFormat('fr-CH', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' });
    // pleines et basses mers : sommet de la parabole sur 3 heures voisines
    const ext = [];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1][1], b = pts[i][1], c = pts[i + 1][1];
      const hi = b > a && b >= c, lo = b < a && b <= c;
      if (!hi && !lo) continue;
      const den = a - 2 * b + c, off = den ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * den))) : 0;
      ext.push({ t: pts[i][0] + off * 3600e3, h: b - (a - c) * off / 4, hi });
    }
    // petites ondulations (moins de 3 cm) : ce ne sont pas de vraies pleines ou basses mers
    for (let i = 1; i < ext.length; i++) if (Math.abs(ext[i].h - ext[i - 1].h) < 0.03) { ext.splice(i - 1, 2); i = Math.max(0, i - 2); }
    const t1 = d0 + 72 * 3600e3;
    const hs = pts.map(p => p[1]); let lo = Math.min(...hs), hi = Math.max(...hs);
    if (hi - lo < 1) { const m = (hi + lo) / 2; lo = m - 0.5; hi = m + 0.5; } // échelle d'au moins 1 m : la Méditerranée reste plate
    const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
    const sv = el('tide-svg'); el('tide-body').hidden = false; const W = Math.max(280, sv.clientWidth || 600), Hh = 168, top = 8, bot = 34; sv.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    const X = t => ((t - d0) / (t1 - d0)) * W, Y = h => top + (hi - h) / (hi - lo) * (Hh - top - bot);
    let g = '';
    // graduations : trait fin toutes les 3 h, heure écrite toutes les 6 h (toutes les 12 h si l'écran est étroit)
    const lab = W >= 520 ? 6 : 12;
    for (let k = 0; k <= 24; k++) {
      const t = d0 + k * 3 * 3600e3, x = X(t), hh = (k * 3) % 24;
      if (hh === 0) g += `<line x1="${x}" y1="0" x2="${x}" y2="${Hh - bot + 4}" class="tg-midn"/>`;
      else g += `<line x1="${x}" y1="${Hh - bot}" x2="${x}" y2="${Hh - bot + 4}" class="tg-tick"/>` + (hh % 6 === 0 ? `<line x1="${x}" y1="0" x2="${x}" y2="${Hh - bot}" class="tg-h6"/>` : '');
      if (hh % lab === 0 && hh) g += `<text x="${x}" y="${Hh - bot + 14}" class="tg-hr" text-anchor="middle">${String(hh).padStart(2, '0')}h</text>`;
    }
    for (let k = 0; k < 3; k++) g += `<text x="${X(d0 + k * 86400e3) + 4}" y="${Hh - 2}" class="tg-lbl">${fD.format(new Date(d0 + k * 86400e3 + 43200e3))}</text>`;
    const st = hi - lo > 6 ? 2 : hi - lo > 3 ? 1 : hi - lo > 1.5 ? 0.5 : 0.2;
    for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) {
      const y = Y(v); if (y < 12 || y > Hh - bot - 2) continue;
      if (v < -1e-6) continue; // sous la sonde : pas de graduation
      g += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" class="${Math.abs(v) < 1e-6 ? 'tg-zero' : 'tg-day'}"/><text x="3" y="${y - 3}" class="tg-ax">${Math.abs(v) < 1e-6 ? (tideS() == null ? 'sonde' : 'sonde ' + nf1.format(tideS()) + ' m') : tmfmt(Math.round(v * 10) / 10)}</text>`;
    }
    const line = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
    g += `<path d="${line}L${X(pts[pts.length - 1][0]).toFixed(1)} ${Hh - bot}L${X(pts[0][0]).toFixed(1)} ${Hh - bot}Z" class="tg-fill"/><path d="${line}" class="tg-line"/>`;
    ext.forEach(e => { if (e.t >= d0 && e.t <= t1) g += `<circle cx="${X(e.t)}" cy="${Y(e.h)}" r="4" class="${e.hi ? 'tg-pm' : 'tg-bm'}"/>`; });
    const now = Date.now(); if (now > d0 && now < t1) g += `<line x1="${X(now)}" y1="0" x2="${X(now)}" y2="${Hh - bot}" class="tg-now"/>`;
    const dep = +new Date(ui.tStart.value); if (dep > d0 && dep < t1) g += `<line x1="${X(dep)}" y1="0" x2="${X(dep)}" y2="${Hh - bot}" class="tg-dep"/>`;
    g += '<g id="tg-cur" style="display:none"><line class="tg-curl" y1="0" y2="' + (Hh - bot) + '"/><circle class="tg-curc" r="5"/><text class="tg-curt" y="13"></text></g>';
    el('tide-svg').innerHTML = g;
    tideCur = { pts, d0, t1, X, Y, W, fH };
    const N = Date.now(), pl = tideData.tz, lbl = { lieu: tideData.atSea ? 'En mer, heures de votre appareil' : 'Heures du lieu', app: 'Heures de votre appareil', utc: 'Heures UTC' }[tideZone];
    const others = [['lieu', 'lieu', pl], ['app', 'appareil', devTz]].filter(([k, , z]) => k !== tideZone && tzOff(z, N) !== tzOff(tz, N)).map(([, n, z]) => `${n} : ${tzOff(z, N)}`);
    el('tide-tz-txt').innerHTML = `${tideZone === 'utc' ? '<b>Heures UTC</b>' : `${lbl} : <b>${tzOff(tz, N)}</b>`}${tideZone !== 'utc' && tzName(tz, N) ? ' (' + tzName(tz, N) + ')' : ''}${others.length ? ' · ' + [...new Set(others)].join(' · ') : ''}`;
    // les 4 prochaines pleines et basses mers à partir de maintenant
    const nx = ext.filter(e => e.t > now - 1800e3).slice(0, 4);
        el('tide-ext').innerHTML = nx.map(e => `<span class="${e.hi ? 'pm' : 'bm'}"><b>${e.hi ? 'Haute' : 'Basse'}</b> ${fH.format(new Date(Math.round(e.t / 300e3) * 300e3))} <i>${tmfmt(e.h)}</i></span>`).join('')
      + `<span class="tide-key"><em class="k-now"></em>maintenant${dep > d0 && dep < t1 ? '<em class="k-dep"></em>départ' : ''}</span>`;
    tideWater(pts, now, null);
  }
  // rappel de la sonde et hauteur d'eau en gros
  function tideWater(P, t, fH) {
    const S = tideS(); el('tide-warn').hidden = S != null; el('tide-sl').classList.toggle('need', S == null);
    const o = el('tide-now'); if (S == null || !P || !P.length) { o.hidden = true; return; }
    let i = P.findIndex(p => p[0] >= t); if (i <= 0) i = 1; if (i >= P.length) i = P.length - 1;
    const a = P[i - 1], b = P[i], h = a[1] + (b[1] - a[1]) * Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
    const cf = coefAt(t); o.hidden = false; o.innerHTML = `Eau ${fH ? 'à ' + fH.format(new Date(t)) : 'maintenant'} : <b>${tmfmt(h)}</b>${cf != null ? ` <span class="tide-coef">· coef. ${cf}</span>` : ''}`;
  }
  // curseur : heure et hauteur au doigt (interpolation entre les heures)
  function tideAt(ev) {
    const c = tideCur, sv = el('tide-svg'); if (!c) return;
    const r = sv.getBoundingClientRect(), x = Math.max(0, Math.min(c.W, (ev.clientX - r.left) * c.W / r.width));
    let t = c.d0 + x / c.W * (c.t1 - c.d0); t = Math.round(t / 600e3) * 600e3;
    const P = c.pts; let i = P.findIndex(p => p[0] >= t); if (i <= 0) i = 1; if (i < 0 || i >= P.length) return;
    const a = P[i - 1], b = P[i], h = a[1] + (b[1] - a[1]) * Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
    const g = el('tg-cur'); g.style.display = '';
    const X = c.X(t), Yv = c.Y(h), txt = `${c.fH.format(new Date(t))} · ${tideS() == null ? 'sonde ' : 'eau '}${tmfmt(h)}`;
    g.querySelector('line').setAttribute('x1', X); g.querySelector('line').setAttribute('x2', X);
    g.querySelector('circle').setAttribute('cx', X); g.querySelector('circle').setAttribute('cy', Yv);
    const tx = g.querySelector('text'); tx.textContent = txt; tideWater(P, t, c.fH);
    const right = X > c.W - 150; tx.setAttribute('x', right ? X - 6 : X + 6); tx.setAttribute('text-anchor', right ? 'end' : 'start');
  }
  (() => { const sv = el('tide-svg'); let dn = false;
    sv.addEventListener('pointerdown', e => { dn = true; try { sv.setPointerCapture(e.pointerId); } catch (x) {} tideAt(e); });
    sv.addEventListener('pointermove', e => { if (dn || e.pointerType === 'mouse') tideAt(e); });
    sv.addEventListener('pointerup', () => { dn = false; });
    sv.addEventListener('pointercancel', () => { dn = false; });
  })();
  el('tide-btn').addEventListener('click', () => tideSet(!tideOn));
  el('tide-close').addEventListener('click', () => tideSet(false));
  el('ruler-close').addEventListener('click', () => rulerSet(false));
  // Bouton Carte marine : mémorisé dans un cookie
  // Choix de la carte (Balises ou SHOM) mémorisé dans un cookie ; la carte reste éteinte à l'ouverture
  let chartSrc = 'sea'; // Seamap seul, fondu avec le relief
  // Choix automatique selon le centre de l'écran : SHOM en France, IHM en Espagne, Balises ailleurs
  const inB = (la, lo, a, b, c, d) => la >= a && la <= b && lo >= c && lo <= d;
  function autoSrc() {
    const c = map.getCenter(), la = c.lat, lo = c.lng, z = map.getZoom();
    if (z < 6) return 'osm';
    const es = inB(la, lo, 35.95, 42.43, -5.65, 4.6) || inB(la, lo, 41.85, 43.9, -9.9, -1.78) || inB(la, lo, 36, 37.4, -7.4, -5.65) || inB(la, lo, 27.4, 29.6, -18.4, -13.2);
    if (es) return 'ihm';
    if (inB(la, lo, 24, 49.5, -125, -66.5) || inB(la, lo, 51, 72, -180, -129) || inB(la, lo, 18.5, 23, -161, -154) || inB(la, lo, 17.5, 18.8, -68, -64.3) || inB(la, lo, 13, 15.5, 144.5, 146)) return 'noaa';
    if (inB(la, lo, 62.8, 67.6, -25.5, -12.5)) return 'isl';
    if (inB(la, lo, -34, 5.5, -54, -28) && !(la < -30 && lo < -53)) return 'bra';
    if (inB(la, lo, 57.8, 72, 4, 31.5) && !(la < 59.2 && lo > 11.4) && !(lo > 12.5 + (la - 59.2) * 0.6 && la < 68.5)) return 'nor';
    if ((inB(la, lo, 59.6, 61, 19.3, 30.5) && !(la < 59.75 && lo > 22.5)) || inB(la, lo, 61, 66, 21, 25.7)) return 'fin';
    if ((inB(la, lo, 55.2, 59.2, 12.4, 19.5) && !inB(la, lo, 54.9, 55.4, 14.5, 15.3) && !(la < 56.2 && lo < 12.8)) || inB(la, lo, 56.2, 59.2, 11.1, 12.4) || (inB(la, lo, 59.2, 66, 12.5, 21) && lo > 12.5 + (la - 59.2) * 0.6 && !(la < 61 && lo > 19.3))) return 'swe';
    const fr = (inB(la, lo, 41.3, 51.2, -5.8, 9.7) && !(lo > 7.53 && la > 43.2 && la < 46) && !(la > 50.2 && lo < 1.4) && !(la > 50.95 && lo > 2.6))
      || inB(la, lo, 14, 18.2, -63.3, -60.7) || inB(la, lo, 1.9, 6.1, -54.8, -51.4) || inB(la, lo, -21.5, -20.7, 55.1, 55.95) || inB(la, lo, -13.1, -12.5, 44.9, 45.4) || inB(la, lo, 46.6, 47.2, -56.6, -55.9);
    return fr ? 'shom' : 'osm';
  }
  let chartEff = 'osm';
  // Téléphone : nom de la carte et avertissement visibles 5 s, puis repliés ; on les revoit en touchant le cadre
  let chartTxt0 = '', chartTxtT = 0;
  function chartTxtShow() { const lg = el('chart-legend'); lg.classList.remove('quiet'); clearTimeout(chartTxtT); chartTxtT = setTimeout(() => lg.classList.add('quiet'), 5000); }
  el('chart-legend').addEventListener('click', e => { if (e.target.closest('button, select')) return; const lg = el('chart-legend'); if (lg.classList.contains('quiet')) chartTxtShow(); else { clearTimeout(chartTxtT); lg.classList.add('quiet'); } });
  function chartSet(on) {
    chartOn = on;
    const chartSrc0 = chartSrc; { const chartSrc = chartSrc0 === 'auto' ? autoSrc() : chartSrc0; chartEff = chartSrc;
    el('chart-btn').setAttribute('aria-pressed', on ? 'true' : 'false');
    el('chart-legend').hidden = true;
    const vis = (id, v) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none');
    vis('shom', on && chartSrc === 'shom'); ['ihm', 'noaa', 'bra', 'nor', 'fin', 'isl', 'swe'].forEach(id => vis(id, on && chartSrc === id));
    vis('emod', on && chartSrc === 'osm'); vis('seamark', on && chartSrc === 'osm');
    if (on && chartSrc === 'sea' && !seaIds) addSeamap();
    (seaIds || []).forEach(id => vis(id, on && chartSrc === 'sea'));
    vis('relief-shade', !(on && chartSrc === 'sea')); // Seamap a déjà son propre relief des fonds
    el('chart-auto').setAttribute('aria-pressed', chartSrc0 === 'auto' ? 'true' : 'false');
    const pr = v => chartSrc0 !== 'auto' && chartSrc === v ? 'true' : 'false';
    el('chart-pick').value = chartSrc0 === 'auto' ? '' : chartSrc;
    el('chart-pick').setAttribute('aria-pressed', chartSrc0 === 'auto' ? 'false' : 'true');
    el('chart-title').textContent = (chartSrc0 === 'auto' ? 'Auto · ' : '') + { ihm: 'Carte marine IHM, côtes d\u2019Espagne', noaa: 'Carte marine NOAA, États-Unis', bra: 'Carta náutica DHN, Brésil', nor: 'Sjøkart Kartverket, Norvège', fin: 'Merikartta Traficom, Finlande', isl: 'Sjókort LHG, Islande', swe: 'Sjökort Sjöfartsverket, Suède', shom: 'Carte littorale SHOM-IGN (Géoportail), côtes de France', sea: 'Fonds, balises et feux (Seamap)', osm: 'Balises et feux OpenSeaMap, sondes EMODnet (50 m et plus)' }[chartSrc];
    el('chart-warn').textContent = chartSrc === 'ihm' ? 'Selon l\u2019IHM : non valable pour la navigation' : ['noaa', 'bra', 'nor', 'fin', 'isl', 'swe'].includes(chartSrc) ? 'Carte officielle gratuite : non valable pour la navigation' : chartSrc === 'shom' ? 'Mise à jour non garantie : ne pas utiliser pour naviguer' : 'Non officielle : ne remplace pas les cartes du SHOM';
    const tt = on ? el('chart-title').textContent : ''; if (tt && tt !== chartTxt0) chartTxtShow(); chartTxt0 = tt;
    }
    try { document.cookie = 'tiki_chart=0; Max-Age=0; Path=/; Secure; SameSite=Lax'; } catch (e) {}
  }
  const chartPick = v => { chartSrc = v; try { document.cookie = `tiki_chartsrc=${v}; Max-Age=31536000; Path=/; Secure; SameSite=Lax`; } catch (e) {} chartSet(true); };
  el('chart-auto').addEventListener('click', () => chartPick('auto'));
  el('chart-pick').addEventListener('change', e => { if (e.target.value) chartPick(e.target.value); });
  map.on('moveend', () => { if (chartOn && chartSrc === 'auto' && autoSrc() !== chartEff) chartSet(true); });
  el('chart-btn').addEventListener('click', () => chartSet(!chartOn));
  if (chartOn) chartSet(true);
  el('wx-btn').addEventListener('click', () => (wxOn ? wxClose() : wxOpen()));
  el('wx-model').addEventListener('change', () => { ui.models.value = el('wx-model').value; ui.models.dispatchEvent(new Event('change')); });
  el('wx-close').addEventListener('click', () => wxClose());
  el('wx-range').addEventListener('input', wxShow);
  // Lecture / pause : avance d'un cran à intervalle régulier, repart au début à la fin
  function makePlay(btnId, rangeId, step, ms, dur) {
    const b = el(btnId), r = el(rangeId); let t = null;
    const stop = () => { clearInterval(t); t = null; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', 'Lecture'); };
    b.addEventListener('click', () => {
      if (t) return stop();
      if (r.disabled) return;
      if (+r.value >= +r.max) { r.value = r.min; step(); }
      b.setAttribute('aria-pressed', 'true'); b.setAttribute('aria-label', 'Pause');
      // dur : temps pour parcourir toute la plage (avance au temps réel, même si l'écran rame) ; sinon un cran par tic
      const t0 = performance.now(), v0 = +r.value, span = +r.max - +r.min;
      t = setInterval(() => {
        if (r.disabled || r.offsetParent === null) return stop();
        const v = dur ? Math.round(v0 + (performance.now() - t0) / dur * span) : +r.value + 1;
        r.value = Math.min(+r.max, v); step();
        if (+r.value >= +r.max) stop();
      }, ms);
    });
    r.addEventListener('pointerdown', stop);
    return stop;
  }
  const wxPlayStop = makePlay('wx-play', 'wx-range', wxShow, 800);
  const playStop = makePlay('play', 'scrub', () => ui.scrub.dispatchEvent(new Event('input')), 100, 20000);
  el('wx-close').addEventListener('click', wxPlayStop);
  el('wx-prev').addEventListener('click', () => { const r = el('wx-range'); r.value = Number(r.value) - 1; wxShow(); });
  el('wx-next').addEventListener('click', () => { const r = el('wx-range'); r.value = Number(r.value) + 1; wxShow(); });
  function drawIsosMap(isos) {
    if (!map.getSource('isos')) return;
    const every = Math.max(1, Math.round(isos.length / 14));
    const feats = isos.filter((_, i) => i > 0 && i % every === 0).map(iso => {
      // Couper la ligne quand deux points voisins sont loin : ce sont des branches séparées.
      const d = [];
      for (let i = 1; i < iso.length; i++) d.push(distNm({ lon: iso[i - 1][0], lat: iso[i - 1][1] }, { lon: iso[i][0], lat: iso[i][1] }));
      const med = d.length ? [...d].sort((a, b) => a - b)[Math.floor(d.length / 2)] : 0;
      const gap = Math.max(1, med * 4);
      const lines = []; let cur = [];
      iso.forEach((p, i) => {
        if (i && (p[2] - iso[i - 1][2] > 3 || d[i - 1] > gap)) { if (cur.length > 1) lines.push(cur); cur = []; }
        cur.push([p[0], p[1]]);
      });
      if (cur.length > 1) lines.push(cur);
      return { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: lines }, properties: {} };
    });
    map.getSource('isos').setData({ type: 'FeatureCollection', features: feats });
  }

  // ---------- Interface ----------
  MODELS.forEach(m => {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = `${m.name} · ${m.note}`;
    o.selected = m.id === model;
    ui.models.appendChild(o);
  });
  ui.models.addEventListener('change', () => { model = ui.models.value; if (wxOn) { wxSaved = null; } clearResult(); if (wxOn) wxLoad(); });

  // ---------- Panneau repliable (mobile) ----------
  const panel = el('panel'), handle = el('sheet-handle');
  const isMobile = () => window.matchMedia('(max-width: 720px)').matches;
  // Trois positions : ouvert, replié, réduit (une barre avec « Calculer la route »)
  function setSheet(open, mini = false) {
    panel.classList.toggle('collapsed', !open);
    panel.classList.toggle('mini', !open && mini);
    document.body.classList.toggle('sheet-open', open);
    handle.setAttribute('aria-expanded', String(open));
    el('sheet-label').textContent = open ? '\u25BC Voir la carte' : (last ? '\u25B2 Détails de la route' : '\u25B2 Plus d\u2019options');
    if (!open) panel.scrollTop = 0;
  }
  let swipeY = null, swiped = false;
  handle.addEventListener('touchstart', e => { swipeY = e.touches[0].clientY; swiped = false; }, { passive: true });
  handle.addEventListener('touchend', e => {
    if (swipeY == null) return;
    const dy = e.changedTouches[0].clientY - swipeY; swipeY = null;
    if (Math.abs(dy) > 25) {
      swiped = Date.now();
      const st = !panel.classList.contains('collapsed') ? 2 : panel.classList.contains('mini') ? 0 : 1;
      const nx = Math.max(0, Math.min(2, st + (dy < 0 ? 1 : -1)));
      setSheet(nx === 2, nx === 0);
    }
  });
  handle.addEventListener('click', () => { if (swiped && Date.now() - swiped < 500) { swiped = false; return; } swiped = false; if (panel.classList.contains('mini')) setSheet(false); else setSheet(panel.classList.contains('collapsed')); });
  map.getCanvas().addEventListener('touchstart', () => { if (isMobile() && !panel.classList.contains('collapsed')) setSheet(false); }, { passive: true });
  setSheet(false);

  // ---------- Icône écran d'accueil ----------
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; el('install').hidden = false; el('install-hint').hidden = true; });
  el('install').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch (e) { /* rien */ }
    installEvt = null; el('install').hidden = true;
  });
  window.addEventListener('appinstalled', () => { el('install-box').hidden = true; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  function localInput(d) {
    const z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
  }
  const now = new Date(); now.setMinutes(0, 0, 0); now.setHours(now.getHours() + 1);
  ui.tStart.value = localInput(now);
  // Heure de départ jamais touchée : on la garde à jour (appli laissée ouverte en arrière-plan)
  let tStartSet = false;
  ui.tStart.addEventListener('input', () => { tStartSet = true; });
  el('r-tstart').addEventListener('input', () => { tStartSet = true; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || tStartSet || last) return;
    const n = new Date(); n.setMinutes(0, 0, 0); n.setHours(n.getHours() + 1); ui.tStart.value = localInput(n);
    if (wxOn) wxLoad();
  });

  function say(t, err = false) { ui.msg.textContent = t; ui.msg.classList.toggle('err', err); }

  function clearResult() {
    last = null;
    bestRun++; el('best-out').innerHTML = ''; el('r-gustw').hidden = true; el('r-night').hidden = true;
    panel.classList.remove('has-result');
    if (!wxOn) el('wave-toggle').hidden = true;
    if (handle.getAttribute('aria-expanded') === 'false') el('sheet-label').textContent = '\u25B2 Plus d\u2019options';
    ui.result.hidden = true;
    say('');
    if (boat) { boat.remove(); boat = null; }
    clearCompare();
    ['route', 'nodes', 'isos', ...(wxOn ? [] : ['wind'])].forEach(id => map.getSource(id) && map.getSource(id).setData(EMPTY));
    if (!wxOn) {
    if (map.getLayer('waves')) map.setLayoutProperty('waves', 'visibility', 'none');
    map.getSource('wave-dirs') && map.getSource('wave-dirs').setData(EMPTY);
    map.getSource('cur-dirs') && map.getSource('cur-dirs').setData(EMPTY); el('cur-toggle').hidden = true; el('cur-legend').hidden = true;
    if (map.getLayer('relief-sea')) map.setLayoutProperty('relief-sea', 'visibility', 'visible');
    }
    wavesKey = ''; wavesSea = null;
    planDraw();
  }

  const drawIsos = (...a) => drawIsosMap(...a), drawWind = (...a) => drawWindMap(...a);
  // Calcule une route complète avec un modèle. Remplit les variables globales wind et waves.
  // quiet : pas d'isochrones sur la carte (comparaison), sayFn : où écrire l'avancement.
  async function computeRoute(model, quiet, say) {
      const drawIsos = quiet ? () => {} : drawIsosMap, drawWind = quiet ? () => {} : drawWindMap;
      const tStart = new Date(ui.tStart.value);
      if (Number.isNaN(+tStart)) throw new Error('Heure de départ invalide');
      const P = routePts();
      let d = 0; for (let i = 1; i < P.length; i++) d += distNm(P[i - 1], P[i]);
      const la = P.map(q => q.lat), lo = P.map(q => q.lon);
      const span = Math.max(Math.max(...la) - Math.min(...la), Math.max(...lo) - Math.min(...lo));
      // marge = toute l'ellipse de recherche du routage (limite = 1,8 × distance + 20 M)
      const m = Math.max(1, span * 0.4, (Math.max(...P.slice(1).map((q, i) => distNm(P[i], q))) * 0.9 + 12) / 60);
      const cl = Math.cos(rad((Math.min(...la) + Math.max(...la)) / 2));
      const bb = {
        s: Math.max(-80, Math.min(...la) - m), n: Math.min(80, Math.max(...la) + m),
        w: Math.min(...lo) - m / cl, e: Math.max(...lo) + m / cl,
      };
      say('Côtes…');
      await loadMasks(bb);
      say('Côtes précises…');
      fineOn = true; coastM = OPT.coast; coastNear = P; let coastCut = false, hazCut = false;
      await loadFineKeys([...P.flatMap(q => fineKeysAround(q, 12)), ...P.slice(1).flatMap((q, i) => pinchKeys(bb, P[i], q))]);
      await loadPorts(P);
      const S0 = P.map(q => snapToSea(q));
      if (!S0[0]) throw new Error('Le départ est trop loin dans les terres. Cliquez en mer.');
      if (!S0[P.length - 1]) throw new Error('L\u2019arrivée est trop loin dans les terres. Cliquez en mer.');
      for (let i = 1; i < P.length - 1; i++) if (!S0[i]) throw new Error(`Le point ${i} est trop loin dans les terres. Déplacez-le en mer.`);
      const start = P[0], end = P[P.length - 1], s0 = S0[0];
      const hoursFromToday = (tStart - new Date(new Date().setUTCHours(0, 0, 0, 0))) / 3.6e6;
      const M = MODELS.find(x => x.id === model);
      const mName = M.name;
      // Assez de jours pour un passage lent : au moins 2 nœuds de moyenne, plus une marge.
      const outA = q => q.lat < M.area.s || q.lat > M.area.n || q.lon < M.area.w || q.lon > M.area.e;
      if (M.area && P.some(outA))
        throw new Error(`${M.name} ne couvre que la France et ses abords. Pour ce trajet, prenez ARPEGE ou ECMWF.`);
      const days = Math.min(M.days, Math.max(4, Math.ceil((hoursFromToday + d / 2 + 24) / 24)));
      say(`Vent ${mName}…`);
      omLimited = false;
      wind = await loadWind(bb, days, model, f => say(`Vent ${mName}… ${Math.round(f * 100)} %`));

      say('Vagues…');
      // Vagues du même organisme que le vent (AROME/ARPEGE → MFWAM Météo-France), sinon meilleur modèle
      waves = null; let wName = 'Open-Meteo';
      if (M.wave) { try { waves = await loadWaves(days, M.wave[0]); wName = M.wave[1]; } catch (e) { waves = null; } }
      if (waves && !waves.hs.some(x => !Number.isNaN(x))) waves = null;
      if (!waves && !omLimited) { try { waves = await loadWaves(days); wName = 'Open-Meteo'; } catch (e) { waves = null; } }
      say('Courant…');
      currents = null;
      if (!omLimited) { try { currents = await loadCurrents(days); } catch (e) { currents = null; } }
      const h0 = (tStart - wind.t0) / 3.6e6;
      if (h0 < 0) throw new Error('L\u2019heure de départ est passée pour ce modèle. Choisissez plus tard.');
      if (!windAt(s0.p.lat, s0.p.lon, h0)) throw new Error(`${mName} ne couvre pas cette heure de départ. Choisissez plus tôt ou un autre modèle.`);
      drawWind(h0);

      // Un tronçon : du point A au point B, en partant à l'heure h0
      const leg = async (start, end, s0, e0, h0, deep = 0) => {
      let portKeys0 = null;
      fineOn = true; coastM = OPT.coast;
      say('Calcul de la route…');
      let r = await route(s0.p, e0.p, h0, (f, isos) => { drawIsos(isos); say(`Calcul de la route… ${Math.round(f * 100)} %`); });
      if (r.error === 'stuck' || r.error === 'blocked') {
        say('Côte sur le passage, recherche d\u2019un contournement…');
        r = await route(s0.p, e0.p, h0, (f, isos) => { drawIsos(isos); say(`Contournement de la côte… ${Math.round(f * 100)} %`); }, 'wave');
      }
      // Contrôle avec la côte précise le long de la route trouvée ; si elle touche une digue,
      // une flèche ou un îlot que le masque grossier ignorait, on recalcule (3 fois au plus).
      for (let it = 0; it < 3 && fineOn && !r.error; it++) {
        const added = await loadFineKeys(fineKeysAlong(r.legs)) + (hazOn ? await loadHazKeys(keysAlong(r.legs)) : 0);
        if (!added || routeClear(r.legs)) break;
        say('Côte précise sur le passage, nouveau calcul…');
        r = await route(s0.p, e0.p, h0, (f, isos) => { drawIsos(isos); say(`Contournement de la côte… ${Math.round(f * 100)} %`); });
        if (r.error === 'stuck' || r.error === 'blocked') r = await route(s0.p, e0.p, h0, (f, isos) => { drawIsos(isos); say(`Contournement de la côte… ${Math.round(f * 100)} %`); }, 'wave');
      }
      if (fineOn && coastM > 50 && (r.error === 'stuck' || r.error === 'blocked')) {
        // Passage trop étroit pour la distance à la côte choisie : on retente à 50 m
        coastM = 50; coastCut = true;
        say('Passage étroit : distance à la côte réduite à 50 m…');
        r = await route(s0.p, e0.p, h0, (f, isos) => { drawIsos(isos); say(`Contournement de la côte… ${Math.round(f * 100)} %`); });
        if (r.error === 'stuck' || r.error === 'blocked') r = await route(s0.p, e0.p, h0, (f, isos) => { drawIsos(isos); say(`Contournement de la côte… ${Math.round(f * 100)} %`); }, 'wave');
      }
      if (fineOn && (r.error === 'stuck' || r.error === 'blocked')) {
        // Départ ou arrivée au fond d'une rivière ou d'une ria : on suit le chenal jusqu'à la mer ouverte
        say('Chenal étroit : recherche du passage jusqu\u2019à la mer…');
        portKeys0 = new Set(port.keys());
        await loadPorts([start, end], 4.5);
        const cs = channel(s0.p), ce = channel(e0.p);
        if (cs || ce) {
          const A = cs ? chanLegs(cs, h0) : null;
          const a = cs ? cs[cs.length - 1] : s0.p, b = ce ? ce[ce.length - 1] : e0.p;
          const hA = A ? A.h : h0;
          let r2 = A || !cs ? await route(a, b, hA, (f, isos) => { drawIsos(isos); say(`Calcul de la route… ${Math.round(f * 100)} %`); }) : { error: 'blocked' };
          if (r2.error === 'stuck' || r2.error === 'blocked') r2 = await route(a, b, hA, (f, isos) => { drawIsos(isos); say(`Contournement de la côte… ${Math.round(f * 100)} %`); }, 'wave');
          if (!r2.error) {
            const L2 = r2.legs;
            const B = ce ? chanLegs([...ce].reverse(), L2[L2.length - 1].h) : null;
            if (!ce || B) {
              const legs = [...(A ? A.legs.slice(0, -1) : []), ...(B ? L2.slice(0, -1) : L2), ...(B ? B.legs : [])];
              let dist = 0; for (let i = 1; i < legs.length; i++) dist += distNm(legs[i - 1], legs[i]);
              r = { ...r2, legs, dist, dur: legs[legs.length - 1].h - h0, chan: true };
            }
          }
        }
      }
      if (deep < 2 && fineOn && (r.error === 'stuck' || r.error === 'blocked')) {
        // Plan d'eau relié par un passage étroit (étang de Berre par le canal de Caronte…) :
        // route normale jusqu'à l'entrée du passage, le passage au plus court, puis route normale.
        say('Passage étroit : recherche du canal…');
        if (portKeys0) for (const k of [...port.keys()]) if (!portKeys0.has(k)) port.delete(k); // détail des ports sur 4,5 M : seulement le long du canal
        let np = narrowPass(s0.p, e0.p);
        if (np) { // côte détaillée des ports le long des parties étroites, puis nouvelle recherche
          await loadPorts(np.path.filter((q, i) => !np.open[i] && i % 8 === 0), 0.4);
          np = narrowPass(s0.p, e0.p);
        }
        const len = q => { let d = 0; for (let i = 1; i < q.pts.length; i++) d += distNm(q.pts[i - 1], q.pts[i]); return d; };
        const cn = np ? np.filter(q => !q.open).sort((x, y) => len(y) - len(x))[0] : null;
        if (cn && cn.pts.length > 1) {
          const gA = cn.pts[0], gB = cn.pts[cn.pts.length - 1], keep = coastNear;
          coastNear = [...keep, gA, gB];
          try {
            const rA = distNm(s0.p, gA) < 0.05 ? null : await leg(start, gA, s0, { p: gA }, h0, deep + 1);
            if (!rA || !rA.error) {
              narrowOk = true; const C = chanLegs(cn.pts, rA ? rA.legs[rA.legs.length - 1].h : h0); narrowOk = false;
              if (C) {
                const rB = distNm(gB, e0.p) < 0.05 ? null : await leg(gB, end, { p: gB }, e0, C.h, deep + 1);
                if (!rB || !rB.error) {
                  const legs = [...(rA ? rA.legs.slice(0, -1) : []), ...(rB ? C.legs.slice(0, -1) : C.legs), ...(rB ? rB.legs : [])];
                  let dist = 0; for (let i = 1; i < legs.length; i++) dist += distNm(legs[i - 1], legs[i]);
                  r = { ...(rB || rA || r), error: undefined, legs, dist, dur: legs[legs.length - 1].h - h0, chan: true };
                }
              }
            }
          } finally { coastNear = keep; fineOn = true; }
        }
      }
      if (fineOn && hazOn && (r.error === 'stuck' || r.error === 'blocked')) {
        // Petits fonds ou dangers ferment le passage : même calcul sans eux, avec un avertissement
        say('Petits fonds sur le passage, nouveau calcul sans eux…');
        hazOn = false;
        try { const r3 = await leg(start, end, s0, e0, h0, deep); if (!r3.error) { r = r3; if (fineOn) hazCut = true; } } finally { hazOn = true; }
        return r;
      }
      if (fineOn && (r.error === 'stuck' || r.error === 'blocked')) {
        // La côte précise ferme le passage (point dans un bassin, chenal étroit) : calcul avec le masque d'origine
        fineOn = false;
        s0 = snapToSea(start) || s0; e0 = snapToSea(end) || e0;
        r = await route(s0.p, e0.p, h0, (f, isos) => { drawIsos(isos); say(`Contournement de la côte… ${Math.round(f * 100)} %`); });
        if (r.error === 'stuck' || r.error === 'blocked') r = await route(s0.p, e0.p, h0, (f, isos) => { drawIsos(isos); say(`Contournement de la côte… ${Math.round(f * 100)} %`); }, 'wave');
      }
      return r;
      };
      let r = null, hh = h0; const allLegs = [];
      for (let k = 0; k < P.length - 1; k++) {
        if (P.length > 2) say(`Tronçon ${k + 1} sur ${P.length - 1}…`);
        const rk = await leg(P[k], P[k + 1], S0[k], S0[k + 1], hh);
        if (!fineOn) coastCut = true;
        if (rk.error) { r = rk; r.seg = k; break; }
        const L = rk.legs;
        if (allLegs.length) { allLegs.pop(); L[0] = { ...L[0], via: true }; }
        allLegs.push(...L);
        hh = L[L.length - 1].h;
        r = k === 0 ? rk : { ...rk, alt: null };
      }
      if (!r.error && P.length > 2) {
        let dist = 0; for (let i = 1; i < allLegs.length; i++) dist += distNm(allLegs[i - 1], allLegs[i]);
        r = { ...r, legs: allLegs, dist, dur: hh - h0, alt: null, vias: P.length - 2 };
      }
      const segTxt = r.error && P.length > 2 ? `Tronçon ${r.seg + 1} (${r.seg === 0 ? 'départ' : 'point ' + r.seg} \u2192 ${r.seg === P.length - 2 ? 'arrivée' : 'point ' + (r.seg + 1)}) : ` : '';
      drawIsos(r.error ? r.isos : []);
      if (r.error === 'horizon' && r.rej && r.rej.calm > 6) throw new Error(segTxt + 'Pas de route : pas assez de vent sur le trajet (calme). Autorisez le moteur (Réglages bateau) ou changez l\u2019heure de départ.');
      if (r.error === 'horizon') {
        const end = dfmt.format(new Date(wind.t0 + (wind.nt - 1) * 3.6e6));
        throw new Error(segTxt + (M.fine
          ? `La prévision ${mName} s\u2019arrête le ${end} (2 jours seulement), avant l\u2019arrivée. Prenez ARPEGE ou ECMWF.`
          : M.days < 15
          ? `La prévision ${mName} s\u2019arrête le ${end}, avant l\u2019arrivée. Prenez ECMWF ou GFS, qui vont plus loin.`
          : `La prévision ${mName} s\u2019arrête le ${end}, avant l\u2019arrivée : trop peu de vent sur ce trajet. Rapprochez l\u2019arrivée.`));
      }
      if (r.error && r.rej) {
        // Message précis : quelle limite bloque, et quelle valeur essayer
        const R = r.rej, w0 = windAt(S0[r.seg || 0].p.lat, S0[r.seg || 0].p.lon, hh), v0 = waveAt(S0[r.seg || 0].p.lat, S0[r.seg || 0].p.lon, hh);
        const here = `Au départ : vent ${w0 ? nf0.format(w0.tws) + ' nds' : 'n. d.'}${v0 ? `, vagues ${nf1.format(v0.hs)} m` : ''}.`;
        if (R.wave > 0 && R.wave >= R.wind) {
          const need = Math.ceil(Math.max(R.waveMin, v0 ? v0.hs : 0) * 2) / 2 + 0.5;
          throw new Error(segTxt + `Bloqué par les vagues : elles dépassent votre maximum de ${nf1.format(OPT.hmax)} m. ${here} Montez « Vagues max » à ${nf1.format(need)} m environ (Réglages bateau), ou partez plus tard.`);
        }
        if (R.wind > 0) {
          const need = Math.ceil(Math.max(R.windMin, w0 ? w0.tws : 0)) + 2;
          throw new Error(segTxt + `Bloqué par le vent : il dépasse votre maximum de ${nf0.format(OPT.wmax)} nds. ${here} Montez « Vent max » à ${nf0.format(need)} nds environ (Réglages bateau), ou partez plus tard.`);
        }
      }
      if (r.error === 'stuck') throw new Error(segTxt + 'La route ne progresse plus : côte, pas assez de vent, ou vent ou vagues au-dessus de vos maximums. Déplacez un point plus au large, montez le vent max ou les vagues max, ou autorisez le moteur.');
      if (r.error && r.rej && r.rej.land > 0) throw new Error(segTxt + 'Pas de route trouvée : la terre bloque le passage. Placez le départ et l\u2019arrivée bien en mer, ou ajoutez un point de passage.');
      if (r.error) throw new Error(segTxt + 'Pas de route trouvée : pas assez de vent sur le trajet. Autorisez le moteur (Réglages bateau) ou changez l\u2019heure de départ.');

      return { ...r, t0: wind.t0, h0, tStart, model: mName, modelId: model, wName, snapped: S0.some(x => x.moved > 0.05), coastCut: coastCut || !fineOn, hazCut, dmin: OPT.dmin, coastM: OPT.coast, noWaves: !waves, wind, waves, currents, useCur: !!(OPT.cur && currents) };
  }

  ui.go.addEventListener('click', () => { if (wxOn) wxClose(true); if (start && !end) closeRoute(); runMain(); });
  // Relancer depuis le résumé : même départ, même arrivée, nouvelle heure
  el('r-tstart').addEventListener('input', () => { if (el('r-tstart').value) ui.tStart.value = el('r-tstart').value; });
  el('r-go').addEventListener('click', () => { if (el('r-tstart').value) ui.tStart.value = el('r-tstart').value; if (wxOn) wxClose(true); runMain(); });
  async function runMain() {
    readOpt(); clearTraceLine();
    if (!start || !end) return;
    ui.go.disabled = true; ui.go.setAttribute('aria-busy', 'true');
    clearResult();
    try {
      last = await computeRoute(model, false, say);
      showResult();
    } catch (err) {
      say(err.message || String(err), true);
    } finally {
      ui.go.disabled = !(start && (end || vias.length)); ui.go.removeAttribute('aria-busy');
    }
  }
  // « Prendre cette route » : le modèle comparé devient la route principale (feuille de route, voilure, GPX).
  // L'ancienne route reste tracée en violet pour comparaison.
  let cmpId = null;
  async function useCompare() {
    const oldId = model, newId = cmpId;
    if (!newId || !last) return;
    ui.models.value = newId; model = newId;
    el('cmp-out').innerHTML = '<p class="an-note">Calcul de la route choisie…</p>';
    await runMain();
    if (!last) return;
    const sel = el('cmp-model');
    if (sel && [...sel.options].some(o => o.value === oldId)) { sel.value = oldId; await runCompare(); }
    say(`Route ${last.model} retenue : feuille de route, voilure et GPX la suivent maintenant.`);
  }

  el('cmp-go').addEventListener('click', runCompare);

  // ---------- Meilleure heure de départ : on recalcule la route toutes les 3 h sur 2 jours ----------
  let bestRun = 0;
  async function runBest() {
    if (!last) return;
    const btn = el('best-go'), out = el('best-out'), keep = { wind, waves, currents }, t0v = ui.tStart.value, run = ++bestRun;
    const n0 = new Date(); n0.setMinutes(0, 0, 0); n0.setHours(n0.getHours() + 1);
    const deps = []; for (let k = 0; k <= 16; k++) deps.push(new Date(+n0 + k * 3 * 3.6e6));
    btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    const rows = [];
    try {
      for (let k = 0; k < deps.length; k++) {
        if (run !== bestRun) return;
        out.innerHTML = `<p class="an-note">Calcul des départs\u2026 ${k + 1} / ${deps.length}</p>`;
        ui.tStart.value = localInput(deps[k]);
        try { const r = await computeRoute(model, true, () => {}); rows.push({ d: deps[k], st: routeStats(r) }); } catch (e) { rows.push({ d: deps[k], err: true }); }
      }
    } finally {
      ui.tStart.value = t0v; wind = keep.wind; waves = keep.waves; currents = keep.currents;
      btn.disabled = false; btn.removeAttribute('aria-busy');
    }
    const ok = rows.filter(q => !q.err);
    if (!ok.length) { out.innerHTML = '<p class="cmp-err">Pas de route possible sur ces 2 jours avec ce modèle.</p>'; return; }
    const tooMuch = q => q.st.twsMax > OPT.wmax || (q.st.guMax || 0) > OPT.wmax;
    const pool = ok.filter(q => !tooMuch(q)).length ? ok.filter(q => !tooMuch(q)) : ok;
    const best = pool.reduce((a, b) => (b.st.dur < a.st.dur - 1e-6 ? b : a));
    const dayPool = pool.filter(q => !q.st.nightArr), dayBest = dayPool.length ? dayPool.reduce((a, b) => (b.st.dur < a.st.dur - 1e-6 ? b : a)) : null;
    out.innerHTML = `<p class="best-head">Le plus rapide : <b>départ ${dfmt.format(best.d)}</b>, ${fmtDur(best.st.dur)}${best.st.mot > 0.05 ? `, dont ${fmtDur(best.st.mot)} de moteur` : ''}. ${best.st.nightArr && dayBest ? `Arrivée de jour : <b>départ ${dfmt.format(dayBest.d)}</b>, ${fmtDur(dayBest.st.dur)}.` : ''} Touchez un départ pour le calculer.</p>`
      + '<div class="best-list">' + rows.map((q, i) => q.err
        ? `<div class="best-row off"><b>${dfmt.format(q.d)}</b><span>pas de route</span></div>`
        : `<button type="button" class="best-row${q === best ? ' win' : ''}${q === dayBest && q !== best ? ' day' : ''}${tooMuch(q) ? ' bad' : ''}" data-i="${i}"><b>${dfmt.format(q.d)}</b><span>${fmtDur(q.st.dur)}${q.st.mot > 0.05 ? ` · moteur ${fmtDur(q.st.mot)}` : ''}</span><span>vent ${nf0.format(q.st.twsMax)}${q.st.guMax ? ` · rafales ${nf0.format(q.st.guMax)}` : ''} nds${tooMuch(q) ? ' · trop de vent' : ''}${q.st.nightArr ? ' · arrivée de nuit' : ''}</span></button>`).join('') + '</div>';
    out.querySelectorAll('.best-row[data-i]').forEach(b => b.addEventListener('click', () => {
      ui.tStart.value = localInput(rows[+b.dataset.i].d); tStartSet = true; if (wxOn) wxClose(true); runMain();
    }));
  }
  el('best-go').addEventListener('click', runBest);

  // ---------- Arrivée de nuit : on le dit et on propose un départ pour arriver de jour ----------
  function nightNote(r) {
    const box = el('r-night'), E = r.legs[r.legs.length - 1], arr = +timeAt(r.h0 + r.dur), dep = +timeAt(r.h0);
    if (sunUp(E.lat, E.lon, new Date(arr))) { box.hidden = true; return; }
    const st = 10 * 60e3; let tSet = arr, tRise = arr;
    for (let k = 0; k < 120 && !sunUp(E.lat, E.lon, new Date(tSet - st)); k++) tSet -= st;
    for (let k = 0; k < 120 && !sunUp(E.lat, E.lon, new Date(tRise)); k++) tRise += st;
    const n0 = new Date(); n0.setMinutes(0, 0, 0); n0.setHours(n0.getHours() + 1);
    const hr = t => { const d = new Date(t); d.setMinutes(0, 0, 0); return d; };
    const early = hr(dep - (arr - tSet) - 60 * 60e3), late = hr(dep + (tRise - arr) + 90 * 60e3);
    const bt = [];
    if (+early >= +n0) bt.push(`<button type="button" class="night-btn" data-t="${+early}">Partir plus tôt : ${dfmt.format(early)}</button>`);
    bt.push(`<button type="button" class="night-btn" data-t="${+late}">Partir plus tard : ${dfmt.format(late)}</button>`);
    box.innerHTML = `<b>Arrivée de nuit</b> (${hfmt.format(new Date(arr))}, coucher du soleil ${hfmt.format(new Date(tSet))}, lever ${hfmt.format(new Date(tRise))}). Pour arriver de jour :<span class="night-bts">${bt.join('')}</span>`;
    box.hidden = false;
    box.querySelectorAll('.night-btn').forEach(b => b.addEventListener('click', () => {
      ui.tStart.value = localInput(new Date(+b.dataset.t)); tStartSet = true; runMain();
    }));
  }

  // ---------- Ma position (GPS du téléphone) : point bleu, départ, écart à la route ----------
  let gpsId = null, gpsMk = null, gpsFirst = false, gpsPos = null;
  function gpsEl() { const d = document.createElement('div'); d.className = 'gps-dot'; return d; }
  function gpsChip(t, err) { const c = el('gps-chip'); c.hidden = !t; c.innerHTML = t || ''; c.classList.toggle('err', !!err); }
  function gpsTrack() {
    if (!gpsPos) return;
    const p = gpsPos, kn = p.spd != null ? ` · ${nf1.format(p.spd)} nds` : '';
    if (!last || !last.legs || last.legs.length < 2) { gpsChip(`<b>Vous êtes ici</b>${kn}${p.acc > 100 ? ` · précision ${Math.round(p.acc)} m` : ''}`); return; }
    // point le plus proche sur la route (projection locale)
    const L = last.legs, cl = Math.cos(rad(p.lat));
    let best = { d: 1e9, i: 0, t: 0 };
    for (let i = 0; i < L.length - 1; i++) {
      const ax = (L[i].lon - p.lon) * cl, ay = L[i].lat - p.lat, bx = (L[i + 1].lon - p.lon) * cl, by = L[i + 1].lat - p.lat;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < best.d) best = { d, i, t };
    }
    const A = L[best.i], B = L[best.i + 1], q = { lat: A.lat + (B.lat - A.lat) * best.t, lon: A.lon + (B.lon - A.lon) * best.t };
    const off = distNm(p, q), brg = bearing(A, B);
    // cap conseillé : vers un point de la route 1 M plus loin
    let rest = 1, cur = q, j = best.i + 1, aim = L[L.length - 1];
    while (j < L.length) { const dd = distNm(cur, L[j]); if (dd >= rest) { const f = rest / dd; aim = { lat: cur.lat + (L[j].lat - cur.lat) * f, lon: cur.lon + (L[j].lon - cur.lon) * f }; break; } rest -= dd; cur = L[j]; j++; }
    const side = norm180(bearing(q, p) - brg) > 0 ? 'tribord' : 'bâbord';
    const toEnd = distNm(p, L[L.length - 1]);
    gpsChip(`<b>Écart ${off < 0.05 ? 'nul' : `${distTxt(off)} à ${side}`}</b> de la route · cap ${nf0.format(bearing(p, aim))}°${kn}<br><small>Arrivée à ${distTxt(toEnd)}</small>`);
  }
  function gpsStop() {
    if (gpsId != null) navigator.geolocation.clearWatch(gpsId);
    gpsId = null; gpsPos = null; if (gpsMk) { gpsMk.remove(); gpsMk = null; }
    gpsChip(''); el('gps-btn').setAttribute('aria-pressed', 'false');
  }
  el('gps-btn').addEventListener('click', () => {
    if (gpsId != null) { gpsStop(); return; }
    if (!navigator.geolocation) { gpsChip('Pas de GPS sur cet appareil.', true); return; }
    el('gps-btn').setAttribute('aria-pressed', 'true'); gpsFirst = true; gpsChip('Recherche de votre position\u2026');
    gpsId = navigator.geolocation.watchPosition(g => {
      const c = g.coords;
      gpsPos = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, spd: c.speed != null && c.speed >= 0 ? c.speed * 1.94384 : null };
      const ll = [gpsPos.lon, gpsPos.lat];
      if (!gpsMk) gpsMk = new maplibregl.Marker({ element: gpsEl() }).setLngLat(ll).addTo(map); else gpsMk.setLngLat(ll);
      if (gpsFirst) {
        gpsFirst = false;
        map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 11), duration: 800 });
        if (!start && !last && !wxOn && !tideOn) { setPoint('start', { lat: gpsPos.lat, lng: gpsPos.lon }); say('Départ placé sur votre position. Touchez la carte pour l\u2019arrivée.'); }
      }
      gpsTrack();
    }, e => {
      gpsStop();
      gpsChip(e.code === 1 ? 'Position refusée : autorisez la localisation pour Routage dans le téléphone.' : 'Position introuvable. Réessayez à l\u2019extérieur.', true);
      setTimeout(() => { if (gpsId == null) gpsChip(''); }, 6000);
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  });

  function timeAt(h) { return new Date((last && last.t0 != null ? last.t0 : wind.t0) + h * 3.6e6); }

  // ---------- Simplification des points (Douglas-Peucker, sans couper la terre) ----------
  // Niveaux du plus détaillé au plus simple : écart toléré (milles) et découpage des longs bords (heures)
  const LEVELS = [
    { tol: 0, split: 1 }, { tol: 0.5, split: 1 }, { tol: 2, split: 1 }, { tol: 2, split: 3 }, { tol: 3, split: 0 },
    { tol: 5, split: 0 }, { tol: 8, split: 0 }, { tol: 12, split: 0 }, { tol: 20, split: 0 }, { tol: 35, split: 0 },
    { tol: 60, split: 0 }, { tol: 100, split: 0 }, { tol: 1e9, split: 0 },
  ];
  const LEVEL0 = 2;
  let simplLevel = LEVEL0;
  function xtrackNm(p, a, b) {
    const k = Math.cos(rad((a.lat + b.lat) / 2));
    const ax = a.lon * 60 * k, ay = a.lat * 60, bx = b.lon * 60 * k - ax, by = b.lat * 60 - ay;
    const px = p.lon * 60 * k - ax, py = p.lat * 60 - ay;
    const L2 = bx * bx + by * by;
    const t = L2 ? Math.max(0, Math.min(1, (px * bx + py * by) / L2)) : 0;
    return Math.hypot(px - t * bx, py - t * by);
  }
  function simplify(legs, tol) {
    if (!tol || legs.length < 3) return legs.map((_, i) => i);
    const keep = new Set([0, legs.length - 1]);
    legs.forEach((l, i) => { if (l.wait) { keep.add(i); keep.add(i + 1); } if (l.via) keep.add(i); });
    const forced = [...keep].sort((a, b) => a - b);
    if (forced.length > 2) {
      // Simplifier chaque morceau entre deux attentes
      const all = new Set(forced);
      for (let n = 0; n < forced.length - 1; n++) {
        const i0 = forced[n], i1 = forced[n + 1];
        if (legs[i0].wait) continue;
        simplify(legs.slice(i0, i1 + 1).map(l => (l.wait ? { ...l, wait: false } : l)), tol).forEach(k => all.add(i0 + k));
      }
      return [...all].filter(k => k < legs.length).sort((a, b) => a - b);
    }
    const stack = [[0, legs.length - 1]];
    while (stack.length) {
      const [i, j] = stack.pop();
      if (j - i < 2) continue;
      let dmax = -1, k = i + 1;
      for (let m = i + 1; m < j; m++) { const d = xtrackNm(legs[m], legs[i], legs[j]); if (d > dmax) { dmax = d; k = m; } }
      if (dmax <= tol && segmentClear(legs[i], legs[j])) continue;
      if (dmax <= tol) k = (i + j) >> 1; // la terre coupe : on garde un point au milieu
      keep.add(k); stack.push([i, k], [k, j]);
    }
    return [...keep].sort((a, b) => a - b);
  }
  function waypoints(r) {
    const L = LEVELS[simplLevel];
    const idx0 = r.simp && r.simp[simplLevel] ? r.simp[simplLevel] : simplify(r.legs, L.tol), idx = [];
    // Un long bord droit est découpé en étapes d'environ 1 h : même cap, mais vent et vagues mis à jour.
    idx0.forEach((i, n) => {
      idx.push(i);
      const j = idx0[n + 1];
      if (j == null || r.legs[i].wait || !L.split) return;
      let tNext = r.legs[i].h + L.split;
      for (let m = i + 1; m < j; m++) {
        if (r.legs[m].h >= tNext && r.legs[j].h - r.legs[m].h > 0.4 * L.split) { idx.push(m); tNext = r.legs[m].h + L.split; }
      }
    });
    return idx.map((i, n) => {
      const a = r.legs[i], j = idx[n + 1];
      if (j == null) return { lat: a.lat, lon: a.lon, h: a.h, last: true };
      const b = r.legs[j];
      let d = 0, mot = 0, hsMax = null, cu = 0, cv = 0, cn = 0, hx = 0, hy = 0, tk = 0, tkH = null;
      for (let m = i; m < j; m++) {
        const dtm = r.legs[m + 1].h - r.legs[m].h;
        d += distNm(r.legs[m], r.legs[m + 1]); if (r.legs[m].mot) mot += dtm;
        if (r.legs[m].tack) { tk += dtm; if (tkH == null) tkH = r.legs[m].hdg; }
        const v = r.legs[m].wv; if (v && (hsMax == null || v.hs > hsMax)) hsMax = v.hs;
        const c = r.legs[m].cu; if (c) { cu += c.u * dtm; cv += c.v * dtm; cn += dtm; }
        if (r.legs[m].hdg != null && !r.legs[m].tack) { hx += Math.sin(rad(r.legs[m].hdg)) * dtm; hy += Math.cos(rad(r.legs[m].hdg)) * dtm; }
      }
      // Courant moyen sur l'étape et cap à tenir (différent de la route fond quand il y a du courant)
      const cur = r.useCur && cn > 0 ? { sp: Math.hypot(cu, cv) / cn, dir: norm360(deg(Math.atan2(cu, cv))) } : null;
      const cog = bearing(a, b), hdgW = r.useCur && (hx || hy) ? norm360(deg(Math.atan2(hx, hy))) : cog;
      const coast = r.useCur ? nearCoast(a.lat, a.lon) || nearCoast((a.lat + b.lat) / 2, (a.lon + b.lon) / 2) : false;
      if (a.wait) return { lat: a.lat, lon: a.lon, h: a.h, wait: true, waitH: b.h - a.h, hdg: a.hdg, dist: 0, sog: 0, tws: a.tws, twd: a.twd, mot: false, hs: a.wv ? a.wv.hs : null };
      const tack = tk > (b.h - a.h) / 2;
      return { lat: a.lat, lon: a.lon, h: a.h, hdg: tack ? tkH : hdgW, tack, cog, dist: d, sog: d / Math.max(1e-6, b.h - a.h), tws: a.tws, twd: a.twd, mot: mot > (b.h - a.h) / 2, hs: hsMax, cur, coast };
    });
  }
  function drawWaypoints() {
    const r = last; if (!r) return;
    r.wp = waypoints(r);
    map.getSource('nodes').setData({ type: 'FeatureCollection', features: r.wp.slice(1, -1).map(w => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [w.lon, w.lat] }, properties: {} })) });
    ui.book.innerHTML = '';
    let lastDay = null, prevS = null;
    r.wp.forEach((w, n) => {
      if (w.last) return;
      const twa = Math.abs(norm180(w.twd - w.hdg));
      // Manœuvre quand on change d'amures entre deux lignes à la voile
      if (!w.wait && !w.mot && !w.tack) {
        const sd = side(w.hdg, w.twd);
        if (prevS && prevS.sd !== sd) {
          const gybe = prevS.twa + twa > 180, mv = document.createElement('tr'); mv.className = 'manv';
          mv.innerHTML = `<td></td><td colspan="${r.useCur ? 8 : 7}"><b>${gybe ? 'Empannage' : 'Virement de bord'}</b> à ${tfmt.format(timeAt(w.h))} · passer ${sd} amures</td>`;
          ui.book.appendChild(mv);
        }
        prevS = { sd, twa };
      } else if (w.mot) prevS = null;
      const tr = document.createElement('tr');
      const tm = timeAt(w.h), dayK = tm.toDateString();
      const hh = dayK !== lastDay ? hfmt.format(tm) : tfmt.format(tm); lastDay = dayK;
      if (w.wait) tr.innerHTML = `<td>${n + 1}</td><td>${hh}</td><td>–</td><td>0</td><td>${nf0.format(w.tws)} / ${nf0.format(w.twd)}°</td><td>${w.hs == null ? '–' : nf1.format(w.hs)}</td><td colspan="2"><b class="wait">Attente ${fmtDur(w.waitH)}</b></td>${r.useCur ? '<td>–</td>' : ''}`;
      else tr.innerHTML = `<td>${n + 1}</td><td>${hh}</td><td>${nf0.format(w.hdg)}°</td><td>${nf1.format(w.dist)}</td><td>${nf0.format(w.tws)} / ${nf0.format(w.twd)}°</td><td>${w.hs == null ? '–' : `<span class="${w.hs > OPT.hmax + 0.05 ? 'hi' : ''}">${nf1.format(w.hs)}</span>`}</td><td>${w.mot ? '<span class="mot">Moteur</span>' : w.tack ? '<span class="mot">Louvoyage</span>' : `${nf0.format(twa)}° ${side(w.hdg, w.twd) === 'tribord' ? 'Td' : 'Bd'}`}</td><td>${nf1.format(w.sog)}</td>${r.useCur ? `<td class="${w.coast ? 'coast' : ''}">${w.cur ? `${nf1.format(w.cur.sp)}<br><small>${nf0.format(w.cur.dir)}°</small>` : '–'}</td>` : ''}`;
      tr.addEventListener('click', () => { ui.scrub.value = String(Math.round(((w.h - r.h0) / r.dur) * 1000)); scrub(); });
      ui.book.appendChild(tr);
    });
    el('wp-count').textContent = `${r.wp.length} points`;
    el('wp-less-t').textContent = nextLevel(r, +1) == null ? 'Nettoyée' : 'Nettoyer';
    el('th-cur').hidden = !r.useCur;
    el('th-cap').innerHTML = r.useCur ? 'Cap<br>à tenir' : 'Cap';
    const cn = el('book-cur'), anyCoast = r.useCur && r.wp.some(w => w.coast);
    cn.hidden = !r.useCur;
    if (r.useCur) cn.innerHTML = `Cour. : courant en nœuds et direction où il va (marée comprise). Cap à tenir : déjà corrigé du courant. Vit. : vitesse sur le fond.${anyCoast ? ' <b class="coast">En orange : près des côtes, courant peu fiable, vérifiez avec l\u2019annuaire des marées.</b>' : ''}`;
    const bn = el('book-note'), hasWait = r.wp.some(w => w.wait);
    bn.hidden = !hasWait;
    if (hasWait) bn.textContent = `Attente : devant, les vagues dépassent votre maximum de ${nf1.format(OPT.hmax)} m. Le bateau reste sur place (à la cape) jusqu'à ce que la mer baisse.${r.alt ? ` Sans attente : arrivée ${hfmt.format(timeAt(r.alt.h))}, vagues jusqu'à ${nf1.format(r.alt.hs)} m.` : ''}`;
    // Boutons actifs seulement s'ils changent vraiment le nombre de points
    el('wp-less').disabled = nextLevel(r, +1) == null;
    el('wp-more').disabled = nextLevel(r, -1) == null;
  }
  function nextLevel(r, dir) {
    const n0 = r.wp.length, keepL = simplLevel;
    let found = null;
    for (let l = simplLevel + dir; l >= 0 && l < LEVELS.length; l += dir) {
      simplLevel = l; const n = waypoints(r).length;
      if (dir > 0 ? n < n0 : n > n0) { found = l; break; }
    }
    simplLevel = keepL;
    return found;
  }
  function stepLevel(dir) {
    const r = last; if (!r || !r.wp) return;
    const l = nextLevel(r, dir); if (l == null) return;
    simplLevel = l; drawWaypoints();
  }
  // Onglets Résumé / Feuille de route / Voilure / Analyse
  function setTab(t) {
    el('result').dataset.tab = t;
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === t)));
  }
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => {
    setTab(b.dataset.t);
    const tabs = el('tabs');
    if (tabs.getBoundingClientRect().top < 0 || isMobile()) panel.scrollTo({ top: Math.max(0, tabs.offsetTop - el('quick').offsetHeight - (isMobile() ? 64 : 8)), behavior: 'smooth' });
  }));
  window.__setTab = setTab;
  el('wp-less').addEventListener('click', () => stepLevel(+1));
  el('wp-more').addEventListener('click', () => stepLevel(-1));

  function showResult() {
    planDraw();
    el('r-tstart').value = ui.tStart.value;
    const r = last;
    setTab('resume');
    const coords = r.legs.map(n => [n.lon, n.lat]);
    // Route découpée en tronçons voile / moteur
    const runs = [];
    for (let i = 0; i < r.legs.length - 1; i++) {
      const m = !!r.legs[i].mot, a = [r.legs[i].lon, r.legs[i].lat], b = [r.legs[i + 1].lon, r.legs[i + 1].lat];
      const cur = runs[runs.length - 1];
      if (cur && cur.properties.mot === m) cur.geometry.coordinates.push(b);
      else runs.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [a, b] }, properties: { mot: m } });
    }
    map.getSource('route').setData({ type: 'FeatureCollection', features: runs });
    const wmax = Math.max(...r.legs.filter(n => n.tws != null).map(n => n.tws));
    ui.dur.textContent = fmtDur(r.dur);
    ui.eta.textContent = hfmt.format(timeAt(r.h0 + r.dur));
    el('r-dep').textContent = hfmt.format(timeAt(r.h0));
    ui.dist.textContent = distTxt(r.dist);
    ui.wmax.textContent = `${nf0.format(wmax)} nds`;
    // Rafales le long de la route (données du modèle météo)
    let guMax = 0, guH = null;
    r.legs.forEach(n => { if (n.wait) return; const w = windAt(n.lat, n.lon, n.h); n.gu = w && w.gu != null ? w.gu : -1; if (n.gu > guMax) { guMax = n.gu; guH = n.h; } });
    el('r-gust').textContent = guMax > 0 ? `rafales ${nf0.format(guMax)}` : '';
    const rg = el('r-gustw');
    rg.hidden = !(guMax > OPT.wmax);
    if (guMax > OPT.wmax) rg.innerHTML = `<b>Rafales jusqu'à ${nf0.format(guMax)} nds</b> ${dfmt.format(timeAt(guH))}, au-dessus de votre vent max (${nf0.format(OPT.wmax)} nds).`;
    const hsArr = r.legs.filter(n => n.wv).map(n => n.wv.hs);
    el('r-wave').textContent = hsArr.length ? `${nf1.format(Math.max(...hsArr))} m` : 'n. d.';
    let motH = 0, waitH = 0;
    for (let i = 0; i < r.legs.length - 1; i++) if (r.legs[i].wait) waitH += r.legs[i + 1].h - r.legs[i].h;
    for (let i = 0; i < r.legs.length - 1; i++) if (r.legs[i].mot) motH += r.legs[i + 1].h - r.legs[i].h;
    const rm = el('r-motor');
    rm.hidden = !(motH > 0);
    rm.innerHTML = motH > 0 ? `${r.dur - motH > 1 / 60 ? `<span class="lg-item"><span class="lg lg-sail"></span>Voile ${fmtDur(Math.max(0, r.dur - motH))}</span>` : ''}<span class="lg-item"><span class="lg lg-mot"></span>Moteur ${fmtDur(motH)}</span>` : '';

    const rc = el('r-cur');
    if (r.useCur) {
      const near = r.legs.some((l, i) => i % 3 === 0 && nearCoast(l.lat, l.lon));
      const cmax = Math.max(0, ...r.legs.map(l => (l.cu ? l.cu.sp : 0)));
      rc.className = `cur-note${near ? ' warn' : ''}`;
      rc.innerHTML = `<b>Courant pris en compte</b> (marée comprise), jusqu'à ${nf1.format(cmax)} nds sur la route. Modèle Météo-France à 8 km, prévu sur 10 jours.${near ? '<br><b>Attention : la route passe près des côtes.</b> Là, le courant de marée du modèle est peu fiable : vérifiez avec l\u2019annuaire des marées et les cartes de courants.' : ' Peu fiable près des côtes : ne remplace pas l\u2019annuaire des marées.'}`;
      rc.hidden = false;
    } else if (OPT.cur) {
      rc.className = 'cur-note'; rc.textContent = 'Courant : pas de donnée pour ce trajet ou cette date (prévision sur 10 jours). Route calculée sans courant.'; rc.hidden = false;
    } else rc.hidden = true;
    drawWaypoints();
    try { analyse(r); } catch (e) { el('analyse').textContent = ''; }
    try { r.sails = showSailPlan(r); } catch (e) { console.error(e); }
    r.statsA = routeStats(r);
    clearCompare(); fillCompareSelect();
    nightNote(r);
    if (typeof gpsTrack === 'function') gpsTrack();

    ui.scrub.min = '0'; ui.scrub.max = '1000'; ui.scrub.value = '0';
    if (!boat) boat = new maplibregl.Marker({ element: boatEl(), rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(coords[0]).addTo(map);
    sizeBoat();
    scrub();
    ui.result.hidden = false;
    panel.classList.add('has-result');
    el('wave-toggle').hidden = !!r.noWaves;
    el('peek').innerHTML = `${fmtDur(r.dur)} · arrivée ${hfmt.format(timeAt(r.h0 + r.dur))} · ${distTxt(r.dist)}<small>${r.model}${r.noWaves ? '' : ` · vagues max ${el('r-wave').textContent}`}${r.vias ? ` · ${r.vias} point${r.vias > 1 ? 's' : ''} de passage` : ''}${motH > 0 ? ` · moteur ${fmtDur(motH)}` : ''}${waitH > 0 ? ` · attente ${fmtDur(waitH)}` : ''}${r.alt ? `<br>Sans attente : arrivée ${hfmt.format(timeAt(r.alt.h))}, vagues jusqu'à ${nf1.format(r.alt.hs)} m` : ''}</small>`;
    setSheet(false);
    say(`Route ${r.model}${r.noWaves ? '' : `, vagues ${r.wName}`}, pas de ${String(r.dt).replace('.', ',')} h.${r.snapped ? ' Départ ou arrivée déplacé en mer.' : ''}${r.coastCut ? ` Passage trop étroit pour ${r.coastM} m : la route passe plus près de la côte, vérifiez sur la carte.` : ` À ${r.coastM} m des côtes au moins.`}${r.legs.some(x => x.tack) ? ' Passage étroit face au vent : il faut tirer des bords serrés, moteur conseillé.' : ''}${r.hazCut ? ' Attention : la route passe sur un petit fond ou près d\u2019un danger balisé, vérifiez sur la carte.' : r.dmin > 0 ? ` Fonds de moins de ${nf1.format(r.dmin)} m et dangers balisés évités (données approximatives).` : ' Dangers balisés évités.'}`);
    const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
    coords.forEach(c => b.extend(c));
    const wide = window.innerWidth > 720;
    map.fitBounds(b, { padding: wide ? { top: 60, bottom: 60, left: 400, right: 60 } : { top: 130, bottom: Math.min(window.innerHeight * 0.6, panel.offsetHeight + 40), left: 60, right: 60 }, maxZoom: 10, duration: 600 });
  }


  // ---------- Analyse de la traversée (calculée sur les données de la route, sans invention) ----------
  function sunUp(lat, lon, d) {
    const doy = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
    const g = 2 * Math.PI / 365 * (doy - 1 + (d.getUTCHours() - 12) / 24);
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const tst = d.getUTCHours() * 60 + d.getUTCMinutes() + eqt + 4 * lon;
    const ha = (tst / 4 - 180) * Math.PI / 180, la = lat * Math.PI / 180;
    const el = Math.asin(Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha));
    return el > -0.0145; // soleil au-dessus de -0,83°
  }
  function analyse(r) {
    const L = r.legs, plus = [], moins = [];
    let sail = 0, mot = 0, wait = 0, night = 0, light = 0, strong = 0;
    const allure = { pres: 0, travers: 0, largue: 0, arriere: 0 }, mer = { face: 0, travers: 0, arriere: 0 };
    let twsMin = Infinity, twsMax = 0, hsMax = 0, hsMaxT = null, sides = 0, lastSide = null;
    for (let i = 0; i < L.length - 1; i++) {
      const a = L[i], dt = L[i + 1].h - a.h;
      if (dt <= 0) continue;
      if (!sunUp(a.lat, a.lon, timeAt(a.h + dt / 2))) night += dt;
      if (a.wait) { wait += dt; continue; }
      if (a.tws != null) { twsMin = Math.min(twsMin, a.tws); twsMax = Math.max(twsMax, a.tws); if (a.tws >= OPT.wmax * 0.85) strong += dt; }
      if (a.wv && a.wv.hs > hsMax) { hsMax = a.wv.hs; hsMaxT = a.h; }
      if (a.mot) { mot += dt; continue; }
      sail += dt;
      if (a.tws != null && a.tws < 8) light += dt;
      const twa = Math.abs(norm180(a.twd - a.hdg));
      allure[twa < 60 ? 'pres' : twa < 110 ? 'travers' : twa < 150 ? 'largue' : 'arriere'] += dt;
      if (a.wv) { const rel = Math.abs(norm180(a.wv.dir - a.hdg)); mer[rel < 50 ? 'face' : rel < 130 ? 'travers' : 'arriere'] += dt; }
    }
    // Changements d'amure comptés sur les points de route (pas sur les petits pas de calcul)
    (r.wp || []).forEach(w => {
      if (w.last || w.wait || w.mot || w.hdg == null) return;
      if (Math.abs(norm180(w.twd - w.hdg)) > 172) return; // plein vent arrière : amure indécise
      const sd = side(w.hdg, w.twd);
      if (lastSide && sd !== lastSide) sides++;
      lastSide = sd;
    });
    const dur = r.dur, pct = x => Math.round(100 * x / Math.max(1e-6, dur));
    const dep = timeAt(r.h0), arr = timeAt(r.h0 + dur), end = L[L.length - 1];
    const names = { pres: 'au près', travers: 'au travers', largue: 'au largue', arriere: 'au vent arrière' };
    const dom = Object.keys(allure).sort((x, y) => allure[y] - allure[x])[0];
    const avg = r.dist / Math.max(1e-6, dur - wait);
    let txt = `Traversée de ${distTxt(r.dist)} en ${fmtDur(dur)}, à ${nf1.format(avg)} nds de moyenne. `;
    txt += sail > 0 ? `Le bateau navigue surtout ${names[dom]} (${pct(allure[dom])} % du temps)` : 'La route se fait au moteur';
    txt += twsMax > 0 ? `, dans ${nf0.format(twsMin)} à ${nf0.format(twsMax)} nds de vent.` : '.';
    if (!r.noWaves && hsMax > 0) txt += ` Vagues jusqu'à ${nf1.format(hsMax)} m vers ${hfmt.format(timeAt(hsMaxT))}.`;

    // Points forts
    if (sail > 0 && (allure.largue + allure.arriere + allure.travers) / sail > 0.8) plus.push('Allures portantes ou de travers : pas de près, pas de louvoyage.');
    if (sides === 0 && sail > 0) plus.push('Aucun virement ni empannage : un seul bord.');
    else if (sides <= 2) plus.push(`Peu de manœuvres : ${sides} changement${sides > 1 ? 's' : ''} d'amure.`);
    if (mot === 0) plus.push('Tout à la voile, sans moteur.');
    if (!r.noWaves && hsMax > 0 && hsMax <= OPT.hmax * 0.75) plus.push(`Mer maniable : vagues bien en dessous de votre limite de ${nf1.format(OPT.hmax)} m.`);
    if (!r.noWaves && sail > 0 && mer.arriere / sail > 0.6) plus.push('Mer de l\'arrière la plupart du temps.');
    if (sunUp(end.lat, end.lon, arr)) plus.push(`Arrivée de jour (${hfmt.format(arr)}).`);
    if (twsMax > 0 && twsMax < OPT.wmax * 0.7 && light < dur * 0.2) plus.push('Vent régulier, sans pointe proche de votre maximum.');

    // Points faibles
    if (sail > 0 && allure.pres / sail > 0.3) moins.push(`Près serré ${pct(allure.pres)} % du temps : inconfortable et plus lent.`);
    if (sides >= 3) moins.push(`${sides} changements d'amure à prévoir.`);
    if (mot > 0) moins.push(`Moteur ${fmtDur(mot)} (${pct(mot)} %) : vérifier le carburant.`);
    if (light > 1) moins.push(`Petit temps (moins de 8 nds) pendant ${fmtDur(light)} à la voile.`);
    if (strong > 0) moins.push(`Vent proche de votre maximum de ${nf0.format(OPT.wmax)} nds pendant ${fmtDur(strong)} (jusqu'à ${nf0.format(twsMax)} nds).`);
    if (!r.noWaves && hsMax > OPT.hmax + 0.05) moins.push(`Vagues de ${nf1.format(hsMax)} m : un peu au-dessus de votre limite de ${nf1.format(OPT.hmax)} m.`);
    else if (!r.noWaves && hsMax > OPT.hmax * 0.75) moins.push(`Vagues de ${nf1.format(hsMax)} m : proches de votre limite de ${nf1.format(OPT.hmax)} m.`);
    if (!r.noWaves && sail > 0 && mer.travers / sail > 0.4 && hsMax > 1.5) moins.push('Mer de travers une bonne partie du temps : roulis.');
    if (!r.noWaves && sail > 0 && mer.face / sail > 0.3 && hsMax > 1) moins.push('Mer de face une partie du temps : ça tape.');
    const sv = (() => { let w = null; for (const l of L) { if (l.wait || l.mot || l.hdg == null) continue; const v = sailFor(Math.abs(norm180(l.twd - l.hdg)), l.tws); if (v && (!w || v.cat > w.cat || (v.cat === w.cat && v.m2 < w.m2))) w = v; } return w; })();
    if (sv && sv.cat === 5) moins.push(`Toile très réduite : jusqu'à ${nf1.format(sv.m2)} m² conseillés, il faut réduire aussi misaine ou trinquette.`);
    else if (sv && sv.cat >= 2) moins.push(`Ris à prévoir : jusqu'à ${sv.name}.`);
    else if (sv) plus.push('Pas de ris à prendre d\'après votre tableau de voilure.');
    if (wait > 0) moins.push(`Attente de ${fmtDur(wait)} sur place pour laisser passer la mer.`);
    if (night > 1) moins.push(`Navigation de nuit : ${fmtDur(night)}.`);
    if (!sunUp(end.lat, end.lon, arr)) moins.push(`Arrivée de nuit (${hfmt.format(arr)}).`);
    if (r.h0 + dur - (Date.now() - (r.t0 != null ? r.t0 : wind.t0)) / 3.6e6 > 72) moins.push('Fin de route à plus de 3 jours : prévision moins sûre, à recalculer avant le départ.');
    if (r.alt) moins.push(`Sans attente, arrivée ${hfmt.format(timeAt(r.alt.h))} mais vagues jusqu'à ${nf1.format(r.alt.hs)} m.`);

    const li = a => a.map(x => `<li>${x}</li>`).join('');
    el('analyse').innerHTML = `<p>${txt}</p>`
      + (plus.length ? `<h4 class="an-plus">Avantages</h4><ul>${li(plus)}</ul>` : '')
      + (moins.length ? `<h4 class="an-moins">Inconvénients</h4><ul>${li(moins)}</ul>` : '')
      + `<p class="an-note">Analyse automatique à partir du vent, des vagues et de la polaire de cette route (${r.model}). Départ ${hfmt.format(dep)}.</p>`;
  }


  // ---------- Comparer deux modèles ----------
  // Chiffres clés d'une route, calculés pendant que wind/waves sont ceux de son modèle.
  function routeStats(r) {
    const L = r.legs; let mot = 0, wait = 0, night = 0, twsMax = 0, hsMax = 0, guMax = 0, guH = null;
    const allure = { 'près': 0, travers: 0, largue: 0, 'vent arrière': 0 };
    for (let i = 0; i < L.length - 1; i++) {
      const a = L[i], dt = L[i + 1].h - a.h; if (dt <= 0) continue;
      if (!sunUp(a.lat, a.lon, timeAt(a.h + dt / 2))) night += dt;
      if (a.wait) { wait += dt; continue; }
      if (a.tws != null) twsMax = Math.max(twsMax, a.tws);
      if (a.gu == null && wind) { const w = windAt(a.lat, a.lon, a.h); a.gu = w && w.gu != null ? w.gu : -1; }
      if (a.gu > guMax) { guMax = a.gu; guH = a.h; }
      if (a.wv) hsMax = Math.max(hsMax, a.wv.hs);
      if (a.mot) { mot += dt; continue; }
      const twa = Math.abs(norm180(a.twd - a.hdg));
      allure[twa < 60 ? 'près' : twa < 110 ? 'travers' : twa < 150 ? 'largue' : 'vent arrière'] += dt;
    }
    const dom = Object.keys(allure).sort((x, y) => allure[y] - allure[x])[0];
    return { model: r.model, modelId: r.modelId, wName: r.noWaves ? null : r.wName, dur: r.dur, dist: r.dist, arr: timeAt(r.h0 + r.dur), twsMax, nightArr: !sunUp(L[L.length - 1].lat, L[L.length - 1].lon, timeAt(r.h0 + r.dur)), guMax: guMax > 0 ? guMax : null, guH, hsMax: r.noWaves ? null : hsMax, mot, wait, night, dom,
      pts: L.map(n => ({ lat: n.lat, lon: n.lon })) };
  }
  let cmp = null;
  function clearCompare() {
    cmp = null;
    const o = el('cmp-out'); if (o) o.innerHTML = '';
    map.getSource('route2') && map.getSource('route2').setData(EMPTY);
  }
  function fillCompareSelect() {
    const sel = el('cmp-model'); if (!sel || !last) return;
    sel.innerHTML = MODELS.filter(m => m.id !== last.modelId).map(m => `<option value="${m.id}">${m.name}${m.note ? ' · ' + m.note : ''}</option>`).join('');
    // AROME ↔ ARPEGE (les deux de Météo-France), sinon ECMWF (ou GFS si on part d'ECMWF)
    const pairs = { meteofrance_arome_france_hd: 'meteofrance_seamless', meteofrance_seamless: 'meteofrance_arome_france_hd', ecmwf_ifs025: 'gfs_seamless' };
    const pref = pairs[last.modelId] || 'ecmwf_ifs025';
    if (MODELS.some(m => m.id === pref)) sel.value = pref;
  }
  function maxGap(A, B) {
    // plus grand écart (milles) entre la route B et la route A
    let g = 0;
    for (let i = 0; i < B.length; i += Math.max(1, Math.floor(B.length / 60))) {
      let d = Infinity;
      for (let j = 0; j < A.length - 1; j++) d = Math.min(d, xtrackNm(B[i], A[j], A[j + 1]));
      g = Math.max(g, d);
    }
    return g;
  }
  function showCompare(A, B) {
    const dh = (B.arr - A.arr) / 3.6e6, adh = Math.abs(dh), gap = maxGap(A.pts, B.pts);
    const fd = x => (x == null ? 'n. d.' : x);
    const row = (k, a, b) => `<tr><th>${k}</th><td>${a}</td><td>${b}</td></tr>`;
    let t = `<table class="cmp-tab"><thead><tr><th></th><th><span class="lg lg-sail"></span>${A.model}</th><th><span class="lg lg-b"></span>${B.model}</th></tr></thead><tbody>`;
    t += row('Durée', fmtDur(A.dur), fmtDur(B.dur));
    t += row('Arrivée', hfmt.format(A.arr), hfmt.format(B.arr));
    t += row('Distance', distTxt(A.dist), distTxt(B.dist));
    t += row('Vent max', `${nf0.format(A.twsMax)} nds`, `${nf0.format(B.twsMax)} nds`);
    t += row(B.same ? 'Vagues max (sa route)' : 'Vagues max', fd(A.hsMax == null ? null : `${nf1.format(A.hsMax)} m`), fd(B.hsMax == null ? null : `${nf1.format(B.hsMax)} m`));
    if (B.same) {
      t += `<tr class="cmp-sep"><th colspan="3">Vagues sur la route ${A.model}</th></tr>`;
      t += row('Max', `${nf1.format(B.same.maxA)} m`, `${nf1.format(B.same.maxB)} m`);
      t += row('Moyenne', `${nf1.format(B.same.meanA)} m`, `${nf1.format(B.same.meanB)} m`);
      t += `<tr class="cmp-sep"><th colspan="3">Autres chiffres</th></tr>`;
    }
    t += row('Moteur', A.mot > 0 ? fmtDur(A.mot) : '–', B.mot > 0 ? fmtDur(B.mot) : '–');
    t += row('Attente', A.wait > 0 ? fmtDur(A.wait) : '–', B.wait > 0 ? fmtDur(B.wait) : '–');
    t += row('Allure', A.dom, B.dom);
    t += row('De nuit', fmtDur(A.night), fmtDur(B.night));
    t += '</tbody></table>';
    const p = [];
    if (adh <= 1 && gap < 5) p.push(`Les deux modèles sont d'accord : même route à ${nf0.format(gap)} M près, arrivée à ${Math.round(adh * 60)} min d'écart. La prévision paraît fiable.`);
    else if (adh <= 3 && gap < 15) p.push(`Les deux modèles sont assez proches : arrivée à ${fmtDur(adh)} d'écart, routes séparées au plus de ${nf0.format(gap)} M.`);
    else p.push(`Les deux modèles ne sont pas d'accord : arrivée à ${fmtDur(adh)} d'écart, routes séparées jusqu'à ${nf0.format(gap)} M. La prévision est incertaine : recalculez plus près du départ.`);
    if (adh > 0.25) p.push(`${dh > 0 ? A.model : B.model} est plus rapide (${fmtDur(Math.min(A.dur, B.dur))}).`);
    const dw = Math.abs(A.twsMax - B.twsMax);
    if (dw >= 4) p.push(`Vent : ${A.twsMax > B.twsMax ? A.model : B.model} prévoit nettement plus fort (${nf0.format(Math.max(A.twsMax, B.twsMax))} contre ${nf0.format(Math.min(A.twsMax, B.twsMax))} nds).`);
    if (A.hsMax != null && B.hsMax != null && Math.abs(A.hsMax - B.hsMax) >= 0.5) p.push(`Vagues : ${A.hsMax > B.hsMax ? A.model : B.model} prévoit une mer plus forte (${nf1.format(Math.max(A.hsMax, B.hsMax))} contre ${nf1.format(Math.min(A.hsMax, B.hsMax))} m).`);
    if (Math.abs(A.mot - B.mot) >= 1) p.push(`Moteur : ${fmtDur(A.mot)} avec ${A.model}, ${fmtDur(B.mot)} avec ${B.model}.`);
    if (A.dom !== B.dom) p.push(`Allure principale différente : ${A.dom} avec ${A.model}, ${B.dom} avec ${B.model}.`);
    if (B.same) {
      const S = B.same, d = Math.round(S.maxB * 10) / 10 - Math.round(S.maxA * 10) / 10, wA = A.wName || A.model, wB = B.wName || B.model;
      if (Math.abs(d) < 0.25) p.push(`Vagues : ${wA} et ${wB} sont d'accord sur votre route (${nf1.format(S.maxA)} et ${nf1.format(S.maxB)} m au plus).`);
      else p.push(`Vagues : sur votre route, ${d > 0 ? wB : wA} prévoit plus fort (${nf1.format(Math.max(S.maxA, S.maxB))} contre ${nf1.format(Math.min(S.maxA, S.maxB))} m au plus).`);
      if (Math.abs(Math.round(S.gapB * 10) - Math.round(S.gapA * 10)) >= 3) p.push(`Plus gros écart vers ${hfmt.format(timeAt(S.gapH))} : ${nf1.format(S.gapA)} m avec ${wA}, ${nf1.format(S.gapB)} m avec ${wB}.`);
      if (Math.max(S.maxA, S.maxB) > OPT.hmax + 0.05) p.push(`Au moins un des deux modèles dépasse votre limite de ${nf1.format(OPT.hmax)} m sur cette route.`);
    }
    if (A.wName && A.wName === B.wName && A.wName !== 'Open-Meteo') p.push(`Les vagues viennent du même modèle (${A.wName}) pour les deux : les écarts de vagues ne viennent que des routes différentes.`);
    const hs = [A.hsMax, B.hsMax, B.same && B.same.maxB].filter(x => x != null);
    p.push(`Par prudence, préparez le bateau pour le pire des deux : vent ${nf0.format(Math.max(A.twsMax, B.twsMax))} nds${hs.length ? `, vagues ${nf1.format(Math.max(...hs))} m` : ''}.`);
    el('cmp-out').innerHTML = t + `<ul>${p.map(x => `<li>${x}</li>`).join('')}</ul><p class="an-note">La route ${B.model} est tracée en violet pointillé sur la carte. La feuille de route et le GPX sont pour l'instant ceux ${/^[AEIOUY]/.test(A.model) ? "d'" : 'de '}${A.model}.</p><button type="button" class="btn-primary btn-use" id="cmp-use">Prendre la route ${B.model}</button><p class="an-note">Feuille de route, plan de voilure et GPX suivront alors la route ${B.model}.</p>`;
    el('cmp-use').addEventListener('click', useCompare);
    map.getSource('route2') && map.getSource('route2').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: B.pts.map(q => [q.lon, q.lat]) }, properties: {} });
  }
  async function runCompare() {
    if (!last) return;
    const id = el('cmp-model').value, btn = el('cmp-go'), out = el('cmp-out');
    cmpId = id;
    const keep = { wind, waves, currents };
    btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    const sayC = (t, err) => { out.innerHTML = `<p class="${err ? 'cmp-err' : 'an-note'}">${t}</p>`; };
    try {
      if (!last.statsA) last.statsA = routeStats(last);
      const rB = await computeRoute(id, true, sayC);
      const B = routeStats(rB);
      // Vagues des deux modèles au même endroit et à la même heure, le long de la route principale
      if (!last.noWaves && !rB.noWaves) {
        const L = last.legs, sA = [], sB = [];
        for (let i = 0; i < L.length - 1; i++) {
          const a = L[i]; if (!a.wv) continue;
          const hB = (keep.wind.t0 + a.h * 3.6e6 - wind.t0) / 3.6e6, x = waveAt(a.lat, a.lon, hB);
          if (!x) continue;
          sA.push({ hs: a.wv.hs, h: a.h }); sB.push({ hs: x.hs, h: a.h });
        }
        if (sA.length) {
          let iMax = 0;
          sA.forEach((q, i) => { if (Math.abs(sB[i].hs - q.hs) > Math.abs(sB[iMax].hs - sA[iMax].hs)) iMax = i; });
          const mean = a => a.reduce((t, q) => t + q.hs, 0) / a.length;
          B.same = { maxA: Math.max(...sA.map(q => q.hs)), maxB: Math.max(...sB.map(q => q.hs)), meanA: mean(sA), meanB: mean(sB),
            gapH: sA[iMax].h, gapA: sA[iMax].hs, gapB: sB[iMax].hs };
        }
      }
      wind = keep.wind; waves = keep.waves; currents = keep.currents;
      cmp = B;
      showCompare(last.statsA, B);
    } catch (e) {
      sayC(e.message || String(e), true);
    } finally {
      wind = keep.wind; waves = keep.waves; currents = keep.currents;
      btn.disabled = false; btn.removeAttribute('aria-busy');
    }
  }


  // ---------- Voilure : tableau « Voilure et ris » de vos polaires ----------
  const REEF_TWA = [40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 135, 150], REEF_TWS = [16, 20, 25, 30];
  const SAIL = [
    { k: 'chute', name: 'Spi (light)', m2: 96.1, cls: 's0' },
    { k: 'plein', name: 'Plein : GV, misaine, trinquette', m2: 54.6, cls: 's1' },
    { k: 'GV 1.5 m', name: 'GV 1er ris (1,5 m)', cls: 's2' },
    { k: 'GV 3.0 m', name: 'GV 2e ris (3,0 m)', cls: 's3' },
    { k: 'GV 4.5 m', name: 'GV 3e ris (4,5 m)', cls: 's4' },
    { k: '3 ris GV insuffisants', name: '3 ris GV insuffisants : réduire aussi misaine ou trinquette', cls: 's5' },
  ];
  function sailFor(twa, tws) {
    if (twa == null || tws == null || !window.REEFS || OPT.pk === 'x') return null;
    const T = REEF_TWA.reduce((b, x) => (Math.abs(x - twa) < Math.abs(b - twa) ? x : b), REEF_TWA[0]);
    const over = tws > 30.5;
    const W = tws <= 14.5 ? null : (REEF_TWS.find(x => x >= tws - 0.5) || 30);
    const row = W && REEFS[OPT.pk === 'l' ? 'l' : 'c'][T];
    const hit = row && row[W];
    let cat, m2;
    if (hit) { cat = SAIL.findIndex(x => x.k === hit[1]); m2 = hit[0]; }
    else { cat = T >= 100 ? 0 : 1; m2 = SAIL[cat].m2; }
    if (cat < 0) return null;
    // Sans spi à bord : le plein 54,6 m² à la place
    if (cat === 0 && !OPT.spi) return { cat: 1, m2: 54.6, over, ...SAIL[1] };
    // Votre seuil : pas de spi au-delà de OPT.cx nds de vent réel
    if (cat === 0 && tws > OPT.cx + 0.5) return { cat: 1, m2: 54.6, over, ...SAIL[1], lim: true };
    return { cat, m2, over, ...SAIL[cat] };
  }
  const sailTxt = v => `${v.name} · ${nf1.format(v.m2)} m²${v.lim ? ` (spi affalé au-delà de ${nf0.format(OPT.cx)} nds)` : ''}${v.over ? ' (vent au-delà du tableau)' : ''}`;
  function sailPlan(r) {
    // Suite des voilures le long de la route ; un changement doit durer au moins 30 min.
    const L = r.legs, segs = [];
    let limOn = false;
    for (let i = 0; i < L.length - 1; i++) {
      const a = L[i];
      let v = null, key = 'x';
      if (a.wait) key = 'wait';
      else if (a.mot) key = 'mot';
      else {
        v = sailFor(Math.abs(norm180(a.twd - a.hdg)), a.tws);
        // marge de 2 nds : une fois le spi affalé, on ne le renvoie que si le vent tombe sous le seuil moins 2 nds
        if (v && v.cat === 0 && limOn && a.tws > OPT.cx - 2) v = { ...SAIL[1], cat: 1, m2: 54.6, lim: true };
        if (v) limOn = !!v.lim || (limOn && v.cat >= 1);
        if (v && v.cat === 0) limOn = false;
        key = v ? 'c' + v.cat + (v.cat >= 2 ? '_' + v.m2 : '') : 'x'; }
      const prev = segs[segs.length - 1];
      if (prev && prev.key === key) { prev.h1 = L[i + 1].h; if (v) prev.m2 = Math.min(prev.m2, v.m2); if (a.tws > prev.twsMax) prev.twsMax = a.tws; }
      else segs.push({ key, v, h0: a.h, h1: L[i + 1].h, m2: v ? v.m2 : null, twsMax: a.tws || 0 });
    }
    // fusionne les passages trop courts dans le voisin le plus prudent
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]; if (segs.length < 2 || s.h1 - s.h0 >= 0.5 || s.key === 'wait') continue;
        let n = [segs[i - 1], segs[i + 1]].filter(Boolean).filter(x => x.key !== 'wait');
        if (!n.length) continue;
        // un court passage à la voile reste à la voile (et le moteur au moteur) si un voisin est du même type : les totaux restent justes
        const kind = x => x.key === 'mot' ? 'm' : 's';
        const same = n.filter(x => kind(x) === kind(s)); if (same.length) n = same;
        // Vent fort : on garde la voilure la plus prudente. Petit temps (sans réduction possible) : le passage le plus long.
        const light = Math.max(s.twsMax, ...n.map(x => x.twsMax)) <= 14.5;
        const t = light ? n.sort((x, y) => (y.h1 - y.h0) - (x.h1 - x.h0))[0]
          : n.sort((x, y) => (y.v ? y.v.cat : -1) - (x.v ? x.v.cat : -1))[0];
        t.h0 = Math.min(t.h0, s.h0); t.h1 = Math.max(t.h1, s.h1); t.twsMax = Math.max(t.twsMax, s.twsMax);
        if (s.m2 != null && t.m2 != null) t.m2 = Math.min(t.m2, s.m2);
        segs.splice(i, 1); i--;
      }
      for (let i = 1; i < segs.length; i++) if (segs[i].key === segs[i - 1].key) { segs[i - 1].h1 = segs[i].h1; if (segs[i].m2 != null) segs[i - 1].m2 = Math.min(segs[i - 1].m2, segs[i].m2); segs.splice(i, 1); i--; }
    }
    return segs;
  }
  function showSailPlan(r) {
    const box = el('sail-plan'); if (!box) return;
    const segs = sailPlan(r);
    let prevCat = null, prevRank = null;
    const items = segs.map((s, n) => {
      const t = hfmt.format(timeAt(s.h0)), d = fmtDur(s.h1 - s.h0);
      let what, cls, act = '';
      if (s.key === 'wait') { what = 'Attente, mer trop forte'; cls = 'sw'; }
      else if (s.key === 'mot') { what = 'Moteur'; cls = 'sm'; }
      else if (s.v) {
        what = s.v.cat === 5 ? `${s.v.name} · ${nf1.format(s.m2)} m²` : sailTxt({ ...s.v, m2: s.v.cat >= 2 ? s.m2 : s.v.m2 });
        cls = s.v.cls;
        const rank = s.v.cat * 1000 - s.m2;
        if (prevCat != null) act = prevCat === 0 && s.v.cat === 1 ? '<span class="sp-act">Affaler le spi, envoyer la trinquette</span>'
          : prevCat >= 1 && s.v.cat === 0 ? '<span class="sp-act">Envoyer le spi, amener la trinquette</span>'
          : rank > prevRank ? '<span class="sp-act down">Réduire</span>' : rank < prevRank ? '<span class="sp-act up">Renvoyer de la toile</span>' : '';
        prevCat = s.v.cat; prevRank = rank;
      } else { what = 'Pas de voile utile'; cls = 'sm'; }
      return `<li class="${cls}"><span class="sp-dot"></span><div><b>${n === 0 ? 'Départ' : t}</b> ${act}<br>${what}<span class="sp-dur"> · ${d}</span></div></li>`;
    });
    const chg = Math.max(0, segs.filter(s => s.v).length - 1);
    box.innerHTML = `<p class="an-note">${chg === 0 ? 'Aucun changement de voilure sur la route.' : `${chg} changement${chg > 1 ? 's' : ''} de voilure à prévoir.`} Bateau ${OPT.pk === 'l' ? 'léger' : 'chargé'}.</p><ol class="sp">${items.join('')}</ol>`
      + `<p class="an-note">D'après votre tableau « Voilure et ris » (Excel, onglet Comparaison) : surface conseillée et ris de grand-voile équivalent. Vent arrondi au cran supérieur du tableau (16, 20, 25, 30 nds), allure au plus proche. Le plan ne donne pas l'ordre de réduction entre les voiles. ${OPT.spi ? `Spi affalé au-delà de ${nf0.format(OPT.cx)} nds (votre réglage) ; les vitesses de la route restent celles de la polaire` : 'Sans spi à bord (votre réglage) : plein 54,6 m² au portant ; vitesses de la polaire sans spi'}.</p>`;
    return segs;
  }

  function scrub() {
    const r = last; if (!r) return;
    const h = r.h0 + (Number(ui.scrub.value) / 1000) * r.dur;
    let i = 0;
    while (i < r.legs.length - 2 && r.legs[i + 1].h <= h) i++;
    const a = r.legs[i], b = r.legs[i + 1] || a;
    const f = b.h > a.h ? Math.min(1, Math.max(0, (h - a.h) / (b.h - a.h))) : 0;
    const pos = { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
    boat && boat.setLngLat([pos.lon, pos.lat]);
    if (boat) {
      const ref = a.hdg != null ? a : r.legs[i - 1];
      if (ref && ref.hdg != null) {
        const sv = ref.mot || ref.wait ? null : sailFor(Math.abs(norm180(ref.twd - ref.hdg)), ref.tws);
        boat.setRotation(ref.hdg); trimSails(boat.getElement(), ref.hdg, ref.twd, ref.mot, !!(sv && sv.cat === 0));
      }
    }
    drawWind(h);
    drawWaves(h);
    const set = (id, t) => { el(id).textContent = t; };
    el('now-cur-row').hidden = !r.currents;
    set('now-time', dfmt.format(timeAt(h)));
    if (a.wait) {
      set('now-hdg', '–'); set('now-bsp', '0 nds, attente');
      set('now-tws', `${nf0.format(a.tws)} nds du ${nf0.format(a.twd)}°`);
      set('now-twa', 'Attente : mer trop forte devant');
      set('now-sail', '–');
    } else if (a.hdg != null) {
      const twa = Math.abs(norm180(a.twd - a.hdg));
      set('now-hdg', a.tack && a.hdg2 != null ? `${nf0.format(a.hdg)}° / ${nf0.format(a.hdg2)}° en tirant des bords` : `${nf0.format(a.hdg)}°`);
      set('now-bsp', `${nf1.format(a.bsp)} nds${a.mot ? ' moteur' : ''}${r.useCur && a.sog != null && Math.abs(a.sog - a.bsp) >= 0.05 ? ` · fond ${nf1.format(a.sog)}` : ''}`);
      set('now-tws', `${nf0.format(a.tws)} nds du ${nf0.format(a.twd)}°${a.gu > 0 ? ` · rafales ${nf0.format(a.gu)}` : ''}`);
      set('now-twa', a.mot ? 'Moteur' : `${nf0.format(twa)}° ${side(a.hdg, a.twd)}${a.tack ? ' · louvoyage serré dans le passage étroit, moteur conseillé' : ''}`);
      const sv = a.mot ? null : sailFor(twa, a.tws);
      set('now-sail', a.mot ? 'Moteur' : sv ? sailTxt(sv) : '–');
      const wv = waveAt(pos.lat, pos.lon, h) || (last && last.saved ? a.wv : null);
      set('now-wave', wv ? `${nf1.format(wv.hs)} m du ${nf0.format(wv.dir)}°, période ${nf0.format(wv.tp)} s` : 'pas de donnée');
      const cw = curAt(pos.lat, pos.lon, h);
      set('now-cur', cw ? `${nf1.format(cw.sp)} nds vers ${nf0.format(cw.dir)}°${nearCoast(pos.lat, pos.lon) ? ' · près des côtes : peu fiable' : ''}` : 'pas de donnée');
    } else { set('now-time', `${dfmt.format(timeAt(h))} · arrivée`); ['now-hdg','now-bsp','now-tws','now-twa','now-wave','now-sail','now-cur'].forEach(i => set(i, '–')); }
  }
  ui.scrub.addEventListener('input', scrub);
  let stepH = null; // heure exacte du dernier point atteint par les flèches
  function stepLeg(dir) {
    const r = last; if (!r) return;
    let h = r.h0 + (Number(ui.scrub.value) / 1000) * r.dur;
    if (stepH != null && Math.abs(stepH - h) < r.dur * 0.002) h = stepH;
    const hs = (r.wp || r.legs).map(l => l.h);
    const eps = r.dur * 0.0015; // le curseur est arrondi au millième : sans marge, la flèche retombait sur le même point
    let t = dir > 0 ? hs.find(x => x > h + eps) : [...hs].reverse().find(x => x < h - eps);
    if (t == null) t = dir > 0 ? r.h0 + r.dur : r.h0;
    stepH = t;
    ui.scrub.value = String(Math.round(((t - r.h0) / r.dur) * 1000)); scrub();
  }
  el('prev').addEventListener('click', () => stepLeg(-1));
  el('next').addEventListener('click', () => stepLeg(1));

  // Réglages : lecture, mémoire locale, résumé
  const optIds = { hmax: 'o-hmax', pol: 'o-pol', wmax: 'o-wmax', cx: 'o-cx', coast: 'o-coast', dmin: 'o-dmin', eng: 'o-eng', min: 'o-min', engs: 'o-engs', engw: 'o-engw' };
  function readOpt() {
    const num = (id, d, lo, hi) => { const v = parseFloat(String(el(id).value).replace(',', '.')); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
    OPT.pol = num('o-pol', 100, 40, 110) / 100;
    OPT.wmax = num('o-wmax', 35, 10, 60);
    OPT.cx = num('o-cx', 20, 5, 40);
    OPT.coast = num('o-coast', 300, 50, 2000);
    OPT.dmin = num('o-dmin', 2, 0, 20);
    OPT.eng = el('o-eng').checked;
    OPT.min = num('o-min', 3, 0.5, 10);
    OPT.engs = num('o-engs', 5, 1, 12);
    OPT.engw = num('o-engw', 15, 0, 60);
    OPT.hmax = num('o-hmax', 4, 0.5, 12);
    ['cp', 'ct', 'cd', 'cl'].forEach(k => { OPT[k] = num('o-' + k, 100, 50, 130) / 100; el('v-' + k).textContent = `${Math.round(OPT[k] * 100)} %`; });
    OPT.pk = el('o-pk').dataset.v === 'l' ? 'l' : el('o-pk').dataset.v === 'x' && POLARS.x ? 'x' : 'c';
    if (OPT.pk !== 'x' && POLARS.x) clearPx();
    OPT.spi = el('o-spi').dataset.v !== '0';
    OPT.ico = ['c', 'm'].includes(el('o-ico').dataset.v) ? el('o-ico').dataset.v : 't';
    el('o-ico').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === OPT.ico)));
    OPT.cur = el('o-cur').dataset.v !== '0';
    el('o-cur').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === '1') === OPT.cur)));
    el('o-spi').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === '1') === OPT.spi)));
    document.querySelectorAll('.set-row.spi-row').forEach(r => r.classList.toggle('off', !OPT.spi));
    const key = OPT.pk === 'x' ? 'x' : OPT.pk + (OPT.spi ? '' : 's');
    const other = OPT.pk === 'x';
    document.body.classList.toggle('other-boat', other);
    el('o-pk-txt').textContent = OPT.pk === 'l' ? 'Léger : pas de données au-delà de 30 nds.' : other ? 'Toucher Chargé ou Léger revient au Tiki 38 et retire cette polaire.' : '';
    el('o-x-btn').textContent = PX_NAME;
    el('o-x-change').textContent = other ? 'Importer une autre polaire' : '+ Importer la polaire d\u2019un autre bateau';
    el('pk-now').textContent = OPT.pk === 'x' ? PX_NAME : `Tiki 38 – ${OPT.pk === 'l' ? 'Léger' : 'Chargé'}`;
    document.body.classList.toggle('has-px', !!POLARS.x);
    { const ib = el('o-ico').querySelector(`button[data-v="${OPT.ico}"]`); if (ib) { el('ico-cur-pv').innerHTML = ib.querySelector('.ico-pv').innerHTML; el('ico-cur-txt').textContent = ib.textContent; } }
    el('pol-leg').textContent = other ? `Trait plein : votre polaire. Pointillés : ${PX_NAME} d'origine. Vitesses en nœuds.` : 'Trait plein : votre polaire. Pointillés : Chargé d\u2019origine. Vitesses en nœuds.';
    if (other && el('result').dataset.tab === 'voile') setTab('resume');
    P = POLARS[key] || POLARS[OPT.pk];
    if (polKey && polKey !== key && last && last.legs) say('Polaire changée : touchez « Calculer la route » pour mettre la route à jour.');
    polKey = key;
    el('o-pk').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === OPT.pk)));
    drawPolar();
    document.querySelectorAll('.set-row.eng').forEach(r => r.classList.toggle('off', !OPT.eng));
    const modif = ['cp', 'ct', 'cd', 'cl'].some(k => OPT[k] !== 1);
    try { if (last && last.legs) showSailPlan(last); } catch (e) {}
    el('set-sum').textContent = `${OPT.pk === 'x' ? PX_NAME : OPT.pk === 'l' ? 'Tiki 38 Léger' : 'Tiki 38 Chargé'}${modif ? ' modifiée' : ''} · ${Math.round(OPT.pol * 100)} % · ${nf0.format(OPT.wmax)} nds max · vagues ${nf1.format(OPT.hmax)} m${OPT.spi || OPT.pk === 'x' ? '' : ' · sans spi'}${OPT.eng ? ` · moteur ${nf1.format(OPT.engs)} nds` : ''}${OPT.cur ? '' : ' · sans courant'}`;
  }
  // Mémoire : cookie du navigateur (1 an), plus les réglages dans l'adresse de la page.
  const CK = '__Host-tiki38opt';
  function applyOpt(o) {
    if (!o) return;
    if (o.pol != null) el('o-pol').value = Math.round(o.pol * 100);
    if (o.wmax != null) el('o-wmax').value = o.wmax;
    if (o.cx != null && Number.isFinite(+o.cx)) el('o-cx').value = o.cx;
    if (o.coast != null && Number.isFinite(+o.coast)) el('o-coast').value = o.coast;
    if (o.dmin != null && Number.isFinite(+o.dmin)) el('o-dmin').value = o.dmin;
    if (o.eng != null) el('o-eng').checked = !!o.eng;
    if (o.min != null) el('o-min').value = o.min;
    if (o.engs != null) el('o-engs').value = o.engs;
    if (o.engw != null) el('o-engw').value = o.engw;
    if (o.hmax != null && Number.isFinite(+o.hmax)) el('o-hmax').value = o.hmax;
    ['cp', 'ct', 'cd', 'cl'].forEach(k => { if (o[k] != null && Number.isFinite(+o[k])) el('o-' + k).value = Math.round(o[k] * 100); });
    if (o.pk) el('o-pk').dataset.v = o.pk === 'l' ? 'l' : o.pk === 'x' && POLARS.x ? 'x' : 'c';
    if (o.spi != null) el('o-spi').dataset.v = o.spi ? '1' : '0';
    if (o.ico) el('o-ico').dataset.v = o.ico;
    if (o.cur != null) el('o-cur').dataset.v = o.cur ? '1' : '0';
  }
  function loadSaved() {
    try {
      const q = new URLSearchParams(location.search);
      if (q.has('pol') || q.has('wmax')) {
        const o = { pol: +q.get('pol') / 100 || 1, wmax: +q.get('wmax') || 35, eng: q.get('eng') === '1', min: +q.get('min') || 3, engs: +q.get('engs') || 5, engw: q.has('mfv') ? +q.get('mfv') : 15, pk: q.get('pk') === 'l' ? 'l' : q.get('pk') === 'x' ? 'x' : 'c' };
        ['cp', 'ct', 'cd', 'cl'].forEach(k => { if (q.has(k)) o[k] = +q.get(k) / 100 || 1; });
        if (q.has('hmax')) o.hmax = +q.get('hmax') || 4;
        if (q.has('cx')) o.cx = +q.get('cx') || 20;
        if (q.has('cote')) o.coast = +q.get('cote') || 300;
        if (q.has('prof')) o.dmin = Number.isFinite(+q.get('prof')) ? +q.get('prof') : 2;
        if (q.has('spi')) o.spi = q.get('spi') !== '0';
        if (q.has('cur')) o.cur = q.get('cur') !== '0';
        if (q.has('ico')) o.ico = q.get('ico');
        return o;
      }
      const m = document.cookie.split('; ').find(c => c.startsWith(CK + '='));
      return m ? JSON.parse(decodeURIComponent(m.slice(CK.length + 1))) : null;
    } catch (e) { return null; }
  }
  function saveOpt(manual) {
    readOpt();
    const v = encodeURIComponent(JSON.stringify(OPT));
    try { document.cookie = `${CK}=${v}; Max-Age=31536000; Path=/; Secure; SameSite=Lax`; } catch (e) {}
    try {
      const q = new URLSearchParams(location.search);
      q.set('pol', Math.round(OPT.pol * 100)); q.set('wmax', OPT.wmax); q.set('eng', OPT.eng ? '1' : '0'); q.set('min', OPT.min); q.set('engs', OPT.engs); q.set('mfv', OPT.engw); q.set('pk', OPT.pk); q.set('hmax', OPT.hmax); q.set('cx', OPT.cx); q.set('cote', OPT.coast); q.set('prof', OPT.dmin); q.set('spi', OPT.spi ? '1' : '0'); q.set('cur', OPT.cur ? '1' : '0'); q.set('ico', OPT.ico);
      ['cp', 'ct', 'cd', 'cl'].forEach(k => q.set(k, Math.round(OPT[k] * 100)));
      history.replaceState(null, '', `${location.pathname}?${q}`);
    } catch (e) {}
    const ok = document.cookie.indexOf(CK + '=') >= 0;
    el('o-note').hidden = ok;
    if (manual === true) {
      const b = el('o-save');
      b.textContent = ok ? 'Enregistré' : 'Enregistré dans le lien'; b.classList.add('ok');
      setTimeout(() => { b.textContent = 'Enregistrer'; b.classList.remove('ok'); }, 2000);
    }
  }
  el('o-save').addEventListener('click', () => saveOpt(true));
  el('o-pk').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.v === 'x' && !POLARS.x) { el('o-x-pick').hidden = false; return; }
    el('o-pk').dataset.v = b.dataset.v; saveOpt();
  }));
  el('o-x-change').addEventListener('click', () => { el('o-x-pick').hidden = !el('o-x-pick').hidden; });
  el('o-x-file').addEventListener('click', () => { el('o-x-pick').hidden = true; el('o-file').click(); });
  // Exemple : polaire Oceanis 43 de la bibliothèque OpenCPN Weather Routing (GPL-3.0)
  el('o-mono').addEventListener('click', async () => {
    el('o-x-pick').hidden = true;
    const msg = el('o-x-msg');
    try {
      const r = await fetch('polaires/monocoque_13m_oceanis_43.pol'); if (!r.ok) throw new Error('fichier introuvable');
      const p = parsePolarText(await r.text());
      POLARS.x = p; PX_NAME = 'Oceanis 43 exemple';
      savePx(PX_NAME, p);
      msg.textContent = `${PX_NAME} : polaire de la bibliothèque OpenCPN.`; msg.classList.remove('err');
      el('o-pk').dataset.v = 'x'; polKey = ''; saveOpt();
      { const ib = el('o-ico').querySelector('button[data-v="m"]'); if (ib && OPT.ico !== 'm') ib.click(); }
      if (last && last.legs) say('Polaire changée : touchez « Calculer la route » pour mettre la route à jour.');
    } catch (x) { msg.textContent = `Polaire non chargée : ${x.message}`; msg.classList.add('err'); }
  });
  el('o-file').addEventListener('change', async () => {
    const f = el('o-file').files[0]; el('o-file').value = '';
    if (!f) return;
    const msg = el('o-x-msg');
    try {
      if (f.size > 500000) throw new Error('Fichier trop gros pour une polaire.');
      const p = parsePolarText(await f.text());
      POLARS.x = p; PX_NAME = boatNameFromFile(f.name);
      const ok = savePx(PX_NAME, p);
      msg.textContent = `${PX_NAME} : ${p.twa.length} angles, vents jusqu'à ${nf0.format(p.tws[p.tws.length - 1])} nds.${ok ? '' : ' Polaire trop grande pour être gardée : à réimporter au prochain lancement.'}`;
      msg.classList.remove('err');
      el('o-pk').dataset.v = 'x'; polKey = ''; saveOpt();
      if (last && last.legs) say('Polaire changée : touchez « Calculer la route » pour mettre la route à jour.');
    } catch (e) {
      msg.textContent = `Polaire non lue : ${e.message}`; msg.classList.add('err');
    }
  });
  el('o-spi').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { el('o-spi').dataset.v = b.dataset.v; saveOpt(); }));
  // Icône du bateau : aperçu dans chaque bouton, et le bateau sur la route change tout de suite
  el('o-ico').querySelectorAll('button').forEach(b => {
    const pv = boatEl(b.dataset.v); trimSails(pv, 0, 120, false, false);
    b.querySelector('.ico-pv').innerHTML = pv.innerHTML;
    b.addEventListener('click', () => {
      el('o-ico').dataset.v = b.dataset.v; saveOpt(); el('ico-fold').open = false; appIcon();
      if (boat) { const n = boatEl(OPT.ico), e = boat.getElement(); e.innerHTML = n.innerHTML; Object.assign(e.dataset, n.dataset); try { scrub(); } catch (x) {} }
    });
  });
  // Icône du logiciel : onglet du navigateur tout de suite ; appli Android au prochain démarrage
  function appIcon() {
    const k = ['c', 'm'].includes(OPT.ico) ? OPT.ico : 't';
    const l = document.querySelector('link[rel="icon"]'); if (l) l.href = `ico/${k}-64.png`;
    try { const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppIcon; if (P) Promise.resolve(P.set({ kind: k })).catch(() => {}); else if (window.Capacitor && window.Capacitor.nativePromise) window.Capacitor.nativePromise('AppIcon', 'set', { kind: k }).catch(() => {}); } catch (e) {}
  }
  { const ib = el('o-ico').querySelector(`button[data-v="${OPT.ico || 't'}"]`); if (ib) { el('ico-cur-pv').innerHTML = ib.querySelector('.ico-pv').innerHTML; el('ico-cur-txt').textContent = ib.textContent; } }
  el('o-cur').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { const ch = el('o-cur').dataset.v !== b.dataset.v; el('o-cur').dataset.v = b.dataset.v; saveOpt(); if (ch && last && last.legs) say('Courant changé : touchez « Relancer » pour mettre la route à jour.'); }));
  ['cp', 'ct', 'cd', 'cl'].forEach(k => { el('o-' + k).addEventListener('input', readOpt); el('o-' + k).addEventListener('change', saveOpt); });
  el('o-reset').addEventListener('click', () => {
    if (el('o-pk').dataset.v !== 'x') el('o-pk').dataset.v = 'c';
    el('o-pol').value = 100;
    ['cp', 'ct', 'cd', 'cl'].forEach(k => { el('o-' + k).value = 100; });
    saveOpt(true);
  });
  // Dessin de la polaire : votre polaire (trait plein) et l'origine Chargé 100 % (pointillés)
  function drawPolar() {
    const svg = el('pol-svg'); if (!svg) return;
    const cx = 14, cy = 118, R = 104, VMAX = 16;
    const xy = (a, v) => { const r = Math.min(v, VMAX) / VMAX * R; return [cx + r * Math.sin(a * Math.PI / 180), cy - r * Math.cos(a * Math.PI / 180)]; };
    const ORIG = { pol: 1, cp: 1, ct: 1, cd: 1, cl: 1 };
    const curve = (tws, o, base) => {
      if (tws > base.tws[base.tws.length - 1]) return '';
      let d = '';
      for (let a = 0; a <= 180; a += 5) { const [x, y] = xy(a, sailSpeed(a, tws, o, base)); d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }
      return d;
    };
    let g = '';
    [5, 10, 15].forEach(v => { const r = v / VMAX * R; g += `<path d="M${cx} ${cy - r} A${r} ${r} 0 0 1 ${cx} ${cy + r}" fill="none" stroke="#d8d2c6" stroke-width="0.6"/><text x="${cx + 2}" y="${cy - r + 7}" font-size="7" fill="#8a8478">${v}</text>`; });
    [45, 90, 135].forEach(a => { const [x, y] = xy(a, VMAX); g += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e4dfd5" stroke-width="0.6"/><text x="${(x + (a === 90 ? -12 : -6)).toFixed(1)}" y="${(y + (a === 135 ? 4 : a === 45 ? 6 : -2)).toFixed(1)}" font-size="7" fill="#8a8478">${a}°</text>`; });
    const COL = { 6: '#7fa7c4', 10: '#1f5f8b', 16: '#d98a00', 25: '#b8322a' };
    Object.entries(COL).forEach(([w, c]) => {
      g += `<path d="${curve(+w, ORIG, OPT.pk === 'x' && POLARS.x ? POLARS.x : POLARS.c)}" fill="none" stroke="${c}" stroke-width="0.9" stroke-dasharray="2 2" opacity="0.7"/>`;
      g += `<path d="${curve(+w, OPT, P)}" fill="none" stroke="${c}" stroke-width="1.8"/>`;
    });
    svg.innerHTML = g;
  }
  applyOpt(loadSaved());
  Object.values(optIds).forEach(id => { el(id).addEventListener('input', readOpt); el(id).addEventListener('change', saveOpt); el(id).addEventListener('blur', saveOpt); });
  readOpt();
  appIcon();

  el('reset').addEventListener('click', () => {
    el('gpx-help').hidden = true;
    if (wxOn) wxClose(true); // Reset : on quitte aussi le mode Météo
    clearResult(); clearTraceLine();
    // Plus rien du grib à l'écran : vent, vagues, courant
    wind = null; waves = null; currents = null;
    ['wind', 'wave-dirs', 'cur-dirs'].forEach(id => map.getSource(id) && map.getSource(id).setData(EMPTY));
    if (map.getLayer('waves')) map.setLayoutProperty('waves', 'visibility', 'none');
    el('wave-toggle').hidden = true; el('cur-toggle').hidden = true; el('cur-legend').hidden = true;
    try { drawWaves(); } catch (e) {}
    start = end = null;
    vias.forEach(v => v.m.remove()); vias = [];
    mStart && mStart.remove(); mEnd && mEnd.remove(); mStart = mEnd = null;
    refresh();
  });

  // ---------- Dernière route : gardée dans des cookies (compressée), rouverte telle quelle au démarrage ----------
  const RTK = 'tiki_rt';
  const rtOld = () => +((document.cookie.split('; ').find(c => c.startsWith(RTK + 'n=')) || '=0').split('=')[1]) || 0;
  function clearSavedRoute() {
    const old = rtOld();
    for (let i = 0; i < old; i++) document.cookie = `${RTK}${i}=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
    document.cookie = `${RTK}n=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
  }
  const b64u = u8 => { let t = ''; for (let i = 0; i < u8.length; i += 0x8000) t += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = t => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  async function zip(str, inflate) {
    const cs = inflate ? new DecompressionStream('deflate-raw') : new CompressionStream('deflate-raw');
    const out = new Response(new Blob([inflate ? str : new TextEncoder().encode(str)]).stream().pipeThrough(cs));
    return inflate ? out.text() : new Uint8Array(await out.arrayBuffer());
  }
  // Trace seule : les points posés et le tracé, sans la météo du calcul
  async function packTrace(r, name, max) {
    try {
      if (!r || !r.legs || typeof CompressionStream === 'undefined') return '';
      const pts = [start, ...vias.map(v => v.p), end].map(p => [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5]);
      let L = r.legs.map(l => [l.lat, l.lon]), v = '';
      for (let pass = 0; pass < 10; pass++) {
        let pa = 0, po = 0; const d = [];
        L.forEach(q => { const x = Math.round(q[0] * 1e4), y = Math.round(q[1] * 1e4); d.push(x - pa, y - po); pa = x; po = y; });
        v = b64u(await zip(JSON.stringify({ v: 2, name, at: Date.now(), dist: Math.round(r.dist * 10) / 10, pts, d })));
        if (v.length <= max) break;
        const M = L; L = M.filter((_, i) => i % 2 === 0 || i === M.length - 1); v = '';
      }
      return v;
    } catch (e) { return ''; }
  }
  function traceLine(o) {
    if (o.v === 2 && o.d) { const out = []; let a = 0, b = 0; for (let i = 0; i + 1 < o.d.length; i += 2) { a += o.d[i]; b += o.d[i + 1]; out.push([b / 1e4, a / 1e4]); } return out; }
    if (o.r && o.r.legs) return o.r.legs.map(l => [l.lon, l.lat]);
    return null;
  }
  function clearTraceLine() { const s = map.getSource('trace-saved'); if (s) s.setData(EMPTY); }
  async function openRoute(o) {
    try {
      const line = o && traceLine(o);
      if (!o || !o.pts || o.pts.length < 2 || !line || line.length < 2) return false;
      el('reset').click();
      const P = o.pts;
      setPoint('start', { lat: P[0][0], lng: P[0][1] });
      P.slice(1, -1).forEach(q => addVia({ lat: q[0], lon: q[1] }));
      setPoint('end', { lat: P[P.length - 1][0], lng: P[P.length - 1][1] });
      const geo = { type: 'Feature', geometry: { type: 'LineString', coordinates: line }, properties: {} };
      if (!map.getSource('trace-saved')) {
        map.addSource('trace-saved', { type: 'geojson', data: geo });
        map.addLayer({ id: 'trace-saved', type: 'line', source: 'trace-saved', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#b8322a', 'line-width': 3.5, 'line-opacity': 0.75 } });
      } else map.getSource('trace-saved').setData(geo);
      const bb = line.reduce((a, q) => [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[0]), Math.max(a[3], q[1])], [180, 90, -180, -90]);
      const ph = isMobile() ? panel.getBoundingClientRect().height : 0, pw = !isMobile() ? panel.getBoundingClientRect().right : 0;
      map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: { top: 70, bottom: Math.min(ph + 30, innerHeight * 0.6), left: pw + 60, right: 100 }, duration: 0, maxZoom: 13 });
      say(`« ${o.name || 'Trace'} »${o.dist ? ` · ${nf0.format(o.dist)} M` : ''}. Touchez « Calculer la route » pour la calculer avec la météo actuelle.`);
      return true;
    } catch (e) { return false; }
  }
  clearSavedRoute(); // ancienne « dernière route » gardée à la racine : plus utilisée

  // ---------- Traces : 5 routes au maximum, dans des cookies (2 400 caractères au plus par trace) ----------
  const TRK = 'tk', TRMAX = 5, TRP = 'Path=/; Secure; SameSite=Lax', TRMAXLEN = 2400;
  // Anciens essais rangés sous /traces/ (le serveur interdit de les relire) : effacés
  for (let k = 0; k < TRMAX; k++) { for (let i = 0; i < 4; i++) document.cookie = `${TRK}${k}_${i}=; Max-Age=0; Path=/traces/; Secure; SameSite=Lax`; document.cookie = `${TRK}${k}n=; Max-Age=0; Path=/traces/; Secure; SameSite=Lax`; }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function trCookies() {
    return Promise.resolve(Object.fromEntries(document.cookie.split('; ').filter(Boolean).map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; })));
  }
  async function trList() {
    const C = await trCookies(), out = [];
    for (let k = 0; k < TRMAX; k++) {
      const n = +C[`${TRK}${k}n`]; if (!n) continue;
      let v = ''; for (let i = 0; i < n; i++) { if (C[`${TRK}${k}_${i}`] == null) { v = ''; break; } v += C[`${TRK}${k}_${i}`]; }
      if (!v) continue;
      try { const o = JSON.parse(await zip(unb64u(v), true)); out.push({ k, o }); } catch (e) {}
    }
    return out.sort((a, b) => b.o.at - a.o.at);
  }
  function trDel(k, n) {
    for (let i = 0; i < Math.max(n || 0, 4); i++) document.cookie = `${TRK}${k}_${i}=; Max-Age=0; ${TRP}`;
    document.cookie = `${TRK}${k}n=; Max-Age=0; ${TRP}`;
  }
  function trDefName() {
    const r = last; if (!r) return '';
    const d = timeAt(r.h0);
    return `Trace du ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${nf0.format(r.dist)} M`;
  }
  let trItems = [];
  async function trRender() {
    trItems = await trList();
    const can = !!(last && last.legs);
    el('tr-save').hidden = !can;
    const ul = el('tr-list');
    ul.innerHTML = trItems.length ? trItems.map((t, i) => {
      const d = new Date(t.o.at);
      return `<li><div class="tr-txt"><b>${esc(t.o.name || 'Trace')}</b><small>enregistrée le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}${t.o.dist ? ` · ${nf0.format(t.o.dist)} M` : ''}</small></div><button type="button" class="btn tr-open" data-i="${i}">Ouvrir</button><button type="button" class="btn tr-del" data-i="${i}">Supprimer</button></li>`;
    }).join('') : '<li class="tr-empty">Aucune trace enregistrée.</li>';
    if (!can && !trItems.length) el('tr-msg').textContent = 'Calculez une route, puis revenez ici pour enregistrer sa trace.';
  }
  async function trOpenSheet() {
    el('tr-msg').textContent = ''; el('tr-msg').classList.remove('err');
    el('tr-name').value = trDefName();
    el('tr-back').hidden = false; el('trace-btn').setAttribute('aria-pressed', 'true');
    await trRender();
  }
  function trCloseSheet() { el('tr-back').hidden = true; el('trace-btn').setAttribute('aria-pressed', 'false'); }
  el('trace-btn').addEventListener('click', () => (el('tr-back').hidden ? trOpenSheet() : trCloseSheet()));
  el('tr-close').addEventListener('click', trCloseSheet);
  el('tr-back').addEventListener('click', e => { if (e.target === el('tr-back')) trCloseSheet(); });
  el('tr-save-btn').addEventListener('click', async () => {
    const msg = el('tr-msg'); msg.classList.remove('err');
    if (!last || !last.legs) return;
    const used = new Set(trItems.map(t => t.k));
    let k = -1; for (let i = 0; i < TRMAX; i++) if (!used.has(i)) { k = i; break; }
    if (k < 0) { msg.textContent = '5 traces au maximum : supprimez-en une pour enregistrer celle-ci.'; msg.classList.add('err'); return; }
    const name = el('tr-name').value.trim().slice(0, 50) || trDefName();
    const v = await packTrace(last, name, TRMAXLEN);
    if (!v) { msg.textContent = 'Trace non enregistrée.'; msg.classList.add('err'); return; }
    // Le serveur refuse les pages si les cookies dépassent environ 16 000 caractères : marge gardée
    if (document.cookie.length + v.length > 14000) { msg.textContent = 'Plus de place sur cet appareil : supprimez une trace.'; msg.classList.add('err'); return; }
    trDel(k);
    const n = Math.ceil(v.length / 3000);
    for (let i = 0; i < n; i++) document.cookie = `${TRK}${k}_${i}=${v.slice(i * 3000, (i + 1) * 3000)}; Max-Age=31536000; ${TRP}`;
    document.cookie = `${TRK}${k}n=${n}; Max-Age=31536000; ${TRP}`;
    await trRender();
    msg.textContent = trItems.some(t => t.k === k) ? `« ${name} » enregistrée.` : 'Trace non enregistrée.';
  });
  el('tr-list').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    const t = trItems[+b.dataset.i]; if (!t) return;
    if (b.classList.contains('tr-del')) {
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Confirmer'; return; }
      trDel(t.k, 8); await trRender(); el('tr-msg').textContent = 'Trace supprimée.'; return;
    }
    trCloseSheet();
    const ok = await openRoute(t.o);
    if (!ok) say('Trace illisible.', true);
  });

  function buildGpx() {
    const r = last; if (!r) return false;
    let pts = r.wp || r.legs;
    if (pts.length > 450) { const k = Math.ceil(pts.length / 450), L = pts.length; pts = pts.filter((_, i) => i % k === 0 || i === L - 1); }
    const iso = d => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const z = n => String(n).padStart(2, '0');
    const name = d => `T38 ${z(d.getDate())}/${z(d.getMonth() + 1)} ${z(d.getHours())}h${z(d.getMinutes())}`;
    const rte = pts.map(n => `  <rtept lat="${n.lat.toFixed(5)}" lon="${n.lon.toFixed(5)}"><time>${iso(timeAt(n.h))}</time><name>${name(timeAt(n.h))}</name></rtept>`).join('\n');
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Routage" xmlns="http://www.topografix.com/GPX/1/1">\n <rte>\n  <name>${OPT.pk === 'x' ? PX_NAME.replace(/[<&>]/g, '') : 'Tiki 38'} ${r.model} ${name(r.tStart)}</name>\n${rte}\n </rte>\n</gpx>\n`;
    const t0 = r.tStart; const fname = `${OPT.pk === 'x' ? PX_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'bateau' : 'tiki38'}_${r.model.toLowerCase()}_${z(t0.getDate())}${z(t0.getMonth() + 1)}_${z(t0.getHours())}${z(t0.getMinutes())}.gpx`;
    lastGpx = { gpx, fname };
    return true;
  }
  el('gpx').addEventListener('click', () => { if (buildGpx()) exportGpx(); });

  let lastGpx = null;
  function downloadGpx() {
    // Heure de l'export dans le nom : chaque fichier est neuf, Android affiche toujours la notification
    const n = new Date(), z2 = v => String(v).padStart(2, '0');
    const fname = lastGpx.fname.replace(/\.gpx$/, `_export-${z2(n.getHours())}h${z2(n.getMinutes())}m${z2(n.getSeconds())}.gpx`);
    const { gpx } = lastGpx; lastGpx.cur = fname;
    const gn = el('gpx-name'); if (gn) gn.textContent = fname;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
    a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    const ok = el('gpx-ok');
    if (ok) {
      ok.hidden = false;
      ok.innerHTML = matchMedia('(pointer: coarse)').matches
        ? `Fichier téléchargé : touchez la notification en haut de l'écran, ou Fichiers › Téléchargements.`
        : `Fichier enregistré dans Téléchargements.`;
    }
  }
  // Chrome Android refuse de partager les fichiers .gpx : on le détecte pour ne pas proposer un bouton qui échoue
  function canShareGpx() {
    if (!navigator.share || !navigator.canShare) return false;
    try { return ['application/gpx+xml', 'application/octet-stream', 'text/plain'].some(type => navigator.canShare({ files: [new File(['x'], 'a.gpx', { type })] })); } catch (e) { return false; }
  }
  async function shareGpx() {
    const { gpx } = lastGpx, fname = lastGpx.cur || lastGpx.fname;
    if (navigator.share && navigator.canShare) {
      for (const type of ['application/gpx+xml', 'application/octet-stream', 'text/plain']) {
        const f = new File([gpx], fname, { type });
        if (!navigator.canShare({ files: [f] })) continue;
        try { await navigator.share({ files: [f], title: fname }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; break; }
      }
    }
    const qs = el('q-share'), sm = qs.querySelector('small'); sm.textContent = 'Indisponible';
    setTimeout(() => { sm.textContent = 'Partager'; }, 2500);
  }
  // Bouton « Partager » seul, à côté d'« Enregistrer » : seulement si le téléphone accepte le partage du fichier
  // Partager retiré : Chrome Android refuse d'envoyer les fichiers .gpx (« Indisponible »)
  el('q-share').addEventListener('click', () => {
    if (!buildGpx()) return;
    const n = new Date(), z2 = v => String(v).padStart(2, '0');
    lastGpx.cur = lastGpx.fname.replace(/\.gpx$/, `_export-${z2(n.getHours())}h${z2(n.getMinutes())}m${z2(n.getSeconds())}.gpx`);
    shareGpx();
  });
  // Dans l'application Android : vrai « Ouvrir avec » (Navionics, TZ iBoat…)
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (NATIVE) el('gpx').innerHTML = 'Ouvrir avec<small>GPX</small>';
  function exportGpx() {
    if (NATIVE) {
      const n = new Date(), z2 = v => String(v).padStart(2, '0');
      const name = lastGpx.fname.replace(/\.gpx$/, `_export-${z2(n.getHours())}h${z2(n.getMinutes())}m${z2(n.getSeconds())}.gpx`);
      const P = window.Capacitor.Plugins && window.Capacitor.Plugins.GpxOpen;
      const call = P ? P.open({ name, data: lastGpx.gpx }) : window.Capacitor.nativePromise('GpxOpen', 'open', { name, data: lastGpx.gpx });
      Promise.resolve(call).catch(e => say((e && e.message) || 'Ouverture impossible.'));
      return;
    }
    // « Enregistrer » : téléchargement direct, rien d'autre
    downloadGpx();
    const b = el('gpx'); b.innerHTML = 'Enregistré<small>GPX</small>';
    clearTimeout(exportGpx.t); exportGpx.t = setTimeout(() => { b.innerHTML = 'Enregistrer<small>GPX</small>'; }, 3000);
  }
  el('gpx-dl').addEventListener('click', downloadGpx);
  el('gpx-share').addEventListener('click', shareGpx);
  el('gpx-copy').addEventListener('click', async () => {
    if (!lastGpx) return;
    let ok = false;
    try { await navigator.clipboard.writeText(lastGpx.gpx); ok = true; } catch (e) {
      const t = document.createElement('textarea'); t.value = lastGpx.gpx; document.body.appendChild(t); t.select();
      try { ok = document.execCommand('copy'); } catch (e2) {} t.remove();
    }
    el('gpx-copy').textContent = ok ? 'Copié' : 'Copie impossible';
    setTimeout(() => { el('gpx-copy').textContent = 'Copier le GPX'; }, 2500);
  });

  refresh();
})();
// Bouton Reset à côté de « Calculer la route » : même effet que « Recommencer »
document.getElementById('reset-top').addEventListener('click', () => document.getElementById('reset').click());
document.getElementById('q-reset').addEventListener('click', () => document.getElementById('reset').click());
// Bouton « Comparer deux modèles » : ouvre la comparaison et la fait défiler à l'écran
document.getElementById('cmp-jump').addEventListener('click', () => {
  const box = document.getElementById('cmp-box');
  if (window.__setTab) window.__setTab('resume');
  box.open = true;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => document.getElementById('cmp-model').focus({ preventScroll: true }), 400);
});

// Bandeau de la carte marine sous celui des vagues ou du courant : le choix Balises / Seamap / SHOM reste toujours accessible
(() => {
  const c = document.getElementById('chart-legend'); if (!c) return;
  const others = ['wave-legend', 'cur-legend'].map(id => document.getElementById(id)).filter(Boolean);
  const place = () => {
    let top = 10;
    for (const e of others) if (!e.hidden && e.getClientRects().length) top = Math.max(top, e.getBoundingClientRect().bottom + 6);
    c.style.top = top + 'px';
  };
  const mo = new MutationObserver(() => requestAnimationFrame(place));
  for (const e of [c, ...others]) mo.observe(e, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', place); place();
})();
