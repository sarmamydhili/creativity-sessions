# Creativity Sessions (SPARK MVP)

FastAPI + MongoDB (single **session** document per creativity run, append-only `history`), Next.js UI. GenAI runs **only in the backend** via a swappable `CreativeProvider`: with **`OPENAI_API_KEY`** set, the app uses the **OpenAI** API for SPARK, variations, perspectives, and downstream steps; use **`AI_PROVIDER=mock`** only for offline templates when you intentionally skip the LLM.

**Mongo defaults:** database `creative_spark`, collection `creative_sessions`, `mongodb://127.0.0.1:27017` (no auth).

## User flow (implemented)

1. **Home** — what the app does; start session or open history.  
2. **New session** — problem statement + optional title (+ optional `owner_id`). Creates session with `status=active`, `current_step=session_created`.  
3. **Generate SPARK** — structured breakdown: Situation, Parts, Actions, Role, Key goal → `current_step=spark_generated`.  
4. **Edit SPARK** — `PATCH` partial updates; history logs `spark_edited`.  
5. **Variations** — `POST /variations` appends AI lines to your working set (returns `merged_variations`; **does not** save). Edit/add/remove rows in the UI, then **`PATCH /variations`** persists and sets `current_step=variations_generated`.  
6. **Perspectives** — `POST /perspectives` uses GenAI to propose **meaningful combinations** of **Parts** and **Actions** (from persisted variations, else SPARK text) with creativity tools (analogy, recategorization, combination, association); appends candidates, `current_step=perspectives_generated`.  
7. **Select perspectives** — checkbox + persist selection on server.  
8. **Insights** — from selected perspectives (or all if none selected) → `insights_generated`.  
9. **Invention** → `invention_generated`.  
10. **Enlightenment** → `enlightenment_generated`.  
11. **Resume** — `GET /api/sessions/{session_id}` or `POST /api/sessions/{session_id}/resume` returns the full document for the UI.  
12. **Delete** — `DELETE /api/sessions/{session_id}` removes the session document from the database.

## API (see `/docs`)

| Action | Method | Path |
|--------|--------|------|
| Create session | POST | `/api/sessions` |
| List | GET | `/api/sessions` |
| Get / resume | GET / POST | `/api/sessions/{session_id}` · `/api/sessions/{session_id}/resume` |
| Update problem / title | PATCH | `/api/sessions/{session_id}` |
| Delete session | DELETE | `/api/sessions/{session_id}` |
| Generate SPARK | POST | `/api/sessions/{id}/spark` |
| Edit SPARK | PATCH | `/api/sessions/{id}/spark` |
| Generate variations (append, no save) | POST | `/api/sessions/{id}/variations` |
| Persist variations | PATCH | `/api/sessions/{id}/variations` |
| Perspectives (AI, append) | POST | `/api/sessions/{id}/perspectives` |
| Add manual perspective | POST | `/api/sessions/{id}/perspectives/manual` |
| Update perspective | PATCH | `/api/sessions/{id}/perspectives/{perspective_id}` |
| Delete perspective | DELETE | `/api/sessions/{id}/perspectives/{perspective_id}` |
| Toggle selection only | PATCH | `/api/sessions/{id}/perspectives/{perspective_id}/selection` |
| Select perspectives (bulk) | POST | `/api/sessions/{id}/perspectives/select` |
| Insights | POST | `/api/sessions/{id}/insights` |
| Invention | POST | `/api/sessions/{id}/inventions` |
| Enlightenment | POST | `/api/sessions/{id}/enlightenment` |

## Prerequisites

- Python 3.8+ (3.11+ recommended)
- Node.js 16.14+ (18+ recommended for newer Next.js)
- MongoDB

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Optional: add backend/.env.dev with secrets (loaded after .env; see app/core/config.py)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**API keys:** Put real keys only in `backend/.env` and/or `backend/.env.dev` (both gitignored). Settings load **`backend/.env` first**, then **`backend/.env.dev`** (overrides), using paths fixed to the backend folder so the key is found even if you start `uvicorn` from the repo root. Set **`OPENAI_API_KEY=...`** for LLM-backed generation (default `AI_PROVIDER=openai`). Omit the key or set **`AI_PROVIDER=mock`** to use the offline mock provider. Other provider keys in settings are reserved for future wiring.

## Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

## Smoke (happy path)

1. `GET /health` → `{"status":"ok"}`.  
2. `POST /api/sessions` with `problem_statement`.  
3. Call workflow endpoints in order: SPARK → variations → perspectives → (optional select) → insights → invention → enlightenment.  
4. `GET` session by id; refresh UI — state matches.

## Optional seed

```bash
cd backend && source .venv/bin/activate
python scripts/seed_hydrating_jogger.py
```
