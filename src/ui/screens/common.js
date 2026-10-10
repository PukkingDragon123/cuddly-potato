// Shared building blocks for the hub screens: lazy thumbnails, pixel vials,
// banners, swarm cards, reward tiles, number roll-ups, sparkles and the
// re-rendering modal "screen" wrapper.
import { h, icon, iconURL, button, modal, priceTag, toast, $overlay } from '../ui.js';
import { swarmThumb, charPortrait } from '../thumbs.js';
import { audio } from '../../core/audio.js';
import { fmt, fmtTime, shade, hexToCss } from '../../core/util.js';
import { state, owned, upgradeInfo, deployInfo } from '../../game/state.js';
import { SWARMS, RARITIES, VARIANTS, SERIES, ROLE_INFO } from '../../data/swarms.js';
import { SPELLS } from '../../data/spells.js';
import { COMMANDERS } from '../../data/commanders.js';
import { VIALS } from '../../data/vials.js';
import { BANNERS, SWARM_SKINS, LAB_SKINS, CMD_SKINS, PASS_TIERS } from '../../data/season.js';
import { TROPHY_ROAD } from '../../data/arena.js';

export { fmt, fmtTime };

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// ---------------------------------------------------------------------------
// Hub-private profile metadata (seen flags etc.). Lives in state.p.hub.

export function hubMeta() {
  const p = state.p;
  if (!p.hub || typeof p.hub !== 'object') p.hub = {};
  const m = p.hub;
  m.seenSwarms ??= {};
  m.seenCmds ??= {};
  m.megaDone ??= {};
  return m;
}

// ---------------------------------------------------------------------------
// Lazy thumbnails: rendering voxel thumbs is synchronous WebGL work, so spread
// it over frames (~10ms budget) and skip images that were removed meanwhile.

const thumbCache = new Map();
const jobs = new Map();
const queue = [];
let pumping = false;

function pump() {
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 10) {
    const job = queue.shift();
    jobs.delete(job.key);
    const live = job.imgs.filter((i) => i.isConnected);
    if (!live.length) continue;
    let url = null;
    try {
      url = job.gen();
    } catch (e) {
      console.warn('thumb failed', job.key, e);
    }
    thumbCache.set(job.key, url);
    for (const img of job.imgs) {
      if (url) img.src = url;
      img.classList.add('loaded');
    }
  }
  if (queue.length) requestAnimationFrame(pump);
  else pumping = false;
}

export function lazyImg(key, gen, cls = '') {
  const img = h('img', { class: 'thumb ' + cls, draggable: 'false', alt: '', src: BLANK });
  if (thumbCache.has(key)) {
    const u = thumbCache.get(key);
    if (u) img.src = u;
    img.classList.add('loaded');
    return img;
  }
  let job = jobs.get(key);
  if (!job) {
    job = { key, gen, imgs: [] };
    jobs.set(key, job);
    queue.push(job);
  }
  job.imgs.push(img);
  if (!pumping) {
    pumping = true;
    requestAnimationFrame(pump);
  }
  return img;
}

export function swarmImg(id, variant = 'base', skin = null, size = 96, cls = '') {
  return lazyImg(`s|${id}|${variant}|${skin}|${size}`, () => swarmThumb(id, variant, skin, size), cls);
}

export function cmdOverride(skinId) {
  const s = CMD_SKINS[skinId];
  if (!s) return null;
  const { name, commander, ...rest } = s;
  return rest;
}

export function charImg(charId, opts = {}, cls = '') {
  const o = { size: opts.size ?? 96, override: opts.override ?? null, eyes: opts.eyes, mouth: opts.mouth };
  return lazyImg(`c|${charId}|${o.size}|${JSON.stringify(o.override)}|${o.eyes}|${o.mouth}`, () => charPortrait(charId, o), cls);
}

export function cmdImg(cmdId, skinId = null, size = 96, cls = '') {
  const c = COMMANDERS[cmdId];
  return charImg(c?.char ?? 'recruit', { size, override: skinId ? cmdOverride(skinId) : null }, cls);
}

// ---------------------------------------------------------------------------
// Pixel-art vial (drawn on a tiny canvas from the vial's cap/liquid/label colours)

const vialCache = new Map();
export function vialURL(type) {
  if (vialCache.has(type)) return vialCache.get(type);
  const v = VIALS[type] || VIALS.lab;
  const c = document.createElement('canvas');
  c.width = 14;
  c.height = 26;
  const g = c.getContext('2d');
  const K = '#0d1029';
  const col = (hex) => hexToCss(hex);
  const px = (x, y, w, hh, fill) => {
    g.fillStyle = fill;
    g.fillRect(x, y, w, hh);
  };
  const cap = v.cap, liq = v.liquid, lab = v.label;
  // cap
  px(3, 0, 8, 1, K);
  px(2, 1, 1, 5, K);
  px(11, 1, 1, 5, K);
  px(3, 1, 8, 4, col(cap));
  if (v.chrome) for (let i = 0; i < 8; i++) px(3 + i, 1 + (i % 3), 1, 1, '#ffffff');
  px(4, 1, 1, 3, col(shade(cap, 0.45)));
  px(10, 1, 1, 4, col(shade(cap, -0.3)));
  px(3, 4, 8, 1, col(shade(cap, -0.25)));
  px(2, 5, 10, 1, K);
  // tube
  px(3, 6, 1, 17, K);
  px(10, 6, 1, 17, K);
  px(4, 23, 6, 1, K);
  px(3, 22, 1, 1, K);
  px(10, 22, 1, 1, K);
  // glass + liquid
  px(4, 6, 6, 3, 'rgba(210,240,255,0.55)');
  px(4, 9, 6, 14, col(liq));
  px(4, 9, 6, 1, col(shade(liq, 0.3)));
  px(5, 10, 1, 12, col(shade(liq, 0.4)));
  px(9, 9, 1, 14, col(shade(liq, -0.3)));
  // label band with a tiny panther face
  px(4, 13, 6, 4, col(lab));
  px(4, 13, 6, 1, col(shade(lab, 0.3)));
  px(4, 16, 6, 1, col(shade(lab, -0.3)));
  const lum = ((lab >> 16) & 255) * 0.3 + ((lab >> 8) & 255) * 0.59 + (lab & 255) * 0.11;
  const ink = lum > 150 ? K : '#ffffff';
  px(5, 14, 1, 1, ink);
  px(8, 14, 1, 1, ink);
  px(6, 15, 2, 1, ink);
  // bubbles + glints
  px(7, 19, 1, 1, col(shade(liq, 0.65)));
  px(6, 21, 1, 1, col(shade(liq, 0.65)));
  px(8, 11, 1, 1, col(shade(liq, 0.65)));
  px(4, 6, 1, 2, 'rgba(255,255,255,0.95)');
  // bottom rounding
  px(4, 22, 1, 1, col(shade(liq, -0.2)));
  const url = c.toDataURL();
  vialCache.set(type, url);
  return url;
}
export function vialImg(type, cls = '') {
  const v = VIALS[type];
  return h('img', { class: `pix-vial ${v?.glow ? 'glow' : ''} ${v?.chrome ? 'chrome' : ''} ${cls}`, src: vialURL(type), alt: v?.name ?? type, draggable: 'false' });
}

// ---------------------------------------------------------------------------
// Banners (animated ones get a 3-copy mirrored strip so loops are seamless)

export function bannerEl(id, cls = '', ...children) {
  const b = BANNERS[id] || BANNERS.default;
  const el = h('div', { class: `hub-banner ${b.animated ? 'anim anim-' + b.animated : ''} ${cls}` });
  if (b.animated === 'pan' || b.animated === 'drip') {
    const strip = h('div', { class: 'ban-strip' });
    for (let i = 0; i < 3; i++) strip.appendChild(h('i', { style: { background: b.css } }));
    el.appendChild(strip);
  } else {
    el.appendChild(h('div', { class: 'ban-bg', style: { background: b.css } }));
  }
  if (b.animated) el.appendChild(h('div', { class: 'ban-sheen' }));
  if (children.length) el.appendChild(h('div', { class: 'ban-content' }, ...children));
  return el;
}

// ---------------------------------------------------------------------------
// Little animations

export function rollNumber(el, from, to, dur = 0.6, f = fmt) {
  if (!el) return;
  if (el._roll) cancelAnimationFrame(el._roll);
  if (from === to) {
    el.textContent = f(to);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / (dur * 1000));
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = f(Math.round(from + (to - from) * e));
    el._roll = k < 1 ? requestAnimationFrame(step) : 0;
  };
  el._roll = requestAnimationFrame(step);
}

export function bump(el, cls = 'hub-bump') {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** Pixel confetti squares bursting from an element (or {x,y}). */
export function sparkle(target, opts = {}) {
  let x, y;
  if (target instanceof Element) {
    const r = target.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  } else ({ x, y } = target);
  const colors = opts.colors ?? ['#ffd23f', '#ff2e88', '#29b6f6', '#5fdc4a', '#ffffff'];
  const n = opts.count ?? 18;
  const layer = $overlay();
  for (let i = 0; i < n; i++) {
    const s = 4 + Math.floor(Math.random() * 3) * 2;
    const el = h('div', { class: 'hub-spark', style: { left: x + 'px', top: y + 'px', width: s + 'px', height: s + 'px', background: colors[i % colors.length] } });
    layer.appendChild(el);
    const a = Math.random() * Math.PI * 2;
    const d = (opts.spread ?? 90) * (0.4 + Math.random() * 0.8);
    const dx = Math.cos(a) * d, dy = Math.sin(a) * d - 30;
    const anim = el.animate(
      [
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 60}px)) scale(0.4)`, opacity: 0 },
      ],
      { duration: 650 + Math.random() * 400, easing: 'cubic-bezier(.2,.8,.4,1)' },
    );
    anim.onfinish = () => el.remove();
    setTimeout(() => el.remove(), 1600);
  }
}

/** Big slammed text over an element / panel (e.g. "LEVEL UP!"). */
export function slamText(parent, text, cls = '') {
  const el = h('div', { class: 'hub-slam display outline ' + cls }, text);
  parent.appendChild(el);
  setTimeout(() => el.remove(), 1300);
  return el;
}

// ---------------------------------------------------------------------------
// Swarm cards

export const RARITY_CLASS = (r) => (r === 'common' ? '' : r);

export function swarmCard(id, o = {}) {
  const s = SWARMS[id];
  const e = owned(id);
  const locked = !e && !o.forceUnlocked;
  const info = e ? upgradeInfo(id) : null;
  const dep = o.deploy && e ? deployInfo(id) : null;
  const unit = dep?.unit ?? id;
  const variant = dep?.variant ?? e?.variant ?? 'base';
  const skin = dep ? dep.skin : e?.skin ?? null;
  const card = h('div', { class: `card hub-card ${RARITY_CLASS(s.rarity)} ${locked ? 'locked' : ''} ${o.selected ? 'selected' : ''} ${o.cls ?? ''}` });
  const portrait = h('div', { class: 'portrait' }, swarmImg(unit, locked ? 'base' : variant, locked ? null : skin, 96, locked ? 'silhouette' : ''));
  card.appendChild(portrait);
  if (!locked) card.appendChild(h('div', { class: 'lvl' }, 'Lv' + e.level));
  card.appendChild(h('div', { class: 'cost' }, icon('energy'), String(SWARMS[unit].cost)));
  if (e && variant !== 'base') card.appendChild(h('div', { class: 'badge ' + variant }, VARIANTS[variant].name.toUpperCase()));
  if (dep && unit !== id) card.appendChild(h('div', { class: 'badge mega hub-mega-badge' }, 'MEGA'));
  if (o.isNew) card.appendChild(h('div', { class: 'hub-new' }, 'NEW!'));
  if (locked) card.appendChild(h('div', { class: 'hub-lockq display' }, '?'));
  card.appendChild(h('div', { class: 'name' }, SWARMS[unit].name));
  if (o.showCopies !== false) {
    if (locked) card.appendChild(h('div', { class: 'bar hub-copies gray' }, h('i', { style: { width: '0%' } }), h('span', { class: 'outline-sm' }, 'Not found')));
    else if (info?.max) card.appendChild(h('div', { class: 'bar hub-copies yellow' }, h('i', { style: { width: '100%' } }), h('span', { class: 'outline-sm' }, 'MAX')));
    else if (info) {
      const f = Math.min(1, info.haveCopies / info.copies);
      card.appendChild(h('div', { class: `bar hub-copies ${info.enoughCopies ? '' : 'blue'}` }, h('i', { style: { width: f * 100 + '%' } }), h('span', { class: 'outline-sm' }, `${info.haveCopies}/${info.copies}`)));
    }
  }
  if (info?.ok && o.showArrow !== false) card.appendChild(h('div', { class: 'upgrade-arrow hub-up' }, icon('up')));
  if (o.onClick) {
    card.addEventListener('click', (ev) => {
      audio.unlock();
      audio.play('tap');
      o.onClick(ev);
    });
  }
  return card;
}

// ---------------------------------------------------------------------------
// Rewards (data defs {type,...} and grantReward display objects {kind,id,icon,label})

function passHintFor(type, id) {
  const i = PASS_TIERS.findIndex((t) => (t.free.type === type && t.free.id === id) || (t.premium.type === type && t.premium.id === id));
  if (i < 0) return null;
  const prem = PASS_TIERS[i].premium.type === type && PASS_TIERS[i].premium.id === id;
  return `Season Pass tier ${i + 1}${prem ? ' (Premium)' : ''}`;
}
function roadHintFor(type, id) {
  const t = TROPHY_ROAD.find((x) => x.reward.type === type && x.reward.id === id);
  return t ? `Trophy Road ${t.trophies}` : null;
}
export function unlockHint(type, id) {
  return passHintFor(type, id) || roadHintFor(type, id);
}

export function rewardLabel(r) {
  switch (r.type) {
    case 'coins': return `${fmt(r.amount)} Coins`;
    case 'bucks': return `${fmt(r.amount)} Bucks`;
    case 'calories': return `${fmt(r.amount)} Calories`;
    case 'vial': return VIALS[r.id]?.name ?? 'Vial';
    case 'swarm': return `${SWARMS[r.id]?.name ?? r.id}${r.copies > 1 ? ' x' + r.copies : ''}`;
    case 'spell': return SPELLS[r.id]?.name ?? 'Spell';
    case 'commander': return COMMANDERS[r.id]?.name ?? 'Commander';
    case 'skin': return SWARM_SKINS[r.id]?.name ?? 'Swarm Skin';
    case 'labSkin': return LAB_SKINS[r.id]?.name ?? 'Lab Skin';
    case 'cmdSkin': return CMD_SKINS[r.id]?.name ?? 'Outfit';
    case 'banner': return BANNERS[r.id]?.name ?? 'Banner';
    case 'serum': return 'Mega Serum';
    case 'deckSlot': return '+1 Deck Slot';
    case 'spellSlot': return '+1 Spell Slot';
    default: return '???';
  }
}
export function rewardKind(r) {
  return {
    coins: 'Currency', bucks: 'Currency', calories: 'Season XP', vial: 'Vial', swarm: 'Swarm', spell: 'Spell', commander: 'Commander',
    skin: 'Swarm Skin', labSkin: 'Lab Skin', cmdSkin: 'Outfit', banner: 'Banner', serum: 'Mega Form', deckSlot: 'Deck', spellSlot: 'Spells',
  }[r.type] ?? '';
}

/** Visual for a reward: returns a square-ish element. */
export function rewardArt(r, size = 96) {
  const wrap = (cls, ...kids) => h('div', { class: 'hub-rart ' + cls }, ...kids);
  switch (r.type) {
    case 'coins': return wrap('cur', icon('coin', 'big-ic'), h('b', { class: 'outline-sm' }, fmt(r.amount)));
    case 'bucks': return wrap('cur pinkbg', icon('bucks', 'big-ic'), h('b', { class: 'outline-sm' }, fmt(r.amount)));
    case 'calories': return wrap('cur orangebg', icon('calorie', 'big-ic'), h('b', { class: 'outline-sm' }, fmt(r.amount)));
    case 'vial': return wrap('vialbg', vialImg(r.id));
    case 'swarm': return wrap('swarm r-' + (SWARMS[r.id]?.rarity ?? 'common'), swarmImg(r.id, 'base', null, size), r.copies > 1 ? h('b', { class: 'qty outline-sm' }, 'x' + r.copies) : null);
    case 'spell': {
      const sp = SPELLS[r.id];
      return wrap('spell', h('div', { class: 'spell-ic', style: { background: sp?.color ?? '#b05cff' } }, icon(sp?.icon ?? 'magic')));
    }
    case 'commander': return wrap('cmd', cmdImg(r.id, null, size));
    case 'skin': {
      const sk = SWARM_SKINS[r.id];
      return wrap('skin', swarmImg(sk?.swarm ?? 'panther', 'base', r.id, size), h('div', { class: 'corner-ic' }, icon('paint')));
    }
    case 'labSkin': return wrap('labskin', icon('flask', 'big-ic'), h('div', { class: 'corner-ic' }, icon('paint')));
    case 'cmdSkin': {
      const sk = CMD_SKINS[r.id];
      const cmd = sk?.commander && sk.commander !== '*' ? sk.commander : r.commander ?? 'recruit';
      return wrap('cmd', cmdImg(cmd, r.id, size), h('div', { class: 'corner-ic' }, icon('crown')));
    }
    case 'banner': return wrap('banner', bannerEl(r.id, 'mini'), h('div', { class: 'corner-ic' }, icon('flag')));
    case 'serum': return wrap('serum', swarmImg(r.id, 'base', null, size), h('div', { class: 'corner-ic' }, icon('mega')));
    case 'deckSlot': return wrap('cur bluebg', icon('swarm', 'big-ic'), h('b', { class: 'outline-sm' }, '+1'));
    case 'spellSlot': return wrap('cur purplebg', icon('magic', 'big-ic'), h('b', { class: 'outline-sm' }, '+1'));
    default: return wrap('', icon('star', 'big-ic'));
  }
}

export function displayToDef(d) {
  if (d.kind) return { type: d.kind, id: d.id };
  const m = /^([\d,]+)\s/.exec(d.label || '');
  const amount = m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
  if (d.icon === 'coin') return { type: 'coins', amount };
  if (d.icon === 'bucks') return { type: 'bucks', amount };
  if (d.icon === 'calorie') return { type: 'calories', amount };
  if (/Deck Slot/.test(d.label)) return { type: 'deckSlot' };
  if (/Spell Slot/.test(d.label)) return { type: 'spellSlot' };
  return { type: 'unknown' };
}

/** Celebratory popup listing granted rewards (grantReward display objects or defs). */
export function showRewards(list, opts = {}) {
  return new Promise((resolve) => {
    if (!list || !list.length) return resolve();
    const row = h('div', { class: 'hub-reward-row' });
    const m = modal({
      title: opts.title ?? 'REWARDS!',
      color: opts.color ?? 'yellow',
      size: 'narrow',
      cls: 'hub-screen hub-rewards',
      body: h('div', { class: 'col center' }, h('div', { class: 'hub-rays' }), row),
      foot: button('AWESOME!', () => m.close(), 'green big'),
      onClose: resolve,
    });
    audio.play('chaching');
    list.forEach((d, i) => {
      const def = d.type ? d : displayToDef(d);
      const label = d.type ? rewardLabel(d) : d.label;
      const tile = h('div', { class: 'hub-reward-pop px-box light', style: { animationDelay: 0.15 + i * 0.18 + 's' } }, rewardArt(def, 96), h('div', { class: 'lbl' }, label), d.isNew ? h('div', { class: 'hub-new' }, 'NEW!') : null);
      row.appendChild(tile);
      setTimeout(() => {
        if (!m.closed) {
          audio.play('pop', { pitch: 1 + i * 0.08 });
          sparkle(tile, { count: 10 });
        }
      }, 300 + i * 180);
    });
    if (opts.jingle !== false) setTimeout(() => audio.jingle(opts.jingle ?? 'unlock'), 120);
  });
}

/** Confirmation popup. Resolves true/false. */
export function confirmBox({ title = 'Are you sure?', text = '', art = null, yes = 'YES', no = 'Cancel', yesCls = 'green', price = null, color = 'blue' }) {
  return new Promise((resolve) => {
    let result = false;
    const yesLabel = price ? h('span', { class: 'row' }, h('span', {}, yes), priceTag(price.cur, fmt(price.amount))) : yes;
    const m = modal({
      title,
      color,
      size: 'narrow',
      cls: 'hub-screen hub-confirm',
      body: h('div', { class: 'col center' }, art, text ? h('div', { class: 'hub-confirm-text', html: text }) : null),
      foot: [
        button(no, () => m.close(), 'gray'),
        button(yesLabel, () => {
          result = true;
          m.close();
        }, yesCls),
      ],
      onClose: () => resolve(result),
    });
  });
}

// ---------------------------------------------------------------------------
// Screen wrapper: modal + optional tabs + auto re-render on state change while
// keeping scroll positions (elements with data-sk="key" are restored too).

export function makeScreen(hub, o) {
  const scr = { name: o.name, tab: o.tab ?? o.tabs?.[0]?.id, data: o.data ?? {}, busy: 0, dirty: false, closed: false, flash: null };
  let timer = 0;
  let unsub = () => {};
  const m = modal({
    title: o.title,
    color: o.color ?? '',
    size: o.size ?? '',
    cls: 'hub-screen ' + (o.cls ?? ''),
    body: h('div'),
    foot: o.foot ?? null,
    layer: hub ? 'ui' : 'overlay',
    onClose: () => {
      scr.closed = true;
      unsub();
      clearInterval(timer);
      o.onClose && o.onClose(scr);
      hub && hub._screenClosed && hub._screenClosed(scr);
    },
  });
  scr.m = m;
  scr.panel = m.panel;
  if (hub) m.el.classList.add('hub-modal-back');
  m.panel.dataset.screen = o.name;
  let footEl = null;
  if (o.renderFoot) {
    footEl = h('div', { class: 'modal-foot hub-foot' });
    m.panel.appendChild(footEl);
  }
  let tabsEl = null;
  if (o.tabs) {
    tabsEl = h('div', { class: 'tabs hub-tabs', 'data-sk': '__tabs' });
    m.panel.insertBefore(tabsEl, m.body);
  }
  const renderTabs = () => {
    if (!tabsEl) return;
    tabsEl.textContent = '';
    for (const t of o.tabs) {
      if (t.hidden && t.hidden()) continue;
      const el = h('div', { class: 'tab' + (t.id === scr.tab ? ' active' : '') }, t.icon ? icon(t.icon) : null, h('span', {}, t.label), t.dot && t.dot() ? h('i', { class: 'dot' }) : null);
      el.addEventListener('click', () => {
        if (scr.tab === t.id) return;
        audio.play('tap');
        scr.setTab(t.id);
      });
      tabsEl.appendChild(el);
    }
  };
  scr.rerender = () => {
    if (scr.closed) return;
    const scroll = { __body: [m.body.scrollLeft, m.body.scrollTop] };
    m.panel.querySelectorAll('[data-sk]').forEach((el) => (scroll[el.dataset.sk] = [el.scrollLeft, el.scrollTop]));
    const node = o.render(scr);
    m.setBody(node);
    renderTabs();
    if (footEl) {
      footEl.textContent = '';
      for (const c of [o.renderFoot(scr)].flat(Infinity)) if (c) footEl.appendChild(c);
    }
    m.body.scrollLeft = scroll.__body[0];
    m.body.scrollTop = scroll.__body[1];
    m.panel.querySelectorAll('[data-sk]').forEach((el) => {
      const s = scroll[el.dataset.sk];
      if (s) {
        el.scrollLeft = s[0];
        el.scrollTop = s[1];
      }
    });
    scr.flash = null;
    o.afterRender && o.afterRender(scr);
  };
  let pending = false;
  scr.schedule = () => {
    if (pending || scr.closed) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (scr.closed) return;
      if (scr.busy > 0) {
        scr.dirty = true;
        return;
      }
      scr.rerender();
    });
  };
  scr.hold = () => {
    scr.busy++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      scr.busy--;
      if (scr.busy <= 0 && scr.dirty) {
        scr.dirty = false;
        scr.rerender();
      }
    };
  };
  scr.setTab = (t) => {
    scr.tab = t;
    m.body.scrollTop = 0;
    m.body.scrollLeft = 0;
    scr.rerender();
    o.onTab && o.onTab(scr, t);
  };
  scr.close = () => m.close();
  unsub = state.on(() => scr.schedule());
  if (o.tick) timer = setInterval(() => !scr.closed && o.tick(scr), 1000);
  scr.rerender();
  return scr;
}

/** Section header used inside screens. */
export function sectionTitle(text, extra = null) {
  return h('div', { class: 'hub-sec' }, h('span', { class: 'display' }, text), extra ? h('span', { class: 'hub-sec-extra' }, extra) : null);
}

export function emptyNote(text) {
  return h('div', { class: 'hub-empty muted' }, text);
}

export function rarityTag(r) {
  return h('span', { class: 'rarity-tag ' + r }, RARITIES[r]?.name ?? r);
}
export function seriesTag(id) {
  const s = SERIES[id];
  return h('span', { class: 'hub-series-tag', style: { background: s?.color ?? '#888' } }, s?.name ?? id);
}
export function roleTag(role) {
  const r = ROLE_INFO[role];
  return h('span', { class: 'hub-role-tag' }, icon(r?.icon ?? 'swarm'), r?.name ?? role);
}

/** "Not enough X" feedback. */
export function deny(text) {
  audio.play('deny');
  toast(text, { icon: 'x', color: '#b8282f' });
}

export { iconURL, priceTag };
