// Friend Battle by CODE: serverless WebRTC battles by swapping battle codes.
// HOST picks an arena and shares a host code, JOIN pastes it and sends back
// a reply code. Once connected both sides swap loadouts and the host starts
// the battle via ctx.battle({ mode: 'friend', role, remote, arena }).
// This is the fallback tab of the ONLINE hub (src/ui/home/online.js), which
// does live matchmaking + challenges over the claude.ai room.
import { h, icon, button, clear, modal } from '../ui.js';
import { audio } from '../../core/audio.js';
import { Peer, net, p2pSupported } from '../../net/p2p.js';
import { state } from '../../game/state.js';
import { playerSide } from '../../game/battle/loadout.js';
import { ARENAS, currentArena } from '../../data/arenas.js';
import { notify } from './common.js';

let lastArena = null;

function stepHead(n, text) {
  return h('div', { class: 'mn-fr-step' }, h('span', { class: 'mn-fr-num t-d outline' }, String(n)), h('span', { class: 't-d outline' }, text));
}

// Live online play (src/ui/home/online.js) is parked for now: the FRIENDS
// button opens the battle-code flow directly.
export const ONLINE_ENABLED = false;

/** The FRIENDS button: battle by code (or the online hub when it is enabled). */
export function openFriendBattle(ctx) {
  if (ONLINE_ENABLED) return import('./online.js').then((m) => m.openOnline(ctx, 'friends'));
  const host = {};
  const m = modal({ title: 'FRIEND BATTLE', color: 'pink', size: 'narrow', cls: 'mn-frm', body: h('div'), onClose: () => host.onCloseExtra?.() });
  host.close = () => m.close();
  Object.defineProperty(host, 'closed', { get: () => m.closed });
  m.setBody(friendCodePanel(ctx, host));
  return m;
}

/** The old copy/paste battle-code flow, rendered into a host panel `m` ({ close(), closed }). */
export function friendCodePanel(ctx, m) {
  if (!p2pSupported()) {
    return h('div', { class: 'mn-fr-intro' }, icon('x', 'l'), h('span', {}, 'Your browser does not support device-to-device battles.'));
  }
  const area = h('div', { class: 'col mn-fr-area' });
  const status = h('div', { class: 'mn-fr-status' });
  const body = h('div', { class: 'col mn-fr' }, area, status);
  let started = false;
  m.onCloseExtra = () => { if (!started && !net.peer?.open) net.clear(); };
  const setStatus = (t, cls = '') => {
    clear(status);
    status.className = 'mn-fr-status ' + cls;
    if (t) status.append(cls === 'wait' ? h('i', { class: 'mn-spin' }) : null, h('span', {}, t));
  };

  function codeBox(code) {
    const ta = h('textarea', { class: 'px-input mn-fr-code', readonly: true, rows: '3' });
    ta.value = code;
    ta.addEventListener('pointerdown', (e) => e.stopPropagation());
    const copy = button('COPY', async () => {
      try {
        await navigator.clipboard.writeText(code);
        notify(ctx, 'Battle code copied!', { icon: 'check' });
      } catch (e) {
        ta.select();
        document.execCommand?.('copy');
        notify(ctx, 'Select the code and copy it', { icon: 'info' });
      }
    }, 'blue sm', { icon: 'cards' });
    const share = navigator.share ? button('SHARE', () => navigator.share({ title: 'MrBeast Swarmers battle code', text: code }).catch(() => {}), 'pink sm', { icon: 'friends' }) : null;
    return h('div', { class: 'col', style: { gap: 'calc(var(--u)*1)' } }, ta, h('div', { class: 'row wrap gap-s' }, copy, share));
  }

  function pasteBox(placeholder, label, onGo) {
    const ta = h('textarea', { class: 'px-input mn-fr-code', rows: '3', placeholder });
    ta.addEventListener('pointerdown', (e) => e.stopPropagation());
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    const go = button(label, async () => {
      if (!ta.value.trim()) { audio.play('deny'); return setStatus('Paste a code first!', 'err'); }
      setStatus('');
      go.classList.add('disabled');
      try {
        await onGo(ta.value.trim());
      } catch (e) {
        setStatus(e.message || 'That code did not work.', 'err');
        go.classList.remove('disabled');
        audio.play('error');
      }
    }, 'green', { icon: 'check' });
    const paste = navigator.clipboard?.readText ? button('PASTE', async () => {
      try { ta.value = await navigator.clipboard.readText(); } catch (e) { /* denied */ }
    }, 'gray sm', { icon: 'cards' }) : null;
    return h('div', { class: 'col', style: { gap: 'calc(var(--u)*1)' } }, ta, h('div', { class: 'row wrap gap-s' }, paste, h('span', { class: 'spacer' }), go));
  }

  /** Swap loadouts; the host starts the battle. */
  function handshake(peer, role, arena) {
    const me = playerSide();
    peer.on((msg) => {
      if (started) return;
      if (msg.t === 'hello' && role === 'host') {
        started = true;
        peer.send({ t: 'start', host: me, guest: msg.profile, arena, seed: (Math.random() * 1e9) | 0 });
        m.close();
        ctx.battle?.({ mode: 'friend', role: 'host', remote: msg.profile, arena });
      }
      if (msg.t === 'start' && role === 'guest') {
        started = true;
        m.close();
        ctx.battle?.({ mode: 'friend', role: 'guest', remote: msg.host, arena: msg.arena });
      }
    });
    peer.send({ t: 'hello', profile: me });
    setStatus(role === 'host' ? 'Connected! Starting the battle...' : 'Connected! Waiting for the host to start...', 'ok');
    audio.play('levelUp');
  }

  function choose() {
    clear(area);
    setStatus('');
    const hostT = h('div', { class: 'mn-fr-choice host' }, icon('crown', 'mn-fr-ic'), h('b', { class: 't-d outline' }, 'HOST'), h('span', { class: 't-xs' }, 'Pick the arena and send a code'));
    const joinT = h('div', { class: 'mn-fr-choice join' }, icon('swords', 'mn-fr-ic'), h('b', { class: 't-d outline' }, 'JOIN'), h('span', { class: 't-xs' }, "Paste your friend's code"));
    hostT.addEventListener('click', () => { audio.play('click'); host(); });
    joinT.addEventListener('click', () => { audio.play('click'); join(); });
    area.append(
      h('div', { class: 'mn-fr-intro' }, icon('friends', 'l'), h('span', {}, 'Battle a friend device-to-device. No account or server needed: just swap two codes in any chat app!')),
      h('div', { class: 'mn-fr-choices' }, hostT, joinT),
      h('div', { class: 't-xs c-muted center-t' }, 'Friend battles are just for fun: no trophies won or lost.'));
  }

  function back() { return button('BACK', () => { net.clear(); choose(); }, 'gray sm', { icon: 'arrowL' }); }

  function host() {
    clear(area);
    const unlocked = ARENAS.filter((a) => state.p.bestTrophies >= a.trophies);
    let arena = lastArena && unlocked.some((a) => a.id === lastArena) ? lastArena : currentArena(state.p.trophies).id;
    const pick = h('div', { class: 'mn-fr-arenas' });
    const drawPick = () => {
      clear(pick);
      for (const a of unlocked) {
        const b = h('button', { class: `mn-fr-ar ${a.id === arena ? 'on' : ''}`, type: 'button', style: { '--ac': a.color } }, h('span', { class: 't-d outline' }, a.name));
        b.addEventListener('click', () => { arena = a.id; lastArena = a.id; audio.play('tap'); drawPick(); });
        pick.appendChild(b);
      }
    };
    drawPick();
    const go = button('CREATE CODE', async () => {
      go.classList.add('disabled');
      const peer = new Peer('host');
      net.set(peer);
      setStatus('Creating your battle code...', 'wait');
      let code;
      try {
        code = await peer.createOffer();
      } catch (e) {
        setStatus('Could not create a connection: ' + e.message, 'err');
        go.classList.remove('disabled');
        return;
      }
      if (m.closed) return;
      setStatus('');
      clear(area);
      area.append(
        stepHead(1, 'Send this HOST code to your friend'),
        codeBox(code),
        stepHead(2, "Paste your friend's REPLY code"),
        pasteBox('Paste the reply code here...', 'CONNECT', async (reply) => {
          await peer.acceptAnswer(reply);
          setStatus('Connecting...', 'wait');
          await Promise.race([peer.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('Connection timed out. Try again with both players online.')), 20000))]);
          handshake(peer, 'host', arena);
        }),
        back());
    }, 'pink lg', { icon: 'crown' });
    area.append(stepHead(1, 'Choose the arena'), pick, h('div', { class: 'row between' }, back(), go));
  }

  function join() {
    clear(area);
    const peer = new Peer('guest');
    net.set(peer);
    area.append(
      stepHead(1, "Paste your friend's HOST code"),
      pasteBox('Paste the host code here...', 'CREATE REPLY', async (hostCode) => {
        setStatus('Creating your reply...', 'wait');
        const reply = await peer.acceptOffer(hostCode);
        if (m.closed) return;
        clear(area);
        area.append(stepHead(2, 'Send this REPLY code back to the host'), codeBox(reply), back());
        setStatus('Waiting for the host to connect...', 'wait');
        peer.ready.then(() => !m.closed && handshake(peer, 'guest'));
      }),
      back());
  }

  choose();
  return body;
}
