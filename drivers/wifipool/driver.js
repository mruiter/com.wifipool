'use strict';

const { Driver } = require('homey');
const { login } = require('../../lib/wifipool.js');

class WiFiPoolDriver extends Driver {
  async onInit() {
    this.log('WiFi Pool driver initialized');
  }

  async onPairListDevices() {
    this.log('Pairing: listing available devices');

    const email = this.homey.settings.get('email');
    const password = this.homey.settings.get('password');

    if (!email || !password) {
      throw new Error('Configure email and password in the app settings.');
    }

    try {
      const { domain } = await login(email, password);
      const devices = [
        {
          name: 'WiFi Pool Sensor',
          data: { id: 'wifipool-1' },
          settings: { domain },
        },
      ];
      this.log('Pairing: found', devices.length, 'device(s)');
      return devices;
    } catch (err) {
      this.error('Pairing: failed to list devices', err);
      throw err;
    }
  }
}

module.exports = WiFiPoolDriver;
