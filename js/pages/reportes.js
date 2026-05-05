// ============================================================
// SISTEMA CSF OPERATIVA — reportes.js  v2.1
// FIX-R1: exportarCuentaDelitos — cuartelFilt ya no fuerza
//          APP.cuartelActivo() cuando el select dice "— Todos —"
//          Admin/Comisario sin cuartel seleccionado descarga
//          todos los cuarteles correctamente.
// FIX-R2: consultarReportes — mismo fix aplicado.
// ============================================================

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
          <div class="campo"><label>Desde</label><input type="date" id="rep-desde" value="${ini}"/></div>
          <div class="campo"><label>Hasta</label><input type="date" id="rep-hasta" value="${hoy}"/></div>
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
  const cuartelFilt   = el('rep-cuartel')?.value || null
  const puedeVerTodos = APP.esAdministrador() || APP.esComisario()

  try {
    let svcsQ = APP.sb.from('servicios')
      .select('*, cuartel:cuarteles(nombre), visitas:visitas_puntos(count), incautaciones(count), observaciones_intel(count)')
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: false })

    if (cuartelFilt) {
      svcsQ = svcsQ.eq('cuartel_id', cuartelFilt)
    } else if (!puedeVerTodos) {
      svcsQ = svcsQ.eq('cuartel_id', APP.cuartelActivo()?.id || APP.cuartel?.id)
    }

    const { data: servicios, error } = await svcsQ
    if (error) throw error

    const svcIds = (servicios||[]).map(s => s.id)

    const [
      { data: personas },
      { data: incautaciones },
      { data: controles },
      { data: observaciones },
    ] = await Promise.all([
      svcIds.length ? APP.sb.from('personas_registradas').select('tipo_resultado,tipo_delito,grupo_etario,nacionalidad,sexo,modo_operandi_id').in('servicio_id', svcIds) : Promise.resolve({ data: [] }),
      svcIds.length ? APP.sb.from('incautaciones').select('tipo_especie,valor_uf,valor_clp,cantidad,sustancia_droga').in('servicio_id', svcIds) : Promise.resolve({ data: [] }),
      svcIds.length ? APP.sb.from('controles_servicio').select('identidad_preventivos,identidad_investigativos,migratorios,vehiculares,flagrancias').in('servicio_id', svcIds) : Promise.resolve({ data: [] }),
      svcIds.length ? APP.sb.from('observaciones_intel').select('nivel_relevancia,tipo_hallazgo').in('servicio_id', svcIds) : Promise.resolve({ data: [] }),
    ])

    const totalSvcs      = servicios?.length || 0
    const completados    = servicios?.filter(s => s.estado === 'completado').length || 0
    const pendientes     = servicios?.filter(s => s.estado === 'pendiente').length  || 0
    const totalPersonas  = personas?.length || 0
    const detenidos      = (personas||[]).filter(p => p.tipo_resultado === 'detencion').length
    const nnas           = (personas||[]).filter(p => p.grupo_etario === 'nna').length
    const infraccMig     = (personas||[]).filter(p => p.tipo_resultado === 'infraccion_migratoria').length
    const totalUF        = (incautaciones||[]).reduce((a,i) => a + (i.valor_uf||0), 0)
    const nIncauts       = incautaciones?.length || 0
    const totControles   = (controles||[]).reduce((a,c) => a + (c.identidad_preventivos||0) + (c.identidad_investigativos||0) + (c.migratorios||0) + (c.vehiculares||0), 0)
    const totFlagrancias = (controles||[]).reduce((a,c) => a + (c.flagrancias||0), 0)
    const obsAltas       = (observaciones||[]).filter(o => o.nivel_relevancia === 'alto').length

    const porDelito = {}
    ;(personas||[]).forEach(p => { if (!p.tipo_delito) return; porDelito[p.tipo_delito] = (porDelito[p.tipo_delito]||0)+1 })
    const delitosOrdenados = Object.entries(porDelito).sort((a,b)=>b[1]-a[1]).slice(0,8)
    const maxDelito = delitosOrdenados[0]?.[1] || 1

    const porCuartel = {}
    ;(servicios||[]).forEach(s => {
      const nom = s.cuartel?.nombre?.replace(' (F)','') || '—'
      if (!porCuartel[nom]) porCuartel[nom] = { svcs:0, comp:0 }
      porCuartel[nom].svcs++
      if (s.estado === 'completado') porCuartel[nom].comp++
    })
    const cuartOrdenados = Object.entries(porCuartel).sort((a,b)=>b[1].svcs-a[1].svcs).slice(0,9)

    el('rep-contenido').innerHTML = `
      <div class="kpi-grid" style="margin-bottom:1rem">
        ${repKpi('Total servicios', totalSvcs, '')}
        ${repKpi('Completados', completados, `${pendientes>0?pendientes+' pendientes':'Sin pendientes'}`, completados>0?'var(--verde)':'')}
        ${repKpi('Personas con resultado', totalPersonas, `${detenidos} detenidos`)}
        ${repKpi('NNA detectados', nnas, 'Menores de edad', nnas>0?'var(--rojo)':'')}
        ${repKpi('UF incautadas', totalUF.toFixed(2), `${nIncauts} procedimientos`)}
        ${repKpi('Controles totales', totControles.toLocaleString('es-CL'), `${totFlagrancias} flagrancias`)}
        ${repKpi('Obs. nivel ALTO', obsAltas, 'Requieren reporte', obsAltas>0?'var(--rojo)':'')}
        ${repKpi('Infracc. migratorias', infraccMig, 'Del período', infraccMig>0?'var(--amarillo)':'')}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
        <div class="card">
          <div class="sec-titulo" style="margin-bottom:.75rem">Tipos de delito detectados</div>
          ${delitosOrdenados.length ? `
          <div style="display:flex;flex-direction:column;gap:.5rem">
            ${delitosOrdenados.map(([tipo,n]) => {
              const pct = Math.round((n/maxDelito)*100)
              const label = tipo.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase())
              return `<div style="display:grid;grid-template-columns:140px 1fr 30px;align-items:center;gap:.4rem;font-size:.76rem">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>
                <div style="background:var(--bg-alt,#f0f0f0);border-radius:3px;height:10px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:var(--verde);border-radius:3px"></div>
                </div>
                <span style="font-weight:700;text-align:right">${n}</span>
              </div>`
            }).join('')}
          </div>` : '<div style="color:var(--muted);font-size:.8rem">Sin delitos registrados en el período</div>'}
        </div>
        <div class="card">
          <div class="sec-titulo" style="margin-bottom:.75rem">Controles por tipo</div>
          ${controles?.length ? (() => {
            const tipos = [
              {label:'Id. Preventivos',key:'identidad_preventivos'},
              {label:'Id. Investigativos',key:'identidad_investigativos'},
              {label:'Migratorios',key:'migratorios'},
              {label:'Vehiculares',key:'vehiculares'},
              {label:'Flagrancias',key:'flagrancias'},
            ]
            const tots = tipos.map(t=>({label:t.label,n:(controles||[]).reduce((a,c)=>a+(c[t.key]||0),0)}))
            const maxC = Math.max(...tots.map(t=>t.n),1)
            return `<div style="display:flex;flex-direction:column;gap:.5rem">
              ${tots.map(t=>{const pct=Math.round((t.n/maxC)*100);return `<div style="display:grid;grid-template-columns:140px 1fr 40px;align-items:center;gap:.4rem;font-size:.76rem">
                <span>${t.label}</span>
                <div style="background:var(--bg-alt,#f0f0f0);border-radius:3px;height:10px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#1565C0;border-radius:3px"></div></div>
                <span style="font-weight:700;text-align:right">${t.n.toLocaleString('es-CL')}</span>
              </div>`}).join('')}
            </div>`
          })() : '<div style="color:var(--muted);font-size:.8rem">Sin controles registrados</div>'}
        </div>
      </div>

      ${cuartOrdenados.length > 1 ? `
      <div class="card" style="margin-bottom:1rem">
        <div class="sec-titulo" style="margin-bottom:.75rem">Servicios por cuartel</div>
        <div style="display:flex;flex-direction:column;gap:.45rem">
          ${cuartOrdenados.map(([nom,d]) => {
            const pct=Math.round((d.comp/Math.max(d.svcs,1))*100)
            const col=pct>=80?'var(--verde)':pct>=50?'var(--amarillo)':'var(--rojo)'
            return `<div style="display:grid;grid-template-columns:170px 1fr 100px;align-items:center;gap:.5rem;font-size:.78rem">
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nom}</span>
              <div style="background:var(--bg-alt,#f0f0f0);border-radius:3px;height:10px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${col};border-radius:3px"></div></div>
              <span style="font-size:.73rem;color:var(--muted)">${d.comp}/${d.svcs} (${pct}%)</span>
            </div>`
          }).join('')}
        </div>
      </div>` : ''}

      <div class="card" style="padding:0;overflow:hidden">
        <div class="tabla-header" style="padding:.6rem 1rem;cursor:pointer" onclick="toggleTablaDetalle()">
          <span>Detalle de servicios (${totalSvcs})</span>
          <span id="tabla-detalle-toggle" style="font-size:.8rem;color:var(--muted)">▼ Expandir</span>
        </div>
        <div id="tabla-detalle-body" style="display:none;overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:.75rem">
            <thead><tr style="background:var(--encabezado)">
              <th style="padding:.4rem .7rem;text-align:left">Fecha</th>
              <th style="padding:.4rem .7rem;text-align:left">Tipo</th>
              ${puedeVerTodos?'<th style="padding:.4rem .7rem;text-align:left">Cuartel</th>':''}
              <th style="padding:.4rem .7rem;text-align:center">Estado</th>
              <th style="padding:.4rem .7rem;text-align:center">Visitas</th>
              <th style="padding:.4rem .7rem;text-align:center">Incaut.</th>
              <th style="padding:.4rem .7rem;text-align:center">Intel.</th>
              <th style="padding:.4rem .7rem;text-align:left">Observaciones</th>
            </tr></thead>
            <tbody>
              ${(servicios||[]).map((s,i)=>`
              <tr style="${i%2===0?'background:var(--tabla-datos)':''};border-bottom:1px solid var(--border)">
                <td style="padding:.32rem .7rem">${formatFechaCorta(s.fecha)}</td>
                <td style="padding:.32rem .7rem;font-size:.7rem">${s.tipo_servicio}</td>
                ${puedeVerTodos?`<td style="padding:.32rem .7rem;font-size:.7rem">${s.cuartel?.nombre?.replace(' (F)','')||'—'}</td>`:''}
                <td style="padding:.32rem .7rem;text-align:center"><span class="badge badge-${s.estado}">${s.estado}</span></td>
                <td style="padding:.32rem .7rem;text-align:center">${s.visitas?.[0]?.count||0}</td>
                <td style="padding:.32rem .7rem;text-align:center">${s.incautaciones?.[0]?.count||0}</td>
                <td style="padding:.32rem .7rem;text-align:center">${s.observaciones_intel?.[0]?.count||0}</td>
                <td style="padding:.32rem .7rem;font-size:.7rem;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.observaciones||'—'}</td>
              </tr>`).join('')}
              ${!totalSvcs?`<tr><td colspan="8" style="padding:1.5rem;text-align:center;color:var(--muted)">Sin servicios en el período</td></tr>`:''}
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
  const body=el('tabla-detalle-body'), toggle=el('tabla-detalle-toggle')
  if (!body) return
  const visible=body.style.display!=='none'
  body.style.display=visible?'none':'block'
  if (toggle) toggle.textContent=visible?'▼ Expandir':'▲ Colapsar'
}

function repKpi(label, valor, sub, color) {
  return `<div class="kpi-card">
    <div class="kpi-valor" style="${color?'color:'+color:''}">${valor}</div>
    <div class="kpi-label">${label}</div>
    <div class="kpi-sub">${sub}</div>
  </div>`
}

async function exportarCuentaDelitos() {
  const desde = el('rep-desde')?.value || hoyISO().substring(0,8) + '01'
  const hasta = el('rep-hasta')?.value || hoyISO()
  const btn   = el('btn-cuenta-delitos')
  if (btn) { btn.disabled=true; btn.textContent='Generando...' }

  try {
    const cuartelFilt   = el('rep-cuartel')?.value || null
    const puedeVerTodos = APP.esAdministrador() || APP.esComisario()

    let svcsQ = APP.sb.from('servicios')
      .select('id,fecha,tipo_servicio,hora_inicio,cuartel_id,cuartel:cuarteles(nombre,codigo)')
      .gte('fecha', desde).lte('fecha', hasta).eq('estado','completado')

    if (cuartelFilt) {
      svcsQ = svcsQ.eq('cuartel_id', cuartelFilt)
    } else if (!puedeVerTodos) {
      const cuartelId = APP.cuartelActivo()?.id || APP.cuartel?.id
      if (cuartelId) svcsQ = svcsQ.eq('cuartel_id', cuartelId)
    }

    const { data: servicios } = await svcsQ
    if (!servicios?.length) { toast(`Sin servicios completados entre ${desde} y ${hasta}`, 'warn'); return }

    const svcIds = servicios.map(s=>s.id)
    const svcMap = {}
    servicios.forEach(s=>{ svcMap[s.id]=s })

    const { data: personas } = await APP.sb.from('personas_registradas').select('*').in('servicio_id', svcIds)
    if (!personas?.length) { toast(`Hay ${servicios.length} servicio(s) pero sin personas en S6`, 'warn'); return }

    const puntoIds = [...new Set((personas||[]).map(p=>p.punto_id).filter(Boolean))]
    let puntosMap = {}
    if (puntoIds.length) {
      const { data: pd } = await APP.sb.from('puntos_territoriales').select('id,nombre,latitud,longitud,sector_fronterizo').in('id', puntoIds)
      ;(pd||[]).forEach(pt=>{ puntosMap[pt.id]=pt })
    }

    const modoIds = [...new Set((personas||[]).map(p=>p.modo_operandi_id).filter(Boolean))]
    let modosMap = {}
    if (modoIds.length) {
      const { data: md } = await APP.sb.from('catalogo_modo_operandi').select('id,descripcion').in('id', modoIds)
      ;(md||[]).forEach(m=>{ modosMap[m.id]=m.descripcion })
    }

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
    for (const p of (personas||[])) {
      const svc = svcMap[p.servicio_id]
      if (!svc) continue
      const punto = puntosMap[p.punto_id] || {}
      const fecha = new Date(svc.fecha+'T12:00:00')
      const dia=fecha.getDate(), mes=fecha.getMonth()+1, anio=fecha.getFullYear()
      const ley = p.ley_aplicable || _leyDesdeDelito(p.tipo_delito, p.tipo_resultado)
      const nombreCompleto = [p.nombres,p.apellidos].filter(Boolean).join(' ').trim() || '—'
      const clasif = p.clasificacion_caso==='detenido'?'FLAGRANCIA':p.como_inicio==='flagrancia'?'FLAGRANCIA':'CONTROL O FISCALIZACION'
      const destino = p.destino_documento==='parte_fiscalia'?'FISCALIA':p.destino_documento==='oficio_pdi'?'P.D.I':p.destino_documento==='acta_reconduccion'?'ACTA RECONDUCCION':'—'
      const modoDesc = p.modo_operandi_id?(modosMap[p.modo_operandi_id]||'—'):'—'
      rows.push([
        svc.cuartel?.nombre||'—', ley,
        _tipoDelitoParaCuenta(p.tipo_delito, p.tipo_resultado),
        p.nro_documento||'—', svc.fecha, destino, clasif,
        p.latitud_procedimiento||punto.latitud||'',
        p.longitud_procedimiento||punto.longitud||'',
        1, punto.sector_fronterizo||'—', '',
        p.hora_evento||svc.hora_inicio||'', modoDesc,
        'ARICA N° 1', svc.cuartel?.nombre||'—',
        dia, mes, anio,
        _tipoDelitoParaCuenta(p.tipo_delito, p.tipo_resultado),
        'ARICA', svc.cuartel?.nombre?.replace(' (F)','')||'—',
        clasif, punto.sector_fronterizo||'—',
        _rangoHora(p.hora_evento||svc.hora_inicio),
        nombreCompleto, p.sexo==='femenino'?'SI':'',
        p.edad||'', p.domicilio||'—', p.nacionalidad||'—',
        punto.nombre||'—', punto.latitud||'', punto.longitud||'',
        'CARABINEROS', p.nna_vinculo_adulto||'',
        p.sin_documento?'SI':'',
      ])
    }

    if (!window.XLSX) {
      await new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload=res; s.onerror=()=>rej(new Error('No se pudo cargar SheetJS')); document.head.appendChild(s) })
    }

    const wb=XLSX.utils.book_new()
    const ws=XLSX.utils.aoa_to_sheet([HEADERS,...rows])
    ws['!cols']=HEADERS.map((h,i)=>({wch:Math.min(Math.max(h.length,...rows.map(r=>String(r[i]||'').length),10),40)}))
    XLSX.utils.book_append_sheet(wb, ws, 'CUENTA DELITOS FRONTERAS')
    XLSX.writeFile(wb, `Cuenta_Delitos_Frontera_${desde.replace(/-/g,'')}_${hasta.replace(/-/g,'')}.xlsx`)
    toast(`Cuenta Delitos generada: ${rows.length} registro${rows.length!==1?'s':''}`, 'ok')

  } catch(e) {
    toast('Error al generar: '+e.message, 'err')
    console.error('exportarCuentaDelitos error:', e)
  } finally {
    if (btn) { btn.disabled=false; btn.textContent='↓ Cuenta Delitos Frontera' }
  }
}

function _leyDesdeDelito(tipoDelito, tipoResultado) {
  const mapa={trafico_migrantes:'Ley 19.253',ingreso_irregular:'Ley 21.325 (Migración)',trafico_drogas:'Ley 20.000',contrabando:'Ordenanza Aduana',ley_17798_armas:'Ley 17.798',cohecho:'Código Penal',abigeato:'Código Penal',orden_interpol:'INTERPOL',receptacion:'Código Penal',otro:'Código Penal'}
  if (tipoDelito && mapa[tipoDelito]) return mapa[tipoDelito]
  if (tipoResultado==='infraccion_migratoria') return 'Ley 21.325 (Migración)'
  return 'Código Penal'
}

function _tipoDelitoParaCuenta(tipoDelito, tipoResultado) {
  if (!tipoDelito) { if (tipoResultado==='infraccion_migratoria') return 'INFRACCION MIGRATORIA'; if (tipoResultado==='nna_irregular') return 'NNA EN SITUACION IRREGULAR'; return '—' }
  return tipoDelito.replace(/_/g,' ').toUpperCase()
}

function _rangoHora(hora) {
  if (!hora) return ''
  const h=parseInt(hora.split(':')[0])
  if (h>=0&&h<6) return '00:00-06:00'; if (h>=6&&h<12) return '06:00-12:00'; if (h>=12&&h<18) return '12:00-18:00'; return '18:00-24:00'
}

async function validarCodigo(codigo) {
  const est=el('codigo-estado')
  if (!codigo||!est) return
  const { data } = await APP.sb.from('personal_cuartel').select('id').eq('codigo_funcionario',codigo).eq('cuartel_id',APP.cuartelActivo()?.id).eq('activo',true).single()
  est.textContent=data?'✅ Código válido':'⚠️ Código no reconocido'
  est.style.color=data?'var(--verde)':'var(--amarillo)'
}
