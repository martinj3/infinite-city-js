// --- Delivery van ---
// The UPS/FedEx step van, and the same box a food truck is built on: a tall square
// cargo body running the full width and nearly the full length, a short bonnet in
// front of it, and glass only where the cab is. Everything behind the driver is
// blank panel, which is what tells it apart from a bus at a glance -- so it asks
// for side glass over just the front fifth of the body and no rear window at all.
// See vehicleUtils.js for what every field means.

// Fleet liveries: mostly plain white, then brown, and a scattering of the strong
// single colours couriers paint their trucks.
const VAN_COLORS = [
    [34, 0,   0,  90],   // white
    [14, 25,  38, 30],   // parcel brown
    [8,  215, 50, 38],   // blue
    [5,  355, 55, 42],   // red
    [4,  0,   0,  25],   // near-black
    [3,  150, 35, 32],   // green
    [2,  45,  75, 52],   // yellow
    [2,  280, 45, 40],   // purple
];

const VAN_SPEC = {
    palette: VAN_COLORS,
    width: [7.2, 8.0],
    length: [20, 25],
    height: [9.0, 10.4],
    clearance: [1.0, 1.35],
    beltFrac: [0.42, 0.49],      // the cab's window line, and the top of the bonnet

    hoodFrac: [0.10, 0.16],      // short: the driver sits almost over the front axle
    rearFrac: [0.01, 0.03],      // the back of the box is flat, for the roll-up door
    hoodDrop: [0.35, 0.75],
    rearDrop: [0, 0.06],

    windscreenRake: [0.08, 0.22],
    backlightRake: [0.01, 0.05],
    minRoofFrac: 0.60,

    cabinInset: [0.0, 0.06],     // the cargo body is as wide as the truck gets
    wheelRadius: [1.25, 1.5],
    tireWidth: [0.8, 0.95],
    frontOverhang: [0.17, 0.22],
    rearOverhang: [0.11, 0.17],
    wheelInset: [0.05, 0.15],

    sideGlass: [0, 0.20],        // the cab, and nothing behind it
    rearGlass: false,            // a roll-up door has no window
};

function generateDeliveryVan() {
    return makeCarLike('deliveryVan', VAN_SPEC);
}

registerVehicle('deliveryVan', { generate: generateDeliveryVan, weight: 0.8 });
