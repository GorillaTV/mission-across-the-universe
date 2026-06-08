import * as THREE from 'three';
import { PLANETS } from './game/planets.js';
import { World } from './game/World.js';
import { Rover } from './game/Rover.js';
import { CollectibleField } from './game/Collectible.js';
import { MissionSystem } from './game/MissionSystem.js';
import { Tracks } from './game/Tracks.js';
import { Hud } from './game/Hud.js';
import { runRoverBuilder } from './game/RoverBuilder.js';
import { travel } from './game/TravelSequence.js';
import { SoundManager } from './game/SoundManager.js';
import { getUnlockedUpgrades, newlyUnlocked, aggregateStats, aggregateEffects } from './game/Upgrades.js';

// ---- Renderer / scene / camera ----
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Input ----
const keys = { forward: false, back: false, left: false, right: false };
const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};
addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyP' && state.phase === 'playing') { takePhotoAction(); e.preventDefault(); }
});
addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = false; e.preventDefault(); }
});
const noKeys = { forward: false, back: false, left: false, right: false };

// ---- Game objects ----
const world = new World(scene);
// Use the GPU's best anisotropic filtering so the surface texture keeps detail
// into the distance instead of washing out to flat grey.
world.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
const rover = new Rover(scene);
const field = new CollectibleField(scene);
const missions = new MissionSystem(scene, field);
const tracks = new Tracks(scene);
const hud = new Hud(document.getElementById('hud'), {
  onColorChange: (hex) => rover.setColor(hex),
  onDrive: (dir, on) => { keys[dir] = on; },
  onTakePhoto: () => takePhotoAction(),
  onSendPhotos: (photos) => sendPhotos(photos),
  onToggleSound: () => {
    const muted = sound.toggleMuted();
    hud.setSoundMuted(muted);
    return muted;
  },
  onToggleGoogly: () => {
    const on = rover.setGoogly(!rover.googly);
    hud.setGoogly(on);
    return on;
  },
});

// ---- Audio (real NASA "Sounds from Beyond" recordings) ----
const sound = new SoundManager();
hud.setSoundMuted(sound.muted);
// Browsers only allow audio after a user gesture; unlock on the first one.
const unlockAudio = () => sound.unlock();
addEventListener('pointerdown', unlockAudio, { once: true });
addEventListener('keydown', unlockAudio, { once: true });
addEventListener('touchstart', unlockAudio, { once: true, passive: true });

// ---- Photo capture (rover camera) ----
const thumbCanvas = document.createElement('canvas');
thumbCanvas.width = 220;
thumbCanvas.height = 138;
const thumbCtx = thumbCanvas.getContext('2d');

function capturePhoto() {
  try {
    thumbCtx.drawImage(renderer.domElement, 0, 0, thumbCanvas.width, thumbCanvas.height);
    return thumbCanvas.toDataURL('image/jpeg', 0.55);
  } catch (e) {
    return null;
  }
}

const GENERIC_NOTES = [
  'Regolith and scattered boulders.',
  'Surface panorama toward the horizon.',
  'Close-up of the rocky terrain.',
  'Dusty plains under an alien sky.',
];
let genericNoteIdx = 0;

function takePhotoAction() {
  if (state.phase !== 'playing') return;
  const thumb = capturePhoto();
  // If the rover is lined up with a photo objective this completes it and
  // returns the mission def so the snapshot gets the real subject + science.
  const def = missions.takePhoto();
  const planet = PLANETS[state.planetIndex];
  let caption, note;
  if (def) {
    caption = def.subject || def.label;
    note = def.science || def.brief || '';
  } else {
    caption = `${planet.name} surface`;
    note = GENERIC_NOTES[genericNoteIdx % GENERIC_NOTES.length];
    genericNoteIdx += 1;
  }
  hud.addPhoto({ thumb, caption, note });
  hud.cameraFlash();
  sound.playLaser();
}

function sendPhotos(photos) {
  if (!photos || !photos.length) return;
  const subjects = [...new Set(photos.map((p) => p.caption))];
  hud.toast(
    '📡 Transmitted to Mission Control',
    `${photos.length} image${photos.length > 1 ? 's' : ''} received: ${subjects.join(', ')}. Excellent survey work, rover!`,
    'fact'
  );
  hud.clearPhotos();
}

// ---- Game state ----
const state = {
  phase: 'builder', // builder | intro | playing | transition
  planetIndex: 0,
  completedMissions: 0,
  heat: 0,
  heatResist: 0,
  frozenUntil: 0,
};

function applyUpgrades() {
  const ids = getUnlockedUpgrades(state.completedMissions).map((u) => u.id);
  rover.applyUpgrades(ids);
  const { speedMult, turnMult } = aggregateStats(state.completedMissions);
  rover.setStatMultipliers(speedMult, turnMult);

  // Functional upgrade effects.
  const eff = aggregateEffects(state.completedMissions);
  field.pickupRadius = 2.4 + eff.pickupBonus;
  missions.setEffects({ scanMult: eff.scanMult });
  state.heatResist = eff.heatResist;

  hud.setUpgrades(state.completedMissions);
}

function onMissionComplete(def) {
  const before = state.completedMissions;
  state.completedMissions += 1;
  const after = state.completedMissions;

  hud.toast('🛰️ Mission complete!', def.science || def.fact, 'fact');
  sound.chime();

  const unlocked = newlyUnlocked(before, after);
  applyUpgrades();
  for (const u of unlocked) hud.showUpgrade(u);
}

async function startPlanet(index, skipIntro = false) {
  state.phase = 'transition';
  hud.showPhotoControls(false);
  hud.clearPhotos();
  const planet = PLANETS[index];
  await world.load(planet);

  // Hook the freshly built terrain into everything that sits on the ground.
  rover.setTerrain(world.terrain);
  rover.setColliders(world.getColliders());
  field.setTerrain(world.terrain);
  field.setColliders(world.getColliders());
  missions.setTerrain(world.terrain);
  tracks.setTerrain(world.terrain);
  tracks.reset();

  // Reset rover to centre (on the terrain surface).
  rover.reset(new THREE.Vector3(0, 0, 0), 0);
  snapCamera();

  state.heat = 0;
  hud.showHeat(planet.special === 'heat');
  hud.setHeat(0);

  applyUpgrades();

  missions.start(planet, {
    onUpdate: (snap) => hud.renderMissions(snap),
    onComplete: (def) => onMissionComplete(def),
    onAllComplete: () => onPlanetCleared(),
  });

  // Heat mechanic: collecting samples cools the rover down.
  if (planet.special === 'heat') {
    const orig = field.onPickup;
    field.onPickup = (item) => {
      state.heat = Math.max(0, state.heat - 0.14);
      orig(item);
    };
  }

  hud.setTopBar(planet, index, PLANETS.length, rover.name);

  // Switch the ambient bed to this world's real NASA recording and surface a
  // one-time credit so players know what they're hearing.
  const credit = sound.setPlanet(planet);
  if (credit) hud.toast('Now playing', credit, 'fact');

  await hud.showIntro(planet, index, PLANETS.length, skipIntro);
  state.phase = 'playing';
  hud.showPhotoControls(true);
}

let clearing = false;
async function onPlanetCleared() {
  if (clearing) return;
  clearing = true;
  state.phase = 'transition';
  hud.showHeat(false);
  hud.showPhotoControls(false);
  const planet = PLANETS[state.planetIndex];
  const isLast = state.planetIndex >= PLANETS.length - 1;
  const nextName = isLast ? null : PLANETS[state.planetIndex + 1].name;

  await hud.showCleared(planet, nextName);

  if (isLast) {
    sound.fanfare();
    await hud.showWin(state.completedMissions, PLANETS.length);
    location.reload();
    return;
  }

  sound.duckAmbient();
  sound.whoosh();
  await travel(planet.name, nextName);
  state.planetIndex += 1;
  clearing = false;
  await startPlanet(state.planetIndex);
}

// ---- Camera follow ----
const camOffset = { dist: 9.5, height: 5.2 };
const desiredCam = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function computeDesiredCam() {
  const fwd = rover.forwardVector();
  desiredCam.set(
    rover.position.x - fwd.x * camOffset.dist,
    rover.position.y + camOffset.height,
    rover.position.z - fwd.z * camOffset.dist
  );
  lookTarget.set(rover.position.x, rover.position.y + 1, rover.position.z);
}

function snapCamera() {
  computeDesiredCam();
  camera.position.copy(desiredCam);
  camera.lookAt(lookTarget);
}

// ---- Heat update for the Sun ----
function updateHeat(dt) {
  const planet = PLANETS[state.planetIndex];
  if (planet.special !== 'heat') return;
  state.heat = Math.min(1, state.heat + dt * 0.05 * (1 - state.heatResist));
  hud.setHeat(state.heat);
  if (state.heat >= 1 && performance.now() > state.frozenUntil) {
    state.frozenUntil = performance.now() + 1500;
    state.heat = 0.5;
    hud.toast('🔥 Overheated!', 'Your rover paused to cool its systems. Keep collecting plasma to stay cool!', 'fact');
  }
}

// ---- Mini-map (throttled) ----
let miniAccum = 0;
function updateMinimap(dt) {
  miniAccum += dt;
  if (miniAccum < 0.08) return;
  miniAccum = 0;
  hud.updateMinimap({
    x: rover.position.x,
    z: rover.position.z,
    yaw: rover.yaw,
    bounds: 70,
    items: field.items,
    markers: missions.markerInfo(),
  });
}

// ---- Main loop ----
let last = performance.now();
const clock = { t: 0 };
function loop() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock.t += dt;

  if (state.phase === 'playing') {
    const frozen = now < state.frozenUntil;
    rover.update(dt, frozen ? noKeys : keys);
    tracks.update(rover.position, rover.forwardVector());
    const collected = field.update(dt, rover.position, clock.t);
    if (collected) sound.collect();
    missions.update(dt, rover.position, rover.forwardVector());
    hud.updatePhotoHint(missions.activePhotoState());
    updateHeat(dt);
    updateMinimap(dt);
    const moving = !frozen && (keys.forward || keys.back || keys.left || keys.right);
    sound.setDriving(moving);
  } else {
    rover.update(dt, noKeys);
    sound.setDriving(false);
  }

  world.update(dt);
  computeDesiredCam();
  camera.position.lerp(desiredCam, 1 - Math.pow(0.001, dt));
  camera.lookAt(lookTarget);

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ---- Boot ----
async function boot() {
  const config = await runRoverBuilder();
  // The Launch click is a user gesture, so this is our chance to unlock audio.
  sound.unlock();
  rover.configure(config);
  hud.setGoogly(rover.googly);
  applyUpgrades();
  loop();
  await startPlanet(0);
}

boot();
