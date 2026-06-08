import * as THREE from 'three';
import { makeSampleTexture } from './textures.js';

// Build a deformed, textured geometry per collectible type so no two pickups
// look like the same smooth primitive.
function makeGeometry(item) {
  let geo;
  switch (item) {
    case 'ice':
      geo = new THREE.IcosahedronGeometry(0.55, 0); break;
    case 'gas':
      geo = new THREE.SphereGeometry(0.55, 16, 16); break;
    case 'plasma':
      geo = new THREE.SphereGeometry(0.5, 16, 16); break;
    case 'metal':
      geo = new THREE.OctahedronGeometry(0.58, 0); break;
    default:
      geo = new THREE.DodecahedronGeometry(0.55, 0); break;
  }
  // Lumpy deformation (skip the smooth gas/plasma orbs). Displace by a smooth
  // function of vertex direction so duplicated corner vertices (non-indexed
  // primitives) move together and the shape stays welded instead of cracking.
  if (item !== 'gas' && item !== 'plasma') {
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      nrm.copy(v).normalize();
      const d =
        Math.sin(nrm.x * 4.2 + nrm.y * 3.7) * Math.cos(nrm.z * 5.1 + nrm.x * 2.3) * 0.5 +
        Math.sin(nrm.y * 6.5 + nrm.z * 1.9) * 0.3;
      v.multiplyScalar(1 + d * 0.4);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return geo;
}

function makeMaterial(item, color) {
  const c = new THREE.Color(color);
  switch (item) {
    case 'ice':
      return new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, metalness: 0.1, emissive: c.clone().multiplyScalar(0.22), transparent: true, opacity: 0.85 });
    case 'gas':
      return new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, transparent: true, opacity: 0.55, emissive: c.clone().multiplyScalar(0.25) });
    case 'plasma':
      return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.5, roughness: 0.3 });
    case 'metal': {
      const tex = makeSampleTexture(c);
      return new THREE.MeshStandardMaterial({ color: c, map: tex, bumpMap: tex, bumpScale: 0.3, metalness: 0.9, roughness: 0.35 });
    }
    default: {
      const tex = makeSampleTexture(c);
      return new THREE.MeshStandardMaterial({ color: c, map: tex, bumpMap: tex, bumpScale: 0.4, roughness: 0.95, metalness: 0.03 });
    }
  }
}

// Manages the set of collectible items on the current planet.
export class CollectibleField {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.onPickup = null;
    this.pickupRadius = 2.4;
    this.terrain = null;
  }

  setTerrain(terrain) {
    this.terrain = terrain;
  }

  _ground(x, z) {
    return this.terrain ? this.terrain.heightAt(x, z) : 0;
  }

  clear() {
    for (const it of this.items) {
      this.scene.remove(it.mesh);
      it.mesh.geometry.dispose();
      it.mesh.material.dispose();
    }
    this.items = [];
  }

  spawn(item, count, color, bounds = 60) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(makeGeometry(item), makeMaterial(item, color));
      const ang = Math.random() * Math.PI * 2;
      const rad = 10 + Math.random() * (bounds - 12);
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const hover = 0.6 + Math.random() * 0.3;
      const baseY = this._ground(x, z) + hover;
      mesh.position.set(x, baseY, z);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.items.push({ mesh, item, baseY, phase: Math.random() * Math.PI * 2, picked: false });
    }
  }

  // Returns true if at least one item was collected this frame.
  update(dt, roverPos, t) {
    let collected = false;
    for (const it of this.items) {
      if (it.picked) continue;
      it.mesh.rotation.y += dt * 1.2;
      it.mesh.position.y = it.baseY + Math.sin(t * 2 + it.phase) * 0.18;
      const dx = it.mesh.position.x - roverPos.x;
      const dz = it.mesh.position.z - roverPos.z;
      if (dx * dx + dz * dz < this.pickupRadius * this.pickupRadius) {
        it.picked = true;
        this.scene.remove(it.mesh);
        it.mesh.geometry.dispose();
        it.mesh.material.dispose();
        collected = true;
        if (this.onPickup) this.onPickup(it.item);
      }
    }
    return collected;
  }

  get remaining() {
    return this.items.filter((i) => !i.picked).length;
  }
}

function placeOnTerrain(group, x, z, terrain) {
  group.position.set(x, terrain ? terrain.heightAt(x, z) : 0, z);
}

// A glowing beacon used for "drive to the beacon" missions.
export function makeBeacon(color = 0x33ff99, bounds = 60, terrain = null, pos = null) {
  const group = new THREE.Group();
  const c = new THREE.Color(color);
  const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 4, 12), mat);
  post.position.y = 2;
  group.add(post);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 20), mat);
  orb.position.y = 4.4;
  group.add(orb);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.6, 0.08, 8, 32),
    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.8, transparent: true, opacity: 0.8 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.2;
  group.add(ring);
  group.userData.ring = ring;
  group.userData.orb = orb;

  let x, z;
  if (pos) { x = pos.x; z = pos.z; }
  else {
    const ang = Math.random() * Math.PI * 2;
    const rad = bounds * 0.7;
    x = Math.cos(ang) * rad;
    z = Math.sin(ang) * rad;
  }
  placeOnTerrain(group, x, z, terrain);
  return group;
}

// A rotating scan target for "scan the feature" missions.
export function makeScanTarget(color = 0x66ccff, bounds = 60, terrain = null, pos = null) {
  const group = new THREE.Group();
  const c = new THREE.Color(color);
  const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.4 });
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(2, 0), mat);
  rock.position.y = 1.6;
  group.add(rock);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(2.6, 0.1, 8, 32),
    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1, transparent: true, opacity: 0.7 })
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 1.6;
  group.add(halo);
  group.userData.halo = halo;
  group.userData.rock = rock;

  let x, z;
  if (pos) { x = pos.x; z = pos.z; }
  else {
    const ang = Math.random() * Math.PI * 2;
    const rad = bounds * 0.6;
    x = Math.cos(ang) * rad;
    z = Math.sin(ang) * rad;
  }
  placeOnTerrain(group, x, z, terrain);
  return group;
}

// A deposit pad for "drill / hold position" missions.
export function makeDrillSite(color = 0xffa033, bounds = 60, terrain = null) {
  const group = new THREE.Group();
  const c = new THREE.Color(color);
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.4, 0.3, 24),
    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.4, roughness: 0.8 })
  );
  pad.position.y = 0.15;
  group.add(pad);
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.7, 1.4, 12),
    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.4 })
  );
  core.position.y = 0.9;
  group.add(core);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.6, 0.08, 8, 32),
    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1, transparent: true, opacity: 0.8 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.2;
  group.add(ring);
  group.userData.core = core;
  group.userData.ring = ring;

  const ang = Math.random() * Math.PI * 2;
  const rad = bounds * 0.55;
  placeOnTerrain(group, Math.cos(ang) * rad, Math.sin(ang) * rad, terrain);
  return group;
}

// A landmark photo target (flag/marker you must frame in view).
export function makePhotoTarget(color = 0xff5577, bounds = 60, terrain = null, pos = null) {
  const group = new THREE.Group();
  const c = new THREE.Color(color);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 5, 10),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.4 })
  );
  pole.position.y = 2.5;
  group.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1),
    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5, side: THREE.DoubleSide })
  );
  flag.position.set(0.85, 4.3, 0);
  group.add(flag);
  group.userData.flag = flag;

  let x, z;
  if (pos) { x = pos.x; z = pos.z; }
  else {
    const ang = Math.random() * Math.PI * 2;
    const rad = bounds * 0.75;
    x = Math.cos(ang) * rad;
    z = Math.sin(ang) * rad;
  }
  placeOnTerrain(group, x, z, terrain);
  return group;
}
