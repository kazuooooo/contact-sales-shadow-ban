#!/usr/bin/env node
// 設定ファイルと src/tag.html から以下を生成する（依存パッケージなし）
//   gtm/container.json … GTM「コンテナをインポート」用（config.local.json から作ったときは gtm/container.local.json）
//   dist/demo.html     … ブラウザで開いて動作確認するデモページ
// 設定ファイルは引数で指定できる。省略時は config.local.json（git 管理外・実際のリスト）があればそれを、なければ config.json（サンプル）を使う
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const VAR = {
  domains: '営業ブロック - ドメイン',
  redirectUrl: '営業ブロック - 完了URL',
  emailSelector: '営業ブロック - メールセレクタ',
};
const FREE_MAIL = ['gmail.com', 'yahoo.co.jp', 'outlook.com', 'outlook.jp', 'hotmail.com', 'icloud.com', 'me.com', 'docomo.ne.jp', 'ezweb.ne.jp', 'softbank.ne.jp', 'i.softbank.jp'];

// ---- 設定の読み込みと検証 ----
const configFile = process.argv[2] || (existsSync(join(root, 'config.local.json')) ? 'config.local.json' : 'config.json');
const isLocal = configFile.includes('.local.');
const containerFile = isLocal ? 'gtm/container.local.json' : 'gtm/container.json';
console.log(`設定ファイル: ${configFile}`);
const config = JSON.parse(read(configFile));
const errors = [];
const warnings = [];

if (!Array.isArray(config.domains)) errors.push('domains は配列で指定してください');
const domains = (config.domains || []).map((d) => String(d).trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
// domains にはドメインのほか、フリーメールの営業を止めるための「name@gmail.com」形式のアドレスも書ける
for (const d of domains) {
  if (!/^([a-z0-9._%+-]+@)?([a-z0-9-]+\.)+[a-z0-9-]+$/.test(d)) errors.push(`ドメインかアドレスの形式が不正です: ${d}`);
  if (FREE_MAIL.includes(d)) warnings.push(`フリーメールのドメインが含まれています（一般の問い合わせも消えます。アドレス単位で書いてください）: ${d}`);
}
if (new Set(domains).size !== domains.length) warnings.push('重複したドメインがあります');
// redirectUrl は文字列（全ページ共通）か、{ "フォームのページのパス": "完了 URL" } のオブジェクト（書いたページだけが対象）
let redirectUrl = config.redirectUrl;
if (redirectUrl && typeof redirectUrl === 'object' && !Array.isArray(redirectUrl)) {
  const entries = Object.entries(redirectUrl);
  if (!entries.length) errors.push('redirectUrl にページを 1 つ以上指定してください');
  for (const [path, url] of entries) {
    if (!/^\/[^?=,\s]*$/.test(path)) errors.push(`redirectUrl のページのパスは / で始め、? = , と空白は使えません: ${path}`);
    if (!url || /[,\s]/.test(String(url))) errors.push(`redirectUrl の完了 URL が空か、カンマ・空白を含んでいます: ${path}`);
  }
  redirectUrl = entries.map(([path, url]) => `${path}=${url}`).join(', ');
}
if (!redirectUrl || typeof redirectUrl !== 'string') errors.push('redirectUrl を文字列かオブジェクトで指定してください');
if (!config.emailSelector) errors.push('emailSelector を指定してください');
if (String(config.emailSelector).includes("'")) errors.push("emailSelector にシングルクォート ' は使えません（ダブルクォートを使ってください）");
if (String(redirectUrl).includes("'")) errors.push("redirectUrl にシングルクォート ' は使えません");

warnings.forEach((w) => console.warn(`⚠ ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error(`✖ ${e}`));
  process.exit(1);
}

const domainList = [...new Set(domains)];
const values = {
  // 定数の変数は 1024 文字までなので、ドメインはカスタム JavaScript の変数にして 1 行 1 件の配列で返す
  domains: ['function () {', '  // ブロックするドメインとメールアドレス（1 行に 1 つ）', '  return [', ...domainList.map((d) => `    '${d}',`), '  ];', '}'].join('\n'),
  redirectUrl,
  emailSelector: config.emailSelector,
};
for (const key of ['redirectUrl', 'emailSelector']) {
  if (String(values[key]).length > 1024) {
    console.error(`✖ ${key} が GTM の定数の上限（1024 文字）を超えています`);
    process.exit(1);
  }
}
const tagHtml = read('src/tag.html');

// ---- GTM コンテナ（インポート用）----
// GTM のエクスポート形式に合わせる。container（usageContext）や fingerprint がないとインポート画面で「見つかりませんでした」になる
const ids = { accountId: '0', containerId: '0' };
const fingerprint = '0';
const container = {
  exportFormatVersion: 2,
  exportTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
  containerVersion: {
    path: 'accounts/0/containers/0/versions/0',
    ...ids,
    containerVersionId: '0',
    container: {
      path: 'accounts/0/containers/0',
      ...ids,
      name: 'contact-sales-shadow-ban',
      publicId: 'GTM-XXXXXXX',
      usageContext: ['WEB'],
      fingerprint,
    },
    tag: [
      {
        ...ids,
        tagId: '1',
        name: '営業ブロック - フォーム送信ブロック',
        type: 'html',
        parameter: [
          { type: 'TEMPLATE', key: 'html', value: tagHtml },
          { type: 'BOOLEAN', key: 'supportDocumentWrite', value: 'false' },
        ],
        fingerprint,
        firingTriggerId: ['2'],
        tagFiringOption: 'ONCE_PER_EVENT',
        monitoringMetadata: { type: 'MAP' },
        consentSettings: { consentStatus: 'NOT_SET' },
      },
    ],
    trigger: [{ ...ids, triggerId: '2', name: '営業ブロック - DOM Ready', type: 'DOM_READY', fingerprint }],
    variable: Object.entries(VAR).map(([key, name], i) => ({
      ...ids,
      variableId: String(3 + i),
      name,
      ...(key === 'domains'
        ? { type: 'jsm', parameter: [{ type: 'TEMPLATE', key: 'javascript', value: values[key] }] }
        : { type: 'c', parameter: [{ type: 'TEMPLATE', key: 'value', value: values[key] }] }),
      fingerprint,
      formatValue: {},
    })),
    fingerprint,
  },
};
mkdirSync(join(root, 'gtm'), { recursive: true });
writeFileSync(join(root, containerFile), JSON.stringify(container, null, 2) + '\n');

// ---- デモページ（GTM 変数を実際の値に置換）----
let demoTag = tagHtml.split(`{{${VAR.domains}}}`).join(JSON.stringify(domainList));
for (const [key, name] of Object.entries(VAR)) demoTag = demoTag.split(`{{${name}}}`).join(values[key]);
demoTag = demoTag.split(`'${values.redirectUrl}'`).join(`'#blocked'`); // デモではページ遷移の代わりにハッシュを変える

const demo = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>contact-sales-shadow-ban demo</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto">
<h1>動作確認デモ</h1>
<p>ブロック対象: <code>${domainList.join(', ') || '(なし)'}</code></p>
<form id="f" onsubmit="event.preventDefault();document.getElementById('r').textContent='✅ 通常送信されました';">
  <p><input type="email" name="email" placeholder="mail@example.com" style="width:100%"></p>
  <p><button type="submit">送信</button></p>
</form>
<p id="r"></p>
<script>window.addEventListener('hashchange',function(){if(location.hash==='#blocked'){document.getElementById('r').textContent='🚫 ブロックされました（本番では ${values.redirectUrl} へ遷移）';history.replaceState(null,'',' ');}});</script>
${demoTag}
</body></html>
`;
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/demo.html'), demo);

console.log(`✔ ${containerFile} を生成しました（ドメイン ${domains.length} 件）`);
console.log('✔ dist/demo.html を生成しました（ブラウザで開いて確認できます）');
