import nodemailer from "nodemailer";

const sendEmail = async (email, subject, text) => {
  try {
    let transporter;

    // Check if OAuth2 credentials are available
    if (process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET && process.env.OAUTH_REFRESH_TOKEN) {
      // OAuth2 configuration (more secure)
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: process.env.USER,
          clientId: process.env.OAUTH_CLIENT_ID,
          clientSecret: process.env.OAUTH_CLIENT_SECRET,
          refreshToken: process.env.OAUTH_REFRESH_TOKEN,
        },
      });
    } else {
      // App Password configuration (fallback)
      transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: "devwithhussnainahmad@gmail.com",
          pass:"clzhhkgxiatrbhzy", // This should be your App Password
        },
      });
    }

    // Verify the connection
    console.log("Verifying SMTP connection...");
    await transporter.verify();
    console.log("✅ SMTP connection verified successfully");

    const mailOptions = {
      from: `"Talkora - Private Chat" <${process.env.USER}>`,
      to: email,
      subject: subject,
      text: text,
      html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #4CAF50;">Talkora- Private Chat App</h2>
        ${text.replace(/\n/g, '<br>')}
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #666;">
          This is an automated email. Please do not reply to this message.
        </p>
      </div>`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully to:", email);
    console.log("Message ID:", info.messageId);
    
    return { success: true, message: "Email sent successfully", messageId: info.messageId };
  } catch (error) {
    console.error("❌ Error sending email:", error);
    
    // Provide more specific error messages
    if (error.code === 'EAUTH') {
      throw new Error("Authentication failed. Please check your email credentials or use an App Password.");
    } else if (error.code === 'ECONNECTION') {
      throw new Error("Failed to connect to email server. Please check your internet connection.");
    } else if (error.code === 'EMESSAGE') {
      throw new Error("Invalid email message format.");
    }
    
    throw new Error("Failed to send email: " + error.message);
  }
};

export default sendEmail;