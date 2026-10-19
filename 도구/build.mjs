// 빌드: data/*.json + src/runtime.js → extension.js
// 실행: node 도구/build.mjs            (확장 폴더에서)
//
// data/
//   en.json             Slurp 영어 원문 전체 (도구/extract.mjs 가 만든다, 검증용)
//   i18n-ko.engine.json 마리나라 엔진 한국어 UI 팩에서 자동으로 가져온 번역 (extract.mjs)
//   i18n-ko.json        직접 번역한 키 (수동)
//   text-ko.json        번역 키를 거치지 않는 고정 영어 문구 사전 (수동)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {});

const manifest = readJson(join(ROOT, "manifest.json"));
const version = manifest.config?.version ?? "0.0.0";
const en = readJson(join(ROOT, "data", "en.json"));
const engine = readJson(join(ROOT, "data", "i18n-ko.engine.json"));
const manual = readJson(join(ROOT, "data", "i18n-ko.json"));
const text = readJson(join(ROOT, "data", "text-ko.json"));

const i18n = { ...engine, ...manual };
const problems = [];
const placeholders = (s) => (String(s).match(/\{\{[^}]+\}\}|<[a-zA-Z]+\s*\/>/g) ?? []).sort().join(" ");
for (const [key, ko] of Object.entries(i18n)) {
  // 영어가 "s"(복수 접미사) 같은 한두 글자 조각이면 한국어가 빈 문자열인 것도 정상
  if (typeof ko !== "string" || (!ko.trim() && String(en[key] ?? "x").trim().length > 2)) problems.push(`빈 번역: ${key}`);
  if (Object.keys(en).length && !(key in en)) problems.push(`영어 원문에 없는 키(오래됨?): ${key}`);
  if (key in en && placeholders(en[key]) !== placeholders(ko)) problems.push(`자리표시자 불일치: ${key}\n    EN ${en[key]}\n    KO ${ko}`);
}
for (const [k, v] of Object.entries(text)) {
  if (!k.trim() || typeof v !== "string" || !v.trim()) problems.push(`고정 문구 사전 빈 항목: "${k}"`);
}
if (problems.length) {
  console.error(`문제 ${problems.length}건:\n- ` + problems.join("\n- "));
  process.exit(1);
}

const runtime = readFileSync(join(ROOT, "src", "runtime.js"), "utf8");
const header = `// 슬럽 한국어 패치 v${version} — 빌드 산출물 (원본: src/runtime.js, data/*.json)
// 번역 키 ${Object.keys(i18n).length}개 (엔진 팩 ${Object.keys(engine).length} + 직접 번역 ${Object.keys(manual).length}), 고정 문구 ${Object.keys(text).length}개
`;
const out =
  header +
  `const __SLP_KO_VERSION__ = ${JSON.stringify(version)};\n` +
  `const __SLP_KO_I18N__ = ${JSON.stringify(i18n)};\n` +
  `const __SLP_KO_TEXT__ = ${JSON.stringify(text)};\n` +
  runtime.replace(/^const VERSION = __SLP_KO_VERSION__;$/m, "const VERSION = __SLP_KO_VERSION__;");
writeFileSync(join(ROOT, "extension.js"), out, "utf8");
console.log(`extension.js 생성 — ${(out.length / 1024).toFixed(0)} KB, 번역 키 ${Object.keys(i18n).length}개, 고정 문구 ${Object.keys(text).length}개`);
