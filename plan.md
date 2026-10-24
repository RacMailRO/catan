Am adăugat două cerințe importante în specificația proiectului:

1. Componența fiecărei partide este configurabilă. La crearea partidei se aleg între 1 și 4 participanți, fiecare fiind fie om, fie adversar controlat de calculator. Sunt posibile toate combinațiile, inclusiv patru oameni, patru algoritmi sau configurații mixte. Pentru partidele cu mai puțin de trei participanți, vom defini variante explicite ale regulilor, fără să modificăm implicit regulile clasice.
2. Fiecare partidă poate fi înregistrată și analizată ulterior. Vom putea reda partida pas cu pas, examina deciziile fiecărui participant, vedea informațiile disponibile în momentul deciziei și compara mutările alese cu alternativele posibile. În cazul AI-ului, înregistrările vor servi și la identificarea slăbiciunilor strategice și la îmbunătățirea algoritmilor.

A doua cerință merită tratată ca un subsistem de sine stătător, nu doar ca un istoric de mutări. Dacă îl proiectăm corect, va deveni unul dintre instrumentele principale pentru dezvoltarea și evaluarea adversarilor.

# Planul complet de proiectare și dezvoltare — Catan

Versiunea 1.0 · Specificație de produs, arhitectură software, reguli, AI, multiplayer și testare

## 1. Viziunea proiectului

Obiectivul este construirea unui joc de strategie inspirat de Catan, cu reguli clasice implementate riguros, adversari algoritmici competitivi și suport pentru joc local și online.

Proiectul va avea două obiective egale:

- Joc complet funcțional: o partidă de la configurare până la victorie, cu interfață grafică, adversari umani și calculator, salvare și reluare.
- Platformă de cercetare și îmbunătățire a strategiilor: partide automate, înregistrări reproductibile, replay pas cu pas și instrumente de evaluare a deciziilor AI.

### 1.1 Cerințe fundamentale

| Domeniu               | Cerință                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| Participanți          | 1–4, fiecare ales ca om sau calculator                                      |
| Configurarea partidei | Alegerea participanților, dificultății, stilului AI și presetului de reguli |
| Mod local             | Server LAN dedicat, fără a necesita internet                                |
| Mod online            | Server central, invitații private și conectare fără cont obligatoriu        |
| AI                    | Algoritmi locali, fără dependențe obligatorii de API-uri externe            |
| LLM                   | Modul opțional pentru adversar experimental, cu fallback la AI local        |
| Limbi                 | Română și engleză, arhitectură extensibilă                                  |
| Persistență           | Salvare, reluare și recuperare după deconectare                             |
| Replay                | Înregistrarea mutărilor, stărilor, deciziilor și evenimentelor              |
| Analiză               | Evaluarea mutărilor și compararea strategiilor                              |
| Testare               | Teste automate de reguli, partide AI vs. AI și teste de regresie            |
| Extensibilitate       | Preseturi de reguli inițial, editor de reguli ulterior                      |

### 1.2 Principii de proiectare

1. Regulile jocului sunt independente de interfață.
2. Serverul care controlează partida este autoritatea asupra stării și mutărilor.
3. AI-ul local trebuie să poată juca fără internet.
4. Orice partidă trebuie să poată fi reprodusă pentru depanare și analiză.
5. Modificările de reguli nu trebuie să afecteze accidental regulile standard.
6. O funcționalitate nouă se consideră finalizată numai după trecerea testelor și îndeplinirea criteriilor de acceptare.

## 2. Configurarea partidei și definiția participanților

La crearea unei partide, utilizatorul va avea un ecran dedicat pentru configurare.

## Exemplu de lobby

Configurație ilustrativă pentru o partidă cu patru participanți.

Jucător uman

Controlat de utilizator

Om

Adversar tactic

Avansat · Expansiune

AI

Adversar comercial

Mediu · Comerț

AI

Invitat

Conectare prin invitație

Om

În aplicația finală, numele, tipul, stilul AI, dificultatea și statutul conexiunii vor fi configurabile.

### 2.1 Matricea participanților

Fiecare dintre cele patru locuri poate avea una dintre următoarele stări:

- Om local, conectat din browser.
- Om conectat prin LAN.
- Om conectat online prin invitație.
- AI local, executat de serverul gazdă.
- AI experimental bazat pe LLM, cu fallback algoritmic.
- Loc neocupat, dacă presetul permite mai puțini participanți.

Sistemul va separa trei concepte: numărul de locuri ocupate, numărul de oameni și numărul de adversari AI.

### 2.2 Regulile pentru partidele cu 1–2 participanți

Catan clasic este destinat partidelor cu 3–4 jucători. Prin urmare:

- 3–4 participanți: preset standard, cu reguli clasice.
- 1–2 participanți: preset de antrenament sau variantă adaptată, clar identificată în lobby.
- 4 AI: partidă complet automată, cu suport pentru accelerarea simulării.
- 1 om + 3 AI: partidă normală din perspectiva interfeței, cu trei adversari algoritmici.
- 4 oameni: partidă multiplayer clasică.

Nu vom introduce reguli speciale pentru doi jucători în presetul standard. Variantele pentru puțini participanți vor fi definite separat, documentate și testate.

# 3. Specificația regulilor jocului

Această secțiune va constitui contractul funcțional al motorului de joc. Regulile vor fi implementate ca tranziții valide între stări, nu ca verificări împrăștiate prin interfață.

## 3.1 Tabla și componentele

Tabla standard va conține:

- 19 hexagoane de teren.
- 18 jetoane numerotate pentru producție.
- 9 porturi.
- 54 de intersecții posibile pentru așezări și orașe.
- 72 de segmente de drum posibile.
- 4 tipuri de construcții per jucător: drumuri, așezări și orașe, cu limite de piese.
- Hoțul, zarurile și cărțile de dezvoltare.

Tipurile de teren și resursele produse:

| Teren  | Resursă       |
| ------ | ------------- |
| Pădure | Lemn          |
| Deal   | Cărămidă      |
| Pășune | Lână          |
| Câmp   | Grâu          |
| Munte  | Minereu       |
| Deșert | Nicio resursă |

Fiecare teren productiv are un jeton numerotat, cu excepția deșertului. La începutul unei partide standard, pozițiile terenurilor, numerelor și porturilor sunt generate conform configurației standard sau selectate dintr-o hartă validă prestabilită.

Motorul trebuie să poată reprezenta tabla prin identificatori stabili pentru hexagoane, intersecții și muchii. Nu se vor folosi coordonate grafice drept identitate logică.

## 3.2 Resurse și inventar

Fiecare participant are un inventar cu cinci resurse:

- Lemn
- Cărămidă
- Lână
- Grâu
- Minereu

Inventarul nu poate avea valori negative. Fiecare tranzacție trebuie să verifice disponibilitatea resurselor înainte de a modifica starea jocului.

Stocul băncii va fi modelat explicit. Pentru regulile standard, fiecare resursă are 19 cărți, în total 95. Dacă banca nu are suficiente cărți dintr-o resursă pentru toți jucătorii care ar trebui să o primească, acea resursă nu se distribuie în runda respectivă, conform regulilor standard.

## 3.3 Ordinea inițială și plasarea construcțiilor

Pregătirea standard a partidei:

1. Se generează sau se selectează tabla.
2. Se distribuie culorile și ordinea jucătorilor.
3. Jucătorii plasează câte o așezare și un drum, în ordinea de tură.
4. A doua plasare se face în ordinea inversă.
5. Fiecare jucător primește resursele de pornire corespunzătoare terenurilor adiacente celei de-a doua așezări. (sau in functie de setul de reguli agreat de la inceput de la ambele asezari)
6. Începe primul tur normal.

Așezările inițiale trebuie să respecte regula distanței: două așezări nu pot ocupa intersecții adiacente. Drumul inițial trebuie conectat la așezarea tocmai plasată.

## 3.4 Structura unei ture

Fiecare tur normal va avea o stare explicită:

1. Aruncarea zarurilor.
2. Rezolvarea producției sau a hoțului.
3. Comerțul, în condițiile permise de reguli.
4. Construcțiile și cumpărarea cărților de dezvoltare.
5. Verificarea victoriei și încheierea turei.

Ordinea exactă a acțiunilor, inclusiv plasarea hoțului și jucarea cărților de dezvoltare, va fi controlată de motor. Interfața va afișa doar acțiunile permise în starea curentă.

### Producția

La o aruncare între 2 și 12, fiecare teren cu numărul corespunzător produce resurse:

- Așezare adiacentă: o resursă.
- Oraș adiacent: două resurse.

Dacă mai mulți jucători au construcții adiacente, fiecare primește resursele cuvenite. Se aplică excepția pentru lipsa stocului din bancă.

### Aruncarea unui 7

La rezultat 7:

- Niciun teren nu produce resurse.
- Jucătorii cu mai mult de 7 cărți de resurse trebuie să arunce jumătate, rotunjit în jos.
- Jucătorul activ mută hoțul pe un alt hexagon.
- Jucătorul activ poate fura o carte aleatorie de la un adversar cu o construcție adiacentă terenului ales, dacă există un asemenea adversar cu resurse.

Motorul trebuie să modeleze explicit momentul aruncării cărților, mutarea hoțului și furtul, astfel încât replay-ul să poată reda toate aceste evenimente.

## 3.5 Construirea și costurile

| Acțiune             | Cost                                  |
| ------------------- | ------------------------------------- |
| Drum                | 1 lemn + 1 cărămidă                   |
| Așezare             | 1 lemn + 1 cărămidă + 1 lână + 1 grâu |
| Oraș                | 3 minereu + 2 grâu                    |
| Carte de dezvoltare | 1 lână + 1 grâu + 1 minereu           |

Reguli de validare:

- Un drum trebuie să se conecteze la rețeaua proprie, cu respectarea regulilor pentru intersecțiile ocupate de adversari.
- O așezare trebuie să fie conectată la cel puțin un drum propriu și să respecte regula distanței.
- Un oraș înlocuiește o așezare proprie existentă.
- Jucătorul nu poate construi peste limitele pieselor disponibile.
- O carte de dezvoltare poate fi cumpărată numai dacă există în stoc.

### Comerțul

Motorul va implementa:

- Schimb între jucătorul activ și bancă, la raportul 4:1.
- Schimburi la 3:1 pentru un port generic, dacă jucătorul are o așezare sau un oraș pe acel port.
- Schimburi la 2:1 pentru resursa specifică a unui port special.
- Schimburi între jucători, numai când regulile și faza turei permit.

Orice ofertă de schimb trebuie să definească resursele oferite, cele solicitate și participanții implicați. Acceptarea unei tranzacții va fi atomică: ori se aplică integral, ori deloc. si e limitata ca timp

## 3.6 Cărțile de dezvoltare

Motorul va suporta toate tipurile standard:

- Cavaler (Soldat).
- Progres: 2 Drumuri gratuite.
- Progres: Anul abundenței (2 resurse la alegere).
- Progres: Monopol.
- Punct de victorie.

Reguli importante:

- Cărțile de dezvoltare cumpărate în tura curentă nu pot fi jucate imediat, cu excepția punctelor de victorie, care sunt ținute ascunse până la dezvăluirea necesară.
- În mod standard, se poate juca cel mult o carte de dezvoltare identica pe tură.
- Cartea Cavaler mută hoțul și permite furtul conform regulilor (poate lua carti de la toti jucatorii prezenti pe resursa blocata).
- Cele trei cărți de progres au efectele specifice, cu verificarea resurselor, drumurilor și a țintei monopolului.
- Punctele de victorie sunt contabilizate în scorul real, chiar dacă nu sunt publice celorlalți jucători.

## 3.7 Cele mai lungi drumuri și armata cea mai mare

- Cel mai lung drum valorează 2 puncte.
- Armata cea mai mare valorează 2 puncte.
- Pentru a câștiga titlul de cel mai lung drum, rețeaua trebuie să atingă lungimea minimă standard de cinci segmente și să respecte regulile de continuitate.
- Drumurile nu se pot conecta prin așezările unui adversar pentru a continua traseul propriu.
- Pentru armata cea mai mare, jucătorul trebuie să fi jucat cel puțin trei cavaleri și să aibă mai mulți cavaleri jucați decât deținătorul curent, în condițiile regulilor standard.
- La egalitate, titlul rămâne la deținătorul curent, dacă există unul.

Scorul, inclusiv punctele ascunse, va fi separat de informația publică afișată în interfață.

## 3.8 Condiția de victorie

În presetul standard, victoria se declară când jucătorul activ ajunge la cel puțin 10 puncte în condițiile permise de regulile standard. numarul de puncte de victorie se stabileste de la inceput si poate fi 10,12 sau 14

Motorul va avea o singură funcție autoritară pentru calculul scorului și verificarea victoriei. Interfața și AI-ul nu vor calcula independent scoruri definitive.

## 3.9 Varianta de reguli și extensibilitate

Presetul standard va fi imuabil în sens funcțional: o modificare a regulilor nu va schimba comportamentul partidelor standard deja create.

Preseturile suplimentare vor putea configura explicit:

- Numărul de participanți.
- Pragul de victorie.
- Regulile speciale pentru 1–2 participanți.
- Configurația tablei.
- Opțiuni permise pentru comerț.
- Alte variante viitoare, documentate.

Editorul de reguli va fi o etapă ulterioară, după ce motorul standard este stabil și testat.

# 4. Arhitectura tehnică recomandată

Recomand un proiect bazat pe TypeScript, React și Node.js, cu motorul de joc separat de interfață și de transportul de rețea.

Această alegere permite utilizarea aceleiași logici de reguli și a acelorași modele de date în teste, simulări AI și servere. De asemenea, reduce numărul de limbaje și tehnologii care trebuie întreținute.

trebuie luat in calcul ca acest joc va fi multi device. se va putea juca atat pe calculator, tableta cat si mobil. 
interfata trebuie sa fie responsive si sa permita jucarea pe orice rezolutie. 

## 4.1 Stack tehnologic

| Componentă          | Recomandare                                   | Motiv                                                 |
| ------------------- | --------------------------------------------- | ----------------------------------------------------- |
| Limbaj              | TypeScript                                    | Tipuri explicite pentru reguli, acțiuni și stări      |
| Interfață           | React                                         | Componente reutilizabile pentru tablă și lobby        |
| Stilizare           | CSS și SVG                                    | Geometrie hexagonală, piese și interacțiuni precise   |
| Server              | Node.js                                       | Același ecosistem cu motorul de joc                   |
| API                 | REST pentru lobby și WebSocket pentru partide | Configurare, invitații și actualizări în timp real    |
| Validare            | Zod sau o bibliotecă echivalentă              | Validarea mesajelor și configurațiilor                |
| Bază de date online | PostgreSQL                                    | Utilizatori opționali, partide, invitații și metadate |
| Persistență locală  | SQLite și fișiere de replay                   | Salvare și analiză fără internet                      |
| Teste               | Vitest și Playwright                          | Teste de logică și teste de interfață                 |
| Simulări            | Runner Node.js dedicat                        | Partide AI vs. AI la scară mare                       |
| Integrare LLM       | Adaptor separat                               | API opțional, izolat de motorul principal             |

Versiunile exacte ale bibliotecilor vor fi fixate la începutul implementării și actualizate controlat.

## 4.2 Structura proiectului

Aș folosi un monorepo, cu pachete separate:

```

catan-project/
  apps/
    web/                 # Interfața browser
    server/              # Server LAN și online
    simulator/           # Partide automate AI vs. AI
    replay-viewer/        # Vizualizare și analiză replay
  packages/
    game-engine/          # Reguli și tranziții de stare
    game-model/           # Tipuri, identificatori și modele
    game-ai/              # Algoritmi, strategii și dificultăți
    game-protocol/        # Mesaje client-server
    game-replay/          # Înregistrare și reproducere
    game-analysis/        # Metrici și evaluarea deciziilor
    game-config/          # Preseturi și configurații
    game-i18n/            # Română, engleză și traduceri viitoare
    game-test-fixtures/   # Table și scenarii de test
  tests/
    rules/
    integration/
    network/
    replay/
    ai-benchmarks/
  docs/
    rules/
    architecture/
    decisions/
    test-plans/

```

### 4.3 Separarea responsabilităților

Motorul de joc va expune operații conceptuale de forma:

- `getLegalActions(state, playerId)` — returnează acțiunile legale pentru jucător.
- `validateAction(state, playerId, action)` — verifică o acțiune.
- `applyAction(state, playerId, action)` — aplică o acțiune validată și produce o nouă stare.
- `resolveDiceRoll(state, dice)` — rezolvă producția sau efectele unui 7.
- `calculateScore(state, playerId)` — calculează scorul.
- `checkVictory(state)` — determină dacă partida s-a încheiat.
- `getPlayerView(state, playerId)` — produce informațiile pe care jucătorul are dreptul să le vadă.

Numele sunt propuneri de interfață, nu API-uri finale. Semnăturile exacte vor fi definite în specificația tehnică.

Motorul nu va conține cod React, acces la rețea sau apeluri LLM. Astfel, aceeași partidă poate fi jucată într-un browser, simulată de un algoritm sau reprodusă dintr-un fișier.

## 4.4 Modelul de stare

Starea logică va conține:

- Identificatorul partidei și versiunea regulilor.
- Tabla și pozițiile tuturor construcțiilor.
- Ordinea jucătorilor și jucătorul activ.
- Resursele fiecărui participant și stocul băncii.
- Cărțile de dezvoltare, inclusiv informațiile private.
- Poziția hoțului și starea cărților jucate.
- Faza curentă a turei și eventualele acțiuni în așteptare.
- Titlurile speciale și scorurile.
- Starea finală sau motivul încheierii.
- Identificatorul ultimei secvențe de evenimente aplicate.

Starea completă nu va fi transmisă integral fiecărui client. Serverul va construi o proiecție separată pentru fiecare jucător, astfel încât cărțile ascunse și resursele private să nu fie dezvăluite.

## 4.5 Server autoritar și sincronizare

Serverul va valida fiecare mutare, va verifica drepturile jucătorului și va aplica acțiunea în mod atomic.

Fluxul unei mutări:

1. Clientul trimite o intenție de acțiune.
2. Serverul verifică identitatea sesiunii și dreptul de a acționa.
3. Motorul validează acțiunea în raport cu starea curentă.
4. Serverul aplică acțiunea și generează evenimentele rezultate.
5. Evenimentele sunt înregistrate și starea este salvată conform politicii de persistență.
6. Clienții primesc actualizările permise pentru rolul lor.
7. Interfața actualizează tabla și jurnalul de evenimente.

Fiecare cerere va include identificatorul partidei și un identificator al versiunii sau secvenței de stare. Acest lucru previne aplicarea accidentală a aceleiași mutări de două ori și ajută la gestionarea mesajelor întârziate.

## 4.6 Diferența dintre serverul LAN și cel online

Cele două medii vor folosi același motor și același protocol logic.

Serverul LAN:

- Rulează pe calculatorul gazdă dedicat.
- Poate funcționa fără acces la internet.
- Găzduiește AI-ul și salvează partidele local.
- Oferă o adresă de acces pentru browser.
- Poate rula partide de antrenament și simulări.

Serverul online:

- Rulează pe infrastructură centrală.
- Gestionează mai multe partide simultan.
- Controlează adversarii AI ai partidelor online.
- Gestionează invitațiile, sesiunile și reconectarea.
- Persistă datele necesare reluării partidelor după căderi de conexiune sau restarturi.

Nu este necesară duplicarea regulilor pentru fiecare mediu.

# 5. Înregistrarea partidelor, replay și analiza deciziilor

Acest subsistem va fi proiectat din prima versiune a motorului. Nu îl vom adăuga la final, deoarece ar fi mult mai dificil să reconstruim informațiile care nu au fost înregistrate.

## 5.1 Trei niveluri de înregistrare

Nivelul 1 — Jurnalul de evenimente

Înregistrează toate mutările și schimbările de stare: zaruri, producție, construcții, schimburi, furturi, cărți jucate și sfârșitul partidei.

Nivelul 2 — Replay reproductibil

Reaplică evenimentele în ordine, permite saltul la orice moment și reconstruiește tabla, inventarele, scorurile și fazele turei.

Nivelul 3 — Analiză strategică

Înregistrează contextul deciziei AI, acțiunile candidate, evaluările, motivele euristice și, unde este posibil, rezultatele simulărilor.

### 5.2 Ce se înregistrează la fiecare eveniment

Un eveniment va conține, după caz:

- Identificatorul partidei și numărul secvențial.
- Tipul evenimentului.
- Participantul care a inițiat acțiunea.
- Starea sau versiunea stării de dinainte.
- Acțiunea solicitată și rezultatul validării.
- Modificările produse în starea jocului.
- Sursa aleatorietății, dacă este relevantă.
- Timpul logic al evenimentului și timpul real, unde este util.
- Versiunea motorului, presetul de reguli și versiunea AI.
- Identificatorul deciziei AI asociate, dacă există.

Nu vom stoca parole sau secrete API în fișierele de replay.

### 5.3 Înregistrarea deciziilor AI

Pentru fiecare decizie importantă, AI-ul va putea salva un obiect analitic cu:

- Starea observată de AI în acel moment.
- Informațiile publice și private pe care avea dreptul să le cunoască.
- Lista acțiunilor legale analizate.
- Acțiunea aleasă.
- Scorul estimat pentru fiecare candidat, dacă algoritmul îl calculează.
- Factorii euristici care au influențat decizia.
- Adâncimea căutării sau numărul simulărilor, dacă sunt folosite.
- Versiunea strategiei și parametrii de dificultate.
- Rezultatul final al partidei.

Trebuie păstrată distincția dintre ce știa AI-ul la momentul deciziei și ce a devenit cunoscut ulterior. De exemplu, AI-ul nu trebuie evaluat ca și cum ar fi știut dinainte cărțile ascunse ale adversarilor.

### 5.4 Funcțiile interfeței de replay

## Prototip conceptual pentru replay

Tabla la momentul selectat

Poziții, drumuri, așezări, orașe, hoț și resurse vizibile.

Tura 18 · Evenimentul 143 din 286

Jurnalul evenimentelor

140

Aruncare: 8

Se distribuie resursele aferente.

141

Schimb propus

AI oferă resurse și solicită o altă resursă.

142

Schimb acceptat

Inventarele sunt actualizate.

143

Construcție: așezare

Decizie AI asociată, cu evaluarea alternativelor.

Acesta este un model de organizare a interfeței, nu un replay funcțional al unei partide reale.

Funcțiile obligatorii ale vizualizatorului:

- Redare, pauză, pas înainte și pas înapoi.
- Salt la început, final, tură sau eveniment.
- Filtrare după jucător și tipul evenimentului.
- Afișarea inventarelor și a scorurilor la momentul selectat.
- Vizualizarea motivului pentru care o mutare a fost permisă.
- Compararea stării înainte și după o mutare.
- Exportul și importul unui replay valid.
- Ascunderea informațiilor private în replay-urile distribuite altor jucători.

### 5.5 Reproducere deterministă și salvarea stării

Replay-ul va fi bazat pe un jurnal ordonat de evenimente și pe puncte de restaurare periodice, numite snapshots.

La încărcarea unui replay, aplicația poate porni de la ultimul snapshot anterior momentului cerut și poate reaplica evenimentele următoare.

Pentru a garanta reproductibilitatea, vom utiliza:

- Un generator aleatoriu cu sămânță (seed) salvată.
- Evenimente explicite pentru rezultate aleatorii deja generate.
- Versiuni ale motorului și ale regulilor.
- Verificări de consistență prin hash-uri ale stărilor.
- Migrații sau marcarea explicită a replay-urilor incompatibile cu versiunile noi.

Înregistrarea rezultatului efectiv al zarurilor și al cărților furate este esențială: nu trebuie să rerulăm aleatorietatea și să obținem altă partidă.

## 5.6 Cum folosim replay-ul pentru a îmbunătăți AI-ul

Trebuie să separăm trei activități:

1. Analiza descriptivă: de ce a ales AI-ul o anumită mutare.
2. Evaluarea retrospectivă: dacă, având în vedere rezultatul și informațiile disponibile atunci, mutarea pare bună.
3. Îmbunătățirea algoritmului: modificarea euristicilor, a parametrilor sau a strategiei și verificarea rezultatelor pe seturi noi de partide.

Replay-ul nu trebuie să modifice automat algoritmul de producție. El va genera cazuri de analiză și experimente controlate. O versiune nouă a AI-ului va fi promovată numai dacă trece testele de regresie și demonstrează o îmbunătățire măsurabilă.

# 6. Proiectarea adversarilor AI

AI-ul va fi un sistem de decizie local, cu un API comun pentru toate nivelurile și stilurile. Nivelurile nu vor reprezenta doar întârzieri artificiale sau mutări aleatorii, ci diferențe reale în evaluarea poziției, planificare și anticiparea adversarilor.

## 6.1 Arhitectura AI

\#chatgpt-mermaid-\_r_qt\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(237, 237, 237);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_qt\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_qt\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_qt\_ .error-icon{fill:rgb(48, 48, 48);}#chatgpt-mermaid-\_r_qt\_ .error-text{fill:rgb(237, 237, 237);stroke:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qt\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_qt\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_qt\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_qt\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_qt\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_qt\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_qt\_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_qt\_ .marker.cross{stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_qt\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_qt\_ p{margin:0;}#chatgpt-mermaid-\_r_qt\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qt\_ .cluster-label text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qt\_ .cluster-label span{color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qt\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_qt\_ .label text,#chatgpt-mermaid-\_r_qt\_ span{fill:rgb(237, 237, 237);color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qt\_ .node rect,#chatgpt-mermaid-\_r_qt\_ .node circle,#chatgpt-mermaid-\_r_qt\_ .node ellipse,#chatgpt-mermaid-\_r_qt\_ .node polygon,#chatgpt-mermaid-\_r_qt\_ .node path{fill:rgb(9, 23, 44);stroke:rgb(31, 78, 148);stroke-width:1px;}#chatgpt-mermaid-\_r_qt\_ .rough-node .label text,#chatgpt-mermaid-\_r_qt\_ .node .label text,#chatgpt-mermaid-\_r_qt\_ .image-shape .label,#chatgpt-mermaid-\_r_qt\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_qt\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_qt\_ .rough-node .label,#chatgpt-mermaid-\_r_qt\_ .node .label,#chatgpt-mermaid-\_r_qt\_ .image-shape .label,#chatgpt-mermaid-\_r_qt\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_qt\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_qt\_ .root .anchor path{fill:rgb(175, 175, 175)!important;stroke-width:0;stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_qt\_ .arrowheadPath{fill:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_qt\_ .edgePath .path{stroke:rgb(175, 175, 175);stroke-width:1px;}#chatgpt-mermaid-\_r_qt\_ .flowchart-link{stroke:rgb(175, 175, 175);fill:none;}#chatgpt-mermaid-\_r_qt\_ .edgeLabel{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-\_r_qt\_ .edgeLabel p{background-color:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_qt\_ .edgeLabel rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_qt\_ .labelBkg{background-color:rgba(0, 0, 0, 0.5);}#chatgpt-mermaid-\_r_qt\_ .cluster rect{fill:rgb(48, 48, 48);stroke:rgba(255, 255, 255, 0.15);stroke-width:1px;}#chatgpt-mermaid-\_r_qt\_ .cluster text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qt\_ .cluster span{color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qt\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(48, 48, 48);border:1px solid rgba(255, 255, 255, 0.15);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_qt\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_qt\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_qt\_ .icon-shape,#chatgpt-mermaid-\_r_qt\_ .image-shape{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-\_r_qt\_ .icon-shape p,#chatgpt-mermaid-\_r_qt\_ .image-shape p{background-color:rgb(0, 0, 0);padding:2px;}#chatgpt-mermaid-\_r_qt\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_qt\_ .image-shape .label rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_qt\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_qt\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_qt\_ .node .neo-node{stroke:rgb(31, 78, 148);}#chatgpt-mermaid-\_r_qt\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_qt\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_qt\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_qt\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qt\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_qt\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_qt\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_qt\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qt\_ [data-look="neo"].node .neo-line path{stroke:rgb(31, 78, 148);filter:none;}#chatgpt-mermaid-\_r_qt\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_qt\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qt\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_qt\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_qt\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qt\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_qt\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qt\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(153, 206, 255);}#chatgpt-mermaid-\_r_qt\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(153, 206, 255);}#chatgpt-mermaid-\_r_qt\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_qt\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_qt\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(0, 14, 26);stroke:rgb(26, 62, 95);stroke-width:1px;}#chatgpt-mermaid-\_r_qt\_ .node rect,#chatgpt-mermaid-\_r_qt\_ .node circle,#chatgpt-mermaid-\_r_qt\_ .node ellipse,#chatgpt-mermaid-\_r_qt\_ .node polygon,#chatgpt-mermaid-\_r_qt\_ .node path{fill:rgb(0, 40, 77);stroke:rgba(255, 255, 255, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_qt\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_qt\_ .node.mermaid-decision .label-container{fill:rgb(0, 14, 26);stroke:rgb(26, 62, 95);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_qt\_ .edgePaths .flowchart-link{stroke:rgb(175, 175, 175);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_qt\_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_qt\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Starea observată de AIGenerarea acțiunilor legaleEvaluarea pozițieiPlanificarea strategicăNivel de dificultateHeuristici rapideEvaluare multifactoriCăutare și simulăriAlegerea mutăriiValidare de către motorÎnregistrare decizie și rezultat

AI-ul nu va putea executa direct modificări în starea jocului. El propune acțiuni, iar motorul validează și aplică mutarea.

## 6.2 Nivelurile de dificultate

Nivelul 1 — Începător

Folosește reguli simple, priorități explicite și evaluări locale. Poate rata oportunități strategice sau poate alege uneori mutări suboptime. Scopul este să ofere un adversar accesibil.

Nivelul 2 — Mediu

Evaluează producția așteptată, costurile construcțiilor, accesul la porturi, probabilitatea numerelor și oportunitățile de dezvoltare pe termen scurt.

Nivelul 3 — Avansat

Compară mai multe mutări posibile, estimează evoluția tablei, planifică obiective intermediare și ține cont de resursele și punctele adversarilor.

Nivelul 4 — Expert

Folosește căutare mai profundă, simulări Monte Carlo sau alte metode de planificare, estimări probabilistice și evaluarea riscului strategic. Va avea bugete de calcul controlate.

Dificultatea trebuie calibrată prin rezultate experimentale. Nu vom presupune că un algoritm este „expert” doar pentru că folosește mai multe calcule.

## 6.3 Stilurile strategice

Nivelul de dificultate și stilul strategic vor fi independente. De exemplu, putem avea un AI începător orientat spre dezvoltare sau un AI avansat orientat spre comerț.

| Stil       | Priorități principale                                            |
| ---------- | ---------------------------------------------------------------- |
| Echilibrat | Producție, construcții și puncte de victorie                     |
| Expansiune | Drumuri, așezări și acces la noi terenuri                        |
| Dezvoltare | Cărți de dezvoltare, cavaleri și orașe                           |
| Comercial  | Porturi, schimburi și transformarea surplusului în resurse utile |
| Competitiv | Blocarea oportunităților adversarilor și gestionarea titlurilor  |
| Adaptiv    | Modifică ponderile strategiei în funcție de starea partidei      |

Stilurile vor fi implementate ca ponderi și obiective diferite, nu ca șase algoritmi complet separați.

## 6.4 Funcția de evaluare

O funcție euristică va evalua o stare folosind factori precum:

- Punctele de victorie și distanța până la pragul de victorie.
- Producția așteptată a resurselor.
- Diversitatea și echilibrul resurselor.
- Costul estimat al următoarei construcții.
- Potențialul de extindere.
- Accesul la porturi.
- Șansa de a obține cel mai lung drum sau armata cea mai mare.
- Cărțile de dezvoltare și potențialul lor.
- Poziția relativă a adversarilor.
- Riscul ca un adversar să câștige în curând.

Probabilitatea de apariție a unui număr la două zaruri va fi calculată exact: de exemplu, 6 și 8 au fiecare probabilitatea \\(5/36\\), iar 7 are probabilitatea \\(6/36\\).

Evaluarea va ține cont și de incertitudine. AI-ul nu va trata resursele ascunse ale adversarilor ca și cum ar fi cunoscute.

## 6.5 LLM ca adversar experimental

LLM-ul va fi un adaptor opțional care poate propune o acțiune sau o evaluare strategică. Nu va avea autoritate asupra regulilor și nu va putea modifica direct starea jocului.

Fluxul de siguranță:

1. AI-ul pregătește o reprezentare limitată a stării.
2. Adaptorul LLM primește numai informațiile permise.
3. Răspunsul este verificat și transformat într-o acțiune structurată.
4. Motorul verifică dacă acțiunea este legală.
5. Dacă răspunsul lipsește, este invalid sau expiră timpul, se folosește AI-ul algoritmic local.

Trebuie să existe limite de timp, bugete de apeluri și o opțiune de dezactivare completă. Nicio partidă nu va depinde de disponibilitatea unui furnizor extern.

Pentru protecția datelor, nu se vor transmite către furnizorul LLM informații private despre adversari care nu sunt necesare deciziei. Cheile API vor fi păstrate în configurația securizată a serverului, nu în browser sau în fișierele de replay.

## 6.6 Evaluarea statistică a AI-ului

Runner-ul de simulare va rula sute sau mii de partide, în funcție de bugetul de calcul, cu:

- Aceleași seturi de hărți și semințe aleatorii pentru comparații controlate.
- Schimbarea pozițiilor de start.
- Compararea nivelurilor și stilurilor în aceleași condiții.
- Măsurarea ratei de victorie, punctajului mediu, duratei partidei și erorilor.
- Înregistrarea mutărilor ilegale și a deciziilor cu rezultate slabe.
- Separarea seturilor de test de cele folosite la reglarea euristicilor.

Rezultatele trebuie raportate cu intervale de încredere sau alte măsuri ale incertitudinii statistice. O rată de victorie obținută pe un singur set de partide nu va fi suficientă pentru a declara o versiune superioară.

# 7. Interfața grafică și experiența de joc

Prima versiune va avea un aspect simplu, lizibil și funcțional. Designul final va fi îmbunătățit după validarea mecanicilor.
exista un folder poze pentru asseturi
## 7.1 Ecranele principale

Ecranul partidei

Tabla centrală, panourile jucătorilor, resursele proprii, zarurile, cărțile, butoanele de acțiune și jurnalul turei.

trebuie sa permita zoom si  pan pentru vizualizarea tablei in detaliu

[Colonist Championship 4: Rules, Dates & More](https://images.openai.com/static-rsc-4/yA8XtkaZFrCYCDsqt8DMytFhFv2GT4NkCGPcpsZs7pg8XRto5XO7HN3um3Ru3VaA8XR__gE4a-_JhemBxH9VSLX4f9g0ylDrrwGCd_uMvX-e_ZqSyL2BhyF6iynS_8oUHretRP8_UWYJndH0OK13UhC5YvkLlx4wUdHdaH1_psY?purpose=inline)

Lobby și configurare

Selectarea participanților, modului LAN/online, dificultăților, stilurilor AI, presetului de reguli și invitațiilor.

[Visualizer Views](https://images.openai.com/static-rsc-4/P7T7y0u3RmAfei4taxCY9UONijbZCU5KmKcpquHCItwXCuhYCyf262BW20td9D_4_xKdCYEobCLhE65D6HCzyA1V3hk-uERvRJ8gk11rihdeI76ODP2atkjz53UlY1JPEOlfs3LZ0wNgZTwZxT09sKBW0JNMzTFp1SmTASbJVPU?purpose=inline)

Replay și analiză

Tabla într-un moment selectat, cronologia evenimentelor, inventarele, comparația mutărilor și statisticile partidei.

### 7.2 Interacțiunile pe tablă

- Selectarea unei construcții disponibile și evidențierea pozițiilor legale.
- Previzualizarea costului înainte de confirmare.
- Indicații pentru motivele respingerii unei mutări.
- Animații scurte pentru zaruri, producție, furt și construcții.
- Panou de comerț cu resursele oferite și solicitate.
- Indicator clar al jucătorului activ și al fazei turei.
- Afișarea punctelor publice separat de punctele ascunse.
- Mesaje explicative care pot fi dezactivate de utilizator.

Interfața nu va determina legalitatea mutărilor. Ea poate filtra acțiunile pentru comoditate, dar serverul rămâne autoritatea finală.

## 7.3 Accesibilitate și localizare

Româna și engleza vor fi definite în fișiere de traducere, cu chei stabile. Textul nu va fi scris direct în componentele interfeței.

Vom include:

- Formate numerice și mesaje localizate.
- Texte care se adaptează la dimensiuni diferite ale ecranului.
- Contrast suficient și indicii vizuale care nu depind doar de culoare.
- Navigare de bază cu tastatura.
- Mesaje de eroare inteligibile.
- O modalitate de a consulta regulile direct din joc.

## 7.4 Reguli de design și proprietate intelectuală

Pentru o versiune distribuibilă public, vom crea propriile elemente grafice și identitate vizuală și vom verifica drepturile necesare pentru denumire, logo-uri, ilustrații, texte și alte materiale protejate. Regulile pot fi implementate într-un joc compatibil, dar nu vom presupune că toate componentele vizuale ale jocului comercial pot fi copiate.

jocul va fi opensource nu va fi comercializat

# 8. Multiplayer LAN și online

## 8.1 Crearea unei partide LAN

Fluxul standard:

1. Utilizatorul pornește serverul LAN pe calculatorul dedicat.
2. Serverul afișează adresa locală și portul de acces.
3. Jucătorii deschid adresa în browser și intră în lobby.
4. Gazda configurează participanții și presetul de reguli.
5. Partida începe când sunt îndeplinite condițiile configurate.
6. Serverul controlează mutările și rulează adversarii AI.
7. Partida este salvată local și poate fi reluată sau exportată.

Serverul trebuie să poată fi oprit și pornit fără pierderea partidelor salvate.

## 8.2 Invitații online fără cont obligatoriu

Pentru prima versiune online:

- Crearea unei partide private.
- Generarea unui cod sau link de invitație cu token greu de ghicit.
- Intrarea unui invitat folosind un nume de afișare.
- Expirarea și revocarea invitațiilor.
- Limitarea încercărilor de conectare și protecție împotriva abuzului.
- Separarea identității temporare a invitatului de identitatea persistentă a unui eventual cont.

Tokenul de invitație nu trebuie să ofere acces nelimitat la informațiile private ale partidei. El va permite doar aderarea la sesiunea pentru care a fost emis și va fi verificat de server.

## 8.3 Deconectare și reluare

Sistemul va distinge între o întrerupere temporară a conexiunii și abandonul partidei.

La deconectare:

- Starea autoritară rămâne pe server.
- Jucătorul poate reveni folosind o sesiune validă.
- Serverul trimite o proiecție actuală a stării, apoi evenimentele noi.
- Mesajele vechi sau duplicate sunt respinse.
- Dacă jucătorul nu revine, se aplică politica configurată pentru abandon.

Pentru partidele online, vom stabili separat ce se întâmplă dacă un participant pleacă definitiv: așteptare, abandon, înlocuire cu AI sau continuare după reguli prestabilite. Această politică trebuie să fie explicită în lobby și în jurnalul partidei.

## 8.4 Securitate

Înainte de lansarea online vor fi obligatorii:

- Validarea tuturor mesajelor client.
- Verificarea permisiunilor pentru fiecare acțiune.
- Limitarea frecvenței mesajelor.
- Protecția tokenurilor de invitație.
- Separarea informațiilor publice de cele private.
- Înregistrarea acțiunilor administrative relevante.
- Teste pentru clienți care trimit intenționat mutări invalide.
- Copii de siguranță și proceduri de restaurare.

Serverul nu trebuie să accepte de la client modificări directe ale inventarului, punctelor sau stării zarurilor.

# 9. Testarea automată și asigurarea calității

Testarea va fi organizată în straturi. Nu vom aștepta să existe o interfață completă pentru a testa regulile.

## 9.1 Teste unitare pentru motorul de joc

Fiecare regulă va avea teste pozitive și negative.

Exemple:

- Un drum legal este acceptat; un drum fără conexiune este respins.
- O așezare legală este acceptată; încălcarea regulii distanței este respinsă.
- Un oraș poate înlocui o așezare proprie, dar nu construcția altui jucător.
- Un jucător fără resurse suficiente nu poate construi.
- O aruncare de 7 activează exact fazele prevăzute de reguli.
- Un jucător cu 9 cărți aruncă 4 când se aplică regula de jumătate.
- Producția pentru orașe și așezări este calculată corect.
- Un schimb nu poate crea sau distruge accidental resurse.
- Cărțile de dezvoltare respectă restricțiile de tură.
- Titlurile speciale și victoria sunt calculate corect.

## 9.2 Teste de proprietăți și invarianți

Pe lângă exemple individuale, vom verifica invarianti pentru multe stări generate automat:

- Resursele nu devin negative.
- Fiecare piesă are un proprietar valid.
- Nu există două așezări pe intersecții incompatibile.
- Numărul de cărți este consistent cu transferurile către și din bancă.
- O mutare invalidă nu modifică starea.
- Reaplicarea jurnalului reproduce starea finală.
- Niciun jucător nu poate acționa în afara turei sale, exceptând acțiunile permise explicit de reguli.
- O partidă finalizată nu mai acceptă mutări de joc.

## 9.3 Partide complete AI vs. AI

Runner-ul de simulare va permite configurarea unor experimente precum:

- 4 adversari începători.
- 4 adversari avansați.
- Stiluri diferite în aceeași partidă.
- Comparația a două versiuni ale aceluiași AI.
- Partide cu hărți și semințe controlate.
- Simulări fără animații și fără interfață, pentru viteză.

Fiecare simulare va genera statistici și, la nevoie, un replay complet pentru investigarea anomaliilor.

## 9.4 Teste de integrare și rețea

Vor acoperi:

- Crearea și închiderea partidelor.
- Conectarea mai multor clienți.
- Sincronizarea stării.
- Reordonarea și duplicarea mesajelor.
- Deconectarea și reconectarea.
- Restaurarea după repornirea serverului.
- Partide cu AI și oameni în combinații diferite.
- Încercări de acces la informații private.
- Comportamentul sistemului dacă adaptorul LLM nu răspunde.

## 9.5 Teste pentru replay și analiză

Un test esențial va fi:

1. Se execută o partidă cu seed fix.
2. Se salvează jurnalul și snapshot-urile.
3. Se încarcă replay-ul.
4. Se reconstruiește starea după fiecare eveniment.
5. Se compară hash-urile stărilor cu cele din partida originală.
6. Se verifică rezultatul final și statisticile.

Testele vor include și versiuni incompatibile ale replay-urilor, date corupte și încercări de a expune informații private.

## 9.6 Criterii de acceptare pentru testare

- Toate testele obligatorii de reguli trec.
- Nicio mutare invalidă nu poate modifica starea.
- Replay-ul reproduce starea logică exactă a partidei înregistrate.
- Testele de reconectare nu pierd evenimente confirmate.
- Toate configurațiile de participanți permise de preset trec testele de integrare.
- AI-ul nu generează mutări ilegale în setul de benchmark.
- Erorile grave sunt reproductibile prin seed, jurnal și versiune.

Pentru calitatea AI-ului, vom defini separat praguri statistice după stabilirea unui nivel de referință. Nu este util să impunem de la început o rată arbitrară de victorie fără să avem rezultate măsurate.

# 10. Planul de dezvoltare pe etape

Recomand să dezvoltăm proiectul incremental. Fiecare etapă trebuie să livreze un rezultat verificabil și să aibă criterii de acceptare înainte de a începe etapa următoare.

## 01

Specificație și fundație tehnică

Livrabil: contractul motorului

- Definirea stărilor și fazelor jocului.
- Documentarea regulilor standard și a excepțiilor.
- Structura monorepo și configurarea testelor.
- Identificatori stabili pentru tabla și participanți.
- Primele teste de validare și tranziție a stării.

Acceptare: regulile pot fi descrise și testate fără interfață.

## 02

Motorul complet de reguli

Livrabil: motor fără UI

- Tabla și setup-ul.
- Zaruri, producție, hoț și furt.
- Comerț, construcții și cărți.
- Scoruri, titluri și victorie.
- Presetul standard și primul preset de antrenament.

Acceptare: o partidă completă poate fi executată prin acțiuni de test.

## 03

Primul AI și simulatorul

Livrabil: partide automate

- AI euristic de bază.
- Niveluri inițiale de dificultate.
- Stiluri strategice.
- Runner pentru partide AI vs. AI.
- Seed-uri și statistici reproductibile.

Acceptare: se pot termina partide complete fără intervenție umană și se pot investiga rezultatele.

## 04

Prototipul grafic local

Livrabil: joc utilizabil în browser

- Tabla și interacțiunile.
- Lobby și selectarea participanților.
- Panoul de resurse și construcții.
- Mesaje și jurnalul turei.
- Prima integrare cu motorul.

Acceptare: un om poate juca o partidă completă împotriva AI-ului.

## 05

Server LAN și multiplayer

Livrabil: partidă în rețeaua locală

- Server dedicat.
- Mai mulți clienți în browser.
- Sincronizare și validare autoritară.
- Persistență și reconectare locală.
- Partide cu participanți umani și AI.

Acceptare: mai multe calculatoare pot termina o partidă în aceeași rețea fără desincronizări.

## 06

Replay și analiză

Livrabil: instrument de analiză

- Jurnal de evenimente și snapshot-uri.
- Replay pas cu pas.
- Export și import.
- Analiza deciziilor AI.
- Compararea versiunilor de algoritm.

Acceptare: o partidă poate fi reprodusă exact și poate fi investigată fără a o rejuca manual.

## 07

Online, invitații și persistență

Livrabil: versiune online testabilă

- Server central.
- Linkuri de invitație.
- Identități temporare și sesiuni.
- Reconectare și recuperarea partidelor.
- Securitate și monitorizare.

Acceptare: invitații din rețele diferite pot juca împreună, inclusiv după o întrerupere temporară a conexiunii.

## 08

AI avansat și LLM experimental

Livrabil: adversari calibrați

- Căutare strategică și simulări.
- Benchmark-uri și reglarea euristicilor.
- Adaptor LLM opțional.
- Fallback algoritmic și teste de indisponibilitate.
- Raportare a performanței pe niveluri și stiluri.

Acceptare: performanța AI este măsurată, iar LLM-ul poate fi dezactivat fără a afecta jocul.

## 09

Stabilizare și lansare

- Teste de încărcare și securitate.
- Îmbunătățirea graficii și animațiilor.
- Accesibilitate și traduceri.
- Documentație pentru instalare și administrare.
- Backup, restaurare și proceduri de recuperare.

Acceptare: versiune reproductibilă, documentată și pregătită pentru utilizatori de test.

Ordinea este orientativă. Replay-ul trebuie proiectat din etapa 1 și implementat parțial în etapa 2–3, chiar dacă interfața completă de analiză va fi realizată ulterior.

# 11. Livrabilele concrete ale proiectului

Pentru ca planul să fie utilizabil efectiv în dezvoltare, fiecare etapă va produce documente și componente verificabile.

| Livrabil              | Conținut                                                       |
| --------------------- | -------------------------------------------------------------- |
| `RULES.md`            | Regulile standard, excepțiile și variantele de joc             |
| `ARCHITECTURE.md`     | Componentele software, responsabilitățile și fluxurile         |
| `GAME_STATE.md`       | Modelul stării și toate fazele jocului                         |
| `AI_DESIGN.md`        | Niveluri, stiluri, euristici și algoritmi de căutare           |
| `REPLAY_FORMAT.md`    | Schema evenimentelor, snapshot-urilor și versiunilor           |
| `NETWORK_PROTOCOL.md` | Mesajele client-server și regulile de sincronizare             |
| `TEST_PLAN.md`        | Teste unitare, integrare, replay, AI și rețea                  |
| `MILESTONES.md`       | Etape, dependențe și criterii de acceptare                     |
| Suită de teste        | Teste executabile pentru regulile și comportamentul sistemului |
| Simulator AI          | Rulare automată a partidelor și export de statistici           |
| Replay Viewer         | Vizualizarea și analiza partidelor înregistrate                |

Documentele vor fi versionate împreună cu codul. Astfel, o modificare a unei reguli va putea fi urmărită până la testele și componentele afectate.

# 12. Riscurile principale și cum le controlăm

Reguli incomplete sau interpretate greșit

Rezolvare: specificație formală, exemple de situații-limită, teste de regresie și separarea strictă a presetului standard de variante.

Desincronizări între jucători

Rezolvare: server autoritar, identificatori de secvență, tranzacții atomice și reconstrucția stării din evenimente.

AI care joacă legal, dar slab

Rezolvare: benchmark-uri, replay-uri analizabile, experimente controlate și comparații statistice între versiuni.

Replay-uri care nu mai pot fi redate după actualizări

Rezolvare: versiuni ale motorului, versiuni ale formatului, snapshot-uri și migrații explicite.

Dependență accidentală de LLM sau internet

Rezolvare: adaptor separat, timeout-uri, fallback local și teste în mediu fără acces la internet.

# 13. Ordinea recomandată pentru primele implementări

Nu recomand să începem direct cu interfața grafică. Cea mai eficientă succesiune este:

1. Definirea exactă a modelului de date și a regulilor.
2. Implementarea motorului și a testelor pentru fiecare mecanică.
3. Construirea unui AI simplu, capabil să termine partide complete.
4. Adăugarea jurnalului de evenimente și a reproducerii deterministe.
5. Construirea prototipului grafic.
6. Integrarea serverului LAN și a mai multor clienți.
7. Dezvoltarea instrumentelor de replay și analiză.
8. Îmbunătățirea AI-ului pe baza experimentelor.
9. Implementarea serverului online și a invitațiilor.
10. Stabilizarea și pregătirea lansării.

Există o dependență importantă: formatul evenimentelor și modelul stării trebuie stabilite înainte de a avea multe partide salvate. Altfel, vom ajunge să modificăm retrospectiv o cantitate mare de date.

## 14. Cum vom ști că proiectul este gata?

Prima versiune completă va fi considerată funcțională când:

- Se poate crea o partidă cu 1–4 participanți, în orice combinație permisă de preset.
- Regulile standard funcționează pentru partidele de 3–4 jucători.
- Variantele pentru mai puțini participanți sunt distincte și testate.
- O partidă completă poate fi jucată în browser împotriva AI-ului.
- Mai mulți jucători pot participa prin LAN.
- Jocul funcționează fără internet și fără LLM.
- Partidele pot fi salvate și reluate.
- Replay-ul reproduce exact starea logică înregistrată.
- Deciziile AI pot fi examinate și comparate.
- Serverul online permite invitații private și recuperarea unei partide după deconectare.
- Testele de reguli, integrare și securitate trec.
- Există măsurători care permit evaluarea obiectivă a nivelurilor AI.

Nu este necesar ca toate nivelurile AI să fie excelente la prima lansare. Este necesar ca motorul, testele și instrumentele de analiză să fie suficient de solide încât să putem îmbunătăți algoritmii în mod controlat.

## Următorul pas: transformarea planului în specificații executabile

Aș începe cu trei documente tehnice, în această ordine:

1. Specificația formală a regulilor — inclusiv toate fazele turei, condițiile de validare și cazurile-limită.
2. Modelul de date și contractul motorului — structurile TypeScript, stările, acțiunile și evenimentele.
3. Planul de implementare pentru MVP — structura proiectului, primele teste și criteriile de acceptare.

Acestea vor constitui fundația pentru codul efectiv. În special, specificația formală trebuie să fie suficient de precisă încât două implementări independente ale motorului să producă aceleași rezultate pentru aceeași stare și aceeași acțiune.

Recomandarea mea finală: să considerăm motorul de reguli, replay-ul reproductibil și testarea automată drept nucleul proiectului. Interfața, multiplayerul online și AI-ul avansat vor putea evolua independent în jurul acestui nucleu, fără să fie nevoie să reconstruim jocul de fiecare dată când îmbunătățim o componentă.