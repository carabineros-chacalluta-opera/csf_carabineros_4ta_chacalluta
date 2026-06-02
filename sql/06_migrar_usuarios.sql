-- ============================================================
-- SISTEMA CSF OPERATIVA — 06_migrar_usuarios.sql
-- Migración completa de la tabla usuarios al nuevo sistema
-- de autenticación propio (v3.0 sin Supabase Auth).
--
-- INSTRUCCIONES:
--   1. Ir a Supabase Dashboard → SQL Editor
--   2. Pegar TODO este archivo y ejecutar (Run All)
--   3. Revisar el resultado al final (sección VERIFICACIÓN)
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- BLOQUE 1 — MODIFICAR ESTRUCTURA DE LA TABLA USUARIOS
-- (Si ya corriste 04_custom_auth.sql, este bloque es seguro
--  de correr de nuevo — usa IF NOT EXISTS / IF EXISTS)
-- ════════════════════════════════════════════════════════════

-- Desactivar RLS (sistema intranet)
ALTER TABLE usuarios DISABLE ROW LEVEL SECURITY;

-- Eliminar FK a auth.users de Supabase (ya no se usa)
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_id_fkey;

-- El id ahora se genera automáticamente si no se indica
ALTER TABLE usuarios ALTER COLUMN id SET DEFAULT uuid_generate_v4();

-- Nuevas columnas para auth propia
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre        TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username      TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Índice único: un username por usuario (nulls permitidos para retrocompat.)
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_username_uq
  ON usuarios(username) WHERE username IS NOT NULL;

-- Corregir constraint de rol para incluir 'validador'
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('comisario', 'administrador', 'digitador', 'validador'));

-- Grants para que la clave anon (frontend) pueda operar con RLS desactivado
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO anon;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO anon;


-- ════════════════════════════════════════════════════════════
-- BLOQUE 2 — ASIGNAR CREDENCIALES A USUARIOS EXISTENTES
-- Usuarios detectados en la BD:
--   1. damian.vergara@carabineros.cl  — administrador
--   2. spfarica@carabineros.cl        — validador
--
-- PERSONALIZA las contraseñas antes de ejecutar.
-- El hash se calcula con: SHA256(contraseña + 'csf_operativa_4ta_chacalluta')
-- ════════════════════════════════════════════════════════════

-- ── Usuario 1: Administrador (Damián Vergara) ────────────────
UPDATE usuarios SET
  nombre        = 'Damián Vergara',
  username      = 'dvergara',
  password_hash = encode(sha256(('Admin2025!' || 'csf_operativa_4ta_chacalluta')::bytea), 'hex')
WHERE id = '40f839cf-7c6b-4b81-baed-581cc0bac667';
-- ↑ Contraseña asignada: Admin2025!
-- ↑ Cámbiala antes de ejecutar si prefieres otra.

-- ── Usuario 2: Validador (SPF Arica) ────────────────────────
UPDATE usuarios SET
  nombre        = 'SPF Arica',
  username      = 'spfarica',
  password_hash = encode(sha256(('Spf2025!' || 'csf_operativa_4ta_chacalluta')::bytea), 'hex')
WHERE id = '4addaaf3-bc36-44c2-a8b0-7881ed680d59';
-- ↑ Contraseña asignada: Spf2025!


-- ════════════════════════════════════════════════════════════
-- BLOQUE 3 — AGREGAR NUEVOS USUARIOS (plantilla)
-- Descomenta y repite según necesites.
-- Roles válidos: 'administrador' | 'comisario' | 'digitador' | 'validador'
-- cuartel_id: NULL = ve todos los cuarteles (solo para admin/comisario/validador)
--
-- IDs de cuarteles disponibles:
--   4TA. COMISARIA CHACALLUTA  → 5d8818b6-ef19-4a10-8df7-336cd85ba604
--   TENENCIA VISVIRI           → 6da25af3-b203-4ce0-a4fb-6041df111d58
--   TENENCIA CHUNGARA          → f8780288-68dc-44cc-bede-c77121d9e3b0
--   RETEN CHUCUYO              → 4655cc0d-5835-4c6c-a5ac-648213bc2eaa
--   RETEN TACORA               → 4ca10274-30c7-4081-92ca-60b0ca7e04b9
--   RETEN GUALLATIRE           → 7d155b8c-f5bb-4917-ac1e-91cff4b85aa6
--   RETEN CAQUENA              → 8208d4f5-95e1-4773-88e7-d367f466fbb4
--   RETEN ALCERRECA            → 883c8cd7-e2a4-4507-9d6e-896a8b802cfc
--   RETEN CHILCAYA             → dbdd8b7a-ddbf-4452-a3f8-f713e813650b
-- ════════════════════════════════════════════════════════════

/*
INSERT INTO usuarios (id, email, cuartel_id, rol, activo, nombre, username, password_hash)
VALUES (
  uuid_generate_v4(),
  'nuevo@carabineros.cl',
  '5d8818b6-ef19-4a10-8df7-336cd85ba604',   -- cuartel_id (NULL si no tiene cuartel fijo)
  'digitador',                                -- rol
  true,
  'Nombre Apellido',                          -- nombre completo
  'nusuario',                                 -- username para login
  encode(sha256(('Clave123!' || 'csf_operativa_4ta_chacalluta')::bytea), 'hex')
  --                ↑ contraseña inicial
);
*/


-- ════════════════════════════════════════════════════════════
-- BLOQUE 4 — VERIFICACIÓN FINAL
-- Ejecuta esto al final para confirmar que todo quedó bien.
-- Debes ver: nombre ✓, username ✓, estado_clave = 'Con clave ✓'
-- ════════════════════════════════════════════════════════════

SELECT
  email,
  nombre,
  username,
  rol,
  activo,
  CASE
    WHEN password_hash IS NOT NULL THEN 'Con clave ✓'
    ELSE 'SIN CLAVE ⚠'
  END AS estado_clave,
  cuartel_id
FROM usuarios
ORDER BY rol, nombre;
