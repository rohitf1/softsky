# Softsky API

Cloud Run-ready backend for:

1. Gemini scene/music generation
2. Google OAuth session auth
3. Share persistence + stats
4. Async share jobs (Cloud Tasks)
5. User generation history

## Endpoints

1. `GET /api/v1/healthz`
2. `GET /api/v1/auth/config`
3. `GET /api/v1/auth/session`
4. `GET /api/v1/auth/google/start`
5. `GET /api/v1/auth/google/callback`
6. `POST /api/v1/auth/logout`
7. `POST /api/v1/generations`
8. `GET /api/v1/generations`
9. `GET /api/v1/generations/:generationId`
10. `POST /api/v1/shares`
11. `GET /api/v1/shares/:shareId`
12. `GET /api/v1/shares/:shareId/stats`
13. `POST /api/v1/jobs`
14. `GET /api/v1/jobs/:jobId`
15. `POST /api/v1/internal/jobs/process`

## Local Run

From project root:

```bash
npm run dev:api
```

## Required Env (Production)

1. `GEMINI_API_KEY`
2. `GOOGLE_OAUTH_CLIENT_ID`
3. `GOOGLE_OAUTH_CLIENT_SECRET`
4. `GOOGLE_OAUTH_REDIRECT_URI`
5. `AUTH_SESSION_SECRET`
6. `SHARE_GCS_BUCKET` (when `SHARE_STORE_DRIVER=gcp`)

## Prompt Sources

1. `backend/prompts/scene_master_prompt.txt`
2. `backend/prompts/music_master_prompt.txt`

## Security Notes

1. Session and OAuth state are signed tokens in HttpOnly cookies.
2. Anonymous generation limits are visitor-cookie scoped.
3. Share, jobs, and generation history endpoints require authenticated user session.
