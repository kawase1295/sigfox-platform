# Sigfox Platform

A self-hosted dashboard for Sigfox devices that runs entirely on your own Cloudflare account.

- **Callback ingest**: the Sigfox backend posts DATA/UPLINK, DATA_ADVANCED and ERROR callbacks to your Worker. Devices register themselves on their first callback; redelivered or out-of-order frames are merged, not duplicated.
- **Parsers**: decode payloads with your own JavaScript, run in a QuickJS sandbox for every message. Samples for common devices are included.
- **Map**: GPS positions from parser output and Sigfox Atlas locations from DATA_ADVANCED, on MapLibre with OpenFreeMap tiles (no API key).
- **Realtime**: new messages, devices and locations appear without reloading (Durable Object WebSockets).
- **Retention**: a daily Cron deletes messages older than `RETENTION_DAYS`.
- **Access control**: the dashboard sits behind Cloudflare Access; callbacks use per-instance API tokens.

One Worker serves a Hono API (`/api/*`) and a React SPA, with D1 for storage. English and Japanese UI.

> **Trademark notice.** Sigfox is a trademark of its owner (UnaBiz). This project is independent and is not affiliated with, sponsored by or endorsed by UnaBiz or Sigfox. The name is used only to describe what the software works with.

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kawase1295/sigfox-platform)

The button copies this repository into your GitHub or GitLab account, creates the D1 database, and builds and deploys the Worker with Workers Builds. Pushes to your copy redeploy it.

It asks for two required secrets, `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`. Set up Cloudflare Access as described below to get them. If you do not have them yet, enter any placeholder: the Worker fails closed (every dashboard request is rejected) until the real values are set under **Workers & Pages → your Worker → Settings → Variables and Secrets**.

## Cloudflare Access

Every `/api/*` request except callbacks and the health check must carry a Cloudflare Access JWT, which the Worker verifies against your team domain and the application's audience tag. Without both secrets the API refuses all requests.

You need two Access applications for the Worker's hostname (for example `sigfox-platform.<your-subdomain>.workers.dev`, or a custom domain): one that protects everything, and a more specific one that lets the Sigfox backend through. Access applies the most specific matching path, so the second one takes precedence for its paths only.

1. **Protect the dashboard.** In [Cloudflare One](https://one.dash.cloudflare.com/), go to **Access → Applications → Add an application → Self-hosted**.
   - Destination: the Worker's hostname, path left empty (the whole hostname).
   - Policy: action **Allow**, with the people who may use the dashboard (for example, emails ending in your domain).
   - Save, then open the application. Its **Application Audience (AUD) Tag** is `ACCESS_AUD`.
   - Your team domain, `<team-name>.cloudflareaccess.com`, is shown under **Settings** (team name and domain). That is `ACCESS_TEAM_DOMAIN`.

   For a `workers.dev` hostname you can instead turn on **Cloudflare Access** under the Worker's **Settings → Domains & Routes**; it creates this application for you and shows the AUD tag.

2. **Let callbacks through.** Add a second **Self-hosted** application for the same hostname with two destinations:
   - path `api/callbacks/*`
   - path `api/health`

   Give it one policy with action **Bypass** and include **Everyone**. Sigfox cannot sign in to Access, so these paths must not be gated by it. The Worker still requires an API token on `/api/callbacks/*` and checks the Access JWT on every other `/api/*` path, so a bypass that is broader than intended does not open the rest of the API.

3. Put both values into the Worker's secrets (the Deploy form, or **Settings → Variables and Secrets**). The team domain may be given with or without `https://`.

Each user is identified by the email in their Access token. Service tokens are not accepted for the dashboard.

## Connect the Sigfox backend

### 1. Create an API token

Open the dashboard and go to **API tokens**. Create a token (for example "Sigfox backend") and copy it right away; it is shown only once and only its hash is stored. Revoke it there if it leaks.

### 2. Add the callbacks

In the [Sigfox backend](https://backend.sigfox.com/), open your device type, go to **Callbacks → New → Custom callback**, and use these settings. The dashboard's **Callback setup** page shows the same values with your hostname filled in and copy buttons.

| Setting | Value |
|---|---|
| Channel | URL |
| HTTP method | POST |
| Content type | `application/json` |
| Header | `Authorization` = `Bearer <token>` |

**DATA / UPLINK**: stores each message with the base stations that heard it. Enable **Send duplicate** to record every station; duplicates are merged into one message.

- URL: `https://<your-hostname>/api/callbacks/sigfox/uplink`
- Body:

```text
{"device":"{device}","time":{time},"seqNumber":{seqNumber},"data":"{data}","station":"{station}","rssi":{rssi},"snr":{snr}}
```

**DATA / ADVANCED**: adds link quality, repetitions per station and the Sigfox (Atlas) location.

- URL: `https://<your-hostname>/api/callbacks/sigfox/advanced`
- Body:

```text
{"device":"{device}","time":{time},"seqNumber":{seqNumber},"data":"{data}","lqi":"{lqi}","duplicates":{duplicates},"computedLocation":{computedLocation}}
```

`{duplicates}` and `{computedLocation}` are inserted unquoted because Sigfox fills them with JSON. Remove them from the body if your contract lacks the Network metadata or Atlas option.

**ERROR**: reports a device that missed the keep-alive set on its device type (communication loss). The device is shown as lost until its next message, and the last error stays on the device page.

- URL: `https://<your-hostname>/api/callbacks/sigfox/error`
- Body:

```text
{"device":"{device}","time":{time},"info":"{info}","severity":"{severity}"}
```

You can use either DATA callback or both; a frame received through both is stored once (keyed by device, sequence number and time). A successful callback returns `204`. A body that does not match returns `400` with the offending fields, and a missing or revoked token returns `401`.

BIDIR and SERVICE/ACKNOWLEDGE callbacks are not supported yet.

## Parsers

A parser is the body of a JavaScript function. It receives:

- `payload`: the frame as lowercase hex (0 to 12 bytes)
- `lastParsedPayload`: the previous message's output for the same device, or `[]`

and returns an array of `{ key, value, type, unit }`:

```js
const temperature = parseInt(payload.slice(0, 4), 16) / 100;
return [{ key: "temperature", value: temperature, type: "number", unit: "°C" }];
```

- `value` is a string, number, boolean or `null`; at most 100 entries.
- Numeric `lat` and `lng` keys (plus optional `accuracy` in metres) put the message on the map as a GPS position.
- Each run has a fresh sandbox with an 8 MB heap and an operation budget; no network, no timers. `console.*` is accepted and ignored.

Create parsers under **Parsers**, test them against a payload in the editor, and assign one to a device on the device page; it applies to messages received from then on. **Create from sample** starts from the bundled parsers in [`src/worker/parsers/samples`](src/worker/parsers/samples) (Sens'it v2/v3, HidnSeek, Simplepack, TD1205P tracker, Connected plant). Parsers written for the original Sigfox Platform keep working.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `RETENTION_DAYS` | `365` | Days of messages, locations and device errors to keep. `0` keeps everything. Devices are never deleted. |
| `MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/liberty` | Any MapLibre style JSON URL. |

Change them in [`cloudflare.config.ts`](cloudflare.config.ts), run `npm run gen:wrangler`, and commit both files to your copy of the repository. Values edited in the Cloudflare dashboard are overwritten by the next deploy, because every deploy sends the values from `wrangler.jsonc`. Wrangler's `keep_vars` does not help here: it only keeps dashboard variables that the config does not define, and these two are defined so a fresh deploy works without setup.

## Workers plan

The Free plan works for small fleets. Its limit that matters is CPU time: 10 ms per request.

- A callback stores the frame, runs the device's parser and notifies browsers. With the bundled sample parsers a parse takes about 2 to 3 ms (measured locally as wall time, which overstates CPU time).
- The first request on a new isolate also instantiates the QuickJS WebAssembly module, which took about 70 ms of wall time locally. Cloudflare tolerates occasional overruns, but this is the part most likely to fail on Free.
- A parser that loops heavily can use up to its operation budget (roughly 1 million operations, tens of milliseconds) before it is stopped, well past 10 ms.

If you write parsers that do real computation, or callbacks fail with exceeded CPU limits in the Worker's logs, use **Workers Paid**, where the default CPU limit is 30 seconds. Free plan request and D1 quotas are also worth checking against your message volume.

## Local development

See [AGENTS.md](AGENTS.md) for the layout, commands and gotchas. In short:

```sh
npm install && npm rebuild workerd esbuild --ignore-scripts=false
cp .dev.vars.example .dev.vars   # AUTH_DEV_BYPASS=1, accepted on localhost only
npm run db:migrate:local
npm run dev
```

`scripts/check` runs everything CI runs (Biome, type check, tests, `wrangler.jsonc` drift).

## License

This project is a fork of [iot-makers/sigfox-platform](https://github.com/iot-makers/sigfox-platform), Copyright (C) 2018 Antoine de Chassey & Louis Moreau, licensed under the GNU Affero General Public License v3.0. It was substantially rewritten in 2026 as a Cloudflare-native application; the original LoopBack/Angular/MongoDB code has been removed, and the bundled parser samples come from the original project.

The modifications are licensed under AGPL-3.0-only. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Under AGPL section 13, if you run a modified version for users over a network, you must offer them its source. The dashboard footer links to this repository; point it at your own repository (`SOURCE_URL` in [`src/web/components/footer.tsx`](src/web/components/footer.tsx)) if you deploy changes.

## Original authors and contributors

The original Sigfox Platform was created by:

<table><tr><td align="center"><a href="https://twitter.com/adechassey"><img src="https://avatars3.githubusercontent.com/u/12235204?v=4" width="100px;" alt="Antoine de Chassey"/><br /><sub><b>Antoine de Chassey</b></sub></a><br /><a href="https://github.com/IoT-Makers/sigfox-platform/commits?author=AntoinedeChassey" title="Code">💻</a></td><td align="center"><a href="http://louismoreau.eu"><img src="https://avatars1.githubusercontent.com/u/4725870?v=4" width="100px;" alt="Louis MOREAU"/><br /><sub><b>Louis MOREAU</b></sub></a><br /><a href="https://github.com/IoT-Makers/sigfox-platform/commits?author=luisomoreau" title="Code">💻</a></td></tr></table>

Contributors to the original project:

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/siyu6974"><img src="https://avatars1.githubusercontent.com/u/15876323?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Siyu</b></sub></a><br /><a href="https://github.com/IoT-Makers/sigfox-platform/commits?author=siyu6974" title="Code">💻</a></td>
    <td align="center"><a href="https://twitter.com/aureleq"><img src="https://avatars0.githubusercontent.com/u/5591266?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Aurelien Lequertier</b></sub></a><br /><a href="https://github.com/IoT-Makers/sigfox-platform/commits?author=aureleq" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/markoceri"><img src="https://avatars1.githubusercontent.com/u/16639103?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Marko</b></sub></a><br /><a href="https://github.com/IoT-Makers/sigfox-platform/commits?author=markoceri" title="Code">💻</a></td>
    <td align="center"><a href="https://twitter.com/nestorayuso"><img src="https://avatars2.githubusercontent.com/u/15124932?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Nestor Ayuso</b></sub></a><br /><a href="https://github.com/IoT-Makers/sigfox-platform/commits?author=nestorayuso" title="Documentation">📖</a></td>
    <td align="center"><a href="http://www.splendido.fr"><img src="https://avatars1.githubusercontent.com/u/11613206?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Florian Splendido</b></sub></a><br /><a href="#platform-splendf" title="Packaging/porting to new platform">📦</a></td>
    <td align="center"><a href="https://github.com/honeytrap15"><img src="https://avatars.githubusercontent.com/u/5158471?v=4?s=100" width="100px;" alt=""/><br /><sub><b>takegami</b></sub></a><br /><a href="https://github.com/IoT-Makers/sigfox-platform/commits?author=honeytrap15" title="Code">💻</a></td>
    <td align="center"><a href="https://www.inn-farm.co.jp/"><img src="https://avatars.githubusercontent.com/u/84294566?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Innovation Farm, Inc.</b></sub></a><br /><a href="https://github.com/IoT-Makers/sigfox-platform/commits?author=Innovation-Farm" title="Code">💻</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->
