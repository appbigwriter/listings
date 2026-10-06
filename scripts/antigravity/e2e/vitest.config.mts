import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['tests/antigravity/e2e/**/*.e2e.test.ts'],setupFiles:['tests/antigravity/fixtures/no-network.ts'],testTimeout:30000,hookTimeout:30000}});
