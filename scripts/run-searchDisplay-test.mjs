import { register } from 'node:module';

register(new URL('./node-ts-resolve.mjs', import.meta.url));
await import('./searchDisplay.test.ts');
