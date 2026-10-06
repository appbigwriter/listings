// All fetch calls in this suite fail closed. Each test may install a narrower mock,
// but restoring it returns to this guard, never to the host's real fetch.
globalThis.fetch=async()=>{throw new Error('AG-01 isolated regression: network fetch is disabled.');};
