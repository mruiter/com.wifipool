// drivers/wifipool/driver.js — Homey SDK v3 (ESM)
import Homey from 'homey';

export default class WiFiPoolDriver extends Homey.Driver {
  async onInit() {
    this.log('[WiFiPool][Driver] init');
  }

  // Built-in pairing flow ("pair": [{ "id": "list_devices" }])
  async onPairListDevices() {
    try {
      return await this._buildDeviceList();
    } catch (err) {
      this.error('[WiFiPool][Driver] onPairListDevices failed', err);
      return [];
    }
  }

  // Session-based pairing (e.g. custom pair/start.html)
  async onPair(session) {
    // For custom UIs that call Homey.emit('list_devices')
    session.setHandler('list_devices', async () => this._buildDeviceList());

    // For custom UIs that call Homey.emit('add_device')
    session.setHandler('add_device', async () => {
      const list = await this._buildDeviceList();
      if (!list.length) {
        throw new Error('No WiFiPool device discovered. Run Auto Setup in App Settings first.');
      }
      // Return a single device-description object
      return list[0];
    });

    // For the default list view, Homey may call this with the selected devices
    session.setHandler('add_devices', async (devices) => devices);

    session.setHandler('disconnect', async () => {
      // optional: cleanup
    });
  }

  // ---- Build the list of pairable devices from app-level auto-setup
  async _buildDeviceList() {
    const domain = this.homey.settings.get('domain');
    const device_uuid = this.homey.settings.get('device_uuid');
    const io_map = this.homey.settings.get('io_map');

    if (!domain || !device_uuid || !io_map) {
      this.log('[WiFiPool][Driver] No auto-setup data (domain/device_uuid/io_map) yet — returning empty list');
      return [];
    }

    const name = this._makeName(io_map);

    // Return a single controller device. `data.id` must be unique.
    return [{
      name,
      data: { id: device_uuid },
      // Persist useful context for the device
      store: { domain, device_uuid, io_map },
      settings: {},
    }];
  }

  _makeName(io_map) {
    const parts = ['WiFi Pool'];
    if (io_map.temperature) parts.push('Temp');
    if (io_map.ph) parts.push('pH');
    if (io_map.redox) parts.push('ORP');
    if (Array.isArray(io_map.switches) && io_map.switches.length) {
      parts.push(`${io_map.switches.length}xSwitch`);
    }
    return parts.join(' ');
  }
}
