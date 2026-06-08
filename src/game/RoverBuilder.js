import { ROVER_SHAPES } from './Rover.js';
import { renderRoverThumbnails } from './roverThumbnails.js';

const PALETTE = [
  0xffce3a, 0xff5a3c, 0x4ad6ff, 0x6bff8a, 0xb06bff,
  0xff6bd0, 0xffffff, 0xff9e2c, 0x2c6bff, 0x9aa0a6,
];

const NAME_IDEAS = ['Pathfinder', 'Stardust', 'Nomad', 'Comet', 'Pioneer', 'Voyager', 'Apollo', 'Rover-9', 'Cosmo', 'Trailblazer'];

// Shows the start screen where the player designs, names and colours their rover.
// Resolves with { shape, name, color }.
export function runRoverBuilder() {
  return new Promise((resolve) => {
    let shape = 'perseverance';
    let color = PALETTE[0];
    const suggested = NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)];

    const root = document.createElement('div');
    root.className = 'builder';
    // Real NASA imagery: the multi-coloured spiral galaxy M83 (Southern
    // Pinwheel). BASE_URL keeps the path correct on both the custom domain and
    // GitHub project-pages deployments.
    const galaxy = `${import.meta.env.BASE_URL}images/galaxy-m83.jpg`;
    root.style.backgroundImage =
      `linear-gradient(rgba(3,5,12,0.62), rgba(3,5,12,0.82)), url('${galaxy}')`;
    root.innerHTML = `
      <div class="builder-card">
        <h1 class="title">Mission Across the Universe</h1>
        <p class="subtitle">Design your rover, then explore the solar system!</p>

        <div class="builder-section">
          <h3>1. Choose a body</h3>
          <div class="shape-row"></div>
        </div>

        <div class="builder-section">
          <h3>2. Name your rover</h3>
          <input id="rover-name" class="name-input" maxlength="18" placeholder="Name your rover" value="${suggested}" />
        </div>

        <div class="builder-section">
          <h3>3. Pick a colour</h3>
          <div class="swatch-row"></div>
          <label class="custom-color">Custom: <input type="color" id="custom-color" value="#ffce3a" /></label>
        </div>

        <button id="launch-btn" class="primary-btn">🚀 Launch Mission</button>
        <p class="builder-tip">You can recolour and upgrade your rover during the game.</p>
      </div>
      <p class="builder-credit">Background: Galaxy M83 · NASA / Hubble Space Telescope</p>
    `;
    document.body.appendChild(root);

    // Shape cards (with real 3D portraits of each rover)
    const thumbs = renderRoverThumbnails(ROVER_SHAPES);
    const shapeRow = root.querySelector('.shape-row');
    const shapeCards = {};
    for (const s of ROVER_SHAPES) {
      const card = document.createElement('button');
      card.className = 'shape-card';
      const icon = thumbs[s.id]
        ? `<img class="shape-photo" src="${thumbs[s.id]}" alt="${s.name}" />`
        : '';
      card.innerHTML = `<div class="shape-icon">${icon}</div><div class="shape-name">${s.name}</div><div class="shape-desc">${s.desc}</div>`;
      card.onclick = () => {
        shape = s.id;
        for (const c of Object.values(shapeCards)) c.classList.remove('selected');
        card.classList.add('selected');
      };
      shapeRow.appendChild(card);
      shapeCards[s.id] = card;
    }
    shapeCards.perseverance.classList.add('selected');

    // Swatches
    const swatchRow = root.querySelector('.swatch-row');
    const customInput = root.querySelector('#custom-color');
    const swatches = [];
    const selectColor = (hex, el) => {
      color = hex;
      swatches.forEach((s) => s.classList.remove('selected'));
      if (el) el.classList.add('selected');
      customInput.value = '#' + hex.toString(16).padStart(6, '0');
    };
    for (const hex of PALETTE) {
      const sw = document.createElement('button');
      sw.className = 'swatch';
      sw.style.background = '#' + hex.toString(16).padStart(6, '0');
      sw.onclick = () => selectColor(hex, sw);
      swatchRow.appendChild(sw);
      swatches.push(sw);
    }
    swatches[0].classList.add('selected');
    customInput.oninput = () => {
      color = parseInt(customInput.value.slice(1), 16);
      swatches.forEach((s) => s.classList.remove('selected'));
    };

    const nameInput = root.querySelector('#rover-name');
    root.querySelector('#launch-btn').onclick = () => {
      const name = (nameInput.value || 'Rover').trim().slice(0, 18) || 'Rover';
      root.remove();
      resolve({ shape, name, color });
    };
  });
}

export { PALETTE };
