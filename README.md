# dsh-subagent-models

Set the **provider, model and reasoning effort** that DeepSeek Harness subagents run with — from
**one entry**, the chip beside the composer. The card it opens has two scopes over the same two
controls: 「本对话」 (this conversation's override) and 「全局默认」 (the profile default).

为 DeepSeek Harness 的子代理统一指定**用哪个模型、思考强度多深**：只有一个入口——输入框旁的「⤳ 子代理」
胶囊；点开的卡片里用「本对话 / 全局默认」两个范围切换，两处都是同一组「模型 + 思考强度」控件。

- Host half: route store + `agent/request` override (`index.js`)
- Web half: the composer chip + a frame-wide card (`client.js`)
- No runtime dependency on dsh packages; no build step; no settings page.

---

## Install / 安装

```bash
# npm
dsh plugin --profile <profile> add dsh-subagent-models

# or straight from this repository
dsh plugin --profile <profile> add github:Garybot126/dsh-subagent-models
```

Then restart dsh once if the plugin row was not hot-loaded.

## Where to set it / 在哪里设置

| Where | What |
|---|---|
| Composer → 「⤳ 子代理 …」 chip | **The only entry.** Opens the card |
| Card → 「本对话」 tab | This conversation's override; the model list's first row is 「跟随全局」 |
| Card → 「全局默认」 tab | The profile-wide default for every conversation without an override |

The chip's label is the **effective** route for the conversation (e.g. `子代理 DeepSeek-V4.1-Flash ·
high`), so the composer always says what a delegation will actually use. The card's footer repeats
it with its source: `下一次委派将使用 …（来源：本对话 / 全局默认）`.

Both pickers are driven by the live LLM catalog (`ctx.llm`): models are grouped by provider, and the
effort list is the one **that model** advertises (`resolveModelInfo().reasoning.efforts`), so an
unsupported level is never offered.

> No settings page is registered by this plugin. The built-in 设置 → 插件 → 子智能体 page belongs to
> dsh itself (recursion depth, concurrency, model whitelist) and is unrelated; see below.

## Precedence / 优先级

```
本对话 override  →  全局默认  →  no route (child inherits the parent session)
```

## When it takes effect / 什么时候生效

- Applies to the **next delegation** — no restart, no new conversation.
- A child that is already running picks it up on its **next model request**.
- With no route configured, children keep inheriting the parent session's route — exactly the
  behaviour of not installing the plugin.

## How the route is applied / 怎么生效

The delegation tool (`subagent`) is composed in the **agent-plane preset**, not in the Profile
patch, and it carries its own static `agentOptions`. A plugin cannot rewrite that composition, so
the route is applied one level lower:

```
agent/request  (waterfall: "replace the frozen call configuration")
```

The listener is registered once and only rewrites an Agent that another live Agent owns — a
delegated child. A top-level Session is never touched. Consequences:

- works with the official `subagent` tool, without editing the preset and without adding
  model-selection parameters to the tool schema;
- `subagent`, `subagent_fork` and Agent Teams members all count as delegated agents.

## Data / 数据

`$DSH_HOME/plugin-data/subagent-models.json` (falls back to `~/.dsh/plugin-data/`), hot-reloaded on
mtime, so editing it by hand also works:

```json
{
  "version": 1,
  "global": {
    "default": { "provider": "deepseek-official", "model": "deepseek-flash", "effort": "high" },
    "presets": {}
  },
  "sessions": {
    "<sessionId>": { "default": { "provider": "...", "model": "...", "effort": null }, "presets": {} }
  }
}
```

`global.default: null` means no profile default; an absent `sessions[sessionId]` means the
conversation follows it.

Capability disclosure: reads and writes this one JSON file; binds no network port beyond the loopback
HTTP prefix `/plugin/subagent-models` used by the Web UI; never reads conversation content,
credentials, or any other file.

## Limits / 限制

- `subagent_fork` children are overridden too. A fork shares the parent's prefix, so a different
  model costs its KV cache; clear the route (or keep the preset's own `agentOptions`) if that
  matters to you.
- An effort the chosen model does not support fails the adapter's validation — the plugin never
  silently downgrades.
- The override is per request. Context-window and metering metadata follow the effective route,
  while the child's creation options keep the preset's values.

## Relationship to similar plugins / 与同类插件的关系

Several plugins in the market move subagent routing: `dsh-subagent-custom` (task-class routing),
`dsh-subagent-model-picker` (a per-session picker), `dsh-subagent-default-model` (settings.yaml
default), `dsh-model-settings` (a settings panel), `dsh-orquestrator` (a fixed forced route). This
one keeps the surface at one composer chip: two scopes, one pair of controls, and a label that
always shows the effective value.

## Verified / 已验证

On dsh 0.2.1-rc.2 (desktop profile):

- global route set to an invalid model → the child failed; `deepseek-v4-pro` + `max` → it succeeded;
- **per-conversation** override set to an invalid model → the child failed (the session scope is
  honored), then clearing it restored the global route;
- `GET /plugin/subagent-models/state?sessionId=…` → 200 with `global`, `session` and the catalog;
- `POST /plugin/subagent-models/route` with `scope: "session"` / `"global"` → 200 and the JSON file
  updates on disk;
- the composer chip and the frame-wide card register as active slot occupants; no settings section
  is registered by this plugin.

## License

MIT © Gary Gai
