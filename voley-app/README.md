# Club Vóley — Gestión de plantel

Frontend estático (HTML/CSS/JS) conectado a Supabase. Incluye login/registro, **Plantel y perfiles**, **Mensajería**, **Calendario**, **Convocatorias y presencias**, **Alineaciones**, **Tareas**, **Campeonatos**, **Estadísticas**, **Post partido** y **Cuotas y colectas**.

## 1. Conectar con tu proyecto de Supabase

Abrí `js/supabaseClient.js` y reemplazá:

```js
const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "TU-ANON-KEY";
```

Estos dos datos están en tu proyecto de Supabase → **Project Settings → API** (usá la clave **anon public**, nunca la `service_role`).

## 2. Correr el trigger de registro

Si todavía no lo corriste, andá a Supabase → SQL Editor y ejecutá `auth_trigger.sql` (está en la carpeta raíz del proyecto, junto a este README). Esto hace que al registrarse un usuario, se le cree automáticamente su fila en `perfil`.

## 3. Confirmación de email (opcional para pruebas)

Por defecto Supabase pide confirmar el email antes de poder iniciar sesión. Para probar más rápido en desarrollo: Supabase → Authentication → Providers → Email → desactivá "Confirm email". Para producción, dejalo activado.

## 4. Cargar categorías y equipos de prueba

El selector de "Plantel" necesita al menos una categoría y un equipo cargados. Podés insertarlos manualmente desde Supabase → Table Editor, o con SQL:

```sql
insert into categoria (nombre, genero, temporada) values ('Sub16', 'femenino', '2026');
insert into equipo (categoria_id, nombre)
  select id, 'Sub16 Femenino - Plantel A' from categoria where nombre = 'Sub16';
```

## 5. Crear tu primer usuario admin

1. Entrá a la app, pestaña "Crear cuenta", registrate normalmente (vas a quedar como rol `jugador` por defecto).
2. En Supabase → Table Editor → tabla `perfil`, buscá tu fila y cambiá el campo `rol` a `admin` o `dirigente` manualmente. Esto solo se hace una vez, a mano, por seguridad (nadie puede auto-asignarse admin desde el registro).
3. Volvé a iniciar sesión en la app — ahora vas a ver el botón "+ Agregar jugador".

## 6. Ver la app

Es un sitio estático, no necesita build ni Node. Podés:
- Abrir `index.html` directamente en el navegador, o
- Usar una extensión tipo "Live Server" en VS Code, o
- Subir la carpeta a Vercel / Netlify (arrastrando la carpeta en su dashboard) para tener una URL pública accesible desde el celular.

## Cómo se usa el módulo de Plantel

- **Cualquier usuario logueado** puede elegir una categoría y equipo y ver el plantel.
- **Staff (entrenador, delegado, dirigente, admin)** puede: agregar jugadores existentes al equipo, editar dorsal/posición/altura/estado activo, y ver/editar la ficha médica.
- **Un jugador** puede ver y editar su propio perfil (incluida su ficha médica) pero no la de otros, gracias a las políticas de RLS ya configuradas en la base.
- La foto de perfil se sube al bucket `avatares` de Supabase Storage.

## Cómo se usa Convocatorias y presencias

Primero creá eventos en **Calendario**. Después, en este módulo:

- **Staff (entrenador, delegado, dirigente, admin)** puede: crear una convocatoria eligiendo un evento y a quiénes convoca, ver confirmaciones, eliminar la convocatoria y pasar lista (presente / ausente / tarde / justificado) desde la pestaña Presencias o desde el detalle.
- **Un jugador convocado** puede responder "Voy" o "No puedo" (con motivo opcional). También ve la lista del resto del plantel y la asistencia ya cargada.

Si al abrir una convocatoria un jugador solo ve su propia fila, ejecutá en Supabase → SQL Editor el archivo `fix_convocatoria_rls.sql` (está en la carpeta raíz). Eso deja visible la lista completa al equipo y permite al staff editar o sacar convocados.

## Cómo se usa Mensajería

- **Cualquier usuario** puede empezar un chat individual buscando a otra persona del club.
- **Staff** puede crear (o reabrir) un **grupo de equipo**: se suman el plantel activo y el cuerpo técnico. Si el grupo ya existe, se abre y se agregan integrantes nuevos.
- Quien creó el chat, o un admin/dirigente, puede eliminarlo.
- Los mensajes se marcan como leídos al abrir la conversación.

Antes de usarlo en un proyecto que ya tiene la base creada, ejecutá `fix_mensajeria_rls.sql` en Supabase → SQL Editor. Eso evita un error de recursión al listar chats, permite borrar conversaciones y activa Realtime en la tabla `mensaje` (para que el chat se actualice solo). En Database → Publications, confirmá que `mensaje` esté en `supabase_realtime`.

## Cómo se usa Alineaciones

- Elegí categoría y equipo. Se listan los partidos de ese equipo (de un campeonato o amistosos).
- **Staff** puede crear un partido (local o visitante, rival del club o nombre de un rival externo) y armar la cancha por set (1 a 5): zonas 1–6, líbero y banco.
- Tocar una zona asigna un jugador; se guarda solo. Se puede copiar el set anterior o vaciar el set.
- **Un jugador** ve la alineación en solo lectura.

Si la base ya estaba creada, ejecutá `fix_alineacion.sql` en Supabase → SQL Editor. Eso agrega `equipo_id` a cada alineación (cada equipo tiene la suya), `rival_externo` en `partido` y ajusta las políticas RLS.

## Cómo se usa Tareas

- Elegí categoría y equipo. Las pestañas filtran por estado o muestran solo **Mías**.
- **Staff** puede crear, editar y eliminar tareas: título, descripción, a quién se asigna (plantel o cuerpo técnico), prioridad, vencimiento y estado.
- **Quien tiene la tarea asignada** puede cambiar el estado (pendiente → en progreso → completada), desde la tarjeta o desde el detalle.
- Las tareas vencidas y no completadas se marcan en rojo.

Este módulo usa las tablas y políticas que ya estaban en el esquema; no hace falta un SQL extra.

## Cómo se usa Campeonatos

- Cualquier usuario logueado ve los torneos, la tabla y los partidos.
- **Admin / dirigente** crea el campeonato (liga, copa o eliminación), suma o quita equipos (con grupo opcional) y puede cargar cualquier partido.
- **Staff** de un equipo inscripto puede cargar partidos y resultados de su equipo.
- Al marcar un partido como **finalizado** (un equipo en 3 sets), la tabla se recalcula sola con el sistema FIVB: 3-0/3-1 = 3 pts, 3-2 = 2 pts, 2-3 = 1 pt.

Si la base ya estaba creada, ejecutá `fix_campeonato.sql` en Supabase → SQL Editor. Eso evita errores al finalizar partidos amistosos o con rival externo, y actualiza la tabla también cuando se corrige un resultado.

## Cómo se usa Estadísticas

- Elegí categoría y equipo. En **Plantel** ves los totales (aces, ataques, bloqueos, asistencias, recepciones, defensas y errores) de todos los partidos.
- En **Partidos** abrís un partido para el marcador en vivo: set, puntos y acciones.
- **Staff**: elegí jugador → acción (saque, ataque, bloqueo, recepción, defensa, asistencia) → resultado (punto, error, continúa). Un punto suma para nosotros; un error suma para el rival. Se puede deshacer la última acción y cerrar el set. Al ganar 3 sets, el partido pasa a finalizado.

Opcional: ejecutá `fix_estadisticas.sql` para que el marcador se sincronice en vivo entre varios celulares (Database → Publications, tablas `accion_partido` y `set_partido`).

## Cómo se usa Post partido

- Elegí categoría y equipo. Se listan los partidos (con o sin crónica).
- **Staff** carga el resumen, notas del entrenador, MVP, link de video (YouTube u otro) y fotos. Las fotos van al bucket privado `post-partido`.
- **Cualquier usuario logueado** lee la crónica y puede comentar. Quien escribió un comentario (o un admin) puede borrarlo.

Si la base ya estaba creada, ejecutá `fix_post_partido.sql` en Supabase → SQL Editor (una crónica por partido y poder borrar comentarios/fotos). Confirmá que exista el bucket `post-partido` (lo crea `rls_triggers_storage.sql`).

## Cómo se usa Cuotas y colectas

- Elegí categoría y equipo. Las pestañas separan **Cuotas** (mensuales / cargos del plantel) y **Colectas** (viajes, fondos, etc.).
- **Staff** crea cuotas (concepto, monto, vencimiento) y ve quién está al día. Puede registrar un pago, confirmar uno informado por un jugador o quitarlo. Los comprobantes van al bucket privado `comprobantes`.
- **Un jugador** ve su propio estado (pendiente / parcial / pagado) e informa un pago con monto, método y comprobante opcional. Queda **a confirmar** hasta que el staff lo marca.
- **Colectas:** lo recaudado no se carga al crear la colecta (ahí solo va el nombre, la meta y las fechas). Se suma con cada **+ Aporte**.
- En un aporte, el staff elige **quién aporta**: alguien del plantel o cuerpo técnico, o **Empresa / sponsor (escribir nombre)** para cargar una empresa sin crear cuenta. Un jugador solo puede aportar a su nombre.
- El staff puede cerrar o reabrir la colecta.

Si la base ya estaba creada, ejecutá `fix_cuotas.sql` en Supabase → SQL Editor. Eso permite al jugador informar su pago, al equipo ver los aportes, al staff cargar un sponsor por nombre, y crea el bucket `comprobantes` si faltaba.

## Siguientes pasos

La app ya cubre los módulos del menú lateral. Lo que sigue es cargar categorías, equipos y el primer admin (pasos 4 y 5) y usarla con el club.
