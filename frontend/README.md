# B2B Finance — Frontend

React 19 + Vite + Tailwind CSS v4.

## Setup

```bash
npm install
```

Create `frontend/.env`:
```env
VITE_API_KEY="same-value-as-server-API_KEY"
```

## Dev server

```bash
npm run dev      # http://localhost:5173
```

## Production build

```bash
npm run build    # outputs to dist/
npm run preview  # preview the built output locally
```

## Environment

The only env variable is `VITE_API_KEY` — it's sent as `x-api-key` header on every API call to the backend. Must match `API_KEY` in the server's `.env`.

Vite proxies `/api/*` to `http://127.0.0.1:3001` in dev (see `vite.config.js`). In production (Vercel), configure a rewrite rule or set `VITE_API_BASE_URL` pointing to your deployed server.
