'use strict';

const { Driver } = require('homey');
const { login } = require('../../lib/wifipool.js');

class WiFiPoolDriver extends Driver {
  async onInit() {
    this.log('WiFi Pool driver initialized');

    const email = this.homey.settings.get('email');
    const password = this.homey.settings.get('password');
    const ip = this.homey.settings.get('api_ip');

    if (email && password) {
      try {
        const { sensors } = await login(email, password, ip);
        if (Array.isArray(sensors) && sensors.length) {
          this.log('Initial login sensors', sensors);
        }
      } catch (err) {
        this.error('Initial login failed', err.message || err);
      }
    }
  }

  async onPairListDevices() {
    this.log('Pairing: listing available devices');

    const email = this.homey.settings.get('email');
    const password = this.homey.settings.get('password');
    const ip = this.homey.settings.get('api_ip');

    if (!email || !password) {
      throw new Error('Configure email and password in the app settings.');
    }

    try {
      const { domain, sensors } = await login(email, password, ip);
      if (Array.isArray(sensors) && sensors.length) {
        this.log('Pairing sensors', sensors);
      }
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
