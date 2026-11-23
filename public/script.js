const chatBox   = document.getElementById("konten");
const prompt    = document.getElementById("teks");
const btnKirim  = document.getElementById("kirim");
const btnUpload = document.getElementById("btnUpload");
const fileInput = document.getElementById("fileInput");
const attachmentPreviewList = document.getElementById("attachmentPreviewList");

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
let activeCollectionTab    = 'all'; // 'all' | 'photo' | 'file'

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

function isTouchOrMobileDevice() {
    return isMobileView() || ('ontouchstart' in window && navigator.maxTouchPoints > 0 && window.innerWidth <= 1024);
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

function getSessionById(id) {
    return chatSessions.find(s => String(s.id) === String(id));
}

function isFreshEmptySession(session) {
    return Boolean(session && (!session.messages || session.messages.length <= 1));
}

function getPendingNewChatSession() {
    return chatSessions.find(s => isFreshEmptySession(s));
}

function syncSidebarActiveStates() {
    if (btnCollection) {
        btnCollection.classList.toggle('active', isCollectionView);
    }
    if (btnNewChat) {
        const currentS = getSessionById(currentSessionId);
        const isNewChatActive = !isCollectionView && isFreshEmptySession(currentS);
        btnNewChat.classList.toggle('active', Boolean(isNewChatActive));
    }
    document.querySelectorAll('.history-item-wrapper').forEach(wrapper => {
        const sessionId = wrapper.dataset.sessionId;
        const shouldBeActive = !isCollectionView && String(sessionId) === String(currentSessionId);
        wrapper.classList.toggle('active', shouldBeActive);
    });
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
const initialTimestamp = Date.now();

let chatSessions = JSON.parse(localStorage.getItem('psylock_sessions')) || [
    { id: initialTimestamp, lastActiveAt: initialTimestamp, title: 'Percakapan baru', messages: [{ pengirim: 'bot', content: defaultGreeting }], history: [], draft: '', isPinned: false }
];
let currentSessionId = localStorage.getItem('psylock_current_session') || chatSessions[0]?.id || initialTimestamp;

let activeSession = getSessionById(currentSessionId);
if (!activeSession) {
    currentSessionId = chatSessions[0].id;
    activeSession = chatSessions[0];
}

let chatHistory = activeSession ? activeSession.history : [];
let attachedFiles = [];
let sessionToDeleteId = null;
let pendingDeletePhotoMeta = null;

function saveCurrentDraft() {
    if (!prompt || isCollectionView) return;
    const session = getSessionById(currentSessionId);
    if (session) {
        session.draft = prompt.value;
    }
}

function loadSessionDraft(session) {
    if (!prompt) return;
    prompt.value = session && typeof session.draft === 'string' ? session.draft : '';
    prompt.style.height = "auto";
    if (prompt.value) {
        prompt.style.height = prompt.scrollHeight + "px";
    }
}

function saveSessions() {
    saveCurrentDraft();
    localStorage.setItem('psylock_sessions', JSON.stringify(chatSessions));
    localStorage.setItem('psylock_current_session', currentSessionId);
}

window.addEventListener('beforeunload', () => {
    saveSessions();
});

function renderAttachmentPreviews() {
    if (!attachmentPreviewList) return;
    attachmentPreviewList.innerHTML = "";

    if (!attachedFiles.length) {
        attachmentPreviewList.style.display = "none";
        if (prompt) {
            prompt.placeholder = "";
            prompt.placeholder = "Tuliskan pesan anda..";
        }
        return;
    }

    attachmentPreviewList.style.display = "flex";
    if (prompt) prompt.placeholder = "Tambahkan pesan...";

    attachedFiles.forEach((item, index) => {
        const card = document.createElement("div");
        const isImage = item.mimeType && item.mimeType.startsWith("image/") && item.previewUrl;
        card.className = `preview-card ${isImage ? "preview-card-image" : "preview-card-file"}`;

        if (isImage) {
            const img = document.createElement("img");
            img.src = item.previewUrl;
            img.alt = item.name;
            img.style.cursor = "pointer";
            img.addEventListener("click", (e) => {
                e.stopPropagation();
                openImageEditor(index);
            });
            card.appendChild(img);
        } else {
            const extLabel = (item.name.split(".").pop() || "FILE").toUpperCase();
            card.innerHTML = `
                <div class="preview-file-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <span>${extLabel}</span>
                </div>
                <div class="preview-file-name" title="${item.name}">${item.name}</div>
            `;
        }

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn-remove-attachment";
        removeBtn.title = "Batalkan lampiran";
        removeBtn.innerHTML = "&times;";
        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            attachedFiles.splice(index, 1);
            if (fileInput) fileInput.value = "";
            renderAttachmentPreviews();
        });

        card.appendChild(removeBtn);
        attachmentPreviewList.appendChild(card);
    });
}

function clearAttachedFileUI() {
    attachedFiles = [];
    if (fileInput) fileInput.value = "";
    renderAttachmentPreviews();
}

if (btnOpenSidebar) {
    btnOpenSidebar.addEventListener('click', () => {
        sidebar.classList.remove('closed');
        syncSidebarActiveStates();
    });
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
        syncSidebarActiveStates();
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

function extractCollectionItemsFromSessions() {
    const items = [];

    chatSessions.forEach((session) => {
        if (!Array.isArray(session.messages)) return;

        session.messages.forEach((msg, msgIndex) => {
            if (!msg || typeof msg.content !== 'string') return;

            const tempDiv = document.createElement('div');
            if (msg.pengirim === 'bot' && window.marked && !msg.content.includes('<img') && !msg.content.includes('<span>')) {
                tempDiv.innerHTML = marked.parse(msg.content);
            } else {
                tempDiv.innerHTML = msg.content;
            }

            // 1. Foto (hindari avatar AI)
            const imgs = Array.from(tempDiv.querySelectorAll('img')).filter(
                (img) => !img.classList.contains('ai-avatar') && img.getAttribute('src')
            );
            imgs.forEach((img) => {
                items.push({
                    type: 'photo',
                    src: img.getAttribute('src'),
                    title: img.getAttribute('alt') || 'Foto',
                    sessionTitle: session.title || 'Percakapan',
                    sessionId: session.id,
                    messageIndex: msgIndex
                });
            });

            // 2. File dari badge lampiran
            const fileBadges = tempDiv.querySelectorAll('.user-file-badge');
            fileBadges.forEach((badge) => {
                const rawName = badge.textContent.replace(/^📎\s*/, '').trim() || 'File';
                const ext = (rawName.split('.').pop() || 'FILE').toUpperCase();
                items.push({
                    type: 'file',
                    name: rawName,
                    ext,
                    sessionTitle: session.title || 'Percakapan',
                    sessionId: session.id,
                    messageIndex: msgIndex
                });
            });

            // 3. Fallback format lama [Mengirim file: nama.ext]
            if (fileBadges.length === 0) {
                const legacyMatch = msg.content.match(/\[Mengirim file:\s*(.+?)\]/i);
                if (legacyMatch) {
                    const rawName = legacyMatch[1].trim();
                    const ext = (rawName.split('.').pop() || 'FILE').toUpperCase();
                    items.push({
                        type: 'file',
                        name: rawName,
                        ext,
                        sessionTitle: session.title || 'Percakapan',
                        sessionId: session.id,
                        messageIndex: msgIndex
                    });
                }
            }
        });
    });

    return items;
}

function renderCollectionContent() {
    const allItems = extractCollectionItemsFromSessions();
    const filteredItems = allItems.filter((item) => {
        if (activeCollectionTab === 'photo') return item.type === 'photo';
        if (activeCollectionTab === 'file') return item.type === 'file';
        return true;
    });

    const photoCount = allItems.filter((i) => i.type === 'photo').length;
    const fileCount = allItems.filter((i) => i.type === 'file').length;

    let cardsHtml = '';
    if (filteredItems.length === 0) {
        const emptyLabel =
            activeCollectionTab === 'photo'
                ? 'Belum ada foto dalam koleksi.'
                : activeCollectionTab === 'file'
                ? 'Belum ada file dalam koleksi.'
                : 'Belum ada foto atau file dalam riwayat percakapan.';
        cardsHtml = `<div class="collection-empty">${emptyLabel}</div>`;
    } else {
        cardsHtml = `<div class="collection-grid">${filteredItems
            .map((item) => {
                if (item.type === 'photo') {
                    return `
                        <div class="collection-card">
                            <img
                                src="${item.src}"
                                alt="${item.title}"
                                class="collection-photo-thumb"
                                data-session-id="${item.sessionId}"
                                data-message-index="${item.messageIndex}"
                            >
                            <div class="collection-meta" title="${item.sessionTitle}">Sesi: ${item.sessionTitle}</div>
                        </div>
                    `;
                }
                return `
                    <div class="collection-card">
                        <div class="collection-file-box">
                            <span>📄</span>
                            <span>${item.ext}</span>
                        </div>
                        <div class="collection-meta" title="${item.name}">${item.name}</div>
                        <div class="collection-meta" title="${item.sessionTitle}">Sesi: ${item.sessionTitle}</div>
                    </div>
                `;
            })
            .join('')}</div>`;
    }

    chatBox.innerHTML = `
        <div class="collection-view-container">
            <div class="collection-header">
                <div class="collection-title">Koleksi</div>
                <div class="collection-tabs" role="tablist" aria-label="Filter Koleksi">
                    <button type="button" class="collection-tab-btn ${activeCollectionTab === 'all' ? 'active' : ''}" data-col-tab="all">
                        Semua (${allItems.length})
                    </button>
                    <button type="button" class="collection-tab-btn ${activeCollectionTab === 'photo' ? 'active' : ''}" data-col-tab="photo">
                        Foto (${photoCount})
                    </button>
                    <button type="button" class="collection-tab-btn ${activeCollectionTab === 'file' ? 'active' : ''}" data-col-tab="file">
                        File (${fileCount})
                    </button>
                </div>
            </div>
            ${cardsHtml}
        </div>
    `;

    chatBox.querySelectorAll('.collection-tab-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            activeCollectionTab = btn.dataset.colTab || 'all';
            renderCollectionContent();
        });
    });

    chatBox.querySelectorAll('.collection-photo-thumb').forEach((thumb) => {
        thumb.addEventListener('click', (e) => {
            e.stopPropagation();
            openImageZoomModal(thumb.getAttribute('src'), thumb.getAttribute('alt') || 'Foto', {
                fromCollection: true,
                sessionId: thumb.dataset.sessionId,
                messageIndex: Number(thumb.dataset.messageIndex)
            });
        });
    });
}

function openCollection() {
    saveCurrentDraft();
    saveSessions();
    isCollectionView = true;
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    renderCollectionContent();
    setPromptVisible(false);
    syncSidebarActiveStates();
    closeSidebarOnMobile();
}

if (btnCollection) {
    btnCollection.addEventListener('click', openCollection);
}

function touchSessionToTop(session) {
    if (!session) return;
    const now = Date.now();
    const maxLastActive = chatSessions.reduce(
        (max, s) => Math.max(max, Number(s.lastActiveAt || s.id || 0)),
        0
    );
    session.lastActiveAt = Math.max(now, maxLastActive + 1);

    const idx = chatSessions.findIndex((s) => String(s.id) === String(session.id));
    if (idx > 0) {
        const [moved] = chatSessions.splice(idx, 1);
        chatSessions.unshift(moved);
    }
}

function renderHistory(filterText = '') {
    if (!sidebarHistory) return;
    sidebarHistory.innerHTML = '';

    const query = (filterText || '').toLowerCase().trim();

    let filtered = chatSessions.filter(session =>
        session.messages && session.messages.length > 1 &&
        (session.title || '').toLowerCase().includes(query)
    );

    // Percakapan terbaru selalu berada di paling atas
    filtered.sort((a, b) => {
        const timeA = Number(a.lastActiveAt || a.id || 0);
        const timeB = Number(b.lastActiveAt || b.id || 0);
        return timeB - timeA;
    });

    filtered.forEach(session => {
        const wrapper = document.createElement('div');
        wrapper.dataset.sessionId = session.id;
        const isSessionActive = !isCollectionView && String(session.id) === String(currentSessionId);
        wrapper.className = `history-item-wrapper ${isSessionActive ? 'active' : ''}`;

        const item = document.createElement('button');
        item.className = 'history-item';
        item.innerHTML = `<span>${session.title}</span>`;
        item.addEventListener('click', () => {
            switchSession(session.id);
            closeSidebarOnMobile();
        });

        const actionContainer = document.createElement('div');
        actionContainer.style.cssText = "display: flex; align-items: center; gap: 2px; flex-shrink: 0;";

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

    syncSidebarActiveStates();
}

function togglePinSession(id) {
    const session = getSessionById(id);
    if (session) {
        session.isPinned = !session.isPinned;
        saveSessions();
        renderHistory(searchChatInput ? searchChatInput.value : '');
    }
}

function promptDeleteSession(id) {
    sessionToDeleteId = id;
    pendingDeletePhotoMeta = null;
    const deleteModalOverlay = document.getElementById('deleteModalOverlay');
    if (deleteModalOverlay) {
        const titleEl = deleteModalOverlay.querySelector("h3");
        const descEl = deleteModalOverlay.querySelector("p");
        if (titleEl) titleEl.textContent = "Hapus Riwayat Chat";
        if (descEl) descEl.textContent = "Anda yakin ingin menghapus riwayat chat ini?";
        deleteModalOverlay.style.zIndex = "1000";
        deleteModalOverlay.style.display = 'flex';
    }
}

function removePhotoFromSession(meta) {
    if (!meta || !meta.sessionId) return;
    const session = getSessionById(meta.sessionId);
    if (!session) return;

    const rawTarget = (meta.src || "").trim();
    let decodedTarget = rawTarget;
    try {
        decodedTarget = decodeURIComponent(rawTarget);
    } catch (_) {}

    const isSameImageSrc = (candidateSrc) => {
        if (!rawTarget) return true;
        const c = (candidateSrc || "").trim();
        if (!c) return false;
        let decC = c;
        try {
            decC = decodeURIComponent(c);
        } catch (_) {}

        return (
            c === rawTarget ||
            decC === decodedTarget ||
            c === decodedTarget ||
            decC === rawTarget ||
            c.includes(rawTarget) ||
            rawTarget.includes(c) ||
            decC.includes(decodedTarget) ||
            decodedTarget.includes(decC)
        );
    };

    if (Array.isArray(session.messages)) {
        const msg =
            (typeof meta.messageIndex === "number" && session.messages[meta.messageIndex]) ||
            session.messages.find((m) => m && typeof m.content === "string" && m.content.includes(rawTarget));

        if (msg && typeof msg.content === "string") {
            const tempDiv = document.createElement("div");
            if (msg.pengirim === "bot" && window.marked && !msg.content.includes("<img") && !msg.content.includes("<span>")) {
                tempDiv.innerHTML = marked.parse(msg.content);
            } else {
                tempDiv.innerHTML = msg.content;
            }

            let removedAnyImg = false;
            tempDiv.querySelectorAll("img").forEach((img) => {
                if (img.classList.contains("ai-avatar")) return;
                if (isSameImageSrc(img.getAttribute("src"))) {
                    img.remove();
                    removedAnyImg = true;
                }
            });

            if (!removedAnyImg && msg.content.includes("![")) {
                const updatedMd = msg.content.replace(/!\[[^\]]*\]\(([^)]+)\)/g, (fullMatch, mdUrl) => {
                    const cleanUrl = mdUrl.trim().split(/\s+/)[0];
                    if (isSameImageSrc(cleanUrl)) {
                        removedAnyImg = true;
                        return "";
                    }
                    return fullMatch;
                });
                if (removedAnyImg) {
                    const fallbackDiv = document.createElement("div");
                    fallbackDiv.innerHTML = window.marked ? marked.parse(updatedMd) : updatedMd;
                    tempDiv.innerHTML = fallbackDiv.innerHTML;
                }
            }

            if (!removedAnyImg) {
                const reImg = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
                const updatedHtml = msg.content.replace(reImg, (fullTag, attrSrc) => {
                    if (isSameImageSrc(attrSrc)) {
                        removedAnyImg = true;
                        return "";
                    }
                    return fullTag;
                });
                if (removedAnyImg) {
                    tempDiv.innerHTML = updatedHtml;
                }
            }

            if (removedAnyImg) {
                const remainingText = (tempDiv.textContent || "").replace(/\s+/g, " ").trim();
                const remainingBadges = tempDiv.querySelectorAll(".user-file-badge").length;
                const remainingImgs = Array.from(tempDiv.querySelectorAll("img")).filter(
                    (i) => !i.classList.contains("ai-avatar")
                ).length;

                if (!remainingText && remainingBadges === 0 && remainingImgs === 0) {
                    const msgIdx = session.messages.indexOf(msg);
                    if (msgIdx !== -1) {
                        session.messages.splice(msgIdx, 1);
                    }
                } else {
                    tempDiv.querySelectorAll(".user-prompt-text").forEach((el) => {
                        if (!el.textContent.trim() && el.children.length === 0) el.remove();
                    });
                    msg.content = tempDiv.innerHTML.trim();
                }
            }
        }
    }

    if (Array.isArray(session.history)) {
        session.history = session.history
            .map((entry) => {
                if (!entry || !Array.isArray(entry.parts)) return entry;
                const filteredParts = entry.parts.filter((part) => {
                    if (part.inline_data && part.inline_data.data) {
                        const b64 = part.inline_data.data;
                        if (rawTarget.includes(b64) || decodedTarget.includes(b64)) {
                            return false;
                        }
                    }
                    if (typeof part.text === "string" && part.text.includes("![")) {
                        part.text = part.text.replace(/!\[[^\]]*\]\(([^)]+)\)/g, (m, u) =>
                            isSameImageSrc(u.trim().split(/\s+/)[0]) ? "" : m
                        );
                    }
                    return true;
                });
                return { ...entry, parts: filteredParts };
            })
            .filter((entry) => Array.isArray(entry.parts) && entry.parts.length > 0);
    }

    if (String(currentSessionId) === String(session.id)) {
        chatHistory = session.history || [];
    }

    saveSessions();
}

const btnCancelDelete = document.getElementById('btnCancelDelete');
if (btnCancelDelete) {
    btnCancelDelete.addEventListener('click', () => {
        const deleteModalOverlay = document.getElementById('deleteModalOverlay');
        if (deleteModalOverlay) {
            deleteModalOverlay.style.display = 'none';
            deleteModalOverlay.style.zIndex = "1000";
        }
        sessionToDeleteId = null;
        pendingDeletePhotoMeta = null;
    });
}

const btnConfirmDelete = document.getElementById('btnConfirmDelete');
if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', () => {
        const deleteModalOverlay = document.getElementById('deleteModalOverlay');

        if (pendingDeletePhotoMeta) {
            const photoMeta = pendingDeletePhotoMeta;
            pendingDeletePhotoMeta = null;

            if (deleteModalOverlay) {
                deleteModalOverlay.style.display = 'none';
                deleteModalOverlay.style.zIndex = "1000";
            }

            removePhotoFromSession(photoMeta);
            closeImageZoomModal();

            if (isCollectionView) {
                renderCollectionContent();
            }
            return;
        }

        if (!sessionToDeleteId) return;
        let id = sessionToDeleteId;
        if (deleteModalOverlay) {
            deleteModalOverlay.style.display = 'none';
            deleteModalOverlay.style.zIndex = "1000";
        }

        if (chatSessions.length <= 1) {
            const freshId = Date.now();
            chatSessions = [{ id: freshId, lastActiveAt: freshId, title: 'Percakapan baru', messages: [{ pengirim: 'bot', content: defaultGreeting }], history: [], draft: '', isPinned: false }];
            currentSessionId = chatSessions[0].id;
            chatHistory = [];
            chatBox.innerHTML = `<div class="pesan-wrapper bot-wrapper"><img src="avatar.jpeg" class="ai-avatar"><div class="pesan bot">${defaultGreeting}</div></div>`;
            loadSessionDraft(chatSessions[0]);
            setPromptVisible(true);
            saveSessions();
            renderHistory(searchChatInput ? searchChatInput.value : '');
            sessionToDeleteId = null;
            return;
        }

        chatSessions = chatSessions.filter(s => String(s.id) !== String(id));
        if (String(currentSessionId) === String(id)) {
            renderHistory();
            const firstVisible = sidebarHistory ? sidebarHistory.querySelector('.history-item-wrapper') : null;
            currentSessionId = firstVisible ? firstVisible.dataset.sessionId : chatSessions[0].id;
            switchSession(currentSessionId);
        } else {
            saveSessions();
            renderHistory(searchChatInput ? searchChatInput.value : '');
        }
        sessionToDeleteId = null;
    });
}

if (searchChatInput) {
    searchChatInput.addEventListener('input', (e) => { renderHistory(e.target.value); });
}

if (btnNewChat) {
    btnNewChat.addEventListener('click', () => {
        const currentText = prompt ? prompt.value : '';
        const currentHeight = prompt ? prompt.style.height : 'auto';
        const activeS = getSessionById(currentSessionId);

        if (!isCollectionView && activeS) {
            activeS.draft = currentText;
        }

        if (!isCollectionView && isFreshEmptySession(activeS)) {
            if (prompt) {
                prompt.value = currentText;
                prompt.style.height = currentHeight || 'auto';
                prompt.focus();
            }
            saveSessions();
            if (btnCollection) btnCollection.classList.remove('active');
            setPromptVisible(true);
            syncSidebarActiveStates();
            closeSidebarOnMobile();
            return;
        }

        const existingPending = getPendingNewChatSession();
        if (existingPending) {
            isCollectionView = false;
            currentSessionId = existingPending.id;
            touchSessionToTop(existingPending);
            chatHistory = existingPending.history || [];
            chatBox.innerHTML = `<div class="pesan-wrapper bot-wrapper"><img src="avatar.jpeg" class="ai-avatar"><div class="pesan bot">${defaultGreeting}</div></div>`;
            loadSessionDraft(existingPending);
            saveSessions();
            if (btnCollection) btnCollection.classList.remove('active');
            setPromptVisible(true);
            renderHistory(searchChatInput ? searchChatInput.value : '');
            closeSidebarOnMobile();
            return;
        }

        isCollectionView = false;
        const maxExistingTime = chatSessions.reduce(
            (max, s) => Math.max(max, Number(s.lastActiveAt || s.id || 0)),
            0
        );
        const newSessionId = Math.max(Date.now(), maxExistingTime + 1);
        const newSession = {
            id: newSessionId,
            lastActiveAt: newSessionId,
            title: 'Percakapan baru',
            messages: [{ pengirim: 'bot', content: defaultGreeting }],
            history: [],
            draft: '',
            isPinned: false
        };
        chatSessions.unshift(newSession);
        currentSessionId = newSession.id;
        chatHistory = [];
        loadSessionDraft(newSession);
        saveSessions();
        renderHistory(searchChatInput ? searchChatInput.value : '');

        if (btnCollection) btnCollection.classList.remove('active');
        chatBox.innerHTML = `<div class="pesan-wrapper bot-wrapper"><img src="avatar.jpeg" class="ai-avatar"><div class="pesan bot">${defaultGreeting}</div></div>`;
        setPromptVisible(true);
        closeSidebarOnMobile();
    });
}

function switchSession(id, preserveDraft = false) {
    if (!preserveDraft && !isCollectionView) {
        saveCurrentDraft();
    }
    isCollectionView = false;
    currentSessionId = id;
    const session = getSessionById(id);
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
        
        loadSessionDraft(session);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
    saveSessions();
    setPromptVisible(true);
    if (btnCollection) btnCollection.classList.remove('active');
    renderHistory(searchChatInput ? searchChatInput.value : '');
}

function appendMessageToSession(pengirim, content) {
    const session = getSessionById(currentSessionId);
    if (!session) return;

    if (!Array.isArray(session.messages)) session.messages = [];
    const wasFresh = session.messages.length <= 1;

    session.messages.push({ pengirim, content });

    if (pengirim === 'user' && session.title === 'Percakapan baru') {
        const plainTitle = content.replace(/<[^>]*>?/gm, '').trim() || 'Gambar/File';
        session.title = plainTitle.substring(0, 30) + (plainTitle.length > 30 ? '...' : '');
    }

    if (wasFresh || pengirim === 'user') {
        touchSessionToTop(session);
    }

    saveSessions();
    renderHistory(searchChatInput ? searchChatInput.value : '');
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
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = function(uploadEvent) {
            const fullDataUrl = uploadEvent.target.result;
            attachedFiles.push({
                data: fullDataUrl.split(',')[1],
                previewUrl: fullDataUrl,
                mimeType: file.type,
                name: file.name
            });
            renderAttachmentPreviews();
        };
        reader.readAsDataURL(file);
    });
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
        let session = getSessionById(currentSessionId);
        if (session && session.messages) {
            session.messages = session.messages.filter(m => !m.content.includes("<span></span>"));
            saveSessions();
        }

        const encodedPrompt = encodeURIComponent(promptMatang);
        const imageUrl = `https://pollinations.ai/prompt/${encodedPrompt}`;
        const balasanGambar = `Berikut adalah hasil gambar untuk **"${promptGambar}"**:\n\n![Hasil Gambar](${imageUrl})`;

        chatHistory.push({ role: "model", parts: [{ text: balasanGambar }] });
        let activeS = getSessionById(currentSessionId);
        if (activeS) activeS.history = chatHistory;

        newChat("bot", balasanGambar);
    } catch (error) {
        waiting.remove();
        let session = getSessionById(currentSessionId);
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

async function getAiResponse(chatText, filesList = []) {
    let userParts = [];
    if (chatText) userParts.push({ text: chatText });
    if (Array.isArray(filesList) && filesList.length > 0) {
        filesList.forEach((fileData) => {
            userParts.push({ inline_data: { mime_type: fileData.mimeType, data: fileData.data } });
        });
    }

    chatHistory.push({ role: "user", parts: userParts });
    let activeS = getSessionById(currentSessionId);
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
            let activeS2 = getSessionById(currentSessionId);
            if (activeS2) activeS2.history = chatHistory;

            waiting.remove();
            let session = getSessionById(currentSessionId);
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
        let session = getSessionById(currentSessionId);
        if (session && session.messages) {
            session.messages = session.messages.filter(m => !m.content.includes("<span></span>"));
            saveSessions();
        }
        chatHistory.pop();
        let activeS3 = getSessionById(currentSessionId);
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
        clearAttachedFileUI();
    }
}

prompt.addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = (this.scrollHeight) + "px";
    saveSessions();
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
    if (chat || attachedFiles.length > 0) {
        const filesKirim = [...attachedFiles];
        let tampilanUser = "";

        if (filesKirim.length > 0) {
            const mediaHtml = filesKirim.map((item) => {
                if (item.mimeType && item.mimeType.startsWith("image/") && item.previewUrl) {
                    return `<img src="${item.previewUrl}" class="user-attached-img" alt="${item.name}">`;
                }
                return `<div class="user-file-badge">📎 ${item.name}</div>`;
            }).join("");

            tampilanUser = `${mediaHtml}${chat ? `<div class="user-prompt-text">${chat}</div>` : ""}`;
        } else {
            tampilanUser = chat;
        }

        newChat("user", tampilanUser);
        
        prompt.value = '';
        prompt.style.height = "auto";
        const currentS = getSessionById(currentSessionId);
        if (currentS) currentS.draft = '';
        saveSessions();
        clearAttachedFileUI();

        currentAbortController = new AbortController();
        setGeneratingState(true);

        const pesanLower = chat.toLowerCase();
        if (filesKirim.length === 0 && (pesanLower.startsWith("buatkan gambar") || pesanLower.startsWith("tampilkan gambar") || pesanLower.startsWith("gambar "))) {
            const keywordGambar = chat.replace(/^(buatkan gambar|tampilkan gambar|gambar)\s*/i, "");
            setTimeout(() => { kirimGambar(keywordGambar); }, 500);
        } else {
            getAiResponse(chat, filesKirim);
        }
    }
};

prompt.addEventListener("keydown", (e) => {
    if (isTouchOrMobileDevice()) return;

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
        saveSessions();
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

const imageZoomModal    = document.getElementById("imageZoomModal");
const zoomedImageEl     = document.getElementById("zoomedImageEl");
const btnCloseZoomModal = document.getElementById("btnCloseZoomModal");
const zoomRightActions  = document.getElementById("zoomRightActions");
const btnZoomDeletePhoto = document.getElementById("btnZoomDeletePhoto");
const btnZoomGoChat      = document.getElementById("btnZoomGoChat");

let zoomedPhotoMeta = null;

function openImageZoomModal(src, alt = "Gambar", meta = null) {
    if (!imageZoomModal || !zoomedImageEl || !src) return;
    zoomedImageEl.src = src;
    zoomedImageEl.alt = alt;
    zoomedPhotoMeta = meta ? { ...meta, src } : null;

    if (zoomRightActions) {
        zoomRightActions.style.display = zoomedPhotoMeta && zoomedPhotoMeta.fromCollection ? "inline-flex" : "none";
    }

    imageZoomModal.style.display = "flex";
}

function closeImageZoomModal() {
    if (!imageZoomModal) return;
    imageZoomModal.style.display = "none";
    if (zoomedImageEl) zoomedImageEl.src = "";
    zoomedPhotoMeta = null;
    if (zoomRightActions) zoomRightActions.style.display = "none";
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

if (btnZoomGoChat) {
    btnZoomGoChat.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!zoomedPhotoMeta || !zoomedPhotoMeta.sessionId) return;
        const targetSessionId = zoomedPhotoMeta.sessionId;
        closeImageZoomModal();
        switchSession(targetSessionId);
        closeSidebarOnMobile();
    });
}

if (btnZoomDeletePhoto) {
    btnZoomDeletePhoto.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!zoomedPhotoMeta || !zoomedPhotoMeta.fromCollection) return;

        pendingDeletePhotoMeta = { ...zoomedPhotoMeta };
        sessionToDeleteId = null;

        const deleteModalOverlay = document.getElementById("deleteModalOverlay");
        if (deleteModalOverlay) {
            const titleEl = deleteModalOverlay.querySelector("h3");
            const descEl = deleteModalOverlay.querySelector("p");
            if (titleEl) titleEl.textContent = "Hapus Foto";
            if (descEl) descEl.textContent = "Anda yakin ingin menghapus foto ini dari koleksi?";
            deleteModalOverlay.style.zIndex = "3000";
            deleteModalOverlay.style.display = "flex";
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
    if (clickedImg.classList.contains("collection-photo-thumb")) return;
    if (!clickedImg.src) return;
    openImageZoomModal(clickedImg.src, clickedImg.alt || "Pratinjau gambar");
});

// Editor Coretan Gambar (Sketsa, Undo, Redo, Simpan, Close)
const imageEditorModal = document.getElementById("imageEditorModal");
const imageEditorCanvas = document.getElementById("imageEditorCanvas");
const editorCtx = imageEditorCanvas ? imageEditorCanvas.getContext("2d") : null;
const btnCloseEditor = document.getElementById("btnCloseEditor");
const btnEditorUndo = document.getElementById("btnEditorUndo");
const btnEditorRedo = document.getElementById("btnEditorRedo");
const btnEditorSave = document.getElementById("btnEditorSave");
const editorColorSwatches = document.querySelectorAll(".color-swatch");

let editingAttachmentIndex = null;
let editorStrokeColor = "#ef4444";
let editorLineWidth = 5;
let isDrawingOnCanvas = false;
let editorHistory = [];
let editorHistoryStep = -1;

function syncEditorHistoryButtons() {
    if (btnEditorUndo) btnEditorUndo.disabled = editorHistoryStep <= 0;
    if (btnEditorRedo) btnEditorRedo.disabled = editorHistoryStep >= editorHistory.length - 1;
}

function pushEditorSnapshot() {
    if (!imageEditorCanvas || !editorCtx) return;
    const snapshot = editorCtx.getImageData(0, 0, imageEditorCanvas.width, imageEditorCanvas.height);
    editorHistory = editorHistory.slice(0, editorHistoryStep + 1);
    editorHistory.push(snapshot);
    editorHistoryStep = editorHistory.length - 1;
    syncEditorHistoryButtons();
}

function openImageEditor(attachmentIndex) {
    const item = attachedFiles[attachmentIndex];
    if (!item || !imageEditorModal || !imageEditorCanvas || !editorCtx) return;

    editingAttachmentIndex = attachmentIndex;
    editorHistory = [];
    editorHistoryStep = -1;

    const img = new Image();
    img.onload = () => {
        const maxW = Math.min(window.innerWidth - 40, 900);
        const maxH = Math.min(window.innerHeight - 210, 620);
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);

        imageEditorCanvas.width = Math.max(1, Math.round(img.width * scale));
        imageEditorCanvas.height = Math.max(1, Math.round(img.height * scale));
        editorLineWidth = Math.max(3, Math.round(Math.min(imageEditorCanvas.width, imageEditorCanvas.height) * 0.014));

        editorCtx.clearRect(0, 0, imageEditorCanvas.width, imageEditorCanvas.height);
        editorCtx.drawImage(img, 0, 0, imageEditorCanvas.width, imageEditorCanvas.height);

        imageEditorModal.style.display = "flex";
        pushEditorSnapshot();
    };
    img.src = item.previewUrl;
}

function closeImageEditor() {
    if (!imageEditorModal) return;
    imageEditorModal.style.display = "none";
    isDrawingOnCanvas = false;
    editingAttachmentIndex = null;
    editorHistory = [];
    editorHistoryStep = -1;
}

function getCanvasPointerPos(e) {
    const rect = imageEditorCanvas.getBoundingClientRect();
    const scaleX = imageEditorCanvas.width / rect.width;
    const scaleY = imageEditorCanvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

if (imageEditorCanvas && editorCtx) {
    imageEditorCanvas.addEventListener("pointerdown", (e) => {
        isDrawingOnCanvas = true;
        imageEditorCanvas.setPointerCapture(e.pointerId);
        const pos = getCanvasPointerPos(e);
        editorCtx.beginPath();
        editorCtx.moveTo(pos.x, pos.y);
        editorCtx.lineCap = "round";
        editorCtx.lineJoin = "round";
        editorCtx.strokeStyle = editorStrokeColor;
        editorCtx.lineWidth = editorLineWidth;
    });

    imageEditorCanvas.addEventListener("pointermove", (e) => {
        if (!isDrawingOnCanvas) return;
        const pos = getCanvasPointerPos(e);
        editorCtx.lineTo(pos.x, pos.y);
        editorCtx.stroke();
    });

    const finishStroke = (e) => {
        if (!isDrawingOnCanvas) return;
        isDrawingOnCanvas = false;
        if (e && e.pointerId !== undefined && imageEditorCanvas.hasPointerCapture(e.pointerId)) {
            imageEditorCanvas.releasePointerCapture(e.pointerId);
        }
        editorCtx.closePath();
        pushEditorSnapshot();
    };

    imageEditorCanvas.addEventListener("pointerup", finishStroke);
    imageEditorCanvas.addEventListener("pointercancel", finishStroke);
}

editorColorSwatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
        editorColorSwatches.forEach((el) => el.classList.remove("active"));
        swatch.classList.add("active");
        editorStrokeColor = swatch.dataset.color || "#ef4444";
    });
});

if (btnEditorUndo) {
    btnEditorUndo.addEventListener("click", () => {
        if (editorHistoryStep <= 0 || !editorCtx) return;
        editorHistoryStep -= 1;
        editorCtx.putImageData(editorHistory[editorHistoryStep], 0, 0);
        syncEditorHistoryButtons();
    });
}

if (btnEditorRedo) {
    btnEditorRedo.addEventListener("click", () => {
        if (editorHistoryStep >= editorHistory.length - 1 || !editorCtx) return;
        editorHistoryStep += 1;
        editorCtx.putImageData(editorHistory[editorHistoryStep], 0, 0);
        syncEditorHistoryButtons();
    });
}

if (btnEditorSave) {
    btnEditorSave.addEventListener("click", () => {
        if (editingAttachmentIndex === null || !imageEditorCanvas || !attachedFiles[editingAttachmentIndex]) return;
        const mimeType = attachedFiles[editingAttachmentIndex].mimeType || "image/png";
        const outputMime = mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
        const updatedDataUrl = imageEditorCanvas.toDataURL(outputMime, 0.92);

        attachedFiles[editingAttachmentIndex] = {
            ...attachedFiles[editingAttachmentIndex],
            data: updatedDataUrl.split(",")[1],
            previewUrl: updatedDataUrl,
            mimeType: outputMime
        };

        renderAttachmentPreviews();
        closeImageEditor();
    });
}

if (btnCloseEditor) {
    btnCloseEditor.addEventListener("click", closeImageEditor);
}

window.addEventListener('DOMContentLoaded', () => {
    closeSidebarOnMobile();
    switchSession(currentSessionId, true);
    renderHistory(searchChatInput ? searchChatInput.value : '');
});