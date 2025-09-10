export enum EmailTemplate {
  VERIFICATION = 'verification',
  PASSWORD_RESET = 'password_reset',
  WELCOME = 'welcome',
  LINK_EXPIRATION = 'link_expiration',
  WEEKLY_REPORT = 'weekly_report',
}

interface EmailContent {
  html: string;
  text: string;
}

const baseStyles = `
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: white; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white !important; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #718096; font-size: 14px; }
    .link-box { background: #f7fafc; padding: 15px; border-radius: 6px; margin: 15px 0; }
    h1 { margin: 0; }
    h2 { color: #2d3748; }
    p { color: #4a5568; line-height: 1.6; }
  </style>
`;

const baseLayout = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${baseStyles}
</head>
<body>
  <div class="container">
    ${content}
    <div class="footer">
      <p>© ${new Date().getFullYear()} WordsTo.Link. All rights reserved.</p>
      <p>Short URLs that make sense.</p>
    </div>
  </div>
</body>
</html>
`;

const templates: Record<EmailTemplate, (data: any) => EmailContent> = {
  [EmailTemplate.VERIFICATION]: (data) => {
    const html = baseLayout(`
      <div class="header">
        <h1>Verify Your Email</h1>
      </div>
      <div class="content">
        <h2>Welcome to WordsTo.Link!</h2>
        <p>Thanks for signing up. Please verify your email address to get started.</p>
        <p>Click the button below to verify your email:</p>
        <center>
          <a href="${data.verificationUrl}" class="button">Verify Email</a>
        </center>
        <p>Or copy and paste this link into your browser:</p>
        <div class="link-box">
          <code>${data.verificationUrl}</code>
        </div>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `);

    const text = `
Welcome to WordsTo.Link!

Please verify your email address to get started.

Click this link to verify your email:
${data.verificationUrl}

This link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.

© ${new Date().getFullYear()} WordsTo.Link
    `.trim();

    return { html, text };
  },

  [EmailTemplate.PASSWORD_RESET]: (data) => {
    const html = baseLayout(`
      <div class="header">
        <h1>Password Reset</h1>
      </div>
      <div class="content">
        <h2>Reset Your Password</h2>
        <p>We received a request to reset your password for ${data.email}.</p>
        <p>Click the button below to create a new password:</p>
        <center>
          <a href="${data.resetUrl}" class="button">Reset Password</a>
        </center>
        <p>Or copy and paste this link into your browser:</p>
        <div class="link-box">
          <code>${data.resetUrl}</code>
        </div>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, you can safely ignore this email.</p>
      </div>
    `);

    const text = `
Password Reset Request

We received a request to reset your password for ${data.email}.

Click this link to reset your password:
${data.resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email.

© ${new Date().getFullYear()} WordsTo.Link
    `.trim();

    return { html, text };
  },

  [EmailTemplate.WELCOME]: (data) => {
    const html = baseLayout(`
      <div class="header">
        <h1>Welcome to WordsTo.Link!</h1>
      </div>
      <div class="content">
        <h2>Hi ${data.name}! 👋</h2>
        <p>Your account is all set up and ready to go. Your unique identifier is:</p>
        <div class="link-box">
          <strong>wordsto.link/${data.identifier}/*</strong>
        </div>
        <p>Here's what you can do now:</p>
        <ul>
          <li><strong>Create your first short URL</strong> - Start with something simple like /${data.identifier}/portfolio</li>
          <li><strong>Track performance</strong> - See real-time analytics for all your links</li>
          <li><strong>Manage your links</strong> - Edit, delete, or set expiration dates</li>
          <li><strong>Use the API</strong> - Integrate with your apps and workflows</li>
        </ul>
        <center>
          <a href="${data.dashboardUrl}" class="button">Go to Dashboard</a>
        </center>
        <p>Need help? Check out our documentation or reply to this email.</p>
      </div>
    `);

    const text = `
Welcome to WordsTo.Link!

Hi ${data.name}!

Your account is all set up and ready to go.
Your unique identifier is: wordsto.link/${data.identifier}/*

Here's what you can do now:
- Create your first short URL
- Track performance with real-time analytics
- Manage your links
- Use the API for integrations

Go to your dashboard: ${data.dashboardUrl}

Need help? Reply to this email.

© ${new Date().getFullYear()} WordsTo.Link
    `.trim();

    return { html, text };
  },

  [EmailTemplate.LINK_EXPIRATION]: (data) => {
    const html = baseLayout(`
      <div class="header">
        <h1>Link Expiring Soon</h1>
      </div>
      <div class="content">
        <h2>Your Link is Expiring</h2>
        <p>One of your shortened URLs will expire soon:</p>
        <div class="link-box">
          <p><strong>Short URL:</strong> ${data.shortUrl}</p>
          <p><strong>Original URL:</strong> ${data.originalUrl}</p>
          <p><strong>Expires:</strong> ${new Date(data.expiresAt).toLocaleDateString()}</p>
        </div>
        <p>If you want to keep this link active, please log in to your dashboard and extend the expiration date.</p>
        <center>
          <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Go to Dashboard</a>
        </center>
      </div>
    `);

    const text = `
Link Expiring Soon

Your shortened URL will expire soon:

Short URL: ${data.shortUrl}
Original URL: ${data.originalUrl}
Expires: ${new Date(data.expiresAt).toLocaleDateString()}

Log in to your dashboard to extend the expiration date.

© ${new Date().getFullYear()} WordsTo.Link
    `.trim();

    return { html, text };
  },

  [EmailTemplate.WEEKLY_REPORT]: (data) => {
    const topLinksHtml = data.topLinks
      .map((link: any) => `<li>${link.url} - ${link.clicks} clicks</li>`)
      .join('');

    const html = baseLayout(`
      <div class="header">
        <h1>Weekly Report</h1>
      </div>
      <div class="content">
        <h2>Your Weekly Performance</h2>
        <p>Here's how your links performed ${data.period}:</p>
        <div class="link-box">
          <p><strong>Total Clicks:</strong> ${data.totalClicks}</p>
          <p><strong>Active Links:</strong> ${data.totalLinks}</p>
        </div>
        <h3>Top Performing Links:</h3>
        <ul>
          ${topLinksHtml}
        </ul>
        <center>
          <a href="${process.env.FRONTEND_URL}/analytics" class="button">View Full Analytics</a>
        </center>
      </div>
    `);

    const topLinksText = data.topLinks
      .map((link: any) => `- ${link.url}: ${link.clicks} clicks`)
      .join('\n');

    const text = `
Weekly Report

Your Weekly Performance (${data.period}):

Total Clicks: ${data.totalClicks}
Active Links: ${data.totalLinks}

Top Performing Links:
${topLinksText}

View full analytics: ${process.env.FRONTEND_URL}/analytics

© ${new Date().getFullYear()} WordsTo.Link
    `.trim();

    return { html, text };
  },
};

export function getEmailTemplate(template: EmailTemplate, data: any): EmailContent {
  const templateFn = templates[template];
  if (!templateFn) {
    throw new Error(`Email template ${template} not found`);
  }
  return templateFn(data);
}