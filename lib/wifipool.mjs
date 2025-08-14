import fetch from 'node-fetch';

const LOGIN_URL = 'https://api.wifipool.eu/native_mobile/users/login';
const STATS_URL = 'https://api.wifipool.eu/native_mobile/harmopool/getStats';
const MANUAL_URL = 'https://api.wifipool.eu/native_mobile/harmopool/setManualIO';
const GROUPS_ACCESS = 'https://api.wifipool.eu/native_mobile/groups/accessible';
const GROUPS_INFO = 'https://api.wifipool.eu/native_mobile/groups/getInfo';

export class WiFiPoolClient {
  constructor(appLike) {
    this.app = appLike; // expects: homey, log(), error()
    this.cookies = '';
    this.lastLoginAt = 0;
    this._rid = 0;
  }
  _nextId(){ this._rid = (this._rid + 1) % 1e9; return this._rid; }
  _maskEmail(email){ if(!email) return '(not set)'; const [u,d]=String(email).split('@'); return (u||'').slice(0,2)+'***@'+(d||''); }
  _safe(o){ try{ const s=typeof o==='string'?o:JSON.stringify(o); return s.length>800? s.slice(0,800)+'…('+s.length+' bytes)': s; }catch(e){ return String(o);} }

  resetAuth(){ this.cookies=''; this.lastLoginAt=0; }

  async _doLogin(){
    const email = this.app.homey.settings.get('email');
    const password = this.app.homey.settings.get('password');
    if(!email || !password){ this.app.error('[WiFiPool] Missing email/password in settings'); throw new Error('Missing credentials'); }
    const body = { email, namespace: 'default', password };

    const id = this._nextId();
    const t0 = Date.now();
    this.app.log(`[WiFiPool][#${id}] >>> POST /users/login`, LOGIN_URL);
    this.app.log(`[WiFiPool][#${id}] >>> Headers`, this._safe({ 'Content-Type':'application/json' }));
    this.app.log(`[WiFiPool][#${id}] >>> Body`, this._safe({ email: this._maskEmail(email), namespace:'default', password:'***' }));
    let res;
    try{
      res = await fetch(LOGIN_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body), redirect:'manual' });
    }catch(e){ this.app.error(`[WiFiPool][#${id}] !!! Login fetch error`, e?.message||e); throw e; }
    const txt = await res.text();
    const cookies = res.headers?.raw?.()['set-cookie'] || [];
    this.app.log(`[WiFiPool][#${id}] <<< Status`, res.status);
    if (txt) this.app.log(`[WiFiPool][#${id}] <<< Login response body sample`, this._safe(txt));
    this.app.log(`[WiFiPool][#${id}] <<< Set-Cookie`, this._safe(cookies));
    this.app.log(`[WiFiPool][#${id}] <<< Time`, `${Date.now()-t0}ms`);
    if(!res.ok){ this.app.error('[WiFiPool] Login failed', res.status, txt); throw new Error('Login failed '+res.status); }
    this.cookies = cookies.map(c => c.split(';')[0]).join('; ');
    this.lastLoginAt = Date.now();
    this.app.log('[WiFiPool] Login OK, cookies captured');
  }

  async ensureLogin(){
    if(!this.cookies || (Date.now()-this.lastLoginAt) > 30*60*1000){ await this._doLogin(); }
  }

  async getStat({ domain, io, after=0 }){
    await this.ensureLogin();
    domain = domain || this.app.homey.settings.get('domain');
    if(!domain) throw new Error('Missing domain');
    const body = { domain, io, after };
    const id = this._nextId(), t0 = Date.now();
    this.app.log(`[WiFiPool][#${id}] >>> POST /harmopool/getStats`, STATS_URL);
    this.app.log(`[WiFiPool][#${id}] >>> Headers`, this._safe({ 'Content-Type':'application/json', 'Cookie': (this.cookies||'').split(';').map(s=>s.trim().split('=')[0]).join('; ')+'=…' }));
    this.app.log(`[WiFiPool][#${id}] >>> Body`, this._safe(body));
    let res;
    try{
      res = await fetch(STATS_URL, { method:'POST', headers:{ 'Content-Type':'application/json','Cookie': this.cookies }, body: JSON.stringify(body) });
    }catch(e){ this.app.error(`[WiFiPool][#${id}] !!! getStats fetch error`, e?.message||e); throw e; }
    const text = await res.text();
    this.app.log(`[WiFiPool][#${id}] <<< Status`, res.status);
    this.app.log(`[WiFiPool][#${id}] <<< Time`, `${Date.now()-t0}ms`);
    this.app.log(`[WiFiPool][#${id}] <<< Body sample`, text ? text.slice(0,800) : '(empty)');
    if(!res.ok){ const msg = `getStats ${res.status}: ${text || res.statusText}`; this.app.error('[WiFiPool]', msg); throw new Error(msg); }
    let json;
    if (text && text.trim().match(/^[\[{]/)) { try{ json = JSON.parse(text); }catch(e){ this.app.error('[WiFiPool] getStats JSON parse failed:', e?.message||e); throw e; } }
    else { throw new Error('getStats returned non-JSON response'); }
    this.app.log('[WiFiPool] getStats response items:', Array.isArray(json)? json.length : 'n/a');
    return json;
  }

  async setManualIO({ domain, io, value }){
    await this.ensureLogin();
    domain = domain || this.app.homey.settings.get('domain');
    if(!domain) throw new Error('Missing domain');
    const id = this._nextId(), t0 = Date.now();
    const body = { domain, io };
    if (typeof value !== 'undefined') body.value = value;
    this.app.log(`[WiFiPool][#${id}] >>> POST /harmopool/setManualIO`, MANUAL_URL);
    this.app.log(`[WiFiPool][#${id}] >>> Body`, this._safe(body));
    let res;
    try{
      res = await fetch(MANUAL_URL, { method:'POST', headers:{ 'Content-Type':'application/json','Cookie': this.cookies }, body: JSON.stringify(body) });
    }catch(e){ this.app.error(`[WiFiPool][#${id}] !!! setManualIO fetch error`, e?.message||e); throw e; }
    const text = await res.text();
    this.app.log(`[WiFiPool][#${id}] <<< Status`, res.status);
    this.app.log(`[WiFiPool][#${id}] <<< Body sample`, text ? text.slice(0,400) : '(empty)');
    if(!res.ok){ throw new Error(`setManualIO ${res.status}: ${text || res.statusText}`); }
    return text;
  }

  async getAccessibleGroups(){
    await this.ensureLogin();
    const id = this._nextId(), t0 = Date.now();
    this.app.log(`[WiFiPool][#${id}] >>> GET /groups/accessible`, GROUPS_ACCESS);
    let res;
    try{
      res = await fetch(GROUPS_ACCESS, { method:'GET', headers:{ 'Cookie': this.cookies }, redirect:'manual' });
    }catch(e){ this.app.error(`[WiFiPool][#${id}] !!! groups/accessible fetch error`, e?.message||e); throw e; }
    const text = await res.text();
    this.app.log(`[WiFiPool][#${id}] <<< Status`, res.status);
    this.app.log(`[WiFiPool][#${id}] <<< Time`, `${Date.now()-t0}ms`);
    this.app.log(`[WiFiPool][#${id}] <<< Body sample`, text ? text.slice(0,800) : '(empty)');
    if (res.status === 304) { this.app.log('[WiFiPool] groups/accessible 304 (not modified)'); return []; }
    if(!res.ok){ throw new Error(`groups/accessible ${res.status}: ${text || res.statusText}`); }
    try{ return JSON.parse(text); }catch(e){ throw new Error('groups/accessible non-JSON'); }
  }

  async getGroupInfo(domainId){
    await this.ensureLogin();
    const id = this._nextId(), t0 = Date.now();
    const body = { domainId };
    this.app.log(`[WiFiPool][#${id}] >>> POST /groups/getInfo`, GROUPS_INFO);
    this.app.log(`[WiFiPool][#${id}] >>> Body`, this._safe(body));
    let res;
    try{
      res = await fetch(GROUPS_INFO, { method:'POST', headers:{ 'Content-Type':'application/json', 'Cookie': this.cookies }, body: JSON.stringify(body) });
    }catch(e){ this.app.error(`[WiFiPool][#${id}] !!! groups/getInfo fetch error`, e?.message||e); throw e; }
    const text = await res.text();
    this.app.log(`[WiFiPool][#${id}] <<< Status`, res.status);
    this.app.log(`[WiFiPool][#${id}] <<< Time`, `${Date.now()-t0}ms`);
    this.app.log(`[WiFiPool][#${id}] <<< Body sample`, text ? text.slice(0,800) : '(empty)');
    if(!res.ok){ throw new Error(`groups/getInfo ${res.status}: ${text || res.statusText}`); }
    try{ return JSON.parse(text); }catch(e){ throw new Error('groups/getInfo non-JSON'); }
  }

  collectIOsFromObject(obj){
    const ios = new Set();
    const rx = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:o|i)\d+/ig;
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o && typeof o === 'object'){
        for (const k of Object.keys(o)) {
          const v = o[k];
          if (typeof v === 'string'){
            const m = v.match(rx);
            if (m) m.forEach(s => ios.add(s));
          } else {
            walk(v);
          }
        }
      }
    };
    walk(obj);
    return Array.from(ios);
  }
}
