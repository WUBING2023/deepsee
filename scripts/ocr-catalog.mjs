export const OCR_TOOL_IDS = Object.freeze(["mineru", "paddleocr", "rapidocr"]);

const CATALOG = Object.freeze({
  mineru: Object.freeze({
    id: "mineru",
    label: "MinerU",
    bestFor: "复杂 PDF、论文、表格与公式",
    footprint: "重型",
    license: "MinerU Open Source License",
    projectUrl: "https://github.com/opendatalab/MinerU",
  }),
  paddleocr: Object.freeze({
    id: "paddleocr",
    label: "PaddleOCR",
    bestFor: "多语言图片、扫描件与通用 PDF",
    footprint: "中型",
    license: "Apache-2.0",
    projectUrl: "https://github.com/PaddlePaddle/PaddleOCR",
    command: "paddleocr",
    importName: "paddleocr",
    packageSpec: "paddleocr>=3.5,<4",
    enginePackageSpec: "paddlepaddle==3.2.0",
    engineIndexUrl: "https://www.paddlepaddle.org.cn/packages/stable/cpu/",
    sourceZipUrl: "https://github.com/PaddlePaddle/PaddleOCR/archive/refs/heads/main.zip",
  }),
  rapidocr: Object.freeze({
    id: "rapidocr",
    label: "RapidOCR",
    bestFor: "截图、票据与低资源 CPU 快速识字",
    footprint: "轻型",
    license: "Apache-2.0（模型版权见项目说明）",
    projectUrl: "https://github.com/RapidAI/RapidOCR",
    command: "rapidocr",
    importName: "rapidocr",
    packageSpec: "rapidocr>=3,<4",
    extraPackages: ["onnxruntime>=1.18,<2"],
    sourceZipUrl: "https://github.com/RapidAI/RapidOCR/archive/refs/heads/main.zip",
  }),
});

export const OCR_COMPARISON = "MinerU 适合复杂文档；PaddleOCR 适合多语言通用识别；RapidOCR 适合轻量截图与低资源设备。";

export function getOCRDefinition(id) {
  const definition = CATALOG[id];
  if (!definition) throw new Error("OCR 工具不存在或暂不受支持。");
  return definition;
}

export function publicOCRCatalog() {
  return OCR_TOOL_IDS.map((id) => {
    const { command: _command, importName: _importName, packageSpec: _packageSpec,
      enginePackageSpec: _enginePackageSpec, engineIndexUrl: _engineIndexUrl,
      extraPackages: _extraPackages, sourceZipUrl: _sourceZipUrl, ...entry } = CATALOG[id];
    return entry;
  });
}
