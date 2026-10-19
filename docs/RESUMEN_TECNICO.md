# Resumen técnico

## Arquitectura

Frontend HTML/CSS/JavaScript sin compilación, servido desde el mismo origen que la
API Starlette/Uvicorn. Navegación por fragmentos, estados de carga/error,
contenido escapado, formularios etiquetados y diseño adaptable.

sportpredict/model.py concentra ETL, variables temporales, regresión logística y
evaluación. Lo consumen el servicio y app.py (Streamlit). service.py administra
el dominio y SQLite. El servidor se ejecuta en loopback para uso local.

## API

| Método | Ruta | Función |
| --- | --- | --- |
| GET | /api/health | Estado |
| GET | /api/bootstrap | Datos iniciales |
| GET | /api/matches | Históricos: search, team, limit, offset |
| POST | /api/predict | Calcula por match_id o por home/away |
| GET | /api/statistics | Métricas y tabla |
| GET, POST | /api/profile | Perfil |
| GET, POST | /api/fixtures | Programados |
| POST | /api/result/{id} | Marcador manual |
| POST | /api/save | Recalcula y guarda en servidor |
| GET | /api/history | Historial |
| DELETE | /api/history/{id} | Elimina análisis |
| GET | /api/dataset | Exporta CSV |
| POST | /api/dataset?name=archivo.csv | Importa bytes CSV |

Errores esperados: HTTP 400; archivos mayores de 5 MB: HTTP 413. Se rechazan
escrituras con Origin ajeno. No hay autenticación para exposición pública.

## Persistencia

SQLite almacena dataset, perfil, predicciones y partidos propios. Se conserva la
tabla feedback anterior. Cada predicción guarda probabilidades, versión de datos,
fecha de corte, resultado conocido y contexto. Una clave única evita duplicados.

La importación se valida y evalúa antes de sustituir el dataset. Un bloqueo por
proceso serializa operaciones. Los resultados se cachean en memoria por versión;
no se cargan modelos pickle de terceros.

## Modelo

One-hot encoding de equipos, puntos promedio y diferencia de goles de los cinco
partidos previos. Regresión logística multiclase con pesos balanceados y semilla
fija. Las variables de un día se generan antes de incorporar sus resultados.

Evaluación cronológica por fechas completas: primer 80 % para ajuste, tramo final
para prueba. La forma de una muestra de prueba puede usar partidos previos de la
misma prueba, pero el modelo no se reentrena con ellos.

Una recreación excluye la fecha completa del encuentro y el futuro. Una simulación
incluye todo el historial y el último resultado completado de cada equipo.

## Validación y límites

La suite unittest usa bases temporales y verifica fechas, limpieza, ausencia de
información futura, probabilidades, importación, persistencia y marcadores.
La interfaz se revisó a 1440 px y 390 px.

El dataset inicial obtiene 51,1 % de exactitud en 90 partidos de prueba frente a
43,3 % de referencia (290 para entrenamiento). No es validación prospectiva ni
prueba del objetivo del 80 %. Córners/tarjetas son promedios, no predicciones ML.

Antes de exponer el servicio públicamente serían necesarios autenticación,
aislamiento por usuario y operación de servidor. Esta entrega funciona localmente,
con un perfil y datos históricos.
