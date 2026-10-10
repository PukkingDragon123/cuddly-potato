// Friend Battle lobby: serverless P2P matchmaking by exchanging battle codes.
import { h, button, icon, modal, toast } from '../ui.js';
import { audio } from '../../core/audio.js';
import { Peer, net, p2pSupported } from '../../net/p2p.js';
import { game } from '../../game/game.js';
import { state } from '../../game/state.js';
import { currentArena } from '../../data/arena.js';
import { playerSide } from '../../game/battle/loadout.js';

function codeBox(code) {
  const ta = h('textarea', { class: 'px-input friend-code', readonly: true, rows: '3' });
  ta.value = code;
  const copy = button('Copy', async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Battle code copied!', { icon: 'check' });
    } catch (e) {
      ta.select();
      document.execCommand?.('copy');
      toast('Select the code and copy it', { icon: 'quest' });
    }
  }, 'blue small', { icon: 'quest' });
  const share = navigator.share ? button('Share', () => navigator.share({ title: 'MrBeast Swarmers battle code', text: code }).catch(() => {}), 'pink small', { icon: 'play' }) : null;
  return h('div', { class: 'col' }, ta, h('div', { class: 'row wrap' }, copy, share));
}

function pasteBox(placeholder, label, onGo) {
  const ta = h('textarea', { class: 'px-input friend-code', rows: '3', placeholder });
  const err = h('div', { class: 'small redt' });
  const go = button(label, async () => {
    err.textContent = '';
    go.classList.add('disabled');
    try {
      await onGo(ta.value.trim());
    } catch (e) {
      err.textContent = e.message || 'That code did not work.';
      go.classList.remove('disabled');
      audio.play('error');
    }
  }, 'green', { icon: 'check' });
  const paste = navigator.clipboard?.readText ? button('Paste', async () => {
    try { ta.value = await navigator.clipboard.readText(); } catch (e) { /* denied */ }
  }, 'small gray') : null;
  return h('div', { class: 'col' }, ta, h('div', { class: 'row wrap' }, paste, go), err);
}

/** Exchange profiles, then the host starts the battle. */
function handshake(peer, role, setStatus, m) {
  const me = myBattleProfile();
  let started = false;
  peer.on((msg) => {
    if (msg.t === 'hello' && role === 'host' && !started) {
      started = true;
      const arena = currentArena(state.p.trophies).id === 'labYard' ? 'mart' : currentArena(state.p.trophies).id;
      peer.send({ t: 'start', host: me, guest: msg.profile, arena, seed: (Math.random() * 1e9) | 0 });
      m.close();
      game.go('battle', { mode: 'friend', role: 'host', remote: msg.profile, arena });
    }
    if (msg.t === 'start' && role === 'guest' && !started) {
      started = true;
      m.close();
      game.go('battle', { mode: 'friend', role: 'guest', remote: msg.host, arena: msg.arena });
    }
  });
  peer.send({ t: 'hello', profile: me });
  setStatus(role === 'host' ? 'Connected! Starting the battle...' : 'Connected! Waiting for the host to start...');
  audio.play('levelUp');
}

/** The player's battle loadout, shared with the opponent. */
export function myBattleProfile() {
  return playerSide();
}

export function openFriendBattle() {
  if (!p2pSupported()) {
    toast('Your browser does not support peer-to-peer battles.', { icon: 'x' });
    return;
  }
  const status = h('div', { class: 'small gold' }, '');
  const area = h('div', { class: 'col' });
  const setStatus = (t) => (status.textContent = t);
  const body = h('div', { class: 'col friend-lobby' },
    h('div', { class: 'small' }, 'Battle a friend directly, device to device (no account or server needed). One player HOSTS and sends a battle code; the other JOINS and sends back a reply code. Use any chat app to swap codes.'),
    area, status);
  const m = modal({
    title: 'FRIEND BATTLE', color: 'pink', size: 'mid', body,
    onClose: () => {
      if (!net.peer?.open) net.clear();
    },
  });
  const choose = () => {
    area.replaceChildren(h('div', { class: 'row wrap center' },
      button('HOST A BATTLE', host, 'pink big', { icon: 'crown' }),
      button('JOIN A BATTLE', join, 'blue big', { icon: 'sword' })));
  };
  async function host() {
    const peer = new Peer('host');
    net.set(peer);
    area.replaceChildren(h('div', { class: 'muted' }, 'Creating your battle code...'));
    let code;
    try {
      code = await peer.createOffer();
    } catch (e) {
      area.replaceChildren(h('div', { class: 'redt' }, 'Could not create a connection: ' + e.message));
      return;
    }
    area.replaceChildren(
      h('div', { class: 'section-title' }, '1. Send this HOST code to your friend'),
      codeBox(code),
      h('div', { class: 'section-title' }, "2. Paste your friend's REPLY code"),
      pasteBox('Paste reply code here...', 'Connect', async (reply) => {
        await peer.acceptAnswer(reply);
        setStatus('Connecting...');
        await Promise.race([peer.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('Connection timed out. Try again (both players should be online now).')), 20000))]);
        handshake(peer, 'host', setStatus, m);
      }));
  }
  function join() {
    const peer = new Peer('guest');
    net.set(peer);
    area.replaceChildren(
      h('div', { class: 'section-title' }, "1. Paste your friend's HOST code"),
      pasteBox('Paste host code here...', 'Create reply', async (hostCode) => {
        const reply = await peer.acceptOffer(hostCode);
        area.replaceChildren(
          h('div', { class: 'section-title' }, '2. Send this REPLY code back to the host'),
          codeBox(reply),
          h('div', { class: 'muted small' }, 'Waiting for the host to connect...'));
        peer.ready.then(() => handshake(peer, 'guest', setStatus, m));
      }));
  }
  choose();
}
