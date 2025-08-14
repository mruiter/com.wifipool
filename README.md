# Homey WiFi Pool App (SDK3)

- Settings page: set **Email**, **Password**, **Domain**, **Polling interval**.
- Device: one "WiFi Pool Sensor" exposes capabilities `measure_redox`, `measure_ph`, `measure_flow`.
- Logging: extensive logs printed when running `homey app run`.

## Notes
- API endpoints based on the provided Home Assistant integration:
  - Login: `POST https://api.wifipool.eu/native_mobile/users/login` body `{ email, namespace:'default', password }`
  - Stats: `POST https://api.wifipool.eu/native_mobile/harmopool/getStats` body `{ after, domain, io }`
- IO constants used:
  - pH: `e61d476d-bbd0-4527-a9f5-ef0170caa33c.o3` (analog key '4')
  - Flow: `e61d476d-bbd0-4527-a9f5-ef0170caa33c.o0`
  - Redox: `e61d476d-bbd0-4527-a9f5-ef0170caa33c.o4` (analog key '1')

## Pairing
- Uses the app-level settings (no per-device credentials). Ensure settings are configured first.
