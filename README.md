# Bounce App

A [Next.js 14](https://nextjs.org) project using the App Router, TypeScript, and Tailwind CSS, ready to deploy on [Vercel](https://vercel.com).

## Getting started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Command         | Description                        |
| --------------- | ---------------------------------- |
| `npm run dev`   | Start the development server       |
| `npm run build` | Create a production build          |
| `npm run start` | Run the production build           |
| `npm run lint`  | Run ESLint                         |

## Health check

A health-check endpoint is available at [`/api/health`](http://localhost:3000/api/health). It returns:

```json
{
  "status": "ok",
  "uptime": 12.34,
  "timestamp": "2026-07-03T00:00:00.000Z"
}
```

## Deploying on Vercel

Push this repository to a Git provider and import it into Vercel, or use the
[Vercel CLI](https://vercel.com/docs/cli):

```bash
npm i -g vercel
vercel
```

Vercel auto-detects Next.js — no extra configuration is required.

## Project structure

```
src/
  app/
    api/
      health/
        route.ts   # GET /api/health
    globals.css
    layout.tsx
    page.tsx
```
