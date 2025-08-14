import Homey from 'homey';
import { WiFiPoolClient } from './lib/wifipool.mjs';

export default class WiFiPoolApp extends Homey.App {
  async onInit() {
    this.log('[WiFiPool] App init');
    const email = this.homey.settings.get('email') || '(not set)';
    const domain = this.homey.settings.get('domain') || '(not set)';
    const poll = this.homey.settings.get('poll_interval') || 60;
    this.log(`[WiFiPool] Settings -> email=${email ? email.replace(/(.{2}).*@/, '$1***@') : email} domain=${domain} poll=${poll}s`);
  }
}
