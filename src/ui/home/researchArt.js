// Pixel art for the research tree (src/ui/home/research.js): node icons in the
// house icon style (32-unit grid, painted on the shared pixel canvas and run
// through the same shader as src/ui/icons.js), the riveted lab-steel node
// frames, crossed padlock chains, pipe junction boxes and the bubbling beaker
// timer (hand-placed pixels on a tiny canvas, no rings or discs).
//
//   rsIconURL(name)            -> data URL (names: RS_ICON_NAMES, or any icons.js name)
//   frameURL(color, state)     -> node frame (state: open | got | max | lock)
//   chainURL() / junctionURL(on) / lampURL(kind)
//   drawBeaker(ctx, w, h, frac, t, color) -> paints one beaker frame on a w x h pixel canvas
import { PixCanvas, renderPixArt, ICON_COLORS as C, iconURL } from '../icons.js';

const HD = 2;
const cache = new Map();
const D = {};
const def = (name, fn, o = {}) => (D[name] = { fn, o });

// ------------------------------------------------------------------ shared bits
const WOOD = '#c27a3a', WOODD = '#8a4a1e', WOODL = '#e2a060';
const SKIN = '#f2c4a2', SKIND = '#d89a78';
const STEEL = '#b4bfd8', STEELD = '#6e7a9a', STEELL = '#dfe6f6';
const COPPER = '#e0823a', COPPERD = '#a04e18';
const BOLT = [[20, 1], [5, 18], [14, 18], [10, 31], [27, 12], [18, 12], [23, 1]];
const sc = (pts, k, ox = 0, oy = 0, cx = 16, cy = 16) => pts.map(([x, y]) => [cx + (x - cx) * k + ox, cy + (y - cy) * k + oy]);
function bolt(p, k, ox, oy, col = C.gold, core = true) {
  const pts = sc(BOLT, k, ox, oy);
  p.poly(pts.map(([x, y]) => [x + 0.8, y + 0.8]), C.orangeD);
  p.poly(pts, col);
  if (core) p.line(pts[0][0] - 0.5, pts[0][1] + 1.5, (pts[1][0] + pts[2][0]) / 2 + 1, pts[1][1] - 1, C.white, 0, true);
}
const speedLines = (p, x, ys, len = 5, c = C.white) => { for (const y of ys) p.line(x, y, x + len, y, c, 0, true); };

// ------------------------------------------------------------------ LAB SHACK
def('rs_plank', (p) => {
  // two stacked plywood sheets, nailed
  p.poly([[3, 7], [27, 4], [29, 11], [5, 14]], WOOD);
  p.poly([[3, 7], [27, 4], [27.4, 5.6], [3.4, 8.6]], WOODL);
  p.line(7, 9.6, 24, 7.6, WOODD, 0, true);
  p.rr(3, 16, 26, 9, 1.5, '#d8914a');
  p.rect(3, 16, 26, 2, WOODL);
  p.rect(3, 23, 26, 2, WOODD);
  p.line(6, 20, 14, 20, WOODD, 0, true).line(17, 21, 26, 21, WOODD, 0, true);
  for (const [x, y] of [[5, 17], [25, 17], [5, 22], [25, 22], [8, 8], [23, 6]]) p.rect(x, y, 2, 2, STEELD).dot(x, y, STEELL);
  p.rect(12, 26, 8, 3, STEEL).rect(12, 26, 8, 1, STEELL); // a spare nail box under the stack
  p.spark(28, 2, 2);
});
def('rs_zapper', (p) => {
  // tesla coil on a lab base, crackling
  p.rr(7, 26, 18, 5, 1, STEELD);
  p.rect(7, 26, 18, 1, STEEL);
  p.rect(11, 12, 10, 14, COPPER);
  for (let y = 13; y < 26; y += 2) p.line(11, y, 20, y, COPPERD, 0, true);
  p.line(12, 13, 12, 25, '#ffb070', 0, true);
  p.ell(16, 8.5, 7, 5, STEEL);
  p.ell(14.4, 7.2, 2.6, 1.6, STEELL);
  const arc = (pts, c = C.cyan) => { for (let i = 0; i < pts.length - 1; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, 0, true); };
  arc([[23, 6], [26, 3], [25, 1], [29, 0]]);
  arc([[9, 6], [6, 4], [7, 1], [3, 1]]);
  arc([[23, 10], [27, 12], [26, 15], [30, 17]], C.white);
  p.spark(29, 6, 2, C.white, C.cyan);
});
def('rs_plug', (p) => {
  // a plug on a long extension cord
  p.line(4, 29, 9, 22, '#3a3f5a', 1.4).line(9, 22, 15, 25, '#3a3f5a', 1.4).line(15, 25, 17, 19, '#3a3f5a', 1.4);
  p.rr(12, 8, 12, 12, 2, C.orange);
  p.rect(12, 8, 12, 2, C.orangeL);
  p.rect(14, 18, 8, 3, C.orangeD);
  p.rect(14, 2, 2.4, 6.5, STEEL).rect(19.6, 2, 2.4, 6.5, STEEL);
  p.dot(14, 2, STEELL).dot(19, 2, STEELL);
  p.rect(15, 12, 6, 2, C.orangeD);
  bolt(p, 0.3, 11, 9, C.goldL, false);
  p.spark(27, 5, 2);
});
def('rs_box', (p) => {
  // a flat-pack box (cardboard, tape, arrows) with an allen key
  p.poly([[3, 11], [19, 6], [29, 10], [13, 15]], '#e0b070');
  p.poly([[3, 11], [13, 15], [13, 29], [3, 25]], '#c08a48');
  p.poly([[13, 15], [29, 10], [29, 24], [13, 29]], '#d49c58');
  p.poly([[8, 9.5], [12, 8.3], [22, 12.4], [18, 13.6]], '#fff0c8');
  p.line(16, 19, 26, 16, '#8a5a24', 0, true).line(16, 22, 23, 20, '#8a5a24', 0, true);
  p.poly([[5, 16], [9, 17.6], [7, 20.5]], '#8a5a24');
  p.line(20, 31, 27, 26, C.grayD, 0.6).line(27, 26, 27, 22, C.grayD, 0.6);
  p.spark(27, 4, 2);
});
def('rs_tape', (p) => {
  // a cracked wall patched with an X of duct tape
  p.rr(2, 4, 28, 25, 2, '#c45a3a');
  for (const y of [11, 18, 25]) p.line(2, y, 29, y, '#8a3420', 0, true);
  for (const [x, y0] of [[10, 4], [22, 4], [6, 11], [17, 11], [27, 11], [11, 18], [23, 18], [6, 25], [17, 25]]) p.line(x, y0, x, y0 + 6, '#8a3420', 0, true);
  p.line(14, 8, 18, 14, C.ink, 0, true).line(18, 14, 15, 20, C.ink, 0, true).line(15, 20, 19, 26, C.ink, 0, true);
  p.poly([[4, 7], [8, 4], [28, 24], [24, 27]], '#b8c2d8');
  p.poly([[24, 4], [28, 7], [8, 27], [4, 24]], '#cfd8ea');
  for (let k = 0; k < 4; k++) p.line(7 + k * 5, 8 + k * 5, 9 + k * 5, 6 + k * 5, '#8e9abb', 0, true);
  p.spark(4, 2, 2);
});
def('rs_twinZap', (p) => {
  // two zapper coils on one shack roof
  p.poly([[2, 22], [16, 15], [30, 22]], '#8a3420');
  p.rr(4, 22, 24, 8, 1, STEELD);
  p.rect(4, 22, 24, 1, STEEL);
  for (const x of [7, 19]) {
    p.rect(x, 10, 6, 10, COPPER);
    for (let y = 11; y < 20; y += 2) p.line(x, y, x + 5, y, COPPERD, 0, true);
    p.ell(x + 3, 7.5, 4.4, 3.4, STEEL);
    p.dot(x + 1, 6, STEELL);
  }
  p.line(10, 3, 13, 1, C.cyan, 0, true).line(13, 1, 16, 4, C.white, 0, true).line(16, 4, 19, 1, C.cyan, 0, true).line(19, 1, 22, 3, C.white, 0, true);
  p.spark(29, 8, 2, C.white, C.cyan).spark(2, 9, 1, C.white, C.cyan);
});
def('rs_door', (p) => {
  // blast door: hazard stripes and a locking wheel
  p.rr(2, 2, 28, 28, 3, STEELD);
  p.rr(4, 4, 24, 24, 2, STEEL);
  p.each((x, y) => (x > 4 && x < 28 && ((y > 4 && y < 8) || (y > 24 && y < 28)) ? (Math.floor((x + y) / 3) % 2 ? C.gold : C.ink) : undefined));
  p.rect(5, 9, 22, 15, '#9aa6c4');
  p.star(16, 16.5, 6.4, 2.2, 4, '#e04a3a', Math.PI / 4);
  p.rect(14.5, 15, 3, 3, '#ffd2a0');
  for (const [x, y] of [[6, 10], [25, 10], [6, 22], [25, 22]]) p.dot(x, y, STEELL);
  p.spark(29, 1, 2);
});

// ------------------------------------------------------------------ POWER
function hamster(p, fur, furD, belly, glow = false) {
  p.ell(16, 19, 11, 9, fur);
  p.ell(17, 22, 6.5, 5, belly);
  p.ell(8.5, 10.5, 3, 3.2, fur).ell(8.6, 10.8, 1.6, 1.8, C.pinkL);
  p.ell(22, 10, 3, 3.2, fur).ell(22, 10.3, 1.6, 1.8, C.pinkL);
  p.rect(11, 15, 2.4, 3, C.ink).rect(19, 15, 2.4, 3, C.ink);
  p.dot(11, 15, C.white).dot(19, 15, C.white);
  p.rect(15, 19, 2.6, 1.6, C.pink);
  p.line(14, 21, 16, 22, furD, 0, true).line(16, 22, 18, 21, furD, 0, true);
  p.rect(9, 26, 4, 3, furD).rect(19, 26, 4, 3, furD);
  p.line(4, 19, 8, 18, furD, 0, true).line(24, 18, 28, 19, furD, 0, true);
  if (glow) { p.spark(3, 4, 3, C.white, '#a8ff6a'); p.spark(28, 26, 2, C.white, '#a8ff6a'); }
}
def('rs_hamster', (p) => {
  hamster(p, '#e8a050', '#a8622a', '#fff0d0');
  bolt(p, 0.36, 9, -9, C.gold);
  p.spark(4, 3, 2);
});
def('rs_hamsterGlow', (p) => {
  hamster(p, '#7cff3a', '#2a9a20', '#e0ffc0', true);
  bolt(p, 0.36, 9, -9, C.goldL);
});
def('rs_battery', (p) => {
  p.rr(7, 6, 18, 25, 2, '#3a3f5a');
  p.rect(12, 2, 8, 4, STEEL);
  p.rect(12, 2, 8, 1, STEELL);
  p.rect(9, 8, 14, 21, '#1e2238');
  for (let k = 0; k < 4; k++) p.rect(10, 24 - k * 5, 12, 4, k < 3 ? C.green : C.greenL);
  p.rect(14, 10, 4, 1.6, C.white).rect(15.2, 8.8, 1.6, 4, C.white);
  p.line(8, 8, 8, 28, '#6a7090', 0, true);
  p.spark(27, 4, 2);
});
def('rs_kettle', (p) => {
  // a steaming mug of lab coffee with a POWER bolt on it
  p.rr(5, 12, 18, 17, 2.5, C.red);
  p.rect(5, 12, 18, 2, C.redL);
  p.rr(22, 15, 6, 10, 2.5, C.redD);
  p.rr(23.5, 17, 3, 6, 1, '#1a1030');
  p.rect(7, 12, 14, 2, '#5a2a10');
  bolt(p, 0.36, -2, 4.5, C.gold);
  for (const x of [9, 14, 19]) p.line(x, 9, x - 1, 6, C.snow, 0, true).line(x - 1, 6, x, 3, C.snow, 0, true);
  p.rect(3, 29, 22, 2, STEELD);
});
def('rs_coupon', (p) => {
  // a POWER coupon with a dashed cut line, scissors snipping it
  p.poly([[1, 6], [25, 6], [25, 11], [23.2, 13], [25, 15], [25, 22], [1, 22], [1, 15], [2.8, 13], [1, 11]], '#fff0b0');
  p.rect(1, 6, 24, 2, '#fff8d8');
  p.each((x, y) => (Math.abs(x - 17.5) < 0.6 && y > 7 && y < 21 && Math.floor(y / 2) % 2 ? C.goldDD : undefined), true);
  bolt(p, 0.36, -6, -2, C.orange, false);
  p.rect(19, 10, 4, 2, C.goldDD).rect(20, 9, 2, 4, C.goldDD).rect(19, 16, 4, 2, C.goldDD);
  // scissors (blades crossing, red handles)
  p.poly([[14, 31], [27, 19], [29, 20.5], [16, 31.5]], STEEL);
  p.poly([[14, 19.5], [16, 18.4], [29, 29], [27, 30.5]], STEELL);
  p.rr(9, 24, 6, 6, 2, C.red).rect(10.6, 25.6, 2.8, 2.8, '#1a1030');
  p.rr(26, 24, 6, 6, 2, C.red).rect(27.6, 25.6, 2.8, 2.8, '#1a1030');
  p.spark(29, 2, 2);
});
function magnet(p, body, bodyD) {
  p.each((x, y) => { const d = Math.hypot(x - 16, y - 13); return y >= 13 && d <= 12 && d > 5.2 ? body : undefined; });
  p.rect(4, 4, 6.8, 9.5, body).rect(21.2, 4, 6.8, 9.5, body);
  p.rect(4, 1, 6.8, 5, STEEL).rect(21.2, 1, 6.8, 5, STEEL);
  p.rect(4, 1, 6.8, 1, STEELL).rect(21.2, 1, 6.8, 1, STEELL);
  p.line(5, 7, 5, 16, bodyD, 0, true);
}
def('rs_magnet', (p) => {
  magnet(p, C.red, C.redD);
  // a scrap bolt and nut flying in
  p.rect(13, 3, 6, 2.5, STEELD).rect(15, 5.5, 2, 4, STEEL);
  p.line(12, 9, 10, 11, C.cyan, 0, true).line(20, 9, 22, 11, C.cyan, 0, true);
  p.spark(16, 0, 1);
});
def('rs_horseshoe', (p) => {
  magnet(p, C.purple, C.purpleD);
  p.poly([[16, 1], [21, 6], [16, 11], [11, 6]], C.pink);
  p.poly([[16, 2.6], [19, 6], [16, 6]], C.pinkW);
  p.line(9, 14, 11, 12, C.cyan, 0, true).line(23, 14, 21, 12, C.cyan, 0, true);
  p.spark(27, 28, 2);
});

// ------------------------------------------------------------------ ULTIMATE
def('rs_plugIn', (p) => {
  // a wall socket with the plug in, charge spilling out
  p.rr(3, 6, 20, 22, 3, C.snow);
  p.rr(6, 9, 14, 16, 2, '#cfd8ea');
  p.rect(9, 12, 2, 4, C.ink).rect(15, 12, 2, 4, C.ink);
  p.rr(16, 13, 13, 9, 2, C.orange);
  p.rect(16, 13, 13, 2, C.orangeL);
  p.line(28, 18, 31, 24, '#3a3f5a', 1).line(31, 24, 31, 31, '#3a3f5a', 1);
  bolt(p, 0.34, -8, 5, C.green, true);
  p.spark(27, 4, 2, C.white, '#a8ff6a');
});
def('rs_dumbbell', (p) => {
  p.rect(4, 15, 24, 3, STEEL);
  p.rect(4, 15, 24, 1, STEELL);
  for (const x of [3, 25]) { p.rr(x, 7, 5, 19, 1.5, '#3a3f5a'); p.rect(x + 1, 8, 1, 17, '#6a7090'); }
  for (const x of [8, 21]) { p.rr(x, 10, 3.5, 13, 1, '#4e5878'); p.rect(x + 0.6, 11, 1, 11, '#7a86a8'); }
  p.spark(16, 6, 2).spark(29, 3, 1);
});

// ------------------------------------------------------------------ BRAWLERS
function fist(p, x0, y0, wrap = true) {
  p.rr(x0, y0 + 4, 18, 14, 3, SKIN);
  p.rr(x0 + 1, y0, 15, 8, 3, SKIN);
  for (let k = 1; k < 4; k++) p.line(x0 + 1 + k * 4, y0 + 1, x0 + 1 + k * 4, y0 + 7, SKIND, 0, true);
  p.rr(x0 - 2, y0 + 8, 8, 6, 2.5, SKIN); // thumb
  p.line(x0 + 1, y0 + 11, x0 + 6, y0 + 11, SKIND, 0, true);
  if (wrap) {
    p.rect(x0 + 3, y0 + 14, 15, 4, C.snow);
    p.line(x0 + 3, y0 + 15, x0 + 17, y0 + 15, '#c8d2ea', 0, true);
    p.rect(x0 + 6, y0 + 18, 12, 6, C.snow);
    p.line(x0 + 7, y0 + 20, x0 + 17, y0 + 21, '#c8d2ea', 0, true);
  }
}
def('rs_fist', (p) => { fist(p, 8, 4); p.spark(4, 4, 2); });
def('rs_fastFist', (p) => { fist(p, 11, 4, false); p.rect(14, 22, 14, 6, C.red); speedLines(p, 1, [7, 12, 17, 22], 7); p.spark(29, 3, 2); });
def('rs_shaker', (p) => {
  p.rr(8, 2, 16, 6, 1.5, '#2a2f48');
  p.rect(18, 0, 4, 3, '#2a2f48');
  p.poly([[8, 8], [24, 8], [22, 30], [10, 30]], '#dceaff');
  p.poly([[9, 15], [23, 15], [22, 29], [10, 29]], '#8a5232');
  p.poly([[9, 15], [23, 15], [22.8, 17], [9.2, 17]], '#b07a52');
  p.line(11, 10, 11, 27, C.white, 0, true);
  for (let y = 19; y < 28; y += 3) p.line(20, y, 22, y, '#c8d2ea', 0, true);
  p.rr(12, 20, 8, 5, 1, C.red);
  p.spark(27, 4, 2);
});
def('rs_glove', (p) => {
  // a red boxing glove, laced cuff
  p.rr(6, 3, 21, 18, 7, C.red);
  p.rr(3, 9, 9, 11, 4, C.red);
  p.line(9, 12, 13, 16, C.redD, 0, true);
  p.ell(13, 7, 4.4, 2.2, C.redL);
  p.rr(10, 20, 15, 10, 1.5, C.snow);
  p.rect(10, 20, 15, 2, '#c8d2ea');
  p.line(17.5, 22, 17.5, 29, '#9aa6c8', 0, true);
  for (const y of [23, 26]) p.line(14.5, y, 20.5, y + 1.5, C.red, 0, true).line(20.5, y, 14.5, y + 1.5, C.red, 0, true);
  p.spark(29, 3, 2).spark(2, 26, 1);
});
def('rs_sneaker', (p) => {
  p.poly([[3, 14], [13, 11], [18, 15], [29, 19], [29, 25], [3, 25]], C.blue);
  p.poly([[3, 14], [13, 11], [14, 13], [4, 16]], C.blueL);
  p.rect(2, 25, 28, 4, C.snow);
  p.rect(2, 28, 28, 2, '#9aa6c8');
  p.poly([[8, 21], [20, 17], [26, 21], [12, 23]], C.white);
  for (const x of [9, 12, 15]) p.line(x, 13, x + 2, 16, C.snow, 0, true);
  speedLines(p, 0, [6, 9], 6, C.white);
  p.spark(29, 9, 2);
});
def('rs_mallet', (p) => {
  p.line(8, 29, 19, 14, WOODD, 1.6);
  p.line(8, 28, 18, 14, WOOD, 0.6);
  p.poly([[10, 6], [24, 1], [30, 13], [16, 18]], WOOD);
  p.poly([[10, 6], [24, 1], [25, 3], [11, 8]], WOODL);
  p.poly([[16, 18], [30, 13], [29, 11], [15, 16]], WOODD);
  p.line(13, 9, 27, 4, '#e0b070', 0, true);
  p.star(5, 9, 4.2, 1.8, 4, C.gold);
  p.star(4, 20, 2.6, 1.1, 4, C.goldL);
  p.spark(28, 24, 2);
});

// ------------------------------------------------------------------ TANKS
def('rs_pillow', (p) => {
  p.poly([[3, 6], [16, 8], [29, 6], [27, 16], [29, 27], [16, 25], [3, 27], [5, 16]], '#ff9ac8');
  p.poly([[3, 6], [16, 8], [29, 6], [28, 8], [16, 10], [4, 8]], C.pinkW);
  for (const [x, y] of [[10, 12], [22, 12], [10, 21], [22, 21], [16, 16.5]]) { p.rect(x - 1, y - 1, 2, 2, C.pinkD); p.dot(x - 1, y - 1, C.pinkL); }
  p.line(10, 12, 16, 16.5, '#e070a8', 0, true).line(22, 12, 16, 16.5, '#e070a8', 0, true).line(10, 21, 16, 16.5, '#e070a8', 0, true).line(22, 21, 16, 16.5, '#e070a8', 0, true);
  p.spark(28, 2, 2);
});
def('rs_plate', (p) => {
  // spray-painted iron chest plate
  p.poly([[4, 5], [11, 3], [16, 6], [21, 3], [28, 5], [27, 18], [16, 30], [5, 18]], STEEL);
  p.poly([[4, 5], [11, 3], [16, 6], [16, 28], [5, 18]], STEELL);
  p.line(16, 6, 16, 29, STEELD, 0, true);
  p.line(7, 12, 14, 13, STEELD, 0, true).line(18, 13, 25, 12, STEELD, 0, true);
  for (const [x, y] of [[6, 6], [25, 6], [9, 17], [22, 17], [15, 25]]) p.dot(x, y, '#5a6480');
  p.line(8, 8, 9, 15, C.white, 0, true);
  p.spark(29, 2, 2);
});
def('rs_boot', (p) => {
  p.poly([[8, 2], [19, 2], [19, 16], [29, 20], [29, 25], [6, 25], [8, 14]], '#7a4a28');
  p.rect(8, 2, 11, 3, '#a8683a');
  for (const y of [8, 12]) p.line(10, y, 18, y, '#4a2a14', 0, true);
  p.rr(4, 24, 27, 7, 1.5, '#4e5878');
  p.rect(4, 24, 27, 2, '#8a96b8');
  p.rr(8, 26.5, 9, 3, 0.5, C.gold);
  p.rect(10, 27, 5, 2, C.goldDD);
  p.spark(28, 4, 2);
});
def('rs_maul', (p) => {
  p.line(6, 30, 18, 12, WOODD, 1.6).line(6, 29, 17, 12, WOOD, 0.4);
  p.poly([[11, 6], [24, 1], [30, 14], [17, 19]], '#5a6480');
  p.poly([[11, 6], [24, 1], [25, 3.5], [12, 8.5]], '#9aa6c4');
  p.poly([[17, 19], [30, 14], [29, 12], [16, 17]], '#3a4260');
  for (const [x, y] of [[16, 9], [22, 7], [19, 14], [25, 11]]) p.dot(x, y, STEELL);
  p.star(5, 8, 3.6, 1.5, 4, C.gold);
  p.spark(28, 25, 2);
});
def('rs_spikes', (p) => {
  // spiked armor plate
  for (let k = 0; k < 5; k++) { const x = 4 + k * 6; p.poly([[x - 2.6, 9], [x, 1], [x + 2.6, 9]], STEELL); p.line(x, 2, x, 8, STEEL, 0, true); }
  for (const y of [14, 22]) { p.poly([[4, y - 2.6], [-1, y], [4, y + 2.6]], STEELL); p.poly([[28, y - 2.6], [33, y], [28, y + 2.6]], STEELL); }
  p.rr(3, 8, 26, 22, 3, '#6a5040');
  p.rr(5, 10, 22, 18, 2, '#8a6a52');
  p.line(16, 11, 16, 27, '#5a4030', 0, true);
  for (const [x, y] of [[7, 12], [24, 12], [7, 25], [24, 25]]) p.dot(x, y, STEELL);
  p.poly([[11, 16], [21, 16], [16, 23]], C.red);
});
def('rs_bandage', (p) => {
  p.poly([[16, 29], [3, 15], [3, 8], [8, 3], [13, 3], [16, 7], [19, 3], [24, 3], [29, 8], [29, 15]], C.red);
  p.poly([[5, 9], [9, 5], [12, 5], [8, 10]], C.redL);
  p.poly([[6, 21], [22, 5], [26, 9], [10, 25]], '#ffe0b8');
  p.poly([[6, 9], [10, 5], [26, 21], [22, 25]], '#f6d0a0');
  for (const [x, y] of [[13, 14], [16, 16], [19, 14], [16, 12]]) p.dot(x, y, '#c89060');
  p.spark(29, 26, 2);
});

// ------------------------------------------------------------------ SHOOTERS
def('rs_scope', (p) => {
  // red-dot sight: corner brackets, crosshair ticks, the dot
  const br = (x, y, dx, dy) => { p.rect(x, y, 7 * dx || 2.4, 2.4, C.snow); p.rect(x, y, 2.4, 7 * dy || 2.4, C.snow); };
  p.rect(2, 2, 8, 2.4, C.snow).rect(2, 2, 2.4, 8, C.snow);
  p.rect(22, 2, 8, 2.4, C.snow).rect(27.6, 2, 2.4, 8, C.snow);
  p.rect(2, 27.6, 8, 2.4, C.snow).rect(2, 22, 2.4, 8, C.snow);
  p.rect(22, 27.6, 8, 2.4, C.snow).rect(27.6, 22, 2.4, 8, C.snow);
  void br;
  p.rect(15, 6, 2, 6, C.red).rect(15, 20, 2, 6, C.red).rect(6, 15, 6, 2, C.red).rect(20, 15, 6, 2, C.red);
  p.star(16, 16, 3.4, 3.4, 4, C.red, 0);
  p.dot(15, 15, C.redL);
  p.line(17, 17, 31, 31, '#ff5a6a', 0, true);
});
def('rs_hoodie', (p) => {
  p.poly([[9, 6], [16, 3], [23, 6], [30, 14], [27, 18], [25, 16], [25, 30], [7, 30], [7, 16], [5, 18], [2, 14]], C.pink);
  p.poly([[11, 6], [16, 4], [21, 6], [19, 11], [13, 11]], C.pinkD);
  p.poly([[12, 7], [16, 5.5], [20, 7], [18.5, 9.5], [13.5, 9.5]], '#4a1030');
  p.line(14, 11, 13, 17, C.white, 0, true).line(18, 11, 19, 17, C.white, 0, true);
  p.rr(10, 21, 12, 6, 1.5, C.pinkD);
  p.poly([[13, 14], [19, 14], [16, 19]], C.gold);
  p.line(4, 14, 9, 7, C.pinkL, 0, true);
  p.spark(29, 3, 2);
});
def('rs_stool', (p) => {
  p.rr(6, 3, 20, 5, 2, C.red);
  p.rect(6, 3, 20, 1.5, C.redL);
  p.line(9, 8, 5, 30, STEELD, 0.8).line(23, 8, 27, 30, STEELD, 0.8).line(16, 8, 16, 30, STEEL, 0.8);
  p.line(7, 22, 25, 22, STEEL, 0.6);
  p.rect(13, 0, 6, 3, C.gold); // the target it can now reach
  p.spark(29, 6, 2);
});
function bullet(p, x, y) {
  p.rr(x, y + 5, 7, 18, 1, C.gold);
  p.rect(x, y + 5, 2, 18, C.goldL);
  p.poly([[x, y + 6], [x + 3.5, y], [x + 7, y + 6]], COPPER);
  p.rect(x, y + 20, 7, 3, C.goldD);
}
def('rs_darts', (p) => { bullet(p, 5, 4); bullet(p, 17, 6); speedLines(p, 26, [10, 14], 5); p.spark(3, 2, 2); });
def('rs_barrel', (p) => {
  p.rr(2, 12, 22, 9, 2, '#3a3f5a');
  p.rect(2, 12, 22, 2, '#6a7090');
  for (const x of [7, 12, 17]) p.rect(x, 12, 2, 9, '#2a2f48');
  p.rr(20, 11, 6, 11, 2, C.orange);
  p.rect(22, 13, 3, 7, C.goldL);
  p.poly([[26, 12], [31, 8], [29, 16], [31, 24], [26, 21]], C.orange);
  p.poly([[26, 14], [29.5, 12], [28, 16.5], [29.5, 21], [26, 19]], C.goldL);
  for (const x of [6, 12, 18]) p.line(x, 9, x + 1, 6, '#ff9a5a', 0, true).line(x + 1, 6, x, 3, '#ffc06a', 0, true);
});
def('rs_sock', (p) => {
  p.poly([[8, 2], [19, 2], [19, 19], [27, 23], [27, 29], [12, 29], [8, 24]], C.snow);
  for (const y of [6, 11]) p.rect(8, y, 11, 3, C.red);
  p.rect(8, 2, 11, 2.4, '#c8d2ea');
  p.rr(21, 23, 7, 7, 2.5, '#d8e0f2');
  // a four-leaf clover pinned on
  for (const [dx, dy] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) p.ell(13 + dx, 19 + dy, 2.6, 2.6, C.green);
  p.dot(12, 18, C.greenL);
  p.line(13, 21, 11, 26, C.greenD, 0, true);
  p.spark(28, 4, 2);
});

// ------------------------------------------------------------------ FLYERS
def('rs_feather', (p) => {
  p.poly([[27, 2], [21, 4], [12, 11], [6, 21], [5, 27], [11, 26], [20, 19], [26, 10]], C.cyan);
  p.poly([[27, 2], [21, 4], [12, 11], [8, 18], [24, 6]], '#c8f6ff');
  p.line(27, 2, 4, 30, STEELD, 0.3);
  for (let k = 0; k < 4; k++) p.line(20 - k * 4, 8 + k * 4, 25 - k * 4, 13 + k * 4, '#3aa8c8', 0, true);
  p.rect(16, 13, 6, 6, STEEL).rect(16, 13, 6, 1.5, STEELL);
  p.dot(17, 15, STEELD).dot(20, 17, STEELD);
  p.spark(4, 4, 2);
});
def('rs_foilHat', (p) => {
  p.poly([[16, 2], [27, 24], [5, 24]], '#c8d2ea');
  p.poly([[16, 2], [16, 24], [5, 24]], '#e8eef8');
  for (const [a, b] of [[[11, 13], [17, 15]], [[9, 19], [15, 18]], [[18, 9], [21, 14]], [[19, 19], [24, 21]]]) p.line(a[0], a[1], b[0], b[1], '#8e9abb', 0, true);
  p.rr(3, 23, 26, 5, 2, '#9aa6c4');
  // a zap bouncing off
  p.line(30, 4, 26, 9, C.cyan, 0, true).line(26, 9, 29, 12, C.white, 0, true).line(29, 12, 25, 16, C.cyan, 0, true);
  p.spark(3, 4, 2, C.white, C.cyan);
});
def('rs_dive', (p) => {
  // a winged bomb diving down
  p.ell(15, 18, 8, 8, '#2a2f48');
  p.ell(12, 15, 2.6, 2.2, '#5a6488');
  p.poly([[9, 11], [1, 4], [4, 13]], C.snow).poly([[21, 11], [29, 4], [26, 13]], C.snow);
  p.rect(13, 25, 4, 3, STEELD);
  p.line(15, 9, 18, 5, '#8a6a40', 0, true);
  p.spark(19, 4, 2, C.white, C.orange);
  speedLines(p, 25, [18, 22, 26], 5);
});

// ------------------------------------------------------------------ SWARMS
def('rs_chat', (p) => {
  p.rr(2, 3, 19, 13, 3, C.blue);
  p.poly([[5, 15], [9, 15], [4, 20]], C.blue);
  for (const x of [6, 11, 16]) p.rect(x, 8, 2.4, 2.4, C.white);
  p.rr(11, 13, 19, 13, 3, C.green);
  p.poly([[25, 25], [21, 25], [27, 30]], C.green);
  for (const x of [15, 20, 25]) p.rect(x, 18, 2.4, 2.4, C.white);
  p.spark(29, 3, 2);
});
def('rs_claw', (p) => {
  for (let k = 0; k < 3; k++) {
    const x = 6 + k * 8;
    p.poly([[x, 2 + k], [x + 5, 5 + k], [x + 2, 24], [x - 1, 20]], C.snow);
    p.poly([[x, 2 + k], [x + 2, 3 + k], [x + 1, 20], [x - 1, 20]], C.white);
  }
  p.rr(3, 20, 26, 10, 4, '#8a5ac8');
  p.rect(3, 20, 26, 2, '#b48aff');
  for (const x of [8, 16, 24]) p.dot(x, 25, '#5a3090');
  p.spark(29, 2, 2);
});
def('rs_gasMask', (p) => {
  p.rr(4, 4, 24, 20, 8, '#3a4a3a');
  p.rr(6, 6, 20, 16, 6, '#4e6a4e');
  for (const x of [11, 21]) { p.ell(x, 12, 4, 3.6, '#2a2f48'); p.ell(x, 12, 2.6, 2.3, '#8ae8ff'); p.dot(x - 2, 10, C.white); }
  p.rr(11, 19, 10, 11, 2, '#6a7090');
  for (let y = 21; y < 29; y += 2) p.line(12, y, 19, y, '#3a3f5a', 0, true);
  p.rect(13, 18, 6, 2, C.gold);
  p.spark(29, 3, 2);
});

// ------------------------------------------------------------------ SPELLS
def('rs_potion', (p) => {
  p.rect(13, 2, 6, 4, WOOD);
  p.rect(12, 6, 8, 4, '#cfeeff');
  p.ell(16, 20, 11, 10, '#cfeeff');
  p.each((x, y) => (Math.hypot((x - 16) / 9.6, (y - 20) / 8.6) <= 1 && y > 15 ? C.pink : undefined));
  p.rect(9, 18, 14, 6, C.white);
  p.rect(10, 19, 2, 4, C.pinkD).rect(13, 19, 2, 4, C.pinkD).rect(16, 19, 2, 2, C.pinkD).rect(19, 19, 2, 4, C.pinkD).rect(16, 21, 4, 2, C.pinkD);
  p.line(9, 14, 10, 11, C.white, 0, true);
  p.spark(27, 7, 2);
});
def('rs_bucket', (p) => {
  p.poly([[3, 12], [17, 8], [21, 22], [9, 26]], STEEL);
  p.poly([[3, 12], [17, 8], [17.6, 10], [3.6, 14]], STEELL);
  p.ell(10, 10, 7, 2.6, '#5a6480');
  // splash flying out
  p.poly([[16, 7], [25, 2], [30, 9], [28, 18], [21, 14]], C.pink);
  p.poly([[18, 7], [24, 4], [27, 9], [22, 11]], C.pinkL);
  for (const [x, y] of [[29, 22], [26, 26], [23, 28]]) p.rect(x, y, 2.5, 2.5, C.pink);
  p.line(4, 6, 10, 3, STEELD, 0, true).line(10, 3, 17, 5, STEELD, 0, true);
});
def('rs_flasks', (p) => {
  // two pre-mixed test tubes in a rack
  for (const [x, c, cl] of [[8, C.green, C.greenL], [18, C.pink, C.pinkL]]) {
    p.rr(x, 3, 6, 22, 3, '#cfeeff');
    p.rr(x + 0.6, 11, 4.8, 13.4, 2.4, c);
    p.rect(x + 1, 11, 4, 1.6, cl);
    p.rect(x - 1, 2, 8, 2, '#9ac8e8');
    p.line(x + 1.4, 5, x + 1.4, 20, C.white, 0, true);
  }
  p.rect(4, 19, 24, 4, WOOD).rect(4, 19, 24, 1, WOODL);
  p.rect(5, 23, 3, 7, WOODD).rect(24, 23, 3, 7, WOODD);
  p.spark(29, 4, 2);
});
def('rs_brick', (p) => {
  p.rr(2, 4, 28, 25, 1, '#c45a3a');
  for (const y of [10, 16, 22]) p.line(2, y, 29, y, '#8a3420', 0, true);
  for (const [x, y0] of [[9, 4], [20, 4], [5, 10], [15, 10], [25, 10], [9, 16], [20, 16], [5, 22], [15, 22], [25, 22]]) p.line(x, y0, x, y0 + 5, '#8a3420', 0, true);
  p.poly([[12, 9], [20, 7], [23, 15], [19, 22], [11, 21], [9, 14]], '#1a1030');
  p.poly([[12, 9], [20, 7], [21, 9], [13, 11], [11, 14], [9.6, 14]], '#3a2050');
  for (const [x, y, s] of [[25, 3, 2.6], [28, 8, 2], [5, 26, 2.4]]) p.rect(x, y, s, s, '#d8744a');
  bolt(p, 0.32, 0, 0, C.pink, false);
});
def('rs_brain', (p) => {
  p.ell(16, 15, 13, 11, C.pinkL);
  p.ell(16, 15, 12, 10, '#ff9ac8');
  p.line(16, 5, 16, 25, '#d0508e', 0, true);
  for (const pts of [[[6, 10], [10, 12], [8, 16]], [[7, 20], [11, 18], [13, 21]], [[22, 9], [26, 12], [23, 15]], [[20, 19], [25, 18], [26, 21]], [[11, 7], [13, 10]], [[19, 13], [22, 15]]]) {
    for (let i = 0; i < pts.length - 1; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], '#d0508e', 0, true);
  }
  p.rect(13, 25, 6, 5, '#ff9ac8');
  p.line(7, 8, 10, 6, C.white, 0, true);
  p.spark(29, 3, 2).spark(2, 25, 1);
});

export const RS_ICON_NAMES = Object.keys(D);

/** Icon data URL: a research icon, or any name from the main icon set. */
export function rsIconURL(name) {
  if (!D[name]) return iconURL(name);
  let u = cache.get(name);
  if (u) return u;
  const d = D[name];
  const p = new PixCanvas(32, 1, HD);
  d.fn(p);
  u = renderPixArt(p, { glints: 1, ...d.o });
  cache.set(name, u);
  return u;
}

// ------------------------------------------------------------------ node frames
// A chamfered lab-steel plate in the branch colour with a recessed screen,
// corner rivets and a lamp socket on top. 40-unit grid (q = 2 -> 88 px PNG).

const FR = 40;
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return '#' + ((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0');
};
const chamfer = (x0, y0, x1, y1, c) => [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]];

/** state: open (can research) | got (some levels) | max | lock */
export function frameURL(color, state = 'open') {
  const key = `fr|${color}|${state}`;
  let u = cache.get(key);
  if (u) return u;
  const metal = state === 'lock' ? '#5a6382' : state === 'max' ? '#ffc21a' : color;
  const p = new PixCanvas(FR, 1, HD);
  p.poly(chamfer(1, 2, 39, 39, 7), shade(metal, -0.38));
  p.poly(chamfer(2, 2, 38, 37.4, 6.4), metal);
  p.poly([[8.4, 2], [31.6, 2], [37.4, 7.8], [37.4, 9], [2.6, 9], [2.6, 7.8]], shade(metal, 0.32));
  // the recessed screen
  const scr = state === 'lock' ? '#141830' : state === 'max' ? '#3a2408' : state === 'got' ? shade(color, -0.72) : '#1a2040';
  p.poly(chamfer(6, 6, 34, 33.4, 4.4), shade(metal, -0.55));
  p.poly(chamfer(7, 7, 33, 32.6, 3.8), scr);
  if (state !== 'lock') p.poly([[10.4, 7.2], [29.6, 7.2], [32.8, 10.4], [32.8, 11.6], [7.2, 11.6], [7.2, 10.4]], shade(scr, 0.14));
  // rivets
  for (const [x, y] of [[4, 11], [35, 11], [4, 29], [35, 29], [11, 35], [28, 35]]) p.rect(x, y, 1.6, 1.6, shade(metal, -0.5)).dot(x, y, shade(metal, 0.6));
  // lamp socket on top
  p.rr(15, 0, 10, 4, 1.2, shade(metal, -0.45));
  u = renderPixArt(p, { glints: 1, drop: false });
  cache.set(key, u);
  return u;
}

/** Status lamp on top of a node: kind = off | open | got | max | busy */
export function lampURL(kind) {
  const key = 'lamp|' + kind;
  let u = cache.get(key);
  if (u) return u;
  const col = { off: '#5a3040', open: '#ffb52a', got: '#5fe84a', max: '#ffe46a', busy: '#5ae8ff' }[kind] ?? '#5a3040';
  const p = new PixCanvas(12, 1, HD);
  p.rr(1, 4, 10, 7, 1, '#3a3f5a');
  p.poly([[3, 6], [3, 3], [5, 1], [7, 1], [9, 3], [9, 6]], col);
  p.rect(4, 2, 1.6, 2.4, shade(col, 0.6));
  u = renderPixArt(p, { glints: 0, drop: false });
  cache.set(key, u);
  return u;
}

/** Two padlock chains crossing the tile (like a locked crate). 48-unit grid. */
export function chainURL() {
  const key = 'chain';
  let u = cache.get(key);
  if (u) return u;
  const p = new PixCanvas(48, 1, HD);
  const link = (cx, cy, dx, dy, side) => {
    // links alternate: face-on (an open loop) and edge-on (a short bar)
    const ox = -dy, oy = dx;
    if (side) {
      p.poly([[cx - dx * 3.4 + ox * 1.6, cy - dy * 3.4 + oy * 1.6], [cx + dx * 3.4 + ox * 1.6, cy + dy * 3.4 + oy * 1.6], [cx + dx * 3.4 - ox * 1.6, cy + dy * 3.4 - oy * 1.6], [cx - dx * 3.4 - ox * 1.6, cy - dy * 3.4 - oy * 1.6]], '#8e9abb');
    } else {
      const o = [[cx - dx * 3.8 + ox * 2.6, cy - dy * 3.8 + oy * 2.6], [cx + dx * 3.8 + ox * 2.6, cy + dy * 3.8 + oy * 2.6], [cx + dx * 3.8 - ox * 2.6, cy + dy * 3.8 - oy * 2.6], [cx - dx * 3.8 - ox * 2.6, cy - dy * 3.8 - oy * 2.6]];
      const i = [[cx - dx * 2 + ox * 0.9, cy - dy * 2 + oy * 0.9], [cx + dx * 2 + ox * 0.9, cy + dy * 2 + oy * 0.9], [cx + dx * 2 - ox * 0.9, cy + dy * 2 - oy * 0.9], [cx - dx * 2 - ox * 0.9, cy - dy * 2 - oy * 0.9]];
      p.poly(o, '#c8d2ea');
      p.poly(i, null);
    }
  };
  const run = (x0, y0, x1, y1, n) => {
    const L = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / L, dy = (y1 - y0) / L;
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; link(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, dx, dy, k % 2 === 1); }
  };
  run(1, 4, 47, 44, 9);
  run(47, 4, 1, 44, 9);
  u = renderPixArt(p, { glints: 0, drop: false });
  cache.set(key, u);
  return u;
}

/** Pipe junction box (where a branch pipe turns): riveted steel collar; on = goo lit. */
export function junctionURL(on) {
  const key = 'jn|' + (on ? 1 : 0);
  let u = cache.get(key);
  if (u) return u;
  const p = new PixCanvas(14, 1, HD);
  p.poly(chamfer(0.5, 0.5, 13.5, 13.5, 3), '#4e5878');
  p.poly(chamfer(1.5, 1.5, 12.5, 12.5, 2.4), '#8a96b8');
  p.rect(1.5, 1.5, 11, 1.5, '#b4bfd8');
  p.poly(chamfer(4, 4, 10, 10, 1.4), on ? '#5fe84a' : '#1e2440');
  if (on) p.rect(5, 5, 2, 2, '#c8ff9a');
  for (const [x, y] of [[2, 2], [11, 2], [2, 11], [11, 11]]) p.dot(x, y, '#3a4260');
  u = renderPixArt(p, { glints: 0, drop: false });
  cache.set(key, u);
  return u;
}

// ------------------------------------------------------------------ bubbling beaker timer
// Painted per frame on a tiny canvas (scaled up pixelated): a lab beaker whose
// goo rises with the progress, bubbles climbing through it and popping at the
// surface. Every shape is hand-placed pixels: no circles or progress rings.

const BEAKER = [
  // 18 x 22 mask (padded for the outline): g = glass outline, . = inside, r = rim
  '  rrrrrrrrrrrr  ',
  '  rggggggggggr  ',
  '   g........g   ',
  '   g........g   ',
  '   g........g   ',
  '   g........g   ',
  '   g........g   ',
  '   g........g   ',
  '  g..........g  ',
  '  g..........g  ',
  ' g............g ',
  ' g............g ',
  'g..............g',
  'g..............g',
  'g..............g',
  'g..............g',
  'g..............g',
  'g..............g',
  ' g............g ',
  '  gggggggggggg  ',
].map((r) => ` ${r} `);
BEAKER.unshift(' '.repeat(18));
BEAKER.push(' '.repeat(18));
export const BEAKER_W = 18, BEAKER_H = 22;
const B_TOP = BEAKER.findIndex((r) => r.includes('.'));
const B_BOT = BEAKER.length - 1 - [...BEAKER].reverse().findIndex((r) => r.includes('.'));
const hexA = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/**
 * Paint one beaker frame. ctx: 2D context of a BEAKER_W x BEAKER_H canvas; frac 0..1 = progress;
 * t = seconds (animation clock); color = goo colour (hex). idle = an empty, dusty beaker.
 */
export function drawBeaker(ctx, frac, t, color = '#5fe84a', idle = false) {
  const W = BEAKER_W, H = BEAKER_H;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const put = (x, y, [r, g, b], a = 255) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; };
  const goo = hexA(color), gooL = goo.map((v) => Math.min(255, v + 90)), gooD = goo.map((v) => Math.round(v * 0.55));
  const glass = [200, 236, 255], glassD = [110, 150, 200], rim = [230, 240, 255], ink = [18, 12, 36], hollow = [26, 34, 64];
  // the goo fills the inside rows from the bottom
  const top = B_TOP, bot = B_BOT;
  const level = idle ? bot + 1 : Math.round(bot - (bot - top) * Math.max(0.06, Math.min(1, frac)));
  const inside = (x, y) => BEAKER[y]?.[x] === '.';
  const wave = (x) => (Math.floor(t * 6 + x * 0.9) % 4 === 0 ? 1 : 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = BEAKER[y][x];
    if (ch === ' ') continue;
    if (ch === 'r') { put(x, y, y === 1 ? rim : glassD); continue; }
    if (ch === 'g') { put(x, y, x < W / 2 ? glass : glassD); continue; }
    const surf = level + wave(x);
    if (y > surf) put(x, y, BEAKER[y][x - 1] === 'g' ? gooL : y === bot ? gooD : goo);
    else if (y === surf) put(x, y, gooL);
    else put(x, y, hollow, 235);
  }
  // glass glint
  for (let y = 4; y < 10; y++) put(5, y, [255, 255, 255], 200);
  put(3, 14, [255, 255, 255], 180); put(3, 15, [255, 255, 255], 180);
  // bubbles: 2x2 / 1x1 squares rising through the goo, popping at the surface
  if (!idle) {
    for (let b = 0; b < 4; b++) {
      const speed = 3.2 + b * 0.7, ph = (t * speed + b * 5.3) % 16;
      const x = 4 + ((b * 5 + Math.floor((t * speed + b * 5.3) / 16) * 3) % 10);
      const y = bot - Math.floor(ph);
      if (y <= level || !inside(x, y)) continue;
      put(x, y, [255, 255, 255]);
      if (b % 2 === 0 && y - 1 > level && inside(x + 1, y - 1)) { put(x + 1, y, [255, 255, 255], 200); put(x, y - 1, [255, 255, 255], 200); put(x + 1, y - 1, gooL); }
    }
    // pops: a + of pixels just above the surface
    const pop = Math.floor(t * 2.5) % 3;
    if (level < bot) { const px = 6 + ((Math.floor(t * 2.5) * 7) % 7); if (pop === 0 && inside(px, level - 2)) { put(px, level - 1, gooL, 220); put(px - 1, level - 2, gooL, 160); put(px + 1, level - 2, gooL, 160); } }
  }
  // outline
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (d[i + 3]) continue;
    const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < W && yy < H && BEAKER[yy][xx] !== ' ';
    if (n(x + 1, y) || n(x - 1, y) || n(x, y + 1) || n(x, y - 1)) put(x, y, ink, 255);
  }
  ctx.putImageData(img, 0, 0);
}

// ------------------------------------------------------------------ blueprint sketches (tree background)
// Faint lab blueprints in the empty corners of the tree: a flask, a gear, a
// tesla coil and a DNA strand, as thin pixel line art (half resolution, scaled
// up pixelated). spots: [{ kind, x, y, s }] in world px.

export function drawBlueprint(cv, W, H, spots) {
  const k = 0.5;
  cv.width = Math.ceil(W * k);
  cv.height = Math.ceil(H * k);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const line = 'rgba(150, 205, 255, 0.22)', dim = 'rgba(150, 205, 255, 0.12)';
  const path = (pts, close = true, c = line) => {
    g.strokeStyle = c;
    g.lineWidth = 1;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(Math.round(x) + 0.5, Math.round(y) + 0.5) : g.moveTo(Math.round(x) + 0.5, Math.round(y) + 0.5)));
    if (close) g.closePath();
    g.stroke();
  };
  const dash = (x0, y0, x1, y1) => { g.setLineDash([3, 3]); path([[x0, y0], [x1, y1]], false, dim); g.setLineDash([]); };
  for (const sp of spots) {
    const x = sp.x * k, y = sp.y * k, s = (sp.s ?? 1) * k;
    if (sp.kind === 'flask') {
      path([[x - 14 * s, y - 70 * s], [x + 14 * s, y - 70 * s], [x + 14 * s, y - 30 * s], [x + 60 * s, y + 50 * s], [x - 60 * s, y + 50 * s], [x - 14 * s, y - 30 * s]]);
      path([[x - 20 * s, y - 78 * s], [x + 20 * s, y - 78 * s], [x + 20 * s, y - 70 * s], [x - 20 * s, y - 70 * s]]);
      path([[x - 38 * s, y + 12 * s], [x + 38 * s, y + 12 * s]], false, dim);
      for (const [bx, by] of [[-12, 30], [8, 22], [20, 36], [-26, 40]]) g.strokeRect(Math.round(x + bx * s) + 0.5, Math.round(y + by * s) + 0.5, 3, 3);
      dash(x + 72 * s, y - 70 * s, x + 72 * s, y + 50 * s);
      path([[x + 66 * s, y - 70 * s], [x + 78 * s, y - 70 * s]], false, dim);
      path([[x + 66 * s, y + 50 * s], [x + 78 * s, y + 50 * s]], false, dim);
    } else if (sp.kind === 'gear') {
      const pts = [];
      const n = 12, ro = 54 * s, ri = 44 * s;
      for (let i = 0; i < n * 4; i++) {
        const a = (i / (n * 4)) * Math.PI * 2, r = i % 4 < 2 ? ro : ri;
        pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
      }
      path(pts);
      const hex = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; hex.push([x + Math.cos(a) * 16 * s, y + Math.sin(a) * 16 * s]); }
      path(hex);
      dash(x - 70 * s, y, x + 70 * s, y);
      dash(x, y - 70 * s, x, y + 70 * s);
    } else if (sp.kind === 'coil') {
      path([[x - 34 * s, y + 60 * s], [x + 34 * s, y + 60 * s], [x + 34 * s, y + 48 * s], [x - 34 * s, y + 48 * s]]);
      path([[x - 14 * s, y + 48 * s], [x + 14 * s, y + 48 * s], [x + 14 * s, y - 30 * s], [x - 14 * s, y - 30 * s]]);
      for (let yy = -24; yy < 46; yy += 8) path([[x - 14 * s, y + yy * s], [x + 14 * s, y + (yy + 4) * s]], false, dim);
      path([[x - 26 * s, y - 30 * s], [x + 26 * s, y - 30 * s], [x + 18 * s, y - 52 * s], [x - 18 * s, y - 52 * s]]);
      path([[x + 30 * s, y - 50 * s], [x + 44 * s, y - 62 * s], [x + 38 * s, y - 70 * s], [x + 56 * s, y - 84 * s]], false);
      path([[x - 30 * s, y - 50 * s], [x - 46 * s, y - 58 * s], [x - 40 * s, y - 68 * s], [x - 58 * s, y - 78 * s]], false);
    } else if (sp.kind === 'dna') {
      const a = [], b = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, yy = y - 80 * s + t * 160 * s, ph = t * Math.PI * 4;
        a.push([x + Math.sin(ph) * 26 * s, yy]);
        b.push([x - Math.sin(ph) * 26 * s, yy]);
        if (i % 4 === 2) path([[x + Math.sin(ph) * 26 * s, yy], [x - Math.sin(ph) * 26 * s, yy]], false, dim);
      }
      path(a, false);
      path(b, false);
    }
  }
}
