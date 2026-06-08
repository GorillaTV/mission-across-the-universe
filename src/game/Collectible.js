import * as THREE from 'three';

function makeGeometry(item) {
  switch (item) {
    case 'ice':
      return new THREE.IcosahedronGeometry(0.55, 0);
    case 'gas':
      return new THREE.SphereGeometry(0.55, 16, 16);
    case 'plasma':
      return new THREE.SphereGeometry(0.5, 16, 16);
    case 'metal':
      return new THREE.OctahedronGeometry(0.55, 0);
    default:
      return new THREE.DodecahedronGeometry(0.55, 0);
  }
}

function makeMaterial(item, color) {
  const c = new THREE.Color(color);
  switch (item) {
    case 'ice':
      return new THREE.MeshStandardMaterial({ color: c, roughness: 0.1, metalness: 0.1, emissive: c.clone().multiplyScalar(0.25), transparent: true, opacity: 0.85 });
    case 'gas':
      return new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, transparent: true, opacity: 0.6, emissive: c.clone().multiplyScalar(0.2) });
    case 'plasma':
      return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.4, roughness: 0.3 });
    case 'metal':
      return new THREE.MeshStandardMaterial({ color: c, metalness: 0.9, roughness: 0.3 });
    default:
      return new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0.05 });
  }
}

// Manages the set of collectible items on the current planet.
export class CollectibleField {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.onPickup = null;
    this.pickupRadius = 2.4;
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
      const baseY = 0.8 + Math.random() * 0.4;
      mesh.position.set(Math.cos(ang) * rad, baseY, Math.sin(ang) * rad);
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

// A glowing beacon used for "drive to the beacon" missions.
export function makeBeacon(color = 0x33ff99, bounds = 60) {
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

  const ang = Math.random() * Math.PI * 2;
  const rad = bounds * 0.7;
  group.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
  return group;
}

// A rotating scan target for "scan the feature" missions.
export function makeScanTarget(color = 0x66ccff, bounds = 60) {
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

  const ang = Math.random() * Math.PI * 2;
  const rad = bounds * 0.6;
  group.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
  return group;
}
