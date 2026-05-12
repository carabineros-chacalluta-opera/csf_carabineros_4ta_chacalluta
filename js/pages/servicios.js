// ============================================================
// SISTEMA CSF OPERATIVA — servicios.js  v2.1
// CAMBIOS v2.0:
//   C1  — S4 Incautaciones integrada en S6 por persona (solo detención)
//   C2  — Modo operandi: opción "Otro" + texto libre máx 40 chars
//   C3  — Toggle "¿cerca de un punto?" en S2, S5, S6
//   C4  — Coordenadas GMS (G°M'S") con conversión a decimal en tiempo real
//   C5  — Campo folio libro físico junto al código responsable
//   C6  — S7 Rescates / Apoyo humanitario (nueva sección)
//   C7  — S8 Entrevistas PNP/PNB (nueva sección)
//   FIX — CHECK constraint nna_irregular en personas_registradas
//   FIX — Limpieza de rescates y entrevistas al reguardar servicio
// CAMBIOS v2.1:
//   SEC — Código funcionario y Folio Libro Físico son obligatorios
//         El servicio no puede guardarse sin ambos campos completados
// ============================================================

let _servicioActual      = null
let _puntosDelCuartel    = []
let _puntosSeleccionados = []
let _calcUFTimer         = null
let _modosOperandi       = []

// ── MAPA de IDs de botones toggle ────────────────────────────
const TOGGLE_BTN_IDS = {
  incautaciones: 'incaut',
  hallazgos:     'hall',
  personas:      'pers',
  rescates:      'rescates',
  entrevistas:   'entrevistas',
}

// ══════════════════════════════════════════════════════════════
// C4 — FUNCIONES GMS ↔ DECIMAL
// ══════════════════════════════════════════════════════════════

function gmsADecimal(g, m, s, hem) {
  const g_ = parseFloat(g), m_ = parseFloat(m), s_ = parseFloat(s)
  if (isNaN(g_) || isNaN(m_) || isNaN(s_)) return null
  if (m_ < 0 || m_ >= 60 || s_ < 0 || s_ >= 60) return null
  const dec = g_ + m_ / 60 + s_ / 3600
  return (hem === 'S' || hem === 'W') ? -dec : dec
}

function decimalAGMS(dec, tipo) {
  if (dec === null || dec === undefined || isNaN(dec)) return '—'
  const hem = tipo === 'lat' ? (dec >= 0 ? 'N' : 'S') : (dec >= 0 ? 'E' : 'W')
  const abs  = Math.abs(dec)
  const g    = Math.floor(abs)
  const mDec = (abs - g) * 60
  const min  = Math.floor(mDec)
  const sec  = ((mDec - min) * 60).toFixed(1)
  return `${hem} ${g}° ${String(min).padStart(2,'0')}' ${String(sec).padStart(4,'0')}"`
}

function htmlCampoGMS(prefix, formId) {
  return `
  <div class="coords-gms-bloque" style="background:var(--bg-alt,#f5f7f5);border:1px solid var(--border,#dde8e2);border-radius:8px;padding:.75rem;margin-top:.5rem">
    <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--verde,#04742C);margin-bottom:.55rem">
      📍 Coordenadas del procedimiento (GMS)
    </div>
    <div style="margin-bottom:.5rem">
      <div style="font-size:.7rem;font-weight:600;color:var(--muted);text-transform:uppercase;margin-bottom:.25rem">Latitud</div>
      <div style="display:flex;align-items:center;gap:.35rem;flex-wrap:wrap">
        <select class="${prefix}-lat-hem" onchange="onGMSChange('${formId}','${prefix}')" style="padding:.38rem .45rem;border:1.5px solid var(--border,#dde8e2);border-radius:6px;font-size:.85rem;font-weight:700;width:54px">
          <option value="S" selected>S</option><option value="N">N</option>
        </select>
        <input type="number" class="${prefix}-lat-g" min="0" max="90" placeholder="°" oninput="onGMSChange('${formId}','${prefix}')" style="width:58px;padding:.38rem .45rem;border:1.5px solid var(--border,#dde8e2);border-radius:6px;font-size:.9rem;font-weight:700;text-align:center"/>
        <span style="font-size:.78rem;color:var(--muted)">°</span>
        <input type="number" class="${prefix}-lat-m" min="0" max="59" placeholder="'" oninput="onGMSChange('${formId}','${prefix}')" style="width:54px;padding:.38rem .45rem;border:1.5px solid var(--border,#dde8e2);border-radius:6px;font-size:.9rem;font-weight:700;text-align:center"/>
        <span style="font-size:.78rem;color:var(--muted)">'</span>
        <input type="number" class="${prefix}-lat-s" min="0" max="59.9" step="0.1" placeholder='"' oninput="onGMSChange('${formId}','${prefix}')" style="width:65px;padding:.38rem .45rem;border:1.5px solid var(--border,#dde8e2);border-radius:6px;font-size:.9rem;font-weight:700;text-align:center"/>
        <span style="font-size:.78rem;color:var(--muted)">"</span>
      </div>
    </div>
    <div style="margin-bottom:.55rem">
      <div style="font-size:.7rem;font-weight:600;color:var(--muted);text-transform:uppercase;margin-bottom:.25rem">Longitud</div>
      <div style="display:flex;align-items:center;gap:.35rem;flex-wrap:wrap">
        <select class="${prefix}-lon-hem" onchange="onGMSChange('${formId}','${prefix}')" style="padding:.38rem .45rem;border:1.5px solid var(--border,#dde8e2);border-radius:6px;font-size:.85rem;font-weight:700;width:54px">
          <option value="W" selected>W</option><option value="E">E</option>
        </select>
        <input type="number" class="${prefix}-lon-g" min="0" max="180" placeholder="°" oninput="onGMSChange('${formId}','${prefix}')" style="width:58px;padding:.38rem .45rem;border:1.5px solid var(--border,#dde8e2);border-radius:6px;font-size:.9rem;font-weight:700;text-align:center"/>
        <span style="font-size:.78rem;color:var(--muted)">°</span>
        <input type="number" class="${prefix}-lon-m" min="0" max="59" placeholder="'" oninput="onGMSChange('${formId}','${prefix}')" style="width:54px;padding:.38rem .45rem;border:1.5px solid var(--border,#dde8e2);border-radius:6px;font-size:.9rem;font-weight:700;text-align:center"/>
        <span style="font-size:.78rem;color:var(--muted)">'</span>
        <input type="number" class="${prefix}-lon-s" min="0" max="59.9" step="0.1" placeholder='"' oninput="onGMSChange('${formId}','${prefix}')" style="width:65px;padding:.38rem .45rem;border:1.5px solid var(--border,#dde8e2);border-radius:6px;font-size:.9rem;font-weight:700;text-align:center"/>
        <span style="font-size:.78rem;color:var(--muted)">"</span>
      </div>
    </div>
    <div class="${prefix}-coords-preview" style="font-size:.74rem;font-family:monospace;color:var(--muted);background:#fff;border:1px solid var(--border,#dde8e2);border-radius:5px;padding:.32rem .55rem;min-height:1.5rem">—</div>
    <input type="hidden" class="${prefix}-lat-dec"/>
    <input type="hidden" class="${prefix}-lon-dec"/>
  </div>`
}

function onGMSChange(formId, prefix) {
  const form = document.getElementById(formId)
  if (!form) return
  const lat = gmsADecimal(
    form.querySelector(`.${prefix}-lat-g`)?.value,
    form.querySelector(`.${prefix}-lat-m`)?.value,
    form.querySelector(`.${prefix}-lat-s`)?.value,
    form.querySelector(`.${prefix}-lat-hem`)?.value || 'S'
  )
  const lon = gmsADecimal(
    form.querySelector(`.${prefix}-lon-g`)?.value,
    form.querySelector(`.${prefix}-lon-m`)?.value,
    form.querySelector(`.${prefix}-lon-s`)?.value,
    form.querySelector(`.${prefix}-lon-hem`)?.value || 'W'
  )
  const preview = form.querySelector(`.${prefix}-coords-preview`)
  const latDec  = form.querySelector(`.${prefix}-lat-dec`)
  const lonDec  = form.querySelector(`.${prefix}-lon-dec`)
  if (lat !== null && lon !== null) {
    if (preview) preview.textContent = `Lat: ${lat.toFixed(6)}  |  Lon: ${lon.toFixed(6)}`
    if (latDec)  latDec.value = lat
    if (lonDec)  lonDec.value = lon
  } else {
    if (preview) preview.textContent = '— (completa los 6 campos para calcular)'
    if (latDec)  latDec.value = ''
    if (lonDec)  lonDec.value = ''
  }
}

function leerCoordsDecimal(form, prefix) {
  const latRaw = form.querySelector(`.${prefix}-lat-dec`)?.value
  const lonRaw = form.querySelector(`.${prefix}-lon-dec`)?.value
  const lat = (latRaw !== '' && latRaw !== undefined) ? parseFloat(latRaw) : null
  const lon = (lonRaw !== '' && lonRaw !== undefined) ? parseFloat(lonRaw) : null
  return {
    lat: (!isNaN(lat) && lat !== null) ? lat : null,
    lon: (!isNaN(lon) && lon !== null) ? lon : null,
  }
}

// ── Bloque toggle "¿cerca de un punto?" ──────────────────────
function htmlTogglePunto(prefix, formId, label = '¿Ocurrió cerca de un Hito, PNH o SIE?') {
  return `
  <div style="margin-top:.6rem">
    <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.3rem">${label}</div>
    <div style="display:flex;gap:.4rem;margin-bottom:.4rem">
      <button type="button" class="btn-toggle ${prefix}-cerca-si" onclick="onCercaPuntoChange('${formId}','${prefix}',true)"
        style="flex:1;padding:.4rem;border-radius:6px;border:1.5px solid var(--border,#dde8e2);background:#fff;font-size:.8rem;font-weight:600;cursor:pointer;color:var(--muted)">
        Sí, cerca de un punto
      </button>
      <button type="button" class="btn-toggle ${prefix}-cerca-no btn-toggle-active" onclick="onCercaPuntoChange('${formId}','${prefix}',false)"
        style="flex:1;padding:.4rem;border-radius:6px;border:1.5px solid var(--verde,#04742C);background:var(--verde,#04742C);font-size:.8rem;font-weight:600;cursor:pointer;color:#fff">
        No, sector libre
      </button>
    </div>
    <div class="${prefix}-bloque-punto" style="display:none"></div>
    <div class="${prefix}-bloque-gms" style="display:none">${htmlCampoGMS(prefix, formId)}</div>
  </div>`
}

function onCercaPuntoChange(formId, prefix, cercaSi) {
  const form = document.getElementById(formId)
  if (!form) return
  const btnSi  = form.querySelector(`.${prefix}-cerca-si`)
  const btnNo  = form.querySelector(`.${prefix}-cerca-no`)
  const bloquePunto = form.querySelector(`.${prefix}-bloque-punto`)
  const bloqueGMS   = form.querySelector(`.${prefix}-bloque-gms`)

  if (btnSi)  { btnSi.style.background = cercaSi ? 'var(--verde,#04742C)' : '#fff'; btnSi.style.color = cercaSi ? '#fff' : 'var(--muted)'; btnSi.style.borderColor = cercaSi ? 'var(--verde,#04742C)' : 'var(--border,#dde8e2)' }
  if (btnNo)  { btnNo.style.background = !cercaSi ? 'var(--verde,#04742C)' : '#fff'; btnNo.style.color = !cercaSi ? '#fff' : 'var(--muted)'; btnNo.style.borderColor = !cercaSi ? 'var(--verde,#04742C)' : 'var(--border,#dde8e2)' }

  if (cercaSi) {
    if (bloquePunto) {
      bloquePunto.style.display = 'block'
      bloquePunto.innerHTML = `
        <div class="campo" style="margin-bottom:.4rem">
          <label style="font-size:.7rem;font-weight:600;color:var(--muted);text-transform:uppercase">Punto más cercano</label>
          <select class="${prefix}-punto-sel" onchange="onPuntoCercanoChange('${formId}','${prefix}')" style="width:100%;padding:.45rem .6rem;border:1.5px solid var(--border,#dde8e2);border-radius:7px;font-size:.84rem">
            <option value="">— Seleccionar punto —</option>
            ${_puntosDelCuartel.map(p => `<option value="${p.id}" data-lat="${p.latitud||''}" data-lon="${p.longitud||''}">[${p.tipo.toUpperCase()}] ${p.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="${prefix}-punto-coords"></div>`
    }
    if (bloqueGMS) bloqueGMS.style.display = 'none'
  } else {
    if (bloquePunto) bloquePunto.style.display = 'none'
    if (bloqueGMS)  bloqueGMS.style.display = 'block'
    // Limpiar punto_id oculto
    const hidPunto = form.querySelector(`.${prefix}-punto-id`)
    if (hidPunto) hidPunto.value = ''
  }
}

function onPuntoCercanoChange(formId, prefix) {
  const form = document.getElementById(formId)
  if (!form) return
  const sel    = form.querySelector(`.${prefix}-punto-sel`)
  const coordsDiv = form.querySelector(`.${prefix}-punto-coords`)
  if (!sel || !coordsDiv) return

  const opt = sel.options[sel.selectedIndex]
  const lat  = parseFloat(opt?.dataset?.lat)
  const lon  = parseFloat(opt?.dataset?.lon)
  const puntoId = sel.value

  // Guardar punto_id en hidden
  let hidPunto = form.querySelector(`.${prefix}-punto-id`)
  if (!hidPunto) {
    hidPunto = document.createElement('input')
    hidPunto.type = 'hidden'
    hidPunto.className = `${prefix}-punto-id`
    form.appendChild(hidPunto)
  }
  hidPunto.value = puntoId

  // También guardar coords decimales en hidden para guardarServicio
  let hidLat = form.querySelector(`.${prefix}-lat-dec`)
  let hidLon = form.querySelector(`.${prefix}-lon-dec`)
  if (!hidLat) { hidLat = document.createElement('input'); hidLat.type='hidden'; hidLat.className=`${prefix}-lat-dec`; form.appendChild(hidLat) }
  if (!hidLon) { hidLon = document.createElement('input'); hidLon.type='hidden'; hidLon.className=`${prefix}-lon-dec`; form.appendChild(hidLon) }

  if (!isNaN(lat) && !isNaN(lon)) {
    hidLat.value = lat
    hidLon.value = lon
    coordsDiv.innerHTML = `
      <div style="background:var(--verde-cl,#E8F5EC);border:1px solid var(--verde-mid,#b7d9c0);border-radius:6px;padding:.45rem .7rem;font-family:monospace;font-size:.78rem;color:#155C38">
        Lat: <strong>${decimalAGMS(lat,'lat')}</strong> (${lat.toFixed(6)})<br>
        Lon: <strong>${decimalAGMS(lon,'lon')}</strong> (${lon.toFixed(6)})
      </div>`
  } else {
    hidLat.value = ''
    hidLon.value = ''
    coordsDiv.innerHTML = puntoId
      ? `<div style="background:var(--amarillo-cl,#FFF8E1);border:1px solid var(--amarillo,#9A7D0A);border-radius:6px;padding:.4rem .65rem;font-size:.77rem;color:#856404">⚠ Este punto no tiene coordenadas GPS cargadas.</div>`
      : ''
  }
}

// ══════════════════════════════════════════════════════════════
// LISTA DE SERVICIOS
// ══════════════════════════════════════════════════════════════
async function renderServicios() {
  showLoader('pantalla-servicios', 'Cargando servicios...')
  const hoy     = hoyISO()
  const anio    = new Date().getFullYear()
  const ini     = `${anio}-01-01`
  const cuartelActivo = APP.cuartelActivo()
  const puedeVerTodos = APP.esAdministrador() || APP.esComisario()

  el('pantalla-servicios').innerHTML = `
    <div class="container">
      <div class="flex-sb" style="margin-bottom:1rem">
        <div><h2 class="page-titulo">Servicios</h2></div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-secundario" onclick="abrirGenerarServicio()">✚ Generar servicio</button>
          ${APP.esAdministrador() ? `<button class="btn btn-primario" onclick="abrirCargaExcel()">↑ Cargar Excel</button>` : ''}
        </div>
      </div>
      <div class="card filtros-card" style="margin-bottom:1rem">
        <div class="g3">
          <div class="campo"><label>Desde</label><input type="date" id="svc-desde" value="${ini}"/></div>
          <div class="campo"><label>Hasta</label><input type="date" id="svc-hasta" value="${hoy}"/></div>
          <div class="campo"><label>Estado</label>
            <select id="svc-estado">
              <option value="todos">Todos</option>
              <option value="pendiente">Pendientes</option>
              <option value="completado">Completados</option>
            </select>
          </div>
          ${puedeVerTodos ? `
          <div class="campo"><label>Cuartel</label>
            <select id="svc-cuartel">
              <option value="">— Todos los cuarteles —</option>
              ${(APP.todosCuarteles || []).map(c =>
                `<option value="${c.id}" ${c.id === cuartelActivo?.id ? 'selected' : ''}>${c.nombre.replace(' (F)','')}</option>`
              ).join('')}
            </select>
          </div>` : ''}
        </div>
        <button class="btn btn-primario" onclick="consultarServicios()">Consultar</button>
      </div>
      <div id="servicios-lista"><div class="cargando">Selecciona un período y consulta</div></div>

      <!-- Modal carga Excel -->
      <div id="modal-excel" class="modal" style="display:none">
        <div class="modal-box">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1rem">
            <div class="modal-titulo">Cargar Excel de Servicios</div>
            <button onclick="el('modal-excel').style.display='none'" class="btn-cerrar">✕</button>
          </div>
          <div style="background:var(--verde-cl2,#F0F9F3);border:1px solid var(--verde-mid,#C2DECE);border-radius:var(--r,8px);padding:.9rem 1rem;margin-bottom:1rem">
            <div style="font-size:.76rem;font-weight:700;color:var(--verde-osc,#155C38);margin-bottom:.4rem;text-transform:uppercase;letter-spacing:.05em">Paso 1 — Descargar plantilla</div>
            <p style="font-size:.8rem;color:var(--muted,#5A6B62);margin-bottom:.65rem;line-height:1.5">Descarga la plantilla con el formato correcto. Completa los datos y luego súbela en el paso 2.</p>
            <button class="btn btn-secundario btn-sm" onclick="descargarPlantillaExcel()">↓ Descargar plantilla .xlsx</button>
          </div>
          <div style="background:var(--surface-2,#F8FAF9);border:1px solid var(--border-light,#DDE8E2);border-radius:var(--r,8px);padding:.9rem 1rem;margin-bottom:1rem">
            <div style="font-size:.76rem;font-weight:700;color:var(--muted,#5A6B62);margin-bottom:.4rem;text-transform:uppercase;letter-spacing:.05em">Paso 2 — Subir archivo completado</div>
            <input type="file" id="input-excel" accept=".xlsx,.xls" class="input-file" style="margin-bottom:.4rem"/>
            <p style="font-size:.72rem;color:var(--muted-light,#8A9E94);line-height:1.4">Solo se importarán filas con tipos de servicio reconocidos por el sistema.</p>
          </div>
          <div id="excel-resultado" style="font-size:.8rem;margin-bottom:.75rem"></div>
          <div style="display:flex;gap:.5rem">
            <button class="btn btn-primario" onclick="procesarExcel()">↑ Importar servicios</button>
            <button class="btn btn-ghost" onclick="el('modal-excel').style.display='none'">Cancelar</button>
          </div>
        </div>
      </div>

      <!-- Modal formulario servicio -->
      <div id="modal-servicio" class="modal" style="display:none">
        <div class="modal-box modal-grande" id="form-servicio-contenido"></div>
      </div>

      <!-- Modal editar servicio -->
      <div id="modal-editar-servicio" class="modal" style="display:none">
        <div class="modal-box" id="form-editar-servicio-contenido"></div>
      </div>

      <!-- Modal generar nuevo servicio -->
      <div id="modal-nuevo-servicio" class="modal" style="display:none">
        <div class="modal-box">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.25rem">
            <div class="modal-titulo">Generar nuevo servicio</div>
            <button onclick="el('modal-nuevo-servicio').style.display='none'" class="btn-cerrar">✕</button>
          </div>
          <div class="g2" style="margin-bottom:1rem">
            <div class="campo"><label>Fecha del servicio</label><input type="date" id="nuevo-svc-fecha"/></div>
            <div class="campo"><label>Tipo de servicio</label><select id="nuevo-svc-tipo"></select></div>
            <div class="campo"><label>Hora inicio</label><input type="time" id="nuevo-svc-hini" value="08:00"/></div>
            <div class="campo"><label>Hora término</label><input type="time" id="nuevo-svc-hfin" value="20:00"/></div>
            <div class="campo"><label>Turno</label>
              <select id="nuevo-svc-turno">
                <option value="diurno">Diurno</option>
                <option value="nocturno">Nocturno</option>
              </select>
            </div>
            <div class="campo"><label>Cantidad funcionarios</label><input type="number" id="nuevo-svc-func" min="0" value="2"/></div>
            <div class="campo"><label>Cantidad vehículos</label><input type="number" id="nuevo-svc-veh" min="0" value="1"/></div>
            <div class="campo" id="nuevo-svc-cuartel-campo"><label>Cuartel</label><select id="nuevo-svc-cuartel"></select></div>
          </div>
          <div id="nuevo-svc-resultado" style="font-size:.8rem;margin-bottom:.75rem"></div>
          <div style="display:flex;gap:.5rem">
            <button class="btn btn-primario" onclick="confirmarNuevoServicio()">✚ Crear servicio</button>
            <button class="btn btn-ghost" onclick="el('modal-nuevo-servicio').style.display='none'">Cancelar</button>
          </div>
        </div>
      </div>
    </div>`

  await consultarServicios()
}

async function consultarServicios() {
  const desde  = el('svc-desde')?.value
  const hasta  = el('svc-hasta')?.value
  const estado = el('svc-estado')?.value || 'todos'
  const zona   = el('servicios-lista')
  if (!zona) return
  const svcCuartelId = el('svc-cuartel')?.value || APP.cuartelActivo()?.id
  const cuartelId    = svcCuartelId || null
  if (!cuartelId && APP.esDigitador()) {
    zona.innerHTML = '<div class="card" style="text-align:center;padding:2rem;color:var(--muted)">Sin cuartel asignado</div>'
    return
  }
  showLoader('servicios-lista', 'Consultando servicios...')
  let query = APP.sb.from('servicios').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }).limit(500)
  if (cuartelId)          query = query.eq('cuartel_id', cuartelId)
  if (estado !== 'todos') query = query.eq('estado', estado)
  const { data: servicios, error } = await query
  if (error) { zona.innerHTML = `<div class="card" style="color:var(--rojo);padding:1rem">Error al consultar: ${error.message}</div>`; return }
  if (!servicios?.length) { zona.innerHTML = '<div class="card" style="text-align:center;padding:2rem;color:var(--muted)">Sin servicios en el período seleccionado</div>'; return }
  const pendientes  = servicios.filter(s => s.estado === 'pendiente')
  const completados = servicios.filter(s => s.estado === 'completado')
  let cuartelNombre = 'Todos los cuarteles'
  if (cuartelId) {
    const c = (APP.todosCuarteles||[]).find(c => c.id === cuartelId) || APP.cuartelActivo()
    cuartelNombre = c?.nombre || cuartelNombre
  }
  zona.innerHTML = `
    ${pendientes.filter(s => Math.ceil((new Date()-new Date(s.fecha+'T12:00:00'))/86400000) > 2).length > 0 ? `
    <div class="alertas-panel" style="margin-bottom:1rem">
      <div class="alertas-titulo">🔴 Servicios con más de 48 hrs pendientes</div>
      ${pendientes.filter(s => Math.ceil((new Date()-new Date(s.fecha+'T12:00:00'))/86400000) > 2).map(s => `
        <div class="alerta-item alerta-critica" style="cursor:pointer" onclick="abrirFormServicio('${s.id}')">
          ${formatFecha(s.fecha)} · ${s.tipo_servicio?.trim()} · ${s.hora_inicio||''}-${s.hora_termino||''}
          <button class="btn btn-sm btn-rojo" onclick="event.stopPropagation();abrirFormServicio('${s.id}')">Completar urgente</button>
        </div>`).join('')}
    </div>` : ''}
    <div class="card" style="padding:0">
      <div class="tabla-header">
        <span>${cuartelNombre} · ${desde} al ${hasta}</span>
        <span>Pendientes (${pendientes.length}) · Completados (${completados.length})</span>
      </div>
      <div class="tabla-servicios">${servicios.map(s => filaServicio(s)).join('')}</div>
    </div>`
}

function filaServicio(s) {
  const dias    = Math.ceil((new Date()-new Date(s.fecha+'T12:00:00'))/86400000)
  const urgente = s.estado === 'pendiente' && dias > 2
  const puedeEditar = APP.esAdministrador() || APP.esDigitador()
  return `
    <div class="fila-servicio fila-${s.estado} ${urgente?'fila-urgente':''}" onclick="abrirFormServicio('${s.id}')">
      <div class="fila-fecha">${formatFecha(s.fecha)}</div>
      <div class="fila-tipo">${s.tipo_servicio?.trim()?.substring(0,45)||'—'}</div>
      <div class="fila-horario">${s.hora_inicio||'—'} – ${s.hora_termino||'—'}</div>
      <div class="fila-estado"><span class="badge badge-${s.estado}">${s.estado==='pendiente'?'Pendiente':'Completado'}</span></div>
      <div style="display:flex;gap:.35rem;align-items:center" onclick="event.stopPropagation()">
        ${s.estado==='pendiente'
          ? `<button class="btn btn-sm btn-completar" onclick="abrirFormServicio('${s.id}')">Completar →</button>`
          : '<span class="fila-check">✓</span>'}
        ${puedeEditar ? `
          <button class="btn btn-sm btn-secundario" title="Editar servicio" onclick="abrirEditarServicio('${s.id}')">✎</button>
          <button class="btn btn-sm" title="Eliminar servicio" style="background:#fdecea;color:#C0392B;border:1px solid #f5c6c6" onclick="confirmarEliminarServicio('${s.id}','${formatFecha(s.fecha).replace(/'/g,'')}')">✕</button>
        ` : ''}
      </div>
    </div>`
}

// ── EDITAR SERVICIO ──────────────────────────────────────────
async function abrirEditarServicio(servicioId) {
  const { data: svc } = await APP.sb.from('servicios').select('*').eq('id', servicioId).single()
  if (!svc) { toast('No se pudo cargar el servicio', 'err'); return }
  el('form-editar-servicio-contenido').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.25rem">
      <div class="modal-titulo">Editar servicio</div>
      <button onclick="el('modal-editar-servicio').style.display='none'" class="btn-cerrar">✕</button>
    </div>
    <input type="hidden" id="edit-svc-id" value="${svc.id}"/>
    <div class="g2" style="margin-bottom:1rem">
      <div class="campo"><label>Fecha</label><input type="date" id="edit-svc-fecha" value="${svc.fecha}"/></div>
      <div class="campo"><label>Tipo de servicio</label>
        <select id="edit-svc-tipo">
          ${CSF_CONFIG.SERVICIOS_CSF.map(t=>`<option value="${t}" ${svc.tipo_servicio?.trim()===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="campo"><label>Hora inicio</label><input type="time" id="edit-svc-hini" value="${svc.hora_inicio||'08:00'}"/></div>
      <div class="campo"><label>Hora término</label><input type="time" id="edit-svc-hfin" value="${svc.hora_termino||'20:00'}"/></div>
      <div class="campo"><label>Turno</label>
        <select id="edit-svc-turno">
          <option value="diurno" ${svc.turno==='diurno'?'selected':''}>Diurno</option>
          <option value="nocturno" ${svc.turno==='nocturno'?'selected':''}>Nocturno</option>
        </select>
      </div>
      <div class="campo"><label>Estado</label>
        <select id="edit-svc-estado">
          <option value="pendiente" ${svc.estado==='pendiente'?'selected':''}>Pendiente</option>
          <option value="completado" ${svc.estado==='completado'?'selected':''}>Completado</option>
        </select>
      </div>
      <div class="campo"><label>Cantidad funcionarios</label><input type="number" id="edit-svc-func" min="0" value="${svc.cantidad_funcionarios||0}"/></div>
      <div class="campo"><label>Cantidad vehículos</label><input type="number" id="edit-svc-veh" min="0" value="${svc.cantidad_vehiculos||0}"/></div>
    </div>
    <div class="campo" style="margin-bottom:1rem"><label>Observaciones</label><textarea id="edit-svc-obs" rows="2" style="width:100%">${svc.observaciones||''}</textarea></div>
    <div style="display:flex;gap:.75rem">
      <button class="btn btn-primario" onclick="guardarEdicionServicio()">✓ Guardar cambios</button>
      <button class="btn btn-secundario" onclick="el('modal-editar-servicio').style.display='none'">Cancelar</button>
    </div>`
  el('modal-editar-servicio').style.display = 'flex'
}

async function guardarEdicionServicio() {
  const id = el('edit-svc-id')?.value
  if (!id) return
  const datos = {
    fecha: el('edit-svc-fecha')?.value,
    tipo_servicio: el('edit-svc-tipo')?.value,
    hora_inicio: el('edit-svc-hini')?.value || null,
    hora_termino: el('edit-svc-hfin')?.value || null,
    turno: el('edit-svc-turno')?.value,
    estado: el('edit-svc-estado')?.value,
    cantidad_funcionarios: parseInt(el('edit-svc-func')?.value) || 0,
    cantidad_vehiculos: parseInt(el('edit-svc-veh')?.value) || 0,
    observaciones: el('edit-svc-obs')?.value?.trim() || null,
    updated_at: new Date().toISOString(),
  }
  if (!datos.fecha) { toast('La fecha es obligatoria', 'err'); return }
  const { error } = await APP.sb.from('servicios').update(datos).eq('id', id)
  if (error) { toast('Error al guardar: ' + error.message, 'err'); return }
  toast('Servicio actualizado correctamente', 'ok')
  el('modal-editar-servicio').style.display = 'none'
  await consultarServicios()
}

// ── ELIMINAR SERVICIO ─────────────────────────────────────────
function confirmarEliminarServicio(servicioId, descripcion) {
  if (!confirm(`¿Eliminar este servicio?\n\n${descripcion}\n\nSe eliminarán en cascada todos sus datos.\n\nEsta acción no se puede deshacer.`)) return
  eliminarServicio(servicioId)
}

async function eliminarServicio(servicioId) {
  try {
    await Promise.all([
      APP.sb.from('visitas_puntos').delete().eq('servicio_id', servicioId),
      APP.sb.from('controles_servicio').delete().eq('servicio_id', servicioId),
      APP.sb.from('personas_registradas').delete().eq('servicio_id', servicioId),
      APP.sb.from('incautaciones').delete().eq('servicio_id', servicioId),
      APP.sb.from('hallazgos_sin_detenido').delete().eq('servicio_id', servicioId),
      APP.sb.from('observaciones_intel').delete().eq('servicio_id', servicioId),
      APP.sb.from('alertas').delete().eq('servicio_id', servicioId),
      APP.sb.from('rescates_servicio').delete().eq('servicio_id', servicioId),
      APP.sb.from('entrevistas_servicio').delete().eq('servicio_id', servicioId),
    ])
    const { error } = await APP.sb.from('servicios').delete().eq('id', servicioId)
    if (error) throw error
    toast('Servicio eliminado correctamente', 'ok')
    await consultarServicios()
  } catch(e) {
    toast('Error al eliminar: ' + e.message, 'err')
    console.error('eliminarServicio error:', e)
  }
}

// ── CARGA / GENERAR EXCEL ────────────────────────────────────
function abrirCargaExcel() { el('modal-excel').style.display = 'flex' }

function descargarPlantillaExcel() {
  const TIPOS   = CSF_CONFIG.SERVICIOS_CSF
  const headers = ['FECHA','TIPO DE SERVICIO','HORARIO (HH:MM-HH:MM)','CANTIDAD FUNCIONARIOS','CANTIDAD VEHÍCULOS']
  const hoy     = new Date()
  const fecha   = `${hoy.getDate().toString().padStart(2,'0')}/${(hoy.getMonth()+1).toString().padStart(2,'0')}/${hoy.getFullYear()}`
  const ejemplos = TIPOS.map(tipo => [fecha, tipo, '08:00-16:00', 2, 1])
  const instrucciones = [
    ['INSTRUCCIONES — PLANTILLA CSF OPERATIVA'],[''],
    ['COLUMNA','DESCRIPCIÓN','FORMATO','EJEMPLO'],
    ['FECHA','Fecha del servicio','DD/MM/AAAA',fecha],
    ['TIPO DE SERVICIO','Debe ser exactamente uno de los tipos válidos (ver abajo)','Texto',TIPOS[0]],
    ['HORARIO','Hora inicio y término separados por guión','HH:MM-HH:MM','08:00-16:00'],
    ['CANTIDAD FUNCIONARIOS','Número entero','Número','2'],
    ['CANTIDAD VEHÍCULOS','Número entero','Número','1'],[''],
    ['TIPOS DE SERVICIO VÁLIDOS:'],...TIPOS.map(t=>['',t]),[''],
    ['NOTAS:'],['','• La primera fila (encabezado) no se importa.'],
    ['','• Si un servicio ya existe (misma fecha + tipo + hora), se actualiza sin duplicar.'],
    ['','• Los servicios importados quedan en estado PENDIENTE.'],
  ]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers,...ejemplos])
  ws['!cols'] = [{wch:14},{wch:46},{wch:22},{wch:22},{wch:18}]
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
  const wsInst = XLSX.utils.aoa_to_sheet(instrucciones)
  wsInst['!cols'] = [{wch:28},{wch:55},{wch:20},{wch:20}]
  XLSX.utils.book_append_sheet(wb, wsInst, 'Instrucciones')
  const mes = String(hoy.getMonth()+1).padStart(2,'0')
  XLSX.writeFile(wb, `Plantilla_Servicios_CSF_${hoy.getFullYear()}${mes}.xlsx`)
  toast('Plantilla descargada correctamente', 'ok')
}

async function procesarExcel() {
  const input = el('input-excel')
  const res   = el('excel-resultado')
  if (!input?.files?.[0]) { res.textContent = 'Selecciona un archivo'; return }
  res.textContent = 'Procesando...'
  const buffer = await input.files[0].arrayBuffer()
  const wb   = XLSX.read(buffer, { type: 'array', raw: false, dateNF: 'yyyy-mm-dd' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' })
  const SERVICIOS_RELEVANTES = CSF_CONFIG.SERVICIOS_CSF
  let importados = 0, ignorados = 0, duplicados = 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[0] || !row[1]) continue
    const tipo = String(row[1]).trim()
    if (!SERVICIOS_RELEVANTES.some(sr => tipo.includes(sr))) { ignorados++; continue }
    let fecha = null
    try {
      const rawFecha = String(row[0]).trim()
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawFecha)) {
        fecha = rawFecha
      } else {
        const d = new Date(rawFecha)
        if (isNaN(d.getTime())) { ignorados++; continue }
        fecha = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      }
    } catch { ignorados++; continue }
    const horario = String(row[2]||'').replace(/[()]/g,'').trim()
    const [hIni, hFin] = horario.split('-').map(h => h?.trim())
    const turno = detectarTurno(hIni)
    const { error } = await APP.sb.from('servicios').upsert({
      cuartel_id: APP.cuartelActivo()?.id,
      fecha, tipo_servicio: tipo,
      hora_inicio: hIni || null, hora_termino: hFin || null, turno,
      cantidad_funcionarios: parseInt(row[3])||0,
      cantidad_vehiculos: parseInt(row[4])||0,
      estado: 'pendiente',
    }, { onConflict: 'cuartel_id,fecha,tipo_servicio,hora_inicio' })
    if (!error) importados++
    else if (error.code === '23505') duplicados++
    else ignorados++
  }
  res.innerHTML = `<span style="color:var(--verde)">✅ ${importados} importados</span>
    ${duplicados>0?`· <span style="color:var(--amarillo)">${duplicados} ya existían</span>`:''}
    ${ignorados>0?`· <span style="color:var(--muted)">${ignorados} ignorados</span>`:''}`
  setTimeout(() => { el('modal-excel').style.display='none'; renderServicios() }, 2500)
}

function abrirGenerarServicio() {
  const modal = el('modal-nuevo-servicio')
  if (!modal) return
  const fechaEl = el('nuevo-svc-fecha'); if (fechaEl) fechaEl.value = hoyISO()
  const tipoEl  = el('nuevo-svc-tipo')
  if (tipoEl) {
    tipoEl.innerHTML = ''
    ;(CSF_CONFIG.SERVICIOS_CSF||[]).forEach(t => { const o=document.createElement('option'); o.value=t; o.textContent=t; tipoEl.appendChild(o) })
  }
  const cuartelCampo = el('nuevo-svc-cuartel-campo')
  const cuartelEl    = el('nuevo-svc-cuartel')
  const puedeVerTodos = APP.esAdministrador() || APP.esComisario()
  if (cuartelCampo) cuartelCampo.style.display = puedeVerTodos ? 'block' : 'none'
  if (cuartelEl) {
    cuartelEl.innerHTML = ''
    ;(APP.todosCuarteles||[]).forEach(c => { const o=document.createElement('option'); o.value=c.id; o.textContent=c.nombre.replace(' (F)',''); if (c.id===APP.cuartelActivo()?.id) o.selected=true; cuartelEl.appendChild(o) })
  }
  const res = el('nuevo-svc-resultado'); if (res) res.innerHTML = ''
  modal.style.display = 'flex'
}

async function confirmarNuevoServicio() {
  const fecha     = el('nuevo-svc-fecha')?.value
  const tipo      = el('nuevo-svc-tipo')?.value
  const hIni      = el('nuevo-svc-hini')?.value
  const hFin      = el('nuevo-svc-hfin')?.value
  const turno     = el('nuevo-svc-turno')?.value
  const func_     = parseInt(el('nuevo-svc-func')?.value) || 0
  const vehs      = parseInt(el('nuevo-svc-veh')?.value)  || 0
  const cuartelId = el('nuevo-svc-cuartel')?.value || APP.cuartelActivo()?.id
  const res       = el('nuevo-svc-resultado')
  if (!fecha || !tipo) { if(res) res.innerHTML='<span style="color:var(--rojo)">Fecha y tipo son obligatorios.</span>'; return }
  if (!cuartelId)      { if(res) res.innerHTML='<span style="color:var(--rojo)">Selecciona un cuartel.</span>'; return }
  const btnCrear = el('modal-nuevo-servicio')?.querySelector('.btn-primario')
  if (btnCrear) { btnCrear.disabled=true; btnCrear.textContent='Creando...' }
  const { error } = await APP.sb.from('servicios').insert({
    cuartel_id: cuartelId, fecha, tipo_servicio: tipo,
    hora_inicio: hIni||null, hora_termino: hFin||null, turno,
    cantidad_funcionarios: func_, cantidad_vehiculos: vehs, estado: 'pendiente',
  })
  if (error) { if(res) res.innerHTML=`<span style="color:var(--rojo)">Error: ${error.message}</span>`; if(btnCrear){btnCrear.disabled=false;btnCrear.textContent='✚ Crear servicio'}; return }
  if (res) res.innerHTML='<span style="color:var(--verde)">Servicio creado correctamente.</span>'
  setTimeout(() => { el('modal-nuevo-servicio').style.display='none'; renderServicios() }, 1000)
}

// ══════════════════════════════════════════════════════════════
// FORMULARIO COMPLETAR SERVICIO
// ══════════════════════════════════════════════════════════════
async function abrirFormServicio(servicioId) {
  if (APP.esComisario()) return
  showLoader('form-servicio-contenido', 'Cargando servicio...')
  el('modal-servicio').style.display = 'flex'

  const { data: svc } = await APP.sb.from('servicios').select('*').eq('id', servicioId).single()
  if (!svc) { toast('No se pudo cargar el servicio', 'err'); el('modal-servicio').style.display='none'; return }

  const cuartelId = svc.cuartel_id
  const { data: puntos } = await APP.sb.from('puntos_territoriales')
    .select('*').eq('cuartel_id', cuartelId).eq('activo', true).order('tipo').order('nombre')

  _servicioActual      = svc
  _puntosDelCuartel    = puntos || []
  _puntosSeleccionados = []

  await cargarModosOperandi()

  const [
    { data: visitasExist },
    { data: controlesExist },
    { data: rescatesExist },
    { data: entrevistasExist },
  ] = await Promise.all([
    APP.sb.from('visitas_puntos').select('*').eq('servicio_id', servicioId),
    APP.sb.from('controles_servicio').select('*').eq('servicio_id', servicioId).single(),
    APP.sb.from('rescates_servicio').select('*').eq('servicio_id', servicioId),
    APP.sb.from('entrevistas_servicio').select('*').eq('servicio_id', servicioId),
  ])

  if (visitasExist) _puntosSeleccionados = visitasExist.map(v => v.punto_id)

  const yaCompletado = svc.estado === 'completado'
  el('form-servicio-contenido').innerHTML = htmlFormServicio(svc, puntos, controlesExist, visitasExist, yaCompletado, rescatesExist, entrevistasExist)

  obtenerValorUF(svc.fecha).then(uf => { window._ufFormActual = uf })
}

function htmlFormServicio(svc, puntos, controles, visitas, yaCompletado, rescatesExist, entrevistasExist) {
  const hitos = puntos.filter(p => p.tipo === 'hito')
  const pnhs  = puntos.filter(p => p.tipo === 'pnh')
  const sies  = puntos.filter(p => p.tipo === 'sie')

  return `
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.5rem">
      <div>
        <div class="modal-titulo">${formatFecha(svc.fecha)}</div>
        <div class="modal-sub">${svc.tipo_servicio?.trim()} · ${svc.hora_inicio||''} – ${svc.hora_termino||''}</div>
      </div>
      <button onclick="el('modal-servicio').style.display='none'" class="btn-cerrar">✕</button>
    </div>

    ${yaCompletado ? `
    <div style="background:var(--amarillo-cl);border:1.5px solid var(--amarillo);border-radius:8px;padding:.65rem .85rem;margin-bottom:1rem;font-size:.8rem;font-weight:600;color:var(--amarillo)">
      ⚠ Este servicio ya fue completado. Al guardar se sobreescribirán todos los datos anteriores.
    </div>` : ''}

    <!-- C5: Responsable + Folio — AMBOS OBLIGATORIOS (v2.1) -->
    <div class="form-seccion">
      <div class="form-seccion-titulo">Responsable del servicio <span style="color:var(--rojo);font-size:.7rem">* ambos campos obligatorios</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
        <div class="campo-inline">
          <label>Código funcionario *</label>
          <input id="codigo-resp" type="text" placeholder="Ej: 42891" maxlength="10"
                 value="${svc.codigo_jefe_servicio||''}"
                 style="width:140px"
                 oninput="this.style.border=''"
                 onblur="validarCodigo(this.value)"/>
          <span id="codigo-estado" style="font-size:.75rem"></span>
        </div>
        <div class="campo-inline">
          <label>Folio Libro Físico de Soberanía *</label>
          <input id="folio-libro" type="text" placeholder="Ej: 00124" maxlength="20"
                 value="${svc.folio_libro_fisico||''}"
                 style="width:120px;font-family:monospace;font-weight:700"
                 oninput="this.style.border=''"/>
        </div>
      </div>
    </div>

    <!-- S1: Puntos visitados -->
    <div class="form-seccion">
      <div class="form-seccion-titulo">S1 — Puntos visitados en este servicio <span style="color:var(--rojo);font-size:.7rem">* mínimo 1</span></div>
      <div class="puntos-grupo">
        <div class="puntos-grupo-header" onclick="toggleGrupo('hitos')">▼ Hitos Fronterizos <span class="puntos-count" id="count-hitos">0 de ${hitos.length}</span></div>
        <div id="grupo-hitos" class="puntos-lista">${hitos.map(p => checkPunto(p, visitas)).join('')}</div>
      </div>
      <div class="puntos-grupo">
        <div class="puntos-grupo-header" onclick="toggleGrupo('pnh')">▼ Pasos No Habilitados <span class="puntos-count" id="count-pnh">0 de ${pnhs.length}</span></div>
        <div id="grupo-pnh" class="puntos-lista">${pnhs.map(p => checkPunto(p, visitas)).join('')}</div>
      </div>
      <div class="puntos-grupo">
        <div class="puntos-grupo-header" onclick="toggleGrupo('sie')">▼ Sitios de Interés Estratégico <span class="puntos-count" id="count-sie">0 de ${sies.length}</span></div>
        <div id="grupo-sie" class="puntos-lista">${sies.map(p => checkPunto(p, visitas)).join('')}</div>
      </div>
      <div class="puntos-seleccionados" id="puntos-sel-resumen">
        ${_puntosSeleccionados.length
          ? `✅ Seleccionados: ${_puntosSeleccionados.map(id => _puntosDelCuartel.find(p=>p.id===id)?.nombre||id).join(' · ')}`
          : 'Ningún punto seleccionado'}
      </div>
    </div>

    <!-- S2: Observaciones intel -->
    <div class="form-seccion">
      <div class="form-seccion-titulo">S2 — Observaciones de inteligencia <span class="opcional">(opcional)</span></div>
      <div id="obs-lista"></div>
      <button class="btn btn-agregar" onclick="agregarObservacion()">+ Agregar observación</button>
    </div>

    <!-- S3: Controles -->
    <div class="form-seccion">
      <div class="form-seccion-titulo">S3 — Controles ejecutados</div>
      <div class="controles-grid">
        ${campoNumero('ctrl-id-prev',  'Identidad preventivos',   controles?.identidad_preventivos||0)}
        ${campoNumero('ctrl-id-inv',   'Identidad investigativos', controles?.identidad_investigativos||0)}
        ${campoNumero('ctrl-migr',     'Migratorios',             controles?.migratorios||0)}
        ${campoNumero('ctrl-veh',      'Vehiculares',             controles?.vehiculares||0)}
        ${campoNumero('ctrl-flag',     'Flagrancias',             controles?.flagrancias||0)}
      </div>
    </div>

    <!-- S5: Hallazgos sin detenido -->
    <div class="form-seccion">
      <div class="form-seccion-titulo">S5 — ¿Hubo hallazgos sin detenido?</div>
      <div class="toggle-result">
        <button class="btn-toggle" id="btn-hall-si" onclick="toggleSeccion('hallazgos', true)">Sí</button>
        <button class="btn-toggle btn-toggle-active" id="btn-hall-no" onclick="toggleSeccion('hallazgos', false)">No</button>
      </div>
      <div id="seccion-hallazgos" style="display:none">
        <div id="hall-lista"></div>
        <button class="btn btn-agregar" onclick="agregarHallazgo()">+ Agregar hallazgo</button>
      </div>
    </div>

    <!-- S6: Personas con resultado -->
    <div class="form-seccion">
      <div class="form-seccion-titulo">S6 — ¿Hay personas con resultado?</div>
      <div class="toggle-result">
        <button class="btn-toggle" id="btn-pers-si" onclick="toggleSeccion('personas', true)">Sí</button>
        <button class="btn-toggle btn-toggle-active" id="btn-pers-no" onclick="toggleSeccion('personas', false)">No</button>
      </div>
      <div id="seccion-personas" style="display:none">
        <div id="pers-lista"></div>
        <button class="btn btn-agregar" onclick="agregarPersona()">+ Agregar persona con resultado</button>
      </div>
    </div>

    <!-- S7: Rescates -->
    <div class="form-seccion">
      <div class="form-seccion-titulo">S7 — ¿Hubo rescate o apoyo humanitario?</div>
      <div class="toggle-result">
        <button class="btn-toggle" id="btn-rescates-si" onclick="toggleSeccion('rescates', true)">Sí</button>
        <button class="btn-toggle btn-toggle-active" id="btn-rescates-no" onclick="toggleSeccion('rescates', false)">No</button>
      </div>
      <div id="seccion-rescates" style="display:none">
        <div id="rescates-lista"></div>
        <button class="btn btn-agregar" onclick="agregarRescate()">+ Agregar rescate</button>
      </div>
    </div>

    <!-- S8: Entrevistas -->
    <div class="form-seccion">
      <div class="form-seccion-titulo">S8 — ¿Se realizaron entrevistas PNP / PNB?</div>
      <div class="toggle-result">
        <button class="btn-toggle" id="btn-entrevistas-si" onclick="toggleSeccion('entrevistas', true)">Sí</button>
        <button class="btn-toggle btn-toggle-active" id="btn-entrevistas-no" onclick="toggleSeccion('entrevistas', false)">No</button>
      </div>
      <div id="seccion-entrevistas" style="display:none">
        <div id="entrevistas-lista"></div>
        <button class="btn btn-agregar" onclick="agregarEntrevista()">+ Agregar entrevista</button>
      </div>
    </div>

    <!-- Observaciones generales -->
    <div class="form-seccion">
      <div class="form-seccion-titulo">Observaciones generales del servicio</div>
      <textarea id="svc-observaciones-generales" rows="2" style="width:100%;padding:.5rem;border:1px solid var(--border);border-radius:var(--r);font-size:.82rem;resize:vertical" placeholder="Observaciones adicionales...">${svc.observaciones||''}</textarea>
    </div>

    <!-- Bloque justificación sin puntos -->
    <div id="bloque-sin-puntos" style="display:none;margin-bottom:1rem">
      <div style="background:#FFF3CD;border:2px solid var(--amarillo);border-radius:8px;padding:.85rem 1rem">
        <div style="font-weight:700;color:#856404;font-size:.85rem;margin-bottom:.5rem">⚠ Servicio sin puntos visitados — Justificación obligatoria</div>
        <div style="font-size:.78rem;color:#6c5700;margin-bottom:.6rem">Este servicio no registra puntos visitados. Indique el motivo (traslado de detenidos, comisión especial, corte de camino, etc.).</div>
        <textarea id="sin-puntos-justificacion" rows="3"
          placeholder="Describa el motivo (mínimo 15 caracteres)..."
          style="width:100%;border:1px solid var(--amarillo);border-radius:6px;padding:.5rem;font-size:.8rem;resize:vertical"
          oninput="this.style.border='1px solid var(--amarillo)'"></textarea>
      </div>
    </div>

    <!-- Barra de progreso -->
    <div id="guardar-progreso" style="display:none;margin-bottom:.75rem">
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:.35rem" id="progreso-label">Guardando...</div>
      <div style="background:var(--bg-alt);border-radius:4px;height:6px;overflow:hidden">
        <div id="progreso-barra" style="height:100%;background:var(--verde);width:0%;transition:width .3s"></div>
      </div>
    </div>

    <!-- Botones -->
    <div style="display:flex;gap:.75rem;padding-top:1rem;border-top:1px solid var(--border)">
      <button class="btn btn-primario" id="btn-guardar-svc" onclick="guardarServicio()">✓ Guardar servicio</button>
      <button class="btn btn-secundario" onclick="el('modal-servicio').style.display='none'">Cancelar</button>
    </div>`
}

// ── Helpers del formulario ────────────────────────────────────
function checkPunto(p, visitasExist) {
  const checked = visitasExist?.some(v => v.punto_id === p.id) || false
  if (checked && !_puntosSeleccionados.includes(p.id)) _puntosSeleccionados.push(p.id)
  return `
    <label class="check-punto ${checked?'checked':''}">
      <input type="checkbox" value="${p.id}" ${checked?'checked':''} onchange="togglePunto(this)"/>
      ${p.nombre}
    </label>`
}

function togglePunto(cb) {
  if (cb.checked) {
    if (!_puntosSeleccionados.includes(cb.value)) _puntosSeleccionados.push(cb.value)
    cb.closest('label')?.classList.add('checked')
  } else {
    _puntosSeleccionados = _puntosSeleccionados.filter(id => id !== cb.value)
    cb.closest('label')?.classList.remove('checked')
  }
  actualizarResumenPuntos()
  checkSinPuntosJustificacion()
}

function actualizarResumenPuntos() {
  const res = el('puntos-sel-resumen')
  if (!res) return
  res.textContent = _puntosSeleccionados.length
    ? `✅ Seleccionados: ${_puntosSeleccionados.map(id => _puntosDelCuartel.find(p=>p.id===id)?.nombre||id).join(' · ')}`
    : 'Ningún punto seleccionado'
  const counts = { hitos: 0, pnh: 0, sie: 0 }
  _puntosSeleccionados.forEach(id => {
    const p = _puntosDelCuartel.find(p=>p.id===id)
    if (p?.tipo === 'hito') counts.hitos++
    else if (p?.tipo === 'pnh') counts.pnh++
    else if (p?.tipo === 'sie') counts.sie++
  })
  const ch = el('count-hitos'), cp = el('count-pnh'), cs = el('count-sie')
  const total = _puntosDelCuartel
  if (ch) ch.textContent = `${counts.hitos} de ${total.filter(p=>p.tipo==='hito').length}`
  if (cp) cp.textContent = `${counts.pnh} de ${total.filter(p=>p.tipo==='pnh').length}`
  if (cs) cs.textContent = `${counts.sie} de ${total.filter(p=>p.tipo==='sie').length}`
}

function checkSinPuntosJustificacion() {
  const bloque = el('bloque-sin-puntos')
  if (!bloque) return
  bloque.style.display = _puntosSeleccionados.length === 0 ? 'block' : 'none'
}

function toggleGrupo(tipo) {
  const d = el(`grupo-${tipo}`)
  if (d) d.style.display = d.style.display === 'none' ? 'grid' : 'none'
}

function toggleSeccion(seccion, val) {
  const IDS = {
    incautaciones: { cont:'seccion-incautaciones', si:'btn-incaut-si', no:'btn-incaut-no' },
    hallazgos:     { cont:'seccion-hallazgos',     si:'btn-hall-si',   no:'btn-hall-no'   },
    personas:      { cont:'seccion-personas',      si:'btn-pers-si',   no:'btn-pers-no'   },
    rescates:      { cont:'seccion-rescates',      si:'btn-rescates-si', no:'btn-rescates-no' },
    entrevistas:   { cont:'seccion-entrevistas',   si:'btn-entrevistas-si', no:'btn-entrevistas-no' },
  }
  const ids = IDS[seccion]
  if (!ids) return
  const cont = el(ids.cont), btnSi = el(ids.si), btnNo = el(ids.no)
  if (cont) cont.style.display = val ? 'block' : 'none'
  if (btnSi) btnSi.classList.toggle('btn-toggle-active', val)
  if (btnNo) btnNo.classList.toggle('btn-toggle-active', !val)
}

function campoNumero(id, label, valor) {
  return `<div class="campo"><label>${label}</label><input type="number" id="${id}" min="0" value="${valor}" style="text-align:center;font-weight:700"/></div>`
}

function setProgreso(pct, label) {
  const barra = el('progreso-barra'), lbl = el('progreso-label'), cont = el('guardar-progreso')
  if (cont) cont.style.display = 'block'
  if (barra) barra.style.width = pct + '%'
  if (lbl) lbl.textContent = label
}

async function validarCodigo(codigo) {
  const est = el('codigo-estado')
  if (!codigo || !est) return
  const cuartelIdActual = _servicioActual?.cuartel_id || APP.cuartelActivo()?.id
  const { data } = await APP.sb.from('personal_cuartel').select('id').eq('codigo_funcionario', codigo).eq('cuartel_id', cuartelIdActual).eq('activo', true).single()
  est.textContent = data ? '✅ Código válido' : '⚠️ Código no reconocido'
  est.style.color = data ? 'var(--verde)' : 'var(--amarillo)'
}

function listaPuntosSelect() {
  if (!_puntosSeleccionados.length) return '<option value="">— No asociado —</option>'
  return `<option value="">— No asociado —</option>` +
    _puntosSeleccionados.map(id => {
      const p = _puntosDelCuartel.find(p => p.id === id)
      return `<option value="${id}">[${(p?.tipo||'').toUpperCase()}] ${p?.nombre||id}</option>`
    }).join('')
}

// ══════════════════════════════════════════════════════════════
// MODO OPERANDI
// ══════════════════════════════════════════════════════════════
async function cargarModosOperandi() {
  const { data } = await APP.sb.from('catalogo_modo_operandi').select('*').eq('activo', true).order('orden')
  _modosOperandi = data || []
}

function opcionesModosOperandi(tipoDelito) {
  const genericos   = _modosOperandi.filter(m => !m.tipo_delito)
  const especificos = _modosOperandi.filter(m => m.tipo_delito === tipoDelito)
  let opts = '<option value="">— Seleccionar —</option>'
  if (especificos.length) {
    opts += `<optgroup label="Específico para este delito">`
    opts += especificos.map(m => `<option value="${m.id}">${m.descripcion}</option>`).join('')
    opts += `</optgroup>`
  }
  opts += `<optgroup label="General">`
  opts += genericos.map(m => `<option value="${m.id}">${m.descripcion}</option>`).join('')
  opts += `</optgroup>`
  opts += `<option value="__otro__">Otro (especificar)...</option>`
  return opts
}

function onModoOperandiChange(sel, subId) {
  const sub = document.getElementById(subId)
  if (!sub) return
  if (sel.value === '__otro__') {
    sub.innerHTML = `<input type="text" class="pers-modo-texto" maxlength="40" placeholder="Describa el modo operandi (máx. 40 caracteres)..." style="width:100%;margin-top:.35rem;padding:.42rem .6rem;border:1.5px solid var(--border,#dde8e2);border-radius:6px;font-size:.83rem"/>`
    sub.style.display = 'block'
  } else {
    sub.innerHTML = ''
    sub.style.display = 'none'
  }
}

// ══════════════════════════════════════════════════════════════
// S2 — OBSERVACIONES (con toggle punto cercano + GMS)
// ══════════════════════════════════════════════════════════════
function agregarObservacion() {
  const id  = 'obs-' + Date.now()
  const div = document.createElement('div')
  div.id = id; div.className = 'sub-form'
  div.innerHTML = `
    <div class="sub-form-header">
      Observación <button onclick="el('${id}').remove()" class="btn-sm-red">✕</button>
    </div>
    <div class="g2">
      <div class="campo"><label>Tipo de hallazgo</label>
        <select class="obs-tipo">
          <option value="huellas_peatonales">Huellas peatonales</option>
          <option value="huellas_vehiculares">Huellas vehiculares</option>
          <option value="residuos_recientes">Residuos recientes</option>
          <option value="campamento">Campamento</option>
          <option value="vehiculo_abandonado">Vehículo abandonado</option>
          <option value="senalizacion_ilicita">Señalización ilícita</option>
          <option value="dano_hito">Daño a hito fronterizo</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div class="campo"><label>Nivel relevancia</label>
        <select class="obs-nivel">
          <option value="alto">Alto</option>
          <option value="medio" selected>Medio</option>
          <option value="bajo">Bajo</option>
        </select>
      </div>
    </div>
    <div class="campo"><label>Descripción</label>
      <textarea class="obs-desc" rows="2" placeholder="Descripción del hallazgo..."></textarea>
    </div>
    <div style="display:flex;gap:1rem;font-size:.8rem;margin-bottom:.4rem">
      <label><input type="checkbox" class="obs-foto"/> Registro fotográfico</label>
      <label><input type="checkbox" class="obs-gps"/> Registro GPS</label>
    </div>
    <input type="hidden" class="obs-punto-id"/>
    ${htmlTogglePunto('obs', id, '¿Ocurrió cerca de un Hito, PNH o SIE? (afecta criticidad CSF)')}
  `
  el('obs-lista').appendChild(div)
}

// ══════════════════════════════════════════════════════════════
// S4 — INCAUTACIONES (dentro de S6, por persona)
// ══════════════════════════════════════════════════════════════
function agregarIncautacionPersona(persId) {
  const id  = 'inc-' + Date.now()
  const div = document.createElement('div')
  div.id = id; div.className = 'sub-form'
  div.style.cssText = 'margin-left:.75rem;border-left:3px solid var(--amarillo,#9A7D0A);background:#FFFDF0'
  div.innerHTML = `
    <div class="sub-form-header" style="color:var(--amarillo)">
      Incautación <button onclick="el('${id}').remove()" class="btn-sm-red">✕</button>
    </div>
    <div class="g2">
      <div class="campo"><label>Tipo especie</label>
        <select class="inc-tipo" onchange="onTipoEspecieChange(this, '${id}')">
          <option value="vehiculo_robado">Vehículo robado</option>
          <option value="vehiculo_material_delito">Vehículo material delito</option>
          <option value="droga">Droga (Ley 20.000)</option>
          <option value="fardos_ropa">Fardos de ropa</option>
          <option value="cigarrillos">Cigarrillos</option>
          <option value="fitozoosanitario">Especies fitozoosanitarias</option>
          <option value="fardos_juguetes">Fardos de juguetes</option>
          <option value="dinero">Dinero en efectivo</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div class="campo"><label>Cantidad</label><input type="number" class="inc-cant" min="0" step="0.01" placeholder="0"/></div>
      <div class="campo"><label>Valor $CLP</label><input type="number" class="inc-clp" min="0" placeholder="0" oninput="calcUFDebounce(this)"/></div>
      <div class="campo"><label>UF (calculado)</label><input type="text" class="inc-uf" readonly placeholder="—"/></div>
    </div>
    <div id="extra-${id}"></div>`
  const listaInc = document.getElementById(`incaut-lista-${persId}`)
  if (listaInc) listaInc.appendChild(div)
}

// ══════════════════════════════════════════════════════════════
// S5 — HALLAZGOS SIN DETENIDO (con toggle punto cercano + GMS)
// ══════════════════════════════════════════════════════════════
function agregarHallazgo() {
  const id  = 'hall-' + Date.now()
  const div = document.createElement('div')
  div.id = id; div.className = 'sub-form'
  div.innerHTML = `
    <div class="sub-form-header">
      Hallazgo sin detenido <button onclick="el('${id}').remove()" class="btn-sm-red">✕</button>
    </div>
    <div class="g2">
      <div class="campo"><label>Tipo bien</label>
        <select class="hall-tipo">
          <option value="vehiculo_encargo">Vehículo con encargo robo</option>
          <option value="vehiculo_cot">Vehículo vinculado COT</option>
          <option value="maquinaria">Maquinaria con encargo</option>
          <option value="dinero">Dinero en efectivo</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div class="campo"><label>Descripción</label><input type="text" class="hall-desc" placeholder="Descripción..."/></div>
      <div class="campo"><label>Valor $CLP</label><input type="number" class="hall-clp" min="0" placeholder="0"/></div>
      <div class="campo"><label>UF</label><input type="text" class="hall-uf" readonly placeholder="—"/></div>
    </div>
    <input type="hidden" class="hall-punto-id"/>
    ${htmlTogglePunto('hall', id, '¿Ocurrió cerca de un Hito, PNH o SIE? (afecta criticidad CSF)')}
  `
  el('hall-lista').appendChild(div)
}

// ══════════════════════════════════════════════════════════════
// S6 — PERSONAS CON RESULTADO
// ══════════════════════════════════════════════════════════════
function agregarPersona() {
  const id  = 'pers-' + Date.now()
  const div = document.createElement('div')
  div.id = id; div.className = 'sub-form'
  div.innerHTML = `
    <div class="sub-form-header">
      Persona con resultado <button onclick="el('${id}').remove()" class="btn-sm-red">✕</button>
    </div>
    <div class="g2">
      <div class="campo"><label>Grupo etario</label>
        <select class="pers-etario" onchange="onEtarioChange(this,'${id}')">
          <option value="adulto">Adulto (18+)</option>
          <option value="nna">NNA (menor de 18)</option>
        </select>
      </div>
      <div class="campo"><label>Resultado del procedimiento</label>
        <select class="pers-resultado" onchange="onResultadoChangeBSD(this,'${id}')">
          <option value="detencion">Detención por delito</option>
          <option value="infraccion_migratoria">Infracción migratoria</option>
          <option value="nna_irregular">NNA en situación irregular</option>
        </select>
      </div>
    </div>
    <div class="g2">
      <div class="campo"><label>Hora del procedimiento</label>
        <input type="time" class="pers-hora-evento" onchange="onHoraEventoChange(this,'${id}')"/>
      </div>
      <div class="campo"><label>Rango horario (calculado)</label>
        <input type="text" class="pers-rango-hora" readonly placeholder="— selecciona hora —" style="background:var(--surface-2);color:var(--muted)"/>
      </div>
    </div>

    <!-- C3: Toggle punto cercano -->
    <input type="hidden" class="pers-punto-id"/>
    ${htmlTogglePunto('pers', id, '¿Ocurrió cerca de un Hito, PNH o SIE? (afecta criticidad CSF)')}

    <!-- Detalle dinámico según resultado -->
    <div id="detalle-${id}"></div>

    <!-- BLOQUE FFAA -->
    <div id="bloque-ffaa-${id}">
      <div class="campo-check">
        <label><input type="checkbox" onchange="toggleFFAA('${id}',this.checked)"/> ¿Tiene o tuvo vinculación con FFAA/Policía extranjera?</label>
      </div>
      <div id="ffaa-${id}" style="display:none">
        <div class="g2">
          <div class="campo"><label>Condición</label>
            <select class="pers-vinc">
              <option value="activo">Miembro activo</option>
              <option value="exmiembro">Ex miembro (retirado)</option>
            </select>
          </div>
          <div class="campo"><label>Institución</label>
            <select class="pers-inst">
              <option value="FFAA">FFAA</option><option value="Policía">Policía</option><option value="Otra">Otra</option>
            </select>
          </div>
          <div class="campo"><label>País</label><input type="text" class="pers-pais" placeholder="País..."/></div>
          <div class="campo"><label>Rango declarado</label><input type="text" class="pers-rango" placeholder="Rango..."/></div>
        </div>
        <div style="display:flex;gap:1rem;font-size:.8rem;margin-top:.5rem">
          <label><input type="checkbox" class="pers-id-oficial"/> Portaba identificación oficial</label>
          <label><input type="checkbox" class="pers-uniformado"/> Estaba uniformado</label>
        </div>
        <div class="campo" style="margin-top:.5rem">
          <label>Elemento de interés</label>
          <input type="text" class="pers-interes" placeholder="Observaciones adicionales..."/>
        </div>
      </div>
    </div>`

  el('pers-lista').appendChild(div)
  onResultadoChangeBSD(div.querySelector('.pers-resultado'), id)
}

function onHoraEventoChange(input, id) {
  const rango = calcularRangoHora(input.value)
  const rangoEl = el(id)?.querySelector('.pers-rango-hora')
  if (rangoEl) rangoEl.value = rango
}

function onResultadoChangeBSD(sel, id) {
  const det     = el(`detalle-${id}`)
  if (!det) return
  const resultado   = sel.value
  const destAuto    = DESTINO_POR_RESULTADO[resultado]   || 'parte_fiscalia'
  const clasifAuto  = CLASIFICACION_POR_RESULTADO[resultado] || 'denuncia'

  if (resultado === 'detencion') {
    det.innerHTML = `
      <div class="g2">
        <div class="campo"><label>Tipo de delito</label>
          <select class="pers-delito" onchange="onDelitoBSDChange(this,'${id}')">
            <optgroup label="Delitos COT → Fiscalía">
              <option value="trafico_drogas">Tráfico de drogas</option>
              <option value="trafico_migrantes">Tráfico ilícito de migrantes</option>
              <option value="trata_personas">Trata de personas</option>
              <option value="contrabando">Contrabando de mercadería</option>
              <option value="ley_17798_armas">Ley 17.798 — Control de Armas</option>
              <option value="abigeato">Abigeato</option>
              <option value="falsificacion_documentos">Falsificación de documentos</option>
              <option value="receptacion">Receptación</option>
              <option value="cohecho">Cohecho ⚨</option>
            </optgroup>
            <optgroup label="Órdenes → Fiscalía">
              <option value="orden_judicial">Orden judicial nacional</option>
              <option value="orden_interpol">Orden internacional / Interpol</option>
            </optgroup>
            <optgroup label="Otros">
              <option value="transito">Infracción Ley de Tránsito</option>
              <option value="otro">Otro</option>
            </optgroup>
          </select>
        </div>
        <div class="campo"><label>Ley aplicable <span style="font-size:.7rem;color:var(--muted)">(automático)</span></label>
          <input type="text" class="pers-ley" readonly style="background:var(--surface-2);color:var(--verde-osc);font-weight:600"/>
        </div>
      </div>
      <div id="subtipo-${id}"></div>
      <div class="campo">
        <label>Modo operandi</label>
        <select class="pers-modo-operandi" onchange="onModoOperandiChange(this,'modo-otro-${id}')">${opcionesModosOperandi('trafico_drogas')}</select>
        <div id="modo-otro-${id}" style="display:none"></div>
      </div>
      <div class="g2">
        <div class="campo"><label>N° Parte Policial</label><input type="text" class="pers-nro-doc" placeholder="N° parte..."/></div>
        <div class="campo"><label>Destino <span style="font-size:.7rem;color:var(--muted)">(automático)</span></label>
          <input type="text" class="pers-destino-doc" readonly value="Fiscalía" style="background:var(--surface-2);color:var(--verde-osc);font-weight:600"/>
        </div>
      </div>
      <div class="campo"><label>Organismo que detectó el procedimiento</label>
        <select class="pers-organismo">
          <option value="carabineros">Carabineros de Chile</option>
          <option value="armada">Armada de Chile</option>
          <option value="ejercito">Ejército de Chile</option>
          <option value="otro">Otro / Denuncia</option>
        </select>
      </div>
      <div style="background:var(--surface-2);border:1px solid var(--border-light);border-radius:var(--r);padding:.75rem;margin-top:.5rem">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--verde-osc);margin-bottom:.6rem">Datos del detenido</div>
        <div class="g2">
          <div class="campo"><label>Nombres</label><input type="text" class="pers-nombres" placeholder="Nombres..."/></div>
          <div class="campo"><label>Apellidos</label><input type="text" class="pers-apellidos" placeholder="Apellidos..."/></div>
          <div class="campo"><label>Sexo</label>
            <select class="pers-sexo">
              <option value="masculino">Masculino</option><option value="femenino">Femenino</option><option value="otro">Otro</option>
            </select>
          </div>
          <div class="campo"><label>Edad</label><input type="number" class="pers-edad-nna" min="0" max="120" placeholder="años"/></div>
          <div class="campo"><label>Nacionalidad</label>
            <select class="pers-nac" onchange="onNacChange(this,'${id}')">
              <option value="Chile">Chile</option><option value="Perú">Perú</option><option value="Bolivia">Bolivia</option>
              <option value="Venezuela">Venezuela</option><option value="Colombia">Colombia</option>
              <option value="Ecuador">Ecuador</option><option value="Haití">Haití</option>
              <option value="Cuba">Cuba</option><option value="Argentina">Argentina</option><option value="otra">Otra</option>
            </select>
          </div>
          <div class="campo"><label>Domicilio declarado</label><input type="text" class="pers-domicilio" placeholder="Domicilio..."/></div>
        </div>
        <div id="sin-doc-${id}" style="display:none;margin-top:.4rem">
          <label style="font-size:.82rem"><input type="checkbox" class="pers-sin-doc"/> Sin documento de identidad (SIN DOC)</label>
        </div>
      </div>

      <!-- C1: S4 integrada — Incautaciones vinculadas a esta persona -->
      <div style="margin-top:.75rem;border-top:1px dashed var(--amarillo,#9A7D0A);padding-top:.6rem">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--amarillo,#9A7D0A);margin-bottom:.4rem">
          S4 — ¿Hubo incautación en este procedimiento?
        </div>
        <div style="display:flex;gap:.4rem;margin-bottom:.4rem">
          <button type="button" onclick="toggleIncPersona('${id}',true)"  id="inc-si-${id}"
            style="flex:1;padding:.4rem;border-radius:6px;border:1.5px solid var(--border,#dde8e2);background:#fff;font-size:.8rem;font-weight:600;cursor:pointer;color:var(--muted)">
            Sí, hubo incautación
          </button>
          <button type="button" onclick="toggleIncPersona('${id}',false)" id="inc-no-${id}"
            style="flex:1;padding:.4rem;border-radius:6px;border:1.5px solid var(--amarillo,#9A7D0A);background:var(--amarillo,#9A7D0A);font-size:.8rem;font-weight:600;cursor:pointer;color:#fff">
            Sin incautación
          </button>
        </div>
        <div id="incaut-bloque-${id}" style="display:none">
          <div id="incaut-lista-${id}"></div>
          <button type="button" class="btn btn-agregar" onclick="agregarIncautacionPersona('${id}')">+ Agregar incautación</button>
        </div>
      </div>`
    const delitoSel = det.querySelector('.pers-delito')
    if (delitoSel) onDelitoBSDChange(delitoSel, id)

  } else if (resultado === 'infraccion_migratoria') {
    det.innerHTML = `
      <div class="g2">
        <div class="campo"><label>Ley aplicable <span style="font-size:.7rem;color:var(--muted)">(automático)</span></label>
          <input type="text" class="pers-ley" readonly value="Ley 21.325 (Migración)" style="background:var(--surface-2);color:var(--verde-osc);font-weight:600"/>
        </div>
        <div class="campo"><label>Destino <span style="font-size:.7rem;color:var(--muted)">(automático)</span></label>
          <input type="text" class="pers-destino-doc" readonly value="PDI (Oficio)" style="background:var(--surface-2);color:var(--verde-osc);font-weight:600"/>
        </div>
      </div>
      <div class="campo"><label>¿Cómo se inició el procedimiento?</label>
        <select class="pers-inicio">
          <option value="autodenuncia">Autodenuncia</option>
          <option value="patrullaje_flagrancia">Flagrancia en terreno</option>
          <option value="control_migratorio">Control migratorio</option>
        </select>
      </div>
      <div class="g2">
        <div class="campo"><label>Situación migratoria</label>
          <select class="pers-sit-mig">
            <option value="irregular">Ingreso irregular</option>
            <option value="permanencia_irregular">Egreso / Permanencia irregular</option>
            <option value="regular">Regular</option>
            <option value="en_tramite">En trámite</option>
            <option value="sin_documentos">Sin documentos</option>
          </select>
        </div>
        <div class="campo"><label>Gestión</label>
          <select class="pers-gestion" onchange="onGestionChange(this,'${id}')">
            <option value="reconducido">Reconducido (≤10 km LPI)</option>
            <option value="denunciado_extranjeria">Denunciado — Ley Extranjería → PDI</option>
            <option value="detenido_trafico">Detenido — Tráfico migrantes → Fiscalía</option>
            <option value="detenido_trata">Detenido — Trata personas → Fiscalía</option>
          </select>
        </div>
      </div>
      <div class="campo">
        <label>Modo operandi</label>
        <select class="pers-modo-operandi" onchange="onModoOperandiChange(this,'modo-otro-${id}')">${opcionesModosOperandi('infraccion_migratoria')}</select>
        <div id="modo-otro-${id}" style="display:none"></div>
      </div>
      <div class="g2">
        <div class="campo"><label>N° Oficio</label><input type="text" class="pers-nro-doc" placeholder="N° oficio..."/></div>
        <div class="campo"><label>Organismo que detectó</label>
          <select class="pers-organismo">
            <option value="carabineros">Carabineros de Chile</option>
            <option value="armada">Armada de Chile</option>
            <option value="ejercito">Ejército de Chile</option>
            <option value="otro">Otro / Denuncia</option>
          </select>
        </div>
      </div>
      <div id="gestion-extra-${id}"></div>
      <div style="background:var(--surface-2);border:1px solid var(--border-light);border-radius:var(--r);padding:.75rem;margin-top:.5rem">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--verde-osc);margin-bottom:.6rem">Datos del infractor</div>
        <div class="g2">
          <div class="campo"><label>Nombres</label><input type="text" class="pers-nombres" placeholder="Nombres..."/></div>
          <div class="campo"><label>Apellidos</label><input type="text" class="pers-apellidos" placeholder="Apellidos..."/></div>
          <div class="campo"><label>Sexo</label>
            <select class="pers-sexo">
              <option value="masculino">Masculino</option><option value="femenino">Femenino</option><option value="otro">Otro</option>
            </select>
          </div>
          <div class="campo"><label>Edad</label><input type="number" class="pers-edad-nna" min="0" max="120" placeholder="años"/></div>
          <div class="campo"><label>Nacionalidad</label>
            <select class="pers-nac" onchange="onNacChange(this,'${id}')">
              <option value="Chile">Chile</option><option value="Perú">Perú</option><option value="Bolivia">Bolivia</option>
              <option value="Venezuela">Venezuela</option><option value="Colombia">Colombia</option>
              <option value="Ecuador">Ecuador</option><option value="Haití">Haití</option>
              <option value="Cuba">Cuba</option><option value="Argentina">Argentina</option><option value="otra">Otra</option>
            </select>
          </div>
          <div class="campo"><label>Domicilio declarado</label><input type="text" class="pers-domicilio" placeholder="Domicilio..."/></div>
        </div>
        <div id="sin-doc-${id}" style="margin-top:.4rem">
          <label style="font-size:.82rem"><input type="checkbox" class="pers-sin-doc"/> Sin documento de identidad (SIN DOC)</label>
        </div>
      </div>`
    onGestionChange(det.querySelector('.pers-gestion'), id)

  } else {
    // NNA irregular
    det.innerHTML = `
      <div style="background:var(--amarillo-cl);border:1.5px solid var(--amarillo);border-radius:8px;padding:.75rem;margin-bottom:.75rem;font-size:.82rem;font-weight:600;">
        ⚠️ ALERTA AUTOMÁTICA — Se notificará al Comisario
      </div>
      <div class="g2">
        <div class="campo"><label>Edad</label><input type="number" class="pers-edad-nna" min="0" max="17" placeholder="años"/></div>
        <div class="campo"><label>Sexo</label>
          <select class="pers-sexo">
            <option value="masculino">Masculino</option><option value="femenino">Femenino</option><option value="otro">Otro</option>
          </select>
        </div>
        <div class="campo"><label>Nacionalidad</label>
          <select class="pers-nac">
            <option value="Chile">Chile</option><option value="Perú">Perú</option><option value="Bolivia">Bolivia</option>
            <option value="Venezuela">Venezuela</option><option value="otra">Otra</option>
          </select>
        </div>
        <div class="campo"><label>¿Acompañado?</label>
          <select class="pers-acomp" onchange="onAcompChange(this,'${id}')">
            <option value="solo">Solo / sin adulto responsable</option>
            <option value="acompanado">Acompañado por adulto</option>
          </select>
        </div>
        <div class="campo"><label>Derivación</label>
          <select class="pers-deriv">
            <option value="sename">Red SENAME</option><option value="consulado">Consulado país de origen</option><option value="otro">Otro organismo</option>
          </select>
        </div>
      </div>
      <div id="adulto-${id}"></div>
      <div class="campo"><label>N° documento</label><input type="text" class="pers-nro-doc" placeholder="N° parte o documento..."/></div>`
  }
}

function toggleIncPersona(persId, val) {
  const bloque = el(`incaut-bloque-${persId}`)
  const btnSi  = el(`inc-si-${persId}`)
  const btnNo  = el(`inc-no-${persId}`)
  if (bloque) bloque.style.display = val ? 'block' : 'none'
  if (btnSi)  { btnSi.style.background = val ? 'var(--amarillo,#9A7D0A)' : '#fff'; btnSi.style.color = val ? '#fff' : 'var(--muted)'; btnSi.style.borderColor = 'var(--amarillo,#9A7D0A)' }
  if (btnNo)  { btnNo.style.background = !val ? 'var(--amarillo,#9A7D0A)' : '#fff'; btnNo.style.color = !val ? '#fff' : 'var(--muted)'; btnNo.style.borderColor = 'var(--amarillo,#9A7D0A)' }
}

function onDelitoBSDChange(sel, id) {
  const det   = el(`detalle-${id}`)
  const leyEl = det?.querySelector('.pers-ley')
  const modoSel = det?.querySelector('.pers-modo-operandi')
  if (leyEl)   leyEl.value = LEY_POR_DELITO[sel.value] || 'Código Penal'
  if (modoSel) { modoSel.innerHTML = opcionesModosOperandi(sel.value); const subId = `modo-otro-${id}`; const sub = el(subId); if(sub){sub.innerHTML='';sub.style.display='none'} }
  onDelitoChange(sel, id)
}

function onNacChange(sel, id) {
  const sinDocDiv = el(`sin-doc-${id}`)
  if (!sinDocDiv) return
  sinDocDiv.style.display = sel.value !== 'Chile' ? 'block' : 'none'
}

function onDelitoChange(sel, id) {
  const sub = el(`subtipo-${id}`)
  if (!sub) return
  if (sel.value === 'trafico_drogas') {
    sub.innerHTML = `<div class="g2">
      <div class="campo"><label>Sustancia</label>
        <select class="pers-sustancia"><option>Marihuana</option><option>Cocaína</option><option>Pasta base</option><option>Heroína</option><option>Sintéticas</option><option>Otra</option></select>
      </div>
      <div class="campo"><label>Modalidad ocultamiento</label>
        <select class="pers-ocultamiento">
          <option value="impregnacion_ropa">Impregnación ropa/textiles</option>
          <option value="impregnacion_vehiculo">Impregnación vehículo</option>
          <option value="corporal">Ocultamiento corporal</option>
          <option value="compartimento">Compartimento oculto vehículo</option>
          <option value="encomienda">Encomienda/bulto postal</option>
          <option value="caleta">Caleta en inmueble/terreno</option>
          <option value="mezclado">Mezclado con mercadería</option>
          <option value="otro">Otro</option>
        </select>
      </div></div>`
  } else if (sel.value === 'contrabando') {
    sub.innerHTML = `<div class="g2"><div class="campo"><label>Subtipo contrabando</label>
      <select class="pers-sub-contrabando">
        <option value="cigarrillos">Cigarrillos</option><option value="fitozoosanitario">Fitozoosanitario</option>
        <option value="dinero">Dinero</option><option value="ropa">Ropa/textiles</option>
        <option value="juguetes">Juguetes</option><option value="vehiculos">Vehículos</option><option value="otro">Otro</option>
      </select></div></div>`
  } else if (sel.value === 'ley_17798_armas') {
    sub.innerHTML = `<div class="campo"><label>Subtipo Ley 17.798</label>
      <select class="pers-sub-armas">
        <option value="porte_ilegal">Porte ilegal</option><option value="tenencia">Tenencia ilegal</option>
        <option value="trafico">Tráfico de armas</option><option value="explosivos">Explosivos</option>
      </select></div>`
  } else { sub.innerHTML = '' }
}

function onGestionChange(sel, id) {
  const extra = el(`gestion-extra-${id}`)
  if (!extra) return
  if (sel.value === 'detenido_trafico' || sel.value === 'detenido_trata') {
    extra.innerHTML = `<div class="campo"><label>N° Parte Fiscalía</label><input type="text" class="pers-nro-doc" placeholder="N° parte..."/></div>`
  } else {
    extra.innerHTML = `<div class="campo"><label>N° Oficio PDI</label><input type="text" class="pers-nro-doc" placeholder="N° oficio..."/></div>`
  }
}

function onAcompChange(sel, id) {
  const div = el(`adulto-${id}`)
  if (!div) return
  if (sel.value === 'acompanado') {
    div.innerHTML = `
      <div class="campo"><label>Vínculo con NNA</label>
        <select class="pers-vinculo-nna">
          <option value="padre_madre">Padre / Madre</option>
          <option value="familiar">Familiar declarado</option>
          <option value="sin_vinculo">Sin vínculo conocido (posible traficante)</option>
        </select>
      </div>
      <div style="background:var(--rojo-cl);border-radius:6px;padding:.5rem;font-size:.75rem;color:var(--rojo)">
        → El adulto acompañante quedará registrado como imputado automáticamente
      </div>`
  } else { div.innerHTML = '' }
}

function onEtarioChange(sel, id) { /* mantener lógica existente */ }
function toggleFFAA(id, show) { const div = el(`ffaa-${id}`); if (div) div.style.display = show ? 'block' : 'none' }

// ══════════════════════════════════════════════════════════════
// S7 — RESCATES / APOYO HUMANITARIO
// ══════════════════════════════════════════════════════════════
function agregarRescate() {
  const id  = 'resc-' + Date.now()
  const div = document.createElement('div')
  div.id = id; div.className = 'sub-form'
  div.innerHTML = `
    <div class="sub-form-header">
      Rescate / Apoyo humanitario <button onclick="el('${id}').remove()" class="btn-sm-red">✕</button>
    </div>
    <div class="g2">
      <div class="campo"><label>Tipo de rescate</label>
        <select class="resc-tipo">
          <option value="montana">Montaña / Altura</option>
          <option value="fluvial">Fluvial / Lacustre</option>
          <option value="extraviado">Ciudadano extraviado</option>
          <option value="medico">Emergencia médica</option>
          <option value="vehicular">Accidente vehicular</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div class="campo"><label>Personas rescatadas</label>
        <input type="number" class="resc-cantidad" min="1" value="1"/>
      </div>
    </div>
    <div class="campo"><label>Descripción del rescate</label>
      <textarea class="resc-desc" rows="2" placeholder="Describe el rescate o apoyo humanitario..."></textarea>
    </div>
    <div class="campo"><label>Medios utilizados</label>
      <input type="text" class="resc-medios" placeholder="Ej: Vehículo 4x4, helicóptero, equipo montaña..."/>
    </div>
    <div style="margin-top:.5rem">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:.35rem">Personal participante</div>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;font-size:.82rem">
        <label><input type="checkbox" class="resc-cuartel" checked/> Cuartel</label>
        <label><input type="checkbox" class="resc-gope"/>   GOPE</label>
        <label><input type="checkbox" class="resc-bomberos"/> Bomberos</label>
        <label><input type="checkbox" class="resc-ffaa"/>   FFAA</label>
        <label><input type="checkbox" class="resc-socorro"/> Socorro / SAMU</label>
        <label><input type="checkbox" class="resc-civiles"/> Civiles</label>
      </div>
    </div>
    <div class="campo" style="margin-top:.5rem"><label>Observaciones</label>
      <input type="text" class="resc-obs" placeholder="Observaciones adicionales..."/>
    </div>
    <input type="hidden" class="resc-punto-id"/>
    ${htmlTogglePunto('resc', id, '¿Ocurrió cerca de un Hito, PNH o SIE?')}
  `
  el('rescates-lista').appendChild(div)
}

// ══════════════════════════════════════════════════════════════
// S8 — ENTREVISTAS PNP / PNB
// ══════════════════════════════════════════════════════════════
function agregarEntrevista() {
  const id  = 'entrev-' + Date.now()
  const div = document.createElement('div')
  div.id = id; div.className = 'sub-form'
  div.innerHTML = `
    <div class="sub-form-header">
      Entrevista <button onclick="el('${id}').remove()" class="btn-sm-red">✕</button>
    </div>
    <div class="g2">
      <div class="campo"><label>Tipo entrevistado</label>
        <select class="entrev-tipo-inst">
          <option value="PNP">PNP — Policía Nacional del Perú</option>
          <option value="PNB">PNB — Policía Nacional de Bolivia</option>
        </select>
      </div>
      <div class="campo"><label>Tipo entrevistado (rol)</label>
        <input type="text" class="entrev-tipo-entrev" placeholder="Ej: Oficial de frontera, Funcionario patrulla..."/>
      </div>
      <div class="campo"><label>Grado</label>
        <input type="text" class="entrev-grado" placeholder="Ej: Teniente, Suboficial..."/>
      </div>
      <div class="campo"><label>Nombre entrevistado</label>
        <input type="text" class="entrev-nombre" placeholder="Nombre completo..."/>
      </div>
      <div class="campo"><label>Hora inicio</label><input type="time" class="entrev-hora-ini"/></div>
      <div class="campo"><label>Hora término</label><input type="time" class="entrev-hora-fin"/></div>
      <div class="campo"><label>KM recorridos</label><input type="number" class="entrev-km" min="0" step="0.1" value="0"/></div>
    </div>
    <div class="campo"><label>Temas tratados</label>
      <textarea class="entrev-temas" rows="2" placeholder="Temas abordados en la entrevista..."></textarea>
    </div>
    <div class="campo"><label>Información relevante obtenida</label>
      <textarea class="entrev-info" rows="2" placeholder="Información de valor operacional..."></textarea>
    </div>
    <div class="campo"><label>Punto donde ocurrió</label>
      <select class="entrev-punto">
        <option value="">— No asociado —</option>
        ${_puntosDelCuartel.map(p => `<option value="${p.id}">[${p.tipo.toUpperCase()}] ${p.nombre}</option>`).join('')}
      </select>
    </div>
  `
  el('entrevistas-lista').appendChild(div)
}

// ══════════════════════════════════════════════════════════════
// CALCULAR UF
// ══════════════════════════════════════════════════════════════
function calcUFDebounce(input) {
  const row  = input.closest('.g2')
  const ufEl = row?.querySelector('.inc-uf')
  if (!ufEl) return
  clearTimeout(_calcUFTimer)
  _calcUFTimer = setTimeout(async () => {
    const clp = parseFloat(input.value) || 0
    const uf  = window._ufFormActual || await obtenerValorUF(_servicioActual?.fecha)
    window._ufFormActual = uf
    ufEl.value = uf > 0 ? (clp / uf).toFixed(4) + ' UF' : '—'
  }, 600)
}

function onTipoEspecieChange(sel, id) { /* lógica existente */ }

// ══════════════════════════════════════════════════════════════
// GUARDAR SERVICIO
// ══════════════════════════════════════════════════════════════
async function guardarServicio() {
  if (!_servicioActual) return

  // ── SEC v2.1: Código y Folio son OBLIGATORIOS ─────────────
  const codigoResp = el('codigo-resp')?.value?.trim()
  if (!codigoResp) {
    toast('El código del funcionario responsable es obligatorio. No se puede guardar sin identificar al responsable del ingreso.', 'err')
    const inp = el('codigo-resp')
    if (inp) {
      inp.style.border = '2px solid var(--rojo)'
      inp.focus()
      inp.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    return
  }

  const folioLibro = el('folio-libro')?.value?.trim()
  if (!folioLibro) {
    toast('El Folio del Libro Físico de Soberanía es obligatorio. El registro digital debe tener correlato con el libro físico.', 'err')
    const inp = el('folio-libro')
    if (inp) {
      inp.style.border = '2px solid var(--rojo)'
      inp.focus()
      inp.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    return
  }
  // Limpiar bordes de error si están ok
  const inpCod = el('codigo-resp'); if (inpCod) inpCod.style.border = ''
  const inpFol = el('folio-libro'); if (inpFol) inpFol.style.border = ''
  // ─────────────────────────────────────────────────────────

  // Validar sin puntos
  if (_puntosSeleccionados.length === 0) {
    const justif = el('sin-puntos-justificacion')?.value?.trim()
    if (!justif || justif.length < 15) {
      toast('Sin puntos visitados: debe ingresar una justificación (mínimo 15 caracteres) antes de guardar.', 'err')
      const jEl = el('sin-puntos-justificacion')
      if (jEl) { jEl.style.border = '2px solid var(--rojo)'; jEl.focus(); jEl.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
      else { const bloque = el('bloque-sin-puntos'); if (bloque) { bloque.style.display='block'; bloque.scrollIntoView({ behavior: 'smooth', block: 'center' }) } }
      return
    }
  }

  const svcId = _servicioActual.id
  const btn   = el('btn-guardar-svc')
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...' }

  try {
    setProgreso(10, 'Actualizando estado del servicio...')

    const justifSinPuntos = _puntosSeleccionados.length === 0
      ? (el('sin-puntos-justificacion')?.value?.trim() || null)
      : null

    // C5 + SEC v2.1: Guardar código y folio (ya validados arriba)
    await APP.sb.from('servicios').update({
      codigo_jefe_servicio: codigoResp,
      folio_libro_fisico:   folioLibro,
      estado:               'completado',
      completado_at:        new Date().toISOString(),
      completado_por:       APP.perfil.id,
      observaciones:        justifSinPuntos
        ? `[SIN LABOR] ${justifSinPuntos}`
        : (el('svc-observaciones-generales')?.value?.trim() || null),
    }).eq('id', svcId)

    setProgreso(20, 'Limpiando datos previos...')
    await Promise.all([
      APP.sb.from('visitas_puntos').delete().eq('servicio_id', svcId),
      APP.sb.from('controles_servicio').delete().eq('servicio_id', svcId),
      APP.sb.from('observaciones_intel').delete().eq('servicio_id', svcId),
      APP.sb.from('incautaciones').delete().eq('servicio_id', svcId),
      APP.sb.from('hallazgos_sin_detenido').delete().eq('servicio_id', svcId),
      APP.sb.from('personas_registradas').delete().eq('servicio_id', svcId),
      APP.sb.from('rescates_servicio').delete().eq('servicio_id', svcId),
      APP.sb.from('entrevistas_servicio').delete().eq('servicio_id', svcId),
    ])

    // S1 — Visitas
    setProgreso(30, 'Guardando S1: puntos visitados...')
    const fecha = _servicioActual.fecha
    const turno = detectarTurno(_servicioActual.hora_inicio)
    if (_puntosSeleccionados.length) {
      await APP.sb.from('visitas_puntos').insert(
        _puntosSeleccionados.map(pid => ({
          servicio_id: svcId, punto_id: pid, fecha,
          turno, semana_iso: semanaISO(fecha),
          anio: new Date(fecha+'T12:00:00').getFullYear(),
        }))
      )
    }

    // S2 — Observaciones (C3/C4: coords GMS)
    setProgreso(40, 'Guardando S2: observaciones de inteligencia...')
    const obsItems = qsa('.sub-form[id^="obs-"]')
    for (const obs of obsItems) {
      const nivel   = obs.querySelector('.obs-nivel')?.value
      // C3: leer punto_id del toggle
      const puntoId = obs.querySelector('.obs-punto-id')?.value || obs.querySelector('.obs-punto-sel')?.value || null
      // C4: leer coords GMS
      const coords  = leerCoordsDecimal(obs, 'obs')
      const { data: obsRec } = await APP.sb.from('observaciones_intel').insert({
        servicio_id:      svcId,
        punto_id:         puntoId || null,
        tipo_hallazgo:    obs.querySelector('.obs-tipo')?.value,
        descripcion:      obs.querySelector('.obs-desc')?.value,
        nivel_relevancia: nivel,
        evidencia_foto:   obs.querySelector('.obs-foto')?.checked || false,
        evidencia_gps:    obs.querySelector('.obs-gps')?.checked  || false,
        latitud:          coords.lat,
        longitud:         coords.lon,
      }).select().single()
      if (nivel === 'alto' && obsRec) {
        await APP.sb.from('reportes_inteligencia').insert({
          observacion_id: obsRec.id,
          cuartel_id:     _servicioActual.cuartel_id,
          fecha_generado: fecha,
          estado:         'pendiente',
        })
      }
    }

    // S3 — Controles
    setProgreso(50, 'Guardando S3: controles...')
    await APP.sb.from('controles_servicio').insert({
      servicio_id:              svcId,
      identidad_preventivos:    parseInt(el('ctrl-id-prev')?.value)||0,
      identidad_investigativos: parseInt(el('ctrl-id-inv')?.value)||0,
      migratorios:              parseInt(el('ctrl-migr')?.value)||0,
      vehiculares:              parseInt(el('ctrl-veh')?.value)||0,
      flagrancias:              parseInt(el('ctrl-flag')?.value)||0,
    })

    // S5 — Hallazgos (C3/C4: coords GMS)
    setProgreso(60, 'Guardando S5: hallazgos sin detenido...')
    const valorUF  = window._ufFormActual || await obtenerValorUF(fecha)
    const hallItems = qsa('.sub-form[id^="hall-"]')
    for (const h of hallItems) {
      const clp     = parseFloat(h.querySelector('.hall-clp')?.value)||0
      const puntoId = h.querySelector('.hall-punto-id')?.value || h.querySelector('.hall-punto-sel')?.value || null
      const coords  = leerCoordsDecimal(h, 'hall')
      await APP.sb.from('hallazgos_sin_detenido').insert({
        servicio_id: svcId,
        punto_id:    puntoId || null,
        tipo_bien:   h.querySelector('.hall-tipo')?.value,
        descripcion: h.querySelector('.hall-desc')?.value,
        valor_clp:   clp,
        valor_uf:    clpAUF(clp, valorUF),
        fecha_uf:    fecha,
        latitud:     coords.lat,
        longitud:    coords.lon,
      })
    }

    // S6 — Personas (C1: incautaciones vinculadas, C3/C4: coords GMS)
    setProgreso(72, 'Guardando S6: personas registradas...')
    const persItems = qsa('.sub-form[id^="pers-"]')
    for (const p of persItems) {
      const delito    = p.querySelector('.pers-delito')?.value
      const resultado = p.querySelector('.pers-resultado')?.value
      const esCohecho  = delito === 'cohecho'
      const esInterpol = delito === 'orden_interpol'
      const esNNA      = p.querySelector('.pers-etario')?.value === 'nna'
      const horaEvento = p.querySelector('.pers-hora-evento')?.value || null

      // C3: punto_id del toggle
      const puntoId = p.querySelector('.pers-punto-id')?.value || p.querySelector('.pers-punto-sel')?.value || null
      const punto   = puntoId ? _puntosDelCuartel.find(pt => pt.id === puntoId) : null

      // C4: coords GMS (manual o del punto)
      const coordsP  = leerCoordsDecimal(p, 'pers')
      const latProc   = coordsP.lat  ?? (punto?.latitud  ? parseFloat(punto.latitud)  : null)
      const lonProc   = coordsP.lon  ?? (punto?.longitud ? parseFloat(punto.longitud) : null)

      let clasificacionCaso = 'denuncia'
      if (resultado === 'detencion') clasificacionCaso = 'detenido'
      else if (resultado === 'infraccion_migratoria') {
        const gestion = p.querySelector('.pers-gestion')?.value
        clasificacionCaso = gestion === 'reconducido' ? 'denuncia' : 'infraccion'
      }

      const destinoDoc  = resultado === 'detencion' ? 'parte_fiscalia' : resultado === 'infraccion_migratoria' ? 'oficio_pdi' : 'acta_reconduccion'
      const leyAplicable = LEY_POR_DELITO[delito] || (resultado === 'infraccion_migratoria' ? 'Ley 21.325 (Migración)' : null)

      // C2: modo operandi texto libre
      const modoId    = p.querySelector('.pers-modo-operandi')?.value
      const modoTexto = modoId === '__otro__' ? (p.querySelector('.pers-modo-texto')?.value?.substring(0,40) || null) : null

      const { data: persRec } = await APP.sb.from('personas_registradas').insert({
        servicio_id:              svcId,
        punto_id:                 puntoId || null,
        grupo_etario:             p.querySelector('.pers-etario')?.value,
        sexo:                     p.querySelector('.pers-sexo')?.value,
        nacionalidad:             p.querySelector('.pers-nac')?.value,
        edad:                     parseInt(p.querySelector('.pers-edad-nna')?.value) || null,
        nombres:                  p.querySelector('.pers-nombres')?.value?.trim() || null,
        apellidos:                p.querySelector('.pers-apellidos')?.value?.trim() || null,
        domicilio:                p.querySelector('.pers-domicilio')?.value?.trim() || null,
        como_inicio:              p.querySelector('.pers-inicio')?.value || null,
        tipo_resultado:           resultado,
        tipo_delito:              delito || null,
        ley_aplicable:            leyAplicable,
        situacion_migratoria:     p.querySelector('.pers-sit-mig')?.value || null,
        tipo_ingreso:             p.querySelector('.pers-ing')?.value || null,
        tipo_gestion_migratoria:  p.querySelector('.pers-gestion')?.value || null,
        destino_documento:        destinoDoc,
        nro_documento:            p.querySelector('.pers-nro-doc')?.value || null,
        distancia_lpi_km:         parseFloat(p.querySelector('.pers-dist-lpi')?.value) || null,
        nna_acompanado:           p.querySelector('.pers-acomp')?.value === 'acompanado',
        nna_vinculo_adulto:       p.querySelector('.pers-vinculo-nna')?.value || null,
        nna_derivacion:           p.querySelector('.pers-deriv')?.value || null,
        vinculacion_inst:         p.querySelector('.pers-vinc')?.value || null,
        institucion_extranjera:   p.querySelector('.pers-inst')?.value || null,
        pais_extranjero:          p.querySelector('.pers-pais')?.value || null,
        rango_declarado:          p.querySelector('.pers-rango')?.value || null,
        portaba_identificacion:   p.querySelector('.pers-id-oficial')?.checked || false,
        estaba_uniformado:        p.querySelector('.pers-uniformado')?.checked || false,
        elemento_interes:         p.querySelector('.pers-interes')?.value || null,
        hora_evento:              horaEvento,
        latitud_procedimiento:    latProc,
        longitud_procedimiento:   lonProc,
        modo_operandi_id:         (modoId && modoId !== '__otro__') ? modoId : null,
        modo_operandi_texto:      modoTexto,
        clasificacion_caso:       clasificacionCaso,
        organismo_deteccion:      p.querySelector('.pers-organismo')?.value || null,
        sin_documento:            p.querySelector('.pers-sin-doc')?.checked || false,
        punto_ingreso_id:         resultado === 'infraccion_migratoria' ? (puntoId || null) : null,
        genera_alerta_cohecho:    esCohecho,
        genera_alerta_nna:        esNNA,
        genera_alerta_interpol:   esInterpol,
      }).select().single()

      if (esCohecho)  await APP.sb.from('alertas').insert({ cuartel_id: _servicioActual.cuartel_id, tipo:'cohecho',  detalle:`Cohecho detectado en servicio ${fecha}`,                       servicio_id: svcId })
      if (esNNA)      await APP.sb.from('alertas').insert({ cuartel_id: _servicioActual.cuartel_id, tipo:'nna',     detalle:`NNA en situación irregular detectado - ${fecha}`,              servicio_id: svcId })
      if (esInterpol) await APP.sb.from('alertas').insert({ cuartel_id: _servicioActual.cuartel_id, tipo:'interpol',detalle:`Objetivo internacional capturado - ${fecha}`,                  servicio_id: svcId })

      // C1: Guardar incautaciones vinculadas a esta persona
      if (persRec) {
        const incItems = p.querySelectorAll(`#incaut-lista-${p.id} .sub-form, [id^="inc-"]`)
        // Buscar incautaciones en el bloque de esta persona específica
        const incBloque = el(`incaut-lista-${p.id}`)
        if (incBloque) {
          const incItemsP = incBloque.querySelectorAll('.sub-form')
          for (const inc of incItemsP) {
            const clp = parseFloat(inc.querySelector('.inc-clp')?.value)||0
            await APP.sb.from('incautaciones').insert({
              servicio_id:            svcId,
              persona_id:             persRec.id,
              punto_id:               puntoId || null,
              tipo_especie:           inc.querySelector('.inc-tipo')?.value,
              sustancia_droga:        inc.querySelector('.pers-sustancia')?.value || null,
              modalidad_ocultamiento: inc.querySelector('.pers-ocultamiento')?.value || inc.querySelector('.inc-modal')?.value || null,
              cantidad:               parseFloat(inc.querySelector('.inc-cant')?.value)||0,
              valor_clp:              clp,
              valor_uf:               clpAUF(clp, valorUF),
              fecha_uf:               fecha,
              con_detenido:           true,
            })
          }
        }
      }
    }

    // S7 — Rescates (C6: nueva sección)
    setProgreso(83, 'Guardando S7: rescates...')
    const rescItems = qsa('.sub-form[id^="resc-"]')
    for (const r of rescItems) {
      const puntoId = r.querySelector('.resc-punto-id')?.value || r.querySelector('.resc-punto-sel')?.value || null
      const coords  = leerCoordsDecimal(r, 'resc')
      await APP.sb.from('rescates_servicio').insert({
        servicio_id:        svcId,
        cuartel_id:         _servicioActual.cuartel_id,
        fecha:              fecha,
        tipo_rescate:       r.querySelector('.resc-tipo')?.value,
        cantidad_personas:  parseInt(r.querySelector('.resc-cantidad')?.value)||1,
        descripcion:        r.querySelector('.resc-desc')?.value,
        medios_utilizados:  r.querySelector('.resc-medios')?.value || null,
        personal_cuartel:   r.querySelector('.resc-cuartel')?.checked || false,
        personal_gope:      r.querySelector('.resc-gope')?.checked || false,
        personal_bomberos:  r.querySelector('.resc-bomberos')?.checked || false,
        personal_ffaa:      r.querySelector('.resc-ffaa')?.checked || false,
        personal_socorro:   r.querySelector('.resc-socorro')?.checked || false,
        personal_civiles:   r.querySelector('.resc-civiles')?.checked || false,
        observaciones:      r.querySelector('.resc-obs')?.value || null,
        punto_id:           puntoId || null,
        latitud:            coords.lat,
        longitud:           coords.lon,
      })
    }

    // S8 — Entrevistas (C7: nueva sección)
    setProgreso(92, 'Guardando S8: entrevistas...')
    const entrevItems = qsa('.sub-form[id^="entrev-"]')
    for (const e of entrevItems) {
      await APP.sb.from('entrevistas_servicio').insert({
        servicio_id:           svcId,
        cuartel_id:            _servicioActual.cuartel_id,
        fecha:                 fecha,
        tipo:                  e.querySelector('.entrev-tipo-inst')?.value,
        tipo_entrevistado:     e.querySelector('.entrev-tipo-entrev')?.value || null,
        grado_policia:         e.querySelector('.entrev-grado')?.value || null,
        nombre_policia:        e.querySelector('.entrev-nombre')?.value || null,
        nombre_entrevistado:   e.querySelector('.entrev-nombre')?.value || null,
        hora_inicio:           e.querySelector('.entrev-hora-ini')?.value || null,
        hora_termino:          e.querySelector('.entrev-hora-fin')?.value || null,
        km_recorridos:         parseFloat(e.querySelector('.entrev-km')?.value)||0,
        temas_tratados:        e.querySelector('.entrev-temas')?.value || null,
        informacion_relevante: e.querySelector('.entrev-info')?.value || null,
        punto_id:              e.querySelector('.entrev-punto')?.value || null,
        realizada:             true,
      })
    }

    setProgreso(100, '¡Guardado correctamente!')
    setTimeout(() => {
      toast('Servicio guardado correctamente', 'ok')
      el('modal-servicio').style.display = 'none'
      renderServicios()
    }, 600)

  } catch(e) {
    toast('Error al guardar: ' + e.message, 'err')
    console.error('guardarServicio error:', e)
    const cont = el('guardar-progreso')
    if (cont) cont.style.display = 'none'
    if (btn) { btn.disabled = false; btn.textContent = '✓ Guardar servicio' }
  }
}

// ── Constantes para lógica automática ────────────────────────
const DESTINO_POR_RESULTADO = {
  detencion:             'parte_fiscalia',
  infraccion_migratoria: 'oficio_pdi',
  nna_irregular:         'acta_reconduccion',
}
const CLASIFICACION_POR_RESULTADO = {
  detencion:             'detenido',
  infraccion_migratoria: 'infraccion',
  nna_irregular:         'infraccion',
}
const LEY_POR_DELITO = {
  trafico_drogas:          'Ley 20.000',
  trafico_migrantes:       'Ley 21.325 (Migración)',
  trata_personas:          'Ley 20.507',
  contrabando:             'Ordenanza de Aduanas',
  ley_17798_armas:         'Ley 17.798 (Control Armas)',
  abigeato:                'Código Penal Art. 448',
  falsificacion_documentos:'Código Penal Art. 193',
  receptacion:             'Código Penal Art. 456 bis A',
  lavado_activos:          'Ley 19.913',
  cohecho:                 'Código Penal Art. 248',
  orden_judicial:          'Código Procesal Penal',
  orden_interpol:          'Interpol / CPP Art. 127',
  transito:                'Ley 18.290 (Tránsito)',
  infraccion_migratoria:   'Ley 21.325 (Migración)',
  otro:                    'Código Penal',
}
