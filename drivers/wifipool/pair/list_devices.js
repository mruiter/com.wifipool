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
  publishLog('Pairing: view initialized, requesting device list');
  Homey.emit('list_devices', {}, (err, devices) => {
    if (err) {
      publishLog('Pairing: error retrieving devices', err);
      return Homey.alert(err);
    }

    publishLog('Pairing: received devices', devices);
    const list = document.getElementById('devices');
    devices.forEach(device => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = device.name;
      btn.addEventListener('click', () => {
        publishLog('Pairing: creating device', device);
        Homey.createDevice(device, (createErr) => {
          if (createErr) {
            publishLog('Pairing: error creating device', createErr);
            return Homey.alert(createErr);
          }

          publishLog('Pairing: device created successfully');
        });
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  });
});
