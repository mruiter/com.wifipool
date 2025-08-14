// drivers/wifipool/pair/start.js
/* global Homey */
(() => {
  const $ = (id) => document.getElementById(id);
  const stepLogin = $('step-login');
  const stepDiscover = $('step-discover');
  const stepResult = $('step-result');
  const summary = $('summary');

  function show(el) {
    stepLogin.classList.add('hidden');
    stepDiscover.classList.add('hidden');
    stepResult.classList.add('hidden');
    el.classList.remove('hidden');
  }

  $('btnLogin').addEventListener('click', async () => {
    const email = $('email').value.trim();
    const password = $('password').value;
    if (!email || !password) {
      await Homey.alert('Please enter email & password.');
      return;
    }
    try {
      await Homey.emit('login', { email, password });
      await Homey.alert('Login OK');
      show(stepDiscover);
    } catch (e) {
      await Homey.alert(`Login failed: ${e && e.message ? e.message : e}`);
    }
  });

  $('btnBack').addEventListener('click', () => show(stepLogin));

  $('btnDiscover').addEventListener('click', async () => {
    try {
      const res = await Homey.emit('discover');
      const p = res.preview || {};
      const io = p.io_map || {};
      const switches = (io.switches || []).length;
      summary.textContent =
        `Name: ${res.name}\n` +
        `Domain: ${p.domain}\n` +
        `Device UUID: ${p.device_uuid}\n` +
        `Sensors: ${[
          io.temperature ? 'temperature' : null,
          io.ph ? 'pH' : null,
          io.redox ? 'redox' : null,
          io.flow ? 'flow' : null
        ].filter(Boolean).join(', ') || 'none'}\n` +
        `Switches: ${switches}`;
      show(stepResult);
    } catch (e) {
      await Homey.alert(`Discovery failed: ${e && e.message ? e.message : e}`);
    }
  });

  $('btnRedo').addEventListener('click', () => show(stepDiscover));

  $('btnCreate').addEventListener('click', async () => {
    try {
      const device = await Homey.emit('create');
      await Homey.createDevice(device);
      await Homey.done();
    } catch (e) {
      await Homey.alert(`Create failed: ${e && e.message ? e.message : e}`);
    }
  });
})();
