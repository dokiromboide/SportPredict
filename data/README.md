# Dataset inicial

laliga_2024_25.csv: 380 partidos reales de Primera División española, temporada
2024/25, con resultados, tiros, córners y tarjetas. No contiene encuentros futuros.

- Fuente original: https://football-data.co.uk/spainm.php
- Copia descargada: https://github.com/datasets/football-datasets/blob/main/datasets/la-liga/season-2425.csv
- Revisión consultada del repositorio: 436a51f15258e7d0c6042c231227202b70a5a0ae
- Descarga: 19 de octubre de 2026.
- El README del proveedor de la copia declara Open Data Commons PDDL:
  https://github.com/datasets/football-datasets/blob/main/datasets/la-liga/README.md

Los datos iniciales se guardan en SQLite durante el primer arranque. Las
importaciones posteriores se guardan en SQLite, sin modificar este archivo.

Los escudos en frontend/assets/clubs/ proceden de los enlaces públicos de la API
de equipos de ESPN (https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/teams).
Se emplean para identificar a los equipos. Los emblemas pertenecen a sus respectivos
clubes; no implican asociación con SportPredict. Los equipos sin recurso local
usan un distintivo con sus iniciales.
