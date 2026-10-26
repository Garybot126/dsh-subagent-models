/**
 * Subagent models — Web UI.
 *
 * ONE entry: the chip beside the composer. It opens a frame-wide card with two
 * scopes over the same two controls — 「本对话」(this conversation's override)
 * and 「全局默认」(the profile-wide default) — and never anywhere else: no
 * settings page, so there is no second place to look for the value.
 *
 * The route is applied by the Host `agent/request` override; this module only
 * reads and writes /plugin/subagent-models/*.
 */
window.__ModuleLoader__.load({
  id: 'dsh-subagent-models',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const ENDPOINT = '/plugin/subagent-models'
    const INHERIT = ''

    const TOKENS = {
      text: 'var(--dsw-alias-label-primary)',
      secondary: 'var(--dsw-alias-label-secondary)',
      border: 'var(--dsw-alias-border-l1)',
      surface: 'var(--dsw-alias-bg-layer-1)',
      overlay: 'var(--dsw-alias-bg-overlay)',
      brand: 'var(--dsw-alias-brand-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
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
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const [pending, setPending] = useState(false)

      const reload = useCallback(async () => {
        try {
          setData(await readState(sessionId))
          setError(null)
        } catch (cause) {
          setError(cause.message ?? String(cause))
        }
      }, [sessionId])

      useEffect(() => {
        let alive = true
        readState(sessionId)
          .then((next) => {
            if (alive) {
              setData(next)
              setError(null)
            }
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
            setData(await readState(sessionId))
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

    function findModel(models, route) {
      if (!route) return null
      return models.find((model) => model.provider === route.provider && model.model === route.model) ?? null
    }

    function GroupedModelOptions({ models }) {
      const groups = useMemo(() => {
        const map = new Map()
        for (const model of models) {
          if (!map.has(model.provider)) map.set(model.provider, { name: model.providerName, models: [] })
          map.get(model.provider).models.push(model)
        }
        return Array.from(map.values())
      }, [models])
      return groups.map((group) =>
        h(
          'optgroup',
          { key: group.name, label: group.name },
          group.models.map((model) =>
            h('option', { key: `${model.provider}/${model.model}`, value: `${model.provider}\u0000${model.model}` }, model.name),
          ),
        ),
      )
    }

    const selectStyle = {
      appearance: 'auto',
      height: 32,
      borderRadius: 8,
      border: `0.5px solid ${TOKENS.border}`,
      background: TOKENS.surface,
      color: TOKENS.text,
      fontSize: 12,
      padding: '0 24px 0 10px',
      fontFamily: 'inherit',
      maxWidth: 210,
    }

    function RouteControls({ models, route, inheritLabel, disabled, onChange }) {
      const model = findModel(models, route)
      const efforts = model?.efforts ?? []
      return h(
        'div',
        { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
        h(
          'select',
          {
            'aria-label': '子代理模型',
            style: selectStyle,
            value: routeKey(route),
            disabled,
            onChange: (event) => {
              const value = event.target.value
              if (!value) return onChange(null)
              const [provider, id] = value.split('\u0000')
              onChange({ provider, model: id, effort: null })
            },
          },
          h('option', { value: INHERIT }, inheritLabel),
          h(GroupedModelOptions, { models }),
        ),
        h(
          'select',
          {
            'aria-label': '思考强度',
            style: { ...selectStyle, maxWidth: 132 },
            value: route?.effort ?? INHERIT,
            disabled: disabled || !route || efforts.length === 0,
            title: models.length === 0 ? '模型目录不可用' : efforts.length === 0 ? '该模型不公布思考强度' : '思考强度',
            onChange: (event) => route && onChange({ ...route, effort: event.target.value || null }),
          },
          h('option', { value: INHERIT }, efforts.length === 0 ? '—' : '模型默认'),
          efforts.map((effort) => h('option', { key: effort.id, value: effort.id }, effort.name)),
        ),
      )
    }

    function ScopeBadge({ overridden }) {
      return h(
        'span',
        {
          style: {
            fontSize: 11,
            lineHeight: '16px',
            borderRadius: 6,
            padding: '1px 6px',
            border: `0.5px solid ${overridden ? TOKENS.brand : TOKENS.border}`,
            color: overridden ? TOKENS.brand : TOKENS.secondary,
            whiteSpace: 'nowrap',
          },
        },
        overridden ? '本对话已覆盖' : '本对话跟随全局',
      )
    }

    function ErrorLine({ message, onRetry }) {
      if (!message) return null
      return h(
        'div',
        {
          style: {
            color: TOKENS.error,
            fontSize: 12,
            lineHeight: '18px',
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          },
        },
        h('span', null, message),
        onRetry
          ? h(
              'button',
              {
                type: 'button',
                onClick: onRetry,
                style: {
                  height: 24,
                  borderRadius: 6,
                  border: `0.5px solid ${TOKENS.border}`,
                  background: 'transparent',
                  color: TOKENS.text,
                  fontSize: 11,
                  padding: '0 8px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                },
              },
              '重试',
            )
          : null,
      )
    }

    function ScopeTab({ active, label, onClick }) {
      return h(
        'button',
        {
          type: 'button',
          onClick,
          'aria-pressed': active,
          style: {
            height: 26,
            borderRadius: 7,
            border: `0.5px solid ${active ? TOKENS.brand : TOKENS.border}`,
            background: active ? TOKENS.surface : 'transparent',
            color: active ? TOKENS.brand : TOKENS.secondary,
            fontSize: 12,
            padding: '0 10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          },
        },
        label,
      )
    }

    /* ── the card: one entry, two scopes ──────────────────────────────────── */

    function RouteCard({ sessionId, cardRef, overlayAnchor }) {
      const { data, error, pending, save, reload } = useRoute(sessionId)
      const [scope, setScope] = useState('session')
      const models = data?.models ?? []
      const globalRoute = data?.global?.default ?? null
      const sessionRoute = data?.session?.default ?? null
      const effective = sessionRoute ?? globalRoute ?? null
      const source = sessionRoute ? '本对话' : globalRoute ? '全局默认' : '主会话'
      const close = () => overlay.set({ open: false, sessionId: null, anchor: null })

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
      const onChange = (next) => save(
        scope === 'session' ? { scope: 'session', sessionId, route: next } : { scope: 'global', route: next },
      )

      return h(
        'div',
        {
          ref: cardRef,
          role: 'dialog',
          'aria-label': '子代理模型与思考强度',
          style: {
            pointerEvents: 'auto',
            position: 'absolute',
            left,
            bottom,
            width,
            maxWidth: 'calc(100vw - 32px)',
            background: TOKENS.overlay,
            color: TOKENS.text,
            border: `0.5px solid ${TOKENS.border}`,
            borderRadius: 16,
            boxShadow: '0 18px 48px rgba(0, 0, 0, 0.22)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            textAlign: 'left',
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
          h('div', { style: { fontSize: 14, fontWeight: 600 } }, '子代理'),
          h(ScopeBadge, { overridden: Boolean(sessionRoute) }),
        ),
        h(
          'div',
          { style: { display: 'flex', gap: 6, alignItems: 'center' } },
          h(ScopeTab, { active: scope === 'session', label: '本对话', onClick: () => setScope('session') }),
          h(ScopeTab, { active: scope === 'global', label: '全局默认', onClick: () => setScope('global') }),
          h(
            'div',
            { style: { fontSize: 11, lineHeight: '16px', color: TOKENS.secondary, marginLeft: 4 } },
            scope === 'session' ? '只影响当前对话' : '影响所有未覆盖的对话',
          ),
        ),
        h(RouteControls, {
          models,
          route,
          inheritLabel,
          disabled: pending,
          onChange,
        }),
        scope === 'session'
          ? h(
              'div',
              { style: { fontSize: 11, lineHeight: '16px', color: TOKENS.secondary } },
              `全局默认：${globalRoute ? routeText(globalRoute) : '未设置'}`,
            )
          : null,
        h(
          'div',
          { style: { fontSize: 11, lineHeight: '16px', color: TOKENS.secondary } },
          effective
            ? `下一次委派将使用 ${routeText(effective)}（来源：${source}）`
            : '未配置：下一次委派跟随主会话路由',
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
          h(
            'div',
            { style: { display: 'flex', gap: 8 } },
            scope === 'session' && sessionRoute
              ? h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => save({ scope: 'session', sessionId, route: null }),
                    style: buttonStyle(),
                  },
                  '清除本对话覆盖',
                )
              : null,
          ),
          h('button', { type: 'button', onClick: close, style: buttonStyle() }, '完成'),
        ),
        h(ErrorLine, { message: error, onRetry: reload }),
      )
    }

    function buttonStyle() {
      return {
        height: 26,
        borderRadius: 7,
        border: `0.5px solid ${TOKENS.border}`,
        background: 'transparent',
        color: TOKENS.text,
        fontSize: 12,
        padding: '0 10px',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }
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
        const onKey = (event) => {
          if (event.key === 'Escape') overlay.set({ open: false, sessionId: null, anchor: null })
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
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
          'aria-haspopup': 'dialog',
          'aria-expanded': isOpen,
          style: {
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            borderRadius: 8,
            border: `0.5px solid ${sessionRoute ? TOKENS.brand : TOKENS.border}`,
            background: isOpen ? TOKENS.surface : 'transparent',
            color: effective ? TOKENS.brand : TOKENS.secondary,
            fontSize: 12,
            padding: '0 8px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            maxWidth: 220,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          },
        },
        h('span', { 'aria-hidden': true, style: { fontSize: 12 } }, '⤳'),
        h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, label),
      )
    }

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
          body: JSON.stringify({ origin: location.origin, scope: 'client-loaded', rev: 5 }),
        }).catch(() => {})
      },
    }
  },
})
