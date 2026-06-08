import { makeBeacon, makeScanTarget, makeDrillSite, makePhotoTarget } from './Collectible.js';

const REACH_RADIUS = 4.5;
const SCAN_RADIUS = 7;
const SCAN_TIME = 2.6; // seconds within range to finish a scan
const DRILL_RADIUS = 3.2;
const DRILL_TIME = 3.4; // seconds holding over a deposit
const PHOTO_NEAR = 6;
const PHOTO_FAR = 24;
const PHOTO_TIME = 1.6; // seconds framed in view
const PHOTO_AIM = 0.82; // dot threshold = roughly within view cone

// Runs the missions for a single planet: spawns collectibles + markers,
// tracks progress and fires callbacks as objectives complete.
export class MissionSystem {
  constructor(scene, field) {
    this.scene = scene;
    this.field = field;
    this.missions = [];
    this.markers = [];
    this.callbacks = {};
    this.terrain = null;
    this.scanMult = 1;
    this.t = 0;
  }

  setTerrain(terrain) {
    this.terrain = terrain;
  }

  // scanMult widens scan/drill range (high-gain antenna upgrade).
  setEffects({ scanMult = 1 } = {}) {
    this.scanMult = scanMult;
  }

  start(planet, callbacks = {}) {
    this.clear();
    this.callbacks = callbacks;
    this.bounds = 60;
    const terrain = this.terrain;
    const landmark = terrain && terrain.landmark ? terrain.landmark.position : null;

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
        const useLm = m.def.atLandmark && landmark;
        const beacon = makeBeacon(0x44ffaa, this.bounds, terrain, useLm ? landmark : null);
        m.marker = beacon;
        this.scene.add(beacon);
        this.markers.push(beacon);
      } else if (m.type === 'scan') {
        const target = makeScanTarget(0x66ccff, this.bounds, terrain);
        m.marker = target;
        this.scene.add(target);
        this.markers.push(target);
      } else if (m.type === 'drill') {
        const site = makeDrillSite(0xffa033, this.bounds, terrain);
        m.marker = site;
        this.scene.add(site);
        this.markers.push(site);
      } else if (m.type === 'photo') {
        const useLm = m.def.atLandmark && landmark;
        const target = makePhotoTarget(0xff5577, this.bounds, terrain, useLm ? landmark : null);
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
            : (m.type === 'scan' || m.type === 'drill' || m.type === 'photo')
              ? `${Math.round(m.progress * 100)}%`
              : '',
    }));
  }

  // Marker positions for the HUD mini-map.
  markerInfo() {
    return this.missions
      .filter((m) => m.marker && !m.done)
      .map((m) => ({ x: m.marker.position.x, z: m.marker.position.z, type: m.type }));
  }

  update(dt, roverPos, roverForward) {
    this.t += dt;
    let changed = false;
    const scanR = SCAN_RADIUS * this.scanMult;
    const drillR = DRILL_RADIUS * this.scanMult;

    for (const m of this.missions) {
      if (m.done || !m.marker) continue;
      const dx = m.marker.position.x - roverPos.x;
      const dz = m.marker.position.z - roverPos.z;
      const dist = Math.hypot(dx, dz);

      if (m.type === 'reach') {
        if (m.marker.userData.ring) m.marker.userData.ring.rotation.z += dt;
        m.marker.userData.orb.position.y = 4.4 + Math.sin(this.t * 2) * 0.2;
        if (dist < REACH_RADIUS) this._complete(m);
      } else if (m.type === 'scan') {
        m.marker.userData.rock.rotation.y += dt * 0.6;
        if (m.marker.userData.halo) m.marker.userData.halo.rotation.z += dt * 1.5;
        if (dist < scanR) {
          m.progress = Math.min(1, m.progress + dt / SCAN_TIME);
          changed = true;
          if (m.progress >= 1) this._complete(m);
        }
      } else if (m.type === 'drill') {
        if (m.marker.userData.ring) m.marker.userData.ring.rotation.z += dt;
        if (m.marker.userData.core) m.marker.userData.core.rotation.y += dt * 2;
        if (dist < drillR) {
          m.progress = Math.min(1, m.progress + dt / DRILL_TIME);
          if (m.marker.userData.core) m.marker.userData.core.position.y = 0.9 - m.progress * 0.5;
          changed = true;
          if (m.progress >= 1) this._complete(m);
        }
      } else if (m.type === 'photo') {
        if (m.marker.userData.flag) m.marker.userData.flag.rotation.y = Math.sin(this.t * 1.5) * 0.3;
        let aiming = false;
        if (roverForward && dist > PHOTO_NEAR && dist < PHOTO_FAR) {
          const inv = 1 / (dist || 1);
          const dot = (dx * inv) * roverForward.x + (dz * inv) * roverForward.z;
          if (dot > PHOTO_AIM) aiming = true;
        }
        if (aiming) {
          m.progress = Math.min(1, m.progress + dt / PHOTO_TIME);
          changed = true;
          if (m.progress >= 1) this._complete(m);
        } else if (m.progress > 0 && m.progress < 1) {
          m.progress = Math.max(0, m.progress - dt * 0.5);
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
