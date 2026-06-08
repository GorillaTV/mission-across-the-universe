import { PALETTE } from './RoverBuilder.js';
import { UPGRADES } from './Upgrades.js';

const MISSION_ICON = { collect: '🪨', reach: '📍', scan: '📡', drill: '⛏️', photo: '📷' };
const MARKER_COLOR = { reach: '#44ffaa', scan: '#66ccff', drill: '#ffa033', photo: '#ff5577' };

export class Hud {
  constructor(root, callbacks = {}) {
    this.root = root;
    this.callbacks = callbacks;
    this.roverName = 'Rover';
    this._toastQueue = [];
    this._toastActive = false;
    this._build();
  }

  _build() {
    this.root.innerHTML = `
      <div id="topbar">
        <div class="planet-info">
          <span id="planet-index"></span>
          <span id="planet-name"></span>
        </div>
        <div class="top-actions">
          <span id="rover-tag"></span>
          <button id="color-btn" class="icon-btn" title="Change rover colour">🎨</button>
          <button id="garage-btn" class="icon-btn" title="Rover garage & upgrades">🛠️</button>
        </div>
      </div>

      <div id="missions-panel">
        <h2>Missions</h2>
        <ul id="mission-list"></ul>
      </div>

      <div id="heat-meter" class="hidden">
        <div class="heat-label">🌡️ HEAT</div>
        <div class="heat-track"><div id="heat-fill"></div></div>
      </div>

      <div id="minimap-wrap">
        <canvas id="minimap" width="180" height="180"></canvas>
        <div class="minimap-label">MAP</div>
      </div>

      <div id="dpad">
        <button class="dpad-btn dpad-up" data-dir="forward" aria-label="Forward">▲</button>
        <button class="dpad-btn dpad-left" data-dir="left" aria-label="Left">◀</button>
        <button class="dpad-btn dpad-right" data-dir="right" aria-label="Right">▶</button>
        <button class="dpad-btn dpad-down" data-dir="back" aria-label="Back">▼</button>
        <span class="dpad-hub"></span>
      </div>

      <div id="photo-dock" class="hidden">
        <div id="photo-roll"></div>
        <div class="photo-actions">
          <button id="take-photo-btn" class="photo-btn">📷 Take Photo</button>
          <button id="send-photos-btn" class="photo-btn send hidden">📡 Send to Mission Control</button>
        </div>
      </div>

      <div id="viewfinder" class="hidden">
        <span class="vf-corner tl"></span>
        <span class="vf-corner tr"></span>
        <span class="vf-corner bl"></span>
        <span class="vf-corner br"></span>
        <span class="vf-reticle"></span>
        <span id="vf-arrow">⬆</span>
        <div id="vf-hint"></div>
      </div>
      <div id="cam-flash"></div>

      <div id="toast-area"></div>
      <div id="color-panel" class="side-panel hidden"></div>
      <div id="garage-panel" class="side-panel hidden"></div>
      <div id="modal-area"></div>
    `;

    this.root.querySelector('#color-btn').onclick = () => this._toggleColorPanel();
    this.root.querySelector('#garage-btn').onclick = () => this._toggleGarage();
    this._buildColorPanel();
    this._buildGaragePanel();
    this._wireDpad();
    this._wirePhotos();

    this.miniCanvas = this.root.querySelector('#minimap');
    this.miniCtx = this.miniCanvas.getContext('2d');
  }

  // ---- Touch D-pad (iPad) ----
  _wireDpad() {
    const pad = this.root.querySelector('#dpad');
    const press = (dir, on) => this.callbacks.onDrive?.(dir, on);
    for (const btn of pad.querySelectorAll('.dpad-btn')) {
      const dir = btn.dataset.dir;
      const down = (e) => {
        e.preventDefault();
        btn.classList.add('active');
        press(dir, true);
        try { btn.setPointerCapture(e.pointerId); } catch {}
      };
      const up = (e) => {
        e.preventDefault();
        btn.classList.remove('active');
        press(dir, false);
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    // Show the pad once any touch happens (kept visible afterwards).
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      pad.classList.add('show');
    }
    window.addEventListener('touchstart', () => pad.classList.add('show'), { once: true, passive: true });
  }

  // ---- Photo album ----
  _wirePhotos() {
    this.photos = [];
    this.root.querySelector('#take-photo-btn').onclick = () => this.callbacks.onTakePhoto?.();
    this.root.querySelector('#send-photos-btn').onclick = () =>
      this.callbacks.onSendPhotos?.(this.photos.slice());
  }

  showPhotoControls(show) {
    this.root.querySelector('#photo-dock').classList.toggle('hidden', !show);
    if (!show) this.updatePhotoHint(null);
  }

  addPhoto({ thumb, caption, note }) {
    this.photos.push({ thumb, caption, note });
    const roll = this.root.querySelector('#photo-roll');
    const el = document.createElement('div');
    el.className = 'photo-thumb';
    el.title = note ? `${caption} - ${note}` : caption;
    el.innerHTML = `${thumb ? `<img src="${thumb}" alt="${caption}">` : ''}<span class="photo-cap">${caption}</span>`;
    roll.appendChild(el);
    roll.scrollLeft = roll.scrollWidth;
    requestAnimationFrame(() => el.classList.add('in'));
    this.root.querySelector('#send-photos-btn').classList.remove('hidden');
  }

  clearPhotos() {
    this.photos = [];
    const roll = this.root.querySelector('#photo-roll');
    if (roll) roll.innerHTML = '';
    const send = this.root.querySelector('#send-photos-btn');
    if (send) send.classList.add('hidden');
  }

  cameraFlash() {
    const f = this.root.querySelector('#cam-flash');
    if (!f) return;
    f.classList.remove('flash');
    void f.offsetWidth;
    f.classList.add('flash');
  }

  // Live framing guidance for a photo objective (or null to hide it).
  updatePhotoHint(state) {
    const vf = this.root.querySelector('#viewfinder');
    const btn = this.root.querySelector('#take-photo-btn');
    if (!state) {
      vf.classList.add('hidden');
      vf.classList.remove('ready');
      btn.classList.remove('ready');
      return;
    }
    vf.classList.remove('hidden');
    vf.classList.toggle('ready', state.ready);
    btn.classList.toggle('ready', state.ready);
    const hint = this.root.querySelector('#vf-hint');
    hint.textContent = (state.ready ? '✅ ' : '🎯 ') + state.message;
    // Arrow points toward the subject; hidden once framed.
    const arrow = this.root.querySelector('#vf-arrow');
    if (state.ready) {
      arrow.classList.add('hidden');
    } else {
      arrow.classList.remove('hidden');
      arrow.style.transform = `translate(-50%, -50%) rotate(${-state.angle}rad)`;
    }
  }
  setTopBar(planet, index, total, roverName) {
    this.roverName = roverName;
    this.root.querySelector('#planet-index').textContent = `World ${index + 1}/${total}`;
    this.root.querySelector('#planet-name').textContent = planet.name;
    this.root.querySelector('#rover-tag').textContent = `🛰️ ${roverName}`;
  }

  // ---- Missions panel ----
  renderMissions(snapshot) {
    const list = this.root.querySelector('#mission-list');
    list.innerHTML = '';
    for (const m of snapshot) {
      const li = document.createElement('li');
      li.className = 'mission' + (m.done ? ' done' : '');
      li.innerHTML = `
        <div class="mission-top">
          <span class="mission-check">${m.done ? '✅' : MISSION_ICON[m.type] || '•'}</span>
          <span class="mission-label">${m.label}</span>
          <span class="mission-detail">${m.detail}</span>
        </div>
        <div class="mission-bar"><div class="mission-bar-fill" style="width:${Math.round(m.progress * 100)}%"></div></div>
      `;
      list.appendChild(li);
    }
  }

  // ---- Mini-map ----
  updateMinimap(data) {
    const ctx = this.miniCtx;
    if (!ctx) return;
    const W = this.miniCanvas.width;
    const C = W / 2;
    const bounds = data.bounds || 70;
    const scale = (C - 10) / bounds;
    ctx.clearRect(0, 0, W, W);

    // boundary disc
    ctx.beginPath();
    ctx.arc(C, C, C - 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,16,28,0.72)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(120,180,255,0.5)';
    ctx.stroke();

    const toScreen = (wx, wz) => [C + wx * scale, C + wz * scale];

    // collectibles
    if (data.items) {
      ctx.fillStyle = '#ffe08a';
      for (const it of data.items) {
        if (it.picked) continue;
        const [sx, sy] = toScreen(it.mesh.position.x, it.mesh.position.z);
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // mission markers
    if (data.markers) {
      for (const mk of data.markers) {
        const [sx, sy] = toScreen(mk.x, mk.z);
        ctx.fillStyle = MARKER_COLOR[mk.type] || '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // rover (triangle pointing along heading)
    const [rx, ry] = toScreen(data.x, data.z);
    const fx = Math.sin(data.yaw);
    const fz = Math.cos(data.yaw);
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(Math.atan2(fx, fz));
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- Fact toasts ----
  toast(title, text, kind = 'fact') {
    this._toastQueue.push({ title, text, kind });
    this._nextToast();
  }

  _nextToast() {
    if (this._toastActive || this._toastQueue.length === 0) return;
    this._toastActive = true;
    const { title, text, kind } = this._toastQueue.shift();
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.innerHTML = `<div class="toast-title">${title}</div><div class="toast-text">${text}</div>`;
    this.root.querySelector('#toast-area').appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const dwell = kind === 'upgrade' ? 6500 : 5500;
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => {
        el.remove();
        this._toastActive = false;
        this._nextToast();
      }, 400);
    }, dwell);
  }

  // ---- Color panel ----
  _buildColorPanel() {
    const panel = this.root.querySelector('#color-panel');
    panel.innerHTML = `<h3>Rover Colour</h3><div class="swatch-row" id="hud-swatches"></div>
      <label class="custom-color">Custom <input type="color" id="hud-custom-color" /></label>`;
    const row = panel.querySelector('#hud-swatches');
    for (const hex of PALETTE) {
      const sw = document.createElement('button');
      sw.className = 'swatch';
      sw.style.background = '#' + hex.toString(16).padStart(6, '0');
      sw.onclick = () => this.callbacks.onColorChange?.(hex);
      row.appendChild(sw);
    }
    panel.querySelector('#hud-custom-color').oninput = (e) =>
      this.callbacks.onColorChange?.(parseInt(e.target.value.slice(1), 16));
  }

  _toggleColorPanel() {
    this.root.querySelector('#garage-panel').classList.add('hidden');
    this.root.querySelector('#color-panel').classList.toggle('hidden');
  }

  // ---- Garage / upgrades ----
  _buildGaragePanel() {
    this.setUpgrades(0);
  }

  setUpgrades(completedCount) {
    const panel = this.root.querySelector('#garage-panel');
    const rows = UPGRADES.map((u) => {
      const unlocked = completedCount >= u.threshold;
      return `<div class="upgrade-row ${unlocked ? 'unlocked' : 'locked'}">
        <div class="upgrade-head"><span>${unlocked ? '✅' : '🔒'} ${u.name}</span>
          <span class="upgrade-th">${unlocked ? 'Equipped' : `${u.threshold} missions`}</span></div>
        <div class="upgrade-effect">⚙️ ${u.effect}</div>
        <div class="upgrade-fact">${u.fact}</div>
      </div>`;
    }).join('');
    const done = UPGRADES.filter((u) => completedCount >= u.threshold).length;
    panel.innerHTML = `<h3>Rover Garage</h3>
      <p class="garage-sub">${done}/${UPGRADES.length} upgrades \u00b7 ${completedCount} missions complete</p>
      ${rows}`;
  }

  _toggleGarage() {
    this.root.querySelector('#color-panel').classList.add('hidden');
    this.root.querySelector('#garage-panel').classList.toggle('hidden');
  }

  showUpgrade(upgrade) {
    this.toast(`🛠️ New upgrade: ${upgrade.name}!`, `${upgrade.effect} ${upgrade.fact}`, 'upgrade');
    const btn = this.root.querySelector('#garage-btn');
    btn.classList.add('pulse');
    setTimeout(() => btn.classList.remove('pulse'), 4000);
  }

  // ---- Heat (Sun) ----
  showHeat(show) {
    this.root.querySelector('#heat-meter').classList.toggle('hidden', !show);
  }

  setHeat(v) {
    const fill = this.root.querySelector('#heat-fill');
    fill.style.width = `${Math.round(v * 100)}%`;
    fill.classList.toggle('danger', v > 0.75);
  }

  // ---- Modals ----
  _modal(html, buttonLabel) {
    return new Promise((resolve) => {
      const area = this.root.querySelector('#modal-area');
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `<div class="modal-card">${html}
        <button class="primary-btn modal-btn">${buttonLabel}</button></div>`;
      area.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));
      overlay.querySelector('.modal-btn').onclick = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
        resolve();
      };
    });
  }

  showIntro(planet, index, total, skip = false) {
    if (skip) return Promise.resolve();
    const facts = planet.facts.map((f) => `<li>${f}</li>`).join('');
    const missions = planet.missions.map((m) => `<li>${MISSION_ICON[m.type] || '•'} ${m.label}</li>`).join('');
    return this._modal(
      `<div class="modal-eyebrow">World ${index + 1} of ${total} \u00b7 ${planet.type}</div>
       <h1 class="modal-title">${planet.name}</h1>
       <p class="modal-intro">${planet.intro}</p>
       <div class="modal-cols">
         <div><h4>Did you know?</h4><ul class="fact-ul">${facts}</ul></div>
         <div><h4>Your missions</h4><ul class="mission-ul">${missions}</ul></div>
       </div>`,
      index === 0 ? '🚀 Begin' : '🛰️ Land & Explore'
    );
  }

  showCleared(planet, nextName) {
    return this._modal(
      `<div class="modal-eyebrow">Planet cleared!</div>
       <h1 class="modal-title">✅ ${planet.name} complete</h1>
       <p class="modal-intro">Great work, ${this.roverName}! All missions done.${nextName ? ` Next stop: <b>${nextName}</b>.` : ''}</p>`,
      nextName ? `Travel to ${nextName} →` : 'Finish'
    );
  }

  showWin(missionsCount, planetsCount) {
    return this._modal(
      `<div class="modal-eyebrow">Mission Complete</div>
       <h1 class="modal-title">🏆 You crossed the solar system!</h1>
       <p class="modal-intro">${this.roverName} explored <b>${planetsCount}</b> worlds and completed <b>${missionsCount}</b> missions, fully upgraded along the way. You learned about rocky planets, gas giants, ice giants, a dwarf planet and a star. Well done, explorer!</p>`,
      '🔄 Play Again'
    );
  }
}
