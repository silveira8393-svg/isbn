// Preload for simulated integration tests: all permitted HTTP calls must be injected/mocked.
globalThis.fetch = async () => { throw new Error('Real network forbidden in local tests'); };
