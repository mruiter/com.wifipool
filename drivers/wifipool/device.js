// drivers/wifipool/device.js — Homey SDK v3 (ESM)
import Homey from 'homey';
import fetch from 'node-fetch';

const BASE = 'https://api.wifipool.eu/native_mobile';

export default class WiFiPoolDevice extends Homey.Device {
  async onInit() {
    this.log('[WiFiPool][Device] init');

    this._cookie = null;
    this._afterByIo = Object.create(null); // per-IO watermark
    this._pollTimer = null;

    // Default poll interval (seconds)
    if (this.getSetting('poll_interval') == null) {
      await this.setSettings({ poll_interval: 60 });
    }

    const store = this.getStore() || {};
    if (!store.domain || !store.io_map) {
      this.error('[WiFiPool][Device] Missing domain/io_map in device store. Complete pairing first.');
      await this.setUnavailable('Not configured');
      return;
    } else {
      await this.setAvailable();
    }

    await this._restartPolling();
  }

  async onUninit() { this._clearPollTimer(); }
  async onAdded() { this.log('[WiFiPool][Device] added'); }
  async onDeleted() { this._clearPollTimer(); this.log('[WiFiPool][Device] deleted'); }

  async onSettings({ changedKeys, newSettings }) {
    if (changedKeys.includes('poll_interval')) {
      this.log(`[WiFiPool][Device] Polling interval -> ${newSettings.poll_interval}s`);
      await this._restartPolling();
    }
  }

  // ---- Polling ---------------------------------------------------------------

  _clearPollTimer() {
    if (this._pollTimer) {
      this.homey.clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  _getIntervalMs() {
    const sec = Number(this.getSetting('poll_interval')) || 60;
    const clamped = Math.max(10, Math.min(sec, 3600));
    return clamped * 1000;
  }

  async _restartPolling() {
    this._clearPollTimer();

    try {
      await this._pollOnce(); // immediate
    } catch (err) {
      this.error('[WiFiPool][Device] Initial poll failed:', err?.message || err);
    }

    this._pollTimer = this.homey.setInterval(async () => {
      try {
        await this._pollOnce();
      } catch (err) {
        this.error('[WiFiPool][Device] Poll failed:', err?.message || err);
      }
    }, this._getIntervalMs());
  }

  // ---- Core poll -------------------------------------------------------------

  async _pollOnce() {
    const { domain, io_map } = this.getStore() || {};
    if (!domain || !io_map) {
      await this.setUnavailable('Not configured');
      return;
    }

    try {
      await this._ensureLogin();

      // pH (analog)
      if (io_map.ph?.io && io_map.ph?.key && this.hasCapability('measure_ph')) {
        const v = await this._fetchAnalogLatest(domain, io_map.ph.io, io_map.ph.key);
        if (v != null && Number.isFinite(v)) {
          await this._safeSetCapabilityValue('measure_ph', Number(v));
        }
      }

      // Redox / ORP (analog)
      if (io_map.redox?.io && io_map.redox?.key && this.hasCapability('measure_redox')) {
        const v = await this._fetchAnalogLatest(domain, io_map.redox.io, io_map.redox.key);
        if (v != null && Number.isFinite(v)) {
          await this._safeSetCapabilityValue('measure_redox', Number(v));
        }
      }

      // Flow (analog or power fallback)
      if (io_map.flow?.io && io_map.flow?.key && this.hasCapability('measure_flow')) {
        const v = await this._fetchAnalogLatest(domain, io_map.flow.io, io_map.flow.key);
        if (v != null && Number.isFinite(v)) {
          await this._safeSetCapabilityValue('measure_flow', Number(v));
        }
      }

      // Temperature (DS18B20)
      if (io_map.temperature?.io && io_map.temperature?.key && this.hasCapability('measure_temperature')) {
        const t = await this._fetchDs18b20Latest(domain, io_map.temperature.io, io_map.temperature.key);
        if (t != null && Number.isFinite(t)) {
          await this._safeSetCapabilityValue('measure_temperature', Number(t));
        }
      }

      if (this.hasCapability('alarm_health')) {
        await this._safeSetCapabilityValue('alarm_health', false);
      }
      await this.setAvailable();
    } catch (err) {
      const msg = String(err?.message || err);
      this.error('[WiFiPool][Device] poll error:', msg);

      // Re-login on auth issues
      if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
        this._cookie = null;
      }
      if (this.hasCapability('alarm_health')) {
        await this._safeSetCapabilityValue('alarm_health', true);
      }
      if (/Not configured/i.test(msg)) {
        await this.setUnavailable('Not configured');
      } else {
        await this.setAvailable(); // remain available; show alarm
      }
    }
  }

  // ---- WiFiPool helpers ------------------------------------------------------

  async _ensureLogin() {
    if (this._cookie) return;

    const email = this.homey.settings.get('email');
    const password = this.homey.settings.get('password');
    if (!email || !password) throw new Error('Not configured: missing email/password in App Settings');

    const res = await this._httpRequest('POST', '/users/login', {
      body: { email, namespace: 'default', password },
    });
    if (res.status !== 200) throw new Error(`Login failed: HTTP ${res.status}`);

    const cookie = this._extractSessionCookie(res.setCookie);
    if (!cookie) throw new Error('Login OK but no connect.sid cookie received');

    this._cookie = cookie;
    this.log('[WiFiPool][Device] Login OK, session cookie set');
  }

  async _fetchAnalogLatest(domain, io, key) {
    const arr = await this._getStatsLatest(domain, io);
    if (!arr) return null;

    // Prefer analog[key]
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      const v = arr[i]?.device_sensor_data?.analog?.[key];
      if (v != null && Number.isFinite(Number(v))) return Number(v);
    }
    // Fallback: power[key]
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      const v = arr[i]?.device_state_data?.power?.[key];
      if (v != null && Number.isFinite(Number(v))) return Number(v);
    }
    return null;
  }

  async _fetchDs18b20Latest(domain, io, key) {
    const arr = await this._getStatsLatest(domain, io);
    if (!arr) return null;

    for (let i = arr.length - 1; i >= 0; i -= 1) {
      const node = arr[i]?.device_sensor_data?.ds18b20?.[key];
      const temp = node?.temperature;
      if (temp != null && Number.isFinite(Number(temp))) return Number(temp);
    }
    return null;
  }

  /**
   * Get stats for an IO with a robust "after" policy:
   *  - First try with millisecond epoch
   *  - If the server returns [] (or nothing), retry with second epoch
   *  - Advance the watermark to "now" after any successful call
   */
  async _getStatsLatest(domain, io) {
    // Initial watermark: 24h lookback
    const initialAfterMs = this._afterByIo[io] ?? (Date.now() - 24 * 60 * 60 * 1000);

    // Attempt 1: after in milliseconds
    let arr = await this._callGetStats(domain, io, initialAfterMs);
    if (Array.isArray(arr) && arr.length === 0) {
      // Attempt 2: after in seconds
      const sec = Math.floor(initialAfterMs / 1000);
      arr = await this._callGetStats(domain, io, sec);
    }

    // Advance watermark for next poll cycle
    this._afterByIo[io] = Date.now();
    return arr;
  }

  async _callGetStats(domain, io, after) {
    const res = await this._httpRequest('POST', '/harmopool/getStats', {
      cookie: this._cookie,
      body: { domain, io, after },
    });

    if (res.status === 404) {
      this.log(`[WiFiPool][Device] getStats 404 for io=${io}: ${res.text || 'Unknown io'}`);
      return []; // treat as empty (skip)
    }
    if (res.status !== 200) {
      throw new Error(`getStats failed for ${io}: HTTP ${res.status}`);
    }
    if (!Array.isArray(res.json)) return [];
    return res.json;
  }

  async _httpRequest(method, resource, { body, cookie } = {}) {
    const url = `${BASE}${resource}`;
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;

    const t0 = Date.now();
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const ms = Date.now() - t0;

    const setCookie = res.headers?.raw?.()['set-cookie'] || res.headers.get?.('set-cookie') || null;
    const text = await res.text();
    let json; try { json = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }

    this.log(`[WiFiPool][HTTP] ${method} ${resource} -> ${res.status} in ${ms}ms`);
    if (res.status === 200 && Array.isArray(json)) {
      this.log(`[WiFiPool][HTTP] ${resource} items: ${json.length}`);
    } else if (res.status >= 400) {
      this.log(`[WiFiPool][HTTP] ${resource} error body: ${(text || '').slice(0, 200)}`);
    }

    return { status: res.status, json, text, setCookie, timeMs: ms };
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

  async _safeSetCapabilityValue(cap, value) {
    if (!this.hasCapability(cap)) return;
    try {
      const current = await this.getCapabilityValue(cap);
      if (current !== value) {
        await this.setCapabilityValue(cap, value);
      }
    } catch (e) {
      this.error(`[WiFiPool][Device] setCapabilityValue(${cap}) failed:`, e?.message || e);
    }
  }
}
