# さんすうアドベンチャー（子ども向け算数ドリルゲーム）

スマホで遊べる算数学習ゲームです。たしざん・ひきざん・かけざん・わりざんを選んで学べます。
記録はGoogleスプレッドシートに保存します。

- 対象スプレッドシート: https://docs.google.com/spreadsheets/d/1l8irkp6kqBgWXtoPgYjjH6Ek7mnRGjoM5Ay4gVGGx64/edit

## 主な機能

| 機能 | 内容 |
|---|---|
| けいさん選択 | たしざん / ひきざん / かけざん / わりざん |
| レベル | 各3段階（スプレッドシートの `settings` シートで変更・追加できます） |
| モード | 📝 ドリル（時間制限なし）／ ⏱️ チャレンジ（制限時間あり。残り時間がボーナス） |
| ゲーム要素 | 連続正解コンボボーナス、星3段階評価、効果音、ランキング（上位5人）、紙吹雪 |
| 学習 | 間違えた問題を結果画面で復習表示し、`mistakes` シートに記録 |
| 入力 | 大きな数字パッド（スマホ向け、キーボード不要） |

ひきざんは答えがマイナスにならず、わりざんは必ず割り切れる問題だけを出題します。

## セットアップ（Google Apps Script）

1. スプレッドシートを開き「拡張機能 → Apps Script」
2. `Code.gs` の内容を貼り付け、「ファイル追加 → HTML」で `index` という名前のファイルを作り `index.html` の内容を貼り付け
3. 関数 `setup` を選んで一度だけ実行（権限を承認）。次の4シートが作成されます
4. 「デプロイ → 新しいデプロイ → 種類: ウェブアプリ」
   - 次のユーザーとして実行: 自分
   - アクセスできるユーザー: 全員（家族だけで使う場合は運用に合わせて設定）
5. 発行されたURLをスマホで開き、「ホーム画面に追加」するとアプリのように使えます

## スプレッドシートの構成

| シート | 用途 | 列 |
|---|---|---|
| `settings` | 問題設定（保護者が編集） | op, level, label, a_min, a_max, b_min, b_max, questions, time_limit_sec |
| `players` | 子どもの名前 | id, name, created_at |
| `results` | プレイ結果 | timestamp, player_id, player_name, op, level, mode, correct, total, score, max_combo, time_sec, stars |
| `mistakes` | 間違えた問題 | timestamp, player_id, player_name, op, level, question, answer, user_answer |

`settings` の数値の意味:

- `add` / `mul`: a（a_min〜a_max）＋/× b（b_min〜b_max）
- `sub`: 2つの数をそれぞれの範囲から作り、大きい方から小さい方を引く
- `div`: b がわる数、a が答え（商）。`(a×b) ÷ b = a`

## その他の動かし方

- `index.html` 冒頭の `GAS_URL` にウェブアプリURLを設定すると、GitHub Pages など別の場所に置いた `index.html` からも記録できます
- どちらにも接続していない場合はオフラインモードになり、端末内（localStorage）に記録します
