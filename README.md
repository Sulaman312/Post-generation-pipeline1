# Post Generation Pipeline

Standalone **social media post** service. Deploy and push to GitHub independently from the article pipeline.

## Ports

| Service | URL |
|---------|-----|
| API | http://localhost:8001 |
| UI | http://localhost:3001 |

## Setup

```powershell
pip install -r requirements.txt
cd atlas-ui
npm install
cd ..
copy .env.example .env
# Add OPENAI_API_KEY, FIGMA_ACCESS_TOKEN
```

## Run

```powershell
.\start.ps1
```

### If Cursor freezes or crashes

1. **Open one project folder only** — e.g. `post-generation-pipeline`, not all of `Downloads`.
2. **Close other copies** (`post-generation-pipeline-1`, `-main`, etc.) so file watchers are not duplicated.
3. **Restart Cursor** after pulling updates (`.cursorignore` excludes `node_modules/` and `clients/` from indexing).
4. Start backend and UI separately if `start.ps1` feels heavy:

```powershell
# Terminal 1
$env:API_PORT=8001; python main.py

# Terminal 2
cd atlas-ui
$env:PORT=3001; npm start
```

## Push to GitHub

```powershell
cd C:\Users\T L S\Downloads\post-generation-pipeline
git init
git add .
git commit -m "Initial commit: post generation pipeline"
gh repo create YOUR_ORG/post-generation-pipeline --private --source=. --push
```

Or create the repo on GitHub first, then:

```powershell
git remote add origin https://github.com/YOUR_ORG/post-generation-pipeline.git
git branch -M main
git push -u origin main
```

## What's included

- Social pipeline only (`backend/social_pipeline.py`)
- Image generation, templates, captions
- Own `clients/` workspace data
- No article pipeline code

## Sister repo

`article-generation-pipeline` — long-form articles (ports 8000 / 3000).
