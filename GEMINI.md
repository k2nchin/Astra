# CUBE AI 0.3.0 · Gemini

Cierra la versión anterior desde su icono de bandeja y ejecuta el instalador 0.3.0.

1. Abre el menú de CUBE y entra en Configuración y micrófono.
2. Selecciona Google Gemini. El modelo inicial es `gemini-2.5-flash`; puedes escribir otro modelo habilitado para tu cuenta.
3. Pega tu API key de Google AI Studio en el campo de clave.
4. Pulsa Guardar y probar. Cuando aparezca Conectado, vuelve al chat.

La clave se guarda cifrada con DPAPI para tu usuario de Windows. No se incluye en el instalador ni se guarda como texto en los ajustes de Gemini. La prueba realiza una petición a tu cuenta; una respuesta correcta comprueba la clave y el modelo. No basta con seleccionar un proveedor para tener conexión.

Puedes decir «Rafael» o «Hey CUBE» para activar la escucha. El audio se reconoce localmente; el texto y hasta 12 mensajes recientes del chat se envían a Gemini. El historial se mantiene en memoria durante la sesión. CUBE conserva su nombre.

Las órdenes conocidas usan los controles de Windows disponibles. Gemini también puede proponer abrir una aplicación permitida, buscar nombres de archivos, cambiar de pista, alternar reproducción/pausa, subir/bajar volumen, alternar silencio y guardar una captura local. Las propuestas del modelo requieren confirmar con Sí o No. Solo se informa del resultado después de recibir la respuesta del backend.

No hay control general de mouse/teclado, ejecución libre de scripts, borrado de archivos, compras o envío de mensajes. Reproducción/pausa alterna el estado del reproductor activo: requiere música cargada y no selecciona una canción específica. No se envían capturas ni contenidos de archivos a Gemini.

Errores de conexión:

- 400: revisar la clave y el modelo.
- 401/403: clave inválida o sin permisos.
- 404: modelo no disponible para esa cuenta.
- 429: cuota o límite de solicitudes de Google alcanzado.

Implementación basada en la [API generateContent de Google](https://ai.google.dev/api/generate-content). Modelos: [catálogo de Gemini](https://ai.google.dev/gemini-api/docs/models).

Verificación de desarrollo: `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml` y `npm run tauri:build`. Las pruebas de Gemini usan respuestas controladas, no claves del usuario. La prueba con una cuenta real se hace mediante Guardar y probar.
