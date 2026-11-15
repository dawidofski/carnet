import { html, useState, useEffect, Bar, Empty } from "./common.js";
import { C, termsOf, officialOf } from "../lib/content.js";
import { allTopicStates, unlockedUpTo } from "../lib/session.js";

const OFFSETS = ["o2", "", "o3", "o4", "o3", "", "o1", ""];

/** How many lesson nodes a topic gets — about four terms per lesson. */
export function lessonCount(n) {
  const t = termsOf(n).length;
  return Math.max(2, Math.min(8, Math.ceil(t / 4)));
}

export function PathView({ onStartLesson, onStartCheckpoint }) {
  const [states, setStates] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => { allTopicStates().then(setStates); }, []);

  if (!states) return html`<div class="wrap"><div class="empty">Cargando tu camino…</div></div>`;

  const unlocked = unlockedUpTo(states);
  const currentTopic = states.find((s) => s.n === unlocked) || states[0];

  return html`
    <div class="wrap path">
      <div class="card" style="background:linear-gradient(135deg,var(--brand),#1f9e78);border:0;color:#fff">
        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;opacity:.85">TU CAMINO</div>
        <h2 style="color:#fff;font-size:20px;margin:4px 0 2px">
          ${C.topics.find((t) => t.n === currentTopic.n)?.icon} ${C.topics.find((t) => t.n === currentTopic.n)?.title}
        </h2>
        <div style="opacity:.9;font-size:14px">
          ${currentTopic.mastered} de ${currentTopic.terms} palabras dominadas ·
          ${currentTopic.officialSeen}/${currentTopic.official} preguntas oficiales vistas
        </div>
        <div class="bar" style="margin-top:12px;background:rgba(255,255,255,.25)">
          <i style=${{ width: currentTopic.progress + "%", background: "#fff" }}></i>
        </div>
      </div>

      ${C.topics.map((t) => {
        const st = states.find((s) => s.n === t.n) || { progress: 0, terms: 0 };
        const locked = t.n > unlocked;
        const count = lessonCount(t.n);
        const done = Math.floor((st.progress / 100) * count);
        return html`
          <section class=${"path-topic" + (locked ? " locked" : "")} key=${t.n}>
            <div class="head" onClick=${() => setOpen(open === t.n ? null : t.n)}>
              <span class="ic">${t.icon}</span>
              <span class="t">
                <b>Tema ${t.n} · ${t.title}</b>
                <span>${locked ? "Se abre al avanzar en el tema anterior" : t.sub}</span>
              </span>
              <span style="text-align:right">
                <b style="font-size:14px">${st.progress}%</b>
                <div class="tiny">${st.terms} palabras</div>
              </span>
            </div>

            ${!locked && html`
              <div class="nodes">
                <div class="trail"></div>
                ${Array.from({ length: count }, (_, k) => {
                  const state = k < done ? "done" : k === done ? "current" : "locked";
                  return html`
                    <div class=${"node-row " + OFFSETS[k % OFFSETS.length]} key=${k}>
                      <button class=${"node " + state} disabled=${state === "locked"}
                        onClick=${() => onStartLesson(t.n, k)}
                        aria-label=${`Tema ${t.n}, lección ${k + 1}`}>
                        ${state === "current" && k === done && t.n === unlocked
                          ? html`<span class="start-bubble">EMPEZAR</span>` : null}
                        ${state === "done" ? "★" : state === "current" ? t.icon : "🔒"}
                        ${state === "current" && html`<span class="ring"></span>`}
                      </button>
                    </div>`;
                })}
                <div class="node-row">
                  <button class=${"node exam" + (done >= count ? "" : " locked")}
                    disabled=${done < count}
                    onClick=${() => onStartCheckpoint(t.n)}
                    aria-label=${`Control del tema ${t.n}`}>🏁
                    <span class="node-label">Control</span>
                  </button>
                </div>
              </div>`}

            ${open === t.n && html`
              <div class="card tight">
                <div class="tiny">CONTENIDO DE ESTE TEMA</div>
                <div class="grid3" style="margin-top:8px">
                  <div class="kpi"><b>${t.counts.terms}</b><span>palabras</span></div>
                  <div class="kpi"><b>${t.counts.official}</b><span>oficiales</span></div>
                  <div class="kpi"><b>${t.counts.sentences}</b><span>frases</span></div>
                </div>
                <div class="srcline">Manual DGT Lectura Fácil, páginas ${t.pages[0]}–${t.pages[1]}</div>
              </div>`}
          </section>`;
      })}

      <div class="card" style="margin-top:28px;text-align:center">
        <div style="font-size:30px">🏆</div>
        <h2>Examen final</h2>
        <div class="sub">30 preguntas oficiales, 3 fallos como máximo. Igual que el examen real.</div>
        <button class="btn primary block" style="margin-top:14px"
          onClick=${() => onStartCheckpoint(null)}>Hacer un simulacro</button>
      </div>
    </div>`;
}
