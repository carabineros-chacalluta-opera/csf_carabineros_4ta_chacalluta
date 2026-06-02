-- ============================================================
-- SISTEMA CSF OPERATIVA — 08_setup_completo.sql
-- Setup completo: permisos + cuarteles + credenciales admin
--
-- ✅ SEGURO DE RE-EJECUTAR: usa ON CONFLICT DO NOTHING e IF EXISTS
--
-- INSTRUCCIONES:
--   1. Ir a Supabase Dashboard → SQL Editor
--   2. Pegar TODO este archivo y ejecutar (Run All)
--   3. Revisar los resultados en la sección VERIFICACIÓN al final
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- BLOQUE 1 — DESACTIVAR RLS Y OTORGAR PERMISOS AL ROL ANON
-- (El frontend usa la clave anon de Supabase)
-- ════════════════════════════════════════════════════════════

-- Desactivar Row Level Security en todas las tablas del sistema
DO $$
DECLARE tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END$$;

-- Otorgar permisos completos al rol anon (clave del frontend)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO anon;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA public TO anon;


-- ════════════════════════════════════════════════════════════
-- BLOQUE 1b — COLUMNAS REQUERIDAS POR EL FRONTEND
-- (columnas que el JS escribe y que pueden no estar en el schema original)
-- ════════════════════════════════════════════════════════════

-- visitas_puntos: semana y año para reportes de frecuencia
ALTER TABLE visitas_puntos ADD COLUMN IF NOT EXISTS semana_iso  INTEGER;
ALTER TABLE visitas_puntos ADD COLUMN IF NOT EXISTS anio        INTEGER;
ALTER TABLE visitas_puntos ADD COLUMN IF NOT EXISTS turno       TEXT;

-- reportes_inteligencia: título descriptivo
ALTER TABLE reportes_inteligencia ADD COLUMN IF NOT EXISTS titulo TEXT;

-- servicios: código jefe y folio libro físico (SEC v2.1)
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS codigo_jefe_servicio TEXT;
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS folio_libro_fisico   TEXT;


-- ════════════════════════════════════════════════════════════
-- BLOQUE 2 — ESTRUCTURA DE LA TABLA USUARIOS (auth propia v3.0)
-- ════════════════════════════════════════════════════════════

-- Eliminar FK a auth.users de Supabase (ya no se usa)
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_id_fkey;

-- El id se genera automáticamente
ALTER TABLE usuarios ALTER COLUMN id SET DEFAULT uuid_generate_v4();

-- Columnas para autenticación propia
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre        TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username      TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Índice único en username (nulls permitidos para retrocompatibilidad)
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_username_uq
  ON usuarios(username) WHERE username IS NOT NULL;

-- Constraint de rol actualizado (incluye validador)
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('comisario', 'administrador', 'digitador', 'validador'));


-- ════════════════════════════════════════════════════════════
-- BLOQUE 3 — INSERTAR LOS 9 CUARTELES DE LA PREFECTURA ARICA
-- ON CONFLICT DO NOTHING = seguro si ya existen
-- ════════════════════════════════════════════════════════════

INSERT INTO cuarteles (id, nombre, pais_lpi, activo, created_at, comuna)
VALUES
  ('4655cc0d-5835-4c6c-a5ac-648213bc2eaa', 'RETEN CHUCUYO (F)',            'BOLIVIA', true, now(), 'Putre'),
  ('4ca10274-30c7-4081-92ca-60b0ca7e04b9', 'RETEN TACORA (F)',             'PERÚ',    true, now(), 'Arica'),
  ('5d8818b6-ef19-4a10-8df7-336cd85ba604', '4TA. COMISARIA CHACALLUTA (F)','PERÚ',    true, now(), 'Arica'),
  ('6da25af3-b203-4ce0-a4fb-6041df111d58', 'TENENCIA VISVIRI (F)',         'BOLIVIA', true, now(), 'General Lagos'),
  ('7d155b8c-f5bb-4917-ac1e-91cff4b85aa6', 'RETEN GUALLATIRE (F)',         'BOLIVIA', true, now(), 'Putre'),
  ('8208d4f5-95e1-4773-88e7-d367f466fbb4', 'RETEN CAQUENA (F)',            'BOLIVIA', true, now(), 'Putre'),
  ('883c8cd7-e2a4-4507-9d6e-896a8b802cfc', 'RETEN ALCERRECA (F)',          'PERÚ',    true, now(), 'Arica'),
  ('dbdd8b7a-ddbf-4452-a3f8-f713e813650b', 'RETEN CHILCAYA (F)',           'BOLIVIA', true, now(), 'Colchane'),
  ('f8780288-68dc-44cc-bede-c77121d9e3b0', 'TENENCIA CHUNGARA (F)',        'BOLIVIA', true, now(), 'Putre')
ON CONFLICT (id) DO UPDATE SET
  nombre  = EXCLUDED.nombre,
  activo  = true;


-- ════════════════════════════════════════════════════════════
-- BLOQUE 4 — CREDENCIALES DEL ADMINISTRADOR
-- Busca por email (más robusto que buscar por UUID)
-- Credenciales: username = dvergara / contraseña = Admin2025!
-- ════════════════════════════════════════════════════════════

UPDATE usuarios SET
  nombre        = 'Damián Vergara',
  username      = 'dvergara',
  password_hash = encode(sha256(('Admin2025!' || 'csf_operativa_4ta_chacalluta')::bytea), 'hex'),
  activo        = true,
  cuartel_id    = NULL    -- administrador ve todos los cuarteles
WHERE email = 'damian.vergara@carabineros.cl';

-- Si no existe por email, buscar por rol administrador y actualizar
UPDATE usuarios SET
  username      = COALESCE(username, 'dvergara'),
  password_hash = COALESCE(
    password_hash,
    encode(sha256(('Admin2025!' || 'csf_operativa_4ta_chacalluta')::bytea), 'hex')
  ),
  activo        = true,
  cuartel_id    = NULL
WHERE rol = 'administrador'
  AND (username IS NULL OR password_hash IS NULL);


-- ════════════════════════════════════════════════════════════
-- BLOQUE 5 — VERIFICACIÓN FINAL
-- Deberías ver: 9 cuarteles + usuarios con clave asignada
-- ════════════════════════════════════════════════════════════

-- Ver cuarteles
SELECT
  nombre,
  pais_lpi,
  activo,
  id
FROM cuarteles
ORDER BY nombre;

-- Ver usuarios y estado de credenciales
SELECT
  email,
  nombre,
  username,
  rol,
  activo,
  cuartel_id,
  CASE
    WHEN password_hash IS NOT NULL THEN '✓ Con clave'
    ELSE '⚠ SIN CLAVE'
  END AS estado_clave
FROM usuarios
ORDER BY rol, nombre;

-- Ver permisos del rol anon en tabla cuarteles
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'cuarteles'
  AND grantee = 'anon';
