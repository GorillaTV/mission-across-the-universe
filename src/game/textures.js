import * as THREE from 'three';

// Procedural canvas textures so rocks and samples have real surface detail
// instead of looking like flat, identical primitives. Cached by key.

const cache = new Map();

function noiseCanvas(size, baseRGB, contrast, speckle) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Layered value noise via cheap sine hashing.
      let n = 0;
      let amp = 0.5;
      let f = 1 / 18;
      for (let o = 0; o < 4; o++) {
        const v = Math.sin(x * f * 1.7 + y * f * 0.9) * Math.cos(x * f * 0.6 - y * f * 1.3);
        n += (v * 0.5 + 0.5) * amp;
        amp *= 0.5;
        f *= 2.1;
      }
      n = Math.min(1, Math.max(0, (n - 0.5) * contrast + 0.5));
      // occasional bright/dark mineral speckles
      if (speckle && Math.random() < 0.015) n = Math.random() < 0.5 ? 0.15 : 0.95;
      const i = (y * size + x) * 4;
      d[i] = Math.min(255, baseRGB[0] * n + 20);
      d[i + 1] = Math.min(255, baseRGB[1] * n + 20);
      d[i + 2] = Math.min(255, baseRGB[2] * n + 20);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function makeRockTexture(color) {
  const key = 'rock-' + color.getHexString();
  if (cache.has(key)) return cache.get(key);
  const rgb = [color.r * 200 + 30, color.g * 200 + 30, color.b * 200 + 30];
  const tex = new THREE.CanvasTexture(noiseCanvas(128, rgb, 2.2, true));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

export function makeSampleTexture(color) {
  const key = 'sample-' + color.getHexString();
  if (cache.has(key)) return cache.get(key);
  const rgb = [color.r * 255, color.g * 255, color.b * 255];
  const tex = new THREE.CanvasTexture(noiseCanvas(96, rgb, 1.6, true));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

// Procedural planet surface used as a fallback when a texture image is missing
// or corrupt, so a bad file can never break a planet. `banded` draws horizontal
// cloud bands (gas giants); otherwise it produces a mottled rocky surface.
export function makePlanetTexture(color, banded = false) {
  const key = `planet-${banded ? 'b' : 'm'}-` + color.getHexString();
  if (cache.has(key)) return cache.get(key);
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const base = [color.r * 255, color.g * 255, color.b * 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n;
      if (banded) {
        // Horizontal bands with wavy turbulence for a gas-giant look.
        const warp = Math.sin(x * 0.05) * 6 + Math.sin(x * 0.013 + y * 0.02) * 4;
        const band = Math.sin((y + warp) * 0.16);
        n = 0.72 + band * 0.22 + (Math.sin(x * 0.5 + y) * 0.5 + 0.5) * 0.06;
      } else {
        let v = 0, amp = 0.5, f = 1 / 22;
        for (let o = 0; o < 4; o++) {
          v += (Math.sin(x * f * 1.7 + y * f * 0.9) * Math.cos(x * f * 0.6 - y * f * 1.3) * 0.5 + 0.5) * amp;
          amp *= 0.5; f *= 2.1;
        }
        n = 0.6 + (v - 0.5) * 0.8;
      }
      n = Math.min(1.15, Math.max(0.25, n));
      const i = (y * size + x) * 4;
      d[i] = Math.min(255, base[0] * n);
      d[i + 1] = Math.min(255, base[1] * n);
      d[i + 2] = Math.min(255, base[2] * n);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}
