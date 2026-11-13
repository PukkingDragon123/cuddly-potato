#!/usr/bin/env python3
"""Swarm Text: the game's hand-made proportional pixel font, Regular + Bold.

Every glyph below is a bitmap drawn by hand on a 10 px em:
  cap height 7, x-height 5, ascenders 7, descenders 2, 1 px of space above the caps.
  Regular: 1 px stems. Bold: 2 px vertical stems, 1 px horizontals, 1 px counters kept open
  (made by widening the Regular skeleton one pixel, then hand-fixing every letter where that
  would close a counter: diagonals, m, w, k, *, ...).
  Advance = ink width + 1, so letters always sit exactly 1 px apart (no kerning needed).
  Digits are proportional; the 'tnum' feature makes them tabular (only '1' changes).

One font pixel = 100 units (1000 upm), so CSS font-size = 10 px x k renders every pixel as
k x k screen pixels (see src/ui/fonts.css and the --fq snapping in src/ui/ui.js).
The same construction rules (2 px stems, 1 px cut corners, the same letter skeletons) are
used by the big headline face in src/ui/bigType.js.

Usage:  pip install fonttools brotli && python3 tools/pixelfont/build.py
Writes src/assets/fonts/swarm-text-regular.woff2 and swarm-text-bold.woff2.
"""
import os
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

PX = 100
STAMP = 3_850_000_000  # fixed head timestamps (seconds since 1904) so rebuilds are byte-identical
ASC, DESC = 9, 3  # line box in font px (normal line-height = 1.2em); caps sit at rows 0..6
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'assets', 'fonts')

# (top row, rows) - row 0 is the cap top, row 6 sits on the baseline, rows 7-8 are descenders,
# row -1 is the accent row above the caps.
REGULAR = {
    'A': (0, '.###. #...# #...# ##### #...# #...# #...#'),
    'B': (0, '####. #...# #...# ####. #...# #...# ####.'),
    'C': (0, '.###. #...# #.... #.... #.... #...# .###.'),
    'D': (0, '####. #...# #...# #...# #...# #...# ####.'),
    'E': (0, '#### #... #... ###. #... #... ####'),
    'F': (0, '#### #... #... ###. #... #... #...'),
    'G': (0, '.###. #...# #.... #.### #...# #...# .####'),
    'H': (0, '#...# #...# #...# ##### #...# #...# #...#'),
    'I': (0, '### .#. .#. .#. .#. .#. ###'),
    'J': (0, '...# ...# ...# ...# ...# #..# .##.'),
    'K': (0, '#...# #..#. #.#.. ##... #.#.. #..#. #...#'),
    'L': (0, '#... #... #... #... #... #... ####'),
    'M': (0, '#...# ##.## #.#.# #.#.# #...# #...# #...#'),
    'N': (0, '#...# ##..# ##..# #.#.# #..## #..## #...#'),
    'O': (0, '.###. #...# #...# #...# #...# #...# .###.'),
    'P': (0, '####. #...# #...# ####. #.... #.... #....'),
    'Q': (0, '.###. #...# #...# #...# #.#.# #..#. .##.#'),
    'R': (0, '####. #...# #...# ####. #..#. #...# #...#'),
    'S': (0, '.###. #...# #.... .###. ....# #...# .###.'),
    'T': (0, '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..'),
    'U': (0, '#...# #...# #...# #...# #...# #...# .###.'),
    'V': (0, '#...# #...# #...# #...# .#.#. .#.#. ..#..'),
    'W': (0, '#...# #...# #...# #.#.# #.#.# ##.## #...#'),
    'X': (0, '#...# #...# .#.#. ..#.. .#.#. #...# #...#'),
    'Y': (0, '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..'),
    'Z': (0, '##### ....# ...#. ..#.. .#... #.... #####'),
    'a': (2, '.##. ...# .### #..# .###'),
    'b': (0, '#... #... ###. #..# #..# #..# ###.'),
    'c': (2, '.### #... #... #... .###'),
    'd': (0, '...# ...# .### #..# #..# #..# .###'),
    'e': (2, '.##. #..# #### #... .###'),
    'f': (0, '.## #.. ### #.. #.. #.. #..'),
    'g': (2, '.### #..# #..# #..# .### ...# ###.'),
    'h': (0, '#... #... ###. #..# #..# #..# #..#'),
    'i': (0, '# . # # # # #'),
    'j': (0, '.# .. .# .# .# .# .# .# #.'),
    'k': (0, '#... #... #..# #.#. ##.. #.#. #..#'),
    'l': (0, '#. #. #. #. #. #. .#'),
    'm': (2, '####. #.#.# #.#.# #.#.# #.#.#'),
    'n': (2, '###. #..# #..# #..# #..#'),
    'o': (2, '.##. #..# #..# #..# .##.'),
    'p': (2, '###. #..# #..# #..# ###. #... #...'),
    'q': (2, '.### #..# #..# #..# .### ...# ...#'),
    'r': (2, '#.## ##.. #... #... #...'),
    's': (2, '.### #... .##. ...# ###.'),
    't': (1, '#.. ### #.. #.. #.. .##'),
    'u': (2, '#..# #..# #..# #..# .###'),
    'v': (2, '#...# #...# .#.#. .#.#. ..#..'),
    'w': (2, '#...# #...# #.#.# #.#.# .#.#.'),
    'x': (2, '#...# .#.#. ..#.. .#.#. #...#'),
    'y': (2, '#..# #..# #..# #..# .### ...# .##.'),
    'z': (2, '#### ...# .##. #... ####'),
    '0': (0, '.##. #..# #.## ##.# #..# #..# .##.'),
    '1': (0, '.#. ##. .#. .#. .#. .#. ###'),
    '2': (0, '.##. #..# ...# ..#. .#.. #... ####'),
    '3': (0, '.##. #..# ...# .##. ...# #..# .##.'),
    '4': (0, '#..# #..# #..# #### ...# ...# ...#'),
    '5': (0, '#### #... ###. ...# ...# #..# .##.'),
    '6': (0, '.##. #... #... ###. #..# #..# .##.'),
    '7': (0, '#### ...# ...# ..#. .#.. .#.. .#..'),
    '8': (0, '.##. #..# #..# .##. #..# #..# .##.'),
    '9': (0, '.##. #..# #..# .### ...# ...# .##.'),
    '!': (0, '# # # # # . #'),
    '"': (0, '#.# #.#'),
    '#': (1, '.#.#. ##### .#.#. ##### .#.#.'),
    '$': (0, '..#.. .#### #.#.. .###. ..#.# ####. ..#..'),
    '%': (0, '##... ##..# ...#. ..#.. .#... #..## ...##'),
    '&': (0, '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#'),
    "'": (0, '# #'),
    '(': (0, '.# #. #. #. #. #. .#'),
    ')': (0, '#. .# .# .# .# .# #.'),
    '*': (1, '#.# .#. #.#'),
    '+': (2, '..#.. ..#.. ##### ..#.. ..#..'),
    ',': (6, '.# #.'),
    '-': (4, '###'),
    '.': (6, '#'),
    '/': (0, '..# ..# .#. .#. .#. #.. #..'),
    ':': (3, '# . . #'),
    ';': (3, '.# .. .. .# #.'),
    '<': (2, '..# .#. #.. .#. ..#'),
    '=': (3, '### ... ###'),
    '>': (2, '#.. .#. ..# .#. #..'),
    '?': (0, '.##. #..# ...# ..#. .#.. .... .#..'),
    '@': (0, '.###. #...# #.### #.#.# #.### #.... .####'),
    '[': (0, '## #. #. #. #. #. ##'),
    '\\': (0, '#.. #.. .#. .#. .#. ..# ..#'),
    ']': (0, '## .# .# .# .# .# ##'),
    '^': (0, '.#. #.#'),
    '_': (7, '####'),
    '`': (0, '#. .#'),
    '{': (0, '.## .#. .#. #.. .#. .#. .##'),
    '|': (0, '# # # # # # # #'),
    '}': (0, '##. .#. .#. ..# .#. .#. ##.'),
    '~': (3, '.#.# #.#.'),
    # common extras used by the UI
    '’': (0, '.# #.'),          # right single quote
    '‘': (0, '#. .#'),          # left single quote
    '“': (0, '#.#. .#.#'),
    '”': (0, '.#.# #.#.'),
    '…': (6, '#.#.#'),          # ellipsis
    '–': (4, '####'),           # en dash
    '—': (4, '#######'),        # em dash
    '·': (4, '#'),              # middle dot
    '•': (3, '.#. ### .#.'),    # bullet
    '×': (3, '#.# .#. #.#'),    # times
    '±': (1, '.#. ### .#. ... ###'),
    '°': (0, '.#. #.# .#.'),
    '¡': (2, '# . # # # # #'),
    '¿': (2, '..#. .... ..#. .#.. #... #..# .##.'),
    '²': (0, '##. ..# .#. ###'),
    '→': (2, '..#.. ...#. ##### ...#. ..#..'),
    '♥': (1, '.#.#. ##### ##### .###. ..#..'),
    '≈': (2, '.#.# #.#. .... .#.# #.#.'),
    'É': (-1, '..#. #### #... #... ###. #... #... ####'),
    'é': (-1, '...# ..#. .... .##. #..# #### #... .###'),
}

# Bold: the Regular skeleton widened by one pixel, except these hand-drawn letters.
BOLD_FIX = {
    'G': (0, '.####. ##..## ##.... ##.### ##..## ##..## .#####'),
    'K': (0, '##..## ##.##. ####.. ###... ####.. ##.##. ##..##'),
    'M': (0, '##...## ###.### ####### ##.#.## ##...## ##...## ##...##'),
    'N': (0, '##..## ###.## ###.## ###### ##.### ##.### ##..##'),
    'Q': (0, '.####. ##..## ##..## ##..## ##.### ##.##. .##.##'),
    'V': (0, '##..## ##..## ##..## ##..## .####. .####. ..##..'),
    'W': (0, '##...## ##...## ##...## ##.#.## ####### ###.### ##...##'),
    'X': (0, '##..## ##..## .####. ..##.. .####. ##..## ##..##'),
    'Y': (0, '##..## ##..## .####. ..##.. ..##.. ..##.. ..##..'),
    'Z': (0, '###### ....## ...##. ..##.. .##... ##.... ######'),
    'k': (0, '##... ##... ##.## ####. ###.. ####. ##.##'),
    'm': (2, '#######. ##.##.## ##.##.## ##.##.## ##.##.##'),
    'r': (2, '##.## ####. ##... ##... ##...'),
    'v': (2, '##..## ##..## .####. .####. ..##..'),
    'w': (2, '##...## ##.#.## ##.#.## ####### .##.##.'),
    'x': (2, '##..## .####. ..##.. .####. ##..##'),
    '0': (0, '.###. ##.## ##.## ##.## ##.## ##.## .###.'),
    '4': (0, '##.## ##.## ##.## ##### ...## ...## ...##'),
    '"': (0, '##.## ##.##'),
    '#': (1, '.##.##. ####### .##.##. ####### .##.##.'),
    '$': (0, '..##... .###### ##.##.. .#####. ..##.## ######. ..##...'),
    '&': (0, '.###.. ##.##. ##.##. .###.. ##.### ##.##. .##.##'),
    '*': (1, '##.## .###. ##.##'),
    '@': (0, '.#####. ##...## ##.#### ##.##.# ##.#### ##..... .######'),
    '~': (3, '.##.## ##.##.'),
    '“': (0, '##.##. .##.##'),
    '”': (0, '.##.## ##.##.'),
    '…': (6, '##.##.##'),
    '×': (3, '##.## .###. ##.##'),
    '°': (0, '.###. ##.## .###.'),
    '≈': (2, '.##.## ##.##. ...... .##.## ##.##.'),
}

NAMES = {' ': 'space'}


def gname(ch):
    if ch in NAMES:
        return NAMES[ch]
    return 'uni%04X' % ord(ch)


def parse(spec):
    top, rows = spec
    rows = rows.split()
    w = len(rows[0])
    assert all(len(r) == w for r in rows), (spec, [len(r) for r in rows])
    return top, rows


def embolden(spec):
    top, rows = parse(spec)
    out = []
    for r in rows:
        b = [c == '#' for c in r] + [False]
        s = ''.join('#' if b[i] or (i > 0 and b[i - 1]) else '.' for i in range(len(b)))
        out.append(s)
    return top, ' '.join(out)


def glyph_from(spec):
    """Rectangles (x0, y0, x1, y1) in font px merged from runs; advance in font px."""
    top, rows = parse(spec)
    w = len(rows[0])
    runs = {}  # (x0, x1) -> list of rows
    rects = []
    open_ = {}
    for ri, r in enumerate(rows):
        cur = set()
        x = 0
        while x < w:
            if r[x] == '#':
                x0 = x
                while x < w and r[x] == '#':
                    x += 1
                cur.add((x0, x))
            else:
                x += 1
        # close runs that do not continue
        for k in list(open_):
            if k not in cur:
                rects.append((k, open_.pop(k), ri))
        for k in cur:
            if k not in open_:
                open_[k] = ri
    for k, start in open_.items():
        rects.append((k, start, len(rows)))
    boxes = []
    for (x0, x1), r0, r1 in rects:
        # rows r0..r1-1 -> y: cap row n spans (6-n)..(7-n)
        y_top = 7 - (top + r0)
        y_bot = 7 - (top + r1)
        boxes.append((x0, y_bot, x1, y_top))
    return boxes, w + 1


def draw(boxes, lsb=0):
    pen = TTGlyphPen(None)
    for x0, y0, x1, y1 in boxes:
        x0, x1 = (x0 + lsb) * PX, (x1 + lsb) * PX
        y0, y1 = y0 * PX, y1 * PX
        pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
    return pen.glyph()


def build(style, glyphs, path):
    order = ['.notdef', 'space']
    cmap = {32: 'space'}
    glyf = {}
    metrics = {}
    # .notdef: hollow box
    nd = [(0, 0, 4, 1), (0, 6, 4, 7), (0, 1, 1, 6), (3, 1, 4, 6)]
    glyf['.notdef'] = draw(nd); metrics['.notdef'] = (5 * PX, 0)
    glyf['space'] = TTGlyphPen(None).glyph(); metrics['space'] = (3 * PX, 0)
    for ch, spec in glyphs.items():
        n = gname(ch)
        boxes, adv = glyph_from(spec)
        order.append(n); cmap[ord(ch)] = n
        glyf[n] = draw(boxes); metrics[n] = (adv * PX, 0)
    # tabular '1'
    one = gname('1')
    boxes, adv = glyph_from(glyphs['1'])
    two_adv = glyph_from(glyphs['2'])[1]
    order.append('one.tnum'); glyf['one.tnum'] = draw(boxes, lsb=(two_adv - adv)); metrics['one.tnum'] = (two_adv * PX, 0)
    cmap[0xA0] = 'space'

    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyf)
    # left side bearing = xMin of each glyph
    hm = {}
    for n in order:
        g = glyf[n]
        g.recalcBounds(fb.font['glyf']) if hasattr(g, 'recalcBounds') else None
        hm[n] = (metrics[n][0], getattr(g, 'xMin', 0) if g.numberOfContours else 0)
    fb.setupHorizontalMetrics(hm)
    fb.setupHorizontalHeader(ascent=ASC * PX, descent=-DESC * PX, lineGap=0)
    family = 'Swarm Text'
    fb.setupNameTable({'familyName': family, 'styleName': style,
                       'uniqueFontIdentifier': f'{family} {style}', 'fullName': f'{family} {style}',
                       'psName': f'SwarmText-{style}', 'version': 'Version 2.000',
                       'copyright': 'Hand-made for MrBeast Swarmers'})
    fb.setupOS2(sTypoAscender=ASC * PX, sTypoDescender=-DESC * PX, sTypoLineGap=0,
                usWinAscent=ASC * PX, usWinDescent=DESC * PX, sxHeight=5 * PX, sCapHeight=7 * PX,
                usWeightClass=700 if style == 'Bold' else 400,
                fsSelection=(0x20 if style == 'Bold' else 0x40) | 0x80,
                achVendID='SWRM', version=4)
    fb.setupPost(isFixedPitch=0, underlinePosition=-PX, underlineThickness=PX)
    fb.setupHead(unitsPerEm=1000, macStyle=1 if style == 'Bold' else 0, created=STAMP, modified=STAMP)
    addOpenTypeFeaturesFromString(fb.font, f'feature tnum {{ sub {one} by one.tnum; }} tnum;')
    fb.font.flavor = 'woff2'
    fb.save(path)
    print('wrote', os.path.normpath(path), len(order), 'glyphs')


def main():
    bold = {}
    for ch, spec in REGULAR.items():
        bold[ch] = BOLD_FIX.get(ch) or embolden(spec)
    build('Regular', REGULAR, os.path.join(OUT, 'swarm-text-regular.woff2'))
    build('Bold', bold, os.path.join(OUT, 'swarm-text-bold.woff2'))


if __name__ == '__main__':
    main()
