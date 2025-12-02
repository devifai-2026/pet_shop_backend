import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const generateEmailHtml = async (templateParams) => {
  try {
    // Load template file with explicit UTF-8 encoding
    const templatePath = path.join(
      __dirname,
      "email",
      "templates",
      "fun4pets_template.html"
    );
    let template = await fs.promises.readFile(templatePath, "utf8");

    // Clean template by removing any hidden characters
    template = template.replace(/[\u200B-\u200D\uFEFF]/g, "");

    const frontendUrl = process.env.FRONTEND_URL;

    // Define replacements with proper escaping
    const replacements = {
      "[CUSTOMER_NAME]": templateParams.customerName || "",
      "[EMAIL_CONTENT]": templateParams.emailContent || "",
      "[FACEBOOK_LINK]": templateParams.facebookLink || "#",
      "[INSTAGRAM_LINK]": templateParams.instagramLink || "#",
      "[TWITTER_LINK]": templateParams.twitterLink || "#",
      "[YOUTUBE_LINK]": templateParams.youtubeLink || "#",
      "[COMPANY_EMAIL]":
        templateParams.companyEmail || "support@fun4pets.co.in",
      "[COMPANY_PHONE]": templateParams.companyPhone || "+91 8655173958",
      "[COMPANY_ADDRESS]":
        templateParams.companyAddress ||
        "Shop No 17, Bhoomi Classic CHS, Opp Inorbit Mall, next to SBI, Malad West, Mumbai, Maharashtra 400064.",
      "[TERMS_CONDITIONS]": `${frontendUrl}/terms`,
      "[PRIVACY_POLICY_LINK]": `${frontendUrl}/PrivacyPolicy`,
      "[SUPPORT]": `${frontendUrl}/support`,
      "[SHIPPING_POLICY]": `${frontendUrl}/shippingPolicy`,
    };

    // Perform replacements
    for (const [key, value] of Object.entries(replacements)) {
      const regex = new RegExp(escapeRegExp(key), "g");
      template = template.replace(regex, value);
    }

    return template;
  } catch (error) {
    console.error("Error generating email template:", error);
    throw error;
  }
};

// Helper function to escape regex special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
