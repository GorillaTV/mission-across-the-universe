import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Wheel tracks the rover leaves on the surface.
//
// A fixed pool of small quads is recycled. A new pair of ruts is stamped only
// when the rover has travelled a set distance, so cost is tiny. Each quad is
// laid flat against the terrain, lifted a hair along the surface NORMAL (not
// world-up) so it hugs slopes without z-fighting, and rendered with
// depthWrite:false + polygonOffset to stay out of transparency-sort trouble.
// Tracks slowly fade as the pool wraps around.
// ---------------------------------------------------------------------------

const POOL = 240; // total rut quads (2 per stamp -> ~120 stamps of history)
const STAMP_DIST = 1.1; // metres between stamps
const RUT_OFFSET = 0.55; // half-distance between the two wheel ruts

export class Tracks {
  constructor(scene) {
    this.scene = scene;
    this.terrain = null;
    this.pool = [];
    this.index = 0;
    this._last = new THREE.Vector3();
    this._has = false;

    const geo = new THREE.PlaneGeometry(0.5, 0.9);
    geo.rotateX(-Math.PI / 2);
    this.geo = geo;
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x1c1a17,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    this.container = new THREE.Group();
    scene.add(this.container);
    for (let i = 0; i < POOL; i++) {
      const m = new THREE.Mesh(geo, this.mat);
      m.visible = false;
      m.renderOrder = 1;
      this.container.add(m);
      this.pool.push(m);
    }
  }

  setTerrain(terrain) {
    this.terrain = terrain;
    this._has = false;
  }

  reset() {
    for (const m of this.pool) m.visible = false;
    this.index = 0;
    this._has = false;
  }

  // Call each frame with the rover's centre position and heading vector.
  update(pos, forward) {
    if (!this.terrain) return;
    if (!this._has) {
      this._last.copy(pos);
      this._has = true;
      return;
    }
    const dx = pos.x - this._last.x;
    const dz = pos.z - this._last.z;
    if (dx * dx + dz * dz < STAMP_DIST * STAMP_DIST) return;
    this._last.copy(pos);

    // Right vector perpendicular to heading on the ground plane.
    const rx = forward.z;
    const rz = -forward.x;
    const heading = Math.atan2(forward.x, forward.z);
    for (const side of [-1, 1]) {
      const wx = pos.x + rx * RUT_OFFSET * side;
      const wz = pos.z + rz * RUT_OFFSET * side;
      this._stamp(wx, wz, heading);
    }
  }

  _stamp(x, z, heading) {
    const m = this.pool[this.index];
    this.index = (this.index + 1) % POOL;
    const y = this.terrain.heightAt(x, z);
    const normal = this.terrain.normalAt(x, z);
    m.position.set(x, y, z).addScaledVector(normal, 0.04);
    // Orient flat to the slope, then yaw to the heading.
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    m.rotateY(heading);
    m.visible = true;
  }
}
