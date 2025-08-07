let authCookies = '';

export async function login(email, password) {
  const url = 'https://api.wifipool.eu/native_mobile/users/login';
  const loginData = { email, namespace: 'default', password };
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginData)
  });
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }
  authCookies = response.headers.get('set-cookie') || '';
  return { cookies: authCookies };
}
export function getCookies() {
  return authCookies;
}

export async function getStats(domain, io, cookies = authCookies) {
  const url = 'https://api.wifipool.eu/native_mobile/harmopool/getStats';
  const data = { after: 1723973699831, domain, io };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    throw new Error(`Data request failed: ${response.status}`);
  }
  return await response.json();
}

export function extractLatestValue(data, key) {
  if (Array.isArray(data) && data.length > 0) {
    const latestEntry = data[data.length - 1];
    const analog = latestEntry?.device_sensor_data?.analog;
    if (analog && analog[key] !== undefined) {
      return analog[key];
    }
  }
  return null;
}
