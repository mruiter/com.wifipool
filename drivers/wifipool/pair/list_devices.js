Homey.on('init', () => {
  Homey.emit('list_devices', {}, (err, devices) => {
    if (err) {
      return Homey.alert(err);
    }

    const list = document.getElementById('devices');
    devices.forEach(device => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = device.name;
      btn.addEventListener('click', () => {
        Homey.createDevice(device, (createErr) => {
          if (createErr) {
            return Homey.alert(createErr);
          }
        });
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  });
});
