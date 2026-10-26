// Startup file for hosts that run this app with plain `node` (e.g. cPanel's "Setup Node.js
// App", which uses Phusion Passenger to run `node <startup file>` and reverse-proxies the
// public domain/port 80 to whatever internal port this process listens on via PORT).
//
// The server itself is TypeScript, run everywhere else via tsx (see package.json's "dev"
// script) — this registers tsx's loader first so the same source runs here too, with no
// separate compile step. cli-server.ts already reads process.env.PORT, which is exactly what
// Passenger sets.
import { register } from 'tsx/esm/api';

register();
await import('./src/cli-server.ts');
