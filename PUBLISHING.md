# Publishing / 发布与收录

Two independent steps: put the package somewhere installable (npm and/or this repo), then ask the
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) catalog to list it.

## 1. npm

```bash
npm login                 # one time, needs an npm account with 2FA ready
npm publish               # from the repository root; publishes dsh-subagent-models
```

Bump `version` in `package.json` for every release. To publish an already-built tarball:

```bash
npm publish dsh-subagent-models-0.1.0.tgz
```

`npm pack --dry-run` lists exactly the shipped files (9 files, ~14 kB): `index.js`, `client.js`,
`cordis.patch.yml`, `locale/*.json`, `icon.svg`, `LICENSE`, `README.md`, `package.json`.

## 2. Catalog listing (the DSH plugin market)

The market reads a curated registry; entries are one YAML file each. Open a PR against
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) that adds:

```
data/plugins/Garybot126__dsh-subagent-models.yml
```

The exact content is in [`market/Garybot126__dsh-subagent-models.yml`](market/Garybot126__dsh-subagent-models.yml)
(copy it verbatim). One-click new file:

<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/new/main/data/plugins/Garybot126__dsh-subagent-models.yml>

An entry may declare **only** `url`, `name`, `category`, `description`, `icon`, `tarball` — their CI
rejects unknown fields ("unknown field \"screenshots\""), and the npm package is resolved
automatically from the repository rather than declared. Screenshots for the market card come from
the images embedded in this README (`docs/screenshots/…`).

Prerequisites, checked by their CI:

- [ ] `package.json` declares `dsh.bundle` — done here (`"bundle": { "patch": "./cordis.patch.yml" }`).
- [ ] The repository is **at least 1 day old**.
- [ ] The repository carries the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic
      (Settings → Topics, or `/<repo>/settings` → Topics).
- [ ] The description is accurate — the reviewer checks it against the code.

Their site and the market pick the entry up automatically after the PR merges (usually within a
day); `dsh-market` and the built-in Discover tab then search it.

## 3. What users run

```bash
# npm
dsh plugin --profile <profile> add dsh-subagent-models
# GitHub, before or instead of npm
dsh plugin --profile <profile> add github:Garybot126/dsh-subagent-models
```

## Release checklist

1. `node --check index.js && node --check client.js`
2. `npm pack --dry-run` → 9 files, no stray paths
3. Bump `version`, commit, `git push`
4. `npm publish`
5. First release only: PR the catalog entry
