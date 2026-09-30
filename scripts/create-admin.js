require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");

const normalizeEmail = (value) => value.trim().toLowerCase();

async function createOrPromoteAdmin() {
  const { MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!MONGODB_URI || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Set MONGODB_URI, ADMIN_EMAIL, and ADMIN_PASSWORD before running this script.");
  }
  if (ADMIN_PASSWORD.length < 12 || Buffer.byteLength(ADMIN_PASSWORD, "utf8") > 72) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters and no more than 72 UTF-8 bytes.");
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const email = normalizeEmail(ADMIN_EMAIL);
  let user = await User.findOne({ email });

  if (!user) {
    const username = (process.env.ADMIN_USERNAME || email.split("@")[0]).trim();
    user = new User({ username, email, password: ADMIN_PASSWORD, role: "admin" });
    await user.save();
    console.log(`Created the SOIT admin account for ${email}.`);
    return;
  }

  if (user.role === "admin") {
    console.log(`An admin account already exists for ${email}; no changes made.`);
    return;
  }

  if (!(await user.comparePassword(ADMIN_PASSWORD))) {
    throw new Error("That email already belongs to a non-admin account. ADMIN_PASSWORD must match its current password to promote it.");
  }

  user.role = "admin";
  await user.save();
  console.log(`Promoted the existing account for ${email} to admin.`);
}

createOrPromoteAdmin()
  .catch((error) => {
    console.error("Admin setup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
