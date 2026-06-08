import * as THREE from 'three';
import { Rover } from './Rover.js';

// ---------------------------------------------------------------------------
// Renders a small 3D portrait of each actual rover model so the builder cards
// show the real hardware (Perseverance / Sojourner / Apollo LRV) instead of an
// abstract icon. We reuse the exact same Rover geometry that the player drives,
// so the thumbnail always matches what they get in-game.
// ---------------------------------------------------------------------------

// Representative real-world chassis tints used only for the portrait.
const THUMB_COLORS = {
  perseverance: 0xe7eaef,
  sojourner: 0xc7933f,
  lrv: 0xc2c6cc,
};

export function renderRoverThumbnails(shapes, size = 240) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
  } catch (e) {
    return {};
  }
  renderer.setSize(size, size);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x40454d, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(5, 7, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 0.6);
  rim.position.set(-6, 3, -4);
  scene.add(rim);

  const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const out = {};

  for (const s of shapes) {
    const rover = new Rover(scene);
    rover.configure({ shape: s.id, name: s.name, color: THUMB_COLORS[s.id] || 0xdddddd });

    const box = new THREE.Box3().setFromObject(rover.group);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = (sphere.radius / Math.sin((cam.fov * Math.PI) / 180 / 2)) * 1.08;
    const dirv = new THREE.Vector3(1, 0.62, 1.15).normalize();
    cam.position.copy(center).add(dirv.multiplyScalar(dist));
    cam.lookAt(center);

    renderer.render(scene, cam);
    out[s.id] = renderer.domElement.toDataURL('image/png');

    scene.remove(rover.group);
    rover.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
    });
  }

  renderer.dispose();
  return out;
}
