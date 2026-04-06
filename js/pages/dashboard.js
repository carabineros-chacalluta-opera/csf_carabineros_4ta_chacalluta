// ============================================================
// SISTEMA CSF OPERATIVA — dashboard.js  v1.1
// CORRECCIONES:
//   B1 — N+1 eliminado: una sola query para últimas visitas por punto
//   B1 — IDs de servicios resueltos UNA sola vez antes del Promise.all
// ============================================================

async function renderDashboard() {
  showLoader('pantalla-dashboard', 'Cargando dashboard...')
  try {
    // FIX B-CUARTEL: usar cuartel activo (puede ser null = todos)
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

    // FIX B-CUARTEL: helper para agregar filtro de cuartel solo si está definido
    const filtroCuartel = (query) =>
      cuartelId ? query.eq('cuartel_id', cuartelId) : query

    // B1: obtener IDs de servicios UNA sola vez
    let svcsQuery = APP.sb
      .from('servicios').select('id,estado,fecha,tipo_servicio')
      .gte('fecha', ini)
    svcsQuery = filtroCuartel(svcsQuery)

    const { data: svcsBase } = await svcsQuery
    const svcIds    = (svcsBase || []).map(s => s.id)
    const servicios = svcsBase || []

    // Cargar datos en paralelo con los IDs ya resueltos
    const [
      { data: visitas },
      { data: controles },
      { data: incautaciones },
      { data: personas },
      { data: csf_activa },
      { data: alertas },
      { data: reportes_pend },
      { data: puntos },
    ] = await Promise.all([
      // FIX B-FECHA: visitas del mes actual (correcto, solo para dashboard mes en curso)
      APP.sb.from('visitas_puntos').select('punto_id,fecha,semana_iso').gte('fecha', ini),
      svcIds.length
        ? APP.sb.from('controles_servicio').select('*').in('servicio_id', svcIds)
        : Promise.resolve({ data: [] }),
      svcIds.length
        ? APP.sb.from('incautaciones').select('valor_uf').in('servicio_id', svcIds)
        : Promise.resolve({ data: [] }),
      svcIds.length
        ? APP.sb.from('personas_registradas').select('tipo_resultado,tipo_delito,grupo_etario').in('servicio_id', svcIds)
        : Promise.resolve({ data: [] }),
      // FIX B-CUARTEL: filtrar CSF por cuartel activo
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
        let q = APP.sb.from('puntos_territoriales').select('id,tipo,nombre,fvc_base').eq('activo',true)
        return cuartelId ? q.eq('cuartel_id', cuartelId) : q
      })(),
    ])

    // KPIs
    const totalSvcs      = servicios.length
    const pendientes     = servicios.filter(s => s.estado === 'pendiente').length
    const totalUF        = (incautaciones||[]).reduce((a,i) => a + (i.valor_uf||0), 0)
    const totalDetenidos = (personas||[]).filter(p => p.tipo_resultado === 'detencion').length
    const totControles   = (controles||[]).reduce((a,c) =>
      a + (c.identidad_preventivos||0) + (c.identidad_investigativos||0) +
          (c.migratorios||0) + (c.vehiculares||0), 0)
    const reportesPend   = reportes_pend?.length || 0

    // CSF activa
    const csf = csf_activa?.[0]
    let visitasCSF = null
    if (csf) {
      const { data: vo } = await APP.sb.from('csf_visitas_ordenadas')
        .select('*,punto:puntos_territoriales(nombre,tipo)')
        .eq('csf_id', csf.id).order('fecha_ordenada')
      visitasCSF = vo
    }

    // B1: FIX N+1 — una sola query para última visita de cada punto
    // Agrupamos en JS el array ya cargado de visitas del mes
    const ultimaVisitaPorPunto = {}
    ;(visitas||[]).forEach(v => {
      const actual = ultimaVisitaPorPunto[v.punto_id]
      if (!actual || v.fecha > actual) ultimaVisitaPorPunto[v.punto_id] = v.fecha
    })
    // Para puntos sin visita en el mes actual, consultar histórico en una sola query
    const puntosSinVisita = (puntos||[]).filter(p => !ultimaVisitaPorPunto[p.id]).map(p => p.id)
    if (puntosSinVisita.length) {
      const { data: histVis } = await APP.sb.from('visitas_puntos')
        .select('punto_id,fecha')
        .in('punto_id', puntosSinVisita)
        .order('fecha', { ascending: false })
      ;(histVis||[]).forEach(v => {
        if (!ultimaVisitaPorPunto[v.punto_id]) ultimaVisitaPorPunto[v.punto_id] = v.fecha
      })
    }

    // Detectar puntos con atraso
    const hoy_d = new Date(hoy)
    const umbralDias = {
      'diario':1,'2x_semana':4,'semanal':8,'quincenal':18,'mensual':35,'bimestral':65
    }
    const puntosAtraso = (puntos||[]).map(p => {
      const ult  = ultimaVisitaPorPunto[p.id]
      const dias = ult ? Math.ceil((hoy_d - new Date(ult + 'T12:00:00')) / 86400000) : 999
      const umbral = umbralDias[p.fvc_base] || 35
      return { ...p, dias, umbral }
    }).filter(p => p.dias > p.umbral)
      .sort((a,b) => b.dias - a.dias)

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
          ${puntosAtraso.length > 5 ? `<div style="font-size:.72rem;color:var(--muted);padding:.3rem .5rem">...y ${puntosAtraso.length - 5} más</div>` : ''}
        </div>` : ''}

        <!-- KPIs -->
        <div class="kpi-grid">
          ${kpiCard('Servicios del mes',    totalSvcs,                    pendientes > 0 ? `${pendientes} pendientes` : 'Al día', pendientes > 0 ? 'warn' : 'ok')}
          ${kpiCard('Controles ejecutados', totControles.toLocaleString('es-CL'), 'Este mes', 'neutral')}
          ${kpiCard('Detenidos',            totalDetenidos,               'Este mes', totalDetenidos > 0 ? 'ok' : 'neutral')}
          ${kpiCard('UF Incautadas',        totalUF.toFixed(1),           'Este mes', totalUF > 0 ? 'ok' : 'neutral')}
          ${kpiCard('Rep. Inteligencia',    reportesPend,                 reportesPend > 0 ? 'Pendientes' : 'Al día', reportesPend > 0 ? 'warn' : 'ok')}
        </div>

        <!-- CSF Activa -->
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
          ${APP.esComisario() ? `<button class="btn btn-primario" onclick="navegarA('csf')">Generar CSF →</button>` : ''}
        </div>`}

        <!-- Visitas por tipo de punto -->
        <div class="card">
          <div class="sec-titulo">Visitas este mes por tipo de punto</div>
          ${resumenVisitasPorTipo(visitas||[], puntos||[])}
        </div>

      </div>`
  } catch(e) {
    el('pantalla-dashboard').innerHTML = `<div class="cargando">Error: ${e.message}</div>`
    console.error('Dashboard error:', e)
  }
}

function kpiCard(label, valor, sub, tipo) {
  const colors = { ok:'var(--verde)', warn:'var(--amarillo)', neutral:'var(--text)', critico:'var(--rojo)' }
  return `
    <div class="kpi-card">
      <div class="kpi-valor" style="color:${colors[tipo]||colors.neutral}">${valor}</div>
      <div class="kpi-label">${label}</div>
      <div class="kpi-sub">${sub}</div>
    </div>`
}

function seguimientoMiniCSF(visitas, hoy) {
  const hoy_d = new Date(hoy)
  const puntos_unicos = [...new Set(visitas.map(v => v.punto_id))]
  const rows = puntos_unicos.slice(0, 6).map(pid => {
    const pvs      = visitas.filter(v => v.punto_id === pid)
    const nombre   = pvs[0]?.punto?.nombre || '—'
    const pasadas  = pvs.filter(v => new Date(v.fecha_ordenada) <= hoy_d)
    const ejecutadas = pvs.filter(v => v.estado === 'ejecutada' && new Date(v.fecha_ordenada) <= hoy_d)
    const pct    = pasadas.length > 0 ? Math.round((ejecutadas.length / pasadas.length) * 100) : 100
    const color  = pct >= 90 ? 'var(--verde)' : pct >= 70 ? 'var(--amarillo)' : 'var(--rojo)'
    return `
      <div class="csf-seguimiento-row">
        <span class="csf-punto-nombre">${nombre}</span>
        <div class="csf-barra-wrap">
          <div class="csf-barra" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="csf-pct" style="color:${color}">${pct}%</span>
      </div>`
  }).join('')
  return `<div class="csf-seguimiento">${rows}</div>`
}

function resumenVisitasPorTipo(visitas, puntos) {
  const puntoMap = {}
  puntos.forEach(p => { puntoMap[p.id] = p.tipo })
  const cont = { hito: new Set(), pnh: new Set(), sie: new Set() }
  visitas.forEach(v => {
    const tipo = puntoMap[v.punto_id]
    if (tipo) cont[tipo].add(v.punto_id + '_' + v.fecha)
  })
  return `
    <div class="tipo-visitas-grid">
      <div class="tipo-visita-card tipo-hito">
        <div class="tipo-num">${cont.hito.size}</div>
        <div class="tipo-label">Visitas a Hitos</div>
      </div>
      <div class="tipo-visita-card tipo-pnh">
        <div class="tipo-num">${cont.pnh.size}</div>
        <div class="tipo-label">Fiscalizaciones PNH</div>
      </div>
      <div class="tipo-visita-card tipo-sie">
        <div class="tipo-num">${cont.sie.size}</div>
        <div class="tipo-label">Visitas SIE</div>
      </div>
    </div>`
}
