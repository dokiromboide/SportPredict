# SportPredict

Aplicación académica para analizar resultados de La Liga y estimar probabilidades de victoria local, empate y victoria visitante. Es un apoyo experimental: no garantiza resultados deportivos ni constituye asesoría para apuestas.

## Iniciar en Windows

Requiere Python 3.10 o superior.

```powershell
cd SportPredict
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
streamlit run app.py
```

Streamlit abrirá el panel en el navegador. La aplicación inicia con un conjunto ficticio de demostración, identificado como tal. Para usar resultados reales, descarga un CSV de España desde [Football-Data.co.uk](https://football-data.co.uk/spainm.php) y cárgalo desde la barra lateral.

## Datos admitidos

El CSV debe incluir `Date`, `HomeTeam`, `AwayTeam`, `FTHG` y `FTAG`. El sistema limpia fechas y marcadores inválidos y ordena partidos cronológicamente. Las columnas adicionales se conservan para exploración, pero el modelo actual no las usa.

El modelo de regresión logística usa la forma y la diferencia de goles promedio de los cinco partidos anteriores de cada equipo y los nombres de los equipos. La evaluación deja el 20 % cronológicamente más reciente como prueba. Requiere al menos 20 partidos. La cifra objetivo de 80 % que aparece en el acta no se presenta como alcanzada salvo que las métricas reales la respalden.

La página Retroalimentación guarda entradas localmente en `sportpredict.db` (SQLite). Los registros no se incorporan automáticamente al entrenamiento.

## Módulos

- **Resumen:** distribución de resultados, volumen mensual y marcadores recientes.
- **Partidos:** filtro por equipo y exportación CSV.
- **Modelo:** exactitud temporal, log loss, matriz de confusión y reporte por clase.
- **Predicción:** probabilidades para dos equipos seleccionados.
- **Retroalimentación:** registro de evaluaciones de usuarios en SQLite.

## Fuente y limitaciones

Football-Data.co.uk ofrece archivos CSV de resultados históricos y estadísticas de fútbol; revisa su página y condiciones actuales, cita la fuente en los entregables y verifica la calidad del archivo antes de analizarlo. Un conjunto de una sola temporada ofrece una muestra pequeña para generalizar. La predicción usa solo resultados pasados disponibles y no contempla lesiones, alineaciones ni cambios recientes de plantilla.

## Estructura

`app.py` contiene la interfaz, preparación de datos, entrenamiento y persistencia de retroalimentación. `requirements.txt` define las dependencias Python. `docs/` contiene la guía de uso y el resumen técnico.
