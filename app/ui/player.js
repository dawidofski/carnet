import { html, useState, useEffect, useRef, Bar, TappableSentence, SpeakButton, OriginBadge } from "./common.js";
import { C } from "../lib/content.js";
import { db, getCard, putCard, logAttempt, bumpSession, ABILITY_LABEL } from "../lib/db.js";
import { review, gradeFrom, AGAIN, HARD, GOOD, maturity } from "../lib/fsrs.js";
import { classifyError, CLASSES } from "../lib/classify.js";
import * as speech from "../lib/speech.js";
import { exGrammarPair, exSimpleGloss, exRecognition } from "../lib/session.js";

const XP = { correct: 10, hinted: 6, wrong: 2, newTerm: 5 };

export function Player({ exercises, title, onDone, settings, examMode = false }) {
  const [queue, setQueue] = useState(exercises);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState("ask");     // ask | feedback
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState({ right: 0, wrong: 0, xp: 0, attempts: [] });
  const [hinted, setHinted] = useState(false);
  const startedAt = useRef(Date.now());
  const sessionStart = useRef(Date.now());

  const ex = queue[i];
  const total = queue.length;

  useEffect(() => {
    document.body.classList.add("in-player");
    return () => {
      document.body.classList.remove("in-player");
      speech.cancel();
    };
  }, []);

  useEffect(() => {
    startedAt.current = Date.now();
    setHinted(false);
    if (ex && (ex.type === "listen-pick" || ex.type === "listen-type") && !examMode) {
      const t = setTimeout(() => speech.speak(ex.speak || ex.sentence?.es, { rate: settings.speechRate }), 320);
      return () => clearTimeout(t);
    }
  }, [i, ex && ex.id]);

  if (!ex) {
    return html`<${Summary} stats=${stats} total=${total} title=${title}
      seconds=${Math.round((Date.now() - sessionStart.current) / 1000)} onDone=${onDone} />`;
  }

  async function answer(correct, payload = {}) {
    const ms = Date.now() - startedAt.current;
    let errInfo = null;

    if (ex.review) {
      const card = await getCard(ex.review.itemType, ex.review.itemId, ex.review.ability);
      const wasNew = card.state === "new";
      const grade = payload.grade ?? gradeFrom(correct, ms, hinted, (ex.cost || 12) * 900);
      const next = review(card, grade, Date.now(), settings.retention);
      await putCard(next);
      if (wasNew && correct) await bumpSession({ newTerms: ex.type === "term-intro" ? 1 : 0 });
      await bumpSession({ reviews: 1 });
    }

    if (!correct && ex.type === "question" && ex.question) {
      errInfo = await classifyError({
        question: ex.question,
        chosenIndex: payload.chosenIndex ?? -1,
        ms, hinted,
      });
    }

    const attempt = {
      itemId: ex.review?.itemId || ex.id,
      itemType: ex.review?.itemType || ex.type,
      topic: ex.question?.topic ?? ex.term?.topic ?? ex.sentence?.topic ?? null,
      correct, ms, hinted,
      errorClass: errInfo?.cls || (correct ? null : defaultClass(ex)),
      grammarId: errInfo?.grammar?.[0]?.id || null,
      kind: ex.kind || ex.type,
      origin: ex.question?.origin || null,
    };
    await logAttempt(attempt);

    const gained = correct ? (hinted ? XP.hinted : XP.correct) : XP.wrong;
    await bumpSession({ xp: gained, answered: 1, correct: correct ? 1 : 0, seconds: Math.round(ms / 1000) });

    setStats((s) => ({
      right: s.right + (correct ? 1 : 0),
      wrong: s.wrong + (correct ? 0 : 1),
      xp: s.xp + gained,
      attempts: [...s.attempts, { ...attempt, ex }],
    }));
    setResult({ correct, ...payload, err: errInfo });
    setPhase("feedback");
  }

  function next() {
    // On a wrong answer, queue the remediation the classifier asked for,
    // then re-ask this item later in the session.
    if (!examMode && result && !result.correct) {
      const extra = remediationFor(ex, result.err);
      const tail = [...queue.slice(i + 1), ...extra, { ...ex, id: ex.id + "-retry", retry: true }];
      setQueue([...queue.slice(0, i + 1), ...tail]);
    }
    setResult(null);
    setPhase("ask");
    setI(i + 1);
  }

  const progress = (i / total) * 100;

  return html`
    <div class="player">
      <header>
        <button class="btn sm ghost" onClick=${() => onDone(stats)}>✕</button>
        <${Bar} value=${progress} />
        ${!examMode && html`<span class="stat xp">⚡ ${stats.xp}</span>`}
      </header>
      <div class="body" key=${ex.id}>
        <${Exercise} ex=${ex} phase=${phase} result=${result} settings=${settings}
          examMode=${examMode} onAnswer=${answer} onHint=${() => setHinted(true)} hinted=${hinted} />
      </div>
      ${phase === "feedback" && html`
        <${Feedback} ex=${ex} result=${result} onNext=${next} examMode=${examMode} />`}
    </div>`;
}

function defaultClass(ex) {
  if (ex.kind === "listening") return "language.vocab";
  if (ex.kind === "production") return "language.vocab";
  if (ex.type === "grammar-pair") return "language.grammar";
  if (ex.type === "question") return "theory.rule";
  return "language.vocab";
}

/** Build the follow-up exercises the classifier asked for. */
function remediationFor(ex, err) {
  const out = [];
  if (!err) {
    if (ex.term) {
      const alt = ex.term.simple ? exSimpleGloss(ex.term, "rem") : null;
      if (alt && alt.id !== ex.id) out.push(alt);
    }
    return out;
  }
  if (err.remediation === "grammar" && err.grammar?.length) {
    const g = exGrammarPair(err.grammar[0], "rem");
    if (g) out.push(g);
  }
  if (err.remediation === "vocab" && err.terms?.length) {
    for (const t of err.terms.slice(0, 2)) {
      out.push(t.simple ? exSimpleGloss(t, "rem") : exRecognition(t, "rem"));
    }
  }
  if (err.remediation === "modal") {
    const g = C.grammar.find((x) => x.id === "gpermiso");
    if (g) {
      const p = exGrammarPair(g, "rem");
      if (p) out.push(p);
    }
  }
  return out;
}

/* ------------------------------------------------------------- exercises */

function Exercise(props) {
  const { ex } = props;
  switch (ex.type) {
    case "term-intro": return html`<${TermIntro} ...${props} />`;
    case "mcq": return html`<${MCQ} ...${props} />`;
    case "type-in": return html`<${TypeIn} ...${props} />`;
    case "chunk": return html`<${ChunkRead} ...${props} />`;
    case "gap": return html`<${Gap} ...${props} />`;
    case "order": return html`<${Order} ...${props} />`;
    case "listen-pick": return html`<${ListenPick} ...${props} />`;
    case "listen-type": return html`<${ListenType} ...${props} />`;
    case "question": return html`<${TheoryQuestion} ...${props} />`;
    case "comprehension": return html`<${MCQ} ...${props} />`;
    case "grammar-pair": return html`<${GrammarDrill} ...${props} />`;
    default: return html`<div class="empty">Ejercicio desconocido.</div>`;
  }
}

function Kicker({ children }) {
  return html`<div class="q-kicker">${children}</div>`;
}

const KICKER = {
  recognition: "¿Qué significa?",
  comprehension: "Comprensión",
  listening: "Escucha",
  production: "Escríbelo",
  contextual: "Pregunta de examen",
};

export const POS = {
  n: "sustantivo", v: "verbo", adj: "adjetivo", adv: "adverbio",
  prep: "preposición", conj: "conjunción", frase: "expresión",
  "adj/n": "adjetivo / sustantivo",
};
export const posLabel = (p) => (p ? POS[p] || p : "");

function TermIntro({ ex, onAnswer, phase }) {
  const t = ex.term;
  return html`
    <div>
      <${Kicker}>Palabra nueva<//>
      <h2 class="q-prompt">${t.es} <${SpeakButton} text=${t.head} /></h2>
      ${t.en && html`<div class="q-sub"><b style="color:var(--accent)">${t.en}</b>${t.pos ? ` · ${posLabel(t.pos)}` : ""}</div>`}
      ${t.simple && html`<div class="card tight"><div class="tiny">EN ESPAÑOL SENCILLO</div><div>${t.simple}</div></div>`}
      ${t.note && html`<div class="banner warn"><b>Ojo:</b> ${t.note}</div>`}
      ${t.example && html`
        <div class="card tight">
          <div class="tiny">EJEMPLO DEL MANUAL</div>
          <div style="margin-top:6px">${t.example}</div>
          <div class="srcline">${t.exampleSrc || ""}</div>
        </div>`}
      ${t.conf?.length ? html`<div class="banner info">No lo confundas con: <b>${t.conf.join(", ")}</b></div>` : null}
      ${t.src && html`<div class="srcline">Fuente: ${t.src}</div>`}
      ${phase === "ask" && html`
        <button class="btn primary block" style="margin-top:16px"
          onClick=${() => onAnswer(true, { grade: GOOD })}>Entendido</button>`}
    </div>`;
}

function MCQ({ ex, phase, result, onAnswer, onHint, hinted }) {
  const [sel, setSel] = useState(null);
  const locked = phase === "feedback";
  const choose = (k) => {
    if (locked) return;
    setSel(k);
    onAnswer(k === ex.answer, { chosenIndex: k });
  };
  return html`
    <div>
      <${Kicker}>${KICKER[ex.kind] || "¿Qué significa?"}<//>
      <h2 class="q-prompt">${ex.prompt}</h2>
      ${ex.sub && html`<div class="q-sub">${ex.sub}</div>`}
      <div class="options">
        ${ex.options.map((o, k) => html`
          <button class=${optCls(k, sel, ex.answer, locked)} disabled=${locked} onClick=${() => choose(k)}>
            <span class="k">${"ABCD"[k]}</span><span>${o}</span>
          </button>`)}
      </div>
      ${!locked && ex.explain && !hinted && html`
        <button class="btn sm ghost" style="margin-top:14px" onClick=${onHint}>Dame una pista</button>`}
      ${hinted && ex.explain && html`<div class="banner info" style="margin-top:12px">${ex.explain}</div>`}
    </div>`;
}

function optCls(k, sel, answer, locked) {
  let c = "opt";
  if (!locked) return c + (sel === k ? " sel" : "");
  if (k === answer) return c + " right";
  if (k === sel) return c + " wrong";
  return c;
}

function TypeIn({ ex, phase, result, onAnswer, onHint, hinted }) {
  const [val, setVal] = useState("");
  const inp = useRef(null);
  const locked = phase === "feedback";
  useEffect(() => { inp.current?.focus(); }, []);
  const submit = (e) => {
    e?.preventDefault();
    if (locked || !val.trim()) return;
    const ok = (ex.accept || [ex.answer]).some((a) => speech.sameText(a, val));
    onAnswer(ok, { typed: val });
  };
  return html`
    <form onSubmit=${submit}>
      <${Kicker}>Escríbelo en español<//>
      <h2 class="q-prompt">${ex.prompt}</h2>
      ${ex.sub && html`<div class="q-sub">${ex.sub}</div>`}
      <input ref=${inp} class=${"typein " + (locked ? (result?.correct ? "right" : "wrong") : "")}
        value=${val} disabled=${locked} autocapitalize="none" autocorrect="off" spellcheck="false"
        placeholder="…" onInput=${(e) => setVal(e.target.value)} />
      ${!locked && html`<div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn primary" type="submit" disabled=${!val.trim()}>Comprobar</button>
        ${!hinted && html`<button type="button" class="btn sm ghost" onClick=${onHint}>Pista</button>`}
      </div>`}
      ${hinted && !locked && html`<div class="banner info" style="margin-top:12px">
        Empieza por <b>${(ex.answer || "").slice(0, 2)}…</b> (${(ex.answer || "").length} letras)</div>`}
    </form>`;
}

function ChunkRead({ ex, phase, onAnswer }) {
  const s = ex.sentence;
  const [tapped, setTapped] = useState(0);
  return html`
    <div>
      <${Kicker}>Lee y toca las palabras<//>
      <div class="q-sub" style="margin-bottom:12px">
        Toca cualquier palabra para ver qué significa. Cuando lo entiendas, sigue.
      </div>
      <div class="card">
        <${TappableSentence} chunks=${s.chunks} onWord=${() => setTapped((n) => n + 1)} />
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px">
        <${SpeakButton} text=${s.es} label="🔊 Escuchar" />
        <${SpeakButton} text=${s.es} slow=${true} label="🐢 Despacio" />
      </div>
      <div class="srcline">${s.src}</div>
      ${phase === "ask" && html`
        <button class="btn primary block" style="margin-top:18px"
          onClick=${() => onAnswer(true, { grade: tapped > 3 ? HARD : GOOD })}>Lo entiendo</button>`}
    </div>`;
}

function Gap({ ex, phase, result, onAnswer }) {
  const [sel, setSel] = useState(null);
  const locked = phase === "feedback";
  const parts = (ex.sentence.es || "").split(ex.blank);
  const chosen = sel != null ? ex.options[sel] : "______";
  return html`
    <div>
      <${Kicker}>Completa la frase<//>
      <div class="card">
        <div class="sentence" style="font-size:18px">
          ${parts[0]}<b style=${{ color: locked ? (result?.correct ? "var(--brand)" : "var(--bad)") : "var(--accent)" }}>${chosen}</b>${parts.slice(1).join(ex.blank)}
        </div>
      </div>
      <div class="options">
        ${ex.options.map((o, k) => html`
          <button class=${optCls(k, sel, ex.answer, locked)} disabled=${locked}
            onClick=${() => { setSel(k); onAnswer(k === ex.answer, { chosenIndex: k }); }}>
            <span class="k">${"ABCD"[k]}</span><span>${o}</span>
          </button>`)}
      </div>
      <div class="srcline">${ex.src}</div>
    </div>`;
}

function Order({ ex, phase, result, onAnswer }) {
  const [built, setBuilt] = useState([]);
  const locked = phase === "feedback";
  const used = new Set(built.map((b) => b.k));
  const submit = () => {
    const got = built.map((b) => b.w).join(" ");
    onAnswer(speech.sameText(got, ex.sentence.es), { typed: got });
  };
  return html`
    <div>
      <${Kicker}>Ordena la frase<//>
      <div class="q-sub" style="margin-bottom:10px">Toca las palabras en el orden correcto.</div>
      <div class="build-zone">
        ${built.map((b, idx) => html`
          <button class="tile" disabled=${locked}
            onClick=${() => setBuilt(built.filter((_, j) => j !== idx))}>${b.w}</button>`)}
      </div>
      <div class="bank">
        ${ex.shuffled.map((w, k) => html`
          <button class=${"tile" + (used.has(k) ? " used" : "")} disabled=${locked}
            onClick=${() => setBuilt([...built, { w, k }])}>${w}</button>`)}
      </div>
      ${!locked && html`<button class="btn primary block" style="margin-top:18px"
        disabled=${!built.length} onClick=${submit}>Comprobar</button>`}
    </div>`;
}

function ListenPick({ ex, phase, result, onAnswer, settings }) {
  const [sel, setSel] = useState(null);
  const locked = phase === "feedback";
  return html`
    <div>
      <${Kicker}>¿Qué has oído?<//>
      <div style="display:flex;gap:10px;margin:14px 0 18px">
        <${SpeakButton} text=${ex.speak} label="🔊 Repetir" cls="btn" />
        <${SpeakButton} text=${ex.speak} slow=${true} label="🐢 Despacio" cls="btn ghost" />
      </div>
      <div class="options">
        ${ex.options.map((o, k) => html`
          <button class=${optCls(k, sel, ex.answer, locked)} disabled=${locked}
            onClick=${() => { setSel(k); onAnswer(k === ex.answer, { chosenIndex: k }); }}>
            <span class="k">${"ABCD"[k]}</span><span>${o}</span>
          </button>`)}
      </div>
    </div>`;
}

function ListenType({ ex, phase, result, onAnswer }) {
  const [val, setVal] = useState("");
  const locked = phase === "feedback";
  const submit = (e) => {
    e?.preventDefault();
    if (locked || !val.trim()) return;
    const sim = speech.similarity(val, ex.sentence.es);
    onAnswer(sim >= 0.85, { typed: val, grade: sim >= 0.95 ? GOOD : sim >= 0.85 ? HARD : AGAIN });
  };
  return html`
    <form onSubmit=${submit}>
      <${Kicker}>Escucha y escribe<//>
      <div style="display:flex;gap:10px;margin:14px 0 16px">
        <${SpeakButton} text=${ex.sentence.es} label="🔊 Repetir" cls="btn" />
        <${SpeakButton} text=${ex.sentence.es} slow=${true} label="🐢 Despacio" cls="btn ghost" />
      </div>
      <textarea class="typein" rows="3" disabled=${locked} value=${val}
        autocapitalize="none" autocorrect="off" spellcheck="false"
        onInput=${(e) => setVal(e.target.value)} placeholder="Escribe lo que oyes…"></textarea>
      ${!locked && html`<button class="btn primary block" type="submit" style="margin-top:14px"
        disabled=${!val.trim()}>Comprobar</button>`}
    </form>`;
}

function TheoryQuestion({ ex, phase, result, onAnswer, examMode, onHint, hinted }) {
  const [sel, setSel] = useState(null);
  const locked = phase === "feedback";
  const q = ex.question;
  const base = new URL("../../media/", import.meta.url);
  return html`
    <div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <${OriginBadge} origin=${q.origin} />
        ${!examMode && html`<span class="tiny">${C.topics.find((t) => t.n === q.topic)?.title || ""}</span>`}
      </div>
      <h2 class="q-prompt" style="white-space:pre-line">${q.q}</h2>
      ${q.img && html`<img class="q-img" loading="lazy" src=${new URL(q.img, base).href} alt="" />`}
      <div class="options">
        ${q.options.map((o, k) => html`
          <button class=${optCls(k, sel, q.answer, locked)} disabled=${locked}
            onClick=${() => { setSel(k); onAnswer(k === q.answer, { chosenIndex: k }); }}>
            <span class="k">${"ABC"[k]}</span><span>${o}</span>
          </button>`)}
      </div>
      ${!examMode && !locked && !hinted && html`
        <button class="btn sm ghost" style="margin-top:14px" onClick=${onHint}>Traducir palabras difíciles</button>`}
      ${!examMode && hinted && !locked && html`
        <div class="card tight" style="margin-top:12px">
          <div class="tiny">TOCA UNA PALABRA</div>
          <${TappableSentence} text=${q.q} />
        </div>`}
    </div>`;
}

function GrammarDrill({ ex, phase, result, onAnswer }) {
  const g = ex.grammar;
  const [sel, setSel] = useState(null);
  const locked = phase === "feedback";
  const opts = [
    `Sí — «${ex.marker}» cambia o limita la regla.`,
    `No — «${ex.marker}» no afecta a la regla.`,
  ];
  return html`
    <div>
      <${Kicker}>Gramática · ${g.title}<//>
      <div class="banner info"><b>${g.title}.</b> ${g.explain}</div>
      <div class="card">
        <${TappableSentence} chunks=${ex.sentence.chunks} />
      </div>
      <div class="q-sub" style="margin:14px 0 8px">
        En esta frase, ¿la palabra <b>«${ex.marker}»</b> introduce una excepción o una condición
        que cambia cuándo se aplica la norma?
      </div>
      <div class="options">
        ${opts.map((o, k) => html`
          <button class=${optCls(k, sel, 0, locked)} disabled=${locked}
            onClick=${() => { setSel(k); onAnswer(k === 0, { chosenIndex: k }); }}>
            <span class="k">${"AB"[k]}</span><span>${o}</span>
          </button>`)}
      </div>
      <div class="srcline">${ex.src} · aparece en ${g.hits} frases reales (${g.pct}%)</div>
    </div>`;
}

/* -------------------------------------------------------------- feedback */

function Feedback({ ex, result, onNext, examMode }) {
  const ok = result.correct;
  const q = ex.question;
  const correctText =
    q ? q.options[q.answer] :
    ex.type === "type-in" ? ex.answer :
    ex.type === "order" || ex.type === "listen-type" ? ex.sentence.es :
    ex.options ? ex.options[ex.answer] : null;

  useEffect(() => {
    const k = (e) => { if (e.key === "Enter") onNext(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onNext]);

  return html`
    <div class=${"feedback " + (ok ? "ok" : "no")}>
      <div class="inner">
        <div class="title">${ok ? "✅ ¡Correcto!" : "❌ No era esa"}</div>
        ${!ok && correctText && html`<div class="why"><b>Respuesta correcta:</b> ${correctText}</div>`}
        ${!ok && result.err && html`
          <div>
            <span class=${"errtag " + (result.err.lang ? "lang" : "theory")}>
              ${result.err.lang ? "🗣 " : "🚗 "}${result.err.label}
            </span>
            <div class="why">${result.err.tip}</div>
            ${result.err.terms?.length ? html`
              <div class="why">Palabras a repasar: <b>${result.err.terms.slice(0, 3).map((t) => t.head).join(", ")}</b></div>` : null}
            ${result.err.marker ? html`<div class="why">Fíjate en «<b>${result.err.marker}</b>».</div>` : null}
          </div>`}
        ${ok && ex.explain && html`<div class="why">${ex.explain}</div>`}
        ${ex.src && html`<div class="src">${ex.src}</div>`}
        <button class=${"btn block " + (ok ? "primary" : "")} onClick=${onNext}>Continuar</button>
      </div>
    </div>`;
}

/* --------------------------------------------------------------- summary */

function Summary({ stats, total, onDone, seconds, title }) {
  const acc = stats.right + stats.wrong ? Math.round((stats.right / (stats.right + stats.wrong)) * 100) : 0;
  const lang = stats.attempts.filter((a) => !a.correct && CLASSES[a.errorClass]?.lang).length;
  const theory = stats.attempts.filter((a) => !a.correct && a.errorClass && !CLASSES[a.errorClass]?.lang).length;
  return html`
    <div class="player">
      <div class="body" style="padding-top:40px">
        <div style="text-align:center">
          <div style="font-size:58px">${acc >= 80 ? "🎉" : acc >= 50 ? "💪" : "📚"}</div>
          <h2 style="margin:6px 0 2px">${title || "Sesión terminada"}</h2>
          <div class="sub">${Math.round(seconds / 60)} min · ${stats.right + stats.wrong} respuestas</div>
        </div>
        <div class="grid3" style="margin-top:22px">
          <div class="kpi"><b>${stats.xp}</b><span>XP ganados</span></div>
          <div class="kpi"><b>${acc}%</b><span>Aciertos</span></div>
          <div class="kpi"><b>${stats.wrong}</b><span>Fallos</span></div>
        </div>
        ${(lang + theory) > 0 && html`
          <div class="card">
            <h3>¿Español o teoría?</h3>
            <div class="ability">
              <span>🗣 Español</span><${Bar} value=${(lang / (lang + theory)) * 100} class="accent" /><em>${lang}</em>
            </div>
            <div class="ability">
              <span>🚗 Teoría</span><${Bar} value=${(theory / (lang + theory)) * 100} class="warn" /><em>${theory}</em>
            </div>
            <div class="sub" style="margin-top:8px">
              ${lang > theory
                ? "La mayoría de tus fallos fueron de comprensión del español, no de la norma. Hoy toca idioma."
                : "La mayoría de tus fallos fueron de la norma en sí, no del idioma. Vas entendiendo bien el español."}
            </div>
          </div>`}
        <button class="btn primary block" style="margin-top:20px" onClick=${() => onDone(stats)}>Terminar</button>
      </div>
    </div>`;
}
