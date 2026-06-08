// Rover upgrades. The more missions you complete (across the whole game), the
// more parts your rover unlocks. Each upgrade both changes how the rover looks
// (a `part` shown by Rover.js) AND does something mechanical (`effect`), plus it
// teaches a real fact about how engineers design space rovers.
//
// `threshold` is the number of TOTAL completed missions needed to unlock it.
// Functional fields:
//   speedMult / turnMult - handling multipliers
//   pickupBonus          - extra metres of sample pickup radius
//   scanMult             - widens scan / drill range
//   climb                - drive up slopes without slowing down
//   heatResist           - slows the Sun heat gauge (0..1)
//   nightLights          - switches on the headlight spotlights

export const UPGRADES = [
  {
    id: 'lights',
    name: 'LED Headlights',
    threshold: 2,
    nightLights: true,
    effect: 'Lights up dark, airless worlds so you can see hazards at night.',
    fact: 'Real rovers carry lights and many cameras. Perseverance has 23 cameras to navigate, study rocks and avoid hazards.',
  },
  {
    id: 'solar',
    name: 'Solar Panels',
    threshold: 4,
    speedMult: 1.08,
    effect: 'Steady power gives a small, sustained speed boost.',
    fact: 'Many rovers run on solar panels. Dust settling on the panels slowly starves them of power \u2014 it ended the Opportunity rover\u2019s 15-year mission.',
  },
  {
    id: 'antenna',
    name: 'High-Gain Antenna',
    threshold: 6,
    scanMult: 1.6,
    effect: 'Widens your scan and drill range so objectives finish faster.',
    fact: 'A high-gain antenna lets a rover talk to Earth. Signals can take up to 24 minutes to reach Mars, so rovers must drive semi-autonomously.',
  },
  {
    id: 'bigwheels',
    name: 'All-Terrain Wheels',
    threshold: 9,
    speedMult: 1.05,
    turnMult: 1.25,
    climb: true,
    effect: 'Grip lets you climb steep terrain without slowing down.',
    fact: 'Rover wheels are made of aluminium with cleats called "grousers" for grip. Sharp rocks once tore holes in Curiosity\u2019s wheels.',
  },
  {
    id: 'drill',
    name: 'Sample Drill',
    threshold: 12,
    pickupBonus: 1.1,
    effect: 'A reach arm grabs samples from further away.',
    fact: 'A robotic drill lets a rover collect rock cores from below the dusty surface, where ancient chemistry is better preserved.',
  },
  {
    id: 'rtg',
    name: 'Nuclear Battery (RTG)',
    threshold: 16,
    speedMult: 1.12,
    heatResist: 0.35,
    effect: 'All-weather power; also helps shed heat near the Sun.',
    fact: 'Far from the Sun, rovers use an RTG \u2014 a nuclear battery powered by the heat of decaying plutonium \u2014 so they never depend on sunlight.',
  },
  {
    id: 'armor',
    name: 'Thermal Shielding',
    threshold: 20,
    heatResist: 0.4,
    effect: 'Gold insulation slows how fast your heat gauge fills.',
    fact: 'Spacecraft wrap themselves in gold-coloured insulation blankets to survive temperatures that swing by hundreds of degrees.',
  },
  {
    id: 'turbo',
    name: 'Turbo Motors',
    threshold: 25,
    speedMult: 1.2,
    turnMult: 1.1,
    effect: 'A real top-speed boost for crossing big worlds quickly.',
    fact: 'Real rovers are slow \u2014 Curiosity\u2019s top speed is about 0.14 km/h \u2014 because driving carefully avoids costly, unfixable crashes.',
  },
];

// Returns the list of upgrade objects unlocked at a given completed-mission count.
export function getUnlockedUpgrades(completedCount) {
  return UPGRADES.filter((u) => completedCount >= u.threshold);
}

// Returns any upgrades that become newly unlocked when going from `before` to
// `after` total completed missions.
export function newlyUnlocked(before, after) {
  return UPGRADES.filter((u) => before < u.threshold && after >= u.threshold);
}

// Combine all unlocked upgrades into handling multipliers for the rover.
export function aggregateStats(completedCount) {
  let speedMult = 1;
  let turnMult = 1;
  for (const u of getUnlockedUpgrades(completedCount)) {
    speedMult *= u.speedMult || 1;
    turnMult *= u.turnMult || 1;
  }
  return { speedMult, turnMult };
}

// Combine the functional (non-handling) effects of all unlocked upgrades.
export function aggregateEffects(completedCount) {
  const eff = { pickupBonus: 0, scanMult: 1, climb: false, heatResist: 0, nightLights: false };
  for (const u of getUnlockedUpgrades(completedCount)) {
    eff.pickupBonus += u.pickupBonus || 0;
    eff.scanMult *= u.scanMult || 1;
    eff.climb = eff.climb || !!u.climb;
    eff.heatResist = Math.min(0.85, eff.heatResist + (u.heatResist || 0));
    eff.nightLights = eff.nightLights || !!u.nightLights;
  }
  return eff;
}
