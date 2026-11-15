import { html, useState, useEffect, Bar, Empty } from "./common.js";
import { C } from "../lib/content.js";
import { db, streakInfo, ABILITIES, ABILITY_LABEL, reviewKey } from "../lib/db.js";
import { maturity } from "../lib/fsrs.js";
import { allTopicStates } from "../lib/session.js";
import { splitAttempts, CLASSES } from "../lib/classify.js";

export const ACHIEVEMENTS = [
  { id: "first", icon: "🌱", title: "Primera lección", desc: "Completa tu primera lección", test: (d) => d.answered >= 5 },
  { id: "streak3", icon: "🔥", title: "Tres días", desc: "Tres días seguidos", test: (d) => d.streak >= 3 },
  { id: "streak7", icon: "🔥", title: "Una semana", desc: "Siete días seguidos", test: (d) => d.streak >= 7 },
  { id: "streak30", icon: "🏅", title: "Un mes entero", desc: "Treinta días seguidos", test: (d) => d.streak >= 30 },
  { id: "w50", icon: "📖", title: "50 palabras", desc: "50 palabras aprendidas", test: (d) => d.learned >= 50 },
  { id: "w150", icon: "📚", title: "150 palabras", desc: "150 palabras aprendidas", test: (d) => d.learned >= 150 },
  { id: "m100", icon: "🧠", title: "100 dominadas", desc: "100 palabras en las 5 habilidades", test: (d) => d.mastered >= 100 },
  { id: "salvo", icon: "⚖️", title: "«Salvo»", desc: "20 frases de excepción seguidas bien", test: (d) => d.grammarStreak >= 20 },
  { id: "q200", icon: "🚗", title: "200 preguntas", desc: "200 preguntas oficiales respondidas", test: (d) => d.officialAnswered >= 200 },
  { id: "exam1", icon: "🏁", title: "Primer simulacro", desc: "Haz un examen completo", test: (d) => d.exams >= 1 },
  { id: "pass1", icon: "🎉", title: "Primer apto", desc: "Aprueba un simulacro", test: (d) => d.passed >= 1 },
  { id: "pass5", icon: "🏆", title: "Listo para la DGT", desc: "Aprueba cinco simulacros", test: (d) => d.passed >= 5 },
];

export function StatsView() {
  const [d, setD] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const [reviews, attempts, exams, streak, states] = await Promise.all([
      db.reviews.toArray(),
      db.attempts.toArray(),
      db.events.where("type").equals("exam").toArray(),
      streakInfo(),
      allTopicStates(),
    ]);

    const byTerm = new Map();
    for (const r of reviews) {
      if (r.itemType !== "term") continue;
      if (!byTerm.has(r.itemId)) byTerm.set(r.itemId, {});
      byTerm.get(r.itemId)[r.ability] = r;
    }
    let mastered = 0, learned = 0;
    const abilityCount = Object.fromEntries(ABILITIES.map((a) => [a, 0]));
    for (const [, cards] of byTerm) {
      learned++;
      let all = true;
      for (const a of ABILITIES) {
        const m = maturity(cards[a]);
        if (m === "mastered") abilityCount[a]++;
        else all = false;
      }
      if (all) mastered++;
    }

    const officialAnswered = attempts.filter((a) => a.origin === "official").length;
    const officialRight = attempts.filter((a) => a.origin === "official" && a.correct).length;

    // longest current run of correct grammar answers
    let grammarStreak = 0;
    for (const a of [...attempts].reverse()) {
      if (a.itemType !== "grammar") continue;
      if (a.correct) grammarStreak++;
      else break;
    }

    const totalSeconds = (await db.sessions.toArray()).reduce((s, r) => s + (r.seconds || 0), 0);
    const recent = attempts.filter((a) => a.ts > Date.now() - 14 * 86400000);

    // readiness: accuracy on official questions, weighted by coverage
    const seenOfficial = new Set(attempts.filter((a) => a.origin === "official").map((a) => a.itemId)).size;
    const coverage = Math.min(1, seenOfficial / 250);
    const acc = officialAnswered ? officialRight / officialAnswered : 0;
    const examAcc = exams.length
      ? exams.slice(-3).reduce((s, e) => s + (e.total - e.wrong) / e.total, 0) / Math.min(3, exams.length)
      : null;
    const estimate = Math.round((examAcc ?? acc * (0.6 + 0.4 * coverage)) * 30);

    setD({
      reviews, attempts, exams, streak, states, byTerm, mastered, learned, abilityCount,
      officialAnswered, officialRight, grammarStreak, totalSeconds,
      answered: attempts.length, passed: exams.filter((e) => e.passed).length,
      split: splitAttempts(recent), estimate, seenOfficial,
      due: reviews.filter((r) => r.due <= Date.now()).length,
    });
  }

  if (!d) return html`<div class="wrap"><div class="empty">Calculando…</div></div>`;

  const totalTerms = C.terms.length;
  const weak = [...d.states].sort((a, b) => a.progress - b.progress).slice(0, 5);
  const leeches = d.reviews.filter((r) => r.lapses >= 3)
    .sort((a, b) => b.lapses - a.lapses).slice(0, 6);
  const need = C.meta?.exam ? C.meta.exam.questions - C.meta.exam.maxWrong : 27;

  return html`
    <div class="wrap">
      <div class="card" style="margin-top:14px">
        <h3>¿Estoy listo para el examen?</h3>
        <div style="display:flex;align-items:baseline;gap:8px">
          <div style="font-size:40px;font-weight:800;letter-spacing:-.03em;
                      color:${d.estimate >= need ? "var(--brand)" : "var(--warn)"}">${d.estimate}</div>
          <div class="sub">de 30 · necesitas <b>${need}</b></div>
        </div>
        <div style="margin-top:10px"><${Bar} value=${(d.estimate / 30) * 100}
          cls=${d.estimate >= need ? "" : "warn"} /></div>
        <div class="sub" style="margin-top:8px">
          ${d.exams.length
            ? `Basado en tus últimos ${Math.min(3, d.exams.length)} simulacros.`
            : d.officialAnswered > 20
              ? `Estimado con ${d.officialAnswered} preguntas oficiales respondidas. Haz un simulacro para afinarlo.`
              : "Todavía con pocos datos. Responde más preguntas oficiales."}
        </div>
      </div>

      <div class="grid3">
        <div class="kpi"><b>${d.learned}</b><span>palabras empezadas</span></div>
        <div class="kpi"><b>${d.mastered}</b><span>dominadas (5/5)</span></div>
        <div class="kpi"><b>${totalTerms - d.learned}</b><span>sin empezar</span></div>
      </div>
      <div class="grid3">
        <div class="kpi"><b>${d.streak.streak}🔥</b><span>racha actual</span></div>
        <div class="kpi"><b>${d.streak.best}</b><span>mejor racha</span></div>
        <div class="kpi"><b>${Math.round(d.totalSeconds / 60)}</b><span>minutos totales</span></div>
      </div>

      <div class="card">
        <h3>Las cinco habilidades</h3>
        ${ABILITIES.map((a) => html`
          <div class="ability">
            <span>${ABILITY_LABEL[a]}</span>
            <${Bar} value=${(d.abilityCount[a] / (totalTerms || 1)) * 100} />
            <em>${d.abilityCount[a]}</em>
          </div>`)}
        <div class="sub" style="margin-top:8px">
          Una palabra solo cuenta como <b>dominada</b> cuando las cinco están estables.
        </div>
      </div>

      <div class="card">
        <h3>Preguntas oficiales DGT</h3>
        <div class="grid3">
          <div class="kpi"><b>${d.seenOfficial}</b><span>vistas</span></div>
          <div class="kpi"><b>${C.meta?.totals?.official ?? 0}</b><span>disponibles</span></div>
          <div class="kpi"><b>${d.officialAnswered ? Math.round((d.officialRight / d.officialAnswered) * 100) : 0}%</b><span>acierto</span></div>
        </div>
      </div>

      ${d.split.total >= 3 && html`
        <div class="card">
          <h3>Origen de tus fallos (14 días)</h3>
          <div class="ability"><span>🗣 Español</span><${Bar} value=${d.split.langPct} cls="accent" /><em>${d.split.lang}</em></div>
          <div class="ability"><span>🚗 Teoría</span><${Bar} value=${d.split.theoryPct} cls="warn" /><em>${d.split.theory}</em></div>
          ${d.split.byClass.slice(0, 4).map(([cls, n]) => html`
            <div class="row" style="margin-top:8px">
              <div class="g"><b>${CLASSES[cls]?.label || cls}</b><span>${CLASSES[cls]?.tip || ""}</span></div>
              <span class="pill">${n}</span>
            </div>`)}
        </div>`}

      <div class="card">
        <h3>Temas más flojos</h3>
        ${weak.map((w) => html`
          <div class="ability">
            <span style="font-size:12.5px">${C.topics.find((t) => t.n === w.n)?.title?.slice(0, 24)}</span>
            <${Bar} value=${w.progress} cls=${w.progress >= 60 ? "" : "warn"} />
            <em>${w.progress}%</em>
          </div>`)}
      </div>

      ${leeches.length > 0 && html`
        <div class="card">
          <h3>Se te resisten</h3>
          <div class="list">
            ${leeches.map((r) => {
              const item = C.byId.get(r.itemId);
              return html`
                <div class="row">
                  <div class="g">
                    <b>${item?.es || item?.head || item?.q?.slice(0, 48) || r.itemId}</b>
                    <span>${ABILITY_LABEL[r.ability] || r.ability}</span>
                  </div>
                  <span class="pill learning">${r.lapses} fallos</span>
                </div>`;
            })}
          </div>
        </div>`}

      <div class="card">
        <h3>Logros</h3>
        ${ACHIEVEMENTS.map((a) => {
          const got = a.test({
            ...d, streak: d.streak.streak, exams: d.exams.length,
          });
          return html`
            <div class=${"ach" + (got ? " got" : "")}>
              <div class="medal">${a.icon}</div>
              <div class="g"><b>${a.title}</b><span>${a.desc}</span></div>
              ${got && html`<span class="pill mastered">✓</span>`}
            </div>`;
        })}
      </div>
    </div>`;
}
