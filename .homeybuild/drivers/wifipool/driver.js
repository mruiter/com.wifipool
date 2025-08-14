import Homey from 'homey';

export default class WiFiPoolDriver extends Homey.Driver {
  onInit(){ this.log('[WiFiPool] Driver init'); }
  rescheduleAll(){ for(const d of this.getDevices()){ if(d?.reschedulePolling) d.reschedulePolling(); } }
  async onPairListDevices(){
    this.log('[WiFiPool] Pair: list_devices requested');
    return [{ name: 'WiFi Pool', data: { id: 'wifipool-1' } }];
  }
}
