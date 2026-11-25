require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

const MODEL = "gemini-3.5-flash";
const COOLDOWN_MS = 60 * 1000; // Jeda 60 detik untuk key yang baru kena limit

function loadApiKeys() {
    const keys = [];

    // Ambil GEMINI_API_KEY_1 sampai GEMINI_API_KEY_17 (atau lebih jika ditambah)
    for (let i = 1; i <= 30; i++) {
        const val = process.env[`GEMINI_API_KEY_${i}`];
        if (val && val.trim()) {
            keys.push({
                label: `GEMINI_API_KEY_${i}`,
                key: val.trim()
            });
        }
    }

    // Jika ada GEMINI_API_KEYS (dipisah koma), masukkan juga jika belum ada
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

    // Fallback jika hanya memakai GEMINI_API_KEY tunggal
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

    return -1; // Semua API key sedang dalam masa cooldown
}

function advanceKeyAfterLimit(usedIndex) {
    if (API_KEYS.length === 0) return;
    keyBlockedUntil[usedIndex] = Date.now() + COOLDOWN_MS;
    // Pindah ke key berikutnya, lalu kembali ke index 0 setelah key terakhir
    currentKeyIndex = (usedIndex + 1) % API_KEYS.length;
}

async function callGemini(contents) {
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

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ contents })
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

            return data;
        } catch (error) {
            lastError = error;
            if (isLimitError(error.status || 0, error.message)) {
                console.warn(
                    `[${activeEntry.label}] terdeteksi limit, pindah ke key berikutnya...`
                );
                advanceKeyAfterLimit(keyIndex);
                continue;
            }
            throw error;
        }
    }

    throw lastError || new Error("Gagal memanggil Gemini API setelah mencoba semua key");
}

app.post("/api/chat", async (req, res) => {
    try {
        const { contents } = req.body;

        if (!Array.isArray(contents)) {
            return res.status(400).json({
                error: "Format contents tidak valid"
            });
        }

        const result = await callGemini(contents);
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

        const result = await callGemini([
            {
                role: "user",
                parts: [{ text: promptInstruksi }]
            }
        ]);

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