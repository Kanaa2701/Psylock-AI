(function () {
  const SESSION_USER_KEY = "psylock_current_user";
  const GUEST_CHATS_KEY = "psylock_guest_chats";

  const state = {
    tab: "login", // "login" | "register" | "forgot"
    loginStep: "credentials", // "credentials" | "otp"
    forgotStep: "email", // "email" | "reset"
    pendingEmail: "",
    user: loadSavedUser()
  };

  function loadSavedUser() {
    try {
      const raw = localStorage.getItem(SESSION_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveUser(user) {
    state.user = user;
    if (user) {
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_USER_KEY);
    }
    updateAccountBadge();
  }

  function updateAccountBadge() {
    const btn = document.getElementById("psylockAccountBtn");
    if (!btn) return;
    if (state.user) {
      btn.textContent = `${state.user.full_name} • Keluar`;
    } else {
      btn.textContent = "Mode Tamu • Masuk";
    }
  }

  function buildModalIfMissing() {
    if (document.getElementById("psylockAuthBackdrop")) return;

    const backdrop = document.createElement("div");
    backdrop.id = "psylockAuthBackdrop";
    backdrop.className = "psylock-auth-backdrop";
    backdrop.innerHTML = `
      <div class="psylock-auth-card" role="dialog" aria-modal="true" aria-labelledby="psylockAuthTitle">
        <div class="psylock-auth-header">
          <h2 id="psylockAuthTitle" class="psylock-auth-title">Psylock AI</h2>
          <p id="psylockAuthSubtitle" class="psylock-auth-sub">Masuk untuk melanjutkan ke Psylock AI</p>
        </div>

        <form id="psylockAuthForm"></form>
        <div id="psylockAuthMsg" class="psylock-auth-msg"></div>
        <div id="psylockAuthFooter" class="psylock-auth-switch-footer"></div>
      </div>
    `;
    document.body.appendChild(backdrop);
  }

  function passwordFieldHtml(id, label, placeholder = "Minimal 6 karakter") {
    return `
      <div class="psylock-auth-field">
        <label class="psylock-auth-label" for="${id}">${label}</label>
        <div class="psylock-auth-input-wrap">
          <input id="${id}" type="password" class="psylock-auth-input" placeholder="${placeholder}" required />
          <button type="button" class="psylock-eye-btn" data-target="${id}" aria-label="Tampilkan atau sembunyikan sandi">👁</button>
        </div>
      </div>
    `;
  }

  function renderForm() {
    const form = document.getElementById("psylockAuthForm");
    const subtitle = document.getElementById("psylockAuthSubtitle");
    const footer = document.getElementById("psylockAuthFooter");
    if (!form || !footer) return;
    hideMessage();

    if (state.tab === "login") {
      if (subtitle) subtitle.textContent = "Masuk untuk melanjutkan ke Psylock AI";

      if (state.loginStep === "credentials") {
        form.innerHTML = `
          <div class="psylock-auth-field">
            <label class="psylock-auth-label" for="loginEmail">Email</label>
            <input id="loginEmail" type="email" class="psylock-auth-input" placeholder="nama@gmail.com" value="${state.pendingEmail}" required />
          </div>
          ${passwordFieldHtml("loginPassword", "Password", "••••••••")}
          <div class="psylock-auth-meta-row">
            <button type="button" class="psylock-link-btn" id="openForgotFromLoginBtn">Lupa Password?</button>
          </div>
          <div class="psylock-auth-actions">
            <button type="submit" class="psylock-btn-primary" id="authSubmitBtn">Kirim Kode OTP Login</button>
            <button type="button" id="psylockSkipBtn" class="psylock-btn-secondary">Lewati (Lanjut sebagai Tamu)</button>
          </div>
        `;
      } else {
        form.innerHTML = `
          <p class="psylock-auth-sub" style="margin-bottom:14px;text-align:center;">
            Kode OTP 6 digit telah dikirim ke <strong>${state.pendingEmail}</strong>.
          </p>
          <div class="psylock-auth-field">
            <label class="psylock-auth-label" for="loginOtp">Kode OTP</label>
            <input id="loginOtp" type="text" inputmode="numeric" maxlength="6" class="psylock-auth-input" placeholder="123456" required />
          </div>
          <div class="psylock-auth-actions">
            <button type="submit" class="psylock-btn-primary" id="authSubmitBtn">Verifikasi & Masuk</button>
            <button type="button" class="psylock-btn-secondary" id="backToLoginCredsBtn">Ganti Email / Password</button>
          </div>
        `;
      }

      footer.innerHTML = `
        Belum punya akun? <button type="button" class="psylock-link-btn" id="switchToRegisterBtn">Daftar sekarang</button>
      `;
    } else if (state.tab === "register") {
      if (subtitle) subtitle.textContent = "Buat akun baru untuk melanjutkan ke Psylock AI";

      form.innerHTML = `
        <div class="psylock-auth-field">
          <label class="psylock-auth-label" for="regName">Nama Lengkap</label>
          <input id="regName" type="text" class="psylock-auth-input" placeholder="Nama lengkap kamu" required />
        </div>
        <div class="psylock-auth-field">
          <label class="psylock-auth-label" for="regEmail">Email</label>
          <input id="regEmail" type="email" class="psylock-auth-input" placeholder="nama@gmail.com" required />
        </div>
        ${passwordFieldHtml("regPassword", "Password", "Minimal 6 karakter")}
        <div class="psylock-auth-actions">
          <button type="submit" class="psylock-btn-primary" id="authSubmitBtn">Daftar Akun</button>
          <button type="button" id="psylockSkipBtn" class="psylock-btn-secondary">Lewati (Lanjut sebagai Tamu)</button>
        </div>
      `;

      footer.innerHTML = `
        Sudah punya akun? <button type="button" class="psylock-link-btn" id="switchToLoginBtn">Masuk sekarang</button>
      `;
    } else if (state.tab === "forgot") {
      if (subtitle) subtitle.textContent = "Reset password akun Psylock AI kamu";

      if (state.forgotStep === "email") {
        form.innerHTML = `
          <div class="psylock-auth-field">
            <label class="psylock-auth-label" for="forgotEmail">Email Terdaftar</label>
            <input id="forgotEmail" type="email" class="psylock-auth-input" placeholder="nama@gmail.com" value="${state.pendingEmail}" required />
          </div>
          <div class="psylock-auth-actions">
            <button type="submit" class="psylock-btn-primary" id="authSubmitBtn">Kirim Kode OTP Reset</button>
          </div>
        `;
      } else {
        form.innerHTML = `
          <p class="psylock-auth-sub" style="margin-bottom:14px;text-align:center;">
            Masukkan kode OTP yang dikirim ke <strong>${state.pendingEmail}</strong> beserta password baru.
          </p>
          <div class="psylock-auth-field">
            <label class="psylock-auth-label" for="resetOtp">Kode OTP</label>
            <input id="resetOtp" type="text" inputmode="numeric" maxlength="6" class="psylock-auth-input" placeholder="123456" required />
          </div>
          ${passwordFieldHtml("resetNewPassword", "Password Baru", "Minimal 6 karakter")}
          <div class="psylock-auth-actions">
            <button type="submit" class="psylock-btn-primary" id="authSubmitBtn">Simpan Password Baru</button>
            <button type="button" class="psylock-btn-secondary" id="backToForgotEmailBtn">Ubah Email</button>
          </div>
        `;
      }

      footer.innerHTML = `
        Ingat password? <button type="button" class="psylock-link-btn" id="switchToLoginBtn">Kembali ke Masuk</button>
      `;
    }
  }

  function showMessage(text, type = "error") {
    const box = document.getElementById("psylockAuthMsg");
    if (!box) return;
    box.textContent = text;
    box.className = `psylock-auth-msg is-visible ${type === "success" ? "is-success" : "is-error"}`;
  }

  function hideMessage() {
    const box = document.getElementById("psylockAuthMsg");
    if (!box) return;
    box.textContent = "";
    box.className = "psylock-auth-msg";
  }

  async function postJson(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Permintaan gagal diproses.");
    }
    return data;
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById("authSubmitBtn");
    if (submitBtn) submitBtn.disabled = true;
    hideMessage();

    try {
      if (state.tab === "login") {
        if (state.loginStep === "credentials") {
          const email = document.getElementById("loginEmail").value.trim();
          const password = document.getElementById("loginPassword").value;
          const data = await postJson("/api/auth/login-request-otp", { email, password });
          state.pendingEmail = email;
          state.loginStep = "otp";
          renderForm();
          showMessage(data.message || "Kode OTP dikirim ke email.", "success");
        } else {
          const otp = document.getElementById("loginOtp").value.trim();
          const data = await postJson("/api/auth/login-verify-otp", {
            email: state.pendingEmail,
            otp
          });
          saveUser(data.user);
          showMessage(`Selamat datang, ${data.user.full_name}!`, "success");
          setTimeout(() => {
            closeAuthModal();
            window.dispatchEvent(new CustomEvent("psylock:auth-changed", { detail: { user: data.user } }));
          }, 500);
        }
      } else if (state.tab === "register") {
        const full_name = document.getElementById("regName").value.trim();
        const email = document.getElementById("regEmail").value.trim();
        const password = document.getElementById("regPassword").value;
        const data = await postJson("/api/auth/register", { full_name, email, password });
        state.pendingEmail = email;
        state.tab = "login";
        state.loginStep = "credentials";
        renderForm();
        showMessage(data.message || "Registrasi berhasil. Silakan login.", "success");
      } else if (state.tab === "forgot") {
        if (state.forgotStep === "email") {
          const email = document.getElementById("forgotEmail").value.trim();
          const data = await postJson("/api/auth/forgot-password", { email });
          state.pendingEmail = email;
          state.forgotStep = "reset";
          renderForm();
          showMessage(data.message || "Kode OTP reset dikirim.", "success");
        } else {
          const otp = document.getElementById("resetOtp").value.trim();
          const newPassword = document.getElementById("resetNewPassword").value;
          const data = await postJson("/api/auth/reset-password", {
            email: state.pendingEmail,
            otp,
            newPassword
          });
          state.tab = "login";
          state.loginStep = "credentials";
          state.forgotStep = "email";
          renderForm();
          showMessage(data.message || "Password berhasil direset. Silakan login.", "success");
        }
      }
    } catch (err) {
      showMessage(err.message, "error");
    } finally {
      const btnAfter = document.getElementById("authSubmitBtn");
      if (btnAfter) btnAfter.disabled = false;
    }
  }

  function openAuthModal(defaultTab = "login") {
    buildModalIfMissing();
    state.tab = defaultTab;
    if (defaultTab === "login") state.loginStep = "credentials";
    if (defaultTab === "forgot") state.forgotStep = "email";
    renderForm();
    document.getElementById("psylockAuthBackdrop").classList.add("is-open");
  }

  function closeAuthModal() {
    const backdrop = document.getElementById("psylockAuthBackdrop");
    if (backdrop) backdrop.classList.remove("is-open");
  }

  function bindEvents() {
    document.addEventListener("click", (e) => {
      if (e.target.id === "openForgotFromLoginBtn") {
        const emailInput = document.getElementById("loginEmail");
        if (emailInput && emailInput.value.trim()) {
          state.pendingEmail = emailInput.value.trim();
        }
        state.tab = "forgot";
        state.forgotStep = "email";
        renderForm();
        return;
      }

      if (e.target.id === "switchToRegisterBtn") {
        state.tab = "register";
        renderForm();
        return;
      }

      if (e.target.id === "switchToLoginBtn") {
        state.tab = "login";
        state.loginStep = "credentials";
        renderForm();
        return;
      }

      const eyeBtn = e.target.closest(".psylock-eye-btn");
      if (eyeBtn) {
        const input = document.getElementById(eyeBtn.dataset.target);
        if (input) {
          input.type = input.type === "password" ? "text" : "password";
        }
        return;
      }

      if (e.target.id === "psylockSkipBtn") {
        closeAuthModal();
        window.dispatchEvent(new CustomEvent("psylock:guest-mode"));
        return;
      }

      if (e.target.id === "backToLoginCredsBtn") {
        state.loginStep = "credentials";
        renderForm();
        return;
      }

      if (e.target.id === "backToForgotEmailBtn") {
        state.forgotStep = "email";
        renderForm();
        return;
      }

      if (e.target.id === "psylockAccountBtn") {
        if (state.user) {
          saveUser(null);
          window.dispatchEvent(new CustomEvent("psylock:auth-changed", { detail: { user: null } }));
        } else {
          openAuthModal("login");
        }
      }
    });

    document.addEventListener("submit", (e) => {
      if (e.target && e.target.id === "psylockAuthForm") {
        handleFormSubmit(e);
      }
    });
  }

  window.PsylockAuth = {
    getUser: () => state.user,
    openModal: openAuthModal,
    closeModal: closeAuthModal,
    async loadChats() {
      if (state.user && state.user.email) {
        const url = `/api/chats?email=${encodeURIComponent(state.user.email)}`;
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Gagal memuat riwayat chat.");
        return Array.isArray(data.chats) ? data.chats : [];
      }
      try {
        const raw = localStorage.getItem(GUEST_CHATS_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },
    async saveChat({ session_id, title, messages }) {
      const safeTitle = String(title || "Chat Baru").trim() || "Chat Baru";
      const safeMessages = Array.isArray(messages) ? messages : [];

      if (state.user && state.user.email) {
        return postJson("/api/chats/save", {
          email: state.user.email,
          session_id,
          title: safeTitle,
          messages: safeMessages
        });
      }

      const existing = await this.loadChats();
      const idx = existing.findIndex((c) => c.session_id === session_id);
      const record = {
        session_id,
        title: safeTitle,
        messages: safeMessages,
        updated_at: new Date().toISOString()
      };
      if (idx >= 0) existing[idx] = record;
      else existing.unshift(record);
      localStorage.setItem(GUEST_CHATS_KEY, JSON.stringify(existing));
      return { chat: record };
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    buildModalIfMissing();
    bindEvents();
    updateAccountBadge();
    if (!state.user) {
      openAuthModal("login");
    }
  });
})();