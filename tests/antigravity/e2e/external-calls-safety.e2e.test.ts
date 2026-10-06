import { describe, expect, it } from 'vitest';
import { isSafeRemoteUrlSync } from '../../../lib/extract-security';
import { ExternalCallBlockedError, installMarketplaceGuard } from '../fixtures/mock-marketplaces';

describe('AG-01: Network Isolation & External Calls Safety Harness', () => {
  it('blocks all live marketplace API endpoints inside the test harness', async () => {
    const uninstall = installMarketplaceGuard();
    try {
      const endpoints = [
        'https://sellingpartnerapi-na.amazon.com/feeds/2021-06-30/feeds',
        'https://api.ebay.com/sell/inventory/v1/inventory_item',
        'https://marketplace.walmartapis.com/v3/feeds',
        'https://api.openai.com/v1/chat/completions',
      ];

      for (const endpoint of endpoints) {
        await expect(globalThis.fetch(endpoint)).rejects.toThrow(ExternalCallBlockedError);
      }
    } finally {
      uninstall();
    }
  });

  it('rejects forbidden SSRF targets, private ranges and IPv6 variations', () => {
    const maliciousUrls = [
      'http://127.0.0.1/admin',
      'http://10.0.0.1/secret',
      'http://172.16.0.1/config',
      'http://192.168.1.1/router',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/private',
      'http://[::ffff:127.0.0.1]/status',
      'http://[::ffff:169.254.169.254]/iam',
      'http://[::ffff:a9fe:a9fe]/credentials',
      'http://[::ffff:7f00:1]/env',
      'http://0.0.0.0/test',
      'file:///etc/passwd',
      'ftp://example.com/file',
    ];

    for (const url of maliciousUrls) {
      expect(isSafeRemoteUrlSync(url)).toBe(false);
    }

    // Public HTTPS URLs are permitted by the validator
    expect(isSafeRemoteUrlSync('https://cdn.example.com/image.jpg')).toBe(true);
    expect(isSafeRemoteUrlSync('https://www.amazon.com/dp/B0C1234567')).toBe(true);
  });
});
