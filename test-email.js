require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function test() {
  try {
    await transporter.sendMail({
      from: `"SOIT Test" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: "Test Email",
      html: "<h1>Test successful!</h1>",
    });
    console.log("✅ Email sent successfully!");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

test();
