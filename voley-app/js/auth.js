// =========================================================
// AUTENTICACIÓN
// =========================================================

async function iniciarSesion(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function registrarse({ nombre, apellido, email, password, rol }) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { nombre, apellido, rol } } // el trigger handle_new_user() usa esto
  });
  if (error) throw error;
  return data;
}

async function cerrarSesion() {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

// Redirige a index.html si no hay sesión activa. Usar al cargar páginas protegidas.
async function requerirSesion() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return null;
  }
  return session;
}

// ---------- lógica de la pantalla de login (index.html) ----------
document.addEventListener("DOMContentLoaded", () => {
  const formLogin = document.getElementById("form-login");
  const formRegistro = document.getElementById("form-registro");
  if (!formLogin && !formRegistro) return; // no estamos en index.html

  // ya logueado -> directo al dashboard
  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session) window.location.href = "dashboard.html";
  });

  // tabs
  document.querySelectorAll(".auth-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".auth-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.panel).classList.add("active");
    });
  });

  const errLogin = document.getElementById("error-login");
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    errLogin.classList.remove("show");
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    try {
      await iniciarSesion(email, password);
      window.location.href = "dashboard.html";
    } catch (err) {
      errLogin.textContent = "No pudimos iniciar sesión: " + err.message;
      errLogin.classList.add("show");
    }
  });

  const errRegistro = document.getElementById("error-registro");
  const hintRegistro = document.getElementById("hint-registro");
  formRegistro.addEventListener("submit", async (e) => {
    e.preventDefault();
    errRegistro.classList.remove("show");
    hintRegistro.classList.remove("show");
    const nombre = document.getElementById("reg-nombre").value.trim();
    const apellido = document.getElementById("reg-apellido").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const rol = document.getElementById("reg-rol").value;
    try {
      const data = await registrarse({ nombre, apellido, email, password, rol });
      if (data.session) {
        window.location.href = "dashboard.html";
      } else {
        hintRegistro.textContent = "Cuenta creada. Revisá tu email para confirmarla y después iniciá sesión.";
        hintRegistro.classList.add("show");
        formRegistro.reset();
      }
    } catch (err) {
      errRegistro.textContent = "No pudimos crear la cuenta: " + err.message;
      errRegistro.classList.add("show");
    }
  });
});
