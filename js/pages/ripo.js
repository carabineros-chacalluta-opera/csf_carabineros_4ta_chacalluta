// ============================================================
// SISTEMA CSF OPERATIVA — ripo.js  v1.0
// Generador de Reporte RIPO por cuartel en formato Excel
// Genera las 8 hojas del formato_ripo.xlsx
// ============================================================

const MESES_ES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// ── Render pantalla RIPO ──────────────────────────────────────
async function renderRipo() {
  const hoy  = hoyISO()
  const anio = new Date().getFullYear()
  const puedeVerTodos = APP.esAdministrador() || APP.esComisario()
  const cuartelActivo = APP.cuartelActivo()

  el('pantalla-ripo').innerHTML = `
    <div class="container">
      <h2 class="page-titulo">Reporte RIPO</h2>
      <div class="card filtros-card" style="margin-bottom:1rem">
        <div class="g3">
          <div class="campo">
            <label>Mes</label>
            <select id="ripo-mes">
              ${Array.from({length:12},(_,i)=>i+1).map(m=>
                `<option value="${m}" ${m===new Date().getMonth()+1?'selected':''}>${MESES_ES[m]}</option>`
              ).join('')}
            </select>
          </div>
          <div class="campo">
            <label>Año</label>
            <input type="number" id="ripo-anio" value="${anio}" min="2024" max="2030"/>
          </div>
          ${puedeVerTodos ? `
          <div class="campo">
            <label>Cuartel</label>
            <select id="ripo-cuartel">
              <option value="">— Todos los cuarteles —</option>
              ${(APP.todosCuarteles||[]).map(c=>
                `<option value="${c.id}" ${c.id===cuartelActivo?.id?'selected':''}>${c.nombre.replace(' (F)','')}</option>`
              ).join('')}
            </select>
          </div>` : ''}
        </div>
        <button class="btn btn-primario" onclick="generarRipo()">Generar y descargar RIPO (.xlsx)</button>
      </div>
      <div id="ripo-estado"></div>
    </div>`
}

// ── Conversor decimal → DMS ───────────────────────────────────
function decimalToDMS(decimal) {
  if (!decimal) return { grados: '', minutos: '', segundos: '' }
  const abs = Math.abs(decimal)
  const grados   = Math.floor(abs)
  const minRaw   = (abs - grados) * 60
  const minutos  = Math.floor(minRaw)
  const segundos = ((minRaw - minutos) * 60).toFixed(0)
  return { grados, minutos, segundos }
}

// ── Número de semana ISO ──────────────────────────────────────
function semanaDelAnio(fechaStr) {
  const d = new Date(fechaStr + 'T12:00:00')
  const inicio = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d - inicio) / 86400000 + inicio.getDay() + 1) / 7)
}

// ── Función principal ─────────────────────────────────────────
async function generarRipo() {
  const mes       = parseInt(el('ripo-mes')?.value)
  const anio      = parseInt(el('ripo-anio')?.value)
  const cuartelId = el('ripo-cuartel')?.value || APP.cuartelActivo()?.id
  const estado    = el('ripo-estado')
  if (!mes || !anio) { toast('Selecciona mes y año', 'err'); return }

  estado.innerHTML = '<div class="cargando">Consultando datos...</div>'

  const ini = `${anio}-${String(mes).padStart(2,'0')}-01`
  const fin = new Date(anio, mes, 0).toISOString().split('T')[0]

  // ── Cargar todos los datos en paralelo ────────────────────
  let svcsQ = APP.sb.from('servicios')
    .select('*').gte('fecha', ini).lte('fecha', fin).eq('estado','completado')
  if (cuartelId) svcsQ = svcsQ.eq('cuartel_id', cuartelId)
  const { data: svcs } = await svcsQ

  if (!svcs?.length) {
    estado.innerHTML = '<div class="card" style="padding:2rem;text-align:center;color:var(--muted)">Sin servicios completados en el período seleccionado.</div>'
    return
  }

  const svcIds = svcs.map(s => s.id)
  const svcMap = {}; svcs.forEach(s => { svcMap[s.id] = s })

  const [
    { data: visitas },
    { data: personas },
    { data: entrevistas },
    { data: rescates },
    { data: capacitaciones },
    { data: puntos },
    { data: cuarteles },
  ] = await Promise.all([
    APP.sb.from('visitas_puntos').select('*,punto:puntos_territoriales(*)').in('servicio_id', svcIds),
    APP.sb.from('personas_registradas').select('*').in('servicio_id', svcIds),
    APP.sb.from('entrevistas_servicio').select('*,punto:puntos_territoriales(nombre)').in('servicio_id', svcIds),
    APP.sb.from('rescates_servicio').select('*').in('servicio_id', svcIds),
    (() => {
      let q = APP.sb.from('capacitaciones').select('*,cuartel:cuarteles(nombre)').gte('fecha_inicio', ini).lte('fecha_inicio', fin)
      return cuartelId ? q.eq('cuartel_id', cuartelId) : q
    })(),
    (() => {
      let q = APP.sb.from('puntos_territoriales').select('*,cuartel:cuarteles(nombre,prefectura)').eq('activo', true)
      return cuartelId ? q.eq('cuartel_id', cuartelId) : q
    })(),
    cuartelId
      ? APP.sb.from('cuarteles').select('*').eq('id', cuartelId)
      : APP.sb.from('cuarteles').select('*').eq('activo', true),
  ])

  estado.innerHTML = '<div class="cargando">Generando Excel...</div>'

  // ── Construir Excel ───────────────────────────────────────
  const wb = XLSX.utils.book_new()

  // ── HOJA 1: Pat. Soberanía ────────────────────────────────
  estado.innerHTML = '<div class="cargando">Generando hoja Pat. Soberanía...</div>'
  const hPat = generarHojaPatrullaje(svcs, visitas, personas, 'soberania')
  XLSX.utils.book_append_sheet(wb, hPat, 'Pat. Soberanía')

  // ── HOJA 2: Pat. Hitos ────────────────────────────────────
  estado.innerHTML = '<div class="cargando">Generando hoja Pat. Hitos...</div>'
  const hHit = generarHojaPatrullaje(svcs, visitas, personas, 'hitos')
  XLSX.utils.book_append_sheet(wb, hHit, 'Pat. Hitos')

  // ── HOJAS 3-5: HITOS / PNH / SFI (S1-S52) ────────────────
  for (const tipo of ['hito', 'pnh', 'sie']) {
    estado.innerHTML = `<div class="cargando">Generando hoja ${tipo.toUpperCase()}...</div>`
    const hoja = generarHojaFrecuencia(puntos, visitas, tipo, anio)
    const nombre = tipo === 'hito' ? 'HITOS' : tipo === 'pnh' ? 'PNH' : 'SFI'
    XLSX.utils.book_append_sheet(wb, hoja, nombre)
  }

  // ── HOJA 6: Entrevistas ───────────────────────────────────
  estado.innerHTML = '<div class="cargando">Generando hoja Entrevistas...</div>'
  const hEnt = generarHojaEntrevistas(svcs, entrevistas, svcMap)
  XLSX.utils.book_append_sheet(wb, hEnt, 'Entrevistas')

  // ── HOJA 7: Capacitaciones ────────────────────────────────
  estado.innerHTML = '<div class="cargando">Generando hoja Capacitaciones...</div>'
  const hCap = generarHojaCapacitaciones(capacitaciones)
  XLSX.utils.book_append_sheet(wb, hCap, 'Capacitaciones')

  // ── HOJA 8: Rescate ───────────────────────────────────────
  estado.innerHTML = '<div class="cargando">Generando hoja Rescate...</div>'
  const hRes = generarHojaRescate(svcs, rescates, svcMap)
  XLSX.utils.book_append_sheet(wb, hRes, 'Rescate')

  // ── Descargar ─────────────────────────────────────────────
  const nomCuartel = cuartelId
    ? (cuarteles?.find(c=>c.id===cuartelId)?.nombre?.replace(' (F)','').replace(/\s+/g,'_') || 'CUARTEL')
    : 'TODOS'
  const fname = `RIPO_${nomCuartel}_${MESES_ES[mes].toUpperCase()}_${anio}.xlsx`
  XLSX.writeFile(wb, fname)
  estado.innerHTML = `<div class="card" style="padding:1rem;color:var(--verde);font-weight:600">✅ RIPO generado: ${fname}</div>`
  toast('RIPO descargado correctamente', 'ok')
}

// ── GENERADOR: Hoja Pat. Soberanía / Pat. Hitos ───────────────
function generarHojaPatrullaje(svcs, visitas, personas, modo) {
  // modo: 'soberania' = todos los servicios | 'hitos' = solo los que tienen hitos
  const visitasPorSvc = {}
  ;(visitas||[]).forEach(v => {
    if (!visitasPorSvc[v.servicio_id]) visitasPorSvc[v.servicio_id] = []
    visitasPorSvc[v.servicio_id].push(v)
  })
  const personasPorSvc = {}
  ;(personas||[]).forEach(p => {
    if (!personasPorSvc[p.servicio_id]) personasPorSvc[p.servicio_id] = []
    personasPorSvc[p.servicio_id].push(p)
  })

  let svcsF = svcs
  if (modo === 'hitos') {
    svcsF = svcs.filter(s => (visitasPorSvc[s.id]||[]).some(v => v.punto?.tipo === 'hito'))
  }

  // Encabezados del Excel
  const headers = [
    'NRO. ORDEN','PREFECTURA','UNIDAD O DESTACAMENTO (F)',
    'FECHA DESDE D','FECHA DESDE M','FECHA DESDE A','HORA DESDE',
    'FECHA HASTA D','FECHA HASTA M','FECHA HASTA A','HORA HASTA',
    'P.N.S','P.N.I',
    'LATITUD GRADOS','LATITUD MINUTOS','LATITUD SEGUNDOS',
    'LONGITUD GRADOS','LONGITUD MINUTOS','LONGITUD SEGUNDOS',
    'SECTORES RECORRIDOS','TOTAL KM RECORRIDOS',
    'KM MOTORIZADO','KM MONTADO','KM INFANTERIA','KM VEH. MARITIMO',
    'CANTIDAD SIF FISCALIZADOS','NOMBRES SIF VISITADOS',
    'CANTIDAD PNH FISCALIZADOS','NOMBRES PNH FISCALIZADOS',
    'GPS','VISORES NOCTURNOS','BINOCULARES','EQUIPO DE MONTAÑA','MALLA DE CAMUFLAJE',
    'OBSERVACIONES'
  ]

  const rows = [headers]

  svcsF.forEach((svc, idx) => {
    const visitas_svc = visitasPorSvc[svc.id] || []
    const personas_svc = personasPorSvc[svc.id] || []
    const hitos  = visitas_svc.filter(v => v.punto?.tipo === 'hito')
    const pnhs   = visitas_svc.filter(v => v.punto?.tipo === 'pnh')
    const sies   = visitas_svc.filter(v => v.punto?.tipo === 'sie')

    // GPS: prioridad coords del servicio, luego primer punto visitado
    let lat = svc.latitud_recorrido
    let lon = svc.longitud_recorrido
    if (!lat) {
      const primerPunto = visitas_svc.find(v => v.punto?.latitud)
      if (primerPunto) { lat = primerPunto.punto.latitud; lon = primerPunto.punto.longitud }
    }
    if (!lat) {
      const primerPers = personas_svc.find(p => p.latitud_procedimiento)
      if (primerPers) { lat = primerPers.latitud_procedimiento; lon = primerPers.longitud_procedimiento }
    }
    const latDMS = decimalToDMS(lat)
    const lonDMS = decimalToDMS(lon)

    // Sectores recorridos: texto resumen
    const nombresHitos = hitos.map(v=>v.punto?.nombre).filter(Boolean)
    const nombresPNH   = pnhs.map(v=>v.punto?.nombre).filter(Boolean)
    const nombresSIE   = sies.map(v=>v.punto?.nombre).filter(Boolean)
    let sectores = ''
    if (nombresHitos.length) sectores += `Hitos: ${nombresHitos.join(', ')}. `
    if (nombresPNH.length)   sectores += `PNH: ${nombresPNH.join(', ')}. `
    if (nombresSIE.length)   sectores += `SIF: ${nombresSIE.join(', ')}.`
    sectores = sectores.trim() || 'Sin puntos registrados'

    // Observaciones agrupadas desde personas con resultado
    const obs = generarObservaciones(personas_svc, svc.observaciones)

    // Fecha
    const [a, m, d] = (svc.fecha||'').split('-')

    rows.push([
      idx + 1,
      'ARICA N° 1',
      svc.cuartel?.nombre || '',
      parseInt(d), parseInt(m), parseInt(a), svc.hora_inicio || '',
      parseInt(d), parseInt(m), parseInt(a), svc.hora_termino || '',
      svc.personal_pns || 0,
      svc.personal_pni || 0,
      latDMS.grados, latDMS.minutos, latDMS.segundos,
      lonDMS.grados, lonDMS.minutos, lonDMS.segundos,
      sectores,
      svc.km_total || 0,
      svc.km_motorizado || 0, svc.km_montado || 0,
      svc.km_infanteria || 0, svc.km_maritimo || 0,
      sies.length, nombresSIE.join(', ') || '—',
      pnhs.length, nombresPNH.join(', ') || '—',
      1, 1, 1, 1, 1,
      obs
    ])
  })

  return XLSX.utils.aoa_to_sheet(rows)
}

// ── GENERADOR: Hojas HITOS / PNH / SFI (S1-S52) ──────────────
function generarHojaFrecuencia(puntos, visitas, tipo, anio) {
  const puntosTipo = (puntos||[]).filter(p => p.tipo === tipo)

  // Mapa: punto_id → semanas visitadas ese año
  const semanasPorPunto = {}
  ;(visitas||[]).forEach(v => {
    if (v.punto?.tipo !== tipo) return
    const semana = semanaDelAnio(v.fecha)
    if (!semanasPorPunto[v.punto_id]) semanasPorPunto[v.punto_id] = new Set()
    semanasPorPunto[v.punto_id].add(semana)
  })

  const FVC_ANUAL = {
    'diario': 365, '2x_semana': 104, 'semanal': 52,
    'quincenal': 26, 'mensual': 12, 'bimestral': 6,
    'trimestral': 4, 'semestral': 2,
  }

  // Cabeceras semanas
  const semHeaders = Array.from({length:52}, (_,i) => `S${i+1}`)
  const headerBase = [
    'PREFECTURA','CUARTEL (F)','NUMERO PUNTO','NOMBRE PUNTO','PAÍS LIMITROFE',
    'TIEMPO VERIFICACION (min)','TIEMPO TRASLADO (min)','TOTAL MIN','TOTAL HORAS',
    'FRECUENCIA ANUAL','CANTIDAD VERIFICACION ANUAL',
    ...semHeaders
  ]
  const rows = [headerBase]

  puntosTipo.forEach(p => {
    const semVisitadas = semanasPorPunto[p.id] || new Set()
    const fvcAnual = FVC_ANUAL[p.fvc_base] || 12
    const tiempoVerif = p.tiempo_verificacion || 60
    const tiempoTrasl = p.tiempo_traslado || 60
    const totalMin  = tiempoVerif + tiempoTrasl
    const totalHoras = (totalMin / 60).toFixed(2)
    const semanas = Array.from({length:52}, (_,i) => semVisitadas.has(i+1) ? 1 : 0)

    rows.push([
      'ARICA N° 1',
      p.cuartel?.nombre || '',
      p.nombre,
      p.nombre_completo || p.nombre,
      p.pais_limitrofe || '',
      tiempoVerif,
      tiempoTrasl,
      totalMin,
      totalHoras,
      p.fvc_base?.toUpperCase() || '',
      fvcAnual,
      ...semanas
    ])
  })

  return XLSX.utils.aoa_to_sheet(rows)
}

// ── GENERADOR: Hoja Entrevistas ───────────────────────────────
function generarHojaEntrevistas(svcs, entrevistas, svcMap) {
  const svcCuartelMap = {}
  svcs.forEach(s => { svcCuartelMap[s.id] = s })

  const headers = [
    'NRO. ORDEN','PREFECTURA','UNIDAD O DESTACAMENTO (F)',
    'TIPO DE ENTREVISTA','FECHA D','FECHA M','FECHA A',
    'HORA DESDE','HORA HASTA',
    'LUGAR DE ENCUENTRO','CON QUIÉN','GRADO POLICÍA','NOMBRE POLICÍA',
    'LATITUD GRADOS','LATITUD MINUTOS','LATITUD SEGUNDOS',
    'LONGITUD GRADOS','LONGITUD MINUTOS','LONGITUD SEGUNDOS',
    'TOTAL KM','¿FUE REALIZADA?','TEMAS TRATADOS','MOTIVO NO REALIZACIÓN'
  ]
  const rows = [headers]

  ;(entrevistas||[]).forEach((e, idx) => {
    const svc = svcCuartelMap[e.servicio_id] || {}
    const [a, m, d] = (e.fecha||svc.fecha||'').split('-')
    const latDMS = decimalToDMS(e.latitud)
    const lonDMS = decimalToDMS(e.longitud)
    const conQuien = e.tipo === 'PNP' ? 'Policía Nacional del Perú' : 'Policía Boliviana'

    rows.push([
      idx + 1,
      'ARICA N° 1',
      svc.cuartel?.nombre || '',
      e.tipo || '',
      parseInt(d), parseInt(m), parseInt(a),
      e.hora_inicio || '', e.hora_termino || '',
      e.punto?.nombre || '',
      conQuien,
      e.grado_policia || '',
      e.nombre_policia || '',
      latDMS.grados, latDMS.minutos, latDMS.segundos,
      lonDMS.grados, lonDMS.minutos, lonDMS.segundos,
      e.km_recorridos || 0,
      e.realizada ? 'SI' : 'NO',
      e.temas_tratados || '',
      e.motivo_no || ''
    ])
  })

  return XLSX.utils.aoa_to_sheet(rows)
}

// ── GENERADOR: Hoja Capacitaciones ───────────────────────────
function generarHojaCapacitaciones(capacitaciones) {
  const headers = [
    'NRO. ORDEN','PREFECTURA','UNIDAD O DESTACAMENTO (F)',
    'TIPO CAPACITACIÓN',
    'DURACIÓN DESDE D','DURACIÓN DESDE M','DURACIÓN DESDE A',
    'DURACIÓN HASTA D','DURACIÓN HASTA M','DURACIÓN HASTA A',
    'TEMÁTICAS TRATADAS','ORGANISMO QUE REALIZA LA CAPACITACIÓN',
    'CANTIDAD DE PERSONAL CAPACITADO'
  ]
  const rows = [headers]

  ;(capacitaciones||[]).forEach((c, idx) => {
    const [ai, mi, di] = (c.fecha_inicio||'').split('-')
    const [at, mt, dt] = (c.fecha_termino||c.fecha_inicio||'').split('-')
    rows.push([
      idx + 1,
      'ARICA N° 1',
      c.cuartel?.nombre || '',
      c.tipo === 'institucional' ? 'INSTITUCIONAL' : 'EXTRAINSTITUCIONAL',
      parseInt(di), parseInt(mi), parseInt(ai),
      parseInt(dt), parseInt(mt), parseInt(at),
      c.tematica || '',
      c.organismo || '',
      c.cantidad_personal || 0,
    ])
  })

  return XLSX.utils.aoa_to_sheet(rows)
}

// ── GENERADOR: Hoja Rescate ───────────────────────────────────
function generarHojaRescate(svcs, rescates, svcMap) {
  const headers = [
    'NRO. ORDEN','PREFECTURA','UNIDAD O DESTACAMENTO (F)',
    'FECHA D','FECHA M','FECHA A',
    'BREVE DESCRIPCIÓN PROCEDIMIENTO',
    'LATITUD GRADOS','LATITUD MINUTOS','LATITUD SEGUNDOS',
    'LONGITUD GRADOS','LONGITUD MINUTOS','LONGITUD SEGUNDOS',
    'CUARTEL (F)','GOPE','BOMBEROS','FF.AA.','SOCORRO ANDINO','CIVILES',
    'MEDIOS UTILIZADOS'
  ]
  const rows = [headers]

  ;(rescates||[]).forEach((r, idx) => {
    const svc = svcMap[r.servicio_id] || {}
    const [a, m, d] = (r.fecha||svc.fecha||'').split('-')
    const latDMS = decimalToDMS(r.latitud)
    const lonDMS = decimalToDMS(r.longitud)

    rows.push([
      idx + 1,
      'ARICA N° 1',
      svc.cuartel?.nombre || '',
      parseInt(d), parseInt(m), parseInt(a),
      r.descripcion || '',
      latDMS.grados, latDMS.minutos, latDMS.segundos,
      lonDMS.grados, lonDMS.minutos, lonDMS.segundos,
      r.personal_cuartel ? 'X' : '',
      r.personal_gope    ? 'X' : '',
      r.personal_bomberos? 'X' : '',
      r.personal_ffaa    ? 'X' : '',
      r.personal_socorro ? 'X' : '',
      r.personal_civiles ? 'X' : '',
      r.medios_utilizados || '',
    ])
  })

  return XLSX.utils.aoa_to_sheet(rows)
}

// ── Genera texto de observaciones agrupado ────────────────────
function generarObservaciones(personas, obsServicio) {
  if (!personas?.length) return obsServicio || 'SIN NOVEDAD.'

  // Agrupar por tipo de resultado
  const grupos = {}
  personas.forEach(p => {
    const key = p.tipo_resultado
    if (!grupos[key]) grupos[key] = []
    grupos[key].push(p)
  })

  const partes = []

  if (grupos.detencion) {
    const g = grupos.detencion
    // Agrupar por delito
    const porDelito = {}
    g.forEach(p => {
      const d = p.tipo_delito || 'delito'
      if (!porDelito[d]) porDelito[d] = 0
      porDelito[d]++
    })
    Object.entries(porDelito).forEach(([delito, cnt]) => {
      const nombreDelito = delito.replace(/_/g,' ').toUpperCase()
      partes.push(`${cnt} DETENIDO${cnt>1?'S':''} POR ${nombreDelito}`)
    })
  }

  if (grupos.infraccion_migratoria) {
    const g = grupos.infraccion_migratoria
    const reconducidos = g.filter(p=>p.tipo_gestion_migratoria==='reconducido').length
    const denunciados  = g.filter(p=>p.tipo_gestion_migratoria!=='reconducido').length
    if (reconducidos) partes.push(`${reconducidos} INFRACCION${reconducidos>1?'ES':''} MIGRATORIA${reconducidos>1?'S':''} RECONDUCIDA${reconducidos>1?'S':''}`)
    if (denunciados)  partes.push(`${denunciados} INFRACCION${denunciados>1?'ES':''} MIGRATORIA${denunciados>1?'S':''} DENUNCIADA${denunciados>1?'S':''}`)
  }

  if (grupos.nna_irregular) {
    const cnt = grupos.nna_irregular.length
    partes.push(`${cnt} NNA EN SITUACION IRREGULAR`)
  }

  // Puntos del procedimiento
  const puntos = [...new Set(personas.filter(p=>p.punto_id).map(p=>p.punto?.nombre||p.punto_id))]
  if (puntos.length) partes.push(`PROCEDIMIENTO EN: ${puntos.join(', ')}`)

  let texto = partes.join('. ')
  if (obsServicio) texto += (texto ? '. ' : '') + obsServicio
  return texto || 'SIN NOVEDAD.'
}
