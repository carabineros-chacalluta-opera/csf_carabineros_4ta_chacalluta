-- ============================================================
-- SISTEMA CSF OPERATIVA — 04_custom_auth.sql
-- Migración: Autenticación personalizada (sin Supabase Auth)
-- Versión: 3.0  |  Sistema intranet — RLS desactivado
-- ============================================================
-- INSTRUCCIONES:
--   Ejecutar en Supabase SQL Editor ANTES de actualizar el código JS.
--   Orden: primero este archivo, luego recargar la app.
-- ============================================================

-- ── 1. DESACTIVAR RLS EN TODAS LAS TABLAS ───────────────────
-- El sistema opera en intranet; la seguridad es a nivel de aplicación.
ALTER TABLE cuarteles               DISABLE ROW LEVEL SECURITY;
ALTER TABLE personal_cuartel        DISABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios                DISABLE ROW LEVEL SECURITY;
ALTER TABLE puntos_territoriales    DISABLE ROW LEVEL SECURITY;
ALTER TABLE servicios               DISABLE ROW LEVEL SECURITY;
ALTER TABLE visitas_puntos          DISABLE ROW LEVEL SECURITY;
ALTER TABLE observaciones_intel     DISABLE ROW LEVEL SECURITY;
ALTER TABLE reportes_inteligencia   DISABLE ROW LEVEL SECURITY;
ALTER TABLE controles_servicio      DISABLE ROW LEVEL SECURITY;
ALTER TABLE incautaciones           DISABLE ROW LEVEL SECURITY;
ALTER TABLE hallazgos_sin_detenido  DISABLE ROW LEVEL SECURITY;
ALTER TABLE personas_registradas    DISABLE ROW LEVEL SECURITY;
ALTER TABLE csf_mensual             DISABLE ROW LEVEL SECURITY;
ALTER TABLE csf_puntos_fvc          DISABLE ROW LEVEL SECURITY;
ALTER TABLE csf_visitas_ordenadas   DISABLE ROW LEVEL SECURITY;
ALTER TABLE idfi_historial          DISABLE ROW LEVEL SECURITY;
ALTER TABLE alertas                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE config_cuartel          DISABLE ROW LEVEL SECURITY;

-- ── 2. MODIFICAR TABLA USUARIOS ──────────────────────────────
-- Eliminar FK a auth.users (ya no se usa Supabase Auth)
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_id_fkey;

-- La columna id sigue siendo UUID primary key, ahora autogenerado
ALTER TABLE usuarios ALTER COLUMN id SET DEFAULT uuid_generate_v4();

-- Nuevos campos para autenticación propia
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre        TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username      TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Índice único sobre username (permite NULL para usuarios legacy)
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_username_uq
  ON usuarios(username) WHERE username IS NOT NULL;

-- ── 3. CORREGIR CONSTRAINT DE ROL ────────────────────────────
-- Agrega 'validador' que faltaba en el schema original (FIX-C02 solo actualizó el JS)
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('comisario', 'administrador', 'digitador', 'validador'));

-- ── 4. GRANTS PARA ROL ANON (clave pública del cliente) ──────
-- Con RLS desactivado, se necesitan permisos explícitos para operaciones de escritura.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO anon;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO anon;

-- ── 5. VERIFICACIÓN ──────────────────────────────────────────
-- Ejecuta esto para confirmar que la migración fue exitosa:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'usuarios' ORDER BY ordinal_position;
