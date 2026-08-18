// --- Street names ---
// Cosmetic only: streets.js's pushStreet() stamps every new segment with one of
// these, picked fresh each time rather than tracked per logical street, so the
// same street can (and often will) change names block to block -- exactly like
// a real one crossing a town line, and much simpler than threading a shared name
// through every slot that might extend it. Loaded before streets.js in both
// pages that use it (driving.html, streetTest.html); tools/render.js picks it up
// automatically since DEFAULT_SCRIPTS reads streetTest.html's own script tags.
//
// One flat list rather than a "pick a category, then a name" structure: a real
// town's street names don't cluster that way either, and a flat array keeps
// randomStreetName() to one line. The categories below are just how the list
// was assembled -- ordinary American suburb, a few genuinely famous streets,
// the Monopoly board, UK, Canada, and the rest of the English-speaking world,
// then cutesy names and, because a city that never smiles at itself gets old,
// a batch that are just jokes.
const STREET_NAMES = [
    // --- Ordinary American suburb ---
    'Maple Street', 'Oak Street', 'Elm Street', 'Pine Street', 'Cedar Lane',
    'Birch Avenue', 'Willow Way', 'Chestnut Court', 'Magnolia Drive', 'Sycamore Street',
    'Walnut Avenue', 'Cherry Lane', 'Poplar Drive', 'Aspen Court', 'Hickory Street',
    'Sunset Boulevard', 'Sunrise Avenue', 'Highland Avenue', 'Lakeview Drive', 'Riverside Drive',
    'Meadow Lane', 'Forest Avenue', 'Hillcrest Drive', 'Park Avenue', 'Main Street',
    'Elm Court', 'School Street', 'Church Street', 'Mill Street', 'Spring Street',
    'Water Street', 'Market Street', 'Franklin Street', 'Washington Avenue', 'Jefferson Street',
    'Lincoln Avenue', 'Madison Street', 'Adams Street', 'Monroe Avenue', 'Jackson Street',
    'Ridge Road', 'Valley View Drive', 'Orchard Lane', 'Fairview Avenue', 'Prairie Lane',

    // --- Genuinely famous ---
    'Fifth Avenue', 'Madison Avenue', 'Broadway', 'Wall Street', 'Constitution Avenue',
    'Pennsylvania Avenue', 'Rodeo Drive', 'Sunset Strip', 'Bourbon Street', 'Beale Street',
    'Michigan Avenue', 'Lombard Street', 'Route 66', 'Hollywood Boulevard', 'Las Vegas Boulevard',
    'Ocean Drive', 'Mulholland Drive', 'Bourbon Boulevard', 'Peachtree Street', 'Canal Street',

    // --- Monopoly board ---
    'Boardwalk', 'Park Place', 'Baltic Avenue', 'Mediterranean Avenue', 'Oriental Avenue',
    'Vermont Avenue', 'Connecticut Avenue', 'St. Charles Place', 'States Avenue', 'Virginia Avenue',
    'St. James Place', 'Tennessee Avenue', 'New York Avenue', 'Kentucky Avenue', 'Indiana Avenue',
    'Illinois Avenue', 'Atlantic Avenue', 'Ventnor Avenue', 'Marvin Gardens', 'Pacific Avenue',
    'North Carolina Avenue', 'Short Line',

    // --- United Kingdom ---
    'Baker Street', 'Abbey Road', 'Downing Street', 'Oxford Street', 'Regent Street',
    'Piccadilly', 'The Mall', 'Fleet Street', 'Carnaby Street', 'Coronation Street',
    'Kings Road', "Queen's Road", 'Church Lane', 'High Street', 'Station Road',
    'Victoria Street', 'Windsor Crescent', 'Balmoral Terrace', 'King George VI Avenue', 'Prince of Wales Drive',
    'Royal Crescent', 'Sherwood Close', 'Nottingham Way', 'Yorkshire Terrace', 'Wellington Mews',
    'Churchill Way', 'Buckingham Gate', 'Sussex Gardens', 'Cotswold Close', 'Elizabeth Terrace',

    // --- Canada ---
    'Yonge Street', 'Bay Street', 'Sussex Drive', 'Wellington Street', 'Robson Street',
    'Portage Avenue', 'Rideau Street', 'Sparks Street', 'Bloor Street', 'Queen Street West',
    'King Street East', 'Confederation Boulevard', 'Maple Leaf Lane', 'Mountie Way', 'Loonie Lane',

    // --- Rest of the English-speaking world ---
    'George Street', 'Bourke Street', 'Collins Street', 'Anzac Parade', 'Eureka Street',
    'Queen Street', 'Cuba Street', "O'Connell Street", 'Grafton Street', 'Long Street',
    'Nelson Mandela Boulevard', 'Karangahape Road', 'Corso Road', 'Waratah Way', 'Kiwi Court',

    // --- Cutesy ---
    'Happy Hollow', 'Whispering Pines', 'Sunshine Lane', 'Lucky Clover Court', 'Butterfly Meadow',
    'Rainbow Circle', 'Honeysuckle Lane', 'Bluebird Court', 'Firefly Trail', 'Dandelion Way',
    'Moonbeam Circle', 'Starlight Drive', 'Cricket Hollow', 'Sugar Maple Lane', 'Cozy Cottage Way',
    'Teddy Bear Lane', 'Puddle Jumper Path', 'Gumdrop Lane', 'Marshmallow Court', 'Snuggle Bug Lane',
    'Little Acorn Way', "Robin's Nest Road", 'Cottontail Court', 'Ladybug Lane', 'Sweetbriar Circle',
    'Twinkle Star Way', 'Peppermint Place', 'Buttercup Lane', 'Sleepy Hollow Road', 'Pixie Dust Path',

    // --- Playful and mildly humorous ---
    'Rush Hour Road', 'Speed Bump Street', 'Cul-de-Sac Court', 'Wrong Way Way', 'Fender Bender Boulevard',
    'Parking Lot Place', 'Lost Sock Lane', 'Couch Potato Court', 'Nap Time Nook', 'Wifi Way',
    'Procrastination Place', 'Monday Blues Boulevard', 'Yield Yonder Yard', 'No U-Turn Terrace', 'Squeaky Wheel Way',
    'Backseat Driver Boulevard', 'Gridlock Grove', 'Honking Hollow', 'Pothole Parkway', 'Détour Drive',
    'Blinker Optional Blvd', 'Mystery Meat Court', 'Odd Sock Alley', 'Snooze Button Street', 'Buffering Boulevard',
    'Left Turn Only Lane', 'Deja Vu Drive', 'Cardboard Box Court', 'Almost There Avenue', 'Second Breakfast Street',
];

function randomStreetName() {
    return STREET_NAMES[Math.floor(Math.random() * STREET_NAMES.length)];
}
