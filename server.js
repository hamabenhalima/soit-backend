const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const app = express();

app.use(cors());
app.use(express.json());

// ============ FILE STORAGE SETUP ============
const DATA_DIR = path.join(__dirname, "data");
const CONTACTS_FILE = path.join(DATA_DIR, "contacts.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize contacts file if it doesn't exist
if (!fs.existsSync(CONTACTS_FILE)) {
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify([]));
}

// Initialize users file with default admin
if (!fs.existsSync(USERS_FILE)) {
  const defaultUsers = [
    {
      id: 1,
      username: "admin",
      email: "admin@soit.com",
      password: "admin123",
      role: "admin",
      createdAt: new Date().toISOString(),
    },
  ];
  fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
}

// Helper functions
function readJSON(filePath) {
  const data = fs.readFileSync(filePath, "utf8");
  return JSON.parse(data);
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ============ WELCOME ROUTES ============

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SOIT Backend is running!",
    status: "active",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to SOIT API",
    version: "1.0.0",
    storage: "JSON files",
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

// ============ CONTACT ROUTES ============

app.post("/api/contact", (req, res) => {
  const { name, email, phone, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      message: "Nom, email et message sont requis",
    });
  }

  try {
    const contacts = readJSON(CONTACTS_FILE);
    const newContact = {
      id: contacts.length + 1,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone || "",
      message: message.trim(),
      read: false,
      createdAt: new Date().toISOString(),
    };
    contacts.push(newContact);
    writeJSON(CONTACTS_FILE, contacts);

    console.log(`📧 New message from ${name} (${email})`);

    res.json({
      success: true,
      message: "Message envoyé avec succès !",
    });
  } catch (error) {
    console.error("Contact error:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'envoi du message",
    });
  }
});

app.get("/api/contacts", (req, res) => {
  try {
    const contacts = readJSON(CONTACTS_FILE);
    res.json({
      success: true,
      contacts: contacts.reverse(),
    });
  } catch (error) {
    console.error("Get contacts error:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des messages",
    });
  }
});

app.delete("/api/contacts/:id", (req, res) => {
  try {
    let contacts = readJSON(CONTACTS_FILE);
    const id = parseInt(req.params.id);
    const filteredContacts = contacts.filter((c) => c.id !== id);

    if (contacts.length === filteredContacts.length) {
      return res.status(404).json({
        success: false,
        message: "Message non trouvé",
      });
    }

    writeJSON(CONTACTS_FILE, filteredContacts);
    res.json({
      success: true,
      message: "Message supprimé avec succès",
    });
  } catch (error) {
    console.error("Delete contact error:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la suppression",
    });
  }
});

// ============ USER ROUTES ============

app.post("/api/register", (req, res) => {
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
    const users = readJSON(USERS_FILE);

    if (users.find((u) => u.email === email.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Cet email est déjà utilisé",
      });
    }

    if (users.find((u) => u.username === username)) {
      return res.status(400).json({
        success: false,
        message: "Ce nom d'utilisateur est déjà pris",
      });
    }

    const newUser = {
      id: users.length + 1,
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: password,
      role: "user",
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    writeJSON(USERS_FILE, users);

    console.log(`📝 New user registered: ${username} (${email})`);

    res.json({
      success: true,
      message: "Inscription réussie !",
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'inscription",
    });
  }
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email et mot de passe requis",
    });
  }

  try {
    const users = readJSON(USERS_FILE);
    const user = users.find(
      (u) => u.email === email.toLowerCase() && u.password === password,
    );

    if (!user) {
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
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la connexion",
    });
  }
});

// ============ STATISTICS ROUTE ============

app.get("/api/stats", (req, res) => {
  try {
    const contacts = readJSON(CONTACTS_FILE);
    const users = readJSON(USERS_FILE);

    res.json({
      success: true,
      stats: {
        totalMessages: contacts.length,
        unreadMessages: contacts.filter((c) => !c.read).length,
        totalUsers: users.length,
        lastMessage: contacts[contacts.length - 1] || null,
      },
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des statistiques",
    });
  }
});

// ============ FORGOT PASSWORD ROUTE ============

app.post("/api/forgot-password", (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email est requis",
    });
  }

  try {
    const users = readJSON(USERS_FILE);
    const user = users.find((u) => u.email === email.toLowerCase());

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

// ============ HEALTH CHECK ROUTE ============

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ============ 404 HANDLER ============

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    requestedUrl: req.url,
  });
});

// ============ ERROR HANDLER ============

app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    success: false,
    message: "Erreur interne du serveur",
  });
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
    ╔══════════════════════════════════════════════════════════════╗
    ║                    SOIT Backend Server                       ║
    ╠══════════════════════════════════════════════════════════════╣
    ║   Status:     ✅ Running                                    ║
    ║   Port:       ${PORT}                                            ║
    ║   URL:        https://soit-backend.onrender.com              ║
    ║   API:        https://soit-backend.onrender.com/api          ║
    ║   Storage:    JSON files (no database needed)               ║
    ╚══════════════════════════════════════════════════════════════╝
    `);
});
