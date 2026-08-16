export type ModelSource = "harness" | "api" | "cli" | "ocr";
export type ModelStatus = "ready" | "installed" | "unavailable" | "error";
export type VisionLevel = "none" | "ocr-only" | "full-vision";
export type DescriptionSource = "declared" | "verified" | "inferred" | "user";
export interface ModelRoute {
    id: string;
    source: ModelSource;
    provider: string;
    model: string;
    /** User-facing model name; never changes the runtime model id. */
    displayName?: string;
    /** User-facing source label; never changes the runtime provider. */
    sourceLabel?: string;
    /** Harness LLM adapter used when this route is selected for a child agent. */
    runtimeProvider?: string;
    /** Harness model id used when it differs from the public registry model name. */
    runtimeModel?: string;
    /** Models exposed by an authenticated local CLI runtime. */
    cliModels?: string[];
    /** User-selected CLI model; absence means the CLI's own default. */
    cliModel?: string;
    /** Installed desktop application associated with this executable route. */
    desktopAppId?: string;
    enabled: boolean;
    status: ModelStatus;
    capabilities: string[];
    weaknesses: string[];
    roles: string[];
    description: string;
    descriptionSource: DescriptionSource;
    visionLevel: VisionLevel;
    credentialRef?: string;
    executable?: string;
    lastCheckedAt?: string;
    /** Automatic self-description lifecycle for Harness-managed models. */
    profileStatus?: "pending" | "profiling" | "ready" | "error";
    profiledAt?: string;
    profileError?: string;
    /** Short user-facing explanation when startup verification did not pass. */
    statusReason?: string;
}
export interface ModelRegistryPreferences {
    primaryRouteId?: string;
    visionRouteId?: string;
    reviewPolicy?: "prefer-different" | "require-different" | "same-allowed";
    primeAutoWorkflow?: boolean;
    visionMode?: "model" | "ocr";
    ocrTool?: "mineru" | "paddleocr" | "rapidocr";
}
export interface DesktopApp {
    id: string;
    name: string;
    provider: string;
    version?: string;
    launchUrl?: string;
    status: "installed" | "ready";
    execution: "launch-only" | "runtime";
    runtimeRouteId?: string;
}
export interface ModelRouteOverride {
    id: string;
    enabled: boolean;
    displayName?: string;
    sourceLabel?: string;
    capabilities: string[];
    weaknesses: string[];
    roles: string[];
    description: string;
}
export interface ModelRegistryFile {
    version: 1;
    routes: ModelRoute[];
    desktopApps?: DesktopApp[];
    preferences?: ModelRegistryPreferences;
}
export interface ModelRouteQuery {
    capability?: string;
    role?: string;
    includeUnavailable?: boolean;
}
export declare function normalizeRegistry(value: unknown): ModelRegistryFile;
export declare function loadRegistryFile(path: string): ModelRegistryFile;
export declare function queryRoutes(registry: ModelRegistryFile, query?: ModelRouteQuery): ModelRoute[];
export declare function defaultRoutes(config: {
    provider: string;
    model: string;
    primaryProvider: string;
}): ModelRoute[];
export declare function withFallbackRoutes(registry: ModelRegistryFile, fallback: ModelRoute[]): ModelRegistryFile;
export declare function applyRouteOverrides(registry: ModelRegistryFile, overrides: readonly ModelRouteOverride[]): ModelRegistryFile;
