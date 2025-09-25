import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ZigBeeDevice } = require('homey-meshdriver');

const CAPABILITY_CLUSTER_MAP = {
  onoff: 'genOnOff',
  dim: 'genLevelCtrl',
  light_hue: 'lightingColorCtrl',
  light_saturation: 'lightingColorCtrl',
  light_temperature: 'lightingColorCtrl',
  light_mode: 'lightingColorCtrl',
};

export default class GledoptoLightDevice extends ZigBeeDevice {
  async onNodeInit({ zclNode } = {}) {
    if (typeof super.onNodeInit === 'function') {
      await super.onNodeInit({ zclNode });
    }

    if (typeof this.printNode === 'function') {
      this.printNode();
    }

    const capabilities = Array.isArray(this.getCapabilities?.()) ? this.getCapabilities() : [];

    for (const capability of capabilities) {
      const cluster = CAPABILITY_CLUSTER_MAP[capability];
      if (!cluster) continue;

      try {
        this.registerCapability(capability, cluster);
      } catch (error) {
        this.error?.(`Failed to register capability ${capability}:`, error?.message ?? error);
      }
    }
  }
}
