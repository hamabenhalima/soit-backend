const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// Import Models
const Contact = require("./models/Contact");
const User = require("./models/User");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Replace your mongoose.connect line with this:
mongoose
  .connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
  })
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB connection error:", err.message));
// ============ API ROUTES ============

// Welcome route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SOIT Backend is running with MongoDB!",
    status: "active",
    timestamp: new Date().toISOString(),
  });
});

// API info route
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
    },
  });
});

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
      name,
      email,
      phone: phone || "",
      message,
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

    const newUser = new User({ username, email, password });
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
    const user = await User.findOne({ email });
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

// Forgot password
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email est requis",
    });
  }

  try {
    const user = await User.findOne({ email });

    // For security, always return success even if email doesn't exist
    if (!user) {
      return res.json({
        success: true,
        message:
          "Si un compte existe avec cet email, vous recevrez un lien de réinitialisation",
      });
    }

    console.log(`📧 Password reset requested for: ${email}`);

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

// ============ CREATE DEFAULT ADMIN USER ============
async function createDefaultAdmin() {
  try {
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

  await createDefaultAdmin();
});
