-- ============================================================
-- SISTEMA CSF OPERATIVA
-- Prefectura Arica Nro. 1 · Carabineros de Chile
-- Schema completo Supabase
-- ============================================================

-- ── EXTENSIONES ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── CUARTELES ───────────────────────────────────────────────
CREATE TABLE cuarteles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        TEXT NOT NULL UNIQUE,
  codigo        TEXT NOT NULL UNIQUE,
  pais_limitrofe TEXT,
  activo        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── PERSONAL (solo código, sin datos personales) ────────────
CREATE TABLE personal_cuartel (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo_funcionario  TEXT NOT NULL,
  cuartel_id          UUID REFERENCES cuarteles(id) ON DELETE CASCADE,
  activo              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(codigo_funcionario, cuartel_id)
);

-- ── USUARIOS DEL SISTEMA ────────────────────────────────────
CREATE TABLE usuarios (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  cuartel_id  UUID REFERENCES cuarteles(id),
  rol         TEXT NOT NULL CHECK (rol IN ('comisario','administrador','digitador')),
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── PUNTOS TERRITORIALES ────────────────────────────────────
CREATE TABLE puntos_territoriales (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cuartel_id       UUID REFERENCES cuarteles(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL CHECK (tipo IN ('hito','pnh','sie')),
  nombre           TEXT NOT NULL,
  nombre_completo  TEXT,
  tipo_sfi         TEXT,
  pais_limitrofe   TEXT,
  referencia       TEXT,
  latitud          DECIMAL(10,7),
  longitud         DECIMAL(10,7),
  fvc_base         TEXT NOT NULL DEFAULT 'semanal'
                   CHECK (fvc_base IN ('diario','2x_semana','semanal','quincenal','mensual','bimestral')),
  valor_estrategico TEXT NOT NULL DEFAULT 'medio'
                    CHECK (valor_estrategico IN ('bajo','medio','alto','critico')),
  activo           BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── SERVICIOS (importados del Excel oficial) ────────────────
CREATE TABLE servicios (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cuartel_id            UUID REFERENCES cuarteles(id) ON DELETE CASCADE,
  fecha                 DATE NOT NULL,
  tipo_servicio         TEXT NOT NULL,
  hora_inicio           TIME,
  hora_termino          TIME,
  turno                 TEXT CHECK (turno IN ('diurno','nocturno','mixto')),
  cantidad_funcionarios INTEGER DEFAULT 0,
  cantidad_vehiculos    INTEGER DEFAULT 0,
  codigo_jefe_servicio  TEXT,
  estado                TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','completado')),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  completado_at         TIMESTAMPTZ,
  completado_por        UUID REFERENCES usuarios(id)
);

-- ── VISITAS A PUNTOS (S1) ───────────────────────────────────
CREATE TABLE visitas_puntos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  servicio_id         UUID REFERENCES servicios(id) ON DELETE CASCADE,
  punto_id            UUID REFERENCES puntos_territoriales(id),
  fecha               DATE NOT NULL,
  turno               TEXT CHECK (turno IN ('diurno','nocturno')),
  estado_punto        TEXT DEFAULT 'normal'
                      CHECK (estado_punto IN ('normal','con_novedades','danado')),
  registro_foto       BOOLEAN DEFAULT FALSE,
  registro_gps        BOOLEAN DEFAULT FALSE,
  coordinacion_inter  BOOLEAN DEFAULT FALSE,
  nivel_coordinacion  TEXT CHECK (nivel_coordinacion IN ('alto','medio','bajo')),
  semana_iso          INTEGER,
  anio                INTEGER,
  periodo_fvc_id      TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── OBSERVACIONES DE INTELIGENCIA (S2) ──────────────────────
CREATE TABLE observaciones_intel (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  servicio_id      UUID REFERENCES servicios(id) ON DELETE CASCADE,
  punto_id         UUID REFERENCES puntos_territoriales(id),
  tipo_hallazgo    TEXT NOT NULL
                   CHECK (tipo_hallazgo IN (
                     'huellas_peatonales','huellas_vehiculares',
                     'residuos_recientes','campamento','vehiculo_abandonado',
                     'senalizacion_ilicita','otro')),
  descripcion      TEXT,
  nivel_relevancia TEXT NOT NULL DEFAULT 'medio'
                   CHECK (nivel_relevancia IN ('alto','medio','bajo')),
  evidencia_foto   BOOLEAN DEFAULT FALSE,
  evidencia_gps    BOOLEAN DEFAULT FALSE,
  latitud_obs      DECIMAL(10,7),
  longitud_obs     DECIMAL(10,7),
  reporte_id       UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── REPORTES DE INTELIGENCIA (DFP-05) ───────────────────────
CREATE TABLE reportes_inteligencia (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  observacion_id   UUID REFERENCES observaciones_intel(id),
  cuartel_id       UUID REFERENCES cuarteles(id),
  fecha_generado   DATE NOT NULL,
  fecha_entregado  DATE,
  estado           TEXT NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','entregado')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONTROLES EJECUTADOS (S3) ────────────────────────────────
CREATE TABLE controles_servicio (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  servicio_id               UUID REFERENCES servicios(id) ON DELETE CASCADE,
  identidad_preventivos     INTEGER DEFAULT 0,
  identidad_investigativos  INTEGER DEFAULT 0,
  migratorios               INTEGER DEFAULT 0,
  vehiculares               INTEGER DEFAULT 0,
  flagrancias               INTEGER DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ── INCAUTACIONES (S4) ──────────────────────────────────────
CREATE TABLE incautaciones (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  servicio_id           UUID REFERENCES servicios(id) ON DELETE CASCADE,
  punto_id              UUID REFERENCES puntos_territoriales(id),
  tipo_especie          TEXT NOT NULL
                        CHECK (tipo_especie IN (
                          'vehiculo_robado','vehiculo_material_delito','droga',
                          'fardos_ropa','cigarrillos','fitozoosanitario',
                          'fardos_juguetes','dinero','otro')),
  subtipo               TEXT,
  sustancia_droga       TEXT,
  modalidad_ocultamiento TEXT,
  moneda                TEXT,
  cantidad              DECIMAL(12,3),
  unidad                TEXT,
  valor_clp             DECIMAL(14,0),
  valor_uf              DECIMAL(10,4),
  fecha_uf              DATE,
  con_detenido          BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── HALLAZGOS SIN DETENIDO (S5) ─────────────────────────────
CREATE TABLE hallazgos_sin_detenido (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  servicio_id   UUID REFERENCES servicios(id) ON DELETE CASCADE,
  punto_id      UUID REFERENCES puntos_territoriales(id),
  tipo_bien     TEXT NOT NULL
                CHECK (tipo_bien IN (
                  'vehiculo_encargo','vehiculo_cot','maquinaria',
                  'dinero','otro')),
  descripcion   TEXT,
  cantidad      INTEGER DEFAULT 1,
  valor_clp     DECIMAL(14,0),
  valor_uf      DECIMAL(10,4),
  fecha_uf      DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── PERSONAS REGISTRADAS (S6) ────────────────────────────────
CREATE TABLE personas_registradas (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  servicio_id             UUID REFERENCES servicios(id) ON DELETE CASCADE,
  punto_id                UUID REFERENCES puntos_territoriales(id),

  -- Bloque A: datos básicos
  grupo_etario            TEXT NOT NULL CHECK (grupo_etario IN ('adulto','nna')),
  sexo                    TEXT CHECK (sexo IN ('masculino','femenino','otro')),
  nacionalidad            TEXT,
  edad                    INTEGER,

  -- Bloque B: cómo se inició
  como_inicio             TEXT CHECK (como_inicio IN (
                            'control_identidad_preventivo',
                            'control_identidad_investigativo',
                            'control_migratorio','control_vehicular',
                            'patrullaje_flagrancia')),

  -- Bloque C: resultado
  tipo_resultado          TEXT NOT NULL CHECK (tipo_resultado IN (
                            'detencion','infraccion_migratoria','nna_irregular')),

  -- Bloque D: detención
  tipo_delito             TEXT,
  subtipo_delito          TEXT,
  ley_aplicable           TEXT,
  sustancia_droga         TEXT,
  modalidad_ocultamiento  TEXT,

  -- Bloque E: migración
  situacion_migratoria    TEXT CHECK (situacion_migratoria IN (
                            'regular','irregular','en_tramite','sin_documentos')),
  tipo_ingreso            TEXT CHECK (tipo_ingreso IN (
                            'paso_habilitado','paso_no_habilitado','desconocido')),
  tipo_gestion_migratoria TEXT CHECK (tipo_gestion_migratoria IN (
                            'reconducido','denunciado_extranjeria',
                            'detenido_trafico','detenido_trata')),
  destino_documento       TEXT CHECK (destino_documento IN (
                            'oficio_pdi','parte_fiscalia','acta_reconduccion',NULL)),
  nro_documento           TEXT,
  distancia_lpi_km        DECIMAL(6,2),

  -- Bloque F: NNA
  nna_acompanado          BOOLEAN,
  nna_vinculo_adulto      TEXT CHECK (nna_vinculo_adulto IN (
                            'padre_madre','familiar','sin_vinculo',NULL)),
  nna_derivacion          TEXT,
  adulto_imputado_id      UUID REFERENCES personas_registradas(id),

  -- Bloque G: FFAA/Policía
  vinculacion_inst        TEXT CHECK (vinculacion_inst IN (
                            'no','activo','exmiembro',NULL)),
  institucion_extranjera  TEXT,
  pais_extranjero         TEXT,
  condicion_inst          TEXT,
  rango_declarado         TEXT,
  portaba_identificacion  BOOLEAN,
  estaba_uniformado       BOOLEAN,
  elemento_interes        TEXT,

  -- Alertas automáticas
  genera_alerta_cohecho   BOOLEAN DEFAULT FALSE,
  genera_alerta_nna       BOOLEAN DEFAULT FALSE,
  genera_alerta_interpol  BOOLEAN DEFAULT FALSE,

  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ── CSF MENSUAL ──────────────────────────────────────────────
CREATE TABLE csf_mensual (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cuartel_id        UUID REFERENCES cuarteles(id),
  numero            TEXT NOT NULL,
  clasificacion     TEXT NOT NULL DEFAULT 'RESERVADO'
                    CHECK (clasificacion IN ('RESERVADO','SECRETO')),
  mes_referencia    INTEGER NOT NULL,
  anio_referencia   INTEGER NOT NULL,
  mes_vigencia      INTEGER NOT NULL,
  anio_vigencia     INTEGER NOT NULL,
  fecha_emision     DATE,
  fecha_vigencia_inicio DATE,
  fecha_vigencia_fin    DATE,
  amenaza_principal TEXT,
  estado            TEXT NOT NULL DEFAULT 'borrador'
                    CHECK (estado IN ('borrador','publicada')),
  elaborado_por     UUID REFERENCES usuarios(id),
  publicado_por     UUID REFERENCES usuarios(id),
  publicado_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── FVC POR PUNTO EN CSF ─────────────────────────────────────
CREATE TABLE csf_puntos_fvc (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  csf_id              UUID REFERENCES csf_mensual(id) ON DELETE CASCADE,
  punto_id            UUID REFERENCES puntos_territoriales(id),
  nivel_excel         INTEGER DEFAULT 1,
  nivel_pxc           INTEGER DEFAULT 1,
  nivel_final         INTEGER NOT NULL DEFAULT 1,
  nivel_texto         TEXT,
  probabilidad_texto  TEXT,
  observacion         TEXT,
  fvc_asignada        TEXT NOT NULL
                      CHECK (fvc_asignada IN ('diario','2x_semana','semanal','quincenal','mensual','bimestral')),
  turno_recomendado   TEXT CHECK (turno_recomendado IN ('diurno','nocturno','ambos')),
  hora_inicio         TIME,
  hora_termino        TIME,
  tareas_especificas  TEXT,
  meta_cumplimiento   TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── VISITAS ORDENADAS (calendario CSF) ──────────────────────
CREATE TABLE csf_visitas_ordenadas (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  csf_id            UUID REFERENCES csf_mensual(id) ON DELETE CASCADE,
  punto_id          UUID REFERENCES puntos_territoriales(id),
  numero_visita     INTEGER NOT NULL,
  fecha_ordenada    DATE NOT NULL,
  hora_inicio       TIME NOT NULL,
  hora_termino      TIME NOT NULL,
  turno             TEXT CHECK (turno IN ('diurno','nocturno')),
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','ejecutada','incumplida')),
  servicio_id       UUID REFERENCES servicios(id),
  fecha_ejecutada   DATE,
  diferencia_dias   INTEGER,
  ajustado_por      UUID REFERENCES usuarios(id),
  motivo_ajuste     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── IDFI HISTORIAL ───────────────────────────────────────────
CREATE TABLE idfi_historial (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cuartel_id  UUID REFERENCES cuarteles(id),
  anio        INTEGER NOT NULL,
  mes         INTEGER NOT NULL,
  dfp_total   DECIMAL(6,2),
  dfp01       DECIMAL(6,2),
  dfp02       DECIMAL(6,2),
  dfp03       DECIMAL(6,2),
  dfp04       DECIMAL(6,2),
  dfp05       DECIMAL(6,2),
  dfo_total   DECIMAL(6,2),
  dfo01       DECIMAL(6,2),
  dfo02       DECIMAL(6,2),
  dfo03       DECIMAL(6,2),
  dfo04       DECIMAL(6,2),
  dfo05       DECIMAL(6,2),
  dfo06       DECIMAL(6,2),
  idfi        DECIMAL(6,2),
  diagnostico TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cuartel_id, anio, mes)
);

-- ── ALERTAS ─────────────────────────────────────────────────
CREATE TABLE alertas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cuartel_id  UUID REFERENCES cuarteles(id),
  tipo        TEXT NOT NULL CHECK (tipo IN ('cohecho','nna','interpol','punto_atrasado')),
  detalle     TEXT,
  servicio_id UUID REFERENCES servicios(id),
  persona_id  UUID REFERENCES personas_registradas(id),
  punto_id    UUID REFERENCES puntos_territoriales(id),
  visto       BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── ÍNDICES ──────────────────────────────────────────────────
CREATE INDEX idx_servicios_cuartel_fecha ON servicios(cuartel_id, fecha);
CREATE INDEX idx_servicios_estado ON servicios(estado);
CREATE INDEX idx_visitas_punto ON visitas_puntos(punto_id, fecha);
CREATE INDEX idx_visitas_servicio ON visitas_puntos(servicio_id);
CREATE INDEX idx_personas_servicio ON personas_registradas(servicio_id);
CREATE INDEX idx_incautaciones_servicio ON incautaciones(servicio_id);
CREATE INDEX idx_csf_cuartel ON csf_mensual(cuartel_id, anio_vigencia, mes_vigencia);
CREATE INDEX idx_visitas_ord_csf ON csf_visitas_ordenadas(csf_id, fecha_ordenada);
CREATE INDEX idx_alertas_cuartel ON alertas(cuartel_id, visto);
