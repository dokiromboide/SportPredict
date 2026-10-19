"""Chronological football features, evaluation and forecasting.

Outcomes, corners and cards of the predicted match never enter its features.
All matches on the same date see the same pre-date history.
"""
from __future__ import annotations

import io
from collections import defaultdict

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, log_loss
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

LABELS = {"H": "Victoria local", "D": "Empate", "A": "Victoria visitante"}
NUMERIC = ["home_form", "away_form", "home_goal_diff", "away_goal_diff"]
FEATURES = ["HomeTeam", "AwayTeam", *NUMERIC]
REQUIRED = ["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"]
OPTIONAL = ["HC", "AC", "HY", "AY", "HS", "AS", "HST", "AST"]


def load_csv(content: bytes) -> pd.DataFrame:
    """Accept Football-Data / ISO dates; report removed rows via DataFrame attrs."""
    if not content or len(content) > 5 * 1024 * 1024:
        raise ValueError("El CSV debe contener datos y pesar como máximo 5 MB.")
    try:
        frame = pd.read_csv(io.BytesIO(content), encoding="utf-8-sig")
    except UnicodeDecodeError:
        frame = pd.read_csv(io.BytesIO(content), encoding="latin-1")
    frame.columns = frame.columns.str.strip()
    if not set(REQUIRED).issubset(frame.columns):
        raise ValueError("El CSV necesita Date, HomeTeam, AwayTeam, FTHG y FTAG.")
    total = len(frame)
    frame = frame[REQUIRED + [col for col in OPTIONAL if col in frame]].copy()
    # ISO dates are parsed explicitly: dayfirst=True would misread e.g. 2024-08-05.
    raw = frame.Date.astype(str).str.strip()
    iso = raw.str.match(r"^\d{4}-\d{2}-\d{2}$")
    dates = pd.Series(pd.NaT, index=frame.index, dtype="datetime64[ns]")
    dates.loc[iso] = pd.to_datetime(raw[iso], format="%Y-%m-%d", errors="coerce")
    dates.loc[~iso] = pd.to_datetime(raw[~iso], dayfirst=True, format="mixed", errors="coerce")
    frame["Date"] = dates
    for col in ["FTHG", "FTAG", *OPTIONAL]:
        if col in frame:
            frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame = frame.dropna(subset=REQUIRED)
    for col in ["HomeTeam", "AwayTeam"]:
        frame[col] = frame[col].astype(str).str.strip()
    valid = (
        frame.HomeTeam.ne(frame.AwayTeam)
        & frame.HomeTeam.str.len().between(1, 80)
        & frame.AwayTeam.str.len().between(1, 80)
        & frame.FTHG.between(0, 30) & frame.FTAG.between(0, 30)
        & frame.FTHG.mod(1).eq(0) & frame.FTAG.mod(1).eq(0)
        & (frame.Date <= pd.Timestamp.now().normalize())
    )
    frame = frame[valid].drop_duplicates(["Date", "HomeTeam", "AwayTeam"], keep="last")
    if frame.empty:
        raise ValueError("No hay partidos válidos: revisa fechas, equipos y marcadores.")
    frame[["FTHG", "FTAG"]] = frame[["FTHG", "FTAG"]].astype(int)
    for col in OPTIONAL:
        if col in frame:
            frame.loc[~frame[col].between(0, 100), col] = np.nan
    frame = frame.sort_values(["Date", "HomeTeam", "AwayTeam"]).reset_index(drop=True)
    frame.attrs["removed"] = total - len(frame)
    return frame


def outcome(home_goals, away_goals):
    return "H" if home_goals > away_goals else "A" if home_goals < away_goals else "D"


def _state(history, team):
    recent = history[team][-5:]
    return (
        float(np.mean([x[0] for x in recent])) if recent else 0.0,
        float(np.mean([x[1] for x in recent])) if recent else 0.0,
    )


def _feature_row(history, home, away):
    hf, hg = _state(history, home)
    af, ag = _state(history, away)
    return dict(HomeTeam=home, AwayTeam=away, home_form=hf, away_form=af,
                home_goal_diff=hg, away_goal_diff=ag)


def build_features(frame):
    history = defaultdict(list)
    rows = []
    for date, matches in frame.groupby("Date", sort=True):
        pending = []
        for row in matches.itertuples():
            target = outcome(row.FTHG, row.FTAG)
            rows.append(dict(Date=date, target=target, **_feature_row(history, row.HomeTeam, row.AwayTeam)))
            pending.extend([
                (row.HomeTeam, (3 if target == "H" else 1 if target == "D" else 0, row.FTHG - row.FTAG)),
                (row.AwayTeam, (3 if target == "A" else 1 if target == "D" else 0, row.FTAG - row.FTHG)),
            ])
        for team, result in pending:
            history[team].append(result)
    return pd.DataFrame(rows), history


def estimator():
    return Pipeline([
        ("features", ColumnTransformer([
            ("teams", OneHotEncoder(handle_unknown="ignore"), ["HomeTeam", "AwayTeam"]),
            ("stats", StandardScaler(), NUMERIC),
        ])),
        ("classifier", LogisticRegression(max_iter=1500, class_weight="balanced", random_state=42)),
    ])


def train(frame):
    features, _ = build_features(frame)
    if len(features) < 30:
        raise ValueError("Se necesitan al menos 30 partidos para entrenar y evaluar.")
    dates = features.Date.drop_duplicates().sort_values().tolist()
    if len(dates) < 5:
        raise ValueError("Se necesitan partidos en al menos cinco fechas distintas.")
    boundary = dates[min(max(int(len(dates) * .8), 1), len(dates) - 1)]
    training = features[features.Date < boundary]
    test = features[features.Date >= boundary]
    if set(training.target) != set(LABELS):
        raise ValueError("El tramo de entrenamiento necesita victorias locales, empates y victorias visitantes.")
    model = estimator().fit(training[FEATURES], training.target)
    predicted = model.predict(test[FEATURES])
    return model, features, test, predicted


def evaluate(frame):
    model, features, test, predicted = train(frame)
    counts = features[features.Date < test.Date.min()].target.value_counts()
    baseline = str(counts.idxmax())
    return {
        "accuracy": float(accuracy_score(test.target, predicted)),
        "baseline": float((test.target == baseline).mean()),
        "log_loss": float(log_loss(test.target, model.predict_proba(test[FEATURES]), labels=model.classes_)),
        "training_count": int(len(features) - len(test)),
        "test_count": int(len(test)),
        "test_from": str(test.Date.min().date()),
        "test_to": str(test.Date.max().date()),
        "confusion": confusion_matrix(test.target, predicted, labels=["H", "D", "A"]).tolist(),
        "labels": ["Local", "Empate", "Visitante"],
    }


def forecast(frame, home, away):
    if home == away:
        raise ValueError("Selecciona dos equipos diferentes.")
    teams = set(frame.HomeTeam) | set(frame.AwayTeam)
    if home not in teams or away not in teams:
        raise ValueError("Ambos equipos deben tener historial antes de la fecha seleccionada.")
    features, history = build_features(frame)
    if len(features) < 30 or set(features.target) != set(LABELS):
        raise ValueError("No hay suficiente historial previo (mínimo 30 partidos y los tres resultados).")
    model = estimator().fit(features[FEATURES], features.target)
    row = pd.DataFrame([_feature_row(history, home, away)])
    values = model.predict_proba(row[FEATURES])[0]
    return {key: float(value) for key, value in zip(model.classes_, values)}


def team_form(frame, team, size=5):
    games = frame[(frame.HomeTeam == team) | (frame.AwayTeam == team)].tail(size)
    result = []
    for row in games.itertuples():
        gf, ga = (row.FTHG, row.FTAG) if row.HomeTeam == team else (row.FTAG, row.FTHG)
        result.append({"date": str(row.Date.date()), "result": "V" if gf > ga else "E" if gf == ga else "D",
                       "goals": int(gf), "against": int(ga)})
    return result


def average_stat(frame, team, home_col, away_col):
    if home_col not in frame or away_col not in frame:
        return None
    recent = frame[(frame.HomeTeam == team) | (frame.AwayTeam == team)].tail(10)
    values = pd.concat([recent.loc[recent.HomeTeam == team, home_col],
                        recent.loc[recent.AwayTeam == team, away_col]]).dropna()
    return float(values.mean()) if not values.empty else None
