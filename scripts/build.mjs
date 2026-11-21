#!/usr/bin/env node
// config.json と src/tag.html から以下を生成する（依存パッケージなし）
//   gtm/container.json … GTM「コンテナをインポート」用
//   dist/demo.html     … ブラウザで開いて動作確認するデモページ
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
const config = JSON.parse(read('config.json'));
const errors = [];
const warnings = [];

if (!Array.isArray(config.domains)) errors.push('domains は配列で指定してください');
const domains = (config.domains || []).map((d) => String(d).trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
for (const d of domains) {
  if (!/^([a-z0-9-]+\.)+[a-z0-9-]+$/.test(d)) errors.push(`ドメインの形式が不正です: ${d}`);
  if (FREE_MAIL.includes(d)) warnings.push(`フリーメールのドメインが含まれています（一般の問い合わせも消えます）: ${d}`);
}
if (new Set(domains).size !== domains.length) warnings.push('重複したドメインがあります');
if (!config.redirectUrl) errors.push('redirectUrl を指定してください');
if (!config.emailSelector) errors.push('emailSelector を指定してください');
if (String(config.emailSelector).includes("'")) errors.push("emailSelector にシングルクォート ' は使えません（ダブルクォートを使ってください）");
if (String(config.redirectUrl).includes("'")) errors.push("redirectUrl にシングルクォート ' は使えません");

warnings.forEach((w) => console.warn(`⚠ ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error(`✖ ${e}`));
  process.exit(1);
}

const values = {
  domains: [...new Set(domains)].join(', '),
  redirectUrl: config.redirectUrl,
  emailSelector: config.emailSelector,
};
const tagHtml = read('src/tag.html');

// ---- GTM コンテナ（インポート用）----
const ids = { accountId: '0', containerId: '0' };
const container = {
  exportFormatVersion: 2,
  exportTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
  containerVersion: {
    path: 'accounts/0/containers/0/versions/0',
    ...ids,
    containerVersionId: '0',
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
        firingTriggerId: ['2'],
        tagFiringOption: 'ONCE_PER_EVENT',
      },
    ],
    trigger: [{ ...ids, triggerId: '2', name: '営業ブロック - DOM Ready', type: 'DOM_READY' }],
    variable: Object.entries(VAR).map(([key, name], i) => ({
      ...ids,
      variableId: String(3 + i),
      name,
      type: 'c',
      parameter: [{ type: 'TEMPLATE', key: 'value', value: values[key] }],
    })),
  },
};
mkdirSync(join(root, 'gtm'), { recursive: true });
writeFileSync(join(root, 'gtm/container.json'), JSON.stringify(container, null, 2) + '\n');

// ---- デモページ（GTM 変数を実際の値に置換）----
let demoTag = tagHtml;
for (const [key, name] of Object.entries(VAR)) demoTag = demoTag.split(`{{${name}}}`).join(values[key]);
demoTag = demoTag.split(`'${values.redirectUrl}'`).join(`'#blocked'`); // デモではページ遷移の代わりにハッシュを変える

const demo = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>contact-sales-shadow-ban demo</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto">
<h1>動作確認デモ</h1>
<p>ブロック対象: <code>${values.domains || '(なし)'}</code></p>
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

console.log(`✔ gtm/container.json を生成しました（ドメイン ${domains.length} 件）`);
console.log('✔ dist/demo.html を生成しました（ブラウザで開いて確認できます）');
