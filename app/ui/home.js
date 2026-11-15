import { html, useState, useEffect, Bar, Empty } from "./common.js";
import { C } from "../lib/content.js";
import { db, countDue, streakInfo, todayKey, getSettings, setSetting } from "../lib/db.js";
import { buildDaily, allTopicStates, unlockedUpTo } from "../lib/session.js";
import { splitAttempts } from "../lib/classify.js";

const GOALS = [5, 10, 15, 30];

export function HomeView({ settings, onStartDaily, onStartLesson, onSettings, reload }) {
  const [info, setInfo] = useState(null);

  useEffect(() => { load(); }, [settings.dailyMinutes]);

  async function load() {
    const [due, streak, today, states, recent] = await Promise.all([
      countDue(),
      streakInfo(),
      db.sessions.get(todayKey()),
      allTopicStates(),
      db.attempts.where("ts").above(Date.now() - 7 * 86400000).toArray(),
    ]);
    const plan = await buildDaily(settings.dailyMinutes);
    const unlocked = unlockedUpTo(states);
    setInfo({ due, streak, today, states, plan, unlocked, split: splitAttempts(recent) });
  }

  if (!info) return html`<div class="wrap"><div class="empty">Preparando tu sesión…</div></div>`;

  const { due, streak, today, plan, states, unlocked, split } = info;
  const goalXp = settings.dailyMinutes * 12;
  const xp = today?.xp || 0;
  const goalDone = xp >= goalXp;
  const mix = countKinds(plan.exercises);
  const cur = C.topics.find((t) => t.n === unlocked);

  return html`
    <div class="wrap">
      <div class="card" style="margin-top:14px">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="font-size:34px">${goalDone ? "🎉" : "🎯"}</div>
          <div style="flex:1">
            <h2>${goalDone ? "Objetivo de hoy conseguido" : "Tu sesión de hoy"}</h2>
            <div class="sub">${xp} / ${goalXp} XP · ${settings.dailyMinutes} minutos</div>
          </div>
        </div>
        <div style="margin-top:12px"><${Bar} value=${(xp / goalXp) * 100} /></div>

        <div class="chipbar" style="margin-top:14px">
          ${GOALS.map((g) => html`
            <button class=${"chip" + (settings.dailyMinutes === g ? " on" : "")}
              onClick=${async () => { await setSetting("dailyMinutes", g); reload(); }}>${g} min</button>`)}
        </div>

        ${plan.exercises.length === 0
          ? html`<${Empty} icon="✅" title="Nada pendiente ahora mismo">
              Vuelve más tarde o empieza una lección nueva del camino.
            <//>`
          : html`
            <ul style="margin:16px 0 0;padding-left:20px;line-height:1.75;font-size:14.5px">
              ${mix.map((m) => html`<li>${m}</li>`)}
            </ul>
            <button class="btn primary block" style="margin-top:16px"
              onClick=${() => onStartDaily(plan.exercises)}>
              ${xp > 0 ? "Seguir estudiando" : "Empezar"} · ${plan.exercises.length} ejercicios
            </button>`}

        ${plan.dueTotal > 40 && html`
          <div class="banner warn" style="margin-top:12px">
            Tienes <b>${plan.dueTotal} repasos</b> atrasados. Hoy no añado palabras nuevas:
            primero recuperamos lo que ya sabías.
          </div>`}
      </div>

      <div class="grid3">
        <div class="kpi"><b>${streak.streak}🔥</b><span>días seguidos</span></div>
        <div class="kpi"><b>${due}</b><span>repasos hoy</span></div>
        <div class="kpi"><b>${xp}</b><span>XP hoy</span></div>
      </div>

      ${split.total >= 5 && html`
        <div class="card">
          <h3>Tus fallos esta semana</h3>
          <div class="ability">
            <span>🗣 Español</span><${Bar} value=${split.langPct} cls="accent" /><em>${split.langPct}%</em>
          </div>
          <div class="ability">
            <span>🚗 Teoría</span><${Bar} value=${split.theoryPct} cls="warn" /><em>${split.theoryPct}%</em>
          </div>
          <div class="sub" style="margin-top:8px">
            ${split.langPct > split.theoryPct
              ? "Fallas más por el idioma que por la norma. Las sesiones de hoy llevan más español."
              : "El idioma lo llevas bien; lo que falla es la norma. Hoy va más teoría."}
          </div>
        </div>`}

      ${cur && html`
        <div class="card">
          <h3>Siguiente en tu camino</h3>
          <div style="display:flex;gap:12px;align-items:center">
            <div style="font-size:30px">${cur.icon}</div>
            <div style="flex:1">
              <b>Tema ${cur.n} · ${cur.title}</b>
              <div class="sub">${cur.sub}</div>
            </div>
          </div>
          <button class="btn block" style="margin-top:12px"
            onClick=${() => onStartLesson(cur.n, 0)}>Abrir lección</button>
        </div>`}
    </div>`;
}

function countKinds(exs) {
  const c = {};
  for (const e of exs) {
    const k =
      e.type === "term-intro" ? "palabras nuevas" :
      e.kind === "listening" ? "ejercicios de escucha" :
      e.type === "question" ? (e.question?.origin === "official" ? "preguntas oficiales DGT" : "preguntas de práctica") :
      e.type === "grammar-pair" ? "ejercicios de gramática" :
      e.type === "comprehension" ? "preguntas reales para entender" :
      e.kind === "production" ? "ejercicios de escritura" :
      "ejercicios de vocabulario y frases";
    c[k] = (c[k] || 0) + 1;
  }
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`);
}
