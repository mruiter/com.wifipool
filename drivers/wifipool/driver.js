const { Driver } = require('homey');
const { login } = require('../../lib/wifipool.js');

module.exports = class WiFiPoolDriver extends Driver {
  async onInit() {
    this.log('WiFi Pool driver initialized');

    const email = this.homey.settings.get('email');
    const password = this.homey.settings.get('password');

    if (!email || !password) {
      this.error(
        'WiFi Pool credentials missing. Please configure email and password in the app settings.'
      );
      return;
    }

    try {
      await login(email, password);
      this.log('WiFi Pool login successful');
    } catch (err) {
      this.error('WiFi Pool login failed', err);
    }
  }
};
