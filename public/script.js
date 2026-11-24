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

const pdfFileRegistry = new Map();
let pendingDeletePdfMeta = null;
let activePdfPreviewMeta = null;

const PDF_DB_NAME = "PsylockPdfDb";
const PDF_STORE_NAME = "pdf_files";
let pdfDbPromise = null;

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

function getFileExtensionLabel(fileName = "", mimeType = "") {
    const cleanName = String(fileName || "").trim();
    const extMatch = cleanName.match(/\.([a-z0-9]+)$/i);
    if (extMatch && extMatch[1]) {
        return extMatch[1].toUpperCase();
    }
    if (mimeType === "application/pdf") return "PDF";
    return "FILE";
}

function getFileTypeSubtitle(extLabel = "FILE") {
    const map = {
        PDF: "PDF",
        DOC: "Dokumen Word",
        DOCX: "Dokumen Word",
        XLS: "Spreadsheet",
        XLSX: "Spreadsheet",
        CSV: "CSV",
        PPT: "Presentasi",
        PPTX: "Presentasi",
        TXT: "Teks",
        JSON: "JSON",
        ZIP: "Arsip ZIP"
    };
    return map[extLabel] || extLabel;
}

function ensureFileCardStyles() {
    if (document.getElementById("psylockFileCardStyle")) return;
    const style = document.createElement("style");
    style.id = "psylockFileCardStyle";
    style.textContent = `
        .pesan.user .user-file-badge {
            display: inline-flex;
            align-items: center;
            gap: 12px;
            min-width: 220px;
            max-width: 360px;
            padding: 10px 14px;
            border-radius: 14px;
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            color: #0f172a;
            text-align: left;
            vertical-align: middle;
            box-sizing: border-box;
            transition: background-color 0.15s ease, border-color 0.15s ease;
        }
        .pesan.user .user-file-badge.pdf-clickable:hover {
            background: #e2e8f0;
            border-color: #cbd5e1;
        }
        .pesan.user .file-card-icon-wrap {
            width: 36px;
            height: 40px;
            border-radius: 8px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 2px;
            flex-shrink: 0;
            color: #475569;
        }
        .pesan.user .file-card-icon-wrap.is-pdf {
            color: #dc2626;
        }
        .pesan.user .file-card-ext-mini {
            font-size: 8px;
            font-weight: 700;
            line-height: 1;
            letter-spacing: 0.4px;
            text-transform: uppercase;
        }
        .pesan.user .file-card-meta {
            display: flex;
            flex-direction: column;
            min-width: 0;
            flex: 1;
            gap: 2px;
        }
        .pesan.user .file-card-title {
            font-size: 13px;
            font-weight: 600;
            line-height: 1.3;
            color: #0f172a;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .pesan.user .file-card-sub {
            font-size: 11px;
            font-weight: 500;
            line-height: 1.25;
            color: #64748b;
        }
        .pesan.user .user-file-badge + .user-file-badge,
        .pesan.user .user-file-badge + .user-prompt-text {
            margin-top: 8px;
        }
    `;
    document.head.appendChild(style);
}

function buildFileCardHtml(fileName, options = {}) {
    ensureFileCardStyles();
    const cleanName = String(fileName || "File").trim();
    const ext = getFileExtensionLabel(cleanName, options.mimeType);
    const subtitle = getFileTypeSubtitle(ext);
    const isPdf = isPdfFile(cleanName, options.mimeType);
    const pdfIdAttr = options.pdfId ? ` data-pdf-id="${options.pdfId}"` : "";
    const clickableClass = isPdf ? " pdf-clickable" : "";
    const cursorStyle = isPdf ? "cursor:pointer;" : "";
    const iconColorClass = isPdf ? " is-pdf" : "";

    return `
        <div class="user-file-badge${clickableClass}"${pdfIdAttr} data-file-name="${cleanName}" style="${cursorStyle}" title="${cleanName}">
            <div class="file-card-icon-wrap${iconColorClass}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <span class="file-card-ext-mini">${ext}</span>
            </div>
            <div class="file-card-meta">
                <div class="file-card-title">${cleanName}</div>
                <div class="file-card-sub">${subtitle}</div>
            </div>
        </div>
    `.trim();
}

function openPdfDb() {
    if (pdfDbPromise) return pdfDbPromise;
    if (!("indexedDB" in window)) return Promise.resolve(null);

    pdfDbPromise = new Promise((resolve) => {
        const req = indexedDB.open(PDF_DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(PDF_STORE_NAME)) {
                const store = db.createObjectStore(PDF_STORE_NAME, { keyPath: "id" });
                store.createIndex("by_name", "name", { unique: false });
                store.createIndex("by_session", "sessionId", { unique: false });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
    });
    return pdfDbPromise;
}

async function savePdfToIndexedDb(record) {
    if (!record || !record.id) return;
    const db = await openPdfDb();
    if (!db) return;

    return new Promise((resolve) => {
        const tx = db.transaction(PDF_STORE_NAME, "readwrite");
        tx.objectStore(PDF_STORE_NAME).put({
            id: record.id,
            name: record.name,
            sessionId: String(record.sessionId || ""),
            mimeType: record.mimeType || "application/pdf",
            dataUrl: record.dataUrl || (record.data ? `data:application/pdf;base64,${record.data}` : "")
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
    });
}

async function loadPdfFromIndexedDb(fileName, sessionId, pdfId) {
    const db = await openPdfDb();
    if (!db) return null;

    return new Promise((resolve) => {
        const tx = db.transaction(PDF_STORE_NAME, "readonly");
        const store = tx.objectStore(PDF_STORE_NAME);

        if (pdfId) {
            const byIdReq = store.get(pdfId);
            byIdReq.onsuccess = () => {
                if (byIdReq.result && byIdReq.result.dataUrl) {
                    resolve(byIdReq.result);
                    return;
                }
                searchByName();
            };
            byIdReq.onerror = () => searchByName();
        } else {
            searchByName();
        }

        function searchByName() {
            if (!fileName) {
                resolve(null);
                return;
            }
            const idx = store.index("by_name");
            const req = idx.getAll(fileName);
            req.onsuccess = () => {
                const list = Array.isArray(req.result) ? req.result : [];
                if (!list.length) {
                    resolve(null);
                    return;
                }
                if (sessionId !== undefined && sessionId !== null) {
                    const sameSession = list.find((item) => String(item.sessionId) === String(sessionId) && item.dataUrl);
                    if (sameSession) {
                        resolve(sameSession);
                        return;
                    }
                }
                const anyWithData = [...list].reverse().find((item) => item.dataUrl);
                resolve(anyWithData || null);
            };
            req.onerror = () => resolve(null);
        }
    });
}

async function deletePdfFromIndexedDb(meta) {
    const db = await openPdfDb();
    if (!db || !meta) return;

    return new Promise((resolve) => {
        const tx = db.transaction(PDF_STORE_NAME, "readwrite");
        const store = tx.objectStore(PDF_STORE_NAME);

        if (meta.id) {
            store.delete(meta.id);
        }
        if (meta.name) {
            const idx = store.index("by_name");
            const cursorReq = idx.openCursor(IDBKeyRange.only(meta.name));
            cursorReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const val = cursor.value;
                    if (!meta.sessionId || String(val.sessionId) === String(meta.sessionId)) {
                        cursor.delete();
                    }
                    cursor.continue();
                }
            };
        }

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
    });
}

function isPdfFile(name = "", mimeType = "") {
    return mimeType === "application/pdf" || String(name).toLowerCase().endsWith(".pdf");
}

function isAllowedImageOrPdf(fileName = "", mimeType = "") {
    const cleanName = String(fileName || "").trim();
    const cleanMime = String(mimeType || "").toLowerCase();
    const isImage =
        cleanMime.startsWith("image/") ||
        /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(cleanName);
    const isPdf = isPdfFile(cleanName, cleanMime);
    return isImage || isPdf;
}

function showUnsupportedFileNotice(rejectedNames = []) {
    const detail = rejectedNames.length ? ` (${rejectedNames.join(", ")})` : "";
    const msg = `Hanya foto dan file PDF yang dapat dikirim${detail}. File selain itu tidak didukung.`;

    if (chatBox && !isCollectionView) {
        const notice = document.createElement("div");
        notice.className = "pesan-wrapper bot-wrapper";
        notice.style.opacity = "0.95";
        notice.innerHTML = `
            <img src="avatar.jpeg" class="ai-avatar">
            <div class="pesan bot" style="background:#fef2f2;color:#991b1b;border:1px solid #fecaca;">${msg}</div>
        `;
        chatBox.appendChild(notice);
        if (!userIsScrollingUp) {
            chatBox.scrollTop = chatBox.scrollHeight;
        }
        setTimeout(() => {
            notice.remove();
        }, 4000);
    } else {
        alert(msg);
    }
}

function registerPdfFile(meta) {
    if (!meta || !meta.name) return null;
    const key = meta.id || `${meta.sessionId || "global"}::${meta.name}`;
    const existing = pdfFileRegistry.get(key) || {};
    const merged = { ...existing, ...meta, id: key };

    if (!merged.dataUrl && merged.data) {
        merged.dataUrl = `data:application/pdf;base64,${merged.data}`;
    } else if (!merged.data && merged.dataUrl && merged.dataUrl.includes(",")) {
        merged.data = merged.dataUrl.split(",")[1];
    }

    pdfFileRegistry.set(key, merged);
    if (merged.dataUrl) {
        savePdfToIndexedDb(merged);
    }
    return merged;
}

function findPdfFile(fileName, sessionId, pdfId) {
    if (pdfId && pdfFileRegistry.has(pdfId)) {
        return pdfFileRegistry.get(pdfId);
    }
    const entries = Array.from(pdfFileRegistry.values()).reverse();
    if (sessionId !== undefined && sessionId !== null) {
        const bySession = entries.find((f) => f.name === fileName && String(f.sessionId) === String(sessionId));
        if (bySession) return bySession;
    }
    return entries.find((f) => f.name === fileName) || null;
}

function removePdfFromSession(meta) {
    if (!meta) return;
    const targetName = (meta.name || "").trim();
    const targetId = meta.id || "";
    const session = meta.sessionId ? getSessionById(meta.sessionId) : null;

    if (targetId && pdfFileRegistry.has(targetId)) {
        pdfFileRegistry.delete(targetId);
    }
    if (targetName) {
        for (const [k, v] of pdfFileRegistry.entries()) {
            if (v && v.name === targetName && (!meta.sessionId || String(v.sessionId) === String(meta.sessionId))) {
                pdfFileRegistry.delete(k);
            }
        }
    }

    deletePdfFromIndexedDb(meta);

    if (session && Array.isArray(session.messages) && targetName) {
        const escapedName = targetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        session.messages = session.messages
            .map((msg) => {
                if (!msg || typeof msg.content !== "string") return msg;
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = msg.content;

                let changed = false;
                tempDiv.querySelectorAll(".user-file-badge").forEach((badge) => {
                    const bName = (badge.dataset.fileName || badge.textContent || "").replace(/^📎\s*/, "").trim();
                    if (bName === targetName) {
                        badge.remove();
                        changed = true;
                    }
                });

                if (!changed) {
                    const legacyRe = new RegExp(`\\[Mengirim file:\\s*${escapedName}\\]`, "gi");
                    if (legacyRe.test(msg.content)) {
                        tempDiv.innerHTML = msg.content.replace(legacyRe, "");
                        changed = true;
                    }
                }

                if (!changed) return msg;

                const remainingText = (tempDiv.textContent || "").replace(/\s+/g, " ").trim();
                const remainingBadges = tempDiv.querySelectorAll(".user-file-badge").length;
                const remainingImgs = Array.from(tempDiv.querySelectorAll("img")).filter(
                    (i) => !i.classList.contains("ai-avatar")
                ).length;

                if (!remainingText && remainingBadges === 0 && remainingImgs === 0) {
                    return null;
                }

                tempDiv.querySelectorAll(".user-prompt-text").forEach((el) => {
                    if (!el.textContent.trim() && el.children.length === 0) el.remove();
                });
                return { ...msg, content: tempDiv.innerHTML.trim() };
            })
            .filter(Boolean);
    }

    saveSessions();
}

function closePdfPreviewModal() {
    const modal = document.getElementById("pdfPreviewModal");
    if (!modal) return;
    modal.style.display = "none";
    const bodyEl = modal.querySelector("#pdfPreviewBody");
    if (bodyEl) bodyEl.innerHTML = "";
    activePdfPreviewMeta = null;
}

function ensurePdfPreviewModal() {
    let modal = document.getElementById("pdfPreviewModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "pdfPreviewModal";
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: #ffffff;
        z-index: 4000;
        display: none;
        flex-direction: column;
    `;

    modal.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid #e2e8f0;background:#ffffff;position:sticky;top:0;z-index:2;">
            <button id="btnPdfClose" type="button" title="Tutup" aria-label="Tutup" style="width:36px;height:36px;border-radius:999px;border:none;background:transparent;color:#0f172a;font-size:24px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">&times;</button>
            <div id="pdfPreviewTitle" style="flex:1;font-size:14px;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;">Pratinjau File</div>
            <div style="display:inline-flex;align-items:center;gap:6px;flex-shrink:0;">
                <button id="btnPdfDelete" type="button" title="Hapus file" aria-label="Hapus file" style="width:36px;height:36px;border-radius:999px;border:1px solid #e2e8f0;background:#f8fafc;color:#0f172a;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
                <button id="btnPdfGoChat" type="button" title="Lihat percakapan" aria-label="Lihat percakapan" style="width:36px;height:36px;border-radius:999px;border:1px solid #e2e8f0;background:#f8fafc;color:#0f172a;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                </button>
            </div>
        </div>
        <div id="pdfPreviewBody" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;background:#f1f5f9;padding:16px;display:flex;flex-direction:column;align-items:center;gap:14px;"></div>
    `;

    document.body.appendChild(modal);

    modal.querySelector("#btnPdfClose").addEventListener("click", () => {
        closePdfPreviewModal();
    });

    modal.querySelector("#btnPdfGoChat").addEventListener("click", () => {
        if (!activePdfPreviewMeta || !activePdfPreviewMeta.sessionId) return;
        const targetSessionId = activePdfPreviewMeta.sessionId;
        closePdfPreviewModal();
        switchSession(targetSessionId);
        closeSidebarOnMobile();
    });

    modal.querySelector("#btnPdfDelete").addEventListener("click", () => {
        if (!activePdfPreviewMeta) return;
        pendingDeletePdfMeta = { ...activePdfPreviewMeta };
        pendingDeletePhotoMeta = null;
        sessionToDeleteId = null;

        const deleteModalOverlay = document.getElementById("deleteModalOverlay");
        if (deleteModalOverlay) {
            const titleEl = deleteModalOverlay.querySelector("h3");
            const descEl = deleteModalOverlay.querySelector("p");
            if (titleEl) titleEl.textContent = "Hapus File";
            if (descEl) descEl.textContent = "Anda yakin ingin menghapus file PDF ini?";
            deleteModalOverlay.style.zIndex = "4500";
            deleteModalOverlay.style.display = "flex";
        }
    });

    return modal;
}

async function openPdfPreviewModal(fileMeta) {
    const modal = ensurePdfPreviewModal();
    const titleEl = modal.querySelector("#pdfPreviewTitle");
    const bodyEl = modal.querySelector("#pdfPreviewBody");
    const goChatBtn = modal.querySelector("#btnPdfGoChat");

    activePdfPreviewMeta = fileMeta ? { ...fileMeta } : null;
    const name = (fileMeta && fileMeta.name) || "Dokumen.pdf";
    if (titleEl) titleEl.textContent = name;

    if (goChatBtn) {
        goChatBtn.style.display = fileMeta && fileMeta.sessionId ? "inline-flex" : "none";
    }

    bodyEl.innerHTML = `
        <div style="margin:auto;display:flex;flex-direction:column;align-items:center;gap:10px;padding:40px 16px;">
            <div style="width:28px;height:28px;border:3px solid #cbd5e1;border-top-color:#0f172a;border-radius:50%;animation:pdfSpin 0.8s linear infinite;"></div>
            <div style="font-size:13px;color:#475569;">Memuat pratinjau PDF...</div>
        </div>
    `;

    if (!document.getElementById("pdfSpinStyle")) {
        const style = document.createElement("style");
        style.id = "pdfSpinStyle";
        style.textContent = `@keyframes pdfSpin { to { transform: rotate(360deg); } }`;
        document.head.appendChild(style);
    }

    modal.style.display = "flex";

    let dataUrl = fileMeta && fileMeta.dataUrl ? fileMeta.dataUrl : "";
    if (!dataUrl && fileMeta && fileMeta.data) {
        dataUrl = `data:application/pdf;base64,${fileMeta.data}`;
    }
    if (!dataUrl && fileMeta) {
        const savedRecord = await loadPdfFromIndexedDb(fileMeta.name, fileMeta.sessionId, fileMeta.id);
        if (savedRecord && savedRecord.dataUrl) {
            dataUrl = savedRecord.dataUrl;
            activePdfPreviewMeta = { ...fileMeta, ...savedRecord };
            registerPdfFile(activePdfPreviewMeta);
        }
    }

    if (!dataUrl) {
        bodyEl.innerHTML = `
            <div style="max-width:420px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;text-align:center;color:#475569;font-size:13px;">
                Data file PDF tidak tersedia pada sesi aktif ini. Silakan unggah ulang file PDF terlebih dahulu.
            </div>
        `;
        return;
    }

    try {
        const base64 = dataUrl.split(",")[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        if (window.pdfjsLib) {
            const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
            bodyEl.innerHTML = "";

            const containerWidth = Math.max(260, Math.min(window.innerWidth - 32, 920));
            const deviceScale = Math.min(window.devicePixelRatio || 1, 2);

            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                const page = await pdfDoc.getPage(pageNum);
                const unscaledViewport = page.getViewport({ scale: 1 });
                const fitScale = containerWidth / unscaledViewport.width;
                const renderViewport = page.getViewport({ scale: fitScale * deviceScale });

                const canvas = document.createElement("canvas");
                canvas.width = Math.round(renderViewport.width);
                canvas.height = Math.round(renderViewport.height);
                canvas.style.cssText = `
                    width: ${containerWidth}px;
                    max-width: 100%;
                    height: auto;
                    background: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08);
                `;

                const ctx = canvas.getContext("2d");
                await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
                bodyEl.appendChild(canvas);
            }
        } else {
            bodyEl.innerHTML = `<iframe src="${dataUrl}" title="${name}" style="width:100%;max-width:920px;height:82vh;border:none;border-radius:8px;background:#ffffff;"></iframe>`;
        }
    } catch (err) {
        console.error("Gagal merender PDF:", err);
        bodyEl.innerHTML = `<iframe src="${dataUrl}" title="${name}" style="width:100%;max-width:920px;height:82vh;border:none;border-radius:8px;background:#ffffff;"></iframe>`;
    }
}

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
    localStorage.setItem('psylock_is_collection_view', isCollectionView ? '1' : '0');
    localStorage.setItem('psylock_collection_tab', activeCollectionTab);
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
                const titleEl = badge.querySelector('.file-card-title');
                const rawName = (badge.dataset.fileName || (titleEl ? titleEl.textContent : badge.textContent) || '')
                    .replace(/^📎\s*/, '')
                    .trim() || 'File';
                const ext = (rawName.split('.').pop() || 'FILE').toUpperCase();
                items.push({
                    type: 'file',
                    name: rawName,
                    ext,
                    pdfId: badge.dataset.pdfId || '',
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
                        pdfId: '',
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
                const isPdf = item.ext === 'PDF';
                return `
                    <div class="collection-card ${isPdf ? 'collection-pdf-card' : ''}" data-file-name="${item.name}" data-session-id="${item.sessionId}" data-pdf-id="${item.pdfId || ''}" style="${isPdf ? 'cursor:pointer;' : ''}">
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
            localStorage.setItem('psylock_collection_tab', activeCollectionTab);
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

    chatBox.querySelectorAll('.collection-pdf-card').forEach((card) => {
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            const fileName = card.dataset.fileName || 'Dokumen.pdf';
            const sessionId = card.dataset.sessionId;
            const pdfId = card.dataset.pdfId;
            const matched = findPdfFile(fileName, sessionId, pdfId);
            openPdfPreviewModal(matched || { id: pdfId, name: fileName, sessionId });
        });
    });
}

function openCollection() {
    saveCurrentDraft();
    isCollectionView = true;
    saveSessions();
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
    pendingDeletePdfMeta = null;
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
        pendingDeletePdfMeta = null;
    });
}

const btnConfirmDelete = document.getElementById('btnConfirmDelete');
if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', () => {
        const deleteModalOverlay = document.getElementById('deleteModalOverlay');

        if (pendingDeletePdfMeta) {
            const pdfMeta = pendingDeletePdfMeta;
            pendingDeletePdfMeta = null;

            if (deleteModalOverlay) {
                deleteModalOverlay.style.display = 'none';
                deleteModalOverlay.style.zIndex = "1000";
            }

            removePdfFromSession(pdfMeta);
            closePdfPreviewModal();

            if (isCollectionView) {
                renderCollectionContent();
            } else if (pdfMeta.sessionId) {
                switchSession(pdfMeta.sessionId, true);
            }
            return;
        }

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
        const temp = document.createElement('div');
        temp.innerHTML = content;
        const badgeTitle = temp.querySelector('.file-card-title');
        const plainTitle = (badgeTitle ? badgeTitle.textContent : temp.textContent || '').trim() || 'Gambar/File';
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
        ensureFileCardStyles();
        containerEl = document.createElement("div");
        containerEl.classList.add("pesan-wrapper", "user-wrapper");

        const div = document.createElement("div");
        div.classList.add("pesan", pengirim);

        let formattedUserChat = chat;
        const legacyMatch = chat.match(/^\[Mengirim file:\s*(.+?)\](?:<br>)?([\s\S]*)$/i);
        if (legacyMatch && !chat.includes("<img")) {
            const fileName = legacyMatch[1];
            const promptPart = legacyMatch[2] || "";
            formattedUserChat = `${buildFileCardHtml(fileName)}${promptPart ? `<div class="user-prompt-text">${promptPart}</div>` : ""}`;
        }

        div.innerHTML = formattedUserChat;
        div.querySelectorAll(".user-file-badge").forEach((badge) => {
            const name = (badge.dataset.fileName || badge.textContent || "").replace(/^📎\s*/, "").trim();
            if (!badge.querySelector(".file-card-title") && name) {
                const pdfId = badge.dataset.pdfId || "";
                const tempWrap = document.createElement("div");
                tempWrap.innerHTML = buildFileCardHtml(name, { pdfId });
                const newCard = tempWrap.firstElementChild;
                if (newCard) badge.replaceWith(newCard);
            }
        });

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

btnUpload.onclick = () => {
    if (fileInput) {
        fileInput.setAttribute("accept", "image/*,.pdf,application/pdf");
        fileInput.click();
    }
};

fileInput.onchange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const validFiles = [];
    const rejectedNames = [];

    files.forEach((file) => {
        if (isAllowedImageOrPdf(file.name, file.type)) {
            validFiles.push(file);
        } else {
            rejectedNames.push(file.name || "file");
        }
    });

    if (rejectedNames.length > 0) {
        showUnsupportedFileNotice(rejectedNames);
    }

    if (!validFiles.length) {
        fileInput.value = "";
        return;
    }

    validFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = function(uploadEvent) {
            const fullDataUrl = uploadEvent.target.result;
            const base64Part = fullDataUrl.split(',')[1];
            const effectiveMime = isPdfFile(file.name, file.type) ? "application/pdf" : file.type;
            const fileItem = {
                data: base64Part,
                previewUrl: fullDataUrl,
                dataUrl: fullDataUrl,
                mimeType: effectiveMime,
                name: file.name
            };
            attachedFiles.push(fileItem);

            if (isPdfFile(file.name, effectiveMime)) {
                registerPdfFile({
                    id: `${currentSessionId}::${file.name}`,
                    sessionId: currentSessionId,
                    name: file.name,
                    mimeType: "application/pdf",
                    data: base64Part,
                    dataUrl: fullDataUrl
                });
            }
            renderAttachmentPreviews();
        };
        reader.readAsDataURL(file);
    });

    fileInput.value = "";
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
    const filesKirim = attachedFiles.filter((item) =>
        isAllowedImageOrPdf(item.name, item.mimeType)
    );

    if (chat || filesKirim.length > 0) {
        let tampilanUser = "";

        if (filesKirim.length > 0) {
            const mediaHtml = filesKirim.map((item) => {
                if (item.mimeType && item.mimeType.startsWith("image/") && item.previewUrl) {
                    return `<img src="${item.previewUrl}" class="user-attached-img" alt="${item.name}">`;
                }
                if (isPdfFile(item.name, item.mimeType)) {
                    const reg = registerPdfFile({
                        id: `${currentSessionId}::${item.name}::${Date.now()}`,
                        sessionId: currentSessionId,
                        name: item.name,
                        mimeType: "application/pdf",
                        data: item.data,
                        dataUrl: item.previewUrl || item.dataUrl
                    });
                    return buildFileCardHtml(item.name, {
                        pdfId: reg.id,
                        mimeType: "application/pdf"
                    });
                }
                return buildFileCardHtml(item.name, { mimeType: item.mimeType });
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
        pendingDeletePdfMeta = null;
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
    if (e.key === "Escape") {
        const pdfModal = document.getElementById("pdfPreviewModal");
        if (pdfModal && pdfModal.style.display === "flex") {
            closePdfPreviewModal();
            return;
        }
        if (imageZoomModal && imageZoomModal.style.display === "flex") {
            closeImageZoomModal();
        }
    }
});

chatBox.addEventListener("click", (e) => {
    const fileBadge = e.target.closest(".user-file-badge");
    if (fileBadge) {
        const titleEl = fileBadge.querySelector(".file-card-title");
        const badgeName = (fileBadge.dataset.fileName || (titleEl ? titleEl.textContent : fileBadge.textContent) || "")
            .replace(/^📎\s*/, "")
            .trim();
        if (isPdfFile(badgeName)) {
            e.stopPropagation();
            const matched = findPdfFile(badgeName, currentSessionId, fileBadge.dataset.pdfId);
            openPdfPreviewModal(matched || { id: fileBadge.dataset.pdfId, name: badgeName, sessionId: currentSessionId });
            return;
        }
    }

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
    openPdfDb();
    ensureFileCardStyles();
    closeSidebarOnMobile();

    const savedCollectionTab = localStorage.getItem('psylock_collection_tab');
    if (savedCollectionTab && ['all', 'photo', 'file'].includes(savedCollectionTab)) {
        activeCollectionTab = savedCollectionTab;
    }

    const shouldStayInCollection = localStorage.getItem('psylock_is_collection_view') === '1';
    if (shouldStayInCollection) {
        isCollectionView = true;
        renderCollectionContent();
        setPromptVisible(false);
        syncSidebarActiveStates();
        renderHistory(searchChatInput ? searchChatInput.value : '');
    } else {
        switchSession(currentSessionId, true);
        renderHistory(searchChatInput ? searchChatInput.value : '');
    }
});