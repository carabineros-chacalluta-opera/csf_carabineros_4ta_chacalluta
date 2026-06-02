// ============================================================
// SISTEMA CSF OPERATIVA — core.js  v3.0
// CORRECCIONES v1.3 (previas):
//   FIX-S1 — Sesion persistente: persistSession + autoRefreshToken
//   FIX-S2 — Cuartel seleccionado persiste en localStorage
// CORRECCIONES v1.4.1:
//   FIX-C02 — Agregado APP.esValidador()
//   FIX-C03 — onAuthStateChange registrado UNA sola vez (aqui).
//   FIX-Q09 — obtenerValorUF() usa CSF_CONFIG.UF_FALLBACK
//   FIX-D04 — Nuevo helper filtrarPorCuartel(query, id)
//   FIX-D05 — Nuevo helper nombreCuartel(cuartel)
// CAMBIOS v3.0:
//   AUTH-01 — Eliminada dependencia de Supabase Auth.
//             Login ahora usa username + SHA-256 contra tabla usuarios.
//             RLS desactivado (sistema intranet). Sesion en localStorage.
// ============================================================

const APP = {
  sb: null,
  usuario: null,
  perfil: null,
  cuartel: null,
  todosCuarteles: [],
  _ufCache: {},
  esComisario:     () => APP.perfil?.rol === 'comisario',
  esAdministrador: () => APP.perfil?.rol === 'administrador',
  esDigitador:     () => APP.perfil?.rol === 'digitador',
  esValidador:     () => APP.perfil?.rol === 'validador',   // FIX-C02
  cuartelActivo:   () => APP._cuartelSeleccionado || APP.cuartel,
}

APP._cuartelSeleccionado = null
APP._verTodosExplicito  = false

// Claves localStorage
const LS_CUARTEL_ID  = 'csf_cuartel_id'
const LS_CUARTEL_OBJ = 'csf_cuartel_obj'
const LS_SESSION_KEY = 'csf_session'
const LS_VER_TODOS   = 'csf_ver_todos'

function guardarCuartelLS(cuartel) {
  if (!cuartel) {
    localStorage.removeItem(LS_CUARTEL_ID)
    localStorage.removeItem(LS_CUARTEL_OBJ)
  } else {
    localStorage.setItem(LS_CUARTEL_ID,  cuartel.id)
    localStorage.setItem(LS_CUARTEL_OBJ, JSON.stringify(cuartel))
  }
}

function recuperarCuartelLS() {
  try {
    const raw = localStorage.getItem(LS_CUARTEL_OBJ)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// AUTH-01: gestión de sesión personalizada
function guardarSesion(perfil) {
  localStorage.setItem(LS_SESSION_KEY, JSON.stringify(perfil))
}

function recuperarSesion() {
  try {
    const raw = localStorage.getItem(LS_SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + 'csf_operativa_4ta_chacalluta')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

// INICIALIZACION — AUTH-01: sin Supabase Auth, sesión en localStorage
async function iniciarApp() {
  APP.sb = supabase.createClient(
    CSF_CONFIG.SUPABASE_URL,
    CSF_CONFIG.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession:     false,
        autoRefreshToken:   false,
        detectSessionInUrl: false,
      }
    }
  )

  const sesion = recuperarSesion()
  if (!sesion?.id) { mostrarLogin(); return }
  await cargarPerfil(sesion.id)
}

// AUTH-01: cargarPerfil ahora busca por id en la tabla usuarios (no usa auth.uid())
async function cargarPerfil(userId) {
  const { data: perfil, error } = await APP.sb
    .from('usuarios')
    .select('*, cuartel:cuarteles(*)')
    .eq('id', userId)
    .eq('activo', true)
    .single()
  if (error || !perfil) { mostrarLogin(); return }

  APP.perfil  = perfil
  APP.cuartel = perfil.cuartel
  guardarSesion(perfil)

  if (APP.esAdministrador() || APP.esComisario() || APP.esValidador()) {
    const { data: todosLosCuarteles, error: errCuarteles } = await APP.sb
      .from('cuarteles').select('*').eq('activo', true).order('nombre')
    APP.todosCuarteles = todosLosCuarteles || []
    if (errCuarteles) console.error('CSF ⚠ Error cargando cuarteles:', errCuarteles.message)
    if (APP.todosCuarteles.length === 0) console.warn('CSF ⚠ La tabla cuarteles está vacía. Ejecutar 08_setup_completo.sql en Supabase SQL Editor.')
  } else {
    APP.todosCuarteles = perfil.cuartel ? [perfil.cuartel] : []
  }

  if (!APP.cuartel && (APP.esAdministrador() || APP.esComisario() || APP.esValidador())) {
    if (localStorage.getItem(LS_VER_TODOS) === '1') {
      APP._verTodosExplicito = true
    } else {
      const cuartelGuardado = recuperarCuartelLS()
      if (cuartelGuardado) {
        const sigue = APP.todosCuarteles.find(c => c.id === cuartelGuardado.id)
        APP._cuartelSeleccionado = sigue || null
      }
    }
  }

  mostrarApp()
}

// HELPERS UI
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

// FORMATO FECHAS
const DIAS_ES  = ['Dom','Lun','Mar','Mie','Jue','Vie','Sab']
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

function semanaISO(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay() || 7
  d.setDate(d.getDate() + 4 - day)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}

function hoyISO() {
  return new Date().toISOString().split('T')[0]
}

function mesAnteriorRef() {
  const hoy  = new Date()
  let mes    = hoy.getMonth() + 1 - CSF_CONFIG.CSF_DESFASE_MESES
  let anio   = hoy.getFullYear()
  while (mes <= 0) { mes += 12; anio -= 1 }
  return { mes, anio }
}

// FIX-Q09: usa CSF_CONFIG.UF_FALLBACK en lugar de 37000 hardcoded
async function obtenerValorUF(fecha) {
  if (APP._ufCache[fecha]) return APP._ufCache[fecha]
  try {
    const [anio, mes, dia] = fecha.split('-')
    const url = `https://mindicador.cl/api/uf/${dia}-${mes}-${anio}`
    const r   = await fetch(url)
    const d   = await r.json()
    const val = d.serie?.[0]?.valor || CSF_CONFIG.UF_FALLBACK
    APP._ufCache[fecha] = val
    return val
  } catch {
    APP._ufCache[fecha] = CSF_CONFIG.UF_FALLBACK
    return CSF_CONFIG.UF_FALLBACK
  }
}

function clpAUF(clp, valorUF) {
  return valorUF > 0 ? (clp / valorUF) : 0
}

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

function distanciaKm(lat1, lon1, lat2, lon2) {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a    = Math.sin(dLat/2) * Math.sin(dLat/2) +
               Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
               Math.sin(dLon/2) * Math.sin(dLon/2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function detectarTurno(horaStr) {
  if (!horaStr) return 'diurno'
  const h = parseInt(horaStr.replace(/[()]/g,'').split(':')[0])
  return (h >= 20 || h < 8) ? 'nocturno' : 'diurno'
}

// FIX-D04: helper para filtrar queries por cuartel (antes repetido 15+ veces)
function filtrarPorCuartel(query, cuartelId) {
  return cuartelId ? query.eq('cuartel_id', cuartelId) : query
}

// FIX-D05: helper para nombre limpio de cuartel (antes .replace(' (F)','') repetido 10+ veces)
function nombreCuartel(cuartel) {
  return cuartel?.nombre?.replace(' (F)', '') || '—'
}

// PANTALLAS Y ROUTER
const PANTALLAS = ['login','dashboard','servicios','csf','reportes','admin','capacitaciones','ripo']

function mostrarPantalla(id) {
  PANTALLAS.forEach(p => {
    const elP = el(`pantalla-${p}`)
    if (elP) elP.style.display = (p === id) ? 'block' : 'none'
  })
  qsa('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.pantalla === id))
  qsa('.mob-nav-btn').forEach(n => n.classList.toggle('mob-active', n.dataset.pantalla === id))
}

function mostrarLogin() {
  el('app-shell').style.display = 'none'
  el('pantalla-login').style.display = 'flex'
}

function mostrarApp() {
  el('pantalla-login').style.display = 'none'
  el('app-shell').style.display      = 'grid'
  construirNavegacion()
  construirSelectorCuartel()

  if (!APP.cuartel && (APP.esAdministrador() || APP.esComisario() || APP.esValidador()) && APP.todosCuarteles.length > 0) {
    if (!APP._cuartelSeleccionado && !APP._verTodosExplicito) {
      mostrarModalSeleccionCuartel()
    } else {
      mostrarPantalla('dashboard')
      renderDashboard()
    }
  } else {
    mostrarPantalla('dashboard')
    renderDashboard()
  }
}

function mostrarModalSeleccionCuartel() {
  let modal = el('modal-seleccion-cuartel')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'modal-seleccion-cuartel'
    modal.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:rgba(0,0,0,.55);
      display:flex;align-items:center;justify-content:center;
      padding:1rem;`
    document.body.appendChild(modal)
  }

  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:2rem;max-width:420px;width:100%;
                box-shadow:0 8px 32px rgba(0,0,0,.25);">
      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem">
        <div style="background:#04742C;border-radius:8px;width:36px;height:36px;
                    display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">
          CSF
        </div>
        <div>
          <div style="font-weight:700;font-size:1rem">CSF Operativa</div>
          <div style="font-size:.78rem;color:#666">Seleccione cuartel de trabajo</div>
        </div>
      </div>
      <select id="modal-cuartel-select" style="width:100%;padding:.6rem;border-radius:8px;
              border:1.5px solid #ddd;font-size:.9rem;margin-bottom:1rem">
        <option value="">— Seleccionar cuartel —</option>
        ${(APP.todosCuarteles||[]).map(c =>
          `<option value="${c.id}">${c.nombre}</option>`
        ).join('')}
      </select>
      <div style="display:flex;gap:.75rem">
        <button onclick="confirmarSeleccionCuartel(false)"
          style="flex:1;padding:.65rem;background:#04742C;color:#fff;border:none;
                 border-radius:8px;font-weight:600;cursor:pointer;font-size:.9rem">
          Entrar
        </button>
        <button onclick="confirmarSeleccionCuartel(true)"
          style="padding:.65rem 1rem;background:#f5f5f5;border:1px solid #ddd;
                 border-radius:8px;cursor:pointer;font-size:.85rem">
          Ver todos
        </button>
      </div>
    </div>`
}

function confirmarSeleccionCuartel(verTodos) {
  const modal = el('modal-seleccion-cuartel')

  if (!verTodos) {
    const cuartelId = el('modal-cuartel-select')?.value
    if (!cuartelId) {
      const sel = el('modal-cuartel-select')
      if (sel) { sel.style.borderColor = '#C0392B'; sel.focus() }
      return
    }
    const cuartel = APP.todosCuarteles.find(c => c.id === cuartelId)
    if (cuartel) {
      APP._cuartelSeleccionado = cuartel
      APP._verTodosExplicito   = false
      localStorage.removeItem(LS_VER_TODOS)
      guardarCuartelLS(cuartel)
      const topbarSel = el('selector-cuartel')
      if (topbarSel) topbarSel.value = cuartelId
    }
  } else {
    APP._cuartelSeleccionado = null
    APP._verTodosExplicito   = true
    localStorage.setItem(LS_VER_TODOS, '1')
    guardarCuartelLS(null)
    const topbarSel = el('selector-cuartel')
    if (topbarSel) topbarSel.value = ''
  }

  if (modal) modal.style.display = 'none'
  mostrarPantalla('dashboard')
  renderDashboard()
}

function construirSelectorCuartel() {
  const wrap = qs('.topbar-cuartel-wrap')   // FIX: era el() (busca id), el div tiene class
  if (!wrap) return

  const cuarteles = APP.todosCuarteles || []
  const puedeSeleccionar = (APP.esAdministrador() || APP.esComisario() || APP.esValidador())
                           && cuarteles.length > 0

  if (!puedeSeleccionar) {
    wrap.innerHTML = `
      <span class="topbar-cuartel-label">Unidad:</span>
      <span id="topbar-cuartel" class="topbar-cuartel-nombre">
        ${APP.cuartelActivo()?.nombre || '—'}
      </span>`
    return
  }

  wrap.innerHTML = `
    <span class="topbar-cuartel-label">Unidad:</span>
    <select id="selector-cuartel" class="topbar-cuartel-select"
            onchange="cambiarCuartelActivo(this.value)"
            style="font-size:.8rem;padding:.2rem .4rem;border:1px solid var(--border-light);
                   border-radius:var(--r-sm);background:var(--surface);color:var(--text);
                   cursor:pointer;max-width:260px;">
      <option value="">— Todos los cuarteles —</option>
      ${cuarteles.map(c =>
        `<option value="${c.id}" ${c.id === APP._cuartelSeleccionado?.id ? 'selected' : ''}>
          ${c.nombre.replace(' (F)','')}
        </option>`
      ).join('')}
    </select>`

  if (APP.cuartel) APP._cuartelSeleccionado = APP.cuartel
}

// Banner de selector de cuartel para módulos que usan datos por cuartel
function htmlBannerCuartel() {
  const puedeVer = APP.esAdministrador() || APP.esComisario() || APP.esValidador()
  const cuarteles = APP.todosCuarteles || []
  if (!puedeVer || cuarteles.length === 0) return ''
  const cuartelId = APP.cuartelActivo()?.id || ''
  return `
    <div style="display:flex;align-items:center;gap:.75rem;background:var(--verde-cl);
                border:1px solid var(--verde-mid);border-radius:8px;padding:.6rem 1rem;margin-bottom:.85rem">
      <span style="font-size:.78rem;font-weight:700;color:var(--verde-osc);white-space:nowrap">📍 Cuartel:</span>
      <select onchange="cambiarCuartelActivo(this.value)"
              style="flex:1;font-size:.85rem;padding:.32rem .55rem;border:1px solid var(--border);
                     border-radius:6px;background:#fff;color:var(--text);cursor:pointer;max-width:380px">
        <option value="">— Todos los cuarteles —</option>
        ${cuarteles.map(c =>
          `<option value="${c.id}" ${c.id === cuartelId ? 'selected' : ''}>${c.nombre.replace(' (F)', '')}</option>`
        ).join('')}
      </select>
    </div>`
}

// Mensaje de estado vacío cuando se necesita cuartel pero no hay ninguno seleccionado
function htmlSinCuartelSeleccionado(contexto) {
  return `<div class="card" style="text-align:center;padding:2.5rem 1rem">
    <div style="font-size:2.2rem;margin-bottom:.65rem">⬆</div>
    <div style="font-weight:700;font-size:.95rem">Selecciona un cuartel</div>
    <div style="font-size:.8rem;color:var(--muted);margin-top:.4rem">
      Usa el selector de cuartel de arriba para ver y gestionar ${contexto || 'la información'}.
    </div>
  </div>`
}

async function cambiarCuartelActivo(cuartelId) {
  if (!cuartelId) {
    APP._cuartelSeleccionado = null
    APP._verTodosExplicito   = true
    localStorage.setItem(LS_VER_TODOS, '1')
    guardarCuartelLS(null)
  } else {
    const cuartel = APP.todosCuarteles.find(c => c.id === cuartelId) || APP.cuartel
    APP._cuartelSeleccionado = cuartel
    APP._verTodosExplicito   = false
    localStorage.removeItem(LS_VER_TODOS)
    guardarCuartelLS(cuartel)
  }
  const pantAlerta = document.querySelector('.nav-item.active')?.dataset?.pantalla || 'dashboard'
  await navegarA(pantAlerta)
}

function construirNavegacion() {
  const nav = el('nav-items')
  if (!nav) return
  const items = [
    { id: 'dashboard',      label: 'Dashboard',      icono: '◈' },
    { id: 'servicios',      label: 'Servicios',      icono: '📋' },
    { id: 'csf',            label: 'CSF',            icono: '📄' },
    { id: 'capacitaciones', label: 'Capacitaciones', icono: '🎓' },
    { id: 'reportes',       label: 'Reportes',       icono: '📊' },
    { id: 'ripo',           label: 'RIPO',           icono: '📁' },
  ]
  if (APP.esAdministrador() || APP.esComisario()) {
    items.push({ id: 'admin', label: 'Admin', icono: '⚙' })
  }
  nav.innerHTML = items.map(i => `
    <button class="nav-item" data-pantalla="${i.id}" onclick="navegarA('${i.id}')">
      <span class="nav-icono">${i.icono}</span>
      <span class="nav-label">${i.label}</span>
    </button>
  `).join('')

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
    case 'dashboard':      await renderDashboard();      break
    case 'servicios':      await renderServicios();      break
    case 'csf':            await renderCSF();            break
    case 'reportes':       await renderReportes();       break
    case 'admin':          await renderAdmin();          break
    case 'capacitaciones': await renderCapacitaciones(); break
    case 'ripo':           await renderRipo();           break
  }
}

// cerrarSesion() — AUTH-01: limpia sesión local (sin Supabase Auth)
function cerrarSesion() {
  localStorage.removeItem(LS_SESSION_KEY)
  localStorage.removeItem(LS_VER_TODOS)
  APP.perfil               = null
  APP.cuartel              = null
  APP._ufCache             = {}
  APP.todosCuarteles       = []
  APP._cuartelSeleccionado = null
  APP._verTodosExplicito   = false
  guardarCuartelLS(null)
  mostrarLogin()
}

// generarCalendarioVisitas — sin cambios funcionales en esta version
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
    let quincena = 0
    while (cursor <= fin) {
      const v = new Date(cursor)
      v.setDate(v.getDate() + (quincena % 2 === 0 ? 2 : 5))
      if (v <= fin) visitas.push({ numero: nro++, fecha: v.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
      cursor.setDate(cursor.getDate() + 7)
      quincena++
    }
  } else if (fvc === 'quincenal') {
    let quincena = 0
    while (cursor <= fin) {
      const v = new Date(cursor)
      if (quincena % 2 === 0) { v.setDate(7) } else { v.setDate(22) }
      if (v <= fin) visitas.push({ numero: nro++, fecha: v.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
      cursor.setDate(cursor.getDate() + 15)
      quincena++
    }
  } else if (fvc === 'mensual') {
    const v = new Date(inicio)
    v.setDate(15)
    if (v < inicio) v.setMonth(v.getMonth() + 1)
    if (v <= fin) visitas.push({ numero: nro++, fecha: v.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
  } else if (fvc === 'bimestral') {
    const v = new Date(inicio); v.setDate(15)
    if (v <= fin) visitas.push({ numero: nro++, fecha: v.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
  } else if (fvc === 'trimestral') {
    const v = new Date(inicio); v.setDate(15)
    if (v <= fin) visitas.push({ numero: nro++, fecha: v.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
  } else if (fvc === 'semestral') {
    const v = new Date(inicio); v.setDate(15)
    if (v <= fin) visitas.push({ numero: nro++, fecha: v.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
  } else {
    const v = new Date(inicio)
    v.setDate(Math.floor((inicio.getDate() + fin.getDate()) / 2))
    if (v <= fin) visitas.push({ numero: nro++, fecha: v.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
  }

  return visitas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
                .map((v, i) => ({ ...v, numero: i + 1 }))
}
