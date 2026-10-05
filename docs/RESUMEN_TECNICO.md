# Resumen técnico

## Arquitectura

Aplicación de una sola pieza en Streamlit. pandas valida CSV y genera variables basadas en los cinco partidos previos de cada club. scikit-learn combina codificación one-hot de equipos y variables estandarizadas con regresión logística multiclase. SQLite persiste los formularios de retroalimentación localmente.

## Evaluación

La división es cronológica (primer 80 % para ajuste; último 20 % para evaluación). Métricas: exactitud, log loss y reporte por clase; se presenta matriz de confusión. No se mezcla aleatoriamente el tiempo. Las predicciones de un encuentro utilizan los estados de forma disponibles en el historial.

## Riesgos / mejoras futuras

- Un torneo/temporada puede ser insuficiente para estimar rendimiento estable.
- Cambios de formato, fechas y calidad de origen requieren revisión al importar.
- Incorporar pruebas automatizadas, validación cruzada temporal, calibración de probabilidades y una fuente recurrente de datos antes de despliegue.
- Definir consentimiento, retención y anonimización si se recogen datos personales de los tres usuarios de evaluación.
- Para acceso multiusuario, sustituir SQLite local por un servicio de base de datos y añadir autenticación, copias de seguridad y controles de acceso.
