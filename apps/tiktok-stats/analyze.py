#!/usr/bin/env python3
"""
Analyse les stats collectées sur 30 jours, génère insights.json + dashboard.html.

Usage: python apps/tiktok-stats/analyze.py
Output:
  data/tiktok-stats/insights.json
  data/tiktok-stats/dashboard.html
"""
import json
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "tiktok-stats"
INSIGHTS_FILE = DATA_DIR / "insights.json"
DASHBOARD_FILE = DATA_DIR / "dashboard.html"
WINDOW_DAYS = 30

NICHE_KEYWORDS: dict[str, list[str]] = {
    "actu":         ["actu", "actualité", "info", "news"],
    "aion":         ["aion"],
    "business-ia":  ["business", "rag", "agent", "gpt", "llm", "freelance", "client", "gnaro"],
    "finance":      ["finance", "bourse", "argent", "invest", "crypto"],
    "motivation":   ["motivation", "mindset", "succès", "objectif"],
    "productivite": ["productivite", "productivité", "workflow", "outil", "obsidian"],
}


def detect_niche(desc: str) -> str:
    low = desc.lower()
    for niche, kws in NICHE_KEYWORDS.items():
        if any(k in low for k in kws):
            return niche
    return "unknown"


def load_window() -> list[dict]:
    cutoff = date.today() - timedelta(days=WINDOW_DAYS)
    by_id: dict[str, dict] = {}
    for f in sorted(DATA_DIR.glob("????-??-??.json")):
        if date.fromisoformat(f.stem) < cutoff:
            continue
        data = json.loads(f.read_text())
        for v in data.get("videos", []):
            vid = v["video_id"]
            if vid not in by_id or f.stem > by_id[vid].get("_date", ""):
                by_id[vid] = {**v, "_date": f.stem}
    return list(by_id.values())


def build_niche_stats(videos: list[dict]) -> dict[str, dict]:
    by_niche: dict[str, list] = {}
    for v in videos:
        niche = v.get("niche") or detect_niche(v.get("desc", ""))
        v["niche"] = niche
        by_niche.setdefault(niche, []).append(v)

    stats = {}
    for niche, vids in by_niche.items():
        views = [v["views"] for v in vids]
        eng = [(v["likes"] + v["comments"] + v["shares"]) / max(v["views"], 1) for v in vids]
        stats[niche] = {
            "count": len(vids),
            "avg_views": round(sum(views) / len(views)),
            "max_views": max(views),
            "avg_engagement": round(sum(eng) / len(eng), 4),
        }
    return stats


def build_daily_series() -> list[dict]:
    series = []
    for f in sorted(DATA_DIR.glob("????-??-??.json")):
        data = json.loads(f.read_text())
        videos = data.get("videos", [])
        if not videos:
            continue
        total_views = sum(v["views"] for v in videos)
        avg_eng = sum(
            (v["likes"] + v["comments"] + v["shares"]) / max(v["views"], 1)
            for v in videos
        ) / len(videos)
        series.append({"date": f.stem, "total_views": total_views, "avg_engagement": round(avg_eng, 4)})
    return series


def analyze() -> dict:
    videos = load_window()
    if not videos:
        return {}
    niche_stats = build_niche_stats(videos)
    ranked = sorted(niche_stats.items(), key=lambda x: x[1]["avg_views"], reverse=True)
    top_niches = [n for n, _ in ranked if n != "unknown"]
    top_avg = ranked[0][1]["avg_views"] if ranked else 1
    low_niches = [n for n, s in ranked if s["avg_views"] < top_avg * 0.3 and n != "unknown"]

    top_quarter = sorted(videos, key=lambda v: v["views"], reverse=True)[:max(1, len(videos) // 4)]
    durations = [v["duration_sec"] for v in top_quarter if v["duration_sec"] > 0]
    best_dur = (min(durations), max(durations)) if durations else (30, 55)

    return {
        "generated_at": date.today().isoformat(),
        "window_days": WINDOW_DAYS,
        "total_videos": len(videos),
        "top_niches": top_niches[:3],
        "low_performers": low_niches,
        "best_duration_range": list(best_dur),
        "niche_stats": niche_stats,
    }


def build_dashboard(insights: dict, daily: list[dict]):
    labels_daily = json.dumps([d["date"] for d in daily])
    views_daily  = json.dumps([d["total_views"] for d in daily])
    eng_daily    = json.dumps([d["avg_engagement"] for d in daily])

    niches = [n for n in insights.get("niche_stats", {}) if n != "unknown"]
    labels_niche = json.dumps(niches)
    avg_views    = json.dumps([insights["niche_stats"][n]["avg_views"] for n in niches])
    avg_eng      = json.dumps([insights["niche_stats"][n]["avg_engagement"] for n in niches])

    gen   = insights.get("generated_at", "—")
    total = insights.get("total_videos", 0)
    top   = ", ".join(insights.get("top_niches", [])) or "—"
    low   = ", ".join(insights.get("low_performers", [])) or "aucune"
    dur   = insights.get("best_duration_range", [30, 55])

    html = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TikTok Stats — Gnaro</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
:root{{--bg:#0a0908;--surface:#131210;--border:#27251f;--gold:#c0a047;--cream:#e2d8c2;--paper:#b8af9a;--red:#e05555;color-scheme:dark}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:var(--bg);color:var(--cream);font-family:'Space Mono',monospace;padding:32px 24px}}
h1{{font-size:1.4rem;color:var(--gold);letter-spacing:.1em;margin-bottom:4px}}
.meta{{font-size:.75rem;color:var(--paper);margin-bottom:32px}}
.kpi-row{{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:32px}}
.kpi{{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:16px 20px;min-width:140px;flex:1}}
.kpi-val{{font-size:1.6rem;color:var(--gold);font-weight:bold;word-break:break-word}}
.kpi-label{{font-size:.7rem;color:var(--paper);margin-top:4px;letter-spacing:.06em}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}}
.card{{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:20px}}
.card h2{{font-size:.75rem;color:var(--paper);letter-spacing:.1em;margin-bottom:16px}}
canvas{{max-height:220px}}
</style>
</head>
<body>
<h1>GNARO · TikTok Analytics</h1>
<p class="meta">Généré le {gen} · {total} vidéos · {WINDOW_DAYS} jours</p>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-val">{total}</div><div class="kpi-label">VIDÉOS ANALYSÉES</div></div>
  <div class="kpi"><div class="kpi-val" style="color:var(--cream);font-size:1rem">{top}</div><div class="kpi-label">TOP NICHES</div></div>
  <div class="kpi"><div class="kpi-val" style="color:var(--red);font-size:1rem">{low}</div><div class="kpi-label">LOW PERFORMERS</div></div>
  <div class="kpi"><div class="kpi-val">{dur[0]}–{dur[1]}s</div><div class="kpi-label">DURÉE OPTIMALE</div></div>
</div>
<div class="grid">
  <div class="card"><h2>VUES TOTALES PAR COLLECTE</h2><canvas id="cViews"></canvas></div>
  <div class="card"><h2>ENGAGEMENT MOYEN PAR COLLECTE</h2><canvas id="cEng"></canvas></div>
  <div class="card"><h2>VUES MOYENNES PAR NICHE</h2><canvas id="cNiche"></canvas></div>
  <div class="card"><h2>ENGAGEMENT PAR NICHE</h2><canvas id="cEngNiche"></canvas></div>
</div>
<script>
const p='#b8af9a',g='#c0a047',c='#e2d8c2',gr='#27251f';
const base={{plugins:{{legend:{{display:false}}}},scales:{{x:{{ticks:{{color:p,font:{{size:10}}}},grid:{{color:gr}}}},y:{{ticks:{{color:p,font:{{size:10}}}},grid:{{color:gr}}}}}}}};
new Chart('cViews',{{type:'line',data:{{labels:{labels_daily},datasets:[{{data:{views_daily},borderColor:g,backgroundColor:'rgba(192,160,71,.12)',tension:.35,fill:true,pointRadius:3,pointBackgroundColor:g}}]}},options:base}});
new Chart('cEng',{{type:'line',data:{{labels:{labels_daily},datasets:[{{data:{eng_daily},borderColor:c,backgroundColor:'rgba(226,216,194,.08)',tension:.35,fill:true,pointRadius:3,pointBackgroundColor:c}}]}},options:base}});
new Chart('cNiche',{{type:'bar',data:{{labels:{labels_niche},datasets:[{{data:{avg_views},backgroundColor:g,borderRadius:3}}]}},options:base}});
new Chart('cEngNiche',{{type:'bar',data:{{labels:{labels_niche},datasets:[{{data:{avg_eng},backgroundColor:c,borderRadius:3}}]}},options:base}});
</script>
</body>
</html>"""
    DASHBOARD_FILE.write_text(html)
    print(f"[analyze] dashboard → {DASHBOARD_FILE}")


def main():
    insights = analyze()
    if not insights:
        print("[analyze] Aucune donnée. Lance collect.py d'abord.")
        return

    INSIGHTS_FILE.write_text(json.dumps(insights, ensure_ascii=False, indent=2))
    daily = build_daily_series()
    build_dashboard(insights, daily)

    print(f"[analyze] {insights['total_videos']} vidéos · {WINDOW_DAYS}j")
    print(f"  Top    : {', '.join(insights['top_niches'])}")
    print(f"  Low    : {', '.join(insights['low_performers']) or 'aucune'}")
    print(f"  Durée  : {insights['best_duration_range'][0]}–{insights['best_duration_range'][1]}s")
    print(f"  → {INSIGHTS_FILE}")


if __name__ == "__main__":
    main()
