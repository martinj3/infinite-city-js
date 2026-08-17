// Headless renderer for agents (and anyone) without a browser.
//
// Runs the project's real scripts (constants.js, streets.js, drawing.js and a page
// script) inside a Node `vm` with a stub DOM, paints the frame with a small software
// canvas, and writes a PNG you can actually look at.
//
//   node tools/render.js city.png "?seed=42&streets=500"
//   node tools/render.js close.png "?seed=42&zoom=6&x=400&y=0" 1200x800
//
// The query string is exactly what streetTest.html accepts, so ?seed makes the
// output reproducible. Also exported for use as a module:
//
//   const { RasterCtx, renderPage, probeCtx } = require('./tools/render.js');
//
// Caveat: this rasterizer has no antialiasing, so features thinner than about a
// pixel drop out unpredictably. Trust it for layout and geometry; use probeCtx()
// (which counts draw calls instead of drawing) for anything hairline-thin.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
// Mirrors the script tags in streetTest.html
const DEFAULT_SCRIPTS = [
    'constants.js', 'controls.js', 'drawUtils.js', 'lighting.js', 'render3d.js',
    'buildings/buildingUtils.js', 'buildings/houses.js', 'buildings/offices.js',
    'buildings/skyscrapers.js',
    'buildings/churches.js',
    'streets.js', 'lots.js', 'drawing.js', 'streetTest.js',
];

// --- Matrix helpers (canvas transforms are 2x3: [a, b, c, d, e, f]) ---
function mul(m, n) { // apply n in m's local space
    return [
        m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
    ];
}
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function parseColor(c) {
    if (typeof c !== 'string') return [255, 0, 255, 1];
    let m = /^rgba?\(([^)]+)\)$/.exec(c.trim());
    if (m) {
        const p = m[1].split(',').map(parseFloat);
        return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
    if (m) {
        let h = m[1];
        if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
    }
    m = /^hsla?\(\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:[,/]\s*([\d.]+))?\)$/i.exec(c.trim());
    if (m) {
        const h = ((parseFloat(m[1]) % 360) + 360) % 360, s = parseFloat(m[2]) / 100, l = parseFloat(m[3]) / 100;
        const k = n => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return [f(0) * 255, f(8) * 255, f(4) * 255, m[4] === undefined ? 1 : parseFloat(m[4])];
    }
    return [255, 0, 255, 1]; // magenta: unparsed color
}

// --- Software 2D context ---
// Implements the subset of CanvasRenderingContext2D that drawing.js uses.
class RasterCtx {
    constructor(w, h) {
        this.w = w; this.h = h;
        this.buf = new Uint8Array(w * h * 3);
        this.m = [1, 0, 0, 1, 0, 0];
        this.stack = [];
        this.path = [];   // subpaths, each an array of [x, y] in device space
        this.cur = null;
        this.fillStyle = '#000'; this.strokeStyle = '#000';
        this.lineWidth = 1; this.globalAlpha = 1;
        this.font = ''; this.textAlign = 'left';
        this.canvas = { width: w, height: h };
    }

    save() { this.stack.push([this.m.slice(), this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha]); }
    restore() {
        const s = this.stack.pop();
        if (s) { this.m = s[0]; this.fillStyle = s[1]; this.strokeStyle = s[2]; this.lineWidth = s[3]; this.globalAlpha = s[4]; }
    }
    setTransform(a, b, c, d, e, f) { this.m = [a, b, c, d, e, f]; }
    translate(x, y) { this.m = mul(this.m, [1, 0, 0, 1, x, y]); }
    scale(x, y) { this.m = mul(this.m, [x, 0, 0, y, 0, 0]); }
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); this.m = mul(this.m, [c, s, -s, c, 0, 0]); }
    setLineDash() { }  // dashes ignored; dashed markings render solid

    beginPath() { this.path = []; this.cur = null; }
    moveTo(x, y) { this.cur = [apply(this.m, x, y)]; this.path.push(this.cur); }
    lineTo(x, y) { if (!this.cur) return this.moveTo(x, y); this.cur.push(apply(this.m, x, y)); }
    closePath() { if (this.cur && this.cur.length) this.cur.push(this.cur[0].slice()); }
    rect(x, y, w, h) {
        this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath();
    }
    arc(cx, cy, r, a0, a1, ccw) {
        let d = a1 - a0;
        if (!ccw) { while (d < 0) d += Math.PI * 2; while (d > Math.PI * 2) d -= Math.PI * 2; }
        else { while (d > 0) d -= Math.PI * 2; while (d < -Math.PI * 2) d += Math.PI * 2; }
        const steps = Math.max(6, Math.ceil(Math.abs(d) / 0.05));
        for (let i = 0; i <= steps; i++) {
            const a = a0 + d * i / steps;
            const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
            if (i === 0 && !this.cur) this.moveTo(x, y); else this.lineTo(x, y);
        }
    }

    px(x, y, col) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        const i = (y * this.w + x) * 3, a = col[3] * this.globalAlpha;
        this.buf[i] = this.buf[i] * (1 - a) + col[0] * a;
        this.buf[i + 1] = this.buf[i + 1] * (1 - a) + col[1] * a;
        this.buf[i + 2] = this.buf[i + 2] * (1 - a) + col[2] * a;
    }

    // Even-odd scanline fill. No antialiasing: thin shapes can drop out.
    fillPolys(polys, col) {
        let mnY = Infinity, mxY = -Infinity;
        for (const p of polys) for (const pt of p) {
            if (pt[1] < mnY) mnY = pt[1];
            if (pt[1] > mxY) mxY = pt[1];
        }
        const y0 = Math.max(0, Math.floor(mnY)), y1 = Math.min(this.h - 1, Math.ceil(mxY));
        for (let y = y0; y <= y1; y++) {
            const sy = y + 0.5, xs = [];
            for (const p of polys) {
                for (let i = 0; i < p.length; i++) {
                    const a = p[i], b = p[(i + 1) % p.length];
                    if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy))
                        xs.push(a[0] + (sy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
                }
            }
            xs.sort((a, b) => a - b);
            for (let i = 0; i + 1 < xs.length; i += 2) {
                const xa = Math.max(0, Math.ceil(xs[i] - 0.5));
                const xb = Math.min(this.w - 1, Math.floor(xs[i + 1] - 0.5));
                for (let x = xa; x <= xb; x++) this.px(x, y, col);
            }
        }
    }

    fill() { if (this.path.length) this.fillPolys(this.path, parseColor(this.fillStyle)); }
    fillRect(x, y, w, h) {
        this.fillPolys([[apply(this.m, x, y), apply(this.m, x + w, y),
                         apply(this.m, x + w, y + h), apply(this.m, x, y + h)]], parseColor(this.fillStyle));
    }
    clearRect() { }
    stroke() {
        const col = parseColor(this.strokeStyle);
        const lw = Math.max(1, this.lineWidth);
        for (const p of this.path) {
            for (let i = 0; i + 1 < p.length; i++) {
                const [x0, y0] = p[i], [x1, y1] = p[i + 1];
                const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
                for (let k = 0; k <= n; k++) {
                    const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n;
                    for (let dy = -(lw - 1) / 2; dy <= (lw - 1) / 2; dy++)
                        for (let dx = -(lw - 1) / 2; dx <= (lw - 1) / 2; dx++)
                            this.px(Math.round(x + dx), Math.round(y + dy), col);
                }
            }
        }
    }
    // No glyphs: HUD text and the lettering on a truck's box are not rendered.
    // measureText still answers with a plausible width for the current font, so
    // that code laying text out (render3d.js fits a name to its panel) divides by
    // something real instead of by zero.
    fillText() { }
    strokeText() { }
    measureText(str) { return { width: estimateTextWidth(this.font, str) }; }

    toPNG() {
        const stride = this.w * 3 + 1;
        const raw = Buffer.alloc(stride * this.h);
        for (let y = 0; y < this.h; y++) {
            raw[y * stride] = 0; // filter type 0
            Buffer.from(this.buf.buffer, y * this.w * 3, this.w * 3).copy(raw, y * stride + 1);
        }
        const table = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c >>> 0;
        }
        const crc = b => {
            let c = 0xFFFFFFFF;
            for (const x of b) c = table[(c ^ x) & 0xFF] ^ (c >>> 8);
            return (c ^ 0xFFFFFFFF) >>> 0;
        };
        const chunk = (type, data) => {
            const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
            const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
            const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
            return Buffer.concat([len, td, c]);
        };
        const ihdr = Buffer.alloc(13);
        ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4);
        ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
        return Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
            chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
        ]);
    }
}

// What a string would measure in the given font, near enough for code that fits
// text to a box. Neither test context draws glyphs, but both have to answer this
// or such code divides by zero and never takes the branch it exists for.
function estimateTextWidth(font, str) {
    const m = /([\d.]+)px/.exec(font || '');
    return 0.55 * (m ? parseFloat(m[1]) : 16) * String(str).length;
}

// A context that draws nothing and reports every call instead. Use it to assert on
// counts ("every street draws two sidewalk bands") or to catch NaN reaching the
// canvas -- questions pixels answer badly.
function probeCtx(onCall, width = 900, height = 700) {
    // Properties are kept rather than discarded, so that measureText can answer
    // for whatever font was last set -- without it the probe never exercises the
    // "shrink this name to fit" branch, and reports text that the real canvas
    // would have found too small to draw.
    const state = {};
    return new Proxy(state, {
        get(_, k) {
            if (k === 'canvas') return { width, height };
            return (...args) => {
                if (onCall) onCall(String(k), args);
                // Every call is reported and returns nothing -- except the one
                // whose result callers read back.
                if (k === 'measureText') return { width: estimateTextWidth(state.font, args[0]) };
            };
        },
        set(_, k, v) { state[k] = v; return true; }
    });
}

// Load the project's scripts into a sandbox with a stub DOM. The page script runs
// for real, so URL parameters behave exactly as they do in the browser.
function renderPage({ search = '', width = 900, height = 700, scripts = DEFAULT_SCRIPTS, ctx = null } = {}) {
    ctx = ctx || new RasterCtx(width, height);
    const el = { width, height, getContext: () => ctx, toBlob: () => { } };
    const sandbox = {
        document: { getElementById: () => el, createElement: () => ({ click() { } }) },
        innerWidth: width, innerHeight: height,
        location: { search },
        URLSearchParams,
        URL: { createObjectURL: () => '', revokeObjectURL: () => { } },
        addEventListener: () => { },
        requestAnimationFrame: () => { },   // no-op: the page's loop never runs
        performance, console, Math
    };
    vm.createContext(sandbox);
    for (const f of scripts) {
        // A { code } entry stands in for an inline <script> tag, which is how the
        // lot grid pages pick which building type they are showing.
        const [src, name] = typeof f === 'string'
            ? [fs.readFileSync(path.join(ROOT, f), 'utf8'), f]
            : [f.code, f.name || '<inline>'];
        vm.runInContext(src, sandbox, { filename: name });
    }
    return { ctx, sandbox, run: expr => vm.runInContext(expr, sandbox) };
}

module.exports = { RasterCtx, renderPage, probeCtx, ROOT, DEFAULT_SCRIPTS };

// --- CLI ---
if (require.main === module) {
    const out = process.argv[2] || 'render.png';
    const search = process.argv[3] || '';
    const size = /^(\d+)x(\d+)$/.exec(process.argv[4] || '');
    const width = size ? +size[1] : 900, height = size ? +size[2] : 700;

    const { ctx, run } = renderPage({ search, width, height });
    run('drawScene(camX, camY); drawHud();');
    fs.writeFileSync(out, ctx.toPNG());
    console.log(`wrote ${out} (${width}x${height})`, {
        streets: run('streets.length'),
        intersections: run('nodes.size'),
        unresolved: run('countUnresolved()'),
        zoom: +run('PX_PER_FT').toFixed(3),
        cam: [Math.round(run('camX')), Math.round(run('camY'))],
        buildMs: +run('stats.ms').toFixed(0)
    });
}
