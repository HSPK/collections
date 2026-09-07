# Connecting the agent games

The collection is a static website, not a hosted inference service. The
original local projects do not need a model. Games marked **API required**
need an OpenAI-compatible text model with native function-tool support.
You choose the endpoint and remain responsible for its access, quota, and
provider charges.

## The supplied local endpoint

With a compatible API already listening at `http://127.0.0.1:8080/v1`,
run the repository's development server:

```sh
npm run dev
```

Open the local URL printed by Vite, then an agent game. Its **Model** dialog
suggests the same-origin `/api/openai/v1` gateway and the verified local
`gpt-4.1-mini_2025-04-14` model ID. **Fetch models** lists your server's IDs;
choose a text model that supports strict function tools and save. Saving a
connection does not spend a game turn or call a model.

For the built static collection:

```sh
npm run build
npm run games:serve
```

The local game server serves `dist/` and the same fixed API routes on
`http://127.0.0.1:4174/`. Unlike `npm run preview`, it includes the model
gateway. The user-owned service on port 8080 remains separate and unchanged.

The gateway removes browser-only request headers before forwarding to its
fixed upstream. This matters for some local compatibility servers which
answer browser-origin requests differently from ordinary API clients.
It is not a general URL proxy and is not intended to be publicly exposed.

## A different upstream

Set `OPENAI_BASE_URL` before starting the development or local game server:

```sh
OPENAI_BASE_URL=https://your-model-gateway.example/v1 npm run games:serve
```

If needed, supply `OPENAI_API_KEY` through your own process environment or
secret manager. The gateway does not load `.env` files, print keys, or make
credentials available to the static client. Never put secrets in `VITE_*`
variables, tracked files, URLs, example commands, or public deployment builds.
The listener binds to loopback; `GAME_PORT` can change the local game server
port. Restart the server to change its fixed upstream.

The browser dialog also accepts an optional key. That key is held only in
memory for the same endpoint and disappears on reload. It is not written to
local/session storage, game replays, or the action log. **Forget key** clears
it. A user-controlled server-side gateway is preferable to browser keys.

## Playing from GitHub Pages

The published games can connect directly to **your own HTTPS endpoint**
when that server allows the site's origin and supports the required API.
Configure it in **Model**. The collection does not ship a shared key or
provide a public relay, and GitHub Pages cannot run the local gateway.

Browser CORS, mixed-content, and local-network permission rules vary.
An HTTPS page cannot reliably use an arbitrary HTTP server, even when a
command-line request works. The local game gateway deliberately does not
accept cross-origin browser requests: open the game on that same local
server instead of trying to call it from the public Pages origin.
Do not disable browser security to make a connection work.

## Protocol, agency, and limits

The supported protocol is non-streaming `POST /v1/chat/completions`, with
one named strict function tool, `parallel_tool_calls: false`, and
`max_completion_tokens`. Model discovery uses `GET /v1/models`.
The Responses API and chat-only models are not interchangeable with this
contract. A successful model listing alone does not prove tool support.

Each explicit agent decision makes at most **two requests**, with a
**1,536 completion-token limit per request** and a **60-second overall
deadline**. The second request is used only to correct a structurally or
mechanically invalid plan. A response that is truncated, refused, missing
its tool, invalid twice, or unavailable cannot advance the game.

The model receives the game's bounded scene observation and role, including
user-edited game content such as a custom film script when that role needs it.
Do not put sensitive information into content you submit for a model turn.
The client does not read unrelated repository contents, local files,
microphone recordings, or browser history. Agent actions are parsed into strict types, checked by
pure local rules, and committed only if the world revision still matches.
The action log shows public intentions and accepted actions, not private
model reasoning. Restart, import, cancellation, and newer world revisions
invalidate stale responses. Cancelling cannot undo tokens already processed
by a provider.

Game notebooks contain a seed and validated commands. Loading one replays
the local engine without calling a model and never imports trusted raw
scores or credentials. A saved game does not turn an API-required campaign
into an offline opponent.
These are single-player browser demos, not server-authoritative multiplayer
or anti-cheat systems. Game code and replays are inspectable, including
fictional hidden information needed to reconstruct a case. Replay validation
proves mechanical legality, not that a provider authored each recorded move.

## Opt-in real-model integration

The ordinary browser suite uses controlled native-tool responses and makes
no provider requests. With the local game server running, this explicit
command executes one real opening decision per game, serially, through the
same transport, parsers, and authoritative rules:

```sh
SITE_URL=http://127.0.0.1:4174/ \
ODD_MODEL_BASE_URL=http://127.0.0.1:4174/api/openai/v1 \
npm test -- tests/agent-models.spec.ts
```

Use `ODD_MODEL_ID` to select a different supported model, and the gateway's
server-side environment for authentication. Add `--grep ghost-courier`, for
example, to run only one game. This is opt-in because it can consume provider
quota and incur charges; it is skipped in normal CI.
