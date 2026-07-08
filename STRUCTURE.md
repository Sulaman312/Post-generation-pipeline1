# Post Generation Pipeline — structure

## Layout

```
backend/                 Flask API, pipeline logic, integrations
  api/routes/            HTTP route modules (clients, runs, images, …)
  integrations/          Third-party APIs (OpenAI, LinkedIn, Meta, Figma)
  pipelines/             Pipeline registry
  step_jobs.py           Background step execution
  run_schedule.py        Publish scheduling helpers
  run_summaries.py       Run list/detail DTO helpers
atlas-ui/src/
  components/            React UI by feature (run/, workspace/, shared/)
  components/run/publish/       PublishPlatformControls helpers
  components/run/imageComposer/ ImageComposer canvas + controls
  components/shared/sidebar/  AppSidebar modules (nav, icons, step rail, RunNavSection)
  hooks/                 Reusable state (useRunPolling, useWorkspaceNavigation, …)
  services/api/          HTTP client split by domain
  utils/                 Pure helpers
tests/                   Backend unit tests
```

## Pipeline contract

Single source of truth: `atlas-ui/src/constants/pipeline-contract.json`

- Backend loads it via `backend/pipeline_contract.py`
- Frontend loads it via `atlas-ui/src/constants/pipelineContract.js`
- `tests/test_pipeline_contract.py` verifies backend step order matches the JSON

## API client imports

Prefer domain imports for new code:

```js
import { getRun, runStep } from "../services/api/runs";
import { listRunImages } from "../services/api/images";
```

The legacy `services/api.js` re-exports everything for existing `import * as api` usage.

## Ports

| Service | Default |
|---------|---------|
| API | 8001 |
| UI  | 3001 |
