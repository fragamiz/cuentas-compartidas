# Cuentas Compartidas

Aplicación independiente para repartir gastos entre varias personas. La rama `main` conserva en el commit `a6f111f` una copia exacta del código publicado originalmente en Sites. Los cambios posteriores preparan una versión para Cloudflare Workers y Dropbox. La publicación de Sites no se modifica.

## Datos

Cada usuario conecta su propia cuenta de Dropbox. La aplicación guarda un único archivo JSON, `cuentas-compartidas.json`, en la carpeta de la aplicación de Dropbox. Usa la revisión de Dropbox para detectar ediciones simultáneas. Si hay un conflicto, conserva los cambios visibles en el navegador y avisa de que hay que recargar antes de seguir.

La nueva versión comienza con un archivo vacío. Los datos de la versión de Sites estaban en su base de datos privada y no forman parte de este repositorio. **No usar la nueva versión como sustituta hasta importar y verificar esos datos.**

## Preparar Dropbox

1. Crea una aplicación en [Dropbox App Console](https://www.dropbox.com/developers/apps), con acceso **App folder** y permisos `files.content.read` y `files.content.write`.
2. Cuando exista la URL de la aplicación publicada, registra en Dropbox esta URI de redirección exacta: `https://TU-DOMINIO/api/auth/dropbox/callback`.
3. Copia la app key y el app secret. No los añadas al repositorio.

## Publicar con Cloudflare Workers

1. Crea una cuenta de Cloudflare y conecta este repositorio con [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/). Usa `pnpm install --frozen-lockfile` y `pnpm run deploy`.
2. En el Worker, configura los secretos `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` y `SESSION_KEY`. Este último debe contener 32 bytes aleatorios en base64url. Puedes generarlo con `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
3. Registra la URL de redirección en Dropbox, como se indica arriba. Abre el Worker y pulsa **Conectar Dropbox**.
4. Antes de pasar usuarios a la nueva dirección, importa los datos de Sites y verifica totales y eventos.

El acceso OAuth se hace en el navegador y el token de renovación se guarda en una cookie cifrada, `HttpOnly`, `SameSite=Lax` y `Secure` bajo HTTPS. Ningún secreto se envía al cliente ni se guarda en GitHub.

## Desarrollo local

Requiere Node 22.13 o superior y pnpm 11. Copia `.dev.vars.example` a `.dev.vars`, completa los valores y registra `http://localhost:5173/api/auth/dropbox/callback` en Dropbox si necesitas probar OAuth localmente. Ejecuta `pnpm install --frozen-lockfile` y `pnpm dev`. Para comprobar la compilación: `pnpm build`.
