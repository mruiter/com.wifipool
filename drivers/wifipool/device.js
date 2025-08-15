// drivers/wifipool/device.js — Homey SDK v3 (ESM)
import Homey from 'homey';
import fetch from 'node-fetch';

const BASE = 'https://api.wifipool.eu/native_mobile';

// Capabilities we expect on this device
const REQUIRED_CAPS = [
  'measure_ph',
  'measure_redox',
  'measure_flow',
  'measure_temperature',
  'alarm_health',
];

export default class WiFiPoolDevice extends Homey.Device {
  async onInit() {
    this.log('[WiFiPool][Device] init:', this.getName());

    // Ensure capabilities exist for already-paired devices
    await this._ensureCapabilities(REQUIRED_CAPS);

    // default poll interval if missing
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

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    if (changedKeys.includes('poll_interval')) {
      this.log('[WiFiPool][Device] poll_interval changed -> restart polling');
      await this._restartPolling();
    }
  }

  // ---- Capabilities guard (auto-add when missing)
  async _ensureCapabilities(list) {
    for (const cap of list) {
      if (!this.hasCapability(cap)) {
        try {
          await this.addCapability(cap);
          this.log(`[WiFiPool][Device] added missing capability: ${cap}`);
        } catch (e) {
          this.error(`[WiFiPool][Device] failed to add capability ${cap}:`, e?.message || e);
        }
      }
    }
  }

  // ----- Polling -----
  _startPolling() {
    this._stopPolling();
    const intervalSec = Number(this.getSetting('poll_interval')) || 60;
    // clamp to something reasonable
    const iv = Math.max(15, Math.min(600, intervalSec)) * 1000;
    this.log('[WiFiPool][Device] start polling every', iv / 1000, 's');

    // immediate poll, then interval
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
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];
      const d = it?.device_sensor_data?.analog;
      if (d) {
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
      if (d) {
        const key = Object.keys(d)[0];
        const v = Number(d[key]?.temperature);
        if (Number.isFinite(v)) return v;
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
    if (io_map.ph?.io) {
      try {
        const arr = await this._getStats(domain, io_map.ph.io, 0);
        const v = this._latestAnalog(arr);
        if (v != null && this.hasCapability('measure_ph')) {
          await this.setCapabilityValue('measure_ph', v);
        }
      } catch (e) { ok = false; this.error('pH poll error:', e?.message || e); }
    }

    // Redox (ORP)
    if (io_map.redox?.io) {
      try {
        const arr = await this._getStats(domain, io_map.redox.io, 0);
        const v = this._latestAnalog(arr);
        if (v != null && this.hasCapability('measure_redox')) {
          await this.setCapabilityValue('measure_redox', v);
        }
      } catch (e) { ok = false; this.error('redox poll error:', e?.message || e); }
    }

    // Flow
    if (io_map.flow?.io) {
      try {
        const arr = await this._getStats(domain, io_map.flow.io, 0);
        const v = this._latestAnalog(arr);
        if (v != null && this.hasCapability('measure_flow')) {
          await this.setCapabilityValue('measure_flow', v);
        }
      } catch (e) { ok = false; this.error('flow poll error:', e?.message || e); }
    }

    // Temperature (DS18B20)
    if (io_map.temperature?.io) {
      try {
        const arr = await this._getStats(domain, io_map.temperature.io, 0);
        const t = this._latestTemperature(arr);
        if (t != null && this.hasCapability('measure_temperature')) {
          await this.setCapabilityValue('measure_temperature', t);
        }
      } catch (e) { ok = false; this.error('temperature poll error:', e?.message || e); }
    }

    await this.setCapabilityValue('alarm_health', !ok).catch(() => {});
  }
}
