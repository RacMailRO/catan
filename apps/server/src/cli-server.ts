import os from 'node:os';
import path from 'node:path';
import { createCatanServer } from './server';

const port = Number(process.env.PORT ?? 3001);
const dbPath = process.env.CATAN_DB ?? path.resolve(process.cwd(), 'catan-local.sqlite');
const assetsDir = path.resolve(process.cwd(), '../../poze');

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
  console.log(` Local URL : http://localhost:${boundPort}`);
  for (const ip of lanIps) {
    console.log(` LAN URL   : http://${ip}:${boundPort}`);
  }
  console.log(` Database  : ${dbPath}`);
  console.log('====================================================');
});
