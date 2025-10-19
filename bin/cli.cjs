#!/usr/bin/env node
// CJS wrapper for pkg to bootstrap ESM CLI entry
(async () => {
  try {
    await import('./torexxx-agent.js');
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }
})();