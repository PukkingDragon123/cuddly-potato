// Arena HUD: currencies, Lab button, minimap + fast travel, zone banner, quest
// tracker, context action button and emote button.
import { h, $ui, button, icon, modal, toast } from '../../ui/ui.js';
import { audio } from '../../core/audio.js';
import { fmt } from '../../core/util.js';
import { state, questState } from '../../game/state.js';
import { QUEST_CHAINS } from '../../data/arena.js';
import { CHARACTERS } from '../../data/characters.js';
import { ZONES, GRID, HALF } from './layout.js';
import { TYPE_DEFS } from './terrain.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class HUD {
  constructor(A) {
    this.A = A;
    const ui = $ui();
    this.pills = {};
    const pill = (k, ic) => (this.pills[k] = h('div', { class: 'pill' }, icon(ic), h('span', { class: 'v' }, '0')));
    this.labBtn = button('LAB', () => A.goLab(), 'small ar-lab-btn', { icon: 'flask' });
    this.miniCanvas = h('canvas', { width: GRID, height: GRID });
    this.mini = h('div', { class: 'ar-mini', onclick: () => this.openMap() }, this.miniCanvas, h('div', { class: 'ar-mini-lbl outline-sm' }, 'MAP'));
    this.top = h(
      'div',
      { class: 'ar-top' },
      this.labBtn,
      h('div', { class: 'ar-pills' }, pill('coins', 'coin'), pill('bucks', 'bucks'), pill('trophies', 'trophy'), pill('calories', 'calorie')),
      h('div', { class: 'ar-right' }, this.mini),
    );
    ui.appendChild(this.top);
    this.zoneEl = h('div', { class: 'ar-zone px-box' });
    ui.appendChild(this.zoneEl);
    this.questEl = h('div', { class: 'ar-quests' });
    ui.appendChild(this.questEl);
    this.actionIcon = icon('quest');
    this.actionLbl = h('span', {}, 'TALK');
    this.actionBtn = button(null, () => this.pressAction(), 'yellow ar-action hide pulse', { sound: 'tap' });
    this.actionBtn.append(this.actionIcon, this.actionLbl);
    this.emoteBtn = button('', () => A.emote(), 'purple small icon-only ar-emote', { icon: 'music', sound: 'tap' });
    this.emoteBtn.title = 'Dance (Q)';
    ui.appendChild(h('div', { class: 'ar-bottom-r' }, this.emoteBtn, this.actionBtn));
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.hint = h('div', { class: 'ar-hint' }, touch ? 'Tap to walk · drag left side to steer' : 'Click / WASD to walk · E interact · Q dance · M map');
    ui.appendChild(this.hint);
    setTimeout(() => this.hint && (this.hint.style.transition = 'opacity 1s', this.hint.style.opacity = '0'), 9000);
    this.current = null;
    this.prev = {};
    this.unsub = state.on(() => this.refresh());
    this.refresh(true);
    this.buildMiniBg();
    this.miniT = 0;
  }

  dispose() {
    this.unsub && this.unsub();
    clearTimeout(this.zoneTimer);
  }

  refresh(first) {
    const p = state.p;
    for (const k of ['coins', 'bucks', 'trophies', 'calories']) {
      const v = p[k] ?? 0;
      const el = this.pills[k];
      el.querySelector('.v').textContent = fmt(v);
      if (!first && this.prev[k] !== undefined && this.prev[k] !== v) {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
      this.prev[k] = v;
    }
    this.refreshQuests();
  }

  refreshQuests() {
    const el = this.questEl;
    el.textContent = '';
    for (const npc of Object.keys(QUEST_CHAINS)) {
      const st = questState(npc);
      if (!st || st.finished || !st.accepted) continue;
      const nm = CHARACTERS[npc]?.name ?? npc;
      el.appendChild(
        h('div', { class: 'ar-quest' + (st.done ? ' done' : '') },
          h('b', {}, `${nm}: ${st.quest.title}`), h('br'),
          st.done ? 'Complete! Return to ' + nm : `${st.text} ${st.need > 1 ? `(${st.prog}/${st.need})` : ''}`),
      );
    }
  }

  showZone(z, isNew) {
    const el = this.zoneEl;
    el.textContent = '';
    el.style.background = z.color;
    if (isNew) el.appendChild(h('div', { class: 'new' }, 'NEW AREA!'));
    el.appendChild(h('div', { class: 't outline' }, z.name.toUpperCase()));
    if (z.sub) el.appendChild(h('div', { class: 's outline-sm' }, z.sub));
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.zoneTimer);
    this.zoneTimer = setTimeout(() => el.classList.remove('show'), isNew ? 3600 : 2400);
  }

  setAction(it) {
    if (it === this.current) return;
    this.current = it;
    if (!it) {
      this.actionBtn.classList.add('hide');
      return;
    }
    this.actionBtn.classList.remove('hide');
    this.actionLbl.textContent = it.label ?? 'USE';
    this.actionIcon.src = icon(it.icon ?? 'star').src;
    this.actionBtn.className = this.actionBtn.className.replace(/\b(yellow|pink|red|green|purple|blue|orange)\b/g, '').trim() + ' ' + (it.color ?? 'yellow');
  }

  pressAction() {
    const it = this.current;
    if (it && (!it.enabled || it.enabled())) this.A.activate(it);
  }

  // ---------------------------------------------------------------------------
  // Minimap

  buildMiniBg() {
    const c = document.createElement('canvas');
    c.width = c.height = GRID;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(GRID, GRID);
    const t = this.A.terrain;
    for (let j = 0; j < GRID; j++)
      for (let i = 0; i < GRID; i++) {
        const k = j * GRID + i;
        const def = TYPE_DEFS[t.type[k]];
        let col = def.tops[0];
        if (def.name === 'deep') col = 0x1d4f78;
        else if (def.name === 'seabed') col = 0x3a8fc0;
        else if (def.name === 'pondBed') col = 0x4cb6d4;
        else if (def.name === 'chocoBed') col = 0x6b3a22;
        const o = k * 4;
        img.data[o] = (col >> 16) & 255;
        img.data[o + 1] = (col >> 8) & 255;
        img.data[o + 2] = col & 255;
        img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    // locked zones shaded
    for (const z of ZONES) {
      if (this.A.zoneUnlocked(z)) continue;
      const [x0, z0, x1, z1] = z.rect;
      ctx.fillStyle = 'rgba(10,12,30,0.55)';
      ctx.fillRect(x0 + HALF, z0 + HALF, x1 - x0, z1 - z0);
      ctx.fillStyle = '#ff4a4a';
      const cx = (x0 + x1) / 2 + HALF, cz = (z0 + z1) / 2 + HALF;
      ctx.fillRect(cx - 3, cz - 1, 6, 5);
      ctx.fillRect(cx - 2, cz - 4, 1, 3);
      ctx.fillRect(cx + 1, cz - 4, 1, 3);
      ctx.fillRect(cx - 2, cz - 4, 4, 1);
    }
    this.miniBg = c;
  }

  drawMap(ctx, scale = 1) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.miniBg, 0, 0, GRID * scale, GRID * scale);
    const P = (x) => (x + HALF) * scale;
    // points of interest
    for (const poi of this.A.pois) {
      if (poi.visible && !poi.visible()) continue;
      ctx.fillStyle = poi.color;
      const s = (poi.size ?? 3) * Math.max(1, scale * 0.6);
      ctx.fillRect(P(poi.x) - s / 2, P(poi.z) - s / 2, s, s);
    }
    // quest givers
    for (const n of this.A.npcs) {
      if (!n.markerKind) continue;
      ctx.fillStyle = '#ffd23f';
      const s = 4 * Math.max(1, scale * 0.6);
      ctx.fillRect(P(n.pos.x) - s / 2, P(n.pos.z) - s / 2, s, s);
    }
    // player arrow
    const p = this.A.player;
    const px = P(p.pos.x), pz = P(p.pos.z);
    const a = p.root.rotation.y;
    const r = 4 * Math.max(1, scale * 0.7);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-a + Math.PI);
    ctx.fillStyle = '#0d1029';
    ctx.beginPath();
    ctx.moveTo(0, -r - 1.5);
    ctx.lineTo(r + 1.5, r + 1.5);
    ctx.lineTo(-r - 1.5, r + 1.5);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, r);
    ctx.lineTo(-r, r);
    ctx.fill();
    ctx.restore();
  }

  update(dt) {
    this.miniT -= dt;
    if (this.miniT <= 0) {
      this.miniT = 0.15;
      this.drawMap(this.miniCanvas.getContext('2d'), 1);
    }
  }

  openMap() {
    if (this.mapModal && !this.mapModal.closed) return;
    audio.play('tap');
    const A = this.A;
    const S = 3;
    const cv = h('canvas', { width: GRID * S, height: GRID * S });
    this.drawMap(cv.getContext('2d'), S);
    const list = h('div', { class: 'ar-zl' });
    for (const z of ZONES) {
      const open = A.zoneUnlocked(z);
      const ar = A.zoneArenaReq(z);
      list.appendChild(
        h('div', { class: 'row' },
          h('div', { class: 'sw', style: { background: z.color } }),
          h('div', { class: 'nm' }, z.name, z.seasonal ? h('span', { class: 'pinkt tiny' }, ' SEASON') : null),
          open
            ? button('Go', () => {
              m.close();
              A.fastTravel(z);
            }, 'small green')
            : h('div', { class: 'lk' }, icon('lock'), `${ar} `, icon('trophy')),
        ),
      );
    }
    const m = (this.mapModal = modal({
      title: 'ISLAND MAP',
      color: 'green',
      size: 'mid',
      body: h('div', { class: 'ar-map' }, cv, list),
    }));
    // tap on map to walk there
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * GRID - HALF;
      const z = ((e.clientY - r.top) / r.height) * GRID - HALF;
      m.close();
      if (!A.player.walkTo(x, z)) toast("Can't walk there!", { icon: 'x' });
      else A.showTapMarker(x, z);
    });
  }
}

export { hex };
