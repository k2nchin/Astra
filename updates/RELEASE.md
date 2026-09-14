# Publicar una actualización de Astra

1. Aumenta la versión en `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml`.
2. Genera el instalador con `npm run tauri:build`.
3. Firma el artefacto con `npx tauri signer sign <archivo> --private-key <ruta-fuera-del-proyecto>`.
4. Publica el `.nsis.zip`, su `.sig` y `latest.json` en el servidor HTTPS.
5. Sustituye los valores de `updates/latest.json.example` por la versión real, URL HTTPS y firma.

La clave privada debe permanecer fuera del repositorio y fuera del instalador. El cliente solo necesita la clave pública y rechazará una actualización sin firma válida.
