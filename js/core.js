// ============================================================
// SISTEMA CSF OPERATIVA — core.js  v1.1
// Funciones base, helpers y estado global
// CORRECCIONES:
//   B5 — mesAnteriorRef() edge case enero/febrero corregido
//   B7 — semanaISO() implementación ISO 8601 correcta
//   B9 — caché de valor UF (evita llamadas repetidas a la API)
// ============================================================

const APP = {
  sb: null,
  usuario: null,
  perfil: null,
  cuartel: null,
  _ufCache: {},           // B9: caché { 'YYYY-MM-DD': valorUF }
  esComisario:     () => APP.perfil?.rol === 'comisario',
  esAdministrador: () => APP.perfil?.rol === 'administrador',
  esDigitador:     () => APP.perfil?.rol === 'digitador',
}

// ── INICIALIZACIÓN ────────────────────────────────────────────
async function iniciarApp() {
  APP.sb = supabase.createClient(CSF_CONFIG.SUPABASE_URL, CSF_CONFIG.SUPABASE_ANON_KEY)
  const { data: { session } } = await APP.sb.auth.getSession()
  if (!session) { mostrarLogin(); return }
  await cargarPerfil(session.user.id)
}

async function cargarPerfil(userId) {
  const { data: perfil, error } = await APP.sb
    .from('usuarios').select('*, cuartel:cuarteles(*)').eq('id', userId).single()
  if (error || !perfil) { mostrarLogin(); return }
  APP.perfil  = perfil
  APP.cuartel = perfil.cuartel
  mostrarApp()
}

// ── HELPERS UI ───────────────────────────────────────────────
const el   = (id) => document.getElementById(id)
const qs   = (sel) => document.querySelector(sel)
const qsa  = (sel) => [...document.querySelectorAll(sel)]

function toast(msg, tipo = 'ok') {
  const t = document.createElement('div')
  t.className = `toast toast-${tipo}`
  t.textContent = msg
  let cont = el('toast-container')
  if (!cont) {
    cont = document.createElement('div')
    cont.id = 'toast-container'
    document.body.appendChild(cont)
  }
  cont.appendChild(t)
  setTimeout(() => t.remove(), 3500)
}

function showLoader(containerId, msg = 'Cargando...') {
  el(containerId).innerHTML = `<div class="cargando">${msg}</div>`
}

// ── FORMATO FECHAS ────────────────────────────────────────────
const DIAS_ES  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function formatFecha(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return `${DIAS_ES[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`
}

function formatFechaCorta(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`
}

// ── B7: semanaISO — implementación ISO 8601 correcta ─────────
// La semana 1 es la que contiene el primer jueves del año.
function semanaISO(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  // Ajustar al jueves más cercano: semana ISO empieza el lunes
  const day = d.getDay() || 7           // 1=lun … 7=dom
  d.setDate(d.getDate() + 4 - day)      // mover al jueves de la semana
  const yearStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}

function hoyISO() {
  return new Date().toISOString().split('T')[0]
}

// ── B5: mesAnteriorRef — edge case enero/febrero corregido ────
function mesAnteriorRef() {
  const hoy  = new Date()
  let mes    = hoy.getMonth() + 1 - CSF_CONFIG.CSF_DESFASE_MESES
  let anio   = hoy.getFullYear()
  // Ajustar cuando el mes retrocede al año anterior
  while (mes <= 0) {
    mes  += 12
    anio -= 1
  }
  return { mes, anio }
}

// ── B9: obtenerValorUF con caché ─────────────────────────────
async function obtenerValorUF(fecha) {
  if (APP._ufCache[fecha]) return APP._ufCache[fecha]
  try {
    const [anio, mes, dia] = fecha.split('-')
    const url = `https://mindicador.cl/api/uf/${dia}-${mes}-${anio}`
    const r   = await fetch(url)
    const d   = await r.json()
    const val = d.serie?.[0]?.valor || 37000
    APP._ufCache[fecha] = val          // guardar en caché
    return val
  } catch {
    APP._ufCache[fecha] = 37000        // fallback también cacheado
    return 37000
  }
}

function clpAUF(clp, valorUF) {
  return valorUF > 0 ? (clp / valorUF) : 0
}

// ── CÁLCULO CRITICIDAD P×C ────────────────────────────────────
function nivelDesdeValorPxC(valor) {
  return CSF_CONFIG.PXC_NIVELES.find(n => valor >= n.min && valor <= n.max)?.nivel || 1
}

function infoNivel(nivel) {
  return CSF_CONFIG.PXC_NIVELES.find(n => n.nivel === nivel) || CSF_CONFIG.PXC_NIVELES[0]
}

function nivelDesdeDelito(categoria, cantidad) {
  if (!cantidad || cantidad === 0) return 1
  const escala = CSF_CONFIG.CATEGORIAS_PERSONAS.includes(categoria)
    ? CSF_CONFIG.ESCALAS_DELITOS.personas
    : CSF_CONFIG.ESCALAS_DELITOS.casos
  return escala.find(e => cantidad <= e.max)?.nivel || 1
}

function maxFVC(a, b) {
  const ia = CSF_CONFIG.FVC_ORDEN.indexOf(a)
  const ib = CSF_CONFIG.FVC_ORDEN.indexOf(b)
  if (ia === -1) return b
  if (ib === -1) return a
  return ia <= ib ? a : b
}

function labelIDFI(valor) {
  return CSF_CONFIG.UMBRALES_IDFI.find(u => valor >= u.min && valor <= u.max) || CSF_CONFIG.UMBRALES_IDFI[3]
}

// ── DISTANCIA HAVERSINE ───────────────────────────────────────
function distanciaKm(lat1, lon1, lat2, lon2) {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a    = Math.sin(dLat/2) * Math.sin(dLat/2) +
               Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
               Math.sin(dLon/2) * Math.sin(dLon/2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// ── TURNO DESDE HORARIO ───────────────────────────────────────
function detectarTurno(horaStr) {
  if (!horaStr) return 'diurno'
  const h = parseInt(horaStr.replace(/[()]/g,'').split(':')[0])
  return (h >= 20 || h < 8) ? 'nocturno' : 'diurno'
}

// ── GENERACIÓN DE CALENDARIO CSF ─────────────────────────────
function generarCalendarioVisitas(punto, csf, fvcAsignada, turno, horaInicio, horaTermino) {
  const visitas = []
  const inicio  = new Date(csf.fecha_vigencia_inicio + 'T12:00:00')
  const fin     = new Date(csf.fecha_vigencia_fin    + 'T12:00:00')
  const fvc     = fvcAsignada
  let nro    = 1
  let cursor = new Date(inicio)

  if (fvc === 'diario') {
    while (cursor <= fin) {
      visitas.push({ numero: nro++, fecha: cursor.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
      cursor.setDate(cursor.getDate() + 1)
    }
  } else if (fvc === '2x_semana') {
    while (cursor <= fin) {
      const semanaFin = new Date(cursor)
      semanaFin.setDate(semanaFin.getDate() + 6)
      const v1 = new Date(cursor)
      while (v1.getDay() !== 3 && v1 <= semanaFin) v1.setDate(v1.getDate() + 1)
      if (v1 <= fin) visitas.push({ numero: nro++, fecha: v1.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
      const v2 = new Date(cursor)
      while (v2.getDay() !== 6 && v2 <= semanaFin) v2.setDate(v2.getDate() + 1)
      if (v2 <= fin && v2.getTime() !== v1.getTime()) visitas.push({ numero: nro++, fecha: v2.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
      cursor.setDate(cursor.getDate() + 7)
    }
  } else if (fvc === 'semanal') {
    while (cursor <= fin) {
      const v = new Date(cursor)
      while (v.getDay() !== 4 && v <= fin) v.setDate(v.getDate() + 1)
      if (v <= fin) visitas.push({ numero: nro++, fecha: v.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
      cursor.setDate(cursor.getDate() + 7)
    }
  } else if (fvc === 'quincenal') {
    let quincena = 1
    while (cursor <= fin) {
      const v = new Date(cursor)
      v.setDate(v.getDate() + (quincena === 1 ? 7 : 0))
      if (v <= fin) visitas.push({ numero: nro++, fecha: v.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
      cursor.setDate(cursor.getDate() + 15)
      quincena++
    }
  } else {
    const v = new Date(inicio)
    v.setDate(Math.floor((inicio.getDate() + fin.getDate()) / 2))
    if (v <= fin) visitas.push({ numero: nro++, fecha: v.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
  }

  return visitas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
                .map((v, i) => ({ ...v, numero: i + 1 }))
}

// ── ROUTER ───────────────────────────────────────────────────
const PANTALLAS = ['login','dashboard','servicios','csf','reportes','admin']

function mostrarPantalla(id) {
  PANTALLAS.forEach(p => {
    const elP = el(`pantalla-${p}`)
    if (elP) elP.style.display = (p === id) ? 'block' : 'none'
  })
  qsa('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.pantalla === id))
  // M1: sincronizar barra inferior móvil
  qsa('.mob-nav-btn').forEach(n => n.classList.toggle('mob-active', n.dataset.pantalla === id))
}

function mostrarLogin() {
  el('app-shell').style.display = 'none'
  el('pantalla-login').style.display = 'flex'
}

function mostrarApp() {
  el('pantalla-login').style.display = 'none'
  el('app-shell').style.display      = 'block'
  construirNavegacion()
  mostrarPantalla('dashboard')
  renderDashboard()
}

function construirNavegacion() {
  const nav = el('nav-items')
  if (!nav) return
  const items = [
    { id: 'dashboard', label: 'Dashboard', icono: '◈' },
    { id: 'servicios', label: 'Servicios', icono: '📋' },
    { id: 'csf',       label: 'CSF',       icono: '📄' },
    { id: 'reportes',  label: 'Reportes',  icono: '📊' },
  ]
  if (APP.esAdministrador() || APP.esComisario()) {
    items.push({ id: 'admin', label: 'Admin', icono: '⚙' })
  }
  // Sidebar
  nav.innerHTML = items.map(i => `
    <button class="nav-item" data-pantalla="${i.id}" onclick="navegarA('${i.id}')">
      <span class="nav-icono">${i.icono}</span>
      <span class="nav-label">${i.label}</span>
    </button>
  `).join('')

  // M1: barra inferior móvil
  const mob = el('mob-nav')
  if (mob) {
    mob.innerHTML = items.map(i => `
      <button class="mob-nav-btn" data-pantalla="${i.id}" onclick="navegarA('${i.id}')">
        <span class="mob-nav-icono">${i.icono}</span>
        <span class="mob-nav-label">${i.label}</span>
      </button>
    `).join('')
  }
}

async function navegarA(pantalla) {
  mostrarPantalla(pantalla)
  switch(pantalla) {
    case 'dashboard': await renderDashboard(); break
    case 'servicios': await renderServicios(); break
    case 'csf':       await renderCSF();       break
    case 'reportes':  await renderReportes();  break
    case 'admin':     await renderAdmin();     break
  }
}

function cerrarSesion() {
  APP.sb.auth.signOut()
  APP.perfil  = null
  APP.cuartel = null
  APP._ufCache = {}
  mostrarLogin()
}
