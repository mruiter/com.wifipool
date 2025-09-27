// drivers/wifipool/device.js — Homey SDK v3 (ESM)
import Homey from 'homey';
import fetch from 'node-fetch';

const BASE = 'https://api.wifipool.eu/native_mobile';
const STALE_MS = 5 * 60 * 1000;          // 5 minutes for pH/ORP/Temp
const FLOW_ANALOG_THRESHOLD = 0.5;       // abs(analog) >= threshold => flow=true

export default class WiFiPoolDevice extends Homey.Device {
  async onInit() {
    this.log('[WiFiPool][Device] init:', this.getName());

    if (this.getSetting('poll_interval') == null) {
      await this.setSettings({ poll_interval: 60 });
    }

    this._cookie = null;
    this._cookieUntil = 0;
    this._pollTimer = null;

    // incremental "after" cache for sensors (not used for switch/relay scans)
    this._ioNewestMs = Object.create(null);

    // remember last published flow to avoid redundant writes
    this._lastFlowBool = this.getCapabilityValue('alarm_flow') ?? null;

    this._startPolling();
  }

  async onAdded() { this._startPolling(); }
  async onDeleted() { this._stopPolling(); }
  async onSettings({ changedKeys }) {
    if (changedKeys.includes('poll_interval')) {
      this.log('[WiFiPool][Device] poll_interval changed → restart polling');
      await this._restartPolling();
    }
  }

  // ----- Polling -----
  _startPolling() {
    this._stopPolling();
    const intervalSec = Number(this.getSetting('poll_interval')) || 60;
    const iv = Math.max(15, Math.min(600, intervalSec)) * 1000;
    this.log('[WiFiPool][Device] start polling every', iv / 1000, 's');

    this._pollOnce().catch(err => this.error('[WiFiPool][Device] initial poll error:', err?.message || err));
    this._pollTimer = setInterval(() => {
      this._pollOnce().catch(err => this.error('[WiFiPool][Device] poll error:', err?.message || err));
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
    if (this._cookie && now < this._cookieUntil) return this._cookie;

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

    this._cookie = cookie;
    this._cookieUntil = now + 15 * 60 * 1000; // ~15 min
    return cookie;
  }

  /**
   * For "sensor" IOs, we use incremental after.
   * For "switch/relay" scans we’ll pass after=0 to always get latest state.
   */
  async _getStats(domain, io, afterSec = null, tag = '') {
    const cookie = await this._ensureLogin();

    let effectiveAfter = afterSec;
    if (effectiveAfter == null) {
      const lastMs = this._ioNewestMs[io] || 0;
      effectiveAfter = Math.max(0, Math.floor(lastMs / 1000) - 1);
    }

    this.log(`[WiFiPool][Device] getStats io=${io} after=${effectiveAfter}${tag ? ' ' + tag : ''}`);

    const r = await this._httpRequest('POST', '/harmopool/getStats', {
      cookie, body: { domain, io, after: effectiveAfter }
    });

    if (r.status === 404) {
      this.log('[WiFiPool][Device] unknown io ->', io);
      return [];
    }
    if (r.status !== 200) throw new Error(`getStats failed ${io}: HTTP ${r.status}`);

    const arr = Array.isArray(r.json) ? r.json : [];
    const newest = this._arrayNewestMs(arr);
    if (newest) this._ioNewestMs[io] = Math.max(this._ioNewestMs[io] || 0, newest);
    return arr;
  }

  _arrayNewestMs(arr) {
    let newest = 0;
    for (const it of arr) {
      const ts = Date.parse(it?.device_sensor_time);
      if (Number.isFinite(ts) && ts > newest) newest = ts;
    }
    return newest;
  }

  _latestAnalog(arr) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const d = arr[i]?.device_sensor_data?.analog;
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
        if ('temperature' in d) {
          const v = Number(d.temperature);
          if (Number.isFinite(v)) return v;
        }
        const key = Object.keys(d)[0];
        const v = Number(d[key]?.temperature);
        if (Number.isFinite(v)) return v;
      }
    }
    return null;
  }

  // --- Decode boolean from various shapes ---
  _boolFromUnknown(v) {
    if (typeof v === 'boolean') return v;
    if (v === 1 || v === 0) return !!v;
    return null;
  }
  _boolFromObject(obj) {
    if (!obj || typeof obj !== 'object') return null;
    let sawFalse = false;
    for (const k of Object.keys(obj)) {
      const b = this._boolFromUnknown(obj[k]);
      if (b === true) return true;
      if (b === false) sawFalse = true;
    }
    return sawFalse ? false : null;
  }
  _decodeSwitchBool(sample) {
    const data = sample?.device_sensor_data || {};
    const direct = this._boolFromUnknown(data.power) ?? this._boolFromUnknown(data.switch) ??
                   this._boolFromUnknown(data.relay) ?? this._boolFromUnknown(data.state) ??
                   this._boolFromUnknown(data.value) ?? null;
    if (direct !== null) return { bool: direct, via: 'direct' };

    const nested = this._boolFromObject(data.power) ?? this._boolFromObject(data.switch) ??
                   this._boolFromObject(data.relay) ?? this._boolFromObject(data.state) ??
                   this._boolFromObject(data.value) ?? null;
    if (nested !== null) return { bool: nested, via: 'nested' };

    if (data.analog && typeof data.analog === 'object') {
      const k = Object.keys(data.analog)[0];
      const v = Number(data.analog[k]);
      if (Number.isFinite(v)) return { bool: Math.abs(v) >= FLOW_ANALOG_THRESHOLD, via: 'analog' };
    }
    return { bool: null, via: 'unknown' };
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
        const arr = await this._getStats(domain, io_map.ph.io, null, 'ph');
        const newest = this._arrayNewestMs(arr);
        const v = this._latestAnalog(arr);
        if (v != null && newest && (Date.now() - newest) <= STALE_MS) {
          if (v !== this.getCapabilityValue('measure_ph')) {
            await this.setCapabilityValue('measure_ph', v);
            this.log('[WiFiPool][Device] pH updated:', v, 'at', new Date(newest).toISOString());
          }
        }
      } catch (e) { ok = false; this.error('pH poll error:', e?.message || e); }
    }

    // ORP
    if (io_map.redox?.io && this.hasCapability('measure_redox')) {
      try {
        const arr = await this._getStats(domain, io_map.redox.io, null, 'orp');
        const newest = this._arrayNewestMs(arr);
        const v = this._latestAnalog(arr);
        if (v != null && newest && (Date.now() - newest) <= STALE_MS) {
          if (v !== this.getCapabilityValue('measure_redox')) {
            await this.setCapabilityValue('measure_redox', v);
            this.log('[WiFiPool][Device] ORP updated:', v, 'at', new Date(newest).toISOString());
          }
        }
      } catch (e) { ok = false; this.error('redox poll error:', e?.message || e); }
    }

    // Temperature
    if (io_map.temperature?.io && this.hasCapability('measure_temperature')) {
      try {
        const arr = await this._getStats(domain, io_map.temperature.io, null, 'temp');
        const newest = this._arrayNewestMs(arr);
        const t = this._latestTemperature(arr);
        if (t != null && newest && (Date.now() - newest) <= STALE_MS) {
          if (t !== this.getCapabilityValue('measure_temperature')) {
            await this.setCapabilityValue('measure_temperature', t);
            this.log('[WiFiPool][Device] temperature updated:', t, 'at', new Date(newest).toISOString());
          }
        }
      } catch (e) { ok = false; this.error('temperature poll error:', e?.message || e); }
    }

    // Flow — always scan/log; only set capability if present.
    try {
      await this._pollFlow(domain, io_map);
    } catch (e) {
      ok = false;
      this.error('flow poll error:', e?.message || e);
    }

    await this.setCapabilityValue('alarm_health', !ok).catch(() => {});
  }

  async _pollFlow(domain, io_map) {
    const allSwitches = Array.isArray(io_map.switches) ? io_map.switches : [];
    const inputs  = allSwitches.filter(io => /\.i\d+$/.test(io));
    const outputs = allSwitches.filter(io => /\.o\d+$/.test(io));
    const haveFlowCap = this.hasCapability('alarm_flow') || this.hasCapability('measure_flow');

    const publish = async (bool, meta, sample) => {
      if (bool === null) return;
      if (bool === this._lastFlowBool) {
        this.log('[WiFiPool][Device] flow unchanged →', bool, meta);
        return;
      }
      this._lastFlowBool = bool;

      if (haveFlowCap) {
        if (this.hasCapability('alarm_flow')) {
          await this.setCapabilityValue('alarm_flow', bool);
        } else if (this.hasCapability('measure_flow')) {
          await this.setCapabilityValue('measure_flow', bool ? 1 : 0);
        }
      }
      this.log('[WiFiPool][Device] flow UPDATED →', bool, meta);
      if (sample) this.log('[WiFiPool][Device] flow sample :=', JSON.stringify(sample));
    };

    const scan = async (list, label) => {
      for (const io of list) {
        // Force after=0 for switch/relay to always get latest toggle
        const arr = await this._getStats(domain, io, 0, `flow-${label}`);
        if (!arr.length) {
          this.log(`[WiFiPool][Device] getStats flow-${label} io=${io} → no samples`);
          continue;
        }
        const sample = arr[arr.length - 1];
        const ts = Date.parse(sample?.device_sensor_time) || 0;
        const { bool, via } = this._decodeSwitchBool(sample);
        this.log(`[WiFiPool][Device] flow(${label}) io=${io} via=${via} bool=${bool} newest=${ts ? new Date(ts).toISOString() : 'n/a'}`);
        if (bool !== null) return { bool, io, sample };
      }
      return null;
    };

    // 1) Try outputs
    if (outputs.length) {
      const res = await scan(outputs, 'out');
      if (res) return publish(res.bool, `(output ${res.io})`, res.sample);
    }

    // 2) Try inputs
    if (inputs.length) {
      const res = await scan(inputs, 'in');
      if (res) return publish(res.bool, `(input ${res.io})`, res.sample);
    }

    // 3) Fallback to analog if mapped
    if (io_map.flow?.io) {
      const arr = await this._getStats(domain, io_map.flow.io, 0, 'flow-analog'); // use 0 to always get last value
      const newest = this._arrayNewestMs(arr);
      const v = this._latestAnalog(arr);
      const bool = (v != null) ? Math.abs(v) >= FLOW_ANALOG_THRESHOLD : null;
      this.log(`[WiFiPool][Device] flow(analog) io=${io_map.flow.io} analog=${v} bool=${bool} newest=${newest ? new Date(newest).toISOString() : 'n/a'}`);
      if (bool !== null) return publish(bool, `(analog ${io_map.flow.io})`, arr[arr.length - 1] || null);
    }

    this.log('[WiFiPool][Device] flow: no conclusive evidence this round');
  }
}
