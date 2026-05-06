// ============================================================
// SISTEMA CSF OPERATIVA — config.js  v1.3
// Prefectura Arica No. 1 - Carabineros de Chile
// CAMBIOS v1.3:
//   E1 — ESCALAS_DELITOS ajustadas para contexto fronterizo
//        Personas: umbrales reducidos (1 persona = actividad real)
//        Casos: separados en 3 subcategorias por gravedad
//   E2 — CATEGORIAS_PERSONAS actualizada con nuevas subcategorias
// ============================================================

const CSF_CONFIG = {

  // SUPABASE
  SUPABASE_URL:      'https://kcsqvhhqninmrttfhirm.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtjc3F2aGhxbmlubXJ0dGZoaXJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MDA1NzgsImV4cCI6MjA5MTA3NjU3OH0.zXGDSVqHDnFuCWj18SE6_qCLEVYl1zs0oHTASMIrsi4',

  // SISTEMA
  NOMBRE_SISTEMA:     'CSF OPERATIVA',
  NOMBRE_UNIDAD:      'Prefectura Arica Nro. 1',
  NOMBRE_INSTITUCION: 'Carabineros de Chile',
  VERSION:            '1.3.0',

  // ROLES
  ROLES: {
    COMISARIO:     'comisario',
    ADMINISTRADOR: 'administrador',
    DIGITADOR:     'digitador',
  },

  // CSF
  CSF_VIGENCIA_DIAS:    30,
  CSF_DESFASE_MESES:    2,
  CSF_DIAS_GENERACION:  5,

  // FVC FRECUENCIAS
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
    'diario':      30,
    '2x_semana':   8,
    'semanal':     4,
    'quincenal':   2,
    'mensual':     1,
    'bimestral':   1,
    'trimestral':  1,
    'semestral':   1,
  },

  // CRITICIDAD PxC
  // Escala uniforme 1-25 dividida en 5 bandas de 5 puntos.
  // Correcta y sin cambios.
  PXC_NIVELES: [
    { min:1,  max:5,  nivel:1, texto:'BAJO',           probabilidad:'BAJA',  color:'#1A843F' },
    { min:6,  max:10, nivel:2, texto:'MODERADO',       probabilidad:'MEDIA', color:'#9A7D0A' },
    { min:11, max:15, nivel:3, texto:'RIESGO ALTO',    probabilidad:'ALTA',  color:'#C45000' },
    { min:16, max:20, nivel:4, texto:'RIESGO CRITICO', probabilidad:'ALTA',  color:'#C0392B' },
    { min:21, max:25, nivel:5, texto:'EMERGENCIA',     probabilidad:'ALTA',  color:'#922B21' },
  ],

  // FVC POR NIVEL DE CRITICIDAD
  // Sin cambios: la progresion mensual->diario es correcta.
  FVC_POR_NIVEL: {
    1: 'mensual',
    2: 'quincenal',
    3: 'semanal',
    4: '2x_semana',
    5: 'diario',
  },

  // ── ESCALAS DELITOS v1.3 (AJUSTADAS PARA FRONTERA) ───────
  //
  // CAMBIO E1-A: Escala PERSONAS reducida.
  // Razon: en sector fronterizo remoto, 1-2 personas ya es
  // actividad significativa. La escala anterior (1-3 = N1)
  // subestimaba puntos con actividad real.
  //
  //   Anterior:  1-3->N1  4-8->N2  9-13->N3  14-19->N4  20+->N5
  //   Corregido: 1  ->N1  2-4->N2  5-8 ->N3   9-14->N4  15+->N5
  //
  // CAMBIO E1-B: Escala CASOS separada en 3 subcategorias.
  // Razon: tratar igual un arma y una prenda de contrabando
  // distorsiona el calculo. Se crean 3 niveles de gravedad:
  //
  //   casos_graves  (drogas, armas, trata):  1->N3, 2->N4, 3+->N5
  //   casos_medios  (abigeato, falsif, rec):  1->N2, 2->N3, 3+->N4
  //   casos_leves   (contrabando general):   1->N1, 2->N2, 3->N3, 4+->N4
  //
  ESCALAS_DELITOS: {
    // Personas (trafico migrantes, ingreso adulto/NNA, egreso)
    // 1 persona = N1 minimo, 2-4 = ya es moderado
    personas: [
      { max:1,        nivel:1 },
      { max:4,        nivel:2 },
      { max:8,        nivel:3 },
      { max:14,       nivel:4 },
      { max:Infinity, nivel:5 },
    ],
    // Casos graves: drogas, armas, trata de personas
    // 1 caso ya es nivel 3 (riesgo alto) en frontera
    casos_graves: [
      { max:1,        nivel:3 },
      { max:2,        nivel:4 },
      { max:Infinity, nivel:5 },
    ],
    // Casos medios: abigeato, falsificacion documentos, receptacion
    casos_medios: [
      { max:1,        nivel:2 },
      { max:2,        nivel:3 },
      { max:Infinity, nivel:4 },
    ],
    // Casos leves: contrabando general (ropa, cigarrillos, fitosanitario)
    casos_leves: [
      { max:1,        nivel:1 },
      { max:2,        nivel:2 },
      { max:3,        nivel:3 },
      { max:Infinity, nivel:4 },
    ],
    // Compatibilidad: 'casos' apunta a casos_medios como fallback
    casos: [
      { max:1,        nivel:2 },
      { max:2,        nivel:3 },
      { max:3,        nivel:4 },
      { max:Infinity, nivel:5 },
    ],
  },

  // E2: Categorias de personas (para determinar escala)
  CATEGORIAS_PERSONAS: [
    'trafico_migrantes','ingreso_adulto','ingreso_nna',
    'egreso_adulto','egreso_nna',
  ],

  // Delitos que usan escala casos_graves
  DELITOS_GRAVES: [
    'trafico_drogas', 'ley_17798_armas', 'trata_personas',
  ],

  // Delitos que usan escala casos_medios
  DELITOS_MEDIOS: [
    'abigeato', 'falsificacion_documentos', 'receptacion',
    'lavado_activos', 'cohecho',
  ],

  // Delitos que usan escala casos_leves
  DELITOS_LEVES: [
    'contrabando',
  ],

  // IDFI PESOS (sin cambios)
  IDFI_PESOS: { dfp: 0.40, dfo: 0.60 },
  DFP_PESOS: {
    dfp01: 0.25,
    dfp02: 0.30,
    dfp03: 0.15,
    dfp04: 0.15,
    dfp05: 0.15,
  },
  DFO_PESOS: {
    dfo01: 0.15,
    dfo02: 0.10,
    dfo03: 0.15,
    dfo04: 0.30,
    dfo05: 0.15,
    dfo06: 0.15,
  },

  // UMBRALES IDFI (sin cambios)
  UMBRALES_IDFI: [
    { min:90,  max:100, label:'OPTIMO',     color:'#1A843F', accion:'Mantener' },
    { min:70,  max:89,  label:'ADECUADO',   color:'#9A7D0A', accion:'Monitorear' },
    { min:50,  max:69,  label:'DEFICIENTE', color:'#C45000', accion:'Corregir' },
    { min:0,   max:49,  label:'CRITICO',    color:'#C0392B', accion:'Intervenir' },
  ],

  // DELITOS COT (sin cambios)
  DELITOS_COT: [
    'trafico_drogas', 'trafico_migrantes', 'trata_personas',
    'contrabando', 'ley_17798_armas', 'abigeato',
    'falsificacion_documentos', 'receptacion',
    'lavado_activos', 'cohecho',
  ],

  // SERVICIOS RELEVANTES PARA CSF (sin cambios)
  SERVICIOS_CSF: [
    'PATRULLAJE DE SOBERANIA Y VISITA A HITOS',
    'PATRULLAJE PUESTO DE OBSERVACION MOVIL',
    'PUESTO OBSERVACION',
    'INTERVENCION FRONTERIZA',
    'SERVICIO MIXTO CARABINEROS/EJERCITO',
    'SERVICIO GUARDIA COMPLEJO',
    '1ER. TURNO', '2DO. TURNO', '3ER. TURNO',
    '1ER. PATRULLAJE', '2DO. PATRULLAJE',
  ],

  // COLORES INSTITUCIONALES (sin cambios)
  COLORES: {
    verde_oscuro:  '#04742C',
    verde_medio:   '#1A843F',
    verde_claro:   '#E8F5EC',
    verde_palido:  '#F0F9F3',
    encabezado:    '#CCE3D3',
    tabla_datos:   '#E2EFD9',
    rojo:          '#C0392B',
    amarillo:      '#9A7D0A',
  },

  // RADIO DE INFLUENCIA
  RADIO_KM: 5,

  // ALERTAS
  HORAS_ALERTA_PENDIENTE: 48,
}

// BS DATOS: mapeo delito -> ley aplicable
const LEY_POR_DELITO = {
  trafico_drogas:           'Ley 20.000',
  trafico_migrantes:        'Ley 21.325 (Migracion)',
  trata_personas:           'Ley 20.507',
  contrabando:              'Ordenanza de Aduanas',
  ley_17798_armas:          'Ley 17.798 (Control Armas)',
  abigeato:                 'Codigo Penal Art. 448',
  falsificacion_documentos: 'Codigo Penal Art. 193',
  receptacion:              'Codigo Penal Art. 456 bis A',
  lavado_activos:           'Ley 19.913',
  cohecho:                  'Codigo Penal Art. 248',
  orden_judicial:           'Codigo Procesal Penal',
  orden_interpol:           'Interpol / CPP Art. 127',
  transito:                 'Ley 18.290 (Transito)',
  infraccion_migratoria:    'Ley 21.325 (Migracion)',
  otro:                     'Codigo Penal',
}

// BS DATOS: destino automatico
const DESTINO_POR_RESULTADO = {
  detencion:             'parte_fiscalia',
  infraccion_migratoria: 'oficio_pdi',
  nna_irregular:         'oficio_pdi',
}

// BS DATOS: clasificacion del caso
const CLASIFICACION_POR_RESULTADO = {
  detencion:             'detenido',
  infraccion_migratoria: 'infraccion',
  nna_irregular:         'infraccion',
}

// BS DATOS: calculo de rango horario
function calcularRangoHora(horaStr) {
  if (!horaStr) return ''
  const h = parseInt(String(horaStr).split(':')[0])
  if (isNaN(h))  return ''
  if (h <  6)  return '00:00 - 05:59'
  if (h < 12)  return '06:00 - 11:59'
  if (h < 18)  return '12:00 - 17:59'
  return '18:00 - 23:59'
}

// ── HELPER: escala correcta segun tipo de delito ─────────────
// Usado en generarBorradorCSF y _generarCSFParaCuartel
function escalaParaDelito(tipoDelito) {
  if (CSF_CONFIG.DELITOS_GRAVES.includes(tipoDelito)) return 'casos_graves'
  if (CSF_CONFIG.DELITOS_MEDIOS.includes(tipoDelito)) return 'casos_medios'
  if (CSF_CONFIG.DELITOS_LEVES.includes(tipoDelito))  return 'casos_leves'
  return 'casos'
}
