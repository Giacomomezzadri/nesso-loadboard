# LozioBoard

Dashboard di monitoraggio del carico GPS per il preparatore atletico. Sostituisce il report PDF di una piattaforma GPS a pagamento: stesso export CSV in input, dashboard web (con viste aggiuntive) in output.

MVP demo: focus su funzionalità e UI/UX, non su scalabilità/multi-tenant/robustezza edge-case.

## Stack

- React + TypeScript + Vite + Tailwind CSS
- `recharts` (grafici), TanStack Query, `react-router-dom`
- Persistenza dati **client-side** in IndexedDB (via `idb`) — nessun backend, nessun database centrale. I dati vivono nel browser di chi la usa, non sincronizzano tra dispositivi.
- Deploy: Cloudflare Pages (progetto `loziolab`, dominio [loziolab.com](https://loziolab.com)), git-integration su push a `main`; database D1. Vedi [`DEPLOY.md`](DEPLOY.md).

## Sviluppo locale

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build   # produce dist/
```

- `renovate.json` (da `new-repo-template`) — bump automatico delle dipendenze via Renovate.
