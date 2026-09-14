/* codebase-audit-docs 共通スクリプト: サイドバー生成・全文検索・モバイル対応
   リンクは各ページからの相対パス(ルート=./ , サブディレクトリ=../)。file:// でも配信でも動作。
   ★使い方: 下の NAV を対象プロジェクトのページ構成に合わせて編集する。u はルート相対 (例 'infra/overview.html')。 */
(function () {
  // ===== ナビゲーション構造(★ここを対象に合わせて編集) =====
  var NAV = [
    { title: 'はじめに', items: [
      { t: 'ドキュメントトップ', u: 'index.html' },
      { t: '★ 改善ガイド (テックリード)', u: 'improvement-guide.html' },
    ]},
    { title: 'システム全体', items: [
      { t: 'システム全体構成図', u: 'system/overview.html' },
      { t: 'システムアーキテクチャ', u: 'system/architecture.html' },
    ]},
    // { title: 'サーバ', items: [ ... ] },
    // { title: 'アプリ', items: [ ... ] },
    // { title: 'AWSインフラ', items: [ ... ] },
    // { title: '品質 / セキュリティ', items: [ ... ] },
  ];

  // 現在ページを NAV の u に対する末尾一致で特定 (ホスト場所に依存しない)
  var path = location.pathname;
  if (path === '' || path.charAt(path.length - 1) === '/') path += 'index.html';
  var allU = [];
  NAV.forEach(function (g) { g.items.forEach(function (it) { allU.push(it.u); }); });
  var cur = 'index.html', bestLen = -1;
  allU.forEach(function (u) {
    if (path.length >= u.length && path.slice(-u.length) === u && u.length > bestLen) { cur = u; bestLen = u.length; }
  });
  var depth = (cur.match(/\//g) || []).length;
  var ROOT = depth === 0 ? './' : new Array(depth + 1).join('../');

  var side = document.getElementById('sidebar');
  if (side) {
    var html = '';
    html += '<div class="brand"><a href="' + ROOT + 'index.html">' +
      '<div class="logo"><span class="dot">DOC</span> System Docs</div>' +
      '<div class="sub">リバースエンジニアリング仕様書</div></a></div>';
    html += '<div class="search-box"><input type="text" id="q" placeholder="🔍 検索 (画面名/API/テーブル…)" autocomplete="off"></div>';
    html += '<div id="search-results"></div><nav class="tree">';
    NAV.forEach(function (g) {
      html += '<div class="group"><div class="group-title">' + g.title + '</div>';
      g.items.forEach(function (it) {
        var active = (cur === it.u) ? ' active' : '';
        html += '<a class="' + (it.sub ? 'sub-item' : '') + active + '" href="' + ROOT + it.u + '">' + it.t + '</a>';
      });
      html += '</div>';
    });
    html += '</nav>';
    side.innerHTML = html;
  }

  var mbar = document.createElement('div');
  mbar.className = 'mobile-bar';
  mbar.innerHTML = '<button id="menu-btn">☰</button><span class="t">System Docs</span>';
  document.body.insertBefore(mbar, document.body.firstChild);
  document.getElementById('menu-btn').addEventListener('click', function () { side.classList.toggle('open'); });

  var q = document.getElementById('q');
  var box = document.getElementById('search-results');
  function render(list) {
    if (!list.length) { box.innerHTML = '<div class="none">該当なし</div>'; box.classList.add('active'); return; }
    box.innerHTML = list.slice(0, 40).map(function (r) {
      return '<a href="' + ROOT + r.u + '">' + r.t + '<span class="cat">' + r.c + (r.d ? ' — ' + r.d : '') + '</span></a>';
    }).join('');
    box.classList.add('active');
  }
  if (q) {
    q.addEventListener('input', function () {
      var v = q.value.trim().toLowerCase();
      if (!v) { box.classList.remove('active'); box.innerHTML = ''; return; }
      var idx = window.SEARCH_INDEX || [];
      render(idx.filter(function (r) {
        return (r.t + ' ' + r.c + ' ' + (r.k || '') + ' ' + (r.d || '')).toLowerCase().indexOf(v) !== -1;
      }));
    });
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var a = box.querySelector('a'); if (a) location.href = a.href; } });
    document.addEventListener('click', function (e) { if (!box.contains(e.target) && e.target !== q) box.classList.remove('active'); });
  }
})();
