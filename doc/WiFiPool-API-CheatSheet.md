# WiFiPool API – Practical Cheat Sheet

_Last updated: 2025-08-14 08:10 UTC_

> This cheat sheet is based on observed traffic from the official mobile app and your working traces.
> Endpoints may change without notice — treat this as *best‑effort* documentation.

---

## Base URL

```
https://api.wifipool.eu/native_mobile
```

All endpoints below are relative to `/native_mobile`. The API uses a session cookie (`connect.sid`) after login.

---

## Authentication

### Login

**Endpoint**: `POST /users/login`

**Headers**: `Content-Type: application/json`

**Body**:
```json
{
  "email": "user@example.com",
  "password": "••••••••",
  "namespace": "default"
}
```

**Notes**
- On success you receive HTTP 200 with a JSON body and a `Set-Cookie: connect.sid=...` header.
- Reuse that cookie for subsequent requests.

**cURL example**:
```bash
curl -i -sS -X POST "https://api.wifipool.eu/native_mobile/users/login"   -H "Content-Type: application/json"   -d '{"email":"$EMAIL","password":"$PASSWORD","namespace":"default"}'   -c cookie.txt
```

---

## Discovering your Domain & IOs

### 1) List accessible groups (domains)

**Endpoint**: `GET /groups/accessible`

**Returns** an array; each entry has `mobile_group_data` with `devices` and `io` arrays.
The **domain id** used elsewhere (called `domain` in stats) corresponds to the group id that the app uses.
From real logs the domain looked like a UUID (e.g. `2ca59577-c9db-4420-b15e-fc38bc2be790`).

**cURL**:
```bash
curl -sS "https://api.wifipool.eu/native_mobile/groups/accessible"   -b cookie.txt > groups.json
```

**How to extract the domain (jq)**:
```bash
jq -r '.[0].mobile_group_id // .[0].mobile_group // .[0].id // empty' groups.json
```
> If the above path doesn't exist in your output, inspect `groups.json` to locate the domain id field. In your logs we derived the
> domain from this response via the app's own heuristics.

### 2) Get detailed group info (devices & IO strings)

**Endpoint**: `POST /groups/getInfo`

**Body**:
```json
{
  "domainId": "<your-domain-uuid>"
}
```

**Response** includes `mobile_group_data.io[]` with entries like:
```json
{
  "id": "6f6a...55ab.o4",
  "device": "6f6a...55ab",
  "type": "boolean" | "number" | "other",
  "dataType": "switch" | "analog" | "ds18b20" | ...
}
```

These IO **id** strings (e.g. `<device_uuid>.o4`, `<device_uuid>.i0`) are used with `harmopool/getStats`.

**cURL**:
```bash
curl -sS -X POST "https://api.wifipool.eu/native_mobile/groups/getInfo"   -H "Content-Type: application/json"   -b cookie.txt   -d '{"domainId":"$DOMAIN"}' > group_info.json
```

---

## Reading Values (history stream)

**Endpoint**: `POST /harmopool/getStats`

**Body**:
```json
{
  "domain": "<your-domain-uuid>",
  "io": "<device_uuid>.<port>",
  "after": 0
}
```
- `io` is one of the strings from `group_info.mobile_group_data.io[].id` (e.g. `6f6a…55ab.o4`).
- `after` can be `0` (all historical data) or a UNIX epoch milliseconds to fetch only newer datapoints.

**Typical responses** (array of entries):
- **Switch (sensor history)**:
  ```json
  {
    "device_sensor_data": { "switch": { "1": true } },
    "device_sensor_time": "2025-08-12T07:00:00.985Z"
  }
  ```
- **Relay state (device state history)**:
  ```json
  {
    "device_state_data": { "power": { "1": false } },
    "device_state_time": "2025-08-12T06:54:00.447Z"
  }
  ```
- **Analog values (e.g., pH, ORP/Redox)**:
  ```json
  {
    "device_sensor_data": { "analog": { "4": 6.416 } },
    "device_sensor_time": "2025-08-06T12:28:31.358Z"
  }
  ```
- **Temperature (DS18B20)**:
  ```json
  {
    "device_sensor_data": { "ds18b20": { "1": { "temperature": 21.1 } } },
    "device_sensor_time": "2025-08-06T13:58:31.433Z"
  }
  ```

**Observed mapping on your device (example only, may differ per installation):**
- `...o4` → **pH** (analog channel `4`, values ~5–8)
- `...o5` → **Redox / ORP** (analog channel `1`, values ~600–700 mV range)
- `...o8` → **Temperature** (ds18b20, key `1` → temperature in °C)
- `...o0..o3` → **Sensor switch history** (switch channels 1–4)
- `...i0..i3` → **Relay power state history** (power channels 1–4)
- Other analog (`...o6`, `...o7`, etc.) may be flow, conductivity, or levels — determine by inspecting value ranges & units.

**cURL example**:
```bash
curl -sS -X POST "https://api.wifipool.eu/native_mobile/harmopool/getStats"   -H "Content-Type: application/json"   -b cookie.txt   -d '{"domain":"$DOMAIN","io":"$IO","after":0}'
```

---

## Practical Discovery Recipe

1. **Login** → store cookie.
2. **GET** `/groups/accessible` → pick your group + domain id.
3. **POST** `/groups/getInfo` with `domainId` → collect `io[].id` strings and the `device` UUID.
4. For each `io.id`, **POST** `/harmopool/getStats` with `after: 0` → inspect payload keys to categorize:
   - `device_sensor_data.switch` → binary sensor (e.g., switch channels).
   - `device_state_data.power` → relay state channels.
   - `device_sensor_data.analog` → numeric sensors (pH, ORP/Redox, flow, conductivity).
   - `device_sensor_data.ds18b20` → temperature sensors.
5. Map relevant channels to your app (e.g., pH, Redox, Flow, Temperature, Relays 1–4).

---

## Error Handling

- **404 Unknown domain/io**: Your `domain` or `io` string is wrong or not visible to the session.
- **401/403**: Session expired — re‑login and reuse the fresh `connect.sid`.
- **Non‑JSON body (e.g., `"Unknown domain"`)**: Treat as error and avoid JSON parsing on that response.

---

## Polling Guidance

- A **60s** poll interval works well in practice.
- For history syncing, use `after` with last timestamp seen (in **epoch ms**) to avoid re‑processing old data.

---

## Example: Node.js (fetch)

```js
import fetch from "node-fetch";
const BASE = "https://api.wifipool.eu/native_mobile";

async function login(email, password) {
  const r = await fetch(`${BASE}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, namespace: "default" }),
    redirect: "manual",
  });
  const setCookie = r.headers.get("set-cookie");
  if (!r.ok || !setCookie) throw new Error("Login failed");
  return setCookie.split(";")[0]; // "connect.sid=..."
}

async function getAccessible(cookie) {
  const r = await fetch(`${BASE}/groups/accessible`, { headers: { cookie } });
  return r.json();
}

async function getGroupInfo(cookie, domainId) {
  const r = await fetch(`${BASE}/groups/getInfo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ domainId }),
  });
  return r.json();
}

async function getStats(cookie, domain, io, after=0) {
  const r = await fetch(`${BASE}/harmopool/getStats`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ domain, io, after }),
  });
  if (!r.ok) throw new Error(`getStats ${r.status}`);
  return r.json();
}
```

---

## Quick Reference

- **Login**: `POST /users/login` → cookie `connect.sid`
- **List groups**: `GET /groups/accessible`
- **Group details**: `POST /groups/getInfo` with `{"domainId": "<uuid>"}`
- **Read history**: `POST /harmopool/getStats` with `{"domain":"<uuid>","io":"<device>.<port>","after":<ms>}`

---

## Security Tips

- Store credentials securely and never log raw passwords.
- Treat `connect.sid` as a secret; rotate by re‑login if leaked.
- Rate‑limit polling to avoid service abuse.

---

*Happy hacking!*
