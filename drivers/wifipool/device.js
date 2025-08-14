import Homey from 'homey';
import { WiFiPoolClient } from '../../lib/wifipool.mjs';

export default class WiFiPoolDevice extends Homey.Device {
  async onInit(){
    this.log('[WiFiPool] Device init', this.getName(), this.getData());
    this._client = new WiFiPoolClient({ homey: this.homey, log: (...a)=>this.log(...a), error: (...a)=>this.error(...a) });
    await this._ensureBaseCaps();
    this.reschedulePolling();
  }

  async onDeleted(){ if(this._interval) clearInterval(this._interval); }

  async _ensureBaseCaps(){
    const base = ['alarm_health'];
    for(const c of base){ if(!this.hasCapability(c)) await this.addCapability(c).catch(()=>{}); }
  }

  reschedulePolling(){
    if(this._interval) clearInterval(this._interval);
    const seconds = Math.max(15, Number(this.homey.settings.get('poll_interval') || 60));
    this.log(`[WiFiPool] Start polling every ${seconds}s`);
    this._interval = setInterval(() => this.pollOnce().catch(err => this.error('[WiFiPool] Poll error', err)), seconds*1000);
    this.pollOnce().catch(err => this.error(err));
  }

  async pollOnce(){
    const domain = this.homey.settings.get('domain');
    const deviceUuid = this.homey.settings.get('device_uuid');
    if(!domain){ this.error('[WiFiPool] Missing Domain in settings'); await this.setUnavailable('Set Domain'); await this.setCapabilityValue('alarm_health', true).catch(()=>{}); return; }
    if(!deviceUuid){ this.error('[WiFiPool] Missing Device UUID in settings'); await this.setUnavailable('Set Device UUID'); await this.setCapabilityValue('alarm_health', true).catch(()=>{}); return; }

    const ioMap = this.homey.settings.get('io_map') || {};
    const entries = Object.entries(ioMap).map(([io, meta]) => ({io, meta}));
    if(!entries.length){ this.log('[WiFiPool] No io_map, skipping poll. Use Auto Setup or Discover IOs in settings.'); return; }

    const client = this._client;
    this.log('[WiFiPool] Using domain=', domain, 'deviceUuid=', deviceUuid);
    for(const {io, meta} of entries){
      try{
        this.log('[WiFiPool] Fetching', meta.type, 'io=', io);
        const json = await client.getStat({ domain, io, after: 0 });
        const last = Array.isArray(json) && json.length ? json[json.length-1] : {};
        const dsd = last.device_sensor_data || {};
        const keys = dsd ? Object.keys(dsd).join(',') : '(none)';
        this.log('[WiFiPool] device_sensor_data keys:', keys);

        await this._applyReading(io, meta, dsd);
        await this.setAvailable().catch(()=>{});
        await this.setCapabilityValue('alarm_health', false).catch(()=>{});
      }catch(e){
        this.error('[WiFiPool] poll error for', io, e?.message||e);
        await this.setCapabilityValue('alarm_health', true).catch(()=>{});
      }
    }
  }

  async _applyReading(io, meta, dsd){
    switch(meta.type){
      case 'switch': {
        const idx = String(meta.index).replace(/[a-z]/i,'');
        const cap = `onoff_${meta.index}`; // e.g. onoff_o0
        if(!this.hasCapability(cap)) await this.addCapability(cap).catch(()=>{});
        if(!this[`__listener_${cap}`]){
          this[`__listener_${cap}`] = true;
          this.registerCapabilityListener(cap, async (value)=>{
            const domain = this.homey.settings.get('domain');
            const client = this._client;
            await client.setManualIO({ domain, io, value: value ? 1 : 0 });
          });
        }
        const state = dsd.switch ? !!dsd.switch[idx] : false;
        await this.setCapabilityValue(cap, state).catch(()=>{});
        break;
      }
      case 'ph': {
        if(!this.hasCapability('measure_ph')) await this.addCapability('measure_ph').catch(()=>{});
        const v = this._pickAnalog(dsd, meta.key);
        if(typeof v === 'number') await this.setCapabilityValue('measure_ph', v).catch(()=>{});
        this.homey.flow.getTriggerCard('ph_updated').trigger(this, { ph: v }).catch(()=>{});
        break;
      }
      case 'redox': {
        if(!this.hasCapability('measure_redox')) await this.addCapability('measure_redox').catch(()=>{});
        const v = this._pickAnalog(dsd, meta.key);
        if(typeof v === 'number') await this.setCapabilityValue('measure_redox', v).catch(()=>{});
        this.homey.flow.getTriggerCard('redox_updated').trigger(this, { redox: v }).catch(()=>{});
        break;
      }
      case 'flow': {
        if(!this.hasCapability('measure_flow')) await this.addCapability('measure_flow').catch(()=>{});
        let v = this._pickAnalog(dsd, meta.key);
        if(v == null && typeof dsd.flow !== 'undefined') v = Number(dsd.flow);
        if(typeof v === 'number') await this.setCapabilityValue('measure_flow', v).catch(()=>{});
        this.homey.flow.getTriggerCard('flow_updated').trigger(this, { flow: v }).catch(()=>{});
        break;
      }
      case 'temperature': {
        if(!this.hasCapability('measure_temperature')) await this.addCapability('measure_temperature').catch(()=>{});
        let v = this._pickAnalog(dsd, meta.key && meta.key.startsWith('ds18b20:') ? null : meta.key);
        if (v == null && typeof dsd.temperature !== 'undefined') v = Number(dsd.temperature);
        // DS18B20 path
        if (v == null && meta.key && String(meta.key).startsWith('ds18b20:')){
          const k = String(meta.key).split(':')[1];
          const n = dsd?.ds18b20?.[k]?.temperature;
          if (n != null) v = Number(n);
        }
        if(typeof v === 'number') await this.setCapabilityValue('measure_temperature', v).catch(()=>{});
        break;
      }
    }
  }

  _pickAnalog(dsd, key){
    const a = dsd.analog || {};
    if(key && a && a[key] != null){ const n = Number(a[key]); return Number.isFinite(n) ? n : undefined; }
    return undefined;
  }
}
