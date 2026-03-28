# Sistema CSF Operativa
## Prefectura Arica Nro. 1 · Carabineros de Chile

Sistema web para la generación y seguimiento de la **Carta de Situación Fronteriza (CSF)** y el cálculo de indicadores **IDFI** (DFP + DFO).

---

## 📋 Requisitos previos

- Cuenta en [Supabase](https://supabase.com) (gratuita)
- Cuenta en [GitHub](https://github.com) (para publicar)
- Navegador moderno (Chrome, Edge, Firefox)

---

## 🚀 Instalación paso a paso

### PASO 1 — Crear proyecto en Supabase

1. Ir a [supabase.com](https://supabase.com) → **New project**
2. Nombre: `csf-arica-pref1`
3. Password base de datos: guardar en lugar seguro
4. Región: **South America (São Paulo)** → más cercana
5. Esperar que el proyecto se cree (~2 minutos)

---

### PASO 2 — Crear las tablas

1. En Supabase → **SQL Editor** → **New query**
2. Copiar y pegar el contenido de `sql/01_schema.sql`
3. Clic en **Run** ✓
4. Nueva query → pegar `sql/02_seed_data.sql` → **Run** ✓
5. Nueva query → pegar `sql/03_rls.sql` → **Run** ✓

Verificar en **Table Editor** que aparecen las 17 tablas.

---

### PASO 3 — Configurar las credenciales

1. En Supabase → **Settings → API**
2. Copiar:
   - **Project URL** (ej: `https://abcdefgh.supabase.co`)
   - **anon public key** (empieza con `eyJ...`)

3. Abrir el archivo `js/config.js` y reemplazar:

```javascript
SUPABASE_URL:      'https://TU_PROYECTO.supabase.co',  // ← pegar aquí
SUPABASE_ANON_KEY: 'TU_ANON_KEY',                       // ← pegar aquí
```

---

### PASO 4 — Crear el primer usuario (Comisario)

1. En Supabase → **Authentication → Users → Invite user**
2. Ingresar el email del Comisario
3. El usuario recibirá un correo para establecer contraseña
4. Obtener el UUID del usuario en **Authentication → Users**
5. En **SQL Editor** ejecutar:

```sql
-- Reemplazar los valores entre comillas simples
INSERT INTO usuarios (id, email, cuartel_id, rol)
VALUES (
  'UUID-DEL-USUARIO-AQUI',
  'comisario@ejemplo.cl',
  (SELECT id FROM cuarteles WHERE codigo = 'CHACALLUTA'),  -- o el cuartel que corresponda
  'comisario'
);
```

**Códigos de cuarteles disponibles:**

| Código       | Cuartel                          |
|--------------|----------------------------------|
| CHACALLUTA   | 4ta. Comisaría Chacalluta (F)    |
| ALCERRECA    | Retén Alcérreca (F)              |
| TACORA       | Retén Tacora (F)                 |
| VISVIRI      | Tenencia Visviri (F)             |
| CAQUENA      | Retén Caquena (F)                |
| CHUNGARA     | Tenencia Chungará (F)            |
| CHUCUYO      | Retén Chucuyo (F)                |
| GUALLATIRE   | Retén Guallatire (F)             |
| CHILCAYA     | Retén Chilcaya (F)               |

---

### PASO 5 — Publicar en GitHub Pages

1. Crear repositorio en GitHub (puede ser privado)
2. Subir todos los archivos de este proyecto
3. En GitHub → **Settings → Pages**
4. Source: **Deploy from a branch → main → / (root)**
5. En ~2 minutos el sistema estará disponible en:
   `https://TU_USUARIO.github.io/NOMBRE_REPO/`

**Alternativa local:** Simplemente abrir `index.html` en el navegador. El sistema funciona sin servidor (solo necesita conexión a Supabase).

---

## 👥 Roles de usuario

| Rol            | Permisos |
|----------------|----------|
| **Comisario**  | Genera y publica CSF, ve dashboard completo, accede a reportes |
| **Administrador** | Carga Excel de servicios, completa servicios, gestiona catálogos |
| **Digitador**  | Completa servicios de su cuartel únicamente |

---

## 📂 Estructura del proyecto

```
csf-system/
├── index.html              ← Entrada principal
├── css/
│   └── csf.css             ← Estilos del sistema
├── js/
│   ├── config.js           ← Configuración (credenciales Supabase aquí)
│   ├── core.js             ← Funciones base y estado global
│   └── pages/
│       ├── login.js        ← Autenticación
│       ├── dashboard.js    ← Dashboard KPIs y alertas
│       ├── servicios.js    ← Lista y formulario de servicios
│       ├── csf.js          ← Generador de CSF
│       ├── reportes.js     ← Reportes operativos
│       └── admin.js        ← Panel de administración
├── sql/
│   ├── 01_schema.sql       ← Crear todas las tablas
│   ├── 02_seed_data.sql    ← Datos iniciales (cuarteles + puntos)
│   └── 03_rls.sql          ← Seguridad por usuario
└── data/
    ├── puntos.json         ← 198 puntos territoriales
    └── cuarteles.json      ← 9 cuarteles normalizados
```

---

## 📊 Flujo operacional

```
Cada día:
  Digitador → Completa servicio del día anterior
           → S1: Marca puntos visitados
           → S2: Registra observaciones intel
           → S3: Ingresa controles ejecutados
           → S4: Registra incautaciones (si hubo)
           → S5: Registra hallazgos sin detenido (si hubo)
           → S6: Registra personas con resultado (si hubo)

Días 1-5 del mes:
  Comisario → Genera CSF del mes siguiente
           → Sistema calcula FVC por punto automáticamente
           → Genera calendario de visitas ordenadas por fecha
           → Comisario revisa y publica

Durante el mes:
  Sistema → Cruza visitas ejecutadas vs CSF publicada
         → Calcula IDFI en tiempo real
         → Genera alertas automáticas (cohecho, NNA, atraso)
```

---

## 🗺 Coordenadas GPS (pendiente)

Los 198 puntos territoriales están cargados **sin coordenadas GPS**.
Para activar el cálculo automático de radio 5km:

1. Ir a **Admin → Puntos territoriales**
2. Editar cada punto y agregar Latitud/Longitud en formato decimal
   - Ejemplo: Latitud `-18.3875`, Longitud `-69.7583`
3. El sistema activará automáticamente la validación de proximidad

**Fuente de coordenadas sugerida:** IGM (Instituto Geográfico Militar) / SAIT

---

## 🔧 Configuración avanzada

### Cambiar FVC base de un punto

En **Admin → Puntos territoriales** → Editar punto → cambiar "FVC base".

### Agregar personal (códigos de funcionario)

En **Admin → Personal** → Agregar código.

### Cambiar instrucciones generales de la CSF

Editar el texto en `js/pages/csf.js`, función `htmlBorrador()`, sección V.

---

## ⚠️ Notas de seguridad

- Las credenciales de Supabase en `config.js` son la **anon key**, que es pública por diseño
- La seguridad real está en las políticas RLS de Supabase (archivo `03_rls.sql`)
- Para producción, considerar agregar dominio autorizado en Supabase → Settings → API → Allowed origins
- El sistema usa `auth.uid()` en todas las policies para aislar datos por usuario

---

## 📞 Soporte técnico

Sistema desarrollado para piloto **4ta. Comisaría Chacalluta (F)** · Inicio: 01-04-2026

Teniente Damián Vergara Cortez — Informe Técnico N°01/2026
