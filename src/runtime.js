// ─────────────────────────────────────────────
// 슬럽 한국어 패치 — 런타임 (빌드 전 원본)
//
// 동작 원리
//  1) Slurp(slurp2)은 자체 i18next 인스턴스를 쓰고, 마리나라 언어가 한국어면
//     `/api/capability-packages/slurp2/assets/.../locales/ko.json` 을 fetch 로 받아 온다.
//     이 요청을 가로채 Slurp 원본 번역(우선) 위에 우리 번역(빈 키만)을 합쳐서 돌려준다.
//  2) 확장이 Slurp 보다 늦게 떠서 ko.json 이 이미 들어간 경우를 위해, Slurp 요소 안의
//     React 트리에서 i18n 인스턴스를 찾아 addResourceBundle(덮어쓰기 없음) 로 보완한다.
//  3) 번역 키를 거치지 않는 소수의 고정 영어 문구는 Slurp 요소 안에서만, 문구 전체가
//     정확히 일치할 때만 작은 사전으로 바꾼다. (사용자·AI 가 쓴 글은 부분 일치가 없으므로 안전)
//
// 이 파일은 빌드 시 `__SLP_KO_I18N__`, `__SLP_KO_TEXT__` 상수 뒤에 이어 붙여지고,
// 마리나라가 `async (marinara) => { ... }` 안에서 실행한다.
// ─────────────────────────────────────────────

const VERSION = __SLP_KO_VERSION__;
const PKG = "slurp2";
const TAG = `marinara-capability-${PKG}`;
const LOCALE_RE = /\/capability-packages\/slurp2\/assets\/[^?#]*\/locales\/ko\.json(?:[?#]|$)/;
const PROBE_KEY = "ui.slurp.home.lobby"; // Slurp 인스턴스인지 확인하는 키
const ATTRS = ["placeholder", "title", "aria-label"];
const SKIP_SELECTOR = "script, style, textarea, input, [contenteditable=''], [contenteditable='true']";
const LOG = "[슬럽 한국어 패치]";

const I18N = __SLP_KO_I18N__;
const TEXT = __SLP_KO_TEXT__;

let active = true;
const cleanups = [];
const stats = { version: VERSION, i18nKeys: Object.keys(I18N).length, textKeys: Object.keys(TEXT).length, fetchMerged: 0, fiberMerged: 0, textReplaced: 0, attrReplaced: 0 };
window.__slpKoPatch = stats;

// ── 1. fetch 가로채기 ─────────────────────────
const origFetch = window.fetch;
function urlOf(input) {
  try {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (input && typeof input.url === "string") return input.url;
  } catch {}
  return "";
}
function mergeLocale(upstream) {
  const merged = Object.assign({}, I18N);
  if (upstream && typeof upstream === "object" && !Array.isArray(upstream)) Object.assign(merged, upstream);
  return merged;
}
async function patchedFetch(input, init) {
  if (!active || !LOCALE_RE.test(urlOf(input))) return origFetch.apply(window, arguments);
  let upstream = null;
  const headers = new Headers();
  try {
    const res = await origFetch.apply(window, arguments);
    // Slurp 은 응답 헤더(연결 정보 등)도 읽으므로 원본 헤더를 그대로 넘긴다.
    res.headers.forEach((value, name) => headers.set(name, value));
    if (res.ok) upstream = await res.json();
  } catch (error) {
    console.warn(LOG, "Slurp 원본 ko.json 을 받지 못해 패치 번역만 적용합니다.", error);
  }
  headers.set("Content-Type", "application/json");
  headers.delete("content-length");
  stats.fetchMerged += 1;
  return new Response(JSON.stringify(mergeLocale(upstream)), { status: 200, headers });
}
patchedFetch.__slpKoPatch = VERSION;
window.fetch = patchedFetch;

// ── 2. i18n 인스턴스 보완 (늦게 뜬 경우) ───────
function isSlurpI18n(candidate) {
  return (
    candidate &&
    typeof candidate.addResourceBundle === "function" &&
    typeof candidate.hasResourceBundle === "function" &&
    typeof candidate.getResource === "function" &&
    candidate.getResource("en", "translation", PROBE_KEY) !== undefined
  );
}
function findI18n(root) {
  const nodes = [root, ...root.querySelectorAll("*")];
  const limit = Math.min(nodes.length, 600);
  for (let n = 0; n < limit; n++) {
    const node = nodes[n];
    const fiberKey = Object.keys(node).find((k) => k.startsWith("__reactFiber$"));
    if (!fiberKey) continue;
    let fiber = node[fiberKey];
    let hops = 0;
    while (fiber && hops++ < 300) {
      const props = fiber.memoizedProps;
      if (props && isSlurpI18n(props.i18n)) return props.i18n;
      fiber = fiber.return;
    }
  }
  return null;
}
function mergeIntoInstance(i18n) {
  if (!active || i18n.__slpKoMerged === VERSION) return;
  if (!i18n.hasResourceBundle("ko", "translation")) {
    // 아직 Slurp 원본 ko.json 이 안 들어왔다. 지금 넣으면 Slurp 이 원본을 안 받아 오므로
    // 원본이 들어온 뒤(added 이벤트)에 보완한다. (보통은 fetch 가로채기가 먼저 처리한다)
    if (!i18n.__slpKoListening) {
      i18n.__slpKoListening = true;
      const onAdded = (lng) => {
        if (lng !== "ko") return;
        i18n.off("added", onAdded);
        i18n.__slpKoListening = false;
        mergeIntoInstance(i18n);
      };
      i18n.on("added", onAdded);
      cleanups.push(() => i18n.off("added", onAdded));
    }
    return;
  }
  // 원본에 없는 키만 골라 평면 키 그대로 묶음에 더한다(deep=true, overwrite=false).
  const missing = {};
  let added = 0;
  for (const key of Object.keys(I18N)) {
    if (i18n.getResource("ko", "translation", key) === undefined) {
      missing[key] = I18N[key];
      added += 1;
    }
  }
  i18n.__slpKoMerged = VERSION;
  if (added > 0) {
    i18n.addResourceBundle("ko", "translation", missing, true, false);
    stats.fiberMerged += added;
    if (String(i18n.language || "").startsWith("ko")) i18n.changeLanguage(i18n.language);
  }
}

// ── 3. 고정 문구 사전 (Slurp 요소 안, 전체 일치만) ─
const textNodes = new Set(); // 바꾼 텍스트 노드 (원문은 node.__slpKoOrig)
const attrNodes = new Set(); // 바꾼 속성 엘리먼트 (원문은 el.__slpKoAttrs)

function translateTextNode(node) {
  const raw = node.nodeValue;
  if (!raw) return;
  const key = raw.trim();
  if (!key || !Object.prototype.hasOwnProperty.call(TEXT, key)) return;
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP_SELECTOR)) return;
  const lead = raw.match(/^\s*/)[0];
  const trail = raw.match(/\s*$/)[0];
  node.__slpKoOrig = raw;
  node.nodeValue = lead + TEXT[key] + trail;
  textNodes.add(node);
  stats.textReplaced += 1;
}
function translateAttrs(el) {
  if (el.nodeType !== 1 || el.matches(SKIP_SELECTOR)) return;
  for (const attr of ATTRS) {
    const value = el.getAttribute(attr);
    if (value == null) continue;
    const key = value.trim();
    if (!Object.prototype.hasOwnProperty.call(TEXT, key)) continue;
    if (!el.__slpKoAttrs) el.__slpKoAttrs = {};
    if (!(attr in el.__slpKoAttrs)) el.__slpKoAttrs[attr] = value;
    el.setAttribute(attr, TEXT[key]);
    attrNodes.add(el);
    stats.attrReplaced += 1;
  }
}
function walk(root) {
  if (root.nodeType === 3) {
    translateTextNode(root);
    return;
  }
  if (root.nodeType !== 1) return;
  translateAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === 3) translateTextNode(node);
    else translateAttrs(node);
  }
}
function restoreAll() {
  for (const node of textNodes) {
    if (node.__slpKoOrig !== undefined) node.nodeValue = node.__slpKoOrig;
    delete node.__slpKoOrig;
  }
  textNodes.clear();
  for (const el of attrNodes) {
    const saved = el.__slpKoAttrs || {};
    for (const attr of Object.keys(saved)) el.setAttribute(attr, saved[attr]);
    delete el.__slpKoAttrs;
  }
  attrNodes.clear();
}
function prune() {
  if (textNodes.size < 3000 && attrNodes.size < 3000) return;
  for (const node of textNodes) if (!node.isConnected) textNodes.delete(node);
  for (const el of attrNodes) if (!el.isConnected) attrNodes.delete(el);
}

// Slurp 요소(루트)별 감시
const roots = new Map(); // element -> { observer }
function isKorean(root) {
  const lang = root.getAttribute("lang") || document.documentElement.lang || "";
  return lang.toLowerCase().startsWith("ko");
}
function attachRoot(root) {
  if (roots.has(root)) return;
  const entry = { observer: null, fiberTimer: null, fiberTries: 0 };
  roots.set(root, entry);

  const onMutations = (mutations) => {
    if (!active) return;
    if (!isKorean(root)) return;
    for (const m of mutations) {
      if (m.type === "characterData") translateTextNode(m.target);
      else if (m.type === "attributes") {
        if (m.attributeName === "lang") {
          if (!isKorean(root)) restoreAll();
          else walk(root);
        } else translateAttrs(m.target);
      } else for (const n of m.addedNodes) walk(n);
    }
    prune();
  };
  entry.observer = new MutationObserver(onMutations);
  entry.observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS, "lang"],
  });
  if (isKorean(root)) walk(root);

  // 내부 React 트리가 그려지는 데 시간이 걸리므로 잠시 반복해서 i18n 인스턴스를 찾는다.
  const tryFiber = () => {
    if (!active || !root.isConnected) return;
    const i18n = findI18n(root);
    if (i18n) {
      mergeIntoInstance(i18n);
      return;
    }
    if (entry.fiberTries++ < 40) entry.fiberTimer = setTimeout(tryFiber, 250);
  };
  tryFiber();
}
function detachRoot(root) {
  const entry = roots.get(root);
  if (!entry) return;
  entry.observer?.disconnect();
  if (entry.fiberTimer) clearTimeout(entry.fiberTimer);
  roots.delete(root);
}
function scanRoots() {
  if (!active) return;
  // Slurp 요소 + Slurp 이 모달·시트를 그리는 포털(<div data-marinara-capability-scope="slurp2">)
  const present = new Set([
    ...document.getElementsByTagName(TAG),
    ...document.querySelectorAll(`[data-marinara-capability-scope="${PKG}"]`),
  ]);
  for (const root of present) attachRoot(root);
  for (const root of [...roots.keys()]) if (!present.has(root)) detachRoot(root);
}
// requestAnimationFrame 은 탭이 숨겨져 있으면 멈추므로 setTimeout 으로 묶는다.
let scanTimer = null;
const bodyObserver = new MutationObserver(() => {
  if (!active || scanTimer) return;
  scanTimer = setTimeout(() => {
    scanTimer = null;
    scanRoots();
  }, 50);
});
bodyObserver.observe(document.body, { childList: true, subtree: true });
scanRoots();

// ── 정리 ──────────────────────────────────────
function cleanupAll() {
  active = false;
  bodyObserver.disconnect();
  if (scanTimer) clearTimeout(scanTimer);
  for (const root of [...roots.keys()]) detachRoot(root);
  restoreAll();
  for (const fn of cleanups) {
    try {
      fn();
    } catch {}
  }
  if (window.fetch === patchedFetch) window.fetch = origFetch;
  if (window.__slpKoPatch === stats) delete window.__slpKoPatch;
}
if (typeof marinara !== "undefined" && marinara && typeof marinara.onCleanup === "function") {
  marinara.onCleanup(cleanupAll);
}
console.info(LOG, `v${VERSION} 준비 — 번역 키 ${stats.i18nKeys}개, 고정 문구 ${stats.textKeys}개`);
