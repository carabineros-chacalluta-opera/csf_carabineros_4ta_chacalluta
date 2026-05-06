// ============================================================
// SISTEMA CSF OPERATIVA — csf.js  v3.0
// NUEVAS v3.0:
//   F1  — Flujo: Borrador → En Revisión → Aprobada → Publicada
//   F2  — Rol validador (Subprefecto): vista exclusiva CSF en revisión
//   F3  — Pie de firma con imagen + nombre/grado/cargo centrado
//   F4  — Generación masiva para todos los cuarteles (Admin/Comisario)
//   F5  — Validación masiva con firma única (Validador)
//   F6  — Editor de horarios antes de aprobar (Validador)
//   F7  — Pregunta cuartel a cuartel si ya existe CSF para ese mes
// ============================================================

let _csfTab       = 'generar'
let _csfDatos     = null
let _csfMasivaIdx = 0   // índice cuartel procesando en generación masiva

async function renderCSF() {
  const esValidador = APP.perfil?.rol === 'validador'

  if (esValidador) {
    // Validador solo ve su pantalla de revisión
    el('pantalla-csf').innerHTML = `
      <div class="container">
        <div class="tabs-bar">
          ${tabBtn('revision', '🔍 CSF en Revisión')}
          ${tabBtn('historial', '📁 Historial')}
        </div>
        <div id="csf-contenido"><div class="cargando">Cargando...</div></div>
      </div>`
    await cambiarTabCSF('revision')
    return
  }

  const puedeVerTodos = APP.esAdministrador() || APP.esComisario()
  el('pantalla-csf').innerHTML = `
    <div class="container">
      <div class="tabs-bar">
        ${tabBtn('generar',      '📄 Generar CSF')}
        ${puedeVerTodos ? tabBtn('masiva', '🏢 Generación masiva') : ''}
        ${tabBtn('seguimiento',  '📊 Seguimiento')}
        ${tabBtn('revision',     '🔍 En revisión')}
        ${tabBtn('historial',    '📁 Historial')}
      </div>
      <div id="csf-contenido"><div class="cargando">Cargando...</div></div>
    </div>`
  await cambiarTabCSF('generar')
}

function tabBtn(tab, label) {
  const act = _csfTab === tab
  return `<button class="tab-btn ${act?'tab-activo':''}" data-tab="${tab}" onclick="cambiarTabCSF('${tab}')">${label}</button>`
}

async function cambiarTabCSF(tab) {
  _csfTab = tab
  qsa('.tab-btn').forEach(b => b.classList.toggle('tab-activo', b.dataset.tab === tab))
  if (tab === 'generar')     await renderGenerador()
  if (tab === 'seguimiento') await renderSeguimiento()
  if (tab === 'historial')   await renderHistorial()
  if (tab === 'revision')    await renderTabRevision()
  if (tab === 'masiva')      await renderTabMasiva()
}

// ── TAB GENERAR ──────────────────────────────────────────────
async function renderGenerador() {
  const zona = el('csf-contenido')
  const hoy  = new Date()
  const anio = hoy.getFullYear()
  const anios = [anio - 1, anio, anio + 1]

  const opcionesAnio = () => anios.map(a =>
    `<option value="${a}" ${a === anio ? 'selected' : ''}>${a}</option>`
  ).join('')

  const mesSel = (idSel, mesDefault) => MESES_ES.map((m, i) =>
    `<option value="${i+1}" ${i+1 === mesDefault ? 'selected' : ''}>${m}</option>`
  ).join('')

  // Por defecto: referencia = mes actual - 2, vigencia = mes actual
  const mesRef = ((hoy.getMonth() + 1) - 2 + 12) % 12 || 12
  const mesVig = hoy.getMonth() + 1

  zona.innerHTML = `
    <div class="card gap3" style="margin-bottom:1rem">
      <div class="sec-titulo">Parámetros de la CSF</div>
      <div class="g3">

        <div class="campo">
          <label>Mes de referencia <span style="font-size:.7rem;color:var(--muted)">(datos a analizar)</span></label>
          <div style="display:flex;gap:.5rem;align-items:center">
            <select id="csf-ref-mes" style="flex:1">${mesSel('ref', mesRef)}</select>
            <select id="csf-ref-anio" style="width:90px">${opcionesAnio()}</select>
          </div>
          <div style="font-size:.7rem;color:var(--muted);margin-top:.25rem">Mes cuyos datos se usarán para calcular criticidad</div>
        </div>

        <div class="campo">
          <label>Mes de vigencia <span style="font-size:.7rem;color:var(--muted)">(mes que rige la CSF)</span></label>
          <div style="display:flex;gap:.5rem;align-items:center">
            <select id="csf-vig-mes" style="flex:1">${mesSel('vig', mesVig)}</select>
            <select id="csf-vig-anio" style="width:90px">${opcionesAnio()}</select>
          </div>
          <div style="font-size:.7rem;color:var(--muted);margin-top:.25rem">Mes para el cual regirá esta carta</div>
        </div>

        <div class="campo">
          <label>Clasificación</label>
          <select id="csf-clasif">
            <option value="RESERVADO">RESERVADO</option>
            <option value="SECRETO">SECRETO</option>
          </select>
        </div>

      </div>
      ${(APP.esComisario() || APP.esAdministrador()) ? `
      <button class="btn btn-primario" onclick="generarBorradorCSF()">
        ⚙ Generar borrador automático
      </button>` : `<div style="font-size:.8rem;color:var(--muted)">Sin permisos para generar la CSF.</div>`}
    </div>
    <div id="csf-borrador"></div>`
}

// ── V2: Distribución equilibrada de visitas por día ───────────
// Recibe los puntos procesados + período de vigencia
// Devuelve array de { fecha, punto, hora_inicio, hora_termino, turno, nroGlobal }
// con la menor cantidad posible de puntos por día
function distribuirVisitasEquilibradas(puntosProcesados, iniVig, finVig) {
  const inicio = new Date(iniVig + 'T12:00:00')
  const fin    = new Date(finVig + 'T12:00:00')

  // Generar todos los días del período
  const diasPeriodo = []
  const cur = new Date(inicio)
  while (cur <= fin) {
    diasPeriodo.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  const totalDias = diasPeriodo.length

  // Para cada punto calcular en qué días debe ser visitado según su FVC
  // usando distribución uniforme (evitar acumular en el mismo día)
  const todasVisitas = []

  // Mapa día → cuántas visitas ya tiene asignadas
  const cargaPorDia = {}
  diasPeriodo.forEach(d => { cargaPorDia[d] = 0 })

  // V4: cargar visitas ya ejecutadas del año (para saber qué está pendiente)
  // Esto se maneja en generarBorradorCSF antes de llamar esta función

  for (const p of puntosProcesados) {
    const fvc      = p.fvcFinal
    const visitasP = calcularFechasDistribuidas(fvc, diasPeriodo, cargaPorDia, p.pendienteAnual)

    visitasP.forEach(fecha => {
      todasVisitas.push({
        fecha,
        punto:        p,
        hora_inicio:  p.horaIni,
        hora_termino: p.horaFin,
        turno:        p.turno,
      })
      cargaPorDia[fecha] = (cargaPorDia[fecha] || 0) + 1
    })
  }

  // Ordenar por fecha y asignar número global
  todasVisitas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
  todasVisitas.forEach((v, i) => { v.nroGlobal = i + 1 })

  return todasVisitas
}

// Calcula fechas distribuidas uniformemente para una FVC dada
// evitando días ya muy cargados
function calcularFechasDistribuidas(fvc, diasPeriodo, cargaPorDia, pendienteAnual) {
  const totalDias = diasPeriodo.length
  const fechas    = []

  // Cuántas visitas corresponden en este período según FVC
  let nVisitas = 1
  if (fvc === 'diario')     nVisitas = totalDias
  else if (fvc === '2x_semana') nVisitas = Math.round(totalDias / 3.5)
  else if (fvc === 'semanal')   nVisitas = Math.ceil(totalDias / 7)
  else if (fvc === 'quincenal') nVisitas = Math.ceil(totalDias / 15)
  else if (fvc === 'mensual')   nVisitas = 1
  else if (fvc === 'bimestral') nVisitas = pendienteAnual ? 1 : 0
  else if (fvc === 'trimestral') nVisitas = pendienteAnual ? 1 : 0
  else if (fvc === 'semestral')  nVisitas = pendienteAnual ? 1 : 0

  if (nVisitas <= 0) return []

  if (nVisitas >= totalDias) {
    // Diario: un día por visita
    return diasPeriodo.slice(0, nVisitas)
  }

  // Distribuir uniformemente: intervalos iguales entre visitas
  const intervalo = totalDias / nVisitas
  for (let i = 0; i < nVisitas; i++) {
    // Posición ideal
    const posIdeal = Math.floor(i * intervalo + intervalo / 2)
    // Buscar el día menos cargado en un rango ±3 días alrededor de posIdeal
    let mejorDia  = diasPeriodo[Math.min(posIdeal, diasPeriodo.length - 1)]
    let menorCarga = Infinity
    const rango = 3
    for (let offset = -rango; offset <= rango; offset++) {
      const idx = posIdeal + offset
      if (idx < 0 || idx >= diasPeriodo.length) continue
      const dia   = diasPeriodo[idx]
      const carga = cargaPorDia[dia] || 0
      if (carga < menorCarga) {
        menorCarga = carga
        mejorDia   = dia
      }
    }
    if (!fechas.includes(mejorDia)) fechas.push(mejorDia)
  }

  return fechas
}

// ── V3: Cumplimiento por semana ISO ───────────────────────────
// Devuelve { periodosCumplidos, periodosTotal, pct, detalle[] }
function calcularCumplimientoISO(punto, visitasEjecutadas, iniVig, finVig, fvc) {
  const inicio = new Date(iniVig + 'T12:00:00')
  const fin    = new Date(finVig + 'T12:00:00')

  // Obtener visitas ejecutadas para este punto en el período
  const visitasPunto = visitasEjecutadas.filter(v =>
    v.punto_id === punto.id &&
    v.fecha >= iniVig && v.fecha <= finVig
  )

  if (fvc === 'semanal') {
    // Agrupar por semana ISO
    const semanasConVisita = new Set(visitasPunto.map(v => semanaISO(v.fecha)))
    // Semanas ISO del período
    const todasSemanas = new Set()
    const cur = new Date(inicio)
    while (cur <= fin) {
      todasSemanas.add(semanaISO(cur.toISOString().split('T')[0]))
      cur.setDate(cur.getDate() + 7)
    }
    const total    = todasSemanas.size
    const cumplidos = [...todasSemanas].filter(s => semanasConVisita.has(s)).length
    return { periodosCumplidos: cumplidos, periodosTotal: total, pct: total > 0 ? Math.round(cumplidos/total*100) : 0 }

  } else if (fvc === 'quincenal') {
    // Quincena 1: días 1-15, Quincena 2: días 16-fin
    const q1 = visitasPunto.some(v => parseInt(v.fecha.split('-')[2]) <= 15)
    const q2 = visitasPunto.some(v => parseInt(v.fecha.split('-')[2]) > 15)
    const cumplidos = (q1 ? 1 : 0) + (q2 ? 1 : 0)
    return { periodosCumplidos: cumplidos, periodosTotal: 2, pct: Math.round(cumplidos/2*100) }

  } else {
    // mensual, bimestral, trimestral, semestral: 1 período
    const cumplido = visitasPunto.length > 0 ? 1 : 0
    return { periodosCumplidos: cumplido, periodosTotal: 1, pct: cumplido * 100 }
  }
}

// ── GENERAR BORRADOR ─────────────────────────────────────────
async function generarBorradorCSF() {
  const zona = el('csf-borrador')

  const cuartelActivo = APP.cuartelActivo()
  if (!cuartelActivo?.id) {
    zona.innerHTML = '<div class="card" style="color:var(--rojo);padding:1rem">⚠ Selecciona un cuartel en el selector antes de generar la CSF.</div>'
    return
  }

  const refMes  = parseInt(el('csf-ref-mes')?.value)
  const refAnio = parseInt(el('csf-ref-anio')?.value)
  const vigMes  = parseInt(el('csf-vig-mes')?.value)
  const vigAnio = parseInt(el('csf-vig-anio')?.value)

  if (!refMes || !refAnio || !vigMes || !vigAnio) {
    zona.innerHTML = '<div class="card" style="color:var(--rojo);padding:1rem">⚠ Selecciona los meses de referencia y vigencia.</div>'
    return
  }

  zona.innerHTML = '<div class="cargando">Calculando criticidad y distribución de visitas...</div>'

  const cuartelId = cuartelActivo.id
  const ref       = { mes: refMes, anio: refAnio }
  const mesVig    = { mes: vigMes, anio: vigAnio }

  const iniRef = `${ref.anio}-${String(ref.mes).padStart(2,'0')}-01`
  const finRef = new Date(ref.anio, ref.mes, 0).toISOString().split('T')[0]
  const iniVig = `${mesVig.anio}-${String(mesVig.mes).padStart(2,'0')}-01`
  const finVig = new Date(mesVig.anio, mesVig.mes, 0).toISOString().split('T')[0]

  // V4: período anual para detectar puntos pendientes
  const iniAnual = `${mesVig.anio}-01-01`

  const { data: puntos } = await APP.sb.from('puntos_territoriales')
    .select('*').eq('cuartel_id', cuartelId).eq('activo', true).order('tipo').order('nombre')

  const { data: svcsRef } = await APP.sb.from('servicios')
    .select('id').eq('cuartel_id', cuartelId)
    .gte('fecha', iniRef).lte('fecha', finRef)
  const svcIds = (svcsRef||[]).map(s => s.id)

  // V4: servicios del año completo para detectar pendientes
  const { data: svcsAnual } = await APP.sb.from('servicios')
    .select('id').eq('cuartel_id', cuartelId)
    .gte('fecha', iniAnual).lte('fecha', finVig)
  const svcIdsAnual = (svcsAnual||[]).map(s => s.id)

  let visitasRef=[], personasRef=[], incautRef=[], obsRef=[], visitasAnual=[]

  const promesas = [
    svcIds.length
      ? APP.sb.from('visitas_puntos').select('*').in('servicio_id', svcIds)
      : Promise.resolve({ data: [] }),
    svcIds.length
      ? APP.sb.from('personas_registradas').select('*,hora_evento').in('servicio_id', svcIds)
      : Promise.resolve({ data: [] }),
    svcIds.length
      ? APP.sb.from('incautaciones').select('*').in('servicio_id', svcIds)
      : Promise.resolve({ data: [] }),
    svcIds.length
      ? APP.sb.from('observaciones_intel').select('*').in('servicio_id', svcIds)
      : Promise.resolve({ data: [] }),
    // V4: visitas del año para detectar pendientes
    svcIdsAnual.length
      ? APP.sb.from('visitas_puntos').select('punto_id,fecha').in('servicio_id', svcIdsAnual)
      : Promise.resolve({ data: [] }),
  ]

  ;[
    { data: visitasRef },
    { data: personasRef },
    { data: incautRef },
    { data: obsRef },
    { data: visitasAnual },
  ] = await Promise.all(promesas)

  // V4: determinar qué puntos tienen visita pendiente en el año
  // Un punto bimestral/trimestral/semestral está pendiente si no fue visitado
  // en el intervalo requerido antes del mes de vigencia
  const umbralAnualDias = {
    'bimestral':  60,
    'trimestral': 90,
    'semestral':  180,
  }
  const hoyD = new Date(iniVig + 'T12:00:00')

  const visitasAnualPorPunto = {}
  ;(visitasAnual||[]).forEach(v => {
    if (!visitasAnualPorPunto[v.punto_id] || v.fecha > visitasAnualPorPunto[v.punto_id]) {
      visitasAnualPorPunto[v.punto_id] = v.fecha
    }
  })

  const puntosProcesados = (puntos||[]).map(p => {
    const visitasPunto  = (visitasRef||[]).filter(v => v.punto_id === p.id)
    const personasPunto = (personasRef||[]).filter(pr => pr.punto_id === p.id)
    const incautPunto   = (incautRef||[]).filter(i => i.punto_id === p.id)
    const obsPunto      = (obsRef||[]).filter(o => o.punto_id === p.id)

    // Criticidad
    const nivelesExcel = {
      trafico_migrantes: nivelDesdeDelito('trafico_migrantes', personasPunto.filter(pr=>pr.tipo_delito==='trafico_migrantes').length),
      ingreso_adulto:    nivelDesdeDelito('ingreso_adulto',    personasPunto.filter(pr=>pr.situacion_migratoria==='irregular'&&pr.grupo_etario==='adulto').length),
      ingreso_nna:       nivelDesdeDelito('ingreso_nna',       personasPunto.filter(pr=>pr.situacion_migratoria==='irregular'&&pr.grupo_etario==='nna').length),
      trafico_drogas:    nivelDesdeDelito('casos',             personasPunto.filter(pr=>pr.tipo_delito==='trafico_drogas').length),
      contrabando:       nivelDesdeDelito('casos',             incautPunto.filter(i=>['fardos_ropa','cigarrillos','fitozoosanitario'].includes(i.tipo_especie)).length),
      armas:             nivelDesdeDelito('casos',             personasPunto.filter(pr=>pr.tipo_delito==='ley_17798_armas').length),
      abigeato:          nivelDesdeDelito('casos',             personasPunto.filter(pr=>pr.tipo_delito==='abigeato').length),
    }
    const nivelExcel = Math.max(...Object.values(nivelesExcel), 1)

    const nObs              = obsPunto.length
    const tieneHallazgoAlto = obsPunto.some(o => o.nivel_relevancia === 'alto')
    const tieneDelitoCOT    = personasPunto.some(pr => CSF_CONFIG.DELITOS_COT.includes(pr.tipo_delito))
    let prob = 1
    if (nObs === 1) prob = 2
    else if (nObs === 2) prob = 3
    else if (nObs >= 3 || tieneHallazgoAlto) prob = 4
    if (tieneDelitoCOT) prob = Math.min(prob + 1, 5)

    const valEst = { 'bajo':1,'medio':2,'alto':3,'critico':4 }[p.valor_estrategico]||2
    let consec   = valEst
    if (tieneDelitoCOT) consec = Math.min(consec + 1, 5)

    const valorPxC   = prob * consec
    const nivelPxC   = nivelDesdeValorPxC(valorPxC)
    const nivelFinal = Math.max(nivelExcel, nivelPxC)
    const infoN      = infoNivel(nivelFinal)

    const fvcCriticidad = CSF_CONFIG.FVC_POR_NIVEL[nivelFinal]
    const fvcFinal      = maxFVC(p.fvc_base, fvcCriticidad)

    // CSF-HORARIO: calcular horario dinámico según historial de detenciones
    // Hitos: siempre diurno fijo (08:00–14:00)
    // PNH y SIE: ventana de 6 horas centrada en el peak de detenciones del período
    const personasConHora = personasPunto.filter(pr => pr.hora_evento)
    let turno   = 'diurno'
    let horaIni = '08:00'
    let horaFin = '14:00'

    if (p.tipo === 'hito') {
      // Hito: siempre diurno fijo, sin importar historial
      turno   = 'diurno'
      horaIni = '08:00'
      horaFin = '14:00'
    } else {
      // PNH / SIE: analizar peak de detenciones
      const MIN_REGISTROS = 3
      if (personasConHora.length >= MIN_REGISTROS) {
        // Contar cuántas detecciones hay por hora del día (0-23)
        const contPorHora = new Array(24).fill(0)
        personasConHora.forEach(pr => {
          const h = parseInt((pr.hora_evento || '00:00').split(':')[0])
          if (!isNaN(h)) contPorHora[h]++
        })
        // Sumar ventanas de 6 horas (circular) para encontrar el tramo con más actividad
        let mejorInicio = 0
        let mejorSuma   = -1
        for (let ini = 0; ini < 24; ini++) {
          let suma = 0
          for (let offset = 0; offset < 6; offset++) {
            suma += contPorHora[(ini + offset) % 24]
          }
          if (suma > mejorSuma) {
            mejorSuma   = suma
            mejorInicio = ini
          }
        }
        const horaIniN = mejorInicio
        const horaFinN = (mejorInicio + 6) % 24
        horaIni = `${String(horaIniN).padStart(2,'0')}:00`
        horaFin = `${String(horaFinN).padStart(2,'0')}:00`
        turno   = horaIniN >= 20 || horaIniN < 6 ? 'nocturno' : 'diurno'
      } else {
        // Sin datos suficientes: usar default nocturno para PNH/SIE (mayor riesgo en noche)
        turno   = 'nocturno'
        horaIni = '20:00'
        horaFin = '02:00'
      }
    }

    let observacion = ''
    if (nivelFinal >= 4) observacion = 'Actividad COT confirmada. Prioridad máxima VIE-DOM.'
    else if (nivelFinal === 3) observacion = 'Indicios de actividad en sector. Reforzar cobertura.'
    else if (nObs > 0) observacion = `${nObs} observación(es) registrada(s) en el período.`
    else observacion = 'Sin actividad detectada. Vigilancia de rutina.'

    // V4: ¿está pendiente en la vista anual?
    const umbral = umbralAnualDias[p.fvc_base]
    let pendienteAnual = false
    if (umbral) {
      const ultVisita = visitasAnualPorPunto[p.id]
      if (!ultVisita) {
        pendienteAnual = true
      } else {
        const diasSinVisita = Math.ceil((hoyD - new Date(ultVisita + 'T12:00:00')) / 86400000)
        pendienteAnual = diasSinVisita >= umbral
      }
    }

    return { ...p, nivelExcel, nivelPxC, nivelFinal, infoN, fvcFinal, turno, horaIni, horaFin, observacion, prob, consec, valorPxC, pendienteAnual, nObs }
  }).sort((a, b) => b.nivelFinal - a.nivelFinal || a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre))

  // Amenaza principal
  const cotDelitos = (personasRef||[]).filter(pr => CSF_CONFIG.DELITOS_COT.includes(pr.tipo_delito))
  const delitoDom  = cotDelitos.length > 0
    ? Object.entries(cotDelitos.reduce((acc,pr) => { acc[pr.tipo_delito]=(acc[pr.tipo_delito]||0)+1; return acc },{}))
            .sort((a,b) => b[1]-a[1])[0]
    : null
  const amenaza = delitoDom
    ? `${delitoDom[0].replace(/_/g,' ')} confirmado en el período (${delitoDom[1]} caso${delitoDom[1]>1?'s':''}). Mantener patrullaje reforzado.`
    : 'Sin actividad delictual confirmada en el período. Mantener vigilancia preventiva.'

  const clasif = el('csf-clasif')?.value || 'RESERVADO'
  const nroCsf = await siguienteNroCsf(cuartelId, mesVig)

  // V2: distribución equilibrada de visitas
  const puntosPorFecha = distribuirVisitasEquilibradas(puntosProcesados, iniVig, finVig)

  _csfDatos = { puntosProcesados, puntosPorFecha, amenaza, clasif, nroCsf, iniVig, finVig, mesVig, ref, cuartelId }
  zona.innerHTML = htmlBorrador(_csfDatos)
}

async function siguienteNroCsf(cuartelId, mesVig) {
  const { data } = await APP.sb.from('csf_mensual')
    .select('numero').eq('cuartel_id', cuartelId)
    .order('created_at', { ascending: false }).limit(1)
  if (!data?.length) return `CSF-001/${mesVig.anio}`
  const ultimo = data[0].numero?.match(/\d+/)?.[0] || 0
  return `CSF-${String(parseInt(ultimo)+1).padStart(3,'0')}/${mesVig.anio}`
}

// ── V5: Tabla criticidad: individuales ≥ nivel 2, agrupados nivel 1 ─
function htmlTablaCriticidad(puntosProcesados) {
  const elevados = puntosProcesados.filter(p => p.nivelFinal >= 2)
  const bajos    = puntosProcesados.filter(p => p.nivelFinal < 2)

  // Separar bajos por tipo
  const bajosPorTipo = {
    hito: bajos.filter(p => p.tipo === 'hito'),
    pnh:  bajos.filter(p => p.tipo === 'pnh'),
    sie:  bajos.filter(p => p.tipo === 'sie'),
  }
  const labelTipo = { hito: 'Hitos Fronterizos', pnh: 'Pasos No Habilitados', sie: 'Sitios de Interés Estratégico' }

  let nro = 1
  let filas = ''

  // Filas individuales para puntos elevados
  elevados.forEach((p, i) => {
    filas += `
      <tr style="background:${i%2===0?'#E2EFD9':'#fff'}">
        <td style="padding:.3rem .6rem;font-weight:700;text-align:center">${String(nro++).padStart(2,'0')}</td>
        <td style="padding:.3rem .6rem;font-weight:600">${p.nombre}</td>
        <td style="padding:.3rem .6rem">
          <span style="font-size:.63rem;font-weight:700;padding:1px 5px;border-radius:3px;
            background:${p.tipo==='hito'?'#e8f0fe':p.tipo==='pnh'?'#fdecea':'#e8f5ea'};
            color:${p.tipo==='hito'?'#0055d4':p.tipo==='pnh'?'#C0392B':'#1A843F'}">
            ${p.tipo.toUpperCase()}
          </span>
        </td>
        <td style="padding:.3rem .6rem;font-size:.68rem">${CSF_CONFIG.FVC_LABELS[p.fvcFinal]||p.fvcFinal}</td>
        <td style="padding:.3rem .6rem;font-weight:700;color:${p.infoN.color}">${p.infoN.texto}</td>
        <td style="padding:.3rem .6rem;font-weight:700;color:${p.infoN.color}">${p.infoN.probabilidad}</td>
        <td style="padding:.3rem .6rem;font-size:.68rem">${p.observacion}</td>
      </tr>`
  })

  // Separador si hay elevados y bajos
  if (elevados.length > 0 && bajos.length > 0) {
    filas += `
      <tr>
        <td colspan="7" style="padding:.25rem .6rem;background:#f5f5f7;font-size:.65rem;
            font-weight:700;color:#666;letter-spacing:.05em;text-transform:uppercase">
          Puntos en nivel BAJO — Vigilancia de rutina
        </td>
      </tr>`
  }

  // Filas agrupadas por tipo para los bajos
  Object.entries(bajosPorTipo).forEach(([tipo, lista]) => {
    if (!lista.length) return
    filas += `
      <tr style="background:#f9fdf9">
        <td style="padding:.3rem .6rem;font-weight:700;text-align:center;color:#1A843F">${String(nro++).padStart(2,'0')}</td>
        <td style="padding:.3rem .6rem;font-weight:600;color:#1A843F" colspan="2">
          ${lista.length} ${labelTipo[tipo]}
        </td>
        <td style="padding:.3rem .6rem;font-size:.68rem;color:var(--muted)">
          ${[...new Set(lista.map(p => CSF_CONFIG.FVC_LABELS[p.fvcFinal]||p.fvcFinal))].join(' / ')}
        </td>
        <td style="padding:.3rem .6rem;font-weight:700;color:#1A843F">BAJO</td>
        <td style="padding:.3rem .6rem;font-weight:700;color:#1A843F">BAJA</td>
        <td style="padding:.3rem .6rem;font-size:.68rem;color:var(--muted)">Sin actividad detectada. Vigilancia de rutina.</td>
      </tr>`
  })

  return `
    <table style="width:100%;border-collapse:collapse;font-size:.72rem">
      <thead>
        <tr style="background:#04742C;color:#fff">
          <th style="padding:.35rem .5rem;text-align:center;width:40px">N°</th>
          <th style="padding:.35rem .5rem;text-align:left">Nombre</th>
          <th style="padding:.35rem .5rem;text-align:left;width:55px">Tipo</th>
          <th style="padding:.35rem .5rem;text-align:left;width:110px">FVC Asignada</th>
          <th style="padding:.35rem .5rem;text-align:left;width:110px">Criticidad</th>
          <th style="padding:.35rem .5rem;text-align:left;width:80px">Probabilidad</th>
          <th style="padding:.35rem .5rem;text-align:left">Observación</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`
}

function htmlBorrador(d) {
  const { puntosProcesados, puntosPorFecha, amenaza, clasif, nroCsf, iniVig, finVig, mesVig } = d

  // Resumen de puntos pendientes anuales
  const pendientesAnuales = puntosProcesados.filter(p => p.pendienteAnual)

  return `
  <div id="csf-print-area">
  <div class="card" style="border:2px solid var(--verde);padding:0;overflow:hidden;margin-bottom:1rem">
    <div style="background:#04742C;color:#fff;padding:.65rem 1rem;font-size:.85rem;font-weight:700;letter-spacing:.3px">
      CARTA DE SITUACIÓN FRONTERIZA — DEMANDA PREVENTIVA
    </div>
    <div style="display:grid;grid-template-columns:auto 1fr auto 1fr auto 1fr;background:#CCE3D3;font-size:.72rem;border-bottom:1px solid #aac">
      ${metaCelda('NRO. CSF:', nroCsf)}
      ${metaCelda('CLASIFICACIÓN:', `<strong style="color:#C0392B">${clasif}</strong>`)}
      ${metaCelda('EMISIÓN:', formatFechaCorta(hoyISO()))}
    </div>
    <div style="display:grid;grid-template-columns:auto 1fr auto 1fr;background:#CCE3D3;font-size:.72rem;border-bottom:1px solid #aac">
      ${metaCelda('SECTOR:', APP.cuartelActivo()?.nombre||'')}
      ${metaCelda('VIGENCIA:', `01-${String(mesVig.mes).padStart(2,'0')}-${mesVig.anio} al ${formatFechaCorta(finVig)} (30 días)`)}
    </div>

    ${pendientesAnuales.length ? `
    <div style="background:#FFF3CD;border-bottom:1px solid #F0C040;padding:.4rem .85rem;font-size:.72rem">
      <strong>⚠ Puntos con visita pendiente (rezago anual):</strong>
      ${pendientesAnuales.map(p => `<span style="background:#fff;border:1px solid #ddd;border-radius:3px;padding:1px 5px;margin-left:4px;font-size:.65rem">${p.nombre} (${CSF_CONFIG.FVC_LABELS[p.fvc_base]})</span>`).join('')}
    </div>` : ''}

    <div style="background:#1A843F;color:#fff;padding:.4rem .85rem;font-size:.74rem;font-weight:700">
      I. NIVELES DE CRITICIDAD POR SECTOR
    </div>
    ${htmlTablaCriticidad(puntosProcesados)}

    <div style="background:#1A843F;color:#fff;padding:.4rem .85rem;font-size:.74rem;font-weight:700">
      II. ANÁLISIS DE AMENAZA
    </div>
    <div style="background:#E2EFD9;padding:.65rem .85rem">
      <div style="display:grid;grid-template-columns:130px 130px 1fr;gap:.5rem;font-size:.72rem">
        <div style="font-weight:700">AMENAZA PRINCIPAL</div>
        <div style="font-weight:700;color:${infoNivel(Math.max(...puntosProcesados.map(p=>p.nivelFinal),1)).color}">
          ${infoNivel(Math.max(...puntosProcesados.map(p=>p.nivelFinal),1)).texto}
        </div>
        <div>${amenaza}</div>
      </div>
    </div>

    <div style="background:#1A843F;color:#fff;padding:.4rem .85rem;font-size:.74rem;font-weight:700">
      III. LUGARES A PATRULLAR (O.G. 3020)
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:.7rem">
      <thead>
        <tr style="background:#04742C;color:#fff">
          <th style="padding:.35rem .5rem;width:35px;text-align:center">N°</th>
          <th style="padding:.35rem .5rem">Nombre</th>
          <th style="padding:.35rem .5rem;width:55px">Tipo</th>
          <th style="padding:.35rem .5rem;width:95px">Latitud</th>
          <th style="padding:.35rem .5rem;width:95px">Longitud</th>
          <th style="padding:.35rem .5rem;width:180px">Fecha</th>
          <th style="padding:.35rem .5rem;width:120px">Horario</th>
        </tr>
      </thead>
      <tbody>
        ${puntosPorFecha.map((v, i) => `
          <tr style="background:${i%2===0?'#E8F5EC':'#fff'}">
            <td style="padding:.3rem .5rem;font-weight:700;text-align:center">${String(v.nroGlobal).padStart(2,'0')}</td>
            <td style="padding:.3rem .5rem;font-weight:600">${v.punto.nombre}</td>
            <td style="padding:.3rem .5rem">
              <span style="font-size:.62rem;font-weight:700;padding:1px 4px;border-radius:3px;
                background:${v.punto.tipo==='hito'?'#e8f0fe':v.punto.tipo==='pnh'?'#fdecea':'#e8f5ea'};
                color:${v.punto.tipo==='hito'?'#0055d4':v.punto.tipo==='pnh'?'#C0392B':'#1A843F'}">
                ${v.punto.tipo.toUpperCase()}
              </span>
            </td>
            <td style="padding:.3rem .5rem;font-family:monospace;font-size:.63rem">${v.punto.latitud ? formatCoord(v.punto.latitud, false) : '—'}</td>
            <td style="padding:.3rem .5rem;font-family:monospace;font-size:.63rem">${v.punto.longitud ? formatCoord(v.punto.longitud, true) : '—'}</td>
            <td style="padding:.3rem .5rem;font-weight:500">${formatFecha(v.fecha)}</td>
            <td style="padding:.3rem .5rem">${v.hora_inicio} – ${v.hora_termino} hrs</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <div style="background:#1A843F;color:#fff;padding:.4rem .85rem;font-size:.74rem;font-weight:700">
      IV. INSTRUCCIONES GENERALES DEL SERVICIO
    </div>
    <div style="background:#F0F9F3;padding:.75rem .85rem;font-size:.72rem;line-height:1.6">
      <strong>A.</strong> El personal en servicio fronterizo debe portar permanentemente: GPS, teléfono satelital, arma primaria y secundaria, binoculares/visor nocturno, chaleco balístico obligatorio, sistema fotográfico, equipo radial portátil y carta topográfica.<br>
      <strong>B.</strong> En todo procedimiento el personal policial debe garantizar medidas de seguridad de Técnicas en Zonas Fronterizas respecto a los individuos controlados.<br>
      <strong>C.</strong> El Jefe de Patrulla es responsable de documentar el cumplimiento de los lineamientos de la presente CSF.<br>
      <strong>D.</strong> En ninguna circunstancia se permitirá que el personal policial cruce el Límite Político Internacional de la República de Chile.
    </div>

    <div style="background:#1A843F;color:#fff;padding:.4rem .85rem;font-size:.74rem;font-weight:700">
      V. FIRMAS Y VALIDACIÓN
    </div>
    <div id="csf-seccion-firmas" style="display:grid;grid-template-columns:1fr 1fr;min-height:80px">
      <div style="border-right:1px solid #ddd;padding:.85rem;text-align:center">
        <div style="font-size:.65rem;color:var(--muted);margin-bottom:.25rem">Elaborado por</div>
        <div style="height:40px"></div>
        <div style="font-size:.7rem;font-weight:700;border-top:1px solid #000;padding-top:.25rem;margin-top:.25rem">
          ${APP.cuartelActivo()?.nombre || 'Comisaría'}
        </div>
        <div style="font-size:.65rem;color:var(--muted)">Comisario · Elaborador</div>
      </div>
      <div id="csf-bloque-firma-validador" style="padding:.85rem;text-align:center">
        <div style="font-size:.65rem;color:var(--muted);margin-bottom:.25rem">Aprobado por</div>
        <div style="height:40px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:.7rem">
          Pendiente de validación
        </div>
        <div style="font-size:.7rem;font-weight:700;border-top:1px solid #ccc;padding-top:.25rem;margin-top:.25rem;color:var(--muted)">
          Subprefecto Fronterizo
        </div>
        <div style="font-size:.65rem;color:var(--muted)">Autorización</div>
      </div>
    </div>
  </div>
  </div>

  <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1rem">
    <button class="btn btn-primario" onclick="enviarCSFRevision()">
      📤 Enviar a revisión
    </button>
    <button class="btn btn-secundario" onclick="exportarCSFPDF()">↓ Imprimir / Exportar PDF</button>
    <div style="font-size:.72rem;color:var(--muted);align-self:center">
      ${puntosPorFecha.length} visitas distribuidas · ${puntosProcesados.length} puntos ·
      ${puntosProcesados.filter(p=>p.nivelFinal>=2).length} con nivel elevado ·
      ${pendientesAnuales.length} pendientes anuales
    </div>
  </div>`
}

function metaCelda(label, valor) {
  return `
    <div style="padding:.3rem .6rem;border-right:1px solid #aac">
      <div style="font-size:.6rem;font-weight:700;color:#555;text-transform:uppercase">${label}</div>
      <div style="font-size:.72rem;font-weight:600">${valor}</div>
    </div>`
}

function formatCoord(decimal, esLon) {
  const abs = Math.abs(decimal)
  const g   = Math.floor(abs)
  const m   = Math.floor((abs - g) * 60)
  const s   = Math.round(((abs - g) * 60 - m) * 60)
  const hem = esLon ? (decimal >= 0 ? 'E' : 'W') : (decimal >= 0 ? 'N' : 'S')
  return `${g}°${String(m).padStart(2,'0')}'${String(s).padStart(2,'0')}"${hem}`
}

// B3: Exportar PDF — con pie de firma actualizado desde BD
async function exportarCSFPDF() {
  const printArea = el('csf-print-area')
  if (!printArea) { toast('Genere primero el borrador', 'err'); return }

  // Obtener datos de firma desde BD si la CSF ya fue aprobada
  let htmlFirmaValidador = null
  if (_csfDatos?.cuartelId && _csfDatos?.mesVig) {
    try {
      const { data: csfBD } = await APP.sb.from('csf_mensual')
        .select('firma_nombre,firma_grado,firma_cargo,firma_imagen_url,estado')
        .eq('cuartel_id', _csfDatos.cuartelId)
        .eq('mes_vigencia', _csfDatos.mesVig.mes)
        .eq('anio_vigencia', _csfDatos.mesVig.anio)
        .in('estado', ['aprobada','publicada'])
        .limit(1)
      const f = csfBD?.[0]
      if (f?.firma_nombre) {
        htmlFirmaValidador = `
          <div style="padding:.85rem;text-align:center">
            <div style="font-size:.65rem;color:#666;margin-bottom:.25rem">Aprobado por</div>
            ${f.firma_imagen_url
              ? `<img src="${f.firma_imagen_url}" style="height:55px;max-width:180px;object-fit:contain;display:block;margin:0 auto .3rem"/>`
              : '<div style="height:55px"></div>'}
            <div style="font-size:.7rem;font-weight:700;border-top:1px solid #000;padding-top:.25rem;margin-top:.25rem">
              ${f.firma_nombre}
            </div>
            <div style="font-size:.65rem">${f.firma_grado || ''}</div>
            <div style="font-size:.65rem">${f.firma_cargo || ''}</div>
          </div>`
      }
    } catch(e) { /* Si falla, imprime con el bloque original */ }
  }

  // Clonar el área de impresión y reemplazar el bloque del validador si hay firma
  const clone = printArea.cloneNode(true)
  if (htmlFirmaValidador) {
    const bloqueValidador = clone.querySelector('#csf-bloque-firma-validador')
    if (bloqueValidador) bloqueValidador.outerHTML = htmlFirmaValidador
  }

  const win = window.open('', '_blank', 'width=900,height=700')
  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8"/>
      <title>CSF — ${APP.cuartelActivo()?.nombre || ''}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #fff; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 3px 5px; border: 1px solid #ccc; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>${clone.innerHTML}</body>
    </html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 500)
}

// ── F1: Enviar a revisión (guarda en BD con estado en_revision) ──
async function enviarCSFRevision() {
  if (!_csfDatos) { toast('Genere primero el borrador','err'); return }
  if (!APP.cuartelActivo()?.id) {
    toast('Selecciona un cuartel antes de enviar','err'); return
  }
  const { puntosProcesados, puntosPorFecha, amenaza, clasif, nroCsf, iniVig, finVig, mesVig, ref, cuartelId } = _csfDatos

  // Verificar si ya existe CSF para este mes/cuartel
  const { data: _existentes } = await APP.sb.from('csf_mensual')
    .select('id,numero,estado').eq('cuartel_id', cuartelId)
    .eq('mes_vigencia', mesVig.mes).eq('anio_vigencia', mesVig.anio)
    .limit(1)
  const existente = _existentes?.[0] || null

  // Bloquear si ya fue aprobada o publicada
  if (existente && (existente.estado === 'aprobada' || existente.estado === 'publicada')) {
    toast(`La CSF ${existente.numero} ya fue ${existente.estado} y no puede reemplazarse.`, 'err')
    return
  }

  if (existente) {
    const accion = await _preguntarSobreExistente(existente.numero, existente.estado)
    if (accion === 'cancelar') return
    if (accion === 'reemplazar') {
      // Eliminar registros anteriores
      await APP.sb.from('csf_visitas_ordenadas').delete().eq('csf_id', existente.id)
      await APP.sb.from('csf_puntos_fvc').delete().eq('csf_id', existente.id)
      await APP.sb.from('csf_mensual').delete().eq('id', existente.id)
    }
  }

  try {
    const { data: csf, error } = await APP.sb.from('csf_mensual').insert({
      cuartel_id:            cuartelId,
      numero:                nroCsf,
      clasificacion:         clasif,
      mes_referencia:        ref.mes,
      anio_referencia:       ref.anio,
      mes_vigencia:          mesVig.mes,
      anio_vigencia:         mesVig.anio,
      fecha_emision:         hoyISO(),
      fecha_vigencia_inicio: iniVig,
      fecha_vigencia_fin:    finVig,
      amenaza_principal:     amenaza,
      estado:                'en_revision',
      enviado_revision_at:   new Date().toISOString(),
    }).select().single()
    if (error) throw error

    await APP.sb.from('csf_puntos_fvc').insert(
      puntosProcesados.map(p => ({
        csf_id:             csf.id,
        punto_id:           p.id,
        nivel_excel:        p.nivelExcel,
        nivel_pxc:          p.nivelPxC,
        nivel_final:        p.nivelFinal,
        nivel_texto:        p.infoN.texto,
        probabilidad_texto: p.infoN.probabilidad,
        observacion:        p.observacion,
        fvc_asignada:       p.fvcFinal,
        turno_recomendado:  p.turno,
        hora_inicio:        p.horaIni,
        hora_termino:       p.horaFin,
        meta_cumplimiento:  p.nivelFinal >= 4 ? '≥ 90%' : p.nivelFinal === 3 ? '≥ 85%' : '≥ 75%',
      }))
    )

    await APP.sb.from('csf_visitas_ordenadas').insert(
      puntosPorFecha.map(v => ({
        csf_id:         csf.id,
        punto_id:       v.punto.id,
        numero_visita:  v.nroGlobal,
        fecha_ordenada: v.fecha,
        hora_inicio:    v.hora_inicio,
        hora_termino:   v.hora_termino,
        turno:          v.turno,
        estado:         'pendiente',
      }))
    )

    toast(`CSF ${nroCsf} enviada a revisión del Subprefecto`, 'ok')
    _csfDatos = null
    await cambiarTabCSF('historial')
  } catch(e) {
    toast('Error: ' + e.message, 'err')
    console.error('enviarCSFRevision error:', e)
  }
}

// ── Helper: modal de confirmación si ya existe CSF ──
function _preguntarSobreExistente(numero, estado) {
  return new Promise(resolve => {
    const modal = document.createElement('div')
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center'
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:1.5rem;max-width:400px;width:90%">
        <div style="font-size:1rem;font-weight:700;margin-bottom:.75rem">⚠ CSF ya existe para este mes</div>
        <div style="font-size:.83rem;color:#444;margin-bottom:1.25rem;line-height:1.6">
          <strong>${numero}</strong> ya existe para este período.<br>
          Estado actual: <strong style="text-transform:uppercase">${estado.replace('_',' ')}</strong>
        </div>
        <div style="display:flex;flex-direction:column;gap:.5rem">
          <button class="btn btn-rojo" onclick="_resolverExistente(this,'reemplazar')">
            🔄 Reemplazar — Eliminar la anterior y crear nueva
          </button>
          <button class="btn btn-secundario" onclick="_resolverExistente(this,'saltar')">
            ↷ Saltar — Mantener la existente
          </button>
          <button class="btn btn-ghost" onclick="_resolverExistente(this,'cancelar')">
            ✕ Cancelar
          </button>
        </div>
      </div>`
    document.body.appendChild(modal)
    window._resolverExistente = (btn, accion) => {
      modal.remove()
      delete window._resolverExistente
      resolve(accion)
    }
  })
}

// ── Publicar CSF aprobada (solo tras aprobación del validador) ──
async function publicarCSFAprobada(csfId) {
  if (!confirm('¿Publicar esta CSF? Quedará activa para el período de vigencia.')) return
  const { error } = await APP.sb.from('csf_mensual').update({
    estado:        'publicada',
    publicado_at:  new Date().toISOString(),
  }).eq('id', csfId).eq('estado', 'aprobada')
  if (error) { toast('Error al publicar: ' + error.message, 'err'); return }
  toast('CSF publicada correctamente', 'ok')
  await cambiarTabCSF('seguimiento')
}

// ── TAB SEGUIMIENTO ──────────────────────────────────────────
async function renderSeguimiento() {
  const zona = el('csf-contenido')
  const cuartelId = APP.cuartelActivo()?.id

  const { data: csfs } = await APP.sb.from('csf_mensual')
    .select('*').eq('cuartel_id', cuartelId).eq('estado','publicada')
    .order('fecha_vigencia_inicio',{ascending:false}).limit(1)

  if (!csfs?.length) {
    zona.innerHTML = `<div class="card" style="text-align:center;padding:2rem">
      <div style="font-size:2rem;margin-bottom:.75rem">📄</div>
      <div style="font-weight:700">Sin CSF activa</div>
      <div style="font-size:.8rem;color:var(--muted);margin-top:.5rem">Genere y publique una CSF primero</div>
    </div>`
    return
  }

  const csf = csfs[0]
  const { data: visitas } = await APP.sb.from('csf_visitas_ordenadas')
    .select('*,punto:puntos_territoriales(id,nombre,tipo,fvc_base)')
    .eq('csf_id', csf.id).order('fecha_ordenada')

  const hoy     = new Date(hoyISO() + 'T12:00:00')
  const iniVig  = csf.fecha_vigencia_inicio
  const finVig  = csf.fecha_vigencia_fin

  // V3: Cumplimiento por semana ISO por punto
  // Obtener visitas ejecutadas reales del período
  const { data: svcsVig } = await APP.sb.from('servicios')
    .select('id').eq('cuartel_id', cuartelId)
    .gte('fecha', iniVig).lte('fecha', finVig)
  const svcIdsVig = (svcsVig||[]).map(s => s.id)

  let visitasEjec = []
  if (svcIdsVig.length) {
    const { data: ve } = await APP.sb.from('visitas_puntos')
      .select('punto_id,fecha').in('servicio_id', svcIdsVig)
    visitasEjec = ve || []
  }

  // Calcular cumplimiento global por semana ISO
  const puntosSeguimiento = [...new Set((visitas||[]).map(v => v.punto?.id).filter(Boolean))]
    .map(pid => {
      const pInfo = visitas.find(v => v.punto?.id === pid)?.punto
      if (!pInfo) return null
      const fvc = pInfo.fvc_base || 'mensual'
      const cum = calcularCumplimientoISO(pInfo, visitasEjec, iniVig, finVig, fvc)
      return { ...pInfo, ...cum }
    }).filter(Boolean)

  const totalPeriodos   = puntosSeguimiento.reduce((a,p) => a + p.periodosTotal, 0)
  const totalCumplidos  = puntosSeguimiento.reduce((a,p) => a + p.periodosCumplidos, 0)
  const pctGlobal       = totalPeriodos > 0 ? Math.round(totalCumplidos / totalPeriodos * 100) : 0
  const colorGlobal     = pctGlobal>=90?'var(--verde)':pctGlobal>=70?'var(--amarillo)':'var(--rojo)'

  zona.innerHTML = `
    <div class="card" style="border-left:4px solid var(--verde);margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <div class="sec-titulo">${csf.numero}</div>
          <div style="font-size:.72rem;color:var(--muted)">${formatFechaCorta(iniVig)} → ${formatFechaCorta(finVig)}</div>
          <div style="font-size:.7rem;color:var(--muted);margin-top:.25rem">
            Cumplimiento medido por períodos ISO (semanas/quincenas/meses)
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.5rem">
          <div style="text-align:right">
            <div style="font-size:2rem;font-weight:700;color:${colorGlobal}">${pctGlobal}%</div>
            <div style="font-size:.7rem;color:var(--muted)">${totalCumplidos} / ${totalPeriodos} períodos cumplidos</div>
          </div>
          ${(APP.esComisario() || APP.esAdministrador()) ? `
          <button class="btn btn-secundario btn-sm" onclick="despublicarCSF('${csf.id}')">
            ↩ Volver a borrador
          </button>` : ''}
        </div>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div style="background:#f5f5f7;padding:.5rem .85rem;font-size:.74rem;font-weight:700">
        Seguimiento por punto — Cumplimiento ISO
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:.72rem">
        <thead>
          <tr style="background:#f0f0f2">
            <th style="padding:.35rem .6rem;text-align:left">Punto</th>
            <th style="padding:.35rem .6rem;text-align:left;width:60px">Tipo</th>
            <th style="padding:.35rem .6rem;text-align:left;width:120px">FVC</th>
            <th style="padding:.35rem .6rem;text-align:center;width:110px">Períodos</th>
            <th style="padding:.35rem .6rem;text-align:center;width:80px">%</th>
          </tr>
        </thead>
        <tbody>
          ${puntosSeguimiento.sort((a,b)=>a.pct-b.pct).map((p,i) => {
            const color = p.pct>=90?'#1A843F':p.pct>=50?'#9A7D0A':'#C0392B'
            return `
            <tr style="${i%2===0?'background:#fafafa':''};border-bottom:1px solid var(--border)">
              <td style="padding:.35rem .6rem;font-weight:500">${p.nombre}</td>
              <td style="padding:.35rem .6rem">
                <span style="font-size:.63rem;font-weight:700;padding:1px 4px;border-radius:3px;
                  background:${p.tipo==='hito'?'#e8f0fe':p.tipo==='pnh'?'#fdecea':'#e8f5ea'};
                  color:${p.tipo==='hito'?'#0055d4':p.tipo==='pnh'?'#C0392B':'#1A843F'}">
                  ${p.tipo.toUpperCase()}
                </span>
              </td>
              <td style="padding:.35rem .6rem;font-size:.68rem">${CSF_CONFIG.FVC_LABELS[p.fvc_base]||p.fvc_base}</td>
              <td style="padding:.35rem .6rem;text-align:center;font-size:.68rem">
                ${p.periodosCumplidos} / ${p.periodosTotal}
              </td>
              <td style="padding:.35rem .6rem;text-align:center">
                <span style="font-weight:700;color:${color}">${p.pct}%</span>
              </td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="card" style="padding:0;overflow:hidden;margin-top:1rem">
      <div style="background:#f5f5f7;padding:.5rem .85rem;font-size:.74rem;font-weight:700">
        Calendario programado
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:.72rem">
        <thead>
          <tr style="background:#f0f0f2">
            <th style="padding:.35rem .6rem;text-align:center;width:40px">N°</th>
            <th style="padding:.35rem .6rem;text-align:left">Punto</th>
            <th style="padding:.35rem .6rem;text-align:left;width:180px">Fecha</th>
            <th style="padding:.35rem .6rem;text-align:left;width:120px">Horario</th>
            <th style="padding:.35rem .6rem;text-align:center;width:80px">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${(visitas||[]).map((v,i) => {
            const esPasada = new Date(v.fecha_ordenada+'T12:00:00') <= hoy
            const esEjec   = v.estado === 'ejecutada'
            const estado   = !esPasada ? '⏳' : esEjec ? '✅' : '❌'
            const bg       = !esPasada ? '' : esEjec ? 'background:#e8f5ea' : 'background:#fdecea'
            return `
            <tr style="${bg};border-bottom:1px solid var(--border)">
              <td style="padding:.3rem .6rem;text-align:center;font-weight:700">${String(v.numero_visita).padStart(2,'0')}</td>
              <td style="padding:.3rem .6rem;font-weight:500">${v.punto?.nombre||'—'}</td>
              <td style="padding:.3rem .6rem">${formatFecha(v.fecha_ordenada)}</td>
              <td style="padding:.3rem .6rem">${v.hora_inicio} – ${v.hora_termino}</td>
              <td style="padding:.3rem .6rem;text-align:center;font-size:1rem">${estado}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>`
}

// M3: despublicar CSF — solo si está en borrador o en_revision, NUNCA si está aprobada o publicada
async function despublicarCSF(csfId) {
  // Verificar estado actual antes de permitir la acción
  const { data: csf } = await APP.sb.from('csf_mensual').select('estado,numero').eq('id', csfId).single()
  if (!csf) { toast('CSF no encontrada', 'err'); return }

  if (csf.estado === 'publicada' || csf.estado === 'aprobada') {
    toast(`La CSF ${csf.numero} ya fue ${csf.estado === 'publicada' ? 'publicada' : 'aprobada'} y no puede modificarse.`, 'err')
    return
  }

  if (!confirm(`¿Volver la CSF ${csf.numero} a borrador? Se podrá corregir y reenviar a revisión.`)) return

  const { error } = await APP.sb.from('csf_mensual')
    .update({ estado: 'borrador', enviado_revision_at: null })
    .eq('id', csfId)
  if (error) { toast('Error: ' + error.message, 'err'); return }
  toast('CSF vuelta a borrador.', 'ok')
  await cambiarTabCSF('historial')
}

// ── TAB HISTORIAL ────────────────────────────────────────────
async function renderHistorial() {
  const zona      = el('csf-contenido')
  const cuartelId = APP.cuartelActivo()?.id
  const esValidador = APP.perfil?.rol === 'validador'

  // Validador y Administrador ven todos los cuarteles; el resto solo el suyo
  const verTodos = esValidador || APP.esAdministrador()
  let q = APP.sb.from('csf_mensual')
    .select('*,cuartel:cuarteles(nombre)')
    .order('created_at', { ascending: false }).limit(50)
  if (!verTodos && cuartelId) q = q.eq('cuartel_id', cuartelId)

  const { data: csfs } = await q

  const _estadoInfo = (estado) => {
    const map = {
      borrador:       { bg:'#f0f0f2', color:'#555',     label:'BORRADOR' },
      en_revision:    { bg:'#FFF3CD', color:'#856404',  label:'EN REVISIÓN' },
      aprobada:       { bg:'#e8f0fe', color:'#0055d4',  label:'APROBADA' },
      publicada:      { bg:'#e8f5ea', color:'#1A843F',  label:'PUBLICADA' },
      en_correccion:  { bg:'#FEF3E2', color:'#7B3F00',  label:'EN CORRECCIÓN' },
    }
    return map[estado] || { bg:'#f0f0f2', color:'#555', label:(estado||'—').toUpperCase() }
  }

  zona.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden">
      <div style="background:#f5f5f7;padding:.5rem .85rem;font-size:.74rem;font-weight:700">
        Historial de CSF
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:.75rem">
          <thead>
            <tr style="background:#f0f0f2">
              <th style="padding:.35rem .6rem;text-align:left">N° CSF</th>
              <th style="padding:.35rem .6rem;text-align:left">Cuartel</th>
              <th style="padding:.35rem .6rem;text-align:left">Emisión</th>
              <th style="padding:.35rem .6rem;text-align:left">Vigencia</th>
              <th style="padding:.35rem .6rem;text-align:center">Clasif.</th>
              <th style="padding:.35rem .6rem;text-align:center">Estado</th>
              <th style="padding:.35rem .6rem;text-align:center">Acción</th>
            </tr>
          </thead>
          <tbody>
            ${(csfs||[]).map((c,i) => {
              const ei = _estadoInfo(c.estado)
              const puedePublicar = (APP.esComisario() || APP.esAdministrador()) && c.estado === 'aprobada'
              const puedeVolver   = (APP.esComisario() || APP.esAdministrador()) && ['en_revision','borrador'].includes(c.estado)
              return `
              <tr style="${i%2===0?'background:#fafafa':''};border-bottom:1px solid var(--border)">
                <td style="padding:.35rem .6rem;font-weight:700">${c.numero}</td>
                <td style="padding:.35rem .6rem;font-size:.7rem">${c.cuartel?.nombre?.replace(' (F)','')||'—'}</td>
                <td style="padding:.35rem .6rem">${formatFechaCorta(c.fecha_emision)}</td>
                <td style="padding:.35rem .6rem;font-size:.7rem">${formatFechaCorta(c.fecha_vigencia_inicio)} → ${formatFechaCorta(c.fecha_vigencia_fin)}</td>
                <td style="padding:.35rem .6rem;text-align:center">
                  <span style="background:#fff0f1;color:#C0392B;font-size:.63rem;font-weight:700;padding:1px 5px;border-radius:3px">
                    ${c.clasificacion}
                  </span>
                </td>
                <td style="padding:.35rem .6rem;text-align:center">
                  <span style="background:${ei.bg};color:${ei.color};font-size:.63rem;font-weight:700;padding:2px 6px;border-radius:4px">
                    ${ei.label}
                  </span>
                  ${c.firma_nombre ? `<div style="font-size:.6rem;color:var(--muted);margin-top:.15rem">✓ ${c.firma_nombre}</div>` : ''}
                  ${c.version_correccion > 0 ? `<div style="font-size:.6rem;color:#7B3F00;margin-top:.15rem;cursor:pointer" onclick="verHistorialCorrecciones('${c.id}','${c.numero}')">⚠ Corregida v${c.version_correccion} — ver historial</div>` : ''}
                </td>
                <td style="padding:.35rem .6rem;text-align:center">
                  <div style="display:flex;gap:.35rem;justify-content:center;flex-wrap:wrap">
                    <button class="btn btn-sm btn-secundario" onclick="verCSFCompleta('${c.id}')">👁 Ver</button>
                    <button class="btn btn-sm" style="background:#f0f9f3;color:#1A843F;border:1px solid #b7dfca" onclick="imprimirCSFHistorial('${c.id}')">↓ Imprimir</button>
                    ${puedePublicar
                      ? `<button class="btn btn-sm btn-primario" onclick="publicarCSFAprobada('${c.id}')">✓ Publicar</button>`
                      : puedeVolver
                      ? `<button class="btn btn-sm btn-ghost" onclick="despublicarCSF('${c.id}')">↩ Borrador</button>`
                      : ''}
                    ${(APP.esComisario() || APP.esAdministrador() || APP.perfil?.rol === 'validador') && c.estado === 'publicada'
                      ? `<button class="btn btn-sm" style="background:#FEF3E2;color:#7B3F00;border:1px solid #F5CBA7"
                           onclick="solicitarCorreccionCSF('${c.id}','${c.numero}')">⚠ Corrección</button>`
                      : ''}
                    ${(APP.esComisario() || APP.esAdministrador()) && c.estado === 'en_correccion'
                      ? `<button class="btn btn-sm btn-primario" onclick="abrirEditorCorreccion('${c.id}','${c.numero}')">✎ Editar</button>`
                      : ''}
                  </div>
                </td>
              </tr>`
            }).join('')}
            ${!csfs?.length ? '<tr><td colspan="7" style="padding:2rem;text-align:center;color:var(--muted)">Sin CSF generadas</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>`
}

// ============================================================
// CSF v3.0 — NUEVAS FUNCIONES
// ============================================================

// ── F2/F6: Tab Revisión — vista del Validador y Admin/Comisario ──
async function renderTabRevision() {
  const zona       = el('csf-contenido')
  const esValidador = APP.perfil?.rol === 'validador'

  zona.innerHTML = '<div class="cargando">Cargando CSF en revisión...</div>'

  let q = APP.sb.from('csf_mensual')
    .select('*,cuartel:cuarteles(nombre)')
    .in('estado', ['en_revision','en_correccion'])
    .order('created_at', { ascending: false })

  // Admin/Comisario con cuartel activo: solo las de su cuartel
  // Validador ve todas
  if (!esValidador && APP.cuartelActivo()?.id) {
    q = q.eq('cuartel_id', APP.cuartelActivo().id)
  }

  const { data: csfs } = await q

  if (!csfs?.length) {
    zona.innerHTML = `
      <div class="card" style="text-align:center;padding:2.5rem">
        <div style="font-size:2rem;margin-bottom:.75rem">🔍</div>
        <div style="font-weight:700">Sin CSF pendientes de revisión</div>
        <div style="font-size:.8rem;color:var(--muted);margin-top:.5rem">
          Cuando el Comisario envíe una CSF a revisión aparecerá aquí
        </div>
      </div>`
    return
  }

  const esMultiple = csfs.length > 1

  zona.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem">
      <div>
        <div class="sec-titulo" style="margin:0">CSF en revisión (${csfs.length})</div>
        <div style="font-size:.75rem;color:var(--muted)">
          ${esValidador ? 'Revise los horarios y apruebe cada CSF' : 'Esperando aprobación del Subprefecto'}
        </div>
      </div>
      ${esValidador && esMultiple ? `
      <button class="btn btn-primario" onclick="abrirFirmaYAprobarTodas()">
        ✓ Aprobar todas (${csfs.length})
      </button>` : ''}
    </div>

    <div style="display:flex;flex-direction:column;gap:1rem">
      ${csfs.map(csf => _htmlTarjetaRevision(csf, esValidador)).join('')}
    </div>

    <!-- Modal firma validador -->
    <div id="modal-firma-validador" class="modal" style="display:none">
      <div class="modal-box" style="max-width:480px" id="modal-firma-contenido"></div>
    </div>`
}

function _htmlTarjetaRevision(csf, esValidador) {
  const nombre = csf.cuartel?.nombre?.replace(' (F)','') || '—'
  return `
  <div class="card" style="border-left:4px solid var(--amarillo);padding:1rem">
    <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:.5rem;margin-bottom:.6rem">
      <div>
        <div style="font-size:1rem;font-weight:700">${csf.numero}
          <span style="font-size:.7rem;font-weight:400;color:var(--muted);margin-left:.4rem">${nombre}</span>
        </div>
        <div style="font-size:.72rem;color:var(--muted)">
          Vigencia: ${formatFechaCorta(csf.fecha_vigencia_inicio)} → ${formatFechaCorta(csf.fecha_vigencia_fin)}
        </div>
        <div style="font-size:.72rem;color:var(--muted)">
          Emitida: ${formatFechaCorta(csf.fecha_emision)}
          ${csf.enviado_revision_at ? ' · Enviada: ' + formatFechaCorta(csf.enviado_revision_at.split('T')[0]) : ''}
        </div>
      </div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">
        <button class="btn btn-sm btn-secundario" onclick="verHorariosCSF('${csf.id}')">
          🕐 Editar horarios
        </button>
        <button class="btn btn-sm btn-secundario" onclick="verCSFCompleta('${csf.id}')">
          👁 Ver CSF
        </button>
        ${esValidador ? `
        <button class="btn btn-sm btn-primario" onclick="abrirFirmaYAprobar('${csf.id}','${csf.numero}')">
          ✓ Aprobar
        </button>
        <button class="btn btn-sm" style="background:#fdecea;color:#C0392B;border:1px solid #f5c6c6"
          onclick="rechazarCSF('${csf.id}','${csf.numero}')">
          ✕ Rechazar
        </button>` : ''}
      </div>
    </div>
  </div>`
}

// ── F6: Ver y editar horarios antes de aprobar ──
async function verHorariosCSF(csfId) {
  const { data: visitas } = await APP.sb.from('csf_visitas_ordenadas')
    .select('*,punto:puntos_territoriales(nombre,tipo)')
    .eq('csf_id', csfId).order('fecha_ordenada')

  const esValidador = APP.perfil?.rol === 'validador'

  const modal = document.createElement('div')
  modal.id    = 'modal-horarios-csf'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem'
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;width:min(96vw,780px);max-height:88vh;display:flex;flex-direction:column">
      <div style="padding:.9rem 1.1rem;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700;font-size:.95rem">Horarios de visita programados</span>
        <button onclick="el('modal-horarios-csf').remove()" style="border:none;background:none;font-size:1.2rem;cursor:pointer">✕</button>
      </div>
      ${esValidador ? `
      <div style="padding:.5rem 1rem;background:#FFF3CD;font-size:.75rem;color:#856404;border-bottom:1px solid #F0C040">
        💡 Puede ajustar el horario de cualquier visita antes de aprobar. Los cambios se guardan al hacer clic en ✎.
      </div>` : ''}
      <div style="flex:1;overflow-y:auto;padding:.5rem">
        <table style="width:100%;border-collapse:collapse;font-size:.76rem">
          <thead>
            <tr style="background:#f0f0f2;position:sticky;top:0">
              <th style="padding:.35rem .6rem;text-align:center;width:40px">N°</th>
              <th style="padding:.35rem .6rem;text-align:left">Punto</th>
              <th style="padding:.35rem .6rem;text-align:center;width:55px">Tipo</th>
              <th style="padding:.35rem .6rem;text-align:left;width:150px">Fecha</th>
              <th style="padding:.35rem .6rem;text-align:left;width:80px">Inicio</th>
              <th style="padding:.35rem .6rem;text-align:left;width:80px">Término</th>
              ${esValidador ? '<th style="padding:.35rem .6rem;text-align:center;width:55px">Editar</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${(visitas||[]).map((v,i) => `
            <tr data-visita-id="${v.id}" style="${i%2===0?'background:#fafafa':''};border-bottom:1px solid #eee">
              <td style="padding:.3rem .6rem;text-align:center;font-weight:700">${String(v.numero_visita).padStart(2,'0')}</td>
              <td style="padding:.3rem .6rem;font-weight:500">${v.punto?.nombre||'—'}</td>
              <td style="padding:.3rem .6rem;text-align:center">
                <span style="font-size:.6rem;font-weight:700;padding:1px 4px;border-radius:3px;
                  background:${v.punto?.tipo==='hito'?'#e8f0fe':v.punto?.tipo==='pnh'?'#fdecea':'#e8f5ea'};
                  color:${v.punto?.tipo==='hito'?'#0055d4':v.punto?.tipo==='pnh'?'#C0392B':'#1A843F'}">
                  ${(v.punto?.tipo||'—').toUpperCase()}
                </span>
              </td>
              <td style="padding:.3rem .6rem">${formatFecha(v.fecha_ordenada)}</td>
              <td data-campo="ini" style="padding:.3rem .6rem;font-weight:500">${v.hora_inicio}</td>
              <td data-campo="fin" style="padding:.3rem .6rem;font-weight:500">${v.hora_termino}</td>
              ${esValidador ? `
              <td style="padding:.3rem .6rem;text-align:center">
                <button class="btn btn-sm btn-secundario"
                  data-vid="${v.id}" data-tipo="${v.punto?.tipo||'pnh'}"
                  onclick="editarHorarioVisita(this)"
                  title="Editar horario">✎</button>
              </td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding:.75rem 1rem;border-top:1px solid #e5e7eb;text-align:right">
        <button onclick="el('modal-horarios-csf').remove()" class="btn btn-secundario">Cerrar</button>
      </div>
    </div>`
  document.body.appendChild(modal)
}

function editarHorarioVisita(btn) {
  // btn es el elemento <button> con data-vid y data-tipo
  const visitaId  = btn.dataset.vid
  const tipoPunto = btn.dataset.tipo
  const fila      = btn.closest('tr[data-visita-id]')
  if (!fila) return

  const iniEl = fila.querySelector('td[data-campo="ini"]')
  const finEl = fila.querySelector('td[data-campo="fin"]')
  if (!iniEl || !finEl) return

  const hIniActual = iniEl.textContent.trim()
  const hFinActual = finEl.textContent.trim()
  const esHito     = tipoPunto === 'hito'

  // Marcar fila como en edición
  fila.style.background = '#FFF9E6'

  iniEl.innerHTML = `<input type="time" class="edit-hora-ini"
    value="${hIniActual}"
    style="width:80px;font-size:.75rem;padding:.2rem .3rem;border:1px solid var(--amarillo);border-radius:4px"
    ${esHito ? 'min="06:00" max="20:00"' : ''}/>`

  finEl.innerHTML = `<input type="time" class="edit-hora-fin"
    value="${hFinActual}"
    style="width:80px;font-size:.75rem;padding:.2rem .3rem;border:1px solid var(--amarillo);border-radius:4px"/>`

  // Reemplazar botón ✎ por ✓ y ✕
  const tdBtn = btn.closest('td')
  if (tdBtn) {
    tdBtn.innerHTML = `
      <button class="btn btn-sm btn-primario" style="padding:.2rem .45rem"
        onclick="guardarHorarioVisita(this,'${visitaId}','${hIniActual}','${hFinActual}')">✓</button>
      <button class="btn btn-sm btn-ghost" style="padding:.2rem .35rem;margin-left:.2rem"
        onclick="cancelarEdicionHorario(this,'${hIniActual}','${hFinActual}')">✕</button>`
  }

  if (esHito) {
    const nota = document.createElement('div')
    nota.style.cssText = 'font-size:.6rem;color:#856404;margin-top:.15rem;white-space:nowrap'
    nota.textContent = 'Solo diurno (06:00–20:00)'
    iniEl.appendChild(nota)
  }
}

async function guardarHorarioVisita(btn, visitaId, hIniOrig, hFinOrig) {
  const fila  = btn.closest('tr[data-visita-id]')
  if (!fila) return
  const iniEl = fila.querySelector('td[data-campo="ini"]')
  const finEl = fila.querySelector('td[data-campo="fin"]')
  const hIni  = iniEl?.querySelector('input')?.value
  const hFin  = finEl?.querySelector('input')?.value
  if (!hIni || !hFin) return

  const { error } = await APP.sb.from('csf_visitas_ordenadas').update({
    hora_inicio:  hIni,
    hora_termino: hFin,
  }).eq('id', visitaId)

  if (error) { toast('Error al guardar: ' + error.message, 'err'); return }

  // Restaurar celdas con nuevos valores
  iniEl.innerHTML = `<span style="font-weight:500">${hIni}</span>`
  finEl.innerHTML = `<span style="font-weight:500">${hFin}</span>`
  fila.style.background = '#E8F5EA'
  setTimeout(() => { fila.style.background = '' }, 1200)

  // Restaurar botón editar
  const tdBtn = btn.closest('td')
  if (tdBtn) {
    tdBtn.innerHTML = `<button class="btn btn-sm btn-secundario"
      data-vid="${visitaId}" data-tipo="${fila.querySelector('span')?.textContent?.trim()?.toLowerCase()||'pnh'}"
      onclick="editarHorarioVisita(this)" title="Editar horario">✎</button>`
  }
  toast('Horario actualizado', 'ok')
}

function cancelarEdicionHorario(btn, hIni, hFin) {
  const fila  = btn.closest('tr[data-visita-id]')
  if (!fila) return
  const iniEl = fila.querySelector('td[data-campo="ini"]')
  const finEl = fila.querySelector('td[data-campo="fin"]')
  if (iniEl) iniEl.innerHTML = hIni
  if (finEl) finEl.innerHTML = hFin
  fila.style.background = ''

  // Restaurar botón editar
  const tdBtn = btn.closest('td')
  const vid   = fila.dataset.visitaId
  if (tdBtn && vid) {
    tdBtn.innerHTML = `<button class="btn btn-sm btn-secundario"
      data-vid="${vid}" data-tipo="pnh"
      onclick="editarHorarioVisita(this)" title="Editar horario">✎</button>`
  }
}

// ── DATOS FIJOS DEL COMISARIO ──────────────────────────────────
// Estos datos se imprimen siempre en el pie izquierdo de la CSF
const CSF_COMISARIO = {
  nombre:           'NILO A. MORALES RIQUELME',
  grado:            'Teniente Coronel de Carabineros',
  cargo:            'COMISARIO',
  firma_imagen_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAIBAQIBAQICAgICAgICAwUDAwMDAwYEBAMFBwYHBwcGBwcICQsJCAgKCAcHCg0KCgsMDAwMBwkODw0MDgsMDAz/2wBDAQICAgMDAwYDAwYMCAcIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCACGAV4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9/M80meaD1oAxiswFByKTJx0pRSY45oAXNITik68ijcGOMc0ALnpS5prdh270bcA88d6AF64/WlHFNPK8YBpSwGB68UABOQSMUZzimkDkD/8AVRneehGPUUAOPWhTkVVu9Ys9OJa4u7aAZ6ySqo/U1l3fxS8M2IIm8R6FCQOd9/EpH/j1PlfYDeBzQO3WuSn+PXgq2iZ38W+HSIgGcrfxttB6E4PFRS/tDeCIs58TaUxB2nZLu5/AGnyS7Adr0pDya4WX9pnwFbXEcUvinSo3mOIwzkbu3UioH/av+G0ILSeNfD0KrwWluljA/FsU/Zy7AehHpSZ+YCuFsv2ofhtqDbYfiB4MZsZ2/wBs24OPoXre0X4l+HPEsgGn+INEv2YZUW1/FKSP+AsaThJboDcIyaCcj3pC2QMcg+lKo9akBMkcdMUhjKsWB7UrEd6T1zn/ABoAXtQXycDOaNuB3xVPUvENhpSFrm+s7YDvLMqAfmaaTewFsHg9MYpCpVe3vXOz/GDwjbswl8UeHI9o5DanCMf+PVE/xv8ABZ2g+LvC3zDKg6tBz/4/T5JdgudQT04/+vQr7x2OfSsC0+LPha+4h8S+Hpj/ALGowt2z2b0rSsvEWn6mo+yX9jOT08udX/kaOV9gLrH8KQsQegpdpA5Gec0uSG5zzUgNxuGAehpQ/wB33pFILE4waXAPSgBWGAf50hbH1pcliewpCpDk446YoAUg7s0hwfUUrEnGKQA4570AGcAnrSj5s96aWBPtQGG7HII/WgBSCc4x70HjnpijHfA9KUgkA96AAHIPeobixguTmSGJ8dNy5p/GMde4p4/GgBeSKCcfhR24oP1oAUdab0GcUE9R+tcH8bf2m/Af7O1pbv4v8S2Gk3N9xZWALXGoai3923tYw00zZ4wiNQk3ogO7Llc8fSg/OMjOa8CtP2gvi38apQvgD4XP4U0eT7uv/ACYFmY/wrpNkJuHbdQ7Y5GKKerA+iPG/xo8JfDUqviDxJoukyNkrDc3aJNJ/ux52sfoBXKXX7VOm+JZSO3Xj/AEmthHiZ7tLnJGSiXCk+4K9jVdYc9+gqF5muf8Agmn8fta0PeE1S/0eLT/FenwKN95p2pyLbXCrx8xSSUyIOzRjFfcyknAPBr8RP+DdL4t3Gvf8Ex9I8K6g8k2q/C3xTrXhKeaRyzy26Xb3cLE9yLe6t1/4BX7dpkjrmtq0bTa7Ct0G5HrRnHtTumaSshhyf8KaoBApyilIB4oAaV3Y6Z/rQWIGCM0oGfbHfNJ3oAQk5pN2G79KU8Ajp7Uc0ALBFJ0pBwMe9KvQ9fxoI5z0HtQAbdvWlGCOlMiYlCT14qXPbtQAijK8nFKB9KBjvRyTxigBQMHmk3AD3pM8jNAIPPpQAppxOOO9NJBHOP6UKuGpwJH4UAN6n3pDxk5p2MjkijuemKAGiKPepKrkH2pykjOOlB65oBJWgBCCAD6UE4FLwWGetNkz26daAHEgDpQDj3pnUdeKXHJzgUAGOacqEdSabxRuz7UAHzA0hA3Zp2OetBGVGaAEA4pwIxTVB+tOAHXigBCvHuKCuBjHSgbj1wKWgBOuO5rzvxT+118IfA2s3GneIPij8OdD1G0kMVxaahrtnbzwMDghkd8qQRzkcivRC3OBX4Y/8ABZ3/AIJ3fHv9qH9tnVfGPwz+FfifxL4N17RtNv8AS5NOiWVUt5tPimRpE3Bsk5JXqM0Abf8AwWS/4LU+M/AX7bvgH4d/BP4k6DpPh7TL23vtbuIfCkfiy4vri2vQFhUzRvFBHHGXJJBMjOBtChWPoX7Lf/BVH4q/Fn4geAfh18Sfh34g0n4s+Mbdbi+s4fCd5oWj6SsyPcMJL51KKqxOhMp8lVZ9pJC1/NhPFPb3EkUqPHLGxV1YFWVhkEEdiCMV/Zx8E/BEnw0+D/hbw3My+bpOlW9rIE+6rLGu4D2yf0oA9gPSgHikJ+amkDJpAKSSOlJnCgUikL0NKQO2TigAJz14pM4FLgj8aNhJJyDmgBpf1o+9RtxS43UAN+YUo6fnS4IAIHtQAQc4oABwOtOI60Ak+1IeB1oAUfe+tB5HFIO9GMHkUAI6KXBI5IpAu3kUv3h9KQHJ9aAFB/GlByO/FGcHr0pGOMAfjQAoGeKXIHajPpSZ7UALnbzTCBjnpS8kZxTSueuCPQ0AOPP0ppJH40biVz2oJ70AKck05hg5GaTbk88UMu7gGgBGOT14owVz70HrjPHaloAYBxk8ZpFGDinlse1MxkelADlOTxzimk7DinA00jnnPFABIqyqVIypGCCMg144v7CP7Pd/H5MHwT+E93DnC+Ro1pIMH0dFJH4mvYuvQ0hBHY0AeXL+wx+z3ZPG7/AAQ+EkwQ7QbnQrSVse244zU2j/sXfCrw0zHSfhP8MNKL/eNl4WsrfP1CRivTHXHHNOHHfjNAHjutfsZaprGttJ4V8TXHgPTH+dp/DGsapprzOTnzHiuLCeIucnLJGDnpjgVXt/2OviZ4Mj/AGL4eaOmB9+/1G5nb9ZcV6x/Eu7GQPekHT2HFAHO6B8HvCvhaN47Hw3oVpHPBHbTpHp8Si4ijXbGkgA+cqOAfSt6G2jtYwsKKijgKq4A/AU8LlsmggjP6UAKEGDnqKADjmmYOMGl/nQAoX0x70Fcd+aPpSjIHWgAB9sml/izQce9BOaAEYEnpke9RHhiCM+1S5waBgjFAEZbI9/agtjI9BTCAM5znNITj0/WgAJOenfHNGCGHHSlLc+w5pCTuGB+NAC56CnbgBmm7cjPGPWlA/pQAtFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/Z',
}

// ── Ver CSF completa en modal (Historial) ─────────────────────
async function verCSFCompleta(csfId) {
  const { data: csf } = await APP.sb.from('csf_mensual')
    .select('*,cuartel:cuarteles(nombre)').eq('id', csfId).single()
  const { data: visitas } = await APP.sb.from('csf_visitas_ordenadas')
    .select('*,punto:puntos_territoriales(nombre,tipo,latitud,longitud)')
    .eq('csf_id', csfId).order('fecha_ordenada')
  const { data: puntosFvc } = await APP.sb.from('csf_puntos_fvc')
    .select('*,punto:puntos_territoriales(nombre,tipo,fvc_base)').eq('csf_id', csfId)
    .order('nivel_final', { ascending: false })

  const modal = document.createElement('div')
  modal.id    = 'modal-ver-csf'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:center;justify-content:center;padding:1rem'
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;width:min(98vw,900px);max-height:94vh;display:flex;flex-direction:column">
      <div style="padding:.85rem 1.1rem;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <span style="font-weight:700;font-size:.95rem">${csf?.numero || 'CSF'} — ${csf?.cuartel?.nombre?.replace(' (F)','')||''}</span>
        <div style="display:flex;gap:.5rem">
          <button onclick="imprimirCSFHistorial('${csfId}')" class="btn btn-sm btn-secundario">↓ Imprimir / PDF</button>
          <button onclick="el('modal-ver-csf').remove()" style="border:none;background:none;font-size:1.2rem;cursor:pointer">✕</button>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:1rem" id="csf-print-area-modal">
        ${_htmlCSFCompleta(csf, visitas||[], puntosFvc||[])}
      </div>
    </div>`
  document.body.appendChild(modal)
}

// ── Imprimir desde historial abriendo ventana nueva ───────────
async function imprimirCSFHistorial(csfId) {
  const { data: csf } = await APP.sb.from('csf_mensual')
    .select('*,cuartel:cuarteles(nombre)').eq('id', csfId).single()
  const { data: visitas } = await APP.sb.from('csf_visitas_ordenadas')
    .select('*,punto:puntos_territoriales(nombre,tipo,latitud,longitud)')
    .eq('csf_id', csfId).order('fecha_ordenada')
  const { data: puntosFvc } = await APP.sb.from('csf_puntos_fvc')
    .select('*,punto:puntos_territoriales(nombre,tipo,fvc_base)').eq('csf_id', csfId)
    .order('nivel_final', { ascending: false })

  const contenido = _htmlCSFCompleta(csf, visitas||[], puntosFvc||[])

  const win = window.open('', '_blank', 'width=960,height=800')
  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8"/>
      <title>${csf?.numero || 'CSF'} — ${csf?.cuartel?.nombre||''}</title>
      <style>
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:Arial,sans-serif; font-size:11px; color:#000; background:#fff; }
        table { width:100%; border-collapse:collapse; }
        th, td { padding:3px 5px; border:1px solid #ccc; }
        .verde-header { background:#04742C !important; color:#fff !important; }
        .verde-sub    { background:#1A843F !important; color:#fff !important; }
        .meta-band    { background:#CCE3D3 !important; }
        .alerta-band  { background:#FFF3CD !important; border-bottom:1px solid #F0C040; }
        @page { size:A4; margin:15mm 12mm; }
        @media print {
          body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        }
      </style>
    </head>
    <body>${contenido}</body>
    </html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 600)
}

// ── HTML completo de la CSF (igual al PDF real) ───────────────
function _htmlCSFCompleta(csf, visitas, puntosFvc) {
  if (!csf) return '<div style="color:red;padding:1rem">Error al cargar CSF</div>'

  const nombreSector = csf.cuartel?.nombre || '—'
  const vigencia     = `01-${String(csf.mes_vigencia||'').toString().padStart(2,'0')}-${csf.anio_vigencia||''} al ${formatFechaCorta(csf.fecha_vigencia_fin)} (30 días)`

  // ── Sección I: Criticidad ──────────────────────────────────
  const elevados = puntosFvc.filter(p => p.nivel_final >= 2)
  const bajos    = puntosFvc.filter(p => p.nivel_final <  2)
  const labelTipo = { hito:'Hitos Fronterizos', pnh:'Pasos No Habilitados', sie:'Sitios de Interés Estratégico' }
  const colorNivel = n => n >= 4 ? '#C0392B' : n === 3 ? '#E67E22' : n === 2 ? '#F1C40F' : '#1A843F'
  const textoNivel = n => n >= 4 ? 'RIESGO CRÍTICO' : n === 3 ? 'RIESGO ALTO' : n === 2 ? 'MODERADO' : 'BAJO'
  const textoProbabilidad = n => n >= 4 ? 'ALTA' : n === 3 ? 'ALTA' : n === 2 ? 'MEDIA' : 'BAJA'
  const fvcLabel  = fvc => ({ 'diario':'Diario','2x_semana':'2 veces / semana','semanal':'1 vez / semana',
    'quincenal':'1 vez / 15 días','mensual':'1 vez / mes','bimestral':'1 vez / 2 meses',
    'trimestral':'1 vez / 3 meses','semestral':'1 vez / 6 meses' }[fvc] || fvc || '—')

  let nroCrit = 1
  let filasCrit = ''
  elevados.forEach((p, i) => {
    filasCrit += `
      <tr style="background:${i%2===0?'#E2EFD9':'#fff'}">
        <td style="padding:.3rem .6rem;font-weight:700;text-align:center">${String(nroCrit++).padStart(2,'0')}</td>
        <td style="padding:.3rem .6rem;font-weight:600">${p.punto?.nombre||'—'}</td>
        <td style="padding:.3rem .6rem">
          <span style="font-size:.62rem;font-weight:700;padding:1px 4px;border-radius:3px;
            background:${p.punto?.tipo==='hito'?'#e8f0fe':p.punto?.tipo==='pnh'?'#fdecea':'#e8f5ea'};
            color:${p.punto?.tipo==='hito'?'#0055d4':p.punto?.tipo==='pnh'?'#C0392B':'#1A843F'}">
            ${(p.punto?.tipo||'').toUpperCase()}
          </span>
        </td>
        <td style="padding:.3rem .6rem;font-size:.68rem">${fvcLabel(p.fvc_asignada)}</td>
        <td style="padding:.3rem .6rem;font-weight:700;color:${colorNivel(p.nivel_final)}">${textoNivel(p.nivel_final)}</td>
        <td style="padding:.3rem .6rem;font-weight:700;color:${colorNivel(p.nivel_final)}">${textoProbabilidad(p.nivel_final)}</td>
        <td style="padding:.3rem .6rem;font-size:.68rem">${p.observacion||'—'}</td>
      </tr>`
  })
  if (elevados.length && bajos.length) {
    filasCrit += `<tr><td colspan="7" style="padding:.25rem .6rem;background:#f5f5f7;font-size:.65rem;font-weight:700;color:#666;letter-spacing:.05em;text-transform:uppercase">Puntos en nivel BAJO — Vigilancia de rutina</td></tr>`
  }
  const bajosPorTipo = { hito: bajos.filter(p=>p.punto?.tipo==='hito'), pnh: bajos.filter(p=>p.punto?.tipo==='pnh'), sie: bajos.filter(p=>p.punto?.tipo==='sie') }
  Object.entries(bajosPorTipo).forEach(([tipo, lista]) => {
    if (!lista.length) return
    const fvcs = [...new Set(lista.map(p => fvcLabel(p.fvc_asignada)))].join(' / ')
    filasCrit += `
      <tr style="background:#f9fdf9">
        <td style="padding:.3rem .6rem;font-weight:700;text-align:center;color:#1A843F">${String(nroCrit++).padStart(2,'0')}</td>
        <td style="padding:.3rem .6rem;font-weight:600;color:#1A843F;font-size:.72rem" colspan="2">${lista.length} ${labelTipo[tipo]||tipo}</td>
        <td style="padding:.3rem .6rem;font-size:.68rem;color:#555">${fvcs}</td>
        <td style="padding:.3rem .6rem;font-weight:700;color:#1A843F">BAJO</td>
        <td style="padding:.3rem .6rem;font-weight:700;color:#1A843F">BAJA</td>
        <td style="padding:.3rem .6rem;font-size:.68rem;color:#555">Sin actividad detectada. Vigilancia de rutina.</td>
      </tr>`
  })

  // ── Sección II: Amenaza ────────────────────────────────────
  const nivelMax    = puntosFvc.length ? Math.max(...puntosFvc.map(p=>p.nivel_final)) : 1
  const amenazaTxt  = csf.amenaza_principal || 'Sin actividad delictual confirmada. Mantener vigilancia preventiva.'

  // ── Sección III: Tabla de visitas ──────────────────────────
  const filasVisitas = visitas.map((v, i) => {
    const lat = v.punto?.latitud  ? formatCoord(v.punto.latitud,  false) : '—'
    const lon = v.punto?.longitud ? formatCoord(v.punto.longitud, true)  : '—'
    return `
    <tr style="background:${i%2===0?'#E8F5EC':'#fff'}">
      <td style="padding:.28rem .5rem;font-weight:700;text-align:center">${String(v.numero_visita).padStart(2,'0')}</td>
      <td style="padding:.28rem .5rem;font-weight:600">${v.punto?.nombre||'—'}</td>
      <td style="padding:.28rem .5rem;text-align:center">
        <span style="font-size:.6rem;font-weight:700;padding:1px 4px;border-radius:3px;
          background:${v.punto?.tipo==='hito'?'#e8f0fe':v.punto?.tipo==='pnh'?'#fdecea':'#e8f5ea'};
          color:${v.punto?.tipo==='hito'?'#0055d4':v.punto?.tipo==='pnh'?'#C0392B':'#1A843F'}">
          ${(v.punto?.tipo||'').toUpperCase()}
        </span>
      </td>
      <td style="padding:.28rem .5rem;font-family:monospace;font-size:.65rem">${lat}</td>
      <td style="padding:.28rem .5rem;font-family:monospace;font-size:.65rem">${lon}</td>
      <td style="padding:.28rem .5rem;font-weight:500">${formatFecha(v.fecha_ordenada)}</td>
      <td style="padding:.28rem .5rem">${v.hora_inicio} – ${v.hora_termino} hrs</td>
    </tr>`
  }).join('')

  // ── Sección V: Pie de firma ────────────────────────────────
  // Comisario (lado izquierdo) — datos fijos del cuartel
  const bloqueComisario = `
    <div style="border-right:1px solid #ddd;padding:1rem;text-align:center">
      ${CSF_COMISARIO.firma_imagen_url
        ? `<img src="${CSF_COMISARIO.firma_imagen_url}" style="height:60px;max-width:200px;object-fit:contain;display:block;margin:0 auto .4rem"/>`
        : '<div style="height:60px"></div>'}
      <div style="border-top:2px solid #000;padding-top:.35rem;margin-top:.25rem">
        <div style="font-size:.78rem;font-weight:700">${CSF_COMISARIO.nombre}</div>
        <div style="font-size:.72rem">${CSF_COMISARIO.grado}</div>
        <div style="font-size:.72rem;font-weight:700">${CSF_COMISARIO.cargo}</div>
      </div>
    </div>`

  // Validador (lado derecho) — datos desde BD o pendiente
  const bloqueValidador = csf.firma_nombre ? `
    <div style="padding:1rem;text-align:center">
      ${csf.firma_imagen_url
        ? `<img src="${csf.firma_imagen_url}" style="height:60px;max-width:200px;object-fit:contain;display:block;margin:0 auto .4rem"/>`
        : '<div style="height:60px"></div>'}
      <div style="border-top:2px solid #000;padding-top:.35rem;margin-top:.25rem">
        <div style="font-size:.78rem;font-weight:700">${csf.firma_nombre}</div>
        <div style="font-size:.72rem">${csf.firma_grado||''}</div>
        <div style="font-size:.72rem;font-weight:700">${csf.firma_cargo||''}</div>
      </div>
    </div>` : `
    <div style="padding:1rem;text-align:center;color:#999">
      <div style="height:60px;display:flex;align-items:center;justify-content:center;font-size:.75rem">Pendiente de validación</div>
      <div style="border-top:1px dashed #ccc;padding-top:.35rem;margin-top:.25rem">
        <div style="font-size:.72rem;font-weight:700;color:#999">Subprefecto Fronterizo</div>
        <div style="font-size:.68rem;color:#bbb">Autorización</div>
      </div>
    </div>`

  return `
  <div style="font-family:Arial,sans-serif;font-size:.78rem;color:#000">

    <!-- ENCABEZADO -->
    <div style="background:#04742C;color:#fff;padding:.6rem .9rem;font-size:.88rem;font-weight:700;letter-spacing:.3px">
      CARTA DE SITUACIÓN FRONTERIZA — DEMANDA PREVENTIVA
    </div>
    <div style="display:grid;grid-template-columns:auto 1fr auto 1fr auto 1fr;background:#CCE3D3;font-size:.7rem;border-bottom:1px solid #aac">
      <div style="padding:.3rem .6rem;border-right:1px solid #aac">
        <div style="font-size:.6rem;font-weight:700;color:#555;text-transform:uppercase">NRO. CSF:</div>
        <div style="font-size:.72rem;font-weight:600">${csf.numero}</div>
      </div>
      <div style="padding:.3rem .6rem;border-right:1px solid #aac">
        <div style="font-size:.6rem;font-weight:700;color:#555;text-transform:uppercase">CLASIFICACIÓN:</div>
        <div style="font-size:.72rem;font-weight:700;color:#C0392B">${csf.clasificacion}</div>
      </div>
      <div style="padding:.3rem .6rem">
        <div style="font-size:.6rem;font-weight:700;color:#555;text-transform:uppercase">EMISIÓN:</div>
        <div style="font-size:.72rem;font-weight:600">${formatFechaCorta(csf.fecha_emision)}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:auto 1fr;background:#CCE3D3;font-size:.7rem;border-bottom:1px solid #aac">
      <div style="padding:.3rem .6rem;border-right:1px solid #aac">
        <div style="font-size:.6rem;font-weight:700;color:#555;text-transform:uppercase">SECTOR:</div>
        <div style="font-size:.72rem;font-weight:600">${nombreSector}</div>
      </div>
      <div style="padding:.3rem .6rem">
        <div style="font-size:.6rem;font-weight:700;color:#555;text-transform:uppercase">VIGENCIA:</div>
        <div style="font-size:.72rem;font-weight:600">${vigencia}</div>
      </div>
    </div>

    <!-- I. CRITICIDAD -->
    <div style="background:#1A843F;color:#fff;padding:.4rem .85rem;font-size:.74rem;font-weight:700;margin-top:.4rem">
      I. NIVELES DE CRITICIDAD POR SECTOR
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:.72rem">
      <thead>
        <tr style="background:#04742C;color:#fff">
          <th style="padding:.35rem .5rem;text-align:center;width:40px">N°</th>
          <th style="padding:.35rem .5rem;text-align:left">Nombre</th>
          <th style="padding:.35rem .5rem;text-align:left;width:55px">Tipo</th>
          <th style="padding:.35rem .5rem;text-align:left;width:120px">FVC Asignada</th>
          <th style="padding:.35rem .5rem;text-align:left;width:120px">Criticidad</th>
          <th style="padding:.35rem .5rem;text-align:left;width:90px">Probabilidad</th>
          <th style="padding:.35rem .5rem;text-align:left">Observación</th>
        </tr>
      </thead>
      <tbody>${filasCrit}</tbody>
    </table>

    <!-- II. AMENAZA -->
    <div style="background:#1A843F;color:#fff;padding:.4rem .85rem;font-size:.74rem;font-weight:700;margin-top:.4rem">
      II. ANÁLISIS DE AMENAZA
    </div>
    <div style="background:#E2EFD9;padding:.6rem .85rem">
      <div style="display:grid;grid-template-columns:140px 140px 1fr;gap:.5rem;font-size:.72rem">
        <div style="font-weight:700">AMENAZA PRINCIPAL</div>
        <div style="font-weight:700;color:${colorNivel(nivelMax)}">${textoNivel(nivelMax)}</div>
        <div>${amenazaTxt}</div>
      </div>
    </div>

    <!-- III. LUGARES A PATRULLAR -->
    <div style="background:#1A843F;color:#fff;padding:.4rem .85rem;font-size:.74rem;font-weight:700;margin-top:.4rem">
      III. LUGARES A PATRULLAR (O.G. 3020)
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:.7rem">
      <thead>
        <tr style="background:#04742C;color:#fff">
          <th style="padding:.35rem .5rem;width:35px;text-align:center">N°</th>
          <th style="padding:.35rem .5rem">Nombre</th>
          <th style="padding:.35rem .5rem;width:55px">Tipo</th>
          <th style="padding:.35rem .5rem;width:100px">Latitud</th>
          <th style="padding:.35rem .5rem;width:100px">Longitud</th>
          <th style="padding:.35rem .5rem;width:140px">Fecha</th>
          <th style="padding:.35rem .5rem;width:120px">Horario</th>
        </tr>
      </thead>
      <tbody>${filasVisitas}</tbody>
    </table>

    <!-- IV. INSTRUCCIONES -->
    <div style="background:#1A843F;color:#fff;padding:.4rem .85rem;font-size:.74rem;font-weight:700;margin-top:.4rem">
      IV. INSTRUCCIONES GENERALES DEL SERVICIO
    </div>
    <div style="background:#F0F9F3;padding:.75rem .85rem;font-size:.72rem;line-height:1.65">
      <strong>A.</strong> El personal en servicio fronterizo debe portar permanentemente: GPS, teléfono satelital, arma primaria y secundaria, binoculares/visor nocturno, chaleco balístico obligatorio, sistema fotográfico, equipo radial portátil y carta topográfica.<br>
      <strong>B.</strong> En todo procedimiento el personal policial debe garantizar medidas de seguridad de Técnicas en Zonas Fronterizas respecto a los individuos controlados.<br>
      <strong>C.</strong> El Jefe de Patrulla es responsable de documentar el cumplimiento de los lineamientos de la presente CSF.<br>
      <strong>D.</strong> En ninguna circunstancia se permitirá que el personal policial cruce el Límite Político Internacional de la República de Chile.
    </div>

    <!-- V. FIRMAS -->
    <div style="background:#1A843F;color:#fff;padding:.4rem .85rem;font-size:.74rem;font-weight:700;margin-top:.4rem">
      V. FIRMAS Y VALIDACIÓN
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;border:1px solid #ddd;min-height:100px">
      ${bloqueComisario}
      ${bloqueValidador}
    </div>

  </div>`
}

// ── F3: Modal firma y aprobar (individual) ──
function abrirFirmaYAprobar(csfId, csfNumero) {
  el('modal-firma-validador').style.display = 'flex'
  el('modal-firma-contenido').innerHTML = _htmlModalFirma(csfId, csfNumero, false)
}

// ── F5: Aprobar todas masivamente ──
async function abrirFirmaYAprobarTodas() {
  el('modal-firma-validador').style.display = 'flex'
  el('modal-firma-contenido').innerHTML = _htmlModalFirma(null, null, true)
}

function _htmlModalFirma(csfId, csfNumero, esmasiva) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.25rem">
      <div>
        <div class="modal-titulo">${esmasiva ? 'Aprobar todas las CSF' : `Aprobar ${csfNumero}`}</div>
        <div style="font-size:.75rem;color:var(--muted)">
          ${esmasiva ? 'Se aplicará la misma firma a todas las CSF en revisión' : 'Ingrese sus datos para validar la CSF'}
        </div>
      </div>
      <button onclick="el('modal-firma-validador').style.display='none'" class="btn-cerrar">✕</button>
    </div>

    ${esmasiva ? `
    <div style="background:#EBF3FB;border:1px solid var(--azul);border-radius:8px;padding:.65rem .85rem;font-size:.78rem;color:var(--azul);margin-bottom:1rem">
      📋 La firma se aplicará a <strong>todas</strong> las CSF en estado "En Revisión" que están listadas.
    </div>` : ''}

    <div class="g2" style="margin-bottom:1rem">
      <div class="campo" style="grid-column:1/-1">
        <label>Nombre completo</label>
        <input id="firma-nombre" type="text" placeholder="Ej: Juan Alberto Pérez González" style="text-align:center"/>
      </div>
      <div class="campo">
        <label>Grado</label>
        <input id="firma-grado" type="text" placeholder="Ej: Subprefecto" style="text-align:center"/>
      </div>
      <div class="campo">
        <label>Cargo</label>
        <input id="firma-cargo" type="text" placeholder="Ej: Subprefecto Fronterizo" style="text-align:center"/>
      </div>
    </div>

    <!-- Imagen de firma -->
    <div class="campo" style="margin-bottom:1rem">
      <label>Imagen de firma <span style="font-size:.7rem;color:var(--muted)">(PNG/JPG, fondo transparente recomendado)</span></label>
      <input type="file" id="firma-imagen-input" accept="image/png,image/jpeg,image/jpg"
             style="display:block;margin-bottom:.5rem" onchange="previsualizarFirma(this)"/>
      <div id="firma-preview" style="text-align:center;min-height:60px;border:1px dashed var(--border);border-radius:6px;padding:.5rem;display:flex;align-items:center;justify-content:center">
        <span style="font-size:.75rem;color:var(--muted)">Vista previa de la firma</span>
      </div>
    </div>

    <!-- Vista previa del pie de firma -->
    <div style="background:#f9fdf9;border:1px solid #C2DECE;border-radius:8px;padding:.85rem;margin-bottom:1rem;text-align:center">
      <div style="font-size:.68rem;color:var(--muted);margin-bottom:.4rem">Vista previa del pie de firma</div>
      <div id="firma-preview-pie" style="display:inline-block;text-align:center">
        <div style="height:50px;display:flex;align-items:center;justify-content:center">
          <span style="font-size:.7rem;color:var(--muted)">[firma aquí]</span>
        </div>
        <div style="border-top:1px solid #000;padding-top:.25rem;margin-top:.1rem">
          <div id="pie-nombre" style="font-weight:700;font-size:.78rem"> </div>
          <div id="pie-grado"  style="font-size:.72rem"> </div>
          <div id="pie-cargo"  style="font-size:.72rem"> </div>
        </div>
      </div>
    </div>

    <div id="firma-resultado" style="font-size:.8rem;margin-bottom:.75rem"></div>

    <div style="display:flex;gap:.5rem">
      <button class="btn btn-primario" onclick="${esmasiva ? 'confirmarAprobacionMasiva()' : `confirmarAprobacion('${csfId}')`}">
        ✓ ${esmasiva ? 'Aprobar todas' : 'Aprobar CSF'}
      </button>
      <button class="btn btn-ghost" onclick="el('modal-firma-validador').style.display='none'">Cancelar</button>
    </div>`
}

// Actualizar vista previa del pie al escribir
document.addEventListener('input', e => {
  if (e.target.id === 'firma-nombre') { const el2 = el('pie-nombre'); if(el2) el2.textContent = e.target.value || ' ' }
  if (e.target.id === 'firma-grado')  { const el2 = el('pie-grado');  if(el2) el2.textContent = e.target.value || ' ' }
  if (e.target.id === 'firma-cargo')  { const el2 = el('pie-cargo');  if(el2) el2.textContent = e.target.value || ' ' }
})

function previsualizarFirma(input) {
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = e => {
    const prev = el('firma-preview')
    if (prev) prev.innerHTML = `<img src="${e.target.result}" style="max-height:70px;max-width:200px;object-fit:contain"/>`
    // También actualizar en el pie de firma
    const pie = el('firma-preview-pie')
    if (pie) {
      const imgExist = pie.querySelector('img')
      if (imgExist) { imgExist.src = e.target.result }
      else {
        const imgEl = document.createElement('img')
        imgEl.src   = e.target.result
        imgEl.style.cssText = 'height:55px;max-width:180px;object-fit:contain;display:block;margin:0 auto'
        pie.insertBefore(imgEl, pie.firstChild)
        const placeholder = pie.querySelector('span')
        if (placeholder) placeholder.remove()
      }
    }
  }
  reader.readAsDataURL(file)
}

// Convertir imagen a base64 para almacenar en Supabase (campo text)
async function _imagenABase64(input) {
  const file = input?.files?.[0]
  if (!file) return null
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.readAsDataURL(file)
  })
}

async function confirmarAprobacion(csfId) {
  const nombre  = el('firma-nombre')?.value?.trim()
  const grado   = el('firma-grado')?.value?.trim()
  const cargo   = el('firma-cargo')?.value?.trim()
  const resEl   = el('firma-resultado')

  if (!nombre || !grado || !cargo) {
    if (resEl) resEl.innerHTML = '<span style="color:var(--rojo)">Complete nombre, grado y cargo.</span>'
    return
  }

  const btn = el('modal-firma-contenido')?.querySelector('.btn-primario')
  if (btn) { btn.disabled = true; btn.textContent = 'Aprobando...' }

  const imagenB64 = await _imagenABase64(el('firma-imagen-input'))

  const { error } = await APP.sb.from('csf_mensual').update({
    estado:           'aprobada',
    aprobado_at:      new Date().toISOString(),
    aprobado_por:     APP.perfil?.id,
    firma_nombre:     nombre,
    firma_grado:      grado,
    firma_cargo:      cargo,
    firma_imagen_url: imagenB64,
  }).eq('id', csfId)

  if (error) {
    if (resEl) resEl.innerHTML = `<span style="color:var(--rojo)">Error: ${error.message}</span>`
    if (btn) { btn.disabled = false; btn.textContent = '✓ Aprobar CSF' }
    return
  }

  toast('CSF aprobada correctamente', 'ok')
  el('modal-firma-validador').style.display = 'none'
  await renderTabRevision()
}

// ── F5: Aprobación masiva ──
async function confirmarAprobacionMasiva() {
  const nombre = el('firma-nombre')?.value?.trim()
  const grado  = el('firma-grado')?.value?.trim()
  const cargo  = el('firma-cargo')?.value?.trim()
  const resEl  = el('firma-resultado')

  if (!nombre || !grado || !cargo) {
    if (resEl) resEl.innerHTML = '<span style="color:var(--rojo)">Complete nombre, grado y cargo.</span>'
    return
  }

  const btn = el('modal-firma-contenido')?.querySelector('.btn-primario')
  if (btn) { btn.disabled = true; btn.textContent = 'Aprobando...' }

  const imagenB64 = await _imagenABase64(el('firma-imagen-input'))

  // Traer todas en revisión
  const { data: enRevision } = await APP.sb.from('csf_mensual')
    .select('id,numero').eq('estado', 'en_revision')

  if (!enRevision?.length) {
    toast('No hay CSF en revisión', 'warn')
    el('modal-firma-validador').style.display = 'none'
    return
  }

  let aprobadas = 0
  let errores   = 0

  for (const csf of enRevision) {
    const { error } = await APP.sb.from('csf_mensual').update({
      estado:           'aprobada',
      aprobado_at:      new Date().toISOString(),
      aprobado_por:     APP.perfil?.id,
      firma_nombre:     nombre,
      firma_grado:      grado,
      firma_cargo:      cargo,
      firma_imagen_url: imagenB64,
    }).eq('id', csf.id)
    if (error) { errores++; console.error('Error aprobando', csf.numero, error) }
    else aprobadas++
  }

  toast(`${aprobadas} CSF aprobadas${errores > 0 ? ` · ${errores} con error` : ''}`, aprobadas > 0 ? 'ok' : 'err')
  el('modal-firma-validador').style.display = 'none'
  await renderTabRevision()
}

// ── F4: Tab Generación masiva ──
async function renderTabMasiva() {
  const zona    = el('csf-contenido')
  const hoy     = new Date()
  const anio    = hoy.getFullYear()
  const anios   = [anio - 1, anio, anio + 1]
  const mesRef  = ((hoy.getMonth() + 1) - 2 + 12) % 12 || 12
  const mesVig  = hoy.getMonth() + 1

  const opcionesAnio = anios.map(a =>
    `<option value="${a}" ${a === anio ? 'selected' : ''}>${a}</option>`).join('')

  const mesSel = (mesDefault) => MESES_ES.map((m, i) =>
    `<option value="${i+1}" ${i+1 === mesDefault ? 'selected' : ''}>${m}</option>`).join('')

  zona.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div class="sec-titulo">Generación masiva de CSF</div>
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:1rem;line-height:1.6">
        Genera automáticamente la CSF para <strong>todos los cuarteles</strong> usando los mismos
        parámetros de mes. Si un cuartel ya tiene CSF para el mes de vigencia seleccionado,
        el sistema preguntará qué hacer antes de continuar.
      </div>
      <div class="g3" style="margin-bottom:1rem">
        <div class="campo">
          <label>Mes referencia</label>
          <div style="display:flex;gap:.4rem">
            <select id="masiva-ref-mes" style="flex:1">${mesSel(mesRef)}</select>
            <select id="masiva-ref-anio" style="width:85px">${opcionesAnio}</select>
          </div>
        </div>
        <div class="campo">
          <label>Mes vigencia</label>
          <div style="display:flex;gap:.4rem">
            <select id="masiva-vig-mes" style="flex:1">${mesSel(mesVig)}</select>
            <select id="masiva-vig-anio" style="width:85px">${opcionesAnio}</select>
          </div>
        </div>
        <div class="campo">
          <label>Clasificación</label>
          <select id="masiva-clasif">
            <option value="RESERVADO">RESERVADO</option>
            <option value="SECRETO">SECRETO</option>
            <option value="PUBLICO">PÚBLICO</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primario" onclick="iniciarGeneracionMasiva()">
        🏢 Generar CSF para todos los cuarteles
      </button>
    </div>

    <div id="masiva-progreso" style="display:none">
      <div class="card">
        <div class="sec-titulo" style="margin-bottom:.75rem">Progreso de generación</div>
        <div id="masiva-lista-progreso" style="display:flex;flex-direction:column;gap:.4rem"></div>
        <div style="margin-top:.85rem">
          <div style="background:var(--bg-alt);border-radius:4px;height:8px;overflow:hidden">
            <div id="masiva-barra" style="height:100%;background:var(--verde);width:0%;transition:width .4s"></div>
          </div>
          <div id="masiva-label" style="font-size:.75rem;color:var(--muted);margin-top:.3rem">Preparando...</div>
        </div>
      </div>
    </div>`
}

async function iniciarGeneracionMasiva() {
  const refMes   = parseInt(el('masiva-ref-mes')?.value)
  const refAnio  = parseInt(el('masiva-ref-anio')?.value)
  const vigMes   = parseInt(el('masiva-vig-mes')?.value)
  const vigAnio  = parseInt(el('masiva-vig-anio')?.value)
  const clasif   = el('masiva-clasif')?.value || 'RESERVADO'
  const cuarteles = APP.todosCuarteles || []

  if (!cuarteles.length) { toast('Sin cuarteles disponibles', 'err'); return }

  // Mostrar progreso
  const progDiv  = el('masiva-progreso')
  const listaDiv = el('masiva-lista-progreso')
  const barraEl  = el('masiva-barra')
  const labelEl  = el('masiva-label')
  if (progDiv) progDiv.style.display = 'block'

  // Inicializar filas de progreso
  if (listaDiv) {
    listaDiv.innerHTML = cuarteles.map(c => `
      <div id="masiva-fila-${c.id}" style="display:flex;align-items:center;gap:.5rem;font-size:.78rem;padding:.25rem .4rem;border-radius:4px">
        <span id="masiva-icon-${c.id}" style="width:1.2rem;text-align:center">⏳</span>
        <span>${c.nombre.replace(' (F)','')}</span>
        <span id="masiva-msg-${c.id}" style="font-size:.7rem;color:var(--muted);margin-left:auto"></span>
      </div>`).join('')
  }

  let generadas = 0; let saltadas = 0; let errores = 0

  for (let i = 0; i < cuarteles.length; i++) {
    const c = cuarteles[i]
    _masivaSetnIcon(c.id, '🔄', '#856404')
    if (labelEl) labelEl.textContent = `Procesando: ${c.nombre.replace(' (F)','')}...`

    try {
      // Verificar si ya existe CSF para este cuartel/mes (usar .limit(1) sin .single() para evitar error 406)
      const { data: existentes } = await APP.sb.from('csf_mensual')
        .select('id,numero,estado').eq('cuartel_id', c.id)
        .eq('mes_vigencia', vigMes).eq('anio_vigencia', vigAnio)
        .limit(1)
      const existente = existentes?.[0] || null

      if (existente) {
        // CSF publicada o aprobada: nunca tocar
        if (existente.estado === 'publicada' || existente.estado === 'aprobada') {
          _masivaSetnIcon(c.id, '🔒', '#1565C0')
          _masivaSetMsg(c.id, existente.estado === 'publicada' ? 'Ya publicada' : 'Ya aprobada')
          saltadas++
          _masivaActualizarBarra(i + 1, cuarteles.length, barraEl)
          continue
        }
        // Preguntar al usuario para borradores o en_revision
        const accion = await _preguntarSobreExistente(existente.numero, existente.estado)
        if (accion === 'cancelar') {
          _masivaSetnIcon(c.id, '✕', 'var(--rojo)')
          _masivaSetMsg(c.id, 'Cancelado')
          break
        }
        if (accion === 'saltar') {
          _masivaSetnIcon(c.id, '↷', 'var(--muted)')
          _masivaSetMsg(c.id, 'Saltado')
          saltadas++
          _masivaActualizarBarra(i + 1, cuarteles.length, barraEl)
          continue
        }
        // reemplazar: eliminar anterior (solo si borrador o en_revision)
        await APP.sb.from('csf_visitas_ordenadas').delete().eq('csf_id', existente.id)
        await APP.sb.from('csf_puntos_fvc').delete().eq('csf_id', existente.id)
        await APP.sb.from('csf_mensual').delete().eq('id', existente.id)
      }

      // Generar CSF para este cuartel
      const ok = await _generarCSFParaCuartel(c.id, refMes, refAnio, vigMes, vigAnio, clasif)
      if (ok) {
        _masivaSetnIcon(c.id, '✅', 'var(--verde)')
        _masivaSetMsg(c.id, 'Generada')
        generadas++
      } else {
        _masivaSetnIcon(c.id, '⚠', 'var(--amarillo)')
        _masivaSetMsg(c.id, 'Sin puntos')
        saltadas++
      }
    } catch(e) {
      _masivaSetnIcon(c.id, '❌', 'var(--rojo)')
      _masivaSetMsg(c.id, e.message?.substring(0,30) || 'Error')
      console.error('Masiva error cuartel', c.nombre, e)
      errores++
    }

    _masivaActualizarBarra(i + 1, cuarteles.length, barraEl)
  }

  if (labelEl) labelEl.textContent =
    `Completado: ${generadas} generadas · ${saltadas} saltadas · ${errores} errores`
  toast(`Generación masiva completada: ${generadas} CSF enviadas a revisión`, generadas > 0 ? 'ok' : 'warn')
}

function _masivaSetnIcon(cuartelId, icon, color) {
  const el2 = el(`masiva-icon-${cuartelId}`)
  if (el2) { el2.textContent = icon; el2.style.color = color || '' }
}
function _masivaSetMsg(cuartelId, msg) {
  const el2 = el(`masiva-msg-${cuartelId}`)
  if (el2) el2.textContent = msg
}
function _masivaActualizarBarra(actual, total, barraEl) {
  if (barraEl) barraEl.style.width = Math.round((actual / total) * 100) + '%'
}

// ── Genera la CSF de un cuartel específico (usado por masiva) ──
async function _generarCSFParaCuartel(cuartelId, refMes, refAnio, vigMes, vigAnio, clasif, csfIdExistente) {
  const iniRef  = `${refAnio}-${String(refMes).padStart(2,'0')}-01`
  const finRef  = new Date(refAnio, refMes, 0).toISOString().split('T')[0]
  const iniVig  = `${vigAnio}-${String(vigMes).padStart(2,'0')}-01`
  const finVig  = new Date(vigAnio, vigMes, 0).toISOString().split('T')[0]
  const iniAnual = `${vigAnio}-01-01`

  const { data: puntos } = await APP.sb.from('puntos_territoriales')
    .select('*').eq('cuartel_id', cuartelId).eq('activo', true)
  if (!puntos?.length) return false

  const { data: svcsRef } = await APP.sb.from('servicios').select('id')
    .eq('cuartel_id', cuartelId).gte('fecha', iniRef).lte('fecha', finRef)
  const svcIds = (svcsRef||[]).map(s => s.id)

  const { data: svcsAnual } = await APP.sb.from('servicios').select('id')
    .eq('cuartel_id', cuartelId).gte('fecha', iniAnual).lte('fecha', finVig)
  const svcIdsAnual = (svcsAnual||[]).map(s => s.id)

  const [
    { data: visitasRef },
    { data: personasRef },
    { data: incautRef },
    { data: obsRef },
    { data: visitasAnual },
  ] = await Promise.all([
    svcIds.length ? APP.sb.from('visitas_puntos').select('*').in('servicio_id', svcIds) : Promise.resolve({data:[]}),
    svcIds.length ? APP.sb.from('personas_registradas').select('*,hora_evento').in('servicio_id', svcIds) : Promise.resolve({data:[]}),
    svcIds.length ? APP.sb.from('incautaciones').select('*').in('servicio_id', svcIds) : Promise.resolve({data:[]}),
    svcIds.length ? APP.sb.from('observaciones_intel').select('*').in('servicio_id', svcIds) : Promise.resolve({data:[]}),
    svcIdsAnual.length ? APP.sb.from('visitas_puntos').select('punto_id,fecha').in('servicio_id', svcIdsAnual) : Promise.resolve({data:[]}),
  ])

  // Reutilizar la lógica de procesamiento de puntos de generarBorradorCSF
  const umbralAnualDias = { 'bimestral':60,'trimestral':90,'semestral':180 }
  const hoyD = new Date(iniVig + 'T12:00:00')
  const visitasAnualPorPunto = {}
  ;(visitasAnual||[]).forEach(v => {
    if (!visitasAnualPorPunto[v.punto_id] || v.fecha > visitasAnualPorPunto[v.punto_id])
      visitasAnualPorPunto[v.punto_id] = v.fecha
  })

  const puntosProcesados = (puntos||[]).map(p => {
    const visitasPunto  = (visitasRef||[]).filter(v => v.punto_id === p.id)
    const personasPunto = (personasRef||[]).filter(pr => pr.punto_id === p.id)
    const incautPunto   = (incautRef||[]).filter(i => i.punto_id === p.id)
    const obsPunto      = (obsRef||[]).filter(o => o.punto_id === p.id)

    const nivelesExcel = {
      trafico_migrantes: nivelDesdeDelito('trafico_migrantes', personasPunto.filter(pr=>pr.tipo_delito==='trafico_migrantes').length),
      ingreso_adulto:    nivelDesdeDelito('ingreso_adulto',    personasPunto.filter(pr=>pr.situacion_migratoria==='irregular'&&pr.grupo_etario==='adulto').length),
      ingreso_nna:       nivelDesdeDelito('ingreso_nna',       personasPunto.filter(pr=>pr.situacion_migratoria==='irregular'&&pr.grupo_etario==='nna').length),
      trafico_drogas:    nivelDesdeDelito('casos',             personasPunto.filter(pr=>pr.tipo_delito==='trafico_drogas').length),
      contrabando:       nivelDesdeDelito('casos',             incautPunto.filter(i=>['fardos_ropa','cigarrillos','fitozoosanitario'].includes(i.tipo_especie)).length),
      armas:             nivelDesdeDelito('casos',             personasPunto.filter(pr=>pr.tipo_delito==='ley_17798_armas').length),
      abigeato:          nivelDesdeDelito('casos',             personasPunto.filter(pr=>pr.tipo_delito==='abigeato').length),
    }
    const nivelExcel = Math.max(...Object.values(nivelesExcel), 1)
    const nObs = obsPunto.length
    const tieneHallazgoAlto = obsPunto.some(o => o.nivel_relevancia === 'alto')
    const tieneDelitoCOT    = personasPunto.some(pr => CSF_CONFIG.DELITOS_COT.includes(pr.tipo_delito))
    let prob = 1
    if (nObs === 1) prob = 2
    else if (nObs === 2) prob = 3
    else if (nObs >= 3 || tieneHallazgoAlto) prob = 4
    if (tieneDelitoCOT) prob = Math.min(prob + 1, 5)
    const valEst = { 'bajo':1,'medio':2,'alto':3,'critico':4 }[p.valor_estrategico]||2
    let consec = valEst
    if (tieneDelitoCOT) consec = Math.min(consec + 1, 5)
    const valorPxC  = prob * consec
    const nivelPxC  = nivelDesdeValorPxC(valorPxC)
    const nivelFinal = Math.max(nivelExcel, nivelPxC)
    const infoN     = infoNivel(nivelFinal)
    const fvcFinal  = maxFVC(p.fvc_base, CSF_CONFIG.FVC_POR_NIVEL[nivelFinal])

    // Horario dinámico (mismo algoritmo que generarBorradorCSF)
    const personasConHora = personasPunto.filter(pr => pr.hora_evento)
    let turno = 'diurno', horaIni = '08:00', horaFin = '14:00'
    if (p.tipo !== 'hito') {
      if (personasConHora.length >= 3) {
        const contPorHora = new Array(24).fill(0)
        personasConHora.forEach(pr => {
          const h = parseInt((pr.hora_evento||'00:00').split(':')[0])
          if (!isNaN(h)) contPorHora[h]++
        })
        let mejorInicio = 0, mejorSuma = -1
        for (let ini = 0; ini < 24; ini++) {
          let suma = 0
          for (let off = 0; off < 6; off++) suma += contPorHora[(ini + off) % 24]
          if (suma > mejorSuma) { mejorSuma = suma; mejorInicio = ini }
        }
        horaIni = `${String(mejorInicio).padStart(2,'0')}:00`
        horaFin = `${String((mejorInicio + 6) % 24).padStart(2,'0')}:00`
        turno   = mejorInicio >= 20 || mejorInicio < 6 ? 'nocturno' : 'diurno'
      } else {
        turno = 'nocturno'; horaIni = '20:00'; horaFin = '02:00'
      }
    }

    const umbral = umbralAnualDias[p.fvc_base]
    let pendienteAnual = false
    if (umbral) {
      const ultVisita = visitasAnualPorPunto[p.id]
      if (!ultVisita) { pendienteAnual = true }
      else {
        const dias = Math.ceil((hoyD - new Date(ultVisita + 'T12:00:00')) / 86400000)
        pendienteAnual = dias >= umbral
      }
    }

    let observacion = ''
    if (nivelFinal >= 4) observacion = 'Actividad COT confirmada. Prioridad máxima VIE-DOM.'
    else if (nivelFinal === 3) observacion = 'Indicios de actividad en sector. Reforzar cobertura.'
    else if (nObs > 0) observacion = `${nObs} observación(es) registrada(s) en el período.`
    else observacion = 'Sin actividad detectada. Vigilancia de rutina.'

    return { ...p, nivelExcel, nivelPxC, nivelFinal, infoN, fvcFinal, turno, horaIni, horaFin,
             observacion, prob, consec, valorPxC, pendienteAnual, nObs }
  }).sort((a,b) => b.nivelFinal - a.nivelFinal || a.tipo.localeCompare(b.tipo))

  const cotDelitos = (personasRef||[]).filter(pr => CSF_CONFIG.DELITOS_COT.includes(pr.tipo_delito))
  const delitoDom  = cotDelitos.length > 0
    ? Object.entries(cotDelitos.reduce((acc,pr) => { acc[pr.tipo_delito]=(acc[pr.tipo_delito]||0)+1; return acc },{}))
            .sort((a,b) => b[1]-a[1])[0]
    : null
  const amenaza = delitoDom
    ? `${delitoDom[0].replace(/_/g,' ')} confirmado (${delitoDom[1]} caso${delitoDom[1]>1?'s':''}).`
    : 'Sin actividad delictual confirmada. Mantener vigilancia preventiva.'

  const nroCsf = await siguienteNroCsf(cuartelId, { mes: vigMes, anio: vigAnio })
  const puntosPorFecha = distribuirVisitasEquilibradas(puntosProcesados, iniVig, finVig)

  // Si es una corrección, actualizar la CSF existente en vez de crear una nueva
  let csf, csfError
  if (csfIdExistente) {
    const { data: d, error: e } = await APP.sb.from('csf_mensual').update({
      amenaza_principal:     amenaza,
      estado:                'en_revision',
      enviado_revision_at:   new Date().toISOString(),
      correccion_autorizada_at:  new Date().toISOString(),
      correccion_autorizada_por: APP.perfil?.id,
    }).eq('id', csfIdExistente).select().single()
    csf = d; csfError = e
  } else {
    const { data: d, error: e } = await APP.sb.from('csf_mensual').insert({
      cuartel_id:            cuartelId,
      numero:                nroCsf,
      clasificacion:         clasif,
      mes_referencia:        refMes,
      anio_referencia:       refAnio,
      mes_vigencia:          vigMes,
      anio_vigencia:         vigAnio,
      fecha_emision:         hoyISO(),
      fecha_vigencia_inicio: iniVig,
      fecha_vigencia_fin:    finVig,
      amenaza_principal:     amenaza,
      estado:                'en_revision',
      enviado_revision_at:   new Date().toISOString(),
    }).select().single()
    csf = d; csfError = e
  }
  const error = csfError
  if (error) throw error

  await APP.sb.from('csf_puntos_fvc').insert(
    puntosProcesados.map(p => ({
      csf_id: csf.id, punto_id: p.id,
      nivel_excel: p.nivelExcel, nivel_pxc: p.nivelPxC, nivel_final: p.nivelFinal,
      nivel_texto: p.infoN.texto, probabilidad_texto: p.infoN.probabilidad,
      observacion: p.observacion, fvc_asignada: p.fvcFinal,
      turno_recomendado: p.turno, hora_inicio: p.horaIni, hora_termino: p.horaFin,
      meta_cumplimiento: p.nivelFinal >= 4 ? '≥ 90%' : p.nivelFinal === 3 ? '≥ 85%' : '≥ 75%',
    }))
  )

  await APP.sb.from('csf_visitas_ordenadas').insert(
    puntosPorFecha.map(v => ({
      csf_id: csf.id, punto_id: v.punto.id,
      numero_visita: v.nroGlobal, fecha_ordenada: v.fecha,
      hora_inicio: v.hora_inicio, hora_termino: v.hora_termino,
      turno: v.turno, estado: 'pendiente',
    }))
  )

  return true
}

// ── Rechazar CSF (validador devuelve a borrador con motivo) ──
async function rechazarCSF(csfId, csfNumero) {
  // Crear modal de rechazo con campo de motivo
  const modal = document.createElement('div')
  modal.id    = 'modal-rechazo-csf'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem'
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:1.5rem;max-width:420px;width:90%">
      <div style="font-size:1rem;font-weight:700;color:var(--rojo);margin-bottom:.5rem">
        ✕ Rechazar CSF ${csfNumero}
      </div>
      <div style="font-size:.8rem;color:var(--muted);margin-bottom:1rem;line-height:1.5">
        La CSF volverá a estado <strong>Borrador</strong>. El Comisario recibirá el motivo
        del rechazo y podrá corregirla y reenviarla a revisión.
      </div>
      <div class="campo" style="margin-bottom:1rem">
        <label style="font-size:.8rem">Motivo del rechazo <span style="color:var(--rojo)">*</span></label>
        <textarea id="rechazo-motivo" rows="3"
          placeholder="Indique el motivo por el cual se rechaza esta CSF (ej: horarios incorrectos, puntos faltantes, etc.)..."
          style="width:100%;border:1px solid var(--border);border-radius:6px;padding:.5rem;font-size:.8rem;resize:vertical"></textarea>
      </div>
      <div id="rechazo-resultado" style="font-size:.78rem;margin-bottom:.65rem"></div>
      <div style="display:flex;gap:.5rem">
        <button class="btn" style="background:#fdecea;color:#C0392B;border:1px solid #f5c6c6;flex:1"
          onclick="confirmarRechazoCSF('${csfId}','${csfNumero}')">
          ✕ Confirmar rechazo
        </button>
        <button class="btn btn-ghost" onclick="el('modal-rechazo-csf').remove()">Cancelar</button>
      </div>
    </div>`
  document.body.appendChild(modal)
}

async function confirmarRechazoCSF(csfId, csfNumero) {
  const motivo = el('rechazo-motivo')?.value?.trim()
  const resEl  = el('rechazo-resultado')
  if (!motivo || motivo.length < 10) {
    if (resEl) resEl.innerHTML = '<span style="color:var(--rojo)">Ingrese el motivo del rechazo (mínimo 10 caracteres).</span>'
    return
  }

  const btn = el('modal-rechazo-csf')?.querySelector('.btn')
  if (btn) { btn.disabled = true; btn.textContent = 'Rechazando...' }

  const { error } = await APP.sb.from('csf_mensual').update({
    estado:              'borrador',
    enviado_revision_at: null,
    observaciones:       `[RECHAZADA por Subprefecto] ${motivo}`,
  }).eq('id', csfId)

  if (error) {
    if (resEl) resEl.innerHTML = `<span style="color:var(--rojo)">Error: ${error.message}</span>`
    if (btn) { btn.disabled = false; btn.textContent = '✕ Confirmar rechazo' }
    return
  }

  toast(`CSF ${csfNumero} rechazada. El Comisario deberá corregirla.`, 'ok')
  el('modal-rechazo-csf')?.remove()
  await renderTabRevision()
}


// ============================================================
// CSF v4.1 — FLUJO DE CORRECCIÓN POR EXCEPCIÓN
// Flujo: publicada → en_correccion → en_revision → aprobada → publicada
// El número de la CSF no cambia. Se registra historial de cada versión.
// ============================================================

// ── PASO 1: Solicitar corrección (cualquier rol autorizado) ───
async function solicitarCorreccionCSF(csfId, numero) {
  const modal = document.createElement('div')
  modal.id = 'modal-solicitar-correccion'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem'
  modal.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:12px;width:min(96vw,520px);overflow:hidden">
      <div style="padding:.9rem 1.1rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700;font-size:.95rem">Solicitar corrección — CSF ${numero}</span>
        <button onclick="el('modal-solicitar-correccion').remove()" style="border:none;background:none;font-size:1.2rem;cursor:pointer">✕</button>
      </div>
      <div style="padding:1.1rem">
        <div style="background:#FEF3E2;border:1.5px solid #F5CBA7;border-radius:8px;padding:.75rem;margin-bottom:1rem;font-size:.78rem;color:#7B3F00;line-height:1.6">
          <strong>Atención:</strong> Esta acción cambiará la CSF publicada a estado "En corrección".
          La carta dejará de estar vigente hasta ser aprobada y publicada nuevamente.
          El número de la CSF se mantiene y quedará registro de esta corrección.
        </div>
        <div class="campo" style="margin-bottom:1rem">
          <label style="font-size:.82rem;font-weight:600">Motivo de la corrección <span style="color:var(--rojo)">*</span></label>
          <textarea id="correccion-motivo" rows="4" placeholder="Ej: Error en asignación de Hito 12 — corresponde a sector Caquena y no Visviri. Se solicita corrección conforme a instrucción SPF N°..."
            style="width:100%;font-size:.8rem;padding:.5rem;border:1px solid var(--border);border-radius:6px;resize:vertical;margin-top:.35rem"></textarea>
        </div>
        <div style="font-size:.72rem;color:var(--muted);margin-bottom:1rem">
          Se registrará: quién solicitó, fecha/hora, motivo. El SPF verá esta información al aprobar la corrección.
        </div>
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-primario" style="background:#7B3F00;border-color:#7B3F00"
            onclick="confirmarSolicitudCorreccion('${csfId}')">Confirmar solicitud</button>
          <button class="btn btn-ghost" onclick="el('modal-solicitar-correccion').remove()">Cancelar</button>
        </div>
      </div>
    </div>`
  document.body.appendChild(modal)
}

async function confirmarSolicitudCorreccion(csfId) {
  const motivo = el('correccion-motivo')?.value?.trim()
  if (!motivo) { toast('Ingresa el motivo de la corrección', 'err'); return }

  const btn = document.querySelector('#modal-solicitar-correccion .btn-primario')
  if (btn) { btn.disabled = true; btn.textContent = 'Procesando...' }

  // 1. Obtener CSF actual para hacer snapshot
  const { data: csf } = await APP.sb.from('csf_mensual').select('*').eq('id', csfId).single()
  if (!csf) { toast('CSF no encontrada', 'err'); return }

  const { data: visitasActuales } = await APP.sb.from('csf_visitas_ordenadas')
    .select('*').eq('csf_id', csfId).order('fecha_ordenada')

  const { data: puntosActuales } = await APP.sb.from('csf_puntos_fvc')
    .select('*').eq('csf_id', csfId)

  const nuevaVersion = (csf.version_correccion || 0) + 1

  // 2. Guardar snapshot en historial
  const { error: errSnap } = await APP.sb.from('csf_correcciones').insert({
    csf_id:           csfId,
    version:          nuevaVersion,
    motivo:           motivo,
    solicitada_por:   APP.perfil?.id,
    solicitada_at:    new Date().toISOString(),
    snapshot_visitas: visitasActuales || [],
    snapshot_puntos:  puntosActuales  || [],
  })
  if (errSnap) { toast('Error al registrar: ' + errSnap.message, 'err'); return }

  // 3. Cambiar estado a en_correccion
  const { error } = await APP.sb.from('csf_mensual').update({
    estado:                        'en_correccion',
    version_correccion:            nuevaVersion,
    correccion_motivo:             motivo,
    correccion_solicitada_at:      new Date().toISOString(),
    correccion_solicitada_por:     APP.perfil?.id,
  }).eq('id', csfId)

  if (error) { toast('Error: ' + error.message, 'err'); return }

  el('modal-solicitar-correccion')?.remove()
  toast(`CSF puesta en corrección (v${nuevaVersion}). El comisario puede editarla ahora.`, 'ok')
  await renderHistorial()
}

// ── PASO 2: Editor de corrección (Comisario / Admin) ──────────
async function abrirEditorCorreccion(csfId, numero) {
  const { data: csf } = await APP.sb.from('csf_mensual').select('*').eq('id', csfId).single()
  if (!csf) { toast('CSF no encontrada', 'err'); return }

  const modal = document.createElement('div')
  modal.id = 'modal-editor-correccion'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem'
  modal.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:12px;width:min(96vw,560px);overflow:hidden">
      <div style="padding:.9rem 1.1rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700;font-size:.95rem">Editor de corrección — CSF ${numero} v${csf.version_correccion}</span>
        <button onclick="el('modal-editor-correccion').remove()" style="border:none;background:none;font-size:1.2rem;cursor:pointer">✕</button>
      </div>
      <div style="padding:1.1rem">

        <div style="background:#FEF3E2;border:1px solid #F5CBA7;border-radius:8px;padding:.65rem .85rem;margin-bottom:1rem;font-size:.76rem;color:#7B3F00">
          <strong>Motivo registrado:</strong> ${csf.correccion_motivo || '—'}
        </div>

        <div style="font-size:.83rem;font-weight:600;margin-bottom:.75rem">¿Qué deseas corregir?</div>

        <div style="display:flex;flex-direction:column;gap:.65rem;margin-bottom:1.25rem">

          <button class="btn btn-secundario" style="text-align:left;padding:.75rem 1rem;height:auto"
            onclick="el('modal-editor-correccion').remove(); correccionEditarVisitas('${csfId}','${numero}')">
            <div style="font-weight:600;font-size:.85rem">📅 Editar días y horarios</div>
            <div style="font-size:.73rem;color:var(--muted);margin-top:.2rem">
              Modifica fechas y horarios de visitas ya programadas sin cambiar los puntos
            </div>
          </button>

          <button class="btn btn-secundario" style="text-align:left;padding:.75rem 1rem;height:auto"
            onclick="el('modal-editor-correccion').remove(); correccionRegenerarCompleta('${csfId}','${numero}',${csf.mes_vigencia},${csf.anio_vigencia},${csf.mes_referencia},${csf.anio_referencia},'${csf.clasificacion}')">
            <div style="font-weight:600;font-size:.85rem">🔄 Regenerar desde cero</div>
            <div style="font-size:.73rem;color:var(--muted);margin-top:.2rem">
              Recalcula puntos, criticidad y distribución de visitas completa.
              Útil para corregir puntos mal asignados o cambios de sector
            </div>
          </button>

        </div>

        <div style="border-top:1px solid var(--border);padding-top:.75rem">
          <div style="font-size:.73rem;color:var(--muted)">
            Al terminar la corrección, la CSF regresará al ciclo normal:
            enviar a revisión → aprobación del SPF → publicar
          </div>
        </div>

      </div>
    </div>`
  document.body.appendChild(modal)
}

// ── OPCIÓN A: Editar solo visitas (días y horarios) ───────────
async function correccionEditarVisitas(csfId, numero) {
  const { data: visitas } = await APP.sb.from('csf_visitas_ordenadas')
    .select('*,punto:puntos_territoriales(nombre,tipo)')
    .eq('csf_id', csfId).order('fecha_ordenada')

  const modal = document.createElement('div')
  modal.id = 'modal-correccion-visitas'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem'
  modal.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:12px;width:min(96vw,820px);max-height:90vh;display:flex;flex-direction:column">
      <div style="padding:.9rem 1.1rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700;font-size:.95rem">Corregir días y horarios — CSF ${numero}</span>
        <button onclick="el('modal-correccion-visitas').remove()" style="border:none;background:none;font-size:1.2rem;cursor:pointer">✕</button>
      </div>
      <div style="padding:.5rem .75rem;background:#FFF3CD;font-size:.75rem;color:#856404;border-bottom:1px solid #F0C040">
        Edita fecha y/o horario de cada visita. Haz clic en ✎ para editar. Al terminar usa "Enviar a revisión".
      </div>
      <div style="flex:1;overflow-y:auto;padding:.5rem">
        <table style="width:100%;border-collapse:collapse;font-size:.76rem">
          <thead>
            <tr style="background:#f0f0f2;position:sticky;top:0">
              <th style="padding:.35rem .6rem;text-align:center;width:40px">N°</th>
              <th style="padding:.35rem .6rem;text-align:left">Punto</th>
              <th style="padding:.35rem .6rem;text-align:center;width:55px">Tipo</th>
              <th style="padding:.35rem .6rem;text-align:left;width:160px">Fecha</th>
              <th style="padding:.35rem .6rem;text-align:left;width:85px">Inicio</th>
              <th style="padding:.35rem .6rem;text-align:left;width:85px">Término</th>
              <th style="padding:.35rem .6rem;text-align:center;width:65px">Editar</th>
            </tr>
          </thead>
          <tbody>
            ${(visitas||[]).map((v,i) => `
            <tr data-visita-id="${v.id}" style="${i%2===0?'background:#fafafa':''};border-bottom:1px solid #eee">
              <td style="padding:.3rem .6rem;text-align:center;font-weight:700">${String(v.numero_visita).padStart(2,'0')}</td>
              <td style="padding:.3rem .6rem;font-weight:500">${v.punto?.nombre||'—'}</td>
              <td style="padding:.3rem .6rem;text-align:center">
                <span style="font-size:.6rem;font-weight:700;padding:1px 4px;border-radius:3px;
                  background:${v.punto?.tipo==='hito'?'#e8f0fe':v.punto?.tipo==='pnh'?'#fdecea':'#e8f5ea'};
                  color:${v.punto?.tipo==='hito'?'#0055d4':v.punto?.tipo==='pnh'?'#C0392B':'#1A843F'}">
                  ${(v.punto?.tipo||'').toUpperCase()}
                </span>
              </td>
              <td data-campo="fecha" style="padding:.3rem .6rem">${v.fecha_ordenada}</td>
              <td data-campo="ini"   style="padding:.3rem .6rem;font-weight:500">${v.hora_inicio}</td>
              <td data-campo="fin"   style="padding:.3rem .6rem;font-weight:500">${v.hora_termino}</td>
              <td style="padding:.3rem .6rem;text-align:center">
                <button class="btn btn-sm btn-secundario"
                  data-vid="${v.id}" data-tipo="${v.punto?.tipo||'pnh'}"
                  onclick="editarVisitaCorreccion(this)" title="Editar">✎</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding:.75rem 1rem;border-top:1px solid var(--border);display:flex;gap:.5rem;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="el('modal-correccion-visitas').remove()">Cancelar</button>
        <button class="btn btn-primario" onclick="enviarCorreccionARevision('${csfId}')">
          → Enviar a revisión del SPF
        </button>
      </div>
    </div>`
  document.body.appendChild(modal)
}

function editarVisitaCorreccion(btn) {
  const visitaId  = btn.dataset.vid
  const tipoPunto = btn.dataset.tipo
  const fila      = btn.closest('tr[data-visita-id]')
  if (!fila) return

  const fechaEl = fila.querySelector('td[data-campo="fecha"]')
  const iniEl   = fila.querySelector('td[data-campo="ini"]')
  const finEl   = fila.querySelector('td[data-campo="fin"]')

  const fechaActual = fechaEl?.textContent?.trim()
  const hIniActual  = iniEl?.textContent?.trim()
  const hFinActual  = finEl?.textContent?.trim()

  fila.style.background = '#FFF9E6'

  if (fechaEl) fechaEl.innerHTML = `<input type="date" class="edit-fecha"
    value="${fechaActual}"
    style="width:135px;font-size:.75rem;padding:.2rem .3rem;border:1px solid var(--amarillo);border-radius:4px"/>`

  if (iniEl) iniEl.innerHTML = `<input type="time" class="edit-hora-ini"
    value="${hIniActual}"
    style="width:80px;font-size:.75rem;padding:.2rem .3rem;border:1px solid var(--amarillo);border-radius:4px"/>`

  if (finEl) finEl.innerHTML = `<input type="time" class="edit-hora-fin"
    value="${hFinActual}"
    style="width:80px;font-size:.75rem;padding:.2rem .3rem;border:1px solid var(--amarillo);border-radius:4px"/>`

  const tdBtn = btn.closest('td')
  if (tdBtn) {
    tdBtn.innerHTML = `
      <button class="btn btn-sm btn-primario" style="padding:.2rem .4rem"
        onclick="guardarVisitaCorreccion(this,'${visitaId}','${fechaActual}','${hIniActual}','${hFinActual}')">✓</button>
      <button class="btn btn-sm btn-ghost" style="padding:.2rem .3rem;margin-left:.2rem"
        onclick="cancelarEdicionCorreccion(this,'${fechaActual}','${hIniActual}','${hFinActual}')">✕</button>`
  }
}

async function guardarVisitaCorreccion(btn, visitaId, fechaOrig, hIniOrig, hFinOrig) {
  const fila   = btn.closest('tr[data-visita-id]')
  const fecha  = fila?.querySelector('.edit-fecha')?.value
  const hIni   = fila?.querySelector('.edit-hora-ini')?.value
  const hFin   = fila?.querySelector('.edit-hora-fin')?.value
  if (!fecha || !hIni || !hFin) return

  const { error } = await APP.sb.from('csf_visitas_ordenadas').update({
    fecha_ordenada: fecha,
    hora_inicio:    hIni,
    hora_termino:   hFin,
  }).eq('id', visitaId)

  if (error) { toast('Error: ' + error.message, 'err'); return }

  const fechaEl = fila.querySelector('td[data-campo="fecha"]')
  const iniEl   = fila.querySelector('td[data-campo="ini"]')
  const finEl   = fila.querySelector('td[data-campo="fin"]')
  if (fechaEl) fechaEl.textContent = fecha
  if (iniEl)   iniEl.innerHTML     = `<span style="font-weight:500">${hIni}</span>`
  if (finEl)   finEl.innerHTML     = `<span style="font-weight:500">${hFin}</span>`

  fila.style.background = '#E8F5EA'
  setTimeout(() => fila.style.background = '', 1200)

  const tdBtn = btn.closest('td')
  if (tdBtn) tdBtn.innerHTML = `<button class="btn btn-sm btn-secundario"
    data-vid="${visitaId}" data-tipo="pnh"
    onclick="editarVisitaCorreccion(this)" title="Editar">✎</button>`

  toast('Visita actualizada', 'ok')
}

function cancelarEdicionCorreccion(btn, fecha, hIni, hFin) {
  const fila = btn.closest('tr[data-visita-id]')
  if (!fila) return
  const fechaEl = fila.querySelector('td[data-campo="fecha"]')
  const iniEl   = fila.querySelector('td[data-campo="ini"]')
  const finEl   = fila.querySelector('td[data-campo="fin"]')
  if (fechaEl) fechaEl.textContent = fecha
  if (iniEl)   iniEl.textContent   = hIni
  if (finEl)   finEl.textContent   = hFin
  fila.style.background = ''
  const tdBtn = btn.closest('td')
  const vid = fila.dataset.visitaId
  if (tdBtn && vid) tdBtn.innerHTML = `<button class="btn btn-sm btn-secundario"
    data-vid="${vid}" data-tipo="pnh"
    onclick="editarVisitaCorreccion(this)" title="Editar">✎</button>`
}

// ── OPCIÓN B: Regenerar CSF desde cero manteniendo el número ──
async function correccionRegenerarCompleta(csfId, numero, vigMes, vigAnio, refMes, refAnio, clasif) {
  if (!confirm(`¿Regenerar completamente la CSF ${numero}? Se recalcularán todos los puntos y visitas.
El número de la CSF se mantiene.`)) return

  const zona = el('csf-contenido')
  if (zona) {
    zona.innerHTML = '<div class="cargando">Regenerando CSF...</div>'
    await cambiarTabCSF('historial')
  }

  const cuartelId = APP.cuartelActivo()?.id
  if (!cuartelId) { toast('Selecciona un cuartel', 'err'); return }

  // Borrar visitas y puntos actuales
  await APP.sb.from('csf_visitas_ordenadas').delete().eq('csf_id', csfId)
  await APP.sb.from('csf_puntos_fvc').delete().eq('csf_id', csfId)

  // Regenerar con los mismos parámetros
  const ok = await _generarCSFParaCuartel(cuartelId, refMes, refAnio, vigMes, vigAnio, clasif, csfId)

  if (ok) {
    toast('CSF regenerada. Lista para enviar a revisión.', 'ok')
  } else {
    toast('Error al regenerar la CSF', 'err')
  }
  await renderHistorial()
}

// ── PASO 3: Enviar corrección a revisión del SPF ──────────────
async function enviarCorreccionARevision(csfId) {
  if (!confirm('¿Enviar la CSF corregida a revisión del SPF?')) return

  const { error } = await APP.sb.from('csf_mensual').update({
    estado:                    'en_revision',
    enviado_revision_at:       new Date().toISOString(),
    correccion_autorizada_at:  null,
    correccion_autorizada_por: null,
  }).eq('id', csfId)

  if (error) { toast('Error: ' + error.message, 'err'); return }

  el('modal-correccion-visitas')?.remove()
  toast('CSF enviada a revisión del SPF. Flujo normal retomado.', 'ok')
  await renderHistorial()
}

// ── Ver historial de correcciones de una CSF ──────────────────
async function verHistorialCorrecciones(csfId, numero) {
  const { data: correcciones } = await APP.sb.from('csf_correcciones')
    .select('*').eq('csf_id', csfId).order('version')

  if (!correcciones?.length) {
    toast('Esta CSF no tiene correcciones registradas', 'info')
    return
  }

  const modal = document.createElement('div')
  modal.id = 'modal-historial-correcciones'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem'
  modal.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:12px;width:min(96vw,620px);max-height:88vh;display:flex;flex-direction:column">
      <div style="padding:.9rem 1.1rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700;font-size:.95rem">Historial de correcciones — CSF ${numero}</span>
        <button onclick="el('modal-historial-correcciones').remove()" style="border:none;background:none;font-size:1.2rem;cursor:pointer">✕</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:.85rem">
        ${correcciones.map(c => `
          <div style="border:1px solid var(--border);border-left:4px solid #F5CBA7;border-radius:8px;padding:.75rem .9rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem">
              <span style="background:#FEF3E2;color:#7B3F00;font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:4px">
                CORRECCIÓN v${c.version}
              </span>
              <span style="font-size:.72rem;color:var(--muted)">${c.solicitada_at ? new Date(c.solicitada_at).toLocaleString('es-CL') : '—'}</span>
            </div>
            <div style="font-size:.8rem;font-weight:600;margin-bottom:.3rem">Motivo:</div>
            <div style="font-size:.78rem;color:var(--text);background:var(--bg-alt,#f5f5f5);padding:.5rem .65rem;border-radius:6px;line-height:1.5">
              ${c.motivo || '—'}
            </div>
            ${c.autorizada_at ? `
            <div style="font-size:.72rem;color:var(--muted);margin-top:.4rem">
              Autorizada: ${new Date(c.autorizada_at).toLocaleString('es-CL')}
            </div>` : `
            <div style="font-size:.72rem;color:var(--amarillo);margin-top:.4rem">Pendiente de autorización</div>`}
          </div>`).join('')}
      </div>
      <div style="padding:.75rem 1rem;border-top:1px solid var(--border);text-align:right">
        <button class="btn btn-secundario" onclick="el('modal-historial-correcciones').remove()">Cerrar</button>
      </div>
    </div>`
  document.body.appendChild(modal)
}
