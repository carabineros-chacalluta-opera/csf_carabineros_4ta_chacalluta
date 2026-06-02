-- ============================================================
-- SISTEMA CSF OPERATIVA — 07_recuperar_admin.sql
-- Recuperar acceso del administrador y verificar estado.
--
-- INSTRUCCIONES:
--   1. Ir a Supabase Dashboard → SQL Editor
--   2. Pegar TODO este archivo y ejecutar (Run All)
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- PASO 1 — Ver todos los usuarios actuales
-- ════════════════════════════════════════════════════════════
SELECT
  id,
  email,
  nombre,
  username,
  rol,
  activo,
  cuartel_id,
  CASE WHEN password_hash IS NOT NULL THEN 'Con clave ✓' ELSE 'SIN CLAVE ⚠' END AS estado_clave
FROM usuarios
ORDER BY rol, nombre;


-- ════════════════════════════════════════════════════════════
-- PASO 2 — Asignar credenciales al administrador
-- Busca por EMAIL (más seguro que por UUID fijo)
-- Credenciales: username = dvergara / contraseña = Admin2025!
-- ════════════════════════════════════════════════════════════
UPDATE usuarios SET
  nombre        = 'Damián Vergara',
  username      = 'dvergara',
  password_hash = encode(sha256(('Admin2025!' || 'csf_operativa_4ta_chacalluta')::bytea), 'hex'),
  activo        = true
WHERE email = 'damian.vergara@carabineros.cl';


-- ════════════════════════════════════════════════════════════
-- PASO 3 — Asegurarse que cuartel_id sea NULL para el admin
-- (admin sin cuartel asignado = puede ver todos)
-- ════════════════════════════════════════════════════════════
UPDATE usuarios SET
  cuartel_id = NULL
WHERE email = 'damian.vergara@carabineros.cl'
  AND rol   = 'administrador';


-- ════════════════════════════════════════════════════════════
-- PASO 4 — Verificar cuarteles cargados en la BD
-- (debe mostrar los 9 cuarteles de la Prefectura)
-- ════════════════════════════════════════════════════════════
SELECT id, nombre, activo FROM cuarteles ORDER BY nombre;


-- ════════════════════════════════════════════════════════════
-- PASO 5 — Verificación final de credenciales
-- ════════════════════════════════════════════════════════════
SELECT
  email,
  nombre,
  username,
  rol,
  activo,
  cuartel_id,
  CASE WHEN password_hash IS NOT NULL THEN 'Con clave ✓' ELSE 'SIN CLAVE ⚠' END AS estado_clave
FROM usuarios
WHERE email = 'damian.vergara@carabineros.cl';
