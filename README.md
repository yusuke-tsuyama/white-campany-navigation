# 企業分析アプリ MVP

口コミスクショ × EDINET IR書類 で企業のホワイト度を分析するPWAアプリ。

## セットアップ手順

### 1. インストール

```bash
npm install next react react-dom @anthropic-ai/sdk unzipper @supabase/supabase-js @supabase/ssr
```

### 2. 環境変数

`.env.local` を開いて各キーを設定してください。

```
ANTHROPIC_API_KEY=...
EDINET_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### 3. Supabase SQL

Supabase ダッシュボード > SQL Editor で以下を実行：

```sql
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text,
  screenshot_extracted jsonb not null,
  image_score jsonb not null,
  ir_summary text,
  final_judge jsonb,
  created_at timestamptz not null default now()
);

alter table public.analyses enable row level security;

create policy "users can view own analyses"
on public.analyses for select to authenticated
using (auth.uid() = user_id);

create policy "users can insert own analyses"
on public.analyses for insert to authenticated
with check (auth.uid() = user_id);

create policy "users can delete own analyses"
on public.analyses for delete to authenticated
using (auth.uid() = user_id);
```

### 4. PWAアイコン（任意）

`public/icons/` に以下の2ファイルを置くとホーム画面追加時にアイコンが表示されます：
- `icon-192.png`（192×192px）
- `icon-512.png`（512×512px）

### 5. 起動

```bash
npm run dev
```

## 使い方

1. メールアドレスでログイン（マジックリンク）
2. OpenWorkなどのスクショをタップして選択
3. 「分析する」→ AI がスコアを算出
4. EDINET でIR書類を検索・要約
5. 口コミ＋IRで最終判定
6. 診断を保存 → 履歴で振り返り

## PWAとしてスマホに追加

Chromeでサイトを開き「ホーム画面に追加」するとアプリとして起動できます。
