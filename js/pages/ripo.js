// ============================================================
// SISTEMA CSF OPERATIVA — ripo.js  v1.1
// CORRECCIONES v1.1:
//   FIX-C07 — Eliminada semanaDelAnio() local (algoritmo incorrecto).
//              Ahora usa semanaISO() definida en core.js (ISO 8601 correcto).
//   FIX-D03 — Eliminado MESES_RIPO duplicado.
//              Ahora usa MESES_ES[m-1] definido en core.js.
// ============================================================

// FIX-D03: MESES_RIPO ELIMINADO — se usa MESES_ES[m-1] de core.js
// FIX-C07: semanaDelAnio() ELIMINADA — se usa semanaISO() de core.js

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

// FIX-C07: semanaDelAnio() ELIMINADA.
// Reemplazada por semanaISO() de core.js (ISO 8601, semana comienza el lunes).
// Todos los usos de semanaDelAnio(fecha) ahora son semanaISO(fecha).

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
    { data: visitas }, { data: personas }, { data: entrevistas },
    { data: rescates }, { data: capacitaciones }, { data: puntos }, { data: cuarteles },
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

  const wb = XLSX.utils.book_new()

  estado.innerHTML = '<div class="cargando">Generando hoja Pat. Soberanía...</div>'
  XLSX.utils.book_append_sheet(wb, generarHojaPatrullaje(svcs, visitas, personas, 'soberania'), 'Pat. Soberanía')

  estado.innerHTML = '<div class="cargando">Generando hoja Pat. Hitos...</div>'
  XLSX.utils.book_append_sheet(wb, generarHojaPatrullaje(svcs, visitas, personas, 'hitos'), 'Pat. Hitos')

  for (const tipo of ['hito', 'pnh', 'sie']) {
    estado.innerHTML = `<div class="cargando">Generando hoja ${tipo.toUpperCase()}...</div>`
    const nombre = tipo === 'hito' ? 'HITOS' : tipo === 'pnh' ? 'PNH' : 'SFI'
    XLSX.utils.book_append_sheet(wb, generarHojaFrecuencia(puntos, visitas, tipo, anio), nombre)
  }

  estado.innerHTML = '<div class="cargando">Generando hoja Entrevistas...</div>'
  XLSX.utils.book_append_sheet(wb, generarHojaEntrevistas(svcs, entrevistas, svcMap), 'Entrevistas')

  estado.innerHTML = '<div class="cargando">Generando hoja Capacitaciones...</div>'
  XLSX.utils.book_append_sheet(wb, generarHojaCapacitaciones(capacitaciones), 'Capacitaciones')

  estado.innerHTML = '<div class="cargando">Generando hoja Rescate...</div>'
  XLSX.utils.book_append_sheet(wb, generarHojaRescate(svcs, rescates, svcMap), 'Rescate')

  // FIX-D03: usar MESES_ES[mes-1] en lugar de MESES_RIPO[mes]
  const nomCuartel = cuartelId
    ? (cuarteles?.find(c=>c.id===cuartelId)?.nombre?.replace(' (F)','').replace(/\s+/g,'_') || 'CUARTEL')
    : 'TODOS'
  const fname = `RIPO_${nomCuartel}_${MESES_ES[mes-1].toUpperCase()}_${anio}.xlsx`
  XLSX.writeFile(wb, fname)
  estado.innerHTML = `<div class="card" style="padding:1rem;color:var(--verde);font-weight:600">✅ RIPO generado: ${fname}</div>`
  toast('RIPO descargado correctamente', 'ok')
}

function generarHojaPatrullaje(svcs, visitas, personas, modo) {
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
    'KM MOTORIZADO','KM MONTADO','KM INFANTERIA','KM VEH. MARITIMO',
    'CANTIDAD SIF FISCALIZADOS','NOMBRES SIF VISITADOS',
    'CANTIDAD PNH FISCALIZADOS','NOMBRES PNH FISCALIZADOS',
    'GPS','VISORES NOCTURNOS','BINOCULARES','EQUIPO DE MONTAÑA','MALLA DE CAMUFLAJE',
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

    const obs = generarObservaciones(personas_svc, svc.observaciones)
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
      1,1,1,1,1, obs
    ])
  })

  return XLSX.utils.aoa_to_sheet(rows)
}

// FIX-C07: semanaISO() de core.js reemplaza a semanaDelAnio() local
function generarHojaFrecuencia(puntos, visitas, tipo, anio) {
  const puntosTipo = (puntos||[]).filter(p => p.tipo === tipo)

  const semanasPorPunto = {}
  ;(visitas||[]).forEach(v => {
    if (v.punto?.tipo !== tipo) return
    const semana = semanaISO(v.fecha)   // FIX-C07: semanaISO de core.js
    if (!semanasPorPunto[v.punto_id]) semanasPorPunto[v.punto_id] = new Set()
    semanasPorPunto[v.punto_id].add(semana)
  })

  const FVC_ANUAL = {
    'diario':365,'2x_semana':104,'semanal':52,
    'quincenal':26,'mensual':12,'bimestral':6,'trimestral':4,'semestral':2,
  }

  const semHeaders = Array.from({length:52},(_,i)=>`S${i+1}`)
  const headerBase = [
    'PREFECTURA','CUARTEL (F)','NUMERO PUNTO','NOMBRE PUNTO','PAÍS LIMITROFE',
    'TIEMPO VERIFICACION (min)','TIEMPO TRASLADO (min)','TOTAL MIN','TOTAL HORAS',
    'FRECUENCIA ANUAL','CANTIDAD VERIFICACION ANUAL',
    ...semHeaders
  ]
  const rows = [headerBase]

  puntosTipo.forEach(p => {
    const semVisitadas = semanasPorPunto[p.id] || new Set()
    const fvcAnual     = FVC_ANUAL[p.fvc_base] || 12
    const tiempoVerif  = p.tiempo_verificacion || 60
    const tiempoTrasl  = p.tiempo_traslado || 60
    const totalMin     = tiempoVerif + tiempoTrasl
    const totalHoras   = (totalMin/60).toFixed(2)
    const semanas      = Array.from({length:52},(_,i) => semVisitadas.has(i+1) ? 1 : 0)

    rows.push([
      p.cuartel?.prefectura || 'ARICA N° 1',
      p.cuartel?.nombre || '',
      p.nombre, p.nombre_completo || p.nombre,
      p.pais_limitrofe || '',
      tiempoVerif, tiempoTrasl, totalMin, totalHoras,
      CSF_CONFIG.FVC_LABELS[p.fvc_base]||p.fvc_base, fvcAnual,
      ...semanas
    ])
  })

  return XLSX.utils.aoa_to_sheet(rows)
}

function generarHojaEntrevistas(svcs, entrevistas, svcMap) {
  const headers = ['NRO','PREFECTURA','CUARTEL','FECHA','HORA','PUNTO TERRITORIAL','TIPO ENTREVISTADO','NOMBRE','INFORMACION RELEVANTE']
  const rows = [headers]
  ;(entrevistas||[]).forEach((e,i) => {
    const svc = svcMap[e.servicio_id] || {}
    rows.push([i+1,'ARICA N° 1',svc.cuartel?.nombre||'',svc.fecha||'',svc.hora_inicio||'',e.punto?.nombre||'',e.tipo_entrevistado||'',e.nombre_entrevistado||'',e.informacion_relevante||''])
  })
  if (rows.length===1) rows.push(['','Sin entrevistas registradas en el período','','','','','','',''])
  return XLSX.utils.aoa_to_sheet(rows)
}

function generarHojaCapacitaciones(capacitaciones) {
  const headers = ['NRO','PREFECTURA','CUARTEL','FECHA INICIO','FECHA TERMINO','NOMBRE CURSO','TIPO','HORAS','PARTICIPANTES']
  const rows = [headers]
  ;(capacitaciones||[]).forEach((c,i) => {
    rows.push([i+1,'ARICA N° 1',c.cuartel?.nombre||'',c.fecha_inicio||'',c.fecha_termino||'',c.nombre_curso||'',c.tipo_capacitacion||'',c.horas||0,c.cantidad_participantes||0])
  })
  if (rows.length===1) rows.push(['','Sin capacitaciones registradas en el período','','','','','','',''])
  return XLSX.utils.aoa_to_sheet(rows)
}

function generarHojaRescate(svcs, rescates, svcMap) {
  const headers = ['NRO','PREFECTURA','CUARTEL','FECHA','TIPO RESCATE','PERSONAS RESCATADAS','DESCRIPCION','LUGAR','OBSERVACIONES']
  const rows = [headers]
  ;(rescates||[]).forEach((r,i) => {
    const svc = svcMap[r.servicio_id] || {}
    rows.push([i+1,'ARICA N° 1',svc.cuartel?.nombre||'',svc.fecha||'',r.tipo_rescate||'',r.cantidad_personas||0,r.descripcion||'',r.lugar||'',r.observaciones||''])
  })
  if (rows.length===1) rows.push(['','Sin rescates registrados en el período','','','','','','',''])
  return XLSX.utils.aoa_to_sheet(rows)
}

function generarObservaciones(personas, obsServicio) {
  if (!personas?.length && !obsServicio) return 'SIN NOVEDAD.'
  const grupos = {}
  ;(personas||[]).forEach(p => {
    if (!grupos[p.tipo_resultado]) grupos[p.tipo_resultado] = []
    grupos[p.tipo_resultado].push(p)
  })
  const partes = []
  if (grupos.detencion) partes.push(`${grupos.detencion.length} DETENIDO${grupos.detencion.length>1?'S':''}`)
  if (grupos.infraccion_migratoria) {
    const reconducidos = grupos.infraccion_migratoria.filter(p=>p.gestion_migratoria==='reconducido').length
    const denunciados  = grupos.infraccion_migratoria.filter(p=>p.gestion_migratoria!=='reconducido').length
    if (reconducidos) partes.push(`${reconducidos} INFRACCION${reconducidos>1?'ES':''} MIGRATORIA${reconducidos>1?'S':''} RECONDUCIDA${reconducidos>1?'S':''}`)
    if (denunciados)  partes.push(`${denunciados} INFRACCION${denunciados>1?'ES':''} MIGRATORIA${denunciados>1?'S':''} DENUNCIADA${denunciados>1?'S':''}`)
  }
  if (grupos.nna_irregular) partes.push(`${grupos.nna_irregular.length} NNA EN SITUACION IRREGULAR`)
  const puntosProc = [...new Set(personas.filter(p=>p.punto_id).map(p=>p.punto?.nombre||p.punto_id))]
  if (puntosProc.length) partes.push(`PROCEDIMIENTO EN: ${puntosProc.join(', ')}`)
  let texto = partes.join('. ')
  if (obsServicio) texto += (texto?'. ':'')+obsServicio
  return texto || 'SIN NOVEDAD.'
}
