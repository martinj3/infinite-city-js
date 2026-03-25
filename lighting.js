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
// Returns a new HSL string. Lightness is shifted by up to ±12%, clamped to [10, 95].
function applyLighting(hslStr, normal) {
    const m = hslStr.match(/hsl\(\s*(-?[\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\s*\)/);
    if (!m) return hslStr;
    const h = parseFloat(m[1]);
    const s = parseFloat(m[2]);
    const l = parseFloat(m[3]);

    const dot = normal.x * LIGHT_DIR[0] + normal.y * LIGHT_DIR[1] + normal.z * LIGHT_DIR[2];
    const newL = Math.max(10, Math.min(95, l + dot * 12));

    return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(newL)}%)`;
}
