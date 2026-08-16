import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
const runnerPath = fileURLToPath(new URL("../scripts/ocr-runner.py", import.meta.url));
function imageBlocks(content) {
    const images = [];
    for (const block of content) {
        if (block.type === "image")
            images.push(block);
        else if (block.type === "tool-result")
            images.push(...imageBlocks(block.content));
    }
    return images;
}
function extension(mediaType) {
    if (mediaType === "image/jpeg")
        return ".jpg";
    if (mediaType === "image/webp")
        return ".webp";
    if (mediaType === "image/gif")
        return ".gif";
    return ".png";
}
function runMinerU(executable, input, output, timeoutMs, signal) {
    return new Promise((resolve, reject) => {
        const managedConfigPath = join(dirname(dirname(dirname(executable))), "mineru.json");
        const child = spawn(executable, [
            "-p", input,
            "-o", output,
            "--backend", "pipeline",
            "--method", "ocr",
            "--lang", "ch",
        ], {
            windowsHide: true,
            stdio: ["ignore", "ignore", "pipe"],
            env: existsSync(managedConfigPath)
                ? { ...process.env, MINERU_TOOLS_CONFIG_JSON: managedConfigPath }
                : process.env,
        });
        let stderr = "";
        const timer = setTimeout(() => child.kill(), timeoutMs);
        const abort = () => child.kill();
        signal?.addEventListener("abort", abort, { once: true });
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
        child.once("error", reject);
        child.once("exit", (code) => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            if (signal?.aborted)
                return reject(signal.reason || new Error("MinerU OCR 已取消。"));
            if (code === 0)
                resolve();
            else
                reject(new Error(stderr.trim() || `MinerU 退出码 ${String(code)}`));
        });
    });
}
function runPythonOCR(executable, tool, input, timeoutMs, signal) {
    return new Promise((resolve, reject) => {
        const toolRoot = dirname(dirname(dirname(executable)));
        const child = spawn(executable, [runnerPath, tool, input], {
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
            env: {
                ...process.env,
                PADDLE_PDX_CACHE_HOME: join(toolRoot, "model-cache", "paddlex"),
                PADDLE_PDX_MODEL_SOURCE: process.env.PADDLE_PDX_MODEL_SOURCE || "BOS",
            },
        });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => child.kill(), timeoutMs);
        const abort = () => child.kill();
        signal?.addEventListener("abort", abort, { once: true });
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-64_000); });
        child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4_000); });
        child.once("error", reject);
        child.once("exit", (code) => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            if (signal?.aborted)
                return reject(signal.reason || new Error(`${tool} OCR 已取消。`));
            if (code !== 0)
                return reject(new Error(stderr.trim() || `${tool} 退出码 ${String(code)}`));
            const marker = "__DEEPSEE_OCR__";
            const markerIndex = stdout.lastIndexOf(marker);
            if (markerIndex === -1)
                return reject(new Error(`${tool} 未返回 DeepSee OCR 协议结果。`));
            const line = stdout.slice(markerIndex + marker.length).split(/\r?\n/, 1)[0];
            try {
                const value = JSON.parse(line);
                const texts = Array.isArray(value.texts)
                    ? value.texts.filter((item) => typeof item === "string" && item.trim().length > 0)
                    : [];
                resolve(texts.join("\n"));
            }
            catch {
                reject(new Error(`${tool} 返回了无效的 OCR 协议结果。`));
            }
        });
    });
}
function collectTextFiles(root) {
    const files = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const path = join(root, entry.name);
        if (entry.isDirectory())
            files.push(...collectTextFiles(path));
        else if ([".md", ".txt"].includes(extname(entry.name).toLowerCase()))
            files.push(path);
    }
    return files;
}
export async function describeImagesWithMinerU(ctx, message, config, signal) {
    if (!config.executable)
        return "[DeepSee OCR unavailable: MinerU 尚未安装]";
    const blocks = imageBlocks(message.content);
    if (blocks.length === 0)
        return "[DeepSee OCR: 没有图片输入]";
    const root = mkdtempSync(join(tmpdir(), "opends-mineru-"));
    try {
        const results = [];
        for (let index = 0; index < blocks.length; index += 1) {
            const stored = await ctx.attachments.readImage(blocks[index].attachment, signal);
            const input = join(root, `image-${index + 1}${extension(stored.ref.mediaType)}`);
            const output = join(root, `output-${index + 1}`);
            mkdirSync(output, { recursive: true });
            writeFileSync(input, stored.data);
            await runMinerU(config.executable, input, output, config.timeoutMs || 300000, signal);
            const text = collectTextFiles(output)
                .map((path) => readFileSync(path, "utf8").trim())
                .filter(Boolean)
                .join("\n\n");
            results.push(text || "[MinerU 未返回可读文字]");
        }
        return results.map((text, index) => `图片 ${index + 1}:\n${text}`).join("\n\n").slice(0, 24000);
    }
    catch (error) {
        return `[DeepSee OCR unavailable: ${error instanceof Error ? error.message : String(error)}]`;
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
}
export async function describeImagesWithLocalOCR(ctx, message, config, signal) {
    if (config.tool === "mineru")
        return describeImagesWithMinerU(ctx, message, config, signal);
    if (!config.executable)
        return `[DeepSee OCR unavailable: ${config.tool} 尚未安装]`;
    const blocks = imageBlocks(message.content);
    if (blocks.length === 0)
        return "[DeepSee OCR: 没有图片输入]";
    const root = mkdtempSync(join(tmpdir(), `deepsee-${config.tool}-`));
    try {
        const results = [];
        for (let index = 0; index < blocks.length; index += 1) {
            const stored = await ctx.attachments.readImage(blocks[index].attachment, signal);
            const input = join(root, `image-${index + 1}${extension(stored.ref.mediaType)}`);
            writeFileSync(input, stored.data);
            const text = await runPythonOCR(config.executable, config.tool, input, config.timeoutMs || 300000, signal);
            results.push(text || `[${config.tool} 未返回可读文字]`);
        }
        return results.map((text, index) => `图片 ${index + 1}:\n${text}`).join("\n\n").slice(0, 24000);
    }
    catch (error) {
        return `[DeepSee OCR unavailable: ${error instanceof Error ? error.message : String(error)}]`;
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
}
