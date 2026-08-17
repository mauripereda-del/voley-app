// =========================================================
// MÓDULO: POST PARTIDO
// =========================================================

let postEquipoActualId = null;
let postEsStaffDeEquipo = false;
let postMiPerfilId = null;
let postJugadores = [];
let postPartidos = [];
let postPosts = [];
let postTab = "todos";
let postPartido = null;
let postActual = null;
let postComentarios = [];
let postFotosFirmadas = {};

const POST_MESES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("post-lista")) return;

  const session = await requerirSesion();
  if (!session) return;
  postMiPerfilId = session.user.id;

  await postCargarCategorias();

  document.getElementById("post-filtro-categoria").addEventListener("change", postOnCambioCategoria);
  document.getElementById("post-filtro-equipo").addEventListener("change", postOnCambioEquipo);
  document.getElementById("btn-post-volver").addEventListener("click", postVolver);
  document.getElementById("btn-post-eliminar").addEventListener("click", postEliminar);
  document.querySelectorAll("[data-post-tab]").forEach(btn => {
    btn.addEventListener("click", () => postCambiarTab(btn.dataset.postTab));
  });
});

function postCambiarTab(tab) {
  postTab = tab;
  document.querySelectorAll("[data-post-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.postTab === tab);
  });
  postRenderLista();
}

async function postCargarCategorias() {
  const { data, error } = await supabaseClient.from("categoria").select("*").order("nombre");
  const select = document.getElementById("post-filtro-categoria");
  if (error || !data || data.length === 0) {
    select.innerHTML = `<option value="">No hay categorías cargadas</option>`;
    return;
  }
  select.innerHTML = `<option value="">Elegí una categoría</option>` +
    data.map(c => `<option value="${c.id}">${c.nombre} · ${c.genero === "femenino" ? "Femenino" : "Masculino"}</option>`).join("");
}

async function postOnCambioCategoria() {
  const categoriaId = document.getElementById("post-filtro-categoria").value;
  const selectEquipo = document.getElementById("post-filtro-equipo");
  postEquipoActualId = null;
  postRenderLista();

  if (!categoriaId) {
    selectEquipo.innerHTML = `<option value="">Seleccioná una categoría primero</option>`;
    return;
  }

  const { data, error } = await supabaseClient.from("equipo").select("*").eq("categoria_id", categoriaId).order("nombre");
  if (error || !data || data.length === 0) {
    selectEquipo.innerHTML = `<option value="">No hay equipos en esta categoría</option>`;
    return;
  }
  selectEquipo.innerHTML = `<option value="">Elegí un equipo</option>` +
    data.map(e => `<option value="${e.id}">${e.nombre}</option>`).join("");
}

async function postOnCambioEquipo() {
  postEquipoActualId = document.getElementById("post-filtro-equipo").value || null;
  if (!postEquipoActualId) {
    postPartidos = [];
    postPosts = [];
    postRenderLista();
    return;
  }
  await postDeterminarPermiso(postEquipoActualId);
  await postCargarTodo(postEquipoActualId);
}

async function postDeterminarPermiso(equipoId) {
  postEsStaffDeEquipo = false;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;
  const { data: perfil } = await supabaseClient.from("perfil").select("rol").eq("id", user.id).single();
  if (!perfil) return;
  if (["admin", "dirigente"].includes(perfil.rol)) {
    postEsStaffDeEquipo = true;
    return;
  }
  const { data: staff } = await supabaseClient
    .from("cuerpo_tecnico")
    .select("id")
    .eq("equipo_id", equipoId)
    .eq("perfil_id", user.id)
    .maybeSingle();
  postEsStaffDeEquipo = !!staff;
}

async function postCargarTodo(equipoId) {
  document.getElementById("post-lista").innerHTML = `<div class="empty-state">Cargando partidos…</div>`;

  const [partRes, jugRes] = await Promise.all([
    supabaseClient
      .from("partido")
      .select("*, local:equipo_local_id (id, nombre), visitante:equipo_visitante_id (id, nombre)")
      .or(`equipo_local_id.eq.${equipoId},equipo_visitante_id.eq.${equipoId}`)
      .order("fecha", { ascending: false }),
    supabaseClient
      .from("jugador")
      .select("id, dorsal, perfil:perfil_id (nombre, apellido)")
      .eq("equipo_id", equipoId)
      .order("dorsal")
  ]);

  if (partRes.error) {
    document.getElementById("post-lista").innerHTML =
      `<div class="empty-state">No pudimos cargar los partidos: ${postEsc(partRes.error.message)}</div>`;
    return;
  }

  postPartidos = partRes.data || [];
  postJugadores = jugRes.data || [];

  const ids = postPartidos.map(p => p.id);
  if (ids.length === 0) {
    postPosts = [];
    postRenderLista();
    return;
  }

  const { data: posts } = await supabaseClient.from("post_partido").select("*").in("partido_id", ids);
  postPosts = posts || [];
  postRenderLista();
}

function postDe(partidoId) {
  return postPosts.find(p => p.partido_id === partidoId) || null;
}

function postNombreRival(p) {
  const somosLocal = p.equipo_local_id === postEquipoActualId;
  if (somosLocal) return p.visitante?.nombre || p.rival_externo || "Rival";
  return p.local?.nombre || p.rival_externo || "Rival";
}

function postRenderLista() {
  const cont = document.getElementById("post-lista");
  if (!postEquipoActualId) {
    cont.innerHTML = `<div class="empty-state">Elegí una categoría y un equipo para ver los post partido.</div>`;
    return;
  }

  let lista = postPartidos;
  if (postTab === "con") lista = lista.filter(p => postDe(p.id));
  if (postTab === "sin") lista = lista.filter(p => !postDe(p.id));

  if (lista.length === 0) {
    cont.innerHTML = `<div class="empty-state">${postPartidos.length === 0 ? "No hay partidos. Crealos en Campeonatos o Alineaciones." : "No hay partidos en esta vista."}</div>`;
    return;
  }

  cont.innerHTML = `<div class="event-list">${lista.map(p => {
    const d = new Date(p.fecha);
    const post = postDe(p.id);
    return `
      <div class="event-card" onclick="postAbrir('${p.id}')">
        <div class="event-date">
          <div class="day">${d.getDate()}</div>
          <div class="month">${POST_MESES[d.getMonth()]}</div>
        </div>
        <div class="event-info">
          <div class="event-title">vs ${postEsc(postNombreRival(p))}</div>
          <div class="event-meta">${p.sets_local ?? 0}–${p.sets_visitante ?? 0}${p.lugar ? " · " + postEsc(p.lugar) : ""}</div>
        </div>
        <span class="conv-pill ${post ? "presente" : ""}">${post ? "Con crónica" : "Sin crónica"}</span>
      </div>
    `;
  }).join("")}</div>`;
}

function postVolver() {
  postPartido = null;
  postActual = null;
  document.getElementById("post-detalle-wrap").style.display = "none";
  document.getElementById("post-lista-wrap").style.display = "block";
  if (postEquipoActualId) postCargarTodo(postEquipoActualId);
}

async function postAbrir(partidoId) {
  const partido = postPartidos.find(p => p.id === partidoId);
  if (!partido) return;
  postPartido = partido;
  postActual = postDe(partidoId);

  document.getElementById("post-lista-wrap").style.display = "none";
  document.getElementById("post-detalle-wrap").style.display = "block";
  document.getElementById("btn-post-eliminar").style.display = postEsStaffDeEquipo && postActual ? "inline-block" : "none";
  document.getElementById("error-post").classList.remove("show");
  document.getElementById("post-detalle-titulo").textContent = `vs ${postNombreRival(partido)}`;
  const d = new Date(partido.fecha);
  document.getElementById("post-detalle-meta").textContent =
    `${d.getDate()} ${POST_MESES[d.getMonth()]} · ${partido.sets_local ?? 0}–${partido.sets_visitante ?? 0}${partido.lugar ? " · " + partido.lugar : ""}`;

  await postCargarDetalle();
}

async function postCargarDetalle() {
  if (postActual?.id) {
    const { data } = await supabaseClient
      .from("post_partido_comentario")
      .select("*, perfil:perfil_id (nombre, apellido)")
      .eq("post_partido_id", postActual.id)
      .order("created_at");
    postComentarios = data || [];
    await postFirmarFotos(postActual.fotos_urls || []);
  } else {
    postComentarios = [];
    postFotosFirmadas = {};
  }
  postRenderDetalle();
}

async function postFirmarFotos(paths) {
  postFotosFirmadas = {};
  const storagePaths = (paths || []).filter(p => p && !/^https?:\/\//i.test(p));
  const externas = (paths || []).filter(p => /^https?:\/\//i.test(p));
  externas.forEach(u => { postFotosFirmadas[u] = u; });
  if (storagePaths.length === 0) return;
  const { data, error } = await supabaseClient.storage.from("post-partido").createSignedUrls(storagePaths, 3600);
  if (error) return;
  (data || []).forEach((item, i) => {
    if (item?.signedUrl) postFotosFirmadas[storagePaths[i]] = item.signedUrl;
  });
}

function postNombreMvp(jugadorId) {
  const j = postJugadores.find(x => x.id === jugadorId);
  if (!j) return "MVP";
  return `#${j.dorsal ?? "–"} ${j.perfil?.nombre ?? ""} ${j.perfil?.apellido ?? ""}`.trim();
}

function postVideoHtml(url) {
  if (!url) return "";
  const yt = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
  if (yt) {
    return `<div class="post-video"><iframe src="https://www.youtube.com/embed/${yt[1]}" allowfullscreen></iframe></div>`;
  }
  return `<p><a href="${postEsc(url)}" target="_blank" rel="noopener">Ver video</a></p>`;
}

function postGaleriaHtml(paths, puedeQuitar) {
  const items = (paths || []).map(path => {
    const src = postFotosFirmadas[path] || path;
    return `<div class="post-photo">
      <img src="${postEsc(src)}" alt="Foto del partido">
      ${puedeQuitar ? `<button type="button" class="quitar" onclick="postQuitarFoto('${postEsc(path)}')">✕</button>` : ""}
    </div>`;
  }).join("");
  return items ? `<div class="post-gallery">${items}</div>` : "";
}

function postRenderDetalle() {
  const p = postActual;
  const cuerpo = document.getElementById("post-detalle-cuerpo");
  document.getElementById("btn-post-eliminar").style.display = postEsStaffDeEquipo && p ? "inline-block" : "none";

  let html = "";

  if (postEsStaffDeEquipo) {
    html += `
      <form id="form-post-editar" class="post-block">
        <h3>Crónica del partido</h3>
        <div class="field"><label>Resumen</label><textarea id="post-resumen" rows="4" placeholder="Cómo se jugó, momentos clave…">${postEsc(p?.resumen || "")}</textarea></div>
        <div class="field"><label>Notas del entrenador</label><textarea id="post-notas" rows="3" placeholder="Opcional">${postEsc(p?.notas_entrenador || "")}</textarea></div>
        <div class="field">
          <label>MVP</label>
          <select id="post-mvp">
            <option value="">Sin MVP</option>
            ${postJugadores.map(j => `<option value="${j.id}" ${p?.mvp_jugador_id === j.id ? "selected" : ""}>#${j.dorsal ?? "–"} ${postEsc(`${j.perfil?.nombre ?? ""} ${j.perfil?.apellido ?? ""}`.trim())}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>Video (YouTube u otro link)</label><input type="url" id="post-video" placeholder="https://…" value="${postEsc(p?.video_url || "")}"></div>
        <div class="field">
          <label>Fotos</label>
          <input type="file" id="post-fotos-input" accept="image/*" multiple>
        </div>
        ${postGaleriaHtml(p?.fotos_urls || [], true)}
        <div class="modal-actions" style="margin-top:0">
          <button type="submit" class="btn btn-primary">Guardar crónica</button>
        </div>
      </form>
    `;
  } else if (!p) {
    html += `<div class="empty-state">Todavía no hay crónica de este partido.</div>`;
  } else {
    if (p.mvp_jugador_id) html += `<div class="post-mvp">MVP · ${postEsc(postNombreMvp(p.mvp_jugador_id))}</div>`;
    if (p.resumen) html += `<div class="post-block"><h3>Resumen</h3><p>${postEsc(p.resumen)}</p></div>`;
    if (p.notas_entrenador) html += `<div class="post-block"><h3>Notas del entrenador</h3><p>${postEsc(p.notas_entrenador)}</p></div>`;
    html += postGaleriaHtml(p.fotos_urls || [], false);
    html += postVideoHtml(p.video_url);
  }

  if (p?.id) {
    const comentarios = postComentarios.map(c => `
      <div class="post-comment">
        <div>
          <span class="who">${postEsc(`${c.perfil?.nombre ?? ""} ${c.perfil?.apellido ?? ""}`.trim() || "Alguien")}</span>
          <span class="when">${new Date(c.created_at).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          ${c.perfil_id === postMiPerfilId || postEsStaffDeEquipo ? `<button type="button" class="btn btn-ghost btn-sm" style="margin-left:0.4rem" onclick="postBorrarComentario('${c.id}')">Borrar</button>` : ""}
        </div>
        <div class="txt">${postEsc(c.comentario)}</div>
      </div>
    `).join("");
    html += `
      <div class="section-title">Comentarios</div>
      <div class="post-comments">${comentarios || `<div class="empty-state" style="padding:1rem">Todavía no hay comentarios.</div>`}</div>
      <form id="form-post-comentario" class="post-comment-form">
        <input type="text" id="post-comentario" placeholder="Escribí un comentario…" maxlength="500" required>
        <button type="submit" class="btn btn-primary">Enviar</button>
      </form>
    `;
  }

  cuerpo.innerHTML = html;
  document.getElementById("form-post-editar")?.addEventListener("submit", postGuardar);
  document.getElementById("post-fotos-input")?.addEventListener("change", postSubirFotos);
  document.getElementById("form-post-comentario")?.addEventListener("submit", postComentar);
}

async function postAsegurar() {
  if (postActual?.id) return postActual;
  const { data: existente } = await supabaseClient
    .from("post_partido")
    .select("*")
    .eq("partido_id", postPartido.id)
    .maybeSingle();
  if (existente) {
    postActual = existente;
    return existente;
  }
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { data, error } = await supabaseClient
    .from("post_partido")
    .insert({ partido_id: postPartido.id, created_by: user.id, fotos_urls: [] })
    .select()
    .single();
  if (error) throw error;
  postActual = data;
  postPosts = [...postPosts.filter(x => x.partido_id !== postPartido.id), data];
  return data;
}

async function postGuardar(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-post");
  errEl.classList.remove("show");
  try {
    const row = await postAsegurar();
    const payload = {
      resumen: document.getElementById("post-resumen").value.trim() || null,
      notas_entrenador: document.getElementById("post-notas").value.trim() || null,
      mvp_jugador_id: document.getElementById("post-mvp").value || null,
      video_url: document.getElementById("post-video").value.trim() || null
    };
    const { data, error } = await supabaseClient.from("post_partido").update(payload).eq("id", row.id).select().single();
    if (error) throw error;
    postActual = data;
    postPosts = postPosts.map(x => x.id === data.id ? data : x);
    await postCargarDetalle();
  } catch (err) {
    errEl.textContent = "No se pudo guardar: " + err.message;
    errEl.classList.add("show");
  }
}

async function postSubirFotos(e) {
  const files = [...(e.target.files || [])];
  e.target.value = "";
  if (files.length === 0) return;
  const errEl = document.getElementById("error-post");
  errEl.classList.remove("show");
  try {
    const row = await postAsegurar();
    const actuales = [...(row.fotos_urls || [])];
    for (const file of files.slice(0, 8)) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${postPartido.id}/${(crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2))}.${ext}`;
      const { error } = await supabaseClient.storage.from("post-partido").upload(path, file, { upsert: false });
      if (error) throw error;
      actuales.push(path);
    }
    const { data, error } = await supabaseClient
      .from("post_partido")
      .update({ fotos_urls: actuales })
      .eq("id", row.id)
      .select()
      .single();
    if (error) throw error;
    postActual = data;
    postPosts = postPosts.map(x => x.id === data.id ? data : x);
    await postCargarDetalle();
  } catch (err) {
    errEl.textContent = "No se pudieron subir las fotos: " + err.message + (err.message.includes("Bucket") ? " Creá el bucket post-partido o ejecutá rls_triggers_storage.sql." : "");
    errEl.classList.add("show");
  }
}

async function postQuitarFoto(path) {
  if (!postActual) return;
  const restantes = (postActual.fotos_urls || []).filter(p => p !== path);
  if (!/^https?:\/\//i.test(path)) {
    await supabaseClient.storage.from("post-partido").remove([path]);
  }
  const { data, error } = await supabaseClient
    .from("post_partido")
    .update({ fotos_urls: restantes })
    .eq("id", postActual.id)
    .select()
    .single();
  if (error) { alert("No se pudo quitar la foto: " + error.message); return; }
  postActual = data;
  await postCargarDetalle();
}

async function postComentar(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-post");
  errEl.classList.remove("show");
  const texto = document.getElementById("post-comentario").value.trim();
  if (!texto || !postActual?.id) return;
  const { error } = await supabaseClient.from("post_partido_comentario").insert({
    post_partido_id: postActual.id,
    perfil_id: postMiPerfilId,
    comentario: texto
  });
  if (error) {
    errEl.textContent = "No se pudo comentar: " + error.message;
    errEl.classList.add("show");
    return;
  }
  await postCargarDetalle();
}

async function postBorrarComentario(id) {
  const { error } = await supabaseClient.from("post_partido_comentario").delete().eq("id", id);
  if (error) {
    alert("No se pudo borrar: " + error.message + "\nSi falla, ejecutá fix_post_partido.sql en Supabase.");
    return;
  }
  await postCargarDetalle();
}

async function postEliminar() {
  if (!postActual) return;
  if (!confirm("¿Eliminar la crónica de este partido? Las fotos y comentarios se pierden.")) return;
  const paths = (postActual.fotos_urls || []).filter(p => p && !/^https?:\/\//i.test(p));
  if (paths.length) await supabaseClient.storage.from("post-partido").remove(paths);
  const { error } = await supabaseClient.from("post_partido").delete().eq("id", postActual.id);
  if (error) { alert("No se pudo eliminar: " + error.message); return; }
  postActual = null;
  postVolver();
}

function postEsc(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
