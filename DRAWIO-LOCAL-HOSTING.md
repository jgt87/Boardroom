# Local Draw.io editor

Boardroom can embed the official Draw.io editor independently of any whiteboard service. The deployment chooses the endpoint; imported boards cannot change it. Exact iframe-window and origin checks remain enforced. The Vite CSP permits that configured origin.

Official deployment references: [Docker instructions](https://www.drawio.com/docs/security/diagrams-docker-app/), [self-hosting](https://github.com/jgraph/drawio/wiki/Self-Hosting), [embed protocol](https://www.drawio.com/docs/reference/embed-mode/). Docker, a servlet deployment, or serving the official webapp are supported upstream options.

## Optional Docker setup

From this workspace, run `docker compose -f compose.drawio.yaml up -d`. The supplied recipe uses the official image, binds only localhost port 8080, and is not started automatically. For a reproducible deployment, choose and pin a verified upstream version or image digest before distributing it; `latest` is only a local evaluation default.

Create `prototype/.env.local` containing:

```dotenv
VITE_DRAWIO_EDITOR_URL=http://localhost:8080/
```

Restart Vite and run `npm run build` in `prototype`. HTTPS endpoints and subdirectory deployments are supported. Plain HTTP is restricted to loopback. A localhost URL refers to the browser's device, so LAN clients need an HTTPS editor hostname they can reach. Keep the editor on its own origin.

Verify the actual editor initializes, edit a shape, save, reload Boardroom, reopen the diagram and confirm the editable source and preview. The deterministic protocol tests only verify Boardroom's side of this exchange.

## Verification on 2026-11-03

- Hosted editor request failed with `net::ERR_NETWORK_ACCESS_DENIED`; no initialization or export events arrived. Real save/reopen is unverified. Evidence: `prototype/qa/drawio-live-result.json`.
- Docker CLI is installed, but this session was denied access to its configuration and engine pipe. No service was started.
- `git ls-remote https://github.com/jgraph/drawio.git HEAD` could not connect; no upstream assets were downloaded.
- Endpoint validation, exact sender/origin enforcement, protocol fixtures and the local build are separately testable. No claim of a working local editor deployment is made.
