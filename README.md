# raid-text

Expansor de texto personal para Chrome — atajos ilimitados y gratuitos.

Una alternativa open source a Text Blaze, sin límites de snippets ni suscripción.

## Instalación

### Desde Chrome (modo desarrollador)

1. Descarga o clona este repositorio
2. Ve a `chrome://extensions`
3. Activa **Modo de desarrollador** (arriba a la derecha)
4. Haz clic en **Cargar descomprimida**
5. Selecciona la carpeta `raid-text`

### Desde consola

```bash
git clone https://github.com/TU_USUARIO/raid-text.git
```

Luego sigue los pasos de instalación desde Chrome.

## Cómo usar

1. Haz clic en el ícono de la extensión para abrir el panel
2. Crea un atajo nuevo (ej: `/ty` → "Muchas gracias por su mensaje...")
3. Escribe el atajo en cualquier campo de texto en Chrome — se expande automáticamente

Funciona en Gmail, Google Docs, LinkedIn, WhatsApp Web y cualquier otro sitio.

## Variables especiales

| Variable | Resultado |
|---|---|
| `{fecha}` | Fecha de hoy en formato dd/mm/yyyy |
| `{hora}` | Hora actual en formato hh:mm |
| `{cualquier_palabra}` | Te pide ese dato antes de insertar |

Ejemplo de atajo con variables:

```
Hola {nombre}, gracias por contactarnos el {fecha}.
```

Al usar el atajo, se abre un formulario pidiendo el valor de `{nombre}` antes de insertar.

## Features

- Atajos ilimitados
- Fecha y hora automática
- Campos dinámicos (pide datos antes de insertar)
- Exportar/importar atajos como JSON (backup)
- Buscador en el panel de gestión
- Funciona en cualquier campo de texto en Chrome

## Licencia

MIT
