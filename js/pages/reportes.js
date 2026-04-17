// ============================================================
// SISTEMA CSF OPERATIVA — reportes.js  v1.2
// Contiene ÚNICAMENTE las funciones propias de reportes:
//   - renderReportes()
//   - consultarReportes()
//   - validarCodigo()
//   - abrirMapaCoordenadas() + helpers de mapa (Leaflet)
// Las 37 funciones de servicios.js fueron eliminadas —
// viven exclusivamente en servicios.js.
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
      <h2 class="page-titulo">Reportes operativos</h2>
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
    let query = APP.sb.from('servicios')
      .select('*, cuartel:cuarteles(nombre), visitas:visitas_puntos(count), incautaciones(count), observaciones_intel(count)')
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: false })

    if (cuartelFilt) query = query.eq('cuartel_id', cuartelFilt)
    else if (!puedeVerTodos) query = query.eq('cuartel_id', APP.cuartel?.id)

    const { data: servicios, error } = await query
    if (error) throw error

    const total      = servicios?.length || 0
    const completados = servicios?.filter(s => s.estado === 'completado').length || 0
    const pendientes  = servicios?.filter(s => s.estado === 'pendiente').length || 0

    el('rep-contenido').innerHTML = `
      <div class="g3" style="margin-bottom:1rem">
        <div class="kpi-card"><div class="kpi-valor">${total}</div><div class="kpi-label">Total servicios</div></div>
        <div class="kpi-card" style="border-left:3px solid var(--verde)"><div class="kpi-valor">${completados}</div><div class="kpi-label">Completados</div></div>
        <div class="kpi-card" style="border-left:3px solid var(--amarillo)"><div class="kpi-valor">${pendientes}</div><div class="kpi-label">Pendientes</div></div>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:.78rem">
          <thead>
            <tr style="background:var(--encabezado)">
              <th style="padding:.4rem .7rem;text-align:left">Fecha</th>
              <th style="padding:.4rem .7rem;text-align:left">Tipo servicio</th>
              ${puedeVerTodos ? `<th style="padding:.4rem .7rem;text-align:left">Cuartel</th>` : ''}
              <th style="padding:.4rem .7rem;text-align:center">Estado</th>
              <th style="padding:.4rem .7rem;text-align:center">Visitas</th>
              <th style="padding:.4rem .7rem;text-align:center">Incaut.</th>
              <th style="padding:.4rem .7rem;text-align:center">Intel.</th>
            </tr>
          </thead>
          <tbody>
            ${(servicios||[]).map((s,i) => `
              <tr style="${i%2===0?'background:var(--tabla-datos)':''};border-bottom:1px solid var(--border)">
                <td style="padding:.35rem .7rem">${formatFechaCorta(s.fecha)}</td>
                <td style="padding:.35rem .7rem;font-size:.73rem">${s.tipo_servicio}</td>
                ${puedeVerTodos ? `<td style="padding:.35rem .7rem;font-size:.72rem">${s.cuartel?.nombre?.replace(' (F)','')||'—'}</td>` : ''}
                <td style="padding:.35rem .7rem;text-align:center"><span class="badge badge-${s.estado}">${s.estado}</span></td>
                <td style="padding:.35rem .7rem;text-align:center">${s.visitas?.[0]?.count||0}</td>
                <td style="padding:.35rem .7rem;text-align:center">${s.incautaciones?.[0]?.count||0}</td>
                <td style="padding:.35rem .7rem;text-align:center">${s.observaciones_intel?.[0]?.count||0}</td>
              </tr>`).join('')}
            ${!total ? `<tr><td colspan="7" style="padding:1.5rem;text-align:center;color:var(--muted)">Sin servicios en el período</td></tr>` : ''}
          </tbody>
        </table>
      </div>`
  } catch(e) {
    el('rep-contenido').innerHTML = `<div class="card" style="color:var(--rojo)">Error: ${e.message}</div>`
    console.error('consultarReportes error:', e)
  }
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
  _puntosDelCuartel.forEach(p => {
    if (p.latitud && p.longitud) {
      L.circleMarker([p.latitud, p.longitud], { radius: 5, color: '#1D9E75', fillOpacity: .7 })
        .addTo(_mapaCoords).bindPopup(p.nombre)
    }
  })
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
  if (puntoId) {
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
