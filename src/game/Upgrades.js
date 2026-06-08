// Rover upgrades. The more missions you complete (across the whole game), the
// more parts your rover unlocks. Each upgrade both changes how the rover looks
// (a `part` added by Rover.js) and teaches a real fact about how engineers
// design space rovers. Some also tweak handling stats.
//
// `threshold` is the number of TOTAL completed missions needed to unlock it.

export const UPGRADES = [
  {
    id: 'lights',
    name: 'LED Headlights',
    threshold: 2,
    speedMult: 1.0,
    turnMult: 1.0,
    fact: 'Real rovers carry lights and many cameras. Perseverance has 23 cameras to navigate, study rocks and avoid hazards.',
  },
  {
    id: 'solar',
    name: 'Solar Panels',
    threshold: 4,
    speedMult: 1.08,
    turnMult: 1.0,
    fact: 'Many rovers run on solar panels. Dust settling on the panels slowly starves them of power — it ended the Opportunity rover\u2019s 15-year mission.',
  },
  {
    id: 'antenna',
    name: 'High-Gain Antenna',
    threshold: 6,
    speedMult: 1.0,
    turnMult: 1.0,
    fact: 'A high-gain antenna lets a rover talk to Earth. Signals can take up to 24 minutes to reach Mars, so rovers must drive semi-autonomously.',
  },
  {
    id: 'bigwheels',
    name: 'All-Terrain Wheels',
    threshold: 9,
    speedMult: 1.05,
    turnMult: 1.25,
    fact: 'Rover wheels are made of aluminium with cleats called "grousers" for grip. Sharp rocks once tore holes in Curiosity\u2019s wheels.',
  },
  {
    id: 'drill',
    name: 'Sample Drill',
    threshold: 12,
    speedMult: 1.0,
    turnMult: 1.0,
    fact: 'A robotic drill lets a rover collect rock cores from below the dusty surface, where ancient chemistry is better preserved.',
  },
  {
    id: 'rtg',
    name: 'Nuclear Battery (RTG)',
    threshold: 16,
    speedMult: 1.12,
    turnMult: 1.0,
    fact: 'Far from the Sun, rovers use an RTG — a nuclear battery powered by the heat of decaying plutonium — so they never depend on sunlight.',
  },
  {
    id: 'armor',
    name: 'Thermal Shielding',
    threshold: 20,
    speedMult: 1.0,
    turnMult: 1.0,
    fact: 'Spacecraft wrap themselves in gold-coloured insulation blankets to survive temperatures that swing by hundreds of degrees.',
  },
  {
    id: 'turbo',
    name: 'Turbo Motors',
    threshold: 25,
    speedMult: 1.2,
    turnMult: 1.1,
    fact: 'Real rovers are slow — Curiosity\u2019s top speed is about 0.14 km/h — because driving carefully avoids costly, unfixable crashes.',
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
    speedMult *= u.speedMult;
    turnMult *= u.turnMult;
  }
  return { speedMult, turnMult };
}
