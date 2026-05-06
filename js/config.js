// ============================================================
// SISTEMA CSF OPERATIVA — config.js  v1.4
// Prefectura Arica Nro. 1 - Carabineros de Chile
// CAMBIOS v1.4:
//   E1 — Escalas de delitos conformes al documento oficial
//        "Niveles de Criticidad" (Excel SPF)
//   E2 — Eliminado lavado_activos de DELITOS_COT
//   E3 — DELITOS_COT actualizado
// ============================================================

const CSF_CONFIG = {

  SUPABASE_URL:      'https://kcsqvhhqninmrttfhirm.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtjc3F2aGhxbmlubXJ0dGZoaXJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MDA1NzgsImV4cCI6MjA5MTA3NjU3OH0.zXGDSVqHDnFuCWj18SE6_qCLEVYl1zs0oHTASMIrsi4',

  NOMBRE_SISTEMA:     'CSF OPERATIVA',
  NOMBRE_UNIDAD:      'Prefectura Arica Nro. 1',
  NOMBRE_INSTITUCION: 'Carabineros de Chile',
  VERSION:            '1.4.0',

  ROLES: {
    COMISARIO:     'comisario',
    ADMINISTRADOR: 'administrador',
    DIGITADOR:     'digitador',
  },

  CSF_VIGENCIA_DIAS:    30,
  CSF_DESFASE_MESES:    2,
  CSF_DIAS_GENERACION:  5,

  FVC_ORDEN: ['diario','2x_semana','semanal','quincenal','mensual','bimestral','trimestral','semestral'],
  FVC_LABELS: {
    'diario':      'Diario',
    '2x_semana':   '2 veces / semana',
    'semanal':     '1 vez / semana',
    'quincenal':   '1 vez / 15 dias',
    'mensual':     '1 vez / mes',
    'bimestral':   '1 vez / 2 meses',
    'trimestral':  '1 vez / 3 meses',
    'semestral':   '1 vez / 6 meses',
  },
  FVC_VISITAS_MES: {
    'diario':30, '2x_semana':8, 'semanal':4, 'quincenal':2,
    'mensual':1, 'bimestral':1, 'trimestral':1, 'semestral':1,
  },

  PXC_NIVELES: [
    { min:1,  max:5,  nivel:1, texto:'BAJO',           probabilidad:'BAJA',  color:'#1A843F' },
    { min:6,  max:10, nivel:2, texto:'MODERADO',       probabilidad:'MEDIA', color:'#9A7D0A' },
    { min:11, max:15, nivel:3, texto:'RIESGO ALTO',    probabilidad:'ALTA',  color:'#C45000' },
    { min:16, max:20, nivel:4, texto:'RIESGO CRITICO', probabilidad:'ALTA',  color:'#C0392B' },
    { min:21, max:25, nivel:5, texto:'EMERGENCIA',     probabilidad:'ALTA',  color:'#922B21' },
  ],

  FVC_POR_NIVEL: {
    1: 'mensual', 2: 'quincenal', 3: 'semanal', 4: '2x_semana', 5: 'diario',
  },

  // Escalas conformes al documento oficial SPF "Niveles de Criticidad"
  // casos:   1/2/3/4/5+ (todos los delitos no migratorios)
  // personas: 1-3/4-8/9-13/13-19/20+ (migratorios y trata)
  ESCALAS_DELITOS: {
    casos: [
      { max:1, nivel:1 }, { max:2, nivel:2 }, { max:3, nivel:3 },
      { max:4, nivel:4 }, { max:Infinity, nivel:5 },
    ],
    personas: [
      { max:3,  nivel:1 }, { max:8,  nivel:2 }, { max:13, nivel:3 },
      { max:19, nivel:4 }, { max:Infinity, nivel:5 },
    ],
  },

  CATEGORIAS_PERSONAS: [
    'trafico_migrantes','trata_personas',
    'ingreso_adulto','ingreso_nna',
    'egreso_adulto','egreso_nna',
  ],

  IDFI_PESOS: { dfp: 0.40, dfo: 0.60 },
  DFP_PESOS: { dfp01:0.25, dfp02:0.30, dfp03:0.15, dfp04:0.15, dfp05:0.15 },
  DFO_PESOS: { dfo01:0.15, dfo02:0.10, dfo03:0.15, dfo04:0.30, dfo05:0.15, dfo06:0.15 },

  UMBRALES_IDFI: [
    { min:90, max:100, label:'OPTIMO',     color:'#1A843F', accion:'Mantener' },
    { min:70, max:89,  label:'ADECUADO',   color:'#9A7D0A', accion:'Monitorear' },
    { min:50, max:69,  label:'DEFICIENTE', color:'#C45000', accion:'Corregir' },
    { min:0,  max:49,  label:'CRITICO',    color:'#C0392B', accion:'Intervenir' },
  ],

  // lavado_activos eliminado (no es delito fronterizo operacional)
  DELITOS_COT: [
    'trafico_drogas', 'trafico_migrantes', 'trata_personas',
    'contrabando', 'ley_17798_armas', 'abigeato',
    'falsificacion_documentos', 'receptacion', 'cohecho',
  ],

  SERVICIOS_CSF: [
    'PATRULLAJE DE SOBERANIA Y VISITA A HITOS',
    'PATRULLAJE PUESTO DE OBSERVACION MOVIL',
    'PUESTO OBSERVACION', 'INTERVENCION FRONTERIZA',
    'SERVICIO MIXTO CARABINEROS/EJERCITO', 'SERVICIO GUARDIA COMPLEJO',
    '1ER. TURNO', '2DO. TURNO', '3ER. TURNO',
    '1ER. PATRULLAJE', '2DO. PATRULLAJE',
  ],

  COLORES: {
    verde_oscuro:'#04742C', verde_medio:'#1A843F', verde_claro:'#E8F5EC',
    verde_palido:'#F0F9F3', encabezado:'#CCE3D3', tabla_datos:'#E2EFD9',
    rojo:'#C0392B', amarillo:'#9A7D0A',
  },

  RADIO_KM: 5,
  HORAS_ALERTA_PENDIENTE: 48,
}

const LEY_POR_DELITO = {
  trafico_drogas:           'Ley 20.000',
  trafico_migrantes:        'Ley 21.325 (Migracion)',
  trata_personas:           'Ley 20.507',
  contrabando:              'Ordenanza de Aduanas',
  ley_17798_armas:          'Ley 17.798 (Control Armas)',
  abigeato:                 'Codigo Penal Art. 448',
  falsificacion_documentos: 'Codigo Penal Art. 193',
  receptacion:              'Codigo Penal Art. 456 bis A',
  cohecho:                  'Codigo Penal Art. 248',
  orden_judicial:           'Codigo Procesal Penal',
  orden_interpol:           'Interpol / CPP Art. 127',
  transito:                 'Ley 18.290 (Transito)',
  infraccion_migratoria:    'Ley 21.325 (Migracion)',
  otro:                     'Codigo Penal',
}

const DESTINO_POR_RESULTADO = {
  detencion:             'parte_fiscalia',
  infraccion_migratoria: 'oficio_pdi',
  nna_irregular:         'oficio_pdi',
}

const CLASIFICACION_POR_RESULTADO = {
  detencion:             'detenido',
  infraccion_migratoria: 'infraccion',
  nna_irregular:         'infraccion',
}

function calcularRangoHora(horaStr) {
  if (!horaStr) return ''
  const h = parseInt(String(horaStr).split(':')[0])
  if (isNaN(h)) return ''
  if (h <  6)  return '00:00 - 05:59'
  if (h < 12)  return '06:00 - 11:59'
  if (h < 18)  return '12:00 - 17:59'
  return '18:00 - 23:59'
}
