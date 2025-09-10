# Resend Email Setup Guide for WordsTo.Link

## Quick Setup Steps

### 1. Create Resend Account
1. Go to https://resend.com/signup
2. Sign up with your email
3. Verify your email address

### 2. Get Your API Key
1. Once logged in, go to: https://resend.com/api-keys
2. Click "Create API Key"
3. Give it a name like "WordsTo.Link Production"
4. Copy the API key (starts with `re_`)

### 3. Add to Your .env File

```bash
# Add these lines to your .env file
RESEND_API_KEY=re_YOUR_API_KEY_HERE
EMAIL_FROM=WordsTo.Link <noreply@wordsto.link>
FRONTEND_URL=http://localhost:3001

# For testing in development
FORCE_EMAIL_SEND=false  # Set to true to send real emails
```

### 4. Verify Your Domain (For Production)

#### Add Domain to Resend:
1. Go to: https://resend.com/domains
2. Click "Add Domain"
3. Enter: `wordsto.link`
4. Click "Add"

#### Add DNS Records:
You'll need to add these DNS records to your domain provider:

**SPF Record:**
- Type: TXT
- Name: @ (or leave blank)
- Value: `v=spf1 include:amazonses.com ~all`

**DKIM Records:** (Resend will show you 3 CNAME records)
- Copy each CNAME record exactly as shown

**Example DNS Records:**
```
Type    Name                                    Value
TXT     @                                      v=spf1 include:amazonses.com ~all
CNAME   resend._domainkey                      resend.domainkey.u4i3.p.resend.com
CNAME   resend2._domainkey                     resend.domainkey.u4i3.p.resend.com
CNAME   resend3._domainkey                     resend.domainkey.u4i3.p.resend.com
```

### 5. Test Email Sending

Create a test file to verify everything works:

```javascript
// test-email.js
const { Resend } = require('resend');

const resend = new Resend('re_YOUR_API_KEY_HERE');

async function testEmail() {
  try {
    const data = await resend.emails.send({
      from: 'WordsTo.Link <noreply@wordsto.link>',
      to: ['your-email@example.com'],
      subject: 'Test Email from WordsTo.Link',
      html: '<h1>Hello World</h1><p>This is a test email from your WordsTo.Link setup!</p>',
      text: 'Hello World - This is a test email from your WordsTo.Link setup!'
    });
    
    console.log('Email sent successfully:', data);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

testEmail();
```

Run with: `node test-email.js`

### 6. Development Testing

During development, emails will be logged to console by default:

```bash
# Start your backend
npm run dev:backend

# You'll see emails in the console like:
============================================================
📧 EMAIL (Development Mode)
============================================================
To: user@example.com
Subject: Verify your WordsTo.Link account
...
```

To send real emails in development:
```bash
# In your .env file
FORCE_EMAIL_SEND=true
```

### 7. Production Checklist

- [ ] Resend account created
- [ ] API key added to .env
- [ ] Domain added to Resend
- [ ] DNS records configured
- [ ] Domain verified in Resend (can take up to 48 hours)
- [ ] Test email sent successfully
- [ ] EMAIL_FROM updated to use your domain
- [ ] FRONTEND_URL updated to production URL

### 8. Email Templates Available

Your app can send these emails:
- **Verification Email**: When users sign up
- **Password Reset**: When users forget password
- **Welcome Email**: After email verification
- **Link Expiration**: Before links expire
- **Weekly Reports**: Analytics summaries

### 9. Monitoring

Check your email stats at: https://resend.com/emails

You can see:
- Delivered emails
- Opened emails
- Bounced emails
- Email content preview

### 10. Free Tier Limits

Resend Free Tier includes:
- 3,000 emails per month
- 100 emails per day
- 1 custom domain
- Full API access
- Email analytics

### Troubleshooting

**Email not sending?**
1. Check API key is correct
2. Verify domain if using custom domain
3. Check console for error messages
4. Ensure FORCE_EMAIL_SEND=true if in development

**Domain verification pending?**
- DNS propagation can take up to 48 hours
- Use `noreply@resend.dev` for testing while waiting

**Rate limited?**
- Free tier: 100 emails/day
- Upgrade to paid plan for higher limits

### Support

- Resend Docs: https://resend.com/docs
- Resend Status: https://status.resend.com
- Your email service code: `/src/services/email/email.service.ts`