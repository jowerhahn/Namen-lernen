/* Namen lernen – Web-App. Alle Daten bleiben im Browser (IndexedDB) auf dem Gerät. */
(() => {
  'use strict';
  const VERSION = '0.1.1';
  const $ = id => document.getElementById(id);

  // ---------- Speicher (IndexedDB) ----------
  const DB_NAME = 'namen-lernen', STORE = 'contacts';
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(STORE, mode), s = t.objectStore(STORE);
      const out = fn(s);
      t.oncomplete = () => res(out && 'result' in out ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  }
  const dbAll = () => tx('readonly', s => s.getAll());
  const dbPut = c => tx('readwrite', s => { s.put(c); });
  const dbPutMany = cs => tx('readwrite', s => { cs.forEach(c => s.put(c)); });
  const dbDel = id => tx('readwrite', s => { s.delete(id); });
  const dbClear = () => tx('readwrite', s => { s.clear(); });

  const settings = {
    get(k, d) { try { const v = localStorage.getItem('nl.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('nl.' + k, JSON.stringify(v)); } catch {} }
  };

  let contacts = [];
  async function reload() { contacts = await dbAll(); renderAll(); }

  // ---------- Namen vergleichen ----------
  const norm = s => (s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/ı/g, 'i').replace(/ł/g, 'l').replace(/ø/g, 'o')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s-]/g, ' ').replace(/[-\s]+/g, ' ').trim();

  function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++)
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  const sim = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length, 1);

  function koeln(word) {
    const s = norm(word).replace(/\s/g, ''), v = 'aeijouy';
    let code = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i], p = s[i - 1] || '', n = s[i + 1] || '';
      let d = '';
      if (v.includes(c)) d = '0';
      else if (c === 'h') d = '';
      else if (c === 'b') d = '1';
      else if (c === 'p') d = n === 'h' ? '3' : '1';
      else if ('dt'.includes(c)) d = 'csz'.includes(n) ? '8' : '2';
      else if ('fvw'.includes(c)) d = '3';
      else if ('gkq'.includes(c)) d = '4';
      else if (c === 'c') {
        if (i === 0) d = 'ahkloqrux'.includes(n) ? '4' : '8';
        else d = ('sz'.includes(p) || !'ahkoqux'.includes(n)) ? '8' : '4';
      }
      else if (c === 'x') d = 'ckq'.includes(p) ? '8' : '48';
      else if (c === 'l') d = '5';
      else if ('mn'.includes(c)) d = '6';
      else if (c === 'r') d = '7';
      else if ('sz'.includes(c)) d = '8';
      code += d;
    }
    code = code.replace(/(.)\1+/g, '$1');
    return code ? code[0] + code.slice(1).replace(/0/g, '') : '';
  }
  const wordMatch = (w, t) => w === t || sim(w, t) >= 0.75 || (t.length > 2 && koeln(w) === koeln(t));

  function matches(c, heardList) {
    const mode = settings.get('mode', 'both');
    const first = norm(c.first).split(' ').filter(Boolean);
    const last = norm(c.last).split(' ').filter(Boolean);
    return heardList.some(h => {
      const hw = norm(h).split(' ').filter(Boolean);
      const has = ws => ws.length > 0 && ws.every(t => hw.some(w => wordMatch(w, t)));
      if (mode === 'first') return has(first.length ? first : last);
      if (mode === 'last') return has(last.length ? last : first);
      if (mode === 'any') return has(first) || has(last);
      return has(first.concat(last));
    });
  }

  // ---------- CSV-Import (Outlook) ----------
  function decode(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch { return new TextDecoder('windows-1252').decode(buf); }
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const head = text.slice(0, text.indexOf('\n') + 1 || text.length);
    const delim = [',', ';', '\t'].sort((a, b) => head.split(b).length - head.split(a).length)[0];
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(f); f = ''; if (row.some(x => x.trim())) rows.push(row); row = [];
      } else f += ch;
    }
    row.push(f); if (row.some(x => x.trim())) rows.push(row);
    return rows;
  }
  const COLS = {
    first: ['vorname', 'first name', 'firstname', 'given name', 'givenname'],
    last: ['nachname', 'last name', 'lastname', 'surname', 'family name', 'familyname'],
    company: ['firma', 'company', 'unternehmen', 'organization', 'organisation', 'company name', 'firmenname'],
    title: ['position', 'job title', 'jobtitle', 'title', 'berufsbezeichnung'],
    full: ['name', 'display name', 'anzeigename', 'full name', 'vollständiger name']
  };
  function contactsFromCSV(rows) {
    const h = rows[0].map(x => x.trim().toLowerCase());
    const col = key => h.findIndex(x => COLS[key].includes(x));
    const ci = { first: col('first'), last: col('last'), company: col('company'), title: col('title'), full: col('full') };
    if (ci.first < 0 && ci.last < 0 && ci.full < 0) throw new Error('In der Datei wurden keine Spalten für Vorname, Nachname oder Name gefunden.');
    const out = [];
    for (const r of rows.slice(1)) {
      const g = i => (i >= 0 ? (r[i] || '').trim() : '');
      let first = g(ci.first), last = g(ci.last);
      if (!first && !last && g(ci.full)) {
        const parts = g(ci.full).split(/\s+/); last = parts.pop(); first = parts.join(' ');
      }
      if (!first && !last) continue;
      out.push({ first, last, company: g(ci.company), title: g(ci.title) });
    }
    return out;
  }
  const keyOf = c => norm(`${c.first} ${c.last}`);
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  async function importCSV(file) {
    const rows = parseCSV(decode(await file.arrayBuffer()));
    if (rows.length < 2) throw new Error('Die Datei enthält keine Kontakte.');
    const found = contactsFromCSV(rows);
    const byKey = new Map(contacts.map(c => [keyOf(c), c]));
    let added = 0, updated = 0; const changed = [];
    for (const n of found) {
      const ex = byKey.get(keyOf(n));
      if (ex) {
        if ((n.company && n.company !== ex.company) || (n.title && n.title !== ex.title)) {
          ex.company = n.company || ex.company; ex.title = n.title || ex.title; changed.push(ex); updated++;
        }
      } else {
        const c = { id: newId(), ...n, photo: null, photoSource: null, pendingPhoto: null, pendingSource: null,
                    box: 1, right: 0, wrong: 0, lastSeen: 0, added: Date.now() };
        byKey.set(keyOf(c), c); changed.push(c); added++;
      }
    }
    await dbPutMany(changed);
    await reload();
    toast(`${added} neue Kontakte importiert` + (updated ? `, ${updated} aktualisiert` : '') + '.');
  }

  // ---------- Fotos ----------
  function loadImage(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Bild konnte nicht gelesen werden.')); i.src = src; });
  }
  // Quadratisch zuschneiden (bei Hochformat eher oben, wo das Gesicht ist), auf 480 px verkleinern.
  async function squarePhoto(src) {
    const img = await loadImage(src);
    const w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h);
    const sx = (w - s) / 2, sy = h > w ? Math.min((h - s) * 0.2, h - s) : 0;
    const out = 480, cv = document.createElement('canvas');
    cv.width = cv.height = out;
    cv.getContext('2d').drawImage(img, sx, sy, s, s, 0, 0, out, out);
    return cv.toDataURL('image/jpeg', 0.85);
  }
  const fileToDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });

  async function importPack(file) {
    const data = JSON.parse(decode(await file.arrayBuffer()));
    const list = Array.isArray(data) ? data : data.photos;
    if (!Array.isArray(list)) throw new Error('Das ist kein Fotopaket.');
    const byKey = new Map(contacts.map(c => [keyOf(c), c]));
    // Unbekannte Personen werden als neue Kontakte angelegt; so reicht ein Paket ohne CSV.
    let photos = 0, created = 0; const changed = [];
    for (const p of list) {
      if (!p.first && !p.last) continue;
      let c = byKey.get(keyOf(p)) || (p.id && contacts.find(x => x.id === p.id));
      if (!c) {
        c = { id: newId(), first: p.first || '', last: p.last || '', company: p.company || '', title: p.title || '',
              photo: null, photoSource: null, pendingPhoto: null, pendingSource: null,
              box: 1, right: 0, wrong: 0, lastSeen: 0, added: Date.now() };
        byKey.set(keyOf(c), c); created++;
      }
      if (p.image) { c.pendingPhoto = await squarePhoto(p.image); c.pendingSource = p.source || null; photos++; }
      changed.push(c);
    }
    await dbPutMany(changed);
    await reload();
    toast(`${photos} Fotos geladen` + (created ? `, ${created} neue Kontakte angelegt` : '') + (photos ? '. Bitte bestätigen.' : '.'));
  }

  // ---------- Ansichten ----------
  function show(view) {
    ['home', 'contacts', 'settings'].forEach(v => $('view-' + v).classList.toggle('hidden', v !== view));
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
    settings.set('view', view);
  }
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => show(b.dataset.v));

  const initials = c => ((c.first[0] || '') + (c.last[0] || '')).toUpperCase();
  const fullName = c => `${c.first} ${c.last}`.trim();
  const withPhoto = () => contacts.filter(c => c.photo);

  function renderAll() { renderHome(); renderList(); }

  function renderHome() {
    const wp = withPhoto(), pend = contacts.filter(c => c.pendingPhoto);
    $('st-total').textContent = contacts.length;
    $('st-photo').textContent = wp.length;
    $('st-known').textContent = wp.filter(c => c.box >= 4).length;
    $('home-empty').classList.toggle('hidden', contacts.length > 0);
    $('home-pending').classList.toggle('hidden', !pend.length);
    $('pending-count').textContent = pend.length;
    $('home-nophoto').classList.toggle('hidden', !contacts.length || wp.length > 0);
    $('btn-start').disabled = !wp.length;
    $('round-info').textContent = wp.length ? `Eine Runde zeigt bis zu ${settings.get('size', 20)} Gesichter, schwierige zuerst.` : '';
  }

  let filter = 'all';
  document.querySelectorAll('.filter .chip').forEach(b => b.onclick = () => {
    filter = b.dataset.f;
    document.querySelectorAll('.filter .chip').forEach(x => x.classList.toggle('on', x === b));
    renderList();
  });
  $('search').oninput = () => renderList();

  function renderList() {
    const q = norm($('search').value);
    let list = contacts.slice();
    if (filter === 'nophoto') list = list.filter(c => !c.photo);
    if (filter === 'weak') list = list.filter(c => c.wrong > 0).sort((a, b) => (b.wrong - b.right) - (a.wrong - a.right));
    else list.sort((a, b) => (a.last || a.first).localeCompare(b.last || b.first, 'de'));
    if (q) list = list.filter(c => norm(`${c.first} ${c.last} ${c.company}`).includes(q));
    const ul = $('list'); ul.innerHTML = '';
    for (const c of list.slice(0, 500)) {
      const li = document.createElement('li');
      const th = c.photo ? Object.assign(document.createElement('img'), { src: c.photo, className: 'thumb', alt: '' })
                         : Object.assign(document.createElement('div'), { className: 'thumb', textContent: initials(c) });
      const who = document.createElement('div'); who.className = 'who';
      const nm = document.createElement('div'); nm.textContent = fullName(c);
      if (c.pendingPhoto) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'Foto prüfen'; nm.append(' ', b); }
      const sm = document.createElement('small'); sm.textContent = c.company || '';
      who.append(nm, sm);
      const mk = document.createElement('span'); mk.className = 'mark';
      if (c.right || c.wrong) { mk.textContent = `${c.right}✓ ${c.wrong}✗`; mk.className += c.wrong > c.right ? ' bad' : ' ok'; }
      li.append(th, who, mk);
      li.onclick = () => openDetail(c.id);
      ul.appendChild(li);
    }
    if (!list.length) { const li = document.createElement('li'); li.textContent = contacts.length ? 'Keine Treffer.' : 'Noch keine Kontakte. Lade oben deine CSV-Datei aus Outlook.'; ul.appendChild(li); }
  }

  // ---------- Kontakt bearbeiten ----------
  let detailId = null;
  function openDetail(id) {
    const c = contacts.find(x => x.id === id); if (!c) return;
    detailId = id;
    $('d-photo').src = c.photo || ''; $('d-photo').classList.toggle('hidden', !c.photo);
    $('d-initials').textContent = c.photo ? '' : initials(c);
    $('d-name').textContent = fullName(c);
    $('d-company').textContent = [c.title, c.company].filter(Boolean).join(', ');
    $('d-stats').textContent = (c.right || c.wrong) ? `${c.right}× gewusst, ${c.wrong}× falsch` : 'Noch nicht geübt';
    $('d-remove').classList.toggle('hidden', !c.photo);
    $('detail').classList.remove('hidden');
  }
  $('d-close').onclick = () => $('detail').classList.add('hidden');
  $('file-photo').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const c = contacts.find(x => x.id === detailId); if (!c) return;
    try { c.photo = await squarePhoto(await fileToDataURL(f)); c.photoSource = 'eigenes Foto'; await dbPut(c); await reload(); openDetail(c.id); }
    catch (err) { toast(err.message); }
  };
  $('d-search').onclick = () => {
    const c = contacts.find(x => x.id === detailId); if (!c) return;
    window.open('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(`${fullName(c)} ${c.company || ''}`.trim()), '_blank');
  };
  $('d-remove').onclick = async () => {
    const c = contacts.find(x => x.id === detailId); if (!c) return;
    c.photo = null; c.photoSource = null; await dbPut(c); await reload(); openDetail(c.id);
  };
  $('d-delete').onclick = async () => {
    const c = contacts.find(x => x.id === detailId); if (!c) return;
    if (!confirm(`${fullName(c)} wirklich löschen?`)) return;
    await dbDel(c.id); $('detail').classList.add('hidden'); await reload();
  };

  // ---------- Fotos bestätigen ----------
  let confirmQueue = [];
  function openConfirm() {
    confirmQueue = contacts.filter(c => c.pendingPhoto).map(c => c.id);
    if (!confirmQueue.length) return;
    $('confirm').classList.remove('hidden'); showConfirm();
  }
  function showConfirm() {
    const c = contacts.find(x => x.id === confirmQueue[0]);
    if (!c) { $('confirm').classList.add('hidden'); renderAll(); return; }
    $('c-progress').textContent = `noch ${confirmQueue.length}`;
    $('c-name').textContent = fullName(c);
    $('c-company').textContent = [c.title, c.company].filter(Boolean).join(', ');
    $('c-photo').src = c.pendingPhoto;
    let src = ''; try { src = c.pendingSource ? 'Quelle: ' + new URL(c.pendingSource).hostname : ''; } catch { src = c.pendingSource || ''; }
    $('c-source').textContent = src;
  }
  async function decide(ok) {
    const id = confirmQueue.shift(); const c = contacts.find(x => x.id === id); if (!c) return showConfirm();
    if (ok) { c.photo = c.pendingPhoto; c.photoSource = c.pendingSource; }
    c.pendingPhoto = null; c.pendingSource = null;
    await dbPut(c); renderAll(); showConfirm();
  }
  $('btn-confirm').onclick = openConfirm;
  $('c-yes').onclick = () => decide(true);
  $('c-no').onclick = () => decide(false);
  $('c-close').onclick = () => { $('confirm').classList.add('hidden'); renderAll(); };

  // ---------- Spracherkennung (Safari/iPhone) ----------
  // Safari bricht neue Instanzen oft sofort ab und liefert häufig nur Zwischenergebnisse.
  // Daher: eine Instanz wiederverwenden, Zwischenergebnis nach 1,2 s Stille werten,
  // nach sofortigem Abbruch einmal neu starten.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speech = {
    rec: null, listening: false, pending: [], gotFinal: false, done: false, startedAt: 0, retried: false,
    userStopped: false, silence: null, safety: null, session: 0, onHeard: null, lastError: null,
    setup() {
      const r = this.rec = new SR();
      r.lang = 'de-DE'; r.interimResults = true; r.maxAlternatives = 5; r.continuous = false;
      r.onstart = () => { this.listening = true; $('q-mic').classList.add('listening'); status('Ich höre zu … sprich jetzt.'); };
      r.onresult = e => {
        const res = e.results[e.results.length - 1];
        const alts = Array.from(res).map(a => a.transcript.trim()).filter(Boolean);
        if (!alts.length) return;
        this.pending = alts; $('q-live').textContent = alts[0];
        if (res.isFinal) { this.gotFinal = true; this.deliver(); this.stop(); return; }
        clearTimeout(this.silence); this.silence = setTimeout(() => this.stop(), 1200);
      };
      r.onerror = e => { this.lastError = e.error; };
      r.onend = () => {
        clearTimeout(this.silence); clearTimeout(this.safety);
        this.listening = false; $('q-mic').classList.remove('listening');
        const err = this.lastError; this.lastError = null;
        if (this.pending.length) { this.deliver(); return; }
        if (this.done) return;
        if (err === 'aborted' && !this.retried && !this.userStopped && performance.now() - this.startedAt < 1500) {
          this.retried = true; setTimeout(() => this.begin(), 250); return;
        }
        status({ 'not-allowed': 'Mikrofon nicht erlaubt. Bitte in Safari erlauben.',
                 'service-not-allowed': 'Spracherkennung gesperrt. Nutze das Diktierfeld.',
                 'network': 'Keine Verbindung zur Spracherkennung.' }[err] || 'Nichts verstanden. Nochmal tippen oder diktieren.');
      };
    },
    deliver() {
      if (this.done || !this.pending.length) return;
      this.done = true; const alts = this.pending; this.pending = [];
      this.onHeard && this.onHeard(alts);
    },
    begin() {
      this.pending = []; this.gotFinal = false; this.userStopped = false; this.startedAt = performance.now();
      const my = ++this.session;
      try { this.rec.start(); } catch { status('Start fehlgeschlagen. Nochmal tippen.'); return; }
      clearTimeout(this.safety);
      this.safety = setTimeout(() => { if (this.listening && my === this.session) this.stop(); }, 8000);
    },
    stop() { clearTimeout(this.silence); clearTimeout(this.safety); if (this.rec && this.listening) { try { this.rec.stop(); } catch {} } },
    toggle(onHeard) {
      if (!SR) { status('Spracherkennung nicht verfügbar. Nutze das Diktierfeld.'); return; }
      if (this.listening) { this.userStopped = true; this.stop(); return; }
      if (!this.rec) this.setup();
      this.onHeard = onHeard; this.done = false; this.retried = false; $('q-live').textContent = '';
      this.begin();
    },
    cancel() { this.done = true; this.userStopped = true; this.stop(); }
  };
  const status = t => { $('q-status').textContent = t; };

  // ---------- Übungsrunde ----------
  let round = [], pos = 0, results = [], answered = false, requeued = new Set(), advanceTimer = null;

  function buildRound() {
    const size = Number(settings.get('size', 20));
    const pool = withPhoto();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    // Niedrige Lernstufe zuerst, lange nicht gesehene bevorzugt.
    pool.sort((a, b) => (a.box - b.box) || (a.lastSeen - b.lastSeen) * 0.000001);
    return pool.slice(0, size).map(c => c.id);
  }
  function startRound() {
    round = buildRound(); if (!round.length) return;
    pos = 0; results = []; requeued = new Set(); $('toast').classList.add('hidden');
    $('summary').classList.add('hidden'); $('quiz').classList.remove('hidden');
    showCard();
  }
  function current() { return contacts.find(c => c.id === round[pos]); }
  function showCard() {
    clearTimeout(advanceTimer);
    const c = current(); if (!c) return finishRound();
    answered = false;
    $('q-progress').textContent = `${pos + 1} / ${round.length}`;
    $('q-name').textContent = fullName(c); $('q-name').className = 'qname';
    $('q-photo').src = c.photo;
    $('q-check').classList.add('hidden');
    $('q-live').textContent = ''; $('q-typed').value = '';
    status('Tippe aufs Mikrofon und sag den Namen.');
    $('q-answer').classList.remove('hidden'); $('q-next').classList.add('hidden');
  }
  async function answer(alts, how) {
    if (answered) return;
    const c = current(); if (!c) return;
    answered = true; speech.cancel();
    const ok = alts !== null && matches(c, alts);
    if (alts && alts[0]) status(`Gehört: „${alts[0]}“`);
    c.lastSeen = Date.now();
    if (ok) { c.right++; c.box = Math.min(5, c.box + 1); }
    else { c.wrong++; c.box = 1; }
    await dbPut(c);
    results.push({ id: c.id, ok, heard: alts ? alts[0] : '' });
    if (ok) {
      $('q-check').classList.remove('hidden');
      $('q-answer').classList.add('hidden');
      advanceTimer = setTimeout(next, 1100);
    } else {
      $('q-name').className = 'qname show wrong';
      if (!alts) status('');
      $('q-answer').classList.add('hidden'); $('q-next').classList.remove('hidden');
      // Falsche Gesichter kommen am Ende der Runde noch einmal.
      if (!requeued.has(c.id)) { requeued.add(c.id); round.push(c.id); }
    }
  }
  function next() { pos++; if (pos < round.length) showCard(); else finishRound(); }
  function finishRound() {
    speech.cancel(); clearTimeout(advanceTimer);
    $('quiz').classList.add('hidden');
    // Erstes Ergebnis je Person zählt.
    const first = new Map(); results.forEach(r => { if (!first.has(r.id)) first.set(r.id, r); });
    const res = [...first.values()], hits = res.filter(r => r.ok).length;
    $('sum-title').textContent = res.length ? `${hits} von ${res.length} gewusst` : 'Runde beendet';
    $('sum-sub').textContent = res.length ? (hits === res.length ? 'Alle richtig!' : 'Die falschen kommen in der nächsten Runde wieder zuerst.') : '';
    const ul = $('sum-list'); ul.innerHTML = '';
    res.forEach(r => {
      const c = contacts.find(x => x.id === r.id); if (!c) return;
      const li = document.createElement('li');
      li.append(Object.assign(document.createElement('img'), { src: c.photo, className: 'thumb', alt: '' }));
      const who = document.createElement('div'); who.className = 'who'; who.textContent = fullName(c);
      const mk = document.createElement('span'); mk.className = 'mark ' + (r.ok ? 'ok' : 'bad'); mk.textContent = r.ok ? '✓' : '✗';
      li.append(who, mk); ul.appendChild(li);
    });
    $('summary').classList.remove('hidden');
    renderAll();
  }
  $('btn-start').onclick = startRound;
  $('q-mic').onclick = () => speech.toggle(alts => answer(alts, 'mikro'));
  $('q-check-btn').onclick = () => { const v = $('q-typed').value.trim(); $('q-typed').blur(); if (v) answer([v], 'diktat'); };
  $('q-typed').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('q-check-btn').click(); } });
  $('q-skip').onclick = () => answer(null, 'skip');
  $('q-next').onclick = next;
  $('q-close').onclick = finishRound;
  $('sum-again').onclick = startRound;
  $('sum-close').onclick = () => { $('summary').classList.add('hidden'); show('home'); };

  // ---------- Dateien laden ----------
  const handle = fn => async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { await fn(f); } catch (err) { toast(err.message || String(err)); }
  };
  $('file-csv').onchange = handle(importCSV);
  $('file-pack').onchange = handle(importPack);

  // ---------- Sicherung ----------
  $('btn-backup').onclick = async () => {
    const data = { type: 'namen-lernen-sicherung', version: 1, created: new Date().toISOString(), contacts };
    const name = `namen-lernen-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    } catch (err) { if (err && err.name === 'AbortError') return; }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
    document.body.appendChild(a); a.click(); a.remove();
  };
  $('file-backup').onchange = handle(async f => {
    const data = JSON.parse(decode(await f.arrayBuffer()));
    if (data.type !== 'namen-lernen-sicherung' || !Array.isArray(data.contacts)) throw new Error('Das ist keine Sicherung dieser App.');
    if (!confirm(`Sicherung mit ${data.contacts.length} Kontakten laden? Kontakte mit gleichem Namen werden überschrieben.`)) return;
    const byKey = new Map(contacts.map(c => [keyOf(c), c]));
    const merged = data.contacts.map(c => ({ ...c, id: (byKey.get(keyOf(c)) || c).id }));
    await dbPutMany(merged); await reload(); toast(`${merged.length} Kontakte aus der Sicherung geladen.`);
  });
  $('btn-wipe').onclick = async () => {
    if (!confirm('Wirklich alle Kontakte, Fotos und Lernstände löschen? Das lässt sich nicht rückgängig machen.')) return;
    await dbClear(); await reload(); toast('Alle Daten gelöscht.');
  };

  // ---------- Einstellungen ----------
  $('set-mode').value = settings.get('mode', 'both');
  $('set-mode').onchange = e => settings.set('mode', e.target.value);
  $('set-size').value = String(settings.get('size', 20));
  $('set-size').onchange = e => { settings.set('size', Number(e.target.value)); renderHome(); };
  $('version').textContent = VERSION;

  let toastTimer = null;
  function toast(t) {
    $('toast').textContent = t; $('toast').classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 4000);
  }

  // Dauerhaften Speicher anfragen, damit iOS die Daten nicht aufräumt.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  show(settings.get('view', 'home'));
  reload().catch(err => toast('Speicher nicht verfügbar: ' + err.message));

  window.__nl = { norm, koeln, matches, parseCSV, contactsFromCSV, settings };
})();
