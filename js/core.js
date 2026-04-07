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
  todosCuarteles: [],      // FIX B-CUARTEL: lista completa para selector
  _ufCache: {},           // B9: caché { 'YYYY-MM-DD': valorUF }
  esComisario:     () => APP.perfil?.rol === 'comisario',
  esAdministrador: () => APP.perfil?.rol === 'administrador',
  esDigitador:     () => APP.perfil?.rol === 'digitador',
  // Retorna el cuartel actualmente seleccionado (puede diferir del propio)
  cuartelActivo:   () => APP._cuartelSeleccionado || APP.cuartel,
}

// Cuartel seleccionado actualmente en el selector (admin/comisario)
APP._cuartelSeleccionado = null

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

  // FIX B-CUARTEL: admin y comisario pueden ver todos los cuarteles.
  // Cargar lista completa para el selector de cuartel.
  if (APP.esAdministrador() || APP.esComisario()) {
    const { data: todosLosCuarteles } = await APP.sb
      .from('cuarteles').select('*').eq('activo', true).order('nombre')
    APP.todosCuarteles = todosLosCuarteles || []
  } else {
    APP.todosCuarteles = perfil.cuartel ? [perfil.cuartel] : []
  }

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
  } else if (fvc === 'mensual') {
    // 1 visita al mes: día 15 del período
    const v = new Date(inicio)
    v.setDate(15)
    if (v < inicio) v.setMonth(v.getMonth() + 1)
    if (v <= fin) visitas.push({ numero: nro++, fecha: v.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
  } else if (fvc === 'bimestral') {
    // 1 visita cada 2 meses: día 15 del mes de inicio de vigencia
    const v = new Date(inicio)
    v.setDate(15)
    if (v <= fin) visitas.push({ numero: nro++, fecha: v.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
  } else if (fvc === 'trimestral') {
    // 1 visita cada 3 meses: día 15 del mes de inicio de vigencia
    const v = new Date(inicio)
    v.setDate(15)
    if (v <= fin) visitas.push({ numero: nro++, fecha: v.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
  } else if (fvc === 'semestral') {
    // 1 visita cada 6 meses: día 15 del mes de inicio de vigencia
    const v = new Date(inicio)
    v.setDate(15)
    if (v <= fin) visitas.push({ numero: nro++, fecha: v.toISOString().split('T')[0], hora_inicio: horaInicio, hora_termino: horaTermino, turno })
  } else {
    // fallback: 1 visita en el centro del período
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
  el('app-shell').style.display      = 'grid'
  construirNavegacion()
  construirSelectorCuartel()

  // Si el usuario tiene cuartel_id NULL (admin global), preguntar con qué cuartel trabajará
  if (!APP.cuartel && (APP.esAdministrador() || APP.esComisario()) && APP.todosCuarteles.length > 0) {
    mostrarModalSeleccionCuartel()
  } else {
    mostrarPantalla('dashboard')
    renderDashboard()
  }
}

// ── MODAL SELECCIÓN DE CUARTEL AL INICIO DE SESIÓN ───────────
function mostrarModalSeleccionCuartel() {
  // Crear modal si no existe
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
        <div style="background:#04742C;border-radius:8px;width:36px;height:36px;display:flex;
                    align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">🏔</div>
        <div>
          <div style="font-weight:700;font-size:1rem;color:#1a1a1a">¿En qué cuartel vas a trabajar?</div>
          <div style="font-size:.75rem;color:#666;margin-top:.1rem">Esta selección se mantendrá durante tu sesión</div>
        </div>
      </div>

      <select id="modal-cuartel-select"
              style="width:100%;padding:.65rem .85rem;border:1.5px solid #ddd;border-radius:8px;
                     font-size:.9rem;color:#1a1a1a;background:#fff;cursor:pointer;
                     margin-bottom:1rem;outline:none;appearance:none;">
        <option value="">— Selecciona un cuartel —</option>
        ${APP.todosCuarteles.map(c =>
          `<option value="${c.id}">${c.nombre.replace(' (F)', '')}</option>`
        ).join('')}
      </select>

      <div style="display:flex;gap:.75rem">
        <button onclick="confirmarCuartelInicio()"
                style="flex:1;padding:.7rem;background:#04742C;color:#fff;border:none;
                       border-radius:8px;font-size:.9rem;font-weight:600;cursor:pointer;">
          Confirmar y entrar
        </button>
        <button onclick="confirmarCuartelInicio(true)"
                style="padding:.7rem 1rem;background:#f0f0f0;color:#666;border:none;
                       border-radius:8px;font-size:.85rem;cursor:pointer;">
          Ver todos
        </button>
      </div>
      <div style="font-size:.72rem;color:#999;text-align:center;margin-top:.75rem">
        Puedes cambiarlo en cualquier momento desde el selector superior
      </div>
    </div>`

  modal.style.display = 'flex'

  // Foco en el select para teclado
  setTimeout(() => el('modal-cuartel-select')?.focus(), 100)
}

function confirmarCuartelInicio(verTodos = false) {
  const modal = el('modal-seleccion-cuartel')

  if (!verTodos) {
    const cuartelId = el('modal-cuartel-select')?.value
    if (!cuartelId) {
      // Resaltar que debe seleccionar
      const sel = el('modal-cuartel-select')
      if (sel) { sel.style.borderColor = '#C0392B'; sel.focus() }
      return
    }
    const cuartel = APP.todosCuarteles.find(c => c.id === cuartelId)
    if (cuartel) {
      APP._cuartelSeleccionado = cuartel
      // Sincronizar selector del topbar
      const topbarSel = el('selector-cuartel')
      if (topbarSel) topbarSel.value = cuartelId
    }
  } else {
    // Ver todos: sin cuartel seleccionado
    APP._cuartelSeleccionado = null
    const topbarSel = el('selector-cuartel')
    if (topbarSel) topbarSel.value = ''
  }

  if (modal) modal.style.display = 'none'
  mostrarPantalla('dashboard')
  renderDashboard()
}

// FIX B-CUARTEL: selector de cuartel en topbar para admin/comisario
function construirSelectorCuartel() {
  const wrap = el('topbar-cuartel-wrap')
  if (!wrap) return

  // Digitador: solo ve su cuartel, sin selector
  if (APP.esDigitador() || APP.todosCuarteles.length <= 1) {
    wrap.innerHTML = `
      <span class="topbar-cuartel-label">Unidad:</span>
      <span id="topbar-cuartel" class="topbar-cuartel-nombre">
        ${APP.cuartel?.nombre || '—'}
      </span>`
    return
  }

  // Admin/Comisario: selector desplegable con todos los cuarteles
  wrap.innerHTML = `
    <span class="topbar-cuartel-label">Unidad:</span>
    <select id="selector-cuartel" class="topbar-cuartel-select"
            onchange="cambiarCuartelActivo(this.value)"
            style="font-size:.8rem;padding:.2rem .4rem;border:1px solid var(--border-light);
                   border-radius:var(--r-sm);background:var(--surface);color:var(--text);
                   cursor:pointer;max-width:260px;">
      <option value="">— Todos los cuarteles —</option>
      ${APP.todosCuarteles.map(c =>
        `<option value="${c.id}" ${c.id === APP._cuartelSeleccionado?.id ? 'selected' : ''}>
          ${c.nombre.replace(' (F)','')}
        </option>`
      ).join('')}
    </select>`

  // Inicializar con el cuartel propio del usuario (si tiene uno fijo)
  if (APP.cuartel) APP._cuartelSeleccionado = APP.cuartel
}

async function cambiarCuartelActivo(cuartelId) {
  if (!cuartelId) {
    APP._cuartelSeleccionado = null
  } else {
    APP._cuartelSeleccionado = APP.todosCuarteles.find(c => c.id === cuartelId) || APP.cuartel
  }
  const pantAlerta = document.querySelector('.nav-item.active')?.dataset?.pantalla || 'dashboard'
  await navegarA(pantAlerta)
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
  APP.todosCuarteles = []
  APP._cuartelSeleccionado = null
  mostrarLogin()
}
