import { Device } from 'homey';
import { getStats, extractLatestValue, getCookies } from '../../lib/wifipool.js';

const CAPABILITIES = [
  { id: 'measure_ph', key: '4' },
  { id: 'measure_flow', key: '5' },
  { id: 'measure_redox', key: '6' }
];

export default class WiFiPoolDevice extends Device {
  async onInit() {
    this.log('WiFi Pool device initialized');
    for (const { id } of CAPABILITIES) {
      if (!this.hasCapability(id)) {
        await this.addCapability(id);
      }
    }
    await this.updateSensors();
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
        if (value !== null) await this.setCapabilityValue(id, value);
      }
    } catch (err) {
      this.error('Failed to update sensors', err);
    }
  }
}
