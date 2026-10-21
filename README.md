# dsh-subagent-models

Set the **provider, model and reasoning effort** that DeepSeek Harness subagents run with:
one profile-wide default, plus a per-conversation override from a chip beside the composer.

为 DeepSeek Harness 的子代理指定**用哪个模型、思考强度多深**：设置页配一个全局默认，
输入框旁的「子代理」胶囊按对话覆盖。

- Host half: route store + `agent/request` override (`index.js`)
- Web half: settings page + composer chip + frame-wide editor card (`client.js`)
- No dependency on dsh packages at runtime; no build step.

---

## Install / 安装

```bash
# npm
dsh plugin --profile <profile> add dsh-subagent-models

# or straight from this repository
dsh plugin --profile <profile> add github:Garybot126/dsh-subagent-models
```

Then restart dsh once if the plugin row was not hot-loaded.

## What it does / 做什么

| Where | What |
|---|---|
| Settings → 子代理 | The profile-wide default route for delegated subagents |
| Composer → 「⤳ 子代理」chip | This conversation's override; 「重置为全局」clears it |

Both pickers are driven by the live LLM catalog (`ctx.llm`): models are grouped by provider,
and the effort list is the one **that model** advertises (`resolveModelInfo().reasoning.efforts`),
so an unsupported level is never offered.

## How a route is applied / 怎么生效

The delegation tool (`subagent`) is composed in the **agent-plane preset**, not in the Profile
patch, and it carries its own static `agentOptions`. A plugin cannot rewrite that composition,
so this plugin applies the route one level lower:

```
agent/request  (waterfall: "replace the frozen call configuration")
```

The listener is registered once and only rewrites an Agent that another live Agent owns — that
is, a delegated child. A top-level Session is never touched. Consequences:

- works with the official `subagent` tool, without editing the preset and without adding
  model-selection parameters to the tool schema;
- takes effect on the child's **next request** — no restart, no new conversation;
- `subagent`, `subagent_fork` and Agent Teams members all count as delegated agents.

## Precedence / 优先级

```
session preset route → session default → global preset route → global default → no override
```

"No override" leaves the child on whatever its composition created it with, so an empty
configuration behaves exactly like the plugin not being installed.

The preset level (`presets[...]`) is implemented and stored, but the shipped preset composition
does not pass `agentPreset` to the delegation tool yet, so in practice the two `default` levels
are what apply today.

## Data / 数据

`$DSH_HOME/plugin-data/subagent-models.json` (falls back to `~/.dsh/plugin-data/`), hot-reloaded
on mtime, so editing it by hand also works:

```json
{
  "version": 1,
  "global": {
    "default": { "provider": "deepseek-official", "model": "deepseek-flash", "effort": "low" },
    "presets": {}
  },
  "sessions": {
    "<sessionId>": { "default": { "provider": "...", "model": "...", "effort": null }, "presets": {} }
  }
}
```

Capability disclosure: reads and writes this one JSON file; binds no network ports beyond the
loopback HTTP prefix `/plugin/subagent-models` used by the Web UI; never reads conversation
content, credentials, or any other file.

## Limits / 限制

- `subagent_fork` children are overridden too. A fork shares the parent's prefix, so a different
  model costs its KV cache; leave fork alone (or keep the preset's own `agentOptions`) if that
  matters to you.
- An effort the chosen model does not support fails the adapter's validation — the plugin never
  silently downgrades.
- The override is per request. Context-window and metering metadata follow the effective route,
  while the child's creation options keep the preset's values.

## Relationship to similar plugins / 与同类插件的关系

Several plugins in the market already move subagent routing: `dsh-subagent-custom` (task-class
routing through `agent/request`), `dsh-subagent-model-picker` (a per-session picker),
`dsh-subagent-default-model` (settings.yaml default), `dsh-model-settings` (a settings panel),
`dsh-orquestrator` (a fixed forced route). This one deliberately keeps a small surface: no task
classification, no extra model-facing parameters, no preset editing — just two levels (profile
and conversation), the live catalog, and one override point.

## Verified / 已验证

On dsh 0.2.1-rc.2 (desktop profile):

- invalid model id in the store → the child failed; clearing the store → it succeeded; a real
  different model (`deepseek-v4-pro` + `max`) → it succeeded;
- `GET /plugin/subagent-models/state` → 200 with 3 providers / 7 routes and per-model efforts;
- `POST /plugin/subagent-models/route` → 200 and the JSON file updates on disk;
- settings section and composer chip register as active slot occupants.

## License

MIT © Gary Gai
