const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
require("dotenv").config();

// Import Models
const Contact = require("./models/Contact");
const User = require("./models/User");
const Review = require("./models/Review");

const app = express();
const PORT = process.env.PORT || 3000;

// ============ EMAIL TRANSPORTER ============
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
const compression = require("compression");
app.use(compression());

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Handle connection events
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

// Contact form submission
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

// Get all contacts
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

// Get single contact by ID
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

// Delete contact
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

// User registration
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

// User login
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

    console.log(`🔐 User logged in: ${user.username} (${user.email})`);

    res.json({
      success: true,
      message: "Connexion réussie !",
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

// Get statistics
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

// ============ FORGOT PASSWORD & RESET PASSWORD ============

// Forgot password - sends email with reset link
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email est requis",
    });
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });

    // For security, always return success even if email doesn't exist
    if (!user) {
      return res.json({
        success: true,
        message:
          "Si un compte existe avec cet email, vous recevrez un lien de réinitialisation",
      });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    const resetLink = `https://hamabenhalima.github.io/SOIT-Infrastructure-Website/reset-password.html?token=${resetToken}`;

    // Email HTML template
    const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; }
                    .header { background: #2370f5; color: white; padding: 15px; text-align: center; border-radius: 5px; }
                    .btn { display: inline-block; background: #2370f5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                    .footer { font-size: 12px; color: #999; text-align: center; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>🔐 Réinitialisation de votre mot de passe</h2>
                    </div>
                    <p>Bonjour ${user.username},</p>
                    <p>Vous avez demandé à réinitialiser votre mot de passe pour votre compte SOIT.</p>
                    <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
                    <div style="text-align: center;">
                        <a href="${resetLink}" class="btn">Réinitialiser mon mot de passe</a>
                    </div>
                    <p>Ce lien expirera dans 1 heure pour des raisons de sécurité.</p>
                    <p>Si vous n'avez pas demandé cette réinitialisation, ignorez simplement cet email.</p>
                    <div class="footer">
                        <p>SOIT - Société El Oukhoua d'Infrastructure et de Travaux</p>
                    </div>
                </div>
            </body>
            </html>
        `;

    // Send email
    await transporter.sendMail({
      from: `"SOIT" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "🔐 Réinitialisation de votre mot de passe - SOIT",
      html: emailHtml,
    });

    console.log(`✅ Password reset email sent to: ${user.email}`);

    res.json({
      success: true,
      message: "Un lien de réinitialisation a été envoyé à votre adresse email",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

// Reset password with token
app.post("/api/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Token et nouveau mot de passe requis",
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Le mot de passe doit contenir au moins 6 caractères",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé",
      });
    }

    // Update password (will be hashed by the pre-save hook)
    user.password = newPassword;
    await user.save();

    console.log(`✅ Password reset for user: ${user.email}`);

    res.json({
      success: true,
      message: "Mot de passe réinitialisé avec succès !",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(400).json({
      success: false,
      message: "Lien invalide ou expiré",
    });
  }
});

// ============ REVIEW ROUTES ============

// Submit a new review (client)
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

// Get approved reviews (for website display)
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

// Get all users (for admin dashboard)
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// Delete review (admin)
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
      console.log("⏳ Waiting for database connection to create admin...");
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
