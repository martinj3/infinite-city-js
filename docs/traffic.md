# Traffic

`traffic.js` is the other cars, each with a driver at the wheel. The car's world
pose -- `cx, cy, angle, speed`, plain Numbers, so sub-foot precision comes free
-- is the truth now, integrated exactly the way the player's is: heading and
speed move the car and nothing snaps it to the road. The street the car is on is
only its driver's *intention*: the lane centreline they are trying to hold and
the route they mean to take. `pos` is kept as the true arc-length projection of
the car onto that centreline by a cheap per-frame Newton step (advance by the
along-track component of the offset from the current reference, re-read the
reference there), measured from whichever end the car entered at so it runs 0 to
length and nothing branches on direction; `dir` is +1 travelling from `(x1,y1)`
toward `(x2,y2)`.

The driver is deliberately nothing cleverer than a few old-fashioned control
loops, each with its constants rolled per driver (`makeDriver`) so the fleet has
personalities:

- **Steering** is one PID on cross-track error `e`, the signed feet between the
  car and its lane centreline. The derivative is taken analytically -- de/dt is
  exactly `speed * sin(heading error)` -- which doubles as heading damping and is
  what keeps the loop stable when e is small but the car points the wrong way.
  Path curvature is fed forward (`speed * curv` is exactly the turn rate that
  holds the arc), so the PID only ever corrects mistakes, and the integral term
  trims the residual pull of a long curve. Steering authority is the player's
  own: `MAX_TURN_RATE`, scaled away below 20 ft/s, and the command lands in
  `c.steer` so the front wheels visibly turn. Skill maps onto the loop's damping
  ratio (`zeta = 0.3 + skill`): the visibly drunk driver is an underdamped one,
  plus a slow Ornstein-Uhlenbeck wander in where they believe lane-centre is.
  Skill is skewed good, and anything longer than `HEAVY_LENGTH` gets a floor --
  whoever is driving the bus, it is not the drunk. A driver far out of their lane
  also slows down (the steering-to-speed crosstalk), which is both "having
  trouble on this curve" and what stops a drunk swerving at 50.
- **Speed** chases the minimum of everything the driver can see coming: their
  own cruise preference (triangular around 35mph, rare tails at 20 and 60,
  heavies capped at 45), comfortable lateral g on the arc they are riding, and
  planned slow-downs ahead. Approaches to a corner or a stop line brake on the
  *required* deceleration, `(vGoal^2 - v^2)/2d`, once it reaches comfort level
  -- chasing the sqrt speed profile through the proportional loop instead always
  lags it, and a corner entered 15 over is exited through the far hedge; braking
  on the requirement engages at exactly the right distance, holds ~`aComf` all
  the way down, and nobody halts 80ft short of anything. The command is finally
  clamped to the vehicle's own performance envelope (`curveAccel` and
  `brakeDecel`, vehicles/performance.js): analog feet, real engine and brakes,
  so traffic's Countach genuinely out-accelerates traffic's cement truck.
- **Following** is a PD loop on the gap to the car ahead (P on distance against
  `minGap + headway * speed`, D on closing speed), fed measurements a beat late:
  each driver has a reaction time and reads the gap as it was that long ago
  (a per-car ring of timestamped samples). The delay is where stop-and-go waves
  come from -- a queue moves off one driver at a time, not all at once. The
  player's car is sensed geometrically (it is on no street) and joins this loop
  as just another leader: traffic follows you, brakes behind you, queues behind
  you when you park in a lane.

Routes are decided early: `planExit` runs once on entering a street and picks
the exit (`pickExit`, still "any street but the one I came in on", U-turns only
at dead ends) *and* the exact corner to drive -- a fillet arc tangent to both
lane centrelines (`makeTurnPlan`). The arc is the whole trick of intersections:
asking the steering loop to jump straight from one street's lane to the next's
turns every right turn into a wide J-swing, because at the handoff the new
lane's nearest point is already past the node and the raw error points the
wrong way. On the arc the reference is the radial projection onto the circle,
tracked by the same PID with the same feedforward, so e stays small all the way
round; sharp corners get tight slow arcs (never under full-lock radius,
`R_MIN`), gentle ones fast sweeping arcs, lefts come out wider than rights and
cross the middle of the box with nothing choosing that, and a dead-end U-turn
is half a circle to the left that swings a whisker wide and gets reeled back
in. Deciding at entry is also what lets the speed loop ease off half a block
before the corner. Rolling past the arc's far end lands the car on its new
street (`switchStreet`), pos seeded by projection.

There is one stop line and one way of holding at it, and only the reason for
being there differs -- which is what keeps right of way from becoming a second
control loop. A signed approach (see `docs/signs.md`) always takes the
required-deceleration treatment down to a line just short of the box, dwells a
beat once stopped (`pause`), and then goes when the intersection is actually
theirs. An unsigned one -- the through street of a two-way, or an uncontrolled
crossing -- runs the same machinery but only holds if somebody is coming, which
is what makes yielding cost nothing on an empty road. Queues at a sign discharge
one reaction time apart, which is the waves mechanism again.

The line is where a car's *nose* stops, so how far back its centre keeps is its
own length (`stopDist`): a bus stopping where a hatchback does has its front axle
in the middle of the junction, and reads to everybody else as a vehicle standing
in the box. Past the line the driver is committed, and has to be -- a car
released into a box and re-blocked a moment later stops dead in the middle of it,
where no rule about who goes first can help, because the thing in the way is a
car that was in the right. The same reasoning is why the required deceleration is
capped rather than computed once the line is under the wheels: `-v^2/2d` has no
finite answer at d = 0, and the proportional loop alone only decays that last
foot of speed asymptotically, so the car creeps into the junction for ever.

## Whose turn it is

`boxClear(c)` is the whole of it, and it only ever *reads*. No reservations, no
queues, no state on the node -- nothing that has to be cleaned up when the radius
cull deletes a car mid-junction. It walks the cars at this node, drops everyone
whose path cannot cross this one, and of those left waits on whoever outranks it.

Whether two movements conflict is pure geometry, worth doing exactly rather than
with a table of cases. Number the arms 0-3 the way the slots already run (fwd,
right, back, left, each a quarter turn), and give each arm two points on a ring:
its entry lane at 2k, its exit lane at 2k+1 -- right-hand traffic is what orders
them, since a car coming in hugs the arm's clockwise side and one going out the
other. A movement from arm a to arm b is then exactly the chord (2a, 2b+1), and
two movements cross iff their chords cross, which is iff exactly one endpoint of
one lies on the arc between the other's. Eight lines, and every case falls out
without anyone writing it down: opposing straights clear each other, opposing
lefts pass left-to-left, a right turn ignores cross traffic from its right, a
left yields to the oncoming straight. Two movements ending on the same arm are a
merge into one lane -- a conflict too, and the one case the chords cannot see.

Precedence (`yieldsTo`) is antisymmetric by construction, so of any two cars
exactly one gives way: the road without the signs rules and never tests itself
against the road that has them; at a four-way the first to have *stopped* goes
first (`stoppedAt`); a left turn gives way to whatever is coming the other way
whoever got there first, because it is crossing their path rather than sharing
it; and in a dead heat, the car on the right. Two things sit above all of it,
being about space rather than precedence: never enter a box somebody is standing
in (whoever is in the wrong), and never enter one there is no room to leave --
without that second rule a queue simply extends through the junction and locks it
solid, every car in it genuinely in the right.

Two traps that cost a while to find, both worth not re-introducing. The arrival
comparison must measure both cars with the *same* formula: judge yourself by the
launch model (`myBoxWindow`, a real `v^2 = u^2 + 2ad` on your own engine, which
is why a loaded cement truck waits for a gap a Countach would not) and the other
fellow by a constant speed, and the two of you can each conclude the other got
there first -- which is not a slow junction but a frozen one. And a vehicle
longer than the box is not a point on a lane path while it is in there; it is a
wall across the junction, its tail sweeping ground no lane-to-lane chord accounts
for, so while one is in the box it conflicts with everybody.

Whatever the rules, patience ends it: held at a line too long (7-15s, per driver)
and the car creeps out anyway. That is realistic, and it bounds every bug in the
priority logic to a moment's oddity rather than a frozen junction. It is
load-bearing for exactly one case the rules cannot break on their own -- four
cars tied at a four-way, each giving way to the next one round. Three cannot form
that ring, because one of them has no car on their right.

The player is given no priority test at all, only geometry: anything closing on
the box, or sitting in it, is a reason to wait, whatever the signs say. Never
assume the player follows a rule. The two exceptions are both about not waiting
for someone who is not coming -- a player stopped short of the box, and one
following along behind on the same approach, which is the following loop's
business rather than this one's.

Cars still pass through each other when two do go at once; that is the accepted
failure mode, now rare rather than constant. Measured over 90s of a 400-street
city, overlapping cars in a junction fell by about 70% against the same city
before any of this (31/42/52 events on three seeds against 112/176/175), stop
compliance held at 99%, and cost went from about 2.0 to 2.2ms an update at ~180
cars. Routes are re-picked once on the way in (`REPLAN_DIST`), which is not
cosmetic: a block's traffic is created inside `pushStreet`, a line before the new
street is registered at its own far node, and that node grows its other arms
later still, so a route chosen at spawn can only be a U-turn -- a half circle
across the whole box, arriving at what is by then a four-way. That one fix was
worth more than half the overlap reduction.

The one conflict drivers react to outside a junction is the head-on: an oncoming
car on the same street more than a foot over the centreline (`centerOff`, kept
on every car for exactly this check), or the player pointed at them in their
lane. The response is a bias on where lane-centre *is* (`EVADE_BIAS`, so the
same steering loop handles dodge and recovery), emergency braking scaled by
time-to-collision, and a honk.

What comes next -- multi-lane roads, lane changing and merging, turn signals --
is planned in `trafficPlan.txt`, whose intersection half is what the above
implements.

Honks are the decorative hook, deliberately unpolished: any evasion, and any
braking near the vehicle's maximum, pushes `{x, y, t}` into `honks` (per-car
cooldown), and `drawHonks` -- called by `drawScene` after everything else --
draws rising, fading, slightly cockeyed red "HONK!" text in Comic Sans over the
spot. Expired honks are culled in `updateTraffic`, not the draw pass, so a page
that never draws doesn't accumulate them.

Cars are born mid-block already rolling, and never faster than the corner or
stop line already ahead of them can be comfortably braked for -- a car dropped
at cruise speed 20ft before a 90-degree turn cannot make it, and blows through
the intersection sideways trying. A car that ends up hopelessly far off the
road (80ft of cross-track, a lost drunk) or runs off the edge of the built map
is quietly forgotten.

Measured over 60 simulated seconds of a 400-street city: good drivers hold
lane to a mean 0.2ft on straights and curves and 0.4ft through corner arcs; the
worst hold about 1ft with excursions to 10; 0.07% of car-frames are off the
pavement entirely (the drunks, briefly); every stop-sign stop lands within
2.4ft of the line; no NaN ever reaches a pose. The whole update is ~1.3ms at
135 live cars, dominated by the O(n^2) sensing pass, which is fine at the
counts `TRAFFIC_RADIUS` allows.

Cars are seeded onto a block as it is built, from `pushStreet`, the same moment
and the same way its lots are -- but unlike the lots they do not stay: a block's
own cars have driven off it within the minute. The mix of body styles is
`generateRandomVehicle()`, so the odds of meeting a Countach out there are the
odds of having been given one to drive. Each direction is packed separately, since
two cars going opposite ways are in different lanes and cannot be in each other's
way; within a lane, sorting the random offsets and then pushing each car past the
ones before it by their own lengths plus a gap spaces them exactly, and the
tightest arrangement the shuffle can reach is still one clear gap.

Everything within `TRAFFIC_RADIUS` (1500ft) of the player is simulated whether it
is on screen or not, and everything past it is deleted outright -- which is what
lets you turn around and chase a car you saw, because it is still where it should
be rather than where it was. Spawning is gated on the same radius, since a car
built further away would be deleted on the very next update; driving never
rejects anything (a street is born a few feet from the car that triggered it),
but `growCity()` builds a whole city at once from wherever in it it likes.

Note what this does *not* have: nothing ever repopulates a block. Spawning is tied
to a street being created, deletion to a distance, so an area you sit in drains --
parked, a typical 38 cars falls to 14 in two minutes and 5 in five. Driving hides
it, because you are always meeting new streets.

Traffic joins the buildings' depth pass (`drawLots`) rather than getting one of
its own, so a car on the far side of a block goes behind that block's houses
instead of being painted over them; its position fields are named `cx, cy` for
exactly that reason, so both kinds of thing sort through the same line. The
player's car sorts through that same line too -- `drawScene` takes an optional
`player`, and `drawLots` pushes it into the same `visible` array as the traffic
and the lots, as a plain `{ vehicle, cx, cy, angle, steer }` -- so a house you
drive past, or another car crossing in front of you, hides it exactly as it would
hide anything else standing there. Traffic sets `steer` too now -- its PID's own
wheel angle -- so every car's front wheels turn (`drawGroundVehicle` still falls
back to 0 for anything that doesn't set it). Cars drop out at `HOUSES_MIN_ZOOM`, with the
houses: below that only the skyline is left, and there are no cars in a skyline.

Adding traffic changed what a given `?seed` builds. Spawning draws from
`Math.random()`, so the stream every later street reads has moved; the city is
still deterministic, just not the same city an old screenshot shows. Suppress
`spawnStreetTraffic` and the pixels match the pre-traffic build exactly.
