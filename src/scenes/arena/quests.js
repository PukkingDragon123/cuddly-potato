// NPC quest-chain dialogue (Nolan, Juan) on top of state.questState/acceptQuest/completeQuest.
import * as THREE from 'three';
import { questState, acceptQuest, completeQuest } from '../../game/state.js';
import { audio } from '../../core/audio.js';
import { fx } from '../../core/particles.js';
import { pick } from '../../core/util.js';
import { toast, bigBanner } from '../../ui/ui.js';
import { rewardToasts } from './modals.js';

const _v = new THREE.Vector3();

/** Marker for an NPC's quest chain: '!' available / complete, '?' in progress. */
export function questMarker(npcId) {
  const st = questState(npcId);
  if (!st || st.finished) return null;
  if (!st.accepted) return { kind: '!', color: 0xffd23f };
  if (st.done) return { kind: '!', color: 0x7cff6b };
  return { kind: '?', color: 0xc8d8ff };
}

/**
 * Generic quest conversation.
 * L = { intro: {questId: text}, done: {questId: text}, progress(st), finished: [..], decline, hello? }
 */
export async function questTalk(A, n, npcId, L) {
  let st = questState(npcId);
  if (!st) return;
  if (L.hello) await L.hello();
  if (st.finished) {
    await A.line(n, pick(L.finished), { expr: ['happy', 'grin'] });
    return;
  }
  if (st.accepted && st.done) {
    await A.line(n, L.done[st.quest.id] ?? 'You actually did it! Here, you earned this.', { expr: ['star', 'grin'], anim: 'cheer' });
    const title = st.quest.title;
    const rewards = completeQuest(npcId);
    audio.jingle('unlock');
    bigBanner('QUEST COMPLETE!', title, { color: '#7cff6b' });
    fx.confetti(_v.set(n.pos.x, 2, n.pos.z), { count: 70 });
    n.chibi.play('cheer', { dur: 1.6, then: n.idleAnim });
    A.player.emote('victory', 1.6);
    setTimeout(() => rewardToasts(rewards), 700);
    A.hud.refreshQuests();
    await new Promise((r) => setTimeout(r, 900));
    st = questState(npcId);
    if (!st || st.finished) {
      if (L.allDone) await A.line(n, L.allDone, { expr: ['happy', 'grin'] });
      return;
    }
  }
  if (!st.accepted) {
    const intro = L.intro[st.quest.id] ?? 'Got a job for you!';
    const r = await A.line(n, `${intro}\n*${st.quest.title}:* ${st.text}`, { choices: ['Accept!', 'Maybe later'] });
    if (r === 0) {
      acceptQuest(npcId);
      audio.play('upgrade');
      toast(`Quest accepted: *${st.quest.title}*`, { icon: 'quest' });
      n.chibi.play('cheer', { dur: 1.2, then: n.idleAnim });
      A.hud.refreshQuests();
    } else {
      await A.line(n, L.decline ?? 'No worries. I will be right here!', { expr: ['sad', 'flat'] });
    }
    return;
  }
  await A.line(n, L.progress ? L.progress(st) : `How's it going? ${st.text} (${st.prog}/${st.need})`);
}
