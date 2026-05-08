// ============================================================
// SISTEMA CSF OPERATIVA — admin.js  v2.0
// Sin cambios adicionales del informe de auditoria v1.4.1
// Correccion M1 (reasignacion de puntos) ya aplicada en v2.0.
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
        ${adminTabBtn('puntos','Puntos territoriales')}
        ${adminTabBtn('personal','Personal')}
        ${adminTabBtn('usuarios','Usuarios sistema')}
        ${adminTabBtn('validadores','Validadores')}
        ${adminTabBtn('denominadores','Denominadores IDFI')}
        ${adminTabBtn('reportes_intel','Reportes inteligencia')}
        ${adminTabBtn('firmas','Firmas')}
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
    case 'firmas':         await adminFirmas();        break
  }
}

async function adminPuntos() {
  const {data:puntos}=await APP.sb.from('puntos_territoriales').select('*').eq('cuartel_id',APP.cuartelActivo()?.id).order('tipo').order('nombre')
  const esAdmin=APP.esAdministrador()
  el('admin-contenido').innerHTML=`
    <div class="card" style="margin-bottom:.75rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div class="sec-titulo" style="margin:0">Puntos Territoriales (${puntos?.length||0})</div>
        <button class="btn btn-primario btn-sm" onclick="modalNuevoPunto()">+ Nuevo punto</button>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:.76rem">
        <thead><tr style="background:#f0f0f2">
          <th style="padding:.35rem .6rem;text-align:left">Nombre</th>
          <th style="padding:.35rem .6rem;text-align:left;width:55px">Tipo</th>
          <th style="padding:.35rem .6rem;text-align:left;width:90px">FVC base</th>
          <th style="padding:.35rem .6rem;text-align:center;width:80px">Coords</th>
          <th style="padding:.35rem .6rem;text-align:center;width:60px">Activo</th>
          <th style="padding:.35rem .6rem;text-align:center;width:60px">Editar</th>
          ${esAdmin?'<th style="padding:.35rem .6rem;text-align:center;width:85px">Cuartel</th>':''}
        </tr></thead>
        <tbody>
          ${(puntos||[]).map((p,i)=>`
            <tr style="${i%2===0?'background:#fafafa':''}">
              <td style="padding:.32rem .6rem;font-weight:600">${p.nombre}<br><span style="font-size:.68rem;color:var(--muted);font-weight:400">${p.nombre_completo||''}</span></td>
              <td style="padding:.32rem .6rem"><span class="badge badge-tipo-${p.tipo}">${p.tipo.toUpperCase()}</span></td>
              <td style="padding:.32rem .6rem;font-size:.72rem">${CSF_CONFIG.FVC_LABELS[p.fvc_base]||p.fvc_base}</td>
              <td style="padding:.32rem .6rem;text-align:center">${p.latitud?'<span style="color:var(--verde)">✓ GPS</span>':'<span style="color:var(--muted);font-size:.7rem">Sin GPS</span>'}</td>
              <td style="padding:.32rem .6rem;text-align:center"><input type="checkbox" ${p.activo?'checked':''} onchange="toggleActivoPunto('${p.id}',this.checked)"/></td>
              <td style="padding:.32rem .6rem;text-align:center"><button class="btn btn-sm btn-secundario" onclick="editarPunto('${p.id}')">✎</button></td>
              ${esAdmin?`<td style="padding:.32rem .6rem;text-align:center"><button class="btn btn-sm" style="background:#FEF3E2;color:#7B3F00;border:1px solid #F5CBA7;font-size:.72rem" onclick="abrirModalReasignar('${p.id}','${p.nombre}')">Cambiar</button></td>`:''}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div id="modal-punto" class="modal" style="display:none"><div class="modal-box"><div id="form-punto-contenido"></div></div></div>
    <div id="modal-reasignar" class="modal" style="display:none"><div class="modal-box"><div id="form-reasignar-contenido"></div></div></div>`
}

async function toggleActivoPunto(id, activo) {
  await APP.sb.from('puntos_territoriales').update({activo}).eq('id',id)
  toast(activo?'Punto activado':'Punto desactivado','ok')
}

async function abrirModalReasignar(puntoId, nombrePunto) {
  const {data:csfsConPunto}=await APP.sb.from('csf_puntos_fvc').select('csf:csf_mensual(estado,numero)').eq('punto_id',puntoId)
  const csfsPublicadas=(csfsConPunto||[]).filter(r=>r.csf?.estado==='publicada')
  el('form-reasignar-contenido').innerHTML=`
    <div style="display:flex;justify-content:space-between;margin-bottom:1rem">
      <div class="modal-titulo">Reasignar punto: ${nombrePunto}</div>
      <button onclick="el('modal-reasignar').style.display='none'" class="btn-cerrar">✕</button>
    </div>
    ${csfsPublicadas.length?`<div style="background:var(--amarillo-cl);border:1.5px solid var(--amarillo);border-radius:8px;padding:.65rem .85rem;margin-bottom:.75rem;font-size:.8rem;font-weight:600;color:var(--amarillo)">⚠ Este punto aparece en ${csfsPublicadas.length} CSF publicada(s): ${csfsPublicadas.map(r=>r.csf.numero).join(', ')}. La reasignacion no modifica esas CSF.</div>`:''}
    <div class="campo" style="margin-bottom:.75rem">
      <label>Cuartel destino</label>
      <select id="reasignar-cuartel-select">
        <option value="">— Seleccionar —</option>
        ${(APP.todosCuarteles||[]).filter(c=>c.id!==APP.cuartelActivo()?.id).map(c=>`<option value="${c.id}">${c.nombre.replace(' (F)','')}</option>`).join('')}
      </select>
    </div>
    <div class="campo" style="margin-bottom:.75rem">
      <label>Motivo de reasignacion</label>
      <textarea id="reasignar-motivo" rows="2" placeholder="Ej: El hito corresponde geograficamente al sector de Caquena." style="width:100%;font-size:.8rem;padding:.5rem;border:1px solid var(--border);border-radius:6px;resize:vertical"></textarea>
    </div>
    <div style="display:flex;gap:.5rem">
      <button class="btn btn-primario" onclick="ejecutarReasignacion('${puntoId}')">Confirmar reasignacion</button>
      <button class="btn btn-ghost" onclick="el('modal-reasignar').style.display='none'">Cancelar</button>
    </div>`
  el('modal-reasignar').style.display='flex'
}

async function ejecutarReasignacion(puntoId) {
  const cuartelDestino=el('reasignar-cuartel-select')?.value,motivo=el('reasignar-motivo')?.value?.trim()
  if(!cuartelDestino){toast('Selecciona un cuartel destino','err');return}
  if(!motivo){toast('Ingresa el motivo','err');return}
  const {error}=await APP.sb.from('puntos_territoriales').update({cuartel_id:cuartelDestino}).eq('id',puntoId)
  if(error){toast('Error: '+error.message,'err');return}
  toast('Punto reasignado correctamente','ok')
  el('modal-reasignar').style.display='none'
  await adminPuntos()
}

function modalNuevoPunto(){el('form-punto-contenido').innerHTML=htmlFormPunto(null);el('modal-punto').style.display='flex'}

async function editarPunto(id){
  const {data:p}=await APP.sb.from('puntos_territoriales').select('*').eq('id',id).single()
  el('form-punto-contenido').innerHTML=htmlFormPunto(p)
  el('modal-punto').style.display='flex'
}

function htmlFormPunto(p){return`
  <div style="display:flex;justify-content:space-between;margin-bottom:1rem">
    <div class="modal-titulo">${p?'Editar punto':'Nuevo punto'}</div>
    <button onclick="el('modal-punto').style.display='none'" class="btn-cerrar">X</button>
  </div>
  <input type="hidden" id="punto-id" value="${p?.id||''}"/>
  <div class="g2">
    <div class="campo"><label>Nombre corto</label><input id="punto-nombre" type="text" value="${p?.nombre||''}" placeholder="Hito 1"/></div>
    <div class="campo"><label>Tipo</label>
      <select id="punto-tipo">
        <option value="hito" ${p?.tipo==='hito'?'selected':''}>Hito</option>
        <option value="pnh"  ${p?.tipo==='pnh' ?'selected':''}>PNH</option>
        <option value="sie"  ${p?.tipo==='sie' ?'selected':''}>SIE</option>
      </select>
    </div>
    <div class="campo"><label>Nombre completo</label><input id="punto-nombre-completo" type="text" value="${p?.nombre_completo||''}" placeholder="Descripcion geografica"/></div>
    <div class="campo"><label>Pais limitrofe</label>
      <select id="punto-pais">
        <option value="PERU"    ${p?.pais_limitrofe==='PERU'   ?'selected':''}>Peru</option>
        <option value="BOLIVIA" ${p?.pais_limitrofe==='BOLIVIA'?'selected':''}>Bolivia</option>
      </select>
    </div>
    <div class="campo"><label>Latitud (decimal)</label><input id="punto-lat" type="number" step="0.0001" value="${p?.latitud||''}" placeholder="-18.3875"/></div>
    <div class="campo"><label>Longitud (decimal)</label><input id="punto-lon" type="number" step="0.0001" value="${p?.longitud||''}" placeholder="-69.7583"/></div>
    <div class="campo"><label>FVC base</label>
      <select id="punto-fvc">${CSF_CONFIG.FVC_ORDEN.map(f=>`<option value="${f}" ${p?.fvc_base===f?'selected':''}>${CSF_CONFIG.FVC_LABELS[f]}</option>`).join('')}</select>
    </div>
    <div class="campo"><label>Valor estrategico</label>
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
  </div>`}

async function guardarPunto(){
  const id=el('punto-id')?.value
  const dat={cuartel_id:APP.cuartelActivo()?.id,nombre:el('punto-nombre')?.value?.trim(),tipo:el('punto-tipo')?.value,nombre_completo:el('punto-nombre-completo')?.value?.trim(),pais_limitrofe:el('punto-pais')?.value,latitud:parseFloat(el('punto-lat')?.value)||null,longitud:parseFloat(el('punto-lon')?.value)||null,fvc_base:el('punto-fvc')?.value,valor_estrategico:el('punto-valor')?.value,activo:true}
  if(!dat.nombre){toast('Ingrese un nombre','err');return}
  const {error}=id?await APP.sb.from('puntos_territoriales').update(dat).eq('id',id):await APP.sb.from('puntos_territoriales').insert(dat)
  if(error){toast('Error: '+error.message,'err');return}
  toast(id?'Punto actualizado':'Punto creado','ok')
  el('modal-punto').style.display='none'
  await adminPuntos()
}

async function adminPersonal(){
  const {data:personal}=await APP.sb.from('personal_cuartel').select('*').eq('cuartel_id',APP.cuartelActivo()?.id).order('codigo_funcionario')
  el('admin-contenido').innerHTML=`
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div class="sec-titulo" style="margin:0">Personal del cuartel (${personal?.length||0})</div>
        <button class="btn btn-primario btn-sm" onclick="modalNuevoFuncionario()">+ Agregar</button>
      </div>
      <div id="lista-personal">
        ${(personal||[]).map(p=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:.3rem .5rem;border-bottom:1px solid var(--border)">
          <span style="font-family:var(--font-mono);font-size:.85rem">${p.codigo_funcionario}</span>
          <div style="display:flex;gap:.5rem;align-items:center">
            <input type="checkbox" ${p.activo?'checked':''} onchange="toggleActivoPersonal('${p.id}',this.checked)" title="Activo"/>
            <button onclick="eliminarPersonal('${p.id}')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:.9rem;padding:0">X</button>
          </div>
        </div>`).join('')}
        ${!personal?.length?'<div style="color:var(--muted);font-size:.8rem">Sin personal cargado</div>':''}
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

function modalNuevoFuncionario(){const f=el('form-personal');if(f)f.style.display='block';el('nuevo-codigo')?.focus()}

async function guardarPersonal(){
  const codigo=el('nuevo-codigo')?.value?.trim()
  if(!codigo){toast('Ingrese un codigo','err');return}
  const {error}=await APP.sb.from('personal_cuartel').upsert({cuartel_id:APP.cuartelActivo()?.id,codigo_funcionario:codigo,activo:true},{onConflict:'codigo_funcionario,cuartel_id'})
  if(error){toast('Error: '+error.message,'err');return}
  toast('Funcionario agregado','ok')
  await adminPersonal()
}

async function eliminarPersonal(id){
  if(!confirm('Eliminar este codigo de funcionario?'))return
  await APP.sb.from('personal_cuartel').delete().eq('id',id)
  await adminPersonal()
}

async function toggleActivoPersonal(id,activo){await APP.sb.from('personal_cuartel').update({activo}).eq('id',id)}

async function adminUsuarios(){
  const {data:usuarios}=await APP.sb.from('usuarios').select('*,cuartel:cuarteles(nombre)').eq('cuartel_id',APP.cuartelActivo()?.id).order('rol')
  el('admin-contenido').innerHTML=`<div class="card">
    <div class="sec-titulo" style="margin:0 0 1rem">Usuarios del cuartel (${usuarios?.length||0})</div>
    <table style="width:100%;border-collapse:collapse;font-size:.78rem">
      <thead><tr style="background:#f0f0f2">
        <th style="padding:.35rem .6rem;text-align:left">Email</th>
        <th style="padding:.35rem .6rem;text-align:left">Rol</th>
        <th style="padding:.35rem .6rem;text-align:left">Cuartel</th>
        <th style="padding:.35rem .6rem;text-align:center">Activo</th>
      </tr></thead>
      <tbody>
        ${(usuarios||[]).map((u,i)=>`<tr style="${i%2===0?'background:#fafafa':''}">
          <td style="padding:.35rem .6rem">${u.email}</td>
          <td style="padding:.35rem .6rem"><span class="badge badge-${u.rol}">${u.rol==='validador'?'VALIDADOR':u.rol.toUpperCase()}</span></td>
          <td style="padding:.35rem .6rem;font-size:.72rem">${u.cuartel?.nombre||'Sin cuartel'}</td>
          <td style="padding:.35rem .6rem;text-align:center"><input type="checkbox" ${u.activo?'checked':''} onchange="toggleActivoUsuario('${u.id}',this.checked)"/></td>
        </tr>`).join('')}
        ${!usuarios?.length?'<tr><td colspan="4" style="padding:1rem;text-align:center;color:var(--muted)">Sin usuarios</td></tr>':''}
      </tbody>
    </table>
    <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
      <div class="sec-titulo" style="font-size:.78rem">Crear nuevo usuario:</div>
      <ol style="font-size:.73rem;color:var(--muted);padding-left:1.25rem;line-height:2">
        <li>Supabase Dashboard → Authentication → Users → Invite user</li>
        <li>Ingresar el email del nuevo usuario</li>
        <li>SQL Editor: INSERT INTO usuarios (id, email, cuartel_id, rol) VALUES ('UUID', 'email', 'UUID_CUARTEL', 'digitador');</li>
      </ol>
    </div>
  </div>`
}

async function toggleActivoUsuario(id,activo){await APP.sb.from('usuarios').update({activo}).eq('id',id);toast(activo?'Usuario activado':'Usuario desactivado','ok')}

async function adminValidadores(){
  const {data:validadores}=await APP.sb.from('usuarios').select('*,cuartel:cuarteles(nombre)').eq('rol','validador').order('email')
  el('admin-contenido').innerHTML=`<div class="card">
    <div class="sec-titulo" style="margin:0 0 1rem">Validadores — Subprefecto Fronterizo</div>
    <div style="font-size:.78rem;color:#1565C0;background:#EBF3FB;border:1px solid #90CAF9;border-radius:6px;padding:.65rem .85rem;margin-bottom:1rem;line-height:1.6">
      Los usuarios con rol validador tienen acceso exclusivo a la pantalla de CSF en revisión.
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:.78rem">
      <thead><tr style="background:#f0f0f2">
        <th style="padding:.35rem .6rem;text-align:left">Email</th>
        <th style="padding:.35rem .6rem;text-align:left">Rol</th>
        <th style="padding:.35rem .6rem;text-align:left">Cuartel</th>
        <th style="padding:.35rem .6rem;text-align:center">Activo</th>
      </tr></thead>
      <tbody>
        ${(validadores||[]).map((u,i)=>`<tr style="${i%2===0?'background:#fafafa':''}">
          <td style="padding:.35rem .6rem">${u.email}</td>
          <td style="padding:.35rem .6rem"><span class="badge badge-validador">VALIDADOR</span></td>
          <td style="padding:.35rem .6rem;font-size:.72rem">${u.cuartel?.nombre||'Sin cuartel'}</td>
          <td style="padding:.35rem .6rem;text-align:center"><input type="checkbox" ${u.activo?'checked':''} onchange="toggleActivoUsuario('${u.id}',this.checked)"/></td>
        </tr>`).join('')}
        ${!validadores?.length?'<tr><td colspan="4" style="padding:1rem;text-align:center;color:var(--muted)">Sin validadores registrados</td></tr>':''}
      </tbody>
    </table>
  </div>`
}

async function adminDenominadores(){
  const cuartelId=APP.cuartelActivo()?.id
  const {data:cfg}=await APP.sb.from('config_cuartel').select('*').eq('cuartel_id',cuartelId).single()
  el('admin-contenido').innerHTML=`<div class="card">
    <div class="sec-titulo" style="margin-bottom:1rem">Denominadores IDFI</div>
    <div class="g2">
      <div class="campo"><label>Meta controles mensual</label><input type="number" id="den-controles" value="${cfg?.meta_controles_mensual||100}" min="1"/></div>
      <div class="campo"><label>Meta UF mensual</label><input type="number" id="den-uf" value="${cfg?.meta_uf_mensual||50}" min="0" step="0.5"/></div>
      <div class="campo"><label>Objetivos internacionales activos</label><input type="number" id="den-obj-int" value="${cfg?.objetivos_internacionales||0}" min="0"/></div>
    </div>
    <button class="btn btn-primario" style="margin-top:1rem" onclick="guardarDenominadores()">Guardar configuracion</button>
  </div>`
}

async function guardarDenominadores(){
  const cuartelId=APP.cuartelActivo()?.id
  const dat={cuartel_id:cuartelId,meta_controles_mensual:parseInt(el('den-controles')?.value)||100,meta_uf_mensual:parseFloat(el('den-uf')?.value)||50,objetivos_internacionales:parseInt(el('den-obj-int')?.value)||0}
  const {error}=await APP.sb.from('config_cuartel').upsert(dat,{onConflict:'cuartel_id'})
  if(error){toast('Error: '+error.message,'err');return}
  toast('Configuracion guardada','ok')
}

async function adminReportesIntel(){
  const {data:reportes}=await APP.sb.from('reportes_inteligencia').select('*,observacion:observaciones_intel(nivel_relevancia)').eq('cuartel_id',APP.cuartelActivo()?.id).order('created_at',{ascending:false}).limit(50)
  el('admin-contenido').innerHTML=`<div class="card" style="padding:0;overflow:hidden">
    <div class="tabla-header" style="padding:.6rem 1rem">Reportes de inteligencia (${reportes?.length||0})</div>
    <table style="width:100%;border-collapse:collapse;font-size:.78rem">
      <thead><tr style="background:#f0f0f2">
        <th style="padding:.35rem .6rem">Fecha</th><th style="padding:.35rem .6rem">Titulo</th>
        <th style="padding:.35rem .6rem;text-align:center">Nivel</th><th style="padding:.35rem .6rem;text-align:center">Estado</th>
        <th style="padding:.35rem .6rem;text-align:center">Accion</th>
      </tr></thead>
      <tbody>
        ${(reportes||[]).map((r,i)=>`<tr style="${i%2===0?'background:#fafafa':''}">
          <td style="padding:.35rem .6rem">${formatFechaCorta(r.created_at?.split('T')[0]||'')}</td>
          <td style="padding:.35rem .6rem">${r.titulo||'—'}</td>
          <td style="padding:.35rem .6rem;text-align:center"><span style="font-size:.72rem;font-weight:700;color:${r.observacion?.nivel_relevancia==='alto'?'var(--rojo)':'var(--amarillo)'}">${(r.observacion?.nivel_relevancia||'sin dato').toUpperCase()}</span></td>
          <td style="padding:.35rem .6rem;text-align:center"><span class="badge badge-${r.estado==='entregado'?'completado':'pendiente'}">${r.estado.toUpperCase()}</span></td>
          <td style="padding:.35rem .6rem;text-align:center">${r.estado==='pendiente'?`<button class="btn btn-sm btn-primario" onclick="marcarReporteEntregado('${r.id}')">Entregado</button>`:formatFechaCorta(r.fecha_entregado)}</td>
        </tr>`).join('')}
        ${!reportes?.length?'<tr><td colspan="5" style="padding:1.5rem;text-align:center;color:var(--muted)">Sin reportes generados</td></tr>':''}
      </tbody>
    </table>
  </div>`
}

async function marcarReporteEntregado(id){
  await APP.sb.from('reportes_inteligencia').update({estado:'entregado',fecha_entregado:hoyISO()}).eq('id',id)
  toast('Reporte marcado como entregado','ok')
  await adminReportesIntel()
}

async function adminFirmas(){
  const cuartelId=APP.cuartelActivo()?.id
  if(!cuartelId){toast('Selecciona un cuartel','err');return}
  const {data:firmas}=await APP.sb.from('config_firmas').select('*').eq('cuartel_id',cuartelId)
  const firmaComisario=(firmas||[]).find(f=>f.rol==='comisario')||{}
  const firmaValidador=(firmas||[]).find(f=>f.rol==='validador')||{}
  el('admin-contenido').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      ${_htmlCardFirma('comisario','Comisario',firmaComisario)}
      ${_htmlCardFirma('validador','Subprefecto Fronterizo (SPF)',firmaValidador)}
    </div>`
}

function _htmlCardFirma(rol, titulo, firma){return`<div class="card">
  <div class="sec-titulo" style="margin-bottom:.75rem">${titulo}</div>
  <div class="g2">
    <div class="campo"><label>Nombre</label><input id="firma-${rol}-nombre" type="text" value="${firma.nombre||''}" placeholder="Nombre completo"/></div>
    <div class="campo"><label>Grado</label><input id="firma-${rol}-grado" type="text" value="${firma.grado||''}" placeholder="Ej: Mayor"/></div>
    <div class="campo"><label>Cargo</label><input id="firma-${rol}-cargo" type="text" value="${firma.cargo||''}" placeholder="COMISARIO"/></div>
    <div class="campo"><label>Imagen firma</label><input id="firma-${rol}-img" type="file" accept="image/*"/></div>
  </div>
  <button class="btn btn-primario btn-sm" style="margin-top:.75rem" onclick="guardarFirma('${rol}')">Guardar</button>
</div>`}

async function guardarFirma(rol){
  const cuartelId=APP.cuartelActivo()?.id
  const nombre=el(`firma-${rol}-nombre`)?.value?.trim(),grado=el(`firma-${rol}-grado`)?.value?.trim(),cargo=el(`firma-${rol}-cargo`)?.value?.trim()
  if(!nombre||!grado||!cargo){toast('Complete nombre, grado y cargo','err');return}
  const imgInput=el(`firma-${rol}-img`)
  let b64=null
  if(imgInput?.files?.[0]){b64=await new Promise(r=>{const rd=new FileReader();rd.onload=e=>r(e.target.result);rd.readAsDataURL(imgInput.files[0])})}
  const dat={cuartel_id:cuartelId,rol,nombre,grado,cargo,...(b64?{firma_b64:b64}:{})}
  const {error}=await APP.sb.from('config_firmas').upsert(dat,{onConflict:'cuartel_id,rol'})
  if(error){toast('Error: '+error.message,'err');return}
  toast('Firma guardada','ok')
}
