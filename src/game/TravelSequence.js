// A short cinematic "warp" between planets, rendered as a DOM overlay.
// Returns a promise that resolves when the animation finishes.

export function travel(fromName, toName, duration = 3200) {
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

    document.body.appendChild(overlay);

    // Fade out near the end
    setTimeout(() => overlay.classList.add('fade'), duration - 600);
    setTimeout(() => {
      overlay.remove();
      resolve();
    }, duration);
  });
}
