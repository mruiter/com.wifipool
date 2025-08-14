// drivers/wifipool/device.js  (ESM)
import Homey from 'homey';
import WiFiPoolClient from '../../lib/wifipool.mjs';

export default class WiFiPoolDevice extends Homey.Device {
  async onInit() {
    this._tag = '[WiFiPool][Device]';
    this.log(`${this._tag} init: ${this.getName()}`);

    const pollSec = Number(this.homey.settings.get('poll_interval') || 60);
    this._pollMs = Math.max(15, pollSec) * 1000;

    this._client = new WiFiPoolClient(this.homey, undefined, true);

    await this._pollOnce().catch(err => this.error(`${this._tag} first poll error`, err));
    this._timer = this.homey.setInterval(() => {
      this._pollOnce().catch(err => this.error(`${this._tag} poll error`, err));
    }, this._pollMs);
  }

  async onUninit() {
    if (this._timer) this.homey.clearInterval(this._timer);
  }

  async _pollOnce() {
    const keys = this.homey.settings.getKeys();
    const s = {};
    for (const k of keys) s[k] = this.homey.settings.get(k);

    const email = s.email, password = s.password, domain = s.domain;
    const io = s.io_map || {};

    if (!email || !password || !domain) {
      this.log(`${this._tag} missing email/password/domain → skip`);
      await this._health(true);
      return;
    }

    try {
      if (typeof this._client.ensureLogin === 'function') {
        await this._client.ensureLogin(email, password);
      } else {
        await this._client.login(email, password);
      }

      const updates = {};

      if (io.ph) {
        const v = await this._readAnalog(domain, io.ph);
        if (v != null) updates.measure_ph = Number(v);
      }

      if (io.redox) {
        const v = await this._readAnalog(domain, io.redox);
        if (v != null) updates.measure_redox = Number(v);
      }

      if (io.flow) {
        const v = await this._readAnalog(domain, io.flow);
        if (v != null) updates.measure_flow = Number(v);
      }

      if (io.temperature && this.hasCapability('measure_temperature')) {
        const t = await this._readDs18b20(domain, io.temperature);
        if (t != null) updates.measure_temperature = Number(t);
      }

      for (const [cap, val] of Object.entries(updates)) {
        if (this.hasCapability(cap)) {
          const prev = this.getCapabilityValue(cap);
          if (prev !== val) {
            await this.setCapabilityValue(cap, val);
            try {
              const map = { measure_ph: 'ph_updated', measure_redox: 'redox_updated', measure_flow: 'flow_updated' };
              const trigId = map[cap];
              if (trigId && this.homey?.flow?.getTriggerCard) {
                const trig = this.homey.flow.getTriggerCard(trigId);
                if (trig) await trig.trigger(this, { value: val });
              }
            } catch (e) { this.error(`${this._tag} flow trigger error`, e); }
          }
        }
      }

      await this._health(false);
    } catch (err) {
      this.error(`${this._tag} poll failed`, err);
      await this._health(true);
    }
  }

  async _readAnalog(domain, io) {
    const list = await this._client.getStats(domain, io, 0);
    if (!Array.isArray(list) || list.length === 0) return null;
    const lastAnalog = list[list.length - 1]?.device_sensor_data?.analog;
    if (!lastAnalog) return null;
    const k = Object.keys(lastAnalog).find(k => typeof lastAnalog[k] === 'number');
    return k ? lastAnalog[k] : null;
  }

  async _readDs18b20(domain, io) {
    const list = await this._client.getStats(domain, io, 0);
    if (!Array.isArray(list) || list.length === 0) return null;
    const last = list[list.length - 1]?.device_sensor_data?.ds18b20;
    if (!last) return null;
    const key = Object.keys(last).find(k => typeof last[k]?.temperature === 'number');
    return key ? last[key].temperature : null;
  }

  async _health(on) {
    if (!this.hasCapability('alarm_health')) return;
    const cur = !!this.getCapabilityValue('alarm_health');
    if (cur !== !!on) await this.setCapabilityValue('alarm_health', !!on);
  }
}
