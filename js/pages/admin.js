// ============================================================
// SISTEMA CSF OPERATIVA — admin.js  v2.0
// CAMBIOS v2.0:
//   M1 — Reasignacion de punto entre cuarteles
//        Boton "Cambiar cuartel" en tabla de puntos.
//        Muestra advertencia si el punto esta en CSF publicada.
//        Solo disponible para Administrador.
// ============================================================

let _adminTab = 'puntos'

async function renderAdmin() {
  if (!APP.esAdministrador() && !APP.esComisario()) {
    el('pantalla-admin').innerHTML = '<div class="container"><div class="card" style="text-align:center;padding:2rem;color:var(--muted)">Acceso restringido</div></div>'
    return
  }
  if (!APP.cuartelActivo()?.id) {
    el('pantalla-admin').innerHTML = '<div class="container"><div class="card" style="text-align:center;padding:2rem;color:var(--muted)">Selecciona un cuartel desde el selector superior para acceder a la administracion.</div></div>'
    return
  }
  el('pantalla-admin').innerHTML = `
    <div class="container">
      <h2 class="page-titulo">Administracion</h2>
      <div class="tabs-bar">
        ${adminTabBtn('puntos',         'Puntos territoriales')}
        ${adminTabBtn('personal',       'Personal')}
        ${adminTabBtn('usuarios',       'Usuarios sistema')}
        ${adminTabBtn('validadores',    'Validadores')}
        ${adminTabBtn('denominadores',  'Denominadores IDFI')}
        ${adminTabBtn('reportes_intel', 'Reportes inteligencia')}
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

// PUNTOS TERRITORIALES
async function adminPuntos() {
  const { data: puntos } = await APP.sb.from('puntos_territoriales')
    .select('*').eq('cuartel_id', APP.cuartelActivo()?.id).order('tipo').order('nombre')

  const esAdmin = APP.esAdministrador()

  el('admin-contenido').innerHTML = `
    <div class="card" style="margin-bottom:.75rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div class="sec-titulo" style="margin:0">Puntos Territoriales (${puntos?.length||0})</div>
        <button class="btn btn-primario btn-sm" onclick="modalNuevoPunto()">+ Nuevo punto</button>
      </div>
      <div style="font-size:.75rem;color:var(--muted);margin-bottom:.75rem">
        Agregue coordenadas GPS para activar el calculo automatico de radio 5km
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
            ${esAdmin ? '<th style="padding:.35rem .6rem;text-align:center;width:85px">Cuartel</th>' : ''}
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
                  ? `<span style="color:var(--verde);font-size:.8rem">GPS OK</span>`
                  : `<span style="color:var(--amarillo);font-size:.8rem">Sin GPS</span>`}
              </td>
              <td style="padding:.3rem .6rem;text-align:center">
                <input type="checkbox" ${p.activo?'checked':''} onchange="toggleActivoPunto('${p.id}',this.checked)"/>
              </td>
              <td style="padding:.3rem .6rem;text-align:center">
                <button class="btn btn-sm btn-secundario" onclick="editarPunto('${p.id}')">Editar</button>
              </td>
              ${esAdmin ? '<td style="padding:.3rem .6rem;text-align:center"><button class="btn btn-sm" style="background:#fff3e0;border:1px solid #ff9800;color:#e65100;font-size:.68rem;padding:.2rem .45rem;border-radius:4px" onclick="modalReasignarPunto(\'' + p.id + '\',\'' + p.nombre.replace(/'/g,'').replace(/"/g,'') + '\')">Cambiar cuartel</button></td>' : ''}
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

// M1: MODAL REASIGNAR PUNTO
async function modalReasignarPunto(puntoId, nombrePunto) {
  el('modal-reasignar').style.display = 'flex'
  el('form-reasignar-contenido').innerHTML = '<div class="cargando">Cargando...</div>'

  const { data: cuarteles } = await APP.sb.from('cuarteles')
    .select('id,nombre').eq('activo', true).order('nombre')

  const { data: enCSF } = await APP.sb.from('csf_puntos_fvc')
    .select('csf_id, csf:csf_mensual(numero,estado,cuartel:cuarteles(nombre))')
    .eq('punto_id', puntoId)

  const csfPublicadas = (enCSF||[]).filter(r =>
    r.csf && (r.csf.estado === 'publicada' || r.csf.estado === 'aprobada')
  )

  const colorAdv  = csfPublicadas.length > 0 ? '#fdecea' : '#e8f5ea'
  const borderAdv = csfPublicadas.length > 0 ? 'var(--rojo)' : 'var(--verde)'
  let textoAdv = csfPublicadas.length > 0
    ? `ATENCION: Este punto esta en ${csfPublicadas.length} CSF publicada(s). Al reasignar quedaran desactualizadas y debera regenerarlas.`
    : 'Reasignacion segura: el punto no esta en ninguna CSF publicada.'

  el('form-reasignar-contenido').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:1rem">
      <div class="modal-titulo">Reasignar punto a otro cuartel</div>
      <button onclick="el('modal-reasignar').style.display='none'" class="btn-cerrar">X</button>
    </div>
    <div style="font-size:.85rem;font-weight:600;margin-bottom:.75rem;padding:.5rem .75rem;background:var(--bg-alt);border-radius:6px">
      Punto: ${nombrePunto}
    </div>
    <div style="background:${colorAdv};border:1.5px solid ${borderAdv};border-radius:8px;padding:.7rem;margin-bottom:1rem;font-size:.78rem">
      ${textoAdv}
    </div>
    <div class="campo" style="margin-bottom:1rem">
      <label>Cuartel destino</label>
      <select id="reasignar-cuartel-select" style="width:100%">
        <option value="">Seleccione cuartel destino</option>
        ${(cuarteles||[])
          .filter(c => c.id !== APP.cuartelActivo()?.id)
          .map(c => `<option value="${c.id}">${c.nombre.replace(' (F)','')}</option>`)
          .join('')}
      </select>
    </div>
    <div class="campo" style="margin-bottom:1.25rem">
      <label>Motivo de la reasignacion *</label>
      <textarea id="reasignar-motivo" rows="3"
        placeholder="Ej: Error en asignacion inicial. El hito corresponde geograficamente al sector de Caquena."
        style="width:100%;font-size:.8rem;padding:.5rem;border:1px solid var(--border);border-radius:6px;resize:vertical"></textarea>
    </div>
    <div style="display:flex;gap:.5rem">
      <button class="btn btn-primario" onclick="ejecutarReasignacion('${puntoId}')">Confirmar reasignacion</button>
      <button class="btn btn-ghost" onclick="el('modal-reasignar').style.display='none'">Cancelar</button>
    </div>`
}

async function ejecutarReasignacion(puntoId) {
  const cuartelDestino = el('reasignar-cuartel-select')?.value
  const motivo         = el('reasignar-motivo')?.value?.trim()
  if (!cuartelDestino) { toast('Selecciona un cuartel destino', 'err'); return }
  if (!motivo)         { toast('Ingresa el motivo de la reasignacion', 'err'); return }

  const { error } = await APP.sb.from('puntos_territoriales')
    .update({ cuartel_id: cuartelDestino })
    .eq('id', puntoId)

  if (error) { toast('Error: ' + error.message, 'err'); return }
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
      <button onclick="el('modal-punto').style.display='none'" class="btn-cerrar">X</button>
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
        <input id="punto-nombre-completo" type="text" value="${p?.nombre_completo||''}" placeholder="Descripcion geografica"/>
      </div>
      <div class="campo">
        <label>Pais limitrofe</label>
        <select id="punto-pais">
          <option value="PERU"    ${p?.pais_limitrofe==='PERU'   ?'selected':''}>Peru</option>
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
        <label>FVC base (minimo)</label>
        <select id="punto-fvc">
          ${CSF_CONFIG.FVC_ORDEN.map(f => `<option value="${f}" ${p?.fvc_base===f?'selected':''}>${CSF_CONFIG.FVC_LABELS[f]}</option>`).join('')}
        </select>
      </div>
      <div class="campo">
        <label>Valor estrategico</label>
        <select id="punto-valor">
          <option value="bajo"    ${p?.valor_estrategico==='bajo'   ?'selected':''}>Bajo</option>
          <option value="medio"   ${p?.valor_estrategico==='medio'  ?'selected':''}>Medio</option>
          <option value="alto"    ${p?.valor_estrategico==='alto'   ?'selected':''}>Alto</option>
          <option value="critico" ${p?.valor_estrategico==='critico'?'selected':''}>Critico</option>
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

// PERSONAL
async function adminPersonal() {
  const { data: personal } = await APP.sb.from('personal_cuartel')
    .select('*').eq('cuartel_id', APP.cuartelActivo()?.id).order('codigo_funcionario')

  el('admin-contenido').innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div class="sec-titulo" style="margin:0">Personal del cuartel (${personal?.length||0} funcionarios)</div>
        <button class="btn btn-primario btn-sm" onclick="modalNuevoFuncionario()">+ Agregar codigo</button>
      </div>
      <div style="font-size:.75rem;color:var(--muted);margin-bottom:.75rem">
        Solo se almacenan codigos de funcionario, sin datos personales.
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:.5rem">
        ${(personal||[]).map(p => `
          <div style="display:flex;align-items:center;gap:.4rem;background:var(--bg-alt);padding:.4rem .75rem;border-radius:6px;font-size:.78rem">
            <span style="font-family:monospace;font-weight:700">${p.codigo_funcionario}</span>
            <input type="checkbox" ${p.activo?'checked':''} onchange="toggleActivoPersonal('${p.id}',this.checked)" title="Activo"/>
            <button onclick="eliminarPersonal('${p.id}')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:.9rem;padding:0">X</button>
          </div>`).join('')}
        ${!personal?.length ? '<div style="color:var(--muted);font-size:.8rem">Sin personal cargado</div>' : ''}
      </div>
      <div id="form-personal" style="display:none;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
        <div class="campo-inline">
          <input id="nuevo-codigo" type="text" placeholder="Codigo funcionario (ej: 42891)" maxlength="15" style="width:200px"/>
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
  if (!codigo) { toast('Ingrese un codigo','err'); return }
  const { error } = await APP.sb.from('personal_cuartel').upsert(
    { cuartel_id: APP.cuartelActivo()?.id, codigo_funcionario: codigo, activo: true },
    { onConflict: 'codigo_funcionario,cuartel_id' }
  )
  if (error) { toast('Error: '+error.message,'err'); return }
  toast('Funcionario agregado','ok')
  await adminPersonal()
}

async function eliminarPersonal(id) {
  if (!confirm('Eliminar este codigo de funcionario?')) return
  await APP.sb.from('personal_cuartel').delete().eq('id', id)
  await adminPersonal()
}

async function toggleActivoPersonal(id, activo) {
  await APP.sb.from('personal_cuartel').update({ activo }).eq('id', id)
}

// USUARIOS
async function adminUsuarios() {
  const { data: usuarios } = await APP.sb.from('usuarios')
    .select('*,cuartel:cuarteles(nombre)')
    .eq('cuartel_id', APP.cuartelActivo()?.id)
    .order('rol')

  el('admin-contenido').innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div class="sec-titulo" style="margin:0">Usuarios del cuartel (${usuarios?.length||0})</div>
      </div>
      <div style="font-size:.75rem;color:var(--muted);background:var(--azul-cl);border:1px solid var(--azul);border-radius:6px;padding:.65rem .85rem;margin-bottom:1rem">
        Por seguridad, cada usuario solo puede ver su propio perfil.
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
                <span class="badge badge-${u.rol}">
                  ${u.rol === 'validador' ? 'VALIDADOR' : u.rol.toUpperCase()}
                </span>
              </td>
              <td style="padding:.35rem .6rem;font-size:.72rem">${u.cuartel?.nombre||'Sin cuartel'}</td>
              <td style="padding:.35rem .6rem;text-align:center">
                <input type="checkbox" ${u.activo?'checked':''} onchange="toggleActivoUsuario('${u.id}',this.checked)"/>
              </td>
            </tr>`).join('')}
          ${!usuarios?.length ? '<tr><td colspan="4" style="padding:1rem;text-align:center;color:var(--muted)">Solo visible con permisos ampliados</td></tr>' : ''}
        </tbody>
      </table>
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
        <div class="sec-titulo" style="font-size:.78rem">Crear nuevo usuario:</div>
        <ol style="font-size:.73rem;color:var(--muted);padding-left:1.25rem;line-height:2">
          <li>Supabase Dashboard - Authentication - Users - Invite user</li>
          <li>Ingresar el email del nuevo usuario</li>
          <li>SQL Editor: INSERT INTO usuarios (id, email, cuartel_id, rol) VALUES ('UUID', 'email', 'UUID_CUARTEL', 'digitador');</li>
        </ol>
      </div>
    </div>`
}

async function toggleActivoUsuario(id, activo) {
  await APP.sb.from('usuarios').update({ activo }).eq('id', id)
  toast(activo ? 'Usuario activado' : 'Usuario desactivado', 'ok')
}

// VALIDADORES
async function adminValidadores() {
  const { data: validadores } = await APP.sb.from('usuarios')
    .select('*,cuartel:cuarteles(nombre)').eq('rol','validador').order('email')

  el('admin-contenido').innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div class="sec-titulo" style="margin:0">Validadores - Subprefecto Fronterizo</div>
      </div>
      <div style="font-size:.78rem;color:#1565C0;background:#EBF3FB;border:1px solid #90CAF9;border-radius:6px;padding:.65rem .85rem;margin-bottom:1rem;line-height:1.6">
        Los usuarios con rol validador tienen acceso exclusivo a la pantalla de CSF en revision.
        Pueden ver todas las cartas pendientes, editar horarios de visita y aprobar masivamente con su firma digital.
        No tienen acceso a servicios, dashboard ni administracion.
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:.78rem;margin-bottom:1.25rem">
        <thead>
          <tr style="background:#f0f0f2">
            <th style="padding:.35rem .6rem;text-align:left">Email</th>
            <th style="padding:.35rem .6rem;text-align:left">Prefectura / Zona</th>
            <th style="padding:.35rem .6rem;text-align:center">Activo</th>
            <th style="padding:.35rem .6rem;text-align:center">Accion</th>
          </tr>
        </thead>
        <tbody>
          ${(validadores||[]).map((u,i) => `
          <tr style="${i%2===0?'background:#fafafa':''};border-bottom:1px solid var(--border)">
            <td style="padding:.35rem .6rem">${u.email}</td>
            <td style="padding:.35rem .6rem;font-size:.72rem">${u.cuartel?.nombre || 'Sin cuartel (acceso global)'}</td>
            <td style="padding:.35rem .6rem;text-align:center">
              <input type="checkbox" ${u.activo?'checked':''} onchange="toggleActivoUsuario('${u.id}',this.checked)"/>
            </td>
            <td style="padding:.35rem .6rem;text-align:center">
              <button class="btn btn-sm" style="background:#fdecea;color:#C0392B;border:1px solid #f5c6c6"
                      onclick="revocarValidador('${u.id}','${u.email}')">
                Revocar
              </button>
            </td>
          </tr>`).join('')}
          ${!validadores?.length ? '<tr><td colspan="4" style="padding:1.5rem;text-align:center;color:var(--muted)">Sin validadores registrados</td></tr>' : ''}
        </tbody>
      </table>
      <div style="border-top:1px solid var(--border);padding-top:1rem">
        <div class="sec-titulo" style="font-size:.82rem;margin-bottom:.75rem">Registrar nuevo validador</div>
        <div style="font-size:.75rem;color:var(--muted);margin-bottom:.75rem;line-height:1.6">
          El usuario debe existir previamente en Supabase - Authentication - Users.
          Ingresa su UUID y email para asignarle el rol de validador.
        </div>
        <div class="g2" style="margin-bottom:.75rem">
          <div class="campo">
            <label>UUID del usuario (de Supabase Auth)</label>
            <input id="val-uuid" type="text" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                   style="font-family:monospace;font-size:.75rem"/>
          </div>
          <div class="campo">
            <label>Email</label>
            <input id="val-email" type="email" placeholder="subprefecto@carabineros.cl"/>
          </div>
        </div>
        <div id="val-resultado" style="font-size:.8rem;margin-bottom:.65rem"></div>
        <button class="btn btn-primario" onclick="crearValidador()">+ Registrar validador</button>
      </div>
      <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border)">
        <div style="font-size:.73rem;color:var(--muted)">Alternativa SQL directa en Supabase:</div>
        <code style="display:block;background:#f0f0f2;padding:6px 10px;border-radius:4px;margin-top:4px;font-size:.7rem;line-height:1.7">
          INSERT INTO usuarios (id, email, cuartel_id, rol, activo) VALUES ('UUID', 'email@carabineros.cl', NULL, 'validador', true);
        </code>
      </div>
    </div>`
}

async function crearValidador() {
  const uuid  = el('val-uuid')?.value?.trim()
  const email = el('val-email')?.value?.trim()
  const res   = el('val-resultado')
  if (!uuid || !email) {
    if (res) res.innerHTML = '<span style="color:var(--rojo)">UUID y email son obligatorios.</span>'
    return
  }
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) {
    if (res) res.innerHTML = '<span style="color:var(--rojo)">UUID no tiene el formato correcto.</span>'
    return
  }
  const { error } = await APP.sb.from('usuarios').upsert({
    id: uuid, email: email, cuartel_id: null, rol: 'validador', activo: true,
  }, { onConflict: 'id' })
  if (error) {
    if (res) res.innerHTML = `<span style="color:var(--rojo)">Error: ${error.message}</span>`
    return
  }
  toast('Validador registrado correctamente', 'ok')
  await adminValidadores()
}

async function revocarValidador(id, email) {
  if (!confirm('Revocar acceso de validador a ' + email + '? El usuario quedara inactivo.')) return
  await APP.sb.from('usuarios').update({ activo: false, rol: 'digitador' }).eq('id', id)
  toast('Acceso revocado', 'ok')
  await adminValidadores()
}

// DENOMINADORES IDFI
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
      <div class="sec-titulo">Denominadores para calculo IDFI</div>
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:1rem">
        Estos valores se usan como denominador en el calculo de los indicadores DFP y DFO.
        Los cambios se guardan en la base de datos.
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
      <div class="sec-titulo" style="font-size:.82rem">Objetivos internacionales del periodo (DFO-06)</div>
      <div style="font-size:.75rem;color:var(--muted);margin-bottom:.5rem">
        Numero de objetivos requeridos por inteligencia para este cuartel en el mes.
      </div>
      <div class="campo-inline" style="margin-bottom:1.5rem">
        <input id="meta-obj" type="number" min="0"
               value="${cfg?.objetivos_internacionales || 0}"
               placeholder="0" style="width:80px"/>
        <span style="font-size:.78rem;color:var(--muted)">objetivos requeridos</span>
        <button class="btn btn-primario btn-sm" onclick="guardarConfigIDFI()">Guardar</button>
      </div>
      <div class="sec-titulo" style="font-size:.82rem">Total funcionarios del cuartel</div>
      <div class="campo-inline">
        <input id="meta-func" type="number" min="1"
               value="${cfg?.total_funcionarios || 0}"
               placeholder="0" style="width:80px"/>
        <span style="font-size:.78rem;color:var(--muted)">funcionarios</span>
        <button class="btn btn-primario btn-sm" onclick="guardarConfigIDFI()">Guardar</button>
      </div>
      ${cfg?.updated_at ? `<div style="font-size:.7rem;color:var(--muted);margin-top:1rem">Ultima actualizacion: ${formatFechaCorta(cfg.updated_at.split('T')[0])}</div>` : ''}
    </div>`
}

async function guardarConfigIDFI() {
  const meta_uf         = parseFloat(el('meta-uf')?.value)  || 50
  const objetivos_inter = parseInt(el('meta-obj')?.value)   || 0
  const total_func      = parseInt(el('meta-func')?.value)  || 0
  const { error } = await APP.sb.from('config_cuartel').upsert({
    cuartel_id:                APP.cuartelActivo()?.id,
    meta_uf_mensual:           meta_uf,
    objetivos_internacionales: objetivos_inter,
    total_funcionarios:        total_func,
    updated_at:                new Date().toISOString(),
  }, { onConflict: 'cuartel_id' })
  if (error) { toast('Error al guardar: ' + error.message, 'err'); return }
  toast('Denominadores guardados correctamente', 'ok')
  await adminDenominadores()
}

// REPORTES INTELIGENCIA
async function adminReportesIntel() {
  const { data: reportes } = await APP.sb.from('reportes_inteligencia')
    .select('*,observacion:observaciones_intel(descripcion,tipo_hallazgo,nivel_relevancia)')
    .eq('cuartel_id', APP.cuartelActivo()?.id)
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
            <th style="padding:.35rem .6rem;text-align:center">Accion</th>
          </tr>
        </thead>
        <tbody>
          ${(reportes||[]).map((r,i) => `
            <tr style="${i%2===0?'background:#fafafa':''};border-bottom:1px solid var(--border)">
              <td style="padding:.35rem .6rem">${formatFechaCorta(r.fecha_generado)}</td>
              <td style="padding:.35rem .6rem">${r.observacion?.tipo_hallazgo?.replace(/_/g,' ')||'Sin dato'}</td>
              <td style="padding:.35rem .6rem">
                <span style="font-weight:700;color:${r.observacion?.nivel_relevancia==='alto'?'var(--rojo)':r.observacion?.nivel_relevancia==='medio'?'var(--amarillo)':'var(--verde)'}">
                  ${(r.observacion?.nivel_relevancia||'sin dato').toUpperCase()}
                </span>
              </td>
              <td style="padding:.35rem .6rem;text-align:center">
                <span class="badge badge-${r.estado==='entregado'?'completado':'pendiente'}">${r.estado.toUpperCase()}</span>
              </td>
              <td style="padding:.35rem .6rem;text-align:center">
                ${r.estado === 'pendiente'
                  ? `<button class="btn btn-sm btn-primario" onclick="marcarReporteEntregado('${r.id}')">Entregado</button>`
                  : formatFechaCorta(r.fecha_entregado)}
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
