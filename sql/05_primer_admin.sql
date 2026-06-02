-- ============================================================
-- SISTEMA CSF OPERATIVA — 05_primer_admin.sql
-- Propósito: Configurar credenciales de acceso tras migración v3.0
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================
-- IMPORTANTE: Ejecutar DESPUÉS de 04_custom_auth.sql
-- ============================================================

-- ── PASO 1: Ver qué usuarios existen actualmente ─────────────
-- Ejecuta esto primero para saber con qué trabajar:
SELECT id, email, rol, cuartel_id, activo, nombre, username, password_hash
FROM usuarios
ORDER BY rol, email;

-- ── PASO 2A: Actualizar usuarios EXISTENTES ──────────────────
-- Si ya tienes usuarios creados vía Supabase Auth, asígnales
-- username y contraseña. Reemplaza los valores entre comillas.
--
-- IMPORTANTE: Cambia 'MI_PASSWORD_AQUI' por la contraseña real.
-- El hash se calcula igual que en el JS del sistema.

/*
UPDATE usuarios
SET
  nombre        = 'Nombre Completo del Usuario',
  username      = 'nombre_usuario',              -- sin espacios, sin mayúsculas
  password_hash = encode(sha256(('MI_PASSWORD_AQUI' || 'csf_operativa_4ta_chacalluta')::bytea), 'hex')
WHERE email = 'correo@carabineros.cl';
*/

-- Ejemplo real (descomenta y edita):
-- UPDATE usuarios
-- SET
--   nombre        = 'Admin Principal',
--   username      = 'admin',
--   password_hash = encode(sha256(('admin123' || 'csf_operativa_4ta_chacalluta')::bytea), 'hex')
-- WHERE email = 'tu-email@ejemplo.com';


-- ── PASO 2B: Crear usuario ADMINISTRADOR desde cero ──────────
-- Usa esto si NO tienes usuarios previos o quieres crear uno nuevo.
-- Reemplaza los valores según corresponda.

/*
INSERT INTO usuarios (id, email, cuartel_id, rol, activo, nombre, username, password_hash)
VALUES (
  uuid_generate_v4(),
  'admin@csf.cl',          -- email de referencia (no se usa para login)
  NULL,                    -- NULL = ve todos los cuarteles (administrador)
  'administrador',
  true,
  'Administrador Principal',
  'admin',                 -- este es el usuario para el login
  encode(sha256(('admin123' || 'csf_operativa_4ta_chacalluta')::bytea), 'hex')
  --                         ^^^^^^^^^ cambia esta contraseña
);
*/


-- ── PASO 3: Verificar que quedó bien ─────────────────────────
-- Después de ejecutar el paso 2A o 2B, verifica con esto:
/*
SELECT id, nombre, username, rol, activo,
       CASE WHEN password_hash IS NULL THEN 'SIN CLAVE ⚠' ELSE 'Con clave ✓' END AS estado_clave
FROM usuarios
ORDER BY rol;
*/


-- ── REFERENCIA: Tabla de contraseñas para varios usuarios ────
-- Si tienes varios usuarios, puedes actualizar todos de una vez:
/*
UPDATE usuarios SET nombre='Juan Pérez',   username='jperez',  password_hash=encode(sha256(('Clave123' || 'csf_operativa_4ta_chacalluta')::bytea),'hex') WHERE email='jperez@ejemplo.com';
UPDATE usuarios SET nombre='Ana García',   username='agarcia', password_hash=encode(sha256(('Clave456' || 'csf_operativa_4ta_chacalluta')::bytea),'hex') WHERE email='agarcia@ejemplo.com';
UPDATE usuarios SET nombre='Carlos López', username='clopez',  password_hash=encode(sha256(('Clave789' || 'csf_operativa_4ta_chacalluta')::bytea),'hex') WHERE email='clopez@ejemplo.com';
*/
