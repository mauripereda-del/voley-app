// =========================================================
// MÓDULO: CUOTAS Y COLECTAS
// =========================================================

let finEquipoActualId = null;
let finEsStaffDeEquipo = false;
let finMiPerfilId = null;
let finMiJugadorId = null;
let finTab = "cuotas";
let finCuotas = [];
let finPagos = [];
let finColectas = [];
let finAportes = [];
let finJugadores = [];
let finMiembros = [];
let finCuotaActual = null;
let finColectaActual = null;
let finCuotaEditId = null;
let finColectaEditId = null;
let finPagoJugadorFijo = null;
let finComprobantesFirmados = {};

const FIN_MESES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
const FIN_METODO = { efectivo: "Efectivo", transferencia: "Transferencia", otro: "Otro" };
const FIN_ESTADO_PAGO = { pendiente: "Pendiente", parcial: "Parcial", pagado: "Pagado", a_confirmar: "A confirmar" };

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("view-finanzas")) return;

  const session = await requerirSesion();
  if (!session) return;
  finMiPerfilId = session.user.id;

  await finCargarCategorias();

  document.getElementById("fin-filtro-categoria").addEventListener("change", finOnCambioCategoria);
  document.getElementById("fin-filtro-equipo").addEventListener("change", finOnCambioEquipo);
  document.getElementById("btn-nueva-cuota").addEventListener("click", () => finAbrirModalCuota(null));
  document.getElementById("btn-nueva-colecta").addEventListener("click", () => finAbrirModalColecta(null));
  document.getElementById("btn-fin-volver-cuota").addEventListener("click", finVolverLista);
  document.getElementById("btn-fin-volver-colecta").addEventListener("click", finVolverLista);
  document.getElementById("btn-fin-editar-cuota").addEventListener("click", () => finAbrirModalCuota(finCuotaActual));
  document.getElementById("btn-fin-eliminar-cuota").addEventListener("click", finEliminarCuota);
  document.getElementById("btn-fin-registrar-pago").addEventListener("click", () => finAbrirPago(finMiJugadorId && !finEsStaffDeEquipo ? finMiJugadorId : null));
  document.getElementById("btn-fin-editar-colecta").addEventListener("click", () => finAbrirModalColecta(finColectaActual));
  document.getElementById("btn-fin-eliminar-colecta").addEventListener("click", finEliminarColecta);
  document.getElementById("btn-fin-cerrar-colecta").addEventListener("click", finToggleCerrarColecta);
  document.getElementById("btn-fin-registrar-aporte").addEventListener("click", finAbrirAporte);
  document.getElementById("form-cuota").addEventListener("submit", finGuardarCuota);
  document.getElementById("form-cuota-pago").addEventListener("submit", finGuardarPago);
  document.getElementById("form-colecta").addEventListener("submit", finGuardarColecta);
  document.getElementById("form-aporte").addEventListener("submit", finGuardarAporte);
  document.getElementById("aporte-perfil").addEventListener("change", finToggleAporteExterno);
  document.querySelectorAll("[data-fin-tab]").forEach(btn => {
    btn.addEventListener("click", () => finCambiarTab(btn.dataset.finTab));
  });
});

function finCambiarTab(tab) {
  finTab = tab;
  document.querySelectorAll("[data-fin-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.finTab === tab);
  });
  document.getElementById("fin-panel-cuotas").style.display = tab === "cuotas" ? "" : "none";
  document.getElementById("fin-panel-colectas").style.display = tab === "colectas" ? "" : "none";
}

async function finCargarCategorias() {
  const { data, error } = await supabaseClient.from("categoria").select("*").order("nombre");
  const select = document.getElementById("fin-filtro-categoria");
  if (error || !data || data.length === 0) {
    select.innerHTML = `<option value="">No hay categorías cargadas</option>`;
    return;
  }
  select.innerHTML = `<option value="">Elegí una categoría</option>` +
    data.map(c => `<option value="${c.id}">${finEsc(c.nombre)} · ${c.genero === "femenino" ? "Femenino" : "Masculino"}</option>`).join("");
}

async function finOnCambioCategoria() {
  const categoriaId = document.getElementById("fin-filtro-categoria").value;
  const selectEquipo = document.getElementById("fin-filtro-equipo");
  finEquipoActualId = null;
  finVolverLista(false);
  finRenderListas();
  finActualizarBotonesAlta();

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
    data.map(e => `<option value="${e.id}">${finEsc(e.nombre)}</option>`).join("");
}

async function finOnCambioEquipo() {
  finEquipoActualId = document.getElementById("fin-filtro-equipo").value || null;
  finVolverLista(false);
  if (!finEquipoActualId) {
    finCuotas = [];
    finPagos = [];
    finColectas = [];
    finAportes = [];
    finJugadores = [];
    finMiembros = [];
    finMiJugadorId = null;
    finRenderListas();
    finActualizarBotonesAlta();
    return;
  }
  await finDeterminarPermiso(finEquipoActualId);
  await finCargarTodo(finEquipoActualId);
}

function finActualizarBotonesAlta() {
  const show = !!(finEquipoActualId && finEsStaffDeEquipo);
  document.getElementById("btn-nueva-cuota").style.display = show ? "inline-block" : "none";
  document.getElementById("btn-nueva-colecta").style.display = show ? "inline-block" : "none";
}

async function finDeterminarPermiso(equipoId) {
  finEsStaffDeEquipo = false;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;
  const { data: perfil } = await supabaseClient.from("perfil").select("rol").eq("id", user.id).single();
  if (!perfil) return;
  if (["admin", "dirigente"].includes(perfil.rol)) {
    finEsStaffDeEquipo = true;
    return;
  }
  const { data: staff } = await supabaseClient
    .from("cuerpo_tecnico")
    .select("id")
    .eq("equipo_id", equipoId)
    .eq("perfil_id", user.id)
    .maybeSingle();
  finEsStaffDeEquipo = !!staff;
}

async function finCargarTodo(equipoId) {
  document.getElementById("fin-panel-cuotas").innerHTML = `<div class="empty-state">Cargando cuotas…</div>`;
  document.getElementById("fin-panel-colectas").innerHTML = `<div class="empty-state">Cargando colectas…</div>`;

  const [cuotaRes, colRes, jugRes, staffRes] = await Promise.all([
    supabaseClient.from("cuota").select("*").eq("equipo_id", equipoId).order("fecha_vencimiento", { ascending: false, nullsFirst: false }),
    supabaseClient.from("colecta").select("*").eq("equipo_id", equipoId).order("created_at", { ascending: false }),
    supabaseClient
      .from("jugador")
      .select("id, dorsal, activo, perfil_id, perfil:perfil_id (id, nombre, apellido)")
      .eq("equipo_id", equipoId)
      .order("dorsal"),
    supabaseClient
      .from("cuerpo_tecnico")
      .select("perfil_id, cargo, perfil:perfil_id (id, nombre, apellido)")
      .eq("equipo_id", equipoId)
  ]);

  if (cuotaRes.error) {
    document.getElementById("fin-panel-cuotas").innerHTML =
      `<div class="empty-state">No pudimos cargar las cuotas: ${finEsc(cuotaRes.error.message)}</div>`;
    return;
  }
  if (colRes.error) {
    document.getElementById("fin-panel-colectas").innerHTML =
      `<div class="empty-state">No pudimos cargar las colectas: ${finEsc(colRes.error.message)}</div>`;
    return;
  }

  finCuotas = cuotaRes.data || [];
  finColectas = colRes.data || [];
  finJugadores = (jugRes.data || []).filter(j => j.activo !== false);
  finMiJugadorId = (jugRes.data || []).find(j => j.perfil_id === finMiPerfilId)?.id || null;

  const porId = {};
  (jugRes.data || []).forEach(j => {
    if (j.perfil) porId[j.perfil.id] = { ...j.perfil, etiqueta: "Jugador/a" };
  });
  (staffRes.data || []).forEach(s => {
    if (s.perfil) porId[s.perfil.id] = { ...s.perfil, etiqueta: capitalizar(s.cargo || "staff") };
  });
  if (finMiPerfilId && !porId[finMiPerfilId]) {
    const { data: yo } = await supabaseClient.from("perfil").select("id, nombre, apellido").eq("id", finMiPerfilId).single();
    if (yo) porId[yo.id] = { ...yo, etiqueta: "Vos" };
  }
  finMiembros = Object.values(porId).sort((a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, "es"));

  const cuotaIds = finCuotas.map(c => c.id);
  const colectaIds = finColectas.map(c => c.id);

  const [pagoRes, aporteRes] = await Promise.all([
    cuotaIds.length
      ? supabaseClient
          .from("cuota_pago")
          .select("*, jugador:jugador_id (id, perfil_id, dorsal, perfil:perfil_id (nombre, apellido))")
          .in("cuota_id", cuotaIds)
          .order("fecha_pago", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    colectaIds.length
      ? supabaseClient
          .from("colecta_aporte")
          .select("*, perfil:perfil_id (id, nombre, apellido)")
          .in("colecta_id", colectaIds)
          .order("fecha_aporte", { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ]);

  finPagos = pagoRes.data || [];
  finAportes = aporteRes.data || [];
  finActualizarBotonesAlta();
  finRenderListas();

  if (finCuotaActual) {
    finCuotaActual = finCuotas.find(c => c.id === finCuotaActual.id) || null;
    if (finCuotaActual) await finRenderCuotaDetalle();
    else finVolverLista(false);
  }
  if (finColectaActual) {
    finColectaActual = finColectas.find(c => c.id === finColectaActual.id) || null;
    if (finColectaActual) await finRenderColectaDetalle();
    else finVolverLista(false);
  }
}

function finVolverLista(render = true) {
  finCuotaActual = null;
  finColectaActual = null;
  document.getElementById("fin-lista-wrap").style.display = "";
  document.getElementById("fin-cuota-detalle").style.display = "none";
  document.getElementById("fin-colecta-detalle").style.display = "none";
  if (render) finRenderListas();
}

function finRenderListas() {
  finRenderCuotas();
  finRenderColectas();
}

function finRenderCuotas() {
  const cont = document.getElementById("fin-panel-cuotas");
  if (!finEquipoActualId) {
    cont.innerHTML = `<div class="empty-state">Elegí una categoría y un equipo para ver las cuotas.</div>`;
    return;
  }
  if (finCuotas.length === 0) {
    const hint = finEsStaffDeEquipo ? " Creá la primera con + Nueva cuota." : "";
    cont.innerHTML = `<div class="empty-state">No hay cuotas en este equipo.${hint}</div>`;
    return;
  }

  cont.innerHTML = `<div class="event-list">${finCuotas.map(c => {
    const venc = c.fecha_vencimiento ? finFormatearFecha(c.fecha_vencimiento) : "Sin vencimiento";
    if (finEsStaffDeEquipo) {
      const total = finJugadores.length;
      const alDia = finJugadores.filter(j => finResumenJugador(c, j.id).alDia).length;
      const pct = total ? Math.round((alDia / total) * 100) : 0;
      return `
        <div class="event-card" onclick="finAbrirCuota('${c.id}')">
          <div class="event-info" style="flex:1">
            <div class="tar-card-top">
              <div class="event-title">${finEsc(c.concepto)}</div>
              <span class="fin-money">${finMoney(c.monto)}</span>
            </div>
            <div class="event-meta">${venc}${finVencida(c) ? ` · <span class="conv-pill vencida">Vencida</span>` : ""} · ${alDia}/${total} al día</div>
            <div class="fin-bar"><span style="width:${pct}%"></span></div>
          </div>
        </div>`;
    }
    const r = finMiJugadorId ? finResumenJugador(c, finMiJugadorId) : { pagado: 0, estado: "pendiente", pill: "pendiente" };
    const pct = Number(c.monto) > 0 ? Math.min(100, Math.round((r.pagado / Number(c.monto)) * 100)) : 0;
    return `
      <div class="event-card" onclick="finAbrirCuota('${c.id}')">
        <div class="event-info" style="flex:1">
          <div class="tar-card-top">
            <div class="event-title">${finEsc(c.concepto)}</div>
            <span class="conv-pill ${r.pill}">${FIN_ESTADO_PAGO[r.pill]}</span>
          </div>
          <div class="event-meta">${finMoney(r.pagado)} / ${finMoney(c.monto)} · ${venc}${finVencida(c) && r.estado !== "pagado" ? ` · <span class="conv-pill vencida">Vencida</span>` : ""}</div>
          <div class="fin-bar"><span style="width:${pct}%"></span></div>
        </div>
      </div>`;
  }).join("")}</div>`;
}

function finRenderColectas() {
  const cont = document.getElementById("fin-panel-colectas");
  if (!finEquipoActualId) {
    cont.innerHTML = `<div class="empty-state">Elegí una categoría y un equipo para ver las colectas.</div>`;
    return;
  }
  if (finColectas.length === 0) {
    const hint = finEsStaffDeEquipo ? " Creá la primera con + Nueva colecta." : "";
    cont.innerHTML = `<div class="empty-state">No hay colectas en este equipo.${hint}</div>`;
    return;
  }

  cont.innerHTML = `<div class="event-list">${finColectas.map(c => {
    const rec = finRecaudado(c.id);
    const meta = Number(c.meta_monto) || 0;
    const pct = meta > 0 ? Math.min(100, Math.round((rec / meta) * 100)) : 0;
    const fechas = [c.fecha_inicio, c.fecha_fin].filter(Boolean).map(finFormatearFecha).join(" → ") || "Sin fechas";
    return `
      <div class="event-card" onclick="finAbrirColecta('${c.id}')">
        <div class="event-info" style="flex:1">
          <div class="tar-card-top">
            <div class="event-title">${finEsc(c.nombre)}</div>
            <span class="conv-pill ${c.estado}">${c.estado === "activa" ? "Activa" : "Cerrada"}</span>
          </div>
          <div class="event-meta">${finMoney(rec)}${meta ? ` / ${finMoney(meta)}` : ""} · ${fechas}</div>
          ${c.descripcion ? `<div class="tar-desc">${finEsc(c.descripcion)}</div>` : ""}
          ${meta ? `<div class="fin-bar meta"><span style="width:${pct}%"></span></div>` : ""}
        </div>
      </div>`;
  }).join("")}</div>`;
}

async function finAbrirCuota(id) {
  finCuotaActual = finCuotas.find(c => c.id === id) || null;
  if (!finCuotaActual) return;
  document.getElementById("fin-lista-wrap").style.display = "none";
  document.getElementById("fin-colecta-detalle").style.display = "none";
  document.getElementById("fin-cuota-detalle").style.display = "";
  document.getElementById("btn-fin-editar-cuota").style.display = finEsStaffDeEquipo ? "inline-block" : "none";
  document.getElementById("btn-fin-eliminar-cuota").style.display = finEsStaffDeEquipo ? "inline-block" : "none";
  const puedePagar = finEsStaffDeEquipo || !!finMiJugadorId;
  const btnPago = document.getElementById("btn-fin-registrar-pago");
  btnPago.style.display = puedePagar ? "inline-block" : "none";
  btnPago.textContent = finEsStaffDeEquipo ? "+ Registrar pago" : "+ Informar pago";
  await finRenderCuotaDetalle();
}

async function finRenderCuotaDetalle() {
  const c = finCuotaActual;
  if (!c) return;
  document.getElementById("fin-cuota-titulo").textContent = c.concepto;
  const venc = c.fecha_vencimiento ? `Vence ${finFormatearFecha(c.fecha_vencimiento)}` : "Sin vencimiento";
  document.getElementById("fin-cuota-meta").innerHTML =
    `${finMoney(c.monto)} · ${venc}${finVencida(c) ? ` · <span class="conv-pill vencida">Vencida</span>` : ""}`;

  const cuerpo = document.getElementById("fin-cuota-cuerpo");
  const lista = finEsStaffDeEquipo
    ? finJugadores
    : finJugadores.filter(j => j.id === finMiJugadorId);

  if (!finEsStaffDeEquipo && !finMiJugadorId) {
    cuerpo.innerHTML = `<div class="empty-state">Esta cuota es del plantel. Tu usuario no está como jugador/a en este equipo.</div>`;
    return;
  }

  const recaudado = lista.reduce((s, j) => s + finResumenJugador(c, j.id).pagado, 0);
  const esperado = Number(c.monto) * lista.length;
  const alDia = lista.filter(j => finResumenJugador(c, j.id).alDia).length;

  await finFirmarComprobantes(finPagos.filter(p => p.cuota_id === c.id).map(p => p.comprobante_url));

  cuerpo.innerHTML = `
    <div class="fin-resumen">
      <div class="fin-stat"><div class="label">Recaudado</div><div class="value fin-money">${finMoney(recaudado)}</div></div>
      <div class="fin-stat"><div class="label">${finEsStaffDeEquipo ? "Esperado" : "Importe"}</div><div class="value fin-money">${finMoney(esperado)}</div></div>
      <div class="fin-stat"><div class="label">Al día</div><div class="value">${alDia} / ${lista.length}</div></div>
    </div>
    ${lista.map(j => {
      const r = finResumenJugador(c, j.id);
      const nombre = j.perfil ? `${j.perfil.nombre} ${j.perfil.apellido}` : "Jugador/a";
      const pagosHtml = r.pagos.length
        ? r.pagos.map(p => {
            const url = p.comprobante_url ? finComprobantesFirmados[p.comprobante_url] : null;
            return `<div class="meta">${finFormatearFecha(p.fecha_pago)} · ${finMoney(p.monto_pagado)} · ${FIN_METODO[p.metodo_pago] || "—"} · ${FIN_ESTADO_PAGO[p.estado] || p.estado}${
              url ? ` · <a href="${finEsc(url)}" target="_blank" rel="noopener">Comprobante</a>` : ""
            }${
              finEsStaffDeEquipo && p.estado === "pendiente"
                ? ` · <button type="button" class="btn btn-sm btn-ghost" onclick="event.stopPropagation();finConfirmarPago('${p.id}')">Confirmar</button>`
                : ""
            }${
              finEsStaffDeEquipo
                ? ` · <button type="button" class="btn btn-sm btn-ghost" onclick="event.stopPropagation();finBorrarPago('${p.id}')">Quitar</button>`
                : ""
            }</div>`;
          }).join("")
        : `<div class="meta">Sin pagos registrados</div>`;
      return `
        <div class="conv-player-row">
          <div class="info">
            <div class="name">${finEsc(nombre)}${j.dorsal != null ? ` · #${j.dorsal}` : ""}</div>
            <div class="meta">${finMoney(r.pagado)} / ${finMoney(c.monto)}</div>
            ${pagosHtml}
          </div>
          <span class="conv-pill ${r.pill}">${FIN_ESTADO_PAGO[r.pill]}</span>
          ${finEsStaffDeEquipo ? `<button type="button" class="btn btn-sm btn-ghost" onclick="finAbrirPago('${j.id}')">Pago</button>` : ""}
        </div>`;
    }).join("")}
  `;
}

async function finAbrirColecta(id) {
  finColectaActual = finColectas.find(c => c.id === id) || null;
  if (!finColectaActual) return;
  document.getElementById("fin-lista-wrap").style.display = "none";
  document.getElementById("fin-cuota-detalle").style.display = "none";
  document.getElementById("fin-colecta-detalle").style.display = "";
  document.getElementById("btn-fin-editar-colecta").style.display = finEsStaffDeEquipo ? "inline-block" : "none";
  document.getElementById("btn-fin-eliminar-colecta").style.display = finEsStaffDeEquipo ? "inline-block" : "none";
  const btnCerrar = document.getElementById("btn-fin-cerrar-colecta");
  btnCerrar.style.display = finEsStaffDeEquipo ? "inline-block" : "none";
  btnCerrar.textContent = finColectaActual.estado === "activa" ? "Cerrar colecta" : "Reabrir colecta";
  const puedeAportar = finEsStaffDeEquipo || finColectaActual.estado === "activa";
  document.getElementById("btn-fin-registrar-aporte").style.display = puedeAportar ? "inline-block" : "none";
  await finRenderColectaDetalle();
}

async function finRenderColectaDetalle() {
  const c = finColectaActual;
  if (!c) return;
  document.getElementById("fin-colecta-titulo").textContent = c.nombre;
  const fechas = [c.fecha_inicio, c.fecha_fin].filter(Boolean).map(finFormatearFecha).join(" → ");
  document.getElementById("fin-colecta-meta").innerHTML =
    `${fechas || "Sin fechas"} · <span class="conv-pill ${c.estado}">${c.estado === "activa" ? "Activa" : "Cerrada"}</span>`;

  const aportes = finAportes.filter(a => a.colecta_id === c.id);
  const rec = finRecaudado(c.id);
  const meta = Number(c.meta_monto) || 0;
  const pct = meta > 0 ? Math.min(100, Math.round((rec / meta) * 100)) : 0;

  document.getElementById("fin-colecta-cuerpo").innerHTML = `
    ${c.descripcion ? `<p style="margin:0 0 0.75rem;color:var(--ink-soft)">${finEsc(c.descripcion)}</p>` : ""}
    <div class="fin-resumen">
      <div class="fin-stat"><div class="label">Recaudado</div><div class="value fin-money">${finMoney(rec)}</div></div>
      <div class="fin-stat"><div class="label">Meta</div><div class="value fin-money">${meta ? finMoney(meta) : "Sin meta"}</div></div>
      <div class="fin-stat"><div class="label">Aportes</div><div class="value">${aportes.length}</div></div>
    </div>
    ${meta ? `<div class="fin-bar meta" style="margin-bottom:1rem"><span style="width:${pct}%"></span></div>` : ""}
    ${aportes.length === 0
      ? `<div class="empty-state">Todavía no hay aportes.${finEsStaffDeEquipo || c.estado === "activa" ? " Registrá el primero con + Aporte." : ""}</div>`
      : aportes.map(a => {
          const externo = !a.perfil_id && a.nombre_externo;
          const nombre = a.perfil ? `${a.perfil.nombre} ${a.perfil.apellido}` : (a.nombre_externo || "Anónimo");
          const puedeBorrar = finEsStaffDeEquipo || a.perfil_id === finMiPerfilId;
          return `
            <div class="conv-player-row">
              <div class="info">
                <div class="name">${finEsc(nombre)}</div>
                <div class="meta">${externo ? "Empresa / sponsor · " : ""}${a.fecha_aporte ? finFormatearFecha(a.fecha_aporte) : ""} · ${FIN_METODO[a.metodo_pago] || "—"}</div>
              </div>
              <span class="fin-money">${finMoney(a.monto)}</span>
              ${puedeBorrar ? `<button type="button" class="btn btn-sm btn-ghost" onclick="finBorrarAporte('${a.id}')">Quitar</button>` : ""}
            </div>`;
        }).join("")
    }
  `;
}

function finAbrirModalCuota(cuota) {
  finCuotaEditId = cuota?.id || null;
  document.getElementById("cuota-titulo-modal").textContent = cuota ? "Editar cuota" : "Nueva cuota";
  document.getElementById("cuota-concepto").value = cuota?.concepto || "";
  document.getElementById("cuota-monto").value = cuota?.monto ?? "";
  document.getElementById("cuota-vencimiento").value = cuota?.fecha_vencimiento || "";
  document.getElementById("error-cuota").classList.remove("show");
  abrirModal("overlay-cuota");
}

async function finGuardarCuota(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-cuota");
  errEl.classList.remove("show");
  if (!finEquipoActualId) return;
  const payload = {
    equipo_id: finEquipoActualId,
    concepto: document.getElementById("cuota-concepto").value.trim(),
    monto: Number(document.getElementById("cuota-monto").value),
    fecha_vencimiento: document.getElementById("cuota-vencimiento").value || null
  };
  if (!payload.concepto || !(payload.monto >= 0)) {
    errEl.textContent = "Completá concepto y monto.";
    errEl.classList.add("show");
    return;
  }
  const query = finCuotaEditId
    ? supabaseClient.from("cuota").update(payload).eq("id", finCuotaEditId)
    : supabaseClient.from("cuota").insert(payload);
  const { error } = await query;
  if (error) {
    errEl.textContent = "No se pudo guardar: " + error.message;
    errEl.classList.add("show");
    return;
  }
  cerrarModal("overlay-cuota");
  await finCargarTodo(finEquipoActualId);
}

async function finEliminarCuota() {
  if (!finCuotaActual || !confirm("¿Eliminar esta cuota y todos sus pagos?")) return;
  const { error } = await supabaseClient.from("cuota").delete().eq("id", finCuotaActual.id);
  if (error) { alert("No se pudo eliminar: " + error.message); return; }
  finVolverLista(false);
  await finCargarTodo(finEquipoActualId);
}

function finAbrirPago(jugadorId) {
  if (!finCuotaActual) return;
  finPagoJugadorFijo = jugadorId || null;
  const select = document.getElementById("pago-jugador");
  select.innerHTML = finJugadores.map(j => {
    const nombre = j.perfil ? `${j.perfil.nombre} ${j.perfil.apellido}` : "Jugador/a";
    return `<option value="${j.id}">${finEsc(nombre)}${j.dorsal != null ? ` (#${j.dorsal})` : ""}</option>`;
  }).join("");
  const jugador = finPagoJugadorFijo || (finEsStaffDeEquipo ? (finJugadores[0]?.id || "") : finMiJugadorId);
  select.value = jugador || "";
  select.closest(".field").style.display = finEsStaffDeEquipo ? "" : "none";
  document.getElementById("pago-estado").closest(".field").style.display = finEsStaffDeEquipo ? "" : "none";
  const r = jugador ? finResumenJugador(finCuotaActual, jugador) : { pagado: 0 };
  const resto = Math.max(0, Number(finCuotaActual.monto) - r.pagado);
  document.getElementById("pago-monto").value = resto || finCuotaActual.monto || "";
  document.getElementById("pago-fecha").value = finHoy();
  document.getElementById("pago-metodo").value = "transferencia";
  document.getElementById("pago-estado").value = "pagado";
  document.getElementById("pago-comprobante").value = "";
  document.getElementById("error-cuota-pago").classList.remove("show");
  abrirModal("overlay-cuota-pago");
}

async function finGuardarPago(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-cuota-pago");
  errEl.classList.remove("show");
  if (!finCuotaActual) return;

  const jugadorId = finEsStaffDeEquipo
    ? (document.getElementById("pago-jugador").value || finPagoJugadorFijo)
    : finMiJugadorId;
  if (!jugadorId) {
    errEl.textContent = "No hay un jugador/a asociado a tu usuario en este equipo.";
    errEl.classList.add("show");
    return;
  }

  const monto = Number(document.getElementById("pago-monto").value);
  if (!(monto >= 0)) {
    errEl.textContent = "Ingresá un monto válido.";
    errEl.classList.add("show");
    return;
  }

  let comprobanteUrl = null;
  const file = document.getElementById("pago-comprobante").files[0];
  if (file) {
    try {
      comprobanteUrl = await finSubirComprobante(file);
    } catch (err) {
      errEl.textContent = "No se pudo subir el comprobante: " + err.message +
        (err.message.includes("Bucket") ? " Ejecutá rls_triggers_storage.sql o fix_cuotas.sql para crear el bucket comprobantes." : "");
      errEl.classList.add("show");
      return;
    }
  }

  const payload = {
    cuota_id: finCuotaActual.id,
    jugador_id: jugadorId,
    monto_pagado: monto,
    fecha_pago: document.getElementById("pago-fecha").value || finHoy(),
    metodo_pago: document.getElementById("pago-metodo").value,
    comprobante_url: comprobanteUrl,
    estado: finEsStaffDeEquipo ? document.getElementById("pago-estado").value : "pendiente",
    registrado_por: finMiPerfilId
  };

  const { error } = await supabaseClient.from("cuota_pago").insert(payload);
  if (error) {
    errEl.textContent = "No se pudo guardar el pago: " + error.message;
    errEl.classList.add("show");
    return;
  }
  cerrarModal("overlay-cuota-pago");
  await finCargarTodo(finEquipoActualId);
}

async function finConfirmarPago(pagoId) {
  const pago = finPagos.find(p => p.id === pagoId);
  if (!pago || !finCuotaActual) return;
  const r = finResumenJugador(finCuotaActual, pago.jugador_id);
  const estado = r.pagado >= Number(finCuotaActual.monto) - 0.009 ? "pagado" : "parcial";
  const { error } = await supabaseClient.from("cuota_pago").update({ estado }).eq("id", pagoId);
  if (error) { alert("No se pudo confirmar: " + error.message); return; }
  await finCargarTodo(finEquipoActualId);
}

async function finBorrarPago(pagoId) {
  const pago = finPagos.find(p => p.id === pagoId);
  if (!pago || !confirm("¿Quitar este pago?")) return;
  const { error } = await supabaseClient.from("cuota_pago").delete().eq("id", pagoId);
  if (error) { alert("No se pudo quitar: " + error.message); return; }
  if (pago.comprobante_url && !/^https?:\/\//i.test(pago.comprobante_url)) {
    await supabaseClient.storage.from("comprobantes").remove([pago.comprobante_url]);
  }
  await finCargarTodo(finEquipoActualId);
}

function finAbrirModalColecta(colecta) {
  finColectaEditId = colecta?.id || null;
  document.getElementById("colecta-titulo-modal").textContent = colecta ? "Editar colecta" : "Nueva colecta";
  document.getElementById("colecta-nombre").value = colecta?.nombre || "";
  document.getElementById("colecta-descripcion").value = colecta?.descripcion || "";
  document.getElementById("colecta-meta").value = colecta?.meta_monto ?? "";
  document.getElementById("colecta-inicio").value = colecta?.fecha_inicio || "";
  document.getElementById("colecta-fin").value = colecta?.fecha_fin || "";
  document.getElementById("error-colecta").classList.remove("show");
  abrirModal("overlay-colecta");
}

async function finGuardarColecta(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-colecta");
  errEl.classList.remove("show");
  if (!finEquipoActualId) return;
  const metaVal = document.getElementById("colecta-meta").value;
  const payload = {
    equipo_id: finEquipoActualId,
    nombre: document.getElementById("colecta-nombre").value.trim(),
    descripcion: document.getElementById("colecta-descripcion").value.trim() || null,
    meta_monto: metaVal === "" ? null : Number(metaVal),
    fecha_inicio: document.getElementById("colecta-inicio").value || null,
    fecha_fin: document.getElementById("colecta-fin").value || null
  };
  if (!payload.nombre) {
    errEl.textContent = "Completá el nombre.";
    errEl.classList.add("show");
    return;
  }
  const query = finColectaEditId
    ? supabaseClient.from("colecta").update(payload).eq("id", finColectaEditId)
    : supabaseClient.from("colecta").insert(payload);
  const { error } = await query;
  if (error) {
    errEl.textContent = "No se pudo guardar: " + error.message;
    errEl.classList.add("show");
    return;
  }
  cerrarModal("overlay-colecta");
  await finCargarTodo(finEquipoActualId);
}

async function finEliminarColecta() {
  if (!finColectaActual || !confirm("¿Eliminar esta colecta y todos sus aportes?")) return;
  const { error } = await supabaseClient.from("colecta").delete().eq("id", finColectaActual.id);
  if (error) { alert("No se pudo eliminar: " + error.message); return; }
  finVolverLista(false);
  await finCargarTodo(finEquipoActualId);
}

async function finToggleCerrarColecta() {
  if (!finColectaActual) return;
  const estado = finColectaActual.estado === "activa" ? "cerrada" : "activa";
  const { error } = await supabaseClient.from("colecta").update({ estado }).eq("id", finColectaActual.id);
  if (error) { alert("No se pudo actualizar: " + error.message); return; }
  await finCargarTodo(finEquipoActualId);
}

function finAbrirAporte() {
  if (!finColectaActual) return;
  const select = document.getElementById("aporte-perfil");
  select.innerHTML =
    `<option value="externo">Empresa / sponsor (escribir nombre)</option>` +
    finMiembros.map(m =>
      `<option value="${m.id}">${finEsc(`${m.nombre} ${m.apellido}`)} · ${finEsc(m.etiqueta)}</option>`
    ).join("");
  select.value = finEsStaffDeEquipo ? (finMiPerfilId || "externo") : (finMiPerfilId || finMiembros[0]?.id || "");
  document.getElementById("aporte-campo-quien").style.display = finEsStaffDeEquipo ? "" : "none";
  document.getElementById("aporte-nombre-externo").value = "";
  finToggleAporteExterno();
  document.getElementById("aporte-monto").value = "";
  document.getElementById("aporte-fecha").value = finHoy();
  document.getElementById("aporte-metodo").value = "transferencia";
  document.getElementById("error-aporte").classList.remove("show");
  abrirModal("overlay-aporte");
}

function finToggleAporteExterno() {
  const externo = document.getElementById("aporte-perfil").value === "externo";
  document.getElementById("aporte-campo-externo").style.display = finEsStaffDeEquipo && externo ? "" : "none";
}

async function finGuardarAporte(e) {
  e.preventDefault();
  const errEl = document.getElementById("error-aporte");
  errEl.classList.remove("show");
  if (!finColectaActual) return;
  const monto = Number(document.getElementById("aporte-monto").value);
  if (!(monto > 0)) {
    errEl.textContent = "Ingresá un monto mayor a 0.";
    errEl.classList.add("show");
    return;
  }

  let perfilId = finMiPerfilId;
  let nombreExterno = null;
  if (finEsStaffDeEquipo) {
    const elegido = document.getElementById("aporte-perfil").value;
    if (elegido === "externo") {
      perfilId = null;
      nombreExterno = document.getElementById("aporte-nombre-externo").value.trim();
      if (!nombreExterno) {
        errEl.textContent = "Escribí el nombre de la empresa o sponsor.";
        errEl.classList.add("show");
        return;
      }
    } else {
      perfilId = elegido || finMiPerfilId;
    }
  }

  const payload = {
    colecta_id: finColectaActual.id,
    perfil_id: perfilId,
    nombre_externo: nombreExterno,
    monto,
    fecha_aporte: document.getElementById("aporte-fecha").value || finHoy(),
    metodo_pago: document.getElementById("aporte-metodo").value
  };
  const { error } = await supabaseClient.from("colecta_aporte").insert(payload);
  if (error) {
    errEl.textContent = "No se pudo guardar el aporte: " + error.message +
      (error.message.includes("nombre_externo") ? " Ejecutá de nuevo fix_cuotas.sql en Supabase para agregar el campo de sponsor." : "");
    errEl.classList.add("show");
    return;
  }
  cerrarModal("overlay-aporte");
  await finCargarTodo(finEquipoActualId);
}

async function finBorrarAporte(id) {
  if (!confirm("¿Quitar este aporte?")) return;
  const { error } = await supabaseClient.from("colecta_aporte").delete().eq("id", id);
  if (error) { alert("No se pudo quitar: " + error.message); return; }
  await finCargarTodo(finEquipoActualId);
}

function finResumenJugador(cuota, jugadorId) {
  const pagos = finPagos.filter(p => p.cuota_id === cuota.id && p.jugador_id === jugadorId);
  const pagado = pagos.reduce((s, p) => s + Number(p.monto_pagado || 0), 0);
  const hayPendiente = pagos.some(p => p.estado === "pendiente");
  let estado = "pendiente";
  if (pagado >= Number(cuota.monto) - 0.009) estado = "pagado";
  else if (pagado > 0) estado = "parcial";
  const pill = hayPendiente ? "a_confirmar" : estado;
  const alDia = estado === "pagado" && !hayPendiente;
  return { pagado, estado, pill, pagos, alDia };
}

function finRecaudado(colectaId) {
  return finAportes.filter(a => a.colecta_id === colectaId).reduce((s, a) => s + Number(a.monto || 0), 0);
}

function finVencida(cuota) {
  if (!cuota.fecha_vencimiento) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return new Date(cuota.fecha_vencimiento + "T00:00:00") < hoy;
}

function finFormatearFecha(isoFecha) {
  if (!isoFecha) return "";
  const d = new Date(isoFecha + "T00:00:00");
  return `${d.getDate()} ${FIN_MESES[d.getMonth()]}`;
}

function finHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function finMoney(n) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(n) || 0);
}

async function finSubirComprobante(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const id = crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2);
  const path = `${finMiPerfilId}/${finCuotaActual.id}/${id}.${ext}`;
  const { error } = await supabaseClient.storage.from("comprobantes").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

async function finFirmarComprobantes(paths) {
  const storagePaths = [...new Set((paths || []).filter(p => p && !/^https?:\/\//i.test(p) && !finComprobantesFirmados[p]))];
  if (storagePaths.length === 0) return;
  const { data } = await supabaseClient.storage.from("comprobantes").createSignedUrls(storagePaths, 3600);
  (data || []).forEach((item, i) => {
    if (item?.signedUrl) finComprobantesFirmados[storagePaths[i]] = item.signedUrl;
  });
}

function finEsc(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
