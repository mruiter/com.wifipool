// test/test.js
// Minimal sanity checks for the Homey WiFiPool app.
// Run with: npm test

const assert = require('assert').strict;
const fs = require('fs/promises');
const path = require('path');

const ROOT = __dirname;

const errors = [];
const warns  = [];

async function readJson(relPath) {
  const p = path.join(ROOT, relPath);
  try {
    const txt = await fs.readFile(p, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    throw new Error(`Failed to read/parse ${relPath}: ${e.message}`);
  }
}

async function checkApiModule() {
  const apiPath = path.join(ROOT, 'api.js');
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const handlers = require(apiPath);
    assert.ok(handlers && typeof handlers === 'object', 'api.js should export an object');
    for (const fn of ['testApi', 'discoverIos', 'autoSetup']) {
      assert.equal(typeof handlers[fn], 'function', `api.js export is missing function '${fn}'`);
    }
  } catch (e) {
    errors.push(`api.js import/shape failed: ${e.message}`);
  }
}

async function checkAppJson() {
  try {
    const app = await readJson('app.json');

    // Basic presence
    assert.ok(app && typeof app === 'object', 'app.json should be a JSON object');
    assert.ok(app.api && typeof app.api === 'object' && !Array.isArray(app.api),
      'app.json must have an "api" object');

    // Endpoints we expect
    const required = [
      { id: 'testApi',     path: '/test',      method: 'POST' },
      { id: 'discoverIos', path: '/discover',  method: 'POST' },
      { id: 'autoSetup',   path: '/autosetup', method: 'POST' },
    ];

    for (const r of required) {
      const hit = app.api[r.id];
      if (!hit ||
          hit.path !== r.path ||
          String(hit.method || '').toUpperCase() !== r.method) {
        errors.push(`app.json "api" is missing endpoint: ${r.id} ${r.method} ${r.path}`);
      }
    }
  } catch (e) {
    errors.push(e.message);
  }
}

async function checkDriverCompose() {
  try {
    const d = await readJson('drivers/wifipool/driver.compose.json');

    assert.equal(d.id, 'wifipool', 'driver.compose.json: "id" should be "wifipool"');
    assert.ok(d.class, 'driver.compose.json: missing "class"');
    assert.ok(Array.isArray(d.pair), 'driver.compose.json: "pair" must be an array');

    // One of our expected pair views should exist
    const pairIds = new Set(d.pair.map(v => v && v.id).filter(Boolean));
    if (!pairIds.has('start') && !pairIds.has('list_devices')) {
      errors.push('driver.compose.json: "pair" should contain a view with id "start" or "list_devices"');
    }

    // Capabilities are optional here, but if present, ensure it's an array
    if (d.capabilities && !Array.isArray(d.capabilities)) {
      errors.push('driver.compose.json: "capabilities" must be an array when present');
    }
  } catch (e) {
    errors.push(e.message);
  }
}

async function main() {
  console.log('🔎 Running WiFiPool app smoke tests…\n');

  await checkApiModule();
  await checkAppJson();
  await checkDriverCompose();

  for (const w of warns)  console.warn('⚠️  ' + w);
  for (const e of errors) console.error('❌ ' + e);

  if (errors.length) {
    console.error(`\n❌ Failed: ${errors.length} issue(s) found.`);
    process.exit(1);
  } else {
    console.log('\n✅ All checks passed.');
  }
}

main().catch(err => {
  console.error('❌ Test runner crashed:', err);
  process.exit(1);
});
