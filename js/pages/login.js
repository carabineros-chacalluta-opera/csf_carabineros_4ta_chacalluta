// ============================================================
// SISTEMA CSF OPERATIVA — login.js  v3.0
// AUTH-01 — Login personalizado: username + SHA-256 contra tabla usuarios.
//           Sin dependencia de Supabase Auth.
//           hashPassword() definida en core.js (disponible globalmente).
// ============================================================

async function renderLogin() {
  // ya esta en el HTML
}

async function hacerLogin() {
  const username = el('login-email')?.value?.trim()
  const pass     = el('login-pass')?.value
  const btn      = el('login-btn')
  const err      = el('login-error')

  if (!username || !pass) { if(err) err.textContent = 'Complete todos los campos'; return }

  if (btn) { btn.disabled = true; btn.textContent = 'Verificando...' }
  if (err) err.textContent = ''

  try {
    const hash = await hashPassword(pass)

    const { data: usuario, error } = await APP.sb
      .from('usuarios')
      .select('*, cuartel:cuarteles(*)')
      .eq('username', username)
      .eq('password_hash', hash)
      .eq('activo', true)
      .single()

    if (error || !usuario) {
      if (err) err.textContent = 'Usuario o contraseña incorrectos'
      if (btn) { btn.disabled = false; btn.textContent = 'Ingresar' }
      return
    }

    guardarSesion(usuario)
    await cargarPerfil(usuario.id)
  } catch(e) {
    if (err) err.textContent = 'Error de conexion. Intente nuevamente.'
    if (btn) { btn.disabled = false; btn.textContent = 'Ingresar' }
  }
}

// Enter en campos de login
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && el('pantalla-login')?.style.display !== 'none') {
    hacerLogin()
  }
})
