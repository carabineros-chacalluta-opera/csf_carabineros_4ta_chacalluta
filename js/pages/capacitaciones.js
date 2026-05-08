// ============================================================
// SISTEMA CSF OPERATIVA — capacitaciones.js  v1.0
// Sin cambios del informe de auditoria v1.4.1
// ============================================================

async function renderCapacitaciones() {
  const hoy=hoyISO(),anio=new Date().getFullYear(),ini=`${anio}-01-01`
  const cuartelActivo=APP.cuartelActivo(),puedeVerTodos=APP.esAdministrador()||APP.esComisario()
  el('pantalla-capacitaciones').innerHTML=`
    <div class="container">
      <div class="flex-sb" style="margin-bottom:1rem">
        <h2 class="page-titulo">Capacitaciones</h2>
        <button class="btn btn-primario" onclick="abrirFormCapacitacion()">+ Nueva capacitación</button>
      </div>
      <div class="card filtros-card" style="margin-bottom:1rem">
        <div class="g3">
          <div class="campo"><label>Desde</label><input type="date" id="cap-desde" value="${ini}"/></div>
          <div class="campo"><label>Hasta</label><input type="date" id="cap-hasta" value="${hoy}"/></div>
          ${puedeVerTodos?`<div class="campo"><label>Cuartel</label>
            <select id="cap-cuartel">
              <option value="">— Todos —</option>
              ${(APP.todosCuarteles||[]).map(c=>`<option value="${c.id}" ${c.id===cuartelActivo?.id?'selected':''}>${c.nombre.replace(' (F)','')}</option>`).join('')}
            </select>
          </div>`:''}
        </div>
        <button class="btn btn-primario" onclick="consultarCapacitaciones()">Consultar</button>
      </div>
      <div id="capacitaciones-lista"><div class="cargando">Selecciona un período y consulta</div></div>
      <div id="modal-capacitacion" class="modal" style="display:none">
        <div class="modal-box">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1rem">
            <div class="modal-titulo">Registrar Capacitación</div>
            <button onclick="el('modal-capacitacion').style.display='none'" class="btn-cerrar">✕</button>
          </div>
          <div id="form-capacitacion-contenido"></div>
        </div>
      </div>
    </div>`
  await consultarCapacitaciones()
}

async function consultarCapacitaciones(){
  const desde=el('cap-desde')?.value,hasta=el('cap-hasta')?.value
  const cuartelId=el('cap-cuartel')?.value||APP.cuartelActivo()?.id
  const zona=el('capacitaciones-lista')
  if(!zona)return
  showLoader('capacitaciones-lista','Consultando...')
  let q=APP.sb.from('capacitaciones').select('*,cuartel:cuarteles(nombre)').gte('fecha_inicio',desde).lte('fecha_inicio',hasta).order('fecha_inicio',{ascending:false})
  if(cuartelId)q=q.eq('cuartel_id',cuartelId)
  const {data:caps}=await q
  if(!caps?.length){zona.innerHTML='<div class="card" style="text-align:center;padding:2rem;color:var(--muted)">Sin capacitaciones en el período</div>';return}
  zona.innerHTML=`<div class="card">
    <table style="width:100%;border-collapse:collapse;font-size:.8rem">
      <thead><tr style="background:var(--bg-alt)">
        <th style="padding:.4rem .6rem;text-align:left">Fecha</th>
        <th style="padding:.4rem .6rem;text-align:left">Cuartel</th>
        <th style="padding:.4rem .6rem;text-align:left">Tipo</th>
        <th style="padding:.4rem .6rem;text-align:left">Temática</th>
        <th style="padding:.4rem .6rem;text-align:left">Organismo</th>
        <th style="padding:.4rem .6rem;text-align:center">Personal</th>
        ${!APP.esDigitador()?'<th style="padding:.4rem .6rem"></th>':''}
      </tr></thead>
      <tbody>
        ${caps.map((c,i)=>`<tr style="${i%2===0?'background:var(--surface-2)':''}">
          <td style="padding:.35rem .6rem">${formatFecha(c.fecha_inicio)}${c.fecha_termino&&c.fecha_termino!==c.fecha_inicio?' → '+formatFecha(c.fecha_termino):''}</td>
          <td style="padding:.35rem .6rem">${c.cuartel?.nombre?.replace(' (F)','')||'—'}</td>
          <td style="padding:.35rem .6rem"><span style="font-size:.7rem;font-weight:700;padding:1px 6px;border-radius:3px;background:${c.tipo==='institucional'?'#e8f5ea':'#e8f0fe'};color:${c.tipo==='institucional'?'#1A843F':'#3730a3'}">${c.tipo==='institucional'?'Institucional':'Extrainst.'}</span></td>
          <td style="padding:.35rem .6rem">${c.tematica||'—'}</td>
          <td style="padding:.35rem .6rem;color:var(--muted)">${c.organismo||'—'}</td>
          <td style="padding:.35rem .6rem;text-align:center;font-weight:600">${c.cantidad_personal||0}</td>
          ${!APP.esDigitador()?`<td style="padding:.35rem .6rem"><button class="btn btn-sm btn-secundario" onclick="eliminarCapacitacion('${c.id}')">✕</button></td>`:''}
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`
}

function abrirFormCapacitacion(){
  const cuartelActivo=APP.cuartelActivo()
  el('form-capacitacion-contenido').innerHTML=`
    <div class="g2">
      <div class="campo"><label>Tipo de capacitación</label>
        <select id="cap-tipo">
          <option value="institucional">Institucional</option>
          <option value="extrainstitucional">Extrainstitucional</option>
        </select>
      </div>
      <div class="campo"><label>Cuartel</label>
        ${APP.esDigitador()?`
          <input type="text" value="${cuartelActivo?.nombre||''}" readonly style="background:var(--surface-2)"/>
          <input type="hidden" id="cap-cuartel-id" value="${cuartelActivo?.id||''}">`:`
          <select id="cap-cuartel-id">
            ${(APP.todosCuarteles||[]).map(c=>`<option value="${c.id}">${c.nombre.replace(' (F)','')}</option>`).join('')}
          </select>`}
      </div>
      <div class="campo"><label>Fecha inicio</label><input type="date" id="cap-fi" value="${hoyISO()}"/></div>
      <div class="campo"><label>Fecha término</label><input type="date" id="cap-ft" value="${hoyISO()}"/></div>
    </div>
    <div class="campo" style="margin-top:.5rem"><label>Temática tratada</label>
      <textarea id="cap-tematica" rows="2" placeholder="Ej: Mal agudo de montaña, Uso GPS..."></textarea>
    </div>
    <div class="campo" style="margin-top:.5rem"><label>Organismo o instructor</label>
      <input type="text" id="cap-organismo" placeholder="Ej: Carabineros de Chile, Cabo 1ro. Juan Pérez..."/>
    </div>
    <div class="campo" style="margin-top:.5rem"><label>Cantidad de personal capacitado</label>
      <input type="number" id="cap-personal" min="1" value="1" style="width:100px"/>
    </div>
    <div style="display:flex;gap:.75rem;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
      <button class="btn btn-primario" onclick="guardarCapacitacion()">✓ Guardar</button>
      <button class="btn btn-secundario" onclick="el('modal-capacitacion').style.display='none'">Cancelar</button>
    </div>`
  el('modal-capacitacion').style.display='flex'
}

async function guardarCapacitacion(){
  const cuartelId=el('cap-cuartel-id')?.value||APP.cuartelActivo()?.id
  const fi=el('cap-fi')?.value,ft=el('cap-ft')?.value
  const tematica=el('cap-tematica')?.value?.trim(),organismo=el('cap-organismo')?.value?.trim()
  const personal=parseInt(el('cap-personal')?.value)||0
  if(!fi){toast('La fecha de inicio es obligatoria','err');return}
  if(!tematica){toast('La temática es obligatoria','err');return}
  const {error}=await APP.sb.from('capacitaciones').insert({cuartel_id:cuartelId,tipo:el('cap-tipo')?.value,fecha_inicio:fi,fecha_termino:ft||fi,tematica,organismo:organismo||null,cantidad_personal:personal,registrado_por:APP.perfil.id})
  if(error){toast('Error al guardar: '+error.message,'err');return}
  toast('Capacitación registrada correctamente','ok')
  el('modal-capacitacion').style.display='none'
  await consultarCapacitaciones()
}

async function eliminarCapacitacion(id){
  if(!confirm('¿Eliminar esta capacitación?'))return
  const {error}=await APP.sb.from('capacitaciones').delete().eq('id',id)
  if(error){toast('Error: '+error.message,'err');return}
  toast('Eliminada correctamente','ok')
  await consultarCapacitaciones()
}
