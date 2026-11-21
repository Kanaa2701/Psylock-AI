const chatBox   = document.getElementById("konten");
const prompt    = document.getElementById("teks");
const btnKirim  = document.getElementById("kirim");
const btnUpload = document.getElementById("btnUpload");
const fileInput = document.getElementById("fileInput");

const sidebar              = document.getElementById('sidebar');
const btnOpenSidebar       = document.getElementById('btnOpenSidebar');
const btnCloseSidebar      = document.getElementById('btnCloseSidebar');
const btnNewChatMini       = document.getElementById('btnNewChatMini');
const btnCollectionMini    = document.getElementById('btnCollectionMini');
const btnToggleSearch      = document.getElementById('btnToggleSearch');
const btnSearchMini        = document.getElementById('btnSearchMini');
const sidebarSearchWrapper = document.getElementById('sidebarSearchWrapper');
const searchChatInput      = document.getElementById('searchChat');
const sidebarHistory       = document.getElementById('sidebarHistory');
const btnNewChat           = document.getElementById('btnNewChat');
const btnCollection        = document.getElementById('btnCollection');

const searchModalOverlay   = document.getElementById('searchModalOverlay');
const modalSearchInput     = document.getElementById('modalSearchInput');
const btnClearSearch       = document.getElementById('btnClearSearch');
const btnCloseSearchModal  = document.getElementById('btnCloseSearchModal');
const searchResultsList    = document.getElementById('searchResultsList');
const searchSectionTitle   = document.getElementById('searchSectionTitle');

const btnScrollBottom      = document.getElementById("btnScrollBottom");
let userIsScrollingUp      = false;
let isCollectionView       = false;

let currentAbortController = null;
let isGeneratingResponse = false;

const sendIconSvg = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="19" x2="12" y2="5"></line>
        <polyline points="5 12 12 5 19 12"></polyline>
    </svg>
`;

const stopIconSvg = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <rect x="5" y="5" width="14" height="14" rx="2.5"></rect>
    </svg>
`;

function setGeneratingState(generating) {
    isGeneratingResponse = generating;
    if (!btnKirim) return;

    if (generating) {
        btnKirim.innerHTML = stopIconSvg;
        btnKirim.title = "Hentikan respons";
    } else {
        btnKirim.innerHTML = sendIconSvg;
        btnKirim.title = "kirim";
    }
}

function isMobileView() {
    return window.innerWidth <= 768;
}

function closeSidebar() {
    if (sidebar) sidebar.classList.add('closed');
    if (sidebarSearchWrapper) sidebarSearchWrapper.style.display = 'none';
}

function closeSidebarOnMobile() {
    if (isMobileView()) {
        closeSidebar();
    }
}

function setPromptVisible(isVisible) {
    const promptBar = document.querySelector('.prompt');
    if (promptBar) {
        promptBar.style.display = isVisible ? 'flex' : 'none';
    }
}

// Tutup sidebar saat menekan area sebelah kanan (di luar sidebar) — khusus HP saja
const mainContainer = document.querySelector('.container');
if (mainContainer) {
    mainContainer.addEventListener('click', () => {
        if (isMobileView() && sidebar && !sidebar.classList.contains('closed')) {
            closeSidebar();
        }
    });
}

chatBox.addEventListener("scroll", () => {
    const threshold = 100;
    const distanceFromBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight;
    
    if (distanceFromBottom > threshold) {
        userIsScrollingUp = true;
        if (btnScrollBottom) btnScrollBottom.style.display = "flex";
    } else {
        userIsScrollingUp = false;
        if (btnScrollBottom) btnScrollBottom.style.display = "none";
    }
});

if (btnScrollBottom) {
    btnScrollBottom.addEventListener("click", () => {
        chatBox.scrollTop = chatBox.scrollHeight;
        userIsScrollingUp = false;
        btnScrollBottom.style.display = "none";
    });
}

const defaultGreeting = "Halo, aku Psylock<br>Ada yang bisa aku bantu?";

let chatSessions = JSON.parse(localStorage.getItem('psylock_sessions')) || [
    { id: Date.now(), title: 'Percakapan baru', messages: [{ pengirim: 'bot', content: defaultGreeting }], history: [], isPinned: false }
];
let currentSessionId = localStorage.getItem('psylock_current_session') || chatSessions[0]?.id || Date.now();

let activeSession = chatSessions.find(s => s.id == currentSessionId);
if (!activeSession) {
    currentSessionId = chatSessions[0].id;
    activeSession = chatSessions[0];
}

let chatHistory = activeSession ? activeSession.history : [];
let attachedFile = null;
let sessionToDeleteId = null;

function saveSessions() {
    localStorage.setItem('psylock_sessions', JSON.stringify(chatSessions));
    localStorage.setItem('psylock_current_session', currentSessionId);
}

if (btnOpenSidebar) {
    btnOpenSidebar.addEventListener('click', () => { sidebar.classList.remove('closed'); });
}
if (btnCloseSidebar) {
    btnCloseSidebar.addEventListener('click', () => {
        closeSidebar();
    });
}
if (btnNewChatMini) {
    btnNewChatMini.addEventListener('click', () => { if (btnNewChat) btnNewChat.click(); });
}
if (btnCollectionMini) {
    btnCollectionMini.addEventListener('click', () => { if (btnCollection) btnCollection.click(); });
}

if (btnToggleSearch) {
    btnToggleSearch.addEventListener('click', () => {
        if (sidebar.classList.contains('closed')) sidebar.classList.remove('closed');
        openSearchModal();
    });
}
if (btnSearchMini) {
    btnSearchMini.addEventListener('click', () => {
        sidebar.classList.remove('closed');
        openSearchModal();
    });
}

function openSearchModal() {
    if (searchModalOverlay) {
        searchModalOverlay.style.display = 'flex';
        if (modalSearchInput) { modalSearchInput.value = ''; modalSearchInput.focus(); }
        if (btnClearSearch) btnClearSearch.style.display = 'none';
        renderModalSearchResults('');
    }
}

function closeSearchModal() {
    if (searchModalOverlay) searchModalOverlay.style.display = 'none';
}

if (btnCloseSearchModal) btnCloseSearchModal.addEventListener('click', closeSearchModal);
if (searchModalOverlay) {
    searchModalOverlay.addEventListener('click', (e) => {
        if (e.target === searchModalOverlay) closeSearchModal();
    });
}
if (modalSearchInput) {
    modalSearchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (btnClearSearch) btnClearSearch.style.display = val.length > 0 ? 'flex' : 'none';
        renderModalSearchResults(val);
    });
}
if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
        if (modalSearchInput) { modalSearchInput.value = ''; modalSearchInput.focus(); }
        btnClearSearch.style.display = 'none';
        renderModalSearchResults('');
    });
}

function renderModalSearchResults(filterText = '') {
    if (!searchResultsList) return;
    searchResultsList.innerHTML = '';
    const query = filterText.toLowerCase().trim();

    if (!query) {
        if (searchSectionTitle) searchSectionTitle.textContent = "Obrolan terbaru";
    } else {
        if (searchSectionTitle) searchSectionTitle.textContent = "Hasil pencarian";
    }

    const filtered = chatSessions.map(session => {
        if (!session.messages || session.messages.length <= 1) return null;
        const matchTitle = session.title.toLowerCase().includes(query);
        let matchedSnippet = '';
        if (query) {
            const foundMsg = session.messages.find(msg => {
                const plainText = msg.content.replace(/<[^>]*>?/gm, '').replace(/[*_#`]/g, '').toLowerCase();
                return plainText.includes(query);
            });
            if (foundMsg) {
                const cleanText = foundMsg.content.replace(/<[^>]*>?/gm, '').replace(/[*_#`]/g, '');
                const index = cleanText.toLowerCase().indexOf(query);
                if (index !== -1) {
                    const start = Math.max(0, index - 20);
                    const end = Math.min(cleanText.length, index + query.length + 30);
                    matchedSnippet = (start > 0 ? '...' : '') + cleanText.substring(start, end) + (end < cleanText.length ? '...' : '');
                } else {
                    matchedSnippet = cleanText.substring(0, 40) + '...';
                }
            }
        }
        const matchContent = matchedSnippet !== '';
        if (!query || matchTitle || matchContent) {
            return { session, matchedSnippet: matchTitle ? '' : matchedSnippet };
        }
        return null;
    }).filter(Boolean);

    if (filtered.length === 0) {
        searchResultsList.innerHTML = `<div style="padding: 20px; text-align: center; color: #64748b; font-size: 14px;">Tidak ada percakapan yang ditemukan.</div>`;
        return;
    }

    filtered.forEach(({ session, matchedSnippet }) => {
        const itemBtn = document.createElement('button');
        itemBtn.className = 'search-result-item';
        itemBtn.innerHTML = `
            <div class="search-result-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"></circle></svg>
            </div>
            <div class="search-result-text">
                <div class="search-result-title">${session.title} ${session.isPinned ? '📌' : ''}</div>
                ${matchedSnippet ? `<div class="search-result-snippet">${matchedSnippet}</div>` : ''}
            </div>
        `;
        itemBtn.addEventListener('click', () => {
            switchSession(session.id);
            closeSearchModal();
            closeSidebarOnMobile();
        });
        searchResultsList.appendChild(itemBtn);
    });
}

function openCollection() {
    isCollectionView = true;
    document.querySelectorAll('.history-item-wrapper.active').forEach(el => {
        el.classList.remove('active');
    });

    let allFiles = [];
    chatSessions.forEach(session => {
        if (session.messages) {
            session.messages.forEach(msg => {
                if (msg.content.includes("Mengirim file") || msg.content.includes("user-file-badge") || msg.content.includes("<img")) {
                    allFiles.push(`<div class="pesan ${msg.pengirim}">Sesi: <b>${session.title}</b><br>${msg.content}</div>`);
                }
            });
        }
    });

    chatBox.innerHTML = `
        <div class="pesan-wrapper bot-wrapper">
            <img src="avatar.jpeg" class="ai-avatar">
            <div class="pesan bot">
                📁 <b>Koleksi File & Gambar Anda:</b><br><br>
                ${allFiles.length > 0 ? allFiles.join('<hr style="margin: 10px 0; border:0; border-top:1px solid #cbd5e1;">') : "Belum ada file atau gambar yang pernah dikirim ke AI dalam riwayat percakapan."}
            </div>
        </div>
    `;
    if (btnNewChat) btnNewChat.classList.remove('active');
    if (btnCollection) btnCollection.classList.add('active');

    setPromptVisible(false);
    closeSidebarOnMobile();
}

if (btnCollection) {
    btnCollection.addEventListener('click', openCollection);
}

function renderHistory(filterText = '') {
    if (!sidebarHistory) return;
    sidebarHistory.innerHTML = '';
    
    let filtered = chatSessions.filter(session => 
        session.messages && session.messages.length > 1 &&
        session.title.toLowerCase().includes(filterText.toLowerCase())
    );

    filtered.sort((a, b) => {
        if (a.isPinned === b.isPinned) return 0;
        return a.isPinned ? -1 : 1;
    });

    filtered.forEach(session => {
        const wrapper = document.createElement('div');
        const isSessionActive = !isCollectionView && session.id == currentSessionId;
        wrapper.className = `history-item-wrapper ${isSessionActive ? 'active' : ''}`;

        const item = document.createElement('button');
        item.className = 'history-item';
        item.innerHTML = `<span>${session.title}</span>`;
        item.addEventListener('click', () => {
            switchSession(session.id);
            closeSidebarOnMobile();
        });

        const actionContainer = document.createElement('div');
        actionContainer.style.cssText = "display: flex; align-items: center; gap: 4px;";

        const pinBtn = document.createElement('button');
        pinBtn.className = 'btn-pin-history';
        pinBtn.title = session.isPinned ? 'Lepas sematan obrolan' : 'Sematkan obrolan';
        
        if (session.isPinned) {
            pinBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-.91 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path></svg>`;
        } else {
            pinBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(45deg);"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-.91 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path></svg>`;
        }
        pinBtn.style.cssText = "background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px; color: #64748b; border-radius: 4px;";
        
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePinSession(session.id);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete-history';
        deleteBtn.title = 'Hapus percakapan';
        deleteBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        deleteBtn.style.cssText = "background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px; color: #64748b; border-radius: 4px;";

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            promptDeleteSession(session.id);
        });

        actionContainer.appendChild(pinBtn);
        actionContainer.appendChild(deleteBtn);
        wrapper.appendChild(item);
        wrapper.appendChild(actionContainer);
        sidebarHistory.appendChild(wrapper);
    });

    const currentS = chatSessions.find(s => s.id == currentSessionId);
    if (!isCollectionView && currentS && currentS.messages.length <= 1 && btnNewChat) {
        btnNewChat.classList.add('active');
        if (btnCollection) btnCollection.classList.remove('active');
    } else if (btnNewChat) {
        btnNewChat.classList.remove('active');
    }
}

function togglePinSession(id) {
    const session = chatSessions.find(s => s.id == id);
    if (session) {
        session.isPinned = !session.isPinned;
        saveSessions();
        renderHistory();
    }
}

function promptDeleteSession(id) {
    sessionToDeleteId = id;
    const deleteModalOverlay = document.getElementById('deleteModalOverlay');
    if (deleteModalOverlay) deleteModalOverlay.style.display = 'flex';
}

const btnCancelDelete = document.getElementById('btnCancelDelete');
if (btnCancelDelete) {
    btnCancelDelete.addEventListener('click', () => {
        const deleteModalOverlay = document.getElementById('deleteModalOverlay');
        if (deleteModalOverlay) deleteModalOverlay.style.display = 'none';
        sessionToDeleteId = null;
    });
}

const btnConfirmDelete = document.getElementById('btnConfirmDelete');
if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', () => {
        if (!sessionToDeleteId) return;
        let id = sessionToDeleteId;
        const deleteModalOverlay = document.getElementById('deleteModalOverlay');
        if (deleteModalOverlay) deleteModalOverlay.style.display = 'none';

        if (chatSessions.length <= 1) {
            chatSessions = [{ id: Date.now(), title: 'Percakapan baru', messages: [{ pengirim: 'bot', content: defaultGreeting }], history: [], isPinned: false }];
            currentSessionId = chatSessions[0].id;
            chatHistory = [];
            chatBox.innerHTML = `<div class="pesan-wrapper bot-wrapper"><img src="avatar.jpeg" class="ai-avatar"><div class="pesan bot">${defaultGreeting}</div></div>`;
            setPromptVisible(true);
            saveSessions();
            renderHistory();
            sessionToDeleteId = null;
            return;
        }

        chatSessions = chatSessions.filter(s => s.id != id);
        if (currentSessionId == id) {
            currentSessionId = chatSessions[0].id;
            switchSession(currentSessionId);
        } else {
            saveSessions();
            renderHistory();
        }
        sessionToDeleteId = null;
    });
}

if (searchChatInput) {
    searchChatInput.addEventListener('input', (e) => { renderHistory(e.target.value); });
}

if (btnNewChat) {
    btnNewChat.addEventListener('click', () => {
        isCollectionView = false;
        const newSession = {
            id: Date.now(),
            title: 'Percakapan baru',
            messages: [{ pengirim: 'bot', content: defaultGreeting }],
            history: [],
            isPinned: false
        };
        chatSessions.unshift(newSession);
        currentSessionId = newSession.id;
        chatHistory = [];
        saveSessions();
        renderHistory();

        if (btnCollection) btnCollection.classList.remove('active');
        chatBox.innerHTML = `<div class="pesan-wrapper bot-wrapper"><img src="avatar.jpeg" class="ai-avatar"><div class="pesan bot">${defaultGreeting}</div></div>`;
        setPromptVisible(true);
        closeSidebarOnMobile();
    });
}

function switchSession(id) {
    isCollectionView = false;
    currentSessionId = id;
    const session = chatSessions.find(s => s.id == id);
    if (session) {
        chatHistory = session.history || [];
        chatBox.innerHTML = '';
        
        if (session.messages && session.messages.length > 0) {
            session.messages.forEach(msg => {
                displayMessageToDOM(msg.pengirim, msg.content, false);
            });
        } else {
            session.messages = [{ pengirim: 'bot', content: defaultGreeting }];
            saveSessions();
            chatBox.innerHTML = `<div class="pesan-wrapper bot-wrapper"><img src="avatar.jpeg" class="ai-avatar"><div class="pesan bot">${defaultGreeting}</div></div>`;
        }
        
        chatBox.scrollTop = chatBox.scrollHeight;
    }
    saveSessions();
    setPromptVisible(true);
    if (btnCollection) btnCollection.classList.remove('active');
    renderHistory();
}

function appendMessageToSession(pengirim, content) {
    let session = chatSessions.find(s => s.id == currentSessionId);
    if (session) {
        if (!session.messages) session.messages = [];
        session.messages.push({ pengirim, content });

        if (pengirim === 'user' && session.title === 'Percakapan baru') {
            const plainTitle = content.replace(/<[^>]*>?/gm, '').trim() || 'Gambar/File';
            session.title = plainTitle.substring(0, 30) + (plainTitle.length > 30 ? '...' : '');
        }
        saveSessions();
        renderHistory();
    }
}

function displayMessageToDOM(pengirim, chat, saveToSession = true) {
    let containerEl;

    if (pengirim === "bot") {
        containerEl = document.createElement("div");
        containerEl.classList.add("pesan-wrapper", "bot-wrapper");

        const avatar = document.createElement("img");
        avatar.src = "avatar.jpeg";
        avatar.className = "ai-avatar";
        containerEl.appendChild(avatar);

        const div = document.createElement("div");
        div.classList.add("pesan", pengirim);

        let parsedContent = chat;
        if (chat.includes("<span>") || chat.includes("<img")) {
            div.innerHTML = chat;
        } 
        else if (window.marked) {
            parsedContent = marked.parse(chat);
            div.innerHTML = parsedContent;
        }
        else {
            div.innerText = chat;
        }

        const hasCodeBlock = chat.includes("<pre>") || chat.includes("<code>") || chat.includes("```") || div.querySelector("pre");

        if (hasCodeBlock && !chat.includes("<span></span>")) {
            div.classList.add("has-copy-btn");

            const copyBtn = document.createElement("button");
            copyBtn.className = "btn-copy-msg";
            copyBtn.title = "Salin seluruh pesan";
            copyBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

            copyBtn.addEventListener("click", () => {
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = parsedContent;
                const textToCopy = tempDiv.textContent || tempDiv.innerText || "";
                
                navigator.clipboard.writeText(textToCopy).then(() => {
                    copyBtn.innerHTML = `✓`;
                    setTimeout(() => {
                        copyBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                    }, 1500);
                });
            });

            div.appendChild(copyBtn);
        }

        setTimeout(() => {
            const codeBlocks = div.querySelectorAll("pre");
            codeBlocks.forEach((preBlock) => {
                if (preBlock.querySelector(".btn-copy-code")) return;
                preBlock.style.position = "relative";
                const codeEl = preBlock.querySelector("code");

                const copyCodeBtn = document.createElement("button");
                copyCodeBtn.className = "btn-copy-code";
                copyCodeBtn.innerText = "Salin Kode";
                copyCodeBtn.style.cssText = "position: absolute; top: 6px; right: 6px; background: rgba(255,255,255,0.1); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.2); padding: 4px 8px; font-size: 11px; border-radius: 4px; cursor: pointer;";

                copyCodeBtn.addEventListener("click", () => {
                    const codeText = codeEl ? codeEl.innerText : preBlock.innerText;
                    navigator.clipboard.writeText(codeText).then(() => {
                        copyCodeBtn.innerText = "Tersalin!";
                        setTimeout(() => { copyCodeBtn.innerText = "Salin Kode"; }, 1500);
                    });
                });

                preBlock.appendChild(copyCodeBtn);
            });
        }, 50);

        containerEl.appendChild(div);
        chatBox.appendChild(containerEl);

    } else {
        containerEl = document.createElement("div");
        containerEl.classList.add("pesan-wrapper", "user-wrapper");

        const div = document.createElement("div");
        div.classList.add("pesan", pengirim);

        let formattedUserChat = chat;
        const legacyMatch = chat.match(/^\[Mengirim file:\s*(.+?)\](?:<br>)?([\s\S]*)$/i);
        if (legacyMatch && !chat.includes("<img")) {
            const fileName = legacyMatch[1];
            const promptPart = legacyMatch[2] || "";
            formattedUserChat = `<div class="user-file-badge">📎 ${fileName}</div>${promptPart ? `<div class="user-prompt-text">${promptPart}</div>` : ""}`;
        }

        div.innerHTML = formattedUserChat;

        containerEl.appendChild(div);
        chatBox.appendChild(containerEl);
    }

    if (!userIsScrollingUp) {
        chatBox.scrollTop = chatBox.scrollHeight; 
    } else {
        if (btnScrollBottom && pengirim === "bot") {
            btnScrollBottom.style.display = "flex";
        }
    }

    if (saveToSession) {
        appendMessageToSession(pengirim, chat);
    }

    return containerEl;
}

const newChat = (pengirim, chat) => {
    return displayMessageToDOM(pengirim, chat, true);
}

btnUpload.onclick = () => fileInput.click();

fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(uploadEvent) {
            const fullDataUrl = uploadEvent.target.result;
            attachedFile = {
                data: fullDataUrl.split(',')[1],
                previewUrl: fullDataUrl,
                mimeType: file.type,
                name: file.name
            };
            prompt.placeholder = `File dilampirkan: ${file.name}`;
        };
        reader.readAsDataURL(file);
    }
};

async function kirimGambar(promptGambar) {
    const waiting = newChat("bot", `<span></span><span></span><span></span>`);
    waiting.classList.add("typing");
    const promptInstruksi = promptGambar;

    try {
        const response = await fetch("/api/image-prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ promptGambar }),
            signal: currentAbortController ? currentAbortController.signal : undefined
        });
        const hasil = await response.json();
        if (!response.ok) throw new Error(hasil.error || "Gagal membuat prompt gambar");

        let promptMatang = promptInstruksi;
        if (hasil.candidates?.[0]?.content?.parts?.[0]?.text) {
            promptMatang = hasil.candidates[0].content.parts[0].text.trim();
        }

        waiting.remove();
        let session = chatSessions.find(s => s.id == currentSessionId);
        if (session && session.messages) {
            session.messages = session.messages.filter(m => !m.content.includes("<span></span>"));
            saveSessions();
        }

        const encodedPrompt = encodeURIComponent(promptMatang);
        const imageUrl = `https://pollinations.ai/prompt/${encodedPrompt}`;
        const balasanGambar = `Berikut adalah hasil gambar untuk **"${promptGambar}"**:\n\n![Hasil Gambar](${imageUrl})`;

        chatHistory.push({ role: "model", parts: [{ text: balasanGambar }] });
        let activeS = chatSessions.find(s => s.id == currentSessionId);
        if (activeS) activeS.history = chatHistory;

        newChat("bot", balasanGambar);
    } catch (error) {
        waiting.remove();
        let session = chatSessions.find(s => s.id == currentSessionId);
        if (session && session.messages) {
            session.messages = session.messages.filter(m => !m.content.includes("<span></span>"));
            saveSessions();
        }
        if (error.name === "AbortError") {
            newChat("bot", "Respons dihentikan.");
        } else {
            console.error("Gagal meracik gambar:", error);
            newChat("bot", "Maaf, gagal membuat gambar saat ini.");
        }
    } finally {
        currentAbortController = null;
        setGeneratingState(false);
    }
}

async function getAiResponse(chatText, fileData) {
    let userParts = [];
    if (chatText) userParts.push({ text: chatText });
    if (fileData) {
        userParts.push({ inline_data: { mime_type: fileData.mimeType, data: fileData.data } });
    }

    chatHistory.push({ role: "user", parts: userParts });
    let activeS = chatSessions.find(s => s.id == currentSessionId);
    if (activeS) activeS.history = chatHistory;

    const waiting = newChat("bot", `<span></span><span></span><span></span>`);
    waiting.classList.add("typing");

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: chatHistory }),
            signal: currentAbortController ? currentAbortController.signal : undefined
        });
        const hasil = await response.json();
        if (!response.ok) throw new Error(hasil.error || "Gemini API request failed");

        if (hasil.candidates?.[0]?.content?.parts?.[0]?.text) {
            const aiResponse = hasil.candidates[0].content.parts[0].text;
            chatHistory.push({ role: "model", parts: [{ text: aiResponse }] });
            let activeS2 = chatSessions.find(s => s.id == currentSessionId);
            if (activeS2) activeS2.history = chatHistory;

            waiting.remove();
            let session = chatSessions.find(s => s.id == currentSessionId);
            if (session && session.messages) {
                session.messages = session.messages.filter(m => !m.content.includes("<span></span>"));
                saveSessions();
            }
            newChat("bot", aiResponse);
        } else {
            throw new Error("Invalid response format from API");
        }
    } catch (error) {
        waiting.remove();
        let session = chatSessions.find(s => s.id == currentSessionId);
        if (session && session.messages) {
            session.messages = session.messages.filter(m => !m.content.includes("<span></span>"));
            saveSessions();
        }
        chatHistory.pop();
        let activeS3 = chatSessions.find(s => s.id == currentSessionId);
        if (activeS3) activeS3.history = chatHistory;

        if (error.name === "AbortError") {
            newChat("bot", "Respons dihentikan.");
        } else {
            console.error("Error:", error);
            newChat("bot", "Error Responding");
        }
    } finally {
        currentAbortController = null;
        setGeneratingState(false);
        prompt.placeholder = "Tuliskan pesan anda..";
        attachedFile = null;
        fileInput.value = "";
    }
}

prompt.addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = (this.scrollHeight) + "px";
});

function keepChatVisibleOnKeyboard() {
    if (!isMobileView() || !chatBox) return;
    setTimeout(() => {
        if (!userIsScrollingUp) {
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    }, 150);
}

prompt.addEventListener("focus", keepChatVisibleOnKeyboard);

if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
        if (document.activeElement === prompt) {
            keepChatVisibleOnKeyboard();
        }
    });
}

btnKirim.onclick = () => {
    if (isGeneratingResponse) {
        if (currentAbortController) {
            currentAbortController.abort();
        }
        return;
    }

    const chat = prompt.value.trim();
    if (chat || attachedFile) {
        let tampilanUser = chat;
        if (attachedFile) {
            if (attachedFile.mimeType && attachedFile.mimeType.startsWith("image/") && attachedFile.previewUrl) {
                tampilanUser = `<img src="${attachedFile.previewUrl}" class="user-attached-img" alt="${attachedFile.name}">${chat ? `<div class="user-prompt-text">${chat}</div>` : ""}`;
            } else {
                tampilanUser = `<div class="user-file-badge">📎 ${attachedFile.name}</div>${chat ? `<div class="user-prompt-text">${chat}</div>` : ""}`;
            }
        }
        newChat("user", tampilanUser);
        
        prompt.value = '';
        prompt.style.height = "auto";

        currentAbortController = new AbortController();
        setGeneratingState(true);

        const pesanLower = chat.toLowerCase();
        if (!attachedFile && (pesanLower.startsWith("buatkan gambar") || pesanLower.startsWith("tampilkan gambar") || pesanLower.startsWith("gambar "))) {
            const keywordGambar = chat.replace(/^(buatkan gambar|tampilkan gambar|gambar)\s*/i, "");
            setTimeout(() => { kirimGambar(keywordGambar); }, 500);
        } else {
            const fileKirim = attachedFile;
            attachedFile = null; 
            getAiResponse(chat, fileKirim);
        }
    }
};

prompt.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault(); 
        btnKirim.click();
    }
});

const btnMic = document.getElementById("btnMic");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (btnMic && SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = "id-ID";
    recognition.continuous = false; 
    recognition.interimResults = false;
    let isRecording = false;

    btnMic.onclick = async () => {
        if (isRecording) { recognition.stop(); return; }
        try { recognition.start(); } catch (e) { console.error("Gagal menjalankan mic:", e); }
    };

    recognition.onstart = () => {
        isRecording = true;
        btnMic.style.background = "#ef4444";
        const voiceIcon = document.querySelector(".voice-icon");
        if (voiceIcon) voiceIcon.classList.add("recording-pulse");
    };

    recognition.onresult = (event) => {
        const hasilSuara = event.results[0][0].transcript;
        prompt.value = hasilSuara;
        prompt.style.height = "auto";
        prompt.style.height = prompt.scrollHeight + "px";
        btnKirim.click(); 
    };

    recognition.onend = () => {
        isRecording = false;
        btnMic.style.background = "transparent";
        const voiceIcon = document.querySelector(".voice-icon");
        if (voiceIcon) voiceIcon.classList.remove("recording-pulse");
    };

    recognition.onerror = (event) => {
        console.error("Error Speech Recognition:", event.error);
        isRecording = false;
        btnMic.style.background = "transparent";
        const voiceIcon = document.querySelector(".voice-icon");
        if (voiceIcon) voiceIcon.classList.remove("recording-pulse");
    };
} else if (btnMic) {
    btnMic.style.display = "none";
}

const imageZoomModal = document.getElementById("imageZoomModal");
const zoomedImageEl = document.getElementById("zoomedImageEl");
const btnCloseZoomModal = document.getElementById("btnCloseZoomModal");

function openImageZoomModal(src, alt = "Gambar") {
    if (!imageZoomModal || !zoomedImageEl || !src) return;
    zoomedImageEl.src = src;
    zoomedImageEl.alt = alt;
    imageZoomModal.style.display = "flex";
}

function closeImageZoomModal() {
    if (!imageZoomModal) return;
    imageZoomModal.style.display = "none";
    if (zoomedImageEl) zoomedImageEl.src = "";
}

if (btnCloseZoomModal) {
    btnCloseZoomModal.addEventListener("click", closeImageZoomModal);
}

if (imageZoomModal) {
    imageZoomModal.addEventListener("click", (e) => {
        if (e.target === imageZoomModal) {
            closeImageZoomModal();
        }
    });
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && imageZoomModal && imageZoomModal.style.display === "flex") {
        closeImageZoomModal();
    }
});

chatBox.addEventListener("click", (e) => {
    const clickedImg = e.target.closest("img");
    if (!clickedImg) return;
    if (clickedImg.classList.contains("ai-avatar")) return;
    if (!clickedImg.src) return;
    openImageZoomModal(clickedImg.src, clickedImg.alt || "Pratinjau gambar");
});

window.addEventListener('DOMContentLoaded', () => {
    closeSidebarOnMobile();
    switchSession(currentSessionId);
    renderHistory();
});