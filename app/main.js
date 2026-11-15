import { render } from "preact";
import { html, useState, useEffect, useCallback, Toast, useToast } from "./ui/common.js";
import { db, seedContent, getSettings, countDue, streakInfo, todayKey, ensurePersistence } from "./lib/db.js";
import { loadContent, C, officialOf, pick } from "./lib/content.js";
import { buildLesson, exQuestion } from "./lib/session.js";
import * as speech from "./lib/speech.js";
import { HomeView } from "./ui/home.js";
import { PathView } from "./ui/path.js";
import { VocabView } from "./ui/vocab.js";
import { StatsView } from "./ui/stats.js";
import { SettingsView } from "./ui/settings.js";
import { ExamView } from "./ui/exam.js";
import { Player } from "./ui/player.js";

const TABS = [
  ["home", "🏠", "Hoy"],
  ["path", "🗺️", "Camino"],
  ["vocab", "📖", "Palabras"],
  ["exam", "🏁", "Examen"],
  ["stats", "📊", "Progreso"],
];

function boot(msg, p) {
  const m = document.getElementById("boot-msg");
  const b = document.getElementById("boot-bar");
  if (m) m.textContent = msg;
  if (b) b.style.width = p + "%";
}

function App({ initial }) {
  const [tab, setTab] = useState("home");
  const [settings, setSettings] = useState(initial.settings);
  const [player, setPlayer] = useState(null);
  const [due, setDue] = useState(initial.due);
  const [streak, setStreak] = useState(initial.streak);
  const [xp, setXp] = useState(initial.xp);
  const [msg, toast] = useToast();
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);
    speech.setVoice(s.speechVoice);
    applyTheme(s.theme);
    setDue(await countDue());
    setStreak((await streakInfo()).streak);
    const t = await db.sessions.get(todayKey());
    setXp(t?.xp || 0);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => { applyTheme(settings.theme); }, [settings.theme]);

  async function startLesson(topicN, lessonIdx) {
    const ex = await buildLesson(topicN, String(lessonIdx));
    if (!ex.length) return toast("Este tema todavía no tiene contenido.");
    setPlayer({ exercises: ex, title: `Tema ${topicN}`, kind: "lesson" });
  }

  async function startCheckpoint(topicN) {
    if (topicN == null) { setTab("exam"); return; }
    const pool = officialOf(topicN);
    if (!pool.length) return toast("Este tema aún no tiene preguntas oficiales.");
    const qs = pick(pool, Math.min(10, pool.length), String(Date.now())).map(exQuestion);
    setPlayer({ exercises: qs, title: `Control · tema ${topicN}`, kind: "checkpoint", exam: true });
  }

  function startDaily(exercises) {
    if (!exercises.length) return toast("Nada pendiente ahora mismo.");
    setPlayer({ exercises, title: "Sesión de hoy", kind: "daily" });
  }

  async function finishPlayer() {
    setPlayer(null);
    await reload();
    // There is now progress worth keeping; ensurePersistence throttles itself.
    ensurePersistence().catch(() => {});
  }

  if (player) {
    return html`<${Player} exercises=${player.exercises} title=${player.title}
      settings=${settings} examMode=${!!player.exam} onDone=${finishPlayer} />`;
  }

  return html`
    <div>
      <div class="appbar">
        <div class="inner">
          <h1>🚦 Mi Carnet</h1>
          <span class="spacer"></span>
          <span class="stat fire">🔥 ${streak}</span>
          <span class="stat xp">⚡ ${xp}</span>
          ${due > 0 && html`<span class="stat due">🔁 ${due}</span>`}
          <button class="btn sm ghost" onClick=${() => setTab("settings")} aria-label="Ajustes">⚙️</button>
        </div>
      </div>

      <main key=${tab + nonce}>
        ${tab === "home" && html`<${HomeView} settings=${settings} reload=${reload}
          onStartDaily=${startDaily} onStartLesson=${startLesson} />`}
        ${tab === "path" && html`<${PathView} onStartLesson=${startLesson} onStartCheckpoint=${startCheckpoint} />`}
        ${tab === "vocab" && html`<${VocabView} />`}
        ${tab === "exam" && html`<${ExamView} settings=${settings} onExit=${() => setTab("home")} />`}
        ${tab === "stats" && html`<${StatsView} />`}
        ${tab === "settings" && html`<${SettingsView} settings=${settings} reload=${reload} onToast=${toast} />`}
      </main>

      <nav class="nav">
        ${TABS.map(([k, ic, label]) => html`
          <button class=${tab === k ? "on" : ""} onClick=${() => setTab(k)}>
            <span class="ic">${ic}</span>
            ${k === "home" && due > 0 ? html`<span class="dot">${due > 99 ? "99+" : due}</span>` : null}
            <span>${label}</span>
          </button>`)}
      </nav>

      <${Toast} msg=${msg} />
    </div>`;
}

function applyTheme(theme) {
  const el = document.documentElement;
  if (theme === "auto") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", theme);
}

async function main() {
  try {
    boot("Preparando la base de datos…", 12);
    await db.open();

    boot("Cargando el contenido DGT…", 25);
    await seedContent((name, i, n) => boot(`Cargando ${name}…`, 25 + (i / n) * 45));

    boot("Indexando…", 76);
    await loadContent();

    const settings = await getSettings();
    speech.setVoice(settings.speechVoice);
    applyTheme(settings.theme);

    boot("Casi listo…", 92);
    const [due, s, today] = await Promise.all([countDue(), streakInfo(), db.sessions.get(todayKey())]);

    render(
      html`<${App} initial=${{ settings, due, streak: s.streak, xp: today?.xp || 0 }} />`,
      document.getElementById("root")
    );

    // Returning users: protect existing progress without blocking the first paint.
    setTimeout(() => ensurePersistence().catch(() => {}), 2500);

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register(new URL("../sw.js", import.meta.url), {
        scope: new URL("./", new URL("../", import.meta.url)).pathname,
      }).catch(() => {});
    }
  } catch (err) {
    console.error(err);
    document.getElementById("root").innerHTML = `
      <div style="padding:28px;font-family:system-ui;max-width:640px;margin:0 auto">
        <h1>No se ha podido iniciar</h1>
        <p style="color:#666">${String(err && err.message || err)}</p>
        <p style="color:#666">Si usas modo privado, el navegador puede estar bloqueando la base de datos local.
        Prueba en una ventana normal.</p>
      </div>`;
  }
}

main();
