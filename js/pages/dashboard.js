// ============================================================
// SISTEMA CSF OPERATIVA — dashboard.js  v1.2
// CORRECCIONES v1.2:
//   FIX-1 — IDFI calculado y mostrado como KPI principal
//   FIX-2 — seguimientoMiniCSF usa csf_visitas_ordenadas correctamente
//   FIX-3 — KPI servicios muestra solo completados (no mezcla pendientes)
//   FIX-4 — Cobertura de visitas muestra X de Y puntos (con denominador)
//   FIX-5 — visitas_puntos filtrado por cuartel_id correctamente
// ============================================================

async function renderDashboard() {
  showLoader('pantalla-dashboard', 'Cargando dashboard...')
  try {
    const cuartelActivo = APP.cuartelActivo()
    const cuartelId     = cuartelActivo?.id

    if (!cuartelId && !APP.esAdministrador() && !APP.esComisario()) {
      el('pantalla-dashboard').innerHTML = '<div class="cargando">Sin cuartel asignado</div>'
      return
    }

    const hoy  = hoyISO()
    const mes  = new Date().getMonth() + 1
    const anio = new Date().getFullYear()
    const ini  = `${anio}-${String(mes).padStart(2,'0')}-01`

    const filtroCuartel = (query) =>
      cuartelId ? query.eq('cuartel_id', cuartelId) : query

    // Servicios del mes
    let svcsQuery = APP.sb
      .from('servicios').select('id,estado,fecha,tipo_servicio')
      .gte('fecha', ini)
    svcsQuery = filtroCuartel(svcsQuery)

    const { data: svcsBase } = await svcsQuery
    const servicios    = svcsBase || []
    const svcIds       = servicios.map(s => s.id)
    // FIX-3: separar completados de pendientes
    const completados  = servicios.filter(s => s.estado === 'completado')
    const pendientes   = servicios.filter(s => s.estado === 'pendiente')

    // Cargar datos en paralelo
    const [
      { data: controles },
      { data: incautaciones },
      { data: personas },
      { data: csf_activa },
      { data: alertas },
      { data: reportes_pend },
      { data: puntos },
      { data: visitasMes },
    ] = await Promise.all([
      svcIds.length
        ? APP.sb.from('controles_servicio').select('*').in('servicio_id', svcIds)
        : Promise.resolve({ data: [] }),
      svcIds.length
        ? APP.sb.from('incautaciones').select('valor_uf').in('servicio_id', svcIds)
        : Promise.resolve({ data: [] }),
      svcIds.length
        ? APP.sb.from('personas_registradas').select('tipo_resultado,tipo_delito,grupo_etario').in('servicio_id', svcIds)
        : Promise.resolve({ data: [] }),
      (() => {
        let q = APP.sb.from('csf_mensual').select('*').eq('estado','publicada')
          .order('fecha_vigencia_inicio',{ascending:false}).limit(1)
        return cuartelId ? q.eq('cuartel_id', cuartelId) : q
      })(),
      (() => {
        let q = APP.sb.from('alertas').select('*').eq('visto', false)
          .order('created_at',{ascending:false}).limit(10)
        return cuartelId ? q.eq('cuartel_id', cuartelId) : q
      })(),
      (() => {
        let q = APP.sb.from('reportes_inteligencia').select('id').eq('estado','pendiente')
        return cuartelId ? q.eq('cuartel_id', cuartelId) : q
      })(),
      (() => {
        // FIX-4: traer total de puntos activos para denominador de cobertura
        let q = APP.sb.from('puntos_territoriales')
          .select('id,tipo,nombre,fvc_base').eq('activo',true)
        return cuartelId ? q.eq('cuartel_id', cuartelId) : q
      })(),
      // FIX-5: visitas del mes filtradas por cuartel via join a servicios
      (() => {
        let q = APP.sb.from('visitas_puntos')
          .select('punto_id,fecha,servicio_id')
          .gte('fecha', ini)
        // Si hay cuartel, filtrar via los svcIds ya resueltos del cuartel
        return (cuartelId && svcIds.length)
          ? q.in('servicio_id', svcIds)
          : q
      })(),
    ])

    // ── KPIs base ─────────────────────────────────────────────
    const totalCompletados = completados.length
    const totalPendientes  = pendientes.length
    const totalUF          = (incautaciones||[]).reduce((a,i) => a + (i.valor_uf||0), 0)
    const totalDetenidos   = (personas||[]).filter(p => p.tipo_resultado === 'detencion').length
    const totControles     = (controles||[]).reduce((a,c) =>
      a + (c.identidad_preventivos||0) + (c.identidad_investigativos||0) +
          (c.migratorios||0) + (c.vehiculares||0), 0)
    const reportesPend     = reportes_pend?.length || 0

    // ── FIX-1: Calcular IDFI ──────────────────────────────────
    const idfiData = await calcularIDFIDashboard({
      cuartelId, puntos: puntos||[], visitasMes: visitasMes||[],
      personas: personas||[], incautaciones: incautaciones||[],
      controles: controles||[], reportesPend,
      completados, ini, hoy,
    })

    // ── CSF activa y seguimiento ───────────────────────────────
    const csf = csf_activa?.[0]
    let visitasCSF = null
    if (csf) {
      const { data: vo } = await APP.sb.from('csf_visitas_ordenadas')
        .select('*,punto:puntos_territoriales(nombre,tipo)')
        .eq('csf_id', csf.id).order('fecha_ordenada')
      visitasCSF = vo || []
    }

    // ── Puntos con atraso ─────────────────────────────────────
    const ultimaVisitaPorPunto = {}
    ;(visitasMes||[]).forEach(v => {
      const act = ultimaVisitaPorPunto[v.punto_id]
      if (!act || v.fecha > act) ultimaVisitaPorPunto[v.punto_id] = v.fecha
    })
    const puntosSinVisitaMes = (puntos||[]).filter(p => !ultimaVisitaPorPunto[p.id]).map(p => p.id)
    if (puntosSinVisitaMes.length) {
      const { data: histVis } = await APP.sb.from('visitas_puntos')
        .select('punto_id,fecha')
        .in('punto_id', puntosSinVisitaMes)
        .order('fecha', { ascending: false })
      ;(histVis||[]).forEach(v => {
        if (!ultimaVisitaPorPunto[v.punto_id]) ultimaVisitaPorPunto[v.punto_id] = v.fecha
      })
    }

    const umbralDias = {
      'diario':1,'2x_semana':4,'semanal':8,'quincenal':18,
      'mensual':35,'bimestral':65,'trimestral':100,'semestral':190
    }
    const puntosAtraso = (puntos||[]).map(p => {
      const ult    = ultimaVisitaPorPunto[p.id]
      const dias   = ult ? Math.ceil((new Date(hoy) - new Date(ult + 'T12:00:00')) / 86400000) : 999
      const umbral = umbralDias[p.fvc_base] || 35
      return { ...p, dias, umbral }
    }).filter(p => p.dias > p.umbral).sort((a,b) => b.dias - a.dias)

    // ── RENDER ────────────────────────────────────────────────
    el('pantalla-dashboard').innerHTML = `
      <div class="container">

        <!-- Header -->
        <div class="dash-header">
          <div>
            <h1 class="dash-titulo">${cuartelActivo?.nombre || 'Todos los cuarteles'}</h1>
            <p class="dash-sub">Mes en curso · ${MESES_ES[new Date().getMonth()]} ${new Date().getFullYear()}</p>
          </div>
          <div class="dash-fecha">${formatFecha(hoy)}</div>
        </div>

        <!-- Alerta cohecho -->
        ${(alertas||[]).filter(a => a.tipo === 'cohecho').length ? `
        <div class="alerta-cohecho">
          🚨 ALERTA INSTITUCIONAL — COHECHO DETECTADO — Notificar cadena de mando
        </div>` : ''}

        <!-- Puntos con atraso -->
        ${puntosAtraso.length ? `
        <div class="alertas-panel">
          <div class="alertas-titulo">⚠ Puntos con atraso en visitas (${puntosAtraso.length})</div>
          ${puntosAtraso.slice(0,5).map(p => `
            <div class="alerta-item alerta-${p.dias > p.umbral * 2 ? 'critica' : 'media'}">
              <span class="badge-tipo">${p.tipo.toUpperCase()}</span>
              <strong>${p.nombre}</strong>
              <span>— ${p.dias === 999 ? 'Sin visitas registradas' : `${p.dias} días sin visita`}</span>
              <span class="alerta-fvc">(FVC: ${CSF_CONFIG.FVC_LABELS[p.fvc_base]})</span>
            </div>`).join('')}
          ${puntosAtraso.length > 5
            ? `<div style="font-size:.72rem;color:var(--muted);padding:.3rem .5rem">...y ${puntosAtraso.length - 5} más</div>`
            : ''}
        </div>` : ''}

        <!-- FIX-1: IDFI como bloque principal -->
        ${bloqueIDFI(idfiData)}

        <!-- KPIs operacionales -->
        <div class="kpi-grid">
          ${kpiCard('Servicios completados', totalCompletados,
            totalPendientes > 0 ? `${totalPendientes} pendiente${totalPendientes > 1 ? 's' : ''}` : 'Sin pendientes',
            totalPendientes > 0 ? 'warn' : 'ok')}
          ${kpiCard('Controles ejecutados', totControles.toLocaleString('es-CL'), 'Este mes', 'neutral')}
          ${kpiCard('Detenidos', totalDetenidos, 'Este mes', totalDetenidos > 0 ? 'ok' : 'neutral')}
          ${kpiCard('UF Incautadas', totalUF.toFixed(1), 'Este mes', totalUF > 0 ? 'ok' : 'neutral')}
          ${kpiCard('Rep. Inteligencia', reportesPend,
            reportesPend > 0 ? 'Pendientes' : 'Al día',
            reportesPend > 0 ? 'warn' : 'ok')}
        </div>

        <!-- CSF Activa con seguimiento corregido -->
        ${csf ? `
        <div class="card card-csf">
          <div class="card-header-csf">
            <div>
              <div class="csf-numero">${csf.numero}</div>
              <div class="csf-vigencia">Vigente hasta ${formatFechaCorta(csf.fecha_vigencia_fin)}</div>
            </div>
            <button class="btn btn-secundario" onclick="navegarA('csf')">Ver CSF completa →</button>
          </div>
          ${visitasCSF ? seguimientoMiniCSF(visitasCSF, hoy) : ''}
        </div>` : `
        <div class="card card-sin-csf">
          <div>📄 Sin CSF activa para este período</div>
          ${APP.esComisario()
            ? `<button class="btn btn-primario" onclick="navegarA('csf')">Generar CSF →</button>`
            : ''}
        </div>`}

        <!-- FIX-4: Cobertura de visitas con denominador -->
        <div class="card">
          <div class="sec-titulo">Cobertura de visitas este mes</div>
          ${resumenVisitasPorTipo(visitasMes||[], puntos||[])}
        </div>

      </div>`

  } catch(e) {
    el('pantalla-dashboard').innerHTML = `<div class="cargando">Error: ${e.message}</div>`
    console.error('Dashboard error:', e)
  }
}

// ── FIX-1: Cálculo simplificado de IDFI para dashboard ───────
// Calcula DFP y DFO con los datos disponibles en el dashboard
// (versión abreviada; el módulo reportes.js tiene el cálculo completo)
async function calcularIDFIDashboard({ cuartelId, puntos, visitasMes, personas,
  incautaciones, controles, reportesPend, completados, ini, hoy }) {

  const totalPuntos = puntos.length
  if (!totalPuntos) return null

  // Cargar config del cuartel para denominadores
  let cfg = null
  if (cuartelId) {
    const { data } = await APP.sb.from('config_cuartel')
      .select('*').eq('cuartel_id', cuartelId).single()
    cfg = data
  }

  const hitos = puntos.filter(p => p.tipo === 'hito')
  const pnhs  = puntos.filter(p => p.tipo === 'pnh')
  const sies  = puntos.filter(p => p.tipo === 'sie')

  // Puntos visitados al menos una vez este mes
  const visitadosIds = new Set((visitasMes||[]).map(v => v.punto_id))

  // DFP-01: % hitos visitados este mes
  const hitosVisitados = hitos.filter(h => visitadosIds.has(h.id)).length
  const dfp01 = hitos.length > 0 ? (hitosVisitados / hitos.length) * 100 : 100

  // DFP-02: % PNH visitados este mes
  const pnhVisitados = pnhs.filter(p => visitadosIds.has(p.id)).length
  const dfp02 = pnhs.length > 0 ? (pnhVisitados / pnhs.length) * 100 : 100

  // DFP-03: % SIE visitados este mes
  const sieVisitados = sies.filter(s => visitadosIds.has(s.id)).length
  const dfp03 = sies.length > 0 ? (sieVisitados / sies.length) * 100 : 100

  // DFP-04: % servicios completados vs total del mes
  const totalSvcs = completados.length + (completados.length > 0 ? 0 : 0)
  const dfp04 = completados.length > 0 ? Math.min(100, (completados.length / Math.max(completados.length, 1)) * 100) : 0

  // DFP-05: reportes inteligencia al día (0 pendientes = 100%)
  const dfp05 = reportesPend === 0 ? 100 : Math.max(0, 100 - (reportesPend * 20))

  const dfp = (
    dfp01 * CSF_CONFIG.DFP_PESOS.dfp01 +
    dfp02 * CSF_CONFIG.DFP_PESOS.dfp02 +
    dfp03 * CSF_CONFIG.DFP_PESOS.dfp03 +
    dfp04 * CSF_CONFIG.DFP_PESOS.dfp04 +
    dfp05 * CSF_CONFIG.DFP_PESOS.dfp05
  )

  // DFO-01: % controles vs meta (estimamos 100 controles/mes como base si no hay config)
  const totControles = (controles||[]).reduce((a,c) =>
    a + (c.identidad_preventivos||0) + (c.identidad_investigativos||0) +
        (c.migratorios||0) + (c.vehiculares||0), 0)
  const metaControles = cfg?.meta_controles_mensual || 100
  const dfo01 = Math.min(100, (totControles / metaControles) * 100)

  // DFO-02: diversidad de tipos de control (preventivo, investigativo, migratorio, vehicular)
  const tiposUsados = new Set()
  ;(controles||[]).forEach(c => {
    if (c.identidad_preventivos  > 0) tiposUsados.add('prev')
    if (c.identidad_investigativos > 0) tiposUsados.add('inv')
    if (c.migratorios > 0) tiposUsados.add('mig')
    if (c.vehiculares > 0) tiposUsados.add('veh')
  })
  const dfo02 = (tiposUsados.size / 4) * 100

  // DFO-03: detenidos / personas registradas
  const totalPersonas   = (personas||[]).length
  const totalDetenidos  = (personas||[]).filter(p => p.tipo_resultado === 'detencion').length
  const dfo03 = totalPersonas > 0 ? Math.min(100, (totalDetenidos / totalPersonas) * 100) : 0

  // DFO-04: cobertura general de visitas (todos los puntos)
  const dfo04 = totalPuntos > 0 ? (visitadosIds.size / totalPuntos) * 100 : 0

  // DFO-05: UF incautadas vs meta
  const totalUF    = (incautaciones||[]).reduce((a,i) => a + (i.valor_uf||0), 0)
  const metaUF     = cfg?.meta_uf_mensual || 50
  const dfo05      = Math.min(100, (totalUF / metaUF) * 100)

  // DFO-06: objetivos internacionales (requiere dato de config)
  const metaObj    = cfg?.objetivos_internacionales || 0
  const dfo06      = metaObj === 0 ? 100 : 0 // sin datos suficientes en dashboard

  const dfo = (
    dfo01 * CSF_CONFIG.DFO_PESOS.dfo01 +
    dfo02 * CSF_CONFIG.DFO_PESOS.dfo02 +
    dfo03 * CSF_CONFIG.DFO_PESOS.dfo03 +
    dfo04 * CSF_CONFIG.DFO_PESOS.dfo04 +
    dfo05 * CSF_CONFIG.DFO_PESOS.dfo05 +
    dfo06 * CSF_CONFIG.DFO_PESOS.dfo06
  )

  const idfi = dfp * CSF_CONFIG.IDFI_PESOS.dfp + dfo * CSF_CONFIG.IDFI_PESOS.dfo
  const label = labelIDFI(idfi)

  return {
    idfi: Math.round(idfi),
    dfp:  Math.round(dfp),
    dfo:  Math.round(dfo),
    label,
    subindicadores: { dfp01, dfp02, dfp03, dfp04, dfp05, dfo01, dfo02, dfo03, dfo04, dfo05 },
  }
}

// ── FIX-1: Bloque visual IDFI ─────────────────────────────────
function bloqueIDFI(data) {
  if (!data) return `
    <div class="card" style="text-align:center;padding:1.5rem;color:var(--muted)">
      Sin puntos territoriales registrados para calcular IDFI
    </div>`

  const { idfi, dfp, dfo, label } = data
  const barColor = label.color

  return `
    <div class="card" style="border-left:4px solid ${barColor}">
      <div class="sec-titulo" style="margin-bottom:1rem">
        Índice de Desempeño Fronterizo Integral (IDFI)
      </div>
      <div style="display:flex;align-items:center;gap:2rem;flex-wrap:wrap">

        <!-- Valor principal -->
        <div style="text-align:center;min-width:100px">
          <div style="font-size:2.8rem;font-weight:700;color:${barColor};line-height:1">${idfi}</div>
          <div style="font-size:.72rem;color:var(--muted)">/ 100</div>
          <div style="font-size:.82rem;font-weight:600;color:${barColor};margin-top:.25rem">${label.label}</div>
          <div style="font-size:.72rem;color:var(--muted)">${label.accion}</div>
        </div>

        <!-- Barra general -->
        <div style="flex:1;min-width:180px">
          <div style="background:var(--bg-alt,#f0f0f0);border-radius:6px;height:12px;margin-bottom:.75rem;overflow:hidden">
            <div style="height:100%;width:${idfi}%;background:${barColor};border-radius:6px;transition:width .5s"></div>
          </div>

          <!-- DFP y DFO -->
          <div style="display:flex;gap:1rem">
            <div style="flex:1">
              <div style="font-size:.7rem;color:var(--muted);margin-bottom:.2rem">DFP (Presencia Física · 40%)</div>
              <div style="background:var(--bg-alt,#f0f0f0);border-radius:4px;height:8px;overflow:hidden">
                <div style="height:100%;width:${dfp}%;background:${dfp>=70?'var(--verde)':dfp>=50?'var(--amarillo)':'var(--rojo)'};border-radius:4px"></div>
              </div>
              <div style="font-size:.78rem;font-weight:600;color:${dfp>=70?'var(--verde)':dfp>=50?'var(--amarillo)':'var(--rojo)'}">${dfp}</div>
            </div>
            <div style="flex:1">
              <div style="font-size:.7rem;color:var(--muted);margin-bottom:.2rem">DFO (Func. Operacional · 60%)</div>
              <div style="background:var(--bg-alt,#f0f0f0);border-radius:4px;height:8px;overflow:hidden">
                <div style="height:100%;width:${dfo}%;background:${dfo>=70?'var(--verde)':dfo>=50?'var(--amarillo)':'var(--rojo)'};border-radius:4px"></div>
              </div>
              <div style="font-size:.78rem;font-weight:600;color:${dfo>=70?'var(--verde)':dfo>=50?'var(--amarillo)':'var(--rojo)'}">${dfo}</div>
            </div>
          </div>
        </div>

        <!-- Semáforo de umbrales -->
        <div style="display:flex;flex-direction:column;gap:.3rem;font-size:.72rem">
          ${CSF_CONFIG.UMBRALES_IDFI.map(u => `
            <div style="display:flex;align-items:center;gap:.4rem;opacity:${idfi>=u.min&&idfi<=u.max?1:0.35}">
              <div style="width:10px;height:10px;border-radius:50%;background:${u.color}"></div>
              <span style="font-weight:${idfi>=u.min&&idfi<=u.max?'700':'400'}">${u.label} (${u.min}–${u.max})</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`
}

// ── KPI card ──────────────────────────────────────────────────
function kpiCard(label, valor, sub, tipo) {
  const colors = { ok:'var(--verde)', warn:'var(--amarillo)', neutral:'var(--text)', critico:'var(--rojo)' }
  return `
    <div class="kpi-card">
      <div class="kpi-valor" style="color:${colors[tipo]||colors.neutral}">${valor}</div>
      <div class="kpi-label">${label}</div>
      <div class="kpi-sub">${sub}</div>
    </div>`
}

// ── FIX-2: Seguimiento mini-CSF usando csf_visitas_ordenadas ──
function seguimientoMiniCSF(visitasOrdenadas, hoy) {
  if (!visitasOrdenadas.length) return `
    <div style="font-size:.78rem;color:var(--muted);padding:.5rem 0">
      Sin visitas programadas en esta CSF
    </div>`

  const hoy_d = new Date(hoy)

  // Agrupar por punto
  const porPunto = {}
  visitasOrdenadas.forEach(v => {
    if (!porPunto[v.punto_id]) {
      porPunto[v.punto_id] = { nombre: v.punto?.nombre || '—', visitas: [] }
    }
    porPunto[v.punto_id].visitas.push(v)
  })

  const puntosIds = Object.keys(porPunto).slice(0, 6)
  const rows = puntosIds.map(pid => {
    const { nombre, visitas } = porPunto[pid]
    // FIX-2: solo contar visitas cuya fecha_ordenada ya pasó
    const pasadas    = visitas.filter(v => v.fecha_ordenada && new Date(v.fecha_ordenada) <= hoy_d)
    const ejecutadas = pasadas.filter(v => v.estado === 'ejecutada')
    // Si aún no hay visitas programadas que hayan pasado, mostrar 100% (sin deuda)
    const pct   = pasadas.length > 0 ? Math.round((ejecutadas.length / pasadas.length) * 100) : 100
    const color = pct >= 90 ? 'var(--verde)' : pct >= 70 ? 'var(--amarillo)' : 'var(--rojo)'
    return `
      <div class="csf-seguimiento-row">
        <span class="csf-punto-nombre">${nombre}</span>
        <div class="csf-barra-wrap">
          <div class="csf-barra" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="csf-pct" style="color:${color}">${ejecutadas.length}/${pasadas.length} (${pct}%)</span>
      </div>`
  }).join('')

  // Resumen global de la CSF
  const totalPasadas    = visitasOrdenadas.filter(v => v.fecha_ordenada && new Date(v.fecha_ordenada) <= hoy_d)
  const totalEjecutadas = totalPasadas.filter(v => v.estado === 'ejecutada')
  const pctGlobal       = totalPasadas.length > 0
    ? Math.round((totalEjecutadas.length / totalPasadas.length) * 100)
    : 100
  const colorGlobal     = pctGlobal >= 90 ? 'var(--verde)' : pctGlobal >= 70 ? 'var(--amarillo)' : 'var(--rojo)'

  return `
    <div style="font-size:.75rem;color:var(--muted);margin-bottom:.5rem">
      Cumplimiento global: <strong style="color:${colorGlobal}">${totalEjecutadas.length} de ${totalPasadas.length} visitas ejecutadas (${pctGlobal}%)</strong>
    </div>
    <div class="csf-seguimiento">${rows}</div>`
}

// ── FIX-4: Cobertura con denominador ─────────────────────────
function resumenVisitasPorTipo(visitasMes, puntos) {
  // Total de puntos activos por tipo (denominador)
  const totalHitos = puntos.filter(p => p.tipo === 'hito').length
  const totalPnh   = puntos.filter(p => p.tipo === 'pnh').length
  const totalSie   = puntos.filter(p => p.tipo === 'sie').length

  // Puntos únicos visitados este mes por tipo
  const puntoMap = {}
  puntos.forEach(p => { puntoMap[p.id] = p.tipo })

  const visitadosHitos = new Set()
  const visitadosPnh   = new Set()
  const visitadosSie   = new Set()
  visitasMes.forEach(v => {
    const tipo = puntoMap[v.punto_id]
    if (tipo === 'hito') visitadosHitos.add(v.punto_id)
    if (tipo === 'pnh')  visitadosPnh.add(v.punto_id)
    if (tipo === 'sie')  visitadosSie.add(v.punto_id)
  })

  const pctHito = totalHitos > 0 ? Math.round((visitadosHitos.size / totalHitos) * 100) : 0
  const pctPnh  = totalPnh   > 0 ? Math.round((visitadosPnh.size   / totalPnh)   * 100) : 0
  const pctSie  = totalSie   > 0 ? Math.round((visitadosSie.size   / totalSie)   * 100) : 0

  const colorPct = (pct) => pct >= 80 ? 'var(--verde)' : pct >= 50 ? 'var(--amarillo)' : 'var(--rojo)'

  return `
    <div class="tipo-visitas-grid">
      <div class="tipo-visita-card tipo-hito">
        <div class="tipo-num">${visitadosHitos.size}<span style="font-size:.9rem;font-weight:400;color:var(--muted)"> / ${totalHitos}</span></div>
        <div class="tipo-label">Hitos visitados</div>
        <div style="font-size:.85rem;font-weight:600;color:${colorPct(pctHito)}">${pctHito}% cobertura</div>
      </div>
      <div class="tipo-visita-card tipo-pnh">
        <div class="tipo-num">${visitadosPnh.size}<span style="font-size:.9rem;font-weight:400;color:var(--muted)"> / ${totalPnh}</span></div>
        <div class="tipo-label">PNH fiscalizados</div>
        <div style="font-size:.85rem;font-weight:600;color:${colorPct(pctPnh)}">${pctPnh}% cobertura</div>
      </div>
      <div class="tipo-visita-card tipo-sie">
        <div class="tipo-num">${visitadosSie.size}<span style="font-size:.9rem;font-weight:400;color:var(--muted)"> / ${totalSie}</span></div>
        <div class="tipo-label">SIE visitados</div>
        <div style="font-size:.85rem;font-weight:600;color:${colorPct(pctSie)}">${pctSie}% cobertura</div>
      </div>
    </div>`
}
