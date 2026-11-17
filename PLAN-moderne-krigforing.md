# Plan: moderne krigføring (droner, miner, lette kjøretøy, infanteri)

Status: **fase 1–5 gjort** (fase 1 på `claude/gpu-setup-phase-1-92182d`, fase 2 på `claude/phase-2-mines`, fase 3 på `claude/phase-3-air`, fase 4 på `claude/phase-4-light`, fase 5 på `claude/phase-5-arty`, hver bygget på den forrige; ingen merget; se `CLAUDE.md` under Drones, Minimap, Mines, Enemy air og Light and wheeled vehicles). Inspirert av krigføringen i Ukraina: droner som hovedvåpen, elektronisk krigføring (EW) og fiberoptiske droner,
miner over alt, små raske angrepsgrupper, og rekognoseringsdroner som leder artilleri.
Alt skal fortsatt være prosedyrisk og følge reglene i `CLAUDE.md` (ingen allokering per frame, touch-kontroll for alt nytt,
verifisering med renders og `__sim`-tester, bundle-størrelse rapporteres).

## Beslutninger (tatt av eieren)
1. **Kartet viser bare fiender som er sett** (av spilleren, siktet, dronen eller en rekognoseringsdrone). Ikke lenger «alt innen 900 m».
2. **Soldater: ja.** Infanteri skal inn.
3. **Mine = immobilisering i noen sekunder + skade.** Ikke permanent stopp.

## Rekkefølge
Faser som berører samme kode (dronen) gjøres etter hverandre. Faser i ulike deler kan gå parallelt med subagenter i hver sin worktree
(sjekk at worktreen er basert på riktig gren, ikke en gammel `main`).

### Fase 1: Bombedrone, kart med bare sette fiender og rekognoseringsdrone (gjort)
- **Dronetyper:** X velger/sender (eller en egen knapp på touch). Typer: `FPV` (dagens selvdestruktive), `Bomber`, `Recon`. HUD-pillen viser type og antall.
- **Bomber:**
  - Svever (lavere maks fart, stabil hover). Kameraet kan vippes rett ned, og et sikte viser beregnet nedslagspunkt
    (ballistisk fall fra dronens fart og høyde).
  - LMB slipper en av 2–3 granater (VOG-type). Granaten faller ballistisk med den eksisterende granatfysikken i `combat.js`.
  - Skade: stor mot tak og motordekk (treffsone ovenfra), liten ellers. Splash mot infanteri.
  - Når granatene er brukt: fly tilbake til tanken for å lande og lade (gir dronen tilbake), eller kutt linken (dronen tapt).
- **Recon:**
  - Flyr høyt (100–150 m), lenge (cirka 3 min) og stille. Kan ikke angripe.
  - Fiender i dronens synsfelt (sjekk med `losVis` fra dronen) blir markert på kartet i N sekunder.
- **Kartet viser bare sette fiender:**
  - Hver fiende får `e.spotT` (sekunder igjen som markert). Den settes når:
    - spilleren har dem i siktet eller kameravinkelen, med fri sikt (`losVis`), innen fornuftig avstand;
    - en drone ser dem;
    - de skyter (munningsglimt avslører retningen).
  - `drawMap` tegner bare `spotT > 0`. Siste kjente posisjon tones ut (hul markør) når markeringen går ut.
  - Bølgevarselet sier fortsatt retning og avstand.
- **Test:** `__sim`-scenario der fiender bare dukker opp på kartet etter at de er sett. Bombedronen treffer et stillestående T-72-mål fra 40 m høyde.

### Fase 2: Miner og beltetreff (gjort)
- **Minefelt:** noen bølger (ny scenariotype eller tillegg) legger felt på veier og veikryss foran spilleren.
  - Minene er skjult under snøen. Et ferskt felt vises bare som svak forstyrrelse i snømasken (stemples i `maskA`, som spor/svimerker).
  - Termisk sikt viser minene svakt.
- **Fjernutlegging:** midt i en bølge kan rakettlagte miner falle rundt spilleren (varsel med toast og lyd, noen sekunders forvarsel, synlige nedslag).
- **Treff:** eksplosjon under tanken gir:
  - HP-skade (cirka 15–25);
  - **immobilisering i 4–8 s** (beltet repareres), med visuell og lydlig tilbakemelding og en HUD-pille «TRACK».
  - Ny tilstand `veh.immobT` i fysikken (`simulate` i `main.js`).
- **Motmidler:** HE eller MG på minen detonerer den. Dronen avslører minefelt.
- **Fiender** kjører rundt sine egne felt (rutefinning ignorerer minesegmenter).
- **Test:** tanken kjører inn i et felt, blir stående i X s, og HP faller. Fiender passerer uten å treffe sine egne.

### Fase 3: Fiendtlige droner og MG på luken (gjort)
- **Fiendtlig FPV:** kommer fra en retning med summende lyd (egen loop eller syntetisk) og retningsindikator i HUD (`post.wgsl` eller en lett DOM-pil som bare endres ved behov).
  - Treff gir stor skade.
  - Skogdekning og bevegelse reduserer sjansen for at den finner deg.
- **Lancet:** høyere og raskere, kortere forvarsel. Røyk forvirrer den.
- **Orlan (rekognosering):** sirkler over spilleren og trigger artilleri i fase 5. Kan skytes ned.
- **MG på luken (MG3 på lavetten):** høy elevasjon for å treffe droner. Ny tast og touch-knapp. Coax-MG-en beholdes.
- **Cope cage på noen T-72:** synlig bur over tårnet (prosedyrisk gitter), som gir FPV-dronen og bombedronen redusert effekt mot den.
- **Test:** spilleren skyter ned en innkommende FPV med luke-MG-en i `__sim`. Treff uten nedskyting gir forventet skade.

### Fase 4: Lette kjøretøy (gjort)
- **Tigr eller UAZ med Kornet:** svakt pansret, rask. Stopper i overwatch og skyter et trådstyrt missil som flyr synlig og sakte (cirka 250 m/s, glødende hale).
  - Spilleren kan legge røyk (bryter styringen) eller komme i dekning.
  - Missilet trenger egen prosjektiltype som styres mot siktelinjen.
- **BTR-82A:** hjulgående. Bruker raider-rollen og veiene.
- **Buggy- og motorsykkelangrep:** 3–5 raske, svake kjøretøy samtidig. Noen bærer RPG-skyttere (fase 6). MG er hovedvåpenet.
- **Teknisk:**
  - Nye modeller i `tank.js` med hjul i stedet for belter. Trenger en hjulvariant av del-matrisene
    (dagens `tankParts` og felles belter er laget for beltekjøretøy; `objdeform.wgsl` har beltekonstantene).
  - Øk `MAXE`, og gi lette kjøretøy egne `ETYPE`-oppføringer (hp, fart, våpen, `night`-faktor for deteksjon).
- **Nye scenarier** i `planWave`: «Motorisert raid», «ATGM-bakhold».

### Fase 5: Artilleri med rekognoseringsdrone (gjort: del A fiendtlig artilleri, del B egen artilleristøtte)
- **Del A, fiendtlig artilleri: gjort** på `claude/phase-5a-enemy-arty` (`src/arty.js`, granattype 10, lyden `incoming`, `tools/artytest.mjs`; se `CLAUDE.md` under Enemy artillery). Del B (egen artilleristøtte) gjøres for seg.
- Hvis en Orlan eller en fiende har sett spilleren lenge nok (for eksempel 15 s sammenhengende i `G.rep`), kommer en serie på 4–8 granater mot posisjonen etter 20–40 s.
  - Spredning rundt den observerte posisjonen, ikke den nåværende. Å flytte seg er motmiddelet.
- Varsel: fløytelyd og et første nedslag på avstand.
- Gjenbruker eksplosjoner, svimerker/krater (`fsBlast`), byggskade (`bldHit` / `splash`) og risting.
- **Egen artilleristøtte:** én serie per bølge. Tilkalles fra dronen (marker et punkt) eller siktet. Touch-knapp.
  - **Del B gjort** (`src/support.js`, skalltype 11, tast B / ARTY-knapper / L1, `tools/supporttest.mjs`).

### Fase 6: Infanteri (del B gjort: logikk og AI)
- **Del B, logikk og AI: gjort** på `claude/phase-6b-infantry` (`src/infantry.js`, grensesnittet `G.inf`, skalltype 12 for RPG, `tools/inftest.mjs`; se `CLAUDE.md` under Infantry logic). Del A (modell, animasjon og instansiert tegning) gjøres for seg.
- **Modell:** lavpolygon-soldat bygget prosedyrisk (overkropp, hode med hjelm, armer, ben, våpen), hvite vinteruniformer.
  - Instansiert tegning i ett draw call.
  - Stive lemmer animeres med del-matriser, slik tanken gjør: løpe, gå, knele, ligge, skyte, dø.
  - Må se bra ut på 5–20 m (visuell kvalitet er prioritet 1). Kjør kritiker-subagenten på renders.
- **Termisk:** kroppstemperatur gjør dem tydelige i termisk sikt (de er nesten usynlige i snøen ellers). Dette gir termisk sikte en virkelig rolle.
- **Roller:**
  - **RPG-lag** (2–3) i hus langs vei og i skogkanter, som skyter på kort hold (under 250 m). Rakett med synlig bane.
    HE inn i huset (`bldHit`) tar ut laget; huset kollapser over dem.
  - **ATGM-lag** på høyder, som overwatch-rollen.
  - **Utsitting:** BMP og BTR setter av et lag når de stopper i kontakt.
- **Skade:** MG og HE-splash dreper. Overkjøring dreper. Drone-granater er effektive.
- **Deteksjon:** de bruker samme `losVis` og `playerSig`-modell. De ser dårligere enn kjøretøy på avstand, men hører motoren.
- **Ytelse:**
  - Begrens antall (for eksempel 24–40 samtidig).
  - Logikken staggeres som fiendenes LOS-sjekker.
  - LOD: langt unna bare en enkel figur eller sprite.
- **Test:** RPG-lag i et hus engasjerer spilleren på kort hold. HE i huset nøytraliserer dem. Verifiser i termisk sikt og dagslys.

### Fase 6b: Realismeløft for soldatene (bestilt av eieren, etter fase 6)
Mål: så naturtro soldater som mulig innenfor reglene (prosedyrisk, ingen eksterne modeller eller mocap).
- Myk, sammenhengende kropp i stedet for stive deler: tverrsnitt (bryst, skuldre, lår, legger) med klesvolum, 3–6k trekanter nær, GPU-skinning med vektede ben. Ingen åpne ledd.
- Klær og utstyr i shaderen: stoffstruktur, folder ved ledd, vinterkamuflasje (hvit med grått), vest og lommer, hjelmtrekk, snø på skuldrene, våte knær etter å ha ligget.
- Bevegelse: gangart fra biomekaniske kurver, fot-IK mot terrenget, armer som holder våpenet (IK), pusting, rekyl, myke overganger, kaste seg ned og reise seg.
- Kulde: pustedamp, balaklava eller skibriller.
- Alternativ eieren kan velge: en egen soldatmodell med animasjoner (glTF) som unntak, som musikken (koster 1–3 MB).

### Fase 7: EW og fiberoptisk drone
- **EW-kjøretøy (Pole-21-lignende):** lager en jammesone (cirka 600–800 m).
  - Inne i sonen: dronebildet får støy (`post.wgsl`), radiorekkevidden krymper, og til slutt mister du linken.
  - Kjøretøyet er et prioritert mål, og ødelagt kjøretøy fjerner sonen.
- **Fiberoptisk FPV (oppgradering):** immun mot jamming, men kortere rekkevidde (for eksempel 800 m).
  Kabelen tegnes som en tynn linje og kan ryke hvis dronen flyr gjennom tett skog.
- **Fiendens termiske tepper:** noen kjøretøy har redusert termisk signatur (lavere verdi i `thermal()`).

## Andre ideer (valgfritt)
- **Forsyning med drone:** en kasse slippes ved tanken mellom bølgene i stedet for at forsyningen bare dukker opp.
- **Scenario «Gjennombrudd gjennom minefelt»:** fienden rydder miner med et ryddekjøretøy (mineplog/UR-77) som du må stoppe.
- **Turtle tank:** en T-72 med skall over hele kjøretøyet. Nesten immun mot droner, men blind og treg.

## Felles krav for hver fase
- Touch-kontroll for alle nye handlinger. Sjekk layouten med `tools/cshot.mjs ... --touch --w 852 --h 393` og iPad-størrelse.
- Ingen allokering per frame. Utvid preallokerte pooler.
- Verifiser med `__sim`-tester (utvid `tools/wavetest.mjs`) og `cshot`-renders. Se på skjermbildene.
- Oppdater `CLAUDE.md` (arkitektur, kontroller, testkroker) og rapporter bundle-størrelse.
- Én commit per fase (eller per milepæl innenfor en fase).
