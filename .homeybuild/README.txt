Adds Beniferro WifiPool support for monitoring your Redox, pH, temperature and flow

App Settings page: Just to test/log login, find the device domain and connected modules.
When adding device the credentials and the discovery will be done for the device
Device: one "WiFi Pool Sensor" exposes capabilities `measure_redox`, `measure_ph`, `measure_temperature`, `alarm_flow`.
Logging: extensive logs printed when running `homey app run`.

API endpoints are based on capturing the communication, official documentation is not available
Important: Any change on the side of Beniferro isn't communicated and could break the functionality of this app

