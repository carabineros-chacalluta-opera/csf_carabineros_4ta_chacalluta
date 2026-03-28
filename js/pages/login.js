// ============================================================
// SISTEMA CSF OPERATIVA — login.js
// ============================================================

async function renderLogin() {
  // ya está en el HTML
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

async function cerrarSesion() {
  await APP.sb.auth.signOut()
  APP.perfil  = null
  APP.cuartel = null
  mostrarLogin()
}

// Enter en campos de login
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && el('pantalla-login')?.style.display !== 'none') {
    hacerLogin()
  }
})
