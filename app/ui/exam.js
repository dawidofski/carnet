import { html, useState, useEffect, useRef, Bar, OriginBadge } from "./common.js";
import { C } from "../lib/content.js";
import { db } from "../lib/db.js";
import { buildExam, exQuestion } from "../lib/session.js";
import { Player } from "./player.js";
import { splitAttempts, CLASSES } from "../lib/classify.js";

const MINUTES = 30;

export function ExamView({ settings, onExit }) {
  const [stage, setStage] = useState("intro");   // intro | running | result
  const [exercises, setExercises] = useState([]);
  const [result, setResult] = useState(null);
  const [left, setLeft] = useState(MINUTES * 60);
  const [history, setHistory] = useState([]);
  const timer = useRef(null);

  useEffect(() => {
    db.events.where("type").equals("exam").reverse().limit(10).toArray().then(setHistory);
  }, [stage]);

  useEffect(() => {
    if (stage !== "running") return;
    timer.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(timer.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer.current);
  }, [stage]);

  function start() {
    const qs = buildExam(String(Date.now()));
    setExercises(qs.map(exQuestion));
    setLeft(MINUTES * 60);
    setStage("running");
  }

  async function finish(stats) {
    clearInterval(timer.current);
    const answered = stats.attempts.filter((a) => a.itemType === "question");
    const wrong = answered.filter((a) => !a.correct).length;
    const passed = wrong <= (C.meta?.exam?.maxWrong ?? 3);
    const rec = {
      ts: Date.now(), type: "exam",
      total: exercises.length, wrong, passed,
      seconds: MINUTES * 60 - left,
      split: splitAttempts(answered),
    };
    await db.events.add(rec);
    setResult({ ...rec, attempts: stats.attempts });
    setStage("result");
  }

  if (stage === "running") {
    return html`
      <div>
        <div style="position:fixed;top:0;left:0;right:0;z-index:45;background:var(--surface);
                    border-bottom:1px solid var(--line);padding:8px 16px;text-align:center;
                    font-weight:800;color:${left < 300 ? "var(--bad)" : "var(--text)"}">
          ⏱ ${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}
        </div>
        <div style="height:38px"></div>
        <${Player} exercises=${exercises} settings=${settings} examMode=${true}
          title="Examen" onDone=${finish} />
      </div>`;
  }

  if (stage === "result") return html`<${ExamResult} result=${result} onAgain=${start} onExit=${onExit} />`;

  const passRate = history.length
    ? Math.round((history.filter((h) => h.passed).length / history.length) * 100) : null;

  return html`
    <div class="wrap">
      <div class="card" style="margin-top:14px;text-align:center">
        <div style="font-size:46px">🏁</div>
        <h2>Simulacro de examen</h2>
        <div class="sub">
          ${C.meta?.exam?.questions ?? 30} preguntas · se aprueba con
          ${C.meta?.exam?.maxWrong ?? 3} fallos como máximo · ${MINUTES} minutos
        </div>
        <div class="banner warn" style="text-align:left;margin-top:16px">
          Durante el examen <b>no hay pistas, ni traducciones, ni diccionario</b>.
          Igual que en la DGT. Al terminar te digo qué fallos fueron de español
          y cuáles de la norma.
        </div>
        <div class="tiny" style="margin-top:4px">
          Solo preguntas oficiales de la DGT (${C.meta?.totals?.official ?? 0} disponibles).
        </div>
        <button class="btn primary block" style="margin-top:16px" onClick=${start}>Empezar examen</button>
      </div>

      ${history.length > 0 && html`
        <div class="card">
          <h3>Tus simulacros</h3>
          <div class="grid3" style="margin-bottom:10px">
            <div class="kpi"><b>${history.length}</b><span>hechos</span></div>
            <div class="kpi"><b>${passRate}%</b><span>aprobados</span></div>
            <div class="kpi"><b>${Math.min(...history.map((h) => h.wrong))}</b><span>mejor (fallos)</span></div>
          </div>
          <div class="list">
            ${history.map((h) => html`
              <div class="row">
                <div class="g">
                  <b>${h.passed ? "✅ Apto" : "❌ No apto"} · ${h.total - h.wrong}/${h.total}</b>
                  <span>${new Date(h.ts).toLocaleDateString("es-ES")} ·
                    ${h.split?.langPct ?? 0}% fallos de español</span>
                </div>
                <span class=${"pill " + (h.passed ? "mastered" : "learning")}>${h.wrong} fallos</span>
              </div>`)}
          </div>
        </div>`}
    </div>`;
}

function ExamResult({ result, onAgain, onExit }) {
  const [tab, setTab] = useState("resumen");
  const wrongOnes = result.attempts.filter((a) => !a.correct && a.ex?.question);
  const byTopic = new Map();
  for (const a of result.attempts) {
    const t = a.ex?.question?.topic;
    if (!t) continue;
    if (!byTopic.has(t)) byTopic.set(t, { right: 0, total: 0 });
    const r = byTopic.get(t);
    r.total++;
    if (a.correct) r.right++;
  }
  const weak = [...byTopic.entries()]
    .map(([n, r]) => ({ n, ...r, pct: Math.round((r.right / r.total) * 100) }))
    .sort((a, b) => a.pct - b.pct);

  return html`
    <div class="wrap">
      <div class="card" style="margin-top:14px;text-align:center">
        <div style="font-size:52px">${result.passed ? "🎉" : "📚"}</div>
        <h2 style="font-size:22px">${result.passed ? "¡Apto!" : "No apto — todavía"}</h2>
        <div class="sub">
          ${result.total - result.wrong} de ${result.total} correctas ·
          ${result.wrong} fallo${result.wrong === 1 ? "" : "s"} ·
          límite ${C.meta?.exam?.maxWrong ?? 3}
        </div>
        <div style="margin-top:14px">
          <${Bar} value=${((result.total - result.wrong) / result.total) * 100}
            cls=${result.passed ? "" : "warn"} />
        </div>
      </div>

      <div class="chipbar" style="margin:12px 0">
        ${[["resumen", "Resumen"], ["fallos", `Fallos (${wrongOnes.length})`], ["temas", "Por tema"]].map(([k, l]) => html`
          <button class=${"chip" + (tab === k ? " on" : "")} onClick=${() => setTab(k)}>${l}</button>`)}
      </div>

      ${tab === "resumen" && html`
        <div class="card">
          <h3>¿Español o teoría?</h3>
          ${result.split.total === 0
            ? html`<div class="sub">Sin fallos que analizar. 👏</div>`
            : html`
              <div class="ability">
                <span>🗣 Español</span><${Bar} value=${result.split.langPct} cls="accent" /><em>${result.split.lang}</em>
              </div>
              <div class="ability">
                <span>🚗 Teoría</span><${Bar} value=${result.split.theoryPct} cls="warn" /><em>${result.split.theory}</em>
              </div>
              <div class="sub" style="margin-top:10px">
                ${result.split.langPct >= 50
                  ? "Más de la mitad de tus fallos vienen de no entender el español de la pregunta, no de desconocer la norma. Dedica las próximas sesiones al idioma."
                  : "Tus fallos son sobre todo de contenido. El español de las preguntas lo estás entendiendo."}
              </div>
              ${result.split.byClass.map(([cls, n]) => html`
                <div class="row" style="margin-top:8px">
                  <div class="g"><b>${CLASSES[cls]?.label || cls}</b><span>${CLASSES[cls]?.tip || ""}</span></div>
                  <span class="pill">${n}</span>
                </div>`)}`}
        </div>`}

      ${tab === "fallos" && html`
        <div class="list">
          ${wrongOnes.length === 0
            ? html`<div class="empty">Ningún fallo. 🎉</div>`
            : wrongOnes.map((a) => {
                const q = a.ex.question;
                return html`
                  <div class="card tight">
                    <${OriginBadge} origin=${q.origin} />
                    <div style="font-weight:650;margin:8px 0">${q.q}</div>
                    <div class="banner ok" style="margin:6px 0">
                      <b>Correcta:</b> ${q.options[q.answer]}</div>
                    ${a.errorClass && html`
                      <span class=${"errtag " + (CLASSES[a.errorClass]?.lang ? "lang" : "theory")}>
                        ${CLASSES[a.errorClass]?.label || a.errorClass}</span>`}
                    <div class="srcline">${q.src}</div>
                  </div>`;
              })}
        </div>`}

      ${tab === "temas" && html`
        <div class="card">
          ${weak.map((w) => html`
            <div class="ability">
              <span style="font-size:12.5px">${C.topics.find((t) => t.n === w.n)?.title?.slice(0, 22)}</span>
              <${Bar} value=${w.pct} cls=${w.pct >= 80 ? "" : w.pct >= 50 ? "accent" : "warn"} />
              <em>${w.right}/${w.total}</em>
            </div>`)}
        </div>`}

      <div style="display:flex;gap:10px;margin:18px 0 30px">
        <button class="btn primary" style="flex:1" onClick=${onAgain}>Otro simulacro</button>
        <button class="btn" style="flex:1" onClick=${onExit}>Volver</button>
      </div>
    </div>`;
}
