// ============================================================
// SISTEMA CSF OPERATIVA — ripo.js  v1.2
// CAMBIOS v1.2:
//   FIX-R1 — generarHojaEntrevistas(): columnas alineadas con BD real
//            (tipo, grado_policia, nombre_policia/nombre_entrevistado,
//             temas_tratados, informacion_relevante)
//   FIX-R2 — generarHojaRescate(): columnas alineadas con BD real
//            (tipo_rescate, cantidad_personas, descripcion, observaciones,
//             latitud, longitud, personal_*)
//   FIX-C07 — semanaISO() de core.js (sin cambio, ya estaba correcto)
//   FIX-D03 — MESES_ES[m-1] de core.js (sin cambio, ya estaba correcto)
// ============================================================

async function renderRipo() {
  const hoy  = hoyISO()
  const anio = new Date().getFullYear()
  const puedeVerTodos = APP.esAdministrador() || APP.esComisario()
  const cuartelActivo = APP.cuartelActivo()

  el('pantalla-ripo').innerHTML = `
    <div class="container">
      <h2 class="page-titulo">Reporte RIPO</h2>
      ${htmlBannerCuartel()}
      <div class="card filtros-card" style="margin-bottom:1rem">
        <div class="g3">
          <div class="campo">
            <label>Mes</label>
            <select id="ripo-mes">
              ${Array.from({length:12},(_,i)=>i+1).map(m=>
                `<option value="${m}" ${m===new Date().getMonth()+1?'selected':''}>${MESES_ES[m-1]}</option>`
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

function decimalToDMS(decimal) {
  if (!decimal) return { grados: '', minutos: '', segundos: '' }
  const abs      = Math.abs(decimal)
  const grados   = Math.floor(abs)
  const minRaw   = (abs - grados) * 60
  const minutos  = Math.floor(minRaw)
  const segundos = ((minRaw - minutos) * 60).toFixed(0)
  return { grados, minutos, segundos }
}

async function generarRipo() {
  const mes       = parseInt(el('ripo-mes')?.value)
  const anio      = parseInt(el('ripo-anio')?.value)
  const cuartelId = el('ripo-cuartel')?.value || APP.cuartelActivo()?.id
  const estado    = el('ripo-estado')
  if (!mes || !anio) { toast('Selecciona mes y año', 'err'); return }

  estado.innerHTML = '<div class="cargando">Consultando datos...</div>'

  const ini = `${anio}-${String(mes).padStart(2,'0')}-01`
  const fin = new Date(anio, mes, 0).toISOString().split('T')[0]

  let svcsQ = APP.sb.from('servicios')
    .select('*, cuartel:cuarteles(nombre,comuna)').gte('fecha', ini).lte('fecha', fin).eq('estado','completado')
  if (cuartelId) svcsQ = svcsQ.eq('cuartel_id', cuartelId)
  const { data: svcs } = await svcsQ

  if (!svcs?.length) {
    estado.innerHTML = '<div class="card" style="padding:2rem;text-align:center;color:var(--muted)">Sin servicios completados en el período seleccionado.</div>'
    return
  }

  const svcIds = svcs.map(s => s.id)
  const svcMap = {}; svcs.forEach(s => { svcMap[s.id] = s })

  const resultados = await Promise.all([
    APP.sb.from('visitas_puntos').select('id,servicio_id,punto_id,fecha,punto:puntos_territoriales(id,nombre,nombre_completo,tipo,latitud,longitud)').in('servicio_id', svcIds),
    APP.sb.from('personas_registradas').select('*').in('servicio_id', svcIds),
    APP.sb.from('entrevistas_servicio').select('*,punto:puntos_territoriales(nombre)').in('servicio_id', svcIds),
    APP.sb.from('rescates_servicio').select('*,punto:puntos_territoriales(nombre)').in('servicio_id', svcIds),
    (() => {
      let q = APP.sb.from('capacitaciones').select('*,cuartel:cuarteles(nombre)').gte('fecha_inicio', ini).lte('fecha_inicio', fin)
      return cuartelId ? q.eq('cuartel_id', cuartelId) : q
    })(),
    (() => {
      let q = APP.sb.from('puntos_territoriales').select('*,cuartel:cuarteles(nombre,pais_lpi)').eq('activo', true)
      return cuartelId ? q.eq('cuartel_id', cuartelId) : q
    })(),
    cuartelId
      ? APP.sb.from('cuarteles').select('*').eq('id', cuartelId)
      : APP.sb.from('cuarteles').select('*').eq('activo', true),
  ])

  const errores = resultados.filter(r => r.error)
  if (errores.length) {
    estado.innerHTML = `<div class="card" style="color:var(--rojo);padding:1rem">Error al consultar datos: ${errores.map(r=>r.error.message).join(', ')}</div>`
    return
  }

  const [
    { data: visitas }, { data: personas }, { data: entrevistas },
    { data: rescates }, { data: capacitaciones }, { data: puntos }, { data: cuarteles },
  ] = resultados

  // Mapa id→nombre de puntos para lookups sin embed
  const puntosNombreMap = {}
  ;(puntos||[]).forEach(p => { puntosNombreMap[p.id] = p.nombre })

  try {
    estado.innerHTML = '<div class="cargando">Generando Excel...</div>'
    const wb = XLSX.utils.book_new()

    estado.innerHTML = '<div class="cargando">Generando hoja Pat. Soberanía...</div>'
    XLSX.utils.book_append_sheet(wb, generarHojaPatrullaje(svcs, visitas, personas, 'soberania', puntosNombreMap), 'Pat. Soberanía')

    estado.innerHTML = '<div class="cargando">Generando hoja Pat. Hitos...</div>'
    XLSX.utils.book_append_sheet(wb, generarHojaPatrullaje(svcs, visitas, personas, 'hitos', puntosNombreMap), 'Pat. Hitos')

    for (const tipo of ['hito', 'pnh', 'sie']) {
      estado.innerHTML = `<div class="cargando">Generando hoja ${tipo.toUpperCase()}...</div>`
      const nombre = tipo === 'hito' ? 'HITOS' : tipo === 'pnh' ? 'PNH' : 'SFI'
      XLSX.utils.book_append_sheet(wb, generarHojaFrecuencia(puntos, visitas, tipo, mes, anio), nombre)
    }

    estado.innerHTML = '<div class="cargando">Generando hoja Entrevistas...</div>'
    XLSX.utils.book_append_sheet(wb, generarHojaEntrevistas(svcs, entrevistas, svcMap), 'Entrevistas')

    estado.innerHTML = '<div class="cargando">Generando hoja Capacitaciones...</div>'
    XLSX.utils.book_append_sheet(wb, generarHojaCapacitaciones(capacitaciones), 'Capacitaciones')

    estado.innerHTML = '<div class="cargando">Generando hoja Rescate...</div>'
    XLSX.utils.book_append_sheet(wb, generarHojaRescate(svcs, rescates, svcMap), 'Rescate')

    const nomCuartel = cuartelId
      ? (cuarteles?.find(c=>c.id===cuartelId)?.nombre?.replace(' (F)','').replace(/\s+/g,'_') || 'CUARTEL')
      : 'TODOS'
    const fname = `RIPO_${nomCuartel}_${MESES_ES[mes-1].toUpperCase()}_${anio}.xlsx`
    XLSX.writeFile(wb, fname)
    estado.innerHTML = `<div class="card" style="padding:1rem;color:var(--verde);font-weight:600">✅ RIPO generado: ${fname}</div>`
    toast('RIPO descargado correctamente', 'ok')
  } catch(e) {
    estado.innerHTML = `<div class="card" style="color:var(--rojo);padding:1rem">Error al generar RIPO: ${e.message}</div>`
    console.error('generarRipo error:', e)
  }
}

const _TIPOS_PATRULLAJE = [
  'PATRULLAJE DE SOBERANIA Y VISITA A HITOS',
  'PATRULLAJE PUESTO DE OBSERVACION MOVIL',
  '1ER. PATRULLAJE', '2DO. PATRULLAJE',
  'INTERVENCION FRONTERIZA',
  'SERVICIO MIXTO CARABINEROS/EJERCITO',
]

function generarHojaPatrullaje(svcs, visitas, personas, modo, puntosNombreMap) {
  const visitasPorSvc  = {}
  const personasPorSvc = {}
  ;(visitas||[]).forEach(v => {
    if (!visitasPorSvc[v.servicio_id]) visitasPorSvc[v.servicio_id] = []
    visitasPorSvc[v.servicio_id].push(v)
  })
  ;(personas||[]).forEach(p => {
    if (!personasPorSvc[p.servicio_id]) personasPorSvc[p.servicio_id] = []
    personasPorSvc[p.servicio_id].push(p)
  })

  let svcsF = svcs
  if (modo === 'soberania') {
    svcsF = svcs.filter(s => _TIPOS_PATRULLAJE.some(t => s.tipo_servicio?.toUpperCase().includes(t.split(' ')[0])))
    if (!svcsF.length) svcsF = svcs // fallback: incluir todos si no hay match exacto
  }
  if (modo === 'hitos') {
    svcsF = svcs.filter(s => (visitasPorSvc[s.id]||[]).some(v => v.punto?.tipo === 'hito'))
  }

  const headers = [
    'NRO. ORDEN','PREFECTURA','UNIDAD O DESTACAMENTO (F)',
    'FECHA DESDE D','FECHA DESDE M','FECHA DESDE A','HORA DESDE',
    'FECHA HASTA D','FECHA HASTA M','FECHA HASTA A','HORA HASTA',
    'P.N.S','P.N.I',
    'LATITUD GRADOS','LATITUD MINUTOS','LATITUD SEGUNDOS',
    'LONGITUD GRADOS','LONGITUD MINUTOS','LONGITUD SEGUNDOS',
    'SECTORES RECORRIDOS','TOTAL KM RECORRIDOS',
    'KM MOTORIZADO','KM MONTADO','KM INFANTERIA','KM VEH. MARÍTIMO',
    'CANT. SIF FISCALIZADOS','NOMBRES SIF VISITADOS',
    'CANT. PNH FISCALIZADOS','NOMBRES PNH FISCALIZADOS',
    'GPS','VISORES NOCTURNOS','BINOCULARES','EQUIPO MONTAÑA','MALLA CAMUFLAJE',
    'OBSERVACIONES'
  ]
  const rows = [headers]

  svcsF.forEach((svc, idx) => {
    const visitas_svc  = visitasPorSvc[svc.id] || []
    const personas_svc = personasPorSvc[svc.id] || []
    const hitos = visitas_svc.filter(v => v.punto?.tipo === 'hito')
    const pnhs  = visitas_svc.filter(v => v.punto?.tipo === 'pnh')
    const sies  = visitas_svc.filter(v => v.punto?.tipo === 'sie')

    let lat = svc.latitud_recorrido, lon = svc.longitud_recorrido
    if (!lat) {
      const pp = visitas_svc.find(v => v.punto?.latitud)
      if (pp) { lat = pp.punto.latitud; lon = pp.punto.longitud }
    }
    if (!lat) {
      const pp2 = personas_svc.find(p => p.latitud_procedimiento)
      if (pp2) { lat = pp2.latitud_procedimiento; lon = pp2.longitud_procedimiento }
    }
    const latDMS = decimalToDMS(lat), lonDMS = decimalToDMS(lon)

    const nombresHitos = hitos.map(v=>v.punto?.nombre).filter(Boolean)
    const nombresPNH   = pnhs.map(v=>v.punto?.nombre).filter(Boolean)
    const nombresSIE   = sies.map(v=>v.punto?.nombre).filter(Boolean)
    let sectores = ''
    if (nombresHitos.length) sectores += `Hitos: ${nombresHitos.join(', ')}. `
    if (nombresPNH.length)   sectores += `PNH: ${nombresPNH.join(', ')}. `
    if (nombresSIE.length)   sectores += `SIF: ${nombresSIE.join(', ')}.`
    sectores = sectores.trim() || 'Sin puntos registrados'

    const obs = generarObservaciones(personas_svc, svc.observaciones, puntosNombreMap||{})
    const [a, m, d] = (svc.fecha||'').split('-')

    rows.push([
      idx+1, 'ARICA N° 1', svc.cuartel?.nombre || '',
      parseInt(d), parseInt(m), parseInt(a), svc.hora_inicio || '',
      parseInt(d), parseInt(m), parseInt(a), svc.hora_termino || '',
      svc.personal_pns||0, svc.personal_pni||0,
      latDMS.grados, latDMS.minutos, latDMS.segundos,
      lonDMS.grados, lonDMS.minutos, lonDMS.segundos,
      sectores, svc.km_total||0,
      svc.km_motorizado||0, svc.km_montado||0, svc.km_infanteria||0, svc.km_maritimo||0,
      sies.length, nombresSIE.join(', ')||'—',
      pnhs.length, nombresPNH.join(', ')||'—',
      'SÍ','SÍ','SÍ','SÍ','SÍ', obs
    ])
  })

  if (rows.length === 1) rows.push(['','','Sin servicios en el período',...Array(headers.length-3).fill('')])

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [
    {wch:6},{wch:14},{wch:30},
    {wch:6},{wch:6},{wch:6},{wch:8},
    {wch:6},{wch:6},{wch:6},{wch:8},
    {wch:6},{wch:6},
    {wch:8},{wch:8},{wch:8},
    {wch:8},{wch:8},{wch:8},
    {wch:50},{wch:8},
    {wch:8},{wch:8},{wch:8},{wch:8},
    {wch:8},{wch:40},
    {wch:8},{wch:40},
    {wch:5},{wch:5},{wch:5},{wch:5},{wch:5},
    {wch:60}
  ]
  return ws
}

function generarHojaFrecuencia(puntos, visitas, tipo, mes, anio) {
  const puntosTipo = (puntos||[]).filter(p => p.tipo === tipo)

  // ── Calcular las semanas ISO que tienen días en el mes seleccionado ──
  const primerDia  = new Date(anio, mes - 1, 1)
  const ultimoDia  = new Date(anio, mes, 0)
  const semanasDelMes = []
  const semanasVistas = new Set()
  const cur = new Date(primerDia)
  while (cur <= ultimoDia) {
    const isoStr = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`
    const nSem   = semanaISO(isoStr)
    if (!semanasVistas.has(nSem)) {
      semanasVistas.add(nSem)
      const dow    = cur.getDay() || 7
      const lunes  = new Date(cur); lunes.setDate(cur.getDate() - (dow - 1))
      const domingo= new Date(lunes); domingo.setDate(lunes.getDate() + 6)
      const fmt    = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
      semanasDelMes.push({ num: nSem, label: `S${nSem}\n${fmt(lunes)}-${fmt(domingo)}` })
    }
    cur.setDate(cur.getDate() + 1)
  }

  // ── Contar visitas por punto y por semana ISO ──
  const visitasPorPunto = {}
  ;(visitas||[]).forEach(v => {
    if (v.punto?.tipo !== tipo) return
    if (!v.fecha) return
    const nSem = semanaISO(v.fecha)
    if (!visitasPorPunto[v.punto_id]) visitasPorPunto[v.punto_id] = {}
    visitasPorPunto[v.punto_id][nSem] = (visitasPorPunto[v.punto_id][nSem] || 0) + 1
  })

  const FVC_POR_MES = {
    'diario':30, '2x_semana':8, 'semanal':4, 'quincenal':2,
    'mensual':1, 'bimestral':1, 'trimestral':1, 'semestral':1
  }

  const semLabels = semanasDelMes.map(s => s.label)
  const headers = [
    'PREFECTURA', 'CUARTEL (F)', 'CÓDIGO PUNTO', 'NOMBRE PUNTO', 'NOMBRE COMPLETO',
    'PAÍS LIMÍTROFE', 'T.VERIF (min)', 'T.TRASLADO (min)', 'TOTAL MIN', 'TOTAL HORAS',
    'FRECUENCIA', 'VISITAS REQ./MES', 'TOTAL VISITAS MES',
    ...semLabels
  ]

  const rows = [headers]

  puntosTipo.forEach(p => {
    const visitasSem   = visitasPorPunto[p.id] || {}
    const tiempoVerif  = p.tiempo_verificacion || 60
    const tiempoTrasl  = p.tiempo_traslado || 60
    const totalMin     = tiempoVerif + tiempoTrasl
    const totalHoras   = (totalMin / 60).toFixed(2)
    const visitasReq   = FVC_POR_MES[p.fvc_base] || 1
    const totalVisitas = semanasDelMes.reduce((acc, s) => acc + (visitasSem[s.num] || 0), 0)
    const semCounts    = semanasDelMes.map(s => visitasSem[s.num] || 0)

    rows.push([
      'ARICA N° 1',
      p.cuartel?.nombre || '',
      p.nombre,
      p.nombre_completo || p.nombre,
      p.nombre_completo || '',
      p.pais_limitrofe || '',
      tiempoVerif, tiempoTrasl, totalMin, totalHoras,
      CSF_CONFIG.FVC_LABELS[p.fvc_base] || p.fvc_base,
      visitasReq,
      totalVisitas,
      ...semCounts
    ])
  })

  if (rows.length === 1) {
    rows.push(['', '', `Sin puntos tipo ${tipo.toUpperCase()} registrados para el cuartel seleccionado`,
      ...Array(headers.length - 3).fill('')])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [
    {wch:14},{wch:28},{wch:12},{wch:24},{wch:30},
    {wch:12},{wch:12},{wch:12},{wch:10},{wch:10},
    {wch:16},{wch:14},{wch:14},
    ...semanasDelMes.map(() => ({wch:10}))
  ]
  return ws
}

// FIX-R1: columnas alineadas con la tabla real entrevistas_servicio
function generarHojaEntrevistas(svcs, entrevistas, svcMap) {
  const headers = [
    'NRO','PREFECTURA','CUARTEL','FECHA','HORA INICIO','HORA TÉRMINO',
    'TIPO (PNP/PNB)','TIPO ENTREVISTADO','GRADO','NOMBRE ENTREVISTADO',
    'PUNTO TERRITORIAL','KM RECORRIDOS','TEMAS TRATADOS','INFORMACIÓN RELEVANTE'
  ]
  const rows = [headers]
  ;(entrevistas||[]).forEach((e,i) => {
    const svc = svcMap[e.servicio_id] || {}
    rows.push([
      i+1,
      'ARICA N° 1',
      svc.cuartel?.nombre||'',
      svc.fecha||'',
      e.hora_inicio||'',
      e.hora_termino||'',
      e.tipo||'',                                         // PNP o PNB
      e.tipo_entrevistado||'',                            // nuevo campo
      e.grado_policia||'',
      e.nombre_entrevistado || e.nombre_policia || '',    // nuevo campo o fallback
      e.punto?.nombre||'',
      e.km_recorridos||0,
      e.temas_tratados||'',
      e.informacion_relevante||'',                        // nuevo campo
    ])
  })
  if (rows.length===1) rows.push(['','Sin entrevistas registradas en el período','','','','','','','','','','','',''])
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{wch:5},{wch:14},{wch:28},{wch:12},{wch:10},{wch:10},{wch:8},{wch:24},{wch:16},{wch:28},{wch:28},{wch:10},{wch:40},{wch:50}]
  return ws
}

function generarHojaCapacitaciones(capacitaciones) {
  const headers = ['NRO','PREFECTURA','CUARTEL','FECHA INICIO','FECHA TERMINO','TEMÁTICA / CURSO','TIPO','ORGANISMO','PARTICIPANTES']
  const rows = [headers]
  ;(capacitaciones||[]).forEach((c,i) => {
    rows.push([i+1,'ARICA N° 1',c.cuartel?.nombre||'',c.fecha_inicio||'',c.fecha_termino||'',
      c.tematica||'',          // campo real (era: nombre_curso)
      c.tipo||'',              // campo real (era: tipo_capacitacion)
      c.organismo||'',         // campo real (era: horas, que no existe)
      c.cantidad_personal||0   // campo real (era: cantidad_participantes)
    ])
  })
  if (rows.length===1) rows.push(['','Sin capacitaciones registradas en el período','','','','','','',''])
  return XLSX.utils.aoa_to_sheet(rows)
}

// FIX-R2: columnas alineadas con la tabla real rescates_servicio
function generarHojaRescate(svcs, rescates, svcMap) {
  const headers = [
    'NRO','PREFECTURA','CUARTEL','FECHA',
    'TIPO RESCATE','PERSONAS RESCATADAS','DESCRIPCIÓN',
    'PUNTO MÁS CERCANO','LATITUD','LONGITUD',
    'MEDIOS UTILIZADOS',
    'PERS. CUARTEL','PERS. GOPE','PERS. BOMBEROS','PERS. FFAA','PERS. SOCORRO','PERS. CIVILES',
    'OBSERVACIONES'
  ]
  const rows = [headers]
  ;(rescates||[]).forEach((r,i) => {
    const svc = svcMap[r.servicio_id] || {}
    const latDMS = decimalToDMS(r.latitud)
    const lonDMS = decimalToDMS(r.longitud)
    const latStr = r.latitud ? `${latDMS.grados}°${latDMS.minutos}'${latDMS.segundos}" S` : ''
    const lonStr = r.longitud ? `${lonDMS.grados}°${lonDMS.minutos}'${lonDMS.segundos}" W` : ''
    rows.push([
      i+1,
      'ARICA N° 1',
      svc.cuartel?.nombre||'',
      svc.fecha||r.fecha||'',
      r.tipo_rescate||'',
      r.cantidad_personas||0,
      r.descripcion||'',
      r.punto?.nombre||'',
      latStr,
      lonStr,
      r.medios_utilizados||'',
      r.personal_cuartel   ? 'SÍ' : '',
      r.personal_gope      ? 'SÍ' : '',
      r.personal_bomberos  ? 'SÍ' : '',
      r.personal_ffaa      ? 'SÍ' : '',
      r.personal_socorro   ? 'SÍ' : '',
      r.personal_civiles   ? 'SÍ' : '',
      r.observaciones||'',
    ])
  })
  if (rows.length===1) rows.push(['','Sin rescates registrados en el período','','','','','','','','','','','','','','','',''])
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{wch:5},{wch:14},{wch:28},{wch:12},{wch:20},{wch:10},{wch:40},{wch:28},{wch:18},{wch:18},{wch:30},{wch:6},{wch:6},{wch:6},{wch:6},{wch:6},{wch:6},{wch:40}]
  return ws
}

function generarObservaciones(personas, obsServicio, puntosMap) {
  if (!personas?.length && !obsServicio) return 'SIN NOVEDAD.'
  const grupos = {}
  ;(personas||[]).forEach(p => {
    if (!grupos[p.tipo_resultado]) grupos[p.tipo_resultado] = []
    grupos[p.tipo_resultado].push(p)
  })
  const partes = []
  if (grupos.detencion) partes.push(`${grupos.detencion.length} DETENIDO${grupos.detencion.length>1?'S':''}`)
  if (grupos.infraccion_migratoria) {
    const reconducidos = grupos.infraccion_migratoria.filter(p=>p.tipo_gestion_migratoria==='reconducido').length
    const denunciados  = grupos.infraccion_migratoria.filter(p=>p.tipo_gestion_migratoria!=='reconducido').length
    if (reconducidos) partes.push(`${reconducidos} INFRACCION${reconducidos>1?'ES':''} MIGRATORIA${reconducidos>1?'S':''} RECONDUCIDA${reconducidos>1?'S':''}`)
    if (denunciados)  partes.push(`${denunciados} INFRACCION${denunciados>1?'ES':''} MIGRATORIA${denunciados>1?'S':''} DENUNCIADA${denunciados>1?'S':''}`)
  }
  if (grupos.nna_irregular) partes.push(`${grupos.nna_irregular.length} NNA EN SITUACION IRREGULAR`)
  const pm = puntosMap || {}
  const puntosProc = [...new Set(personas.filter(p=>p.punto_id).map(p=>pm[p.punto_id]||'Punto desconocido'))]
  if (puntosProc.length) partes.push(`PROCEDIMIENTO EN: ${puntosProc.join(', ')}`)
  let texto = partes.join('. ')
  if (obsServicio) texto += (texto?'. ':'')+obsServicio
  return texto || 'SIN NOVEDAD.'
}
