import test from "node:test";
import assert from "node:assert/strict";
import { publishRelease, releaseMetadata, collectSources } from "./publish-release.mjs";
import { githubApi, pages, workflowContext } from "./github-api.mjs";
import { planDeployment } from "./plan-pages-deployment.mjs";

const repository = "userfypp/plan-measure";
const root = `/repos/${repository}`;
const sha = "a".repeat(40);
const sourceSha = "b".repeat(40);
const context = { repository, sha, runId: "123", attempt: "1" };
const pending = "autorelease: pending";
const tagged = "autorelease: tagged";
const clone = (value) => structuredClone(value);
const pr = {
  number: 42,
  title: "chore(main): release 3.0.0",
  merged_at: "2026-01-01T00:00:00Z",
  merge_commit_sha: sha,
  base: { ref: "main", repo: { full_name: repository } },
  head: {
    ref: "release-please--branches--main--components--plan-measure",
    repo: { full_name: repository },
  },
  labels: [{ name: pending }, { name: "unrelated" }],
};
const metadata = {
  manifest: { ".": "3.0.0" },
  pkg: { version: "3.0.0" },
  lock: { version: "3.0.0", packages: { "": { version: "3.0.0" } } },
  changelog: `## [3.0.0]\n\n### Added\n\n* export PDF ([bbbbbbb](https://github.com/${repository}/commit/${sourceSha}))\n`,
};

function fixture() {
  const state = {
    pr: clone(pr),
    labels: clone(pr.labels),
    release: null,
    tagSha: null,
    latest: null,
    calls: [],
    mutations: 0,
    failAt: null,
    failAfter: false,
  };
  const api = async (path, options = {}) => {
    const method = options.method ?? "GET";
    state.calls.push({ path, ...clone(options), method });
    const write = method !== "GET";
    if (write) state.mutations += 1;
    if (write && state.mutations === state.failAt && !state.failAfter)
      throw new Error("Injected failure before mutation");
    let result;
    if (path === `${root}/commits/${sha}/pulls?per_page=100&page=1`)
      result = state.pr ? [{ ...state.pr, labels: state.labels }] : [];
    else if (path === `${root}/commits/${sourceSha}/pulls?per_page=100&page=1`)
      result = [
        {
          ...pr,
          number: 40,
          merge_commit_sha: sourceSha,
          body: "## Summary\n- Add PDF export with visible measurements.\n\n## Related Issue\n- Closes #12",
        },
      ];
    else if (path === `${root}/releases?per_page=100&page=1`)
      result = state.release ? [state.release] : [];
    else if (path === `${root}/git/ref/tags/v3.0.0`) {
      assert.equal(method, "GET");
      if (!state.tagSha && !options.optional) throw new Error("Missing tag");
      result = state.tagSha ? { object: { type: "commit", sha: state.tagSha } } : null;
    } else if (path === `${root}/commits/v3.0.0`) result = { sha: state.tagSha };
    else if (path === `${root}/releases/latest`) result = state.latest;
    else if (path === `${root}/git/refs` && method === "POST") {
      assert.equal(state.tagSha, null, "must not recreate a tag");
      assert.deepEqual(options.body, { ref: "refs/tags/v3.0.0", sha });
      state.tagSha = options.body.sha;
      result = { object: { type: "commit", sha: state.tagSha } };
    } else if (path === `${root}/releases` && method === "POST") {
      assert.equal(state.release, null, "must not duplicate releases");
      assert.equal(options.body.draft, true, "creation must start as draft");
      state.release = { id: 99, ...options.body };
      result = state.release;
    } else if (path === `${root}/releases/99`) {
      if (method === "PATCH") {
        assert.equal(state.release.draft, true, "published notes must never be patched");
        state.release = { ...state.release, ...options.body };
      }
      result = state.release;
    } else if (path === `${root}/issues/42/labels?per_page=100&page=1`) result = state.labels;
    else if (path === `${root}/issues/42/labels` && method === "POST") {
      for (const label of options.body.labels)
        if (!state.labels.some(({ name }) => name === label)) state.labels.push({ name: label });
      result = state.labels;
    } else if (
      path === `${root}/issues/42/labels/${encodeURIComponent(pending)}` &&
      method === "DELETE"
    ) {
      state.labels = state.labels.filter(({ name }) => name !== pending);
      result = state.labels;
    } else throw new Error(`Unexpected API request: ${method} ${path}`);
    if (write && state.mutations === state.failAt && state.failAfter)
      throw new Error("Injected lost response after mutation");
    return clone(result);
  };
  const run = () => publishRelease(api, context, async () => clone(metadata));
  return { state, api, run };
}

function assertPublished(state) {
  assert.equal(state.tagSha, sha);
  assert.equal(state.release.draft, false);
  assert.equal(state.release.target_commitish, sha);
  assert.equal(state.release.name, "Plan Measure v3.0.0");
  assert.match(state.release.body, /Added PDF export with visible measurements/);
  assert.match(state.release.body, /\/pull\/40/);
  assert.match(state.release.body, /\/issues\/12/);
  assert.match(state.release.body, /actions\/runs\/123\/attempts\/1/);
  assert.deepEqual(state.labels.map(({ name }) => name).sort(), [tagged, "unrelated"].sort());
}

test("publishes only the deployed commit with complete notes, then updates labels", async () => {
  const { run, state } = fixture();
  assert.deepEqual(await run(), { status: "published", tag: "v3.0.0" });
  assertPublished(state);
  const before = clone(state.release);
  const mutations = state.mutations;
  assert.equal((await run()).status, "already-published");
  assert.deepEqual(state.release, before);
  assert.equal(state.mutations, mutations, "a completed retry must be read-only");
});

test("every mutation boundary recovers, including a lost successful response", async () => {
  for (const failAfter of [false, true]) {
    // tag creation, draft creation, publication, tagged label, pending removal
    for (let failAt = 1; failAt <= 5; failAt += 1) {
      const { run, state } = fixture();
      Object.assign(state, { failAt, failAfter });
      await assert.rejects(run, /Injected/);
      state.failAt = null;
      await run();
      assertPublished(state);
      const writes = state.mutations;
      await run();
      assert.equal(state.mutations, writes);
    }
  }
});

test("never changes a conflicting tag or draft, or repairs a missing published release", async () => {
  for (const setup of [
    (state) => {
      state.tagSha = sourceSha;
    },
    (state) => {
      state.labels = [{ name: tagged }];
    },
    (state) => {
      state.labels = [{ name: tagged }, { name: pending }];
    },
    (state) => {
      state.labels = [{ name: "unrelated" }];
    },
    (state) => {
      state.release = { id: 99, tag_name: "v3.0.0", draft: true, target_commitish: sourceSha };
    },
  ]) {
    const { run, state } = fixture();
    setup(state);
    await assert.rejects(run);
    assert.equal(state.mutations, 0);
  }
});

test("a release cannot be inferred from a branch name, open PR, fork or different merge SHA", async () => {
  for (const alter of [
    (value) => {
      value.merge_commit_sha = sourceSha;
    },
    (value) => {
      value.merged_at = null;
    },
    (value) => {
      value.head.repo.full_name = "someone/fork";
    },
    (value) => {
      value.head.ref = "feature";
    },
    (value) => {
      value.base.ref = "other";
    },
  ]) {
    const { run, state } = fixture();
    alter(state.pr);
    assert.equal((await run()).status, "skipped");
    assert.equal(state.mutations, 0);
  }
});

test("old release recovery never downgrades Latest", async () => {
  for (const [version, expected] of [
    ["v2.99.0", "true"],
    ["v3.0.1", "false"],
    ["v12.0.0", "false"],
  ]) {
    const { run, state } = fixture();
    state.latest = { tag_name: version };
    await run();
    assert.equal(state.release.make_latest, expected);
  }
});

test("publishes a documentation-only release with documentation notes", async () => {
  const { api, state } = fixture();
  const data = clone(metadata);
  data.changelog = "## [3.0.0]\n\n### Documentation\n\n* document PDF export options\n";
  assert.deepEqual(await publishRelease(api, context, async () => data), {
    status: "published",
    tag: "v3.0.0",
  });
  assert.equal(state.release.draft, false);
  assert.match(state.release.body, /^## Documentation\n\n- Document PDF export options\./);
  assert.doesNotMatch(state.release.body, /## What's new|## Improvements and fixes/);
  assert.deepEqual(state.labels.map(({ name }) => name).sort(), [tagged, "unrelated"].sort());
});

test("manifest, lockfile and title inconsistencies fail before publishing", () => {
  for (const alter of [
    (data) => {
      data.pkg.version = "2.0.0";
    },
    (data) => {
      data.lock.packages[""].version = "2.0.0";
    },
    (data) => {
      data.lock.version = "2.0.0";
    },
    (data) => {
      data.manifest["."] = "3.0.0-beta.1";
    },
  ]) {
    const data = clone(metadata);
    alter(data);
    assert.throws(() => releaseMetadata(data, pr));
  }
  assert.throws(() => releaseMetadata(metadata, { ...pr, title: "chore(main): release 2.0.0" }));
});

test("source discovery rejects an associated PR whose merge commit differs", async () => {
  const sources = await collectSources(
    async () => [{ ...pr, body: "## Summary\n- Wrong change" }],
    repository,
    [{ commit: { sha: sourceSha, repository } }],
  );
  assert.equal(sources.get(sourceSha), null);
});

test("GitHub API treats only explicit optional 404 as absence and never retries writes", async () => {
  for (const status of [401, 403, 429, 500, 503]) {
    let calls = 0;
    const api = githubApi("test-token", async () => {
      calls += 1;
      return new Response("", { status });
    });
    await assert.rejects(
      () => api(`${root}/releases`, { optional: true, method: "POST", body: { name: "safe" } }),
      new RegExp(`HTTP ${status}`),
    );
    assert.equal(calls, 1);
  }
  const api = githubApi("test-token", async (_, options) => {
    assert.equal(options.headers["X-GitHub-Api-Version"], "2022-11-28");
    return new Response("", { status: 404 });
  });
  assert.equal(await api(`${root}/releases`, { optional: true }), null);
  await assert.rejects(() => api(`${root}/releases`), /HTTP 404/);
});

test("pagination includes later pages and workflow context rejects untrusted events", async () => {
  const items = [];
  for await (const item of pages(
    async (path) => (path.endsWith("page=1") ? Array.from({ length: 100 }, (_, i) => i) : [100]),
    `${root}/releases`,
  ))
    items.push(item);
  assert.equal(items.length, 101);
  const env = {
    GITHUB_REPOSITORY: repository,
    GITHUB_SHA: sha,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "push",
  };
  assert.deepEqual(workflowContext(env), { repository, sha });
  for (const patch of [
    { GITHUB_REF: "refs/heads/feature" },
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_SHA: "main" },
    { GITHUB_REPOSITORY: "../bad" },
  ])
    assert.throws(() => workflowContext({ ...env, ...patch }));
});

function deploymentApi(deployments, comparisons = {}) {
  return async (path) => {
    if (path.includes("/deployments?")) return deployments;
    const status = path.match(/\/deployments\/(\d+)\/statuses/);
    if (status)
      return [{ state: deployments.find(({ id }) => id === Number(status[1])).state ?? "success" }];
    if (path.includes("/compare/"))
      return { status: comparisons[path.split("...")[1]] ?? "behind" };
    throw new Error(`Unexpected deployment request ${path}`);
  };
}
const deployment = (id, commit, extra = {}) => ({ id, sha: commit, ref: "main", ...extra });

test("Pages progresses normally but old reruns cannot roll back a newer deployment", async () => {
  assert.equal(await planDeployment(deploymentApi([]), context), true);
  assert.equal(await planDeployment(deploymentApi([deployment(1, sourceSha)]), context), true);
  assert.equal(
    await planDeployment(
      deploymentApi([deployment(2, sourceSha), deployment(1, sha)], { [sourceSha]: "ahead" }),
      context,
    ),
    false,
  );
  await assert.rejects(
    () =>
      planDeployment(deploymentApi([deployment(2, sourceSha)], { [sourceSha]: "ahead" }), context),
    /never deployed/,
  );
  await assert.rejects(
    () =>
      planDeployment(
        deploymentApi([deployment(2, sourceSha)], { [sourceSha]: "diverged" }),
        context,
      ),
    /diverges/,
  );
  assert.equal(
    await planDeployment(
      deploymentApi([deployment(2, sourceSha, { state: "failure" })], { [sourceSha]: "ahead" }),
      context,
    ),
    true,
  );
});

test("annotated tags are peeled by object SHA, never by an ambiguous branch/tag name", async () => {
  const { state, api } = fixture();
  state.tagSha = sha;
  const tagObject = "c".repeat(40);
  const run = (target) =>
    publishRelease(
      async (path, options = {}) => {
        if (path === `${root}/git/ref/tags/v3.0.0`)
          return { object: { type: "tag", sha: tagObject } };
        if (path === `${root}/git/tags/${tagObject}`)
          return { object: { type: "commit", sha: target } };
        assert.notEqual(path, `${root}/commits/v3.0.0`);
        return api(path, options);
      },
      context,
      async () => clone(metadata),
    );
  await assert.rejects(() => run(sourceSha), /does not point/);
  assert.equal(state.mutations, 0);
  await run(sha);
  assertPublished(state);
});

test("API enrichment failures stop before creating a tag or draft", async () => {
  const { state, api } = fixture();
  await assert.rejects(
    () =>
      publishRelease(
        (path, options) => {
          if (path.includes(`/commits/${sourceSha}/pulls`)) throw new Error("Rate limited");
          return api(path, options);
        },
        context,
        async () => clone(metadata),
      ),
    /Rate limited/,
  );
  assert.equal(state.mutations, 0);
});

test("an existing draft can recover after losing the response to its update", async () => {
  const { state, run } = fixture();
  state.tagSha = sha;
  state.release = {
    id: 99,
    tag_name: "v3.0.0",
    target_commitish: sha,
    draft: true,
    prerelease: false,
    name: "unfinished",
    body: "unfinished",
  };
  state.failAt = 1;
  state.failAfter = true;
  await assert.rejects(run, /Injected/);
  state.failAt = null;
  await run();
  assertPublished(state);
});
