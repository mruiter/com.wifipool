const fetch = require('node-fetch');

let authCookies = '';

// Login bij WiFi Pool API en sla cookies op
async function login(email, password) {
  const url = 'https://api.wifipool.eu/native_mobile/users/login';
  const loginData = { email, namespace: 'default', password };

  console.log('WiFi Pool API login request', { url, email });

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
  return { cookies: authCookies };
}

// Haal de opgeslagen cookies op
function getCookies() {
  return authCookies;
}

// Vraag actuele statistieken op
async function getStats(domain, io, cookies = authCookies) {
  const url = 'https://api.wifipool.eu/native_mobile/harmopool/getStats';
  const data = { after: 1723973699831, domain, io };

  console.log('WiFi Pool API stats request', { url, domain, io });

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
async function getDevices(cookies = authCookies) {
  const url = 'https://api.wifipool.eu/native_mobile/harmopool/getDevice';

  console.log('WiFi Pool API devices request', { url });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies
    },
    body: JSON.stringify({})
  });

  console.log('WiFi Pool API devices response', { status: response.status });

  if (!response.ok) {
    throw new Error(`Device request failed: ${response.status}`);
  }

  const json = await response.json();
  console.log('WiFi Pool API devices data', json);
  return json;
}

// Extract laatste waarde voor een key uit sensor data
function extractLatestValue(data, key) {
  if (Array.isArray(data) && data.length > 0) {
    const latestEntry = data[data.length - 1];
    const analog = latestEntry?.device_sensor_data?.analog;
    if (analog && analog[key] !== undefined) {
      return analog[key];
    }
  }
  return null;
}

// Export functies op CommonJS-manier
module.exports = {
  login,
  getCookies,
  getStats,
  getDevices,
  extractLatestValue
};
