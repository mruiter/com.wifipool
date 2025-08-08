const fetch = require('node-fetch');
const https = require('https');

const API_HOST = 'api.wifipool.eu';
const API_BASE_URL = `https://${API_HOST}`;

async function apiFetch(path, options = {}, ip) {
  if (ip) {
    const agent = new https.Agent({ servername: API_HOST });
    const headers = { ...(options.headers || {}), Host: API_HOST };
    return fetch(`https://${ip}${path}`, { ...options, headers, agent });
  }
  return fetch(`${API_BASE_URL}${path}`, options);
}

let authCookies = '';
let userDomain = '';

// Login bij WiFi Pool API en sla cookies en relevante info op
async function login(email, password, ip) {
  const path = '/native_mobile/users/login';
  const loginData = { email, namespace: 'default', password };
  const safeLoginData = { ...loginData, password: '***' };

  console.log('WiFi Pool API login request', { path, body: safeLoginData });

  const response = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginData),
  }, ip);

  console.log('WiFi Pool API login response', { status: response.status });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }

  authCookies = response.headers.get('set-cookie') || '';

  // Probeer het domein uit de login response op te slaan
  try {
    const body = await response.json();
    console.log('WiFi Pool API login data', body);
    userDomain = body?.user?.domain || '';
  } catch (err) {
    // Als het parsen mislukt, is het niet fataal
    userDomain = '';
  }

  // Na succesvolle login probeer alle beschikbare informatie op te vragen
  if (userDomain) {
    await logAllInfo(userDomain, authCookies, ip);
  }

  return { cookies: authCookies, domain: userDomain };
}

// Haal de opgeslagen cookies op
function getCookies() {
  return authCookies;
}

// Haal het gedetecteerde domein op
function getDomain() {
  return userDomain;
}

// Vraag actuele statistieken op
async function getStats(domain, io, cookies = authCookies, ip) {
  const path = '/native_mobile/harmopool/getStats';
  const data = { after: 0, domain, io };

  console.log('WiFi Pool API stats request', { path, domain, io });
  console.log('WiFi Pool API stats payload', data);

  const response = await apiFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies
    },
    body: JSON.stringify(data),
  }, ip);

  console.log('WiFi Pool API stats response', { status: response.status });

  if (!response.ok) {
    throw new Error(`Data request failed: ${response.status}`);
  }

  const json = await response.json();
  console.log('WiFi Pool API stats data', json);
  return json;
}

// Haal beschikbare sensoren voor een domein op
async function getSensors(domain, cookies = authCookies, ip) {
  const path = '/native_mobile/harmopool/getSensors';
  const data = { domain };

  console.log('WiFi Pool API sensors request', { path, domain });
  console.log('WiFi Pool API sensors payload', data);

  const response = await apiFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies
    },
    body: JSON.stringify(data),
  }, ip);

  console.log('WiFi Pool API sensors response', { status: response.status });

  if (!response.ok) {
    throw new Error(`Sensors request failed: ${response.status}`);
  }

  const json = await response.json();
  console.log('WiFi Pool API sensors data', json);
  return json;
}

// Log alle beschikbare sensoren en hun data
async function logAllInfo(domain, cookies = authCookies, ip) {
  try {
    const sensorsResponse = await getSensors(domain, cookies, ip);
    const sensors = Array.isArray(sensorsResponse)
      ? sensorsResponse
      : Array.isArray(sensorsResponse?.sensors)
        ? sensorsResponse.sensors
        : [];

    console.log('WiFi Pool API available sensors', sensors);

    for (const sensor of sensors) {
      const io = sensor?.io;
      if (io) {
        try {
          const stats = await getStats(domain, io, cookies, ip);
          console.log('WiFi Pool API sensor stats', { io, stats });
        } catch (err) {
          console.log('WiFi Pool API sensor stats error', { io, error: err.message || err });
        }
      }
    }
  } catch (err) {
    console.log('WiFi Pool API sensors fetch error', err.message || err);
  }
}


// Extract laatste waarde voor een key uit "analog" sensor data
function extractAnalog(data, key) {
  if (Array.isArray(data) && data.length > 0) {
    const latestEntry = data[data.length - 1];
    const analog = latestEntry?.device_sensor_data?.analog;
    if (analog && analog[key] !== undefined) {
      return analog[key];
    }
  }
  return null;
}

// Extract laatste waarde voor een key uit "switch" sensor data
function extractSwitch(data, key) {
  if (Array.isArray(data) && data.length > 0) {
    const latestEntry = data[data.length - 1];
    const sw = latestEntry?.device_sensor_data?.switch;
    if (sw && sw[key] !== undefined) {
      return sw[key];
    }
  }
  return null;
}

// Export functies op CommonJS-manier
module.exports = {
  login,
  getCookies,
  getDomain,
  getStats,
  getSensors,
  extractAnalog,
  extractSwitch
};
