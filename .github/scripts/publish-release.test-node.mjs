import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { publishRelease, releaseMetadata, collectSources } from "./publish-release.mjs";
import { githubApi, pages, workflowContext } from "./github-api.mjs";
import { planDeployment } from "./plan-pages-deployment.mjs";
import { recoverRelease, recoveryContext } from "./recover-release.mjs";

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

test("API diagnostics include bounded safe messages and request IDs, not raw responses", async () => {
  let calls = 0;
  const api = githubApi("private-token", async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        message: "Permission denied\nBearer private-token " + "x".repeat(500),
        secret: "never-print-this",
      }),
      { status: 403, headers: { "x-github-request-id": "AB12:CD34" } },
    );
  });
  await assert.rejects(
    () => api(`${root}/issues/42/labels`, { method: "POST", body: { labels: [tagged] } }),
    (error) => {
      assert.match(error.message, /HTTP 403 — Permission denied Bearer \[redacted\]/);
      assert.match(error.message, /request ID: AB12:CD34/);
      assert.doesNotMatch(error.message, /private-token|never-print-this|\n/);
      assert.ok(error.message.length < 450);
      return true;
    },
  );
  assert.equal(calls, 1);
  const invalid = githubApi(
    "private-token",
    async () =>
      new Response("<html>secret</html>", {
        status: 503,
        headers: { "x-github-request-id": "EF56" },
      }),
  );
  await assert.rejects(
    () => invalid(`${root}/releases`),
    /^Error: GitHub GET .*HTTP 503 \(request ID: EF56\)$/,
  );
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

test("publication grants PR-label write access in both caller and reusable workflow", async () => {
  const ci = await readFile(new URL("../workflows/ci.yml", import.meta.url), "utf8");
  const publication = await readFile(
    new URL("../workflows/publish-release.yml", import.meta.url),
    "utf8",
  );
  const caller = ci.split("  publish-release:\n")[1]?.split("  release-please:\n")[0];
  assert.ok(caller, "CI must call the publication workflow");
  assert.match(caller, /permissions:\n(?:      [^\n]+\n)*      pull-requests: write\n/);
  assert.match(publication, /permissions:\n(?:  [^\n]+\n)*  pull-requests: write\n/);
  assert.match(publication, /GH_TOKEN: \$\{\{ github\.token \}\}/);
});

test("a label permission failure recovers without rewriting an already published release", async () => {
  const { state, api, run } = fixture();
  await run();
  const published = clone(state.release);
  state.labels = [{ name: pending }, { name: "unrelated" }];
  state.calls = [];
  await assert.rejects(
    () =>
      publishRelease(
        (path, options = {}) => {
          if (path === `${root}/issues/42/labels` && options.method === "POST")
            throw new Error("GitHub POST labels: HTTP 403");
          return api(path, options);
        },
        context,
        async () => clone(metadata),
      ),
    /HTTP 403/,
  );
  assert.deepEqual(state.release, published);
  assert.equal((await run()).status, "already-published");
  assert.deepEqual(state.release, published);
  assert.deepEqual(
    state.calls.filter(({ method }) => method !== "GET").map(({ path }) => path),
    [`${root}/issues/42/labels`, `${root}/issues/42/labels/${encodeURIComponent(pending)}`],
  );
});

function recoveryFixture() {
  const base = fixture();
  const run = {
    path: ".github/workflows/ci.yml",
    event: "push",
    head_branch: "main",
    status: "completed",
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    head_sha: sha,
    run_attempt: 1,
  };
  const job = (name, extra = {}) => ({
    name,
    head_sha: sha,
    status: "completed",
    conclusion: "success",
    ...extra,
  });
  const attempts = new Map([[1, [job("verify"), job("pages / deploy")]]]);
  const api = (path, options) => {
    if (path === `${root}/actions/runs/123`) return clone(run);
    const jobs = path.match(
      /\/actions\/runs\/123\/attempts\/(\d+)\/jobs\?per_page=100&page=(\d+)$/,
    );
    if (jobs) {
      const items = attempts.get(Number(jobs[1])) ?? [];
      const offset = (Number(jobs[2]) - 1) * 100;
      return { total_count: items.length, jobs: clone(items.slice(offset, offset + 100)) };
    }
    return base.api(path, options);
  };
  let metadataReads = 0;
  return {
    ...base,
    originalRun: run,
    attempts,
    job,
    reads: () => metadataReads,
    recover: () =>
      recoverRelease(api, { repository, runId: "123" }, async (target) => {
        assert.equal(target, sha, "metadata must come from the original CI SHA");
        metadataReads += 1;
        return clone(metadata);
      }),
  };
}

test("manual recovery publishes the original validated SHA and preserves published releases", async () => {
  const { recover, state } = recoveryFixture();
  assert.equal((await recover()).status, "published");
  assertPublished(state);
  const published = clone(state.release);
  state.labels = [{ name: pending }, { name: "unrelated" }];
  assert.equal((await recover()).status, "already-published");
  assertPublished(state);
  assert.deepEqual(state.release, published);
  const writes = state.mutations;
  await recover();
  assert.equal(state.mutations, writes);
});

test("recovery accepts successful jobs across retries but never skipped or wrong-SHA evidence", async () => {
  const { recover, originalRun, attempts, job, state } = recoveryFixture();
  originalRun.run_attempt = 3;
  attempts.set(1, [job("verify"), job("pages / deploy", { conclusion: "failure" })]);
  attempts.set(2, [job("pages / deploy")]);
  attempts.set(3, [job("pages / deploy", { conclusion: "skipped" })]);
  await recover();
  assert.match(state.release.body, /actions\/runs\/123\/attempts\/2/);
  for (const jobs of [
    [job("verify")],
    [job("verify"), job("pages / deploy", { conclusion: "skipped" })],
    [job("verify", { conclusion: "failure" }), job("pages / deploy")],
    [job("verify"), job("pages / deploy", { head_sha: sourceSha })],
    [job("verify", { head_sha: sourceSha }), job("pages / deploy")],
    [job("verify"), job("pages / deploy"), job("pages / deploy")],
  ]) {
    const candidate = recoveryFixture();
    candidate.attempts.set(1, jobs);
    await assert.rejects(candidate.recover, /did not successfully validate and deploy/);
    assert.equal(candidate.state.mutations, 0);
    assert.equal(candidate.reads(), 0);
  }
});

test("recovery reads the Actions jobs envelope and paginates validation evidence", async () => {
  const { recover, attempts, job, state } = recoveryFixture();
  attempts.set(1, [
    ...Array.from({ length: 100 }, (_, index) => job(`other-${index}`)),
    job("verify"),
    job("pages / deploy"),
  ]);
  await recover();
  assertPublished(state);
});

test("recovery rejects unrelated runs and non-release commits before writing", async () => {
  for (const patch of [
    { path: ".github/workflows/other.yml" },
    { event: "pull_request" },
    { head_branch: "feature" },
    { status: "in_progress" },
    { repository: { full_name: "other/repo" } },
    { head_repository: { full_name: "other/fork" } },
    { head_sha: "main" },
    { run_attempt: 0 },
    { run_attempt: "1" },
  ]) {
    const candidate = recoveryFixture();
    Object.assign(candidate.originalRun, patch);
    await assert.rejects(candidate.recover, /completed main CI run/);
    assert.equal(candidate.state.mutations, 0);
    assert.equal(candidate.reads(), 0);
  }
  const candidate = recoveryFixture();
  candidate.state.pr = null;
  await assert.rejects(candidate.recover, /not a merged Release Please PR/);
  assert.equal(candidate.state.mutations, 0);
});

test("recovery context accepts only a manual main dispatch with a numeric original run ID", () => {
  const env = {
    GITHUB_REPOSITORY: repository,
    GITHUB_SHA: sourceSha,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    RECOVERY_RUN_ID: "123",
  };
  assert.deepEqual(recoveryContext(env), { repository, sha: sourceSha, runId: "123" });
  for (const patch of [
    { GITHUB_EVENT_NAME: "push" },
    { GITHUB_REF: "refs/heads/feature" },
    { RECOVERY_RUN_ID: "" },
    { RECOVERY_RUN_ID: "123; echo bad" },
    { GITHUB_SHA: "main" },
  ])
    assert.throws(() => recoveryContext({ ...env, ...patch }));
});

test("recovery workflow uses current code, original run input, and serialized publication", async () => {
  const workflow = await readFile(
    new URL("../workflows/recover-release.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /group: release-please-main/);
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /RECOVERY_RUN_ID: \$\{\{ inputs.run_id \}\}/);
  assert.match(workflow, /needs: recover/);
  assert.match(workflow, /uses: .\/.github\/workflows\/release-please.yml/);
});
