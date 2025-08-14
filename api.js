import { WiFiPoolClient } from './lib/wifipool.mjs';



function _firstDs18b20Key(dsd){
  try{
    const obj = dsd?.ds18b20;
    if (obj && typeof obj === 'object'){
      const keys = Object.keys(obj).filter(k => obj[k] && typeof obj[k].temperature !== 'undefined');
      if (keys.length) return keys[0];
    }
  }catch(e){}
  return null;
}

function _suffixesForDeviceFromInfo(info, deviceUuid){
  const out = new Set();
  try{
    const arr = info?.mobile_group_data?.io || [];
    for (const it of arr){
      if (it?.device === deviceUuid && typeof it?.id === 'string'){
        const m = it.id.split('.'); if (m.length===2) out.add(m[1]);
      }
    }
  }catch(e){ /* ignore */ }
  // Fallback: if nothing found, return common guess set
  if (!out.size) ['o0','o1','o2','o3','o4','o5','o6','o7','o8','i0','i1','i2','i3'].forEach(s=>out.add(s));
  return Array.from(out);
}

function _findDomainFromGroups(groups){
  const rxUUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  if (!Array.isArray(groups)) return null;
  for (const g of groups){
    if (!g || typeof g !== 'object') continue;
    // Preferred explicit keys
    for (const key of ['mobile_group_domainid','mobile_group_id','domainId','domain','groupId','tenantId']) {
      const v = g[key];
      if (typeof v === 'string' && rxUUID.test(v)) return v;
    }
    // Search nested fields for something that looks like a domain UUID but is NOT a device uuid reference
    const stack = [g];
    while (stack.length){
      const o = stack.pop();
      if (Array.isArray(o)) { stack.push(...o); continue; }
      if (o && typeof o === 'object'){
        for (const [k,v] of Object.entries(o)){
          if (typeof v === 'string'){
            if (rxUUID.test(v)){
              // Exclude IO strings 'xxxx.o3' / device ids inside devices[] (we try to avoid those by key name)
              if (v.includes('.')) continue;
              if (/device/.test(k) || /serial/i.test(k) || /type/i.test(k)) continue;
              return v;
            }
          } else if (v && typeof v === 'object'){
            stack.push(v);
          }
        }
      }
    }
  }
  return null;
}


/**
 * Web API handlers as default-exported object.
 * Keys must match the names in app.json's "api" section.
 * Each handler receives: { homey, params, query, body }
 */
export default {
  async autosetup({ homey }){
    const log = (...a)=>homey.app.log('[WiFiPool][API]', ...a);
    const error = (...a)=>homey.app.error('[WiFiPool][API]', ...a);
    try{
      const client = new WiFiPoolClient(homey.app);
      await client._doLogin();

      const groups = await client.getAccessibleGroups().catch(()=>[]);
let domain = homey.settings.get('domain');
if (!domain) {
  const cand = _findDomainFromGroups(groups);
  if (cand) { await homey.settings.set('domain', cand); domain = cand; homey.app.log('[WiFiPool][API] domain (from groups/accessible) =', domain); }
}
if (!domain) throw new Error('Could not determine domain automatically.');

      const info = await client.getGroupInfo(domain).catch(()=>null);
      let ioStrings = [];
      if (info) ioStrings = client.collectIOsFromObject(info);
      log('IO strings found:', ioStrings.length);

      const byDevice = {};
      for (const s of ioStrings){
        const [dev, suf] = s.split('.');
        if (!dev || !suf) continue;
        byDevice[dev] = byDevice[dev] || new Set();
        byDevice[dev].add(suf);
      }
      const devices = Object.keys(byDevice).sort((a,b)=>(byDevice[b]?.size||0)-(byDevice[a]?.size||0));
      if (!devices.length) throw new Error('No IOs found in group info.');
      const deviceUuid = devices[0];
      await homey.settings.set('device_uuid', deviceUuid);
      log('device_uuid =', deviceUuid);

      const suffixes = ['o0','o3','o4','o5','o8','i0','i1','i2','i3'];
      const mapping = {};
      for (const suf of suffixes){
        const io = `${deviceUuid}.${suf}`;
        try{
          const arr = await client.getStat({ domain, io, after: 0 });
          if (Array.isArray(arr) && arr.length){
            const dsd = arr[arr.length-1].device_sensor_data || {};
            if (dsd.switch){ mapping[io] = { type:'switch', index:suf }; log('switch at', io); continue; }
            const a = dsd.analog || {};
            if (a['4'] && a['4'] > 0 && a['4'] < 14) { mapping[io] = { type:'ph', key:'4' }; log('ph at', io); }
            if (a['1'] && a['1'] > 100 && a['1'] < 1200) { mapping[io] = { type:'redox', key:'1' }; log('redox at', io); }
            if (a['0'] && a['0'] >= 0) { mapping[io] = { type:'flow', key:'0' }; log('flow at', io); }
            if ((a['2'] && a['2'] > -20 && a['2'] < 80) || (a['8'] && a['8'] > -20 && a['8'] < 80)) {
              const k = a['2'] ? '2' : '8'; mapping[io] = { type:'temperature', key:k }; log('temperature at', io);
            }
          }
        }catch(e){ log('probe failed for', io, e?.message||e); }
      }
      await homey.settings.set('io_map', mapping);
      log('saved io_map entries =', Object.keys(mapping).length);
      return { ok:true, domain, deviceUuid, entries: Object.keys(mapping).length, mapping };
    }catch(e){
      error('autosetup failed:', e?.message||e);
      throw e;
    }
  },

  async discover({ homey }){
    const log = (...a)=>homey.app.log('[WiFiPool][API]', ...a);
    const error = (...a)=>homey.app.error('[WiFiPool][API]', ...a);
    try{
      const client = new WiFiPoolClient(homey.app);
      await client.ensureLogin();
      const domain = homey.settings.get('domain');
      const deviceUuid = homey.settings.get('device_uuid');
      if (!domain) throw new Error('Set Domain first');
      if (!deviceUuid) throw new Error('Set Device UUID first');
      const suffixes = ['o0','o3','o4','o5','o8','i0','i1','i2','i3'];
      const mapping = {};
      for (const suf of suffixes){
        const io = `${deviceUuid}.${suf}`;
        try{
          const arr = await client.getStat({ domain, io, after: 0 });
          if (Array.isArray(arr) && arr.length){
            const dsd = arr[arr.length-1].device_sensor_data || {};
            if (dsd.switch){ mapping[io] = { type:'switch', index:suf }; continue; }
            const a = dsd.analog || {};
            if (a['4'] && a['4'] > 0 && a['4'] < 14) { mapping[io] = { type:'ph', key:'4' }; }
            if (a['1'] && a['1'] > 100 && a['1'] < 1200) { mapping[io] = { type:'redox', key:'1' }; }
            if (a['0'] && a['0'] >= 0) { mapping[io] = { type:'flow', key:'0' }; }
            if ((a['2'] && a['2'] > -20 && a['2'] < 80) || (a['8'] && a['8'] > -20 && a['8'] < 80)) {
              const k = a['2'] ? '2' : '8'; mapping[io] = { type:'temperature', key:k };
            }
          }
        }catch(e){ log('probe failed for', io, e?.message||e); }
      }
      await homey.settings.set('io_map', mapping);
      return { ok:true, entries: Object.keys(mapping).length, mapping };
    }catch(e){
      error('discover failed:', e?.message||e);
      throw e;
    }
  },

  async test({ homey }){
    const log = (...a)=>homey.app.log('[WiFiPool][API]', ...a);
    const error = (...a)=>homey.app.error('[WiFiPool][API]', ...a);
    try{
      const client = new WiFiPoolClient(homey.app);
      await client._doLogin();
      const domain = homey.settings.get('domain');
      const deviceUuid = homey.settings.get('device_uuid');
      if (!domain) throw new Error('Missing Domain in settings');
      if (!deviceUuid) throw new Error('Missing Device UUID in settings');
      const io = `${deviceUuid}.o3`;
      const arr = await client.getStat({ domain, io, after: 0 });
      return { ok:true, items: Array.isArray(arr) ? arr.length : 0 };
    }catch(e){
      error('test failed:', e?.message||e);
      throw e;
    }
  }
};
