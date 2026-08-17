import type { Context } from "@deepseek-ai/cordis";
import {
  LlmAdapter,
  type ContentBlock,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type Message,
  type StreamChunk,
} from "@deepseek-ai/dsh-llm";
import type { ModelRegistryFile, ModelRoute } from "./model-registry.js";

const PROVIDER_PREFIX = "deepsee-cli-";

export function cliRuntimeProviderId(routeId: string): string {
  const slug = routeId
    .replace(/^cli:/i, "")
    .replace(/@\d+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`DeepSee CLI route "${routeId}" has no usable provider id.`);
  return PROVIDER_PREFIX + slug;
}

function routeModels(route: ModelRoute): string[] {
  const models = route.cliModels?.filter(Boolean) ?? [];
  const selected = route.cliModel?.trim();
  if (selected && (models.length === 0 || models.includes(selected))) return [selected];
  if (models.length > 0) return [models[0]!];
  return [route.model];
}

function displayName(route: ModelRoute): string {
  return route.displayName?.trim() || route.sourceLabel?.trim() || route.model;
}

function blockText(block: ContentBlock): string {
  switch (block.type) {
    case "text":
      return block.text;
    case "reasoning":
      return block.text;
    case "image":
      return "[image attachment; use a DeepSee vision route to convert it to text before this CLI runtime]";
    case "tool-call":
      return `[tool call ${block.name}: ${block.arguments}]`;
    case "tool-result":
      return `[tool result ${block.toolCallId}${block.isError ? " (error)" : ""}: ${block.content.map(blockText).join("\n")}]`;
    default:
      return "";
  }
}

function messageText(message: Message): string {
  const text = message.content.map(blockText).filter(Boolean).join("\n").trim();
  return text ? `[${message.role}]\n${text}` : "";
}

export function cliBasePrompt(options: GenerateOptions): string {
  const transcript = options.messages.map(messageText).filter(Boolean).join("\n\n");
  const system = options.system?.trim();
  const auxiliary = options.purpose
    ? `This is a Harness ${options.purpose} request. Return only the requested ${options.purpose === "session-title" ? "short title" : "compact summary"} and do not modify files.`
    : "Complete the latest user request directly. You may use your native CLI tools and edit files in the active workspace when the task requires it.";
  return [
    "You are the user-selected base runtime inside DeepSee for DeepSeek Harness.",
    auxiliary,
    "Return the final assistant response only. Do not describe this transport layer or claim that another model performed your work.",
    "Harness system instructions (including inherited workspace and global user memory):",
    system || "[no Harness system instructions supplied]",
    "Conversation transcript:",
    transcript || "[empty conversation]",
  ].join("\n\n");
}

export function cliTaskPrompt(options: GenerateOptions, route: ModelRoute): ContentBlock[] {
  const prompt: ContentBlock[] = [{ type: "text", text: cliBasePrompt(options) }];
  if (!route.inputModalities?.includes("image")) return prompt;
  for (const message of options.messages) {
    for (const block of message.content) {
      if (block.type === "image") prompt.push(block);
    }
  }
  return prompt;
}

function answerText(output: readonly ContentBlock[]): string {
  return output
    .filter((block) => block.type === "text" || block.type === "reasoning")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export class CliRuntimeAdapter extends LlmAdapter {
  constructor(
    private readonly ctx: Pick<Context, "agents" | "subagents">,
    private readonly getRegistry: () => ModelRegistryFile,
  ) {
    super();
  }

  private routes(provider: string): ModelRoute[] {
    const routes = this.getRegistry().routes.filter((candidate) => (
      candidate.source === "cli"
      && cliRuntimeProviderId(candidate.id) === provider
      && candidate.enabled
      && candidate.status === "ready"
    ));
    if (routes.length === 0) throw new Error(`DeepSee CLI provider "${provider}" is not in the model registry.`);
    if (routes.some((route) => !route.runtimeProvider)) {
      throw new Error(`DeepSee CLI provider "${provider}" has a route without a native Harness provider.`);
    }
    return routes;
  }

  private route(provider: string, model?: string): ModelRoute {
    const routes = this.routes(provider);
    if (!model) return routes[0]!;
    const route = routes.find((candidate) => routeModels(candidate).includes(model));
    if (!route) {
      const models = routes.flatMap(routeModels);
      throw new Error(`Model "${model}" is not available from ${provider}. Available models: ${models.join(", ")}.`);
    }
    return route;
  }

  providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: `${displayName(this.routes(provider)[0]!)} · DeepSee` };
  }

  async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return this.routes(provider).flatMap((route) => routeModels(route).map((model) => ({
        provider,
        id: model,
        name: model,
        description: `${displayName(route)} subscription runtime via DeepSee`,
        inputModalities: route.inputModalities?.includes("image") ? ["text", "image"] as const : ["text"] as const,
      })));
  }

  async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const route = this.route(provider, model);
    return {
      provider,
      id: model,
      name: model,
      description: `${displayName(route)} subscription runtime via DeepSee`,
      inputModalities: route.inputModalities?.includes("image") ? ["text", "image"] : ["text"],
    };
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const route = this.route(options.provider, options.model);
    await this.resolveModel(options.provider, options.model);
    const parent = options.sessionId ? this.ctx.agents.get(options.sessionId) : undefined;
    if (!parent) {
      throw new Error(`${route.id} can be used as a base model only from a live Harness session.`);
    }
    const run = await this.ctx.subagents.start(route.runtimeProvider!, {
      parent,
      prompt: cliTaskPrompt(options, route),
      signal: options.signal ?? new AbortController().signal,
      agentOptions: { model: options.model },
    });
    try {
      const result = await run.result;
      if (result.stopReason !== "completed") {
        throw new Error(`${route.id} base runtime stopped with ${result.stopReason}.`);
      }
      const text = answerText(result.output);
      if (!text) throw new Error(`${route.id} base runtime returned no assistant text.`);
      const block = { type: "text" as const, text };
      yield { type: "block-start", index: 0, blockType: "text" };
      yield { type: "text-delta", index: 0, text };
      yield { type: "block-end", index: 0, block };
      yield { type: "usage", usage: { inputTokens: 0, outputTokens: 0 } };
      yield { type: "finish", reason: { kind: "stop" } };
    } finally {
      await run.dispose();
    }
  }
}

export function installCliRuntimeAdapters(
  ctx: Context,
  getRegistry: () => ModelRegistryFile,
): string[] {
  const providers = getRegistry().routes
    .filter((route) => (
      route.source === "cli"
      && route.enabled
      && route.status === "ready"
      && Boolean(route.runtimeProvider)
      && Boolean(ctx.subagents.getProvider(route.runtimeProvider!))
    ))
    .map((route) => cliRuntimeProviderId(route.id));
  if (providers.length > 0) {
    ctx.llm.registerAdapter([...new Set(providers)], new CliRuntimeAdapter(ctx, getRegistry));
  }
  return [...new Set(providers)];
}
