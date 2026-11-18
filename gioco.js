const URL_CONFIGURAZIONE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQxu8td_LkOM4lhsVE9-c19_vGCrlKW7kmhcIfZjlkxzK-nKAaG4ORVlqk8OBRf3Q3o3J1Gth4xgHCs/pub?gid=1729008688&single=true&output=csv";
const URL_LIVELLO = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQxu8td_LkOM4lhsVE9-c19_vGCrlKW7kmhcIfZjlkxzK-nKAaG4ORVlqk8OBRf3Q3o3J1Gth4xgHCs/pub?gid=107549291&single=true&output=csv";
const GRANDEZZA_CELLA = 40;
const MS_PER_FRAME = 1000 / 60;
const DURATA_BUFFER_SALTO = 8;
const SIMBOLI_LIVELLO = new Set(["", "#", "P", "o", "^", "F"]);

const canvas = document.getElementById("game-canvas");
const context = canvas.getContext("2d");
const overlay = document.getElementById("game-overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayDescription = document.getElementById("overlay-description");
const overlayPrimary = document.getElementById("overlay-primary");
const overlaySecondary = document.getElementById("overlay-secondary");
const pauseButton = document.getElementById("pause-button");
const restartButton = document.getElementById("restart-button");
const loadError = document.getElementById("load-error");
const pressedKeys = new Set();
const touchDirections = new Set();
let saltoRichiesto = 0;

let configurazione = null;
let mappa = null;
let giocatore = null;
let monete = [];
let stato = "loading";
let frameId = 0;
let ultimoFrame = 0;
let azionePrimaria = null;
let azioneSecondaria = null;
let immaginePersonaggio = null;

function parseCsv(testo) {
  const contenuto = testo.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const righe = [];
  let riga = [];
  let cella = "";
  let virgolette = false;

  for (let indice = 0; indice < contenuto.length; indice++) {
    const carattere = contenuto[indice];
    if (virgolette && carattere === '"' && contenuto[indice + 1] === '"') {
      cella += '"';
      indice++;
    } else if (carattere === '"' && !virgolette && cella === "") {
      virgolette = true;
    } else if (carattere === '"' && virgolette) {
      virgolette = false;
    } else if (carattere === "," && !virgolette) {
      riga.push(cella.trim());
      cella = "";
    } else if (carattere === "\n" && !virgolette) {
      riga.push(cella.trim());
      righe.push(riga);
      riga = [];
      cella = "";
    } else {
      cella += carattere;
    }
  }

  if (virgolette) throw new Error("Un foglio contiene una cella CSV con virgolette non chiuse.");
  if (cella !== "" || riga.length > 0) {
    riga.push(cella.trim());
    righe.push(riga);
  }
  return righe;
}

async function leggiCsv(url) {
  const risposta = await fetch(url);
  if (!risposta.ok) throw new Error("Caricamento del foglio non riuscito (HTTP " + risposta.status + ").");
  return risposta.text();
}

function leggiConfigurazione(testo) {
  const righe = parseCsv(testo);
  if (righe.length < 2) throw new Error("Il foglio Gioco non contiene impostazioni.");

  const intestazioni = righe[0];
  if (!intestazioni.includes("impostazione") || !intestazioni.includes("valore")) {
    throw new Error("Il foglio Gioco deve contenere le colonne impostazione e valore.");
  }

  const indiceNome = intestazioni.indexOf("impostazione");
  const indiceValore = intestazioni.indexOf("valore");
  const valori = Object.create(null);
  righe.slice(1).forEach(campi => {
    const nome = campi[indiceNome];
    if (nome) valori[nome] = campi[indiceValore] || "";
  });

  const richieste = [
    "titolo", "istruzioni", "sfondo", "giocatore", "piattaforme", "monete",
    "ostacoli", "bandiera", "velocita", "salto", "gravita", "vite", "personaggio"
  ];
  const mancanti = richieste.filter(nome => !Object.prototype.hasOwnProperty.call(valori, nome));
  if (mancanti.length) throw new Error("Impostazioni mancanti nel foglio Gioco: " + mancanti.join(", ") + ".");

  const colori = ["sfondo", "giocatore", "piattaforme", "monete", "ostacoli", "bandiera"];
  colori.forEach(nome => {
    if (!/^#[0-9a-f]{6}$/i.test(valori[nome])) {
      throw new Error("Il colore dell'impostazione " + nome + " non è un codice esadecimale valido.");
    }
  });

  const limiti = {
    velocita: [2, 8],
    salto: [8, 16],
    gravita: [3, 10],
    vite: [1, 9]
  };
  Object.keys(limiti).forEach(nome => {
    const valore = Number(valori[nome]);
    const [minimo, massimo] = limiti[nome];
    if (!Number.isFinite(valore) || valore < minimo || valore > massimo) {
      throw new Error("Il valore di " + nome + " deve essere compreso tra " + minimo + " e " + massimo + ".");
    }
    valori[nome] = valore;
  });

  if (!valori.titolo || !valori.istruzioni) {
    throw new Error("Il titolo e le istruzioni nel foglio Gioco non possono essere vuoti.");
  }
  return valori;
}

function leggiMappa(testo) {
  const righe = parseCsv(testo).filter(riga => riga.some(cella => cella !== ""));
  if (!righe.length) throw new Error("Il foglio Livello non contiene una mappa.");

  const larghezza = righe[0].length;
  if (larghezza < 4 || righe.some(riga => riga.length !== larghezza)) {
    throw new Error("La mappa deve essere una griglia CSV rettangolare.");
  }

  let partenze = 0;
  let traguardi = 0;
  righe.forEach((riga, y) => riga.forEach((cella, x) => {
    if (!SIMBOLI_LIVELLO.has(cella)) {
      throw new Error("Simbolo non riconosciuto nella mappa alla riga " + (y + 1) + ", colonna " + (x + 1) + ": " + cella);
    }
    if (cella === "P") partenze++;
    if (cella === "F") traguardi++;
  }));
  if (partenze !== 1) throw new Error("La mappa deve contenere un solo simbolo P per la partenza.");
  if (traguardi !== 1) throw new Error("La mappa deve contenere un solo simbolo F per il traguardo.");

  return { righe, larghezza, altezza: righe.length };
}

async function caricaImmaginePersonaggio(nomeFile) {
  const file = nomeFile.trim();
  if (!file) return null;
  if (!/^[a-z0-9._-]+\.(?:avif|gif|jpe?g|png|webp)$/i.test(file) || file.startsWith(".")) {
    throw new Error("Il nome file dell'impostazione personaggio non è valido.");
  }

  const immagine = new Image();
  immagine.src = "img/" + file;
  try {
    await immagine.decode();
  } catch (errore) {
    throw new Error("Non riesco a caricare img/" + file + " indicato nel foglio Gioco.");
  }
  return immagine;
}

function impostaPalette() {
  const radice = document.documentElement;
  radice.style.setProperty("--nr-bg", configurazione.sfondo);
  radice.style.setProperty("--nr-player", configurazione.giocatore);
  radice.style.setProperty("--nr-platform", configurazione.piattaforme);
  radice.style.setProperty("--nr-coin", configurazione.monete);
  radice.style.setProperty("--nr-hazard", configurazione.ostacoli);
  radice.style.setProperty("--nr-goal", configurazione.bandiera);
  document.querySelectorAll(".guide-panel").forEach(elemento => {
    elemento.setAttribute("aria-label", "Come si gioca. " + configurazione.istruzioni);
  });
  document.getElementById("sheet-instructions").textContent = configurazione.istruzioni;
  document.title = configurazione.titolo + " — Escape the Digital World";
  document.getElementById("game-title").textContent = configurazione.titolo;
  canvas.setAttribute("aria-label", configurazione.titolo + ". Usa le frecce per muoverti e Spazio per saltare.");
}

function creaMonete() {
  monete = [];
  mappa.righe.forEach((riga, y) => riga.forEach((cella, x) => {
    if (cella === "o") monete.push({ x: (x + 0.5) * GRANDEZZA_CELLA, y: (y + 0.5) * GRANDEZZA_CELLA, raccolta: false });
  }));
}

function creaGiocatore() {
  let partenza;
  mappa.righe.forEach((riga, y) => riga.forEach((cella, x) => {
    if (cella === "P") partenza = { x, y };
  }));
  if (!partenza) throw new Error("Non è stata trovata la posizione iniziale P.");
  return {
    x: partenza.x * GRANDEZZA_CELLA + (GRANDEZZA_CELLA - 24) / 2,
    y: partenza.y * GRANDEZZA_CELLA + GRANDEZZA_CELLA - 32,
    larghezza: 24,
    altezza: 32,
    velocitaY: 0,
    aTerra: false,
    vite: configurazione.vite,
    moneteRaccolte: 0,
    punteggio: 0,
    invulnerabile: 0,
    attesaRipartenza: 0
  };
}

function aggiornaHud() {
  if (!giocatore) return;
  document.getElementById("score-count").textContent = String(giocatore.punteggio);
  document.getElementById("coin-count").textContent = giocatore.moneteRaccolte + " / " + monete.length;
  document.getElementById("life-count").textContent = giocatore.vite + " / " + configurazione.vite;
  document.getElementById("level-count").textContent = "01";
}

function mostraOverlay(titolo, descrizione, testoPrimario, azione, testoSecondario = "", callbackSecondaria = null) {
  overlayTitle.textContent = titolo;
  overlayDescription.textContent = descrizione;
  overlayPrimary.textContent = testoPrimario;
  overlayPrimary.disabled = false;
  overlay.hidden = false;
  azionePrimaria = azione;
  azioneSecondaria = callbackSecondaria;

  if (testoSecondario) {
    overlaySecondary.textContent = testoSecondario;
    overlaySecondary.hidden = false;
  } else {
    overlaySecondary.hidden = true;
  }
  overlayPrimary.focus();
}

function nascondiOverlay() {
  overlay.hidden = true;
  overlayPrimary.disabled = false;
}

function fermaCiclo() {
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  ultimoFrame = 0;
}

function avviaCiclo() {
  if (!frameId && stato === "playing") frameId = requestAnimationFrame(ciclo);
}

function iniziaPartita() {
  fermaCiclo();
  giocatore = creaGiocatore();
  creaMonete();
  pressedKeys.clear();
  touchDirections.clear();
  saltoRichiesto = 0;
  stato = "playing";
  loadError.hidden = true;
  pauseButton.disabled = false;
  pauseButton.textContent = "Ⅱ Pausa";
  pauseButton.setAttribute("aria-label", "Metti in pausa");
  aggiornaHud();
  nascondiOverlay();
  canvas.focus({ preventScroll: true });
  disegna(performance.now());
  avviaCiclo();
}

function mettiInPausa(automatico = false) {
  if (stato !== "playing") return;
  stato = "paused";
  fermaCiclo();
  pressedKeys.clear();
  touchDirections.clear();
  saltoRichiesto = 0;
  pauseButton.textContent = "▶ Riprendi";
  pauseButton.setAttribute("aria-label", "Riprendi la partita");
  mostraOverlay(
    automatico ? "PARTITA IN PAUSA" : "PAUSA",
    automatico ? "La partita è stata messa in pausa mentre questa scheda non era visibile." : "Riprendi la corsa quando sei pronto.",
    "RIPRENDI",
    riprendiPartita,
    "RICOMINCIA",
    iniziaPartita
  );
}

function riprendiPartita() {
  if (stato !== "paused") return;
  stato = "playing";
  pauseButton.textContent = "Ⅱ Pausa";
  pauseButton.setAttribute("aria-label", "Metti in pausa");
  nascondiOverlay();
  canvas.focus({ preventScroll: true });
  avviaCiclo();
}

function terminaPartita(vittoria) {
  stato = vittoria ? "won" : "over";
  fermaCiclo();
  pressedKeys.clear();
  touchDirections.clear();
  saltoRichiesto = 0;
  pauseButton.disabled = true;
  mostraOverlay(
    vittoria ? "VITTORIA" : "GAME OVER",
    vittoria
      ? "Traguardo raggiunto. Punteggio finale: " + giocatore.punteggio + "."
      : "Le vite sono terminate. Punteggio: " + giocatore.punteggio + ".",
    "RIGIOCA",
    iniziaPartita,
    "PORTFOLIO",
    () => { window.location.href = "index.html"; }
  );
}

function rettangoliSiToccano(a, b) {
  return a.x < b.x + b.larghezza &&
    a.x + a.larghezza > b.x &&
    a.y < b.y + b.altezza &&
    a.y + a.altezza > b.y;
}

function cellaSolida(x, y) {
  return mappa.righe[y] && mappa.righe[y][x] === "#";
}

function gestisciCollisioniOrizzontali(spostamento) {
  giocatore.x += spostamento;
  const primaColonna = Math.floor((giocatore.x + 1) / GRANDEZZA_CELLA);
  const ultimaColonna = Math.floor((giocatore.x + giocatore.larghezza - 1) / GRANDEZZA_CELLA);
  const primaRiga = Math.floor((giocatore.y + 1) / GRANDEZZA_CELLA);
  const ultimaRiga = Math.floor((giocatore.y + giocatore.altezza - 1) / GRANDEZZA_CELLA);

  for (let y = primaRiga; y <= ultimaRiga; y++) {
    for (let x = primaColonna; x <= ultimaColonna; x++) {
      if (!cellaSolida(x, y)) continue;
      if (spostamento > 0) giocatore.x = x * GRANDEZZA_CELLA - giocatore.larghezza;
      else if (spostamento < 0) giocatore.x = (x + 1) * GRANDEZZA_CELLA;
    }
  }
}

function gestisciCollisioniVerticali(spostamento, fondoPrecedente) {
  giocatore.y += spostamento;
  giocatore.aTerra = false;
  const primaColonna = Math.floor((giocatore.x + 1) / GRANDEZZA_CELLA);
  const ultimaColonna = Math.floor((giocatore.x + giocatore.larghezza - 1) / GRANDEZZA_CELLA);
  const primaRiga = Math.floor((giocatore.y + 1) / GRANDEZZA_CELLA);
  const ultimaRiga = Math.floor((giocatore.y + giocatore.altezza - 1) / GRANDEZZA_CELLA);

  for (let y = primaRiga; y <= ultimaRiga; y++) {
    for (let x = primaColonna; x <= ultimaColonna; x++) {
      if (!cellaSolida(x, y)) continue;
      if (spostamento > 0 && fondoPrecedente <= y * GRANDEZZA_CELLA + spostamento + 1) {
        giocatore.y = y * GRANDEZZA_CELLA - giocatore.altezza;
        giocatore.velocitaY = 0;
        giocatore.aTerra = true;
      } else if (spostamento < 0) {
        giocatore.y = (y + 1) * GRANDEZZA_CELLA;
        giocatore.velocitaY = 0;
      }
    }
  }
}

function gestisciDanno() {
  giocatore.vite--;
  if (giocatore.vite <= 0) {
    aggiornaHud();
    terminaPartita(false);
    return;
  }

  const riga = mappa.righe.findIndex(campi => campi.includes("P"));
  const colonna = mappa.righe[riga].indexOf("P");
  giocatore.x = colonna * GRANDEZZA_CELLA + (GRANDEZZA_CELLA - giocatore.larghezza) / 2;
  giocatore.y = (riga + 1) * GRANDEZZA_CELLA - giocatore.altezza;
  giocatore.velocitaY = 0;
  giocatore.aTerra = false;
  giocatore.invulnerabile = 90;
  giocatore.attesaRipartenza = 12;
  pressedKeys.clear();
  touchDirections.clear();
  saltoRichiesto = 0;
  aggiornaHud();
}

function raccogliElementi() {
  for (const moneta of monete) {
    if (moneta.raccolta) continue;
    const hitbox = { x: moneta.x - 8, y: moneta.y - 8, larghezza: 16, altezza: 16 };
    if (rettangoliSiToccano(giocatore, hitbox)) {
      moneta.raccolta = true;
      giocatore.moneteRaccolte++;
      giocatore.punteggio += 100;
      aggiornaHud();
    }
  }

  for (let y = 0; y < mappa.altezza; y++) {
    for (let x = 0; x < mappa.larghezza; x++) {
      if (mappa.righe[y][x] !== "^") continue;
      const hitbox = {
        x: x * GRANDEZZA_CELLA + 5,
        y: y * GRANDEZZA_CELLA + 13,
        larghezza: GRANDEZZA_CELLA - 10,
        altezza: GRANDEZZA_CELLA - 13
      };
      if (rettangoliSiToccano(giocatore, hitbox)) {
        gestisciDanno();
        return;
      }
    }
  }

  for (let y = 0; y < mappa.altezza; y++) {
    for (let x = 0; x < mappa.larghezza; x++) {
      if (mappa.righe[y][x] !== "F") continue;
      const traguardo = { x: x * GRANDEZZA_CELLA, y: y * GRANDEZZA_CELLA, larghezza: GRANDEZZA_CELLA, altezza: GRANDEZZA_CELLA };
      if (rettangoliSiToccano(giocatore, traguardo)) {
        terminaPartita(true);
        return;
      }
    }
  }
}

function aggiorna(frameDelta) {
  if (!giocatore || stato !== "playing") return;
  if (giocatore.invulnerabile > 0) giocatore.invulnerabile -= frameDelta;

  if (giocatore.attesaRipartenza > 0) {
    giocatore.attesaRipartenza -= frameDelta;
    saltoRichiesto = Math.max(0, saltoRichiesto - frameDelta);
    return;
  }

  const sinistra = pressedKeys.has("ArrowLeft") || pressedKeys.has("a") || touchDirections.has("left");
  const destra = pressedKeys.has("ArrowRight") || pressedKeys.has("d") || touchDirections.has("right");
  const spostamento = (Number(destra) - Number(sinistra)) * configurazione.velocita * frameDelta;
  if (spostamento) gestisciCollisioniOrizzontali(spostamento);

  if (saltoRichiesto > 0 && giocatore.aTerra) {
    giocatore.velocitaY = -configurazione.salto;
    giocatore.aTerra = false;
    saltoRichiesto = 0;
  } else if (saltoRichiesto > 0) {
    saltoRichiesto = Math.max(0, saltoRichiesto - frameDelta);
  }

  const fondoPrecedente = giocatore.y + giocatore.altezza;
  giocatore.velocitaY = Math.min(giocatore.velocitaY + configurazione.gravita / 10 * frameDelta, 14);
  gestisciCollisioniVerticali(giocatore.velocitaY * frameDelta, fondoPrecedente);

  if (giocatore.invulnerabile <= 0) raccogliElementi();
  else {
    const monetePrima = giocatore.moneteRaccolte;
    raccogliMonete();
    if (monetePrima !== giocatore.moneteRaccolte) aggiornaHud();
  }

  if (stato === "playing" && giocatore.y > mappa.altezza * GRANDEZZA_CELLA) {
    gestisciDanno();
  }
}

function raccogliMonete() {
  for (const moneta of monete) {
    if (moneta.raccolta) continue;
    const hitbox = { x: moneta.x - 8, y: moneta.y - 8, larghezza: 16, altezza: 16 };
    if (rettangoliSiToccano(giocatore, hitbox)) {
      moneta.raccolta = true;
      giocatore.moneteRaccolte++;
      giocatore.punteggio += 100;
    }
  }
}

function ciclo(timestamp) {
  frameId = 0;
  if (stato !== "playing") return;
  const frameDelta = ultimoFrame ? Math.min((timestamp - ultimoFrame) / MS_PER_FRAME, 2) : 1;
  ultimoFrame = timestamp;
  aggiorna(frameDelta);
  disegna(timestamp);
  if (stato === "playing") frameId = requestAnimationFrame(ciclo);
}

function disegnaSfondo(tempo) {
  const larghezza = canvas.width;
  const altezza = canvas.height;
  const sfondo = context.createLinearGradient(0, 0, 0, altezza);
  sfondo.addColorStop(0, configurazione.sfondo);
  sfondo.addColorStop(1, "#10142a");
  context.fillStyle = sfondo;
  context.fillRect(0, 0, larghezza, altezza);

  const bagliore = context.createRadialGradient(larghezza * 0.68, altezza * 0.22, 8, larghezza * 0.68, altezza * 0.22, larghezza * 0.55);
  bagliore.addColorStop(0, "rgba(139, 92, 246, 0.16)");
  bagliore.addColorStop(1, "rgba(139, 92, 246, 0)");
  context.fillStyle = bagliore;
  context.fillRect(0, 0, larghezza, altezza);

  for (let indice = 0; indice < 38; indice++) {
    const x = (indice * 173 + 37) % larghezza;
    const y = (indice * 97 + 23) % altezza;
    const scintillio = 0.25 + (Math.sin(tempo * 0.0015 + indice) + 1) * 0.22;
    context.globalAlpha = scintillio;
    context.fillStyle = indice % 4 === 0 ? configurazione.bandiera : "#d9d4ff";
    context.fillRect(x, y, indice % 5 === 0 ? 2 : 1, indice % 5 === 0 ? 2 : 1);
  }
  context.globalAlpha = 1;

  context.strokeStyle = "rgba(139, 92, 246, 0.075)";
  context.lineWidth = 1;
  for (let x = 0; x < larghezza; x += GRANDEZZA_CELLA) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, altezza);
    context.stroke();
  }
}

function disegnaPiattaforma(x, y) {
  const gradiente = context.createLinearGradient(x, y, x, y + GRANDEZZA_CELLA);
  gradiente.addColorStop(0, "#484267");
  gradiente.addColorStop(0.13, configurazione.piattaforme);
  gradiente.addColorStop(1, "#211f38");
  context.fillStyle = gradiente;
  context.fillRect(x, y, GRANDEZZA_CELLA, GRANDEZZA_CELLA);
  context.fillStyle = "rgba(196, 181, 253, 0.42)";
  context.fillRect(x + 1, y + 1, GRANDEZZA_CELLA - 2, 2);
  context.fillStyle = "rgba(5, 7, 17, 0.32)";
  context.fillRect(x + 5, y + 10, GRANDEZZA_CELLA - 10, 1);
  context.strokeStyle = "rgba(167, 139, 250, 0.15)";
  context.strokeRect(x + 0.5, y + 0.5, GRANDEZZA_CELLA - 1, GRANDEZZA_CELLA - 1);
}

function disegnaMoneta(moneta, tempo) {
  if (moneta.raccolta) return;
  const pulsazione = 1 + Math.sin(tempo * 0.005 + moneta.x) * 0.08;
  const rotazione = Math.abs(Math.cos(tempo * 0.003 + moneta.y));
  context.save();
  context.translate(moneta.x, moneta.y);
  context.scale(Math.max(0.18, rotazione), pulsazione);
  context.shadowColor = configurazione.monete;
  context.shadowBlur = 14;
  context.fillStyle = configurazione.monete;
  context.beginPath();
  context.ellipse(0, 0, 8, 11, 0, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = "rgba(255, 249, 218, 0.82)";
  context.lineWidth = 1.5;
  context.beginPath();
  context.ellipse(0, 0, 3.5, 6, 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function disegnaOstacolo(x, y) {
  context.save();
  context.shadowColor = configurazione.ostacoli;
  context.shadowBlur = 12;
  context.fillStyle = configurazione.ostacoli;
  context.beginPath();
  context.moveTo(x + 3, y + GRANDEZZA_CELLA);
  context.lineTo(x + GRANDEZZA_CELLA / 2, y + 10);
  context.lineTo(x + GRANDEZZA_CELLA - 3, y + GRANDEZZA_CELLA);
  context.closePath();
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = "rgba(255, 199, 211, 0.82)";
  context.lineWidth = 1.3;
  context.stroke();
  context.restore();
}

function disegnaTraguardo(x, y, tempo) {
  context.save();
  context.shadowColor = configurazione.bandiera;
  context.shadowBlur = 18 + Math.sin(tempo * 0.004) * 4;
  context.strokeStyle = configurazione.bandiera;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(x + 10, y + GRANDEZZA_CELLA - 3);
  context.lineTo(x + 10, y + 4);
  context.stroke();
  context.fillStyle = configurazione.bandiera;
  context.beginPath();
  context.moveTo(x + 12, y + 6);
  context.lineTo(x + 34, y + 12);
  context.lineTo(x + 12, y + 21);
  context.closePath();
  context.fill();
  context.restore();
}

function disegnaGiocatore(tempo) {
  if (giocatore.invulnerabile > 0 && Math.floor(tempo / 75) % 2 === 0) return;
  const { x, y, larghezza, altezza } = giocatore;
  if (immaginePersonaggio) {
    context.save();
    context.shadowColor = configurazione.giocatore;
    context.shadowBlur = 18;
    context.drawImage(immaginePersonaggio, x, y, larghezza, altezza);
    context.restore();
    return;
  }

  context.save();
  context.shadowColor = configurazione.giocatore;
  context.shadowBlur = 17;
  const gradiente = context.createLinearGradient(x, y, x + larghezza, y + altezza);
  gradiente.addColorStop(0, "#d5c7ff");
  gradiente.addColorStop(0.38, configurazione.giocatore);
  gradiente.addColorStop(1, "#8062dc");
  context.fillStyle = gradiente;
  context.beginPath();
  context.roundRect(x, y + 3, larghezza, altezza - 3, 7);
  context.fill();
  context.shadowBlur = 0;
  context.fillStyle = "#221d3a";
  context.beginPath();
  context.roundRect(x + 5, y + 9, larghezza - 10, 7, 3);
  context.fill();
  context.fillStyle = "rgba(226, 217, 255, 0.9)";
  context.fillRect(x + 7, y + 11, larghezza - 14, 2);
  context.fillStyle = "rgba(42, 33, 75, 0.7)";
  context.fillRect(x + 4, y + altezza - 3, larghezza - 8, 3);
  context.restore();
}

function disegna(tempo) {
  if (!context || !configurazione || !mappa) return;
  disegnaSfondo(tempo);
  for (let y = 0; y < mappa.altezza; y++) {
    for (let x = 0; x < mappa.larghezza; x++) {
      const simbolo = mappa.righe[y][x];
      const px = x * GRANDEZZA_CELLA;
      const py = y * GRANDEZZA_CELLA;
      if (simbolo === "#") disegnaPiattaforma(px, py);
      else if (simbolo === "^") disegnaOstacolo(px, py);
      else if (simbolo === "F") disegnaTraguardo(px, py, tempo);
    }
  }
  monete.forEach(moneta => disegnaMoneta(moneta, tempo));
  if (giocatore) disegnaGiocatore(tempo);
}

function gestisciTasti(evento, premuto) {
  const tasto = evento.key.length === 1 ? evento.key.toLowerCase() : evento.key;
  if (["ArrowLeft", "ArrowRight", " ", "Spacebar", "a", "d", "Escape", "p", "P"].includes(tasto)) {
    evento.preventDefault();
  }

  if (tasto === "Escape" || tasto === "p") {
    if (premuto && stato === "playing") mettiInPausa();
    else if (premuto && stato === "paused") riprendiPartita();
    return;
  }

  if (tasto === " " || tasto === "Spacebar") {
    if (premuto && !pressedKeys.has("jump") && stato === "playing") {
      saltoRichiesto = DURATA_BUFFER_SALTO;
    }
    if (premuto) pressedKeys.add("jump");
    else pressedKeys.delete("jump");
    return;
  }

  if (premuto && stato === "playing") pressedKeys.add(tasto);
  else pressedKeys.delete(tasto);
}

function configuraControlliTouch() {
  document.querySelectorAll(".touch-button").forEach(pulsante => {
    const azione = pulsante.dataset.action;
    pulsante.addEventListener("pointerdown", evento => {
      evento.preventDefault();
      if (stato !== "playing") return;
      pulsante.setPointerCapture(evento.pointerId);
      if (azione === "jump") saltoRichiesto = DURATA_BUFFER_SALTO;
      else touchDirections.add(azione);
    });
    const rilascia = evento => {
      if (evento) evento.preventDefault();
      touchDirections.delete(azione);
    };
    pulsante.addEventListener("pointerup", rilascia);
    pulsante.addEventListener("pointercancel", rilascia);
    pulsante.addEventListener("lostpointercapture", rilascia);
  });
}

async function avviaGioco() {
  try {
    loadError.hidden = true;
    overlayPrimary.disabled = true;
    overlayPrimary.textContent = "CARICAMENTO…";
    const [testoConfigurazione, testoLivello] = await Promise.all([
      leggiCsv(URL_CONFIGURAZIONE),
      leggiCsv(URL_LIVELLO)
    ]);
    configurazione = leggiConfigurazione(testoConfigurazione);
    mappa = leggiMappa(testoLivello);
    immaginePersonaggio = await caricaImmaginePersonaggio(configurazione.personaggio);
    canvas.width = mappa.larghezza * GRANDEZZA_CELLA;
    canvas.height = mappa.altezza * GRANDEZZA_CELLA;
    canvas.style.aspectRatio = mappa.larghezza + " / " + mappa.altezza;
    impostaPalette();
    giocatore = creaGiocatore();
    creaMonete();
    aggiornaHud();
    stato = "ready";
    pauseButton.disabled = true;
    restartButton.disabled = false;
    overlayPrimary.disabled = false;
    disegna(0);
    mostraOverlay(
      configurazione.titolo,
      configurazione.istruzioni,
      "GIOCA",
      iniziaPartita
    );
  } catch (errore) {
    console.error("NEON RUN non è riuscito a caricare i dati del gioco.", errore);
    stato = "error";
    loadError.textContent = "Non riesco a caricare configurazione o livello. Verifica che i fogli pubblicati siano raggiungibili. Dettaglio: " + errore.message;
    loadError.hidden = false;
    overlayPrimary.disabled = false;
    mostraOverlay(
      "DATI NON DISPONIBILI",
      errore.message + " Riprova quando i fogli pubblicati sono raggiungibili.",
      "RIPROVA",
      avviaGioco
    );
  }
}

overlayPrimary.addEventListener("click", () => {
  if (azionePrimaria) azionePrimaria();
});
overlaySecondary.addEventListener("click", () => {
  if (azioneSecondaria) azioneSecondaria();
});
pauseButton.addEventListener("click", () => {
  if (stato === "playing") mettiInPausa();
  else if (stato === "paused") riprendiPartita();
});
restartButton.addEventListener("click", () => {
  if (configurazione) iniziaPartita();
});
window.addEventListener("keydown", evento => gestisciTasti(evento, true));
window.addEventListener("keyup", evento => gestisciTasti(evento, false));
window.addEventListener("blur", () => {
  pressedKeys.clear();
  touchDirections.clear();
  if (stato === "playing") mettiInPausa(true);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && stato === "playing") mettiInPausa(true);
});
configuraControlliTouch();
avviaGioco();
