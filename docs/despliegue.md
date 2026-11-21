# Desplegar TETRAVOLT en Cloudflare

Necesitas Node.js 22.12 o posterior y una cuenta de Cloudflare en el plan **Workers Free**. El despliegue incluye el juego estático y el servidor de salas. Puedes usar el subdominio de Cloudflare mientras preparas tu dominio propio. [Workers Free](https://developers.cloudflare.com/workers/platform/pricing/) · [Subdominio workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

## Probar en Windows

Abre PowerShell en la carpeta del proyecto y ejecuta:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run online:dev
```

Abre la dirección local que imprime Wrangler. Entra en **Jugar online**, escribe tu nombre y selecciona **Crear sala**. Copia el enlace y ábrelo en otro perfil del navegador o en una ventana privada. Los dos jugadores marcan **Listo** y el anfitrión inicia la partida. Usa esta prueba en la misma máquina. Para invitar a alguien desde otra red, usa la URL del despliegue.

Si quieres ejecutar las pruebas automáticas desde PowerShell, usa una segunda terminal en el proyecto. Detén el servidor de desarrollo para evitar una colisión de puertos.

```powershell
npm.cmd test
$env:TETRAVOLT_ONLINE = '1'
$env:TETRAVOLT_BROWSER = 'msedge'
npm.cmd run test:e2e
```

## Publicar en Workers Free

1. En Cloudflare, abre **Workers & Pages** y comprueba que la cuenta está en **Workers Free**. Configura el subdominio `workers.dev` de la cuenta si es la primera vez que usas Workers.
2. En PowerShell, desde la carpeta del juego, ejecuta los siguientes comandos. `login` abre Cloudflare en tu navegador para que autorices Wrangler. `whoami` muestra la cuenta con la que se realizará el despliegue.

   ```powershell
   npx.cmd wrangler login
   npx.cmd wrangler whoami
   npm.cmd run deploy
   ```

3. Abre la URL que imprime Wrangler, del tipo `https://tetravolt.<tu-subdominio>.workers.dev`. Repite la prueba desde dos dispositivos distintos. Si abre el menú pero falla la creación de una sala, consulta `/api/online` en ese mismo dominio. El servidor debe responder con HTTP 204.
4. Para publicar actualizaciones, vuelve a ejecutar `npm.cmd run deploy` en una cuenta ya autenticada. Procura hacerlo entre partidas. Un reinicio del Worker puede cerrar salas en curso.

La configuración incluye el Durable Object `Room` con almacenamiento SQLite, compatible con Workers Free. Wrangler aprovisiona el recurso en el primer despliegue. Las partidas y los datos de las salas viven en memoria, de forma temporal. [Configuración de Durable Objects](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/) · [Cuotas de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/)

## Despliegues automáticos desde GitHub

Si conectas el repositorio desde **Workers & Pages → Settings → Builds**, usa el Worker `tetravolt`, la rama `main`, la raíz `/`, el comando de compilación `npm run build` y el comando de despliegue `npx wrangler deploy`. El nombre del Worker debe coincidir con `name` en `wrangler.jsonc`. [Configuración de Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)

Confirma que el commit publicado en `main` contiene `wrangler.jsonc`, `src/online/worker.ts`, `package.json` y `package-lock.json`. La integración compila el commit de GitHub. Los cambios que solo están en tu PC entran en el siguiente despliegue una vez que haces commit y push. Revisa el último commit en **Deployments** antes de reintentar. Si el paso **Deploying** falla, consulta las últimas líneas del log para leer el error de Wrangler. [Diagnóstico de Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/)

## Conectar tu dominio TETRAVOLT

1. Agrega a Cloudflare el dominio que registraste y espera a que su zona DNS aparezca **activa** en la misma cuenta que el Worker.
2. En **Workers & Pages → tetravolt → Settings → Domains & Routes**, elige **Add → Custom Domain**.
3. Introduce el nombre de dominio exacto o el subdominio que quieras usar. Cloudflare crea el registro DNS y emite el certificado TLS.
4. Abre TETRAVOLT desde el dominio definitivo y crea una sala nueva. Comparte el enlace que genera esa sesión. Todos deben entrar por el mismo dominio para conservar la sesión del navegador y evitar confundir las invitaciones de prueba con las definitivas. [Dominios personalizados](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

## Cómo funcionan las salas

- **Blitz online** usa las reglas competitivas. El anfitrión puede escoger la dificultad de las IA en las plazas libres. Usa **Controles → J1** para configurar tu teclado o mando antes de entrar, cualquiera sea el número de plaza que recibas.
- El enlace es la invitación privada. Cualquiera que lo reciba puede ocupar una plaza libre antes de empezar. Las plazas usan una credencial propia de la pestaña, que se conserva al recargar.
- Si la conexión se corta durante la partida, la sala espera hasta 75 segundos. Para recuperar la plaza tras recargar, abre el enlace en la misma pestaña y pulsa **Unirse**. Salir voluntariamente durante el encuentro devuelve al grupo a la sala. Las salas en espera o en resultados caducan tras diez minutos de inactividad.
- Los modos locales siguen disponibles desde el menú, incluso en la compilación estática servida sin Cloudflare. La opción online requiere el Worker.
- Las cuotas del plan gratuito se comparten con el resto de tu cuenta. Una sala conectada consume cuota de duración mientras está abierta. El servidor ejecuta las reglas y envía el estado cada 50 ms durante la partida. La latencia de internet se suma a ese intervalo. [Cuotas y facturación](https://developers.cloudflare.com/durable-objects/platform/pricing/)
