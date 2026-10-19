"""Local persistence and application operations. One profile per installation."""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import threading
import uuid
from datetime import date, datetime
from contextlib import contextmanager
from pathlib import Path

import pandas as pd

from .model import average_stat, evaluate, forecast, load_csv, outcome, team_form

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA = ROOT / "data" / "laliga_2024_25.csv"
NAMES = {
    "Ath Bilbao": "Athletic Club", "Ath Madrid": "Atlético de Madrid",
    "Sociedad": "Real Sociedad", "Betis": "Real Betis", "Celta": "Celta de Vigo",
    "Espanol": "RCD Espanyol", "Alaves": "Deportivo Alavés", "Vallecano": "Rayo Vallecano",
    "Barcelona": "FC Barcelona", "Valladolid": "Real Valladolid", "Leganes": "CD Leganés",
    "Mallorca": "RCD Mallorca", "Las Palmas": "UD Las Palmas",
}


class Service:
    def __init__(self, path=None):
        self.path = Path(path or os.getenv("SPORTPREDICT_DB", ROOT / "sportpredict.db"))
        self.lock = threading.RLock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._cache = {}
        self.metrics = None
        with self.connection() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS dataset (
                    id INTEGER PRIMARY KEY CHECK(id=1), content BLOB NOT NULL, source TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS profile (
                    id INTEGER PRIMARY KEY CHECK(id=1), name TEXT, role TEXT, favorite TEXT);
                CREATE TABLE IF NOT EXISTS predictions (
                    id TEXT PRIMARY KEY, request_key TEXT UNIQUE, payload TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE IF NOT EXISTS fixtures (
                    id TEXT PRIMARY KEY, home TEXT, away TEXT, date TEXT, time TEXT,
                    home_goals INTEGER, away_goals INTEGER);
                CREATE TABLE IF NOT EXISTS feedback (
                    id INTEGER PRIMARY KEY, user_name TEXT, home_team TEXT, away_team TEXT,
                    prediction TEXT, actual TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
            """)
            conn.execute("INSERT OR IGNORE INTO profile VALUES(1,?,?,?)",
                         ("Mi perfil", "Analista deportivo", "Real Madrid"))
            row = conn.execute("SELECT content,source FROM dataset WHERE id=1").fetchone()
            if row is None:
                raw = DEFAULT_DATA.read_bytes()
                source = "La Liga 2024/25 · Football-Data.co.uk"
                conn.execute("INSERT INTO dataset VALUES(1,?,?)", (raw, source))
            else:
                raw, source = row
        self._load(raw, source)

    @contextmanager
    def connection(self):
        conn = sqlite3.connect(self.path, timeout=30)
        conn.row_factory = sqlite3.Row
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def _load(self, raw, source):
        self.frame = load_csv(raw)
        self.source = source
        self.revision = hashlib.sha256(raw).hexdigest()[:16]
        self.teams = sorted(set(self.frame.HomeTeam) | set(self.frame.AwayTeam))
        self.frame["id"] = [
            "m-" + hashlib.sha256(f"{r.Date.date()}:{r.HomeTeam}:{r.AwayTeam}".encode()).hexdigest()[:16]
            for r in self.frame.itertuples()
        ]
        self._cache = {}
        self.metrics = None

    def team(self, name):
        slug = "".join(c.lower() if c.isalnum() else "-" for c in name)
        crest = ROOT / "frontend" / "assets" / "clubs" / f"{slug}.png"
        return {"id": name, "name": NAMES.get(name, name),
                "crest": f"/assets/clubs/{slug}.png" if crest.exists() else None}

    def match(self, row):
        return {"id": row.id, "home": row.HomeTeam, "away": row.AwayTeam,
                "date": str(row.Date.date()), "time": None, "kind": "historical",
                "home_goals": int(row.FTHG), "away_goals": int(row.FTAG)}

    def profile(self):
        with self.connection() as conn:
            return dict(conn.execute("SELECT name,role,favorite FROM profile WHERE id=1").fetchone())

    def update_profile(self, body):
        name = str(body.get("name", "")).strip()
        role = str(body.get("role", "")).strip()
        favorite = str(body.get("favorite", ""))
        if not 1 <= len(name) <= 60 or not 1 <= len(role) <= 80 or favorite not in self.teams:
            raise ValueError("Introduce un nombre, un rol y un equipo favorito válidos.")
        with self.connection() as conn:
            conn.execute("UPDATE profile SET name=?,role=?,favorite=? WHERE id=1", (name, role, favorite))
        return self.profile()

    def summary(self):
        return {
            "matches": len(self.frame), "teams": len(self.teams), "source": self.source,
            "from": str(self.frame.Date.min().date()), "to": str(self.frame.Date.max().date()),
            "goals": int(self.frame.FTHG.sum() + self.frame.FTAG.sum()), "revision": self.revision,
            "removed": self.frame.attrs.get("removed", 0),
        }

    def matches(self, search="", team="", limit=12, offset=0):
        rows = self.frame.sort_values("Date", ascending=False)
        if team:
            rows = rows[(rows.HomeTeam == team) | (rows.AwayTeam == team)]
        if search:
            names = rows.HomeTeam.map(lambda x: NAMES.get(x, x)) + " " + rows.AwayTeam.map(lambda x: NAMES.get(x, x))
            rows = rows[names.str.casefold().str.contains(search.casefold(), regex=False)]
        return {"total": len(rows), "items": [self.match(row) for row in rows.iloc[offset:offset + limit].itertuples()]}

    def fixtures(self):
        with self.connection() as conn:
            return [dict(row, kind="scheduled") for row in conn.execute("SELECT * FROM fixtures ORDER BY date,time")]

    def add_fixture(self, body):
        home, away = body.get("home"), body.get("away")
        day, time = str(body.get("date", "")), str(body.get("time", "20:00"))
        if home not in self.teams or away not in self.teams or home == away:
            raise ValueError("Selecciona dos equipos diferentes del conjunto de datos.")
        try:
            day = date.fromisoformat(day).isoformat()
            datetime.strptime(time, "%H:%M")
        except ValueError:
            raise ValueError("La fecha o la hora no son válidas.")
        if day < date.today().isoformat():
            raise ValueError("Programa un partido para hoy o una fecha posterior.")
        with self.connection() as conn:
            duplicate = conn.execute("SELECT id FROM fixtures WHERE home=? AND away=? AND date=?", (home, away, day)).fetchone()
            if duplicate:
                raise ValueError("Este partido ya está programado.")
            ident = "f-" + uuid.uuid4().hex[:16]
            conn.execute("INSERT INTO fixtures(id,home,away,date,time) VALUES(?,?,?,?,?)", (ident, home, away, day, time))
        return next(row for row in self.fixtures() if row["id"] == ident)

    def record_result(self, ident, body):
        goals = [body.get("home_goals"), body.get("away_goals")]
        if any(type(g) is not int or not 0 <= g <= 30 for g in goals):
            raise ValueError("Los goles deben ser enteros entre 0 y 30.")
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM fixtures WHERE id=?", (ident,)).fetchone()
            if row is None:
                raise ValueError("No se encontró el partido.")
            if row["date"] > date.today().isoformat():
                raise ValueError("Solo puedes registrar resultados de partidos con fecha de hoy o anterior.")
            conn.execute("UPDATE fixtures SET home_goals=?,away_goals=? WHERE id=?", (*goals, ident))
            for saved in conn.execute("SELECT id,payload FROM predictions"):
                item = json.loads(saved["payload"])
                if item.get("match_id") == ident:
                    item["actual"] = outcome(*goals)
                    conn.execute("UPDATE predictions SET payload=? WHERE id=?", (json.dumps(item), saved["id"]))
        self._cache.clear()
        return {"saved": True}

    def predict(self, body):
        home, away, match_id = body.get("home"), body.get("away"), body.get("match_id")
        day, kind, actual = None, "simulation", None
        if match_id:
            if str(match_id).startswith("m-"):
                rows = self.frame[self.frame.id == match_id]
                if rows.empty:
                    raise ValueError("No se encontró el partido en los datos actuales.")
                row = rows.iloc[0]
                home, away = row.HomeTeam, row.AwayTeam
                day, kind, actual = str(row.Date.date()), "historical", outcome(row.FTHG, row.FTAG)
            else:
                with self.connection() as conn:
                    row = conn.execute("SELECT * FROM fixtures WHERE id=?", (match_id,)).fetchone()
                if row is None:
                    raise ValueError("No se encontró el partido programado.")
                home, away, day, kind = row["home"], row["away"], row["date"], "scheduled"
                if row["home_goals"] is not None:
                    actual = outcome(row["home_goals"], row["away_goals"])
        if home not in self.teams or away not in self.teams or home == away:
            raise ValueError("Selecciona dos equipos distintos del conjunto de datos.")
        key = f"{self.revision}:{match_id or f'{home}:{away}'}"
        if key in self._cache:
            return self._cache[key]
        # A historical replay excludes the target date in its entirety.
        past = self.frame[self.frame.Date < pd.Timestamp(day)] if day else self.frame
        probs = forecast(past, home, away)
        h2h = past[((past.HomeTeam == home) & (past.AwayTeam == away)) | ((past.HomeTeam == away) & (past.AwayTeam == home))]
        stats = {}
        for name, hc, ac in [("corners", "HC", "AC"), ("cards", "HY", "AY")]:
            h, a = average_stat(past, home, hc, ac), average_stat(past, away, hc, ac)
            stats[name] = round(h + a, 1) if h is not None and a is not None else None
        payload = {
            "home": home, "away": away, "match_id": match_id, "date": day,
            "kind": kind, "actual": actual, "probabilities": probs,
            "favorite": max(probs, key=probs.get), "stats": stats,
            "home_form": team_form(past, home), "away_form": team_form(past, away),
            "h2h": [self.match(row) for row in h2h.tail(5).itertuples()],
            "training_count": len(past), "as_of": str(past.Date.max().date()),
            "revision": self.revision, "request_key": key,
        }
        if len(self._cache) >= 100:
            self._cache.clear()
        self._cache[key] = payload
        return payload

    def save_prediction(self, body):
        payload = self.predict(body)
        with self.connection() as conn:
            ident = uuid.uuid4().hex
            conn.execute("INSERT OR IGNORE INTO predictions(id,request_key,payload) VALUES(?,?,?)",
                         (ident, payload["request_key"], json.dumps(payload)))
            row = conn.execute("SELECT id FROM predictions WHERE request_key=?", (payload["request_key"],)).fetchone()
        return {"id": row["id"], "saved": True}

    def history(self):
        with self.connection() as conn:
            return [dict(json.loads(row["payload"]), id=row["id"], created_at=row["created_at"])
                    for row in conn.execute("SELECT * FROM predictions ORDER BY created_at DESC,id DESC")]

    def delete_prediction(self, ident):
        with self.connection() as conn:
            conn.execute("DELETE FROM predictions WHERE id=?", (ident,))
        return {"deleted": True}

    def statistics(self):
        if self.metrics is None:
            self.metrics = evaluate(self.frame)
        records = []
        for team in self.teams:
            games = self.frame[(self.frame.HomeTeam == team) | (self.frame.AwayTeam == team)]
            form = team_form(games, team, len(games))
            records.append({
                "team": team, "played": len(form), "wins": sum(x["result"] == "V" for x in form),
                "draws": sum(x["result"] == "E" for x in form), "losses": sum(x["result"] == "D" for x in form),
                "goals": sum(x["goals"] for x in form), "against": sum(x["against"] for x in form),
                "points": sum(3 if x["result"] == "V" else 1 if x["result"] == "E" else 0 for x in form),
            })
        records.sort(key=lambda x: (x["points"], x["goals"] - x["against"], x["goals"]), reverse=True)
        distribution = self.frame.apply(lambda r: outcome(r.FTHG, r.FTAG), axis=1).value_counts()
        return {"metrics": self.metrics, "standings": records,
                "distribution": {key: int(distribution.get(key, 0)) for key in ["H", "D", "A"]}}

    def bootstrap(self):
        featured = self.frame[(self.frame.HomeTeam == "Real Madrid") & (self.frame.AwayTeam == "Barcelona")]
        if featured.empty:
            featured = self.frame.tail(1)
        return {"summary": self.summary(), "teams": [self.team(t) for t in self.teams],
                "profile": self.profile(), "featured": self.match(next(featured.tail(1).itertuples())),
                "matches": self.matches(limit=6), "fixtures": self.fixtures(), "history": self.history()}

    def import_data(self, raw, name):
        frame = load_csv(raw)
        # Validate that the uploaded dataset can support the complete application
        # before replacing any existing persisted dataset.
        metrics = evaluate(frame)
        clean = frame.to_csv(index=False, date_format="%Y-%m-%d").encode("utf-8")
        removed = frame.attrs.get("removed", 0)
        source = f"CSV importado · {Path(name).name[:80]}"
        with self.connection() as conn:
            conn.execute("INSERT OR REPLACE INTO dataset VALUES(1,?,?)", (clean, source))
        self._load(clean, source)
        self.metrics = metrics
        if self.profile()["favorite"] not in self.teams:
            profile = self.profile()
            self.update_profile(dict(profile, favorite=self.teams[0]))
        return dict(self.summary(), removed=removed)
