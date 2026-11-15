import { html, useState, useEffect, Sheet, SpeakButton, Bar } from "./common.js";
import { posLabel } from "./player.js";
import { C, nrm } from "../lib/content.js";
import { db, reviewKey, ABILITIES, ABILITY_LABEL } from "../lib/db.js";
import { maturity, dueInDays } from "../lib/fsrs.js";

const FILTERS = [
  ["all", "Todas"],
  ["due", "Para repasar"],
  ["learning", "Aprendiendo"],
  ["mastered", "Dominadas"],
  ["new", "Sin empezar"],
  ["mine", "De mi lista"],
];

export function VocabView() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [topic, setTopic] = useState(0);
  const [cards, setCards] = useState(new Map());
  const [sel, setSel] = useState(null);

  useEffect(() => {
    db.reviews.where("itemType").equals("term").toArray().then((rows) => {
      const m = new Map();
      for (const r of rows) {
        if (!m.has(r.itemId)) m.set(r.itemId, {});
        m.get(r.itemId)[r.ability] = r;
      }
      setCards(m);
    });
  }, []);

  const list = C.terms.filter((t) => {
    if (topic && t.topic !== topic) return false;
    if (q) {
      const n = nrm(q);
      if (!nrm(t.es).includes(n) && !nrm(t.en || "").includes(n) && !nrm(t.simple || "").includes(n)) return false;
    }
    const c = cards.get(t.id) || {};
    const m = maturity(c.recognition);
    if (filter === "due") return c.recognition && c.recognition.due <= Date.now();
    if (filter === "learning") return m === "learning" || m === "strong";
    if (filter === "mastered") return m === "mastered";
    if (filter === "new") return m === "new";
    if (filter === "mine") return t.origin === "wordsheet";
    return true;
  }).sort((a, b) => a.difficulty - b.difficulty || nrm(a.head).localeCompare(nrm(b.head)));

  return html`
    <div class="wrap">
      <input class="search" style="margin-top:14px" placeholder="Buscar en español o inglés…"
        value=${q} onInput=${(e) => setQ(e.target.value)} />

      <div class="chipbar" style="margin:12px 0">
        ${FILTERS.map(([k, label]) => html`
          <button class=${"chip" + (filter === k ? " on" : "")} onClick=${() => setFilter(k)}>${label}</button>`)}
      </div>
      <div class="chipbar" style="margin-bottom:12px">
        <button class=${"chip" + (topic === 0 ? " on" : "")} onClick=${() => setTopic(0)}>Todos los temas</button>
        ${C.topics.map((t) => html`
          <button class=${"chip" + (topic === t.n ? " on" : "")} onClick=${() => setTopic(t.n)}>${t.icon} ${t.n}</button>`)}
      </div>

      <div class="sub" style="margin-bottom:8px">${list.length} palabras</div>
      <div class="list">
        ${list.slice(0, 400).map((t) => {
          const c = cards.get(t.id) || {};
          const m = maturity(c.recognition);
          return html`
            <button class="row" style="text-align:left;width:100%" onClick=${() => setSel(t)} key=${t.id}>
              <div class="g">
                <b>${t.es}</b>
                <span>${t.en || t.simple || ""}</span>
              </div>
              <span class=${"pill " + m}>${m === "new" ? "nueva" : m === "mastered" ? "dominada" : m === "strong" ? "sólida" : "aprendiendo"}</span>
            </button>`;
        })}
        ${list.length > 400 && html`<div class="tiny" style="text-align:center;padding:12px">
          Mostrando las primeras 400. Afina la búsqueda.</div>`}
      </div>

      ${sel && html`<${TermSheet} term=${sel} cards=${cards.get(sel.id) || {}} onClose=${() => setSel(null)} />`}
    </div>`;
}

function TermSheet({ term, cards, onClose }) {
  const sentences = C.sentencesByTerm.get(term.id) || [];
  const questions = C.questionsByTerm.get(term.id) || [];
  return html`
    <${Sheet} onClose=${onClose}>
      <div style="display:flex;align-items:center;gap:10px">
        <h2 style="margin:0">${term.es}</h2>
        <${SpeakButton} text=${term.head} />
      </div>
      ${term.en && html`<div style="color:var(--accent);font-weight:700;font-size:16px">${term.en}</div>`}
      ${term.pos && html`<div class="tiny">${posLabel(term.pos)}</div>`}

      ${term.simple && html`
        <div class="card tight" style="margin-top:12px">
          <div class="tiny">EN ESPAÑOL SENCILLO</div>
          <div>${term.simple}</div>
        </div>`}

      ${term.note && html`<div class="banner warn"><b>Corrección:</b> ${term.note}</div>`}

      ${term.conf?.length ? html`
        <div class="banner info">No lo confundas con: <b>${term.conf.join(", ")}</b></div>` : null}

      ${term.example && html`
        <div class="card tight">
          <div class="tiny">EJEMPLO DEL MANUAL</div>
          <div style="margin-top:4px">${term.example}</div>
          <div class="srcline">${term.exampleSrc}</div>
        </div>`}

      <div class="card tight">
        <div class="tiny" style="margin-bottom:6px">LAS CINCO HABILIDADES</div>
        ${ABILITIES.map((a) => {
          const c = cards[a];
          const m = maturity(c);
          const v = m === "mastered" ? 100 : m === "strong" ? 66 : m === "learning" ? 33 : 0;
          const d = c ? dueInDays(c) : null;
          return html`
            <div class="ability">
              <span>${ABILITY_LABEL[a]}</span>
              <${Bar} value=${v} cls=${m === "mastered" ? "" : "accent"} />
              <em>${c ? (d < 0 ? "ya" : `${Math.ceil(d)}d`) : "—"}</em>
            </div>`;
        })}
      </div>

      ${sentences.length > 0 && html`
        <div class="card tight">
          <div class="tiny">APARECE EN ESTAS FRASES</div>
          ${sentences.slice(0, 3).map((s) => html`
            <div style="margin-top:8px;font-size:14.5px">${s.es}<div class="srcline">${s.src}</div></div>`)}
        </div>`}

      ${questions.length > 0 && html`
        <div class="card tight">
          <div class="tiny">APARECE EN ${questions.length} PREGUNTA${questions.length > 1 ? "S" : ""} DE EXAMEN</div>
          <div style="margin-top:6px;font-size:14.5px">${questions[0].q}</div>
          <div class="srcline">${questions[0].src}</div>
        </div>`}

      <div class="srcline">Fuente: ${term.src || "lista personal"} · dificultad ${term.difficulty}/5
        ${term.freqQ ? ` · aparece ${term.freqQ}× en preguntas reales` : ""}</div>
    <//>`;
}
