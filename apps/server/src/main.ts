import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';

const { app } = await buildApp({
  dataDir: process.env.DATA_DIR ?? resolve(here, '../../../.data'),
  webDist: process.env.WEB_DIST ?? resolve(here, '../../web/dist'),
  logger: true,
});

await app.listen({ port, host });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void app.close().then(() => process.exit(0));
  });
}
