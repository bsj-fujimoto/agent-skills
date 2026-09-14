/* eli5-form の実装パーツ（動作実績のあるコードをそのまま抜き出したもの）
 *
 * 使い方: この中身を <script> に貼り、ページ側で以下を用意する。
 *   N     … 項目数
 *   T     … 項目タイトルの配列（T[i-1] が #i のタイトル）
 *   KEY   … localStorage のキー（ページごとに変える）
 *   SID   … Claude のセッションID（36文字のUUID）
 *   API   … '/ask'
 *   nmap  … {} 通知の実体を番号で保持する
 *   busy  … false 回答待ちフラグ（多重送信の防止）
 *   #nlist … 通知を積む入れ物の要素
 *
 * 外部ライブラリは読み込まない（file:// でも動くように）。
 */

function esc(t){
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function inline(t){
  t = esc(t);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
        (m,l,u)=> /^(https?:|\/|\.)/.test(u) ? '<a href="'+u+'" target="_blank">'+l+'</a>' : l);
  return t;
}

function md(src){
  const lines = src.replace(/\r/g,'').split('\n');
  let out='', i=0;
  while(i < lines.length){
    const L = lines[i];

    /* コードブロック */
    if(/^```/.test(L)){
      const buf=[]; i++;
      while(i<lines.length && !/^```/.test(lines[i])){ buf.push(lines[i]); i++; }
      i++;
      out += '<pre><code>'+esc(buf.join('\n'))+'</code></pre>';
      continue;
    }
    /* 表 */
    if(/^\s*\|/.test(L) && i+1<lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i+1])){
      const cells = r => r.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
      const head = cells(L); i += 2;
      let body='';
      while(i<lines.length && /^\s*\|/.test(lines[i])){
        body += '<tr>'+cells(lines[i]).map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>'; i++;
      }
      out += '<table><thead><tr>'+head.map(c=>'<th>'+inline(c)+'</th>').join('')
           + '</tr></thead><tbody>'+body+'</tbody></table>';
      continue;
    }
    /* 引用 */
    if(/^>\s?/.test(L)){
      const buf=[];
      while(i<lines.length && /^>\s?/.test(lines[i])){ buf.push(lines[i].replace(/^>\s?/,'')); i++; }
      out += '<blockquote>'+md(buf.join('\n'))+'</blockquote>';
      continue;
    }
    /* 見出し */
    const h = L.match(/^(#{1,6})\s+(.*)$/);
    if(h){ const n=Math.min(h[1].length+2,6); out+='<h'+n+'>'+inline(h[2])+'</h'+n+'>'; i++; continue; }
    /* 箇条書き */
    if(/^\s*[-*+]\s+/.test(L)){
      let li='';
      while(i<lines.length && /^\s*[-*+]\s+/.test(lines[i])){
        li += '<li>'+inline(lines[i].replace(/^\s*[-*+]\s+/,''))+'</li>'; i++;
      }
      out += '<ul>'+li+'</ul>'; continue;
    }
    /* 番号付き */
    if(/^\s*\d+\.\s+/.test(L)){
      let li='';
      while(i<lines.length && /^\s*\d+\.\s+/.test(lines[i])){
        li += '<li>'+inline(lines[i].replace(/^\s*\d+\.\s+/,''))+'</li>'; i++;
      }
      out += '<ol>'+li+'</ol>'; continue;
    }
    /* 区切り線 */
    if(/^\s*---+\s*$/.test(L)){ out+='<hr>'; i++; continue; }
    /* 空行 */
    if(!L.trim()){ i++; continue; }
    /* 段落 */
    const buf=[];
    while(i<lines.length && lines[i].trim()
          && !/^(#{1,6}\s|>|\s*[-*+]\s|\s*\d+\.\s|```|\s*\|)/.test(lines[i])){
      buf.push(lines[i]); i++;
    }
    out += '<p>'+inline(buf.join('\n')).replace(/\n/g,'<br>')+'</p>';
  }
  return out;
}

function notify(i,state){
  const L=document.getElementById('nlist');
  let n=nmap[i];
  if(!n){
    n=document.createElement('button');
    n.className='ni';
    n.onclick=()=>{
      const el=document.getElementById('qa'+i);
      document.getElementById('qb'+i).classList.add('on');
      el.scrollIntoView({behavior:'smooth',block:'center'});
      const card=document.getElementById('q'+i);
      card.classList.add('hl'); setTimeout(()=>card.classList.remove('hl'),1600);
      n.classList.remove('new');
    };
    L.appendChild(n); nmap[i]=n;
  }
  const t = T[i-1] || '';
  const ic = state==='wait' ? '<span class="sp"></span>'
           : state==='done' ? '✅' : '⚠️';
  const st = state==='wait' ? '回答を待っています'
           : state==='done' ? '回答が届きました' : 'エラー';
  n.className='ni '+state+(state==='done'?' new':'');
  n.innerHTML='<span class="ic">'+ic+'</span>'
    +'<span class="tx"><b>#'+i+' '+esc(t.slice(0,22))+(t.length>22?'…':'')+'</b>'
    +'<span class="st">'+st+'</span></span>';
  /* 待機中は消せないようにする（回答が来たら出す） */
  if(state!=='wait'){
    const x=document.createElement('button');
    x.className='nx'; x.textContent='×'; x.title='この通知を消す';
    x.onclick=ev=>{ ev.stopPropagation(); dismiss(i); };
    n.appendChild(x);
  }
  updClear();
}

function dismiss(i){
  const n=nmap[i];
  if(!n) return;
  n.style.transition='.2s'; n.style.opacity='0'; n.style.transform='translateX(14px)';
  setTimeout(()=>{ n.remove(); delete nmap[i]; updClear(); }, 200);
}

function dismissAll(){
  Object.keys(nmap).forEach(i=>{ if(!nmap[i].classList.contains('wait')) dismiss(i); });
}

function updClear(){
  const L=document.getElementById('nlist');
  let c=L.querySelector('.nclear');
  const n=Object.values(nmap).filter(x=>!x.classList.contains('wait')).length;
  if(n>=2){
    if(!c){
      c=document.createElement('button');
      c.className='nclear'; c.textContent='すべて消す';
      c.onclick=dismissAll; L.insertBefore(c, L.firstChild);
    }
  }else if(c){ c.remove(); }
}

function addQA(i,cls,who,text){
  const box=document.getElementById('qa'+i);
  box.classList.add('on');
  const d=document.createElement('div');
  d.className='qa '+cls;
  const h=document.createElement('div'); h.className='who';
  h.innerHTML=who+' <span class="tm">'+nowStr()+'</span>';
  const b=document.createElement('div'); b.className='bd';
  if(cls==='q'){ b.textContent=text; } else { b.innerHTML=md(text); }
  d.appendChild(h); d.appendChild(b); box.appendChild(d);
  return b;
}

function saveQA(i,kind,text){
  try{
    const d=load()||{a:{},c:{}};
    d.qa=d.qa||{}; d.qa[i]=d.qa[i]||[];
    d.qa[i].push({k:kind,t:text,at:Date.now()});
    localStorage.setItem(KEY,JSON.stringify(d)); flash();
  }catch(e){}
}

function flash(){
  const el=document.getElementById('saved');
  el.textContent='✓ 保存しました'; el.classList.add('on');
  clearTimeout(ft); ft=setTimeout(()=>el.classList.remove('on'),1600);
}

/* 質問欄のキー操作を束ねる。
 *
 * 過去に踏んだ不具合を2つ直している。
 *  1. <input> だと改行できない。質問は複数行になることがあるので <textarea> を使う
 *  2. 日本語入力の変換確定 Enter で送信されてしまう。
 *     変換中かどうかは event.isComposing で判定する（keyCode 229 も古い環境向けに見る）。
 *     compositionstart/end も併用するのは、IME によって isComposing が
 *     立たない組み合わせがあるため（Safari + ことえりなど）
 *
 * 操作:
 *   Enter            … 改行
 *   Ctrl/Cmd + Enter … 送信
 *
 * 使い方: 各項目の textarea に対して bindAsk(el, () => ask(i)) を呼ぶ。
 * 入力に合わせて高さを伸ばす（最大 160px）。
 */
function bindAsk(el, send){
  if(!el) return;
  let composing = false;
  el.addEventListener('compositionstart', ()=>{ composing = true; });
  el.addEventListener('compositionend',   ()=>{ composing = false; });
  el.addEventListener('keydown', ev=>{
    if(ev.key !== 'Enter') return;
    /* 変換中の Enter は確定。送信もしないし、ここでは何もしない */
    if(composing || ev.isComposing || ev.keyCode === 229) return;
    /* Ctrl / Cmd + Enter のときだけ送る。素の Enter は改行のまま通す */
    if(ev.ctrlKey || ev.metaKey){ ev.preventDefault(); send(); }
  });
  el.addEventListener('input', ()=>{
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  });
}

/* 回答をファイルに保存する。HTML と JSON の両方を書く。
 *
 * localStorage はブラウザを消すと失われるので、決定事項として残すには
 * ファイルに落とす必要がある。サーバーを --save-dir 付きで起動しておくこと。
 *
 * なぜ HTML も残すか:
 *   JSON は回答だけで、「何を聞かれてどう答えたか」の文脈（論点の本文・出典・
 *   図・AI の見立て）が落ちる。決定の根拠を後から読み返すには、
 *   シートそのものの見た目で残っているほうがよい。
 *
 * HTML は現在の DOM をそのまま固める（凍結版）。
 *   - 回答の選択状態と補足を DOM の属性・中身に焼き付ける（再現のため）
 *   - 入力を readonly / disabled にして、開いても書き換えられないようにする
 *   - 質問欄・保存ボタンなど、サーバーが要る部分は外す
 *   - localStorage への保存も切る（凍結版を開いて原本を汚さないため）
 *   - **回答 JSON を <script type="application/json" id="answers"> に埋め込む**。
 *     HTML 1枚を配ればデータも一緒に渡る（共有しやすさのため）。
 *     取り出す側は JSON.parse(document.getElementById('answers').textContent)
 *
 * 使い方: 「決定として保存」ボタンの onclick から saveToFile('<name>') を呼ぶ。
 */
function buildAnswerJson(name){
  const d = load() || {a:{},c:{}};
  const n = (typeof N === 'number' ? N : 0);
  const items = [];
  for(let i = 1; i <= n; i++){
    const a = (d.a || {})[i], c = (d.c || {})[i], qa = (d.qa || {})[i];
    if(!a && !c && !qa) continue;
    items.push({no:i, title:(typeof T !== 'undefined' ? T[i-1] : ''),
                answer:a || null, note:c || null, qa:qa || []});
  }
  return {saved_at:new Date().toISOString(), page:name, title:document.title,
          total:(typeof N === 'number' ? N : null),
          answered:Object.keys(d.a || {}).length, items:items};
}

function buildFrozenHtml(name){
  const doc = document.documentElement.cloneNode(true);

  /* 回答の状態を DOM に焼き付ける（clone は checked/value を引き継がないため） */
  doc.querySelectorAll('input[type=radio]').forEach(r=>{
    const live = document.querySelector(
      'input[name="'+r.name+'"][value="'+CSS.escape(r.value)+'"]');
    if(live && live.checked) r.setAttribute('checked','checked');
    r.setAttribute('disabled','disabled');
  });
  doc.querySelectorAll('textarea').forEach(t=>{
    const live = t.id ? document.getElementById(t.id) : null;
    if(live) t.textContent = live.value;      /* 属性ではなく中身に入れる */
    t.setAttribute('readonly','readonly');
  });

  /* Claude との質疑は決定の根拠なので残す。入力欄と送信ボタンだけ外す。
     やり取りが無い項目は箱ごと落とす（空の枠が並ぶのを避ける） */
  doc.querySelectorAll('.askrow,.askhint').forEach(el=>el.remove());
  doc.querySelectorAll('.qabox').forEach(el=>{
    if(!el.querySelector('.qa')){ const b=el.closest('.askbox'); (b||el).remove(); return; }
    el.classList.add('on');                 /* 折り畳みを開いた状態で固める */
    const lab = el.parentElement && el.parentElement.querySelector('.lab');
    if(lab) lab.textContent = 'Claude とのやり取り';
  });
  doc.querySelectorAll('.tg').forEach(el=>el.remove());

  /* サーバーが要る部分・操作用の部品を落とす */
  doc.querySelectorAll('#savefile,#nlist').forEach(el=>el.remove());
  doc.querySelectorAll('.bar button,.barin button').forEach(b=>b.remove());

  /* スクリプトを全部外し、凍結版である旨の表示だけ足す */
  doc.querySelectorAll('script').forEach(el=>el.remove());

  const d = load() || {a:{}};
  const answered = Object.keys(d.a || {}).length;
  const banner = doc.ownerDocument.createElement('div');
  banner.setAttribute('style',
    'background:#0f172a;color:#e2e8f0;padding:12px 16px;font-size:13px;line-height:1.7');
  banner.innerHTML = '<b>決定の記録（凍結版）</b> — '
    + new Date().toLocaleString('ja-JP') + ' 時点の回答です。'
    + answered + ' / ' + (typeof N === 'number' ? N : '?') + ' 件回答済み。'
    + '<br>このページは編集できません。入力し直すには元のシートを開いてください。'
    + '<br><button id="dljson" style="margin-top:8px;border:0;background:#4f46e5;color:#fff;'
    + 'border-radius:7px;padding:6px 13px;cursor:pointer;font-family:inherit;font-size:12.5px;'
    + 'font-weight:700">回答データ（JSON）を取り出す</button>'
    + '<span style="margin-left:9px;opacity:.75;font-size:11.6px">'
    + 'このHTMLに埋め込まれています</span>';
  const body = doc.querySelector('body');
  if(body) body.insertBefore(banner, body.firstChild);

  /* 回答 JSON を埋め込む。閉じタグ文字列が本文に現れても壊れないようエスケープする。
     パターンを文字列から組むのは、このファイル自体が <script> の中に貼られるため。
     正規表現リテラルに閉じタグを直接書くと、そこでブロックが終わってしまう */
  const closeTag = '<' + '/script';
  const json = JSON.stringify(buildAnswerJson(name), null, 1)
    .split(closeTag).join('<\\/script');
  const data = doc.ownerDocument.createElement('script');
  data.setAttribute('type', 'application/json');
  data.setAttribute('id', 'answers');
  data.textContent = json;
  if(body) body.appendChild(data);

  /* 取り出しボタンだけは動く必要があるので、小さなスクリプトを1つ足す。
     type="application/json" は実行されないので、これが唯一の実行コード */
  const dl = doc.ownerDocument.createElement('script');
  dl.textContent =
    "document.getElementById('dljson').onclick=function(){" +
    "var t=document.getElementById('answers').textContent;" +
    "var b=new Blob([t],{type:'application/json'});" +
    "var a=document.createElement('a');a.href=URL.createObjectURL(b);" +
    "a.download=" + JSON.stringify(name + '.json') + ";a.click();" +
    "URL.revokeObjectURL(a.href);};";
  if(body) body.appendChild(dl);

  return '<!doctype html>\n' + doc.outerHTML;
}

async function saveToFile(name){
  const btn = document.getElementById('savefile');
  if(btn){ btn.disabled = true; btn.textContent = '保存中…'; }
  const reset = ()=>{ if(btn){ btn.textContent = '決定として保存'; btn.disabled = false; } };
  try{
    const r = await fetch('/save', {method:'POST', headers:{'Content-Type':'application/json'},
      /* 回答は HTML の中に埋め込んであるので、送るのは HTML だけでよい。
         HTML 1枚を配ればデータも一緒に渡る */
      body: JSON.stringify({name:name, html:buildFrozenHtml(name)})});
    const j = await r.json();
    if(j.ok){
      if(btn){ btn.textContent = '✓ 保存しました';
        setTimeout(reset, 2200); }
    }else{
      alert('保存できませんでした: ' + (j.error || '不明なエラー')); reset();
    }
  }catch(e){
    alert('保存できませんでした（サーバーが動いているか確認してください）'); reset();
  }
}
