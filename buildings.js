// --- Building generation (all units in feet) ---

function hsl(h, s, l) {
    return `hsl(${Math.round(h)}, ${Math.round(Math.max(0, Math.min(100, s)))}%, ${Math.round(Math.max(0, Math.min(100, l)))}%)`;
}

// Creates a rectangular prism at position (ox, oy, oz) with dimensions w x l x h.
// color = {h, s, l} in HSL. Returns array of face polygons (skip bottom face).
// Each face: { pts: [{x,y,z}, ...], color: 'hsl(...)' }
function makeRectangularPrism(ox, oy, oz, w, l, h, color) {
    const v = [
        {x: ox,     y: oy,     z: oz},       // 0: bottom-SW
        {x: ox + w, y: oy,     z: oz},       // 1: bottom-SE
        {x: ox + w, y: oy + l, z: oz},       // 2: bottom-NE
        {x: ox,     y: oy + l, z: oz},       // 3: bottom-NW
        {x: ox,     y: oy,     z: oz + h},   // 4: top-SW
        {x: ox + w, y: oy,     z: oz + h},   // 5: top-SE
        {x: ox + w, y: oy + l, z: oz + h},   // 6: top-NE
        {x: ox,     y: oy + l, z: oz + h},   // 7: top-NW
    ];

    return [
        // Top face - brightest
        { pts: [v[4], v[5], v[6], v[7]], color: hsl(color.h, color.s, color.l + 15) },
        // North face (y=oy, facing -y)
        { pts: [v[0], v[1], v[5], v[4]], color: hsl(color.h, color.s, color.l - 10) },
        // South face (y=oy+l, facing +y) - right wall in iso, darkest
        { pts: [v[2], v[3], v[7], v[6]], color: hsl(color.h, color.s, color.l - 15) },
        // West face (x=ox, facing -x) - left wall in iso, medium
        { pts: [v[3], v[0], v[4], v[7]], color: hsl(color.h, color.s, color.l - 5) },
        // East face (x=ox+w, facing +x)
        { pts: [v[1], v[2], v[6], v[5]], color: hsl(color.h, color.s, color.l - 10) },
    ];
}

// Check if two axis-aligned rectangular prisms overlap (interiors intersect).
// Each prism: { x, y, z, w, l, h }
// Touching along a face/edge is allowed; only interior overlap is rejected.
function prismsOverlap(a, b) {
    const eps = 0.1;
    return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps &&
           a.y < b.y + b.l - eps && b.y < a.y + a.l - eps &&
           a.z < b.z + b.h - eps && b.z < a.z + a.h - eps;
}

// Generate a random house made of 1-3 rectangular prisms.
// Returns a Drawable: { polys: [ {pts, color}, ... ] }
function generateHouse() {
    const hue = Math.random() * 360;
    const color = {
        h: hue,
        s: 50 + Math.random() * 40,   // 50-90%
        l: 45 + Math.random() * 15     // 45-60%
    };

    const numPrisms = 1 + Math.floor(Math.random() * 3); // 1-3
    const polys = [];
    const bounds = []; // track prism bounds for overlap checks

    // Main prism
    const w1 = 20 + Math.random() * 20;  // 20-40ft
    const l1 = 25 + Math.random() * 20;  // 25-45ft
    const h1 = 8.5 + Math.random() * 1;  // ~9ft
    polys.push(...makeRectangularPrism(0, 0, 0, w1, l1, h1, color));
    bounds.push({ x: 0, y: 0, z: 0, w: w1, l: l1, h: h1 });

    // Additional wing prisms, attached to a random side of the main prism
    for (let i = 1; i < numPrisms; i++) {
        const w = 12 + Math.random() * 15;   // 12-27ft
        const l = 12 + Math.random() * 15;
        const h = 8.5 + Math.random() * 1;

        // Try up to 8 random placements to find one without overlap
        let placed = false;
        for (let attempt = 0; attempt < 8; attempt++) {
            const side = Math.floor(Math.random() * 4);
            let ox, oy;
            switch (side) {
                case 0: // East side
                    ox = w1;
                    oy = Math.random() * Math.max(0, l1 - l);
                    break;
                case 1: // West side
                    ox = -w;
                    oy = Math.random() * Math.max(0, l1 - l);
                    break;
                case 2: // South side
                    ox = Math.random() * Math.max(0, w1 - w);
                    oy = l1;
                    break;
                case 3: // North side
                    ox = Math.random() * Math.max(0, w1 - w);
                    oy = -l;
                    break;
            }

            const candidate = { x: ox, y: oy, z: 0, w, l, h };
            if (!bounds.some(b => prismsOverlap(b, candidate))) {
                polys.push(...makeRectangularPrism(ox, oy, 0, w, l, h, color));
                bounds.push(candidate);
                placed = true;
                break;
            }
        }
        // If no valid placement found after retries, skip this wing
    }

    return { polys };
}
