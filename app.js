let username='';
let profilePic='';
const MAX_CHARS=500;
let messages=[];
let isAdmin = false;
let isMuted = false;
// admin request correlation for diagnostics
const adminReqMap = {};
// client-side block list (hidden locally, stored in localStorage)
let blockedUsers = new Set();
try{ const savedBlocks = JSON.parse(localStorage.getItem('blocked')||'[]'); savedBlocks && savedBlocks.forEach(u=>blockedUsers.add(u)); }catch(e){}

const chatEl=document.getElementById('chat');
const typingEl=document.getElementById('typingIndicator');
const inputBox=document.getElementById('inputBox');
const charCount=document.getElementById('charCount');
const emojiBtn = document.getElementById('emojiBtn');
// create picker container (appended to DOM)
let emojiPicker = null;
const setupScreen=document.getElementById('setupScreen');
const loginBtn=document.getElementById('loginBtn');
const registerBtn=document.getElementById('registerBtn');
const usernameInput=document.getElementById('username');
const passwordInput=document.getElementById('password');
const pfpInput=document.getElementById('pfpUrl');
const errorMsg=document.getElementById('errorMsg');
const onlinePanelEl = document.getElementById('onlinePanel');
const onlineListEl = document.getElementById('onlineList');
const onlineAvatars = {};
try{
    const sname = localStorage.getItem('chat_name');
    const spfp = localStorage.getItem('chat_pfp');
    if(sname) usernameInput.value = sname;
    if(spfp) pfpInput.value = spfp;
}catch(e){}
let _lastSent = 0;

(function setVh(){
    function update(){
        try{
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        }catch(e){}
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
})();

inputBox && inputBox.addEventListener('focus', ()=>{
    setTimeout(()=>{ try{ chatEl.scrollTop = chatEl.scrollHeight; }catch(e){} }, 250);
});

window.addEventListener('load', ()=>{
    try{
        const appEl = document.querySelector('.app');
        if(appEl) setTimeout(()=>appEl.classList.add('show'), 40);
    }catch(e){}
});

let ws;
const SERVER_WS_URL = "ws://cyezf-2607-fb92-2a86-99-e82e-5ef0-6f0b-7d7a.run.pinggy-free.link";
// currently-editing message id
let editingId = null;

function usernameExists(name){
    if(!name) return false;
    try{
        const lower = String(name).toLowerCase();
        for(const k of Object.keys(onlineAvatars||{})){
            if(String(k).toLowerCase() === lower) return true;
        }
    }catch(e){}
    return false;
}
// add import/export buttons for appearance settings
function setupAppearanceImportExport(){
    try{
        const pane = document.getElementById('tab_appearance');
        if(!pane) return;
        // avoid duplicating
        if(document.getElementById('exportAppearanceBtn')) return;
        const wrap = document.createElement('div'); wrap.style.display='flex'; wrap.style.gap='8px'; wrap.style.marginTop='8px';
        const exp = document.createElement('button'); exp.id = 'exportAppearanceBtn'; exp.className = 'smallBtn'; exp.textContent = 'export';
        const imp = document.createElement('button'); imp.id = 'importAppearanceBtn'; imp.className = 'smallBtn'; imp.textContent = 'import';
        wrap.appendChild(exp); wrap.appendChild(imp);
        const resetBtn = document.createElement('button'); resetBtn.id = 'resetAppearanceBtn'; resetBtn.className = 'smallBtn'; resetBtn.textContent = 'reset theme';
        wrap.appendChild(resetBtn);
        pane.appendChild(wrap);

        exp.addEventListener('click', ()=>{
            try{
                const themeRaw = localStorage.getItem('theme_settings') || '{}';
                let themeObj = {};
                try{ themeObj = JSON.parse(themeRaw); }catch(e){ themeObj = { theme: 'default' }; }
                // include reduce_motion and compact_mode flags in export
                const exportObj = Object.assign({}, themeObj, {
                    reduce_motion: !!localStorage.getItem('reduce_motion'),
                    compact_mode: !!localStorage.getItem('compact_mode')
                });
                const data = JSON.stringify(exportObj, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'unichat-appearance.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
            }catch(e){ console.warn(e); }
        });

        imp.addEventListener('click', ()=>{
            try{
                const input = document.createElement('input'); input.type='file'; input.accept='application/json';
                input.addEventListener('change', (ev)=>{
                    try{
                        const f = input.files && input.files[0]; if(!f) return;
                        const r = new FileReader();
                        r.onload = function(){
                            try{
                                const txt = String(r.result || '');
                                const obj = JSON.parse(txt);
                                // if imported object contains theme settings, store them
                                const saveTheme = Object.assign({}, obj || {});
                                // remove flags from theme object if present
                                const reduceFlag = !!saveTheme.reduce_motion;
                                const compactFlag = !!saveTheme.compact_mode;
                                delete saveTheme.reduce_motion; delete saveTheme.compact_mode;
                                localStorage.setItem('theme_settings', JSON.stringify(saveTheme));
                                applyThemeFromSettings(saveTheme);
                                // apply reduce motion and compact mode flags
                                try{
                                    if(reduceFlag){ localStorage.setItem('reduce_motion','1'); document.documentElement.classList.add('reduced-motion'); if(set_reduceMotion) set_reduceMotion.checked = true; } else { localStorage.removeItem('reduce_motion'); document.documentElement.classList.remove('reduced-motion'); if(set_reduceMotion) set_reduceMotion.checked = false; }
                                }catch(e){}
                                try{
                                    if(compactFlag){ localStorage.setItem('compact_mode','1'); document.documentElement.classList.add('compact-mode'); if(set_compactMode) set_compactMode.checked = true; } else { localStorage.removeItem('compact_mode'); document.documentElement.classList.remove('compact-mode'); if(set_compactMode) set_compactMode.checked = false; }
                                }catch(e){}
                                // update UI fields if present
                                try{ if(set_theme) set_theme.value = obj.theme || 'default'; }catch(e){}
                                try{ if(set_fontUrl) set_fontUrl.value = obj.fontUrl || ''; }catch(e){}
                                try{ if(set_fontName) set_fontName.value = obj.fontName || ''; }catch(e){}
                                try{ if(set_textColor) set_textColor.value = obj.textColor || '#ffffff'; }catch(e){}
                                try{ if(set_bgColor) set_bgColor.value = obj.bgColor || '#121212'; }catch(e){}
                                try{ if(set_panelColor) set_panelColor.value = obj.panelColor || '#111111'; }catch(e){}
                                try{ if(set_accentColor) set_accentColor.value = obj.accentColor || '#6c63ff'; }catch(e){}
                                try{ if(set_bubbleColor) set_bubbleColor.value = obj.bubbleColor || '#242424'; }catch(e){}
                                try{ if(set_inputColor) set_inputColor.value = obj.inputColor || '#161616'; }catch(e){}
                                try{ if(set_dateOrder) set_dateOrder.value = obj.dateOrder || 'mdy'; }catch(e){}
                                try{ if(set_hourFormat) set_hourFormat.value = obj.hourFormat || '12'; }catch(e){}
                                settingsError.textContent = 'imported'; setTimeout(()=>{ settingsError.textContent=''; }, 1200);
                            }catch(err){ settingsError.textContent = 'invalid file'; setTimeout(()=>{ settingsError.textContent=''; }, 1200); }
                        };
                        r.readAsText(f);
                    }catch(e){ }
                });
                input.click();
            }catch(e){ }
        });
        // reset to defaults
        resetBtn.addEventListener('click', ()=>{
            try{
                localStorage.removeItem('theme_settings');
                localStorage.removeItem('reduce_motion');
                localStorage.removeItem('compact_mode');
                applyThemeFromSettings({ theme: 'default' });
                try{ if(set_theme) set_theme.value = 'default'; }catch(e){}
                try{ if(set_fontUrl) set_fontUrl.value = ''; }catch(e){}
                try{ if(set_fontName) set_fontName.value = ''; }catch(e){}
                try{ if(set_textColor) set_textColor.value = '#ffffff'; }catch(e){}
                try{ if(set_bgColor) set_bgColor.value = '#121212'; }catch(e){}
                try{ if(set_panelColor) set_panelColor.value = '#111111'; }catch(e){}
                try{ if(set_accentColor) set_accentColor.value = '#6c63ff'; }catch(e){}
                try{ if(set_bubbleColor) set_bubbleColor.value = '#242424'; }catch(e){}
                try{ if(set_inputColor) set_inputColor.value = '#161616'; }catch(e){}
                try{ if(set_dateOrder) set_dateOrder.value = 'mdy'; }catch(e){}
                try{ if(set_hourFormat) set_hourFormat.value = '12'; }catch(e){}
                try{ if(set_reduceMotion) set_reduceMotion.checked = false; }catch(e){}
                try{ if(set_compactMode) set_compactMode.checked = false; }catch(e){}
                settingsError.textContent = 'reset'; setTimeout(()=>{ settingsError.textContent=''; }, 900);
            }catch(e){}
        });
    }catch(e){}
}

try{ setupAppearanceImportExport(); }catch(e){}
function uid(){return Math.random().toString(36).slice(2,10);} 

// Format timestamps for messages.
// global time format settings (date order and hour format)
let timeFormatSettings = { dateOrder: 'mdy', hourFormat: '12' };

function formatTimestamp(ts){
    try{
        if(!ts) return '';
        const d = new Date(Number(ts));
        const now = new Date();
        // same day -> show h:mm am/pm
        const isSameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
        if(isSameDay){
            const h24 = d.getHours();
            const m = String(d.getMinutes()).padStart(2,'0');
            const hourFmt = (timeFormatSettings && timeFormatSettings.hourFormat) ? String(timeFormatSettings.hourFormat) : '12';
            if(hourFmt === '24'){
                const hh = String(h24).padStart(2,'0');
                return `${hh}:${m}`;
            }else{
                let h = h24;
                const am = h < 12;
                if(h === 0) h = 12; else if(h > 12) h = h - 12;
                return `${h}:${m} ${am? 'am' : 'pm'}`;
            }
        }
        // within same year -> show two-part date according to order (omit year)
        const order = (timeFormatSettings && timeFormatSettings.dateOrder) ? timeFormatSettings.dateOrder : 'mdy';
        const mm = String(d.getMonth()+1);
        const dd = String(d.getDate());
        const yyyy = String(d.getFullYear());
        if(d.getFullYear() === now.getFullYear()){
            const two = order.replace(/y/g,'');
            if(two === 'md') return `${mm}/${dd}`;
            if(two === 'dm') return `${dd}/${mm}`;
            // fallback
            return `${mm}/${dd}`;
        }
        // older -> include year per full order
        if(order === 'mdy') return `${mm}/${dd}/${yyyy}`;
        if(order === 'dmy') return `${dd}/${mm}/${yyyy}`;
        if(order === 'ymd') return `${yyyy}/${mm}/${dd}`;
        if(order === 'ydm') return `${yyyy}/${dd}/${mm}`;
        return `${mm}/${dd}/${yyyy}`;
    }catch(e){ return ''; }
}

// Full timestamp for hover/tooltips (locale + ISO)
function formatFullTimestamp(ts){
    try{
        if(!ts) return '';
        const d = new Date(Number(ts));
        return d.toLocaleString() + ' — ' + d.toISOString();
    }catch(e){ return ''; }
}

// Simple safe markdown renderer: escapes HTML then applies lightweight markdown
function escapeHtml(str){
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderMarkdown(text){
    if(!text) return '';
    let s = escapeHtml(text);
    // headings: line starting with "-# " -> small, "# " -> big
    s = s.replace(/^-#\s*(.+)$/gm, '<div class="md-small">$1</div>');
    s = s.replace(/^#\s*(.+)$/gm, '<div class="md-h1">$1</div>');
    // bold italic ***text*** -> <strong><em>
    s = s.replace(/\*\*\*(.+?)\*\*\*/gs, '<strong><em>$1</em></strong>');
    // bold **text**
    s = s.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>');
    // italic *text*
    s = s.replace(/\*(.+?)\*/gs, '<em>$1</em>');
    // underline __text__
    s = s.replace(/__(.+?)__/gs, '<u>$1</u>');
    // strikethrough ~~text~~
    s = s.replace(/~~(.+?)~~/gs, '<s>$1</s>');
    // simple line breaks
    s = s.replace(/\r?\n/g, '<br>');
    // mentions: @username -> span. keep case
    try{ s = s.replace(/@([A-Za-z0-9_\-]+)/g, '<span class="mention">@$1</span>'); }catch(e){}
    // convert plain URLs to shortened anchors (show filename or hostname)
    try{
        s = s.replace(/(https?:\/\/[^\s<]+)/g, function(m){
            try{
                const u = new URL(m);
                let short = u.pathname.split('/').filter(Boolean).pop() || u.hostname || m;
                try{ short = decodeURIComponent(short); }catch(_e){}
                return '<a href="' + escapeHtml(m) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(short) + '</a>';
            }catch(e){
                return '<a href="' + escapeHtml(m) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(m) + '</a>';
            }
        });
    }catch(e){}
    return s;
}

function formatTime(sec){
    try{
        sec = Number(sec) || 0;
        const s = Math.floor(sec % 60); const m = Math.floor((sec/60) % 60);
        return m + ':' + String(s).padStart(2,'0');
    }catch(e){ return '0:00'; }
}

function renderMessages(){
    chatEl.innerHTML='';
    for(let msg of messages){
    // hide messages from blocked users
    try{ if(msg && msg.name && blockedUsers.has(msg.name)) continue; }catch(e){}

        const row=document.createElement('div');
        row.className='msgRow';
        row.dataset.id=msg.id;
        try{
            const lowerName = (username||'').toLowerCase();
            let mentioned = false;
            if(msg.mentions && Array.isArray(msg.mentions)){
                // consider mentions array; only treat as targeting current user if one of the mentions equals current username and that username exists
                mentioned = msg.mentions.some(x=> String(x||'').toLowerCase() === lowerName && usernameExists(x));
            }
            // do NOT use a loose text regex fallback; only explicit mentions array triggers highlight
            if(mentioned) row.classList.add('mentioned');
        }catch(e){}

        const avatar=document.createElement('img');
        avatar.className='avatar';
        const avatarSrc = msg.avatar || onlineAvatars[msg.name] || `https://dummyimage.com/200x200/000/fff&text=${encodeURIComponent((msg.name||'?')[0]||'?')}`;
        avatar.src = avatarSrc;
        avatar.alt = msg.name || '';

        const body=document.createElement('div');
        body.className='msgBody';

        const nameBubble=document.createElement('div');
        nameBubble.className='nameAndBubble';

        const name=document.createElement('div');
        name.className='username';
        name.textContent=msg.name;

        // timestamp element
        const tsEl = document.createElement('div');
        tsEl.className = 'msgTimestamp';
        const rawTs = msg.timestamp || msg.ts || msg.time;
        tsEl.textContent = formatTimestamp(rawTs);
        try{ const full = formatFullTimestamp(rawTs); if(full) { tsEl.title = full; tsEl.setAttribute('aria-label', full); } }catch(e){}

        let bubble;
        if(editingId === msg.id){
            bubble = document.createElement('textarea');
            bubble.id = 'editBox';
            bubble.className = 'bubble editBox';
            bubble.value = msg.text;
            bubble.rows = 3;
        }else{
            bubble = document.createElement('div');
            bubble.className='bubble';
            bubble.innerHTML = renderMarkdown(msg.text);
            // parse emoji to Twemoji images if available (use default settings)
            try{ if(window.twemoji) twemoji.parse(bubble); }catch(e){}
            // adjust sizing: if bubble contains only emoji images (no text), mark as emoji-only
            try{
                const emojiImgs = bubble.querySelectorAll('img.emoji');
                const textOnly = (bubble.textContent || '').trim();
                if(emojiImgs && emojiImgs.length && textOnly === ''){
                    bubble.classList.add('emoji-only');
                }else{
                    bubble.classList.remove('emoji-only');
                }
            }catch(e){}
            // post-process mention spans: only keep mention styling if the username exists
            try{
                const mentionsEls = bubble.querySelectorAll && bubble.querySelectorAll('.mention');
                if(mentionsEls && mentionsEls.length){
                    mentionsEls.forEach(function(el){
                        try{
                            const raw = (el.textContent||'').trim();
                            const uname = raw.startsWith('@') ? raw.slice(1) : raw;
                            if(!usernameExists(uname)){
                                // replace with plain text node (no highlight)
                                const tn = document.createTextNode(raw);
                                el.parentNode && el.parentNode.replaceChild(tn, el);
                            }
                        }catch(_e){}
                    });
                }
            }catch(e){}

            // embed first image/gif link (if any) below the message bubble
                // embed first video or image link (video gets a custom player)
                try{
                    const txt = String(msg.text || '');
                    // check for video links first
                    const v = txt.match(/https?:\/\/[^\s<]+\.(?:mp4|webm|ogg|mov|m4v)(?:\?[^\s<]*)?/i);
                    // check for audio links (mp3, wav, oga, m4a, aac, flac)
                    const a = txt.match(/https?:\/\/[^\s<]+\.(?:mp3|wav|oga|m4a|aac|flac)(?:\?[^\s<]*)?/i);
                    if(v && v[0]){
                        const vidUrl = v[0];
                        const emb = document.createElement('div'); emb.className = 'embedded video-embed';
                        const wrapper = document.createElement('div'); wrapper.className = 'videoWrapper';
                        const video = document.createElement('video');
                        video.src = vidUrl;
                        video.preload = 'metadata';
                        video.playsInline = true;
                        video.controls = false;
                        video.setAttribute('webkit-playsinline', '');
                        // build custom controls: overlay play button + progress bar
                        const overlay = document.createElement('button'); overlay.type = 'button'; overlay.className = 'videoPlayBtn'; overlay.setAttribute('aria-label','play'); overlay.innerHTML = '►';
                        const progress = document.createElement('div'); progress.className = 'videoProgress';
                        const progressBar = document.createElement('div'); progressBar.className = 'videoProgressBar'; progress.appendChild(progressBar);
                        wrapper.appendChild(video); wrapper.appendChild(overlay); wrapper.appendChild(progress); emb.appendChild(wrapper);

                        // events
                        overlay.addEventListener('click', (ev)=>{ ev.stopPropagation(); try{ if(video.paused){ video.play().catch(()=>{}); overlay.style.display='none'; } else { video.pause(); overlay.style.display='block'; } }catch(e){} });
                        video.addEventListener('click', ()=>{ try{ if(video.paused){ video.play().catch(()=>{}); overlay.style.display='none'; } else { video.pause(); overlay.style.display='block'; } }catch(e){} });
                        video.addEventListener('timeupdate', ()=>{ try{ const pct = (video.currentTime && video.duration) ? (video.currentTime / video.duration) : 0; progressBar.style.width = (pct * 100) + '%'; }catch(e){} });
                        video.addEventListener('play', ()=>{ try{ overlay.style.display='none'; }catch(e){} });
                        video.addEventListener('pause', ()=>{ try{ overlay.style.display='block'; }catch(e){} });
                        video.addEventListener('ended', ()=>{ try{ overlay.style.display='block'; }catch(e){} });

                        // seek by clicking progress bar
                        progress.addEventListener('click', (ev)=>{ try{ const rect = progress.getBoundingClientRect(); const x = ev.clientX - rect.left; const pct = Math.max(0, Math.min(1, x / rect.width)); if(video.duration) video.currentTime = pct * video.duration; }catch(e){} });
                        // append inside bubble
                        try{ if(bubble && bubble.appendChild) bubble.appendChild(emb); else nameBubble.appendChild(emb); }catch(e){ nameBubble.appendChild(emb); }
                    } else if(a && a[0]){
                        // audio embedding
                        const audUrl = a[0];
                        const emb = document.createElement('div'); emb.className = 'embedded audio-embed';
                        const wrapper = document.createElement('div'); wrapper.className = 'audioWrapper';
                        const audio = document.createElement('audio'); audio.src = audUrl; audio.preload = 'metadata'; audio.controls = false;
                        // controls: play/pause, progress, time, volume
                        const playBtn = document.createElement('button'); playBtn.type = 'button'; playBtn.className = 'audioPlayBtn'; playBtn.setAttribute('aria-label','play'); playBtn.textContent = '►';
                        const prog = document.createElement('div'); prog.className = 'audioProgress'; const progBar = document.createElement('div'); progBar.className = 'audioProgressBar'; prog.appendChild(progBar);
                        const timeWrap = document.createElement('div'); timeWrap.className = 'audioTime'; timeWrap.textContent = '0:00 / 0:00';
                        const vol = document.createElement('input'); vol.type = 'range'; vol.min = 0; vol.max = 100; vol.value = 80; vol.className = 'audioVolume';
                        wrapper.appendChild(playBtn); wrapper.appendChild(prog); wrapper.appendChild(timeWrap); wrapper.appendChild(vol); wrapper.appendChild(audio); emb.appendChild(wrapper);
                        // events
                        playBtn.addEventListener('click', ()=>{ try{ if(audio.paused){ audio.play().catch(()=>{}); playBtn.textContent = '❚❚'; } else { audio.pause(); playBtn.textContent = '►'; } }catch(e){} });
                        audio.addEventListener('play', ()=>{ try{ playBtn.textContent = '❚❚'; }catch(e){} });
                        audio.addEventListener('pause', ()=>{ try{ playBtn.textContent = '►'; }catch(e){} });
                        audio.addEventListener('timeupdate', ()=>{ try{ const pct = (audio.currentTime && audio.duration) ? (audio.currentTime / audio.duration) : 0; progBar.style.width = (pct * 100) + '%'; const cur = formatTime(audio.currentTime||0); const tot = audio.duration ? formatTime(audio.duration) : '0:00'; timeWrap.textContent = cur + ' / ' + tot; }catch(e){} });
                        prog.addEventListener('click', (ev)=>{ try{ const rect = prog.getBoundingClientRect(); const x = ev.clientX - rect.left; const pct = Math.max(0, Math.min(1, x / rect.width)); if(audio.duration) audio.currentTime = pct * audio.duration; }catch(e){} });
                        vol.addEventListener('input', ()=>{ try{ audio.volume = Number(vol.value) / 100; }catch(e){} });
                        // append inside bubble
                        try{ if(bubble && bubble.appendChild) bubble.appendChild(emb); else nameBubble.appendChild(emb); }catch(e){ nameBubble.appendChild(emb); }
                    } else {
                        // fallback: check for image link
                        const m = txt.match(/https?:\/\/[^\s<]+\.(?:png|jpe?g|gif|webp|avif|svg)(?:\?[^\s<]*)?/i);
                        if(m && m[0]){
                            const imgUrl = m[0];
                            const emb = document.createElement('div');
                            emb.className = 'embedded';
                            const im = document.createElement('img');
                            im.src = imgUrl;
                            im.alt = '';
                            im.loading = 'lazy';
                            emb.appendChild(im);
                            try{ if(bubble && bubble.appendChild) bubble.appendChild(emb); else nameBubble.appendChild(emb); }catch(e){ nameBubble.appendChild(emb); }
                        }
                    }
                }catch(e){}
        }

        // reply rendering removed

        const nameRow = document.createElement('div');
        nameRow.className = 'usernameRow';
        nameRow.appendChild(name);
        nameRow.appendChild(tsEl);
        nameBubble.appendChild(nameRow);
        // reply target marker removed
        nameBubble.appendChild(bubble);
        // show edited indicator next to message if present
        try{
            if(msg.edited){
                const editedSpan = document.createElement('span');
                editedSpan.className = 'editedIndicator';
                editedSpan.textContent = ' (edited)';
                nameBubble.appendChild(editedSpan);
            }
            if(msg.whisper){
                const wspan = document.createElement('span');
                wspan.className = 'whisperIndicator';
                wspan.textContent = ' (whisper)';
                nameBubble.appendChild(wspan);
            }
        }catch(e){}

        const controls=document.createElement('div');
        controls.className='msgControls';

        // prepare delete button (do NOT append yet) so we can control ordering
        let del = null;
        try{
            if(msg.name === username || isAdmin){
                del = document.createElement('button');
                del.className='delBtn';
                del.innerHTML='✖';
                del.onclick = ()=>deleteMessage(msg.id);
            }
        }catch(e){}

        // edit controls: either show edit button or save/cancel while editing
        if(editingId === msg.id){
            const save = document.createElement('button');
            save.className = 'saveEditBtn';
            save.textContent = 'save';
            save.onclick = ()=>finishEdit(msg.id);
            controls.appendChild(save);

            const cancel = document.createElement('button');
            cancel.className = 'cancelEditBtn';
            cancel.textContent = 'cancel';
            cancel.onclick = ()=>cancelEdit();
            controls.appendChild(cancel);
        }else{
            // only allow the original author to edit their message
            if(msg.name === username){
                const editBtn = document.createElement('button');
                editBtn.className = 'editBtn';
                editBtn.title = 'edit message';
                editBtn.innerHTML = '✎';
                editBtn.onclick = ()=>{ startEdit(msg.id); };
                controls.appendChild(editBtn);
            }
        }

        // append delete button after edit controls so it appears to the right
        try{ if(del) controls.appendChild(del); }catch(e){}

        // reply button removed

        body.appendChild(nameBubble);
        body.appendChild(controls);
        row.appendChild(avatar);
        row.appendChild(body);
        chatEl.appendChild(row);
    }
    chatEl.scrollTop=chatEl.scrollHeight;
}
// --- Emoji picker UI + helpers (lazy-loaded full dataset, search, pagination, recent) ---
const EMOJI_FALLBACK = ['😀','😃','😂','🤣','😊','😍','😎','😭','😡','👍','👎','🙏','🎉','🔥','❤️','🤝','🙌','😅','😴','🤔','🥳','🤩','💯'];
let EMOJI_DATA = null;
const EMOJI_DATA_URL = 'https://unpkg.com/emoji.json@13.1.0/emoji.json';
const EMOJI_PAGE_SIZE = 256;
let emojiCurrentPage = 0;
let emojiFilter = '';

function saveRecentEmoji(ch){
    try{
        const key = 'emoji_recent_v1';
        const max = 24;
        const cur = JSON.parse(localStorage.getItem(key)||'[]');
        const arr = Array.isArray(cur) ? cur : [];
        const idx = arr.indexOf(ch);
        if(idx !== -1) arr.splice(idx,1);
        arr.unshift(ch);
        if(arr.length > max) arr.length = max;
        localStorage.setItem(key, JSON.stringify(arr));
    }catch(e){}
}

function loadRecentEmoji(){ try{ return JSON.parse(localStorage.getItem('emoji_recent_v1')||'[]'); }catch(e){ return []; } }

async function fetchEmojiData(){
    if(EMOJI_DATA) return EMOJI_DATA;
    try{
        const res = await fetch(EMOJI_DATA_URL);
        if(!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        EMOJI_DATA = data.map(it => ({ char: it.emoji || it.char || it.designation || it.short_name || '', name: it.name || it.short_name || '' })).filter(x=>x.char);
        return EMOJI_DATA;
    }catch(e){
        EMOJI_DATA = EMOJI_FALLBACK.map(ch=>({char: ch, name: ''}));
        return EMOJI_DATA;
    }
}

function buildEmojiPicker(){
    try{
        if(!emojiPicker){
            emojiPicker = document.createElement('div');
            emojiPicker.id = 'emojiPicker';
            emojiPicker.className = 'emojiPicker';
            document.body.appendChild(emojiPicker);
        }
        emojiPicker.innerHTML = '';

        const recent = document.createElement('div'); recent.className = 'emojiRecent';
        const recentList = loadRecentEmoji();
        if(recentList && recentList.length){
            const MAX_RECENT_DISPLAY = 12;
            recentList.slice(0, MAX_RECENT_DISPLAY).forEach(ch=>{
                const b = document.createElement('button'); b.type='button'; b.className='emojiCell'; b.textContent = ch;
                b.addEventListener('click', e=>{ insertAtCursor(inputBox, ch); inputBox.focus(); saveRecentEmoji(ch); });
                recent.appendChild(b);
            });
            emojiPicker.appendChild(recent);
        }

        const s = document.createElement('input'); s.className='emojiSearch'; s.placeholder='search emoji'; s.type='search';
        s.addEventListener('input', ()=>{ emojiFilter = s.value.trim().toLowerCase(); emojiCurrentPage = 0; renderEmojiPage(); });
        emojiPicker.appendChild(s);

        const grid = document.createElement('div'); grid.className = 'emojiGrid'; grid.id = 'emojiGridContainer';
        emojiPicker.appendChild(grid);

        const pager = document.createElement('div'); pager.className = 'emojiPager'; pager.id = 'emojiPager';
        const prev = document.createElement('button'); prev.type='button'; prev.className='smallBtn'; prev.textContent='Prev'; prev.addEventListener('click', ()=>{ if(emojiCurrentPage>0){ emojiCurrentPage--; renderEmojiPage(); } });
        const next = document.createElement('button'); next.type='button'; next.className='smallBtn'; next.textContent='Next'; next.addEventListener('click', ()=>{ emojiCurrentPage++; renderEmojiPage(); });
        const info = document.createElement('span'); info.id='emojiPagerInfo'; info.style.marginLeft='8px'; info.style.color='var(--muted)';
        pager.appendChild(prev); pager.appendChild(next); pager.appendChild(info);
        emojiPicker.appendChild(pager);

        renderEmojiPage(true);
        fetchEmojiData().then(()=>{ renderEmojiPage(); }).catch(()=>{ renderEmojiPage(); });
    }catch(e){}
}

function renderEmojiPage(){
    try{
        const grid = document.getElementById('emojiGridContainer');
        if(!grid) return;
        grid.innerHTML = '';
        const data = EMOJI_DATA || EMOJI_FALLBACK.map(ch=>({char: ch}));
        let filtered = data;
        if(emojiFilter){ filtered = data.filter(x=> (x.name||'').toLowerCase().includes(emojiFilter) || (x.char||'').includes(emojiFilter) ); }
        const total = Math.max(1, Math.ceil(filtered.length / EMOJI_PAGE_SIZE));
        if(emojiCurrentPage >= total) emojiCurrentPage = total - 1;
        const start = emojiCurrentPage * EMOJI_PAGE_SIZE;
        const pageItems = filtered.slice(start, start + EMOJI_PAGE_SIZE);
        pageItems.forEach(it=>{
            const btn = document.createElement('button'); btn.type='button'; btn.className='emojiCell'; btn.textContent = it.char || it;
            btn.addEventListener('click', e=>{ insertAtCursor(inputBox, it.char||it); inputBox.focus(); saveRecentEmoji(it.char||it); });
            grid.appendChild(btn);
        });
        try{ if(window.twemoji) twemoji.parse(grid); }catch(e){}
        const info = document.getElementById('emojiPagerInfo'); if(info) info.textContent = ` page ${emojiCurrentPage+1} / ${total}`;
        try{ const pager = document.getElementById('emojiPager'); if(pager){ pager.querySelectorAll('button')[0].disabled = (emojiCurrentPage<=0); pager.querySelectorAll('button')[1].disabled = (emojiCurrentPage >= total-1); } }catch(e){}
    }catch(e){}
}

function insertAtCursor(input, text){
    try{
        if(!input) return;
        const start = (input.selectionStart != null) ? input.selectionStart : input.value.length;
        const end = (input.selectionEnd != null) ? input.selectionEnd : input.value.length;
        const val = input.value || '';
        input.value = val.slice(0, start) + text + val.slice(end);
        const pos = start + text.length;
        input.selectionStart = input.selectionEnd = pos;
        charCount.textContent = `${input.value.length} / ${MAX_CHARS}`;
    }catch(e){}
}

function toggleEmojiPicker(){
    try{
        if(!emojiBtn || !inputBox) return;
        if(!emojiPicker) buildEmojiPicker();
        if(!emojiPicker) return;
        const willShow = !emojiPicker.classList.contains('show');
        if(willShow){
            emojiPicker.classList.add('show');
            // position after paint to get accurate dimensions
            requestAnimationFrame(()=>{
                try{
                    const rect = emojiBtn.getBoundingClientRect();
                    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
                    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
                    const pw = emojiPicker.offsetWidth || 300;
                    const ph = emojiPicker.offsetHeight || 240;
                    let left = rect.right - pw;
                    if(left < 8) left = 8;
                    let top = rect.top - ph - 8;
                    if(top < 8) top = rect.bottom + 8;
                    if(left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
                    if(top + ph > vh - 8) top = Math.max(8, vh - ph - 8);
                    emojiPicker.style.left = left + 'px';
                    emojiPicker.style.top = top + 'px';
                }catch(e){}
            });
            renderEmojiPage();
        }else{
            emojiPicker.classList.remove('show');
        }
    }catch(e){}
}

document.addEventListener('click', (ev)=>{
    try{ if(emojiPicker && !emojiPicker.contains(ev.target) && emojiBtn && ev.target !== emojiBtn) emojiPicker.classList.remove('show'); }catch(e){}
});

if(emojiBtn){ emojiBtn.addEventListener('click', (ev)=>{ ev.stopPropagation(); toggleEmojiPicker(); }); }
// build initially
try{ buildEmojiPicker(); }catch(e){}

function updateInputState(){
    try{
        if(!inputBox) return;
        if(isMuted){
            inputBox.disabled = true;
            inputBox.placeholder = 'you are muted';
            charCount.style.display = 'none';
        }else{
            inputBox.disabled = false;
            inputBox.placeholder = 'say something..';
            charCount.style.display = '';
        }
    }catch(e){}
}

// reply system removed

function addMessage(msg){
    try{ if(msg && !msg.timestamp) msg.timestamp = Date.now(); }catch(e){}
    messages.push(msg);
    renderMessages();
}

function startEdit(id){
    const msg = (messages||[]).find(m=>m && m.id === id);
    if(!msg) return;
    if(msg.name !== username){
        try{ errorMsg.textContent = 'cannot edit other users\' messages'; setTimeout(()=>{ errorMsg.textContent=''; },1500); }catch(e){}
        return;
    }
    editingId = id;
    renderMessages();
    setTimeout(()=>{ try{ const tb = document.getElementById('editBox'); if(tb) tb.focus(); }catch(e){} }, 40);
}

function cancelEdit(){
    editingId = null;
    renderMessages();
}

function finishEdit(id){
    try{
        const tb = document.getElementById('editBox');
        if(!tb) return cancelEdit();
        const newText = tb.value;
        // ensure only author can finish (safety)
        for(const m of messages){ if(m && m.id === id){ if(m.name !== username){ return cancelEdit(); } m.text = newText; m.edited = true; break; } }
        // notify server
        try{ if(ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type:'edit', id: id, text: newText })); }catch(e){}
    }catch(e){}
    editingId = null;
    renderMessages();
}

function deleteMessage(id){
    messages = messages.filter(m=>m.id!==id);
    const el = document.querySelector(`[data-id="${id}"]`);
    if(el) el.remove();
    try{
        if(ws && ws.readyState === WebSocket.OPEN){
            ws.send(JSON.stringify({ type: "delete", id: id }));
        }
    }catch(e){}
}

let typingTimeout;
function showTyping(){
    if(!ws || ws.readyState!==WebSocket.OPEN) return;
    ws.send(JSON.stringify({type:"typing", user:username}));

    clearTimeout(typingTimeout);
    typingTimeout=setTimeout(()=>{
        typingEl.textContent='';
    },1200);
}

let _audioCtx = null;
function playAtAllSound(){
    try{
        if(!window._atAllAudio){
            window._atAllAudio = new Audio('notif1.wav');
            window._atAllAudio.preload = 'auto';
            window._atAllAudio.volume = 0.9;
        }
        const p = window._atAllAudio.play();
        if(p && p.catch){ p.catch(()=>{}); }
    }catch(e){
        try{
            if(!_audioCtx){
                _audioCtx = new (window.AudioContext||window.webkitAudioContext)();
            }
            const ctx = _audioCtx;
            const now = ctx.currentTime;
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine'; o.frequency.value = 880;
            g.gain.value = 0.0018;
            o.connect(g); g.connect(ctx.destination);
            o.start(now);
            g.gain.setTargetAtTime(0.0001, now + 0.18, 0.08);
            setTimeout(()=>{ try{ o.stop(); }catch(e){} }, 400);
        }catch(_e){}
    }
}

function playMessageSound(){
    try{
        if(!window._msgAudio){
            window._msgAudio = new Audio('notif2off.wav');
            window._msgAudio.preload = 'auto';
            window._msgAudio.volume = 0.6;
        }
        const p = window._msgAudio.play();
        if(p && p.catch){ p.catch(()=>{}); }
    }catch(e){
    }
}

function toggleBlock(name){
    try{
        if(!name) return;
        // do not allow blocking yourself
        if(username && String(name) === String(username)) return;
        if(blockedUsers.has(name)) blockedUsers.delete(name); else blockedUsers.add(name);
        try{ localStorage.setItem('blocked', JSON.stringify(Array.from(blockedUsers))); }catch(e){}
        try{ renderMessages(); renderOnlineList(Object.keys(onlineAvatars).map(n=>({name:n, avatar:onlineAvatars[n]}))); }catch(e){}
    }catch(e){}
}

function renderOnlineList(list){
    if(!onlineListEl) return;
    onlineListEl.innerHTML = '';
    for(const u of (list||[])){
        try{ if(u && u.name) onlineAvatars[u.name] = u.avatar || ''; }catch(e){}
        const item = document.createElement('div');
        item.className = 'onlineItem';
        item.dataset.name = String(u.name || '');
        // avatar (small)
        try{
            const av = document.createElement('img');
            av.className = 'avatar';
            av.style.width = '28px'; av.style.height = '28px'; av.style.marginRight = '8px'; av.src = u.avatar || `https://dummyimage.com/200x200/000/fff&text=${encodeURIComponent((u.name||'?')[0]||'?')}`;
            av.alt = u.name || '';
            item.appendChild(av);
        }catch(e){}
        const nameDiv = document.createElement('div');
        nameDiv.className = 'name';
        nameDiv.textContent = u.name || '';
        nameDiv.style.flex = '1';
        item.appendChild(nameDiv);
        // right-click (contextmenu) support: show custom menu
        item.addEventListener('contextmenu', (ev)=>{
            try{
                ev.preventDefault(); ev.stopPropagation();
                const name = item.dataset.name || u.name;
                showUserContextMenu(name, ev.clientX, ev.clientY);
            }catch(e){}
        });
        onlineListEl.appendChild(item);
    }
}

// --- custom user context menu (Block/Unblock) ---
function ensureUserContextMenu(){
    if(document.getElementById('userContextMenu')) return document.getElementById('userContextMenu');
    const m = document.createElement('div'); m.id = 'userContextMenu'; m.className = 'contextMenu';
    document.body.appendChild(m);
    // hide on any click
    document.addEventListener('click', ()=>{ try{ m.style.display='none'; }catch(e){} });
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ try{ m.style.display='none'; }catch(_e){} } });
    return m;
}

function showUserContextMenu(name, x, y){
    try{
        const m = ensureUserContextMenu();
        m.innerHTML = '';
        const isBlocked = blockedUsers.has(name);
        if(name && username && String(name) === String(username)){
            const info = document.createElement('button');
            info.textContent = 'this is you';
            info.disabled = true;
            info.style.cursor = 'default';
            m.appendChild(info);
        }else{
            // client-side block/unblock
            const btn = document.createElement('button');
            btn.textContent = isBlocked ? 'unblock ' + name : 'block ' + name;
            btn.onclick = (ev)=>{ ev.stopPropagation(); toggleBlock(name); m.style.display='none'; };
            m.appendChild(btn);

            // admin actions: show placeholders then request server account info to build toggle buttons
            try{
                if(isAdmin){
                    const sep = document.createElement('div'); sep.style.height='6px'; m.appendChild(sep);
                    const loading = document.createElement('div'); loading.textContent = 'loading admin actions...'; loading.style.color='var(--muted)'; loading.id = 'adminActionsLoading'; m.appendChild(loading);
                    // request server for account info; server will reply with 'admin_get_account' and echo back req_id
                    try{
                        if(ws && ws.readyState===WebSocket.OPEN){
                            const reqId = uid();
                            adminReqMap[reqId] = { target: name, startedAt: Date.now(), menuOpen: true };
                            ws.send(JSON.stringify({type:'admin_get_account', target: name, req_id: reqId}));
                            console.log('admin_get_account request sent', {reqId, target: name});
                            // set timeout for diagnostics UI
                            adminReqMap[reqId].timeout = setTimeout(()=>{
                                try{
                                    const entry = adminReqMap[reqId];
                                    if(!entry) return;
                                    const mEl = document.getElementById('userContextMenu');
                                    const loadingEl = document.getElementById('adminActionsLoading');
                                    if(loadingEl && mEl && mEl.style.display === 'block'){
                                        loadingEl.remove();
                                        const info = document.createElement('div');
                                        info.textContent = 'no server response — retry?';
                                        info.style.color = 'var(--muted)';
                                        const retryBtn = document.createElement('button');
                                        retryBtn.textContent = 'Retry';
                                        retryBtn.className = 'smallBtn';
                                        retryBtn.onclick = (ev)=>{ 
                                            ev.stopPropagation(); 
                                            try{
                                                if(ws && ws.readyState===WebSocket.OPEN){
                                                    const newReqId = uid();
                                                    adminReqMap[newReqId] = { target: name, startedAt: Date.now(), menuOpen: true };
                                                    ws.send(JSON.stringify({type:'admin_get_account', target: name, req_id: newReqId}));
                                                    console.log('admin_get_account retry sent', {reqId:newReqId, target: name});
                                                    adminReqMap[newReqId].timeout = setTimeout(()=>{
                                                        try{
                                                            const entry2 = adminReqMap[newReqId];
                                                            if(!entry2) return;
                                                            const mEl2 = document.getElementById('userContextMenu');
                                                            const loadingEl2 = document.getElementById('adminActionsLoading');
                                                            if(loadingEl2 && mEl2 && mEl2.style.display === 'block'){
                                                                loadingEl2.remove();
                                                                const info2 = document.createElement('div');
                                                                info2.textContent = 'no server response';
                                                                info2.style.color = 'var(--muted)';
                                                                mEl2.appendChild(info2);
                                                                console.warn('admin_get_account retry timed out', {reqId:newReqId, target: name, startedAt: entry2.startedAt});
                                                            }
                                                        }catch(_e){}
                                                    }, 5000);
                                                }
                                            }catch(e){}
                                        };
                                        mEl.appendChild(info);
                                        mEl.appendChild(retryBtn);
                                        console.warn('admin_get_account request timed out', {reqId, target: name, startedAt: entry.startedAt});
                                        // keep entry for later diagnostics
                                    }
                                }catch(_e){}
                            }, 5000);
                        }
                    }catch(e){}
                }
            }catch(e){}
        }
        // position
        const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        let left = x; let top = y;
        // ensure stays on screen
        const rect = m.getBoundingClientRect();
        // temporarily show to measure
        m.style.display = 'block'; m.style.left = '-9999px'; m.style.top = '-9999px';
        const w = m.offsetWidth; const h = m.offsetHeight;
        if(left + w > vw) left = Math.max(8, vw - w - 8);
        if(top + h > vh) top = Math.max(8, vh - h - 8);
        m.style.left = left + 'px'; m.style.top = top + 'px';
        m.style.display = 'block';
    }catch(e){}
}

inputBox.addEventListener('input',()=>{
    if(inputBox.value.length>MAX_CHARS){
        inputBox.value=inputBox.value.slice(0,MAX_CHARS);
    }
    charCount.textContent=`${inputBox.value.length} / ${MAX_CHARS}`;
    charCount.style.color=(inputBox.value.length>=MAX_CHARS)?'var(--danger)':'';
    showTyping();
});

inputBox.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey){
        e.preventDefault();
        const text=inputBox.value.trim();
        if(text.length>0){

            const now = Date.now();
            if(now - _lastSent < 250){
                errorMsg.textContent = 'slow down';
                return;
            }
            _lastSent = now;

            // command parsing: /whisper or /w -> send private message
            const whisperMatch = text.match(/^\s*\/(?:whisper|w)\s+@?([A-Za-z0-9_\-]+)\s+([\s\S]+)/i);
            if(whisperMatch){
                const target = whisperMatch[1];
                const body = whisperMatch[2];
                if(ws && ws.readyState===WebSocket.OPEN){
                    try{ ws.send(JSON.stringify({ type:'whisper', to: String(target), text: String(body), id: uid() })); }catch(e){}
                }
            } else {
                // collect mentions from text (simple @username tokens)
                const mentions = [];
                try{
                    const re = /@([A-Za-z0-9_\-]+)/g;
                    let m;
                    while((m = re.exec(text)) !== null){ if(m[1]) mentions.push(m[1]); }
                }catch(e){}

                const msg={
                    type:"message",
                    id:uid(),
                    name:username,
                    avatar: profilePic || (function(){ try{ return localStorage.getItem('chat_pfp')||'' }catch(e){return ''} })() || `https://dummyimage.com/200x200/000/fff&text=${encodeURIComponent((username||'?')[0]||'?')}`,
                    text:text,
                    timestamp: Date.now(),
                    mentions: mentions.length ? mentions : undefined
                };

                addMessage(msg);
                try{ if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(msg)); }catch(e){}
            }
        }
        inputBox.value='';
        charCount.textContent=`0 / ${MAX_CHARS}`;
        typingEl.textContent='';
    }else{
        showTyping();
    }
});

function ensureWS(onOpenSend){
    if(ws && ws.readyState===WebSocket.OPEN){
        if(onOpenSend) try{ ws.send(JSON.stringify(onOpenSend)); }catch(e){}
        return;
    }

    // Helper to build an alternate URL to try if primary fails.
    const makeAltUrl = (url)=>{
        try{
            const u = new URL(url);
            // If connecting to a hostname with default port, try the typical server port 8765 on same host.
            const host = window.location.hostname || u.hostname;
            const useTls = (u.protocol === 'wss:');
            const altProto = useTls ? 'wss:' : 'ws:';
            return altProto + '//' + host + ':8765' + (u.pathname || '/');
        }catch(e){
            return url;
        }
    };

    // Attempt to connect, and on failure try one fallback (same host:8765)
    const tryConnect = (url, onOpenSend, triedFallback)=>{
        try{
            ws = new WebSocket(url);
        }catch(e){
            if(!triedFallback){
                const alt = makeAltUrl(url);
                tryConnect(alt, onOpenSend, true);
            }
            return;
        }

        ws.onopen = ()=>{
            try{ setServerStatus(true); }catch(e){}
            if(onOpenSend) try{ ws.send(JSON.stringify(onOpenSend)); }catch(e){}
        };

        ws.onmessage = (event)=>{ commonOnMessage(event); };

        ws.onerror = (ev)=>{
            try{ console.warn('WebSocket error connecting to', url); }catch(e){}
        };

        ws.onclose = (ev)=>{
            try{ setServerStatus(false); }catch(e){}
            // if connection closed before opening, try fallback once
            if(!triedFallback){
                const alt = makeAltUrl(url);
                if(alt !== url){
                    tryConnect(alt, onOpenSend, true);
                }
            }
        };
    };

    tryConnect(SERVER_WS_URL, onOpenSend, false);
}

function setServerStatus(isOnline){
    const el = document.getElementById('serverStatus');
    if(!el) return;
    const label = el.querySelector('.label');
    if(isOnline){
        el.classList.remove('offline');
        el.classList.add('online');
        if(label) label.textContent = 'server: online';
    }else{
        el.classList.remove('online');
        el.classList.add('offline');
        if(label) label.textContent = 'server: offline';
    }
}

function probeServer(){
    const url = SERVER_WS_URL;
    let probe = null;
    let settled = false;
    const makeAltUrl = (u)=>{
        try{
            const uu = new URL(u);
            const host = window.location.hostname || uu.hostname;
            const useTls = (uu.protocol === 'wss:');
            const proto = useTls ? 'wss:' : 'ws:';
            return proto + '//' + host + ':8765' + (uu.pathname || '/');
        }catch(e){ return u; }
    };

    const startProbe = (u, triedFallback)=>{
        try{
            probe = new WebSocket(u);
        }catch(e){
            if(!triedFallback){ startProbe(makeAltUrl(u), true); } else { setServerStatus(false); }
            return;
        }
        const to = setTimeout(()=>{
            if(!settled){ settled = true; try{ probe.close(); }catch(_e){} setServerStatus(false); }
        }, 3000);
        probe.onopen = ()=>{ if(!settled){ settled = true; clearTimeout(to); setServerStatus(true); try{ probe.close(); }catch(_e){} } };
        probe.onerror = ()=>{ if(!settled){ settled = true; clearTimeout(to); setServerStatus(false); try{ probe.close(); }catch(_e){} if(!triedFallback){ startProbe(makeAltUrl(u), true); } } };
        probe.onclose = ()=>{};
    };

    startProbe(url, false);
}

try{ probeServer(); setInterval(probeServer, 10000); }catch(e){}

function commonOnMessage(event){
    const data = JSON.parse(event.data);

    if(data.type === 'register'){
        errorMsg.textContent = data.message || (data.ok? 'Registered (pending approval)':'Registration failed');
        if(data.ok){
            try{ localStorage.setItem('chat_name', usernameInput.value.trim()); localStorage.setItem('chat_pfp', pfpInput.value.trim()||''); }catch(e){}
        }
        return;
    }

    if(data.type === 'login'){
        if(data.ok){
            username = usernameInput.value.trim();
            const serverAvatar = (data.avatar || '').trim();
            const pfp = pfpInput.value.trim();
            profilePic = serverAvatar || pfp || `https://dummyimage.com/200x200/000/fff&text=${encodeURIComponent(username[0]||'?')}`;
            try{ onlineAvatars[username] = profilePic || '';}catch(e){}
            try{ for(const m of messages){ if(m && m.name === username){ m.avatar = profilePic; } } }catch(e){}
            isAdmin = !!data.admin;
            isMuted = !!data.muted;
            updateInputState();
            try{ if(setupScreen) setupScreen.setAttribute('aria-hidden','true'); }catch(e){}
            renderMessages();
            if(onlinePanelEl){ onlinePanelEl.style.display='flex'; onlinePanelEl.setAttribute('aria-hidden','false'); }
            errorMsg.textContent='';
            try{ localStorage.setItem('chat_name', username); localStorage.setItem('chat_pfp', profilePic||''); }catch(e){}
            try{
                const ph = document.querySelector('#onlinePanel .panelHeader');
                if(ph && !document.getElementById('settingsBtn')){
                    const btn = document.createElement('button');
                    btn.id = 'settingsBtn';
                    btn.className = 'smallBtn';
                    btn.style.marginLeft = '8px';
                    btn.textContent = 'settings';
                    ph.appendChild(btn);
                    btn.addEventListener('click', openSettings);
                }
                    try{ const tabAdminBtn = document.getElementById('tabAdmin'); if(tabAdminBtn){ tabAdminBtn.style.display = isAdmin ? 'inline-block' : 'none'; } }catch(e){}
            }catch(e){}
        }else{
            errorMsg.textContent = data.message || 'Login failed';
        }
        return;
    }

    if(data.type === 'muted_status'){
        try{ isMuted = !!data.muted; updateInputState(); }catch(e){}
        return;
    }

    if(data.type === 'admin_list_banned'){
        try{
            const list = data.users || [];
            const container = document.getElementById('adminBannedList');
            if(container){
                container.innerHTML = '';
                if(!list.length) container.textContent = 'no banned users.';
                for(const u of list){
                    const row = document.createElement('div');
                    row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center'; row.style.padding='6px 0';
                    const name = document.createElement('div'); name.textContent = u; name.style.color='var(--muted)';
                    const btn = document.createElement('button'); btn.className='smallBtn'; btn.textContent='unban'; btn.onclick = ()=>{ try{ if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'admin_unban', target: u})); }catch(e){} };
                    row.appendChild(name); row.appendChild(btn);
                    container.appendChild(row);
                }
            }
        }catch(e){}
        return;
    }

    if(data.type === 'admin_list_pending'){
        try{
            const list = data.users || [];
            const container = document.getElementById('adminPendingList');
            if(container){
                container.innerHTML = '';
                if(!list.length) container.textContent = 'no pending accounts.';
                for(const u of list){
                    const row = document.createElement('div');
                    row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center'; row.style.padding='6px 0';
                    const name = document.createElement('div'); name.textContent = u; name.style.color='var(--muted)';
                    const btn = document.createElement('button'); btn.className='smallBtn'; btn.textContent='Approve'; btn.onclick = ()=>{ try{ if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'admin_approve', target: u})); }catch(e){} };
                    row.appendChild(name); row.appendChild(btn);
                    container.appendChild(row);
                }
            }
        }catch(e){}
        return;
    }

    if(data.type === 'admin_get_account'){
        try{
            const target = data.target;
            const acct = data.account || {};
            const reqId = data.req_id;
            if(reqId && adminReqMap[reqId]){
                try{ clearTimeout(adminReqMap[reqId].timeout); }catch(e){}
                console.log('admin_get_account response', {reqId, target, acct});
                delete adminReqMap[reqId];
            }else{
                console.log('admin_get_account response (no req match)', {target, acct, raw: data});
            }
            // find current context menu and update admin actions if it targets same user
            const m = document.getElementById('userContextMenu');
            if(m && m.style.display === 'block'){
                // clear admin loading area
                const loading = document.getElementById('adminActionsLoading'); if(loading) loading.remove();
                // build mute toggle
                try{
                    const muteBtn = document.createElement('button');
                    muteBtn.textContent = acct.muted ? ('unmute ' + target) : ('mute ' + target);
                    muteBtn.onclick = (ev)=>{ ev.stopPropagation(); try{ if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type: acct.muted ? 'admin_unmute' : 'admin_mute', target: target})); }catch(e){}; m.style.display='none'; };
                    m.appendChild(muteBtn);
                }catch(e){}
                // build ban toggle
                try{
                    const banBtn = document.createElement('button');
                    banBtn.textContent = acct.banned ? ('unban ' + target) : ('ban ' + target);
                    banBtn.onclick = (ev)=>{ ev.stopPropagation(); try{ if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type: acct.banned ? 'admin_unban' : 'admin_ban', target: target})); }catch(e){}; m.style.display='none'; };
                    m.appendChild(banBtn);
                }catch(e){}
                // show approve if not approved
                try{
                    if(!acct.approved){
                        const approveBtn = document.createElement('button');
                        approveBtn.textContent = 'approve ' + target;
                        approveBtn.onclick = (ev)=>{ ev.stopPropagation(); try{ if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type: 'admin_approve', target: target})); }catch(e){}; m.style.display='none'; };
                        m.appendChild(approveBtn);
                    }
                }catch(e){}
            }
        }catch(e){}
        return;
    }

    if(data.type === 'admin_action_result'){
        try{ settingsError.textContent = 'admin: ' + (data.action || '') + ' -> ok'; setTimeout(()=>{ settingsError.textContent=''; },1200); }catch(e){}
        return;
    }

    if(data.type === 'error'){
        // correlate admin request errors if present
        try{
            const rid = data.req_id;
            if(rid && adminReqMap[rid]){
                try{ clearTimeout(adminReqMap[rid].timeout); }catch(e){}
                const mEl = document.getElementById('userContextMenu');
                const loadingEl = document.getElementById('adminActionsLoading');
                if(loadingEl && mEl && mEl.style.display === 'block'){
                    loadingEl.remove();
                    const info = document.createElement('div');
                    info.textContent = 'server error: ' + (data.message || 'unknown');
                    info.style.color = 'var(--muted)';
                    mEl.appendChild(info);
                }
                console.error('admin request error', {reqId: rid, message: data.message});
                delete adminReqMap[rid];
                return;
            }
        }catch(_e){}
        if(data.action === 'refresh'){
            try{ window.location.reload(); }catch(e){}
            return;
        }
        errorMsg.textContent = data.message || 'Error';
        return;
    }

    if(data.type === 'history'){
        try{
            messages = data.messages || [];
            for(const m of messages){ if(m && m.name) onlineAvatars[m.name] = m.avatar || onlineAvatars[m.name] || ''; }
            renderMessages();
        }catch(e){}
        return;
    }

    if(data.type === 'whisper'){
        try{
            const w = {
                id: data.id || (data.timestamp?data.timestamp:uid()),
                name: data.from,
                text: data.text,
                whisper: true,
                timestamp: data.timestamp
            };
            // show whispered messages in chat but not broadcast to others — server already ensured delivery only to recipient and sender
            addMessage(w);
        }catch(e){}
        return;
    }

    // Received edit sync
    if(data.type === 'edit'){
        try{
            for(const m of messages){ if(m && m.id === data.id){ m.text = data.text; m.edited = true; break; } }
            renderMessages();
        }catch(e){}
        return;
    }

    if(data.type==="message"){
        // always add the message to the local buffer; renderMessages will hide blocked users
        addMessage(data);
        try{
            // do not play sounds for blocked users
            if(data && data.name && blockedUsers.has(data.name)) return;
            const lowerName = (username||'').toLowerCase();
            let mentioned = false;
            try{
                if(data.mentions && Array.isArray(data.mentions)){
                    mentioned = data.mentions.some(x=> String(x||'').toLowerCase() === lowerName && usernameExists(x));
                }
            }catch(e){}
            if(mentioned){
                playAtAllSound();
            }else{
                if(data.name !== username){ playMessageSound(); }
            }
        }catch(e){}
    }

    if(data.type==="typing"){
        typingEl.textContent = data.user + " is typing...";
        clearTimeout(typingTimeout);
        typingTimeout=setTimeout(()=>typingEl.textContent='',1200);
    }

    if(data.type === 'user_list'){
        renderOnlineList(data.users || []);
    }

    if(data.type==="delete"){
        const el = document.querySelector(`[data-id="${data.id}"]`);
        if(el) el.remove();
        messages = messages.filter(m=>m.id!==data.id);
    }
}

loginBtn.onclick = ()=>{
    const name = usernameInput.value.trim();
    const pass = passwordInput.value || '';
    if(!name || !pass){ errorMsg.textContent='username and password required'; return; }
    const lower = name.toLowerCase();
    if(name.includes('<')||name.includes('>')||lower.includes('http')){ errorMsg.textContent="invalid username"; return; }
    ensureWS({type:'login', username:name, password:pass});
};

registerBtn.onclick = ()=>{
    const name = usernameInput.value.trim();
    const pass = passwordInput.value || '';
    const avatar = pfpInput.value.trim() || '';
    if(!name || !pass){ errorMsg.textContent='username and password required'; return; }
    const lower = name.toLowerCase();
    if(name.includes('<')||name.includes('>')||lower.includes('http')){ errorMsg.textContent="invalid username"; return; }
    ensureWS({type:'register', username:name, password:pass, avatar:avatar});
};

const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsCancel = document.getElementById('settingsCancel');
const settingsSave = document.getElementById('settingsSave');
const settingsError = document.getElementById('settingsError');
const set_newUsername = document.getElementById('set_newUsername');
const set_currentPassword = document.getElementById('set_currentPassword');
const set_newPassword = document.getElementById('set_newPassword');
const set_newPassword2 = document.getElementById('set_newPassword2');
const set_avatar = document.getElementById('set_avatar');
const tabAccountBtn = document.getElementById('tabAccount');
const tabAppearanceBtn = document.getElementById('tabAppearance');
const tabAccountPane = document.getElementById('tab_account');
const tabAppearancePane = document.getElementById('tab_appearance');
const set_reduceMotion = document.getElementById('set_reduceMotion');
const set_compactMode = document.getElementById('set_compactMode');
// Theme controls (appearance tab)
const set_theme = document.getElementById('set_theme');
const customThemeFields = document.getElementById('customThemeFields');
const set_fontUrl = document.getElementById('set_fontUrl');
const set_fontName = document.getElementById('set_fontName');
const set_textColor = document.getElementById('set_textColor');
const set_bgColor = document.getElementById('set_bgColor');
const set_panelColor = document.getElementById('set_panelColor');
const set_accentColor = document.getElementById('set_accentColor');
const set_bubbleColor = document.getElementById('set_bubbleColor');
const set_inputColor = document.getElementById('set_inputColor');
// date/time format controls
const set_dateOrder = document.getElementById('set_dateOrder');
const set_hourFormat = document.getElementById('set_hourFormat');

let _lastProfileChange = 0;
try{ _lastProfileChange = parseInt(localStorage.getItem('lastProfileChange')||'0',10) || 0;}catch(e){}

function openSettings(){
    if(!settingsModal) return;
    settingsError.textContent = '';
    set_newUsername.value = username || '';
    set_avatar.value = profilePic || '';
    set_currentPassword.value = '';
    set_newPassword.value = '';
    set_newPassword2.value = '';
    try{ if(tabAccountBtn && tabAppearanceBtn){ tabAccountBtn.classList.add('active'); tabAppearanceBtn.classList.remove('active'); tabAccountPane.style.display='block'; tabAppearancePane.style.display='none'; tabAppearancePane.setAttribute('aria-hidden','true'); } }catch(e){}
    try{ const rm = localStorage.getItem('reduce_motion'); if(set_reduceMotion){ set_reduceMotion.checked = !!rm; } }catch(e){}
    try{ const cm = localStorage.getItem('compact_mode'); if(set_compactMode){ set_compactMode.checked = !!cm; } }catch(e){}
    // load theme settings into the appearance UI
    try{
        const ts = localStorage.getItem('theme_settings');
        const t = ts ? JSON.parse(ts) : { theme: 'default' };
        if(set_theme) set_theme.value = t.theme || 'default';
        if(customThemeFields) customThemeFields.style.display = (t.theme === 'custom') ? 'block' : 'none';
        if(set_fontUrl) set_fontUrl.value = t.fontUrl || '';
        if(set_fontName) set_fontName.value = t.fontName || '';
        if(set_textColor) set_textColor.value = t.textColor || '#ffffff';
        if(set_bgColor) set_bgColor.value = t.bgColor || '#121212';
        if(set_panelColor) set_panelColor.value = t.panelColor || '#111111';
        if(set_accentColor) set_accentColor.value = t.accentColor || '#6c63ff';
        if(set_bubbleColor) set_bubbleColor.value = t.bubbleColor || '#242424';
        if(set_inputColor) set_inputColor.value = t.inputColor || '#161616';
        if(set_dateOrder) set_dateOrder.value = t.dateOrder || 'mdy';
        if(set_hourFormat) set_hourFormat.value = t.hourFormat || '12';
    }catch(e){}
    // restore saved modal size if available
    try{
        const mc = settingsModal.querySelector && settingsModal.querySelector('.modalContent');
        if(mc){
            const w = parseInt(localStorage.getItem('settings_modal_w')||'0',10) || 0;
            const h = parseInt(localStorage.getItem('settings_modal_h')||'0',10) || 0;
            if(w>0) mc.style.width = (w>0 ? (w + 'px') : '');
            if(h>0) mc.style.height = (h>0 ? (h + 'px') : '');
        }
    }catch(e){}
    settingsModal.setAttribute('aria-hidden','false');
}
function closeSettings(){
    if(!settingsModal) return;
    settingsModal.setAttribute('aria-hidden','true');
}

settingsBtn && settingsBtn.addEventListener('click', e=>{ openSettings(); });
settingsCancel && settingsCancel.addEventListener('click', e=>{ closeSettings(); });

// Persist settings modal size when user resizes it (uses ResizeObserver if available)
function setupModalResizePersistence(){
    try{
        if(!settingsModal) return;
        const mc = settingsModal.querySelector && settingsModal.querySelector('.modalContent');
        if(!mc) return;
        const saveSize = function(){
            try{
                localStorage.setItem('settings_modal_w', String(Math.max(0, Math.round(mc.offsetWidth))));
                localStorage.setItem('settings_modal_h', String(Math.max(0, Math.round(mc.offsetHeight))));
            }catch(e){}
        };
        // observe size changes
        if(window.ResizeObserver){
            try{
                const ro = new ResizeObserver(()=>{ saveSize(); });
                ro.observe(mc);
            }catch(e){
                // fallback to mouseup-based save
                let prevW = mc.offsetWidth, prevH = mc.offsetHeight;
                document.addEventListener('mouseup', ()=>{ try{ if(mc.offsetWidth !== prevW || mc.offsetHeight !== prevH){ prevW = mc.offsetWidth; prevH = mc.offsetHeight; saveSize(); } }catch(e){} });
            }
        }else{
            let prevW = mc.offsetWidth, prevH = mc.offsetHeight;
            document.addEventListener('mouseup', ()=>{ try{ if(mc.offsetWidth !== prevW || mc.offsetHeight !== prevH){ prevW = mc.offsetWidth; prevH = mc.offsetHeight; saveSize(); } }catch(e){} });
        }
    }catch(e){}
}

try{ setupModalResizePersistence(); }catch(e){}

// admin refresh banned list button
try{
    const arb = document.getElementById('adminRefreshBanned');
    if(arb){ arb.addEventListener('click', ()=>{ try{ if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'admin_list_banned'})); }catch(e){} }); }
}catch(e){}
try{
    const arp = document.getElementById('adminRefreshPending');
    if(arp){ arp.addEventListener('click', ()=>{ try{ if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'admin_list_pending'})); }catch(e){} }); }
}catch(e){}

settingsSave && settingsSave.addEventListener('click', e=>{
    settingsError.textContent = '';
    const newName = (set_newUsername.value||'').trim();
    const curPass = (set_currentPassword.value||'');
    const newPass = (set_newPassword.value||'');
    const newPass2 = (set_newPassword2.value||'');
    const avatar = (set_avatar.value||'').trim();
        try{
            const appearanceActive = (tabAppearancePane && tabAppearancePane.style && tabAppearancePane.style.display !== 'none') || (tabAppearanceBtn && tabAppearanceBtn.classList && tabAppearanceBtn.classList.contains('active'));
            const adminActive = (function(){ try{ const tabAdminBtn = document.getElementById('tabAdmin'); const tabAdminPane = document.getElementById('tab_admin'); return (tabAdminPane && tabAdminPane.style && tabAdminPane.style.display !== 'none') || (tabAdminBtn && tabAdminBtn.classList && tabAdminBtn.classList.contains('active')); }catch(e){ return false; } })();
            if(appearanceActive || adminActive){
                try{
                    const rm = !!(set_reduceMotion && set_reduceMotion.checked);
                    if(rm){ localStorage.setItem('reduce_motion','1'); document.documentElement.classList.add('reduced-motion'); }
                    else { localStorage.removeItem('reduce_motion'); document.documentElement.classList.remove('reduced-motion'); }
                    // compact mode handling
                    try{
                        const cm = !!(set_compactMode && set_compactMode.checked);
                        if(cm){ localStorage.setItem('compact_mode','1'); document.documentElement.classList.add('compact-mode'); }
                        else { localStorage.removeItem('compact_mode'); document.documentElement.classList.remove('compact-mode'); }
                    }catch(_e){}
                }catch(_e){}
                // save and apply theme settings
                try{
                    const theme = (set_theme && set_theme.value) || 'default';
                    let themeObj = { theme };
                    if(theme === 'custom'){
                        themeObj.fontUrl = (set_fontUrl && set_fontUrl.value) || '';
                        themeObj.fontName = (set_fontName && set_fontName.value) || '';
                        themeObj.textColor = (set_textColor && set_textColor.value) || '#ffffff';
                        themeObj.bgColor = (set_bgColor && set_bgColor.value) || '#121212';
                        themeObj.panelColor = (set_panelColor && set_panelColor.value) || '#111111';
                        themeObj.accentColor = (set_accentColor && set_accentColor.value) || '#6c63ff';
                        themeObj.bubbleColor = (set_bubbleColor && set_bubbleColor.value) || '#242424';
                        themeObj.inputColor = (set_inputColor && set_inputColor.value) || '#161616';
                    }else{
                        // preserve any previously saved custom appearance values (font/colors)
                        try{
                            const prev = JSON.parse(localStorage.getItem('theme_settings')||'{}');
                            if(prev && prev.fontUrl) themeObj.fontUrl = prev.fontUrl;
                            if(prev && prev.fontName) themeObj.fontName = prev.fontName;
                            if(prev && prev.textColor) themeObj.textColor = prev.textColor;
                            if(prev && prev.bgColor) themeObj.bgColor = prev.bgColor;
                            if(prev && prev.panelColor) themeObj.panelColor = prev.panelColor;
                            if(prev && prev.accentColor) themeObj.accentColor = prev.accentColor;
                            if(prev && prev.bubbleColor) themeObj.bubbleColor = prev.bubbleColor;
                            if(prev && prev.inputColor) themeObj.inputColor = prev.inputColor;
                        }catch(e){}
                    }
                    // include date/time settings for all themes
                    try{
                        themeObj.dateOrder = (set_dateOrder && set_dateOrder.value) || (themeObj.dateOrder || 'mdy');
                        themeObj.hourFormat = (set_hourFormat && set_hourFormat.value) || (themeObj.hourFormat || '12');
                    }catch(e){}
                    localStorage.setItem('theme_settings', JSON.stringify(themeObj));
                    applyThemeFromSettings(themeObj);
                }catch(_e){ }
                settingsError.textContent = 'saved';
                setTimeout(()=>{ settingsError.textContent=''; closeSettings(); }, 700);
                return;
            }

        }catch(e){}

        if(!curPass){ settingsError.textContent = 'current password required'; return; }
    if(newPass && newPass !== newPass2){ settingsError.textContent = 'new passwords do not match'; return; }
    const now = Date.now();
    if(now - _lastProfileChange < 30000){ settingsError.textContent = 'profile changes limited to once every 30s'; return; }

    ensureWS({ type:'update_profile', current_password: curPass, new_username: newName === username ? undefined : newName, new_password: newPass || undefined, avatar: avatar || undefined });
    _lastProfileChange = now;
    try{ localStorage.setItem('lastProfileChange', String(_lastProfileChange)); }catch(e){}
    settingsError.textContent = 'saving...';
});

if(tabAccountBtn && tabAppearanceBtn){
    tabAccountBtn.addEventListener('click', ()=>{
        tabAccountBtn.classList.add('active');
        tabAppearanceBtn.classList.remove('active');
        try{ const tabAdminBtn = document.getElementById('tabAdmin'); if(tabAdminBtn) tabAdminBtn.classList.remove('active'); }catch(e){}
        tabAccountPane.style.display = 'block';
        tabAppearancePane.style.display = 'none';
        try{ const tabAdminPane = document.getElementById('tab_admin'); if(tabAdminPane) tabAdminPane.style.display = 'none'; }catch(e){}
        tabAppearancePane.setAttribute('aria-hidden','true');
    });
    tabAppearanceBtn.addEventListener('click', ()=>{
        tabAppearanceBtn.classList.add('active');
        tabAccountBtn.classList.remove('active');
        try{ const tabAdminBtn = document.getElementById('tabAdmin'); if(tabAdminBtn) tabAdminBtn.classList.remove('active'); }catch(e){}
        tabAppearancePane.style.display = 'block';
        tabAccountPane.style.display = 'none';
        try{ const tabAdminPane = document.getElementById('tab_admin'); if(tabAdminPane) tabAdminPane.style.display = 'none'; }catch(e){}
        tabAppearancePane.setAttribute('aria-hidden','false');
    });
    try{
        const tabAdminBtn = document.getElementById('tabAdmin');
        const tabAdminPane = document.getElementById('tab_admin');
        if(tabAdminBtn && tabAdminPane){
            tabAdminBtn.addEventListener('click', ()=>{
                tabAdminBtn.classList.add('active');
                tabAccountBtn.classList.remove('active');
                tabAppearanceBtn.classList.remove('active');
                tabAdminPane.style.display = 'block';
                tabAccountPane.style.display = 'none';
                tabAppearancePane.style.display = 'none';
                tabAdminPane.setAttribute('aria-hidden','false');
                    // load banned and pending lists
                    try{ if(ws && ws.readyState===WebSocket.OPEN){ ws.send(JSON.stringify({type:'admin_list_banned'})); ws.send(JSON.stringify({type:'admin_list_pending'})); } }catch(e){}
            });
        }
    }catch(e){}
}

try{
    const saved = localStorage.getItem('reduce_motion');
    if(saved){ document.documentElement.classList.add('reduced-motion'); }
}catch(e){}
if(set_reduceMotion){
    set_reduceMotion.addEventListener('change', ()=>{
        try{
            if(set_reduceMotion.checked){
                document.documentElement.classList.add('reduced-motion');
                localStorage.setItem('reduce_motion','1');
            }else{
                document.documentElement.classList.remove('reduced-motion');
                localStorage.removeItem('reduce_motion');
            }
        }catch(e){}
    });
}

try{
    const savedCompact = localStorage.getItem('compact_mode');
    if(savedCompact){ document.documentElement.classList.add('compact-mode'); }
}catch(e){}
if(set_compactMode){
    set_compactMode.addEventListener('change', ()=>{
        try{
            if(set_compactMode.checked){
                document.documentElement.classList.add('compact-mode');
                localStorage.setItem('compact_mode','1');
            }else{
                document.documentElement.classList.remove('compact-mode');
                localStorage.removeItem('compact_mode');
            }
        }catch(e){}
    });
}

// Theme application helper
function removeCustomFontFace(){
    try{
        const existing = document.getElementById('customFontFace');
        if(existing) existing.remove();
    }catch(e){}
}

function applyThemeFromSettings(t){
    try{
        const theme = (t && t.theme) || 'default';
        if(theme === 'default'){
            // clear overrides
            removeCustomFontFace();
            document.documentElement.style.removeProperty('--bg');
            document.documentElement.style.removeProperty('--panel');
            document.documentElement.style.removeProperty('--muted');
            document.documentElement.style.removeProperty('--accent');
            document.documentElement.style.removeProperty('--bubble');
            document.documentElement.style.removeProperty('--input');
            document.documentElement.style.removeProperty('--app-font');
            document.body.style.color = '';
        }else if(theme === 'super_dark'){
            document.documentElement.style.setProperty('--bg', '#000000');
            document.documentElement.style.setProperty('--panel', '#050505');
            document.documentElement.style.setProperty('--muted', '#bdbdbd');
            document.documentElement.style.setProperty('--accent', '#6c63ff');
            document.documentElement.style.setProperty('--bubble', '#0b0b0b');
            document.documentElement.style.setProperty('--input', '#050505');
            document.body.style.color = '#ffffff';
        }else if(theme === 'custom'){
            // apply custom values
            if(t.fontUrl && t.fontName){
                removeCustomFontFace();
                const s = document.createElement('style');
                s.id = 'customFontFace';
                s.textContent = `@font-face { font-family: '${t.fontName}'; src: url('${t.fontUrl}'); }`;
                document.head.appendChild(s);
                document.documentElement.style.setProperty('--app-font', `'${t.fontName}'`);
            }else if(t.fontName){
                document.documentElement.style.setProperty('--app-font', `'${t.fontName}'`);
            }
            if(t.textColor) document.body.style.color = t.textColor;
            if(t.bgColor) document.documentElement.style.setProperty('--bg', t.bgColor);
            if(t.panelColor) document.documentElement.style.setProperty('--panel', t.panelColor);
            if(t.accentColor) document.documentElement.style.setProperty('--accent', t.accentColor);
            if(t.bubbleColor) document.documentElement.style.setProperty('--bubble', t.bubbleColor);
            if(t.inputColor) document.documentElement.style.setProperty('--input', t.inputColor);
            if(t.textColor) document.documentElement.style.setProperty('--muted', t.textColor);
        }
        // update time format settings used for timestamp rendering
        try{
            if(t && t.dateOrder) timeFormatSettings.dateOrder = t.dateOrder;
            if(t && t.hourFormat) timeFormatSettings.hourFormat = t.hourFormat;
        }catch(e){}
    }catch(e){}
}

// wire theme selector UI to show/hide custom fields
try{
    if(set_theme){
        set_theme.addEventListener('change', ()=>{
            try{ if(customThemeFields) customThemeFields.style.display = (set_theme.value === 'custom') ? 'block' : 'none'; }catch(e){}
        });
    }
    // apply saved theme on load
    try{ const ts = localStorage.getItem('theme_settings'); if(ts){ applyThemeFromSettings(JSON.parse(ts)); } }catch(e){}
}catch(e){}

const _orig_commonOnMessage = commonOnMessage;
function commonOnMessageWrapper(event){
    const data = JSON.parse(event.data);
    if(data.type === 'update_profile'){
        if(data.ok){
            const old = username;
            username = data.username || username;
            profilePic = data.avatar || profilePic;
            try{ localStorage.setItem('chat_name', username); localStorage.setItem('chat_pfp', profilePic||''); }catch(e){}
            try{
                if(old && old !== username){
                    if(onlineAvatars[old]){
                        onlineAvatars[username] = onlineAvatars[old];
                        delete onlineAvatars[old];
                    }
                }
                onlineAvatars[username] = profilePic || onlineAvatars[username] || '';
                for(const m of messages){ if(m && m.name === old){ m.name = username; m.avatar = profilePic || m.avatar; } }
                renderMessages();
            }catch(e){}
            try{ if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'presence', user:{name:username, avatar:profilePic}})); }catch(e){}
            settingsError.textContent = 'saved';
            setTimeout(()=>{ settingsError.textContent=''; closeSettings(); }, 900);
        }else{
            settingsError.textContent = data.message || 'update failed';
            _lastProfileChange = 0; try{ localStorage.removeItem('lastProfileChange'); }catch(e){}
        }
        return;
    }
    _orig_commonOnMessage(event);
}

ws && (ws.onmessage = (event)=>{ commonOnMessageWrapper(event); });
const _orig_ensureWS = ensureWS;
function ensureWSWrapper(onOpenSend){
    _orig_ensureWS(onOpenSend);
    if(ws){ ws.onmessage = (event)=>{ commonOnMessageWrapper(event); }; }
}
ensureWS = ensureWSWrapper;
