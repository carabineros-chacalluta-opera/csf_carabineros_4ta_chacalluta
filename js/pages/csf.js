// ============================================================
// SISTEMA CSF OPERATIVA — csf.js  v2.0
// CORRECCIONES v1.x:
//   FIX — APP.cuartel → APP.cuartelActivo() en todo el archivo
//   FIX — Administrador tiene acceso igual que Comisario
//   FIX — Eliminados elaborado_por/publicado_por del insert
//   B3  — exportarCSFPDF() real usando window.print()
//   B8  — tabs usan data-tab attribute
//   M3  — botón "Volver a borrador"
// NUEVAS v2.0:
//   V1  — Selectores manuales mes referencia y mes vigencia
//   V2  — Distribución equilibrada de visitas (pocos puntos/día)
//   V3  — Cumplimiento por semana ISO (no por cantidad)
//   V4  — Visión anual: puntos pendientes pasan a nueva CSF
//   V5  — Tabla criticidad: individuales ≥ nivel 2, agrupados por tipo nivel 1
// ============================================================

let _csfTab   = 'generar'
let _csfDatos = null

async function renderCSF() {
  el('pantalla-csf').innerHTML = `
    <div class="container">
      <div class="tabs-bar">
        ${tabBtn('generar',      '📄 Generar CSF')}
        ${tabBtn('seguimiento',  '📊 Seguimiento')}
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
      ? APP.sb.from('personas_registradas').select('*').in('servicio_id', svcIds)
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

    const obsNocturnas = obsPunto.filter(o => {
      const h = parseInt((o.created_at||'').substring(11,13))
      return h >= 20 || h < 8
    }).length
    const turno   = obsNocturnas > nObs / 2 ? 'nocturno' : 'diurno'
    const horaIni = turno === 'nocturno' ? '22:00' : '09:00'
    const horaFin = turno === 'nocturno' ? '06:00' : '17:00'

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
    <div style="display:grid;grid-template-columns:1fr 1fr;min-height:60px">
      <div style="border-right:1px solid #ddd;padding:.75rem .85rem;text-align:center">
        <div style="font-size:.7rem;margin-top:2rem;font-weight:700">Comisario · Validador</div>
      </div>
      <div style="padding:.75rem .85rem;text-align:center">
        <div style="font-size:.7rem;margin-top:2rem;font-weight:700">Subprefecto Fronterizo · Autorización</div>
      </div>
    </div>
  </div>
  </div>

  <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1rem">
    <button class="btn btn-primario" onclick="publicarCSF()">✓ Publicar CSF</button>
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

// B3: Exportar PDF
function exportarCSFPDF() {
  const printArea = el('csf-print-area')
  if (!printArea) { toast('Genere primero el borrador', 'err'); return }

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
    <body>${printArea.innerHTML}</body>
    </html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 500)
}

async function publicarCSF() {
  if (!_csfDatos) { toast('Genere primero el borrador','err'); return }
  if (!APP.cuartelActivo()?.id) {
    toast('Selecciona un cuartel antes de publicar la CSF', 'err')
    return
  }

  const { puntosProcesados, puntosPorFecha, amenaza, clasif, nroCsf, iniVig, finVig, mesVig, ref, cuartelId } = _csfDatos
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
      estado:                'publicada',
      publicado_at:          new Date().toISOString(),
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

    toast(`CSF ${nroCsf} publicada correctamente`, 'ok')
    _csfDatos = null
    await cambiarTabCSF('seguimiento')
  } catch(e) {
    toast('Error al publicar: ' + e.message, 'err')
    console.error('publicarCSF error:', e)
  }
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

// M3: despublicar CSF
async function despublicarCSF(csfId) {
  if (!confirm('¿Volver esta CSF a estado borrador? Se podrá corregir y volver a publicar.')) return
  const { error } = await APP.sb.from('csf_mensual')
    .update({ estado: 'borrador', publicado_at: null, publicado_por: null })
    .eq('id', csfId)
  if (error) { toast('Error al despublicar: ' + error.message, 'err'); return }
  toast('CSF vuelta a borrador. Genere una nueva versión.', 'ok')
  await cambiarTabCSF('historial')
}

// ── TAB HISTORIAL ────────────────────────────────────────────
async function renderHistorial() {
  const zona = el('csf-contenido')
  const { data: csfs } = await APP.sb.from('csf_mensual')
    .select('*').eq('cuartel_id', APP.cuartelActivo()?.id)
    .order('created_at', { ascending: false }).limit(20)

  zona.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden">
      <div style="background:#f5f5f7;padding:.5rem .85rem;font-size:.74rem;font-weight:700">Historial de CSF</div>
      <table style="width:100%;border-collapse:collapse;font-size:.75rem">
        <thead>
          <tr style="background:#f0f0f2">
            <th style="padding:.35rem .6rem;text-align:left">N° CSF</th>
            <th style="padding:.35rem .6rem;text-align:left">Emisión</th>
            <th style="padding:.35rem .6rem;text-align:left">Vigencia</th>
            <th style="padding:.35rem .6rem;text-align:center">Clasificación</th>
            <th style="padding:.35rem .6rem;text-align:center">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${(csfs||[]).map((c,i) => `
            <tr style="${i%2===0?'background:#fafafa':''};border-bottom:1px solid var(--border)">
              <td style="padding:.35rem .6rem;font-weight:700">${c.numero}</td>
              <td style="padding:.35rem .6rem">${formatFechaCorta(c.fecha_emision)}</td>
              <td style="padding:.35rem .6rem">${formatFechaCorta(c.fecha_vigencia_inicio)} → ${formatFechaCorta(c.fecha_vigencia_fin)}</td>
              <td style="padding:.35rem .6rem;text-align:center">
                <span style="background:#fff0f1;color:#C0392B;font-size:.65rem;font-weight:700;padding:1px 6px;border-radius:3px">
                  ${c.clasificacion}
                </span>
              </td>
              <td style="padding:.35rem .6rem;text-align:center">
                <span style="background:${c.estado==='publicada'?'#e8f5ea':'#f0f0f2'};color:${c.estado==='publicada'?'#1A843F':'#666'};font-size:.65rem;font-weight:700;padding:1px 6px;border-radius:3px">
                  ${c.estado.toUpperCase()}
                </span>
              </td>
            </tr>`).join('')}
          ${!csfs?.length ? '<tr><td colspan="5" style="padding:2rem;text-align:center;color:var(--muted)">Sin CSF generadas</td></tr>' : ''}
        </tbody>
      </table>
    </div>`
}
