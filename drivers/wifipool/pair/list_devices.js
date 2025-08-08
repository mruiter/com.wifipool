Homey.on('init', () => {
  console.log('Pairing: view initialized, requesting device list');
  Homey.emit('list_devices', {}, (err, devices) => {
    if (err) {
      console.error('Pairing: error retrieving devices', err);
      return Homey.alert(err);
    }

    console.log('Pairing: received devices', devices);
    const list = document.getElementById('devices');
    devices.forEach(device => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = device.name;
      btn.addEventListener('click', () => {
        console.log('Pairing: creating device', device);
        Homey.createDevice(device, (createErr) => {
          if (createErr) {
            console.error('Pairing: error creating device', createErr);
            return Homey.alert(createErr);
          }

          console.log('Pairing: device created successfully');
        });
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  });
});
