const { Device } = require('homey');
const {
  getStats,
  extractLatestValue,
  getCookies
} = require('../../lib/wifipool.js');

const CAPABILITIES = [
  { id: 'measure_ph', key: '4' },
  { id: 'measure_water.flow', key: '5' },
  { id: 'measure_redox', key: '6' }
];

module.exports = class WiFiPoolDevice extends Device {
  async onInit() {
    this.log('WiFi Pool device initialized');

    // Voeg capabilities toe als ze nog niet aanwezig zijn
    for (const { id } of CAPABILITIES) {
      if (!this.hasCapability(id)) {
        await this.addCapability(id);
      }
    }

    // Initiele sensorupdate
    await this.updateSensors();

    // Herhaal elke 60 seconden
    this.setInterval(() => this.updateSensors(), 60 * 1000);
  }

  async updateSensors() {
    const { domain, io } = this.getSettings();
    const cookies = getCookies();

    if (!cookies) {
      this.error('No WiFi Pool authentication cookies available');
      return;
    }

    try {
      const data = await getStats(domain, io, cookies);

      for (const { id, key } of CAPABILITIES) {
        const value = extractLatestValue(data, key);
        if (value !== null) {
          await this.setCapabilityValue(id, value);
        }
      }
    } catch (err) {
      this.error('Failed to update sensors:', err.message || err);
    }
  }
};
