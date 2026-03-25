// ============================================================
// SISTEMA CSF OPERATIVA — admin.js
// Panel administrador
// ============================================================

let _adminTab = 'puntos'

async function renderAdmin() {
  if (!APP.esAdministrador() && !APP.esComisario()) {
    el('pantalla-admin').innerHTML = '<div class="container"><div class="card" style="text-align:center;padding:2rem;color:var(--muted)">Acceso restringido</div></div>'
    return
  }
  el('pantalla-admin').innerHTML = `
    <div class="container">
      <h2 class="page-titulo">Administración</h2>
      <div class="tabs-bar">
        ${adminTabBtn('puntos','📍 Puntos territoriales')}
        ${adminTabBtn('personal','👤 Personal')}
        ${adminTabBtn('usuarios','🔑 Usuarios sistema')}
        ${adminTabBtn('denominadores','📊 Denominadores IDFI')}
        ${adminTabBtn('reportes_intel','📋 Reportes inteligencia')}
      </div>
      <div id="admin-contenido"><div class="cargando">Cargando...</div></div>
    </div>`
  await cambiarTabAdmin('puntos')
}

function adminTabBtn(tab, label) {
  return `<button class="tab-btn ${_adminTab===tab?'tab-activo':''}" onclick="cambiarTabAdmin('${tab}')">${label}</button>`
}

async function cambiarTabAdmin(tab) {
  _adminTab = tab
  qsa('.tab-btn').forEach(b => b.classList.remove('tab-activo'))
  const btns = qsa('.tab-btn')
  const labels = { puntos:'Puntos', personal:'Personal', usuarios:'Usuarios', denominadores:'Denominadores', reportes_intel:'Reportes' }
  btns.forEach(b => { if(b.textContent.includes(labels[tab])) b.classList.add('tab-activo') })
  switch(tab) {
    case 'puntos':          await adminPuntos(); break
    case 'personal':        await adminPersonal(); break
    case 'usuarios':        await adminUsuarios(); break
    case 'denominadores':   await adminDenominadores(); break
    case 'reportes_intel':  await adminReportesIntel(); break
  }
}

// ── PUNTOS TERRITORIALES ─────────────────────────────────────
async function adminPuntos() {
  const { data: puntos } = await APP.sb.from('puntos_territoriales')
    .select('*').eq('cuartel_id', APP.cuartel.id).order('tipo').order('nombre')

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
                ${p.latitud ? `<span style="color:var(--verde);font-size:.8rem">✓ GPS</span>` : `<span style="color:var(--amarillo);font-size:.8rem">Sin GPS</span>`}
              </td>
              <td style="padding:.3rem .6rem;text-align:center">
                <input type="checkbox" ${p.activo?'checked':''} onchange="toggleActivoPunto('${p.id}',this.checked)"/>
              </td>
              <td style="padding:.3rem .6rem;text-align:center">
                <button class="btn btn-sm btn-secundario" onclick="editarPunto('${p.id}')">✎</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div id="modal-punto" class="modal" style="display:none">
      <div class="modal-box" id="form-punto-contenido"></div>
    </div>`
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
          <option value="PERÚ"    ${p?.pais_limitrofe==='PERÚ'?'selected':''}>Perú</option>
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
          <option value="bajo"    ${p?.valor_estrategico==='bajo'?'selected':''}>Bajo</option>
          <option value="medio"   ${p?.valor_estrategico==='medio'?'selected':''}>Medio</option>
          <option value="alto"    ${p?.valor_estrategico==='alto'?'selected':''}>Alto</option>
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
    cuartel_id:      APP.cuartel.id,
    nombre:          el('punto-nombre')?.value?.trim(),
    tipo:            el('punto-tipo')?.value,
    nombre_completo: el('punto-nombre-completo')?.value?.trim(),
    pais_limitrofe:  el('punto-pais')?.value,
    latitud:         parseFloat(el('punto-lat')?.value)||null,
    longitud:        parseFloat(el('punto-lon')?.value)||null,
    fvc_base:        el('punto-fvc')?.value,
    valor_estrategico: el('punto-valor')?.value,
    activo:          true,
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
    .select('*').eq('cuartel_id', APP.cuartel.id).order('codigo_funcionario')

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
        ${!personal?.length ? '<div style="color:var(--muted);font-size:.8rem">Sin personal cargado</div>' : ''}
      </div>
      <div id="form-personal" style="display:none;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
        <div class="campo-inline">
          <input id="nuevo-codigo" type="text" placeholder="Código funcionario (ej: 42891)" maxlength="15" style="width:200px"/>
          <button class="btn btn-primario btn-sm" onclick="guardarPersonal()">Agregar</button>
          <button class="btn btn-secundario btn-sm" onclick="el('form-personal').style.display='none'">Cancelar</button>
        </div>
      </div>
    </div>`
}

function modalNuevoFuncionario() {
  const f = el('form-personal')
  if (f) f.style.display = 'block'
  el('nuevo-codigo')?.focus()
}

async function guardarPersonal() {
  const codigo = el('nuevo-codigo')?.value?.trim()
  if (!codigo) { toast('Ingrese un código','err'); return }
  const { error } = await APP.sb.from('personal_cuartel').upsert({
    cuartel_id: APP.cuartel.id, codigo_funcionario: codigo, activo: true
  }, { onConflict: 'codigo_funcionario,cuartel_id' })
  if (error) { toast('Error: '+error.message,'err'); return }
  toast('Funcionario agregado','ok')
  await adminPersonal()
}

async function eliminarPersonal(id) {
  if (!confirm('¿Eliminar este código de funcionario?')) return
  await APP.sb.from('personal_cuartel').delete().eq('id', id)
  await adminPersonal()
}

async function toggleActivoPersonal(id, activo) {
  await APP.sb.from('personal_cuartel').update({ activo }).eq('id', id)
}

// ── USUARIOS ─────────────────────────────────────────────────
async function adminUsuarios() {
  const { data: usuarios } = await APP.sb.from('usuarios')
    .select('*,cuartel:cuarteles(nombre)').order('rol')

  el('admin-contenido').innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div class="sec-titulo" style="margin:0">Usuarios del sistema (${usuarios?.length||0})</div>
      </div>
      <div style="font-size:.75rem;color:var(--muted);margin-bottom:.75rem">
        Para crear nuevos usuarios, use el panel de Supabase Auth y luego inserte el perfil aquí.
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:.78rem">
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
              <td style="padding:.35rem .6rem">${u.email}</td>
              <td style="padding:.35rem .6rem">
                <span class="badge badge-${u.rol}">${u.rol.toUpperCase()}</span>
              </td>
              <td style="padding:.35rem .6rem;font-size:.72rem">${u.cuartel?.nombre||'—'}</td>
              <td style="padding:.35rem .6rem;text-align:center">
                <input type="checkbox" ${u.activo?'checked':''} onchange="toggleActivoUsuario('${u.id}',this.checked)"/>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
        <div class="sec-titulo" style="font-size:.78rem">Instrucciones para crear usuario nuevo:</div>
        <ol style="font-size:.73rem;color:var(--muted);padding-left:1.25rem;line-height:2">
          <li>Ir a <strong>Supabase Dashboard → Authentication → Users → Invite user</strong></li>
          <li>Ingresar el email del nuevo usuario</li>
          <li>Ejecutar en SQL Editor:<br>
            <code style="background:#f0f0f2;padding:2px 6px;border-radius:4px;font-size:.7rem">
              INSERT INTO usuarios (id, email, cuartel_id, rol) VALUES ('UUID_DEL_USUARIO', 'email@ejemplo.com', 'UUID_CUARTEL', 'digitador');
            </code>
          </li>
        </ol>
      </div>
    </div>`
}

async function toggleActivoUsuario(id, activo) {
  await APP.sb.from('usuarios').update({ activo }).eq('id', id)
  toast(activo ? 'Usuario activado' : 'Usuario desactivado', 'ok')
}

// ── DENOMINADORES IDFI ────────────────────────────────────────
async function adminDenominadores() {
  const { data: puntos } = await APP.sb.from('puntos_territoriales')
    .select('*').eq('cuartel_id', APP.cuartel.id).eq('activo', true).order('tipo').order('nombre')

  const hitos = (puntos||[]).filter(p=>p.tipo==='hito').length
  const pnhs  = (puntos||[]).filter(p=>p.tipo==='pnh').length
  const sies  = (puntos||[]).filter(p=>p.tipo==='sie').length

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
        <input id="meta-uf" type="number" min="0" step="0.1" placeholder="Ej: 50"
               style="width:120px" value="50"/>
        <span style="font-size:.78rem;color:var(--muted)">UF por mes</span>
        <button class="btn btn-primario btn-sm" onclick="toast('Meta guardada','ok')">Guardar</button>
      </div>

      <div class="sec-titulo" style="font-size:.82rem">Objetivos internacionales del período (DFO-06)</div>
      <div style="font-size:.75rem;color:var(--muted);margin-bottom:.5rem">
        Número de objetivos requeridos por inteligencia para este cuartel en el mes.
      </div>
      <div class="campo-inline">
        <input id="meta-obj" type="number" min="0" placeholder="0" style="width:80px" value="0"/>
        <span style="font-size:.78rem;color:var(--muted)">objetivos requeridos</span>
        <button class="btn btn-primario btn-sm" onclick="toast('Denominador guardado','ok')">Guardar</button>
      </div>
    </div>`
}

// ── REPORTES INTELIGENCIA ─────────────────────────────────────
async function adminReportesIntel() {
  const { data: reportes } = await APP.sb.from('reportes_inteligencia')
    .select('*,observacion:observaciones_intel(descripcion,tipo_hallazgo,nivel_relevancia)')
    .eq('cuartel_id', APP.cuartel.id)
    .order('fecha_generado', { ascending: false })
    .limit(30)

  el('admin-contenido').innerHTML = `
    <div class="card" style="padding:0;overflow:hidden">
      <div style="background:#f5f5f7;padding:.5rem .85rem;font-size:.74rem;font-weight:700">
        Reportes de inteligencia (DFP-05)
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:.76rem">
        <thead>
          <tr style="background:#f0f0f2">
            <th style="padding:.35rem .6rem;text-align:left">Fecha generado</th>
            <th style="padding:.35rem .6rem;text-align:left">Hallazgo</th>
            <th style="padding:.35rem .6rem;text-align:left">Relevancia</th>
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
                ${r.estado === 'pendiente' ? `
                  <button class="btn btn-sm btn-primario" onclick="marcarReporteEntregado('${r.id}')">✓ Entregado</button>
                ` : formatFechaCorta(r.fecha_entregado)}
              </td>
            </tr>`).join('')}
          ${!reportes?.length ? '<tr><td colspan="5" style="padding:1.5rem;text-align:center;color:var(--muted)">Sin reportes generados</td></tr>' : ''}
        </tbody>
      </table>
    </div>`
}

async function marcarReporteEntregado(id) {
  await APP.sb.from('reportes_inteligencia').update({
    estado: 'entregado', fecha_entregado: hoyISO()
  }).eq('id', id)
  toast('Reporte marcado como entregado', 'ok')
  await adminReportesIntel()
}
