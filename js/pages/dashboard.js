// ============================================================
// SISTEMA CSF OPERATIVA — dashboard.js  v2.0
// CAMBIOS v2.0:
//   DASH-1 — Navegación por mes (← →) para ver histórico
//   DASH-2 — Vista multi-cuartel para Administrador/Comisario
//            con tabla comparativa IDFI + ranking por barras
//   DASH-3 — Todos los datos se refrescan al cambiar de mes
// ============================================================

// Estado de navegación del dashboard
let _dashMes       = new Date().getMonth() + 1
let _dashAnio      = new Date().getFullYear()
let _dashModoMulti = false  // true = vista todos los cuarteles

async function renderDashboard() {
  _dashMes       = new Date().getMonth() + 1
  _dashAnio      = new Date().getFullYear()
  _dashModoMulti = false
  await _renderDashboardConMes(_dashMes, _dashAnio)
}

async function dashNavMes(delta) {
  let m = _dashMes + delta
  let a = _dashAnio
  if (m > 12) { m = 1;  a++ }
  if (m < 1)  { m = 12; a-- }
  _dashMes  = m
  _dashAnio = a
  await _renderDashboardConMes(m, a)
}

async function dashToggleModoMulti() {
  _dashModoMulti = !_dashModoMulti
  await _renderDashboardConMes(_dashMes, _dashAnio)
}

async function _renderDashboardConMes(mes, anio) {
  showLoader('pantalla-dashboard', 'Cargando dashboard...')
  try {
    const cuartelActivo = APP.cuartelActivo()
    const cuartelId     = cuartelActivo?.id
    const puedeVerTodos = APP.esAdministrador() || APP.esComisario()
    const hoyReal       = hoyISO()
    const mesActual     = new Date().getMonth() + 1
    const anioActual    = new Date().getFullYear()
    const esHistorico   = !(mes === mesActual && anio === anioActual)

    if (!cuartelId && !puedeVerTodos) {
      el('pantalla-dashboard').innerHTML = '<div class="cargando">Sin cuartel asignado</div>'
      return
    }

    // Vista multi-cuartel: solo para admin/comisario
    if (_dashModoMulti && puedeVerTodos) {
      await _renderDashboardMultiCuartel(mes, anio, esHistorico)
      return
    }

    const ini      = `${anio}-${String(mes).padStart(2,'0')}-01`
    const fin      = new Date(anio, mes, 0).toISOString().split('T')[0]
    const fechaRef = esHistorico ? fin : hoyReal

    const filtroCuartel = (q) => cuartelId ? q.eq('cuartel_id', cuartelId) : q

    // Servicios del mes
    let svcsQuery = APP.sb.from('servicios')
      .select('id,estado,fecha,tipo_servicio')
      .gte('fecha', ini).lte('fecha', fin)
    svcsQuery = filtroCuartel(svcsQuery)

    const { data: svcsBase } = await svcsQuery
    const servicios   = svcsBase || []
    const svcIds      = servicios.map(s => s.id)
    const completados = servicios.filter(s => s.estado === 'completado')
    const pendientes  = servicios.filter(s => s.estado === 'pendiente')

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
          .gte('fecha_vigencia_inicio', ini)
          .lte('fecha_vigencia_fin', fin)
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
        let q = APP.sb.from('puntos_territoriales')
          .select('id,tipo,nombre,fvc_base').eq('activo',true)
        return cuartelId ? q.eq('cuartel_id', cuartelId) : q
      })(),
      (() => {
        let q = APP.sb.from('visitas_puntos')
          .select('punto_id,fecha,servicio_id')
          .gte('fecha', ini).lte('fecha', fin)
        return (cuartelId && svcIds.length) ? q.in('servicio_id', svcIds) : q
      })(),
    ])

    // KPIs base
    const totalCompletados = completados.length
    const totalPendientes  = pendientes.length
    const totalUF          = (incautaciones||[]).reduce((a,i) => a + (i.valor_uf||0), 0)
    const totalDetenidos   = (personas||[]).filter(p => p.tipo_resultado === 'detencion').length
    const totControles     = (controles||[]).reduce((a,c) =>
      a + (c.identidad_preventivos||0) + (c.identidad_investigativos||0) +
          (c.migratorios||0) + (c.vehiculares||0), 0)
    const reportesPend = reportes_pend?.length || 0

    // Calcular IDFI
    const idfiData = await calcularIDFIDashboard({
      cuartelId, puntos: puntos||[], visitasMes: visitasMes||[],
      personas: personas||[], incautaciones: incautaciones||[],
      controles: controles||[], reportesPend,
      completados, ini, hoy: fechaRef,
    })

    // CSF del período
    const csf = csf_activa?.[0]
    let visitasCSF = null
    if (csf) {
      const { data: vo } = await APP.sb.from('csf_visitas_ordenadas')
        .select('*,punto:puntos_territoriales(nombre,tipo)')
        .eq('csf_id', csf.id).order('fecha_ordenada')
      visitasCSF = vo || []
    }

    // Puntos con atraso (solo relevante en mes actual)
    const ultimaVisitaPorPunto = {}
    ;(visitasMes||[]).forEach(v => {
      const act = ultimaVisitaPorPunto[v.punto_id]
      if (!act || v.fecha > act) ultimaVisitaPorPunto[v.punto_id] = v.fecha
    })
    const puntosSinVisitaMes = (puntos||[]).filter(p => !ultimaVisitaPorPunto[p.id]).map(p => p.id)
    if (!esHistorico && puntosSinVisitaMes.length) {
      const { data: histVis } = await APP.sb.from('visitas_puntos')
        .select('punto_id,fecha').in('punto_id', puntosSinVisitaMes)
        .order('fecha', { ascending: false })
      ;(histVis||[]).forEach(v => {
        if (!ultimaVisitaPorPunto[v.punto_id]) ultimaVisitaPorPunto[v.punto_id] = v.fecha
      })
    }

    const umbralDias = {
      'diario':1,'2x_semana':4,'semanal':8,'quincenal':18,
      'mensual':35,'bimestral':65,'trimestral':100,'semestral':190
    }
    const puntosAtraso = !esHistorico ? (puntos||[]).map(p => {
      const ult    = ultimaVisitaPorPunto[p.id]
      const dias   = ult ? Math.ceil((new Date(fechaRef) - new Date(ult + 'T12:00:00')) / 86400000) : 999
      const umbral = umbralDias[p.fvc_base] || 35
      return { ...p, dias, umbral }
    }).filter(p => p.dias > p.umbral).sort((a,b) => b.dias - a.dias) : []

    const nombreMes = MESES_ES[mes - 1]
    const mesLabel  = `${nombreMes} ${anio}`

    // ── RENDER ────────────────────────────────────────────────
    el('pantalla-dashboard').innerHTML = `
      <div class="container">

        <!-- NAVEGACIÓN DE MES -->
        <div class="dash-nav-mes">
          <button class="btn btn-ghost btn-sm" onclick="dashNavMes(-1)">
            ◀ ${MESES_ES[(mes - 2 + 12) % 12]}
          </button>
          <div class="dash-nav-label ${esHistorico ? 'dash-nav-historico' : ''}">
            ${esHistorico ? '🕓 ' : '📅 '}<strong>${mesLabel}</strong>
          </div>
          <button class="btn btn-ghost btn-sm"
            ${!esHistorico ? 'disabled style="opacity:.35;cursor:default"' : ''}
            onclick="dashNavMes(1)">
            ${MESES_ES[mes % 12]} ▶
          </button>
          ${puedeVerTodos ? `
          <button class="btn btn-secundario btn-sm" onclick="dashToggleModoMulti()" style="margin-left:auto">
            🏢 Todos los cuarteles
          </button>` : ''}
        </div>

        <!-- BANNER HISTÓRICO -->
        ${esHistorico ? `
        <div style="background:var(--azul-cl,#EBF3FB);border:1px solid var(--azul,#2980B9);
            border-radius:8px;padding:.55rem .9rem;margin-bottom:.85rem;font-size:.8rem;
            color:var(--azul,#1a5f8a)">
          📋 Visualizando datos históricos de <strong>${mesLabel}</strong>.
          Los indicadores reflejan el cierre del mes.
        </div>` : ''}

        <!-- ALERTA COHECHO -->
        ${(alertas||[]).filter(a => a.tipo === 'cohecho').length ? `
        <div class="alerta-cohecho">
          🚨 ALERTA INSTITUCIONAL — COHECHO DETECTADO — Notificar cadena de mando
        </div>` : ''}

        <!-- Header -->
        <div class="dash-header">
          <div>
            <h1 class="dash-titulo">${cuartelActivo?.nombre || 'Todos los cuarteles'}</h1>
            <p class="dash-sub">${mesLabel}</p>
          </div>
          <div class="dash-fecha">${formatFecha(hoyReal)}</div>
        </div>

        <!-- PUNTOS CON ATRASO (solo mes actual) -->
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

        <!-- IDFI PRINCIPAL -->
        ${bloqueIDFI(idfiData)}

        <!-- KPIs -->
        <div class="kpi-grid">
          ${kpiCard('Servicios completados', totalCompletados,
            totalPendientes > 0 ? `${totalPendientes} pendiente${totalPendientes > 1 ? 's' : ''}` : 'Sin pendientes',
            totalPendientes > 0 ? 'warn' : 'ok')}
          ${kpiCard('Controles ejecutados', totControles.toLocaleString('es-CL'), mesLabel, 'neutral')}
          ${kpiCard('Detenidos', totalDetenidos, mesLabel, totalDetenidos > 0 ? 'ok' : 'neutral')}
          ${kpiCard('UF Incautadas', totalUF.toFixed(1), mesLabel, totalUF > 0 ? 'ok' : 'neutral')}
          ${kpiCard('Rep. Inteligencia', reportesPend,
            reportesPend > 0 ? 'Pendientes' : 'Al día',
            reportesPend > 0 ? 'warn' : 'ok')}
        </div>

        <!-- CSF DEL PERÍODO -->
        ${csf ? `
        <div class="card card-csf">
          <div class="card-header-csf">
            <div>
              <div class="csf-numero">${csf.numero}</div>
              <div class="csf-vigencia">Vigente hasta ${formatFechaCorta(csf.fecha_vigencia_fin)}</div>
            </div>
            <button class="btn btn-secundario" onclick="navegarA('csf')">Ver CSF completa →</button>
          </div>
          ${visitasCSF ? seguimientoMiniCSF(visitasCSF, fechaRef) : ''}
        </div>` : `
        <div class="card card-sin-csf">
          <div>📄 Sin CSF ${esHistorico ? 'registrada' : 'activa'} para ${mesLabel}</div>
          ${!esHistorico && APP.esComisario()
            ? `<button class="btn btn-primario" onclick="navegarA('csf')">Generar CSF →</button>`
            : ''}
        </div>`}

        <!-- COBERTURA DE VISITAS -->
        <div class="card">
          <div class="sec-titulo">Cobertura de visitas — ${mesLabel}</div>
          ${resumenVisitasPorTipo(visitasMes||[], puntos||[])}
        </div>

      </div>`

  } catch(e) {
    el('pantalla-dashboard').innerHTML = `<div class="cargando">Error: ${e.message}</div>`
    console.error('Dashboard error:', e)
  }
}

// ── DASH-2: Vista multi-cuartel comparativa ───────────────────
async function _renderDashboardMultiCuartel(mes, anio, esHistorico) {
  const ini       = `${anio}-${String(mes).padStart(2,'0')}-01`
  const fin       = new Date(anio, mes, 0).toISOString().split('T')[0]
  const hoyReal   = hoyISO()
  const mesLabel  = `${MESES_ES[mes - 1]} ${anio}`
  const cuarteles = APP.todosCuarteles || []

  if (!cuarteles.length) {
    el('pantalla-dashboard').innerHTML = '<div class="cargando">Sin cuarteles disponibles</div>'
    return
  }

  // Datos de cada cuartel en paralelo (limitar a 3 concurrentes para no saturar)
  const datosPorCuartel = []
  for (let i = 0; i < cuarteles.length; i += 3) {
    const lote   = cuarteles.slice(i, i + 3)
    const loteD  = await Promise.all(lote.map(c => _datosCuartelParaComparativa(c, ini, fin, esHistorico ? fin : hoyReal)))
    datosPorCuartel.push(...loteD)
  }

  // Ordenar por IDFI descendente
  datosPorCuartel.sort((a, b) => (b.idfi?.idfi || 0) - (a.idfi?.idfi || 0))

  const promIdfi = datosPorCuartel.filter(d => d.idfi).length > 0
    ? Math.round(datosPorCuartel.filter(d => d.idfi).reduce((a, d) => a + (d.idfi?.idfi || 0), 0)
        / datosPorCuartel.filter(d => d.idfi).length)
    : 0

  el('pantalla-dashboard').innerHTML = `
    <div class="container">

      <!-- NAVEGACIÓN -->
      <div class="dash-nav-mes">
        <button class="btn btn-ghost btn-sm" onclick="dashNavMes(-1)">
          ◀ ${MESES_ES[(mes - 2 + 12) % 12]}
        </button>
        <div class="dash-nav-label ${esHistorico ? 'dash-nav-historico' : ''}">
          ${esHistorico ? '🕓 ' : '📅 '}<strong>${mesLabel}</strong>
        </div>
        <button class="btn btn-ghost btn-sm"
          ${!esHistorico ? 'disabled style="opacity:.35;cursor:default"' : ''}
          onclick="dashNavMes(1)">
          ${MESES_ES[mes % 12]} ▶
        </button>
        <button class="btn btn-primario btn-sm" onclick="dashToggleModoMulti()" style="margin-left:auto">
          ← Mi cuartel
        </button>
      </div>

      <div class="dash-header">
        <div>
          <h1 class="dash-titulo">🏢 Todos los Cuarteles</h1>
          <p class="dash-sub">Comparativa IDFI · ${mesLabel}</p>
        </div>
        <div class="dash-fecha">${formatFecha(hoyReal)}</div>
      </div>

      ${esHistorico ? `
      <div style="background:var(--azul-cl,#EBF3FB);border:1px solid var(--azul,#2980B9);
          border-radius:8px;padding:.55rem .9rem;margin-bottom:.85rem;font-size:.8rem;
          color:var(--azul,#1a5f8a)">
        📋 Datos históricos de <strong>${mesLabel}</strong>
      </div>` : ''}

      <!-- KPIs AGREGADOS RED -->
      <div class="kpi-grid" style="margin-bottom:1rem">
        ${kpiCard('Cuarteles en red', cuarteles.length, 'Total activos', 'neutral')}
        ${kpiCard('IDFI promedio red', promIdfi, 'Red prefectura', promIdfi >= 70 ? 'ok' : promIdfi >= 50 ? 'warn' : 'critico')}
        ${kpiCard('Detenidos totales',
          datosPorCuartel.reduce((a, d) => a + d.totalDetenidos, 0),
          mesLabel, 'ok')}
        ${kpiCard('UF totales red',
          datosPorCuartel.reduce((a, d) => a + d.totalUF, 0).toFixed(1),
          mesLabel, 'neutral')}
      </div>

      <!-- TABLA COMPARATIVA -->
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:1rem">
        <div class="tabla-header" style="padding:.6rem 1rem">
          <span>Comparativa IDFI por cuartel — ${mesLabel}</span>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:.78rem">
            <thead>
              <tr style="background:var(--encabezado)">
                <th style="padding:.45rem .75rem;text-align:center;width:30px">#</th>
                <th style="padding:.45rem .75rem;text-align:left">Cuartel</th>
                <th style="padding:.45rem .75rem;text-align:center">IDFI</th>
                <th style="padding:.45rem .75rem;text-align:center">DFP</th>
                <th style="padding:.45rem .75rem;text-align:center">DFO</th>
                <th style="padding:.45rem .75rem;text-align:center">Svcs</th>
                <th style="padding:.45rem .75rem;text-align:center">Controles</th>
                <th style="padding:.45rem .75rem;text-align:center">Detenidos</th>
                <th style="padding:.45rem .75rem;text-align:center">UF</th>
                <th style="padding:.45rem .75rem;text-align:center">CSF</th>
              </tr>
            </thead>
            <tbody>
              ${datosPorCuartel.map((d, i) => {
                const score = d.idfi?.idfi ?? '—'
                const dfp   = d.idfi?.dfp  ?? '—'
                const dfo   = d.idfi?.dfo  ?? '—'
                const lbl   = d.idfi ? labelIDFI(d.idfi.idfi) : null
                const col   = lbl?.color || 'var(--muted)'
                const rowBg = i % 2 === 0 ? 'background:var(--tabla-datos)' : ''
                const cDfp  = typeof dfp === 'number' ? (dfp >= 70 ? 'var(--verde)' : dfp >= 50 ? 'var(--amarillo)' : 'var(--rojo)') : 'var(--muted)'
                const cDfo  = typeof dfo === 'number' ? (dfo >= 70 ? 'var(--verde)' : dfo >= 50 ? 'var(--amarillo)' : 'var(--rojo)') : 'var(--muted)'
                return `
                <tr style="${rowBg};border-bottom:1px solid var(--border)">
                  <td style="padding:.4rem .75rem;text-align:center;font-weight:700;color:var(--muted)">${i + 1}</td>
                  <td style="padding:.4rem .75rem;font-weight:600">
                    ${d.cuartel.nombre.replace(' (F)', '')}
                  </td>
                  <td style="padding:.4rem .75rem;text-align:center">
                    <span style="font-size:1.1rem;font-weight:700;color:${col}">${score}</span>
                    ${lbl ? `<div style="font-size:.6rem;color:${col}">${lbl.label}</div>` : ''}
                  </td>
                  <td style="padding:.4rem .75rem;text-align:center;font-weight:600;color:${cDfp}">${dfp}</td>
                  <td style="padding:.4rem .75rem;text-align:center;font-weight:600;color:${cDfo}">${dfo}</td>
                  <td style="padding:.4rem .75rem;text-align:center">
                    <span style="color:var(--verde)">${d.completados}</span>
                    ${d.pendientes > 0 ? `<span style="color:var(--amarillo);font-size:.7rem"> +${d.pendientes}p</span>` : ''}
                  </td>
                  <td style="padding:.4rem .75rem;text-align:center">${d.totControles.toLocaleString('es-CL')}</td>
                  <td style="padding:.4rem .75rem;text-align:center;font-weight:${d.totalDetenidos > 0 ? '700' : '400'};
                      color:${d.totalDetenidos > 0 ? 'var(--verde)' : 'inherit'}">${d.totalDetenidos}</td>
                  <td style="padding:.4rem .75rem;text-align:center">${d.totalUF.toFixed(1)}</td>
                  <td style="padding:.4rem .75rem;text-align:center">
                    ${d.tieneCsf
                      ? '<span style="color:var(--verde);font-weight:700;font-size:1rem">✓</span>'
                      : '<span style="color:var(--rojo);font-size:.7rem">Sin CSF</span>'}
                  </td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- RANKING GRÁFICO IDFI -->
      <div class="card">
        <div class="sec-titulo">Ranking IDFI — ${mesLabel}</div>
        <div style="display:flex;flex-direction:column;gap:.65rem;margin-top:.85rem">
          ${datosPorCuartel.map((d, i) => {
            const score = d.idfi?.idfi ?? 0
            const lbl   = d.idfi ? labelIDFI(score) : null
            const col   = lbl?.color || 'var(--muted)'
            return `
            <div style="display:grid;grid-template-columns:170px 1fr 48px;align-items:center;gap:.5rem">
              <div style="font-size:.78rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                <span style="color:var(--muted);font-size:.7rem;margin-right:.3rem">${i + 1}.</span>
                ${d.cuartel.nombre.replace(' (F)', '')}
              </div>
              <div style="background:var(--bg-alt,#f0f0f0);border-radius:4px;height:13px;overflow:hidden">
                <div style="height:100%;width:${score}%;background:${col};border-radius:4px;transition:width .6s ease"></div>
              </div>
              <div style="font-size:.85rem;font-weight:700;color:${col};text-align:right">${score || '—'}</div>
            </div>`
          }).join('')}
        </div>
      </div>

    </div>`
}

// ── Helper: cargar datos de un cuartel para la comparativa ────
async function _datosCuartelParaComparativa(c, ini, fin, fechaRef) {
  try {
    const { data: svcs } = await APP.sb.from('servicios')
      .select('id,estado').eq('cuartel_id', c.id)
      .gte('fecha', ini).lte('fecha', fin)
    const svcIds      = (svcs || []).map(s => s.id)
    const completados = (svcs || []).filter(s => s.estado === 'completado')
    const pendientes  = (svcs || []).filter(s => s.estado === 'pendiente').length

    const [
      { data: controles },
      { data: incautaciones },
      { data: personas },
      { data: puntos },
      { data: visitasMes },
      { data: csf_activa },
    ] = await Promise.all([
      svcIds.length ? APP.sb.from('controles_servicio').select('*').in('servicio_id', svcIds) : Promise.resolve({ data: [] }),
      svcIds.length ? APP.sb.from('incautaciones').select('valor_uf').in('servicio_id', svcIds) : Promise.resolve({ data: [] }),
      svcIds.length ? APP.sb.from('personas_registradas').select('tipo_resultado,tipo_delito,grupo_etario').in('servicio_id', svcIds) : Promise.resolve({ data: [] }),
      APP.sb.from('puntos_territoriales').select('id,tipo,nombre,fvc_base').eq('activo', true).eq('cuartel_id', c.id),
      svcIds.length
        ? APP.sb.from('visitas_puntos').select('punto_id,fecha,servicio_id').gte('fecha', ini).lte('fecha', fin).in('servicio_id', svcIds)
        : Promise.resolve({ data: [] }),
      APP.sb.from('csf_mensual').select('id').eq('cuartel_id', c.id).eq('estado', 'publicada')
        .gte('fecha_vigencia_inicio', ini).lte('fecha_vigencia_fin', fin).limit(1),
    ])

    const idfi = await calcularIDFIDashboard({
      cuartelId: c.id, puntos: puntos || [], visitasMes: visitasMes || [],
      personas: personas || [], incautaciones: incautaciones || [],
      controles: controles || [], reportesPend: 0,
      completados, ini, hoy: fechaRef,
    })

    const totControles   = (controles || []).reduce((a, ct) =>
      a + (ct.identidad_preventivos || 0) + (ct.identidad_investigativos || 0) +
          (ct.migratorios || 0) + (ct.vehiculares || 0), 0)
    const totalDetenidos = (personas || []).filter(p => p.tipo_resultado === 'detencion').length
    const totalUF        = (incautaciones || []).reduce((a, i) => a + (i.valor_uf || 0), 0)
    const tieneCsf       = (csf_activa || []).length > 0

    return { cuartel: c, idfi, completados: completados.length, pendientes, totControles, totalDetenidos, totalUF, tieneCsf }
  } catch (e) {
    console.error('Error cuartel', c.nombre, e)
    return { cuartel: c, idfi: null, completados: 0, pendientes: 0, totControles: 0, totalDetenidos: 0, totalUF: 0, tieneCsf: false }
  }
}

// ── Bloque visual IDFI ────────────────────────────────────────
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
        <div style="text-align:center;min-width:100px">
          <div style="font-size:2.8rem;font-weight:700;color:${barColor};line-height:1">${idfi}</div>
          <div style="font-size:.72rem;color:var(--muted)">/ 100</div>
          <div style="font-size:.82rem;font-weight:600;color:${barColor};margin-top:.25rem">${label.label}</div>
          <div style="font-size:.72rem;color:var(--muted)">${label.accion}</div>
        </div>
        <div style="flex:1;min-width:180px">
          <div style="background:var(--bg-alt,#f0f0f0);border-radius:6px;height:12px;margin-bottom:.75rem;overflow:hidden">
            <div style="height:100%;width:${idfi}%;background:${barColor};border-radius:6px;transition:width .5s"></div>
          </div>
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

function kpiCard(label, valor, sub, tipo) {
  const colors = { ok:'var(--verde)', warn:'var(--amarillo)', neutral:'var(--text)', critico:'var(--rojo)' }
  return `
    <div class="kpi-card">
      <div class="kpi-valor" style="color:${colors[tipo]||colors.neutral}">${valor}</div>
      <div class="kpi-label">${label}</div>
      <div class="kpi-sub">${sub}</div>
    </div>`
}

function seguimientoMiniCSF(visitasOrdenadas, hoy) {
  if (!visitasOrdenadas.length) return `
    <div style="font-size:.78rem;color:var(--muted);padding:.5rem 0">Sin visitas programadas en esta CSF</div>`

  const hoy_d = new Date(hoy)
  const porPunto = {}
  visitasOrdenadas.forEach(v => {
    if (!porPunto[v.punto_id]) porPunto[v.punto_id] = { nombre: v.punto?.nombre || '—', visitas: [] }
    porPunto[v.punto_id].visitas.push(v)
  })

  const puntosIds = Object.keys(porPunto).slice(0, 6)
  const rows = puntosIds.map(pid => {
    const { nombre, visitas } = porPunto[pid]
    const pasadas    = visitas.filter(v => v.fecha_ordenada && new Date(v.fecha_ordenada) <= hoy_d)
    const ejecutadas = pasadas.filter(v => v.estado === 'ejecutada')
    const pct   = pasadas.length > 0 ? Math.round((ejecutadas.length / pasadas.length) * 100) : 100
    const color = pct >= 90 ? 'var(--verde)' : pct >= 70 ? 'var(--amarillo)' : 'var(--rojo)'
    return `
      <div class="csf-seguimiento-row">
        <span class="csf-punto-nombre">${nombre}</span>
        <div class="csf-barra-wrap"><div class="csf-barra" style="width:${pct}%;background:${color}"></div></div>
        <span class="csf-pct" style="color:${color}">${ejecutadas.length}/${pasadas.length} (${pct}%)</span>
      </div>`
  }).join('')

  const totalPasadas    = visitasOrdenadas.filter(v => v.fecha_ordenada && new Date(v.fecha_ordenada) <= hoy_d)
  const totalEjecutadas = totalPasadas.filter(v => v.estado === 'ejecutada')
  const pctGlobal       = totalPasadas.length > 0 ? Math.round((totalEjecutadas.length / totalPasadas.length) * 100) : 100
  const colorGlobal     = pctGlobal >= 90 ? 'var(--verde)' : pctGlobal >= 70 ? 'var(--amarillo)' : 'var(--rojo)'

  return `
    <div style="font-size:.75rem;color:var(--muted);margin-bottom:.5rem">
      Cumplimiento global: <strong style="color:${colorGlobal}">${totalEjecutadas.length} de ${totalPasadas.length} visitas ejecutadas (${pctGlobal}%)</strong>
    </div>
    <div class="csf-seguimiento">${rows}</div>`
}

function resumenVisitasPorTipo(visitasMes, puntos) {
  const totalHitos = puntos.filter(p => p.tipo === 'hito').length
  const totalPnh   = puntos.filter(p => p.tipo === 'pnh').length
  const totalSie   = puntos.filter(p => p.tipo === 'sie').length

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
  const colorPct = pct => pct >= 80 ? 'var(--verde)' : pct >= 50 ? 'var(--amarillo)' : 'var(--rojo)'

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

// ── Cálculo simplificado de IDFI ──────────────────────────────
async function calcularIDFIDashboard({ cuartelId, puntos, visitasMes, personas,
  incautaciones, controles, reportesPend, completados, ini, hoy }) {

  const totalPuntos = puntos.length
  if (!totalPuntos) return null

  let cfg = null
  if (cuartelId) {
    const { data } = await APP.sb.from('config_cuartel').select('*').eq('cuartel_id', cuartelId).single()
    cfg = data
  }

  const hitos = puntos.filter(p => p.tipo === 'hito')
  const pnhs  = puntos.filter(p => p.tipo === 'pnh')
  const sies  = puntos.filter(p => p.tipo === 'sie')

  const visitadosIds = new Set((visitasMes || []).map(v => v.punto_id))

  const dfp01 = hitos.length > 0 ? (hitos.filter(h => visitadosIds.has(h.id)).length / hitos.length) * 100 : 100
  const dfp02 = pnhs.length  > 0 ? (pnhs.filter(p  => visitadosIds.has(p.id)).length  / pnhs.length)  * 100 : 100
  const dfp03 = sies.length  > 0 ? (sies.filter(s  => visitadosIds.has(s.id)).length  / sies.length)  * 100 : 100
  const dfp04 = completados.length > 0 ? 100 : 0
  const dfp05 = reportesPend === 0 ? 100 : Math.max(0, 100 - reportesPend * 20)

  const dfp = (
    dfp01 * CSF_CONFIG.DFP_PESOS.dfp01 +
    dfp02 * CSF_CONFIG.DFP_PESOS.dfp02 +
    dfp03 * CSF_CONFIG.DFP_PESOS.dfp03 +
    dfp04 * CSF_CONFIG.DFP_PESOS.dfp04 +
    dfp05 * CSF_CONFIG.DFP_PESOS.dfp05
  )

  const totControles = (controles || []).reduce((a, c) =>
    a + (c.identidad_preventivos || 0) + (c.identidad_investigativos || 0) +
        (c.migratorios || 0) + (c.vehiculares || 0), 0)

  const metaControles = cfg?.meta_controles_mensual || 100
  const dfo01 = Math.min(100, (totControles / metaControles) * 100)

  const tiposUsados = new Set()
  ;(controles || []).forEach(c => {
    if (c.identidad_preventivos   > 0) tiposUsados.add('prev')
    if (c.identidad_investigativos > 0) tiposUsados.add('inv')
    if (c.migratorios > 0) tiposUsados.add('mig')
    if (c.vehiculares > 0) tiposUsados.add('veh')
  })
  const dfo02 = (tiposUsados.size / 4) * 100

  const totalPersonas  = (personas || []).length
  const totalDetenidos = (personas || []).filter(p => p.tipo_resultado === 'detencion').length
  const dfo03 = totalPersonas > 0 ? Math.min(100, (totalDetenidos / totalPersonas) * 100) : 0
  const dfo04 = totalPuntos   > 0 ? (visitadosIds.size / totalPuntos) * 100 : 0

  const totalUF = (incautaciones || []).reduce((a, i) => a + (i.valor_uf || 0), 0)
  const metaUF  = cfg?.meta_uf_mensual || 50
  const dfo05   = Math.min(100, (totalUF / metaUF) * 100)
  const dfo06   = (cfg?.objetivos_internacionales || 0) === 0 ? 100 : 0

  const dfo = (
    dfo01 * CSF_CONFIG.DFO_PESOS.dfo01 +
    dfo02 * CSF_CONFIG.DFO_PESOS.dfo02 +
    dfo03 * CSF_CONFIG.DFO_PESOS.dfo03 +
    dfo04 * CSF_CONFIG.DFO_PESOS.dfo04 +
    dfo05 * CSF_CONFIG.DFO_PESOS.dfo05 +
    dfo06 * CSF_CONFIG.DFO_PESOS.dfo06
  )

  const idfi = dfp * CSF_CONFIG.IDFI_PESOS.dfp + dfo * CSF_CONFIG.IDFI_PESOS.dfo

  return {
    idfi: Math.round(idfi),
    dfp:  Math.round(dfp),
    dfo:  Math.round(dfo),
    label: labelIDFI(idfi),
    subindicadores: { dfp01, dfp02, dfp03, dfp04, dfp05, dfo01, dfo02, dfo03, dfo04, dfo05 },
  }
}
