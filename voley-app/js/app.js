// =========================================================
// NAVEGACIÓN ENTRE VISTAS (Plantel, Calendario, ...)
// =========================================================

const TITULOS_VISTA = {
  plantel: "Plantel y perfiles",
  mensajeria: "Mensajería",
  calendario: "Calendario",
  convocatorias: "Convocatorias y presencias",
  alineaciones: "Alineaciones",
  tareas: "Tareas",
  campeonatos: "Campeonatos",
  estadisticas: "Estadísticas",
  postpartido: "Post partido",
  finanzas: "Cuotas y colectas"
};

document.addEventListener("DOMContentLoaded", () => {
  const navItems = document.querySelectorAll(".nav-item[data-view]");
  if (navItems.length === 0) return; // no estamos en dashboard.html

  navItems.forEach(item => {
    item.addEventListener("click", () => cambiarVista(item.dataset.view));
  });
});

function cambiarVista(vista) {
  document.querySelectorAll(".nav-item[data-view]").forEach(item => {
    item.classList.toggle("active", item.dataset.view === vista);
  });
  document.querySelectorAll(".view").forEach(section => {
    section.classList.toggle("active", section.id === `view-${vista}`);
  });
  const titulo = document.getElementById("view-title");
  if (titulo && TITULOS_VISTA[vista]) titulo.textContent = TITULOS_VISTA[vista];
  if (vista === "mensajeria" && typeof msgAlAbrirVista === "function") msgAlAbrirVista();
}
