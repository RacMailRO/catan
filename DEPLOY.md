# Sincronizare & Deploy — Serverul Online (catan.d10.ro)

Procedură pentru a actualiza serverul online cu ultimele modificări din acest repo.
Serverul de producție rulează pe hosting cPanel, cu Node.js pornit prin "Setup Node.js App"
(Phusion Passenger).

## Pe scurt (varianta rapidă)

```bash
# 1. Local: trimite codul nou
git push origin main

# 2. Pe server (SSH), în directorul aplicației:
git pull origin main
npm install --include=dev
npm run build

# 3. Din cPanel → Setup Node.js App → Restart
```

Dacă toți pașii de mai jos sunt deja familiari, atât e nevoie. Secțiunile următoare explică
*de ce* fiecare pas contează și ce poate merge prost.

---

## 1. Trimite codul nou pe server

```bash
git push origin main
```

Pe server, în directorul aplicației (cel configurat ca "Application root" în cPanel):

```bash
git pull origin main
```

## 2. Instalează dependințele — cu `--include=dev`

```bash
npm install --include=dev
```

**Important:** NU folosi butonul "Run NPM Install" din panoul cPanel și NU rula doar
`npm install` fără flag. Pe acest host, `npm install` simplu (sau butonul din panou) nu
rezolvă corect workspace-urile monorepo-ului (`packages/*`, `apps/*`) — se termină instant
cu „up to date” fără să instaleze nimic, chiar dacă `.npmrc`/`npm config` arată configurația
corectă. Cauza exactă nu a fost identificată definitiv, dar `npm install --include=dev` rulat
manual din SSH funcționează constant. De asemenea, `NODE_ENV=production` (setat automat de
Passenger) ar șterge `devDependencies` — motiv suplimentar pentru `--include=dev` explicit.

## 3. Build (frontend + backend)

```bash
npm run build
```

Acest pas (vezi `package.json` → `build`):
1. Generează `version.json` (versiune + changelog, citite din `git log`).
2. Compilează frontend-ul React cu Vite → `apps/web/dist`.
3. Compilează backend-ul într-un singur fișier standalone, cu esbuild →
   `apps/server/dist/server.mjs` — **fără nicio dependență de `tsx`/`esbuild` la runtime**.
   Acest pas copiază automat și frontend-ul compilat în `apps/server/dist/public`, ca
   serverul să fie complet independent (un singur proces Node servește atât API-ul/WebSocket
   cât și fișierele statice ale jocului).
4. Regenerează `version.json` cu commit-ul final.

Dacă build-ul e prea greu de rulat direct pe hosting-ul partajat (memorie limitată), poate fi
rulat local și doar folderele rezultate (`apps/web/dist`, `apps/server/dist`) urcate prin
git/FTP — dar varianta simplă (build direct pe server) a funcționat până acum.

## 4. Repornește aplicația

Din cPanel → **Setup Node.js App** → selectează aplicația → **Restart**.

Punctul de pornire configurat în cPanel trebuie să fie `apps/server/server-entry.mjs`. Acest
fișier alege automat varianta corectă:
- dacă `apps/server/dist/server.mjs` există (adică pasul de build de mai sus a rulat) →
  pornește direct acel bundle, cu `node` nativ, fără `tsx`;
- altfel (mediu de dezvoltare) → cade pe înregistrarea `tsx` și rulează sursa TypeScript direct.

În producție, prima variantă trebuie să fie mereu cea folosită — dacă loguri arată că
`tsx`/`esbuild` rulează la fiecare pornire (lent, consum mare de memorie), înseamnă că
`npm run build` nu a fost rulat sau `apps/server/dist/` lipsește.

## 5. Verificare rapidă după deploy

```bash
curl -s https://catan.d10.ro/api/version
```

Ar trebui să răspundă cu JSON conținând `version`, `commitCount` și `shortHash` — iar
`shortHash` trebuie să corespundă cu ultimul commit trimis (`git log -1 --format=%h` local).
Dacă nu corespunde, aplicația Node nu a fost repornită sau build-ul a eșuat silențios —
verifică logul de erori din cPanel (`stderr.log` în directorul aplicației).

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
- `CATAN_ASSETS_DIR` — opțional, suprascrie unde caută serverul imaginile jocului (`poze/`),
  dacă structura de foldere de pe host diferă de cea locală.

## Rollback

Dacă un deploy produce o problemă:

```bash
git log --oneline -10     # identifică ultimul commit bun
git checkout <hash-ul bun>
npm install --include=dev
npm run build
```

Apoi Restart din cPanel. (`git checkout <hash>` lasă repo-ul în "detached HEAD" — e suficient
pentru un rollback temporar; pentru a reveni definitiv, `git checkout main` după ce problema
e rezolvată și re-trimisă pe `main`.)
