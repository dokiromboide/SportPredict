# SportPredict

Aplicación web para analizar La Liga con un frontend oscuro adaptable a móvil y
escritorio, API Python, modelos scikit-learn y persistencia SQLite.

## Iniciar

Requiere Python 3.11 o superior. Desde la carpeta del repositorio:

    python -m pip install -r requirements.txt
    python server.py

Abre **http://127.0.0.1:8000**. En Windows también puedes ejecutar **iniciar.bat**.
Incluye los **380 partidos reales de La Liga 2024/25** y funciona sin subir un
archivo ni configurar claves API. Los escudos están guardados localmente.
Las fuentes de Google son opcionales; sin conexión se usa la fuente del sistema.

Para instalar en un entorno virtual:

    python -m venv .venv
    .\.venv\Scripts\Activate.ps1
    python -m pip install -r requirements.txt
    python server.py

## Funciones

- **Panel principal:** probabilidades calculadas, promedio reciente de córners y
  tarjetas, forma y evolución de goles.
- **Partidos:** búsqueda, filtro por equipo, paginación y análisis histórico.
  Agrega encuentros propios y registra sus resultados manuales.
- **Predicciones:** simula cruces de los equipos del dataset.
- **Estadísticas:** exactitud, referencia simple, log loss, matriz de confusión y
  tabla estadística de equipos.
- **Historial:** guarda análisis sin duplicados, consulta coincidencias con
  resultados históricos o manuales y elimina análisis.
- **Perfil:** edita nombre, rol y favorito; importa o descarga CSV.

El perfil, dataset activo, encuentros programados y predicciones se guardan en
**sportpredict.db**, que no se publica en Git. Es una aplicación local de un solo
perfil. El servidor escucha en 127.0.0.1 y no incluye autenticación pública.

## Modelo y datos

La lógica del proyecto original se extrajo a **sportpredict/model.py**, compartida
por la web y Streamlit. El frontend llama a la API; Python calcula las
probabilidades y SQLite guarda los formularios.

La regresión logística usa equipos y forma/diferencia de goles de sus cinco
partidos anteriores. Los resultados de una fecha se incorporan solo después de
generar todas las variables de esa fecha.

- **Recreación histórica:** entrena exclusivamente con partidos anteriores a la
  fecha del encuentro. Su resultado real se usa después para comparación.
- **Simulación:** utiliza todo el historial completado disponible.
- **Evaluación:** separa el último 20 % de fechas completas, sin dividir una fecha
  entre entrenamiento y prueba. La forma de un partido de prueba puede usar
  resultados anteriores del periodo de prueba; el modelo no se reajusta con ellos.
- **Córners y tarjetas:** promedio combinado de los últimos diez encuentros de
  cada equipo. No son modelos adicionales.

Validación inicial: **51,1 % de exactitud**, **43,3 %** de referencia simple,
**290 partidos de entrenamiento**, **90 de prueba**, log loss **1,002**.
Las cifras se recalculan al cambiar los datos. El 80 % del acta es una meta, no un
rendimiento demostrado. Los partidos programados los añade el usuario; no hay
un calendario oficial ni resultados en vivo.

Fuente y licencia del dataset y procedencia de los escudos:
[data/README.md](data/README.md).

## CSV

Desde **Perfil → Importar y entrenar**. Columnas obligatorias:

    Date,HomeTeam,AwayTeam,FTHG,FTAG

Opcionales: HC, AC, HY, AY, HS, AS, HST, AST. Fechas ISO o día/mes/año.
Máximo 5 MB. Se descartan filas inválidas, marcadores no enteros o negativos,
autopartidos y duplicados. Mínimo 30 partidos, cinco fechas y las tres clases de
resultado en el tramo de entrenamiento. Una importación inválida conserva el
dataset anterior; una válida reemplaza los datos y mantiene el historial guardado.

## Streamlit

La interfaz anterior usa el mismo módulo de modelos y dataset persistido:

    python -m streamlit run app.py

## Comprobaciones

    python -m unittest discover -s tests -v
    node --check frontend/app.js

Node solo se necesita para esta comprobación de sintaxis. No se necesita Node,
npm ni compilación para ejecutar la web.

## Estructura

    frontend/                 HTML, CSS, JavaScript y escudos
    server.py                 API ASGI y servidor de archivos
    sportpredict/model.py     ETL, variables, entrenamiento y evaluación
    sportpredict/service.py   Operaciones de negocio y SQLite
    data/                     Dataset inicial y atribución
    tests/                    Pruebas de modelos y persistencia
    app.py                    Interfaz Streamlit compatible
    docs/                     Manual y descripción técnica

Variables opcionales: **PORT** (8000 por defecto) y **SPORTPREDICT_DB** (ruta de
SQLite). Consulta [docs/GUIA_USUARIO.md](docs/GUIA_USUARIO.md) y
[docs/RESUMEN_TECNICO.md](docs/RESUMEN_TECNICO.md).
