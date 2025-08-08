'use strict';

const { Driver } = require('homey');
const { login } = require('../../lib/wifipool.js');

class WiFiPoolDriver extends Driver {
  async onInit() {
    this.log('WiFi Pool driver initialized');

    const email = this.homey.settings.get('email');
    const password = this.homey.settings.get('password');

    if (!email || !password) {
      this.error('WiFi Pool credentials missing. Please configure email and password in the app settings.');
      return;
    }

    try {
      await login(email, password);
      this.log('WiFi Pool login successful');
    } catch (err) {
      this.error('WiFi Pool login failed', err);
    }
  }

  async onPairListDevices() {
    this.log('Pairing: listing available devices');

    try {
      const devices = [
        {
          name: 'WiFi Pool Sensor',
          data: { id: 'wifipool-1' }, // unieke ID binnen jouw app
          settings: { domain: '', io: 0 },
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
