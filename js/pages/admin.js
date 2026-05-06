// ============================================================
// SISTEMA CSF OPERATIVA — admin.js  v2.0
// MEJORAS v2.0:
//   M1 — Reasignación de punto entre cuarteles
//         Botón "⇄ Cambiar cuartel" en tabla de puntos.
//         Muestra advertencia si el punto está en CSF publicada.
//         Solo disponible para Administrador.
// ============================================================

let _adminTab = 'puntos'

async function renderAdmin() {
  if (!APP.esAdministrador() && !APP.esComisario()) {
    el('pantalla-admin').innerHTML = '<div class="container"><div class="card" style="text-align:center;padding:2rem;color:var(--muted)">Acceso restringido</div></div>'
    return
  }
  if (!APP.cuartelActivo()?.id) {
    el('pantalla-admin').innerHTML = '<div class="container"><div class="card" style="text-align:center;padding:2rem;color:var(--muted)">⚠ Selecciona un cuartel desde el selector superior para acceder a la administración.</div></div>'
    return
  }
  el('pantalla-admin').innerHTML = `
    <div class="container">
      <h2 class="page-titulo">Administración</h2>
      <div class="tabs-bar">
        ${adminTabBtn('puntos',         '📍 Puntos territoriales')}
        ${adminTabBtn('personal',       '👤 Personal')}
        ${adminTabBtn('usuarios',       '🔑 Usuarios sistema')}
        ${adminTabBtn('validadores',    '🔍 Validadores')}
        ${adminTabBtn('denominadores',  '📊 Denominadores IDFI')}
        ${adminTabBtn('reportes_intel', '📋 Reportes inteligencia')}
      </div>
      <div id="admin-contenido"><div class="cargando">Cargando...</div></div>
    </div>`
  await cambiarTabAdmin('puntos')
}

function adminTabBtn(tab, label) {
  return `<button class="tab-btn ${_adminTab===tab?'tab-activo':''}" data-tab="${tab}" onclick="cambiarTabAdmin('${tab}')">${label}</button>`
}

async function cambiarTabAdmin(tab) {
  _adminTab = tab
  qsa('.tab-btn').forEach(b => b.classList.toggle('tab-activo', b.dataset.tab === tab))
  switch(tab) {
    case 'puntos':         await adminPuntos();        break
    case 'personal':       await adminPersonal();      break
    case 'usuarios':       await adminUsuarios();      break
    case 'validadores':    await adminValidadores();   break
    case 'denominadores':  await adminDenominadores(); break
    case 'reportes_intel': await adminReportesIntel(); break
  }
}

// ── PUNTOS TERRITORIALES ─────────────────────────────────────
async function adminPuntos() {
  const { data: puntos } = await APP.sb.from('puntos_territoriales')
    .select('*').eq('cuartel_id', APP.cuartelActivo()?.id).order('tipo').order('nombre')

  el('admin-contenido').innerHTML = `
    <div class="card" style="margin-bottom:.75rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div class="sec-titulo" style="margin:0">Puntos Territoriales (${puntos?.length||0})</div>
        <button class="btn btn-primario btn-sm" onclick="modalNuevoPunto()">+ Nuevo punto</button>
      </div>
      <div style="font-size:.75rem;color:var(--muted);margin-bottom:.75rem">
        ⚠ Agregue coordenadas GPS para activar el cálculo automático de radio 5km
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:.76rem">
        <thead>
          <tr style="background:#f0f0f2">
            <th style="padding:.35rem .6rem;text-align:left">Nombre</th>
            <th style="padding:.35rem .6rem;text-align:left;width:55px">Tipo</th>
            <th style="padding:.35rem .6rem;text-align:left;width:90px">FVC base</th>
            <th style="padding:.35rem .6rem;text-align:left;width:80px">Valor estrat.</th>
            <th style="padding:.35rem .6rem;text-align:center;width:80px">Coordenadas</th>
            <th style="padding:.35rem .6rem;text-align:center;width:60px">Activo</th>
            <th style="padding:.35rem .6rem;text-align:center;width:60px">Editar</th>
            ${APP.esAdministrador() ? '<th style="padding:.35rem .6rem;text-align:center;width:80px">Cuartel</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${(puntos||[]).map((p,i) => `
            <tr style="${i%2===0?'background:#fafafa':''};border-bottom:1px solid var(--border)">
              <td style="padding:.3rem .6rem;font-weight:500">${p.nombre}</td>
              <td style="padding:.3rem .6rem">
                <span class="badge-tipo badge-${p.tipo}">${p.tipo.toUpperCase()}</span>
              </td>
              <td style="padding:.3rem .6rem;font-size:.7rem">${CSF_CONFIG.FVC_LABELS[p.fvc_base]||p.fvc_base}</td>
              <td style="padding:.3rem .6rem;font-size:.7rem;text-transform:capitalize">${p.valor_estrategico}</td>
              <td style="padding:.3rem .6rem;text-align:center">
                ${p.latitud
                  ? `<span style="color:var(--verde);font-size:.8rem">✓ GPS</span>`
                  : `<span style="color:var(--amarillo);font-size:.8rem">Sin GPS</span>`}
              </td>
              <td style="padding:.3rem .6rem;text-align:center">
                <input type="checkbox" ${p.activo?'checked':''} onchange="toggleActivoPunto('${p.id}',this.checked)"/>
              </td>
              <td style="padding:.3rem .6rem;text-align:center">
                <button class="btn btn-sm btn-secundario" onclick="editarPunto('${p.id}')">✎</button>
              </td>
              ${APP.esAdministrador() ? `
              <td style="padding:.3rem .6rem;text-align:center">
                <button class="btn btn-sm" style="background:#fff3e0;border:1px solid #ff9800;color:#e65100;font-size:.68rem;padding:.2rem .4rem;border-radius:4px"
                  onclick="modalReasignarPunto('${p.id}', '${p.nombre.replace(/'/g,'\\'')}')">⇄ Cuartel</button>
              </td>` : ''}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div id="modal-punto" class="modal" style="display:none">
      <div class="modal-box" id="form-punto-contenido"></div>
    </div>
    <div id="modal-reasignar" class="modal" style="display:none">
      <div class="modal-box" id="form-reasignar-contenido"></div>
    </div>`
}

// ── M1: MODAL REASIGNAR PUNTO ─────────────────────────────────
async function modalReasignarPunto(puntoId, nombrePunto) {
  // Cargar todos los cuarteles
  const { data: cuarteles } = await APP.sb.from('cuarteles')
    .select('id,nombre').eq('activo', true).order('nombre')

  // Verificar si el punto está en alguna CSF publicada o aprobada
  const { data: enCSF } = await APP.sb.from('csf_puntos_fvc')
    .select('csf_id, csf:csf_mensual(numero,estado,cuartel:cuarteles(nombre))')
    .eq('punto_id', puntoId)

  const csfPublicadas = (enCSF||[]).filter(r =>
    r.csf?.estado === 'publicada' || r.csf?.estado === 'aprobada'
  )

  const advertencia = csfPublicadas.length > 0 ? `
    <div style="background:#fdecea;border:1.5px solid var(--rojo);border-radius:8px;padding:.75rem;margin-bottom:1rem;font-size:.78rem;color:var(--rojo)">
      ⚠ <strong>Atención:</strong> Este punto está incluido en ${csfPublicadas.length} CSF publicada(s) o aprobada(s):
      <ul style="margin:.3rem 0 0 1rem">
        ${csfPublicadas.map(r => `<li>CSF ${r.csf?.numero||'—'} — ${r.csf?.cuartel?.nombre||'—'} (${r.csf?.estado})</li>`).join('')}
      </ul>
      <div style="margin-top:.4rem">Al reasignar, esas CSF quedarán <strong>desactualizadas</strong> y deberán regenerarse.</div>
    </div>` : `
    <div style="background:#e8f5ea;border:1px solid var(--verde);border-radius:8px;padding:.6rem;margin-bottom:1rem;font-size:.78rem;color:var(--verde)">
      ✓ Este punto no está en ninguna CSF publicada. Reasignación segura.
    </div>`

  el('form-reasignar-contenido').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:1rem">
      <div class="modal-titulo">Reasignar punto a otro cuartel</div>
      <button onclick="el('modal-reasignar').style.display='none'" class="btn-cerrar">✕</button>
    </div>

    <div style="font-size:.85rem;font-weight:600;margin-bottom:.75rem;padding:.5rem .75rem;background:var(--bg-alt);border-radius:6px">
      📍 ${nombrePunto}
    </div>

    ${advertencia}

    <div class="campo" style="margin-bottom:1rem">
      <label>Cuartel destino</label>
      <select id="reasignar-cuartel-select" style="width:100%">
        <option value="">— Seleccione cuartel —</option>
        ${(cuarteles||[])
          .filter(c => c.id !== APP.cuartelActivo()?.id)
          .map(c => `<option value="${c.id}">${c.nombre.replace(' (F)','')}</option>`)
          .join('')}
      </select>
    </div>

    <div class="campo" style="margin-bottom:1.25rem">
      <label>Motivo de la reasignación <span style="color:var(--rojo)">*</span></label>
      <textarea id="reasignar-motivo" rows="2" placeholder="Ej: Error en asignación inicial. El hito corresponde geográficamente al sector de Caquena."
        style="width:100%;font-size:.8rem;padding:.5rem;border:1px solid var(--border);border-radius:6px;resize:vertical"></textarea>
    </div>

    <div style="display:flex;gap:.5rem">
      <button class="btn btn-primario" onclick="ejecutarReasignacion('${puntoId}')">⇄ Reasignar</button>
      <button class="btn btn-ghost" onclick="el('modal-reasignar').style.display='none'">Cancelar</button>
    </div>`

  el('modal-reasignar').style.display = 'flex'
}

async function ejecutarReasignacion(puntoId) {
  const cuartelDestino = el('reasignar-cuartel-select')?.value
  const motivo         = el('reasignar-motivo')?.value?.trim()

  if (!cuartelDestino) { toast('Selecciona un cuartel destino', 'err'); return }
  if (!motivo)         { toast('Ingresa el motivo de la reasignación', 'err'); return }

  const { error } = await APP.sb.from('puntos_territoriales')
    .update({
      cuartel_id: cuartelDestino,
      observacion_reasignacion: motivo,
      reasignado_at: new Date().toISOString(),
      reasignado_por: APP.perfil?.id,
    })
    .eq('id', puntoId)

  if (error) {
    // Si falla por columnas que no existen, intentar solo con cuartel_id
    const { error: error2 } = await APP.sb.from('puntos_territoriales')
      .update({ cuartel_id: cuartelDestino })
      .eq('id', puntoId)
    if (error2) { toast('Error: ' + error2.message, 'err'); return }
  }

  toast('Punto reasignado correctamente', 'ok')
  el('modal-reasignar').style.display = 'none'
  await adminPuntos()
}

function modalNuevoPunto() {
  el('form-punto-contenido').innerHTML = htmlFormPunto(null)
  el('modal-punto').style.display = 'flex'
}

async function editarPunto(id) {
  const { data: p } = await APP.sb.from('puntos_territoriales').select('*').eq('id', id).single()
  el('form-punto-contenido').innerHTML = htmlFormPunto(p)
  el('modal-punto').style.display = 'flex'
}

function htmlFormPunto(p) {
  return `
    <div style="display:flex;justify-content:space-between;margin-bottom:1rem">
      <div class="modal-titulo">${p ? 'Editar punto' : 'Nuevo punto'}</div>
      <button onclick="el('modal-punto').style.display='none'" class="btn-cerrar">✕</button>
    </div>
    <input type="hidden" id="punto-id" value="${p?.id||''}"/>
    <div class="g2">
      <div class="campo">
        <label>Nombre corto</label>
        <input id="punto-nombre" type="text" value="${p?.nombre||''}" placeholder="Hito 1"/>
      </div>
      <div class="campo">
        <label>Tipo</label>
        <select id="punto-tipo">
          <option value="hito" ${p?.tipo==='hito'?'selected':''}>Hito</option>
          <option value="pnh"  ${p?.tipo==='pnh' ?'selected':''}>PNH</option>
          <option value="sie"  ${p?.tipo==='sie' ?'selected':''}>SIE</option>
        </select>
      </div>
      <div class="campo">
        <label>Nombre completo</label>
        <input id="punto-nombre-completo" type="text" value="${p?.nombre_completo||''}" placeholder="Descripción geográfica"/>
      </div>
      <div class="campo">
        <label>País limítrofe</label>
        <select id="punto-pais">
          <option value="PERÚ"    ${p?.pais_limitrofe==='PERÚ'   ?'selected':''}>Perú</option>
          <option value="BOLIVIA" ${p?.pais_limitrofe==='BOLIVIA'?'selected':''}>Bolivia</option>
        </select>
      </div>
      <div class="campo">
        <label>Latitud (decimal)</label>
        <input id="punto-lat" type="number" step="0.0001" value="${p?.latitud||''}" placeholder="-18.3875"/>
      </div>
      <div class="campo">
        <label>Longitud (decimal)</label>
        <input id="punto-lon" type="number" step="0.0001" value="${p?.longitud||''}" placeholder="-69.7583"/>
      </div>
      <div class="campo">
        <label>FVC base (mínimo)</label>
        <select id="punto-fvc">
          ${CSF_CONFIG.FVC_ORDEN.map(f => `<option value="${f}" ${p?.fvc_base===f?'selected':''}>${CSF_CONFIG.FVC_LABELS[f]}</option>`).join('')}
        </select>
      </div>
      <div class="campo">
        <label>Valor estratégico</label>
        <select id="punto-valor">
          <option value="bajo"    ${p?.valor_estrategico==='bajo'   ?'selected':''}>Bajo</option>
          <option value="medio"   ${p?.valor_estrategico==='medio'  ?'selected':''}>Medio</option>
          <option value="alto"    ${p?.valor_estrategico==='alto'   ?'selected':''}>Alto</option>
          <option value="critico" ${p?.valor_estrategico==='critico'?'selected':''}>Crítico</option>
        </select>
      </div>
    </div>
    <div style="display:flex;gap:.75rem;margin-top:1rem">
      <button class="btn btn-primario" onclick="guardarPunto()">Guardar</button>
      <button class="btn btn-secundario" onclick="el('modal-punto').style.display='none'">Cancelar</button>
    </div>`
}

async function guardarPunto() {
  const id  = el('punto-id')?.value
  const dat = {
    cuartel_id:        APP.cuartelActivo()?.id,
    nombre:            el('punto-nombre')?.value?.trim(),
    tipo:              el('punto-tipo')?.value,
    nombre_completo:   el('punto-nombre-completo')?.value?.trim(),
    pais_limitrofe:    el('punto-pais')?.value,
    latitud:           parseFloat(el('punto-lat')?.value)||null,
    longitud:          parseFloat(el('punto-lon')?.value)||null,
    fvc_base:          el('punto-fvc')?.value,
    valor_estrategico: el('punto-valor')?.value,
    activo:            true,
  }
  if (!dat.nombre) { toast('Ingrese un nombre','err'); return }
  const { error } = id
    ? await APP.sb.from('puntos_territoriales').update(dat).eq('id', id)
    : await APP.sb.from('puntos_territoriales').insert(dat)
  if (error) { toast('Error: '+error.message,'err'); return }
  toast('Punto guardado','ok')
  el('modal-punto').style.display = 'none'
  await adminPuntos()
}

async function toggleActivoPunto(id, activo) {
  await APP.sb.from('puntos_territoriales').update({ activo }).eq('id', id)
  toast(activo ? 'Punto activado' : 'Punto desactivado', 'ok')
}

// ── PERSONAL ─────────────────────────────────────────────────
async function adminPersonal() {
  const { data: personal } = await APP.sb.from('personal_cuartel')
    .select('*').eq('cuartel_id', APP.cuartelActivo()?.id).order('codigo_funcionario')

  el('admin-contenido').innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div class="sec-titulo" style="margin:0">Personal del cuartel (${personal?.length||0} funcionarios)</div>
        <button class="btn btn-primario btn-sm" onclick="modalNuevoFuncionario()">+ Agregar código</button>
      </div>
      <div style="font-size:.75rem;color:var(--muted);margin-bottom:.75rem">
        Solo se almacenan códigos de funcionario, sin datos personales.
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:.5rem">
        ${(personal||[]).map(p => `
          <div style="display:flex;align-items:center;gap:.4rem;background:var(--bg-alt);padding:.4rem .75rem;border-radius:6px;font-size:.78rem">
            <span style="font-family:monospace;font-weight:700">${p.codigo_funcionario}</span>
            <input type="checkbox" ${p.activo?'checked':''} onchange="toggleActivoPersonal('${p.id}',this.checked)" title="Activo"/>
            <button onclick="eliminarPersonal('${p.id}')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:.9rem;padding:0">✕</button>
          </div>`).join('')}
        ${!personal?.length ? '<div style="color:var(--muted);font-size:.8rem">Sin personal registrado</div>' : ''}
      </div>
    </div>
    <div id="modal-personal" class="modal" style="display:none">
      <div class="modal-box" id="form-personal-contenido"></div>
    </div>`
}

function modalNuevoFuncionario() {
  el('form-personal-contenido').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:1rem">
      <div class="modal-titulo">Agregar código funcionario</div>
      <button onclick="el('modal-personal').style.display='none'" class="btn-cerrar">✕</button>
    </div>
    <div class="campo" style="margin-bottom:1rem">
      <label>Código funcionario</label>
      <input id="nuevo-codigo" type="text" placeholder="Ej: 42891" maxlength="10"/>
    </div>
    <div style="display:flex;gap:.5rem">
      <button class="btn btn-primario" onclick="guardarFuncionario()">Guardar</button>
      <button class="btn btn-ghost" onclick="el('modal-personal').style.display='none'">Cancelar</button>
    </div>`
  el('modal-personal').style.display = 'flex'
}

async function guardarFuncionario() {
  const codigo = el('nuevo-codigo')?.value?.trim()
  if (!codigo) { toast('Ingrese un código','err'); return }
  const { error } = await APP.sb.from('personal_cuartel').insert({
    cuartel_id: APP.cuartelActivo()?.id,
    codigo_funcionario: codigo,
    activo: true,
  })
  if (error) { toast('Error: '+error.message,'err'); return }
  toast('Código agregado','ok')
  el('modal-personal').style.display = 'none'
  await adminPersonal()
}

async function toggleActivoPersonal(id, activo) {
  await APP.sb.from('personal_cuartel').update({ activo }).eq('id', id)
}

async function eliminarPersonal(id) {
  if (!confirm('¿Eliminar este código?')) return
  await APP.sb.from('personal_cuartel').delete().eq('id', id)
  toast('Código eliminado','ok')
  await adminPersonal()
}

// ── USUARIOS ──────────────────────────────────────────────────
async function adminUsuarios() {
  const puedeVerTodos = APP.esAdministrador()
  let q = APP.sb.from('usuarios').select('*,cuartel:cuarteles(nombre)').order('email')
  if (!puedeVerTodos) q = q.eq('cuartel_id', APP.cuartelActivo()?.id)
  const { data: usuarios } = await q

  el('admin-contenido').innerHTML = `
    <div class="card">
      <div class="sec-titulo" style="margin-bottom:1rem">Usuarios del sistema</div>
      <table style="width:100%;border-collapse:collapse;font-size:.76rem">
        <thead>
          <tr style="background:#f0f0f2">
            <th style="padding:.35rem .6rem;text-align:left">Email</th>
            <th style="padding:.35rem .6rem;text-align:left">Rol</th>
            <th style="padding:.35rem .6rem;text-align:left">Cuartel</th>
            <th style="padding:.35rem .6rem;text-align:center">Activo</th>
          </tr>
        </thead>
        <tbody>
          ${(usuarios||[]).map((u,i) => `
            <tr style="${i%2===0?'background:#fafafa':''};border-bottom:1px solid var(--border)">
              <td style="padding:.3rem .6rem">${u.email}</td>
              <td style="padding:.3rem .6rem;text-transform:capitalize">${u.rol}</td>
              <td style="padding:.3rem .6rem;font-size:.7rem">${u.cuartel?.nombre?.replace(' (F)','')||'—'}</td>
              <td style="padding:.3rem .6rem;text-align:center">
                <input type="checkbox" ${u.activo?'checked':''} onchange="toggleActivoUsuario('${u.id}',this.checked)"/>
              </td>
            </tr>`).join('')}
          ${!usuarios?.length?'<tr><td colspan="4" style="padding:1.5rem;text-align:center;color:var(--muted)">Sin usuarios</td></tr>':''}
        </tbody>
      </table>
    </div>`
}

async function toggleActivoUsuario(id, activo) {
  await APP.sb.from('usuarios').update({ activo }).eq('id', id)
  toast(activo ? 'Usuario activado' : 'Usuario desactivado', 'ok')
}

// ── VALIDADORES ───────────────────────────────────────────────
async function adminValidadores() {
  const { data: validadores } = await APP.sb.from('usuarios')
    .select('*,cuartel:cuarteles(nombre)').eq('rol','validador').order('email')

  el('admin-contenido').innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div class="sec-titulo" style="margin:0">Validadores — Subprefecto Fronterizo</div>
      </div>
      <div style="font-size:.78rem;color:#1565C0;background:#EBF3FB;border:1px solid #90CAF9;border-radius:6px;padding:.65rem .85rem;margin-bottom:1rem;line-height:1.6">
        🔍 Los usuarios con rol <strong>validador</strong> tienen acceso exclusivo a la pantalla de CSF en revisión.
        Pueden ver todas las cartas pendientes, editar horarios de visita y aprobar masivamente con su firma digital.
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:.76rem">
        <thead>
          <tr style="background:#f0f0f2">
            <th style="padding:.35rem .6rem;text-align:left">Email</th>
            <th style="padding:.35rem .6rem;text-align:left">Cuartel</th>
            <th style="padding:.35rem .6rem;text-align:center">Activo</th>
          </tr>
        </thead>
        <tbody>
          ${(validadores||[]).map((u,i) => `
            <tr style="${i%2===0?'background:#fafafa':''};border-bottom:1px solid var(--border)">
              <td style="padding:.3rem .6rem">${u.email}</td>
              <td style="padding:.3rem .6rem;font-size:.7rem">${u.cuartel?.nombre?.replace(' (F)','')||'—'}</td>
              <td style="padding:.3rem .6rem;text-align:center">
                <input type="checkbox" ${u.activo?'checked':''} onchange="toggleActivoUsuario('${u.id}',this.checked)"/>
              </td>
            </tr>`).join('')}
          ${!validadores?.length?'<tr><td colspan="3" style="padding:1.5rem;text-align:center;color:var(--muted)">Sin validadores registrados</td></tr>':''}
        </tbody>
      </table>
    </div>`
}

// ── DENOMINADORES IDFI ────────────────────────────────────────
async function adminDenominadores() {
  const { data: puntos } = await APP.sb.from('puntos_territoriales')
    .select('*').eq('cuartel_id', APP.cuartelActivo()?.id).eq('activo', true).order('tipo').order('nombre')

  const hitos = (puntos||[]).filter(p => p.tipo === 'hito').length
  const pnhs  = (puntos||[]).filter(p => p.tipo === 'pnh').length
  const sies  = (puntos||[]).filter(p => p.tipo === 'sie').length

  const { data: cfg } = await APP.sb.from('config_cuartel')
    .select('*').eq('cuartel_id', APP.cuartelActivo()?.id).single()

  el('admin-contenido').innerHTML = `
    <div class="card">
      <div class="sec-titulo">Denominadores para cálculo IDFI</div>
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:1rem">
        Estos valores se usan como denominador en el cálculo de los indicadores DFP y DFO.
      </div>
      <div class="g2" style="margin-bottom:1.5rem">
        <div class="kpi-card" style="border-left:3px solid var(--verde)">
          <div class="kpi-valor">${hitos}</div>
          <div class="kpi-label">Hitos activos</div>
          <div class="kpi-sub">DFP-01</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid var(--rojo)">
          <div class="kpi-valor">${pnhs}</div>
          <div class="kpi-label">PNH activos</div>
          <div class="kpi-sub">DFP-02</div>
        </div>
        <div class="kpi-card" style="border-left:3px solid var(--azul)">
          <div class="kpi-valor">${sies}</div>
          <div class="kpi-label">SIE activos</div>
          <div class="kpi-sub">DFP-03</div>
        </div>
      </div>
      <div class="sec-titulo" style="font-size:.82rem">Meta UF mensual (DFO-05)</div>
      <div class="campo-inline" style="margin-bottom:1.5rem">
        <input id="meta-uf" type="number" min="0" step="0.1"
               value="${cfg?.meta_uf_mensual || 50}"
               placeholder="Ej: 50" style="width:120px"/>
        <span style="font-size:.78rem;color:var(--muted)">UF por mes</span>
        <button class="btn btn-primario btn-sm" onclick="guardarConfigIDFI()">Guardar</button>
      </div>
      <div class="sec-titulo" style="font-size:.82rem">Objetivos internacionales del período (DFO-06)</div>
      <div style="font-size:.75rem;color:var(--muted);margin-bottom:.5rem">
        Número de objetivos requeridos por inteligencia para este cuartel en el mes.
      </div>
      <div class="campo-inline">
        <input id="meta-objetivos" type="number" min="0"
               value="${cfg?.meta_objetivos_internacionales || 0}"
               placeholder="Ej: 3" style="width:120px"/>
        <span style="font-size:.78rem;color:var(--muted)">objetivos / mes</span>
        <button class="btn btn-primario btn-sm" onclick="guardarConfigIDFI()">Guardar</button>
      </div>
    </div>`
}

async function guardarConfigIDFI() {
  const metaUF  = parseFloat(el('meta-uf')?.value) || 50
  const metaObj = parseInt(el('meta-objetivos')?.value) || 0
  const cid     = APP.cuartelActivo()?.id
  const { error } = await APP.sb.from('config_cuartel').upsert({
    cuartel_id: cid,
    meta_uf_mensual: metaUF,
    meta_objetivos_internacionales: metaObj,
  }, { onConflict: 'cuartel_id' })
  if (error) { toast('Error: '+error.message,'err'); return }
  toast('Configuración guardada','ok')
}

// ── REPORTES INTELIGENCIA ─────────────────────────────────────
async function adminReportesIntel() {
  const { data: reportes } = await APP.sb.from('reportes_inteligencia')
    .select('*,observacion:observaciones_intel(tipo_hallazgo,nivel_relevancia)')
    .eq('cuartel_id', APP.cuartelActivo()?.id)
    .order('fecha_generado', { ascending: false })
    .limit(50)

  el('admin-contenido').innerHTML = `
    <div class="card">
      <div class="sec-titulo" style="margin-bottom:1rem">Reportes de inteligencia (${reportes?.length||0})</div>
      <table style="width:100%;border-collapse:collapse;font-size:.76rem">
        <thead>
          <tr style="background:#f0f0f2">
            <th style="padding:.35rem .6rem;text-align:left">Fecha</th>
            <th style="padding:.35rem .6rem;text-align:left">Tipo hallazgo</th>
            <th style="padding:.35rem .6rem;text-align:left">Nivel</th>
            <th style="padding:.35rem .6rem;text-align:center">Estado</th>
            <th style="padding:.35rem .6rem;text-align:center">Acción</th>
          </tr>
        </thead>
        <tbody>
          ${(reportes||[]).map((r,i) => `
            <tr style="${i%2===0?'background:#fafafa':''};border-bottom:1px solid var(--border)">
              <td style="padding:.35rem .6rem">${formatFechaCorta(r.fecha_generado)}</td>
              <td style="padding:.35rem .6rem">${r.observacion?.tipo_hallazgo?.replace(/_/g,' ')||'—'}</td>
              <td style="padding:.35rem .6rem">
                <span style="font-weight:700;color:${r.observacion?.nivel_relevancia==='alto'?'var(--rojo)':r.observacion?.nivel_relevancia==='medio'?'var(--amarillo)':'var(--verde)'}">
                  ${(r.observacion?.nivel_relevancia||'—').toUpperCase()}
                </span>
              </td>
              <td style="padding:.35rem .6rem;text-align:center">
                <span class="badge badge-${r.estado==='entregado'?'completado':'pendiente'}">${r.estado.toUpperCase()}</span>
              </td>
              <td style="padding:.35rem .6rem;text-align:center">
                ${r.estado === 'pendiente'
                  ? `<button class="btn btn-sm btn-primario" onclick="marcarReporteEntregado('${r.id}')">✓ Entregado</button>`
                  : formatFechaCorta(r.fecha_entregado)}
              </td>
            </tr>`).join('')}
          ${!reportes?.length?'<tr><td colspan="5" style="padding:1.5rem;text-align:center;color:var(--muted)">Sin reportes generados</td></tr>':''}
        </tbody>
      </table>
    </div>`
}

async function marcarReporteEntregado(id) {
  await APP.sb.from('reportes_inteligencia').update({
    estado: 'entregado', fecha_entregado: hoyISO()
  }).eq('id', id)
  toast('Reporte marcado como entregado','ok')
  await adminReportesIntel()
}
