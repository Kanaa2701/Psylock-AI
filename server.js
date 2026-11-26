require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Urutan model: coba model utama dulu, lalu otomatis pindah ke cadangan jika 503/limit/gangguan
const MODELS = [
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash"
];

const COOLDOWN_MS = 60 * 1000; // Jeda 60 detik untuk key yang kena limit
const REQUEST_TIMEOUT_MS = 8500; // Batas waktu per request agar aman di serverless

function loadApiKeys() {
    const keys = [];

    // Ambil GEMINI_API_KEY_1 sampai GEMINI_API_KEY_30
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

function isHighDemandOrTransientError(status, errorMessage = "") {
    const msg = String(errorMessage).toLowerCase();
    return (
        status === 503 ||
        status === 500 ||
        status === 502 ||
        status === 504 ||
        msg.includes("high demand") ||
        msg.includes("overloaded") ||
        msg.includes("unavailable") ||
        msg.includes("temporarily") ||
        msg.includes("timeout") ||
        msg.includes("aborted") ||
        msg.includes("fetch failed") ||
        msg.includes("network")
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

    // Jika semua key sedang cooldown, tetap kembalikan key berikutnya sebagai darurat
    const fallbackIdx = currentKeyIndex % API_KEYS.length;
    return fallbackIdx;
}

function advanceKeyAfterLimit(usedIndex) {
    if (API_KEYS.length === 0) return;
    keyBlockedUntil[usedIndex] = Date.now() + COOLDOWN_MS;
    currentKeyIndex = (usedIndex + 1) % API_KEYS.length;
}

function advanceKeyRotation(usedIndex) {
    if (API_KEYS.length === 0) return;
    currentKeyIndex = (usedIndex + 1) % API_KEYS.length;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGeminiWithTimeout(model, apiKey, contents) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const endpoint =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ contents }),
            signal: controller.signal
        });

        let data = {};
        try {
            data = await response.json();
        } catch {
            data = {};
        }

        if (!response.ok) {
            const message = data.error?.message || `Gemini API request failed (${response.status})`;
            const error = new Error(message);
            error.status = response.status;
            throw error;
        }

        return data;
    } catch (error) {
        if (error.name === "AbortError") {
            const timeoutErr = new Error("Request ke Gemini melewati batas waktu (timeout)");
            timeoutErr.status = 504;
            throw timeoutErr;
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

async function callGemini(contents) {
    if (API_KEYS.length === 0) {
        throw new Error("Tidak ada API key Gemini yang dikonfigurasi di .env");
    }

    let lastError = null;
    const maxKeyAttempts = Math.min(API_KEYS.length, 6);

    // Lakukan maksimal 2 putaran singkat jika semua model/key sedang padat saat presentasi
    for (let round = 0; round < 2; round++) {
        for (const model of MODELS) {
            for (let attempt = 0; attempt < maxKeyAttempts; attempt++) {
                const keyIndex = getNextAvailableKeyIndex();
                const activeEntry = API_KEYS[keyIndex];

                try {
                    const data = await fetchGeminiWithTimeout(model, activeEntry.key, contents);
                    advanceKeyRotation(keyIndex);
                    return data;
                } catch (error) {
                    lastError = error;
                    const status = error.status || 0;
                    const msg = error.message || "";

                    if (isLimitError(status, msg)) {
                        console.warn(
                            `[${activeEntry.label} | ${model}] kena limit (${status}), pindah key...`
                        );
                        advanceKeyAfterLimit(keyIndex);
                        continue;
                    }

                    if (isHighDemandOrTransientError(status, msg)) {
                        console.warn(
                            `[${activeEntry.label} | ${model}] padat/gangguan (${status}), coba key/model lain...`
                        );
                        advanceKeyRotation(keyIndex);
                        // Jika sudah mencoba beberapa key pada model yang sama dan tetap 503, pindah ke model berikutnya
                        if (attempt >= 1) {
                            break;
                        }
                        continue;
                    }

                    // Error non-transient (misalnya format prompt / API key tidak valid)
                    throw error;
                }
            }
        }

        if (round === 0) {
            await sleep(600);
        }
    }

    throw lastError || new Error("Gagal memanggil Gemini API setelah mencoba beberapa key dan model");
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