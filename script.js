// Link CSV del foglio "Home" (pubblicato sul web)
const URL_HOME = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQxu8td_LkOM4lhsVE9-c19_vGCrlKW7kmhcIfZjlkxzK-nKAaG4ORVlqk8OBRf3Q3o3J1Gth4xgHCs/pub?gid=0&single=true&output=csv";
const URL_CV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQxu8td_LkOM4lhsVE9-c19_vGCrlKW7kmhcIfZjlkxzK-nKAaG4ORVlqk8OBRf3Q3o3J1Gth4xgHCs/pub?gid=276136081&single=true&output=csv";
const URL_STAGE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQxu8td_LkOM4lhsVE9-c19_vGCrlKW7kmhcIfZjlkxzK-nKAaG4ORVlqk8OBRf3Q3o3J1Gth4xgHCs/pub?gid=1495684417&single=true&output=csv";

// ---------- FUNZIONI RIUTILIZZABILI (valgono per ogni pagina) ----------

// Scarica il CSV e lo trasforma in una lista di oggetti
async function leggiFoglio(url) {
  const risposta = await fetch(url);
  if (!risposta.ok) {
    throw new Error("Errore nel download: " + risposta.status);
  }
  const testo = await risposta.text();
  return csvInOggetti(testo);
}

// Trasforma il testo CSV in oggetti: la prima riga contiene i nomi delle colonne
function csvInOggetti(testo) {
  const righe = [];
  let riga = [];
  let cella = "";
  let traVirgolette = false;

  // Leggo il testo un carattere alla volta
  for (const c of testo) {
    if (c === '"') {
      traVirgolette = !traVirgolette;      // entro/esco da un testo tra virgolette
    } else if (c === "," && !traVirgolette) {
      riga.push(cella);                    // fine cella
      cella = "";
    } else if (c === "\n" && !traVirgolette) {
      riga.push(cella);                    // fine riga
      righe.push(riga);
      riga = [];
      cella = "";
    } else if (c !== "\r") {
      cella += c;                          // carattere normale
    }
  }
  riga.push(cella);                        // ultima riga
  righe.push(riga);

  const intestazioni = righe[0].map(nome => nome.trim());
  const oggetti = [];
  for (let i = 1; i < righe.length; i++) {
    const oggetto = {};
    intestazioni.forEach((nome, posizione) => {
      oggetto[nome] = (righe[i][posizione] || "").trim();
    });
    oggetti.push(oggetto);
  }
  return oggetti;
}

// Mostra un messaggio d'errore al posto della pagina vuota
function mostraErrore(messaggio) {
  const box = document.getElementById("messaggio-errore");
  box.textContent = messaggio;
  box.hidden = false;
}

// ---------- RENDERING DELLA HOME ----------

function mostraHome(dati) {
  // Presentazione: una sola riga
  const pres = dati.find(r => r.sezione === "presentazione");
  if (pres) {
    document.getElementById("nome").textContent = pres.titolo;
    document.getElementById("qualifica").textContent = pres.sottotitolo;
    document.getElementById("testo").textContent = pres.testo;
    document.title = pres.titolo + " - Portfolio personale";
    const foto = document.getElementById("foto");
    if (foto && pres.immagine) {
      foto.src = "img/" + pres.immagine;
    } else if (foto) {
      foto.hidden = true;
    }
  }

  // Passioni: una card per ogni riga
  const contenitorePassioni = document.getElementById("lista-passioni");
  const immaginiPassioni = {
    "calcio": "calcio.jpg",
    "videogiochi": "giochi.webp",
    "viaggiare": "tokyo.jpg"
  };

  dati.filter(r => r.sezione === "passione").forEach(p => {
    const card = document.createElement("div");
    card.className = "card";

    const img = document.createElement("img");
    const chiaveImmagine = p.titolo.trim().toLowerCase();
    const nomeImmagine = immaginiPassioni[chiaveImmagine] || p.immagine;
    if (nomeImmagine) {
      img.src = "img/" + nomeImmagine;
    }
    img.alt = p.titolo;

    const titolo = document.createElement("h3");
    titolo.textContent = p.titolo;

    const descrizione = document.createElement("p");
    descrizione.textContent = p.testo;

    if (nomeImmagine) {
      card.appendChild(img);
    }
    card.append(titolo, descrizione);
    contenitorePassioni.appendChild(card);
  });

  // Competenze: una barra per ogni riga (livello da 0 a 100)
  const contenitoreCompetenze = document.getElementById("lista-competenze");
  dati.filter(r => r.sezione === "competenza").forEach(c => {
    const blocco = document.createElement("div");
    blocco.className = "competenza";

    const nome = document.createElement("p");
    nome.textContent = c.titolo + " (" + c.livello + "%)";

    const barra = document.createElement("div");
    barra.className = "barra";

    const piena = document.createElement("div");
    piena.className = "barra-piena";
    const livello = Number(c.livello);
    if (Number.isFinite(livello)) {
      piena.style.width = Math.min(100, Math.max(0, livello)) + "%";
    }

    barra.appendChild(piena);
    blocco.append(nome, barra);
    contenitoreCompetenze.appendChild(blocco);
  });
}

// Mostra una selezione della formazione nel portfolio
function mostraAnteprimaFormazione(dati) {
  const contenitore = document.getElementById("anteprima-formazione");
  const righe = dati.filter(r => r.sezione === "istruzione");

  righe.forEach(riga => {
    const elemento = document.createElement("article");
    elemento.className = "riga-percorso";

    if (riga.periodo) {
      const periodo = document.createElement("p");
      periodo.className = "periodo-percorso";
      periodo.textContent = riga.periodo;
      elemento.appendChild(periodo);
    }
    if (riga.titolo) {
      const titolo = document.createElement("h3");
      titolo.textContent = riga.titolo;
      elemento.appendChild(titolo);
    }
    if (riga.sottotitolo) {
      const descrizione = document.createElement("p");
      descrizione.textContent = riga.sottotitolo;
      elemento.appendChild(descrizione);
    }

    contenitore.appendChild(elemento);
  });
}

// Mostra un'anteprima dello stage letta dal foglio
function mostraAnteprimaStage(dati) {
  const contenitore = document.getElementById("anteprima-stage");
  const righe = dati.filter(r => r.azienda || r.luogo || r.settore);

  righe.forEach(riga => {
    const elemento = document.createElement("article");
    elemento.className = "riga-percorso";

    if (riga.settore) {
      const settore = document.createElement("p");
      settore.className = "periodo-percorso";
      settore.textContent = riga.settore;
      elemento.appendChild(settore);
    }
    if (riga.azienda) {
      const azienda = document.createElement("h3");
      azienda.textContent = riga.azienda;
      elemento.appendChild(azienda);
    }
    if (riga.luogo) {
      const luogo = document.createElement("p");
      luogo.textContent = riga.luogo;
      elemento.appendChild(luogo);
    }

    contenitore.appendChild(elemento);
  });
}

// Mostra le informazioni del tab CV
function mostraCv(dati) {
  const contenitoreDati = document.getElementById("lista-dati");
  dati.filter(r => r.sezione === "dati").forEach(riga => {
    if (!riga.titolo && !riga.testo) return;

    const card = document.createElement("div");
    card.className = "card";

    if (riga.titolo) {
      const titolo = document.createElement("h3");
      titolo.textContent = riga.titolo;
      card.appendChild(titolo);
    }
    if (riga.testo) {
      const valore = document.createElement("p");
      valore.textContent = riga.testo;
      card.appendChild(valore);
    }
    contenitoreDati.appendChild(card);
  });

  function aggiungiEsperienze(righe, contenitore) {
    righe.forEach(riga => {
      if (!riga.titolo && !riga.sottotitolo && !riga.periodo && !riga.testo) return;

      const card = document.createElement("article");
      card.className = "card";

      if (riga.titolo) {
        const titolo = document.createElement("h3");
        titolo.textContent = riga.titolo;
        card.appendChild(titolo);
      }
      if (riga.sottotitolo) {
        const sottotitolo = document.createElement("p");
        sottotitolo.textContent = riga.sottotitolo;
        card.appendChild(sottotitolo);
      }
      if (riga.periodo) {
        const periodo = document.createElement("p");
        periodo.textContent = riga.periodo;
        card.appendChild(periodo);
      }
      if (riga.testo) {
        const testo = document.createElement("p");
        testo.textContent = riga.testo;
        card.appendChild(testo);
      }

      contenitore.appendChild(card);
    });
  }

  aggiungiEsperienze(
    dati.filter(r => r.sezione === "istruzione"),
    document.getElementById("lista-istruzione")
  );
  aggiungiEsperienze(
    dati.filter(r => r.sezione === "esperienza"),
    document.getElementById("lista-esperienze")
  );
}

// Mostra una card e la relazione per ogni riga del tab Stage
function mostraStage(dati) {
  const contenitore = document.getElementById("lista-stage");

  dati.forEach(riga => {
    if (!riga.azienda && !riga.luogo && !riga.immagine &&
        !riga.settore && !riga.attivita && !riga.relazione) return;

    const blocco = document.createElement("article");
    blocco.className = "stage-blocco";

    const card = document.createElement("div");
    card.className = "card stage-card";

    if (riga.immagine) {
      const immagine = document.createElement("img");
      immagine.src = "img/" + riga.immagine;
      immagine.alt = riga.azienda || "";
      card.appendChild(immagine);
    }

    if (riga.azienda) {
      const titolo = document.createElement("h2");
      titolo.textContent = riga.azienda;
      card.appendChild(titolo);
    }
    if (riga.luogo) {
      const luogo = document.createElement("p");
      luogo.textContent = "Luogo: " + riga.luogo;
      card.appendChild(luogo);
    }
    if (riga.settore) {
      const settore = document.createElement("p");
      settore.textContent = "Settore: " + riga.settore;
      card.appendChild(settore);
    }

    const attivita = riga.attivita
      ? riga.attivita.split(";").map(voce => voce.trim()).filter(Boolean)
      : [];
    if (attivita.length > 0) {
      const titoloAttivita = document.createElement("h3");
      titoloAttivita.textContent = "Di cosa si occupa";
      card.appendChild(titoloAttivita);

      const elenco = document.createElement("ul");
      attivita.forEach(voce => {
        const elemento = document.createElement("li");
        elemento.textContent = voce;
        elenco.appendChild(elemento);
      });
      card.appendChild(elenco);
    }

    blocco.appendChild(card);

    if (riga.relazione) {
      const titoloRelazione = document.createElement("h3");
      titoloRelazione.textContent = "Relazione";

      const testoRelazione = document.createElement("p");
      testoRelazione.className = "stage-relazione-testo";
      testoRelazione.textContent = riga.relazione;

      blocco.append(titoloRelazione, testoRelazione);
    }

    contenitore.appendChild(blocco);
  });
}

// Anima gli elementi quando entrano nella schermata
function preparaAnimazioni() {
  const elementi = document.querySelectorAll(
    "main > section, .card, .stage-blocco, .competenza"
  );
  const movimentoRidotto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!("IntersectionObserver" in window) || movimentoRidotto) {
    elementi.forEach(elemento => elemento.classList.add("visibile"));
    document.querySelectorAll(".barra-piena").forEach(barra => {
      barra.classList.add("completa");
    });
    return;
  }

  const osservatore = new IntersectionObserver(righe => {
    righe.forEach(riga => {
      if (riga.isIntersecting) {
        riga.target.classList.add("visibile");
        osservatore.unobserve(riga.target);
      }
    });
  }, { threshold: 0.12 });

  elementi.forEach((elemento, indice) => {
    elemento.classList.add("entra");
    elemento.style.setProperty("--ritardo", (indice % 5) * 65 + "ms");
    osservatore.observe(elemento);
  });

  document.querySelectorAll(".barra-piena").forEach(barra => {
    requestAnimationFrame(() => barra.classList.add("completa"));
  });

  document.querySelectorAll(".card").forEach(card => {
    card.addEventListener("pointermove", evento => {
      const posizione = card.getBoundingClientRect();
      card.style.setProperty("--luce-x", evento.clientX - posizione.left + "px");
      card.style.setProperty("--luce-y", evento.clientY - posizione.top + "px");
    });
  });
}

// Crea lo sfondo WebGL con una forma e particelle leggere
function creaSfondo3D(THREE, movimentoRidotto) {
  const canvas = document.getElementById("hero-canvas");
  if (!canvas) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power"
    });
  } catch (errore) {
    console.error("WebGL non disponibile: resta attivo lo sfondo CSS.", errore);
    return;
  }

  const scena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.z = 8;

  const gruppo = new THREE.Group();
  const nodo = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.25, 0.32, 150, 18, 2, 3),
    new THREE.MeshBasicMaterial({
      color: 0xa99cff,
      wireframe: true,
      transparent: true,
      opacity: 0.38
    })
  );
  const orbita = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.05, 1),
    new THREE.MeshBasicMaterial({
      color: 0x7168df,
      wireframe: true,
      transparent: true,
      opacity: 0.15
    })
  );
  gruppo.add(nodo, orbita);
  scena.add(gruppo);

  const numeroParticelle = window.matchMedia("(max-width: 600px)").matches ? 100 : 240;
  const posizioni = new Float32Array(numeroParticelle * 3);
  for (let i = 0; i < numeroParticelle; i++) {
    posizioni[i * 3] = (Math.random() - 0.5) * 9;
    posizioni[i * 3 + 1] = (Math.random() - 0.5) * 5;
    posizioni[i * 3 + 2] = (Math.random() - 0.5) * 5;
  }

  const geometriaParticelle = new THREE.BufferGeometry();
  geometriaParticelle.setAttribute("position", new THREE.BufferAttribute(posizioni, 3));
  const particelle = new THREE.Points(
    geometriaParticelle,
    new THREE.PointsMaterial({
      color: 0xd4ceff,
      size: 0.025,
      transparent: true,
      opacity: 0.72
    })
  );
  scena.add(particelle);

  let larghezza = 0;
  let altezza = 0;
  let puntatoreX = 0;
  let puntatoreY = 0;

  function ridimensiona() {
    const rettangolo = canvas.getBoundingClientRect();
    larghezza = Math.max(1, rettangolo.width);
    altezza = Math.max(1, rettangolo.height);
    const schermoPiccolo = larghezza <= 600;
    gruppo.position.x = schermoPiccolo ? 1.25 : 2.05;
    gruppo.scale.setScalar(schermoPiccolo ? 0.55 : 0.78);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(larghezza, altezza, false);
    camera.aspect = larghezza / altezza;
    camera.updateProjectionMatrix();
    renderer.render(scena, camera);
  }

  function aggiornaPuntatore(evento) {
    puntatoreX = (evento.clientX / window.innerWidth - 0.5) * 2;
    puntatoreY = (evento.clientY / window.innerHeight - 0.5) * 2;
  }

  ridimensiona();
  window.addEventListener("resize", ridimensiona);
  if ("ResizeObserver" in window) {
    const osservatoreDimensioni = new ResizeObserver(ridimensiona);
    osservatoreDimensioni.observe(canvas.parentElement);
  }
  window.addEventListener("pointermove", aggiornaPuntatore, { passive: true });

  if (movimentoRidotto) return;

  let attivo = true;
  let animazione = 0;

  function disegna() {
    animazione = 0;
    if (!attivo || document.hidden) return;

    gruppo.rotation.y += (puntatoreX * 0.22 - gruppo.rotation.y) * 0.025;
    gruppo.rotation.x += (-puntatoreY * 0.16 - gruppo.rotation.x) * 0.025;
    nodo.rotation.z += 0.002;
    orbita.rotation.y -= 0.001;
    particelle.rotation.y += 0.00025;
    renderer.render(scena, camera);
    animazione = window.requestAnimationFrame(disegna);
  }

  const osservatore = new IntersectionObserver(righe => {
    attivo = righe[0].isIntersecting;
    if (attivo && !animazione && !document.hidden) {
      animazione = window.requestAnimationFrame(disegna);
    }
  });
  osservatore.observe(canvas);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.cancelAnimationFrame(animazione);
      animazione = 0;
    } else if (attivo && !animazione) {
      animazione = window.requestAnimationFrame(disegna);
    }
  });

  animazione = window.requestAnimationFrame(disegna);
}

// Avvia gli effetti opzionali: il portfolio resta leggibile anche offline
async function avviaEffetti() {
  if (!document.getElementById("hero-canvas")) return;

  const movimentoRidotto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const moduli = await Promise.allSettled([
    import("https://esm.sh/three@0.180.0"),
    import("https://esm.sh/gsap@3.13.0"),
    import("https://esm.sh/lenis@1.3.11")
  ]);

  const [moduloThree, moduloGsap, moduloLenis] = moduli;

  if (moduloThree.status === "fulfilled") {
    creaSfondo3D(moduloThree.value, movimentoRidotto);
  } else {
    console.error("Three.js non disponibile: resta attivo lo sfondo CSS.", moduloThree.reason);
  }

  const gsap = moduloGsap.status === "fulfilled"
    ? (moduloGsap.value.gsap || moduloGsap.value.default)
    : null;
  if (!gsap) {
    if (moduloGsap.status === "rejected") {
      console.error("GSAP non disponibile: le animazioni avanzate sono disattivate.", moduloGsap.reason);
    }
    return;
  }

  if (!movimentoRidotto) {
    const partiHero = document.querySelectorAll(
      ".hero-copy .sovratitolo, .hero-copy h1, .hero-copy h2, .hero-copy .hero-descrizione, .hero-copy .hero-azioni"
    );
    gsap.fromTo(partiHero,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.8, stagger: 0.1, ease: "power3.out", delay: 0.15 }
    );
  }

  preparaCursore(gsap);

  if (moduloLenis.status === "fulfilled" && !movimentoRidotto) {
    const Lenis = moduloLenis.value.default;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true, anchors: true });
    gsap.ticker.add(tempo => lenis.raf(tempo * 1000));
    gsap.ticker.lagSmoothing(0);
  } else if (moduloLenis.status === "rejected") {
    console.error("Lenis non disponibile: resta attivo lo scorrimento nativo.", moduloLenis.reason);
  }
}

// Mostra un cursore discreto solo con mouse e trackpad
function preparaCursore(gsap) {
  const cursore = document.getElementById("cursore");
  const puntatoreFine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!cursore || !puntatoreFine) return;

  document.body.classList.add("cursore-attivo");
  gsap.set(cursore, { xPercent: -50, yPercent: -50 });
  const spostaX = gsap.quickTo(cursore, "x", { duration: 0.22, ease: "power3" });
  const spostaY = gsap.quickTo(cursore, "y", { duration: 0.22, ease: "power3" });

  window.addEventListener("pointermove", evento => {
    spostaX(evento.clientX);
    spostaY(evento.clientY);
  }, { passive: true });

  document.querySelectorAll("a, button").forEach(elemento => {
    elemento.addEventListener("pointerenter", () => cursore.classList.add("cursore-attivo"));
    elemento.addEventListener("pointerleave", () => cursore.classList.remove("cursore-attivo"));
  });
}

// ---------- AVVIO ----------

async function avvia() {
  try {
    if (document.getElementById("lista-stage")) {
      const dati = await leggiFoglio(URL_STAGE);
      mostraStage(dati);
    } else if (document.getElementById("lista-istruzione")) {
      const dati = await leggiFoglio(URL_CV);
      mostraCv(dati);
    } else {
      const dati = await leggiFoglio(URL_HOME);
      mostraHome(dati);
      const erroreProfilo = document.getElementById("errore-profilo");

      try {
        mostraAnteprimaFormazione(await leggiFoglio(URL_CV));
      } catch (errore) {
        erroreProfilo.textContent = "Non riesco a caricare l'anteprima della formazione. Puoi consultare il CV completo.";
        erroreProfilo.hidden = false;
        console.error(errore);
      }

      try {
        mostraAnteprimaStage(await leggiFoglio(URL_STAGE));
      } catch (errore) {
        erroreProfilo.textContent = "Non riesco a caricare alcune anteprime. Le pagine CV e Stage restano disponibili.";
        erroreProfilo.hidden = false;
        console.error(errore);
      }
    }
    preparaAnimazioni();
    avviaEffetti().catch(errore => {
      console.error("Gli effetti visivi non sono riusciti ad avviarsi.", errore);
    });
  } catch (errore) {
    mostraErrore("Non riesco a caricare i contenuti. Controlla che il foglio sia pubblicato.");
    console.error(errore);
  }
}

avvia();