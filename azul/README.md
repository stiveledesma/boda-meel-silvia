# Meel & Silvia — Invitación web Exclusive V2

Sitio estático HTML/CSS/JS listo para GitHub + Vercel.

## Abrir localmente

Puedes hacer doble clic en `index.html`. Para una prueba más fiel al despliegue, abre una terminal en esta carpeta y ejecuta:

```bash
python -m http.server 5500
```

Luego abre `http://localhost:5500`.

## Pases personalizados

La invitación acepta parámetros en la URL:

```text
?invitado=Familia%20Ledesma&cupos=4
```

Ejemplo local:

```text
http://localhost:5500/?invitado=Familia%20Ledesma&cupos=4
```

En Vercel funcionará igual:

```text
https://tu-dominio.vercel.app/?invitado=Familia%20Ledesma&cupos=4
```

## Importante sobre RSVP, deseos y canciones

Esta demo usa `localStorage`, por lo que cada navegador guarda sus propios datos. Para un evento real conviene conectar esas funciones a Google Sheets + Apps Script, Supabase o una API propia.

## Subir a GitHub

1. Crea un repositorio vacío en GitHub, por ejemplo `boda-meel-silvia`.
2. Abre PowerShell dentro de esta carpeta.
3. Ejecuta:

```powershell
git init
git add .
git commit -m "Invitacion web Meel y Silvia"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/boda-meel-silvia.git
git push -u origin main
```

Si GitHub pide autenticación, inicia sesión desde Git Credential Manager o usa GitHub Desktop.

## Desplegar en Vercel

1. Entra a Vercel e inicia sesión.
2. `Add New` → `Project`.
3. Importa el repositorio `boda-meel-silvia`.
4. Framework preset: `Other`.
5. Root Directory: deja `./`.
6. Build Command: vacío.
7. Output Directory: vacío.
8. Pulsa `Deploy`.

Vercel detectará `index.html` y publicará el sitio.

## Cambios posteriores

Después de editar archivos:

```powershell
git add .
git commit -m "Actualizar invitacion"
git push
```

Vercel volverá a desplegar automáticamente.


## Exclusive V3

Esta revisión restaura la dirección visual editorial previa al rediseño de Codex.

### Música
La invitación intenta reproducir primero `assets/music.mp3`. El clic en
**Abrir invitación** funciona a la vez como apertura y autorización de audio,
por lo que no existe un segundo paso para “activar” la canción. Si el MP3 no
está disponible, se utiliza `assets/nuestra_cancion.wav` como respaldo.


## Exclusive V4

Esta versión añade:
- 2 fotografías editoriales generadas para Meel y Silvia:
  - `assets/editorial-couple-01.webp`
  - `assets/editorial-couple-02.webp`
- hero con foto protagonista de sesión profesional.
- fondos mejorados con más sensación de boda, textura tipo papel, flores decorativas y marcas de agua.
- conservación de las fotos reales (`meel.png` y `silvia.png`) como recuerdos auténticos.


## Exclusive V5

Esta versión reemplaza las 2 imágenes IA anteriores por imágenes proporcionadas por el usuario:
- `assets/companions-01.png`
- `assets/companions-02.png`

También incorpora un fondo floral/papel basado en la referencia subida por el usuario:
- `assets/floral-background-reference.png`

Además, el resto de bloques visuales se armonizó más con ese estilo romántico y floral.


V6: refinamiento floral final.
- Se añadieron 4 fondos florales distintos para diferentes paneles.
- Hero, historia, countdown, itinerario, regalos, RSVP, QR y footer ahora usan composiciones florales diferentes.
- Se buscó una sensación más premium, rica y consistente con papelería de boda de lujo.


## V7 Azul — variante de visualización

Esta variante reutiliza toda la V6 y cambia únicamente la dirección visual a azul hielo / azul grisáceo.
- Nuevas tipografías: Cormorant Garamond + Montserrat + Allura.
- 4 fondos azules suministrados por el usuario, optimizados a WebP y asignados a distintos paneles.
- Paleta azul, tinta azul-gris, bordes y sombras armonizados.
- Footer nuevo de V6 incluido con `footer-divider.png` y adaptado cromáticamente.
- Lógica, formularios, audio, pases personalizados y localStorage se conservan.
