// =========================================================
// MÓDULO: MENSAJERÍA
// =========================================================

let msgMiPerfil = null;
let msgEsStaff = false;
let msgEsAdmin = false;
let msgConversaciones = [];
let msgConvActual = null;
let msgMensajes = [];
let msgPerfilDm = null;
let msgChannel = null;
let msgTimeoutBusqueda = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("chat-lista")) return;

  const session = await requerirSesion();
  if (!session) return;

  await msgCargarMiPerfil(session.user.id);
  msgSuscribirRealtime();

  document.getElementById("btn-nuevo-dm").addEventListener("click", msgAbrirNuevoDm);
  document.getElementById("btn-confirmar-dm").addEventListener("click", msgConfirmarDm);
  document.getElementById("msg-buscar-persona").addEventListener("input", msgBuscarPersonas);
  document.getElementById("btn-nuevo-grupo").addEventListener("click", msgAbrirNuevoGrupo);
  document.getElementById("form-msg-grupo").addEventListener("submit", msgCrearOAbrirGrupo);
  document.getElementById("form-mensaje").addEventListener("submit", msgEnviar);
  document.getElementById("btn-chat-back").addEventListener("click", msgCerrarChatMovil);
  document.getElementById("btn-eliminar-chat").addEventListener("click", msgEliminarConversacion);
});

function msgAlAbrirVista() {
  if (msgMiPerfil) msgCargarConversaciones();
}

async function msgCargarMiPerfil(userId) {
  const { data, error } = await supabaseClient.from("perfil").select("*").eq("id", userId).single();
  if (error || !data) return;
  msgMiPerfil = data;
  msgEsStaff = ["entrenador", "delegado", "dirigente", "admin"].includes(data.rol);
  msgEsAdmin = ["dirigente", "admin"].includes(data.rol);
  if (msgEsStaff) document.getElementById("btn-nuevo-grupo").style.display = "inline-block";
  await msgCargarConversaciones();
}

function msgSuscribirRealtime() {
  if (msgChannel) return;
  msgChannel = supabaseClient
    .channel("mensajeria-club")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensaje" }, payload => {
      const nuevo = payload.new;
      if (!nuevo) return;
      if (msgConvActual && nuevo.conversacion_id === msgConvActual.id) {
        if (!msgMensajes.some(m => m.id === nuevo.id)) {
          msgMensajes.push(nuevo);
          msgRenderMensajes();
        }
        msgMarcarLeidos(msgMensajes);
      }
      msgCargarConversaciones();
    })
    .subscribe();
}

async function msgCargarConversaciones() {
  if (!msgMiPerfil) return;
  const lista = document.getElementById("chat-lista");

  const { data: misParts, error: errParts } = await supabaseClient
    .from("conversacion_participante")
    .select("conversacion_id")
    .eq("perfil_id", msgMiPerfil.id);

  if (errParts) {
    lista.innerHTML = `<div class="empty-state">No pudimos cargar tus chats: ${msgEsc(errParts.message)}</div>`;
    return;
  }

  const ids = [...new Set((misParts || []).map(p => p.conversacion_id))];
  if (ids.length === 0) {
    msgConversaciones = [];
    lista.innerHTML = `<div class="empty-state">Todavía no tenés conversaciones.<br>Empezá un mensaje nuevo.</div>`;
    return;
  }

  const [convRes, partRes, msgRes, leidoRes] = await Promise.all([
    supabaseClient.from("conversacion").select("*").in("id", ids),
    supabaseClient
      .from("conversacion_participante")
      .select("conversacion_id, perfil_id, perfil:perfil_id (id, nombre, apellido, foto_url, rol)")
      .in("conversacion_id", ids),
    supabaseClient
      .from("mensaje")
      .select("id, conversacion_id, remitente_id, contenido, created_at")
      .in("conversacion_id", ids)
      .order("created_at", { ascending: false })
      .limit(400),
    supabaseClient.from("mensaje_leido").select("mensaje_id").eq("perfil_id", msgMiPerfil.id)
  ]);

  if (convRes.error) {
    lista.innerHTML = `<div class="empty-state">No pudimos cargar tus chats: ${msgEsc(convRes.error.message)}</div>`;
    return;
  }

  const leidos = new Set((leidoRes.data || []).map(l => l.mensaje_id));
  const partsPorConv = {};
  (partRes.data || []).forEach(p => {
    if (!partsPorConv[p.conversacion_id]) partsPorConv[p.conversacion_id] = [];
    partsPorConv[p.conversacion_id].push(p);
  });

  const ultimoPorConv = {};
  const noLeidosPorConv = {};
  (msgRes.data || []).forEach(m => {
    if (!ultimoPorConv[m.conversacion_id]) ultimoPorConv[m.conversacion_id] = m;
    if (m.remitente_id !== msgMiPerfil.id && !leidos.has(m.id)) {
      noLeidosPorConv[m.conversacion_id] = (noLeidosPorConv[m.conversacion_id] || 0) + 1;
    }
  });

  msgConversaciones = (convRes.data || []).map(c => ({
    ...c,
    participantes: partsPorConv[c.id] || [],
    ultimo: ultimoPorConv[c.id] || null,
    noLeidos: noLeidosPorConv[c.id] || 0
  })).sort((a, b) => {
    const fa = a.ultimo?.created_at || a.created_at;
    const fb = b.ultimo?.created_at || b.created_at;
    return new Date(fb) - new Date(fa);
  });

  msgRenderLista();
}

function msgNombreConv(conv) {
  if (conv.tipo === "grupal") return conv.nombre || "Grupo";
  const otro = (conv.participantes || []).find(p => p.perfil_id !== msgMiPerfil.id);
  return otro?.perfil ? `${otro.perfil.nombre} ${otro.perfil.apellido}` : "Chat";
}

function msgRenderLista() {
  const lista = document.getElementById("chat-lista");
  if (msgConversaciones.length === 0) {
    lista.innerHTML = `<div class="empty-state">Todavía no tenés conversaciones.<br>Empezá un mensaje nuevo.</div>`;
    return;
  }

  lista.innerHTML = msgConversaciones.map(c => {
    const activo = msgConvActual?.id === c.id ? " active" : "";
    const preview = c.ultimo
      ? msgEsc(c.ultimo.contenido)
      : "Sin mensajes todavía";
    const badge = c.noLeidos > 0 ? `<span class="chat-unread">${c.noLeidos > 99 ? "99+" : c.noLeidos}</span>` : "";
    return `
      <div class="chat-item${activo}" onclick="msgAbrirConversacion('${c.id}')">
        <div class="player-avatar">${msgAvatarConv(c)}</div>
        <div class="preview">
          <div class="preview-name">${msgEsc(msgNombreConv(c))}</div>
          <div class="preview-text">${preview}</div>
        </div>
        ${badge}
      </div>
    `;
  }).join("");
}

function msgAvatarConv(conv) {
  if (conv.tipo === "grupal") return "GR";
  const otro = (conv.participantes || []).find(p => p.perfil_id !== msgMiPerfil.id)?.perfil;
  if (otro?.foto_url) return `<img src="${msgEsc(otro.foto_url)}" alt="">`;
  return msgEsc(iniciales(otro?.nombre, otro?.apellido) || "?");
}

async function msgAbrirConversacion(convId) {
  const conv = msgConversaciones.find(c => c.id === convId);
  if (!conv) return;
  msgConvActual = conv;

  document.getElementById("chat-vacio").style.display = "none";
  document.getElementById("chat-activo").style.display = "flex";
  document.getElementById("chat-shell").classList.add("show-chat");
  document.getElementById("chat-titulo").textContent = msgNombreConv(conv);
  const n = (conv.participantes || []).length;
  document.getElementById("chat-meta").textContent = conv.tipo === "grupal"
    ? `Grupo · ${n} integrante${n === 1 ? "" : "s"}`
    : "Mensaje directo";

  const puedoBorrar = msgEsAdmin || conv.created_by === msgMiPerfil.id;
  document.getElementById("btn-eliminar-chat").style.display = puedoBorrar ? "inline-block" : "none";

  msgRenderLista();
  document.getElementById("chat-mensajes").innerHTML = `<div class="empty-state">Cargando mensajes…</div>`;

  const { data, error } = await supabaseClient
    .from("mensaje")
    .select("*")
    .eq("conversacion_id", convId)
    .order("created_at")
    .limit(200);

  if (error) {
    document.getElementById("chat-mensajes").innerHTML = `<div class="empty-state">No pudimos cargar los mensajes: ${msgEsc(error.message)}</div>`;
    return;
  }

  msgMensajes = data || [];
  msgRenderMensajes();
  await msgMarcarLeidos(msgMensajes);
  await msgCargarConversaciones();
}

function msgRenderMensajes() {
  const box = document.getElementById("chat-mensajes");
  if (!msgMensajes.length) {
    box.innerHTML = `<div class="empty-state">Todavía no hay mensajes. Escribí el primero.</div>`;
    return;
  }

  const perfiles = {};
  (msgConvActual?.participantes || []).forEach(p => {
    if (p.perfil) perfiles[p.perfil_id] = p.perfil;
  });

  let html = "";
  let ultimoDia = "";
  msgMensajes.forEach(m => {
    const dia = new Date(m.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "long" });
    if (dia !== ultimoDia) {
      html += `<div class="chat-day">${msgEsc(dia)}</div>`;
      ultimoDia = dia;
    }
    const mio = m.remitente_id === msgMiPerfil.id;
    const autor = perfiles[m.remitente_id];
    const nombre = autor ? `${autor.nombre} ${autor.apellido}` : "Alguien";
    html += `
      <div class="bubble ${mio ? "mine" : "other"}">
        ${!mio && msgConvActual?.tipo === "grupal" ? `<div class="who">${msgEsc(nombre)}</div>` : ""}
        <div>${msgEsc(m.contenido)}</div>
        <div class="when">${msgHora(m.created_at)}</div>
      </div>
    `;
  });
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}

async function msgMarcarLeidos(mensajes) {
  if (!msgMiPerfil) return;
  const pendientes = (mensajes || []).filter(m => m.remitente_id !== msgMiPerfil.id);
  if (pendientes.length === 0) return;
  const filas = pendientes.map(m => ({
    mensaje_id: m.id,
    perfil_id: msgMiPerfil.id,
    leido_at: new Date().toISOString()
  }));
  await supabaseClient.from("mensaje_leido").upsert(filas, { onConflict: "mensaje_id,perfil_id" });
}

async function msgEnviar(e) {
  e.preventDefault();
  if (!msgConvActual || !msgMiPerfil) return;
  const input = document.getElementById("chat-input");
  const texto = input.value.trim();
  if (!texto) return;

  input.value = "";
  const { data, error } = await supabaseClient
    .from("mensaje")
    .insert({
      conversacion_id: msgConvActual.id,
      remitente_id: msgMiPerfil.id,
      contenido: texto
    })
    .select()
    .single();

  if (error) {
    input.value = texto;
    alert("No se pudo enviar: " + error.message);
    return;
  }

  if (data && !msgMensajes.some(m => m.id === data.id)) {
    msgMensajes.push(data);
    msgRenderMensajes();
  }
  await msgCargarConversaciones();
}

function msgCerrarChatMovil() {
  document.getElementById("chat-shell").classList.remove("show-chat");
}

function msgNuevoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, ch => {
    const r = Math.random() * 16 | 0;
    return (ch === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ---------- Nuevo mensaje directo ----------
function msgAbrirNuevoDm() {
  msgPerfilDm = null;
  document.getElementById("error-msg-dm").classList.remove("show");
  document.getElementById("msg-buscar-persona").value = "";
  document.getElementById("msg-resultados-busqueda").innerHTML = "";
  abrirModal("overlay-msg-dm");
}

function msgBuscarPersonas() {
  clearTimeout(msgTimeoutBusqueda);
  const texto = document.getElementById("msg-buscar-persona").value.trim();
  const cont = document.getElementById("msg-resultados-busqueda");
  msgPerfilDm = null;
  if (texto.length < 2) { cont.innerHTML = ""; return; }

  const q = texto.replace(/[,()%]/g, "");
  msgTimeoutBusqueda = setTimeout(async () => {
    const { data, error } = await supabaseClient
      .from("perfil")
      .select("id, nombre, apellido, email, rol")
      .neq("id", msgMiPerfil.id)
      .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(8);

    if (error || !data || data.length === 0) {
      cont.innerHTML = `<div class="search-result-item">Sin resultados</div>`;
      return;
    }
    cont.innerHTML = data.map(p => `
      <div class="search-result-item" data-id="${p.id}" data-nombre="${msgEsc(p.nombre)} ${msgEsc(p.apellido)}" onclick="msgElegirPersona(this)">
        <span>${msgEsc(p.nombre)} ${msgEsc(p.apellido)}</span>
        <span style="color:var(--ink-soft)">${msgEsc(capitalizar(p.rol))}</span>
      </div>
    `).join("");
  }, 300);
}

function msgElegirPersona(el) {
  msgPerfilDm = el.dataset.id;
  document.querySelectorAll("#msg-resultados-busqueda .search-result-item").forEach(item => item.classList.remove("selected"));
  el.classList.add("selected");
  document.getElementById("msg-buscar-persona").value = el.dataset.nombre;
}

async function msgConfirmarDm() {
  const errEl = document.getElementById("error-msg-dm");
  errEl.classList.remove("show");
  if (!msgPerfilDm) {
    errEl.textContent = "Elegí una persona de la lista.";
    errEl.classList.add("show");
    return;
  }

  const existente = msgConversaciones.find(c =>
    c.tipo === "individual" &&
    (c.participantes || []).some(p => p.perfil_id === msgPerfilDm)
  );
  if (existente) {
    cerrarModal("overlay-msg-dm");
    await msgAbrirConversacion(existente.id);
    return;
  }

  const id = msgNuevoId();
  const { error: errConv } = await supabaseClient.from("conversacion").insert({
    id,
    tipo: "individual",
    created_by: msgMiPerfil.id
  });
  if (errConv) {
    errEl.textContent = "No se pudo crear el chat: " + errConv.message;
    errEl.classList.add("show");
    return;
  }

  const { error: errParts } = await supabaseClient.from("conversacion_participante").insert([
    { conversacion_id: id, perfil_id: msgMiPerfil.id },
    { conversacion_id: id, perfil_id: msgPerfilDm }
  ]);
  if (errParts) {
    errEl.textContent = "El chat se creó, pero no se pudieron sumar los participantes: " + errParts.message;
    errEl.classList.add("show");
    return;
  }

  cerrarModal("overlay-msg-dm");
  await msgCargarConversaciones();
  await msgAbrirConversacion(id);
}

// ---------- Grupo de equipo ----------
async function msgAbrirNuevoGrupo() {
  document.getElementById("error-msg-grupo").classList.remove("show");
  document.getElementById("form-msg-grupo").reset();

  const { data: equipos, error } = await supabaseClient
    .from("equipo")
    .select("id, nombre, categoria:categoria_id (nombre, genero)")
    .order("nombre");

  const select = document.getElementById("msg-grupo-equipo");
  if (error || !equipos || equipos.length === 0) {
    select.innerHTML = `<option value="">No hay equipos cargados</option>`;
    abrirModal("overlay-msg-grupo");
    return;
  }

  let visibles = equipos;
  if (!msgEsAdmin) {
    const { data: staff } = await supabaseClient
      .from("cuerpo_tecnico")
      .select("equipo_id")
      .eq("perfil_id", msgMiPerfil.id);
    const ids = new Set((staff || []).map(s => s.equipo_id));
    visibles = equipos.filter(e => ids.has(e.id));
  }

  if (visibles.length === 0) {
    select.innerHTML = `<option value="">No tenés equipos asignados</option>`;
  } else {
    select.innerHTML = visibles.map(e => {
      const cat = e.categoria ? ` · ${e.categoria.nombre}` : "";
      return `<option value="${e.id}">${msgEsc(e.nombre)}${msgEsc(cat)}</option>`;
    }).join("");
  }
  abrirModal("overlay-msg-grupo");
}

async function msgCrearOAbrirGrupo(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-msg-grupo");
  errEl.classList.remove("show");

  const equipoId = document.getElementById("msg-grupo-equipo").value;
  if (!equipoId) {
    errEl.textContent = "Elegí un equipo.";
    errEl.classList.add("show");
    return;
  }

  const existente = msgConversaciones.find(c => c.tipo === "grupal" && c.equipo_id === equipoId);
  if (existente) {
    const syncErr = await msgSincronizarGrupo(existente.id, equipoId);
    if (syncErr) {
      errEl.textContent = syncErr;
      errEl.classList.add("show");
      return;
    }
    cerrarModal("overlay-msg-grupo");
    await msgCargarConversaciones();
    await msgAbrirConversacion(existente.id);
    return;
  }

  const miembros = await msgMiembrosDeEquipo(equipoId);
  if (miembros.error) {
    errEl.textContent = miembros.error;
    errEl.classList.add("show");
    return;
  }

  const nombre = document.getElementById("msg-grupo-nombre").value.trim()
    || document.getElementById("msg-grupo-equipo").selectedOptions[0]?.textContent
    || "Grupo del equipo";

  const id = msgNuevoId();
  const { error: errConv } = await supabaseClient.from("conversacion").insert({
    id,
    tipo: "grupal",
    equipo_id: equipoId,
    nombre,
    created_by: msgMiPerfil.id
  });
  if (errConv) {
    errEl.textContent = "No se pudo crear el grupo: " + errConv.message;
    errEl.classList.add("show");
    return;
  }

  const ids = [...new Set([msgMiPerfil.id, ...miembros.ids])];
  const { error: errParts } = await supabaseClient.from("conversacion_participante").insert(
    ids.map(perfilId => ({ conversacion_id: id, perfil_id: perfilId }))
  );
  if (errParts) {
    errEl.textContent = "El grupo se creó, pero no se pudieron sumar los integrantes: " + errParts.message;
    errEl.classList.add("show");
    return;
  }

  cerrarModal("overlay-msg-grupo");
  await msgCargarConversaciones();
  await msgAbrirConversacion(id);
}

async function msgMiembrosDeEquipo(equipoId) {
  const [jugRes, staffRes] = await Promise.all([
    supabaseClient.from("jugador").select("perfil_id").eq("equipo_id", equipoId).eq("activo", true),
    supabaseClient.from("cuerpo_tecnico").select("perfil_id").eq("equipo_id", equipoId)
  ]);
  if (jugRes.error) return { error: "No se pudo leer el plantel: " + jugRes.error.message };
  if (staffRes.error) return { error: "No se pudo leer el cuerpo técnico: " + staffRes.error.message };
  return { ids: [...(jugRes.data || []), ...(staffRes.data || [])].map(r => r.perfil_id) };
}

async function msgSincronizarGrupo(conversacionId, equipoId) {
  const miembros = await msgMiembrosDeEquipo(equipoId);
  if (miembros.error) return miembros.error;

  const { data: actuales, error } = await supabaseClient
    .from("conversacion_participante")
    .select("perfil_id")
    .eq("conversacion_id", conversacionId);
  if (error) return error.message;

  const ya = new Set((actuales || []).map(p => p.perfil_id));
  const faltan = [...new Set(miembros.ids)].filter(id => !ya.has(id));
  if (faltan.length === 0) return null;

  const { error: errIns } = await supabaseClient.from("conversacion_participante").insert(
    faltan.map(perfilId => ({ conversacion_id: conversacionId, perfil_id: perfilId }))
  );
  return errIns ? errIns.message : null;
}

async function msgEliminarConversacion() {
  if (!msgConvActual) return;
  if (!confirm(`¿Eliminar "${msgNombreConv(msgConvActual)}"? Se borran todos los mensajes.`)) return;

  const { error } = await supabaseClient.from("conversacion").delete().eq("id", msgConvActual.id);
  if (error) {
    alert("No se pudo eliminar: " + error.message + "\nSi todavía no corriste fix_mensajeria_rls.sql, ejecutaló en Supabase.");
    return;
  }

  msgConvActual = null;
  msgMensajes = [];
  document.getElementById("chat-activo").style.display = "none";
  document.getElementById("chat-vacio").style.display = "flex";
  document.getElementById("chat-shell").classList.remove("show-chat");
  await msgCargarConversaciones();
}

function msgHora(iso) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function msgEsc(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
