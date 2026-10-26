import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCatanServer } from './server';

const port = Number(process.env.PORT ?? 3001);
const dbPath = process.env.CATAN_DB ?? path.resolve(process.cwd(), 'catan-local.sqlite');

const candidateAssetsDirs = [
  process.env.CATAN_ASSETS_DIR,
  path.resolve(process.cwd(), '../../poze'),
  path.resolve(process.cwd(), '../poze'),
  path.resolve(process.cwd(), 'poze'),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../poze'),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../poze')
].filter((d): d is string => Boolean(d && fs.existsSync(d)));

const assetsDir = candidateAssetsDirs[0] ?? path.resolve(process.cwd(), 'poze');

const server = createCatanServer({
  dbPath,
  assetsDir
});

server.listen(port, '0.0.0.0').then(({ port: boundPort }) => {
  const interfaces = os.networkInterfaces();
  const lanIps: string[] = [];
  for (const list of Object.values(interfaces)) {
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal) {
        lanIps.push(iface.address);
      }
    }
  }

  console.log('====================================================');
  console.log(` Catan Authoritative Server (LAN & Online) Started`);
  console.log(` This single process also serves the game itself — open it directly:`);
  console.log(` Local URL : http://localhost:${boundPort}`);
  for (const ip of lanIps) {
    console.log(` LAN URL   : http://${ip}:${boundPort}  <- share this with other players`);
  }
  console.log(` Database  : ${dbPath}`);
  console.log(' (Run "npm run build --workspace=@catan/web" first if the game does not load.)');
  console.log('====================================================');
});
