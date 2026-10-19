# Guía de usuario

## Abrir

Instala las dependencias del README y ejecuta **python server.py** o haz doble clic
en **iniciar.bat**. Abre http://127.0.0.1:8000.

## Navegación

En computador hay barra lateral; en celular, barra inferior. El icono de gráfico
del panel abre Estadísticas. El panel muestra un encuentro histórico, probabilidades,
forma reciente y promedios. La fecha de corte indica hasta cuándo se entrenó.

## Analizar

En **Partidos**, usa la búsqueda superior o la lupa del celular, filtra por equipo
y cambia de página. **Analizar** abre una recreación calculada solo con partidos
previos. Las primeras jornadas pueden no tener historial suficiente; se explica
el motivo y puedes seleccionar otro encuentro.

En **Predicciones**, elige dos equipos distintos y pulsa **Calcular probabilidades**.
Esto simula un cruce con todo el historial cargado.

En **Partidos → Programados por ti**, agrega fecha, hora y equipos. No se sincroniza
con un calendario oficial. Puedes guardar la predicción y, desde la fecha del
partido, registrar su marcador. El resultado actualiza el historial, sin modificar
el CSV de entrenamiento.

## Guardar y personalizar

**Guardar análisis** conserva el cálculo en SQLite. Repetir el mismo partido o
cruce con la misma versión de datos no crea duplicados.

**Mi historial** filtra por disponibilidad de resultado. Las coincidencias incluyen
recreaciones históricas y no equivalen a éxito en pronósticos en vivo.

En **Perfil**, cambia nombre, rol y favorito. Es un perfil local sin registro ni
pagos; se conserva al reiniciar.

## Importar

Descarga los datos actuales si deseas conservar una copia. Selecciona un CSV y
pulsa **Importar y entrenar**. Debe tener Date, HomeTeam, AwayTeam, FTHG y FTAG.
HC/AC son córners; HY/AY son amarillas. Máximo 5 MB.

Una importación válida reemplaza el conjunto activo y conserva el historial.
Si el archivo no sirve para entrenar, se explica el problema y se mantiene el
dataset anterior.

## Interpretación

Las probabilidades son estimaciones. Córners y tarjetas son promedios recientes.
Los datos iniciales son históricos de 2024/25; no incluyen lesiones, alineaciones
ni información en vivo. La aplicación informa su corte de datos.
