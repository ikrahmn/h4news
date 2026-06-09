/* ═══════════════════════════════════════
   H4NEWS — app.js  (ES6+ SPA Core)
   Router · State · EventBus · Utils
   ═══════════════════════════════════════ */

'use strict';

/* ── EVENT BUS ── */
const Bus = (() => {
  const _h = {};
  return {
    on:   (e,fn) => (_h[e] ??= []).push(fn),
    off:  (e,fn) => _h[e] = (_h[e]||[]).filter(f=>f!==fn),
    emit: (e,...a) => (_h[e]||[]).forEach(fn=>fn(...a)),
  };
})();

/* ── STATE ── */
const State = (() => {
  const s = {
    theme:     localStorage.getItem('h4-theme') || 'dark',
    bookmarks: JSON.parse(localStorage.getItem('h4-bookmarks') || '[]'),
    reactions: JSON.parse(localStorage.getItem('h4-reactions') || '{}'), // local voted map
    category:  'all',
    articles:  [],       // master index
    loading:   false,
  };
  return {
    get:    k => s[k],
    set(k,v){
      s[k] = v;
      if(k==='theme')     localStorage.setItem('h4-theme',    v);
      if(k==='bookmarks') localStorage.setItem('h4-bookmarks',JSON.stringify(v));
      if(k==='reactions') localStorage.setItem('h4-reactions',JSON.stringify(v));
      Bus.emit('state:'+k, v);
    },
    toggle(k){ this.set(k, !s[k]); },
    bookmarkToggle(id){
      const bm = [...s.bookmarks];
      const i  = bm.indexOf(id);
      i===-1 ? bm.push(id) : bm.splice(i,1);
      this.set('bookmarks', bm);
      return i===-1;
    },
    isBookmarked: id => s.bookmarks.includes(id),
    hasReacted:  (articleId,emoji) => !!(s.reactions[articleId]||{})[emoji],
    markReacted: (articleId,emoji) => {
      const r = {...s.reactions, [articleId]: {...(s.reactions[articleId]||{}), [emoji]: true}};
      State.set('reactions', r);
    },
  };
})();

/* ── ROUTER ── */
const Router = (() => {
  const routes = {};
  const resolve = () => {
    const raw   = location.hash.replace(/^#\/?/,'') || '';
    const [path, qs] = raw.split('?');
    const params = Object.fromEntries(new URLSearchParams(qs||''));
    const handler = routes[path] || routes['404'];
    handler?.(params);
    Bus.emit('route:change', {path, params});
  };
  return {
    on:     (path, fn) => { routes[path] = fn; },
    go:     path => { location.hash = '/' + path; },
    init:   ()   => { window.addEventListener('hashchange', resolve); resolve(); },
    params: ()   => Object.fromEntries(new URLSearchParams(location.hash.split('?')[1]||'')),
  };
})();

/* ── UTILS ── */
const readTime = text => Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200));

const slugify = str => str.toLowerCase()
  .replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-');

const escapeHtml = s =>
  s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const initials = name => name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();

const fmt = {
  date: d => new Intl.DateTimeFormat('en',{month:'short',day:'numeric',year:'numeric'}).format(new Date(d)),
  relDate: d => {
    const diff = Date.now() - new Date(d);
    const m = diff/60000;
    if(m<60)   return `${Math.floor(m)}m ago`;
    if(m<1440) return `${Math.floor(m/60)}h ago`;
    return fmt.date(d);
  },
};

const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];
const el = (tag, props={}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  kids.forEach(k => typeof k==='string' ? e.insertAdjacentHTML('beforeend',k) : k&&e.append(k));
  return e;
};
const toast = (() => {
  const c = el('div',{id:'toast-container'});
  document.body.append(c);
  return (msg, icon='✓') => {
    const t = el('div',{className:'toast'},`<span>${icon}</span> ${escapeHtml(msg)}`);
    c.append(t);
    setTimeout(() => { t.classList.add('exit'); t.addEventListener('animationend',()=>t.remove()); }, 2800);
  };
})();

/* ── DATA LAYER ── */
const API = {
  _cache: new Map(),
  async index(){
    if(this._cache.has('index')) return this._cache.get('index');
    const res = await fetch('index.json');
    const data = await res.json();
    this._cache.set('index', data);
    State.set('articles', data);
    return data;
  },
  async article(id){
    const key = 'article:'+id;
    if(this._cache.has(key)) return this._cache.get(key);
    const res = await fetch(`content/articles/${id}.md`);
    if(!res.ok) throw new Error('Article not found');
    const raw = await res.text();
    const parsed = parseFrontmatter(raw);
    this._cache.set(key, parsed);
    return parsed;
  },
};

function parseFrontmatter(raw){
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if(!match) return { meta: {}, content: raw };
  const meta = {};
  match[1].split('\n').forEach(line => {
    const [k,...v] = line.split(':');
    if(k?.trim()) meta[k.trim()] = v.join(':').trim().replace(/^["']|["']$/g,'');
  });
  return { meta, content: match[2] };
}

/* ── PROGRESS BAR ── */
const ProgressBar = {
  el: null,
  init(){
    this.el = el('div',{id:'progress-bar'});
    document.body.prepend(this.el);
  },
  update(){
    if(!this.el) return;
    const s = document.documentElement;
    const pct = (s.scrollTop / (s.scrollHeight - s.clientHeight)) * 100;
    this.el.style.width = pct + '%';
  },
  reset(){ if(this.el) this.el.style.width='0%'; },
};

/* ── THEME ── */
const Theme = {
  init(){
    document.documentElement.dataset.theme = State.get('theme');
    Bus.on('state:theme', t => {
      document.documentElement.dataset.theme = t;
      $('#theme-toggle')?.setAttribute('aria-label', t==='dark'?'Light mode':'Dark mode');
    });
  },
  toggle(){ State.set('theme', State.get('theme')==='dark'?'light':'dark'); },
  icon: () => State.get('theme')==='dark' ? '🌙' : '☀️',
};

/* ── NAV / HAMBURGER ── */
const Nav = {
  cats: ['all','world','tech','culture','science','opinion'],
  init(){
    this.render();
    this.bindHamburger();
    Bus.on('state:theme', () => { const b = $('#theme-toggle'); if(b) b.textContent = Theme.icon(); });
    Bus.on('route:change', () => { this.setActive(); $('#mobile-menu')?.classList.remove('open'); $('#hamburger')?.classList.remove('open'); });
  },
  render(){
    const nav = $('#navbar');
    if(!nav) return;
    nav.innerHTML = `
      <a href="#/" class="nav-brand">H4News</a>
      <nav class="nav-cats" id="nav-cats" role="navigation" aria-label="Categories">
        ${this.cats.map(c=>`<button class="nav-cat${c==='all'?' active':''}" data-cat="${c}">${c==='all'?'Top Stories':c.charAt(0).toUpperCase()+c.slice(1)}</button>`).join('')}
      </nav>
      <div class="nav-actions">
        <button class="icon-btn" id="bookmarks-btn" title="Bookmarks" onclick="Router.go('bookmarks')">🔖</button>
        <button class="icon-btn" id="theme-toggle" aria-label="Dark mode" onclick="Theme.toggle()">${Theme.icon()}</button>
        <button class="icon-btn hamburger" id="hamburger" aria-label="Menu" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
      </div>`;
    nav.querySelector('#nav-cats').addEventListener('click', e => {
      const btn = e.target.closest('[data-cat]');
      if(!btn) return;
      State.set('category', btn.dataset.cat);
      this.setActive();
      Bus.emit('feed:filter', btn.dataset.cat);
    });
    this.renderMobileMenu();
  },
  renderMobileMenu(){
    const m = el('div',{id:'mobile-menu', role:'dialog', 'aria-modal':'true', 'aria-label':'Navigation menu'});
    m.innerHTML = this.cats.map(c=>
      `<button class="mobile-cat" data-cat="${c}" onclick="State.set('category','${c}');Router.go('');document.getElementById('mobile-menu').classList.remove('open');document.getElementById('hamburger').classList.remove('open');Bus.emit('feed:filter','${c}')">${c==='all'?'Top Stories':c.charAt(0).toUpperCase()+c.slice(1)}</button>`
    ).join('');
    document.body.append(m);
  },
  bindHamburger(){
    document.addEventListener('click', e => {
      const h = e.target.closest('#hamburger');
      if(!h) return;
      const open = h.classList.toggle('open');
      document.getElementById('mobile-menu')?.classList.toggle('open', open);
      h.setAttribute('aria-expanded', open);
    });
  },
  setActive(){
    const cat = State.get('category');
    $$('[data-cat]').forEach(b => b.classList.toggle('active', b.dataset.cat===cat));
  },
};

/* ── CARD BUILDER ── */
function buildCard(article, idx){
  const bm  = State.isBookmarked(article.id);
  const cat = article.category?.toLowerCase() || 'general';
  const isSignal = ['breaking','opinion'].includes(cat);

  const card = el('div',{
    className:`card fade-in fade-in-delay-${Math.min(idx%4,3)+1}`,
    role:'article',
    'aria-label': article.title,
  });
  card.dataset.id = article.id;

  card.innerHTML = `
    <div class="card-img-wrap">
      ${article.image
        ? `<img class="card-img" src="${article.image}" alt="${escapeHtml(article.title)}" loading="lazy" decoding="async">`
        : `<div class="card-img-placeholder">${getCatEmoji(cat)}</div>`}
    </div>
    <div class="card-body">
      <div class="card-meta">
        <span class="tag${isSignal?' signal':''}">${cat}</span>
        <span class="read-time">⏱️ ${article.readTime||readTime(article.excerpt||'')} min</span>
      </div>
      <h2 class="card-title line-clamp-2">${escapeHtml(article.title)}</h2>
      ${article.excerpt ? `<p class="card-excerpt line-clamp-3">${escapeHtml(article.excerpt)}</p>` : ''}
    </div>
    <div class="card-footer">
      <div class="author-row">
        <div class="author-avatar" aria-hidden="true">${initials(article.author||'H4')}</div>
        <span>${escapeHtml(article.author||'Staff')} · ${fmt.relDate(article.date)}</span>
      </div>
      <button class="bookmark-btn${bm?' saved':''}" data-id="${article.id}" aria-label="${bm?'Remove bookmark':'Save article'}">
        ${bm?'🔖':'🔗'}
      </button>
    </div>`;

  card.addEventListener('click', e => {
    if(e.target.closest('.bookmark-btn')) return;
    Router.go(`article?id=${article.id}`);
  });

  card.querySelector('.bookmark-btn').addEventListener('click', e => {
    e.stopPropagation();
    const saved = State.bookmarkToggle(article.id);
    const btn = e.currentTarget;
    btn.classList.toggle('saved', saved);
    btn.textContent = saved ? '🔖' : '🔗';
    btn.setAttribute('aria-label', saved?'Remove bookmark':'Save article');
    toast(saved ? 'Saved to bookmarks' : 'Removed from bookmarks', saved?'🔖':'✕');
  });

  return card;
}

const getCatEmoji = cat => ({'tech':'💻','world':'🌍','culture':'🎨','science':'🔬','opinion':'💬','breaking':'🚨'}[cat]||'📰');

/* ── SKELETON LOADER ── */
function renderSkeletons(n=6){
  const grid = $('#cards-grid');
  if(!grid) return;
  grid.innerHTML = Array.from({length:n},()=>`
    <div class="card">
      <div class="skeleton skel-img"></div>
      <div class="card-body">
        <div class="skeleton skel-text short"></div>
        <div class="skeleton skel-text wide"></div>
        <div class="skeleton skel-text wide"></div>
        <div class="skeleton skel-text" style="width:65%"></div>
      </div>
    </div>`).join('');
}

/* ── HOME VIEW ── */
const HomeView = {
  async render(){
    const app = $('#app');
    app.innerHTML = `
      <div id="feed-header">
        <div class="feed-eyebrow">Latest Coverage</div>
        <h1 class="feed-title">What's Happening Now</h1>
      </div>
      <div id="cards-grid" role="feed" aria-busy="true" aria-label="News articles"></div>`;

    renderSkeletons(8);
    ProgressBar.reset();

    try {
      const articles = await API.index();
      this._all = articles;
      this.renderFiltered(State.get('category'));
    } catch(e){
      $('#cards-grid').innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--text-3);padding:4rem">Failed to load feed. <a href="#/" style="color:var(--accent)">Retry</a></p>`;
    }

    Bus.on('feed:filter', cat => this.renderFiltered(cat));
  },
  renderFiltered(cat){
    const grid = $('#cards-grid');
    if(!grid||!this._all) return;
    const list = cat==='all' ? this._all : this._all.filter(a=>a.category?.toLowerCase()===cat);
    grid.setAttribute('aria-busy','false');
    if(!list.length){
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="big-icon">🗞️</div><p>No articles in this category yet.</p></div>`;
      return;
    }
    grid.innerHTML = '';
    list.forEach((a,i) => grid.append(buildCard(a,i)));
  },
  destroy(){ Bus.off('feed:filter', this.renderFiltered); },
};

/* ── ARTICLE VIEW ── */
const ArticleView = {
  async render({id}){
    if(!id){ Router.go(''); return; }
    const app = $('#app');
    app.innerHTML = `<div id="article-view"><div style="animation:none;padding:var(--sp-20) 0;text-align:center;color:var(--text-3)">Loading article…</div></div>`;
    ProgressBar.reset();

    let article, meta;
    try {
      ({content: article, meta} = await API.article(id));
    } catch(e){
      $('#article-view').innerHTML = `<p>Article not found. <a href="#/" style="color:var(--accent)">← Back</a></p>`;
      return;
    }

    const html   = marked.parse(article);
    const rt     = readTime(article);
    const bm     = State.isBookmarked(id);

    $('#article-view').innerHTML = `
      <div class="article-kicker">
        <span class="tag${['breaking','opinion'].includes(meta.category?.toLowerCase())?' signal':''}">${meta.category||'General'}</span>
        ${meta.category||'General'}
      </div>
      <h1 class="article-title">${escapeHtml(meta.title||'Untitled')}</h1>
      ${meta.lead ? `<p class="article-lead">${escapeHtml(meta.lead)}</p>` : ''}
      <div class="article-byline">
        <div class="byline-avatar" aria-hidden="true">${initials(meta.author||'H4')}</div>
        <div class="byline-info">
          <span class="byline-name">${escapeHtml(meta.author||'Staff')}</span>
          <span class="byline-date">${fmt.date(meta.date)} · ⏱️ ${rt} min read</span>
        </div>
        <div class="byline-actions">
          <button class="icon-btn" id="art-bookmark" title="${bm?'Remove':'Save'}" aria-label="${bm?'Remove bookmark':'Save article'}">
            ${bm?'🔖':'🔗'}
          </button>
          <button class="icon-btn" onclick="navigator.share?.({title:'${escapeHtml(meta.title||'')}',url:location.href})||toast('Link copied')" title="Share">🔗</button>
        </div>
      </div>
      ${meta.image ? `<img class="article-hero" src="${meta.image}" alt="${escapeHtml(meta.title||'')}" loading="lazy" decoding="async">` : ''}
      <div class="article-body fade-in">${html}</div>
      <div id="reactions"></div>`;

    // Lazy-load all images in article body
    $$('.article-body img').forEach(img => { img.loading='lazy'; img.decoding='async'; });

    // Bookmark toggle in article
    $('#art-bookmark').addEventListener('click', () => {
      const saved = State.bookmarkToggle(id);
      const btn = $('#art-bookmark');
      btn.textContent = saved?'🔖':'🔗';
      btn.setAttribute('title', saved?'Remove':'Save');
      toast(saved?'Saved to bookmarks':'Removed from bookmarks', saved?'🔖':'✕');
    });

    // Scroll → progress bar
    this._onScroll = () => ProgressBar.update();
    window.addEventListener('scroll', this._onScroll, {passive:true});

    // Reactions
    Reactions.render(id);

    // Text selection popup
    SelectionPopup.bind(id, meta.title);
  },
  destroy(){
    window.removeEventListener('scroll', this._onScroll);
    SelectionPopup.unbind();
    ProgressBar.reset();
  },
};

/* ── BOOKMARKS VIEW ── */
const BookmarksView = {
  async render(){
    const bms = State.get('bookmarks');
    const app = $('#app');
    app.innerHTML = `
      <div id="bookmarks-view">
        <h1 class="bookmarks-header">🔖 Saved Articles</h1>
        <div id="cards-grid" role="feed" aria-label="Bookmarked articles"></div>
      </div>`;

    if(!bms.length){
      $('#cards-grid').innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="big-icon">🔖</div>
          <p>No saved articles yet. Tap 🔗 on any story to bookmark it.</p>
        </div>`;
      return;
    }

    renderSkeletons(bms.length);
    const all = State.get('articles').length ? State.get('articles') : await API.index();
    const saved = all.filter(a => bms.includes(a.id));
    const grid  = $('#cards-grid');
    grid.innerHTML = '';
    saved.forEach((a,i) => grid.append(buildCard(a,i)));
  },
};

/* ── REACTIONS ── */
const Reactions = {
  EMOJIS: [
    {e:'🔥', label:'Fire'},
    {e:'🤯', label:'Mind blown'},
    {e:'👏', label:'Applause'},
  ],
  // CounterAPI.dev public namespace (zero auth, free tier)
  _ns: 'h4news',
  _url: (ns, key) => `https://api.counterapi.dev/v1/${ns}/${encodeURIComponent(key)}`,

  async render(articleId){
    const el = $('#reactions');
    if(!el) return;
    el.innerHTML = '<div style="color:var(--text-3);font-size:var(--t-xs)">Loading reactions…</div>';

    const counts = await Promise.all(this.EMOJIS.map(r => this.get(articleId, r.e)));
    el.innerHTML = this.EMOJIS.map((r,i) => `
      <button class="reaction-btn${State.hasReacted(articleId,r.e)?' reacted':''}"
        data-emoji="${r.e}" data-id="${articleId}"
        aria-label="${r.label}: ${counts[i]} reactions"
        aria-pressed="${State.hasReacted(articleId,r.e)}">
        <span class="emoji">${r.e}</span>
        <span class="count" id="rc-${articleId}-${i}">${counts[i]}</span>
      </button>`).join('');

    el.addEventListener('click', async e => {
      const btn = e.target.closest('.reaction-btn');
      if(!btn || State.hasReacted(articleId, btn.dataset.emoji)) return;
      const {emoji, id:aid} = btn.dataset;
      State.markReacted(aid, emoji);
      btn.classList.add('reacted');
      btn.setAttribute('aria-pressed','true');
      const newCount = await this.increment(aid, emoji);
      btn.querySelector('.count').textContent = newCount;
      btn.style.setProperty('--pulse','1');
      btn.animate([
        {transform:'scale(1.15)',filter:'brightness(1.3)'},
        {transform:'scale(1)', filter:'brightness(1)'}
      ],{duration:400,easing:'cubic-bezier(0.34,1.56,0.64,1)'});
    });
  },

  async get(articleId, emoji){
    try {
      const r = await fetch(this._url(this._ns, `${articleId}-${emoji}`));
      const d = await r.json();
      return d.count ?? 0;
    } catch { return 0; }
  },

  async increment(articleId, emoji){
    try {
      const r = await fetch(this._url(this._ns, `${articleId}-${emoji}`) + '/up');
      const d = await r.json();
      return d.count ?? 0;
    } catch { return 0; }
  },
};

/* ── TEXT SELECTION POPUP ── */
const SelectionPopup = {
  _popup: null,
  _articleId: null,
  _title: null,
  _handler: null,

  bind(articleId, title){
    this._articleId = articleId;
    this._title     = title;
    if(!this._popup){
      this._popup = el('div',{id:'selection-popup', role:'toolbar', 'aria-label':'Text actions'});
      this._popup.innerHTML = `
        <button class="sel-btn" id="sel-copy">📋 Copy Quote</button>
        <button class="sel-btn" id="sel-x">𝕏 Share</button>
        <button class="sel-btn" id="sel-linkedin">in Share</button>`;
      document.body.append(this._popup);
      this._popup.querySelector('#sel-copy').onclick    = () => this._copy();
      this._popup.querySelector('#sel-x').onclick       = () => this._shareX();
      this._popup.querySelector('#sel-linkedin').onclick= () => this._shareLinkedIn();
    }
    this._handler = () => this._onSelect();
    document.addEventListener('mouseup',  this._handler);
    document.addEventListener('touchend', this._handler);
  },

  unbind(){
    if(this._handler){
      document.removeEventListener('mouseup',  this._handler);
      document.removeEventListener('touchend', this._handler);
    }
    this._popup?.classList.remove('visible');
  },

  _text(){ return window.getSelection()?.toString().trim() || ''; },

  _onSelect(){
    const text = this._text();
    const body = document.querySelector('.article-body');
    if(!text || text.length < 3 || !body?.contains(window.getSelection()?.anchorNode)){
      this._popup?.classList.remove('visible'); return;
    }
    const range = window.getSelection().getRangeAt(0).getBoundingClientRect();
    const popup = this._popup;
    popup.style.top  = `${window.scrollY + range.top - popup.offsetHeight - 10}px`;
    popup.style.left = `${Math.max(8, range.left + range.width/2 - popup.offsetWidth/2)}px`;
    popup.classList.add('visible');
  },

  _copy(){
    const text = this._text();
    navigator.clipboard.writeText(`"${text}" — ${this._title} | H4News`);
    toast('Quote copied!','📋');
    this._popup.classList.remove('visible');
    window.getSelection().removeAllRanges();
  },

  _shareX(){
    const text = this._text();
    const url  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`"${text}" — ${this._title}`)}&url=${encodeURIComponent(location.href)}`;
    window.open(url,'_blank','noopener,noreferrer,width=560,height=340');
    this._popup.classList.remove('visible');
  },

  _shareLinkedIn(){
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(location.href)}`;
    window.open(url,'_blank','noopener,noreferrer,width=600,height=480');
    this._popup.classList.remove('visible');
  },
};

/* ── VIEW MANAGER ── */
let _current = null;
function mount(view, params={}){
  _current?.destroy?.();
  _current = view;
  view.render(params);
  window.scrollTo({top:0, behavior:'instant'});
}

/* ── ROUTES ── */
Router.on('',            ()  => mount(HomeView));
Router.on('article',     (p) => mount(ArticleView, p));
Router.on('bookmarks',   ()  => mount(BookmarksView));
Router.on('404',         ()  => {
  $('#app').innerHTML = `<div style="text-align:center;padding:6rem 1rem;"><div style="font-size:4rem">🗞️</div><h2 style="font-family:var(--font-display);font-size:var(--t-3xl)">Page not found</h2><a href="#/" style="color:var(--accent);display:block;margin-top:1rem">← Back to feed</a></div>`;
});

/* ── BOOT ── */
(async function init(){
  // Inject nav skeleton immediately
  document.body.insertAdjacentHTML('afterbegin',`
    <nav id="navbar" role="banner" aria-label="H4News navigation"></nav>
    <div id="progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
  `);

  ProgressBar.init();
  Theme.init();
  Nav.init();

  // Expose to global for inline onclick (minimal surface)
  Object.assign(window, { Router, State, Theme, Bus, toast });

  // Preload index in background
  API.index().catch(()=>{});

  Router.init();
})();
