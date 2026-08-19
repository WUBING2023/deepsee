import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname } from "node:path";

function concise(error) {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim().slice(0, 240);
}

export function downloadWithFallback(url, target, strategies) {
  if (!Array.isArray(strategies) || strategies.length === 0) throw new Error("没有可用的下载器。");
  mkdirSync(dirname(target), { recursive: true });
  const partial = `${target}.partial`;
  const failures = [];
  for (const strategy of strategies) {
    rmSync(partial, { force: true });
    try {
      strategy.download(url, partial);
      if (!existsSync(partial) || statSync(partial).size <= 0) throw new Error("下载结果为空。");
      rmSync(target, { force: true });
      renameSync(partial, target);
      return strategy.label;
    } catch (error) {
      failures.push(`${strategy.label}: ${concise(error)}`);
    } finally {
      rmSync(partial, { force: true });
    }
  }
  throw new Error(`所有下载通道均失败（${failures.join("；")}）。请检查代理、证书或防火墙后重试。`);
}
