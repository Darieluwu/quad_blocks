# Reglas de QUAD BLOCKS

## Versus Zone y equipos

En **Versus Zone** entran las plazas que estén listas, de dos a cuatro. El último jugador en pie gana. Cada plaza conserva su número, color y control aunque haya espacios libres. Un mando desconectado solo pausa la partida si pertenece a una plaza humana que está jugando.

En **Equipos 2v2** J1 y J2 forman el Equipo A, y J3 y J4 forman el Equipo B. Las cuatro plazas deben estar listas y se pueden combinar personas e IA. Los ataques solo apuntan a integrantes vivos del equipo rival en cualquiera de los tres sistemas de objetivos. Cada jugador conserva su propio tablero, cola de basura y Zone. Un equipo gana cuando elimina a los dos rivales, aunque haya perdido a uno de sus integrantes. Ambos equipos empatan si pierden a sus últimos jugadores en el mismo tick.

## 2v2 Blitz

J1 y J2 se turnan por el Equipo A, y J3 y J4 por el Equipo B. La semilla elige al primer activo de cada equipo por separado. Cada turno dura 30 segundos efectivos con aviso en los últimos cinco. Las cuatro plazas usan sus propios tableros, piezas y controles. El reloj individual solo avanza mientras su tablero está activo, así que la basura en tránsito y los temporizadores de la pieza se reanudan donde quedaron.

Los tableros activos aprovechan la altura disponible. Las reservas quedan detrás, desplazadas hacia los lados exteriores. El reloj muestra los segundos entre ambos tableros y acentúa el aviso antes del relevo. Las reservas en peligro aparecen en rojo, con un temblor y gotas. Si se usa movimiento reducido, el color de peligro y el número del reloj siguen visibles.

Cuando ambos equipos se quedan sin reserva, se oculta el reloj y sigue el duelo. Si un compañero revive, comienza un turno completo y vuelven los relevos.

El reloj global avanza durante Zone. En la cuenta regresiva se bloquean las nuevas activaciones. En el último paso se procesan las entradas del par activo, se cierran sus Zones y se resuelven los rescates y ataques antes de intercambiar las plazas. La transición dura 400 ms y congela ambos motores. Si hay una caída en ese paso, tiene prioridad el relevo de emergencia. En ese relevo solo cambia el equipo que perdió a su activo, o ambos si las caídas fueron simultáneas. El rival que sigue activo conserva su tablero y su Zone. Cuando queda una persona en un equipo, sigue siendo su representante en todos los turnos. La energía que no se ha gastado se conserva. La energía consumida al activar Zone se paga al inicio.

**Cambiar postura** alterna entre Ataque y Defensa de equipo. Primero se cancela basura propia. En Defensa, la porción asignada al compañero se redondea hacia abajo y el resto va al rival activo. Con el ajuste inicial se dedica el 50 % a proteger al compañero y se pueden cancelar hasta seis líneas por turno. La porción que exceda el límite o que el compañero no pueda usar se descarta. Los ataques generados en un mismo paso se entregan después de simular a ambos activos, y nunca se dirigen a una reserva o un rival caído. Si ambos equipos pierden su último tablero en el mismo paso, hay empate.

### Resurrecciones

- **Primera**. Una limpieza Tetris o T-Spin con líneas, seguida de seis líneas de potencia ofensiva antes de cancelaciones.
- **Segunda**. Dos limpiezas válidas, seguidas de diez líneas de potencia ofensiva antes de cancelaciones.

La jugada que habilita la segunda etapa se dedica por completo a la primera. En Zone, solo las jugadas posteriores a la primera etapa aportan al acumulado de la segunda. Se acreditan al cerrar Zone, hasta seis puntos por activación de forma predeterminada. Los dos rescates son compartidos por cada equipo. El compañero vuelve a la reserva con tablero limpio, una secuencia nueva, Hold vacío, Zone al 0 %, sin basura y con los contadores de su nueva vida reiniciados. El rescate no consume recursos del activo. El equipo con dos caídos pierde aunque tenga un rescate en curso.

## IA

La escala va de **1 · Principiante** a **10 · Ultra experto**. Cada aumento reduce la espera entre movimientos y piezas. Los primeros niveles evalúan posiciones alcanzables con mayor margen de error. Desde el nivel 4 la IA contempla Hold y giros de 180°. Desde el 5 considera la siguiente pieza, desde el 7 puede buscar huecos mediante descensos y Wall Kicks, y desde el 9 considera dos piezas de adelanto. En 10 usa la cadencia más rápida, sin ruido al puntuar colocaciones. Prioriza evitar agujeros y pilas altas, construir ataques y aprovechar las limpiezas. Los movimientos pasan por el mismo motor que las entradas humanas.

Cuando Zone está habilitada, la IA la activa en el primer tick en que dispone del 100 % de energía, en cualquier nivel. Durante Zone da más peso a limpiar líneas. La semilla controla la secuencia y las decisiones que admiten variación.

## Tablero y generación

Cada tablero tiene 10 columnas, 20 filas visibles y 4 ocultas. La pieza aparece en el límite superior con al menos una fila visible. Un bloqueo enteramente oculto que no elimina líneas, una aparición en colisión o basura que expulsa un bloque por arriba causa la eliminación. El ranking invierte el orden de eliminación. Las eliminaciones en el mismo tick comparten puesto y el siguiente puesto se calcula contando a todas las personas empatadas.

El perfil Competitivo usa 7-Bag y secuencia compartida. Cada jugador tiene un generador separado con la misma semilla en ese modo. Hold y la velocidad individual cambian el punto de consumo, pero todos extraen en el mismo orden. Las secuencias independientes derivan una semilla por jugador. Una semilla vacía se genera al comenzar y se muestra durante la partida. Abre Configuración e introduce ese valor para repetir la secuencia.

- **7-Bag** mezcla una copia de cada pieza por bolsa.
- **14-Bag** mezcla dos copias de cada pieza por bolsa.
- **Random** extrae una de las siete piezas con probabilidad uniforme e independiente.
- **History Randomizer** guarda las cuatro últimas apariciones. Intenta hasta seis extracciones y acepta la sexta si las anteriores coinciden con el historial. Comienza con el historial vacío.

## Movimiento

La simulación avanza en pasos fijos de 1/60 s. El navegador dibuja según la frecuencia de pantalla. Las entradas por flanco se guardan hasta el siguiente tick. En un tick se aplica primero el desplazamiento horizontal y luego las acciones por flanco, en el orden de captura. Hold y giros temporalmente bloqueados se pueden reintentar durante el búfer configurado. El búfer cero descarta la acción si falla.

Los giros de 90° usan las tablas SRS de I y JLSTZ. O conserva su geometría. Los giros de 180° usan una tabla propia que prueba la posición original, una celda a cada lado, una celda arriba con sus dos desplazamientos laterales y finalmente una celda abajo. Al desactivar Floor Kicks se omiten todas las pruebas que elevan la pieza.

- **DAS** es la espera antes de repetir un lado mantenido. DAS 0 arranca la repetición con el intervalo ARR.
- **ARR 0** desliza hasta el obstáculo al cumplirse DAS. Si ambos son cero, el deslizamiento ocurre con la primera pulsación.
- **Soft Drop** desciende una celda al pulsar y continúa a la velocidad elegida al mantener. Con velocidad 0 solo funciona el paso inicial.
- **Lock Delay** se cuenta mientras la pieza toca un obstáculo por debajo. Con 0 se fija en el tick de contacto. Un movimiento horizontal o giro efectivo desde una posición apoyada puede reiniciar el plazo hasta el límite configurado. Hard Drop bloquea inmediatamente.
- **Gravedad** se expresa en celdas por segundo e incrementa con las líneas de cada jugador, hasta 120 celdas/s. Una gravedad inicial de 0 sin progresión permite mover las piezas manualmente.
- **Hold** se usa una vez hasta bloquear una pieza. Next muestra las cinco siguientes y Ghost señala dónde aterrizaría Hard Drop.

## Spins, cadenas y basura

Un Spin requiere que la última manipulación efectiva de la pieza sea un giro. El movimiento horizontal o descenso efectivo borra esa condición. Hard Drop permite conservarla si la pieza ya estaba en el punto de caída.

Un **T-Spin** requiere al menos tres esquinas ocupadas alrededor del pivote. Los bordes cuentan como ocupados. Con las dos esquinas delanteras ocupadas, se clasifica como completo. También se asciende a completo si se usó el quinto intento de SRS en un cuarto de giro. En los demás casos se clasifica como Mini. L, J, S y Z solo se reconocen si la pieza queda inmovilizada en las cuatro direcciones cardinales. Sus bonificaciones y contribución a Back-to-Back se pueden desactivar desde Configuración.

| Jugada | Basura predeterminada |
|---|---:|
| Single / Double / Triple / Tetris (cuatro líneas) | 0 / 1 / 2 / 4 |
| T-Spin Mini Single / Double | 1 / 2 |
| T-Spin Single / Double / Triple | 2 / 4 / 6 |
| L-Spin / J-Spin / S-Spin / Z-Spin con líneas | +2 |
| Back-to-Back | +1 |
| Perfect Clear | +10 |
| Combo | +1 cada 2 pasos, máximo +4 |

La primera limpieza consecutiva inicia el combo en 0. Un bloqueo sin líneas lo reinicia y conserva Back-to-Back. Una limpieza ordinaria rompe Back-to-Back. Las limpiezas difíciles consecutivas activan su bono. Perfect Clear se produce cuando la limpieza deja la matriz completa vacía.

Los ataques restan basura pendiente propia en orden de llegada, aunque su demora aún no haya vencido. El sobrante se entrega una vez al objetivo vivo. Cada paquete usa un agujero aleatorio común a sus líneas. La basura alcanza su tiempo de incorporación tras **650 ms** en Competitivo. Entonces puede entrar en el siguiente bloqueo **sin eliminación de líneas**, limitado a **8 líneas** por bloqueo. Los ataques del mismo tick se entregan después de actualizar los cuatro motores. Los eliminados no envían ni reciben nuevos ataques.

En **Manual** se comienza apuntando al siguiente jugador y se recorre el círculo de supervivientes con las acciones de objetivo. En **Aleatorio** se elige un rival vivo al inicio y se cambia a otro cada 10 segundos de juego cuando hay alternativas. Si el objetivo desaparece, se elige de inmediato un rival disponible y se reinicia el intervalo. **Defensa** apunta al último rival vivo que haya enviado basura. Antes de recibir un ataque, conserva un objetivo válido de respaldo. El modo de objetivos se selecciona en la sala y en Configuración.

Cada tablero muestra **Atacas a** y **Te atacan**. Una ficha indica quién te apunta y, si tiene un número, cuántas líneas suyas siguen pendientes. Las líneas rayadas del fondo proyectan el lugar y los huecos de la basura. La línea discontinua indica la altura que alcanzaría la pila con la próxima tanda, hasta el límite por bloqueo. Incluye la basura en tránsito y se ajusta si cancelas líneas. Durante Zone, la proyección indica cómo quedaría la pila al salir si la basura sigue pendiente.

Un proyectil del color del atacante conecta ambos tableros. Al llegar suena el impacto y el tablero receptor se sacude brevemente. La animación es visual y conserva el tiempo de entrega configurado para la basura. Con efectos reducidos o movimiento reducido en el navegador, se muestran los avisos y se reproduce el sonido sin proyectiles ni sacudidas.

## Zone

Zone se carga por cuartos del **25 %**. Al inicio hacen falta **6 líneas** fuera de Zone por cuarto, o **24** para una barra completa desde cero. Cuando un tablero llega a **24** y luego a **60** líneas fuera de Zone, el coste pasa a **8** y **10** líneas para todos a partir del siguiente paso de simulación. QUAD BLOCKS usa líneas para avanzar de fase. La referencia competitiva, Zone Battle, usa puntuación. Los T-Spins, Tetris y Perfect Clears aportan las filas que eliminan. Las líneas que aún no completan un cuarto se guardan al activar Zone. En Configuración, **Líneas por cuarto de Zone** con valor **0** usa las fases. Un valor positivo fija el coste para toda la partida. [Guía de Zone Battle](https://www.tetriseffect.game/beginners-community-guide/)

Zone se puede activar desde el **25 %** por defecto y dura en proporción a la energía consumida, con **12 s** al 100 % en Competitivo. El tiempo avanza de forma independiente para cada jugador. Durante Zone se suspende la gravedad automática. Siguen disponibles los movimientos, el descenso voluntario, Hold y Lock Delay. Las filas completadas se acumulan como un piso dorado y sólido en el fondo. Si se acaba el tiempo, una pieza se bloquea totalmente en las filas ocultas o la siguiente pieza no cabe, Zone se cierra, retira las filas acumuladas y resuelve el ataque. Si la siguiente pieza sigue bloqueada después de retirar las filas, el jugador queda eliminado.

Durante Zone la basura permanece en su cola y conserva su demora. Se acumula el ataque ordinario de cada limpieza y se resuelve al final. El total equivale a la suma de esos ataques más una unidad por línea y la bonificación Zone configurable, **+2** en Competitivo si se limpió al menos una línea. Este total cancela primero la basura pendiente y, a continuación, envía el sobrante al objetivo vivo, incluso si el cierre de Zone elimina al jugador. La basura que permanezca puede entrar en el siguiente bloqueo admisible.

## Alertas y opciones

La alerta temprana se activa a 14 filas de altura y la crítica a 18, contando la pila actual o la que proyecta la próxima tanda de basura. La amenaza de aparición también puede disparar la alerta crítica. El tablero cambia a rojo y suena una alarma al alcanzar el nivel crítico, con un intervalo mínimo de 3,5 s entre avisos del mismo nivel mientras persiste el peligro. Los indicadores de Zone, basura y peligro siguen visibles con efectos reducidos. El audio se habilita tras una interacción aceptada por el navegador y tiene volúmenes independientes para movimientos, jugadas, ataques, alertas y Zone.

Las cuatro filas superiores se ven en un tono distinto y siguen siendo el área de aparición. En peligro, cuatro casillas dibujan la silueta exacta de la próxima pieza en su posición inicial. Las casillas ya tapadas aparecen en rojo. Al cerrar Zone, el tablero muestra durante tres segundos el total de líneas y el nombre del resultado, como Tetris, Dodecatris o Perfectris.

Al acumular 20 líneas en Zone, las piezas pasan a aparecer en el espacio disponible sobre el piso dorado. Puedes usar esas filas superiores para sumar la línea 21, **Kirbtris**, o la 22, **Impossibilitris**, mientras el reloj de Zone siga activo y la siguiente pieza tenga sitio para aparecer. [Guía oficial de resultados de Zone](https://www.tetriseffect.game/beginners-community-guide/)

Los valores de partida se centralizan en `src/engine/rules.ts`. El perfil Casual usa gravedad de inicio y progresión más lentas, un Lock Delay más largo, menos basura por bloqueo y una Zone más larga. Editar parámetros de partida activa el perfil Personalizado.
