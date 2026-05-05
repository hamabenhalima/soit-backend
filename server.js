const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const compression = require("compression");

const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

require("dotenv").config();

// Import Models
const Contact = require("./models/Contact");
const User = require("./models/User");
const Review = require("./models/Review");

const app = express();
const PORT = process.env.PORT || 3000;

// ============ MIDDLEWARE ============
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============ CONFIGURATION NODEMAILER CORRIGÉE ============
// Configuration pour Gmail avec les bons paramètres
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // false pour port 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000,
});

// Vérifier la connexion email au démarrage
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Erreur de connexion email:", error.message);
    console.log("⚠️ Vérifiez vos variables EMAIL_USER et EMAIL_PASS");
  } else {
    console.log("✅ Serveur email prêt à envoyer des messages");
  }
});

// ============ MONGODB CONNECTION ============
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      heartbeatFrequencyMS: 10000,
    });
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    console.log("⚠️ Retrying connection in 5 seconds...");
    setTimeout(connectDB, 5000);
  }
};

connectDB();

mongoose.connection.on("disconnected", () => {
  console.log("⚠️ MongoDB disconnected, attempting to reconnect...");
  setTimeout(connectDB, 5000);
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB error:", err.message);
});

// ============ WELCOME ROUTES ============
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SOIT Backend is running with MongoDB!",
    status: "active",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to SOIT API",
    version: "2.0.0",
    database: "MongoDB Atlas",
    endpoints: {
      root: "GET /",
      api: "GET /api",
      contact: "POST /api/contact",
      login: "POST /api/login",
      register: "POST /api/register",
      contacts: "GET /api/contacts",
      stats: "GET /api/stats",
      deleteContact: "DELETE /api/contacts/:id",
      forgotPassword: "POST /api/forgot-password",
      resetPassword: "POST /api/reset-password",
      reviews: "GET /api/reviews",
      users: "GET /api/users",
    },
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    dbConnected: mongoose.connection.readyState === 1,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ============ CONTACT ROUTES ============
app.post("/api/contact", async (req, res) => {
  const { name, email, phone, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      message: "Nom, email et message sont requis",
    });
  }

  try {
    const newContact = new Contact({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone || "",
      message: message.trim(),
    });
    await newContact.save();

    console.log(`📧 New message from ${name} (${email})`);

    res.json({
      success: true,
      message: "Message envoyé avec succès !",
    });
  } catch (error) {
    console.error("Contact error:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

app.get("/api/contacts", async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json({ success: true, contacts });
  } catch (error) {
    console.error("Get contacts error:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

app.get("/api/contacts/:id", async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Message non trouvé",
      });
    }
    res.json({ success: true, contact });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

app.delete("/api/contacts/:id", async (req, res) => {
  try {
    const deleted = await Contact.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Message non trouvé",
      });
    }
    res.json({
      success: true,
      message: "Message supprimé avec succès",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

// ============ USER ROUTES ============
app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Tous les champs sont requis",
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Le mot de passe doit contenir au moins 6 caractères",
    });
  }

  try {
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email ou nom d'utilisateur déjà utilisé",
      });
    }

    const newUser = new User({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password,
    });
    await newUser.save();

    console.log(`📝 New user registered: ${username} (${email})`);

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
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email et mot de passe requis",
    });
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Email ou mot de passe incorrect",
      });
    }

    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Email ou mot de passe incorrect",
      });
    }

    // Générer un token JWT
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    console.log(`🔐 User logged in: ${user.username} (${user.email})`);

    res.json({
      success: true,
      message: "Connexion réussie !",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const totalMessages = await Contact.countDocuments();
    const unreadMessages = await Contact.countDocuments({ read: false });
    const totalUsers = await User.countDocuments();

    res.json({
      success: true,
      stats: {
        totalMessages,
        unreadMessages,
        totalUsers,
      },
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

// ============ FORGOT PASSWORD AVEC RESEND ============
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;

  console.log("📧 Demande de réinitialisation pour:", email);

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email est requis",
    });
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });

    // Sécurité : on répond toujours "success" même si l'email n'existe pas
    if (!user) {
      console.log(`❌ Utilisateur non trouvé: ${email}`);
      return res.json({
        success: true,
        message:
          "Si un compte existe avec cet email, vous recevrez un lien de réinitialisation",
      });
    }

    console.log(`✅ Utilisateur trouvé: ${user.email}`);

    // Générer le token JWT
    const resetToken = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    const resetLink = `https://hamabenhalima.github.io/SOIT-Infrastructure-Website/reset-password.html?token=${resetToken}`;

    console.log("🔗 LIEN GÉNÉRÉ:", resetLink);

    // ============ ENVOI AVEC RESEND ============
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL, // Ex: "SOIT <noreply@soit.com>"
      to: user.email,
      subject: "🔐 Réinitialisation de votre mot de passe - SOIT",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #2370f5, #1a5cd8); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">🔐 SOIT Infrastructure</h1>
          </div>
          
          <div style="padding: 30px 20px; background: #f9f9f9;">
            <h2 style="color: #2370f5;">Bonjour ${user.username || user.firstName || "Cher client"} !</h2>
            
            <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
            
            <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" 
                 style="background: linear-gradient(135deg, #2370f5, #1a5cd8); 
                        color: white; 
                        padding: 12px 30px; 
                        text-decoration: none; 
                        border-radius: 50px; 
                        font-weight: bold;
                        display: inline-block;">
                🔑 Réinitialiser mon mot de passe
              </a>
            </div>
            
            <p style="font-size: 14px; color: #666;">Ce lien expirera dans <strong>1 heure</strong>.</p>
            
            <p style="font-size: 12px; color: #999;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
          </div>
          
          <div style="background: #2370f5; padding: 15px; text-align: center; font-size: 12px; color: white;">
            <p style="margin: 0;">© 2024 SOIT - Société El Oukhoua d'Infrastructure et Travaux</p>
            <p style="margin: 5px 0 0;">📞 +216 12 45 77 85 | ✉️ groupesoit@gmail.com</p>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error("❌ Erreur Resend:", error);
      throw new Error(error.message);
    }

    console.log(`✅ Email envoyé avec Resend à: ${user.email}`);
    console.log("📨 Message ID:", data?.id);

    res.json({
      success: true,
      message: "Un lien de réinitialisation a été envoyé à votre adresse email",
    });
  } catch (error) {
    console.error("❌ Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'envoi. Veuillez réessayer.",
    });
  }
});

// ============ RESET PASSWORD ============
app.post("/api/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  console.log("📥 Reset password request received");
  console.log(
    "Token reçu:",
    token ? token.substring(0, 30) + "..." : "Non fourni",
  );

  if (!token) {
    return res.status(400).json({
      success: false,
      message: "Token requis. Veuillez refaire une demande.",
    });
  }

  if (!newPassword) {
    return res.status(400).json({
      success: false,
      message: "Nouveau mot de passe requis",
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Le mot de passe doit contenir au moins 6 caractères",
    });
  }

  try {
    // Vérifier le token JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token valide, ID utilisateur:", decoded.id);

    // Trouver l'utilisateur
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé",
      });
    }

    console.log("✅ Utilisateur trouvé:", user.email);

    // Mettre à jour le mot de passe
    user.password = newPassword;
    await user.save();

    console.log(`✅ Mot de passe réinitialisé pour: ${user.email}`);

    res.json({
      success: true,
      message:
        "Mot de passe réinitialisé avec succès ! Vous pouvez maintenant vous connecter.",
    });
  } catch (error) {
    console.error("❌ Reset password error:", error.message);

    if (error.name === "JsonWebTokenError") {
      return res.status(400).json({
        success: false,
        message: "Lien invalide. Veuillez refaire une demande.",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(400).json({
        success: false,
        message: "Lien expiré. Veuillez refaire une demande.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Erreur serveur. Veuillez réessayer.",
    });
  }
});

// ============ REVIEW ROUTES ============
app.post("/api/reviews", async (req, res) => {
  const { name, email, rating, comment } = req.body;

  if (!name || !email || !rating || !comment) {
    return res.status(400).json({
      success: false,
      message: "Tous les champs sont requis",
    });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({
      success: false,
      message: "La note doit être entre 1 et 5",
    });
  }

  if (comment.length < 10) {
    return res.status(400).json({
      success: false,
      message: "Le commentaire doit contenir au moins 10 caractères",
    });
  }

  try {
    const newReview = new Review({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      rating: parseInt(rating),
      comment: comment.trim(),
      status: "approved",
    });
    await newReview.save();

    console.log(`⭐ New review from ${name} (${rating} stars)`);

    res.json({
      success: true,
      message: "Merci pour votre avis !",
    });
  } catch (error) {
    console.error("Review error:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

app.get("/api/reviews", async (req, res) => {
  try {
    const reviews = await Review.find({ status: "approved" })
      .sort({ createdAt: -1 })
      .limit(10);
    res.json({ success: true, reviews });
  } catch (error) {
    console.error("Get reviews error:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

// ============ ADMIN ROUTES ============
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.delete("/api/admin/reviews/:id", async (req, res) => {
  try {
    const deleted = await Review.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Avis non trouvé" });
    }
    res.json({ success: true, message: "Avis supprimé" });
  } catch (error) {
    console.error("Delete review error:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ============ CREATE DEFAULT ADMIN USER ============
async function createDefaultAdmin() {
  try {
    if (mongoose.connection.readyState !== 1) {
      setTimeout(createDefaultAdmin, 2000);
      return;
    }

    const adminExists = await User.findOne({ email: "admin@soit.com" });

    if (!adminExists) {
      const admin = new User({
        username: "admin",
        email: "admin@soit.com",
        password: "admin123",
        role: "admin",
      });

      await admin.save();
      console.log("\n✅ DEFAULT ADMIN USER CREATED!");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("   Email:    admin@soit.com");
      console.log("   Password: admin123");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    } else {
      console.log("✅ Admin user already exists");
    }
  } catch (error) {
    console.error("❌ Error creating admin:", error.message);
  }
}

// ============ START SERVER ============
app.listen(PORT, async () => {
  console.log(`
    ╔══════════════════════════════════════════════════════════════╗
    ║                    SOIT Backend Server                       ║
    ╠══════════════════════════════════════════════════════════════╣
    ║   Status:     ✅ Running                                    ║
    ║   Port:       ${PORT}                                            ║
    ║   Database:   MongoDB Atlas                                 ║
    ║   API:        http://localhost:${PORT}/api                      ║
    ╚══════════════════════════════════════════════════════════════╝
    `);

  setTimeout(createDefaultAdmin, 3000);
});

// ============ GRACEFUL SHUTDOWN ============
process.on("SIGINT", async () => {
  console.log("\n⚠️ Shutting down server...");
  await mongoose.connection.close();
  console.log("✅ MongoDB connection closed");
  process.exit(0);
});
