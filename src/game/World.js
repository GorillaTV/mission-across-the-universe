import * as THREE from 'three';

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
  }

  async load(planet) {
    this.clear();
    const scene = this.scene;

    // Atmosphere / fog
    scene.fog = new THREE.FogExp2(planet.fog, planet.fogDensity);
    scene.background = new THREE.Color(planet.sky);

    // Lights
    const sun = new THREE.DirectionalLight(planet.light, planet.lightIntensity);
    sun.position.set(40, 60, 20);
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
    surfaceTex.wrapS = surfaceTex.wrapT = THREE.RepeatWrapping;
    surfaceTex.repeat.set(10, 10);
    const skyGeo = new THREE.SphereGeometry(600, 32, 32);
    const skyMat = new THREE.MeshBasicMaterial({ map: starTex, side: THREE.BackSide, fog: false });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this._add(this.sky);

    // Ground built from the planet's own surface map
    const groundMat = new THREE.MeshStandardMaterial({
      map: surfaceTex,
      color: planet.groundTint,
      roughness: 0.95,
      metalness: planet.type === 'Gas giant' || planet.type === 'Ice giant' ? 0.1 : 0.0,
    });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(85, 64), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this._add(ground);

    // A big version of the planet hanging in the sky for atmosphere
    const backdrop = new THREE.Mesh(
      new THREE.SphereGeometry(60, 48, 48),
      new THREE.MeshStandardMaterial({ map: surfaceTex.clone(), emissive: planet.id === 'sun' ? 0xff7a1a : 0x000000, emissiveIntensity: planet.id === 'sun' ? 0.6 : 0, fog: false })
    );
    backdrop.material.map.repeat.set(1, 1);
    backdrop.position.set(-120, 70, -260);
    this.planetBackdrop = backdrop;
    this._add(backdrop);

    // Scatter decorative boulders for depth
    this._scatterRocks(planet);

    return true;
  }

  _scatterRocks(planet) {
    const rockMat = new THREE.MeshStandardMaterial({ color: planet.groundTint, roughness: 1 });
    const geos = [
      new THREE.DodecahedronGeometry(1),
      new THREE.IcosahedronGeometry(1, 0),
    ];
    const count = 70;
    const group = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const g = geos[i % geos.length];
      const m = new THREE.Mesh(g, rockMat);
      const ang = Math.random() * Math.PI * 2;
      const rad = 8 + Math.random() * 74;
      const s = 0.4 + Math.random() * 1.8;
      m.position.set(Math.cos(ang) * rad, s * 0.3, Math.sin(ang) * rad);
      m.scale.setScalar(s);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      group.add(m);
    }
    this._add(group);
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
