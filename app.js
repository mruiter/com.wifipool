'use strict';

const Homey = require('homey');

module.exports = class WiFiPoolApp extends Homey.App {
  onInit() {
    this.log('WiFi Pool App has started');
  }
};
