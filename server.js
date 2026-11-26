require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- SUPABASE & NODEMAILER SETUP ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn("Peringatan: SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diatur di .env");
}

const supabase = createClient(supabaseUrl || "", supabaseKey || "");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Penyimpanan OTP sementara di memori: `${purpose}:${email}` -> { code, expiresAt }
const otpStore = new Map();
const OTP_TTL_MS = 10 * 60 * 1000; // 10 menit

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
    if (!storedHash || !storedHash.includes(":")) return false;
    const [salt, keyHex] = storedHash.split(":");
    const keyBuf = Buffer.from(keyHex, "hex");
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

function createOtp(purpose, email) {
    const code = String(crypto.randomInt(100000, 999999));
    otpStore.set(`${purpose}:${email}`, {
        code,
        expiresAt: Date.now() + OTP_TTL_MS
    });
    return code;
}

function verifyOtp(purpose, email, code) {
    const key = `${purpose}:${email}`;
    const record = otpStore.get(key);
    if (!record) {
        return { valid: false, error: "Kode OTP tidak ditemukan. Silakan minta kode baru." };
    }
    if (Date.now() > record.expiresAt) {
        otpStore.delete(key);
        return { valid: false, error: "Kode OTP sudah kedaluwarsa. Silakan minta kode baru." };
    }
    if (record.code !== String(code || "").trim()) {
        return { valid: false, error: "Kode OTP salah." };
    }
    otpStore.delete(key);
    return { valid: true };
}

async function sendOtpEmail(toEmail, fullName, code, mode) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error("SMTP_USER atau SMTP_PASS belum dikonfigurasi di .env");
    }

    const isLogin = mode === "login";
    const subject = isLogin
        ? "Kode OTP Login - Psylock AI"
        : "Kode OTP Reset Password - Psylock AI";
    const actionText = isLogin
        ? "masuk (login) ke akun Psylock AI kamu"
        : "mereset password akun Psylock AI kamu";

    await transporter.sendMail({
        from: `"Psylock AI" <${process.env.SMTP_USER}>`,
        to: toEmail,
        subject,
        text: [
            `Halo ${fullName},`,
            "",
            `Kode OTP untuk ${actionText} adalah: ${code}`,
            "Kode ini berlaku selama 10 menit. Jangan bagikan kode ini kepada siapa pun.",
            "",
            "Jika kamu tidak melakukan permintaan ini, abaikan email ini."
        ].join("\n")
    });
}

// --- GEMINI CONFIG & ROTATION ---
const MODEL = "gemini-3.5-flash-lite";
const COOLDOWN_MS = 60 * 1000; // Jeda 60 detik untuk key yang baru kena limit
const REQUEST_TIMEOUT_MS = 8500; // Batas waktu per request agar aman di serverless

const CREATOR_RESPONSES = [
    "Psylock AI diciptakan oleh tim dari SMKN 1 Surabaya, yaitu Abdul Rahman Syahid, Ahmad Abyan Rasyad, Bagaskoro Satrio Wicaksono, Djibril Arkana Arisyahputra, dan Yudesar Natanael Dwiputra. Tim tersebutlah yang merancang dan mengembangkan Psylock AI sebagai asisten AI yang inovatif.",
    `Psylock AI dibuat oleh tim dari SMKN 1 Surabaya. Tim tersebut terdiri dari:
•Abdul Rahman Syahid
•Ahmad Abyan Rasyad
•Bagaskoro Satrio Wicaksono
•Djibril Arkana Arisyahputra
•Yudesar Natanael Dwiputra`
];

function loadApiKeys() {
    const keys = [];

    for (let i = 1; i <= 30; i++) {
        const val = process.env[`GEMINI_API_KEY_${i}`];
        if (val && val.trim()) {
            keys.push({
                label: `GEMINI_API_KEY_${i}`,
                key: val.trim()
            });
        }
    }

    if (process.env.GEMINI_API_KEYS) {
        process.env.GEMINI_API_KEYS.split(",").forEach((raw, idx) => {
            const trimmed = raw.trim();
            if (trimmed && !keys.some((k) => k.key === trimmed)) {
                keys.push({
                    label: `GEMINI_API_KEYS[${idx + 1}]`,
                    key: trimmed
                });
            }
        });
    }

    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
        const singleKey = process.env.GEMINI_API_KEY.trim();
        if (!keys.some((k) => k.key === singleKey)) {
            keys.push({
                label: "GEMINI_API_KEY",
                key: singleKey
            });
        }
    }

    return keys;
}

const API_KEYS = loadApiKeys();
let currentKeyIndex = 0;
const keyBlockedUntil = new Array(API_KEYS.length).fill(0);

function isLimitError(status, errorMessage = "") {
    const msg = String(errorMessage).toLowerCase();
    return (
        status === 429 ||
        msg.includes("resource_exhausted") ||
        msg.includes("quota") ||
        msg.includes("rate limit") ||
        msg.includes("too many requests") ||
        msg.includes("limit")
    );
}

function getNextAvailableKeyIndex() {
    if (API_KEYS.length === 0) return -1;
    const now = Date.now();

    for (let offset = 0; offset < API_KEYS.length; offset++) {
        const idx = (currentKeyIndex + offset) % API_KEYS.length;
        if (keyBlockedUntil[idx] <= now) {
            currentKeyIndex = idx;
            return idx;
        }
    }

    return -1;
}

function advanceKeyAfterLimit(usedIndex) {
    if (API_KEYS.length === 0) return;
    keyBlockedUntil[usedIndex] = Date.now() + COOLDOWN_MS;
    currentKeyIndex = (usedIndex + 1) % API_KEYS.length;
}

function extractTextFromResponse(data) {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return "";
    return parts
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .join("");
}

function isLikelyTruncated(data, text) {
    const finishReason = data?.candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") return true;

    const trimmed = String(text || "").trim();
    if (!trimmed) return false;

    const endsCleanly = /[.!?…"'`)\]]$/.test(trimmed);
    return !endsCleanly && trimmed.length >= 25;
}

function getLatestUserText(contents) {
    if (!Array.isArray(contents)) return "";
    for (let i = contents.length - 1; i >= 0; i--) {
        const item = contents[i];
        if (item?.role === "user" && Array.isArray(item.parts)) {
            return item.parts
                .map((p) => (typeof p?.text === "string" ? p.text : ""))
                .join(" ")
                .trim();
        }
    }
    return "";
}

function isCreatorQuestion(text) {
    const normalized = String(text || "").toLowerCase();
    return (
        normalized.includes("pencipta") ||
        normalized.includes("menciptakan") ||
        normalized.includes("diciptakan") ||
        normalized.includes("pembuat") ||
        normalized.includes("dibuat oleh") ||
        normalized.includes("dibikin oleh") ||
        normalized.includes("siapa yang buat") ||
        normalized.includes("siapa yang bikin") ||
        normalized.includes("siapa yang menciptakan")
    );
}

function buildDirectGeminiResponse(text) {
    return {
        candidates: [
            {
                content: {
                    role: "model",
                    parts: [{ text }]
                },
                finishReason: "STOP"
            }
        ]
    };
}

async function fetchGeminiOnce(contents) {
    if (API_KEYS.length === 0) {
        throw new Error("Tidak ada API key Gemini yang dikonfigurasi di .env");
    }

    let lastError = null;
    const maxAttempts = API_KEYS.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const keyIndex = getNextAvailableKeyIndex();

        if (keyIndex === -1) {
            const err = new Error(
                `Semua ${API_KEYS.length} API key sedang mencapai batas limit. Coba lagi sebentar.`
            );
            err.status = 429;
            throw err;
        }

        const activeEntry = API_KEYS[keyIndex];
        const endpoint =
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(activeEntry.key)}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents,
                    generationConfig: {
                        maxOutputTokens: 4096
                    }
                }),
                signal: controller.signal
            });

            const data = await response.json();

            if (!response.ok) {
                const message = data.error?.message || "Gemini API request failed";
                const error = new Error(message);
                error.status = response.status;

                if (isLimitError(response.status, message)) {
                    console.warn(
                        `[${activeEntry.label}] kena limit (${response.status}), pindah ke key berikutnya...`
                    );
                    advanceKeyAfterLimit(keyIndex);
                    lastError = error;
                    continue;
                }

                throw error;
            }

            currentKeyIndex = (keyIndex + 1) % API_KEYS.length;
            return data;
        } catch (error) {
            if (error.name === "AbortError") {
                const timeoutErr = new Error("Request ke Gemini melewati batas waktu (timeout)");
                timeoutErr.status = 504;
                throw timeoutErr;
            }

            lastError = error;
            if (isLimitError(error.status || 0, error.message)) {
                console.warn(
                    `[${activeEntry.label}] terdeteksi limit, pindah ke key berikutnya...`
                );
                advanceKeyAfterLimit(keyIndex);
                continue;
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    throw lastError || new Error("Gagal memanggil Gemini API setelah mencoba semua key");
}

async function callGemini(contents, { allowAutoContinue = true } = {}) {
    const firstData = await fetchGeminiOnce(contents);
    const firstText = extractTextFromResponse(firstData);

    if (!allowAutoContinue || !isLikelyTruncated(firstData, firstText)) {
        return firstData;
    }

    try {
        const continuationContents = [
            ...contents,
            {
                role: "model",
                parts: [{ text: firstText }]
            },
            {
                role: "user",
                parts: [
                    {
                        text: "Lanjutkan jawabanmu tepat dari kata terakhir yang terpotong tanpa mengulang bagian sebelumnya."
                    }
                ]
            }
        ];

        const secondData = await fetchGeminiOnce(continuationContents);
        const secondText = extractTextFromResponse(secondData);

        if (!secondText.trim()) {
            return firstData;
        }

        const needsSpace =
            !/\s$/.test(firstText) &&
            !/^\s/.test(secondText) &&
            !/^[,.!?;:)\]]/.test(secondText);

        const combinedText = `${firstText}${needsSpace ? " " : ""}${secondText.trimStart()}`;

        return {
            ...firstData,
            candidates: [
                {
                    ...firstData.candidates[0],
                    content: {
                        ...(firstData.candidates[0]?.content || { role: "model" }),
                        parts: [{ text: combinedText }]
                    },
                    finishReason: secondData?.candidates?.[0]?.finishReason || "STOP"
                }
            ]
        };
    } catch (continuationError) {
        console.warn("Auto-continue gagal, mengembalikan respons awal:", continuationError.message);
        return firstData;
    }
}

// --- AUTH ENDPOINTS ---
app.post("/api/auth/register", async (req, res) => {
    try {
        const fullName = String(req.body.full_name || req.body.fullName || "").trim();
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || "");

        if (!fullName || !email || !password) {
            return res.status(400).json({ error: "Nama lengkap, email, dan password wajib diisi." });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: "Password minimal 6 karakter." });
        }

        const { data: existing, error: selectErr } = await supabase
            .from("psylock_users")
            .select("id")
            .eq("email", email)
            .maybeSingle();

        if (selectErr) {
            console.error("Register check error:", selectErr);
            return res.status(500).json({ error: "Gagal memeriksa status email." });
        }
        if (existing) {
            return res.status(409).json({ error: "Email sudah terdaftar. Silakan login." });
        }

        const passwordHash = hashPassword(password);

        const { data: created, error: insertErr } = await supabase
            .from("psylock_users")
            .insert({
                full_name: fullName,
                email,
                password_hash: passwordHash
            })
            .select("id, full_name, email, created_at")
            .single();

        if (insertErr) {
            console.error("Register insert error:", insertErr);
            return res.status(500).json({ error: "Gagal mendaftarkan akun." });
        }

        return res.status(201).json({
            message: "Registrasi berhasil. Silakan login.",
            user: created
        });
    } catch (err) {
        console.error("Register exception:", err);
        return res.status(500).json({ error: "Terjadi kesalahan pada server." });
    }
});

// Login langsung (tanpa OTP) atau langkah 1 login OTP
app.post("/api/auth/login", async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || "");
        const requireOtp = Boolean(req.body.requireOtp);

        if (!email || !password) {
            return res.status(400).json({ error: "Email dan password wajib diisi." });
        }

        const { data: user, error } = await supabase
            .from("psylock_users")
            .select("id, full_name, email, password_hash, created_at")
            .eq("email", email)
            .maybeSingle();

        if (error || !user || !verifyPassword(password, user.password_hash)) {
            return res.status(401).json({ error: "Email atau password salah." });
        }

        if (requireOtp) {
            const otpCode = createOtp("login", email);
            await sendOtpEmail(email, user.full_name, otpCode, "login");
            return res.json({
                requiresOtp: true,
                message: "Kode OTP login telah dikirim ke email kamu."
            });
        }

        return res.json({
            requiresOtp: false,
            message: "Login berhasil.",
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                created_at: user.created_at
            }
        });
    } catch (err) {
        console.error("Login exception:", err);
        return res.status(500).json({ error: err.message || "Terjadi kesalahan saat login." });
    }
});

// Kirim OTP saat login
app.post("/api/auth/login-request-otp", async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || "");

        if (!email || !password) {
            return res.status(400).json({ error: "Email dan password wajib diisi." });
        }

        const { data: user, error } = await supabase
            .from("psylock_users")
            .select("id, full_name, email, password_hash")
            .eq("email", email)
            .maybeSingle();

        if (error || !user || !verifyPassword(password, user.password_hash)) {
            return res.status(401).json({ error: "Email atau password salah." });
        }

        const otpCode = createOtp("login", email);
        await sendOtpEmail(email, user.full_name, otpCode, "login");

        return res.json({
            requiresOtp: true,
            message: "Kode OTP login telah dikirim ke email kamu."
        });
    } catch (err) {
        console.error("Login OTP request error:", err);
        return res.status(500).json({ error: "Gagal mengirim kode OTP login." });
    }
});

// Verifikasi OTP login
app.post("/api/auth/login-verify-otp", async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const otp = String(req.body.otp || "").trim();

        if (!email || !otp) {
            return res.status(400).json({ error: "Email dan kode OTP wajib diisi." });
        }

        const otpResult = verifyOtp("login", email, otp);
        if (!otpResult.valid) {
            return res.status(400).json({ error: otpResult.error });
        }

        const { data: user, error } = await supabase
            .from("psylock_users")
            .select("id, full_name, email, created_at")
            .eq("email", email)
            .maybeSingle();

        if (error || !user) {
            return res.status(404).json({ error: "Akun tidak ditemukan." });
        }

        return res.json({
            message: "Verifikasi OTP berhasil. Login sukses.",
            user
        });
    } catch (err) {
        console.error("Login OTP verify error:", err);
        return res.status(500).json({ error: "Terjadi kesalahan saat verifikasi OTP login." });
    }
});

// Kirim OTP lupa password
app.post("/api/auth/forgot-password", async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        if (!email) {
            return res.status(400).json({ error: "Email wajib diisi." });
        }

        const { data: user } = await supabase
            .from("psylock_users")
            .select("id, full_name, email")
            .eq("email", email)
            .maybeSingle();

        if (!user) {
            return res.status(404).json({ error: "Email tidak terdaftar di Psylock AI." });
        }

        const otpCode = createOtp("reset", email);
        await sendOtpEmail(email, user.full_name, otpCode, "reset");

        return res.json({ message: "Kode OTP reset password telah dikirim ke email kamu." });
    } catch (err) {
        console.error("Forgot password error:", err);
        return res.status(500).json({ error: "Gagal mengirim kode OTP. Periksa konfigurasi SMTP." });
    }
});

// Verifikasi OTP lupa password & ganti password baru
app.post("/api/auth/reset-password", async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const otp = String(req.body.otp || "").trim();
        const newPassword = String(req.body.newPassword || req.body.new_password || "");

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ error: "Email, kode OTP, dan password baru wajib diisi." });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: "Password baru minimal 6 karakter." });
        }

        const otpResult = verifyOtp("reset", email, otp);
        if (!otpResult.valid) {
            return res.status(400).json({ error: otpResult.error });
        }

        const newHash = hashPassword(newPassword);
        const { error } = await supabase
            .from("psylock_users")
            .update({ password_hash: newHash })
            .eq("email", email);

        if (error) {
            console.error("Reset password update error:", error);
            return res.status(500).json({ error: "Gagal memperbarui password." });
        }

        return res.json({ message: "Password berhasil direset. Silakan login kembali." });
    } catch (err) {
        console.error("Reset password exception:", err);
        return res.status(500).json({ error: "Terjadi kesalahan pada server." });
    }
});

// --- CHAT HISTORY SYNC ENDPOINTS ---
app.get("/api/chats", async (req, res) => {
    try {
        const email = normalizeEmail(req.query.email);
        if (!email) {
            return res.status(400).json({ error: "Parameter email wajib disertakan." });
        }

        const { data, error } = await supabase
            .from("psylock_chat_histories")
            .select("id, session_id, title, messages, updated_at")
            .eq("user_email", email)
            .order("updated_at", { ascending: false });

        if (error) {
            console.error("Get chats error:", error);
            return res.status(500).json({ error: "Gagal memuat riwayat chat." });
        }

        return res.json({ chats: data || [] });
    } catch (err) {
        console.error("Get chats exception:", err);
        return res.status(500).json({ error: "Terjadi kesalahan pada server." });
    }
});

app.post("/api/chats/save", async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email || req.body.user_email);
        const sessionId = String(req.body.session_id || req.body.sessionId || "").trim();
        const title = String(req.body.title || "Chat Baru").trim() || "Chat Baru";
        const messages = Array.isArray(req.body.messages) ? req.body.messages : [];

        if (!email || !sessionId) {
            return res.status(400).json({ error: "Email dan session_id wajib diisi." });
        }

        const { data, error } = await supabase
            .from("psylock_chat_histories")
            .upsert(
                {
                    user_email: email,
                    session_id: sessionId,
                    title,
                    messages,
                    updated_at: new Date().toISOString()
                },
                { onConflict: "user_email,session_id" }
            )
            .select("id, session_id, title, messages, updated_at")
            .single();

        if (error) {
            console.error("Save chat error:", error);
            return res.status(500).json({ error: "Gagal menyimpan riwayat chat." });
        }

        return res.json({ message: "Riwayat chat tersimpan.", chat: data });
    } catch (err) {
        console.error("Save chat exception:", err);
        return res.status(500).json({ error: "Terjadi kesalahan pada server." });
    }
});

// --- AI CHAT & IMAGE PROMPT ENDPOINTS ---
app.post("/api/chat", async (req, res) => {
    try {
        const { contents } = req.body;

        if (!Array.isArray(contents)) {
            return res.status(400).json({
                error: "Format contents tidak valid"
            });
        }

        const latestUserText = getLatestUserText(contents);
        if (isCreatorQuestion(latestUserText)) {
            const randomIndex = Math.floor(Math.random() * CREATOR_RESPONSES.length);
            return res.json(buildDirectGeminiResponse(CREATOR_RESPONSES[randomIndex]));
        }

        const result = await callGemini(contents, { allowAutoContinue: true });
        res.json(result);
    } catch (error) {
        console.error("Chat API Error:", error.message);

        res.status(error.status || 500).json({
            error: error.message
        });
    }
});

app.post("/api/image-prompt", async (req, res) => {
    try {
        const { promptGambar } = req.body;

        if (typeof promptGambar !== "string" || !promptGambar.trim()) {
            return res.status(400).json({
                error: "Prompt gambar tidak boleh kosong"
            });
        }

        const promptInstruksi = `
Buatkan deskripsi visual bahasa Inggris yang sangat detail
dan sinematik untuk AI image generator berdasarkan permintaan
pengguna ini: "${promptGambar}".

PENTING: Pastikan semua objek, latar tempat, dan
AKTIVITAS/TINDAKAN yang diminta pengguna digambarkan
dengan sangat jelas dan ekspresif.

Jawab HANYA dengan teks deskripsi bahasa Inggrisnya saja
tanpa tanda kutip atau teks tambahan.
`;

        const result = await callGemini(
            [
                {
                    role: "user",
                    parts: [{ text: promptInstruksi }]
                }
            ],
            { allowAutoContinue: false }
        );

        res.json(result);
    } catch (error) {
        console.error("Image Prompt API Error:", error.message);

        res.status(error.status || 500).json({
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT} (${API_KEYS.length} API key aktif)`);
});