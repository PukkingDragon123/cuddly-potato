// LAB tab: a live 3D Beast Lab with YOUR scientist at work (labStage.js), the
// RESEARCH tree (research.js, opened on the lab's big wall screen), the research
// on the bench right now, and your Commander.
//   Stage (top in portrait, left in landscape): the lab, seen through the tab, with
//   the Lab Level medal / rank / XP on top. Tap the scientist for a line, tap the
//   tube, the reactor, the robot arm or the fume hood for a reaction, tap the
//   RESEARCH screen to open the tree.
//   Panel: the research card (timer + SPEED UP, or the free bench + RESEARCH),
//   shortcuts, the Commander (showcase, roster, abilities, outfits, levels) and
//   what each Lab Level gives.
import { h, icon, button, bar, sparkle, bump } from '../ui.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import {
  state, equipCommander, setCmdSkin, labXpInfo, researchStatus, onResearch, researchTimeLeft, researchSpeedUpPrice,
  speedUpResearch, researchBadgeCount, researchFresh, takePerkRefund,
} from '../../game/state.js';
import { COMMANDERS, cmdXpForLevel, CMD_MAX_LEVEL, CMD_LEVEL_REWARDS, cmdPower } from '../../data/commanders.js';
import { CMD_SKINS } from '../../data/season.js';
import { voiceOf } from '../../data/characters.js';
import { BOSSES } from '../../data/arenas.js';
import { LAB_XP, LAB_MAX_LEVEL, LAB_LEVEL_REWARDS, TOWERS, labPower } from '../../data/labs.js';
import { NODES, BRANCH } from '../../data/research.js';
import { rankMedal, setRankMedal, rankLabel } from '../rankMedal.js';
import {
  screenShell, secHead, subHead, chip, cmdImg, cmdFullImg, cmdSkinOwned, cmdSkinsFor, unlockHint, deny, notify, refreshCtx, fmt, fmtN, labBadge, countdown,
} from './common.js';
import { openBoss } from './boss.js';
import './lab.css';

const rich = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*(.+?)\*/g, '<b>$1</b>');
const hexOf = (css) => parseInt(String(css ?? '#7cff3a').replace('#', ''), 16);
const fmtLeft = (sec) => {
  sec = Math.max(0, Math.ceil(sec));
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  if (sec >= 60) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${sec}s`;
};

/** How a locked Commander is unlocked: { text, action:{label, fn} } */
function unlockInfo(c, ctx) {
  const [kind, id] = String(c.unlock).split(':');
  if (kind === 'boss') {
    const b = BOSSES[id];
    return { text: `Beat the *${b?.name ?? id}* boss challenge${b ? ` (${fmt(b.minTrophies)} trophies)` : ''}.`, action: { label: 'BOSS', icon: 'boss', fn: () => openBoss(id, ctx) } };
  }
  if (kind === 'quest') return { text: `Finish *${c.name}'s* quest chain on Beast Island.`, action: { label: 'QUESTS', icon: 'quest', fn: () => ctx.openTab?.('pass', { sub: 'quests' }) } };
  if (kind === 'season') return { text: 'Unlock on the free *Food Season Pass* track (tier 4).', action: { label: 'PASS', icon: 'calorie', fn: () => ctx.openTab?.('pass') } };
  return { text: 'Your starter Commander.' };
}
/** Commander level reward text (the old perk-slot levels pay out their coins / Bucks now). */
function rewardText(r) {
  if (!/perk/i.test(r.text)) return r.text;
  return r.bucks ? `${r.bucks} Beast Bucks` : `${fmtN(r.coins ?? 0)} coins`;
}

// voiced lines when you tap the scientist (short, specific, a bit unhinged)
const LINES = {
  idle: [
    'Goggles on. Safety first, views second.',
    "Don't touch the green one. Or the blue one. Touch nothing.",
    'Day 41 of trying to make goo that smells like chocolate.',
    'If it bubbles, it is science. If it explodes, it is content.',
    'I labelled everything this time. Mostly with question marks.',
    'The Swarm in the tube blinked at me. Twice. We are friends now.',
    'This beaker cost ten grand. Please stop looking at it.',
    'The whiteboard math checks out. I think. I wrote it fast.',
  ],
  free: [
    'The bench is free. Pick something in the tree and I start cooking.',
    'No research running. I am just stirring things for fun.',
  ],
  shack: ['Tiny shack, tiny wrench, big upgrade.', 'One more bolt and the shack can take a punch.'],
  power: ['Charging this cell. Do not lick the terminals.', 'More volts, more POWER. That is the whole plan.'],
  tanks: ['Thicker plates. Your troops will thank me.', 'If it dents, I hit it again.'],
  spells: ['Stir clockwise. Counterclockwise summons a raccoon.', 'This potion glows. That is a good sign. Probably.'],
  ultimate: ['One drop of this and your ULTIMATE hits way harder.', 'Serum check: pink, fizzy, slightly humming. Perfect.'],
  done: ['It works! I think it works!', 'Done! Write that down. Somebody write that down.', 'Science! Put it on the tree.'],
  fizz: ['That was supposed to happen.', 'Note to self: less purple.', 'I meant to do that. For the thumbnail.'],
};
const KIND_OF = { shack: 'shack', power: 'power', ult: 'ultimate', brawl: 'tanks', tank: 'tanks', shoot: 'tanks', fly: 'tanks', swarm: 'spells', spell: 'spells' };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

let viewId = null; // which Commander the showcase shows (persists between mounts)
// research node icons live in the tree's art module (loaded with the tab, not with the nav badges)
let rsIconURL = null;
function rsIcon(name) {
  if (!name) return icon('lab');
  const img = icon(rsIconURL ? 'lab' : 'lab');
  if (rsIconURL) img.src = rsIconURL(name);
  else import('./researchArt.js').then((m) => { rsIconURL = m.rsIconURL; img.src = m.rsIconURL(name); }).catch(() => {});
  return img;
}
const celebrated = new Set(); // finished research levels already celebrated this session

export function mount(el, ctx, opts = {}) {
  viewId = null; // always open on the equipped Commander
  let disposed = false;
  let stage = null; // the 3D lab (loaded on demand)
  el.classList.add('lb2-tab');
  const shell = screenShell(el, { cls: 'lb2', render, tick, dispose: cleanup });
  const root = shell.root, scroll = shell.scroll;
  scroll.classList.add('lb2-panel');

  // ------------------------------------------------------------------ the stage (window into the lab)

  const medal = rankMedal(labXpInfo().level, { cls: 'lb2-medal' });
  const lvT = h('b', { class: 't-d outline lb2-lv' });
  const rankT = h('span', { class: 'lb2-rank' });
  const xpBar = bar(0, 'blue', '', { cls: 'lb2-xp' });
  const hud = h('button', { class: 'lb2-hud', type: 'button', 'aria-label': 'Lab Level' }, medal, h('span', { class: 'lb2-hud-t' }, h('span', { class: 'lb2-hud-row' }, lvT, rankT), xpBar));
  hud.addEventListener('click', () => { audio.play('tap'); scrollToLevels(); });
  const bubbleTxt = h('div', { class: 'lb2-bubble-t' });
  const bubbleEl = h('div', { class: 'lb2-bubble' }, bubbleTxt, h('i', { class: 'lb2-bubble-tail' }));
  const fallback = h('div', { class: 'lb2-fallback' });
  const doneBanner = h('div', { class: 'lb2-done' });
  const treeBtn = h('i', { class: 'lb2-scrbtn' }); // blinking brackets over the RESEARCH wall screen (taps go through the 3D pick)
  const stageEl = h('div', { class: 'lb2-stage' }, fallback, bubbleEl, treeBtn);
  root.insertBefore(h('div', { class: 'lb2-curtain' }), scroll);
  root.insertBefore(stageEl, scroll);
  root.append(hud, doneBanner);

  function renderHud() {
    const info = labXpInfo();
    if (medal._rm?.level !== info.level) setRankMedal(medal, info.level);
    lvT.textContent = `LAB LEVEL ${info.level}`;
    rankT.replaceChildren(rankLabel(info.level));
    xpBar.set(info.max ? 1 : info.xp / Math.max(1, info.need), info.max ? 'MAX LEVEL' : `${fmtN(info.xp)} / ${fmtN(info.need)} XP`);
  }
  renderHud();

  // taps on the lab (the stage, or the see-through top of the panel over it in portrait):
  // the scientist talks, props react, the wall screen opens the tree
  let down = null;
  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.btn, .lb2-hud, .lb2-tree') || !(stageEl.contains(e.target) || e.target.closest('.lb2-spacer'))) return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  root.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
    tapStage(e.clientX, e.clientY);
  });
  function tapStage(x, y) {
    if (treeOpen) return;
    if (!stage?.live) { speak(); return; }
    let what = stage.pick(x, y);
    if (!what) {
      const p = stage.headScreen(_hp);
      if (p && Math.hypot(p.x - x, p.y + p.w * 0.6 - y) < Math.max(60, p.w * 0.9)) what = 'scientist';
    }
    if (what === 'scientist') { stage.sci.poke(); speak(); }
    else if (what === 'terminal') openTree();
    else if (what) stage.poke(what);
  }
  const _hp = {};

  // ------------------------------------------------------------------ speech bubble

  let bubbleUntil = 0, talkOff = 0;
  function speak(text, o = {}) {
    if (disposed) return;
    if (!text) {
      const a = researchStatus().active;
      const kind = a ? KIND_OF[a.branch] ?? 'spells' : null;
      if (a && Math.random() < 0.55) text = Math.random() < 0.5 ? pick(LINES[kind] ?? LINES.spells) : `${a.name}: ${fmtLeft(researchTimeLeft())} to go.`;
      else if (!a && Math.random() < 0.3) text = pick(LINES.free);
      else text = pick(LINES.idle);
    }
    bubbleTxt.replaceChildren(h('span', { html: rich(text) }));
    bubbleEl.classList.remove('on');
    void bubbleEl.offsetWidth;
    bubbleEl.classList.add('on');
    placeBubble();
    const plain = String(text).replace(/\*/g, '');
    const span = Math.min(2.4, 0.35 + plain.length * 0.045);
    bubbleUntil = performance.now() + (o.dur ?? 1900 + plain.length * 55);
    audio.play('bubblePop', { gap: 0.08, vol: 0.6 });
    audio.babble(voiceOf(stage?.charId ?? 'recruit'), plain, span);
    const ch = stage?.sci?.ch;
    if (ch) {
      ch.talk(true);
      clearTimeout(talkOff);
      talkOff = setTimeout(() => ch.talk(false), span * 1000);
    }
  }
  function placeBubble() {
    const sr = root.getBoundingClientRect(), st = stageEl.getBoundingClientRect();
    let ax = st.left + st.width / 2, ay = st.top + st.height * 0.35, hw = 60;
    if (stage?.live) {
      const p = stage.headScreen(_hp);
      if (p) { ax = p.x; ay = p.y; hw = p.w ?? 60; }
    }
    const m = 8;
    const w = bubbleEl.offsetWidth, hh = bubbleEl.offsetHeight;
    const hudB = hud.getBoundingClientRect().bottom;
    const sp = scroll.querySelector('.lb2-spacer');
    const lowest = sp && sp.offsetHeight ? Math.min(st.bottom, sp.getBoundingClientRect().bottom) : st.bottom;
    const left = Math.max(st.left + m, Math.min(st.right - m - w, ax - w * 0.35));
    const top = Math.max(hudB + 4, Math.min(lowest - hh - m, ay - hh - 6));
    bubbleEl.style.setProperty('--tx', Math.round(Math.max(14, Math.min(w - 20, ax - left))) + 'px');
    bubbleEl.style.transform = `translate(${Math.round(left - st.left)}px, ${Math.round(top - st.top)}px)`;
    void hw; void sr;
  }
  function hideBubble() {
    bubbleUntil = 0;
    bubbleEl.classList.remove('on');
  }

  // ------------------------------------------------------------------ framing + per-frame

  let rectDirty = true, liveSince = 0, opened = false, attached = false, fno = 0;
  const mountedAt = performance.now();
  const measure = () => {
    const r = stageEl.getBoundingClientRect();
    // portrait: the panel scrolls up over the lab; its see-through top is as tall as the stage
    root.style.setProperty('--lb-sp', Math.round(r.height) + 'px');
    if (!stage) return;
    const hb = hud.getBoundingClientRect();
    // frame the lab between the HUD strip and the panel's top edge (it rises as the panel scrolls)
    const sp = scroll.querySelector('.lb2-spacer');
    const bottom = sp && sp.offsetHeight ? Math.min(r.bottom, Math.max(hb.bottom + 140, sp.getBoundingClientRect().bottom)) : r.bottom;
    const top = Math.min(hb.bottom, r.top + r.height * 0.22);
    stage.frame({ left: r.left, top, width: r.width, height: Math.max(80, bottom - top) });
    rectDirty = false;
    placeTreeBtn();
  };
  scroll.addEventListener('scroll', () => { rectDirty = true; }, { passive: true });
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { rectDirty = true; }) : null;
  ro?.observe(stageEl);
  const onResize = () => { rectDirty = true; };
  window.addEventListener('resize', onResize);
  const offFrame = engine.onFrame(() => {
    if (disposed) return;
    // re-measure while the tab slides in, when something changed, and now and then (transforms never fire resize)
    fno++;
    if ((rectDirty || performance.now() - mountedAt < 1600 || fno % 30 === 0) && !root.closest('.hm-tab-out')) measure();
    const live = !!stage?.live;
    if (live && !liveSince) liveSince = performance.now();
    if (!opened && ((live && performance.now() - liveSince > 150) || performance.now() - mountedAt > 7000)) openCurtain(live);
    if (opened && live && root.classList.contains('lb2-flat') && performance.now() - liveSince > 150) { root.classList.remove('lb2-flat'); fallback.textContent = ''; }
    if (bubbleEl.classList.contains('on')) placeBubble();
    if (bubbleUntil && performance.now() > bubbleUntil) hideBubble();
    if (live && stage.focus === 0) placeTreeBtnSoft();
    // the panel scrolled all the way over the lab: stop drawing it (the canvas keeps the last frame)
    if (stage?.ready && !treeOpen) {
      const sp = scroll.querySelector('.lb2-spacer');
      const hidden = !!(sp && sp.offsetHeight && sp.getBoundingClientRect().bottom < hud.getBoundingClientRect().bottom + 6);
      if (hidden && stage.live) stage.detach();
      else if (!hidden && !stage.live && engine.backdrop?.owner !== stage && attached) stage.attach();
    }
    if (treeSheet && treeSheet.classList.contains('closing') && stage) clipToTerminal(treeSheet);
  });
  function openCurtain(live) {
    opened = true;
    if (!live) {
      // no 3D (no WebGL, a test bench, or still building): a portrait of your scientist
      root.classList.add('lb2-flat');
      const eq = state.p.commanders.equipped;
      fallback.replaceChildren(cmdFullImg(eq, state.p.commanders.owned[eq]?.skin ?? null, { w: 200, h: 250, pose: 'idle' }, 'lb2-fallback-img'));
    }
    root.classList.add('lb2-open');
    stage && (stage.sfxOn = true);
    setTimeout(() => { if (!disposed && !treeOpen) welcome(); }, 700);
  }
  // the RESEARCH wall screen is a button too (sits over the 3D screen)
  let tbAcc = 0;
  function placeTreeBtnSoft() { if (++tbAcc % 10 === 0) placeTreeBtn(); }
  function placeTreeBtn() {
    if (!stage?.ready) { treeBtn.style.display = 'none'; return; }
    const r = stage.terminalRect(), st = stageEl.getBoundingClientRect();
    const l = Math.max(st.left, r.left), t = Math.max(st.top, r.top), rr = Math.min(st.right, r.left + r.width), b = Math.min(st.bottom, r.top + r.height);
    if (rr - l < 24 || b - t < 16) { treeBtn.style.display = 'none'; return; }
    treeBtn.style.display = 'block';
    Object.assign(treeBtn.style, { left: l - st.left + 'px', top: t - st.top + 'px', width: rr - l + 'px', height: b - t + 'px' });
  }

  // ------------------------------------------------------------------ research: live hooks

  let lastActive = researchStatus().active?.id ?? null;
  const offRes = onResearch((ev) => {
    if (disposed) return;
    syncResearch();
    if (ev.type === 'start') {
      const a = researchStatus().active;
      if (a) {
        audio.play('pour', { vol: 0.5 });
        if (!treeOpen) speak(`Starting *${a.name}*. Give me ${fmtLeft(researchTimeLeft())}.`);
      }
    } else if (ev.type === 'finish') {
      celebrate(ev.id, ev.level);
    }
    shell.schedule(30);
    refreshCtx(ctx);
  });
  function syncResearch() {
    const st = researchStatus();
    if (stage) {
      stage.status = st;
      const a = st.active;
      stage.setResearch(a, a ? hexOf(BRANCH[a.branch]?.color) : null);
    }
    lastActive = st.active?.id ?? null;
  }
  function celebrate(id, level) {
    const key = `${id}:${level}`;
    if (celebrated.has(key)) return;
    celebrated.add(key);
    const n = NODES[id];
    const col = hexOf(BRANCH[n?.branch]?.color ?? '#ffd23f');
    if (stage?.live) stage.celebrate(col);
    audio.play('levelUp');
    setTimeout(() => audio.play('cheer', { vol: 0.5 }), 250);
    doneBanner.replaceChildren(
      h('span', { class: 'lb2-done-k t-d' }, 'RESEARCH DONE'),
      h('b', { class: 'lb2-done-n t-d outline' }, n ? `${n.name}${n.max > 1 ? ` LV ${level}` : ''}` : 'New upgrade'));
    doneBanner.style.setProperty('--bc', BRANCH[n?.branch]?.color ?? '#ffd23f');
    doneBanner.classList.remove('on');
    void doneBanner.offsetWidth;
    doneBanner.classList.add('on');
    sparkle(doneBanner, { count: 22, colors: [BRANCH[n?.branch]?.color ?? '#ffd23f', '#ffffff', '#ffd84a'] });
    clearTimeout(doneT);
    doneT = setTimeout(() => doneBanner.classList.remove('on'), 3200);
    setTimeout(() => { if (!disposed && !treeOpen) speak(pick(LINES.done)); }, 650);
  }
  let doneT = 0;
  function welcome() {
    // results that finished while you were away get their party now
    const fresh = Object.entries(researchFresh());
    const todo = fresh.filter(([id, lv]) => !celebrated.has(`${id}:${lv}`));
    if (todo.length) { const [id, lv] = todo[todo.length - 1]; celebrate(id, lv); for (const [i2, l2] of todo) celebrated.add(`${i2}:${l2}`); return; }
    const refund = takePerkRefund();
    if (refund) { notify(ctx, `Perks became the *Research Tree*. Your rolls came back as *${fmtN(refund)} coins*.`, { icon: 'coin' }); refreshCtx(ctx); return; }
    if (Math.random() < 0.6) speak();
  }

  // ------------------------------------------------------------------ the research tree (on the wall screen)

  let treeOpen = false, treeSheet = null, tree = null;
  async function openTree() {
    if (treeOpen || disposed) return;
    treeOpen = true;
    hideBubble();
    audio.play('whoosh', { pitch: 1.1, vol: 0.5 });
    if (stage?.live) stage.focusTo = 1;
    const close = button(null, () => closeTree(), 'red sm lb2-tree-x', { icon: 'x', sound: 'tap' });
    close.setAttribute('aria-label', 'Close');
    const st = researchStatus();
    const total = Object.keys(NODES).length;
    const head = h('div', { class: 'lb2-tree-head' },
      h('span', { class: 't-d outline lb2-tree-title' }, 'RESEARCH'),
      chip(`${st.done.length} / ${total} researched`, 'lb2-tree-count'),
      h('span', { class: 'spacer' }), close);
    const body = h('div', { class: 'lb2-tree-body' });
    const sheet = (treeSheet = h('div', { class: 'lb2-tree' }, h('div', { class: 'lb2-tree-crt' }, head, body), h('i', { class: 'lb2-tree-scan' })));
    root.appendChild(sheet);
    // grow out of the wall screen (after the camera has dollied in)
    clipToTerminal(sheet);
    const wait = stage?.live ? 520 : 0;
    setTimeout(async () => {
      if (disposed || treeSheet !== sheet) return;
      sheet.classList.add('open');
      sheet.style.clipPath = 'inset(0 0 0 0)';
      audio.play('reveal', { vol: 0.5 });
      try {
        const m = await import('./research.js');
        if (disposed || treeSheet !== sheet) return;
        tree = m.mountResearchTree(body, ctx, { onClose: () => closeTree(), host: 'lab' });
      } catch (e) {
        console.warn('research tree unavailable', e);
        body.appendChild(h('div', { class: 'lb2-tree-err' }, 'The research screen is rebooting. Try again in a moment.'));
      }
    }, wait);
  }
  function clipToTerminal(sheet) {
    const sr = root.getBoundingClientRect();
    let r = stage?.ready ? stage.terminalRect() : null;
    if (!r || !(r.width > 0)) { const s = stageEl.getBoundingClientRect(); r = { left: s.left + s.width * 0.45, top: s.top + s.height * 0.3, width: s.width * 0.1, height: s.height * 0.1 }; }
    const L = Math.max(0, r.left - sr.left), T = Math.max(0, r.top - sr.top);
    const R = Math.max(0, sr.right - (r.left + r.width)), B = Math.max(0, sr.bottom - (r.top + r.height));
    sheet.style.clipPath = `inset(${T}px ${R}px ${B}px ${L}px)`;
  }
  function closeTree() {
    if (!treeOpen) return;
    const sheet = treeSheet, tr = tree;
    tree = null;
    audio.play('whoosh', { pitch: 0.8, vol: 0.4 });
    const done = () => { try { tr?.dispose(); } catch (e) { console.warn(e); } };
    if (sheet) {
      sheet.classList.add('closing');
      sheet.classList.remove('open');
      clipToTerminal(sheet);
      setTimeout(() => { done(); sheet.remove(); if (treeSheet === sheet) treeSheet = null; }, 380);
    } else done();
    setTimeout(() => { if (stage) stage.focusTo = 0; }, 200);
    setTimeout(() => { treeOpen = false; shell.render(); refreshCtx(ctx); }, 420);
  }

  // ------------------------------------------------------------------ research card

  function researchCard() {
    const st = researchStatus();
    const a = st.active;
    const fresh = Object.keys(researchFresh()).length;
    const openBtn = button('RESEARCH TREE', () => openTree(), a ? 'blue lb2-open-tree' : 'green lg shine lb2-open-tree', { icon: 'lab' });
    if (fresh) openBtn.appendChild(h('div', { class: 'badge' }, String(fresh)));
    if (!a) {
      return h('div', { class: 'lb2-rcard idle' },
        h('div', { class: 'lb2-rc-top' },
          h('div', { class: 'lb2-rc-ic' }, icon('lab')),
          h('div', { class: 'lb2-rc-t' },
            h('b', { class: 't-d outline lb2-rc-n' }, 'BENCH IS FREE'),
            h('span', { class: 'lb2-rc-d' }, `${st.done.length ? 'Pick the next upgrade.' : 'Start your first research.'} Upgrades work in every battle.`))),
        openBtn);
    }
    const n = NODES[a.id];
    const B = BRANCH[a.branch] ?? { name: 'RESEARCH', color: '#7cff3a' };
    const left = researchTimeLeft();
    const frac = Math.min(1, (Date.now() - a.startedAt) / Math.max(1, a.endsAt - a.startedAt));
    const pb = bar(frac, 'green', '', { cls: 'lb2-rc-bar' });
    pb.dataset.start = String(a.startedAt);
    pb.dataset.end = String(a.endsAt);
    const price = researchSpeedUpPrice();
    const speed = button('SPEED UP', (e) => doSpeedUp(e.currentTarget), 'yellow lb2-speed', { icon: 'speed', price: { cur: 'bucks', amount: price } });
    if (state.p.bucks < price) speed.classList.add('poor');
    return h('div', { class: 'lb2-rcard', style: { '--bc': B.color } },
      h('div', { class: 'lb2-rc-top' },
        h('div', { class: 'lb2-rc-ic' }, rsIcon(n?.icon)),
        h('div', { class: 'lb2-rc-t' },
          h('span', { class: 'lb2-rc-k' }, h('i', { class: 'lb2-rc-dot' }), `RESEARCHING  ${B.name}`),
          h('b', { class: 't-d outline lb2-rc-n' }, n ? `${n.name}${n.max > 1 ? ` LV ${a.level}` : ''}` : a.name),
          h('div', { class: 'lb2-rc-prog' }, pb, h('span', { class: 'lb2-rc-time t-d outline' }, icon('clock', 's'), countdown(a.endsAt, 'lb2-cd'))))),
      h('div', { class: 'lb2-rc-btns' }, speed, openBtn),
      left <= 0 ? null : null);
  }
  function doSpeedUp(btnEl) {
    const price = researchSpeedUpPrice();
    if (state.p.bucks < price) return deny(ctx, `Not enough Beast Bucks. Speeding up costs *${price}*.`, btnEl);
    shell.lock(600);
    if (!speedUpResearch()) return deny(ctx, 'Not enough Beast Bucks.', btnEl);
    audio.play('chaching', { vol: 0.5 });
    refreshCtx(ctx);
  }

  function shortcuts() {
    return h('div', { class: 'lb2-short' },
      button('UPGRADE CARDS', () => ctx.openTab?.('cards'), 'blue sm', { icon: 'cards' }),
      button('VISIT THE LAB', () => ctx.visitLab?.(), 'teal sm', { icon: 'flask' }));
  }

  // ------------------------------------------------------------------ Commander

  function view() {
    const own = state.p.commanders.owned;
    if (!viewId || !COMMANDERS[viewId]) viewId = state.p.commanders.equipped;
    return { id: viewId, def: COMMANDERS[viewId], cs: own[viewId] ?? null };
  }

  function showcase() {
    const { id, def, cs } = view();
    const equipped = state.p.commanders.equipped === id;
    const lvl = cs?.level ?? 1;
    const need = cmdXpForLevel(lvl);
    const max = lvl >= CMD_MAX_LEVEL;
    const port = h('div', { class: 'lb2-cmd-stage' },
      h('div', { class: 'lb2-cmd-spot' }),
      cmdFullImg(id, cs?.skin ?? null, { w: 200, h: 250, pose: cs ? 'idle' : null }, `lb2-cmd-full ${cs ? '' : 'locked'}`),
      h('div', { class: 'lb2-cmd-plate t-d' }, cs ? (equipped ? 'COMMANDER' : 'RECRUITED') : 'LOCKED'));
    port.addEventListener('click', () => {
      const im = port.querySelector('.lb2-cmd-full');
      if (!im || !cs) return;
      im.classList.remove('hop');
      void im.offsetWidth;
      im.classList.add('hop');
      audio.play('pop', { pitch: 1.1 + Math.random() * 0.3 });
      sparkle(im, { count: 10, spread: 50 });
    });
    let action;
    if (!cs) {
      const u = unlockInfo(def, ctx);
      action = h('div', { class: 'lb2-cmd-lock' }, icon('lock'), h('span', { html: rich(u.text) }), u.action ? button(u.action.label, u.action.fn, 'blue sm', { icon: u.action.icon }) : null);
    } else if (equipped) {
      action = h('div', { class: 'lb2-cmd-eq t-d outline' }, icon('check', 's'), 'EQUIPPED');
    } else {
      action = button('EQUIP', () => {
        equipCommander(id);
        audio.play('levelUp');
        shell.lock(400);
        shell.render();
        refreshCtx(ctx);
        dressScientist();
        const s = shell.scroll.querySelector('.lb2-cmd-stage');
        if (s) { sparkle(s, { count: 24 }); bump(s); }
        notify(ctx, `*${def.name}* is now your Commander. Fresh lab coat on the way.`, { icon: 'crown' });
      }, 'green shine', { icon: 'crown' });
    }
    const info = h('div', { class: 'lb2-cmd-info' },
      h('div', { class: 'lb2-cmd-name t-d outline' }, def.name),
      cs ? h('div', { class: 'lb2-cmd-lvrow' },
        h('div', { class: 'lb2-cmd-lv t-d outline' }, h('small', {}, 'LV'), h('span', {}, String(lvl))),
        bar(max ? 1 : Math.min(1, cs.xp / need), 'purple', max ? 'MAX LEVEL' : `${fmtN(cs.xp)} / ${fmtN(need)} XP`, { cls: 'lb2-cmd-xp' })) : null,
      h('div', { class: 'lb2-cmd-desc' }, def.desc),
      cs ? h('div', { class: 'row wrap gap-s' }, chip([icon('magic', 's'), `Ability power +${Math.round((cmdPower(lvl) - 1) * 100)}%`])) : null,
      action);
    return h('div', { class: `panel sk-panel lb2-cmd ${cs ? '' : 'is-locked'}` }, port, info);
  }

  function roster() {
    const own = state.p.commanders.owned;
    const eq = state.p.commanders.equipped;
    const { id: vid } = view();
    const grid = h('div', { class: 'mn-roster lb2-roster' });
    for (const [id, c] of Object.entries(COMMANDERS)) {
      const cs = own[id];
      const t = h('div', { class: `mn-rost ${cs ? '' : 'lock'} ${vid === id ? 'view' : ''} ${eq === id ? 'eq' : ''}` },
        h('div', { class: 'mn-rost-art' }, cmdImg(id, cs?.skin ?? null, { size: 128 })),
        h('div', { class: 'mn-rost-n t-d outline' }, c.name),
        cs ? h('div', { class: 'mn-rost-lv t-d' }, 'LV ' + cs.level) : h('div', { class: 'mn-rost-lk' }, icon('lock', 's')),
        eq === id ? h('div', { class: 'mn-rost-eq' }, icon('crown', 's')) : null);
      t.addEventListener('click', () => {
        if (vid === id) return;
        viewId = id;
        audio.play('cardPick');
        shell.render();
        shell.scroll.querySelector('.lb2-cmdsec')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      grid.appendChild(t);
    }
    return h('div', { class: 'mn-box' }, subHead('COMMANDERS', h('span', { class: 't-xs c-muted' }, `${Object.keys(own).length}/${Object.keys(COMMANDERS).length} recruited`)), grid);
  }

  function abilities() {
    const { def, cs } = view();
    const lvl = cs?.level ?? 0;
    const sig = def.signature;
    const rows = [h('div', { class: 'mn-abil sig' },
      h('div', { class: 'mn-abil-ic' }, icon(sig.icon ?? 'star')),
      h('div', { class: 'mn-abil-t' },
        h('div', { class: 'row gap-s wrap' }, h('b', { class: 't-d outline mn-abil-n' }, sig.name), chip('ULTIMATE', 'sigchip')),
        h('span', { class: 'mn-abil-d' }, sig.desc),
        h('span', { class: 'mn-abil-m' }, icon('clock', 's'), `Charges from ${sig.charge} POWER made + damage to your base`)))];
    for (const sk of def.skills) {
      const open = lvl >= sk.level;
      rows.push(h('div', { class: `mn-abil ${open ? '' : 'lock'}` },
        h('div', { class: 'mn-abil-ic' }, icon(sk.icon ?? 'star'), open ? null : h('div', { class: 'mn-abil-lk' }, icon('lock'))),
        h('div', { class: 'mn-abil-t' },
          h('div', { class: 'row gap-s wrap' }, h('b', { class: 't-d outline mn-abil-n' }, sk.name), open ? chip([icon('clock', 's'), sk.cd + 's']) : chip(`Unlocks at LV ${sk.level}`, 'lockchip')),
          h('span', { class: 'mn-abil-d' }, sk.desc))));
    }
    return h('div', { class: 'mn-box' }, subHead('ABILITIES'), ...rows);
  }

  function outfits() {
    const { id, cs } = view();
    if (!cs) return null;
    const opts2 = [null, ...cmdSkinsFor(id)];
    const row = h('div', { class: 'mn-outfits lb2-outfits' });
    for (const sk of opts2) {
      const have = sk === null || cmdSkinOwned(id, sk);
      const sel = (cs.skin ?? null) === sk;
      const name = sk ? CMD_SKINS[sk].name : 'Classic';
      const t = h('div', { class: `mn-pk ${sel ? 'sel' : ''} ${have ? '' : 'lock'}` },
        h('div', { class: 'mn-pk-art' }, cmdImg(id, sk, { size: 128 }), have ? null : icon('lock', 'mn-pk-lock')),
        h('div', { class: 'mn-pk-n' }, name),
        h('div', { class: 'mn-pk-s' }, have ? (sel ? 'Wearing' : 'Owned') : unlockHint('cmdSkin', sk)),
        sel ? h('div', { class: 'mn-pk-tick' }, icon('check', 's')) : null);
      t.addEventListener('click', () => {
        if (!have) { audio.play('deny'); return notify(ctx, `${name}: ${unlockHint('cmdSkin', sk)}`, { icon: 'paint' }); }
        if (sel) return;
        setCmdSkin(id, sk);
        audio.play('magic');
        shell.lock(300);
        shell.render();
        refreshCtx(ctx);
        dressScientist();
        const s = shell.scroll.querySelector('.lb2-cmd-stage');
        if (s) sparkle(s, { count: 20 });
      });
      row.appendChild(t);
    }
    return h('div', { class: 'mn-box' }, subHead('OUTFITS'), row);
  }

  function levelRoad() {
    const { cs } = view();
    if (!cs) return null;
    const row = h('div', { class: 'mn-lvroad scroll-x' });
    for (let L = 2; L <= CMD_MAX_LEVEL; L++) {
      const r = CMD_LEVEL_REWARDS[L];
      if (!r) continue;
      const got = cs.level >= L;
      const perk = /perk/i.test(r.text);
      const ic = r.skill !== undefined ? 'magic' : r.banner ? 'flag' : r.skin ? 'paint' : r.bucks && (perk || !r.coins) ? 'bucks' : r.coins ? 'coin' : 'star';
      row.appendChild(h('div', { class: `mn-lvn ${got ? 'got' : ''} ${cs.level + 1 === L ? 'next' : ''}` },
        h('div', { class: 'mn-lvn-l t-d outline' }, 'LV ' + L),
        h('div', { class: 'mn-lvn-ic' }, icon(ic), got ? h('div', { class: 'mn-lvn-ck' }, icon('check', 's')) : null),
        h('div', { class: 'mn-lvn-t' }, rewardText(r))));
    }
    setTimeout(() => {
      const nx = row.querySelector('.next');
      if (nx) row.scrollLeft = nx.offsetLeft - row.clientWidth / 2 + nx.offsetWidth / 2;
    }, 0);
    return h('div', { class: 'mn-box' }, subHead('COMMANDER LEVELS', h('span', { class: 't-xs c-muted' }, 'Earn XP in every battle')), row);
  }

  // ------------------------------------------------------------------ Lab Level

  function labLevelPanel() {
    const info = labXpInfo();
    const L = info.level;
    const pw = labPower(L), pn = labPower(Math.min(LAB_MAX_LEVEL, L + 1));
    const stat = (ic, label, base) => h('div', { class: 'mn-labst' }, icon(ic, 'mn-st-ic'),
      h('div', { class: 'mn-st-txt' }, h('span', { class: 'mn-st-l' }, label), h('span', { class: 'row', style: { gap: '0.3em' } },
        h('b', { class: 'mn-st-v t-d outline' }, fmtN(Math.round(base * pw))),
        !info.max ? h('span', { class: 'mn-st-plus t-d' }, '+' + fmtN(Math.round(base * pn) - Math.round(base * pw))) : null)));
    const stats = h('div', { class: 'mn-labstats' }, stat('hp', 'Base Hitpoints', TOWERS.lab.hp), stat('sword', 'Base Zapper Damage', TOWERS.lab.dmg));
    const road = h('div', { class: 'mn-labroad scroll-x' });
    for (let lv = 2; lv <= LAB_MAX_LEVEL; lv++) {
      const r = LAB_LEVEL_REWARDS(lv);
      const got = L >= lv;
      road.appendChild(h('div', { class: `mn-labn ${got ? 'got' : ''} ${lv === L + 1 ? 'next' : ''}` },
        labBadge(lv, 'sm'),
        h('div', { class: 'mn-labn-r' }, h('span', {}, icon('coin', 's'), fmtN(r.coins)), h('span', {}, icon('bucks', 's'), String(r.bucks))),
        h('div', { class: 'mn-labn-xp' }, got ? icon('check', 's') : `${fmtN(LAB_XP[lv - 1])} XP`)));
    }
    setTimeout(() => {
      const nx = road.querySelector('.next');
      if (nx) road.scrollLeft = nx.offsetLeft - road.clientWidth / 2 + nx.offsetWidth / 2;
    }, 0);
    const how = h('div', { class: 'lb2-how' },
      h('div', {}, icon('up', 's'), h('span', { html: rich('Each Lab Level: *+7%* base HP, zapper damage and MEGA power') })),
      h('div', {}, icon('lab', 's'), h('span', { html: rich('New rank medals unlock new *research*') })),
      h('div', {}, icon('cards', 's'), h('span', { html: rich('Upgrade cards for big Lab XP, win battles for *+6*') })));
    return h('div', { class: 'panel sk-panel lb2-lvpanel' }, stats, subHead('LEVEL REWARDS'), road, how);
  }

  // ------------------------------------------------------------------ render

  function render() {
    const { cs } = view();
    const inner = h('div', { class: 'mn-inner lb2-inner' },
      researchCard(),
      shortcuts(),
      h('div', { class: 'lb2-cmdsec' }, secHead('COMMANDER', 'purple'), showcase(), roster(), abilities(), outfits(), levelRoad()),
      h('div', { class: 'lb2-lvsec' }, secHead('LAB LEVEL', 'blue', h('span', { class: 'lb2-lvsec-r' }, labBadge(labXpInfo().level, 'sm'), rankLabel(labXpInfo().level))), labLevelPanel()));
    if (!cs) inner.classList.add('viewing-locked');
    renderHud();
    return h('div', { class: 'lb2-wrap' }, h('div', { class: 'lb2-spacer' }), h('div', { class: 'lb2-sheet' }, inner));
  }
  function scrollToLevels() {
    shell.scroll.querySelector('.lb2-lvsec')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function tick() {
    // research progress bar + the stage's view of it
    const pb = scroll.querySelector('.lb2-rc-bar');
    if (pb) {
      const s = +pb.dataset.start, e = +pb.dataset.end;
      pb.set(Math.min(1, (Date.now() - s) / Math.max(1, e - s)));
    }
    const a = researchStatus().active;
    if ((a?.id ?? null) !== lastActive) { syncResearch(); shell.schedule(20); }
    else if (stage) stage.status = researchStatus();
    // the SPEED UP price drops as the clock runs
    const sp = scroll.querySelector('.lb2-speed .price-n, .lb2-speed .price b');
    if (sp && a) { const p = researchSpeedUpPrice(); if (sp.textContent !== String(p)) shell.schedule(20); }
  }
  function dressScientist() {
    if (stage?.ready) { stage.applyScientist(); stage.sci.ch?.react('wave', { dur: 1.4 }); }
  }

  function cleanup() {
    disposed = true;
    offFrame();
    offRes();
    ro?.disconnect();
    window.removeEventListener('resize', onResize);
    clearTimeout(talkOff);
    clearTimeout(doneT);
    try { tree?.dispose(); } catch (e) { /* already gone */ }
    if (stage) {
      if (stage.sci?.ch) stage.sci.ch.talk(false);
      stage.sfxOn = false;
      stage.focusTo = stage.focus = 0;
      stage.release();
    }
  }

  // load + build the lab (first visit only; started before the panel renders), then show it behind the tab
  const tImp = performance.now();
  const stageLoad = import('./labStage.js');
  shell.render();
  stageLoad.then(async (m) => {
    if (disposed) return;
    const st = m.labStage();
    st.loadMs ??= Math.round(performance.now() - tImp);
    await st.build();
    if (disposed) return;
    stage = st;
    st.applyScientist();
    syncResearch();
    rectDirty = true;
    measure();
    st.attach();
    attached = true;
  }).catch((e) => console.warn('lab stage unavailable', e));
  if (opts.sub === 'research') setTimeout(() => openTree(), 600);
  return { dispose: () => shell.dispose(), refresh: () => { shell.schedule(40); renderHud(); } };
}

/** Lab tab notification count: finished research to look at, or a free bench with something affordable. */
export function labBadgeCount() {
  return researchBadgeCount();
}
