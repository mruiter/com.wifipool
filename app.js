import Homey from 'homey';
import apiHandlers from './api.js';

const API_DEFINITIONS = [
  { id: 'testApi', method: 'POST', path: '/test' },
  { id: 'discoverIos', method: 'POST', path: '/discover' },
  { id: 'autoSetup', method: 'POST', path: '/autosetup' },
];

export default class WiFiPoolApp extends Homey.App {
  async onInit() {
    this.log('[WiFiPool][App] init');

    this._flowTriggers = Object.create(null);
    this._flowConditions = Object.create(null);

    this._registerFlowCards();
    this._registerApiEndpoints();
  }

  _registerFlowCards() {
    const flow = this.homey?.flow;
    if (!flow) {
      this.error('[WiFiPool][App] Homey flow manager unavailable');
      return;
    }

    try {
      this._flowTriggers.flow_updated = flow.getDeviceTriggerCard('flow_updated');
      this._flowTriggers.health_changed = flow.getDeviceTriggerCard('health_changed');
      this._flowTriggers.redox_updated = flow.getDeviceTriggerCard('redox_updated');
      this._flowTriggers.temp_updated = flow.getDeviceTriggerCard('temp_updated');
      this._flowTriggers.ph_updated = flow.getDeviceTriggerCard('ph_updated');

      this._flowConditions.flow_above = flow.getConditionCard('flow_above');
      this._flowConditions.flow_below = flow.getConditionCard('flow_below');

      this._flowConditions.flow_above.registerRunListener(async ({ device, threshold }) => {
        return this._compareFlowAgainstThreshold({ device, threshold }, 'above');
      });

      this._flowConditions.flow_below.registerRunListener(async ({ device, threshold }) => {
        return this._compareFlowAgainstThreshold({ device, threshold }, 'below');
      });
    } catch (err) {
      this.error('[WiFiPool][App] Failed to register flow cards:', err?.message || err);
    }
  }

  _getFlowComparableValue(device) {
    if (!device) return null;

    if (typeof device.getCapabilityValue === 'function') {
      if (typeof device.hasCapability === 'function' && device.hasCapability('measure_flow')) {
        const value = device.getCapabilityValue('measure_flow');
        return Number.isFinite(value) ? value : null;
      }

      if (typeof device.hasCapability === 'function' && device.hasCapability('alarm_flow')) {
        const value = device.getCapabilityValue('alarm_flow');
        if (value === true) return 1;
        if (value === false) return 0;
      }
    }

    return null;
  }

  _compareFlowAgainstThreshold({ device, threshold }, mode) {
    const current = this._getFlowComparableValue(device);
    if (current == null) return false;

    const numericThreshold = Number(threshold);
    if (!Number.isFinite(numericThreshold)) return false;

    return mode === 'above'
      ? current > numericThreshold
      : current < numericThreshold;
  }

  _registerApiEndpoints() {
    const apiManager = this.homey?.api;
    if (!apiManager || typeof apiManager.register !== 'function') {
      this.error('[WiFiPool][App] ManagerApi unavailable, API routes not registered');
      return;
    }

    for (const def of API_DEFINITIONS) {
      const handler = apiHandlers?.[def.id];
      if (typeof handler !== 'function') {
        this.error(`[WiFiPool][App] Missing handler for API endpoint: ${def.id}`);
        continue;
      }

      try {
        apiManager.register({
          id: def.id,
          method: def.method,
          path: def.path,
        }, async (data = {}) => {
          try {
            return await handler({ ...data, homey: this.homey, app: this });
          } catch (err) {
            this.error(`[WiFiPool][App] API ${def.id} error:`, err?.message || err);
            throw err;
          }
        });
        this.log(`[WiFiPool][App] API endpoint registered: ${def.method} ${def.path}`);
      } catch (err) {
        this.error(`[WiFiPool][App] Failed to register API endpoint ${def.id}:`, err?.message || err);
      }
    }
  }

  async triggerDeviceFlow(cardId, device, tokens = {}, state = {}) {
    const card = this._flowTriggers?.[cardId];
    if (!card) {
      this.error(`[WiFiPool][App] Unknown flow trigger: ${cardId}`);
      return;
    }

    try {
      await card.trigger(device, tokens, state);
    } catch (err) {
      this.error(`[WiFiPool][App] Failed to trigger flow card ${cardId}:`, err?.message || err);
    }
  }
}
