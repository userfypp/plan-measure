import test from "node:test";
import assert from "node:assert/strict";
import {
  bumpLabel,
  nextVersion,
  parseChoice,
  resolveReleaseAs,
  saveChoice,
  savedBump,
} from "./release-bump.mjs";

const repository = "userfypp/plan-measure";
const root = `/repos/${repository}`;
const branch = "release-please--branches--main--components--plan-measure";
const pullsPath = `${root}/pulls?state=open&base=main&head=${encodeURIComponent(`userfypp:${branch}`)}&per_page=100&page=1`;
const releasePr = (labels) => ({
  number: 7,
  base: { ref: "main", repo: { full_name: repository } },
  head: { ref: branch, repo: { full_name: repository } },
  labels: labels.map((name) => ({ name })),
});

function fixture({ labels = ["autorelease: pending"], open = true, version = "2.10.0" } = {}) {
  const state = { labels: [...labels], repoLabels: new Set(), calls: [] };
  const api = async (path, { method = "GET", body, optional = false } = {}) => {
    state.calls.push({ method, path, body });
    if (path === pullsPath) return open ? [releasePr(state.labels)] : [];
    if (path === `${root}/contents/.release-please-manifest.json?ref=main`) {
      const content = Buffer.from(JSON.stringify({ ".": version })).toString("base64");
      return { encoding: "base64", content };
    }
    if (path.startsWith(`${root}/labels/`) && method === "GET") {
      const name = decodeURIComponent(path.slice(`${root}/labels/`.length));
      if (state.repoLabels.has(name)) return { name };
      if (optional) return null;
      throw new Error("missing label");
    }
    if (path === `${root}/labels` && method === "POST") {
      state.repoLabels.add(body.name);
      return { name: body.name };
    }
    if (path === `${root}/issues/7/labels` && method === "POST") {
      state.labels.push(...body.labels);
      return state.labels.map((name) => ({ name }));
    }
    if (path === `${root}/issues/7/labels?per_page=100&page=1`) {
      return state.labels.map((name) => ({ name }));
    }
    if (path.startsWith(`${root}/issues/7/labels/`) && method === "DELETE") {
      const name = decodeURIComponent(path.slice(`${root}/issues/7/labels/`.length));
      state.labels = state.labels.filter((label) => label !== name);
      return state.labels.map((name) => ({ name }));
    }
    throw new Error(`Unexpected ${method} ${path}`);
  };
  return { api, state };
}

test("computes the next version for each manual bump", () => {
  assert.equal(nextVersion("2.10.3", "patch"), "2.10.4");
  assert.equal(nextVersion("2.10.3", "minor"), "2.11.0");
  assert.equal(nextVersion("2.10.3", "major"), "3.0.0");
  assert.throws(() => nextVersion("2.10.3-beta.1", "major"), /stable X\.Y\.Z/);
  assert.throws(() => nextVersion("2.10.3", "auto"), /Unknown version bump/);
});

test("accepts only the documented choices and defaults to keeping the saved one", () => {
  assert.equal(parseChoice(""), "keep");
  assert.equal(parseChoice(undefined), "keep");
  assert.equal(parseChoice(" major "), "major");
  assert.throws(() => parseChoice("premajor"), /keep, auto, patch, minor, major/);
});

test("reads one saved bump and rejects conflicting labels", () => {
  assert.equal(savedBump([{ name: "autorelease: pending" }]), null);
  assert.equal(savedBump([{ name: bumpLabel("minor") }]), "minor");
  assert.throws(
    () => savedBump([{ name: bumpLabel("minor") }, { name: bumpLabel("major") }]),
    /conflicting version labels/,
  );
});

test("an explicit choice overrides Conventional Commits from the manifest on main", async () => {
  const { api } = fixture({ version: "2.10.0" });
  assert.deepEqual(await resolveReleaseAs(api, repository, "major"), {
    bump: "major",
    releaseAs: "3.0.0",
  });
  assert.deepEqual(await resolveReleaseAs(api, repository, "minor"), {
    bump: "minor",
    releaseAs: "2.11.0",
  });
  assert.deepEqual(await resolveReleaseAs(api, repository, "auto"), {
    bump: null,
    releaseAs: null,
  });
});

test("keep reuses the bump saved on the open release PR, or follows the commits", async () => {
  assert.deepEqual(
    await resolveReleaseAs(fixture({ labels: [bumpLabel("major")] }).api, repository, "keep"),
    { bump: "major", releaseAs: "3.0.0" },
  );
  assert.deepEqual(await resolveReleaseAs(fixture().api, repository, "keep"), {
    bump: null,
    releaseAs: null,
  });
  assert.deepEqual(await resolveReleaseAs(fixture({ open: false }).api, repository, "keep"), {
    bump: null,
    releaseAs: null,
  });
});

test("saving a bump creates its label once and replaces any other saved bump", async () => {
  const { api, state } = fixture({ labels: ["autorelease: pending", bumpLabel("minor")] });
  assert.deepEqual(await saveChoice(api, repository, "major"), { saved: true, pr: 7 });
  assert.deepEqual(state.labels, ["autorelease: pending", bumpLabel("major")]);
  assert.ok(state.repoLabels.has(bumpLabel("major")));
  const created = state.calls.filter((call) => call.path === `${root}/labels`);
  assert.equal(created.length, 1);
});

test("auto clears the saved bump and keep changes nothing", async () => {
  const cleared = fixture({ labels: ["autorelease: pending", bumpLabel("major")] });
  assert.deepEqual(await saveChoice(cleared.api, repository, "auto"), { saved: true, pr: 7 });
  assert.deepEqual(cleared.state.labels, ["autorelease: pending"]);

  const kept = fixture({ labels: [bumpLabel("major")] });
  assert.deepEqual(await saveChoice(kept.api, repository, "keep"), { saved: false, pr: null });
  assert.equal(kept.state.calls.length, 0);
});

test("without an open release PR nothing is saved", async () => {
  const { api, state } = fixture({ open: false });
  assert.deepEqual(await saveChoice(api, repository, "major"), { saved: false, pr: null });
  assert.ok(state.calls.every((call) => call.method === "GET"));
});
