
require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.5-flash";

async function callGemini(contents) {
    if (!API_KEY) {
        throw new Error("GEMINI_API_KEY belum dikonfigurasi");
    }

    const endpoint =
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ contents })
    });

    const data = await response.json();

    if (!response.ok) {
        const error = new Error(
            data.error?.message || "Gemini API request failed"
        );
        error.status = response.status;
        throw error;
    }

    return data;
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
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
