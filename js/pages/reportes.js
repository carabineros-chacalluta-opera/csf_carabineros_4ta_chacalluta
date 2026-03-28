// ============================================================
// SISTEMA CSF OPERATIVA — reportes.js
// ============================================================

let _filtroRep = { desde: null, hasta: null, tipo_punto: 'todos', cuartel: null }

async function renderReportes() {
  const hoy = hoyISO()
  const ini = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`

  el('pantalla-reportes').innerHTML = `
    <div class="container">
      <h2 class="page-titulo">Reportes</h2>

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
        </div>
        <button class="btn btn-primario" onclick="cargarReportes()">Consultar</button>
      </div>

      <div id="reportes-contenido"><div class="cargando">Selecciona un período y consulta</div></div>
    </div>`
}

async function cargarReportes() {
  const desde    = el('rep-desde')?.value
  const hasta    = el('rep-hasta')?.value
  const tipoPunto= el('rep-tipo')?.value
  const zona     = el('reportes-contenido')

  showLoader('reportes-contenido', 'Consultando datos...')

  const cuartelId = APP.cuartel?.id

  // Servicios del período
  const { data: svcs } = await APP.sb.from('servicios')
    .select('id').eq('cuartel_id', cuartelId)
    .gte('fecha', desde).lte('fecha', hasta)
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
    APP.sb.from('puntos_territoriales').select('id,nombre,tipo').eq('cuartel_id', cuartelId).eq('activo',true),
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
