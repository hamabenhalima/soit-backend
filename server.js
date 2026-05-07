require("dotenv").config();
console.log(
  "🔑 BREVO_API_KEY:",
  process.env.BREVO_API_KEY ? "✅ Configuré" : "❌ Manquant",
);

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const https = require("https");

// Import des modèles
const Contact = require("./models/Contact");
const User = require("./models/User");
const Review = require("./models/Review");

const app = express();
const PORT = process.env.PORT || 3000;

// ============ FONCTION POUR ENVOYER DES EMAILS VIA BREVO (API REST) ============
async function sendBrevoEmail(to, subject, htmlContent, userName = "Client") {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      sender: {
        email: process.env.BREVO_FROM_EMAIL || "noreply@brevo.com",
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

    req.write(data);
    req.end();
  });
}

// ============ RATE LIMITING ============
const forgotLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: "Trop de tentatives. Réessayez dans 15 minutes.",
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Trop de tentatives de connexion." },
});

// ============ MIDDLEWARE ============
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============ CONNEXION MONGODB ============
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connecté");
  } catch (error) {
    console.error("❌ Erreur MongoDB:", error.message);
    setTimeout(connectDB, 5000);
  }
};
connectDB();

// ============ ROUTES ============
app.get("/", (req, res) => {
  res.json({ success: true, message: "SOIT Backend avec Brevo (API REST)" });
});

app.get("/api", (req, res) => {
  res.json({ success: true, message: "SOIT API - Brevo" });
});

// ============ CONTACT ============
app.post("/api/contact", async (req, res) => {
  const { name, email, phone, message } = req.body;

  if (!name || !email || !message) {
    return res
      .status(400)
      .json({ success: false, message: "Tous les champs sont requis" });
  }

  try {
    const newContact = new Contact({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone || "",
      message: message.trim(),
    });
    await newContact.save();
    res.json({ success: true, message: "Message envoyé !" });
  } catch (error) {
    console.error("Erreur contact:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.get("/api/contacts", async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json({ success: true, contacts });
  } catch (error) {
    console.error("Erreur get contacts:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.delete("/api/contacts/:id", async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Supprimé" });
  } catch (error) {
    console.error("Erreur delete contact:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ============ AUTHENTIFICATION ============
app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Tous les champs sont requis" });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ success: false, message: "Mot de passe trop court (min 6)" });
  }

  try {
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Email ou username déjà utilisé" });
    }

    const newUser = new User({
      username,
      email: email.toLowerCase(),
      password,
    });
    await newUser.save();

    res.json({
      success: true,
      message: "Inscription réussie !",
      user: { id: newUser._id, username, email, role: newUser.role },
    });
  } catch (error) {
    console.error("Erreur register:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.post("/api/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Email et mot de passe requis" });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.comparePassword(password))) {
      return res
        .status(401)
        .json({ success: false, message: "Email ou mot de passe incorrect" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
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
app.post("/api/forgot-password", forgotLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: "Email requis" });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({
        success: true,
        message: "Si l'email existe, un lien a été envoyé",
      });
    }

    const resetToken = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    const resetLink = `https://hamabenhalima.github.io/SOIT-Infrastructure-Website/reset-password.html?token=${resetToken}`;

    const htmlContent = `
      <h2>Réinitialisation de votre mot de passe</h2>
      <p>Bonjour ${user.username || "Cher client"},</p>
      <p>Cliquez sur le lien ci-dessous :</p>
      <a href="${resetLink}">${resetLink}</a>
      <p>Ce lien expire dans 1 heure.</p>
      <hr>
      <p>SOIT Infrastructure</p>
    `;

    await sendBrevoEmail(
      user.email,
      "🔐 Réinitialisation de votre mot de passe - SOIT",
      htmlContent,
      user.username,
    );

    console.log(`✅ Email envoyé via Brevo (API REST) à: ${user.email}`);
    res.json({ success: true, message: "Email envoyé !" });
  } catch (error) {
    console.error("❌ Erreur Brevo:", error.message);
    res.status(500).json({ success: false, message: "Erreur d'envoi" });
  }
});

// ============ RÉINITIALISATION DU MOT DE PASSE ============
app.post("/api/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Token et mot de passe (min 6) requis",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
app.post("/api/reviews", async (req, res) => {
  const { name, email, rating, comment } = req.body;

  if (
    !name ||
    !email ||
    !rating ||
    !comment ||
    comment.length < 10 ||
    rating < 1 ||
    rating > 5
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Champs invalides" });
  }

  try {
    const newReview = new Review({
      name,
      email: email.toLowerCase(),
      rating: parseInt(rating),
      comment,
      status: "approved",
    });
    await newReview.save();
    res.json({ success: true, message: "Merci pour votre avis !" });
  } catch (error) {
    console.error("Erreur review:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.get("/api/reviews", async (req, res) => {
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
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json({ success: true, users });
  } catch (error) {
    console.error("Erreur get users:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ============ DÉMARRAGE ============
app.listen(PORT, () => {
  console.log(`
    ╔══════════════════════════════════════════════════╗
    ║         SOIT Backend Server                     ║
    ╠══════════════════════════════════════════════════╣
    ║   Status:     ✅ Running                        ║
    ║   Port:       ${PORT}                              ║
    ║   Email:      Brevo (API REST)                  ║
    ║   Database:   MongoDB                           ║
    ╚══════════════════════════════════════════════════╝
  `);
});
