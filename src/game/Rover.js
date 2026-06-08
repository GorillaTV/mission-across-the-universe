import * as THREE from 'three';

// Body dimensions per chosen shape. Forward is +Z.
const SHAPES = {
  explorer: { body: [1.2, 0.45, 1.9], wheels: 6, wheelR: 0.34, desc: 'Balanced six-wheeler' },
  hauler: { body: [1.7, 0.6, 2.3], wheels: 6, wheelR: 0.4, desc: 'Heavy and sturdy' },
  hopper: { body: [1.0, 0.6, 1.4], wheels: 4, wheelR: 0.42, desc: 'Light and nimble' },
};

export const ROVER_SHAPES = Object.entries(SHAPES).map(([id, s]) => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  desc: s.desc,
}));

export class Rover {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.position = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0; // scalar velocity along heading

    // Tunables (modified by upgrades via setStatMultipliers)
    this.baseMaxSpeed = 11;
    this.baseAccel = 18;
    this.baseTurn = 2.2;
    this.speedMult = 1;
    this.turnMult = 1;

    this.wheels = [];
    this.parts = {};
    this.shape = 'explorer';
    this.color = 0xffce3a;
    this._built = false;
  }

  configure({ shape = 'explorer', name = 'Rover', color = 0xffce3a }) {
    this.shape = SHAPES[shape] ? shape : 'explorer';
    this.name = name;
    this.color = color;
    this._build();
  }

  _build() {
    // Clear any previous build
    this.group.clear();
    this.wheels = [];
    this.parts = {};

    const spec = SHAPES[this.shape];
    const [bw, bh, bl] = spec.body;

    this.bodyMat = new THREE.MeshStandardMaterial({ color: this.color, metalness: 0.4, roughness: 0.5 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.6, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ddff, metalness: 0.2, roughness: 0.1, emissive: 0x113344 });

    // Chassis
    const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bl), this.bodyMat);
    body.position.y = spec.wheelR + bh / 2;
    body.castShadow = true;
    this.group.add(body);
    this.body = body;

    // A sloped top deck for character
    const deck = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.8, bh * 0.5, bl * 0.6), this.bodyMat);
    deck.position.set(0, body.position.y + bh * 0.5, -bl * 0.1);
    this.group.add(deck);

    // Camera mast + head (sensor unit) at the front
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), darkMat);
    mast.position.set(0, body.position.y + bh * 0.6 + 0.3, bl * 0.35);
    this.group.add(mast);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.18), darkMat);
    head.position.set(0, mast.position.y + 0.35, bl * 0.35);
    this.group.add(head);
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), glassMat);
    eye.position.set(0, head.position.y, bl * 0.35 + 0.1);
    this.group.add(eye);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(spec.wheelR, spec.wheelR, 0.28, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.8 });
    const rows = spec.wheels === 6 ? [bl * 0.34, 0, -bl * 0.34] : [bl * 0.32, -bl * 0.32];
    const xOff = bw / 2 + 0.05;
    for (const z of rows) {
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(sx * xOff, spec.wheelR, z);
        this.group.add(w);
        this.wheels.push(w);
      }
    }
    this.wheelBaseR = spec.wheelR;

    this._buildParts(spec, body);
    this._built = true;
    this.applyUpgrades([]);
  }

  _buildParts(spec, body) {
    const [bw, bh, bl] = spec.body;
    const topY = body.position.y + bh / 2;

    // Headlights
    const lights = new THREE.Group();
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffcc, emissiveIntensity: 1.4 });
    for (const sx of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), lightMat);
      l.position.set(sx * bw * 0.28, topY - bh * 0.1, bl / 2 + 0.02);
      lights.add(l);
    }
    this.parts.lights = lights;

    // Solar panels
    const solar = new THREE.Group();
    const solarMat = new THREE.MeshStandardMaterial({ color: 0x1b3b8f, metalness: 0.5, roughness: 0.3, emissive: 0x0a1840 });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.7, 0.04, bl * 0.7), solarMat);
      p.position.set(sx * bw * 0.55, topY + bh * 0.6, 0);
      p.rotation.z = sx * 0.18;
      solar.add(p);
    }
    this.parts.solar = solar;

    // High-gain antenna (dish)
    const antenna = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.7, roughness: 0.3 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), poleMat);
    pole.position.set(-bw * 0.3, topY + bh * 0.6 + 0.35, -bl * 0.3);
    antenna.add(pole);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), poleMat);
    dish.position.set(-bw * 0.3, topY + bh * 0.6 + 0.7, -bl * 0.3);
    dish.rotation.x = Math.PI * 0.9;
    antenna.add(dish);
    this.parts.antenna = antenna;

    // Sample drill arm at the front
    const drill = new THREE.Group();
    const armMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.6, roughness: 0.4 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.8), armMat);
    arm.position.set(bw * 0.3, topY - bh * 0.2, bl / 2 + 0.3);
    drill.add(arm);
    const bit = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.3 }));
    bit.position.set(bw * 0.3, topY - bh * 0.2 - 0.25, bl / 2 + 0.6);
    bit.rotation.x = Math.PI;
    drill.add(bit);
    this.parts.drill = drill;

    // RTG (nuclear battery) - finned cylinder at the back
    const rtg = new THREE.Group();
    const rtgMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.5, emissive: 0x331100 });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.6, 12), rtgMat);
    cyl.rotation.x = Math.PI / 2;
    cyl.position.set(0, topY + 0.1, -bl / 2 - 0.25);
    rtg.add(cyl);
    for (let i = 0; i < 6; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.6), rtgMat);
      fin.position.copy(cyl.position);
      fin.rotation.z = (i / 6) * Math.PI;
      rtg.add(fin);
    }
    this.parts.rtg = rtg;

    // Thermal shielding - gold blankets wrapping the body
    const armor = new THREE.Mesh(
      new THREE.BoxGeometry(bw * 1.06, bh * 1.1, bl * 1.04),
      new THREE.MeshStandardMaterial({ color: 0xffcf4a, metalness: 0.9, roughness: 0.35, emissive: 0x4a3300, transparent: true, opacity: 0.55 })
    );
    armor.position.copy(body.position);
    this.parts.armor = armor;

    // Turbo motors - glowing exhausts at the back
    const turbo = new THREE.Group();
    const exMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x33aaff, emissiveIntensity: 1.6 });
    for (const sx of [-1, 1]) {
      const ex = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 12), exMat);
      ex.rotation.x = -Math.PI / 2;
      ex.position.set(sx * bw * 0.3, topY - bh * 0.1, -bl / 2 - 0.18);
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

  // Show parts for the given unlocked upgrade ids.
  applyUpgrades(unlockedIds) {
    const set = new Set(unlockedIds);
    for (const key of Object.keys(this.parts)) {
      if (key === 'bigwheels') continue;
      this.parts[key].visible = set.has(key);
    }
    // bigwheels scales the existing wheels rather than adding a mesh
    const big = set.has('bigwheels');
    const scale = big ? 1.4 : 1;
    for (const w of this.wheels) w.scale.set(scale, 1, scale);
  }

  setStatMultipliers(speedMult, turnMult) {
    this.speedMult = speedMult;
    this.turnMult = turnMult;
  }

  reset(position = new THREE.Vector3(0, 0, 0), yaw = 0) {
    this.position.copy(position);
    this.yaw = yaw;
    this.speed = 0;
    this._sync();
  }

  get maxSpeed() {
    return this.baseMaxSpeed * this.speedMult;
  }

  update(dt, keys, bounds = 70) {
    const fwd = keys.forward ? 1 : 0;
    const back = keys.back ? 1 : 0;
    const drive = fwd - back;

    // Accelerate / brake
    if (drive !== 0) {
      this.speed += drive * this.baseAccel * dt;
    } else {
      // friction
      this.speed -= this.speed * Math.min(1, dt * 2.5);
      if (Math.abs(this.speed) < 0.02) this.speed = 0;
    }
    const max = this.maxSpeed;
    this.speed = Math.max(-max * 0.5, Math.min(max, this.speed));

    // Turning — allowed even at low speed, stronger while moving
    const turnInput = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    const moveFactor = 0.35 + 0.65 * Math.min(1, Math.abs(this.speed) / Math.max(1, max));
    this.yaw += turnInput * this.baseTurn * this.turnMult * moveFactor * dt;

    // Move along heading
    const dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.position.addScaledVector(dir, this.speed * dt);

    // Keep within the circular play area
    const r = Math.hypot(this.position.x, this.position.z);
    if (r > bounds) {
      this.position.x *= bounds / r;
      this.position.z *= bounds / r;
      this.speed *= 0.3;
    }

    // Spin wheels with motion
    const spin = this.speed * dt / Math.max(0.1, this.wheelBaseR);
    for (const w of this.wheels) w.rotation.x += spin;

    this._sync();
  }

  _sync() {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
  }

  // Direction the rover is facing (unit vector on the ground plane).
  forwardVector() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
}
