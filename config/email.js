const nodemailer = require("nodemailer");

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Send email function
async function sendEmail(to, subject, htmlContent) {
  try {
    const info = await transporter.sendMail({
      from: `"SOIT" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      html: htmlContent,
    });
    console.log("✅ Email sent:", info.messageId);
    return true;
  } catch (error) {
    console.error("❌ Email error:", error);
    return false;
  }
}

// Email template for password reset
function getPasswordResetEmail(email, resetToken) {
  const resetLink = `https://hamabenhalima.github.io/SOIT-Infrastructure-Website/reset-password.html?token=${resetToken}`;

  return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; }
                .header { background: #2370f5; color: white; padding: 15px; text-align: center; border-radius: 5px; }
                .content { padding: 20px; }
                .btn { display: inline-block; background: #2370f5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .footer { font-size: 12px; color: #999; text-align: center; margin-top: 20px; }
                .warning { color: #ff4444; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>🔐 Réinitialisation de votre mot de passe</h2>
                </div>
                <div class="content">
                    <p>Bonjour,</p>
                    <p>Vous avez demandé à réinitialiser votre mot de passe pour votre compte SOIT.</p>
                    
                    <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
                    
                    <div style="text-align: center;">
                        <a href="${resetLink}" class="btn">Réinitialiser mon mot de passe</a>
                    </div>
                    
                    <p>Ou copiez ce lien dans votre navigateur :</p>
                    <p style="background: #f5f5f5; padding: 10px; word-break: break-all;">${resetLink}</p>
                    
                    <p class="warning">⚠️ Ce lien expirera dans 1 heure pour des raisons de sécurité.</p>
                    
                    <p>Si vous n'avez pas demandé cette réinitialisation, ignorez simplement cet email.</p>
                </div>
                <div class="footer">
                    <p>SOIT - Société El Oukhoua d'Infrastructure et de Travaux</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

module.exports = { sendEmail, getPasswordResetEmail };
