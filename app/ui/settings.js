import { html, useState, useEffect, useRef } from "./common.js";
import { C } from "../lib/content.js";
import {
  db, setSetting, exportBackup, importBackup, validateBackup, diffBackup,
  undoImport, wipeProgress, storageEstimate, persistenceState, ensurePersistence,
} from "../lib/db.js";
import * as speech from "../lib/speech.js";

export function SettingsView({ settings, reload, onToast }) {
  const [voices, setVoices] = useState([]);
  const [storage, setStorage] = useState(null);
  const [persist, setPersist] = useState(null);
  const [pending, setPending] = useState(null);     // { obj, diff }
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setVoices(speech.spanishVoices());
    storageEstimate().then(setStorage);
    persistenceState().then(setPersist);
    db.settings.get("preImportSnapshot").then((r) => setHasSnapshot(!!r));
    const t = setTimeout(() => setVoices(speech.refreshVoices()), 600);
    return () => clearTimeout(t);
  }, []);

  async function doExport() {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mi-carnet-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    onToast("Copia descargada");
  }

  async function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      const v = validateBackup(obj);
      if (!v.ok) {
        onToast("Archivo no válido");
        setPending({ obj: null, errors: v.errors });
        return;
      }
      setPending({ obj, diff: await diffBackup(obj), errors: [] });
    } catch (err) {
      setPending({ obj: null, errors: ["El archivo no es JSON válido."] });
    } finally {
      e.target.value = "";
    }
  }

  async function doImport(mode) {
    await importBackup(pending.obj, mode);
    setPending(null);
    setHasSnapshot(true);
    onToast("Copia restaurada");
    reload();
  }

  return html`
    <div class="wrap">
      <div class="card" style="margin-top:14px">
        <h3>Apariencia</h3>
        <div class="chipbar">
          ${[["auto", "Automático"], ["light", "Claro"], ["dark", "Oscuro"]].map(([k, l]) => html`
            <button class=${"chip" + (settings.theme === k ? " on" : "")}
              onClick=${async () => { await setSetting("theme", k); reload(); }}>${l}</button>`)}
        </div>
      </div>

      <div class="card">
        <h3>Objetivo diario</h3>
        <div class="chipbar">
          ${[5, 10, 15, 30].map((g) => html`
            <button class=${"chip" + (settings.dailyMinutes === g ? " on" : "")}
              onClick=${async () => { await setSetting("dailyMinutes", g); reload(); }}>${g} min</button>`)}
        </div>
        <div class="sub" style="margin-top:10px">Palabras nuevas por día: <b>${settings.newPerDay}</b></div>
        <input type="range" min="2" max="20" value=${settings.newPerDay} style="width:100%"
          onChange=${async (e) => { await setSetting("newPerDay", +e.target.value); reload(); }} />
      </div>

      <div class="card">
        <h3>Voz en español</h3>
        ${!speech.isAvailable()
          ? html`<div class="banner warn">Tu navegador no tiene voces en español instaladas.
              Los ejercicios de escucha quedarán desactivados.</div>`
          : html`
            ${!speech.hasPeninsular() && html`
              <div class="banner info">No hay voz de España (es-ES) en este dispositivo.
                Se usará la voz en español más parecida.</div>`}
            <select class="search" value=${settings.speechVoice || ""}
              onChange=${async (e) => {
                await setSetting("speechVoice", e.target.value || null);
                speech.setVoice(e.target.value || null);
                reload();
              }}>
              <option value="">Automática (prefiere España)</option>
              ${voices.map((v) => html`<option value=${v.voiceURI}>${v.name} — ${v.lang}</option>`)}
            </select>
            <div class="sub" style="margin-top:10px">Velocidad: <b>${settings.speechRate.toFixed(2)}×</b></div>
            <input type="range" min="0.6" max="1.2" step="0.05" value=${settings.speechRate} style="width:100%"
              onChange=${async (e) => { await setSetting("speechRate", +e.target.value); reload(); }} />
            <button class="btn sm" style="margin-top:8px"
              onClick=${() => speech.speak("Los conductores deben respetar la distancia de seguridad.",
                { rate: settings.speechRate })}>Probar voz</button>`}
      </div>

      <div class="card">
        <h3>Copia de seguridad</h3>
        <div class="sub">
          Todo tu progreso vive solo en este navegador. Si borras los datos del sitio,
          cambias de móvil o usas el modo privado, se pierde. Haz una copia de vez en cuando.
        </div>
        <div style="display:flex;gap:10px;margin-top:12px">
          <button class="btn primary" style="flex:1" onClick=${doExport}>Descargar copia</button>
          <button class="btn" style="flex:1" onClick=${() => fileRef.current.click()}>Restaurar</button>
        </div>
        <input ref=${fileRef} type="file" accept="application/json,.json" style="display:none" onChange=${pickFile} />
        ${hasSnapshot && html`
          <button class="btn ghost block" style="margin-top:10px"
            onClick=${async () => { await undoImport(); setHasSnapshot(false); onToast("Importación deshecha"); reload(); }}>
            Deshacer la última restauración</button>`}

        ${pending && html`
          <div class="card tight" style="margin-top:12px">
            ${pending.errors?.length
              ? html`<div class="banner bad">${pending.errors.map((e) => html`<div>${e}</div>`)}</div>`
              : html`
                <div class="tiny">QUÉ CONTIENE EL ARCHIVO</div>
                ${Object.entries(pending.diff).map(([t, d]) => html`
                  <div class="row" style="margin-top:6px">
                    <div class="g"><b>${t}</b><span>${d.new} nuevos · ${d.duplicates} ya existen</span></div>
                    <span class="pill">${d.incoming}</span>
                  </div>`)}
                <div class="banner info" style="margin-top:10px">
                  <b>Fusionar</b> conserva lo más reciente de cada lado.
                  <b>Reemplazar</b> borra tu progreso actual y pone el del archivo.
                  Antes de escribir se guarda una copia para poder deshacer.
                </div>
                <div style="display:flex;gap:10px;margin-top:10px">
                  <button class="btn primary" style="flex:1" onClick=${() => doImport("merge")}>Fusionar</button>
                  <button class="btn danger" style="flex:1" onClick=${() => doImport("replace")}>Reemplazar</button>
                </div>`}
            <button class="btn ghost block" style="margin-top:10px" onClick=${() => setPending(null)}>Cancelar</button>
          </div>`}
      </div>

      <div class="card">
        <h3>Guardar en GitHub (opcional)</h3>
        <div class="sub">
          Puedes guardar la copia JSON en un repositorio <b>privado</b> tuyo si quieres tenerla
          en varios dispositivos. Requiere un token personal de GitHub con permiso de
          escritura <b>solo en ese repositorio</b>.
        </div>
        <div class="banner warn" style="margin-top:10px">
          <b>Antes de hacerlo, ten claro esto:</b> un token guardado en el navegador puede ser leído
          por cualquier script que llegue a ejecutarse en esta página. Usa un token de
          <i>fine-grained</i> limitado a un único repositorio privado, con caducidad corta,
          y revócalo cuando dejes de usarlo. Nunca lo pongas en el código ni en un repositorio público.
        </div>
        <div class="banner info">
          Esta función está deliberadamente <b>desactivada</b> en esta versión: la copia local
          funciona siempre, sin red y sin credenciales, y es suficiente. Si la quieres,
          dímelo y la añado con el token guardado solo en IndexedDB y revocable con un toque.
        </div>
      </div>

      <div class="card">
        <h3>Datos y almacenamiento</h3>
        ${storage && html`
          <div class="sub">
            Usando ${(storage.usage / 1e6).toFixed(1)} MB
            ${storage.quota ? ` de ${(storage.quota / 1e6).toFixed(0)} MB disponibles` : ""}
          </div>
          <div style="margin-top:8px"><${Bar} value=${(storage.usage / (storage.quota || 1)) * 100} cls="accent" /></div>`}
        <div class="grid3" style="margin-top:12px">
          <div class="kpi"><b>${C.meta?.totals?.terms ?? 0}</b><span>palabras</span></div>
          <div class="kpi"><b>${C.meta?.totals?.official ?? 0}</b><span>preguntas DGT</span></div>
          <div class="kpi"><b>${C.meta?.totals?.comprehension ?? 0}</b><span>preguntas reales</span></div>
        </div>
        ${persist && (persist.granted
          ? html`<div class="banner ok" style="margin-top:12px">
              <b>✅ Almacenamiento protegido.</b> El navegador se ha comprometido a no borrar
              tu progreso para hacer sitio. Aun así, si borras los datos del sitio a mano,
              se pierde: descarga una copia de vez en cuando.
            </div>`
          : html`
            <div class="banner warn" style="margin-top:12px">
              <b>Almacenamiento no protegido.</b> Tu progreso está guardado, pero el navegador
              podría borrarlo si el dispositivo se queda sin espacio.
              ${!persist.supported ? " Este navegador no permite protegerlo." : ""}
            </div>
            ${persist.supported && html`
              <button class="btn block" onClick=${async () => {
                const r = await ensurePersistence({ force: true });
                setPersist(await persistenceState());
                onToast(r.granted
                  ? "Almacenamiento protegido"
                  : "El navegador no lo ha concedido todavía");
              }}>Proteger mi progreso</button>`}`)}
      </div>

      <div class="card">
        <h3>De dónde sale el contenido</h3>
        <div class="list">
          ${(C.meta?.sources || []).map((s) => html`
            <div class="row">
              <div class="g"><b>${s.title}</b><span>${s.org} · ${s.year}</span></div>
            </div>`)}
        </div>
        <div class="srcline">
          Las preguntas marcadas <b>Oficial DGT</b> provienen de los test publicados por la
          Dirección General de Tráfico. Las marcadas <b>Práctica</b> las genera esta app a partir
          de frases del manual y siempre citan su origen. Nunca se presentan como oficiales.
        </div>
        ${C.meta?.totals?.quarantined > 0 && html`
          <div class="banner info" style="margin-top:10px">
            <b>${C.meta.totals.quarantined} preguntas oficiales están apartadas.</b>
            Son anteriores a un cambio de norma (baliza V-16 desde el 1-1-2026 y velocidades
            urbanas 20/30/50 desde el 11-5-2021) y enseñarían una regla que ya no está vigente.
            No aparecen ni en las lecciones ni en el examen.
            Quedan <b>${C.meta.totals.officialActive}</b> preguntas oficiales en uso.
          </div>`}
      </div>

      <div class="card">
        <h3 style="color:var(--bad)">Zona peligrosa</h3>
        ${!confirmWipe
          ? html`<button class="btn ghost block" onClick=${() => setConfirmWipe(true)}>Borrar todo mi progreso</button>`
          : html`
            <div class="banner bad">
              Esto borra repasos, respuestas, rachas y simulacros. <b>No se puede deshacer.</b>
              Descarga antes una copia si la quieres.
            </div>
            <div style="display:flex;gap:10px;margin-top:10px">
              <button class="btn danger" style="flex:1"
                onClick=${async () => { await wipeProgress(); setConfirmWipe(false); onToast("Progreso borrado"); reload(); }}>
                Sí, borrar</button>
              <button class="btn" style="flex:1" onClick=${() => setConfirmWipe(false)}>Cancelar</button>
            </div>`}
      </div>

      <div class="tiny" style="text-align:center;padding:10px 0 30px">
        Mi Carnet · contenido v${C.meta?.contentVersion ?? "?"} · funciona sin conexión
      </div>
    </div>`;
}

function Bar({ value, cls = "" }) {
  const v = Math.max(0, Math.min(100, value));
  return html`<div class=${"bar " + cls}><i style=${{ width: v + "%" }}></i></div>`;
}
