// ONLINE BATTLE: live 1v1 against real players over the claude.ai room.
//  * mountOnlineEntry(): the "LIVE 1v1" sticker on the home BATTLE button (online
//    count, pulsing), plus the lobby controller: challenge toasts, the VS handoff
//    and the hand-off into the battle scene (mode 'online').
//  * openOnline(ctx, tab): the hub - QUICK MATCH (radar search), FRIENDS (who is
//    online, CHALLENGE), CODE (the old WebRTC copy/paste friend battle).
import './online.css';
import { h, icon, button, modal, clear, $overlay } from '../ui.js';
import { audio } from '../../core/audio.js';
import { lobby } from '../../net/lobby.js';
import { net } from '../../net/p2p.js';
import { state } from '../../game/state.js';
import { arenaById, currentArena, ARENAS } from '../../data/arenas.js';
import { COMMANDERS } from '../../data/commanders.js';
import { game } from '../../game/game.js';
import { segTabs, cmdImg, notify } from './common.js';
import { badgeURL, burstRingURL, pillURL, frameURL, RadarScreen } from './onlineArt.js';
import { friendCodePanel } from './friend.js';

const plain = (s) => String(s ?? '').replace(/[*_]/g, '');
const ST_LABEL = { idle: 'ONLINE', searching: 'SEARCHING', matching: 'MATCHING', playing: 'IN BATTLE' };
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const cmdOf = (id) => (COMMANDERS[id] ? id : 'recruit');
/** A Commander portrait in a stepped pixel frame (team colour). */
const framed = (cls, img, col) => h('div', { class: 'ol-pxp ' + cls, style: { '--fr': `url(${frameURL(col)})`, '--bg': col } }, h('div', { class: 'ol-pxp-in' }, img));

let ctrl = null; // the live controller (one per home screen)
let hub = null; // the open hub modal

/** Pending request from the result screen ("PLAY AGAIN"). */
export const onlineIntent = { next: null };

// ---------------------------------------------------------------------------
// Home entry + controller

export function mountOnlineEntry(host, ctx) {
  ctrl?.dispose();
  const n = h('span', { class: 'ol-entry-n' }, '');
  n.style.backgroundImage = `url(${pillURL('#2fbf4a', 22, 12)})`;
  const ring = () => h('img', { class: 'ol-entry-ring', src: burstRingURL(), alt: '', draggable: 'false' });
  const el = h('button', { class: 'ol-entry', type: 'button', 'data-tip': 'Battle *real players* live!' },
    ring(), h('img', { class: 'ol-entry-ring r2', src: burstRingURL(), alt: '', draggable: 'false' }),
    h('img', { class: 'ol-entry-art', src: badgeURL(), alt: '', draggable: 'false' }),
    h('span', { class: 'ol-entry-face' }, icon('swords', 'ol-entry-ic'), h('b', {}, '1v1'), h('small', {}, 'LIVE')), n);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.unlock();
    audio.play('tap');
    openOnline(ctx, 'quick');
  });
  host.appendChild(el);
  const c = (ctrl = {
    el, ctx,
    dispose() {
      c.off?.();
      c.invites.forEach((t) => t.remove());
      if (ctrl === c) ctrl = null;
    },
    invites: new Map(),
  });
  const setCount = () => {
    const k = lobby.conn === 'on' ? lobby.onlineCount() : 0;
    n.textContent = k > 0 ? String(k) : '';
    el.classList.toggle('live', lobby.conn === 'on');
    el.classList.toggle('busy', lobby.mode === 'searching');
  };
  c.off = lobby.on((type, data) => {
    if (!el.isConnected) { c.dispose(); return; }
    if (type === 'peers' || type === 'conn' || type === 'mode') setCount();
    if (type === 'invite') inviteToast(c, data);
    else if (type === 'inviteGone') { const t = c.invites.get(data.key); t?.remove(); c.invites.delete(data.key); }
    else if (type === 'declined') notify(ctx, `${plain(lobby.nameOf(data))} declined your challenge.`, { icon: 'x' });
    else if (type === 'inviteExpired') notify(ctx, 'No answer to your challenge.', { icon: 'clock' });
    else if (type === 'inviteFailed') notify(ctx, 'That player left.', { icon: 'x' });
    else if (type === 'matching') matchingOverlay(c, data);
    else if (type === 'ready') vsHandoff(c, data);
    else if (type === 'matchFailed') {
      c.overlay?.remove();
      c.overlay = null;
      notify(ctx, lobby.mode === 'searching' ? 'Your opponent did not connect - still searching...' : 'Could not connect to that player.', { icon: 'x' });
      hub?.refresh();
    }
  });
  setCount();
  lobby.connect().then(() => {
    setCount();
    // "PLAY AGAIN" from an online result screen
    if (onlineIntent.next === 'search' && el.isConnected) {
      onlineIntent.next = null;
      openOnline(ctx, 'quick', { autoSearch: true });
    }
  });
  return el;
}

function inviteToast(c, inv) {
  const key = inv.peer + ':' + inv.n;
  const name = h('b', { class: 'ol-inv-name' }, inv.nick || 'Player');
  lobby.resolveNames([{ by: inv.by, nick: inv.nick }]).then((l) => { name.textContent = l[0]?.name || inv.nick || 'Player'; });
  const timer = h('i', { class: 'ol-inv-timer' });
  const done = (fn) => () => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 220);
    c.invites.delete(key);
    fn();
  };
  const t = h('div', { class: 'ol-inv sk-panel-dark' },
    framed('ol-inv-port', cmdImg(cmdOf(inv.cmd), null, { size: 96 }), '#ff2e88'),
    h('div', { class: 'ol-inv-tx' }, h('small', { class: 't-d' }, 'BATTLE CHALLENGE!'), name, h('span', { class: 'ol-inv-tr' }, icon('trophy'), String(inv.tr ?? 0))),
    h('div', { class: 'ol-inv-btns' },
      button('ACCEPT', done(() => { audio.play('go'); lobby.accept(inv); }), 'green sm', { icon: 'check' }),
      button('', done(() => { audio.play('tap'); lobby.decline(inv); }), 'red sm icon-only', { icon: 'x' })),
    timer);
  c.invites.set(key, t);
  $overlay().appendChild(t);
  audio.play('levelUp');
  setTimeout(() => { if (t.isConnected) done(() => lobby.decline(inv))(); }, 25000);
}

function matchingOverlay(c, info) {
  c.overlay?.remove();
  if (hub && !hub.closed) { hub.showFound(info); return; }
  const name = h('b', {}, info.name || info.nick || 'Rival');
  c.overlay = h('div', { class: 'ol-found' }, h('div', { class: 'ol-found-card sk-panel-dark' },
    h('small', { class: 't-d' }, 'OPPONENT FOUND!'), name, h('span', { class: 'ol-dots' }, 'Connecting')));
  $overlay().appendChild(c.overlay);
}

/** VS handoff: both commanders slam in, 3-2-1, then the battle scene takes over. */
function vsHandoff(c, match) {
  c.overlay?.remove();
  c.overlay = null;
  hub?.close(true);
  document.querySelectorAll('.ol-inv').forEach((t) => t.remove());
  const me = state.p;
  const arena = arenaById(match.arena) ?? ARENAS[0];
  const rem = match.remote;
  const side = (cls, cmdId, skin, nm, tr) => h('div', { class: 'ol-vs-side ' + cls },
    framed('ol-vs-port', cmdImg(cmdOf(cmdId), skin, { size: 192, eyes: 'happy', mouth: 'grin' }), cls === 'me' ? '#2b8cf2' : '#f23a4a'),
    h('b', { class: 'ol-vs-name' }, nm), h('span', { class: 'ol-vs-tr' }, icon('trophy'), String(tr)));
  const num = h('div', { class: 'ol-vs-count' }, '3');
  const el = h('div', { class: 'ol-vs' },
    h('i', { class: 'ol-vs-band b0' }), h('i', { class: 'ol-vs-band b1' }),
    side('me', me.commanders.equipped, me.commanders.owned[me.commanders.equipped]?.skin ?? null, plain(me.name), me.trophies),
    h('div', { class: 'ol-vs-mid' }, h('div', { class: 'ol-vs-vs' }, 'VS'), h('div', { class: 'ol-vs-arena' }, arena.name), num),
    side('them', rem.commander?.id, null, rem.name, rem.trophies ?? 0),
    h('div', { class: 'ol-vs-tag' }, icon('swords'), 'LIVE ONLINE BATTLE'));
  $overlay().appendChild(el);
  audio.play('whoosh');
  setTimeout(() => audio.play('go'), 350);
  let k = 3;
  const iv = setInterval(() => {
    k--;
    if (!el.isConnected || match.link.dead) {
      clearInterval(iv);
      el.remove();
      if (match.link.dead) { lobby.endMatch(); notify(c.ctx, 'Your opponent left before the battle.', { icon: 'x' }); }
      return;
    }
    if (k > 0) {
      num.textContent = String(k);
      num.classList.remove('pop');
      void num.offsetWidth;
      num.classList.add('pop');
      audio.play('tick');
      return;
    }
    clearInterval(iv);
    net.set(match.link);
    c.ctx.battle?.({ mode: 'online', role: match.role, remote: match.remote, arena: match.arena });
  }, 900);
}

// ---------------------------------------------------------------------------
// The hub

export function openOnline(ctx, tab = 'quick', opts = {}) {
  if (hub && !hub.closed) { hub.setTab(tab); return hub; }
  let cur = tab;
  const head = h('div', { class: 'ol-head' });
  const tabsEl = h('div', { class: 'ol-tabs' });
  const area = h('div', { class: 'ol-area' });
  const body = h('div', { class: 'col ol-hub' }, head, tabsEl, area);
  let offLobby = null, tickT = 0, codeHost = null;
  const m = modal({
    title: 'ONLINE BATTLE', color: 'pink', size: 'narrow', cls: 'ol-modal', body,
    onClose: () => {
      offLobby?.();
      clearInterval(tickT);
      codeHost?.onCloseExtra?.();
      if (!m.keepMatch && lobby.mode === 'searching') lobby.cancel();
      if (!m.keepMatch && lobby.mode === 'matching') lobby.abortMatch();
      lobby.cancelInvite();
      if (hub?.m === m) hub = null;
    },
  });
  const H = (hub = {
    m,
    get closed() { return m.closed; },
    close(keep) { m.keepMatch = !!keep; m.close(); },
    setTab(t) { cur = t; draw(); },
    refresh: () => draw(),
    showFound: (info) => { H.found = info; drawFound(info); },
  });

  function drawHead() {
    clear(head);
    const on = lobby.conn === 'on';
    const list = on ? lobby.players() : [];
    const searching = list.filter((p) => p.mp.st === 'searching').length;
    head.append(
      h('span', { class: 'ol-live ' + (on ? 'on' : lobby.conn === 'connecting' ? 'wait' : 'off') }, h('i'), on ? `${list.length} ONLINE` : lobby.conn === 'connecting' ? 'CONNECTING' : 'OFFLINE'),
      on && searching ? h('span', { class: 'ol-head-s' }, icon('swords'), `${searching} searching`) : null);
  }
  function drawTabs() {
    clear(tabsEl);
    tabsEl.append(segTabs([
      { id: 'quick', label: 'MATCH', icon: 'swords' },
      { id: 'friends', label: 'PLAYERS', icon: 'friends' },
      { id: 'code', label: 'CODE', icon: 'cards' },
    ], cur, (id) => { cur = id; draw(); }, 'ol-seg'));
  }
  function draw() {
    if (m.closed) return;
    drawHead();
    drawTabs();
    if (cur === 'code') {
      if (area.dataset.tab !== 'code') {
        clear(area);
        area.dataset.tab = 'code';
        codeHost = { close: () => H.close(true), get closed() { return m.closed || cur !== 'code'; } };
        area.append(friendCodePanel(ctx, codeHost));
      }
      return;
    }
    area.dataset.tab = cur;
    clear(area);
    if (lobby.conn === 'off') return area.append(offlineView());
    if (lobby.conn !== 'on') return area.append(h('div', { class: 'ol-wait' }, h('i', { class: 'mn-spin' }), h('span', {}, 'Connecting to the lobby...')));
    if (lobby.mode === 'matching' || lobby.mode === 'playing') return drawFound(lobby.match ?? H.found ?? {});
    if (cur === 'quick') area.append(quickView());
    else area.append(playersView());
  }

  function offlineView() {
    return h('div', { class: 'col ol-off' },
      h('div', { class: 'ol-off-art' }, icon('friends', 'l')),
      h('b', { class: 't-d outline' }, 'LIVE BATTLES ARE OFFLINE HERE'),
      h('span', { class: 't-sm c-muted center-t' }, 'Live matchmaking works in the published game on claude.ai: everyone who has it open can find each other. Here you can battle a bot, or a friend with a battle CODE.'),
      h('div', { class: 'row gap-s center' },
        button('BOT BATTLE', () => { H.close(); botBattle(ctx); }, 'yellow', { icon: 'swords' }),
        button('USE A CODE', () => { cur = 'code'; draw(); }, 'pink', { icon: 'cards' })));
  }

  // QUICK MATCH -------------------------------------------------------------
  function radar(list, searching, opts = {}) {
    const scr = new RadarScreen();
    scr.fast = searching;
    scr.hot = !!opts.hot;
    const cmd = opts.cmd ?? state.p.commanders.equipped;
    const me = framed('ol-me', cmdImg(cmdOf(cmd), opts.cmd ? null : state.p.commanders.owned[cmd]?.skin ?? null, { size: 128, ...(opts.face ?? {}) }), opts.hot ? '#f23a4a' : '#2b8cf2');
    const el = h('div', { class: 'ol-radar ' + (searching ? 'on ' : '') + (opts.hot ? 'found' : '') }, scr.el, me);
    el.setPeers = (ps) => scr.setBlips(blipsOf(ps));
    el.setPeers(list);
    return el;
  }
  function blipsOf(list) {
    const out = [];
    for (const p of list) {
      if (p.sameTab) continue;
      // a stable spot per player, around the ring between the portrait and the bezel
      let hsh = 0;
      for (const ch of p.peer) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
      const a = (hsh % 360) * (Math.PI / 180), r = 0.3 + ((hsh >> 9) % 14) / 100;
      out.push({ x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r, hot: p.mp.st === 'searching' });
    }
    return out;
  }
  function quickView() {
    const list = lobby.players();
    const others = list.filter((p) => !p.sameTab).length;
    const searching = lobby.mode === 'searching';
    const rad = radar(list, searching);
    const wrap = h('div', { class: 'col ol-quick' }, rad);
    const nOnline = h('b', {}, String(list.length));
    wrap.setPeers = (ps) => { rad.setPeers(ps); nOnline.textContent = String(ps.length); };
    if (!searching) {
      wrap.append(
        h('div', { class: 'ol-pitch' }, h('b', { class: 't-d outline' }, 'BATTLE A REAL PLAYER'), h('span', {}, 'Ranked: win trophies & vials. Your deck vs theirs, live!')),
        button('FIND OPPONENT', async () => { await lobby.search(); draw(); }, 'yellow xl shine ol-find', { icon: 'swords', sound: 'go' }),
        h('div', { class: 't-xs c-muted center-t' }, others ? `${others} other player${others > 1 ? 's' : ''} online right now` : 'Nobody else is online yet: start searching and invite a friend to open the game!'));
    } else {
      const el = h('span', { class: 'ol-elapsed' }, fmtT((Date.now() - lobby.since) / 1000));
      wrap.append(
        h('div', { class: 'ol-searching' }, h('b', { class: 't-d outline ol-dots' }, 'Searching for opponent'), h('span', { class: 'ol-sub' }, icon('clock'), el, ' · ', nOnline, ' online')),
        h('div', { class: 'row gap-s center' }, button('CANCEL', () => { lobby.cancel(); draw(); }, 'red', { icon: 'x' })));
      const bot = h('div', { class: 'ol-bot hide' }, h('span', {}, 'Nobody free right now?'), button('BATTLE A BOT', () => { H.close(); botBattle(ctx); }, 'blue sm', { icon: 'swords' }));
      wrap.append(bot);
      wrap.tick = () => {
        const s = (Date.now() - lobby.since) / 1000;
        el.textContent = fmtT(s);
        bot.classList.toggle('hide', s < 20);
      };
      wrap.tick();
    }
    return wrap;
  }
  function drawFound(info) {
    clear(area);
    area.dataset.tab = 'found';
    const name = h('b', { class: 'ol-found-name' }, info.name || info.nick || 'Rival');
    area.append(h('div', { class: 'col ol-quick' },
      radar([], true, { hot: true, cmd: cmdOf(info.partner?.mp?.cmd), face: { eyes: 'happy', mouth: 'grin' } }),
      h('div', { class: 'ol-searching' }, h('small', { class: 't-d c-gold' }, 'OPPONENT FOUND!'), name, h('span', { class: 'ol-dots ol-sub' }, 'Connecting'))));
    audio.play('levelUp');
  }

  // PLAYERS -------------------------------------------------------------------
  function playersView() {
    const wrap = h('div', { class: 'col ol-players' });
    const list = lobby.players().filter((p) => !p.sameTab);
    if (!list.length) {
      wrap.append(h('div', { class: 'ol-empty' }, icon('friends', 'l'), h('b', { class: 't-d' }, 'Nobody else is here yet'), h('span', { class: 't-sm c-muted center-t' }, 'Everyone who opens this game shows up here. Share it with a friend, then CHALLENGE them!')));
      return wrap;
    }
    const rows = h('div', { class: 'ol-rows' + (H.rowsShown ? ' still' : '') });
    H.rowsShown = true;
    wrap.append(rows);
    lobby.resolveNames(list).then((named) => {
      if (m.closed) return;
      clear(rows);
      named.sort((a, b) => (a.isMe ? 1 : 0) - (b.isMe ? 1 : 0) || (a.mp.st === 'idle' ? 0 : 1) - (b.mp.st === 'idle' ? 0 : 1) || (b.mp.tr | 0) - (a.mp.tr | 0));
      for (const p of named) {
        const st = ST_LABEL[p.mp.st] ? p.mp.st : 'idle';
        const pending = lobby.inv?.to === p.peer;
        const free = !p.isMe && (st === 'idle' || st === 'searching');
        const act = p.isMe ? h('span', { class: 'ol-you' }, 'YOUR OTHER TAB')
          : pending ? button('WAITING', () => { lobby.cancelInvite(); draw(); }, 'gray sm', { icon: 'clock' })
          : button('CHALLENGE', async () => { await lobby.challenge(p.peer); audio.play('go'); draw(); }, free ? 'pink sm' : 'gray sm disabled', { icon: 'swords' });
        rows.append(h('div', { class: 'ol-row sk-panel-dark ' + st },
          framed('ol-row-port', cmdImg(cmdOf(p.mp.cmd), null, { size: 80 }), st === 'idle' ? '#2fbf4a' : st === 'searching' ? '#ffc21a' : '#f23a4a'),
          h('div', { class: 'ol-row-tx' }, h('b', {}, p.name), h('span', { class: 'ol-row-meta' }, icon('trophy'), String(Math.max(0, p.mp.tr | 0)), h('i', { class: 'ol-st ' + st }, ST_LABEL[st]))),
          act));
      }
    });
    return wrap;
  }

  offLobby = lobby.on((type) => {
    if (m.closed) return;
    if (type === 'peers') {
      drawHead();
      // keep the radar / list live without rebuilding mid-tap
      const now = performance.now();
      if (cur === 'quick' && area.firstChild?.setPeers) area.firstChild.setPeers(lobby.players());
      else if (cur === 'friends' && now - (H.lastDraw ?? 0) > 1500) { H.lastDraw = now; draw(); }
    } else if (type === 'conn' || type === 'mode' || type === 'inviteSent') draw();
  });
  tickT = setInterval(() => area.firstChild?.tick?.(), 500);
  draw();
  lobby.connect().then(() => {
    draw();
    if (opts.autoSearch) lobby.search().then(() => draw());
  });
  return H;
}

function botBattle(ctx) {
  const best = currentArena(state.p.bestTrophies).index;
  const arena = ARENAS[Math.min(best, currentArena(state.p.trophies).index)].id;
  if (ctx?.battle) ctx.battle({ mode: 'ranked', arena });
  else game.go('battle', { mode: 'ranked', arena });
}
