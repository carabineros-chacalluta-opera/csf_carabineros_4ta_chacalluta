// ============================================================
// SISTEMA CSF OPERATIVA — servicios.js  v1.1
// CORRECCIONES:
//   B4  — toggleSeccion() usa mapa de IDs explícito (no substring)
//   B6  — upsert de Excel con UNIQUE constraint correcto
//   B9  — calcUF() usa caché de APP._ufCache + debounce
//   B10 — parseo de fecha Excel sin desfase de zona horaria
//   M2  — guardarServicio() valida al menos 1 punto en S1
//   M4  — advertencia al reabrir servicio ya completado
//   M5  — indicador de progreso al guardar (pasos visibles)
//   FIX — APP.cuartel.id → APP.cuartelActivo()?.id (admin global)
// ============================================================

let _servicioActual      = null
let _puntosDelCuartel    = []
let _puntosSeleccionados = []
let _calcUFTimer         = null   // B9: debounce timer

// ── MAPA de IDs de botones toggle (B4) ───────────────────────
const TOGGLE_BTN_IDS = {
  incautaciones: 'incaut',
  hallazgos:     'hall',
  personas:      'pers',
}

// ── LISTA DE SERVICIOS ───────────────────────────────────────
async function renderServicios() {
  showLoader('pantalla-servicios', 'Cargando servicios...')

  const hoy      = hoyISO()
  const anio     = new Date().getFullYear()
  const ini      = `${anio}-01-01`

  const cuartelActivo  = APP.cuartelActivo()
  const puedeVerTodos  = APP.esAdministrador() || APP.esComisario()

  el('pantalla-servicios').innerHTML = `
    <div class="container">
      <div class="flex-sb" style="margin-bottom:1rem">
        <div>
          <h2 class="page-titulo">Servicios</h2>
        </div>
        ${APP.esAdministrador() ? `
        <button class="btn btn-primario" onclick="abrirCargaExcel()">
          ↑ Cargar Excel
        </button>` : ''}
      </div>

      <!-- Filtros -->
      <div class="card filtros-card" style="margin-bottom:1rem">
        <div class="g3">
          <div class="campo">
            <label>Desde</label>
            <input type="date" id="svc-desde" value="${ini}"/>
          </div>
          <div class="campo">
            <label>Hasta</label>
            <input type="date" id="svc-hasta" value="${hoy}"/>
          </div>
          <div class="campo">
            <label>Estado</label>
            <select id="svc-estado">
              <option value="todos">Todos</option>
              <option value="pendiente">Pendientes</option>
              <option value="completado">Completados</option>
            </select>
          </div>
          ${puedeVerTodos ? `
          <div class="campo">
            <label>Cuartel</label>
            <select id="svc-cuartel">
              <option value="">— Todos los cuarteles —</option>
              ${(APP.todosCuarteles || []).map(c =>
                `<option value="${c.id}" ${c.id === cuartelActivo?.id ? 'selected' : ''}>
                  ${c.nombre.replace(' (F)','')}
                </option>`
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
            <div style="font-size:.76rem;font-weight:700;color:var(--verde-osc,#155C38);margin-bottom:.4rem;text-transform:uppercase;letter-spacing:.05em">
              Paso 1 — Descargar plantilla
            </div>
            <p style="font-size:.8rem;color:var(--muted,#5A6B62);margin-bottom:.65rem;line-height:1.5">
              Descarga la plantilla con el formato correcto. Completa los datos y luego súbela en el paso 2.
            </p>
            <button class="btn btn-secundario btn-sm" onclick="descargarPlantillaExcel()">
              ↓ Descargar plantilla .xlsx
            </button>
          </div>
          <div style="background:var(--surface-2,#F8FAF9);border:1px solid var(--border-light,#DDE8E2);border-radius:var(--r,8px);padding:.9rem 1rem;margin-bottom:1rem">
            <div style="font-size:.76rem;font-weight:700;color:var(--muted,#5A6B62);margin-bottom:.4rem;text-transform:uppercase;letter-spacing:.05em">
              Paso 2 — Subir archivo completado
            </div>
            <input type="file" id="input-excel" accept=".xlsx,.xls" class="input-file" style="margin-bottom:.4rem"/>
            <p style="font-size:.72rem;color:var(--muted-light,#8A9E94);line-height:1.4">
              Solo se importarán filas con tipos de servicio reconocidos por el sistema.
            </p>
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
    </div>`

  // Cargar automáticamente al entrar
  await consultarServicios()
}

async function consultarServicios() {
  const desde   = el('svc-desde')?.value
  const hasta   = el('svc-hasta')?.value
  const estado  = el('svc-estado')?.value || 'todos'
  const zona    = el('servicios-lista')
  if (!zona) return

  // Cuartel: leer del selector de servicios si existe, si no usar el activo global
  const svcCuartelId = el('svc-cuartel')?.value || APP.cuartelActivo()?.id
  const cuartelId    = svcCuartelId || null

  // Digitador sin cuartel asignado
  if (!cuartelId && APP.esDigitador()) {
    zona.innerHTML = '<div class="card" style="text-align:center;padding:2rem;color:var(--muted)">Sin cuartel asignado</div>'
    return
  }

  showLoader('servicios-lista', 'Consultando servicios...')

  let query = APP.sb
    .from('servicios')
    .select('*')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
    .limit(500)

  if (cuartelId)             query = query.eq('cuartel_id', cuartelId)
  if (estado !== 'todos')    query = query.eq('estado', estado)

  const { data: servicios, error } = await query

  if (error) {
    zona.innerHTML = `<div class="card" style="color:var(--rojo);padding:1rem">Error al consultar: ${error.message}</div>`
    return
  }

  if (!servicios?.length) {
    zona.innerHTML = '<div class="card" style="text-align:center;padding:2rem;color:var(--muted)">Sin servicios en el período seleccionado</div>'
    return
  }

  const pendientes  = servicios.filter(s => s.estado === 'pendiente')
  const completados = servicios.filter(s => s.estado === 'completado')

  // Construir nombre del cuartel seleccionado para mostrar en subtítulo
  let cuartelNombre = 'Todos los cuarteles'
  if (cuartelId) {
    const c = (APP.todosCuarteles||[]).find(c => c.id === cuartelId) || APP.cuartelActivo()
    cuartelNombre = c?.nombre || cuartelNombre
  }

  zona.innerHTML = `
    <!-- Pendientes urgentes -->
    ${pendientes.filter(s => {
      const dias = Math.ceil((new Date() - new Date(s.fecha+'T12:00:00'))/86400000)
      return dias > 2
    }).length > 0 ? `
    <div class="alertas-panel" style="margin-bottom:1rem">
      <div class="alertas-titulo">🔴 Servicios con más de 48 hrs pendientes</div>
      ${pendientes.filter(s => {
        const dias = Math.ceil((new Date() - new Date(s.fecha+'T12:00:00'))/86400000)
        return dias > 2
      }).map(s => `
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
      <div class="tabla-servicios">
        ${servicios.map(s => filaServicio(s)).join('')}
      </div>
    </div>`
}

function filaServicio(s) {
  const dias    = Math.ceil((new Date() - new Date(s.fecha+'T12:00:00'))/86400000)
  const urgente = s.estado === 'pendiente' && dias > 2
  return `
    <div class="fila-servicio fila-${s.estado} ${urgente?'fila-urgente':''}"
         onclick="abrirFormServicio('${s.id}')">
      <div class="fila-fecha">${formatFecha(s.fecha)}</div>
      <div class="fila-tipo">${s.tipo_servicio?.trim()?.substring(0,45)||'—'}</div>
      <div class="fila-horario">${s.hora_inicio||'—'} – ${s.hora_termino||'—'}</div>
      <div class="fila-estado">
        <span class="badge badge-${s.estado}">${s.estado === 'pendiente' ? 'Pendiente' : 'Completado'}</span>
      </div>
      ${s.estado === 'pendiente'
        ? `<button class="btn btn-sm btn-completar" onclick="event.stopPropagation();abrirFormServicio('${s.id}')">Completar →</button>`
        : '<span class="fila-check">✓</span>'}
    </div>`
}

// ── CARGA EXCEL ──────────────────────────────────────────────
function abrirCargaExcel() {
  el('modal-excel').style.display = 'flex'
}

function descargarPlantillaExcel() {
  const TIPOS = CSF_CONFIG.SERVICIOS_CSF
  const headers = ["FECHA","TIPO DE SERVICIO","HORARIO (HH:MM-HH:MM)","CANTIDAD FUNCIONARIOS","CANTIDAD VEHÍCULOS"]
  const hoy   = new Date()
  const fecha = `${hoy.getDate().toString().padStart(2,"0")}/${(hoy.getMonth()+1).toString().padStart(2,"0")}/${hoy.getFullYear()}`
  const ejemplos = TIPOS.map(tipo => [fecha, tipo, "08:00-16:00", 2, 1])
  const instrucciones = [
    ["INSTRUCCIONES — PLANTILLA CSF OPERATIVA"],
    [""],
    ["COLUMNA","DESCRIPCIÓN","FORMATO","EJEMPLO"],
    ["FECHA","Fecha del servicio","DD/MM/AAAA",fecha],
    ["TIPO DE SERVICIO","Debe ser exactamente uno de los tipos válidos (ver abajo)","Texto",TIPOS[0]],
    ["HORARIO","Hora inicio y término separados por guión","HH:MM-HH:MM","08:00-16:00"],
    ["CANTIDAD FUNCIONARIOS","Número entero","Número","2"],
    ["CANTIDAD VEHÍCULOS","Número entero","Número","1"],
    [""],
    ["TIPOS DE SERVICIO VÁLIDOS:"],
    ...TIPOS.map(t => ["",t]),
    [""],
    ["NOTAS:"],
    ["","• La primera fila (encabezado) no se importa."],
    ["","• Si un servicio ya existe (misma fecha + tipo + hora), se actualiza sin duplicar."],
    ["","• Los servicios importados quedan en estado PENDIENTE."],
  ]
  const wb = XLSX.utils.book_new()
  const wsData = [headers, ...ejemplos]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws["!cols"] = [{wch:14},{wch:46},{wch:22},{wch:22},{wch:18}]
  XLSX.utils.book_append_sheet(wb, ws, "Plantilla")
  const wsInst = XLSX.utils.aoa_to_sheet(instrucciones)
  wsInst["!cols"] = [{wch:28},{wch:55},{wch:20},{wch:20}]
  XLSX.utils.book_append_sheet(wb, wsInst, "Instrucciones")
  const mes  = String(hoy.getMonth()+1).padStart(2,"0")
  const anio = hoy.getFullYear()
  XLSX.writeFile(wb, `Plantilla_Servicios_CSF_${anio}${mes}.xlsx`)
  toast("Plantilla descargada correctamente", "ok")
}

async function procesarExcel() {
  const input = el('input-excel')
  const res   = el('excel-resultado')
  if (!input?.files?.[0]) { res.textContent = 'Selecciona un archivo'; return }

  res.textContent = 'Procesando...'
  const file   = input.files[0]
  const buffer = await file.arrayBuffer()
  // B10: NO usar cellDates:true para evitar desfase UTC; leer como raw y parsear manualmente
  const wb   = XLSX.read(buffer, { type: 'array', raw: false, dateNF: 'yyyy-mm-dd' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' })

  const SERVICIOS_RELEVANTES = CSF_CONFIG.SERVICIOS_CSF
  let importados = 0; let ignorados = 0; let duplicados = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[0] || !row[1]) continue
    const tipo       = String(row[1]).trim()
    const esRelevante = SERVICIOS_RELEVANTES.some(sr => tipo.includes(sr))
    if (!esRelevante) { ignorados++; continue }

    // B10: parseo de fecha robusto — SheetJS entrega 'YYYY-MM-DD' con dateNF
    let fecha = null
    try {
      const rawFecha = String(row[0]).trim()
      // Intentar formato YYYY-MM-DD directo
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawFecha)) {
        fecha = rawFecha
      } else {
        // Fallback: parsear el serial de Excel o string de fecha
        const d = new Date(rawFecha)
        if (isNaN(d.getTime())) { ignorados++; continue }
        // Extraer fecha local (no UTC) para evitar desfase
        const y = d.getFullYear()
        const m = String(d.getMonth()+1).padStart(2,'0')
        const day = String(d.getDate()).padStart(2,'0')
        fecha = `${y}-${m}-${day}`
      }
    } catch { ignorados++; continue }

    const horario = String(row[2]||'').replace(/[()]/g,'').trim()
    const [hIni, hFin] = horario.split('-').map(h => h?.trim())
    const turno = detectarTurno(hIni)

    // B6: el upsert funciona con el UNIQUE constraint agregado en schema
    const { error } = await APP.sb.from('servicios').upsert({
      cuartel_id:            APP.cuartelActivo()?.id,
      fecha,
      tipo_servicio:         tipo,
      hora_inicio:           hIni || null,
      hora_termino:          hFin || null,
      turno,
      cantidad_funcionarios: parseInt(row[3])||0,
      cantidad_vehiculos:    parseInt(row[4])||0,
      estado:                'pendiente',
    }, { onConflict: 'cuartel_id,fecha,tipo_servicio,hora_inicio' })

    if (!error) importados++
    else if (error.code === '23505') duplicados++  // B6: capturar duplicados
    else ignorados++
  }

  res.innerHTML = `
    <span style="color:var(--verde)">✅ ${importados} importados</span>
    ${duplicados > 0 ? `· <span style="color:var(--amarillo)">${duplicados} ya existían (actualizados)</span>` : ''}
    ${ignorados  > 0 ? `· <span style="color:var(--muted)">${ignorados} ignorados</span>` : ''}`

  setTimeout(() => {
    el('modal-excel').style.display = 'none'
    renderServicios()
  }, 2500)
}

// ── FORMULARIO COMPLETAR SERVICIO ────────────────────────────
async function abrirFormServicio(servicioId) {
  if (APP.esComisario()) return

  // FIX: admin global necesita tener un cuartel activo seleccionado en el topbar
  const cuartelActivo = APP.cuartelActivo()
  if (!cuartelActivo) {
    toast('Selecciona un cuartel en el selector antes de abrir un servicio', 'err')
    return
  }

  showLoader('form-servicio-contenido', 'Cargando servicio...')
  el('modal-servicio').style.display = 'flex'

  const { data: svc }    = await APP.sb.from('servicios').select('*').eq('id', servicioId).single()
  const { data: puntos } = await APP.sb.from('puntos_territoriales')
    .select('*').eq('cuartel_id', APP.cuartelActivo()?.id).eq('activo', true).order('tipo').order('nombre')

  _servicioActual      = svc
  _puntosDelCuartel    = puntos || []
  _puntosSeleccionados = []

  const [{ data: visitasExist }, { data: controlesExist }] = await Promise.all([
    APP.sb.from('visitas_puntos').select('*').eq('servicio_id', servicioId),
    APP.sb.from('controles_servicio').select('*').eq('servicio_id', servicioId).single(),
  ])

  if (visitasExist) _puntosSeleccionados = visitasExist.map(v => v.punto_id)

  // M4: advertir si el servicio ya estaba completado
  const yaCompletado = svc.estado === 'completado'

  el('form-servicio-contenido').innerHTML = htmlFormServicio(svc, puntos, controlesExist, visitasExist, yaCompletado)

  // B9: cargar UF al abrir el form (no en cada keystroke)
  obtenerValorUF(svc.fecha).then(uf => {
    window._ufFormActual = uf
  })
}

function htmlFormServicio(svc, puntos, controles, visitas, yaCompletado) {
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

    <!-- PASO 0: Responsable -->
    <div class="form-seccion">
      <div class="form-seccion-titulo">Responsable del servicio</div>
      <div class="campo-inline">
        <label>Código funcionario</label>
        <input id="codigo-resp" type="text" placeholder="Ej: 42891" maxlength="10"
               value="${svc.codigo_jefe_servicio||''}"
               style="width:140px"
               onblur="validarCodigo(this.value)"/>
        <span id="codigo-estado" style="font-size:.75rem"></span>
      </div>
    </div>

    <!-- S1: Puntos visitados -->
    <div class="form-seccion">
      <div class="form-seccion-titulo">S1 — Puntos visitados en este servicio <span style="color:var(--rojo);font-size:.7rem">* mínimo 1</span></div>
      <div class="puntos-grupo">
        <div class="puntos-grupo-header" onclick="toggleGrupo('hitos')">
          ▼ Hitos Fronterizos <span class="puntos-count" id="count-hitos">0 de ${hitos.length}</span>
        </div>
        <div id="grupo-hitos" class="puntos-lista">
          ${hitos.map(p => checkPunto(p, visitas)).join('')}
        </div>
      </div>
      <div class="puntos-grupo">
        <div class="puntos-grupo-header" onclick="toggleGrupo('pnh')">
          ▼ Pasos No Habilitados <span class="puntos-count" id="count-pnh">0 de ${pnhs.length}</span>
        </div>
        <div id="grupo-pnh" class="puntos-lista">
          ${pnhs.map(p => checkPunto(p, visitas)).join('')}
        </div>
      </div>
      <div class="puntos-grupo">
        <div class="puntos-grupo-header" onclick="toggleGrupo('sie')">
          ▼ Sitios de Interés Estratégico <span class="puntos-count" id="count-sie">0 de ${sies.length}</span>
        </div>
        <div id="grupo-sie" class="puntos-lista">
          ${sies.map(p => checkPunto(p, visitas)).join('')}
        </div>
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

    <!-- S4 -->
    <div class="form-seccion">
      <div class="form-seccion-titulo">S4 — ¿Hubo incautaciones?</div>
      <div class="toggle-result">
        <button class="btn-toggle" id="btn-incaut-si" onclick="toggleSeccion('incautaciones', true)">Sí</button>
        <button class="btn-toggle btn-toggle-active" id="btn-incaut-no" onclick="toggleSeccion('incautaciones', false)">No</button>
      </div>
      <div id="seccion-incautaciones" style="display:none">
        <div id="incaut-lista"></div>
        <button class="btn btn-agregar" onclick="agregarIncautacion()">+ Agregar incautación</button>
      </div>
    </div>

    <!-- S5 -->
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

    <!-- S6 -->
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

    <!-- Progress bar (M5) -->
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

function checkPunto(p, visitasExist) {
  const checked = visitasExist?.some(v => v.punto_id === p.id) || false
  return `
    <label class="check-punto ${checked?'checked':''}">
      <input type="checkbox" value="${p.id}" ${checked?'checked':''}
             onchange="togglePunto('${p.id}', '${p.tipo}', this.checked)"/>
      <span class="check-nombre">${p.nombre}</span>
      <span class="check-fvc">${CSF_CONFIG.FVC_LABELS[p.fvc_base]||p.fvc_base}</span>
    </label>`
}

function campoNumero(id, label, val) {
  return `
    <div class="campo-num">
      <label>${label}</label>
      <input id="${id}" type="number" value="${val}" min="0" class="input-num"/>
    </div>`
}

function toggleGrupo(tipo) {
  const eg = el(`grupo-${tipo}`)
  if (eg) eg.style.display = eg.style.display === 'none' ? 'block' : 'none'
}

function togglePunto(puntoId, tipo, checked) {
  if (checked) {
    if (!_puntosSeleccionados.includes(puntoId)) _puntosSeleccionados.push(puntoId)
  } else {
    _puntosSeleccionados = _puntosSeleccionados.filter(id => id !== puntoId)
  }
  const tipo_count = _puntosSeleccionados.filter(id => {
    const p = _puntosDelCuartel.find(p => p.id === id)
    return p?.tipo === tipo
  }).length
  const total    = _puntosDelCuartel.filter(p => p.tipo === tipo).length
  const labelKey = tipo === 'hito' ? 'hitos' : tipo
  const countEl  = el(`count-${labelKey}`)
  if (countEl) countEl.textContent = `${tipo_count} de ${total}`

  const res = el('puntos-sel-resumen')
  if (res) res.textContent = _puntosSeleccionados.length
    ? `✅ Seleccionados: ${_puntosSeleccionados.map(id => _puntosDelCuartel.find(p=>p.id===id)?.nombre||id).join(' · ')}`
    : 'Ningún punto seleccionado'
}

// B4: FIX — usar mapa de IDs explícito en lugar de substring(0,5)
function toggleSeccion(nombre, mostrar) {
  const sec    = el(`seccion-${nombre}`)
  if (sec) sec.style.display = mostrar ? 'block' : 'none'
  const prefix = TOGGLE_BTN_IDS[nombre] || nombre.substring(0, 5)
  el(`btn-${prefix}-si`)?.classList.toggle('btn-toggle-active', mostrar)
  el(`btn-${prefix}-no`)?.classList.toggle('btn-toggle-active', !mostrar)
}

async function validarCodigo(codigo) {
  const est = el('codigo-estado')
  if (!codigo || !est) return
  const { data } = await APP.sb.from('personal_cuartel')
    .select('id').eq('codigo_funcionario', codigo)
    .eq('cuartel_id', APP.cuartelActivo()?.id).eq('activo', true).single()
  est.textContent = data ? '✅ Código válido' : '⚠️ Código no reconocido'
  est.style.color = data ? 'var(--verde)' : 'var(--amarillo)'
}

function listaPuntosSelect() {
  if (!_puntosSeleccionados.length) return '<option value="">— No asociado —</option>'
  return `<option value="">— No asociado —</option>` +
    _puntosSeleccionados.map(id => {
      const p = _puntosDelCuartel.find(p => p.id === id)
      return `<option value="${id}">${p?.nombre||id}</option>`
    }).join('')
}

function agregarObservacion() {
  const id  = 'obs-' + Date.now()
  const div = document.createElement('div')
  div.id = id; div.className = 'sub-form'
  div.innerHTML = `
    <div class="sub-form-header">
      Observación
      <button onclick="el('${id}').remove()" class="btn-sm-red">✕</button>
    </div>
    <div class="g2">
      <div class="campo">
        <label>Punto asociado</label>
        <select class="obs-punto"><option value="">— Sin punto específico —</option>${_puntosSeleccionados.map(id=>{const p=_puntosDelCuartel.find(p=>p.id===id);return`<option value="${id}">${p?.nombre||id}</option>`}).join('')}</select>
      </div>
      <div class="campo">
        <label>Tipo de hallazgo</label>
        <select class="obs-tipo">
          <option value="huellas_peatonales">Huellas peatonales</option>
          <option value="huellas_vehiculares">Huellas vehiculares</option>
          <option value="residuos_recientes">Residuos recientes</option>
          <option value="campamento">Campamento</option>
          <option value="vehiculo_abandonado">Vehículo abandonado</option>
          <option value="senalizacion_ilicita">Señalización ilícita</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div class="campo">
        <label>Nivel relevancia</label>
        <select class="obs-nivel">
          <option value="alto">Alto</option>
          <option value="medio" selected>Medio</option>
          <option value="bajo">Bajo</option>
        </select>
      </div>
    </div>
    <div class="campo">
      <label>Descripción</label>
      <textarea class="obs-desc" rows="2" placeholder="Descripción del hallazgo..."></textarea>
    </div>
    <div style="display:flex;gap:1rem;font-size:.8rem">
      <label><input type="checkbox" class="obs-foto"/> Registro fotográfico</label>
      <label><input type="checkbox" class="obs-gps"/> Registro GPS</label>
    </div>`
  el('obs-lista').appendChild(div)
}

function agregarIncautacion() {
  const id  = 'inc-' + Date.now()
  const div = document.createElement('div')
  div.id = id; div.className = 'sub-form'
  div.innerHTML = `
    <div class="sub-form-header">Incautación <button onclick="el('${id}').remove()" class="btn-sm-red">✕</button></div>
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
      <div class="campo"><label>Valor $CLP</label>
        <input type="number" class="inc-clp" min="0" placeholder="0" oninput="calcUFDebounce(this)"/>
      </div>
      <div class="campo"><label>UF (calculado)</label><input type="text" class="inc-uf" readonly placeholder="—"/></div>
    </div>
    <div id="extra-${id}"></div>
    <div class="campo"><label>Punto asociado</label><select class="inc-punto">${listaPuntosSelect()}</select></div>`
  el('incaut-lista').appendChild(div)
}

// B9: calcUF con debounce y caché global — NO llama API en cada tecla
function calcUFDebounce(input) {
  const row  = input.closest('.g2')
  const ufEl = row?.querySelector('.inc-uf')
  if (!ufEl) return
  clearTimeout(_calcUFTimer)
  _calcUFTimer = setTimeout(() => {
    const clp = parseFloat(input.value) || 0
    if (clp === 0) { ufEl.value = '—'; return }
    const uf  = window._ufFormActual || 37000
    ufEl.value = (clp / uf).toFixed(4)
  }, 400)
}

function onTipoEspecieChange(sel, id) {
  const extra = el(`extra-${id}`)
  if (!extra) return
  if (sel.value === 'droga') {
    extra.innerHTML = `
      <div class="g2">
        <div class="campo"><label>Sustancia</label>
          <select class="inc-sustancia">
            <option value="marihuana">Marihuana</option><option value="cocaina">Cocaína</option>
            <option value="pasta_base">Pasta base</option><option value="heroina">Heroína</option>
            <option value="sinteticas">Sintéticas</option><option value="otra">Otra</option>
          </select>
        </div>
        <div class="campo"><label>Modalidad ocultamiento</label>
          <select class="inc-ocultamiento">
            <option value="impregnacion_ropa">Impregnación ropa/textiles</option>
            <option value="impregnacion_vehiculo">Impregnación vehículo</option>
            <option value="corporal">Ocultamiento corporal</option>
            <option value="compartimento">Compartimento oculto vehículo</option>
            <option value="encomienda">Encomienda/bulto postal</option>
            <option value="caleta">Caleta en inmueble/terreno</option>
            <option value="mezclado">Mezclado con mercadería lícita</option>
            <option value="otro">Otro</option>
          </select>
        </div>
      </div>`
  } else if (sel.value === 'dinero') {
    extra.innerHTML = `
      <div class="campo"><label>Moneda</label>
        <select class="inc-moneda">
          <option value="CLP">Pesos chilenos (CLP)</option>
          <option value="USD">Dólares (USD)</option>
          <option value="PEN">Soles (PEN)</option>
          <option value="BOB">Bolivianos (BOB)</option>
          <option value="otra">Otra</option>
        </select>
      </div>`
  } else {
    extra.innerHTML = ''
  }
}

function agregarHallazgo() {
  const id  = 'hall-' + Date.now()
  const div = document.createElement('div')
  div.id = id; div.className = 'sub-form'
  div.innerHTML = `
    <div class="sub-form-header">Hallazgo sin detenido <button onclick="el('${id}').remove()" class="btn-sm-red">✕</button></div>
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
    <div class="campo"><label>Punto asociado</label><select class="hall-punto">${listaPuntosSelect()}</select></div>`
  el('hall-lista').appendChild(div)
}

function agregarPersona() {
  const id  = 'pers-' + Date.now()
  const div = document.createElement('div')
  div.id = id; div.className = 'sub-form'
  div.innerHTML = `
    <div class="sub-form-header">Persona con resultado <button onclick="el('${id}').remove()" class="btn-sm-red">✕</button></div>
    <div class="g2">
      <div class="campo"><label>Grupo etario</label>
        <select class="pers-etario" onchange="onEtarioChange(this,'${id}')">
          <option value="adulto">Adulto (18+)</option>
          <option value="nna">NNA (menor de 18)</option>
        </select>
      </div>
      <div class="campo"><label>Sexo</label>
        <select class="pers-sexo">
          <option value="masculino">Masculino</option>
          <option value="femenino">Femenino</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div class="campo"><label>Nacionalidad</label>
        <select class="pers-nac">
          <option value="Chile">Chile</option><option value="Perú">Perú</option>
          <option value="Bolivia">Bolivia</option><option value="Venezuela">Venezuela</option>
          <option value="Colombia">Colombia</option><option value="Ecuador">Ecuador</option>
          <option value="Haití">Haití</option><option value="Cuba">Cuba</option>
          <option value="Argentina">Argentina</option><option value="otra">Otra</option>
        </select>
      </div>
    </div>
    <div class="campo"><label>¿Cómo se inició?</label>
      <select class="pers-inicio">
        <option value="control_identidad_preventivo">Control de identidad preventivo</option>
        <option value="control_identidad_investigativo">Control de identidad investigativo</option>
        <option value="control_migratorio">Control migratorio</option>
        <option value="control_vehicular">Control vehicular</option>
        <option value="patrullaje_flagrancia">Patrullaje / flagrancia en terreno</option>
      </select>
    </div>
    <div class="campo"><label>Resultado</label>
      <select class="pers-resultado" onchange="onResultadoChange(this,'${id}')">
        <option value="detencion">Detención por delito</option>
        <option value="infraccion_migratoria">Infracción migratoria</option>
        <option value="nna_irregular">NNA en situación irregular</option>
      </select>
    </div>
    <div id="detalle-${id}"></div>
    <div class="campo"><label>Punto asociado</label><select class="pers-punto">${listaPuntosSelect()}</select></div>
    <div id="bloque-ffaa-${id}">
      <div class="campo-check">
        <label><input type="checkbox" onchange="toggleFFAA('${id}',this.checked)"/> ¿Tiene o tuvo vinculación con FFAA/Policía extranjera?</label>
      </div>
      <div id="ffaa-${id}" style="display:none">
        <div class="g2">
          <div class="campo"><label>Condición</label>
            <select class="pers-vinc"><option value="activo">Miembro activo</option><option value="exmiembro">Ex miembro (retirado)</option></select>
          </div>
          <div class="campo"><label>Institución</label>
            <select class="pers-inst"><option value="FFAA">FFAA</option><option value="Policía">Policía</option><option value="Otra">Otra</option></select>
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
  onResultadoChange(div.querySelector('.pers-resultado'), id)
}

function onEtarioChange(sel, id) {
  if (sel.value === 'nna') {
    const res = el(id)?.querySelector('.pers-resultado')
    if (res) { res.value = 'nna_irregular'; onResultadoChange(res, id) }
  }
}

function onResultadoChange(sel, id) {
  const det = el(`detalle-${id}`)
  if (!det) return
  if (sel.value === 'detencion') {
    det.innerHTML = `
      <div class="campo"><label>Tipo de delito</label>
        <select class="pers-delito" onchange="onDelitoChange(this,'${id}')">
          <optgroup label="Delitos COT → Fiscalía">
            <option value="trafico_drogas">Tráfico de drogas (Ley 20.000)</option>
            <option value="trafico_migrantes">Tráfico ilícito de migrantes</option>
            <option value="trata_personas">Trata de personas</option>
            <option value="contrabando">Contrabando de mercadería</option>
            <option value="ley_17798_armas">Ley 17.798 — Control de Armas</option>
            <option value="abigeato">Abigeato</option>
            <option value="falsificacion_documentos">Falsificación de documentos</option>
            <option value="receptacion">Receptación</option>
            <option value="lavado_activos">Lavado de activos</option>
            <option value="cohecho">Cohecho ⚨</option>
          </optgroup>
          <optgroup label="Órdenes pendientes → Fiscalía">
            <option value="orden_judicial">Orden judicial nacional</option>
            <option value="orden_interpol">Orden internacional / Interpol</option>
          </optgroup>
          <optgroup label="Otros → Fiscalía">
            <option value="transito">Infracción Ley de Tránsito</option>
            <option value="otro">Otro</option>
          </optgroup>
        </select>
      </div>
      <div id="subtipo-${id}"></div>
      <div class="campo"><label>N° Parte policial</label><input type="text" class="pers-nro-doc" placeholder="N° parte..."/></div>`
  } else if (sel.value === 'infraccion_migratoria') {
    det.innerHTML = `
      <div class="g2">
        <div class="campo"><label>Situación migratoria</label>
          <select class="pers-sit-mig">
            <option value="irregular">Irregular</option><option value="regular">Regular</option>
            <option value="en_tramite">En trámite</option><option value="sin_documentos">Sin documentos</option>
          </select>
        </div>
        <div class="campo"><label>Tipo de ingreso</label>
          <select class="pers-ing">
            <option value="paso_no_habilitado">Paso no habilitado</option>
            <option value="paso_habilitado">Paso habilitado</option>
            <option value="desconocido">Desconocido</option>
          </select>
        </div>
        <div class="campo"><label>Gestión</label>
          <select class="pers-gestion" onchange="onGestionChange(this,'${id}')">
            <option value="reconducido">Reconducido (≤10 km LPI)</option>
            <option value="denunciado_extranjeria">Denunciado — Ley Extranjería → Oficio PDI</option>
            <option value="detenido_trafico">Detenido — Tráfico migrantes → Fiscalía</option>
            <option value="detenido_trata">Detenido — Trata personas → Fiscalía</option>
          </select>
        </div>
      </div>
      <div id="gestion-extra-${id}"></div>`
    onGestionChange(det.querySelector('.pers-gestion'), id)
  } else {
    det.innerHTML = `
      <div style="background:var(--amarillo-cl);border:1.5px solid var(--amarillo);border-radius:8px;padding:.75rem;margin-bottom:.75rem;font-size:.82rem;font-weight:600;">
        ⚠️ ALERTA AUTOMÁTICA — Se notificará al Comisario
      </div>
      <div class="g2">
        <div class="campo"><label>Edad</label><input type="number" class="pers-edad-nna" min="0" max="17" placeholder="años"/></div>
        <div class="campo"><label>¿Acompañado?</label>
          <select class="pers-acomp" onchange="onAcompChange(this,'${id}')">
            <option value="solo">Solo / sin adulto responsable</option>
            <option value="acompanado">Acompañado por adulto</option>
          </select>
        </div>
        <div class="campo"><label>Derivación</label>
          <select class="pers-deriv">
            <option value="sename">Red SENAME</option>
            <option value="consulado">Consulado país de origen</option>
            <option value="otro">Otro organismo</option>
          </select>
        </div>
      </div>
      <div id="adulto-${id}"></div>
      <div class="campo"><label>N° documento</label><input type="text" class="pers-nro-doc" placeholder="N° parte o documento..."/></div>`
  }
}

function onDelitoChange(sel, id) {
  const sub = el(`subtipo-${id}`)
  if (!sub) return
  if (sel.value === 'trafico_drogas') {
    sub.innerHTML = `<div class="g2">
      <div class="campo"><label>Sustancia</label>
        <select class="pers-sustancia">
          <option>Marihuana</option><option>Cocaína</option><option>Pasta base</option>
          <option>Heroína</option><option>Sintéticas</option><option>Otra</option>
        </select>
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
        <option value="dinero">Dinero en efectivo</option><option value="ropa">Ropa/textiles</option>
        <option value="juguetes">Juguetes</option><option value="vehiculos">Vehículos</option>
        <option value="otro">Otro</option>
      </select></div></div>`
  } else if (sel.value === 'ley_17798_armas') {
    sub.innerHTML = `<div class="campo"><label>Subtipo Ley 17.798</label>
      <select class="pers-sub-armas">
        <option value="porte_ilegal">Porte ilegal</option><option value="tenencia">Tenencia ilegal</option>
        <option value="trafico">Tráfico de armas</option><option value="explosivos">Explosivos</option>
      </select></div>`
  } else {
    sub.innerHTML = ''
  }
}

function onGestionChange(sel, id) {
  const extra = el(`gestion-extra-${id}`)
  if (!extra) return
  if (sel.value === 'reconducido') {
    extra.innerHTML = `<div class="g2">
      <div class="campo"><label>Distancia al LPI (km)</label><input type="number" class="pers-dist-lpi" min="0" max="10" placeholder="km" step="0.1"/></div>
      <div class="campo"><label>N° Acta de Reconducción</label><input type="text" class="pers-nro-doc" placeholder="N° acta..."/></div>
    </div>
    <div style="background:var(--verde-cl);border-radius:6px;padding:.5rem .75rem;font-size:.75rem;color:var(--verde)">
      ✓ No genera parte ni oficio — Expulsión inmediata en frontera
    </div>`
  } else if (sel.value === 'denunciado_extranjeria') {
    extra.innerHTML = `
      <div style="background:var(--azul-cl);border-radius:6px;padding:.5rem .75rem;font-size:.75rem;color:var(--azul);margin-bottom:.5rem">
        📋 Genera Oficio a PDI — NO va a Fiscalía
      </div>
      <div class="g2">
        <div class="campo"><label>Tipo infracción</label>
          <select class="pers-tipo-inf">
            <option value="ingreso_irregular">Ingreso irregular por PNH</option>
            <option value="permanencia_irregular">Permanencia irregular</option>
            <option value="documentacion_vencida">Documentación vencida</option>
            <option value="expulsion_pendiente">Expulsión pendiente</option>
            <option value="otra">Otra infracción Ley Extranjería</option>
          </select>
        </div>
        <div class="campo"><label>N° Oficio PDI</label><input type="text" class="pers-nro-doc" placeholder="N° oficio..."/></div>
      </div>`
  } else {
    extra.innerHTML = `<div class="campo"><label>N° Parte Fiscalía</label><input type="text" class="pers-nro-doc" placeholder="N° parte..."/></div>`
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
  } else {
    div.innerHTML = ''
  }
}

function toggleFFAA(id, show) {
  const div = el(`ffaa-${id}`)
  if (div) div.style.display = show ? 'block' : 'none'
}

// M5: helper para actualizar barra de progreso
function setProgreso(pct, label) {
  const barra  = el('progreso-barra')
  const lbl    = el('progreso-label')
  const cont   = el('guardar-progreso')
  if (cont) cont.style.display = 'block'
  if (barra) barra.style.width  = pct + '%'
  if (lbl)   lbl.textContent    = label
}

// ── GUARDAR SERVICIO ──────────────────────────────────────────
async function guardarServicio() {
  if (!_servicioActual) return

  // M2: validar mínimo 1 punto en S1
  if (_puntosSeleccionados.length === 0) {
    toast('Debe seleccionar al menos 1 punto en S1 antes de guardar', 'err')
    el('puntos-sel-resumen').style.border = '1.5px solid var(--rojo)'
    return
  }

  const svcId = _servicioActual.id
  const btn   = el('btn-guardar-svc')
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...' }

  try {
    setProgreso(10, 'Actualizando estado del servicio...')
    await APP.sb.from('servicios').update({
      codigo_jefe_servicio: el('codigo-resp')?.value?.trim() || null,
      estado:               'completado',
      completado_at:        new Date().toISOString(),
      completado_por:       APP.perfil.id,
    }).eq('id', svcId)

    // Limpiar datos anteriores
    setProgreso(20, 'Limpiando datos previos...')
    await Promise.all([
      APP.sb.from('visitas_puntos').delete().eq('servicio_id', svcId),
      APP.sb.from('controles_servicio').delete().eq('servicio_id', svcId),
      APP.sb.from('observaciones_intel').delete().eq('servicio_id', svcId),
      APP.sb.from('incautaciones').delete().eq('servicio_id', svcId),
      APP.sb.from('hallazgos_sin_detenido').delete().eq('servicio_id', svcId),
      APP.sb.from('personas_registradas').delete().eq('servicio_id', svcId),
    ])

    // S1 — Visitas
    setProgreso(35, 'Guardando S1: puntos visitados...')
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

    // S2 — Observaciones
    setProgreso(50, 'Guardando S2: observaciones de inteligencia...')
    const obsItems = qsa('.sub-form[id^="obs-"]')
    for (const obs of obsItems) {
      const nivel = obs.querySelector('.obs-nivel')?.value
      const { data: obsRec } = await APP.sb.from('observaciones_intel').insert({
        servicio_id:      svcId,
        punto_id:         obs.querySelector('.obs-punto')?.value || null,
        tipo_hallazgo:    obs.querySelector('.obs-tipo')?.value,
        descripcion:      obs.querySelector('.obs-desc')?.value,
        nivel_relevancia: nivel,
        evidencia_foto:   obs.querySelector('.obs-foto')?.checked || false,
        evidencia_gps:    obs.querySelector('.obs-gps')?.checked  || false,
      }).select().single()
      if (nivel === 'alto' && obsRec) {
        await APP.sb.from('reportes_inteligencia').insert({
          observacion_id: obsRec.id,
          cuartel_id:     APP.cuartelActivo()?.id,
          fecha_generado: fecha,
          estado:         'pendiente',
        })
      }
    }

    // S3 — Controles
    setProgreso(65, 'Guardando S3: controles...')
    await APP.sb.from('controles_servicio').insert({
      servicio_id:              svcId,
      identidad_preventivos:    parseInt(el('ctrl-id-prev')?.value)||0,
      identidad_investigativos: parseInt(el('ctrl-id-inv')?.value)||0,
      migratorios:              parseInt(el('ctrl-migr')?.value)||0,
      vehiculares:              parseInt(el('ctrl-veh')?.value)||0,
      flagrancias:              parseInt(el('ctrl-flag')?.value)||0,
    })

    // S4 — Incautaciones
    setProgreso(75, 'Guardando S4: incautaciones...')
    const valorUF    = window._ufFormActual || await obtenerValorUF(fecha)
    const incItems   = qsa('.sub-form[id^="inc-"]')
    for (const inc of incItems) {
      const clp = parseFloat(inc.querySelector('.inc-clp')?.value)||0
      await APP.sb.from('incautaciones').insert({
        servicio_id:            svcId,
        punto_id:               inc.querySelector('.inc-punto')?.value || null,
        tipo_especie:           inc.querySelector('.inc-tipo')?.value,
        sustancia_droga:        inc.querySelector('.inc-sustancia')?.value || null,
        modalidad_ocultamiento: inc.querySelector('.inc-ocultamiento')?.value || null,
        moneda:                 inc.querySelector('.inc-moneda')?.value || null,
        cantidad:               parseFloat(inc.querySelector('.inc-cant')?.value)||0,
        valor_clp:              clp,
        valor_uf:               clpAUF(clp, valorUF),
        fecha_uf:               fecha,
        con_detenido:           true,
      })
    }

    // S5 — Hallazgos
    setProgreso(83, 'Guardando S5: hallazgos sin detenido...')
    const hallItems = qsa('.sub-form[id^="hall-"]')
    for (const h of hallItems) {
      const clp = parseFloat(h.querySelector('.hall-clp')?.value)||0
      await APP.sb.from('hallazgos_sin_detenido').insert({
        servicio_id: svcId,
        punto_id:    h.querySelector('.hall-punto')?.value || null,
        tipo_bien:   h.querySelector('.hall-tipo')?.value,
        descripcion: h.querySelector('.hall-desc')?.value,
        valor_clp:   clp,
        valor_uf:    clpAUF(clp, valorUF),
        fecha_uf:    fecha,
      })
    }

    // S6 — Personas
    setProgreso(92, 'Guardando S6: personas registradas...')
    const persItems = qsa('.sub-form[id^="pers-"]')
    for (const p of persItems) {
      const delito     = p.querySelector('.pers-delito')?.value
      const esCohecho  = delito === 'cohecho'
      const esInterpol = delito === 'orden_interpol'
      const esNNA      = p.querySelector('.pers-etario')?.value === 'nna'

      await APP.sb.from('personas_registradas').insert({
        servicio_id:            svcId,
        punto_id:               p.querySelector('.pers-punto')?.value || null,
        grupo_etario:           p.querySelector('.pers-etario')?.value,
        sexo:                   p.querySelector('.pers-sexo')?.value,
        nacionalidad:           p.querySelector('.pers-nac')?.value,
        edad:                   parseInt(p.querySelector('.pers-edad-nna')?.value)||null,
        como_inicio:            p.querySelector('.pers-inicio')?.value,
        tipo_resultado:         p.querySelector('.pers-resultado')?.value,
        tipo_delito:            delito || null,
        situacion_migratoria:   p.querySelector('.pers-sit-mig')?.value || null,
        tipo_ingreso:           p.querySelector('.pers-ing')?.value || null,
        tipo_gestion_migratoria:p.querySelector('.pers-gestion')?.value || null,
        nro_documento:          p.querySelector('.pers-nro-doc')?.value || null,
        distancia_lpi_km:       parseFloat(p.querySelector('.pers-dist-lpi')?.value)||null,
        nna_acompanado:         p.querySelector('.pers-acomp')?.value === 'acompanado',
        nna_vinculo_adulto:     p.querySelector('.pers-vinculo-nna')?.value || null,
        nna_derivacion:         p.querySelector('.pers-deriv')?.value || null,
        vinculacion_inst:       p.querySelector('.pers-vinc')?.value || null,
        institucion_extranjera: p.querySelector('.pers-inst')?.value || null,
        pais_extranjero:        p.querySelector('.pers-pais')?.value || null,
        rango_declarado:        p.querySelector('.pers-rango')?.value || null,
        portaba_identificacion: p.querySelector('.pers-id-oficial')?.checked || false,
        estaba_uniformado:      p.querySelector('.pers-uniformado')?.checked || false,
        elemento_interes:       p.querySelector('.pers-interes')?.value || null,
        genera_alerta_cohecho:  esCohecho,
        genera_alerta_nna:      esNNA,
        genera_alerta_interpol: esInterpol,
      })

      if (esCohecho) await APP.sb.from('alertas').insert({
        cuartel_id: APP.cuartelActivo()?.id, tipo: 'cohecho',
        detalle: `Cohecho detectado en servicio ${fecha}`, servicio_id: svcId })
      if (esNNA) await APP.sb.from('alertas').insert({
        cuartel_id: APP.cuartelActivo()?.id, tipo: 'nna',
        detalle: `NNA en situación irregular detectado - ${fecha}`, servicio_id: svcId })
      if (esInterpol) await APP.sb.from('alertas').insert({
        cuartel_id: APP.cuartelActivo()?.id, tipo: 'interpol',
        detalle: `Objetivo internacional capturado - ${fecha}`, servicio_id: svcId })
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
