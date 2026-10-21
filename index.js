/**
 * Subagent routing: choose the provider/model/reasoning effort delegated
 * children run with — per profile (global) or per conversation.
 *
 * WHY `agent/request` AND NOT A PROVIDER OR THE TOOL ROW
 * -----------------------------------------------------
 * The delegation tool (`subagent`) is composed in the AGENT-PLANE preset
 * (`~/.dsh/.agent-presets/<name>/agent.cordis.yml`), not in the Host profile
 * patch, and it already carries a static `agentOptions` pin. A plugin can
 * neither edit that composition nor affect it from the profile layer, so the
 * route is applied one level lower: `agent/request` is the documented waterfall
 * for "replace the frozen call configuration" of one agent, and it runs for a
 * child on every admitted request.
 *
 * The listener is registered once, globally, and ignores top-level Sessions:
 * only an Agent that some other live Agent owns (a delegated child) is
 * rewritten. Route precedence for the child of conversation S (preset P):
 *
 *   S.presets[P] -> S.default -> global.presets[P] -> global.default -> none
 *
 * `none` leaves the child with whatever its composition created it with.
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

function pickRoute(layer, presetId) {
  if (!layer) return null
  if (presetId && layer.presets && layer.presets[presetId]) return layer.presets[presetId]
  return layer.default || null
}

function resolveRoute(state, sessionId, presetId) {
  const session = sessionId ? state.sessions[sessionId] : undefined
  return pickRoute(session, presetId) || pickRoute(state.global, presetId) || null
}

/** A route wins only when its model is still advertised by a mounted provider. */
function routeApplies(route) {
  const base = {
    provider: route.provider,
    model: route.model,
    ...(route.effort ? { reasoningEffort: route.effort } : {}),
  }
  return base
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
      cache = normalizeState(JSON.parse(await readFile(dataFile(), 'utf8')))
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
    const next = JSON.parse(JSON.stringify(current))
    next.sessions = next.sessions ?? {}
    const scope = mutation?.scope === 'session' ? 'session' : 'global'
    const presetId = typeof mutation?.presetId === 'string' && mutation.presetId ? mutation.presetId : null
    const route = normalizeRoute(mutation?.route)

    let layer
    if (scope === 'session') {
      const sessionId = typeof mutation?.sessionId === 'string' ? mutation.sessionId : ''
      if (!sessionId) throw new Error('sessionId is required for a conversation override')
      layer = next.sessions[sessionId] ?? (next.sessions[sessionId] = EMPTY_LAYER())
    } else {
      layer = next.global
    }

    if (presetId) {
      if (route) layer.presets[presetId] = route
      else delete layer.presets[presetId]
    } else {
      layer.default = route
    }

    if (scope === 'session') {
      const stored = next.sessions[mutation.sessionId]
      if (stored && !stored.default && Object.keys(stored.presets).length === 0) delete next.sessions[mutation.sessionId]
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
   * Live owners of a delegated child, conversation roots first. A child of a
   * child is owned by both its delegating parent and (transitively) the
   * conversation root; the root decides which conversation this is, so it is
   * asked first and a deeper owner only answers when the root has no route.
   */
  function ownersOf(agent) {
    const agents = ctx.get('agents')
    if (!agents) return []
    let roots = []
    let live = []
    try {
      roots = agents.roots()
      live = agents.list()
    } catch {
      return []
    }
    const rootIds = new Set(roots.map((root) => root.id))
    const ordered = [...roots, ...live.filter((entry) => !rootIds.has(entry.id))]
    const owners = []
    for (const other of ordered) {
      if (!other || other.id === agent.id) continue
      try {
        if (agents.isOwnedBy(agent.id, other)) owners.push(other)
      } catch {
        /* an agent leaving the registry is not an owner */
      }
    }
    return owners
  }

  async function routeFor(agent) {
    if (!agent?.id) return null
    const owners = ownersOf(agent)
    if (owners.length === 0) return null
    const state = await loadState()
    for (const owner of owners) {
      const route = resolveRoute(state, owner.id, undefined)
      if (route) return route
    }
    return null
  }

  ctx.on('agent/request', async (payload, next) => {
    const config = await next()
    try {
      const route = await routeFor(payload?.agent)
      if (!route) return config
      const overridden = routeApplies(route)
      return { ...config, ...overridden, ...(route.effort ? { reasoningEffort: route.effort } : { reasoningEffort: undefined }) }
    } catch {
      return config
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
