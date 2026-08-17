// =========================================================
// MÓDULO: CONVOCATORIAS Y PRESENCIAS
// =========================================================

let convEquipoActualId = null;
let convEsStaffDeEquipo = false;
let convMiJugadorId = null;
let convEventos = [];
let convConvocatorias = [];
let convJugadoresEquipo = [];
let convAsistencias = [];
let convSeleccionada = null;
let convEventoAsistencia = null;
let convTabActual = "convocatorias";

const CONV_MESES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
const CONV_LABELS = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  rechazado: "No puede",
  presente: "Presente",
  ausente: "Ausente",
  tarde: "Tarde",
  justificado: "Justificado"
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("convocatorias-container")) return;

  const session = await requerirSesion();
  if (!session) return;

  await convCargarCategorias();

  document.getElementById("conv-filtro-categoria").addEventListener("change", convOnCambioCategoria);
  document.getElementById("conv-filtro-equipo").addEventListener("change", convOnCambioEquipo);
  document.getElementById("btn-nueva-convocatoria").addEventListener("click", convAbrirNueva);
  document.getElementById("form-conv-nueva").addEventListener("submit", convCrear);
  document.getElementById("btn-eliminar-convocatoria").addEventListener("click", convEliminar);
  document.getElementById("conv-check-todos").addEventListener("change", (e) => {
    document.querySelectorAll(".conv-check-jugador").forEach(cb => { cb.checked = e.target.checked; });
  });
  document.querySelectorAll("[data-conv-tab]").forEach(btn => {
    btn.addEventListener("click", () => convCambiarTab(btn.dataset.convTab));
  });
});

function convCambiarTab(tab) {
  convTabActual = tab;
  document.querySelectorAll("[data-conv-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.convTab === tab);
  });
  document.getElementById("conv-panel-convocatorias").style.display = tab === "convocatorias" ? "block" : "none";
  document.getElementById("conv-panel-presencias").style.display = tab === "presencias" ? "block" : "none";
}

async function convCargarCategorias() {
  const { data, error } = await supabaseClient.from("categoria").select("*").order("nombre");
  const select = document.getElementById("conv-filtro-categoria");
  if (error || !data || data.length === 0) {
    select.innerHTML = `<option value="">No hay categorías cargadas</option>`;
    return;
  }
  select.innerHTML = `<option value="">Elegí una categoría</option>` +
    data.map(c => `<option value="${c.id}">${c.nombre} · ${c.genero === "femenino" ? "Femenino" : "Masculino"}</option>`).join("");
}

async function convOnCambioCategoria() {
  const categoriaId = document.getElementById("conv-filtro-categoria").value;
  const selectEquipo = document.getElementById("conv-filtro-equipo");
  convEquipoActualId = null;
  convRenderConvocatorias([]);
  convRenderPresencias([]);
  document.getElementById("btn-nueva-convocatoria").style.display = "none";

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

async function convOnCambioEquipo() {
  convEquipoActualId = document.getElementById("conv-filtro-equipo").value || null;
  if (!convEquipoActualId) {
    convRenderConvocatorias([]);
    convRenderPresencias([]);
    document.getElementById("btn-nueva-convocatoria").style.display = "none";
    return;
  }
  await convDeterminarPermiso(convEquipoActualId);
  await convCargarTodo(convEquipoActualId);
}

async function convDeterminarPermiso(equipoId) {
  convEsStaffDeEquipo = false;
  convMiJugadorId = null;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { data: perfil } = await supabaseClient.from("perfil").select("rol").eq("id", user.id).single();
  if (!perfil) return;

  if (["admin", "dirigente"].includes(perfil.rol)) {
    convEsStaffDeEquipo = true;
  } else {
    const { data: staff } = await supabaseClient
      .from("cuerpo_tecnico")
      .select("id")
      .eq("equipo_id", equipoId)
      .eq("perfil_id", user.id)
      .maybeSingle();
    convEsStaffDeEquipo = !!staff;
  }

  const { data: yoJugador } = await supabaseClient
    .from("jugador")
    .select("id")
    .eq("equipo_id", equipoId)
    .eq("perfil_id", user.id)
    .maybeSingle();
  convMiJugadorId = yoJugador?.id || null;

  document.getElementById("btn-nueva-convocatoria").style.display = convEsStaffDeEquipo ? "inline-block" : "none";
}

async function convCargarTodo(equipoId) {
  document.getElementById("convocatorias-container").innerHTML = `<div class="empty-state">Cargando convocatorias…</div>`;
  document.getElementById("presencias-container").innerHTML = `<div class="empty-state">Cargando presencias…</div>`;

  const [evRes, jugRes] = await Promise.all([
    supabaseClient.from("evento").select("*").eq("equipo_id", equipoId).order("fecha_inicio", { ascending: false }),
    supabaseClient.from("jugador").select("*, perfil:perfil_id (nombre, apellido, foto_url)").eq("equipo_id", equipoId).order("dorsal")
  ]);

  if (evRes.error) {
    document.getElementById("convocatorias-container").innerHTML = `<div class="empty-state">No pudimos cargar los eventos: ${evRes.error.message}</div>`;
    return;
  }

  convEventos = evRes.data || [];
  convJugadoresEquipo = jugRes.data || [];

  const eventoIds = convEventos.map(e => e.id);
  if (eventoIds.length === 0) {
    convConvocatorias = [];
    convAsistencias = [];
    convRenderConvocatorias([]);
    convRenderPresencias([]);
    return;
  }

  const [convRes, asisRes] = await Promise.all([
    supabaseClient.from("convocatoria").select("*").in("evento_id", eventoIds).order("created_at", { ascending: false }),
    supabaseClient.from("asistencia").select("*").in("evento_id", eventoIds)
  ]);

  if (convRes.error) {
    document.getElementById("convocatorias-container").innerHTML = `<div class="empty-state">No pudimos cargar las convocatorias: ${convRes.error.message}</div>`;
    return;
  }

  convConvocatorias = convRes.data || [];
  convAsistencias = asisRes.data || [];

  const convIds = convConvocatorias.map(c => c.id);
  if (convIds.length > 0) {
    const { data: filas, error: errFilas } = await supabaseClient
      .from("convocatoria_jugador")
      .select("*, jugador:jugador_id (id, dorsal, posicion, activo, perfil_id, perfil:perfil_id (nombre, apellido, foto_url))")
      .in("convocatoria_id", convIds);

    if (errFilas) {
      document.getElementById("convocatorias-container").innerHTML = `<div class="empty-state">No pudimos cargar los convocados: ${errFilas.message}</div>`;
      return;
    }
    const porConv = {};
    (filas || []).forEach(f => {
      if (!porConv[f.convocatoria_id]) porConv[f.convocatoria_id] = [];
      porConv[f.convocatoria_id].push(f);
    });
    convConvocatorias.forEach(c => { c.jugadores = porConv[c.id] || []; });
  }

  convRenderConvocatorias(convConvocatorias);
  convRenderPresencias(convEventos);
}

function convEventoDe(convocatoria) {
  return convEventos.find(e => e.id === convocatoria.evento_id) || null;
}

function convFormatearFecha(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return `${d.getDate()} ${CONV_MESES[d.getMonth()]} · ${hora} hs`;
}

function convContar(filas, campo, valor) {
  return (filas || []).filter(f => f[campo] === valor).length;
}

function convRenderConvocatorias(lista) {
  const cont = document.getElementById("convocatorias-container");
  if (!convEquipoActualId) {
    cont.innerHTML = `<div class="empty-state">Elegí una categoría y un equipo para ver las convocatorias.</div>`;
    return;
  }
  if (!lista || lista.length === 0) {
    cont.innerHTML = `<div class="empty-state">Todavía no hay convocatorias para este equipo.${convEsStaffDeEquipo ? " Creá una desde un evento del calendario." : ""}</div>`;
    return;
  }

  const ordenadas = [...lista].sort((a, b) => {
    const fa = convEventoDe(a)?.fecha_inicio || a.created_at;
    const fb = convEventoDe(b)?.fecha_inicio || b.created_at;
    return new Date(fb) - new Date(fa);
  });

  cont.innerHTML = `<div class="event-list">${ordenadas.map(c => {
    const ev = convEventoDe(c);
    const fecha = ev ? new Date(ev.fecha_inicio) : new Date(c.created_at);
    const miFila = c.jugadores?.find(j => j.jugador_id === convMiJugadorId);
    const pills = convEsStaffDeEquipo
      ? `
        <span class="conv-pill confirmado">${convContar(c.jugadores, "confirmacion", "confirmado")} confirmados</span>
        <span class="conv-pill pendiente">${convContar(c.jugadores, "confirmacion", "pendiente")} pendientes</span>
        <span class="conv-pill rechazado">${convContar(c.jugadores, "confirmacion", "rechazado")} no pueden</span>
      `
      : (miFila
        ? `<span class="conv-pill ${miFila.confirmacion}">${CONV_LABELS[miFila.confirmacion]}</span>`
        : `<span class="conv-pill">No convocado/a</span>`);

    return `
      <div class="event-card" onclick="convAbrirDetalle('${c.id}')">
        <div class="event-date">
          <div class="day">${fecha.getDate()}</div>
          <div class="month">${CONV_MESES[fecha.getMonth()]}</div>
        </div>
        <div class="event-info">
          <div class="event-title">${ev?.titulo || "Evento"}</div>
          <div class="event-meta">${ev ? convFormatearFecha(ev.fecha_inicio) : ""}${ev?.lugar ? " · " + ev.lugar : ""}</div>
          <div class="conv-resumen" style="margin:0.45rem 0 0">${pills}</div>
        </div>
        ${ev ? `<span class="event-type ${ev.tipo}">${capitalizar(ev.tipo)}</span>` : ""}
      </div>
    `;
  }).join("")}</div>`;
}

function convRenderPresencias(eventos) {
  const cont = document.getElementById("presencias-container");
  if (!convEquipoActualId) {
    cont.innerHTML = `<div class="empty-state">Elegí una categoría y un equipo para ver las presencias.</div>`;
    return;
  }
  if (!eventos || eventos.length === 0) {
    cont.innerHTML = `<div class="empty-state">Todavía no hay eventos. Cargalos desde Calendario para poder pasar lista.</div>`;
    return;
  }

  cont.innerHTML = `<div class="event-list">${eventos.map(ev => {
    const filas = convAsistencias.filter(a => a.evento_id === ev.id);
    const pills = filas.length === 0
      ? `<span class="conv-pill">Asistencia no registrada</span>`
      : `
        <span class="conv-pill presente">${convContar(filas, "estado", "presente")} presentes</span>
        <span class="conv-pill ausente">${convContar(filas, "estado", "ausente")} ausentes</span>
        <span class="conv-pill tarde">${convContar(filas, "estado", "tarde")} tarde</span>
        <span class="conv-pill justificado">${convContar(filas, "estado", "justificado")} justificados</span>
      `;
    const fecha = new Date(ev.fecha_inicio);
    return `
      <div class="event-card" onclick="convAbrirAsistencia('${ev.id}')">
        <div class="event-date">
          <div class="day">${fecha.getDate()}</div>
          <div class="month">${CONV_MESES[fecha.getMonth()]}</div>
        </div>
        <div class="event-info">
          <div class="event-title">${ev.titulo}</div>
          <div class="event-meta">${convFormatearFecha(ev.fecha_inicio)}${ev.lugar ? " · " + ev.lugar : ""}</div>
          <div class="conv-resumen" style="margin:0.45rem 0 0">${pills}</div>
        </div>
        <span class="event-type ${ev.tipo}">${capitalizar(ev.tipo)}</span>
      </div>
    `;
  }).join("")}</div>`;
}

// ---------- Nueva convocatoria ----------
async function convAbrirNueva() {
  const errEl = document.getElementById("error-conv-nueva");
  errEl.classList.remove("show");
  document.getElementById("form-conv-nueva").reset();
  document.getElementById("conv-check-todos").checked = true;

  const usados = new Set(convConvocatorias.map(c => c.evento_id));
  const disponibles = convEventos.filter(e => !usados.has(e.id));
  const select = document.getElementById("conv-nuevo-evento");

  if (disponibles.length === 0) {
    select.innerHTML = `<option value="">No hay eventos sin convocatoria</option>`;
  } else {
    select.innerHTML = `<option value="">Elegí un evento</option>` +
      disponibles.map(e => `<option value="${e.id}">${convFormatearFecha(e.fecha_inicio)} · ${e.titulo}</option>`).join("");
  }

  const activos = convJugadoresEquipo.filter(j => j.activo !== false);
  const picker = document.getElementById("conv-nuevo-jugadores");
  if (activos.length === 0) {
    picker.innerHTML = `<div class="empty-state" style="padding:1.25rem">No hay jugadores activos en este plantel.</div>`;
  } else {
    picker.innerHTML = activos.map(j => `
      <label class="conv-pick-row">
        <input type="checkbox" class="conv-check-jugador" value="${j.id}" checked>
        <span class="dorsal">${j.dorsal ?? "–"}</span>
        <span>${j.perfil?.nombre ?? ""} ${j.perfil?.apellido ?? ""}</span>
      </label>
    `).join("");
  }

  abrirModal("overlay-conv-nueva");
}

async function convCrear(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-conv-nueva");
  errEl.classList.remove("show");

  const eventoId = document.getElementById("conv-nuevo-evento").value;
  if (!eventoId) {
    errEl.textContent = "Elegí un evento del calendario.";
    errEl.classList.add("show");
    return;
  }

  const ids = [...document.querySelectorAll(".conv-check-jugador:checked")].map(cb => cb.value);
  if (ids.length === 0) {
    errEl.textContent = "Seleccioná al menos un jugador.";
    errEl.classList.add("show");
    return;
  }

  const { data: { user } } = await supabaseClient.auth.getUser();
  const limite = document.getElementById("conv-nuevo-limite").value;

  const { data: creada, error } = await supabaseClient
    .from("convocatoria")
    .insert({
      evento_id: eventoId,
      creado_por: user.id,
      fecha_limite_confirmacion: limite ? new Date(limite).toISOString() : null
    })
    .select("id")
    .single();

  if (error) {
    errEl.textContent = "No se pudo crear: " + error.message;
    errEl.classList.add("show");
    return;
  }

  const filas = ids.map(jugadorId => ({
    convocatoria_id: creada.id,
    jugador_id: jugadorId,
    confirmacion: "pendiente"
  }));
  const { error: errFilas } = await supabaseClient.from("convocatoria_jugador").insert(filas);
  if (errFilas) {
    errEl.textContent = "La convocatoria se creó, pero no se pudieron cargar los jugadores: " + errFilas.message;
    errEl.classList.add("show");
    return;
  }

  cerrarModal("overlay-conv-nueva");
  await convCargarTodo(convEquipoActualId);
}

// ---------- Detalle ----------
async function convAbrirDetalle(convocatoriaId) {
  const conv = convConvocatorias.find(c => c.id === convocatoriaId);
  if (!conv) return;
  convSeleccionada = conv;

  const ev = convEventoDe(conv);
  document.getElementById("error-conv-detalle").classList.remove("show");
  document.getElementById("conv-detalle-titulo").textContent = ev?.titulo || "Convocatoria";
  document.getElementById("btn-eliminar-convocatoria").style.display = convEsStaffDeEquipo ? "inline-block" : "none";

  const limiteTxt = conv.fecha_limite_confirmacion
    ? `Confirmá antes del ${convFormatearFecha(conv.fecha_limite_confirmacion)}.`
    : "Sin fecha límite de confirmación.";
  document.getElementById("conv-detalle-meta").innerHTML = `
    ${ev ? `${capitalizar(ev.tipo)} · ${convFormatearFecha(ev.fecha_inicio)}${ev.lugar ? " · " + ev.lugar : ""}<br>` : ""}
    ${limiteTxt}
  `;

  convRenderRespuestaJugador(conv);
  convRenderListaDetalle(conv);
  abrirModal("overlay-conv-detalle");
}

function convRenderRespuestaJugador(conv) {
  const box = document.getElementById("conv-detalle-respuesta");
  const miFila = conv.jugadores?.find(j => j.jugador_id === convMiJugadorId);
  if (!miFila) {
    box.innerHTML = "";
    return;
  }

  const vencida = conv.fecha_limite_confirmacion && new Date(conv.fecha_limite_confirmacion) < new Date();
  box.innerHTML = `
    <div class="conv-respuesta">
      <p>Fuiste convocado/a. Estado: <strong>${CONV_LABELS[miFila.confirmacion]}</strong>${vencida ? " · El plazo ya venció, igual podés responder." : ""}</p>
      <div class="field" style="margin-bottom:0.7rem">
        <label>Si no podés, dejá un motivo (opcional)</label>
        <input type="text" id="conv-motivo-rechazo" placeholder="Ej: Lesión, viaje familiar…" value="${miFila.motivo_rechazo || ""}">
      </div>
      <div class="acciones">
        <button type="button" class="btn btn-primary" onclick="convResponder('confirmado')">Voy</button>
        <button type="button" class="btn btn-ghost" onclick="convResponder('rechazado')">No puedo</button>
      </div>
    </div>
  `;
}

function convRenderListaDetalle(conv) {
  const lista = document.getElementById("conv-detalle-lista");
  const filas = conv.jugadores || [];
  document.getElementById("conv-detalle-lista-titulo").textContent =
    convEsStaffDeEquipo ? "Convocados y asistencia" : "Convocados";

  if (filas.length === 0) {
    lista.innerHTML = `<div class="empty-state" style="padding:1.25rem">No hay jugadores visibles en esta convocatoria.</div>`;
    return;
  }

  const asisPorJugador = {};
  convAsistencias.filter(a => a.evento_id === conv.evento_id).forEach(a => { asisPorJugador[a.jugador_id] = a.estado; });

  lista.innerHTML = filas.map(f => {
    const p = f.jugador;
    const nombre = `${p?.perfil?.nombre ?? ""} ${p?.perfil?.apellido ?? ""}`.trim() || "Jugador/a";
    const estadoAsis = asisPorJugador[f.jugador_id];
    const chipsAsis = convEsStaffDeEquipo
      ? convChipsAsistencia(conv.evento_id, f.jugador_id, estadoAsis)
      : (estadoAsis ? `<span class="conv-pill ${estadoAsis}">${CONV_LABELS[estadoAsis]}</span>` : "");

    return `
      <div class="conv-player-row">
        <div class="player-dorsal">${p?.dorsal ?? "–"}</div>
        <div class="info">
          <div class="name">${nombre}</div>
          <div class="meta">${capitalizar(p?.posicion || "sin posición")}${f.motivo_rechazo ? " · " + f.motivo_rechazo : ""}</div>
        </div>
        <span class="conv-pill ${f.confirmacion}">${CONV_LABELS[f.confirmacion]}</span>
        ${chipsAsis}
      </div>
    `;
  }).join("");
}

function convChipsAsistencia(eventoId, jugadorId, estadoActual) {
  return `<div class="chip-group">${["presente","ausente","tarde","justificado"].map(est => `
    <button type="button" class="chip-btn ${est}${estadoActual === est ? " active" : ""}"
      onclick="convGuardarAsistencia('${eventoId}','${jugadorId}','${est}')">${CONV_LABELS[est]}</button>
  `).join("")}</div>`;
}

async function convResponder(confirmacion) {
  if (!convSeleccionada || !convMiJugadorId) return;
  const errEl = document.getElementById("error-conv-detalle");
  errEl.classList.remove("show");

  const motivo = document.getElementById("conv-motivo-rechazo")?.value.trim() || null;
  const { error } = await supabaseClient
    .from("convocatoria_jugador")
    .update({
      confirmacion,
      motivo_rechazo: confirmacion === "rechazado" ? motivo : null,
      respondido_at: new Date().toISOString()
    })
    .eq("convocatoria_id", convSeleccionada.id)
    .eq("jugador_id", convMiJugadorId);

  if (error) {
    errEl.textContent = "No se pudo guardar tu respuesta: " + error.message;
    errEl.classList.add("show");
    return;
  }

  await convCargarTodo(convEquipoActualId);
  const actualizada = convConvocatorias.find(c => c.id === convSeleccionada.id);
  if (actualizada) convAbrirDetalle(actualizada.id);
}

async function convEliminar() {
  if (!convSeleccionada) return;
  const ev = convEventoDe(convSeleccionada);
  if (!confirm(`¿Eliminar la convocatoria de "${ev?.titulo || "este evento"}"? Las confirmaciones se pierden.`)) return;

  const { error } = await supabaseClient.from("convocatoria").delete().eq("id", convSeleccionada.id);
  if (error) {
    const errEl = document.getElementById("error-conv-detalle");
    errEl.textContent = "No se pudo eliminar: " + error.message;
    errEl.classList.add("show");
    return;
  }

  cerrarModal("overlay-conv-detalle");
  await convCargarTodo(convEquipoActualId);
}

// ---------- Asistencia (pestaña Presencias) ----------
function convAbrirAsistencia(eventoId) {
  const ev = convEventos.find(e => e.id === eventoId);
  if (!ev) return;
  convEventoAsistencia = ev;

  document.getElementById("error-asistencia").classList.remove("show");
  document.getElementById("asis-titulo").textContent = ev.titulo;
  document.getElementById("asis-meta").textContent =
    `${capitalizar(ev.tipo)} · ${convFormatearFecha(ev.fecha_inicio)}${ev.lugar ? " · " + ev.lugar : ""}`;

  convRenderAsistenciaLista(ev);
  abrirModal("overlay-asistencia");
}

function convRenderAsistenciaLista(ev) {
  const filas = convAsistencias.filter(a => a.evento_id === ev.id);
  document.getElementById("asis-resumen").innerHTML = filas.length === 0
    ? `<span class="conv-pill">Todavía no se pasó lista</span>`
    : `
      <span class="conv-pill presente">${convContar(filas, "estado", "presente")} presentes</span>
      <span class="conv-pill ausente">${convContar(filas, "estado", "ausente")} ausentes</span>
      <span class="conv-pill tarde">${convContar(filas, "estado", "tarde")} tarde</span>
      <span class="conv-pill justificado">${convContar(filas, "estado", "justificado")} justificados</span>
    `;

  const asisPorJugador = {};
  filas.forEach(a => { asisPorJugador[a.jugador_id] = a.estado; });

  const convDelEvento = convConvocatorias.find(c => c.evento_id === ev.id);
  const convocadosIds = new Set((convDelEvento?.jugadores || []).map(j => j.jugador_id));
  const plantel = convJugadoresEquipo.filter(j => j.activo !== false || asisPorJugador[j.id]);

  const lista = document.getElementById("asis-lista");
  if (plantel.length === 0) {
    lista.innerHTML = `<div class="empty-state" style="padding:1.25rem">No hay jugadores en este plantel.</div>`;
    return;
  }

  lista.innerHTML = plantel.map(j => {
    const nombre = `${j.perfil?.nombre ?? ""} ${j.perfil?.apellido ?? ""}`.trim();
    const estado = asisPorJugador[j.id];
    const extra = convocadosIds.size > 0 && !convocadosIds.has(j.id)
      ? `<span class="conv-pill">No convocado/a</span>`
      : "";
    const controles = convEsStaffDeEquipo
      ? convChipsAsistencia(ev.id, j.id, estado)
      : (estado ? `<span class="conv-pill ${estado}">${CONV_LABELS[estado]}</span>` : `<span class="conv-pill">Sin registro</span>`);

    return `
      <div class="conv-player-row">
        <div class="player-dorsal">${j.dorsal ?? "–"}</div>
        <div class="info">
          <div class="name">${nombre}</div>
          <div class="meta">${capitalizar(j.posicion || "sin posición")}</div>
        </div>
        ${extra}
        ${controles}
      </div>
    `;
  }).join("");
}

async function convGuardarAsistencia(eventoId, jugadorId, estado) {
  if (!convEsStaffDeEquipo) return;
  const errId = convSeleccionada ? "error-conv-detalle" : "error-asistencia";
  const errEl = document.getElementById(errId);
  errEl.classList.remove("show");

  const { data: { user } } = await supabaseClient.auth.getUser();
  const { error } = await supabaseClient.from("asistencia").upsert({
    evento_id: eventoId,
    jugador_id: jugadorId,
    estado,
    registrado_por: user.id,
    registrado_at: new Date().toISOString()
  }, { onConflict: "evento_id,jugador_id" });

  if (error) {
    errEl.textContent = "No se pudo guardar la asistencia: " + error.message;
    errEl.classList.add("show");
    return;
  }

  await convCargarTodo(convEquipoActualId);

  if (convSeleccionada) {
    const actualizada = convConvocatorias.find(c => c.id === convSeleccionada.id);
    if (actualizada) {
      convSeleccionada = actualizada;
      convRenderListaDetalle(actualizada);
    }
  }
  if (convEventoAsistencia) {
    const ev = convEventos.find(e => e.id === convEventoAsistencia.id);
    if (ev) {
      convEventoAsistencia = ev;
      convRenderAsistenciaLista(ev);
    }
  }
}
