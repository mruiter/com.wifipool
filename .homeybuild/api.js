// api.js — Homey SDK v3 (ESM)
// Endpoints (must match app.json "api" section):
//   - testApi      (POST /test)
//   - discoverIos  (POST /discover)
//   - autoSetup    (POST /autosetup)
//
// app.json example:
/*
"api": [
  { "id": "testApi",     "path": "/test",      "method": "POST", "public": false },
  { "id": "discoverIos", "path": "/discover",  "method": "POST", "public": false },
  { "id": "autoSetup",   "path": "/autosetup", "method": "POST", "public": false }
]
*/
// package.json: { "type": "module", "dependencies": { "node-fetch": "^3.3.2" } }

import fetch from 'node-fetch';

const BASE = 'https://api.wifipool.eu/native_mobile';
let REQ = 0;

// ----- logging helpers -----
function _log(homey, msg)   { homey.log(`[WiFiPool][API] ${msg}`); }
function _trace(homey, msg) { homey.log(`[WiFiPool] ${msg}`); }
function _error(homey, msg) { homey.error(`[WiFiPool][API] ${msg}`); }

function _redact(val) {
  if (!val || typeof val !== 'string') return val;
  return val
    .replace(/([A-Za-z0-9._%+-]{2})[A-Za-z0-9._%+-]*(@)/g, '$1***$2')
    .replace(/([A-Za-z0-9._%+-]{2})[A-Za-z0-9._%+-]*(\.[A-Za-z]{2,})/g, '$1***$2');
}

// ----- HTTP helper -----
async function httpRequest(homey, method, resource, { body, cookie } = {}) {
  const url = `${BASE}${resource}`;
  const id = ++REQ;
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;

  _trace(homey, `[#${id}] >>> ${method} ${resource} ${url}`);
  _trace(homey, `[#${id}] >>> Headers ${JSON.stringify(headers)}`);
  if (body) _trace(homey, `[#${id}] >>> Body ${JSON.stringify(maskBody(body))}`);

  const t0 = Date.now();
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const ms = Date.now() - t0;

  _trace(homey, `[#${id}] <<< Status ${res.status}`);
  const setCookie = res.headers?.raw?.()['set-cookie'] || res.headers.get?.('set-cookie') || null;
  if (setCookie) _trace(homey, `[#${id}] <<< Set-Cookie ${JSON.stringify(setCookie)}`);
  _trace(homey, `[#${id}] <<< Time ${ms}ms`);

  const text = await res.text();
  try {
    const json = text ? JSON.parse(text) : undefined;
    if (json && resource.includes('/users/login')) {
      _trace(homey, `[#${id}] <<< Login response body sample ${JSON.stringify(json).slice(0, 1000)}`);
    }
    return { status: res.status, json, text: undefined, setCookie, timeMs: ms };
  } catch {
    if (text && text.length < 200) _trace(homey, `[#${id}] <<< Body sample ${text}`);
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

// ----- minimal WiFiPool client -----
async function login(homey) {
  const email = homey.settings.get('email');
  const password = homey.settings.get('password');
  if (!email || !password) throw new Error('Email and/or Password not set in App Settings.');

  const r = await httpRequest(homey, 'POST', '/users/login', {
    body: { email, namespace: 'default', password },
  });
  if (r.status !== 200) throw new Error(`Login failed: HTTP ${r.status}`);

  const cookie = extractSessionCookie(r.setCookie);
  if (!cookie) _error(homey, 'No connect.sid cookie returned!');
  else _trace(homey, 'Login OK, cookies captured');

  return { cookie, user: r.json?.user || null };
}

async function getAccessibleGroups(homey, cookie) {
  const r = await httpRequest(homey, 'GET', '/groups/accessible', { cookie });
  if (r.status !== 200 || !r.json) throw new Error(`groups/accessible failed: HTTP ${r.status}`);
  return r.json;
}

async function getGroupInfo(homey, cookie, domainId) {
  const r = await httpRequest(homey, 'POST', '/groups/getInfo', { cookie, body: { domainId } });
  if (r.status !== 200 || !r.json) throw new Error(`groups/getInfo failed: HTTP ${r.status}${r.text ? `: ${r.text}` : ''}`);
  return r.json;
}

async function getStats(homey, cookie, domain, io, after = 0) {
  const r = await httpRequest(homey, 'POST', '/harmopool/getStats', {
    cookie, body: { domain, io, after },
  });
  if (r.status === 404 && r.text) {
    _error(homey, `getStats 404: ${r.text}`);
    throw new Error(`getStats 404: ${r.text}`);
  }
  if (r.status !== 200) throw new Error(`getStats failed: HTTP ${r.status}`);
  const arr = r.json || [];
  _trace(homey, `getStats response items: ${arr.length}`);
  return arr;
}

// Smart wrapper: try ms "after", then seconds "after". Log if still empty.
async function getStatsWithFallback(homey, cookie, domain, io) {
  const nowMs = Date.now();
  let arr = await getStats(homey, cookie, domain, io, nowMs);
  if (arr.length) return arr;

  const nowSec = Math.floor(nowMs / 1000);
  arr = await getStats(homey, cookie, domain, io, nowSec);
  if (!arr.length) {
    _trace(homey, `no data for ${io} after ms→sec fallback`);
  }
  return arr;
}

// ----- UUID helpers -----
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

// Extract *matches* (pure UUIDs) from any string/object tree.
function collectUuidsDeep(node, out) {
  if (!node) return;
  if (typeof node === 'string') {
    const matches = node.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi);
    for (const m of matches) out.add(m[0]);
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

function sanitizeUuidMaybe(v) {
  if (typeof v !== 'string') return null;
  const m = v.match(UUID_RE);
  return m ? m[0] : null;
}

// ----- robust domain resolver -----
async function resolveDomainId(homey, cookie, loginUserId) {
  const groups = await getAccessibleGroups(homey, cookie);
  _log(homey, `groups/accessible returned ${groups?.length ?? 0} item(s)`);

  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error('No groups accessible for this account');
  }

  // Collect device UUIDs (to exclude)
  const deviceIds = new Set();
  for (const g of groups) {
    const devices = g?.mobile_group_data?.devices || [];
    for (const d of devices) {
      const sid = sanitizeUuidMaybe(d?.id);
      if (sid) deviceIds.add(sid);
    }
  }

  // Collect all pure UUIDs from payload
  const all = new Set();
  for (const g of groups) collectUuidsDeep(g, all);

  // Exclude user/creator & device UUIDs
  for (const g of groups) {
    const creator = sanitizeUuidMaybe(g?.mobile_group_creator);
    if (creator) all.delete(creator);
  }
  const loginSid = sanitizeUuidMaybe(loginUserId);
  if (loginSid) all.delete(loginSid);
  for (const id of deviceIds) all.delete(id);

  // Likely keys first if present
  const likely = [];
  for (const g of groups) {
    for (const k of ['mobile_group_uuid', 'mobile_group_id', 'domainId', 'groupId']) {
      const sid = sanitizeUuidMaybe(g?.[k]);
      if (sid) likely.push(sid);
    }
  }

  const candidates = Array.from(new Set([ ...likely, ...all ]));
  if (candidates.length === 0) {
    throw new Error('Could not find any domainId candidates in groups/accessible');
  }

  // 👉 Cleaned up log: only pure UUIDs
  _log(homey, `domainId candidates: ${candidates.join(', ')}`);

  // Probe each candidate with /groups/getInfo: choose the one that has IOs
  for (const id of candidates) {
    try {
      const info = await getGroupInfo(homey, cookie, id);
      const ioLen = info?.mobile_group_data?.io?.length ?? 0;
      if (ioLen > 0) {
        _log(homey, `domain resolved: ${id} (io=${ioLen})`);
        return { domainId: id, info };
      }
      _log(homey, `candidate ${id} rejected: no io array`);
    } catch (e) {
      _log(homey, `candidate ${id} rejected: ${e?.message || e}`);
    }
  }

  throw new Error('All domainId candidates were rejected by /groups/getInfo');
}

// ----- data inspectors -----
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

// ----- Auto-setup core flow -----
export async function autoSetupCore(homey) {
  // 1) login
  const { cookie, user } = await login(homey);
  const loginUserId = user?.mobile_user_id;

  // 2) robust domain detection
  const { domainId: domain, info } = await resolveDomainId(homey, cookie, loginUserId);
  _log(homey, `device list length = ${info?.mobile_group_data?.devices?.length ?? 0}`);

  // 3) get device uuid & IO map from group info
  const device_uuid = sanitizeUuidMaybe(info?.mobile_group_data?.devices?.[0]?.id);
  if (!device_uuid) throw new Error('Could not determine device UUID from getInfo.');
  _log(homey, `device_uuid = ${device_uuid}`);

  // 4) probe IOs and categorize
  const found = { domain, device_uuid, switches: [] };
  const oCandidates = Array.from({ length: 13 }, (_, i) => `${device_uuid}.o${i}`);
  const iCandidates = Array.from({ length: 8 },  (_, i) => `${device_uuid}.i${i}`);

  const probe = async (io) => {
    try {
      const arr = await getStatsWithFallback(homey, cookie, domain, io);
      if (!arr.length) return;

      const det = detectFromStats(arr);
      if (det.kind === 'switch' || det.kind === 'state_power') {
        _trace(homey, `switch at ${io}`);
        found.switches.push(io);
      } else if (det.kind === 'analog') {
        const v = Number(det.sample);
        if (!Number.isFinite(v)) return;
        if (v >= 0 && v <= 14 && !found.ph) {
          found.ph = { io, key: det.key };
          _log(homey, `ph at ${io}`);
        } else if (v > 100 && v < 1500 && !found.redox) {
          found.redox = { io, key: det.key };
          _log(homey, `redox at ${io}`);
        } else if (!found.flow) {
          found.flow = { io, key: det.key };
          _log(homey, `flow (analog?) at ${io}`);
        }
      } else if (det.kind === 'ds18b20' && !found.temperature) {
        found.temperature = { io, key: det.key };
        _log(homey, `temperature (ds18b20) at ${io} key ${det.key}`);
      }
    } catch (e) {
      if (String(e?.message || e).includes('getStats 404: Unknown io')) {
        _trace(homey, `skipping unknown io: ${io}`);
      } else {
        _trace(homey, `probe error at ${io}: ${e?.message || e}`);
      }
    }
  };

  for (const io of [...iCandidates, ...oCandidates]) {
    // eslint-disable-next-line no-await-in-loop
    await probe(io);
  }

  // 5) persist for driver
  await homey.settings.set('domain', domain);
  await homey.settings.set('device_uuid', device_uuid);
  await homey.settings.set('io_map', found);
  const count = (found.switches?.length || 0)
    + (found.ph ? 1 : 0) + (found.redox ? 1 : 0)
    + (found.flow ? 1 : 0) + (found.temperature ? 1 : 0);
  _log(homey, `saved io_map entries = ${count}`);

  return found;
}

// ----- Exported API (default export required by ManagerApi) -----
export default {
  // Quick connectivity check
  async testApi({ homey }) {
    const { cookie, user } = await login(homey);
    return {
      ok: true,
      user: user?.mobile_user_mail || null,
      hasCookie: Boolean(cookie),
    };
  },

  // Return domain + device uuid + raw IO IDs (does not persist)
  async discoverIos({ homey }) {
    const { cookie, user } = await login(homey);
    const { domainId: domain, info } = await resolveDomainId(homey, cookie, user?.mobile_user_id);
    const device_uuid = sanitizeUuidMaybe(info?.mobile_group_data?.devices?.[0]?.id) || null;
    const io = (info?.mobile_group_data?.io || []).map(x => x.id);
    return { domain, device_uuid, io };
  },

  // Full auto-setup and persist to settings
  async autoSetup({ homey }) {
    const result = await autoSetupCore(homey);
    return { ok: true, ...result };
  },
};
