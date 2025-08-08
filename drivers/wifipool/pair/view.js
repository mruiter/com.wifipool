function publishLog(...args) {
  console.log(...args);
  const logEl = document.getElementById('log');
  if (logEl) {
    const msg = args
      .map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
      .join(' ');
    logEl.textContent += `${msg}\n`;
  }
}

Homey.on('init', () => {
  publishLog('Pairing: start view initialized');
  const nextBtn = document.getElementById('next');
  nextBtn.addEventListener('click', () => {
    publishLog('Pairing: next button clicked, showing device list');
    Homey.showView('list_devices');
  });
});
