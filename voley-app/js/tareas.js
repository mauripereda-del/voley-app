// =========================================================
// MÓDULO: TAREAS
// =========================================================

let tarEquipoActualId = null;
let tarEsStaffDeEquipo = false;
let tarMiPerfilId = null;
let tarTareas = [];
let tarMiembros = [];
let tarSeleccionada = null;
let tarTabActual = "todas";

const TAR_ESTADO = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completada: "Completada"
};
const TAR_PRIORIDAD = {
  baja: "Baja",
  media: "Media",
  alta: "Alta"
};
const TAR_MESES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("tareas-container")) return;

  const session = await requerirSesion();
  if (!session) return;
  tarMiPerfilId = session.user.id;

  await tarCargarCategorias();

  document.getElementById("tar-filtro-categoria").addEventListener("change", tarOnCambioCategoria);
  document.getElementById("tar-filtro-equipo").addEventListener("change", tarOnCambioEquipo);
  document.getElementById("btn-nueva-tarea").addEventListener("click", () => tarAbrir(null));
  document.getElementById("form-tarea").addEventListener("submit", tarGuardar);
  document.getElementById("btn-eliminar-tarea").addEventListener("click", tarEliminar);
  document.querySelectorAll("[data-tar-tab]").forEach(btn => {
    btn.addEventListener("click", () => tarCambiarTab(btn.dataset.tarTab));
  });
});

function tarCambiarTab(tab) {
  tarTabActual = tab;
  document.querySelectorAll("[data-tar-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tarTab === tab);
  });
  tarRenderLista();
}

async function tarCargarCategorias() {
  const { data, error } = await supabaseClient.from("categoria").select("*").order("nombre");
  const select = document.getElementById("tar-filtro-categoria");
  if (error || !data || data.length === 0) {
    select.innerHTML = `<option value="">No hay categorías cargadas</option>`;
    return;
  }
  select.innerHTML = `<option value="">Elegí una categoría</option>` +
    data.map(c => `<option value="${c.id}">${c.nombre} · ${c.genero === "femenino" ? "Femenino" : "Masculino"}</option>`).join("");
}

async function tarOnCambioCategoria() {
  const categoriaId = document.getElementById("tar-filtro-categoria").value;
  const selectEquipo = document.getElementById("tar-filtro-equipo");
  tarEquipoActualId = null;
  tarRenderLista();
  document.getElementById("btn-nueva-tarea").style.display = "none";

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

async function tarOnCambioEquipo() {
  tarEquipoActualId = document.getElementById("tar-filtro-equipo").value || null;
  if (!tarEquipoActualId) {
    tarTareas = [];
    tarRenderLista();
    document.getElementById("btn-nueva-tarea").style.display = "none";
    return;
  }
  await tarDeterminarPermiso(tarEquipoActualId);
  await tarCargarTodo(tarEquipoActualId);
}

async function tarDeterminarPermiso(equipoId) {
  tarEsStaffDeEquipo = false;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { data: perfil } = await supabaseClient.from("perfil").select("rol").eq("id", user.id).single();
  if (!perfil) return;

  if (["admin", "dirigente"].includes(perfil.rol)) {
    tarEsStaffDeEquipo = true;
  } else {
    const { data: staff } = await supabaseClient
      .from("cuerpo_tecnico")
      .select("id")
      .eq("equipo_id", equipoId)
      .eq("perfil_id", user.id)
      .maybeSingle();
    tarEsStaffDeEquipo = !!staff;
  }
  document.getElementById("btn-nueva-tarea").style.display = tarEsStaffDeEquipo ? "inline-block" : "none";
}

async function tarCargarTodo(equipoId) {
  document.getElementById("tareas-container").innerHTML = `<div class="empty-state">Cargando tareas…</div>`;

  const [tarRes, jugRes, staffRes] = await Promise.all([
    supabaseClient
      .from("tarea")
      .select("*, asignado:asignado_a (id, nombre, apellido), autor:asignado_por (id, nombre, apellido)")
      .eq("equipo_id", equipoId)
      .order("fecha_vencimiento", { ascending: true, nullsFirst: false }),
    supabaseClient
      .from("jugador")
      .select("perfil_id, perfil:perfil_id (id, nombre, apellido, rol)")
      .eq("equipo_id", equipoId)
      .eq("activo", true),
    supabaseClient
      .from("cuerpo_tecnico")
      .select("perfil_id, cargo, perfil:perfil_id (id, nombre, apellido, rol)")
      .eq("equipo_id", equipoId)
  ]);

  if (tarRes.error) {
    document.getElementById("tareas-container").innerHTML =
      `<div class="empty-state">No pudimos cargar las tareas: ${tarEsc(tarRes.error.message)}</div>`;
    return;
  }

  tarTareas = tarRes.data || [];

  const porId = {};
  (jugRes.data || []).forEach(j => {
    if (j.perfil) porId[j.perfil.id] = { ...j.perfil, etiqueta: capitalizar(j.perfil.rol || "jugador") };
  });
  (staffRes.data || []).forEach(s => {
    if (s.perfil) porId[s.perfil.id] = { ...s.perfil, etiqueta: capitalizar(s.cargo || s.perfil.rol || "staff") };
  });
  tarMiembros = Object.values(porId).sort((a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, "es"));

  tarRenderLista();
}

function tarVencida(t) {
  if (!t.fecha_vencimiento || t.estado === "completada") return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return new Date(t.fecha_vencimiento + "T00:00:00") < hoy;
}

function tarPuedeCambiarEstado(t) {
  return tarEsStaffDeEquipo || t.asignado_a === tarMiPerfilId;
}

function tarListaFiltrada() {
  return tarTareas.filter(t => {
    if (tarTabActual === "mias") return t.asignado_a === tarMiPerfilId;
    if (tarTabActual === "todas") return true;
    return t.estado === tarTabActual;
  }).sort((a, b) => {
    const orden = { pendiente: 0, en_progreso: 1, completada: 2 };
    const oa = orden[a.estado] ?? 9;
    const ob = orden[b.estado] ?? 9;
    if (oa !== ob) return oa - ob;
    if (tarVencida(a) !== tarVencida(b)) return tarVencida(a) ? -1 : 1;
    const fa = a.fecha_vencimiento || "9999-12-31";
    const fb = b.fecha_vencimiento || "9999-12-31";
    return fa.localeCompare(fb);
  });
}

function tarRenderLista() {
  const cont = document.getElementById("tareas-container");
  if (!tarEquipoActualId) {
    cont.innerHTML = `<div class="empty-state">Elegí una categoría y un equipo para ver las tareas.</div>`;
    return;
  }
  const lista = tarListaFiltrada();
  if (lista.length === 0) {
    const hint = tarEsStaffDeEquipo && tarTabActual === "todas" ? " Creá la primera con + Nueva tarea." : "";
    cont.innerHTML = `<div class="empty-state">No hay tareas en esta vista.${hint}</div>`;
    return;
  }

  cont.innerHTML = `<div class="event-list">${lista.map(t => {
    const asignado = t.asignado ? `${t.asignado.nombre} ${t.asignado.apellido}` : "Sin asignar";
    const fecha = t.fecha_vencimiento ? tarFormatearFecha(t.fecha_vencimiento) : "Sin vencimiento";
    const chipsEstado = tarPuedeCambiarEstado(t)
      ? `<div class="chip-group" onclick="event.stopPropagation()">${
          Object.keys(TAR_ESTADO).map(est => `
            <button type="button" class="chip-btn ${est}${t.estado === est ? " active" : ""}"
              onclick="tarCambiarEstado('${t.id}','${est}')">${TAR_ESTADO[est]}</button>
          `).join("")
        }</div>`
      : `<span class="conv-pill ${t.estado}">${TAR_ESTADO[t.estado]}</span>`;

    return `
      <div class="event-card${t.estado === "completada" ? " completada" : ""}" onclick="tarAbrir('${t.id}')">
        <div class="event-info" style="flex:1">
          <div class="tar-card-top">
            <div class="event-title">${tarEsc(t.titulo)}</div>
            <span class="conv-pill ${t.prioridad}">${TAR_PRIORIDAD[t.prioridad]}</span>
          </div>
          <div class="event-meta">${tarEsc(asignado)} · ${fecha}${tarVencida(t) ? ` · <span class="conv-pill vencida">Vencida</span>` : ""}</div>
          ${t.descripcion ? `<div class="tar-desc">${tarEsc(t.descripcion)}</div>` : ""}
          <div class="conv-resumen" style="margin:0.55rem 0 0">${chipsEstado}</div>
        </div>
      </div>
    `;
  }).join("")}</div>`;
}

function tarFormatearFecha(isoFecha) {
  const d = new Date(isoFecha + "T00:00:00");
  return `${d.getDate()} ${TAR_MESES[d.getMonth()]}`;
}

function tarPoblarAsignados(selectedId) {
  const select = document.getElementById("tarea-asignado");
  select.innerHTML = `<option value="">Sin asignar</option>` +
    tarMiembros.map(m =>
      `<option value="${m.id}" ${m.id === selectedId ? "selected" : ""}>${tarEsc(`${m.nombre} ${m.apellido}`)} · ${tarEsc(m.etiqueta)}</option>`
    ).join("");
}

function tarSetCamposEditables(editable, soloEstado) {
  ["tarea-titulo", "tarea-descripcion", "tarea-asignado", "tarea-prioridad", "tarea-vencimiento"].forEach(id => {
    document.getElementById(id).disabled = !editable;
  });
  document.getElementById("tarea-estado").disabled = !(editable || soloEstado);
  document.getElementById("btn-guardar-tarea").style.display = (editable || soloEstado) ? "inline-block" : "none";
}

async function tarAbrir(tareaId) {
  document.getElementById("error-tarea").classList.remove("show");
  document.getElementById("form-tarea").reset();
  tarSeleccionada = null;
  tarPoblarAsignados(null);

  if (!tareaId) {
    document.getElementById("tarea-titulo-modal").textContent = "Nueva tarea";
    document.getElementById("tarea-prioridad").value = "media";
    document.getElementById("tarea-estado").value = "pendiente";
    document.getElementById("btn-eliminar-tarea").style.display = "none";
    tarSetCamposEditables(true, false);
    abrirModal("overlay-tarea");
    return;
  }

  const t = tarTareas.find(x => x.id === tareaId);
  if (!t) return;
  tarSeleccionada = t;

  document.getElementById("tarea-titulo-modal").textContent = "Tarea";
  document.getElementById("tarea-titulo").value = t.titulo;
  document.getElementById("tarea-descripcion").value = t.descripcion || "";
  tarPoblarAsignados(t.asignado_a);
  document.getElementById("tarea-prioridad").value = t.prioridad || "media";
  document.getElementById("tarea-estado").value = t.estado || "pendiente";
  document.getElementById("tarea-vencimiento").value = t.fecha_vencimiento || "";
  document.getElementById("btn-eliminar-tarea").style.display = tarEsStaffDeEquipo ? "inline-block" : "none";

  const soloEstado = !tarEsStaffDeEquipo && t.asignado_a === tarMiPerfilId;
  tarSetCamposEditables(tarEsStaffDeEquipo, soloEstado);
  abrirModal("overlay-tarea");
}

async function tarGuardar(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-tarea");
  errEl.classList.remove("show");

  if (!tarEquipoActualId) {
    errEl.textContent = "Elegí primero una categoría y un equipo arriba.";
    errEl.classList.add("show");
    return;
  }

  const soloEstado = tarSeleccionada && !tarEsStaffDeEquipo && tarSeleccionada.asignado_a === tarMiPerfilId;
  let error;

  if (soloEstado) {
    ({ error } = await supabaseClient
      .from("tarea")
      .update({ estado: document.getElementById("tarea-estado").value })
      .eq("id", tarSeleccionada.id));
  } else if (tarSeleccionada) {
    ({ error } = await supabaseClient.from("tarea").update({
      titulo: document.getElementById("tarea-titulo").value.trim(),
      descripcion: document.getElementById("tarea-descripcion").value.trim() || null,
      asignado_a: document.getElementById("tarea-asignado").value || null,
      prioridad: document.getElementById("tarea-prioridad").value,
      estado: document.getElementById("tarea-estado").value,
      fecha_vencimiento: document.getElementById("tarea-vencimiento").value || null
    }).eq("id", tarSeleccionada.id));
  } else {
    const { data: { user } } = await supabaseClient.auth.getUser();
    ({ error } = await supabaseClient.from("tarea").insert({
      equipo_id: tarEquipoActualId,
      titulo: document.getElementById("tarea-titulo").value.trim(),
      descripcion: document.getElementById("tarea-descripcion").value.trim() || null,
      asignado_a: document.getElementById("tarea-asignado").value || null,
      asignado_por: user.id,
      prioridad: document.getElementById("tarea-prioridad").value,
      estado: document.getElementById("tarea-estado").value,
      fecha_vencimiento: document.getElementById("tarea-vencimiento").value || null
    }));
  }

  if (error) {
    errEl.textContent = "No se pudo guardar: " + error.message;
    errEl.classList.add("show");
    return;
  }

  cerrarModal("overlay-tarea");
  await tarCargarTodo(tarEquipoActualId);
}

async function tarCambiarEstado(id, estado) {
  const t = tarTareas.find(x => x.id === id);
  if (!t || !tarPuedeCambiarEstado(t)) return;
  const { error } = await supabaseClient.from("tarea").update({ estado }).eq("id", id);
  if (error) {
    alert("No se pudo actualizar: " + error.message);
    return;
  }
  await tarCargarTodo(tarEquipoActualId);
}

async function tarEliminar() {
  if (!tarSeleccionada) return;
  if (!confirm(`¿Eliminar la tarea "${tarSeleccionada.titulo}"?`)) return;
  const { error } = await supabaseClient.from("tarea").delete().eq("id", tarSeleccionada.id);
  if (error) {
    const errEl = document.getElementById("error-tarea");
    errEl.textContent = "No se pudo eliminar: " + error.message;
    errEl.classList.add("show");
    return;
  }
  cerrarModal("overlay-tarea");
  await tarCargarTodo(tarEquipoActualId);
}

function tarEsc(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
