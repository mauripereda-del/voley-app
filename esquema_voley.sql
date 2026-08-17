-- =========================================================
-- SISTEMA DE GESTIÓN DE VÓLEY - ESQUEMA DE BASE DE DATOS
-- Motor: PostgreSQL (Supabase)
-- =========================================================
-- Pegar este script completo en Supabase > SQL Editor > New query > Run
-- Usa gen_random_uuid() (extensión pgcrypto, viene activada por defecto en Supabase)

-- =========================================================
-- 0) NÚCLEO: categorías, equipos y perfiles
--    (todos los módulos dependen de estas tablas)
-- =========================================================

create table categoria (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,                 -- ej: "Sub14", "Sub16", "Mayores"
  genero text not null check (genero in ('femenino','masculino')),
  temporada text,                       -- ej: "2026"
  created_at timestamptz default now()
);

create table equipo (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid references categoria(id) on delete cascade,
  nombre text not null,                 -- ej: "Club Atlético X - Sub14 Femenino"
  escudo_url text,
  created_at timestamptz default now()
);

-- perfil extiende a auth.users (tabla interna de Supabase Auth)
create table perfil (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  apellido text not null,
  email text not null,
  telefono text,
  foto_url text,
  fecha_nacimiento date,
  rol text not null check (rol in ('jugador','entrenador','delegado','dirigente','admin')),
  created_at timestamptz default now()
);

create table jugador (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfil(id) on delete cascade,
  equipo_id uuid not null references equipo(id) on delete cascade,
  dorsal int,
  posicion text check (posicion in ('armador','opuesto','central','punta','libero')),
  altura_cm int,
  lado_dominante text check (lado_dominante in ('derecho','izquierdo','ambidiestro')),
  activo boolean default true,
  created_at timestamptz default now(),
  unique (equipo_id, dorsal)
);

create table cuerpo_tecnico (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfil(id) on delete cascade,
  equipo_id uuid not null references equipo(id) on delete cascade,
  cargo text check (cargo in ('DT','asistente','preparador_fisico','utilero','delegado')),
  created_at timestamptz default now()
);

-- =========================================================
-- 1) PLANTEL Y PERFILES
--    (ya cubierto arriba con perfil + jugador + cuerpo_tecnico)
--    agrego datos médicos/contacto de emergencia, típico en planteles
-- =========================================================

create table jugador_ficha_medica (
  jugador_id uuid primary key references jugador(id) on delete cascade,
  grupo_sanguineo text,
  alergias text,
  contacto_emergencia_nombre text,
  contacto_emergencia_telefono text,
  observaciones text,
  updated_at timestamptz default now()
);

-- =========================================================
-- 2) MENSAJERÍA
-- =========================================================

create table conversacion (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('individual','grupal')),
  equipo_id uuid references equipo(id) on delete cascade, -- null si es individual
  nombre text,                          -- ej: "Grupo Sub16 Femenino"
  created_by uuid references perfil(id),
  created_at timestamptz default now()
);

create table conversacion_participante (
  conversacion_id uuid references conversacion(id) on delete cascade,
  perfil_id uuid references perfil(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (conversacion_id, perfil_id)
);

create table mensaje (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversacion(id) on delete cascade,
  remitente_id uuid not null references perfil(id),
  contenido text,
  adjunto_url text,
  created_at timestamptz default now()
);

create table mensaje_leido (
  mensaje_id uuid references mensaje(id) on delete cascade,
  perfil_id uuid references perfil(id) on delete cascade,
  leido_at timestamptz default now(),
  primary key (mensaje_id, perfil_id)
);

-- =========================================================
-- 3) CALENDARIO
-- =========================================================

create table evento (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipo(id) on delete cascade,
  tipo text not null check (tipo in ('entrenamiento','partido','reunion','otro')),
  titulo text not null,
  descripcion text,
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz,
  lugar text,
  direccion text,
  created_by uuid references perfil(id),
  created_at timestamptz default now()
);

-- =========================================================
-- 4) CONVOCATORIA Y PRESENCIAS
-- =========================================================

create table convocatoria (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null unique references evento(id) on delete cascade,
  creado_por uuid references perfil(id),
  fecha_limite_confirmacion timestamptz,
  created_at timestamptz default now()
);

create table convocatoria_jugador (
  convocatoria_id uuid references convocatoria(id) on delete cascade,
  jugador_id uuid references jugador(id) on delete cascade,
  confirmacion text default 'pendiente' check (confirmacion in ('pendiente','confirmado','rechazado')),
  motivo_rechazo text,
  respondido_at timestamptz,
  primary key (convocatoria_id, jugador_id)
);

create table asistencia (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references evento(id) on delete cascade,
  jugador_id uuid not null references jugador(id) on delete cascade,
  estado text not null check (estado in ('presente','ausente','tarde','justificado')),
  observacion text,
  registrado_por uuid references perfil(id),
  registrado_at timestamptz default now(),
  unique (evento_id, jugador_id)
);

-- =========================================================
-- 5) ALINEACIONES DE EQUIPO
--    (referencia partido_id que se crea en el módulo 7)
-- =========================================================

create table alineacion (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null,             -- fk se agrega al final (ver sección 11)
  equipo_id uuid not null references equipo(id) on delete cascade,
  set_numero int not null,
  created_by uuid references perfil(id),
  created_at timestamptz default now(),
  unique (partido_id, equipo_id, set_numero)
);

create table alineacion_jugador (
  alineacion_id uuid references alineacion(id) on delete cascade,
  jugador_id uuid references jugador(id) on delete cascade,
  posicion_cancha int check (posicion_cancha between 1 and 6), -- rotación 1-6
  es_titular boolean default true,
  es_libero boolean default false,
  primary key (alineacion_id, jugador_id)
);

-- =========================================================
-- 6) GESTIÓN DE TAREAS
-- =========================================================

create table tarea (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipo(id) on delete cascade,
  titulo text not null,
  descripcion text,
  asignado_a uuid references perfil(id),
  asignado_por uuid references perfil(id),
  prioridad text default 'media' check (prioridad in ('baja','media','alta')),
  estado text default 'pendiente' check (estado in ('pendiente','en_progreso','completada')),
  fecha_vencimiento date,
  created_at timestamptz default now()
);

-- =========================================================
-- 7) CAMPEONATOS
-- =========================================================

create table campeonato (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria_id uuid references categoria(id),
  tipo text check (tipo in ('liga','copa','eliminacion_directa')),
  fecha_inicio date,
  fecha_fin date,
  organizador text,
  created_at timestamptz default now()
);

create table campeonato_equipo (
  campeonato_id uuid references campeonato(id) on delete cascade,
  equipo_id uuid references equipo(id) on delete cascade,
  grupo text,
  puntos int default 0,
  partidos_jugados int default 0,
  partidos_ganados int default 0,
  partidos_perdidos int default 0,
  sets_a_favor int default 0,
  sets_en_contra int default 0,
  primary key (campeonato_id, equipo_id)
);

create table partido (
  id uuid primary key default gen_random_uuid(),
  campeonato_id uuid references campeonato(id) on delete cascade,
  equipo_local_id uuid references equipo(id),
  equipo_visitante_id uuid references equipo(id),
  rival_externo text,                   -- si el rival no está cargado como equipo
  fecha timestamptz not null,
  lugar text,
  estado text default 'programado' check (estado in ('programado','en_curso','finalizado','suspendido')),
  sets_local int default 0,
  sets_visitante int default 0,
  created_at timestamptz default now()
);

-- ahora sí, conecta alineacion con partido (definida en módulo 5)
alter table alineacion
  add constraint alineacion_partido_fk foreign key (partido_id) references partido(id) on delete cascade;

-- =========================================================
-- 8) ESTADÍSTICAS Y LIVE STATS
-- =========================================================

-- registro de cada acción de juego en tiempo real (para live stats)
create table accion_partido (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references partido(id) on delete cascade,
  set_numero int not null,
  jugador_id uuid references jugador(id),
  tipo_accion text not null check (tipo_accion in ('saque','ataque','bloqueo','recepcion','defensa','asistencia')),
  resultado text not null check (resultado in ('punto','error','continua')),
  registrado_at timestamptz default now()
);

-- resultado de cada set (se recalcula o se guarda al cerrar el set)
create table set_partido (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references partido(id) on delete cascade,
  set_numero int not null,
  puntos_local int default 0,
  puntos_visitante int default 0,
  ganador text check (ganador in ('local','visitante')),
  unique (partido_id, set_numero)
);

-- Nota: las estadísticas agregadas por jugador (puntos totales, % de recepción,
-- etc.) se calculan mejor con una VIEW sobre accion_partido en vez de guardarlas
-- duplicadas. Ejemplo de vista:
--
-- create view vista_estadisticas_jugador as
-- select jugador_id, partido_id,
--   count(*) filter (where tipo_accion='ataque' and resultado='punto') as puntos_ataque,
--   count(*) filter (where tipo_accion='saque' and resultado='punto') as aces,
--   count(*) filter (where tipo_accion='bloqueo' and resultado='punto') as bloqueos,
--   count(*) filter (where resultado='error') as errores
-- from accion_partido
-- group by jugador_id, partido_id;

-- =========================================================
-- 9) EL POST PARTIDO
-- =========================================================

create table post_partido (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null unique references partido(id) on delete cascade,
  resumen text,
  mvp_jugador_id uuid references jugador(id),
  fotos_urls text[],                    -- paths en el bucket post-partido
  video_url text,
  notas_entrenador text,
  created_by uuid references perfil(id),
  created_at timestamptz default now()
);

create table post_partido_comentario (
  id uuid primary key default gen_random_uuid(),
  post_partido_id uuid not null references post_partido(id) on delete cascade,
  perfil_id uuid references perfil(id),
  comentario text not null,
  created_at timestamptz default now()
);

-- =========================================================
-- 10) COTIZACIONES Y COLECTAS
-- =========================================================

create table cuota (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipo(id) on delete cascade,
  concepto text not null,               -- ej: "Cuota mensual Agosto 2026"
  monto numeric(10,2) not null,
  fecha_vencimiento date,
  created_at timestamptz default now()
);

create table cuota_pago (
  id uuid primary key default gen_random_uuid(),
  cuota_id uuid not null references cuota(id) on delete cascade,
  jugador_id uuid not null references jugador(id) on delete cascade,
  monto_pagado numeric(10,2) not null,
  fecha_pago date default current_date,
  metodo_pago text check (metodo_pago in ('efectivo','transferencia','otro')),
  comprobante_url text,
  estado text default 'pagado' check (estado in ('pendiente','pagado','parcial')),
  registrado_por uuid references perfil(id),
  created_at timestamptz default now()
);

create table colecta (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipo(id) on delete cascade,
  nombre text not null,                 -- ej: "Viaje a torneo regional"
  descripcion text,
  meta_monto numeric(10,2),
  fecha_inicio date,
  fecha_fin date,
  estado text default 'activa' check (estado in ('activa','cerrada')),
  created_at timestamptz default now()
);

create table colecta_aporte (
  id uuid primary key default gen_random_uuid(),
  colecta_id uuid not null references colecta(id) on delete cascade,
  perfil_id uuid references perfil(id),
  nombre_externo text,                  -- empresa / sponsor sin cuenta en la app
  monto numeric(10,2) not null,
  fecha_aporte date default current_date,
  metodo_pago text check (metodo_pago in ('efectivo','transferencia','otro')),
  created_at timestamptz default now()
);

-- =========================================================
-- 11) ÍNDICES ÚTILES (mejoran velocidad de las consultas más comunes)
-- =========================================================

create index idx_jugador_equipo on jugador(equipo_id);
create index idx_evento_equipo_fecha on evento(equipo_id, fecha_inicio);
create index idx_mensaje_conversacion on mensaje(conversacion_id, created_at);
create index idx_accion_partido on accion_partido(partido_id, set_numero);
create index idx_asistencia_evento on asistencia(evento_id);
create index idx_cuota_equipo on cuota(equipo_id);
create index idx_cuota_pago_cuota on cuota_pago(cuota_id);
create index idx_colecta_equipo on colecta(equipo_id);
create index idx_colecta_aporte_colecta on colecta_aporte(colecta_id);
