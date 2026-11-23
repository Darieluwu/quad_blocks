# Recursos de personajes de TETRAVOLT

El selector se abre en la sala, dentro de cada plaza. **Marcar listo** confirma el personaje. Las selecciones provisionales se pueden intercambiar mientras sus plazas sigan sin confirmar. En Blitz online el servidor valida las reservas y envía la alineación a todos los clientes. El anfitrión puede elegir los personajes de las plazas que se completarán con IA. En local, las elecciones sobreviven a una recarga.

Con teclado o mando, las asignaciones de izquierda y derecha recorren el elenco y el giro horario confirma. También puedes enfocar «Personaje de Jn» con Tab y usar el selector nativo. Cada invitado online usa la asignación local de J1.

## Archivos visuales

Los ID son `volt`, `nix`, `pix`, `astra`, `blaze` y `pengu`. Coloca cada recurso en `src/characters/art/<id>/` y usa `.webp`, `.png` o `.avif`.

| Nombre | Uso |
|---|---|
| `master` | Ilustración maestra de cuerpo completo, preferiblemente con transparencia |
| `portraits/neutral`, `blink`, `attack`, `danger`, `damage`, `victory`, `defeat`, `support`, `zone` | Nueve retratos con encuadre coherente |
| `pose-attack` y `pose-zone` | Poses especiales independientes |
| `zone-background` | Fondo temático de presentación para SURGE |
| `attacks/tetris`, `spin`, `combo`, `zoneFinish` | Acentos visuales opcionales para ataques, confinados al marco del personaje |

Puedes incorporar los archivos de a uno. El selector usa la ilustración maestra o el retrato neutral. Durante el juego, una expresión ausente recurre al retrato neutral y, si este falta, se muestran las iniciales del personaje.

Los retratos de **PengU** mantienen el lienzo aprobado de 1254 × 1254. Sus expresiones nuevas se editaron sobre el neutral y se limitaron a los ojos y los párpados. La celebración también modifica la posición de las aletas. Midnight Reverie combina la pose y el fondo aprobados con una media luna y círculos arcanos animados. En Blitz usa el canal de su equipo. En VS4 se presenta en la cabecera, fuera de la matriz.

La [ilustración aprobada de Blaze](references/blaze-original.png) conserva el escenario original. El juego usa su recorte con alfa en `src/characters/art/blaze/master.png`. Los ocho cambios de expresión se editaron sobre el retrato neutral. Las poses mantienen la complexión y el equipo industrial de la referencia, con un golpe de avance para Flare Impact y los brazos abiertos para Inferno Break.

## Voces japonesas y subtítulos

Los clips van en `src/characters/voices/ja/<id>/<evento>.ogg`. También se aceptan `.mp3` y `.wav`. Usa exactamente estos eventos, respetando mayúsculas y minúsculas:

```text
selection tetris spin combo zoneStart zoneFinish danger victory defeat
teamDefense teammateDown teammateRevived
```

La voz de selección se dispara al confirmar. Durante la partida, `combo` empieza en el tercer combo y `danger` se dispara al entrar en peligro crítico. La alarma competitiva puede repetirse mientras dure el peligro. En Blitz, el compañero vivo presenta las líneas de caída y rescate. El mezclador admite hasta cuatro voces simultáneas, una por plaza. El evento vocal más reciente sustituye de inmediato al anterior de esa plaza. Las voces tienen un compresor y un ajuste de ganancia según su solapamiento. Los buses de peligro y SURGE siguen separados del compresor de diálogos.

Las 72 traducciones españolas están en `src/characters/subtitles/es.json`, organizadas por ID de personaje y evento. `en.json` puede añadirse con el mismo esquema. El catálogo de audio apunta siempre a `ja/`. El subtítulo aparece al reproducirse la voz y se retira al terminarla o interrumpirla. Si la voz está desactivada o el archivo falla, el texto se muestra temporalmente y el siguiente evento lo reemplaza. Los recursos nuevos se incorporan al volver a ejecutar `npm run build`.

Las preferencias de animaciones de ataques, voces de ataques y subtítulos están en **Configuración → Audio y pantalla**. El ajuste general **Reducir efectos** también se aplica a los retratos. La posición de piezas y los avisos de peligro y SURGE se mantienen visibles.

Los subtítulos aparecen junto a la selección y debajo del tablero correspondiente durante la partida. Si el tablero se retira en el cierre, los subtítulos pendientes pasan a la fila de ese jugador en la clasificación.

Vite emite las voces como archivos con hash en `dist/assets/`. Después de compilar, `npm run test:e2e -- tests/e2e/voices.spec.ts` comprueba los nombres, compara los archivos emitidos con las grabaciones y los descarga y decodifica en el navegador. También verifica la reproducción y los subtítulos con los controles de voz activos y desactivados.
