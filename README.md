<div align="center">
  <h1>UvA API Self-Host</h1>
  <p><strong>Run your own API gateway locally and expose it through your personal domain</strong></p>
  <p>
    <a href="#getting-started"><img src="https://img.shields.io/badge/Node.js-18+-339933?logo=nodedotjs&logoColor=white" alt="Node.js"></a>
    <a href="#configuration"><img src="https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white" alt="SQLite"></a>
    <a href="#cloudflare-tunnel"><img src="https://img.shields.io/badge/Cloudflare_Tunnel-Supported-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare Tunnel"></a>
  </p>
</div>

---

## About

UvA API Self-Host lets you run a personal API gateway on your own machine and make it accessible from anywhere through your own domain name.

The idea is simple: you start the gateway locally, connect it to the internet via a Cloudflare Tunnel, and point your personal domain at it. Once that is in place, you have a stable, self-controlled URL that you can plug into any tool or service that accepts a custom API endpoint -- model providers, development tools, automation platforms, or anything else that lets you configure a base URL.

Instead of relying on third-party hosted services or juggling temporary URLs, you get a permanent address under your own domain that routes directly to software running on your hardware. You decide what each endpoint does: proxy requests to another service, return a fixed response, or run custom JavaScript logic. Everything is managed through a built-in web dashboard -- no config files to hand-edit, no CLI-only workflows.

Authentication piggybacks on your existing University of Amsterdam account. The gateway reads session cookies from your browser, validates them against UvA's session API, and issues local tokens. There is no separate user database, no passwords to manage, and no OAuth setup.

## What You Can Do

- **Expose local services under your own domain** -- Start the gateway, enable the Cloudflare Tunnel, and your endpoints are live at `yourdomain.com`. Add that domain as a custom base URL in any tool that supports configurable API providers.

- **Create endpoints on the fly** -- Define new routes through the dashboard without restarting anything. The router rebuilds itself instantly.

- **Proxy to upstream APIs** -- Point an endpoint at any external service. Incoming requests are forwarded with their original method, headers, and body intact.

- **Serve static responses** -- Return fixed JSON or text from any path. Useful for mocks, health checks, or simple data endpoints.

- **Run custom logic** -- Write JavaScript directly in the dashboard. Scripts execute in a sandboxed VM with access to the incoming request and a 10-second timeout.

- **Monitor traffic** -- Every request is logged with method, path, status, response time, and client IP. Browse logs and view aggregate statistics from the dashboard.

- **Switch between quick and permanent tunnels** -- Use a temporary `trycloudflare.com` URL for testing, or configure a named tunnel tied to your domain for production use.

## Table of Contents

- [About](#about)
- [What You Can Do](#what-you-can-do)
- [Getting Started](#getting-started)
- [Cloudflare Tunnel](#cloudflare-tunnel)
- [Configuration](#configuration)
- [Endpoint Handler Types](#endpoint-handler-types)
- [API Reference](#api-reference)
- [Repository Structure](#repository-structure)
- [Contact](#contact)

## Getting Started

### Prerequisites

- **Node.js 18+** and **npm**
- **Firefox** or **Chrome/Chromium** (for cookie-based UvA authentication)
- **cloudflared** (optional -- only needed for tunnel functionality)
- A valid **University of Amsterdam** account with access to `aichat.uva.nl`
- **Linux** (cookie extraction uses Linux-specific browser profile paths)

### Installation

```bash
git clone <repository-url>
cd uva-api-self-host
npm install
```

Configure environment variables:

```bash
cp .env.example .env
# Edit .env if you want to change the port or set a custom JWT secret
```

### Running

Start the server:

```bash
npm start
```

Start with auto-reload during development:

```bash
npm run dev
```

Open the dashboard at `http://localhost:3000/dashboard` and click **Login with UvA Account** to authenticate through your browser.

## Cloudflare Tunnel

The gateway integrates with `cloudflared` to make your local endpoints reachable from the internet.

**Quick tunnel** (temporary URL, no configuration needed):

1. Install `cloudflared` on your system.
2. Start the tunnel from the dashboard or via `POST /api/admin/tunnel/start`.
3. A temporary `*.trycloudflare.com` URL is assigned automatically.

**Named tunnel** (persistent custom domain):

1. Set up a named tunnel through the Cloudflare dashboard or `cloudflared` CLI.
2. Set `CLOUDFLARED_CONFIG` in `.env` to the path of your `cloudflared` config file.
3. Start the tunnel from the dashboard.

Once your named tunnel is running, any endpoint you create is accessible at `https://yourdomain.com/<path>`. Add that URL as a custom provider endpoint wherever you need it.

## Configuration

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server bind port | no | `3000` |
| `JWT_SECRET` | Signing key for session JWTs | no | Auto-generated on first run |
| `CLOUDFLARED_CONFIG` | Path to `cloudflared` config file for named tunnels | no | -- |

The `JWT_SECRET` is automatically generated and persisted to `.env` if not explicitly set.

See [`.env.example`](.env.example) for a configuration template.

## Endpoint Handler Types

Each custom endpoint uses one of three handler types:

**Proxy** -- Forwards the incoming request to a target URL, preserving method, body, and headers.

```json
{ "target_url": "https://api.example.com/v1/resource" }
```

**Static** -- Returns a fixed response with configurable status code, body, and headers.

```json
{
  "status_code": 200,
  "body": { "message": "Hello from the gateway" },
  "headers": { "X-Custom": "value" }
}
```

**Script** -- Executes user-provided JavaScript in a sandboxed Node.js VM. The script receives a `request` object and must call `response.json()` or `response.send()` to reply.

```json
{
  "code": "response.json({ greeting: 'Hello, ' + (request.query.name || 'world') })"
}
```

## API Reference

All admin endpoints (except auth login/status) require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <jwt-token>
```

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/auth/browser-login` | Start browser login flow |
| `GET` | `/api/admin/auth/browser-status` | Poll login status |
| `POST` | `/api/admin/auth/browser-cancel` | Cancel login |
| `GET` | `/api/admin/auth/me` | Get current user (requires auth) |
| `POST` | `/api/admin/auth/logout` | Logout (requires auth) |

### Endpoints Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/endpoints` | List all endpoints |
| `GET` | `/api/admin/endpoints/:id` | Get a single endpoint |
| `POST` | `/api/admin/endpoints` | Create a new endpoint |
| `PUT` | `/api/admin/endpoints/:id` | Update an endpoint |
| `DELETE` | `/api/admin/endpoints/:id` | Delete an endpoint |

### Request Logs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/logs` | List logs (supports `limit`, `offset`, `method`, `endpoint_id` params) |
| `GET` | `/api/admin/logs/stats` | Aggregate statistics |

### Tunnel Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/tunnel/status` | Get tunnel status and URL |
| `POST` | `/api/admin/tunnel/start` | Start a Cloudflare Tunnel |
| `POST` | `/api/admin/tunnel/stop` | Stop the running tunnel |

### Other

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (no auth required) |
| `GET` | `/api/admin/overview` | Dashboard summary statistics |

## Repository Structure

<details>
<summary>Directory layout</summary>

```
uva-api-self-host/
+-- server.js                       # Express app entry point
+-- package.json                    # Node.js dependencies and scripts
+-- .env.example                    # Environment variable template
+-- src/
|   +-- config.js                   # Configuration loader, JWT secret generation
|   +-- db.js                       # SQLite initialization and schema
|   +-- dynamic-router.js           # Dynamic endpoint router builder
|   +-- tunnel.js                   # Cloudflare Tunnel process manager
|   +-- auth/
|   |   +-- browser-login.js        # Browser login flow orchestrator
|   |   +-- session-validator.js    # UvA session API validation
|   |   +-- jwt.js                  # JWT token signing and verification
|   |   +-- chrome.js               # Chrome cookie extraction
|   |   +-- firefox.js              # Firefox cookie extraction
|   |   \-- cookie-paths.js         # Browser profile path detection
|   +-- middleware/
|   |   +-- auth.js                 # JWT authentication guard
|   |   +-- logger.js               # Per-endpoint request logging
|   |   \-- error-handler.js        # Global error handler
|   +-- routes/
|   |   +-- admin-auth.js           # Auth routes
|   |   +-- admin-endpoints.js      # Endpoint CRUD routes
|   |   +-- admin-logs.js           # Log query and stats routes
|   |   +-- admin-overview.js       # Dashboard summary statistics
|   |   +-- admin-tunnel.js         # Tunnel start, stop, status routes
|   |   +-- admin-ai.js             # AI provider routes
|   |   \-- admin-settings.js       # Settings routes
|   \-- handlers/
|       +-- proxy-handler.js        # Forward requests to upstream URL
|       +-- static-handler.js       # Return fixed JSON/text responses
|       \-- script-handler.js       # Execute JS in sandboxed VM context
\-- dashboard/
    +-- index.html                  # SPA shell
    +-- css/                        # Stylesheets
    \-- js/                         # Dashboard application code
```

</details>

## Contact

<p>
  <a href="https://github.com/moussa"><img src="https://img.shields.io/badge/GitHub-moussa-181717?logo=github&logoColor=white" alt="GitHub"></a>
</p>
