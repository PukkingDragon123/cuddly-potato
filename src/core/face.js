// Expressive pixel-art faces drawn onto a small canvas and used as a texture
// on the front of chibi heads. Eyes/mouths swap freely, with auto-blink
// and talking animation.
import * as THREE from 'three';
import { hexToCss, rand } from './util.js';

const S = 20; // canvas resolution (2px per head voxel)
const INK = '#1b1530';
const WHITE = '#ffffff';
const RED = '#c8324a';
const TONGUE = '#ff7a8a';

function P(ctx, x, y, c, w = 1, h = 1) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

// Eye painters draw one eye at (x,y) = top-left of a 3x4 cell. `side` = -1 left, 1 right.
const EYES = {
  normal(ctx, x, y, side, iris) {
    P(ctx, x, y, INK, 3, 4);
    P(ctx, x + 1, y + 2, iris, 2, 2);
    P(ctx, x + (side < 0 ? 0 : 0), y, WHITE);
    P(ctx, x + 1, y + 1, WHITE);
  },
  happy(ctx, x, y) {
    P(ctx, x, y + 2, INK); P(ctx, x + 1, y + 1, INK); P(ctx, x + 2, y + 2, INK);
    P(ctx, x - 0, y + 3, INK); P(ctx, x + 2, y + 3, INK);
  },
  closed(ctx, x, y) {
    P(ctx, x, y + 2, INK, 3, 1);
  },
  shock(ctx, x, y) {
    P(ctx, x - 1, y - 1, INK, 5, 6);
    P(ctx, x, y, WHITE, 3, 4);
    P(ctx, x + 1, y + 1, INK, 1, 2);
  },
  angry(ctx, x, y, side, iris) {
    EYES.normal(ctx, x, y + 1, side, iris);
    // slanted brow toward centre
    if (side < 0) { P(ctx, x - 1, y - 1, INK, 2, 1); P(ctx, x + 1, y, INK, 2, 1); P(ctx, x + 3, y + 1, INK); }
    else { P(ctx, x + 2, y - 1, INK, 2, 1); P(ctx, x, y, INK, 2, 1); P(ctx, x - 1, y + 1, INK); }
    P(ctx, x, y + 1, '#00000000');
  },
  sad(ctx, x, y, side, iris) {
    EYES.normal(ctx, x, y + 1, side, iris);
    if (side < 0) { P(ctx, x + 2, y - 1, INK, 2, 1); P(ctx, x, y - 0, INK, 2, 1); }
    else { P(ctx, x - 1, y - 1, INK, 2, 1); P(ctx, x + 1, y - 0, INK, 2, 1); }
    P(ctx, x + 1, y + 5, '#6cc7ff');
  },
  determined(ctx, x, y, side, iris) {
    EYES.normal(ctx, x, y + 1, side, iris);
    P(ctx, x - 1, y - 1, INK, 5, 1);
  },
  dizzy(ctx, x, y) {
    P(ctx, x, y, INK); P(ctx, x + 2, y, INK); P(ctx, x + 1, y + 1, INK); P(ctx, x, y + 2, INK); P(ctx, x + 2, y + 2, INK);
  },
  star(ctx, x, y) {
    const c = '#ffd23f';
    P(ctx, x + 1, y - 1, c); P(ctx, x, y + 1, c, 3, 1); P(ctx, x + 1, y, c, 1, 3); P(ctx, x - 1, y + 1, c); P(ctx, x + 3, y + 1, c);
    P(ctx, x + 1, y + 1, WHITE);
  },
  money(ctx, x, y) {
    const g = '#2fbf4f';
    P(ctx, x, y, g, 3, 4);
    P(ctx, x + 1, y - 1, g, 1, 6);
    P(ctx, x + 1, y + 1, '#c9ffb0');
  },
  heart(ctx, x, y) {
    const c = '#ff3d7f';
    P(ctx, x - 1, y, c, 2, 2); P(ctx, x + 2, y, c, 2, 2); P(ctx, x - 1, y + 1, c, 5, 2); P(ctx, x, y + 3, c, 3, 1); P(ctx, x + 1, y + 4, c);
    P(ctx, x - 1, y, WHITE);
  },
  wink(ctx, x, y, side, iris) {
    if (side < 0) EYES.normal(ctx, x, y, side, iris);
    else EYES.happy(ctx, x, y);
  },
  sleepy(ctx, x, y, side, iris) {
    P(ctx, x, y + 2, INK, 3, 2);
    P(ctx, x + 1, y + 3, iris, 2, 1);
  },
  side(ctx, x, y, side, iris) {
    P(ctx, x, y, INK, 3, 4);
    P(ctx, x + 2, y + 1, iris, 1, 2);
    P(ctx, x + 2, y + 1, WHITE);
  },
};

// Mouth painters at centre (cx, y).
const MOUTHS = {
  smile(ctx, cx, y) {
    P(ctx, cx - 3, y, INK); P(ctx, cx - 2, y + 1, INK, 4, 1); P(ctx, cx + 2, y, INK);
  },
  grin(ctx, cx, y) {
    P(ctx, cx - 3, y, INK, 6, 3);
    P(ctx, cx - 2, y, WHITE, 4, 1);
    P(ctx, cx - 1, y + 2, TONGUE, 2, 1);
  },
  open(ctx, cx, y) {
    P(ctx, cx - 2, y, INK, 4, 3);
    P(ctx, cx - 1, y + 1, RED, 2, 2);
  },
  shout(ctx, cx, y) {
    P(ctx, cx - 3, y - 1, INK, 6, 5);
    P(ctx, cx - 2, y - 1, WHITE, 4, 1);
    P(ctx, cx - 2, y + 2, RED, 4, 2);
  },
  frown(ctx, cx, y) {
    P(ctx, cx - 3, y + 1, INK); P(ctx, cx - 2, y, INK, 4, 1); P(ctx, cx + 2, y + 1, INK);
  },
  flat(ctx, cx, y) {
    P(ctx, cx - 2, y + 1, INK, 4, 1);
  },
  smirk(ctx, cx, y) {
    P(ctx, cx - 2, y + 1, INK, 3, 1); P(ctx, cx + 1, y, INK); P(ctx, cx + 2, y - 1, INK);
  },
  tongue(ctx, cx, y) {
    MOUTHS.smile(ctx, cx, y);
    P(ctx, cx, y + 2, TONGUE, 2, 2);
  },
  wobble(ctx, cx, y) {
    P(ctx, cx - 3, y + 1, INK); P(ctx, cx - 2, y, INK); P(ctx, cx - 1, y + 1, INK); P(ctx, cx, y, INK); P(ctx, cx + 1, y + 1, INK); P(ctx, cx + 2, y, INK);
  },
  teeth(ctx, cx, y) {
    P(ctx, cx - 3, y - 1, INK, 6, 4);
    P(ctx, cx - 2, y, WHITE, 4, 2);
    P(ctx, cx - 1, y, INK, 1, 2);
    P(ctx, cx + 1, y, INK, 1, 2);
  },
  o(ctx, cx, y) {
    P(ctx, cx - 1, y, INK, 2, 2);
  },
  cat(ctx, cx, y) {
    P(ctx, cx - 3, y, INK); P(ctx, cx - 2, y + 1, INK); P(ctx, cx - 1, y, INK, 2, 1); P(ctx, cx + 1, y + 1, INK); P(ctx, cx + 2, y, INK);
  },
  chew(ctx, cx, y) {
    P(ctx, cx - 2, y, INK, 4, 2);
    P(ctx, cx - 1, y, '#6e3e26', 2, 1);
  },
};

export const EYE_TYPES = Object.keys(EYES);
export const MOUTH_TYPES = Object.keys(MOUTHS);

export class PixelFace {
  constructor(opts = {}) {
    this.iris = hexToCss(opts.eyeColor ?? 0x2a2a4a);
    this.blush = opts.blush ?? true;
    this.eyeY = opts.eyeY ?? 8;
    this.mouthY = opts.mouthY ?? 14;
    this.canvas = document.createElement('canvas');
    this.canvas.width = S;
    this.canvas.height = S;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.eyes = 'normal';
    this.mouth = 'smile';
    this.baseEyes = 'normal';
    this.baseMouth = 'smile';
    this.blinkT = rand(1.5, 4);
    this.blinking = 0;
    this.talking = false;
    this.talkT = 0;
    this.holdT = 0;
    this.dirty = true;
    this.redraw();
  }

  /** Set expression. hold>0 returns to base after hold seconds. */
  set(eyes, mouth, hold = 0) {
    if (hold > 0) {
      this.holdT = hold;
    } else {
      this.baseEyes = eyes ?? this.baseEyes;
      this.baseMouth = mouth ?? this.baseMouth;
      this.holdT = 0;
    }
    if (eyes) this.eyes = eyes;
    if (mouth) this.mouth = mouth;
    this.dirty = true;
  }
  talk(on) {
    this.talking = on;
    this.dirty = true;
  }

  update(dt) {
    if (this.holdT > 0) {
      this.holdT -= dt;
      if (this.holdT <= 0) {
        this.eyes = this.baseEyes;
        this.mouth = this.baseMouth;
        this.dirty = true;
      }
    }
    this.blinkT -= dt;
    if (this.blinkT <= 0 && this.blinking <= 0) {
      this.blinking = 0.12;
      this.blinkT = rand(2, 5);
      this.dirty = true;
    }
    if (this.blinking > 0) {
      this.blinking -= dt;
      if (this.blinking <= 0) this.dirty = true;
    }
    if (this.talking) {
      this.talkT += dt;
      const open = Math.floor(this.talkT * 9) % 2 === 0;
      if (open !== this._lastOpen) {
        this._lastOpen = open;
        this.dirty = true;
      }
    }
    if (this.dirty) this.redraw();
  }

  redraw() {
    this.dirty = false;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, S, S);
    const blinkable = ['normal', 'angry', 'sad', 'determined', 'side', 'wink'].includes(this.eyes);
    const eyes = this.blinking > 0 && blinkable ? 'closed' : this.eyes;
    const e = EYES[eyes] || EYES.normal;
    e(ctx, 4, this.eyeY, -1, this.iris);
    e(ctx, 13, this.eyeY, 1, this.iris);
    if (this.blush) {
      ctx.fillStyle = 'rgba(255,110,140,0.55)';
      ctx.fillRect(2, this.eyeY + 5, 3, 1);
      ctx.fillRect(15, this.eyeY + 5, 3, 1);
    }
    let mouth = this.mouth;
    if (this.talking) mouth = this._lastOpen ? (mouth === 'grin' || mouth === 'shout' ? 'shout' : 'open') : mouth === 'open' ? 'smile' : mouth;
    (MOUTHS[mouth] || MOUTHS.smile)(ctx, 10, this.mouthY);
    this.texture.needsUpdate = true;
  }
}
