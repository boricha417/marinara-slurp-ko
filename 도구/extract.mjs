// 추출: 설치된 Slurp(slurp2) 패키지에서 영어 원문과 원본 한국어를 읽어
//   data/en.json              영어 원문 전체
//   data/i18n-ko.engine.json  마리나라 엔진 한국어 UI 팩(ui-packs/ko.json)에 같은 키·같은 영어가 있는 번역
//   data/todo.json            아직 번역이 없는 키 (영어 원문) — 직접 번역할 목록
// 를 만든다. Slurp 이 업데이트되면 다시 실행해서 todo.json 에 새 키가 생겼는지 본다.
//
// 실행: node 도구/extract.mjs [slurp2 버전 폴더] [엔진 폴더]
//   기본: ../../Marinara-Engine 의 packages/server/data/capability-packages/versions/slurp2/<가장 높은 버전>
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = resolve(process.argv[3] ?? join(ROOT, "..", "..", "Marinara-Engine"));
const versionsDir = join(ENGINE, "packages", "server", "data", "capability-packages", "versions", "slurp2");
const pkgDir =
  process.argv[2] ??
  join(
    versionsDir,
    readdirSync(versionsDir)
      .filter((d) => /^\d+\.\d+\.\d+$/.test(d))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .at(-1),
  );
console.log("Slurp 패키지:", pkgDir);

const client = readFileSync(join(pkgDir, "client.js"), "utf8");
const marker = "var OH={";
let start = client.indexOf(marker);
if (start < 0) {
  // 변수명이 바뀐 경우: 첫 번역 키가 들어 있는 객체를 찾는다
  const probe = client.indexOf('"ui.slurp.actions.cancel":"');
  if (probe < 0) throw new Error("영어 번역 객체를 찾지 못했습니다 (번들 구조가 바뀜)");
  start = client.lastIndexOf("={", probe) + 1;
} else start += marker.length - 1;
let depth = 0, i = start, inStr = false, quote = "";
for (; i < client.length; i++) {
  const c = client[i];
  if (inStr) {
    if (c === "\\") i++;
    else if (c === quote) inStr = false;
    continue;
  }
  if (c === '"' || c === "'" || c === "`") { inStr = true; quote = c; continue; }
  if (c === "{") depth++;
  else if (c === "}" && --depth === 0) break;
}
const en = (0, eval)("(" + client.slice(start, i + 1) + ")");
console.log("영어 키:", Object.keys(en).length);

const koPath = join(pkgDir, "src", "engine", "packages", "client", "src", "slp", "locales", "ko.json");
const upstreamKo = existsSync(koPath) ? JSON.parse(readFileSync(koPath, "utf8")) : {};
console.log("Slurp 원본 한국어 키:", Object.keys(upstreamKo).length);

const flat = (o, p = "", out = {}) => {
  for (const k in o) {
    const v = o[k], key = p ? p + "." + k : k;
    if (typeof v === "string") out[key] = v;
    else if (v && typeof v === "object") flat(v, key, out);
  }
  return out;
};
const enginePackPath = join(ENGINE, "packages", "server", "data", "ui-packs", "ko.json");
const engineEnPath = join(ENGINE, "packages", "client", "src", "localization", "locales", "en.json");
const enginePack = existsSync(enginePackPath) ? flat(JSON.parse(readFileSync(enginePackPath, "utf8"))) : {};
const engineEn = existsSync(engineEnPath) ? flat(JSON.parse(readFileSync(engineEnPath, "utf8"))) : {};

const manual = existsSync(join(ROOT, "data", "i18n-ko.json")) ? JSON.parse(readFileSync(join(ROOT, "data", "i18n-ko.json"), "utf8")) : {};
const engineFill = {}, todo = {};
for (const key of Object.keys(en)) {
  if (key in upstreamKo || key in manual) continue;
  if (key in enginePack && engineEn[key] === en[key]) engineFill[key] = enginePack[key];
  else todo[key] = en[key];
}
writeFileSync(join(ROOT, "data", "en.json"), JSON.stringify(en, null, 2), "utf8");
writeFileSync(join(ROOT, "data", "i18n-ko.engine.json"), JSON.stringify(engineFill, null, 2), "utf8");
writeFileSync(join(ROOT, "data", "todo.json"), JSON.stringify(todo, null, 2), "utf8");
const stale = Object.keys(manual).filter((k) => !(k in en));
console.log(`엔진 팩에서 채움: ${Object.keys(engineFill).length}, 직접 번역됨: ${Object.keys(manual).length}, 남은 할 일(todo.json): ${Object.keys(todo).length}, 더는 안 쓰는 키: ${stale.length}`);
