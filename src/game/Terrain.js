import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Procedural terrain.
//
// A single shared height grid drives BOTH the rendered mesh AND the heightAt()
// lookup used to sit the rover, rocks, collectibles and markers on the ground.
// That guarantees nothing floats or sinks. Height is sampled by bilinear
// interpolation inside the grid cell (not by re-evaluating noise) so the value
// always matches the visible surface.
//
// Per-planet "profiles" shape the land: cratered plains (Moon/Mercury), rolling
// dunes with a giant volcano (Mars), volcanic flats (Venus), gentle cloud decks
// (gas giants), sharp ice ridges (ice giants), a flat glacial heart (Pluto) and
// a churning surface (Sun). Landmarks (volcano / mountain / glacier) are baked
// straight into the height field so you can actually drive up to and over them.
// ---------------------------------------------------------------------------

const SIZE = 400; // full width of the terrain in world units
const SEG = 200; // grid segments per side -> cell size = 2 units
const HALF = SIZE / 2;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, z, seed) {
  let n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = smooth(fx);
  const v = smooth(fz);
  const n00 = hash2(ix, iz, seed);
  const n10 = hash2(ix + 1, iz, seed);
  const n01 = hash2(ix, iz + 1, seed);
  const n11 = hash2(ix + 1, iz + 1, seed);
  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return nx0 + (nx1 - nx0) * v; // 0..1
}

function fbm(x, z, seed, octaves) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, z * freq, seed + i * 13.13);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm; // 0..1
}

// Per-planet terrain personality. Returns a profile object.
function profileFor(planet) {
  const id = planet.id;
  const seedBase = (id.charCodeAt(0) * 131 + id.length * 977) % 100000;
  const base = {
    seed: seedBase,
    freq: 0.018,
    octaves: 4,
    amp: 4.5,
    style: 'rolling',
    craters: 0,
    craterDepth: 2.6,
    craterMin: 6,
    craterMax: 16,
    ridge: 0,
    landmark: null,
    tint: planet.groundTint,
  };
  switch (id) {
    case 'moon':
      return { ...base, amp: 3.5, freq: 0.02, craters: 16, craterDepth: 3.2 };
    case 'mercury':
      return { ...base, amp: 3.8, freq: 0.02, craters: 13, craterDepth: 3.0, ridge: 0.4,
        landmark: { type: 'scarp', x: 95, z: -70, radius: 70, height: 12 } };
    case 'mars':
      return { ...base, amp: 4.5, freq: 0.014, octaves: 5, craters: 4, craterDepth: 2.2, style: 'dunes',
        landmark: { type: 'volcano', x: -100, z: -95, radius: 85, height: 46 } };
    case 'venus':
      return { ...base, amp: 3.2, freq: 0.02, style: 'volcanic', craters: 2,
        landmark: { type: 'volcano', x: 100, z: -90, radius: 70, height: 30 } };
    case 'jupiter':
      return { ...base, amp: 2.4, freq: 0.03, octaves: 3, style: 'clouds' };
    case 'saturn':
      return { ...base, amp: 2.2, freq: 0.03, octaves: 3, style: 'clouds' };
    case 'uranus':
      return { ...base, amp: 5.5, freq: 0.02, style: 'ridge', ridge: 1,
        landmark: { type: 'mountain', x: -95, z: 90, radius: 60, height: 34 } };
    case 'neptune':
      return { ...base, amp: 5.5, freq: 0.022, style: 'ridge', ridge: 1,
        landmark: { type: 'mountain', x: 95, z: 95, radius: 60, height: 32 } };
    case 'pluto':
      return { ...base, amp: 4, freq: 0.018, craters: 6, craterDepth: 2.4,
        landmark: { type: 'glacier', x: 0, z: -85, radius: 75, height: 5 } };
    case 'sun':
      return { ...base, amp: 5, freq: 0.05, octaves: 5, style: 'turbulent' };
    default:
      return base;
  }
}

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.heights = null;
    this.profile = null;
    this.landmark = null;
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
    this.heights = null;
  }

  // Build the height grid + mesh for a planet. `surfaceTex` is the planet map.
  build(planet, surfaceTex, maxAnisotropy = 8) {
    this.dispose();
    const p = profileFor(planet);
    this.profile = p;

    // Pre-generate craters deterministically so heightAt and the mesh agree.
    const rng = mulberry32(p.seed + 7);
    const craters = [];
    for (let i = 0; i < p.craters; i++) {
      const ang = rng() * Math.PI * 2;
      const rad = 30 + rng() * (HALF - 50);
      craters.push({
        x: Math.cos(ang) * rad,
        z: Math.sin(ang) * rad,
        r: p.craterMin + rng() * (p.craterMax - p.craterMin),
        d: p.craterDepth * (0.6 + rng() * 0.8),
      });
    }
    this._craters = craters;

    const n = SEG + 1;
    const heights = new Float32Array(n * n);
    for (let gz = 0; gz < n; gz++) {
      for (let gx = 0; gx < n; gx++) {
        const x = gx / SEG * SIZE - HALF;
        const z = gz / SEG * SIZE - HALF;
        heights[gz * n + gx] = this._sampleHeight(x, z, p, craters);
      }
    }
    this.heights = heights;

    // Build geometry from the grid. rotateX so X/Z map to world ground plane.
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, heights[i]);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    surfaceTex.wrapS = surfaceTex.wrapT = THREE.RepeatWrapping;
    surfaceTex.repeat.set(SIZE / 55, SIZE / 55);
    surfaceTex.anisotropy = maxAnisotropy;
    surfaceTex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({
      map: surfaceTex,
      color: p.tint,
      roughness: 0.97,
      metalness: planet.type === 'Gas giant' || planet.type === 'Ice giant' ? 0.08 : 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.mesh = mesh;
    this.scene.add(mesh);

    // World-space landmark (centre top) for missions / scenery alignment.
    if (p.landmark) {
      const lm = p.landmark;
      this.landmark = {
        type: lm.type,
        position: new THREE.Vector3(lm.x, this.heightAt(lm.x, lm.z), lm.z),
      };
    } else {
      this.landmark = null;
    }
    return this;
  }

  // Raw height function used while baking the grid.
  _sampleHeight(x, z, p, craters) {
    let h = (fbm(x * p.freq, z * p.freq, p.seed, p.octaves) - 0.5) * 2 * p.amp;

    if (p.style === 'dunes') {
      // Directional ripples for wind-blown dunes.
      h += Math.sin(x * 0.05 + fbm(x * 0.01, z * 0.01, p.seed + 3, 2) * 6) * p.amp * 0.4;
    } else if (p.style === 'ridge' || p.ridge) {
      // Sharp ridged noise (abs of signed noise) for jagged ice mountains.
      const r = 1 - Math.abs(fbm(x * p.freq * 1.5, z * p.freq * 1.5, p.seed + 9, p.octaves) - 0.5) * 2;
      h += (r - 0.5) * p.amp * 1.6 * (p.ridge || 0.4);
    } else if (p.style === 'turbulent') {
      h += Math.sin(x * 0.08) * Math.cos(z * 0.08) * p.amp * 0.5;
    }

    // Craters: a bowl plus a raised rim ring.
    for (const c of craters) {
      const dx = x - c.x;
      const dz = z - c.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const t = dist / c.r;
      if (t < 1.4) {
        if (t < 1) h -= c.d * (1 - t) * (1 - t);
        h += c.d * 0.5 * Math.exp(-Math.pow((t - 1.0) / 0.18, 2));
      }
    }

    // Landmark feature baked into the height field.
    if (p.landmark) {
      const lm = p.landmark;
      const dx = x - lm.x;
      const dz = z - lm.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (lm.type === 'volcano') {
        if (dist < lm.radius) {
          let cone = lm.height * Math.pow(1 - dist / lm.radius, 1.7);
          if (dist < lm.radius * 0.13) cone -= lm.height * 0.16; // caldera dip
          h += cone;
        }
      } else if (lm.type === 'mountain' || lm.type === 'scarp') {
        if (dist < lm.radius) {
          h += lm.height * Math.pow(1 - dist / lm.radius, 1.4);
        }
      } else if (lm.type === 'glacier') {
        // A broad, almost flat raised plateau (the "heart").
        if (dist < lm.radius) {
          const e = THREE.MathUtils.smoothstep(dist, lm.radius * 0.7, lm.radius);
          h = h * e + lm.height * (1 - e);
        }
      }
    }
    return h;
  }

  // Bilinear height lookup from the baked grid (matches the visible mesh).
  heightAt(x, z) {
    if (!this.heights) return 0;
    const n = SEG + 1;
    let gx = (x + HALF) / SIZE * SEG;
    let gz = (z + HALF) / SIZE * SEG;
    gx = Math.max(0, Math.min(SEG - 1e-4, gx));
    gz = Math.max(0, Math.min(SEG - 1e-4, gz));
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const fx = gx - x0;
    const fz = gz - z0;
    const h00 = this.heights[z0 * n + x0];
    const h10 = this.heights[z0 * n + x0 + 1];
    const h01 = this.heights[(z0 + 1) * n + x0];
    const h11 = this.heights[(z0 + 1) * n + x0 + 1];
    const hx0 = h00 + (h10 - h00) * fx;
    const hx1 = h01 + (h11 - h01) * fx;
    return hx0 + (hx1 - hx0) * fz;
  }

  // Surface normal estimated from neighbouring heights (spacing ~ wheelbase).
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.4;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    out.set(hl - hr, 2 * e, hd - hu).normalize();
    return out;
  }

  get size() {
    return SIZE;
  }
  get bounds() {
    return HALF;
  }
}
