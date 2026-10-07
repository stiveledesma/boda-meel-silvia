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
