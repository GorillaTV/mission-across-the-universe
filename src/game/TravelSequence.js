// A short cinematic "warp" between planets, rendered as a DOM overlay.
// Includes a map of the solar system so the player can see where they are
// leaving from and where they are heading next.
// Returns a promise that resolves when the animation finishes.

// Real solar-system layout (Sun on the left, bodies ordered outward). The
// game's journey visits these out of order, so the map highlights the leg you
// are flying. The Moon shares Earth's slot (it orbits Earth).
const BODIES = [
  { match: ['sun'], label: 'Sun', color: '#ffcf4a', r: 16, sun: true },
  { match: ['mercury'], label: 'Mercury', color: '#b9a48c', r: 5 },
  { match: ['venus'], label: 'Venus', color: '#e8c179', r: 7 },
  { match: ['earth', 'the moon', 'moon'], label: 'Earth', color: '#5aa6e8', r: 7, moon: true },
  { match: ['mars'], label: 'Mars', color: '#e07a4a', r: 6 },
  { match: ['jupiter'], label: 'Jupiter', color: '#d8a878', r: 13 },
  { match: ['saturn'], label: 'Saturn', color: '#e6cf94', r: 11, ring: true },
  { match: ['uranus'], label: 'Uranus', color: '#9fe3e0', r: 9 },
  { match: ['neptune'], label: 'Neptune', color: '#5a78d8', r: 9 },
  { match: ['pluto'], label: 'Pluto', color: '#cdbca6', r: 4 },
];

function bodyIndex(name) {
  const n = (name || '').trim().toLowerCase();
  return BODIES.findIndex((b) => b.match.includes(n));
}

function buildMap(fromName, toName) {
  const W = 760, H = 200;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'travel-map');

  const cy = H / 2 + 6;
  const x0 = 46;             // Sun centre
  const step = (W - x0 - 40) / (BODIES.length - 1);
  const xOf = (i) => x0 + i * step;

  const fromI = bodyIndex(fromName);
  const toI = bodyIndex(toName);

  // Orbit arcs.
  for (let i = 1; i < BODIES.length; i++) {
    const rx = xOf(i) - x0;
    const orbit = document.createElementNS(NS, 'ellipse');
    orbit.setAttribute('cx', x0);
    orbit.setAttribute('cy', cy);
    orbit.setAttribute('rx', rx);
    orbit.setAttribute('ry', rx * 0.34);
    orbit.setAttribute('class', 'travel-orbit');
    svg.appendChild(orbit);
  }

  // Bodies + labels.
  BODIES.forEach((b, i) => {
    const x = xOf(i);
    const isFrom = i === fromI;
    const isTo = i === toI;

    if (isTo) {
      const halo = document.createElementNS(NS, 'circle');
      halo.setAttribute('cx', x);
      halo.setAttribute('cy', cy);
      halo.setAttribute('r', b.r + 8);
      halo.setAttribute('class', 'travel-dest-halo');
      svg.appendChild(halo);
    }

    if (b.ring) {
      const ring = document.createElementNS(NS, 'ellipse');
      ring.setAttribute('cx', x);
      ring.setAttribute('cy', cy);
      ring.setAttribute('rx', b.r + 6);
      ring.setAttribute('ry', (b.r + 6) * 0.4);
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', b.color);
      ring.setAttribute('stroke-width', '2');
      ring.setAttribute('opacity', '0.8');
      svg.appendChild(ring);
    }

    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', cy);
    dot.setAttribute('r', b.r);
    dot.setAttribute('fill', b.color);
    dot.setAttribute('class', 'travel-body' + (b.sun ? ' travel-sun' : ''));
    svg.appendChild(dot);

    if (b.moon) {
      const moon = document.createElementNS(NS, 'circle');
      moon.setAttribute('cx', x + b.r + 5);
      moon.setAttribute('cy', cy - b.r - 3);
      moon.setAttribute('r', 2.6);
      moon.setAttribute('fill', '#cfd6e0');
      svg.appendChild(moon);
    }

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', x);
    label.setAttribute('y', cy + b.r + 18);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'travel-label' + (isTo ? ' to' : isFrom ? ' from' : ''));
    // The Moon shares Earth's slot - show its real name on the journey legs.
    const showName = (b.moon && /moon/i.test(`${fromName} ${toName}`)) ? 'Earth / Moon' : b.label;
    label.textContent = showName;
    svg.appendChild(label);
  });

  // Animated rocket flying from the source body to the destination body.
  let rocket = null;
  if (fromI >= 0 && toI >= 0) {
    rocket = document.createElementNS(NS, 'text');
    rocket.setAttribute('class', 'travel-rocket');
    rocket.setAttribute('text-anchor', 'middle');
    rocket.setAttribute('font-size', '22');
    rocket.textContent = '\uD83D\uDE80';
    svg.appendChild(rocket);
    rocket.__from = xOf(fromI);
    rocket.__to = xOf(toI);
    rocket.__cy = cy - 22;
  }

  return { svg, rocket };
}

export function travel(fromName, toName, duration = 3600) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'travel-overlay';

    const stars = document.createElement('div');
    stars.className = 'warp-stars';
    for (let i = 0; i < 70; i++) {
      const s = document.createElement('span');
      const angle = Math.random() * 360;
      const delay = Math.random() * 0.8;
      const dur = 0.6 + Math.random() * 0.8;
      s.style.setProperty('--angle', `${angle}deg`);
      s.style.animationDelay = `${delay}s`;
      s.style.animationDuration = `${dur}s`;
      stars.appendChild(s);
    }
    overlay.appendChild(stars);

    const text = document.createElement('div');
    text.className = 'travel-text';
    text.innerHTML = `<div class="travel-small">Leaving ${fromName}</div>
      <div class="travel-big">Travelling to</div>
      <div class="travel-dest">${toName}</div>`;
    overlay.appendChild(text);

    const { svg, rocket } = buildMap(fromName, toName);
    overlay.appendChild(svg);

    document.body.appendChild(overlay);

    // Fly the rocket from source to destination across the trip.
    if (rocket && rocket.animate) {
      const x0 = rocket.__from, x1 = rocket.__to, midY = rocket.__cy;
      rocket.animate(
        [
          { transform: `translate(${x0}px, ${midY}px)`, offset: 0 },
          { transform: `translate(${(x0 + x1) / 2}px, ${midY - 18}px)`, offset: 0.5 },
          { transform: `translate(${x1}px, ${midY}px)`, offset: 1 },
        ],
        { duration: duration - 700, easing: 'ease-in-out', fill: 'forwards' }
      );
    }

    setTimeout(() => overlay.classList.add('fade'), duration - 600);
    setTimeout(() => {
      overlay.remove();
      resolve();
    }, duration);
  });
}
