// =========================================================
// MÓDULO: PLANTEL Y PERFILES
// =========================================================

let miPerfil = null;
let esStaff = false;
let esAdmin = false;
let equipoActualId = null;
let jugadorSeleccionado = null; // { id, perfil_id, ...}
let perfilBusquedaSeleccionado = null; // perfil elegido en el buscador de "agregar jugador"

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("roster-container")) return; // no estamos en dashboard.html

  const session = await requerirSesion();
  if (!session) return;

  await cargarMiPerfil(session.user.id);
  await cargarCategorias();

  document.getElementById("btn-logout").addEventListener("click", cerrarSesion);
  document.getElementById("filtro-categoria").addEventListener("change", onCambioCategoria);
  document.getElementById("filtro-equipo").addEventListener("change", onCambioEquipo);
  document.getElementById("btn-nuevo-jugador").addEventListener("click", () => abrirModal("overlay-nuevo"));
  document.getElementById("buscar-jugador").addEventListener("input", buscarPerfiles);
  document.getElementById("btn-confirmar-nuevo").addEventListener("click", agregarJugadorAlEquipo);
  document.getElementById("form-perfil").addEventListener("submit", guardarPerfilJugador);
  document.getElementById("perfil-avatar-input").addEventListener("change", subirAvatar);

  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => cerrarModal(btn.dataset.close));
  });

  document.getElementById("btn-gestionar").addEventListener("click", abrirGestion);
  document.getElementById("form-nueva-categoria").addEventListener("submit", crearCategoria);
  document.getElementById("form-nuevo-equipo").addEventListener("submit", crearEquipo);
});

function abrirModal(id) { document.getElementById(id).classList.add("show"); }
function cerrarModal(id) { document.getElementById(id).classList.remove("show"); }

async function cargarMiPerfil(userId) {
  const { data, error } = await supabaseClient
    .from("perfil")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) { console.error(error); return; }
  miPerfil = data;
  esStaff = ["entrenador", "delegado", "dirigente", "admin"].includes(data.rol);
  esAdmin = ["dirigente", "admin"].includes(data.rol);

  document.getElementById("who-nombre").textContent = `${data.nombre} ${data.apellido}`;
  document.getElementById("who-rol").textContent = capitalizar(data.rol);
  if (esStaff) document.getElementById("btn-nuevo-jugador").style.display = "inline-block";
  if (esAdmin) document.getElementById("btn-gestionar").style.display = "inline-block";
}

async function cargarCategorias() {
  const { data, error } = await supabaseClient.from("categoria").select("*").order("nombre");
  const select = document.getElementById("filtro-categoria");
  if (error || !data || data.length === 0) {
    select.innerHTML = `<option value="">No hay categorías cargadas</option>`;
    return;
  }
  select.innerHTML = `<option value="">Elegí una categoría</option>` +
    data.map(c => `<option value="${c.id}">${c.nombre} · ${c.genero === "femenino" ? "Femenino" : "Masculino"}</option>`).join("");
}

async function onCambioCategoria() {
  const categoriaId = document.getElementById("filtro-categoria").value;
  const selectEquipo = document.getElementById("filtro-equipo");
  equipoActualId = null;
  renderRoster([]);

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

function onCambioEquipo() {
  equipoActualId = document.getElementById("filtro-equipo").value || null;
  if (equipoActualId) cargarRoster(equipoActualId);
  else renderRoster([]);
}

async function cargarRoster(equipoId) {
  document.getElementById("roster-container").innerHTML = `<div class="empty-state">Cargando plantel…</div>`;

  const { data, error } = await supabaseClient
    .from("jugador")
    .select("*, perfil:perfil_id (nombre, apellido, foto_url)")
    .eq("equipo_id", equipoId)
    .order("dorsal");

  if (error) {
    document.getElementById("roster-container").innerHTML = `<div class="empty-state">No pudimos cargar el plantel: ${error.message}</div>`;
    return;
  }
  renderRoster(data || []);
}

function renderRoster(jugadores) {
  const cont = document.getElementById("roster-container");
  if (!jugadores || jugadores.length === 0) {
    cont.innerHTML = `<div class="empty-state">Todavía no hay jugadores en este equipo.</div>`;
    return;
  }
  cont.innerHTML = `<div class="roster-grid">${jugadores.map(j => `
    <div class="player-card" onclick="abrirPerfilJugador('${j.id}')">
      <div class="player-dorsal">${j.dorsal ?? "–"}</div>
      <div class="player-avatar">
        ${j.perfil?.foto_url ? `<img src="${j.perfil.foto_url}">` : iniciales(j.perfil?.nombre, j.perfil?.apellido)}
      </div>
      <div class="player-info">
        <div class="player-name">${j.perfil?.nombre ?? ""} ${j.perfil?.apellido ?? ""}</div>
        <div class="player-meta">${capitalizar(j.posicion || "sin posición")}</div>
        ${!j.activo ? `<span class="badge inactive">Inactivo</span>` : ""}
      </div>
    </div>
  `).join("")}</div>`;
}

// ---------- Perfil individual ----------
async function abrirPerfilJugador(jugadorId) {
  const { data: jugador, error } = await supabaseClient
    .from("jugador")
    .select("*, perfil:perfil_id (nombre, apellido, foto_url)")
    .eq("id", jugadorId)
    .single();

  if (error) { alert("No se pudo abrir el perfil: " + error.message); return; }
  jugadorSeleccionado = jugador;

  document.getElementById("perfil-titulo").textContent = `${jugador.perfil.nombre} ${jugador.perfil.apellido}`;
  document.getElementById("perfil-nombre").value = `${jugador.perfil.nombre} ${jugador.perfil.apellido}`;
  document.getElementById("perfil-dorsal").value = jugador.dorsal ?? "";
  document.getElementById("perfil-posicion").value = jugador.posicion ?? "punta";
  document.getElementById("perfil-altura").value = jugador.altura_cm ?? "";
  document.getElementById("perfil-lado").value = jugador.lado_dominante ?? "derecho";
  document.getElementById("perfil-activo").checked = jugador.activo;
  document.getElementById("perfil-avatar").innerHTML = jugador.perfil.foto_url
    ? `<img src="${jugador.perfil.foto_url}">`
    : iniciales(jugador.perfil.nombre, jugador.perfil.apellido);

  // ficha médica (puede no existir todavía, o no ser visible por RLS si no corresponde)
  const { data: ficha } = await supabaseClient
    .from("jugador_ficha_medica")
    .select("*")
    .eq("jugador_id", jugadorId)
    .maybeSingle();

  document.getElementById("perfil-sangre").value = ficha?.grupo_sanguineo ?? "";
  document.getElementById("perfil-alergias").value = ficha?.alergias ?? "";
  document.getElementById("perfil-contacto-nombre").value = ficha?.contacto_emergencia_nombre ?? "";
  document.getElementById("perfil-contacto-tel").value = ficha?.contacto_emergencia_telefono ?? "";

  document.getElementById("error-perfil").classList.remove("show");
  abrirModal("overlay-perfil");
}

async function guardarPerfilJugador(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-perfil");
  errEl.classList.remove("show");

  try {
    const { error: errJugador } = await supabaseClient
      .from("jugador")
      .update({
        dorsal: document.getElementById("perfil-dorsal").value || null,
        posicion: document.getElementById("perfil-posicion").value,
        altura_cm: document.getElementById("perfil-altura").value || null,
        lado_dominante: document.getElementById("perfil-lado").value,
        activo: document.getElementById("perfil-activo").checked
      })
      .eq("id", jugadorSeleccionado.id);
    if (errJugador) throw errJugador;

    const { error: errFicha } = await supabaseClient
      .from("jugador_ficha_medica")
      .upsert({
        jugador_id: jugadorSeleccionado.id,
        grupo_sanguineo: document.getElementById("perfil-sangre").value || null,
        alergias: document.getElementById("perfil-alergias").value || null,
        contacto_emergencia_nombre: document.getElementById("perfil-contacto-nombre").value || null,
        contacto_emergencia_telefono: document.getElementById("perfil-contacto-tel").value || null,
        updated_at: new Date().toISOString()
      });
    if (errFicha) throw errFicha;

    cerrarModal("overlay-perfil");
    cargarRoster(equipoActualId);
  } catch (err) {
    errEl.textContent = "No se pudo guardar: " + err.message;
    errEl.classList.add("show");
  }
}

async function subirAvatar(e) {
  const file = e.target.files[0];
  if (!file || !jugadorSeleccionado) return;

  const ext = file.name.split(".").pop();
  const path = `${jugadorSeleccionado.perfil_id}/avatar.${ext}`;

  const { error: errUpload } = await supabaseClient.storage
    .from("avatares")
    .upload(path, file, { upsert: true });

  if (errUpload) { alert("No se pudo subir la foto: " + errUpload.message); return; }

  const { data } = supabaseClient.storage.from("avatares").getPublicUrl(path);
  const urlConCache = `${data.publicUrl}?t=${Date.now()}`;

  await supabaseClient.from("perfil").update({ foto_url: urlConCache }).eq("id", jugadorSeleccionado.perfil_id);
  document.getElementById("perfil-avatar").innerHTML = `<img src="${urlConCache}">`;
  cargarRoster(equipoActualId);
}

// ---------- Agregar jugador existente al equipo ----------
let timeoutBusqueda = null;
function buscarPerfiles() {
  clearTimeout(timeoutBusqueda);
  const texto = document.getElementById("buscar-jugador").value.trim();
  const cont = document.getElementById("resultados-busqueda");
  perfilBusquedaSeleccionado = null;
  if (texto.length < 2) { cont.innerHTML = ""; return; }

  timeoutBusqueda = setTimeout(async () => {
    const { data, error } = await supabaseClient
      .from("perfil")
      .select("id, nombre, apellido, email")
      .eq("rol", "jugador")
      .or(`nombre.ilike.%${texto}%,apellido.ilike.%${texto}%,email.ilike.%${texto}%`)
      .limit(8);

    if (error || !data || data.length === 0) {
      cont.innerHTML = `<div class="search-result-item">Sin resultados</div>`;
      return;
    }
    cont.innerHTML = data.map(p => `
      <div class="search-result-item" data-id="${p.id}" onclick="seleccionarPerfilBusqueda('${p.id}', '${p.nombre} ${p.apellido}')">
        <span>${p.nombre} ${p.apellido}</span><span style="color:var(--ink-soft)">${p.email}</span>
      </div>
    `).join("");
  }, 300);
}

function seleccionarPerfilBusqueda(id, nombreCompleto) {
  perfilBusquedaSeleccionado = id;
  document.querySelectorAll("#resultados-busqueda .search-result-item").forEach(el => el.classList.remove("selected"));
  document.querySelector(`#resultados-busqueda [data-id="${id}"]`)?.classList.add("selected");
  document.getElementById("buscar-jugador").value = nombreCompleto;
}

async function agregarJugadorAlEquipo() {
  const errEl = document.getElementById("error-nuevo");
  errEl.classList.remove("show");

  if (!perfilBusquedaSeleccionado) {
    errEl.textContent = "Elegí una persona de la lista de resultados.";
    errEl.classList.add("show");
    return;
  }
  if (!equipoActualId) {
    errEl.textContent = "Elegí primero una categoría y un equipo arriba.";
    errEl.classList.add("show");
    return;
  }

  const { error } = await supabaseClient.from("jugador").insert({
    perfil_id: perfilBusquedaSeleccionado,
    equipo_id: equipoActualId,
    dorsal: document.getElementById("nuevo-dorsal").value || null,
    posicion: document.getElementById("nuevo-posicion").value
  });

  if (error) {
    errEl.textContent = "No se pudo agregar: " + error.message;
    errEl.classList.add("show");
    return;
  }

  cerrarModal("overlay-nuevo");
  document.getElementById("buscar-jugador").value = "";
  document.getElementById("resultados-busqueda").innerHTML = "";
  perfilBusquedaSeleccionado = null;
  cargarRoster(equipoActualId);
}

// ---------- Gestión de categorías y equipos (admin/dirigente) ----------
async function abrirGestion() {
  document.getElementById("error-categoria").classList.remove("show");
  document.getElementById("error-equipo").classList.remove("show");
  document.getElementById("form-nueva-categoria").reset();
  document.getElementById("form-nuevo-equipo").reset();
  await poblarSelectCategoriasEnGestion();
  abrirModal("overlay-gestion");
}

async function poblarSelectCategoriasEnGestion() {
  const { data, error } = await supabaseClient.from("categoria").select("*").order("nombre");
  const select = document.getElementById("equipo-categoria");
  if (error || !data || data.length === 0) {
    select.innerHTML = `<option value="">Creá primero una categoría</option>`;
    return;
  }
  select.innerHTML = data.map(c =>
    `<option value="${c.id}">${c.nombre} · ${c.genero === "femenino" ? "Femenino" : "Masculino"}</option>`
  ).join("");
}

async function crearCategoria(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-categoria");
  errEl.classList.remove("show");

  const { error } = await supabaseClient.from("categoria").insert({
    nombre: document.getElementById("cat-nombre").value.trim(),
    genero: document.getElementById("cat-genero").value,
    temporada: document.getElementById("cat-temporada").value.trim() || null
  });

  if (error) {
    errEl.textContent = "No se pudo crear: " + error.message;
    errEl.classList.add("show");
    return;
  }

  document.getElementById("form-nueva-categoria").reset();
  await poblarSelectCategoriasEnGestion();
  await cargarCategorias(); // refresca el filtro principal de arriba
}

async function crearEquipo(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-equipo");
  errEl.classList.remove("show");

  const categoriaId = document.getElementById("equipo-categoria").value;
  if (!categoriaId) {
    errEl.textContent = "Elegí (o creá primero) una categoría.";
    errEl.classList.add("show");
    return;
  }

  const { error } = await supabaseClient.from("equipo").insert({
    categoria_id: categoriaId,
    nombre: document.getElementById("equipo-nombre").value.trim()
  });

  if (error) {
    errEl.textContent = "No se pudo crear: " + error.message;
    errEl.classList.add("show");
    return;
  }

  document.getElementById("form-nuevo-equipo").reset();

  // si la categoría del filtro principal coincide, refrescamos también su lista de equipos
  if (document.getElementById("filtro-categoria").value === categoriaId) {
    await onCambioCategoria();
  }
}

// ---------- utilidades ----------
function capitalizar(texto) {
  if (!texto) return "";
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace(/_/g, " ");
}
function iniciales(nombre, apellido) {
  return `${(nombre || "?")[0]}${(apellido || "")[0] || ""}`.toUpperCase();
}
