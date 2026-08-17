import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";
import { NO_START_CAPABILITIES, assertPositiveFinite, resolveChildCwd, settleRunResult, subprocessRunHandle } from "@deepseek-ai/dsh-subagent";
import { randomUUID } from "node:crypto";
import { SessionId } from "@deepseek-ai/dsh-session";
import { JsonRpcLineTransport } from "@deepseek-ai/dsh-sdk-protocol";
//#region lib/types/wire.js
/**
* Minimal Codex app-server 0.147.0 protocol adapter. The shared JSON-RPC
* transport owns framing and request correlation; this module owns only the
* product methods, current thread/turn association, unattended approval
* responses, and terminal-answer selection.
*
* @module @deepseek-ai/dsh-subagent-codex/wire
*/
function object(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`subagent-codex: app-server returned invalid ${label}`);
	return value;
}
function string(value, label) {
	if (typeof value !== "string" || value.length === 0) throw new Error(`subagent-codex: app-server returned invalid ${label}`);
	return value;
}
function unattendedDecision(params) {
	const available = params.availableDecisions;
	if (available === void 0 || available === null) return "decline";
	if (Array.isArray(available)) {
		if (available.includes("cancel")) return "cancel";
		if (available.includes("decline")) return "decline";
	}
	throw new Error("subagent-codex: app-server offered no unattended approval decision");
}
function isContextWindowExceeded(turn) {
	if (turn.status !== "failed") return false;
	const error = turn.error;
	return error !== null && typeof error === "object" && !Array.isArray(error) && error.codexErrorInfo === "contextWindowExceeded";
}
function thrown$1(value) {
	/* v8 ignore next -- typed protocol and stream failures reject with Error. */
	return value instanceof Error ? value : new Error(String(value));
}
function abortError(signal) {
	return signal.reason instanceof Error ? signal.reason : /* @__PURE__ */ new Error(`subagent-codex: app-server request aborted: ${String(signal.reason)}`);
}
async function raceAbort(pending, signal) {
	if (signal.aborted) {
		pending.catch(() => {});
		throw abortError(signal);
	}
	let rejectAbort;
	const aborted = new Promise((_resolve, reject) => {
		rejectAbort = reject;
	});
	const onAbort = () => {
		rejectAbort(abortError(signal));
	};
	signal.addEventListener("abort", onAbort, { once: true });
	try {
		return await Promise.race([pending, aborted]);
	} finally {
		signal.removeEventListener("abort", onAbort);
	}
}
/**
* One app-server connection and its single ephemeral thread/turn.
*
* The class deliberately exposes no generic request surface. Supporting
* another product method must first become part of the provider contract.
*/
var CodexAppServerWire = class {
	input;
	transport;
	fatal = Promise.withResolvers();
	threadId;
	turnId;
	pendingTurnId;
	turnCompleted;
	earlyTurnNotifications = [];
	lastFinalAnswer;
	lastUnphasedAnswer;
	closed = false;
	constructor(input, output) {
		this.input = input;
		this.transport = new JsonRpcLineTransport(input, output);
		this.fatal.promise.catch(() => {});
		this.transport.onRequest((method, params) => this.handleServerRequest(method, params));
		this.transport.onNotification((method, params) => {
			try {
				this.handleNotification(method, params);
			} catch (error) {
				this.fail(thrown$1(error));
			}
		});
		this.input.on("error", this.onInputError);
		this.input.on("end", this.onInputEnd);
		output.on("error", this.onOutputError);
	}
	/** Start reading app-server frames. */
	start() {
		this.transport.start();
	}
	/**
	* Perform the required app-server initialize/initialized handshake.
	* @param signal - unpublished-start cancellation.
	*/
	async initialize(signal) {
		object(await this.guarded(this.transport.request("initialize", {
			clientInfo: {
				name: "deepseek-harness",
				title: "DeepSeek Harness",
				version: "0.0.1"
			},
			capabilities: {
				experimentalApi: false,
				requestAttestation: false
			}
		}, signal), signal), "initialize response");
		this.transport.notify("initialized");
		await this.guarded(this.transport.flush(), signal);
	}
	/**
	* Create the run's private ephemeral thread and retain its identity.
	* @param cwd - parent Session workspace.
	* @param signal - unpublished-start cancellation.
	*/
	async startThread(cwd, signal, model) {
		const thread = object(object(await this.guarded(this.transport.request("thread/start", {
			model,
			cwd,
			ephemeral: true
		}, signal), signal), "thread/start response").thread, "thread/start thread");
		const id = string(thread.id, "thread/start thread id");
		if (thread.ephemeral !== true) throw new Error("subagent-codex: app-server did not create an ephemeral thread");
		this.threadId = id;
	}
	/**
	* Submit the one text-only task and wait for this thread/turn's authoritative
	* terminal notification.
	* @param texts - already validated task text blocks.
	* @param signal - local cancellation for the published run.
	* @returns the shared subagent result.
	*/
	async runTurn(inputs, signal) {
		const completion = Promise.withResolvers();
		this.turnCompleted = completion;
		const threadId = this.threadId;
		const turn = object(object(await this.guarded(this.transport.request("turn/start", {
			threadId,
			input: inputs
		}, signal), signal), "turn/start response").turn, "turn/start turn");
		this.commitTurnId(string(turn.id, "turn/start turn id"));
		const terminal = object((await this.guarded(completion.promise, signal)).turn, "turn/completed turn");
		const status = terminal.status;
		if (isContextWindowExceeded(terminal)) return {
			output: this.collectOutput(),
			stopReason: "max-tokens"
		};
		if (status !== "completed") {
			const detail = status === "failed" ? `: ${JSON.stringify(terminal.error)}` : "";
			throw new Error(`subagent-codex: Codex turn ended with status ${String(status)}${detail}`);
		}
		const output = this.collectOutput();
		if (output.length === 0) throw new Error("subagent-codex: Codex completed without a final answer");
		return {
			output,
			stopReason: "completed"
		};
	}
	/**
	* Best-effort remote cancellation. Local settlement and process teardown
	* remain authoritative when the child no longer accepts protocol requests.
	*/
	interrupt() {
		if (this.threadId === void 0 || this.turnId === void 0 || this.closed) return;
		this.transport.request("turn/interrupt", {
			threadId: this.threadId,
			turnId: this.turnId
		}).catch(() => {});
	}
	/**
	* The best non-commentary answer observed so far, preserving exact bytes.
	* @returns the selected final or nullable-phase text block, if any.
	*/
	collectOutput() {
		const selected = this.lastFinalAnswer ?? this.lastUnphasedAnswer;
		return selected !== void 0 && selected.trim().length > 0 ? [{
			type: "text",
			text: selected
		}] : [];
	}
	/** Detach JSON-RPC listeners and reject outstanding requests. Idempotent. */
	close() {
		if (this.closed) return;
		this.closed = true;
		this.input.off("end", this.onInputEnd);
		this.transport.close();
	}
	async guarded(pending, signal) {
		return raceAbort(Promise.race([this.fatal.promise, pending]), signal);
	}
	fail(error) {
		this.fatal.reject(error);
	}
	onInputError = (error) => {
		this.fail(error);
	};
	onOutputError = (error) => {
		this.fail(error);
	};
	onInputEnd = () => {
		this.fail(/* @__PURE__ */ new Error("subagent-codex: app-server protocol stream closed"));
	};
	observePendingTurnId(id) {
		if (this.turnCompleted === void 0) throw new Error("subagent-codex: app-server referenced a turn before turn/start");
		if (this.pendingTurnId !== void 0 && this.pendingTurnId !== id) throw new Error("subagent-codex: app-server referenced conflicting turns");
		this.pendingTurnId = id;
	}
	commitTurnId(id) {
		if (this.pendingTurnId !== void 0 && this.pendingTurnId !== id) throw new Error("subagent-codex: turn/start response did not match the active turn");
		this.turnId = id;
		const notifications = this.earlyTurnNotifications.splice(0);
		for (const notification of notifications) this.handleNotification(notification.method, notification.params);
	}
	validateRunIds(params, nullableTurn = false) {
		if (params.threadId !== this.threadId) throw new Error("subagent-codex: app-server request referenced another thread");
		if (nullableTurn && params.turnId === null) return;
		const id = string(params.turnId, "server request turn id");
		if (this.turnId === void 0) {
			this.observePendingTurnId(id);
			return;
		}
		if (id !== this.turnId) throw new Error("subagent-codex: app-server request referenced another turn");
	}
	handleServerRequest(method, params) {
		try {
			switch (method) {
				case "item/commandExecution/requestApproval":
				case "item/fileChange/requestApproval":
					this.validateRunIds(params);
					return Promise.resolve({ decision: unattendedDecision(params) });
				case "item/permissions/requestApproval":
					this.validateRunIds(params);
					return Promise.resolve({
						permissions: {},
						scope: "turn"
					});
				case "item/tool/requestUserInput":
					this.validateRunIds(params);
					return Promise.resolve({ answers: {} });
				case "mcpServer/elicitation/request":
					this.validateRunIds(params, true);
					return Promise.resolve({
						action: "decline",
						content: null,
						_meta: null
					});
				default: throw new Error(`subagent-codex: unsupported app-server request ${JSON.stringify(method)}`);
			}
		} catch (error) {
			const normalized = thrown$1(error);
			this.fail(normalized);
			return Promise.reject(normalized);
		}
	}
	handleNotification(method, params) {
		if (method === "turn/started") {
			if (string(params.threadId, "turn/started thread id") !== this.threadId) return;
			const turn = object(params.turn, "turn/started turn");
			if (this.turnCompleted !== void 0 && this.turnId === void 0) this.observePendingTurnId(string(turn.id, "turn/started turn id"));
			return;
		}
		if (method === "item/completed") {
			if (string(params.threadId, "item/completed thread id") !== this.threadId) return;
			const id = string(params.turnId, "item/completed turn id");
			if (this.turnId === void 0) {
				if (this.turnCompleted !== void 0) {
					this.observePendingTurnId(id);
					this.earlyTurnNotifications.push({
						method,
						params
					});
				}
				return;
			}
			if (id !== this.turnId) return;
			const item = object(params.item, "item/completed item");
			if (item.type !== "agentMessage") return;
			const text = typeof item.text === "string" ? item.text : (() => {
				throw new Error("subagent-codex: app-server returned an invalid agent message");
			})();
			if (item.phase === "final_answer") this.lastFinalAnswer = text;
			else if (item.phase === null) this.lastUnphasedAnswer = text;
			else if (item.phase !== "commentary") throw new Error(`subagent-codex: app-server returned an unknown agent message phase ${JSON.stringify(item.phase)}`);
			return;
		}
		if (method !== "turn/completed") return;
		if (string(params.threadId, "turn/completed thread id") !== this.threadId) return;
		const turn = object(params.turn, "turn/completed turn");
		const id = string(turn.id, "turn/completed turn id");
		const turnCompleted = this.turnCompleted;
		if (turnCompleted === void 0) return;
		if (this.turnId === void 0) {
			this.observePendingTurnId(id);
			this.earlyTurnNotifications.push({
				method,
				params
			});
			return;
		}
		if (id !== this.turnId) return;
		if (![
			"completed",
			"interrupted",
			"failed"
		].includes(String(turn.status))) throw new Error(`subagent-codex: app-server returned invalid terminal turn status ${String(turn.status)}`);
		turnCompleted.resolve(params);
	}
};
//#endregion
//#region lib/types/run.js
/**
* One-shot Codex child lifecycle: spawn the real app-server through the
* subprocess seam, publish only after initialization and ephemeral thread
* creation, flatten post-publication failures, and dispose to whole-tree
* quiescence.
*
* @module @deepseek-ai/dsh-subagent-codex/run
*/
/** Default POSIX grace between subprocess termination tiers. */
const DEFAULT_DISPOSE_GRACE_MS = 3e3;
/**
* Resolve the fixed app-server command for a platform.
*
* Windows npm and pnpm installs expose `codex.cmd`, which requires `cmd.exe`;
* the argv is constant so no task or configuration text enters the
* shell boundary.
* @param platform - host platform used to select the executable boundary.
* @returns argv for the fixed Codex app-server command.
*/
function resolveDeepSeeCodexExecutable() {
	const dshHome = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || homedir(), ".dsh");
	const registryPath = process.env.OPENDS_MODEL_REGISTRY_FILE || join(dshHome, "deepsee", ".opends-models.json");
	try {
		const registry = JSON.parse(readFileSync(registryPath, "utf8"));
		const route = Array.isArray(registry.routes) ? registry.routes.find((item) => item?.id === "cli:codex") : undefined;
		const executable = typeof route?.executable === "string" ? route.executable : "";
		const name = basename(executable).toLowerCase();
		if (route?.status === "ready" && route?.enabled !== false && isAbsolute(executable) && existsSync(executable) && ["codex", "codex.exe", "codex.cmd"].includes(name)) return executable;
	} catch {}
	return "codex";
}
function codexAppServerArgv(platform = process.platform) {
	const command = resolveDeepSeeCodexExecutable();
	if (platform !== "win32" || (isAbsolute(command) && command.toLowerCase().endsWith(".exe"))) return [command, "app-server", "--stdio"];
	return ["cmd.exe", "/d", "/s", "/c", command, "app-server", "--stdio"];
}
function thrown(value) {
	/* v8 ignore next -- typed subprocess/wire failures reject with Error. */
	return value instanceof Error ? value : new Error(String(value));
}
/**
* Validate and preserve the one-shot task before crossing the process boundary.
* @param prompt - task content accepted from the shared subagent service.
* @returns the exact non-empty text block sequence.
*/
async function taskInput(prompt, readImage, signal) {
	if (prompt.length === 0) throw new Error("subagent-codex: the one-shot task must not be empty");
	const inputs = [];
	for (const block of prompt) {
		if (block.type === "text") {
			inputs.push({ type: "text", text: block.text, text_elements: [] });
			continue;
		}
		if (block.type === "image") {
			const stored = await readImage(block.attachment, signal);
			inputs.push({ type: "image", url: `data:${stored.ref.mediaType};base64,${Buffer.from(stored.data).toString("base64")}` });
			continue;
		}
		throw new Error(`subagent-codex: unsupported one-shot task block ${block.type}`);
	}
	if (!inputs.some((input) => input.type === "image" || input.text.trim().length > 0)) throw new Error("subagent-codex: the one-shot task must not be empty");
	return inputs;
}
/**
* Close the private wire, terminate the managed process tree, and wait for the
* subprocess owner to prove it is gone.
* @param wire - private app-server protocol connection.
* @param child - shared-service handle that owns the process tree.
*/
async function disposeCodexChild(wire, child) {
	wire.close();
	if (child.pid <= 0) {
		await child.done.catch(() => {});
		return;
	}
	try {
		child.stdin?.end();
	} catch {}
	child.terminate();
	await child.waitForExit();
	await child.done;
}
/**
* Start the real `codex app-server --stdio` child and publish its one-shot run.
* @param request - resolved shared subagent request.
* @param spec - Workspace, environment, process service, and diagnostic policy.
* @returns the published run after initialization and ephemeral thread creation.
*/
async function startCodexRun(request, spec) {
	const inputs = await taskInput(request.prompt, spec.readImage, request.signal);
	if (request.signal.aborted) throw new Error("subagent-codex: request was aborted before app-server startup");
	const child = spec.spawn({
		argv: codexAppServerArgv(),
		cwd: spec.cwd,
		stdio: {
			stdin: "pipe",
			stdout: "pipe",
			stderr: "inherit"
		},
		graceMs: spec.disposeGraceMs,
		env: spec.env
	});
	const wire = new CodexAppServerWire(child.stdout, child.stdin);
	const disposeProcess = () => disposeCodexChild(wire, child);
	const processFailure = child.done.then((outcome) => Promise.reject(/* @__PURE__ */ new Error(`subagent-codex: app-server exited before the run settled (code ${String(outcome.exitCode)}, signal ${String(outcome.signal)})`)), (error) => Promise.reject(thrown(error)));
	processFailure.catch(() => {});
	const runAbort = new AbortController();
	const requestCancel = () => {
		if (runAbort.signal.aborted) return;
		runAbort.abort(/* @__PURE__ */ new Error("subagent-codex: run cancelled locally"));
		wire.interrupt();
	};
	const onAbort = () => {
		requestCancel();
	};
	request.signal.addEventListener("abort", onAbort, { once: true });
	try {
		wire.start();
		await Promise.race([wire.initialize(request.signal), processFailure]);
		await Promise.race([wire.startThread(spec.cwd, request.signal, spec.model), processFailure]);
	} catch (error) {
		request.signal.removeEventListener("abort", onAbort);
		try {
			await disposeProcess();
		} catch (disposeError) {
			throw new AggregateError([thrown(error), thrown(disposeError)], "subagent-codex: startup failed and app-server cleanup also failed");
		}
		if (runAbort.signal.aborted) throw new Error("subagent-codex: request was aborted before run publication");
		throw thrown(error);
	}
	const collectOutput = () => wire.collectOutput();
	const result = settleRunResult({
		attempt: () => Promise.race([wire.runTurn(inputs, runAbort.signal), processFailure]),
		collectOutput,
		cancelled: () => runAbort.signal.aborted,
		onError: spec.onError,
		signal: request.signal,
		onAbort
	});
	return subprocessRunHandle({
		id: SessionId(randomUUID()),
		result,
		signal: request.signal,
		onAbort,
		requestCancel,
		teardown: disposeProcess
	});
}
//#endregion
//#region lib/types/index.js
/**
* Fixed Codex one-shot subagent provider. Every accepted run starts a fresh
* official `codex app-server --stdio` process in the delegating Session's
* workspace and publishes only after an ephemeral thread exists.
*
* @module @deepseek-ai/dsh-subagent-codex
*/
const name = "subagent-codex";
const inject = ["attachments", "subagents", "subprocess"];
const Config = z.object({
	env: z.dict(z.string()).default({}),
	disposeGraceMs: z.number().default(DEFAULT_DISPOSE_GRACE_MS)
});
var CodexProvider = class {
	ctx;
	config;
	name = "codex";
	capabilities = NO_START_CAPABILITIES;
	inheritsParentContext = false;
	constructor(ctx, config) {
		this.ctx = ctx;
		this.config = config;
	}
	start(request) {
		const parentCwd = request.parent.session.header.cwd;
		if (parentCwd === void 0) throw new Error("subagent-codex: no working directory for the child — delegate from a parent session that has one");
		return startCodexRun(request, {
			cwd: resolveChildCwd("subagent-codex", void 0, parentCwd),
			model: request.agentOptions?.model,
			readImage: (ref, signal) => this.ctx.attachments.readImage(ref, signal),
			env: this.config.env,
			disposeGraceMs: this.config.disposeGraceMs,
			spawn: (spawnSpec) => this.ctx.subprocess.spawn(spawnSpec),
			onError: (error, stopReason) => {
				this.ctx.logger.warn(`subagent-codex: child run failed (${stopReason}): ${error.message}`);
			}
		});
	}
};
/**
* Register the fixed `codex` provider.
* @param ctx - context carrying shared subagent and subprocess services.
* @param config - explicit child environment and disposal grace.
*/
function apply(ctx, config) {
	const resolved = config;
	assertPositiveFinite("subagent-codex", "disposeGraceMs", resolved.disposeGraceMs);
	if (resolved.disposeGraceMs > MAX_TIMER_DELAY_MS) throw new Error(`subagent-codex: disposeGraceMs must be no greater than ${MAX_TIMER_DELAY_MS}`);
	ctx.subagents.registerProvider(new CodexProvider(ctx, resolved));
}
//#endregion
export { Config, apply, inject, name };
