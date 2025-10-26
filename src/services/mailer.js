import nodemailer from "nodemailer";

const sendEmail = async ({ to, subject, html }) => {
  // Create reusable transporter object
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  // Send mail with defined transport object
  await transporter.sendMail({
    from: `"Fun4Pet" <${process.env.GMAIL_USER}>`, // Your app name here
    to,
    subject,
    html,
  });
};

export default sendEmail;
