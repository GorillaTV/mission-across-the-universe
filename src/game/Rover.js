import * as THREE from 'three';

// ---------------------------------------------------------------------------
// The rover.
//
// Three starter chassis modelled on real NASA hardware:
//   * perseverance - car-sized rocker-bogie six-wheeler with a camera mast,
//     robotic arm stub and gold thermal blankets (Perseverance / Curiosity).
//   * sojourner     - tiny microrover with a flat solar deck and six little
//     spoked wheels (Mars Pathfinder's Sojourner, 1997).
//   * lrv           - the open Apollo Lunar Roving Vehicle: bucket seats, four
//     wide mesh wheels and a big high-gain dish up front.
//
// Shared materials/geometries are reused to keep draw calls down. The chassis
// colour is the player's pick; aluminium, gold-Kapton and black accents are
// fixed for realism. Upgrade parts (solar, antenna, drill, RTG, armour, turbo)
// are attached but hidden until unlocked.
//
// On a planet the rover follows the terrain height and tilts to the slope
// (smoothed + clamped), and real headlight spotlights switch on with the
// lights upgrade.
// ---------------------------------------------------------------------------

const SHAPES = {
  perseverance: {
    body: [1.5, 0.5, 2.3], wheels: 6, wheelR: 0.42, build: 'rocker',
    desc: 'Car-sized rocker-bogie science rover (Perseverance / Curiosity).',
  },
  sojourner: {
    body: [0.95, 0.32, 1.25], wheels: 6, wheelR: 0.26, build: 'micro',
    desc: 'Tiny solar microrover, light and nimble (Mars Pathfinder).',
  },
  lrv: {
    body: [1.7, 0.4, 2.5], wheels: 4, wheelR: 0.5, build: 'buggy',
    desc: 'Open Apollo Moon buggy with a big dish (Lunar Roving Vehicle).',
  },
};

export const ROVER_SHAPES = [
  { id: 'perseverance', name: 'Perseverance', desc: SHAPES.perseverance.desc },
  { id: 'sojourner', name: 'Sojourner', desc: SHAPES.sojourner.desc },
  { id: 'lrv', name: 'Apollo LRV', desc: SHAPES.lrv.desc },
];

// Shared accent materials.
const ALU = () => new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 0.85, roughness: 0.35 });
const DARK = () => new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.5, roughness: 0.5 });
const GOLD = () => new THREE.MeshStandardMaterial({ color: 0xffce5a, metalness: 0.9, roughness: 0.3, emissive: 0x3a2600, emissiveIntensity: 0.4 });
const GLASS = () => new THREE.MeshStandardMaterial({ color: 0x9fe6ff, metalness: 0.2, roughness: 0.1, emissive: 0x123244 });

export class Rover {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.position = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;

    this.baseMaxSpeed = 11;
    this.baseAccel = 18;
    this.baseTurn = 2.2;
    this.speedMult = 1;
    this.turnMult = 1;

    this.terrain = null;
    this.climb = false; // better slope handling (all-terrain wheels)
    this._normal = new THREE.Vector3(0, 1, 0);
    this._tmpQuat = new THREE.Quaternion();
    this._tmpMat = new THREE.Matrix4();

    this.wheels = [];
    this.parts = {};
    this.shape = 'perseverance';
    this.color = 0xffce3a;
    this.googly = localStorage.getItem('mau-googly') === '1';
    this.eyes = null;
    this._pupils = null;
    this._prevSpeed = 0;
    this._built = false;
  }

  setTerrain(terrain) {
    this.terrain = terrain;
    this._normal.set(0, 1, 0);
  }

  configure({ shape = 'perseverance', name = 'Rover', color = 0xffce3a }) {
    this.shape = SHAPES[shape] ? shape : 'perseverance';
    this.name = name;
    this.color = color;
    this._build();
  }

  _build() {
    this.group.clear();
    this.wheels = [];
    this.parts = {};

    const spec = SHAPES[this.shape];
    this.bodyMat = new THREE.MeshStandardMaterial({ color: this.color, metalness: 0.45, roughness: 0.5 });

    if (spec.build === 'rocker') this._buildPerseverance(spec);
    else if (spec.build === 'micro') this._buildSojourner(spec);
    else this._buildLRV(spec);

    this.wheelBaseR = spec.wheelR;
    this._buildHeadlights(spec);
    this._buildParts(spec);
    this.eyes = null;
    this._pupils = null;
    if (this.googly) this._buildGooglyEyes(spec);
    this._built = true;
    this.applyUpgrades([]);
  }

  // --- One aluminium wheel with grouser cleats, returns a Group ---
  _wheel(r, width = 0.3, spokes = false) {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 18), DARK());
    tire.rotation.z = Math.PI / 2;
    g.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, width + 0.04, 12), ALU());
    hub.rotation.z = Math.PI / 2;
    g.add(hub);
    // grousers / cleats around the rim
    const cleats = 8;
    const cleatMat = ALU();
    for (let i = 0; i < cleats; i++) {
      const a = (i / cleats) * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, 0.05, r * 0.5), cleatMat);
      c.position.set(0, Math.sin(a) * r * 0.85, Math.cos(a) * r * 0.85);
      c.rotation.x = a;
      g.add(c);
    }
    if (spokes) {
      const spokeMat = ALU();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, r * 1.7, 6), spokeMat);
        s.rotation.z = Math.PI / 2;
        s.rotation.x = a;
        g.add(s);
      }
    }
    g.userData.tire = tire;
    return g;
  }

  _placeWheels(spec, rows, xOff, opts = {}) {
    for (const z of rows) {
      for (const sx of [-1, 1]) {
        const w = this._wheel(spec.wheelR, opts.width || 0.3, opts.spokes);
        w.position.set(sx * xOff, spec.wheelR, z);
        this.group.add(w);
        this.wheels.push(w);
      }
    }
  }

  _buildPerseverance(spec) {
    const [bw, bh, bl] = spec.body;
    const baseY = spec.wheelR + 0.18;
    // Warm-electronics box (WEB) chassis, slightly tapered top deck.
    const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bl), this.bodyMat);
    body.position.y = baseY + bh / 2;
    body.castShadow = true;
    this.group.add(body);
    this.body = body;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.85, bh * 0.4, bl * 0.7), GOLD());
    deck.position.set(0, body.position.y + bh * 0.45, -bl * 0.05);
    this.group.add(deck);

    // Rocker-bogie suspension arms down each side.
    const armMat = ALU();
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, bl * 1.05), armMat);
      arm.position.set(sx * (bw / 2 + 0.04), spec.wheelR + 0.12, 0);
      this.group.add(arm);
      const bog = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, bl * 0.45), armMat);
      bog.position.set(sx * (bw / 2 + 0.04), spec.wheelR + 0.02, bl * 0.22);
      bog.rotation.x = 0.5;
      this.group.add(bog);
    }
    this._placeWheels(spec, [bl * 0.36, 0, -bl * 0.36], bw / 2 + 0.12);

    // Camera mast with two stereo "eyes" (Mastcam-Z).
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 10), ALU());
    mast.position.set(-bw * 0.28, body.position.y + bh * 0.4 + 0.45, bl * 0.32);
    this.group.add(mast);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.16), DARK());
    head.position.set(-bw * 0.28, mast.position.y + 0.5, bl * 0.32);
    this.group.add(head);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12), GLASS());
      eye.rotation.x = Math.PI / 2;
      eye.position.set(-bw * 0.28 + sx * 0.16, head.position.y, bl * 0.32 + 0.09);
      this.group.add(eye);
    }
    this.mast = mast;
  }

  _buildSojourner(spec) {
    const [bw, bh, bl] = spec.body;
    const baseY = spec.wheelR + 0.04;
    const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bl), this.bodyMat);
    body.position.y = baseY + bh / 2;
    body.castShadow = true;
    this.group.add(body);
    this.body = body;
    // Flat solar panel covering the whole top (its signature look).
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(bw * 1.05, 0.04, bl * 1.02),
      new THREE.MeshStandardMaterial({ color: 0x16357a, metalness: 0.5, roughness: 0.3, emissive: 0x0a1a44 })
    );
    panel.position.set(0, body.position.y + bh / 2 + 0.03, 0);
    this.group.add(panel);
    this.solarDeck = panel;
    // Six small spoked wheels.
    this._placeWheels(spec, [bl * 0.34, 0, -bl * 0.34], bw / 2 + 0.04, { width: 0.18, spokes: true });
  }

  _buildLRV(spec) {
    const [bw, bh, bl] = spec.body;
    const baseY = spec.wheelR + 0.1;
    // Open floor pan.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.08, bl), this.bodyMat);
    floor.position.y = baseY;
    floor.castShadow = true;
    this.group.add(floor);
    this.body = floor;
    // Two bucket seats.
    const seatMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.7 });
    for (const sx of [-1, 1]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.4, 0.06, 0.5), seatMat);
      seat.position.set(sx * bw * 0.24, baseY + 0.28, -bl * 0.1);
      this.group.add(seat);
      const backrest = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.4, 0.5, 0.06), seatMat);
      backrest.position.set(sx * bw * 0.24, baseY + 0.5, -bl * 0.32);
      this.group.add(backrest);
    }
    // Big high-gain dish on a mast up front (LRV's umbrella antenna).
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), ALU());
    pole.position.set(0, baseY + 0.5, bl * 0.42);
    this.group.add(pole);
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.2),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide })
    );
    dish.position.set(0, baseY + 0.95, bl * 0.42);
    dish.rotation.x = -Math.PI * 0.25;
    this.group.add(dish);
    // Four wide chevron-tread wheels.
    this._placeWheels(spec, [bl * 0.34, -bl * 0.34], bw / 2 + 0.12, { width: 0.42 });
  }

  _buildHeadlights(spec) {
    const [bw, bh, bl] = spec.body;
    const y = spec.wheelR + bh * 0.7;
    this.headlights = new THREE.Group();
    for (const sx of [-1, 1]) {
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6cc, emissiveIntensity: 1.6 })
      );
      housing.rotation.x = Math.PI / 2;
      housing.position.set(sx * bw * 0.3, y, bl / 2 + 0.04);
      this.headlights.add(housing);

      const spot = new THREE.SpotLight(0xfff3d0, 0, 26, Math.PI / 6, 0.4, 1.2);
      spot.position.set(sx * bw * 0.3, y, bl / 2);
      spot.target.position.set(sx * bw * 0.3, -2, bl / 2 + 12);
      this.headlights.add(spot);
      this.headlights.add(spot.target);
      spot.userData.isSpot = true;
    }
    this.group.add(this.headlights);
  }

  // Upgrade attachments (hidden until unlocked). Improved, readable versions.
  _buildParts(spec) {
    const [bw, bh, bl] = spec.body;
    const body = this.body;
    const topY = (body.position.y || spec.wheelR) + bh / 2;

    // Solar panels (deploying wings).
    const solar = new THREE.Group();
    const solarMat = new THREE.MeshStandardMaterial({ color: 0x16357a, metalness: 0.5, roughness: 0.3, emissive: 0x0a1840 });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.8, 0.04, bl * 0.8), solarMat);
      p.position.set(sx * bw * 0.75, topY + bh * 0.5, 0);
      p.rotation.z = sx * 0.14;
      solar.add(p);
    }
    this.parts.solar = solar;

    // High-gain antenna dish.
    const antenna = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), ALU());
    pole.position.set(bw * 0.32, topY + 0.35, -bl * 0.3);
    antenna.add(pole);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), ALU());
    dish.position.set(bw * 0.32, topY + 0.72, -bl * 0.3);
    dish.rotation.x = Math.PI * 0.85;
    antenna.add(dish);
    this.parts.antenna = antenna;

    // Robotic sample arm with drill bit.
    const drill = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.9), ALU());
    arm.position.set(bw * 0.28, topY - bh * 0.3, bl / 2 + 0.32);
    drill.add(arm);
    const bit = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 12), DARK());
    bit.position.set(bw * 0.28, topY - bh * 0.3 - 0.26, bl / 2 + 0.66);
    bit.rotation.x = Math.PI;
    drill.add(bit);
    drill.userData.bit = bit;
    this.parts.drill = drill;

    // RTG finned cylinder at the back.
    const rtg = new THREE.Group();
    const rtgMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.7, roughness: 0.5, emissive: 0x331100, emissiveIntensity: 0.5 });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.6, 12), rtgMat);
    cyl.rotation.x = Math.PI / 2;
    cyl.position.set(0, topY + 0.05, -bl / 2 - 0.28);
    rtg.add(cyl);
    for (let i = 0; i < 6; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.6), rtgMat);
      fin.position.copy(cyl.position);
      fin.rotation.z = (i / 6) * Math.PI;
      rtg.add(fin);
    }
    this.parts.rtg = rtg;

    // Gold thermal shielding wrap.
    const armor = new THREE.Mesh(
      new THREE.BoxGeometry(bw * 1.08, bh * 1.15, bl * 1.05),
      new THREE.MeshStandardMaterial({ color: 0xffcf4a, metalness: 0.9, roughness: 0.35, emissive: 0x4a3300, transparent: true, opacity: 0.5 })
    );
    armor.position.copy(body.position);
    this.parts.armor = armor;

    // Turbo motor exhausts.
    const turbo = new THREE.Group();
    const exMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x33aaff, emissiveIntensity: 1.8 });
    for (const sx of [-1, 1]) {
      const ex = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 12), exMat);
      ex.rotation.x = -Math.PI / 2;
      ex.position.set(sx * bw * 0.3, topY - bh * 0.1, -bl / 2 - 0.2);
      turbo.add(ex);
    }
    this.parts.turbo = turbo;

    for (const key of Object.keys(this.parts)) {
      this.parts[key].visible = false;
      this.group.add(this.parts[key]);
    }
  }

  setColor(hex) {
    this.color = hex;
    if (this.bodyMat) this.bodyMat.color.setHex(hex);
  }

  // --- Optional googly eyes: white domes with loose pupils that jiggle. ---
  _buildGooglyEyes(spec) {
    const [bw, , bl] = spec.body;
    const by = this.body ? this.body.position.y : spec.wheelR + 0.4;
    // Per-chassis placement: radius, vertical pos, front Z and centre offset.
    const cfg = {
      perseverance: { R: 0.22, y: by + 0.2, z: bl / 2 + 0.02, sep: 0.3 },
      sojourner: { R: 0.16, y: by + 0.04, z: bl / 2 + 0.05, sep: 0.22 },
      lrv: { R: 0.2, y: by + 0.52, z: bl * 0.34, sep: 0.42 },
    }[this.shape] || { R: 0.2, y: by + 0.2, z: bl / 2, sep: 0.3 };

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2, metalness: 0.1 });

    const eyes = new THREE.Group();
    this._pupils = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * cfg.sep, cfg.y, cfg.z);

      const sclera = new THREE.Mesh(new THREE.SphereGeometry(cfg.R, 20, 16), whiteMat);
      sclera.castShadow = true;
      eye.add(sclera);

      const frontZ = cfg.R * 0.62;
      const maxOff = cfg.R * 0.42;
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(cfg.R * 0.5, 16, 12), blackMat);
      pupil.position.set(0, -maxOff * 0.65, frontZ);
      eye.add(pupil);

      eye.userData = {
        pupil, frontZ, maxOff,
        pos: new THREE.Vector2(0, -maxOff * 0.65),
        vel: new THREE.Vector2(0, 0),
      };
      eyes.add(eye);
      this._pupils.push(eye);
    }
    this.group.add(eyes);
    this.eyes = eyes;
  }

  _disposeEyes() {
    if (!this.eyes) return;
    this.eyes.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.group.remove(this.eyes);
    this.eyes = null;
    this._pupils = null;
  }

  setGoogly(on) {
    this.googly = !!on;
    localStorage.setItem('mau-googly', this.googly ? '1' : '0');
    if (!this._built) return this.googly;
    if (this.googly && !this.eyes) this._buildGooglyEyes(SHAPES[this.shape]);
    else if (!this.googly && this.eyes) this._disposeEyes();
    return this.googly;
  }

  _animateGoogly(dt, turnInput) {
    if (!this._pupils) return;
    const accel = (this.speed - this._prevSpeed) / Math.max(dt, 0.0001);
    this._prevSpeed = this.speed;
    const stiffness = 60;
    const damping = Math.pow(0.0025, dt);
    for (const eye of this._pupils) {
      const ud = eye.userData;
      const m = ud.maxOff;
      // Pupils hang low (gravity), swing sideways on turns, bounce on accel.
      const tx = THREE.MathUtils.clamp(-turnInput * 0.7, -1, 1) * m * 0.8;
      const ty = -m * 0.65 + THREE.MathUtils.clamp(-accel * 0.03, -m * 0.6, m * 0.6);
      ud.vel.x += (tx - ud.pos.x) * stiffness * dt;
      ud.vel.y += (ty - ud.pos.y) * stiffness * dt;
      ud.vel.multiplyScalar(damping);
      ud.pos.x += ud.vel.x * dt;
      ud.pos.y += ud.vel.y * dt;
      const len = Math.hypot(ud.pos.x, ud.pos.y);
      if (len > m) ud.pos.multiplyScalar(m / len);
      ud.pupil.position.set(ud.pos.x, ud.pos.y, ud.frontZ);
    }
  }

  applyUpgrades(unlockedIds) {
    const set = new Set(unlockedIds);
    for (const key of Object.keys(this.parts)) {
      this.parts[key].visible = set.has(key);
    }
    // bigwheels scales wheels for a chunkier all-terrain look.
    const big = set.has('bigwheels');
    const scale = big ? 1.35 : 1;
    for (const w of this.wheels) w.scale.set(scale, scale, scale);
    this.climb = big;

    // Headlights glow + cast light once the lights upgrade is on.
    const lit = set.has('lights');
    this._lightsOn = lit;
    if (this.headlights) {
      for (const c of this.headlights.children) {
        if (c.userData.isSpot) c.intensity = lit ? 2.4 : 0;
        else if (c.material) c.material.emissiveIntensity = lit ? 1.8 : 0.15;
      }
    }
  }

  setStatMultipliers(speedMult, turnMult) {
    this.speedMult = speedMult;
    this.turnMult = turnMult;
  }

  reset(position = new THREE.Vector3(0, 0, 0), yaw = 0) {
    this.position.copy(position);
    if (this.terrain) this.position.y = this.terrain.heightAt(position.x, position.z);
    this.yaw = yaw;
    this.speed = 0;
    this._normal.set(0, 1, 0);
    this._sync(0.016, true);
  }

  get maxSpeed() {
    return this.baseMaxSpeed * this.speedMult;
  }

  setColliders(list) {
    this.colliders = list || [];
  }

  update(dt, keys, bounds = 70) {
    const drive = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
    if (drive !== 0) this.speed += drive * this.baseAccel * dt;
    else {
      this.speed -= this.speed * Math.min(1, dt * 2.5);
      if (Math.abs(this.speed) < 0.02) this.speed = 0;
    }
    const max = this.maxSpeed;
    this.speed = Math.max(-max * 0.5, Math.min(max, this.speed));

    const turnInput = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    const moveFactor = 0.35 + 0.65 * Math.min(1, Math.abs(this.speed) / Math.max(1, max));
    this.yaw += turnInput * this.baseTurn * this.turnMult * moveFactor * dt;

    // Slope slows you down unless you have all-terrain wheels.
    let slopeFactor = 1;
    if (this.terrain) {
      const grade = 1 - this._normal.y; // 0 flat .. ~0.3 steep
      const penalty = this.climb ? grade * 0.6 : grade * 1.6;
      slopeFactor = Math.max(0.35, 1 - penalty);
    }

    const dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.position.addScaledVector(dir, this.speed * slopeFactor * dt);

    const r = Math.hypot(this.position.x, this.position.z);
    if (r > bounds) {
      this.position.x *= bounds / r;
      this.position.z *= bounds / r;
      this.speed *= 0.3;
    }

    // Solid rocks: push the rover out of any boulder it overlaps.
    if (this.colliders && this.colliders.length) {
      const roverR = 1.1;
      for (const c of this.colliders) {
        const dx = this.position.x - c.x;
        const dz = this.position.z - c.z;
        const minD = c.r + roverR;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD) {
          const d = Math.sqrt(d2) || 0.0001;
          this.position.x = c.x + (dx / d) * minD;
          this.position.z = c.z + (dz / d) * minD;
          this.speed *= 0.25;
        }
      }
    }

    const spin = this.speed * dt / Math.max(0.1, this.wheelBaseR);
    for (const w of this.wheels) {
      const tire = w.userData.tire;
      if (tire) tire.rotation.x += spin; else w.rotation.x += spin;
    }

    if (this.eyes) this._animateGoogly(dt, turnInput);

    this._sync(dt);
  }

  _sync(dt, snap = false) {
    if (this.terrain) {
      this.position.y = this.terrain.heightAt(this.position.x, this.position.z);
      // Smooth, clamped surface normal -> orientation basis -> slerp.
      const raw = this.terrain.normalAt(this.position.x, this.position.z);
      const clamped = new THREE.Vector3(0, 1, 0).lerp(raw, 0.7).normalize();
      const k = snap ? 1 : 1 - Math.pow(0.0006, dt);
      this._normal.lerp(clamped, k).normalize();

      const up = this._normal;
      const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      fwd.addScaledVector(up, -fwd.dot(up)).normalize();
      const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
      fwd.crossVectors(right, up).normalize();
      this._tmpMat.makeBasis(right, up, fwd);
      this._tmpQuat.setFromRotationMatrix(this._tmpMat);
      this.group.position.copy(this.position);
      if (snap) this.group.quaternion.copy(this._tmpQuat);
      else this.group.quaternion.slerp(this._tmpQuat, 1 - Math.pow(0.0008, dt));
    } else {
      this.group.position.copy(this.position);
      this.group.rotation.set(0, this.yaw, 0);
    }
  }

  forwardVector() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
}
