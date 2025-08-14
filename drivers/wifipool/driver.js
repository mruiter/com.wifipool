// drivers/wifipool/driver.js — Homey SDK v3 (ESM)
import Homey from 'homey';
import { autoSetupCore } from '../../api.js';

export default class WiFiPoolDriver extends Homey.Driver {
  async onInit() {
    this.log('[WiFiPool][Driver] init');
  }

  // Built-in pairing flow ("pair": [{ "id": "list_devices" }])
  async onPairListDevices() {
    this.log('[WiFiPool][Driver] onPairListDevices called');
    try {
      const list = await this._buildDeviceList();
      this.log(`[WiFiPool][Driver] onPairListDevices → ${list.length} device(s)`);
      return list;
    } catch (err) {
      this.error('[WiFiPool][Driver] onPairListDevices failed', err);
      throw err; // propagate so UI shows an error instead of empty list
    }
  }

  // Session-based pairing (e.g. custom pair/start.html)
  async onPair(session) {
    this.log('[WiFiPool][Driver] onPair session started');
    // For custom UIs that call Homey.emit('list_devices')
    session.setHandler('list_devices', async () => {
      this.log('[WiFiPool][Driver] session.list_devices called');
      try {
        const list = await this._buildDeviceList();
        this.log(`[WiFiPool][Driver] session.list_devices → ${list.length} device(s)`);
        return list;
      } catch (err) {
        this.error('[WiFiPool][Driver] session.list_devices failed', err);
        throw err; // let the frontend display the error
      }
    });

    // For custom UIs that call Homey.emit('add_device')
    session.setHandler('add_device', async () => {
      this.log('[WiFiPool][Driver] session.add_device called');
      const list = await this._buildDeviceList();
      this.log(`[WiFiPool][Driver] session.add_device available → ${list.length}`);
      if (!list.length) {
        const err = new Error('No WiFiPool device discovered. Run Auto Setup in App Settings first.');
        this.error('[WiFiPool][Driver] add_device error', err);
        throw err;
      }
      // Return a single device-description object
      this.log('[WiFiPool][Driver] session.add_device returning device', list[0]);
      return list[0];
    });

    // For the default list view, Homey may call this with the selected devices
    session.setHandler('add_devices', async (devices) => {
      this.log('[WiFiPool][Driver] session.add_devices called', devices);
      return devices;
    });

    session.setHandler('disconnect', async () => {
      this.log('[WiFiPool][Driver] session disconnected');
      // optional: cleanup
    });

    // Ensure a UI is shown that triggers one of the handlers above
    try {
      await session.showView('list_devices');
    } catch (err) {
      this.error('[WiFiPool][Driver] showView failed', err);
    }
  }

  // ---- Build the list of pairable devices from app-level auto-setup
  async _buildDeviceList() {
    let domain = this.homey.settings.get('domain');
    let device_uuid = this.homey.settings.get('device_uuid');
    let io_map = this.homey.settings.get('io_map');
    this.log('[WiFiPool][Driver] _buildDeviceList settings', { domain, device_uuid, io_map });

    if (!domain || !device_uuid || !io_map) {
      this.log('[WiFiPool][Driver] Missing auto-setup data, attempting autoSetupCore');
      try {
        const found = await autoSetupCore(this.homey);
        domain = found.domain;
        device_uuid = found.device_uuid;
        io_map = found;
      } catch (err) {
        this.error('[WiFiPool][Driver] autoSetupCore failed', err);
        throw new Error('Auto Setup failed. Check credentials and network in App Settings.');
      }
    }

    if (!domain || !device_uuid || !io_map) {
      const err = new Error('Auto Setup did not provide complete data.');
      this.error('[WiFiPool][Driver] incomplete auto-setup data', err);
      throw err;
    }

    const name = this._makeName(io_map);

    // Return a single controller device. `data.id` must be unique.
    const device = {
      name,
      data: { id: device_uuid },
      // Persist useful context for the device
      store: { domain, device_uuid, io_map },
      settings: {},
    };
    this.log('[WiFiPool][Driver] _buildDeviceList device', device);
    return [device];
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
