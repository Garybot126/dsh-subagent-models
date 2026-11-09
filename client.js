/**
 * Subagent models — Web UI.
 *
 * ONE entry: the chip beside the composer. It opens a frame-wide card with two
 * scopes over the same two controls — 「本对话」(this conversation's override)
 * and 「全局默认」(the profile-wide default) — and never anywhere else: no
 * settings page, so there is no second place to look for the value.
 *
 * The card and its pickers follow DSH's own composer model menu: menu material,
 * grouped model rows, inline search and a checked row. When the host ships
 * @deepseek-ai/dsh-client-ui-primitives (a frozen platform module) the real
 * components are used; otherwise the `.dsm-*` fallbacks below render the same
 * structure.
 *
 * The route is applied by the Host when the child is created (`agent/created`); this
 * module only reads and writes /plugin/subagent-models/*.
 */
window.__ModuleLoader__.load({
  id: 'dsh-subagent-models',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } = React

    /*
     * Primitives are a frozen platform module of the running shell, so the
     * bundle resolves them without a package.json declaration. Older hosts do
     * not have them at all: keep the module loadable and fall back to the
     * hand-drawn `.dsm-*` components.
     */
    let primitives = null
    try {
      primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    } catch {}
    const P = primitives ?? {}

    const ENDPOINT = '/plugin/subagent-models'
    const INHERIT = ''
    const VIEWPORT_MARGIN = 12

    const TOKENS = {
      secondary: 'var(--dsw-alias-label-secondary)',
      brand: 'var(--dsw-alias-state-business-primary)',
    }

    const MENU_STYLE = {
      position: 'fixed',
      left: 0,
      top: 0,
      visibility: 'hidden',
      width: 'max-content',
      minWidth: 'min(240px, 100vw - 32px)',
      maxWidth: 'min(420px, 100vw - 32px)',
      maxHeight: 'min(360px, 100vh - 96px)',
      padding: 4,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      borderRadius: 'var(--dsw-radius-lg)',
      boxShadow: 'var(--dsw-elevation-prominent)',
    }

    /*
     * Values copied from dsh's ModelSelect.module.css, with every class renamed
     * to the dsm- prefix. Keep the sibling/descendant selectors: primitives'
     * Input wrapper has its own border, background and height, and the model
     * menu overrides them through `.searchRow .search`.
     */
    const CSS = `
.dsm-surface{position:relative;isolation:isolate;border-radius:var(--dsw-radius-lg)}
.dsm-surfaceCompact{border-radius:var(--dsw-radius-md)}
.dsm-material{position:absolute;inset:0;z-index:-1;border-radius:inherit;background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1)));backdrop-filter:var(--dsw-menu-backdrop-filter);pointer-events:none}
.dsm-menu{z-index:1100;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:max-content;min-width:min(240px,100vw - 32px);max-width:min(420px,100vw - 32px);max-height:min(360px,100vh - 96px);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;flex-direction:column;padding:4px;display:flex;position:fixed;overflow:hidden;border-radius:var(--dsw-radius-lg)}
.dsm-card{outline:none}
.dsm-cardTitle{font-size:13px;line-height:20px;font-weight:600}
.dsm-caption{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.dsm-cell{box-sizing:border-box;border-radius:var(--dsw-radius-md);width:auto;min-width:100%;height:34px;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;background:0 0;border:none;outline:none;align-items:center;gap:6px;padding:0 8px;font-size:13px;line-height:20px;display:flex;font-family:inherit}
.dsm-cell:hover:not(:disabled),.dsm-cell:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.dsm-cell:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsm-cell:disabled .dsm-cellValue{color:var(--dsw-alias-label-dimmed)}
.dsm-cellLabel{white-space:nowrap;flex:none}
.dsm-cellValue{text-overflow:ellipsis;white-space:nowrap;text-align:right;min-width:0;color:var(--dsw-alias-label-tertiary);flex:auto;overflow:hidden}
.dsm-cellChevron{width:12px;height:12px;color:var(--dsw-alias-menu-icon);flex:none}
.dsm-searchRow{flex-shrink:0;margin:2px 0 3px;position:relative}
.dsm-searchRow .dsm-search{border-radius:var(--dsw-radius-md);background:transparent;border:0 solid transparent;height:auto;padding:5px 7px;display:flex}
.dsm-searchRow .dsm-searchWithQuery{padding-right:34px}
.dsm-searchRow .dsm-search:focus-within{border-color:transparent}
.dsm-searchRow .dsm-search input{padding:0;font-size:12px;line-height:normal}
.dsm-searchRow .dsm-search input::placeholder{color:var(--dsw-alias-label-caption)}
.dsm-inputWrap{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}
.dsm-inputIcon{display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary)}
.dsm-inputWrap:focus-within{border-color:var(--dsw-alias-state-business-primary)}
.dsm-input{flex:1;min-width:0;border:none;outline:none;background:transparent;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);font-family:inherit}
.dsm-input::placeholder{color:var(--dsw-alias-label-dimmed)}
.dsm-searchClear{corner-shape:round;width:24px;height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:50%;justify-content:center;align-items:center;padding:0;display:inline-flex;position:absolute;top:50%;right:4px;transform:translateY(-50%)}
.dsm-searchClear:hover,.dsm-searchClear:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.dsm-groups{min-height:0;overflow-y:auto}
.dsm-option{box-sizing:border-box;border-radius:var(--dsw-radius-md);width:auto;min-width:100%;min-height:34px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;outline:none;align-items:center;gap:6px;padding:5px 7px;display:flex;font-family:inherit}
.dsm-option:hover:not(:disabled),.dsm-option:focus-visible,.dsm-optionActive:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsm-option[data-highlighted]:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsm-selected{background:transparent}
.dsm-option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsm-optionCopy{flex-direction:column;flex:1;min-width:0;display:flex}
.dsm-modelName{color:inherit;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:400;line-height:18px;overflow:hidden}
.dsm-check{color:var(--dsw-alias-label-primary);flex:0 0 14px;place-items:center;display:grid}
.dsm-check svg{width:14px;height:14px}
.dsm-check .dsm-iconFallback{width:14px;height:14px;font-size:14px}
.dsm-status,.dsm-empty{color:var(--dsw-alias-label-tertiary);padding:8px;font-size:12px;line-height:18px}
.dsm-error,.dsm-warning{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:3px;padding:6px 7px;font-size:11px;line-height:16px;display:flex}
.dsm-warning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}
.dsm-retry{color:inherit;font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:0;font-weight:600}
.dsm-divider{height:1px;margin:4px 7px;background:var(--dsw-alias-border-l1);flex:none}
.dsm-group{position:relative}
.dsm-groupStart{position:absolute;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none}
.dsm-group+.dsm-group{margin-top:3px}
.dsm-groupHeading{position:sticky;top:0;z-index:1;padding:4px 7px 2px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-weight:500;border-radius:var(--dsw-radius-md)}
.dsm-groupHeading[data-stuck]{background:var(--dsw-alias-menu-group-header-fill)}
html[data-platform=darwin] .dsm-groupHeading{border-radius:0}
.dsm-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 10px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:13px;line-height:20px;white-space:nowrap;cursor:pointer}
.dsm-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsm-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.dsm-chip{border-radius:var(--dsw-radius-sm);min-width:0;max-width:220px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:none;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:400;line-height:20px;display:inline-flex;font-family:inherit}
.dsm-chip:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsm-chip:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.dsm-chipLabel{display:var(--dsh-composer-model-text-display,block);text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}
.dsm-chipIcon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px}
.dsm-chipChevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s}
.dsm-chipChevronOpen{transform:rotate(180deg)}
[data-model-compact] .dsm-chipLabel{display:none}
[data-model-compact] .dsm-chip{max-width:none}
.dsm-iconFallback{display:inline-flex;align-items:center;justify-content:center;line-height:1;font-style:normal;font-family:inherit}
.dsm-stateDot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-business-primary);animation:dsm-pulse 1.2s ease-in-out infinite}
@keyframes dsm-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.dsm-pill{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border:none;border-radius:999px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}
.dsm-pillActive{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-button-ghost-active-fill);box-shadow:inset 0 0 0 1px var(--dsw-alias-button-ghost-active-border)}
.dsm-pillInteractive{cursor:pointer}
.dsm-pillInteractive:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsm-segmented{position:relative;display:inline-grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:2px;padding:4px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);vertical-align:middle}
.dsm-segIndicator{position:absolute;top:4px;left:4px;width:calc((100% - 8px - 2px * (var(--dsh-segment-count) - 1)) / var(--dsh-segment-count));height:calc(100% - 8px);border:0;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-soft);transform:translate(calc(var(--dsh-segment-index) * (100% + 2px)));transition:transform .16s ease;pointer-events:none}
.dsm-segTab{box-sizing:border-box;position:relative;z-index:1;height:28px;padding:0 16px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;font-weight:500;white-space:nowrap;cursor:pointer;transition:color .12s ease}
.dsm-segTab:hover:not(:disabled),.dsm-segTab[aria-selected=true]{color:var(--dsw-alias-label-primary)}
.dsm-segTab:disabled{cursor:default;opacity:.4}
.dsm-segTab:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
@media (prefers-reduced-motion:reduce){.dsm-segIndicator,.dsm-segTab{transition:none}.dsm-chipChevron{transition:none}.dsm-stateDot{animation:none}}
`

    function injectStyles() {
      if (typeof document === 'undefined') return
      const tagId = 'dsh-subagent-models/ui.css'
      if (document.querySelector(`style[data-plugin-css="${tagId}"]`) !== null) return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-subagent-models'
      tag.dataset.pluginCss = tagId
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    /* ── shared card state ──────────────────────────────────────────────── */

    const overlay = {
      state: { open: false, sessionId: null, anchor: null },
      listeners: new Set(),
      set(next) {
        overlay.state = next
        for (const listener of overlay.listeners) listener(next)
      },
      subscribe(listener) {
        overlay.listeners.add(listener)
        return () => overlay.listeners.delete(listener)
      },
    }

    function useOverlayState() {
      const [state, setState] = useState(overlay.state)
      useEffect(() => overlay.subscribe(setState), [])
      return state
    }

    /* ── shared route state ─────────────────────────────────────────────── */

    const routeStore = {
      state: new Map(),
      listeners: new Set(),
      get(sessionId) {
        return routeStore.state.get(sessionId ?? '') ?? null
      },
      publish(sessionId, next) {
        const key = sessionId ?? ''
        if (routeStore.state.get(key) === next) return
        routeStore.state.set(key, next)
        for (const listener of routeStore.listeners) listener(key, next)
      },
      applyGlobal(global) {
        for (const [key, entry] of routeStore.state) {
          if (!entry || entry.global === global) continue
          const next = { ...entry, global }
          routeStore.state.set(key, next)
          for (const listener of routeStore.listeners) listener(key, next)
        }
      },
      subscribe(listener) {
        routeStore.listeners.add(listener)
        return () => routeStore.listeners.delete(listener)
      },
    }

    /* ── host transport ───────────────────────────────────────────────────── */

    function routeKey(route) {
      return route ? `${route.provider}\u0000${route.model}` : INHERIT
    }

    function routeText(route) {
      if (!route) return '跟随主会话'
      return route.effort ? `${route.model} · ${route.effort}` : route.model
    }

    async function readState(sessionId) {
      const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''
      const response = await fetch(`${ENDPOINT}/state${query}`, { headers: { accept: 'application/json' } })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? `请求失败（${response.status}）`)
      return body
    }

    async function writeRoute(payload) {
      const response = await fetch(`${ENDPOINT}/route`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? `保存失败（${response.status}）`)
      return body
    }

    function useRoute(sessionId) {
      const storeKey = sessionId ?? ''
      const [data, setData] = useState(() => routeStore.get(storeKey))
      const [dataKey, setDataKey] = useState(storeKey)
      const [error, setError] = useState(null)
      const [pending, setPending] = useState(false)
      const keyRef = useRef(storeKey)
      keyRef.current = storeKey

      // The chip and the card each mount their own instance: seed each from the
      // store and follow it, so a save in one reaches the label in the other.
      // A conversation switch re-seeds from that key only; a refetch of the same
      // conversation keeps the visible value until the fresh payload lands.
      if (dataKey !== storeKey) {
        setDataKey(storeKey)
        setData(routeStore.get(storeKey))
        setError(null)
      }

      useEffect(
        () =>
          routeStore.subscribe((key, next) => {
            if (key === keyRef.current) setData(next)
          }),
        [],
      )

      const reload = useCallback(async () => {
        try {
          const next = await readState(sessionId)
          routeStore.publish(sessionId, next)
          setError(null)
        } catch (cause) {
          setError(cause.message ?? String(cause))
        }
      }, [sessionId])

      useEffect(() => {
        let alive = true
        readState(sessionId)
          .then((next) => {
            routeStore.publish(sessionId, next)
            if (alive) setError(null)
          })
          .catch((cause) => {
            if (alive) setError(cause.message ?? String(cause))
          })
        return () => {
          alive = false
        }
      }, [sessionId])

      const save = useCallback(
        async (payload) => {
          setPending(true)
          try {
            await writeRoute(payload)
            const next = await readState(sessionId)
            routeStore.publish(sessionId, next)
            // A global write changes the fallback of every cached conversation,
            // so a later mount cannot seed from a stale default.
            if (payload?.scope === 'global') routeStore.applyGlobal(next.global)
            setError(null)
          } catch (cause) {
            setError(cause.message ?? String(cause))
          } finally {
            setPending(false)
          }
        },
        [sessionId],
      )

      return { data, error, pending, save, reload }
    }

    /* ── small pieces ─────────────────────────────────────────────────────── */

    function cx(...names) {
      return names.filter(Boolean).join(' ')
    }

    function findModel(models, route) {
      if (!route) return null
      return models.find((model) => model.provider === route.provider && model.model === route.model) ?? null
    }

    function providerRank(id) {
      return id === 'deepseek-account' ? 0 : id === 'deepseek-official' ? 1 : 2
    }

    function providerLabel(id, name) {
      return id === 'deepseek-account' ? 'DeepSeek 账号' : name || id
    }

    function groupModels(models) {
      const map = new Map()
      for (const model of models) {
        if (!map.has(model.provider)) {
          map.set(model.provider, {
            id: model.provider,
            name: providerLabel(model.provider, model.providerName),
            models: [],
          })
        }
        map.get(model.provider).models.push(model)
      }
      return Array.from(map.values()).sort((left, right) => providerRank(left.id) - providerRank(right.id))
    }

    function fallbackRankByName(items, query) {
      const needle = query.toLowerCase()
      if (needle === '') return items
      const scored = []
      items.forEach((item, index) => {
        const names = [item.name, item.label].filter((name) => typeof name === 'string')
        let matched = false
        let prefix = false
        let score = -Infinity
        for (const raw of names) {
          const name = raw.toLowerCase()
          let pos = -1
          let gaps = 0
          let ok = true
          for (const char of needle) {
            const next = name.indexOf(char, pos + 1)
            if (next === -1) {
              ok = false
              break
            }
            gaps += next - pos
            pos = next
          }
          if (!ok) continue
          matched = true
          if (name.startsWith(needle)) prefix = true
          score = Math.max(score, -gaps)
        }
        if (matched) scored.push({ item, index, prefix, score })
      })
      scored.sort(
        (left, right) =>
          Number(right.prefix) - Number(left.prefix) || right.score - left.score || left.index - right.index,
      )
      return scored.map((entry) => entry.item)
    }

    function fallbackObserveStickyMenuGroups(container) {
      const update = () => {
        const top = container.getBoundingClientRect().top
        for (const section of container.querySelectorAll(':scope > [data-menu-group]')) {
          const heading = section.querySelector(':scope > [data-menu-group-heading]')
          const start = section.querySelector(':scope > [data-menu-group-start]')
          if (!heading || !start) continue
          heading.toggleAttribute('data-stuck', start.getBoundingClientRect().top <= top)
        }
      }
      update()
      container.addEventListener('scroll', update, { passive: true })
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
      observer?.observe(container)
      return () => {
        container.removeEventListener('scroll', update)
        observer?.disconnect()
      }
    }

    /* ── primitives with fallbacks ────────────────────────────────────────── */

    function FallbackSurface({ compact, className, style, children, ...rest }, ref) {
      return h(
        'div',
        {
          ...rest,
          ref,
          'data-menu-material': 'translucent',
          className: cx('dsm-surface', compact && 'dsm-surfaceCompact', className),
          style,
        },
        h('div', { 'aria-hidden': true, className: 'dsm-material' }),
        children,
      )
    }

    function FallbackMenuGroup({ label, children }) {
      const id = useId()
      return h(
        'section',
        { role: 'group', 'aria-labelledby': id, 'data-menu-group': '', className: 'dsm-group' },
        h('span', { 'aria-hidden': true, 'data-menu-group-start': '', className: 'dsm-groupStart' }),
        h('div', { id, 'data-menu-group-heading': '', className: 'dsm-groupHeading' }, label),
        children,
      )
    }

    function FallbackInput({ icon, className, ...rest }, ref) {
      return h(
        'span',
        { className: cx('dsm-inputWrap', className) },
        icon !== undefined && icon !== null ? h('span', { className: 'dsm-inputIcon' }, icon) : null,
        h('input', { ref, className: 'dsm-input', ...rest }),
      )
    }

    function FallbackSegmentedControl({ id, value, options, onChange, label, disabled, className }) {
      const index = Math.max(
        0,
        options.findIndex((option) => option.value === value),
      )
      return h(
        'div',
        {
          role: 'tablist',
          'aria-label': label,
          className: cx('dsm-segmented', className),
          style: {
            '--dsh-segment-count': String(options.length),
            '--dsh-segment-index': String(index),
          },
        },
        h('span', { 'aria-hidden': true, className: 'dsm-segIndicator' }),
        options.map((option) =>
          h(
            'button',
            {
              key: option.value,
              id: id ? `${id}-${option.value}` : undefined,
              type: 'button',
              role: 'tab',
              'aria-selected': option.value === value,
              disabled: disabled || option.disabled === true,
              title: option.title,
              className: 'dsm-segTab',
              onClick: () => {
                if (option.value !== value) onChange(option.value)
              },
            },
            option.label,
          ),
        ),
      )
    }

    function FallbackPill({ active, className, children, onClick, ...rest }) {
      const classes = cx('dsm-pill', active && 'dsm-pillActive', onClick && 'dsm-pillInteractive', className)
      if (onClick) {
        return h('button', { type: 'button', className: classes, onClick, ...rest }, children)
      }
      return h('span', { className: classes, ...rest }, children)
    }

    function FallbackStateDot({ state }) {
      return h('span', { 'aria-hidden': true, className: 'dsm-stateDot', 'data-state': state })
    }

    const ICON_GLYPHS = {
      agent: '⤳',
      chevronDown: '▾',
      chevronRight: '›',
      check: '✓',
      close: '✕',
      warning: '!',
    }

    const ICONS = {
      agent: P.IconAgentPresetOutlineRegular,
      chevronDown: P.IconChevronDownOutlineRegular,
      chevronRight: P.IconChevronRightOutlineRegular,
      check: P.IconCheckOutlineRegular,
      close: P.IconCloseFillRegular,
      warning: P.IconWarningOutlineRegular,
    }

    function Icon({ name, size, className, ...rest }) {
      const Primitive = ICONS[name]
      if (Primitive) return h(Primitive, { size, className, ...rest })
      return h(
        'span',
        {
          'aria-hidden': true,
          className: cx('dsm-iconFallback', className),
          style: size === undefined ? undefined : { fontSize: size },
        },
        ICON_GLYPHS[name] ?? '',
      )
    }

    const Surface = P.MenuSurface ?? React.forwardRef(FallbackSurface)
    const MenuGroup = P.MenuGroup ?? FallbackMenuGroup
    const Input = P.Input ?? React.forwardRef(FallbackInput)
    const SegmentedControl = P.SegmentedControl ?? FallbackSegmentedControl
    const Pill = P.Pill ?? FallbackPill
    const StateDot = P.StateDot ?? FallbackStateDot
    const rankByName = P.rankByName ?? fallbackRankByName
    const observeStickyMenuGroups = P.observeStickyMenuGroups ?? fallbackObserveStickyMenuGroups

    /* ── menu anchoring / dismissal ───────────────────────────────────────── */

    function useAnchoredMenu(menuRef, anchorRef) {
      const [position, setPosition] = useState(null)

      useLayoutEffect(() => {
        if (typeof window === 'undefined') return undefined
        const place = () => {
          const anchor = anchorRef.current
          const menu = menuRef.current
          if (!anchor || !menu) return
          const rect = anchor.getBoundingClientRect()
          const width = menu.offsetWidth
          const height = menu.offsetHeight
          let left = rect.right - width
          let top = rect.top - 8 - height
          if (width > 0) {
            left = Math.min(Math.max(left, VIEWPORT_MARGIN), window.innerWidth - width - VIEWPORT_MARGIN)
          }
          if (height > 0) {
            top = Math.min(Math.max(top, VIEWPORT_MARGIN), window.innerHeight - height - VIEWPORT_MARGIN)
          }
          setPosition((previous) =>
            previous && previous.left === left && previous.top === top ? previous : { left, top },
          )
        }
        place()
        window.addEventListener('scroll', place, true)
        window.addEventListener('resize', place)
        const menu = menuRef.current
        const observer =
          typeof ResizeObserver === 'undefined' || !menu ? null : new ResizeObserver(() => place())
        if (menu && observer) observer.observe(menu)
        return () => {
          observer?.disconnect()
          window.removeEventListener('scroll', place, true)
          window.removeEventListener('resize', place)
        }
      }, [menuRef, anchorRef])

      return position
    }

    function useDismissMenu(menuRef, anchorRef, onClose) {
      useEffect(() => {
        const onDown = (event) => {
          if (menuRef.current?.contains(event.target)) return
          if (anchorRef.current?.contains(event.target)) return
          onClose(false)
        }
        const onBlur = () => onClose(false)
        document.addEventListener('mousedown', onDown)
        window.addEventListener('blur', onBlur)
        return () => {
          document.removeEventListener('mousedown', onDown)
          window.removeEventListener('blur', onBlur)
        }
      }, [menuRef, anchorRef, onClose])
    }

    function menuStyle(position) {
      if (!position) return MENU_STYLE
      return { ...MENU_STYLE, left: position.left, top: position.top, visibility: 'visible' }
    }

    function optionCopy(label) {
      return h('span', { className: 'dsm-optionCopy' }, h('span', { className: 'dsm-modelName' }, label))
    }

    function optionCheck(check) {
      return h('span', { className: 'dsm-check' }, check)
    }

    /* ── model picker ─────────────────────────────────────────────────────── */

    function ModelPicker({ models, route, inheritLabel, pending, savingKey, anchorRef, onSelect, onClose }) {
      const id = useId()
      const menuRef = useRef(null)
      const searchRef = useRef(null)
      const groupsRef = useRef(null)
      const itemRefs = useRef([])
      const [query, setQuery] = useState('')
      const showSearch = models.length > 4

      const groups = useMemo(() => groupModels(models), [models])
      const filteredGroups = useMemo(
        () =>
          groups
            .map((group) => ({ ...group, models: rankByName(group.models, query.trim()) }))
            .filter((group) => group.models.length > 0),
        [groups, query],
      )
      const visibleRows = useMemo(() => {
        const rows = []
        if (query.trim() === '') rows.push({ kind: 'inherit' })
        for (const group of filteredGroups) {
          for (const model of group.models) rows.push({ kind: 'model', group, model })
        }
        return rows
      }, [filteredGroups, query])

      const currentIndex = route
        ? visibleRows.findIndex(
            (row) =>
              row.kind === 'model' && row.model.provider === route.provider && row.model.model === route.model,
          )
        : visibleRows.findIndex((row) => row.kind === 'inherit')
      const [highlight, setHighlight] = useState(() => (currentIndex >= 0 ? currentIndex : 0))
      const position = useAnchoredMenu(menuRef, anchorRef)
      useDismissMenu(menuRef, anchorRef, onClose)

      useLayoutEffect(() => {
        if (showSearch) {
          searchRef.current?.focus()
          return
        }
        const target = itemRefs.current[currentIndex >= 0 ? currentIndex : 0]
        target?.focus()
        // Mount-only: reopening (or drilling) is a fresh component instance.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      useLayoutEffect(() => {
        if (highlight >= 0) itemRefs.current[highlight]?.scrollIntoView?.({ block: 'nearest' })
      }, [highlight])

      useLayoutEffect(() => {
        const viewport = groupsRef.current
        if (!viewport) return undefined
        const cleanup = observeStickyMenuGroups(viewport)
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [filteredGroups])

      const changeQuery = (next) => {
        setQuery(next)
        setHighlight(0)
      }

      const chooseRow = (row) => {
        if (!row || pending) return
        if (row.kind === 'inherit') {
          onSelect(null)
          return
        }
        onSelect({ provider: row.group.id, model: row.model.model, effort: null })
      }

      const onSearchKeyDown = (event) => {
        if (event.nativeEvent?.isComposing) return
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          if (visibleRows.length === 0) return
          setHighlight((current) => {
            const base = current >= 0 ? current : event.key === 'ArrowDown' ? -1 : 0
            return (base + (event.key === 'ArrowDown' ? 1 : -1) + visibleRows.length) % visibleRows.length
          })
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          const row = visibleRows[highlight] ?? visibleRows[0]
          if (row) chooseRow(row)
        }
      }

      const onMenuKeyDown = (event) => {
        if (event.nativeEvent?.isComposing) return
        if (event.target === searchRef.current) return
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const items = itemRefs.current.filter((item) => item !== null && item !== undefined)
        if (items.length === 0) return
        const active = items.indexOf(document.activeElement)
        const next =
          active < 0
            ? event.key === 'ArrowDown'
              ? 0
              : items.length - 1
            : (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next]?.focus()
        setHighlight(next)
      }

      const emptyMessage =
        models.length === 0 ? '暂无可用模型' : filteredGroups.length === 0 ? '无匹配模型' : null

      let rowIndex = 0
      const inheritShown = query.trim() === ''
      const inheritIndex = inheritShown ? rowIndex++ : -1

      return h(
        Surface,
        {
          ref: menuRef,
          className: 'dsm-menu',
          style: menuStyle(position),
          role: 'group',
          'aria-label': '模型',
          onKeyDown: onMenuKeyDown,
          onMouseDown: (event) => {
            if (showSearch && event.target instanceof Element && event.target.closest('button') !== null) {
              event.preventDefault()
            }
          },
        },
        showSearch
          ? h(
              'div',
              { className: 'dsm-searchRow' },
              h(Input, {
                ref: searchRef,
                className: cx('dsm-search', query !== '' && 'dsm-searchWithQuery'),
                type: 'text',
                role: 'searchbox',
                'aria-label': '搜索模型…',
                'aria-controls': `${id}-list`,
                'aria-activedescendant':
                  highlight >= 0 && highlight < visibleRows.length ? `${id}-row-${highlight}` : undefined,
                placeholder: '搜索模型…',
                value: query,
                onChange: (event) => changeQuery(event.target.value),
                onKeyDown: onSearchKeyDown,
              }),
              query !== ''
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsm-searchClear',
                      'aria-label': '清除搜索',
                      disabled: pending,
                      onClick: () => {
                        changeQuery('')
                        searchRef.current?.focus()
                      },
                    },
                    h(Icon, { name: 'close' }),
                  )
                : null,
            )
          : null,
        h(
          'div',
          {
            ref: groupsRef,
            id: `${id}-list`,
            className: 'dsm-groups',
            role: 'menu',
            'aria-label': '选择模型',
          },
          inheritShown
            ? h(
                'button',
                {
                  ref: (node) => {
                    itemRefs.current[inheritIndex] = node
                  },
                  key: 'inherit',
                  type: 'button',
                  role: 'menuitemradio',
                  'aria-checked': route === null,
                  disabled: pending,
                  id: `${id}-row-${inheritIndex}`,
                  tabIndex: showSearch ? -1 : 0,
                  className: cx(
                    'dsm-option',
                    route === null && 'dsm-selected',
                    highlight === inheritIndex && 'dsm-optionActive',
                  ),
                  'data-highlighted': highlight === inheritIndex ? '' : undefined,
                  onFocus: () => setHighlight(inheritIndex),
                  onMouseMove: () => {
                    if (!pending && highlight !== inheritIndex) setHighlight(inheritIndex)
                  },
                  onClick: () => chooseRow(visibleRows[inheritIndex]),
                },
                optionCopy(inheritLabel),
                optionCheck(
                  pending && savingKey === 'inherit'
                    ? h(StateDot, { state: 'ongoing' })
                    : route === null
                      ? h(Icon, { name: 'check' })
                      : null,
                ),
              )
            : null,
          inheritShown ? h('div', { role: 'separator', className: 'dsm-divider' }) : null,
          filteredGroups.map((group) =>
            h(
              MenuGroup,
              { key: group.id, label: group.name },
              group.models.map((model) => {
                const index = rowIndex++
                const selected =
                  route !== null && route.provider === group.id && route.model === model.model
                const modelKey = routeKey({ provider: group.id, model: model.model })
                return h(
                  'button',
                  {
                    ref: (node) => {
                      itemRefs.current[index] = node
                    },
                    key: model.model,
                    type: 'button',
                    role: 'menuitemradio',
                    'aria-checked': selected,
                    id: `${id}-row-${index}`,
                    tabIndex: showSearch ? -1 : 0,
                    className: cx(
                      'dsm-option',
                      selected && 'dsm-selected',
                      highlight === index && 'dsm-optionActive',
                    ),
                    'data-highlighted': highlight === index ? '' : undefined,
                    title: model.name,
                    disabled: pending,
                    onFocus: () => setHighlight(index),
                    onMouseMove: () => {
                      if (pending || highlight === index) return
                      if (showSearch) setHighlight(index)
                      else itemRefs.current[index]?.focus()
                    },
                    onClick: () => chooseRow({ kind: 'model', group, model }),
                  },
                  optionCopy(model.name),
                  optionCheck(
                    pending && savingKey === modelKey
                      ? h(StateDot, { state: 'ongoing' })
                      : selected
                        ? h(Icon, { name: 'check' })
                        : null,
                  ),
                )
              }),
            ),
          ),
        ),
        emptyMessage ? h('div', { className: 'dsm-empty', role: 'status' }, emptyMessage) : null,
      )
    }

    /* ── effort picker ───────────────────────────────────────────────────── */

    function EffortPicker({ route, efforts, pending, anchorRef, onSelect, onClose }) {
      const id = useId()
      const menuRef = useRef(null)
      const itemRefs = useRef([])
      const position = useAnchoredMenu(menuRef, anchorRef)
      useDismissMenu(menuRef, anchorRef, onClose)

      const options = useMemo(
        () => [
          { key: 'model-default', effort: null, label: '模型默认' },
          ...efforts.map((effort) => ({ key: `effort:${effort.id}`, effort: effort.id, label: effort.name })),
        ],
        [efforts],
      )
      const currentIndex = options.findIndex((option) => option.effort === (route?.effort ?? null))
      const [highlight, setHighlight] = useState(() => (currentIndex >= 0 ? currentIndex : 0))

      useLayoutEffect(() => {
        itemRefs.current[currentIndex >= 0 ? currentIndex : 0]?.focus()
        // Mount-only: a fresh component instance per opening.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      const onMenuKeyDown = (event) => {
        if (event.nativeEvent?.isComposing) return
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const items = itemRefs.current.filter((item) => item !== null && item !== undefined)
        if (items.length === 0) return
        const active = items.indexOf(document.activeElement)
        const next =
          active < 0
            ? event.key === 'ArrowDown'
              ? 0
              : items.length - 1
            : (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next]?.focus()
        setHighlight(next)
      }

      const chooseEffort = (option) => {
        if (pending || !route) return
        onSelect({ ...route, effort: option.effort })
      }

      return h(
        Surface,
        {
          ref: menuRef,
          className: 'dsm-menu',
          style: menuStyle(position),
          role: 'group',
          'aria-label': '思考强度',
          onKeyDown: onMenuKeyDown,
        },
        efforts.length === 0
          ? h('div', { className: 'dsm-empty', role: 'status' }, '该模型不公布思考强度')
          : h(
              'div',
              { className: 'dsm-groups', role: 'menu', 'aria-label': '选择思考强度' },
              options.map((option, index) => {
                const selected = option.effort === (route?.effort ?? null)
                return h(
                  'button',
                  {
                    ref: (node) => {
                      itemRefs.current[index] = node
                    },
                    key: option.key,
                    type: 'button',
                    role: 'menuitemradio',
                    'aria-checked': selected,
                    id: `${id}-effort-${index}`,
                    tabIndex: 0,
                    className: cx(
                      'dsm-option',
                      selected && 'dsm-selected',
                      highlight === index && 'dsm-optionActive',
                    ),
                    'data-highlighted': highlight === index ? '' : undefined,
                    disabled: pending,
                    onFocus: () => setHighlight(index),
                    onMouseMove: () => {
                      if (pending || highlight === index) return
                      itemRefs.current[index]?.focus()
                    },
                    onClick: () => chooseEffort(option),
                  },
                  optionCopy(option.label),
                  optionCheck(selected ? h(Icon, { name: 'check' }) : null),
                )
              }),
            ),
      )
    }

    /* ── the card: one entry, two scopes ──────────────────────────────────── */

    function RouteCard({ sessionId, cardRef, overlayAnchor }) {
      const { data, error, pending, save, reload } = useRoute(sessionId)
      const [scope, setScope] = useState('session')
      const [picker, setPicker] = useState(null)
      const [savingKey, setSavingKey] = useState(null)
      const modelCellRef = useRef(null)
      const effortCellRef = useRef(null)

      const models = data?.models ?? []
      const globalRoute = data?.global?.default ?? null
      const sessionRoute = data?.session?.default ?? null
      const effective = sessionRoute ?? globalRoute ?? null
      const source = sessionRoute ? '本对话' : globalRoute ? '全局默认' : '主会话'

      const width = 380
      const margin = 12
      const viewWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
      const viewHeight = typeof window === 'undefined' ? 800 : window.innerHeight
      const left = overlayAnchor
        ? Math.min(Math.max(margin, Math.round(overlayAnchor.left)), Math.max(margin, viewWidth - width - margin))
        : Math.round((viewWidth - width) / 2)
      const bottom = overlayAnchor ? Math.max(margin, Math.round(viewHeight - overlayAnchor.top + 10)) : 104

      const route = scope === 'session' ? sessionRoute : globalRoute
      const inheritLabel = scope === 'session' ? '跟随全局' : '跟随主会话'
      const model = findModel(models, route)
      const efforts = model?.efforts ?? []
      const modelsAvailable = models.length > 0
      const effortValue =
        !modelsAvailable || !route || efforts.length === 0
          ? '—'
          : route.effort
            ? efforts.find((effort) => effort.id === route.effort)?.name ?? route.effort
            : '模型默认'
      const effortTitle = !modelsAvailable
        ? '模型目录不可用'
        : !route
          ? '先选择模型'
          : efforts.length === 0
            ? '该模型不公布思考强度'
            : '思考强度'
      const effortDisabled = !modelsAvailable || !route || efforts.length === 0

      const closeCard = useCallback(() => overlay.set({ open: false, sessionId: null, anchor: null }), [])

      const closePicker = (focusCell) => {
        const kind = picker
        setPicker(null)
        if (!focusCell || !kind) return
        requestAnimationFrame(() => {
          const cell = kind === 'model' ? modelCellRef.current : effortCellRef.current
          cell?.focus()
        })
      }

      const commit = (next, pendingKey) => {
        setSavingKey(pendingKey)
        const payload =
          scope === 'session'
            ? { scope: 'session', sessionId, route: next }
            : { scope: 'global', route: next }
        void save(payload).finally(() => setSavingKey(null))
      }

      const selectModel = (next) => {
        const same =
          next === null
            ? route === null
            : route !== null && route.provider === next.provider && route.model === next.model
        closePicker(true)
        if (same) return
        commit(next, next ? routeKey(next) : 'inherit')
      }

      const selectEffort = (next) => {
        const same = route !== null && (route.effort ?? null) === (next.effort ?? null)
        closePicker(true)
        if (same) return
        commit(next, null)
      }

      useEffect(() => {
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          if (picker) {
            event.preventDefault()
            event.stopPropagation()
            closePicker(true)
            return
          }
          event.preventDefault()
          closeCard()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
        // picker drives which layer Escape dismisses; the rest are stable enough.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [picker, closeCard])

      return h(
        Surface,
        {
          ref: cardRef,
          role: 'dialog',
          'aria-label': '子代理模型与思考强度',
          className: 'dsm-card',
          style: {
            pointerEvents: 'auto',
            position: 'absolute',
            left,
            bottom,
            width,
            maxWidth: 'calc(100vw - 32px)',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            textAlign: 'left',
            borderRadius: 'var(--dsw-radius-lg)',
            boxShadow: 'var(--dsw-elevation-prominent)',
            color: 'var(--dsw-alias-label-primary)',
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
          h('div', { className: 'dsm-cardTitle' }, '子代理'),
          h(Pill, { active: Boolean(sessionRoute) }, sessionRoute ? '本对话已覆盖' : '本对话跟随全局'),
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 } },
          h(SegmentedControl, {
            id: 'dsm-scope',
            value: scope,
            options: [
              { value: 'session', label: '本对话' },
              { value: 'global', label: '全局默认' },
            ],
            onChange: setScope,
            label: '设置范围',
            disabled: pending,
          }),
          h(
            'span',
            { className: 'dsm-caption', style: { marginLeft: 'auto', whiteSpace: 'nowrap' } },
            scope === 'session' ? '只影响当前对话' : '影响所有未覆盖的对话',
          ),
        ),
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
          h(
            'button',
            {
              ref: modelCellRef,
              type: 'button',
              className: 'dsm-cell',
              'aria-haspopup': 'menu',
              'aria-expanded': picker === 'model',
              onClick: () => setPicker(picker === 'model' ? null : 'model'),
            },
            h('span', { className: 'dsm-cellLabel' }, '模型'),
            h('span', { className: 'dsm-cellValue' }, route ? model?.name ?? routeText(route) : inheritLabel),
            h(Icon, { name: 'chevronRight', className: 'dsm-cellChevron' }),
          ),
          h(
            'button',
            {
              ref: effortCellRef,
              type: 'button',
              className: 'dsm-cell',
              disabled: effortDisabled,
              title: effortTitle,
              'aria-haspopup': 'menu',
              'aria-expanded': picker === 'effort',
              onClick: () => setPicker(picker === 'effort' ? null : 'effort'),
            },
            h('span', { className: 'dsm-cellLabel' }, '思考强度'),
            h('span', { className: 'dsm-cellValue' }, effortValue),
            h(Icon, { name: 'chevronRight', className: 'dsm-cellChevron' }),
          ),
        ),
        scope === 'session'
          ? h(
              'div',
              { className: 'dsm-caption' },
              `全局默认：${globalRoute ? routeText(globalRoute) : '未设置'}`,
            )
          : null,
        h(
          'div',
          { className: 'dsm-caption' },
          effective
            ? `下一次委派将使用 ${routeText(effective)}（来源：${source}）`
            : '未配置：下一次委派跟随主会话路由',
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
          h(
            'div',
            { style: { display: 'flex', gap: 8, minWidth: 0 } },
            scope === 'session' && sessionRoute
              ? h(
                  'button',
                  { type: 'button', className: 'dsm-btn', onClick: () => commit(null, 'inherit') },
                  '清除本对话覆盖',
                )
              : null,
          ),
          h('button', { type: 'button', className: 'dsm-btn', onClick: closeCard }, '完成'),
        ),
        h(ErrorLine, { message: error, onRetry: reload }),
        picker === 'model'
          ? h(ModelPicker, {
              models,
              route,
              inheritLabel,
              pending,
              savingKey,
              anchorRef: modelCellRef,
              onSelect: selectModel,
              onClose: closePicker,
            })
          : null,
        picker === 'effort'
          ? h(EffortPicker, {
              route,
              efforts,
              pending,
              anchorRef: effortCellRef,
              onSelect: selectEffort,
              onClose: closePicker,
            })
          : null,
      )
    }

    function ErrorLine({ message, onRetry }) {
      if (!message) return null
      return h(
        'div',
        { className: 'dsm-error' },
        h('span', null, message),
        onRetry ? h('button', { type: 'button', className: 'dsm-retry', onClick: onRetry }, '重试') : null,
      )
    }

    function RouteOverlay() {
      const { open, sessionId, anchor } = useOverlayState()
      const cardRef = useRef(null)

      useEffect(() => {
        if (!open) return undefined
        const onDown = (event) => {
          if (cardRef.current && cardRef.current.contains(event.target)) return
          overlay.set({ open: false, sessionId: null, anchor: null })
        }
        document.addEventListener('mousedown', onDown)
        return () => {
          document.removeEventListener('mousedown', onDown)
        }
      }, [open])

      if (!open || !sessionId) return null
      return h(
        'div',
        { style: { position: 'fixed', inset: 0, zIndex: 900, pointerEvents: 'none' } },
        h(RouteCard, { key: sessionId, sessionId, cardRef, overlayAnchor: anchor }),
      )
    }

    /* ── the chip: the only entry ─────────────────────────────────────────── */

    function ComposerChip(props) {
      const sessionId = props.sessionId
      const { data } = useRoute(sessionId)
      const overlayState = useOverlayState()
      const chipRef = useRef(null)

      const globalRoute = data?.global?.default ?? null
      const sessionRoute = data?.session?.default ?? null
      const effective = sessionRoute ?? globalRoute ?? null
      const isOpen = overlayState.open && overlayState.sessionId === sessionId
      const label = effective ? `子代理 ${routeText(effective)}` : '子代理 跟随主会话'

      return h(
        'button',
        {
          ref: chipRef,
          type: 'button',
          className: 'dsm-chip',
          onClick: () => {
            if (isOpen) {
              overlay.set({ open: false, sessionId: null, anchor: null })
              return
            }
            const rect = chipRef.current?.getBoundingClientRect()
            overlay.set({
              open: true,
              sessionId,
              anchor: rect ? { left: rect.left, top: rect.top } : null,
            })
          },
          title: effective
            ? `子代理将使用 ${effective.provider}/${effective.model}${effective.effort ? `（${effective.effort}）` : ''}${sessionRoute ? '，来源：本对话' : '，来源：全局默认'}`
            : '未配置子代理模型，跟随主会话',
          'aria-label': label,
          'aria-haspopup': 'dialog',
          'aria-expanded': isOpen,
          style: { color: sessionRoute ? TOKENS.brand : TOKENS.secondary },
        },
        h(Icon, { name: 'agent', size: 16, className: 'dsm-chipIcon' }),
        h('span', { className: 'dsm-chipLabel' }, label),
        h(Icon, {
          name: 'chevronDown',
          size: 12,
          className: cx('dsm-chipChevron', isOpen && 'dsm-chipChevronOpen'),
        }),
      )
    }

    injectStyles()

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register({ name: 'conversation.input.right', id: 'subagent-routing', order: 20 }, ComposerChip),
        )
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'subagent-routing', order: 50 }, RouteOverlay),
        )
        // One-shot health note: proves this module reached the Host face from the
        // page. No user data, no token, no URL beyond the origin.
        void fetch(`${ENDPOINT}/hello`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ origin: location.origin, scope: 'client-loaded', rev: 8 }),
        }).catch(() => {})
      },
    }
  },
})
