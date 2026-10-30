// RESEARCH TREE: the Lab's research screen (replaces the old Commander perk rolls).
//
//   mountResearchTree(el, ctx, opts) -> { dispose(), refresh(), focus(id) }
//     el:   any sized container (fills it; works from 320 px wide to wide landscape)
//     ctx:  the home tab ctx ({ refresh, toast, openTab, ... }), all optional
//     opts: { header: true (title + level count + your rank; off by default when host === 'lab',
//             whose wall screen has its own title bar), title: true, focus: nodeId, host }
//
// Rows of pipe-connected nodes (data: src/data/research.js) on a pan / zoom
// blueprint (drag, pinch, wheel, +/- buttons). Researched pipes carry flowing
// goo; locked nodes wear chains, a padlock and the rank medal they need. Tap a
// node for its sheet (effect now -> next, cost, time, rank, RESEARCH). The lab
// bench at the bottom shows the active research as a bubbling beaker with the
// time left and SPEED UP (Beast Bucks). One research at a time; timers run
// while the game is closed (state.js), finished levels pop when you come back.
import { h, icon, button, sparkle, rich, setDisabled, modal } from '../ui.js';
import { audio } from '../../core/audio.js';
import {
  state, researchStatus, onResearch, canResearch, startResearch, speedUpResearch, researchTimeLeft, researchSpeedUpPrice,
  checkResearch, researchFresh, markResearchSeen, takePerkRefund, labLevel,
} from '../../game/state.js';
import { BRANCHES, BRANCH, NODES, NODE_LIST, TOTAL_LEVELS, nodeFx, nodeText, reqMet, nodeCost } from '../../data/research.js';
import { rankMedal, rankName } from '../rankMedal.js';
import { rsIconURL, frameURL, lampURL, chainURL, junctionURL, drawBeaker, drawBlueprint, BEAKER_W, BEAKER_H } from './researchArt.js';
import { deny, notify, fmtN, fmtLong, confirmBox } from './common.js';
import './research.css';

// world layout (world px; the world is scaled by the zoom)
const PX = 112, PY = 158, T = 80, OX = 70, OY = 92;
const COLS = Math.max(...NODE_LIST.map((n) => n.col)) + 1;
const WW = OX * 2 + (COLS - 1) * PX, WH = OY + (BRANCHES.length - 1) * PY + 84;
const pos = (n) => ({ x: OX + n.col * PX, y: OY + BRANCH[n.branch].row * PY });
const ZMIN = 0.36, ZMAX = 1.5;

const fmtSec = (s) => fmtLong(Math.max(0, s));
const effectLine = (n, lv) => (lv > 0 ? n.text(nodeFx(n, lv)) : 'Not researched yet');

/** Small state helpers shared by the tile, the sheet and the bench. */
function info(n) {
  const levels = state.p.research.levels;
  const lv = levels[n.id] ?? 0;
  const act = state.p.research.active;
  const busy = act?.id === n.id;
  const reqOk = reqMet(n, levels), rankOk = labLevel() >= n.rank;
  const max = lv >= n.max;
  const locked = !max && lv === 0 && (!reqOk || !rankOk);
  return { lv, busy, reqOk, rankOk, max, locked, open: !max && !locked && !busy, act };
}

export function mountResearchTree(el, ctx = {}, opts = {}) {
  checkResearch();
  const root = h('div', { class: 'rs-root' });
  const view = h('div', { class: 'rs-view' });
  const world = h('div', { class: 'rs-world', style: { width: WW + 'px', height: WH + 'px' } });
  view.appendChild(world);
  root.appendChild(view);
  el.appendChild(root);

  // ------------------------------------------------------------------ build the tree
  const nodes = new Map(); // id -> { el, fr, lamp, lv, mini, n }
  const pipes = []; // { el, goo, req, id, kind }
  // faint blueprint sketches in the empty corners of the grid (world px)
  const bp = h('canvas', { class: 'rs-bp', style: { width: WW + 'px', height: WH + 'px' } });
  world.appendChild(bp);
  const at = (col, row) => ({ x: OX + col * PX, y: OY + row * PY });
  drawBlueprint(bp, WW, WH, [
    { kind: 'flask', ...at(0.6, 6.6), s: 1.3 },
    { kind: 'gear', ...at(9.2, 0.5), s: 1.2 },
    { kind: 'coil', ...at(2.2, 2.05), s: 0.9 },
    { kind: 'dna', ...at(9.6, 3.5), s: 1 },
    { kind: 'gear', ...at(2.6, 8.1), s: 0.8 },
  ]);
  const pipeLayer = h('div', { class: 'rs-pipes' });
  world.appendChild(pipeLayer);
  const addPipe = (kind, x, y, len, req, id, dir) => {
    const goo = h('i', { class: 'rs-goo' });
    const p = h('div', { class: `rs-pipe ${kind} ${dir}` }, goo);
    if (kind === 'h') Object.assign(p.style, { left: x + 'px', top: y - 8 + 'px', width: len + 'px' });
    else Object.assign(p.style, { left: x - 8 + 'px', top: y + 'px', height: len + 'px' });
    pipeLayer.appendChild(p);
    pipes.push({ el: p, req, id });
  };
  const joints = [];
  for (const n of NODE_LIST) {
    if (!n.req) continue;
    const a = pos(NODES[n.req]), b = pos(n);
    if (NODES[n.req].branch === n.branch) addPipe('h', a.x + T / 2 - 6, b.y, b.x - a.x - T + 12, n.req, n.id, 'fw');
    else {
      // a sub-branch: down (or up) out of the parent, a junction box, then right into the first node
      const down = b.y > a.y;
      const y0 = down ? a.y + T / 2 : b.y, y1 = down ? b.y : a.y - T / 2;
      addPipe('v', a.x, y0, y1 - y0, n.req, n.id, down ? 'fw' : 'bw');
      addPipe('h', a.x, b.y, b.x - a.x - T / 2 + 6, n.req, n.id, 'fw');
      const j = h('img', { class: 'rs-joint', src: junctionURL(false), alt: '', draggable: 'false', style: { left: a.x - 13 + 'px', top: b.y - 13 + 'px' } });
      pipeLayer.appendChild(j);
      joints.push({ el: j, req: n.req });
    }
  }
  // branch name tags (above each branch's first node)
  for (const br of BRANCHES) {
    const first = NODE_LIST.filter((n) => n.branch === br.id).sort((a, b) => a.col - b.col)[0];
    const p = pos(first);
    world.appendChild(h('div', { class: 'rs-tag t-d', style: { left: p.x + 'px', top: p.y - T / 2 - 40 + 'px', '--bc': br.color, '--bi': br.ink } },
      h('img', { class: 'rs-tag-ic', src: rsIconURL(br.icon), alt: '', draggable: 'false' }), h('span', {}, br.name)));
  }
  const CHAIN = chainURL();
  for (const n of NODE_LIST) {
    const p = pos(n);
    const br = BRANCH[n.branch];
    const fr = h('img', { class: 'rs-fr', alt: '', draggable: 'false' });
    const lamp = h('img', { class: 'rs-lamp', alt: '', draggable: 'false' });
    const lv = h('div', { class: 'rs-lv t-d' });
    const mini = h('canvas', { class: 'rs-mini', width: BEAKER_W, height: BEAKER_H });
    const e = h('div', { class: 'rs-node', 'data-id': n.id, style: { left: p.x - T / 2 + 'px', top: p.y - T / 2 + 'px', '--bc': br.color } },
      fr, h('img', { class: 'rs-ic', src: rsIconURL(n.icon), alt: '', draggable: 'false' }), lamp,
      n.sig ? h('img', { class: 'rs-sig', src: rsIconURL('star'), alt: '', draggable: 'false' }) : null,
      h('img', { class: 'rs-chain', src: CHAIN, alt: '', draggable: 'false' }),
      h('img', { class: 'rs-pad', src: rsIconURL('lock'), alt: '', draggable: 'false' }),
      n.rank > 1 ? h('div', { class: 'rs-rank' }, rankMedal(n.rank, { shine: false })) : null,
      mini, lv);
    world.appendChild(e);
    nodes.set(n.id, { el: e, fr, lamp, lv, mini, n });
  }

  // ------------------------------------------------------------------ HUD (screen space)
  const inLab = opts.host === 'lab';
  const showTitle = opts.title ?? !inLab;
  // (in the lab the wall screen has its own title bar and the lobby's top bar shows the rank medal)
  const head = (opts.header ?? !inLab) === false ? null : h('div', { class: `rs-head ${showTitle ? '' : 'bare'}` });
  const lvChip = h('div', { class: 'rs-count t-d' });
  const rankBox = h('div', { class: 'rs-myrank' });
  if (head) {
    if (showTitle) head.append(h('div', { class: 'rs-title' }, icon('flask', 'rs-title-ic'), h('div', { class: 'rs-title-t' }, h('b', { class: 't-d outline' }, 'RESEARCH'), lvChip)));
    head.append(h('div', { class: 'grow' }), rankBox);
    root.appendChild(head);
  }
  root.classList.toggle('in-lab', inLab);
  const zoomBox = h('div', { class: 'rs-zoom' },
    button('+', () => zoomBy(1.25), 'blue sm rs-zb', { sound: 'tap' }),
    button('-', () => zoomBy(0.8), 'blue sm rs-zb', { sound: 'tap' }),
    button('', () => focusNode(bestFocus(), true), 'teal sm rs-zb', { icon: 'pin', sound: 'tap' }));
  root.appendChild(zoomBox);
  const benchCv = h('canvas', { class: 'rs-beaker', width: BEAKER_W, height: BEAKER_H });
  const benchT1 = h('div', { class: 'rs-bench-k t-d' });
  const benchT2 = h('div', { class: 'rs-bench-n t-d outline' });
  const benchT3 = h('div', { class: 'rs-bench-t t-d' });
  const benchBtn = h('div', { class: 'rs-bench-act' });
  const bench = h('div', { class: 'rs-bench sk-panel-dark' }, h('div', { class: 'rs-bench-glass' }, benchCv), h('div', { class: 'rs-bench-txt' }, benchT1, benchT2, benchT3), benchBtn);
  bench.addEventListener('click', (e) => {
    if (e.target.closest('.btn')) return;
    const a = state.p.research.active;
    if (a) { focusNode(a.id, true); openSheet(a.id); } else focusNode(bestFocus(), true);
  });
  root.appendChild(bench);
  const sheetHost = h('div', { class: 'rs-sheet-host' });
  root.appendChild(sheetHost);

  // ------------------------------------------------------------------ pan / zoom
  let z = 1, tx = 0, ty = 0, vw = 1, vh = 1;
  // the tree's free area: below the header (and the bench when it sits on top, in landscape), above the bench
  const pad = () => {
    const top = bench.offsetTop < vh / 2;
    const ht = head ? head.offsetTop + head.offsetHeight : 0;
    return { t: Math.max(ht, top ? bench.offsetTop + bench.offsetHeight : 0) + 8, b: top ? 10 : vh - bench.offsetTop + 8 };
  };
  function clampView() {
    const P = pad();
    const avail = vh - P.t - P.b;
    if (WW * z <= vw - 24) tx = (vw - WW * z) / 2;
    else tx = Math.min(24, Math.max(vw - WW * z - 24, tx));
    if (WH * z <= avail) ty = P.t + (avail - WH * z) / 2;
    else ty = Math.min(P.t + 10, Math.max(vh - P.b - WH * z - 10, ty));
  }
  function apply() {
    clampView();
    world.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${z.toFixed(4)})`;
    view.style.setProperty('--gx', tx.toFixed(1) + 'px');
    view.style.setProperty('--gy', ty.toFixed(1) + 'px');
    view.style.setProperty('--gs', (28 * z).toFixed(2) + 'px');
  }
  function zoomAt(nz, cx, cy) {
    nz = Math.max(ZMIN, Math.min(ZMAX, nz));
    const wx = (cx - tx) / z, wy = (cy - ty) / z;
    z = nz;
    tx = cx - wx * z;
    ty = cy - wy * z;
    apply();
  }
  let zoomAnim = 0;
  function zoomBy(k) {
    const P = pad();
    const cx = vw / 2, cy = P.t + (vh - P.t - P.b) / 2;
    const from = z, to = Math.max(ZMIN, Math.min(ZMAX, z * k));
    const t0 = performance.now();
    cancelAnimationFrame(zoomAnim);
    const step = () => {
      const k2 = Math.min(1, (performance.now() - t0) / 180);
      const e = 1 - (1 - k2) ** 3;
      zoomAt(from + (to - from) * e, cx, cy);
      if (k2 < 1) zoomAnim = requestAnimationFrame(step);
    };
    step();
  }
  function defaultZoom() {
    const P = pad();
    const avail = vh - P.t - P.b;
    return Math.max(0.7, Math.min(1, Math.min(vw / 500, avail / 600)));
  }
  let panAnim = 0;
  function focusNode(id, smooth = false) {
    const n = NODES[id];
    if (!n) return;
    const p = pos(n), P = pad();
    const tx1 = vw / 2 - p.x * z, ty1 = P.t + (vh - P.t - P.b) / 2 - p.y * z;
    cancelAnimationFrame(panAnim);
    if (!smooth) { tx = tx1; ty = ty1; apply(); return; }
    const tx0 = tx, ty0 = ty, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 380);
      const e = 1 - (1 - k) ** 3;
      tx = tx0 + (tx1 - tx0) * e;
      ty = ty0 + (ty1 - ty0) * e;
      apply();
      if (k < 1) panAnim = requestAnimationFrame(step);
    };
    step();
  }
  function bestFocus() {
    const a = state.p.research.active;
    if (a && NODES[a.id]) return a.id;
    const open = NODE_LIST.filter((n) => info(n).open);
    const can = open.find((n) => canResearch(n.id).ok);
    return (can ?? open[0] ?? NODE_LIST[0]).id;
  }

  // pointer input: drag to pan, pinch to zoom, tap a node to open it
  const ptrs = new Map();
  let gesture = null;
  view.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button > 0) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { view.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    cancelAnimationFrame(panAnim);
    const r = view.getBoundingClientRect();
    if (ptrs.size === 1) gesture = { kind: 'tap', x0: e.clientX, y0: e.clientY, tx0: tx, ty0: ty, target: e.target.closest('.rs-node'), t0: performance.now() };
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: z, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top, wx: ((a.x + b.x) / 2 - r.left - tx) / z, wy: ((a.y + b.y) / 2 - r.top - ty) / z };
    }
  });
  view.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId) || !gesture) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.kind === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const r = view.getBoundingClientRect();
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      z = Math.max(ZMIN, Math.min(ZMAX, gesture.z0 * (d / gesture.d0)));
      const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
      tx = cx - gesture.wx * z;
      ty = cy - gesture.wy * z;
      apply();
      return;
    }
    const dx = e.clientX - gesture.x0, dy = e.clientY - gesture.y0;
    if (gesture.kind === 'tap' && Math.hypot(dx, dy) > 8) { gesture.kind = 'pan'; view.classList.add('panning'); }
    if (gesture.kind === 'pan') { tx = gesture.tx0 + dx; ty = gesture.ty0 + dy; apply(); }
  });
  const endPtr = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (gesture?.kind === 'tap' && e.type === 'pointerup') {
      const node = gesture.target;
      if (node) { audio.unlock(); openSheet(node.dataset.id); }
      else if (sheet) closeSheet();
    }
    if (ptrs.size === 0) { gesture = null; view.classList.remove('panning'); }
    else if (gesture?.kind === 'pinch') {
      // one finger left: keep panning from here
      const [a] = [...ptrs.values()];
      gesture = { kind: 'pan', x0: a.x, y0: a.y, tx0: tx, ty0: ty };
    }
  };
  view.addEventListener('pointerup', endPtr);
  view.addEventListener('pointercancel', endPtr);
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = view.getBoundingClientRect();
    if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoomAt(z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    else { tx -= e.deltaX; apply(); }
  }, { passive: false });

  // ------------------------------------------------------------------ per-node visuals
  const LAMP = { lock: 'off', open: 'open', got: 'got', max: 'max', busy: 'busy' };
  function paintNode(id) {
    const N = nodes.get(id);
    const n = N.n, I = info(n);
    const st = I.busy ? 'busy' : I.max ? 'max' : I.locked ? 'lock' : I.lv > 0 ? 'got' : 'open';
    const frameSt = st === 'busy' ? (I.lv > 0 ? 'got' : 'open') : st;
    const src = frameURL(BRANCH[n.branch].color, frameSt);
    if (N.fr.getAttribute('src') !== src) N.fr.src = src;
    const ls = lampURL(LAMP[st]);
    if (N.lamp.getAttribute('src') !== ls) N.lamp.src = ls;
    const can = st !== 'busy' && st !== 'lock' && st !== 'max' && canResearch(id).ok;
    N.el.className = `rs-node st-${st}${can ? ' can' : ''}${!I.rankOk && I.lv === 0 ? ' rank-lock' : ''}${n.sig ? ' sig' : ''}${sheet?.id === id ? ' sel' : ''}`;
    if (!I.busy) N.lv.textContent = I.max ? 'MAX' : `${I.lv}/${n.max}`;
    N.el.setAttribute('aria-label', `${n.name}, level ${I.lv} of ${n.max}`);
  }
  function paintPipes() {
    const L = state.p.research.levels, act = state.p.research.active;
    for (const p of pipes) {
      const on = (L[p.req] ?? 0) >= 1;
      p.el.classList.toggle('on', on);
      p.el.classList.toggle('full', on && (L[p.id] ?? 0) >= 1);
      p.el.classList.toggle('busy', on && act?.id === p.id);
    }
    for (const j of joints) {
      const on = (L[j.req] ?? 0) >= 1;
      const src = junctionURL(on);
      if (j.el.getAttribute('src') !== src) j.el.src = src;
    }
  }
  function paintHud() {
    const L = state.p.research.levels;
    const done = NODE_LIST.reduce((a, n) => a + Math.min(n.max, L[n.id] ?? 0), 0);
    lvChip.textContent = `${done}/${TOTAL_LEVELS} LEVELS`;
    const ll = labLevel();
    if (rankBox.dataset.lv !== String(ll)) {
      rankBox.dataset.lv = String(ll);
      rankBox.replaceChildren(rankMedal(ll, { shine: false, cls: 'rs-myrank-m' }), h('div', { class: 'rs-myrank-t' }, h('small', { class: 't-d' }, 'YOUR RANK'), h('b', { class: 't-d outline' }, rankName(ll))));
    }
  }
  let benchMode = '';
  function paintBench() {
    const a = state.p.research.active;
    const n = a ? NODES[a.id] : null;
    if (n) {
      const left = researchTimeLeft();
      if (benchMode !== 'busy:' + a.id + ':' + a.level) {
        benchMode = 'busy:' + a.id + ':' + a.level;
        bench.classList.add('busy');
        bench.classList.remove('idle', 'ready');
        bench.style.setProperty('--bc', BRANCH[n.branch].color);
        benchT1.textContent = `RESEARCHING LV ${a.level}`;
        benchT2.textContent = n.name;
        const b = button('SPEED UP', () => doSpeedUp(b), 'pink', { price: { cur: 'bucks', amount: researchSpeedUpPrice() }, sound: 'tap' });
        b.classList.add('rs-speed');
        benchBtn.replaceChildren(b);
      }
      benchT3.textContent = `${fmtSec(left)} left`;
      const price = researchSpeedUpPrice();
      const pr = benchBtn.querySelector('.price span');
      if (pr && pr.textContent !== String(price)) pr.textContent = String(price);
      const sb = benchBtn.querySelector('.btn');
      if (sb) sb.classList.toggle('poor', state.p.bucks < price);
    } else {
      const can = NODE_LIST.find((x) => canResearch(x.id).ok);
      const mode = can ? 'ready' : 'idle';
      if (benchMode !== mode) {
        benchMode = mode;
        bench.classList.remove('busy');
        bench.classList.toggle('ready', !!can);
        bench.classList.toggle('idle', !can);
        bench.style.removeProperty('--bc');
        benchT1.textContent = 'LAB BENCH';
        benchT2.textContent = can ? 'Ready for science' : 'Nothing to research';
        benchT3.textContent = can ? 'Tap a glowing node' : 'Earn coins or rank up';
        benchBtn.replaceChildren(can ? button('PICK', () => { focusNode(bestFocus(), true); openSheet(bestFocus()); }, 'green', { icon: 'flask', sound: 'tap' }) : h('span'));
      }
    }
  }
  function paintAll() {
    for (const id of nodes.keys()) paintNode(id);
    paintPipes();
    paintHud();
    paintBench();
    if (sheet) sheet.paint();
  }

  // ------------------------------------------------------------------ detail sheet
  let sheet = null;
  function openSheet(id) {
    const n = NODES[id];
    if (!n) return;
    if (sheet?.id === id) return;
    audio.play('cardPick');
    const prev = sheet;
    sheet = buildSheet(n);
    if (prev) prev.el.remove();
    else sheet.el.classList.add('in');
    sheetHost.appendChild(sheet.el);
    root.classList.add('sheet-open');
    sheet.paint();
    for (const k of nodes.keys()) nodes.get(k).el.classList.toggle('sel', k === id);
    // keep the node visible next to the sheet
    requestAnimationFrame(() => {
      const p = pos(n), r = sheet?.el.getBoundingClientRect(), vr = view.getBoundingClientRect();
      if (!r) return;
      const sx = p.x * z + tx, sy = p.y * z + ty;
      const land = root.classList.contains('land');
      const coveredY = !land && sy + T * z * 0.7 > r.top - vr.top;
      const coveredX = land && sx + T * z * 0.7 > r.left - vr.left;
      if (coveredY || coveredX || sy < pad().t + T * z * 0.6) {
        const P = pad();
        const tx1 = land ? (r.left - vr.left) / 2 - p.x * z : tx;
        const ty1 = land ? ty : Math.max(P.t + T * z * 0.7, (r.top - vr.top) * 0.5) - p.y * z;
        const tx0 = tx, ty0 = ty, t0 = performance.now();
        cancelAnimationFrame(panAnim);
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / 320);
          const e = 1 - (1 - k) ** 3;
          tx = tx0 + (tx1 - tx0) * e;
          ty = ty0 + (ty1 - ty0) * e;
          apply();
          if (k < 1) panAnim = requestAnimationFrame(step);
        };
        step();
      }
    });
  }
  function closeSheet() {
    if (!sheet) return;
    const s = sheet;
    sheet = null;
    root.classList.remove('sheet-open');
    s.el.classList.remove('in');
    s.el.classList.add('out');
    setTimeout(() => s.el.remove(), 200);
    for (const N of nodes.values()) N.el.classList.remove('sel');
  }

  function buildSheet(n) {
    const br = BRANCH[n.branch];
    const tile = h('div', { class: 'rs-sh-tile', style: { '--bc': br.color } }, h('img', { class: 'rs-fr' }), h('img', { class: 'rs-ic', src: rsIconURL(n.icon), alt: '' }));
    const close = button('', () => closeSheet(), 'red sm icon-only rs-sh-x', { icon: 'x', sound: 'tap' });
    const lvl = h('div', { class: 'rs-sh-lv' });
    const now = h('div', { class: 'rs-fx now' });
    const next = h('div', { class: 'rs-fx next' });
    const reqs = h('div', { class: 'rs-sh-reqs' });
    const cost = h('div', { class: 'rs-sh-cost' });
    const foot = h('div', { class: 'rs-sh-foot' });
    // info scrolls; the cost + action row stays pinned at the bottom (short landscape screens)
    // (two columns side by side in landscape: who it is | what it does)
    const body = h('div', { class: 'rs-sh-body' },
      h('div', { class: 'rs-sh-col a' },
        h('div', { class: 'rs-sh-top' }, tile, h('div', { class: 'rs-sh-name' },
          h('div', { class: 't-d outline rs-sh-title' }, n.name),
          h('div', { class: 'row gap-s wrap' }, h('span', { class: 'rs-chip t-d', style: { '--bc': br.color, '--bi': br.ink } }, br.name), n.sig ? h('span', { class: 'rs-chip sig t-d' }, 'SIGNATURE') : null)), close),
        h('div', { class: 'rs-sh-line' }, n.line), lvl),
      h('div', { class: 'rs-sh-col b' }, h('div', { class: 'rs-fxbox' }, now, next), reqs));
    const el = h('div', { class: 'rs-sheet sk-panel', 'data-id': n.id }, body, h('div', { class: 'rs-sh-bottom' }, cost, foot));
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    let footKey = '';
    const self = {
      id: n.id, el,
      paint() {
        const I = info(n);
        const c = canResearch(n.id);
        tile.firstChild.src = frameURL(br.color, I.max ? 'max' : I.locked ? 'lock' : I.lv > 0 ? 'got' : 'open');
        // level pips
        lvl.replaceChildren(h('span', { class: 't-d' }, I.max ? 'MAXED OUT' : `LEVEL ${I.lv}/${n.max}`),
          h('span', { class: 'rs-pips' }, ...Array.from({ length: n.max }, (_, k) => h('i', { class: k < I.lv ? 'on' : I.busy && k === I.lv ? 'busy' : '' }))));
        now.replaceChildren(h('b', { class: 't-d' }, 'NOW'), h('span', {}, effectLine(n, I.lv)));
        if (I.max) next.replaceChildren(h('b', { class: 't-d' }, 'DONE'), h('span', {}, 'Fully researched. Nice.'));
        else next.replaceChildren(h('b', { class: 't-d' }, `LV ${I.lv + 1}`), h('span', {}, nodeText(n, I.lv + 1)));
        // requirements (rank + the node it hangs off)
        const rows = [];
        if (!I.max) {
          rows.push(h('div', { class: `rs-req ${I.rankOk ? 'ok' : 'no'}` }, rankMedal(n.rank, { shine: false, cls: 'rs-req-m' }),
            h('span', { class: 'rs-req-t', html: rich(I.rankOk ? `*${rankName(n.rank)}* rank` : `Needs *${rankName(n.rank)}* rank (Lab Level ${n.rank})`) }), icon(I.rankOk ? 'check' : 'lock', 'rs-req-ic')));
          if (n.req) {
            const R = NODES[n.req];
            const row = h('div', { class: `rs-req ${I.reqOk ? 'ok' : 'no'} link` }, h('img', { class: 'rs-req-n', src: rsIconURL(R.icon), alt: '' }),
              h('span', { class: 'rs-req-t', html: rich(I.reqOk ? `After *${R.name}*` : `Research *${R.name}* first`) }), icon(I.reqOk ? 'check' : 'lock', 'rs-req-ic'));
            row.addEventListener('click', () => { focusNode(R.id, true); openSheet(R.id); });
            rows.push(row);
          }
          if (c.reason === 'busy' && I.act) {
            const A = NODES[I.act.id];
            const row = h('div', { class: 'rs-req busy link' }, h('img', { class: 'rs-req-n', src: rsIconURL(A.icon), alt: '' }),
              h('span', { class: 'rs-req-t', html: rich(`Bench busy: *${A.name}* (${fmtSec(researchTimeLeft())})`) }), icon('clock', 'rs-req-ic'));
            row.addEventListener('click', () => { focusNode(A.id, true); openSheet(A.id); });
            rows.push(row);
          }
        }
        reqs.replaceChildren(...rows);
        // cost / time
        if (I.max || I.busy) cost.replaceChildren();
        else cost.replaceChildren(
          h('div', { class: 'rs-cost' }, icon('coin'), h('b', { class: 't-d outline' }, fmtN(c.cost))),
          h('div', { class: 'rs-cost' }, icon('clock'), h('b', { class: 't-d outline' }, fmtSec(c.time))));
        cost.classList.toggle('poor', !I.max && state.p.coins < c.cost);
        // action
        const key = `${I.max}|${I.busy}|${c.reason}|${I.lv}`;
        if (key !== footKey) {
          footKey = key;
          if (I.max) foot.replaceChildren(h('div', { class: 'rs-maxed t-d outline' }, icon('star'), 'MAXED'));
          else if (I.busy) {
            const sb = button('SPEED UP', () => doSpeedUp(sb), 'pink lg', { price: { cur: 'bucks', amount: researchSpeedUpPrice() }, sound: 'tap' });
            sb.classList.add('rs-speed');
            foot.replaceChildren(h('div', { class: 'rs-sh-busy' }, h('canvas', { class: 'rs-beaker sm', width: BEAKER_W, height: BEAKER_H }), h('b', { class: 't-d outline rs-sh-left' })), sb);
          } else {
            const go = button('RESEARCH', () => doResearch(n, go), 'green lg', { price: { cur: 'coins', amount: c.cost }, sound: 'tap' });
            go.classList.add('rs-go');
            setDisabled(go, !c.ok);
            foot.replaceChildren(go);
          }
        }
        if (I.busy) {
          const t = foot.querySelector('.rs-sh-left');
          if (t) t.textContent = `${fmtSec(researchTimeLeft())} left`;
          const pr = foot.querySelector('.rs-speed .price span');
          if (pr) pr.textContent = String(researchSpeedUpPrice());
        } else if (!I.max) {
          const go = foot.querySelector('.rs-go');
          if (go) setDisabled(go, !c.ok);
        }
      },
    };
    return self;
  }

  // ------------------------------------------------------------------ actions
  function denyReason(n, c, btn) {
    const act = state.p.research.active;
    const msg = {
      locked: `Research *${NODES[n.req]?.name}* first.`,
      rank: `Needs *${rankName(n.rank)}* rank. Level up your Lab by upgrading cards and winning.`,
      busy: `The bench is busy with *${act ? NODES[act.id]?.name : ''}*. One experiment at a time.`,
      coins: `Not enough Beast Coins. This one costs *${fmtN(c.cost)}*.`,
      max: 'Already maxed out.',
      active: 'Already cooking.',
    }[c.reason] ?? 'Not yet.';
    deny(ctx, msg, btn);
    if (c.reason === 'locked' || c.reason === 'rank') {
      const N = nodes.get(n.id);
      if (N) { audio.play('rattle'); N.el.classList.remove('rattle'); void N.el.offsetWidth; N.el.classList.add('rattle'); }
    }
  }
  function doResearch(n, btn) {
    const c = canResearch(n.id);
    if (!c.ok) return denyReason(n, c, btn);
    if (!startResearch(n.id)) return denyReason(n, canResearch(n.id), btn);
    // onResearch('start') does the juice
  }
  async function doSpeedUp(btn) {
    const a = state.p.research.active;
    if (!a) return;
    const price = researchSpeedUpPrice();
    if (state.p.bucks < price) return deny(ctx, `Not enough Beast Bucks. Finishing now costs *${price}*.`, btn);
    if (price >= 5) {
      const cv = h('canvas', { class: 'rs-beaker big', width: BEAKER_W, height: BEAKER_H });
      drawBeaker(cv.getContext('2d'), progress(), performance.now() / 1000, BRANCH[NODES[a.id].branch].color);
      const ok = await confirmBox({ title: 'SPEED UP', text: rich(`Finish *${NODES[a.id].name}* right now?`), art: cv, yes: 'FINISH', yesCls: 'pink', price: { cur: 'bucks', amount: price }, color: 'pink' });
      if (!ok || !state.p.research.active || state.p.research.active.id !== a.id) return;
    }
    if (!speedUpResearch()) deny(ctx, 'Not enough Beast Bucks.', btn);
  }

  // ------------------------------------------------------------------ juice
  const worldFx = (cls, x, y, text) => {
    const t = h('div', { class: `rs-wfx ${cls} t-d outline`, style: { left: x + 'px', top: y + 'px' } }, text);
    world.appendChild(t);
    setTimeout(() => t.remove(), 1500);
  };
  function popNode(id, level) {
    const N = nodes.get(id);
    if (!N) return;
    const n = N.n, p = pos(n), br = BRANCH[n.branch];
    paintAll();
    N.el.classList.remove('pop');
    void N.el.offsetWidth;
    N.el.classList.add('pop');
    setTimeout(() => N.el.classList.remove('pop'), 900);
    worldFx('lvup', p.x, p.y - T / 2 - 6, level >= n.max ? 'MAXED!' : `LV ${level}!`);
    if (view.isConnected) sparkle(N.el, { count: 22, spread: 70 * z + 30, colors: [br.color, '#ffffff', '#ffd84a', '#7aff4a'] });
    // the pipes out of a freshly unlocked node flush with goo
    for (const pp of pipes) if (pp.req === id) { pp.el.classList.remove('flush'); void pp.el.offsetWidth; pp.el.classList.add('flush'); }
    audio.play('levelUp');
    setTimeout(() => audio.play('bigPop'), 120);
  }
  function startFx(id) {
    const N = nodes.get(id);
    if (!N) return;
    paintAll();
    N.el.classList.remove('squash');
    void N.el.offsetWidth;
    N.el.classList.add('squash');
    const p = pos(N.n);
    worldFx('cost', p.x, p.y - T / 2 - 6, `-${fmtN(nodeCost(N.n, state.p.research.active?.level ?? 1))}`);
    for (const pp of pipes) if (pp.id === id) { pp.el.classList.remove('flush'); void pp.el.offsetWidth; pp.el.classList.add('flush'); }
    audio.play('slosh');
    setTimeout(() => audio.play('bubble'), 160);
    bench.classList.remove('kick');
    void bench.offsetWidth;
    bench.classList.add('kick');
  }
  const offRes = onResearch((ev) => {
    if (ev.type === 'start') startFx(ev.id);
    else if (ev.type === 'finish') {
      markResearchSeen(ev.id);
      popNode(ev.id, ev.level);
      // (the lab celebrates finished research itself)
      if (!inLab) notify(ctx, `Research done: *${NODES[ev.id]?.name}* LV ${ev.level}`, { icon: 'flask' });
    } else paintAll();
  });

  // ------------------------------------------------------------------ beakers + timers
  const progress = () => {
    const a = state.p.research.active;
    if (!a) return 0;
    return Math.max(0, Math.min(1, (Date.now() - a.startedAt) / Math.max(1, a.endsAt - a.startedAt)));
  };
  let raf = 0, lastDraw = 0, lastTick = 0, alive = true, idleDrawn = false;
  const benchCtx = benchCv.getContext('2d');
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (!root.isConnected || document.hidden) return;
    if (now - lastTick > 250) {
      lastTick = now;
      if (state.p.research.active && researchTimeLeft() <= 0) checkResearch();
      paintBench();
      if (sheet) sheet.paint();
      const a = state.p.research.active;
      if (a) { const N = nodes.get(a.id); if (N) N.lv.textContent = fmtSec(researchTimeLeft()); }
    }
    if (now - lastDraw < 66) return; // beakers bubble at ~15 fps (pixel-art frame rate)
    lastDraw = now;
    const t = now / 1000;
    const a = state.p.research.active;
    const col = a ? BRANCH[NODES[a.id]?.branch]?.color ?? '#5fe84a' : '#5fe84a';
    // an idle bench holds an empty beaker: paint it once, not every frame
    if (a || !idleDrawn) drawBeaker(benchCtx, progress(), t, col, !a);
    idleDrawn = !a;
    if (a) {
      const N = nodes.get(a.id);
      if (N) drawBeaker(N.mini.getContext('2d'), progress(), t + 0.37, col);
      const sc = sheet?.el.querySelector('.rs-beaker.sm');
      if (sc) drawBeaker(sc.getContext('2d'), progress(), t + 0.71, col);
    }
  }
  raf = requestAnimationFrame(frame);

  // ------------------------------------------------------------------ size + first paint
  let first = true;
  const onResize = () => {
    const r = root.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const ow = vw, oh = vh;
    vw = r.width;
    vh = r.height;
    root.classList.toggle('land', vw > vh * 1.25);
    root.classList.toggle('short', vh < 380);
    root.classList.toggle('narrow', vw < 380);
    // the zoom buttons sit just above a bottom bench
    zoomBox.style.bottom = root.classList.contains('land') ? '' : bench.offsetHeight + 16 + 'px';
    if (first) {
      first = false;
      z = defaultZoom();
      focusNode(opts.focus && NODES[opts.focus] ? opts.focus : bestFocus());
    } else {
      // keep the centre of the view where it was
      const P = pad();
      const cx = (ow / 2 - tx) / z, cy = (P.t + (oh - P.t - P.b) / 2 - ty) / z;
      tx = vw / 2 - cx * z;
      ty = P.t + (vh - P.t - P.b) / 2 - cy * z;
      apply();
    }
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
  ro?.observe(root);
  paintAll();
  requestAnimationFrame(onResize);
  const onKey = (e) => { if (e.key === 'Escape' && sheet) closeSheet(); };
  window.addEventListener('keydown', onKey);

  // finished while you were away: pop them now, one after another
  const fresh = Object.entries(researchFresh());
  fresh.forEach(([id, lv], k) => setTimeout(() => { if (alive) { markResearchSeen(id); popNode(id, lv); } }, 650 + k * 700));
  if (fresh.length && !inLab) notify(ctx, fresh.length === 1 ? `Research done: *${NODES[fresh[0][0]]?.name}* LV ${fresh[0][1]}` : `${fresh.length} researches finished`, { icon: 'flask' });
  // the old perk system was melted down into coins (once)
  const refund = takePerkRefund();
  if (refund > 0) {
    setTimeout(() => {
      if (!alive) return;
      const m = modal({
        title: 'PERKS ARE GONE', color: 'purple', size: 'narrow', cls: 'rs-refund',
        body: h('div', { class: 'col center' }, h('img', { src: rsIconURL('coinPile'), alt: '', class: 'rs-refund-art' }),
          h('div', { class: 'center-t', html: rich(`Perk rolling is out. Research is in. We melted your old perks down into *${fmtN(refund)}* Beast Coins. Spend them on the tree.`) })),
        foot: [button('NICE', () => m.close(), 'green lg', { sound: 'tap' })],
      });
      audio.play('chaching');
    }, 500);
  }

  return {
    refresh() { if (alive) paintAll(); },
    focus(id) { focusNode(id, true); openSheet(id); },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(panAnim);
      cancelAnimationFrame(zoomAnim);
      offRes();
      ro?.disconnect();
      window.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}

/** For a home nav dot or a lab button: what the research bench wants (see researchBadgeCount in state.js). */
export { researchBadgeCount } from '../../game/state.js';
