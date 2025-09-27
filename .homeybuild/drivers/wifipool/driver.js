// drivers/wifipool/driver.js — Homey SDK v3 (CommonJS)
const Homey = require('homey');
const fetch = require('../../lib/fetch');

const BASE = 'https://api.wifipool.eu/native_mobile';
let REQ = 0;

// ---------- logging helpers ----------
function _log(driver, msg)   { driver.log(`[WiFiPool][Driver] ${msg}`); }
function _trace(driver, msg) { driver.log(`[WiFiPool] ${msg}`); }
function _error(driver, msg) { driver.error(`[WiFiPool][Driver] ${msg}`); }

function _redact(val) {
  if (!val || typeof val !== 'string') return val;
  return val
    .replace(/([A-Za-z0-9._%+-]{2})[A-Za-z0-9._%+-]*(@)/g, '$1***$2')
    .replace(/([A-Za-z0-9._%+-]{2})[A-Za-z0-9._%+-]*(\.[A-Za-z]{2,})/g, '$1***$2');
}

// ---------- http helper ----------
async function httpRequest(driver, method, resource, { body, cookie } = {}) {
  const url = `${BASE}${resource}`;
  const id = ++REQ;
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;

  _trace(driver, `[#${id}] >>> ${method} ${resource} ${url}`);
  _trace(driver, `[#${id}] >>> Headers ${JSON.stringify(headers)}`);
  if (body) _trace(driver, `[#${id}] >>> Body ${JSON.stringify(maskBody(body))}`);

  const t0 = Date.now();
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const ms = Date.now() - t0;

  _trace(driver, `[#${id}] <<< Status ${res.status}`);
  const setCookie = res.headers?.raw?.()['set-cookie'] || res.headers.get?.('set-cookie') || null;
  if (setCookie) _trace(driver, `[#${id}] <<< Set-Cookie ${JSON.stringify(setCookie)}`);
  _trace(driver, `[#${id}] <<< Time ${ms}ms`);

  const text = await res.text();
  try {
    const json = text ? JSON.parse(text) : undefined;
    if (json && resource.includes('/users/login')) {
      _trace(driver, `[#${id}] <<< Login response body sample ${JSON.stringify(json).slice(0, 1000)}`);
    }
    return { status: res.status, json, text: undefined, setCookie, timeMs: ms };
  } catch {
    if (text && text.length < 200) _trace(driver, `[#${id}] <<< Body sample ${text}`);
    return { status: res.status, json: undefined, text, setCookie, timeMs: ms };
  }
}

function maskBody(body) {
  const clone = JSON.parse(JSON.stringify(body));
  if (clone.password) clone.password = '***';
  if (clone.email) clone.email = _redact(clone.email);
  return clone;
}

function extractSessionCookie(setCookie) {
  if (!setCookie) return null;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of arr) {
    const m = String(c).match(/connect\.sid=([^;]+)/);
    if (m) return `connect.sid=${m[1]}`;
  }
  return null;
}

// ---------- client ops ----------
async function loginWith(driver, email, password) {
  if (!email || !password) throw new Error('Email and password are required.');
  const r = await httpRequest(driver, 'POST', '/users/login', {
    body: { email, namespace: 'default', password },
  });
  if (r.status !== 200) throw new Error(`Login failed: HTTP ${r.status}`);
  const cookie = extractSessionCookie(r.setCookie);
  if (!cookie) _error(driver, 'No connect.sid cookie returned!');
  else _trace(driver, 'Login OK, cookies captured');
  return { cookie, user: r.json?.user || null };
}

async function getAccessibleGroups(driver, cookie) {
  const r = await httpRequest(driver, 'GET', '/groups/accessible', { cookie });
  if (r.status !== 200 || !r.json) throw new Error(`groups/accessible failed: HTTP ${r.status}`);
  return r.json;
}

async function getGroupInfo(driver, cookie, domainId) {
  const r = await httpRequest(driver, 'POST', '/groups/getInfo', { cookie, body: { domainId } });
  if (r.status !== 200 || !r.json) {
    throw new Error(`groups/getInfo failed: HTTP ${r.status}${r.text ? `: ${r.text}` : ''}`);
  }
  return r.json;
}

async function getStats(driver, cookie, domain, io, after = 0) {
  const r = await httpRequest(driver, 'POST', '/harmopool/getStats', {
    cookie, body: { domain, io, after },
  });
  if (r.status === 404 && r.text) {
    _trace(driver, `skipping unknown io: ${io}`);
    return []; // treat as empty/unknown and continue
  }
  if (r.status !== 200) throw new Error(`getStats failed: HTTP ${r.status}`);
  const arr = r.json || [];
  _trace(driver, `getStats response items: ${arr.length}`);
  return arr;
}

// ---------- discovery helpers ----------
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function collectUuidsDeep(node, out) {
  if (!node) return;
  if (typeof node === 'string') {
    if (UUID_RE.test(node)) out.add(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) collectUuidsDeep(x, out);
    return;
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node)) collectUuidsDeep(v, out);
  }
}

async function resolveDomainId(driver, cookie, loginUserId) {
  const groups = await getAccessibleGroups(driver, cookie);
  _log(driver, `groups/accessible returned ${groups?.length ?? 0} item(s)`);
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error('No groups accessible for this account');
  }

  // Collect device UUIDs to exclude
  const deviceIds = new Set();
  for (const g of groups) {
    const devices = g?.mobile_group_data?.devices || [];
    for (const d of devices) {
      if (d?.id && UUID_RE.test(d.id)) deviceIds.add(d.id);
    }
  }

  const all = new Set();
  for (const g of groups) collectUuidsDeep(g, all);

  for (const g of groups) {
    const creator = g?.mobile_group_creator;
    if (creator && UUID_RE.test(creator)) all.delete(creator);
  }
  if (loginUserId && UUID_RE.test(loginUserId)) all.delete(loginUserId);
  for (const id of deviceIds) all.delete(id);

  // Try likely props first
  const likely = [];
  for (const g of groups) {
    for (const k of ['mobile_group_uuid', 'mobile_group_id', 'domainId', 'groupId']) {
      const v = g?.[k];
      if (typeof v === 'string' && UUID_RE.test(v)) likely.push(v);
    }
  }
  const candidates = Array.from(new Set([...likely, ...all]));
  if (candidates.length === 0) {
    throw new Error('Could not find any domainId candidates in groups/accessible');
  }

  _log(driver, `domainId candidates: ${candidates.join(', ')}`);

  for (const id of candidates) {
    try {
      const info = await getGroupInfo(driver, cookie, id);
      const ioLen = info?.mobile_group_data?.io?.length ?? 0;
      if (ioLen > 0) {
        _log(driver, `domain resolved: ${id} (io=${ioLen})`);
        return { domainId: id, info };
      }
      _log(driver, `candidate ${id} rejected: no io array`);
    } catch (e) {
      _log(driver, `candidate ${id} rejected: ${e?.message || e}`);
    }
  }
  throw new Error('All domainId candidates were rejected by /groups/getInfo');
}

function detectFromStats(arr) {
  for (const it of arr) {
    if (it.device_sensor_data) {
      const d = it.device_sensor_data;
      if (d.switch) {
        const key = Object.keys(d.switch)[0];
        return { kind: 'switch', key, sample: d.switch[key] };
      }
      if (d.analog) {
        const key = Object.keys(d.analog)[0];
        return { kind: 'analog', key, sample: d.analog[key] };
      }
      if (d.ds18b20) {
        const key = Object.keys(d.ds18b20)[0];
        return { kind: 'ds18b20', key, sample: d.ds18b20[key]?.temperature };
      }
    }
    if (it.device_state_data?.power) {
      const key = Object.keys(it.device_state_data.power)[0];
      return { kind: 'state_power', key, sample: it.device_state_data.power[key] };
    }
  }
  return { kind: null };
}

function makeName(io_map) {
  const parts = ['WiFiPool'];
  if (io_map.temperature) parts.push('Temp');
  if (io_map.ph) parts.push('pH');
  if (io_map.redox) parts.push('ORP');
  if (Array.isArray(io_map.switches) && io_map.switches.length) {
    parts.push(`${io_map.switches.length}xSwitch`);
  }
  return parts.join(' ');
}

async function autoDiscover(driver, { email, password }) {
  // 1) Login
  const { cookie, user } = await loginWith(driver, email, password);
  const loginUserId = user?.mobile_user_id;

  // 2) Domain + group info
  const { domainId: domain, info } = await resolveDomainId(driver, cookie, loginUserId);
  _log(driver, `device list length = ${info?.mobile_group_data?.devices?.length ?? 0}`);

  // 3) Device UUID
  const device_uuid = info?.mobile_group_data?.devices?.[0]?.id;
  if (!device_uuid) throw new Error('Could not determine device UUID from getInfo.');
  _log(driver, `device_uuid = ${device_uuid}`);

  // 4) Probe IOs
  const now = Date.now();
  const found = { domain, device_uuid, switches: [] };
  const oCandidates = Array.from({ length: 13 }, (_, i) => `${device_uuid}.o${i}`);
  const iCandidates = Array.from({ length: 8 },  (_, i) => `${device_uuid}.i${i}`);

  const probe = async (io) => {
    try {
      const arr = await getStats(driver, cookie, domain, io, now - 3 * 24 * 3600 * 1000 /* 72h */);
      if (!arr.length) return;
      const det = detectFromStats(arr);
      if (det.kind === 'switch' || det.kind === 'state_power') {
        _trace(driver, `switch at ${io}`);
        found.switches.push(io);
      } else if (det.kind === 'analog') {
        const v = Number(det.sample);
        if (!Number.isFinite(v)) return;
        if (v >= 0 && v <= 14 && !found.ph) {
          found.ph = { io, key: det.key };
          _log(driver, `ph at ${io}`);
        } else if (v > 100 && v < 1500 && !found.redox) {
          found.redox = { io, key: det.key };
          _log(driver, `redox at ${io}`);
        } else if (!found.flow) {
          found.flow = { io, key: det.key };
          _log(driver, `flow (analog?) at ${io}`);
        }
      } else if (det.kind === 'ds18b20' && !found.temperature) {
        found.temperature = { io, key: det.key };
        _log(driver, `temperature (ds18b20) at ${io} key ${det.key}`);
      }
    } catch (e) {
      // unknown or transient -> ignore
    }
  };

  for (const io of [...iCandidates, ...oCandidates]) { // serial to be kind to API
    // eslint-disable-next-line no-await-in-loop
    await probe(io);
  }

  const name = makeName(found);

  // 5) Return everything needed to create the device
  return {
    preview: { domain, device_uuid, io_map: found },
    device: {
      name,
      data: { id: device_uuid },
      store: { domain, device_uuid, io_map: found },
      // Store creds in device settings so it can re-login when needed.
      settings: { email, password }
    }
  };
}

// ---------- Driver ----------
class WiFiPoolDriver extends Homey.Driver {
  async onInit() {
    this.log('[WiFiPool][Driver] init');
  }

  // Session-based pairing
  async onPair(session) {
    const state = {
      email: null,
      password: null,
      discovery: null
    };

    session.setHandler('login', async ({ email, password }) => {
      state.email = (email || '').trim();
      state.password = password || '';
      if (!state.email || !state.password) {
        throw new Error('Please provide email and password.');
      }
      // Quick ping to validate
      await loginWith(this, state.email, state.password);
      return { ok: true };
    });

    session.setHandler('discover', async () => {
      if (!state.email || !state.password) throw new Error('Not logged in.');
      state.discovery = await autoDiscover(this, { email: state.email, password: state.password });
      return {
        ok: true,
        name: state.discovery.device.name,
        preview: state.discovery.preview
      };
    });

    session.setHandler('create', async () => {
      if (!state.discovery) throw new Error('Run discovery first.');
      return state.discovery.device;
    });
  }

  // (Optional) keep compatibility with list_devices if you ever switch back
  async onPairListDevices() {
    this.log('[WiFiPool][Driver] list_devices requested but pairing uses start.html.');
    return [];
  }
}

module.exports = WiFiPoolDriver;
