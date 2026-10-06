/**
 * Mock marketplace guard and safety harness.
 * Assegura bloqueio estrito contra qualquer chamada de rede externa real para marketplaces ou provedores de IA.
 */

export class ExternalCallBlockedError extends Error {
  constructor(url: string) {
    super(`Chamada externa bloqueada pelo harness de teste: ${url}`);
    this.name = 'ExternalCallBlockedError';
  }
}

export function installMarketplaceGuard() {
  const originalFetch = globalThis.fetch;
  const blockedHosts = [
    'sellingpartnerapi-na.amazon.com',
    'api.ebay.com',
    'marketplace.walmartapis.com',
    'api.openai.com',
    'api.anthropic.com',
  ];

  const safeMockHandler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlString = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    try {
      const parsed = new URL(urlString);
      if (blockedHosts.some((host) => parsed.hostname.toLowerCase().includes(host))) {
        throw new ExternalCallBlockedError(urlString);
      }
    } catch (e) {
      if (e instanceof ExternalCallBlockedError) throw e;
    }
    return originalFetch(input, init);
  };

  globalThis.fetch = safeMockHandler;

  return () => {
    globalThis.fetch = originalFetch;
  };
}
