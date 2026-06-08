import { makeBeacon, makeScanTarget, makeDrillSite, makePhotoTarget } from './Collectible.js';

const REACH_RADIUS = 4.5;
// A "reach" beacon planted on a far landmark is clamped to this radius from the
// centre so it lands at the foot of the feature, inside the rover's ~70 unit
// drivable area (and on the mini-map).
const REACH_LANDMARK_RADIUS = 62;
const SCAN_RADIUS = 7;
const SCAN_TIME = 2.6; // seconds within range to finish a scan
const DRILL_RADIUS = 3.2;
const DRILL_TIME = 3.4; // seconds holding over a deposit
// Photo objectives frame a DISTANT landmark (e.g. a volcano on the horizon).
// Landmarks sit ~85-140 units from the centre while the rover is clamped to a
// ~70 unit radius, so the reachable distance to a landmark is roughly 60-210.
// The range below must span that or the shot can never line up.
const PHOTO_NEAR = 6;
const PHOTO_FAR = 220;
const PHOTO_AIM_ANGLE = 0.6; // radians (~34 deg) considered "facing the subject"

// Pull a far-off landmark position in along its bearing so a beacon planted on
// it sits within the rover's reachable radius. Closer landmarks are left alone.
function reachableLandmark(landmark) {
  const r = Math.hypot(landmark.x, landmark.z);
  if (r <= REACH_LANDMARK_RADIUS || r === 0) return landmark;
  const k = REACH_LANDMARK_RADIUS / r;
  return { x: landmark.x * k, z: landmark.z * k };
}

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
        // Landmarks sit far outside the drivable area (the rover is clamped to
        // a ~70 unit radius), so a beacon placed at the landmark centre can
        // never be reached. Pull it in along the same bearing to the foot of
        // the feature, where the rover can actually drive up to it.
        const beaconPos = useLm ? reachableLandmark(landmark) : null;
        const beacon = makeBeacon(0x44ffaa, this.bounds, terrain, beaconPos);
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

  // Fired by the HUD "Take Photo" button / P key. Snaps the first photo
  // objective the rover is currently lined up with. Returns the mission def
  // on success so the caller can show a flash/toast, or null if not lined up.
  takePhoto() {
    const m = this.missions.find((mm) => mm.type === 'photo' && !mm.done && mm.canPhoto);
    if (!m) return null;
    this._complete(m);
    return m.def;
  }

  // Live guidance for the HUD viewfinder. Returns the first active photo
  // objective's framing state, or null when there is no photo mission left.
  activePhotoState() {
    const m = this.missions.find((mm) => mm.type === 'photo' && !mm.done);
    if (!m || !m.marker) return null;
    const subject = m.def.subject || 'the subject';
    const status = m.photoStatus || 'far';
    const MESSAGES = {
      near: `Too close - back up to frame ${subject}`,
      far: `Drive closer to ${subject}`,
      turn_left: `Turn left toward ${subject}`,
      turn_right: `Turn right toward ${subject}`,
      ready: `${subject} framed - take the photo!`,
    };
    return {
      subject,
      status,
      ready: status === 'ready',
      angle: m.photoAngle || 0,
      message: MESSAGES[status] || `Find ${subject}`,
    };
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
      ready: !!m.canPhoto,
      progress: Math.min(1, m.progress),
      detail:
        m.type === 'collect'
          ? `${Math.min(m.count, m.target)}/${m.target}`
          : m.done
            ? 'done'
            : m.type === 'photo'
              ? (m.canPhoto ? '📷 ready' : 'line up the shot')
              : (m.type === 'scan' || m.type === 'drill')
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
        // Work out how the rover is lined up. We always compute the bearing to
        // the subject so the HUD can point the player the right way, even when
        // they are still far off.
        let rel = 0;
        if (roverForward) {
          const targetAngle = Math.atan2(dx, dz);
          const forwardAngle = Math.atan2(roverForward.x, roverForward.z);
          rel = targetAngle - forwardAngle;
          while (rel > Math.PI) rel -= Math.PI * 2;
          while (rel < -Math.PI) rel += Math.PI * 2;
        }
        let ready = false;
        let status;
        if (dist <= PHOTO_NEAR) {
          status = 'near';
        } else if (Math.abs(rel) > PHOTO_AIM_ANGLE) {
          // Turning the rover RIGHT decreases its heading angle, so a target at
          // a smaller (more negative) bearing than the rover is to the right.
          status = rel > 0 ? 'turn_left' : 'turn_right';
        } else if (dist >= PHOTO_FAR) {
          status = 'far';
        } else {
          ready = true;
          status = 'ready';
        }
        m.photoStatus = status;
        m.photoAngle = rel;
        m.photoDist = dist;
        if (ready !== m.canPhoto) {
          m.canPhoto = ready;
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
