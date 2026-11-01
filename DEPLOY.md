# Sincronizare & Deploy — Serverul Online (catan.d10.ro)

Procedură pentru a actualiza serverul online cu ultimele modificări din acest repo.
Repo-ul git **există doar local** — serverul nu are git/SSH, deci totul se face prin
**build local + upload FTP**. Serverul rulează pe hosting cPanel, cu Node.js pornit prin
"Setup Node.js App" (Phusion Passenger).

## Pe scurt (varianta rapidă)

```bash
# 1. Local, în acest folder:
npm run build
```

Apoi, prin clientul tău FTP, încarcă pe server (suprascriind ce există deja):

| Sursă (local)              | Destinație (server, în folderul aplicației) |
|-----------------------------|----------------------------------------------|
| `apps/server/server-entry.mjs` | `server-entry.mjs`                        |
| `apps/server/dist/` (tot folderul) | `dist/`                               |

**NU** urca fișierul local `apps/server/catan-local.sqlite` (dacă există) — vezi
secțiunea "Baza de date" mai jos, s-ar pierde datele reale de pe server.

La final: **Repornește din cPanel → Setup Node.js App → Restart.**

Dacă pașii de mai sus sunt deja familiari, atât e nevoie. Secțiunile următoare explică
*de ce* fiecare pas contează și ce poate merge prost.

---

## 1. Build local

```bash
npm run build
```

Acest pas (vezi `package.json` → `build`):
1. Generează `version.json` (versiune + changelog, citite din `git log` local).
2. Compilează frontend-ul React cu Vite → `apps/web/dist` (include și compilarea Tailwind
   CSS, automat, ca parte a acestui pas — nu există o comandă separată de rulat pentru CSS).
3. Compilează backend-ul într-un **singur fișier standalone**, cu esbuild →
   `apps/server/dist/server.mjs`. Acest bundle conține deja tot codul (inclusiv
   `packages/core`, `packages/ai`, `packages/protocol` și dependințele `ws`/`zod`) —
   **serverul nu are nevoie de `node_modules` pe server, deloc.** Pasul de build copiază
   automat și frontend-ul compilat + toate imaginile jocului (`poze/*.jpg`, `*.png`) în
   `apps/server/dist/public`, ca un singur folder `dist/` să fie 100% autonom.
4. Regenerează `version.json` cu commit-ul final.

După acest pas, totul ce trebuie urcat pe server se află în 2 locuri:
- `apps/server/server-entry.mjs` (punctul de pornire, un fișier mic)
- `apps/server/dist/` (tot ce înseamnă aplicația compilată — ~110 fișiere, cod + imagini)

Nimic din restul repo-ului (`packages/`, `apps/web/src`, `node_modules`, `.git`) nu trebuie
urcat pe server.

## 2. Upload prin FTP

Conectează-te cu clientul FTP la server, navighează în folderul aplicației (cel configurat
ca "Application root" în cPanel → Setup Node.js App) și:

1. Urcă `apps/server/server-entry.mjs`, suprascriind versiunea existentă.
2. Urcă tot conținutul folderului `apps/server/dist/` în `dist/` pe server (suprascriind
   `server.mjs`, `version.json` și fișierele din `public/`). Dacă clientul FTP are o
   funcție de sincronizare/oglindire a unui folder, e cea mai sigură variantă — altfel,
   șterge manual `dist/` vechi de pe server înainte și urcă-l pe cel nou, ca să nu rămână
   fișiere vechi orfane din build-uri anterioare.

Nu trebuie create alte foldere și nu trebuie atinse `package.json`/`node_modules` de pe
server — bundle-ul standalone nu are nevoie de ele.

## 3. Baza de date — NU o suprascrie

Serverul ține scorurile/jocurile active într-un fișier SQLite creat lângă `server-entry.mjs`
(nu în `dist/`), numit implicit `catan-local.sqlite`. Acest fișier se creează singur la prima
pornire și **conține datele reale ale jocurilor jucate pe server**. El nu face parte din
`dist/` și build-ul local nu-l atinge — dar ai grijă, dacă ai jucat și local, să NU urci din
greșeală fișierul tău local `apps/server/catan-local.sqlite` peste cel de pe server (i-ar
înlocui datele reale cu cele de test de pe laptop).

## 4. Repornește aplicația

Din cPanel → **Setup Node.js App** → selectează aplicația → **Restart**.

Punctul de pornire configurat în cPanel trebuie să fie `server-entry.mjs`. Acest fișier
alege automat varianta corectă:
- dacă `dist/server.mjs` există (adică ai urcat folderul `dist/` de mai sus) → pornește
  direct acel bundle, cu `node` nativ, fără `tsx`/`esbuild`;
- altfel → încearcă varianta de dezvoltare (necesită `tsx`, nu funcționează fără
  `node_modules` — nu e cazul normal în producție).

## 5. Verificare rapidă după deploy

```bash
curl -s https://catan.d10.ro/api/version
```

Ar trebui să răspundă cu JSON conținând `version`, `commitCount` și `shortHash` — iar
`shortHash` trebuie să corespundă cu ultimul commit local (`git log -1 --format=%h`, rulat
local, înainte de `npm run build`). Dacă nu corespunde, aplicația Node nu a fost repornită
sau upload-ul FTP nu s-a terminat complet — verifică și logul de erori din cPanel
(`stderr.log` în directorul aplicației).

## Note despre WebSocket pe acest hosting

Reverse-proxy-ul folosit de acest hosting (Apache/LiteSpeed prin Phusion Passenger) poate
bloca cererile de upgrade WebSocket, în funcție de configurația găzduirii. Clientul web are
deja un mecanism de rezervă: dacă WebSocket-ul nu se conectează, trece automat pe sincronizare
prin polling REST (interogare periodică la fiecare ~3 secunde) — jocul rămâne funcțional, doar
puțin mai puțin instant. Nu necesită nicio acțiune manuală după deploy; dacă vrei să verifici
care dintre cele două e activă, inspectează consola browserului (Network tab) pentru conexiuni
`wss://` reușite vs. cereri repetate către `/api/games/.../state`.

## Variabile de mediu relevante

- `PORT` — portul pe care ascultă serverul Node (implicit `3001`; cPanel îl setează automat
  pentru aplicația Passenger).
- `CATAN_DB` — opțional, suprascrie unde se creează fișierul SQLite (implicit
  `catan-local.sqlite` lângă `server-entry.mjs`).
- `CATAN_ASSETS_DIR` — opțional, suprascrie unde caută serverul imaginile jocului, dacă din
  vreun motiv nu sunt găsite automat în `dist/public`.

## Rollback

Dacă un deploy produce o problemă:

```bash
git log --oneline -10          # identifică ultimul commit bun, local
git checkout <hash-ul bun>
npm run build
```

Apoi urcă `server-entry.mjs` + `dist/` ca mai sus și Restart din cPanel. (`git checkout
<hash>` lasă repo-ul local în "detached HEAD" — e suficient pentru un rollback temporar;
pentru a reveni definitiv, `git checkout main` după ce problema e rezolvată.)
