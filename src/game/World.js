import * as THREE from 'three';
import { Terrain } from './Terrain.js';
import { makeRockTexture } from './textures.js';

const BASE = import.meta.env.BASE_URL;
const texLoader = new THREE.TextureLoader();

function loadTexture(file) {
  return new Promise((resolve, reject) => {
    texLoader.load(
      `${BASE}textures/${file}`,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        resolve(t);
      },
      undefined,
      reject
    );
  });
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.objects = [];
    this.sky = null;
    this.planetBackdrop = null;
    this.terrain = new Terrain(scene);
    this.maxAnisotropy = 8;
    this._t = 0;
  }

  clear() {
    for (const o of this.objects) {
      this.scene.remove(o);
      o.traverse?.((m) => {
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            if (mat.map) mat.map.dispose();
            mat.dispose();
          }
        }
      });
    }
    this.objects = [];
    this.terrain.dispose();
  }

  async load(planet) {
    this.clear();
    const scene = this.scene;

    // Thin haze only. Airless bodies get almost none; thick atmospheres get a
    // little. This is the fix for "surface only renders near the rover".
    scene.fog = new THREE.FogExp2(planet.fog, planet.fogDensity * 0.12);
    scene.background = new THREE.Color(planet.sky);

    // Lights
    const sun = new THREE.DirectionalLight(planet.light, planet.lightIntensity);
    sun.position.set(80, 120, 40);
    this._add(sun);
    const ambient = new THREE.AmbientLight(planet.ambient, 1.1);
    this._add(ambient);
    const hemi = new THREE.HemisphereLight(planet.sky, planet.groundTint, 0.5);
    this._add(hemi);

    // Load textures in parallel
    const [surfaceTex, starTex] = await Promise.all([
      loadTexture(planet.texture),
      loadTexture('stars.jpg'),
    ]);

    // Starfield skybox
    const skyGeo = new THREE.SphereGeometry(600, 32, 32);
    const skyMat = new THREE.MeshBasicMaterial({ map: starTex, side: THREE.BackSide, fog: false });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this._add(this.sky);

    // Displaced terrain built from the planet's own surface map.
    this.terrain.build(planet, surfaceTex, this.maxAnisotropy);

    // A big version of the planet hanging in the sky for atmosphere
    const backdrop = new THREE.Mesh(
      new THREE.SphereGeometry(60, 48, 48),
      new THREE.MeshStandardMaterial({ map: surfaceTex.clone(), emissive: planet.id === 'sun' ? 0xff7a1a : 0x000000, emissiveIntensity: planet.id === 'sun' ? 0.6 : 0, fog: false })
    );
    backdrop.material.map.wrapS = backdrop.material.map.wrapT = THREE.RepeatWrapping;
    backdrop.material.map.repeat.set(1, 1);
    backdrop.position.set(-180, 120, -320);
    this.planetBackdrop = backdrop;
    this._add(backdrop);

    // Scatter textured boulders that sit on the terrain.
    this._scatterRocks(planet);

    // Landmark scenery cap (glow / ice) if the terrain has one.
    this._decorateLandmark(planet);

    return true;
  }

  _scatterRocks(planet) {
    const tint = new THREE.Color(planet.groundTint);
    const rockTex = makeRockTexture(tint);
    // A few deformed base geometries reused across instances.
    const geos = [
      this._deform(new THREE.DodecahedronGeometry(1, 1), 0.3),
      this._deform(new THREE.IcosahedronGeometry(1, 1), 0.32),
      this._deform(new THREE.IcosahedronGeometry(1, 2), 0.26),
    ];
    const mat = new THREE.MeshStandardMaterial({
      color: tint.clone().multiplyScalar(0.9),
      map: rockTex,
      bumpMap: rockTex,
      bumpScale: 0.4,
      roughness: 1,
      metalness: 0.02,
    });
    const count = 110;
    const group = new THREE.Group();
    const half = this.terrain.bounds - 6;
    this.colliders = [];
    for (let i = 0; i < count; i++) {
      const g = geos[i % geos.length];
      const m = new THREE.Mesh(g, mat);
      const ang = Math.random() * Math.PI * 2;
      const rad = 8 + Math.random() * (half - 8);
      const s = 0.5 + Math.random() * 2.4;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const sx = s;
      const sz = s;
      m.position.set(x, this.terrain.heightAt(x, z) + s * 0.2, z);
      m.scale.set(sx, s * (0.6 + Math.random() * 0.5), sz);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.castShadow = true;
      group.add(m);
      // Horizontal collision footprint (rocks bigger than ~0.7 block the rover).
      const r = Math.max(sx, sz) * 0.85;
      if (s > 0.7) this.colliders.push({ x, z, r });
    }
    this._add(group);
  }

  getColliders() {
    return this.colliders || [];
  }

  // Displace each vertex by a SMOOTH function of its direction so duplicated
  // corner vertices (these primitives are non-indexed) move together and the
  // mesh stays welded into one amorphous lump instead of cracking apart.
  _deform(geo, amount) {
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      n.copy(v).normalize();
      const d =
        Math.sin(n.x * 3.1 + n.y * 5.3) * Math.cos(n.z * 4.7 + n.x * 2.1) * 0.5 +
        Math.sin(n.y * 7.0 + n.z * 1.7) * 0.3 +
        Math.cos(n.x * 6.0 - n.z * 3.0) * 0.2;
      v.multiplyScalar(1 + d * amount);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  _decorateLandmark(planet) {
    const lm = this.terrain.landmark;
    if (!lm) return;
    const lmRadius = this.terrain.profile.landmark.radius;
    if (lm.type === 'volcano') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(lmRadius * 0.12, 0.6, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0xff6620, emissive: 0xff3300, emissiveIntensity: 1.4 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(lm.position);
      ring.position.y += 0.5;
      this._add(ring);
    } else if (lm.type === 'mountain') {
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(lmRadius * 0.3, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0xeaffff, roughness: 0.4, metalness: 0.1 })
      );
      cap.position.copy(lm.position);
      cap.position.y += 3;
      this._add(cap);
    }
  }

  _add(obj) {
    this.scene.add(obj);
    this.objects.push(obj);
  }

  update(dt) {
    this._t += dt;
    if (this.sky) this.sky.rotation.y += dt * 0.003;
    if (this.planetBackdrop) this.planetBackdrop.rotation.y += dt * 0.02;
  }
}
