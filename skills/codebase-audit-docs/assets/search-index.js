/* 全文検索インデックスの雛形。各ドキュメント作成時に追記していく。
   t=タイトル, u=URL(docsルート相対), c=カテゴリ, k=キーワード(任意), d=補足(任意) */
window.SEARCH_INDEX = [
  {t:'ドキュメントトップ', u:'index.html', c:'はじめに', k:'index top home 目次'},
  {t:'★ 改善ガイド (テックリード)', u:'improvement-guide.html', c:'はじめに', k:'改善 guide 順序 優先度 まとめ'},
  {t:'システム全体構成図', u:'system/overview.html', c:'システム全体', k:'overview 構成'},
  // ページを追加する度にここへ 1 行足す。詳細エントリ(API名/画面名/テーブル名/障害#など)も
  // 同じ配列に足すと「枝葉」まで検索できる。例:
  // {t:'API: members/login', u:'server/api-detail.html', c:'API', k:'login 認証 token'},
];
