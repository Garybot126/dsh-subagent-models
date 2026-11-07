/**
 * Subagent routing: choose the provider/model/reasoning effort delegated
 * children run with — per profile (global) or per conversation.
 *
 * WHY `agent/created` AND `agent.model.select()`
 * ----------------------------------------------
 * The delegation tool (`subagent`) is composed in the AGENT-PLANE preset
 * (`~/.dsh/.agent-presets/<name>/agent.cordis.yml`), not in the Host profile
 * patch, and it already carries a static `agentOptions` pin. A plugin can
 * neither edit that composition nor affect it from the profile layer, so the
 * route is applied on the Host side, to the delegated child itself.
 *
 * An earlier version rewrote the result of the `agent/request` waterfall. That
 * seam is contract-frozen since DSH 0.2.2: the step's `selection` is computed
 * before the waterfall runs, and `prepareRequest` then throws when the proposed
 * config names a different provider/model/reasoningEffort than the selection
 * fixed for that step ("... after step preparation fixed ...; use
 * agent.model.select() before step preparation"). Every delegated child died
 * before its first turn under that override.
 *
 * The supported seam sits one level up: a step reads its selection from the
 * Session's `model/selection` projection, and `agent.model.select()` appends
 * that event. `agent/created` is emitted — and awaited, it is a serial event —
 * after the child is constructed but before its first step prepares, so
 * selecting the route there fixes the child for every request. Only delegated
 * children are touched; a top-level Session keeps the user's choice.
 *
 * Route precedence for the child of conversation S: S.default -> global.default
 * -> none. `none`, or a route whose provider/model is no longer advertised by a
 * mounted provider, leaves the child with whatever its composition created it
 * with. Preset-scoped entries stay in the state file but are not applied.
 */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

/**
 * One prefix route serves the whole settings page. No trailing slash: the
 * server matches `pathname === prefix || pathname.startsWith(prefix + '/')`, so
 * a trailing slash here would demand a double slash and never match.
 */
const ROUTE_PREFIX = '/plugin/subagent-models'
const STATE_VERSION = 1
const CATALOG_TTL_MS = 30_000

const EMPTY_LAYER = () => ({ default: null, presets: {} })

function dataFile() {
  const home = process.env.DSH_HOME || path.join(homedir(), '.dsh')
  return path.join(home, 'plugin-data', 'subagent-models.json')
}

function normalizeRoute(input) {
  if (!input || typeof input !== 'object') return null
  const provider = typeof input.provider === 'string' ? input.provider.trim() : ''
  const model = typeof input.model === 'string' ? input.model.trim() : ''
  if (!provider || !model) return null
  const effort = typeof input.effort === 'string' && input.effort.trim() ? input.effort.trim() : null
  return { provider, model, effort }
}

function normalizeLayer(input) {
  const layer = EMPTY_LAYER()
  if (!input || typeof input !== 'object') return layer
  layer.default = normalizeRoute(input.default)
  const presets = input.presets && typeof input.presets === 'object' ? input.presets : {}
  for (const [key, value] of Object.entries(presets)) {
    const route = normalizeRoute(value)
    if (route && typeof key === 'string' && key) layer.presets[key] = route
  }
  return layer
}

function normalizeState(input) {
  const state = { version: STATE_VERSION, global: EMPTY_LAYER(), sessions: {} }
  if (!input || typeof input !== 'object') return state
  state.global = normalizeLayer(input.global)
  const sessions = input.sessions && typeof input.sessions === 'object' ? input.sessions : {}
  for (const [sessionId, layer] of Object.entries(sessions)) {
    if (typeof sessionId !== 'string' || !sessionId) continue
    const normalized = normalizeLayer(layer)
    if (normalized.default || Object.keys(normalized.presets).length > 0) {
      state.sessions[sessionId] = normalized
    }
  }
  return state
}

/** This conversation's override, else the profile-wide default. */
function resolveRoute(state, sessionId) {
  const session = sessionId ? state.sessions[sessionId] : undefined
  return session?.default || state.global.default || null
}

export function apply(ctx) {
  let cache = null
  let cacheMtime = 0
  let writing = Promise.resolve()
  let catalog = null
  let catalogAt = 0

  async function loadState() {
    let mtime = 0
    try {
      mtime = (await stat(dataFile())).mtimeMs
    } catch {
      mtime = 0
    }
    if (cache && mtime === cacheMtime) return cache
    try {
      const raw = JSON.parse(await readFile(dataFile(), 'utf8'))
      cache = normalizeState(raw)
    } catch {
      cache = normalizeState(null)
    }
    cacheMtime = mtime
    return cache
  }

  function saveState(next) {
    cache = next
    writing = writing
      .then(async () => {
        const file = dataFile()
        const tmp = `${file}.${process.pid}.tmp`
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
        await rename(tmp, file)
        cacheMtime = (await stat(file)).mtimeMs
      })
      .catch((error) => {
        ctx.logger?.warn?.(`[subagent-models] could not persist routes: ${error?.message ?? error}`)
      })
    return writing
  }

  async function mutate(mutation) {
    const current = await loadState()
    const next = normalizeState(JSON.parse(JSON.stringify(current)))
    const scope = mutation?.scope === 'session' ? 'session' : 'global'
    const route = normalizeRoute(mutation?.route)

    if (scope === 'session') {
      const sessionId = typeof mutation?.sessionId === 'string' ? mutation.sessionId : ''
      if (!sessionId) throw new Error('sessionId is required for a conversation override')
      if (route) next.sessions[sessionId] = { default: route, presets: {} }
      else delete next.sessions[sessionId]
    } else {
      next.global.default = route
    }

    await saveState(normalizeState(next))
    return cache
  }

  async function buildCatalog() {
    const now = Date.now()
    if (catalog && now - catalogAt < CATALOG_TTL_MS) return catalog
    const llm = ctx.get('llm')
    if (!llm) return []
    const routes = []
    let providers = []
    try {
      providers = llm.listProviders()
    } catch {
      providers = []
    }
    for (const provider of providers) {
      let models = []
      try {
        models = await llm.listModels(provider.id)
      } catch {
        continue
      }
      for (const model of models.slice(0, 60)) {
        let efforts = []
        let defaultEffort = null
        try {
          const info = await llm.resolveModelInfo(provider.id, model.id)
          const reasoning = info?.reasoning
          if (reasoning && Array.isArray(reasoning.efforts)) {
            efforts = reasoning.efforts.map((effort) => ({ id: effort.id, name: effort.name ?? effort.id }))
            defaultEffort = reasoning.defaultEffort ?? null
          }
        } catch {
          /* models without capability lookup stay selectable without efforts */
        }
        routes.push({
          provider: provider.id,
          providerName: provider.name ?? provider.id,
          model: model.id,
          name: model.name ?? model.id,
          efforts,
          defaultEffort,
        })
      }
    }
    catalog = routes
    catalogAt = now
    return routes
  }

  /**
   * The conversation a delegated child belongs to. A parent can itself be a
   * subagent (delegation nests), so walk `parentSession` up until a session
   * with `origin !== 'subagent'` is reached; that session's override is the
   * one that applies. Bounded and cycle-safe; when the sessions service cannot
   * answer, the last id reached is the best available guess.
   */
  function conversationRoot(startId) {
    let current = startId
    const seen = new Set()
    for (let depth = 0; depth < 16; depth += 1) {
      if (!current || seen.has(current)) break
      seen.add(current)
      let session
      try {
        session = ctx.get('sessions')?.get?.(current)
      } catch {
        return current
      }
      if (!session || session.header?.origin !== 'subagent') return current
      current = session.header.parentSession
    }
    return current || startId
  }

  /** A route wins only while its provider and model are still advertised. */
  async function isAdvertised(route) {
    const llm = ctx.get('llm')
    if (!llm) return false
    let providers = []
    try {
      providers = llm.listProviders()
    } catch {
      providers = []
    }
    if (!providers.some((provider) => provider?.id === route.provider)) return false
    const models = await llm.listModels(route.provider)
    return models.some((model) => model?.id === route.model)
  }

  /**
   * Route a delegated child before its first step. `agent/created` is emitted
   * (and awaited, it is serial) after the child is constructed and before the
   * step reads its selection, so `agent.model.select()` here is the supported
   * way to fix the child's route. Top-level Sessions are never touched, and no
   * failure escapes into agent creation: a stale route degrades to no routing.
   */
  ctx.on('agent/created', async ({ agent }) => {
    try {
      const header = agent?.session?.header
      if (header?.origin !== 'subagent' || !header.parentSession) return
      const state = await loadState()
      const route = resolveRoute(state, conversationRoot(header.parentSession))
      if (!route) return
      if (!(await isAdvertised(route))) {
        ctx.logger?.warn?.(`[subagent-models] route ${route.provider}/${route.model} is not advertised by any mounted provider; delegating without an override`)
        return
      }
      if (typeof agent.model?.select !== 'function') return
      agent.model.select({
        provider: route.provider,
        model: route.model,
        ...(route.effort ? { reasoningEffort: route.effort } : {}),
      })
    } catch (error) {
      ctx.logger?.warn?.(`[subagent-models] could not route a subagent; delegating without an override: ${error?.message ?? error}`)
    }
  })

  function view(state, sessionId) {
    return {
      ok: true,
      version: STATE_VERSION,
      global: state.global,
      session: sessionId ? state.sessions[sessionId] ?? null : null,
      sessionId: sessionId ?? null,
    }
  }

  async function handleHttp(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== ROUTE_PREFIX && !url.pathname.startsWith(`${ROUTE_PREFIX}/`)) {
      return sendJson(res, 404, { ok: false, error: 'not found' })
    }
    const action = url.pathname.slice(ROUTE_PREFIX.length).replace(/^\/+|\/+$/g, '') || 'state'
    try {
      if (req.method === 'GET' && action === 'state') {
        const state = await loadState()
        const sessionId = url.searchParams.get('sessionId') || null
        return sendJson(res, 200, { ...view(state, sessionId), models: await buildCatalog() })
      }
      if (req.method === 'POST' && action === 'route') {
        const body = await readJson(req)
        const next = await mutate(body)
        return sendJson(res, 200, {
          ...view(next, typeof body?.sessionId === 'string' ? body.sessionId : null),
          models: await buildCatalog(),
        })
      }
      if (req.method === 'POST' && action === 'hello') {
        // The Web UI announces itself once per module load: the settings page and
        // the composer chip cannot be exercised without a browser, so this is the
        // one place a maintainer can see that the page reached the Host face.
        const body = await readJson(req)
        const file = path.join(path.dirname(dataFile()), 'subagent-models.client.json')
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, `${JSON.stringify({ at: new Date().toISOString(), ...body }, null, 2)}\n`, 'utf8')
        return sendJson(res, 200, { ok: true })
      }
      return sendJson(res, 404, { ok: false, error: `unknown action: ${action}` })
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error?.message ?? String(error) })
    }
  }

  ctx.inject(['webServer'], (scope) => {
    scope.effect(() => scope.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: handleHttp }))
  })

  ctx.on('llm/adapters-updated', () => {
    catalog = null
    catalogAt = 0
  })
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1_000_000) throw new Error('payload too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}
