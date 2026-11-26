/* Leonida Fieldnotes — Premium unlock + completion dashboard.
   Self-contained: reads the notebook (leonida-fieldnotes:v1) read-only for progress,
   stores unlock state under its own key, and validates codes against SHA-256 hashes
   shipped in data/premium-codes.json. No code plaintext ever ships with the site. */
(() => {
  'use strict';
  const PREMIUM_KEY = 'leonida-fieldnotes:premium';
  const NOTEBOOK_KEY = 'leonida-fieldnotes:v1';
  const BUY_URL = 'https://buy.stripe.com/bJeaEW6j07Kxfje4d133W00'; // Set to the live Stripe payment link when payments open.
  const PRICE = '$6.99 one-time';

  const $ = s => document.querySelector(s);
  const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  const normalize = code => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function loadPremium() { try { return JSON.parse(localStorage.getItem(PREMIUM_KEY) || 'null'); } catch { return null; } }
  function savePremium(v) { try { localStorage.setItem(PREMIUM_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  function isUnlocked() { const p = loadPremium(); return !!(p && p.unlocked); }

  async function hashSet() {
    const res = await fetch('data/premium-codes.json');
    const store = await res.json();
    const set = new Set();
    for (const b of store.batches || []) for (const h of b.hashes || []) set.add(h);
    return set;
  }

  function foundIds() {
    try {
      const s = JSON.parse(localStorage.getItem(NOTEBOOK_KEY) || 'null');
      return new Set(Array.isArray(s && s.found) ? s.found : []);
    } catch { return new Set(); }
  }

  const CAT_LABELS = { 'region': 'Regions', 'easter-egg': 'Easter eggs', 'hidden-location': 'Hidden locations', 'vehicle': 'Free & standout vehicles', 'garage': 'Garages & properties', 'money': 'Money making', 'collectible': 'Collectibles', 'service': 'Services & unlocks' };

  async function renderDashboard(box) {
    box.replaceChildren(make('p', 'muted', 'Loading your completion…'));
    try {
      const [guides, community] = await Promise.all([
        fetch('data/guides.json').then(r => r.json()),
        fetch('data/community.json').then(r => r.json()),
      ]);
      const found = foundIds();
      const rows = [];
      const byCat = new Map();
      for (const e of guides.entries) { if (!byCat.has(e.category)) byCat.set(e.category, []); byCat.get(e.category).push({ id: e.id, name: e.name }); }
      let totalAll = 0, foundAll = 0;
      for (const [cat, entries] of byCat) {
        const f = entries.filter(en => found.has(en.id)).length;
        rows.push({ label: CAT_LABELS[cat] || cat, found: f, total: entries.length, entries });
        totalAll += entries.length; foundAll += f;
      }
      const lm = community.locations.map(l => ({ id: l.id, name: l.name })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      const lf = lm.filter(en => found.has(en.id)).length;
      rows.push({ label: 'Community landmarks', found: lf, total: lm.length, entries: lm });
      totalAll += lm.length; foundAll += lf;

      const openPlace = id => {
        const dialog = document.querySelector('#premium-dialog');
        if (dialog && dialog.open) dialog.close();
        const target = 'place=' + encodeURIComponent(id);
        if (location.hash === '#' + target) window.dispatchEvent(new HashChangeEvent('hashchange'));
        else location.hash = target;
      };

      box.replaceChildren();
      const pct = totalAll ? Math.round(1000 * foundAll / totalAll) / 10 : 0;
      box.append(make('h3', '', `Leonida completion: ${pct}%`));
      box.append(make('p', 'muted', `${foundAll} of ${totalAll} discoveries marked found in this browser's notebook.`));
      for (const r of rows) {
        const row = make('div', 'premium-row');
        const p = r.total ? Math.round(100 * r.found / r.total) : 0;
        row.append(make('span', 'premium-row-label', `${r.label}`), make('span', 'premium-row-count', `${r.found}/${r.total} · ${p}%`));
        const bar = make('div', 'premium-bar'); const fill = make('div', 'premium-bar-fill'); fill.style.width = p + '%'; bar.append(fill); row.append(bar);
        const details = make('details', 'premium-checklist');
        details.append(make('summary', '', `Entry checklist (${r.total})`));
        const listBox = make('div', 'premium-entries');
        details.append(listBox);
        let built = false;
        details.addEventListener('toggle', () => {
          if (!details.open || built) return;
          built = true;
          for (const en of r.entries) {
            const isFound = found.has(en.id);
            const item = make('button', 'premium-entry' + (isFound ? ' is-found' : ''), `${isFound ? '✓ ' : ''}${en.name}`);
            item.type = 'button';
            item.addEventListener('click', () => openPlace(en.id));
            listBox.append(item);
          }
        });
        row.append(details);
        box.append(row);
      }
    } catch { box.replaceChildren(make('p', 'muted', 'Completion could not be loaded right now.')); }
  }

  function render() {
    const status = $('#premium-status'), dash = $('#premium-dashboard'), form = $('#premium-form'), buy = $('#premium-buy');
    if (!status) return;
    document.querySelectorAll('.premium-open').forEach(b => { b.textContent = isUnlocked() ? 'Premium ✓' : 'Premium'; });
    if (isUnlocked()) {
      status.replaceChildren(make('p', '', 'Premium is unlocked on this browser. Thank you for supporting an independent fan project.'));
      form.hidden = true; buy.hidden = true;
      renderDashboard(dash);
    } else {
      status.replaceChildren(
        make('p', '', `Premium is ${PRICE}. It unlocks the Leonida completion dashboard — per-category progress across every guide and landmark — and removes ads if they are ever added. The map and every guide stay free, always.`),
        make('p', 'muted', 'One code unlocks Premium in this browser. Payment is handled by our payment provider; we never see your card details.'),
      );
      form.hidden = false;
      buy.replaceChildren();
      if (BUY_URL) { const a = make('a', 'primary-button', 'Buy an unlock code'); a.href = BUY_URL; a.rel = 'noopener'; buy.append(a); }
      else buy.append(make('p', 'muted', 'Unlock codes go on sale as soon as our payment link is live. If you already have a code, enter it below.'));
      buy.hidden = false;
      dash.replaceChildren();
    }
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    const input = $('#premium-code'), msg = $('#premium-result');
    const code = normalize(input.value);
    if (!code) { msg.textContent = 'Enter your unlock code.'; return; }
    msg.textContent = 'Checking…';
    try {
      const set = await hashSet();
      if (set.has(await sha256(code))) {
        savePremium({ unlocked: true, at: new Date().toISOString() });
        msg.textContent = 'Premium unlocked. Welcome in.';
        render();
      } else msg.textContent = 'That code was not recognised. Check it and try again.';
    } catch { msg.textContent = 'Could not check the code right now — try again in a moment.'; }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const dialog = $('#premium-dialog');
    if (!dialog) return;
    document.querySelectorAll('.premium-open').forEach(b => b.addEventListener('click', () => { render(); dialog.showModal(); }));
    const form = $('#premium-form');
    if (form) form.addEventListener('submit', onSubmit);
    render();
  });
})();
