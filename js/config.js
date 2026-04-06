// ============================================================
// SISTEMA CSF OPERATIVA — config.js
// Prefectura Arica Nro. 1 · Carabineros de Chile
// ============================================================

const CSF_CONFIG = {

  // ── SUPABASE (reemplazar con tus credenciales) ────────────
  SUPABASE_URL:      'https://vernoovotmyfmngkmqkk.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlcm5vb3ZvdG15Zm1uZ2ttcWtrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NDMzNTAsImV4cCI6MjA5MDAxOTM1MH0.Bc-3exE4rK4ZeMJrW3kbFGTeMZsHI7sdON2J5cRcVyw',

  // ── SISTEMA ──────────────────────────────────────────────
  NOMBRE_SISTEMA:     'CSF OPERATIVA',
  NOMBRE_UNIDAD:      'Prefectura Arica Nro. 1',
  NOMBRE_INSTITUCION: 'Carabineros de Chile',
  VERSION:            '1.1.0',

  // ── ROLES ────────────────────────────────────────────────
  ROLES: {
    COMISARIO:     'comisario',
    ADMINISTRADOR: 'administrador',
    DIGITADOR:     'digitador',
  },

  // ── CSF ───────────────────────────────────────────────────
  CSF_VIGENCIA_DIAS:    30,
  CSF_DESFASE_MESES:    2,   // datos de mes X → CSF mes X+2
  CSF_DIAS_GENERACION:  5,   // publicar antes del día 5 del mes

  // ── FVC — FRECUENCIAS ────────────────────────────────────
  FVC_ORDEN: ['diario','2x_semana','semanal','quincenal','mensual','bimestral','trimestral','semestral'],
  FVC_LABELS: {
    'diario':      'Diario',
    '2x_semana':   '2 veces / semana',
    'semanal':     '1 vez / semana',
    'quincenal':   '1 vez / 15 días',
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

  // ── CRITICIDAD P×C ───────────────────────────────────────
  PXC_NIVELES: [
    { min:1,  max:5,  nivel:1, texto:'BAJO',           probabilidad:'BAJA',  color:'#1A843F' },
    { min:6,  max:10, nivel:2, texto:'MODERADO',       probabilidad:'MEDIA', color:'#9A7D0A' },
    { min:11, max:15, nivel:3, texto:'RIESGO ALTO',    probabilidad:'ALTA',  color:'#C45000' },
    { min:16, max:20, nivel:4, texto:'RIESGO CRÍTICO', probabilidad:'ALTA',  color:'#C0392B' },
    { min:21, max:25, nivel:5, texto:'EMERGENCIA',     probabilidad:'ALTA',  color:'#922B21' },
  ],

  // ── FVC POR NIVEL DE CRITICIDAD ──────────────────────────
  FVC_POR_NIVEL: {
    1: 'mensual',
    2: 'quincenal',
    3: 'semanal',
    4: '2x_semana',
    5: 'diario',
  },

  // ── PLANILLA EXCEL DELITOS CT ────────────────────────────
  ESCALAS_DELITOS: {
    // Por número de casos
    casos: [
      { max:1, nivel:1 }, { max:2, nivel:2 }, { max:3, nivel:3 },
      { max:4, nivel:4 }, { max:Infinity, nivel:5 }
    ],
    // Por número de personas
    personas: [
      { max:3, nivel:1 }, { max:8, nivel:2 }, { max:13, nivel:3 },
      { max:19, nivel:4 }, { max:Infinity, nivel:5 }
    ],
  },
  CATEGORIAS_PERSONAS: [
    'trafico_migrantes','ingreso_adulto','ingreso_nna',
    'egreso_adulto','egreso_nna'
  ],

  // ── IDFI PESOS ────────────────────────────────────────────
  IDFI_PESOS: { dfp: 0.40, dfo: 0.60 },
  DFP_PESOS: {
    dfp01: 0.25,  // Hitos
    dfp02: 0.30,  // PNH
    dfp03: 0.15,  // SIE
    dfp04: 0.15,  // Coordinación internacional
    dfp05: 0.15,  // Producción inteligencia
  },
  DFO_PESOS: {
    dfo01: 0.15,  // Eficacia controles
    dfo02: 0.10,  // Docs falsificados
    dfo03: 0.15,  // Control migratorio
    dfo04: 0.30,  // Interdicción COT
    dfo05: 0.15,  // Impacto económico UF
    dfo06: 0.15,  // Objetivos internacionales
  },

  // ── UMBRALES IDFI ─────────────────────────────────────────
  UMBRALES_IDFI: [
    { min:90,  max:100, label:'ÓPTIMO',     color:'#1A843F', accion:'Mantener' },
    { min:70,  max:89,  label:'ADECUADO',   color:'#9A7D0A', accion:'Monitorear' },
    { min:50,  max:69,  label:'DEFICIENTE', color:'#C45000', accion:'Corregir' },
    { min:0,   max:49,  label:'CRÍTICO',    color:'#C0392B', accion:'Intervenir' },
  ],

  // ── DELITOS COT ───────────────────────────────────────────
  DELITOS_COT: [
    'trafico_drogas', 'trafico_migrantes', 'trata_personas',
    'contrabando', 'ley_17798_armas', 'abigeato',
    'falsificacion_documentos', 'receptacion',
    'lavado_activos', 'cohecho',
  ],

  // ── SERVICIOS RELEVANTES PARA CSF ────────────────────────
  SERVICIOS_CSF: [
    'PATRULLAJE DE SOBERANÍA Y VISITA A HITOS',
    'PATRULLAJE PUESTO DE OBSERVACIÓN MÓVIL',
    'PUESTO OBSERVACIÓN',
    'INTERVENCIÓN FRONTERIZA',
    'SERVICIO MIXTO CARABINEROS/EJERCITO',
    'SERVICIO GUARDIA COMPLEJO',
    '1ER. TURNO', '2DO. TURNO', '3ER. TURNO',
    '1ER. PATRULLAJE', '2DO. PATRULLAJE',
  ],

  // ── COLORES INSTITUCIONALES ───────────────────────────────
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

  // ── RADIO DE INFLUENCIA ───────────────────────────────────
  RADIO_KM: 5,

  // ── ALERTAS ───────────────────────────────────────────────
  HORAS_ALERTA_PENDIENTE: 48,
};
