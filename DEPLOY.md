# Sincronizare & Deploy — Serverul Online (catan.d10.ro)

Procedură completă pentru a actualiza serverul online cu ultimele modificări din repo-ul GitHub: `https://github.com/RacMailRO/catan.git`.

Serverul rulează pe găzduire **cPanel**, cu Node.js pornit prin **"Setup Node.js App" (Phusion Passenger)**. Baza de date SQLite (`catan-local.sqlite`) păstrează datele reale și este protejată împotriva suprascrierii.

---

## Opțiunea 1: Deploy Automat prin GitHub Actions (Recomandat)

Am implementat un workflow de CI/CD complet în [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

### Cum funcționează:
1. La fiecare `git push origin main` (sau declanșare manuală din tab-ul **Actions** de pe GitHub):
   - Face checkout complet al repo-ului (istoric complet pentru generarea corectă a `version.json`).
   - Rulează pe runner **Node.js 22** (necesar pentru suportul nativ `node:sqlite`).
   - Instalează dependințele și rulează suita completă de teste (`npm test`) cu timeout de 60s pentru simulările AI.
   - Compilează backend-ul standalone (`server.mjs`) și frontend-ul Vite (`npm run build`).
   - Pregătește directorul de staging `.deploy/` cu structură dublă:
     - `apps/server/dist/*` și `apps/server/server-entry.mjs` (corespunzător configurării cPanel Passenger `Application startup file: apps/server/server-entry.mjs`).
     - `dist/*` și `server-entry.mjs` în rădăcină (pentru compatibilitate directă).
     - `apps/web/dist/*` (pentru servire statică Vite).
     - `tmp/restart.txt` și `apps/server/tmp/restart.txt` (Phusion Passenger repornește automat workerii la detectarea acestui fișier!).
   - Verifică automat că nicio bază de date SQLite (`*.sqlite*`) nu se află în pachetul de upload.
   - Sincronizează fișierele pe server prin **FTPS (FTP over TLS)** folosind `SamKirkland/FTP-Deploy-Action` cu `protocol: ftps` și `security: loose` (obligatoriu pe serverele cPanel cu Pure-FTPd).
   - Interoghează `https://catan.d10.ro/api/version` pentru a confirma că noua versiune este live.

### Configurarea secretelor pe GitHub (Un singur pas inițial)
În depozitul tău de pe GitHub, mergi la **Settings** → **Secrets and variables** → **Actions** → **New repository secret** și adaugă:

| Nume Secret | Descriere | Exemplu |
|---|---|---|
| `FTP_SERVER` | Adresa serverului FTP / cPanel | `ftp.d10.ro` sau `catan.d10.ro` |
| `FTP_USERNAME` | Utilizatorul FTP configurat în cPanel | `catan@d10.ro` sau utilizatorul cPanel |
| `FTP_PASSWORD` | Parola contului FTP | `ParolaTaSecurizata` |
| `FTP_SERVER_DIR` | *(Opțional)* Folderul aplicației pe server | `./` sau `/public_html/` |
| `FTP_PORT` | *(Opțional)* Portul FTP (implicit 21) | `21` |
| `FTP_PROTOCOL` | *(Opțional)* Protocolul de transfer | `ftp` sau `ftps` (implicit `ftp`) |

După setarea secretelor, orice `git push origin main` face deploy-ul automat în producție în ~1-2 minute!

---

## Opțiunea 2: Deploy Manual prin FTP Local

Dacă preferi să faci deploy manual de pe calculatorul local:

```bash
# 1. Local, în rădăcina proiectului:
npm run build
```

Apoi, prin clientul tău FTP (FileZilla, WinSCP, Cyberduck):

| Sursă (local) | Destinație (pe server, în folderul aplicației) |
|---|---|
| `apps/server/server-entry.mjs` | `server-entry.mjs` |
| `apps/server/dist/` (tot folderul) | `dist/` |

> ⚠️ **ATENȚIE CRITICĂ — Baza de date SQLite**:
> **NU** urca fișierul local `apps/server/catan-local.sqlite` peste server! Fișierul de pe server conține jocurile reale și clasamentul online.

### Repornire aplicație (cPanel):
- **Automat**: Creează/actualizează un fișier gol `tmp/restart.txt` în folderul aplicației. Phusion Passenger va reîncărca automat procesele Node.
- **Manual**: Din cPanel → **Setup Node.js App** → selectează aplicația → **Restart**.

---

## Verificare după deploy

Rulează:
```bash
curl -s https://catan.d10.ro/api/version
```

Răspunsul JSON trebuie să conțină hash-ul ultimului commit de pe `main`.

---

## Rollback rapid în caz de probleme

Dacă un deploy conține un defect neprevăzut:

```bash
git checkout HEAD~1
npm run build
git push -f origin main
```
Sau din GitHub Actions, re-rulează manual ultimul workflow de deploy care a funcționat cu succes.
