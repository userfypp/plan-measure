import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dependencies = ["react", "react-dom", "react-konva", "@types/react", "@types/react-dom"];

const defaultLockfilePath = fileURLToPath(new URL("../../package-lock.json", import.meta.url));
const lockfilePath = process.argv[2] ? resolve(process.argv[2]) : defaultLockfilePath;

const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function fail(message) {
  throw new Error(`React stack validation failed: ${message}`);
}

function parseVersion(dependency, value) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${dependency}: found ${JSON.stringify(value)}; expected a non-empty semantic version.`);
  }

  const match = semverPattern.exec(value);
  if (!match) {
    fail(
      `${dependency}: found ${JSON.stringify(value)}; expected an unambiguous semantic version such as 19.3.0.`,
    );
  }

  return {
    raw: value,
    major: match[1],
    minor: match[2],
  };
}

function getResolvedVersions(lockfile) {
  if (
    lockfile === null ||
    typeof lockfile !== "object" ||
    Array.isArray(lockfile) ||
    lockfile.packages === null ||
    typeof lockfile.packages !== "object" ||
    Array.isArray(lockfile.packages)
  ) {
    fail(
      'lockfile structure: expected an object with a "packages" object containing resolved node_modules entries.',
    );
  }

  return Object.fromEntries(
    dependencies.map((dependency) => {
      const packagePath = `node_modules/${dependency}`;
      const entry = lockfile.packages[packagePath];

      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        fail(
          `${dependency}: found no resolved package entry; expected "${packagePath}" in package-lock.json.`,
        );
      }

      return [dependency, parseVersion(dependency, entry.version)];
    }),
  );
}

function expectExact(dependency, actual, expectedDependency, expected) {
  if (actual.raw !== expected.raw) {
    fail(
      `${dependency}: found ${actual.raw}; expected exactly ${expected.raw} to match ${expectedDependency}.`,
    );
  }
}

function expectMajorMinor(dependency, actual, react) {
  if (actual.major !== react.major || actual.minor !== react.minor) {
    fail(
      `${dependency}: found ${actual.raw}; expected major.minor ${react.major}.${react.minor}.x to match react ${react.raw}.`,
    );
  }
}

async function main() {
  if (process.argv.length > 3) {
    fail("arguments: expected at most one optional package-lock.json path.");
  }

  let lockfile;
  try {
    lockfile = JSON.parse(await readFile(lockfilePath, "utf8"));
  } catch (error) {
    fail(
      `package-lock.json: could not read or parse ${lockfilePath}; expected valid JSON (${error.message}).`,
    );
  }

  const versions = getResolvedVersions(lockfile);
  const react = versions.react;

  expectExact("react-dom", versions["react-dom"], "react", react);
  expectMajorMinor("react-konva", versions["react-konva"], react);
  expectMajorMinor("@types/react", versions["@types/react"], react);
  expectMajorMinor("@types/react-dom", versions["@types/react-dom"], react);

  console.log(
    `React stack aligned: ${dependencies
      .map((dependency) => `${dependency}@${versions[dependency].raw}`)
      .join(", ")}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
