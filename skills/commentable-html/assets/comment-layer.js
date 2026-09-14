/* ------------------------------------------------------------------
   コメントレイヤー — 画面の任意の場所にピンを刺して、JSONで持ち出す。
   外部依存なし。file:// でそのまま動く。保存先は localStorage。

   狙いは「JSONを渡せば、どこを直せばいいかが分かる」こと。
   そのため座標だけでなく、刺した先の要素の素性
   （生成元データの位置 data-src / 役割 / ステップ番号 / ラベル / 前後の関係）
   を一緒に書き出す。座標は、要素が見つからなかったときの保険として持つ。

   ページ側は window.CMT_DOC で自分の素性を申告できる（任意）:
     window.CMT_DOC = { file:'docs/sequence.html', generator:'tools/sequence/build.mjs', ... }
   ------------------------------------------------------------------ */
(() => {
  'use strict';
  if (window.__cmtLayer) return;

  const DOC = Object.assign(
    { file: location.pathname.replace(/^.*\/(?=[^/]*$)/, ''), generator: null, dataSource: null },
    window.CMT_DOC || {},
  );
  const KEY = 'ui-comments:' + DOC.file;
  const CLIP = 200;

  /**
   * 打点対象として意味のある単位。ここまで遡って「何に付けたか」を決める。
   * 特定ページのclass名には依存させない。印を付けたい単位がある場合は、
   * ページ側が data-src / data-role を振ることで明示する。
   */
  const SEMANTIC = [
    '[data-src]', '[data-role]', '[data-cmt]',
    'td', 'th', 'tr', 'li', 'dt', 'dd', 'figure', 'figcaption', 'table', 'blockquote', 'pre', 'code',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'button', 'a[href]', 'img', 'svg', 'label', 'legend',
    'summary', 'section', 'article', 'aside', 'nav', 'header', 'footer', 'form', 'fieldset', 'details',
  ].join(',');

  const state = {
    comments: [],
    seq: 0,
    author: '',
    picking: false,
    activeId: null,
    pop: null,
    drag: null,
  };

  // ---------- 保存 ----------
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || '{}');
      state.comments = Array.isArray(d.comments) ? d.comments : [];
      state.seq = d.seq || state.comments.length;
      state.author = d.author || '';
    } catch {
      /* 壊れていたら空で始める */
    }
  }
  function save() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ comments: state.comments, seq: state.seq, author: state.author }),
      );
    } catch {
      /* 容量超過などは無視（画面上の状態は保つ） */
    }
  }

  // ---------- DOM組み立ての小道具 ----------
  const h = (tag, props = {}, kids = []) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of [].concat(kids)) if (kid) el.append(kid);
    return el;
  };
  const clip = (s, n = CLIP) => {
    const t = String(s || '')
      .replace(/\s+/g, ' ')
      .trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  };

  // ---------- 打点先の同定 ----------

  /** 要素を一意に指せるセレクタ。data-src があればそれが最も安定する。 */
  function selectorFor(el) {
    if (!el || el === document.body) return 'body';
    if (el.dataset && el.dataset.src) {
      const s = `[data-src="${el.dataset.src}"]`;
      if (document.querySelectorAll(s).length === 1) return s;
    }
    if (el.id) {
      const s = '#' + CSS.escape(el.id);
      if (document.querySelectorAll(s).length === 1) return s;
    }
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body && parts.length < 10) {
      if (cur.dataset && cur.dataset.src) {
        parts.unshift(`[data-src="${cur.dataset.src}"]`);
        break;
      }
      if (cur.id) {
        parts.unshift('#' + CSS.escape(cur.id));
        break;
      }
      const parent = cur.parentElement;
      if (!parent) break;
      const kin = [...parent.children].filter((c) => c.tagName === cur.tagName);
      const name = cur.tagName.toLowerCase();
      parts.unshift(kin.length > 1 ? `${name}:nth-of-type(${kin.indexOf(cur) + 1})` : name);
      cur = parent;
    }
    return parts.join(' > ') || 'body';
  }

  /**
   * そのページの中で、この要素がどの区画にあるか。
   * 節の見出しを拾う。見出しが無ければ aria-label / data-section を使う。
   */
  function sectionOf(el) {
    if (!el.closest) return null;
    for (const sec of ancestors(el, 'section,article,aside,main,form,details,figure')) {
      const named = sec.dataset?.section || sec.getAttribute?.('aria-label');
      if (named) return clip(named, 80);
      // 節の最初の見出しではなく、その要素より前にある最も近い見出しを使う。
      // 見出しが並ぶページで、いつも先頭の見出しが区画名になってしまうため。
      const head = nearestHeadingBefore(el, sec);
      if (head) return clip(head.textContent, 80);
    }
    return null;
  }

  function nearestHeadingBefore(el, root) {
    let best = null;
    for (const h of root.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,figcaption')) {
      if (h === el || h.contains(el) || el.contains(h)) continue;
      // h が el より前にあるか（el が h に後続しているか）
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = h;
    }
    return best;
  }

  function ancestors(el, selector) {
    const out = [];
    let cur = el.closest(selector);
    while (cur && out.length < 4) {
      out.push(cur);
      cur = cur.parentElement?.closest(selector) ?? null;
    }
    return out;
  }

  /**
   * 表のセルなど、それ自体には生成元が無い要素のための位置づけ。
   * 「page.costTable 行4 列2」のように、囲んでいる生成元からの相対位置で言う。
   */
  function describeWithin(el, owner) {
    const tr = el.closest('tr');
    if (tr && owner.contains(tr)) {
      const cell = el.closest('td,th');
      const col = cell ? ` 列${[...tr.children].indexOf(cell) + 1}` : '';
      // owner 自身が行なら、行番号は言わない（owner が既にその行を指している）
      if (owner === tr) return col;
      const ri = [...owner.querySelectorAll('tr')].indexOf(tr);
      return `${ri >= 0 ? ` 行${ri + 1}` : ''}${col}`;
    }
    const li = el.closest('li');
    if (li && owner.contains(li) && owner !== li) {
      return ` 項目${[...owner.querySelectorAll('li')].indexOf(li) + 1}`;
    }
    return '';
  }

  /** 一覧に出す短い表題（区画名まで入れると全部同じ頭になって読めない） */
  function shortHint(t) {
    if (t.role === 'message') return `ステップ${t.step} ${clip(t.label, 26)}`;
    if (t.role === 'actor') return `アクター ${t.actor}`;
    if (t.role === 'group') return `${t.group}枠 ${clip(t.cond || t.label, 22)}`;
    if (t.role === 'note') return `補足 ${clip(t.label, 24)}`;
    // role は既定で text / section が入るので、ページが名付けたものだけ表に出す
    if (t.role && t.role !== 'text' && t.role !== 'section') {
      return `${t.role} ${clip(t.label || t.text, 24)}`;
    }
    return `${TAG_JA[t.tag] ?? t.tag} ${clip(t.text, 24)}`;
  }

  const TAG_JA = {
    h1: '見出し', h2: '見出し', h3: '見出し', h4: '見出し', h5: '見出し', h6: '見出し',
    p: '本文', li: '項目', td: 'セル', th: '見出しセル', tr: '行', table: '表',
    figure: '図', img: '画像', svg: '図', pre: 'コード', code: 'コード',
    button: 'ボタン', a: 'リンク', label: 'ラベル', section: '節', article: '記事',
    blockquote: '引用', summary: '見出し', details: '折りたたみ',
  };

  /** 人間にもAIにも読める一行 */
  function hintOf(t) {
    const head = t.section ? `${t.section} / ` : '';
    if (t.role === 'message') {
      const arrow = t.from === t.to ? `${t.from} 自身の処理` : `${t.from} → ${t.to}`;
      return `${head}ステップ${t.step}「${t.label}」（${arrow}）`;
    }
    if (t.role === 'group') return `${head}${t.group}枠「${t.label}${t.cond ? ' / ' + t.cond : ''}」`;
    if (t.role === 'actor') return `${head}アクター「${t.actor}」`;
    if (t.role === 'note') return `${head}補足「${t.label}」`;
    // ページが名付けた role があればそれを使う。無ければタグ名を日本語に置く。
    const name =
      t.role && t.role !== 'text' && t.role !== 'section' ? t.role : (TAG_JA[t.tag] ?? t.tag);
    return `${head}${name}「${clip(t.label || t.text, 70)}」`;
  }

  /**
   * 画面座標 → 「何の上か」。
   * 実際に当たった要素と、意味のある単位まで遡った要素の両方を記録する。
   * 位置は要素ボックス内の比率で持つので、画面幅が変わってもピンは追従する。
   */
  const UI = '#cmt-bar,#cmt-panel,#cmt-modal,.cmt-pop,.cmt-pin,#cmt-layer';

  function describeAt(clientX, clientY) {
    // ピンを掴んで動かしている最中は、掴んでいるピン自身が真下に居る。
    // elementFromPoint だとそれを拾ってしまうので、重なりを全部見て
    // コメントUI以外の最前面を対象にする。
    const hit = document
      .elementsFromPoint(clientX, clientY)
      .find((el) => !el.closest(UI) && el !== document.documentElement && el !== document.body);
    if (!hit) return null;

    // ページが data-src / data-role で名付けた単位があれば、それを打点先にする。
    // タグだけで遡ると、カードの中の見出しのような「内訳」が対象になってしまう。
    // ただし表のセルや箇条書きの項目は、印より細かく指せたほうが役に立つので残す。
    const marked = hit.closest('[data-src],[data-role],[data-cmt]');
    let anchor = hit.closest(SEMANTIC) || hit;
    if (marked && marked !== anchor && marked.contains(anchor)) {
      const repeated = hit.closest('td,th,tr,li,dt,dd');
      anchor = repeated && repeated !== marked && marked.contains(repeated) ? repeated : marked;
    }
    const d = anchor.dataset || {};
    const box = anchor.getBoundingClientRect();

    // 自分に生成元が無ければ、囲んでいる要素のものを相対位置つきで引き継ぐ
    const owner = anchor.closest('[data-src]');
    const source = d.src || (owner ? owner.dataset.src + describeWithin(anchor, owner) : null);
    const sourceFile =
      d.srcFile || owner?.dataset.srcFile || (source ? DOC.dataSource : null);

    const target = {
      role: d.role || (anchor.tagName === 'SECTION' ? 'section' : 'text'),
      tag: anchor.tagName.toLowerCase(),
      section: sectionOf(anchor),
      // 生成元データの位置。これがあれば、直すべき行が一意に決まる。
      source,
      sourceFile,
      diagram: anchor.closest('[data-diagram]')?.dataset.diagram || null,
      step: d.step ? Number(d.step) : null,
      label: d.label || d.actor || null,
      from: d.from || null,
      to: d.to || null,
      kind: d.kind || null,
      tone: d.tone || null,
      group: d.group || null,
      cond: d.cond || null,
      actor: d.actor || null,
      selector: selectorFor(anchor),
      hitSelector: hit === anchor ? null : selectorFor(hit),
      text: clip(anchor.textContent),
    };
    if (!target.label && target.text) target.label = clip(target.text, 60);
    target.hint = hintOf(target);
    target.shortHint = shortHint(target);

    const position = {
      // 要素ボックス内の相対位置（0〜1）。再描画時はこれで復元する。
      rx: box.width ? +((clientX - box.left) / box.width).toFixed(4) : 0.5,
      ry: box.height ? +((clientY - box.top) / box.height).toFixed(4) : 0.5,
      // 要素が見つからなかったときの保険
      page: { x: Math.round(clientX + scrollX), y: Math.round(clientY + scrollY) },
      elementBox: {
        x: Math.round(box.left + scrollX),
        y: Math.round(box.top + scrollY),
        w: Math.round(box.width),
        h: Math.round(box.height),
      },
      capturedViewport: { w: innerWidth, h: innerHeight },
    };
    return { target, position, anchor };
  }

  /** 保存済みコメント → いまの画面上のドキュメント座標 */
  function locate(c) {
    let el = null;
    try {
      el = c.target.selector ? document.querySelector(c.target.selector) : null;
    } catch {
      el = null;
    }
    if (!el && c.target.source) el = document.querySelector(`[data-src="${c.target.source}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      return {
        x: r.left + scrollX + c.position.rx * r.width,
        y: r.top + scrollY + c.position.ry * r.height,
        orphan: false,
      };
    }
    return { x: c.position.page.x, y: c.position.page.y, orphan: true };
  }

  // ---------- 画面 ----------
  const layer = h('div', { id: 'cmt-layer' });
  const aim = h('i', { id: 'cmt-aim', style: 'display:none' });
  const panel = h('aside', { id: 'cmt-panel', 'aria-label': 'コメント一覧' });
  const bar = h('div', { id: 'cmt-bar' });

  const pinBtn = h('button', {
    class: 'cmt-btn pri',
    type: 'button',
    'aria-pressed': 'false',
    text: '💬 コメント',
    title: 'クリックで打点モード（C）',
    onclick: () => setPicking(!state.picking),
  });
  const countEl = h('span', { id: 'cmt-count', text: '0' });
  const listBtn = h('button', {
    class: 'cmt-btn',
    type: 'button',
    text: '一覧',
    onclick: () => panel.classList.toggle('open'),
  });
  const outBtn = h('button', {
    class: 'cmt-btn',
    type: 'button',
    text: 'JSON',
    onclick: openExport,
  });
  bar.append(pinBtn, countEl, listBtn, outBtn);

  const listEl = h('div', { class: 'list' });
  panel.append(
    h('header', {}, [
      h('b', { text: 'コメント' }),
      h('span', { class: 'sp', style: 'margin-left:auto' }),
      h('button', {
        class: 'cmt-btn ico',
        type: 'button',
        text: '✕',
        title: '閉じる',
        onclick: () => panel.classList.remove('open'),
      }),
    ]),
    listEl,
    h('footer', {}, [
      h('button', { class: 'cmt-btn pri', type: 'button', text: 'JSONを書き出す', onclick: openExport }),
      h('button', { class: 'cmt-btn', type: 'button', text: '読み込む', onclick: openImport }),
      h('button', {
        class: 'cmt-btn dgr',
        type: 'button',
        text: '全消去',
        onclick: () => {
          if (!state.comments.length) return;
          if (!confirm(`${state.comments.length}件のコメントを削除します。よろしいですか。`)) return;
          state.comments = [];
          state.seq = 0;
          save();
          render();
        },
      }),
    ]),
  );

  document.body.append(layer, aim, panel, bar);

  // ---------- 打点モード ----------
  function setPicking(on) {
    state.picking = on;
    pinBtn.setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('cmt-picking', on);
    if (!on) aim.style.display = 'none';
  }

  document.addEventListener(
    'mousemove',
    (e) => {
      if (!state.picking || state.pop?.dataset.kind === 'composer') return;
      const found = describeAt(e.clientX, e.clientY);
      if (!found) {
        aim.style.display = 'none';
        return;
      }
      const r = found.anchor.getBoundingClientRect();
      Object.assign(aim.style, {
        display: 'block',
        left: r.left + scrollX + 'px',
        top: r.top + scrollY + 'px',
        width: r.width + 'px',
        height: r.height + 'px',
      });
      aim.dataset.hint = found.target.hint;
    },
    true,
  );

  document.addEventListener(
    'click',
    (e) => {
      if (!state.picking) return;
      if (e.target.closest && e.target.closest('#cmt-bar,#cmt-panel,#cmt-modal,.cmt-pop')) return;
      // 書きかけの吹き出しがある間は打たない（入力を失わせないため）。
      // 閲覧中の吹き出しなら、閉じて新しい打点に進む。
      if (state.pop?.dataset.kind === 'composer') return;
      const found = describeAt(e.clientX, e.clientY);
      if (!found) return;
      e.preventDefault();
      e.stopPropagation();
      openComposer(found); // 打点モードは解除しない（続けて打てるように）
    },
    true,
  );

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === 'Escape') {
      // 開いているものから順に閉じる。最後にモードを抜ける。
      const modal = document.getElementById('cmt-modal');
      if (modal) return void modal.remove();
      if (state.pop) return void closePop();
      setPicking(false);
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'c' || e.key === 'C') setPicking(!state.picking);
  });

  // ---------- 吹き出し ----------
  function closePop() {
    state.pop?.remove();
    state.pop = null;
    layer.querySelector('.cmt-pin.draft')?.remove();
    state.activeId = null;
    layer.querySelectorAll('.cmt-pin.is-active').forEach((p) => p.classList.remove('is-active'));
    listEl.querySelectorAll('.is-active').forEach((p) => p.classList.remove('is-active'));
  }

  /** 吹き出しをヘッダで掴んで動かす（対象が隠れて見えないときのため） */
  function makeDraggable(pop, handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      const sx = e.clientX;
      const sy = e.clientY;
      const x0 = parseFloat(pop.style.left) || 0;
      const y0 = parseFloat(pop.style.top) || 0;
      handle.setPointerCapture(e.pointerId);
      pop.dataset.moved = '1';
      const move = (ev) => {
        pop.style.left = x0 + (ev.clientX - sx) + 'px';
        pop.style.top = y0 + (ev.clientY - sy) + 'px';
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  function placePop(pop, x, y) {
    layer.append(pop);
    const w = pop.offsetWidth;
    const hgt = pop.offsetHeight;
    let left = x + 18;
    if (left + w > scrollX + innerWidth - 12) left = Math.max(scrollX + 12, x - w - 8);
    let top = y - 12;
    if (top + hgt > scrollY + innerHeight - 12) top = Math.max(scrollY + 12, scrollY + innerHeight - hgt - 12);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    const head = pop.querySelector('header');
    if (head) makeDraggable(pop, head);
  }

  function targetCard(t) {
    return h('div', { class: 'cmt-tgt' }, [
      h('code', { text: t.source ? t.source : t.selector }),
      h('span', { text: t.hint }),
    ]);
  }

  /** 新規作成 */
  function openComposer(found) {
    closePop();
    const { target, position } = found;

    // 狙い枠は用が済んだので消す。代わりに、どこに刺そうとしているかを
    // 点線のピンで残す（吹き出しを動かしても打点位置が分かるように）。
    aim.style.display = 'none';
    layer.append(
      h('i', {
        class: 'cmt-pin draft',
        text: '+',
        style: `left:${position.page.x}px;top:${position.page.y}px`,
      }),
    );

    const ta = h('textarea', { placeholder: '気づいたことを書いてください（⌘/Ctrl + Enter で保存）' });
    const who = h('input', { type: 'text', placeholder: '名前（任意）', value: state.author });

    const submit = () => {
      const body = ta.value.trim();
      if (!body) {
        ta.focus();
        return;
      }
      state.seq += 1;
      state.author = who.value.trim();
      state.comments.push({
        id: 'c' + state.seq,
        number: state.seq,
        createdAt: new Date().toISOString(),
        author: state.author || null,
        status: 'open',
        body,
        replies: [],
        target,
        position,
      });
      save();
      render();
      closePop();
    };

    const pop = h('div', { class: 'cmt-pop', 'data-kind': 'composer' }, [
      h('header', {}, [
        h('span', { class: 'cmt-grip', 'aria-hidden': 'true', text: '⠿' }),
        h('b', { text: '新しいコメント' }),
        h('button', { class: 'cmt-btn ico cmt-x', type: 'button', text: '✕', onclick: closePop }),
      ]),
      targetCard(target),
      h('div', { class: 'cmt-body' }, [ta, who]),
      h('div', { class: 'cmt-acts' }, [
        h('button', { class: 'cmt-btn pri', type: 'button', text: '保存', onclick: submit }),
        h('button', { class: 'cmt-btn', type: 'button', text: '取消', onclick: closePop }),
      ]),
    ]);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    });
    placePop(pop, position.page.x, position.page.y);
    state.pop = pop;
    ta.focus();
  }

  /** 既存コメントを開く */
  function openThread(c) {
    closePop();
    state.activeId = c.id;
    const at = locate(c);

    const replyTa = h('textarea', { placeholder: '返信（任意）', style: 'min-height:56px' });
    const addReply = () => {
      const body = replyTa.value.trim();
      if (!body) return;
      c.replies.push({ at: new Date().toISOString(), author: state.author || null, body });
      save();
      render();
      openThread(c);
    };

    const pop = h('div', { class: 'cmt-pop', 'data-kind': 'thread' }, [
      h('header', {}, [
        h('span', { class: 'cmt-grip', 'aria-hidden': 'true', text: '⠿' }),
        h('b', { text: `#${c.number}` }),
        h('span', {
          style: 'font:11px var(--c-mono);color:var(--c-muted)',
          text: c.status === 'resolved' ? '解決済み' : '未対応',
        }),
        h('button', { class: 'cmt-btn ico cmt-x', type: 'button', text: '✕', onclick: closePop }),
      ]),
      targetCard(c.target),
      h('div', { class: 'cmt-body' }, [
        h('div', {
          class: 'cmt-meta',
          text: `${c.author || '匿名'} · ${new Date(c.createdAt).toLocaleString('ja-JP')}`,
        }),
        h('div', { class: 'cmt-msg', text: c.body }),
        ...c.replies.map((r) =>
          h('div', { class: 'cmt-reply' }, [
            h('div', {
              class: 'cmt-meta',
              text: `${r.author || '匿名'} · ${new Date(r.at).toLocaleString('ja-JP')}`,
            }),
            h('div', { class: 'cmt-msg', text: r.body }),
          ]),
        ),
        h('div', { class: 'cmt-reply' }, [replyTa]),
      ]),
      h('div', { class: 'cmt-acts' }, [
        h('button', { class: 'cmt-btn', type: 'button', text: '返信', onclick: addReply }),
        h('button', {
          class: 'cmt-btn',
          type: 'button',
          text: c.status === 'resolved' ? '未対応に戻す' : '解決にする',
          onclick: () => {
            c.status = c.status === 'resolved' ? 'open' : 'resolved';
            save();
            render();
            openThread(c);
          },
        }),
        h('span', { class: 'sp' }),
        h('button', {
          class: 'cmt-btn dgr',
          type: 'button',
          text: '削除',
          onclick: () => {
            state.comments = state.comments.filter((x) => x.id !== c.id);
            save();
            render();
            closePop();
          },
        }),
      ]),
    ]);
    replyTa.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addReply();
    });
    placePop(pop, at.x, at.y);
    state.pop = pop;
    render();
  }

  // ---------- 描画 ----------
  function render() {
    layer.querySelectorAll('.cmt-pin').forEach((p) => p.remove());
    // 自身の高さがドキュメント高に加算されて膨張するのを防ぐため、測る前に0へ戻す
    layer.style.height = '0px';
    layer.style.height = document.documentElement.scrollHeight + 'px';

    for (const c of state.comments) {
      const at = locate(c);
      const pin = h('button', {
        class: 'cmt-pin' + (c.id === state.activeId ? ' is-active' : ''),
        type: 'button',
        'data-status': c.status,
        'data-orphan': String(at.orphan),
        title: at.orphan ? '対象の要素が見つかりません（座標で表示）' : c.target.hint,
        text: String(c.number),
        style: `left:${at.x}px;top:${at.y}px`,
      });
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.drag && state.drag.moved) return;
        openThread(c);
      });
      pin.addEventListener('pointerdown', (e) => startDrag(e, c, pin));
      layer.append(pin);
    }

    const open = state.comments.filter((c) => c.status !== 'resolved').length;
    countEl.textContent = open === state.comments.length ? String(open) : `${open}/${state.comments.length}`;
    renderList();
  }

  function renderList() {
    listEl.textContent = '';
    if (!state.comments.length) {
      listEl.append(
        h('div', {
          class: 'cmt-empty',
          html:
            'コメントはまだありません。<br><b>コメント</b>を押す（または <b>C</b> キー）と打点モードになります。<br>' +
            '図の矢印・枠・アクター・本文、どこでも指せます。',
        }),
      );
      return;
    }
    for (const c of state.comments) {
      const item = h(
        'div',
        {
          class:
            'cmt-item' +
            (c.status === 'resolved' ? ' resolved' : '') +
            (c.id === state.activeId ? ' is-active' : ''),
          onclick: () => {
            const at = locate(c);
            scrollTo({ top: Math.max(0, at.y - innerHeight / 2), behavior: 'smooth' });
            setTimeout(() => openThread(c), 260);
          },
        },
        [
          h('h4', {}, [
            h('span', { text: `#${c.number}` }),
            h('span', { text: c.target.shortHint || clip(c.target.hint || '', 34) }),
            h('span', { class: 'st', text: c.status === 'resolved' ? 'done' : 'open' }),
          ]),
          h('p', { text: c.body }),
          h('code', { text: c.target.source || c.target.selector }),
        ],
      );
      listEl.append(item);
    }
  }

  // ---------- ピンの付け替え（ドラッグ） ----------
  function startDrag(e, c, pin) {
    if (e.button !== 0) return;
    state.drag = { id: c.id, moved: false };
    pin.setPointerCapture(e.pointerId);

    const move = (ev) => {
      state.drag.moved = true;
      pin.classList.add('is-dragging');
      pin.style.left = ev.clientX + scrollX + 'px';
      pin.style.top = ev.clientY + scrollY + 'px';
      const found = describeAt(ev.clientX, ev.clientY);
      if (found) {
        const r = found.anchor.getBoundingClientRect();
        Object.assign(aim.style, {
          display: 'block',
          left: r.left + scrollX + 'px',
          top: r.top + scrollY + 'px',
          width: r.width + 'px',
          height: r.height + 'px',
        });
        aim.dataset.hint = found.target.hint;
      }
    };
    const up = (ev) => {
      pin.removeEventListener('pointermove', move);
      pin.removeEventListener('pointerup', up);
      aim.style.display = 'none';
      pin.classList.remove('is-dragging');
      if (state.drag.moved) {
        const found = describeAt(ev.clientX, ev.clientY);
        if (found) {
          c.target = found.target;
          c.position = found.position;
          c.movedAt = new Date().toISOString();
          save();
        }
        render();
      }
      setTimeout(() => (state.drag = null), 0);
    };
    pin.addEventListener('pointermove', move);
    pin.addEventListener('pointerup', up);
  }

  // ---------- JSONの受け渡し ----------
  function buildExport() {
    return {
      schema: 'ui-comments/1',
      readme:
        'このJSONは、ページ上に打たれたレビューコメントです。' +
        '各コメントの target.source は生成元データの位置（sourceFile 内）、target.label は該当文字列、' +
        'target.selector は生成後HTML内の位置を指します。' +
        'position は要素ボックス内の相対位置(rx,ry)と、要素が消えた場合の保険としてのページ座標です。' +
        '修正するときは target.source → sourceFile の該当箇所、を第一の手掛かりにしてください。',
      document: {
        title: document.title,
        file: DOC.file,
        url: location.href,
        generator: DOC.generator,
        dataSource: DOC.dataSource,
      },
      exportedAt: new Date().toISOString(),
      environment: {
        viewport: { w: innerWidth, h: innerHeight },
        dpr: devicePixelRatio,
        theme:
          document.documentElement.dataset.theme ||
          (matchMedia('(prefers-color-scheme: dark)').matches ? 'system(dark)' : 'system(light)'),
      },
      summary: {
        total: state.comments.length,
        open: state.comments.filter((c) => c.status !== 'resolved').length,
        resolved: state.comments.filter((c) => c.status === 'resolved').length,
        orphaned: state.comments.filter((c) => locate(c).orphan).length,
      },
      comments: state.comments.map((c) => ({
        ...c,
        resolvedNow: !locate(c).orphan,
      })),
    };
  }

  function modal({ title, hint, value, readOnly, actions }) {
    document.getElementById('cmt-modal')?.remove();
    const ta = h('textarea', { spellcheck: 'false' });
    ta.value = value || '';
    ta.readOnly = !!readOnly;
    const box = h('div', { class: 'box' }, [
      h('header', {}, [
        h('b', { text: title }),
        h('span', { style: 'margin-left:auto' }),
        h('button', {
          class: 'cmt-btn ico',
          type: 'button',
          text: '✕',
          onclick: () => document.getElementById('cmt-modal').remove(),
        }),
      ]),
      hint ? h('div', { class: 'hint', html: hint }) : null,
      ta,
      h('footer', {}, actions(ta)),
    ]);
    const back = h('div', {
      id: 'cmt-modal',
      onclick: (e) => {
        if (e.target.id === 'cmt-modal') back.remove();
      },
    });
    back.append(box);
    document.body.append(back);
    ta.focus();
    // 全選択すると末尾までスクロールしてしまうので先頭に戻す
    if (readOnly) {
      ta.select();
      ta.scrollTop = 0;
    }
    return ta;
  }

  function openExport() {
    const json = JSON.stringify(buildExport(), null, 2);
    const note = h('span', { style: 'font:11px var(--c-mono);color:var(--c-muted)' });
    modal({
      title: `コメントJSON（${state.comments.length}件）`,
      hint:
        'このまま丸ごとAIに渡せます。<b>target.source</b> が生成元データの位置、<b>target.hint</b> が対象の説明です。',
      value: json,
      readOnly: true,
      actions: () => [
        h('button', {
          class: 'cmt-btn pri',
          type: 'button',
          text: 'クリップボードにコピー',
          onclick: async (e) => {
            try {
              await navigator.clipboard.writeText(json);
              note.textContent = 'コピーしました';
            } catch {
              note.textContent = 'コピーできませんでした（本文を選択してください）';
            }
          },
        }),
        h('button', {
          class: 'cmt-btn',
          type: 'button',
          text: 'ファイルに保存',
          onclick: () => {
            const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            const a = h('a', { href: url, download: DOC.file.replace(/\.html?$/, '') + '.comments.json' });
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          },
        }),
        note,
      ],
    });
  }

  function openImport() {
    modal({
      title: 'コメントJSONを読み込む',
      hint: '書き出したJSONを貼り付けてください。いまのコメントは置き換わります。',
      value: '',
      readOnly: false,
      actions: (ta) => [
        h('button', {
          class: 'cmt-btn pri',
          type: 'button',
          text: '読み込む',
          onclick: () => {
            try {
              const d = JSON.parse(ta.value);
              if (!Array.isArray(d.comments)) throw new Error('comments がありません');
              state.comments = d.comments;
              state.seq = Math.max(0, ...d.comments.map((c) => c.number || 0));
              save();
              render();
              document.getElementById('cmt-modal').remove();
            } catch (err) {
              alert('読み込めませんでした: ' + err.message);
            }
          },
        }),
      ],
    });
  }

  // ---------- 追従 ----------
  let raf = 0;
  const reflow = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      // 書きかけは閉じない（幅を変えただけで入力が消えると困る）
      if (state.pop && state.pop.dataset.kind !== 'composer') closePop();
      render();
    });
  };
  addEventListener('resize', reflow);
  document.fonts?.ready.then(reflow);
  new MutationObserver(reflow).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  load();
  render();
  window.__cmtLayer = { export: buildExport, state };
})();
