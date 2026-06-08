import { makeBeacon, makeScanTarget } from './Collectible.js';

const REACH_RADIUS = 4.5;
const SCAN_RADIUS = 7;
const SCAN_TIME = 2.6; // seconds within range to finish a scan

// Runs the missions for a single planet: spawns collectibles + markers,
// tracks progress and fires callbacks as objectives complete.
export class MissionSystem {
  constructor(scene, field) {
    this.scene = scene;
    this.field = field;
    this.missions = [];
    this.markers = [];
    this.callbacks = {};
    this.t = 0;
  }

  start(planet, callbacks = {}) {
    this.clear();
    this.callbacks = callbacks;
    this.bounds = 60;

    this.missions = planet.missions.map((def) => ({
      def,
      type: def.type,
      label: def.label,
      target: def.count || 1,
      count: 0,
      progress: 0,
      done: false,
      marker: null,
    }));

    this.field.onPickup = (item) => this._handlePickup(item);

    for (const m of this.missions) {
      if (m.type === 'collect') {
        this.field.spawn(m.def.item, m.target, m.def.color, this.bounds);
      } else if (m.type === 'reach') {
        const beacon = makeBeacon(0x44ffaa, this.bounds);
        m.marker = beacon;
        this.scene.add(beacon);
        this.markers.push(beacon);
      } else if (m.type === 'scan') {
        const target = makeScanTarget(0x66ccff, this.bounds);
        m.marker = target;
        this.scene.add(target);
        this.markers.push(target);
      }
    }
    this._emitUpdate();
  }

  _handlePickup(item) {
    const m = this.missions.find((mm) => mm.type === 'collect' && mm.def.item === item && !mm.done);
    if (!m) return;
    m.count++;
    m.progress = m.count / m.target;
    if (m.count >= m.target) this._complete(m);
    else this._emitUpdate();
  }

  _complete(m) {
    if (m.done) return;
    m.done = true;
    m.progress = 1;
    if (m.marker) {
      this.scene.remove(m.marker);
      this.markers = this.markers.filter((x) => x !== m.marker);
    }
    this._emitUpdate();
    this.callbacks.onComplete?.(m.def);
    if (this.missions.every((mm) => mm.done)) {
      this.callbacks.onAllComplete?.();
    }
  }

  _emitUpdate() {
    this.callbacks.onUpdate?.(this.snapshot());
  }

  snapshot() {
    return this.missions.map((m) => ({
      id: m.def.id,
      label: m.label,
      type: m.type,
      done: m.done,
      progress: Math.min(1, m.progress),
      detail:
        m.type === 'collect'
          ? `${Math.min(m.count, m.target)}/${m.target}`
          : m.done
            ? 'done'
            : m.type === 'scan'
              ? `${Math.round(m.progress * 100)}%`
              : '',
    }));
  }

  update(dt, roverPos) {
    this.t += dt;
    let changed = false;
    for (const m of this.missions) {
      if (m.done || !m.marker) continue;
      const dx = m.marker.position.x - roverPos.x;
      const dz = m.marker.position.z - roverPos.z;
      const dist = Math.hypot(dx, dz);

      if (m.type === 'reach') {
        // animate ring
        if (m.marker.userData.ring) m.marker.userData.ring.rotation.z += dt;
        m.marker.userData.orb.position.y = 4.4 + Math.sin(this.t * 2) * 0.2;
        if (dist < REACH_RADIUS) this._complete(m);
      } else if (m.type === 'scan') {
        m.marker.userData.rock.rotation.y += dt * 0.6;
        if (m.marker.userData.halo) m.marker.userData.halo.rotation.z += dt * 1.5;
        if (dist < SCAN_RADIUS) {
          m.progress = Math.min(1, m.progress + dt / SCAN_TIME);
          m.scanning = true;
          changed = true;
          if (m.progress >= 1) this._complete(m);
        } else if (m.scanning) {
          m.scanning = false;
          changed = true;
        }
      }
    }
    if (changed) this._emitUpdate();
  }

  clear() {
    for (const mk of this.markers) this.scene.remove(mk);
    this.markers = [];
    this.field.clear();
    this.missions = [];
  }
}
