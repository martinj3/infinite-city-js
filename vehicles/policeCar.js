// --- Police car ---
// A sedan, so it borrows sedan.js's proportions outright rather than copying them:
// anything that improves the sedan improves this too. What makes it a police car is
// the livery and the light bar across the roof.
//
// The bar is the first thing to use `roof`, the pass drawVehicle() paints after the
// body -- a roof fitting is above every part of the body by construction, so
// painting it last is always right, and depth sorting never has to resolve a small
// box lying inside the big one underneath it.

const POLICE_COLORS = [
    [10, 220, 35, 32],   // dark navy
    [8,  0,   0,  92],   // white
    [6,  0,   0,  15],   // black
    [4,  215, 45, 45],   // mid blue
];

const POLICE_LIGHT_RED = 'hsl(354, 78%, 46%)';
const POLICE_LIGHT_BLUE = 'hsl(222, 78%, 48%)';

const POLICE_SPEC = Object.assign({}, SEDAN_SPEC, {
    palette: POLICE_COLORS,
    length: [15, 17],            // patrol cars are full-size, never the small end
    width: [6, 7],
});

const BAR_LENGTH = [0.6, 0.9];       // front to back
const BAR_HEIGHT = [0.28, 0.38];
const BAR_SPAN = [0.80, 0.95];       // of the cabin width
const BAR_AT = [0.55, 0.72];         // where along the roof it sits, 1 = the front edge

function generatePoliceCar() {
    const car = makeCarLike('policeCar', POLICE_SPEC);
    const { roofZ, roofFront, roofRear, cabinHw } = car.frame;

    const barL = vehRand(BAR_LENGTH);
    const barH = vehRand(BAR_HEIGHT);
    const halfW = cabinHw * vehRand(BAR_SPAN);
    const x = roofRear + (roofFront - roofRear) * vehRand(BAR_AT) - barL / 2;

    // Two halves rather than one box, because a poly carries a single colour and
    // the point of a light bar is that it is red on one side and blue on the other.
    car.roof = [
        ...makeRectangularPrism(x, -halfW, roofZ, barL, halfW, barH, POLICE_LIGHT_RED),
        ...makeRectangularPrism(x, 0, roofZ, barL, halfW, barH, POLICE_LIGHT_BLUE),
    ];
    return car;
}

registerVehicle('policeCar', { generate: generatePoliceCar, weight: 0.4 });
