require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const https = require("https");
const nodemailer = require("nodemailer");

// Import des modèles
const Contact = require("./models/Contact");
const User = require("./models/User");
const Review = require("./models/Review");
const Project = require("./models/Project");

const app = express();
const PORT = process.env.PORT || 3000;
const EMAIL_TIMEOUT_MS = 12000;
const MAX_PASSWORD_BYTES = 72;
const hasJwtSecret = () => Buffer.byteLength(process.env.JWT_SECRET || "", "utf8") >= 32;
const FRONTEND_URL = (process.env.FRONTEND_URL || "https://hamabenhalima.github.io/SOIT-Infrastructure-Website").replace(/\/+$/, "");
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
);
const getEmailProvider = () => (process.env.EMAIL_PROVIDER || "brevo").trim().toLowerCase();
const hasEmailConfig = () => {
  if (getEmailProvider() === "gmail") {
    return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  }
  if (getEmailProvider() === "smtp") {
    return Boolean(
      process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASSWORD &&
        process.env.SMTP_FROM_EMAIL,
    );
  }
  return Boolean(process.env.BREVO_API_KEY);
};

const normalizeEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";
const isValidEmail = (value) => {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
const isValidId = (value) => mongoose.isValidObjectId(value);
const isSafeProjectImage = (value) => {
  if (typeof value !== "string" || value.length > 500) return false;
  const image = value.trim();
  if (/^images\/[A-Za-z0-9 _./()-]+\.(?:png|jpe?g|webp|gif)$/i.test(image) && !image.includes("..")) {
    return true;
  }
  try {
    return new URL(image).protocol === "https:";
  } catch {
    return false;
  }
};
const normalizeProjectInput = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const image = typeof body.image === "string" ? body.image.trim() : "";
  const year = body.year === "" || body.year == null ? null : Number(body.year);
  const isCurrent = body.isCurrent === true;
  const progressPercent = body.progressPercent === "" || body.progressPercent == null ? 0 : Number(body.progressPercent);
  const currentStage = typeof body.currentStage === "string" ? body.currentStage.trim() : "";
  const latestUpdate = typeof body.latestUpdate === "string" ? body.latestUpdate.trim() : "";
  const latestUpdateEn = typeof body.latestUpdateEn === "string" ? body.latestUpdateEn.trim() : "";
  const latestUpdateAr = typeof body.latestUpdateAr === "string" ? body.latestUpdateAr.trim() : "";
  const latestUpdateAt = body.latestUpdateAt ? new Date(body.latestUpdateAt) : null;
  const isPublished = body.isPublished !== false;
  const galleryImages = Array.isArray(body.galleryImages)
    ? [...new Set(body.galleryImages.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean))]
    : [];

  if (
    !title || title.length > 120 ||
    !category || category.length > 80 ||
    !location || location.length > 120 ||
    !description || description.length > 1000 ||
    !isSafeProjectImage(image) ||
    (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) ||
    !Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100 ||
    !["", "Étude", "Terrassement", "VRD", "Voirie", "Espaces verts", "Livraison"].includes(currentStage) ||
    latestUpdate.length > 500 || latestUpdateEn.length > 500 || latestUpdateAr.length > 500 ||
    (latestUpdateAt && Number.isNaN(latestUpdateAt.getTime())) ||
    (isCurrent && (!isPublished || !currentStage || !latestUpdate || !latestUpdateAt)) ||
    galleryImages.length > 20 || galleryImages.some((galleryImage) => !isSafeProjectImage(galleryImage))
  ) {
    return null;
  }

  return {
    title,
    category,
    location,
    description,
    image,
    year,
    galleryImages,
    isCurrent,
    progressPercent,
    currentStage,
    latestUpdate,
    latestUpdateEn,
    latestUpdateAr,
    latestUpdateAt,
    isPublished,
  };
};
const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

// ============ FONCTION POUR ENVOYER DES EMAILS VIA BREVO (API REST) ============
async function sendBrevoEmail(to, subject, htmlContent, userName = "Client") {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      sender: {
        email:
          process.env.BREVO_FROM_EMAIL || "contactsoitinfo@gmail.com",
        name: "SOIT Infrastructure",
      },
      to: [{ email: to, name: userName }],
      subject: subject,
      htmlContent: htmlContent,
    });

    const options = {
      hostname: "api.brevo.com",
      path: "/v3/smtp/email",
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      timeout: EMAIL_TIMEOUT_MS,
    };

    const req = https.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => {
        responseData += chunk;
      });
      res.on("end", () => {
        if (res.statusCode === 201) {
          console.log("✅ Email envoyé via Brevo (API REST)");
          resolve(true);
        } else {
          console.error("❌ Erreur Brevo API:", res.statusCode, responseData);
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on("error", (error) => {
      console.error("❌ Erreur réseau Brevo:", error.message);
      reject(error);
    });

    req.setTimeout(EMAIL_TIMEOUT_MS, () => {
      req.destroy(new Error("Brevo request timed out"));
    });

    req.write(data);
    req.end();
  });
}

// ============ RATE LIMITING ============
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Trop de tentatives. Réessayez dans 15 minutes.",
  },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Trop de tentatives d'inscription." },
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Trop de tentatives de réinitialisation." },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Trop de tentatives de connexion." },
});

// ============ MIDDLEWARE ============
app.use(compression());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const isLocalOrigin =
        origin === "null" ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
      if (process.env.NODE_ENV !== "production" && isLocalOrigin) {
        return callback(null, true);
      }
      if (process.env.NODE_ENV !== "production" && allowedOrigins.size === 0) {
        return callback(null, true);
      }
      return callback(null, allowedOrigins.has(origin.replace(/\/+$/, "")));
    },
  }),
);
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true }));

// ============ CONNEXION MONGODB ============
const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI is missing; database-backed routes are unavailable.");
    return false;
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("✅ MongoDB connecté");
    return true;
  } catch (error) {
    console.error("❌ Erreur MongoDB:", error.message);
    return false;
  }
};

const requireDatabase = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: "Base de données indisponible. Réessayez plus tard.",
    });
  }
  next();
};

const requireAdmin = async (req, res, next) => {
  const authorization = req.get("authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    return res.status(401).json({ success: false, message: "Authentification requise" });
  }
  if (!hasJwtSecret()) {
    return res.status(503).json({ success: false, message: "Authentification non configurée" });
  }

  try {
    const decoded = jwt.verify(tokenMatch[1], process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Base de données indisponible. Réessayez plus tard.",
      });
    }
    const user = await User.findById(decoded.id).select("username email role");
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Accès administrateur requis" });
    }
    req.adminUser = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      return res.status(401).json({ success: false, message: "Session invalide ou expirée" });
    }
    console.error("Erreur vérification administrateur:", error.message);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};

// ============ ROUTES ============
app.get("/", (req, res) => {
  res.json({ success: true, message: "SOIT API is running" });
});

app.get("/api", (req, res) => {
  res.json({ success: true, message: "SOIT API is running" });
});

app.get("/api/projects", requireDatabase, async (req, res) => {
  try {
    const projects = await Project.find({ isPublished: true })
      .select("title category location year description image galleryImages isCurrent progressPercent currentStage latestUpdate latestUpdateEn latestUpdateAr latestUpdateAt createdAt updatedAt")
      .sort({ createdAt: 1, _id: 1 })
      .limit(100)
      .lean();
    res.json({
      success: true,
      projects,
      currentProject: projects.find((project) => project.isCurrent) || null,
    });
  } catch (error) {
    console.error("Error loading public projects:", error.message);
    res.status(500).json({ success: false, message: "Unable to load projects" });
  }
});

app.get("/health", (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  const authConfigured = hasJwtSecret();
  const ready = databaseReady && authConfigured;
  res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? "ok" : "degraded",
    database: databaseReady ? "connected" : "disconnected",
    authentication: authConfigured ? "configured" : "misconfigured",
    email: hasEmailConfig() ? `${getEmailProvider()}_credentials_present` : "not_configured",
  });
});

app.get("/api/health", (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  const authConfigured = hasJwtSecret();
  const ready = databaseReady && authConfigured;
  res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? "ok" : "degraded",
    database: databaseReady ? "connected" : "disconnected",
    authentication: authConfigured ? "configured" : "misconfigured",
    email: hasEmailConfig() ? `${getEmailProvider()}_credentials_present` : "not_configured",
  });
});

// ============ CONTACT ============
app.post("/api/contact", requireDatabase, async (req, res) => {
  const { name, email, phone, message } = req.body;

  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 120 ||
    !isValidEmail(email) ||
    typeof message !== "string" ||
    !message.trim() ||
    message.trim().length > 5000 ||
    (phone != null && (typeof phone !== "string" || phone.length > 40))
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Veuillez vérifier les champs du formulaire" });
  }

  try {
    const newContact = new Contact({
      name: name.trim(),
      email: normalizeEmail(email),
      phone: typeof phone === "string" ? phone.trim() : "",
      message: message.trim(),
    });
    await newContact.save();

    const notificationEmail = normalizeEmail(
      process.env.CONTACT_NOTIFICATION_EMAIL ||
        process.env.BREVO_FROM_EMAIL ||
        "contactsoitinfo@gmail.com",
    );
    let emailSent = false;
    try {
      if (!hasEmailConfig()) {
        throw new Error("Email provider is not configured");
      }

      const safeName = name.trim().replace(/\s+/g, " ");
      const htmlContent = `
        <div style="font-family:Arial,sans-serif;color:#172b38;line-height:1.6;max-width:640px;margin:0 auto">
          <p style="color:#246df5;font-size:12px;font-weight:700;letter-spacing:2px">SOIT · NOUVEAU MESSAGE</p>
          <h2 style="margin:0 0 20px">Nouvelle demande de contact</h2>
          <p><strong>Nom :</strong> ${escapeHtml(safeName)}</p>
          <p><strong>Email :</strong> ${escapeHtml(normalizeEmail(email))}</p>
          <p><strong>Téléphone :</strong> ${escapeHtml(phone || "Non renseigné")}</p>
          <div style="margin-top:20px;padding:16px;border:1px solid #e3eaf0;border-radius:8px;background:#f7f9fb">
            <strong>Message</strong>
            <p style="white-space:pre-wrap;margin-bottom:0">${escapeHtml(message.trim())}</p>
          </div>
        </div>
      `;

      await sendTransactionalEmail(
        notificationEmail,
        `Nouvelle demande de contact SOIT — ${safeName}`,
        htmlContent,
        "Équipe SOIT",
      );
      emailSent = true;
      console.log(`✅ Contact notification sent to ${notificationEmail}`);
    } catch (emailError) {
      console.error("❌ Contact notification email failed:", emailError.message);
    }

    res.json({
      success: true,
      emailSent,
      message: emailSent
        ? "Message envoyé !"
        : "Votre message est enregistré. L’équipe SOIT n’a pas pu recevoir la notification par email.",
    });
  } catch (error) {
    console.error("Erreur contact:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.get("/api/contacts", requireAdmin, async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json({ success: true, contacts });
  } catch (error) {
    console.error("Erreur get contacts:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.delete("/api/contacts/:id", requireAdmin, async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Identifiant invalide" });
  }
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, message: "Message introuvable" });
    }
    res.json({ success: true, message: "Supprimé" });
  } catch (error) {
    console.error("Erreur delete contact:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ============ AUTHENTIFICATION ============
app.post("/api/register", registerLimiter, requireDatabase, async (req, res) => {
  const { username, email, password } = req.body;

  if (
    typeof username !== "string" ||
    !username.trim() ||
    username.trim().length > 40 ||
    !isValidEmail(email) ||
    typeof password !== "string" ||
    !password
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Tous les champs sont requis" });
  }
  if (password.length < 6 || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return res
      .status(400)
      .json({ success: false, message: "Le mot de passe doit contenir entre 6 et 72 octets" });
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    const normalizedUsername = username.trim();
    const existing = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
    });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Email ou username déjà utilisé" });
    }

    const newUser = new User({
      username: normalizedUsername,
      email: normalizedEmail,
      password,
    });
    await newUser.save();

    res.json({
      success: true,
      message: "Inscription réussie !",
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error("Erreur register:", error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "Email ou nom d'utilisateur déjà utilisé" });
    }
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.post("/api/login", loginLimiter, requireDatabase, async (req, res) => {
  const { email, password } = req.body;

  if (!isValidEmail(email) || typeof password !== "string" || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Email et mot de passe requis" });
  }

  try {
    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user || !(await user.comparePassword(password))) {
      return res
        .status(401)
        .json({ success: false, message: "Email ou mot de passe incorrect" });
    }

    if (!hasJwtSecret()) {
      console.error("JWT_SECRET must contain at least 32 bytes; login token cannot be issued.");
      return res.status(503).json({ success: false, message: "Authentification non configurée" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d", algorithm: "HS256" },
    );

    res.json({
      success: true,
      message: "Connexion réussie",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Erreur login:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ============ MOT DE PASSE OUBLIÉ (BREVO API REST) ============
app.post("/api/forgot-password", forgotLimiter, requireDatabase, async (req, res) => {
  const { email } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: "Email requis" });
  }

  try {
    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user) {
      return res.json({
        success: true,
        message: "Si l'email existe, un lien a été envoyé",
      });
    }

    if (!hasJwtSecret() || !hasEmailConfig()) {
      console.error("Password reset is unavailable: JWT_SECRET or the selected email provider is not configured.");
      return res.status(503).json({ success: false, message: "Réinitialisation temporairement indisponible" });
    }

    const resetToken = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h", algorithm: "HS256" },
    );
    const resetLink = `${FRONTEND_URL}/reset-password.html?token=${resetToken}`;

    const htmlContent = `
      <h2>Réinitialisation de votre mot de passe</h2>
      <p>Bonjour ${escapeHtml(user.username || "Cher client")},</p>
      <p>Cliquez sur le lien ci-dessous :</p>
      <a href="${resetLink}">${resetLink}</a>
      <p>Ce lien expire dans 1 heure.</p>
      <hr>
      <p>SOIT Infrastructure</p>
    `;

    await sendTransactionalEmail(
      user.email,
      "🔐 Réinitialisation de votre mot de passe - SOIT",
      htmlContent,
      user.username,
    );

    console.log(`✅ Password reset email sent via ${getEmailProvider()} to ${user.email}`);
    res.json({ success: true, message: "Email envoyé !" });
  } catch (error) {
    console.error(`❌ Email delivery error (${getEmailProvider()}):`, error.message);
    res.status(500).json({ success: false, message: "Erreur d'envoi" });
  }
});

// ============ RÉINITIALISATION DU MOT DE PASSE ============
app.post("/api/reset-password", resetLimiter, requireDatabase, async (req, res) => {
  const { token, newPassword } = req.body;

  if (
    typeof token !== "string" ||
    typeof newPassword !== "string" ||
    newPassword.length < 6 ||
    Buffer.byteLength(newPassword, "utf8") > MAX_PASSWORD_BYTES
  ) {
    return res.status(400).json({
      success: false,
      message: "Token et mot de passe (min 6) requis",
    });
  }

  try {
    if (!hasJwtSecret()) {
      return res.status(503).json({ success: false, message: "Authentification non configurée" });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    const user = await User.findById(decoded.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Utilisateur non trouvé" });
    }

    user.password = newPassword;
    await user.save();

    console.log(`✅ Mot de passe réinitialisé pour: ${user.email}`);
    res.json({ success: true, message: "Mot de passe réinitialisé !" });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(400).json({ success: false, message: "Lien expiré" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(400).json({ success: false, message: "Lien invalide" });
    }
    console.error("Erreur reset password:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ============ AVIS CLIENTS ============
app.post("/api/reviews", requireDatabase, async (req, res) => {
  const { name, email, rating, comment } = req.body;
  const numericRating = Number(rating);

  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 120 ||
    !isValidEmail(email) ||
    !Number.isInteger(numericRating) ||
    numericRating < 1 ||
    numericRating > 5 ||
    typeof comment !== "string" ||
    comment.trim().length < 10 ||
    comment.trim().length > 2000
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Champs invalides" });
  }

  try {
    const newReview = new Review({
      name: name.trim(),
      email: normalizeEmail(email),
      rating: numericRating,
      comment: comment.trim(),
      status: "approved",
    });
    await newReview.save();
    res.json({ success: true, message: "Merci pour votre avis !" });
  } catch (error) {
    console.error("Erreur review:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.get("/api/reviews", requireDatabase, async (req, res) => {
  try {
    const reviews = await Review.find({ status: "approved" })
      .sort({ createdAt: -1 })
      .limit(10);
    res.json({ success: true, reviews });
  } catch (error) {
    console.error("Erreur get reviews:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ============ ADMIN ============
app.get("/api/me", requireAdmin, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.adminUser._id,
      username: req.adminUser.username,
      email: req.adminUser.email,
      role: req.adminUser.role,
    },
  });
});

app.get("/api/stats", requireAdmin, async (req, res) => {
  try {
    const [totalMessages, totalUsers, totalReviews, ratingSummary] = await Promise.all([
      Contact.countDocuments(),
      User.countDocuments(),
      Review.countDocuments(),
      Review.aggregate([
        { $match: { status: "approved" } },
        { $group: { _id: null, averageRating: { $avg: "$rating" } } },
      ]),
    ]);
    res.json({
      success: true,
      stats: {
        totalMessages,
        totalUsers,
        totalReviews,
        averageRating: ratingSummary[0]?.averageRating || 0,
      },
    });
  } catch (error) {
    console.error("Erreur get stats:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.get("/api/admin/projects", requireAdmin, async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: 1, _id: 1 }).limit(200);
    res.json({ success: true, projects });
  } catch (error) {
    console.error("Erreur get admin projects:", error.message);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.post("/api/admin/projects", requireAdmin, async (req, res) => {
  const projectData = normalizeProjectInput(req.body);
  if (!projectData) {
    return res.status(400).json({ success: false, message: "Vérifiez les champs et les chemins des photos." });
  }
  try {
    if (projectData.isCurrent) {
      await Project.updateMany({ isCurrent: true }, { $set: { isCurrent: false } });
    }
    const project = await Project.create(projectData);
    res.status(201).json({ success: true, project });
  } catch (error) {
    console.error("Erreur create project:", error.message);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.put("/api/admin/projects/:id", requireAdmin, async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Identifiant invalide" });
  }
  const projectData = normalizeProjectInput(req.body);
  if (!projectData) {
    return res.status(400).json({ success: false, message: "Vérifiez les champs et les chemins des photos." });
  }
  try {
    if (projectData.isCurrent) {
      await Project.updateMany(
        { isCurrent: true, _id: { $ne: req.params.id } },
        { $set: { isCurrent: false } },
      );
    }
    const project = await Project.findByIdAndUpdate(req.params.id, projectData, {
      new: true,
      runValidators: true,
    });
    if (!project) return res.status(404).json({ success: false, message: "Projet introuvable" });
    res.json({ success: true, project });
  } catch (error) {
    console.error("Erreur update project:", error.message);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.delete("/api/admin/projects/:id", requireAdmin, async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Identifiant invalide" });
  }
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "Projet introuvable" });
    res.json({ success: true, message: "Projet supprimé" });
  } catch (error) {
    console.error("Erreur delete project:", error.message);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.get("/api/admin/reviews", requireAdmin, async (req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 }).limit(200);
    res.json({ success: true, reviews });
  } catch (error) {
    console.error("Erreur get admin reviews:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.delete("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Identifiant invalide" });
  }
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: "Avis introuvable" });
    }
    res.json({ success: true, message: "Avis supprimé" });
  } catch (error) {
    console.error("Erreur delete review:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.get("/api/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select("username email role createdAt").sort({ createdAt: -1 }).limit(500);
    res.json({ success: true, users });
  } catch (error) {
    console.error("Erreur get users:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ============ DÉMARRAGE ============
async function startServer(port = PORT) {
  await connectDB();
  return app.listen(port, () => {
    console.log(`
    ╔══════════════════════════════════════════════════╗
    ║         SOIT Backend Server                     ║
    ╠══════════════════════════════════════════════════╣
    ║   Status:     ✅ Running                        ║
    ║   Port:       ${PORT}                              ║
    ║   Email:      ${getEmailProvider()}                         ║
    ║   Database:   ${mongoose.connection.readyState === 1 ? "Connected" : "Not connected"}                      ║
    ╚══════════════════════════════════════════════════╝
  `);
  });
}

async function sendTransactionalEmail(to, subject, htmlContent, userName = "Client") {
  const provider = getEmailProvider();
  if (provider !== "gmail" && provider !== "smtp") {
    return sendBrevoEmail(to, subject, htmlContent, userName);
  }

  if (!hasEmailConfig()) {
    throw new Error(`The ${provider} email provider is missing required credentials.`);
  }

  const isGmail = provider === "gmail";
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const transporter = isGmail
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      })
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        requireTLS: !secure,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });
  const fromEmail = isGmail ? process.env.GMAIL_USER : process.env.SMTP_FROM_EMAIL;
  const fromName = isGmail ? "SOIT Infrastructure" : process.env.SMTP_FROM_NAME || "SOIT Infrastructure";

  await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to: `${userName} <${to}>`,
    subject,
    html: htmlContent,
  });
  console.log(`✅ Email sent via ${provider} SMTP`);
  return true;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, connectDB, requireAdmin, startServer };
