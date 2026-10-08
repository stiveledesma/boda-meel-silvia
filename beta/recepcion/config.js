/* Recepción V11.2: reutiliza la URL configurada en ../assets/api-config.js.
   No escribas contraseñas ni tokens privados en este archivo. */
window.RECEPCION_CONFIG = {
  apiUrl: String(window.BODA_API_CONFIG?.apiUrl || '').trim()
};
