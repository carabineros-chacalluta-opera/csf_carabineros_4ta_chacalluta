// ============================================================
// SISTEMA CSF OPERATIVA — reportes.js  v1.2
// ACTUALIZACIÓN: Pestaña BS Datos integrada
// ============================================================

let _filtroRep = { desde: null, hasta: null, tipo_punto: 'todos', cuartel: null }

async function renderReportes() {
  const hoy  = hoyISO()
  const anio = new Date().getFullYear()
  const ini  = `${anio}-01-01`

  const cuartelActivo = APP.cuartelActivo()
  const puedeVerTodos = APP.esAdministrador() || APP.esComisario()

  el('pantalla-reportes').innerHTML = `
    <div class="container">
      <h2 class="page-titulo">Reportes</h2>

      <!-- Tabs principales -->
      <div class="tabs-bar" style="margin-bottom:1rem">
        <button class="tab-btn tab-activo" data-tab="operativo"
          onclick="switchRepTab('operativo')">
          📊 Reporte operativo
        </button>
        <button class="tab-btn" data-tab="bsdatos"
          onclick="switchRepTab('bsdatos')">
          📋 BS Datos — Cuenta Delitos
        </button>
      </div>

      <!-- Panel operativo -->
      <div id="rep-panel-operativo">
        <!-- Filtros -->
        <div class="card filtros-card">
          <div class="g3">
            <div class="campo">
              <label>Desde</label>
              <input type="date" id="rep-desde" value="${ini}"/>
            </div>
            <div class="campo">
              <label>Hasta</label>
              <input type="date" id="rep-hasta" value="${hoy}"/>
            </div>
            <div class="campo">
              <label>Tipo de punto</label>
              <select id="rep-tipo">
                <option value="todos">Todos</option>
                <option value="hito">Solo Hitos</option>
                <option value="pnh">Solo PNH</option>
                <option value="sie">Solo SIE</option>
              </select>
            </div>
            ${puedeVerTodos ? `
            <div class="campo">
              <label>Cuartel</label>
              <select id="rep-cuartel">
                <option value="">— Todos los cuarteles —</option>
                ${(APP.todosCuarteles || []).map(c =>
                  `<option value="${c.id}" ${c.id === cuartelActivo?.id ? 'selected' : ''}>
                    ${c.nombre.replace(' (F)','')}
                  </option>`
                ).join('')}
              </select>
            </div>` : ''}
          </div>
          <button class="btn btn-primario" onclick="cargarReportes()">Consultar</button>
        </div>
        <div id="reportes-contenido"><div class="cargando">Selecciona un período y consulta</div></div>
      </div>

      <!-- Panel BS Datos -->
      <div id="rep-panel-bsdatos" style="display:none">
        <div id="reportes-contenido-bsd"></div>
      </div>

    </div>`

  await cargarReportes()
}

function switchRepTab(tab) {
  document.querySelectorAll('.tabs-bar .tab-btn').forEach(b => {
    b.classList.toggle('tab-activo', b.dataset.tab === tab)
  })
  const panelOp  = el('rep-panel-operativo')
  const panelBSD = el('rep-panel-bsdatos')
  if (panelOp)  panelOp.style.display  = tab === 'operativo' ? 'block' : 'none'
  if (panelBSD) panelBSD.style.display = tab === 'bsdatos'   ? 'block' : 'none'

  if (tab === 'bsdatos') {
    const cont = el('reportes-contenido-bsd')
    if (cont && !cont.children.length) {
      renderReporteBSDatos()
    }
  }
}

async function cargarReportes() {
  const desde     = el('rep-desde')?.value
  const hasta     = el('rep-hasta')?.value
  const tipoPunto = el('rep-tipo')?.value
  const zona      = el('reportes-contenido')

  // FIX B-CUARTEL: leer cuartel del selector de reportes o del activo global
  const repCuartelId = el('rep-cuartel')?.value || APP.cuartelActivo()?.id
  const cuartelId    = repCuartelId || null

  showLoader('reportes-contenido', 'Consultando datos...')

  // Servicios del período
  let svcsQuery = APP.sb.from('servicios')
    .select('id').gte('fecha', desde).lte('fecha', hasta)
  if (cuartelId) svcsQuery = svcsQuery.eq('cuartel_id', cuartelId)

  const { data: svcs } = await svcsQuery
  const svcIds = (svcs||[]).map(s=>s.id)
  if (!svcIds.length) {
    zona.innerHTML = '<div class="card" style="text-align:center;padding:2rem;color:var(--muted)">Sin servicios en el período seleccionado</div>'
    return
  }

  // Datos
  const [
    { data: visitas },
    { data: personas },
    { data: incautaciones },
    { data: hallazgos },
    { data: controles },
    { data: puntos },
  ] = await Promise.all([
    APP.sb.from('visitas_puntos').select('*,punto:puntos_territoriales(nombre,tipo)').in('servicio_id', svcIds),
    APP.sb.from('personas_registradas').select('*').in('servicio_id', svcIds),
    APP.sb.from('incautaciones').select('*').in('servicio_id', svcIds),
    APP.sb.from('hallazgos_sin_detenido').select('*').in('servicio_id', svcIds),
    APP.sb.from('controles_servicio').select('*').in('servicio_id', svcIds),
    // FIX B-CUARTEL: filtrar puntos por cuartel si está definido
    (() => {
      let q = APP.sb.from('puntos_territoriales').select('id,nombre,tipo').eq('activo',true)
      return cuartelId ? q.eq('cuartel_id', cuartelId) : q
    })(),
  ])

  // Filtrar visitas por tipo si aplica
  const visitasFilt = tipoPunto === 'todos' ? (visitas||[])
    : (visitas||[]).filter(v => v.punto?.tipo === tipoPunto)

  // Agrupar visitas por punto
  const visitasPorPunto = {}
  visitasFilt.forEach(v => {
    const nombre = v.punto?.nombre || v.punto_id
    if (!visitasPorPunto[nombre]) visitasPorPunto[nombre] = { tipo: v.punto?.tipo, count: 0, fechas: [] }
    visitasPorPunto[nombre].count++
    visitasPorPunto[nombre].fechas.push(v.fecha)
  })

  // KPIs
  const totalVisitas = visitasFilt.length
  const totalHitos   = visitasFilt.filter(v=>v.punto?.tipo==='hito').length
  const totalPNH     = visitasFilt.filter(v=>v.punto?.tipo==='pnh').length
  const totalSIE     = visitasFilt.filter(v=>v.punto?.tipo==='sie').length

  const totalControles = (controles||[]).reduce((a,c) =>
    a+(c.identidad_preventivos||0)+(c.identidad_investigativos||0)+(c.migratorios||0)+(c.vehiculares||0), 0)
  const totalDetenidos   = (personas||[]).filter(p=>p.tipo_resultado==='detencion').length
  const totalMigrantes   = (personas||[]).filter(p=>p.tipo_resultado==='infraccion_migratoria').length
  const totalNNA         = (personas||[]).filter(p=>p.grupo_etario==='nna').length
  const totalCOT         = (personas||[]).filter(p=>CSF_CONFIG.DELITOS_COT.includes(p.tipo_delito)).length
  const totalUF          = [...(incautaciones||[]),...(hallazgos||[])].reduce((a,i)=>a+(i.valor_uf||0),0)

  // Migrantes por tipo
  const reconducidos = (personas||[]).filter(p=>p.tipo_gestion_migratoria==='reconducido').length
  const denunciados  = (personas||[]).filter(p=>p.tipo_gestion_migratoria==='denunciado_extranjeria').length

  // Por nacionalidad
  const porNac = {}
  personas?.filter(p=>p.tipo_resultado==='infraccion_migratoria'||p.tipo_resultado==='detencion')
    .forEach(p => { porNac[p.nacionalidad||'Desconocido'] = (porNac[p.nacionalidad||'Desconocido']||0)+1 })

  zona.innerHTML = `
    <!-- KPIs -->
    <div class="kpi-grid" style="margin-bottom:1.5rem">
      ${kpiCard('Visitas totales', totalVisitas, `${totalHitos} hitos · ${totalPNH} PNH · ${totalSIE} SIE`, 'neutral')}
      ${kpiCard('Controles', totalControles.toLocaleString('es-CL'), 'ID + Migratorios + Vehiculares', 'neutral')}
      ${kpiCard('Detenidos', totalDetenidos, `${totalCOT} delitos COT`, totalDetenidos>0?'ok':'neutral')}
      ${kpiCard('Migrantes irregulares', totalMigrantes, `${reconducidos} reconducidos · ${denunciados} denunciados`, totalMigrantes>0?'warn':'neutral')}
      ${kpiCard('NNA detectados', totalNNA, 'En situación irregular', totalNNA>0?'critico':'neutral')}
      ${kpiCard('UF Incautadas', totalUF.toFixed(2), 'Con y sin detenido', totalUF>0?'ok':'neutral')}
    </div>

    <!-- Visitas por punto -->
    <div class="card" style="margin-bottom:1rem">
      <div class="sec-titulo">Visitas por punto territorial</div>
      <table style="width:100%;border-collapse:collapse;font-size:.78rem">
        <thead>
          <tr style="background:#f0f0f2">
            <th style="padding:.35rem .6rem;text-align:left">Punto</th>
            <th style="padding:.35rem .6rem;text-align:left;width:60px">Tipo</th>
            <th style="padding:.35rem .6rem;text-align:center;width:80px">Visitas</th>
            <th style="padding:.35rem .6rem;text-align:left">Última visita</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(visitasPorPunto).sort((a,b)=>b[1].count-a[1].count).map(([nombre, datos], i) => `
            <tr style="${i%2===0?'background:#fafafa':''};border-bottom:1px solid var(--border)">
              <td style="padding:.35rem .6rem;font-weight:500">${nombre}</td>
              <td style="padding:.35rem .6rem">
                <span style="font-size:.65rem;font-weight:700;padding:1px 5px;border-radius:3px;background:${datos.tipo==='hito'?'#e8f0fe':datos.tipo==='pnh'?'#fdecea':'#e8f5ea'};color:${datos.tipo==='hito'?'#0055d4':datos.tipo==='pnh'?'#C0392B':'#1A843F'}">${datos.tipo?.toUpperCase()}</span>
              </td>
              <td style="padding:.35rem .6rem;text-align:center;font-weight:700;color:var(--verde)">${datos.count}</td>
              <td style="padding:.35rem .6rem;color:var(--muted)">${formatFechaCorta([...datos.fechas].sort().pop())}</td>
            </tr>`).join('')}
          ${Object.keys(visitasPorPunto).length===0?'<tr><td colspan="4" style="padding:1rem;text-align:center;color:var(--muted)">Sin visitas en el período</td></tr>':''}
        </tbody>
      </table>
    </div>

    <!-- Migrantes por nacionalidad -->
    ${Object.keys(porNac).length > 0 ? `
    <div class="card">
      <div class="sec-titulo">Personas registradas por nacionalidad</div>
      <div class="g3">
        ${Object.entries(porNac).sort((a,b)=>b[1]-a[1]).map(([nac,cnt]) => `
          <div style="display:flex;justify-content:space-between;padding:.35rem 0;border-bottom:1px solid var(--border)">
            <span>${nac}</span>
            <strong>${cnt}</strong>
          </div>`).join('')}
      </div>
    </div>` : ''}

    <!-- Incautaciones -->
    ${(incautaciones||[]).length > 0 ? `
    <div class="card" style="margin-top:1rem">
      <div class="sec-titulo">Incautaciones del período</div>
      <table style="width:100%;border-collapse:collapse;font-size:.78rem">
        <thead>
          <tr style="background:#f0f0f2">
            <th style="padding:.35rem .6rem;text-align:left">Tipo</th>
            <th style="padding:.35rem .6rem;text-align:left">Subtipo/Sustancia</th>
            <th style="padding:.35rem .6rem;text-align:right">Valor $CLP</th>
            <th style="padding:.35rem .6rem;text-align:right">UF</th>
          </tr>
        </thead>
        <tbody>
          ${(incautaciones||[]).map((inc,i) => `
            <tr style="${i%2===0?'background:#fafafa':''}">
              <td style="padding:.3rem .6rem">${inc.tipo_especie?.replace(/_/g,' ')}</td>
              <td style="padding:.3rem .6rem;color:var(--muted)">${inc.sustancia_droga||inc.subtipo||'—'}</td>
              <td style="padding:.3rem .6rem;text-align:right">${(inc.valor_clp||0).toLocaleString('es-CL')}</td>
              <td style="padding:.3rem .6rem;text-align:right;font-weight:600;color:var(--verde)">${(inc.valor_uf||0).toFixed(2)}</td>
            </tr>`).join('')}
          <tr style="background:#e8f5ea;font-weight:700">
            <td colspan="3" style="padding:.35rem .6rem">TOTAL</td>
            <td style="padding:.35rem .6rem;text-align:right">${(incautaciones||[]).reduce((a,i)=>a+(i.valor_uf||0),0).toFixed(2)} UF</td>
          </tr>
        </tbody>
      </table>
    </div>` : ''}
  `
}
// ============================================================
// MÓDULO REPORTE BS DATOS — reporte_bs_datos.js
// Se agrega a reportes.js
// Genera el Excel "CUENTA DELITOS FRONTERAS" con los 36 campos
// a partir de una CSF seleccionada (mes_referencia + cuartel)
// ============================================================

// ── Renderiza el selector de CSF para el reporte BS Datos ────
async function renderReporteBSDatos() {
  const cuartelActivo = APP.cuartelActivo()
  const cuartelId     = cuartelActivo?.id
  const puedeVerTodos = APP.esAdministrador() || APP.esComisario()

  // Cargar todas las CSF publicadas del cuartel
  let qCSF = APP.sb.from('csf_mensual')
    .select('id, numero, mes_referencia, anio_referencia, mes_vigencia, anio_vigencia, cuartel_id, cuarteles(nombre,comuna)')
    .eq('estado', 'publicada')
    .order('anio_vigencia', { ascending: false })
    .order('mes_vigencia',  { ascending: false })

  if (cuartelId) qCSF = qCSF.eq('cuartel_id', cuartelId)

  const { data: csfs } = await qCSF
  const lista = csfs || []

  const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  el('reportes-contenido').innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div class="sec-titulo" style="margin-bottom:.75rem">
        📋 Reporte BS Datos — Cuenta Delitos Fronteras
      </div>
      <p style="font-size:.8rem;color:var(--muted);margin-bottom:1rem;line-height:1.6">
        Selecciona una Carta de Situación Fronteriza. El sistema extrae automáticamente
        todos los registros del <strong>mes de referencia</strong> que alimentaron esa CSF
        y genera el Excel en formato BS Datos con los 36 campos requeridos.
      </p>

      ${!lista.length ? `
        <div style="padding:1.5rem;text-align:center;color:var(--muted);font-size:.84rem">
          Sin CSF publicadas disponibles para este cuartel.
        </div>` : `
        <div class="g2" style="margin-bottom:1rem">
          <div class="campo">
            <label>Seleccionar CSF</label>
            <select id="bsd-csf-sel" style="font-size:.84rem">
              <option value="">— Seleccionar CSF —</option>
              ${lista.map(c => `
                <option value="${c.id}"
                  data-mes-ref="${c.mes_referencia}"
                  data-anio-ref="${c.anio_referencia}"
                  data-cuartel="${c.cuartel_id}"
                  data-cuartel-nombre="${c.cuarteles?.nombre || ''}"
                  data-comuna="${c.cuarteles?.comuna || ''}">
                  ${c.numero} — Vigencia ${MESES[c.mes_vigencia]} ${c.anio_vigencia}
                  (Ref: ${MESES[c.mes_referencia]} ${c.anio_referencia})
                  ${puedeVerTodos ? '· ' + (c.cuarteles?.nombre?.replace(' (F)','') || '') : ''}
                </option>`).join('')}
            </select>
          </div>
          <div class="campo" style="align-self:end">
            <button class="btn btn-primario" onclick="cargarExpedienteBSD()">
              Cargar expediente
            </button>
          </div>
        </div>

        <div id="bsd-info-csf" style="display:none;background:var(--verde-cl2,#F0F9F3);
             border:1px solid var(--verde-mid,#C2DECE);border-radius:var(--r);
             padding:.75rem 1rem;font-size:.8rem;margin-bottom:1rem">
        </div>
      `}
    </div>

    <div id="bsd-resultado"></div>`
}

// ── Carga y muestra el expediente de la CSF seleccionada ─────
async function cargarExpedienteBSD() {
  const sel     = el('bsd-csf-sel')
  const opt     = sel?.options[sel.selectedIndex]
  const csfId   = sel?.value
  if (!csfId) { toast('Selecciona una CSF', 'err'); return }

  const mesRef       = parseInt(opt.dataset.mesRef)
  const anioRef      = parseInt(opt.dataset.anioRef)
  const cuartelId    = opt.dataset.cuartel
  const cuartelNombre= opt.dataset.cuartelNombre
  const comuna       = opt.dataset.comuna

  const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  // Mostrar info del período de referencia
  const infoEl = el('bsd-info-csf')
  if (infoEl) {
    infoEl.style.display = 'block'
    infoEl.innerHTML = `
      <strong>Período de referencia:</strong> ${MESES[mesRef]} ${anioRef} &nbsp;·&nbsp;
      <strong>Cuartel:</strong> ${cuartelNombre.replace(' (F)','')} &nbsp;·&nbsp;
      <strong>Comuna:</strong> ${comuna || '—'}
      <br><span style="color:var(--muted);font-size:.75rem">
        Los datos mostrados corresponden a los servicios completados en ${MESES[mesRef]} ${anioRef}
        que fueron usados para calcular la criticidad de esta CSF.
      </span>`
  }

  const zona = el('bsd-resultado')
  zona.innerHTML = '<div class="cargando">Consultando datos del expediente...</div>'

  // ── 1. Período de referencia ──────────────────────────────
  const iniRef = `${anioRef}-${String(mesRef).padStart(2,'0')}-01`
  const finRef = new Date(anioRef, mesRef, 0).toISOString().split('T')[0]

  // ── 2. Servicios del mes de referencia ────────────────────
  const { data: svcs } = await APP.sb.from('servicios')
    .select('id, fecha, tipo_servicio, hora_inicio, hora_termino, cuartel_id')
    .eq('cuartel_id', cuartelId)
    .eq('estado', 'completado')
    .gte('fecha', iniRef)
    .lte('fecha', finRef)
    .order('fecha')

  const svcIds    = (svcs || []).map(s => s.id)
  const svcMap    = {}
  ;(svcs || []).forEach(s => { svcMap[s.id] = s })

  if (!svcIds.length) {
    zona.innerHTML = `<div class="card" style="text-align:center;padding:2rem;color:var(--muted)">
      Sin servicios completados en ${MESES[mesRef]} ${anioRef} para este cuartel.
    </div>`
    return
  }

  // ── 3. Todos los datos hijos en paralelo ──────────────────
  const [
    { data: personas },
    { data: incautaciones },
    { data: modos },
    { data: puntos },
  ] = await Promise.all([
    APP.sb.from('personas_registradas')
      .select('*')
      .in('servicio_id', svcIds),
    APP.sb.from('incautaciones')
      .select('servicio_id, tipo_especie, sustancia_droga, cantidad, unidad, valor_clp, valor_uf, punto_id')
      .in('servicio_id', svcIds),
    APP.sb.from('catalogo_modo_operandi')
      .select('id, descripcion'),
    APP.sb.from('puntos_territoriales')
      .select('id, nombre, nombre_completo, tipo, latitud, longitud')
      .eq('cuartel_id', cuartelId),
  ])

  // Maps de apoyo
  const modoMap  = {}
  ;(modos  || []).forEach(m => { modoMap[m.id]  = m.descripcion })
  const puntoMap = {}
  ;(puntos || []).forEach(p => { puntoMap[p.id] = p })

  // Incautaciones por servicio (resumen para columna 12)
  const incautPorSvc = {}
  ;(incautaciones || []).forEach(inc => {
    if (!incautPorSvc[inc.servicio_id]) incautPorSvc[inc.servicio_id] = []
    incautPorSvc[inc.servicio_id].push(inc)
  })

  // ── 4. Construir filas BS Datos ────────────────────────────
  const filas = []

  for (const persona of (personas || [])) {
    const svc    = svcMap[persona.servicio_id]
    const punto  = puntoMap[persona.punto_id] || null
    const puntoIngreso = puntoMap[persona.punto_ingreso_id] || punto
    const incs   = incautPorSvc[persona.servicio_id] || []
    const fecha  = new Date(svc?.fecha + 'T12:00:00')

    // Incautación: resumen textual
    const incResumen = incs.length
      ? incs.map(i => `${i.tipo_especie?.replace(/_/g,' ')}${i.sustancia_droga?' ('+i.sustancia_droga+')':''}`).join('; ')
      : ''

    // Nombre completo
    const nombreCompleto = [persona.nombres, persona.apellidos].filter(Boolean).join(' ') || ''

    // SIN DOC: S si aplica
    const sinDoc = persona.sin_documento ? 'S' : ''

    // Rango hora desde hora_evento o desde hora_inicio del servicio
    const horaRef = persona.hora_evento || svc?.hora_inicio || ''
    const rangoHora = horaRef ? calcularRangoHora(String(horaRef).substring(0,5)) : ''

    // Destino legible
    const destinoLabels = {
      parte_fiscalia:    'FISCALÍA',
      oficio_pdi:        'PDI',
      acta_reconduccion: 'ACTA RECONDUCCIÓN',
    }

    // Clasificación legible
    const clasificLabels = {
      detenido:   'DETENIDO',
      infraccion: 'INFRACCIÓN',
      denuncia:   'DENUNCIA',
    }

    // Cómo se inició (solo infracciones)
    const inicioLabels = {
      autodenuncia:           'AUTODENUNCIA',
      patrullaje_flagrancia:  'FLAGRANCIA',
      control_migratorio:     'CONTROL',
      control_identidad_preventivo:   'CONTROL',
      control_identidad_investigativo:'CONTROL',
      control_vehicular:      'CONTROL',
    }

    filas.push({
      // Col 1  — UNIDAD PROCEDIMIENTO
      unidad:         cuartelNombre,
      // Col 2  — LEY
      ley:            persona.ley_aplicable || '',
      // Col 3  — DELITO
      delito:         persona.tipo_delito?.replace(/_/g,' ').toUpperCase() || '',
      // Col 4  — N° PARTE / OFICIO
      nro_doc:        persona.nro_documento || '',
      // Col 5  — FECHA
      fecha:          svc?.fecha || '',
      // Col 6  — DESTINO PARTE/OFICIO
      destino:        destinoLabels[persona.destino_documento] || '',
      // Col 7  — AUTODENUNCIA/FLAGRANCIA/CONTROL
      como_inicio:    persona.tipo_resultado === 'infraccion_migratoria'
                        ? (inicioLabels[persona.como_inicio] || '')
                        : '',
      // Col 8  — LATITUD procedimiento
      latitud:        persona.latitud_procedimiento ?? (punto?.latitud ?? ''),
      // Col 9  — LONGITUD procedimiento
      longitud:       persona.longitud_procedimiento ?? (punto?.longitud ?? ''),
      // Col 10 — CANTIDAD (1 fila = 1 persona)
      cantidad:       1,
      // Col 11 — ZONA
      zona:           punto?.nombre || '',
      // Col 12 — INCAUTACIÓN
      incautacion:    incResumen,
      // Col 13 — HORA
      hora:           String(svc?.hora_inicio || '').substring(0,5),
      // Col 14 — MODO OPERANDI
      modo_operandi:  modoMap[persona.modo_operandi_id] || '',
      // Col 15 — PREFECTURA
      prefectura:     'PREFECTURA ARICA NRO. 1',
      // Col 16 — SECTOR_UNIDAD_DEL_PROCEDIMIENTO
      sector_unidad:  cuartelNombre,
      // Col 17 — DIA
      dia:            fecha.getDate(),
      // Col 18 — MES
      mes:            fecha.getMonth() + 1,
      // Col 19 — AÑO
      anio:           fecha.getFullYear(),
      // Col 20 — TIPO_DELITO
      tipo_delito:    persona.tipo_delito?.replace(/_/g,' ').toUpperCase() || '',
      // Col 21 — COMUNA
      comuna:         comuna || '',
      // Col 22 — SECTOR DESTACAMENTO (F)
      sector_dest:    cuartelNombre,
      // Col 23 — CLASIFICACION
      clasificacion:  clasificLabels[persona.clasificacion_caso] || '',
      // Col 24 — SECTOR FRONTERIZO DETENCIÓN
      sector_frontera: punto?.nombre || '',
      // Col 25 — RANGO HORA
      rango_hora:     rangoHora,
      // Col 26 — NOMBRES Y APELLIDOS
      nombres:        nombreCompleto,
      // Col 27 — FEMENINO (S/N)
      femenino:       persona.sexo === 'femenino' ? 'S' : '',
      // Col 28 — EDAD
      edad:           persona.edad || '',
      // Col 29 — DOMICILIO
      domicilio:      persona.domicilio || '',
      // Col 30 — NACIONALIDAD
      nacionalidad:   persona.nacionalidad || '',
      // Col 31 — LUGAR INGRESO AL PAÍS
      lugar_ingreso:  puntoIngreso?.nombre_completo || puntoIngreso?.nombre || '',
      // Col 32 — LATITUD lugar ingreso
      lat_ingreso:    puntoIngreso?.latitud ?? '',
      // Col 33 — LONGITUD lugar ingreso
      lon_ingreso:    puntoIngreso?.longitud ?? '',
      // Col 34 — ORGANISMO DETECCIÓN
      organismo:      persona.organismo_deteccion?.toUpperCase() || '',
      // Col 35 — NNA PARENTESCO
      nna_parentesco: persona.nna_vinculo_adulto?.replace(/_/g,' ').toUpperCase() || '',
      // Col 36 — SIN DOC
      sin_doc:        sinDoc,
    })
  }

  // ── 5. Renderizar tabla previa + botón exportar ───────────
  const totalPersonas = filas.length
  const totalDetenidos = filas.filter(f => f.clasificacion === 'DETENIDO').length
  const totalInfracc   = filas.filter(f => f.clasificacion === 'INFRACCIÓN').length

  if (!totalPersonas) {
    zona.innerHTML = `<div class="card" style="text-align:center;padding:2rem;color:var(--muted)">
      Sin personas registradas en los servicios de ${MESES[mesRef]} ${anioRef}.
    </div>`
    return
  }

  // Guardamos para exportar
  window._bsdFilas       = filas
  window._bsdCuartel     = cuartelNombre
  window._bsdMesRef      = MESES[mesRef] + ' ' + anioRef

  zona.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden">

      <!-- Cabecera con stats y botón exportar -->
      <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:.75rem 1rem;background:var(--verde);color:#fff;flex-wrap:wrap;gap:.5rem">
        <div>
          <div style="font-weight:700;font-size:.9rem">
            Expediente BS Datos — ${MESES[mesRef]} ${anioRef}
          </div>
          <div style="font-size:.75rem;opacity:.85">
            ${totalPersonas} registros &nbsp;·&nbsp;
            ${totalDetenidos} detenidos &nbsp;·&nbsp;
            ${totalInfracc} infracciones &nbsp;·&nbsp;
            ${svcIds.length} servicios
          </div>
        </div>
        <button class="btn" onclick="exportarBSDatosExcel()"
          style="background:#fff;color:var(--verde);font-weight:700;font-size:.8rem;padding:.4rem .9rem">
          ↓ Exportar Excel BS Datos
        </button>
      </div>

      <!-- Tabla de previsualización -->
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:.72rem;min-width:1200px">
          <thead>
            <tr style="background:#f0f0f2;position:sticky;top:0">
              ${[
                'N°','Unidad','Ley','Delito','N° Parte/Oficio','Fecha',
                'Destino','Inicio','Lat','Lon','Zona','Incaut.',
                'Hora','Modo Operandi','Día','Mes','Año',
                'Tipo Delito','Comuna','Clasificación','Rango Hora',
                'Nombres y Apellidos','Fem','Edad','Domicilio',
                'Nacionalidad','Lugar Ingreso','Lat I','Lon I',
                'Organismo','NNA Parent.','Sin Doc'
              ].map(h => `<th style="padding:.3rem .5rem;text-align:left;white-space:nowrap;
                           border-right:1px solid var(--border)">${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${filas.map((f, i) => `
              <tr style="${i%2===0?'background:#fafafa':''}; border-bottom:1px solid var(--border)">
                <td style="padding:.3rem .5rem;font-weight:700;color:var(--muted);
                            border-right:1px solid var(--border)">${i+1}</td>
                ${[
                  f.unidad, f.ley, f.delito, f.nro_doc, f.fecha,
                  f.destino, f.como_inicio,
                  f.latitud||'—', f.longitud||'—',
                  f.zona, f.incautacion||'—', f.hora,
                  f.modo_operandi||'—',
                  f.dia, f.mes, f.anio,
                  f.tipo_delito, f.comuna,
                  `<span style="font-weight:600;color:${
                    f.clasificacion==='DETENIDO'?'var(--rojo)':
                    f.clasificacion==='INFRACCIÓN'?'var(--amarillo)':'var(--muted)'
                  }">${f.clasificacion}</span>`,
                  f.rango_hora,
                  f.nombres||'—',
                  f.femenino||'—', f.edad||'—', f.domicilio||'—',
                  f.nacionalidad,
                  f.lugar_ingreso||'—',
                  f.lat_ingreso||'—', f.lon_ingreso||'—',
                  f.organismo||'—',
                  f.nna_parentesco||'—',
                  f.sin_doc ? '<strong style="color:var(--rojo)">S</strong>' : '—',
                ].map(v => `<td style="padding:.3rem .5rem;white-space:nowrap;
                              border-right:1px solid var(--border)">${v}</td>`).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

    </div>`
}

// ── Exporta el Excel exacto con los 36 encabezados oficiales ─
async function exportarBSDatosExcel() {
  const filas    = window._bsdFilas
  const cuartel  = window._bsdCuartel?.replace(' (F)','')
  const periodo  = window._bsdMesRef

  if (!filas?.length) { toast('Sin datos para exportar', 'err'); return }

  // SheetJS — disponible como global XLSX en la página
  if (typeof XLSX === 'undefined') {
    toast('Cargando librería Excel...', 'ok')
    await cargarSheetJS()
  }

  const HEADERS = [
    'UNIDAD PROCEDIMIENTO',
    'LEY',
    'DELITO',
    'N° PARTE POLICIAL Y/O OFICIO EN CASO INGRESO ILEGAL',
    'FECHA',
    'DESTINO DEL PARTE / OFICIO (FISCALIA Y/O P.D.I)',
    'AUTODENUNCIA / FLAGRANCIA / CONTROL O FISCALIZACION (indicar una)',
    'LATITUD',
    'LONGITUD',
    'CANTIDAD',
    'ZONA',
    'INCAUTACION',
    'HORA',
    'MODO OPERANDI',
    'PREFECTURA',
    'SECTOR_UNIDAD_DEL_PROCEDIMIENTO',
    'DIA',
    'MES',
    'AÑO',
    'TIPO_DELITO',
    'COMUNA',
    'SECTOR DESTACAMENTO (F)',
    'CLASIFICACION',
    'SECTOR FRONTERIZO DETENCION',
    'RANGO HORA',
    'NOMBRES Y APELLIDOS',
    'FEMENINO',
    'EDAD',
    'DOMICILIO',
    'NACIONALIDAD',
    'LUGAR POR DONDE EL CIUDADANO SEÑALA QUE HIZO INGRESO AL PAIS (NOMBRE HITO, PASO HABILITADO O NO HABILITADO, ETC)',
    'LATITUD',
    'LONGITUD',
    'ORGANISMO QUIEN DETECTO EL INGRESO (CARABINEROS, ARMADA O EJERCITO)',
    'EN CASO DE UN NNA, PARENTESCO DEL ADULTO QUE LO ACOMPAÑA',
    'SIN DOC',
  ]

  // Mapear filas al orden exacto de columnas
  const data = [HEADERS, ...filas.map(f => [
    f.unidad, f.ley, f.delito, f.nro_doc, f.fecha,
    f.destino, f.como_inicio, f.latitud, f.longitud,
    f.cantidad, f.zona, f.incautacion, f.hora, f.modo_operandi,
    f.prefectura, f.sector_unidad,
    f.dia, f.mes, f.anio,
    f.tipo_delito, f.comuna, f.sector_dest, f.clasificacion,
    f.sector_frontera, f.rango_hora,
    f.nombres, f.femenino, f.edad, f.domicilio, f.nacionalidad,
    f.lugar_ingreso, f.lat_ingreso, f.lon_ingreso,
    f.organismo, f.nna_parentesco, f.sin_doc,
  ])]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)

  // Ancho de columnas
  ws['!cols'] = [
    {wch:28},{wch:22},{wch:22},{wch:20},{wch:12},
    {wch:14},{wch:14},{wch:12},{wch:12},{wch:8},
    {wch:20},{wch:22},{wch:8},{wch:24},{wch:22},
    {wch:22},{wch:6},{wch:6},{wch:6},{wch:20},
    {wch:14},{wch:22},{wch:14},{wch:22},{wch:14},
    {wch:28},{wch:8},{wch:6},{wch:22},{wch:14},
    {wch:40},{wch:12},{wch:12},{wch:30},{wch:28},{wch:8},
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'CUENTA DELITOS FRONTERAS')

  const nombre = `BS_DATOS_${cuartel?.replace(/ /g,'_')}_${periodo?.replace(/ /g,'_')}.xlsx`
  XLSX.writeFile(wb, nombre)
  toast('Excel generado: ' + nombre, 'ok')
}

// ── Carga SheetJS dinámicamente si no está disponible ────────
function cargarSheetJS() {
  return new Promise((resolve, reject) => {
    if (typeof XLSX !== 'undefined') { resolve(); return }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload  = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
}

