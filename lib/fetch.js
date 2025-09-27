let fetchFn = typeof globalThis.fetch === 'function'
  ? globalThis.fetch.bind(globalThis)
  : null;
let fetchModulePromise = null;

module.exports = (...args) => {
  if (fetchFn) {
    return fetchFn(...args);
  }
  if (!fetchModulePromise) {
    fetchModulePromise = import('node-fetch').then(mod => {
      fetchFn = mod.default || mod;
      return fetchFn;
    });
  }
  return fetchModulePromise.then(fn => fn(...args));
};
