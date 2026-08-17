// =========================================================
// MÓDULO: ALINEACIONES
// =========================================================

let aliEquipoActualId = null;
let aliEsStaffDeEquipo = false;
let aliPartidos = [];
let aliJugadores = [];
let aliEquiposById = {};
let aliPartidoActual = null;
let aliSetActual = 1;
let aliAlineacionId = null;
let aliFilas = [];
let aliSlotElegido = null; // 1-6 o "libero"

const ALI_MESES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
const ALI_ZONAS = [
  { pos: 4, fila: "frente", label: "Z4" },
  { pos: 3, fila: "frente", label: "Z3" },
  { pos: 2, fila: "frente", label: "Z2" },
  { pos: 5, fila: "fondo", label: "Z5" },
  { pos: 6, fila: "fondo", label: "Z6" },
  { pos: 1, fila: "fondo", label: "Z1 · Saque" }
];
const ALI_ESTADO = {
  programado: "Programado",
  en_curso: "En curso",
  finalizado: "Finalizado",
  suspendido: "Suspendido"
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("alineaciones-container")) return;

  const session = await requerirSesion();
  if (!session) return;

  await aliCargarCategorias();

  document.getElementById("ali-filtro-categoria").addEventListener("change", aliOnCambioCategoria);
  document.getElementById("ali-filtro-equipo").addEventListener("change", aliOnCambioEquipo);
  document.getElementById("btn-nuevo-partido").addEventListener("click", aliAbrirNuevoPartido);
  document.getElementById("form-ali-partido").addEventListener("submit", aliCrearPartido);
  document.getElementById("btn-ali-volver").addEventListener("click", aliVolverALista);
  document.getElementById("btn-eliminar-partido").addEventListener("click", aliEliminarPartido);
});

async function aliCargarCategorias() {
  const { data, error } = await supabaseClient.from("categoria").select("*").order("nombre");
  const select = document.getElementById("ali-filtro-categoria");
  if (error || !data || data.length === 0) {
    select.innerHTML = `<option value="">No hay categorías cargadas</option>`;
    return;
  }
  select.innerHTML = `<option value="">Elegí una categoría</option>` +
    data.map(c => `<option value="${c.id}">${c.nombre} · ${c.genero === "femenino" ? "Femenino" : "Masculino"}</option>`).join("");
}

async function aliOnCambioCategoria() {
  const categoriaId = document.getElementById("ali-filtro-categoria").value;
  const selectEquipo = document.getElementById("ali-filtro-equipo");
  aliEquipoActualId = null;
  aliRenderPartidos([]);
  document.getElementById("btn-nuevo-partido").style.display = "none";

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
  data.forEach(e => { aliEquiposById[e.id] = e; });
  selectEquipo.innerHTML = `<option value="">Elegí un equipo</option>` +
    data.map(e => `<option value="${e.id}">${e.nombre}</option>`).join("");
}

async function aliOnCambioEquipo() {
  aliEquipoActualId = document.getElementById("ali-filtro-equipo").value || null;
  if (!aliEquipoActualId) {
    aliRenderPartidos([]);
    document.getElementById("btn-nuevo-partido").style.display = "none";
    return;
  }
  await aliDeterminarPermiso(aliEquipoActualId);
  await aliCargarTodo(aliEquipoActualId);
}

async function aliDeterminarPermiso(equipoId) {
  aliEsStaffDeEquipo = false;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { data: perfil } = await supabaseClient.from("perfil").select("rol").eq("id", user.id).single();
  if (!perfil) return;

  if (["admin", "dirigente"].includes(perfil.rol)) {
    aliEsStaffDeEquipo = true;
  } else {
    const { data: staff } = await supabaseClient
      .from("cuerpo_tecnico")
      .select("id")
      .eq("equipo_id", equipoId)
      .eq("perfil_id", user.id)
      .maybeSingle();
    aliEsStaffDeEquipo = !!staff;
  }
  document.getElementById("btn-nuevo-partido").style.display = aliEsStaffDeEquipo ? "inline-block" : "none";
}

async function aliCargarTodo(equipoId) {
  document.getElementById("alineaciones-container").innerHTML = `<div class="empty-state">Cargando partidos…</div>`;

  const [partRes, jugRes] = await Promise.all([
    supabaseClient
      .from("partido")
      .select("*, local:equipo_local_id (id, nombre), visitante:equipo_visitante_id (id, nombre)")
      .or(`equipo_local_id.eq.${equipoId},equipo_visitante_id.eq.${equipoId}`)
      .order("fecha", { ascending: false }),
    supabaseClient
      .from("jugador")
      .select("*, perfil:perfil_id (nombre, apellido, foto_url)")
      .eq("equipo_id", equipoId)
      .eq("activo", true)
      .order("dorsal")
  ]);

  if (partRes.error) {
    document.getElementById("alineaciones-container").innerHTML =
      `<div class="empty-state">No pudimos cargar los partidos: ${aliEsc(partRes.error.message)}</div>`;
    return;
  }

  aliPartidos = partRes.data || [];
  aliJugadores = jugRes.data || [];

  const partidoIds = aliPartidos.map(p => p.id);
  if (partidoIds.length > 0) {
    const { data: alis } = await supabaseClient
      .from("alineacion")
      .select("id, partido_id, set_numero")
      .eq("equipo_id", equipoId)
      .in("partido_id", partidoIds);
    const porPartido = {};
    (alis || []).forEach(a => {
      if (!porPartido[a.partido_id]) porPartido[a.partido_id] = [];
      porPartido[a.partido_id].push(a.set_numero);
    });
    aliPartidos.forEach(p => { p.setsConAlineacion = (porPartido[p.id] || []).sort((a, b) => a - b); });
  }

  aliRenderPartidos(aliPartidos);
}

function aliNombreRival(partido) {
  const somosLocal = partido.equipo_local_id === aliEquipoActualId;
  if (somosLocal) {
    return partido.visitante?.nombre || partido.rival_externo || "Rival";
  }
  return partido.local?.nombre || partido.rival_externo || "Rival";
}

function aliRenderPartidos(lista) {
  const cont = document.getElementById("alineaciones-container");
  if (!aliEquipoActualId) {
    cont.innerHTML = `<div class="empty-state">Elegí una categoría y un equipo para ver sus alineaciones.</div>`;
    return;
  }
  if (!lista || lista.length === 0) {
    cont.innerHTML = `<div class="empty-state">Todavía no hay partidos para este equipo.${aliEsStaffDeEquipo ? " Creá uno para armar la cancha." : ""}</div>`;
    return;
  }

  cont.innerHTML = `<div class="event-list">${lista.map(p => {
    const fecha = new Date(p.fecha);
    const lado = p.equipo_local_id === aliEquipoActualId ? "Local" : "Visitante";
    const sets = (p.setsConAlineacion || []).length
      ? `Alineación: set ${(p.setsConAlineacion || []).join(", ")}`
      : "Sin alineación cargada";
    return `
      <div class="event-card" onclick="aliAbrirEditor('${p.id}')">
        <div class="event-date">
          <div class="day">${fecha.getDate()}</div>
          <div class="month">${ALI_MESES[fecha.getMonth()]}</div>
        </div>
        <div class="event-info">
          <div class="event-title">vs ${aliEsc(aliNombreRival(p))}</div>
          <div class="event-meta">${aliFormatearFecha(p.fecha)}${p.lugar ? " · " + aliEsc(p.lugar) : ""} · ${lado}</div>
          <div class="event-meta">${aliEsc(sets)}</div>
        </div>
        <span class="event-type ${p.estado === "finalizado" ? "entrenamiento" : p.estado === "en_curso" ? "reunion" : "otro"}">${ALI_ESTADO[p.estado] || p.estado}</span>
      </div>
    `;
  }).join("")}</div>`;
}

function aliFormatearFecha(iso) {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return `${d.getDate()} ${ALI_MESES[d.getMonth()]} · ${hora} hs`;
}

async function aliAbrirNuevoPartido() {
  document.getElementById("error-ali-partido").classList.remove("show");
  document.getElementById("form-ali-partido").reset();

  const { data } = await supabaseClient.from("equipo").select("id, nombre").order("nombre");
  const select = document.getElementById("ali-partido-rival");
  const otros = (data || []).filter(e => e.id !== aliEquipoActualId);
  select.innerHTML = `<option value="">Rival externo (escribir abajo)</option>` +
    otros.map(e => `<option value="${e.id}">${aliEsc(e.nombre)}</option>`).join("");

  abrirModal("overlay-ali-partido");
}

async function aliCrearPartido(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-ali-partido");
  errEl.classList.remove("show");

  if (!aliEquipoActualId) {
    errEl.textContent = "Elegí primero un equipo arriba.";
    errEl.classList.add("show");
    return;
  }

  const lado = document.getElementById("ali-partido-lado").value;
  const rivalId = document.getElementById("ali-partido-rival").value || null;
  const rivalNombre = document.getElementById("ali-partido-rival-nombre").value.trim() || null;
  if (!rivalId && !rivalNombre) {
    errEl.textContent = "Elegí un rival del club o escribí el nombre del rival externo.";
    errEl.classList.add("show");
    return;
  }

  const payload = {
    fecha: new Date(document.getElementById("ali-partido-fecha").value).toISOString(),
    lugar: document.getElementById("ali-partido-lugar").value.trim() || null,
    estado: "programado",
    rival_externo: rivalId ? null : rivalNombre
  };
  if (lado === "local") {
    payload.equipo_local_id = aliEquipoActualId;
    payload.equipo_visitante_id = rivalId;
  } else {
    payload.equipo_visitante_id = aliEquipoActualId;
    payload.equipo_local_id = rivalId;
  }

  const { error } = await supabaseClient.from("partido").insert(payload);
  if (error) {
    errEl.textContent = "No se pudo crear: " + error.message + (error.message.includes("rival_externo") ? " Ejecutá fix_alineacion.sql en Supabase." : "");
    errEl.classList.add("show");
    return;
  }

  cerrarModal("overlay-ali-partido");
  await aliCargarTodo(aliEquipoActualId);
}

async function aliAbrirEditor(partidoId) {
  const partido = aliPartidos.find(p => p.id === partidoId);
  if (!partido) return;
  aliPartidoActual = partido;
  aliSetActual = 1;

  document.getElementById("ali-lista-wrap").style.display = "none";
  document.getElementById("ali-editor-wrap").style.display = "block";
  document.getElementById("btn-eliminar-partido").style.display = aliEsStaffDeEquipo ? "inline-block" : "none";
  document.getElementById("ali-editor-titulo").textContent = `vs ${aliNombreRival(partido)}`;
  const lado = partido.equipo_local_id === aliEquipoActualId ? "Local" : "Visitante";
  document.getElementById("ali-editor-meta").textContent =
    `${aliFormatearFecha(partido.fecha)}${partido.lugar ? " · " + partido.lugar : ""} · ${lado} · ${ALI_ESTADO[partido.estado] || ""}`;

  aliRenderTabsSet();
  await aliCargarSet(1);
}

function aliVolverALista() {
  aliPartidoActual = null;
  aliAlineacionId = null;
  aliFilas = [];
  document.getElementById("ali-editor-wrap").style.display = "none";
  document.getElementById("ali-lista-wrap").style.display = "block";
  if (aliEquipoActualId) aliCargarTodo(aliEquipoActualId);
}

function aliRenderTabsSet() {
  document.getElementById("ali-sets").innerHTML = [1, 2, 3, 4, 5].map(n =>
    `<button type="button" class="module-tab${n === aliSetActual ? " active" : ""}" onclick="aliCargarSet(${n})">Set ${n}</button>`
  ).join("");
}

async function aliCargarSet(n) {
  aliSetActual = n;
  aliRenderTabsSet();
  document.getElementById("error-alineacion").classList.remove("show");
  document.getElementById("ali-cancha").innerHTML = `<div class="empty-state">Cargando set ${n}…</div>`;

  const { data, error } = await supabaseClient
    .from("alineacion")
    .select("*, alineacion_jugador (*, jugador:jugador_id (id, dorsal, posicion, perfil:perfil_id (nombre, apellido)))")
    .eq("partido_id", aliPartidoActual.id)
    .eq("equipo_id", aliEquipoActualId)
    .eq("set_numero", n)
    .maybeSingle();

  if (error) {
    document.getElementById("ali-cancha").innerHTML =
      `<div class="empty-state">No pudimos cargar la alineación: ${aliEsc(error.message)}<br>Si el error menciona equipo_id, ejecutá fix_alineacion.sql en Supabase.</div>`;
    return;
  }

  aliAlineacionId = data?.id || null;
  aliFilas = (data?.alineacion_jugador || []).map(f => ({
    jugador_id: f.jugador_id,
    posicion_cancha: f.posicion_cancha,
    es_titular: f.es_titular,
    es_libero: f.es_libero,
    jugador: f.jugador
  }));

  aliRenderToolbar();
  aliRenderCancha();
}

function aliRenderToolbar() {
  const bar = document.getElementById("ali-toolbar");
  if (!aliEsStaffDeEquipo) {
    bar.innerHTML = `<span class="conv-pill">Solo lectura</span>`;
    return;
  }
  bar.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm" onclick="aliCopiarSetAnterior()" ${aliSetActual === 1 ? "disabled" : ""}>Copiar set anterior</button>
    <button type="button" class="btn btn-ghost btn-sm" onclick="aliVaciarSet()" ${aliFilas.length === 0 ? "disabled" : ""}>Vaciar este set</button>
  `;
}

function aliJugadorEnZona(pos) {
  return aliFilas.find(f => f.posicion_cancha === pos && !f.es_libero) || null;
}

function aliLibero() {
  return aliFilas.find(f => f.es_libero) || null;
}

function aliNombreJugador(fila) {
  const p = fila?.jugador?.perfil;
  if (!p) {
    const j = aliJugadores.find(x => x.id === fila?.jugador_id);
    return j ? `${j.perfil?.nombre ?? ""} ${j.perfil?.apellido ?? ""}`.trim() : "Jugador/a";
  }
  return `${p.nombre} ${p.apellido}`.trim();
}

function aliDorsal(fila) {
  return fila?.jugador?.dorsal ?? aliJugadores.find(j => j.id === fila?.jugador_id)?.dorsal ?? "–";
}

function aliPosicion(fila) {
  const pos = fila?.jugador?.posicion ?? aliJugadores.find(j => j.id === fila?.jugador_id)?.posicion;
  return pos ? capitalizar(pos) : "";
}

function aliRenderCancha() {
  const slots = ALI_ZONAS.map((z, i) => {
    const fila = aliJugadorEnZona(z.pos);
    const extraLinea = i === 3 ? `<div class="ali-attack-line" style="grid-column:1/-1"></div>` : "";
    const inner = fila
      ? `<span class="zona">${z.label}</span><span class="dorsal">${aliDorsal(fila)}</span><span class="nombre">${aliEsc(aliNombreJugador(fila))}</span><span class="rol">${aliEsc(aliPosicion(fila))}</span>`
      : `<span class="zona">${z.label}</span><span class="hint">${aliEsStaffDeEquipo ? "Tocar para asignar" : "Vacío"}</span>`;
    return `${i === 3 ? extraLinea : ""}
      <button type="button" class="ali-slot${fila ? " filled" : " empty"}" ${aliEsStaffDeEquipo ? `onclick="aliAbrirPicker(${z.pos})"` : "disabled"}>
        ${inner}
      </button>`;
  }).join("");

  const lib = aliLibero();
  const idsEnCancha = new Set(aliFilas.map(f => f.jugador_id));
  const banco = aliJugadores.filter(j => !idsEnCancha.has(j.id));

  document.getElementById("ali-cancha").innerHTML = `
    <div class="ali-court-wrap">
      <div class="ali-net-label">Red</div>
      <div class="ali-net"></div>
      <div class="ali-court">
        <div class="ali-grid">${slots}</div>
      </div>
    </div>
    <div class="ali-libero">
      <div class="section-title" style="margin-top:0">Líbero</div>
      <button type="button" class="ali-libero-slot" ${aliEsStaffDeEquipo ? `onclick="aliAbrirPicker('libero')"` : "disabled"}>
        <span class="tag-libero">Líbero</span>
        <span>${lib ? `#${aliDorsal(lib)} ${aliEsc(aliNombreJugador(lib))}` : (aliEsStaffDeEquipo ? "Tocar para elegir" : "Sin asignar")}</span>
      </button>
    </div>
    <div class="ali-banco">
      <div class="section-title">Banco</div>
      <div class="ali-banco-list">
        ${banco.length === 0
          ? `<span class="conv-pill">Nadie en el banco</span>`
          : banco.map(j => `
              <button type="button" class="ali-banco-chip" ${aliEsStaffDeEquipo ? `onclick="aliAbrirPickerDesdeBanco('${j.id}')"` : "disabled"}>
                #${j.dorsal ?? "–"} ${aliEsc(`${j.perfil?.nombre ?? ""} ${j.perfil?.apellido ?? ""}`.trim())}
              </button>
            `).join("")}
      </div>
    </div>
  `;
}

function aliAbrirPicker(slot) {
  if (!aliEsStaffDeEquipo) return;
  aliSlotElegido = slot;
  const titulo = slot === "libero" ? "Elegir líbero" : `Elegir jugador para ${ALI_ZONAS.find(z => z.pos === slot)?.label || "zona"}`;
  document.getElementById("ali-picker-titulo").textContent = titulo;

  const ocupante = slot === "libero" ? aliLibero() : aliJugadorEnZona(slot);
  const idsOcupados = new Set(
    aliFilas
      .filter(f => (slot === "libero" ? !f.es_libero : f.posicion_cancha !== slot))
      .map(f => f.jugador_id)
  );

  const disponibles = aliJugadores.filter(j => !idsOcupados.has(j.id));
  const lista = document.getElementById("ali-picker-lista");
  lista.innerHTML = `
    ${ocupante ? `<button type="button" class="ali-picker-item" onclick="aliQuitarDelSlot()"><span class="dorsal">✕</span><span>Quitar de esta zona</span></button>` : ""}
    ${disponibles.map(j => `
      <button type="button" class="ali-picker-item" onclick="aliAsignarJugador('${j.id}')">
        <span class="dorsal">${j.dorsal ?? "–"}</span>
        <span>
          <strong>${aliEsc(`${j.perfil?.nombre ?? ""} ${j.perfil?.apellido ?? ""}`.trim())}</strong>
          <div class="event-meta">${aliEsc(capitalizar(j.posicion || "sin posición"))}</div>
        </span>
      </button>
    `).join("")}
    ${disponibles.length === 0 && !ocupante ? `<div class="empty-state">No hay jugadores disponibles.</div>` : ""}
  `;
  abrirModal("overlay-ali-jugador");
}

function aliAbrirPickerDesdeBanco(jugadorId) {
  aliSlotElegido = null;
  const j = aliJugadores.find(x => x.id === jugadorId);
  document.getElementById("ali-picker-titulo").textContent = j
    ? `¿Dónde entra ${j.perfil?.nombre ?? ""}?`
    : "Elegir zona";
  document.getElementById("ali-picker-lista").innerHTML = `
    ${ALI_ZONAS.map(z => {
      const ocup = aliJugadorEnZona(z.pos);
      return `<button type="button" class="ali-picker-item" onclick="aliSlotElegido=${z.pos};aliAsignarJugador('${jugadorId}')">
        <span class="dorsal">${z.pos}</span>
        <span>${z.label}${ocup ? " · ahora: " + aliEsc(aliNombreJugador(ocup)) : ""}</span>
      </button>`;
    }).join("")}
    <button type="button" class="ali-picker-item" onclick="aliSlotElegido='libero';aliAsignarJugador('${jugadorId}')">
      <span class="dorsal">L</span><span>Líbero</span>
    </button>
  `;
  abrirModal("overlay-ali-jugador");
}

async function aliAsignarJugador(jugadorId) {
  if (aliSlotElegido == null) return;
  const jugador = aliJugadores.find(j => j.id === jugadorId);
  aliFilas = aliFilas.filter(f => f.jugador_id !== jugadorId);

  if (aliSlotElegido === "libero") {
    aliFilas = aliFilas.filter(f => !f.es_libero);
    aliFilas.push({
      jugador_id: jugadorId,
      posicion_cancha: null,
      es_titular: false,
      es_libero: true,
      jugador
    });
  } else {
    const pos = Number(aliSlotElegido);
    aliFilas = aliFilas.filter(f => f.posicion_cancha !== pos || f.es_libero);
    aliFilas.push({
      jugador_id: jugadorId,
      posicion_cancha: pos,
      es_titular: true,
      es_libero: false,
      jugador
    });
  }

  cerrarModal("overlay-ali-jugador");
  await aliPersistir();
}

async function aliQuitarDelSlot() {
  if (aliSlotElegido === "libero") {
    aliFilas = aliFilas.filter(f => !f.es_libero);
  } else {
    const pos = Number(aliSlotElegido);
    aliFilas = aliFilas.filter(f => f.posicion_cancha !== pos || f.es_libero);
  }
  cerrarModal("overlay-ali-jugador");
  await aliPersistir();
}

async function aliAsegurarAlineacion() {
  if (aliAlineacionId) return aliAlineacionId;
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { data, error } = await supabaseClient
    .from("alineacion")
    .insert({
      partido_id: aliPartidoActual.id,
      equipo_id: aliEquipoActualId,
      set_numero: aliSetActual,
      created_by: user.id
    })
    .select("id")
    .single();

  if (error) {
    const { data: existente } = await supabaseClient
      .from("alineacion")
      .select("id")
      .eq("partido_id", aliPartidoActual.id)
      .eq("equipo_id", aliEquipoActualId)
      .eq("set_numero", aliSetActual)
      .maybeSingle();
    if (existente) {
      aliAlineacionId = existente.id;
      return existente.id;
    }
    throw error;
  }
  aliAlineacionId = data.id;
  return aliAlineacionId;
}

async function aliPersistir() {
  const errEl = document.getElementById("error-alineacion");
  errEl.classList.remove("show");
  try {
    const id = await aliAsegurarAlineacion();
    const { error: errDel } = await supabaseClient.from("alineacion_jugador").delete().eq("alineacion_id", id);
    if (errDel) throw errDel;
    if (aliFilas.length > 0) {
      const { error: errIns } = await supabaseClient.from("alineacion_jugador").insert(
        aliFilas.map(f => ({
          alineacion_id: id,
          jugador_id: f.jugador_id,
          posicion_cancha: f.posicion_cancha,
          es_titular: !!f.es_titular,
          es_libero: !!f.es_libero
        }))
      );
      if (errIns) throw errIns;
    }
    aliRenderToolbar();
    aliRenderCancha();
  } catch (err) {
    errEl.textContent = "No se pudo guardar: " + err.message;
    errEl.classList.add("show");
  }
}

async function aliCopiarSetAnterior() {
  if (aliSetActual <= 1) return;
  const { data, error } = await supabaseClient
    .from("alineacion")
    .select("alineacion_jugador (*, jugador:jugador_id (id, dorsal, posicion, perfil:perfil_id (nombre, apellido)))")
    .eq("partido_id", aliPartidoActual.id)
    .eq("equipo_id", aliEquipoActualId)
    .eq("set_numero", aliSetActual - 1)
    .maybeSingle();

  if (error || !data) {
    alert("No hay alineación en el set anterior.");
    return;
  }
  aliFilas = (data.alineacion_jugador || []).map(f => ({
    jugador_id: f.jugador_id,
    posicion_cancha: f.posicion_cancha,
    es_titular: f.es_titular,
    es_libero: f.es_libero,
    jugador: f.jugador
  }));
  await aliPersistir();
}

async function aliVaciarSet() {
  if (!confirm("¿Vaciar la alineación de este set?")) return;
  aliFilas = [];
  await aliPersistir();
}

async function aliEliminarPartido() {
  if (!aliPartidoActual) return;
  if (!confirm(`¿Eliminar el partido vs ${aliNombreRival(aliPartidoActual)}? Se borran las alineaciones.`)) return;
  const { error } = await supabaseClient.from("partido").delete().eq("id", aliPartidoActual.id);
  if (error) { alert("No se pudo eliminar: " + error.message); return; }
  aliVolverALista();
}

function aliEsc(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
