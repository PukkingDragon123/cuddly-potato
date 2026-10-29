// Web Worker: bakes the SHOP bunker's voxel props (bunkerProps.js) off the main thread and sends
// the raw typed arrays back (transferred, not copied).
import { SPECS, bakeSpec } from './bunkerProps.js';

self.onmessage = () => {
  try {
    const out = [], transfer = [];
    for (const sp of SPECS) {
      const r = bakeSpec(sp);
      out.push(r);
      transfer.push(r.position.buffer, r.normal.buffer, r.color.buffer, r.index.buffer);
    }
    self.postMessage(out, transfer);
  } catch (e) {
    self.postMessage({ error: String(e?.message ?? e) });
  }
};
