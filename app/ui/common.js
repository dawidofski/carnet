import { h } from "preact";
import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import htm from "htm";
import { C, lookup, nrm } from "../lib/content.js";
import * as speech from "../lib/speech.js";

export const html = htm.bind(h);
export { useState, useEffect, useRef, useCallback };

export const pct = (n) => `${Math.round(n)}%`;

export function Bar({ value, max = 100, cls = "" }) {
  const v = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return html`<div class=${"bar " + cls}><i style=${{ width: v + "%" }}></i></div>`;
}

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return html`
    <div class="sheet-back" onClick=${onClose}>
      <div class="sheet" onClick=${(e) => e.stopPropagation()}>
        <div class="grab"></div>
        ${title && html`<h2>${title}</h2>`}
        ${children}
      </div>
    </div>`;
}

export function Toast({ msg }) {
  if (!msg) return null;
  return html`<div class="toast">${msg}</div>`;
}

export function SpeakButton({ text, slow = false, label = "🔊", cls = "btn sm" }) {
  const [busy, setBusy] = useState(false);
  if (!speech.isAvailable()) return null;
  return html`<button class=${cls} disabled=${busy}
    onClick=${() => {
      setBusy(true);
      speech.speak(text, { slow, onend: () => setBusy(false) });
    }}>${label}</button>`;
}

/**
 * A Spanish sentence where every known word can be tapped for its meaning.
 * `chunks` comes from the content build; plain strings are tokenised live.
 */
export function TappableSentence({ chunks, text, onWord, hideGloss = false }) {
  const [open, setOpen] = useState(null);
  const parts = chunks || tokenise(text || "");
  const show = (i, part) => {
    if (!part.g && !lookup(part.t)) return;
    setOpen(open === i ? null : i);
    onWord?.(part);
  };
  const cur = open != null ? parts[open] : null;
  const g = cur ? cur.g || lookup(cur.t) : null;
  return html`
    <div>
      <div class="sentence">
        ${parts.map((p, i) => {
          if (!/[a-záéíóúüñ]/i.test(p.t)) return html`<span>${p.t}</span>`;
          const known = !!(p.g || lookup(p.t));
          return html`<span
            class=${"w " + (known ? "has " : "none ") + (open === i ? "on" : "")}
            onClick=${() => show(i, p)}>${p.t}</span>`;
        })}
      </div>
      ${!hideGloss && g && html`
        <div class="gloss" onClick=${() => setOpen(null)}>
          <b>${cur.t}</b> — <span class="en">${g.en || "—"}</span>
          ${g.note && html`<div class="note">${g.note}</div>`}
        </div>`}
    </div>`;
}

export function tokenise(text) {
  const out = [];
  let buf = "";
  for (const ch of text) {
    if (/[a-záéíóúüñA-ZÁÉÍÓÚÑ]/.test(ch)) buf += ch;
    else {
      if (buf) { out.push({ t: buf }); buf = ""; }
      out.push({ t: ch });
    }
  }
  if (buf) out.push({ t: buf });
  return out;
}

export function OriginBadge({ origin }) {
  if (origin === "official") return html`<span class="chip badge-official">Oficial DGT</span>`;
  if (origin === "practice") return html`<span class="chip badge-practice">Práctica</span>`;
  if (origin === "comprehension") return html`<span class="chip badge-comp">Comprensión</span>`;
  return null;
}

export function Empty({ icon = "🎉", title, children }) {
  return html`<div class="empty">
    <div class="big">${icon}</div>
    <h3 style="margin:8px 0 4px;color:var(--text);text-transform:none;letter-spacing:0;font-size:17px">${title}</h3>
    <div>${children}</div>
  </div>`;
}

export function useToast() {
  const [msg, setMsg] = useState(null);
  const tRef = useRef(null);
  const show = useCallback((m, ms = 2200) => {
    setMsg(m);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setMsg(null), ms);
  }, []);
  return [msg, show];
}

export const topicTitle = (n) => C.topics.find((t) => t.n === n)?.title || "—";
export const topicIcon = (n) => C.topics.find((t) => t.n === n)?.icon || "📘";
