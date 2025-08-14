export default class {
  onPair(socket) {
    socket.on('add_device', async (data, callback) => {
      try {
        const device = {
          name: 'WiFi Pool',
          data: { id: 'wifipool-1' }
        };
        callback(null, device);
      } catch (e) {
        callback(e);
      }
    });
  }
}
