-- ============================================================
-- DATOS INICIALES — Cuarteles y Puntos Territoriales
-- Prefectura Arica Nro. 1
-- ============================================================

-- ── CUARTELES ───────────────────────────────────────────────
INSERT INTO cuarteles (nombre, codigo, pais_limitrofe) VALUES
  ('4TA. COMISARIA CHACALLUTA (F)', 'CHACALLUTA', 'PERU'),
  ('RETEN ALCERRECA (F)',           'ALCERRECA',  'PERU'),
  ('RETEN TACORA (F)',              'TACORA',     'PERU'),
  ('TENENCIA VISVIRI (F)',          'VISVIRI',    'PERU/BOLIVIA'),
  ('RETEN CAQUENA (F)',             'CAQUENA',    'BOLIVIA'),
  ('TENENCIA CHUNGARA (F)',         'CHUNGARA',   'BOLIVIA'),
  ('RETEN CHUCUYO (F)',             'CHUCUYO',    'BOLIVIA'),
  ('RETEN GUALLATIRE (F)',          'GUALLATIRE', 'BOLIVIA'),
  ('RETEN CHILCAYA (F)',            'CHILCAYA',   'BOLIVIA');

-- ── HITOS — 4TA. COMISARIA CHACALLUTA ───────────────────────
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, nombre_completo, pais_limitrofe, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 1','Orilla del Mar','PERÚ','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 2','Borde Pampa de Escritos frente al mar','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 3','Pampa de Escritos al Oeste del FC de Arica a Tacna','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 4','Pampa de Escritos al Oeste del FC de Arica a Tacna','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 5','Pampa de Escritos al Oeste del FC de Arica a Tacna','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 6','Pampa de Escritos al Oeste del FC de Arica a Tacna','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 7','Pampa de Escritos al Oeste del FC de Arica a Tacna','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 8','Pampa de Escritos al Oeste del FC de Arica a Tacna','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 9','Pampa de Escritos a 84 m Oeste FC Arica a Tacna','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 10','Pampa de Escritos al Este FC Arica a Tacna','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 11','Pampa de Escritos cerca camino de Arica a Tacna','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 12','Pampa de Escritos al Este camino de Arica a Tacna','PERÚ','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 13','Quebrada de Escritos','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 14','Quebrada Escritos, margen norte del cause seco','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 15','Falda cerro sur quebrada Escritos en salinas','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 16','Cumbre cerro sur quebrada Escritos','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 17','Meseta arenosa entre queb Escritos y Gallinazos','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 18','Cumbre cerro norte quebrada Gallinazos','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 19','Colina en quebrada gallinazos, lado norte','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 20','Borde Co Vecino ramal hacia el N queb de Gallinazos','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 21','Meseta al norte quebrada Concordia','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 22','Meseta al norte quebrada Concordia','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 23','Meseta al norte quebrada Concordia','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 24','Fondo quebrada Concordia','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 25','Meseta accidentada al Norte Est Central Arica a La Paz','PERÚ','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 26','Meseta accidentada al Norte Est Central Arica a La Paz','PERÚ','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 27','Meseta accidentada al Norte Est Central Arica a La Paz','PERÚ','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 28','Cuesta el Aguila cerca de paso a nivel','PERÚ','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 29','Fondo quebrada Lluta','PERÚ','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'hito','Hito 30','Falda cerro norte quebrada Lluta','PERÚ','mensual','medio');

-- ── PNH — 4TA. COMISARIA CHACALLUTA ─────────────────────────
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, nombre_completo, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 1','HITO 1','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 2','HITO 2','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 3','HITO 3','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 4','HITO 4','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 5','HITO 5','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 6','HITO 6','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 7','HITO 7','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 8','HITO 8','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 9','HITO 9','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 10','HITO 10','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 11','HITO 11','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 12','HITO 12','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 13','HITO 13','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 14','HITO 14','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 15','HITO 15','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 16','HITO 16','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 17','HITO 17','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 19','HITO 19','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 20','HITO 20','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'pnh','PNH Hito 21','HITO 21','semanal','alto');

-- ── SFI — 4TA. COMISARIA CHACALLUTA ─────────────────────────
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, nombre_completo, tipo_sfi, referencia, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'sie','Complejo Fronterizo Chacalluta','COMPLEJO FRONTERIZO CHACALLUTA','COMPLEJO FRONTERIZO','LPI CON EL PAIS DE PERU','semanal','critico'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'sie','Aeropuerto Chacalluta','AEROPUERTO CHACALLUTA INTERNACIONAL','AEROPUERTO','LPI CON EL PAIS DE PERU','quincenal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'sie','Estación FF.CC. Pampa Ossa','ESTACION DE FERROCARRILES ARICA - LA PAZ, ESTACION PAMPA OSSA','ESTACION FF.CC.','KILOMETRO 93 LINEA FERREA RUTA A-13','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'sie','Estación FF.CC. Puquio','ESTACION DE FERROCARRILES ARICA - LA PAZ, ESTACION PUQUIO','ESTACION FF.CC.','KILOMETRO 113 LINEA FERREA RUTA A-13','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHACALLUTA'),'sie','Antena ENTEL','ANTENA ENTEL','ANTENA COMUNICACIONES','RUTA A-135 KM. 45','mensual','bajo');

-- ── HITOS — RETEN ALCERRECA ──────────────────────────────────
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, nombre_completo, pais_limitrofe, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 31','Loma al Norte Quebrada Honda','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 32','Falda cerro norte quebrada Honda','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 33','Cumbre del cerro entre quebradas Honda y Escritos','PERÚ','semanal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 34','Cuesta Honda, falda norte','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 35','Pampa Cañahua en los Llanos de Arica','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 36','Llanos de Arica','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 37','Llanos de Arica','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 38','Llanos de Arica','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 39','Llanos de Arica - Humo','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 40','Llanos de Arica - Humo','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 41','Llanos de Arica - Humo','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 42','Llanos de Arica - Humo','PERÚ','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 43','Llanos de Arica - Humo','PERÚ','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 44','Llanos de Arica - Humo','PERÚ','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 45','Llanos de Arica','PERÚ','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 46','Llanos de Arica','PERÚ','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'hito','Hito 47','Llanos de Arica','PERÚ','mensual','medio');

-- PNH Alcerreca
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, nombre_completo, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'pnh','PNH Huichicolla','PASO NO HABILITADO HUICHICOLLA','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'pnh','PNH Lampallares','PASO NO HABILITADO LAMPALLARES','semanal','alto');

-- SFI Alcerreca (4 registros del excel)
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'sie','SFI Alcerreca 1','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'sie','SFI Alcerreca 2','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'sie','SFI Alcerreca 3','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='ALCERRECA'),'sie','SFI Alcerreca 4','mensual','medio');

-- ── PNH TACORA ───────────────────────────────────────────────
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, nombre_completo, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='TACORA'),'pnh','PNH Aguas Calientes','PASO NO HABILITADO AGUAS CALIENTES','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='TACORA'),'pnh','PNH Laguna Blanca','PASO NO HABILITADO LAGUNA BLANCA','semanal','alto');

-- ── PNH VISVIRI ──────────────────────────────────────────────
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, nombre_completo, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'pnh','PNH Hito 69','HITO 69','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'pnh','PNH Hito 77','HITO 77','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'pnh','PNH Visviri Norte','PASO NO HABILITADO VISVIRI NORTE','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'pnh','PNH Visviri Sur','PASO NO HABILITADO VISVIRI SUR','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'pnh','PNH Cosapilla','PASO NO HABILITADO COSAPILLA','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'pnh','PNH Colpita','PASO NO HABILITADO COLPITA','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'pnh','PNH Chujlluta','PASO NO HABILITADO CHUJLLUTA','quincenal','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'pnh','PNH Guacollo','PASO NO HABILITADO GUACOLLO','quincenal','medio');

-- SFI Visviri
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, nombre_completo, tipo_sfi, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'sie','Posta Rural Visviri','POSTA RURAL VISVIRI','CENTRO SALUD','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'sie','Complejo Fronterizo Visviri','COMPLEJO FRONTERIZO VISVIRI','COMPLEJO FRONTERIZO','semanal','critico'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'sie','Estación Ferroviaria Visviri','ESTACION FERROVIARIA ARICA-LA PAZ','ESTACION FF.CC.','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'sie','Oleoducto Sica-Sica','OLEODUCTO SICA-SICA','OLEODUCTO','quincenal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'sie','Municipalidad Gral. Lagos','MUNICIPALIDAD DE GENERAL LAGOS','SERVICIO MUNICIPAL','mensual','bajo'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'sie','Registro Civil Visviri','REGISTRO CIVIL VISVIRI','SERVICIO PUBLICO','mensual','bajo'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'sie','Antena Mirador Telecom','ANTENA MIRADOR TELECOMUNICACIONES','ANTENA COMUNICACIONES','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'sie','Plaza Visviri','PLAZA POBLADO VISVIRI','PLAZA VISVIRI','mensual','bajo'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'sie','Escuela Internado Visviri','ESCUELA INTERNADO DE VISVIRI','EST. EDUCACIONAL','mensual','bajo'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'sie','Escuela Chujlluta','ESCUELA POBLADO CHUJLLUTA','EST. EDUCACIONAL','mensual','bajo'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'sie','Escuela Colpita','ESCUELA COLPITA','EST. EDUCACIONAL','mensual','bajo'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'sie','Escuela Guacollo','ESCUELA GUACOLLO','EST. EDUCACIONAL','mensual','bajo'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'sie','Escuela Cosapilla','ESCUALA COSAPILLA','EST. EDUCACIONAL','mensual','bajo'),
  ((SELECT id FROM cuarteles WHERE codigo='VISVIRI'),'sie','Plaza Visviri 2','PLAZA VISVIRI 2','PLAZA','mensual','bajo');

-- SFI Chungará
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, nombre_completo, tipo_sfi, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='CHUNGARA'),'sie','Complejo Fronterizo Chungará','COMPLEJO FRONTERIZO CHUNGARA','COMPLEJO FRONTERIZO','semanal','critico');

-- SFI Chucuyo
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, nombre_completo, tipo_sfi, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='CHUCUYO'),'sie','Iglesia Parinacota','IGLESIA PARINACOTA','IGLESIA','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHUCUYO'),'sie','Laguna Cotacotani','LAGUNA COTACOTANI','LAGUNA / LAGO','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='CHUCUYO'),'sie','Mirador Los Payachata','MIRADOR LOS PAYACHATA','ATRACTIVO TURISTICO','mensual','bajo'),
  ((SELECT id FROM cuarteles WHERE codigo='CHUCUYO'),'sie','Parque Nacional Lauca','PARQUE NACIONAL LAUCA','PARQUE NACIONAL','quincenal','alto');

-- SFI Guallatire
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, nombre_completo, tipo_sfi, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='GUALLATIRE'),'sie','Puente Río Lauca','PUENTE RIO LAUCA','PUENTE','quincenal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='GUALLATIRE'),'sie','Reserva Natural Las Vicuñas','RESERVA NATURAL LAS VICUÑAS','RESERVA NATURAL','mensual','medio'),
  ((SELECT id FROM cuarteles WHERE codigo='GUALLATIRE'),'sie','Iglesia Guallatire','IGLESIA DE LA INMACULADA CONCEPCION DE GUALLATIRE','IGLESIA','mensual','bajo');

-- PNH Guallatire
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='GUALLATIRE'),'pnh','PNH Guallatire 1','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='GUALLATIRE'),'pnh','PNH Guallatire 2','semanal','alto');

-- PNH Caquena
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='CAQUENA'),'pnh','PNH Caquena 1','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CAQUENA'),'pnh','PNH Caquena 2','semanal','alto');

-- PNH Chungará
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='CHUNGARA'),'pnh','PNH Chungará 1','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHUNGARA'),'pnh','PNH Chungará 2','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHUNGARA'),'pnh','PNH Chungará 3','semanal','alto');

-- PNH Chilcaya
INSERT INTO puntos_territoriales (cuartel_id, tipo, nombre, fvc_base, valor_estrategico) VALUES
  ((SELECT id FROM cuarteles WHERE codigo='CHILCAYA'),'pnh','PNH Chilcaya 1','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHILCAYA'),'pnh','PNH Chilcaya 2','semanal','alto'),
  ((SELECT id FROM cuarteles WHERE codigo='CHILCAYA'),'pnh','PNH Chilcaya 3','semanal','alto');
