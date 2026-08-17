// --- Lighting (shared across all renderers) ---

// Light direction: points TOWARD the light source (sun at bottom-left of screen, above).
// In world coords: west (-x), slightly south (+y), well above (+z).
const _ld = [-2, 1, 3];
const _ldLen = Math.hypot(..._ld);
const LIGHT_DIR = _ld.map(v => v / _ldLen);

// Compute outward-facing unit normal from a polygon's 3D vertices.
function computeNormal(pts) {
    const ax = pts[1].x - pts[0].x, ay = pts[1].y - pts[0].y, az = pts[1].z - pts[0].z;
    const bx = pts[2].x - pts[0].x, by = pts[2].y - pts[0].y, bz = pts[2].z - pts[0].z;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz);
    return len > 0 ? { x: nx / len, y: ny / len, z: nz / len } : { x: 0, y: 0, z: 1 };
}

// Adjust an HSL color string based on how much the face normal aligns with the light.
// Returns a new HSL string. Lightness is shifted by up to ±18%, clamped to [10, 95].
//
// The parse is memoized: this runs for every polygon every frame, and the regex +
// parseFloat calls dominated the per-poly cost. The cache is keyed on the color
// string alone (a small finite set), so the output stays exact per (color, normal).
const _colorParseCache = new Map();
function applyLighting(hslStr, normal) {
    let c = _colorParseCache.get(hslStr);
    if (c === undefined) {
        const m = hslStr.match(/hsl\(\s*(-?[\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\s*\)/);
        c = m && {
            l: parseFloat(m[3]),
            prefix: `hsl(${Math.round(parseFloat(m[1]))}, ${Math.round(parseFloat(m[2]))}%, `,
        };
        _colorParseCache.set(hslStr, c);
    }
    if (!c) return hslStr;   // not an hsl() color: pass through unlit

    const dot = normal.x * LIGHT_DIR[0] + normal.y * LIGHT_DIR[1] + normal.z * LIGHT_DIR[2];
    const newL = Math.max(10, Math.min(95, c.l + dot * 18));
    return c.prefix + Math.round(newL) + '%)';
}
