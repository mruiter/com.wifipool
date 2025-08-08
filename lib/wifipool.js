const fetch = require('node-fetch');

let authCookies = '';
let userDomain = '';

// Login bij WiFi Pool API en sla cookies en relevante info op
async function login(email, password) {
  const url = 'https://api.wifipool.eu/native_mobile/users/login';
  const loginData = { email, namespace: 'default', password };
  const safeLoginData = { ...loginData, password: '***' };

  console.log('WiFi Pool API login request', { url, body: safeLoginData });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginData)
  });

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
async function getStats(domain, io, cookies = authCookies) {
  const url = 'https://api.wifipool.eu/native_mobile/harmopool/getStats';
  const data = { after: 0, domain, io };

  console.log('WiFi Pool API stats request', { url, domain, io });
  console.log('WiFi Pool API stats payload', data);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies
    },
    body: JSON.stringify(data)
  });

  console.log('WiFi Pool API stats response', { status: response.status });

  if (!response.ok) {
    throw new Error(`Data request failed: ${response.status}`);
  }

  const json = await response.json();
  console.log('WiFi Pool API stats data', json);
  return json;
}

// Vraag lijst met beschikbare devices op
async function getDevices(domain = userDomain, cookies = authCookies) {
  const url = 'https://api.wifipool.eu/native_mobile/harmopool/getDevice';

  console.log('WiFi Pool API devices request', { url, domain });

  const body = domain ? { domain } : {};
  console.log('WiFi Pool API devices payload', body);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies
    },
    body: JSON.stringify(body)
  });

  console.log('WiFi Pool API devices response', { status: response.status });

  if (!response.ok) {
    throw new Error(`Device request failed: ${response.status}`);
  }

  const json = await response.json();
  console.log('WiFi Pool API devices data', json);
  return json;
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
  getDevices,
  extractAnalog,
  extractSwitch
};
