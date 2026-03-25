-- ============================================================
-- ROW LEVEL SECURITY — Sistema CSF Operativa
-- ============================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE cuarteles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_cuartel        ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios                ENABLE ROW LEVEL SECURITY;
ALTER TABLE puntos_territoriales    ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios               ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas_puntos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE observaciones_intel     ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportes_inteligencia   ENABLE ROW LEVEL SECURITY;
ALTER TABLE controles_servicio      ENABLE ROW LEVEL SECURITY;
ALTER TABLE incautaciones           ENABLE ROW LEVEL SECURITY;
ALTER TABLE hallazgos_sin_detenido  ENABLE ROW LEVEL SECURITY;
ALTER TABLE personas_registradas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE csf_mensual             ENABLE ROW LEVEL SECURITY;
ALTER TABLE csf_puntos_fvc          ENABLE ROW LEVEL SECURITY;
ALTER TABLE csf_visitas_ordenadas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE idfi_historial          ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas                 ENABLE ROW LEVEL SECURITY;

-- Helper: obtener rol del usuario actual
CREATE OR REPLACE FUNCTION get_user_rol()
RETURNS TEXT AS $$
  SELECT rol FROM usuarios WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper: obtener cuartel_id del usuario actual
CREATE OR REPLACE FUNCTION get_user_cuartel()
RETURNS UUID AS $$
  SELECT cuartel_id FROM usuarios WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- ── CUARTELES — lectura para todos ──────────────────────────
CREATE POLICY cuarteles_read ON cuarteles
  FOR SELECT USING (true);

-- ── USUARIOS — cada uno ve el suyo ──────────────────────────
CREATE POLICY usuarios_read_own ON usuarios
  FOR SELECT USING (id = auth.uid());

-- ── PUNTOS — todos los autenticados pueden leer ─────────────
CREATE POLICY puntos_read ON puntos_territoriales
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY puntos_write ON puntos_territoriales
  FOR ALL USING (get_user_rol() IN ('comisario','administrador'));

-- ── SERVICIOS ────────────────────────────────────────────────
-- Comisario ve todos los de sus cuarteles
-- Administrador y digitador ven solo su cuartel
CREATE POLICY servicios_read ON servicios
  FOR SELECT USING (
    get_user_rol() = 'comisario'
    OR cuartel_id = get_user_cuartel()
  );

CREATE POLICY servicios_insert ON servicios
  FOR INSERT WITH CHECK (
    get_user_rol() IN ('administrador','digitador')
    AND cuartel_id = get_user_cuartel()
  );

CREATE POLICY servicios_update ON servicios
  FOR UPDATE USING (
    get_user_rol() IN ('administrador','digitador')
    AND cuartel_id = get_user_cuartel()
  );

-- ── VISITAS, CONTROLES, INCAUTACIONES, HALLAZGOS, PERSONAS ──
-- Mismo patrón: comisario ve todo lo de su cuartel,
-- admin/digitador solo opera en su cuartel

CREATE POLICY visitas_read ON visitas_puntos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM servicios s
      WHERE s.id = servicio_id
      AND (get_user_rol() = 'comisario' OR s.cuartel_id = get_user_cuartel())
    )
  );

CREATE POLICY visitas_write ON visitas_puntos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM servicios s
      WHERE s.id = servicio_id
      AND s.cuartel_id = get_user_cuartel()
      AND get_user_rol() IN ('administrador','digitador')
    )
  );

-- Política reutilizable para tablas hijas de servicios
CREATE POLICY controles_all ON controles_servicio FOR ALL USING (
  EXISTS (SELECT 1 FROM servicios s WHERE s.id = servicio_id
    AND (get_user_rol()='comisario' OR s.cuartel_id=get_user_cuartel()))
);
CREATE POLICY incautaciones_all ON incautaciones FOR ALL USING (
  EXISTS (SELECT 1 FROM servicios s WHERE s.id = servicio_id
    AND (get_user_rol()='comisario' OR s.cuartel_id=get_user_cuartel()))
);
CREATE POLICY hallazgos_all ON hallazgos_sin_detenido FOR ALL USING (
  EXISTS (SELECT 1 FROM servicios s WHERE s.id = servicio_id
    AND (get_user_rol()='comisario' OR s.cuartel_id=get_user_cuartel()))
);
CREATE POLICY personas_all ON personas_registradas FOR ALL USING (
  EXISTS (SELECT 1 FROM servicios s WHERE s.id = servicio_id
    AND (get_user_rol()='comisario' OR s.cuartel_id=get_user_cuartel()))
);
CREATE POLICY obs_intel_all ON observaciones_intel FOR ALL USING (
  EXISTS (SELECT 1 FROM servicios s WHERE s.id = servicio_id
    AND (get_user_rol()='comisario' OR s.cuartel_id=get_user_cuartel()))
);

-- ── CSF — comisario genera y publica, otros solo leen ────────
CREATE POLICY csf_read ON csf_mensual
  FOR SELECT USING (
    cuartel_id = get_user_cuartel()
    OR get_user_rol() = 'comisario'
  );

CREATE POLICY csf_write ON csf_mensual
  FOR ALL USING (
    get_user_rol() = 'comisario'
    AND cuartel_id = get_user_cuartel()
  );

CREATE POLICY csf_puntos_all ON csf_puntos_fvc FOR ALL USING (
  EXISTS (SELECT 1 FROM csf_mensual c WHERE c.id = csf_id
    AND (c.cuartel_id = get_user_cuartel() OR get_user_rol()='comisario'))
);
CREATE POLICY csf_visitas_all ON csf_visitas_ordenadas FOR ALL USING (
  EXISTS (SELECT 1 FROM csf_mensual c WHERE c.id = csf_id
    AND (c.cuartel_id = get_user_cuartel() OR get_user_rol()='comisario'))
);

-- ── ALERTAS — comisario ve las suyas ────────────────────────
CREATE POLICY alertas_read ON alertas
  FOR SELECT USING (
    cuartel_id = get_user_cuartel()
    OR get_user_rol() = 'comisario'
  );

-- ── REPORTES INTELIGENCIA ────────────────────────────────────
CREATE POLICY reportes_all ON reportes_inteligencia FOR ALL USING (
  cuartel_id = get_user_cuartel()
  OR get_user_rol() = 'comisario'
);

-- ── IDFI HISTORIAL ───────────────────────────────────────────
CREATE POLICY idfi_read ON idfi_historial
  FOR SELECT USING (
    cuartel_id = get_user_cuartel()
    OR get_user_rol() = 'comisario'
  );
