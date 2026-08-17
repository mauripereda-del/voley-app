// =========================================================
// MÓDULO: ESTADÍSTICAS Y LIVE STATS
// =========================================================

let estEquipoActualId = null;
let estEsStaffDeEquipo = false;
let estJugadores = [];
let estPartidos = [];
let estAccionesEquipo = [];
let estTab = "plantel";
let estPartido = null;
let estSetActual = 1;
let estSets = [];
let estAcciones = [];
let estJugadorSel = null;
let estAccionSel = null;
let estChannel = null;

const EST_MESES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
const EST_ACCIONES = [
  { id: "saque", label: "Saque" },
  { id: "ataque", label: "Ataque" },
  { id: "bloqueo", label: "Bloqueo" },
  { id: "recepcion", label: "Recepción" },
  { id: "defensa", label: "Defensa" },
  { id: "asistencia", label: "Asistencia" }
];
const EST_RESULTADOS = [
  { id: "punto", label: "Punto" },
  { id: "error", label: "Error" },
  { id: "continua", label: "Continúa" }
];

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("est-panel-plantel")) return;

  const session = await requerirSesion();
  if (!session) return;

  await estCargarCategorias();

  document.getElementById("est-filtro-categoria").addEventListener("change", estOnCambioCategoria);
  document.getElementById("est-filtro-equipo").addEventListener("change", estOnCambioEquipo);
  document.getElementById("btn-est-volver").addEventListener("click", estVolver);
  document.getElementById("btn-est-cerrar-set").addEventListener("click", estCerrarSet);
  document.getElementById("btn-est-deshacer").addEventListener("click", estDeshacer);
  document.querySelectorAll("[data-est-tab]").forEach(btn => {
    btn.addEventListener("click", () => estCambiarTab(btn.dataset.estTab));
  });
});

function estCambiarTab(tab) {
  estTab = tab;
  document.querySelectorAll("[data-est-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.estTab === tab);
  });
  document.getElementById("est-panel-plantel").style.display = tab === "plantel" ? "block" : "none";
  document.getElementById("est-panel-partidos").style.display = tab === "partidos" ? "block" : "none";
}

async function estCargarCategorias() {
  const { data, error } = await supabaseClient.from("categoria").select("*").order("nombre");
  const select = document.getElementById("est-filtro-categoria");
  if (error || !data || data.length === 0) {
    select.innerHTML = `<option value="">No hay categorías cargadas</option>`;
    return;
  }
  select.innerHTML = `<option value="">Elegí una categoría</option>` +
    data.map(c => `<option value="${c.id}">${c.nombre} · ${c.genero === "femenino" ? "Femenino" : "Masculino"}</option>`).join("");
}

async function estOnCambioCategoria() {
  const categoriaId = document.getElementById("est-filtro-categoria").value;
  const selectEquipo = document.getElementById("est-filtro-equipo");
  estEquipoActualId = null;
  estRenderPlantel();
  estRenderPartidos();

  if (!categoriaId) {
    selectEquipo.innerHTML = `<option value="">Seleccioná una categoría primero</option>`;
    return;
  }

  const { data, error } = await supabaseClient
    .from("equipo")
    .select("*")
    .eq("categoria_id", categoriaId)
    .order("nombre");

  if (error || !data || data.length === 0) {
    selectEquipo.innerHTML = `<option value="">No hay equipos en esta categoría</option>`;
    return;
  }
  selectEquipo.innerHTML = `<option value="">Elegí un equipo</option>` +
    data.map(e => `<option value="${e.id}">${e.nombre}</option>`).join("");
}

async function estOnCambioEquipo() {
  estEquipoActualId = document.getElementById("est-filtro-equipo").value || null;
  if (!estEquipoActualId) {
    estJugadores = [];
    estPartidos = [];
    estAccionesEquipo = [];
    estRenderPlantel();
    estRenderPartidos();
    return;
  }
  await estDeterminarPermiso(estEquipoActualId);
  await estCargarTodo(estEquipoActualId);
}

async function estDeterminarPermiso(equipoId) {
  estEsStaffDeEquipo = false;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;
  const { data: perfil } = await supabaseClient.from("perfil").select("rol").eq("id", user.id).single();
  if (!perfil) return;
  if (["admin", "dirigente"].includes(perfil.rol)) {
    estEsStaffDeEquipo = true;
    return;
  }
  const { data: staff } = await supabaseClient
    .from("cuerpo_tecnico")
    .select("id")
    .eq("equipo_id", equipoId)
    .eq("perfil_id", user.id)
    .maybeSingle();
  estEsStaffDeEquipo = !!staff;
}

async function estCargarTodo(equipoId) {
  document.getElementById("est-panel-plantel").innerHTML = `<div class="empty-state">Cargando estadísticas…</div>`;
  document.getElementById("est-panel-partidos").innerHTML = `<div class="empty-state">Cargando partidos…</div>`;

  const [jugRes, partRes] = await Promise.all([
    supabaseClient.from("jugador").select("*, perfil:perfil_id (nombre, apellido)").eq("equipo_id", equipoId).eq("activo", true).order("dorsal"),
    supabaseClient
      .from("partido")
      .select("*, local:equipo_local_id (id, nombre), visitante:equipo_visitante_id (id, nombre)")
      .or(`equipo_local_id.eq.${equipoId},equipo_visitante_id.eq.${equipoId}`)
      .order("fecha", { ascending: false })
  ]);

  estJugadores = jugRes.data || [];
  estPartidos = partRes.data || [];

  const ids = estPartidos.map(p => p.id);
  if (ids.length === 0) {
    estAccionesEquipo = [];
    estRenderPlantel();
    estRenderPartidos();
    return;
  }

  const { data: acc, error } = await supabaseClient
    .from("accion_partido")
    .select("*")
    .in("partido_id", ids);

  if (error) {
    document.getElementById("est-panel-plantel").innerHTML =
      `<div class="empty-state">No pudimos cargar las acciones: ${estEsc(error.message)}</div>`;
    return;
  }
  estAccionesEquipo = acc || [];
  estRenderPlantel();
  estRenderPartidos();
}

function estAgg(acciones) {
  const map = {};
  (acciones || []).forEach(a => {
    if (!a.jugador_id) return;
    if (!map[a.jugador_id]) {
      map[a.jugador_id] = { aces: 0, ataques: 0, bloqueos: 0, asistencias: 0, recepciones: 0, defensas: 0, errores: 0, total: 0 };
    }
    const s = map[a.jugador_id];
    s.total++;
    if (a.resultado === "error") s.errores++;
    if (a.tipo_accion === "saque" && a.resultado === "punto") s.aces++;
    if (a.tipo_accion === "ataque" && a.resultado === "punto") s.ataques++;
    if (a.tipo_accion === "bloqueo" && a.resultado === "punto") s.bloqueos++;
    if (a.tipo_accion === "asistencia" && a.resultado === "punto") s.asistencias++;
    if (a.tipo_accion === "recepcion") s.recepciones++;
    if (a.tipo_accion === "defensa") s.defensas++;
  });
  return map;
}

function estRenderPlantel() {
  const panel = document.getElementById("est-panel-plantel");
  if (!estEquipoActualId) {
    panel.innerHTML = `<div class="empty-state">Elegí una categoría y un equipo para ver estadísticas.</div>`;
    return;
  }
  const ids = new Set(estJugadores.map(j => j.id));
  const stats = estAgg(estAccionesEquipo.filter(a => ids.has(a.jugador_id)));
  const filas = [...estJugadores].sort((a, b) => {
    const sa = stats[a.id] || {};
    const sb = stats[b.id] || {};
    return ((sb.ataques || 0) + (sb.aces || 0) + (sb.bloqueos || 0)) - ((sa.ataques || 0) + (sa.aces || 0) + (sa.bloqueos || 0));
  });

  if (filas.length === 0) {
    panel.innerHTML = `<div class="empty-state">No hay jugadores activos en este plantel.</div>`;
    return;
  }

  panel.innerHTML = `
    <p class="event-meta" style="margin:0 0 0.75rem">Totales de todos los partidos de este equipo. Punto = acción ganadora · Error = punto para el rival.</p>
    <div class="standings-wrap">
      <table class="standings">
        <thead>
          <tr>
            <th class="equipo">Jugador</th>
            <th>Aces</th><th>Ataq.</th><th>Bloq.</th><th>Asist.</th><th>Recep.</th><th>Def.</th><th>Err.</th><th>Acc.</th>
          </tr>
        </thead>
        <tbody>
          ${filas.map(j => {
            const s = stats[j.id] || { aces: 0, ataques: 0, bloqueos: 0, asistencias: 0, recepciones: 0, defensas: 0, errores: 0, total: 0 };
            return `<tr>
              <td class="equipo">#${j.dorsal ?? "–"} ${estEsc(`${j.perfil?.nombre ?? ""} ${j.perfil?.apellido ?? ""}`.trim())}</td>
              <td>${s.aces}</td><td>${s.ataques}</td><td>${s.bloqueos}</td><td>${s.asistencias}</td>
              <td>${s.recepciones}</td><td>${s.defensas}</td><td>${s.errores}</td><td class="pts">${s.total}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function estNombreRival(p) {
  const somosLocal = p.equipo_local_id === estEquipoActualId;
  if (somosLocal) return p.visitante?.nombre || p.rival_externo || "Rival";
  return p.local?.nombre || p.rival_externo || "Rival";
}

function estRenderPartidos() {
  const panel = document.getElementById("est-panel-partidos");
  if (!estEquipoActualId) {
    panel.innerHTML = `<div class="empty-state">Elegí una categoría y un equipo para ver partidos.</div>`;
    return;
  }
  if (estPartidos.length === 0) {
    panel.innerHTML = `<div class="empty-state">No hay partidos. Crealos en Campeonatos o Alineaciones.</div>`;
    return;
  }

  const conteo = {};
  estAccionesEquipo.forEach(a => { conteo[a.partido_id] = (conteo[a.partido_id] || 0) + 1; });

  panel.innerHTML = `<div class="event-list">${estPartidos.map(p => {
    const d = new Date(p.fecha);
    const n = conteo[p.id] || 0;
    return `
      <div class="event-card" onclick="estAbrirLive('${p.id}')">
        <div class="event-date">
          <div class="day">${d.getDate()}</div>
          <div class="month">${EST_MESES[d.getMonth()]}</div>
        </div>
        <div class="event-info">
          <div class="event-title">vs ${estEsc(estNombreRival(p))}</div>
          <div class="event-meta">${p.sets_local ?? 0}–${p.sets_visitante ?? 0} · ${n} acciones cargadas</div>
        </div>
        <span class="event-type ${p.estado === "finalizado" ? "entrenamiento" : p.estado === "en_curso" ? "reunion" : "otro"}">${capitalizar(p.estado)}</span>
      </div>
    `;
  }).join("")}</div>`;
}

async function estAbrirLive(partidoId) {
  const partido = estPartidos.find(p => p.id === partidoId);
  if (!partido) return;
  estPartido = partido;
  estSetActual = 1;
  estJugadorSel = null;
  estAccionSel = null;

  document.getElementById("est-lista-wrap").style.display = "none";
  document.getElementById("est-live-wrap").style.display = "block";
  document.getElementById("btn-est-cerrar-set").style.display = estEsStaffDeEquipo ? "inline-block" : "none";
  document.getElementById("btn-est-deshacer").style.display = estEsStaffDeEquipo ? "inline-block" : "none";

  estSuscribir(partidoId);
  await estCargarLive();
}

function estVolver() {
  if (estChannel) {
    supabaseClient.removeChannel(estChannel);
    estChannel = null;
  }
  estPartido = null;
  document.getElementById("est-live-wrap").style.display = "none";
  document.getElementById("est-lista-wrap").style.display = "block";
  if (estEquipoActualId) estCargarTodo(estEquipoActualId);
}

function estSuscribir(partidoId) {
  if (estChannel) supabaseClient.removeChannel(estChannel);
  estChannel = supabaseClient
    .channel(`estats-${partidoId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "accion_partido", filter: `partido_id=eq.${partidoId}` }, () => {
      estCargarLive();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "set_partido", filter: `partido_id=eq.${partidoId}` }, () => {
      estCargarLive();
    })
    .subscribe();
}

async function estCargarLive() {
  if (!estPartido) return;
  document.getElementById("error-estadisticas").classList.remove("show");

  const [setRes, accRes, partRes] = await Promise.all([
    supabaseClient.from("set_partido").select("*").eq("partido_id", estPartido.id).order("set_numero"),
    supabaseClient.from("accion_partido").select("*").eq("partido_id", estPartido.id).order("registrado_at", { ascending: false }).limit(200),
    supabaseClient.from("partido").select("*, local:equipo_local_id (id, nombre), visitante:equipo_visitante_id (id, nombre)").eq("id", estPartido.id).single()
  ]);

  if (partRes.data) {
    estPartido = partRes.data;
    const idx = estPartidos.findIndex(p => p.id === estPartido.id);
    if (idx >= 0) estPartidos[idx] = estPartido;
  }
  estSets = setRes.data || [];
  estAcciones = accRes.data || [];

  if (!estSets.find(s => s.set_numero === estSetActual) && estEsStaffDeEquipo) {
    await estAsegurarSet(estSetActual);
    const { data } = await supabaseClient.from("set_partido").select("*").eq("partido_id", estPartido.id).order("set_numero");
    estSets = data || [];
  }

  estRenderMarcador();
  estRenderSets();
  estRenderLiveCuerpo();
}

async function estAsegurarSet(n) {
  const { data } = await supabaseClient
    .from("set_partido")
    .select("id")
    .eq("partido_id", estPartido.id)
    .eq("set_numero", n)
    .maybeSingle();
  if (data) return data.id;
  const { data: creado, error } = await supabaseClient
    .from("set_partido")
    .insert({ partido_id: estPartido.id, set_numero: n, puntos_local: 0, puntos_visitante: 0 })
    .select("id")
    .single();
  if (error) throw error;
  return creado.id;
}

function estSetRow(n) {
  return estSets.find(s => s.set_numero === n) || { puntos_local: 0, puntos_visitante: 0, ganador: null, set_numero: n };
}

function estSomosLocal() {
  return estPartido?.equipo_local_id === estEquipoActualId;
}

function estRenderMarcador() {
  const set = estSetRow(estSetActual);
  const localNom = estPartido.local?.nombre || "Local";
  const visNom = estPartido.visitante?.nombre || estPartido.rival_externo || "Visitante";
  document.getElementById("est-marcador").innerHTML = `
    <div class="est-board">
      <div class="side">
        <div class="name">${estEsc(localNom)}</div>
        <div class="pts">${set.puntos_local ?? 0}</div>
        <div class="sets">Sets ${estPartido.sets_local ?? 0}</div>
      </div>
      <div class="vs">SET ${estSetActual}</div>
      <div class="side">
        <div class="name">${estEsc(visNom)}</div>
        <div class="pts">${set.puntos_visitante ?? 0}</div>
        <div class="sets">Sets ${estPartido.sets_visitante ?? 0}</div>
      </div>
    </div>
  `;
}

function estRenderSets() {
  document.getElementById("est-sets").innerHTML = [1, 2, 3, 4, 5].map(n => {
    const s = estSetRow(n);
    const extra = s.ganador ? ` (${s.puntos_local}-${s.puntos_visitante})` : "";
    return `<button type="button" class="module-tab${n === estSetActual ? " active" : ""}" onclick="estCambiarSet(${n})">Set ${n}${extra}</button>`;
  }).join("");
}

async function estCambiarSet(n) {
  estSetActual = n;
  estJugadorSel = null;
  estAccionSel = null;
  await estCargarLive();
}

function estNombreJugador(id) {
  const j = estJugadores.find(x => x.id === id);
  return j ? `${j.perfil?.nombre ?? ""} ${j.perfil?.apellido ?? ""}`.trim() : "Jugador/a";
}

function estDorsal(id) {
  return estJugadores.find(x => x.id === id)?.dorsal ?? "–";
}

function estRenderLiveCuerpo() {
  const delSet = estAcciones.filter(a => a.set_numero === estSetActual);
  const stats = estAgg(delSet.filter(a => estJugadores.some(j => j.id === a.jugador_id)));
  const setCerrado = !!estSetRow(estSetActual).ganador;

  const jugadoresHtml = `<div class="est-players">${estJugadores.map(j => `
    <button type="button" class="est-player${estJugadorSel === j.id ? " active" : ""}" ${estEsStaffDeEquipo && !setCerrado ? `onclick="estElegirJugador('${j.id}')"` : "disabled"}>
      <div class="dorsal">#${j.dorsal ?? "–"}</div>
      <div class="nm">${estEsc(`${j.perfil?.nombre ?? ""} ${j.perfil?.apellido ?? ""}`.trim())}</div>
    </button>
  `).join("")}</div>`;

  const padStaff = estEsStaffDeEquipo && !setCerrado ? `
    <div class="section-title" style="margin-top:0">1. Jugador · 2. Acción · 3. Resultado</div>
    ${jugadoresHtml}
    <div class="est-actions">${EST_ACCIONES.map(a => `
      <button type="button" class="chip-btn ${a.id}${estAccionSel === a.id ? " active justificado" : ""}" onclick="estElegirAccion('${a.id}')">${a.label}</button>
    `).join("")}</div>
    <div class="est-results">${EST_RESULTADOS.map(r => `
      <button type="button" class="btn ${r.id === "punto" ? "btn-primary" : r.id === "error" ? "btn-danger" : "btn-ghost"} btn-sm" onclick="estRegistrar('${r.id}')">${r.label}</button>
    `).join("")}</div>
  ` : `${setCerrado ? `<p class="event-meta">Este set ya está cerrado.</p>` : ""}`;

  const log = delSet.slice(0, 12).map(a => {
    const tipo = EST_ACCIONES.find(x => x.id === a.tipo_accion)?.label || a.tipo_accion;
    const res = EST_RESULTADOS.find(x => x.id === a.resultado)?.label || a.resultado;
    return `<div class="est-log-item">
      <span>#${estDorsal(a.jugador_id)} ${estEsc(estNombreJugador(a.jugador_id))} · ${tipo}</span>
      <span class="conv-pill ${a.resultado === "punto" ? "presente" : a.resultado === "error" ? "ausente" : ""}">${res}</span>
    </div>`;
  }).join("");

  document.getElementById("est-live-cuerpo").innerHTML = `
    ${padStaff}
    <div class="section-title">Acciones del set</div>
    <div class="est-log">${log || `<div class="empty-state" style="padding:1rem">Todavía no hay acciones en este set.</div>`}</div>
    <div class="section-title">Estadísticas de este partido</div>
    ${estTablaJugadores(stats)}
  `;
}

function estTablaJugadores(stats) {
  const filas = estJugadores.filter(j => stats[j.id]);
  if (filas.length === 0) return `<div class="empty-state" style="padding:1rem">Sin datos todavía.</div>`;
  return `<div class="standings-wrap"><table class="standings">
    <thead><tr><th class="equipo">Jugador</th><th>Aces</th><th>Ataq.</th><th>Bloq.</th><th>Asist.</th><th>Err.</th></tr></thead>
    <tbody>${filas.map(j => {
      const s = stats[j.id];
      return `<tr><td class="equipo">#${j.dorsal ?? "–"} ${estEsc(estNombreJugador(j.id))}</td>
        <td>${s.aces}</td><td>${s.ataques}</td><td>${s.bloqueos}</td><td>${s.asistencias}</td><td>${s.errores}</td></tr>`;
    }).join("")}</tbody>
  </table></div>`;
}

function estElegirJugador(id) { estJugadorSel = id; estRenderLiveCuerpo(); }
function estElegirAccion(id) { estAccionSel = id; estRenderLiveCuerpo(); }

async function estRegistrar(resultado) {
  const errEl = document.getElementById("error-estadisticas");
  errEl.classList.remove("show");
  if (!estEsStaffDeEquipo) return;
  if (!estJugadorSel || !estAccionSel) {
    errEl.textContent = "Elegí primero un jugador y una acción.";
    errEl.classList.add("show");
    return;
  }
  if (estSetRow(estSetActual).ganador) {
    errEl.textContent = "Este set ya está cerrado.";
    errEl.classList.add("show");
    return;
  }

  try {
    await estAsegurarSet(estSetActual);
    const { error } = await supabaseClient.from("accion_partido").insert({
      partido_id: estPartido.id,
      set_numero: estSetActual,
      jugador_id: estJugadorSel,
      tipo_accion: estAccionSel,
      resultado
    });
    if (error) throw error;

    if (resultado === "punto" || resultado === "error") {
      await estSumarPunto(resultado === "punto");
    }
    if (estPartido.estado === "programado") {
      await supabaseClient.from("partido").update({ estado: "en_curso" }).eq("id", estPartido.id);
    }
    estAccionSel = null;
    await estCargarLive();
  } catch (err) {
    errEl.textContent = "No se pudo registrar: " + err.message;
    errEl.classList.add("show");
  }
}

async function estSumarPunto(nuestro) {
  const set = estSetRow(estSetActual);
  let pl = set.puntos_local || 0;
  let pv = set.puntos_visitante || 0;
  const somosLocal = estSomosLocal();
  if (nuestro) {
    if (somosLocal) pl++; else pv++;
  } else {
    if (somosLocal) pv++; else pl++;
  }
  await supabaseClient.from("set_partido")
    .update({ puntos_local: pl, puntos_visitante: pv })
    .eq("partido_id", estPartido.id)
    .eq("set_numero", estSetActual);
}

async function estDeshacer() {
  const ultima = estAcciones.find(a => a.set_numero === estSetActual);
  if (!ultima) return;
  if (!confirm("¿Borrar la última acción de este set?")) return;

  const { error } = await supabaseClient.from("accion_partido").delete().eq("id", ultima.id);
  if (error) {
    document.getElementById("error-estadisticas").textContent = "No se pudo deshacer: " + error.message;
    document.getElementById("error-estadisticas").classList.add("show");
    return;
  }

  if ((ultima.resultado === "punto" || ultima.resultado === "error") && !estSetRow(estSetActual).ganador) {
    const set = estSetRow(estSetActual);
    let pl = set.puntos_local || 0;
    let pv = set.puntos_visitante || 0;
    const nuestro = ultima.resultado === "punto";
    const somosLocal = estSomosLocal();
    if (nuestro) {
      if (somosLocal) pl = Math.max(0, pl - 1); else pv = Math.max(0, pv - 1);
    } else {
      if (somosLocal) pv = Math.max(0, pv - 1); else pl = Math.max(0, pl - 1);
    }
    await supabaseClient.from("set_partido").update({ puntos_local: pl, puntos_visitante: pv })
      .eq("partido_id", estPartido.id).eq("set_numero", estSetActual);
  }
  await estCargarLive();
}

async function estCerrarSet() {
  const set = estSetRow(estSetActual);
  if (set.ganador) { alert("Este set ya está cerrado."); return; }
  const pl = set.puntos_local || 0;
  const pv = set.puntos_visitante || 0;
  if (pl === pv) { alert("No se puede cerrar un set empatado."); return; }
  if (!confirm(`¿Cerrar el set ${estSetActual} ${pl}–${pv}?`)) return;

  const ganador = pl > pv ? "local" : "visitante";
  await estAsegurarSet(estSetActual);
  const { error } = await supabaseClient.from("set_partido").update({ ganador, puntos_local: pl, puntos_visitante: pv })
    .eq("partido_id", estPartido.id).eq("set_numero", estSetActual);
  if (error) { alert("No se pudo cerrar: " + error.message); return; }

  const setsL = (estPartido.sets_local || 0) + (ganador === "local" ? 1 : 0);
  const setsV = (estPartido.sets_visitante || 0) + (ganador === "visitante" ? 1 : 0);
  const estado = (setsL >= 3 || setsV >= 3) ? "finalizado" : "en_curso";
  await supabaseClient.from("partido").update({ sets_local: setsL, sets_visitante: setsV, estado }).eq("id", estPartido.id);

  if (estado !== "finalizado" && estSetActual < 5) estSetActual += 1;
  await estCargarLive();
}

function estEsc(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
