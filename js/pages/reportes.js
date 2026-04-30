// ============================================================
// SISTEMA CSF OPERATIVA — reportes.js  v2.0
// CAMBIOS v2.0:
//   REP-1 — Dashboard de reportes con KPIs expandidos y gráficos
//            de barras (HTML puro, sin librerías externas)
//   REP-2 — Botón "Cuenta Delitos Frontera" que descarga el Excel
//            en el formato exacto del archivo estándar (36 columnas)
//   REP-3 — Mapa de coordenadas Leaflet conservado íntegramente
// ============================================================

// ── PANTALLA REPORTES ─────────────────────────────────────────
async function renderReportes() {
  showLoader('pantalla-reportes', 'Cargando reportes...')

  const cuartelActivo = APP.cuartelActivo()
  const puedeVerTodos = APP.esAdministrador() || APP.esComisario()
  const hoy           = hoyISO()
  const anio          = new Date().getFullYear()
  const ini           = `${anio}-01-01`

  el('pantalla-reportes').innerHTML = `
    <div class="container">
      <div class="flex-sb" style="margin-bottom:.5rem">
        <h2 class="page-titulo">Reportes operativos</h2>
        <button class="btn btn-primario" id="btn-cuenta-delitos"
          onclick="exportarCuentaDelitos()"
          style="background:#1565C0;border-color:#1565C0">
          ↓ Cuenta Delitos Frontera
        </button>
      </div>
      <div class="card filtros-card" style="margin-bottom:1rem">
        <div class="g3">
          <div class="campo">
            <label>Desde</label>
            <input type="date" id="rep-desde" value="${ini}"/>
          </div>
          <div class="campo">
            <label>Hasta</label>
            <input type="date" id="rep-hasta" value="${hoy}"/>
          </div>
          ${puedeVerTodos ? `
          <div class="campo">
            <label>Cuartel</label>
            <select id="rep-cuartel">
              <option value="">— Todos —</option>
              ${(APP.todosCuarteles||[]).map(c =>
                `<option value="${c.id}" ${c.id===cuartelActivo?.id?'selected':''}>${c.nombre.replace(' (F)','')}</option>`
              ).join('')}
            </select>
          </div>` : ''}
        </div>
        <button class="btn btn-primario" onclick="consultarReportes()" style="margin-top:.75rem">Consultar</button>
      </div>
      <div id="rep-contenido"><div class="cargando">Presiona Consultar para cargar los datos.</div></div>
    </div>`
}

async function consultarReportes() {
  showLoader('rep-contenido', 'Cargando datos...')
  const desde         = el('rep-desde')?.value
  const hasta         = el('rep-hasta')?.value
  const cuartelFilt   = el('rep-cuartel')?.value || APP.cuartelActivo()?.id
  const puedeVerTodos = APP.esAdministrador() || APP.esComisario()

  try {
    // ── Servicios con conteos ─────────────────────────────────
    let svcsQ = APP.sb.from('servicios')
      .select('*, cuartel:cuarteles(nombre), visitas:visitas_puntos(count), incautaciones(count), observaciones_intel(count)')
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: false })
    if (cuartelFilt)       svcsQ = svcsQ.eq('cuartel_id', cuartelFilt)
    else if (!puedeVerTodos) svcsQ = svcsQ.eq('cuartel_id', APP.cuartel?.id)

    const { data: servicios, error } = await svcsQ
    if (error) throw error

    const svcIds = (servicios||[]).map(s => s.id)

    // ── Cargar datos detallados en paralelo ───────────────────
    const [
      { data: personas },
      { data: incautaciones },
      { data: controles },
      { data: observaciones },
    ] = await Promise.all([
      svcIds.length
        ? APP.sb.from('personas_registradas')
            .select('tipo_resultado,tipo_delito,grupo_etario,nacionalidad,sexo,modo_operandi_id')
            .in('servicio_id', svcIds)
        : Promise.resolve({ data: [] }),
      svcIds.length
        ? APP.sb.from('incautaciones')
            .select('tipo_especie,valor_uf,valor_clp,cantidad,sustancia_droga')
            .in('servicio_id', svcIds)
        : Promise.resolve({ data: [] }),
      svcIds.length
        ? APP.sb.from('controles_servicio')
            .select('identidad_preventivos,identidad_investigativos,migratorios,vehiculares,flagrancias')
            .in('servicio_id', svcIds)
        : Promise.resolve({ data: [] }),
      svcIds.length
        ? APP.sb.from('observaciones_intel')
            .select('nivel_relevancia,tipo_hallazgo')
            .in('servicio_id', svcIds)
        : Promise.resolve({ data: [] }),
    ])

    // ── KPIs ──────────────────────────────────────────────────
    const totalSvcs      = servicios?.length || 0
    const completados    = servicios?.filter(s => s.estado === 'completado').length || 0
    const pendientes     = servicios?.filter(s => s.estado === 'pendiente').length  || 0
    const totalPersonas  = personas?.length || 0
    const detenidos      = (personas||[]).filter(p => p.tipo_resultado === 'detencion').length
    const nnas           = (personas||[]).filter(p => p.grupo_etario === 'nna').length
    const infraccMig     = (personas||[]).filter(p => p.tipo_resultado === 'infraccion_migratoria').length
    const totalUF        = (incautaciones||[]).reduce((a,i) => a + (i.valor_uf||0), 0)
    const totalCLP       = (incautaciones||[]).reduce((a,i) => a + (i.valor_clp||0), 0)
    const nIncauts       = incautaciones?.length || 0
    const totControles   = (controles||[]).reduce((a,c) =>
      a + (c.identidad_preventivos||0) + (c.identidad_investigativos||0) +
          (c.migratorios||0) + (c.vehiculares||0), 0)
    const totFlagrancias = (controles||[]).reduce((a,c) => a + (c.flagrancias||0), 0)
    const obsAltas       = (observaciones||[]).filter(o => o.nivel_relevancia === 'alto').length

    // ── Desglose por delito ───────────────────────────────────
    const porDelito = {}
    ;(personas||[]).forEach(p => {
      if (!p.tipo_delito) return
      porDelito[p.tipo_delito] = (porDelito[p.tipo_delito] || 0) + 1
    })
    const delitosOrdenados = Object.entries(porDelito)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
    const maxDelito = delitosOrdenados[0]?.[1] || 1

    // ── Desglose por incautación ──────────────────────────────
    const porEspecie = {}
    ;(incautaciones||[]).forEach(i => {
      const k = i.tipo_especie || 'otro'
      if (!porEspecie[k]) porEspecie[k] = { n: 0, uf: 0 }
      porEspecie[k].n++
      porEspecie[k].uf += (i.valor_uf || 0)
    })

    // ── Distribución por cuartel (si vista global) ────────────
    const porCuartel = {}
    ;(servicios||[]).forEach(s => {
      const nom = s.cuartel?.nombre?.replace(' (F)','') || '—'
      if (!porCuartel[nom]) porCuartel[nom] = { svcs: 0, comp: 0 }
      porCuartel[nom].svcs++
      if (s.estado === 'completado') porCuartel[nom].comp++
    })
    const cuartOrdenados = Object.entries(porCuartel)
      .sort((a, b) => b[1].svcs - a[1].svcs).slice(0, 9)

    // ── RENDER ────────────────────────────────────────────────
    el('rep-contenido').innerHTML = `

      <!-- KPIs principales -->
      <div class="kpi-grid" style="margin-bottom:1rem">
        ${repKpi('Total servicios', totalSvcs, '')}
        ${repKpi('Completados', completados, `${pendientes > 0 ? pendientes + ' pendientes' : 'Sin pendientes'}`, completados > 0 ? 'var(--verde)' : '')}
        ${repKpi('Personas con resultado', totalPersonas, `${detenidos} detenidos`)}
        ${repKpi('NNA detectados', nnas, 'Menores de edad', nnas > 0 ? 'var(--rojo)' : '')}
        ${repKpi('UF incautadas', totalUF.toFixed(2), `${nIncauts} procedimientos`)}
        ${repKpi('Controles totales', totControles.toLocaleString('es-CL'), `${totFlagrancias} flagrancias`)}
        ${repKpi('Obs. inteligencia nivel ALTO', obsAltas, 'Requieren reporte', obsAltas > 0 ? 'var(--rojo)' : '')}
        ${repKpi('Infracc. migratorias', infraccMig, 'Del período', infraccMig > 0 ? 'var(--amarillo)' : '')}
      </div>

      <!-- Fila de gráficos -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">

        <!-- Gráfico delitos -->
        <div class="card">
          <div class="sec-titulo" style="margin-bottom:.75rem">Tipos de delito detectados</div>
          ${delitosOrdenados.length ? `
          <div style="display:flex;flex-direction:column;gap:.5rem">
            ${delitosOrdenados.map(([tipo, n]) => {
              const pct = Math.round((n / maxDelito) * 100)
              const label = tipo.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
              return `
              <div style="display:grid;grid-template-columns:140px 1fr 30px;align-items:center;gap:.4rem;font-size:.76rem">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>
                <div style="background:var(--bg-alt,#f0f0f0);border-radius:3px;height:10px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:var(--verde);border-radius:3px"></div>
                </div>
                <span style="font-weight:700;text-align:right">${n}</span>
              </div>`
            }).join('')}
          </div>` : '<div style="color:var(--muted);font-size:.8rem">Sin delitos registrados en el período</div>'}
        </div>

        <!-- Gráfico controles -->
        <div class="card">
          <div class="sec-titulo" style="margin-bottom:.75rem">Controles por tipo</div>
          ${controles?.length ? (() => {
            const tots = { 'Identidad preventivos': 0, 'Identidad investigativos': 0, 'Migratorios': 0, 'Vehiculares': 0, 'Flagrancias': 0 }
            ;(controles||[]).forEach(c => {
              tots['Identidad preventivos']    += c.identidad_preventivos    || 0
              tots['Identidad investigativos'] += c.identidad_investigativos || 0
              tots['Migratorios']              += c.migratorios              || 0
              tots['Vehiculares']              += c.vehiculares              || 0
              tots['Flagrancias']              += c.flagrancias              || 0
            })
            const maxC = Math.max(...Object.values(tots), 1)
            return `<div style="display:flex;flex-direction:column;gap:.5rem">
              ${Object.entries(tots).map(([label, n]) => `
              <div style="display:grid;grid-template-columns:140px 1fr 50px;align-items:center;gap:.4rem;font-size:.76rem">
                <span>${label}</span>
                <div style="background:var(--bg-alt,#f0f0f0);border-radius:3px;height:10px;overflow:hidden">
                  <div style="height:100%;width:${Math.round((n/maxC)*100)}%;background:var(--azul,#2980B9);border-radius:3px"></div>
                </div>
                <span style="font-weight:700;text-align:right">${n.toLocaleString('es-CL')}</span>
              </div>`).join('')}
            </div>`
          })() : '<div style="color:var(--muted);font-size:.8rem">Sin controles registrados</div>'}
        </div>

      </div>

      <!-- Incautaciones por especie -->
      ${nIncauts > 0 ? `
      <div class="card" style="margin-bottom:1rem">
        <div class="sec-titulo" style="margin-bottom:.75rem">Incautaciones por especie</div>
        <div style="display:flex;flex-wrap:wrap;gap:.6rem">
          ${Object.entries(porEspecie).map(([especie, datos]) => `
          <div style="background:var(--surface-2,#F8FAF9);border:1px solid var(--border);border-radius:8px;padding:.5rem .85rem;min-width:130px">
            <div style="font-size:.72rem;color:var(--muted);text-transform:capitalize">${especie.replace(/_/g,' ')}</div>
            <div style="font-size:1.1rem;font-weight:700">${datos.n}</div>
            <div style="font-size:.7rem;color:var(--muted)">${datos.uf.toFixed(2)} UF</div>
          </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Distribución por cuartel (solo si vista global) -->
      ${cuartOrdenados.length > 1 ? `
      <div class="card" style="margin-bottom:1rem">
        <div class="sec-titulo" style="margin-bottom:.75rem">Servicios por cuartel</div>
        <div style="display:flex;flex-direction:column;gap:.45rem">
          ${cuartOrdenados.map(([nom, d]) => {
            const pct = Math.round((d.comp / Math.max(d.svcs, 1)) * 100)
            const col = pct >= 80 ? 'var(--verde)' : pct >= 50 ? 'var(--amarillo)' : 'var(--rojo)'
            return `
            <div style="display:grid;grid-template-columns:170px 1fr 100px;align-items:center;gap:.5rem;font-size:.78rem">
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nom}</span>
              <div style="background:var(--bg-alt,#f0f0f0);border-radius:3px;height:10px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${col};border-radius:3px"></div>
              </div>
              <span style="font-size:.73rem;color:var(--muted)">${d.comp}/${d.svcs} (${pct}%)</span>
            </div>`
          }).join('')}
        </div>
      </div>` : ''}

      <!-- Tabla detallada (colapsable) -->
      <div class="card" style="padding:0;overflow:hidden">
        <div class="tabla-header" style="padding:.6rem 1rem;cursor:pointer" onclick="toggleTablaDetalle()">
          <span>Detalle de servicios (${totalSvcs})</span>
          <span id="tabla-detalle-toggle" style="font-size:.8rem;color:var(--muted)">▼ Expandir</span>
        </div>
        <div id="tabla-detalle-body" style="display:none;overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:.75rem">
            <thead>
              <tr style="background:var(--encabezado)">
                <th style="padding:.4rem .7rem;text-align:left">Fecha</th>
                <th style="padding:.4rem .7rem;text-align:left">Tipo</th>
                ${puedeVerTodos ? '<th style="padding:.4rem .7rem;text-align:left">Cuartel</th>' : ''}
                <th style="padding:.4rem .7rem;text-align:center">Estado</th>
                <th style="padding:.4rem .7rem;text-align:center">Visitas</th>
                <th style="padding:.4rem .7rem;text-align:center">Incaut.</th>
                <th style="padding:.4rem .7rem;text-align:center">Intel.</th>
                <th style="padding:.4rem .7rem;text-align:left">Observaciones</th>
              </tr>
            </thead>
            <tbody>
              ${(servicios||[]).map((s, i) => `
              <tr style="${i%2===0?'background:var(--tabla-datos)':''};border-bottom:1px solid var(--border)">
                <td style="padding:.32rem .7rem">${formatFechaCorta(s.fecha)}</td>
                <td style="padding:.32rem .7rem;font-size:.7rem">${s.tipo_servicio}</td>
                ${puedeVerTodos ? `<td style="padding:.32rem .7rem;font-size:.7rem">${s.cuartel?.nombre?.replace(' (F)','')||'—'}</td>` : ''}
                <td style="padding:.32rem .7rem;text-align:center"><span class="badge badge-${s.estado}">${s.estado}</span></td>
                <td style="padding:.32rem .7rem;text-align:center">${s.visitas?.[0]?.count||0}</td>
                <td style="padding:.32rem .7rem;text-align:center">${s.incautaciones?.[0]?.count||0}</td>
                <td style="padding:.32rem .7rem;text-align:center">${s.observaciones_intel?.[0]?.count||0}</td>
                <td style="padding:.32rem .7rem;font-size:.7rem;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  ${s.observaciones || '—'}
                </td>
              </tr>`).join('')}
              ${!totalSvcs ? `<tr><td colspan="8" style="padding:1.5rem;text-align:center;color:var(--muted)">Sin servicios en el período</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      </div>`

  } catch(e) {
    el('rep-contenido').innerHTML = `<div class="card" style="color:var(--rojo)">Error: ${e.message}</div>`
    console.error('consultarReportes error:', e)
  }
}

function toggleTablaDetalle() {
  const body    = el('tabla-detalle-body')
  const toggle  = el('tabla-detalle-toggle')
  if (!body) return
  const visible = body.style.display !== 'none'
  body.style.display   = visible ? 'none' : 'block'
  if (toggle) toggle.textContent = visible ? '▼ Expandir' : '▲ Colapsar'
}

function repKpi(label, valor, sub, color) {
  return `
    <div class="kpi-card">
      <div class="kpi-valor" style="${color ? 'color:'+color : ''}">${valor}</div>
      <div class="kpi-label">${label}</div>
      <div class="kpi-sub">${sub}</div>
    </div>`
}

// ── REP-2: Exportar Cuenta Delitos Frontera ───────────────────
// Genera el Excel con las 36 columnas del formato estándar
async function exportarCuentaDelitos() {
  const desde   = el('rep-desde')?.value || hoyISO().substring(0,8) + '01'
  const hasta   = el('rep-hasta')?.value || hoyISO()
  const btn     = el('btn-cuenta-delitos')

  if (btn) { btn.disabled = true; btn.textContent = 'Generando...' }

  try {
    const cuartelFilt   = el('rep-cuartel')?.value || APP.cuartelActivo()?.id
    const puedeVerTodos = APP.esAdministrador() || APP.esComisario()

    // Cargar servicios del período con cuartel
    let svcsQ = APP.sb.from('servicios')
      .select('id,fecha,tipo_servicio,hora_inicio,cuartel_id,cuartel:cuarteles(nombre,codigo)')
      .gte('fecha', desde).lte('fecha', hasta).eq('estado','completado')
    if (cuartelFilt)        svcsQ = svcsQ.eq('cuartel_id', cuartelFilt)
    else if (!puedeVerTodos) svcsQ = svcsQ.eq('cuartel_id', APP.cuartel?.id)

    const { data: servicios } = await svcsQ
    if (!servicios?.length) {
      toast('Sin servicios completados en el período seleccionado', 'warn')
      return
    }

    const svcIds  = servicios.map(s => s.id)
    const svcMap  = {}
    servicios.forEach(s => { svcMap[s.id] = s })

    // Cargar personas registradas (principal fuente de la Cuenta Delitos)
    const { data: personas } = await APP.sb.from('personas_registradas')
      .select('*').in('servicio_id', svcIds)

    // Cargar puntos para coordenadas
    const puntoIds = [...new Set((personas||[]).map(p => p.punto_id).filter(Boolean))]
    let puntosMap = {}
    if (puntoIds.length) {
      const { data: puntosData } = await APP.sb.from('puntos_territoriales')
        .select('id,nombre,latitud,longitud,sector_fronterizo').in('id', puntoIds)
      ;(puntosData||[]).forEach(pt => { puntosMap[pt.id] = pt })
    }

    // Mapa modo operandi (si se necesita descripción)
    const modoIds = [...new Set((personas||[]).map(p => p.modo_operandi_id).filter(Boolean))]
    let modosMap = {}
    if (modoIds.length) {
      const { data: modos } = await APP.sb.from('catalogo_modo_operandi')
        .select('id,descripcion').in('id', modoIds)
      ;(modos||[]).forEach(m => { modosMap[m.id] = m.descripcion })
    }

    // ── Construir filas ───────────────────────────────────────
    const HEADERS = [
      'UNIDAD PROCEDIMIENTO','LEY','DELITO',
      'N° PARTE POLICIAL Y/O OFICIO EN CASO INGRESO ILEGAL',
      'FECHA','DESTINO DEL PARTE / OFICIO (FISCALIA Y/O P.D.I)',
      'AUTODENUNCIA / FLAGRANCIA / CONTROL O FISCALIZACION (indicar una)',
      'LATITUD','LONGITUD','CANTIDAD','ZONA','INCAUTACION','HORA','MODO OPERANDI',
      'PREFECTURA','SECTOR_UNIDAD_DEL_PROCEDIMIENTO','DIA','MES','AÑO','TIPO_DELITO',
      'COMUNA','SECTOR DESTACAMENTO (F)','CLASIFICACION',
      'SECTOR FRONTERIZO DETENCION','RANGO HORA','NOMBRES Y APELLIDOS',
      'FEMENINO','EDAD','DOMICILIO','NACIONALIDAD',
      'LUGAR POR DONDE EL CIUDADANO SEÑALA QUE HIZO INGRESO AL PAIS',
      'LATITUD','LONGITUD',
      'ORGANISMO QUIEN DETECTO EL INGRESO (CARABINEROS, ARMADA O EJERCITO)',
      'EN CASO DE UN NNA, PARENTESCO DEL ADULTO QUE LO ACOMPAÑA','SIN DOC'
    ]

    const rows = []
    for (const p of (personas || [])) {
      const svc   = svcMap[p.servicio_id]
      if (!svc) continue
      const punto = puntosMap[p.punto_id] || {}
      const fecha = new Date(svc.fecha + 'T12:00:00')
      const dia   = fecha.getDate()
      const mes   = fecha.getMonth() + 1
      const anio  = fecha.getFullYear()

      // Determinar ley automáticamente
      const ley = p.ley_aplicable || _leyDesdeDelito(p.tipo_delito, p.tipo_resultado)

      // Nombre completo
      const nombreCompleto = [p.nombres, p.apellidos].filter(Boolean).join(' ').trim() || '—'

      // Clasificación
      const clasif = p.clasificacion_caso === 'detenido' ? 'FLAGRANCIA'
                   : p.como_inicio === 'flagrancia'      ? 'FLAGRANCIA'
                   : p.como_inicio === 'control'         ? 'CONTROL O FISCALIZACION'
                   : 'CONTROL O FISCALIZACION'

      // Destino documento
      const destino = p.destino_documento === 'parte_fiscalia' ? 'FISCALIA'
                    : p.destino_documento === 'oficio_pdi'     ? 'P.D.I'
                    : p.destino_documento === 'acta_reconduccion' ? 'ACTA CONDUCCION'
                    : '—'

      rows.push([
        svc.cuartel?.nombre?.replace(' (F)','') || '—',              // UNIDAD PROCEDIMIENTO
        ley || '—',                                                     // LEY
        (p.tipo_delito || p.tipo_resultado || '—').replace(/_/g,' '), // DELITO
        p.nro_documento || '—',                                        // N° PARTE
        `${dia.toString().padStart(2,'0')}/${mes.toString().padStart(2,'0')}/${anio}`, // FECHA
        destino,                                                        // DESTINO PARTE
        clasif,                                                         // AUTODENUNCIA/FLAGRANCIA
        p.latitud_procedimiento  || punto.latitud  || '',              // LATITUD
        p.longitud_procedimiento || punto.longitud || '',              // LONGITUD
        1,                                                              // CANTIDAD
        punto.sector_fronterizo || svc.cuartel?.codigo || '—',        // ZONA
        '',                                                             // INCAUTACION
        p.hora_evento || svc.hora_inicio || '',                        // HORA
        modosMap[p.modo_operandi_id] || '—',                           // MODO OPERANDI
        'Prefectura Arica Nro. 1',                                     // PREFECTURA
        svc.cuartel?.nombre?.replace(' (F)','') || '—',               // SECTOR_UNIDAD
        dia,                                                            // DIA
        mes,                                                            // MES
        anio,                                                           // AÑO
        _tipoDelitoParaCuenta(p.tipo_delito, p.tipo_resultado),        // TIPO_DELITO
        'Arica',                                                        // COMUNA
        svc.cuartel?.nombre || '—',                                    // SECTOR DESTACAMENTO (F)
        p.clasificacion_caso?.toUpperCase() || '—',                    // CLASIFICACION
        punto.nombre || '—',                                            // SECTOR FRONTERIZO DETENCION
        p.rango_hora_evento || _rangoHora(p.hora_evento) || '—',       // RANGO HORA
        nombreCompleto,                                                  // NOMBRES Y APELLIDOS
        p.sexo === 'femenino' ? 'SI' : '',                             // FEMENINO
        p.edad || '',                                                   // EDAD
        p.domicilio || '—',                                             // DOMICILIO
        p.nacionalidad || '—',                                          // NACIONALIDAD
        punto.nombre || '—',                                            // LUGAR INGRESO
        punto.latitud  || '',                                           // LATITUD (ingreso)
        punto.longitud || '',                                           // LONGITUD (ingreso)
        'CARABINEROS',                                                  // ORGANISMO
        p.nna_vinculo_adulto || '',                                     // PARENTESCO NNA
        p.sin_documento ? 'SI' : '',                                   // SIN DOC
      ])
    }

    // ── Generar Excel con SheetJS ─────────────────────────────
    if (!window.XLSX) {
      toast('Cargando librería Excel...', 'info')
      await new Promise((res, rej) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
        s.onload  = res
        s.onerror = () => rej(new Error('No se pudo cargar SheetJS'))
        document.head.appendChild(s)
      })
    }

    const wb = XLSX.utils.book_new()
    const wsData = [HEADERS, ...rows]
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Ancho de columnas
    ws['!cols'] = HEADERS.map((h, i) => {
      const base = Math.max(h.length, ...(rows.map(r => String(r[i]||'').length)))
      return { wch: Math.min(Math.max(base, 10), 40) }
    })

    XLSX.utils.book_append_sheet(wb, ws, 'CUENTA DELITOS FRONTERAS')

    const desde_str = desde.replace(/-/g,'')
    const hasta_str = hasta.replace(/-/g,'')
    XLSX.writeFile(wb, `Cuenta_Delitos_Frontera_${desde_str}_${hasta_str}.xlsx`)
    toast(`Cuenta Delitos generada: ${rows.length} registro${rows.length !== 1 ? 's' : ''}`, 'ok')

  } catch(e) {
    toast('Error al generar: ' + e.message, 'err')
    console.error('exportarCuentaDelitos error:', e)
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↓ Cuenta Delitos Frontera' }
  }
}

// ── Helpers para Cuenta Delitos ───────────────────────────────
function _leyDesdeDelito(tipoDelito, tipoResultado) {
  const mapa = {
    trafico_migrantes:    'Ley 19.253',
    ingreso_irregular:    'Ley 21.325 (Migración)',
    trafico_drogas:       'Ley 20.000',
    contrabando:          'Ordenanza Aduana',
    ley_17798_armas:      'Ley 17.798',
    cohecho:              'Código Penal',
    abigeato:             'Código Penal',
    orden_interpol:       'INTERPOL',
    receptacion:          'Código Penal',
    otro:                 'Código Penal',
  }
  if (tipoDelito && mapa[tipoDelito]) return mapa[tipoDelito]
  if (tipoResultado === 'infraccion_migratoria') return 'Ley 21.325 (Migración)'
  return 'Código Penal'
}

function _tipoDelitoParaCuenta(tipoDelito, tipoResultado) {
  if (!tipoDelito) {
    if (tipoResultado === 'infraccion_migratoria') return 'INFRACCION MIGRATORIA'
    if (tipoResultado === 'nna_irregular')          return 'NNA EN SITUACION IRREGULAR'
    return '—'
  }
  return tipoDelito.replace(/_/g, ' ').toUpperCase()
}

function _rangoHora(hora) {
  if (!hora) return ''
  const h = parseInt(hora.split(':')[0])
  if (h >= 0  && h < 6)  return '00:00-06:00'
  if (h >= 6  && h < 12) return '06:00-12:00'
  if (h >= 12 && h < 18) return '12:00-18:00'
  return '18:00-24:00'
}

// ── VALIDAR CÓDIGO FUNCIONARIO ────────────────────────────────
async function validarCodigo(codigo) {
  const est = el('codigo-estado')
  if (!codigo || !est) return
  const cuartelIdActual = APP.cuartelActivo()?.id
  const { data } = await APP.sb.from('personal_cuartel')
    .select('id').eq('codigo_funcionario', codigo)
    .eq('cuartel_id', cuartelIdActual).eq('activo', true).single()
  est.textContent = data ? '✅ Código válido' : '⚠️ Código no reconocido'
  est.style.color = data ? 'var(--verde)' : 'var(--amarillo)'
}

// ── MAPA DE COORDENADAS (Leaflet) ─────────────────────────────
let _mapaCoords   = null
let _markerCoords = null
let _coordsTemp   = null

function abrirMapaCoordenadas(idLat, idLon, puntoId) {
  const modal = document.createElement('div')
  modal.id = 'modal-mapa-coords'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center'
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;width:min(95vw,600px);max-height:90vh;overflow:hidden;display:flex;flex-direction:column">
      <div style="padding:.85rem 1rem;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:600;font-size:.92rem">Seleccionar coordenadas en el mapa</span>
        <button onclick="document.getElementById('modal-mapa-coords').remove()" style="border:none;background:none;font-size:1.1rem;cursor:pointer">✕</button>
      </div>
      <div style="padding:.6rem 1rem;font-size:.78rem;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb">
        Haz clic en el mapa para seleccionar las coordenadas exactas del punto
      </div>
      <div id="mapa-coords-container" style="flex:1;min-height:350px"></div>
      <div style="padding:.75rem 1rem;border-top:1px solid #e5e7eb;display:flex;gap:.75rem;align-items:center">
        <span style="font-size:.8rem;color:#374151">Seleccionado: <strong id="coords-seleccionadas">— clic en el mapa —</strong></span>
        <button id="btn-confirmar-coords" class="btn btn-primario btn-sm" style="margin-left:auto" disabled
          onclick="confirmarCoordenadas('${idLat}','${idLon}','${puntoId||''}')">
          Confirmar
        </button>
      </div>
    </div>`
  document.body.appendChild(modal)

  if (!window.L) {
    const css = document.createElement('link')
    css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(css)
    const js = document.createElement('script')
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    js.onload = () => inicializarMapa()
    document.head.appendChild(js)
  } else {
    setTimeout(inicializarMapa, 100)
  }
}

function inicializarMapa() {
  const cont = document.getElementById('mapa-coords-container')
  if (!cont) return
  if (_mapaCoords) { _mapaCoords.invalidateSize(); return }
  _mapaCoords = L.map('mapa-coords-container').setView([-18.35, -70.15], 10)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(_mapaCoords)
  if (typeof _puntosDelCuartel !== 'undefined') {
    _puntosDelCuartel.forEach(p => {
      if (p.latitud && p.longitud) {
        L.circleMarker([p.latitud, p.longitud], { radius: 5, color: '#1D9E75', fillOpacity: .7 })
          .addTo(_mapaCoords).bindPopup(p.nombre)
      }
    })
  }
  _mapaCoords.on('click', e => {
    _coordsTemp = e.latlng
    if (_markerCoords) _markerCoords.remove()
    _markerCoords = L.marker(e.latlng).addTo(_mapaCoords)
    const coordsEl = document.getElementById('coords-seleccionadas')
    if (coordsEl) coordsEl.textContent = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`
    const btnConf = document.getElementById('btn-confirmar-coords')
    if (btnConf) btnConf.disabled = false
  })
}

async function confirmarCoordenadas(idLat, idLon, puntoId) {
  if (!_coordsTemp) return
  const latEl = el(idLat); const lonEl = el(idLon)
  if (latEl) latEl.value = _coordsTemp.lat.toFixed(6)
  if (lonEl) lonEl.value = _coordsTemp.lng.toFixed(6)
  if (puntoId && typeof _puntosDelCuartel !== 'undefined') {
    const punto = _puntosDelCuartel.find(p => p.id === puntoId)
    if (punto && !punto.latitud && confirm(`¿Guardar estas coordenadas permanentemente para "${punto.nombre}"?`)) {
      await APP.sb.from('puntos_territoriales').update({
        latitud: _coordsTemp.lat, longitud: _coordsTemp.lng
      }).eq('id', puntoId)
      punto.latitud = _coordsTemp.lat; punto.longitud = _coordsTemp.lng
      toast('Coordenadas guardadas en el punto', 'ok')
    }
  }
  _coordsTemp = null; _mapaCoords = null; _markerCoords = null
  document.getElementById('modal-mapa-coords')?.remove()
}

function autocompletarCoordsEntrevista(puntoId) {
  if (typeof _puntosDelCuartel === 'undefined') return
  const punto = _puntosDelCuartel.find(p => p.id === puntoId)
  if (!punto) return
  const latEl = el('entrev-lat'); const lonEl = el('entrev-lon')
  if (punto.latitud && punto.longitud) {
    if (latEl) latEl.value = punto.latitud
    if (lonEl) lonEl.value = punto.longitud
  } else {
    if (latEl) latEl.value = ''
    if (lonEl) lonEl.value = ''
  }
}
