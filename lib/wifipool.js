const fetch = require('./fetch');


const LOGIN_URL = 'https://api.wifipool.eu/native_mobile/users/login';
const STATS_URL = 'https://api.wifipool.eu/native_mobile/harmopool/getStats';

class WiFiPoolClient {
  constructor(app) {
    this.app = app;

    this.cookies = '';
    this.lastLoginAt = 0;
  }

  resetAuth() {

    this.cookies = '';
    this.lastLoginAt = 0;
  }

  async _doLogin() {
    const email = this.app.homey.settings.get('email');
    const password = this.app.homey.settings.get('password');
    if (!email || !password) {
      this.app.error('[WiFiPool] Missing email/password in settings');
      throw new Error('Missing credentials');
    }
    const body = { email, namespace: 'default', password };
    this.app.log('[WiFiPool] POST login', LOGIN_URL, 'payload=', JSON.stringify({ ...body, password: '***' }));

    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'manual'
    });
    if (!res.ok) {
      const txt = await res.text();
      this.app.error('[WiFiPool] Login failed', res.status, txt);
      throw new Error('Login failed ' + res.status);
    }
    // capture cookies
    const setCookie = res.headers.raw()['set-cookie'] || [];
    this.cookies = setCookie.map(c => c.split(';')[0]).join('; ');
    this.lastLoginAt = Date.now();
    this.app.log('[WiFiPool] Login OK, cookies captured:', this.cookies);
  }

  async ensureLogin() {
    // Re-login every 30 minutes just in case
    if (!this.cookies || (Date.now() - this.lastLoginAt) > 30*60*1000) {
      await this._doLogin();
    }
  }

  async getStat({ domain, io, after = 0 }) {
    await this.ensureLogin();
    if (!domain) {
      domain = this.app.homey.settings.get('domain');
    }
    if (!domain) throw new Error('Missing domain setting');
    const payload = { after, domain, io };
    this.app.log('[WiFiPool] POST getStats payload=', JSON.stringify(payload));
    const res = await fetch(STATS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': this.cookies
      },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch(e) {
      this.app.error('[WiFiPool] getStats non-JSON response:', text);
      throw e;
    }
    this.app.log('[WiFiPool] getStats response items:', Array.isArray(json) ? json.length : 'n/a');
    return json;
  }
}

module.exports = {
  WiFiPoolClient,
};
