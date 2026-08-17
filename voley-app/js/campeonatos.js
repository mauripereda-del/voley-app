// =========================================================
// MÓDULO: CAMPEONATOS
// =========================================================

let campEsAdmin = false;
let campStaffEquipoIds = new Set();
let campCategorias = [];
let campLista = [];
let campActual = null;
let campInscriptos = [];
let campPartidos = [];
let campTab = "tabla";
let campPartidoEdit = null;
let campEditandoId = null;
let campFiltroCategoriaId = "";

const CAMP_TIPO = {
  liga: "Liga",
  copa: "Copa",
  eliminacion_directa: "Eliminación directa"
};
const CAMP_ESTADO = {
  programado: "Programado",
  en_curso: "En curso",
  finalizado: "Finalizado",
  suspendido: "Suspendido"
};
const CAMP_MESES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("campeonatos-container")) return;

  const session = await requerirSesion();
  if (!session) return;

  await campCargarPermisos(session.user.id);
  await campCargarCategorias();
  await campCargarLista();

  document.getElementById("camp-filtro-categoria").addEventListener("change", async () => {
    campFiltroCategoriaId = document.getElementById("camp-filtro-categoria").value;
    await campCargarLista();
  });
  document.getElementById("btn-nuevo-campeonato").addEventListener("click", () => campAbrirForm(null));
  document.getElementById("form-campeonato").addEventListener("submit", campGuardar);
  document.getElementById("btn-camp-volver").addEventListener("click", campVolver);
  document.getElementById("btn-editar-campeonato").addEventListener("click", () => campAbrirForm(campActual));
  document.getElementById("btn-eliminar-campeonato").addEventListener("click", campEliminar);
  document.getElementById("form-camp-equipo").addEventListener("submit", campAgregarEquipo);
  document.getElementById("form-camp-partido").addEventListener("submit", campGuardarPartido);
  document.getElementById("btn-eliminar-camp-partido").addEventListener("click", campEliminarPartido);
  document.querySelectorAll("[data-camp-tab]").forEach(btn => {
    btn.addEventListener("click", () => campCambiarTab(btn.dataset.campTab));
  });
});

async function campCargarPermisos(userId) {
  const { data: perfil } = await supabaseClient.from("perfil").select("rol").eq("id", userId).single();
  campEsAdmin = ["admin", "dirigente"].includes(perfil?.rol);
  if (campEsAdmin) {
    document.getElementById("btn-nuevo-campeonato").style.display = "inline-block";
  }
  const { data: staff } = await supabaseClient.from("cuerpo_tecnico").select("equipo_id").eq("perfil_id", userId);
  campStaffEquipoIds = new Set((staff || []).map(s => s.equipo_id));
}

function campPuedeEditarPartido(p) {
  if (campEsAdmin) return true;
  return campStaffEquipoIds.has(p.equipo_local_id) || campStaffEquipoIds.has(p.equipo_visitante_id);
}

async function campCargarCategorias() {
  const { data } = await supabaseClient.from("categoria").select("*").order("nombre");
  campCategorias = data || [];
  const filtro = document.getElementById("camp-filtro-categoria");
  filtro.innerHTML = `<option value="">Todas las categorías</option>` +
    campCategorias.map(c => `<option value="${c.id}">${c.nombre} · ${c.genero === "femenino" ? "Femenino" : "Masculino"}</option>`).join("");
}

function campOptionsCategoria(selectedId, incluirVacio) {
  const vacio = incluirVacio ? `<option value="">Sin categoría</option>` : "";
  return vacio + campCategorias.map(c =>
    `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${c.nombre} · ${c.genero === "femenino" ? "Femenino" : "Masculino"}</option>`
  ).join("");
}

async function campCargarLista() {
  const cont = document.getElementById("campeonatos-container");
  cont.innerHTML = `<div class="empty-state">Cargando campeonatos…</div>`;

  let q = supabaseClient
    .from("campeonato")
    .select("*, categoria:categoria_id (nombre, genero)")
    .order("fecha_inicio", { ascending: false });

  if (campFiltroCategoriaId) q = q.eq("categoria_id", campFiltroCategoriaId);

  const { data, error } = await q;
  if (error) {
    cont.innerHTML = `<div class="empty-state">No pudimos cargar los campeonatos: ${campEsc(error.message)}</div>`;
    return;
  }
  campLista = data || [];
  if (campLista.length === 0) {
    cont.innerHTML = `<div class="empty-state">Todavía no hay campeonatos.${campEsAdmin ? " Creá el primero." : ""}</div>`;
    return;
  }

  const ids = campLista.map(c => c.id);
  const { data: insc } = await supabaseClient.from("campeonato_equipo").select("campeonato_id").in("campeonato_id", ids);
  const conteo = {};
  (insc || []).forEach(r => { conteo[r.campeonato_id] = (conteo[r.campeonato_id] || 0) + 1; });

  cont.innerHTML = `<div class="event-list">${campLista.map(c => {
    const fechas = [c.fecha_inicio, c.fecha_fin].filter(Boolean).map(campFechaCorta).join(" — ");
    const cat = c.categoria ? `${c.categoria.nombre} · ${c.categoria.genero === "femenino" ? "Fem" : "Masc"}` : "Sin categoría";
    return `
      <div class="event-card" onclick="campAbrirDetalle('${c.id}')">
        <div class="event-info">
          <div class="event-title">${campEsc(c.nombre)}</div>
          <div class="event-meta">${campEsc(cat)}${fechas ? " · " + fechas : ""}${c.organizador ? " · " + campEsc(c.organizador) : ""}</div>
          <div class="conv-resumen" style="margin:0.45rem 0 0">
            <span class="conv-pill">${CAMP_TIPO[c.tipo] || c.tipo}</span>
            <span class="conv-pill">${conteo[c.id] || 0} equipos</span>
          </div>
        </div>
      </div>
    `;
  }).join("")}</div>`;
}

function campFechaCorta(iso) {
  if (!iso) return "";
  const d = new Date(iso + (String(iso).includes("T") ? "" : "T00:00:00"));
  return `${d.getDate()} ${CAMP_MESES[d.getMonth()]}`;
}

function campFechaHora(iso) {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return `${d.getDate()} ${CAMP_MESES[d.getMonth()]} · ${hora} hs`;
}

function campAFechaLocal(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function campAbrirForm(camp) {
  document.getElementById("error-campeonato").classList.remove("show");
  document.getElementById("form-campeonato").reset();
  campEditandoId = camp?.id || null;
  document.getElementById("camp-categoria").innerHTML = campOptionsCategoria(camp?.categoria_id || campFiltroCategoriaId, true);
  document.getElementById("camp-titulo-modal").textContent = camp ? "Editar campeonato" : "Nuevo campeonato";
  if (camp) {
    document.getElementById("camp-nombre").value = camp.nombre;
    document.getElementById("camp-tipo").value = camp.tipo || "liga";
    document.getElementById("camp-organizador").value = camp.organizador || "";
    document.getElementById("camp-inicio").value = camp.fecha_inicio || "";
    document.getElementById("camp-fin").value = camp.fecha_fin || "";
  }
  abrirModal("overlay-campeonato");
}

async function campGuardar(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-campeonato");
  errEl.classList.remove("show");

  const payload = {
    nombre: document.getElementById("camp-nombre").value.trim(),
    categoria_id: document.getElementById("camp-categoria").value || null,
    tipo: document.getElementById("camp-tipo").value,
    organizador: document.getElementById("camp-organizador").value.trim() || null,
    fecha_inicio: document.getElementById("camp-inicio").value || null,
    fecha_fin: document.getElementById("camp-fin").value || null
  };

  const { error } = campEditandoId
    ? await supabaseClient.from("campeonato").update(payload).eq("id", campEditandoId)
    : await supabaseClient.from("campeonato").insert(payload);

  if (error) {
    errEl.textContent = "No se pudo guardar: " + error.message;
    errEl.classList.add("show");
    return;
  }

  cerrarModal("overlay-campeonato");
  if (campEditandoId && campActual?.id === campEditandoId) {
    await campAbrirDetalle(campEditandoId);
  } else {
    await campCargarLista();
  }
}

async function campEliminar() {
  if (!campActual) return;
  if (!confirm(`¿Eliminar "${campActual.nombre}"? Se borran equipos inscriptos y partidos del campeonato.`)) return;
  const { error } = await supabaseClient.from("campeonato").delete().eq("id", campActual.id);
  if (error) { alert("No se pudo eliminar: " + error.message); return; }
  campVolver();
}

function campVolver() {
  campActual = null;
  document.getElementById("camp-detalle-wrap").style.display = "none";
  document.getElementById("camp-lista-wrap").style.display = "block";
  campCargarLista();
}

function campCambiarTab(tab) {
  campTab = tab;
  document.querySelectorAll("[data-camp-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.campTab === tab);
  });
  document.getElementById("camp-panel-tabla").style.display = tab === "tabla" ? "block" : "none";
  document.getElementById("camp-panel-partidos").style.display = tab === "partidos" ? "block" : "none";
  document.getElementById("camp-panel-equipos").style.display = tab === "equipos" ? "block" : "none";
}

async function campAbrirDetalle(id) {
  const { data, error } = await supabaseClient
    .from("campeonato")
    .select("*, categoria:categoria_id (nombre, genero)")
    .eq("id", id)
    .single();
  if (error) { alert("No se pudo abrir: " + error.message); return; }
  campActual = data;

  document.getElementById("camp-lista-wrap").style.display = "none";
  document.getElementById("camp-detalle-wrap").style.display = "block";
  document.getElementById("btn-editar-campeonato").style.display = campEsAdmin ? "inline-block" : "none";
  document.getElementById("btn-eliminar-campeonato").style.display = campEsAdmin ? "inline-block" : "none";
  document.getElementById("camp-detalle-titulo").textContent = data.nombre;
  const cat = data.categoria ? `${data.categoria.nombre} · ${data.categoria.genero === "femenino" ? "Femenino" : "Masculino"}` : "Sin categoría";
  const fechas = [data.fecha_inicio, data.fecha_fin].filter(Boolean).map(campFechaCorta).join(" — ");
  document.getElementById("camp-detalle-meta").textContent =
    `${CAMP_TIPO[data.tipo] || data.tipo} · ${cat}${fechas ? " · " + fechas : ""}${data.organizador ? " · " + data.organizador : ""}`;

  await campCargarDetalleDatos();
  campCambiarTab(campTab || "tabla");
}

async function campCargarDetalleDatos() {
  const [insRes, partRes] = await Promise.all([
    supabaseClient
      .from("campeonato_equipo")
      .select("*, equipo:equipo_id (id, nombre)")
      .eq("campeonato_id", campActual.id),
    supabaseClient
      .from("partido")
      .select("*, local:equipo_local_id (id, nombre), visitante:equipo_visitante_id (id, nombre)")
      .eq("campeonato_id", campActual.id)
      .order("fecha")
  ]);

  campInscriptos = insRes.data || [];
  campPartidos = partRes.data || [];
  campRenderTabla();
  campRenderPartidos();
  campRenderEquipos();
}

function campNombreEquipo(id) {
  return campInscriptos.find(i => i.equipo_id === id)?.equipo?.nombre
    || campPartidos.find(p => p.equipo_local_id === id)?.local?.nombre
    || campPartidos.find(p => p.equipo_visitante_id === id)?.visitante?.nombre
    || "Equipo";
}

function campRenderTabla() {
  const panel = document.getElementById("camp-panel-tabla");
  if (campInscriptos.length === 0) {
    panel.innerHTML = `<div class="empty-state">Todavía no hay equipos inscriptos.${campEsAdmin ? " Sumalos en la pestaña Equipos." : ""}</div>`;
    return;
  }

  const grupos = {};
  campInscriptos.forEach(i => {
    const g = i.grupo?.trim() || "";
    if (!grupos[g]) grupos[g] = [];
    grupos[g].push(i);
  });

  const claves = Object.keys(grupos).sort((a, b) => a.localeCompare(b, "es"));
  panel.innerHTML = claves.map(g => {
    const filas = [...grupos[g]].sort((a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      const difA = (a.sets_a_favor || 0) - (a.sets_en_contra || 0);
      const difB = (b.sets_a_favor || 0) - (b.sets_en_contra || 0);
      if (difB !== difA) return difB - difA;
      return (b.sets_a_favor || 0) - (a.sets_a_favor || 0);
    });
    return `
      ${g ? `<div class="standings-group">Grupo ${campEsc(g)}</div>` : ""}
      <div class="standings-wrap">
        <table class="standings">
          <thead>
            <tr>
              <th>#</th><th class="equipo">Equipo</th><th>PJ</th><th>PG</th><th>PP</th><th>SF</th><th>SC</th><th>Dif</th><th>Pts</th>
            </tr>
          </thead>
          <tbody>
            ${filas.map((f, idx) => {
              const dif = (f.sets_a_favor || 0) - (f.sets_en_contra || 0);
              return `<tr>
                <td class="pos">${idx + 1}</td>
                <td class="equipo">${campEsc(f.equipo?.nombre || "Equipo")}</td>
                <td>${f.partidos_jugados || 0}</td>
                <td>${f.partidos_ganados || 0}</td>
                <td>${f.partidos_perdidos || 0}</td>
                <td>${f.sets_a_favor || 0}</td>
                <td>${f.sets_en_contra || 0}</td>
                <td>${dif > 0 ? "+" : ""}${dif}</td>
                <td class="pts">${f.puntos || 0}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }).join("") + `<p class="event-meta" style="margin-top:0.5rem">Puntos FIVB: 3-0 / 3-1 = 3 pts · 3-2 = 2 pts · 2-3 = 1 pt · 0-3 / 1-3 = 0 pts. La tabla se actualiza al marcar un partido como finalizado.</p>`;
}

function campRenderPartidos() {
  const panel = document.getElementById("camp-panel-partidos");
  const puedeCargar = campEsAdmin || campInscriptos.some(i => campStaffEquipoIds.has(i.equipo_id));
  const btn = puedeCargar
    ? `<div class="filters" style="margin-bottom:1rem"><button type="button" class="btn btn-accent" onclick="campAbrirPartido(null)">+ Nuevo partido</button></div>`
    : "";

  if (campPartidos.length === 0) {
    panel.innerHTML = `${btn}<div class="empty-state">Todavía no hay partidos en este campeonato.</div>`;
    return;
  }

  panel.innerHTML = `${btn}<div class="event-list">${campPartidos.map(p => {
    const local = p.local?.nombre || "Local";
    const vis = p.visitante?.nombre || p.rival_externo || "Visitante";
    const score = p.estado === "finalizado" || p.sets_local || p.sets_visitante
      ? `<div class="camp-match-score">${p.sets_local ?? 0}–${p.sets_visitante ?? 0}</div>`
      : "";
    const click = campPuedeEditarPartido(p) ? `onclick="campAbrirPartido('${p.id}')"` : "";
    return `
      <div class="event-card" ${click}>
        <div class="event-date">
          <div class="day">${new Date(p.fecha).getDate()}</div>
          <div class="month">${CAMP_MESES[new Date(p.fecha).getMonth()]}</div>
        </div>
        <div class="event-info">
          <div class="event-title">${campEsc(local)} vs ${campEsc(vis)}</div>
          <div class="event-meta">${campFechaHora(p.fecha)}${p.lugar ? " · " + campEsc(p.lugar) : ""}</div>
        </div>
        ${score}
        <span class="event-type ${p.estado === "finalizado" ? "entrenamiento" : p.estado === "en_curso" ? "reunion" : "otro"}">${CAMP_ESTADO[p.estado]}</span>
      </div>
    `;
  }).join("")}</div>`;
}

function campRenderEquipos() {
  const panel = document.getElementById("camp-panel-equipos");
  const btn = campEsAdmin
    ? `<div class="filters" style="margin-bottom:1rem"><button type="button" class="btn btn-accent" onclick="campAbrirSumarEquipo()">+ Sumar equipo</button></div>`
    : "";

  if (campInscriptos.length === 0) {
    panel.innerHTML = `${btn}<div class="empty-state">Nadie inscripto todavía.</div>`;
    return;
  }

  panel.innerHTML = `${btn}<div class="event-list">${campInscriptos.map(i => `
    <div class="event-card" style="cursor:default">
      <div class="event-info">
        <div class="event-title">${campEsc(i.equipo?.nombre || "Equipo")}</div>
        <div class="event-meta">${i.grupo ? "Grupo " + campEsc(i.grupo) : "Sin grupo"} · ${i.puntos || 0} pts</div>
      </div>
      ${campEsAdmin ? `<button type="button" class="btn btn-ghost btn-sm" onclick="campQuitarEquipo('${i.equipo_id}')">Quitar</button>` : ""}
    </div>
  `).join("")}</div>`;
}

async function campAbrirSumarEquipo() {
  document.getElementById("error-camp-equipo").classList.remove("show");
  document.getElementById("form-camp-equipo").reset();

  let q = supabaseClient.from("equipo").select("id, nombre, categoria_id").order("nombre");
  if (campActual.categoria_id) q = q.eq("categoria_id", campActual.categoria_id);
  const { data } = await q;
  const ya = new Set(campInscriptos.map(i => i.equipo_id));
  const libres = (data || []).filter(e => !ya.has(e.id));
  const select = document.getElementById("camp-equipo-id");
  if (libres.length === 0) {
    select.innerHTML = `<option value="">No hay equipos disponibles en esta categoría</option>`;
  } else {
    select.innerHTML = libres.map(e => `<option value="${e.id}">${campEsc(e.nombre)}</option>`).join("");
  }
  abrirModal("overlay-camp-equipo");
}

async function campAgregarEquipo(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-camp-equipo");
  errEl.classList.remove("show");
  const equipoId = document.getElementById("camp-equipo-id").value;
  if (!equipoId) {
    errEl.textContent = "Elegí un equipo.";
    errEl.classList.add("show");
    return;
  }
  const { error } = await supabaseClient.from("campeonato_equipo").insert({
    campeonato_id: campActual.id,
    equipo_id: equipoId,
    grupo: document.getElementById("camp-equipo-grupo").value.trim() || null
  });
  if (error) {
    errEl.textContent = "No se pudo sumar: " + error.message;
    errEl.classList.add("show");
    return;
  }
  cerrarModal("overlay-camp-equipo");
  await campCargarDetalleDatos();
}

async function campQuitarEquipo(equipoId) {
  const nombre = campNombreEquipo(equipoId);
  if (!confirm(`¿Quitar a ${nombre} del campeonato?`)) return;
  const { error } = await supabaseClient
    .from("campeonato_equipo")
    .delete()
    .eq("campeonato_id", campActual.id)
    .eq("equipo_id", equipoId);
  if (error) { alert("No se pudo quitar: " + error.message); return; }
  await campCargarDetalleDatos();
}

function campPoblarSelectsPartido(localId, visId) {
  const opts = campInscriptos.map(i =>
    `<option value="${i.equipo_id}">${campEsc(i.equipo?.nombre || "Equipo")}</option>`
  ).join("");
  const local = document.getElementById("camp-partido-local");
  const vis = document.getElementById("camp-partido-visitante");
  local.innerHTML = opts || `<option value="">Inscribí equipos primero</option>`;
  vis.innerHTML = `<option value="">Rival externo (escribir abajo)</option>` + opts;
  if (localId) local.value = localId;
  if (visId) vis.value = visId;
}

function campAbrirPartido(partidoId) {
  document.getElementById("error-camp-partido").classList.remove("show");
  document.getElementById("form-camp-partido").reset();
  campPartidoEdit = partidoId ? campPartidos.find(p => p.id === partidoId) : null;

  campPoblarSelectsPartido(campPartidoEdit?.equipo_local_id, campPartidoEdit?.equipo_visitante_id);
  document.getElementById("camp-partido-titulo").textContent = campPartidoEdit ? "Partido" : "Nuevo partido";
  document.getElementById("btn-eliminar-camp-partido").style.display = campPartidoEdit && campPuedeEditarPartido(campPartidoEdit) ? "inline-block" : "none";

  if (campPartidoEdit) {
    document.getElementById("camp-partido-rival").value = campPartidoEdit.rival_externo || "";
    document.getElementById("camp-partido-fecha").value = campAFechaLocal(campPartidoEdit.fecha);
    document.getElementById("camp-partido-lugar").value = campPartidoEdit.lugar || "";
    document.getElementById("camp-partido-estado").value = campPartidoEdit.estado || "programado";
    document.getElementById("camp-partido-sets-local").value = campPartidoEdit.sets_local ?? 0;
    document.getElementById("camp-partido-sets-visitante").value = campPartidoEdit.sets_visitante ?? 0;
  } else {
    document.getElementById("camp-partido-estado").value = "programado";
  }
  abrirModal("overlay-camp-partido");
}

async function campGuardarPartido(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-camp-partido");
  errEl.classList.remove("show");

  const localId = document.getElementById("camp-partido-local").value;
  const visId = document.getElementById("camp-partido-visitante").value || null;
  const rival = document.getElementById("camp-partido-rival").value.trim() || null;
  if (!localId) {
    errEl.textContent = "Elegí el equipo local.";
    errEl.classList.add("show");
    return;
  }
  if (visId && visId === localId) {
    errEl.textContent = "Local y visitante no pueden ser el mismo equipo.";
    errEl.classList.add("show");
    return;
  }
  if (!visId && !rival) {
    errEl.textContent = "Elegí un visitante o escribí el nombre del rival externo.";
    errEl.classList.add("show");
    return;
  }

  const setsL = Number(document.getElementById("camp-partido-sets-local").value || 0);
  const setsV = Number(document.getElementById("camp-partido-sets-visitante").value || 0);
  const estado = document.getElementById("camp-partido-estado").value;
  if (estado === "finalizado" && !(setsL === 3 || setsV === 3)) {
    errEl.textContent = "En un partido finalizado un equipo tiene que llegar a 3 sets.";
    errEl.classList.add("show");
    return;
  }

  const payload = {
    campeonato_id: campActual.id,
    equipo_local_id: localId,
    equipo_visitante_id: visId,
    rival_externo: visId ? null : rival,
    fecha: new Date(document.getElementById("camp-partido-fecha").value).toISOString(),
    lugar: document.getElementById("camp-partido-lugar").value.trim() || null,
    estado,
    sets_local: setsL,
    sets_visitante: setsV
  };

  const { error } = campPartidoEdit
    ? await supabaseClient.from("partido").update(payload).eq("id", campPartidoEdit.id)
    : await supabaseClient.from("partido").insert(payload);

  if (error) {
    errEl.textContent = "No se pudo guardar: " + error.message;
    errEl.classList.add("show");
    return;
  }

  cerrarModal("overlay-camp-partido");
  await campCargarDetalleDatos();
}

async function campEliminarPartido() {
  if (!campPartidoEdit) return;
  if (!confirm("¿Eliminar este partido?")) return;
  const { error } = await supabaseClient.from("partido").delete().eq("id", campPartidoEdit.id);
  if (error) {
    const errEl = document.getElementById("error-camp-partido");
    errEl.textContent = "No se pudo eliminar: " + error.message;
    errEl.classList.add("show");
    return;
  }
  cerrarModal("overlay-camp-partido");
  await campCargarDetalleDatos();
}

function campEsc(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
