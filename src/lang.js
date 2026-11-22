// Language: English is the source everywhere in the game code; Norwegian is applied where text reaches the screen (ui.js: toasts,
// HUD pills, cards, labels; the static HTML once at load). tr(s) looks the English string up in the dictionary, then tries the
// patterns (messages with numbers, names and directions), then translates the parts of a composite ('a · b', lines). Anything
// it does not know stays English, so a missing entry is never an empty text. Only called on rare events (a text changes), never per frame.
// The choice: ?lang=no|en, else localStorage.glang (menu row Language), else Norwegian for a Norwegian browser.
export let LANG = 'en';
export function initLang(qs) {
  let l = qs && qs.get('lang'); if (l !== 'no' && l !== 'en') { l = ''; try { l = localStorage.glang || ''; } catch (e) { /* private mode */ } }
  if (l !== 'no' && l !== 'en') l = typeof navigator !== 'undefined' && /^(nb|nn|no)\b/i.test(navigator.language || '') ? 'no' : 'en';
  LANG = l; return l;
}
export function setLang(l) { LANG = l === 'no' ? 'no' : 'en'; }

const DIR = { north: 'nord', 'north-east': 'nordøst', east: 'øst', 'south-east': 'sørøst', south: 'sør', 'south-west': 'sørvest', west: 'vest', 'north-west': 'nordvest' };
const DN = 'north-east|north-west|south-east|south-west|north|east|south|west';
const CMP = { N: 'N', NE: 'NØ', E: 'Ø', SE: 'SØ', S: 'S', SW: 'SV', W: 'V', NW: 'NV' };
const VEH = { 'assault buggy': 'angrepsbuggy', 'motorcycle team': 'motorsykkellag', 'FPV drone': 'FPV-drone' }; // other vehicle names are proper names
const DRN = { FPV: 'FPV', BOMB: 'BOMBE', RECON: 'REKO' };
const veh = (s) => VEH[s] || s, cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// mission texts (name, start-screen card, briefing, objectives, radio messages), keyed by the English in missions.js
const MSN = {
  'First contact': 'Første kontakt', 'Column on Holmenkollveien': 'Kolonne på Holmenkollveien', 'Retake the tower': 'Ta tilbake tårnet', 'Hold the arena': 'Hold arenaen', 'Find the command post': 'Finn kommandoplassen', 'Night breakthrough': 'Nattlig gjennombrudd',
  'Meet a patrol on Tryvannsveien. A short first fight.': 'Møt en patrulje på Tryvannsveien. En kort første kamp.',
  'Eight vehicles drive north to Voksenkollen. Let no more than two through.': 'Åtte kjøretøy kjører nordover til Voksenkollen. Slipp ikke flere enn to gjennom.',
  'Clear the garrison at Tryvannstårnet, then hold the tower.': 'Rens garnisonen ved Tryvannstårnet, og hold tårnet.',
  'Three attacks on Holmenkollen. Keep them out of the arena.': 'Tre angrep på Holmenkollen. Hold dem ute av arenaen.',
  'A camouflaged command post directs artillery at you. Search the forest with the drone and destroy it.': 'En kamuflert kommandoplass leder artilleri mot deg. Let i skogen med dronen og ødelegg den.',
  'Cut off at Tryvann in the dark. Fight south to the arena in 14 minutes.': 'Avskåret ved Tryvann i mørket. Kjemp deg sørover til arenaen på 14 minutter.',
  'Scouts report vehicles coming down Tryvannsveien from the north.\n\nDrive up to the car park at Øvresetertjern, stop the patrol on the road, and deal with whatever follows it.':
    'Speidere melder om kjøretøy på vei ned Tryvannsveien fra nord.\n\nKjør opp til parkeringsplassen ved Øvresetertjern, stopp patruljen på veien, og ta deg av det som kommer etter.',
  'An enemy column has broken through in the south and is driving north up Holmenkollveien to join the force at Tryvann.\n\nIt will not stop to fight you. Pick a place along the road, and destroy it before it reaches Voksenkollen station. No more than two vehicles may get through.':
    'En fiendtlig kolonne har brutt gjennom i sør og kjører nordover på Holmenkollveien for å slutte seg til styrken ved Tryvann.\n\nDen stopper ikke for å slåss. Velg et sted langs veien, og ødelegg den før den når Voksenkollen stasjon. Ikke flere enn to kjøretøy får slippe gjennom.',
  'The enemy holds Tryvannstårnet with tanks, a Kornet vehicle and infantry, and has mined the road up.\n\nDestroy the garrison, drive up to the tower and hold it against the counter-attack. A recon drone will show you what waits at the car park.':
    'Fienden holder Tryvannstårnet med stridsvogner, en Kornet-vogn og infanteri, og har minelagt veien opp.\n\nØdelegg garnisonen, kjør opp til tårnet og hold det mot motangrepet. En rekognoseringsdrone viser deg hva som venter på parkeringsplassen.',
  'The enemy wants the Holmenkollen arena as a staging area. Three attacks are coming: down Holmenkollveien from the north, a raid from the west, then a push from two sides.\n\nKeep their vehicles out of the arena. If they stand in it for 45 seconds in all, it is lost. You are resupplied between the attacks.':
    'Fienden vil ha Holmenkollen-arenaen som oppmarsjområde. Tre angrep er på vei: ned Holmenkollveien fra nord, et raid fra vest, og til slutt et støt fra to kanter.\n\nHold kjøretøyene deres ute av arenaen. Står de der i 45 sekunder til sammen, er den tapt. Du blir etterforsynt mellom angrepene.',
  'An enemy command post somewhere in the forest east of Frognerseteren is directing artillery. It does not have your position: its fire searches the area, and an Orlan will come looking. Under the camouflage net (K) a still tank is hidden from it; once it has watched you for a quarter of a minute, the fire is accurate.\n\nIt stands under camouflage nets on one of the forest roads, in a different place every time: a drone has to pass within about 350 m to make it out, so search the area road by road with the recon drone (Z picks the type). Then destroy its command vehicle and both Kornet carriers. You have two fire missions.':
    'En fiendtlig kommandoplass et sted i skogen øst for Frognerseteren leder artilleri. Den har ikke posisjonen din: ilden søker i området, og en Orlan kommer for å lete. Under kamuflasjenettet (K) er en stillestående vogn skjult for den; har den først sett deg i et kvart minutt, blir ilden presis.\n\nKommandoplassen står under kamuflasjenett på en av skogsveiene, på et nytt sted hver gang: en drone må innenfor rundt 350 m for å se den, så let gjennom området vei for vei med rekognoseringsdronen (Z velger type). Ødelegg deretter kommandovognen og begge Kornet-vognene. Du har to ildoppdrag.',
  'You are cut off at Tryvann and it is dark. The way out is south: down Tryvannsveien and Holmenkollveien to the Holmenkollen arena, 3 km through roadblocks, mines and ambushes.\n\nUse the thermal sight (V). The corridor closes in 14 minutes.':
    'Du er avskåret ved Tryvann, og det er mørkt. Veien ut går sørover: ned Tryvannsveien og Holmenkollveien til Holmenkollen-arenaen, 3 km gjennom veisperringer, miner og bakhold.\n\nBruk det termiske siktet (V). Korridoren stenger om 14 minutter.',
  'Drive to the car park at Øvresetertjern': 'Kjør til parkeringsplassen ved Øvresetertjern', 'Destroy the patrol coming down the road': 'Ødelegg patruljen som kommer ned veien', 'A tank follows the patrol — destroy it': 'En stridsvogn følger patruljen — ødelegg den',
  'Stop the column before Voksenkollen': 'Stopp kolonnen før Voksenkollen', 'Destroy the garrison at Tryvann': 'Ødelegg garnisonen ved Tryvann', 'Drive up to the tower': 'Kjør opp til tårnet', 'Hold the tower against the counter-attack': 'Hold tårnet mot motangrepet',
  'Stop the attack from the north': 'Stopp angrepet fra nord', 'Stop the raid from the west': 'Stopp raidet fra vest', 'Stop the final push from north and east': 'Stopp det siste støtet fra nord og øst',
  'Find the command post in the eastern forest': 'Finn kommandoplassen i skogen i øst', 'Destroy the command vehicle and the Kornet carriers': 'Ødelegg kommandovognen og Kornet-vognene', 'Break through to the Holmenkollen arena': 'Bryt gjennom til Holmenkollen-arenaen',
  'Patrol on Tryvannsveien, north of you — light vehicles': 'Patrulje på Tryvannsveien, nord for deg — lette kjøretøy', 'Patrol destroyed — resupplied. A T-72 with an escort is coming down from Tryvann': 'Patruljen er ødelagt — etterforsynt. En T-72 med følge er på vei ned fra Tryvann',
  'Column of 8 on Holmenkollveien, far south of you, heading north': 'Kolonne på 8 på Holmenkollveien, langt sør for deg, på vei nordover', 'The column is passing the Holmenkollen arena': 'Kolonnen passerer Holmenkollen-arenaen',
  'Garrison destroyed — drive up to the tower': 'Garnisonen er ødelagt — kjør opp til tårnet', 'Tower taken — resupplied. Counter-attack coming from the west and up the road from the south': 'Tårnet er tatt — etterforsynt. Motangrep på vei fra vest og opp veien fra sør',
  'Tanks on Holmenkollveien to the north, coming for the arena': 'Stridsvogner på Holmenkollveien i nord, på vei mot arenaen', 'Attack beaten — resupplied. Fast vehicles coming in from the west': 'Angrepet er slått tilbake — etterforsynt. Raske kjøretøy på vei inn fra vest',
  'Raid beaten — resupplied. The main force is coming: tanks from the north, more from the east': 'Raidet er slått tilbake — etterforsynt. Hovedstyrken kommer: stridsvogner fra nord, flere fra øst',
  'Command post found — destroy its three vehicles': 'Kommandoplassen er funnet — ødelegg de tre kjøretøyene', 'An Orlan is coming to look for you — a camouflage net or thick forest hides a still tank': 'En Orlan er på vei for å lete etter deg — kamuflasjenett eller tett skog skjuler en stillestående vogn',
  'Vehicles behind you — they are giving chase': 'Kjøretøy bak deg — de tar opp jakten', 'Enemy artillery is searching the area — they do not have your position yet': 'Fiendtlig artilleri søker i området — de har ikke posisjonen din ennå',
  'Too many got through': 'For mange slapp gjennom', 'Enemy vehicles inside the objective — drive them out!': 'Fiendtlige kjøretøy inne i målområdet — driv dem ut!',
  'Too many vehicles of the column got through to Voksenkollen.': 'For mange av kolonnens kjøretøy slapp gjennom til Voksenkollen.', 'The enemy took the objective.': 'Fienden tok målet.', 'Out of time.': 'Tiden er ute.', 'The corridor closed before you reached the arena.': 'Korridoren stengte før du nådde arenaen.',
  'That was the last mission. Defence mode and the other missions are on the start screen (menu).': 'Det var det siste oppdraget. Forsvarsmodus og de andre oppdragene finner du på startskjermen (meny).',
  'Mission complete': 'Oppdrag fullført', 'Mission failed': 'Oppdrag mislyktes', 'Roll out': 'Rykk ut', 'Play again': 'Spill igjen', 'Try again (R)': 'Prøv igjen (R)', 'new best time': 'ny bestetid',
};

const D = {
  ...MSN,
  // HUD pills and labels
  'FREE ROAM': 'FRI KJØRING', 'STAND BY': 'KLAR', CMDR: 'KMD', SIGHT: 'SIKTE', FLY: 'FLY', DRONE: 'DRONE', DRIVE: 'KJØR', BOMB: 'BOMBE', RECON: 'REKO', DROP: 'SLIPP', BOOM: 'SMELL', 'km/h': 'km/t',
  'FIRE MISSION': 'ILDOPPDRAG', 'CAMOUFLAGE NET': 'KAMUFLASJENETT', 'CUT LINK': 'KUTT LINKEN', 'RECON AUTOPILOT': 'REKO PÅ AUTOPILOT', 'TAKE BACK RECON': 'TA TILBAKE REKO',
  'MAP  ·  Tab or tap to close': 'KART  ·  Tab eller trykk for å lukke',
  // buttons
  TIME: 'TID', CAM: 'KAM', FULL: 'FULL', MUSIC: 'MUSIKK', MENU: 'MENY', TYPE: 'TYPE', NET: 'NETT', SMOKE: 'RØYK', MG: 'MG', ARTY: 'ARTY', AMMO: 'AMMO', FIRE: 'ILD', TANK: 'VOGN', DOWN: 'NED', UP: 'OPP',
  'Restart (R)': 'Start på nytt (R)',
  // start screen
  Missions: 'Oppdrag', Defence: 'Forsvar', 'Free roam': 'Fri kjøring', '‹ Back': '‹ Tilbake', 'Starting…': 'Starter…',
  'Six scripted fights on real ground: ambush a column, retake the tower, break out at night': 'Seks regisserte kamper i virkelig terreng: legg bakhold for en kolonne, ta tilbake tårnet, bryt ut om natten',
  'Hold Nordmarka against six waves of armour, drones and infantry': 'Hold Nordmarka mot seks bølger av panser, droner og infanteri',
  'No enemies: drive, fly the drones and look around': 'Ingen fiender: kjør, fly dronene og se deg rundt',
  'Start by the ski jump': 'Start ved hoppbakken', 'Start at the lodge': 'Start ved restauranten', 'Real Nordmarka — by the ski jump': 'Virkelige Nordmarka — ved hoppbakken', 'Real Nordmarka — at the lodge': 'Virkelige Nordmarka — ved restauranten',
  'The invented forest, lake and three mountains': 'Den oppdiktede skogen, innsjøen og de tre fjellene',
  // menu
  Settings: 'Innstillinger', Language: 'Språk', Quality: 'Kvalitet', '(reloads)': '(laster på nytt)', 'Time of day': 'Tid på døgnet', Snowfall: 'Snøfall', Sound: 'Lyd', Music: 'Musikk', 'Peace mode': 'Fredsmodus', '(no enemies, restarts)': '(ingen fiender, starter på nytt)',
  Vibration: 'Vibrasjon', Trees: 'Trær', '(lower = faster)': '(lavere = raskere)', 'Dynamic resolution': 'Dynamisk oppløsning', 'Performance overlay': 'Ytelsesoverlegg', Game: 'Spill', Controls: 'Kontroller',
  Auto: 'Auto', Low: 'Lav', Medium: 'Middels', High: 'Høy', Ultra: 'Ultra', Midday: 'Middag', Golden: 'Gyllen', 'Blue hour': 'Blåtime', Night: 'Natt', Off: 'Av', On: 'På', Light: 'Lett', Full: 'Full',
  Restart: 'Start på nytt', 'Choose mode, mission or world': 'Velg modus, oppdrag eller verden', 'Show help': 'Vis hjelp', Close: 'Lukk',
  'WebGPU is not available': 'WebGPU er ikke tilgjengelig',
  // cards
  'Your Leopard was knocked out': 'Leoparden din ble slått ut', 'Nordmarka held': 'Nordmarka holdt',
  // wave scenarios
  'Recon in force': 'Stridsoppklaring', 'Tank platoon with escort': 'Stridsvogntropp med følge', 'BMP raid on the roads': 'BMP-raid langs veiene', 'Motorised raid': 'Motorisert raid', 'ATGM ambush': 'Panservernbakhold', Pincer: 'Knipetang', 'Two echelons': 'To echeloner', 'Final assault': 'Sluttangrep',
  // messages: tank, weapons, damage
  'Stand by — contact expected from the north': 'Klar — kontakt ventes fra nord', 'More enemy movement reported — watch your flanks': 'Mer fiendtlig bevegelse meldt — pass på flankene', 'Track hit — repairing': 'Beltet er truffet — reparerer', 'Track repaired': 'Beltet er reparert',
  'ATGM hit on the front armour!': 'Panservernrakett i frontpanseret!', 'ATGM hit!': 'Truffet av panservernrakett!', 'RPG hit on the front armour': 'RPG-treff i frontpanseret', 'RPG hit in the rear!': 'RPG-treff bak!', 'RPG hit on the side!': 'RPG-treff i siden!',
  'Grenade hit — engine deck, it is immobilised': 'Granattreff — motordekket, den står fast', 'Grenade hit — turret roof': 'Granattreff — tårntaket', 'Grenade hit': 'Granattreff', 'Hit — frontal armour held': 'Treff — frontpanseret holdt', Hit: 'Treff',
  'The ATGM lost its guidance': 'Panservernraketten mistet styringen', 'MINE! Track blown — repairing': 'MINE! Beltet er sprengt — reparerer', 'Incoming rockets — remote mining! Move!': 'Raketter på vei inn — fjernlagte miner! Flytt deg!',
  'Disturbed snow ahead — possible mines — marked': 'Urolig snø foran — mulige miner — merket', 'Orlan-10 shot down': 'Orlan-10 skutt ned', 'Orlan-10 recon drone overhead — the enemy sees what it sees. Shoot it down (Q)': 'Orlan-10 rekognoseringsdrone over deg — fienden ser det den ser. Skyt den ned (Q)',
  'No smoke grenades left': 'Ingen røykgranater igjen', 'Smoke!': 'Røyk!', 'RPG team taken out': 'RPG-laget er nedkjempet', 'ATGM team taken out': 'Panservernlaget er nedkjempet', 'Artillery ranging on you — move!': 'Artilleriet skyter seg inn på deg — flytt deg!',
  // camouflage net
  'Camouflage net up — harder to find until you move or fire': 'Kamuflasjenettet er oppe — vanskeligere å finne til du kjører eller skyter', 'Stop the tank to rig the camouflage net': 'Stans vognen for å rigge kamuflasjenettet', 'Camouflage net stowed': 'Kamuflasjenettet er pakket ned',
  'Net thrown off by the gun': 'Nettet røk da kanonen skjøt', 'Net thrown off — the tank moved': 'Nettet røk — vognen flyttet seg', 'Net thrown off by the machine gun': 'Nettet røk da maskingeværet skjøt',
  // own artillery
  'Fire mission already on the way': 'Ildoppdraget er allerede på vei', 'No fire mission left this wave — restocked when the wave is cleared': 'Ingen ildoppdrag igjen i denne bølgen — nytt når bølgen er slått tilbake', 'Target outside the map': 'Målet er utenfor kartet',
  'Target too far — no observed point': 'Målet er for langt unna — ikke observert punkt', 'No target — point the drone camera at the ground': 'Ingen mål — pek dronekameraet mot bakken', 'No target — lay the sight on the ground': 'Ingen mål — legg siktet på bakken', 'Splash in 5 — rounds landing': 'Nedslag om 5 — granatene lander',
  // drones
  'Recon drone battery empty — lost': 'Rekognoseringsdronen er tom for batteri — tapt', 'Recon drone out of radio range — lost': 'Rekognoseringsdronen er utenfor radiorekkevidde — tapt', 'Grenades gone — fly back and land on the tank to rearm, or X to cut the link': 'Tom for granater — fly tilbake og land på vognen for å lade opp, eller X for å kutte linken',
  'No grenades left — land on the tank': 'Ingen granater igjen — land på vognen', 'Recon drone: unarmed — spotted enemies go on the map': 'Rekognoseringsdrone: ubevæpnet — fiender den ser, kommer på kartet', 'B calls artillery where the camera looks': 'B kaller artilleri dit kameraet ser',
  'Back on the recon drone': 'Tilbake på rekognoseringsdronen', 'No room to launch a drone under the bridge — drive out first': 'Ikke plass til å sende opp en drone under brua — kjør ut først', 'Land the drone or cut the link first': 'Land dronen eller kutt linken først',
  'Drone: RECON — one is keeping watch, X takes it back': 'Drone: REKO — én står på vakt, X tar den tilbake', 'Drone link lost': 'Dronelinken er brutt', 'Bomber crashed — lost': 'Bombedronen styrtet — tapt', 'Recon drone crashed — lost': 'Rekognoseringsdronen styrtet — tapt',
  'Bomber landed — rearmed': 'Bombedronen har landet — ladet opp', 'Recon drone landed': 'Rekognoseringsdronen har landet', 'Drone battery empty — lost': 'Dronen er tom for batteri — tapt', 'Drone out of radio range — lost': 'Dronen er utenfor radiorekkevidde — tapt', 'Drone link cut — back in the tank': 'Dronelinken er kuttet — tilbake i vognen',
  'FPV away — R2 detonates': 'FPV ute — R2 detonerer', 'Bomber away — R2 drops a grenade on the marker': 'Bombedrone ute — R2 slipper en granat på markøren', 'Recon drone climbing — hold ✕: autopilot': 'Rekognoseringsdronen stiger — hold ✕: autopilot',
  'left stick height/turn': 'venstre stikke høyde/sving', 'right stick fly': 'høyre stikke fly', 'L1/L2 tilt the camera': 'L1/L2 vipper kameraet', 'hold ✕: back to the tank': 'hold ✕: tilbake til vognen',
  'FPV away — WASD fly': 'FPV ute — WASD flyr', 'Space/Shift up/down': 'Mellomrom/Shift opp/ned', 'LMB detonate': 'venstre museknapp detonerer', 'X back to the tank': 'X tilbake til vognen', 'Bomber away — WASD fly': 'Bombedrone ute — WASD flyr', 'mouse tilts the camera': 'musen vipper kameraet',
  'LMB drops a grenade on the marker': 'venstre museknapp slipper en granat på markøren', 'land on the tank to rearm': 'land på vognen for å lade opp', 'Recon drone climbing — enemies in its camera go on the map': 'Rekognoseringsdronen stiger — fiender i kameraet kommer på kartet',
  'X: back to the tank (it keeps flying)': 'X: tilbake til vognen (den flyr videre)', 'land on the tank to recover it': 'land på vognen for å ta den inn igjen',
  ' — one-way shaped charge': ' — enveis hulladning', ' — hovers and drops grenades': ' — svever og slipper granater', ' — flies high and spots for the map': ' — flyr høyt og observerer for kartet',
  'Outside view': 'Utvendig visning', Camera: 'Kamera', 'Camera 2×': 'Kamera 2×', 'Camera 4×': 'Kamera 4×', 'Chase camera, far': 'Følgekamera, langt', 'Chase camera': 'Følgekamera', 'FPV goggles': 'FPV-briller',
  // settings and views
  'Commander view': 'Vognførerens utsyn', 'Gunner sight': 'Skyttersiktet', 'Free-fly camera': 'Fritt kamera', Drone: 'Drone', 'Golden hour': 'Gyllen time', 'Thermal sight off': 'Termisk sikte av', 'Thermal sight: white-hot': 'Termisk sikte: hvitt er varmt', 'Thermal sight: black-hot': 'Termisk sikte: svart er varmt',
  'Snowfall on': 'Snøfall på', 'Snowfall off': 'Snøfall av', 'Sound on': 'Lyd på', 'Sound off': 'Lyd av', 'Music on': 'Musikk på', 'Music off': 'Musikk av', 'This world is free roam only': 'Denne verdenen har bare fri kjøring',
  'Peace mode: free roam, no enemies': 'Fredsmodus: fri kjøring, ingen fiender', 'Peace mode off: waves restart': 'Fredsmodus av: bølgene starter på nytt', 'Vibration off': 'Vibrasjon av', 'Vibration light': 'Lett vibrasjon', 'Vibration full': 'Full vibrasjon',
  'Low frame rate — open MENU and lower Quality or Trees': 'Lav bildefrekvens — åpne MENY og senk Kvalitet eller Trær', 'Fullscreen not available': 'Fullskjerm er ikke tilgjengelig',
};
const UP = {}; for (const k of ['First contact', 'Column on Holmenkollveien', 'Retake the tower', 'Hold the arena', 'Find the command post', 'Night breakthrough']) UP[k.toUpperCase()] = MSN[k].toUpperCase();
const TQ = { high: 'høy', medium: 'middels', low: 'lav', off: 'av' };

// patterns for texts with numbers, names and directions: [regular expression, function of its match, 1 = may span a composite 'a · b' (the rest only see one part)]
const R = [
  [/^HOLD (.) · (.+)$/, (m) => `HOLD ${m[1]} · ${tr(m[2])}`, 1],
  [/^LAUNCH (\S+)$/, (m) => `SEND UT ${DRN[m[1]] || m[1]}`],
  [/^HULL (\d+)$/, (m) => `SKROG ${m[1]}`], [/^TRACK( \d+ s)?$/, (m) => `BELTE${m[1] || ''}`], [/^SMOKE (\d+)$/, (m) => `RØYK ${m[1]}`], [/^NET( \d+ s)?$/, (m) => `NETT${m[1] || ''}`],
  [/^WAVE (\S+)$/, (m) => `BØLGE ${m[1]}`], [/^(\d+) KILLS$/, (m) => `${m[1]} UTSLÅTT`], [/^(FPV|BOMB|RECON)( [×\d][^·]*)?$/, (m) => DRN[m[1]] + (m[2] || '')], [/^RECON↑ (\d+ s)$/, (m) => `REKO↑ ${m[1]}`],
  [/^([A-Z][A-Z ]+[A-Z])( \d+\/\d+)?$/, (m) => (UP[m[1]] ? UP[m[1]] + (m[2] || '') : m[0])],
  [/^(\d+) left$/, (m) => `${m[1]} igjen`], [/^(\d+)\/(\d+) through$/, (m) => `${m[1]}/${m[2]} gjennom`], [/^enemy control (\d+)%$/, (m) => `fienden holder ${m[1]} %`], [/^([\d.]+ k?m) (NE|NW|SE|SW|N|E|S|W)$/, (m) => `${m[1]} ${CMP[m[2]]}`],
  [/^Mission complete — (.+)$/, (m) => `Oppdrag fullført — ${tr(m[1])}`], [/^Mission failed — (.+)$/, (m) => `Oppdrag mislyktes — ${tr(m[1])}`], [/^Next mission: (.+)$/, (m) => `Neste oppdrag: ${tr(m[1])}`],
  [/^(\d+) vehicles destroyed$/, (m) => `${m[1]} kjøretøy ødelagt`], [/^hull (\d+)$/, (m) => `skrog ${m[1]}`], [/^best (\S+)$/, (m) => `beste ${m[1]}`], [/^Wave (\d+)$/, (m) => `Bølge ${m[1]}`], [/^All (\d+) waves beaten$/, (m) => `Alle ${m[1]} bølgene slått tilbake`],
  [/^score (\d+)\. Press R to start over, or close this and keep fighting\.$/, (m) => `poeng ${m[1]}. Trykk R for å starte på nytt, eller lukk dette og kjemp videre.`], [/^score (\d+)$/, (m) => `poeng ${m[1]}`],
  [/^Wave (\d+) — ([^:]+): (.*)$/, (m) => `Bølge ${m[1]} — ${tr(m[2])}: ${tr(m[3])}`, 1], [/^Contact! (.*)$/, (m) => `Kontakt! ${tr(m[1])}`, 1],
  [new RegExp(`^(\\d+) from the (${DN}), ~(\\d+) m$`), (m) => `${m[1]} fra ${DIR[m[2]]}, ~${m[3]} m`], [new RegExp(`^Mines reported on the roads to the (${DN})$`), (m) => `Miner meldt på veiene mot ${DIR[m[1]]}`],
  [/^Wave (\d+) cleared — resupplied$/, (m) => `Bølge ${m[1]} slått tilbake — etterforsynt`],
  [/^(.+) destroyed$/, (m) => `${cap(veh(m[1]))} ødelagt`], [/^(.+) shot down$/, (m) => `${cap(veh(m[1]))} skutt ned`], [/^Out of (.+)$/, (m) => `Tom for ${m[1]}`], [/^Loading (.+)$/, (m) => `Lader ${m[1]}`],
  [new RegExp(`^ATGM launch from the (${DN})! Smoke or cover breaks its guidance$`), (m) => `Panservernrakett avfyrt fra ${DIR[m[1]]}! Røyk eller dekning bryter styringen`],
  [new RegExp(`^RPG fire from the (${DN})!( Infantry in the house — HE)?$`), (m) => `RPG-ild fra ${DIR[m[1]]}!${m[2] ? ' Infanteri i huset — HE' : ''}`],
  [new RegExp(`^(BMP|BTR) dismounting infantry to the (${DN})$`), (m) => `${m[1]} setter av infanteri mot ${DIR[m[2]]}`],
  [new RegExp(`^(.+) from the (${DN}) diving on you — shoot it \\(Q\\) or move!$`), (m) => `${cap(veh(m[1]))} fra ${DIR[m[2]]} stuper mot deg — skyt den (Q) eller flytt deg!`],
  [new RegExp(`^(.+) inbound from the (${DN})!$`), (m) => `${cap(veh(m[1]))} på vei inn fra ${DIR[m[2]]}!`], [/^(.+) lost you in the smoke$/, (m) => `${cap(veh(m[1]))} mistet deg i røyken`],
  [/^Hit by an? (.+)!$/, (m) => `Truffet av en ${veh(m[1])}!`], [/^Drone: (\d+) mines? spotted — marked$/, (m) => `Drone: ${m[1]} ${m[1] === '1' ? 'mine' : 'miner'} oppdaget — merket`],
  [/^Rigging the camouflage net — (\d+) s\. Driving or firing throws it off$/, (m) => `Rigger kamuflasjenettet — ${m[1]} s. Det ryker hvis du kjører eller skyter`],
  [/^Recon drone keeps watch on its own for (\d+) s — launch another drone with X; with RECON picked, X takes it back$/, (m) => `Rekognoseringsdronen står på vakt alene i ${m[1]} s — send ut en ny drone med X; med REKO valgt tar X den tilbake`],
  [/^No (\S+) drones left( — Z picks another type)?$/, (m) => `Ingen ${DRN[m[1]] || m[1]}-droner igjen${m[2] ? ' — Z velger en annen type' : ''}`],
  [/^Drone: (\S+) \((\d+) left\)( — .*)?$/, (m) => `Drone: ${DRN[m[1]] || m[1]} (${m[2]} igjen)${m[3] ? tr(m[3]) : ''}`],
  [new RegExp(`^Fire mission: (\\d+) rounds, (\\d+) s — (.+?) (${DN})( · DANGER CLOSE — move away!)?$`), (m) => `Ildoppdrag: ${m[1]} granater, ${m[2]} s — ${m[3]} ${DIR[m[4]]}${m[5] ? ' · FARLIG NÆR — flytt deg!' : ''}`, 1],
  [/^No fire mission available — next one in (\d+) s$/, (m) => `Ingen ildoppdrag tilgjengelig — neste om ${m[1]} s`],
  [/^A vehicle got through to Voksenkollen \((\d+) of (\d+) allowed\)$/, (m) => `Et kjøretøy slapp gjennom til Voksenkollen (${m[1]} av ${m[2]} tillatt)`],
  [/^Trees: (.+)$/, (m) => `Trær: ${TQ[m[1]] || m[1]}`], [/^(Thermal sight[^(]*?)( \(gunner sight and drone\))$/, (m) => `${tr(m[1])} (skyttersikte og drone)`], [/^(.+) — click to look$/, (m) => `${tr(m[1])} — klikk for å se deg rundt`],
];

export function tr(s) {
  if (LANG !== 'no' || !s || typeof s !== 'string') return s;
  const d = D[s]; if (d !== undefined) return d;
  const multi = s.indexOf(' · ') >= 0;
  for (let i = 0; i < R.length; i++) { if (multi && !R[i][2]) continue; const m = R[i][0].exec(s); if (m) return R[i][1](m); }
  if (s.indexOf('\n') >= 0) return s.split('\n').map(tr).join('\n');
  if (multi) return s.split(' · ').map(tr).join(' · ');
  return s;
}

// ---- the static page in Norwegian: text nodes by dictionary, and the blocks with markup (hint bars, help) as whole HTML ----
const K = (s) => `<kbd>${s}</kbd>`;
const HTML = {
  keys: `${K('W')}${K('A')}${K('S')}${K('D')} kjør · <b>Mus</b> sikt · <b>V. knapp</b> skyt · <b>H. knapp</b> sikte · ${K('Mellomrom')} MG · ${K('Tab')} kart · ${K('1')}–${K('3')} ammo · ${K('G')} røyk · ${K('K')} nett · ${K('V')} termisk · ${K('X')} drone · ${K('Z')} type · ${K('B')} artilleri · ${K('M')} lyd · ${K('U')} musikk · ${K('H')} hjelp`,
  padk: `<b>V. stikke</b> kjør · <b>H. stikke</b> sikt · ${K('R2')} skyt · ${K('L2')} sikte · ${K('R1')} MG · ${K('L1')} røyk · ${K('□')} ammo · hold ${K('□')} nett · ${K('△')} termisk · hold ${K('✕')} drone · hold ${K('○')} artilleri · ${K('↑')}${K('↓')} zoom · ${K('←')}${K('→')} type · ${K('Create')} kart`,
  padd: `<b>V. stikke</b> høyde · sving · <b>H. stikke</b> fly · ${K('L1')}${K('L2')} vipp kameraet · ${K('R2')} detoner / slipp · hold ${K('✕')} tilbake til vognen · hold ${K('○')} artilleri · ${K('△')} termisk · ${K('↑')}${K('↓')} visning · ${K('Create')} kart`,
  hD: [
    [`${K('W')} ${K('S')} ${K('A')} ${K('D')}`, 'Kjør: gass / revers, sving (snur på stedet). Brøytet vei er raskere enn dyp snø'],
    ['Mus', 'Klikk for å fange pekeren. Sikt med siktet; tårnet og kanonen følger etter i sitt eget tempo — skyt når ringen er grønn'],
    ['Venstre knapp', 'Skyt med 120 mm-kanonen (4 s ladetid)'],
    [`Høyre knapp · ${K('C')}`, 'Skyttersiktet (hold, eller slå av og på med C) — hjulet endrer forstørrelsen'],
    [`${K('1')} ${K('2')} ${K('3')}`, 'APFSDS (panser) · HEAT-MP (flerbruk) · HE (myke mål, stor sprengvirkning)'],
    [`${K('Mellomrom')} ${K('Q')}`, `Hold Mellomrom for maskingeværet: den koaksiale MG3-en til vanlig; ser du høyere enn kanonen kan heves (opptil 70°), eller legger siktet på en drone, skyter vognførerens luke-MG3 i stedet — svaret på fiendtlige droner. ${K('Q')} tvinger luke-MG-en. Røde piler rundt siktet peker mot FPV-droner og Lancet på vei inn (blinker: stuper mot deg). Røyk bryter låsen til en Lancet; trær og bevegelse gjør deg vanskeligere å finne. En Orlan som sirkler høyt, forteller fienden hvor du er — skyt den ned. Noen T-72 har et bur over tårnet som demper droneangrep ovenfra`],
    [K('G'), 'Røykgranater — bryter fiendens siktlinje, og blender termiske sikter også'],
    [K('K'), 'Kamuflasjenett: stå stille, så rigger mannskapet det på 8 s. Det gjør vognen mye vanskeligere å finne for kjøretøy, infanteri og droner som ikke har sett den ennå — rigg det før du flyr en drone. Det hjelper ikke mot en fiende som allerede skyter på deg, og det ryker hvis du kjører eller skyter'],
    [K('V'), 'Termisk kamera i skyttersiktet og på dronen: av · hvitt er varmt · svart er varmt. Ser motorer, belter og branner gjennom mørke, dis og støv'],
    [`${K('X')} ${K('Z')}`, `Send opp en drone; ${K('Z')} velger type. Mus + ${K('WASD')} flyr, ${K('Mellomrom')}/${K('Shift')} opp/ned. <b>FPV</b> (5): fly inn i et kjøretøy, venstre knapp detonerer. <b>BOMBE</b> (2): svever, kameraet vipper rett ned, venstre knapp slipper én av 3 granater på markøren (tak og motordekke er svake); land på vognen for å lade opp. <b>REKO</b> (2): stiger til 110 m, 6 min, ubevæpnet; det kameraet ser, kommer på kartet; ${K('X')} mens den er oppe gir den til autopiloten (den sirkler og holder vakt til batteriet er tomt) og setter deg tilbake i vognen. Mens den står på vakt, kan du velge en annen type med ${K('Z')} og sende ut den; med REKO valgt tar ${K('X')} vaktdronen tilbake. ${K('X')} igjen kutter linken (dronen er tapt). Vognen står stille og utsatt imens`],
    [K('B'), 'Artilleri: ett ildoppdrag per bølge (nytt når bølgen er slått tilbake) — seks 155 mm-granater lander rundt punktet omtrent 25 s senere. I vognen går det dit siktet er lagt; fra en drone, dit kameraet ser (bombedronen: på slippmarkøren). Tar ut lette kjøretøy og BMP-er, raserer hus, slår ofte ut en T-72. Innenfor 150 m fra vognen din er det farlig nær'],
    ['Miner', 'Fiendens ingeniører minelegger veier foran deg (en svak grå flekk i snøen, varm i det termiske siktet), og raketter kan spre miner rundt deg. Kjører du på en, ryker et belte: du står fast i noen sekunder (BELTE) og mister skrog. Droner og et nært blikk merker dem med røde flagg; HE eller en MG-salve utløser dem'],
    ['Oppdrag', `Pillen under topplinjen viser målet, hva som gjenstår, og avstand og retning dit; kartet viser det som en stiplet ring (grønn: kjør dit · blå: hold det · rød: fiende der · gul: søkeområde), og farget røyk stiger fra et sted du skal nå eller holde. ${K('R')} starter oppdraget på nytt; menyen tar deg tilbake til startskjermen`],
    [`${K('T')} ${K('N')} ${K('M')} ${K('U')}`, 'Tid på døgnet · snøfall · lyd · musikk'],
    [`${K('R')} ${K('H')} ${K('Esc')}`, 'Start på nytt · denne hjelpen · meny'],
    ['Gamepad', 'Venstre stikke kjør · høyre stikke sikt · R2 skyt · L2 sikte (hold; L3 låser det) · R1 MG · R3 tving luke-MG · L1 røyk · □ ammo (hold □: kamuflasjenett) · △ termisk · hold ✕ send opp drone · hold ○ artilleri · styrekors ↑↓ forstørrelse, ←→ dronetype · Create kart · Options meny (Vibrasjon: av / lett / full)'],
    ['Gamepad, drone', 'Som en DJI-kontroller (modus 2): venstre stikke høyde og sving · høyre stikke fly · L1/L2 vipp kameraet · R2 detoner / slipp · hold ✕ tilbake til vognen (reko: autopilot; da kan en annen type sendes ut, og med REKO valgt tar hold ✕ den tilbake) · hold ○ artilleri dit kameraet ser · △ termisk · styrekors ↑↓ visning: FPV følgekamera langt / følgekamera / briller, bombe og reko utvendig / kamera / 2× / 4× (musehjulet og kniping gjør det samme)'],
  ],
  hT: [
    ['Venstre tommel', 'Styrespak: skyv for å kjøre, sidelengs for å svinge'],
    ['Høyre side', 'Dra for å se deg rundt · knip for å zoome'],
    ['ILD · AMMO', 'Skyt med kanonen · bla mellom APFSDS / HEAT-MP / HE (ammopillen øverst viser hva som er ladet)'],
    ['MG · RØYK', 'Hold for maskingeværet (det bytter selv til luke-MG-en når du drar blikket opp eller over på en drone; røde piler rundt siktet peker mot droner på vei inn) · skyt røykgranatene'],
    ['NETT', 'Kamuflasjenett: stå stille, så er det rigget på 8 s (knappen blir grønn). Mye vanskeligere å finne for fiender som ikke har sett deg ennå — bruk det før du flyr en drone. Det ryker hvis du kjører eller skyter'],
    ['DRONE · TYPE', 'Send opp dronen som står på knappen; TYPE bytter FPV / BOMBE / REKO. Styrespaken flyr, dra for å svinge (og vippe bombekameraet), OPP / NED endrer høyden, SMELL detonerer FPV-en, SLIPP slipper en granat, VOGN kutter linken. Land bombe- eller rekodronen på vognen for å få den tilbake. VOGN mens du flyr rekodronen lar den sirkle på vakt: da kan du sende ut en annen type, og med REKO på knappen tar DRONE den tilbake'],
    ['ARTY', 'Ett artilleriildoppdrag per bølge: seks 155 mm-granater lander omtrent 25 s senere på punktet siktet er lagt på — eller, fra en drone, der kameraet ser. Hold vognen din 150 m unna'],
    ['Kart', 'Trykk på kartet for stor visning (trykk igjen for å lukke). Fiender noen har sett — mannskapet, siktet, en drone eller deres egen munningsild (rød T-72, oransje BMP-2; hul = sist kjente posisjon)'],
    ['Miner', 'Grå flekker i snøen på veiene foran kan være miner; røde flagg merker dem som er funnet. Kjører du på en, ryker et belte (BELTE) — skyt den med HE eller MG i stedet'],
    ['Oppdrag', 'Pillen under bølgelinjen viser målet, hva som gjenstår, og avstand og retning dit; kartet viser det som en stiplet ring, og farget røyk stiger fra et sted du skal nå eller holde. MENY → Start på nytt starter oppdraget igjen'],
    ['KAM · TID', 'Vognførerens utsyn eller skyttersiktet · tid på døgnet'],
    ['Trykk med 3 fingre', 'Ytelsesoverlegg'],
  ],
  note: 'Russisk panser rykker fram mot Holmenkollen fra nord. Hold Nordmarka.',
};
// doc: the document; translates the static page in place (once, at load, before anything is shown)
export function trPage(doc) {
  if (LANG !== 'no') return;
  doc.documentElement.lang = 'no';
  const skip = new Set(['hD', 'hT', 'keys', 'padk', 'padd', 'osd']);
  const walk = (el) => { for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 3) { const s = n.nodeValue, k = s.trim(), d = k && D[k]; if (d) n.nodeValue = s.replace(k, d); }
    else if (n.nodeType === 1 && !skip.has(n.id) && n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE') walk(n); } };
  for (const id of ['ui', 'load', 'err']) { const e = doc.getElementById(id); if (e) walk(e); }
  for (const id of ['keys', 'padk', 'padd']) { const e = doc.getElementById(id); if (e) e.innerHTML = HTML[id]; }
  for (const id of ['hD', 'hT']) { const e = doc.getElementById(id); if (e) e.innerHTML = HTML[id].map((r) => `<b>${r[0]}</b><span>${r[1]}</span>`).join(''); }
  const nt = doc.querySelector('#help .note'); if (nt) nt.textContent = HTML.note;
}
