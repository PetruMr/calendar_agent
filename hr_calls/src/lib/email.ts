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

/**
 * Questa funzione invia un'email utilizzando Nodemailer.
 * Verrà fatto utilizzando l'account Gmail configurato nelle variabili d'ambiente.
 * 
 * @param to email del destinatario
 * @param subject oggetto dell'email
 * @param bodyHTML corpo dell'email in HTML
 * @param bodyText corpo dell'email in testo semplice
 */
export async function sendEmail(to: string, subject: string, bodyHTML?: string, bodyText?: string) {
  const mailOptions = {
    from: `"StreetReports" <${process.env.MAIL_USER}>`,
    to,
    subject,
    html: bodyHTML || "",
    text: bodyText || ""
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Failed to send email:", error);
    throw error;
  }
}
