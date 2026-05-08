// ============================================================
// SISTEMA CSF OPERATIVA — login.js
// CORRECCIONES v1.4.1:
//   FIX-C01 — Eliminada cerrarSesion() duplicada e incompleta.
//              La funcion canonica vive en core.js unicamente.
// ============================================================

async function renderLogin() {
  // ya esta en el HTML
}

async function hacerLogin() {
  const email = el('login-email')?.value?.trim()
  const pass  = el('login-pass')?.value
  const btn   = el('login-btn')
  const err   = el('login-error')

  if (!email || !pass) { if(err) err.textContent = 'Complete todos los campos'; return }

  if (btn) { btn.disabled = true; btn.textContent = 'Ingresando...' }
  if (err) err.textContent = ''

  const { data, error } = await APP.sb.auth.signInWithPassword({ email, password: pass })

  if (error) {
    if (err) err.textContent = 'Credenciales incorrectas'
    if (btn) { btn.disabled = false; btn.textContent = 'Ingresar' }
    return
  }

  await cargarPerfil(data.user.id)
}

// FIX-C01: cerrarSesion() ELIMINADA de este archivo.
// La version completa (limpia _ufCache, todosCuarteles,
// _cuartelSeleccionado y guarda en localStorage) existe en core.js.
// Tener dos definiciones era inseguro: la de login.js era incompleta
// y podia quedar activa si el orden de <script> en el HTML cambiaba.

// Enter en campos de login
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && el('pantalla-login')?.style.display !== 'none') {
    hacerLogin()
  }
})
