// /lib/mailer.ts
// File che gestisce l'invio di email utilizzando Nodemailer

import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail", // Gmail automatically handles host/port
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASSWORD,
  },
});

export async function sendEmail(to: string, subject: string, body: string) {
  const mailOptions = {
    from: `"StreetReports" <${process.env.MAIL_USER}>`,
    to,
    subject,
    text: body,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Failed to send email:", error);
    throw error;
  }
}
