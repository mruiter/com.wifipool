// drivers/wifipool/device.js — Homey SDK v3 (ESM)
import Homey from 'homey';
import fetch from 'node-fetch';

const BASE = 'https://api.wifipool.eu/native_mobile';

export default class WiFiPoolDevice extends Homey.Device {
  async onInit() {
    this.log('[WiFiPool][Device] init:', this.getName());

    // Ensure default poll interval
    if (this.getSetting('poll_interval') == null) {
      await this.setSettings({ poll_interval: 60 });
    }

    this._cookie = null;
    this._cookieUntil = 0;
    this._pollTimer = null;

    this._startPolling();
  }

  async onAdded() {
    this._startPolling();
  }

  async onDeleted() {
    this._stopPolling();
  }

  async onSettings({ changedKeys }) {
    if (changedKeys.includes('poll_interval')) {
      this.log('[WiFiPool][Device] poll_interval changed -> restart polling');
      await this._restartPolling();
    }
  }

  // ----- Polling -----
  _startPolling() {
    this._stopPolling();
    const intervalSec = Number(this.getSetting('poll_interval')) || 60;
    const iv = Math.max(15, Math.min(600, intervalSec)) * 1000;

    this.log('[WiFiPool][Device] start polling every', iv / 1000, 's');

    // Immediate poll, then interval
    this._pollOnce().catch(err =>
      this.error('[WiFiPool][Device] initial poll error:', err?.message || err)
    );

    this._pollTimer = setInterval(() => {
      this._pollOnce().catch(err =>
        this.error('[WiFiPool][Device] poll error:', err?.message || err)
      );
    }, iv);
  }

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  async _restartPolling() {
    this._stopPolling();
    this._startPolling();
  }

  // ----- HTTP helpers -----
  async _httpRequest(method, resource, { body, cookie } = {}) {
    const url = `${BASE}${resource}`;
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
    return { status: res.status, json, text, headers: res.headers };
  }

  _extractSessionCookie(setCookie) {
    if (!setCookie) return null;
    const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const c of arr) {
      const m = String(c).match(/connect\.sid=([^;]+)/);
      if (m) return `connect.sid=${m[1]}`;
    }
    return null;
  }

  async _ensureLogin() {
    const now = Date.now();
    if (this._cookie && now < this._cookieUntil) {
      return this._cookie;
    }

    const email = this.homey.settings.get('email');
    const password = this.homey.settings.get('password');
    if (!email || !password) throw new Error('Email/Password not configured in App Settings');

    const r = await this._httpRequest('POST', '/users/login', {
      body: { email, namespace: 'default', password }
    });
    if (r.status !== 200) throw new Error(`Login failed: HTTP ${r.status}`);

    const rawSetCookie = r.headers?.raw?.()['set-cookie'] || r.headers?.get?.('set-cookie');
    const cookie = this._extractSessionCookie(rawSetCookie);
    if (!cookie) throw new Error('No connect.sid cookie returned');

    // Cache cookie for ~15 min
    this._cookie = cookie;
    this._cookieUntil = now + 15 * 60 * 1000;
    return cookie;
  }

  async _getStats(domain, io, after = 0) {
    const cookie = await this._ensureLogin();
    const r = await this._httpRequest('POST', '/harmopool/getStats', {
      cookie, body: { domain, io, after }
    });
    if (r.status === 404) {
      this.log('[WiFiPool][Device] unknown io ->', io);
      return [];
    }
    if (r.status !== 200) throw new Error(`getStats failed ${io}: HTTP ${r.status}`);
    return Array.isArray(r.json) ? r.json : [];
  }

  // ----- Data extraction helpers -----
  _latestAnalog(arr) {
    // Walk newest-first; return first valid analog number
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];
      const d = it?.device_sensor_data?.analog;
      if (d && typeof d === 'object') {
        const k = Object.keys(d)[0];
        const v = Number(d[k]);
        if (Number.isFinite(v)) return v;
      }
    }
    return null;
  }

  _latestTemperature(arr) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const d = arr[i]?.device_sensor_data?.ds18b20;
      if (d && typeof d === 'object') {
        const key = Object.keys(d)[0];
        const v = Number(d[key]?.temperature);
        if (Number.isFinite(v)) return v;
      }
    }
    return null;
  }

  _toBool(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v > 0;
    if (typeof v === 'string') {
      const s = v.toLowerCase();
      if (s === 'on' || s === 'true' || s === '1') return true;
      if (s === 'off' || s === 'false' || s === '0') return false;
      const n = Number(v);
      if (Number.isFinite(n)) return n > 0;
    }
    return null;
  }

  /**
   * Derive "flow present?" boolean from stats.
   * Priority:
   *  1) device_sensor_data.switch  -> any truthy => flow = true
   *  2) device_state_data.power    -> numeric > 0 => flow = true
   *  3) device_sensor_data.analog  -> numeric > 0 => flow = true
   * Returns true/false or null if undecidable.
   */
  _flowFromStats(arr) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];

      const sw = it?.device_sensor_data?.switch;
      if (sw && typeof sw === 'object') {
        const key = Object.keys(sw)[0];
        const b = this._toBool(sw[key]);
        if (b !== null) return b;
      }

      const p = it?.device_state_data?.power;
      if (p && typeof p === 'object') {
        const key = Object.keys(p)[0];
        const n = Number(p[key]);
        if (Number.isFinite(n)) return n > 0;
      }

      const an = it?.device_sensor_data?.analog;
      if (an && typeof an === 'object') {
        const key = Object.keys(an)[0];
        const n = Number(an[key]);
        if (Number.isFinite(n)) return n > 0;
      }
    }
    return null;
  }

  // ----- One poll round -----
  async _pollOnce() {
    const store = this.getStore() || {};
    const domain = store.domain;
    const io_map = store.io_map || {};

    if (!domain || !io_map) {
      this.log('[WiFiPool][Device] missing domain/io_map in store — skip poll');
      await this.setCapabilityValue('alarm_health', true).catch(() => {});
      return;
    }

    let ok = true;

    // pH
    if (io_map.ph?.io && this.hasCapability('measure_ph')) {
      try {
        const arr = await this._getStats(domain, io_map.ph.io, 0);
        const v = this._latestAnalog(arr);
        if (v != null) await this.setCapabilityValue('measure_ph', v);
      } catch (e) { ok = false; this.error('pH poll error:', e?.message || e); }
    }

    // Redox (ORP)
    if (io_map.redox?.io && this.hasCapability('measure_redox')) {
      try {
        const arr = await this._getStats(domain, io_map.redox.io, 0);
        const v = this._latestAnalog(arr);
        if (v != null) await this.setCapabilityValue('measure_redox', v);
      } catch (e) { ok = false; this.error('redox poll error:', e?.message || e); }
    }

    // Flow — boolean alarm_flow (fallback to legacy numeric measure_flow if present)
    if (io_map.flow?.io && (this.hasCapability('alarm_flow') || this.hasCapability('measure_flow'))) {
      try {
        const arr = await this._getStats(domain, io_map.flow.io, 0);
        const flowBool = this._flowFromStats(arr);
        if (flowBool !== null) {
          if (this.hasCapability('alarm_flow')) {
            await this.setCapabilityValue('alarm_flow', flowBool);
          } else if (this.hasCapability('measure_flow')) {
            // legacy support: 0/1 numeric
            await this.setCapabilityValue('measure_flow', flowBool ? 1 : 0);
          }
        }
      } catch (e) { ok = false; this.error('flow poll error:', e?.message || e); }
    }

    // Temperature (DS18B20)
    if (io_map.temperature?.io && this.hasCapability('measure_temperature')) {
      try {
        const arr = await this._getStats(domain, io_map.temperature.io, 0);
        const t = this._latestTemperature(arr);
        if (t != null) await this.setCapabilityValue('measure_temperature', t);
      } catch (e) { ok = false; this.error('temperature poll error:', e?.message || e); }
    }

    await this.setCapabilityValue('alarm_health', !ok).catch(() => {});
  }
}
