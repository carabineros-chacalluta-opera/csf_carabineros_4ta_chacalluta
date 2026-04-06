// ============================================================
// SISTEMA CSF OPERATIVA — csf.js  v1.1
// CORRECCIONES:
//   FIX — APP.cuartel → APP.cuartelActivo() en todo el archivo
//   FIX — Administrador tiene acceso igual que Comisario
//   FIX — Eliminados elaborado_por/publicado_por del insert
//   B3 — exportarCSFPDF() real usando window.print() + @media print
//   B8 — tabs usan data-tab attribute (no textContent.includes)
//   M3 — botón "Volver a borrador" para corregir CSF publicadas
// ============================================================

let _csfTab  = 'generar'
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

// B8: tabBtn guarda el ID en data-tab, no en textContent
function tabBtn(tab, label) {
  const act = _csfTab === tab
  return `<button class="tab-btn ${act?'tab-activo':''}" data-tab="${tab}" onclick="cambiarTabCSF('${tab}')">${label}</button>`
}

async function cambiarTabCSF(tab) {
  _csfTab = tab
  // B8: buscar por data-tab, no por textContent
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

  // Opciones de meses para los selectores
  const opcionesMes = (anioSel) => MESES_ES.map((m, i) =>
    `<option value="${i+1}">${m} ${anioSel}</option>`
  ).join('')

  // Años disponibles: año anterior, actual y siguiente
  const anios = [anio - 1, anio, anio + 1]
  const opcionesAnio = (idSel) => anios.map(a =>
    `<option value="${a}" ${a === anio ? 'selected' : ''}>${a}</option>`
  ).join('')

  zona.innerHTML = `
    <div class="card gap3" style="margin-bottom:1rem">
      <div class="sec-titulo">Parámetros de la CSF</div>
      <div class="g3">

        <div class="campo">
          <label>Mes de referencia <span style="font-size:.7rem;color:var(--muted)">(datos a analizar)</span></label>
          <div style="display:flex;gap:.5rem;align-items:center">
            <select id="csf-ref-mes" style="flex:1">
              ${MESES_ES.map((m,i) => `<option value="${i+1}" ${i+1 === hoy.getMonth()-1 || (hoy.getMonth()<=1 && i===10) ? 'selected':''}>${m}</option>`).join('')}
            </select>
            <select id="csf-ref-anio" style="width:90px">
              ${opcionesAnio('ref')}
            </select>
          </div>
          <div style="font-size:.7rem;color:var(--muted);margin-top:.25rem">Mes cuyos datos se usarán para calcular criticidad</div>
        </div>

        <div class="campo">
          <label>Mes de vigencia <span style="font-size:.7rem;color:var(--muted)">(mes que rige la CSF)</span></label>
          <div style="display:flex;gap:.5rem;align-items:center">
            <select id="csf-vig-mes" style="flex:1">
              ${MESES_ES.map((m,i) => `<option value="${i+1}" ${i+1 === hoy.getMonth()+1 ? 'selected':''}>${m}</option>`).join('')}
            </select>
            <select id="csf-vig-anio" style="width:90px">
              ${opcionesAnio('vig')}
            </select>
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

async function generarBorradorCSF() {
  const zona = el('csf-borrador')

  // FIX: verificar cuartel activo antes de proceder
  const cuartelActivo = APP.cuartelActivo()
  if (!cuartelActivo?.id) {
    zona.innerHTML = '<div class="card" style="color:var(--rojo);padding:1rem">⚠ Selecciona un cuartel en el selector antes de generar la CSF.</div>'
    return
  }

  // Leer selectores manuales
  const refMes  = parseInt(el('csf-ref-mes')?.value)
  const refAnio = parseInt(el('csf-ref-anio')?.value)
  const vigMes  = parseInt(el('csf-vig-mes')?.value)
  const vigAnio = parseInt(el('csf-vig-anio')?.value)

  if (!refMes || !refAnio || !vigMes || !vigAnio) {
    zona.innerHTML = '<div class="card" style="color:var(--rojo);padding:1rem">⚠ Selecciona el mes de referencia y mes de vigencia antes de generar.</div>'
    return
  }

  zona.innerHTML = '<div class="cargando">Calculando criticidad por punto...</div>'

  const cuartelId = cuartelActivo.id
  const ref       = { mes: refMes, anio: refAnio }
  const mesVig    = { mes: vigMes, anio: vigAnio }

  const iniRef = `${ref.anio}-${String(ref.mes).padStart(2,'0')}-01`
  const finRef = new Date(ref.anio, ref.mes, 0).toISOString().split('T')[0]
  const iniVig = `${mesVig.anio}-${String(mesVig.mes).padStart(2,'0')}-01`
  const finVig = new Date(mesVig.anio, mesVig.mes, 0).toISOString().split('T')[0]

  const { data: puntos } = await APP.sb.from('puntos_territoriales')
    .select('*').eq('cuartel_id', cuartelId).eq('activo', true).order('tipo').order('nombre')

  const { data: svcsRef } = await APP.sb.from('servicios')
    .select('id').eq('cuartel_id', cuartelId)
    .gte('fecha', iniRef).lte('fecha', finRef)
  const svcIds = (svcsRef||[]).map(s => s.id)

  let visitasRef=[], personasRef=[], incautRef=[], obsRef=[]
  if (svcIds.length) {
    ;[{data:visitasRef},{data:personasRef},{data:incautRef},{data:obsRef}] = await Promise.all([
      APP.sb.from('visitas_puntos').select('*').in('servicio_id', svcIds),
      APP.sb.from('personas_registradas').select('*').in('servicio_id', svcIds),
      APP.sb.from('incautaciones').select('*').in('servicio_id', svcIds),
      APP.sb.from('observaciones_intel').select('*').in('servicio_id', svcIds),
    ])
  }

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

    const nObs             = obsPunto.length
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
    const turno  = obsNocturnas > nObs / 2 ? 'nocturno' : 'diurno'
    const horaIni = turno === 'nocturno' ? '22:00' : '09:00'
    const horaFin = turno === 'nocturno' ? '06:00' : '17:00'

    let observacion = ''
    if (nivelFinal >= 4) observacion = 'Actividad COT confirmada. Prioridad máxima VIE-DOM.'
    else if (nivelFinal === 3) observacion = 'Indicios de actividad en sector. Reforzar cobertura.'
    else if (nObs > 0) observacion = `${nObs} observación(es) registrada(s) en el período.`
    else observacion = 'Sin actividad detectada. Vigilancia de rutina.'

    return { ...p, nivelExcel, nivelPxC, nivelFinal, infoN, fvcFinal, turno, horaIni, horaFin, observacion, prob, consec, valorPxC }
  }).sort((a,b) => b.nivelFinal - a.nivelFinal)

  const cotDelitos = (personasRef||[]).filter(pr => CSF_CONFIG.DELITOS_COT.includes(pr.tipo_delito))
  const delitoDom  = cotDelitos.length > 0
    ? Object.entries(cotDelitos.reduce((acc,pr) => { acc[pr.tipo_delito]=(acc[pr.tipo_delito]||0)+1; return acc },{}))
            .sort((a,b) => b[1]-a[1])[0]
    : null
  const amenaza = delitoDom
    ? `${delitoDom[0].replace(/_/g,' ')} confirmado en el período (${delitoDom[1]} caso${delitoDom[1]>1?'s':''}). Mantener patrullaje reforzado.`
    : 'Sin actividad delictual confirmada en el período. Mantener vigilancia preventiva.'

  const clasif     = el('csf-clasif')?.value || 'RESERVADO'
  const nroCsf     = await siguienteNroCsf(cuartelId, mesVig)
  const puntosPorFecha = []

  for (const p of puntosProcesados) {
    const visitas = generarCalendarioVisitas(p, { fecha_vigencia_inicio: iniVig, fecha_vigencia_fin: finVig }, p.fvcFinal, p.turno, p.horaIni, p.horaFin)
    visitas.forEach(v => puntosPorFecha.push({ ...v, punto: p }))
  }
  puntosPorFecha.sort((a,b) => new Date(a.fecha) - new Date(b.fecha))
  puntosPorFecha.forEach((v,i) => v.nroGlobal = i+1)

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

function htmlBorrador(d) {
  const { puntosProcesados, puntosPorFecha, amenaza, clasif, nroCsf, iniVig, finVig, mesVig } = d
  return `
  <div id="csf-print-area">
  <div class="card" style="border:2px solid var(--verde);padding:0;overflow:hidden;margin-bottom:1rem">
    <div style="background:#04742C;color:#fff;padding:.65rem 1rem;font-size:.85rem;font-weight:700;letter-spacing:.3px">
      CARTA DE SITUACIÓN FRONTERIZA — DEMANDA PREVENTIVA
    </div>
    <div style="display:grid;grid-template-columns:auto 1fr auto 1fr auto 1fr;background:#CCE3D3;font-size:.72rem;border-bottom:1px solid #aac">
      ${metaCelda('NRO. CSF:',nroCsf)}${metaCelda('CLASIFICACIÓN:',`<strong style="color:#C0392B">${clasif}</strong>`)}${metaCelda('EMISIÓN:',formatFechaCorta(hoyISO()))}
    </div>
    <div style="display:grid;grid-template-columns:auto 1fr auto 1fr;background:#CCE3D3;font-size:.72rem;border-bottom:1px solid #aac">
      ${metaCelda('SECTOR:',APP.cuartelActivo()?.nombre||'')}${metaCelda('VIGENCIA:',`01-${String(mesVig.mes).padStart(2,'0')}-${mesVig.anio} al ${formatFechaCorta(finVig)} (30 días)`)}
    </div>

    <div style="background:#1A843F;color:#fff;padding:.4rem .85rem;font-size:.74rem;font-weight:700">
      I. NIVELES DE CRITICIDAD POR SECTOR
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:.72rem">
      <thead>
        <tr style="background:#04742C;color:#fff">
          <th style="padding:.35rem .6rem;text-align:left;width:60px">N°</th>
          <th style="padding:.35rem .6rem;text-align:left">Nivel de Criticidad</th>
          <th style="padding:.35rem .6rem;text-align:left;width:100px">Probabilidad</th>
          <th style="padding:.35rem .6rem;text-align:left">Observación</th>
        </tr>
      </thead>
      <tbody>
        ${puntosProcesados.map((p,i) => `
          <tr style="background:${i%2===0?'#E2EFD9':'#fff'}">
            <td style="padding:.3rem .6rem;font-weight:700">${String(i+1).padStart(2,'0')}</td>
            <td style="padding:.3rem .6rem;font-weight:700;color:${p.infoN.color}">${p.infoN.texto}</td>
            <td style="padding:.3rem .6rem;font-weight:700;color:${p.infoN.color}">${p.infoN.probabilidad}</td>
            <td style="padding:.3rem .6rem">${p.observacion}</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <div style="background:#1A843F;color:#fff;padding:.4rem .85rem;font-size:.74rem;font-weight:700">
      II. ANÁLISIS DE AMENAZA
    </div>
    <div style="background:#E2EFD9;padding:.65rem .85rem">
      <div style="display:grid;grid-template-columns:120px 120px 1fr;gap:.5rem;font-size:.72rem">
        <div style="font-weight:700">AMENAZA PRINCIPAL</div>
        <div style="font-weight:700;color:${infoNivel(Math.max(...puntosProcesados.map(p=>p.nivelFinal),1)).color}">${infoNivel(Math.max(...puntosProcesados.map(p=>p.nivelFinal),1)).texto}</div>
        <div>${amenaza}</div>
      </div>
    </div>

    <div style="background:#1A843F;color:#fff;padding:.4rem .85rem;font-size:.74rem;font-weight:700">
      III. LUGARES A PATRULLAR (O.G. 3020)
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:.7rem">
      <thead>
        <tr style="background:#04742C;color:#fff">
          <th style="padding:.35rem .5rem;width:30px">N°</th>
          <th style="padding:.35rem .5rem">Nombre</th>
          <th style="padding:.35rem .5rem;width:100px">Latitud</th>
          <th style="padding:.35rem .5rem;width:100px">Longitud</th>
          <th style="padding:.35rem .5rem;width:200px">Fecha</th>
          <th style="padding:.35rem .5rem;width:130px">Horario</th>
        </tr>
      </thead>
      <tbody>
        ${puntosPorFecha.map((v,i) => `
          <tr style="background:${i%2===0?'#E8F5EC':'#fff'}">
            <td style="padding:.3rem .5rem;font-weight:700;text-align:center">${String(v.nroGlobal).padStart(2,'0')}</td>
            <td style="padding:.3rem .5rem;font-weight:600">
              ${v.punto.nombre}
              <span style="font-size:.62rem;color:var(--muted);margin-left:4px">${v.punto.tipo.toUpperCase()}</span>
            </td>
            <td style="padding:.3rem .5rem;font-family:monospace;font-size:.65rem">${v.punto.latitud ? formatCoord(v.punto.latitud, false) : '—'}</td>
            <td style="padding:.3rem .5rem;font-family:monospace;font-size:.65rem">${v.punto.longitud ? formatCoord(v.punto.longitud, true) : '—'}</td>
            <td style="padding:.3rem .5rem;font-weight:500">${formatFecha(v.fecha)}</td>
            <td style="padding:.3rem .5rem">${v.hora_inicio} – ${v.hora_termino} hrs</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <div style="background:#1A843F;color:#fff;padding:.4rem .85rem;font-size:.74rem;font-weight:700">V. INSTRUCCIONES GENERALES DEL SERVICIO</div>
    <div style="background:#F0F9F3;padding:.75rem .85rem;font-size:.72rem;line-height:1.6">
      <strong>A.</strong> El personal en servicio fronterizo debe portar permanentemente: GPS, teléfono satelital, arma primaria y secundaria, binoculares/visor nocturno, chaleco balístico obligatorio, sistema fotográfico, equipo radial portátil y carta topográfica.<br>
      <strong>B.</strong> En todo procedimiento el personal policial debe garantizar medidas de seguridad de Técnicas en Zonas Fronterizas respecto a los individuos controlados.<br>
      <strong>C.</strong> El Jefe de Patrulla es responsable de documentar el cumplimiento de los lineamientos de la presente CSF.<br>
      <strong>D.</strong> En ninguna circunstancia se permitirá que el personal policial cruce el Límite Político Internacional de la República de Chile.
    </div>

    <div style="background:#1A843F;color:#fff;padding:.4rem .85rem;font-size:.74rem;font-weight:700">VI. FIRMAS Y VALIDACIÓN</div>
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

  <div style="display:flex;gap:.75rem;flex-wrap:wrap">
    <button class="btn btn-primario" onclick="publicarCSF()">✓ Publicar CSF</button>
    <button class="btn btn-secundario" onclick="exportarCSFPDF()">↓ Imprimir / Exportar PDF</button>
    <div style="font-size:.72rem;color:var(--muted);align-self:center">
      ${puntosPorFecha.length} visitas ordenadas · ${puntosProcesados.length} puntos · Vigencia 30 días
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
  const m   = Math.floor((abs-g)*60)
  const s   = Math.round(((abs-g)*60-m)*60)
  const hem = esLon ? (decimal>=0?'E':'W') : (decimal>=0?'N':'S')
  return `${g}°${String(m).padStart(2,'0')}'${String(s).padStart(2,'0')}"${hem}`
}

// B3: Exportar PDF real con window.print()
function exportarCSFPDF() {
  const printArea = el('csf-print-area')
  if (!printArea) { toast('Genere primero el borrador', 'err'); return }

  // Abrir ventana de impresión con solo el contenido de la CSF
  const win = window.open('', '_blank', 'width=900,height=700')
  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8"/>
      <title>CSF — ${APP.cuartelActivo()?.nombre || ''}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #000; background: #fff; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 4px 6px; border: 1px solid #ccc; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      ${printArea.innerHTML}
    </body>
    </html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 500)
}

async function publicarCSF() {
  if (!_csfDatos) { toast('Genere primero el borrador','err'); return }

  // FIX: verificar que hay cuartel activo seleccionado
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
  const { data: csfs } = await APP.sb.from('csf_mensual')
    .select('*').eq('cuartel_id', APP.cuartelActivo()?.id).eq('estado','publicada')
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
    .select('*,punto:puntos_territoriales(nombre,tipo)')
    .eq('csf_id', csf.id).order('fecha_ordenada')

  const hoy      = new Date(hoyISO()+'T12:00:00')
  const pasadas  = (visitas||[]).filter(v => new Date(v.fecha_ordenada+'T12:00:00') <= hoy)
  const ejec     = pasadas.filter(v => v.estado === 'ejecutada')
  const pctGlobal = pasadas.length > 0 ? Math.round((ejec.length/pasadas.length)*100) : 100
  const color     = pctGlobal>=90?'var(--verde)':pctGlobal>=70?'var(--amarillo)':'var(--rojo)'

  zona.innerHTML = `
    <div class="card" style="border-left:4px solid var(--verde);margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <div class="sec-titulo">${csf.numero}</div>
          <div style="font-size:.72rem;color:var(--muted)">${formatFechaCorta(csf.fecha_vigencia_inicio)} → ${formatFechaCorta(csf.fecha_vigencia_fin)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.5rem">
          <div style="text-align:right">
            <div style="font-size:2rem;font-weight:700;color:${color}">${pctGlobal}%</div>
            <div style="font-size:.7rem;color:var(--muted)">Cumplimiento global</div>
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
        Calendario de visitas — Estado actual
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:.72rem">
        <thead>
          <tr style="background:#f0f0f2">
            <th style="padding:.35rem .6rem;text-align:center;width:40px">N°</th>
            <th style="padding:.35rem .6rem;text-align:left">Punto</th>
            <th style="padding:.35rem .6rem;text-align:left;width:180px">Fecha ordenada</th>
            <th style="padding:.35rem .6rem;text-align:left;width:130px">Horario</th>
            <th style="padding:.35rem .6rem;text-align:center;width:100px">Estado</th>
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

// M3: despublicar CSF para corregir errores
async function despublicarCSF(csfId) {
  if (!confirm('¿Volver esta CSF a estado borrador? Se podrá corregir y volver a publicar.')) return
  const { error } = await APP.sb.from('csf_mensual')
    .update({ estado: 'borrador', publicado_at: null, publicado_por: null })
    .eq('id', csfId)
  if (error) { toast('Error al despublicar: ' + error.message, 'err'); return }
  toast('CSF vuelva a borrador. Genere una nueva versión.', 'ok')
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
                <span style="background:#fff0f1;color:#C0392B;font-size:.65rem;font-weight:700;padding:1px 6px;border-radius:3px">${c.clasificacion}</span>
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
