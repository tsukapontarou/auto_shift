# Shift Auto

Shift Auto は、ローカル完結を基本とした静的 Web アプリです。HTML / CSS / JavaScript のみで動作し、外部ライブラリ、npm install、ネットワークアクセスは使いません。

管理者画面でシフト定義と必要人数を編集し、スタッフ入力画面で曜日別の勤務希望を入力します。同じブラウザ内では localStorage により保存内容を共有できます。

## ファイル構成

- `index.html` - トップページ。管理者画面とスタッフ入力画面へのリンク、保存に関する注意を表示します。
- `admin.html` - 管理者画面。シフト定義、必要人数、スタッフ一覧、シフト生成結果を扱います。
- `staff.html` - スタッフ入力画面。スタッフ選択、曜日別時刻入力、3状態グリッド、希望反映を扱います。
- `style.css` - 3ページ共通のスタイルです。
- `sample-data.js` - 保存済みデータがないときに使う初期データです。
- `shift-core.js` - シフト定義解決、必要人数正規化、希望再計算、シフト生成、時間帯別不足計算などの共通ロジックです。
- `storage.js` - localStorage の読み込み、保存、削除を担当します。
- `admin.js` - 管理者画面専用の DOM 取得、イベント登録、描画処理です。
- `staff.js` - スタッフ入力画面専用の DOM 取得、イベント登録、描画処理です。

## Git / GitHub Pages 前提

- 作業 folder は `C:\codex\shift-auto` です。
- branch は `main` です。
- remote origin は `https://github.com/tsukapontarou/auto_shift.git` です。
- 最新同期済み commit は `1a48505 Initial shift-auto commit` です。
- GitHub Pages と連携済みです。
- ただし GitHub Pages は静的公開の仕組みであり、アプリ内データのサーバー保存ではありません。

## 使い方

1. `index.html` を開き、管理者画面またはスタッフ入力画面へ進みます。
2. `admin.html` でシフト境界時刻と必要人数を編集し、「設定を適用する」を押します。
3. `staff.html` でスタッフを選択し、曜日別の開始/終了時刻または3状態グリッドを編集して「希望を反映する」を押します。
4. 同じブラウザ内では、`admin.html` と `staff.html` が同じ localStorage データを参照します。
5. `admin.html` で「シフト生成」を押すと、現在有効なデータで割り当て結果と不足情報を表示します。

## GitHub Pages での確認

GitHub Pages 上では `https://` の同一サイトとして `index.html`、`admin.html`、`staff.html` を開けます。そのため、`file://` 直開きより localStorage の origin 前提は安定しやすくなります。

ただし、localStorage の保存データは各ブラウザ内に残るだけです。GitHub repository や GitHub Pages のサーバーには保存されません。GitHub Pages にアプリのコード変更を反映するには、ローカル変更を commit して push する必要があります。

## localStorage の注意

- 保存キーは `shift-auto-data-v1` です。
- localStorage は同じブラウザ内の保存です。
- 別端末・別ブラウザとは共有されません。
- 管理者のPCで保存した内容が、スタッフのスマホへ自動共有されることはありません。
- GitHub repository に保存データを書き戻す仕組みではありません。
- ログイン、認証、権限管理の代わりにはなりません。
- 複数人の本番運用には、将来的にサーバー保存、外部データベース、CSV/JSON 入出力などが必要です。

## まだできないこと

- ログイン
- 権限管理
- サーバー保存
- 複数端末での共有保存
- CSV / Excel 入出力
- スタッフ追加 / 削除
- 1日に複数の時間帯を入力する機能
- exact-time 最適化
- バックトラック探索
- ソルバー導入

## 補足

今回の構成では、`sample-data.js` は初期データとして維持し、localStorage に保存済みデータがないときだけ使います。保存済みデータの JSON 読み込みに失敗した場合や localStorage が使えない場合も、画面が落ちないように `sample-data.js` にフォールバックします。
