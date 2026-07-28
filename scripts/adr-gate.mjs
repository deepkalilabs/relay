#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const VERSION = 1;
const ADR_PATTERN = /^docs\/decisions\/(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: options.binary ? undefined : "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

  if (options.allowFailure) return result;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    throw new Error(detail || `git ${args.join(" ")} failed`);
  }
  return options.binary ? result.stdout : result.stdout.trim();
}

function repoRoot() {
  return git(["rev-parse", "--show-toplevel"]);
}

function stateRoot() {
  return git([
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "adr-gate",
  ]);
}

function headOrNull() {
  const result = git(["rev-parse", "--verify", "HEAD"], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseNameStatus(buffer) {
  const fields = buffer.toString("utf8").split("\0");
  const entries = [];
  for (let index = 0; index < fields.length - 1; index += 2) {
    entries.push({ status: fields[index], path: fields[index + 1] });
  }
  return entries;
}

function stagedState() {
  const names = git(
    ["diff", "--cached", "--name-status", "--no-renames", "-z", "--"],
    { binary: true },
  );
  const empty = names.length === 0;
  const baseHead = headOrNull();
  const diff = git(
    ["diff", "--cached", "--binary", "--no-ext-diff", "--no-renames", "--"],
    { binary: true },
  );
  return {
    baseHead,
    stagedTree: empty
      ? baseHead
        ? git(["rev-parse", `${baseHead}^{tree}`])
        : "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
      : git(["write-tree"]),
    diffSha256: sha256(diff),
    entries: parseNameStatus(names),
    empty,
  };
}

function atomicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, path);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function reviewPath() {
  return join(stateRoot(), "current-review.json");
}

function pendingPath() {
  return join(stateRoot(), "pending-commit.json");
}

function auditPath(commit) {
  return join(stateRoot(), "audits", `${commit}.json`);
}

function normalizeRepoPath(input) {
  const root = repoRoot();
  const absolute = resolve(root, input);
  const normalized = relative(root, absolute).split(sep).join("/");
  if (
    normalized === "" ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(`Path must be inside the repository: ${input}`);
  }
  return normalized;
}

function assertAcceptedAdrsUnchanged(state) {
  const changed = state.entries.filter(
    (entry) =>
      entry.path.startsWith("docs/decisions/") && entry.status !== "A",
  );
  if (changed.length > 0) {
    throw new Error(
      `Accepted ADRs are immutable; supersede them with a new ADR instead: ${changed
        .map((entry) => entry.path)
        .join(", ")}`,
    );
  }
}

function trackedAdrNumbers() {
  if (!headOrNull()) return [];
  const output = git([
    "ls-tree",
    "-r",
    "--name-only",
    "HEAD",
    "--",
    "docs/decisions",
  ]);
  if (!output) return [];
  return output
    .split("\n")
    .map((path) => ADR_PATTERN.exec(path))
    .filter(Boolean)
    .map((match) => Number(match[1]));
}

function validateAdrPaths(paths, state) {
  if (paths.length === 0) throw new Error("At least one --adr path is required.");
  const unique = [...new Set(paths.map(normalizeRepoPath))];
  if (unique.length !== paths.length) throw new Error("Duplicate --adr path.");

  const added = new Map(
    state.entries
      .filter((entry) => entry.status === "A")
      .map((entry) => [entry.path, entry]),
  );
  const numbered = unique.map((path) => {
    const match = ADR_PATTERN.exec(path);
    if (!match) {
      throw new Error(
        `ADR path must match docs/decisions/000N-lowercase-slug.md: ${path}`,
      );
    }
    if (!added.has(path)) throw new Error(`ADR is not newly staged: ${path}`);
    return { path, number: Number(match[1]) };
  });

  const existing = trackedAdrNumbers();
  const expectedStart = existing.length === 0 ? 1 : Math.max(...existing) + 1;
  const actual = numbered.map(({ number }) => number).sort((a, b) => a - b);
  actual.forEach((number, index) => {
    if (number !== expectedStart + index) {
      throw new Error(
        `ADR numbering must be contiguous from ${String(expectedStart).padStart(4, "0")}.`,
      );
    }
  });
  return numbered.map(({ path }) => path);
}

function exactCommit(input) {
  const commit = git(["rev-parse", "--verify", `${input}^{commit}`]);
  return commit;
}

function validateRemediations(commits, adrPaths) {
  const unique = [...new Set(commits.map(exactCommit))];
  for (const commit of unique) {
    const audit = readJson(auditPath(commit));
    if (!audit || audit.status !== "manual-review-required") {
      throw new Error(`Commit does not have an unresolved bypass audit: ${commit}`);
    }
    const referenced = adrPaths.some((path) =>
      git(["show", `:${path}`]).includes(commit),
    );
    if (!referenced) {
      throw new Error(
        `A staged ADR must reference the full bypassed commit SHA: ${commit}`,
      );
    }
  }
  return unique;
}

function parseOptions(args) {
  const parsed = {
    none: false,
    reason: null,
    adr: [],
    remediates: [],
    commit: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--none") parsed.none = true;
    else if (flag === "--reason") parsed.reason = args[++index];
    else if (flag === "--adr") parsed.adr.push(args[++index]);
    else if (flag === "--remediates") parsed.remediates.push(args[++index]);
    else if (flag === "--commit") parsed.commit = args[++index];
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!parsed.reason?.trim()) throw new Error("--reason must be non-empty.");
  if (
    parsed.adr.includes(undefined) ||
    parsed.remediates.includes(undefined) ||
    parsed.commit === undefined
  ) {
    throw new Error("Missing argument value.");
  }
  return parsed;
}

function review(args) {
  const options = parseOptions(args);
  if (options.none === (options.adr.length > 0)) {
    throw new Error("Choose exactly one outcome: --none or one or more --adr.");
  }
  if (options.none && options.remediates.length > 0) {
    throw new Error("--remediates requires an ADR outcome.");
  }

  const state = stagedState();
  if (state.empty && !options.none) {
    throw new Error("An ADR review requires newly staged ADR files.");
  }
  assertAcceptedAdrsUnchanged(state);
  const adrPaths = options.none ? [] : validateAdrPaths(options.adr, state);
  const remediates =
    options.remediates.length === 0
      ? []
      : validateRemediations(options.remediates, adrPaths);

  const marker = {
    version: VERSION,
    outcome: options.none ? "none" : "adr",
    reason: options.reason.trim(),
    adrPaths,
    remediates,
    baseHead: state.baseHead,
    stagedTree: state.stagedTree,
    diffSha256: state.diffSha256,
    reviewedAt: new Date().toISOString(),
  };
  atomicJson(reviewPath(), marker);
  console.log(
    `ADR review recorded (${marker.outcome}) for staged diff ${marker.diffSha256.slice(0, 12)}.`,
  );
}

function validatedReview() {
  const marker = readJson(reviewPath());
  if (!marker || marker.version !== VERSION) {
    throw new Error(
      'No ADR review exists. Run "npm run adr:review -- --none --reason \\"...\\"" or review staged ADRs.',
    );
  }
  const state = stagedState();
  assertAcceptedAdrsUnchanged(state);
  if (
    marker.baseHead !== state.baseHead ||
    marker.stagedTree !== state.stagedTree ||
    marker.diffSha256 !== state.diffSha256
  ) {
    throw new Error(
      "The ADR review is stale because HEAD or staged content changed. Review the staged diff again.",
    );
  }
  if (marker.outcome === "adr") {
    validateAdrPaths(marker.adrPaths, state);
    validateRemediations(marker.remediates ?? [], marker.adrPaths);
  } else if (marker.outcome !== "none") {
    throw new Error("The ADR review has an invalid outcome.");
  }
  return { marker, state };
}

function preCommit() {
  const { marker, state } = validatedReview();
  atomicJson(pendingPath(), {
    version: VERSION,
    marker,
    expectedParent: state.baseHead,
    expectedTree: state.stagedTree,
    gitProcessId: process.ppid,
    preparedAt: new Date().toISOString(),
  });
}

function commitInfo(commit = "HEAD") {
  const resolved = exactCommit(commit);
  const line = git(["rev-list", "--parents", "-n", "1", resolved]).split(" ");
  return {
    commit: resolved,
    parent: line[1] ?? null,
    tree: git(["rev-parse", `${resolved}^{tree}`]),
  };
}

function unresolvedAudits() {
  const directory = join(stateRoot(), "audits");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson(join(directory, name)))
    .filter((audit) => audit?.status === "manual-review-required");
}

function postCommit() {
  const info = commitInfo();
  const pending = readJson(pendingPath());
  let parentMatches = pending?.expectedParent === info.parent;
  if (!parentMatches && pending?.expectedParent) {
    const previous = commitInfo(pending.expectedParent);
    parentMatches = previous.parent === info.parent;
  }
  const valid =
    pending?.version === VERSION &&
    pending.gitProcessId === process.ppid &&
    parentMatches &&
    pending.expectedTree === info.tree;

  if (valid) {
    const audit = {
      version: VERSION,
      status: "reviewed",
      commit: info.commit,
      outcome: pending.marker.outcome,
      reason: pending.marker.reason,
      adrPaths: pending.marker.adrPaths,
      remediates: pending.marker.remediates ?? [],
      stagedDiffSha256: pending.marker.diffSha256,
      reviewedAt: pending.marker.reviewedAt,
      committedAt: new Date().toISOString(),
    };
    atomicJson(auditPath(info.commit), audit);

    for (const remediatedCommit of audit.remediates) {
      const oldAudit = readJson(auditPath(remediatedCommit));
      if (oldAudit?.status === "manual-review-required") {
        atomicJson(auditPath(remediatedCommit), {
          ...oldAudit,
          status: "remediated",
          remediationCommit: info.commit,
          remediatedAt: new Date().toISOString(),
        });
      }
    }
  } else {
    atomicJson(auditPath(info.commit), {
      version: VERSION,
      status: "manual-review-required",
      commit: info.commit,
      detectedAt: new Date().toISOString(),
      reason: "Commit did not pass the repository ADR pre-commit review gate.",
    });
    console.error(
      `ADR gate: commit ${info.commit.slice(0, 12)} requires manual review. ` +
        "Run npm run adr:audit for a routine commit, or add a reviewed follow-up ADR.",
    );
  }

  rmSync(pendingPath(), { force: true });
  rmSync(reviewPath(), { force: true });
}

function audit(args) {
  const options = parseOptions(args);
  if (!options.commit || !options.none || options.adr.length > 0) {
    throw new Error("Use --commit <sha> --none --reason \"...\".");
  }
  const commit = exactCommit(options.commit);
  const existing = readJson(auditPath(commit));
  if (!existing || existing.status !== "manual-review-required") {
    throw new Error(`Commit does not have an unresolved bypass audit: ${commit}`);
  }
  atomicJson(auditPath(commit), {
    ...existing,
    status: "reviewed",
    outcome: "none",
    reason: options.reason.trim(),
    reviewedAt: new Date().toISOString(),
  });
  console.log(`Bypass audit resolved as no ADR required: ${commit}`);
}

function shellTokens(command) {
  const tokens = [];
  let token = "";
  let quote = null;
  let escaped = false;
  const flush = () => {
    if (token) tokens.push(token);
    token = "";
  };

  for (const character of command) {
    if (escaped) {
      token += character;
      escaped = false;
    } else if (character === "\\" && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = null;
      else token += character;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      flush();
      if (character === "\n") tokens.push(";");
    } else if (";&|()".includes(character)) {
      flush();
      tokens.push(character);
    } else {
      token += character;
    }
  }
  flush();
  return tokens;
}

function gitInvocations(tokens) {
  const invocations = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] !== "git") continue;
    let cursor = index + 1;
    while (cursor < tokens.length) {
      const value = tokens[cursor];
      if (["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(value)) {
        cursor += 2;
      } else if (value.startsWith("-")) {
        cursor += 1;
      } else {
        break;
      }
    }
    if (tokens[cursor] && !";&|()".includes(tokens[cursor])) {
      const end = tokens.findIndex(
        (value, tokenIndex) =>
          tokenIndex > cursor && ";&|()".includes(value),
      );
      invocations.push({
        subcommand: tokens[cursor],
        args: tokens.slice(cursor + 1, end === -1 ? tokens.length : end),
      });
    }
  }
  return invocations;
}

function validateCommitArgs(args) {
  const banned = new Set([
    "-a",
    "--all",
    "-i",
    "--include",
    "-n",
    "--no-verify",
    "-o",
    "--only",
    "--pathspec-from-file",
    "--pathspec-file-nul",
  ]);
  const valueOptions = new Set([
    "-C",
    "-F",
    "-c",
    "-m",
    "--author",
    "--cleanup",
    "--date",
    "--file",
    "--fixup",
    "--gpg-sign",
    "--message",
    "--reedit-message",
    "--reuse-message",
    "--squash",
    "--trailer",
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const flag = argument.includes("=") ? argument.split("=")[0] : argument;
    if (banned.has(flag)) {
      throw new Error(`Codex commit form is forbidden by ADR policy: ${flag}`);
    }
    if (argument === "--") {
      throw new Error("Partial/pathspec commits are forbidden by ADR policy.");
    }
    if (
      /^-[A-Za-z]+$/.test(argument) &&
      [...argument.slice(1)].some((letter) => ["a", "i", "n", "o"].includes(letter))
    ) {
      throw new Error(`Codex commit form is forbidden by ADR policy: ${argument}`);
    }
    if (valueOptions.has(argument)) {
      if (args[++index] === undefined) {
        throw new Error(`Missing value for git commit option: ${argument}`);
      }
      continue;
    }
    if (argument.startsWith("-")) continue;
    throw new Error(
      `Partial/pathspec commits are forbidden by ADR policy: ${argument}`,
    );
  }
}

function deny(reason) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
}

function readHookInput() {
  const text = readFileSync(0, "utf8");
  return text ? JSON.parse(text) : {};
}

function codexPreTool() {
  const input = readHookInput();
  const command = input.tool_input?.command ?? input.tool_input?.cmd;
  if (typeof command !== "string") return;

  const invocations = gitInvocations(shellTokens(command));
  const commits = invocations.filter(({ subcommand }) => subcommand === "commit");
  if (commits.length === 0) return;

  try {
    const stagingCommands = new Set([
      "add",
      "apply",
      "mv",
      "read-tree",
      "reset",
      "restore",
      "rm",
      "update-index",
    ]);
    if (invocations.some(({ subcommand }) => stagingCommands.has(subcommand))) {
      throw new Error(
        "Stage changes and record the ADR review before invoking git commit in a separate command.",
      );
    }
    commits.forEach(({ args }) => validateCommitArgs(args));
    validatedReview();
  } catch (error) {
    deny(
      `${error.message} Inspect the exact staged diff, add and stage any required ADRs, ` +
        'or record a justified no-ADR result with "npm run adr:review -- --none --reason \\"...\\"". ' +
        "Do not commit unless the user explicitly authorized it.",
    );
  }
}

function codexStop() {
  const input = readHookInput();
  if (input.stop_hook_active) {
    process.stdout.write("{}\n");
    return;
  }

  const unresolved = unresolvedAudits();
  let reason = null;
  if (unresolved.length > 0) {
    const commits = unresolved
      .slice(0, 5)
      .map((audit) => audit.commit.slice(0, 12))
      .join(", ");
    reason =
      `ADR remediation is required for bypassed commit(s): ${commits}. ` +
      "Inspect each commit. Resolve routine commits with npm run adr:audit; " +
      "for architectural decisions, stage a follow-up ADR that references the full commit SHA " +
      "and review it with --remediates. Do not create a commit unless the user authorized it.";
  } else {
    const state = stagedState();
    if (!state.empty) {
      try {
        validatedReview();
      } catch (error) {
        reason =
          `${error.message} Inspect the staged diff now. Stage one new ADR per independently ` +
          "reversible architectural decision, or record a justified --none review. " +
          "Do not create a commit unless the user authorized it.";
      }
    }
  }

  process.stdout.write(
    `${JSON.stringify(reason ? { decision: "block", reason } : {})}\n`,
  );
}

function install() {
  const root = repoRoot();
  git(["config", "--local", "core.hooksPath", ".githooks"], { cwd: root });
  for (const name of ["pre-commit", "post-commit"]) {
    chmodSync(join(root, ".githooks", name), 0o755);
  }
  console.log("Installed repository Git hooks via core.hooksPath=.githooks");
}

function usage() {
  throw new Error(
    "Usage: adr-gate.mjs <install|review|audit|pre-commit|post-commit|codex-pre-tool|codex-stop>",
  );
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === "install") install();
  else if (command === "review") review(args);
  else if (command === "audit") audit(args);
  else if (command === "pre-commit") preCommit();
  else if (command === "post-commit") postCommit();
  else if (command === "codex-pre-tool") codexPreTool();
  else if (command === "codex-stop") codexStop();
  else usage();
} catch (error) {
  console.error(`ADR gate: ${error.message}`);
  process.exitCode = 1;
}
