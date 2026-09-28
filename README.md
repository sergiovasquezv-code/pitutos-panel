# Pitutos Panel — versión Cloudflare (Pages + D1)

Misma app que ya probaste (clientes, equipos con garantía, trabajos, mensualidades,
dashboard), pero reconstruida para correr **100% en Cloudflare**, igual que La
Esquina Delivery: sin servidor propio, con **Cloudflare Pages Functions** como
backend y **D1** (la base de datos serverless de Cloudflare) en vez de SQLite
local.

## Qué cambió respecto a la versión Flask

- El backend ya no es Python/Flask — es JavaScript corriendo como *Functions*
  de Cloudflare Pages (una función por endpoint, en `functions/api/`).
- La base de datos ya no es un archivo SQLite — es una base D1 (mismo motor
  SQLite por debajo, pero alojada por Cloudflare).
- El frontend ya no son páginas renderizadas por el servidor (Jinja) — es una
  SPA simple (`public/index.html` + `public/js/app.js`) que le pide los datos
  a la API. El diseño visual es el mismo que ya viste y aprobaste.
- El login funciona igual: la primera vez te pide crear tu usuario y
  contraseña (`/setup.html`), después entras por `/login.html`.

## Cómo lo probé antes de entregártelo

No pude instalar Wrangler en este entorno para levantar `wrangler pages dev`
(el proxy de este sandbox bloquea el registro de npm), así que en vez de eso
armé un arnés de pruebas que simula la base D1 con SQLite real (y R2 con un
almacén en memoria) y llama directamente a cada función de la API — están en
`test/`. Corrí 99 pruebas automatizadas que cubren: creación de cuenta,
login, el middleware que protege la API, CRUD completo de
clientes/equipos/trabajos/mensualidades, el cálculo de vencimiento de
garantía, el marcado de pagos (y que no se pueda pagar dos veces el mismo
mes), el dashboard, el borrado en cascada de un cliente, y todo lo de
seguimiento del cliente: generar el link público, agregar notas/enlaces/
fotos, subir y borrar fotos en R2, editar notas/enlaces/descripciones de
fotos ya agregadas, el hito automático que queda cuando cambia el estado del
trabajo (y que ese hito no se pueda editar ni borrar a mano), la vista
pública por token con la fecha de última actividad, la vista previa con
título/descripción a medida para compartir por WhatsApp, que el cliente
pueda marcar una nota/enlace/foto como revisada desde su link (y que solo
pueda hacerlo con el token correcto), que el middleware deje pasar esas
rutas públicas sin sesión, que al borrar un trabajo o un cliente también
se borren sus avances (y las fotos en R2), y que el filtro "abiertos" del
listado de trabajos traiga solo los que no están Terminados, y que el
número de teléfono del cliente se convierta correctamente al formato que
necesita el link directo de WhatsApp, y que el aviso por correo cuando el
cliente marca algo como revisado se mande (una sola vez, no de nuevo si
vuelve a marcarlo) solo cuando está configurado, y todo el link público de
garantía de un equipo: generarlo, que la vista que ve el cliente traiga el
equipo y el estado real de su garantía (vigente/por vencer/vencida) sin
exponer el precio pagado ni ningún id interno, que un token inválido se
rechace, y que la vista previa a medida para compartir por WhatsApp
funcione igual que la de seguimiento; y todo lo de abonos: registrar un
abono parcial y otro que completa el saldo, que se rechacen montos o
categorías inválidas, listar el historial de abonos, que el comprobante
público muestre el detalle del pago y el saldo sin exponer ids internos,
que rechace un token inválido, eliminar un abono mal ingresado, y que el
resumen de Finanzas calcule bien facturado/abonado/saldo/estado por
cliente. Todas pasaron.

Aun así, te recomiendo probarla con `wrangler pages dev` en tu compu antes de
usarla en serio (paso 5 más abajo) — eso sí ejecuta el código exactamente
como corre en Cloudflare.

## Requisitos

- Node.js instalado en tu compu (tú ya tienes Node — lo usamos para probar
  Pitutos-web). Si no, descárgalo de nodejs.org.
- Tu cuenta de Cloudflare (la misma de La Esquina).

## Pasos para dejarla arriba

### 1. Instala Wrangler (la herramienta de línea de comandos de Cloudflare)

Abre una terminal dentro de la carpeta del proyecto (`pitutos-cf`) y corre:

```bash
npm install
```

### 2. Inicia sesión en Cloudflare

```bash
npx wrangler login
```

Se abre el navegador para que autorices con tu cuenta (la misma de
dash.cloudflare.com donde está La Esquina).

### 3. Crea la base de datos D1

```bash
npx wrangler d1 create pitutos-db
```

Esto imprime algo como:

```
[[d1_databases]]
binding = "DB"
database_name = "pitutos-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copia ese `database_id` y pégalo en el archivo `wrangler.toml` del proyecto,
reemplazando donde dice `REEMPLAZA_ESTO_CON_EL_ID_QUE_TE_DA_WRANGLER`.

### 4. Crea las tablas en la base de datos

```bash
npx wrangler d1 execute pitutos-db --remote --file=schema.sql
```

### 5. (Opcional pero recomendado) Pruébala localmente primero

```bash
npm run dev
```

Esto levanta una copia local en `http://127.0.0.1:8788` con una base D1 local
de prueba (no toca la de producción). Ábrela, crea tu usuario, agrega un
cliente de prueba y revisa que todo funcione antes de publicarla de verdad.

### 6. Publícala

```bash
npm run deploy
```

La primera vez te va a preguntar si quieres crear el proyecto
`pitutos-panel` — di que sí. Al terminar te entrega la URL, algo como
`https://pitutos-panel.pages.dev`.

### 7. Verifica el binding de la base de datos (por si acaso)

Normalmente el paso anterior deja todo conectado automáticamente porque está
declarado en `wrangler.toml`. Si al abrir la web te aparece un error
relacionado con la base de datos, ve a **dash.cloudflare.com → Workers &
Pages → pitutos-panel → Settings → Functions → D1 database bindings** y
agrega manualmente: variable `DB` → base de datos `pitutos-db`.

### 8. Abre tu panel y crea tu cuenta

Entra a la URL que te dio Cloudflare — la primera vez te va a pedir crear tu
usuario y contraseña de administrador, igual que en la versión anterior.

## Novedad: aviso por correo cuando el cliente marca algo como revisado

Antes, la única forma de saber que un cliente marcó una nota, enlace o foto
como revisado era entrar al panel y fijarte en cada trabajo. Ahora, si lo
configuras (una sola vez), te llega un correo automático apenas el cliente
marca algo — no hace falta que entres a revisar.

Uso **Resend** (resend.com) para mandar el correo — tiene plan gratis (3.000
correos al mes) y no necesitas tarjeta. Como sin verificar un dominio propio
Resend solo deja mandar correos **a la misma cuenta con la que te
registraste**, esto calza perfecto para este caso porque el aviso te lo
mandas a ti mismo.

### Paso 1: crea tu cuenta en Resend y la clave

1. Entra a [resend.com](https://resend.com) y crea una cuenta gratis usando
   el correo donde quieres recibir los avisos (por defecto dejé
   `sergiovasquezv@gmail.com` configurado — más abajo te digo dónde
   cambiarlo si quieres que llegue a otro correo).
2. Una vez dentro, ve a **API Keys** (en el menú de la izquierda) → **Create
   API Key**. Ponle un nombre cualquiera (ej. "Pitutos Panel") y déjala con
   permiso de "Sending access".
3. Copia la clave que te muestra — empieza con `re_...` — **solo la vas a
   ver una vez**, cópiala altiro.

### Paso 2: guarda la clave en Cloudflare (como secreto, no queda en el código)

Desde la carpeta del proyecto:

```bash
npx wrangler pages secret put RESEND_API_KEY
```

Te va a pedir que pegues la clave — pégala y presiona Enter. Esto la guarda
de forma segura en Cloudflare, nunca queda en un archivo que puedas subir
por error a ningún lado.

### Paso 3 (opcional): cambia a qué correo llegan los avisos

Por defecto dejé `EMAIL_NOTIFICACIONES = "sergiovasquezv@gmail.com"` en tu
`wrangler.toml`, en el bloque `[vars]`. Si quieres que te lleguen a otro
correo, ábrelo con Notepad y cambia esa línea — pero recuerda que tiene que
ser **el mismo correo con el que te registraste en Resend** (a menos que
más adelante verifiques un dominio propio ahí, lo cual no es necesario para
que esto funcione).

### Paso 4: publica de nuevo

```bash
npm run deploy
```

Con eso, la próxima vez que un cliente marque algo como revisado en su
link, te va a llegar un correo con su nombre, el trabajo, y qué marcó. Si
no configuras nada de esto, el panel sigue funcionando exactamente igual
que antes — el correo es un aviso opcional encima de lo que ya había.

## Novedad: WhatsApp abre el chat directo con el cliente

Antes, el botón "Enviar por WhatsApp" abría WhatsApp pidiéndote elegir el
contacto a mano, aunque ya tuvieras el teléfono del cliente guardado en su
ficha. Ahora, si el cliente tiene teléfono registrado, el botón abre
directamente el chat con ese número (soporta números guardados como
`+56 9 1234 5678`, `912345678`, `12345678`, etc. — se convierten solos al
formato que necesita WhatsApp). Si el cliente no tiene teléfono guardado,
el botón sigue funcionando como antes (te deja elegir el contacto) y
aparece un aviso con un link directo a la ficha del cliente para
agregárselo.

También, al crear un cliente nuevo, el campo de teléfono ahora viene con
el prefijo `+56 9` puesto de entrada, así solo tienes que escribir los 8
dígitos que faltan (si lo dejas sin completar, se guarda como que no
tiene teléfono, no como un número inválido).

## Novedad: acceso directo a "Trabajos abiertos" desde el Inicio

Antes, para ver los trabajos abiertos (los que no están Terminados) había
que ir al menú "Trabajos y soporte" y filtrar de a uno por estado
(Pendiente, En curso, Esperando cliente). Ahora, desde el **Inicio**, hay
dos formas de llegar directo al listado ya filtrado (todos los trabajos
que no están Terminados, juntos) con un solo clic — no hace falta apuntar
al texto ni a un botón chico, todo el recuadro reacciona al clic:

- La **tarjeta** "Trabajos abiertos" (arriba, junto a Clientes,
  Garantías, etc.) — clic en cualquier parte de la tarjeta.
- El **panel** "Trabajos abiertos" más abajo (con la tabla) — clic en
  cualquier parte del recuadro (título, tabla, espacio vacío), no solo en
  el botón "Ver todos". Si haces clic justo en el nombre de un cliente
  dentro de la tabla, igual te lleva a la ficha de ese cliente como
  antes.

También agregué un botón **"Abiertos"** en el filtro del listado de
Trabajos, junto a "Todos" y los estados individuales, para llegar ahí
desde cualquier parte sin tener que revisar estado por estado. No
requiere ninguna migración de base de datos — solo publicar de nuevo
(paso "Volver a publicar cambios" más abajo).

## Novedad: seguimiento para el cliente (fotos, enlaces, notas)

Ahora cada trabajo puede tener un **link público** (sin login) donde el
cliente ve el estado del trabajo (con un hito automático cada vez que
cambia), las fotos que subas, los enlaces, las notas de avance con fecha, y
cuándo fue la **última actualización** — todo en una página simple y
profesional (`seguimiento.html`). Las notas, enlaces y descripciones de
fotos que agregues se pueden **editar** después desde el panel (no solo
agregar y borrar).

Los estados posibles de un trabajo ahora son: **Pendiente → En curso →
Esperando cliente → Terminado**. "Esperando cliente" es para cuando el
trabajo está detenido porque necesitas una respuesta, aprobación o dato del
cliente — en la página pública se resalta en naranjo con un aviso ("Este
trabajo está esperando una respuesta tuya...") para que quede clarísimo que
la pelota está en su cancha.

Junto al link, en el panel ahora hay un botón **"Enviar por WhatsApp"** que
abre WhatsApp con un mensaje ya escrito (con el nombre del cliente y el
link) listo para elegir el contacto y mandar. Además, el link corto que se
genera ahora (`/seguimiento?t=...` en vez de `/seguimiento.html?t=...`) trae
una vista previa a medida — con el tipo de trabajo y el estado actual — para
que se vea bien cuando lo pegas en WhatsApp (los links viejos que ya hayas
mandado con `.html` siguen funcionando igual).

También el cliente ahora puede marcar una nota, enlace o foto como
**"revisado"** desde su propio link — útil por ejemplo cuando le pides que
apruebe algo. Tú ves en tu panel, debajo de cada avance, si el cliente ya lo
revisó y cuándo.

Para dejar esto funcionando en tu sitio ya desplegado, hazlo **una sola
vez**, en este orden:

### A. Crea el bucket R2 (donde se guardan las fotos)

```bash
npx wrangler r2 bucket create pitutos-fotos
```

### B. Agrega el binding de R2 a tu `wrangler.toml`

Abre tu `wrangler.toml` local con Notepad y **agrega** (no borres nada de lo
que ya tienes, especialmente tu `database_id`) este bloque, por ejemplo justo
después del bloque `[[d1_databases]]`:

```toml
[[r2_buckets]]
binding = "FOTOS"
bucket_name = "pitutos-fotos"
```

### C. Actualiza la base de datos (nuevas tablas/columnas)

```bash
npx wrangler d1 execute pitutos-db --remote --file=migration_seguimiento.sql
```

Este archivo solo agrega lo nuevo (no borra ni toca tus datos actuales:
clientes, equipos, trabajos, mensualidades).

### D. Segunda migración (para poder editar avances)

```bash
npx wrangler d1 execute pitutos-db --remote --file=migration_avances_editable.sql
```

Esta es una migración chica adicional, necesaria para que se pueda editar
una nota/enlace/foto después de agregarla. Si ya habías corrido la migración
anterior (`migration_seguimiento.sql`) pero no esta, solo te falta esta.

### E. Tercera migración (para que el cliente pueda marcar como revisado)

```bash
npx wrangler d1 execute pitutos-db --remote --file=migration_avances_revisado.sql
```

### F. Publica de nuevo

```bash
npm run deploy
```

Con eso, al editar un trabajo vas a ver una sección **"Seguimiento para el
cliente"** donde puedes generar el link, agregar notas, enlaces y fotos. Ese
link (`https://tu-sitio.pages.dev/seguimiento.html?t=...`) es el que le
mandas al cliente — no necesita crear cuenta ni iniciar sesión, y solo quien
tenga el link puede verlo.

### G. Migración para el link público de garantía del equipo

Si ya hiciste los pasos A-F más arriba, todavía te falta este paso extra
(chico) para la novedad de garantías que te explico más abajo:

```bash
npx wrangler d1 execute pitutos-db --remote --file=migration_garantia_publica.sql
```

### H. Publica de nuevo

```bash
npm run deploy
```

## Novedad: link público de garantía para el cliente

Igual que con el seguimiento de un trabajo, ahora cada **equipo** (venta)
puede tener su propio link público (sin login) donde el cliente ve siempre
qué compró y el estado real de su garantía — sin que tenga que preguntarte
ni que tú tengas que ir a revisar manualmente.

Al editar un equipo (**Equipos y garantías → click en un equipo**) vas a
ver una sección **"Garantía para el cliente"**, igual que la de
seguimiento de trabajos: un botón para generar el link, copiarlo, y un
botón para mandarlo directo por WhatsApp (si el cliente tiene teléfono
registrado en su ficha, se abre el chat directo con él; si no, te deja
elegir el contacto a mano, como antes).

La página que ve el cliente (`/garantia?t=...`) muestra el tipo de equipo,
marca/modelo, N° de serie, fecha de compra, y un aviso grande y claro con
el estado de la garantía:

- **Verde**, con un ✓, si está vigente — dice cuándo vence y cuántos días
  quedan.
- **Naranjo**, con un ⚠, si está por vencer (15 días o menos) — mismo
  aviso, para que se prepare.
- **Rojo**, con una ✕, si ya venció — dice hace cuántos días.

Ese mismo semáforo (verde/naranjo/rojo) ahora también se ve en tu panel:
en el listado de **Equipos**, en la ficha de cada **cliente**, y en el
formulario al editar un equipo — antes una garantía vencida se veía gris
igual que cualquier otra cosa, ahora se ve roja para que salte a la vista.
Y en el **Inicio**, la lista de "Garantías por vencer o recién vencidas"
también muestra en rojo las que ya vencieron (antes también se veían
grises ahí).

El link de garantía no expone el precio que pagó el cliente ni ningún dato
interno — solo lo que necesita ver: su equipo y su garantía.

## Novedad: pagos por abono y control total de finanzas

Ahora **trabajos, equipos y mensualidades** aceptan pagos por abonos (no
solo de una vez): cada vez que el cliente te paga algo, lo registras desde
la ficha de ese trabajo/equipo/mensualidad (sección **"Pagos y abonos"**),
y el panel:

- Descuenta el abono del saldo pendiente automáticamente.
- Te genera al toque un **link de comprobante** (`/comprobante?t=...`) con
  el detalle del pago y el saldo que queda — página pública, sin login,
  con el mismo diseño que la garantía y el seguimiento.
- Te deja un botón **"Enviar por WhatsApp"** con un mensaje ya redactado,
  amistoso y profesional, agradeciendo el pago y avisando cuánto queda
  pendiente (o confirmando que la cuenta quedó al día).

Además, hay una sección nueva en el menú, **Finanzas**, con el control
total de la plata: cuánto le has facturado a cada cliente, cuánto ha
abonado, cuánto le queda pendiente, y quién está "Al día", con "Abono
parcial" o "Sin abonos" — con el total general arriba. El **Inicio**
también muestra ahora el ingreso realmente cobrado este mes (no solo lo
facturado) y el total por cobrar.

El botón "Marcar pagado" de mensualidades se mantiene igual de simple —
sigue registrando el mes completo de un solo clic — pero por dentro ahora
también genera su comprobante.

Para dejar esto funcionando en tu sitio ya desplegado:

### Actualiza la base de datos

```bash
npx wrangler d1 execute pitutos-db --remote --file=migration_abonos.sql
```

Esta migración solo agrega la tabla nueva (`abonos`) y trae tu historial
de pagos de mensualidades ya cobrados a ella — no borra ni toca ningún
dato existente. Corre esto **una sola vez**.

### Publica de nuevo

```bash
npm run deploy
```

Con eso, al editar cualquier trabajo, equipo o mensualidad vas a ver la
sección "Pagos y abonos" para registrar pagos, generar el comprobante y
mandarlo por WhatsApp, y el link **Finanzas** en el menú para el resumen
completo de deuda por cliente.

## Volver a publicar cambios más adelante

Cada vez que quieras actualizar algo, solo corre de nuevo:

```bash
npm run deploy
```

## Dominio propio

Si quieres usar un subdominio tuyo (por ejemplo `panel.tudominio.cl`) en vez
de `pitutos-panel.pages.dev`, se configura desde **Workers & Pages →
pitutos-panel → Custom domains**, igual que probablemente hiciste (o puedes
hacer) con La Esquina.

## Respaldo de tus datos

A diferencia de la versión con SQLite local, acá no hay un archivo que
copiar — los datos viven en D1. Para respaldarlos:

```bash
npx wrangler d1 export pitutos-db --remote --output=respaldo.sql
```

Guarda ese archivo `respaldo.sql` de vez en cuando (por ejemplo, una vez al
mes) en algún lugar seguro.

## Estructura del proyecto

```
pitutos-cf/
├── wrangler.toml                  # Configuración de Cloudflare (D1, R2, nombre del proyecto)
├── schema.sql                      # Esquema de la base de datos D1
├── migration_seguimiento.sql        # Migración 1: agrega el seguimiento a una base ya creada
├── migration_avances_editable.sql    # Migración 2: permite editar notas/enlaces/fotos
├── migration_avances_revisado.sql     # Migración 3: permite que el cliente marque como revisado
├── migration_garantia_publica.sql      # Migración 4: agrega el link público de garantía del equipo
├── migration_abonos.sql                 # Migración 5: agrega abonos (pagos parciales) y comprobante
├── functions/
│   ├── seguimiento.js                  # Ruta corta /seguimiento con vista previa a medida (WhatsApp)
│   ├── garantia.js                      # Ruta corta /garantia con vista previa a medida (WhatsApp)
│   ├── comprobante.js                    # Ruta corta /comprobante con vista previa a medida (WhatsApp)
│   ├── _lib/                          # Código compartido (fechas, auth, correo, helpers JSON, tokens, abonos)
│   └── api/                            # Un archivo por endpoint (clientes, equipos, etc.)
│       ├── abonos/
│       │   ├── index.js                    # Lista y registra abonos de trabajos/equipos/mensualidades
│       │   └── [id].js                      # Elimina un abono (para corregir un error de ingreso)
│       ├── finanzas/
│       │   └── resumen.js                    # Control total: facturado/abonado/saldo por cliente
│       ├── equipos/[id]/
│       │   └── link.js                    # Genera el link público de garantía del equipo
│       ├── trabajos/[id]/
│       │   ├── link.js                    # Genera el link público del trabajo
│       │   ├── fotos.js                    # Sube fotos a R2
│       │   └── avances/                     # Notas, enlaces y fotos del seguimiento
│       └── public/                            # Endpoints sin login (vista del cliente)
│           ├── equipo/[token].js                # Garantía que ve el cliente
│           ├── comprobante/[token].js             # Comprobante de abono que ve el cliente
│           └── trabajo/[token]/avances/[avanceId]/revisar.js  # El cliente marca un avance como revisado
├── public/
│   ├── index.html               # Shell de la app (panel principal)
│   ├── login.html                # Pantalla de login
│   ├── setup.html                  # Configuración inicial (crear cuenta)
│   ├── seguimiento.html              # Página pública que ve el cliente (seguimiento de un trabajo)
│   ├── garantia.html                  # Página pública que ve el cliente (garantía de un equipo)
│   ├── comprobante.html                 # Página pública que ve el cliente (comprobante de un abono)
│   ├── css/style.css                # Mismo diseño que ya viste
│   └── js/                            # Lógica del panel (router, vistas, API)
└── test/                                # Pruebas automatizadas del backend (incluye R2 simulado)
```
