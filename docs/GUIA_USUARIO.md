# Guía de usuario

1. Instala Python 3.10+ y ejecuta los comandos de instalación del README.
2. Inicia `streamlit run app.py` y abre la dirección local que muestra la terminal.
3. Descarga un CSV de La Liga de Football-Data.co.uk y cárgalo con el control de la barra lateral. La plantilla incluida permite comprobar el formato, pero sus datos son ficticios.
4. Usa **Resumen** para revisar indicadores y **Partidos** para filtrar y exportar resultados.
5. Usa **Modelo** después de cargar al menos 20 partidos para evaluar el modelo con la parte más reciente del historial.
6. Usa **Predicción** para estimar un cruce de equipos incluidos en el CSV.
7. Usa **Retroalimentación** para documentar la comparación con resultados reales. La información se guarda en la máquina donde corre la aplicación.

## Formato de archivo

Columnas obligatorias: `Date`, `HomeTeam`, `AwayTeam`, `FTHG`, `FTAG`. El parser admite fechas comunes día/mes/año. Ejemplo: `31/08/2024, Barcelona, Real Valladolid, 7, 0`.

## Interpretación

La salida son probabilidades del modelo, no certezas. La exactitud depende del periodo, calidad, cantidad y composición de los datos. No interpretes una meta del 80 % como promesa de rendimiento.
