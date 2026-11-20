# Reglas de QUAD BLOCKS

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

En **Manual** se comienza apuntando al siguiente jugador y se recorre el círculo de supervivientes con las acciones de objetivo. En **Aleatorio** se selecciona un rival vivo por ataque. **Contraataque** prioriza al último atacante vivo y usa el objetivo válido actual cuando no lo hay.

## Zone

En Competitivo cada línea limpia fuera de Zone carga **12,5 %**. Se puede activar a partir del **25 %** y la duración es proporcional a la energía consumida, con **12 s** al 100 %. El tiempo avanza de forma independiente para cada jugador. Durante Zone se suspende la gravedad automática. Siguen disponibles todos los movimientos, el descenso voluntario, Hold y Lock Delay. Las líneas se eliminan del tablero en el acto y se acumulan en el contador.

Durante Zone la basura permanece en su cola y conserva su demora. Se acumula el ataque ordinario de cada limpieza y se resuelve al final. El total equivale a la suma de esos ataques más una unidad por línea y la bonificación Zone configurable, **+2** en Competitivo si se limpió al menos una línea. Este total cancela primero la basura pendiente y, a continuación, envía el sobrante. La basura que permanezca puede entrar en el siguiente bloqueo admisible. Si un jugador cae durante Zone pierde el ataque especial aún sin resolver.

## Alertas y opciones

La alerta temprana se activa a 14 filas de altura y la crítica a 18. La amenaza de aparición y la altura proyectada por basura también pueden elevar el nivel. Tras un aumento de nivel se avisa inmediatamente, con un intervalo mínimo de 3,5 s entre avisos del mismo nivel mientras persiste el peligro. La barra de Zone y el borde conservan su información con efectos reducidos. El audio se habilita tras una interacción aceptada por el navegador y tiene volúmenes independientes para movimientos, jugadas, ataques, alertas y Zone.

Los valores de partida se centralizan en `src/engine/rules.ts`. El perfil Casual usa gravedad de inicio y progresión más lentas, un Lock Delay más largo, menos basura por bloqueo y Zone más accesible. Editar parámetros de partida activa el perfil Personalizado.
