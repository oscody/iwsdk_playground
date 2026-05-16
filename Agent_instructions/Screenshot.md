he situation

A screenshot of a live WebXR scene has to come from a running browser —
I can't render it from a headless shell. IWSDK normally exposes a
browser_screenshot capability through its iwsdk-runtime MCP server, so I
checked for that first.

Steps

1. Looked for a screenshot tool — ToolSearch with query "browser 
screenshot iwsdk runtime xr session". It returned nothing relevant: the
mcp__iwsdk-runtime__* tools (including browser_screenshot) were not 
connected to this session, even though .mcp.json declares that server.
So the MCP path was unavailable.

2. Checked the environment (Bash):
- lsof -iTCP:8081 → a node process was listening — a dev server was up.
- npx iwsdk dev status → running: true, browserConnected: true —
confirmed a browser was attached.
- cat .mcp.json → confirmed iwsdk-runtime is configured but, as
established in step 1, just not wired into my session.

3. Found a CLI equivalent (Bash):
- npx iwsdk --help → showed a browser <action> command.
- npx iwsdk mcp inspect (grepped) → revealed browser screenshot — CLI
path browser screenshot, MCP name browser_screenshot, WebSocket method
screenshot, "Capture a screenshot of the browser." Same capability,
different entry point.
- npx iwsdk browser screenshot --help → showed the --output-file and
--timeout options.

4. Captured it (Bash):
npx iwsdk browser screenshot --output-file <path> --timeout 20000
It returned {"ok": true, "data": {"screenshotPath": ...}} and wrote an
800×800 PNG.

5. Viewed it — used the Read tool on the PNG; Read renders images, so
the frame showed up in the conversation.

6. Saved to your folder — mkdir -p screenshots, then re-ran the command
with --output-file "$PWD/screenshots/scene.png".

Tools used

┌────────────┬───────────────────────────────────────────────────────┐
│    Tool    │                        Purpose                        │
├────────────┼───────────────────────────────────────────────────────┤
│ ToolSearch │ Check whether a screenshot MCP tool was available (it │
│            │  wasn't)                                              │
├────────────┼───────────────────────────────────────────────────────┤
│ Bash       │ Inspect dev-server status, discover CLI commands, run │
│            │  the capture                                          │
├────────────┼───────────────────────────────────────────────────────┤
│ Read       │ Display the resulting PNG                             │
└────────────┴───────────────────────────────────────────────────────┘

The underlying mechanism

The iwsdk CLI doesn't take the picture itself — it connects to the
already-running dev server over a WebSocket and sends the screenshot
command. The dev server relays it to the connected browser page, which
captures its own canvas and writes the PNG to disk.

So the key dependency was that the dev server was already running with a
browser connected — I didn't start it. If it hadn't been, the command
would have failed and I'd have needed npm run dev first. The CLI was the
fallback because the MCP route wasn't connected; both ultimately do the
same thing (browser_screenshot ⇄ browser screenshot ⇄ WS screenshot).