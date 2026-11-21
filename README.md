# TETRAVOLT

Arena de bloques descendentes. **Versus Zone** reúne de dos a cuatro plazas en un todos contra todos. **Equipos 2v2** enfrenta a J1 y J2 contra J3 y J4. **2v2 Blitz** enfrenta a los mismos equipos con un tablero activo por lado, relevos y rescates. Cada plaza puede ser una persona o una IA de nivel 1 a 10. **Blitz online** permite que dos a cuatro personas jueguen en una sala privada desde navegadores separados. Las plazas libres se completan con IA.

Para publicar el juego y activar las salas, sigue la [guía de despliegue de TETRAVOLT](docs/despliegue.md).

Blitz reproduce en bucle `src/music/blitz.mp3` a un nivel bajo y estable. Ajusta su volumen en **Configuración → Audio y pantalla → Música (Blitz)**.

## Windows

Se requiere Node.js 22.12 o posterior. Desde PowerShell, en esta carpeta:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run preview
```

Abre **http://127.0.0.1:4173**. Para desarrollar con recarga automática, usa `npm.cmd run dev` y abre **http://127.0.0.1:5173**. Usa la misma dirección y puerto en sesiones sucesivas para conservar la configuración de ese origen.

La instalación inicial requiere internet. El juego compilado se sirve desde `dist/` mediante HTTP local y funciona con internet desconectado. Los gráficos, sonidos e IA se ejecutan localmente.

1. Elige **Versus Zone**, **Equipos 2v2** o **2v2 Blitz**.
2. Selecciona **Persona** o **IA** en cada plaza. Al añadir una IA, la plaza queda lista y puedes elegir su dificultad. El **nivel 10, Ultra experto**, usa Hold, giros avanzados y evalúa la pieza actual y las dos siguientes.
3. Pulsa **Marcar listo** para cada persona que jugará. En Versus Zone inicia con dos, tres o cuatro plazas listas. En los modos por equipo confirma las cuatro. En la sala de Blitz, **Reglas de Blitz** permite cambiar el tiempo de relevo, la protección, las resurrecciones y los efectos.

Para asignar un mando, abre **Controles**, elige J1, J2, J3 o J4, pulsa **Asignar pulsando un botón** y luego pulsa un botón en el mando. Repite para los demás jugadores. El juego asigna el dispositivo y carga todas las acciones disponibles de su perfil automáticamente. El perfil estándar usa las asignaciones de la tabla. El perfil genérico aprovecha los botones disponibles y, cuando corresponde, los primeros dos ejes. Algunos mandos genéricos informan los botones en un orden distinto o tienen menos entradas físicas. Puedes revisar y ajustar cualquier acción en **Controles → Mando**. También puedes seleccionar dispositivos en la sala.

Para teclados compartidos se usan posiciones físicas de tecla. Algunos teclados limitan combinaciones simultáneas por su hardware. Los conflictos entre jugadores se comprueban solo entre las plazas que usan teclado. Si recuperas el teclado para una plaza de mando o IA, el juego te pide corregir las teclas que coincidan. Los nombres, dispositivos, controles y opciones se guardan en el navegador.

Si se desconecta un mando asignado, los cuatro tableros se pausan. Reconéctalo y pulsa **Continuar**. La reconexión utiliza el identificador y el índice del navegador. Si cambia el índice, se recupera la asignación cuando queda un único candidato con el mismo identificador. Para varios dispositivos idénticos cuyos índices cambian, puede ser necesario volver a la sala y asignarlos de nuevo. Se verificaron cuatro mandos simulados con Gamepad API en Chromium. Falta la comprobación física con cuatro mandos y la evaluación auditiva en altavoces.

## Controles predeterminados

| Acción | J1 | J2 | J3 | J4 | Mando estándar |
|---|---|---|---|---|---|
| Izquierda | A | J | ← | Num 4 | Cruceta ← |
| Derecha | D | L | → | Num 6 | Cruceta → |
| Soft Drop | S | K | ↓ | Num 5 | Cruceta ↓ |
| Hard Drop | W | I | ↑ | Num 8 | Cruceta ↑ |
| Giro horario | E | O | Punto | Num 9 | A / × |
| Giro antihorario | Q | U | Coma | Num 7 | X / □ |
| Giro 180° | R | P | Barra diagonal | Num 1 | B / ○ |
| Hold | F | H | Shift derecho | Num 0 | LB / L1 |
| Zone | C | N | Enter | Enter numérico | RB / R1 |
| Objetivo anterior | Z | B | Punto y coma | Num 2 | LT / L2 |
| Objetivo siguiente | X | M | Apóstrofo | Num 3 | RT / R2 |
| Pausa | 1 | 2 | 3 | 4 | Start / Options |
| Cambiar postura (Blitz) | T | V | [ | Num / | Y / △ |

**Esc** también pausa o reanuda la partida y cancela capturas. Las teclas de signos corresponden a las posiciones físicas `Period`, `Comma`, `Slash`, `Semicolon` y `Quote`, según la distribución del teclado. También puedes pausar y reanudar con los botones de la interfaz.

## Pruebas

```powershell
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Para ejecutar Playwright con Microsoft Edge ya instalado:

```powershell
$env:TETRAVOLT_BROWSER = 'msedge'
npm.cmd run test:e2e
```

Vitest cubre las reglas, la puntuación, los ataques por equipo, Zone simultánea, la victoria y la IA. Playwright comprueba los tableros, las salas variables, el 2v2 con IA, las entradas, los ajustes persistentes, los mandos simulados y la revancha.

## Código y reglas

- [Reglas de partida](docs/reglas.md)
- `src/engine/` contiene reglas, piezas, rotaciones, generación, Spins, basura, Zone, IA y coordinación de partidas.
- `src/input.ts`, `src/audio.ts` y `src/render.ts` gestionan entrada, audio y dibujo respectivamente.
- `src/main.ts`, `src/menu.ts` y `src/settings.ts` integran la partida, los menús y la persistencia.
