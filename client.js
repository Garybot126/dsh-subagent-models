/**
 * Subagent models — Web UI.
 *
 * ONE setting, ONE place to change it: `settings.section` renders the only
 * editor (provider/model + reasoning effort). The composer badge is read-only
 * status so the conversation always says what the subagents will actually use.
 *
 * The route is applied by the Host `agent/request` override; this module only
 * reads and writes /plugin/subagent-models/*.
 */
window.__ModuleLoader__.load({
  id: 'dsh-subagent-models',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    const ENDPOINT = '/plugin/subagent-models'
    const INHERIT = ''

    const TOKENS = {
      text: 'var(--dsw-alias-label-primary)',
      secondary: 'var(--dsw-alias-label-secondary)',
      border: 'var(--dsw-alias-border-l1)',
      surface: 'var(--dsw-alias-bg-layer-1)',
      brand: 'var(--dsw-alias-brand-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
    }

    function routeKey(route) {
      return route ? `${route.provider}\u0000${route.model}` : INHERIT
    }

    function routeText(route) {
      if (!route) return '跟随主会话'
      return route.effort ? `${route.model} · ${route.effort}` : route.model
    }

    async function readState() {
      const response = await fetch(`${ENDPOINT}/state`, { headers: { accept: 'application/json' } })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? `请求失败（${response.status}）`)
      return body
    }

    async function writeRoute(route) {
      const response = await fetch(`${ENDPOINT}/route`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ scope: 'global', route }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? `保存失败（${response.status}）`)
      return body
    }

    function useRoute() {
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const [pending, setPending] = useState(false)

      const reload = useCallback(async () => {
        try {
          setData(await readState())
          setError(null)
        } catch (cause) {
          setError(cause.message ?? String(cause))
        }
      }, [])

      useEffect(() => {
        let alive = true
        readState()
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
      }, [])

      const save = useCallback(async (route) => {
        setPending(true)
        try {
          setData(await writeRoute(route))
          setError(null)
        } catch (cause) {
          setError(cause.message ?? String(cause))
        } finally {
          setPending(false)
        }
      }, [])

      return { data, error, pending, save, reload }
    }

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
      maxWidth: 220,
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

    /** The only editor: the profile-wide route for every delegated subagent. */
    function SettingsSection() {
      const { data, error, pending, save, reload } = useRoute()
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
            '所有 subagent 委派的子代理都用这里的 provider、模型与思考强度。改完对下一次委派立即生效；正在运行中的子代理，从它的下一次模型请求起生效。',
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
            h('div', { style: { fontSize: 13, lineHeight: '20px', fontWeight: 600 } }, '默认路由'),
            h(
              'div',
              { style: { fontSize: 12, lineHeight: '18px', color: TOKENS.secondary } },
              route
                ? `子代理将使用 ${route.provider} / ${route.model}${route.effort ? ` · ${route.effort}` : ''}`
                : '未指定：子代理跟随发起委派的主会话路由',
            ),
          ),
          h(RouteControls, { models, route, disabled: pending, onChange: (next) => save(next) }),
        ),
        h(
          'div',
          { style: { fontSize: 12, lineHeight: '18px', color: TOKENS.secondary } },
          '这是唯一设置入口：输入框旁只显示当前生效值，不提供第二个设置位置。fork 子代理也按同一路由运行——它共享父会话前缀，换模型会使这段前缀的缓存复用失效。',
        ),
        h(ErrorLine, { message: error, onRetry: reload }),
      )
    }

    /** Read-only: what this conversation's subagents will run with. */
    function StatusBadge() {
      const { data } = useRoute()
      const route = data?.global?.default ?? null
      const label = route ? `子代理 ${routeText(route)}` : '子代理 跟随主会话'
      return h(
        'span',
        {
          role: 'status',
          title: route
            ? `子代理将使用 ${route.provider}/${route.model}${route.effort ? `（${route.effort}）` : ''}；在 设置 › 子代理 中修改`
            : '未配置子代理路由，子代理跟随主会话；在 设置 › 子代理 中配置',
          style: {
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            borderRadius: 8,
            color: route ? TOKENS.brand : TOKENS.secondary,
            fontSize: 12,
            padding: '0 8px',
            cursor: 'default',
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
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            { name: 'settings.section', id: 'subagent-routing', order: 12, label: () => '子代理' },
            SettingsSection,
          ),
        )
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register({ name: 'conversation.input.right', id: 'subagent-routing', order: 20 }, StatusBadge),
        )
        // One-shot health note: proves this module reached the Host face from the
        // page. No user data, no token, no URL beyond the origin.
        void fetch(`${ENDPOINT}/hello`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ origin: location.origin, scope: 'client-loaded', rev: 4 }),
        }).catch(() => {})
      },
    }
  },
})
