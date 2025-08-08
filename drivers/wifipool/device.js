'use strict';

const { Device } = require('homey');
const {
  login,
  getStats,
  extractAnalog,
  extractSwitch,
} = require('../../lib/wifipool.js');

// IO identifiers taken from the Home Assistant integration
const IO_PH = 'e61d476d-bbd0-4527-a9f5-ef0170caa33c.o3';
const IO_FLOW = 'e61d476d-bbd0-4527-a9f5-ef0170caa33c.o0';
const IO_REDOX = 'e61d476d-bbd0-4527-a9f5-ef0170caa33c.o4';

class WiFiPoolDevice extends Device {
  async onInit() {
    this.log('WiFi Pool device initialized');

    const capabilities = ['measure_ph', 'measure_water_flow', 'measure_redox'];
    for (const id of capabilities) {
      if (!this.hasCapability(id)) {
        await this.addCapability(id);
      }
    }

    await this.updateSensors();
    this.setInterval(() => this.updateSensors(), 60 * 1000);
  }

  async updateSensors() {
    const email = this.homey.settings.get('email');
    const password = this.homey.settings.get('password');

    if (!email || !password) {
      this.error('WiFi Pool credentials missing. Please configure them in the app settings.');
      return;
    }

    try {
      const { cookies, domain: loginDomain } = await login(email, password);
      const domain = this.getSettings().domain || loginDomain;

      await this.updatePh(domain, cookies);
      await this.updateFlow(domain, cookies);
      await this.updateRedox(domain, cookies);
    } catch (err) {
      this.error('Failed to update sensors:', err.message || err);
    }
  }

  async updatePh(domain, cookies) {
    const data = await getStats(domain, IO_PH, cookies);
    const value = extractAnalog(data, '4');
    if (value !== null) {
      await this.setCapabilityValue('measure_ph', value);
    }
  }

  async updateFlow(domain, cookies) {
    const data = await getStats(domain, IO_FLOW, cookies);
    const value = extractSwitch(data, '1');
    if (value !== null) {
      await this.setCapabilityValue('measure_water_flow', value);
    }
  }

  async updateRedox(domain, cookies) {
    const data = await getStats(domain, IO_REDOX, cookies);
    const value = extractAnalog(data, '1');
    if (value !== null) {
      await this.setCapabilityValue('measure_redox', value);
    }
  }
}

module.exports = WiFiPoolDevice;

