// LAB tab: YOUR lab. The base you defend in battle stands in the middle of a 3D
// lab compound (labYard.js, drawn behind the tab), with your LAB MODULES bolted
// on and your Commander in front of it. The panel has four segments:
//   LAB        the base (showcase tier preview), the equipped loadout, the
//              research on the bench, Lab Level stats + rewards
//   MODULES    build / equip / upgrade modules per slot (POWER CORE, DEFENSE,
//              UTILITY, SIGNAL MAST); tapping one previews it on the base
//   SKINS      Lab skins with a live 3D preview (locked ones say how to get them)
//   COMMANDER  pick your Commander and outfit (the 3D chibi is the preview),
//              abilities and level road
// The RESEARCH button (top right) opens the research tree (research.js).
// Feature gates: labGear.featureOpen(id) (engineer P's progression.js when present).
import { h, icon, button, bar, sparkle, bump } from '../ui.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import {
  state, equipCommander, setCmdSkin, labXpInfo, researchStatus, onResearch, researchTimeLeft, researchSpeedUpPrice,
  speedUpResearch, researchBadgeCount, researchFresh, takePerkRefund,
} from '../../game/state.js';
import {
  labMods, moduleInfo, buildModule, upgradeModule, equipModule, markModulesSeen, equippedList, moduleBadgeCount,
  featureOpen, featureHint, canUpgrade,
} from '../../game/labGear.js';
import { commanderCfg } from '../../game/battle/loadout.js';
import { COMMANDERS, cmdXpForLevel, CMD_MAX_LEVEL, CMD_LEVEL_REWARDS, cmdPower } from '../../data/commanders.js';
import { CMD_SKINS, LAB_SKINS } from '../../data/season.js';
import { CHARACTERS, voiceOf } from '../../data/characters.js';
import { BOSSES } from '../../data/arenas.js';
import { LAB_XP, LAB_MAX_LEVEL, LAB_LEVEL_REWARDS, TOWERS, labPower, BASE_UPGRADES } from '../../data/labs.js';
import { NODES, BRANCH } from '../../data/research.js';
import { MOD_CATS, MOD_CAT, MOD_MAX, modulesIn, moduleText, unlockText } from '../../data/labModules.js';
import { rankMedal, setRankMedal, rankLabel } from '../rankMedal.js';
import { lazyImg, objThumb, labSkinImg } from '../thumbs.js';
import {
  screenShell, segTabs, subHead, chip, cmdImg, cmdSkinOwned, cmdSkinsFor, unlockHint, deny, notify, refreshCtx, fmt, fmtN, labBadge, countdown,
} from './common.js';
import { openBoss } from './boss.js';
import './lab.css';

const rich = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*(.+?)\*/g, '<b>$1</b>');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fmtLeft = (sec) => {
  sec = Math.max(0, Math.ceil(sec));
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  if (sec >= 60) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${sec}s`;
};

/** The base tier the yard shows: grows with your rank (a Lab skin shows on the Beast Lab, tier 5). */
const RANK_TIER = [1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6];
function showcaseTier() {
  const skin = state.p.cosmetics.labSkin;
  if (skin && skin !== 'default') return 5;
  return RANK_TIER[Math.min(RANK_TIER.length, labXpInfo().level) - 1] ?? 1;
}
const skinStyle = (id) => (id && id !== 'default' ? id : 'default');

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
function rewardText(r) {
  if (!/perk/i.test(r.text)) return r.text;
  return r.bucks ? `${r.bucks} Beast Bucks` : `${fmtN(r.coins ?? 0)} coins`;
}

// what your Commander says when you tap them in the yard
const LINES = {
  idle: [
    'This is the base. Try not to let them knock it over.',
    'Every module out here does something real. I checked. Mostly.',
    'If it beeps, it is working. If it stops beeping, run.',
    'We painted the hazard stripes ourselves. Twice.',
    'Bolt more stuff on. That is the whole strategy.',
    'The rival base has fewer lights. I counted.',
  ],
  base: ['Every upgrade in battle makes this thing bigger.', 'Walls: strong. Snacks: inside. Rival: outside.', 'It took three weekends and a lot of tape.'],
  upgraded: ['Fresh upgrade. Still warm.', 'Look at that. Shiny.', 'That one is going in the thumbnail.'],
  skin: ['New look, same base. They will not recognise us.', 'Fancy. Do not scratch it.'],
  outfit: ['How do I look? Do not answer that.', 'Dressed for battle. And for the thumbnail.'],
};

let seg = 'lab'; // remembered between visits
let modCat = 'power';

export function mount(el, ctx, opts = {}) {
  let disposed = false;
  let yard = null; // the 3D compound (loaded on demand)
  let viewCmd = null; // Commander being looked at in the COMMANDER segment
  let preview = null; // { kind: 'module'|'skin'|'tier'|'outfit', ... } a try-on that isn't equipped
  if (opts.sub && ['lab', 'modules', 'skins', 'commander'].includes(opts.sub)) seg = opts.sub;
  if (!segOpen(seg)) seg = 'lab';
  el.classList.add('lx-tab');
  const shell = screenShell(el, { cls: 'lx', render, tick, dispose: cleanup });
  const root = shell.root, scroll = shell.scroll;
  scroll.classList.add('lx-panel');

  // ------------------------------------------------------------------ stage window + HUD

  const medal = rankMedal(labXpInfo().level, { cls: 'lx-medal' });
  const lvT = h('b', { class: 't-d outline lx-lv' });
  const rankT = h('span', { class: 'lx-rank' });
  const xpBar = bar(0, 'blue', '', { cls: 'lx-xp' });
  const hud = h('button', { class: 'lx-hud', type: 'button', 'aria-label': 'Lab Level' }, medal, h('span', { class: 'lx-hud-t' }, h('span', { class: 'lx-hud-row' }, lvT, rankT), xpBar));
  hud.addEventListener('click', () => { audio.play('tap'); setSeg('lab', () => scroll.querySelector('.lx-lvsec')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); });
  const rsCount = h('div', { class: 'badge' });
  const rsTime = h('span', { class: 'lx-rs-time t-d outline' });
  const rsBtn = button(h('span', { class: 'lx-rs-in' }, h('span', { class: 'lx-rs-l' }, 'RESEARCH'), rsTime), () => openTree(), 'green lx-rs', { icon: 'flask', sound: 'tap' });
  rsBtn.appendChild(rsCount);
  const bubbleTxt = h('div', { class: 'lx-bubble-t' });
  const bubbleEl = h('div', { class: 'lx-bubble' }, bubbleTxt, h('i', { class: 'lx-bubble-tail' }));
  const tag = h('div', { class: 'lx-tag t-d' }); // "PREVIEW" chip over the stage
  const doneBanner = h('div', { class: 'lx-done' });
  const stageEl = h('div', { class: 'lx-stage' }, bubbleEl, tag);
  const segBar = h('div', { class: 'lx-segbar' });
  root.insertBefore(h('div', { class: 'lx-curtain' }, h('div', { class: 'lx-curtain-t t-d' }, 'POWERING UP THE YARD')), scroll);
  root.insertBefore(stageEl, scroll);
  root.insertBefore(segBar, scroll);
  root.append(hud, rsBtn, doneBanner);

  function renderHud() {
    const info = labXpInfo();
    if (medal._rm?.level !== info.level) setRankMedal(medal, info.level);
    lvT.textContent = `LAB LEVEL ${info.level}`;
    rankT.replaceChildren(rankLabel(info.level));
    xpBar.set(info.max ? 1 : info.xp / Math.max(1, info.need), info.max ? 'MAX LEVEL' : `${fmtN(info.xp)} / ${fmtN(info.need)} XP`);
    const fresh = Object.keys(researchFresh()).length;
    const n = fresh || researchBadgeCount();
    rsCount.textContent = String(n);
    rsCount.style.display = n ? '' : 'none';
    const a = researchStatus().active;
    rsTime.textContent = a ? fmtLeft(researchTimeLeft()) : '';
    rsTime.style.display = a ? '' : 'none';
    rsBtn.classList.toggle('lx-locked', !featureOpen('research'));
  }
  renderHud();

  function segOpen(id) {
    return id === 'lab' || featureOpen({ modules: 'labModules', skins: 'labSkins', commander: 'labCommander' }[id]);
  }
  function renderSegs() {
    const items = [
      { id: 'lab', label: 'LAB', icon: 'lab' },
      { id: 'modules', label: 'MODULES', icon: 'gear', badge: moduleBadgeCount() },
      { id: 'skins', label: 'SKINS', icon: 'paint' },
      { id: 'commander', label: 'COMMANDER', icon: 'crown' },
    ].map((it) => (segOpen(it.id) ? it : { ...it, icon: 'lock', badge: 0 }));
    const bar0 = segTabs(items, seg, (id) => setSeg(id), 'lx-seg');
    segBar.replaceChildren(bar0);
  }
  function setSeg(id, after) {
    if (!segOpen(id)) {
      const key = { modules: 'labModules', skins: 'labSkins', commander: 'labCommander' }[id];
      return deny(ctx, featureHint(key) ?? 'Keep playing to open this part of the Lab.');
    }
    if (id !== seg) {
      clearPreview();
      seg = id;
      if (id === 'modules') markModulesSeen(modCat);
      shell.render();
      scroll.scrollTop = 0;
      refocus();
    }
    if (after) setTimeout(after, 60);
  }
  function refocus() {
    if (!yard) return;
    if (seg === 'modules') yard.focus(modCat);
    else if (seg === 'commander') yard.focus('cmd');
    else if (seg === 'skins') yard.focus('base');
    else yard.focus('yard');
  }

  // ------------------------------------------------------------------ taps on the yard

  let down = null;
  root.addEventListener('pointerdown', (e) => {
    if (!stageEl.contains(e.target)) return;
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
    if (!yard?.live) { speak(); return; }
    const what = yard.pick(x, y);
    if (what === 'cmd') { yard.cmd?.react(pick(['wave', 'thumbsUp', 'flex', 'laugh']), { dur: 1.4 }); speak(); }
    else if (what === 'base') { speak(pick(LINES.base)); bumpBase(); }
    else if (what && MOD_CAT[what]) {
      const m = yard.mods?.get(what);
      m?.fire?.();
      audio.play('pop', { pitch: 1.2 });
      if (segOpen('modules')) { modCat = what; markModulesSeen(what); if (seg !== 'modules') setSeg('modules'); else { clearPreview(); shell.render(); refocus(); } }
      const id = m?.id;
      if (id) speak(moduleInfo(id).m.line);
    } else speak();
  }
  function bumpBase() {
    const b = yard?.base?.root;
    if (!b) return;
    b.scale.set(1.04, 0.95, 1.04);
    yard.pop(b, 0.5);
    audio.play('crunch', { pitch: 1.2, vol: 0.4 });
  }

  // ------------------------------------------------------------------ speech bubble (over the Commander)

  let bubbleUntil = 0, talkOff = 0;
  function speak(text) {
    if (disposed) return;
    text ??= pick(LINES.idle);
    bubbleTxt.replaceChildren(h('span', { html: rich(text) }));
    bubbleEl.classList.remove('on');
    void bubbleEl.offsetWidth;
    bubbleEl.classList.add('on');
    placeBubble();
    const plain = String(text).replace(/\*/g, '');
    const span = Math.min(2.4, 0.35 + plain.length * 0.045);
    bubbleUntil = performance.now() + 1900 + plain.length * 55;
    audio.play('bubblePop', { gap: 0.08, vol: 0.6 });
    audio.babble(voiceOf(cmdChar()), plain, span);
    const ch = yard?.cmd;
    if (ch) {
      ch.talk(true);
      clearTimeout(talkOff);
      talkOff = setTimeout(() => ch.talk(false), span * 1000);
    }
  }
  const _hp = {};
  function placeBubble() {
    const st = stageEl.getBoundingClientRect();
    let ax = st.left + st.width * 0.35, ay = st.top + st.height * 0.5;
    if (yard?.live) {
      const p = yard.cmdHead(_hp);
      if (p) { ax = p.x; ay = p.y; }
    }
    const m = 8;
    const w = bubbleEl.offsetWidth, hh = bubbleEl.offsetHeight;
    const hudB = Math.max(hud.getBoundingClientRect().bottom, rsBtn.getBoundingClientRect().bottom);
    const left = Math.max(st.left + m, Math.min(st.right - m - w, ax - w * 0.3));
    const top = Math.max(hudB + 4, Math.min(st.bottom - hh - m, ay - hh - 10));
    bubbleEl.style.setProperty('--tx', Math.round(Math.max(14, Math.min(w - 20, ax - left))) + 'px');
    bubbleEl.style.transform = `translate(${Math.round(left - st.left)}px, ${Math.round(top - st.top)}px)`;
  }
  function hideBubble() {
    bubbleUntil = 0;
    bubbleEl.classList.remove('on');
  }

  // ------------------------------------------------------------------ framing + per-frame

  let liveSince = 0, opened = false, fno = 0, rectDirty = true;
  const mountedAt = performance.now();
  const measure = () => {
    if (!yard) return;
    const r = stageEl.getBoundingClientRect();
    const top = Math.max(r.top, Math.max(hud.getBoundingClientRect().bottom, rsBtn.getBoundingClientRect().bottom) - 6);
    yard.frame({ left: r.left, top, width: r.width, height: Math.max(80, r.bottom - top) });
    rectDirty = false;
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { rectDirty = true; }) : null;
  ro?.observe(stageEl);
  const onResize = () => { rectDirty = true; };
  window.addEventListener('resize', onResize);
  const offFrame = engine.onFrame(() => {
    if (disposed) return;
    fno++;
    if ((rectDirty || performance.now() - mountedAt < 1600 || fno % 30 === 0) && !root.closest('.hm-tab-out')) measure();
    const live = !!yard?.live;
    if (live && !liveSince) liveSince = performance.now();
    if (!opened && ((live && performance.now() - liveSince > 150) || performance.now() - mountedAt > 9000)) openCurtain(live);
    if (opened && live && root.classList.contains('lx-flat')) root.classList.remove('lx-flat');
    if (bubbleEl.classList.contains('on')) placeBubble();
    if (bubbleUntil && performance.now() > bubbleUntil) hideBubble();
    if (yard?.ready && !treeOpen && attached && !engine.backdrop && !root.closest('.hm-tab-out')) yard.attach();
  });
  function openCurtain(live) {
    opened = true;
    if (!live) root.classList.add('lx-flat');
    root.classList.add('lx-open');
    setTimeout(() => { if (!disposed && !treeOpen) welcome(); }, 700);
  }

  // ------------------------------------------------------------------ yard content

  function cmdChar() {
    const id = viewCmd ?? state.p.commanders.equipped;
    return COMMANDERS[id]?.char ?? 'recruit';
  }
  function cmdDef(id, skin) {
    const c = commanderCfg(id, 1, skin);
    return c ? { ...CHARACTERS[c.char ?? c.id], ...(c.override ?? {}) } : CHARACTERS.recruit;
  }
  /** Push what the yard should show (base tier/skin, modules, Commander) from state + the preview. */
  function syncYard(o = {}) {
    if (!yard) return;
    let tier = showcaseTier(), style = skinStyle(state.p.cosmetics.labSkin);
    if (seg === 'skins') tier = 5;
    if (preview?.kind === 'skin') { style = skinStyle(preview.id); tier = 5; }
    if (preview?.kind === 'tier') tier = preview.tier;
    yard.setBase(tier, style, { animate: !!o.animateBase });
    let list = equippedList();
    if (preview?.kind === 'module') list = [...list.filter((e) => e.cat !== preview.cat), { id: preview.id, level: Math.max(1, moduleInfo(preview.id).level), cat: preview.cat }];
    const key = list.map((e) => `${e.id}:${e.level}`).join(',');
    if (key !== yard._listKey) {
      yard._listKey = key;
      yard.setModules(list, { cat: o.cat, quiet: !o.cat });
    }
    const cid = seg === 'commander' && viewCmd ? viewCmd : state.p.commanders.equipped;
    const cs = state.p.commanders.owned[cid];
    const skin = preview?.kind === 'outfit' ? preview.skin : cs?.skin ?? null;
    yard.setCommander(cmdDef(cid, skin));
  }
  function clearPreview() {
    if (!preview) return;
    preview = null;
    tag.classList.remove('on');
    syncYard();
  }
  function showTag(text) {
    tag.textContent = text;
    tag.classList.remove('on');
    void tag.offsetWidth;
    tag.classList.add('on');
  }

  // ------------------------------------------------------------------ research (tree sheet)

  let treeOpen = false, treeSheet = null, tree = null, attached = false;
  async function openTree() {
    if (treeOpen || disposed) return;
    if (!featureOpen('research')) return deny(ctx, featureHint('research') ?? 'Research opens a little later. Keep battling.');
    treeOpen = true;
    hideBubble();
    audio.play('whoosh', { pitch: 1.1, vol: 0.5 });
    const close = button(null, () => closeTree(), 'red sm lb2-tree-x', { icon: 'x', sound: 'tap' });
    close.setAttribute('aria-label', 'Close');
    const total = Object.keys(NODES).length;
    const countChip = chip('', 'lb2-tree-count');
    const upd = () => { countChip.textContent = `${researchStatus().done.length} / ${total} researched`; };
    upd();
    const head = h('div', { class: 'lb2-tree-head' }, h('span', { class: 't-d outline lb2-tree-title' }, 'RESEARCH'), countChip, h('span', { class: 'spacer' }), close);
    const body = h('div', { class: 'lb2-tree-body' });
    const sheet = (treeSheet = h('div', { class: 'lb2-tree' }, h('div', { class: 'lb2-tree-crt' }, head, body), h('i', { class: 'lb2-tree-scan' })));
    sheet._upd = upd;
    root.appendChild(sheet);
    clipFromButton(sheet);
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      if (disposed || treeSheet !== sheet) return;
      sheet.classList.add('open');
      sheet.style.clipPath = 'inset(0 0 0 0)';
      setTimeout(() => { if (treeSheet === sheet && treeOpen && !sheet.classList.contains('closing')) yard?.detach(); }, 420);
      audio.play('reveal', { vol: 0.5 });
      try {
        const m = await import('./research.js');
        if (disposed || treeSheet !== sheet) return;
        tree = m.mountResearchTree(body, ctx, { onClose: () => closeTree(), host: 'lab' });
      } catch (e) {
        console.warn('research tree unavailable', e);
        body.appendChild(h('div', { class: 'lb2-tree-err' }, 'The research screen is rebooting. Try again in a moment.'));
      }
    }));
  }
  function clipFromButton(sheet) {
    const sr = root.getBoundingClientRect(), r = rsBtn.getBoundingClientRect();
    sheet.style.clipPath = `inset(${Math.max(0, r.top - sr.top)}px ${Math.max(0, sr.right - r.right)}px ${Math.max(0, sr.bottom - r.bottom)}px ${Math.max(0, r.left - sr.left)}px)`;
  }
  function closeTree() {
    if (!treeOpen) return;
    const sheet = treeSheet, tr = tree;
    tree = null;
    if (yard && attached) yard.attach();
    audio.play('whoosh', { pitch: 0.8, vol: 0.4 });
    const done = () => { try { tr?.dispose(); } catch (e) { console.warn(e); } };
    if (sheet) {
      sheet.classList.add('closing');
      sheet.classList.remove('open');
      clipFromButton(sheet);
      setTimeout(() => { done(); sheet.remove(); if (treeSheet === sheet) treeSheet = null; }, 380);
    } else done();
    setTimeout(() => {
      treeOpen = false;
      shell.render();
      renderHud();
      refreshCtx(ctx);
      if (pendingParty && !disposed) { const [id, lv] = pendingParty; pendingParty = null; setTimeout(() => celebrate(id, lv), 300); }
    }, 420);
  }
  const celebrated = new Set();
  let pendingParty = null, doneT = 0;
  const offRes = onResearch((ev) => {
    if (disposed) return;
    treeSheet?._upd?.();
    renderHud();
    if (ev.type === 'finish') celebrate(ev.id, ev.level);
    shell.schedule(30);
    refreshCtx(ctx);
  });
  function celebrate(id, level) {
    const key = `${id}:${level}`;
    if (celebrated.has(key)) return;
    if (treeOpen) { pendingParty = [id, level]; return; }
    celebrated.add(key);
    const n = NODES[id];
    const col = BRANCH[n?.branch]?.color ?? '#ffd23f';
    audio.play('levelUp');
    doneBanner.replaceChildren(
      h('span', { class: 'lx-done-k t-d' }, 'RESEARCH DONE'),
      h('b', { class: 'lx-done-n t-d outline' }, n ? `${n.name}${n.max > 1 ? ` LV ${level}` : ''}` : 'New upgrade'));
    doneBanner.style.setProperty('--bc', col);
    doneBanner.classList.remove('on');
    void doneBanner.offsetWidth;
    doneBanner.classList.add('on');
    sparkle(doneBanner, { count: 22, colors: [col, '#ffffff', '#ffd84a'] });
    if (yard?.live) yard.confetti(yard.slotWorld('power').setY(3), 60);
    clearTimeout(doneT);
    doneT = setTimeout(() => doneBanner.classList.remove('on'), 3200);
  }
  function welcome() {
    const fresh = Object.entries(researchFresh());
    const todo = fresh.filter(([id, lv]) => !celebrated.has(`${id}:${lv}`));
    if (todo.length) { const [id, lv] = todo[todo.length - 1]; celebrate(id, lv); for (const [i2, l2] of todo) celebrated.add(`${i2}:${l2}`); return; }
    const refund = takePerkRefund();
    if (refund) { notify(ctx, `Perks became the *Research Tree*. Your rolls came back as *${fmtN(refund)} coins*.`, { icon: 'coin' }); refreshCtx(ctx); return; }
    if (Math.random() < 0.6) speak();
  }

  // ------------------------------------------------------------------ module art

  function modImg(id, level = 1, cls = '') {
    const look = level >= 5 ? 2 : level >= 3 ? 1 : 0;
    const key = `mod|${id}|${look}`;
    return lazyImg(key, () => import('../../models/props/labModules.js').then((M) => objThumb(key, () => {
      const m = M.makeModule(id, { level, mastH: 3, stub: true });
      m.update(0.3);
      return m.root;
    }, { size: 128, yaw: -0.55, pitch: 0.32, zoom: 1.02 })), 'smooth lx-modimg ' + cls, { visible: true });
  }

  // ------------------------------------------------------------------ LAB segment

  function baseCard() {
    const info = labXpInfo();
    const tierNow = preview?.kind === 'tier' ? preview.tier : showcaseTier();
    const skinId = state.p.cosmetics.labSkin ?? 'default';
    const T = BASE_UPGRADES[tierNow - 1];
    const pw = labPower(info.level);
    const name = tierNow === 5 && skinId !== 'default' ? LAB_SKINS[skinId]?.name ?? T.name : T.name;
    const tiers = h('div', { class: 'lx-tiers' });
    BASE_UPGRADES.forEach((u, i) => {
      const b = h('button', { class: `lx-tierb ${u.tier === tierNow ? 'on' : ''}`, type: 'button' }, h('b', { class: 't-d' }, String(u.tier)), h('span', {}, u.name));
      b.addEventListener('click', () => {
        audio.play('tap');
        preview = u.tier === showcaseTier() ? null : { kind: 'tier', tier: u.tier };
        if (preview) showTag(`BATTLE TIER ${u.tier}`); else tag.classList.remove('on');
        syncYard({ animateBase: true });
        yard?.focus('yard');
        shell.render();
      });
      tiers.appendChild(b);
      void i;
    });
    const slots = h('div', { class: 'lx-slots' });
    const eq = labMods().equipped;
    for (const c of MOD_CATS) {
      const id = eq[c.id];
      const mi = id ? moduleInfo(id) : null;
      const open = segOpen('modules');
      const t = h('button', { class: `lx-slot ${mi ? '' : 'empty'}`, type: 'button', style: { '--cc': c.color } },
        h('span', { class: 'lx-slot-k t-d' }, c.short),
        mi ? modImg(id, mi.level) : h('div', { class: 'lx-slot-plus' }, icon(open ? 'plus' : 'lock')),
        h('span', { class: 'lx-slot-n' }, mi ? mi.m.name : 'Empty'),
        mi ? h('span', { class: 'lx-slot-lv t-d outline' }, `LV ${mi.level}`) : null,
        mi && canUpgrade(id) ? h('i', { class: 'lx-upar' }, icon('up', 's')) : null);
      t.addEventListener('click', () => { audio.play('tap'); modCat = c.id; setSeg('modules'); });
      slots.appendChild(t);
    }
    return h('div', { class: 'panel sk-panel lx-base' },
      h('div', { class: 'lx-base-top' },
        h('div', { class: 'lx-base-t' }, h('span', { class: 'lx-k t-d' }, 'YOUR BASE'), h('b', { class: 't-d outline lx-base-n' }, name)),
        h('div', { class: 'lx-stats' },
          chip([icon('hp', 's'), fmtN(Math.round(TOWERS.lab.hp * pw * T.hp))]),
          chip([icon('sword', 's'), fmtN(Math.round(TOWERS.lab.dmg * pw * T.dmg))]))),
      tiers,
      subHead('LAB MODULES'),
      slots);
  }

  function researchCard() {
    const st = researchStatus();
    const a = st.active;
    const fresh = Object.keys(researchFresh()).length;
    const locked = !featureOpen('research');
    const openBtn = button('RESEARCH TREE', () => openTree(), a ? 'blue lx-open-tree' : 'green shine lx-open-tree', { icon: locked ? 'lock' : 'flask' });
    if (fresh) openBtn.appendChild(h('div', { class: 'badge' }, String(fresh)));
    if (!a) {
      return h('div', { class: 'lx-rcard idle' },
        h('div', { class: 'lx-rc-top' },
          h('div', { class: 'lx-rc-ic' }, icon('flask')),
          h('div', { class: 'lx-rc-t' },
            h('b', { class: 't-d outline lx-rc-n' }, 'BENCH IS FREE'),
            h('span', { class: 'lx-rc-d' }, `${st.done.length ? 'Pick the next upgrade.' : 'Start your first research.'} Upgrades work in every battle.`))),
        openBtn);
    }
    const n = NODES[a.id];
    const B = BRANCH[a.branch] ?? { name: 'RESEARCH', color: '#7cff3a' };
    const frac = Math.min(1, (Date.now() - a.startedAt) / Math.max(1, a.endsAt - a.startedAt));
    const pb = bar(frac, 'green', '', { cls: 'lx-rc-bar' });
    pb.dataset.start = String(a.startedAt);
    pb.dataset.end = String(a.endsAt);
    const price = researchSpeedUpPrice();
    const speed = button('SPEED UP', (e) => doSpeedUp(e.currentTarget), 'yellow lx-speed', { icon: 'speed', price: { cur: 'bucks', amount: price } });
    if (state.p.bucks < price) speed.classList.add('poor');
    return h('div', { class: 'lx-rcard', style: { '--bc': B.color } },
      h('div', { class: 'lx-rc-top' },
        h('div', { class: 'lx-rc-ic' }, icon('flask')),
        h('div', { class: 'lx-rc-t' },
          h('span', { class: 'lx-rc-k' }, h('i', { class: 'lx-rc-dot' }), `RESEARCHING  ${B.name}`),
          h('b', { class: 't-d outline lx-rc-n' }, n ? `${n.name}${n.max > 1 ? ` LV ${a.level}` : ''}` : a.name),
          h('div', { class: 'lx-rc-prog' }, pb, h('span', { class: 'lx-rc-time t-d outline' }, icon('clock', 's'), countdown(a.endsAt, 'lx-cd'))))),
      h('div', { class: 'lx-rc-btns' }, speed, openBtn));
  }
  function doSpeedUp(btnEl) {
    const price = researchSpeedUpPrice();
    if (state.p.bucks < price) return deny(ctx, `Not enough Beast Bucks. Speeding up costs *${price}*.`, btnEl);
    shell.lock(600);
    if (!speedUpResearch()) return deny(ctx, 'Not enough Beast Bucks.', btnEl);
    audio.play('chaching', { vol: 0.5 });
    refreshCtx(ctx);
  }

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
    const how = h('div', { class: 'lx-how' },
      // icons + numbers: what a level gives, where XP comes from
      h('div', {}, icon('up', 's'), h('span', { html: rich('*+7%* HP + damage per level') })),
      h('div', {}, icon('cards', 's'), h('span', { html: rich('XP: card upgrades, wins *+6*') })));
    return h('div', { class: 'panel sk-panel lx-lvpanel' }, stats, subHead('LEVEL REWARDS'), road, how);
  }

  function labSeg() {
    return h('div', { class: 'lx-col' },
      baseCard(),
      researchCard(),
      h('div', { class: 'lx-lvsec' }, h('div', { class: 'lx-lvhead' }, h('span', { class: 'lx-k t-d' }, 'LAB LEVEL'), labBadge(labXpInfo().level, 'sm'), rankLabel(labXpInfo().level)), labLevelPanel()),
      h('div', { class: 'lx-short' }, button('UPGRADE CARDS', () => ctx.openTab?.('cards'), 'blue', { icon: 'cards' })));
  }

  // ------------------------------------------------------------------ MODULES segment

  function modulesSeg() {
    const L = labMods();
    const cats = h('div', { class: 'lx-cats' });
    for (const c of MOD_CATS) {
      const eqId = L.equipped[c.id];
      const fresh = modulesIn(c.id).some((m) => moduleInfo(m.id).isNew);
      const b = h('button', { class: `lx-cat ${c.id === modCat ? 'on' : ''}`, type: 'button', style: { '--cc': c.color } },
        icon(c.icon, 'lx-cat-ic'),
        h('span', { class: 'lx-cat-n t-d' }, c.short),
        h('span', { class: 'lx-cat-e' }, eqId ? moduleInfo(eqId).m.name : 'Empty'),
        fresh ? h('div', { class: 'badge' }, 'NEW') : null);
      b.addEventListener('click', () => {
        if (c.id === modCat) return;
        audio.play('tap');
        modCat = c.id;
        clearPreview();
        markModulesSeen(c.id);
        shell.render();
        scroll.scrollTop = 0;
        refocus();
        refreshCtx(ctx);
      });
      cats.appendChild(b);
    }
    const C = MOD_CAT[modCat];
    const list = h('div', { class: 'lx-mods' });
    for (const m of modulesIn(modCat)) list.appendChild(modCard(m.id));
    return h('div', { class: 'lx-col' }, cats, h('div', { class: 'lx-cathint', style: { '--cc': C.color } }, icon(C.icon, 's'), h('b', { class: 't-d' }, C.name), h('span', {}, C.hint)), list);
  }

  function modCard(id) {
    const i = moduleInfo(id);
    const m = i.m;
    const C = MOD_CAT[m.cat];
    const lvShown = Math.max(1, i.level);
    const pips = h('div', { class: 'lx-pips' });
    for (let k = 1; k <= MOD_MAX; k++) pips.appendChild(h('i', { class: k <= i.level ? 'on' : '' }));
    const fx = h('div', { class: 'lx-fx' }, h('span', { html: rich(moduleText(m, lvShown)) }));
    const nextFx = i.owned && !i.max ? h('div', { class: 'lx-fx next' }, h('b', { class: 't-d' }, `LV ${i.next}`), h('span', { html: rich(moduleText(m, i.next)) })) : null;
    let act;
    if (!i.unlocked) {
      const p = i.progress;
      act = h('div', { class: 'lx-lock' }, icon('lock', 's'), h('span', {}, unlockText(m)),
        p ? h('span', { class: 'lx-lock-p t-d' }, `${fmtN(Math.min(p.cur, p.need))} / ${fmtN(p.need)}`) : null);
    } else {
      const btns = [];
      if (!i.owned) {
        const b = button(i.cost ? 'BUILD' : 'BUILD FREE', (e) => doBuild(id, e.currentTarget), `${state.p.coins >= i.cost ? 'green' : 'gray'} lx-mbtn`, i.cost ? { icon: 'gear', price: { cur: 'coins', amount: fmtN(i.cost) } } : { icon: 'gear' });
        btns.push(b);
      } else {
        if (i.equipped) btns.push(h('div', { class: 'lx-eq t-d outline' }, icon('check', 's'), 'EQUIPPED'));
        else btns.push(button('EQUIP', () => doEquip(id), 'blue lx-mbtn', { icon: 'check' }));
        if (i.max) btns.push(h('div', { class: 'lx-max t-d outline' }, 'MAX LEVEL'));
        else if (!i.gateOk) btns.push(button(`LAB LV ${i.gate}`, () => deny(ctx, `Level ${i.next} needs *Lab Level ${i.gate}*. Upgrade cards and win battles for Lab XP.`), 'gray lx-mbtn', { icon: 'lock' }));
        else btns.push(button(`LV ${i.next}`, (e) => doUpgrade(id, e.currentTarget), `${state.p.coins >= i.cost ? 'yellow' : 'gray'} lx-mbtn`, { icon: 'up', price: { cur: 'coins', amount: fmtN(i.cost) } }));
      }
      act = h('div', { class: 'lx-acts' }, ...btns);
    }
    const previewing = preview?.kind === 'module' && preview.id === id;
    const card = h('div', { class: `lx-mod ${i.unlocked ? '' : 'locked'} ${i.equipped ? 'eq' : ''} ${previewing ? 'pv' : ''}`, style: { '--cc': C.color }, 'data-id': id },
      h('div', { class: 'lx-mod-art' }, modImg(id, lvShown), i.isNew ? h('span', { class: 'lx-new t-d' }, 'NEW') : null),
      h('div', { class: 'lx-mod-t' },
        h('div', { class: 'lx-mod-head' }, h('b', { class: 't-d outline lx-mod-n' }, m.name), i.owned ? h('span', { class: 'lx-mod-lv t-d' }, `LV ${i.level}`) : null),
        pips, fx, nextFx,
        h('div', { class: 'lx-line' }, m.line),
        act));
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn')) return;
      // try it on: the base shows this module (equipped ones just get a closer look)
      audio.play('cardPick');
      if (i.equipped) { clearPreview(); yard?.focus(m.cat); yard?.mods?.get(m.cat)?.fire(); return; }
      preview = { kind: 'module', id, cat: m.cat };
      showTag(i.unlocked ? 'PREVIEW' : 'PREVIEW  LOCKED');
      syncYard({ cat: m.cat });
      yard?.focus(m.cat);
      scroll.querySelectorAll('.lx-mod.pv').forEach((x) => x.classList.remove('pv'));
      card.classList.add('pv');
    });
    return card;
  }

  function doBuild(id, btnEl) {
    const i = moduleInfo(id);
    if (state.p.coins < i.cost) return deny(ctx, `Not enough coins. Building costs *${fmtN(i.cost)}*.`, btnEl);
    if (!buildModule(id)) return deny(ctx, 'Can not build that yet.', btnEl);
    preview = null;
    tag.classList.remove('on');
    afterUpgrade(id, `*${i.m.name}* built and equipped.`);
  }
  function doUpgrade(id, btnEl) {
    const i = moduleInfo(id);
    if (state.p.coins < i.cost) return deny(ctx, `Not enough coins. Level ${i.next} costs *${fmtN(i.cost)}*.`, btnEl);
    if (!upgradeModule(id)) return deny(ctx, 'Can not upgrade that yet.', btnEl);
    afterUpgrade(id, `*${i.m.name}* is now level ${i.next}.`, i.equipped);
  }
  function afterUpgrade(id, msg, equipped = true) {
    const m = moduleInfo(id).m;
    audio.play('chaching', { vol: 0.5 });
    shell.lock(1700);
    refreshCtx(ctx);
    if (yard && equipped) {
      yard.focus(m.cat);
      const list = equippedList();
      yard._listKey = list.map((e) => `${e.id}:${e.level}`).join(',');
      yard.upgrade(m.cat, list).then(() => {
        if (disposed) return;
        speak(pick(LINES.upgraded));
        notify(ctx, msg, { icon: 'up' });
        shell.render();
      });
    } else {
      notify(ctx, msg, { icon: 'up' });
      shell.render();
    }
  }
  function doEquip(id) {
    const m = moduleInfo(id).m;
    equipModule(id);
    preview = null;
    tag.classList.remove('on');
    audio.play('levelUp', { vol: 0.6 });
    shell.lock(300);
    shell.render();
    refreshCtx(ctx);
    syncYard({ cat: m.cat });
    yard?.focus(m.cat);
    const c = scroll.querySelector(`.lx-mod[data-id="${id}"]`);
    if (c) { sparkle(c, { count: 16 }); bump(c); }
  }

  // ------------------------------------------------------------------ SKINS segment

  function skinsSeg() {
    const p = state.p;
    const grid = h('div', { class: 'lx-skins' });
    for (const [id, l] of Object.entries(LAB_SKINS)) {
      const have = p.cosmetics.labSkins.includes(id);
      const sel = (p.cosmetics.labSkin ?? 'default') === id;
      const pv = preview?.kind === 'skin' && preview.id === id;
      const t = h('div', { class: `lx-skin ${sel ? 'sel' : ''} ${have ? '' : 'lock'} ${pv ? 'pv' : ''}` },
        h('div', { class: 'lx-skin-art' }, labSkinImg(id, 160, 'smooth lx-skin-3d'), have ? null : icon('lock', 'lx-skin-lock')),
        h('b', { class: 'lx-skin-n t-d outline' }, l.name),
        h('span', { class: 'lx-skin-s' }, have ? (sel ? 'Equipped' : l.desc) : unlockHint('labSkin', id)),
        sel ? h('div', { class: 'lx-skin-tick' }, icon('check', 's')) : null);
      t.addEventListener('click', () => {
        if (sel) { clearPreview(); yard?.focus('base'); return; }
        if (!have) {
          audio.play('cardPick');
          preview = { kind: 'skin', id };
          showTag('PREVIEW  LOCKED');
          syncYard({ animateBase: true });
          notify(ctx, `${l.name}: ${unlockHint('labSkin', id)}`, { icon: 'paint' });
          shell.render();
          return;
        }
        p.cosmetics.labSkin = id;
        preview = null;
        tag.classList.remove('on');
        state.emit('labSkin');
        audio.play('magic');
        shell.lock(400);
        shell.render();
        syncYard({ animateBase: true });
        setTimeout(() => { if (!disposed) speak(pick(LINES.skin)); }, 1300);
      });
      grid.appendChild(t);
    }
    return h('div', { class: 'lx-col' },
      h('div', { class: 'lx-note big' }, icon('paint', 's'), h('span', {}, 'Your skin covers the Beast Lab (base tier 5) in every battle.')),
      grid);
  }

  // ------------------------------------------------------------------ COMMANDER segment

  function cmdView() {
    const own = state.p.commanders.owned;
    if (!viewCmd || !COMMANDERS[viewCmd]) viewCmd = state.p.commanders.equipped;
    return { id: viewCmd, def: COMMANDERS[viewCmd], cs: own[viewCmd] ?? null };
  }
  function cmdCard() {
    const { id, def, cs } = cmdView();
    const equipped = state.p.commanders.equipped === id;
    const lvl = cs?.level ?? 1;
    const need = cmdXpForLevel(lvl);
    const max = lvl >= CMD_MAX_LEVEL;
    let action;
    if (!cs) {
      const u = unlockInfo(def, ctx);
      action = h('div', { class: 'lx-cmd-lock' }, icon('lock'), h('span', { html: rich(u.text) }), u.action ? button(u.action.label, u.action.fn, 'blue sm', { icon: u.action.icon }) : null);
    } else if (equipped) action = h('div', { class: 'lx-eq t-d outline' }, icon('check', 's'), 'YOUR COMMANDER');
    else {
      action = button('EQUIP', () => {
        equipCommander(id);
        audio.play('levelUp');
        shell.lock(400);
        shell.render();
        refreshCtx(ctx);
        syncYard();
        yard?.cmd?.react('wave', { dur: 1.4 });
        notify(ctx, `*${def.name}* is your Commander now.`, { icon: 'crown' });
      }, 'green shine', { icon: 'crown' });
    }
    return h('div', { class: `panel sk-panel lx-cmd ${cs ? '' : 'is-locked'}` },
      h('div', { class: 'lx-cmd-top' },
        h('b', { class: 'lx-cmd-name t-d outline' }, def.name),
        cs ? h('div', { class: 'lx-cmd-lv t-d outline' }, h('small', {}, 'LV'), h('span', {}, String(lvl))) : null),
      cs ? bar(max ? 1 : Math.min(1, cs.xp / need), 'purple', max ? 'MAX LEVEL' : `${fmtN(cs.xp)} / ${fmtN(need)} XP`, { cls: 'lx-cmd-xp' }) : null,
      h('div', { class: 'lx-cmd-desc' }, def.desc),
      cs ? h('div', { class: 'row wrap gap-s' }, chip([icon('magic', 's'), `Ability power +${Math.round((cmdPower(lvl) - 1) * 100)}%`])) : null,
      action);
  }
  function roster() {
    const own = state.p.commanders.owned;
    const eq = state.p.commanders.equipped;
    const { id: vid } = cmdView();
    const grid = h('div', { class: 'mn-roster lx-roster' });
    for (const [id, c] of Object.entries(COMMANDERS)) {
      const cs = own[id];
      const t = h('div', { class: `mn-rost ${cs ? '' : 'lock'} ${vid === id ? 'view' : ''} ${eq === id ? 'eq' : ''}` },
        h('div', { class: 'mn-rost-art' }, cmdImg(id, cs?.skin ?? null, { size: 128 })),
        h('div', { class: 'mn-rost-n t-d outline' }, c.name),
        cs ? h('div', { class: 'mn-rost-lv t-d' }, 'LV ' + cs.level) : h('div', { class: 'mn-rost-lk' }, icon('lock', 's')),
        eq === id ? h('div', { class: 'mn-rost-eq' }, icon('crown', 's')) : null);
      t.addEventListener('click', () => {
        if (vid === id) return;
        viewCmd = id;
        preview = null;
        audio.play('cardPick');
        if (id !== eq) showTag(cs ? 'PREVIEW' : 'PREVIEW  LOCKED'); else tag.classList.remove('on');
        shell.render();
        syncYard();
        yard?.cmd?.react(cs ? 'wave' : 'shrug', { dur: 1.2 });
      });
      grid.appendChild(t);
    }
    return h('div', { class: 'mn-box' }, subHead('COMMANDERS', h('span', { class: 't-xs c-muted' }, `${Object.keys(own).length}/${Object.keys(COMMANDERS).length} recruited`)), grid);
  }
  function outfits() {
    const { id, cs } = cmdView();
    if (!cs) return null;
    const opts2 = [null, ...cmdSkinsFor(id)];
    const row = h('div', { class: 'mn-outfits lx-outfits' });
    for (const sk of opts2) {
      const have = sk === null || cmdSkinOwned(id, sk);
      const sel = (cs.skin ?? null) === sk;
      const pv = preview?.kind === 'outfit' && preview.skin === sk;
      const name = sk ? CMD_SKINS[sk].name : 'Classic';
      const t = h('div', { class: `mn-pk ${sel ? 'sel' : ''} ${have ? '' : 'lock'} ${pv ? 'pv' : ''}` },
        h('div', { class: 'mn-pk-art' }, cmdImg(id, sk, { size: 128 }), have ? null : icon('lock', 'mn-pk-lock')),
        h('div', { class: 'mn-pk-n' }, name),
        h('div', { class: 'mn-pk-s' }, have ? (sel ? 'Wearing' : 'Owned') : unlockHint('cmdSkin', sk)),
        sel ? h('div', { class: 'mn-pk-tick' }, icon('check', 's')) : null);
      t.addEventListener('click', () => {
        if (sel) { clearPreview(); return; }
        if (!have) {
          audio.play('cardPick');
          preview = { kind: 'outfit', skin: sk };
          showTag('PREVIEW  LOCKED');
          syncYard();
          yard?.cmd?.react('flex', { dur: 1.2 });
          notify(ctx, `${name}: ${unlockHint('cmdSkin', sk)}`, { icon: 'paint' });
          shell.render();
          return;
        }
        setCmdSkin(id, sk);
        preview = null;
        tag.classList.remove('on');
        audio.play('magic');
        shell.lock(300);
        shell.render();
        refreshCtx(ctx);
        syncYard();
        if (yard) { yard.cmd?.react('flex', { dur: 1.4 }); yard.stars(yard.cmdGrp.position.clone().setY(1.2), 20, [0xffffff, 0xffd23f, 0xff8ac0]); }
        setTimeout(() => { if (!disposed) speak(pick(LINES.outfit)); }, 500);
      });
      row.appendChild(t);
    }
    return h('div', { class: 'mn-box' }, subHead('OUTFITS', h('span', { class: 't-xs c-muted' }, 'Worn in battle')), row);
  }
  function abilities() {
    const { def, cs } = cmdView();
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
  function levelRoad() {
    const { cs } = cmdView();
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
  function commanderSeg() {
    return h('div', { class: 'lx-col' }, cmdCard(), roster(), outfits(), abilities(), levelRoad());
  }

  // ------------------------------------------------------------------ render

  function render() {
    renderSegs();
    renderHud();
    const body = seg === 'modules' ? modulesSeg() : seg === 'skins' ? skinsSeg() : seg === 'commander' ? commanderSeg() : labSeg();
    return h('div', { class: `lx-sheet lx-s-${seg}` }, body);
  }
  function tick() {
    const pb = scroll.querySelector('.lx-rc-bar');
    if (pb) {
      const s = +pb.dataset.start, e = +pb.dataset.end;
      pb.set(Math.min(1, (Date.now() - s) / Math.max(1, e - s)));
    }
    renderHud();
    const sp = scroll.querySelector('.lx-speed .price-n, .lx-speed .price b');
    const a = researchStatus().active;
    if (sp && a) { const p = researchSpeedUpPrice(); if (sp.textContent !== String(p)) shell.schedule(20); }
  }

  const offState = state.on((what) => {
    if (disposed || !yard) return;
    if (what === 'labMods' || what === 'commanders' || what === 'labSkin' || what === 'labXp') syncYard();
  });

  function cleanup() {
    disposed = true;
    offFrame();
    offRes();
    offState();
    ro?.disconnect();
    window.removeEventListener('resize', onResize);
    clearTimeout(talkOff);
    clearTimeout(doneT);
    try { tree?.dispose(); } catch (e) { /* already gone */ }
    if (yard) {
      yard.cmd?.talk(false);
      yard.sfx = null;
      yard.release();
    }
  }

  // load + build the yard (first visit only), then show it behind the tab
  const yardLoad = import('./labYard.js');
  shell.render();
  yardLoad.then(async (M) => {
    if (disposed) return;
    const y = M.labYard();
    const cid = state.p.commanders.equipped;
    await y.build({ tier: showcaseTier(), style: skinStyle(state.p.cosmetics.labSkin), list: equippedList(), cmd: cmdDef(cid, state.p.commanders.owned[cid]?.skin ?? null) });
    if (disposed || root.closest('.hm-tab-out')) return;
    yard = y;
    y.sfx = (n, o) => audio.play(n, o);
    y._listKey = null;
    syncYard();
    refocus();
    y.focus(y.target, true);
    rectDirty = true;
    measure();
    y.attach();
    attached = true;
  }).catch((e) => console.warn('lab yard unavailable', e));
  if (opts.sub === 'research') setTimeout(() => openTree(), 600);
  return { dispose: () => shell.dispose(), refresh: () => { shell.schedule(40); renderHud(); } };
}

/** Lab tab notification count: research to look at / start, plus new module unlocks. */
export function labBadgeCount() {
  let n = 0;
  try { n += researchBadgeCount(); } catch (e) { /* ignore */ }
  try { if (featureOpen('labModules')) n += moduleBadgeCount(); } catch (e) { /* ignore */ }
  return n;
}
