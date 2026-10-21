/**
 * Subagent routing — Web UI.
 *
 * Two surfaces over one route store:
 *   settings.section          the profile-wide default route
 *   conversation.input.right  a chip beside the model picker, for THIS conversation
 *
 * The per-conversation editor itself lives in `shell.overlay` — the frame-wide
 * floating layer — instead of inside the composer. The composer sits in a
 * transformed layer, where a `position: fixed` popover resolves against that
 * layer and `getBoundingClientRect` values drift, so an anchored popover landed
 * away from the chip and shifted as soon as the toolbar re-rendered on hover.
 * The overlay is outside every column and scroll container, so the card keeps
 * the coordinates it computes and cannot be clipped by the composer.
 *
 * The route is applied by the Host `agent/request` override, so this module
 * never touches delegation itself; it reads and writes /plugin/subagent-models/*.
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

    /* ── shared per-conversation editor state ─────────────────────────────── */

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

    function labelFor(route) {
      if (!route) return '跟随主会话'
      return route.model
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

    function useRoutes(sessionId) {
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
            setData(await writeRoute({ ...payload, sessionId: payload.scope === 'session' ? sessionId : undefined }))
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
      maxWidth: 190,
    }

    function RouteControls({ models, route, disabled, onChange }) {
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
          h('option', { value: INHERIT }, '跟随主会话'),
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
        overridden ? '本对话已覆盖' : '跟随全局',
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

    function linkButtonStyle() {
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

    /* ── settings page: the profile-wide default ──────────────────────────── */

    function SettingsSection() {
      const { data, error, pending, save, reload } = useRoutes(null)
      const models = data?.models ?? []
      const route = data?.global?.default ?? null
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 24px 24px', color: TOKENS.text } },
        h(
          'div',
          null,
          h('div', { style: { fontSize: 18, lineHeight: '26px', fontWeight: 600 } }, '子代理'),
          h(
            'div',
            { style: { fontSize: 13, lineHeight: '20px', color: TOKENS.secondary, marginTop: 4 } },
            '决定 subagent 委派的子代理使用哪个模型、思考多深。这里是本 profile 的默认值；某个对话可以在输入框旁的「⤳ 子代理」里单独覆盖。',
          ),
        ),
        h(
          'div',
          {
            style: {
              border: `0.5px solid ${TOKENS.border}`,
              borderRadius: 14,
              padding: '12px 14px',
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              background: TOKENS.surface,
            },
          },
          h(
            'div',
            { style: { minWidth: 200, flex: 1 } },
            h('div', { style: { fontSize: 13, lineHeight: '20px', fontWeight: 600 } }, '全局默认'),
            h(
              'div',
              { style: { fontSize: 12, lineHeight: '18px', color: TOKENS.secondary } },
              route
                ? `委派子代理时使用 ${labelFor(route)}${route.effort ? ` · ${route.effort}` : ''}`
                : '未指定时，子代理跟随发起委派的主会话路由',
            ),
          ),
          h(RouteControls, {
            models,
            route,
            disabled: pending,
            onChange: (next) => save({ scope: 'global', route: next }),
          }),
        ),
        h(
          'div',
          { style: { fontSize: 12, lineHeight: '18px', color: TOKENS.secondary } },
          '下一次委派生效，不需要重启。fork 子代理始终继承父会话路由，以保留上下文缓存复用。',
        ),
        h(ErrorLine, { message: error, onRetry: reload }),
      )
    }

    /* ── frame-wide card: this conversation's override ─────────────────────── */

    function ConversationPanel({ sessionId, cardRef, overlayAnchor }) {
      const { data, error, pending, save, reload } = useRoutes(sessionId)
      const models = data?.models ?? []
      const override = data?.session?.default ?? null
      const effective = override ?? data?.global?.default ?? null
      const close = () => overlay.set({ open: false, sessionId: null, anchor: null })
      // Anchored above the chip: the card lives in the frame-wide layer, so it
      // owns viewport coordinates and the chip rect it was opened from is a
      // plain measurement, not a positioning context inside the composer's
      // transformed layer.
      const width = 380
      const margin = 12
      const viewWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
      const viewHeight = typeof window === 'undefined' ? 800 : window.innerHeight
      const left = overlayAnchor
        ? Math.min(Math.max(margin, Math.round(overlayAnchor.left)), Math.max(margin, viewWidth - width - margin))
        : Math.round((viewWidth - width) / 2)
      const bottom = overlayAnchor ? Math.max(margin, Math.round(viewHeight - overlayAnchor.top + 10)) : 104

      return h(
        'div',
        {
          ref: cardRef,
          role: 'dialog',
          'aria-label': '本对话的子代理路由',
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
          h('div', { style: { fontSize: 14, fontWeight: 600 } }, '本对话的子代理'),
          h(ScopeBadge, { overridden: Boolean(override) }),
        ),
        h(
          'div',
          { style: { fontSize: 12, lineHeight: '18px', color: TOKENS.secondary } },
          data?.global?.default
            ? `全局默认：${labelFor(data.global.default)}${data.global.default.effort ? ` · ${data.global.default.effort}` : ''}`
            : '全局未指定：子代理跟随主会话路由',
        ),
        h(RouteControls, {
          models,
          route: override,
          disabled: pending,
          onChange: (next) => save({ scope: 'session', route: next }),
        }),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
          h(
            'div',
            { style: { fontSize: 11, lineHeight: '16px', color: TOKENS.secondary } },
            effective ? `下一次委派使用 ${effective.model}` : '下一次委派跟随主会话',
          ),
          h(
            'div',
            { style: { display: 'flex', gap: 8 } },
            override ? h('button', { type: 'button', onClick: () => save({ scope: 'session', route: null }), style: linkButtonStyle() }, '重置为全局') : null,
            h('button', { type: 'button', onClick: close, style: linkButtonStyle() }, '完成'),
          ),
        ),
        h(ErrorLine, { message: error, onRetry: reload }),
      )
    }

    function ConversationOverlay() {
      const { open, sessionId, anchor } = useOverlayState()
      const cardRef = useRef(null)

      useEffect(() => {
        if (!open) return undefined
        // The frame-wide layer is click-through by design, so closing cannot
        // ride on a backdrop: watch document-level mousedown and ignore what
        // happened inside the card.
        const onDown = (event) => {
          if (cardRef.current && cardRef.current.contains(event.target)) return
          overlay.set({ open: false, sessionId: null, anchor: null })
        }
        const onKey = (event) => {
          if (event.key === 'Escape') overlay.set({ open: false, sessionId: null })
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
        h(ConversationPanel, { key: sessionId, sessionId, cardRef, overlayAnchor: anchor }),
      )
    }

    /* ── composer chip: opens the card for this conversation ──────────────── */

    function ComposerChip(props) {
      const sessionId = props.sessionId
      const { data } = useRoutes(sessionId)
      const overlayState = useOverlayState()
      const chipRef = useRef(null)

      const override = data?.session?.default ?? null
      const effective = override ?? data?.global?.default ?? null
      const isOpen = overlayState.open && overlayState.sessionId === sessionId
      const chipLabel = override ? `子代理 ${override.model}` : '子代理'

      return h(
        'button',
        {
          type: 'button',
          ref: chipRef,
          onClick: () => {
            if (isOpen) {
              overlay.set({ open: false, sessionId: null, anchor: null })
              return
            }
            const rect = chipRef.current?.getBoundingClientRect()
            overlay.set({
              open: true,
              sessionId,
              anchor: rect ? { left: rect.left, top: rect.top, width: rect.width } : null,
            })
          },
          title: effective ? `子代理将使用 ${effective.provider}/${effective.model}` : '子代理跟随主会话路由',
          'aria-haspopup': 'dialog',
          'aria-expanded': isOpen,
          style: {
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            borderRadius: 8,
            border: `0.5px solid ${override ? TOKENS.brand : TOKENS.border}`,
            background: isOpen ? TOKENS.surface : 'transparent',
            color: override ? TOKENS.brand : TOKENS.secondary,
            fontSize: 12,
            padding: '0 8px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            maxWidth: 180,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          },
        },
        h('span', { 'aria-hidden': true, style: { fontSize: 12 } }, '⤳'),
        h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, chipLabel),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            { name: 'settings.section', id: 'subagent-routing', order: 12, label: () => '子代理' },
            SettingsSection,
          ),
        )
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register({ name: 'conversation.input.right', id: 'subagent-routing', order: 20 }, ComposerChip),
        )
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'subagent-routing', order: 50 }, ConversationOverlay),
        )
        // One-shot health note: proves this module reached the Host face from the
        // page. No user data, no token, no URL beyond the origin.
        void fetch(`${ENDPOINT}/hello`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ origin: location.origin, scope: 'client-loaded', rev: 3 }),
        }).catch(() => {})
      },
    }
  },
})
