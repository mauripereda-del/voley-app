// =========================================================
// MÓDULO: CALENDARIO
// =========================================================

let calEquipoActualId = null;
let calEsStaffDeEquipo = false; // si el usuario puede crear/editar eventos en el equipo elegido
let calEventoSeleccionado = null;

const MESES_CORTOS = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("calendario-container")) return; // no estamos en dashboard.html

  const session = await requerirSesion();
  if (!session) return;

  await calCargarCategorias();

  document.getElementById("cal-filtro-categoria").addEventListener("change", calOnCambioCategoria);
  document.getElementById("cal-filtro-equipo").addEventListener("change", calOnCambioEquipo);
  document.getElementById("btn-nuevo-evento").addEventListener("click", () => calAbrirModalEvento(null));
  document.getElementById("form-evento").addEventListener("submit", calGuardarEvento);
  document.getElementById("btn-eliminar-evento").addEventListener("click", calEliminarEvento);
});

async function calCargarCategorias() {
  const { data, error } = await supabaseClient.from("categoria").select("*").order("nombre");
  const select = document.getElementById("cal-filtro-categoria");
  if (error || !data || data.length === 0) {
    select.innerHTML = `<option value="">No hay categorías cargadas</option>`;
    return;
  }
  select.innerHTML = `<option value="">Elegí una categoría</option>` +
    data.map(c => `<option value="${c.id}">${c.nombre} · ${c.genero === "femenino" ? "Femenino" : "Masculino"}</option>`).join("");
}

async function calOnCambioCategoria() {
  const categoriaId = document.getElementById("cal-filtro-categoria").value;
  const selectEquipo = document.getElementById("cal-filtro-equipo");
  calEquipoActualId = null;
  calRenderEventos([]);
  document.getElementById("btn-nuevo-evento").style.display = "none";

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

async function calOnCambioEquipo() {
  calEquipoActualId = document.getElementById("cal-filtro-equipo").value || null;
  if (!calEquipoActualId) {
    calRenderEventos([]);
    document.getElementById("btn-nuevo-evento").style.display = "none";
    return;
  }
  await calDeterminarPermiso(calEquipoActualId);
  await calCargarEventos(calEquipoActualId);
}

// Determina si el usuario actual puede crear/editar eventos de este equipo:
// admin/dirigente siempre puede; entrenador/delegado solo si es staff de ESE equipo puntual.
async function calDeterminarPermiso(equipoId) {
  calEsStaffDeEquipo = false;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { data: perfil } = await supabaseClient.from("perfil").select("rol").eq("id", user.id).single();
  if (!perfil) return;

  if (["admin", "dirigente"].includes(perfil.rol)) {
    calEsStaffDeEquipo = true;
  } else {
    const { data: staff } = await supabaseClient
      .from("cuerpo_tecnico")
      .select("id")
      .eq("equipo_id", equipoId)
      .eq("perfil_id", user.id)
      .maybeSingle();
    calEsStaffDeEquipo = !!staff;
  }
  document.getElementById("btn-nuevo-evento").style.display = calEsStaffDeEquipo ? "inline-block" : "none";
}

async function calCargarEventos(equipoId) {
  document.getElementById("calendario-container").innerHTML = `<div class="empty-state">Cargando calendario…</div>`;

  const { data, error } = await supabaseClient
    .from("evento")
    .select("*")
    .eq("equipo_id", equipoId)
    .order("fecha_inicio");

  if (error) {
    document.getElementById("calendario-container").innerHTML = `<div class="empty-state">No pudimos cargar el calendario: ${error.message}</div>`;
    return;
  }
  calRenderEventos(data || []);
}

function calRenderEventos(eventos) {
  const cont = document.getElementById("calendario-container");
  if (!eventos || eventos.length === 0) {
    cont.innerHTML = `<div class="empty-state">Todavía no hay eventos cargados para este equipo.</div>`;
    return;
  }

  cont.innerHTML = `<div class="event-list">${eventos.map(ev => {
    const fecha = new Date(ev.fecha_inicio);
    const hora = fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    return `
      <div class="event-card" onclick="calAbrirModalEvento('${ev.id}')">
        <div class="event-date">
          <div class="day">${fecha.getDate()}</div>
          <div class="month">${MESES_CORTOS[fecha.getMonth()]}</div>
        </div>
        <div class="event-info">
          <div class="event-title">${ev.titulo}</div>
          <div class="event-meta">${hora} hs${ev.lugar ? " · " + ev.lugar : ""}</div>
        </div>
        <span class="event-type ${ev.tipo}">${capitalizar(ev.tipo)}</span>
      </div>
    `;
  }).join("")}</div>`;
}

// ---------- Crear / editar evento ----------
async function calAbrirModalEvento(eventoId) {
  document.getElementById("error-evento").classList.remove("show");
  document.getElementById("form-evento").reset();
  calEventoSeleccionado = null;

  if (eventoId) {
    const { data, error } = await supabaseClient.from("evento").select("*").eq("id", eventoId).single();
    if (error) { alert("No se pudo abrir el evento: " + error.message); return; }
    calEventoSeleccionado = data;

    document.getElementById("evento-titulo-modal").textContent = "Editar evento";
    document.getElementById("evento-tipo").value = data.tipo;
    document.getElementById("evento-titulo").value = data.titulo;
    document.getElementById("evento-descripcion").value = data.descripcion || "";
    document.getElementById("evento-inicio").value = calAFechaLocal(data.fecha_inicio);
    document.getElementById("evento-fin").value = data.fecha_fin ? calAFechaLocal(data.fecha_fin) : "";
    document.getElementById("evento-lugar").value = data.lugar || "";
    document.getElementById("evento-direccion").value = data.direccion || "";
    document.getElementById("btn-eliminar-evento").style.display = calEsStaffDeEquipo ? "inline-block" : "none";
  } else {
    document.getElementById("evento-titulo-modal").textContent = "Nuevo evento";
    document.getElementById("btn-eliminar-evento").style.display = "none";
  }

  abrirModal("overlay-evento");
}

// convierte un timestamp ISO a formato "YYYY-MM-DDTHH:mm" para un input datetime-local
function calAFechaLocal(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function calGuardarEvento(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-evento");
  errEl.classList.remove("show");

  if (!calEquipoActualId) {
    errEl.textContent = "Elegí primero una categoría y un equipo arriba.";
    errEl.classList.add("show");
    return;
  }

  const payload = {
    equipo_id: calEquipoActualId,
    tipo: document.getElementById("evento-tipo").value,
    titulo: document.getElementById("evento-titulo").value.trim(),
    descripcion: document.getElementById("evento-descripcion").value.trim() || null,
    fecha_inicio: new Date(document.getElementById("evento-inicio").value).toISOString(),
    fecha_fin: document.getElementById("evento-fin").value ? new Date(document.getElementById("evento-fin").value).toISOString() : null,
    lugar: document.getElementById("evento-lugar").value.trim() || null,
    direccion: document.getElementById("evento-direccion").value.trim() || null
  };

  let error;
  if (calEventoSeleccionado) {
    ({ error } = await supabaseClient.from("evento").update(payload).eq("id", calEventoSeleccionado.id));
  } else {
    const { data: { user } } = await supabaseClient.auth.getUser();
    payload.created_by = user.id;
    ({ error } = await supabaseClient.from("evento").insert(payload));
  }

  if (error) {
    errEl.textContent = "No se pudo guardar: " + error.message;
    errEl.classList.add("show");
    return;
  }

  cerrarModal("overlay-evento");
  calCargarEventos(calEquipoActualId);
}

async function calEliminarEvento() {
  if (!calEventoSeleccionado) return;
  if (!confirm(`¿Eliminar el evento "${calEventoSeleccionado.titulo}"? Esta acción no se puede deshacer.`)) return;

  const { error } = await supabaseClient.from("evento").delete().eq("id", calEventoSeleccionado.id);
  if (error) { alert("No se pudo eliminar: " + error.message); return; }

  cerrarModal("overlay-evento");
  calCargarEventos(calEquipoActualId);
}
