import { PALETTE } from './RoverBuilder.js';
import { UPGRADES } from './Upgrades.js';

const MISSION_ICON = { collect: '🪨', reach: '📍', scan: '📡' };

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

      <div id="controls-hint">WASD / Arrow keys to drive</div>

      <div id="toast-area"></div>
      <div id="color-panel" class="side-panel hidden"></div>
      <div id="garage-panel" class="side-panel hidden"></div>
      <div id="modal-area"></div>
    `;

    this.root.querySelector('#color-btn').onclick = () => this._toggleColorPanel();
    this.root.querySelector('#garage-btn').onclick = () => this._toggleGarage();
    this._buildColorPanel();
    this._buildGaragePanel();
  }

  // ---- Top bar ----
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
    this.toast(`🛠️ New upgrade: ${upgrade.name}!`, upgrade.fact, 'upgrade');
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

  showIntro(planet, index, total) {
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
